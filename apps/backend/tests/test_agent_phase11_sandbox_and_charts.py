from __future__ import annotations

import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(_ROOT / "src"))

from application.services.autonomous_research import build_planted_trap_benchmark
from application.workflow_data_tools import build_inline_sandbox
from multi_agent.plot_sandbox import (
    SandboxSecurityError,
    build_snapshot_plot_script,
    execute_sandbox_plot,
    execute_sandbox_readonly_stat,
)


def test_readonly_stat_sandbox_supports_idiomatic_numpy_and_next_while_blocking_unsafe_imports() -> None:
    title, questions, rows = build_planted_trap_benchmark()
    sandbox = build_inline_sandbox(title=title, questions=questions, rows=rows, classification="simulated")
    script = "\n".join([
        "import math",
        "import numpy as np",
        "questions = DATA.get('questions') or []",
        "rows = DATA.get('rows') or []",
        "qmeta = next((q for q in questions if q.get('variable') == 'adopt_intention'), {})",
        "qid = str(qmeta.get('id') or 'adopt_intention')",
        "vals = [float((r.get('answers') or {})[qid]) for r in rows if isinstance((r.get('answers') or {}).get(qid), (int, float))]",
        "arr = np.asarray(vals, dtype=float)",
        "rng = np.random.default_rng(42)",
        "boots = [float(rng.choice(arr, size=arr.size, replace=True).mean()) for _ in range(80)]",
        "p_low, p_high = np.percentile(np.asarray(boots, dtype=float), [2.5, 97.5])",
        "q25, q75 = np.quantile(arr, [0.25, 0.75])",
        "corr = float(np.corrcoef(arr, arr * 0.5 + 1.0)[0, 1])",
        "RESULT = {",
        "    'summary': f'采纳意愿均值 {float(arr.mean()):.3f} (n={int(arr.size)})',",
        "    'n_effective': int(arr.size),",
        "    'metrics': {",
        "        'mean': round(float(arr.mean()), 4),",
        "        'sd': round(float(arr.std(ddof=1)), 4),",
        "        'median': round(float(np.median(arr)), 4),",
        "        'p_low': round(float(p_low), 4),",
        "        'p_high': round(float(p_high), 4),",
        "        'iqr': round(float(q75 - q25), 4),",
        "        'corr': round(corr, 4),",
        "    },",
        "    'diagnostics': ['IDIOMATIC_NUMPY_OK'],",
        "}",
    ])
    res = execute_sandbox_readonly_stat(
        script,
        questions=sandbox.questions,
        rows=sandbox.active_rows,
        dataset_sha256=sandbox.dataset_sha256,
        classification=sandbox.classification,
    )
    assert res.data["snapshot_id"].startswith("snap_")
    assert res.data["n_effective"] >= 200
    assert res.data["metrics"]["mean"] > 0
    assert res.data["metrics"]["p_high"] >= res.data["metrics"]["p_low"]

    with pytest.raises(SandboxSecurityError):
        execute_sandbox_readonly_stat(
            "import numpy._core\nRESULT = {'summary': 'x', 'n_effective': 5, 'metrics': {'a': 1}}",
            questions=sandbox.questions,
            rows=sandbox.active_rows,
            dataset_sha256=sandbox.dataset_sha256,
            classification=sandbox.classification,
        )

    with pytest.raises(SandboxSecurityError):
        execute_sandbox_readonly_stat(
            "open('/etc/passwd').read()\nRESULT = {'summary': 'x', 'n_effective': 5, 'metrics': {'a': 1}}",
            questions=sandbox.questions,
            rows=sandbox.active_rows,
            dataset_sha256=sandbox.dataset_sha256,
            classification=sandbox.classification,
        )


def test_plot_sandbox_clean_wrapped_title_and_distinct_chart_kinds() -> None:
    snap = {
        "snapshot_id": "snap_873510fd3ad3",
        "title": "[6] 未来6个月持续采纳智慧助餐与守护服务意愿 Bootstrap 自助抽样均值 4.157 (95% CI [4.064, 4.248], 中位数 4.240, n=226)",
        "metrics": [
            {"label": "均值", "value": 4.1565},
            {"label": "95%置信下限", "value": 4.0639},
            {"label": "95%置信上限", "value": 4.2485},
            {"label": "中位数", "value": 4.24},
            {"label": "标准差", "value": 0.7559},
        ],
    }

    hashes: dict[str, str] = {}
    for kind in ("auto", "bar", "line", "forest", "dumbbell"):
        script, payload = build_snapshot_plot_script(snap, chart_kind=kind)
        title = str(payload["title"])
        assert "[6]" not in title
        assert "…" not in title and "..." not in title
        assert title[-1] not in ("(", "（", "[")
        res = execute_sandbox_plot(script, payload)
        assert res["ok"] is True
        assert res["audit"]["passed"] is True, f"{kind} failed layout audit: {res['audit']}"
        assert res["audit"]["overlapCount"] == 0
        assert "<svg" in res["svg"]
        assert "[6]" not in res["svg"]
        if kind == "forest":
            # Left-of-baseline point (标准差=0.756 < mean=3.49) must align outer-right-anchored ('end'),
            # while right-of-baseline points align outer-left-anchored ('start').
            assert "text-anchor: end" in res["svg"]
            assert "text-anchor: start" in res["svg"]
        if kind != "auto":
            hashes[kind] = res["svgSha256"]

    assert len(set(hashes.values())) == 4


def test_plot_sandbox_humanizes_internal_variable_and_construct_codes() -> None:
    snap = {
        "snapshot_id": "snap_med_humanize",
        "title": "[7] 中介检验（ui_fluency → construct:service_perception → adopt_intention, n=226）",
        "n": 226,
        "metrics": [
            {"label": "ui_fluency", "value": 0.281},
            {"label": "Q_trap", "value": -0.306},
            {"label": "Bootstrap 上界", "value": 0.0334},
        ],
    }
    script, payload = build_snapshot_plot_script(snap, chart_kind="dumbbell")
    res = execute_sandbox_plot(script, payload, auto_repair=True)
    assert res["ok"] is True
    assert res["audit"]["passed"] is True
    assert res["audit"]["overlapCount"] == 0
    svg = res["svg"]
    assert "界面流畅度" in svg
    assert "服务感知综合分" in svg
    assert "采纳意愿" in svg
    assert "反向异常题项" in svg
    for leaked in ("ui_fluency", "construct:", "Q_trap", "adopt_intention"):
        assert leaked not in svg
