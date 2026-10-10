#!/usr/bin/env python3
"""Check claim-to-evidence coverage in an evidence ledger CSV."""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any


REQUIRED_COLUMNS = [
    "claim_id",
    "claim",
    "content_class",
    "population",
    "analysis_sample_n",
    "numerator",
    "denominator",
    "unit",
    "reported_value",
    "evidence_source",
    "data_field",
    "transformation",
    "method",
    "result",
    "limitation",
    "output_location",
    "confidence",
    "status",
]

ALLOWED_STATUS = {"draft", "verified", "rejected", "needs_evidence", "superseded"}
ALLOWED_CONTENT_CLASS = {"actual", "inferred", "simulated", "proposed"}
UNIT_ALIASES = {
    "pct": "percent",
    "percentage": "percent",
    "百分比": "percent",
    "百分数": "percent",
    "比例": "proportion",
    "percentage_points": "percentage_point",
    "percentage-point": "percentage_point",
    "percentage-points": "percentage_point",
    "百分点": "percentage_point",
}
FACT_COLUMNS = {
    "content_class",
    "population",
    "analysis_sample_n",
    "numerator",
    "denominator",
    "unit",
    "reported_value",
}


def decimal_value(raw: str) -> Decimal | None:
    value = raw.strip().replace(",", "").replace("％", "%").removesuffix("%").strip()
    if not value:
        return None
    try:
        number = Decimal(value)
    except InvalidOperation:
        return None
    return number if number.is_finite() else None


def rounding_tolerance(reported: Decimal) -> Decimal:
    """Allow half of the reported value's last displayed decimal place."""
    step = Decimal(1).scaleb(reported.as_tuple().exponent)
    return abs(step) / Decimal(2) + Decimal("1e-12")


