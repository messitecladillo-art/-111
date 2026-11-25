"""Unified pre-submission red-team gate for competition readiness, blind anonymity & statistical rigor."""
from __future__ import annotations

import math
import re
from typing import Any

DEFAULT_COMPETITION_17 = "“益普索杯”第十七届全国大学生市场调查与分析大赛"

_SCHOOL_STOP_PREFIX_RE = re.compile(
    r"^(?:在|对|于|向|到|从|由|把|将|给|和|与|及|等|各|多所|许多|不少|很多|部分|各类|各级|"
    r"所在|属地|重点|公办|民办|地方|本科|职业|衔接|结合|联合|依托|面向|覆盖|进入|来自|位于|"
    r"针对|围绕|通过|开展|包括|涉及|比如|例如|如|已|的|了)+"
)
_SCHOOL_GENERIC_TAIL_RE = re.compile(
    r"(?:许多|多所|不少|很多|部分|各类|各级|所在|属地|重点|公办|民办|地方|本科|衔接|结合|联合|"
    r"依托|面向|覆盖|进入|独立|普通|高等|知名|各大|各所|各|某+|哪[所家个]?|本|该|其|全市|全省|全国|该市|本市)$"
)
_BLIND_SCHOOL_RE = re.compile(
    r"(?!某某大学|某某学院|某某职业技术学校|某某理工学院|某高校|某大学|某学院|某职业技术学校|双一流高校|重点高校|公办高校|民办高校|独立学院)"
    r"[\u4e00-\u9fa5]{2,12}(?:大学|学院|职业技术学校|理工学院)(?!生|子|城|园|堂|科|习|教|里|中|内)"
)


def _find_blind_school(text: str) -> str | None:
    """Return the first concrete non-anonymized school name, ignoring generic phrases and leading stop-words."""
    for match in _BLIND_SCHOOL_RE.finditer(text):
        cand = match.group(0)
        suffix_m = re.search(r"(职业技术学校|理工学院|大学|学院)$", cand)
        if not suffix_m:
            continue
        suffix = suffix_m.group(1)
        stem = cand[: suffix_m.start()]
        stem = re.sub(r"^.*?(?:大学生|研究生|本科生|许多大学|多所大学|高校)", "", stem)
        stem = _SCHOOL_STOP_PREFIX_RE.sub("", stem)
        if not stem or len(stem) < 2:
            continue
        if (
            stem.startswith("某")
            or "某某" in stem
            or re.match(r"^(?:双一流|重点|公办|民办|独立|职业|本科|地方|普通|高等)", stem)
        ):
            continue
        if suffix in ("大学", "学院") and re.search(r"[\u4e00-\u9fa5]市$", stem):
            continue
        if _SCHOOL_GENERIC_TAIL_RE.search(stem):
            continue
        return stem + suffix
    return None
_BLIND_PERSON_RE = re.compile(r"(?:指导教师|指导老师|队长|组员|第一作者)\s*[:：]\s*(?!\[\u5df2\u8131\u654f\]|已脱敏|匿名|某某|队内成员)([\u4e00-\u9fa5]{2,4})")
_BLIND_ID_RE = re.compile(r"(?:学号|手机号|联系电话|QQ|微信号)\s*[:：]?\s*\d{6,}")
_BLIND_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@(?!example\.com|sample\.org)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

