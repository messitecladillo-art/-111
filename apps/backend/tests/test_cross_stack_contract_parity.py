"""Permanent cross-stack contract parity guard across Frontend, `@evix/shared`, Runtime, and Backend.

Automatically parses TypeScript contracts (`apps/frontend/data/control-plane-contract.generated.ts`,
`apps/frontend/lib/agent/tools-schema.ts`, `apps/frontend/lib/agent/{chat,rooms,workflow-tasks,autonomous-agent}.ts`,
and `packages/evi-x-shared/src/{api-types,questionnaire}.ts`) against authoritative Python runtime
schemas, domain enums, SQL check constraints, and unified tool registries so `PROJECT_STAGES` (12),
`GATE_NAMES` (9), core chat/empirical tool IDs, and shared DTO schemas never drift.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
from typing import Any, get_args

import pytest

from application.agent_model_bindings import ROLE_CAPABILITIES, ROLE_STEPS, TASK_ROLES
from application.model_services import validate_service_config
from application.services.teams import VALID_PRESENCE_STATUSES
from application.workflow_data_tools import build_falsification_reviewer_tools
from infrastructure.database.models.workflows import (
    AgentTask,
    AgentTaskExecution,
    AutonomousRun,
    AutonomousRunEvent,
)
from infrastructure.settings import BASES, Settings
from multi_agent.agents.contracts import AgentRole, RunStatus
from multi_agent.agents.data_agent.workflow import DataWorkflow
from multi_agent.agents.research_agent.services import agent_chat as backend_agent_chat
from multi_agent.agents.research_agent.workflow import ResearchWorkflow
from multi_agent.agents.reviewer_agent.workflow import ReviewerWorkflow
from multi_agent.agents.survey_agent.workflow import SurveyWorkflow
from multi_agent.agents.writing_agent.workflow import WritingWorkflow
from multi_agent.epistemic_graph import NodeKind, NodeStatus
from multi_agent.statistical_isa import StatisticalSandbox
from multi_agent.tool_registry import (
    all_tool_specs,
    chat_orchestrator_tool_specs,
    epistemic_tool_specs,
    grounding_tool_specs,
    isa_tool_specs,
    public_tool_catalog,
    reviewer_tool_specs,
    sandbox_tool_specs,
    to_anthropic_tools,
    to_gemini_function_declarations,
    to_openai_tools,
)
from multi_agent.workflow.orchestrator import _PIPELINE, WorkflowStatus
from shared.errors import ApiError
from shared.questionnaire import questionnaire as validate_backend_questionnaire

REPO_ROOT = Path(__file__).resolve().parents[3]
FRONTEND_DIR = REPO_ROOT / "apps" / "frontend"
SHARED_PKG_DIR = REPO_ROOT / "packages" / "evi-x-shared"
RUNTIME_SKILL_DIR = REPO_ROOT / "skill" / "zhengda-cup-champion"

FORBIDDEN_BRACKETS_RE = re.compile("[\u300c\u300d\u300e\u300f\u3010\u3011]")


def _canonical_json(value: Any) -> str:
    if isinstance(value, list):
        return "[" + ",".join(_canonical_json(item) for item in value) + "]"
    if isinstance(value, dict):
        parts = [
            f"{json.dumps(k, ensure_ascii=False)}:{_canonical_json(value[k])}"
            for k in sorted(value.keys())
        ]
        return "{" + ",".join(parts) + "}"
    return json.dumps(value, ensure_ascii=False)


def _parse_generated_ts_constants(ts_path: Path) -> dict[str, Any]:
    """Parse `export const NAME = <JSON> as const;` blocks from generated TypeScript modules."""
    raw = ts_path.read_text(encoding="utf-8")
    pattern = re.compile(
        r"^export const ([A-Z0-9_]+)\s*=\s*(.*?)\s+as const;",
        re.M | re.S,
    )
    parsed: dict[str, Any] = {}
    for match in pattern.finditer(raw):
        parsed[match.group(1)] = json.loads(match.group(2))
    assert parsed, f"No exported JSON constants parsed from {ts_path.name}"
    return parsed


def _extract_ts_string_union(source: str, type_name: str) -> list[str]:
    """Extract ordered string literals from `export type Name = 'a' | 'b' ...;`."""
    m = re.search(rf"export\s+type\s+{re.escape(type_name)}\s*=\s*([^;]+);", source, re.S)
    assert m is not None, f"Type {type_name} not found"
    return re.findall(r"['\"]([^'\"]+)['\"]", m.group(1))


def _extract_ts_object_keys(source: str, const_name: str) -> list[str]:
    """Extract top-level keys from simple TS object literal `export const NAME = { k: ..., } [as const];`."""
    m = re.search(
        rf"export\s+const\s+{re.escape(const_name)}(?:\s*:[^=]+)?\s*=\s*\{{(.*?)\}}(?:\s+as\s+const)?\s*;",
        source,
        re.S,
    )
    assert m is not None, f"Object constant {const_name} not found"
    body = m.group(1)
    return re.findall(r"(?:^|,)\s*['\"]?([A-Za-z0-9_-]+)['\"]?\s*:", body)


def _parse_frontend_tool_specs(ts_path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    """Parse `AGENT_TOOL_SPECS` blocks and `validateToolAction` switch cases from `tools-schema.ts`."""
    source = ts_path.read_text(encoding="utf-8")
    arr_start = source.index("export const AGENT_TOOL_SPECS")
    bracket_open = source.index("= [", arr_start) + 2
    depth = 0
    i = bracket_open
    while i < len(source):
        if source[i] == "[":
            depth += 1
        elif source[i] == "]":
            depth -= 1
            if depth == 0:
                break
        i += 1
    array_body = source[bracket_open + 1 : i]

    # Split top-level `{ ... }` tool spec entries inside AGENT_TOOL_SPECS
    blocks: list[str] = []
    brace_depth = 0
    block_start = -1
    for idx, ch in enumerate(array_body):
        if ch == "{":
            if brace_depth == 0:
                block_start = idx
            brace_depth += 1
        elif ch == "}":
            brace_depth -= 1
            if brace_depth == 0 and block_start >= 0:
                blocks.append(array_body[block_start : idx + 1])
                block_start = -1

    specs: list[dict[str, Any]] = []
    for blk in blocks:
        id_m = re.search(r"\bid:\s*'([^']+)'", blk)
        cat_m = re.search(r"\bcategory:\s*'([^']+)'", blk)
        mut_m = re.search(r"\bmutates:\s*(true|false)", blk)
        req_m = re.search(r"\brequired:\s*\[([^\]]*)\]", blk)
        assert id_m and cat_m and mut_m
        req_items = re.findall(r"'([^']+)'", req_m.group(1)) if req_m else []
        enums_by_prop: dict[str, list[str]] = {}
        for prop_m in re.finditer(r"([A-Za-z0-9_]+)\s*:\s*\{[^{}]*?\benum:\s*\[([^\]]+)\]", blk, re.S):
            enums_by_prop[prop_m.group(1)] = re.findall(r"'([^']+)'", prop_m.group(2))
        specs.append(
            {
                "id": id_m.group(1),
                "category": cat_m.group(1),
                "mutates": mut_m.group(1) == "true",
                "required": req_items,
                "enums": enums_by_prop,
            }
        )

    fn_tail = source[source.index("export function validateToolAction") :]
    switch_cases = re.findall(r"\bcase\s+'([^']+)'\s*:", fn_tail)
    return specs, switch_cases


def _load_runtime_contracts_module() -> Any:
    """Load `Contracts` and authoritative runtime JSON files via `agent_runtime.contracts`."""
    scripts_root = str(RUNTIME_SKILL_DIR / "scripts")
    added = False
    if scripts_root not in sys.path:
        sys.path.insert(0, scripts_root)
        added = True
    try:
        mod = importlib.import_module("agent_runtime.contracts")
        paths = mod.runtime_paths()
        return mod.Contracts(
            paths=paths,
            workflow=json.loads(paths.workflow.read_text(encoding="utf-8")),
            gates=json.loads(paths.gates.read_text(encoding="utf-8")),
            project_schema=json.loads(paths.project_schema.read_text(encoding="utf-8")),
            state_schema=json.loads(paths.state_schema.read_text(encoding="utf-8")),
            rules_schema=json.loads(paths.rules_schema.read_text(encoding="utf-8")),
            final_handoff_schema=json.loads(paths.final_handoff_schema.read_text(encoding="utf-8")),
        )
    finally:
        if added and scripts_root in sys.path:
            sys.path.remove(scripts_root)


def _extract_sql_check_in_values(table_args: tuple[Any, ...], column_name: str) -> tuple[str, ...]:
    """Extract string literal set from SQLAlchemy `CheckConstraint(\"col IN ('a','b',...)\")`."""
    pattern = re.compile(rf"\b{re.escape(column_name)}\s+IN\s*\(([^)]+)\)")
    for item in table_args:
        sql_text = str(getattr(item, "sqltext", ""))
        m = pattern.search(sql_text)
        if m:
            return tuple(re.findall(r"'([^']+)'", m.group(1)))
    raise AssertionError(f"No IN (...) CheckConstraint found for column {column_name!r}")


def test_control_plane_12_stages_9_gates_and_transitions_parity() -> None:
    """Verify `PROJECT_STAGES` (12) and `GATE_NAMES` (9) match across TS, snapshot, and Python runtime."""
    gen_ts_path = FRONTEND_DIR / "data" / "control-plane-contract.generated.ts"
    snapshot_path = FRONTEND_DIR / "data" / "control-plane-contract.snapshot.json"
    assert gen_ts_path.is_file() and snapshot_path.is_file()

    ts_consts = _parse_generated_ts_constants(gen_ts_path)
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    runtime_contracts = _load_runtime_contracts_module()

    expected_12_stages = [
        "intake",
        "rule_lock",
        "problem_framing",
        "exploratory_research",
        "survey_design",
        "fieldwork",
        "data_analysis",
        "insight_action",
        "report_visual",
        "defense",
        "submission_ready",
        "closed",
    ]
    expected_9_gates = [
        "rule",
        "problem",
        "design",
        "fieldwork",
        "data",
        "inference",
        "action",
        "visual",
        "submission",
    ]
    expected_7_gate_values = [
        "not_run",
        "running",
        "pass",
        "warning",
        "fail",
        "unknown",
        "stale",
    ]

    # 1. Exact 12-stage sequence parity across generated TS, snapshot JSON, workflow.json, and JSON Schemas
    assert len(ts_consts["PROJECT_STAGES"]) == 12
    assert ts_consts["PROJECT_STAGES"] == expected_12_stages
    assert runtime_contracts.stages == expected_12_stages
    assert [s["id"] for s in snapshot["workflow"]["stages"]] == expected_12_stages
    assert runtime_contracts.project_schema["$defs"]["controlStatus"]["enum"] == expected_12_stages
    assert runtime_contracts.state_schema["$defs"]["controlStatus"]["enum"] == expected_12_stages

    # 2. Exact 9-gate sequence parity across generated TS, snapshot JSON, gates.json, and JSON Schemas
    assert len(ts_consts["GATE_NAMES"]) == 9
    assert ts_consts["GATE_NAMES"] == expected_9_gates
    assert runtime_contracts.gate_ids == expected_9_gates
    assert snapshot["gates"]["gate_ids"] == expected_9_gates
    assert runtime_contracts.state_schema["properties"]["gates"]["required"] == expected_9_gates
    assert list(runtime_contracts.state_schema["properties"]["gates"]["properties"].keys()) == expected_9_gates
    assert (
        runtime_contracts.final_handoff_schema["properties"]["quality_gates"]["items"]["properties"]["gate"]["enum"]
        == expected_9_gates
    )

    # 3. Gate result statuses & disjoint/exhaustive acceptance partition
    assert ts_consts["GATE_VALUES"] == expected_7_gate_values
    assert runtime_contracts.gates["result_statuses"] == expected_7_gate_values
    assert ts_consts["ACCEPTED_GATE_VALUES"] == ["pass", "warning"]
    assert ts_consts["BLOCKING_GATE_VALUES"] == ["not_run", "running", "fail", "unknown", "stale"]
    assert ts_consts["ACCEPTED_GATE_VALUES"] == runtime_contracts.workflow["gate_result_acceptance"]["accepted"]
    assert ts_consts["BLOCKING_GATE_VALUES"] == runtime_contracts.workflow["gate_result_acceptance"]["blocking"]
    assert set(ts_consts["ACCEPTED_GATE_VALUES"]).isdisjoint(ts_consts["BLOCKING_GATE_VALUES"])
    assert set(ts_consts["ACCEPTED_GATE_VALUES"]) | set(ts_consts["BLOCKING_GATE_VALUES"]) == set(
        ts_consts["GATE_VALUES"]
    )

    # 4. 11 allowed stage transitions, 9 gate definitions, and canonical SHA-256 provenance
    assert len(ts_consts["ALLOWED_TRANSITIONS"]) == 11
    expected_transitions = [
        {
            "id": t["id"],
            "from": t["from"],
            "to": t["to"],
            "requiredGates": t["required_gates"],
            "requiredArtifacts": t["required_artifacts"],
        }
        for t in runtime_contracts.transitions
    ]
    assert ts_consts["ALLOWED_TRANSITIONS"] == expected_transitions

    expected_gate_defs = [
        {
            "id": g["id"],
            "ordinal": g["ordinal"],
            "ownerStatus": g["owner_status"],
            "prerequisiteGates": g["prerequisite_gates"],
        }
        for g in runtime_contracts.gates["gates"]
    ]
    assert ts_consts["GATE_DEFINITIONS"] == expected_gate_defs

    meta = ts_consts["CONTROL_CONTRACT_META"]
    wf_raw_lf = runtime_contracts.paths.workflow.read_text(encoding="utf-8").replace("\r\n", "\n")
    gt_raw_lf = runtime_contracts.paths.gates.read_text(encoding="utf-8").replace("\r\n", "\n")
    wf_raw_sha = hashlib.sha256(wf_raw_lf.encode("utf-8")).hexdigest()
    gt_raw_sha = hashlib.sha256(gt_raw_lf.encode("utf-8")).hexdigest()
    wf_canon_sha = hashlib.sha256(_canonical_json(runtime_contracts.workflow).encode("utf-8")).hexdigest()
    gt_canon_sha = hashlib.sha256(_canonical_json(runtime_contracts.gates).encode("utf-8")).hexdigest()
    assert meta["workflowContractId"] == "zhengda-cup-champion.workflow"
    assert meta["gatesContractId"] == "zhengda-cup-champion.gates"
    assert meta["workflowSha256"] == snapshot["source"]["workflowRawSha256"] == wf_raw_sha
    assert meta["gatesSha256"] == snapshot["source"]["gatesRawSha256"] == gt_raw_sha
    assert snapshot["source"]["workflowCanonicalSha256"] == wf_canon_sha
    assert snapshot["source"]["gatesCanonicalSha256"] == gt_canon_sha


def test_chat_and_orchestrator_19_tool_ids_rooms_stages_studios_parity() -> None:
    """Verify all 19 `/agent` chat tool IDs, required args, rooms, stages, and studios match 1:1."""
    tools_ts_path = FRONTEND_DIR / "lib" / "agent" / "tools-schema.ts"
    chat_ts_path = FRONTEND_DIR / "lib" / "agent" / "chat.ts"
    rooms_ts_path = FRONTEND_DIR / "lib" / "agent" / "rooms.ts"

    fe_specs, fe_switch_cases = _parse_frontend_tool_specs(tools_ts_path)
    fe_ids = [item["id"] for item in fe_specs]
    assert len(fe_ids) == 19
    assert len(set(fe_ids)) == 19
    assert set(fe_switch_cases) == set(fe_ids)

    be_chat_ids = list(backend_agent_chat.TOOLS.keys())
    be_registry_specs = chat_orchestrator_tool_specs()
    be_registry_ids = [spec.name for spec in be_registry_specs]

    # Set equality and exact 19-tool inventory parity across frontend schema, backend validator, and registry
    assert set(fe_ids) == set(be_chat_ids) == set(be_registry_ids)
    assert be_chat_ids == be_registry_ids

    # Required parameter parity for every one of the 19 chat tools
    fe_required_map = {item["id"]: tuple(item["required"]) for item in fe_specs if item["required"]}
    be_chat_required_map = {k: tuple(v) for k, v in backend_agent_chat.REQUIRED.items()}
    be_reg_required_map = {
        spec.name: tuple(spec.parameters.get("required") or ())
        for spec in be_registry_specs
        if spec.parameters.get("required")
    }
    assert fe_required_map == be_chat_required_map == be_reg_required_map

    # Parse `chat.ts` and `rooms.ts` unions & constants
    chat_src = chat_ts_path.read_text(encoding="utf-8")
    rooms_src = rooms_ts_path.read_text(encoding="utf-8")

    # ChatAction union tool names in `chat.ts`
    chat_action_block = chat_src[chat_src.index("export type ChatAction =") : chat_src.index("export type ChatStatus")]
    chat_action_tools: list[str] = []
    for m in re.finditer(r"tool:\s*([^;]+?);\s*args:", chat_action_block):
        chat_action_tools.extend(re.findall(r"'([^']+)'", m.group(1)))
    assert set(chat_action_tools) == set(fe_ids)

    # RESULT_TOOLS (10 read-only continuation tools) parity
    fe_result_tools_m = re.search(r"const RESULT_TOOLS = new Set<[^>]+>\(\[([^\]]+)\]\)", chat_src)
    assert fe_result_tools_m is not None
    fe_result_tools = tuple(re.findall(r"'([^']+)'", fe_result_tools_m.group(1)))
    assert len(fe_result_tools) == 10
    assert fe_result_tools == backend_agent_chat.RESULT_TOOLS

    # 15 Rooms parity (`rooms.ts` RoomId & ROOMS array <-> `agent_chat.ROOMS` & `tool_registry._CHAT_ROOMS`)
    fe_room_union = tuple(_extract_ts_string_union(rooms_src, "RoomId"))
    fe_room_entries = tuple(re.findall(r"\{\s*id:\s*'([^']+)'", rooms_src))
    be_reg_open_spec = next(spec for spec in be_registry_specs if spec.name == "open")
    be_reg_rooms = tuple(be_reg_open_spec.parameters["properties"]["room"]["enum"])
    assert len(fe_room_union) == 15
    assert fe_room_union == fe_room_entries == backend_agent_chat.ROOMS == be_reg_rooms

    # Stage views (`chat`, `paper`, `advisors`, `library`), Studio kinds (`chart`, `code`, `writing`, `coach`),
    # and Sandbox chart kinds (`auto`, `bar`, `line`, `forest`, `dumbbell`) parity
    fe_spec_by_id = {item["id"]: item for item in fe_specs}
    assert tuple(fe_spec_by_id["stage"]["enums"]["view"]) == backend_agent_chat.STAGES
    assert tuple(fe_spec_by_id["studio"]["enums"]["kind"]) == backend_agent_chat.STUDIOS
    assert (
        tuple(fe_spec_by_id["render_sandbox_plot"]["enums"]["chartKind"])
        == backend_agent_chat.TOOLS["render_sandbox_plot"]["chartKind"]
    )


def test_empirical_isa_epistemic_reviewer_sandbox_grounding_47_tools_parity() -> None:
    """Verify all 47 unified empirical/autonomous tools align across registry, sandbox, and SSE contracts."""
    specs = all_tool_specs()
    names = [s.name for s in specs]
    assert len(specs) == 47
    assert len(set(names)) == 47

    # 1. All 21 StatisticalSandbox ISA operators match `isa_tool_specs()` in exact order
    sandbox = StatisticalSandbox([], [], "parity_ref", "0" * 64)
    isa_names = [s.name for s in isa_tool_specs()]
    sb_registry_names = list(sandbox.tool_registry().keys())
    assert len(isa_names) == 21
    assert isa_names == sb_registry_names

    # 2. Epistemic belief graph tool node kinds & statuses match `epistemic_graph.py` and `autonomous-agent.ts`
    ep_specs = epistemic_tool_specs()
    assert [s.name for s in ep_specs] == ["mutate_epistemic_graph"]
    ep_kind_enum = tuple(ep_specs[0].parameters["properties"]["kind"]["enum"])
    assert ep_kind_enum == get_args(NodeKind)

    auto_ts_src = (FRONTEND_DIR / "lib" / "agent" / "autonomous-agent.ts").read_text(encoding="utf-8")
    fe_lease_modes = tuple(_extract_ts_string_union(auto_ts_src, "AutonomousLeaseMode"))
    fe_dataset_modes = tuple(_extract_ts_string_union(auto_ts_src, "AutonomousDatasetMode"))
    assert fe_lease_modes == _extract_sql_check_in_values(AutonomousRun.__table_args__, "lease_mode")
    assert fe_dataset_modes == ("planted_trap_benchmark", "inline_dataset", "survey_release")

    fe_node_status_m = re.search(
        r"export type AutonomousEpistemicNode = \{[^}]*?\bstatus:\s*([^;]+);",
        auto_ts_src,
        re.S,
    )
    assert fe_node_status_m is not None
    fe_node_statuses = tuple(re.findall(r"'([^']+)'", fe_node_status_m.group(1)))
    assert fe_node_statuses == get_args(NodeStatus)

    # 3. Reviewer falsification tools, Sandbox plot/stat tools, and Grounding tools parity
    rev_specs = [s.name for s in reviewer_tool_specs()]
    assert rev_specs == list(build_falsification_reviewer_tools(sandbox=sandbox).keys())
    assert [s.name for s in sandbox_tool_specs()] == ["run_sandbox_plot", "run_custom_stat_script"]
    assert [s.name for s in grounding_tool_specs()] == ["lookup_county_gazetteer", "verify_scholarly_citation"]

    # 4. Durable SSE event types (13) & run statuses SQL CheckConstraints parity
    sse_events = _extract_sql_check_in_values(AutonomousRunEvent.__table_args__, "event_type")
    assert sse_events == (
        "run_started",
        "thought",
        "tool_start",
        "tool_result",
        "pivot",
        "milestone_pause",
        "steering",
        "reviewer_critique",
        "reanalysis",
        "memory_recalled",
        "completed",
        "cancelled",
        "error",
    )
    run_statuses = _extract_sql_check_in_values(AutonomousRun.__table_args__, "status")
    assert run_statuses == ("running", "awaiting_milestone", "completed", "failed", "cancelled")

    # 5. Provider tool schema serializers & public catalog purity (zero forbidden brackets)
    catalog = public_tool_catalog()
    assert catalog["totalCount"] == 47
    assert catalog["groups"] == {
        "isa": 21,
        "epistemic": 1,
        "reviewer": 2,
        "orchestrator": 19,
        "sandbox": 2,
        "grounding": 2,
    }
    assert len(to_openai_tools()) == 47
    assert len(to_gemini_function_declarations()) == 47
    assert len(to_anthropic_tools()) == 47
    assert FORBIDDEN_BRACKETS_RE.search(json.dumps(catalog, ensure_ascii=False)) is None


def test_evix_shared_package_and_backend_domain_contracts_parity() -> None:
    """Verify `packages/evi-x-shared` types, provider URLs, roles, capabilities, and questionnaire schema."""
    api_types_src = (SHARED_PKG_DIR / "src" / "api-types.ts").read_text(encoding="utf-8")
    quest_ts_src = (SHARED_PKG_DIR / "src" / "questionnaire.ts").read_text(encoding="utf-8")

    # 1. MembershipRole, ServiceProvider, ServiceCapability, and PROVIDER_BASES parity
    shared_roles = tuple(_extract_ts_string_union(api_types_src, "MembershipRole"))
    shared_role_labels = tuple(_extract_ts_object_keys(api_types_src, "ROLE_LABELS"))
    assert shared_roles == shared_role_labels == ("owner", "editor", "reviewer", "viewer")
    assert VALID_PRESENCE_STATUSES == ("online", "writing", "offline")

    shared_providers = tuple(_extract_ts_string_union(api_types_src, "ServiceProvider"))
    assert shared_providers == tuple(BASES.keys())

    bases_m = re.search(r"export const PROVIDER_BASES[^=]*=\s*\{([^}]+)\}", api_types_src)
    assert bases_m is not None
    shared_bases = dict(re.findall(r"([a-z]+)\s*:\s*'([^']+)'", bases_m.group(1)))
    expected_fixed_bases = {k: v[0] for k, v in BASES.items() if v}
    assert shared_bases == expected_fixed_bases

    shared_caps = tuple(_extract_ts_string_union(api_types_src, "ServiceCapability"))
    shared_cap_labels = tuple(_extract_ts_object_keys(api_types_src, "CAPABILITY_LABELS"))
    assert shared_caps == shared_cap_labels == ("questionnaire", "research", "report", "defense")

    # Verify `validate_service_config` accepts every shared provider/capability and rejects unknown ones
    dummy_settings = type("S", (), {"compatible_bases": ["https://llm.example.test/v1"]})()
    for provider, url in shared_bases.items():
        cfg = validate_service_config(
            dummy_settings,
            {
                "label": "标准服务",
                "provider": provider,
                "baseUrl": url,
                "model": "gpt-4o-mini" if provider != "gemini" else "gemini-2.5-flash",
                "maxOutputTokens": 1024,
                "capabilities": list(shared_caps),
            },
        )
        assert cfg["capabilities"] == list(shared_caps)
    with pytest.raises(ApiError):
        validate_service_config(
            dummy_settings,
            {
                "label": "非法能力",
                "provider": "openai",
                "baseUrl": shared_bases["openai"],
                "model": "gpt-4o-mini",
                "maxOutputTokens": 1024,
                "capabilities": ["unknown_capability"],
            },
        )

    # 2. Session mode & providerMode literals parity with `Settings`
    assert get_args(Settings.model_fields["mode"].annotation) == ("local_test", "production")
    assert get_args(Settings.model_fields["provider_mode"].annotation) == ("fixture", "live")

    # 3. `packages/evi-x-shared/src/questionnaire.ts` <-> `apps/backend/src/shared/questionnaire.py` parity
    shared_q_types = tuple(_extract_ts_object_keys(quest_ts_src, "QUESTION_TYPES"))
    shared_analysis_plans = tuple(_extract_ts_object_keys(quest_ts_src, "ANALYSIS_PLANS"))
    assert shared_q_types == ("single", "multi", "likert", "number", "text")
    assert shared_analysis_plans == (
        "undecided",
        "description",
        "comparison",
        "association",
        "measurement",
        "coding",
        "routing",
    )

    limits_m = re.search(r"export const DESIGN_LIMITS\s*=\s*\{([^}]+)\}", quest_ts_src)
    assert limits_m is not None
    raw_limits = {
        k: int(v.replace("_", ""))
        for k, v in re.findall(r"([a-zA-Z]+)\s*:\s*([0-9_]+)", limits_m.group(1))
    }
    assert raw_limits["bytes"] == 300_000
    assert raw_limits["questions"] == 80
    assert raw_limits["choices"] == 30

    # Live round-trip validation of every `QUESTION_TYPES`, `ANALYSIS_PLANS`, and `purpose` on backend validator
    sample_questions = []
    for idx, q_type in enumerate(shared_q_types):
        plan = shared_analysis_plans[idx % len(shared_analysis_plans)]
        purpose = ("research", "screening", "background")[idx % 3]
        sample_questions.append(
            {
                "id": f"q_{idx + 1}",
                "variable": f"Q{idx + 1}",
                "text": f"测试题项 {idx + 1}",
                "type": q_type,
                "required": False,
                "purpose": purpose,
                "researchQuestion": "RQ1",
                "construct": "服务感知",
                "analysis": plan,
                "decisionUse": "辅助优化",
                "source": "自编预试",
                "choices": [{"code": "1", "label": "是"}, {"code": "2", "label": "否"}]
                if q_type in ("single", "multi")
                else [],
                "min": 1 if q_type in ("likert", "number") else None,
                "max": 5 if q_type in ("likert", "number") else None,
                "minLabel": "低" if q_type == "likert" else "",
                "maxLabel": "高" if q_type == "likert" else "",
                "reverse": False,
                "condition": None,
            }
        )
    valid_doc = {
        "schema": "questionnaire-design/v1",
        "classification": "proposed",
        "title": "跨栈同构核验问卷",
        "objective": "验证共享问卷契约",
        "population": "目标受访群体",
        "geography": "浙江省县域样本",
        "period": "过去 30 天",
        "recruitment": "分层随机抽样",
        "introduction": "匿名自愿参与说明",
        "pilotNotes": "已完成 30 份预试",
        "questions": sample_questions,
    }
    assert validate_backend_questionnaire(valid_doc)["schema"] == "questionnaire-design/v1"
    with pytest.raises(ApiError):
        validate_backend_questionnaire({**valid_doc, "questions": [{**sample_questions[0], "type": "matrix"}]})


def test_workflow_roles_steps_pipelines_and_sql_status_parity() -> None:
    """Verify 5 specialist roles, internal steps, task pipelines, and SQL status enums match frontend."""
    wf_ts_src = (FRONTEND_DIR / "lib" / "agent" / "workflow-tasks.ts").read_text(encoding="utf-8")

    # 1. 5 specialist roles parity (`WORKFLOW_ROLES` <-> `AgentRole`)
    fe_roles_m = re.search(r"export const WORKFLOW_ROLES\s*=\s*\[([^\]]+)\]", wf_ts_src)
    assert fe_roles_m is not None
    fe_roles = tuple(re.findall(r"'([^']+)'", fe_roles_m.group(1)))
    be_roles = tuple(r.value for r in AgentRole)
    assert fe_roles == be_roles == ("research", "survey", "data", "writing", "reviewer")

    # 2. Per-role internal step tuples parity (`WORKFLOW_ROLE_STEPS` <-> `ROLE_STEPS` <-> `*Workflow.steps`)
    fe_role_steps_m = re.search(r"export const WORKFLOW_ROLE_STEPS\s*=\s*\{(.*?)\}\s*as const;", wf_ts_src, re.S)
    assert fe_role_steps_m is not None
    fe_role_steps = {
        role_k: tuple(re.findall(r"'([^']+)'", arr_txt))
        for role_k, arr_txt in re.findall(r"([a-z_]+)\s*:\s*\[([^\]]+)\]", fe_role_steps_m.group(1))
    }
    specialist_steps = {
        "research": ResearchWorkflow.steps,
        "survey": SurveyWorkflow.steps,
        "data": DataWorkflow.steps,
        "writing": WritingWorkflow.steps,
        "reviewer": ReviewerWorkflow.steps,
    }
    assert fe_role_steps == ROLE_STEPS == specialist_steps

    # 3. Task kinds, role sets, capabilities, and execution pipelines parity
    fe_task_roles_m = re.search(
        r"export const WORKFLOW_TASK_ROLES\s*=\s*\{(.*?)\}\s*as const",
        wf_ts_src,
        re.S,
    )
    assert fe_task_roles_m is not None
    fe_task_roles = {
        task_k: tuple(re.findall(r"'([^']+)'", arr_txt))
        for task_k, arr_txt in re.findall(r"([a-z_]+)\s*:\s*\[([^\]]+)\]", fe_task_roles_m.group(1))
    }
    assert fe_task_roles == TASK_ROLES

    fe_caps_m = re.search(r"export const WORKFLOW_ROLE_CAPABILITIES[^=]*=\s*\{([^}]+)\};", wf_ts_src, re.S)
    assert fe_caps_m is not None
    fe_caps = dict(re.findall(r"([a-z_]+)\s*:\s*'([^']+)'", fe_caps_m.group(1)))
    assert fe_caps == ROLE_CAPABILITIES

    fe_pipes_m = re.search(r"export const WORKFLOW_PIPELINES[^=]*=\s*\{(.*?)\};", wf_ts_src, re.S)
    assert fe_pipes_m is not None
    fe_pipelines = {
        task_k: tuple(re.findall(r"'([^']+)'", arr_txt))
        for task_k, arr_txt in re.findall(r"([a-z_]+)\s*:\s*\[([^\]]+)\]", fe_pipes_m.group(1))
    }
    be_pipelines = {k: tuple(r.value for r in roles) for k, roles in _PIPELINE.items()}
    assert fe_pipelines == be_pipelines

    # 4. WorkflowStatus & WorkflowExecution status parity across TS, Python enums, and SQL CheckConstraints
    fe_wf_statuses = tuple(_extract_ts_string_union(wf_ts_src, "WorkflowStatus"))
    be_wf_statuses = tuple(s.value for s in WorkflowStatus)
    be_run_statuses = set(s.value for s in RunStatus)
    sql_task_statuses = _extract_sql_check_in_values(AgentTask.__table_args__, "status")
    assert fe_wf_statuses == be_wf_statuses == sql_task_statuses
    assert set(fe_wf_statuses) == be_run_statuses

    fe_exec_m = re.search(
        r"export type WorkflowExecution = \{[^}]*?\bstatus:\s*([^;]+);",
        wf_ts_src,
        re.S,
    )
    assert fe_exec_m is not None
    fe_exec_statuses = tuple(re.findall(r"'([^']+)'", fe_exec_m.group(1)))
    sql_exec_statuses = _extract_sql_check_in_values(AgentTaskExecution.__table_args__, "status")
    assert fe_exec_statuses == sql_exec_statuses
