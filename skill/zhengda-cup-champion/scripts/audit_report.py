#!/usr/bin/env python3
"""Audit a report draft for essential research and compliance signals."""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree


SECTION_SIGNALS = {
    "decision_problem": ["决策问题", "研究问题", "研究目的", "调研目的", "研究目标", "核心问题"],
    "desk_research": ["文案调查", "文献综述", "行业现状", "政策背景"],
    "qualitative_research": ["访谈", "焦点小组", "定性研究", "开放编码"],
    "sampling": ["目标总体", "抽样框", "抽样方法", "样本量"],
    "pilot": ["预测试", "预调查", "试填"],
    "fieldwork_quality": ["质量控制", "无效问卷", "调查实施", "数据清洗"],
    "measurement": ["信度", "效度", "量表"],
    "analysis": ["数据分析", "模型", "回归", "聚类", "检验"],
    "recommendations": ["对策建议", "策略建议", "实施路径", "营销策略", "优化路径", "优化建议", "改进建议", "政策建议"],
    "limitations": ["研究局限", "局限性", "不足与展望", "研究不足", "不足之处", "局限与展望"],
    "references": ["参考文献"],
    "ai_disclosure": ["AI工具使用", "人工智能工具使用", "生成式人工智能"],
    "data_provenance": ["原始数据", "数据来源", "数据可得性"],
}


def normalized_term_scan_text(value: Any, *, compact: bool = False) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = "".join(character for character in text if unicodedata.category(character) != "Cf")
    text = re.sub(r"\s+", " ", text).strip().casefold()
    return re.sub(r"\s+", "", text) if compact else text


REFERENCE_HEADING = re.compile(
    r"^\s*(?:#{1,6}\s*)?(?:第?[一二三四五六七八九十百0-9]+[章节、.]?\s*)?"
    r"(?:参考文献|references)\s*[:：]?\s*$",
    re.I,
)
REFERENCE_END_HEADING = re.compile(
    r"^\s*(?:#{1,6}\s*)?(?:第?[一二三四五六七八九十百0-9]+[章节、.]?\s*)?"
    r"(?:附录(?:\s*[A-Z0-9一二三四五六七八九十甲乙丙])?.*|appendix\b.*)$",
    re.I,
)
SUPPLEMENT_HEADING = re.compile(r"^\s*\[SUPPLEMENT:[^\]]+\]\s*$", re.I)


def without_reference_sections(text: str) -> str:
    """Remove bibliography blocks so titles are not mistaken for methods used here."""
    kept: list[str] = []
    in_references = False
    for line in text.splitlines():
        if SUPPLEMENT_HEADING.fullmatch(line):
            in_references = False
            kept.append(line)
            continue
        if REFERENCE_HEADING.fullmatch(line):
            in_references = True
            continue
        if in_references and REFERENCE_END_HEADING.match(line):
            in_references = False
            kept.append(line)
            continue
        if not in_references:
            kept.append(line)
    return "\n".join(kept)


