#!/usr/bin/env python3
"""Verify that an unsafe final Office artifact fails the aggregate submission audit."""

from __future__ import annotations

import csv
import hashlib
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parent.parent
CTL = ROOT / "skill" / "zhengda-cup-champion" / "scripts" / "agentctl.py"


def fail(message: str, **details: Any) -> int:
    print(json.dumps({"success": False, "message": message, "details": details}, ensure_ascii=False, indent=2))
    return 1


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="evi_x_submission_integration_") as temp:
        project = Path(temp) / "project"
        boot = subprocess.run(
            [sys.executable, "-X", "utf8", str(CTL), str(project), "bootstrap", "--title", "submission integration"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        if boot.returncode != 0:
            return fail("bootstrap failed", stdout=boot.stdout, stderr=boot.stderr)

        unsafe = project / "deliverables" / "report" / "unsafe.docx"
        unsafe.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(unsafe, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "docProps/core.xml",
                """<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties
 xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:creator>Named Author</dc:creator>
</cp:coreProperties>""",
            )
            archive.writestr(
                "word/document.xml",
                """<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>safe visible text</w:t></w:r></w:p></w:body>
</w:document>""",
            )

        # This focused integration fixture activates final-stage strictness without replaying
        # the full transition suite, which is separately covered by run_behavior_evals.py.
        project_yaml = project / "project.yaml"
        domain = yaml.safe_load(project_yaml.read_text(encoding="utf-8"))
        domain["project"]["status"] = "submission_ready"
        domain["competition"]["anonymity_required"] = "yes"
        domain["competition"]["forbidden_identity_terms"] = ["Named Author"]
        project_yaml.write_text(
            yaml.safe_dump(domain, allow_unicode=True, sort_keys=False, width=1000),
            encoding="utf-8",
        )
        state_path = project / ".agent" / "state.json"
        state = json.loads(state_path.read_text(encoding="utf-8"))
        state["status"] = "submission_ready"
        state["project_status_mirror"] = "submission_ready"
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        registry = project / "evidence" / "artifact-registry.csv"
        with registry.open("r", encoding="utf-8-sig", newline="") as handle:
            fields = next(csv.reader(handle))
        row = {field: "" for field in fields}
        row.update({
            "artifact_id": "ART-UNSAFE-001",
            "project_id": state["project_id"],
            "title": "unsafe report",
            "artifact_type": "report",
            "classification": "derived",
            "stage": "submission_ready",
            "gate": "submission",
            "file_path": "deliverables/report/unsafe.docx",
            "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "provenance": "deterministic integration fixture",
            "content_state": "derived",
            "version": "v1",
            "sha256": hashlib.sha256(unsafe.read_bytes()).hexdigest(),
            "bytes": str(unsafe.stat().st_size),
            "created_by_role": "narrative_strategist",
            "owner_name": "test owner",
            "status": "final",
            "rights_status": "cleared",
            "anonymity_status": "pass",
            "created_at": "2026-08-04T00:00:00+08:00",
            "updated_at": "2026-08-04T00:00:00+08:00",
        })
        with registry.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerow(row)

        completed = subprocess.run(
            [sys.executable, "-X", "utf8", str(CTL), str(project), "audit", "--all"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            return fail("aggregate audit returned non-JSON", stdout=completed.stdout, stderr=completed.stderr)
        audit = payload.get("audit") if isinstance(payload, dict) else None
        checks = audit.get("checks", []) if isinstance(audit, dict) else []
        submission = next(
            (item for item in checks if isinstance(item, dict) and item.get("name") == "submission_files"),
            None,
        )
        traceability = next(
            (item for item in checks if isinstance(item, dict) and item.get("name") == "traceability"),
            None,
        )
        result = submission.get("result", {}) if isinstance(submission, dict) else {}
        error_codes = {
            item.get("code")
            for item in result.get("errors", [])
            if isinstance(item, dict)
        }
        submission_gate = (payload.get("gates") or {}).get("submission") if isinstance(payload, dict) else None
        passed = (
            completed.returncode == 1
            and isinstance(submission, dict)
            and submission.get("status") == "failed"
            and submission.get("returncode") == 1
            and "identity_metadata" in error_codes
            and "forbidden_identity_term" in error_codes
            and isinstance(traceability, dict)
            and traceability.get("status") == "failed"
            and any(
                isinstance(item, dict) and item.get("code") == "empty_evidence_ledger"
                for item in traceability.get("errors", [])
            )
            and submission_gate == "fail"
        )
        if not passed:
            return fail(
                "unsafe final Office artifact did not fail the aggregate submission Gate",
                cli_exit=completed.returncode,
                submission=submission,
                traceability=traceability,
                submission_gate=submission_gate,
                stderr=completed.stderr,
            )

        domain = yaml.safe_load(project_yaml.read_text(encoding="utf-8"))
        domain["competition"]["forbidden_identity_terms"] = []
        project_yaml.write_text(
            yaml.safe_dump(domain, allow_unicode=True, sort_keys=False, width=1000),
            encoding="utf-8",
        )
        missing_terms_run = subprocess.run(
            [sys.executable, "-X", "utf8", str(CTL), str(project), "audit", "--all"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        try:
            missing_terms_payload = json.loads(missing_terms_run.stdout)
        except json.JSONDecodeError:
            return fail(
                "missing-term aggregate audit returned non-JSON",
                stdout=missing_terms_run.stdout,
                stderr=missing_terms_run.stderr,
            )
        missing_terms_audit = missing_terms_payload.get("audit", {})
        anonymity_check = next(
            (
                item for item in missing_terms_audit.get("checks", [])
                if isinstance(item, dict) and item.get("name") == "anonymity_configuration"
            ),
            None,
        )
        if not (
            missing_terms_run.returncode == 1
            and isinstance(anonymity_check, dict)
            and anonymity_check.get("status") == "failed"
            and any(
                isinstance(item, dict) and item.get("code") == "forbidden_identity_terms_missing"
                for item in anonymity_check.get("errors", [])
            )
        ):
            return fail(
                "anonymous final-stage audit did not fail on a missing forbidden-term list",
                cli_exit=missing_terms_run.returncode,
                anonymity_check=anonymity_check,
                stderr=missing_terms_run.stderr,
            )
        print(json.dumps({
            "success": True,
            "cli_exit": completed.returncode,
            "submission_check": submission.get("status"),
            "submission_gate": submission_gate,
            "traceability": traceability.get("status") if isinstance(traceability, dict) else None,
            "missing_terms_check": anonymity_check.get("status"),
            "error_codes": sorted(str(item) for item in error_codes),
        }, ensure_ascii=False, indent=2))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
