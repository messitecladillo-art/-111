"""State machine, gates, checkpoints, project records, and handoff policy."""

from __future__ import annotations

import copy
import datetime as dt
import json
import mimetypes
import os
import re
from pathlib import Path
from typing import Any

from .contracts import (
    Contracts,
    load_contracts,
    validate_checkpoint,
    validate_final_handoff,
    validate_project,
    validate_rules,
    validate_state,
)
from .errors import ArtifactError, ConflictError, ContractError, DomainBlocked
from .io_utils import (
    append_event,
    atomic_write_csv,
    atomic_write_json,
    atomic_write_yaml,
    canonical_hash,
    fingerprint_paths,
    load_json,
    load_yaml,
    new_id,
    project_lock,
    read_csv_rows,
    relative_posix,
    resolve_inside,
    scan_event_stream,
    sha256_file,
    utc_now,
)


STATE_REL = ".agent/state.json"
CONFIG_REL = ".agent/config.json"
EVENTS_REL = ".agent/events.jsonl"
CHECKPOINTS_REL = ".agent/checkpoints"
AUDITS_REL = ".agent/audits"
RUNS_REL = ".agent/runs"
ACCEPTED_GATE_STATUSES = {"pass", "warning"}
FINAL_ARTIFACT_STATUSES = {"final", "approved"}
EXPERT_ROLES = {
    "captain",
    "rule_gatekeeper",
    "research_architect",
    "fieldwork_lead",
    "data_auditor",
    "methods_reviewer",
    "narrative_strategist",
    "visual_director",
    "red_team_judge",
}
FINAL_ARTIFACT_TYPES = {
    "report",
    "presentation",
    "defense",
    "appendix",
    "data_package",
    "code_package",
}
FINAL_ARTIFACT_EXTENSION_POLICY = {
    "report": {".pdf", ".docx", ".md", ".tex"},
    "presentation": {".pptx", ".pdf", ".md", ".odp"},
    "defense": {".pdf", ".docx", ".md", ".txt"},
    "appendix": {".pdf", ".docx", ".xlsx", ".csv", ".zip"},
    "data_package": {".zip", ".csv", ".xlsx", ".json", ".parquet", ".sav"},
    "code_package": {".zip", ".py", ".r", ".ipynb", ".do", ".m", ".sql"},
}
FINAL_ARTIFACT_ACCEPTANCE_CHECKS = {
    "report": {"file_hash_current", "content_type_match", "report_structure_reviewed", "cross_file_consistency"},
    "presentation": {"file_hash_current", "content_type_match", "slide_render_inspected", "cross_file_consistency"},
    "defense": {"file_hash_current", "content_type_match", "defense_timing_checked", "cross_file_consistency"},
    "appendix": {"file_hash_current", "content_type_match", "appendix_traceability_checked"},
    "data_package": {"file_hash_current", "content_type_match", "data_package_reproducibility_checked"},
    "code_package": {"file_hash_current", "content_type_match", "code_package_reproducibility_checked"},
}
ACCEPTED_RIGHTS_STATUSES = {
    "cleared",
    "owned",
    "licensed",
    "authorized",
    "permission_obtained",
    "public_domain",
    "not_applicable",
}
ACCEPTED_ANONYMITY_STATUSES = {"pass", "safe", "cleared", "anonymous", "not_applicable"}
ACTUAL_CLASSIFICATIONS = {"actual", "evidence", "observed", "raw"}
ACTUAL_ARTIFACT_TYPES = {
    "raw_data",
    "interview_record",
    "fieldwork_photo",
    "actual_evidence",
    "respondent_record",
}
SYNTHETIC_MARKERS = (
    "synthetic",
    "generated",
    "ai_generated",
    "ai-generated",
    "ai generated",
    "模拟",
    "生成式",
    "合成",
)

GATE_DOMAIN_PATHS: dict[str, tuple[str, ...]] = {
    "rule": ("project.edition", "project.group", "project.region", "project.stage", "project.track", "competition"),
    "problem": ("decision_problem",),
    "design": ("decision_problem.target_population", "decision_problem.geography", "research.primary_question", "research.secondary_questions", "research.design", "research.sampling_frame"),
    "fieldwork": ("research.design", "research.sampling_frame", "research.fieldwork_status", "integrity.raw_data_provenance", "integrity.consent_status"),
    "data": ("research.achieved_sample", "research.data_status", "integrity.raw_data_provenance"),
    "inference": ("research.primary_question", "research.secondary_questions", "research.design", "research.achieved_sample", "research.data_status"),
    "action": ("decision_problem.decision_owner", "decision_problem.decision_to_make", "decision_problem.expected_action", "research.primary_question", "research.secondary_questions"),
    "visual": ("visual", "deliverables.report_status", "deliverables.ppt_status", "deliverables.visuals_status"),
    "submission": ("project.edition", "project.group", "project.region", "project.stage", "project.track", "competition", "visual", "deliverables", "risks", "open_decisions", "integrity"),
}

KNOWN_TEMPLATE_FILES = {
    "project.yaml",
    "project-brief.md",
    "research/research-design.md",
    "deliverables/report/report-outline.md",
    "evidence/evidence-ledger.csv",
    "evidence/ai-use-ledger.csv",
    "evidence/decision-log.md",
    "evidence/preflight-checklist.csv",
    "design/visual-brief.md",
    "design/visual-tokens.json",
    "evidence/visual-asset-ledger.csv",
    "evidence/visual-preflight-checklist.csv",
    "evidence/rules.json",
    "evidence/team-tasks.csv",
    "evidence/blockers.csv",
    "evidence/artifact-registry.csv",
    "evidence/review-queue.csv",
    "reviews/handoff-manifest.json",
}


def _fault_inject(point: str) -> None:
    """Crash only when an explicit evaluation-only fault point is requested."""
    if os.environ.get("ZHENGDA_AGENT_FAULT_POINT") == point:
        os._exit(97)


def normalize_project(path: str | Path) -> Path:
    supplied = Path(path).expanduser().absolute()
    if supplied.exists():
        supplied_stat = supplied.lstat()
        if supplied.is_symlink() or getattr(supplied_stat, "st_file_attributes", 0) & 0x400:
            raise ContractError(f"Project root cannot be a symlink or junction: {supplied}")
    project = supplied.resolve()
    if not project.is_dir():
        raise ContractError(f"Project directory does not exist: {project}")
    resolve_inside(project, ".agent")
    return project


def _initial_gate() -> dict[str, Any]:
    return {
        "status": "not_run",
        "evaluation_id": None,
        "evaluated_at": None,
        "input_fingerprint": None,
        "result_path": None,
        "result_sha256": None,
        "fatal_count": 0,
        "warning_count": 0,
        "evidence_refs": [],
        "acknowledgement": None,
    }


def _new_run(command: str, input_fingerprint: str) -> dict[str, Any]:
    now = utc_now()
    return {
        "run_id": new_id("run"),
        "status": "running",
        "attempt": 1,
        "started_at": now,
        "updated_at": now,
        "last_heartbeat_at": now,
        "input_fingerprint": input_fingerprint,
        "idempotency_key": f"{command}:{input_fingerprint}",
    }


def _finish_run(state: dict[str, Any], status: str) -> None:
    if state.get("run"):
        state["run"]["status"] = status
        state["run"]["updated_at"] = utc_now()
        state["run"]["last_heartbeat_at"] = utc_now()
    state["updated_at"] = utc_now()


def _save_state(project: Path, state: dict[str, Any], contracts: Contracts) -> None:
    validate_state(state, contracts)
    atomic_write_json(project / STATE_REL, state)


def _project_file_fingerprint(project: Path) -> str:
    project_file = project / "project.yaml"
    return sha256_file(project_file) if project_file.is_file() else canonical_hash({"missing": "project.yaml"})


def _discover_takeover_artifacts(project: Path, project_id: str, contracts: Contracts) -> list[dict[str, str]]:
    """Register pre-existing, non-template files without treating them as trusted evidence."""
    registry_path = project / "evidence" / "artifact-registry.csv"
    if registry_path.is_file():
        fields, rows = read_csv_rows(registry_path)
    else:
        fields, _ = read_csv_rows(contracts.paths.templates / "artifact-registry.csv")
        rows = []
    known_paths = {row.get("file_path", "").replace("\\", "/") for row in rows}
    discovered: list[dict[str, str]] = []
    text_suffixes = {".txt", ".md", ".csv", ".json", ".yaml", ".yml"}
    synthetic_markers = ("ai-generated", "ai generated", "synthetic respondent", "synthetic interview", "模拟受访", "合成访谈", "ai合成", "ai 合成")

    for directory, child_dirs, filenames in os.walk(project, followlinks=False):
        directory_path = Path(directory)
        child_dirs[:] = [
            name
            for name in child_dirs
            if name != ".agent"
            and not (directory_path / name).is_symlink()
            and not (getattr((directory_path / name).lstat(), "st_file_attributes", 0) & 0x400)
        ]
        for filename in filenames:
            candidate = directory_path / filename
            relative = relative_posix(project, candidate)
            if relative in KNOWN_TEMPLATE_FILES or relative.startswith(".agent/") or relative in known_paths:
                continue
            resolved = resolve_inside(project, relative)
            lowered = relative.lower()
            if "question" in lowered or "问卷" in relative:
                artifact_type, gate = "questionnaire", "design"
            elif "interview" in lowered or "访谈" in relative:
                artifact_type, gate = "interview_record", "fieldwork"
            elif lowered.startswith("data/") or resolved.suffix.lower() in {".xlsx", ".xls", ".sav", ".dta"}:
                artifact_type, gate = "dataset", "data"
            elif "ppt" in lowered or "slide" in lowered or resolved.suffix.lower() in {".ppt", ".pptx"}:
                artifact_type, gate = "presentation", "submission"
            elif "report" in lowered or "报告" in relative or resolved.suffix.lower() == ".docx":
                artifact_type, gate = "report", "submission"
            elif lowered.startswith("inputs/official/") or resolved.suffix.lower() == ".pdf":
                artifact_type, gate = "official_notice", "rule"
            else:
                artifact_type, gate = "unclassified", "problem"
            marker_found = any(marker in lowered for marker in synthetic_markers)
            if not marker_found and resolved.suffix.lower() in text_suffixes and resolved.stat().st_size <= 2 * 1024 * 1024:
                try:
                    preview = resolved.read_text(encoding="utf-8-sig", errors="replace").lower()
                except OSError:
                    preview = ""
                marker_found = any(marker in preview for marker in synthetic_markers)
            now = utc_now()
            row = {field: "" for field in fields}
            row.update({
                "artifact_id": new_id("discovered"),
                "project_id": project_id,
                "title": candidate.name,
                "artifact_type": artifact_type,
                "classification": "synthetic" if marker_found else "unverified",
                "stage": "intake",
                "gate": gate,
                "file_path": relative,
                "mime_type": mimetypes.guess_type(candidate.name)[0] or "application/octet-stream",
                "provenance": "discovered_during_bootstrap; synthetic_marker_detected" if marker_found else "discovered_during_bootstrap; provenance_not_verified",
                "content_state": "quarantined" if marker_found else "unreviewed",
                "version": "v0",
                "sha256": sha256_file(resolved),
                "bytes": str(resolved.stat().st_size),
                "created_by_role": "captain",
                "owner_name": "unassigned",
                "status": "quarantined" if marker_found else "unreviewed",
                "rights_status": "unknown",
                "anonymity_status": "unknown",
                "created_at": now,
                "updated_at": now,
                "notes": "Auto-inventoried during safe takeover; not accepted as evidence.",
            })
            rows.append(row)
            discovered.append(row)
            known_paths.add(relative)
    if discovered or not registry_path.is_file():
        atomic_write_csv(registry_path, fields, rows)
    return discovered


