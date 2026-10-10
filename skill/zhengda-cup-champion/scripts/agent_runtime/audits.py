"""Aggregate deterministic audits and runtime health checks."""

from __future__ import annotations

import contextlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from .contracts import load_contracts, validate_project, validate_state
from .core import (
    ACCEPTED_GATE_STATUSES,
    AUDITS_REL,
    CONFIG_REL,
    EVENTS_REL,
    STATE_REL,
    _finish_run,
    _artifact_policy_issues,
    _final_manifest_errors,
    _gate_fingerprint,
    _gate_result_is_current,
    _new_run,
    _registry_rows,
    _save_state,
    load_context,
    normalize_project,
    result_envelope,
)
from .errors import ArtifactError, ContractError
from .io_utils import (
    append_event,
    atomic_write_json,
    canonical_hash,
    load_json,
    new_id,
    project_lock,
    read_csv_rows,
    resolve_inside,
    sha256_file,
    utc_now,
)


def _script_result(name: str, command: list[str], *, cwd: Path) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"name": name, "status": "error", "passed": False, "returncode": 3, "error": str(exc)}
    stdout = completed.stdout.strip()
    stderr = completed.stderr.strip()
    payload: Any = None
    if stdout:
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError:
            payload = None
    return {
        "name": name,
        "status": "passed" if completed.returncode == 0 else "failed",
        "passed": completed.returncode == 0,
        "returncode": completed.returncode,
        "result": payload,
        "stdout": None if payload is not None else stdout[-4000:],
        "stderr": stderr[-4000:] if stderr else "",
    }


def _has_csv_rows(path: Path) -> bool:
    if not path.is_file():
        return False
    try:
        _, rows = read_csv_rows(path)
    except ArtifactError:
        return True
    return bool(rows)


def _first_file(directory: Path, suffixes: set[str]) -> Path | None:
    if not directory.is_dir():
        return None
    return next((item for item in sorted(directory.rglob("*")) if item.is_file() and item.suffix.lower() in suffixes), None)


def _active_registry_rows(
    rows: list[dict[str, str]],
    types: set[str] | None = None,
    *,
    final_only: bool = False,
) -> list[dict[str, str]]:
    """Return current, non-superseded rows with final/current versions first."""
    allowed_statuses = {"final", "approved"} if final_only else {
        "final", "approved", "draft", "in_review", "unreviewed"
    }
    eligible_rows = [
        row for row in rows
        if row.get("status", "").strip().lower() in allowed_statuses
        and (types is None or row.get("artifact_type", "").strip().lower() in types)
    ]
    superseded_ids = {
        row.get("supersedes_artifact_id", "").strip()
        for row in eligible_rows
        if row.get("supersedes_artifact_id", "").strip()
    }
    candidates: list[tuple[int, dict[str, str]]] = []
    for index, row in enumerate(rows):
        artifact_id = row.get("artifact_id", "").strip()
        artifact_type = row.get("artifact_type", "").strip().lower()
        status = row.get("status", "").strip().lower()
        if row not in eligible_rows or artifact_id in superseded_ids:
            continue
        candidates.append((index, row))
    status_rank = {"final": 0, "approved": 0, "in_review": 1, "draft": 2, "unreviewed": 3}
    candidates.sort(
        key=lambda item: (
            status_rank.get(item[1].get("status", "").strip().lower(), 9),
            -item[0],
        )
    )
    return [row for _, row in candidates]


def _registered_files(
    project: Path,
    rows: list[dict[str, str]],
    types: set[str],
    *,
    final_only: bool = False,
) -> list[Path]:
    files: list[Path] = []
    seen: set[Path] = set()
    for row in _active_registry_rows(rows, types, final_only=final_only):
        file_path = row.get("file_path", "").strip()
        if not file_path:
            continue
        try:
            candidate = resolve_inside(project, file_path)
        except ArtifactError:
            continue
        if candidate.is_file() and candidate not in seen:
            files.append(candidate)
            seen.add(candidate)
    return files


