"""Keep responsibilities separated as features are added to the backend."""

import ast
import importlib.util
from pathlib import Path

from fastapi.testclient import TestClient

from evix_api.app import create_app


SOURCE = Path(__file__).resolve().parents[1] / "src"
LAYERS = {"evix_api", "application", "multi_agent", "infrastructure", "features", "shared"}
FORBIDDEN = {
    "shared": LAYERS - {"shared"} | {"fastapi", "starlette", "sqlalchemy", "httpx"},
    "infrastructure": {"evix_api", "application", "multi_agent", "features", "fastapi", "starlette"},
    "features": {"evix_api", "application", "multi_agent", "fastapi", "starlette"},
    "multi_agent": {"evix_api", "application", "features", "fastapi", "starlette"},
    "application": {"evix_api", "fastapi", "starlette"},
    "evix_api": set(),
}


def source_modules():
    modules = {}
    for path in SOURCE.rglob("*.py"):
        relative = path.relative_to(SOURCE).with_suffix("")
        name = ".".join(relative.parts)
        if name.endswith(".__init__"):
            name = name.removesuffix(".__init__")
        modules[name] = (path, ast.parse(path.read_text(encoding="utf-8-sig")))
    return modules


def imported_modules(name, path, parsed):
    package = name if path.name == "__init__.py" else name.rpartition(".")[0]
    for node in ast.walk(parsed):
        if isinstance(node, ast.Import):
            yield from (alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if node.level:
                module = importlib.util.resolve_name("." * node.level + module, package)
            yield module
            yield from (module + "." + alias.name for alias in node.names)


def test_layer_dependencies_do_not_point_backwards_or_between_roles():
    violations = []
    roles = {"research_agent", "survey_agent", "data_agent", "writing_agent", "reviewer_agent"}
    for name, (path, parsed) in source_modules().items():
        root = name.split(".")[0]
        role = name.split(".")[2] if name.startswith("multi_agent.agents.") else None
        for imported in imported_modules(name, path, parsed):
            if imported.split(".")[0] in FORBIDDEN[root]:
                violations.append(f"{name} -> {imported}")
            parts = imported.split(".")
            if role in roles and imported.startswith("multi_agent.workflow"):
                violations.append(f"Role imports outer coordinator: {name} -> {imported}")
            if role in roles and parts[:2] == ["multi_agent", "agents"] and len(parts) > 2 and parts[2] in roles - {role}:
                violations.append(f"Cross-role dependency: {name} -> {imported}")
    assert not violations, "\n".join(violations)


def test_explicit_local_import_graph_has_no_cycles():
    modules = source_modules()
    edges = {
        name: {other for other in imported_modules(name, path, parsed) if other in modules and other != name}
        for name, (path, parsed) in modules.items()
    }
    visited, active = set(), []

    def visit(name):
        assert name not in active, "Import cycle: " + " -> ".join(active + [name])
        if name in visited:
            return
        active.append(name)
        for other in sorted(edges[name]):
            visit(other)
        active.pop()
        visited.add(name)

    for name in sorted(modules):
        visit(name)


def test_application_factory_does_not_implement_http_handlers_or_sql():
    parsed = ast.parse((SOURCE / "evix_api" / "app.py").read_text(encoding="utf-8"))
    factory = next(node for node in parsed.body if isinstance(node, ast.FunctionDef) and node.name == "create_app")
    assert not any(isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) for node in ast.walk(factory) if node is not factory)
    assert not any(isinstance(node, ast.Name) and node.id in {"select", "update", "DBSession"} for node in ast.walk(factory))


def test_composed_http_boundary_preserves_session_and_authorization(settings, tmp_path):
    local = settings.model_copy(update={
        "sav_temp_dir": tmp_path / "sav",
        "preflight_temp_dir": tmp_path / "preflight",
    })
    with TestClient(create_app(local)) as client:
        response = client.get("/api/session")
        assert response.status_code == 200
        assert response.json() == {"authenticated": False, "mode": "local_test"}
        response = client.get("/api/projects")
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "session_required"
        response = client.post("/api/auth/code", json={"email": "a@example.test"})
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "origin_forbidden"