_SIM_LEAK_RE = re.compile(
    r"\u3010教学模拟[^\u3011]*\u3011|随机种子|合成数据|演练语料|作为\s*(?:AI|人工智能|大语言模型)|ChatGPT\s*生成|由\s*AI\s*直接生成",
    re.IGNORECASE,
)
_CAUSAL_OVERREACH_RE = re.compile(r"直接导致|显著引起|必然引起|决定性引发|充分证明.{0,12}导致|因果证明")
_CAUSAL_HEDGE_RE = re.compile(r"相关关系|横截面|非实验|有待纵向|谨慎解释|正向预测|统计相关")
_EXPERIMENT_RE = re.compile(r"随机对照|RCT|双重差分|DID|断点回归|RDD|工具变量|纵向追踪")
_COMPLETE_SEP_RE = re.compile(r"(?:SE|标准误)\s*[=:：]?\s*(\d{2,}(?:\.\d+)?)|\bOR\s*[=:：]?\s*(\d{3,}(?:\.\d+)?)", re.IGNORECASE)
_FIRTH_RE = re.compile(r"Firth|惩罚似然|完全分离|准完全分离|合并稀疏", re.IGNORECASE)
_FACTOR_RE = re.compile(r"因子分析|EFA|CFA|验证性因子|结构方程|SEM|路径分析")
_SAMPLE_N_RE = re.compile(r"(?:有效样本|样本量|共回收有效问卷|实际样本)\s*(?:[nN]\s*)?[=为达共:：]?\s*(\d{1,5})")
_SEM_CLAIM_RE = re.compile(r"模型拟合(?:效果)?(?:良好|优秀|理想|达标|较为理想)|整体适配度较高")
_SRS_FORMULA_RE = re.compile(r"Z\s*\^?\s*2\s*[×*]?\s*p\s*\(\s*1\s*[-−]\s*p\s*\)|简单随机抽样(?:样本量)?公式", re.IGNORECASE)
_COMPLEX_DESIGN_RE = re.compile(r"多阶段|分层|整群|配额|方便抽样|非概率|滚雪球|PPS")
_DEFF_RE = re.compile(r"Deff|设计效应|design\s*effect", re.IGNORECASE)
_CLUSTER_RE = re.compile(r"K-?Means|层次聚类|二阶段聚类|聚类分群|簇标签", re.IGNORECASE)
_CLS_RE = re.compile(r"GBDT|XGBoost|LightGBM|随机森林|Random\s*Forest|AUC|准确率", re.IGNORECASE)
_NLP_RE = re.compile(r"词云|SnowNLP|情感倾向|LDA\s*主题|分词词频|文本挖掘")
_QUANT_LINK_RE = re.compile(r"Q\d{1,2}|表\s*\d|图\s*\d|维度|变量|满意度|意愿|均值|相关性|回归|卡方")
_AI_DISCLOSURE_RE = re.compile(r"AI\s*工具使用说明|AIGC|人工智能辅助|大模型辅助|辅助工具使用|人机协同台账", re.IGNORECASE)
_CAPTION_NUM_RE = re.compile(r"(?:^|\n)\s*(表|图)\s*(\d+(?:[-—–.]\d+)?)\s+")
_OUTBOUND_BRACKET_STRIP_RE = re.compile(r"[\u3010\u3011\u300c\u300d\u300e\u300f\[\]\{\}]")
_FORMULA_OR_ANCHOR_RE = re.compile(r"\[\[[^\]]+\]\]|\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]")
_VISIBLE_CORNER_LENTICULAR_RE = re.compile(r"[\u3010\u3011\u300c\u300d\u300e\u300f]")
_ZERO_P_RE = re.compile(r"(?<![A-Za-z])[pP]\s*=\s*0\.0+(?![0-9])")


def _sanitize_gate_ui_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", _OUTBOUND_BRACKET_STRIP_RE.sub("", str(value))).strip()


def _extract_sections(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw = payload.get("sections") or payload.get("report") or []
    out: list[dict[str, Any]] = []
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict):
                out.append({
                    "id": str(item.get("id") or ""),
                    "title": str(item.get("title") or "未命名章节"),
                    "body": str(item.get("body") or ""),
                    "blocks": item.get("blocks") if isinstance(item.get("blocks"), list) else [],
                })
    return out


