#!/usr/bin/env python3
"""Audit a project visual ledger for provenance, accessibility, and brand isolation."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
from typing import Any


TRUTHY = {"1", "true", "yes", "y", "approved", "pass", "passed", "通过"}
FINAL_STATES = {"approved", "final", "released", "production", "通过"}
CONTENT_CLASSES = {"actual", "proposed", "simulated", "inferred", "conceptual"}
MODES = {"agent_ui", "public_promo", "competition_submission"}
PREFIX_BY_MODE = {
    "agent_ui": "AGUI-",
    "public_promo": "PUB-",
    "competition_submission": "COMP-",
}
BRAND_ASSET_TYPES = {"mascot", "agent_logo", "brand_pattern", "agent_wordmark"}
EVIDENCE_ASSET_TYPES = {"chart", "data_table", "map", "field_photo", "respondent_photo", "screenshot"}
REQUIRED_COLUMNS = {
    "asset_id",
    "mode",
    "asset_type",
    "title",
    "purpose",
    "content_class",
    "source_evidence_ids",
    "ai_generated",
    "ai_use_ledger_id",
    "concept_only",
    "third_party_mark_status",
    "anonymity_checked",
    "competition_approved",
    "accessibility_status",
    "print_status",
    "width",
    "height",
    "unit",
    "file_path",
    "sha256",
    "version",
    "owner",
    "reviewer",
    "status",
    "created_at",
    "updated_at",
    "notes",
}


def is_true(value: str) -> bool:
    return value.strip().lower() in TRUTHY


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_ledger(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader.fieldnames or []), [dict(row) for row in reader]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_directory", type=Path)
    parser.add_argument(
        "--ledger",
        type=Path,
        help="Defaults to <project>/evidence/visual-asset-ledger.csv",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat an empty ledger and high-severity review gaps as errors",
    )
    parser.add_argument("--json-out", type=Path)
    args = parser.parse_args()

    project = args.project_directory.expanduser().resolve()
    ledger = (args.ledger or project / "evidence" / "visual-asset-ledger.csv").expanduser().resolve()
    errors: list[str] = []
    warnings: list[str] = []
    checked = 0

    for relative in ("design/source", "design/exports", "deliverables/visuals"):
        if not (project / relative).is_dir():
            errors.append(f"missing project visual directory: {relative}")

    if not ledger.is_file():
        errors.append(f"visual ledger not found: {ledger}")
        fields: list[str] = []
        rows: list[dict[str, str]] = []
    else:
        fields, rows = read_ledger(ledger)
        missing_columns = sorted(REQUIRED_COLUMNS - set(fields))
        if missing_columns:
            errors.append(f"visual ledger missing columns: {', '.join(missing_columns)}")

    if not rows:
        message = "visual ledger has no asset rows"
        (errors if args.strict else warnings).append(message)

    seen_ids: set[str] = set()
    for line_number, row in enumerate(rows, start=2):
        checked += 1
        asset_id = row.get("asset_id", "").strip()
        file_path = row.get("file_path", "").strip()
        mode = row.get("mode", "").strip()
        asset_type = row.get("asset_type", "").strip().lower()
        content_class = row.get("content_class", "").strip().lower()
        status = row.get("status", "").strip().lower()
        is_final = status in FINAL_STATES
        ai_generated = is_true(row.get("ai_generated", ""))
        concept_only = is_true(row.get("concept_only", ""))

        prefix = f"line {line_number} ({asset_id or 'missing-id'})"
        if not asset_id or asset_id in seen_ids:
            errors.append(f"{prefix}: missing or duplicate asset_id")
        seen_ids.add(asset_id)

        if mode not in MODES:
            errors.append(f"{prefix}: invalid mode {mode!r}")
        elif asset_id and not asset_id.startswith(PREFIX_BY_MODE[mode]):
            message = f"{prefix}: asset_id should start with {PREFIX_BY_MODE[mode]} for mode {mode}"
            (errors if args.strict else warnings).append(message)
        if content_class not in CONTENT_CLASSES:
            errors.append(f"{prefix}: invalid content_class {content_class!r}")
        if not row.get("purpose", "").strip():
            errors.append(f"{prefix}: purpose is required")

        resolved: Path | None = None
        if not file_path:
            errors.append(f"{prefix}: file_path is required")
        else:
            resolved = (project / file_path).resolve()
            try:
                resolved.relative_to(project)
            except ValueError:
                errors.append(f"{prefix}: file_path escapes project directory")
                resolved = None
            else:
                if not resolved.is_file():
                    errors.append(f"{prefix}: file not found: {file_path}")
                    resolved = None

        expected_hash = row.get("sha256", "").strip().lower()
        if resolved and expected_hash and sha256(resolved) != expected_hash:
            errors.append(f"{prefix}: sha256 mismatch")
        if is_final and not expected_hash:
            errors.append(f"{prefix}: final asset requires sha256")

        for dimension in ("width", "height"):
            value = row.get(dimension, "").strip()
            if is_final and not value:
                errors.append(f"{prefix}: final asset requires {dimension}")
            elif value:
                try:
                    if float(value) <= 0:
                        raise ValueError
                except ValueError:
                    errors.append(f"{prefix}: {dimension} must be a positive number")
        if is_final and not row.get("unit", "").strip():
            errors.append(f"{prefix}: final asset requires a dimension unit")

        if ai_generated:
            if content_class != "conceptual" or not concept_only:
                errors.append(f"{prefix}: AI-generated imagery must be conceptual and concept_only")
            if not row.get("ai_use_ledger_id", "").strip():
                errors.append(f"{prefix}: AI-generated asset requires ai_use_ledger_id")
            if row.get("source_evidence_ids", "").strip():
                errors.append(f"{prefix}: AI-generated asset cannot claim source_evidence_ids")
        elif content_class == "actual" and asset_type in EVIDENCE_ASSET_TYPES:
            if not row.get("source_evidence_ids", "").strip():
                errors.append(f"{prefix}: actual evidence visual requires source_evidence_ids")

        if mode == "competition_submission":
            if asset_type in BRAND_ASSET_TYPES:
                errors.append(f"{prefix}: Agent brand asset is forbidden in competition_submission mode")
            if not is_true(row.get("anonymity_checked", "")):
                errors.append(f"{prefix}: competition asset requires anonymity_checked=yes")
            if is_final and not is_true(row.get("competition_approved", "")):
                errors.append(f"{prefix}: final competition asset requires competition_approved=yes")

        third_party = row.get("third_party_mark_status", "").strip().lower()
        if third_party in {"unknown", "unverified", "missing", "待确认"}:
            errors.append(f"{prefix}: third-party mark status is unresolved")
        accessibility = row.get("accessibility_status", "").strip().lower()
        if is_final and accessibility not in TRUTHY and accessibility not in {"not_applicable", "n/a"}:
            (errors if args.strict else warnings).append(f"{prefix}: final asset lacks accessibility approval")
        if is_final:
            for field in ("version", "owner", "reviewer", "created_at", "updated_at"):
                if not row.get(field, "").strip():
                    errors.append(f"{prefix}: final asset requires {field}")

    report: dict[str, Any] = {
        "project": str(project),
        "ledger": str(ledger),
        "checked_assets": checked,
        "errors": errors,
        "warnings": warnings,
        "passed": not errors,
    }
    output = json.dumps(report, ensure_ascii=False, indent=2)
    print(output)
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(output + "\n", encoding="utf-8")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
