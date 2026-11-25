"""Acceptance tests for Agent Phase 6 Track A: chat tools (verify_citation, render_sandbox_plot) and /sandbox/stat route."""

from __future__ import annotations

import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from application.providers import AuthoredProvider
from evix_api.app import create_app
from multi_agent.agents.research_agent.services import agent_chat as chat
from multi_agent.tool_registry import chat_orchestrator_tool_specs, public_tool_catalog
from tests.test_agent_chat import request as chat_request
from tests.test_postgres import idem, project


def test_agent_chat_parses_verify_citation_and_render_sandbox_plot_and_catalog_47(settings, tmp_path):
    assert len(chat.TOOLS) == 19
    assert {"verify_citation", "render_sandbox_plot"} <= set(chat.TOOLS)
    assert {"verify_citation", "render_sandbox_plot"} <= set(chat.RESULT_TOOLS)
    assert "verify_citation" not in chat.REQUIRED and "render_sandbox_plot" not in chat.REQUIRED

    prompt = chat.agent_prompt(chat_request())
    assert all(f"{tool}（" in prompt for tool in chat.TOOLS)
    assert chat.encoded_size(prompt) <= chat.PROMPT_BYTES

    parsed = chat.parse_reply(
        json.dumps(
            {
                "reply": "先核验 Cronbach 文献并用森林图渲染统计快照。",
                "actions": [
                    {"tool": "verify_citation", "args": {"query": "Cronbach", "doi": "10.1007/BF02310555"}},
                    {"tool": "render_sandbox_plot", "args": {"snapshotId": "snap_deadbeef1234", "chartKind": "forest"}},
                    {"tool": "render_sandbox_plot", "args": {}},
                ],
            },
            ensure_ascii=False,
        )
    )
    assert parsed["droppedActions"] == 0
    assert parsed["actions"] == [
        {"tool": "verify_citation", "args": {"query": "Cronbach", "doi": "10.1007/BF02310555"}},
        {"tool": "render_sandbox_plot", "args": {"snapshotId": "snap_deadbeef1234", "chartKind": "forest"}},
        {"tool": "render_sandbox_plot", "args": {}},
    ]

    invalid_kind = chat.parse_reply(
        json.dumps(
            {
                "reply": "无效图表类型应丢弃。",
                "actions": [{"tool": "render_sandbox_plot", "args": {"chartKind": "pie"}}],
            },
            ensure_ascii=False,
        )
    )
    assert invalid_kind == {"reply": "无效图表类型应丢弃。", "actions": [], "droppedActions": 1}

    cont = chat_request(
        step=2,
        toolResults=[
            {"tool": "verify_citation", "text": "已核验 DOI 10.1007/BF02310555 (Cronbach, 1951)。"},
            {"tool": "render_sandbox_plot", "text": "已输出防重叠自检矢量 SVG 图表。"},
        ],
    )
    assert chat.request_input(cont) == cont

    assert {s.name for s in chat_orchestrator_tool_specs()} == set(chat.TOOLS)
    local = settings.model_copy(update={"sav_temp_dir": tmp_path / "sav", "preflight_temp_dir": tmp_path / "pre"})
    with TestClient(create_app(local)) as client:
        res = client.get("/api/agent/tools")
        assert res.status_code == 200
        body = res.json()
        assert body == public_tool_catalog()
        assert body["totalCount"] == 47
        assert body["groups"]["orchestrator"] == 19
        by_name = {t["name"]: t for t in body["tools"]}
        vc = by_name["verify_citation"]
        assert vc["group"] == "orchestrator" and vc["mutates"] is False and vc["riskTier"] == "readonly"
        assert set(vc["parameters"]["properties"]) == {"query", "doi"}
        assert vc["parameters"]["required"] == []
        rsp = by_name["render_sandbox_plot"]
        assert rsp["group"] == "orchestrator" and rsp["mutates"] is False and rsp["riskTier"] == "readonly"
        assert set(rsp["parameters"]["properties"]) == {"snapshotId", "chartKind"}
        assert rsp["parameters"]["properties"]["chartKind"]["enum"] == ["auto", "bar", "line", "forest", "dumbbell"]
        assert rsp["parameters"]["required"] == []


def test_stat_sandbox_route_requires_session(settings, tmp_path):
    local = settings.model_copy(update={"sav_temp_dir": tmp_path / "sav", "preflight_temp_dir": tmp_path / "pre"})
    with TestClient(create_app(local)) as client:
        res = client.post(
            f"/api/projects/{uuid4()}/sandbox/stat",
            json={"script": "RESULT = {'summary': 'x', 'metrics': {'a': 1}, 'n_effective': 5}"},
        )
        assert res.status_code == 401


