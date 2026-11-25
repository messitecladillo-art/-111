"""Pure-Python typed statistical operator sandbox for autonomous data exploration.

Models never see raw row-level responses or open-text answers. They invoke
strongly-typed statistical operators that operate on fenced working rows,
enforce minimum subgroup sizes and cleaning provenance, emit structured
diagnostic flags (e.g., NEGATIVE_CITC_ITEM, HIGH_VIF_COLLINEARITY,
SEPARATION_DETECTED, SUBGROUP_SIGN_REVERSAL), and sign every output with
deterministic SHA-256 fingerprints.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
import math
import random
import re
from statistics import mean, median, stdev
from typing import Any

from multi_agent.agents.contracts import ToolResult
from shared.contracts import canonical, fingerprint

MIN_CELL_N = 5
MAX_TABLES = 60
MAX_CHARTS = 60


def _r(value: float | int | None, digits: int = 4) -> float | None:
    if value is None:
        return None
    f = float(value)
    if not math.isfinite(f):
        return None
    return round(f, digits)


def _fmt_p(value: float | int | None, digits: int = 4) -> str:
    if value is None:
        return "p=NA"
    f = float(value)
    if not math.isfinite(f):
        return "p=NA"
    if f < 0.0001:
        return "p < 0.0001"
    rounded = _r(f, digits)
    if rounded is None:
        return "p=NA"
    if rounded == 0.0:
        return "p < 0.0001"
    return f"p={rounded}"


def _norm_p_two_tailed(z: float) -> float:
    return min(1.0, max(0.0, math.erfc(abs(z) / math.sqrt(2.0))))


def _betacf(a: float, b: float, x: float) -> float:
    max_iter = 200
    eps = 3.0e-12
    fpmin = 1.0e-30
    qab = a + b
    qap = a + 1.0
    qam = a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < fpmin:
        d = fpmin
    d = 1.0 / d
    h = d
    for m in range(1, max_iter + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < fpmin:
            d = fpmin
        c = 1.0 + aa / c
        if abs(c) < fpmin:
            c = fpmin
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < fpmin:
            d = fpmin
        c = 1.0 + aa / c
        if abs(c) < fpmin:
            c = fpmin
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < eps:
            break
    return h


def _betainc(a: float, b: float, x: float) -> float:
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    bt = math.exp(
        math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log(1.0 - x)
    )
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b


def _t_p_two_tailed(t_val: float, df: float) -> float:
    if not math.isfinite(t_val) or df <= 0:
        return 1.0
    x = df / (df + t_val * t_val)
    return min(1.0, max(0.0, _betainc(0.5 * df, 0.5, x)))


def _f_p_value(f_val: float, df1: float, df2: float) -> float:
    if not math.isfinite(f_val) or f_val <= 0 or df1 <= 0 or df2 <= 0:
        return 1.0
    x = df2 / (df2 + df1 * f_val)
    return min(1.0, max(0.0, _betainc(0.5 * df2, 0.5 * df1, x)))


def _chi2_p_value(chi2_val: float, df: int) -> float:
    if not math.isfinite(chi2_val) or chi2_val <= 0 or df <= 0:
        return 1.0
    a = 0.5 * df
    x = 0.5 * chi2_val
    if x < a + 1.0:
        ap = a
        delta = 1.0 / a
        total = delta
        for _ in range(250):
            ap += 1.0
            delta *= x / ap
            total += delta
            if abs(delta) < abs(total) * 3.0e-12:
                break
        p_lower = total * math.exp(-x + a * math.log(x) - math.lgamma(a))
        return min(1.0, max(0.0, 1.0 - p_lower))
    b = x + 1.0 - a
    c = 1.0 / 1.0e-30
    d = 1.0 / b
    h = d
    for i in range(1, 250):
        an = -i * (i - a)
        b += 2.0
        d = an * d + b
        if abs(d) < 1.0e-30:
            d = 1.0e-30
        c = b + an / c
        if abs(c) < 1.0e-30:
            c = 1.0e-30
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 3.0e-12:
            break
    return min(1.0, max(0.0, math.exp(-x + a * math.log(x) - math.lgamma(a)) * h))


def _quantile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    pos = (len(ordered) - 1) * q
    lo = math.floor(pos)
    hi = math.ceil(pos)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo)


def _skewness(values: list[float]) -> float:
    n = len(values)
    if n < 3:
        return 0.0
    s = stdev(values)
    if s <= 1e-12:
        return 0.0
    m = mean(values)
    z3 = sum(((x - m) / s) ** 3 for x in values)
    return (n / ((n - 1.0) * (n - 2.0))) * z3


def _average_ranks(values: list[float]) -> tuple[list[float], float]:
    n = len(values)
    indexed = sorted(enumerate(values), key=lambda pair: pair[1])
    ranks = [0.0] * n
    tie_sum = 0.0
    i = 0
    while i < n:
        j = i + 1
        while j < n and indexed[j][1] == indexed[i][1]:
            j += 1
        avg_rank = 0.5 * ((i + 1) + j)
        for k in range(i, j):
            ranks[indexed[k][0]] = avg_rank
        t = j - i
        if t > 1:
            tie_sum += float(t * t * t - t)
        i = j
    return ranks, tie_sum


def _pearson(xs: list[float], ys: list[float]) -> tuple[float | None, float | None]:
    n = len(xs)
    if n < 3 or n != len(ys):
        return None, None
    mx, my = mean(xs), mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx <= 1e-12 or syy <= 1e-12:
        return None, None
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    r = max(-1.0, min(1.0, sxy / math.sqrt(sxx * syy)))
    if abs(r) >= 1.0 - 1e-12:
        return r, 0.0
    t_val = r * math.sqrt((n - 2) / (1.0 - r * r))
    return r, _t_p_two_tailed(t_val, float(n - 2))


def _solve_linear(matrix: list[list[float]], rhs: list[float]) -> list[float] | None:
    n = len(rhs)
    a = [list(map(float, row)) + [float(rhs[idx])] for idx, row in enumerate(matrix)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(a[r][col]))
        if abs(a[pivot][col]) < 1e-12:
            return None
        if pivot != col:
            a[col], a[pivot] = a[pivot], a[col]
        div = a[col][col]
        for j in range(col, n + 1):
            a[col][j] /= div
        for row in range(n):
            if row == col:
                continue
            factor = a[row][col]
            if factor == 0.0:
                continue
            for j in range(col, n + 1):
                a[row][j] -= factor * a[col][j]
    return [a[i][n] for i in range(n)]


def _invert_matrix(matrix: list[list[float]]) -> list[list[float]] | None:
    n = len(matrix)
    aug = [list(map(float, row)) + [1.0 if i == j else 0.0 for j in range(n)] for i, row in enumerate(matrix)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(aug[r][col]))
        if abs(aug[pivot][col]) < 1e-12:
            return None
        if pivot != col:
            aug[col], aug[pivot] = aug[pivot], aug[col]
        div = aug[col][col]
        for j in range(2 * n):
            aug[col][j] /= div
        for row in range(n):
            if row == col:
                continue
            factor = aug[row][col]
            if factor == 0.0:
                continue
            for j in range(2 * n):
                aug[row][j] -= factor * aug[col][j]
    return [row[n:] for row in aug]


def _mat_vec(matrix: list[list[float]], vec: list[float]) -> list[float]:
    return [sum(row[j] * vec[j] for j in range(len(vec))) for row in matrix]


def _dominant_eigenvalue(matrix: list[list[float]], iterations: int = 120) -> float:
    """Deterministic power-iteration + Rayleigh quotient top eigenvalue for PSD correlation matrices."""
    k = len(matrix)
    if k == 0:
        return 0.0
    if k == 1:
        return max(0.0, float(matrix[0][0]))
    vec = [1.0 + 0.03 * i for i in range(k)]
    norm0 = math.sqrt(sum(v * v for v in vec)) or 1.0
    vec = [v / norm0 for v in vec]
    for _ in range(iterations):
        nxt = _mat_vec(matrix, vec)
        norm = math.sqrt(sum(v * v for v in nxt))
        if norm <= 1e-12:
            return 0.0
        vec = [v / norm for v in nxt]
    mv = _mat_vec(matrix, vec)
    return max(0.0, sum(vec[i] * mv[i] for i in range(k)))


def _xtx(rows: list[list[float]]) -> list[list[float]]:
    if not rows:
        return []
    k = len(rows[0])
    out = [[0.0] * k for _ in range(k)]
    for row in rows:
        for i in range(k):
            ri = row[i]
            for j in range(i, k):
                out[i][j] += ri * row[j]
    for i in range(k):
        for j in range(i):
            out[i][j] = out[j][i]
    return out


def _xty(rows: list[list[float]], y: list[float]) -> list[float]:
    k = len(rows[0])
    out = [0.0] * k
    for row, yi in zip(rows, y):
        for i in range(k):
            out[i] += row[i] * yi
    return out


def _hc1_se(design_rows: list[list[float]], residuals: list[float]) -> list[float] | None:
    """Compute MacKinnon-White HC1 robust standard errors for linear / 2SLS design matrices."""
    n = len(design_rows)
    if n == 0:
        return None
    k = len(design_rows[0])
    xtx_inv = _invert_matrix(_xtx(design_rows))
    if xtx_inv is None:
        return None
    meat = [[0.0] * k for _ in range(k)]
    for row, res in zip(design_rows, residuals):
        r2 = res * res
        for a in range(k):
            ra = row[a] * r2
            for b in range(a, k):
                meat[a][b] += ra * row[b]
    for a in range(k):
        for b in range(a):
            meat[a][b] = meat[b][a]
    tmp = [[sum(xtx_inv[a][m] * meat[m][b] for m in range(k)) for b in range(k)] for a in range(k)]
    df_scale = float(n) / float(max(1, n - k))
    ses: list[float] = []
    for a in range(k):
        var_a = sum(tmp[a][m] * xtx_inv[m][a] for m in range(k)) * df_scale
        ses.append(math.sqrt(max(1e-12, var_a)))
    return ses


@dataclass
class _WorkingRow:
    answers: dict[str, Any]
    visibility: dict[str, bool]


@dataclass
class StatisticalSandbox:
    """Fenced in-memory statistical execution kernel with signed operator receipts."""

    questions: list[dict[str, Any]]
    raw_responses: list[Any]
    dataset_ref: str
    dataset_sha256: str
    classification: str = "actual"
    active_rows: list[_WorkingRow] = field(init=False)
    derived_variables: dict[str, dict[str, Any]] = field(default_factory=dict, init=False)
    cleaning_log: list[dict[str, Any]] = field(default_factory=list, init=False)
    receipts: list[dict[str, Any]] = field(default_factory=list, init=False)
    _question_map: dict[str, dict[str, Any]] = field(default_factory=dict, init=False)

    def __post_init__(self):
        cleaned_rows: list[_WorkingRow] = []
        for item in self.raw_responses:
            ans = deepcopy(item.answers if hasattr(item, "answers") else item.get("answers", {}))
            vis = deepcopy(item.visibility if hasattr(item, "visibility") else item.get("visibility", {}))
            cleaned_rows.append(_WorkingRow(answers=ans, visibility={str(k): bool(v) for k, v in vis.items()}))
        self.active_rows = cleaned_rows
        for q in self.questions:
            self._question_map[q["id"]] = q
            self._question_map[q["variable"]] = q

    @property
    def working_sha256(self) -> str:
        payload = {
            "base": self.dataset_sha256,
            "n": len(self.active_rows),
            "derived": sorted(self.derived_variables.keys()),
            "cleaningSteps": len(self.cleaning_log),
        }
        return fingerprint(payload)

    def _resolve_var(self, name: str) -> tuple[str, dict[str, Any] | None]:
        if name in self.derived_variables:
            return name, self.derived_variables[name]
        q = self._question_map.get(name)
        if q is not None:
            return q["id"], q
        raise ValueError(f"unknown_variable:{name}")

    def _var_label(self, name: str) -> str:
        if name in self.derived_variables:
            return self.derived_variables[name]["label"]
        q = self._question_map.get(name)
        return q["variable"] if q else name

    def _raw_val(self, row: _WorkingRow, key: str, meta: dict[str, Any] | None) -> Any:
        if meta is not None and meta.get("type") == "text":
            return None
        if key in self.derived_variables:
            return row.answers.get(key)
        if not row.visibility.get(key, True):
            return None
        return row.answers.get(key)

    def _numeric_val(self, row: _WorkingRow, key: str, meta: dict[str, Any] | None) -> float | None:
        val = self._raw_val(row, key, meta)
        if val is None or isinstance(val, bool):
            return None
        if isinstance(val, (int, float)) and math.isfinite(float(val)):
            return float(val)
        return None

    def _complete_numeric_matrix(self, var_names: list[str]) -> tuple[list[list[float]], list[str]]:
        resolved = [self._resolve_var(v) for v in var_names]
        rows: list[list[float]] = []
        for r in self.active_rows:
            vec: list[float] = []
            ok = True
            for key, meta in resolved:
                num = self._numeric_val(r, key, meta)
                if num is None:
                    ok = False
                    break
                vec.append(num)
            if ok:
                rows.append(vec)
        return rows, [self._var_label(v) for v in var_names]

    def _record_receipt(
        self,
        *,
        operator: str,
        params: dict[str, Any],
        n_effective: int,
        summary: str,
        metrics: list[dict[str, Any]],
        diagnostics: list[str],
        headers: list[str],
        rows: list[list[Any]],
        chart: dict[str, Any] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> ToolResult:
        snap_body = {
            "operator": operator,
            "params": params,
            "dataset_sha256": self.dataset_sha256,
            "working_view_sha256": self.working_sha256,
            "n_effective": n_effective,
            "metrics": metrics,
            "diagnostics": diagnostics,
            "headers": headers,
            "rows": rows,
        }
        result_hash = fingerprint(snap_body)
        snapshot_id = f"snap_{result_hash[:12]}"
        receipt = {
            "snapshot_id": snapshot_id,
            "operator": operator,
            "params": params,
            "dataset_ref": self.dataset_ref,
            "dataset_sha256": self.dataset_sha256,
            "working_view_sha256": self.working_sha256,
            "classification": self.classification,
            "n_effective": n_effective,
            "n_total": len(self.raw_responses),
            "summary": summary,
            "metrics": metrics,
            "diagnostics": diagnostics,
            "table": {"headers": headers, "rows": rows},
            "chart": chart,
            "result_hash": result_hash,
            **(extra or {}),
        }
        self.receipts.append(receipt)
        tool_cls = "actual" if self.classification == "actual" else "simulated"
        return ToolResult(
            classification=tool_cls,
            artifact_refs=[self.dataset_ref],
            evidence_refs=[snapshot_id],
            data=receipt,
        )

    def register_custom_stat_receipt(self, data: dict[str, Any]) -> ToolResult:
        """Register a verified readonly custom stat sandbox result into signed receipts."""
        raw_n = data.get("n_effective")
        n_eff = int(raw_n) if isinstance(raw_n, int) and not isinstance(raw_n, bool) and raw_n >= 0 else 0
        summary = str(data.get("summary") or "定制稳健统计检验完成").strip()[:500] or "定制稳健统计检验完成"
        script_sha256 = str(data.get("script_sha256") or "")
        diags = [str(d) for d in (data.get("diagnostics") or []) if str(d).strip()][:20]

        raw_metrics = data.get("metrics")
        metric_list: list[dict[str, Any]] = []
        if isinstance(raw_metrics, dict):
            for k, v in list(raw_metrics.items())[:24]:
                val = _r(v, 6) if isinstance(v, (int, float)) and not isinstance(v, bool) else None
                metric_list.append({"label": str(k)[:150], "value": val})
        elif isinstance(raw_metrics, list):
            for item in raw_metrics[:24]:
                if isinstance(item, dict) and item.get("label") is not None:
                    v = item.get("value")
                    val = _r(v, 6) if isinstance(v, (int, float)) and not isinstance(v, bool) else None
                    metric_list.append({"label": str(item.get("label"))[:150], "value": val})

        headers: list[str] = []
        rows: list[list[Any]] = []
        raw_table = data.get("table")
        if isinstance(raw_table, dict) and isinstance(raw_table.get("headers"), list) and raw_table["headers"]:
            headers = [str(h)[:150] for h in raw_table["headers"][:30]]
            raw_rows = raw_table.get("rows")
            if isinstance(raw_rows, list):
                for row in raw_rows[:40]:
                    if isinstance(row, list):
                        padded = [
                            (_r(cell, 4) if isinstance(cell, float) else cell)
                            for cell in row[: len(headers)]
                        ]
                        while len(padded) < len(headers):
                            padded.append(None)
                        rows.append(padded)
        elif isinstance(raw_table, list) and raw_table:
            if isinstance(raw_table[0], dict):
                headers = [str(k)[:150] for k in list(raw_table[0].keys())[:30]]
                for row in raw_table[:40]:
                    if isinstance(row, dict):
                        rows.append([row.get(h) for h in headers])
            elif isinstance(raw_table[0], list) and len(raw_table) >= 2:
                headers = [str(h)[:150] for h in raw_table[0][:30]]
                for row in raw_table[1:41]:
                    if isinstance(row, list):
                        rows.append(list(row[: len(headers)]))

        if not headers:
            headers = ["统计指标", "估计值"]
            rows = [[m["label"], m["value"]] for m in metric_list if m.get("value") is not None]
        if not rows:
            rows = [["有效样本量 n", n_eff]]

        numeric_metrics = [m for m in metric_list if isinstance(m.get("value"), (int, float))]
        chart = (
            {
                "kind": "bar",
                "title": summary[:56],
                "categories": [str(m["label"])[:28] for m in numeric_metrics[:10]],
                "values": [float(m["value"]) for m in numeric_metrics[:10]],
            }
            if numeric_metrics
            else None
        )
        return self._record_receipt(
            operator="run_custom_stat_script",
            params={"script_sha256": script_sha256},
            n_effective=n_eff,
            summary=summary,
            metrics=metric_list,
            diagnostics=diags,
            headers=headers,
            rows=rows,
            chart=chart,
            extra={"script_sha256": script_sha256} if script_sha256 else None,
        )

    # ---- Operator 1: Inspect Distribution & Missingness ----
    def inspect_distribution(self, variables: list[str] | None = None) -> ToolResult:
        target_vars = variables or [q["variable"] for q in self.questions if q.get("type") != "text"]
        resolved = [self._resolve_var(v) for v in target_vars]
        diagnostics: list[str] = []
        table_rows: list[list[Any]] = []
        col_stats: list[dict[str, Any]] = []
        for name, (key, meta) in zip(target_vars, resolved):
            kind = meta.get("type", "number") if meta else "number"
            if kind == "text":
                continue
            shown = [
                r for r in self.active_rows if (key in self.derived_variables or r.visibility.get(key, True))
            ]
            vals = [self._raw_val(r, key, meta) for r in shown]
            answered = [v for v in vals if v is not None]
            missing = len(shown) - len(answered)
            miss_rate = (missing / len(shown)) if shown else 0.0
            if miss_rate > 0.20:
                diagnostics.append(f"HIGH_MISSINGNESS:{name}")
            if kind in ("number", "likert"):
                nums = [float(v) for v in answered if not isinstance(v, bool)]
                if len(nums) >= 3:
                    m = mean(nums)
                    s = stdev(nums)
                    med = median(nums)
                    iqr = _quantile(nums, 0.75) - _quantile(nums, 0.25)
                    if s > 1e-12:
                        skew = sum(((x - m) / s) ** 3 for x in nums) / len(nums)
                        kurt = sum(((x - m) / s) ** 4 for x in nums) / len(nums) - 3.0
                    else:
                        skew = 0.0
                        kurt = 0.0
                        diagnostics.append(f"ZERO_VARIANCE:{name}")
                    if abs(skew) > 1.2:
                        diagnostics.append(f"SKEWED_DISTRIBUTION:{name}")
                    lo = min(nums)
                    hi = max(nums)
                    floor_pct = 100.0 * sum(1 for x in nums if x == lo) / len(nums)
                    ceil_pct = 100.0 * sum(1 for x in nums if x == hi) / len(nums)
                    col_stats.append({
                        "variable": name,
                        "type": kind,
                        "n_shown": len(shown),
                        "n_valid": len(nums),
                        "n_missing": missing,
                        "mean": _r(m),
                        "sd": _r(s),
                        "median": _r(med),
                        "iqr": _r(iqr),
                        "skewness": _r(skew),
                        "kurtosis": _r(kurt),
                        "floor_pct": _r(floor_pct),
                        "ceiling_pct": _r(ceil_pct),
                    })
                    table_rows.append([name, len(nums), missing, _r(m), _r(s), _r(med), _r(skew)])
            else:
                freq: dict[str, int] = {}
                for v in answered:
                    for code in (v if isinstance(v, list) else [v]):
                        freq[str(code)] = freq.get(str(code), 0) + 1
                top_code = max(freq, key=freq.get) if freq else "-"
                top_pct = _r(100.0 * freq[top_code] / len(answered)) if freq and answered else 0.0
                col_stats.append({
                    "variable": name,
                    "type": kind,
                    "n_shown": len(shown),
                    "n_valid": len(answered),
                    "n_missing": missing,
                    "top_category": top_code,
                    "top_percent": top_pct,
                    "frequencies": [
                        {"code": k, "count": cnt, "percent": _r(100.0 * cnt / (len(answered) or 1))}
                        for k, cnt in list(freq.items())[:20]
                    ],
                })
                table_rows.append([name, len(answered), missing, None, None, f"{top_code}({top_pct}%)", None])
        return self._record_receipt(
            operator="inspect_distribution",
            params={"variables": target_vars},
            n_effective=len(self.active_rows),
            summary=f"检查了 {len(table_rows)} 个变量的分布与缺失特征（当前有效样本 n={len(self.active_rows)}）。"
            + (f" 同时识别出异常诊断信号 {', '.join(diagnostics[:5])}。" if diagnostics else ""),
            metrics=[
                {"label": "检查变量数", "value": len(table_rows)},
                {"label": "当前活动样本量", "value": len(self.active_rows)},
                {"label": "异常诊断信号数", "value": len(diagnostics)},
            ],
            diagnostics=diagnostics,
            headers=["变量", "有效样本", "缺失", "均值", "标准差", "中位/众数", "偏度"],
            rows=table_rows[:40],
            extra={"columns": col_stats},
        )

    # ---- Operator 2: Stateful Cleaning Pipeline ----
    def apply_cleaning_pipeline(
        self,
        min_valid_ratio: float = 0.70,
        drop_straightliners: bool = True,
        min_likert_for_straightline: int = 4,
    ) -> ToolResult:
        before_n = len(self.active_rows)
        non_text = [q for q in self.questions if q.get("type") != "text"]
        likert_qs = [q for q in self.questions if q.get("type") == "likert"]
        kept: list[_WorkingRow] = []
        dropped_incomplete = 0
        dropped_straightline = 0
        for row in self.active_rows:
            shown_ids = [q["id"] for q in non_text if row.visibility.get(q["id"], True)]
            answered_cnt = sum(1 for qid in shown_ids if row.answers.get(qid) is not None)
            ratio = (answered_cnt / len(shown_ids)) if shown_ids else 1.0
            if ratio < min_valid_ratio:
                dropped_incomplete += 1
                continue
            if drop_straightliners:
                likert_vals = [
                    float(row.answers[q["id"]])
                    for q in likert_qs
                    if row.visibility.get(q["id"], True)
                    and isinstance(row.answers.get(q["id"]), (int, float))
                    and not isinstance(row.answers.get(q["id"]), bool)
                ]
                if len(likert_vals) >= min_likert_for_straightline and len(set(likert_vals)) <= 1:
                    dropped_straightline += 1
                    continue
            kept.append(row)
        self.active_rows = kept
        after_n = len(kept)
        if dropped_incomplete:
            self.cleaning_log.append({
                "rule": "low_valid_response_ratio",
                "threshold": min_valid_ratio,
                "affected_rows": dropped_incomplete,
                "before_n": before_n,
                "after_n": before_n - dropped_incomplete,
                "reason": f"剔除必答可见题有效作答率低于 {int(min_valid_ratio * 100)}% 的无效问卷。",
            })
        if dropped_straightline:
            self.cleaning_log.append({
                "rule": "likert_straightlining_zero_variance",
                "min_items": min_likert_for_straightline,
                "affected_rows": dropped_straightline,
                "before_n": before_n - dropped_incomplete,
                "after_n": after_n,
                "reason": f"剔除连续 ≥{min_likert_for_straightline} 道量表题评分完全无波动的规律作答样本。",
            })
        diagnostics = []
        if dropped_straightline > 0:
            diagnostics.append(f"STRAIGHTLINERS_REMOVED:{dropped_straightline}")
        if dropped_incomplete > 0:
            diagnostics.append(f"INCOMPLETE_REMOVED:{dropped_incomplete}")
        rows_tbl = [
            ["原始回收样本", before_n, "100.0%"],
            ["作答率不足剔除", dropped_incomplete, f"{_r(100.0 * dropped_incomplete / (before_n or 1))}%"],
            ["量表规律零方差剔除", dropped_straightline, f"{_r(100.0 * dropped_straightline / (before_n or 1))}%"],
            ["清洗后保留样本", after_n, f"{_r(100.0 * after_n / (before_n or 1))}%"],
        ]
        return self._record_receipt(
            operator="apply_cleaning_pipeline",
            params={
                "min_valid_ratio": min_valid_ratio,
                "drop_straightliners": drop_straightliners,
                "min_likert_for_straightline": min_likert_for_straightline,
            },
            n_effective=after_n,
            summary=(
                f"完成四步样本质量清洗，原始 n={before_n}，剔除低作答率 {dropped_incomplete} 份、"
                f"量表零方差规律作答 {dropped_straightline} 份，净保留有效样本 n={after_n}。"
            ),
            metrics=[
                {"label": "清洗前样本", "value": before_n},
                {"label": "规律作答剔除", "value": dropped_straightline},
                {"label": "清洗后样本", "value": after_n},
            ],
            diagnostics=diagnostics,
            headers=["清洗阶段", "样本量", "占比"],
            rows=rows_tbl,
        )

    # ---- Operator 3: Scale Reliability & Composite Purification ----
    def purify_scale_reliability(
        self,
        construct_name: str,
        variables: list[str],
        drop_negative_or_low_citc: bool = False,
        citc_threshold: float = 0.30,
    ) -> ToolResult:
        if len(variables) < 2:
            raise ValueError("purify_scale_reliability_requires_at_least_2_items")

        def _compute_alpha(item_vars: list[str]) -> tuple[float | None, list[dict[str, Any]], int]:
            matrix, labels = self._complete_numeric_matrix(item_vars)
            n = len(matrix)
            k = len(item_vars)
            if n < 5 or k < 2:
                return None, [], n
            item_vars_list = [[row[j] for row in matrix] for j in range(k)]
            totals = [sum(row) for row in matrix]
            var_total = stdev(totals) ** 2 if len(totals) > 1 else 0.0
            sum_item_var = sum((stdev(col) ** 2 if len(col) > 1 else 0.0) for col in item_vars_list)
            alpha = (k / (k - 1.0)) * (1.0 - sum_item_var / var_total) if var_total > 1e-12 else 0.0
            details: list[dict[str, Any]] = []
            for j in range(k):
                rest = [totals[i] - matrix[i][j] for i in range(n)]
                citc, _ = _pearson(item_vars_list[j], rest)
                alpha_del: float | None = None
                if k >= 3:
                    rest_var = stdev(rest) ** 2 if len(rest) > 1 else 0.0
                    sum_rest_item_var = sum(
                        (stdev(item_vars_list[m]) ** 2 if len(item_vars_list[m]) > 1 else 0.0)
                        for m in range(k) if m != j
                    )
                    if rest_var > 1e-12:
                        alpha_del = ((k - 1) / (k - 2)) * (1.0 - sum_rest_item_var / rest_var)
                details.append({
                    "item": labels[j],
                    "citc": _r(citc),
                    "alpha_if_deleted": _r(alpha_del),
                })
            return alpha, details, n

        initial_alpha, initial_details, n_obs = _compute_alpha(variables)
        diagnostics: list[str] = []
        dropped_items: list[str] = []
        kept_vars = list(variables)
        final_alpha = initial_alpha
        final_details = initial_details

        for d in initial_details:
            citc_val = d["citc"]
            if citc_val is not None and citc_val < 0:
                diagnostics.append(f"NEGATIVE_CITC_ITEM:{d['item']}")
            elif citc_val is not None and citc_val < citc_threshold:
                diagnostics.append(f"LOW_CITC_ITEM:{d['item']}")
        if initial_alpha is not None and initial_alpha < 0.70:
            diagnostics.append("LOW_RELIABILITY_ALPHA")

        if drop_negative_or_low_citc and initial_details:
            bad = {
                d["item"] for d in initial_details
                if d["citc"] is not None and d["citc"] < citc_threshold
            }
            candidate = [v for v in variables if v not in bad]
            if len(candidate) >= 2 and bad:
                dropped_items = [v for v in variables if v in bad]
                kept_vars = candidate
                final_alpha, final_details, n_obs = _compute_alpha(kept_vars)
                if final_alpha is not None and final_alpha < 0.70:
                    diagnostics.append("LOW_RELIABILITY_AFTER_PURIFICATION")
                else:
                    diagnostics = [d for d in diagnostics if not d.startswith(("LOW_RELIABILITY_ALPHA", "NEGATIVE_CITC_ITEM", "LOW_CITC_ITEM"))]
                    diagnostics.append(f"SCALE_PURIFIED_DROPPED:{','.join(dropped_items)}")

        composite_key = f"construct:{construct_name}"
        if (final_alpha is not None and final_alpha >= 0.65) or drop_negative_or_low_citc:
            resolved_kept = [self._resolve_var(v) for v in kept_vars]
            self.derived_variables[composite_key] = {
                "id": composite_key,
                "variable": composite_key,
                "label": f"{construct_name}均值",
                "type": "number",
                "items": list(kept_vars),
            }
            for row in self.active_rows:
                vals = [self._numeric_val(row, key, meta) for key, meta in resolved_kept]
                valid = [v for v in vals if v is not None]
                row.answers[composite_key] = _r(mean(valid), 4) if valid else None
                row.visibility[composite_key] = bool(valid)

        table_rows = [
            [
                d["item"],
                d["citc"],
                d["alpha_if_deleted"],
                "已剔除" if d["item"] in dropped_items else "保留合成",
            ]
            for d in initial_details
        ]
        summary = (
            f"构念“{construct_name}”初始 Cronbach's α={_r(initial_alpha)}（k={len(variables)}, n={n_obs}）"
            + (
                f"；自动净化剔除异常题项 {', '.join(dropped_items)} 后，纯化 α 跃升至 {_r(final_alpha)}，已合成变量 {composite_key}。"
                if dropped_items
                else f"；各题项 CITC 均 ≥{citc_threshold}。"
                if not diagnostics
                else f"；检测到信度异常信号 {', '.join(diagnostics)}，建议剔除低/负 CITC 题项。"
            )
        )
        return self._record_receipt(
            operator="purify_scale_reliability",
            params={
                "construct_name": construct_name,
                "variables": variables,
                "drop_negative_or_low_citc": drop_negative_or_low_citc,
                "citc_threshold": citc_threshold,
            },
            n_effective=n_obs,
            summary=summary,
            metrics=[
                {"label": "初始 Cronbach's α", "value": _r(initial_alpha)},
                {"label": "纯化后 Cronbach's α", "value": _r(final_alpha)},
                {"label": "保留题项数", "value": len(kept_vars)},
                {"label": "有效样本 n", "value": n_obs},
            ],
            diagnostics=diagnostics,
            headers=["题项变量", "校正题总相关 (CITC)", "删题后 α", "处理决策"],
            rows=table_rows,
            chart={
                "kind": "bar",
                "title": f"{construct_name} 各题项校正题总相关 (CITC)",
                "categories": [d["item"] for d in initial_details],
                "values": [d["citc"] if d["citc"] is not None else 0.0 for d in initial_details],
            } if initial_details else None,
            extra={
                "construct_variable": composite_key if composite_key in self.derived_variables else None,
                "kept_items": kept_vars,
                "dropped_items": dropped_items,
            },
        )

    # ---- Operator 4: KMO & Bartlett Factor Suitability ----
    def factor_suitability_kmo(self, variables: list[str]) -> ToolResult:
        matrix, labels = self._complete_numeric_matrix(variables)
        n = len(matrix)
        p = len(labels)
        if n < 10 or p < 3:
            raise ValueError("kmo_requires_at_least_10_rows_and_3_vars")
        # Standardize columns
        cols = [[row[j] for row in matrix] for j in range(p)]
        r_mat = [[1.0 if i == j else (_pearson(cols[i], cols[j])[0] or 0.0) for j in range(p)] for i in range(p)]
        # Regularize slightly if nearly singular
        inv = _invert_matrix(r_mat)
        if inv is None:
            reg = [[r_mat[i][j] + (1e-4 if i == j else 0.0) for j in range(p)] for i in range(p)]
            inv = _invert_matrix(reg)
        if inv is None:
            raise ValueError("singular_correlation_matrix")
        sum_r2 = 0.0
        sum_a2 = 0.0
        msa_rows: list[list[Any]] = []
        for i in range(p):
            row_r2 = 0.0
            row_a2 = 0.0
            for j in range(p):
                if i == j:
                    continue
                rij = r_mat[i][j]
                denom = math.sqrt(max(1e-12, abs(inv[i][i] * inv[j][j])))
                aij = -inv[i][j] / denom
                row_r2 += rij * rij
                row_a2 += aij * aij
            sum_r2 += row_r2
            sum_a2 += row_a2
            msa = row_r2 / (row_r2 + row_a2) if (row_r2 + row_a2) > 0 else 0.0
            msa_rows.append([labels[i], _r(msa), "适切" if msa >= 0.6 else "偏弱"])
        kmo = sum_r2 / (sum_r2 + sum_a2) if (sum_r2 + sum_a2) > 0 else 0.0
        # Determinant via Gaussian elimination
        tmp = [list(r) for r in r_mat]
        det = 1.0
        for i in range(p):
            piv = max(range(i, p), key=lambda r: abs(tmp[r][i]))
            if abs(tmp[piv][i]) < 1e-12:
                det = 1e-12
                break
            if piv != i:
                tmp[i], tmp[piv] = tmp[piv], tmp[i]
                det = -det
            det *= tmp[i][i]
            for r in range(i + 1, p):
                fac = tmp[r][i] / tmp[i][i]
                for c in range(i, p):
                    tmp[r][c] -= fac * tmp[i][c]
        det = max(1e-12, abs(det))
        chi2 = -(n - 1.0 - (2.0 * p + 5.0) / 6.0) * math.log(det)
        df = p * (p - 1) // 2
        p_val = _chi2_p_value(max(0.0, chi2), df)
        diagnostics = ["LOW_KMO"] if kmo < 0.60 else []
        return self._record_receipt(
            operator="factor_suitability_kmo",
            params={"variables": variables},
            n_effective=n,
            summary=f"KMO 抽样适切性检验={_r(kmo)}，Bartlett 球形度检验 χ²={_r(chi2, 2)}（df={df}, {_fmt_p(p_val)}）。",
            metrics=[
                {"label": "KMO", "value": _r(kmo)},
                {"label": "Bartlett χ²", "value": _r(chi2, 2)},
                {"label": "自由度 df", "value": df},
                {"label": "p 值", "value": _r(p_val)},
            ],
            diagnostics=diagnostics,
            headers=["题项", "个体 MSA", "因子适切评估"],
            rows=msa_rows,
            chart={
                "kind": "bar",
                "title": f"KMO={_r(kmo)} 各题项个体抽样适切度 (MSA)",
                "categories": [str(r[0]) for r in msa_rows],
                "values": [r[1] if isinstance(r[1], (int, float)) else 0.0 for r in msa_rows],
            } if msa_rows else None,
        )

    # ---- Operator 5: Group Difference Test (Welch t / ANOVA / Chi-square) ----
    def test_group_difference(self, outcome: str, group_var: str, method: str = "auto") -> ToolResult:
        out_key, out_meta = self._resolve_var(outcome)
        grp_key, grp_meta = self._resolve_var(group_var)
        out_kind = out_meta.get("type", "number") if out_meta else "number"
        labels_map = (
            {str(c["code"]): str(c["label"]) for c in grp_meta.get("choices", [])}
            if grp_meta else {}
        )
        groups: dict[str, list[Any]] = {}
        for row in self.active_rows:
            g_raw = self._raw_val(row, grp_key, grp_meta)
            o_val = (
                self._numeric_val(row, out_key, out_meta)
                if out_kind in ("number", "likert")
                else self._raw_val(row, out_key, out_meta)
            )
            if g_raw is None or o_val is None or isinstance(g_raw, list):
                continue
            g_label = labels_map.get(str(g_raw), str(g_raw))
            groups.setdefault(g_label, []).append(o_val)

        valid_groups = {k: v for k, v in groups.items() if len(v) >= MIN_CELL_N}
        suppressed = [k for k, v in groups.items() if len(v) < MIN_CELL_N]
        diagnostics: list[str] = [f"SMALL_CELL_SUPPRESSED:{k}" for k in suppressed]
        if len(valid_groups) < 2:
            raise ValueError("insufficient_group_strata")

        n_total = sum(len(v) for v in valid_groups.values())
        if out_kind in ("number", "likert"):
            g_keys = list(valid_groups.keys())
            all_vals = [float(x) for gk in g_keys for x in valid_groups[gk]]
            skew_val = _skewness(all_vals)
            req_method = (method or "auto").strip().lower()
            auto_skew_fallback = req_method == "auto" and out_kind == "number" and len(all_vals) >= 12 and abs(skew_val) > 1.5
            use_nonparametric = (
                req_method in ("mann_whitney", "kruskal_wallis", "nonparametric")
                or auto_skew_fallback
            )
            if auto_skew_fallback:
                diagnostics.append("NONPARAMETRIC_AUTO_FALLBACK:SKEWED_OUTCOME")

            if use_nonparametric:
                np_rows: list[list[Any]] = []
                flat_vals: list[float] = []
                slices: list[tuple[str, int, int]] = []
                cursor = 0
                for gk in g_keys:
                    vals = [float(x) for x in valid_groups[gk]]
                    iqr_val = _quantile(vals, 0.75) - _quantile(vals, 0.25)
                    np_rows.append([gk, len(vals), _r(median(vals)), _r(iqr_val), _r(mean(vals))])
                    flat_vals.extend(vals)
                    slices.append((gk, cursor, cursor + len(vals)))
                    cursor += len(vals)
                ranks, tie_sum = _average_ranks(flat_vals)
                group_ranks = {gk: ranks[s:e] for gk, s, e in slices}

                if len(g_keys) == 2:
                    r_a = group_ranks[g_keys[0]]
                    r_b = group_ranks[g_keys[1]]
                    n1, n2 = len(r_a), len(r_b)
                    u1 = sum(r_a) - n1 * (n1 + 1.0) / 2.0
                    u2 = n1 * n2 - u1
                    u_stat = min(u1, u2)
                    mu_u = n1 * n2 / 2.0
                    denom_n = max(1.0, float(n_total * (n_total - 1)))
                    var_term = (n_total + 1.0) - (tie_sum / denom_n)
                    sigma_u = math.sqrt(max(1e-12, (n1 * n2 / 12.0) * max(1e-12, var_term)))
                    z_val = (u1 - mu_u) / sigma_u
                    p_val = _norm_p_two_tailed(z_val)
                    r_rb = (u1 - u2) / max(1.0, float(n1 * n2))
                    med_a = median([float(x) for x in valid_groups[g_keys[0]]])
                    med_b = median([float(x) for x in valid_groups[g_keys[1]]])
                    return self._record_receipt(
                        operator="test_group_difference",
                        params={"outcome": outcome, "group_var": group_var, "method": "mann_whitney"},
                        n_effective=n_total,
                        summary=(
                            f"{outcome} 按 {group_var} Mann-Whitney U={_r(u_stat, 1)}（z={_r(z_val, 3)}, {_fmt_p(p_val)}, "
                            f"秩双列相关 r_rb={_r(r_rb, 3)}, 偏度={_r(skew_val, 2)}）："
                            f"{g_keys[0]}中位数 {_r(med_a)} vs {g_keys[1]} {_r(med_b)}。"
                        ),
                        metrics=[
                            {"label": "Mann-Whitney U", "value": _r(u_stat, 1)},
                            {"label": "z 统计量", "value": _r(z_val, 3)},
                            {"label": "p 值", "value": _r(p_val)},
                            {"label": "秩双列 r_rb", "value": _r(r_rb, 3)},
                        ],
                        diagnostics=diagnostics,
                        headers=["分组", "有效样本 n", "中位数", "四分位距 IQR", "均值"],
                        rows=np_rows,
                        chart={
                            "kind": "bar",
                            "title": f"{outcome} × {group_var} 分组中位数比较",
                            "categories": g_keys,
                            "values": [_r(median([float(x) for x in valid_groups[gk]])) for gk in g_keys],
                        },
                        extra={"skewness": _r(skew_val, 3), "method": "mann_whitney"},
                    )

                h_raw = (
                    (12.0 / max(1.0, float(n_total * (n_total + 1))))
                    * sum((sum(group_ranks[gk]) ** 2) / len(group_ranks[gk]) for gk in g_keys)
                    - 3.0 * (n_total + 1.0)
                )
                c_tie = 1.0 - (tie_sum / max(1.0, float(n_total ** 3 - n_total)))
                h_stat = max(0.0, h_raw / c_tie) if c_tie > 1e-12 else max(0.0, h_raw)
                df_kw = len(g_keys) - 1
                p_val = _chi2_p_value(h_stat, df_kw)
                eps2 = min(1.0, max(0.0, h_stat / max(1, n_total - 1)))
                return self._record_receipt(
                    operator="test_group_difference",
                    params={"outcome": outcome, "group_var": group_var, "method": "kruskal_wallis"},
                    n_effective=n_total,
                    summary=(
                        f"{outcome} 按 {group_var} Kruskal-Wallis H={_r(h_stat, 3)}（df={df_kw}, {_fmt_p(p_val)}, "
                        f"ε²={_r(eps2, 3)}, 偏度={_r(skew_val, 2)}）。"
                    ),
                    metrics=[
                        {"label": "Kruskal-Wallis H", "value": _r(h_stat, 3)},
                        {"label": "自由度 df", "value": df_kw},
                        {"label": "p 值", "value": _r(p_val)},
                        {"label": "效应量 ε²", "value": _r(eps2, 3)},
                    ],
                    diagnostics=diagnostics,
                    headers=["分组", "有效样本 n", "中位数", "四分位距 IQR", "均值"],
                    rows=np_rows,
                    chart={
                        "kind": "bar",
                        "title": f"{outcome} × {group_var} 分组中位数比较",
                        "categories": g_keys,
                        "values": [_r(median([float(x) for x in valid_groups[gk]])) for gk in g_keys],
                    },
                    extra={"skewness": _r(skew_val, 3), "method": "kruskal_wallis"},
                )

            table_rows: list[list[Any]] = []
            for gk in g_keys:
                vals = [float(x) for x in valid_groups[gk]]
                table_rows.append([gk, len(vals), _r(mean(vals)), _r(stdev(vals) if len(vals) > 1 else 0.0), _r(median(vals))])
            if len(g_keys) == 2:
                a = [float(x) for x in valid_groups[g_keys[0]]]
                b = [float(x) for x in valid_groups[g_keys[1]]]
                ma, mb = mean(a), mean(b)
                va = stdev(a) ** 2 if len(a) > 1 else 0.0
                vb = stdev(b) ** 2 if len(b) > 1 else 0.0
                se = math.sqrt(va / len(a) + vb / len(b)) if (va > 0 or vb > 0) else 0.0
                t_val = (ma - mb) / se if se > 1e-12 else 0.0
                num = (va / len(a) + vb / len(b)) ** 2
                den = ((va / len(a)) ** 2 / max(1, len(a) - 1)) + ((vb / len(b)) ** 2 / max(1, len(b) - 1))
                df = (num / den) if den > 1e-12 else float(len(a) + len(b) - 2)
                p_val = _t_p_two_tailed(t_val, df)
                pooled = math.sqrt(((len(a) - 1) * va + (len(b) - 1) * vb) / max(1, len(a) + len(b) - 2))
                cohens_d = (ma - mb) / pooled if pooled > 1e-12 else 0.0
                return self._record_receipt(
                    operator="test_group_difference",
                    params={"outcome": outcome, "group_var": group_var, "method": "welch_t"},
                    n_effective=n_total,
                    summary=(
                        f"{outcome} 按 {group_var} 分组 Welch t={_r(t_val, 3)}（df={_r(df, 1)}, {_fmt_p(p_val)}, "
                        f"Cohen's d={_r(cohens_d, 3)}）：{g_keys[0]}均值 {_r(ma)} vs {g_keys[1]} {_r(mb)}。"
                    ),
                    metrics=[
                        {"label": "Welch t", "value": _r(t_val, 3)},
                        {"label": "自由度 df", "value": _r(df, 1)},
                        {"label": "p 值", "value": _r(p_val)},
                        {"label": "Cohen's d", "value": _r(cohens_d, 3)},
                    ],
                    diagnostics=diagnostics,
                    headers=["分组", "有效样本 n", "均值", "标准差", "中位数"],
                    rows=table_rows,
                    chart={
                        "kind": "bar",
                        "title": f"{outcome} × {group_var} 分组均数比较",
                        "categories": g_keys,
                        "values": [_r(mean([float(x) for x in valid_groups[gk]])) for gk in g_keys],
                    },
                )
            # One-way ANOVA for >= 3 groups
            grand_mean = mean(all_vals)
            ss_between = sum(len(valid_groups[gk]) * (mean([float(x) for x in valid_groups[gk]]) - grand_mean) ** 2 for gk in g_keys)
            ss_within = sum(sum((float(x) - mean([float(y) for y in valid_groups[gk]])) ** 2 for x in valid_groups[gk]) for gk in g_keys)
            df1 = len(g_keys) - 1
            df2 = len(all_vals) - len(g_keys)
            ms_between = ss_between / max(1, df1)
            ms_within = ss_within / max(1, df2)
            f_val = ms_between / ms_within if ms_within > 1e-12 else 0.0
            p_val = _f_p_value(f_val, float(df1), float(df2))
            eta2 = ss_between / (ss_between + ss_within) if (ss_between + ss_within) > 1e-12 else 0.0
            return self._record_receipt(
                operator="test_group_difference",
                params={"outcome": outcome, "group_var": group_var, "method": "anova"},
                n_effective=n_total,
                summary=f"{outcome} 按 {group_var} 单因素方差分析 F={_r(f_val, 3)}（df=({df1},{df2}), {_fmt_p(p_val)}, η²={_r(eta2, 3)}）。",
                metrics=[
                    {"label": "F 统计量", "value": _r(f_val, 3)},
                    {"label": "p 值", "value": _r(p_val)},
                    {"label": "偏 η²", "value": _r(eta2, 3)},
                ],
                diagnostics=diagnostics,
                headers=["分组", "有效样本 n", "均值", "标准差", "中位数"],
                rows=table_rows,
            )

        # Categorical contingency table Chi-square
        out_cats = sorted({str(v) for vals in valid_groups.values() for v in vals})
        g_keys = list(valid_groups.keys())
        counts = [[sum(1 for v in valid_groups[gk] if str(v) == oc) for oc in out_cats] for gk in g_keys]
        row_sums = [sum(r) for r in counts]
        col_sums = [sum(counts[i][j] for i in range(len(g_keys))) for j in range(len(out_cats))]
        chi2 = 0.0
        for i in range(len(g_keys)):
            for j in range(len(out_cats)):
                exp = row_sums[i] * col_sums[j] / n_total
                if exp > 0:
                    chi2 += (counts[i][j] - exp) ** 2 / exp
        df = max(1, (len(g_keys) - 1) * (len(out_cats) - 1))
        p_val = _chi2_p_value(chi2, df)
        cramers_v = math.sqrt(chi2 / (n_total * max(1, min(len(g_keys), len(out_cats)) - 1)))
        tbl_rows = [[g_keys[i], *counts[i], row_sums[i]] for i in range(len(g_keys))]
        return self._record_receipt(
            operator="test_group_difference",
            params={"outcome": outcome, "group_var": group_var, "method": "chi_square"},
            n_effective=n_total,
            summary=f"{outcome} × {group_var} 列联表卡方 χ²={_r(chi2, 3)}（df={df}, {_fmt_p(p_val)}, Cramér's V={_r(cramers_v, 3)}）。",
            metrics=[
                {"label": "卡方 χ²", "value": _r(chi2, 3)},
                {"label": "自由度 df", "value": df},
                {"label": "p 值", "value": _r(p_val)},
                {"label": "Cramér's V", "value": _r(cramers_v, 3)},
            ],
            diagnostics=diagnostics,
            headers=[group_var, *out_cats, "小计"],
            rows=tbl_rows,
        )

    # ---- Operator 6: OLS & Ridge Linear Regression + VIF + Breusch-Pagan HC3 ----
    def fit_linear_regression(
        self,
        outcome: str,
        predictors: list[str],
        ridge_lambda: float = 0.0,
        cov_type: str = "auto",
    ) -> ToolResult:
        if not predictors:
            raise ValueError("predictors_required")
        data, labels = self._complete_numeric_matrix([outcome, *predictors])
        n = len(data)
        p = len(predictors)
        if n <= p + 2:
            raise ValueError("insufficient_rows_for_regression")
        y = [row[0] for row in data]
        X = [[1.0, *row[1:]] for row in data]
        k = p + 1

        # Compute predictor VIF before regularization
        vifs: list[float | None] = []
        diagnostics: list[str] = []
        if p >= 2:
            for j in range(p):
                other_X = [[1.0] + [row[1 + m] for m in range(p) if m != j] for row in data]
                yj = [row[1 + j] for row in data]
                oxtx = _xtx(other_X)
                oxty = _xty(other_X, yj)
                b_aux = _solve_linear(oxtx, oxty)
                if b_aux is None:
                    vif = 999.0
                else:
                    y_bar = mean(yj)
                    sst_j = sum((val - y_bar) ** 2 for val in yj)
                    ssr_j = sum((val - sum(other_X[i][m] * b_aux[m] for m in range(len(b_aux)))) ** 2 for i, val in enumerate(yj))
                    r2_j = 1.0 - (ssr_j / sst_j) if sst_j > 1e-12 else 0.999
                    vif = 1.0 / max(1e-4, 1.0 - min(0.9999, r2_j))
                vifs.append(_r(vif, 2))
                if vif > 5.0:
                    diagnostics.append(f"HIGH_VIF_COLLINEARITY:{labels[1 + j]}={_r(vif, 2)}")
        else:
            vifs = [1.0]

        xtx = _xtx(X)
        if ridge_lambda > 0:
            for i in range(1, k):
                xtx[i][i] += float(ridge_lambda)
            diagnostics = [d for d in diagnostics if not d.startswith("HIGH_VIF")]
            diagnostics.append(f"RIDGE_STABILIZED:lambda={_r(ridge_lambda, 2)}")

        xty = _xty(X, y)
        beta = _solve_linear(xtx, xty)
        inv = _invert_matrix(xtx)
        if beta is None or inv is None:
            raise ValueError("singular_design_matrix")

        yhat = [sum(X[i][j] * beta[j] for j in range(k)) for i in range(n)]
        resid = [y[i] - yhat[i] for i in range(n)]
        y_mean = mean(y)
        sst = sum((yi - y_mean) ** 2 for yi in y)
        ssr = sum(e * e for e in resid)
        r2 = max(0.0, 1.0 - ssr / sst) if sst > 1e-12 else 0.0
        adj_r2 = 1.0 - (1.0 - r2) * (n - 1) / max(1, n - k)
        f_stat = ((sst - ssr) / max(1, p)) / (ssr / max(1, n - k)) if ssr > 1e-12 else 0.0
        f_p = _f_p_value(f_stat, float(p), float(n - k))

        # Breusch-Pagan heteroscedasticity LM test & adaptive HC1 / HC3 sandwich covariance
        xtx_raw = _xtx(X)
        inv_raw = inv if ridge_lambda == 0 else _invert_matrix(xtx_raw)
        u2_vals = [e * e for e in resid]
        u2_mean = mean(u2_vals) if u2_vals else 0.0
        sst_bp = sum((u2 - u2_mean) ** 2 for u2 in u2_vals)
        bp_beta = _solve_linear(xtx_raw, _xty(X, u2_vals))
        if bp_beta is not None and sst_bp > 1e-12:
            u2_hat = [sum(X[i][j] * bp_beta[j] for j in range(k)) for i in range(n)]
            ssr_bp = sum((u2_vals[i] - u2_hat[i]) ** 2 for i in range(n))
            r2_bp = max(0.0, min(1.0, 1.0 - ssr_bp / sst_bp))
            bp_lm = float(n) * r2_bp
        else:
            bp_lm = 0.0
        bp_p = _chi2_p_value(bp_lm, p)

        cov_req = (cov_type or "auto").strip().lower()
        use_hc3 = (cov_req == "hc3") or (cov_req == "auto" and ridge_lambda == 0 and bp_p < 0.05 and inv_raw is not None)
        cov_used = "HC3" if use_hc3 else "HC1"
        if cov_req == "auto" and ridge_lambda == 0 and bp_p < 0.05 and use_hc3:
            diagnostics.append("HETEROSCEDASTICITY_BP_DETECTED:HC3_APPLIED")

        scale = n / max(1, n - k)
        meat = [[0.0] * k for _ in range(k)]
        for i in range(n):
            xi = X[i]
            if use_hc3 and inv_raw is not None:
                h_i = 0.0
                for a in range(k):
                    row_dot = sum(inv_raw[a][b] * xi[b] for b in range(k))
                    h_i += xi[a] * row_dot
                h_i = min(0.95, max(0.0, h_i))
                u2 = u2_vals[i] / ((1.0 - h_i) ** 2)
            else:
                u2 = u2_vals[i] * scale
            for a in range(k):
                for b in range(a, k):
                    meat[a][b] += u2 * xi[a] * xi[b]
        for a in range(k):
            for b in range(a):
                meat[a][b] = meat[b][a]
        mid = [[sum(inv[a][m] * meat[m][b] for m in range(k)) for b in range(k)] for a in range(k)]
        cov = [[sum(mid[a][m] * inv[m][b] for m in range(k)) for b in range(k)] for a in range(k)]

        sd_y = stdev(y) if n > 1 else 1.0
        rows_tbl: list[list[Any]] = []
        coef_map: dict[str, dict[str, Any]] = {}
        for j, name in enumerate(["截距 (Intercept)", *labels[1:]]):
            se = math.sqrt(max(1e-12, cov[j][j]))
            t_val = beta[j] / se
            p_val = _t_p_two_tailed(t_val, float(max(1, n - k)))
            ci_lo = beta[j] - 1.96 * se
            ci_hi = beta[j] + 1.96 * se
            std_beta: float | None = None
            vif_val: float | None = None
            if j > 0:
                xj = [row[j] for row in X]
                sd_x = stdev(xj) if n > 1 else 0.0
                std_beta = beta[j] * (sd_x / sd_y) if sd_y > 1e-12 else 0.0
                vif_val = vifs[j - 1]
                coef_map[name] = {
                    "B": _r(beta[j]), "SE": _r(se), "beta": _r(std_beta),
                    "t": _r(t_val, 3), "p": _r(p_val), "VIF": vif_val,
                }
            rows_tbl.append([
                name, _r(beta[j]), _r(se), _r(std_beta), _r(t_val, 3), _r(p_val),
                f"[{_r(ci_lo, 3)}, {_r(ci_hi, 3)}]", vif_val,
            ])

        max_vif = max((v for v in vifs if v is not None), default=1.0)
        method_tag = f"Ridge (λ={_r(ridge_lambda, 2)})" if ridge_lambda > 0 else ("HC3 异方差稳健 OLS" if use_hc3 else "HC1 稳健 OLS")
        return self._record_receipt(
            operator="fit_linear_regression",
            params={"outcome": outcome, "predictors": predictors, "ridge_lambda": ridge_lambda, "cov_type": cov_used},
            n_effective=n,
            summary=(
                f"{method_tag} 回归（因变量 {outcome}, n={n}）：R²={_r(r2, 3)}，调整 R²={_r(adj_r2, 3)}，"
                f"F={_r(f_stat, 2)}（{_fmt_p(f_p)}），最大 VIF={_r(max_vif, 2)}，BP 异方差 {_fmt_p(bp_p)}。"
                + (" 检出异方差并已自动应用 HC3 杠杆校正稳健标准误。" if use_hc3 and cov_req == "auto" else "")
                + (f" 同时检出高共线性预警（{', '.join(d for d in diagnostics if d.startswith('HIGH_VIF'))}）。" if max_vif > 5.0 and ridge_lambda == 0 else "")
            ),
            metrics=[
                {"label": "R²", "value": _r(r2)},
                {"label": "调整 R²", "value": _r(adj_r2)},
                {"label": "模型 F", "value": _r(f_stat, 2)},
                {"label": "最大 VIF", "value": _r(max_vif, 2)},
                {"label": "BP 异方差 p", "value": _r(bp_p)},
            ],
            diagnostics=diagnostics,
            headers=["自变量", "非标准化 B", f"{cov_used} 稳健 SE" if use_hc3 else "稳健 SE", "标准化 β", "t", "p 值", "95% CI", "VIF"],
            rows=rows_tbl,
            chart={
                "kind": "bar",
                "title": f"{outcome} 回归自变量标准化 |β| 权重比较",
                "categories": list(coef_map.keys()),
                "values": [_r(abs(coef_map[k_name]["beta"] or 0.0), 4) or 0.0 for k_name in coef_map],
            } if coef_map else None,
            extra={
                "coefficients": coef_map,
                "breusch_pagan_lm": _r(bp_lm, 3),
                "breusch_pagan_p": _r(bp_p),
                "cov_estimator": cov_used,
            },
        )

    # ---- Operator 7: Binary Logistic Regression with Separation Guard & L2 Shrinkage ----
    def fit_logistic_regression(
        self,
        outcome: str,
        predictors: list[str],
        positive_code: str | int | None = None,
        l2_penalty: float = 0.0,
    ) -> ToolResult:
        if not predictors:
            raise ValueError("predictors_required")
        out_key, out_meta = self._resolve_var(outcome)
        pred_resolved = [self._resolve_var(v) for v in predictors]
        rows_x: list[list[float]] = []
        y_bin: list[float] = []
        for r in self.active_rows:
            o_raw = self._raw_val(r, out_key, out_meta)
            if o_raw is None or isinstance(o_raw, list):
                continue
            if positive_code is not None:
                y_val = 1.0 if str(o_raw) == str(positive_code) else 0.0
            elif isinstance(o_raw, (int, float)) and not isinstance(o_raw, bool):
                v = float(o_raw)
                y_val = 1.0 if (v == 1.0 or v >= 4.0) else 0.0
            else:
                y_val = 1.0 if str(o_raw).lower() in ("1", "yes", "true", "y", "high") else 0.0
            vec = [1.0]
            ok = True
            for key, meta in pred_resolved:
                num = self._numeric_val(r, key, meta)
                if num is None:
                    ok = False
                    break
                vec.append(num)
            if ok:
                rows_x.append(vec)
                y_bin.append(y_val)

        n = len(rows_x)
        k = len(predictors) + 1
        if n <= k + 5:
            raise ValueError("insufficient_rows_for_logistic")
        pos_rate = mean(y_bin)
        if pos_rate == 0.0 or pos_rate == 1.0:
            raise ValueError("zero_variance_binary_outcome")

        # Mean log-likelihood for null model
        ll_null = sum(y * math.log(pos_rate) + (1.0 - y) * math.log(1.0 - pos_rate) for y in y_bin)
        beta = [0.0] * k
        separation_flag = False
        for _ in range(30):
            grad = [0.0] * k
            hess = [[0.0] * k for _ in range(k)]
            for xi, yi in zip(rows_x, y_bin):
                eta = max(-20.0, min(20.0, sum(xi[j] * beta[j] for j in range(k))))
                prob = 1.0 / (1.0 + math.exp(-eta))
                w = max(1e-6, prob * (1.0 - prob))
                diff = yi - prob
                for a in range(k):
                    grad[a] += xi[a] * diff
                    for b in range(a, k):
                        hess[a][b] += w * xi[a] * xi[b]
            for a in range(k):
                for b in range(a):
                    hess[a][b] = hess[b][a]
                if a > 0 and l2_penalty > 0:
                    grad[a] -= l2_penalty * beta[a]
                    hess[a][a] += l2_penalty
                elif l2_penalty == 0:
                    hess[a][a] += 1e-8
            step = _solve_linear(hess, grad)
            if step is None:
                separation_flag = True
                break
            max_step = max(abs(s) for s in step)
            for j in range(k):
                beta[j] += step[j]
            if any(abs(b) > 7.5 for b in beta[1:]):
                separation_flag = True
                break
            if max_step < 1e-5:
                break

        # Final Hessian covariance
        hess = [[0.0] * k for _ in range(k)]
        ll_model = 0.0
        for xi, yi in zip(rows_x, y_bin):
            eta = max(-20.0, min(20.0, sum(xi[j] * beta[j] for j in range(k))))
            prob = max(1e-9, min(1.0 - 1e-9, 1.0 / (1.0 + math.exp(-eta))))
            ll_model += yi * math.log(prob) + (1.0 - yi) * math.log(1.0 - prob)
            w = max(1e-6, prob * (1.0 - prob))
            for a in range(k):
                for b in range(a, k):
                    hess[a][b] += w * xi[a] * xi[b]
        for a in range(k):
            for b in range(a):
                hess[a][b] = hess[b][a]
            if a > 0 and l2_penalty > 0:
                hess[a][a] += l2_penalty
            else:
                hess[a][a] += 1e-6
        cov = _invert_matrix(hess) or [[1.0 if i == j else 0.0 for j in range(k)] for i in range(k)]

        pseudo_r2 = 1.0 - (ll_model / ll_null) if ll_null < -1e-12 else 0.0
        lr_chi2 = max(0.0, 2.0 * (ll_model - ll_null))
        lr_p = _chi2_p_value(lr_chi2, len(predictors))
        diagnostics: list[str] = []
        if separation_flag and l2_penalty == 0.0:
            diagnostics.append("SEPARATION_DETECTED:UNPENALIZED_LOGIT_UNSTABLE")
        elif l2_penalty > 0.0:
            diagnostics.append(f"PENALIZED_LOGIT_L2:{_r(l2_penalty, 2)}")

        tbl_rows: list[list[Any]] = []
        for j, name in enumerate(["截距 (Intercept)", *predictors]):
            se = math.sqrt(max(1e-12, cov[j][j]))
            wald_z = beta[j] / se
            p_val = _norm_p_two_tailed(wald_z)
            b_clip = max(-20.0, min(20.0, beta[j]))
            or_val = math.exp(b_clip)
            or_lo = math.exp(max(-20.0, b_clip - 1.96 * se))
            or_hi = math.exp(min(20.0, b_clip + 1.96 * se))
            tbl_rows.append([
                name, _r(beta[j]), _r(se), _r(or_val, 3), f"[{_r(or_lo, 2)}, {_r(or_hi, 2)}]",
                _r(wald_z, 3), _r(p_val),
            ])
        return self._record_receipt(
            operator="fit_logistic_regression",
            params={"outcome": outcome, "predictors": predictors, "positive_code": positive_code, "l2_penalty": l2_penalty},
            n_effective=n,
            summary=(
                f"{'L2 惩罚' if l2_penalty > 0 else '标准'}二元 Logistic（Y={outcome}, 正类占比={_r(pos_rate * 100, 1)}%, n={n}）："
                f"LR χ²={_r(lr_chi2, 2)}（{_fmt_p(lr_p)}），McFadden 伪 R²={_r(pseudo_r2, 3)}。"
                + (" 检测到准完全分离或标准误膨胀，请启用 l2_penalty>0 重新稳健估计。" if separation_flag and l2_penalty == 0 else "")
            ),
            metrics=[
                {"label": "LR χ²", "value": _r(lr_chi2, 2)},
                {"label": "McFadden 伪 R²", "value": _r(pseudo_r2)},
                {"label": "正类样本占比", "value": _r(pos_rate)},
            ],
            diagnostics=diagnostics,
            headers=["变量", "Logit B", "SE", "OR (exp(B))", "OR 95% CI", "Wald z", "p 值"],
            rows=tbl_rows,
            chart={
                "kind": "bar",
                "title": f"{outcome} 二元 Logistic 优势比 OR (exp(B))",
                "categories": [str(r[0]) for r in tbl_rows[1:]],
                "values": [r[3] if isinstance(r[3], (int, float)) else 1.0 for r in tbl_rows[1:]],
            } if len(tbl_rows) > 1 else None,
        )

    # ---- Operator 8: Mediation Effect with Deterministic Bootstrap CI ----
    def test_mediation_effect(
        self,
        predictor: str,
        mediator: str,
        outcome: str,
        bootstrap_samples: int = 200,
        seed: int = 42,
    ) -> ToolResult:
        matrix, _ = self._complete_numeric_matrix([predictor, mediator, outcome])
        n = len(matrix)
        if n < 15:
            raise ValueError("insufficient_rows_for_mediation")

        def _estimate(rows: list[list[float]]) -> tuple[float, float, float, float, float, float]:
            # X = row[0], M = row[1], Y = row[2]
            x_mat = [[1.0, r[0]] for r in rows]
            y_m = [r[1] for r in rows]
            y_y = [r[2] for r in rows]
            b_a = _solve_linear(_xtx(x_mat), _xty(x_mat, y_m)) or [0.0, 0.0]
            b_tot = _solve_linear(_xtx(x_mat), _xty(x_mat, y_y)) or [0.0, 0.0]
            xm_mat = [[1.0, r[0], r[1]] for r in rows]
            xtx_xm = _xtx(xm_mat)
            b_full = _solve_linear(xtx_xm, _xty(xm_mat, y_y)) or [0.0, 0.0, 0.0]
            a_coef = b_a[1]
            c_tot = b_tot[1]
            c_direct = b_full[1]
            b_coef = b_full[2]
            # SEs for Sobel
            res_a = [rows[i][1] - (b_a[0] + a_coef * rows[i][0]) for i in range(len(rows))]
            s2_a = sum(e * e for e in res_a) / max(1, len(rows) - 2)
            inv_x = _invert_matrix(_xtx(x_mat)) or [[1.0, 0.0], [0.0, 1.0]]
            se_a = math.sqrt(max(1e-12, s2_a * inv_x[1][1]))
            res_y = [rows[i][2] - (b_full[0] + c_direct * rows[i][0] + b_coef * rows[i][1]) for i in range(len(rows))]
            s2_y = sum(e * e for e in res_y) / max(1, len(rows) - 3)
            inv_xm = _invert_matrix(xtx_xm) or [[1.0 if i == j else 0.0 for j in range(3)] for i in range(3)]
            se_b = math.sqrt(max(1e-12, s2_y * inv_xm[2][2]))
            sobel_se = math.sqrt(max(1e-12, b_coef * b_coef * se_a * se_a + a_coef * a_coef * se_b * se_b))
            sobel_z = (a_coef * b_coef) / sobel_se
            return a_coef, b_coef, c_tot, c_direct, a_coef * b_coef, sobel_z

        a_hat, b_hat, c_hat, c_prime, ab_hat, sobel_z = _estimate(matrix)
        sobel_p = _norm_p_two_tailed(sobel_z)
        rng = random.Random(seed)
        boot_vals: list[float] = []
        boots = max(50, min(500, int(bootstrap_samples)))
        for _ in range(boots):
            sample = [matrix[rng.randrange(n)] for _ in range(n)]
            _, _, _, _, ab_b, _ = _estimate(sample)
            boot_vals.append(ab_b)
        ci_lo = _quantile(boot_vals, 0.025)
        ci_hi = _quantile(boot_vals, 0.975)
        sig_ind = not (ci_lo <= 0.0 <= ci_hi)
        med_type = "none"
        if sig_ind:
            if (ab_hat * c_prime) < 0:
                med_type = "suppressor"
            elif abs(c_hat) > 1e-9 and abs(c_prime) < abs(c_hat) * 0.15:
                med_type = "full"
            else:
                med_type = "partial"
        share_pct = (100.0 * ab_hat / c_hat) if (sig_ind and abs(c_hat) > 1e-6 and (ab_hat * c_hat) > 0) else None
        diagnostics = [f"MEDIATION_TYPE:{med_type.upper()}"]
        return self._record_receipt(
            operator="test_mediation_effect",
            params={"predictor": predictor, "mediator": mediator, "outcome": outcome, "bootstrap_samples": boots, "seed": seed},
            n_effective=n,
            summary=(
                f"中介检验（{predictor} → {mediator} → {outcome}, n={n}）：总效应 c={_r(c_hat, 3)}，直接效应 c'={_r(c_prime, 3)}，"
                f"间接效应 a×b={_r(ab_hat, 3)}（Bootstrap 95% CI [{_r(ci_lo, 3)}, {_r(ci_hi, 3)}]，Sobel z={_r(sobel_z, 2)}），"
                f"判定为 {med_type} 中介。"
            ),
            metrics=[
                {"label": "总效应 c", "value": _r(c_hat)},
                {"label": "直接效应 c'", "value": _r(c_prime)},
                {"label": "间接效应 a×b", "value": _r(ab_hat)},
                {"label": "Bootstrap 下界", "value": _r(ci_lo)},
                {"label": "Bootstrap 上界", "value": _r(ci_hi)},
                {"label": "中介占比(%)", "value": _r(share_pct, 1)},
            ],
            diagnostics=diagnostics,
            headers=["路径参数", "估计值", "95% Boot CI / z", "检验结论"],
            rows=[
                [f"路径 a ({predictor}→{mediator})", _r(a_hat), "-", "显著" if abs(a_hat) > 0.05 else "较弱"],
                [f"路径 b ({mediator}→{outcome})", _r(b_hat), "-", "控制X后中介效应"],
                [f"总效应 c", _r(c_hat), "-", "-"],
                [f"直接效应 c'", _r(c_prime), "-", "-"],
                [f"间接效应 a×b", _r(ab_hat), f"[{_r(ci_lo, 3)}, {_r(ci_hi, 3)}]", f"{_fmt_p(sobel_p)} · {med_type}"],
            ],
            chart={
                "kind": "bar",
                "title": f"中介效应分解 ({predictor}→{mediator}→{outcome})",
                "categories": ["总效应 c", "直接效应 c'", "间接效应 a×b"],
                "values": [_r(c_hat, 3) or 0.0, _r(c_prime, 3) or 0.0, _r(ab_hat, 3) or 0.0],
            },
        )

    # ---- Operator 9: Subgroup Heterogeneity & Simpson's Paradox Scanner ----
    def scan_subgroup_heterogeneity(
        self,
        outcome: str,
        predictor: str,
        moderators: list[str],
    ) -> ToolResult:
        out_key, out_meta = self._resolve_var(outcome)
        pred_key, pred_meta = self._resolve_var(predictor)
        # Baseline full-sample slope
        full_pairs: list[tuple[float, float]] = []
        for r in self.active_rows:
            x = self._numeric_val(r, pred_key, pred_meta)
            y = self._numeric_val(r, out_key, out_meta)
            if x is not None and y is not None:
                full_pairs.append((x, y))
        if len(full_pairs) < 12:
            raise ValueError("insufficient_rows_for_subgroup_scan")
        overall_r, overall_p = _pearson([p[0] for p in full_pairs], [p[1] for p in full_pairs])

        def _slope(pairs: list[tuple[float, float]]) -> tuple[float, float]:
            mx = mean(p[0] for p in pairs)
            my = mean(p[1] for p in pairs)
            sxx = sum((p[0] - mx) ** 2 for p in pairs)
            if sxx <= 1e-12:
                return 0.0, 1.0
            b = sum((p[0] - mx) * (p[1] - my) for p in pairs) / sxx
            ssr = sum((p[1] - (my + b * (p[0] - mx))) ** 2 for p in pairs)
            se = math.sqrt(max(1e-12, (ssr / max(1, len(pairs) - 2)) / sxx))
            t_v = b / se
            return b, _t_p_two_tailed(t_v, float(max(1, len(pairs) - 2)))

        overall_slope, overall_slope_p = _slope(full_pairs)
        diagnostics: list[str] = []
        rows_tbl: list[list[Any]] = [
            ["全样本基准 (Overall)", "全部", len(full_pairs), _r(overall_r, 3), _r(overall_slope, 3), _r(overall_slope_p), "基准主效应"],
        ]
        reversals: list[dict[str, Any]] = []
        for mod in moderators:
            m_key, m_meta = self._resolve_var(mod)
            m_kind = m_meta.get("type", "single") if m_meta else "single"
            labels_map = (
                {str(c["code"]): str(c["label"]) for c in m_meta.get("choices", [])}
                if m_meta else {}
            )
            buckets: dict[str, list[tuple[float, float]]] = {}
            if m_kind in ("number", "likert"):
                # Split at median
                m_nums = [self._numeric_val(r, m_key, m_meta) for r in self.active_rows]
                valid_m = [v for v in m_nums if v is not None]
                cut = median(valid_m) if valid_m else 0.0
                for r in self.active_rows:
                    x = self._numeric_val(r, pred_key, pred_meta)
                    y = self._numeric_val(r, out_key, out_meta)
                    m_v = self._numeric_val(r, m_key, m_meta)
                    if x is None or y is None or m_v is None:
                        continue
                    grp = f"{mod}≤{_r(cut, 1)}" if m_v <= cut else f"{mod}>{_r(cut, 1)}"
                    buckets.setdefault(grp, []).append((x, y))
            else:
                for r in self.active_rows:
                    x = self._numeric_val(r, pred_key, pred_meta)
                    y = self._numeric_val(r, out_key, out_meta)
                    m_v = self._raw_val(r, m_key, m_meta)
                    if x is None or y is None or m_v is None or isinstance(m_v, list):
                        continue
                    grp = labels_map.get(str(m_v), str(m_v))
                    buckets.setdefault(grp, []).append((x, y))

            stratum_stats: list[tuple[str, float, float, int]] = []
            for grp, pairs in buckets.items():
                if len(pairs) < MIN_CELL_N:
                    diagnostics.append(f"SMALL_STRATUM_SUPPRESSED:{mod}={grp}")
                    continue
                r_sub, _ = _pearson([p[0] for p in pairs], [p[1] for p in pairs])
                b_sub, p_sub = _slope(pairs)
                stratum_stats.append((grp, b_sub, p_sub, len(pairs)))
                note = "正向驱动" if (b_sub > 0 and p_sub < 0.05) else ("负向抑制" if (b_sub < 0 and p_sub < 0.05) else "不显著")
                rows_tbl.append([mod, grp, len(pairs), _r(r_sub, 3), _r(b_sub, 3), _r(p_sub), note])

            sig_pos = [s for s in stratum_stats if s[1] > 0.05 and s[2] < 0.05]
            sig_neg = [s for s in stratum_stats if s[1] < -0.05 and s[2] < 0.05]
            if sig_pos and sig_neg:
                diagnostics.append(f"SUBGROUP_SIGN_REVERSAL:{mod}")
                reversals.append({
                    "moderator": mod,
                    "positive_stratum": {"group": sig_pos[0][0], "slope": _r(sig_pos[0][1], 3), "p": _r(sig_pos[0][2]), "n": sig_pos[0][3]},
                    "negative_stratum": {"group": sig_neg[0][0], "slope": _r(sig_neg[0][1], 3), "p": _r(sig_neg[0][2]), "n": sig_neg[0][3]},
                    "overall_slope": _r(overall_slope, 3),
                    "overall_p": _r(overall_slope_p),
                })

        summary = (
            f"子群异质性扫描（{predictor} → {outcome}）：全样本斜率 B={_r(overall_slope, 3)}（{_fmt_p(overall_slope_p)}）。"
            + (
                f" 在调节变量 {reversals[0]['moderator']} 上出现辛普森悖论式方向反转，"
                f"“{reversals[0]['positive_stratum']['group']}”斜率={reversals[0]['positive_stratum']['slope']}（{_fmt_p(reversals[0]['positive_stratum']['p'])}），"
                f"而“{reversals[0]['negative_stratum']['group']}”斜率={reversals[0]['negative_stratum']['slope']}（{_fmt_p(reversals[0]['negative_stratum']['p'])}）！"
                if reversals
                else " 各主要分层斜率方向基本一致。"
            )
        )
        return self._record_receipt(
            operator="scan_subgroup_heterogeneity",
            params={"outcome": outcome, "predictor": predictor, "moderators": moderators},
            n_effective=len(full_pairs),
            summary=summary,
            metrics=[
                {"label": "全样本斜率 B", "value": _r(overall_slope, 3)},
                {"label": "全样本 p 值", "value": _r(overall_slope_p)},
                {"label": "子群符号反转数", "value": len(reversals)},
            ],
            diagnostics=diagnostics,
            headers=["调节维度", "子群分组", "n", "相关 r", "斜率 B", "p 值", "子群结论"],
            rows=rows_tbl,
            chart={
                "kind": "bar",
                "title": f"{predictor} → {outcome} 子群调节斜率 B 对比",
                "categories": [
                    "全样本基准" if i == 0 else f"{r[0]}:{r[1]}"
                    for i, r in enumerate(rows_tbl[:16])
                ],
                "values": [
                    r[4] if isinstance(r[4], (int, float)) else 0.0
                    for r in rows_tbl[:16]
                ],
            } if rows_tbl else None,
            extra={"reversals": reversals},
        )

    # ---- Operator 10: Harman Single-Factor CMB & Wald-Wolfowitz Runs Test ----
    def check_common_method_bias(
        self,
        variables: list[str],
        sequence_var: str | None = None,
    ) -> ToolResult:
        if len(variables) < 3:
            raise ValueError("need_at_least_3_variables_for_cmb")
        cols = variables[:20]
        target_vars = cols + ([sequence_var] if sequence_var and sequence_var not in cols else [])
        matrix, _ = self._complete_numeric_matrix(target_vars)
        n = len(matrix)
        if n < 15:
            raise ValueError("insufficient_rows_for_cmb")

        k = len(cols)
        col_vecs = [[row[j] for row in matrix] for j in range(k)]
        corr_mat = [[1.0 if i == j else 0.0 for j in range(k)] for i in range(k)]
        for i in range(k):
            for j in range(i + 1, k):
                r_val, _ = _pearson(col_vecs[i], col_vecs[j])
                r_clean = r_val if r_val is not None else 0.0
                corr_mat[i][j] = r_clean
                corr_mat[j][i] = r_clean

        lambda1 = _dominant_eigenvalue(corr_mat)
        harman_pct = min(100.0, max(0.0, 100.0 * lambda1 / k))

        if sequence_var:
            seq_idx = target_vars.index(sequence_var)
            seq_vals = [row[seq_idx] for row in matrix]
        else:
            seq_vals = [sum(row[:k]) / k for row in matrix]

        med_val = median(seq_vals)
        signs = [1 if v > med_val else 0 for v in seq_vals if v != med_val]
        n1 = sum(signs)
        n2 = len(signs) - n1
        if n1 >= 2 and n2 >= 2:
            runs_obs = 1 + sum(1 for i in range(1, len(signs)) if signs[i] != signs[i - 1])
            denom = float(n1 + n2)
            mu_runs = (2.0 * n1 * n2) / denom + 1.0
            var_runs = (2.0 * n1 * n2 * (2.0 * n1 * n2 - denom)) / (denom * denom * (denom - 1.0))
            sigma_runs = math.sqrt(max(0.0, var_runs))
            z_runs = (runs_obs - mu_runs) / sigma_runs if sigma_runs > 1e-12 else 0.0
            p_runs = _norm_p_two_tailed(z_runs) if sigma_runs > 1e-12 else 1.0
        else:
            runs_obs = 1 if signs else 0
            mu_runs = float(runs_obs)
            sigma_runs = 0.0
            z_runs = 0.0
            p_runs = 1.0

        diagnostics: list[str] = []
        if harman_pct >= 40.0:
            diagnostics.append("COMMON_METHOD_BIAS_RISK_GE_40PCT")
        else:
            diagnostics.append("HARMAN_CMB_PASS")
        if sigma_runs > 1e-12 and abs(z_runs) > 1.96:
            diagnostics.append("NON_RANDOM_RUNS_SEQUENCE")

        return self._record_receipt(
            operator="check_common_method_bias",
            params={"variables": cols, "sequence_var": sequence_var},
            n_effective=n,
            summary=(
                f"共同方法偏差与游程随机性检验（{k} 题项, n={n}）：Harman 单因子最大特征根 λ₁={_r(lambda1, 3)}，"
                f"首因子解释方差 {round(harman_pct, 2)}%（{'≥40% 存在共同方法偏差风险' if harman_pct >= 40.0 else '<40% 未见严重共同方法偏差'}）；"
                f"Wald-Wolfowitz 游程数 R={runs_obs}（期望 {_r(mu_runs, 1)}，z={_r(z_runs, 2)}，{_fmt_p(p_runs)}）。"
            ),
            metrics=[
                {"label": "Harman 首因子方差(%)", "value": _r(harman_pct, 2)},
                {"label": "最大特征根 λ1", "value": _r(lambda1, 3)},
                {"label": "游程数 R", "value": runs_obs},
                {"label": "游程 Z 统计量", "value": _r(z_runs, 3)},
                {"label": "游程 p 值", "value": _r(p_runs)},
            ],
            diagnostics=diagnostics,
            headers=["质控检验项", "样本 n / 维数", "核心统计量", "阈值 / p 值", "诊断结论"],
            rows=[
                [
                    "Harman 单因子方差占比",
                    f"n={n}, k={k}",
                    f"{_r(harman_pct, 2)}% (λ₁={_r(lambda1, 2)})",
                    "< 40.0%",
                    "风险偏高(≥40%)" if harman_pct >= 40.0 else "通过(<40%)",
                ],
                [
                    f"Wald-Wolfowitz 游程检验 ({sequence_var or '行均值序列'})",
                    f"n₁={n1}, n₂={n2}",
                    f"R={runs_obs} (E={_r(mu_runs, 1)}, z={_r(z_runs, 2)})",
                    f"{_fmt_p(p_runs)}",
                    "序列非随机(聚类)" if (sigma_runs > 1e-12 and abs(z_runs) > 1.96) else "序列随机性通过",
                ],
            ],
            chart={
                "kind": "bar",
                "title": "Harman 单因子共同方法偏差方差占比 vs 40% 阈值",
                "categories": ["首因子方差占比(%)", "40% 警戒阈值"],
                "values": [_r(harman_pct, 2) or 0.0, 40.0],
            },
            extra={"harman_pct": _r(harman_pct, 2), "runs": runs_obs, "z_runs": _r(z_runs, 3), "p_runs": _r(p_runs)},
        )

    # ---- Operator 11: Spearman / Pearson Pairwise Correlation Matrix ----
    def compute_correlation_matrix(
        self,
        variables: list[str],
        method: str = "spearman",
    ) -> ToolResult:
        mode = method.lower()
        if mode not in ("spearman", "pearson"):
            raise ValueError("correlation_method_must_be_spearman_or_pearson")
        if len(variables) < 2:
            raise ValueError("need_at_least_2_variables_for_correlation")
        cols = variables[:10]
        matrix, _ = self._complete_numeric_matrix(cols)
        n = len(matrix)
        if n < 10:
            raise ValueError("insufficient_rows_for_correlation")

        k = len(cols)
        col_vecs = [[row[j] for row in matrix] for j in range(k)]
        proc_vecs = [_average_ranks(vec)[0] if mode == "spearman" else vec for vec in col_vecs]

        pair_rows: list[list[Any]] = []
        high_pairs: list[str] = []
        diagnostics: list[str] = []
        chart_cats: list[str] = []
        chart_vals: list[float] = []
        max_abs_r = 0.0

        for i in range(k):
            for j in range(i + 1, k):
                r_val, p_val = _pearson(proc_vecs[i], proc_vecs[j])
                r_num = r_val if r_val is not None else 0.0
                p_num = p_val if p_val is not None else 1.0
                abs_r = abs(r_num)
                if abs_r > max_abs_r:
                    max_abs_r = abs_r
                t_val = r_num * math.sqrt((n - 2) / max(1e-12, 1.0 - r_num * r_num)) if abs_r < 1.0 - 1e-12 else 0.0
                strength = "极强相关(|r|≥0.8)" if abs_r >= 0.8 else "中高相关" if abs_r >= 0.4 else "中弱/弱相关"
                if abs_r >= 0.80:
                    diagnostics.append(f"HIGH_PAIRWISE_CORRELATION:{cols[i]}~{cols[j]}")
                    high_pairs.append(f"{cols[i]}~{cols[j]}")
                pair_rows.append([f"{cols[i]} × {cols[j]}", _r(r_num, 3), _r(t_val, 2), _r(p_num), strength])
                if len(chart_cats) < 12:
                    chart_cats.append(f"{cols[i]}×{cols[j]}")
                    chart_vals.append(_r(abs_r, 3) or 0.0)

        label_coef = "Spearman ρ" if mode == "spearman" else "Pearson r"
        return self._record_receipt(
            operator="compute_correlation_matrix",
            params={"variables": cols, "method": mode},
            n_effective=n,
            summary=(
                f"{label_coef} 双变量相关矩阵（{k} 变量, n={n}, 共 {len(pair_rows)} 对）：最大 |r|={_r(max_abs_r, 3)}"
                + (f"；检测到 {len(high_pairs)} 对高共线风险（≥0.80：{', '.join(high_pairs[:3])}）。" if high_pairs else "；未发现 ≥0.80 高度共线对。")
            ),
            metrics=[
                {"label": f"最大 |{label_coef}|", "value": _r(max_abs_r, 3)},
                {"label": "高相关变量对(|r|≥0.80)", "value": len(high_pairs)},
                {"label": "有效样本 n", "value": n},
            ],
            diagnostics=diagnostics,
            headers=["配对变量", label_coef, "t 统计量", "p 值", "相关强度判定"],
            rows=pair_rows[:40],
            chart={
                "kind": "bar",
                "title": f"{label_coef} 配对绝对相关系数 |r| 排序",
                "categories": chart_cats,
                "values": chart_vals,
            } if chart_cats else None,
        )

    # ---- Operator 12: Staggered DID Group-Time ATT & Goodman-Bacon TWFE Check ----
    def estimate_staggered_did_att(
        self,
        outcome: str,
        time_var: str,
        cohort_var: str,
        never_treated_value: float = 0.0,
    ) -> ToolResult:
        matrix, labels = self._complete_numeric_matrix([outcome, time_var, cohort_var])
        n = len(matrix)
        if n < 16:
            raise ValueError("insufficient_rows_for_staggered_did")

        cells: dict[tuple[float, float], list[float]] = {}
        periods_set: set[float] = set()
        cohorts_set: set[float] = set()
        for y_val, t_val, g_val in matrix:
            periods_set.add(t_val)
            cohorts_set.add(g_val)
            cells.setdefault((g_val, t_val), []).append(y_val)

        periods = sorted(periods_set)
        treated_cohorts = sorted(g for g in cohorts_set if abs(g - never_treated_value) > 1e-9)
        if len(periods) < 2 or not treated_cohorts:
            raise ValueError("staggered_did_requires_multiple_periods_and_treated_cohort")

        def _cell_stats(cohorts: list[float], period: float) -> tuple[float, float, int] | None:
            vals: list[float] = []
            for c in cohorts:
                vals.extend(cells.get((c, period), []))
            if not vals:
                return None
            mean_v = sum(vals) / len(vals)
            var_v = sum((x - mean_v) ** 2 for x in vals) / max(1, len(vals) - 1) if len(vals) > 1 else 0.0
            return mean_v, var_v, len(vals)

        gt_rows: list[list[Any]] = []
        post_atts: list[tuple[float, float, int, int, float]] = []
        event_buckets: dict[int, list[tuple[float, int]]] = {}

        for g in treated_cohorts:
            pre_periods = [t for t in periods if t < g and (g, t) in cells]
            if not pre_periods:
                continue
            t_base = max(pre_periods)
            g_base = _cell_stats([g], t_base)
            if not g_base:
                continue
            for t in periods:
                if abs(t - t_base) < 1e-9 or (g, t) not in cells:
                    continue
                clean_controls = [
                    c for c in cohorts_set
                    if abs(c - never_treated_value) <= 1e-9 or c > max(t, g)
                ]
                c_t = _cell_stats(clean_controls, t)
                c_base = _cell_stats(clean_controls, t_base)
                g_t = _cell_stats([g], t)
                if not c_t or not c_base or not g_t:
                    continue
                att_gt = (g_t[0] - g_base[0]) - (c_t[0] - c_base[0])
                var_gt = (
                    (g_t[1] / g_t[2])
                    + (g_base[1] / g_base[2])
                    + (c_t[1] / c_t[2])
                    + (c_base[1] / c_base[2])
                )
                se_gt = math.sqrt(max(1e-12, var_gt))
                df_gt = max(2, g_t[2] + c_t[2] - 2)
                t_stat = att_gt / se_gt
                p_gt = _t_p_two_tailed(t_stat, float(df_gt))
                e_bin = int(round(t - g))
                event_buckets.setdefault(e_bin, []).append((att_gt, g_t[2]))
                gt_rows.append([
                    f"G={_r(g, 1)} | t={_r(t, 1)} (e={e_bin:+d})",
                    g_t[2] + c_t[2],
                    _r(att_gt, 4),
                    _r(se_gt, 4),
                    _r(p_gt),
                ])
                if t >= g - 1e-9:
                    post_atts.append((att_gt, var_gt, g_t[2], c_t[2], p_gt))

        if not post_atts:
            raise ValueError("no_valid_post_treatment_gt_cells_for_staggered_did")

        total_w = sum(w for _, _, w, _, _ in post_atts)
        overall_att = sum(att * w for att, _, w, _, _ in post_atts) / max(1, total_w)
        overall_var = sum(((w / max(1, total_w)) ** 2) * v for _, v, w, _, _ in post_atts)
        overall_se = math.sqrt(max(1e-12, overall_var))
        overall_t = overall_att / overall_se
        overall_p = _t_p_two_tailed(overall_t, float(max(2, n - len(periods) - len(cohorts_set))))

        # Static TWFE two-way within estimator via alternating cohort/period demeaning
        g_vals = [row[2] for row in matrix]
        t_vals = [row[1] for row in matrix]
        y_res = [row[0] for row in matrix]
        d_res = [1.0 if (abs(g_vals[i] - never_treated_value) > 1e-9 and t_vals[i] >= g_vals[i] - 1e-9) else 0.0 for i in range(n)]

        def _demean_by(arr: list[float], keys: list[float]) -> list[float]:
            sums: dict[float, float] = {}
            cnts: dict[float, int] = {}
            for v, k in zip(arr, keys):
                sums[k] = sums.get(k, 0.0) + v
                cnts[k] = cnts.get(k, 0) + 1
            return [v - sums[k] / cnts[k] for v, k in zip(arr, keys)]

        for _ in range(25):
            y_res = _demean_by(_demean_by(y_res, g_vals), t_vals)
            d_res = _demean_by(_demean_by(d_res, g_vals), t_vals)

        dd_denom = sum(d * d for d in d_res)
        static_twfe_beta = sum(d * y for d, y in zip(d_res, y_res)) / dd_denom if dd_denom > 1e-10 else 0.0

        forbidden_pairs = 0
        for g_early in treated_cohorts:
            for g_late in treated_cohorts:
                if g_late > g_early and any(t >= g_early for t in periods if t < g_late) and any(t >= g_late for t in periods):
                    forbidden_pairs += 1

        twfe_gap = abs(static_twfe_beta - overall_att)
        negative_weight_risk = (
            len(treated_cohorts) >= 2
            and forbidden_pairs > 0
            and (
                (static_twfe_beta * overall_att < 0 and abs(overall_att) > 0.05)
                or twfe_gap >= max(0.15, 0.25 * abs(overall_att))
            )
        )
        diagnostics = [
            "TWFE_NEGATIVE_WEIGHT_DISTORTION" if negative_weight_risk else "STAGGERED_DID_CLEAN_IDENTIFICATION"
        ]

        sorted_events = sorted(event_buckets.keys())
        event_estimates: list[dict[str, Any]] = []
        chart_cats: list[str] = []
        chart_vals: list[float] = []
        for e_bin in sorted_events[:14]:
            pts = event_buckets[e_bin]
            ew = sum(w for _, w in pts)
            e_att = sum(a * w for a, w in pts) / max(1, ew)
            event_estimates.append({"event_time": e_bin, "att": _r(e_att, 4), "treated_n": ew})
            chart_cats.append(f"e={e_bin:+d}")
            chart_vals.append(_r(e_att, 3) or 0.0)

        return self._record_receipt(
            operator="estimate_staggered_did_att",
            params={
                "outcome": labels[0],
                "time_var": labels[1],
                "cohort_var": labels[2],
                "never_treated_value": never_treated_value,
            },
            n_effective=n,
            summary=(
                f"Callaway-Sant'Anna 交错 DID ({len(treated_cohorts)} 个处理队列, n={n})："
                f"聚合 ATT={_r(overall_att, 4)} (SE={_r(overall_se, 4)}, {_fmt_p(overall_p)})；"
                f"对照静态 TWFE={_r(static_twfe_beta, 4)}"
                + (f" — 警告：存在 {forbidden_pairs} 对已处理控制组引起 TWFE 负权重偏移！" if negative_weight_risk else " — 未见显著负权重偏误。")
            ),
            metrics=[
                {"label": "CS 聚合 ATT", "value": _r(overall_att, 4)},
                {"label": "静态 TWFE β", "value": _r(static_twfe_beta, 4)},
                {"label": "CS 双侧 p", "value": _r(overall_p)},
                {"label": "禁用控制对数", "value": forbidden_pairs},
            ],
            diagnostics=diagnostics,
            headers=["组别 / 事件期", "净对照样本 n", "ATT(g,t)", "SE", "p 值"],
            rows=gt_rows[:35],
            chart={
                "kind": "bar",
                "title": "交错 DID 动态事件研究 ATT(e) 演化",
                "categories": chart_cats,
                "values": chart_vals,
            } if chart_cats else None,
            extra={
                "overall_att": _r(overall_att, 4),
                "overall_se": _r(overall_se, 4),
                "overall_p": _r(overall_p),
                "static_twfe_beta": _r(static_twfe_beta, 4),
                "cohort_count": len(treated_cohorts),
                "forbidden_pairs": forbidden_pairs,
                "event_estimates": event_estimates,
            },
        )

    # ---- Operator 13: Distribution-Free Split Conformal Prediction Interval ----
    def compute_conformal_prediction_band(
        self,
        outcome: str,
        predictors: list[str],
        alpha: float = 0.10,
        calibration_ratio: float = 0.35,
    ) -> ToolResult:
        if not predictors:
            raise ValueError("need_at_least_1_predictor_for_conformal")
        if not (0.01 <= alpha <= 0.45):
            raise ValueError("conformal_alpha_out_of_range")
        if not (0.20 <= calibration_ratio <= 0.60):
            raise ValueError("calibration_ratio_out_of_range")

        cols = [outcome] + predictors[:8]
        matrix, labels = self._complete_numeric_matrix(cols)
        n = len(matrix)
        k = len(predictors[:8])
        if n < max(18, k + 12):
            raise ValueError("insufficient_rows_for_split_conformal")

        n_cal = max(6, min(n - k - 5, int(round(n * calibration_ratio))))
        cal_indices: set[int] = set()
        for step in range(n_cal):
            candidate = int(step * n / n_cal)
            while candidate in cal_indices and candidate + 1 < n:
                candidate += 1
            cal_indices.add(candidate)

        train_rows = [matrix[i] for i in range(n) if i not in cal_indices]
        cal_rows = [matrix[i] for i in sorted(cal_indices)]
        x_tr = [[1.0] + r[1:] for r in train_rows]
        y_tr = [r[0] for r in train_rows]

        xtx = _xtx(x_tr)
        xty = _xty(x_tr, y_tr)
        beta = _solve_linear(xtx, xty)
        if beta is None:
            reg_xtx = [
                [xtx[i][j] + (1e-6 if i == j else 0.0) for j in range(len(xtx))]
                for i in range(len(xtx))
            ]
            beta = _solve_linear(reg_xtx, xty)
        if beta is None:
            raise ValueError("singular_training_design_matrix_for_conformal")

        train_res = sorted(abs(r[0] - sum(b * xv for b, xv in zip(beta, [1.0] + r[1:]))) for r in train_rows)
        cal_res = sorted(abs(r[0] - sum(b * xv for b, xv in zip(beta, [1.0] + r[1:]))) for r in cal_rows)
        cal_sq_err = sum((r[0] - sum(b * xv for b, xv in zip(beta, [1.0] + r[1:]))) ** 2 for r in cal_rows)
        rmse_cal = math.sqrt(cal_sq_err / len(cal_rows))

        # Finite-sample Split Conformal quantile at ceil((n_cal + 1) * (1 - alpha))
        rank_1based = math.ceil((len(cal_rows) + 1) * (1.0 - alpha))
        q_hat = cal_res[min(len(cal_res) - 1, max(0, rank_1based - 1))]
        covered_cnt = sum(1 for r in cal_res if r <= q_hat + 1e-12)
        emp_cov = covered_cnt / len(cal_rows)
        med_train_res = _quantile(train_res, 0.5)

        y_all = [r[0] for r in matrix]
        y_mean = sum(y_all) / n
        sd_y = math.sqrt(sum((y - y_mean) ** 2 for y in y_all) / max(1, n - 1))
        interval_width = 2.0 * q_hat
        width_ratio = interval_width / max(1e-9, sd_y)
        wide_flag = width_ratio > 2.2

        diagnostics = ["CONFORMAL_CALIBRATED_COVERAGE_OK"]
        if wide_flag:
            diagnostics.append("CONFORMAL_WIDE_INTERVAL_HIGH_UNCERTAINTY")

        target_cov = 1.0 - alpha
        return self._record_receipt(
            operator="compute_conformal_prediction_band",
            params={
                "outcome": labels[0],
                "predictors": labels[1:],
                "alpha": alpha,
                "calibration_ratio": calibration_ratio,
            },
            n_effective=n,
            summary=(
                f"Split Conformal 预测带 ({labels[0]}, 目标覆盖 {target_cov * 100:.1f}%, n_train={len(train_rows)}, n_cal={len(cal_rows)})："
                f"非一致分位半宽 q̂={_r(q_hat, 4)}，全距带宽 2q̂={_r(interval_width, 4)}，"
                f"校准集实测覆盖率={_r(emp_cov * 100, 1)}%（带宽/σ_y={_r(width_ratio, 2)}x）。"
            ),
            metrics=[
                {"label": "Conformal 半宽 q̂", "value": _r(q_hat, 4)},
                {"label": "实测校准覆盖率", "value": _r(emp_cov, 4)},
                {"label": "带宽 / σ_y 倍率", "value": _r(width_ratio, 3)},
                {"label": "校准集 RMSE", "value": _r(rmse_cal, 4)},
            ],
            diagnostics=diagnostics,
            headers=["校准评估维度", "数值结果", "统计学解释与决策边界"],
            rows=[
                ["Proper 训练集 / 校准集", f"{len(train_rows)} / {len(cal_rows)}", f"确定性分层 {int(round(calibration_ratio * 100))}% 无偏校准划分"],
                ["理论目标覆盖率 (1 - α)", f"{target_cov * 100:.1f}%", f"有限样本下界 ≥ {((1.0 - alpha) * 100):.1f}%"],
                ["实测校准集覆盖率", f"{emp_cov * 100:.1f}% ({covered_cnt}/{len(cal_rows)})", "分布自由覆盖率校验通过"],
                ["非一致残差分位半宽 q̂", _r(q_hat, 4), f"预测区间 ŷ ± {_r(q_hat, 4)}（全宽 {_r(interval_width, 4)}）"],
                ["带宽相对离散比 (2q̂/σ_y)", f"{_r(width_ratio, 2)}x", "高波动不确定预警" if wide_flag else "不确定性区间紧致"],
            ],
            chart={
                "kind": "bar",
                "title": "Split Conformal 不确定性尺度对比",
                "categories": ["训练残差中位 |r|", "Conformal 半宽 q̂", "结果变量 σ_y"],
                "values": [_r(med_train_res, 3) or 0.0, _r(q_hat, 3) or 0.0, _r(sd_y, 3) or 0.0],
            },
            extra={
                "q_hat": _r(q_hat, 4),
                "interval_width": _r(interval_width, 4),
                "target_coverage": _r(target_cov, 4),
                "empirical_coverage": _r(emp_cov, 4),
                "n_train": len(train_rows),
                "n_cal": len(cal_rows),
                "interval_to_sd_ratio": _r(width_ratio, 4),
            },
        )

    # ---- Operator 14: Kano Model Attribute Classification & Better-Worse Matrix ----
    def run_kano_better_worse(
        self,
        pairs: list[dict[str, str]],
        scale_max: int = 5,
    ) -> ToolResult:
        if not isinstance(pairs, list) or not pairs:
            raise ValueError("need_at_least_1_kano_pair")
        if scale_max < 3 or scale_max > 11:
            raise ValueError("kano_scale_max_out_of_range")

        def _map_1to5(raw_val: float) -> int:
            if scale_max == 5:
                return max(1, min(5, int(round(raw_val))))
            scaled = 1.0 + 4.0 * ((raw_val - 1.0) / float(scale_max - 1))
            return max(1, min(5, int(round(scaled))))

        def _classify_kano(f_score: int, d_score: int) -> str:
            if f_score == 5:
                if d_score == 1:
                    return "O"
                if d_score in (2, 3, 4):
                    return "A"
                return "Q"
            if f_score in (2, 3, 4):
                if d_score == 1:
                    return "M"
                if d_score in (2, 3, 4):
                    return "I"
                return "R"
            return "Q" if d_score == 1 else "R"

        attr_priority = {"M": 4, "O": 3, "A": 2, "I": 1}
        attr_names = {
            "M": "必备属性 (M)",
            "O": "期望属性 (O)",
            "A": "魅力属性 (A)",
            "I": "无差异 (I)",
            "R/Q": "反向/可疑 (R/Q)",
        }

        diagnostics: list[str] = []
        rows_out: list[list[Any]] = []
        feature_results: list[dict[str, Any]] = []
        normalized_pairs: list[dict[str, str]] = []
        min_n = len(self.active_rows)

        for pair in pairs[:20]:
            if not isinstance(pair, dict):
                raise ValueError("invalid_kano_pair_entry")
            feature = str(pair.get("feature") or "").strip()
            f_var = str(pair.get("functional_var") or "").strip()
            d_var = str(pair.get("dysfunctional_var") or "").strip()
            if not feature or not f_var or not d_var:
                raise ValueError("incomplete_kano_pair_definition")
            normalized_pairs.append(
                {"feature": feature, "functional_var": f_var, "dysfunctional_var": d_var}
            )
            mat, _ = self._complete_numeric_matrix([f_var, d_var])
            n_pair = len(mat)
            if n_pair == 0:
                raise ValueError(f"empty_paired_rows_for_kano:{feature}")
            min_n = min(min_n, n_pair)
            if n_pair < 20 and "KANO_INSUFFICIENT_PAIRED_N" not in diagnostics:
                diagnostics.append("KANO_INSUFFICIENT_PAIRED_N")

            counts = {"M": 0, "O": 0, "A": 0, "I": 0, "R": 0, "Q": 0}
            for f_raw, d_raw in mat:
                cls = _classify_kano(_map_1to5(f_raw), _map_1to5(d_raw))
                counts[cls] += 1

            moai = counts["M"] + counts["O"] + counts["A"] + counts["I"]
            better = (counts["A"] + counts["O"]) / float(moai) if moai > 0 else 0.0
            worse = -((counts["O"] + counts["M"]) / float(moai)) if moai > 0 else 0.0
            rq_ratio = (counts["R"] + counts["Q"]) / float(n_pair)
            if rq_ratio > 0.15 and "KANO_HIGH_REVERSE_OR_QUESTIONABLE" not in diagnostics:
                diagnostics.append("KANO_HIGH_REVERSE_OR_QUESTIONABLE")

            dom_code = (
                "R/Q"
                if rq_ratio > 0.5
                else max(["M", "O", "A", "I"], key=lambda code: (counts[code], attr_priority[code]))
            )
            dom_label = attr_names[dom_code]
            feature_results.append(
                {
                    "feature": feature,
                    "n": n_pair,
                    "dominant": dom_code,
                    "dominant_label": dom_label,
                    "better": round(better, 4),
                    "worse": round(worse, 4),
                    "rq_ratio": round(rq_ratio, 4),
                    "counts": counts,
                }
            )
            rows_out.append(
                [
                    feature,
                    n_pair,
                    dom_label,
                    _r(better, 3),
                    _r(worse, 3),
                    round(rq_ratio * 100.0, 1),
                ]
            )

        if not diagnostics:
            diagnostics.append("KANO_MATRIX_CONSISTENCY_OK")

        avg_better = mean(item["better"] for item in feature_results)
        avg_abs_worse = mean(abs(item["worse"]) for item in feature_results)
        max_rq_ratio = max(item["rq_ratio"] for item in feature_results)

        return self._record_receipt(
            operator="run_kano_better_worse",
            params={"pairs": normalized_pairs, "scale_max": scale_max},
            n_effective=min_n,
            summary=(
                f"Kano 需求属性与 Better-Worse 分析 ({len(feature_results)} 项特性, n≥{min_n})："
                f"均值 Better={_r(avg_better, 3)}, 均值 |Worse|={_r(avg_abs_worse, 3)}, "
                f"最高反向/可疑率={round(max_rq_ratio * 100.0, 1)}%。"
            ),
            metrics=[
                {"label": "均值 Better 系数", "value": _r(avg_better, 4)},
                {"label": "均值 |Worse| 系数", "value": _r(avg_abs_worse, 4)},
                {"label": "最高反向+可疑率(%)", "value": round(max_rq_ratio * 100.0, 2)},
                {"label": "评估特性数量", "value": len(feature_results)},
            ],
            diagnostics=diagnostics,
            headers=["需求特性", "有效样本", "主导属性", "Better系数", "Worse系数", "反向+可疑(%)"],
            rows=rows_out,
            chart={
                "kind": "bar",
                "title": "Kano Better 满意增益系数对比",
                "categories": [f"{item['feature']}({item['dominant']})" for item in feature_results[:8]],
                "values": [_r(item["better"], 3) or 0.0 for item in feature_results[:8]],
            },
            extra={
                "feature_results": feature_results,
                "avg_better": _r(avg_better, 4),
                "avg_abs_worse": _r(avg_abs_worse, 4),
                "max_rq_ratio": _r(max_rq_ratio, 4),
            },
        )

    # ---- Operator 15: Sharp Regression Discontinuity (Triangular Local Linear + Sensitivity) ----
    def estimate_rdd_sharp_local(
        self,
        outcome: str,
        running_var: str,
        cutoff: float = 0.0,
        bandwidth: float | None = None,
    ) -> ToolResult:
        matrix, labels = self._complete_numeric_matrix([outcome, running_var])
        xc_vals = [row[1] - cutoff for row in matrix]
        y_vals = [row[0] for row in matrix]

        abs_left = sorted(abs(xc) for xc in xc_vals if xc < 0.0)
        abs_right = sorted(abs(xc) for xc in xc_vals if xc >= 0.0)
        if len(abs_left) < 8 or len(abs_right) < 8:
            raise ValueError("insufficient_observations_across_rdd_cutoff")

        n_total = len(xc_vals)
        if bandwidth is None:
            sd_xc = stdev(xc_vals) if n_total >= 2 else 1.0
            h = max(1.84 * max(sd_xc, 1e-6) * (n_total ** -0.2), 1e-6)
            target_side = max(8, int(round(0.15 * n_total)))
            left_req = min(len(abs_left), target_side)
            right_req = min(len(abs_right), target_side)
            left_in = sum(1 for v in abs_left if v < h)
            right_in = sum(1 for v in abs_right if v < h)
            if left_in < left_req:
                h = max(h, abs_left[left_req - 1] * 1.05 + 1e-6)
            if right_in < right_req:
                h = max(h, abs_right[right_req - 1] * 1.05 + 1e-6)
        else:
            if not math.isfinite(float(bandwidth)) or float(bandwidth) <= 0.0:
                raise ValueError("rdd_bandwidth_must_be_positive")
            h = float(bandwidth)

        def _fit_local(bw: float) -> dict[str, Any] | None:
            xs: list[list[float]] = []
            ws: list[float] = []
            ys: list[float] = []
            n_l = 0
            n_r = 0
            for y_i, xc_i in zip(y_vals, xc_vals):
                if abs(xc_i) < bw:
                    d_i = 1.0 if xc_i >= 0.0 else 0.0
                    w_i = 1.0 - abs(xc_i) / bw
                    if w_i <= 1e-9:
                        continue
                    xs.append([1.0, d_i, xc_i, d_i * xc_i])
                    ws.append(w_i)
                    ys.append(y_i)
                    if xc_i < 0.0:
                        n_l += 1
                    else:
                        n_r += 1
            if n_l < 4 or n_r < 4:
                return None

            xtwx = [[0.0] * 4 for _ in range(4)]
            xtwy = [0.0] * 4
            for row, w_i, y_i in zip(xs, ws, ys):
                for a in range(4):
                    xtwy[a] += w_i * row[a] * y_i
                    for b in range(4):
                        xtwx[a][b] += w_i * row[a] * row[b]

            used_xtx = [list(r_vec) for r_vec in xtwx]
            beta = _solve_linear(used_xtx, xtwy)
            if beta is None:
                used_xtx = [
                    [xtwx[a][b] + (1e-8 if a == b else 0.0) for b in range(4)]
                    for a in range(4)
                ]
                beta = _solve_linear(used_xtx, xtwy)
            if beta is None:
                return None
            bread = _invert_matrix(used_xtx)
            if bread is None:
                return None

            meat = [[0.0] * 4 for _ in range(4)]
            for row, w_i, y_i in zip(xs, ws, ys):
                pred = sum(beta[j] * row[j] for j in range(4))
                err = y_i - pred
                bx = [sum(bread[a][b] * row[b] for b in range(4)) for a in range(4)]
                hat_ii = w_i * sum(row[a] * bx[a] for a in range(4))
                scaled = (w_i * err) / max(0.25, 1.0 - hat_ii)
                s2 = scaled * scaled
                for a in range(4):
                    for b in range(4):
                        meat[a][b] += s2 * row[a] * row[b]

            tmp = [
                [sum(bread[a][c] * meat[c][b] for c in range(4)) for b in range(4)]
                for a in range(4)
            ]
            vcov = [
                [sum(tmp[a][c] * bread[c][b] for c in range(4)) for b in range(4)]
                for a in range(4)
            ]
            tau_est = beta[1]
            se_est = math.sqrt(max(1e-18, vcov[1][1]))
            t_stat = tau_est / se_est
            df_est = max(1, (n_l + n_r) - 4)
            p_val = _t_p_two_tailed(t_stat, float(df_est))
            return {
                "bw": bw,
                "n_left": n_l,
                "n_right": n_r,
                "tau": tau_est,
                "se": se_est,
                "p": p_val,
                "ci_lo": tau_est - 1.96 * se_est,
                "ci_hi": tau_est + 1.96 * se_est,
            }

        main_fit = _fit_local(h)
        if main_fit is None:
            raise ValueError("singular_rdd_design_matrix")

        specs: list[tuple[str, float, dict[str, Any] | None]] = [
            ("0.5×窄带宽", 0.5 * h, _fit_local(0.5 * h)),
            ("1.0×主带宽(基准)", h, main_fit),
            ("1.5×宽带宽", 1.5 * h, _fit_local(1.5 * h)),
        ]

        n_l_main = main_fit["n_left"]
        n_r_main = main_fit["n_right"]
        z_density = (n_r_main - n_l_main) / math.sqrt(max(1, n_l_main + n_r_main))

        diagnostics: list[str] = []
        if abs(z_density) > 2.58:
            diagnostics.append("RDD_DENSITY_MANIPULATION_WARNING")

        fit_05 = specs[0][2]
        fit_15 = specs[2][2]
        if fit_05 is not None and fit_15 is not None:
            sign_flip = (fit_05["tau"] * fit_15["tau"]) < 0.0
            wide_swing = abs(fit_05["tau"] - fit_15["tau"]) > 0.5 * max(abs(main_fit["tau"]), 0.1)
            if sign_flip or wide_swing:
                diagnostics.append("RDD_BANDWIDTH_SENSITIVE")

        if not diagnostics:
            diagnostics.append("RDD_LOCAL_CONTINUITY_OK")

        rows_out: list[list[Any]] = []
        chart_cats: list[str] = []
        chart_vals: list[float] = []
        spec_records: list[dict[str, Any]] = []
        for spec_name, bw_val, fit in specs:
            if fit is None:
                rows_out.append([f"{spec_name} (h={_r(bw_val, 3)})", "样本不足(<4/侧)", "—", "—", "—", "—"])
                spec_records.append({"spec": spec_name, "bandwidth": _r(bw_val, 4), "tau": None})
            else:
                rows_out.append(
                    [
                        f"{spec_name} (h={_r(bw_val, 3)})",
                        f"{fit['n_left']} / {fit['n_right']}",
                        _r(fit["tau"], 4),
                        _r(fit["se"], 4),
                        f"[{_r(fit['ci_lo'], 3)}, {_r(fit['ci_hi'], 3)}]",
                        _r(fit["p"], 6),
                    ]
                )
                chart_cats.append(spec_name)
                chart_vals.append(_r(fit["tau"], 4) or 0.0)
                spec_records.append(
                    {
                        "spec": spec_name,
                        "bandwidth": _r(bw_val, 4),
                        "n_left": fit["n_left"],
                        "n_right": fit["n_right"],
                        "tau": _r(fit["tau"], 4),
                        "se": _r(fit["se"], 4),
                        "p_value": _r(fit["p"], 6),
                    }
                )

        n_main = n_l_main + n_r_main
        return self._record_receipt(
            operator="estimate_rdd_sharp_local",
            params={"outcome": labels[0], "running_var": labels[1], "cutoff": cutoff, "bandwidth": _r(h, 4)},
            n_effective=n_main,
            summary=(
                f"Sharp RDD 三角核局部线性估计 ({labels[0]} | {labels[1]} 断点={_r(cutoff, 3)}, "
                f"h={_r(h, 3)}, 左/右={n_l_main}/{n_r_main})：断点跳跃 τ={_r(main_fit['tau'], 4)}, "
                f"稳健 SE={_r(main_fit['se'], 4)}, {_fmt_p(main_fit['p'], 6)}, 密度连续性 z={_r(z_density, 3)}。"
            ),
            metrics=[
                {"label": "断点局部效应 τ", "value": _r(main_fit["tau"], 4)},
                {"label": "稳健 SE", "value": _r(main_fit["se"], 4)},
                {"label": "双侧 p 值", "value": _r(main_fit["p"], 6)},
                {"label": "密度连续性 z", "value": _r(z_density, 4)},
                {"label": "主带宽 h", "value": _r(h, 4)},
            ],
            diagnostics=diagnostics,
            headers=["带宽规格", "有效样本(左/右)", "断点跳跃 τ", "稳健 SE", "95% CI", "p 值"],
            rows=rows_out,
            chart={
                "kind": "bar",
                "title": f"Sharp RDD 多带宽跳跃 τ 敏感性 (cutoff={_r(cutoff, 3)})",
                "categories": chart_cats,
                "values": chart_vals,
            },
            extra={
                "tau": _r(main_fit["tau"], 4),
                "se": _r(main_fit["se"], 4),
                "p_value": _r(main_fit["p"], 6),
                "bandwidth": _r(h, 4),
                "z_density": _r(z_density, 4),
                "n_left": n_l_main,
                "n_right": n_r_main,
                "specs": spec_records,
            },
        )

    # ---- Operator 16: Propensity Score Matching (1:1 Nearest-Neighbor Caliper + SMD Balance) ----
    def run_psm_balance_att(
        self,
        outcome: str,
        treatment: str,
        covariates: list[str],
        caliper: float = 0.20,
    ) -> ToolResult:
        if not covariates:
            raise ValueError("need_at_least_1_covariate_for_psm")
        if not math.isfinite(float(caliper)) or float(caliper) <= 0.0:
            raise ValueError("caliper_must_be_positive")

        cov_subset = covariates[:8]
        cols = [outcome, treatment] + cov_subset
        matrix, labels = self._complete_numeric_matrix(cols)
        n = len(matrix)
        if n < 16:
            raise ValueError("insufficient_rows_for_psm")

        t_vals = [row[1] for row in matrix]
        if any(t not in (0.0, 1.0) for t in t_vals):
            raise ValueError("psm_requires_binary_01_treatment")
        treat_indices = [i for i, t in enumerate(t_vals) if t == 1.0]
        ctrl_indices = [i for i, t in enumerate(t_vals) if t == 0.0]
        if len(treat_indices) < 8 or len(ctrl_indices) < 8:
            raise ValueError("insufficient_group_rows_for_psm")

        k = len(cov_subset)
        col_means = [mean(matrix[i][2 + j] for i in range(n)) for j in range(k)]
        col_sds = [
            max(1e-9, stdev(matrix[i][2 + j] for i in range(n))) if n >= 2 else 1.0
            for j in range(k)
        ]
        x_mat = [
            [1.0] + [(matrix[i][2 + j] - col_means[j]) / col_sds[j] for j in range(k)]
            for i in range(n)
        ]

        l2 = 0.05
        beta = [0.0] * (k + 1)
        for _ in range(25):
            probs: list[float] = []
            grad = [0.0] * (k + 1)
            hess = [[0.0] * (k + 1) for _ in range(k + 1)]
            for i in range(n):
                eta = max(-25.0, min(25.0, sum(beta[j] * x_mat[i][j] for j in range(k + 1))))
                p = 1.0 / (1.0 + math.exp(-eta))
                probs.append(p)
                diff = t_vals[i] - p
                w = max(1e-8, p * (1.0 - p))
                for a in range(k + 1):
                    grad[a] += diff * x_mat[i][a]
                    for b in range(k + 1):
                        hess[a][b] += w * x_mat[i][a] * x_mat[i][b]
            for j in range(1, k + 1):
                grad[j] -= l2 * beta[j]
                hess[j][j] += l2
            hess[0][0] += 1e-8
            step = _solve_linear(hess, grad)
            if step is None:
                break
            for j in range(k + 1):
                beta[j] += step[j]
            if max(abs(v) for v in step) < 1e-6:
                break

        logit_ps: list[float] = []
        for i in range(n):
            eta = max(-14.0, min(14.0, sum(beta[j] * x_mat[i][j] for j in range(k + 1))))
            logit_ps.append(eta)

        sd_logit = stdev(logit_ps) if len(logit_ps) >= 2 else 1.0
        cal_tol = float(caliper) * max(sd_logit, 1e-4)

        used_ctrl: set[int] = set()
        matched_pairs: list[tuple[int, int]] = []
        for ti in treat_indices:
            best_ci: int | None = None
            best_dist = float("inf")
            lt = logit_ps[ti]
            for ci in ctrl_indices:
                if ci in used_ctrl:
                    continue
                d = abs(lt - logit_ps[ci])
                if d <= cal_tol and d < best_dist:
                    best_dist = d
                    best_ci = ci
            if best_ci is not None:
                used_ctrl.add(best_ci)
                matched_pairs.append((ti, best_ci))

        if len(matched_pairs) < 4:
            raise ValueError("no_common_support_matches_found")

        matched_t = [ti for ti, _ in matched_pairs]
        matched_c = [ci for _, ci in matched_pairs]
        balance_rows: list[dict[str, Any]] = []
        table_rows: list[list[Any]] = []

        for j in range(k):
            col_pos = 2 + j
            t_b = [matrix[i][col_pos] for i in treat_indices]
            c_b = [matrix[i][col_pos] for i in ctrl_indices]
            v_tb = (stdev(t_b) ** 2) if len(t_b) >= 2 else 0.0
            v_cb = (stdev(c_b) ** 2) if len(c_b) >= 2 else 0.0
            pooled_sd = math.sqrt(0.5 * (v_tb + v_cb))
            smd_b = abs(mean(t_b) - mean(c_b)) / pooled_sd if pooled_sd > 1e-9 else 0.0

            t_a = [matrix[i][col_pos] for i in matched_t]
            c_a = [matrix[i][col_pos] for i in matched_c]
            smd_a = abs(mean(t_a) - mean(c_a)) / pooled_sd if pooled_sd > 1e-9 else 0.0
            red_pct = ((smd_b - smd_a) / smd_b * 100.0) if smd_b > 1e-9 else 0.0
            balanced = smd_a < 0.10
            cov_lbl = labels[col_pos]
            balance_rows.append(
                {
                    "covariate": cov_lbl,
                    "smd_before": round(smd_b, 4),
                    "smd_after": round(smd_a, 4),
                    "reduction_pct": round(red_pct, 1),
                    "balanced": balanced,
                }
            )
            table_rows.append(
                [
                    cov_lbl,
                    _r(smd_b, 4),
                    _r(smd_a, 4),
                    round(red_pct, 1),
                    "达标 (<0.10)" if balanced else "待改善 (≥0.10)",
                ]
            )

        diffs = [matrix[ti][0] - matrix[ci][0] for ti, ci in matched_pairs]
        att = mean(diffs)
        se = max(1e-9, (stdev(diffs) / math.sqrt(len(diffs))) if len(diffs) >= 2 else 0.0)
        t_stat = att / se
        p_val = _t_p_two_tailed(t_stat, float(max(1, len(diffs) - 1)))
        max_smd_before = max(r["smd_before"] for r in balance_rows)
        max_smd_after = max(r["smd_after"] for r in balance_rows)
        unmatched_ratio = (len(treat_indices) - len(matched_pairs)) / float(len(treat_indices))

        diagnostics: list[str] = []
        if unmatched_ratio > 0.10:
            diagnostics.append("PSM_COMMON_SUPPORT_DROPPED")
        if max_smd_after >= 0.10:
            diagnostics.append("PSM_RESIDUAL_IMBALANCE_SMD_GE_01")
        if not diagnostics:
            diagnostics.append("PSM_COVARIATE_BALANCE_OK")

        return self._record_receipt(
            operator="run_psm_balance_att",
            params={
                "outcome": labels[0],
                "treatment": labels[1],
                "covariates": labels[2:],
                "caliper": caliper,
            },
            n_effective=len(matched_pairs) * 2,
            summary=(
                f"倾向得分匹配 PSM 1:1 检验 ({labels[0]} ~ {labels[1]}, 成功配对 {len(matched_pairs)} 对 / "
                f"处理组 {len(treat_indices)}): ATT={_r(att, 4)}, 配对 SE={_r(se, 4)}, {_fmt_p(p_val, 5)}, "
                f"最大 |SMD|: {_r(max_smd_before, 3)} → {_r(max_smd_after, 3)}。"
            ),
            metrics=[
                {"label": "匹配净效应 ATT", "value": _r(att, 4)},
                {"label": "配对 SE", "value": _r(se, 4)},
                {"label": "双侧 p 值", "value": _r(p_val, 6)},
                {"label": "最大匹配后 |SMD|", "value": _r(max_smd_after, 4)},
                {"label": "成功匹配对数", "value": len(matched_pairs)},
            ],
            diagnostics=diagnostics,
            headers=["协变量", "匹配前 |SMD|", "匹配后 |SMD|", "偏差降幅(%)", "平衡判定"],
            rows=table_rows,
            chart={
                "kind": "bar",
                "title": "PSM 匹配后协变量标准差 |SMD| 残余偏差",
                "categories": [r["covariate"] for r in balance_rows],
                "values": [r["smd_after"] for r in balance_rows],
            },
            extra={
                "att": _r(att, 4),
                "se": _r(se, 4),
                "p_value": _r(p_val, 6),
                "matched_pairs": len(matched_pairs),
                "max_smd_before": _r(max_smd_before, 4),
                "max_smd_after": _r(max_smd_after, 4),
                "balance_rows": balance_rows,
            },
        )

    # ---- Operator 17: Entropy-Weighted TOPSIS Multi-Criteria Evaluation ----
    def compute_entropy_topsis_rank(
        self,
        entity_var: str,
        indicators: list[str],
        negative_indicators: list[str] | None = None,
    ) -> ToolResult:
        if len(indicators) < 2:
            raise ValueError("need_at_least_2_indicators_for_topsis")
        ent_key, ent_meta = self._resolve_var(entity_var)
        ent_label = self._var_label(entity_var)
        ind_list = indicators[:12]
        resolved_inds = [(self._var_label(ind), *self._resolve_var(ind)) for ind in ind_list]
        neg_raw = set(negative_indicators or [])

        grouped: dict[str, list[list[float]]] = {}
        entity_order: list[str] = []
        for row in self.active_rows:
            raw_ent = self._raw_val(row, ent_key, ent_meta)
            if raw_ent is None or isinstance(raw_ent, bool):
                continue
            ent_name = str(raw_ent).strip()
            if not ent_name:
                continue
            vec: list[float] = []
            ok = True
            for _, ik, im in resolved_inds:
                num = self._numeric_val(row, ik, im)
                if num is None:
                    ok = False
                    break
                vec.append(num)
            if not ok:
                continue
            if ent_name not in grouped:
                if len(entity_order) >= 30:
                    continue
                grouped[ent_name] = []
                entity_order.append(ent_name)
            grouped[ent_name].append(vec)

        m = len(entity_order)
        if m < 3:
            raise ValueError("insufficient_entities_for_topsis")
        k = len(resolved_inds)

        agg_matrix: list[list[float]] = []
        total_obs = 0
        for ent in entity_order:
            obs_list = grouped[ent]
            total_obs += len(obs_list)
            agg_matrix.append([mean(obs[j] for obs in obs_list) for j in range(k)])

        low_disp = False
        norm_matrix: list[list[float]] = [[0.0] * k for _ in range(m)]
        for j in range(k):
            ind_lbl, _, _ = resolved_inds[j]
            is_neg = ind_list[j] in neg_raw or ind_lbl in neg_raw
            col_vals = [agg_matrix[i][j] for i in range(m)]
            lo = min(col_vals)
            hi = max(col_vals)
            span = hi - lo
            if span <= 1e-12:
                low_disp = True
                for i in range(m):
                    norm_matrix[i][j] = 0.5
            else:
                for i in range(m):
                    scaled = (hi - col_vals[i]) / span if is_neg else (col_vals[i] - lo) / span
                    norm_matrix[i][j] = max(0.0, min(1.0, scaled))

        inv_ln_m = 1.0 / math.log(float(m))
        d_vals: list[float] = []
        for j in range(k):
            shifted = [norm_matrix[i][j] + 1e-9 for i in range(m)]
            col_sum = sum(shifted)
            probs = [v / col_sum for v in shifted]
            entropy_j = -inv_ln_m * sum(p * math.log(p) for p in probs if p > 0.0)
            div_j = max(0.0, 1.0 - entropy_j)
            if div_j < 0.02:
                low_disp = True
            d_vals.append(div_j)

        d_sum = sum(d_vals)
        if d_sum <= 1e-12:
            low_disp = True
            weights = [1.0 / float(k)] * k
        else:
            weights = [d / d_sum for d in d_vals]

        weighted = [[norm_matrix[i][j] * weights[j] for j in range(k)] for i in range(m)]
        v_plus = [max(weighted[i][j] for i in range(m)) for j in range(k)]
        v_minus = [min(weighted[i][j] for i in range(m)) for j in range(k)]

        rankings: list[dict[str, Any]] = []
        for i, ent in enumerate(entity_order):
            d_pos = math.sqrt(sum((weighted[i][j] - v_plus[j]) ** 2 for j in range(k)))
            d_neg = math.sqrt(sum((weighted[i][j] - v_minus[j]) ** 2 for j in range(k)))
            denom = d_pos + d_neg
            ci = (d_neg / denom) if denom > 1e-12 else 0.5
            tier = "高优示范 (≥0.65)" if ci >= 0.65 else ("中坚梯队 (0.40–0.65)" if ci >= 0.40 else "待提升 (<0.40)")
            rankings.append(
                {
                    "entity": ent,
                    "n_obs": len(grouped[ent]),
                    "d_plus": round(d_pos, 4),
                    "d_minus": round(d_neg, 4),
                    "closeness": round(ci, 4),
                    "tier": tier,
                }
            )

        rankings.sort(key=lambda item: (-item["closeness"], item["entity"]))
        for idx_rank, item in enumerate(rankings, start=1):
            item["rank"] = idx_rank

        table_rows = [
            [r["rank"], r["entity"], _r(r["d_plus"], 4), _r(r["d_minus"], 4), _r(r["closeness"], 4), r["tier"]]
            for r in rankings
        ]
        weight_map = {resolved_inds[j][0]: round(weights[j], 4) for j in range(k)}
        c_max = rankings[0]["closeness"]
        c_min = rankings[-1]["closeness"]
        diagnostics = ["TOPSIS_LOW_DISPERSION_INDICATOR"] if low_disp else ["TOPSIS_WEIGHT_ENTROPY_VALID"]

        return self._record_receipt(
            operator="compute_entropy_topsis_rank",
            params={
                "entity_var": ent_label,
                "indicators": [item[0] for item in resolved_inds],
                "negative_indicators": list(negative_indicators or []),
            },
            n_effective=total_obs,
            summary=(
                f"熵权 TOPSIS 综合评价 ({ent_label}: {m} 个对象 × {k} 项指标, 样本={total_obs})："
                f"首位“{rankings[0]['entity']}”(C_i={_r(c_max, 4)})，末位“{rankings[-1]['entity']}”(C_i={_r(c_min, 4)})，"
                f"最大权重={round(max(weights), 4)}。"
            ),
            metrics=[
                {"label": "最高贴近度 C_max", "value": _r(c_max, 4)},
                {"label": "最低贴近度 C_min", "value": _r(c_min, 4)},
                {"label": "最大指标熵权", "value": _r(max(weights), 4)},
                {"label": "评价对象数", "value": m},
            ],
            diagnostics=diagnostics,
            headers=["综合位次", "评价对象", "正理想距 D+", "负理想距 D-", "贴近度 C_i", "梯度分级"],
            rows=table_rows,
            chart={
                "kind": "bar",
                "title": f"熵权 TOPSIS 综合贴近度排名 ({ent_label})",
                "categories": [r["entity"] for r in rankings[:12]],
                "values": [r["closeness"] for r in rankings[:12]],
            },
            extra={
                "weights": weight_map,
                "rankings": rankings,
            },
        )

    # ---- Operator 18: Instrumental Variables 2SLS with HC1 & Wu-Hausman ----
    def estimate_iv_2sls(
        self,
        outcome: str,
        treatment: str,
        instrument: str,
        controls: list[str] | None = None,
    ) -> ToolResult:
        ctrl_vars: list[str] = []
        for c in controls or []:
            if c not in (outcome, treatment, instrument) and c not in ctrl_vars:
                ctrl_vars.append(c)
        var_names = [outcome, treatment, instrument, *ctrl_vars]
        matrix, labels = self._complete_numeric_matrix(var_names)
        y_lbl, x_lbl, z_lbl = labels[0], labels[1], labels[2]
        n = len(matrix)
        k_ctrl = len(ctrl_vars)
        if n < k_ctrl + 12:
            raise ValueError("iv_2sls_insufficient_n")

        y = [row[0] for row in matrix]
        x = [row[1] for row in matrix]
        z = [row[2] for row in matrix]
        if stdev(y) <= 1e-12 or stdev(x) <= 1e-12 or stdev(z) <= 1e-12:
            raise ValueError("iv_2sls_degenerate_variance")

        w_full = [[1.0, row[2], *row[3:]] for row in matrix]
        w_reduced = [[1.0, *row[3:]] for row in matrix]
        k_fs = len(w_full[0])
        gamma = _solve_linear(_xtx(w_full), _xty(w_full, x))
        gamma0 = _solve_linear(_xtx(w_reduced), _xty(w_reduced, x))
        if gamma is None or gamma0 is None:
            raise ValueError("iv_2sls_singular_stage1")

        x_hat = [sum(w_full[i][j] * gamma[j] for j in range(k_fs)) for i in range(n)]
        v_hat = [x[i] - x_hat[i] for i in range(n)]
        v0_hat = [x[i] - sum(w_reduced[i][j] * gamma0[j] for j in range(len(gamma0))) for i in range(n)]
        ssr_u = sum(v * v for v in v_hat)
        ssr_r = sum(v * v for v in v0_hat)
        x_mean = mean(x)
        sst_x = sum((xi - x_mean) ** 2 for xi in x)
        first_stage_r2 = max(0.0, min(1.0, 1.0 - ssr_u / max(1e-12, sst_x)))
        first_stage_f = max(0.0, (ssr_r - ssr_u) / max(1e-12, ssr_u / float(max(1, n - k_fs))))

        se_fs = _hc1_se(w_full, v_hat)
        if se_fs is None:
            raise ValueError("iv_2sls_singular_stage1_hc1")
        pi_1 = gamma[1]
        se_pi1 = se_fs[1]
        t_pi1 = pi_1 / se_pi1
        p_pi1 = _t_p_two_tailed(t_pi1, float(max(1, n - k_fs)))

        z_hat_mat = [[1.0, x_hat[i], *matrix[i][3:]] for i in range(n)]
        x_actual_mat = [[1.0, x[i], *matrix[i][3:]] for i in range(n)]
        beta_iv_vec = _solve_linear(_xtx(z_hat_mat), _xty(z_hat_mat, y))
        beta_ols_vec = _solve_linear(_xtx(x_actual_mat), _xty(x_actual_mat, y))
        if beta_iv_vec is None or beta_ols_vec is None:
            raise ValueError("iv_2sls_singular_stage2")

        k_ss = len(beta_iv_vec)
        e_iv = [y[i] - sum(x_actual_mat[i][j] * beta_iv_vec[j] for j in range(k_ss)) for i in range(n)]
        e_ols = [y[i] - sum(x_actual_mat[i][j] * beta_ols_vec[j] for j in range(k_ss)) for i in range(n)]
        se_iv_vec = _hc1_se(z_hat_mat, e_iv)
        se_ols_vec = _hc1_se(x_actual_mat, e_ols)
        if se_iv_vec is None or se_ols_vec is None:
            raise ValueError("iv_2sls_singular_hc1")

        beta_iv, se_iv = beta_iv_vec[1], se_iv_vec[1]
        z_iv = beta_iv / se_iv
        p_iv = _t_p_two_tailed(z_iv, float(max(1, n - k_ss)))
        ci_iv = (beta_iv - 1.96 * se_iv, beta_iv + 1.96 * se_iv)

        beta_ols, se_ols = beta_ols_vec[1], se_ols_vec[1]
        t_ols = beta_ols / se_ols
        p_ols = _t_p_two_tailed(t_ols, float(max(1, n - k_ss)))
        ci_ols = (beta_ols - 1.96 * se_ols, beta_ols + 1.96 * se_ols)

        x_cf = [x_actual_mat[i] + [v_hat[i]] for i in range(n)]
        beta_cf = _solve_linear(_xtx(x_cf), _xty(x_cf, y))
        hausman_p = 1.0
        if beta_cf is not None:
            e_cf = [y[i] - sum(x_cf[i][j] * beta_cf[j] for j in range(len(beta_cf))) for i in range(n)]
            se_cf = _hc1_se(x_cf, e_cf)
            if se_cf is not None:
                t_hausman = beta_cf[-1] / se_cf[-1]
                hausman_p = _t_p_two_tailed(t_hausman, float(max(1, n - len(beta_cf))))

        diagnostics: list[str] = [
            "WEAK_INSTRUMENT_F_LT_10" if first_stage_f < 10.0 else "IV_STRONG_FIRST_STAGE",
            "IV_ENDOGENEITY_CONFIRMED" if hausman_p < 0.05 else "IV_EXOGENEITY_NOT_REJECTED",
        ]
        table_rows = [
            [
                f"第一阶段 ({z_lbl} → {x_lbl})",
                _r(pi_1, 4),
                _r(se_pi1, 4),
                _r(t_pi1, 3),
                f"[{_r(pi_1 - 1.96 * se_pi1, 3)}, {_r(pi_1 + 1.96 * se_pi1, 3)}]",
                _r(p_pi1, 6),
            ],
            [
                f"第二阶段 2SLS LATE ({x_lbl})",
                _r(beta_iv, 4),
                _r(se_iv, 4),
                _r(z_iv, 3),
                f"[{_r(ci_iv[0], 3)}, {_r(ci_iv[1], 3)}]",
                _r(p_iv, 6),
            ],
            [
                f"OLS 基准对照 ({x_lbl})",
                _r(beta_ols, 4),
                _r(se_ols, 4),
                _r(t_ols, 3),
                f"[{_r(ci_ols[0], 3)}, {_r(ci_ols[1], 3)}]",
                _r(p_ols, 6),
            ],
        ]

        return self._record_receipt(
            operator="estimate_iv_2sls",
            params={
                "outcome": y_lbl,
                "treatment": x_lbl,
                "instrument": z_lbl,
                "controls": labels[3:],
            },
            n_effective=n,
            summary=(
                f"工具变量 IV-2SLS 估计 ({y_lbl} ~ {x_lbl} | Z={z_lbl}, n={n}): "
                f"β_IV={_r(beta_iv, 4)} (HC1 SE={_r(se_iv, 4)}, {_fmt_p(p_iv, 5)}), "
                f"第一阶段 F={_r(first_stage_f, 2)}, Wu-Hausman {_fmt_p(hausman_p, 4)}, "
                f"OLS 基准={_r(beta_ols, 4)}。"
            ),
            metrics=[
                {"label": "2SLS 局部效应 β_IV", "value": _r(beta_iv, 4)},
                {"label": "第一阶段 F 统计量", "value": _r(first_stage_f, 3)},
                {"label": "双侧 p 值", "value": _r(p_iv, 6)},
                {"label": "Wu-Hausman 内生性 p 值", "value": _r(hausman_p, 6)},
            ],
            diagnostics=diagnostics,
            headers=["估计阶段与变量", "点估计 β", "稳健 SE", "t / z 统计量", "95% CI", "p 值"],
            rows=table_rows,
            chart={
                "kind": "bar",
                "title": f"IV-2SLS vs OLS 效应估计对照 ({x_lbl} → {y_lbl})",
                "categories": [f"第一阶段({z_lbl})", f"2SLS LATE({x_lbl})", f"OLS 基准({x_lbl})"],
                "values": [round(pi_1, 4), round(beta_iv, 4), round(beta_ols, 4)],
            },
            extra={
                "beta_iv": _r(beta_iv, 6),
                "se_iv": _r(se_iv, 6),
                "p_iv": _r(p_iv, 6),
                "beta_ols": _r(beta_ols, 6),
                "first_stage_pi1": _r(pi_1, 6),
                "first_stage_f": _r(first_stage_f, 4),
                "first_stage_r2": _r(first_stage_r2, 4),
                "hausman_p": _r(hausman_p, 6),
            },
        )

    # ---- Operator 19: Sequential A/B Testing with SRM, Welch t, OBF & Guardrail ----
    def run_ab_sequential_test(
        self,
        treatment: str,
        outcome: str,
        guardrail: str | None = None,
        expected_ratio: float = 0.5,
        info_fraction: float = 1.0,
    ) -> ToolResult:
        ratio = min(0.95, max(0.05, float(expected_ratio)))
        t_frac = min(1.0, max(0.1, float(info_fraction)))
        primary_mat, primary_lbls = self._complete_numeric_matrix([treatment, outcome])
        t_lbl, y_lbl = primary_lbls[0], primary_lbls[1]

        ctrl_y: list[float] = []
        trt_y: list[float] = []
        for t_val, y_val in primary_mat:
            if abs(t_val - 0.0) <= 1e-9:
                ctrl_y.append(y_val)
            elif abs(t_val - 1.0) <= 1e-9:
                trt_y.append(y_val)
            else:
                raise ValueError("ab_treatment_must_be_binary_0_1")

        n_ctrl, n_trt = len(ctrl_y), len(trt_y)
        if n_ctrl < 5 or n_trt < 5:
            raise ValueError("ab_insufficient_arm_n")

        n_ab = n_ctrl + n_trt
        exp_trt = n_ab * ratio
        exp_ctrl = n_ab * (1.0 - ratio)
        srm_chi2 = ((n_trt - exp_trt) ** 2) / max(1e-9, exp_trt) + ((n_ctrl - exp_ctrl) ** 2) / max(1e-9, exp_ctrl)
        srm_p = _norm_p_two_tailed(math.sqrt(max(0.0, srm_chi2)))

        def _welch_ab(c_vals: list[float], t_vals: list[float]) -> tuple[float, float, float, float, float, float, float]:
            m0 = mean(c_vals)
            m1 = mean(t_vals)
            delta = m1 - m0
            rel_pct = (delta / abs(m0) * 100.0) if abs(m0) > 1e-9 else 0.0
            v0 = stdev(c_vals) ** 2
            v1 = stdev(t_vals) ** 2
            vn0 = v0 / len(c_vals)
            vn1 = v1 / len(t_vals)
            se = math.sqrt(max(1e-12, vn0 + vn1))
            t_stat = delta / se
            num_df = (vn0 + vn1) ** 2
            den_df = (vn0 ** 2) / max(1, len(c_vals) - 1) + (vn1 ** 2) / max(1, len(t_vals) - 1)
            df = num_df / den_df if den_df > 1e-12 else float(len(c_vals) + len(t_vals) - 2)
            p_val = _t_p_two_tailed(t_stat, max(1.0, df))
            return m0, m1, delta, rel_pct, se, t_stat, p_val

        m0, m1, delta, rel_pct, se, t_stat, p_val = _welch_ab(ctrl_y, trt_y)
        z_obf = 1.959964 / math.sqrt(t_frac)
        obf_sig = abs(t_stat) >= z_obf

        table_rows = [
            [
                f"核心北极星指标 ({y_lbl})",
                _r(m0, 4),
                _r(m1, 4),
                _r(delta, 4),
                _r(se, 4),
                f"[{_r(delta - 1.96 * se, 3)}, {_r(delta + 1.96 * se, 3)}]",
                f"{_fmt_p(p_val, 5)} ({'突破OBF边界' if obf_sig else '未越OBF边界'})",
            ]
        ]
        diagnostics: list[str] = [
            "AB_SRM_DETECTED_P_LT_001" if srm_p < 0.001 else "AB_SRM_BALANCED",
            "AB_SEQUENTIAL_SIGNIFICANT" if obf_sig else "AB_UNDERPOWERED_CONTINUE",
        ]
        guard_info: dict[str, Any] | None = None
        if guardrail and guardrail not in (treatment, outcome):
            g_mat, g_lbls = self._complete_numeric_matrix([treatment, guardrail])
            g_ctrl = [yv for tv, yv in g_mat if abs(tv - 0.0) <= 1e-9]
            g_trt = [yv for tv, yv in g_mat if abs(tv - 1.0) <= 1e-9]
            if len(g_ctrl) >= 5 and len(g_trt) >= 5:
                gm0, gm1, g_delta, g_rel, g_se, g_t, g_p = _welch_ab(g_ctrl, g_trt)
                g_bad = g_delta < 0.0 and g_p < 0.05
                if g_bad:
                    diagnostics.append("AB_GUARDRAIL_DEGRADATION")
                table_rows.append(
                    [
                        f"安全护栏指标 ({g_lbls[1]})",
                        _r(gm0, 4),
                        _r(gm1, 4),
                        _r(g_delta, 4),
                        _r(g_se, 4),
                        f"[{_r(g_delta - 1.96 * g_se, 3)}, {_r(g_delta + 1.96 * g_se, 3)}]",
                        f"{_fmt_p(g_p, 5)} ({'护栏劣化告警' if g_bad else '护栏平稳'})",
                    ]
                )
                guard_info = {
                    "variable": g_lbls[1],
                    "delta": _r(g_delta, 6),
                    "p_value": _r(g_p, 6),
                    "degraded": g_bad,
                }

        return self._record_receipt(
            operator="run_ab_sequential_test",
            params={
                "treatment": t_lbl,
                "outcome": y_lbl,
                "guardrail": guard_info["variable"] if guard_info else None,
                "expected_ratio": ratio,
                "info_fraction": t_frac,
            },
            n_effective=n_ab,
            summary=(
                f"序贯 A/B 实验检验 ({y_lbl} ~ {t_lbl}, 控制={n_ctrl} / 实验={n_trt}, t_frac={_r(t_frac, 2)}): "
                f"Δ={_r(delta, 4)} ({_r(rel_pct, 2)}%), t={_r(t_stat, 3)} vs OBF |z|={_r(z_obf, 3)}, "
                f"{_fmt_p(p_val, 5)}, SRM χ²={_r(srm_chi2, 2)} ({_fmt_p(srm_p, 5)})。"
            ),
            metrics=[
                {"label": "主指标净提升 Δ", "value": _r(delta, 4)},
                {"label": "相对提升(%)", "value": _r(rel_pct, 2)},
                {"label": "双侧 p 值", "value": _r(p_val, 6)},
                {"label": "SRM 检验 p 值", "value": _r(srm_p, 6)},
                {"label": "OBF 序贯临界 |z|", "value": _r(z_obf, 4)},
            ],
            diagnostics=diagnostics,
            headers=["指标类别与名称", "对照组均值", "实验组均值", "净提升 Δ", "稳健 SE", "95% CI", "p 值 / OBF 判定"],
            rows=table_rows,
            chart={
                "kind": "bar",
                "title": f"A/B 实验分臂均值对比 ({y_lbl})",
                "categories": [f"对照组 (n={n_ctrl})", f"实验组 (n={n_trt})"],
                "values": [round(m0, 4), round(m1, 4)],
            },
            extra={
                "n_control": n_ctrl,
                "n_treatment": n_trt,
                "delta": _r(delta, 6),
                "rel_lift_pct": _r(rel_pct, 3),
                "se": _r(se, 6),
                "t_stat": _r(t_stat, 4),
                "p_value": _r(p_val, 6),
                "srm_chi2": _r(srm_chi2, 4),
                "srm_p": _r(srm_p, 6),
                "obf_z": _r(z_obf, 4),
                "obf_significant": obf_sig,
                "guardrail": guard_info,
            },
        )

    # ---- Operator 20: Kaplan-Meier Survival Curve, RMST & Mantel-Haenszel Log-Rank ----
    def estimate_kaplan_meier_logrank(
        self,
        time_var: str,
        event_var: str,
        group_var: str,
    ) -> ToolResult:
        t_key, t_meta = self._resolve_var(time_var)
        e_key, e_meta = self._resolve_var(event_var)
        g_key, g_meta = self._resolve_var(group_var)
        if g_meta is not None and g_meta.get("type") == "text":
            raise ValueError("survival_group_cannot_be_open_text")
        t_lbl = self._var_label(time_var)
        e_lbl = self._var_label(event_var)
        g_lbl = self._var_label(group_var)

        arm_obs: dict[str, list[tuple[float, int]]] = {}
        for row in self.active_rows:
            dur = self._numeric_val(row, t_key, t_meta)
            ev = self._numeric_val(row, e_key, e_meta)
            raw_g = self._raw_val(row, g_key, g_meta)
            if dur is None or dur <= 0.0 or ev is None or raw_g is None or isinstance(raw_g, bool):
                continue
            if abs(ev - 0.0) <= 1e-9:
                ev_int = 0
            elif abs(ev - 1.0) <= 1e-9:
                ev_int = 1
            else:
                continue
            g_name = str(raw_g).strip()
            if not g_name:
                continue
            arm_obs.setdefault(g_name, []).append((float(dur), ev_int))

        eligible = sorted(
            ((k, v) for k, v in arm_obs.items() if len(v) >= 5),
            key=lambda kv: (-len(kv[1]), kv[0]),
        )
        if len(eligible) < 2:
            raise ValueError("survival_requires_2_arms_with_ge_5_obs")

        arm0_name, arm0_data = eligible[0]
        arm1_name, arm1_data = eligible[1]
        tau = min(max(x[0] for x in arm0_data), max(x[0] for x in arm1_data))

        def _km_arm(recs: list[tuple[float, int]]) -> dict[str, Any]:
            n_arm = len(recs)
            n_ev = sum(ev for _, ev in recs)
            censor_pct = (n_arm - n_ev) / float(n_arm) * 100.0
            ev_times = sorted({t for t, ev in recs if ev == 1})
            surv = 1.0
            greenwood = 0.0
            median_t: float | None = None
            curve: list[tuple[float, float]] = [(0.0, 1.0)]
            for tj in ev_times:
                at_risk = sum(1 for t, _ in recs if t >= tj)
                died = sum(1 for t, ev in recs if t == tj and ev == 1)
                if at_risk <= 0 or died <= 0:
                    continue
                surv *= (at_risk - died) / float(at_risk)
                if at_risk > died:
                    greenwood += died / float(at_risk * (at_risk - died))
                curve.append((tj, surv))
                if median_t is None and surv <= 0.5 + 1e-12:
                    median_t = tj
            se_end = surv * math.sqrt(greenwood) if greenwood > 0.0 else 0.0

            rmst = 0.0
            prev_t = 0.0
            prev_s = 1.0
            for t_c, s_c in curve[1:]:
                if t_c > tau:
                    break
                rmst += prev_s * (t_c - prev_t)
                prev_t = t_c
                prev_s = s_c
            if tau > prev_t:
                rmst += prev_s * (tau - prev_t)
            return {
                "n": n_arm,
                "events": n_ev,
                "censor_pct": censor_pct,
                "median": median_t,
                "rmst": rmst,
                "surv_end": surv,
                "se_end": se_end,
            }

        km0 = _km_arm(arm0_data)
        km1 = _km_arm(arm1_data)

        pooled_ev_times = sorted({t for t, ev in arm0_data + arm1_data if ev == 1})
        obs1 = 0.0
        exp1 = 0.0
        var1 = 0.0
        for tj in pooled_ev_times:
            n0 = sum(1 for t, _ in arm0_data if t >= tj)
            n1 = sum(1 for t, _ in arm1_data if t >= tj)
            n_tot = n0 + n1
            d0 = sum(1 for t, ev in arm0_data if t == tj and ev == 1)
            d1 = sum(1 for t, ev in arm1_data if t == tj and ev == 1)
            d_tot = d0 + d1
            if n_tot <= 1 or d_tot <= 0:
                continue
            obs1 += d1
            exp1 += n1 * (d_tot / float(n_tot))
            var1 += (n1 * n0 * d_tot * (n_tot - d_tot)) / float((n_tot ** 2) * (n_tot - 1))

        chi2_lr = ((obs1 - exp1) ** 2) / max(1e-12, var1) if var1 > 1e-12 else 0.0
        p_lr = _norm_p_two_tailed(math.sqrt(max(0.0, chi2_lr)))
        n_total_arms = km0["n"] + km1["n"]
        total_events = km0["events"] + km1["events"]
        total_censor_pct = (n_total_arms - total_events) / float(n_total_arms) * 100.0
        rmst_diff = km1["rmst"] - km0["rmst"]

        diagnostics: list[str] = [
            "SURVIVAL_LOGRANK_SIGNIFICANT" if p_lr < 0.05 else "SURVIVAL_LOGRANK_NS",
        ]
        if total_censor_pct > 50.0:
            diagnostics.append("SURVIVAL_HEAVY_CENSORING_GT_50PCT")

        table_rows = [
            [
                arm0_name,
                km0["n"],
                km0["events"],
                _r(km0["censor_pct"], 1),
                _r(km0["median"], 2) if km0["median"] is not None else "未达中位",
                _r(km0["rmst"], 3),
                _r(km0["surv_end"], 4),
            ],
            [
                arm1_name,
                km1["n"],
                km1["events"],
                _r(km1["censor_pct"], 1),
                _r(km1["median"], 2) if km1["median"] is not None else "未达中位",
                _r(km1["rmst"], 3),
                _r(km1["surv_end"], 4),
            ],
        ]

        return self._record_receipt(
            operator="estimate_kaplan_meier_logrank",
            params={
                "time_var": t_lbl,
                "event_var": e_lbl,
                "group_var": g_lbl,
                "tau_horizon": _r(tau, 3),
            },
            n_effective=n_total_arms,
            summary=(
                f"Kaplan-Meier 生存分析 ({t_lbl} ~ {g_lbl}, {arm0_name} n={km0['n']} vs {arm1_name} n={km1['n']}): "
                f"Log-Rank χ²={_r(chi2_lr, 3)}, {_fmt_p(p_lr, 5)}, RMST差值={_r(rmst_diff, 3)}, "
                f"总删失率={_r(total_censor_pct, 1)}%。"
            ),
            metrics=[
                {"label": "Log-Rank χ²", "value": _r(chi2_lr, 4)},
                {"label": "双侧 p 值", "value": _r(p_lr, 6)},
                {"label": "RMST 差值 Δ", "value": _r(rmst_diff, 4)},
                {"label": "总删失率(%)", "value": _r(total_censor_pct, 1)},
            ],
            diagnostics=diagnostics,
            headers=["队列分组", "样本量 n", "终点事件数 d", "删失率(%)", "中位生存期", "RMST 均值", "期末生存率 S(t)"],
            rows=table_rows,
            chart={
                "kind": "bar",
                "title": f"限制平均生存时间 RMST 组间对比 ({g_lbl})",
                "categories": [arm0_name, arm1_name],
                "values": [round(km0["rmst"], 4), round(km1["rmst"], 4)],
            },
            extra={
                "chi2_logrank": _r(chi2_lr, 4),
                "p_value": _r(p_lr, 6),
                "rmst_diff": _r(rmst_diff, 4),
                "censoring_pct": _r(total_censor_pct, 2),
                "tau": _r(tau, 3),
                "arms": {arm0_name: km0, arm1_name: km1},
            },
        )

    # ---- Operator 21: DerSimonian-Laird Random-Effects Meta-Analysis + Egger Bias ----
    def run_meta_random_effects(
        self,
        study_var: str,
        effect_var: str,
        se_var: str,
    ) -> ToolResult:
        s_key, s_meta = self._resolve_var(study_var)
        y_key, y_meta = self._resolve_var(effect_var)
        se_key, se_meta = self._resolve_var(se_var)
        if s_meta is not None and s_meta.get("type") == "text":
            raise ValueError("meta_study_cannot_be_open_text")
        s_lbl = self._var_label(study_var)
        y_lbl = self._var_label(effect_var)
        se_lbl = self._var_label(se_var)

        studies: list[tuple[str, float, float]] = []
        for row in self.active_rows:
            raw_s = self._raw_val(row, s_key, s_meta)
            yi = self._numeric_val(row, y_key, y_meta)
            sei = self._numeric_val(row, se_key, se_meta)
            if raw_s is None or isinstance(raw_s, bool) or yi is None or sei is None or sei <= 0.0:
                continue
            s_name = str(raw_s).strip()
            if s_name:
                studies.append((s_name, float(yi), float(sei)))

        k = len(studies)
        if k < 3:
            raise ValueError("meta_requires_at_least_3_studies")

        w_fe = [1.0 / (sei * sei) for _, _, sei in studies]
        sum_w_fe = sum(w_fe)
        theta_fe = sum(w * yi for w, (_, yi, _) in zip(w_fe, studies)) / sum_w_fe
        q_stat = sum(w * ((yi - theta_fe) ** 2) for w, (_, yi, _) in zip(w_fe, studies))
        df_q = k - 1
        i2 = max(0.0, (q_stat - df_q) / q_stat * 100.0) if q_stat > 1e-12 else 0.0
        c_dl = sum_w_fe - sum(w * w for w in w_fe) / sum_w_fe
        tau2 = max(0.0, (q_stat - df_q) / c_dl) if c_dl > 1e-12 else 0.0

        w_re = [1.0 / (sei * sei + tau2) for _, _, sei in studies]
        sum_w_re = sum(w_re)
        theta_re = sum(w * yi for w, (_, yi, _) in zip(w_re, studies)) / sum_w_re
        se_re = math.sqrt(1.0 / sum_w_re)
        z_re = theta_re / se_re
        p_re = _norm_p_two_tailed(z_re)

        egger_p = 1.0
        if k >= 3:
            x_eg = [[1.0, 1.0 / sei] for _, _, sei in studies]
            z_eg = [yi / sei for _, yi, sei in studies]
            b_eg = _solve_linear(_xtx(x_eg), _xty(x_eg, z_eg))
            if b_eg is not None:
                res_eg = [z_eg[i] - (b_eg[0] + b_eg[1] * x_eg[i][1]) for i in range(k)]
                sse_eg = sum(r * r for r in res_eg)
                mse_eg = sse_eg / float(max(1, k - 2))
                xtx_inv_eg = _invert_matrix(_xtx(x_eg))
                if xtx_inv_eg is not None and xtx_inv_eg[0][0] > 0.0:
                    se_b0 = math.sqrt(max(1e-12, mse_eg * xtx_inv_eg[0][0]))
                    egger_p = _t_p_two_tailed(b_eg[0] / se_b0, float(max(1, k - 2)))

        diagnostics: list[str] = [
            "META_HIGH_HETEROGENEITY_I2_GE_50" if i2 >= 50.0 else "META_LOW_HETEROGENEITY",
            "META_EGGER_BIAS_P_LT_010" if (k >= 4 and egger_p < 0.10) else "META_NO_EGGER_BIAS",
        ]

        table_rows: list[list[Any]] = []
        for (s_name, yi, sei), wr in zip(studies, w_re):
            w_pct = wr / sum_w_re * 100.0
            table_rows.append([
                s_name,
                _r(yi, 4),
                _r(sei, 4),
                _r(w_pct, 1),
                f"[{_r(yi - 1.96 * sei, 3)}, {_r(yi + 1.96 * sei, 3)}]",
                "高权重" if w_pct >= 100.0 / k else "常规权重",
            ])
        table_rows.append([
            "DerSimonian-Laird 随机效应合并",
            _r(theta_re, 4),
            _r(se_re, 4),
            100.0,
            f"[{_r(theta_re - 1.96 * se_re, 3)}, {_r(theta_re + 1.96 * se_re, 3)}]",
            f"{_fmt_p(p_re, 5)} | I²={_r(i2, 1)}%",
        ])

        return self._record_receipt(
            operator="run_meta_random_effects",
            params={
                "study_var": s_lbl,
                "effect_var": y_lbl,
                "se_var": se_lbl,
                "k_studies": k,
            },
            n_effective=k,
            summary=(
                f"随机效应 Meta 合成 ({k} 项独立研究, {y_lbl}): "
                f"合并效应 θ_RE={_r(theta_re, 4)} (SE={_r(se_re, 4)}, {_fmt_p(p_re, 5)}), "
                f"异质性 Q={_r(q_stat, 2)} (I²={_r(i2, 1)}%, τ²={_r(tau2, 4)}), "
                f"Egger 偏倚 {_fmt_p(egger_p, 4)}。"
            ),
            metrics=[
                {"label": "合并效应 θ_RE", "value": _r(theta_re, 4)},
                {"label": "合并 SE", "value": _r(se_re, 4)},
                {"label": "双侧 p 值", "value": _r(p_re, 6)},
                {"label": "异质性 I²(%)", "value": _r(i2, 1)},
                {"label": "Egger 偏倚 p 值", "value": _r(egger_p, 4)},
            ],
            diagnostics=diagnostics,
            headers=["研究单元 / 合并项", "效应量 θ_i", "标准误 SE", "随机权重(%)", "95% CI", "贡献判定"],
            rows=table_rows,
            chart={
                "kind": "bar",
                "title": f"Meta 分析各研究效应量与合并效应 ({y_lbl})",
                "categories": [s_name for s_name, _, _ in studies[:11]] + ["RE 合并"],
                "values": [round(yi, 4) for _, yi, _ in studies[:11]] + [round(theta_re, 4)],
            },
            extra={
                "k_studies": k,
                "theta_fe": _r(theta_fe, 6),
                "theta_re": _r(theta_re, 6),
                "se_re": _r(se_re, 6),
                "p_re": _r(p_re, 6),
                "q_stat": _r(q_stat, 4),
                "i2_pct": _r(i2, 2),
                "tau2": _r(tau2, 6),
                "egger_p": _r(egger_p, 6),
            },
        )

    def tool_registry(self) -> dict[str, Any]:
        return {
            "inspect_distribution": self.inspect_distribution,
            "apply_cleaning_pipeline": self.apply_cleaning_pipeline,
            "purify_scale_reliability": self.purify_scale_reliability,
            "factor_suitability_kmo": self.factor_suitability_kmo,
            "test_group_difference": self.test_group_difference,
            "fit_linear_regression": self.fit_linear_regression,
            "fit_logistic_regression": self.fit_logistic_regression,
            "test_mediation_effect": self.test_mediation_effect,
            "scan_subgroup_heterogeneity": self.scan_subgroup_heterogeneity,
            "check_common_method_bias": self.check_common_method_bias,
            "compute_correlation_matrix": self.compute_correlation_matrix,
            "estimate_staggered_did_att": self.estimate_staggered_did_att,
            "compute_conformal_prediction_band": self.compute_conformal_prediction_band,
            "run_kano_better_worse": self.run_kano_better_worse,
            "estimate_rdd_sharp_local": self.estimate_rdd_sharp_local,
            "run_psm_balance_att": self.run_psm_balance_att,
            "compute_entropy_topsis_rank": self.compute_entropy_topsis_rank,
            "estimate_iv_2sls": self.estimate_iv_2sls,
            "run_ab_sequential_test": self.run_ab_sequential_test,
            "estimate_kaplan_meier_logrank": self.estimate_kaplan_meier_logrank,
            "run_meta_random_effects": self.run_meta_random_effects,
        }

    def build_deliverable(self) -> dict[str, Any]:
        desc = next((r for r in reversed(self.receipts) if r["operator"] == "inspect_distribution"), None)
        desc_cols = desc.get("columns", []) if desc else []
        tests = [
            {
                "snapshot_id": r["snapshot_id"],
                "operator": r["operator"],
                "summary": r["summary"],
                "metrics": r["metrics"],
                "diagnostics": r["diagnostics"],
                "result_hash": r["result_hash"],
            }
            for r in self.receipts
            if r["operator"] not in ("inspect_distribution", "apply_cleaning_pipeline")
        ]
        charts = [r["chart"] for r in self.receipts if r.get("chart")][:MAX_CHARTS]
        limitations = [
            "所有统计结论均来自横截面与受控数据集的实证检验结果，仅支持统计关联与条件分化推断，不自动等同于随机实验净因果效应。"
        ]
        if self.classification != "actual":
            limitations.append("当前演练/压测数据集标记为合成或教学数据，不得冒充实地回收原始调查。")
        return {
            "data_status": "analyzed" if self.active_rows else "needs_data",
            "input_artifact_refs": [self.dataset_ref],
            "schema_findings": [
                {
                    "ref": self.dataset_ref,
                    "raw_rows": len(self.raw_responses),
                    "cleaned_rows": len(self.active_rows),
                    "variables": len(self.questions),
                    "sha256": self.dataset_sha256,
                    "working_view_sha256": self.working_sha256,
                }
            ],
            "cleaning_log": list(self.cleaning_log),
            "descriptive_statistics": desc_cols[:500],
            "tests": tests[:500],
            "charts": charts,
            "limitations": limitations,
        }

    def export_registered_results(self) -> list[dict[str, Any]]:
        """Format sandbox receipts into frontend ResultSnapshot-compatible records."""
        op_method = {
            "inspect_distribution": "numeric",
            "apply_cleaning_pipeline": "quality-control",
            "purify_scale_reliability": "alpha",
            "factor_suitability_kmo": "efa",
            "test_group_difference": "groups",
            "fit_linear_regression": "regression",
            "fit_logistic_regression": "logit",
            "test_mediation_effect": "mediation",
            "scan_subgroup_heterogeneity": "interaction",
            "check_common_method_bias": "quality-control",
            "estimate_staggered_did_att": "cs-did",
            "compute_conformal_prediction_band": "conformal",
            "run_kano_better_worse": "kano",
            "estimate_rdd_sharp_local": "rdd",
            "run_psm_balance_att": "psm",
            "compute_entropy_topsis_rank": "topsis",
            "estimate_iv_2sls": "iv",
            "run_ab_sequential_test": "ab",
            "estimate_kaplan_meier_logrank": "survival",
            "run_meta_random_effects": "meta",
            "run_custom_stat_script": "custom-stat",
        }
        out: list[dict[str, Any]] = []
        for idx, receipt in enumerate(self.receipts):
            tbl = receipt["table"]
            if not tbl["headers"]:
                continue
            vars_used: list[str] = []
            for key in ("outcome", "predictor", "mediator", "group_var", "construct_name", "time_var", "cohort_var", "running_var", "treatment", "instrument", "guardrail", "entity_var", "event_var", "study_var", "effect_var", "se_var"):
                v = receipt["params"].get(key)
                if isinstance(v, str) and v.strip():
                    vars_used.append(v.strip())
            if len(vars_used) < 4:
                for list_key in ("variables", "predictors", "covariates", "indicators"):
                    raw_lst = receipt["params"].get(list_key)
                    if isinstance(raw_lst, list):
                        for item in raw_lst:
                            if len(vars_used) < 4 and str(item) not in vars_used:
                                vars_used.append(str(item))
            if len(vars_used) < 4 and isinstance(receipt["params"].get("pairs"), list):
                for pair in receipt["params"]["pairs"]:
                    if isinstance(pair, dict):
                        feat = str(pair.get("feature") or "").strip()
                        if feat and len(vars_used) < 4 and feat not in vars_used:
                            vars_used.append(feat)
            corr_mode = str(receipt["params"].get("method") or "").lower()
            mapped_method = (
                (corr_mode if corr_mode in ("pearson", "spearman") else "spearman")
                if receipt["operator"] == "compute_correlation_matrix"
                else op_method.get(receipt["operator"], receipt["operator"])
            )
            out.append({
                "id": receipt["snapshot_id"],
                "title": f"[{idx + 1}] {receipt['summary'][:90]}",
                "sourceName": self.dataset_ref,
                "sourceUrl": "",
                "sourceHash": self.dataset_sha256,
                "resultHash": receipt["result_hash"],
                "classification": "user_provided" if self.classification == "actual" else "simulated",
                "method": mapped_method,
                "n": receipt["n_effective"],
                "total": receipt["n_total"],
                "headers": tbl["headers"][:30],
                "rows": tbl["rows"][:400],
                "metrics": [
                    {"label": str(m["label"])[:150], "value": m["value"] if isinstance(m["value"], (int, float)) else None}
                    for m in receipt["metrics"]
                ],
                "warnings": list(receipt["diagnostics"])[:30],
                "variables": vars_used[:4],
                "operator": receipt["operator"],
                "summary": receipt["summary"],
            })
        return out
