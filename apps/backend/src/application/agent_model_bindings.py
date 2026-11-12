"""Secret-free, revision-bound model routing for durable Agent tasks.

These references prove a selection and capability match, not provider readiness,
permission to charge, or a successful external call. ``resolve_service`` must be
an ownership-enforcing application resolver; this module never opens a provider.
"""

from __future__ import annotations

from collections.abc import Callable
from enum import Enum
from typing import Any

from shared.contracts import uuid_string
from shared.errors import ApiError


# The role workflows own execution order. A parity regression checks these
# accepted wire identities against their actual ``steps`` tuples.
ROLE_STEPS: dict[str, tuple[str, ...]] = {
    "research": ("review_materials", "design_research", "assess_feasibility"),
    "survey": ("design_variables", "design_questionnaire", "design_sampling"),
    "data": ("inspect_data", "clean_data", "analyze_data"),
    "writing": ("outline_report", "draft_report"),
    "reviewer": ("check_evidence", "check_consistency", "review_deliverable"),
}
TASK_ROLES: dict[str, tuple[str, ...]] = {
    "full_research": ("research", "survey", "data", "writing", "reviewer"),
    "topic_design": ("research", "reviewer"),
    "questionnaire": ("survey", "reviewer"),
    "data_analysis": ("data", "reviewer"),
    "report": ("writing", "reviewer"),
}
ROLE_CAPABILITIES: dict[str, str] = {
    "research": "research", "survey": "questionnaire", "data": "research",
    "writing": "report", "reviewer": "report",
}
_STEP_ROLES = {f"{role}.{step}": role for role, steps in ROLE_STEPS.items() for step in steps}
_MAX_REVISION = 2_147_483_647
ServiceResolver = Callable[[str], Any]


def _invalid(code: str = "invalid_model_plan") -> ApiError:
    message = "模型分配格式或任务覆盖无效。" if code == "invalid_model_plan" else "已保存的模型分配无效。"
    return ApiError(422, code, message)


def _object(value: Any, *, required: set[str], optional: set[str] = frozenset(), code: str) -> dict:
    # HTTP and durable JSON supply plain dictionaries. Reject custom mappings
    # before reading their keys/items, including dict subclasses with accessors.
    if type(value) is not dict or any(type(key) is not str for key in value):
        raise _invalid(code)
    if set(value) - required - optional or required - set(value):
        raise _invalid(code)
    return value


def _uuid(value: Any, code: str) -> str:
    if type(value) is not str:
        raise _invalid(code)
    try:
        return uuid_string(value)
    except ApiError:
        raise _invalid(code) from None


def _revision(value: Any, code: str) -> int:
    if type(value) is not int or not 1 <= value <= _MAX_REVISION:
        raise _invalid(code)
    return value


def _selection(value: Any, code: str, *, capability: str | None = None) -> dict:
    fields = {"serviceId", "revision"} | ({"capability"} if capability is not None else set())
    item = _object(value, required=fields, code=code)
    result = {"serviceId": _uuid(item["serviceId"], code), "revision": _revision(item["revision"], code)}
    if capability is not None:
        if type(item["capability"]) is not str or item["capability"] != capability:
            raise _invalid(code)
        result["capability"] = capability
    return result


def _roles(task_type: str, code: str) -> tuple[str, ...]:
    if type(task_type) is not str or task_type not in TASK_ROLES:
        raise _invalid(code)
    return TASK_ROLES[task_type]