def audit(path: Path, *, strict: bool = False) -> dict[str, Any]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = list(reader.fieldnames or [])
        rows = [dict(row) for row in reader]

    issues: list[dict[str, Any]] = []
    if not rows:
        issues.append({
            "level": "error",
            "code": "empty_evidence_ledger",
            "message": "Evidence ledger contains a header but no claim rows",
        })
    duplicate_columns = {
        column for column, count in Counter(fields).items() if column and count > 1
    }
    for column in sorted(duplicate_columns):
        issues.append({"level": "error", "code": "duplicate_column", "message": f"Column is duplicated: {column}"})
    for column in REQUIRED_COLUMNS:
        if column not in fields:
            issues.append({"level": "error", "code": "missing_column", "message": f"Required column missing: {column}"})

    ids = [str(row.get("claim_id", "")).strip() for row in rows]
    duplicates = {item for item, count in Counter(ids).items() if item and count > 1}
    complete = 0
    verified = 0
    fact_contract_enabled = FACT_COLUMNS <= set(fields)
    for index, row in enumerate(rows, start=2):
        claim_id = str(row.get("claim_id", "")).strip() or f"csv-row-{index}"
        extra_values = row.get(None)
        if isinstance(extra_values, list) and any(str(item or "").strip() for item in extra_values):
            issues.append({
                "level": "error",
                "code": "extra_csv_fields",
                "claim_id": claim_id,
                "message": f"CSV row has {len(extra_values)} value(s) beyond the declared header",
            })
        missing_cells = [field for field in fields if row.get(field) is None]
        if missing_cells:
            issues.append({
                "level": "error",
                "code": "missing_csv_fields",
                "claim_id": claim_id,
                "message": "CSV row ends before declared field(s): " + ", ".join(missing_cells),
            })
        if not str(row.get("claim_id", "")).strip():
            issues.append({"level": "error", "code": "missing_claim_id", "claim_id": claim_id, "message": "Claim ID is empty"})
        elif claim_id in duplicates:
            issues.append({"level": "error", "code": "duplicate_claim_id", "claim_id": claim_id, "message": "Claim ID is duplicated"})

        critical = [
            "claim", "evidence_source", "data_field", "transformation",
            "method", "result", "limitation", "output_location",
        ]
        missing = [column for column in critical if not str(row.get(column, "")).strip()]
        if missing:
            issues.append({
                "level": "warning",
                "code": "incomplete_trace",
                "claim_id": claim_id,
                "message": f"Missing trace fields: {', '.join(missing)}",
            })
        else:
            complete += 1

        status = str(row.get("status", "")).strip().lower()
        if not status:
            issues.append({
                "level": "error",
                "code": "missing_status",
                "claim_id": claim_id,
                "message": "Claim status is empty",
            })
        elif status not in ALLOWED_STATUS:
            issues.append({
                "level": "error",
                "code": "unknown_status",
                "claim_id": claim_id,
                "message": f"Unknown status: {status}",
            })
        if strict and str(row.get("output_location", "")).strip() and status != "verified":
            issues.append({
                "level": "error",
                "code": "unverified_claim_in_final_output",
                "claim_id": claim_id,
                "message": "Every claim referenced by a final output must have status=verified",
            })
        if status == "verified":
            verified += 1
            if missing:
                issues.append({
                    "level": "error",
                    "code": "verified_but_incomplete",
                    "claim_id": claim_id,
                    "message": "Verified claim has an incomplete trace",
                })

        if fact_contract_enabled:
            content_class = str(row.get("content_class", "")).strip().lower()
            if content_class and content_class not in ALLOWED_CONTENT_CLASS:
                issues.append({
                    "level": "error",
                    "code": "invalid_content_class",
                    "claim_id": claim_id,
                    "message": f"Unknown content class: {content_class}",
                })
            if status == "verified" and not content_class:
                issues.append({
                    "level": "error",
                    "code": "verified_without_content_class",
                    "claim_id": claim_id,
                    "message": "Verified claim must be labeled actual, inferred, simulated, or proposed",
                })

            claim_text = " ".join(str(row.get(key, "")) for key in ("claim", "result", "recommendation"))
            unit_raw = str(row.get("unit", "")).strip().lower()
            unit = UNIT_ALIASES.get(unit_raw, unit_raw)
            reported_raw = str(row.get("reported_value", "")).strip()
            reported = decimal_value(reported_raw)
            if reported_raw and reported is None:
                issues.append({
                    "level": "error", "code": "invalid_reported_value", "claim_id": claim_id,
                    "message": f"Reported value is not a finite number: {reported_raw}",
                })

            numerator_raw = str(row.get("numerator", "")).strip()
            denominator_raw = str(row.get("denominator", "")).strip()
            percentage_point_signal = bool(
                unit == "percentage_point" or re.search(r"百分点", claim_text)
            )
            quantitative_signal = bool(
                re.search(r"(?:\d|%|％|百分|占比|比例|均值|系数|金额|收入|样本量|转化率)", claim_text)
                or reported_raw
                or numerator_raw
                or denominator_raw
            )
            ratio_signal = bool(not percentage_point_signal and (
                re.search(r"(?:%|％|百分|占比|比例|转化率|发生率|有效率|复购率)", claim_text)
                or unit in {"percent", "percentage", "%", "proportion", "ratio"}
            ))
            if status == "verified" and quantitative_signal:
                required_fact_fields = ["population", "analysis_sample_n", "unit", "reported_value"]
                missing_fact_fields = [field for field in required_fact_fields if not str(row.get(field, "")).strip()]
                if missing_fact_fields:
                    issues.append({
                        "level": "error",
                        "code": "verified_quantitative_fact_incomplete",
                        "claim_id": claim_id,
                        "message": "Verified quantitative claim is missing: " + ", ".join(missing_fact_fields),
                    })
                if ratio_signal and (not numerator_raw or not denominator_raw):
                    issues.append({
                        "level": "error",
                        "code": "verified_ratio_without_denominator",
                        "claim_id": claim_id,
                        "message": "Verified percentage, proportion, ratio, or rate claim requires numerator and denominator",
                    })
                if percentage_point_signal:
                    if unit != "percentage_point":
                        issues.append({
                            "level": "error",
                            "code": "percentage_point_unit_mismatch",
                            "claim_id": claim_id,
                            "message": "Percentage-point change must use unit=percentage_point; document both comparison bases in the trace",
                        })
                elif re.search(r"(?:%|％|百分|占比|比例|转化率|发生率|有效率|复购率)", claim_text) and unit not in {
                    "percent", "percentage", "%", "proportion", "ratio"
                }:
                    issues.append({
                        "level": "error",
                        "code": "percentage_unit_mismatch",
                        "claim_id": claim_id,
                        "message": "Percentage-like claim must use an explicit percent, proportion, or ratio unit",
                    })

            point_basis_fields = {
                field: str(row.get(field, "")).strip()
                for field in (
                    "baseline_numerator", "baseline_denominator", "baseline_value",
                    "current_numerator", "current_denominator", "current_value",
                )
            }
            if percentage_point_signal:
                baseline_count_complete = bool(
                    point_basis_fields["baseline_numerator"] and point_basis_fields["baseline_denominator"]
                )
                current_count_complete = bool(
                    point_basis_fields["current_numerator"] and point_basis_fields["current_denominator"]
                )
                any_count_basis = any(
                    point_basis_fields[field]
                    for field in (
                        "baseline_numerator", "baseline_denominator",
                        "current_numerator", "current_denominator",
                    )
                )
                value_basis_complete = bool(
                    point_basis_fields["baseline_value"] and point_basis_fields["current_value"]
                )
                any_value_basis = bool(
                    point_basis_fields["baseline_value"] or point_basis_fields["current_value"]
                )
                if any_count_basis and not (baseline_count_complete and current_count_complete):
                    issues.append({
                        "level": "error", "code": "incomplete_percentage_point_count_basis", "claim_id": claim_id,
                        "message": "Percentage-point count basis requires baseline and current numerator/denominator pairs",
                    })
                if any_value_basis and not value_basis_complete:
                    issues.append({
                        "level": "error", "code": "incomplete_percentage_point_value_basis", "claim_id": claim_id,
                        "message": "Percentage-point value basis requires both baseline_value and current_value",
                    })
                if status == "verified" and not (
                    (baseline_count_complete and current_count_complete) or value_basis_complete
                ):
                    issues.append({
                        "level": "error", "code": "percentage_point_basis_missing", "claim_id": claim_id,
                        "message": "Verified percentage-point change requires two complete count pairs or baseline/current percentage values",
                    })

                parsed_basis = {
                    field: decimal_value(raw) for field, raw in point_basis_fields.items()
                }
                for field, raw in point_basis_fields.items():
                    if raw and parsed_basis[field] is None:
                        issues.append({
                            "level": "error", "code": "invalid_percentage_point_basis", "claim_id": claim_id,
                            "message": f"{field} is not a finite number: {raw}",
                        })

                expected_changes: list[tuple[str, Decimal]] = []
                if baseline_count_complete and current_count_complete and all(
                    parsed_basis[field] is not None
                    for field in (
                        "baseline_numerator", "baseline_denominator",
                        "current_numerator", "current_denominator",
                    )
                ):
                    baseline_num = parsed_basis["baseline_numerator"]
                    baseline_den = parsed_basis["baseline_denominator"]
                    current_num = parsed_basis["current_numerator"]
                    current_den = parsed_basis["current_denominator"]
                    assert baseline_num is not None and baseline_den is not None
                    assert current_num is not None and current_den is not None
                    if baseline_den <= 0 or current_den <= 0:
                        issues.append({
                            "level": "error", "code": "invalid_percentage_point_denominator", "claim_id": claim_id,
                            "message": "Baseline and current denominators must be positive",
                        })
                    elif baseline_num < 0 or baseline_num > baseline_den or current_num < 0 or current_num > current_den:
                        issues.append({
                            "level": "error", "code": "percentage_point_numerator_out_of_range", "claim_id": claim_id,
                            "message": "Baseline/current numerators must be between zero and their denominators",
                        })
                    else:
                        expected_changes.append((
                            "count pairs",
                            (current_num / current_den - baseline_num / baseline_den) * Decimal("100"),
                        ))
                if value_basis_complete and parsed_basis["baseline_value"] is not None and parsed_basis["current_value"] is not None:
                    baseline_value = parsed_basis["baseline_value"]
                    current_value = parsed_basis["current_value"]
                    assert baseline_value is not None and current_value is not None
                    if not (Decimal("0") <= baseline_value <= Decimal("100")) or not (
                        Decimal("0") <= current_value <= Decimal("100")
                    ):
                        issues.append({
                            "level": "error", "code": "percentage_point_value_out_of_range", "claim_id": claim_id,
                            "message": "Baseline/current percentage values must be between 0 and 100",
                        })
                    else:
                        expected_changes.append(("percentage values", current_value - baseline_value))
                if reported is not None:
                    for basis_name, expected_change in expected_changes:
                        if abs(reported - expected_change) > rounding_tolerance(reported):
                            issues.append({
                                "level": "error", "code": "reported_percentage_point_mismatch", "claim_id": claim_id,
                                "message": f"Reported percentage-point change {reported} does not match {basis_name} ({expected_change:.4f})",
                            })
                if len(expected_changes) == 2:
                    baseline_value = parsed_basis["baseline_value"]
                    current_value = parsed_basis["current_value"]
                    assert baseline_value is not None and current_value is not None
                    displayed_basis_tolerance = (
                        rounding_tolerance(baseline_value) + rounding_tolerance(current_value)
                    )
                    if abs(expected_changes[0][1] - expected_changes[1][1]) > displayed_basis_tolerance:
                        issues.append({
                            "level": "error", "code": "percentage_point_basis_conflict", "claim_id": claim_id,
                            "message": "Count-pair and percentage-value bases differ beyond their displayed precision",
                        })
            elif any(point_basis_fields.values()):
                issues.append({
                    "level": "error", "code": "unexpected_percentage_point_basis", "claim_id": claim_id,
                    "message": "Baseline/current percentage-point fields require unit=percentage_point",
                })
            if bool(numerator_raw) != bool(denominator_raw):
                issues.append({
                    "level": "error",
                    "code": "incomplete_denominator_pair",
                    "claim_id": claim_id,
                    "message": "Numerator and denominator must be recorded together",
                })
            if numerator_raw and denominator_raw and unit not in {"percent", "%", "proportion", "ratio"}:
                issues.append({
                    "level": "error",
                    "code": "denominator_unit_unsupported",
                    "claim_id": claim_id,
                    "message": "Numerator/denominator claims must use percent, proportion, or ratio units",
                })
            numerator = decimal_value(numerator_raw)
            denominator = decimal_value(denominator_raw)
            if numerator_raw and numerator is None:
                issues.append({
                    "level": "error", "code": "invalid_numerator", "claim_id": claim_id,
                    "message": f"Numerator is not numeric: {numerator_raw}",
                })
            if denominator_raw and (denominator is None or denominator <= 0):
                issues.append({
                    "level": "error", "code": "invalid_denominator", "claim_id": claim_id,
                    "message": f"Denominator must be a positive number: {denominator_raw}",
                })
            if numerator is not None and denominator is not None and denominator > 0:
                if unit in {"percent", "percentage", "%", "proportion"} and (
                    numerator < 0 or numerator > denominator
                ):
                    issues.append({
                        "level": "error",
                        "code": "numerator_out_of_range",
                        "claim_id": claim_id,
                        "message": "Numerator must be between zero and the denominator",
                    })
                if reported is not None and unit in {"percent", "percentage", "%"}:
                    expected = numerator / denominator * Decimal("100")
                    if abs(reported - expected) > rounding_tolerance(reported):
                        issues.append({
                            "level": "error",
                            "code": "reported_percentage_mismatch",
                            "claim_id": claim_id,
                            "message": f"Reported percentage {reported} does not match numerator/denominator ({expected:.4f})",
                        })
                elif reported is not None and unit in {"proportion", "ratio"}:
                    expected = numerator / denominator
                    if abs(reported - expected) > rounding_tolerance(reported):
                        issues.append({
                            "level": "error",
                            "code": "reported_ratio_mismatch",
                            "claim_id": claim_id,
                            "message": f"Reported ratio {reported} does not match numerator/denominator ({expected:.6f})",
                        })

            analysis_n_raw = str(row.get("analysis_sample_n", "")).strip()
            analysis_n = decimal_value(analysis_n_raw)
            if analysis_n_raw and (analysis_n is None or analysis_n <= 0):
                issues.append({
                    "level": "error",
                    "code": "invalid_analysis_sample_n",
                    "claim_id": claim_id,
                    "message": f"Analysis sample size must be positive: {analysis_n_raw}",
                })
            elif analysis_n is not None and analysis_n != analysis_n.to_integral_value():
                issues.append({
                    "level": "error", "code": "non_integer_analysis_sample_n", "claim_id": claim_id,
                    "message": f"Analysis sample size must be an integer respondent/record count: {analysis_n_raw}",
                })
            if denominator is not None and analysis_n is not None and denominator > analysis_n:
                issues.append({
                    "level": "warning",
                    "code": "denominator_exceeds_analysis_sample",
                    "claim_id": claim_id,
                    "message": "Denominator exceeds analysis_sample_n; document weighting or the population-count basis",
                })

            if content_class in {"simulated", "proposed"} and any(
                term in claim_text for term in ("验证了", "已经实现", "实际提升", "直接提升", "证明了")
            ):
                issues.append({
                    "level": "error" if status == "verified" else "warning",
                    "code": "scenario_claim_overstated",
                    "claim_id": claim_id,
                    "message": "A simulated or proposed claim is phrased as verified or realized",
                })

    count = len(rows)
    return {
        "summary": {
            "claims": count,
            "complete_traces": complete,
            "traceability_rate": round(complete / count, 4) if count else 0.0,
            "verified_claims": verified,
            "fact_contract_enabled": fact_contract_enabled,
            "errors": sum(item["level"] == "error" for item in issues),
            "warnings": sum(item["level"] == "warning" for item in issues),
        },
        "issues": issues,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ledger", help="Evidence ledger CSV")
    parser.add_argument("--strict", action="store_true", help="Require every output-linked claim to be verified")
    parser.add_argument("--output")
    args = parser.parse_args()
    try:
        result = audit(Path(args.ledger), strict=args.strict)
    except (OSError, csv.Error) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 1 if result["summary"]["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
