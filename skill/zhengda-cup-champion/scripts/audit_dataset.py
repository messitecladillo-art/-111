#!/usr/bin/env python3
"""Run a deterministic first-pass audit on CSV survey data."""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from collections import Counter
from pathlib import Path
from typing import Any


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]], str]:
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            with path.open("r", encoding=encoding, newline="") as handle:
                sample = handle.read(8192)
                handle.seek(0)
                try:
                    dialect = csv.Sniffer().sniff(sample)
                except csv.Error:
                    dialect = csv.excel
                reader = csv.DictReader(handle, dialect=dialect)
                return list(reader.fieldnames or []), [dict(row) for row in reader], encoding
        except UnicodeDecodeError as exc:
            last_error = exc
    raise ValueError(f"could not decode CSV: {last_error}")


def as_number(value: str) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def audit(
    fields: list[str],
    rows: list[dict[str, str]],
    id_column: str | None,
    likert_columns: list[str],
    duration_column: str | None,
    min_duration: float,
) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    row_count = len(rows)
    if row_count == 0:
        issues.append({"level": "error", "code": "no_rows", "message": "Dataset contains no records"})
    if len(fields) != len(set(fields)):
        issues.append({"level": "error", "code": "duplicate_columns", "message": "Column names are duplicated"})

    missingness: dict[str, float] = {}
    constant_columns: list[str] = []
    for field in fields:
        values = [str(row.get(field, "")).strip() for row in rows]
        missing = sum(value == "" for value in values)
        missingness[field] = round(missing / row_count, 4) if row_count else 0.0
        nonmissing = {value for value in values if value != ""}
        if row_count and len(nonmissing) <= 1:
            constant_columns.append(field)
        if row_count and missing / row_count >= 0.2:
            issues.append({
                "level": "warning",
                "code": "high_missingness",
                "column": field,
                "message": f"Missingness is {missing / row_count:.1%}",
            })

    row_signatures = [tuple(str(row.get(field, "")) for field in fields) for row in rows]
    exact_duplicate_rows = sum(count - 1 for count in Counter(row_signatures).values() if count > 1)
    if exact_duplicate_rows:
        issues.append({
            "level": "warning",
            "code": "exact_duplicate_rows",
            "message": f"Found {exact_duplicate_rows} duplicate records beyond the first copy",
        })

    duplicate_ids = 0
    blank_ids = 0
    if id_column:
        if id_column not in fields:
            issues.append({"level": "error", "code": "id_column_missing", "message": f"ID column not found: {id_column}"})
        else:
            ids = [str(row.get(id_column, "")).strip() for row in rows]
            blank_ids = sum(item == "" for item in ids)
            duplicate_ids = sum(count - 1 for key, count in Counter(ids).items() if key and count > 1)
            if blank_ids:
                issues.append({"level": "warning", "code": "blank_ids", "message": f"Found {blank_ids} blank IDs"})
            if duplicate_ids:
                issues.append({"level": "warning", "code": "duplicate_ids", "message": f"Found {duplicate_ids} duplicate IDs beyond the first copy"})

    invalid_likert = [column for column in likert_columns if column not in fields]
    if invalid_likert:
        issues.append({"level": "error", "code": "likert_columns_missing", "message": f"Columns not found: {', '.join(invalid_likert)}"})
    valid_likert = [column for column in likert_columns if column in fields]
    straightline_rows: list[int] = []
    if len(valid_likert) >= 4:
        for index, row in enumerate(rows, start=2):
            values = [str(row.get(column, "")).strip() for column in valid_likert]
            present = [value for value in values if value != ""]
            if len(present) >= 4 and len(set(present)) == 1:
                straightline_rows.append(index)
        if straightline_rows:
            issues.append({
                "level": "warning",
                "code": "possible_straightlining",
                "message": f"Found {len(straightline_rows)} rows with identical values across supplied Likert columns",
            })

    short_duration_rows: list[int] = []
    if duration_column:
        if duration_column not in fields:
            issues.append({"level": "error", "code": "duration_column_missing", "message": f"Duration column not found: {duration_column}"})
        else:
            for index, row in enumerate(rows, start=2):
                value = as_number(str(row.get(duration_column, "")).strip())
                if value is not None and value < min_duration:
                    short_duration_rows.append(index)
            if short_duration_rows:
                issues.append({
                    "level": "warning",
                    "code": "short_duration",
                    "message": f"Found {len(short_duration_rows)} rows below {min_duration:g} seconds",
                })

    for field in constant_columns:
        issues.append({"level": "warning", "code": "constant_column", "column": field, "message": "Column has at most one non-missing value"})

    return {
        "summary": {
            "rows": row_count,
            "columns": len(fields),
            "errors": sum(item["level"] == "error" for item in issues),
            "warnings": sum(item["level"] == "warning" for item in issues),
            "exact_duplicate_rows": exact_duplicate_rows,
            "duplicate_ids": duplicate_ids,
            "blank_ids": blank_ids,
            "possible_straightline_rows": len(straightline_rows),
            "short_duration_rows": len(short_duration_rows),
        },
        "missingness": missingness,
        "constant_columns": constant_columns,
        "flagged_rows": {
            "straightlining_csv_rows": straightline_rows[:100],
            "short_duration_csv_rows": short_duration_rows[:100],
        },
        "issues": issues,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", help="CSV survey dataset")
    parser.add_argument("--id-column")
    parser.add_argument("--likert-columns", help="Comma-separated Likert item columns")
    parser.add_argument("--duration-column", help="Completion duration column in seconds")
    parser.add_argument("--min-duration", type=float, default=60.0)
    parser.add_argument("--output")
    args = parser.parse_args()

    try:
        fields, rows, encoding = read_csv(Path(args.dataset))
        result = audit(
            fields,
            rows,
            args.id_column,
            [item.strip() for item in (args.likert_columns or "").split(",") if item.strip()],
            args.duration_column,
            args.min_duration,
        )
        result["encoding"] = encoding
    except (OSError, ValueError, csv.Error) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 1 if result["summary"]["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
