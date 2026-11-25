"""Tests for StatisticalSandbox 9 operators, EpistemicGraph, and 4-trap autonomous loop."""

from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest

from application.providers import AuthoredProvider
from application.services.autonomous_research import build_planted_trap_benchmark, execute_autonomous_research_core
from application.workflow_data_tools import build_inline_sandbox
from multi_agent.epistemic_graph import EpistemicGraph, EpistemicNode
from multi_agent.statistical_isa import _fmt_p


def test_statistical_sandbox_9_operators_and_privacy_withholding(tmp_path):
    title, questions, rows = build_planted_trap_benchmark()
    sandbox = build_inline_sandbox(
        title=title,
        questions=questions,
        rows=rows,
        classification="simulated",
        ref="benchmark:planted-4-traps",
    )

    # 1. Inspect distribution
    r1 = sandbox.inspect_distribution()
    assert r1.data["n_effective"] == 240
    assert "受访者保密建议" not in str(r1.data)

    # 2. Apply cleaning (catches 14 planted straightliners)
    r2 = sandbox.apply_cleaning_pipeline(min_valid_ratio=0.70, drop_straightliners=True, min_likert_for_straightline=4)
    assert r2.data["n_effective"] == 226
    assert any(d == "STRAIGHTLINERS_REMOVED:14" for d in r2.data["diagnostics"])

    # 3. Initial reliability fails due to toxic reverse item Q_trap
    scale_items = ["trust_1", "trust_2", "trust_3", "Q_trap"]
    r3 = sandbox.purify_scale_reliability(construct_name="service_perception", variables=scale_items, drop_negative_or_low_citc=False)
    alpha_before = r3.data["metrics"][0]["value"]
    assert alpha_before is not None and alpha_before < 0.55
    assert "NEGATIVE_CITC_ITEM:Q_trap" in r3.data["diagnostics"]

    # 4. Purified scale recovers alpha >= 0.75 & synthesizes construct variable
    r4 = sandbox.purify_scale_reliability(construct_name="service_perception", variables=scale_items, drop_negative_or_low_citc=True)
    alpha_after = r4.data["metrics"][1]["value"]
    assert alpha_after is not None and alpha_after >= 0.75
    assert r4.data["construct_variable"] == "construct:service_perception"
    assert r4.data["dropped_items"] == ["Q_trap"]

    # 5. KMO factor suitability
    r5 = sandbox.factor_suitability_kmo(["trust_1", "trust_2", "trust_3"])
    assert r5.data["metrics"][0]["value"] > 0.60

    # 6. Group difference test
    r6 = sandbox.test_group_difference("adopt_intention", "living_mode")
    assert r6.data["operator"] == "test_group_difference" and len(r6.data["table"]["rows"]) == 2

    # 7. Collinear OLS triggers HIGH_VIF, Ridge stabilizes
    r7 = sandbox.fit_linear_regression("adopt_intention", ["construct:service_perception", "tech_ease", "ui_fluency", "subsidy_support"], ridge_lambda=0.0)
    assert any(d.startswith("HIGH_VIF_COLLINEARITY:") for d in r7.data["diagnostics"])
    r7_ridge = sandbox.fit_linear_regression("adopt_intention", ["construct:service_perception", "tech_ease", "ui_fluency", "subsidy_support"], ridge_lambda=1.0)
    assert any(d.startswith("RIDGE_STABILIZED:") for d in r7_ridge.data["diagnostics"])

    # 8. Logistic regression + penalized L2
    r8 = sandbox.fit_logistic_regression("renew_tier", ["construct:service_perception", "tech_ease", "subsidy_support"], positive_code="1", l2_penalty=0.5)
    assert any(d.startswith("PENALIZED_LOGIT_L2:") for d in r8.data["diagnostics"])

    # 9. Mediation & Subgroup Simpson's Paradox reversal
    r9_med = sandbox.test_mediation_effect("tech_ease", "construct:service_perception", "adopt_intention", bootstrap_samples=80, seed=42)
    assert r9_med.data["n_effective"] == 226
    r9_sub = sandbox.scan_subgroup_heterogeneity("adopt_intention", "construct:service_perception", ["living_mode", "region_tier"])
    assert "SUBGROUP_SIGN_REVERSAL:living_mode" in r9_sub.data["diagnostics"]
    rev = r9_sub.data["reversals"][0]
    assert rev["positive_stratum"]["slope"] > 0.4 and rev["negative_stratum"]["slope"] < -0.4

    deliverable = sandbox.build_deliverable()
    assert len(deliverable["charts"]) >= 5
    for ch in deliverable["charts"]:
        assert len(ch["categories"]) == len(ch["values"]) >= 1