def method_contract_issues(text: str, *, strict: bool = False) -> list[dict[str, Any]]:
    """Return review warnings when named methods lack their minimum evidence signals.

    They are review warnings by default. Final-stage callers can promote them to errors
    after combining the report with any registered supporting appendix.
    """
    issues: list[dict[str, Any]] = []

    analysis_text = without_reference_sections(text)
    clauses = [item.strip() for item in re.split(r"[。！？!?；;\n]+", analysis_text) if item.strip()]
    role_exclusion_context = re.compile(
        r"(未来(?:可|拟|将|考虑)|后续(?:可|拟|将|考虑)|建议(?:采用|使用|考虑)|"
        r"可考虑|计划采用|拟采用|将采用|既有研究|已有研究|相关研究|文献(?:中|综述|采用|使用)|"
        r"前人研究|他人研究)",
        re.I,
    )
    current_subject = r"(?:本研究|本文|本调研|本报告|我们|课题组|研究团队|调研团队)"
    affirmative_action = (
        r"(?:采用|使用|运用|应用|实施|进行|构建|建立|开展|执行|纳入|加入|设置|划分|"
        r"标准化|报告|计算|检验|估计|拟合|预测|分析|分类|得到|获得|选取|选择|确定|输出|"
        r"验证|测量|识别|呈现|按)"
    )

    def asserted_matches(
        pattern: str,
        *,
        allow_heading: bool = False,
        claim_pattern: bool = False,
    ) -> list[tuple[int, int, str]]:
        compiled = re.compile(pattern, re.I)
        negation_token = (
            r"(?:未|没有|尚未|缺少|缺乏|无法|不能|不可|不宜|不足以|不具备|"
            r"不(?:采用|使用|实施|进行|设置|报告|提供|检验|计算|划分|标准化|纳入|加入|作))"
        )
        local_negation_prefix = re.compile(
            negation_token + r"[^，,。；;\n]{0,16}$",
            re.I,
        )
        local_negation_suffix = re.compile(
            r"^[^，,。；;\n]{0,16}" + negation_token,
            re.I,
        )
        generic_current_nonuse = re.compile(
            current_subject
            + r"[^，,。；;\n]{0,28}(?:未|没有|尚未|不)[^，,。；;\n]{0,12}"
              r"(?:采用|使用|运用|应用|实施|进行|纳入|加入|设置|检验|作)"
              r"[^，,。；;\n]{0,10}(?:该|此|这一)?(?:方法|模型|主张)",
            re.I,
        )
        asserted: list[tuple[int, int, str]] = []
        for clause_index, clause in enumerate(clauses):
            # Evaluate the segment that contains the concrete method token.
            # This distinguishes "not KANO, but K-means" without allowing a
            # positive action elsewhere in the sentence to revive KANO.
            segments = [
                item.strip()
                for item in re.split(r"[，,]|而是|改用|转而|但是|但|而", clause)
                if item.strip()
            ]
            for segment_index, segment in enumerate(segments):
                affirmed = False
                for match in compiled.finditer(segment):
                    prefix = segment[:match.start()]
                    suffix = segment[match.end():]
                    if local_negation_prefix.search(prefix) or local_negation_suffix.search(suffix):
                        continue
                    local_prefix = prefix[-36:]
                    local_suffix = suffix[:36]
                    local_window = local_prefix + match.group(0) + local_suffix
                    direct_action = bool(re.search(affirmative_action, local_prefix + local_suffix, re.I))
                    current_use = bool(
                        re.search(
                            current_subject + r"[^。；;\n]{0,56}" + affirmative_action
                            + r"[^。；;\n]{0,20}" + pattern,
                            segment,
                            re.I,
                        )
                        or re.search(
                            current_subject + r"[^。；;\n]{0,56}" + pattern
                            + r"[^。；;\n]{0,20}" + affirmative_action,
                            segment,
                            re.I,
                        )
                    )
                    if generic_current_nonuse.search(clause) and not current_use:
                        continue
                    if role_exclusion_context.search(local_window) and not current_use:
                        continue
                    result_signal = bool(
                        re.search(r"(?:=|为|达到|降至|升至)\s*[-+]?\d", local_window, re.I)
                        or re.search(r"(?:结果|输出|见表|见图)[^。；;\n]{0,20}", local_window, re.I)
                    )
                    heading_signal = bool(
                        allow_heading
                        and len(segment) <= 28
                        and re.fullmatch(r"[（(【\[]?[^。；;\n]{0,24}(?:模型|分析|检验|回归|聚类)?[）)】\]]?", segment)
                    )
                    if not (claim_pattern or direct_action or current_use or result_signal or heading_signal):
                        continue
                    affirmed = True
                    break
                if not affirmed:
                    continue
                asserted.append((clause_index, segment_index, segment))
        return asserted

    def asserted_clauses(
        pattern: str,
        *,
        allow_heading: bool = False,
        claim_pattern: bool = False,
    ) -> list[str]:
        return [
            segment
            for _, _, segment in asserted_matches(
                pattern,
                allow_heading=allow_heading,
                claim_pattern=claim_pattern,
            )
        ]
    nonprobability_pattern = re.compile(r"(方便抽样|便利抽样|配额抽样|滚雪球抽样|自愿参与样本)", re.I)
    strong_population_inference_patterns = [
        re.compile(r"代表[^。；\n]{0,24}(?:全国|全市|武汉市|总体)", re.I),
        re.compile(r"(?:全国|全市|武汉市|总体)[^。；\n]{0,24}代表", re.I),
        re.compile(r"(?:推广|外推|泛化|适用)[^。；\n]{0,24}(?:全国|全市|武汉市|总体)", re.I),
        re.compile(r"(?:全国|全市|武汉市|总体)[^。；\n]{0,24}(?:推断|推论|推广|外推|泛化|适用)", re.I),
        re.compile(r"(?:总体推断|总体推论|普适性结论)", re.I),
        re.compile(r"(?:全国|全市|总体)[^。；\n]{0,30}(?:占|达到|为)", re.I),
        re.compile(r"(?:全国|全市|武汉市|总体)[^。；\n]{0,36}\d+(?:\.\d+)?\s*%", re.I),
        re.compile(r"\d+(?:\.\d+)?\s*%[^。；\n]{0,36}(?:全国|全市|武汉市|总体)", re.I),
    ]
    sampling_precision_patterns = [
        re.compile(r"抽样误差", re.I),
        re.compile(r"误差(?:控制)?在?\s*\d", re.I),
        # Keep coefficient confidence intervals out. A confidence *level* is
        # sampling precision only when the same clause also names error,
        # precision, sampling, or sample-size calculation.
        re.compile(
            r"(?=[^。；\n]{0,80}(?:95\s*%?\s*置信水平))"
            r"(?=[^。；\n]{0,80}(?:误差|精度|抽样|样本量))[^。；\n]+",
            re.I,
        ),
    ]
    negation_scope = re.compile(
        r"(?:不|未|无法|不能|不可|不宜|并非|不应|不足以|不具备|限制(?:了)?|局限(?:于)?|"
        r"仅限(?:于)?|谨慎(?:解释|外推|推广)?)[^，,。；;\n]{0,24}$",
        re.I,
    )

    def affirmed_population_inference(clause: str, patterns: list[re.Pattern[str]]) -> bool:
        segments = [
            item.strip()
            for item in re.split(r"但是|然而|不过|但|却|而是", clause)
            if item.strip()
        ]
        for segment in segments:
            for pattern in patterns:
                for match in pattern.finditer(segment):
                    prefix = segment[:match.start()]
                    if negation_scope.search(prefix):
                        continue
                    if re.search(r"抽样误差[^，,。；;\n]{0,8}(?:无法|不能|不可|不宜)(?:估计|计算|报告)", segment, re.I):
                        continue
                    return True
        return False

    nonprobability_use = asserted_clauses(
        nonprobability_pattern.pattern,
        allow_heading=True,
    )
    # Strong population claims and sampling-precision language remain unsafe
    # even when the sampling description and conclusion are in distant chapters.
    # The narrower precision pattern avoids conflating regression CIs with a
    # probability-sampling claim.
    nonprobability_inference = bool(
        nonprobability_use
        and (
            any(affirmed_population_inference(item, strong_population_inference_patterns) for item in clauses)
            or any(affirmed_population_inference(item, sampling_precision_patterns) for item in clauses)
        )
    )
    if nonprobability_inference:
        issues.append({
            "level": "warning",
            "code": "nonprobability_inference_guard",
            "message": "Non-probability sampling appears with probability-sample precision or population-inference language; verify or downgrade the claim",
        })

    if asserted_clauses(r"KANO", allow_heading=True):
        kano_signals = {
            "functional_question": asserted_clauses(r"(正向题|正向问题|功能型问题|具备该功能)"),
            "dysfunctional_question": asserted_clauses(r"(反向题|反向问题|非功能型问题|不具备该功能)"),
            "evaluation_matrix": asserted_clauses(r"(KANO.{0,8}评价矩阵|二维评价矩阵|Better.{0,8}Worse|Worse.{0,8}Better)"),
        }
        missing = [key for key, signal in kano_signals.items() if not signal]
        if missing:
            issues.append({
                "level": "warning",
                "code": "kano_contract_incomplete",
                "message": "KANO is named without all paired-question and evaluation-matrix signals: " + ", ".join(missing),
            })

    if asserted_clauses(r"(K[ -]?means|K均值|聚类分析)", allow_heading=True):
        cluster_checks = {
            "preprocessing": asserted_clauses(r"(标准化|归一化|缺失值处理)"),
            "selection": asserted_clauses(r"(轮廓系数|肘部法|AIC|BIC|Entropy|AvePP|类别数选择)"),
            "stability": asserted_clauses(r"(随机种子|稳定性|重抽样|bootstrap|敏感性)"),
        }
        missing = [key for key, signal in cluster_checks.items() if not signal]
        if missing:
            issues.append({
                "level": "warning",
                "code": "clustering_contract_incomplete",
                "message": "Clustering is named without all preprocessing, class-selection, and stability signals: " + ", ".join(missing),
            })

    predictive_model = asserted_clauses(
        r"(机器学习|XGBoost|随机森林|GradientBoosting|预测模型)",
        allow_heading=True,
    )
    predictive_claim = asserted_clauses(r"(预测|提升|转化率|收入|流失)", claim_pattern=True)
    if predictive_model and predictive_claim:
        validation_signals = {
            "holdout": asserted_clauses(r"(训练集|测试集|留出集|交叉验证|out[- ]?of[- ]?sample|held[- ]?out)"),
            "performance": asserted_clauses(r"(AUC|准确率|精确率|召回率|F1|RMSE|MAE|校准)"),
        }
        missing = [key for key, signal in validation_signals.items() if not signal]
        if missing:
            issues.append({
                "level": "warning",
                "code": "predictive_model_contract_incomplete",
                "message": "A predictive model claim lacks held-out validation or performance signals: " + ", ".join(missing),
            })

    if asserted_clauses(r"(倒\s*U\s*型|U\s*型关系|曲线关系)", claim_pattern=True) and not asserted_clauses(
        r"(二次项|平方项|二次回归|分段回归|样条|拐点检验)", allow_heading=True
    ):
        issues.append({
            "level": "warning",
            "code": "nonlinear_claim_without_model_signal",
            "message": "A nonlinear relationship is claimed without a nonlinear-model or turning-point signal",
        })

    mediation_claim = asserted_clauses(
        r"(完全中介|部分中介|中介效应|中介作用|间接作用|完全解释)",
        claim_pattern=True,
    )
    if mediation_claim and not asserted_clauses(r"(间接效应|Bootstrap|置信区间|PROCESS|结构方程|中介模型)"):
        issues.append({
            "level": "warning",
            "code": "mediation_contract_incomplete",
            "message": "Mediation or complete-explanation language appears without a formal indirect-effect test signal",
        })

    scenario_matches = asserted_matches(
        r"(模拟情景|情景假设|假设[^。；\n]{0,30}\d+\s*%|置为\s*0|全部获得)",
        claim_pattern=True,
    )
    realized_matches = asserted_matches(
        r"(验证了|已经实现|直接提升|实际提升|必将提升)",
        claim_pattern=True,
    )
    scenario_indicators = {
        "收入", "痛点", "转化率", "就业率", "满意度", "用户", "客流", "参与率",
        "消费", "复购", "销量", "留存", "流失", "成本", "收益", "绩效", "需求",
    }
    scenario_overclaim = False
    for scenario_clause, scenario_segment_index, scenario_segment in scenario_matches:
        for realized_clause, realized_segment_index, realized_segment in realized_matches:
            same_segment = (
                scenario_clause == realized_clause
                and scenario_segment_index == realized_segment_index
            )
            coreference = bool(
                re.search(r"(该情景|上述情景|该假设|上述假设|由此|据此)", realized_segment)
            )
            shared_indicator = bool(
                {token for token in scenario_indicators if token in scenario_segment}
                & {token for token in scenario_indicators if token in realized_segment}
            )
            same_clause_linked = (
                scenario_clause == realized_clause
                and abs(scenario_segment_index - realized_segment_index) == 1
                and (
                    coreference
                    or shared_indicator
                    or bool(re.match(r"\s*(?:验证了|已经实现|直接提升|实际提升|必将提升)", realized_segment))
                )
            )
            adjacent_clause_linked = (
                abs(scenario_clause - realized_clause) == 1
                and (coreference or shared_indicator)
            )
            if same_segment or same_clause_linked or adjacent_clause_linked:
                scenario_overclaim = True
                break
        if scenario_overclaim:
            break
    if scenario_overclaim:
        issues.append({
            "level": "warning",
            "code": "scenario_presented_as_realized",
            "message": "A simulated or assumed scenario appears to be described as validated or realized",
        })

    causal_claims = asserted_clauses(
        r"(导致|造成|促进了|提升了|降低了|产生[^。；\n]{0,20}影响|因果效应)",
        claim_pattern=True,
    )
    causal_designs = asserted_clauses(
        r"(随机实验|双重差分|断点回归|工具变量|倾向得分|中断时间序列|因果识别)",
    )
    if causal_claims and not causal_designs:
        issues.append({
            "level": "warning",
            "code": "causal_language_without_design_signal",
            "message": f"Found {len(causal_claims)} causal-language signals but no asserted causal-design signal",
        })

    if strict:
        for item in issues:
            item["level"] = "error"
    return issues