def _step_ids(roles: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(f"{role}.{step}" for role in roles for step in ROLE_STEPS[role])


def _service(selection: dict, resolve_service: ServiceResolver, cache: dict[str, Any], *, capability: str | None = None) -> None:
    service_id = selection["serviceId"]
    try:
        if service_id not in cache:
            cache[service_id] = resolve_service(service_id)
        service = cache[service_id]
        if service is None or getattr(service, "deleted", None) is not False:
            raise ValueError
        current_revision = getattr(service, "revision", None)
        capabilities = getattr(service, "capabilities", None)
    except Exception:
        # Never propagate resolver/database text that could include configuration.
        raise ApiError(409, "model_service_unavailable", "模型服务不存在或当前账号无权使用。") from None
    if type(current_revision) is not int or current_revision != selection["revision"]:
        raise ApiError(409, "model_service_revision_conflict", "模型服务版本已变化，请重新确认分配。")
    if capability is not None and (type(capabilities) not in (list, tuple, set, frozenset)
                                   or any(type(item) is not str for item in capabilities)
                                   or capability not in capabilities):
        raise ApiError(422, "model_capability_unavailable", "模型服务未启用所需能力。")


def _checked_references(selections: list[dict], resolve_service: ServiceResolver) -> dict[str, Any]:
    """Acquire owned service rows once in a deterministic order before dispatch."""
    cache: dict[str, Any] = {}
    for selection in sorted(selections, key=lambda item: (item["serviceId"], item["revision"])):
        _service(selection, resolve_service, cache)
    return cache


def freeze_model_bindings(raw: Any, *, owner_id: str, task_type: str, resolve_service: ServiceResolver) -> dict | None:
    """Resolve step > role > default into a complete, detached JSON snapshot.

    ``None`` preserves the legacy no-plan path. A supplied plan must cover every
    internal step of the task, including Reviewer. All supplied references are
    checked even when shadowed; no service is implicitly selected or substituted.
    """
    if raw is None:
        return None
    code = "invalid_model_plan"
    owner = _uuid(owner_id, code)
    relevant_roles = _roles(task_type, code)
    allowed_steps = _step_ids(relevant_roles)
    plan = _object(raw, required={"schemaVersion"}, optional={"default", "roles", "steps"}, code=code)
    if type(plan["schemaVersion"]) is not int or plan["schemaVersion"] != 1:
        raise _invalid(code)
    role_inputs = _object(plan.get("roles", {}), required=set(), optional=set(relevant_roles), code=code)
    step_inputs = _object(plan.get("steps", {}), required=set(), optional=set(allowed_steps), code=code)
    default = _selection(plan["default"], code) if "default" in plan else None
    roles = {role: _selection(value, code) for role, value in role_inputs.items()}
    steps = {step: _selection(value, code) for step, value in step_inputs.items()}
    selected = {step: steps.get(step) or roles.get(_STEP_ROLES[step]) or default for step in allowed_steps}
    if any(value is None for value in selected.values()):
        raise _invalid(code)
    references = [*roles.values(), *steps.values(), *([default] if default is not None else [])]
    cache = _checked_references(references, resolve_service)
    frozen_steps = {}
    for step, selection in selected.items():
        capability = ROLE_CAPABILITIES[_STEP_ROLES[step]]
        _service(selection, resolve_service, cache, capability=capability)
        frozen_steps[step] = {**selection, "capability": capability}
    return {"schemaVersion": 1, "ownerId": owner, "steps": frozen_steps}


def validate_frozen_model_bindings(raw: Any, *, owner_id: str, task_type: str | None = None) -> dict | None:
    """Validate persisted references without looking up services or configuration.

    Supplying ``task_type`` additionally enforces the exact task step set. Without
    it, every represented role must still contain its complete accepted step set.
    """
    if raw is None:
        return None
    code = "invalid_model_bindings"
    owner = _uuid(owner_id, code)
    snapshot = _object(raw, required={"schemaVersion", "ownerId", "steps"}, code=code)
    if type(snapshot["schemaVersion"]) is not int or snapshot["schemaVersion"] != 1:
        raise _invalid(code)
    recorded_owner = _uuid(snapshot["ownerId"], code)
    if recorded_owner != owner:
        raise ApiError(403, "model_bindings_owner_mismatch", "模型分配不属于当前任务创建者。")
    steps = _object(snapshot["steps"], required=set(), optional=set(_STEP_ROLES), code=code)
    represented = tuple(role for role in ROLE_STEPS if any(_STEP_ROLES[step] == role for step in steps))
    required_steps = set(_step_ids(_roles(task_type, code) if task_type is not None else represented))
    if not steps or set(steps) != required_steps:
        raise _invalid(code)
    sanitized = {step: _selection(steps[step], code, capability=ROLE_CAPABILITIES[_STEP_ROLES[step]]) for step in _STEP_ROLES if step in steps}
    return {"schemaVersion": 1, "ownerId": recorded_owner, "steps": sanitized}


def validate_role_bindings(snapshot: Any, *, owner_id: str, role: str, resolve_service: ServiceResolver) -> dict | None:
    """Recheck only the dispatching role's exact references after persistence.

    This is a preflight identity/version/capability check, not fee consent and not
    a provider call. Missing or stale bindings fail closed without auto-selection.
    """
    validated = validate_frozen_model_bindings(snapshot, owner_id=owner_id)
    if validated is None:
        return None
    # AgentRole is a string Enum; normalize it before formatting qualified IDs.
    if isinstance(role, Enum):
        role = role.value
    if type(role) is not str or role not in ROLE_STEPS:
        raise _invalid("invalid_model_bindings")
    requested_steps = _step_ids((role,))
    if any(step not in validated["steps"] for step in requested_steps):
        raise _invalid("invalid_model_bindings")
    selected = {step: validated["steps"][step] for step in requested_steps}
    cache = _checked_references(list(selected.values()), resolve_service)
    for binding in selected.values():
        _service(binding, resolve_service, cache, capability=ROLE_CAPABILITIES[role])
    return selected
