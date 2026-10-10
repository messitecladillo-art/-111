#!/usr/bin/env python3
"""Deterministic fault-injection regressions for the event-WAL recovery path."""

from __future__ import annotations

import csv
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "skill" / "zhengda-cup-champion" / "scripts" / "agentctl.py"
FAULT_ENV = "ZHENGDA_AGENT_FAULT_POINT"
FAULT_EXIT = 97


class RegressionFailure(RuntimeError):
    """Raised when a recovery invariant does not hold."""


def run_cli(
    project: Path,
    *arguments: str,
    fault: str | None = None,
) -> tuple[subprocess.CompletedProcess[str], dict[str, Any] | None]:
    environment = os.environ.copy()
    if fault is None:
        environment.pop(FAULT_ENV, None)
    else:
        environment[FAULT_ENV] = fault
    completed = subprocess.run(
        [sys.executable, "-X", "utf8", str(CLI), str(project), *arguments],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="strict",
        env=environment,
        timeout=30,
    )
    payload: dict[str, Any] | None = None
    if completed.stdout.strip():
        try:
            decoded = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            raise RegressionFailure(
                f"CLI stdout is not one JSON document for {arguments}: {exc}; "
                f"stdout={completed.stdout[-2000:]!r}"
            ) from exc
        if not isinstance(decoded, dict):
            raise RegressionFailure(f"CLI JSON root is not an object for {arguments}")
        payload = decoded
    return completed, payload


def require_exit(
    result: tuple[subprocess.CompletedProcess[str], dict[str, Any] | None],
    expected: int,
    label: str,
) -> dict[str, Any] | None:
    completed, payload = result
    if completed.returncode != expected:
        raise RegressionFailure(
            f"{label}: exit={completed.returncode}, expected={expected}; "
            f"stdout={completed.stdout[-2000:]!r}; stderr={completed.stderr[-2000:]!r}"
        )
    if expected != FAULT_EXIT:
        if payload is None:
            raise RegressionFailure(f"{label}: expected a JSON result")
        if payload.get("exit_code") != expected:
            raise RegressionFailure(
                f"{label}: JSON exit_code={payload.get('exit_code')!r}, expected={expected}"
            )
    return payload