def test_epistemic_graph_dirty_propagation_and_pivot():
    g = EpistemicGraph(project_id="proj-1")
    g.upsert_node(node_id="q1", kind="question", label="Q1")
    g.upsert_node(node_id="h1", kind="hypothesis", label="H1")
    g.upsert_node(node_id="c1", kind="claim", label="Claim 1", status="verified", snapshot_ids=["snap_1"])
    g.upsert_node(node_id="snap_2", kind="stat_snapshot", label="Pivot Snap", status="verified", snapshot_ids=["snap_2"])
    g.add_edge("q1", "h1", "tested_by")
    g.add_edge("h1", "c1", "supports")

    dirty = g.record_pivot(
        old_node_id="h1",
        new_node=EpistemicNode(id="c2", kind="mother_insight", label="Subgroup reversal", status="verified", snapshot_ids=["snap_2"]),
        reason="Simpson's Paradox",
        evidence_snapshot_id="snap_2",
        refute_old=True,
    )
    assert "c1" in dirty and g.nodes["c1"].status == "dirty" and g.nodes["h1"].status == "refuted"
    g.nodes["c1"].status = "pivoted"
    f_node = g.upsert_node(node_id="f1", kind="falsification_check", label="Check", status="verified")
    g.add_edge("c2", f_node.id, "falsified_by")
    audit = g.audit_completeness()
    assert audit["passed"] is True and audit["pivotCount"] == 1


def test_autonomous_end_to_end_4_traps_with_authored_provider(tmp_path, monkeypatch):
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")
    title, questions, rows = build_planted_trap_benchmark()
    sandbox = build_inline_sandbox(title=title, questions=questions, rows=rows, classification="simulated")
    provider = AuthoredProvider(tmp_path)

    run = asyncio.run(
        execute_autonomous_research_core(
            project_id="demo-proj",
            goal="县域老年智慧助餐与守护服务采纳机制调研",
            geography="县域",
            dataset_mode="planted_trap_benchmark",
            lease_mode="pi_autonomous",
            max_tool_calls=28,
            sandbox=sandbox,
            dataset_title=title,
            provider=provider,
        )
    )

    assert run["status"] == "completed"
    assert run["datasetSummary"]["rawRowCount"] == 240
    assert run["datasetSummary"]["cleanedRowCount"] == 226
    ops = [step["operator"] for step in run["reasoningTrace"]]
    assert "purify_scale_reliability" in ops
    assert "fit_linear_regression" in ops
    assert "scan_subgroup_heterogeneity" in ops
    assert any("自主量表净化" in step["pivotTaken"] for step in run["reasoningTrace"])
    assert any("Ridge" in step["pivotTaken"] for step in run["reasoningTrace"])
    assert any("辛普森悖论" in step["pivotTaken"] for step in run["reasoningTrace"])
    assert run["epistemicGraph"]["completeness"]["passed"] is True
    assert run["falsificationReport"]["decision"] == "approve"
    assert len(run["registeredResults"]) >= 7
    assert "受访者保密建议" not in str(run)


def test_nonparametric_fallback_and_breusch_pagan_hc3():
    questions = [
        {
            "id": "q_grp2",
            "variable": "tier2",
            "text": "试点组别",
            "type": "single",
            "choices": [{"code": "a", "label": "对照组"}, {"code": "b", "label": "干预组"}],
        },
        {
            "id": "q_grp3",
            "variable": "tier3",
            "text": "区域层级",
            "type": "single",
            "choices": [
                {"code": "east", "label": "东部"},
                {"code": "mid", "label": "中部"},
                {"code": "west", "label": "西部"},
            ],
        },
        {"id": "q_spend", "variable": "spend", "text": "月度消费额", "type": "number"},
        {"id": "q_x", "variable": "scale_x", "text": "供给强度", "type": "number"},
        {"id": "q_y", "variable": "resp_y", "text": "活跃响应", "type": "number"},
    ]
    rows = []
    spend_a = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190]
    spend_b = [210, 230, 250, 280, 310, 340, 390, 450, 2600, 4800]
    tier3_cycle = ["east", "mid", "west"]
    for idx in range(20):
        x_val = float((idx % 10) + 1)
        # Quadratic heteroscedastic disturbance growing sharply with x_val
        noise = (0.35 if idx % 2 == 0 else -0.35) * (x_val ** 2)
        y_val = 2.0 + 1.8 * x_val + noise
        grp2 = "a" if idx < 10 else "b"
        sp_val = spend_a[idx] if idx < 10 else spend_b[idx - 10]
        rows.append({
            "answers": {
                "q_grp2": grp2,
                "q_grp3": tier3_cycle[idx % 3],
                "q_spend": sp_val,
                "q_x": x_val,
                "q_y": y_val,
            },
            "visibility": {"q_grp2": True, "q_grp3": True, "q_spend": True, "q_x": True, "q_y": True},
        })

    sandbox = build_inline_sandbox(title="非参与异方差回归测试", questions=questions, rows=rows, classification="simulated")

    # 1. Strongly skewed continuous outcome automatically falls back to Mann-Whitney U
    res_mw = sandbox.test_group_difference("spend", "tier2", method="auto")
    assert "NONPARAMETRIC_AUTO_FALLBACK:SKEWED_OUTCOME" in res_mw.data["diagnostics"]
    assert res_mw.data["method"] == "mann_whitney"
    assert res_mw.data["table"]["headers"] == ["分组", "有效样本 n", "中位数", "四分位距 IQR", "均值"]
    assert res_mw.data["metrics"][0]["label"] == "Mann-Whitney U"

    # 2. 3-group explicit Kruskal-Wallis H
    res_kw = sandbox.test_group_difference("spend", "tier3", method="kruskal_wallis")
    assert res_kw.data["method"] == "kruskal_wallis"
    assert res_kw.data["metrics"][0]["label"] == "Kruskal-Wallis H"
    kw_p = res_kw.data["metrics"][2]["value"]
    assert kw_p is not None and 0.0 <= kw_p <= 1.0

    # 3. Heteroscedastic OLS triggers Breusch-Pagan HC3 upgrade
    res_hc3 = sandbox.fit_linear_regression("resp_y", ["scale_x"], ridge_lambda=0.0, cov_type="auto")
    assert "HETEROSCEDASTICITY_BP_DETECTED:HC3_APPLIED" in res_hc3.data["diagnostics"]
    assert res_hc3.data["cov_estimator"] == "HC3"
    assert res_hc3.data["breusch_pagan_p"] < 0.05
    assert res_hc3.data["table"]["headers"][2] == "HC3 稳健 SE"

    res_hc1 = sandbox.fit_linear_regression("resp_y", ["scale_x"], ridge_lambda=0.0, cov_type="hc1")
    assert res_hc1.data["cov_estimator"] == "HC1"
    assert res_hc3.data["coefficients"]["scale_x"]["SE"] > res_hc1.data["coefficients"]["scale_x"]["SE"]


