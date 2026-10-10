#!/usr/bin/env python3
"""Run black-box behavior evaluations against the EVI-X control-plane CLI.

The runner deliberately does not import any runtime implementation module.  Each
scenario receives an isolated temporary project and can interact with the system
only by invoking ``agentctl.py`` or by installing explicit adversarial fixtures.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:  # pragma: no cover - reported as an infrastructure failure at runtime
    Draft202012Validator = None  # type: ignore[assignment,misc]
    FormatChecker = None  # type: ignore[assignment,misc]

try:
    import yaml
except ImportError:  # pragma: no cover - fallback checks still cover state and blockers
    yaml = None  # type: ignore[assignment]


ROOT = Path(__file__).resolve().parent.parent
EVALS = ROOT / "evals"
SCENARIO_DIRECTORY = EVALS / "scenarios"
DEFAULT_CLI = ROOT / "skill" / "zhengda-cup-champion" / "scripts" / "agentctl.py"
WORKFLOW_CONTRACT = (
    ROOT / "skill" / "zhengda-cup-champion" / "assets" / "runtime" / "workflow.json"
)
AGENT_STATE_SCHEMA = (
    ROOT
    / "skill"
    / "zhengda-cup-champion"
    / "assets"
    / "runtime"
    / "schemas"
    / "agent-state.schema.json"
)
AGENT_STATE_PATH = Path(".agent/state.json")
GATE_IDS = {"rule", "problem", "design", "fieldwork", "data", "inference", "action", "visual", "submission"}
GATE_STATUSES = {"not_run", "running", "pass", "warning", "fail", "unknown", "stale"}
FAILURE_CLASSES = {"gate", "validation", "artifact_io", "integrity", "concurrency", "runtime", "external_dependency"}
FAILURE_CLASS_BY_EXIT = {
    1: {"gate"},
    2: {"validation"},
    3: {"artifact_io", "integrity", "external_dependency"},
    4: {"runtime"},
    5: {"concurrency"},
}
EVENT_REQUIRED_FIELDS = {
    "event_id",
    "run_id",
    "sequence",
    "timestamp",
    "type",
    "project_id",
    "workflow_version",
    "control_status",
    "node_id",
    "attempt",
    "severity",
    "checkpoint_id",
    "causation_id",
    "correlation_id",
    "input_fingerprint",
    "payload",
    "previous_event_hash",
    "event_hash",
}
EVENT_SEVERITIES = {"debug", "info", "warning", "error", "critical", "low", "medium", "high", "fatal"}
ASSERTION_SOURCES = {
    "json",
    "stdout",
    "stderr",
    "returncode",
    "file_exists",
    "file_text",
    "file_json",
    "file_sha256",
    "tree_sha256",
    "agent_state",
}
ASSERTION_OPERATIONS = {
    "eq",
    "ne",
    "in",
    "not_in",
    "contains",
    "regex",
    "type",
    "ge",
    "gt",
    "le",
    "lt",
    "length_eq",
    "truthy",
    "falsy",
    "exists",
    "absent",
}
INVARIANT_NAMES = {
    "project_status_mirror",
    "adjacent_transition_only",
    "blocked_preserves_status",
    "event_stream_consistent",
    "submission_zero_fatal_high",
    "checkpoint_artifacts_match",
    "checkpoint_event_recorded",
    "resume_event_recorded",
}
PLACEHOLDER = re.compile(r"\$\{(project|capture\.([A-Za-z0-9_.:-]+))\}")
MISSING = object()


class EvaluationError(RuntimeError):
    """A deterministic scenario, assertion, or contract error."""


@dataclass
class CommandObservation:
    argv: list[str]
    returncode: int
    stdout: str
    stderr: str
    duration_seconds: float
    payload: dict[str, Any] | None = None


@dataclass
class StepReport:
    step_id: str
    kind: str
    passed: bool
    detail: str
    command: list[str] | None = None
    returncode: int | None = None
    duration_seconds: float = 0.0
    stdout: str = ""
    stderr: str = ""

    def as_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "id": self.step_id,
            "kind": self.kind,
            "passed": self.passed,
            "detail": self.detail,
            "duration_seconds": round(self.duration_seconds, 4),
        }
        if self.command is not None:
            result["command"] = self.command
        if self.returncode is not None:
            result["returncode"] = self.returncode
        if not self.passed and self.stdout:
            result["stdout"] = self.stdout
        if self.stderr:
            result["stderr"] = self.stderr
        return result


@dataclass
class ScenarioReport:
    scenario_id: str
    description: str
    passed: bool = True
    steps: list[StepReport] = field(default_factory=list)
    project_path: str | None = None
    duration_seconds: float = 0.0

    def as_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "id": self.scenario_id,
            "description": self.description,
            "passed": self.passed,
            "duration_seconds": round(self.duration_seconds, 4),
            "steps": [step.as_dict() for step in self.steps],
        }
        if self.project_path is not None:
            result["project_path"] = self.project_path
        return result


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def _project_path(project: Path, relative: str) -> Path:
    candidate = Path(relative)
    if candidate.is_absolute():
        raise EvaluationError(f"project-relative path must not be absolute: {relative}")
    resolved = (project / candidate).resolve()
    if not _is_within(resolved, project.resolve()):
        raise EvaluationError(f"path escapes temporary project: {relative}")
    return resolved


def _repo_source(relative: str) -> Path:
    candidate = Path(relative)
    if candidate.is_absolute():
        raise EvaluationError(f"fixture source must be repository-relative: {relative}")
    resolved = (ROOT / candidate).resolve()
    if not _is_within(resolved, ROOT.resolve()):
        raise EvaluationError(f"fixture source escapes repository: {relative}")
    if not resolved.exists():
        raise EvaluationError(f"fixture source does not exist: {relative}")
    return resolved


def _expand_string(value: str, captures: dict[str, Any], project: Path) -> str:
    def replace(match: re.Match[str]) -> str:
        if match.group(1) == "project":
            return str(project)
        name = match.group(2)
        if name not in captures:
            raise EvaluationError(f"unknown capture referenced: {name}")
        captured = captures[name]
        if captured is None:
            return "null"
        if isinstance(captured, (dict, list)):
            return json.dumps(captured, ensure_ascii=False, separators=(",", ":"))
        return str(captured)

    return PLACEHOLDER.sub(replace, value)


def _expand(value: Any, captures: dict[str, Any], project: Path) -> Any:
    if isinstance(value, str):
        return _expand_string(value, captures, project)
    if isinstance(value, list):
        return [_expand(item, captures, project) for item in value]
    if isinstance(value, dict):
        return {key: _expand(item, captures, project) for key, item in value.items()}
    return value


def _json_pointer(document: Any, pointer: str) -> Any:
    if pointer == "":
        return document
    if not pointer.startswith("/"):
        raise EvaluationError(f"JSON pointer must start with '/': {pointer}")
    current = document
    for raw_token in pointer[1:].split("/"):
        token = raw_token.replace("~1", "/").replace("~0", "~")
        if isinstance(current, dict) and token in current:
            current = current[token]
        elif isinstance(current, list) and token.isdigit() and int(token) < len(current):
            current = current[int(token)]
        else:
            return MISSING
    return current


def _set_json_pointer(document: Any, pointer: str, value: Any) -> None:
    if not pointer or not pointer.startswith("/"):
        raise EvaluationError("JSON mutation pointer must target an existing non-root value")
    tokens = [token.replace("~1", "/").replace("~0", "~") for token in pointer[1:].split("/")]
    current = document
    for token in tokens[:-1]:
        if isinstance(current, dict) and token in current:
            current = current[token]
        elif isinstance(current, list) and token.isdigit() and int(token) < len(current):
            current = current[int(token)]
        else:
            raise EvaluationError(f"JSON mutation pointer does not exist: {pointer}")
    final = tokens[-1]
    if isinstance(current, dict) and final in current:
        current[final] = value
    elif isinstance(current, list) and final.isdigit() and int(final) < len(current):
        current[int(final)] = value
    else:
        raise EvaluationError(f"JSON mutation pointer does not exist: {pointer}")


def _pointer_from_spec(document: Any, spec: dict[str, Any]) -> Any:
    pointers = spec.get("pointers")
    if pointers is None:
        pointers = [spec.get("pointer", "")]
    if not isinstance(pointers, list) or not pointers:
        raise EvaluationError("pointers must be a non-empty list")
    for pointer in pointers:
        value = _json_pointer(document, str(pointer))
        if value is not MISSING:
            return value
    return MISSING


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical_hash(value: Any) -> str:
    rendered = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(rendered.encode("utf-8")).hexdigest()


def _tree_sha256(root: Path) -> str:
    digest = hashlib.sha256()
    if not root.exists():
        raise EvaluationError(f"tree path does not exist: {root}")
    for path in sorted((item for item in root.rglob("*") if item.is_file()), key=lambda item: item.as_posix()):
        relative = path.relative_to(root).as_posix()
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def _agent_state_document(project: Path) -> dict[str, Any]:
    path = _project_path(project, AGENT_STATE_PATH.as_posix())
    if not path.is_file():
        raise EvaluationError(f"authoritative state file is missing: {AGENT_STATE_PATH.as_posix()}")
    try:
        document = json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise EvaluationError(f"authoritative state is invalid JSON: {exc}") from exc
    if not isinstance(document, dict):
        raise EvaluationError("authoritative state must be a JSON object")
    return document


def _source_value(
    spec: dict[str, Any],
    observation: CommandObservation | None,
    project: Path,
) -> Any:
    source = spec.get("source", "json")
    if source == "json":
        if observation is None or observation.payload is None:
            return MISSING
        return _pointer_from_spec(observation.payload, spec)
    if source == "stdout":
        return MISSING if observation is None else observation.stdout
    if source == "stderr":
        return MISSING if observation is None else observation.stderr
    if source == "returncode":
        return MISSING if observation is None else observation.returncode
    if source == "file_exists":
        return _project_path(project, str(spec["path"])).exists()
    if source == "file_text":
        path = _project_path(project, str(spec["path"]))
        return MISSING if not path.is_file() else path.read_text(encoding="utf-8-sig")
    if source == "file_json":
        path = _project_path(project, str(spec["path"]))
        if not path.is_file():
            return MISSING
        document = json.loads(path.read_text(encoding="utf-8-sig"))
        return _pointer_from_spec(document, spec)
    if source == "agent_state":
        return _pointer_from_spec(_agent_state_document(project), spec)
    if source == "file_sha256":
        path = _project_path(project, str(spec["path"]))
        return MISSING if not path.is_file() else _sha256(path)
    if source == "tree_sha256":
        return _tree_sha256(_project_path(project, str(spec.get("path", "."))))
    raise EvaluationError(f"unsupported assertion source: {source}")


def _expected_value(spec: dict[str, Any], captures: dict[str, Any], project: Path) -> Any:
    if "value_from" not in spec:
        return _expand(spec.get("value"), captures, project)
    source = spec["value_from"]
    if not isinstance(source, dict) or "capture" not in source:
        raise EvaluationError("value_from must name a capture")
    name = str(source["capture"])
    if name not in captures:
        raise EvaluationError(f"unknown capture in value_from: {name}")
    value = captures[name]
    if "add" in source:
        value = value + source["add"]
    return value


def _type_matches(value: Any, expected: str) -> bool:
    choices: dict[str, type | tuple[type, ...]] = {
        "object": dict,
        "array": list,
        "string": str,
        "integer": int,
        "number": (int, float),
        "boolean": bool,
        "null": type(None),
    }
    if expected not in choices:
        raise EvaluationError(f"unsupported type assertion: {expected}")
    if expected in {"integer", "number"} and isinstance(value, bool):
        return False
    return isinstance(value, choices[expected])


def _assert_one(
    spec: dict[str, Any],
    observation: CommandObservation | None,
    captures: dict[str, Any],
    project: Path,
) -> str | None:
    actual = _source_value(spec, observation, project)
    operation = str(spec.get("op", "eq"))
    label = str(spec.get("label") or spec.get("pointer") or spec.get("path") or spec.get("source", "json"))

    if operation == "exists":
        passed = actual is not MISSING
        expected = "present"
    elif operation == "absent":
        passed = actual is MISSING
        expected = "absent"
    else:
        if actual is MISSING:
            return f"{label}: value is missing"
        expected = _expected_value(spec, captures, project)
        if operation == "eq":
            passed = actual == expected
        elif operation == "ne":
            passed = actual != expected
        elif operation == "in":
            passed = actual in expected
        elif operation == "not_in":
            passed = actual not in expected
        elif operation == "contains":
            passed = expected in actual
        elif operation == "regex":
            passed = re.search(str(expected), str(actual), re.IGNORECASE | re.MULTILINE) is not None
        elif operation == "type":
            passed = _type_matches(actual, str(expected))
        elif operation == "ge":
            passed = actual >= expected
        elif operation == "gt":
            passed = actual > expected
        elif operation == "le":
            passed = actual <= expected
        elif operation == "lt":
            passed = actual < expected
        elif operation == "length_eq":
            passed = len(actual) == expected
        elif operation == "truthy":
            passed = bool(actual)
        elif operation == "falsy":
            passed = not bool(actual)
        else:
            raise EvaluationError(f"unsupported assertion operation: {operation}")

    if passed:
        return None
    rendered_actual = "<missing>" if actual is MISSING else repr(actual)
    return f"{label}: {operation} failed; actual={rendered_actual}, expected={expected!r}"


def _validate_machine_contract(observation: CommandObservation) -> list[str]:
    payload = observation.payload
    if payload is None:
        return ["stdout is not a JSON object"]
    failures: list[str] = []
    required = {
        "run_id",
        "exit_code",
        "status_before",
        "status_after",
        "status_revision",
        "gates",
        "checkpoint_id",
        "event_stream",
        "failure",
    }
    missing = sorted(required - payload.keys())
    if missing:
        failures.append(f"machine contract missing fields: {', '.join(missing)}")
    exit_code = payload.get("exit_code")
    if isinstance(exit_code, bool) or not isinstance(exit_code, int) or exit_code not in range(0, 6):
        failures.append("exit_code must be an integer from 0 through 5")
    if exit_code != observation.returncode:
        failures.append(
            f"JSON exit_code {exit_code!r} does not match process returncode "
            f"{observation.returncode}"
        )
    run_id = payload.get("run_id")
    if not isinstance(run_id, str) or not run_id:
        failures.append("run_id must be a non-empty string")
    revision = payload.get("status_revision")
    if isinstance(revision, bool) or not isinstance(revision, int) or revision < 0:
        failures.append("status_revision must be a non-negative integer")
    for key in ("status_before", "status_after"):
        status = payload.get(key)
        if key == "status_before" and status is None:
            continue
        if status not in CANONICAL_STATUSES:
            failures.append(f"{key} must be a canonical control status" + (" or null" if key == "status_before" else ""))
    gates = payload.get("gates")
    if not isinstance(gates, dict):
        failures.append("gates must be an object summary")
    else:
        missing_gates = sorted(GATE_IDS - gates.keys())
        if missing_gates:
            failures.append(f"gates summary missing: {', '.join(missing_gates)}")
        for gate_id in sorted(GATE_IDS & gates.keys()):
            record = gates[gate_id]
            status = record.get("status") if isinstance(record, dict) else record
            if status not in GATE_STATUSES:
                failures.append(f"gate {gate_id} has invalid status: {status!r}")
            if isinstance(record, dict):
                for count_key in ("fatal_count", "warning_count"):
                    if count_key in record and (
                        isinstance(record[count_key], bool)
                        or not isinstance(record[count_key], int)
                        or record[count_key] < 0
                    ):
                        failures.append(f"gate {gate_id}.{count_key} must be a non-negative integer")
    checkpoint_id = payload.get("checkpoint_id")
    if checkpoint_id is not None and (not isinstance(checkpoint_id, str) or not checkpoint_id):
        failures.append("checkpoint_id must be a non-empty string or null")
    stream = payload.get("event_stream")
    if not isinstance(stream, dict):
        failures.append("event_stream must be an object")
    else:
        missing_stream_fields = sorted({"path", "last_sequence", "last_event_id"} - stream.keys())
        if missing_stream_fields:
            failures.append(f"event_stream missing: {', '.join(missing_stream_fields)}")
        stream_path = stream.get("path")
        if not isinstance(stream_path, str) or not stream_path:
            failures.append("event_stream.path must be a non-empty project-relative path")
        elif Path(stream_path).is_absolute() or ".." in Path(stream_path).parts:
            failures.append("event_stream.path must remain project-relative")
        last_sequence = stream.get("last_sequence")
        if isinstance(last_sequence, bool) or not isinstance(last_sequence, int) or last_sequence < 0:
            failures.append("event_stream.last_sequence must be a non-negative integer")
        last_event_id = stream.get("last_event_id")
        if last_event_id is not None and (not isinstance(last_event_id, str) or not last_event_id):
            failures.append("event_stream.last_event_id must be a non-empty string or null")
    failure = payload.get("failure")
    if failure is not None:
        if not isinstance(failure, dict):
            failures.append("failure must be an object or null")
        else:
            for key in ("class", "code", "retryable"):
                if key not in failure:
                    failures.append(f"failure object missing {key}")
            failure_class = failure.get("class")
            if failure_class not in FAILURE_CLASSES:
                failures.append(f"failure.class is invalid: {failure_class!r}")
            failure_code = failure.get("code")
            if not isinstance(failure_code, str) or not failure_code:
                failures.append("failure.code must be a non-empty string")
            if "retryable" in failure and not isinstance(failure["retryable"], bool):
                failures.append("failure.retryable must be boolean")
    if observation.returncode == 0 and failure is not None:
        failures.append("successful command must set failure to null")
    if observation.returncode != 0 and failure is None:
        failures.append("non-zero command must include a structured failure")
    if isinstance(failure, dict) and observation.returncode in FAILURE_CLASS_BY_EXIT:
        allowed_classes = FAILURE_CLASS_BY_EXIT[observation.returncode]
        if failure.get("class") not in allowed_classes:
            failures.append(
                f"exit {observation.returncode} requires failure.class in {sorted(allowed_classes)}, "
                f"got {failure.get('class')!r}"
            )
    return failures


def _read_project_status(project: Path) -> str | None:
    project_yaml = project / "project.yaml"
    if not project_yaml.is_file():
        return None
    text = project_yaml.read_text(encoding="utf-8-sig")
    project_block = re.search(r"(?ms)^project:\s*\n(?P<body>(?:^[ \t]+.*\n?)*)", text)
    if not project_block:
        return None
    status = re.search(r"(?m)^\s{2}status:\s*[\"']?([^\s#\"']+)", project_block.group("body"))
    return status.group(1) if status else None


WORKFLOW_DOCUMENT = json.loads(WORKFLOW_CONTRACT.read_text(encoding="utf-8"))
AGENT_STATE_SCHEMA_DOCUMENT = json.loads(AGENT_STATE_SCHEMA.read_text(encoding="utf-8"))
CANONICAL_STATUSES = {item["id"] for item in WORKFLOW_DOCUMENT["stages"]}
ALLOWED_TRANSITIONS = {
    (item["from"], item["to"]) for item in WORKFLOW_DOCUMENT["allowed_transitions"]
}


def _validate_authoritative_state(
    project: Path,
    payload: dict[str, Any],
    allow_project_mirror_conflict: bool = False,
) -> list[str]:
    failures: list[str] = []
    try:
        state = _agent_state_document(project)
    except EvaluationError as exc:
        return [str(exc)]
    if Draft202012Validator is None or FormatChecker is None:
        return ["jsonschema is required to validate .agent/state.json"]

    validator = Draft202012Validator(AGENT_STATE_SCHEMA_DOCUMENT, format_checker=FormatChecker())
    schema_errors = sorted(validator.iter_errors(state), key=lambda error: list(error.absolute_path))
    for error in schema_errors:
        location = "/" + "/".join(str(item) for item in error.absolute_path)
        failures.append(f"agent state schema {location or '/'}: {error.message}")

    if state.get("status") != payload.get("status_after"):
        failures.append("agent state status does not match output status_after")
    if state.get("status_revision") != payload.get("status_revision"):
        failures.append("agent state status_revision does not match output")
    if state.get("project_status_mirror") != state.get("status"):
        failures.append("agent state project_status_mirror does not equal authoritative status")
    project_status = _read_project_status(project)
    if not allow_project_mirror_conflict and project_status != state.get("status"):
        failures.append("project.yaml status does not mirror authoritative agent state")

    output_gates = payload.get("gates")
    state_gates = state.get("gates")
    if isinstance(output_gates, dict) and isinstance(state_gates, dict):
        for gate_id in sorted(GATE_IDS):
            output_record = output_gates.get(gate_id)
            output_status = output_record.get("status") if isinstance(output_record, dict) else output_record
            state_record = state_gates.get(gate_id)
            state_status = state_record.get("status") if isinstance(state_record, dict) else None
            if output_status != state_status:
                failures.append(
                    f"output gate {gate_id}={output_status!r} does not match state={state_status!r}"
                )

    output_stream = payload.get("event_stream")
    state_stream = state.get("event_stream")
    if isinstance(output_stream, dict) and isinstance(state_stream, dict):
        for key in ("path", "last_sequence", "last_event_id"):
            if output_stream.get(key) != state_stream.get(key):
                failures.append(f"output event_stream.{key} does not match authoritative state")
    return failures


def _event_stream_path(payload: dict[str, Any], project: Path) -> Path:
    stream = payload.get("event_stream")
    if not isinstance(stream, dict) or not isinstance(stream.get("path"), str):
        raise EvaluationError("event_stream.path is missing")
    return _project_path(project, stream["path"])


def _check_event_stream(
    payload: dict[str, Any],
    project: Path,
    previous_bytes: bytes | None = None,
) -> list[str]:
    failures: list[str] = []
    try:
        path = _event_stream_path(payload, project)
    except EvaluationError as exc:
        return [str(exc)]
    if not path.is_file():
        return [f"event stream does not exist: {path.relative_to(project)}"]

    current_bytes = path.read_bytes()
    if previous_bytes is not None and not current_bytes.startswith(previous_bytes):
        failures.append("event stream is not append-only; prior bytes were changed or removed")
    try:
        stream_text = current_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        return failures + [f"event stream is not UTF-8: {exc}"]

    events: list[dict[str, Any]] = []
    for line_number, raw_line in enumerate(stream_text.splitlines(), 1):
        if not raw_line.strip():
            continue
        try:
            event = json.loads(raw_line)
        except json.JSONDecodeError as exc:
            failures.append(f"event stream line {line_number} is invalid JSON: {exc}")
            continue
        if not isinstance(event, dict):
            failures.append(f"event stream line {line_number} is not an object")
            continue
        events.append(event)

    event_ids: set[str] = set()
    last_sequence_by_run: dict[str, int] = {}
    previous_event_hash: str | None = None
    previous_global_sequence = 0
    for index, event in enumerate(events, 1):
        missing_fields = sorted(EVENT_REQUIRED_FIELDS - event.keys())
        if missing_fields:
            failures.append(f"event {index} missing fields: {', '.join(missing_fields)}")
        event_id = event.get("event_id")
        run_id = event.get("run_id")
        sequence = event.get("sequence")
        if not isinstance(event_id, str) or not event_id:
            failures.append(f"event {index} has no stable event_id")
        elif event_id in event_ids:
            failures.append(f"duplicate event_id: {event_id}")
        else:
            event_ids.add(event_id)
        if not isinstance(run_id, str) or not run_id:
            failures.append(f"event {index} has no run_id")
            continue
        if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 1:
            failures.append(f"event {index} has invalid sequence: {sequence!r}")
            continue
        prior = last_sequence_by_run.get(run_id, 0)
        if sequence <= prior:
            failures.append(f"event sequence is not increasing for run {run_id}: {prior} -> {sequence}")
        last_sequence_by_run[run_id] = sequence
        if sequence != previous_global_sequence + 1:
            failures.append(
                f"global event sequence is not contiguous: {previous_global_sequence} -> {sequence}"
            )
        previous_global_sequence = sequence

        if not isinstance(event.get("project_id"), str) or not event.get("project_id"):
            failures.append(f"event {index} has invalid project_id")
        if event.get("workflow_version") != WORKFLOW_DOCUMENT.get("version"):
            failures.append(f"event {index} has incompatible workflow_version")
        if event.get("control_status") not in CANONICAL_STATUSES:
            failures.append(f"event {index} has invalid control_status")
        if not isinstance(event.get("type"), str) or not event.get("type"):
            failures.append(f"event {index} has invalid type")
        if not isinstance(event.get("timestamp"), str) or re.fullmatch(
            r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})",
            event.get("timestamp", ""),
        ) is None:
            failures.append(f"event {index} has invalid timestamp")
        attempt = event.get("attempt")
        if isinstance(attempt, bool) or not isinstance(attempt, int) or attempt < 1:
            failures.append(f"event {index} has invalid attempt")
        if event.get("severity") not in EVENT_SEVERITIES:
            failures.append(f"event {index} has invalid severity")
        if not isinstance(event.get("payload"), dict):
            failures.append(f"event {index} payload must be an object")
        fingerprint = event.get("input_fingerprint")
        if not isinstance(fingerprint, str) or re.fullmatch(r"[a-f0-9]{64}", fingerprint) is None:
            failures.append(f"event {index} has invalid input_fingerprint")
        for nullable_identifier in ("node_id", "checkpoint_id", "causation_id", "correlation_id"):
            value = event.get(nullable_identifier)
            if value is not None and (not isinstance(value, str) or not value):
                failures.append(f"event {index} has invalid {nullable_identifier}")
        if event.get("previous_event_hash") != previous_event_hash:
            failures.append(f"event {index} previous_event_hash does not match the chain head")
        declared_event_hash = event.get("event_hash")
        unhashed = dict(event)
        unhashed.pop("event_hash", None)
        computed_event_hash = _canonical_hash(unhashed)
        if declared_event_hash != computed_event_hash:
            failures.append(f"event {index} event_hash does not match canonical event content")
        previous_event_hash = declared_event_hash if isinstance(declared_event_hash, str) else None

    stream = payload["event_stream"]
    if events and stream.get("last_event_id") != events[-1].get("event_id"):
        failures.append("event_stream.last_event_id does not match the final event")
    if events and stream.get("last_sequence") != events[-1].get("sequence"):
        failures.append("event_stream.last_sequence does not match the final event")
    if not events and stream.get("last_event_id") is not None:
        failures.append("empty event stream must have null last_event_id")
    if not events and stream.get("last_sequence") != 0:
        failures.append("empty event stream must have last_sequence zero")
    stream_hash = stream.get("stream_sha256")
    if stream_hash != previous_event_hash:
        failures.append("event_stream.stream_sha256 does not match the event hash-chain head")
    return failures


def _open_fatal_or_high_blockers(project: Path) -> list[str]:
    path = project / "evidence" / "blockers.csv"
    if not path.is_file():
        return []
    result: list[str] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            severity = (row.get("severity") or "").strip().lower()
            status = (row.get("status") or "").strip().lower()
            if severity in {"fatal", "high"} and status not in {"resolved", "waived"}:
                result.append((row.get("blocker_id") or "unknown").strip())
            if severity == "fatal" and status == "waived":
                result.append((row.get("blocker_id") or "unknown").strip())
    return result


def _project_open_fatal_high_risks(project: Path) -> list[str]:
    if yaml is None:
        return []
    project_yaml = project / "project.yaml"
    if not project_yaml.is_file():
        return ["project.yaml-missing"]
    try:
        document = yaml.safe_load(project_yaml.read_text(encoding="utf-8-sig"))
    except Exception as exc:  # noqa: BLE001
        return [f"project.yaml-invalid:{exc}"]
    result: list[str] = []
    risks = document.get("risks", {}) if isinstance(document, dict) else {}
    for severity in ("fatal", "high"):
        items = risks.get(severity, []) if isinstance(risks, dict) else []
        if not isinstance(items, list):
            result.append(f"project-risk-{severity}-invalid")
            continue
        for index, item in enumerate(items, 1):
            if isinstance(item, str):
                result.append(item)
            elif isinstance(item, dict) and item.get("status") not in {"resolved", "accepted"}:
                result.append(str(item.get("id") or f"{severity}-{index}"))
    return result


def _checkpoint_artifact_failures(project: Path) -> list[str]:
    try:
        state = _agent_state_document(project)
    except EvaluationError as exc:
        return [str(exc)]
    checkpoint = state.get("latest_checkpoint")
    if not isinstance(checkpoint, dict):
        return ["latest_checkpoint is missing"]
    artifacts = checkpoint.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        return ["checkpoint must contain at least one hashed artifact"]
    failures: list[str] = []
    for index, artifact in enumerate(artifacts, 1):
        if not isinstance(artifact, dict) or not isinstance(artifact.get("path"), str):
            failures.append(f"checkpoint artifact {index} is malformed")
            continue
        try:
            path = _project_path(project, artifact["path"])
        except EvaluationError as exc:
            failures.append(str(exc))
            continue
        if not path.is_file():
            failures.append(f"checkpoint artifact missing: {artifact['path']}")
            continue
        if artifact.get("size_bytes") != path.stat().st_size:
            failures.append(f"checkpoint artifact size mismatch: {artifact['path']}")
        if artifact.get("sha256") != _sha256(path):
            failures.append(f"checkpoint artifact hash mismatch: {artifact['path']}")
    return failures


def _event_type_recorded(payload: dict[str, Any], project: Path, expected_type: str) -> bool:
    path = _event_stream_path(payload, project)
    run_id = payload.get("run_id")
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        if not raw_line.strip():
            continue
        event = json.loads(raw_line)
        if event.get("run_id") == run_id and event.get("type") == expected_type:
            return True
    return False


def _check_invariant(
    name: str,
    observation: CommandObservation,
    project: Path,
) -> list[str]:
    payload = observation.payload or {}
    if name == "project_status_mirror":
        mirrored = _read_project_status(project)
        if mirrored != payload.get("status_after"):
            return [f"project.status={mirrored!r} does not mirror status_after={payload.get('status_after')!r}"]
        return []
    if name == "adjacent_transition_only":
        before, after = payload.get("status_before"), payload.get("status_after")
        if before is None or before == after:
            return []
        if (before, after) not in ALLOWED_TRANSITIONS:
            return [f"illegal non-adjacent transition committed: {before} -> {after}"]
        return []
    if name == "blocked_preserves_status":
        if payload.get("status_before") != payload.get("status_after"):
            return ["blocked command changed control status"]
        return []
    if name == "event_stream_consistent":
        return _check_event_stream(payload, project)
    if name == "submission_zero_fatal_high":
        failures: list[str] = []
        gates = payload.get("gates")
        if isinstance(gates, dict):
            for gate_id, record in gates.items():
                if isinstance(record, dict) and record.get("fatal_count", 0) != 0:
                    failures.append(f"gate {gate_id} has fatal_count={record.get('fatal_count')}")
        open_blockers = _open_fatal_or_high_blockers(project)
        if open_blockers:
            failures.append(f"submission has unresolved fatal/high blockers: {', '.join(open_blockers)}")
        open_risks = _project_open_fatal_high_risks(project)
        if open_risks:
            failures.append(f"submission has unresolved project fatal/high risks: {', '.join(open_risks)}")
        return failures
    if name == "checkpoint_artifacts_match":
        return _checkpoint_artifact_failures(project)
    if name == "checkpoint_event_recorded":
        return [] if _event_type_recorded(payload, project, "checkpoint_committed") else [
            "checkpoint command did not append checkpoint_committed"
        ]
    if name == "resume_event_recorded":
        return [] if _event_type_recorded(payload, project, "run_resumed") else [
            "resume command did not append run_resumed"
        ]
    raise EvaluationError(f"unsupported invariant: {name}")


def _parse_stdout(stdout: str) -> dict[str, Any]:
    if not stdout.strip():
        raise EvaluationError("command stdout is empty")
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise EvaluationError(f"stdout must be exactly one JSON object: {exc}") from exc
    if not isinstance(payload, dict):
        raise EvaluationError("stdout JSON must be an object")
    return payload


def _run_cli(
    cli: Path,
    project: Path,
    arguments: list[str],
    timeout_seconds: float,
) -> CommandObservation:
    argv = [sys.executable, "-X", "utf8", str(cli), str(project), *arguments]
    environment = os.environ.copy()
    environment["PYTHONIOENCODING"] = "utf-8"
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    started = time.monotonic()
    try:
        result = subprocess.run(
            argv,
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=environment,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        duration = time.monotonic() - started
        stdout = exc.stdout.decode("utf-8", errors="replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        stderr = exc.stderr.decode("utf-8", errors="replace") if isinstance(exc.stderr, bytes) else (exc.stderr or "")
        return CommandObservation(argv, -1, stdout, stderr + "\ncommand timed out", duration)
    duration = time.monotonic() - started
    observation = CommandObservation(argv, result.returncode, result.stdout, result.stderr, duration)
    try:
        observation.payload = _parse_stdout(result.stdout)
    except EvaluationError:
        observation.payload = None
    return observation


def _copy_fixture(spec: dict[str, Any], project: Path, captures: dict[str, Any]) -> str:
    source = _repo_source(str(spec["from"]))
    destination = _project_path(project, _expand_string(str(spec["to"]), captures, project))
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir():
        shutil.copytree(source, destination, dirs_exist_ok=True)
    else:
        shutil.copy2(source, destination)
    return f"copied {source.relative_to(ROOT)} -> {destination.relative_to(project)}"


def _write_fixture(spec: dict[str, Any], project: Path, captures: dict[str, Any], append: bool = False) -> str:
    destination = _project_path(project, _expand_string(str(spec["path"]), captures, project))
    destination.parent.mkdir(parents=True, exist_ok=True)
    content = _expand_string(str(spec.get("content", "")), captures, project)
    mode = "a" if append else "w"
    with destination.open(mode, encoding="utf-8", newline="") as handle:
        handle.write(content)
    verb = "appended" if append else "wrote"
    return f"{verb} {destination.relative_to(project)}"


def _replace_fixture(spec: dict[str, Any], project: Path, captures: dict[str, Any]) -> str:
    destination = _project_path(project, _expand_string(str(spec["path"]), captures, project))
    if not destination.is_file():
        raise EvaluationError(f"replace target does not exist: {spec['path']}")
    text = destination.read_text(encoding="utf-8-sig")
    replacements = spec.get("replacements")
    if not isinstance(replacements, list) or not replacements:
        raise EvaluationError("replace step requires replacements")
    details: list[str] = []
    for replacement in replacements:
        old = _expand_string(str(replacement["old"]), captures, project)
        new = _expand_string(str(replacement["new"]), captures, project)
        expected_count = int(replacement.get("count", 1))
        actual_count = text.count(old)
        if actual_count != expected_count:
            raise EvaluationError(
                f"replace expected {expected_count} occurrence(s) of {old!r}, found {actual_count}"
            )
        text = text.replace(old, new, expected_count)
        details.append(f"{old!r} -> {new!r}")
    destination.write_text(text, encoding="utf-8")
    return f"replaced {destination.relative_to(project)}: " + "; ".join(details)


def _json_set_fixture(spec: dict[str, Any], project: Path, captures: dict[str, Any]) -> str:
    destination = _project_path(project, _expand_string(str(spec["path"]), captures, project))
    if not destination.is_file():
        raise EvaluationError(f"json_set target does not exist: {spec['path']}")
    try:
        document = json.loads(destination.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise EvaluationError(f"json_set target is invalid JSON: {exc}") from exc
    updates = spec.get("updates")
    if not isinstance(updates, list) or not updates:
        raise EvaluationError("json_set step requires updates")
    changed: list[str] = []
    for update in updates:
        pointer = str(update["pointer"])
        value = _expand(update["value"], captures, project)
        _set_json_pointer(document, pointer, value)
        changed.append(pointer)
    destination.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return f"updated {destination.relative_to(project)}: " + ", ".join(changed)


def _delete_fixture(spec: dict[str, Any], project: Path, captures: dict[str, Any]) -> str:
    destination = _project_path(project, _expand_string(str(spec["path"]), captures, project))
    if not destination.is_file():
        raise EvaluationError(f"delete target is not a file: {spec['path']}")
    relative = destination.relative_to(project)
    destination.unlink()
    return f"deleted {relative}"


def _fixture_step(
    step: dict[str, Any],
    project: Path,
    captures: dict[str, Any],
) -> tuple[str, str]:
    if "copy" in step:
        return "copy", _copy_fixture(step["copy"], project, captures)
    if "write" in step:
        return "write", _write_fixture(step["write"], project, captures)
    if "append" in step:
        return "append", _write_fixture(step["append"], project, captures, append=True)
    if "replace" in step:
        return "replace", _replace_fixture(step["replace"], project, captures)
    if "json_set" in step:
        return "json_set", _json_set_fixture(step["json_set"], project, captures)
    if "delete" in step:
        return "delete", _delete_fixture(step["delete"], project, captures)
    if "mkdir" in step:
        destination = _project_path(
            project,
            _expand_string(str(step["mkdir"]["path"]), captures, project),
        )
        destination.mkdir(parents=True, exist_ok=True)
        return "mkdir", f"created {destination.relative_to(project)}"
    raise EvaluationError("fixture step must define copy, write, append, replace, json_set, delete, or mkdir")


def _load_scenario(path: Path, stack: tuple[Path, ...] = ()) -> dict[str, Any]:
    resolved = path.resolve()
    if not _is_within(resolved, SCENARIO_DIRECTORY.resolve()):
        raise EvaluationError(f"scenario escapes scenario directory: {path}")
    if resolved in stack:
        chain = " -> ".join(item.name for item in (*stack, resolved))
        raise EvaluationError(f"scenario inheritance cycle: {chain}")
    try:
        document = json.loads(resolved.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise EvaluationError(f"cannot load scenario {resolved.name}: {exc}") from exc
    if not isinstance(document, dict):
        raise EvaluationError(f"scenario must be an object: {resolved.name}")
    parent_name = document.get("extends")
    if not parent_name:
        return document
    parent_path = (resolved.parent / str(parent_name)).resolve()
    parent = _load_scenario(parent_path, (*stack, resolved))
    merged = {key: value for key, value in parent.items() if key not in {"id", "description", "abstract", "steps"}}
    merged.update({key: value for key, value in document.items() if key not in {"extends", "steps"}})
    merged["steps"] = list(parent.get("steps", [])) + list(document.get("steps", []))
    return merged


def _nested_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [item for value_item in value for item in _nested_strings(value_item)]
    if isinstance(value, dict):
        return [item for value_item in value.values() for item in _nested_strings(value_item)]
    return []


def _validate_scenario(document: dict[str, Any], source: Path) -> None:
    if document.get("schema_version") != "1.0":
        raise EvaluationError(f"{source.name}: schema_version must be '1.0'")
    if not document.get("abstract"):
        if not isinstance(document.get("id"), str) or not document["id"]:
            raise EvaluationError(f"{source.name}: concrete scenario requires id")
        if not isinstance(document.get("description"), str) or not document["description"]:
            raise EvaluationError(f"{source.name}: concrete scenario requires description")
    steps = document.get("steps")
    if not isinstance(steps, list) or not steps:
        raise EvaluationError(f"{source.name}: scenario requires non-empty steps")
    step_ids: set[str] = set()
    available_captures: set[str] = set()
    for index, step in enumerate(steps, 1):
        if not isinstance(step, dict):
            raise EvaluationError(f"{source.name}: step {index} must be an object")
        step_id = step.get("id")
        if not isinstance(step_id, str) or not step_id:
            raise EvaluationError(f"{source.name}: step {index} requires id")
        if step_id in step_ids:
            raise EvaluationError(f"{source.name}: duplicate step id {step_id}")
        step_ids.add(step_id)
        kinds = sum(
            key in step
            for key in ("run", "copy", "write", "append", "replace", "json_set", "delete", "mkdir")
        )
        if kinds != 1:
            raise EvaluationError(f"{source.name}: step {step_id} must define exactly one action")
        if "copy" in step and (
            not isinstance(step["copy"], dict)
            or not isinstance(step["copy"].get("from"), str)
            or not isinstance(step["copy"].get("to"), str)
        ):
            raise EvaluationError(f"{source.name}: step {step_id} copy requires string from/to")
        for fixture_action in ("write", "append"):
            if fixture_action in step and (
                not isinstance(step[fixture_action], dict)
                or not isinstance(step[fixture_action].get("path"), str)
                or not isinstance(step[fixture_action].get("content", ""), str)
            ):
                raise EvaluationError(
                    f"{source.name}: step {step_id} {fixture_action} requires string path/content"
                )
        if "mkdir" in step and (
            not isinstance(step["mkdir"], dict) or not isinstance(step["mkdir"].get("path"), str)
        ):
            raise EvaluationError(f"{source.name}: step {step_id} mkdir requires string path")
        if "delete" in step and (
            not isinstance(step["delete"], dict) or not isinstance(step["delete"].get("path"), str)
        ):
            raise EvaluationError(f"{source.name}: step {step_id} delete requires string path")
        if "replace" in step:
            replace_spec = step["replace"]
            if not isinstance(replace_spec, dict) or not isinstance(replace_spec.get("path"), str):
                raise EvaluationError(f"{source.name}: step {step_id} replace requires string path")
            replacements = replace_spec.get("replacements")
            if not isinstance(replacements, list) or not replacements:
                raise EvaluationError(f"{source.name}: step {step_id} replace requires replacements")
            for replacement in replacements:
                if (
                    not isinstance(replacement, dict)
                    or not isinstance(replacement.get("old"), str)
                    or not isinstance(replacement.get("new"), str)
                    or isinstance(replacement.get("count", 1), bool)
                    or not isinstance(replacement.get("count", 1), int)
                    or replacement.get("count", 1) < 1
                ):
                    raise EvaluationError(
                        f"{source.name}: step {step_id} has invalid replacement specification"
                    )
        if "json_set" in step:
            json_set_spec = step["json_set"]
            if not isinstance(json_set_spec, dict) or not isinstance(json_set_spec.get("path"), str):
                raise EvaluationError(f"{source.name}: step {step_id} json_set requires string path")
            updates = json_set_spec.get("updates")
            if not isinstance(updates, list) or not updates:
                raise EvaluationError(f"{source.name}: step {step_id} json_set requires updates")
            for update in updates:
                if (
                    not isinstance(update, dict)
                    or not isinstance(update.get("pointer"), str)
                    or not update["pointer"].startswith("/")
                    or "value" not in update
                ):
                    raise EvaluationError(
                        f"{source.name}: step {step_id} has invalid json_set update"
                    )
        for text_value in _nested_strings(step):
            for match in PLACEHOLDER.finditer(text_value):
                capture_name = match.group(2)
                if capture_name and capture_name not in available_captures:
                    raise EvaluationError(
                        f"{source.name}: step {step_id} references capture before declaration: {capture_name}"
                    )
        if "run" in step and not isinstance(step["run"], list):
            raise EvaluationError(f"{source.name}: step {step_id} run must be an argument list")
        if "run" not in step:
            continue
        if not step["run"] or not all(isinstance(item, (str, int, float)) for item in step["run"]):
            raise EvaluationError(f"{source.name}: step {step_id} run arguments must be scalar")
        expected_exit = step.get("expect_exit", 0)
        exits = [expected_exit] if isinstance(expected_exit, int) else expected_exit
        if (
            not isinstance(exits, list)
            or not exits
            or any(isinstance(code, bool) or not isinstance(code, int) or code not in range(0, 6) for code in exits)
        ):
            raise EvaluationError(f"{source.name}: step {step_id} expect_exit must contain codes 0-5")
        if "contract" in step and not isinstance(step["contract"], bool):
            raise EvaluationError(f"{source.name}: step {step_id} contract must be boolean")
        if "allow_project_mirror_conflict" in step and not isinstance(
            step["allow_project_mirror_conflict"], bool
        ):
            raise EvaluationError(
                f"{source.name}: step {step_id} allow_project_mirror_conflict must be boolean"
            )

        assertions = step.get("assert", [])
        if not isinstance(assertions, list):
            raise EvaluationError(f"{source.name}: step {step_id} assert must be a list")
        for assertion_index, assertion in enumerate(assertions, 1):
            if not isinstance(assertion, dict):
                raise EvaluationError(
                    f"{source.name}: step {step_id} assertion {assertion_index} must be an object"
                )
            assertion_source = assertion.get("source", "json")
            operation = assertion.get("op", "eq")
            if assertion_source not in ASSERTION_SOURCES:
                raise EvaluationError(
                    f"{source.name}: step {step_id} assertion {assertion_index} has invalid source"
                )
            if operation not in ASSERTION_OPERATIONS:
                raise EvaluationError(
                    f"{source.name}: step {step_id} assertion {assertion_index} has invalid op"
                )
            if assertion_source in {"file_exists", "file_text", "file_json", "file_sha256"} and not isinstance(
                assertion.get("path"), str
            ):
                raise EvaluationError(
                    f"{source.name}: step {step_id} assertion {assertion_index} requires path"
                )
            if assertion_source in {"json", "file_json", "agent_state"}:
                pointer = assertion.get("pointer")
                pointers = assertion.get("pointers")
                if pointer is not None and (not isinstance(pointer, str) or (pointer and not pointer.startswith("/"))):
                    raise EvaluationError(
                        f"{source.name}: step {step_id} assertion {assertion_index} has invalid pointer"
                    )
                if pointers is not None and (
                    not isinstance(pointers, list)
                    or not pointers
                    or any(not isinstance(item, str) or (item and not item.startswith("/")) for item in pointers)
                ):
                    raise EvaluationError(
                        f"{source.name}: step {step_id} assertion {assertion_index} has invalid pointers"
                    )
            value_from = assertion.get("value_from")
            if value_from is not None:
                if not isinstance(value_from, dict) or not isinstance(value_from.get("capture"), str):
                    raise EvaluationError(
                        f"{source.name}: step {step_id} assertion {assertion_index} has invalid value_from"
                    )
                if value_from["capture"] not in available_captures:
                    raise EvaluationError(
                        f"{source.name}: step {step_id} assertion {assertion_index} references "
                        f"capture before declaration: {value_from['capture']}"
                    )

        captures = step.get("capture", {})
        if not isinstance(captures, dict):
            raise EvaluationError(f"{source.name}: step {step_id} capture must be an object")
        for capture_name, capture_spec in captures.items():
            if not isinstance(capture_name, str) or not capture_name or not isinstance(capture_spec, dict):
                raise EvaluationError(f"{source.name}: step {step_id} has invalid capture")
            capture_source = capture_spec.get("source", "json")
            if capture_source not in ASSERTION_SOURCES:
                raise EvaluationError(f"{source.name}: step {step_id} capture {capture_name} has invalid source")
            if capture_source in {"file_exists", "file_text", "file_json", "file_sha256"} and not isinstance(
                capture_spec.get("path"), str
            ):
                raise EvaluationError(
                    f"{source.name}: step {step_id} capture {capture_name} requires path"
                )
            if capture_source in {"json", "file_json", "agent_state"}:
                pointer = capture_spec.get("pointer")
                pointers = capture_spec.get("pointers")
                if pointer is not None and (not isinstance(pointer, str) or (pointer and not pointer.startswith("/"))):
                    raise EvaluationError(
                        f"{source.name}: step {step_id} capture {capture_name} has invalid pointer"
                    )
                if pointers is not None and (
                    not isinstance(pointers, list)
                    or not pointers
                    or any(not isinstance(item, str) or (item and not item.startswith("/")) for item in pointers)
                ):
                    raise EvaluationError(
                        f"{source.name}: step {step_id} capture {capture_name} has invalid pointers"
                    )

        invariants = step.get("invariants", [])
        if not isinstance(invariants, list) or any(item not in INVARIANT_NAMES for item in invariants):
            raise EvaluationError(f"{source.name}: step {step_id} has invalid invariant")
        available_captures.update(captures)


def _run_scenario(
    document: dict[str, Any],
    cli: Path,
    temporary_root: Path,
    timeout_seconds: float,
    keep_temp: bool,
) -> ScenarioReport:
    report = ScenarioReport(str(document["id"]), str(document["description"]))
    started = time.monotonic()
    workspace = temporary_root / re.sub(r"[^A-Za-z0-9_.-]+", "_", report.scenario_id)
    project = workspace / "project"
    workspace.mkdir(parents=True, exist_ok=False)
    captures: dict[str, Any] = {}
    event_stream_snapshot: bytes | None = None

    for step in document["steps"]:
        step_id = str(step["id"])
        step_started = time.monotonic()
        if "run" not in step:
            try:
                kind, detail = _fixture_step(step, project, captures)
                report.steps.append(
                    StepReport(step_id, kind, True, detail, duration_seconds=time.monotonic() - step_started)
                )
            except Exception as exc:  # noqa: BLE001 - render deterministic harness failure
                report.steps.append(
                    StepReport(
                        step_id,
                        "fixture",
                        False,
                        str(exc),
                        duration_seconds=time.monotonic() - step_started,
                    )
                )
                report.passed = False
                break
            continue

        try:
            expanded = _expand(step["run"], captures, project)
            arguments = [str(item) for item in expanded]
        except EvaluationError as exc:
            report.steps.append(StepReport(step_id, "command", False, str(exc)))
            report.passed = False
            break

        observation = _run_cli(cli, project, arguments, timeout_seconds)
        expected_exit = step.get("expect_exit", 0)
        allowed_exits = [expected_exit] if isinstance(expected_exit, int) else list(expected_exit)
        failures: list[str] = []
        if observation.returncode not in allowed_exits:
            failures.append(
                f"returncode {observation.returncode}, expected one of {allowed_exits}; "
                f"stderr={observation.stderr.strip()!r}"
            )
        if observation.payload is None:
            try:
                _parse_stdout(observation.stdout)
            except EvaluationError as exc:
                failures.append(str(exc))
        elif step.get("contract", True):
            failures.extend(_validate_machine_contract(observation))
            failures.extend(
                _validate_authoritative_state(
                    project,
                    observation.payload,
                    allow_project_mirror_conflict=bool(step.get("allow_project_mirror_conflict", False)),
                )
            )

        for assertion in step.get("assert", []):
            try:
                failure = _assert_one(assertion, observation, captures, project)
            except Exception as exc:  # noqa: BLE001
                failure = f"assertion error: {exc}"
            if failure:
                failures.append(failure)

        if observation.payload is not None:
            for invariant in step.get("invariants", []):
                try:
                    if invariant == "event_stream_consistent":
                        failures.extend(
                            _check_event_stream(observation.payload, project, event_stream_snapshot)
                        )
                        try:
                            event_stream_snapshot = _event_stream_path(
                                observation.payload, project
                            ).read_bytes()
                        except (EvaluationError, OSError):
                            event_stream_snapshot = None
                    else:
                        failures.extend(_check_invariant(str(invariant), observation, project))
                except Exception as exc:  # noqa: BLE001
                    failures.append(f"invariant {invariant} error: {exc}")

        if not failures:
            for name, capture_spec in step.get("capture", {}).items():
                try:
                    captured = _source_value(capture_spec, observation, project)
                    if captured is MISSING:
                        raise EvaluationError(f"capture source is missing: {name}")
                    captures[name] = captured
                except Exception as exc:  # noqa: BLE001
                    failures.append(f"capture {name} failed: {exc}")

        detail = "ok" if not failures else "; ".join(failures)
        report.steps.append(
            StepReport(
                step_id,
                "command",
                not failures,
                detail,
                command=observation.argv,
                returncode=observation.returncode,
                duration_seconds=observation.duration_seconds,
                stdout=observation.stdout,
                stderr=observation.stderr,
            )
        )
        if failures:
            report.passed = False
            break

    report.duration_seconds = time.monotonic() - started
    if keep_temp:
        report.project_path = str(project)
    return report


def _discover_scenarios(requested: list[str] | None) -> list[tuple[Path, dict[str, Any]]]:
    if not SCENARIO_DIRECTORY.is_dir():
        raise EvaluationError(f"scenario directory does not exist: {SCENARIO_DIRECTORY}")
    paths = sorted(SCENARIO_DIRECTORY.glob("*.json"))
    loaded: list[tuple[Path, dict[str, Any]]] = []
    for path in paths:
        document = _load_scenario(path)
        _validate_scenario(document, path)
        if document.get("abstract"):
            continue
        loaded.append((path, document))
    scenario_ids = [document["id"] for _, document in loaded]
    if len(scenario_ids) != len(set(scenario_ids)):
        raise EvaluationError("concrete scenario IDs must be unique")
    if not requested:
        return loaded
    wanted = set(requested)
    selected = [item for item in loaded if item[1]["id"] in wanted or item[0].name in wanted]
    found = {item[1]["id"] for item in selected} | {item[0].name for item in selected}
    missing = sorted(wanted - found)
    if missing:
        raise EvaluationError(f"unknown requested scenarios: {', '.join(missing)}")
    return selected


def _write_result(payload: dict[str, Any], output: Path | None) -> None:
    rendered = json.dumps(payload, ensure_ascii=False, indent=2)
    print(rendered)
    if output is not None:
        output = output.expanduser().resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cli", type=Path, default=DEFAULT_CLI, help="Path to agentctl.py")
    parser.add_argument("--scenario", action="append", help="Scenario ID or filename; repeat to select several")
    parser.add_argument("--timeout", type=float, default=30.0, help="Per-command timeout in seconds")
    parser.add_argument("--validate-only", action="store_true", help="Validate scenario syntax without invoking CLI")
    parser.add_argument("--list", action="store_true", help="List concrete scenarios")
    parser.add_argument("--keep-temp", action="store_true", help="Preserve isolated scenario projects")
    parser.add_argument("--json-out", type=Path, help="Also write the aggregate result to this path")
    args = parser.parse_args()

    try:
        scenarios = _discover_scenarios(args.scenario)
    except EvaluationError as exc:
        _write_result({"success": False, "infrastructure_error": str(exc)}, args.json_out)
        return 2

    if args.list:
        _write_result(
            {
                "success": True,
                "scenarios": [
                    {"id": document["id"], "description": document["description"], "file": path.name}
                    for path, document in scenarios
                ],
            },
            args.json_out,
        )
        return 0

    if args.validate_only:
        _write_result(
            {
                "success": True,
                "validated": len(scenarios),
                "scenario_ids": [document["id"] for _, document in scenarios],
            },
            args.json_out,
        )
        return 0

    cli = args.cli.expanduser().resolve()
    if not cli.is_file():
        _write_result(
            {
                "success": False,
                "infrastructure_error": f"agentctl CLI not found: {cli}",
                "hint": "Use --validate-only while the runtime is being implemented.",
            },
            args.json_out,
        )
        return 2
    if args.timeout <= 0:
        _write_result({"success": False, "infrastructure_error": "--timeout must be positive"}, args.json_out)
        return 2

    temporary_root = Path(tempfile.mkdtemp(prefix="evi_x_behavior_evals_"))
    reports: list[ScenarioReport] = []
    started = time.monotonic()
    try:
        for _, document in scenarios:
            reports.append(_run_scenario(document, cli, temporary_root, args.timeout, args.keep_temp))
    finally:
        if not args.keep_temp:
            shutil.rmtree(temporary_root)

    passed = [report.scenario_id for report in reports if report.passed]
    failed = [report.scenario_id for report in reports if not report.passed]
    payload: dict[str, Any] = {
        "success": not failed,
        "summary": {
            "total": len(reports),
            "passed": len(passed),
            "failed": len(failed),
            "duration_seconds": round(time.monotonic() - started, 4),
        },
        "passed": passed,
        "failed": failed,
        "scenarios": [report.as_dict() for report in reports],
    }
    if args.keep_temp:
        payload["temporary_root"] = str(temporary_root)
    _write_result(payload, args.json_out)
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