def run_preflight_audit(payload: dict[str, Any] | None) -> dict[str, Any]:
    """Runs deterministic red-team & submission compliance checks on a report draft."""
    data = dict(payload) if isinstance(payload, dict) else {}
    title = str(data.get("title") or "").strip()
    subtitle = str(data.get("subtitle") or "").strip()
    comp_name = str(data.get("competitionName") or DEFAULT_COMPETITION_17).strip()
    expected_edition = int(data.get("expectedEdition") or 17)
    require_blind = bool(data.get("requireBlindReview", True))

    sections = _extract_sections(data)
    results = data.get("results") if isinstance(data.get("results"), list) else []
    full_text = "\n".join([title, subtitle, *[f"{s['title']}\n{s['body']}" for s in sections]])

    checks: list[dict[str, Any]] = []
    seen_keys: set[str] = set()

    def add_check(
        cid: str,
        category: str,
        severity: str,
        check_title: str,
        message: str,
        *,
        section_title: str | None = None,
        excerpt: str | None = None,
    ) -> None:
        clean_sec_title = _sanitize_gate_ui_text(section_title)
        key = f"{cid}:{clean_sec_title}"
        if key in seen_keys:
            return
        seen_keys.add(key)
        entry: dict[str, Any] = {
            "id": cid,
            "category": category,
            "severity": severity,
            "title": _sanitize_gate_ui_text(check_title),
            "message": _sanitize_gate_ui_text(message),
        }
        if clean_sec_title:
            entry["sectionTitle"] = clean_sec_title
        clean_excerpt = _sanitize_gate_ui_text(excerpt)
        if clean_excerpt:
            entry["excerpt"] = clean_excerpt[:120]
        checks.append(entry)

    # 1. Competition Edition & Simulation / Boilerplate Leaks
    if expected_edition >= 17 and "正大杯" in f"{title}\n{comp_name}\n{full_text}":
        add_check(
            "stale_competition_title",
            "competition",
            "error",
            "赛事冠名版本过期",
            "检测到“正大杯”旧届字样，第十七届应统一使用“益普索杯”第十七届全国大学生市场调查与分析大赛。",
            excerpt="正大杯",
        )
    sim_match = _SIM_LEAK_RE.search(full_text)
    if sim_match:
        clean_sim = _sanitize_gate_ui_text(sim_match.group(0))
        add_check(
            "simulation_or_ai_leak",
            "integrity",
            "error",
            "模拟标记或模板痕迹泄露",
            f"正文中出现疑似模拟标记或模板痕迹词（“{clean_sim}”），提交前必须彻底清理。",
            excerpt=clean_sim,
        )

    # 2. Blind Review Anonymity Audit
    if require_blind:
        for sec in sections:
            body = sec["body"]
            if "文献" in sec["title"] or "参考" in sec["title"]:
                continue
            sch = _find_blind_school(body)
            if sch:
                add_check(
                    "blind_school_leak",
                    "blind_review",
                    "error",
                    "盲审院校信息未脱敏",
                    f"“{sec['title']}”出现具名高校/院系称谓（“{sch}”），违反匿名评审规范。",
                    section_title=sec["title"],
                    excerpt=sch,
                )
            per = _BLIND_PERSON_RE.search(body)
            if per:
                add_check(
                    "blind_person_leak",
                    "blind_review",
                    "error",
                    "盲审姓名暴露",
                    f"“{sec['title']}”出现实名身份信息（“{per.group(0)}”），请替换为赛队编号或“已脱敏”。",
                    section_title=sec["title"],
                    excerpt=per.group(0),
                )
            pid = _BLIND_ID_RE.search(body)
            eml = _BLIND_EMAIL_RE.search(body)
            if pid or eml:
                hit = (pid or eml).group(0)
                add_check(
                    "blind_contact_leak",
                    "blind_review",
                    "error",
                    "个人联系方式/学号暴露",
                    f"“{sec['title']}”含具体联系方式或学号（{hit}），请做脱敏处理。",
                    section_title=sec["title"],
                    excerpt=hit,
                )

    # 3. Page & Abstract Budget Compliance (<= 65 combined pages)
    est_pages = data.get("estimatedPages")
    if isinstance(est_pages, (int, float)) and est_pages > 65:
        add_check(
            "page_budget_exceeded",
            "formatting",
            "error",
            "超出 65 页组合上限",
            f"当前估算页数为 {int(round(est_pages))} 页，超过第十七届组委会 65 页（扉页+正文+附录）硬约束，请精简冗余图表或附表。",
        )
    elif not isinstance(est_pages, (int, float)):
        total_chars = sum(len(re.sub(r"\s+", "", s["body"])) for s in sections)
        approx_pages = max(1, math.ceil(total_chars / 680) + 4)
        if approx_pages > 65:
            add_check(
                "page_budget_exceeded",
                "formatting",
                "warn",
                "按字数估算可能超出 65 页",
                f"正文约 {total_chars} 字（估算 {approx_pages} 页），逼近/超过 65 页硬上限，建议导出后核对实际 PDF 页数。",
            )

    abs_sec = next((s for s in sections if "摘要" in s["title"]), None)
    if abs_sec:
        visible_abs = re.sub(r"\[\[(?:图|表|式|引):[^\]]+\]\]", "", abs_sec["body"])
        abs_chars = len(re.sub(r"\s+", "", visible_abs))
        if abs_chars < 150:
            add_check("abstract_too_short", "formatting", "warn", "摘要信息密度偏低", f"摘要仅 {abs_chars} 字，建议浓缩为单页 450–900 字完整覆盖问题、方法、发现与对策。")
        elif abs_chars > 1400:
            add_check("abstract_too_long", "formatting", "warn", "摘要存在跨页风险", f"摘要达 {abs_chars} 字，极易突破单页限制，建议压缩在 1000 字以内。")

    # 4. Statistical Method Guardrails
    is_experimental = bool(_EXPERIMENT_RE.search(full_text))
    n_candidates = [int(m.group(1)) for m in _SAMPLE_N_RE.finditer(full_text) if 5 <= int(m.group(1)) <= 100000]
    global_n = max(n_candidates) if n_candidates else None

    for sec in sections:
        stitle = sec["title"]
        body = sec["body"]
        if not body.strip():
            continue

        if not is_experimental:
            mc = _CAUSAL_OVERREACH_RE.search(body)
            if mc and not _CAUSAL_HEDGE_RE.search(body):
                add_check(
                    "causal_overreach",
                    "statistics",
                    "warn",
                    "横截面因果措辞越界",
                    f"“{stitle}”出现“{mc.group(0)}”，建议改为正向关联/预测解释并说明横截面推断边界。",
                    section_title=stitle,
                    excerpt=mc.group(0),
                )

        if re.search(r"Logistic|Logit|Probit|回归", body, re.IGNORECASE) and not _FIRTH_RE.search(body):
            for ms in _COMPLETE_SEP_RE.finditer(body):
                se_v = float(ms.group(1) or 0)
                or_v = float(ms.group(2) or 0)
                if se_v > 10 or or_v > 100:
                    add_check(
                        "complete_separation_se",
                        "statistics",
                        "error",
                        "逻辑回归完全分离/SE畸高",
                        f"“{stitle}”报告了 {ms.group(0)}，需采用 Firth 惩罚似然回归或合并稀疏组别。",
                        section_title=stitle,
                        excerpt=ms.group(0),
                    )
                    break

        if _FACTOR_RE.search(body):
            local_ns = [int(m.group(1)) for m in _SAMPLE_N_RE.finditer(body)]
            eff_n = max(local_ns) if local_ns else global_n
            if eff_n is not None and 10 <= eff_n < 100:
                add_check(
                    "micro_sample_factor_model",
                    "statistics",
                    "error",
                    "小样本强行做因子/SEM建模",
                    f"“{stitle}”在有效样本 n={eff_n} (<100) 时使用因子分析/SEM，建议改用非参数或稳健描述比较。",
                    section_title=stitle,
                    excerpt=f"n={eff_n}",
                )

        if _SEM_CLAIM_RE.search(body):
            rmsea = re.search(r"RMSEA\s*[=:：]?\s*(\d+\.\d+)", body, re.IGNORECASE)
            cfi = re.search(r"CFI\s*[=:：]?\s*(\d+\.\d+)", body, re.IGNORECASE)
            tli = re.search(r"TLI\s*[=:：]?\s*(\d+\.\d+)", body, re.IGNORECASE)
            bad_fit: list[str] = []
            if rmsea and float(rmsea.group(1)) > 0.08:
                bad_fit.append(f"RMSEA={rmsea.group(1)}")
            if cfi and float(cfi.group(1)) < 0.90:
                bad_fit.append(f"CFI={cfi.group(1)}")
            if tli and float(tli.group(1)) < 0.90:
                bad_fit.append(f"TLI={tli.group(1)}")
            if bad_fit:
                add_check(
                    "sem_fit_overreach",
                    "statistics",
                    "error",
                    "SEM 拟合指标超限却强行称良好",
                    f"“{stitle}”报告了 {', '.join(bad_fit)}，已越过通用可接受门槛，严禁粉饰为拟合良好。",
                    section_title=stitle,
                    excerpt=", ".join(bad_fit),
                )

        if _SRS_FORMULA_RE.search(body) and _COMPLEX_DESIGN_RE.search(full_text) and not _DEFF_RE.search(full_text):
            add_check(
                "srs_on_convenience_sample",
                "statistics",
                "warn",
                "复杂/非概率抽样套用纯 SRS 公式缺 Deff",
                f"“{stitle}”套用简单随机抽样公式但未体现设计效应 Deff 修正。",
                section_title=stitle,
            )

        if _CLUSTER_RE.search(body) and _CLS_RE.search(body) and re.search(r"(?:聚类标签|分群结果|簇类).{0,32}(?:作为目标|预测|验证分类|AUC|准确率)", body):
            add_check(
                "circular_cluster_classifier",
                "statistics",
                "error",
                "聚类标签再训练分类器的循环验证陷阱",
                f"“{stitle}”以 K-Means 聚类标签作为目标训练分类器并宣传高 AUC/准确率，请改用独立外部结果指标检验。",
                section_title=stitle,
            )

        if _NLP_RE.search(body) and not _QUANT_LINK_RE.search(body):
            add_check(
                "orphan_nlp_section",
                "statistics",
                "warn",
                "孤立文本或词云模块未绑定定量题项",
                f"“{stitle}”仅单独展示词云或文本情感分，未与问卷定量题项或核心维度呼应。",
                section_title=stitle,
            )

        body_without_sim = _SIM_LEAK_RE.sub("", _FORMULA_OR_ANCHOR_RE.sub("", body))
        if _VISIBLE_CORNER_LENTICULAR_RE.search(body_without_sim):
            add_check(
                "bracket_punctuation_residue",
                "formatting",
                "warn",
                "正文残留非学术括号标点",
                f"“{stitle}”存在方头括号或直角引号残留，建议统一替换为标准中文双引号或连贯句式。",
                section_title=stitle,
            )

        zero_p = _ZERO_P_RE.search(body_without_sim)
        if zero_p:
            add_check(
                "zero_p_value_notation",
                "statistics",
                "warn",
                "显著性概率缺少下界规范表述",
                f"“{stitle}”出现“{zero_p.group(0)}”写法，极小显著性概率应规范写作 p < 0.0001。",
                section_title=stitle,
                excerpt=zero_p.group(0),
            )

    # Scan structured ResultSnapshots too
    for res in results:
        if not isinstance(res, dict):
            continue
        method = str(res.get("method") or "")
        if re.search(r"logit|logistic|probit", method, re.IGNORECASE):
            headers = res.get("headers") or []
            rows = res.get("rows") or []
            se_idx = next((i for i, h in enumerate(headers) if re.match(r"^(?:se|std\.?\s*error|标准误)$", str(h).strip(), re.IGNORECASE)), -1)
            or_idx = next((i for i, h in enumerate(headers) if re.match(r"^(?:or|odds\s*ratio|优势比)$", str(h).strip(), re.IGNORECASE)), -1)
            for r in rows:
                if not isinstance(r, list):
                    continue
                se_v = float(r[se_idx]) if 0 <= se_idx < len(r) and isinstance(r[se_idx], (int, float)) else 0.0
                or_v = float(r[or_idx]) if 0 <= or_idx < len(r) and isinstance(r[or_idx], (int, float)) else 0.0
                if se_v > 10 or or_v > 100:
                    add_check(
                        "complete_separation_se",
                        "statistics",
                        "error",
                        "结果表出现完全分离高标准误",
                        f"结果表“{res.get('title') or ''}”中“{r[0] if r else ''}”SE={se_v}/OR={or_v} 异常偏大。",
                        section_title=str(res.get("title") or ""),
                    )
                    break

    # 5. Exhibit Numbering & AI Disclosure Check
    captions = _CAPTION_NUM_RE.findall(full_text)
    if len(sections) >= 4 and not captions and not results:
        add_check("missing_numbered_exhibits", "formatting", "warn", "缺少标准编号图表题注", "正文中未检测到标准“表 X-X / 图 X-X”题注或已登记统计结果。")

    if len(sections) >= 4 and not _AI_DISCLOSURE_RE.search(full_text):
        add_check(
            "missing_ai_disclosure",
            "compliance",
            "info",
            "建议补充辅助工具使用合规声明",
            "正赛提交前建议在文末附录补充第十七届要求的辅助工具使用范围核查声明（人机协同台账）。",
        )

    errors = sum(1 for c in checks if c["severity"] == "error")
    warnings = sum(1 for c in checks if c["severity"] == "warn")
    infos = sum(1 for c in checks if c["severity"] == "info")
    score = max(0, 100 - errors * 18 - warnings * 7 - infos * 2)

    return {
        "ok": True,
        "passed": errors == 0,
        "score": score,
        "summary": {
            "errors": errors,
            "warnings": warnings,
            "infos": infos,
        },
        "checks": checks,
        "recommendations": [
            c["message"] for c in checks if c["severity"] in ("error", "warn")
        ][:8],
    }