def test_harman_cmb_runs_test_and_correlation_matrix():
    questions = [
        {"id": "q1", "variable": "v1", "text": "题项1", "type": "number"},
        {"id": "q2", "variable": "v2", "text": "题项2", "type": "number"},
        {"id": "q3", "variable": "v3", "text": "题项3", "type": "number"},
        {"id": "q4", "variable": "v4", "text": "题项4", "type": "number"},
    ]
    rows = []
    # Monotonically increasing collinear rows guarantee both single-factor CMB > 40% AND clustered Runs z < -1.96
    for i in range(24):
        base = float(i + 1)
        rows.append({
            "answers": {
                "q1": base,
                "q2": base * 1.05 + (0.1 if i % 2 == 0 else -0.1),
                "q3": base * 0.95 + (0.05 if i % 3 == 0 else -0.05),
                "q4": base * 1.12 + 0.2,
            },
            "visibility": {"q1": True, "q2": True, "q3": True, "q4": True},
        })

    sb = build_inline_sandbox(title="CMB与相关性矩阵测试", questions=questions, rows=rows, classification="simulated")

    cmb = sb.check_common_method_bias(["v1", "v2", "v3", "v4"])
    assert "COMMON_METHOD_BIAS_RISK_GE_40PCT" in cmb.data["diagnostics"]
    assert "NON_RANDOM_RUNS_SEQUENCE" in cmb.data["diagnostics"]
    assert cmb.data["harman_pct"] >= 40.0
    assert abs(cmb.data["z_runs"]) > 1.96
    assert cmb.data["chart"]["kind"] == "bar"

    corr_sp = sb.compute_correlation_matrix(["v1", "v2", "v3"], method="spearman")
    assert any(d.startswith("HIGH_PAIRWISE_CORRELATION:v1~v2") for d in corr_sp.data["diagnostics"])
    assert corr_sp.data["chart"]["kind"] == "bar"

    med = sb.test_mediation_effect("v1", "v2", "v4", bootstrap_samples=60, seed=7)
    assert med.data["chart"]["kind"] == "bar"
    assert len(med.data["chart"]["values"]) == 3

    reg = sb.export_registered_results()
    assert any(r["method"] == "quality-control" for r in reg)
    assert any(r["method"] == "spearman" for r in reg)


