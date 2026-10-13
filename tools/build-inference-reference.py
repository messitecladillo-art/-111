"""Generate SciPy/statsmodels reference values for lib/inference.ts.

Run: uv run --no-project --with scipy==1.16.2 --with statsmodels==0.14.5 --with numpy python tools/build-inference-reference.py
Writes apps/evi-x-platform/tests/fixtures/inference-reference.json. Inputs are synthetic.
"""
import json
from pathlib import Path

import numpy as np
import scipy
import statsmodels
from scipy import stats
from statsmodels.stats.oneway import anova_oneway
from statsmodels.stats.proportion import proportion_confint
from statsmodels.stats.multitest import multipletests

rng = np.random.default_rng(20261014)
r = lambda a: [round(float(v), 4) for v in a]

welch_cases = [
    {"x": [5.1, 4.9, 6.2, 5.8, 6.0, 5.5, 5.3], "y": [6.8, 7.1, 6.4, 7.5, 6.9, 7.3]},
    {"x": r(rng.normal(3.6, 0.9, 40)), "y": r(rng.normal(3.2, 1.4, 35))},
]
for case in welch_cases:
    res = stats.ttest_ind(case["x"], case["y"], equal_var=False)
    ci = res.confidence_interval(0.95)
    case.update(t=float(res.statistic), df=float(res.df), p=float(res.pvalue), lower=float(ci.low), upper=float(ci.high))

mw_cases = [
    {"x": [1.1, 2.3, 3.5, 4.0, 5.2], "y": [2.0, 4.4, 6.1, 7.3, 8.0, 9.9]},
    {"x": [1, 2, 2, 3, 4, 4, 5], "y": [2, 3, 3, 5, 6, 6, 7, 8]},
    {"x": r(rng.normal(0.3, 1, 60)), "y": r(rng.normal(0, 1, 55))},
    {"x": r(rng.normal(0, 1, 12)), "y": r(rng.normal(0.8, 1, 9))},
]
for case in mw_cases:
    ties = len(set(case["x"] + case["y"])) < len(case["x"] + case["y"])
    exact = not ties and len(case["x"]) < 50 and len(case["y"]) < 50
    res = stats.mannwhitneyu(case["x"], case["y"], alternative="two-sided", method="exact" if exact else "asymptotic", use_continuity=True)
    case.update(u=float(res.statistic), p=float(res.pvalue), method="exact" if exact else "normal")

group_cases = [
    {"groups": [[4.1, 5.2, 3.9, 4.8, 5.0], [6.3, 7.9, 5.1, 8.8, 6.6, 7.4], [5.0, 5.1, 5.3, 4.9]]},
    {"groups": [r(rng.normal(10, 2, 18)), r(rng.normal(11.5, 4, 22)), r(rng.normal(9.5, 1, 15)), r(rng.normal(10.5, 3, 20))]},
    {"groups": [[1, 2, 2, 3, 3, 3], [2, 3, 4, 4, 5], [3, 4, 5, 5, 5, 5, 4]]},
]
for case in group_cases:
    g = case["groups"]
    classic = stats.f_oneway(*g)
    welch = anova_oneway(g, use_var="unequal", welch_correction=True)
    kw = stats.kruskal(*g)
    case.update(f=float(classic.statistic), fp=float(classic.pvalue), welchF=float(welch.statistic),
                welchDf2=float(welch.df[1]), welchP=float(welch.pvalue), h=float(kw.statistic), hp=float(kw.pvalue))

corr_cases = []
for n, ties in ((25, False), (40, True), (6, False)):
    x = rng.normal(0, 1, n)
    y = 0.5 * x + rng.normal(0, 1, n)
    if ties:
        x, y = np.round(x * 2) / 2, np.round(y * 2) / 2
    pr = stats.pearsonr(x, y)
    ci = pr.confidence_interval(0.95)
    sp = stats.spearmanr(x, y)
    corr_cases.append({"x": r(x), "y": r(y)})
    pr = stats.pearsonr(corr_cases[-1]["x"], corr_cases[-1]["y"])
    ci = pr.confidence_interval(0.95)
    sp = stats.spearmanr(corr_cases[-1]["x"], corr_cases[-1]["y"])
    corr_cases[-1].update(r=float(pr.statistic), p=float(pr.pvalue), lower=float(ci.low), upper=float(ci.high),
                          rho=float(sp.statistic), rhoP=float(sp.pvalue))

chi_cases = [{"table": [[12, 5], [7, 14], [3, 9]]}, {"table": [[20, 15, 10], [5, 12, 18]]}]
for case in chi_cases:
    chi, p, dof, _ = stats.chi2_contingency(case["table"], correction=False)
    case.update(chi=float(chi), p=float(p), df=int(dof))

fisher_cases = [[[3, 9], [11, 4]], [[1, 9], [11, 3]], [[12, 5], [3, 8]], [[0, 6], [6, 0]], [[5, 5], [5, 5]]]
fisher = [{"table": t, "p": float(stats.fisher_exact(t, alternative="two-sided").pvalue)} for t in fisher_cases]

wilson = []
for k, n in ((12, 40), (0, 15), (15, 15), (1, 3), (517, 4521)):
    lo, hi = proportion_confint(k, n, alpha=0.05, method="wilson")
    wilson.append({"k": k, "n": n, "lower": float(lo), "upper": float(hi)})

critical = [{"df": df, "q": float(stats.t.ppf(0.975, df))} for df in (1, 5, 12.7, 100, 1000)]
tails = {
    "t": [{"t": t, "df": df, "p": float(2 * stats.t.sf(abs(t), df))} for t, df in ((10, 30), (2.1, 4), (0.3, 200), (-3.5, 12))],
    "chi": [{"x": x, "k": k, "p": float(stats.chi2.sf(x, k))} for x, k in ((50, 3), (3.84, 1), (0.5, 6), (120, 40))],
    "f": [{"f": f, "d1": d1, "d2": d2, "p": float(stats.f.sf(f, d1, d2))} for f, d1, d2 in ((20, 3, 40), (1.2, 2, 10), (4.5, 5, 7.3))],
    "z": [{"z": z, "p": float(stats.norm.sf(z))} for z in (0.5, 1.96, 6.5, -1.2)],
}
holm_in = [0.01, 0.04, 0.03, 0.005]
holm_out = [float(v) for v in multipletests(holm_in, method="holm")[1]]

out = {
    "generator": {"scipy": scipy.__version__, "statsmodels": statsmodels.__version__, "numpy": np.__version__, "seed": 20261014,
                  "note": "Synthetic inputs; SciPy/statsmodels are the independent reference implementation."},
    "welch": welch_cases, "mannWhitney": mw_cases, "groups": group_cases, "correlation": corr_cases,
    "chiSquare": chi_cases, "fisher": fisher, "wilson": wilson, "critical": critical, "tails": tails,
    "holm": {"input": holm_in, "output": holm_out},
}
target = Path(__file__).resolve().parents[1] / "apps/evi-x-platform/tests/fixtures/inference-reference.json"
target.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print("wrote", target)
