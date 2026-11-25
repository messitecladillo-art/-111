"""Permanent determinism & byte-level reproducibility guard for StatisticalSandbox and PlotSandbox.

Executes two independent runs over identical fixed datasets across:
1. `StatisticalSandbox` (Bootstrap mediation CIs, Spearman/Pearson correlation matrices,
   Mann-Whitney U + Cliff's Delta / rank-biserial r_rb, OLS/Ridge/HC3, Logistic/L2,
   Split Conformal bands, KMO/Bartlett, Harman CMB, subgroup heterogeneity, TOPSIS);
2. `execute_sandbox_readonly_stat` + `register_custom_stat_receipt` (seeded K-Means clustering
   with Silhouette coefficient & pairwise Cliff's Delta);
3. `plot_sandbox.py` (`build_snapshot_plot_script` + `execute_sandbox_plot`) across all chart
   kinds (`auto`/`barh`, `bar`, `line`, `forest`, `dumbbell`), verifying 100% byte-for-byte
   identical `svg` strings and `svgSha256` digests with zero dynamic timestamps (`<dc:date>`)
   and zero unseeded random SVG ID drift across separate subprocess invocations.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from typing import Any

import pytest

from application.services.autonomous_research import build_planted_trap_benchmark
from multi_agent.plot_sandbox import (
    build_snapshot_plot_script,
    execute_sandbox_plot,
    execute_sandbox_readonly_stat,
)
from multi_agent.statistical_isa import StatisticalSandbox
from shared.contracts import canonical

DYNAMIC_TIMESTAMP_RE = re.compile(
    r"<dc:date>|\b20\d{2}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}"
)


def _fixed_benchmark_inputs() -> tuple[str, list[dict[str, Any]], list[dict[str, Any]], str]:
    title, questions, rows = build_planted_trap_benchmark()
    dataset_sha = hashlib.sha256(canonical(rows).encode("utf-8")).hexdigest()
    return title, questions, rows, dataset_sha


def _run_full_statistical_chain() -> dict[str, Any]:
    """Run an independent StatisticalSandbox + K-Means/Cliff's Delta pipeline from scratch."""
    _, questions, rows, dataset_sha = _fixed_benchmark_inputs()
    sb = StatisticalSandbox(
        questions=questions,
        raw_responses=rows,
        dataset_ref="bench_wave22_repro",
        dataset_sha256=dataset_sha,
        classification="simulated",
    )

    step_outputs: dict[str, Any] = {}
    step_outputs["inspect"] = sb.inspect_distribution(
        variables=["trust_1", "trust_2", "trust_3", "subsidy_support", "adopt_intention"]
    ).model_dump(mode="json")
    step_outputs["clean"] = sb.apply_cleaning_pipeline(
        min_valid_ratio=0.7,
        drop_straightliners=True,
        min_likert_for_straightline=4,
    ).model_dump(mode="json")
    step_outputs["purify"] = sb.purify_scale_reliability(
        construct_name="service_perception",
        variables=["trust_1", "trust_2", "trust_3", "Q_trap"],
        drop_negative_or_low_citc=True,
        citc_threshold=0.30,
    ).model_dump(mode="json")
    step_outputs["kmo"] = sb.factor_suitability_kmo(
        variables=["trust_1", "trust_2", "trust_3", "tech_ease", "ui_fluency"]
    ).model_dump(mode="json")
    step_outputs["cmb"] = sb.check_common_method_bias(
        variables=["trust_1", "trust_2", "trust_3", "tech_ease", "ui_fluency", "subsidy_support"]
    ).model_dump(mode="json")

    # Mann-Whitney U + Cliff's Delta (equivalent to rank-biserial r_rb = (U1 - U2) / (n1 * n2))
    step_outputs["mann_whitney_cliff"] = sb.test_group_difference(
        outcome="adopt_intention",
        group_var="living_mode",
        method="mann_whitney",
    ).model_dump(mode="json")
    step_outputs["welch_t"] = sb.test_group_difference(
        outcome="adopt_intention",
        group_var="region_tier",
        method="welch_t",
    ).model_dump(mode="json")

    # Spearman & Pearson correlation matrices
    step_outputs["spearman"] = sb.compute_correlation_matrix(
        variables=["construct:service_perception", "tech_ease", "ui_fluency", "subsidy_support", "adopt_intention"],
        method="spearman",
    ).model_dump(mode="json")
    step_outputs["pearson"] = sb.compute_correlation_matrix(
        variables=["construct:service_perception", "subsidy_support", "adopt_intention"],
        method="pearson",
    ).model_dump(mode="json")

    # OLS / Ridge + HC3 robust SE and Penalized Logistic regression
    step_outputs["ols_hc3"] = sb.fit_linear_regression(
        outcome="adopt_intention",
        predictors=["construct:service_perception", "tech_ease", "subsidy_support"],
        ridge_lambda=0.25,
        cov_type="hc3",
    ).model_dump(mode="json")
    step_outputs["logit_l2"] = sb.fit_logistic_regression(
        outcome="renew_tier",
        predictors=["construct:service_perception", "subsidy_support"],
        l2_penalty=0.50,
    ).model_dump(mode="json")

    # Seeded Bootstrap mediation 95% confidence interval & Split Conformal prediction band
    step_outputs["bootstrap_mediation"] = sb.test_mediation_effect(
        predictor="subsidy_support",
        mediator="construct:service_perception",
        outcome="adopt_intention",
        bootstrap_samples=200,
        seed=42,
    ).model_dump(mode="json")
    step_outputs["conformal"] = sb.compute_conformal_prediction_band(
        outcome="adopt_intention",
        predictors=["construct:service_perception", "subsidy_support"],
        alpha=0.10,
        calibration_ratio=0.35,
    ).model_dump(mode="json")
    step_outputs["subgroup"] = sb.scan_subgroup_heterogeneity(
        outcome="adopt_intention",
        predictor="construct:service_perception",
        moderators=["living_mode", "region_tier"],
    ).model_dump(mode="json")
    step_outputs["topsis"] = sb.compute_entropy_topsis_rank(
        entity_var="subsidy_support",
        indicators=["trust_1", "tech_ease", "ui_fluency", "adopt_intention"],
    ).model_dump(mode="json")

    # Deterministic K-Means clustering + Silhouette score + exact Cliff's Delta in readonly stat sandbox
    kmeans_cliff_script = """import numpy as np

rng = np.random.default_rng(202604)
vmap = {str(q.get("variable") or ""): str(q.get("id") or "") for q in QUESTIONS}
def _get(ans, var):
    return ans.get(var) if var in ans else ans.get(vmap.get(var, ""))

feats = []
solo_y = []
cohab_y = []
for row in ROWS:
    ans = row.get("answers") or {}
    vals = [_get(ans, "trust_1"), _get(ans, "tech_ease"), _get(ans, "subsidy_support"), _get(ans, "adopt_intention")]
    if all(isinstance(v, (int, float)) for v in vals):
        feats.append([float(v) for v in vals])
        liv = _get(ans, "living_mode")
        if liv == "solo":
            solo_y.append(float(vals[3]))
        elif liv == "cohabit":
            cohab_y.append(float(vals[3]))

X = np.asarray(feats, dtype=float)
mu = X.mean(axis=0)
sd = np.where(X.std(axis=0) > 1e-9, X.std(axis=0), 1.0)
Z = (X - mu) / sd

k = 3
init_idx = rng.choice(len(Z), size=k, replace=False)
centers = Z[init_idx].copy()
labels = np.zeros(len(Z), dtype=int)
for _ in range(25):
    dists = np.linalg.norm(Z[:, None, :] - centers[None, :, :], axis=2)
    new_labels = np.argmin(dists, axis=1)
    if np.array_equal(new_labels, labels):
        break
    labels = new_labels
    for c_i in range(k):
        mask = labels == c_i
        if int(mask.sum()) > 0:
            centers[c_i] = Z[mask].mean(axis=0)

pair_d = np.linalg.norm(Z[:, None, :] - Z[None, :, :], axis=2)
sil_vals = []
for idx_i in range(len(Z)):
    own = labels == labels[idx_i]
    own_cnt = int(own.sum())
    a_i = float(pair_d[idx_i, own].sum() / max(own_cnt - 1, 1)) if own_cnt > 1 else 0.0
    b_i = min(
        float(pair_d[idx_i, labels == c_j].mean())
        for c_j in range(k)
        if c_j != int(labels[idx_i]) and int((labels == c_j).sum()) > 0
    )
    denom = max(a_i, b_i, 1e-12)
    sil_vals.append((b_i - a_i) / denom)
silhouette = round(float(np.mean(sil_vals)), 6)

gt = sum(1 for a in solo_y for b in cohab_y if a > b)
lt = sum(1 for a in solo_y for b in cohab_y if a < b)
cliffs_delta = round(float((gt - lt) / max(len(solo_y) * len(cohab_y), 1)), 6)

boot_means = []
arr_y = X[:, 3]
for _ in range(200):
    sample_idx = rng.integers(0, len(arr_y), size=len(arr_y))
    boot_means.append(float(arr_y[sample_idx].mean()))
ci_lo, ci_hi = np.percentile(np.asarray(boot_means), [2.5, 97.5])

RESULT = {
    "summary": f"三类受访群体聚类轮廓系数为 {silhouette:.4f}，组间效应量 δ={cliffs_delta:.4f}。",
    "n_effective": int(len(Z)),
    "metrics": {
        "kmeans_k": k,
        "silhouette_score": silhouette,
        "cliffs_delta": cliffs_delta,
        "bootstrap_ci_low": round(float(ci_lo), 6),
        "bootstrap_ci_high": round(float(ci_hi), 6),
        "cluster_sizes": [int((labels == c_i).sum()) for c_i in range(k)],
    },
    "table": {
        "headers": ["聚类簇", "样本数", "采纳意愿均值"],
        "rows": [
            [f"簇 {c_i + 1}", int((labels == c_i).sum()), round(float(X[labels == c_i, 3].mean()), 4)]
            for c_i in range(k)
        ],
    },
}
"""
    stat_res = execute_sandbox_readonly_stat(
        kmeans_cliff_script,
        questions=questions,
        rows=rows,
        dataset_sha256=dataset_sha,
        classification="simulated",
    )
    sb.register_custom_stat_receipt(stat_res.data)
    step_outputs["kmeans_silhouette_cliff"] = stat_res.model_dump(mode="json")

    return {
        "steps": step_outputs,
        "deliverable": sb.build_deliverable(),
        "registered_results": sb.export_registered_results(),
    }


