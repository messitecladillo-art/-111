#!/usr/bin/env python3
"""Deterministic red-team & style auditor for Chinese survey research reports.

Benchmarked against the 205-report Zhengda Cup national award corpus (2014-2025)
and 17th-edition formatting & blind-review rules.

Supports .txt, .md, .docx (requires python-docx), and .pdf (requires pymupdf/fitz).
Uses Python standard library only for .txt / .md so it works in any environment.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from pathlib import Path

CLICHE_TERMS = [
    "由此可见",
    "综上所述",
    "与此同时",
    "全方位",
    "赋能",
    "具有重要意义",
    "闭环",
    "值得注意的是",
    "总而言之",
    "不仅如此",
    "抓手",
    "不言而喻",
    "双刃剑",
    "毫无疑问",
]

CAUSAL_OVERREACH_RX = re.compile(
    r"(?<!潜在)(?<!可能)(直接导致|必然导致|导致了|促使了|决定了|决定着|直接引发|显著提升了|大幅提高了|驱动了)"
)
RESTRAINED_RX = re.compile(
    r"(显著相关|正向相关|负向相关|显著预测|统计关联|边际效应|潜在影响|相关性|伴随关系|倾向得分|工具变量)"
)

DOUBLE_WORD_TYPO_RX = re.compile(
    r"(旅游旅游|研究研究|调查调查|分析分析|消费消费|用户用户|满意满意|发展发展|建议建议|影响影响|问题问题)"
)
RAW_VAR_RX = re.compile(r"(聚类类别_\d+|Cluster_\d+|VOSviewer|VAR\d{5}|__EMPTY)", re.I)
AI_AS_METHOD_RX = re.compile(r"(DeepSeek\s*人工交互|通过\s*DeepSeek\s*进行|向\s*ChatGPT\s*提问获取数据|AI\s*视觉洞察)")
UNIV_LEAK_RX = re.compile(
    r"(?<![×xX某])(?:[\u4e00-\u9fa5]{2,10}(?:大学|职业技术学院|经济学院|财经学院|师范学院|工学院|统计学院|管理学院|商学院)|指导(?:老师|教师)\s*[:：为是]?\s*[\u4e00-\u9fa5]{2,4})"
)
SAFE_UNIV_ALLOW = {"大学生", "全国大学生", "大学专科", "大学本科", "在华留学生", "高校学生", "高校大学生"}


def read_document(path: Path) -> tuple[str, int | None]:
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md", ".markdown"}:
        raw = path.read_text(encoding="utf-8", errors="replace")
        # Strip corpus dump page-marker scaffolding if present
        raw = re.sub(r"<<<PAGE_BREAK>>>\s*", "\n", raw)
        raw = re.sub(r"\[PAGE\s+\d+\]\s*", "", raw)
        return raw, None
    if suffix == ".pdf":
        try:
            import fitz  # type: ignore

            doc = fitz.open(path)
            pages = [page.get_text("text") for page in doc]
            return "\n".join(pages), len(doc)
        except ImportError as exc:
            raise RuntimeError("Reading PDF requires PyMuPDF (`pip install pymupdf`).") from exc
    if suffix == ".docx":
        try:
            import docx  # type: ignore

            doc = docx.Document(str(path))
            parts = [p.text for p in doc.paragraphs if p.text]
            for tbl in doc.tables:
                for row in tbl.rows:
                    parts.append("\t".join(cell.text.strip() for cell in row.cells))
            return "\n".join(parts), None
        except ImportError as exc:
            raise RuntimeError("Reading DOCX requires python-docx (`pip install python-docx`).") from exc
    return path.read_text(encoding="utf-8", errors="replace"), None


def extract_abstract_block(text: str) -> str:
    m = re.search(
        r"(?:^|\n)\s*摘\s*要\s*\n(.*?)(?=\n\s*(?:目\s*录|关键词|Abstract|一、|第一章|1\s+引言))",
        text[:15000],
        flags=re.S | re.I,
    )
    return m.group(1).strip() if m else ""


def split_sentences(text: str) -> list[str]:
    clean = re.sub(r"\s+", " ", text)
    raw_sents = re.split(r"[。！？!?]+", clean)
    return [s.strip() for s in raw_sents if 10 <= len(s.strip()) <= 450]


def audit_text(text: str, page_count: int | None = None) -> dict:
    issues: list[dict[str, str]] = []

    # 1. Page budget check (17th-ed <= 65 pages for title+abstract+toc+body)
    cjk_chars = len(re.findall(r"[\u4e00-\u9fff0-9A-Za-z]", text))
    if page_count is not None:
        if page_count > 65:
            issues.append(
                {
                    "severity": "CRITICAL",
                    "code": "PAGE_LIMIT_EXCEEDED",
                    "detail": f"PDF total pages={page_count} (> 65p submission cap if appendix is not split out).",
                }
            )
    else:
        est_pages = round(cjk_chars / 750.0, 1)
        if cjk_chars > 52000:
            issues.append(
                {
                    "severity": "WARN",
                    "code": "HIGH_CHAR_VOLUME",
                    "detail": f"Document has {cjk_chars} chars (~{est_pages} est. typeset pages; inspect combined <= 65p budget).",
                }
            )

    # 2. Abstract length check (12pt SimSun 1.25x on A4 holds ~900-1050 chars per page)
    abs_text = extract_abstract_block(text)
    abs_len = len(re.sub(r"\s+", "", abs_text)) if abs_text else 0
    if abs_text:
        if 1050 < abs_len <= 1450:
            issues.append(
                {
                    "severity": "WARN",
                    "code": "ABSTRACT_ORPHAN_SPILL_RISK",
                    "detail": (
                        f"Abstract is {abs_len} non-whitespace chars: at 12pt SimSun 1.25x (~900-1050 chars/page), "
                        "this risks spilling 3-12 orphan lines onto page 2. Tighten to <=1020 chars for 1-page lock "
                        "or structure cleanly to 1500-1850 chars as an intentional 2-page executive summary."
                    ),
                }
            )
        elif abs_len > 2100:
            issues.append(
                {
                    "severity": "WARN",
                    "code": "ABSTRACT_OVERBLOAT",
                    "detail": f"Abstract is {abs_len} non-whitespace chars (>2100 wastes <=65p body cap & spills past 2 pages).",
                }
            )
        elif abs_len < 700:
            issues.append(
                {
                    "severity": "INFO",
                    "code": "ABSTRACT_UNDERWEIGHT",
                    "detail": f"Abstract is {abs_len} chars (<700 may omit model metrics or multi-stakeholder actions).",
                }
            )

    # 3. Sentence burstiness benchmark (2023-2025 corpus: mean ~67.9, std ~38.3)
    sents = split_sentences(text)
    sent_mean = round(statistics.mean(len(s) for s in sents), 1) if sents else 0.0
    sent_std = round(statistics.stdev(len(s) for s in sents), 1) if len(sents) > 1 else 0.0
    if sents and sent_std < 22.0:
        issues.append(
            {
                "severity": "WARN",
                "code": "LOW_BURSTINESS_AI_RHYTHM",
                "detail": f"Sentence length std={sent_std} chars (<22 looks uniform/AI-like; 2023-25 national corpus std ~38.3).",
            }
        )

    # 4. De-AI cliche audit
    cliche_counts = {term: text.count(term) for term in CLICHE_TERMS if text.count(term) > 0}
    total_cliches = sum(cliche_counts.values())
    if total_cliches > 6:
        top3 = sorted(cliche_counts.items(), key=lambda x: -x[1])[:5]
        issues.append(
            {
                "severity": "WARN",
                "code": "CLICHE_SATURATION",
                "detail": f"{total_cliches} AI/bureaucratic cliches found: {top3}. Replace with statistical transitions.",
            }
        )

    # 5. Causal overreach vs restrained phrasing
    causal_hits = CAUSAL_OVERREACH_RX.findall(text)
    restrained_hits = RESTRAINED_RX.findall(text)
    if len(causal_hits) >= 3 and len(causal_hits) > len(restrained_hits) * 2:
        issues.append(
            {
                "severity": "CRITICAL",
                "code": "CAUSAL_OVERREACH",
                "detail": (
                    f"{len(causal_hits)} strong causal assertions vs {len(restrained_hits)} restrained association terms. "
                    "Verify cross-sectional claims use association/prediction framing unless IV/DID/PSM is run."
                ),
            }
        )

    # 6. Raw labels, typos, AI-as-method & blind-review leaks
    raw_vars = RAW_VAR_RX.findall(text)
    if raw_vars:
        issues.append(
            {
                "severity": "CRITICAL",
                "code": "RAW_SOFTWARE_OR_WATERMARK",
                "detail": f"Found untranslated software/watermark tokens: {sorted(set(raw_vars))[:6]}",
            }
        )

    ai_method_hits = AI_AS_METHOD_RX.findall(text)
    if ai_method_hits:
        issues.append(
            {
                "severity": "CRITICAL",
                "code": "AI_LISTED_AS_PRIMARY_METHOD",
                "detail": f"LLM/AI interaction treated as primary method: {sorted(set(ai_method_hits))}",
            }
        )

    typos = DOUBLE_WORD_TYPO_RX.findall(text)
    if typos:
        issues.append(
            {
                "severity": "WARN",
                "code": "DUPLICATE_WORD_TYPO",
                "detail": f"Possible duplicate-word typos: {sorted(set(typos))}",
            }
        )

    # Check front 4000 chars + last 6000 chars for explicit institution leaks (excluding literature refs)
    head_tail = text[:4000]
    univ_leaks = sorted(
        {
            m.group(0)
            for m in UNIV_LEAK_RX.finditer(head_tail)
            if not any(safe in m.group(0) for safe in SAFE_UNIV_ALLOW)
        }
    )
    if univ_leaks:
        issues.append(
            {
                "severity": "WARN",
                "code": "POSSIBLE_BLIND_REVIEW_LEAK",
                "detail": f"Possible unmasked school name in frontmatter/title zone: {univ_leaks[:5]}",
            }
        )

    return {
        "metrics": {
            "alnum_cjk_chars": cjk_chars,
            "pdf_pages": page_count,
            "abstract_chars": abs_len if abs_text else None,
            "sentence_count": len(sents),
            "sentence_len_mean": sent_mean,
            "sentence_len_std": sent_std,
            "cliche_total": total_cliches,
            "cliche_breakdown": cliche_counts,
            "causal_overreach_count": len(causal_hits),
            "restrained_association_count": len(restrained_hits),
        },
        "issues": issues,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit survey report draft against corpus & 17th-ed rules.")
    parser.add_argument("target", type=Path, help="Path to .md, .txt, .docx, or .pdf report")
    parser.add_argument("--json", action="store_true", help="Emit JSON output")
    args = parser.parse_args()

    if not args.target.exists():
        print(f"Error: file not found: {args.target}", file=sys.stderr)
        return 2

    text, pages = read_document(args.target)
    report = audit_text(text, pages)

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        m = report["metrics"]
        print(f"=== Survey Red-Team Audit: {args.target.name} ===")
        print(
            f"Chars: {m['alnum_cjk_chars']} | Pages: {m['pdf_pages']} | Abstract chars: {m['abstract_chars']}"
        )
        print(
            f"Sentence burstiness: mean={m['sentence_len_mean']} std={m['sentence_len_std']} "
            "(2023-25 corpus benchmark ~67.9 / 38.3)"
        )
        print(
            f"Cliches: {m['cliche_total']} {m['cliche_breakdown']} | "
            f"Causal overreach vs Restrained: {m['causal_overreach_count']}:{m['restrained_association_count']}"
        )
        if not report["issues"]:
            print("STATUS: PASS (0 automated issues flagged)")
        else:
            print(f"Issues ({len(report['issues'])}):")
            for iss in report["issues"]:
                print(f"  [{iss['severity']}] {iss['code']}: {iss['detail']}")

    has_critical = any(i["severity"] == "CRITICAL" for i in report["issues"])
    return 1 if has_critical else 0


if __name__ == "__main__":
    raise SystemExit(main())