def _registry_audit(project: Path, *, strict_final: bool = False) -> dict[str, Any]:
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    rows = _registry_rows(project)
    row_by_id = {
        row.get("artifact_id", "").strip(): row
        for row in rows
        if row.get("artifact_id", "").strip()
    }
    supersession_edges: dict[str, str] = {}
    for line, row in enumerate(rows, start=2):
        artifact_id = row.get("artifact_id", "").strip()
        target_id = row.get("supersedes_artifact_id", "").strip()
        if not target_id:
            continue
        supersession_edges[artifact_id] = target_id
        target = row_by_id.get(target_id)
        if artifact_id == target_id:
            errors.append({"line": line, "code": "artifact_supersedes_itself", "artifact_id": artifact_id})
        elif target is None:
            errors.append({"line": line, "code": "supersedes_target_missing", "artifact_id": artifact_id, "target": target_id})
        elif target.get("artifact_type", "").strip().lower() != row.get("artifact_type", "").strip().lower():
            errors.append({
                "line": line,
                "code": "supersedes_type_mismatch",
                "artifact_id": artifact_id,
                "target": target_id,
            })
    reported_cycles: set[tuple[str, ...]] = set()
    for start in supersession_edges:
        order: list[str] = []
        positions: dict[str, int] = {}
        current = start
        while current in supersession_edges:
            if current in positions:
                cycle = tuple(order[positions[current]:] + [current])
                canonical_cycle = tuple(sorted(set(cycle)))
                if canonical_cycle not in reported_cycles:
                    reported_cycles.add(canonical_cycle)
                    errors.append({"code": "supersession_cycle", "artifacts": list(cycle)})
                break
            positions[current] = len(order)
            order.append(current)
            current = supersession_edges[current]
    seen: set[str] = set()
    for line, row in enumerate(rows, start=2):
        artifact_id = row.get("artifact_id", "").strip()
        if not artifact_id or artifact_id in seen:
            errors.append({"line": line, "code": "artifact_id_missing_or_duplicate", "artifact_id": artifact_id})
        seen.add(artifact_id)
        file_path = row.get("file_path", "").strip()
        if not file_path:
            errors.append({"line": line, "code": "file_path_missing", "artifact_id": artifact_id})
            continue
        try:
            resolved = resolve_inside(project, file_path)
        except ArtifactError as exc:
            errors.append({"line": line, "code": "path_escape", "message": str(exc)})
            continue
        final = row.get("status", "").strip().lower() in {"final", "approved"}
        if final and not resolved.is_file():
            errors.append({"line": line, "code": "final_artifact_missing", "file_path": file_path})
            continue
        if resolved.is_file() and row.get("sha256", "").strip():
            actual_hash = sha256_file(resolved)
            if actual_hash != row["sha256"].strip().lower():
                errors.append({"line": line, "code": "sha256_mismatch", "file_path": file_path})
        elif final:
            errors.append({"line": line, "code": "final_hash_missing", "file_path": file_path})
        for policy_issue in _artifact_policy_issues(project, row, final=final):
            finding = {"line": line, "code": policy_issue, "artifact_id": artifact_id}
            if policy_issue == "synthetic_claimed_as_actual" or strict_final:
                errors.append(finding)
            else:
                warnings.append(finding)
    return {"name": "artifact_registry", "status": "passed" if not errors else "failed", "passed": not errors, "checked_rows": len(rows), "errors": errors, "warnings": warnings}


