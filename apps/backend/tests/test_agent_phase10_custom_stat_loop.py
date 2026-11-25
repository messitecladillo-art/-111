from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(_ROOT / "src"))

from application.providers import AuthoredProvider
from application.services.autonomous_research import (
    build_planted_trap_benchmark,
    execute_autonomous_research_core,
)
from application.workflow_data_tools import build_falsification_reviewer_tools, build_inline_sandbox
from multi_agent.plot_sandbox import (
    build_snapshot_plot_script,
    execute_sandbox_plot,
    execute_sandbox_readonly_stat,
)


def test_register_custom_stat_receipt_passes_hash_audit_export_and_plot() -> None:
    title, questions, rows = build_planted_trap_benchmark()
    sandbox = build_inline_sandbox(title=title, questions=questions, rows=rows, classification="simulated")
    plan = AuthoredProvider._plan_variables_for_sandbox(questions)
    target_var = plan["outcome"] or "q_outcome"
    script = "\n".join([
        "import statistics",
        f"target_var = {json.dumps(target_var)}",
        "questions = DATA.get('questions') or []",
        "rows = DATA.get('rows') or []",
        "qmeta = {}",
        "for q in questions:",
        "    if q.get('variable') == target_var or q.get('id') == target_var:",
        "        qmeta = q",
        "        break",
        "qid = str(qmeta.get('id') or target_var)",
        "vals = [float((r.get('answers') or {})[qid]) for r in rows if isinstance((r.get('answers') or {}).get(qid), (int, float))]",
        "RESULT = {",
        "    'summary': f'采纳意愿定制统计均值 {statistics.mean(vals):.3f} (n={len(vals)})',",
        "    'n_effective': len(vals),",
        "    'metrics': {'样本均值': round(statistics.mean(vals), 4), '样本中位数': round(statistics.median(vals), 4)},",
        "    'diagnostics': ['CUSTOM_TEST_OK'],",
        "}",
    ])
    raw_res = execute_sandbox_readonly_stat(
        script,
        questions=sandbox.questions,
        rows=sandbox.active_rows,
        dataset_sha256=sandbox.dataset_sha256,
        classification=sandbox.classification,
    )
    reg = sandbox.register_custom_stat_receipt(raw_res.data)
    snap_id = str(reg.data["snapshot_id"])
    assert snap_id.startswith("snap_")

    rev_tools = build_falsification_reviewer_tools(sandbox=sandbox, claimed_snapshot_ids=[snap_id])
    audit = rev_tools["verify_evidence_hashes"]([snap_id])
    assert audit.data["auditVerified"] is True
    assert snap_id in audit.data["verifiedSnapshots"]
    assert audit.data["missingOrInvalid"] == []

    exported = sandbox.export_registered_results()
    assert len(exported) == 1
    assert exported[0]["id"] == snap_id
    assert exported[0]["method"] == "custom-stat"
    assert len(exported[0]["headers"]) >= 2
    assert len(exported[0]["rows"]) >= 2

    plot_script, plot_data = build_snapshot_plot_script(sandbox.receipts[-1], chart_kind="bar")
    plot_res = execute_sandbox_plot(plot_script, plot_data)
    assert plot_res["ok"] is True
    assert "<svg" in plot_res["svg"]


def test_autonomous_research_runs_custom_stat_on_bootstrap_goal_and_reviewer_approves(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")
    t_title, t_qs, t_rows = build_planted_trap_benchmark()
    sb = build_inline_sandbox(title=t_title, questions=t_qs, rows=t_rows, classification="simulated")
    provider = AuthoredProvider(tmp_path)
    run = asyncio.run(
        execute_autonomous_research_core(
            project_id="phase10-custom-stat-test",
            goal="检验县域服务满意度均值与 Bootstrap 自助法 95% 置信区间及人群差异",
            geography="县域",
            dataset_mode="inline_dataset",
            lease_mode="pi_autonomous",
            max_tool_calls=28,
            sandbox=sb,
            dataset_title=t_title,
            provider=provider,
        )
    )

    assert run["status"] == "completed"
    assert run["falsificationReport"]["decision"] == "approve"
    ops = [step.get("operator") for step in run["reasoningTrace"]]
    assert "run_custom_stat_script" in ops

    custom_snaps = [r for r in run["registeredResults"] if r.get("method") == "custom-stat"]
    assert len(custom_snaps) == 1
    custom_snap = custom_snaps[0]
    node_ids = {node["id"] for node in run["epistemicGraph"]["nodes"]}
    assert custom_snap["id"] in node_ids
    assert custom_snap["n"] >= 200
    assert len(custom_snap["headers"]) >= 2
    assert len(custom_snap["rows"]) >= 4

    visible_blob = json.dumps(
        {
            "motherInsight": run["motherInsight"],
            "falsificationSummary": run["falsificationReport"]["summary"],
            "checks": run["falsificationReport"]["consistencyChecks"],
        },
        ensure_ascii=False,
    )
    for forbidden in ("SHA-256", "record_pivot", "mutate_epistemic_graph", "verify_evidence_hashes", "MIN_CELL_N"):
        assert forbidden not in visible_blob
    assert "结论：approve" not in visible_blob