def extract_docx(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        xml = archive.read("word/document.xml")
    root = ElementTree.fromstring(xml)
    paragraphs: list[str] = []
    for paragraph in root.iter():
        if paragraph.tag.rsplit("}", 1)[-1] != "p":
            continue
        fragments: list[str] = []
        for node in paragraph.iter():
            tag = node.tag.rsplit("}", 1)[-1]
            if tag in {"t", "delText"} and node.text:
                fragments.append(node.text)
            elif tag == "tab":
                fragments.append("\t")
            elif tag in {"br", "cr"}:
                fragments.append("\n")
        paragraphs.append("".join(fragments))
    if paragraphs:
        return "\n".join(paragraphs)
    return "".join(node.text or "" for node in root.iter() if node.tag.rsplit("}", 1)[-1] == "t")


def extract_pdf(path: Path) -> tuple[str, int]:
    try:
        from pypdf import PdfReader  # type: ignore
    except ImportError as exc:
        raise ValueError("PDF audit requires pypdf; audit the DOCX/Markdown source or install pypdf") from exc
    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages), len(reader.pages)


def extract_text(path: Path) -> tuple[str, int | None]:
    suffix = path.suffix.lower()
    if suffix in {".md", ".txt", ".py", ".r", ".do", ".jl", ".sql", ".json", ".ipynb"}:
        return path.read_text(encoding="utf-8-sig"), None
    if suffix == ".docx":
        return extract_docx(path), None
    if suffix == ".pdf":
        return extract_pdf(path)
    raise ValueError("supported formats: .md, .txt, .docx, .pdf, and text code/notebook formats")


