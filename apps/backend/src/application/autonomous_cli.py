"""Local-gateway stdio bridge invoking the authoritative Python Autonomous Research loop."""

from __future__ import annotations

import asyncio
from copy import deepcopy
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from typing import Any

from application.providers import AuthoredProvider
from application.services.autonomous_research import (
    build_planted_trap_benchmark,
    execute_autonomous_research_core,
)
from application.workflow_data_tools import build_inline_sandbox
from multi_agent.epistemic_graph import EpistemicGraph


def _build_sandbox(payload: dict[str, Any], checkpoint: dict[str, Any] | None, goal: str):
    mode = payload.get("datasetMode") or "planted_trap_benchmark"
    inline = payload.get("inlineDataset")
    if mode == "inline_dataset" and isinstance(inline, dict):
        ds_title = str(inline.get("title") or goal)[:150]
        ds_cls = "simulated" if inline.get("classification") == "simulated" else "actual"
        sandbox = build_inline_sandbox(
            title=ds_title,
            questions=inline.get("questions") or [],
            rows=inline.get("rows") or [],
            classification=ds_cls,
        )
        return mode, ds_title, sandbox

    if mode == "inline_dataset" and isinstance(checkpoint, dict) and isinstance(checkpoint.get("inlineQuestions"), list):
        ds_title = str(checkpoint.get("datasetTitle") or goal)[:150]
        ds_cls = "simulated" if checkpoint.get("datasetClassification") == "simulated" else "actual"
        sandbox = build_inline_sandbox(
            title=ds_title,
            questions=checkpoint.get("inlineQuestions") or [],
            rows=checkpoint.get("inlineRows") or [],
            classification=ds_cls,
            ref=str(checkpoint.get("datasetRef") or "") or None,
        )
        return mode, ds_title, sandbox

    ds_title, questions, rows = build_planted_trap_benchmark()
    sandbox = build_inline_sandbox(
        title=ds_title,
        questions=questions,
        rows=rows,
        classification="simulated",
        ref="benchmark:planted-4-traps",
    )
    return "planted_trap_benchmark", ds_title, sandbox


_LOCAL_PATH_RE = re.compile(r"(?:[A-Za-z]:[\\/][^\s\"']+)|(?:/(?:Users|home|var|tmp)/[^\s\"']+)")
_CLI_BRACKET_MAP: dict[int, str | None] = {
    0x300C: "“",
    0x300E: "“",
    0x300D: "”",
    0x300F: "”",
    0x3010: None,
    0x3011: None,
}


def _sanitize_cli_error(exc: BaseException) -> str:
    msg = _LOCAL_PATH_RE.sub("本地路径", str(exc or "").strip()).translate(_CLI_BRACKET_MAP)
    msg = re.sub(r"\s{2,}", " ", msg).strip()
    return msg[:240] or "自主探索执行未完成。"


async def _run(payload: dict) -> dict:
    authored_env = os.environ.get("EVIXLOCAL_AUTHORED_DIR", "").strip()
    temp_authored: tempfile.TemporaryDirectory[str] | None = None
    if authored_env:
        authored_root = str(Path(authored_env))
    else:
        temp_authored = tempfile.TemporaryDirectory(prefix="evix_cli_authored_")
        authored_root = temp_authored.name
    # Zero sleep inside stdio interactive bridge unless caller specifies otherwise
    os.environ.setdefault("EVIXLOCAL_AUTHORED_SLEEP", "0")
    provider = AuthoredProvider(authored_root)

    try:
        return await _run_with_provider(payload, provider)
    finally:
        if temp_authored is not None:
            temp_authored.cleanup()


