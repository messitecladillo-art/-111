"""CLI gate running EVI-X pre-submission red-team, typography, and prose compliance audit."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys

# Enforce zero paid API keys and offline deterministic mode by default.
for _env_key in ("OPENAI_API_KEY", "DEEPSEEK_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"):
    os.environ[_env_key] = ""
os.environ["EVIX_ENABLE_LIVE_SCHOLAR_API"] = "0"

ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = ROOT / "apps" / "backend" / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from multi_agent.agents.writing_agent.services.pre_submission_gate import run_preflight_audit  # noqa: E402

_FENCED_CODE_RE = re.compile(r"```[\s\S]*?```")
_PROTECTED_MATH_AND_REF_RE = re.compile(
    r"\[\[[^\]]+\]\]"
    r"|\$\$[\s\S]*?\$\$"
    r"|\$[^$\n]+\$"
    r"|\\\([\s\S]*?\\\)"
    r"|\\\[[\s\S]*?\\\]"
    r"|\\begin\{[A-Za-z*]+\}[\s\S]*?\\end\{[A-Za-z*]+\}"
    r"|\{[FGR]\d+\}"
)
_SIM_SENTINEL_RE = re.compile(r"\u3010教学模拟数据，不能作为实际调查结果\u3011")
_CJK_BRACKET_RE = re.compile(r"[\u3010\u3011\u300c\u300d\u300e\u300f]")
_STRAY_BRACE_RE = re.compile(r"[{}]")
_ZERO_P_STRICT_RE = re.compile(r"(?<![A-Za-z])[pP]\s*=\s*0(?:\.0+)?(?![0-9.])")
_BARE_ASCII_RHO_RE = re.compile(r"(?<![A-Za-z\\])\brho\s*=\s*[-+]?\d", re.IGNORECASE)
_ALLOWED_COLON_PREFIX_RE = re.compile(
    r"^(?:关键词|注|表注|图注|说明|资料来源|数据来源|来源|式中|其中|"
    r"附录[一二三四五六七八九十0-9]*|假设\s*H\d+[a-zA-Z]?|H\d+[a-zA-Z]?|"
    r"Q\d+[a-zA-Z_0-9]*|第[一二三四五六七八九十0-9]+[章节部分条])\s*[：:]",
    re.IGNORECASE,
)
_DICT_COLON_PARA_RE = re.compile(
    r"^(?:[（(][一二三四五六七八九十0-9]+[)）]\s*|[0-9]+[、.)）]\s*|[一二三四五六七八九十]+、\s*|[·•\-*]\s*)*"
    r"\*{0,2}([\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9/\-—·]{1,17})\*{0,2}：\s*\S"
)
_SAFE_MSG_STRIP_MAP: dict[int, str | None] = {
    0x3010: None,
    0x3011: None,
    0x300C: "“",
    0x300E: "“",
    0x300D: "”",
    0x300F: "”",
    ord("["): None,
    ord("]"): None,
    ord("{"): None,
    ord("}"): None,
}


def _clean_msg(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", str(value).translate(_SAFE_MSG_STRIP_MAP)).strip()


def _parse_markdown_report(raw: str, fallback_title: str) -> dict:
    sections: list[dict] = []
    cur_title = "正文"
    cur_lines: list[str] = []
    doc_title = fallback_title
    in_fence = False
    for line in raw.splitlines():
        if line.strip().startswith("```"):
            in_fence = not in_fence
            cur_lines.append(line)
            continue
        if not in_fence and line.startswith("# ") and doc_title == fallback_title:
            doc_title = line[2:].strip()
            continue
        m_sec = None if in_fence else re.match(r"^#{1,3}\s+(.+)$", line)
        if m_sec:
            if cur_lines:
                sections.append({"title": cur_title, "body": "\n".join(cur_lines).strip()})
                cur_lines = []
            cur_title = m_sec.group(1).strip()
        else:
            cur_lines.append(line)
    if cur_lines:
        sections.append({"title": cur_title, "body": "\n".join(cur_lines).strip()})
    return {"title": doc_title, "sections": sections}


def _hydrate_block_bodies(payload: dict) -> dict:
    """Ensure EditorContent sections storing prose inside blocks[] are fully audited."""
    normalized = dict(payload)
    raw_sections = normalized.get("sections") or normalized.get("report")
    if not isinstance(raw_sections, list):
        return normalized
    hydrated_sections: list[dict] = []
    for item in raw_sections:
        if not isinstance(item, dict):
            continue
        sec = dict(item)
        parts: list[str] = []
        body_str = str(sec.get("body") or "").strip()
        if body_str:
            parts.append(body_str)
        blocks = sec.get("blocks")
        if isinstance(blocks, list):
            for blk in blocks:
                if isinstance(blk, dict) and blk.get("kind") in ("paragraph", "callout", None):
                    btxt = str(blk.get("text") or "").strip()
                    if btxt and btxt not in parts:
                        parts.append(btxt)
        sec["body"] = "\n\n".join(parts)
        hydrated_sections.append(sec)
    normalized["sections"] = hydrated_sections
    return normalized


def _strip_protected_spans(text: str, *, allow_simulated: bool) -> str:
    cleaned = _FENCED_CODE_RE.sub("", text)
    if allow_simulated:
        cleaned = _SIM_SENTINEL_RE.sub("", cleaned)
    return _PROTECTED_MATH_AND_REF_RE.sub(" ", cleaned)


def _augment_typography_and_prose_checks(
    payload: dict,
    base_res: dict,
    *,
    allow_simulated: bool = False,
) -> dict:
    checks: list[dict] = []
    seen_keys: set[str] = set()

    for chk in base_res.get("checks", []):
        if allow_simulated and chk.get("id") == "simulation_or_ai_leak" and chk.get("excerpt") == "教学模拟数据，不能作为实际调查结果":
            continue
        item = dict(chk)
        if item.get("id") in ("bracket_punctuation_residue", "zero_p_value_notation"):
            item["severity"] = "error"
        key = f"{item.get('id')}:{item.get('sectionTitle', '')}"
        seen_keys.add(key)
        checks.append(item)

    def push_error(cid: str, category: str, title: str, message: str, sec_title: str = "", excerpt: str = "") -> None:
        clean_sec = _clean_msg(sec_title)
        key = f"{cid}:{clean_sec}"
        if key in seen_keys:
            return
        seen_keys.add(key)
        entry: dict = {
            "id": cid,
            "category": category,
            "severity": "error",
            "title": _clean_msg(title),
            "message": _clean_msg(message),
        }
        if clean_sec:
            entry["sectionTitle"] = clean_sec
        clean_ex = _clean_msg(excerpt)
        if clean_ex:
            entry["excerpt"] = clean_ex[:120]
        checks.append(entry)

    doc_title = str(payload.get("title") or "")
    doc_subtitle = str(payload.get("subtitle") or "")
    header_probe = _strip_protected_spans(f"{doc_title}\n{doc_subtitle}", allow_simulated=allow_simulated)
    if _CJK_BRACKET_RE.search(header_probe):
        push_error(
            "bracket_punctuation_residue",
            "formatting",
            "标题残留方头括号或直角引号",
            "报告主副标题存在方头括号或直角引号残留，须统一规范为中文弯双引号或无括号题名。",
            sec_title="报告标题",
            excerpt=doc_title or doc_subtitle,
        )
    if _STRAY_BRACE_RE.search(header_probe):
        push_error(
            "non_formula_brace_residue",
            "formatting",
            "标题残留非公式花括号",
            "报告主副标题出现裸露花括号，请移除模板占位痕迹。",
            sec_title="报告标题",
            excerpt=doc_title or doc_subtitle,
        )

    sections = payload.get("sections") if isinstance(payload.get("sections"), list) else []
    for sec in sections:
        if not isinstance(sec, dict):
            continue
        stitle = str(sec.get("title") or "正文").strip()
        sbody = str(sec.get("body") or "")
        stitle_probe = _strip_protected_spans(stitle, allow_simulated=allow_simulated)
        body_probe = _strip_protected_spans(sbody, allow_simulated=allow_simulated)

        if _CJK_BRACKET_RE.search(stitle_probe) or _CJK_BRACKET_RE.search(body_probe):
            if f"bracket_punctuation_residue:{_clean_msg(stitle)}" not in seen_keys:
                push_error(
                    "bracket_punctuation_residue",
                    "formatting",
                    "正文残留非学术括号标点",
                    f"“{_clean_msg(stitle)}”存在方头括号或直角引号残留，须统一替换为标准中文弯双引号或连贯句式。",
                    sec_title=stitle,
                )

        brace_m = _STRAY_BRACE_RE.search(body_probe)
        if brace_m:
            start = max(0, brace_m.start() - 12)
            end = min(len(body_probe), brace_m.end() + 18)
            push_error(
                "non_formula_brace_residue",
                "formatting",
                "正文残留非数学公式花括号",
                f"“{_clean_msg(stitle)}”出现非数学公式花括号残留，请清理未替换的变量或模板占位符。",
                sec_title=stitle,
                excerpt=body_probe[start:end],
            )

        zp_m = _ZERO_P_STRICT_RE.search(body_probe)
        if zp_m and f"zero_p_value_notation:{_clean_msg(stitle)}" not in seen_keys:
            push_error(
                "zero_p_value_notation",
                "statistics",
                "显著性概率缺少下界规范表述",
                f"“{_clean_msg(stitle)}”出现“{zp_m.group(0)}”写法，极小显著性概率须规范写作 p < 0.0001。",
                sec_title=stitle,
                excerpt=zp_m.group(0),
            )

        rho_m = _BARE_ASCII_RHO_RE.search(body_probe)
        if rho_m:
            push_error(
                "bare_ascii_rho_notation",
                "statistics",
                "相关系数符号未规范排版",
                f"“{_clean_msg(stitle)}”出现裸露英文“{rho_m.group(0)}”，正文统计符号应统一使用希腊字母 ρ。",
                sec_title=stitle,
                excerpt=rho_m.group(0),
            )

        for raw_line in body_probe.splitlines():
            line = raw_line.strip()
            if not line or line.startswith(("#", "|", ">", "---", "===")):
                continue
            if _ALLOWED_COLON_PREFIX_RE.match(line):
                continue
            colon_m = _DICT_COLON_PARA_RE.match(line)
            if colon_m:
                lead = colon_m.group(1)
                push_error(
                    "dictionary_colon_lead_in",
                    "prose_style",
                    "段落存在词典冒号起句痕迹",
                    f"“{_clean_msg(stitle)}”段首出现“{_clean_msg(lead)}”词典式冒号起句，请融合成主谓完整、逻辑连贯的学术句子。",
                    sec_title=stitle,
                    excerpt=line[:48],
                )
                break

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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="EVI-X Submission Preflight Gate CLI")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--json", type=Path, help="Path to EditorContent / payload JSON file")
    group.add_argument("--md", type=Path, help="Path to Markdown report file")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--edition", type=int, default=17)
    parser.add_argument("--no-blind", action="store_true", help="Disable blind-review leak check")
    parser.add_argument(
        "--allow-simulated",
        action="store_true",
        help="Allow the explicit teaching simulation sentinel header during rehearsal checks",
    )
    args = parser.parse_args(argv)

    if args.json:
        payload = json.loads(args.json.read_text(encoding="utf-8"))
        if "content" in payload and isinstance(payload["content"], dict):
            payload = payload["content"]
        if "quality" in payload and isinstance(payload["quality"], dict) and "results" not in payload:
            payload["results"] = payload["quality"].get("results", [])
    else:
        raw_md = args.md.read_text(encoding="utf-8")
        payload = _parse_markdown_report(raw_md, args.md.stem)

    payload = _hydrate_block_bodies(payload)
    payload.setdefault("expectedEdition", args.edition)
    payload.setdefault("requireBlindReview", not args.no_blind)
    base_res = run_preflight_audit(payload)
    res = _augment_typography_and_prose_checks(
        payload,
        base_res,
        allow_simulated=bool(args.allow_simulated),
    )

    if args.format == "json":
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        s = res["summary"]
        print(
            f"证见提交前合规预检 | 得分 {res['score']}/100 | "
            f"错误 {s['errors']} | 警告 {s['warnings']} | 提示 {s['infos']}"
        )
        for c in res["checks"]:
            loc = f"（{c['sectionTitle']}）" if c.get("sectionTitle") else ""
            print(f"  - ({c['severity'].upper()}) {c['title']}{loc} · {c['message']}")

    return 0 if res["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