def audit_project(path: str | Path, *, run_all: bool = True, lock_already_held: bool = False) -> dict[str, Any]:
    project = normalize_project(path)
    contracts = load_contracts()
    lock_context = contextlib.nullcontext() if lock_already_held else project_lock(project, command="audit")
    with lock_context:
        domain, state = load_context(project, contracts=contracts)
        before = state["status"]
        run = _new_run("audit:all" if run_all else "audit", canonical_hash({"status": before, "project": _safe_hash(project / "project.yaml")}))
        state["run"] = run
        append_event(project, state, "run_started", run_id=run["run_id"], payload={"command": "audit", "all": run_all})
        checks: list[dict[str, Any]] = [
            {"name": "project_schema", "status": "passed", "passed": True},
            {"name": "state_schema", "status": "passed", "passed": True},
            _registry_audit(project, strict_final=state["status"] in {"submission_ready", "closed"}),
        ]
        scripts = contracts.paths.scripts
        python = [sys.executable, "-X", "utf8"]
        strict_submission = state["status"] in {"submission_ready", "closed"}
        competition = domain.get("competition", {})
        anonymity_required = str(competition.get("anonymity_required", "unknown")).strip().lower()
        identity_terms = list(dict.fromkeys(
            str(item).strip()
            for item in competition.get("forbidden_identity_terms", [])
            if str(item).strip()
        ))
        anonymity_errors: list[dict[str, Any]] = []
        anonymity_warnings: list[dict[str, Any]] = []
        if anonymity_required == "unknown":
            target = anonymity_errors if strict_submission else anonymity_warnings
            target.append({
                "code": "anonymity_requirement_unknown",
                "message": "Resolve whether the current submission stage requires anonymity",
            })
        elif anonymity_required == "yes" and not identity_terms:
            target = anonymity_errors if strict_submission else anonymity_warnings
            target.append({
                "code": "forbidden_identity_terms_missing",
                "message": "Anonymous submissions require a project-specific school/team/person/enterprise term list",
            })
        checks.append({
            "name": "anonymity_configuration",
            "status": "failed" if anonymity_errors else "passed",
            "passed": not anonymity_errors,
            "anonymity_required": anonymity_required,
            "term_count": len(identity_terms),
            "errors": anonymity_errors,
            "warnings": anonymity_warnings,
        })

        ledger = project / "evidence" / "evidence-ledger.csv"
        if _has_csv_rows(ledger):
            traceability_command = python + [str(scripts / "check_traceability.py"), str(ledger)]
            if strict_submission:
                traceability_command.append("--strict")
            checks.append(_script_result("traceability", traceability_command, cwd=project))
        else:
            if strict_submission:
                checks.append({
                    "name": "traceability",
                    "status": "failed",
                    "passed": False,
                    "errors": [{
                        "code": "empty_evidence_ledger",
                        "message": "Final-stage audit requires at least one verified claim trace",
                    }],
                    "warnings": [],
                })
            else:
                checks.append({"name": "traceability", "status": "skipped", "passed": True, "reason": "evidence ledger has no claim rows"})
        visual_command = python + [str(scripts / "audit_visual_package.py"), str(project)]
        if strict_submission:
            visual_command.append("--strict")
        checks.append(_script_result("visual_package", visual_command, cwd=project))

        registry = _registry_rows(project)
        submission_files: list[Path] = []
        for row in _active_registry_rows(registry, final_only=strict_submission):
            file_path = row.get("file_path", "").strip()
            if not file_path:
                continue
            try:
                candidate = resolve_inside(project, file_path)
            except ArtifactError:
                continue
            if candidate.is_file() and candidate.suffix.lower() in {".docx", ".pptx", ".pdf"}:
                submission_files.append(candidate)
        submission_files = list(dict.fromkeys(submission_files))
        if submission_files:
            submission_command = python + [
                str(scripts / "audit_submission_files.py"),
                *(str(item) for item in submission_files),
            ]
            if strict_submission:
                submission_command.append("--strict")
            for term in identity_terms:
                submission_command.extend(["--forbidden-term", term])
            checks.append(
                _script_result(
                    "submission_files",
                    submission_command,
                    cwd=project,
                )
            )
        else:
            checks.append({
                "name": "submission_files",
                "status": "skipped",
                "passed": True,
                "reason": "no registered DOCX, PPTX, or PDF artifact discovered",
            })

        questionnaires = _registered_files(
            project,
            registry,
            {"questionnaire", "survey_questionnaire", "instrument"},
            final_only=strict_submission,
        )
        if not questionnaires and not strict_submission:
            fallback = _first_file(project / "research" / "instruments", {".csv", ".json"})
            questionnaires = [fallback] if fallback else []
        if questionnaires:
            for questionnaire in questionnaires:
                checks.append(_script_result("questionnaire", python + [str(scripts / "audit_questionnaire.py"), str(questionnaire)], cwd=project))
        else:
            checks.append({"name": "questionnaire", "status": "skipped", "passed": True, "reason": "no questionnaire artifact discovered"})

        datasets = _registered_files(
            project,
            registry,
            {"dataset", "raw_data", "processed_data"},
            final_only=strict_submission,
        )
        if not datasets and not strict_submission:
            fallback = _first_file(project / "data" / "processed", {".csv"}) or _first_file(project / "data" / "raw", {".csv"})
            datasets = [fallback] if fallback else []
        if datasets:
            for dataset in datasets:
                checks.append(_script_result("dataset", python + [str(scripts / "audit_dataset.py"), str(dataset)], cwd=project))
        else:
            checks.append({"name": "dataset", "status": "skipped", "passed": True, "reason": "no CSV dataset discovered"})

        reports = _registered_files(
            project,
            registry,
            {"report", "report_draft"},
            final_only=strict_submission,
        )
        if not reports and not strict_submission:
            fallback = _first_file(project / "deliverables" / "report", {".md", ".txt", ".docx", ".pdf"})
            reports = [fallback] if fallback and fallback.name != "report-outline.md" else []
        supplement_suffixes = {".md", ".txt", ".docx", ".pdf", ".py", ".r", ".do", ".jl", ".sql", ".json", ".ipynb"}
        supplements = [
            item
            for item in _registered_files(
                project,
                registry,
                {"appendix", "code_package"},
                final_only=strict_submission,
            )
            if item.suffix.lower() in supplement_suffixes
        ]
        if reports:
            for report in reports:
                report_command = python + [str(scripts / "audit_report.py"), str(report)]
                if strict_submission:
                    report_command.append("--strict-methods")
                for term in identity_terms:
                    report_command.extend(["--banned-term", term])
                for supplement in supplements:
                    report_command.extend(["--supplement", str(supplement)])
                checks.append(_script_result("report", report_command, cwd=project))
        else:
            checks.append({"name": "report", "status": "skipped", "passed": True, "reason": "no auditable report draft discovered"})

        failures = [check for check in checks if not check.get("passed", False)]
        check_to_gates = {
            "questionnaire": ["design"],
            "dataset": ["data"],
            "traceability": ["inference", "action", "submission"],
            "visual_package": ["visual"],
            "artifact_registry": ["submission"],
            "anonymity_configuration": ["submission"],
            "submission_files": ["submission"],
            "report": ["submission"],
        }
        gate_sources: dict[str, list[dict[str, Any]]] = {}
        for check in failures:
            for gate_id in check_to_gates.get(check["name"], []):
                gate_sources.setdefault(gate_id, []).append(check)
        gate_updates: list[dict[str, Any]] = []
        for gate_id, sources in gate_sources.items():
            fatal_count = 0
            warning_count = 0
            for source in sources:
                result = source.get("result") if isinstance(source.get("result"), dict) else source
                errors = result.get("errors", []) if isinstance(result, dict) else []
                warnings = result.get("warnings", []) if isinstance(result, dict) else []
                fatal_count += max(1, len(errors))
                warning_count += len(warnings)
            gate_updates.append({
                "gate": gate_id,
                "status": "fail",
                "fatal_count": fatal_count,
                "warning_count": warning_count,
                "source_checks": [source["name"] for source in sources],
                "input_fingerprint": canonical_hash(sources),
            })
        report_payload = {
            "schema_version": "1.0.0",
            "audit_id": new_id("audit"),
            "run_id": run["run_id"],
            "project_id": state["project_id"],
            "created_at": utc_now(),
            "status": "failed" if failures else "passed",
            "checks": checks,
            "gate_updates": gate_updates,
            "summary": {"total": len(checks), "passed": sum(check.get("status") == "passed" for check in checks), "failed": len(failures), "skipped": sum(check.get("status") == "skipped" for check in checks)},
        }
        result_relative = f"{AUDITS_REL}/{report_payload['audit_id']}.json"
        atomic_write_json(project / result_relative, report_payload)
        result_sha256 = sha256_file(project / result_relative)
        for update in gate_updates:
            gate_id = update["gate"]
            evaluation_id = new_id(f"audit-{gate_id}")
            evidence_refs = [
                relative
                for relative in {
                    "visual": ["evidence/visual-asset-ledger.csv", "evidence/visual-preflight-checklist.csv"],
                    "design": ["research/research-design.md"],
                    "data": ["data/raw", "data/processed"],
                    "inference": ["evidence/evidence-ledger.csv"],
                    "action": ["evidence/evidence-ledger.csv"],
                    "submission": ["evidence/artifact-registry.csv", "evidence/preflight-checklist.csv"],
                }.get(gate_id, [])
                if resolve_inside(project, relative).exists()
            ]
            state["gates"][gate_id] = {
                "status": "fail",
                "evaluation_id": evaluation_id,
                "evaluated_at": utc_now(),
                "input_fingerprint": update["input_fingerprint"],
                "result_path": result_relative,
                "result_sha256": result_sha256,
                "fatal_count": update["fatal_count"],
                "warning_count": update["warning_count"],
                "evidence_refs": evidence_refs,
                "acknowledgement": None,
            }
            gate_index = contracts.gate_ids.index(gate_id)
            for downstream in contracts.gate_ids[gate_index + 1:]:
                if state["gates"][downstream]["status"] not in {"not_run", "unknown", "fail"}:
                    state["gates"][downstream]["status"] = "stale"
            append_event(
                project,
                state,
                "gate_completed",
                run_id=run["run_id"],
                node_id=f"gate:{gate_id}",
                severity="error",
                payload={
                    "gate": gate_id,
                    "status": "fail",
                    "evaluation_id": evaluation_id,
                    "fatal_count": update["fatal_count"],
                    "source": "aggregate_audit",
                    "gate_record": state["gates"][gate_id],
                    "invalidated_gates": [
                        downstream
                        for downstream in contracts.gate_ids[contracts.gate_ids.index(gate_id) + 1:]
                        if state["gates"][downstream]["status"] == "stale"
                    ],
                },
            )
        _finish_run(state, "failed" if failures else "succeeded")
        append_event(project, state, "run_completed" if not failures else "run_failed", run_id=run["run_id"], severity="error" if failures else "info", payload={"audit": result_relative, "failed": [item["name"] for item in failures]})
        _save_state(project, state, contracts)
        exit_code = 1 if failures else 0
        failure = {"code": "audit_failed", "class": "gate", "message": "One or more deterministic audits failed", "retryable": False, "details": {"failed_checks": [item["name"] for item in failures]}} if failures else None
        return result_envelope(project, state, command="audit", run_id=run["run_id"], exit_code=exit_code, failure=failure, status_before=before, extra={"audit_report": result_relative, "audit": report_payload})