def test_staggered_did_att_and_conformal_prediction_band():
    # 1. Staggered DID panel (3 cohorts: g=0 never-treated, g=2 early surging, g=3 late modest)
    did_questions = [
        {"id": "q_y", "variable": "outcome", "text": "产出得分", "type": "number"},
        {"id": "q_t", "variable": "period", "text": "调研期次", "type": "number"},
        {"id": "q_g", "variable": "cohort", "text": "干预队列", "type": "number"},
    ]
    did_rows = []
    cohort_effects = {
        0: {1: 10.5, 2: 11.0, 3: 11.5, 4: 12.0},
        2: {1: 12.5, 2: 16.0, 3: 22.5, 4: 30.0},
        3: {1: 14.5, 2: 15.0, 3: 17.5, 4: 18.0},
    }
    for g_val, t_map in cohort_effects.items():
        for t_val, mean_y in t_map.items():
            for rep in (-0.2, 0.0, 0.2):
                did_rows.append({
                    "answers": {"q_y": mean_y + rep, "q_t": float(t_val), "q_g": float(g_val)},
                    "visibility": {"q_y": True, "q_t": True, "q_g": True},
                })

    sb_did = build_inline_sandbox(title="交错DID测试", questions=did_questions, rows=did_rows, classification="simulated")
    did_res = sb_did.estimate_staggered_did_att("outcome", "period", "cohort", never_treated_value=0.0)
    assert "TWFE_NEGATIVE_WEIGHT_DISTORTION" in did_res.data["diagnostics"]
    assert did_res.data["overall_att"] > 3.5
    assert did_res.data["cohort_count"] == 2
    assert did_res.data["forbidden_pairs"] >= 1
    assert did_res.data["chart"]["kind"] == "bar"

    # 2. Split Conformal with heavy-tail outliers triggering both calibration coverage and high-uncertainty flag
    conf_questions = [
        {"id": "q_y", "variable": "y", "text": "响应值", "type": "number"},
        {"id": "q_x1", "variable": "x1", "text": "特征1", "type": "number"},
        {"id": "q_x2", "variable": "x2", "text": "特征2", "type": "number"},
    ]
    conf_rows = []
    for i in range(32):
        x1 = float((i % 8) - 3) * 0.25
        x2 = float((i % 5) - 2) * 0.20
        outlier = 4.5 if i in (2, 11, 20, 29) else (0.15 if i % 2 == 0 else -0.15)
        y_val = 2.0 + 0.4 * x1 - 0.3 * x2 + outlier
        conf_rows.append({
            "answers": {"q_y": y_val, "q_x1": x1, "q_x2": x2},
            "visibility": {"q_y": True, "q_x1": True, "q_x2": True},
        })

    sb_conf = build_inline_sandbox(title="Conformal预测带测试", questions=conf_questions, rows=conf_rows, classification="simulated")
    conf_res = sb_conf.compute_conformal_prediction_band("y", ["x1", "x2"], alpha=0.10, calibration_ratio=0.35)
    assert "CONFORMAL_CALIBRATED_COVERAGE_OK" in conf_res.data["diagnostics"]
    assert "CONFORMAL_WIDE_INTERVAL_HIGH_UNCERTAINTY" in conf_res.data["diagnostics"]
    assert conf_res.data["q_hat"] > 0.0
    assert conf_res.data["empirical_coverage"] >= 0.80
    assert conf_res.data["n_train"] + conf_res.data["n_cal"] == 32
    assert conf_res.data["chart"]["kind"] == "bar"

    assert any(r["method"] == "cs-did" for r in sb_did.export_registered_results())
    assert any(r["method"] == "conformal" for r in sb_conf.export_registered_results())


