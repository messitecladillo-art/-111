"""Load and validate the versioned workflow contracts."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sys
from typing import Any

from .errors import ContractError
from .io_utils import load_json


@dataclass(frozen=True)
class RuntimePaths:
    skill_root: Path
    workflow: Path
    gates: Path
    project_schema: Path
    state_schema: Path
    rules_schema: Path
    final_handoff_schema: Path
    templates: Path
    scripts: Path


def runtime_paths() -> RuntimePaths:
    source_root = Path(__file__).resolve().parents[2]
    installed_root = Path(sys.prefix) / "share" / "zhengda-cup-champion"
    skill_root = source_root if (source_root / "assets" / "runtime" / "workflow.json").is_file() else installed_root
    runtime = skill_root / "assets" / "runtime"
    return RuntimePaths(
        skill_root=skill_root,
        workflow=runtime / "workflow.json",
        gates=runtime / "gates.json",
        project_schema=runtime / "schemas" / "project.schema.json",
        state_schema=runtime / "schemas" / "agent-state.schema.json",
        rules_schema=runtime / "schemas" / "rules.schema.json",
        final_handoff_schema=runtime / "schemas" / "final-handoff.schema.json",
        templates=skill_root / "assets" / "templates",
        scripts=skill_root / "scripts",
    )


@dataclass
class Contracts:
    paths: RuntimePaths
    workflow: dict[str, Any]
    gates: dict[str, Any]
    project_schema: dict[str, Any]
    state_schema: dict[str, Any]
    rules_schema: dict[str, Any]
    final_handoff_schema: dict[str, Any]

    @property
    def stages(self) -> list[str]:
        return [item["id"] for item in self.workflow["stages"]]

    @property
    def gate_ids(self) -> list[str]:
        return list(self.gates["gate_ids"])

    @property
    def transitions(self) -> list[dict[str, Any]]:
        return list(self.workflow["allowed_transitions"])

    def transition_from(self, status: str) -> dict[str, Any] | None:
        return next((item for item in self.transitions if item["from"] == status), None)

    def transition_to(self, status: str, target: str) -> dict[str, Any] | None:
        return next((item for item in self.transitions if item["from"] == status and item["to"] == target), None)

    def gate_definition(self, gate_id: str) -> dict[str, Any]:
        found = next((item for item in self.gates["gates"] if item["id"] == gate_id), None)
        if found is None:
            raise ContractError(f"Unknown gate: {gate_id}")
        return found


def _validate_schema_instance(instance: Any, schema: dict[str, Any], label: str) -> None:
    try:
        import jsonschema
    except ImportError as exc:
        raise ContractError("jsonschema is required; install dependencies declared in pyproject.toml") from exc
    validator = jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker())
    errors = sorted(validator.iter_errors(instance), key=lambda item: list(item.absolute_path))
    if errors:
        details = []
        for error in errors[:20]:
            location = ".".join(str(item) for item in error.absolute_path) or "$"
            details.append(f"{location}: {error.message}")
        raise ContractError(f"{label} failed schema validation", details={"errors": details})


def load_contracts() -> Contracts:
    paths = runtime_paths()
    workflow = load_json(paths.workflow)
    gates = load_json(paths.gates)
    project_schema = load_json(paths.project_schema)
    state_schema = load_json(paths.state_schema)
    rules_schema = load_json(paths.rules_schema)
    final_handoff_schema = load_json(paths.final_handoff_schema)
    documents = {
        "workflow.json": workflow,
        "gates.json": gates,
        "project.schema.json": project_schema,
        "agent-state.schema.json": state_schema,
        "rules.schema.json": rules_schema,
        "final-handoff.schema.json": final_handoff_schema,
    }
    invalid_roots = [label for label, document in documents.items() if not isinstance(document, dict)]
    if invalid_roots:
        raise ContractError("Runtime contract roots must be JSON objects", details={"invalid_roots": invalid_roots})
    contracts = Contracts(paths, workflow, gates, project_schema, state_schema, rules_schema, final_handoff_schema)

    try:
        import jsonschema
        for label, schema in (
            ("project.schema.json", project_schema),
            ("agent-state.schema.json", state_schema),
            ("rules.schema.json", rules_schema),
            ("final-handoff.schema.json", final_handoff_schema),
        ):
            jsonschema.Draft202012Validator.check_schema(schema)
            if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
                raise ContractError(f"{label} declares an unsupported meta-schema")
            if schema.get("x-contract-version") != "1.0.0":
                raise ContractError(f"{label} has an unsupported contract version")
    except ImportError as exc:
        raise ContractError("jsonschema is required; install dependencies declared in pyproject.toml") from exc
    except jsonschema.SchemaError as exc:
        raise ContractError(f"Runtime JSON Schema is invalid: {exc.message}") from exc

    if workflow.get("contract_id") != "zhengda-cup-champion.workflow":
        raise ContractError("Workflow contract_id is invalid")
    if gates.get("contract_id") != "zhengda-cup-champion.gates":
        raise ContractError("Gate contract_id is invalid")
    if workflow.get("version") != "1.0.0" or gates.get("version") != "1.0.0":
        raise ContractError("Unsupported control-plane contract version")
    stage_records = workflow.get("stages")
    if not isinstance(stage_records, list) or not stage_records:
        raise ContractError("Workflow must declare a non-empty stages list")
    if any(not isinstance(item, dict) or not isinstance(item.get("id"), str) for item in stage_records):
        raise ContractError("Every workflow stage must be an object with an ID")
    stage_ids = [item["id"] for item in stage_records]
    if len(stage_ids) != len(set(stage_ids)):
        raise ContractError("Workflow stages are duplicated")
    ordinals = [item.get("ordinal") for item in stage_records]
    if ordinals != list(range(len(stage_records))):
        raise ContractError("Workflow stage ordinals must be contiguous and zero-based")
    if workflow.get("initial_status") != stage_ids[0] or workflow.get("terminal_statuses") != [stage_ids[-1]]:
        raise ContractError("Workflow initial or terminal status conflicts with the stage order")
    gate_ids = gates.get("gate_ids")
    gate_definitions = gates.get("gates")
    if not isinstance(gate_ids, list) or any(not isinstance(item, str) or not item for item in gate_ids):
        raise ContractError("Gate IDs must be a list of non-empty strings")
    if not isinstance(gate_definitions, list) or any(not isinstance(item, dict) for item in gate_definitions):
        raise ContractError("Gate definitions must be a list of objects")
    if gate_ids != [item.get("id") for item in gate_definitions]:
        raise ContractError("Gate index and gate definitions do not match")
    if len(gate_ids) != len(set(gate_ids)) or not gate_ids:
        raise ContractError("Gate IDs must be non-empty and unique")
    required_gate_fields = {"id", "required_evidence", "invalidated_by"}
    for definition in gate_definitions:
        missing = sorted(required_gate_fields - set(definition))
        if missing:
            raise ContractError("Gate definition is incomplete", details={"gate": definition.get("id"), "missing": missing})
        for list_field in ("required_evidence", "invalidated_by"):
            values = definition.get(list_field)
            if not isinstance(values, list) or any(not isinstance(value, str) or not value.strip() for value in values):
                raise ContractError("Gate definition list is invalid", details={"gate": definition.get("id"), "field": list_field})
    try:
        project_statuses = project_schema["$defs"]["controlStatus"]["enum"]
        state_statuses = state_schema["$defs"]["controlStatus"]["enum"]
        state_gate_required = state_schema["properties"]["gates"]["required"]
        state_gate_properties = list(state_schema["properties"]["gates"]["properties"])
        final_gate_values = final_handoff_schema["properties"]["quality_gates"]["items"]["properties"]["gate"]["enum"]
    except (KeyError, TypeError) as exc:
        raise ContractError("Runtime schemas are missing cross-contract control definitions") from exc
    if project_statuses != stage_ids or state_statuses != stage_ids:
        raise ContractError("Workflow stages and project/state controlStatus enums differ")
    if state_gate_required != gate_ids or state_gate_properties != gate_ids or final_gate_values != gate_ids:
        raise ContractError("Gate contract and state/final-manifest Gate indexes differ")
    transitions = workflow.get("allowed_transitions")
    if not isinstance(transitions, list):
        raise ContractError("Workflow allowed_transitions must be a list")
    stage_index = {stage: index for index, stage in enumerate(stage_ids)}
    transition_pairs: list[tuple[str, str]] = []
    for transition in transitions:
        if not isinstance(transition, dict):
            raise ContractError("Workflow transition must be an object")
        source = transition.get("from")
        target = transition.get("to")
        if source not in stage_index or target not in stage_index or stage_index[target] != stage_index[source] + 1:
            raise ContractError(f"Non-adjacent workflow transition: {source} -> {target}")
        transition_pairs.append((source, target))
        required_gates = transition.get("required_gates")
        required_artifacts = transition.get("required_artifacts")
        if not isinstance(required_gates, list) or any(gate not in gate_ids for gate in required_gates):
            raise ContractError("Transition references an invalid Gate", details={"from": source, "to": target})
        if not isinstance(required_artifacts, list) or any(not isinstance(item, str) or not item.strip() for item in required_artifacts):
            raise ContractError("Transition required_artifacts is invalid", details={"from": source, "to": target})
    expected_pairs = list(zip(stage_ids, stage_ids[1:]))
    if transition_pairs != expected_pairs:
        raise ContractError("Workflow must define each adjacent transition exactly once and in stage order")
    return contracts


def validate_project(project: dict[str, Any], contracts: Contracts) -> None:
    _validate_schema_instance(project, contracts.project_schema, "project.yaml")


def validate_state(state: dict[str, Any], contracts: Contracts) -> None:
    _validate_schema_instance(state, contracts.state_schema, ".agent/state.json")


def validate_rules(rules: dict[str, Any], contracts: Contracts) -> None:
    _validate_schema_instance(rules, contracts.rules_schema, "evidence/rules.json")


def validate_final_handoff(manifest: dict[str, Any], contracts: Contracts) -> None:
    _validate_schema_instance(manifest, contracts.final_handoff_schema, "reviews/final-manifest.json")


def validate_checkpoint(checkpoint: dict[str, Any], contracts: Contracts) -> None:
    schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$defs": contracts.state_schema["$defs"],
        "$ref": "#/$defs/checkpointRecord",
    }
    _validate_schema_instance(checkpoint, schema, "checkpoint record")
