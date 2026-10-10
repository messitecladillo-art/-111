#!/usr/bin/env python3
"""Compare two JSON rule snapshots by stable rule ID."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


LEGACY_REQUIRED = {
    "id", "edition", "group", "stage", "rule", "source_url",
    "published_date", "verified_at", "authority", "status",
}
STRUCTURED_RULE_REQUIRED = {
    "id", "scope_id", "rule_type", "rule", "severity", "source_id",
    "source_title", "source_url", "published_date", "verified_at",
    "authority", "status",
}
SNAPSHOT_REQUIRED = {"edition", "group", "region", "track", "stage", "verified_at", "source_ids"}
SCOPE_REQUIRED = {"id", "edition", "group", "region", "track", "stage"}
SOURCE_REQUIRED = {
    "id", "title", "url", "authority_level", "authority_name",
    "official_status", "published_date", "verified_at", "local_path", "sha256",
}
COMPARE_FIELDS = [
    "snapshot_context", "scope_id", "scope", "edition", "group", "region",
    "track", "stage", "rule_type", "rule", "severity", "source_id",
    "source_title", "source_url", "published_date", "verified_at",
    "authority", "source_record", "status",
]


def load_snapshot(path: Path) -> dict[str, dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    rows = payload.get("rules", payload) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise ValueError(f"{path}: expected a list or an object with a rules list")

    structured = isinstance(payload, dict) and any(
        key in payload for key in ("snapshot", "sources", "scopes")
    )
    snapshot: dict[str, Any] | None = None
    sources: dict[str, dict[str, Any]] = {}
    scopes: dict[str, dict[str, Any]] = {}
    if structured:
        snapshot = payload.get("snapshot")
        source_rows = payload.get("sources")
        scope_rows = payload.get("scopes")
        if not isinstance(snapshot, dict):
            raise ValueError(f"{path}: structured snapshot missing snapshot object")
        missing = SNAPSHOT_REQUIRED - set(snapshot)
        if missing:
            raise ValueError(f"{path}: snapshot missing fields: {', '.join(sorted(missing))}")
        if not isinstance(source_rows, list) or not isinstance(scope_rows, list):
            raise ValueError(f"{path}: structured snapshot requires sources and scopes lists")
        for label, values, required, target in (
            ("source", source_rows, SOURCE_REQUIRED, sources),
            ("scope", scope_rows, SCOPE_REQUIRED, scopes),
        ):
            for index, value in enumerate(values, start=1):
                if not isinstance(value, dict):
                    raise ValueError(f"{path}: {label} {index} is not an object")
                missing = required - set(value)
                if missing:
                    raise ValueError(
                        f"{path}: {label} {index} missing fields: {', '.join(sorted(missing))}"
                    )
                identifier = str(value["id"])
                if identifier in target:
                    raise ValueError(f"{path}: duplicate {label} ID: {identifier}")
                target[identifier] = value

    indexed: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise ValueError(f"{path}: rule {index} is not an object")
        required = STRUCTURED_RULE_REQUIRED if structured else LEGACY_REQUIRED
        missing = required - set(row)
        if missing:
            raise ValueError(f"{path}: rule {index} missing fields: {', '.join(sorted(missing))}")
        rule_id = str(row["id"])
        if rule_id in indexed:
            raise ValueError(f"{path}: duplicate rule ID: {rule_id}")
        normalized = dict(row)
        if structured:
            scope_id = str(row["scope_id"])
            source_id = str(row["source_id"])
            if scope_id not in scopes:
                raise ValueError(f"{path}: rule {rule_id} references unknown scope ID: {scope_id}")
            if source_id not in sources:
                raise ValueError(f"{path}: rule {rule_id} references unknown source ID: {source_id}")
            normalized["snapshot_context"] = snapshot
            normalized["scope"] = scopes[scope_id]
            normalized["source_record"] = sources[source_id]
        indexed[rule_id] = normalized
    return indexed


def compare(old: dict[str, dict[str, Any]], new: dict[str, dict[str, Any]]) -> dict[str, Any]:
    old_ids = set(old)
    new_ids = set(new)
    added = sorted(new_ids - old_ids)
    removed = sorted(old_ids - new_ids)
    changed: list[dict[str, Any]] = []
    unchanged: list[str] = []
    for rule_id in sorted(old_ids & new_ids):
        differences = {
            field: {"old": old[rule_id].get(field), "new": new[rule_id].get(field)}
            for field in COMPARE_FIELDS
            if old[rule_id].get(field) != new[rule_id].get(field)
        }
        if differences:
            changed.append({"id": rule_id, "differences": differences})
        else:
            unchanged.append(rule_id)
    return {
        "summary": {
            "old_rules": len(old),
            "new_rules": len(new),
            "added": len(added),
            "removed": len(removed),
            "changed": len(changed),
            "unchanged": len(unchanged),
        },
        "added": [{"id": rule_id, "rule": new[rule_id]} for rule_id in added],
        "removed": [{"id": rule_id, "rule": old[rule_id]} for rule_id in removed],
        "changed": changed,
        "unchanged": unchanged,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("old_snapshot")
    parser.add_argument("new_snapshot")
    parser.add_argument("--output")
    args = parser.parse_args()
    try:
        result = compare(load_snapshot(Path(args.old_snapshot)), load_snapshot(Path(args.new_snapshot)))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