def test_kano_better_worse_and_sharp_rdd_operators():
    # 1. Kano paired attributes: Feature 1 = A (Attractive), Feature 2 = M (Must-be), Feature 3 = high R/Q trigger
    kano_questions = [
        {"id": "k_f1_p", "variable": "ai_nav_pos", "text": "AI导诊正向", "type": "number"},
        {"id": "k_f1_n", "variable": "ai_nav_neg", "text": "AI导诊反向", "type": "number"},
        {"id": "k_f2_p", "variable": "hygiene_pos", "text": "洁净安全正向", "type": "number"},
        {"id": "k_f2_n", "variable": "hygiene_neg", "text": "洁净安全反向", "type": "number"},
        {"id": "k_f3_p", "variable": "noisy_pos", "text": "弹窗推送正向", "type": "number"},
        {"id": "k_f3_n", "variable": "noisy_neg", "text": "弹窗推送反向", "type": "number"},
    ]
    kano_rows = []
    for i in range(25):
        # f1 mostly (5, 3) -> A; (5, 1) -> O for a few so Better is high
        f1_p, f1_n = (5, 1) if i < 6 else (5, 3)
        # f2 mostly (4, 1) -> M
        f2_p, f2_n = (5, 1) if i < 4 else (4, 1)
        # f3 has 8/25 = 32% Reverse/Questionable answers ((1, 4) -> R, (5, 5) -> Q)
        f3_p, f3_n = ((1, 4) if i % 2 == 0 else (5, 5)) if i < 8 else (3, 3)
        kano_rows.append({
            "answers": {
                "k_f1_p": f1_p,
                "k_f1_n": f1_n,
                "k_f2_p": f2_p,
                "k_f2_n": f2_n,
                "k_f3_p": f3_p,
                "k_f3_n": f3_n,
            },
            "visibility": {q["id"]: True for q in kano_questions},
        })

    sb_kano = build_inline_sandbox(title="Kano需求属性测试", questions=kano_questions, rows=kano_rows, classification="simulated")
    kano_res = sb_kano.run_kano_better_worse(
        [
            {"feature": "AI智能导诊", "functional_var": "ai_nav_pos", "dysfunctional_var": "ai_nav_neg"},
            {"feature": "病房洁净安全", "functional_var": "hygiene_pos", "dysfunctional_var": "hygiene_neg"},
            {"feature": "高频弹窗推送", "functional_var": "noisy_pos", "dysfunctional_var": "noisy_neg"},
        ],
        scale_max=5,
    )
    assert "KANO_HIGH_REVERSE_OR_QUESTIONABLE" in kano_res.data["diagnostics"]
    assert "KANO_INSUFFICIENT_PAIRED_N" not in kano_res.data["diagnostics"]
    feats = {item["feature"]: item for item in kano_res.data["feature_results"]}
    assert feats["AI智能导诊"]["dominant"] == "A"
    assert feats["AI智能导诊"]["better"] == 1.0
    assert feats["病房洁净安全"]["dominant"] == "M"
    assert feats["病房洁净安全"]["worse"] == -1.0
    assert feats["高频弹窗推送"]["rq_ratio"] > 0.15
    assert kano_res.data["chart"]["kind"] == "bar"
    assert any(r["method"] == "kano" for r in sb_kano.export_registered_results())

    # 2. Sharp RDD with true jump tau = 2.0 at cutoff = 60.0 (balanced density)
    rdd_questions = [
        {"id": "q_score", "variable": "score", "text": "考核分值", "type": "number"},
        {"id": "q_out", "variable": "grant_score", "text": "绩效产出", "type": "number"},
    ]
    rdd_rows = []
    for i in range(-30, 30):
        # Symmetric grid around 60.0 skipping 0
        offset = float(i) * 0.8 + (0.4 if i >= 0 else -0.4)
        x_val = 60.0 + offset
        treat = 1.0 if x_val >= 60.0 else 0.0
        noise = 0.08 * ((i % 3) - 1)
        y_val = 10.0 + 0.15 * offset + 2.0 * treat - 0.05 * treat * offset + noise
        rdd_rows.append({
            "answers": {"q_score": x_val, "q_out": y_val},
            "visibility": {"q_score": True, "q_out": True},
        })

    sb_rdd = build_inline_sandbox(title="Sharp RDD断点回归测试", questions=rdd_questions, rows=rdd_rows, classification="simulated")
    rdd_res = sb_rdd.estimate_rdd_sharp_local("grant_score", "score", cutoff=60.0)
    assert abs(rdd_res.data["tau"] - 2.0) < 0.35
    assert rdd_res.data["p_value"] < 0.01
    assert "RDD_DENSITY_MANIPULATION_WARNING" not in rdd_res.data["diagnostics"]
    assert len(rdd_res.data["table"]["rows"]) == 3
    assert rdd_res.data["chart"]["kind"] == "bar"

    # 3. Manipulated bunching right above cutoff triggers RDD_DENSITY_MANIPULATION_WARNING
    bunched_rows = []
    for i in range(12):
        bunched_rows.append({
            "answers": {"q_score": 52.0 + i * 0.6, "q_out": 8.0 + 0.1 * i},
            "visibility": {"q_score": True, "q_out": True},
        })
    for i in range(44):
        bunched_rows.append({
            "answers": {"q_score": 60.05 + (i % 12) * 0.45, "q_out": 12.2 + 0.08 * (i % 5)},
            "visibility": {"q_score": True, "q_out": True},
        })
    sb_bunch = build_inline_sandbox(title="RDD断点操纵预警测试", questions=rdd_questions, rows=bunched_rows, classification="simulated")
    bunch_res = sb_bunch.estimate_rdd_sharp_local("grant_score", "score", cutoff=60.0, bandwidth=10.0)
    assert "RDD_DENSITY_MANIPULATION_WARNING" in bunch_res.data["diagnostics"]
    assert abs(bunch_res.data["z_density"]) > 2.58
    assert any(r["method"] == "rdd" for r in sb_rdd.export_registered_results())