def _safe_hash(path: Path) -> str | None:
    return sha256_file(path) if path.is_file() else None


def _registered_file(project: Path, rows: list[dict[str, str]], types: set[str]) -> Path | None:
    files = _registered_files(project, rows, types)
    return files[0] if files else None


def doctor_project(path: str | Path) -> dict[str, Any]:
    project = normalize_project(path)
    checks: list[dict[str, Any]] = []
    contracts = load_contracts()
    checks.append({"name": "contracts", "passed": True, "detail": "workflow, gates, and schemas loaded"})
    try:
        import yaml  # noqa: F401
        checks.append({"name": "dependency_pyyaml", "passed": True})
    except ImportError:
        checks.append({"name": "dependency_pyyaml", "passed": False})
    try:
        import jsonschema  # noqa: F401
        checks.append({"name": "dependency_jsonschema", "passed": True})
    except ImportError:
        checks.append({"name": "dependency_jsonschema", "passed": False})

    domain, state = load_context(
        project,
        contracts=contracts,
        allow_mirror_mismatch=True,
        allow_event_cursor_mismatch=True,
    )
    checks.extend([
        {"name": "project_schema", "passed": True},
        {"name": "state_schema", "passed": True},
        {"name": "project_id_match", "passed": domain.get("project_id") == state.get("project_id")},
        {"name": "status_mirror", "passed": domain.get("project", {}).get("status") == state.get("status") == state.get("project_status_mirror"), "detail": {"project": domain.get("project", {}).get("status"), "state": state.get("status")}},
        {"name": "recovery_state", "passed": state.get("recovery", {}).get("status") == "idle", "detail": state.get("recovery")},
    ])
    config_path = project / CONFIG_REL
    if config_path.is_file():
        config = load_json(config_path)
        checks.append({"name": "runtime_config", "passed": isinstance(config, dict) and config.get("project_id") == state.get("project_id")})
    else:
        checks.append({"name": "runtime_config", "passed": False, "detail": "missing .agent/config.json"})
    active_lock = project / ".agent" / "lock"
    checks.append({"name": "active_writer_lock", "passed": not active_lock.exists(), "detail": str(active_lock) if active_lock.exists() else None})
    stale_lock_dir = project / ".agent" / "stale-locks"
    stale_lock_count = len(list(stale_lock_dir.glob("*.json"))) if stale_lock_dir.is_dir() else 0
    checks.append({"name": "stale_lock_audit_trail", "passed": True, "archived_count": stale_lock_count})

    event_errors = _verify_events(project, state)
    checks.append({"name": "event_chain", "passed": not event_errors, "errors": event_errors})
    checkpoint_errors = _verify_checkpoint(project, state.get("latest_checkpoint"), contracts)
    checks.append({"name": "latest_checkpoint", "passed": not checkpoint_errors, "errors": checkpoint_errors, "skipped": state.get("latest_checkpoint") is None})
    invalid_gate_results = [
        gate_id for gate_id, record in state["gates"].items()
        if record["status"] != "not_run" and not _gate_result_is_current(project, gate_id, record)
    ]
    checks.append({"name": "gate_result_files", "passed": not invalid_gate_results, "invalid_gates": invalid_gate_results})
    stale_candidates: list[str] = []
    for gate_id, record in state["gates"].items():
        if record["status"] not in ACCEPTED_GATE_STATUSES or not record["evidence_refs"]:
            continue
        try:
            fingerprint, _ = _gate_fingerprint(
                project,
                domain,
                contracts.gate_definition(gate_id),
                record["evidence_refs"],
            )
        except ArtifactError:
            fingerprint = None
        if fingerprint != record["input_fingerprint"]:
            stale_candidates.append(gate_id)
    checks.append({"name": "gate_fingerprints", "passed": not stale_candidates, "stale_candidates": stale_candidates})
    if state["status"] == "closed":
        manifest_errors = _final_manifest_errors(project, domain, state, contracts)
        checks.append({"name": "closed_manifest", "passed": not manifest_errors, "errors": manifest_errors})
    failures = [item for item in checks if not item.get("passed", False)]
    concurrency_conflict = any(item["name"] in {"status_mirror", "active_writer_lock"} for item in failures)
    exit_code = 5 if concurrency_conflict else (2 if failures else 0)
    failure = ({
        "code": "state_conflict" if concurrency_conflict else "doctor_failed",
        "class": "concurrency" if concurrency_conflict else "validation",
        "message": "Project state has a mirror or active-writer conflict" if concurrency_conflict else "Runtime health checks failed",
        "retryable": False,
        "details": {"failed_checks": [item["name"] for item in failures]},
    } if failures else None)
    return result_envelope(project, state, command="doctor", run_id=new_id("run-read"), exit_code=exit_code, failure=failure, extra={"healthy": not failures, "checks": checks})