def audit(
    text: str,
    page_count: int | None,
    page_limit: int | None,
    banned_terms: list[str],
    *,
    strict_methods: bool = False,
) -> dict[str, Any]:
    compact = re.sub(r"\s+", "", text)
    issues: list[dict[str, Any]] = []
    sections: dict[str, bool] = {}
    for key, signals in SECTION_SIGNALS.items():
        found = any(signal in text for signal in signals)
        sections[key] = found
        if not found:
            level = "warning"
            if key in {"sampling", "fieldwork_quality", "analysis", "recommendations", "limitations"}:
                level = "error"
            issues.append({
                "level": level,
                "code": f"missing_{key}",
                "message": f"No clear section signal found for {key}: {', '.join(signals)}",
            })

    if page_limit is not None:
        if page_count is None:
            issues.append({"level": "warning", "code": "page_count_unavailable", "message": "Page limit supplied but source has no reliable page count"})
        elif page_count > page_limit:
            issues.append({"level": "error", "code": "page_limit_exceeded", "message": f"PDF has {page_count} pages; limit is {page_limit}"})

    folded_text = normalized_term_scan_text(text)
    compact_folded_text = normalized_term_scan_text(text, compact=True)
    for term in banned_terms:
        normalized_term = term.strip()
        if not normalized_term:
            continue
        normalized_scan_term = normalized_term_scan_text(normalized_term)
        compact_scan_term = normalized_term_scan_text(normalized_term, compact=True)
        count = folded_text.count(normalized_scan_term)
        if compact_scan_term:
            count = max(count, compact_folded_text.count(compact_scan_term))
        if count:
            issues.append({"level": "error", "code": "banned_identity_term", "message": f"Banned identity term appears {count} time(s): {normalized_term}"})

    issues.extend(method_contract_issues(text, strict=strict_methods))

    citations = len(re.findall(r"\[[0-9]+\]|（[^（）]{1,30},?\s*20\d{2}[a-z]?）|\([^()]{1,30},?\s*20\d{2}[a-z]?\)", text))
    if citations == 0:
        issues.append({"level": "warning", "code": "no_intext_citation_signal", "message": "No recognizable in-text citation marker was found"})

    percentages = re.findall(r"(?<![\d.])\d+(?:\.\d+)?%", text)
    sample_counts = re.findall(r"(?:有效样本|有效问卷|样本量|共回收|共获得)[^。；\n]{0,20}?(\d+)\s*(?:份|个|人|条)?", text)

    return {
        "summary": {
            "characters_no_space": len(compact),
            "page_count": page_count,
            "errors": sum(item["level"] == "error" for item in issues),
            "warnings": sum(item["level"] == "warning" for item in issues),
            "citation_signals": citations,
            "percentage_mentions": len(percentages),
            "sample_count_mentions": sorted(set(sample_counts)),
        },
        "section_signals": sections,
        "issues": issues,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", help="Report in Markdown, text, DOCX, or PDF format")
    parser.add_argument("--page-limit", type=int)
    parser.add_argument("--banned-term", action="append", default=[], help="Identity term that must not appear; repeat as needed")
    parser.add_argument("--strict-methods", action="store_true", help="Promote incomplete high-risk method contracts to errors")
    parser.add_argument("--supplement", action="append", default=[], help="Registered appendix or code disclosure to include in method-contract review")
    parser.add_argument("--output")
    args = parser.parse_args()

    try:
        text, page_count = extract_text(Path(args.report))
        for supplement in args.supplement:
            supplement_text, _ = extract_text(Path(supplement))
            text += f"\n\n[SUPPLEMENT: {Path(supplement).name}]\n{supplement_text}"
        result = audit(
            text,
            page_count,
            args.page_limit,
            args.banned_term,
            strict_methods=args.strict_methods,
        )
    except (OSError, ValueError, zipfile.BadZipFile, ElementTree.ParseError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 1 if result["summary"]["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