def test_psm_balance_att_and_entropy_topsis_operators():
    # 1. Confounded selection bias: treated group has higher age & income covariates, true ATT = 2.0
    psm_questions = [
        {"id": "q_y", "variable": "outcome", "text": "消费满意度", "type": "number"},
        {"id": "q_t", "variable": "treated", "text": "政策干预", "type": "number"},
        {"id": "q_x1", "variable": "income", "text": "家庭收入阶梯", "type": "number"},
        {"id": "q_x2", "variable": "digital", "text": "数字素养分", "type": "number"},
    ]
    psm_rows = []
    # 20 treated with x1 ~ 3..7, x2 ~ 3..6
    for i in range(20):
        x1 = 3.0 + (i % 5) * 0.9
        x2 = 3.2 + ((i * 2) % 5) * 0.7
        noise = 0.05 * ((i % 3) - 1)
        y = 4.0 + 0.8 * x1 + 0.6 * x2 + 2.0 + noise
        psm_rows.append({
            "answers": {"q_y": y, "q_t": 1.0, "q_x1": x1, "q_x2": x2},
            "visibility": {q["id"]: True for q in psm_questions},
        })
    # 45 controls spanning both low & overlapping region so caliper finds tight matches
    for i in range(45):
        x1 = 1.2 + (i % 9) * 0.72
        x2 = 1.4 + ((i * 3) % 9) * 0.56
        noise = 0.05 * ((i % 3) - 1)
        y = 4.0 + 0.8 * x1 + 0.6 * x2 + noise
        psm_rows.append({
            "answers": {"q_y": y, "q_t": 0.0, "q_x1": x1, "q_x2": x2},
            "visibility": {q["id"]: True for q in psm_questions},
        })

    sb_psm = build_inline_sandbox(title="PSM倾向得分匹配测试", questions=psm_questions, rows=psm_rows, classification="simulated")
    psm_res = sb_psm.run_psm_balance_att("outcome", "treated", ["income", "digital"], caliper=0.5)
    assert psm_res.data["matched_pairs"] >= 10
    assert psm_res.data["max_smd_after"] < psm_res.data["max_smd_before"]
    assert abs(psm_res.data["att"] - 2.0) < 0.85
    assert psm_res.data["p_value"] < 0.05
    assert psm_res.data["chart"]["kind"] == "bar"
    assert any(r["method"] == "psm" for r in sb_psm.export_registered_results())

    # 2. Entropy TOPSIS across 5 cities × 3 indicators (positive, negative cost, near-constant low-dispersion)
    top_questions = [
        {"id": "q_city", "variable": "city", "text": "城市片区", "type": "single"},
        {"id": "q_pos", "variable": "coverage", "text": "服务覆盖率", "type": "number"},
        {"id": "q_cost", "variable": "wait_cost", "text": "排队成本", "type": "number"},
        {"id": "q_flat", "variable": "const_idx", "text": "趋同基线指标", "type": "number"},
    ]
    city_data = [
        ("城南示范区", 95.0, 2.0, 5.0),
        ("高新园区", 82.0, 4.0, 5.0),
        ("老城中心区", 68.0, 6.5, 5.0),
        ("近郊发展区", 52.0, 8.5, 5.0),
        ("远郊生态区", 35.0, 12.0, 5.0),
    ]
    top_rows = []
    for cname, c_pos, c_cost, c_flat in city_data:
        for delta in (-0.5, 0.5):
            top_rows.append({
                "answers": {"q_city": cname, "q_pos": c_pos + delta, "q_cost": c_cost, "q_flat": c_flat},
                "visibility": {q["id"]: True for q in top_questions},
            })

    sb_top = build_inline_sandbox(title="熵权TOPSIS评价测试", questions=top_questions, rows=top_rows, classification="simulated")
    top_res = sb_top.compute_entropy_topsis_rank("city", ["coverage", "wait_cost", "const_idx"], negative_indicators=["wait_cost"])
    assert "TOPSIS_LOW_DISPERSION_INDICATOR" in top_res.data["diagnostics"]
    assert abs(sum(top_res.data["weights"].values()) - 1.0) < 1e-3
    assert top_res.data["weights"]["const_idx"] < 0.01
    ranks = top_res.data["rankings"]
    assert len(ranks) == 5
    assert ranks[0]["entity"] == "城南示范区"
    assert ranks[-1]["entity"] == "远郊生态区"
    assert ranks[0]["closeness"] > ranks[1]["closeness"] > ranks[2]["closeness"] > ranks[3]["closeness"] > ranks[4]["closeness"]
    assert top_res.data["chart"]["kind"] == "bar"
    assert any(r["method"] == "topsis" for r in sb_top.export_registered_results())