@pytest.mark.postgres
def test_postgres_stat_sandbox_route_strips_pii_and_isolates_tenants(settings, pg_engine, tmp_path, monkeypatch):
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")
    deliveries: dict[str, str] = {}

    async def mail(cid, email, code):
        deliveries[cid] = code

    class PoolCheckedProvider(AuthoredProvider):
        async def agent_step(self, config, key, messages, *, tools=None, tool_choice="auto", limit=196608, timeout=45):
            assert pg_engine.pool.checkedout() == 0
            return await super().agent_step(
                config, key, messages, tools=tools, tool_choice=tool_choice, limit=limit, timeout=timeout
            )

    app = create_app(settings, engine=pg_engine, provider=PoolCheckedProvider(tmp_path), mail=mail)

    def _login(email: str):
        client = TestClient(app)
        client.headers["origin"] = settings.allowed_origins[0]
        cid = client.post("/api/auth/code", json={"email": email}).json()["challengeId"]
        ident = client.post("/api/auth/verify", json={"challengeId": cid, "code": deliveries[cid]}).json()
        client.headers["x-csrf-token"] = ident["csrfToken"]
        return client

    with _login("a@example.test") as owner_client, _login("b@example.test") as outsider_client:
        proj, _team = project(owner_client)

        pii_token = "PII_SECRET_PHONE_13900008888"
        inline_qs = [
            {"id": "q_x", "variable": "predictor_x", "text": "自变量评分", "type": "number"},
            {"id": "q_y", "variable": "outcome_y", "text": "因变量评分", "type": "number"},
            {"id": "q_pii", "variable": "open_pii_note", "text": "开放联系备注", "type": "text"},
        ]
        inline_rows = [
            {
                "answers": {
                    "q_x": float(i + 1 if i < 19 else 100.0),
                    "q_y": float((i + 1) * 2),
                    "q_pii": f"{pii_token}_{i}",
                    "open_pii_note": f"{pii_token}_VAR_{i}",
                },
                "visibility": {"q_x": True, "q_y": True, "q_pii": True},
            }
            for i in range(20)
        ]
        winsor_spearman_script = """
import numpy as np

x = np.array([float(r["answers"]["q_x"]) for r in ROWS], dtype=float)
y = np.array([float(r["answers"]["q_y"]) for r in ROWS], dtype=float)
lo, hi = np.quantile(x, [0.1, 0.9])
x_win = np.clip(x, lo, hi)
rx = np.argsort(np.argsort(x))
ry = np.argsort(np.argsort(y))
spearman_rho = float(np.corrcoef(rx, ry)[0, 1])
leaked = [
    r["answers"].get("q_pii") or r["answers"].get("open_pii_note")
    for r in ROWS
    if r["answers"].get("q_pii") or r["answers"].get("open_pii_note")
]
has_text_q = any(q.get("type") == "text" for q in QUESTIONS)
RESULT = {
    "summary": f"Winsorized均值={float(np.mean(x_win)):.3f}, Spearman相关={spearman_rho:.3f}",
    "metrics": {
        "winsorized_mean": float(np.mean(x_win)),
        "spearman_rho": spearman_rho,
        "pii_leaked_count": len(leaked),
        "has_text_q": has_text_q,
    },
    "n_effective": int(len(x)),
}
"""
        # 1. Inline rows with PII stripped + Winsorized/Spearman stats + SHA-256 snapshotId
        inline_res = owner_client.post(
            f"/api/projects/{proj['id']}/sandbox/stat",
            json={
                "script": winsor_spearman_script,
                "questions": inline_qs,
                "rows": inline_rows,
                "classification": "actual",
            },
        )
        assert inline_res.status_code == 200, inline_res.text
        assert pii_token not in inline_res.text
        in_body = inline_res.json()
        assert in_body["projectId"] == proj["id"]
        assert in_body["classification"] == "actual"
        assert in_body["snapshotId"].startswith("snap_")
        assert len(in_body["result_hash"]) == 64
        assert in_body["evidenceRefs"] == [in_body["snapshotId"]]
        assert in_body["n_effective"] == 20
        assert in_body["metrics"]["pii_leaked_count"] == 0
        assert in_body["metrics"]["has_text_q"] is False
        assert in_body["metrics"]["winsorized_mean"] < 20.0
        assert abs(in_body["metrics"]["spearman_rho"] - 1.0) < 1e-9

        # 2. runId resolution (planted_trap_benchmark autonomous run)
        r_bench = owner_client.post(
            f"/api/projects/{proj['id']}/autonomous-runs",
            json={
                "idempotencyKey": idem(),
                "goal": "沙盒路由运行记录读取验证",
                "geography": "县域",
                "datasetMode": "planted_trap_benchmark",
                "leaseMode": "pi_autonomous",
                "maxToolCalls": 28,
            },
        )
        assert r_bench.status_code == 201, r_bench.text
        bench_run_id = r_bench.json()["runId"]

        bench_script = """
import numpy as np

x = np.array([float(r["answers"]["q_tech_ease"]) for r in ROWS], dtype=float)
y = np.array([float(r["answers"]["q_adopt"]) for r in ROWS], dtype=float)
lo, hi = np.quantile(x, [0.1, 0.9])
x_win = np.clip(x, lo, hi)
rx = np.argsort(np.argsort(x))
ry = np.argsort(np.argsort(y))
spearman_rho = float(np.corrcoef(rx, ry)[0, 1])
open_vals = [r["answers"].get("q_open") for r in ROWS if r["answers"].get("q_open")]
RESULT = {
    "summary": f"基准数据集Winsor均值={float(np.mean(x_win)):.3f}, Spearman={spearman_rho:.3f}",
    "metrics": {
        "winsorized_mean": float(np.mean(x_win)),
        "spearman_rho": spearman_rho,
        "open_stripped": len(open_vals) == 0,
    },
    "n_effective": int(len(x)),
}
"""
        run_res = owner_client.post(
            f"/api/projects/{proj['id']}/sandbox/stat",
            json={"runId": bench_run_id, "script": bench_script},
        )
        assert run_res.status_code == 200, run_res.text
        run_body = run_res.json()
        assert run_body["classification"] == "simulated"
        assert run_body["snapshotId"].startswith("snap_")
        assert len(run_body["result_hash"]) == 64
        assert run_body["n_effective"] == 240
        assert run_body["metrics"]["open_stripped"] is True

        # 3. runId resolution for inline_dataset autonomous run (checkpoint inlineQuestions/inlineRows)
        kano_qs = [
            {"id": "k1p", "variable": "voice_guide_func", "text": "语音导览正向", "type": "number"},
            {"id": "k1n", "variable": "voice_guide_dysfunc", "text": "语音导览反向", "type": "number"},
            {"id": "k2p", "variable": "popup_ads_func", "text": "高频弹窗正向", "type": "number"},
            {"id": "k2n", "variable": "popup_ads_dysfunc", "text": "高频弹窗反向", "type": "number"},
            {"id": "k_txt", "variable": "free_text", "text": "开放意见", "type": "text"},
        ]
        kano_rows = [
            {
                "answers": {
                    "k1p": 5,
                    "k1n": 1 if i < 6 else 3,
                    "k2p": 1 if i < 6 else 3,
                    "k2n": 4 if i < 6 else 3,
                    "k_txt": f"{pii_token}_INLINE_{i}",
                },
                "visibility": {q["id"]: True for q in kano_qs},
            }
            for i in range(24)
        ]
        r_inline = owner_client.post(
            f"/api/projects/{proj['id']}/autonomous-runs",
            json={
                "idempotencyKey": idem(),
                "goal": "产品需求 Kano 属性优先级分类",
                "geography": "县域",
                "datasetMode": "inline_dataset",
                "leaseMode": "pi_autonomous",
                "maxToolCalls": 16,
                "inlineDataset": {"title": "Kano适配", "classification": "actual", "questions": kano_qs, "rows": kano_rows},
            },
        )
        assert r_inline.status_code == 201, r_inline.text
        inline_run_id = r_inline.json()["runId"]

        inline_run_res = owner_client.post(
            f"/api/projects/{proj['id']}/sandbox/stat",
            json={
                "runId": inline_run_id,
                "script": (
                    "import numpy as np\n"
                    "vals = [float(r['answers']['k1p']) for r in ROWS]\n"
                    "has_txt = any(r['answers'].get('k_txt') for r in ROWS)\n"
                    "RESULT = {'summary': 'inline run stat', 'metrics': {'mean': float(np.mean(vals)), 'has_txt': has_txt}, 'n_effective': len(vals)}\n"
                ),
            },
        )
        assert inline_run_res.status_code == 200, inline_run_res.text
        assert pii_token not in inline_run_res.text
        assert inline_run_res.json()["classification"] == "actual"
        assert inline_run_res.json()["n_effective"] == 24
        assert inline_run_res.json()["metrics"]["has_txt"] is False

        # 4. AST escape attack returns 422 sandbox_security_error
        ast_attack = owner_client.post(
            f"/api/projects/{proj['id']}/sandbox/stat",
            json={
                "questions": inline_qs,
                "rows": inline_rows,
                "script": "import os\nRESULT = {'summary': str(os.listdir('.')), 'metrics': {'a': 1}, 'n_effective': 5}",
            },
        )
        assert ast_attack.status_code == 422
        assert ast_attack.json()["error"]["code"] == "sandbox_security_error"

        # 5. Raw-row exfiltration attempt returns 422 sandbox_security_error
        exfil_attack = owner_client.post(
            f"/api/projects/{proj['id']}/sandbox/stat",
            json={
                "questions": inline_qs,
                "rows": inline_rows,
                "script": (
                    "RESULT = {\n"
                    "    'summary': 'exfil',\n"
                    "    'metrics': {'n': len(ROWS)},\n"
                    "    'n_effective': len(ROWS),\n"
                    "    'leaked': [r['answers']['q_x'] for r in ROWS],\n"
                    "}\n"
                ),
            },
        )
        assert exfil_attack.status_code == 422
        assert exfil_attack.json()["error"]["code"] == "sandbox_security_error"

        # 6. Cross-tenant access returns 404
        assert outsider_client.post(
            f"/api/projects/{proj['id']}/sandbox/stat",
            json={"questions": inline_qs, "rows": inline_rows, "script": winsor_spearman_script},
        ).status_code == 404
        assert outsider_client.post(
            f"/api/projects/{proj['id']}/sandbox/stat",
            json={"runId": bench_run_id, "script": bench_script},
        ).status_code == 404
        assert pg_engine.pool.checkedout() == 0
