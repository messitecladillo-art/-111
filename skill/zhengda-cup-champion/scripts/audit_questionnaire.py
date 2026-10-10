#!/usr/bin/env python3
"""Audit a questionnaire specification stored as CSV or JSON."""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any


EXPECTED_FIELDS = {
    "question_id",
    "text",
    "question_type",
    "required",
    "construct",
    "variable",
    "scale",
    "options",
    "analysis_use",
    "source",
}


def load_rows(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".json":
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
        rows = payload.get("questions", payload) if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            raise ValueError("JSON must contain a list or a 'questions' list")
        return [dict(row) for row in rows]
    if path.suffix.lower() == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            return [dict(row) for row in csv.DictReader(handle)]
    raise ValueError("supported formats: .csv and .json")


def issue(level: str, code: str, question_id: str, message: str) -> dict[str, str]:
    return {"level": level, "code": code, "question_id": question_id, "message": message}


def audit(rows: list[dict[str, Any]]) -> dict[str, Any]:
    issues: list[dict[str, str]] = []
    if not rows:
        return {"summary": {"questions": 0, "errors": 1, "warnings": 0}, "issues": [
            issue("error", "empty_questionnaire", "", "Questionnaire contains no questions")
        ]}

    present_fields = set().union(*(row.keys() for row in rows))
    for field in sorted(EXPECTED_FIELDS - present_fields):
        issues.append(issue("warning", "missing_column", "", f"Recommended column missing: {field}"))

    ids = [str(row.get("question_id", "")).strip() for row in rows]
    duplicates = {item for item, count in Counter(ids).items() if item and count > 1}

    vague_time = re.compile(r"(最近|平时|经常|偶尔|有时|通常|近期)")
    explicit_time = re.compile(r"(过去|近|最近)\s*(一|二|三|四|五|六|七|八|九|十|\d+)\s*(天|周|个月|月|年)")
    leading = re.compile(r"(众所周知|显然|是不是|难道|您是否同意.*重要|您是否认为.*应该)")
    double_barrel = re.compile(r"(以及|并且|同时|和.{0,12}(?:是否|程度|满意|重要)|或.{0,12}(?:是否|程度|满意|重要))")

    for index, row in enumerate(rows, start=1):
        qid = str(row.get("question_id", "")).strip() or f"row-{index}"
        text = str(row.get("text", "")).strip()
        qtype = str(row.get("question_type", "")).strip().lower()
        construct = str(row.get("construct", "")).strip()
        variable = str(row.get("variable", "")).strip()
        scale = str(row.get("scale", "")).strip()
        options = str(row.get("options", "")).strip()
        analysis_use = str(row.get("analysis_use", "")).strip()
        source = str(row.get("source", "")).strip()

        if not str(row.get("question_id", "")).strip():
            issues.append(issue("error", "missing_id", qid, "Question ID is empty"))
        elif qid in duplicates:
            issues.append(issue("error", "duplicate_id", qid, "Question ID is duplicated"))
        if not text:
            issues.append(issue("error", "missing_text", qid, "Question text is empty"))
            continue
        if not qtype:
            issues.append(issue("warning", "missing_type", qid, "Question type is not specified"))
        if not variable:
            issues.append(issue("warning", "missing_variable", qid, "No analysis variable is mapped"))
        if not analysis_use and qtype not in {"instruction", "consent", "display"}:
            issues.append(issue("warning", "missing_analysis_use", qid, "No planned analysis or decision use is mapped"))
        if leading.search(text):
            issues.append(issue("warning", "leading_wording", qid, "Wording may lead the respondent"))
        if double_barrel.search(text):
            issues.append(issue("warning", "possible_double_barrel", qid, "Question may combine multiple judgments"))
        if vague_time.search(text) and not explicit_time.search(text):
            issues.append(issue("warning", "vague_reference_period", qid, "Use an explicit reference period where possible"))
        if "其他" in options and not re.search(r"其他.*(请说明|填空|____|___)", options):
            issues.append(issue("warning", "other_without_text", qid, "'Other' option may need a write-in field"))
        if qtype in {"likert", "matrix", "scale"}:
            option_count = len([part for part in re.split(r"[|;；]", options) if part.strip()])
            if not scale:
                issues.append(issue("warning", "scale_not_defined", qid, "Scale coding or anchors are not defined"))
            if options and option_count < 4:
                issues.append(issue("warning", "short_scale", qid, "Scale appears to contain fewer than four response points"))
            if construct and not source:
                issues.append(issue("warning", "scale_source_missing", qid, "Construct item has no source or adaptation note"))
        if qtype in {"open", "open-ended", "text"} and str(row.get("required", "")).strip().lower() in {"1", "true", "yes", "是"}:
            issues.append(issue("warning", "required_open_text", qid, "Required open text can increase burden and low-quality responses"))

    errors = sum(item["level"] == "error" for item in issues)
    warnings = sum(item["level"] == "warning" for item in issues)
    mapped = sum(bool(str(row.get("analysis_use", "")).strip()) for row in rows)
    return {
        "summary": {
            "questions": len(rows),
            "errors": errors,
            "warnings": warnings,
            "analysis_mapping_rate": round(mapped / len(rows), 4),
        },
        "issues": issues,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("questionnaire", help="CSV or JSON questionnaire specification")
    parser.add_argument("--output", help="Write the JSON audit result to this path")
    args = parser.parse_args()

    try:
        result = audit(load_rows(Path(args.questionnaire)))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 1 if result["summary"]["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