def test_iv_2sls_and_ab_sequential_operators():
    # 1. IV-2SLS: unobserved confounder U biases OLS upward; Z shifts X cleanly, true LATE beta = 1.5
    iv_questions = [
        {"id": "q_y", "variable": "wage", "text": "收入产出", "type": "number"},
        {"id": "q_x", "variable": "edu", "text": "培育成效", "type": "number"},
        {"id": "q_z", "variable": "subsidy", "text": "培训补贴工具变量", "type": "number"},
        {"id": "q_c", "variable": "exp", "text": "工作经验", "type": "number"},
    ]
    iv_rows = []
    for i in range(80):
        c = float(i % 8) - 3.5
        z = float((i * 7) % 11) - 5.0
        u = float((i * 3) % 9) - 4.0  # Unobserved ability confounder
        x = 1.0 + 0.9 * z + 0.6 * u + 0.25 * c + 0.05 * ((i % 5) - 2)
        y = 3.0 + 1.5 * x + 1.1 * u + 0.4 * c + 0.04 * (((i + 1) % 5) - 2)
        iv_rows.append({
            "answers": {"q_y": y, "q_x": x, "q_z": z, "q_c": c},
            "visibility": {q["id"]: True for q in iv_questions},
        })
    sb_iv = build_inline_sandbox(title="IV-2SLS因果识别测试", questions=iv_questions, rows=iv_rows, classification="simulated")
    iv_res = sb_iv.estimate_iv_2sls("wage", "edu", "subsidy", controls=["exp"])
    assert "IV_STRONG_FIRST_STAGE" in iv_res.data["diagnostics"]
    assert "IV_ENDOGENEITY_CONFIRMED" in iv_res.data["diagnostics"]
    assert iv_res.data["first_stage_f"] > 10.0
    assert abs(iv_res.data["beta_iv"] - 1.5) < 0.25
    assert iv_res.data["beta_ols"] > iv_res.data["beta_iv"] + 0.2
    assert iv_res.data["p_iv"] < 0.01
    assert any(r["method"] == "iv" for r in sb_iv.export_registered_results())

    # Weak-instrument diagnostic check (near-orthogonal Z to X)
    weak_rows = []
    for i in range(60):
        z_w = float((i * 5) % 7) - 3.0
        x_w = float((i * 3) % 10) - 4.5
        y_w = 2.0 + 0.5 * x_w + 0.05 * ((i % 3) - 1)
        weak_rows.append({
            "answers": {"q_y": y_w, "q_x": x_w, "q_z": z_w, "q_c": 0.0},
            "visibility": {q["id"]: True for q in iv_questions},
        })
    sb_weak = build_inline_sandbox(title="弱工具检测测试", questions=iv_questions, rows=weak_rows, classification="simulated")
    weak_res = sb_weak.estimate_iv_2sls("wage", "edu", "subsidy")
    assert "WEAK_INSTRUMENT_F_LT_10" in weak_res.data["diagnostics"]
    assert weak_res.data["first_stage_f"] < 10.0

    # 2. Sequential A/B Testing: balanced OBF significant + SRM & guardrail alerts
    ab_questions = [
        {"id": "q_t", "variable": "variant", "text": "实验分组", "type": "number"},
        {"id": "q_y", "variable": "conv", "text": "转化率指数", "type": "number"},
        {"id": "q_g", "variable": "latency_score", "text": "响应体验护栏", "type": "number"},
    ]
    ab_rows = []
    for i in range(40):
        ab_rows.append({
            "answers": {"q_t": 0.0, "q_y": 10.0 + (i % 4) * 0.4, "q_g": 85.0 + (i % 3)},
            "visibility": {q["id"]: True for q in ab_questions},
        })
        ab_rows.append({
            "answers": {"q_t": 1.0, "q_y": 13.5 + (i % 4) * 0.4, "q_g": 84.8 + (i % 3)},
            "visibility": {q["id"]: True for q in ab_questions},
        })
    sb_ab = build_inline_sandbox(title="序贯A/B检验测试", questions=ab_questions, rows=ab_rows, classification="simulated")
    ab_res = sb_ab.run_ab_sequential_test("variant", "conv", guardrail="latency_score", info_fraction=0.6)
    assert "AB_SRM_BALANCED" in ab_res.data["diagnostics"]
    assert "AB_SEQUENTIAL_SIGNIFICANT" in ab_res.data["diagnostics"]
    assert "AB_GUARDRAIL_DEGRADATION" not in ab_res.data["diagnostics"]
    assert abs(ab_res.data["delta"] - 3.5) < 0.05
    assert ab_res.data["p_value"] < 0.001
    assert any(r["method"] == "ab" for r in sb_ab.export_registered_results())

    # SRM imbalance + significant guardrail degradation
    srm_rows = []
    for i in range(15):
        srm_rows.append({"answers": {"q_t": 0.0, "q_y": 10.0 + (i % 3) * 0.2, "q_g": 90.0 + (i % 2)}, "visibility": {q["id"]: True for q in ab_questions}})
    for i in range(60):
        srm_rows.append({"answers": {"q_t": 1.0, "q_y": 12.0 + (i % 3) * 0.2, "q_g": 78.0 + (i % 2)}, "visibility": {q["id"]: True for q in ab_questions}})
    sb_srm = build_inline_sandbox(title="A/B护栏与SRM预警测试", questions=ab_questions, rows=srm_rows, classification="simulated")
    srm_res = sb_srm.run_ab_sequential_test("variant", "conv", guardrail="latency_score", info_fraction=1.0)
    assert "AB_SRM_DETECTED_P_LT_001" in srm_res.data["diagnostics"]
    assert "AB_GUARDRAIL_DEGRADATION" in srm_res.data["diagnostics"]


