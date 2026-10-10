"""Machine-readable CLI for the Zhengda Cup Champion control plane."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from .audits import audit_project, doctor_project
from .contracts import load_contracts
from .core import (
    EXPERT_ROLES,
    STATE_REL,
    add_blocker,
    add_task,
    advance_project,
    approve_artifact_review,
    bootstrap_project,
    create_checkpoint,
    finalize_artifact,
    handoff_project,
    list_artifacts,
    list_blockers,
    list_reviews,
    list_tasks,
    load_context,
    project_next,
    project_status,
    register_artifact,
    resolve_blocker,
    result_envelope,
    resume_project,
    set_gate,
    set_task_status,
    waive_blocker,
)
from .errors import AgentError, ContractError
from .io_utils import new_id


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise ContractError(message)


def build_parser() -> argparse.ArgumentParser:
    parser = JsonArgumentParser(description=__doc__)
    parser.add_argument("project", help="Project directory; this is always the first positional argument")
    commands = parser.add_subparsers(dest="command", required=True, parser_class=JsonArgumentParser)

    init = commands.add_parser("init", help="Initialize project templates and runtime")
    init.add_argument("--title", required=True)
    init.add_argument("--allow-existing", action="store_true")
    bootstrap = commands.add_parser("bootstrap", help="Initialize missing templates, then create .agent state")
    bootstrap.add_argument("--title", default="Untitled Zhengda Cup project")
    bootstrap.add_argument("--allow-existing", action="store_true")
    commands.add_parser("status", help="Read current state without modifying the project")
    commands.add_parser("next", help="Return the deterministic next action")

    gate = commands.add_parser("gate", help="Manage quality-gate results")
    gate_commands = gate.add_subparsers(dest="gate_command", required=True, parser_class=JsonArgumentParser)
    gate_set = gate_commands.add_parser("set")
    gate_set.add_argument("gate")
    gate_set.add_argument("status")
    gate_set.add_argument("--evidence", action="append", default=[])
    gate_set.add_argument("--owner")
    gate_set.add_argument("--deadline")
    gate_set.add_argument("--decision-log-entry")

    advance = commands.add_parser("advance", help="Commit one adjacent workflow transition")
    advance.add_argument("--to")
    advance.add_argument("--expect-revision", type=int)
    checkpoint = commands.add_parser("checkpoint", help="Commit a resumable artifact checkpoint")
    checkpoint.add_argument("--label", default="manual")
    resume = commands.add_parser("resume", help="Validate and resume from a checkpoint")
    resume.add_argument("--checkpoint", default="latest")
    audit = commands.add_parser("audit", help="Run aggregate deterministic audits")
    audit.add_argument("--all", action="store_true")
    commands.add_parser("doctor", help="Validate runtime, state, events, and checkpoints")
    commands.add_parser("handoff", help="Build a final manifest only when all delivery gates pass")

    task = commands.add_parser("task", help="Manage project tasks")
    task_commands = task.add_subparsers(dest="task_command", required=True, parser_class=JsonArgumentParser)
    task_commands.add_parser("list")
    task_add = task_commands.add_parser("add")
    task_add.add_argument("--title", required=True)
    task_add.add_argument("--owner-role", required=True)
    task_add.add_argument("--stage", required=True)
    task_add.add_argument("--gate", required=True)
    task_add.add_argument("--priority", choices=["critical", "high", "medium", "low"], default="medium")
    task_add.add_argument("--definition-of-done", required=True)
    task_add.add_argument("--depends-on", action="append", default=[])
    task_set = task_commands.add_parser("set")
    task_set.add_argument("task_id")
    task_set.add_argument("--status", required=True)

    blocker = commands.add_parser("blocker", help="Manage structured blockers")
    blocker_commands = blocker.add_subparsers(dest="blocker_command", required=True, parser_class=JsonArgumentParser)
    blocker_commands.add_parser("list")
    blocker_add = blocker_commands.add_parser("add")
    blocker_add.add_argument("--title", required=True)
    blocker_add.add_argument("--severity", choices=["fatal", "high", "medium", "low", "info"], required=True)
    blocker_add.add_argument("--gate", required=True)
    blocker_add.add_argument("--cause", required=True)
    blocker_add.add_argument("--impact", required=True)
    blocker_add.add_argument("--required-input", required=True)
    blocker_add.add_argument("--owner", required=True)
    blocker_add.add_argument("--unblock-test", required=True)
    blocker_resolve = blocker_commands.add_parser("resolve")
    blocker_resolve.add_argument("blocker_id")
    blocker_resolve.add_argument("--evidence", required=True)
    blocker_resolve.add_argument("--resolved-by", required=True)
    blocker_waive = blocker_commands.add_parser("waive")
    blocker_waive.add_argument("blocker_id")
    blocker_waive.add_argument("--evidence", required=True)
    blocker_waive.add_argument("--decision-owner", required=True)

    artifact = commands.add_parser("artifact", help="Manage the artifact registry")
    artifact_commands = artifact.add_subparsers(dest="artifact_command", required=True, parser_class=JsonArgumentParser)
    artifact_commands.add_parser("list")
    artifact_register = artifact_commands.add_parser("register")
    artifact_register.add_argument("file_path")
    artifact_register.add_argument("--id")
    artifact_register.add_argument("--title", required=True)
    artifact_register.add_argument("--type", dest="artifact_type", required=True)
    artifact_register.add_argument("--classification", required=True)
    artifact_register.add_argument("--stage", required=True)
    artifact_register.add_argument("--gate", required=True)
    artifact_register.add_argument("--provenance", required=True)
    artifact_register.add_argument("--status", default="draft")
    artifact_register.add_argument("--producer-role", choices=sorted(EXPERT_ROLES), required=True)
    artifact_register.add_argument("--owner-name", required=True)
    artifact_register.add_argument("--rights-status")
    artifact_register.add_argument("--anonymity-status")
    artifact_finalize = artifact_commands.add_parser("finalize")
    artifact_finalize.add_argument("artifact_id")
    artifact_finalize.add_argument("--review-id", required=True)
    artifact_finalize.add_argument("--rights-status", required=True)
    artifact_finalize.add_argument("--anonymity-status", required=True)

    review = commands.add_parser("review", help="Manage version-bound independent reviews")
    review_commands = review.add_subparsers(dest="review_command", required=True, parser_class=JsonArgumentParser)
    review_commands.add_parser("list")
    review_approve = review_commands.add_parser("approve")
    review_approve.add_argument("artifact_id")
    review_approve.add_argument("--evidence", required=True)
    review_approve.add_argument("--reviewer-role", choices=sorted(EXPERT_ROLES), required=True)
    review_approve.add_argument("--reviewer-name", required=True)
    review_approve.add_argument("--review-id")
    return parser


def dispatch(args: argparse.Namespace) -> dict[str, Any]:
    project = Path(args.project).expanduser().resolve()
    if args.command == "init":
        skill_root = load_contracts().paths.skill_root
        command = [sys.executable, "-X", "utf8", str(skill_root / "scripts" / "init_project.py"), str(project), "--title", args.title]
        if args.allow_existing:
            command.append("--allow-existing")
        completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if completed.returncode != 0:
            raise ContractError("Project initialization failed", details={"stdout": completed.stdout.strip(), "stderr": completed.stderr.strip()})
        payload = project_status(project)
        payload["command"] = "init"
        payload["initializer_output"] = completed.stdout.strip()
        return payload
    if args.command == "bootstrap":
        if not (project / ".agent" / "state.json").is_file():
            skill_root = load_contracts().paths.skill_root
            command = [sys.executable, "-X", "utf8", str(skill_root / "scripts" / "init_project.py"), str(project), "--title", args.title]
            if args.allow_existing or (project.exists() and any(project.iterdir())):
                command.append("--allow-existing")
            completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
            if completed.returncode != 0:
                raise ContractError("Project bootstrap initialization failed", details={"stdout": completed.stdout.strip(), "stderr": completed.stderr.strip()})
            payload = project_status(project)
            payload["command"] = "bootstrap"
            payload["initializer_output"] = completed.stdout.strip()
            return payload
        return bootstrap_project(project)
    if args.command == "status":
        return project_status(project)
    if args.command == "next":
        return project_next(project)
    if args.command == "gate" and args.gate_command == "set":
        return set_gate(project, args.gate, args.status, evidence=args.evidence, owner=args.owner, deadline=args.deadline, decision_log_entry=args.decision_log_entry)
    if args.command == "advance":
        return advance_project(project, target=args.to, expected_revision=args.expect_revision)
    if args.command == "checkpoint":
        return create_checkpoint(project, label=args.label)
    if args.command == "resume":
        return resume_project(project, checkpoint=args.checkpoint)
    if args.command == "audit":
        return audit_project(project, run_all=True)
    if args.command == "doctor":
        return doctor_project(project)
    if args.command == "handoff":
        return handoff_project(project)
    if args.command == "task":
        if args.task_command == "list":
            return list_tasks(project)
        if args.task_command == "add":
            return add_task(project, title=args.title, owner_role=args.owner_role, stage=args.stage, gate=args.gate, priority=args.priority, definition_of_done=args.definition_of_done, dependencies=args.depends_on)
        return set_task_status(project, task_id=args.task_id, status=args.status)
    if args.command == "blocker":
        if args.blocker_command == "list":
            return list_blockers(project)
        if args.blocker_command == "add":
            return add_blocker(project, title=args.title, severity=args.severity, gate=args.gate, cause=args.cause, impact=args.impact, required_input=args.required_input, owner=args.owner, unblock_test=args.unblock_test)
        if args.blocker_command == "resolve":
            return resolve_blocker(project, blocker_id=args.blocker_id, evidence=args.evidence, resolved_by=args.resolved_by)
        return waive_blocker(project, blocker_id=args.blocker_id, evidence=args.evidence, decision_owner=args.decision_owner)
    if args.command == "artifact":
        if args.artifact_command == "list":
            return list_artifacts(project)
        if args.artifact_command == "finalize":
            return finalize_artifact(
                project,
                artifact_id=args.artifact_id,
                review_id=args.review_id,
                rights_status=args.rights_status,
                anonymity_status=args.anonymity_status,
            )
        return register_artifact(
            project,
            file_path=args.file_path,
            artifact_id=args.id,
            title=args.title,
            artifact_type=args.artifact_type,
            classification=args.classification,
            stage=args.stage,
            gate=args.gate,
            provenance=args.provenance,
            status=args.status,
            producer_role=args.producer_role,
            owner_name=args.owner_name,
            rights_status=args.rights_status,
            anonymity_status=args.anonymity_status,
        )
    if args.command == "review" and args.review_command == "list":
        return list_reviews(project)
    if args.command == "review" and args.review_command == "approve":
        return approve_artifact_review(
            project,
            artifact_id=args.artifact_id,
            evidence=args.evidence,
            reviewer_role=args.reviewer_role,
            reviewer_name=args.reviewer_name,
            review_id=args.review_id,
        )
    raise ContractError("Unsupported command")


def _error_payload(project_arg: str | None, error: AgentError) -> dict[str, Any]:
    project = Path(project_arg).expanduser().resolve() if project_arg else Path.cwd()
    state: dict[str, Any] | None = None
    try:
        if (project / STATE_REL).is_file():
            _, state = load_context(
                project,
                contracts=load_contracts(),
                allow_mirror_mismatch=True,
                allow_event_cursor_mismatch=True,
            )
    except Exception:
        state = None
    failure = error.as_dict()
    if state is not None:
        run_id = (state.get("run") or {}).get("run_id") or new_id("run-error")
        return result_envelope(project, state, command="error", run_id=run_id, exit_code=error.exit_code, failure=failure, extra={"requested_command": sys.argv[2] if len(sys.argv) > 2 else None})
    return {
        "command": "error",
        "project": str(project),
        "project_id": None,
        "run_id": new_id("run-error"),
        "exit_code": error.exit_code,
        "status_before": None,
        "status_after": None,
        "status_revision": 0,
        "gates": {},
        "checkpoint_id": None,
        "event_stream": {"path": ".agent/events.jsonl", "last_sequence": 0, "last_event_id": None},
        "failure": failure,
    }


def _configure_utf8_streams() -> None:
    """Make machine-readable CLI output deterministic on Windows code pages."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if not callable(reconfigure):
            continue
        try:
            reconfigure(encoding="utf-8", errors="backslashreplace")
        except (OSError, ValueError):
            # Embedded hosts may expose a stream that cannot be reconfigured.
            # In that case, retain the host-provided stream rather than failing
            # before argument parsing can return a structured error envelope.
            continue


def main(argv: list[str] | None = None) -> int:
    _configure_utf8_streams()
    argv = list(sys.argv[1:] if argv is None else argv)
    project_arg = argv[0] if argv and not argv[0].startswith("-") else None
    try:
        args = build_parser().parse_args(argv)
        payload = dispatch(args)
        exit_code = int(payload.get("exit_code", 0))
    except AgentError as exc:
        payload = _error_payload(project_arg, exc)
        exit_code = exc.exit_code
    except KeyboardInterrupt:
        error = ContractError("Operation interrupted by user")
        error.exit_code = 130
        payload = _error_payload(project_arg, error)
        exit_code = 130
    except Exception as exc:
        error = AgentError(f"Unhandled runtime error: {type(exc).__name__}: {exc}")
        payload = _error_payload(project_arg, error)
        exit_code = error.exit_code
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