def test_planted_trap_benchmark_dataset_generation_is_byte_identical() -> None:
    """Two independent calls to `build_planted_trap_benchmark` produce identical bytes."""
    run_a = _fixed_benchmark_inputs()
    time.sleep(0.02)
    run_b = _fixed_benchmark_inputs()

    assert run_a == run_b
    bytes_a = json.dumps(run_a, ensure_ascii=False, sort_keys=True).encode("utf-8")
    bytes_b = json.dumps(run_b, ensure_ascii=False, sort_keys=True).encode("utf-8")
    assert bytes_a == bytes_b
    assert DYNAMIC_TIMESTAMP_RE.search(bytes_a.decode("utf-8")) is None


def test_statistical_sandbox_and_kmeans_bootstrap_reproducibility() -> None:
    """Two independent runs of Bootstrap CI, K-Means silhouette, Spearman, Mann-Whitney/Cliff, OLS & Logit match 100%."""
    out_a = _run_full_statistical_chain()
    time.sleep(0.03)
    out_b = _run_full_statistical_chain()

    raw_a = json.dumps(out_a, ensure_ascii=False, sort_keys=True, allow_nan=False)
    raw_b = json.dumps(out_b, ensure_ascii=False, sort_keys=True, allow_nan=False)
    assert raw_a == raw_b
    assert hashlib.sha256(raw_a.encode("utf-8")).hexdigest() == hashlib.sha256(
        raw_b.encode("utf-8")
    ).hexdigest()
    assert DYNAMIC_TIMESTAMP_RE.search(raw_a) is None

    # Sanity-check non-trivial statistical outputs on the benchmark
    km_metrics = out_a["steps"]["kmeans_silhouette_cliff"]["data"]["metrics"]
    assert -1.0 <= km_metrics["silhouette_score"] <= 1.0
    assert -1.0 <= km_metrics["cliffs_delta"] <= 1.0
    assert km_metrics["bootstrap_ci_low"] < km_metrics["bootstrap_ci_high"]
    assert sum(km_metrics["cluster_sizes"]) == 240

    mw_metrics = {
        m["label"]: m["value"]
        for m in out_a["steps"]["mann_whitney_cliff"]["data"]["metrics"]
    }
    assert "Mann-Whitney U" in mw_metrics and "秩双列 r_rb" in mw_metrics
    assert out_a["steps"]["bootstrap_mediation"]["data"]["result_hash"] == (
        out_b["steps"]["bootstrap_mediation"]["data"]["result_hash"]
    )