def _verify_events(project: Path, state: dict[str, Any]) -> list[str]:
    path = project / EVENTS_REL
    if not path.is_file():
        return ["event stream is missing"] if state["event_stream"]["last_sequence"] else []
    errors: list[str] = []
    previous_hash = None
    last_event_id = None
    sequence = 0
    try:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except OSError as exc:
        return [str(exc)]
    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(f"line {line_number}: invalid JSON: {exc}")
            continue
        required_fields = {
            "event_id", "run_id", "sequence", "timestamp", "type", "project_id",
            "workflow_version", "control_status", "node_id", "attempt", "severity",
            "checkpoint_id", "causation_id", "correlation_id", "input_fingerprint",
            "previous_event_hash", "payload", "event_hash",
        }
        missing_fields = sorted(required_fields - set(event))
        if missing_fields:
            errors.append(f"line {line_number}: missing fields {', '.join(missing_fields)}")
        if not isinstance(event.get("attempt"), int) or event.get("attempt", 0) < 1:
            errors.append(f"line {line_number}: invalid attempt")
        if event.get("severity") not in {"debug", "info", "warning", "error", "fatal"}:
            errors.append(f"line {line_number}: invalid severity")
        if not re.fullmatch(r"[0-9a-f]{64}", str(event.get("input_fingerprint", ""))):
            errors.append(f"line {line_number}: invalid input_fingerprint")
        sequence += 1
        if event.get("sequence") != sequence:
            errors.append(f"line {line_number}: expected sequence {sequence}")
        if event.get("previous_event_hash") != previous_hash:
            errors.append(f"line {line_number}: previous_event_hash mismatch")
        expected_hash = event.get("event_hash")
        unhashed = dict(event)
        unhashed.pop("event_hash", None)
        actual_hash = canonical_hash(unhashed)
        if expected_hash != actual_hash:
            errors.append(f"line {line_number}: event_hash mismatch")
        previous_hash = expected_hash
        last_event_id = event.get("event_id")
    cursor = state["event_stream"]
    if cursor["last_sequence"] != sequence:
        errors.append("state event sequence does not match stream")
    if cursor["last_event_id"] != last_event_id:
        errors.append("state last_event_id does not match stream")
    if cursor.get("stream_sha256") != previous_hash:
        errors.append("state stream hash does not match stream")
    return errors