async def _run_with_provider(payload: dict, provider: AuthoredProvider) -> dict:
    stream = payload.get("stream") is True
    action = str(payload.get("action") or "start").strip()
    goal = str(payload.get("goal") or "县域老年人智慧助餐与防跌倒守护服务采纳机制调研").strip()
    geography = str(payload.get("geography") or "县域").strip()
    lease_mode = str(payload.get("leaseMode") or "pi_autonomous")
    max_calls = int(payload.get("maxToolCalls") or 24)
    project_id = str(payload.get("projectId") or "local-studio").strip() or "local-studio"

    seq_counter = [0]

    def _emit_ndjson(event_type: str, evt_payload: dict[str, Any]) -> None:
        if not stream:
            return
        seq_counter[0] += 1
        line = json.dumps(
            {"type": "event", "seq": seq_counter[0], "eventType": event_type, "payload": evt_payload},
            ensure_ascii=False,
        )
        sys.stdout.write(line + "\n")
        sys.stdout.flush()

    if action == "resume":
        raw_cp = payload.get("checkpoint")
        checkpoint = deepcopy(raw_cp) if isinstance(raw_cp, dict) else {}
        if isinstance(payload.get("epistemicGraph"), dict):
            graph_in = dict(payload["epistemicGraph"])
            graph_in.pop("completeness", None)
            checkpoint["epistemicGraph"] = graph_in
        if payload.get("usedToolCalls") is not None:
            checkpoint["usedCalls"] = int(payload["usedToolCalls"])

        decision = str(payload.get("decision") or "approve").strip()
        steering_note = str(payload.get("steeringNote") or "").strip()
        mode, ds_title, sandbox = _build_sandbox(payload, checkpoint, goal)

        if decision == "abort":
            _emit_ndjson("cancelled", {"reason": "aborted_at_milestone_gate"})
            graph_dict = checkpoint.get("epistemicGraph") or {"project_id": project_id, "nodes": [], "edges": [], "pivot_log": []}
            comp = EpistemicGraph.from_dict(graph_dict).audit_completeness()
            view = {
                "schemaVersion": 1,
                "runId": str(checkpoint.get("runId") or "local-aborted"),
                "projectId": project_id,
                "status": "cancelled",
                "pendingMilestone": None,
                "reworkRounds": 0,
                "reworkHistory": [],
                "lease": {
                    "leaseId": "local-aborted",
                    "mode": lease_mode,
                    "maxToolCalls": int(checkpoint.get("budgetCap") or max_calls),
                    "usedToolCalls": int(checkpoint.get("usedCalls") or 0),
                    "datasetSha256": sandbox.dataset_sha256,
                    "privacyGuarantee": "aggregate_isa_only_zero_raw_rows_sent_to_llm",
                    "expiresAt": "",
                },
                "datasetSummary": {
                    "title": ds_title,
                    "datasetRef": sandbox.dataset_ref,
                    "datasetMode": mode,
                    "classification": "user_provided" if sandbox.classification == "actual" else "simulated",
                    "rawRowCount": len(sandbox.raw_responses),
                    "cleanedRowCount": len(sandbox.active_rows),
                    "variables": len(sandbox.questions),
                    "sha256": sandbox.dataset_sha256,
                },
                "reasoningTrace": deepcopy(list(checkpoint.get("trace") or [])),
                "epistemicGraph": {**graph_dict, "completeness": comp},
                "motherInsight": {
                    "headline": "本次自主探索已人工终止",
                    "mechanism": "研究主持人在阶段性确认节点选择终止本次探索。",
                    "paradoxDetail": "",
                    "scopeBoundary": "未形成终稿结论。",
                    "supportingSnapshots": [],
                },
                "falsificationReport": {
                    "decision": "cancelled",
                    "summary": "已在阶段性确认节点终止本次运行。",
                    "findings": [],
                    "consistencyChecks": [],
                    "ethicsAndPrivacy": ["分析全程仅输出聚合统计指标，未读取逐行答卷与开放题原文。"],
                },
                "deliverable": sandbox.build_deliverable(),
                "registeredResults": sandbox.export_registered_results(),
            }
            if stream:
                sys.stdout.write(json.dumps({"type": "done", "ok": True, "run": view}, ensure_ascii=False) + "\n")
                sys.stdout.flush()
            return view

        view = await execute_autonomous_research_core(
            project_id=project_id,
            goal=goal,
            geography=geography,
            dataset_mode=mode,
            lease_mode=lease_mode,
            max_tool_calls=max_calls,
            sandbox=sandbox,
            dataset_title=ds_title,
            provider=provider,
            run_id=str(checkpoint.get("runId") or "") or None,
            emit_event=_emit_ndjson if stream else None,
            resume_state=checkpoint,
            steering_note=steering_note if decision == "steer" or steering_note else "",
        )
        if stream:
            sys.stdout.write(json.dumps({"type": "done", "ok": True, "run": view}, ensure_ascii=False) + "\n")
            sys.stdout.flush()
        return view

    mode, ds_title, sandbox = _build_sandbox(payload, None, goal)
    view = await execute_autonomous_research_core(
        project_id=project_id,
        goal=goal,
        geography=geography,
        dataset_mode=mode,
        lease_mode=lease_mode,
        max_tool_calls=max_calls,
        sandbox=sandbox,
        dataset_title=ds_title,
        provider=provider,
        emit_event=_emit_ndjson if stream else None,
    )
    if stream:
        sys.stdout.write(json.dumps({"type": "done", "ok": True, "run": view}, ensure_ascii=False) + "\n")
        sys.stdout.flush()
    return view


def main() -> int:
    for env_key in ("OPENAI_API_KEY", "DEEPSEEK_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"):
        os.environ.pop(env_key, None)
    os.environ["EVIX_ENABLE_LIVE_SCHOLAR_API"] = "0"

    raw = sys.stdin.read().lstrip("\ufeff")
    payload = json.loads(raw) if raw.strip() else {}
    if payload.get("stream") is True:
        try:
            asyncio.run(_run(payload))
            return 0
        except Exception as exc:
            sys.stdout.write(
                json.dumps({"type": "done", "ok": False, "error": _sanitize_cli_error(exc)}, ensure_ascii=False) + "\n"
            )
            sys.stdout.flush()
            return 1
    try:
        result = asyncio.run(_run(payload))
    except Exception as exc:
        sys.stderr.write(_sanitize_cli_error(exc) + "\n")
        return 1
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