@pytest.mark.parametrize("chart_kind", ["auto", "bar", "line", "forest", "dumbbell"])
def test_plot_sandbox_all_chart_kinds_byte_for_byte_svg_reproducibility(chart_kind: str) -> None:
    """Two separate subprocess invocations per chart kind emit 100% byte-identical SVG without timestamps."""
    snapshot = {
        "snapshot_id": f"snap_det_{chart_kind}",
        "title": "县域银发群体智慧照护采纳效应分布对比",
        "chart": {
            "title": "县域银发群体智慧照护采纳效应分布对比",
            "categories": [
                "服务感知综合分",
                "适老界面流畅度",
                "社区补贴覆盖感",
                "居家安全响应速度",
                "家属协同信赖度",
                "基层站点可达性",
                "年度续约采纳意愿",
            ],
            "values": [0.52, 0.39, 0.64, 0.45, -0.14, 0.31, 0.58],
        },
    }

    script_a, payload_a = build_snapshot_plot_script(snapshot, chart_kind=chart_kind)
    res_a = execute_sandbox_plot(script_a, payload_a, auto_repair=True, max_repairs=2, timeout_s=15.0)
    time.sleep(0.05)
    script_b, payload_b = build_snapshot_plot_script(snapshot, chart_kind=chart_kind)
    res_b = execute_sandbox_plot(script_b, payload_b, auto_repair=True, max_repairs=2, timeout_s=15.0)

    assert script_a == script_b
    assert payload_a == payload_b
    assert res_a["ok"] is True and res_b["ok"] is True
    assert res_a["audit"]["passed"] is True

    # Byte-for-byte SVG string & SHA-256 identity across separate Python subprocesses
    assert res_a["svg"].encode("utf-8") == res_b["svg"].encode("utf-8")
    assert res_a["svgSha256"] == res_b["svgSha256"]
    assert res_a["audit"] == res_b["audit"]

    # Zero wall-clock `<dc:date>` or ISO timestamp leakage inside rendered SVG
    assert DYNAMIC_TIMESTAMP_RE.search(res_a["svg"]) is None
