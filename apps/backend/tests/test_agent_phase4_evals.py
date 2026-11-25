"""Acceptance tests for Agent Upgrade Phase 4: trajectory eval harness, small-n null honesty, and CLI fail-closed gates."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import httpx
import pytest

_BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from application.providers import AuthoredProvider
from application.services.autonomous_research import (
    _summarize_receipts_honesty,
    execute_autonomous_research_core,
)
from application.workflow_data_tools import build_inline_sandbox
from evals.eval_agent_trajectories import (
    _select_scenarios,
    main as eval_main,
    run_offline_evaluation,
)
from infrastructure.llm import AgentModelTurn, ModelToolCall


def test_phase4_eval_harness_all_8_scenarios_and_5_metrics_pass_strict(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")

    report = asyncio.run(run_offline_evaluation(authored_root=tmp_path))

    assert report["mode"] == "offline"
    assert report["totals"]["scenarios"] == 8
    assert report["totals"]["cleanScenarios"] == 8
    assert report["strictPassed"] is True

    metrics = report["metrics"]
    assert metrics["trap_recall"] == 1.0
    assert metrics["tool_precision"] >= 0.90
    assert metrics["zero_hallucination_rate"] == 1.0
    assert metrics["reviewer_catch_rate"] == 1.0
    assert metrics["protocol_live_compat"] == 1.0

    scenario_ids = [sc["scenarioId"] for sc in report["scenarios"]]
    assert scenario_ids == [
        "suite_1_4trap_questionnaire",
        "suite_2_skewed_nonparam_separation",
        "suite_3_staggered_did_negative_weight",
        "suite_4a_heavy_censored_km",
        "suite_4b_meta_heterogeneity_egger",
        "suite_5a_weak_iv_2sls",
        "suite_5b_ab_srm_circuit_breaker",
        "suite_6_small_n_null_honesty",
    ]
    assert all(sc["clean"] and not sc["missingTraps"] and not sc["issues"] for sc in report["scenarios"])
    assert len(report["reviewerProbes"]["probes"]) == 3
    assert all(p["caught"] for p in report["reviewerProbes"]["probes"])
    assert [p["provider"] for p in report["protocolLiveCompat"]["providers"]] == [
        "openai",
        "deepseek",
        "qwen",
        "compatible",
        "gemini",
        "anthropic",
    ]
    assert all(p["passed"] for p in report["protocolLiveCompat"]["providers"])


def test_suite6_small_n_null_effect_honesty_forbids_false_ridge_or_significance(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")

    # 1. Pure helper edge cases: None/bool p-values, auxiliary p-values, and intercept-only p=0
    aux_only_receipts = [
        {
            "operator": "test_group_difference",
            "diagnostics": [],
            "metrics": [{"label": "p 值", "value": None}],
        },
        {
            "operator": "fit_linear_regression",
            "diagnostics": ["HETEROSCEDASTICITY_BP_DETECTED:HC3_APPLIED"],
            "metrics": [{"label": "BP 异方差 p", "value": 0.001}],
            "coefficients": {"score_x": {"B": 0.02, "p": 0.78}},
            "table": {
                "headers": ["自变量", "非标准化 B", "稳健 SE", "标准化 β", "t", "p 值", "95% CI", "VIF"],
                "rows": [
                    ["截距 (Intercept)", 3.0, 0.2, None, 15.0, 0.0, "[2.6, 3.4]", None],
                    ["score_x", 0.02, 0.08, 0.05, 0.25, 0.78, "[-0.14, 0.18]", 1.0],
                ],
            },
        },
        {
            "operator": "run_ab_sequential_test",
            "diagnostics": [],
            "metrics": [
                {"label": "双侧 p 值", "value": 0.61},
                {"label": "SRM 检验 p 值", "value": 0.0001},
            ],
        },
        {
            "operator": "run_meta_random_effects",
            "diagnostics": [],
            "metrics": [
                {"label": "双侧 p 值", "value": 0.42},
                {"label": "Egger 偏倚 p 值", "value": 0.01},
            ],
        },
        {
            "operator": "estimate_iv_2sls",
            "diagnostics": [],
            "metrics": [
                {"label": "双侧 p 值", "value": 0.55},
                {"label": "Wu-Hausman 内生性 p 值", "value": 0.01},
            ],
        },
    ]
    honesty_null = _summarize_receipts_honesty(aux_only_receipts, cleaned_n=18)
    assert honesty_null["has_ridge"] is False
    assert honesty_null["has_pen_logit"] is False
    assert honesty_null["has_significant_effect"] is False
    assert honesty_null["is_small_sample_null"] is True

    honesty_sig = _summarize_receipts_honesty(
        [
            {
                "operator": "fit_logistic_regression",
                "diagnostics": ["PENALIZED_LOGIT_L2:0.5"],
                "table": {
                    "headers": ["变量", "Logit B", "SE", "OR (exp(B))", "OR 95% CI", "Wald z", "p 值"],
                    "rows": [
                        ["截距 (Intercept)", -1.2, 0.4, 0.3, "[0.1, 0.8]", -3.0, 0.002],
                        ["score_x", 0.9, 0.25, 2.46, "[1.5, 4.0]", 3.6, 0.0003],
                    ],
                },
            }
        ],
        cleaned_n=18,
    )
    assert honesty_sig["has_pen_logit"] is True
    assert honesty_sig["has_significant_effect"] is True
    assert honesty_sig["is_small_sample_null"] is False

    # 2. End-to-end Suite 6 execution with AuthoredProvider
    suite6 = _select_scenarios("suite_6")[0]
    sb6 = build_inline_sandbox(
        title=suite6.title,
        questions=suite6.questions,
        rows=suite6.rows,
        classification="simulated",
    )
    res = asyncio.run(
        execute_autonomous_research_core(
            project_id="proj-suite6",
            goal=suite6.goal,
            geography=suite6.geography,
            dataset_mode="inline_dataset",
            lease_mode="pi_autonomous",
            max_tool_calls=suite6.max_tool_calls,
            sandbox=sb6,
            dataset_title=suite6.title,
            provider=AuthoredProvider(tmp_path),
        )
    )
    assert res["status"] == "completed"
    assert res["datasetSummary"]["cleanedRowCount"] == 18
    assert res["epistemicGraph"]["completeness"]["passed"] is True
    all_diags = [d for rec in sb6.receipts for d in rec.get("diagnostics", [])]
    assert all_diags == []
    assert suite6.extra_check is not None and suite6.extra_check(res, sb6) == []
    mi = res["motherInsight"]
    mi_blob = json.dumps(mi, ensure_ascii=False)
    assert "经 Ridge/L2 修正" not in mi_blob
    assert "Ridge" not in mi_blob and "L2" not in mi_blob
    assert "小样本" in mi["headline"]
    assert ("样本量较小" in mi["paradoxDetail"] or "n=18" in mi["paradoxDetail"]) and "不显著" in mi["paradoxDetail"]
    assert "n=18<30" in mi["scopeBoundary"]
    assert "SECRET_PII_TOKEN_SUITE6" not in json.dumps(res, ensure_ascii=False)

    # 3. Even if a live model returns a terse/generic summary on small-n null, Phase 4 synthesis enforces honesty
    class TerseNullProvider:
        def __init__(self):
            self.step = 0

        async def agent_step(self, config, key, messages, *, tools=None, tool_choice="auto", limit=196608, timeout=45):
            joined = "\n".join(str(m.get("content", "")) for m in messages if isinstance(m, dict))
            if "<reviewer-tools-ready/>" in joined:
                if not any(m.get("role") == "tool" for m in messages):
                    return AgentModelTurn(
                        text="",
                        reasoning="核验快照",
                        tool_calls=(ModelToolCall(id="rv1", name="verify_evidence_hashes", arguments={}),),
                        usage=None,
                        stop_reason="tool_calls",
                    )
                return AgentModelTurn(
                    text=json.dumps({"summary": "哈希通过", "deliverable": {"decision": "approve"}}),
                    reasoning="通过",
                    tool_calls=(),
                    usage=None,
                    stop_reason="stop",
                )
            self.step += 1
            if self.step == 1:
                return AgentModelTurn(
                    text="",
                    reasoning="检验组间差异与线性回归",
                    tool_calls=(
                        ModelToolCall(id="d1", name="test_group_difference", arguments={"outcome": "outcome_y", "group_var": "group_arm"}),
                        ModelToolCall(id="d2", name="fit_linear_regression", arguments={"outcome": "outcome_y", "predictors": ["score_x"]}),
                    ),
                    usage=None,
                    stop_reason="tool_calls",
                )
            return AgentModelTurn(text='{"summary":"完成探索"}', reasoning="结束", tool_calls=(), usage=None, stop_reason="stop")

    sb6_terse = build_inline_sandbox(
        title=suite6.title,
        questions=suite6.questions,
        rows=suite6.rows,
        classification="simulated",
    )
    res_terse = asyncio.run(
        execute_autonomous_research_core(
            project_id="proj-suite6-terse",
            goal=suite6.goal,
            geography=suite6.geography,
            dataset_mode="inline_dataset",
            lease_mode="pi_autonomous",
            max_tool_calls=16,
            sandbox=sb6_terse,
            dataset_title=suite6.title,
            provider=TerseNullProvider(),
        )
    )
    mi_terse = res_terse["motherInsight"]
    assert "小样本（n=18）" in mi_terse["headline"]
    assert "未达到统计显著水平" in mi_terse["headline"]
    assert mi_terse["mechanism"] == mi_terse["headline"]
    assert "Ridge" not in json.dumps(mi_terse, ensure_ascii=False)


def test_eval_cli_offline_strict_and_live_fail_closed(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")

    json_out = tmp_path / "phase4_scorecard.json"
    rc = eval_main(["--mode", "offline", "--strict", "--json-out", str(json_out)])
    assert rc == 0
    assert json_out.is_file()
    saved = json.loads(json_out.read_text(encoding="utf-8"))
    assert saved["strictPassed"] is True
    assert saved["metrics"]["trap_recall"] == 1.0
    assert saved["metrics"]["tool_precision"] >= 0.90
    assert saved["metrics"]["zero_hallucination_rate"] == 1.0
    assert saved["metrics"]["reviewer_catch_rate"] == 1.0
    assert saved["metrics"]["protocol_live_compat"] == 1.0

    # Trap httpx.AsyncClient to prove fail-closed live mode makes zero network calls
    def _no_network(*_args, **_kwargs):
        raise AssertionError("live fail-closed mode must never open network client")

    monkeypatch.setattr(httpx, "AsyncClient", _no_network)

    # Missing required live flags -> fail closed
    assert eval_main(["--mode", "live"]) != 0
    # Even if OPENAI_API_KEY is present, --mode live must NOT default to it without --api-key-env
    monkeypatch.setenv("OPENAI_API_KEY", "sk-should-never-auto-use")
    assert (
        eval_main([
            "--mode",
            "live",
            "--provider",
            "openai",
            "--base-url",
            "https://api.openai.com/v1",
            "--model",
            "gpt-test",
        ])
        != 0
    )
    # Explicit --api-key-env pointing to unset env var -> fail closed
    monkeypatch.delenv("UNSET_EVAL_LIVE_KEY", raising=False)
    assert (
        eval_main([
            "--mode",
            "live",
            "--provider",
            "openai",
            "--base-url",
            "https://api.openai.com/v1",
            "--model",
            "gpt-test",
            "--api-key-env",
            "UNSET_EVAL_LIVE_KEY",
        ])
        != 0
    )
    # Invalid provider -> fail closed
    monkeypatch.setenv("CUSTOM_EVAL_KEY", "synthetic-only")
    assert (
        eval_main([
            "--mode",
            "live",
            "--provider",
            "unknown_vendor",
            "--base-url",
            "https://example.invalid/v1",
            "--model",
            "m1",
            "--api-key-env",
            "CUSTOM_EVAL_KEY",
        ])
        != 0
    )
    capsys.readouterr()