def bootstrap_project(path: str | Path) -> dict[str, Any]:
    project = normalize_project(path)
    contracts = load_contracts()
    project_file = project / "project.yaml"
    with project_lock(project, command="bootstrap"):
        if (project / STATE_REL).is_file():
            domain, state = load_context(
                project,
                contracts=contracts,
                allow_mirror_mismatch=True,
                allow_event_cursor_mismatch=True,
            )
            interrupted_bootstrap = (
                (state.get("run") or {}).get("status") == "running"
                and str((state.get("run") or {}).get("idempotency_key", "")).startswith("bootstrap:")
            )
            if interrupted_bootstrap:
                _replay_event_tail(project, domain, state, contracts)
                run_id = state["run"]["run_id"]
                stream = scan_event_stream(resolve_inside(project, state["event_stream"]["path"]))
                run_events = [event for event in stream["events"] if event.get("run_id") == run_id]
                if not any(event.get("type") == "run_started" for event in run_events):
                    append_event(project, state, "run_started", run_id=run_id, payload={"command": "bootstrap"})
                _finish_run(state, "succeeded")
                if not any(event.get("type") == "run_completed" for event in run_events):
                    append_event(project, state, "run_completed", run_id=run_id, payload={"command": "bootstrap", "recovered": True})
                state["recovery"] = {"status": "idle", "resume_from_checkpoint_id": None, "retry_count": 0, "max_retries": state["recovery"]["max_retries"], "last_failure": None}
                _save_state(project, state, contracts)
                return result_envelope(project, state, command="bootstrap", run_id=run_id, extra={"already_initialized": True, "recovered_interrupted_bootstrap": True})
            # An initialized project may not hide an unrelated event tail.
            load_context(project, contracts=contracts)
            return result_envelope(project, state, command="bootstrap", run_id=new_id("run-read"), extra={"already_initialized": True})

        domain = load_yaml(project_file)
        declared_status = domain.get("project", {}).get("status", "intake")
        status = "intake"
        domain.setdefault("project", {})["status"] = status
        project_id = domain.get("project_id")
        if not isinstance(project_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", project_id) or project_id == "unknown":
            project_id = new_id("project")
        domain["schema_version"] = "1.0.0"
        domain["project_id"] = project_id
        domain["control_plane"] = {
            "workflow_version": contracts.workflow["version"],
            "gate_contract_version": contracts.gates["version"],
            "state_path": STATE_REL,
            "status_mirror_revision": 0,
        }
        domain.setdefault("project", {})["status"] = status
        validate_project(domain, contracts)
        atomic_write_yaml(project_file, domain)

        discovered = _discover_takeover_artifacts(project, project_id, contracts)

        for relative in (AUDITS_REL, CHECKPOINTS_REL, RUNS_REL):
            (project / relative).mkdir(parents=True, exist_ok=True)
        atomic_write_json(project / CONFIG_REL, {
            "schema_version": "1.0.0",
            "runtime_version": "2.0.0",
            "project_id": project_id,
            "artifact_registry": "evidence/artifact-registry.csv",
            "blocker_registry": "evidence/blockers.csv",
            "task_registry": "evidence/team-tasks.csv",
            "review_registry": "evidence/review-queue.csv",
            "audit": {"strict_visual_from_status": "submission_ready"},
            "takeover": {
                "declared_status_before_bootstrap": declared_status,
                "forced_safe_status": "intake",
                "discovered_artifact_count": len(discovered),
            },
        })
        run = _new_run("bootstrap", _project_file_fingerprint(project))
        state: dict[str, Any] = {
            "schema_version": "1.0.0",
            "project_id": project_id,
            "workflow": {
                "contract_id": contracts.workflow["contract_id"],
                "version": contracts.workflow["version"],
                "gate_contract_id": contracts.gates["contract_id"],
                "gate_contract_version": contracts.gates["version"],
            },
            "status": status,
            "status_revision": 0,
            "project_revision": 0,
            "project_status_mirror": status,
            "active_node": None,
            "run": run,
            "gates": {gate_id: _initial_gate() for gate_id in contracts.gate_ids},
            "latest_checkpoint": None,
            "event_stream": {"path": EVENTS_REL, "last_sequence": 0, "last_event_id": None, "stream_sha256": None},
            "recovery": {"status": "in_progress", "resume_from_checkpoint_id": None, "retry_count": 0, "max_retries": 3, "last_failure": None},
            "transition_history": [],
            "updated_at": utc_now(),
        }
        # Persist a recovery anchor before the first append-only event.
        _save_state(project, state, contracts)
        _fault_inject("bootstrap.after_recovery_anchor")
        append_event(project, state, "run_started", run_id=run["run_id"], payload={"command": "bootstrap"})
        _finish_run(state, "succeeded")
        append_event(project, state, "run_completed", run_id=run["run_id"], payload={"command": "bootstrap"})
        state["recovery"] = {"status": "idle", "resume_from_checkpoint_id": None, "retry_count": 0, "max_retries": 3, "last_failure": None}
        _save_state(project, state, contracts)
        return result_envelope(project, state, command="bootstrap", run_id=run["run_id"], extra={
            "already_initialized": False,
            "declared_status_before_bootstrap": declared_status,
            "takeover_inventory": [
                {key: row.get(key) for key in ("artifact_id", "file_path", "artifact_type", "classification", "status", "sha256")}
                for row in discovered
            ],
        })


def load_context(
    project: Path,
    *,
    contracts: Contracts | None = None,
    allow_mirror_mismatch: bool = False,
    allow_event_cursor_mismatch: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    contracts = contracts or load_contracts()
    domain = load_yaml(project / "project.yaml")
    state_payload = load_json(project / STATE_REL)
    if not isinstance(state_payload, dict):
        raise ContractError(".agent/state.json root must be an object")
    validate_project(domain, contracts)
    validate_state(state_payload, contracts)
    if domain.get("project_id") != state_payload.get("project_id"):
        raise ConflictError("project.yaml and state.json project_id values differ")
    domain_status = domain.get("project", {}).get("status")
    if not allow_mirror_mismatch and (domain_status != state_payload.get("status") or state_payload.get("project_status_mirror") != state_payload.get("status")):
        raise ConflictError(
            "Project status mirror is inconsistent; run resume or doctor",
            details={"project_status": domain_status, "state_status": state_payload.get("status")},
        )
    actual_cursor = scan_event_stream(resolve_inside(project, state_payload["event_stream"]["path"]))
    cursor_fields = ("last_sequence", "last_event_id", "stream_sha256")
    cursor_mismatch = any(actual_cursor[field] != state_payload["event_stream"].get(field) for field in cursor_fields)
    if cursor_mismatch and not allow_event_cursor_mismatch:
        raise ConflictError(
            "Event stream cursor is inconsistent with state; run resume",
            details={
                "state": {field: state_payload["event_stream"].get(field) for field in cursor_fields},
                "stream": {field: actual_cursor[field] for field in cursor_fields},
            },
        )
    return domain, state_payload


def result_envelope(
    project: Path,
    state: dict[str, Any],
    *,
    command: str,
    run_id: str,
    exit_code: int = 0,
    failure: dict[str, Any] | None = None,
    status_before: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "command": command,
        "project": str(project),
        "project_id": state.get("project_id"),
        "run_id": run_id,
        "exit_code": exit_code,
        "status_before": status_before if status_before is not None else state.get("status"),
        "status_after": state.get("status"),
        "status_revision": state.get("status_revision", 0),
        "gates": {gate: record.get("status") for gate, record in state.get("gates", {}).items()},
        "checkpoint_id": (state.get("latest_checkpoint") or {}).get("checkpoint_id"),
        "event_stream": copy.deepcopy(state.get("event_stream", {"path": EVENTS_REL, "last_sequence": 0, "last_event_id": None})),
        "failure": failure,
    }
    if extra:
        payload.update(extra)
    return payload


def _unknown(value: Any) -> bool:
    if value is None or value == "":
        return True
    if not isinstance(value, str):
        return False
    normalized = value.strip().lower()
    if not normalized:
        return True
    markers = ("unknown", "unverified", "tbd", "待补", "待确认", "未确认", "尚未确认")
    return any(normalized == marker or normalized.startswith(marker + ":") or normalized.startswith(marker + "：") for marker in markers)


def _pointer_value(domain: dict[str, Any], pointer: str) -> Any:
    if not pointer.startswith("project.yaml#"):
        return None
    cursor: Any = domain
    for part in pointer.split("#", 1)[1].split("."):
        if not isinstance(cursor, dict):
            return None
        cursor = cursor.get(part)
    return cursor


def _domain_value(domain: dict[str, Any], dotted_path: str) -> Any:
    cursor: Any = domain
    for part in dotted_path.split("."):
        if not isinstance(cursor, dict):
            return None
        cursor = cursor.get(part)
    return cursor


def _requirement_satisfied(project: Path, domain: dict[str, Any], requirement: str) -> bool:
    if requirement.startswith("project.yaml#"):
        value = _pointer_value(domain, requirement)
        if isinstance(value, dict):
            return bool(value) and all(not _unknown(item) for item in value.values())
        return not _unknown(value)
    if "/" not in requirement and "." not in requirement:
        return False
    path = resolve_inside(project, requirement)
    if path.is_file():
        return path.stat().st_size > 0
    if path.is_dir():
        return any(item.is_file() for item in path.rglob("*"))
    return False


def _semantic_requirement_satisfied(project: Path, requirement: str, evidence_refs: list[str]) -> bool:
    """Resolve named evidence such as ``pilot_record`` through files or registry rows."""
    token = re.sub(r"[^a-z0-9]+", "_", requirement.lower()).strip("_")
    for relative in evidence_refs:
        normalized = re.sub(r"[^a-z0-9]+", "_", Path(relative).stem.lower()).strip("_")
        if token and (token == normalized or token in normalized):
            candidate = resolve_inside(project, relative)
            if (candidate.is_file() and candidate.stat().st_size > 0) or (candidate.is_dir() and any(item.is_file() for item in candidate.rglob("*"))):
                return True
    for row in _registry_rows(project):
        searchable = " ".join(
            row.get(field, "")
            for field in ("artifact_id", "title", "artifact_type", "classification", "provenance", "notes")
        ).lower()
        normalized = re.sub(r"[^a-z0-9]+", "_", searchable)
        if token and token in normalized:
            file_path = row.get("file_path", "").strip()
            if file_path:
                candidate = resolve_inside(project, file_path)
                if candidate.is_file() and candidate.stat().st_size > 0:
                    return True
    return False


def _missing_gate_requirements(
    project: Path,
    domain: dict[str, Any],
    definition: dict[str, Any],
    evidence_refs: list[str],
) -> list[str]:
    missing: list[str] = []
    normalized_refs = {item.replace("\\", "/").lstrip("./").rstrip("/") for item in evidence_refs}
    for requirement in definition.get("required_evidence", []):
        satisfied = _requirement_satisfied(project, domain, requirement)
        normalized_requirement = requirement.replace("\\", "/").lstrip("./").rstrip("/")
        if requirement.startswith("project.yaml#"):
            satisfied = satisfied and "project.yaml" in normalized_refs
        elif "/" in requirement or "." in requirement:
            candidate = resolve_inside(project, requirement)
            if candidate.is_dir():
                referenced = any(ref == normalized_requirement or ref.startswith(normalized_requirement + "/") for ref in normalized_refs)
            else:
                referenced = normalized_requirement in normalized_refs
            satisfied = satisfied and referenced
        else:
            satisfied = _semantic_requirement_satisfied(project, requirement, evidence_refs)
        if not satisfied:
            missing.append(requirement)
    return missing


def _gate_fingerprint(
    project: Path,
    domain: dict[str, Any],
    definition: dict[str, Any],
    evidence_refs: list[str],
) -> tuple[str, list[dict[str, Any]]]:
    """Hash gate-relevant project fields without coupling results to status mirror edits."""
    file_refs = [item for item in evidence_refs if item.replace("\\", "/").lstrip("./") != "project.yaml"]
    if definition.get("id") == "rule":
        snapshot_relative = domain.get("competition", {}).get("rule_snapshot", "evidence/rules.json")
        snapshot_path = resolve_inside(project, snapshot_relative)
        if snapshot_path.is_file():
            payload = load_json(snapshot_path)
            if isinstance(payload, dict):
                for source in payload.get("sources", []):
                    if isinstance(source, dict) and source.get("local_path"):
                        file_refs.append(str(source["local_path"]))
    file_refs = list(dict.fromkeys(file_refs))
    _, records = fingerprint_paths(project, file_refs) if file_refs else (canonical_hash([]), [])
    project_values = {
        requirement: _pointer_value(domain, requirement)
        for requirement in definition.get("required_evidence", [])
        if requirement.startswith("project.yaml#")
    }
    project_values["domain_dependencies"] = {
        path: _domain_value(domain, path)
        for path in GATE_DOMAIN_PATHS.get(definition["id"], ())
    }
    if project_values or any(item.replace("\\", "/").lstrip("./") == "project.yaml" for item in evidence_refs):
        records.append({
            "path": f"project.yaml#gate:{definition['id']}",
            "sha256": canonical_hash(project_values),
            "size_bytes": len(json.dumps(project_values, ensure_ascii=False).encode("utf-8")),
        })
    return canonical_hash(records), records


def _blocker_evidence_refs_are_current(project: Path, references: Any) -> bool:
    if not isinstance(references, list) or not references:
        return False
    seen_paths: set[str] = set()
    for reference in references:
        if not isinstance(reference, dict) or set(reference) != {"path", "sha256"}:
            return False
        relative = str(reference.get("path", "")).strip()
        expected_hash = str(reference.get("sha256", "")).strip().lower()
        if not relative or relative in seen_paths or not re.fullmatch(r"[a-f0-9]{64}", expected_hash):
            return False
        seen_paths.add(relative)
        try:
            candidate = resolve_inside(project, relative)
        except ArtifactError:
            return False
        if (
            not candidate.is_file()
            or candidate.stat().st_size == 0
            or sha256_file(candidate) != expected_hash
        ):
            return False
    return True


def _blocker_resolution_is_valid(project: Path, row: dict[str, str]) -> bool:
    evidence_ref = row.get("resolution_evidence", "").strip()
    if not evidence_ref or not row.get("resolved_by", "").strip() or not row.get("resolved_at", "").strip():
        return False
    try:
        record = load_json(resolve_inside(project, evidence_ref))
    except (ArtifactError, ContractError):
        return False
    if not isinstance(record, dict):
        return False
    if (
        record.get("blocker_id") != row.get("blocker_id")
        or record.get("unblock_test") != row.get("unblock_test")
        or str(record.get("result", "")).strip().lower() != "pass"
        or record.get("verified_by") != row.get("resolved_by")
        or record.get("verified_by") == row.get("input_owner")
    ):
        return False
    try:
        dt.datetime.fromisoformat(str(record.get("verified_at", "")).replace("Z", "+00:00"))
        dt.datetime.fromisoformat(str(row.get("resolved_at", "")).replace("Z", "+00:00"))
    except ValueError:
        return False
    return _blocker_evidence_refs_are_current(project, record.get("evidence_refs"))


def _blocker_waiver_is_valid(project: Path, row: dict[str, str]) -> bool:
    if row.get("severity", "").strip().lower() == "fatal":
        return False
    evidence_ref = row.get("resolution_evidence", "").strip()
    decision_owner = row.get("decision_owner", "").strip()
    if not evidence_ref or not decision_owner or row.get("resolved_by", "").strip() != decision_owner:
        return False
    try:
        record = load_json(resolve_inside(project, evidence_ref))
    except (ArtifactError, ContractError):
        return False
    if not isinstance(record, dict):
        return False
    required = {
        "blocker_id", "decision", "decision_owner", "reason", "scope",
        "compensating_controls", "approved_at", "evidence_refs",
    }
    if required - set(record):
        return False
    if (
        record.get("blocker_id") != row.get("blocker_id")
        or str(record.get("decision", "")).strip().lower() != "waive"
        or record.get("decision_owner") != decision_owner
        or not str(record.get("reason", "")).strip()
        or not str(record.get("scope", "")).strip()
    ):
        return False
    controls = record.get("compensating_controls")
    if not isinstance(controls, list) or not controls or any(not str(item).strip() for item in controls):
        return False
    try:
        dt.datetime.fromisoformat(str(record.get("approved_at", "")).replace("Z", "+00:00"))
        dt.datetime.fromisoformat(str(row.get("resolved_at", "")).replace("Z", "+00:00"))
    except ValueError:
        return False
    return _blocker_evidence_refs_are_current(project, record.get("evidence_refs"))


def _unresolved_blockers(project: Path) -> list[dict[str, str]]:
    path = project / "evidence" / "blockers.csv"
    if not path.is_file():
        return []
    _, rows = read_csv_rows(path)
    unresolved: list[dict[str, str]] = []
    for row in rows:
        status = row.get("status", "").strip().lower()
        if status == "resolved" and _blocker_resolution_is_valid(project, row):
            continue
        if status == "waived" and _blocker_waiver_is_valid(project, row):
            continue
        unresolved.append(row)
    return unresolved


def _intake_materials(domain: dict[str, Any], inventory: list[dict[str, str]]) -> list[str]:
    materials: list[str] = []
    project_scope = domain.get("project", {})
    if any(_unknown(project_scope.get(field)) for field in ("edition", "group", "region", "stage", "track")):
        materials.append("本届届次、组别、赛区、赛道与当前赛事阶段")
    competition = domain.get("competition", {})
    if _unknown(competition.get("applicable_notice")):
        materials.append("本届官方通知及校赛/省赛细则的原文件或官方链接")
    if _unknown(competition.get("official_deadline")):
        materials.append("报名、报告、PPT与答辩的官方截止时间")
    if _unknown(competition.get("anonymity_required")):
        materials.append("当前赛段是否匿名评审及其可见内容、文件名、元数据和隐藏层要求")
    elif competition.get("anonymity_required") == "yes" and not competition.get("forbidden_identity_terms"):
        materials.append("匿名禁用词表：学校、团队、教师、学生、企业及其他可识别名称")
    decision = domain.get("decision_problem", {})
    if any(_unknown(decision.get(field)) for field in ("decision_owner", "decision_to_make", "target_population", "evidence_gap", "expected_action")):
        materials.append("企业命题书或拟研究的真实决策问题、目标人群和预期行动")
    types = {row.get("artifact_type") for row in inventory}
    if not types.intersection({"report", "questionnaire", "dataset", "presentation", "interview_record"}):
        materials.append("已有报告、问卷、访谈、原始数据、分析代码和PPT（保留原始版本）")
    integrity = domain.get("integrity", {})
    if _unknown(integrity.get("raw_data_provenance")) or _unknown(integrity.get("consent_status")):
        materials.append("真实数据来源、采集授权/知情同意与可接触样本资源")
    materials.append("团队成员分工、方法能力、可投入时间与需由谁作最终决策")
    return materials


def project_status(path: str | Path) -> dict[str, Any]:
    project = normalize_project(path)
    contracts = load_contracts()
    domain, state = load_context(project, contracts=contracts)
    transition = contracts.transition_from(state["status"])
    required_gates = list(transition.get("required_gates", [])) if transition else []
    gate_blockers = [gate for gate in required_gates if state["gates"][gate]["status"] not in ACCEPTED_GATE_STATUSES]
    next_gate = gate_blockers[0] if gate_blockers else None
    materials_needed: list[str] = []
    if next_gate:
        definition = contracts.gate_definition(next_gate)
        materials_needed = [item for item in definition["required_evidence"] if not _requirement_satisfied(project, domain, item)]
    unresolved = _unresolved_blockers(project)
    inventory_rows = [
        row for row in _registry_rows(project)
        if row.get("status", "").strip().lower() in {"unreviewed", "quarantined"}
    ]
    if state["status"] == "intake":
        materials_needed = _intake_materials(domain, inventory_rows)
    unresolved_risks = {
        severity: domain.get("risks", {}).get(severity, [])
        for severity in ("fatal", "high", "medium")
        if domain.get("risks", {}).get(severity)
    }
    next_actions: list[dict[str, Any]] = []
    if transition is None:
        next_actions.append({"action": "closed", "reason": "The workflow is at its terminal state"})
    elif gate_blockers:
        next_actions.append({
            "action": "resolve_gate",
            "gate": next_gate,
            "command": f"agentctl.py <project> gate set {next_gate} pass --evidence <path>",
            "definition_of_done": "Gate has current evidence and a pass or fully acknowledged warning result",
        })
    else:
        next_actions.append({
            "action": "advance",
            "to": transition["to"],
            "command": f"agentctl.py <project> advance --to {transition['to']} --expect-revision {state['status_revision']}",
            "definition_of_done": "Required artifacts exist, no fatal blocker remains, and an atomic checkpoint is committed",
        })
    run_id = new_id("run-read")
    return result_envelope(project, state, command="status", run_id=run_id, extra={
        "declared_stage": state["status"],
        "competition_stage": domain.get("project", {}).get("stage"),
        "next_transition": transition,
        "blocking_gates": gate_blockers,
        "unresolved_blockers": unresolved,
        "unresolved_risks": unresolved_risks,
        "takeover_inventory": [
            {key: row.get(key) for key in ("artifact_id", "file_path", "artifact_type", "classification", "status", "sha256")}
            for row in inventory_rows
        ],
        "materials_needed": materials_needed,
        "safe_parallel_work": [
            "盘点并哈希现有材料，不把未核验文件当作证据",
            "建立团队任务、review 与 blocker 台账",
            "检索并锁定适用官方规则来源",
            "把决策问题、目标人群和可获得证据写成待确认清单",
        ],
        "next_actions": next_actions,
    })


def project_next(path: str | Path) -> dict[str, Any]:
    payload = project_status(path)
    payload["command"] = "next"
    payload["recommended"] = payload.get("next_actions", [None])[0]
    return payload


def _registry_rows(project: Path) -> list[dict[str, str]]:
    registry = project / "evidence" / "artifact-registry.csv"
    if not registry.is_file():
        return []
    _, rows = read_csv_rows(registry)
    return rows


def _review_rows(project: Path) -> list[dict[str, str]]:
    queue = project / "evidence" / "review-queue.csv"
    if not queue.is_file():
        return []
    _, rows = read_csv_rows(queue)
    return rows


def _approved_review_for_artifact(
    project: Path,
    row: dict[str, str],
) -> tuple[dict[str, str] | None, list[str]]:
    review_id = row.get("review_id", "").strip()
    artifact_id = row.get("artifact_id", "").strip()
    if not review_id:
        return None, ["approved_review_missing"]
    matches = [
        review for review in _review_rows(project)
        if review.get("review_id", "").strip() == review_id
        and review.get("artifact_id", "").strip() == artifact_id
    ]
    if len(matches) != 1:
        return None, ["approved_review_missing" if not matches else "review_id_duplicate"]
    review = matches[0]
    issues: list[str] = []
    if review.get("status", "").strip().lower() != "approved" or review.get("decision", "").strip().lower() != "approved":
        issues.append("review_not_approved")
    if review.get("artifact_version", "").strip() != row.get("version", "").strip():
        issues.append("review_version_mismatch")
    if review.get("artifact_sha256", "").strip().lower() != row.get("sha256", "").strip().lower():
        issues.append("review_hash_mismatch")
    owner = row.get("owner_name", "").strip().casefold()
    creator_role = row.get("created_by_role", "").strip().casefold()
    artifact_type = row.get("artifact_type", "").strip().lower()
    reviewer_name = review.get("reviewer_name", "").strip()
    reviewer_role = review.get("reviewer_role", "").strip()
    if (
        not owner
        or creator_role not in EXPERT_ROLES
        or not reviewer_name
        or reviewer_role not in EXPERT_ROLES
        or reviewer_name.casefold() == owner
        or reviewer_role.casefold() == creator_role
    ):
        issues.append("independent_review_missing")
    if (
        review.get("requested_by_role", "").strip().casefold() != creator_role
        or review.get("requested_by_name", "").strip().casefold() != owner
    ):
        issues.append("review_producer_link_mismatch")
    if (
        row.get("reviewer_name", "").strip() != reviewer_name
        or row.get("reviewer_role", "").strip() != reviewer_role
    ):
        issues.append("artifact_review_link_mismatch")
    if not review.get("acceptance_test", "").strip():
        issues.append("review_acceptance_test_missing")
    try:
        acceptance_checks = json.loads(review.get("acceptance_checks", ""))
    except (TypeError, json.JSONDecodeError):
        acceptance_checks = None
    required_checks = FINAL_ARTIFACT_ACCEPTANCE_CHECKS.get(artifact_type, set())
    if (
        not isinstance(acceptance_checks, list)
        or any(not isinstance(item, str) or not item.strip() for item in acceptance_checks)
        or len(acceptance_checks) != len(set(acceptance_checks))
        or not required_checks.issubset(set(acceptance_checks))
    ):
        issues.append("review_acceptance_checks_incomplete")
    try:
        completed_at = dt.datetime.fromisoformat(review.get("completed_at", "").strip().replace("Z", "+00:00"))
        if completed_at.tzinfo is None:
            issues.append("review_completion_invalid")
    except ValueError:
        issues.append("review_completion_invalid")
    evidence_ref = review.get("evidence_path", "").strip()
    try:
        evidence_path = resolve_inside(project, evidence_ref)
    except ArtifactError:
        evidence_path = None
    if evidence_path is None or not evidence_path.is_file() or evidence_path.stat().st_size == 0:
        issues.append("review_evidence_missing")
    else:
        actual_evidence_hash = sha256_file(evidence_path)
        if review.get("evidence_sha256", "").strip().lower() != actual_evidence_hash:
            issues.append("review_evidence_hash_mismatch")
        try:
            evidence_record = load_json(evidence_path)
        except ContractError:
            evidence_record = None
        if not isinstance(evidence_record, dict) or any(
            evidence_record.get(field) != expected
            for field, expected in {
                "artifact_id": artifact_id,
                "artifact_version": row.get("version", "").strip(),
                "artifact_sha256": row.get("sha256", "").strip().lower(),
                "artifact_type": artifact_type,
                "producer_role": row.get("created_by_role", "").strip(),
                "owner_name": row.get("owner_name", "").strip(),
                "decision": "approved",
                "reviewer_role": reviewer_role,
                "reviewer_name": reviewer_name,
                "acceptance_test": review.get("acceptance_test", "").strip(),
            }.items()
        ) or evidence_record.get("acceptance_checks") != acceptance_checks:
            issues.append("review_evidence_mismatch")
    return (review if not issues else None), issues


def _artifact_claims_actual(row: dict[str, str]) -> bool:
    classification = row.get("classification", "").strip().lower()
    content_state = row.get("content_state", "").strip().lower()
    return classification in ACTUAL_CLASSIFICATIONS or content_state in {"actual", "observed"}


def _artifact_is_synthetic(row: dict[str, str]) -> bool:
    disclosure = " ".join(
        str(row.get(field, "")).strip().lower()
        for field in ("provenance", "content_state", "classification", "notes")
    )
    return any(marker in disclosure for marker in SYNTHETIC_MARKERS)


def _artifact_policy_issues(project: Path, row: dict[str, str], *, final: bool) -> list[str]:
    issues: list[str] = []
    artifact_type = row.get("artifact_type", "").strip().lower()
    if _artifact_claims_actual(row) and (
        _artifact_is_synthetic(row)
        or (artifact_type in ACTUAL_ARTIFACT_TYPES and bool(row.get("ai_use_ledger_ids", "").strip()))
    ):
        issues.append("synthetic_claimed_as_actual")
    if not final:
        return issues
    if artifact_type not in FINAL_ARTIFACT_TYPES:
        issues.append("final_artifact_type_invalid")
    else:
        suffix = Path(row.get("file_path", "")).suffix.lower()
        if suffix not in FINAL_ARTIFACT_EXTENSION_POLICY[artifact_type]:
            issues.append("final_artifact_format_mismatch")
    if row.get("created_by_role", "").strip() not in EXPERT_ROLES:
        issues.append("producer_role_invalid")
    if not row.get("owner_name", "").strip():
        issues.append("owner_name_missing")
    if row.get("rights_status", "").strip().lower() not in ACCEPTED_RIGHTS_STATUSES:
        issues.append("rights_unresolved")
    if row.get("anonymity_status", "").strip().lower() not in ACCEPTED_ANONYMITY_STATUSES:
        issues.append("anonymity_unresolved")
    _, review_issues = _approved_review_for_artifact(project, row)
    issues.extend(review_issues)
    return issues


def _assert_evidence_safe(project: Path, evidence_refs: list[str]) -> None:
    rows = _registry_rows(project)
    normalized_refs = {item.replace("\\", "/").lstrip("./") for item in evidence_refs}
    for row in rows:
        registered = row.get("file_path", "").replace("\\", "/").lstrip("./")
        if registered not in normalized_refs:
            continue
        if "synthetic_claimed_as_actual" in _artifact_policy_issues(project, row, final=False):
            raise DomainBlocked(
                "AI-generated or synthetic material cannot be used as actual field evidence",
                details={"artifact_id": row.get("artifact_id"), "file_path": registered},
            )


def _scope_dimension_applies(dimension: Any, project_value: Any) -> bool:
    if not isinstance(dimension, dict):
        return False
    if dimension.get("mode") == "all":
        return True
    if dimension.get("mode") != "values" or not isinstance(dimension.get("values"), list):
        return False
    expected = str(project_value).strip()
    return expected in {str(item).strip() for item in dimension["values"]}


def _validate_rule_gate(project: Path, domain: dict[str, Any], contracts: Contracts) -> None:
    snapshot_relative = domain.get("competition", {}).get("rule_snapshot", "evidence/rules.json")
    snapshot_path = resolve_inside(project, snapshot_relative)
    payload = load_json(snapshot_path)
    if not isinstance(payload, dict):
        raise DomainBlocked("Rule snapshot root must be an object")
    validate_rules(payload, contracts)
    snapshot = payload["snapshot"]
    project_scope = domain["project"]
    mismatches = {
        field: {"project": project_scope.get(field), "snapshot": snapshot.get(field)}
        for field in ("edition", "group", "region", "track", "stage")
        if str(project_scope.get(field, "")).strip() != str(snapshot.get(field, "")).strip()
    }
    if mismatches:
        raise DomainBlocked("Rule snapshot scope conflicts with project scope", details={"mismatches": mismatches})
    try:
        verified_at = dt.date.fromisoformat(snapshot["verified_at"])
    except (KeyError, TypeError, ValueError) as exc:
        raise DomainBlocked("Rule snapshot verified_at is invalid") from exc
    if verified_at > dt.date.today():
        raise DomainBlocked("Rule snapshot verification date cannot be in the future")
    source_ids = [source["id"] for source in payload["sources"]]
    if len(source_ids) != len(set(source_ids)):
        raise DomainBlocked("Rule snapshot contains duplicate source IDs")
    source_by_id = {source["id"]: source for source in payload["sources"]}
    declared_source_ids = set(snapshot["source_ids"])
    if not declared_source_ids.issubset(source_by_id):
        raise DomainBlocked(
            "Rule snapshot references an unregistered source",
            details={"missing_source_ids": sorted(declared_source_ids - set(source_by_id))},
        )
    today = dt.date.today()
    for source in payload["sources"]:
        try:
            source_verified_at = dt.date.fromisoformat(source["verified_at"])
            source_published_at = dt.date.fromisoformat(source["published_date"])
        except (KeyError, TypeError, ValueError) as exc:
            raise DomainBlocked("Rule source dates are invalid", details={"source_id": source.get("id")}) from exc
        if source_verified_at > today or source_published_at > today:
            raise DomainBlocked("Rule source date cannot be in the future", details={"source_id": source.get("id")})
        source_path = resolve_inside(project, source["local_path"])
        if not source_path.is_file() or source_path.stat().st_size == 0:
            raise DomainBlocked("Rule source provenance file is missing or empty", details={"source_id": source["id"], "path": source["local_path"]})
        if sha256_file(source_path) != source["sha256"]:
            raise DomainBlocked("Rule source provenance hash does not match", details={"source_id": source["id"], "path": source["local_path"]})

    scope_ids = [scope["id"] for scope in payload["scopes"]]
    if len(scope_ids) != len(set(scope_ids)):
        raise DomainBlocked("Rule snapshot contains duplicate scope IDs")
    scope_by_id = {scope["id"]: scope for scope in payload["scopes"]}
    rule_ids = [rule["id"] for rule in payload["rules"]]
    if len(rule_ids) != len(set(rule_ids)):
        raise DomainBlocked("Rule snapshot contains duplicate rule IDs")
    material_severities = {"hard", "fatal", "disqualifying"}
    official_authorities = {
        "national-organizing-committee",
        "regional-organizing-committee",
        "university-organizing-committee",
    }
    for rule in payload["rules"]:
        scope = scope_by_id.get(rule.get("scope_id"))
        source = source_by_id.get(rule.get("source_id"))
        if scope is None:
            raise DomainBlocked("An atomic rule references an unregistered scope", details={"rule_id": rule.get("id")})
        if source is None or rule.get("source_id") not in declared_source_ids:
            raise DomainBlocked("An atomic rule references a source outside the snapshot", details={"rule_id": rule.get("id")})
        if any(not _scope_dimension_applies(scope.get(field), project_scope.get(field)) for field in ("edition", "group", "region", "track", "stage")):
            raise DomainBlocked("An atomic rule does not apply to the project scope", details={"rule_id": rule.get("id"), "scope_id": rule.get("scope_id")})
        if (
            rule.get("source_url") != source.get("url")
            or rule.get("source_title") != source.get("title")
            or rule.get("authority") != source.get("authority_level")
            or rule.get("published_date") != source.get("published_date")
            or rule.get("verified_at") != source.get("verified_at")
        ):
            raise DomainBlocked("An atomic rule conflicts with its registered source", details={"rule_id": rule.get("id"), "source_id": rule.get("source_id")})
        if rule.get("severity") in material_severities and (
            source.get("authority_level") not in official_authorities
            or rule.get("status") not in {"active", "active-for-edition"}
        ):
            raise DomainBlocked("A material rule lacks an active formal authority source", details={"rule_id": rule.get("id"), "source_id": rule.get("source_id")})
    if not any(rule.get("severity") in {"hard", "fatal", "disqualifying"} for rule in payload["rules"]):
        raise DomainBlocked("Rule snapshot has no hard or disqualifying requirements")
    applicable_notice = str(domain.get("competition", {}).get("applicable_notice", "")).strip()
    if _unknown(applicable_notice):
        raise DomainBlocked("Applicable official notice is unresolved")
    registered_notices = {
        str(source["url"]).strip() for source in payload["sources"]
    } | {
        str(source["local_path"]).replace("\\", "/").lstrip("./") for source in payload["sources"]
    }
    normalized_notice = applicable_notice.replace("\\", "/").lstrip("./")
    if normalized_notice not in registered_notices:
        raise DomainBlocked("Applicable notice is not linked to a registered rule source")
    if applicable_notice.startswith(("https://", "http://")):
        if not applicable_notice.startswith("https://"):
            raise DomainBlocked("Applicable notice URL must use HTTPS")
    else:
        notice_path = resolve_inside(project, applicable_notice)
        if not notice_path.is_file() or notice_path.stat().st_size == 0:
            raise DomainBlocked("Applicable notice path is missing or empty")


def set_gate(
    path: str | Path,
    gate_id: str,
    status: str,
    *,
    evidence: list[str],
    owner: str | None = None,
    deadline: str | None = None,
    decision_log_entry: str | None = None,
) -> dict[str, Any]:
    project = normalize_project(path)
    contracts = load_contracts()
    if gate_id not in contracts.gate_ids:
        raise ContractError(f"Unknown gate: {gate_id}")
    if status not in contracts.gates["result_statuses"] or status == "running":
        raise ContractError(f"Unsupported committed gate status: {status}")
    normalized_evidence = [item.replace("\\", "/").lstrip("./") for item in evidence]
    if len(normalized_evidence) != len(set(normalized_evidence)):
        raise ContractError("Gate evidence paths must be unique")
    evidence = normalized_evidence
    if status in ACCEPTED_GATE_STATUSES | {"fail"} and not evidence:
        raise ContractError("Pass, warning, and fail Gate results require at least one evidence path")
    acknowledgement = None
    if status == "warning":
        if not all((owner, deadline, decision_log_entry)):
            raise ContractError("Warning requires --owner, --deadline, and --decision-log-entry")
        try:
            deadline_date = dt.date.fromisoformat(str(deadline))
        except ValueError as exc:
            raise ContractError("Warning deadline must use YYYY-MM-DD") from exc
        if deadline_date < dt.date.today():
            raise DomainBlocked("Warning deadline is already overdue")
        decision_log = project / "evidence" / "decision-log.md"
        if not decision_log.is_file() or str(decision_log_entry) not in decision_log.read_text(encoding="utf-8-sig"):
            raise DomainBlocked(
                "Warning acknowledgement must reference an existing decision-log entry",
                details={"decision_log_entry": decision_log_entry},
            )
        acknowledgement = {"decision_log_entry": decision_log_entry, "owner": owner, "deadline": deadline}

    with project_lock(project, command=f"gate set {gate_id}"):
        domain, state = load_context(project, contracts=contracts)
        before = state["status"]
        for relative in evidence:
            candidate = resolve_inside(project, relative)
            if not candidate.exists():
                raise ArtifactError(f"Gate evidence path is missing: {relative}")
        _assert_evidence_safe(project, evidence)
        if status in ACCEPTED_GATE_STATUSES:
            if gate_id == "rule":
                _validate_rule_gate(project, domain, contracts)
            missing_requirements = _missing_gate_requirements(
                project,
                domain,
                contracts.gate_definition(gate_id),
                evidence,
            )
            if missing_requirements:
                raise DomainBlocked(
                    "Gate cannot pass because required evidence is unresolved",
                    details={"gate": gate_id, "missing_requirements": missing_requirements},
                )
        fingerprint, evidence_records = _gate_fingerprint(
            project,
            domain,
            contracts.gate_definition(gate_id),
            evidence,
        ) if evidence else (canonical_hash([]), [])
        run = _new_run(f"gate:{gate_id}", fingerprint)
        state["run"] = run
        evaluation_id = new_id(f"gate-{gate_id}")
        result_relative = f"{AUDITS_REL}/{evaluation_id}.json"
        gate_result = {
            "gate": gate_id,
            "evaluation_id": evaluation_id,
            "status": status,
            "evaluated_at": utc_now(),
            "input_fingerprint": fingerprint,
            "evidence_refs": evidence,
            "evidence_records": evidence_records,
            "fatal_count": 1 if status in {"fail", "unknown"} else 0,
            "warning_count": 1 if status == "warning" else 0,
            "acknowledgement": acknowledgement,
        }
        atomic_write_json(project / result_relative, gate_result)
        result_sha256 = sha256_file(project / result_relative)
        state["gates"][gate_id] = {
            "status": status,
            "evaluation_id": evaluation_id,
            "evaluated_at": gate_result["evaluated_at"],
            "input_fingerprint": fingerprint,
            "result_path": result_relative,
            "result_sha256": result_sha256,
            "fatal_count": gate_result["fatal_count"],
            "warning_count": gate_result["warning_count"],
            "evidence_refs": evidence,
            "acknowledgement": acknowledgement,
        }
        current_index = contracts.gate_ids.index(gate_id)
        invalidated: list[str] = []
        for downstream in contracts.gate_ids[current_index + 1:]:
            if state["gates"][downstream]["status"] not in {"not_run", "unknown"}:
                state["gates"][downstream]["status"] = "stale"
                invalidated.append(downstream)
        validate_state(state, contracts)
        append_event(
            project,
            state,
            "gate_completed",
            run_id=run["run_id"],
            node_id=f"gate:{gate_id}",
            payload={
                "gate": gate_id,
                "status": status,
                "evaluation_id": evaluation_id,
                "gate_record": state["gates"][gate_id],
                "invalidated_gates": invalidated,
            },
        )
        for downstream in invalidated:
            append_event(project, state, "gate_invalidated", run_id=run["run_id"], node_id=f"gate:{downstream}", severity="warning", payload={"cause": f"upstream gate {gate_id} changed"})
        _fault_inject("gate.after_event_before_state")
        _finish_run(state, "succeeded")
        _save_state(project, state, contracts)
        return result_envelope(project, state, command="gate set", run_id=run["run_id"], status_before=before, extra={
            "gate": gate_id,
            "gate_result": gate_result,
            "gate_result_sha256": result_sha256,
            "invalidated_gates": invalidated,
        })


def _snapshot_artifacts(project: Path, relative_paths: list[str]) -> tuple[str, list[dict[str, Any]]]:
    usable: list[str] = []
    for relative in relative_paths:
        if relative in {"agent-state.json", STATE_REL}:
            continue
        candidate = resolve_inside(project, relative)
        if candidate.exists():
            usable.append(relative)
    return fingerprint_paths(project, usable) if usable else (canonical_hash([]), [])


def _create_checkpoint(
    project: Path,
    state: dict[str, Any],
    *,
    run_id: str,
    label: str,
    relative_paths: list[str],
) -> dict[str, Any]:
    fingerprint, artifacts = _snapshot_artifacts(project, relative_paths)
    checkpoint_id = new_id("cp")
    safe_label = re.sub(r"[^A-Za-z0-9._:-]+", "-", label).strip("-")[:80] or "checkpoint"
    record = {
        "checkpoint_id": checkpoint_id,
        "project_id": state["project_id"],
        "workflow_version": state["workflow"]["version"],
        "gate_contract_version": state["workflow"]["gate_contract_version"],
        "run_id": run_id,
        "node_id": f"checkpoint:{safe_label}",
        "created_at": utc_now(),
        "status_revision": state["status_revision"],
        "project_revision": state["project_revision"],
        "event_sequence": state["event_stream"]["last_sequence"],
        "previous_checkpoint_id": (state.get("latest_checkpoint") or {}).get("checkpoint_id"),
        "input_fingerprint": fingerprint,
        "artifacts": artifacts,
        "resumable": True,
    }
    record["record_sha256"] = canonical_hash(record)
    validate_checkpoint(record, load_contracts())
    atomic_write_json(project / CHECKPOINTS_REL / f"{checkpoint_id}.json", record)
    state["latest_checkpoint"] = record
    append_event(project, state, "checkpoint_committed", run_id=run_id, node_id=record["node_id"], checkpoint_id=checkpoint_id, payload={"artifact_count": len(artifacts), "label": label})
    return record


def create_checkpoint(path: str | Path, *, label: str) -> dict[str, Any]:
    project = normalize_project(path)
    contracts = load_contracts()
    with project_lock(project, command="checkpoint"):
        _, state = load_context(project, contracts=contracts)
        before = state["status"]
        relative_paths = ["project.yaml", "evidence/rules.json", "evidence/evidence-ledger.csv", "evidence/decision-log.md", "evidence/artifact-registry.csv", "evidence/team-tasks.csv", "evidence/blockers.csv", "evidence/review-queue.csv"]
        relative_paths.extend(row.get("file_path", "") for row in _registry_rows(project) if row.get("file_path", ""))
        fingerprint, _ = _snapshot_artifacts(project, relative_paths)
        run = _new_run("checkpoint", fingerprint)
        state["run"] = run
        checkpoint = _create_checkpoint(project, state, run_id=run["run_id"], label=label, relative_paths=relative_paths)
        _finish_run(state, "succeeded")
        _save_state(project, state, contracts)
        return result_envelope(project, state, command="checkpoint", run_id=run["run_id"], status_before=before, extra={"checkpoint": checkpoint})


def _load_committed_checkpoint(
    project: Path,
    state: dict[str, Any],
    requested: str,
    contracts: Contracts,
) -> dict[str, Any]:
    if requested == "latest":
        state_reference = state.get("latest_checkpoint")
        if not state_reference:
            raise DomainBlocked("No resumable checkpoint exists")
        checkpoint_id = state_reference["checkpoint_id"]
    else:
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", requested):
            raise ContractError("Checkpoint ID is invalid")
        checkpoint_id = requested
        state_reference = state.get("latest_checkpoint") if (state.get("latest_checkpoint") or {}).get("checkpoint_id") == checkpoint_id else None
    stored_path = resolve_inside(project, f"{CHECKPOINTS_REL}/{checkpoint_id}.json")
    stored = load_json(stored_path)
    if not isinstance(stored, dict):
        raise ContractError("Checkpoint record root must be an object")
    validate_checkpoint(stored, contracts)
    if stored.get("checkpoint_id") != checkpoint_id:
        raise ConflictError("Checkpoint filename and record ID differ")
    unsigned = dict(stored)
    declared_hash = unsigned.pop("record_sha256", None)
    if declared_hash != canonical_hash(unsigned):
        raise ConflictError("Checkpoint record hash is invalid")
    if stored.get("project_id") != state["project_id"]:
        raise ConflictError("Checkpoint belongs to a different project")
    if stored.get("workflow_version") != state["workflow"]["version"] or stored.get("gate_contract_version") != state["workflow"]["gate_contract_version"]:
        raise ConflictError("Checkpoint contract version differs from current state")
    if stored["status_revision"] > state["status_revision"] or stored["project_revision"] > state["project_revision"]:
        raise ConflictError("Checkpoint revision is newer than authoritative state")
    if state_reference is not None and canonical_hash(stored) != canonical_hash(state_reference):
        raise ConflictError("Stored checkpoint differs from the authoritative state reference")
    event_scan = scan_event_stream(resolve_inside(project, state["event_stream"]["path"]))
    committed = any(
        event.get("type") == "checkpoint_committed" and event.get("checkpoint_id") == checkpoint_id
        for event in event_scan["events"]
    )
    if not committed:
        raise ConflictError("Checkpoint has no checkpoint_committed event")
    if not stored.get("resumable"):
        raise DomainBlocked("Selected checkpoint is not resumable")
    return stored


def _checkpoint_reference_errors(
    project: Path,
    state: dict[str, Any],
    contracts: Contracts,
    requested: str = "latest",
    *,
    expected_file_sha256: str | None = None,
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    try:
        record = _load_committed_checkpoint(project, state, requested, contracts)
    except (ArtifactError, ConflictError, ContractError, DomainBlocked) as exc:
        return None, [{"code": "checkpoint_missing_or_invalid", "checkpoint": requested, "message": str(exc)}]
    checkpoint_id = str(record["checkpoint_id"])
    checkpoint_path = resolve_inside(project, f"{CHECKPOINTS_REL}/{checkpoint_id}.json")
    actual_file_sha256 = sha256_file(checkpoint_path)
    if expected_file_sha256 is not None and actual_file_sha256 != expected_file_sha256:
        return record, [{
            "code": "checkpoint_record_changed",
            "checkpoint": checkpoint_id,
            "expected": expected_file_sha256,
            "actual": actual_file_sha256,
        }]
    artifact_errors: list[dict[str, Any]] = []
    for artifact in record.get("artifacts", []):
        try:
            candidate = resolve_inside(project, str(artifact.get("path", "")))
        except ArtifactError as exc:
            artifact_errors.append({"code": "checkpoint_artifact_path_invalid", "message": str(exc)})
            continue
        if not candidate.is_file():
            artifact_errors.append({"code": "checkpoint_artifact_missing", "path": artifact.get("path")})
        elif candidate.stat().st_size != artifact.get("size_bytes") or sha256_file(candidate) != artifact.get("sha256"):
            artifact_errors.append({"code": "checkpoint_artifact_changed", "path": artifact.get("path")})
    return record, artifact_errors


def _artifact_exists(project: Path, relative: str) -> bool:
    if relative == "agent-state.json":
        return (project / STATE_REL).is_file()
    candidate = resolve_inside(project, relative)
    if candidate.is_file():
        return candidate.stat().st_size > 0
    if candidate.is_dir():
        return any(item.is_file() for item in candidate.rglob("*"))
    return False


def _gate_result_is_current(project: Path, gate_id: str, record: dict[str, Any]) -> bool:
    result_relative = record.get("result_path")
    expected_hash = record.get("result_sha256")
    if not isinstance(result_relative, str) or not isinstance(expected_hash, str):
        return False
    if not re.fullmatch(r"[a-f0-9]{64}", expected_hash):
        return False
    try:
        result_path = resolve_inside(project, result_relative)
    except ArtifactError:
        return False
    if not result_path.is_file() or result_path.stat().st_size == 0 or sha256_file(result_path) != expected_hash:
        return False
    try:
        result = load_json(result_path)
    except ContractError:
        return False
    if not isinstance(result, dict):
        return False
    if record.get("status") in ACCEPTED_GATE_STATUSES:
        expected = {
            "gate": gate_id,
            "evaluation_id": record.get("evaluation_id"),
            "status": record.get("status"),
            "input_fingerprint": record.get("input_fingerprint"),
            "evidence_refs": record.get("evidence_refs"),
            "fatal_count": record.get("fatal_count"),
            "warning_count": record.get("warning_count"),
            "acknowledgement": record.get("acknowledgement"),
        }
        if any(result.get(field) != value for field, value in expected.items()):
            return False
    return True


def _refresh_gate_drift(
    project: Path,
    domain: dict[str, Any],
    state: dict[str, Any],
    required_gates: list[str],
    contracts: Contracts,
) -> list[str]:
    stale: list[str] = []
    for gate_id in required_gates:
        record = state["gates"][gate_id]
        if record["status"] not in ACCEPTED_GATE_STATUSES or not record["evidence_refs"]:
            continue
        if not _gate_result_is_current(project, gate_id, record):
            record["status"] = "stale"
            stale.append(gate_id)
            continue
        acknowledgement = record.get("acknowledgement")
        if record["status"] == "warning" and acknowledgement:
            try:
                if dt.date.fromisoformat(acknowledgement["deadline"]) < dt.date.today():
                    record["status"] = "stale"
                    stale.append(gate_id)
                    continue
            except (KeyError, TypeError, ValueError):
                record["status"] = "stale"
                stale.append(gate_id)
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
            record["status"] = "stale"
            stale.append(gate_id)
    return stale


def _active_project_risks(project: Path, domain: dict[str, Any], severities: set[str]) -> list[dict[str, Any]]:
    active: list[dict[str, Any]] = []
    risks = domain.get("risks", {})
    if not isinstance(risks, dict):
        return [{"severity": "unknown", "risk": "invalid risks record"}]
    for severity in sorted(severities):
        items = risks.get(severity, [])
        if not isinstance(items, list):
            active.append({"severity": severity, "risk": "invalid risk list"})
            continue
        for index, item in enumerate(items, start=1):
            if isinstance(item, str):
                active.append({"severity": severity, "id": f"{severity}-{index}", "summary": item})
            elif isinstance(item, dict):
                status = str(item.get("status", "")).strip().lower()
                if status == "resolved":
                    continue
                if status == "accepted" and severity != "fatal":
                    try:
                        evidence = resolve_inside(project, str(item.get("acceptance_evidence", "")))
                    except ArtifactError:
                        evidence = None
                    expected_hash = str(item.get("acceptance_evidence_sha256", "")).strip().lower()
                    if evidence is not None and evidence.is_file() and expected_hash == sha256_file(evidence):
                        continue
                active.append({"severity": severity, **item})
    return active


def _handoff_control_fingerprint(
    project: Path,
    domain: dict[str, Any],
    state: dict[str, Any],
    snapshots: list[dict[str, Any]],
    *,
    sealed_revision: int | None = None,
) -> str:
    tracked_files: dict[str, str | None] = {}
    for relative in ("evidence/blockers.csv", "evidence/artifact-registry.csv", "evidence/review-queue.csv"):
        candidate = resolve_inside(project, relative)
        tracked_files[relative] = sha256_file(candidate) if candidate.is_file() else None
    governance_evidence: dict[str, str | None] = {}
    blocker_rows: list[dict[str, str]] = []
    blocker_table = project / "evidence" / "blockers.csv"
    if blocker_table.is_file():
        _, blocker_rows = read_csv_rows(blocker_table)
    for blocker in blocker_rows:
        evidence_ref = blocker.get("resolution_evidence", "").strip()
        if evidence_ref:
            try:
                candidate = resolve_inside(project, evidence_ref)
            except ArtifactError:
                candidate = None
            governance_evidence[evidence_ref] = sha256_file(candidate) if candidate is not None and candidate.is_file() else None
            governance_record: Any = None
            if candidate is not None and candidate.is_file():
                try:
                    governance_record = load_json(candidate)
                except ContractError:
                    governance_record = None
            references = governance_record.get("evidence_refs", []) if isinstance(governance_record, dict) else []
            if isinstance(references, list):
                for index, reference in enumerate(references):
                    if not isinstance(reference, dict):
                        continue
                    referenced_path = str(reference.get("path", "")).strip()
                    if not referenced_path:
                        continue
                    try:
                        referenced = resolve_inside(project, referenced_path)
                    except ArtifactError:
                        referenced = None
                    governance_evidence[
                        f"{evidence_ref}#evidence_ref:{index}:{referenced_path}"
                    ] = sha256_file(referenced) if referenced is not None and referenced.is_file() else None
    for severity, risks in domain.get("risks", {}).items():
        if not isinstance(risks, list):
            continue
        for risk in risks:
            if not isinstance(risk, dict) or risk.get("status") != "accepted":
                continue
            evidence_ref = str(risk.get("acceptance_evidence", "")).strip()
            if not evidence_ref:
                continue
            try:
                candidate = resolve_inside(project, evidence_ref)
            except ArtifactError:
                candidate = None
            governance_evidence[f"risk:{severity}:{evidence_ref}"] = sha256_file(candidate) if candidate is not None and candidate.is_file() else None
    return canonical_hash({
        "project_id": state["project_id"],
        "status_revision": state["status_revision"] if sealed_revision is None else sealed_revision,
        "gates": state["gates"],
        "risks": domain.get("risks", {}),
        "required_final_artifact_types": domain.get("deliverables", {}).get("required_final_artifact_types"),
        "tracked_files": tracked_files,
        "governance_evidence": governance_evidence,
        "artifact_snapshots": snapshots,
    })


def _final_manifest_errors(
    project: Path,
    domain: dict[str, Any],
    state: dict[str, Any],
    contracts: Contracts,
) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    manifest_path = resolve_inside(project, "reviews/final-manifest.json")
    try:
        manifest = load_json(manifest_path)
    except ContractError as exc:
        return [{"code": "manifest_missing_or_invalid", "message": str(exc)}]
    if not isinstance(manifest, dict):
        return [{"code": "manifest_root_invalid"}]
    try:
        validate_final_handoff(manifest, contracts)
    except ContractError as exc:
        errors.append({"code": "manifest_schema_invalid", "details": exc.details})
    if manifest.get("project_id") != state["project_id"]:
        errors.append({"code": "manifest_project_mismatch"})
    manifest_state = manifest.get("current_state")
    if not isinstance(manifest_state, dict):
        errors.append({"code": "manifest_current_state_invalid"})
    else:
        sealed_checkpoint_id = manifest_state.get("checkpoint_id")
        sealed_checkpoint_sha256 = manifest_state.get("checkpoint_record_sha256")
        if not isinstance(sealed_checkpoint_id, str) or not isinstance(sealed_checkpoint_sha256, str):
            errors.append({"code": "manifest_checkpoint_reference_invalid"})
        else:
            _, checkpoint_errors = _checkpoint_reference_errors(
                project,
                state,
                contracts,
                sealed_checkpoint_id,
                expected_file_sha256=sealed_checkpoint_sha256,
            )
            errors.extend(checkpoint_errors)
    delivery = manifest.get("delivery")
    if not isinstance(delivery, dict) or delivery.get("go_no_go") != "go":
        errors.append({"code": "manifest_not_go"})
        delivery = delivery if isinstance(delivery, dict) else {}
    declared_hash = delivery.get("manifest_sha256")
    unsigned = copy.deepcopy(manifest)
    unsigned_delivery = unsigned.get("delivery")
    if isinstance(unsigned_delivery, dict):
        unsigned_delivery.pop("manifest_sha256", None)
    if not isinstance(declared_hash, str) or not re.fullmatch(r"[a-f0-9]{64}", declared_hash) or declared_hash != canonical_hash(unsigned):
        errors.append({"code": "manifest_self_hash_invalid"})
    handoff_id = manifest.get("handoff_id")
    if not isinstance(handoff_id, str) or not handoff_id.strip():
        errors.append({"code": "handoff_id_missing"})
    snapshots = manifest.get("artifact_snapshots")
    if not isinstance(snapshots, list) or not snapshots:
        errors.append({"code": "artifact_snapshots_missing"})
    else:
        seen_artifact_ids: set[str] = set()
        seen_file_paths: set[str] = set()
        seen_artifact_hashes: set[str] = set()
        for snapshot in snapshots:
            if not isinstance(snapshot, dict):
                errors.append({"code": "artifact_snapshot_invalid"})
                continue
            artifact_id = str(snapshot.get("artifact_id", ""))
            if not artifact_id or artifact_id in seen_artifact_ids:
                errors.append({"code": "artifact_snapshot_id_missing_or_duplicate", "artifact_id": artifact_id})
            seen_artifact_ids.add(artifact_id)
            file_path = str(snapshot.get("file_path", ""))
            artifact_hash = str(snapshot.get("sha256", ""))
            if file_path in seen_file_paths:
                errors.append({"code": "artifact_snapshot_file_path_duplicate", "file_path": file_path})
            if artifact_hash in seen_artifact_hashes:
                errors.append({"code": "artifact_snapshot_sha256_duplicate", "sha256": artifact_hash})
            seen_file_paths.add(file_path)
            seen_artifact_hashes.add(artifact_hash)
            try:
                candidate = resolve_inside(project, file_path)
            except ArtifactError as exc:
                errors.append({"code": "artifact_snapshot_path_invalid", "message": str(exc)})
                continue
            if not candidate.is_file():
                errors.append({"code": "artifact_snapshot_missing", "file_path": snapshot.get("file_path")})
            elif snapshot.get("sha256") != sha256_file(candidate) or snapshot.get("bytes") != candidate.stat().st_size:
                errors.append({"code": "artifact_snapshot_changed", "file_path": snapshot.get("file_path")})
            try:
                review_evidence = resolve_inside(project, str(snapshot.get("review_evidence_path", "")))
            except ArtifactError as exc:
                errors.append({"code": "review_evidence_path_invalid", "artifact_id": artifact_id, "message": str(exc)})
                continue
            if not review_evidence.is_file():
                errors.append({"code": "review_evidence_missing", "artifact_id": artifact_id})
            elif snapshot.get("review_evidence_sha256") != sha256_file(review_evidence):
                errors.append({"code": "review_evidence_changed", "artifact_id": artifact_id})
        required_types = delivery.get("required_final_artifact_types")
        snapshot_types = {str(item.get("artifact_type", "")) for item in snapshots if isinstance(item, dict)}
        if not isinstance(required_types, list) or not set(required_types).issubset(snapshot_types):
            errors.append({"code": "required_final_artifact_types_missing"})
        final_ids = delivery.get("final_artifact_ids")
        if not isinstance(final_ids, list) or set(final_ids) != seen_artifact_ids or len(final_ids) != len(seen_artifact_ids):
            errors.append({"code": "delivery_artifact_ids_mismatch"})
    audit = manifest.get("aggregate_audit")
    if not isinstance(audit, dict):
        errors.append({"code": "aggregate_audit_invalid"})
    else:
        try:
            audit_path = resolve_inside(project, str(audit.get("path", "")))
        except ArtifactError as exc:
            errors.append({"code": "aggregate_audit_path_invalid", "message": str(exc)})
            audit_path = None
        if audit_path is None or not audit_path.is_file():
            errors.append({"code": "aggregate_audit_missing"})
        elif audit.get("sha256") != sha256_file(audit_path):
            errors.append({"code": "aggregate_audit_changed"})
        else:
            try:
                audit_record = load_json(audit_path)
            except ContractError as exc:
                errors.append({"code": "aggregate_audit_unreadable", "message": str(exc)})
                audit_record = None
            if not isinstance(audit_record, dict) or audit_record.get("project_id") != state["project_id"] or audit_record.get("status") != "passed":
                errors.append({"code": "aggregate_audit_not_passing"})
    quality_gates = manifest.get("quality_gates")
    if isinstance(quality_gates, list):
        manifest_gates = {
            item.get("gate"): item for item in quality_gates
            if isinstance(item, dict) and isinstance(item.get("gate"), str)
        }
        if set(manifest_gates) != set(contracts.gate_ids) or any(
            manifest_gates[gate].get("status") != state["gates"][gate].get("status")
            or manifest_gates[gate].get("input_fingerprint") != state["gates"][gate].get("input_fingerprint")
            or manifest_gates[gate].get("result_path") != state["gates"][gate].get("result_path")
            or manifest_gates[gate].get("result_sha256") != state["gates"][gate].get("result_sha256")
            or manifest_gates[gate].get("evidence_refs") != state["gates"][gate].get("evidence_refs")
            for gate in contracts.gate_ids
            if gate in manifest_gates
        ):
            errors.append({"code": "manifest_gate_snapshot_mismatch"})
    if isinstance(snapshots, list) and snapshots:
        sealed_revision = (manifest.get("current_state") or {}).get("status_revision")
        expected_control_fingerprint = _handoff_control_fingerprint(
            project,
            domain,
            state,
            snapshots,
            sealed_revision=sealed_revision if isinstance(sealed_revision, int) else None,
        )
        if manifest.get("control_fingerprint") != expected_control_fingerprint:
            errors.append({"code": "handoff_control_fingerprint_changed"})
    if isinstance(declared_hash, str) and isinstance(handoff_id, str):
        stream = scan_event_stream(resolve_inside(project, state["event_stream"]["path"]))
        committed = any(
            event.get("type") == "handoff_completed"
            and event.get("payload", {}).get("handoff_id") == handoff_id
            and event.get("payload", {}).get("manifest_sha256") == declared_hash
            for event in stream["events"]
        )
        if not committed:
            errors.append({"code": "handoff_completion_event_missing"})
    return errors


def advance_project(path: str | Path, *, target: str | None, expected_revision: int | None) -> dict[str, Any]:
    project = normalize_project(path)
    contracts = load_contracts()
    with project_lock(project, command="advance"):
        domain, state = load_context(project, contracts=contracts)
        before = state["status"]
        transition = contracts.transition_from(before)
        if transition is None:
            raise DomainBlocked("Project is already at the terminal workflow state")
        target = target or transition["to"]
        if contracts.transition_to(before, target) is None:
            raise ContractError("Only the declared adjacent workflow transition is allowed", details={"from": before, "requested": target, "allowed": transition["to"]})
        if expected_revision is not None and expected_revision != state["status_revision"]:
            raise ConflictError("Expected status revision does not match", details={"expected": expected_revision, "actual": state["status_revision"]})

        run = _new_run(f"advance:{before}:{target}", canonical_hash({"state": state["status_revision"], "target": target}))
        state["run"] = run
        append_event(project, state, "transition_requested", run_id=run["run_id"], payload={"from": before, "to": target})
        required_gates = list(transition.get("required_gates", []))
        stale = _refresh_gate_drift(project, domain, state, required_gates, contracts)
        for gate_id in stale:
            append_event(project, state, "gate_invalidated", run_id=run["run_id"], node_id=f"gate:{gate_id}", severity="warning", payload={"cause": "evidence fingerprint changed"})
        blocking_gates = [gate_id for gate_id in required_gates if state["gates"][gate_id]["status"] not in ACCEPTED_GATE_STATUSES]
        missing_artifacts = [relative for relative in transition.get("required_artifacts", []) if not _artifact_exists(project, relative)]
        boundary_severities = {"fatal", "high"} if target in {"submission_ready", "closed"} else {"fatal"}
        boundary_blockers = [
            row for row in _unresolved_blockers(project)
            if row.get("severity", "").strip().lower() in boundary_severities
        ]
        boundary_risks = _active_project_risks(project, domain, boundary_severities)
        manifest_errors = _final_manifest_errors(project, domain, state, contracts) if target == "closed" and not missing_artifacts else []
        if blocking_gates or missing_artifacts or boundary_blockers or boundary_risks or manifest_errors:
            details = {
                "blocking_gates": blocking_gates,
                "missing_artifacts": missing_artifacts,
                "fatal_or_high_blockers": boundary_blockers,
                "fatal_or_high_risks": boundary_risks,
                "manifest_errors": manifest_errors,
            }
            append_event(project, state, "transition_blocked", run_id=run["run_id"], severity="error", payload=details)
            _finish_run(state, "blocked")
            _save_state(project, state, contracts)
            raise DomainBlocked("Workflow transition is blocked", details=details)

        checkpoint = _create_checkpoint(
            project,
            state,
            run_id=run["run_id"],
            label=f"before-{target}",
            # The status mirror in project.yaml changes as part of the commit, so it
            # is deliberately excluded from the pre-transition artifact snapshot.
            relative_paths=[
                item
                for item in transition.get("required_artifacts", [])
                if item not in {"project.yaml", "agent-state.json", STATE_REL}
            ],
        )
        _fault_inject("advance.after_checkpoint_before_state")
        state["status"] = target
        state["project_status_mirror"] = target
        state["status_revision"] += 1
        state["project_revision"] += 1
        state["active_node"] = None
        transition_record = {
            "transition_id": new_id("transition"),
            "from": before,
            "to": target,
            "committed_at": utc_now(),
            "run_id": run["run_id"],
            "checkpoint_id": checkpoint["checkpoint_id"],
            "status_revision": state["status_revision"],
            "required_gates": required_gates,
            "gate_snapshot_sha256": canonical_hash(state["gates"]),
        }
        state["transition_history"].append(transition_record)
        _finish_run(state, "succeeded")
        _save_state(project, state, contracts)
        _fault_inject("advance.after_state_before_mirror")

        domain["project"]["status"] = target
        domain["project"]["updated_at"] = utc_now()[:10]
        domain["control_plane"]["status_mirror_revision"] = state["status_revision"]
        validate_project(domain, contracts)
        atomic_write_yaml(project / "project.yaml", domain)
        append_event(project, state, "transition_committed", run_id=run["run_id"], checkpoint_id=checkpoint["checkpoint_id"], payload=transition_record)
        _fault_inject("advance.after_commit_event_before_state")
        _save_state(project, state, contracts)
        return result_envelope(project, state, command="advance", run_id=run["run_id"], status_before=before, extra={"transition": transition_record})


def _table_mutation(
    *,
    relative: str,
    key_field: str,
    key_value: str,
    before: dict[str, str] | None,
    after: dict[str, str],
) -> dict[str, Any]:
    return {
        "path": relative,
        "key_field": key_field,
        "key_value": key_value,
        "before_row_sha256": canonical_hash(before) if before is not None else None,
        "after_row_sha256": canonical_hash(after),
        "after_row": after,
    }


def _replay_table_mutation(project: Path, mutation: dict[str, Any]) -> None:
    relative = str(mutation.get("path", ""))
    table = resolve_inside(project, relative)
    if not table.is_file():
        raise ConflictError("Recovery table is missing", details={"path": relative})
    fields, rows = read_csv_rows(table)
    key_field = str(mutation.get("key_field", ""))
    key_value = str(mutation.get("key_value", ""))
    after = mutation.get("after_row")
    if not key_field or not key_value or not isinstance(after, dict):
        raise ConflictError("Recovery table mutation is malformed", details={"path": relative})
    index = next((position for position, row in enumerate(rows) if row.get(key_field) == key_value), None)
    current = rows[index] if index is not None else None
    current_hash = canonical_hash(current) if current is not None else None
    after_hash = str(mutation.get("after_row_sha256", ""))
    before_hash = mutation.get("before_row_sha256")
    if current_hash == after_hash:
        return
    if current_hash != before_hash:
        raise ConflictError(
            "Recovery refuses to overwrite a table row changed after the interrupted operation",
            details={"path": relative, "key_field": key_field, "key_value": key_value},
        )
    normalized = {field: str(after.get(field, "")) for field in fields}
    if index is None:
        rows.append(normalized)
    else:
        rows[index] = normalized
    atomic_write_csv(table, fields, rows)


def _replay_event_tail(
    project: Path,
    domain: dict[str, Any],
    state: dict[str, Any],
    contracts: Contracts,
) -> list[dict[str, Any]]:
    cursor = state["event_stream"]
    actual = scan_event_stream(resolve_inside(project, cursor["path"]))
    expected_sequence = int(cursor.get("last_sequence", 0))
    if actual["last_sequence"] < expected_sequence:
        raise ConflictError("Event stream is shorter than the committed state cursor")
    if expected_sequence:
        committed = actual["events"][expected_sequence - 1]
        if committed.get("event_id") != cursor.get("last_event_id") or committed.get("event_hash") != cursor.get("stream_sha256"):
            raise ConflictError("Event stream prefix does not match the committed state cursor")
    elif cursor.get("last_event_id") is not None or cursor.get("stream_sha256") is not None:
        raise ConflictError("Zero event cursor contains non-empty identifiers")
    tail = actual["events"][expected_sequence:]
    if not tail:
        return []
    run_ids = {event.get("run_id") for event in tail}
    if len(run_ids) != 1 or None in run_ids:
        raise ConflictError("Unknown interleaved event tail cannot be recovered safely")
    allowed_types = {
        "run_started", "run_completed", "run_failed", "gate_completed", "gate_invalidated",
        "checkpoint_committed", "transition_requested", "transition_blocked", "transition_committed",
        "event_cursor_reconciled", "mirror_reconciled", "run_resumed", "task_added",
        "task_status_changed", "blocker_added", "blocker_resolved", "blocker_waived",
        "artifact_registered", "artifact_finalized", "review_approved", "handoff_requested",
        "handoff_completed", "handoff_blocked",
    }
    for event in tail:
        event_type = str(event.get("type", ""))
        if event_type not in allowed_types:
            raise ConflictError("Unknown event tail type cannot be recovered safely", details={"event_type": event_type})
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        mutation = payload.get("table_mutation")
        if mutation is not None:
            if not isinstance(mutation, dict):
                raise ConflictError("Event table mutation is malformed")
            _replay_table_mutation(project, mutation)
        if event_type == "gate_completed" and isinstance(payload.get("gate_record"), dict):
            gate_id = str(payload.get("gate", ""))
            if gate_id not in contracts.gate_ids:
                raise ConflictError("Recovered event references an unknown Gate", details={"gate": gate_id})
            gate_record = payload["gate_record"]
            if not _gate_result_is_current(project, gate_id, gate_record):
                raise ConflictError(
                    "Recovered Gate result file is missing, changed, or inconsistent",
                    details={"gate": gate_id, "result_path": gate_record.get("result_path")},
                )
            state["gates"][gate_id] = gate_record
            for downstream in payload.get("invalidated_gates", []):
                if downstream in state["gates"]:
                    state["gates"][downstream]["status"] = "stale"
        if event_type == "checkpoint_committed" and event.get("checkpoint_id"):
            checkpoint_path = resolve_inside(project, f"{CHECKPOINTS_REL}/{event['checkpoint_id']}.json")
            checkpoint_record = load_json(checkpoint_path)
            if not isinstance(checkpoint_record, dict):
                raise ConflictError("Recovered checkpoint record is invalid")
            validate_checkpoint(checkpoint_record, contracts)
            state["latest_checkpoint"] = checkpoint_record
        if event_type == "transition_committed" and isinstance(payload, dict) and payload.get("transition_id"):
            if not any(item.get("transition_id") == payload["transition_id"] for item in state["transition_history"]):
                if state["status"] != payload.get("from") or int(payload.get("status_revision", -1)) != state["status_revision"] + 1:
                    raise ConflictError("Recovered transition does not extend authoritative state")
                state["status"] = payload["to"]
                state["project_status_mirror"] = payload["to"]
                state["status_revision"] = payload["status_revision"]
                state["project_revision"] += 1
                state["transition_history"].append(payload)
        cursor.update({
            "last_sequence": event["sequence"],
            "last_event_id": event["event_id"],
            "stream_sha256": event["event_hash"],
        })
    return tail


def _record_recovery_failure(state: dict[str, Any], message: str) -> None:
    retry_count = int(state["recovery"].get("retry_count", 0)) + 1
    max_retries = int(state["recovery"].get("max_retries", 3))
    state["recovery"] = {
        "status": "exhausted" if retry_count >= max_retries else "needed",
        "resume_from_checkpoint_id": (state.get("latest_checkpoint") or {}).get("checkpoint_id"),
        "retry_count": retry_count,
        "max_retries": max_retries,
        "last_failure": {
            "code": "recovery_conflict",
            "class": "integrity",
            "message": message,
            "retryable": retry_count < max_retries,
            "occurred_at": utc_now(),
        },
    }
    state["updated_at"] = utc_now()


def resume_project(path: str | Path, *, checkpoint: str = "latest") -> dict[str, Any]:
    project = normalize_project(path)
    contracts = load_contracts()
    with project_lock(project, command="resume"):
        domain, state = load_context(
            project,
            contracts=contracts,
            allow_mirror_mismatch=True,
            allow_event_cursor_mismatch=True,
        )
        before = state["status"]
        if state["recovery"].get("status") == "exhausted":
            raise DomainBlocked("Recovery retry limit is exhausted; preserve evidence and resolve the integrity conflict manually")
        try:
            recovered_tail = _replay_event_tail(project, domain, state, contracts)
        except (ArtifactError, ConflictError, ContractError) as exc:
            _record_recovery_failure(state, str(exc))
            _save_state(project, state, contracts)
            raise
        cursor_reconciled = bool(recovered_tail)
        selected: dict[str, Any] | None = None
        if checkpoint != "latest" or state.get("latest_checkpoint") is not None:
            selected = _load_committed_checkpoint(project, state, checkpoint, contracts)
        run = _new_run("resume", canonical_hash({"checkpoint": checkpoint, "status": before}))
        state["run"] = run
        if cursor_reconciled:
            append_event(
                project,
                state,
                "event_cursor_reconciled",
                run_id=run["run_id"],
                severity="warning",
                payload={"last_sequence": state["event_stream"]["last_sequence"]},
            )
        mirror_reconciled = False
        domain_status = domain.get("project", {}).get("status")
        state_mirror_status = state.get("project_status_mirror")
        if state_mirror_status != state["status"]:
            state["project_status_mirror"] = state["status"]
            mirror_reconciled = True
            append_event(
                project,
                state,
                "mirror_reconciled",
                run_id=run["run_id"],
                payload={"source": "state.project_status_mirror", "from": state_mirror_status, "to": state["status"]},
            )
        if domain_status != state["status"]:
            mirror_revision = domain.get("control_plane", {}).get("status_mirror_revision", -1)
            if mirror_revision > state["status_revision"]:
                raise ConflictError("project.yaml has a newer mirror revision; refusing automatic overwrite")
            domain["project"]["status"] = state["status"]
            domain["control_plane"]["status_mirror_revision"] = state["status_revision"]
            domain["project"]["updated_at"] = utc_now()[:10]
            validate_project(domain, contracts)
            atomic_write_yaml(project / "project.yaml", domain)
            mirror_reconciled = True
            append_event(project, state, "mirror_reconciled", run_id=run["run_id"], payload={"source": "project.yaml", "from": domain_status, "to": state["status"]})

        # A transition can have committed authoritative state before its mirror
        # or final commit event. Complete that exact transition once.
        if state["transition_history"]:
            latest_transition = state["transition_history"][-1]
            stream = scan_event_stream(resolve_inside(project, state["event_stream"]["path"]))
            committed = any(
                event.get("type") == "transition_committed"
                and event.get("payload", {}).get("transition_id") == latest_transition.get("transition_id")
                for event in stream["events"]
            )
            if not committed:
                append_event(
                    project,
                    state,
                    "transition_committed",
                    run_id=latest_transition["run_id"],
                    checkpoint_id=latest_transition.get("checkpoint_id"),
                    payload=latest_transition,
                )
                cursor_reconciled = True

        changed: list[dict[str, Any]] = []
        if selected is not None:
            for record in selected.get("artifacts", []):
                candidate = resolve_inside(project, record["path"])
                if not candidate.is_file():
                    changed.append({"path": record["path"], "reason": "missing"})
                else:
                    actual = sha256_file(candidate)
                    if actual != record["sha256"]:
                        changed.append({"path": record["path"], "reason": "sha256_changed", "expected": record["sha256"], "actual": actual})
        selected_id = selected["checkpoint_id"] if selected is not None else None
        append_event(project, state, "run_resumed", run_id=run["run_id"], checkpoint_id=selected_id, severity="warning" if changed else "info", payload={"changed_artifacts": changed, "replayed_event_count": len(recovered_tail)})
        if changed:
            invalidated = []
            for gate_id, gate in state["gates"].items():
                if gate["status"] in ACCEPTED_GATE_STATUSES:
                    gate["status"] = "stale"
                    invalidated.append(gate_id)
            state["recovery"] = {"status": "needed", "resume_from_checkpoint_id": selected_id, "retry_count": state["recovery"]["retry_count"], "max_retries": state["recovery"]["max_retries"], "last_failure": None}
            _finish_run(state, "blocked")
            _save_state(project, state, contracts)
            raise DomainBlocked("Checkpoint inputs changed; affected gates were marked stale", details={"changed_artifacts": changed, "invalidated_gates": invalidated})
        state["recovery"] = {"status": "idle", "resume_from_checkpoint_id": selected_id, "retry_count": 0, "max_retries": state["recovery"]["max_retries"], "last_failure": None}
        _finish_run(state, "succeeded")
        _save_state(project, state, contracts)
        return result_envelope(project, state, command="resume", run_id=run["run_id"], status_before=before, extra={"resumed_from": selected_id, "changed_artifacts": [], "mirror_reconciled": mirror_reconciled, "event_cursor_reconciled": cursor_reconciled, "replayed_event_count": len(recovered_tail)})


def _read_table(project: Path, relative: str, template_name: str) -> tuple[Path, list[str], list[dict[str, str]]]:
    path = project / relative
    if not path.is_file():
        template = load_contracts().paths.templates / template_name
        fields, _ = read_csv_rows(template)
        return path, fields, []
    fields, rows = read_csv_rows(path)
    return path, fields, rows


def _load_table(project: Path, relative: str, template_name: str) -> tuple[Path, list[str], list[dict[str, str]]]:
    path, fields, rows = _read_table(project, relative, template_name)
    if not path.is_file():
        atomic_write_csv(path, fields, [])
    return path, fields, rows


def list_tasks(path: str | Path) -> dict[str, Any]:
    project = normalize_project(path)
    _, state = load_context(project)
    _, _, rows = _read_table(project, "evidence/team-tasks.csv", "team-tasks.csv")
    return result_envelope(project, state, command="task list", run_id=new_id("run-read"), extra={"tasks": rows})


def add_task(path: str | Path, *, title: str, owner_role: str, stage: str, gate: str, priority: str, definition_of_done: str, dependencies: list[str]) -> dict[str, Any]:
    project = normalize_project(path)
    contracts = load_contracts()
    if stage not in contracts.stages or gate not in contracts.gate_ids:
        raise ContractError("Task stage or gate is invalid")
    with project_lock(project, command="task add"):
        _, state = load_context(project, contracts=contracts)
        table, fields, rows = _load_table(project, "evidence/team-tasks.csv", "team-tasks.csv")
        task_id = new_id("task")
        now = utc_now()
        row = {field: "" for field in fields}
        row.update({"task_id": task_id, "project_id": state["project_id"], "title": title, "stage": stage, "gate": gate, "owner_role": owner_role, "dependency_task_ids": ";".join(dependencies), "priority": priority, "status": "planned", "definition_of_done": definition_of_done, "created_at": now, "updated_at": now})
        rows.append(row)
        run = _new_run("task:add", canonical_hash(row))
        state["run"] = run
        append_event(project, state, "task_added", run_id=run["run_id"], payload={
            "task_id": task_id,
            "table_mutation": _table_mutation(relative="evidence/team-tasks.csv", key_field="task_id", key_value=task_id, before=None, after=row),
        })
        _fault_inject("table.after_event_before_publish")
        atomic_write_csv(table, fields, rows)
        _finish_run(state, "succeeded")
        _save_state(project, state, contracts)
        return result_envelope(project, state, command="task add", run_id=run["run_id"], extra={"task": row})


def set_task_status(path: str | Path, *, task_id: str, status: str) -> dict[str, Any]:
    allowed = {"planned", "in_progress", "review", "blocked", "done", "cancelled"}
    if status not in allowed:
        raise ContractError(f"Invalid task status: {status}")
    project = normalize_project(path)
    contracts = load_contracts()
    with project_lock(project, command="task set"):
        _, state = load_context(project, contracts=contracts)
        table, fields, rows = _load_table(project, "evidence/team-tasks.csv", "team-tasks.csv")
        row = next((item for item in rows if item.get("task_id") == task_id), None)
        if row is None:
            raise ContractError(f"Task not found: {task_id}")
        before_row = dict(row)
        row["status"] = status
        row["updated_at"] = utc_now()
        run = _new_run("task:set", canonical_hash({"task_id": task_id, "status": status}))
        state["run"] = run
        append_event(project, state, "task_status_changed", run_id=run["run_id"], payload={
            "task_id": task_id,
            "status": status,
            "table_mutation": _table_mutation(relative="evidence/team-tasks.csv", key_field="task_id", key_value=task_id, before=before_row, after=row),
        })
        _fault_inject("table.after_event_before_publish")
        atomic_write_csv(table, fields, rows)
        _finish_run(state, "succeeded")
        _save_state(project, state, contracts)
        return result_envelope(project, state, command="task set", run_id=run["run_id"], extra={"task": row})


def list_blockers(path: str | Path) -> dict[str, Any]:
    project = normalize_project(path)
    _, state = load_context(project)
    _, _, rows = _read_table(project, "evidence/blockers.csv", "blockers.csv")
    return result_envelope(project, state, command="blocker list", run_id=new_id("run-read"), extra={"blockers": rows})


def add_blocker(path: str | Path, *, title: str, severity: str, gate: str, cause: str, impact: str, required_input: str, owner: str, unblock_test: str) -> dict[str, Any]:
    if severity not in {"fatal", "high", "medium", "low", "info"}:
        raise ContractError(f"Invalid blocker severity: {severity}")
    project = normalize_project(path)
    contracts = load_contracts()
    if gate not in contracts.gate_ids:
        raise ContractError(f"Invalid blocker gate: {gate}")
    with project_lock(project, command="blocker add"):
        _, state = load_context(project, contracts=contracts)
        table, fields, rows = _load_table(project, "evidence/blockers.csv", "blockers.csv")
        blocker_id = new_id("blocker")
        now = utc_now()
        row = {field: "" for field in fields}
        row.update({"blocker_id": blocker_id, "project_id": state["project_id"], "title": title, "gate": gate, "severity": severity, "cause": cause, "impact": impact, "required_input": required_input, "input_owner": owner, "unblock_test": unblock_test, "status": "open", "created_at": now, "updated_at": now})
        rows.append(row)
        run = _new_run("blocker:add", canonical_hash(row))
        state["run"] = run
        append_event(project, state, "blocker_added", run_id=run["run_id"], severity="error" if severity in {"fatal", "high"} else "warning", payload={
            "blocker_id": blocker_id,
            "gate": gate,
            "severity": severity,
            "table_mutation": _table_mutation(relative="evidence/blockers.csv", key_field="blocker_id", key_value=blocker_id, before=None, after=row),
        })
        _fault_inject("table.after_event_before_publish")
        atomic_write_csv(table, fields, rows)
        _finish_run(state, "succeeded")
        _save_state(project, state, contracts)
        return result_envelope(project, state, command="blocker add", run_id=run["run_id"], extra={"blocker": row})


def resolve_blocker(path: str | Path, *, blocker_id: str, evidence: str, resolved_by: str) -> dict[str, Any]:
    project = normalize_project(path)
    evidence_path = resolve_inside(project, evidence)
    if not evidence_path.exists():
        raise ArtifactError(f"Blocker resolution evidence is missing: {evidence}")
    if evidence_path.suffix.lower() != ".json":
        raise DomainBlocked("Blocker resolution requires a structured JSON verification record")
    verification = load_json(evidence_path)
    if not isinstance(verification, dict):
        raise DomainBlocked("Blocker verification record must be a JSON object")
    contracts = load_contracts()
    with project_lock(project, command="blocker resolve"):
        _, state = load_context(project, contracts=contracts)
        table, fields, rows = _load_table(project, "evidence/blockers.csv", "blockers.csv")
        row = next((item for item in rows if item.get("blocker_id") == blocker_id), None)
        if row is None:
            raise ContractError(f"Blocker not found: {blocker_id}")
        required_fields = {"blocker_id", "unblock_test", "result", "verified_by", "verified_at", "evidence_refs"}
        missing = sorted(required_fields - set(verification))
        if missing:
            raise DomainBlocked("Blocker verification record is incomplete", details={"missing_fields": missing})
        if verification.get("blocker_id") != blocker_id:
            raise DomainBlocked("Verification record references a different blocker")
        if not row.get("unblock_test", "").strip() or verification.get("unblock_test") != row.get("unblock_test"):
            raise DomainBlocked("Verification did not execute the declared unblock_test")
        if str(verification.get("result", "")).strip().lower() != "pass":
            raise DomainBlocked("Blocker unblock_test did not pass")
        if verification.get("verified_by") != resolved_by or resolved_by == row.get("input_owner"):
            raise DomainBlocked("Blocker resolution requires an independent verifier")
        try:
            dt.datetime.fromisoformat(str(verification["verified_at"]).replace("Z", "+00:00"))
        except ValueError as exc:
            raise DomainBlocked("Verification timestamp is invalid") from exc
        evidence_refs = verification.get("evidence_refs")
        if not _blocker_evidence_refs_are_current(project, evidence_refs):
            raise DomainBlocked(
                "Verification must cite at least one current evidence object with exact path and SHA-256",
                details={"evidence_ref_format": {"path": "evidence/example.ext", "sha256": "<64 lowercase hex>"}},
            )
        before_row = dict(row)
        row.update({"status": "resolved", "resolution_evidence": evidence, "resolved_by": resolved_by, "resolved_at": utc_now(), "updated_at": utc_now()})
        run = _new_run("blocker:resolve", canonical_hash({"blocker_id": blocker_id, "evidence": evidence}))
        state["run"] = run
        append_event(project, state, "blocker_resolved", run_id=run["run_id"], payload={
            "blocker_id": blocker_id,
            "evidence": evidence,
            "table_mutation": _table_mutation(relative="evidence/blockers.csv", key_field="blocker_id", key_value=blocker_id, before=before_row, after=row),
        })
        _fault_inject("table.after_event_before_publish")
        atomic_write_csv(table, fields, rows)
        _finish_run(state, "succeeded")
        _save_state(project, state, contracts)
        return result_envelope(project, state, command="blocker resolve", run_id=run["run_id"], extra={"blocker": row})


def waive_blocker(path: str | Path, *, blocker_id: str, evidence: str, decision_owner: str) -> dict[str, Any]:
    project = normalize_project(path)
    evidence_path = resolve_inside(project, evidence)
    if not evidence_path.is_file() or evidence_path.stat().st_size == 0:
        raise ArtifactError(f"Blocker waiver evidence is missing or empty: {evidence}")
    if evidence_path.suffix.lower() != ".json":
        raise DomainBlocked("Blocker waiver requires a structured JSON governance record")
    contracts = load_contracts()
    with project_lock(project, command="blocker waive"):
        _, state = load_context(project, contracts=contracts)
        table, fields, rows = _load_table(project, "evidence/blockers.csv", "blockers.csv")
        row = next((item for item in rows if item.get("blocker_id") == blocker_id), None)
        if row is None:
            raise ContractError(f"Blocker not found: {blocker_id}")
        if row.get("severity", "").strip().lower() == "fatal":
            raise DomainBlocked("Fatal blockers cannot be waived")
        now = utc_now()
        proposed = dict(row)
        proposed.update({
            "status": "waived",
            "decision_owner": decision_owner,
            "resolution_evidence": evidence,
            "resolved_by": decision_owner,
            "resolved_at": now,
            "updated_at": now,
        })
        if not _blocker_waiver_is_valid(project, proposed):
            raise DomainBlocked(
                "Blocker waiver record is incomplete, mismatched, or cites missing evidence",
                details={
                    "required_fields": [
                        "blocker_id", "decision=waive", "decision_owner", "reason", "scope",
                        "compensating_controls", "approved_at",
                        "evidence_refs=[{path, sha256}]",
                    ]
                },
            )
        before_row = dict(row)
        row.update(proposed)
        run = _new_run("blocker:waive", canonical_hash({"blocker_id": blocker_id, "evidence_sha256": sha256_file(evidence_path)}))
        state["run"] = run
        append_event(
            project,
            state,
            "blocker_waived",
            run_id=run["run_id"],
            severity="warning",
            payload={
                "blocker_id": blocker_id,
                "decision_owner": decision_owner,
                "evidence": evidence,
                "table_mutation": _table_mutation(relative="evidence/blockers.csv", key_field="blocker_id", key_value=blocker_id, before=before_row, after=row),
            },
        )
        _fault_inject("table.after_event_before_publish")
        atomic_write_csv(table, fields, rows)
        _finish_run(state, "succeeded")
        _save_state(project, state, contracts)
        return result_envelope(project, state, command="blocker waive", run_id=run["run_id"], extra={"blocker": row})


def list_artifacts(path: str | Path) -> dict[str, Any]:
    project = normalize_project(path)
    _, state = load_context(project)
    return result_envelope(project, state, command="artifact list", run_id=new_id("run-read"), extra={"artifacts": _registry_rows(project)})


def list_reviews(path: str | Path) -> dict[str, Any]:
    project = normalize_project(path)
    _, state = load_context(project)
    _, _, rows = _read_table(project, "evidence/review-queue.csv", "review-queue.csv")
    return result_envelope(project, state, command="review list", run_id=new_id("run-read"), extra={"reviews": rows})


def approve_artifact_review(
    path: str | Path,
    *,
    artifact_id: str,
    evidence: str,
    reviewer_role: str,
    reviewer_name: str,
    review_id: str | None = None,
) -> dict[str, Any]:
    project = normalize_project(path)
    evidence_path = resolve_inside(project, evidence)
    if not evidence_path.is_file() or evidence_path.stat().st_size == 0:
        raise ArtifactError(f"Review evidence is missing or empty: {evidence}")
    if evidence_path.suffix.lower() != ".json":
        raise DomainBlocked("Final review evidence must be a structured JSON record")
    evidence_record = load_json(evidence_path)
    if not isinstance(evidence_record, dict):
        raise DomainBlocked("Final review evidence must be a JSON object")
    contracts = load_contracts()
    with project_lock(project, command="review approve"):
        _, state = load_context(project, contracts=contracts)
        artifact = next((row for row in _registry_rows(project) if row.get("artifact_id") == artifact_id), None)
        if artifact is None:
            raise ContractError(f"Artifact not found: {artifact_id}")
        reviewer_role = reviewer_role.strip()
        reviewer_name = reviewer_name.strip()
        artifact_type = artifact.get("artifact_type", "").strip().lower()
        producer_role = artifact.get("created_by_role", "").strip()
        owner_name = artifact.get("owner_name", "").strip()
        if artifact_type not in FINAL_ARTIFACT_TYPES:
            raise DomainBlocked("Independent final review requires a canonical final artifact type")
        if producer_role not in EXPERT_ROLES or not owner_name:
            raise DomainBlocked("Artifact producer role and accountable owner name must be recorded separately")
        if reviewer_role not in EXPERT_ROLES or not reviewer_name:
            raise DomainBlocked("Reviewer role must be canonical and reviewer name must be non-empty")
        artifact_path = resolve_inside(project, artifact.get("file_path", ""))
        if not artifact_path.is_file() or sha256_file(artifact_path) != artifact.get("sha256", "").strip().lower():
            raise DomainBlocked("Artifact changed after registration; register a new version before review")
        if reviewer_name.casefold() == owner_name.casefold():
            raise DomainBlocked("Artifact owner cannot approve the same final artifact")
        if reviewer_role.casefold() == producer_role.casefold():
            raise DomainBlocked("Artifact producer role cannot approve the same final artifact")
        acceptance_test = str(evidence_record.get("acceptance_test", "")).strip()
        acceptance_checks = evidence_record.get("acceptance_checks")
        required_checks = FINAL_ARTIFACT_ACCEPTANCE_CHECKS[artifact_type]
        if (
            not isinstance(acceptance_checks, list)
            or any(not isinstance(item, str) or not item.strip() for item in acceptance_checks)
            or len(acceptance_checks) != len(set(acceptance_checks))
            or not required_checks.issubset(set(acceptance_checks))
        ):
            raise DomainBlocked(
                "Review evidence lacks the structured acceptance checks required for this artifact type",
                details={"artifact_type": artifact_type, "required_checks": sorted(required_checks)},
            )
        expected = {
            "artifact_id": artifact_id,
            "artifact_version": artifact.get("version", "").strip(),
            "artifact_sha256": artifact.get("sha256", "").strip().lower(),
            "artifact_type": artifact_type,
            "producer_role": producer_role,
            "owner_name": owner_name,
            "decision": "approved",
            "reviewer_role": reviewer_role,
            "reviewer_name": reviewer_name,
        }
        mismatches = {
            field: {"expected": value, "actual": evidence_record.get(field)}
            for field, value in expected.items()
            if evidence_record.get(field) != value
        }
        if mismatches or not acceptance_test:
            raise DomainBlocked("Review evidence does not match the current artifact or lacks an acceptance test", details={"mismatches": mismatches})
        try:
            completed_at = dt.datetime.fromisoformat(str(evidence_record.get("completed_at", "")).replace("Z", "+00:00"))
        except ValueError as exc:
            raise DomainBlocked("Review completion timestamp is invalid") from exc
        if completed_at.tzinfo is None:
            raise DomainBlocked("Review completion timestamp must include a timezone")
        if completed_at > dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5):
            raise DomainBlocked("Review completion timestamp cannot be in the future")
        table, fields, rows = _load_table(project, "evidence/review-queue.csv", "review-queue.csv")
        review_id = review_id or new_id("review")
        if any(row.get("review_id") == review_id for row in rows):
            raise ConflictError(f"Review ID already exists: {review_id}")
        if any(
            row.get("artifact_id") == artifact_id
            and row.get("artifact_sha256", "").strip().lower() == artifact.get("sha256", "").strip().lower()
            and row.get("status", "").strip().lower() == "approved"
            for row in rows
        ):
            raise ConflictError("The current artifact version already has an approved review")
        now = utc_now()
        row = {field: "" for field in fields}
        row.update({
            "review_id": review_id,
            "project_id": state["project_id"],
            "artifact_id": artifact_id,
            "artifact_version": artifact.get("version", ""),
            "artifact_sha256": artifact.get("sha256", ""),
            "gate": artifact.get("gate", ""),
            "review_type": "independent_final",
            "requested_by_role": producer_role,
            "requested_by_name": owner_name,
            "reviewer_role": reviewer_role,
            "reviewer_name": reviewer_name,
            "blocking": "true",
            "severity": "high",
            "status": "approved",
            "decision": "approved",
            "findings": str(evidence_record.get("findings", "")),
            "required_changes": "",
            "acceptance_test": acceptance_test,
            "acceptance_checks": json.dumps(acceptance_checks, ensure_ascii=False, separators=(",", ":")),
            "evidence_path": evidence,
            "evidence_sha256": sha256_file(evidence_path),
            "requested_at": now,
            "completed_at": str(evidence_record["completed_at"]),
            "checkpoint_id": (state.get("latest_checkpoint") or {}).get("checkpoint_id") or "",
            "notes": "Approved against the registered artifact version and SHA-256",
        })
        rows.append(row)
        run = _new_run("review:approve", canonical_hash(row))
        state["run"] = run
        append_event(project, state, "review_approved", run_id=run["run_id"], payload={
            "review_id": review_id,
            "artifact_id": artifact_id,
            "artifact_sha256": artifact.get("sha256"),
            "table_mutation": _table_mutation(relative="evidence/review-queue.csv", key_field="review_id", key_value=review_id, before=None, after=row),
        })
        _fault_inject("table.after_event_before_publish")
        atomic_write_csv(table, fields, rows)
        _finish_run(state, "succeeded")
        _save_state(project, state, contracts)
        return result_envelope(project, state, command="review approve", run_id=run["run_id"], extra={"review": row})


def finalize_artifact(
    path: str | Path,
    *,
    artifact_id: str,
    review_id: str,
    rights_status: str,
    anonymity_status: str,
) -> dict[str, Any]:
    project = normalize_project(path)
    contracts = load_contracts()
    with project_lock(project, command="artifact finalize"):
        _, state = load_context(project, contracts=contracts)
        table, fields, rows = _load_table(project, "evidence/artifact-registry.csv", "artifact-registry.csv")
        row = next((item for item in rows if item.get("artifact_id") == artifact_id), None)
        if row is None:
            raise ContractError(f"Artifact not found: {artifact_id}")
        review = next(
            (
                item for item in _review_rows(project)
                if item.get("review_id") == review_id and item.get("artifact_id") == artifact_id
            ),
            None,
        )
        if review is None:
            raise DomainBlocked("Artifact finalization requires its approved review record")
        candidate = resolve_inside(project, row.get("file_path", ""))
        if not candidate.is_file() or sha256_file(candidate) != row.get("sha256", "").strip().lower():
            raise DomainBlocked("Artifact changed after registration; it must be versioned and reviewed again")
        proposed = dict(row)
        proposed.update({
            "review_id": review_id,
            "reviewer_role": review.get("reviewer_role", ""),
            "reviewer_name": review.get("reviewer_name", ""),
            "status": "final",
            "rights_status": rights_status,
            "anonymity_status": anonymity_status,
            "updated_at": utc_now(),
        })
        policy_issues = _artifact_policy_issues(project, proposed, final=True)
        if policy_issues:
            raise DomainBlocked("Artifact cannot be finalized", details={"artifact_id": artifact_id, "policy_issues": policy_issues})
        before_row = dict(row)
        row.update(proposed)
        run = _new_run("artifact:finalize", canonical_hash(proposed))
        state["run"] = run
        append_event(project, state, "artifact_finalized", run_id=run["run_id"], payload={
            "artifact_id": artifact_id,
            "review_id": review_id,
            "table_mutation": _table_mutation(relative="evidence/artifact-registry.csv", key_field="artifact_id", key_value=artifact_id, before=before_row, after=row),
        })
        _fault_inject("table.after_event_before_publish")
        atomic_write_csv(table, fields, rows)
        _finish_run(state, "succeeded")
        _save_state(project, state, contracts)
        return result_envelope(project, state, command="artifact finalize", run_id=run["run_id"], extra={"artifact": row})


def register_artifact(
    path: str | Path,
    *,
    file_path: str,
    artifact_id: str | None,
    title: str,
    artifact_type: str,
    classification: str,
    stage: str,
    gate: str,
    provenance: str,
    status: str,
    producer_role: str,
    owner_name: str,
    rights_status: str | None = None,
    anonymity_status: str | None = None,
) -> dict[str, Any]:
    project = normalize_project(path)
    contracts = load_contracts()
    if stage not in contracts.stages or gate not in contracts.gate_ids:
        raise ContractError("Artifact stage or gate is invalid")
    producer_role = producer_role.strip()
    owner_name = owner_name.strip()
    if producer_role not in EXPERT_ROLES:
        raise ContractError("Artifact producer role must be a canonical expert role")
    if not owner_name:
        raise ContractError("Artifact owner name must be non-empty")
    resolved = resolve_inside(project, file_path)
    if not resolved.is_file():
        raise ArtifactError(f"Artifact file is missing: {file_path}")
    if resolved.stat().st_size == 0:
        raise ArtifactError(f"Artifact file is empty: {file_path}")
    with project_lock(project, command="artifact register"):
        _, state = load_context(project, contracts=contracts)
        table, fields, rows = _load_table(project, "evidence/artifact-registry.csv", "artifact-registry.csv")
        normalized = relative_posix(project, resolved)
        artifact_id = artifact_id or new_id("artifact")
        if any(row.get("artifact_id") == artifact_id for row in rows):
            raise ConflictError(f"Artifact ID already exists: {artifact_id}")
        now = utc_now()
        row = {field: "" for field in fields}
        row.update({
            "artifact_id": artifact_id,
            "project_id": state["project_id"],
            "title": title,
            "artifact_type": artifact_type,
            "classification": classification,
            "stage": stage,
            "gate": gate,
            "file_path": normalized,
            "mime_type": mimetypes.guess_type(resolved.name)[0] or "application/octet-stream",
            "provenance": provenance,
            "content_state": "actual" if classification.lower() in ACTUAL_CLASSIFICATIONS else "proposed",
            "version": "v1",
            "sha256": sha256_file(resolved),
            "bytes": str(resolved.stat().st_size),
            "created_by_role": producer_role,
            "owner_name": owner_name,
            "reviewer_role": "",
            "reviewer_name": "",
            "status": status,
            "rights_status": rights_status or "unknown",
            "anonymity_status": anonymity_status or "unknown",
            "created_at": now,
            "updated_at": now,
        })
        policy_issues = _artifact_policy_issues(project, row, final=status.strip().lower() in FINAL_ARTIFACT_STATUSES)
        if policy_issues:
            raise DomainBlocked(
                "Artifact registration violates evidence or final-delivery policy",
                details={"artifact_id": artifact_id, "file_path": normalized, "policy_issues": policy_issues},
            )
        rows.append(row)
        run = _new_run("artifact:register", canonical_hash(row))
        state["run"] = run
        append_event(project, state, "artifact_registered", run_id=run["run_id"], payload={
            "artifact_id": artifact_id,
            "file_path": normalized,
            "table_mutation": _table_mutation(relative="evidence/artifact-registry.csv", key_field="artifact_id", key_value=artifact_id, before=None, after=row),
        })
        _fault_inject("table.after_event_before_publish")
        atomic_write_csv(table, fields, rows)
        _finish_run(state, "succeeded")
        _save_state(project, state, contracts)
        return result_envelope(project, state, command="artifact register", run_id=run["run_id"], extra={"artifact": row})


def _final_artifact_snapshots(
    project: Path,
    artifacts: list[dict[str, str]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    snapshots: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for row in artifacts:
        artifact_id = row.get("artifact_id", "").strip()
        file_path = row.get("file_path", "").strip()
        policy_issues = _artifact_policy_issues(project, row, final=True)
        if policy_issues:
            errors.append({"artifact_id": artifact_id, "file_path": file_path, "policy_issues": policy_issues})
            continue
        review, review_issues = _approved_review_for_artifact(project, row)
        if review is None:
            errors.append({"artifact_id": artifact_id, "file_path": file_path, "policy_issues": review_issues})
            continue
        try:
            candidate = resolve_inside(project, file_path)
        except ArtifactError as exc:
            errors.append({"artifact_id": artifact_id, "reason": "unsafe_path", "message": str(exc)})
            continue
        if not candidate.is_file() or candidate.stat().st_size == 0:
            errors.append({"artifact_id": artifact_id, "reason": "missing_or_empty", "file_path": file_path})
            continue
        actual = sha256_file(candidate)
        expected = row.get("sha256", "").strip().lower()
        if not expected or actual != expected:
            errors.append({"artifact_id": artifact_id, "reason": "hash_mismatch", "file_path": file_path})
            continue
        snapshots.append({
            "artifact_id": artifact_id,
            "artifact_type": row.get("artifact_type", ""),
            "version": row.get("version", ""),
            "file_path": file_path,
            "sha256": actual,
            "bytes": candidate.stat().st_size,
            "rights_status": row.get("rights_status", ""),
            "anonymity_status": row.get("anonymity_status", ""),
            "producer_role": row.get("created_by_role", ""),
            "owner_name": row.get("owner_name", ""),
            "reviewer_role": row.get("reviewer_role", ""),
            "reviewer_name": row.get("reviewer_name", ""),
            "review_id": review.get("review_id", ""),
            "acceptance_checks": json.loads(review.get("acceptance_checks", "[]")),
            "review_evidence_path": review.get("evidence_path", ""),
            "review_evidence_sha256": review.get("evidence_sha256", ""),
        })
    for field in ("file_path", "sha256"):
        occurrences: dict[str, list[str]] = {}
        for snapshot in snapshots:
            occurrences.setdefault(str(snapshot.get(field, "")), []).append(str(snapshot.get("artifact_id", "")))
        for value, artifact_ids in occurrences.items():
            if value and len(artifact_ids) > 1:
                errors.append({
                    "reason": f"duplicate_final_artifact_{field}",
                    field: value,
                    "artifact_ids": artifact_ids,
                })
    return snapshots, errors


def _missing_required_final_artifact_types(
    domain: dict[str, Any],
    snapshots: list[dict[str, Any]],
) -> list[str]:
    required = domain.get("deliverables", {}).get("required_final_artifact_types")
    if not isinstance(required, list) or not required:
        return ["required_final_artifact_types_unresolved"]
    present = {str(item.get("artifact_type", "")).strip().lower() for item in snapshots}
    return sorted(str(item).strip().lower() for item in required if str(item).strip().lower() not in present)


def _block_handoff(
    project: Path,
    state: dict[str, Any],
    contracts: Contracts,
    *,
    status_before: str,
    details: dict[str, Any],
    stale_gates: list[str] | None = None,
) -> None:
    run = _new_run("handoff:no-go", canonical_hash(details))
    state["run"] = run
    append_event(project, state, "handoff_requested", run_id=run["run_id"], payload={"status": status_before})
    for gate_id in stale_gates or []:
        append_event(
            project,
            state,
            "gate_invalidated",
            run_id=run["run_id"],
            node_id=f"gate:{gate_id}",
            severity="warning",
            payload={"cause": "handoff evidence fingerprint changed"},
        )
    audit_id = new_id("handoff-no-go")
    audit_relative = f"{AUDITS_REL}/{audit_id}.json"
    report = {
        "schema_version": "1.0.0",
        "audit_id": audit_id,
        "run_id": run["run_id"],
        "project_id": state["project_id"],
        "created_at": utc_now(),
        "status": "no_go",
        "details": details,
    }
    atomic_write_json(project / audit_relative, report)
    append_event(
        project,
        state,
        "handoff_blocked",
        run_id=run["run_id"],
        severity="error",
        payload={"audit": audit_relative, **details},
    )
    _finish_run(state, "blocked")
    append_event(project, state, "run_failed", run_id=run["run_id"], severity="error", payload={"audit": audit_relative})
    _save_state(project, state, contracts)
    raise DomainBlocked("Final handoff is not allowed", details={**details, "no_go_audit": audit_relative})


def handoff_project(path: str | Path) -> dict[str, Any]:
    project = normalize_project(path)
    contracts = load_contracts()
    with project_lock(project, command="handoff"):
        domain, state = load_context(project, contracts=contracts)
        before = state["status"]
        if before == "closed":
            probe = copy.deepcopy(state)
            stale_closed = _refresh_gate_drift(project, domain, probe, contracts.gate_ids, contracts)
            _, closed_checkpoint_errors = _checkpoint_reference_errors(project, state, contracts)
            closed_blockers = [
                row for row in _unresolved_blockers(project)
                if row.get("severity", "").strip().lower() in {"fatal", "high"}
            ]
            closed_risks = _active_project_risks(project, domain, {"fatal", "high"})
            manifest_errors = _final_manifest_errors(project, domain, state, contracts)
            if stale_closed or closed_checkpoint_errors or closed_blockers or closed_risks or manifest_errors:
                raise DomainBlocked(
                    "Closed project handoff is no longer current",
                    details={
                        "stale_gates": stale_closed,
                        "checkpoint_errors": closed_checkpoint_errors,
                        "fatal_or_high_blockers": closed_blockers,
                        "fatal_or_high_risks": closed_risks,
                        "manifest_errors": manifest_errors,
                    },
                )
            manifest = load_json(resolve_inside(project, "reviews/final-manifest.json"))
            return result_envelope(
                project,
                state,
                command="handoff",
                run_id=new_id("run-read"),
                status_before=before,
                extra={
                    "go_no_go": "go",
                    "manifest": "reviews/final-manifest.json",
                    "manifest_sha256": manifest["delivery"]["manifest_sha256"],
                    "aggregate_audit": manifest["aggregate_audit"]["path"],
                    "artifact_count": len(manifest["artifact_snapshots"]),
                    "idempotent": True,
                },
            )
        stale = _refresh_gate_drift(project, domain, state, contracts.gate_ids, contracts)
        checkpoint_record, checkpoint_errors = _checkpoint_reference_errors(project, state, contracts)
        blockers = [
            row for row in _unresolved_blockers(project)
            if row.get("severity", "").strip().lower() in {"fatal", "high"}
        ]
        risks = _active_project_risks(project, domain, {"fatal", "high"})
        gate_blockers = [
            gate for gate, record in state["gates"].items()
            if record["status"] not in ACCEPTED_GATE_STATUSES or int(record.get("fatal_count", 0)) != 0
        ]
        artifacts = [
            row for row in _registry_rows(project)
            if row.get("status", "").strip().lower() in FINAL_ARTIFACT_STATUSES
        ]
        snapshots, artifact_errors = _final_artifact_snapshots(project, artifacts)
        missing_artifact_types = _missing_required_final_artifact_types(domain, snapshots)
        preflight_details = {
            "status": state["status"],
            "blocking_gates": gate_blockers,
            "stale_gates": stale,
            "checkpoint_errors": checkpoint_errors,
            "fatal_or_high_blockers": blockers,
            "fatal_or_high_risks": risks,
            "artifact_errors": artifact_errors,
            "missing_required_final_artifact_types": missing_artifact_types,
            "final_artifact_count": len(artifacts),
        }
        if (
            state["status"] != "submission_ready"
            or gate_blockers
            or checkpoint_errors
            or blockers
            or risks
            or not artifacts
            or artifact_errors
            or missing_artifact_types
        ):
            _block_handoff(
                project,
                state,
                contracts,
                status_before=before,
                details=preflight_details,
                stale_gates=stale,
            )

        # Import locally to keep the core/audit dependency acyclic at module import time.
        from .audits import audit_project

        audit_result = audit_project(project, run_all=True, lock_already_held=True)
        domain, state = load_context(project, contracts=contracts)
        if int(audit_result.get("exit_code", 1)) != 0:
            _block_handoff(
                project,
                state,
                contracts,
                status_before=before,
                details={
                    **preflight_details,
                    "aggregate_audit": audit_result.get("audit_report"),
                    "failed_checks": (audit_result.get("failure") or {}).get("details", {}).get("failed_checks", []),
                },
            )

        stale_after_audit = _refresh_gate_drift(project, domain, state, contracts.gate_ids, contracts)
        if stale_after_audit:
            _block_handoff(
                project,
                state,
                contracts,
                status_before=before,
                details={"status": state["status"], "stale_gates": stale_after_audit, "aggregate_audit": audit_result.get("audit_report")},
                stale_gates=stale_after_audit,
            )

        artifacts = [
            row for row in _registry_rows(project)
            if row.get("status", "").strip().lower() in FINAL_ARTIFACT_STATUSES
        ]
        snapshots, artifact_errors = _final_artifact_snapshots(project, artifacts)
        missing_artifact_types = _missing_required_final_artifact_types(domain, snapshots)
        if artifact_errors or not snapshots or missing_artifact_types:
            _block_handoff(
                project,
                state,
                contracts,
                status_before=before,
                details={
                    "artifact_errors": artifact_errors,
                    "missing_required_final_artifact_types": missing_artifact_types,
                    "final_artifact_count": len(artifacts),
                },
            )

        checkpoint_record, checkpoint_errors = _checkpoint_reference_errors(project, state, contracts)
        if checkpoint_errors or checkpoint_record is None:
            _block_handoff(
                project,
                state,
                contracts,
                status_before=before,
                details={"checkpoint_errors": checkpoint_errors},
            )

        audit_relative = str(audit_result["audit_report"])
        audit_path = resolve_inside(project, audit_relative)
        run = _new_run("handoff", canonical_hash({"artifacts": snapshots, "audit": sha256_file(audit_path)}))
        state["run"] = run
        append_event(project, state, "handoff_requested", run_id=run["run_id"], payload={"status": before, "aggregate_audit": audit_relative})
        manifest = {
            "schema_version": "1.0.0",
            "manifest_kind": "final_delivery",
            "project_id": state["project_id"],
            "handoff_id": new_id("handoff"),
            "handoff_type": "final",
            "created_at": utc_now(),
            "scope": {key: domain.get("project", {}).get(key, "unknown") for key in ("edition", "group", "region", "track", "stage")},
            "current_state": {
                "project_status": state["status"],
                "status_revision": state["status_revision"],
                "checkpoint_id": checkpoint_record["checkpoint_id"],
                "checkpoint_record_sha256": sha256_file(
                    resolve_inside(project, f"{CHECKPOINTS_REL}/{checkpoint_record['checkpoint_id']}.json")
                ),
                "outcome": "done",
            },
            "quality_gates": [
                {
                    "gate": gate,
                    "status": record["status"],
                    "input_fingerprint": record["input_fingerprint"],
                    "result_path": record["result_path"],
                    "result_sha256": record["result_sha256"],
                    "evidence_refs": record["evidence_refs"],
                }
                for gate, record in state["gates"].items()
            ],
            "open_blockers": [],
            "open_fatal_or_high_risks": [],
            "artifact_snapshots": snapshots,
            "aggregate_audit": {"path": audit_relative, "sha256": sha256_file(audit_path)},
            "control_fingerprint": _handoff_control_fingerprint(project, domain, state, snapshots),
            "delivery": {
                "go_no_go": "go",
                "reasons": [],
                "final_artifact_ids": [item["artifact_id"] for item in snapshots],
                "required_final_artifact_types": domain["deliverables"]["required_final_artifact_types"],
            },
        }
        manifest["delivery"]["manifest_sha256"] = canonical_hash(manifest)
        validate_final_handoff(manifest, contracts)
        output = resolve_inside(project, "reviews/final-manifest.json")
        atomic_write_json(output, manifest)
        append_event(
            project,
            state,
            "handoff_completed",
            run_id=run["run_id"],
            payload={
                "handoff_id": manifest["handoff_id"],
                "manifest": "reviews/final-manifest.json",
                "manifest_sha256": manifest["delivery"]["manifest_sha256"],
                "artifact_count": len(snapshots),
            },
        )
        _finish_run(state, "succeeded")
        append_event(project, state, "run_completed", run_id=run["run_id"], payload={"handoff_id": manifest["handoff_id"]})
        _save_state(project, state, contracts)
        return result_envelope(
            project,
            state,
            command="handoff",
            run_id=run["run_id"],
            status_before=before,
            extra={
                "go_no_go": "go",
                "manifest": "reviews/final-manifest.json",
                "manifest_sha256": manifest["delivery"]["manifest_sha256"],
                "aggregate_audit": audit_relative,
                "artifact_count": len(snapshots),
            },
        )
