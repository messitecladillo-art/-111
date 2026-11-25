from shared.errors import ProviderFailure
import asyncio
import json
import math
import os
import re
from pathlib import Path
from typing import Any

from infrastructure.llm import AgentModelTurn, ChatCompletionClient, Completion, ModelToolCall
from multi_agent.agents.survey_agent.services.proposals import prompt
from multi_agent.statistical_isa import _fmt_p

_INFERENTIAL_OPERATORS = frozenset({
    "test_group_difference",
    "fit_linear_regression",
    "fit_logistic_regression",
    "test_mediation_effect",
    "estimate_staggered_did_att",
    "estimate_rdd_sharp_local",
    "run_psm_balance_att",
    "estimate_iv_2sls",
    "run_ab_sequential_test",
    "estimate_kaplan_meier_logrank",
    "run_meta_random_effects",
})

_SPECIAL_BOUNDARY_WARNINGS = (
    "TWFE_NEGATIVE_WEIGHT_DISTORTION",
    "WEAK_INSTRUMENT_F_LT_10",
    "AB_SRM_DETECTED_P_LT_001",
    "AB_GUARDRAIL_DEGRADATION",
    "SURVIVAL_HEAVY_CENSORING_GT_50PCT",
    "META_HIGH_HETEROGENEITY_I2_GE_50",
    "META_EGGER_BIAS_P_LT_010",
    "RDD_DENSITY_MANIPULATION_WARNING",
    "PSM_RESIDUAL_IMBALANCE_SMD_GE_01",
)
_SPECIAL_BOUNDARY_SET = frozenset(_SPECIAL_BOUNDARY_WARNINGS)
_AUX_P_LABEL_MARKERS = ("bp", "异方差", "srm", "egger", "hausman", "内生性", "游程")


def _is_sig_p(value: Any) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    num = float(value)
    return math.isfinite(num) and 0.0 <= num < 0.05


def summarize_receipts_honesty(receipts: list[dict[str, Any]], cleaned_n: int) -> dict[str, Any]:
    """Summarize verified statistical corrections, boundary warnings, and significance honestly."""
    has_ridge = False
    has_pen_logit = False
    has_scale_purified = False
    has_nonparam_fallback = False
    has_significant_effect = False
    special_warnings: list[str] = []
    seen_warnings: set[str] = set()

    for rec in receipts or ():
        if not isinstance(rec, dict):
            continue
        diags = [str(d) for d in (rec.get("diagnostics") or []) if d is not None]
        if any(d.startswith("RIDGE_STABILIZED:") for d in diags):
            has_ridge = True
        if any(d.startswith("PENALIZED_LOGIT_L2:") for d in diags):
            has_pen_logit = True
        if any(d.startswith("SCALE_PURIFIED_DROPPED:") for d in diags):
            has_scale_purified = True
        if any(d.startswith("NONPARAMETRIC_AUTO_FALLBACK:") for d in diags):
            has_nonparam_fallback = True
        for diag in diags:
            if diag in _SPECIAL_BOUNDARY_SET and diag not in seen_warnings:
                seen_warnings.add(diag)
                special_warnings.append(diag)

        op_name = rec.get("operator")
        if op_name not in _INFERENTIAL_OPERATORS:
            continue

        for p_key in ("p", "p_value", "overall_p", "logrank_p", "indirect_p", "p_iv", "p_re"):
            if _is_sig_p(rec.get(p_key)):
                has_significant_effect = True

        coefs = rec.get("coefficients")
        if isinstance(coefs, dict):
            for coef_info in coefs.values():
                if isinstance(coef_info, dict) and _is_sig_p(coef_info.get("p")):
                    has_significant_effect = True

        for metric in rec.get("metrics") or ():
            if not isinstance(metric, dict):
                continue
            raw_lbl = str(metric.get("label") or "").strip().lower()
            if not raw_lbl or any(marker in raw_lbl for marker in _AUX_P_LABEL_MARKERS):
                continue
            if (
                raw_lbl in ("p", "p值", "p 值")
                or raw_lbl.endswith("p 值")
                or raw_lbl.endswith("p值")
                or raw_lbl.endswith(" p")
            ):
                if _is_sig_p(metric.get("value")):
                    has_significant_effect = True

        if op_name in ("fit_linear_regression", "fit_logistic_regression"):
            tbl = rec.get("table")
            if isinstance(tbl, dict):
                headers = tbl.get("headers") or []
                p_col_idx = next(
                    (idx for idx, h in enumerate(headers) if str(h).strip().lower() in ("p", "p值", "p 值")),
                    None,
                )
                if p_col_idx is not None:
                    for row in tbl.get("rows") or ():
                        if not isinstance(row, list) or len(row) <= p_col_idx:
                            continue
                        first_cell = str(row[0] or "").strip().lower()
                        if first_cell.startswith("截距") or first_cell.startswith("intercept"):
                            continue
                        if _is_sig_p(row[p_col_idx]):
                            has_significant_effect = True

        if op_name == "test_mediation_effect":
            if any(d.startswith("MEDIATION_TYPE:") and d != "MEDIATION_TYPE:NONE" for d in diags):
                has_significant_effect = True

    n_clean = int(cleaned_n) if isinstance(cleaned_n, int) and not isinstance(cleaned_n, bool) else 0
    is_small_sample_null = n_clean < 30 and not has_significant_effect and not special_warnings
    return {
        "cleaned_n": n_clean,
        "has_ridge": has_ridge,
        "has_pen_logit": has_pen_logit,
        "has_scale_purified": has_scale_purified,
        "has_nonparam_fallback": has_nonparam_fallback,
        "special_warnings": special_warnings,
        "has_significant_effect": has_significant_effect,
        "is_small_sample_null": is_small_sample_null,
    }

class LiveProvider(ChatCompletionClient):
    async def workflow_step(self, config, key, messages, limit=196608):
        """One consented workflow call; outputs still require role/tool validation."""
        return await self.complete_messages(config, key, messages, limit)

    async def agent_step(
        self,
        config,
        key,
        messages,
        *,
        tools=None,
        tool_choice="auto",
        limit=196608,
        timeout=45,
    ) -> AgentModelTurn:
        """One consented multi-turn native tool-calling step."""
        return await self.complete_agent_turn(
            config,
            key,
            messages,
            tools=tools,
            tool_choice=tool_choice,
            limit=limit,
            timeout=timeout,
        )

    async def topic_agent(self, config, key, message, selected):
        return await self.complete(config, key, message, 65536)

    async def topic(self, config, key, message, selected):
        return await self.complete(config, key, message, 65536)

    async def __call__(self, config, key, brief):
        return await self.complete(config, key, prompt(brief), 32768)

    async def answer(self, config, key, message, spec):
        """One simulated-respondent turn for a 硅基样本 run; `spec` is for fixtures only."""
        limit = 196608 if spec.get("mode") == "interview_pretest" else 65536
        return await self.complete(config, key, message, limit)

    async def agent_chat(self, config, key, message):
        """One turn of the 证见 Agent conversation; the prompt itself stays within agent_chat.PROMPT_BYTES."""
        return await self.complete(config, key, message, 65536)

    async def section_draft(self, config, key, message):
        """One report section drafted by the 证见 Agent; the prompt itself stays within section_draft.PROMPT_BYTES."""
        # Bounded by full_report_section.CALL_TIMEOUT_SECONDS (90 s) and the 100 s web upstream.
        return await self.complete(config, key, message, 131072, timeout=85)


_AUTHORED_ENVELOPE = re.compile(r'"nodeId":"([a-z.]{3,40})","purpose":"(draft|revision|blueprint|storyline)"')