def _verify_checkpoint(project: Path, checkpoint: dict[str, Any] | None, contracts: Any) -> list[str]:
    if checkpoint is None:
        return []
    errors: list[str] = []
    stored = project / ".agent" / "checkpoints" / f"{checkpoint['checkpoint_id']}.json"
    if not stored.is_file():
        errors.append("checkpoint record file is missing")
    else:
        try:
            stored_payload = load_json(stored)
            from .contracts import validate_checkpoint

            validate_checkpoint(stored_payload, contracts)
            if canonical_hash(stored_payload) != canonical_hash(checkpoint):
                errors.append("stored checkpoint differs from state reference")
            unsigned = dict(stored_payload)
            declared_hash = unsigned.pop("record_sha256", None)
            if declared_hash != canonical_hash(unsigned):
                errors.append("checkpoint record_sha256 mismatch")
        except (ContractError, AttributeError, TypeError) as exc:
            errors.append(f"checkpoint record invalid: {exc}")
    for record in checkpoint.get("artifacts", []):
        try:
            candidate = resolve_inside(project, record["path"])
        except ArtifactError as exc:
            errors.append(str(exc))
            continue
        if not candidate.is_file():
            errors.append(f"checkpoint artifact missing: {record['path']}")
        elif sha256_file(candidate) != record["sha256"]:
            errors.append(f"checkpoint artifact changed: {record['path']}")
    return errors