def test_survival_km_logrank_and_meta_random_effects_operators():
    # 1. Kaplan-Meier + Log-Rank: treatment arm retains longer survival + heavy censoring arm check
    surv_questions = [
        {"id": "q_t", "variable": "months", "text": "留存月数", "type": "number"},
        {"id": "q_e", "variable": "churned", "text": "流失事件", "type": "number"},
        {"id": "q_g", "variable": "arm", "text": "干预队列", "type": "single"},
    ]
    surv_rows = []
    # Control arm: early churn events between month 2..8
    for i in range(15):
        surv_rows.append({"answers": {"q_t": 2.0 + (i % 6) * 1.1, "q_e": 1.0 if i < 12 else 0.0, "q_g": "常规服务组"}, "visibility": {q["id"]: True for q in surv_questions}})
    # Treated arm: prolonged survival up to month 12..18, mostly censored
    for i in range(15):
        surv_rows.append({"answers": {"q_t": 11.0 + (i % 6) * 1.2, "q_e": 1.0 if i < 2 else 0.0, "q_g": "AI伴随照护组"}, "visibility": {q["id"]: True for q in surv_questions}})

    sb_surv = build_inline_sandbox(title="KM生存分析测试", questions=surv_questions, rows=surv_rows, classification="simulated")
    surv_res = sb_surv.estimate_kaplan_meier_logrank("months", "churned", "arm")
    assert "SURVIVAL_LOGRANK_SIGNIFICANT" in surv_res.data["diagnostics"]
    assert "SURVIVAL_HEAVY_CENSORING_GT_50PCT" in surv_res.data["diagnostics"]
    assert surv_res.data["p_value"] < 0.01
    assert abs(surv_res.data["rmst_diff"]) > 1.0
    assert any(r["method"] == "survival" for r in sb_surv.export_registered_results())

    # 2. DerSimonian-Laird Random-Effects Meta + I^2 + Egger asymmetry
    meta_questions = [
        {"id": "q_s", "variable": "study", "text": "纳入研究", "type": "single"},
        {"id": "q_y", "variable": "effect", "text": "效应量", "type": "number"},
        {"id": "q_se", "variable": "se", "text": "标准误", "type": "number"},
    ]
    meta_rows = [
        {"answers": {"q_s": "Liu_2022_East", "q_y": 0.25, "q_se": 0.05}, "visibility": {q["id"]: True for q in meta_questions}},
        {"answers": {"q_s": "Chen_2023_North", "q_y": 0.42, "q_se": 0.07}, "visibility": {q["id"]: True for q in meta_questions}},
        {"answers": {"q_s": "Wang_2024_South", "q_y": 0.78, "q_se": 0.14}, "visibility": {q["id"]: True for q in meta_questions}},
        {"answers": {"q_s": "Zhao_2025_West", "q_y": 1.15, "q_se": 0.22}, "visibility": {q["id"]: True for q in meta_questions}},
        {"answers": {"q_s": "Zhou_2026_Pilot", "q_y": 1.48, "q_se": 0.30}, "visibility": {q["id"]: True for q in meta_questions}},
    ]
    sb_meta = build_inline_sandbox(title="Meta随机效应测试", questions=meta_questions, rows=meta_rows, classification="simulated")
    meta_res = sb_meta.run_meta_random_effects("study", "effect", "se")
    assert "META_HIGH_HETEROGENEITY_I2_GE_50" in meta_res.data["diagnostics"]
    assert "META_EGGER_BIAS_P_LT_010" in meta_res.data["diagnostics"]
    assert meta_res.data["i2_pct"] >= 50.0
    assert meta_res.data["theta_re"] > 0.3
    assert len(meta_res.data["table"]["rows"]) == 6
    assert any(r["method"] == "meta" for r in sb_meta.export_registered_results())


def test_fmt_p_and_autonomous_prose_never_emit_zero_p_or_corner_brackets(tmp_path, monkeypatch):
    import re

    assert _fmt_p(0.0) == "p < 0.0001"
    assert _fmt_p(1e-8) == "p < 0.0001"
    assert _fmt_p(0.00009) == "p < 0.0001"
    assert _fmt_p(0.0001) == "p=0.0001"
    assert _fmt_p(0.05) == "p=0.05"
    assert _fmt_p(None) == "p=NA"

    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")
    title, questions, rows = build_planted_trap_benchmark()
    sandbox = build_inline_sandbox(title=title, questions=questions, rows=rows, classification="simulated")
    provider = AuthoredProvider(tmp_path)

    run = asyncio.run(
        execute_autonomous_research_core(
            project_id="demo-proj-hygiene",
            goal="“数字适老化”县域服务接受度实证调研",
            geography="县域",
            dataset_mode="planted_trap_benchmark",
            lease_mode="pi_autonomous",
            max_tool_calls=28,
            sandbox=sandbox,
            dataset_title=title,
            provider=provider,
        )
    )

    insight = run["motherInsight"]
    texts = [
        insight["headline"],
        insight["mechanism"],
        insight["paradoxDetail"],
        insight["scopeBoundary"],
        run["falsificationReport"]["summary"],
        *(item.get("issue", "") for item in run["falsificationReport"]["findings"]),
        *(item.get("required_change", "") for item in run["falsificationReport"]["findings"]),
        *(step.get("thought", "") for step in run["reasoningTrace"]),
        *(step.get("observation", "") for step in run["reasoningTrace"]),
        *(w for res in run["registeredResults"] for w in res.get("warnings", [])),
    ]
    joined = "\n".join(texts)
    assert not re.search(r"[【】「」『』]", joined), f"Unexpected bracket in autonomous run text: {joined}"
    assert not re.search(r"\bp\s*=\s*0(?:\.0+)?(?![0-9.])", joined), f"Unexpected p=0.0 artifact in: {joined}"
    assert "辛普森悖论" in insight["headline"]
    assert "p < 0.0001" in joined