class AuthoredProvider(LiveProvider):
    """Local-test only: full-workflow outputs served from files written offline by the coding agent.

    Every received prompt is captured next to the authored files so the coding agent authors against the
    exact materials this run computed. Missing stage files fall back to LiveProvider (for chat/topics/
    proposals/pretest) or fail closed with provider_rejected (for section_draft).
    """

    def __init__(self, root):
        self.root = Path(root).resolve()

    def _path(self, *parts):
        target = self.root.joinpath(*parts).resolve()
        if not target.is_relative_to(self.root):
            raise ProviderFailure("provider_rejected")
        return target

    def _topic_dir(self, message):
        topics_root = self._path("topics")
        if not isinstance(message, str) or not topics_root.is_dir():
            return None
        for entry in sorted(topics_root.iterdir()):
            if not entry.is_dir():
                continue
            match_file = entry / "match.txt"
            if match_file.is_file():
                tokens = [t.strip() for t in match_file.read_text(encoding="utf-8").splitlines() if t.strip()]
                if tokens and any(tok in message for tok in tokens):
                    return entry
        return None

    async def _paced(self):
        try:
            delay = max(0.0, min(5.0, float(os.environ.get("EVIXLOCAL_AUTHORED_SLEEP", "1.5"))))
        except ValueError:
            delay = 1.5
        await asyncio.sleep(delay)

    def _completion(self, raw):
        completion = Completion(raw)
        completion.usage = None
        return completion

    def _capture_prompt(self, folder, filename, message):
        prompt_file = self._path("prompts", folder, filename)
        prompt_file.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(message, str):
            prompt_file.write_text(message, encoding="utf-8")

    def _adapt_topic_items(self, doc, selected):
        items = [row for row in (doc.get("items") or []) if isinstance(row, dict)]
        selected_list = [item for item in selected if isinstance(item, dict) and item.get("id")]
        if not selected_list or not items:
            return doc
        adapted = []
        used_item_idx = set()
        for idx, target in enumerate(selected_list):
            match_idx = next(
                (i for i, row in enumerate(items) if i not in used_item_idx and row.get("patternId") == target["id"]),
                next((i for i in range(len(items)) if i not in used_item_idx), idx % len(items)),
            )
            used_item_idx.add(match_idx)
            row = dict(items[match_idx])
            row["patternId"] = target["id"]
            allowed_srcs = list(target.get("sourceIds") or [])
            kept_srcs = [s for s in (row.get("sourceIds") or []) if s in allowed_srcs]
            if not kept_srcs and allowed_srcs:
                kept_srcs = allowed_srcs[:2]
            if kept_srcs:
                row["sourceIds"] = kept_srcs
            adapted.append(row)
        return {**doc, "items": adapted}

    async def section_draft(self, config, key, message):
        found = _AUTHORED_ENVELOPE.findall(message) if isinstance(message, str) else []
        if not found:
            raise ProviderFailure("provider_rejected")
        node, purpose = found[-1]  # The trusted envelope follows the (escaped) instructions.
        self._capture_prompt(purpose, node + ".txt", message)
        topic_dir = self._topic_dir(message)
        authored = (topic_dir / purpose / (node + ".json")) if topic_dir is not None else None
        if authored is None or not authored.is_file():
            authored = self._path(purpose, node + ".json")
        if not authored.is_file() and purpose == "revision":
            fallback = (topic_dir / "draft" / (node + ".json")) if topic_dir is not None else None
            authored = fallback if fallback is not None and fallback.is_file() else self._path("draft", node + ".json")
        if not authored.is_file():
            raise ProviderFailure("provider_rejected")
        text = authored.read_text(encoding="utf-8")
        if not text.strip() or len(text.encode("utf-8")) > 60000:
            raise ProviderFailure("invalid_response")
        await self._paced()  # Keeps the live canvas choreography readable; not a model latency claim.
        return self._completion(text)

    async def topic_agent(self, config, key, message, selected):
        self._capture_prompt("topic_agent", "latest.txt", message)
        topic_dir = self._topic_dir(message)
        authored = (topic_dir / "topic_agent" / "default.json") if topic_dir is not None else None
        if authored is None or not authored.is_file():
            authored = self._path("topic_agent", "default.json")
        if not authored.is_file():
            return await super().topic_agent(config, key, message, selected)
        doc = self._adapt_topic_items(json.loads(authored.read_text(encoding="utf-8")), selected)
        await self._paced()
        return self._completion(json.dumps(doc, ensure_ascii=False))

    async def topic(self, config, key, message, selected):
        self._capture_prompt("topic", "latest.txt", message)
        topic_dir = self._topic_dir(message)
        authored = (topic_dir / "topic" / "default.json") if topic_dir is not None else None
        if authored is None or not authored.is_file():
            authored = self._path("topic", "default.json")
        if not authored.is_file():
            return await super().topic(config, key, message, selected)
        doc = self._adapt_topic_items(json.loads(authored.read_text(encoding="utf-8")), selected)
        await self._paced()
        return self._completion(json.dumps(doc, ensure_ascii=False))

    async def __call__(self, config, key, brief):
        raw_prompt = prompt(brief)
        self._capture_prompt("proposals", "latest.txt", raw_prompt)
        topic_dir = self._topic_dir(raw_prompt)
        authored = (topic_dir / "proposals" / "default.json") if topic_dir is not None else None
        if authored is None or not authored.is_file():
            authored = self._path("proposals", "default.json")
        if not authored.is_file():
            return await super().__call__(config, key, brief)
        text = authored.read_text(encoding="utf-8")
        if not text.strip():
            raise ProviderFailure("invalid_response")
        await self._paced()
        return self._completion(text)

    async def agent_chat(self, config, key, message):
        self._capture_prompt("agent_chat", "latest.txt", message)
        authored = self._path("agent_chat", "routes.json")
        if not authored.is_file():
            return await super().agent_chat(config, key, message)
        routes = json.loads(authored.read_text(encoding="utf-8"))
        user_msg = ""
        if isinstance(message, str) and "资料JSON：" in message:
            try:
                user_msg = json.loads(message.split("资料JSON：", 1)[1]).get("message", "")
            except Exception:
                user_msg = ""
        chosen = routes.get("default")
        for rule in routes.get("rules", []):
            pat = rule.get("pattern", "")
            if pat and re.search(pat, user_msg):
                chosen = rule.get("response")
                break
        if not isinstance(chosen, dict):
            raise ProviderFailure("invalid_response")
        await self._paced()
        return self._completion(json.dumps(chosen, ensure_ascii=False))

    def _build_pretest_response(self, pack, stage, spec_input):
        if stage == "roster":
            candidates = list(spec_input.get("questions") or [])
            limit = int(spec_input.get("maxFocusQuestions") or 4)
            preferred = [q["id"] for q in candidates if any(k in q.get("text", "") for k in pack.get("focusKeywords", []))]
            picked = list(dict.fromkeys([*preferred, *[q["id"] for q in candidates]]))[:limit]
            return {"personas": pack["personas"][:3], "questionIds": picked}

        if stage in ("interview", "retest"):
            persona_id = (spec_input.get("persona") or {}).get("id", "p1")
            questions = list(spec_input.get("questions") or [])
            by_persona = (pack.get(stage) or {}).get(persona_id, {})
            default_rule = (pack.get(stage) or {}).get("default", {})
            answers = []
            for q in questions:
                qid = q["id"]
                rule = by_persona.get(qid) or by_persona.get(q.get("type", "")) or default_rule
                qtype = q.get("type", "")
                choices = q.get("choices") or []
                answer_text = rule.get("answer")
                if not answer_text:
                    if qtype == "likert":
                        lo, hi = q.get("min") or 1, q.get("max") or 5
                        mid = max(lo, min(hi, (lo + hi) // 2 + (1 if stage == "retest" else 0)))
                        answer_text = f"我会选 {mid} 分，整体结合近期实际接触感受来判断；题干中的时间与参照对象边界{'已清楚' if stage == 'retest' else '还需要再明确一下'}。"
                    elif qtype in ("single", "multi") and choices:
                        c0 = choices[0]
                        answer_text = f"按自身情况我会倾向“{c0.get('label', c0.get('code', '首项'))}”，前提是选项与实际体验口径一致。"
                    else:
                        answer_text = "从我近期接触该服务的实际体验来看，最希望先把核心流程与收费/规则说明交代清楚。"
                unclear_text = "" if stage == "retest" else rule.get("unclear", "")
                if stage == "interview" and not unclear_text and any(k in q.get("text", "") for k in pack.get("unclearKeywords", [])):
                    unclear_text = "题干中评价的时间范围与对比基准未明确界定。"
                    if "未明确界定" not in answer_text:
                        answer_text = f"{answer_text} 不过我不太确定具体指哪一段时间内的哪项体验。"
                answers.append({"questionId": qid, "answer": answer_text, "unclear": unclear_text})
            return {"answers": answers}

        if stage == "followup":
            turns = list(spec_input.get("turns") or [])
            target = next((t for t in turns if t.get("unclear")), turns[0])
            ans = target["answer"]
            quote = ans[: min(24, len(ans))]
            for m in ("不过我不太确定", "还需要再明确一下", "近期实际接触"):
                if m in ans:
                    idx = ans.index(m)
                    quote = ans[idx : min(len(ans), idx + 18)]
                    break
            return {
                "questionId": target["questionId"],
                "turnId": target["id"],
                "quote": quote,
                "prompt": "您刚才提到不太确定具体指哪一段时间或哪类情形，能说说当时是按什么范围在回忆吗？",
                "answer": "我主要是按最近一次亲身或陪同办理的经历来想的，如果题目能写明统计周期和适用对象，我就更容易直接选准。",
                "unclear": "希望题目明确给出评估的时间窗口和对应场景。",
            }

        if stage == "revise":
            questions = list(spec_input.get("questions") or [])
            transcripts = list(spec_input.get("transcripts") or [])
            revisions = []
            for q in questions:
                qid = q["id"]
                evidence = []
                for tr in transcripts:
                    pid = tr.get("personaId")
                    hit = next((t for t in tr.get("turns", []) if t.get("questionId") == qid and t.get("unclear")), None)
                    if not hit:
                        hit = next((t for t in tr.get("turns", []) if t.get("questionId") == qid), None)
                    if pid and hit and hit.get("answer"):
                        ans = hit["answer"]
                        quote = ans[: min(16, len(ans))]
                        evidence.append({"personaId": pid, "turnId": hit["id"], "quote": quote})
                if not evidence:
                    continue
                orig = q["text"].strip()
                if len(revisions) >= 2:
                    break
                if "过去30天" not in orig and "最近30天" not in orig:
                    revised = f"结合最近30天内的实际体验，{orig}" if not orig.endswith("？") else f"结合最近30天内的实际体验，{orig}"
                elif "您" not in orig:
                    revised = f"请问您对{orig}"
                else:
                    revised = orig.replace("满意吗", "整体满意程度如何") if "满意吗" in orig else f"{orig}（请按最近一次经历作答）"
                if revised != orig:
                    revisions.append({
                        "questionId": qid,
                        "revised": revised[:590],
                        "reason": "结合受访画像反馈补充评估时间口径与适用情境界定，消除回忆边界歧义。",
                        "evidence": evidence[:3],
                    })
            return {"revisions": revisions}
        raise ProviderFailure("provider_rejected")

    async def answer(self, config, key, message, spec):
        if isinstance(spec, dict) and spec.get("mode") == "interview_pretest":
            stage = spec.get("stage", "")
            self._capture_prompt("interview_pretest", f"{stage or 'stage'}.txt", message)
            authored = self._path("interview_pretest", "pack.json")
            if authored.is_file():
                pack = json.loads(authored.read_text(encoding="utf-8"))
                payload = self._build_pretest_response(pack, stage, spec.get("input") or {})
                await self._paced()
                return self._completion(json.dumps(payload, ensure_ascii=False))
        return await super().answer(config, key, message, spec)

    @staticmethod
    def _extract_tag_json(messages, tag):
        results = []
        open_tag = f"<{tag}>"
        close_tag = f"</{tag}>"
        for msg in messages or []:
            content = msg.get("content", "") if isinstance(msg, dict) else ""
            if open_tag in content and close_tag in content:
                body = content.split(open_tag, 1)[1].split(close_tag, 1)[0].strip()
                try:
                    results.append(json.loads(body))
                except Exception:
                    pass
        return results

    @staticmethod
    def _extract_observations(messages):
        observations = []
        failed_ops = set()
        called_ops = set()
        brief_diags = []
        for msg in messages or []:
            if not isinstance(msg, dict) or msg.get("role") != "user":
                continue
            content = str(msg.get("content") or "")
            if "<working-memory-brief>" in content and "</working-memory-brief>" in content:
                brief_body = content.split("<working-memory-brief>", 1)[1].split("</working-memory-brief>", 1)[0]
                for raw_line in brief_body.splitlines():
                    line = raw_line.strip()
                    if ":" not in line:
                        continue
                    head, val = line.split(":", 1)
                    head, val = head.strip(), val.strip()
                    if head.startswith(("已执行", "已完成")) and "快照" not in head and "消息" not in head:
                        if val and val != "无":
                            for part in val.split(","):
                                if part.strip():
                                    called_ops.add(part.strip())
                    elif head == "活跃诊断信号":
                        val = line.split(":", 1)[1].strip()
                        if val and val != "无":
                            for part in val.split(","):
                                if part.strip():
                                    brief_diags.append(part.strip())
        if brief_diags:
            observations.append({"diagnostics": brief_diags})
        for obs_pack in AuthoredProvider._extract_tag_json(messages, "observation-json"):
            for item in obs_pack.get("observations", []):
                tname = item.get("tool")
                if tname:
                    called_ops.add(tname)
                if item.get("status") == "ok" and isinstance(item.get("result"), dict):
                    observations.append(item["result"])
                elif item.get("status") == "error" and tname:
                    failed_ops.add(tname)
        for msg in messages or []:
            if not isinstance(msg, dict):
                continue
            if msg.get("role") == "assistant":
                for tc in msg.get("tool_calls") or []:
                    if isinstance(tc, dict) and tc.get("name"):
                        called_ops.add(tc["name"])
            elif msg.get("role") == "tool":
                tname = msg.get("name")
                if tname:
                    called_ops.add(tname)
                raw = msg.get("content", "")
                if isinstance(raw, str):
                    try:
                        parsed = json.loads(raw)
                    except Exception:
                        parsed = None
                    if isinstance(parsed, dict):
                        if parsed.get("status") == "error" or (
                            "error" in parsed and "snapshot_id" not in parsed and "operator" not in parsed
                        ):
                            if tname:
                                failed_ops.add(tname)
                        elif parsed.get("status") == "ok" and isinstance(parsed.get("result"), dict):
                            observations.append(parsed["result"])
                        else:
                            if "operator" not in parsed and tname:
                                parsed = {**parsed, "operator": tname}
                            observations.append(parsed)
        return observations, called_ops, failed_ops

    @staticmethod
    def _plan_variables_for_sandbox(variables):
        likerts = [v["variable"] for v in variables if isinstance(v, dict) and v.get("type") == "likert" and v.get("variable")]
        numbers = [v["variable"] for v in variables if isinstance(v, dict) and v.get("type") == "number" and v.get("variable")]
        singles = [v["variable"] for v in variables if isinstance(v, dict) and v.get("type") == "single" and v.get("variable")]
        scale_vars = [v for v in likerts if any(k in v.lower() for k in ("trust", "perc", "sat", "scale", "q_trap", "q", "item"))]
        if len(scale_vars) < 3:
            scale_vars = likerts[:5]
        # Separate outcome from scale items when possible
        outcome = next(
            (
                v
                for v in reversed(likerts + numbers)
                if any(k in v.lower() for k in ("adopt", "will", "sat", "intention", "pay", "outcome", "y_", "spend"))
                or v.lower().endswith("_y")
            ),
            None,
        )
        if outcome and outcome in scale_vars and len(scale_vars) > 3:
            scale_vars = [v for v in scale_vars if v != outcome]
        if outcome is None:
            outcome = (likerts[-1] if likerts else (numbers[-1] if numbers else None))
        binary_outcome = next((v for v in singles if any(k in v.lower() for k in ("renew", "buy", "adopt", "binary", "convert", "flag"))), None)
        moderators = [v for v in singles if v != binary_outcome][:3]
        if not moderators and singles:
            moderators = singles[:2]
        numeric_pool = [v for v in (numbers + likerts) if v != outcome]
        return {
            "scale_vars": scale_vars[:8],
            "outcome": outcome,
            "binary_outcome": binary_outcome,
            "moderators": moderators,
            "numeric_pool": numeric_pool,
        }

    @staticmethod
    def _detect_special_design(variables, goal_lower, observations):
        non_text = [v for v in variables if isinstance(v, dict) and v.get("type") != "text" and v.get("variable")]
        all_names = [v["variable"] for v in non_text]
        num_vars = [v["variable"] for v in non_text if v.get("type") in ("number", "likert")]
        likert_vars = [v["variable"] for v in non_text if v.get("type") == "likert"]
        single_vars = [v["variable"] for v in non_text if v.get("type") == "single"]

        def _match(patterns, pool=all_names, exclude=()):
            ex = set(exclude)
            for pat in patterns:
                for v in pool:
                    if v not in ex and v.lower() == pat:
                        return v
            for pat in patterns:
                for v in pool:
                    if v not in ex and pat in v.lower():
                        return v
            return None

        # 1. Kano paired attributes (*_func/*_dysfunc or *_pos/*_neg)
        by_lower = {v.lower(): v for v in num_vars}
        kano_pairs = []
        pos_suffixes = ("_functional", "_func", "_positive", "_pos")
        neg_suffixes = ("_dysfunctional", "_dysfunc", "_negative", "_neg")
        for v in num_vars:
            vl = v.lower()
            for ps, ns in zip(pos_suffixes, neg_suffixes):
                if vl.endswith(ps):
                    stem = vl[: -len(ps)]
                    if stem + ns in by_lower:
                        kano_pairs.append({
                            "feature": stem,
                            "functional_var": v,
                            "dysfunctional_var": by_lower[stem + ns],
                        })
                    break
        if kano_pairs:
            return {"mode": "kano", "pairs": kano_pairs[:20]}

        # 2. Random-effects Meta-analysis (study, effect, se)
        study_var = _match(("study", "paper", "trial", "author", "study_id"))
        effect_var = _match(("effect", "theta", "yi", "effect_size"), pool=num_vars, exclude=(study_var,))
        se_var = _match(("se", "sei", "std_err", "stderr"), pool=num_vars, exclude=(study_var, effect_var))
        if study_var and effect_var and se_var:
            return {"mode": "meta", "study_var": study_var, "effect_var": effect_var, "se_var": se_var}

        # 3. Kaplan-Meier Survival (duration/time + event/churned + group/arm)
        time_var = _match(("duration", "survival_time", "months", "days", "weeks", "tenure", "followup", "time"), pool=num_vars)
        event_var = _match(("event", "churned", "churn", "censored", "outcome_event", "failed"), pool=num_vars, exclude=(time_var,))
        group_var = _match(("arm", "group", "treatment", "cohort", "tier"), pool=all_names, exclude=(time_var, event_var))
        if group_var is None and single_vars:
            group_var = next((v for v in single_vars if v not in (time_var, event_var)), None)
        if time_var and event_var and group_var:
            return {"mode": "survival", "time_var": time_var, "event_var": event_var, "group_var": group_var}

        # 4. Staggered DID (cohort + period + outcome)
        cohort_var = _match(("cohort", "treat_cohort", "first_treat", "g_var"), pool=num_vars)
        did_time = _match(("period", "wave", "year", "quarter", "time_var", "time"), pool=num_vars, exclude=(cohort_var,))
        did_out = _match(("outcome", "y", "score", "adopt", "spend", "wage"), pool=num_vars, exclude=(cohort_var, did_time))
        if did_out is None:
            did_out = next((v for v in num_vars if v not in (cohort_var, did_time)), None)
        if cohort_var and did_time and did_out:
            return {"mode": "staggered_did", "outcome": did_out, "time_var": did_time, "cohort_var": cohort_var}

        # 5. Sharp RDD (running_var + cutoff)
        rdd_running = _match(("running_var", "running", "cutoff_score", "assignment"), pool=num_vars)
        if rdd_running is None and ("rdd" in goal_lower or "断点" in goal_lower or "cutoff" in goal_lower):
            rdd_running = _match(("score", "x"), pool=num_vars)
        if rdd_running:
            rdd_out = _match(("outcome", "grant_score", "y", "effect", "wage"), pool=num_vars, exclude=(rdd_running,))
            if rdd_out is None:
                rdd_out = next((v for v in num_vars if v != rdd_running), None)
            if rdd_out:
                cutoff = 0.0
                m = re.search(r"(?:cutoff|阈值|断点|门槛)\s*[:=：]?\s*(-?\d+(?:\.\d+)?)", goal_lower)
                if m:
                    cutoff = float(m.group(1))
                else:
                    dist_obs = next((o for o in reversed(observations) if o.get("operator") == "inspect_distribution"), None)
                    col = next((c for c in (dist_obs or {}).get("columns", []) if c.get("variable") == rdd_running), None)
                    if col and isinstance(col.get("median"), (int, float)):
                        med = float(col["median"])
                        sd = float(col.get("sd") or 1.0)
                        if abs(med) > 1.5 * max(sd, 1e-6):
                            cutoff = round(med, 2)
                return {"mode": "rdd", "outcome": rdd_out, "running_var": rdd_running, "cutoff": cutoff}

        # 6. IV-2SLS (instrument/iv_ + treatment + outcome)
        iv_var = next((v for v in num_vars if v.lower() in ("instrument", "z_iv") or v.lower().startswith("iv_")), None)
        if iv_var:
            iv_treat = _match(("treatment", "treat", "edu", "x_endog", "exposure"), pool=num_vars, exclude=(iv_var,))
            if iv_treat is None:
                iv_treat = next((v for v in num_vars if v != iv_var), None)
            iv_out = _match(("outcome", "wage", "y", "income", "adopt", "score"), pool=num_vars, exclude=(iv_var, iv_treat))
            if iv_out is None:
                iv_out = next((v for v in num_vars if v not in (iv_var, iv_treat)), None)
            iv_ctrls = [v for v in num_vars if v not in (iv_var, iv_treat, iv_out)][:6]
            if iv_treat and iv_out:
                return {"mode": "iv", "outcome": iv_out, "treatment": iv_treat, "instrument": iv_var, "controls": iv_ctrls}

        # 7. Sequential A/B Testing (variant)
        ab_treat = _match(("variant", "ab_group", "exp_arm"), pool=num_vars)
        if ab_treat is None and ("a/b" in goal_lower or "ab实验" in goal_lower or "序贯" in goal_lower):
            ab_treat = _match(("arm", "treat", "group"), pool=num_vars)
        if ab_treat:
            ab_out = _match(("conv", "outcome", "ctr", "y", "score"), pool=num_vars, exclude=(ab_treat,))
            if ab_out is None:
                ab_out = next((v for v in num_vars if v != ab_treat), None)
            ab_guard = _match(("guardrail", "latency", "error", "bounce"), pool=num_vars, exclude=(ab_treat, ab_out))
            if ab_out:
                return {"mode": "ab", "treatment": ab_treat, "outcome": ab_out, "guardrail": ab_guard}

        # 8. PSM Balance ATT (treat/treated + covariates)
        psm_treat = _match(("treated", "treatment", "treat", "policy_treat"), pool=num_vars)
        if psm_treat and (len(likert_vars) < 3 or "psm" in goal_lower or "倾向" in goal_lower):
            psm_out = _match(("outcome", "y", "sat", "spend", "score"), pool=num_vars, exclude=(psm_treat,))
            if psm_out is None:
                psm_out = next((v for v in num_vars if v != psm_treat), None)
            psm_covs = [v for v in num_vars if v not in (psm_treat, psm_out)][:8]
            if psm_out and psm_covs:
                return {"mode": "psm", "outcome": psm_out, "treatment": psm_treat, "covariates": psm_covs}

        # 9. Entropy TOPSIS
        topsis_ent = _match(("entity", "city", "county", "district", "province"), pool=all_names)
        if ("topsis" in goal_lower or "熵权" in goal_lower or "综合评价" in goal_lower) and (topsis_ent or single_vars):
            ent = topsis_ent or single_vars[0]
            inds = [v for v in num_vars if v != ent][:12]
            if len(inds) >= 2:
                neg_inds = [v for v in inds if any(k in v.lower() for k in ("cost", "wait", "risk", "loss", "latency", "price", "burden", "成本", "排队"))]
                return {"mode": "topsis", "entity_var": ent, "indicators": inds, "negative_indicators": neg_inds}
        if topsis_ent and len(likert_vars) < 3:
            inds = [v for v in num_vars if v != topsis_ent][:12]
            if len(inds) >= 2:
                neg_inds = [v for v in inds if any(k in v.lower() for k in ("cost", "wait", "risk", "loss", "latency", "price", "burden", "成本", "排队"))]
                return {"mode": "topsis", "entity_var": topsis_ent, "indicators": inds, "negative_indicators": neg_inds}

        # 10. Conformal-focused dataset (no likert scale >=3)
        if ("conformal" in goal_lower or "预测区间" in goal_lower or "预测带" in goal_lower) and len(likert_vars) < 3 and len(num_vars) >= 2:
            c_out = _match(("outcome", "y", "target", "score"), pool=num_vars) or num_vars[0]
            c_preds = [v for v in num_vars if v != c_out][:8]
            if c_preds:
                return {"mode": "conformal", "outcome": c_out, "predictors": c_preds}

        return None

    @staticmethod
    def _pick_major_pivot(observations):
        diag_map = [
            ("SUBGROUP_SIGN_REVERSAL:", "hyp-h1", True, "claim-simpson-reversal", "辛普森悖论子群方向反转修正"),
            ("TWFE_NEGATIVE_WEIGHT_DISTORTION", "hyp-h1", False, "claim-staggered-did", "交错 DID 替代静态 TWFE 负权重偏误"),
            ("RDD_DENSITY_MANIPULATION_WARNING", "hyp-h1", False, "claim-rdd-density", "断点密度操纵稳健边界标注"),
            ("KANO_HIGH_REVERSE_OR_QUESTIONABLE", "construct-scale", False, "claim-kano-rq", "Kano 高反向/可疑作答比例预警"),
            ("AB_SRM_DETECTED_P_LT_001", "hyp-h1", False, "claim-ab-srm", "A/B 分流比例失衡 (SRM) 熔断警示"),
            ("AB_GUARDRAIL_DEGRADATION", "hyp-h1", False, "claim-ab-guardrail", "A/B 实验安全护栏劣化熔断"),
            ("SURVIVAL_HEAVY_CENSORING_GT_50PCT", "hyp-h1", False, "claim-survival-rmst", "生存重度右删失改用 RMST 度量"),
            ("META_HIGH_HETEROGENEITY_I2_GE_50", "hyp-h1", False, "claim-meta-re", "Meta 高度异质性采用随机效应保守合并"),
            ("WEAK_INSTRUMENT_F_LT_10", "hyp-h1", False, "claim-weak-iv", "弱工具变量第一阶段 F<10 偏误边界提示"),
            ("PSM_RESIDUAL_IMBALANCE_SMD_GE_01", "hyp-h1", False, "claim-psm-balance", "PSM 残余协变量失衡边界提示"),
            ("TOPSIS_LOW_DISPERSION_INDICATOR", "construct-scale", False, "claim-topsis-disp", "TOPSIS 低区分度指标权重下调"),
            ("CONFORMAL_WIDE_INTERVAL_HIGH_UNCERTAINTY", "hyp-h2", False, "claim-conformal-wide", "Split Conformal 高不确定性拒识带预警"),
            ("COMMON_METHOD_BIAS_RISK_GE_40PCT", "construct-scale", False, "claim-cmb-risk", "Harman 共同方法偏差风险警示"),
            ("RIDGE_STABILIZED:", "hyp-h2", False, "claim-ridge-stabilized", "高 VIF 共线性切换 Ridge 收缩估计"),
            ("PENALIZED_LOGIT_L2:", "hyp-h2", False, "claim-logit-l2", "准完全分离切换 L2 惩罚 Logistic"),
            ("SCALE_PURIFIED_DROPPED:", "construct-scale", False, "claim-purified-scale", "量表异常 CITC 题项净化重构"),
        ]
        for prefix, old_id, refute, node_id, label in diag_map:
            for obs in reversed(observations):
                snap_id = obs.get("snapshot_id")
                if not snap_id:
                    continue
                diags = obs.get("diagnostics") or []
                if any(str(d).startswith(prefix) for d in diags):
                    return {
                        "action": "record_pivot",
                        "node_id": node_id,
                        "kind": "claim",
                        "label": label,
                        "summary": str(obs.get("summary") or label)[:300],
                        "old_node_id": old_id,
                        "evidence_snapshot_id": str(snap_id),
                        "refute_old": refute,
                    }
        return None

    def _authored_data_react_step(self, messages, *, tools=None, tool_choice="auto"):
        contexts = self._extract_tag_json(messages, "sandbox-context")
        ctx = contexts[-1] if contexts else {}
        variables = ctx.get("variables") or []
        goal = str(ctx.get("goal") or "")
        dataset_title = str(ctx.get("datasetTitle") or "")
        steering_hints = " ".join(
            str(m.get("content") or "")
            for m in (messages or [])
            if isinstance(m, dict)
            and m.get("role") == "user"
            and any(tag in str(m.get("content") or "") for tag in ("PI 人工审阅与纠偏指令", "独立对抗审稿 Agent 返回 revise"))
        )
        goal_lower = (goal + " " + dataset_title + " " + steering_hints).lower()
        avail_tools = {t["name"] for t in tools if isinstance(t, dict) and t.get("name")} if tools else set()

        observations, called_ops, _failed_ops = self._extract_observations(messages)
        seen_ops = [obs.get("operator") for obs in observations if obs.get("operator")]
        all_diags = [d for obs in observations for d in (obs.get("diagnostics") or [])]

        def _finish(thought_text, extra_notes=()):
            snap_ids = [obs["snapshot_id"] for obs in observations if obs.get("snapshot_id")]
            clean_obs = next((obs for obs in observations if obs.get("operator") == "apply_cleaning_pipeline"), None)
            n_candidates = [obs["n_effective"] for obs in observations if isinstance(obs.get("n_effective"), int)]
            clean_n = clean_obs["n_effective"] if clean_obs else (n_candidates[-1] if n_candidates else 0)
            parts = [f"完成 {len(observations)} 项统计分析（有效样本 n={clean_n}，产出 {len(snap_ids)} 项统计结果）。", *extra_notes]
            return {
                "thought": thought_text,
                "final": {
                    "summary": "".join(parts)[:1800],
                    "snapshot_ids": snap_ids,
                },
            }

        if tool_choice == "none":
            return _finish("已完成本轮核心数据分析，基于已有统计结果形成研究结论。")

        special = self._detect_special_design(variables, goal_lower, observations)
        if special is not None:
            mode = special["mode"]
            if "inspect_distribution" not in called_ops:
                return {
                    "thought": f"先审计全量非文本变量分布与缺失特征，识别适用于 {mode.upper()} 设计的核心输入字段。",
                    "tool_calls": [{"name": "inspect_distribution", "args": {}}],
                }
            op_by_mode = {
                "kano": ("run_kano_better_worse", {"pairs": special.get("pairs"), "scale_max": 5}, "按配对正向/反向变量执行 Kano 需求归类与 Better-Worse 优先级计算。"),
                "meta": ("run_meta_random_effects", {"study_var": special.get("study_var"), "effect_var": special.get("effect_var"), "se_var": special.get("se_var")}, "执行 DerSimonian-Laird 随机效应 Meta 合并与 Egger 发表偏倚检验。"),
                "survival": ("estimate_kaplan_meier_logrank", {"time_var": special.get("time_var"), "event_var": special.get("event_var"), "group_var": special.get("group_var")}, "执行 Kaplan-Meier 生存曲线、RMST 均差与 Mantel-Haenszel Log-Rank 检验。"),
                "staggered_did": ("estimate_staggered_did_att", {"outcome": special.get("outcome"), "time_var": special.get("time_var"), "cohort_var": special.get("cohort_var"), "never_treated_value": 0.0}, "执行 Callaway-Sant'Anna 交错 DID 动态 ATT(g,t) 与静态 TWFE 负权重检验。"),
                "rdd": ("estimate_rdd_sharp_local", {"outcome": special.get("outcome"), "running_var": special.get("running_var"), "cutoff": special.get("cutoff", 0.0)}, "在断点阈值附近拟合三角核局部线性回归并执行多带宽敏感性与密度操纵检验。"),
                "iv": ("estimate_iv_2sls", {"outcome": special.get("outcome"), "treatment": special.get("treatment"), "instrument": special.get("instrument"), "controls": special.get("controls")}, "估计 IV-2SLS 局部因果效应 β_IV、第一阶段弱工具 F 与 Wu-Hausman 内生性检验。"),
                "ab": ("run_ab_sequential_test", {"treatment": special.get("treatment"), "outcome": special.get("outcome"), "guardrail": special.get("guardrail")}, "执行序贯 A/B 实验 SRM 分流检验、OBF 序贯显著性与安全护栏监控。"),
                "psm": ("run_psm_balance_att", {"outcome": special.get("outcome"), "treatment": special.get("treatment"), "covariates": special.get("covariates"), "caliper": 0.5}, "执行 1:1 倾向得分卡钳匹配并检验协变量匹配前后 |SMD| 平衡性。"),
                "topsis": ("compute_entropy_topsis_rank", {"entity_var": special.get("entity_var"), "indicators": special.get("indicators"), "negative_indicators": special.get("negative_indicators")}, "执行信息熵赋权 TOPSIS 多指标综合评价与贴近度排名。"),
            }
            if mode in op_by_mode:
                op_name, op_args, thought_txt = op_by_mode[mode]
                if op_name not in called_ops:
                    clean_args = {k: v for k, v in op_args.items() if v is not None}
                    return {"thought": thought_txt, "tool_calls": [{"name": op_name, "args": clean_args}]}
            elif mode == "conformal":
                if "fit_linear_regression" not in called_ops:
                    return {
                        "thought": "先拟合基准线性回归，并同步校准分布自由 Split Conformal 预测区间半宽 q̂。",
                        "tool_calls": [
                            {"name": "fit_linear_regression", "args": {"outcome": special["outcome"], "predictors": special["predictors"], "ridge_lambda": 0.0}},
                            {"name": "compute_conformal_prediction_band", "args": {"outcome": special["outcome"], "predictors": special["predictors"], "alpha": 0.1, "calibration_ratio": 0.35}},
                        ],
                    }

            if "mutate_epistemic_graph" in avail_tools and "mutate_epistemic_graph" not in called_ops:
                pivot_args = self._pick_major_pivot(observations)
                if pivot_args:
                    return {
                        "thought": "检测到关键统计诊断转向信号，将实证核验结果同步更新至研究结论链路。",
                        "tool_calls": [{"name": "mutate_epistemic_graph", "args": pivot_args}],
                    }
            notes = [str(obs.get("summary") or "") for obs in observations if obs.get("operator") != "inspect_distribution"]
            return _finish(f"已完成 {mode.upper()} 专项统计分析与结果一致性核验。", notes)

        plan = self._plan_variables_for_sandbox(variables)

        # Step 1: Distribution inspection & cleaning
        if "inspect_distribution" not in called_ops:
            return {
                "thought": "先审计全量变量分布、偏度与缺失情况，并同步执行规律作答（直选零方差）及有效应答率清洗。",
                "tool_calls": [
                    {"name": "inspect_distribution", "args": {}},
                    {"name": "apply_cleaning_pipeline", "args": {"min_valid_ratio": 0.70, "drop_straightliners": True, "min_likert_for_straightline": 4}},
                ],
            }

        # Step 2: Scale reliability & KMO
        scale_vars = plan["scale_vars"]
        if len(scale_vars) >= 3 and "purify_scale_reliability" not in called_ops:
            return {
                "thought": "清洗后样本已锁定，先对核心测量量表做初始 Cronbach's α 与 CITC 体检，同时评估 KMO/Bartlett 因子适切性。",
                "tool_calls": [
                    {"name": "purify_scale_reliability", "args": {"construct_name": "service_perception", "variables": scale_vars, "drop_negative_or_low_citc": False, "citc_threshold": 0.30}},
                    {"name": "factor_suitability_kmo", "args": {"variables": scale_vars}},
                ],
            }

        # Step 3: Autonomous Pivot #1 — Heal toxic/negative CITC scale items if detected
        has_bad_citc = any(d.startswith(("NEGATIVE_CITC_ITEM:", "LOW_CITC_ITEM:", "LOW_RELIABILITY_ALPHA")) for d in all_diags)
        already_purified = any(d.startswith("SCALE_PURIFIED_DROPPED:") for d in all_diags)
        if len(scale_vars) >= 3 and has_bad_citc and not already_purified:
            bad_names = [d.split(":", 1)[1] for d in all_diags if d.startswith(("NEGATIVE_CITC_ITEM:", "LOW_CITC_ITEM:"))]
            return {
                "thought": f"统计诊断检测到量表信度偏低或反向及低 CITC 异常题项（{', '.join(bad_names) or 'α<0.70'}），自动执行二次量表净化并重构综合指标。",
                "tool_calls": [
                    {"name": "purify_scale_reliability", "args": {"construct_name": "service_perception", "variables": scale_vars, "drop_negative_or_low_citc": True, "citc_threshold": 0.30}},
                ],
            }

        # Optional CMB & Pairwise Correlation branch when requested or when no scale exists
        wants_cmb_corr = any(k in goal_lower for k in ("cmb", "harman", "共同方法偏差", "游程", "相关矩阵", "correlation", "spearman", "pearson"))
        all_num = [v["variable"] for v in variables if isinstance(v, dict) and v.get("type") in ("number", "likert") and v.get("variable")]
        if wants_cmb_corr and len(all_num) >= 3 and "check_common_method_bias" not in called_ops:
            cmb_calls = [{"name": "check_common_method_bias", "args": {"variables": all_num[:12]}}]
            if "compute_correlation_matrix" not in called_ops:
                cmb_calls.append({"name": "compute_correlation_matrix", "args": {"variables": all_num[:8], "method": "spearman"}})
            return {
                "thought": "根据目标与量表特征执行 Harman 单因子共同方法偏差检验、游程随机性及 Spearman 相关矩阵诊断。",
                "tool_calls": cmb_calls,
            }

        # Determine usable predictors after purification
        purify_obs = [obs for obs in observations if obs.get("operator") == "purify_scale_reliability"]
        latest_purify = purify_obs[-1] if purify_obs else None
        construct_var = latest_purify.get("construct_variable") if latest_purify else None
        dropped_set = set(latest_purify.get("dropped_items") or []) if latest_purify else set()
        extra_preds = [v for v in plan["numeric_pool"] if v not in scale_vars and v not in dropped_set]
        if construct_var:
            predictors = [construct_var, *extra_preds][:5]
        else:
            predictors = [v for v in plan["numeric_pool"] if v not in dropped_set][:5]

        # Optional invisible long-tail readonly stat supplement (only on explicit Bootstrap/Cliff/Gini goal triggers)
        wants_bootstrap = any(k in goal_lower for k in ("bootstrap", "自助法", "cliff", "克里夫", "基尼", "gini"))
        if (
            wants_bootstrap
            and plan["outcome"]
            and "run_custom_stat_script" in avail_tools
            and "run_custom_stat_script" not in called_ops
        ):
            target_var = plan["outcome"]
            bootstrap_script = "\n".join([
                "import math",
                "import statistics",
                f"target_var = {json.dumps(target_var)}",
                "questions = DATA.get('questions') or []",
                "rows = DATA.get('rows') or []",
                "qmeta = {}",
                "for q in questions:",
                "    if q.get('variable') == target_var or q.get('id') == target_var:",
                "        qmeta = q",
                "        break",
                "qid = str(qmeta.get('id') or target_var)",
                "qvar = str(qmeta.get('variable') or target_var)",
                "label = str(qmeta.get('text') or qvar)[:28]",
                "raw_vals = []",
                "for row in rows:",
                "    ans = row.get('answers') or {}",
                "    v = ans.get(qid) if qid in ans else ans.get(qvar)",
                "    if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(float(v)):",
                "        raw_vals.append(float(v))",
                "if len(raw_vals) < 10:",
                "    raise ValueError('insufficient_numeric_rows_for_bootstrap')",
                "n_obs = len(raw_vals)",
                "boots = []",
                "rng_state = 20260419",
                "for _ in range(400):",
                "    tot = 0.0",
                "    for _ in range(n_obs):",
                "        rng_state = (1664525 * rng_state + 1013904223) % 4294967296",
                "        tot += raw_vals[rng_state % n_obs]",
                "    boots.append(tot / n_obs)",
                "boots.sort()",
                "ci_low = float(boots[int(0.025 * (len(boots) - 1))])",
                "ci_high = float(boots[int(0.975 * (len(boots) - 1))])",
                "mean_v = float(statistics.mean(raw_vals))",
                "med_v = float(statistics.median(raw_vals))",
                "sd_v = float(statistics.stdev(raw_vals)) if n_obs > 1 else 0.0",
                "RESULT = {",
                "    'summary': f'{label} Bootstrap 自助抽样均值 {mean_v:.3f}（95% 置信区间 {ci_low:.3f}–{ci_high:.3f}，中位数 {med_v:.3f}，n={n_obs}）',",
                "    'n_effective': n_obs,",
                "    'metrics': {",
                "        '均值': round(mean_v, 4),",
                "        '95%置信下限': round(ci_low, 4),",
                "        '95%置信上限': round(ci_high, 4),",
                "        '中位数': round(med_v, 4),",
                "        '标准差': round(sd_v, 4),",
                "    },",
                "    'table': {",
                "        'headers': ['统计指标', '估计值'],",
                "        'rows': [",
                "            ['样本均值', round(mean_v, 4)],",
                "            ['Bootstrap 95% CI 下限', round(ci_low, 4)],",
                "            ['Bootstrap 95% CI 上限', round(ci_high, 4)],",
                "            ['样本中位数', round(med_v, 4)],",
                "            ['样本标准差', round(sd_v, 4)],",
                "        ],",
                "    },",
                "    'diagnostics': ['CUSTOM_BOOTSTRAP_400_CI95'],",
                "}",
            ])
            return {
                "thought": "根据目标中的非参数/自助抽样需求，执行 Bootstrap 95% 置信区间稳健估计并登记可复核结果。",
                "tool_calls": [{"name": "run_custom_stat_script", "args": {"script": bootstrap_script}}],
            }

        # Step 4: Group comparison + baseline regression (+ logistic if binary outcome exists)
        outcome = plan["outcome"]
        if outcome and predictors and "fit_linear_regression" not in called_ops:
            calls = []
            if plan["moderators"]:
                calls.append({"name": "test_group_difference", "args": {"outcome": outcome, "group_var": plan["moderators"][0], "method": "auto"}})
            calls.append({"name": "fit_linear_regression", "args": {"outcome": outcome, "predictors": predictors, "ridge_lambda": 0.0}})
            if plan["binary_outcome"] and len(predictors) >= 1:
                calls.append({"name": "fit_logistic_regression", "args": {"outcome": plan["binary_outcome"], "predictors": predictors[:3], "l2_penalty": 0.0}})
            return {
                "thought": "量表构念已纯化，下面估计分组基准差异及全样本 HC1 稳健 OLS（如含二元结局则并行估计基准 Logistic），重点监控 VIF 共线性与分离告警。",
                "tool_calls": calls,
            }

        # Step 5: Autonomous Pivot #2 — Switch OLS->Ridge on VIF>5 and/or Logit->L2 Penalized on Separation
        has_vif = any(d.startswith("HIGH_VIF_COLLINEARITY:") for d in all_diags)
        has_ridge = any(d.startswith("RIDGE_STABILIZED:") for d in all_diags)
        has_sep = any(d.startswith("SEPARATION_DETECTED:") for d in all_diags)
        has_pen_logit = any(d.startswith("PENALIZED_LOGIT_L2:") for d in all_diags)
        pivot_calls = []
        if has_vif and not has_ridge and outcome and predictors:
            pivot_calls.append({"name": "fit_linear_regression", "args": {"outcome": outcome, "predictors": predictors, "ridge_lambda": 1.0}})
        if has_sep and not has_pen_logit and plan["binary_outcome"] and predictors:
            pivot_calls.append({"name": "fit_logistic_regression", "args": {"outcome": plan["binary_outcome"], "predictors": predictors[:3], "l2_penalty": 0.5}})
        if pivot_calls:
            return {
                "thought": "基准模型触发诊断告警（VIF>5 共线性膨胀或 Logistic 准完全分离），主动切换岭回归收缩 / L2 惩罚极大似然重新估计稳健系数。",
                "tool_calls": pivot_calls,
            }

        # Step 6: Deep mechanism search — Mediation + Subgroup Heterogeneity Scan (+ optional Conformal)
        if outcome and predictors and "scan_subgroup_heterogeneity" not in called_ops:
            deep_calls = []
            if len(predictors) >= 2 and construct_var and "test_mediation_effect" not in called_ops:
                deep_calls.append({"name": "test_mediation_effect", "args": {"predictor": predictors[1], "mediator": construct_var, "outcome": outcome, "bootstrap_samples": 200, "seed": 42}})
            elif len(predictors) >= 2 and "test_mediation_effect" not in called_ops:
                deep_calls.append({"name": "test_mediation_effect", "args": {"predictor": predictors[0], "mediator": predictors[1], "outcome": outcome, "bootstrap_samples": 200, "seed": 42}})
            if plan["moderators"]:
                deep_calls.append({"name": "scan_subgroup_heterogeneity", "args": {"outcome": outcome, "predictor": predictors[0], "moderators": plan["moderators"]}})
            if ("conformal" in goal_lower or "预测区间" in goal_lower) and "compute_conformal_prediction_band" not in called_ops:
                deep_calls.append({"name": "compute_conformal_prediction_band", "args": {"outcome": outcome, "predictors": predictors[:4], "alpha": 0.1, "calibration_ratio": 0.35}})
            if deep_calls:
                return {
                    "thought": "主模型已稳健收敛，进一步执行 Bootstrap 中介路径检验与全调节维度子群异质性扫描，排查总体均数背后是否潜藏辛普森悖论分化。",
                    "tool_calls": deep_calls,
                }

        # Step 7: Dynamic EpistemicGraph Pivot tool call when available
        if "mutate_epistemic_graph" in avail_tools and "mutate_epistemic_graph" not in called_ops:
            pivot_args = self._pick_major_pivot(observations)
            if pivot_args:
                return {
                    "thought": "已识别关键统计修正与人群方向反转证据，将核心发现同步锚定至研究结论链路。",
                    "tool_calls": [{"name": "mutate_epistemic_graph", "args": pivot_args}],
                }

        # Final Step: Synthesize Mother Insight from verified snapshots only
        rev_obs = next((obs for obs in observations if obs.get("operator") == "scan_subgroup_heterogeneity" and obs.get("reversals")), None)
        extra_notes = []
        if latest_purify and dropped_set:
            metrics_map = {m["label"]: m["value"] for m in latest_purify.get("metrics", [])}
            init_a = metrics_map.get("初始 Cronbach's α")
            final_a = metrics_map.get("纯化后 Cronbach's α")
            extra_notes.append(
                f"自主量表净化剔除异常题 {', '.join(sorted(dropped_set))}，α 由 {init_a} 提升至 {final_a}；"
            )
        if has_ridge:
            extra_notes.append("针对高 VIF 共线性自动切换 Ridge 收缩估计；")
        if has_pen_logit:
            extra_notes.append("针对准完全分离启用 L2 惩罚 Logistic 稳定比值比；")
        if rev_obs:
            rev = rev_obs["reversals"][0]
            extra_notes.append(
                f"按“{rev['moderator']}”分层后检出方向反转，“{rev['positive_stratum']['group']}”斜率 B={rev['positive_stratum']['slope']}（{_fmt_p(rev['positive_stratum']['p'])}），"
                f"而“{rev['negative_stratum']['group']}”斜率 B={rev['negative_stratum']['slope']}（{_fmt_p(rev['negative_stratum']['p'])}）。"
            )
        else:
            clean_obs = next((obs for obs in observations if obs.get("operator") == "apply_cleaning_pipeline"), None)
            n_candidates = [obs["n_effective"] for obs in observations if isinstance(obs.get("n_effective"), int)]
            clean_n = clean_obs["n_effective"] if clean_obs else (n_candidates[-1] if n_candidates else 0)
            honesty = summarize_receipts_honesty(observations, clean_n)
            if 0 < clean_n < 30 and not honesty["has_significant_effect"] and not honesty["special_warnings"]:
                extra_notes.append("小样本统计功效不足，核心检验均未达到 p<0.05 显著水平，未检出稳健主效应，不作外推断言。")
        return _finish("已完成样本质量核查、稳健模型修正与人群差异检验，所有核心结论均有实证数据支撑。", extra_notes)

    def _authored_reviewer_react_step(self, messages, *, tool_choice="auto"):
        observations, called_ops, _ = self._extract_observations(messages)
        task_packs = self._extract_tag_json(messages, "task-json")
        task_pack = task_packs[0] if task_packs else {}
        rev_ctxs = self._extract_tag_json(messages, "reviewer-context")
        rev_ctx = rev_ctxs[-1] if rev_ctxs else {}
        review_stage = str((task_pack.get("task") or {}).get("review_stage") or rev_ctx.get("stage") or "final")

        if not observations and "verify_evidence_hashes" not in called_ops and tool_choice != "none":
            calls = [{"name": "verify_evidence_hashes", "args": {}}]
            if rev_ctx.get("outcome") and rev_ctx.get("predictor") and rev_ctx.get("moderators"):
                calls.append({
                    "name": "challenge_subgroup_robustness",
                    "args": {
                        "outcome": rev_ctx["outcome"],
                        "predictor": rev_ctx["predictor"],
                        "moderators": list(rev_ctx["moderators"])[:3],
                    },
                })
            return {
                "thought": "先逐项核验全部上游统计结果的一致性，并对核心自变量与调节变量执行分人群稳健性检验。",
                "tool_calls": calls,
            }
        hash_ok = any(obs.get("auditVerified") is True for obs in observations)
        reversals = [r for obs in observations for r in (obs.get("reversals") or [])]
        findings = []
        if reversals:
            rev = reversals[0]
            findings.append({
                "severity": "minor",
                "location": "结论与主效应解释",
                "issue": f"全样本均值模型掩盖了调节维度“{rev['moderator']}”的方向分化，必须按子群限定结论适用边界。",
                "evidence_ref": str(observations[-1].get("snapshot_id") or ""),
                "required_change": f"将结论拆分为“{rev['positive_stratum']['group']}”（正向）与“{rev['negative_stratum']['group']}”（负向）两类差异化机制。",
            })
        checks = [
            {"check": "统计结果一致性核验", "result": "pass" if hash_ok else "fail", "details": "全部报告数字与统计结果表一一对应，无未经核验的推算数据。"},
            {"check": "横截面表述克制与人群差异边界核查", "result": "pass" if hash_ok else "uncertain", "details": "已完成分人群稳健性复核，并将结论适用范围明确纳入报告提醒。"},
        ]
        decision = "approve" if hash_ok else "revise"
        return {
            "thought": "已完成全部统计结果一致性核验与分人群稳健性复核，形成审阅结论。",
            "final": {
                "summary": "全部核心统计结果已核验一致，且不同人群的结论适用边界已明确界定。" if hash_ok else "部分研究结论尚缺少完整的统计结果支撑，建议补充检验后重新复核。",
                "deliverable": {
                    "decision": decision,
                    "stage": review_stage,
                    "findings": findings,
                    "consistency_checks": checks,
                    "evidence_gaps": [] if hash_ok else ["部分结论缺少完整统计结果支撑"],
                    "ethics_and_privacy": ["全程采用汇总统计分析，未读取逐份原始问卷与开放题个人隐私，并满足最小分组匿名保护要求。"],
                    "competition_readiness": {
                        "status": "ready" if hash_ok else "not_ready",
                        "items": ["统计结果全链路可追溯", "匿名保护与表述克制复核通过"] if hash_ok else ["待补齐部分统计结果核验"],
                        "basis": "基于本轮全部统计结果一致性复核",
                    },
                    "revision_request": "" if hash_ok else "请补充缺失统计分析后重新复核。",
                },
            },
        }

    async def agent_step(
        self,
        config,
        key,
        messages,
        *,
        tools=None,
        tool_choice="auto",
        limit=196608,
        timeout=45,
    ) -> AgentModelTurn:
        """Local-test native tool-calling step producing typed AgentModelTurn."""
        self._capture_prompt("agent_step", "latest.txt", json.dumps(messages, ensure_ascii=False))
        joined = "\n".join(str(m.get("content", "")) for m in messages if isinstance(m, dict))
        if "<sandbox-context>" in joined:
            payload = self._authored_data_react_step(messages, tools=tools, tool_choice=tool_choice)
        elif "<reviewer-tools-ready/>" in joined:
            payload = self._authored_reviewer_react_step(messages, tool_choice=tool_choice)
        else:
            raw = await self.workflow_step(config, key, messages, limit)
            return AgentModelTurn(text=str(raw), reasoning="", tool_calls=(), usage=None, stop_reason="stop")

        await self._paced()
        thought = str(payload.get("thought") or "")
        raw_tcs = payload.get("tool_calls") or []
        if raw_tcs and tool_choice != "none":
            turn_idx = sum(1 for m in messages if isinstance(m, dict) and m.get("role") == "assistant") + 1
            tcs = tuple(
                ModelToolCall(
                    id=f"auth_tc_{turn_idx}_{idx}",
                    name=str(tc["name"]),
                    arguments=dict(tc.get("args") or {}),
                )
                for idx, tc in enumerate(raw_tcs)
            )
            return AgentModelTurn(text="", reasoning=thought, tool_calls=tcs, usage=None, stop_reason="tool_calls")
        final_obj = payload.get("final") if isinstance(payload.get("final"), dict) else payload
        return AgentModelTurn(
            text=json.dumps(final_obj, ensure_ascii=False, separators=(",", ":")),
            reasoning=thought,
            tool_calls=(),
            usage=None,
            stop_reason="stop",
        )

    async def workflow_step(self, config, key, messages, limit=196608):
        self._capture_prompt("workflow", "latest.txt", json.dumps(messages, ensure_ascii=False))
        system_text = messages[0].get("content", "") if messages and isinstance(messages[0], dict) else ""
        joined = "\n".join(str(m.get("content", "")) for m in messages if isinstance(m, dict))

        # Check authored override file if present
        if "<sandbox-context>" in joined:
            payload = self._authored_data_react_step(messages)
            await self._paced()
            return self._completion(json.dumps(payload, ensure_ascii=False))
        if "<reviewer-tools-ready/>" in joined:
            payload = self._authored_reviewer_react_step(messages)
            await self._paced()
            return self._completion(json.dumps(payload, ensure_ascii=False))

        # Legacy 5-role workflow step fallback under gemini-4-carbon-authored
        task_packs = self._extract_tag_json(messages, "task-json")
        task = task_packs[0].get("task", {}) if task_packs else {}
        step = task_packs[0].get("step", "") if task_packs else ""
        goal = str((task.get("requirements") or {}).get("goal") or "专题实证调查")
        if step in ("review_materials", "design_research"):
            payload = {"note": f"已围绕“{goal[:60]}”梳理背景、决策主体与理论框架。"}
        elif step == "assess_feasibility":
            payload = {
                "summary": f"已生成“{goal[:60]}”拟议研究设计方案。",
                "deliverable": {
                    "title": goal[:120],
                    "background": "基于已有资料与区域场景拟定研究框架。",
                    "research_questions": [f"围绕“{goal[:40]}”，核心驱动构念如何作用于采纳与满意度？"],
                    "objectives": ["界定构念与四栏测量映射", "实施预调研与多轮稳健计量分析"],
                    "population": str((task.get("requirements") or {}).get("population") or "目标成年受访群体"),
                    "geography": str((task.get("requirements") or {}).get("geography") or "调研区域"),
                    "period": "拟议实施周期",
                    "feasibility": {"status": "proposed"},
                },
            }
        elif step in ("design_variables", "design_questionnaire"):
            payload = {"note": f"已建立构念到题项的映射矩阵（{step}）。"}
        elif step == "design_sampling":
            payload = {
                "summary": "已生成多阶段分层抽样与设计效应测算方案。",
                "deliverable": {
                    "variables": [{"name": "core_perception", "measure": "5点李克特量表"}],
                    "questionnaire": {"title": goal[:80], "items": 16},
                    "sampling": {"method": "多阶段分层抽样", "designEffect": 1.35},
                },
            }
        elif step == "analyze_data":
            tool_packs = self._extract_tag_json(messages, "tool-json")
            ds = (tool_packs[-1].get("analyze_dataset") or {}) if tool_packs else {}
            payload = {"summary": f"已完成数据集汇总统计分析（核验通道 {ds.get('tool', 'trusted')}）。"}
        elif step in ("outline_report", "draft_report"):
            payload = (
                {"note": "已构建六章一附录叙事蓝图。"}
                if step == "outline_report"
                else {"summary": f"已基于已确认证据撰写“{goal[:60]}”研究报告草稿。", "deliverable": {"title": goal[:120], "abstract": "基于已核验实证结果完成。", "chapters": [], "conclusions": [], "recommendations": []}}
            )
        elif step in ("check_evidence", "check_consistency", "review_deliverable"):
            if step == "review_deliverable":
                payload = {
                    "summary": "已完成阶段一致性与合规审阅。",
                    "deliverable": {
                        "decision": "approve",
                        "stage": str(task.get("review_stage") or "final"),
                        "consistency_checks": [{"check": "证据口径与拟议标记核验", "result": "pass", "details": "未超越提供资料声称结论"}],
                        "competition_readiness": {"status": "not_assessed", "basis": "阶段性方案审阅，待实际材料收齐后终审。"},
                    },
                }
            else:
                payload = {"note": f"已完成审阅前置核查（{step}）。"}
        else:
            payload = {"note": f"已完成当前阶段分析记录（{step or system_text[:20]}）。"}
        await self._paced()
        return self._completion(json.dumps(payload, ensure_ascii=False))


class FixtureProvider:
    def __init__(self):
        self.calls = 0

    async def __call__(self, config, key, brief):
        self.calls += 1
        # Conspicuous synthetic content, never an actual supplier/model receipt.
        return json.dumps({"title": "合成测试问卷 · 待实施", "objective": "合成需求用于测试保存与版本链。", "population": "合成对象，不是实际受访者。",
                           "items": [{"text": f"合成测试题项 {n}，您如何评价拟议服务？", "type": "single", "choices": ["选项甲", "选项乙"],
                                      "researchQuestion": "拟议服务体验如何？", "decisionUse": "拟支持预测试规划。"} for n in range(1, 4)]}, ensure_ascii=False)

    async def topic(self, config, key, message, selected):
        self.calls += 1
        return json.dumps({"items": [{"patternId": item["id"], "title": "合成测试提案 · " + item["title"][:130],
            "researchQuestion": item["question"], "decisionOwner": item["decisionOwner"], "decision": item["decision"],
            "whyHere": "合成样本验收。地区背景按来源核对，团队渠道需自行确认。", "firstWeekPlan": item["minimumEvidence"][:3],
            "unknowns": ["尚未联系真实合作方"], "sourceIds": item["sourceIds"][:3]} for item in selected]}, ensure_ascii=False)

    async def topic_agent(self, config, key, message, selected):
        self.calls += 1
        return json.dumps({"text": "合成测试回执，仅验证会话与提案流程，不代表实际研究建议。",
            "questions": ["本次合成测试中的调查入口是否已经确认？"],
            "items": [{"patternId": item["id"], "title": "合成测试提案 · " + item["title"][:130],
                "researchQuestion": item["question"], "decisionOwner": item["decisionOwner"], "decision": item["decision"],
                "whyHere": "合成验收。地区和调查条件仍需核查。", "firstWeekPlan": item["minimumEvidence"][:3],
                "unknowns": ["尚未联系真实合作方"], "sourceIds": item["sourceIds"][:3]} for item in selected]}, ensure_ascii=False)

    async def agent_chat(self, config, key, message):
        self.calls += 1
        # Conspicuously synthetic: verifies the conversation chain, never a model's advice.
        return json.dumps({"reply": "合成测试回执，只验证对话流程，不代表实际研究建议。", "actions": [{"tool": "next", "args": {}}]}, ensure_ascii=False)

    async def section_draft(self, config, key, message):
        self.calls += 1
        # Conspicuously synthetic: verifies the drafting chain and its placeholders, never a model's writing.
        return json.dumps({"paragraphs": [{"text": "合成测试拟稿：只验证拟稿链，不代表真实模型的写作。"},
                                          {"text": "合成测试拟稿引用第一条事实：{F1}。"}]}, ensure_ascii=False)

    async def answer(self, config, key, message, spec):
        if spec.get("mode") == "interview_pretest":
            raise ProviderFailure("provider_rejected")
        self.calls += 1
        # Conspicuously synthetic answers: first option, lowest point, a labelled placeholder text.
        def pick(item):
            if item["type"] == "single":
                return item["codes"][0] if item["codes"] else None
            if item["type"] == "multi":
                return item["codes"][:1] or None
            if item["type"] in ("likert", "number"):
                return item["min"] if item["min"] is not None else 0
            return "合成测试回答，不代表任何人的观点。"
        if spec["mode"] == "single":
            return json.dumps({"value": pick(spec["questions"][0]), "unclear": ""}, ensure_ascii=False)
        return json.dumps({"answers": [{"variable": item["variable"], "value": pick(item), "unclear": ""} for item in spec["questions"]]}, ensure_ascii=False)