def load_state(project: Path) -> dict[str, Any]:
    payload = json.loads((project / ".agent" / "state.json").read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise RegressionFailure("agent state root is not an object")
    return payload


def load_domain(project: Path) -> dict[str, Any]:
    payload = yaml.safe_load((project / "project.yaml").read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise RegressionFailure("project root is not an object")
    return payload


def load_events(project: Path) -> list[dict[str, Any]]:
    events_path = project / ".agent" / "events.jsonl"
    if not events_path.is_file():
        return []
    events: list[dict[str, Any]] = []
    for line_number, line in enumerate(events_path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        event = json.loads(line)
        if not isinstance(event, dict):
            raise RegressionFailure(f"event line {line_number} is not an object")
        events.append(event)
    return events


def read_csv(project: Path, relative: str) -> tuple[list[str], list[dict[str, str]]]:
    with (project / relative).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise RegressionFailure(f"CSV has no header: {relative}")
        return list(reader.fieldnames), list(reader)


def write_csv(project: Path, relative: str, fields: list[str], rows: list[dict[str, str]]) -> None:
    with (project / relative).open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def assert_doctor_healthy(project: Path, label: str) -> None:
    payload = require_exit(run_cli(project, "doctor"), 0, f"{label} doctor")
    if not payload or payload.get("healthy") is not True:
        raise RegressionFailure(f"{label}: doctor did not report healthy=true")


def bootstrap_clean(project: Path, title: str) -> None:
    require_exit(run_cli(project, "bootstrap", "--title", title), 0, f"{title} bootstrap")


def assert_mirror(project: Path, expected: str, revision: int) -> None:
    state = load_state(project)
    domain = load_domain(project)
    actual = {
        "state.status": state.get("status"),
        "state.project_status_mirror": state.get("project_status_mirror"),
        "project.status": domain.get("project", {}).get("status"),
    }
    if set(actual.values()) != {expected}:
        raise RegressionFailure(f"status mirror mismatch: {actual}, expected={expected!r}")
    if state.get("status_revision") != revision:
        raise RegressionFailure(
            f"state revision={state.get('status_revision')!r}, expected={revision}"
        )
    if domain.get("control_plane", {}).get("status_mirror_revision") != revision:
        raise RegressionFailure(
            "project status_mirror_revision does not match authoritative status revision"
        )


def test_bootstrap_reentrant(base: Path) -> dict[str, Any]:
    project = base / "bootstrap-reentrant"
    first = run_cli(
        project,
        "bootstrap",
        "--title",
        "Recovery bootstrap",
        fault="bootstrap.after_recovery_anchor",
    )
    # The fault is raised inside the initializer subprocess. The outer CLI wraps
    # that interrupted initialization as a contract error while preserving the
    # recovery anchor written by the runtime.
    require_exit(first, 2, "bootstrap injected crash")
    recovered = require_exit(
        run_cli(project, "bootstrap", "--title", "Recovery bootstrap"),
        0,
        "bootstrap recovery",
    )
    if not recovered or recovered.get("recovered_interrupted_bootstrap") is not True:
        raise RegressionFailure("bootstrap recovery did not identify the interrupted bootstrap")
    state = load_state(project)
    bootstrap_run = state.get("run", {}).get("run_id")
    run_events = [event for event in load_events(project) if event.get("run_id") == bootstrap_run]
    counts = {
        event_type: sum(event.get("type") == event_type for event in run_events)
        for event_type in ("run_started", "run_completed")
    }
    if counts != {"run_started": 1, "run_completed": 1}:
        raise RegressionFailure(f"bootstrap terminal events are not exactly-once: {counts}")
    if state.get("recovery", {}).get("status") != "idle":
        raise RegressionFailure("bootstrap recovery state is not idle")
    assert_mirror(project, "intake", 0)
    assert_doctor_healthy(project, "bootstrap recovery")
    return {"initial_exit": 2, "recovery_exit": 0, "terminal_event_counts": counts}


def test_gate_recovery_without_checkpoint(base: Path) -> dict[str, Any]:
    project = base / "gate-no-checkpoint"
    bootstrap_clean(project, "Gate recovery")
    state_before = load_state(project)
    if state_before.get("latest_checkpoint") is not None:
        raise RegressionFailure("fresh bootstrap unexpectedly has a checkpoint")
    crashed = run_cli(
        project,
        "gate",
        "set",
        "problem",
        "fail",
        "--evidence",
        "evidence/decision-log.md",
        fault="gate.after_event_before_state",
    )
    require_exit(crashed, FAULT_EXIT, "gate injected crash")
    gate_events = [event for event in load_events(project) if event.get("type") == "gate_completed"]
    if len(gate_events) != 1:
        raise RegressionFailure(f"expected one gate_completed event before resume, got {len(gate_events)}")
    evaluation_id = gate_events[0].get("payload", {}).get("evaluation_id")
    recovered = require_exit(run_cli(project, "resume"), 0, "gate recovery resume")
    state = load_state(project)
    gate = state.get("gates", {}).get("problem", {})
    if gate.get("status") != "fail" or gate.get("evaluation_id") != evaluation_id:
        raise RegressionFailure(f"gate event was not faithfully replayed: {gate}")
    if state.get("latest_checkpoint") is not None:
        raise RegressionFailure("gate recovery without checkpoint invented a checkpoint")
    if not recovered or recovered.get("replayed_event_count") != 1:
        raise RegressionFailure(f"unexpected replay count: {recovered}")
    if len([event for event in load_events(project) if event.get("type") == "gate_completed"]) != 1:
        raise RegressionFailure("gate recovery duplicated gate_completed")
    assert_doctor_healthy(project, "gate recovery")
    return {"fault_exit": FAULT_EXIT, "replayed_events": 1, "gate_status": "fail"}


def _task_add_arguments() -> tuple[str, ...]:
    return (
        "task",
        "add",
        "--title",
        "Recover exactly once",
        "--owner-role",
        "captain",
        "--stage",
        "intake",
        "--gate",
        "problem",
        "--definition-of-done",
        "one durable row",
    )


def _pending_task_mutation(project: Path) -> tuple[str, dict[str, Any]]:
    events = [event for event in load_events(project) if event.get("type") == "task_added"]
    if len(events) != 1:
        raise RegressionFailure(f"expected one pending task_added event, got {len(events)}")
    mutation = events[0].get("payload", {}).get("table_mutation")
    if not isinstance(mutation, dict):
        raise RegressionFailure("task_added event has no structured table mutation")
    task_id = str(mutation.get("key_value", ""))
    if not task_id:
        raise RegressionFailure("task mutation has no key value")
    return task_id, mutation


def test_table_mutation_exactly_once(base: Path) -> dict[str, Any]:
    project = base / "table-exactly-once"
    bootstrap_clean(project, "Table recovery")
    crashed = run_cli(project, *_task_add_arguments(), fault="table.after_event_before_publish")
    require_exit(crashed, FAULT_EXIT, "table mutation injected crash")
    task_id, _ = _pending_task_mutation(project)
    _, rows_before = read_csv(project, "evidence/team-tasks.csv")
    if any(row.get("task_id") == task_id for row in rows_before):
        raise RegressionFailure("task row was published before the injected crash")
    recovered = require_exit(run_cli(project, "resume"), 0, "table mutation resume")
    if not recovered or recovered.get("replayed_event_count") != 1:
        raise RegressionFailure(f"unexpected table replay count: {recovered}")
    _, rows_after = read_csv(project, "evidence/team-tasks.csv")
    matching = [row for row in rows_after if row.get("task_id") == task_id]
    if len(matching) != 1:
        raise RegressionFailure(f"recovered task row count={len(matching)}, expected=1")
    # A second resume is intentionally idempotent and must not replay or duplicate.
    second = require_exit(run_cli(project, "resume"), 0, "table mutation second resume")
    _, rows_second = read_csv(project, "evidence/team-tasks.csv")
    if sum(row.get("task_id") == task_id for row in rows_second) != 1:
        raise RegressionFailure("second resume duplicated the recovered task row")
    if not second or second.get("replayed_event_count") != 0:
        raise RegressionFailure("second resume unexpectedly replayed committed events")
    assert_doctor_healthy(project, "table recovery")
    return {"fault_exit": FAULT_EXIT, "first_replay": 1, "second_replay": 0, "row_count": 1}


def test_table_third_state_exhaustion(base: Path) -> dict[str, Any]:
    project = base / "table-third-state"
    bootstrap_clean(project, "Table conflict")
    require_exit(
        run_cli(project, *_task_add_arguments(), fault="table.after_event_before_publish"),
        FAULT_EXIT,
        "table third-state injected crash",
    )
    task_id, mutation = _pending_task_mutation(project)
    fields, rows = read_csv(project, "evidence/team-tasks.csv")
    after_row = mutation.get("after_row")
    if not isinstance(after_row, dict):
        raise RegressionFailure("task mutation after_row is malformed")
    manual = {field: str(after_row.get(field, "")) for field in fields}
    manual["title"] = "MANUAL THIRD STATE - DO NOT OVERWRITE"
    manual["status"] = "blocked"
    rows.append(manual)
    write_csv(project, "evidence/team-tasks.csv", fields, rows)

    failure_exits: list[int] = []
    for attempt in range(1, 4):
        completed, payload = run_cli(project, "resume")
        require_exit((completed, payload), 5, f"third-state resume attempt {attempt}")
        failure_exits.append(completed.returncode)
        _, current_rows = read_csv(project, "evidence/team-tasks.csv")
        current = [row for row in current_rows if row.get("task_id") == task_id]
        if len(current) != 1 or current[0].get("title") != manual["title"] or current[0].get("status") != "blocked":
            raise RegressionFailure(f"attempt {attempt} overwrote the manual third state")

    state = load_state(project)
    recovery = state.get("recovery", {})
    if recovery.get("status") != "exhausted" or recovery.get("retry_count") != 3:
        raise RegressionFailure(f"recovery did not exhaust on attempt three: {recovery}")
    fourth = require_exit(run_cli(project, "resume"), 1, "resume after exhausted")
    if not fourth or fourth.get("failure", {}).get("class") != "gate":
        raise RegressionFailure("exhausted recovery did not fail closed as a domain blocker")
    _, final_rows = read_csv(project, "evidence/team-tasks.csv")
    final = [row for row in final_rows if row.get("task_id") == task_id]
    if len(final) != 1 or final[0].get("title") != manual["title"] or final[0].get("status") != "blocked":
        raise RegressionFailure("exhausted recovery changed the manual third state")
    return {
        "conflict_exits": failure_exits,
        "post_exhaustion_exit": 1,
        "retry_count": 3,
        "manual_state_preserved": True,
    }


def assert_transition_exactly_once(project: Path, expected_status: str = "rule_lock") -> dict[str, Any]:
    state = load_state(project)
    history = state.get("transition_history", [])
    if len(history) != 1:
        raise RegressionFailure(f"transition history length={len(history)}, expected=1")
    transition_id = history[0].get("transition_id")
    if history[0].get("from") != "intake" or history[0].get("to") != expected_status:
        raise RegressionFailure(f"unexpected transition record: {history[0]}")
    committed = [
        event
        for event in load_events(project)
        if event.get("type") == "transition_committed"
        and event.get("payload", {}).get("transition_id") == transition_id
    ]
    if len(committed) != 1:
        raise RegressionFailure(
            f"transition_committed count={len(committed)}, expected=1 for {transition_id}"
        )
    assert_mirror(project, expected_status, 1)
    return {"history_count": 1, "committed_event_count": 1, "transition_id": transition_id}


def test_advance_fault(base: Path, fault: str) -> dict[str, Any]:
    slug = fault.removeprefix("advance.").replace("_", "-")
    project = base / f"advance-{slug}"
    bootstrap_clean(project, f"Advance {slug}")
    require_exit(
        run_cli(project, "advance", "--to", "rule_lock", "--expect-revision", "0", fault=fault),
        FAULT_EXIT,
        f"{fault} injected crash",
    )
    recovered = require_exit(run_cli(project, "resume"), 0, f"{fault} resume")
    if not recovered:
        raise RegressionFailure(f"{fault}: resume returned no JSON")

    if fault == "advance.after_checkpoint_before_state":
        # The checkpoint and event cursor recover, but no committed transition
        # exists. A normal retry must perform the single authoritative commit.
        assert_mirror(project, "intake", 0)
        if load_state(project).get("transition_history"):
            raise RegressionFailure("checkpoint-before-state recovery invented a transition")
        require_exit(
            run_cli(project, "advance", "--to", "rule_lock", "--expect-revision", "0"),
            0,
            f"{fault} normal retry",
        )

    exact = assert_transition_exactly_once(project)
    assert_doctor_healthy(project, fault)
    return {
        "fault_exit": FAULT_EXIT,
        "resume_exit": 0,
        "replayed_events": recovered.get("replayed_event_count"),
        **exact,
        "doctor_healthy": True,
    }


def exercise() -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="zhengda-recovery-eval-") as temporary:
        base = Path(temporary)
        cases: dict[str, dict[str, Any]] = {}
        cases["bootstrap_reentrant"] = test_bootstrap_reentrant(base)
        cases["gate_without_checkpoint"] = test_gate_recovery_without_checkpoint(base)
        cases["table_exactly_once"] = test_table_mutation_exactly_once(base)
        cases["table_third_state_exhaustion"] = test_table_third_state_exhaustion(base)
        for fault in (
            "advance.after_checkpoint_before_state",
            "advance.after_state_before_mirror",
            "advance.after_commit_event_before_state",
        ):
            cases[fault] = test_advance_fault(base, fault)
        return {
            "passed": True,
            "summary": {"total": len(cases), "passed": len(cases), "failed": 0},
            "cases": cases,
        }


def main() -> int:
    try:
        result = exercise()
    except Exception as exc:  # noqa: BLE001 - one deterministic machine-readable result
        print(json.dumps({"passed": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
