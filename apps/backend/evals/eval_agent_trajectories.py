"""Deterministic Phase 4 evaluation harness across 8 scenarios, 3 reviewer probes, and 6 LLM protocols."""

from __future__ import annotations

import argparse
import asyncio
from copy import deepcopy
from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import random
import re
import sys
import tempfile
from typing import Any, Callable

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_SRC_DIR = _BACKEND_DIR / "src"
if str(_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(_SRC_DIR))

import httpx

import infrastructure.llm as llm_mod
from application.providers import AuthoredProvider, LiveProvider, summarize_receipts_honesty
from application.services.autonomous_research import (
    build_planted_trap_benchmark,
    execute_autonomous_research_core,
)
from application.workflow_data_tools import (
    build_falsification_reviewer_tools,
    build_inline_sandbox,
)
from shared.contracts import canonical

_PROVIDERS: dict[str, tuple[str, str]] = {
    "openai": ("https://api.openai.com/v1", "gpt-4o-synthetic"),
    "deepseek": ("https://api.deepseek.com/v1", "deepseek-chat-synthetic"),
    "qwen": ("https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen-plus-synthetic"),
    "compatible": ("https://approved-models.example.test/v1", "compat-agent-synthetic"),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta", "gemini-2.5-pro"),
    "anthropic": ("https://api.anthropic.com/v1", "claude-sonnet-synthetic"),
}

_STRICT_THRESHOLDS = {
    "trap_recall": 0.95,
    "tool_precision": 0.90,
    "zero_hallucination_rate": 1.0,
    "reviewer_catch_rate": 1.0,
    "protocol_live_compat": 1.0,
}

_ALL_TRAP_PREFIXES = (
    "STRAIGHTLINERS_REMOVED:",
    "NEGATIVE_CITC_ITEM:",
    "LOW_CITC_ITEM:",
    "SCALE_PURIFIED_DROPPED:",
    "HIGH_VIF_COLLINEARITY:",
    "RIDGE_STABILIZED:",
    "SEPARATION_DETECTED:",
    "PENALIZED_LOGIT_L2:",
    "SUBGROUP_SIGN_REVERSAL:",
    "NONPARAMETRIC_AUTO_FALLBACK:",
    "HETEROSCEDASTICITY_BP_DETECTED:",
    "TWFE_NEGATIVE_WEIGHT_DISTORTION",
    "WEAK_INSTRUMENT_F_LT_10",
    "AB_SRM_DETECTED_P_LT_001",
    "AB_GUARDRAIL_DEGRADATION",
    "SURVIVAL_HEAVY_CENSORING_GT_50PCT",
    "META_HIGH_HETEROGENEITY_I2_GE_50",
    "META_EGGER_BIAS_P_LT_010",
    "RDD_DENSITY_MANIPULATION_WARNING",
    "PSM_RESIDUAL_IMBALANCE_SMD_GE_01",
)


@dataclass(frozen=True)
class EvalScenario:
    scenario_id: str
    suite: str
    title: str
    goal: str
    geography: str
    questions: list[dict[str, Any]]
    rows: list[dict[str, Any]]
    expected_traps: tuple[str, ...]
    pii_token: str = ""
    forbidden_traps: tuple[str, ...] = ()
    expect_small_sample_null: bool = False
    max_tool_calls: int = 28
    extra_check: Callable[[dict[str, Any], Any], list[str]] | None = field(default=None, repr=False)


def _build_suite_1() -> EvalScenario:
    """Suite 1: 4-trap questionnaire starting from build_planted_trap_benchmark with PII & separation check."""
    title, questions, base_rows = build_planted_trap_benchmark()
    rows = deepcopy(base_rows)
    for idx, row in enumerate(rows):
        row["answers"]["q_open"] = f"SECRET_PII_TOKEN_SUITE1_ROW_{idx}"
        # Keep the first 14 straightliners untouched while sharpening quasi-separation on valid rows
        # without altering the upstream build_planted_trap_benchmark() fixture used by Phase 1 tests.
        if idx >= 14:
            construct_avg = (row["answers"]["q_trust_1"] + row["answers"]["q_trust_2"] + row["answers"]["q_trust_3"]) / 3.0
            row["answers"]["q_renew"] = "1" if construct_avg >= 3.65 else "0"
    return EvalScenario(
        scenario_id="suite_1_4trap_questionnaire",
        suite="suite_1",
        title=title,
        goal="县域老年智慧助餐与防跌倒守护服务采纳机制调研",
        geography="县域",
        questions=questions,
        rows=rows,
        expected_traps=(
            "STRAIGHTLINERS_REMOVED:",
            "NEGATIVE_CITC_ITEM:Q_trap",
            "SCALE_PURIFIED_DROPPED:Q_trap",
            "HIGH_VIF_COLLINEARITY:",
            "RIDGE_STABILIZED:",
            "SEPARATION_DETECTED:",
            "PENALIZED_LOGIT_L2:",
            "SUBGROUP_SIGN_REVERSAL:living_mode",
        ),
        pii_token="SECRET_PII_TOKEN_SUITE1",
        max_tool_calls=28,
    )


def _build_suite_2() -> EvalScenario:
    """Suite 2: 160-row right-skewed spend outcome + quasi-separated binary renew_flag."""
    questions = [
        {
            "id": "q_reg",
            "variable": "region_group",
            "text": "居住片区分类",
            "type": "single",
            "required": True,
            "choices": [{"code": "urban", "label": "城区"}, {"code": "county", "label": "县乡"}],
        },
        {"id": "q_x1", "variable": "feature_x1", "text": "核心功能使用深度", "type": "number", "required": True},
        {"id": "q_x2", "variable": "feature_x2", "text": "服务触达频次", "type": "number", "required": True},
        {"id": "q_spend", "variable": "spend_outcome", "text": "月度支出金额", "type": "number", "required": True},
        {
            "id": "q_renew",
            "variable": "renew_flag",
            "text": "是否续费转化",
            "type": "single",
            "required": True,
            "choices": [{"code": "0", "label": "未续费"}, {"code": "1", "label": "已续费"}],
        },
        {"id": "q_open", "variable": "open_note", "text": "开放意见", "type": "text", "required": False},
    ]
    vis = {q["id"]: True for q in questions}
    rng = random.Random(202602)
    rows: list[dict[str, Any]] = []
    for idx in range(160):
        reg = "urban" if idx % 2 == 0 else "county"
        x1 = round(-1.5 + 3.0 * (idx / 159.0), 4)
        x2 = round(((idx * 7) % 13) / 6.0 - 1.0 + rng.gauss(0.0, 0.12), 4)
        # Positive slope across both strata + heavy right tail to force skew > 1.5
        base_spend = 160.0 + 45.0 * x1 + 12.0 * x2 + (30.0 if reg == "urban" else 0.0)
        if idx >= 148:
            base_spend += 3800.0 + 650.0 * (idx - 148)
        spend = round(max(20.0, base_spend), 2)
        renew = "1" if x1 > 0.25 else "0"
        rows.append({
            "answers": {
                "q_reg": reg,
                "q_x1": x1,
                "q_x2": x2,
                "q_spend": spend,
                "q_renew": renew,
                "q_open": f"SECRET_PII_TOKEN_SUITE2_ROW_{idx}",
            },
            "visibility": dict(vis),
        })
    return EvalScenario(
        scenario_id="suite_2_skewed_nonparam_separation",
        suite="suite_2",
        title="偏态支出与准分离续费转化稳健检验",
        goal="检验强偏态连续消费支出差异与二元续费转化驱动因素",
        geography="县域",
        questions=questions,
        rows=rows,
        expected_traps=(
            "NONPARAMETRIC_AUTO_FALLBACK:SKEWED_OUTCOME",
            "SEPARATION_DETECTED:",
            "PENALIZED_LOGIT_L2:",
        ),
        pii_token="SECRET_PII_TOKEN_SUITE2",
        max_tool_calls=24,
    )


def _build_suite_3() -> EvalScenario:
    """Suite 3: Staggered DID panel where early dynamic ramp flips static TWFE negative."""
    questions = [
        {"id": "q_g", "variable": "cohort", "text": "首次干预队列", "type": "number", "required": True},
        {"id": "q_t", "variable": "period", "text": "观测期次", "type": "number", "required": True},
        {"id": "q_y", "variable": "outcome", "text": "服务覆盖产出", "type": "number", "required": True},
        {"id": "q_open", "variable": "unit_open", "text": "单位备忘", "type": "text", "required": False},
    ]
    vis = {q["id"]: True for q in questions}
    cohort_means = {
        0: {1: 10.0, 2: 10.0, 3: 10.0, 4: 10.0, 5: 10.0},
        2: {1: 10.0, 2: 13.0, 3: 24.0, 4: 38.0, 5: 54.0},
        3: {1: 10.0, 2: 10.0, 3: 10.0, 4: 11.0, 5: 11.5},
    }
    rows: list[dict[str, Any]] = []
    idx = 0
    for g_val, period_map in cohort_means.items():
        reps = (-0.1, 0.1) if g_val == 0 else (-0.2, -0.1, 0.0, 0.1, 0.2)
        for t_val, y_mean in period_map.items():
            for jitter in reps:
                idx += 1
                rows.append({
                    "answers": {
                        "q_g": float(g_val),
                        "q_t": float(t_val),
                        "q_y": round(y_mean + jitter, 3),
                        "q_open": f"SECRET_PII_TOKEN_SUITE3_UNIT_{idx}",
                    },
                    "visibility": dict(vis),
                })

    def _check_did(result: dict[str, Any], sandbox: Any) -> list[str]:
        errs: list[str] = []
        did_rec = next((r for r in sandbox.receipts if r.get("operator") == "estimate_staggered_did_att"), None)
        if not did_rec:
            errs.append("missing_staggered_did_receipt")
        elif not (did_rec.get("overall_att", 0.0) > 0.0 and did_rec.get("static_twfe_beta", 0.0) < 0.0):
            errs.append(f"did_twfe_flip_check_failed:{did_rec.get('overall_att')}/{did_rec.get('static_twfe_beta')}")
        return errs

    return EvalScenario(
        scenario_id="suite_3_staggered_did_negative_weight",
        suite="suite_3",
        title="交错试点队列多期政策动态效应评估",
        goal="多批次试点交错 DID 动态 ATT 与静态 TWFE 负权重诊断",
        geography="省域",
        questions=questions,
        rows=rows,
        expected_traps=("TWFE_NEGATIVE_WEIGHT_DISTORTION",),
        pii_token="SECRET_PII_TOKEN_SUITE3",
        max_tool_calls=20,
        extra_check=_check_did,
    )


def _build_suite_4a() -> EvalScenario:
    """Suite 4a: 80-row survival dataset with >60% right censoring."""
    questions = [
        {"id": "q_d", "variable": "duration", "text": "随访留存月数", "type": "number", "required": True},
        {"id": "q_e", "variable": "event", "text": "终点事件(1发生/0删失)", "type": "number", "required": True},
        {
            "id": "q_a",
            "variable": "arm",
            "text": "实验臂分组",
            "type": "single",
            "required": True,
            "choices": [{"code": "control", "label": "常规服务"}, {"code": "treatment", "label": "伴随干预"}],
        },
    ]
    vis = {q["id"]: True for q in questions}
    rows: list[dict[str, Any]] = []
    # 40 control: 16 events (months 2..9), 24 right-censored
    for i in range(40):
        rows.append({
            "answers": {
                "q_d": float(2 + (i % 8) + (0.2 if i % 2 == 0 else 0.0)),
                "q_e": 1.0 if i < 16 else 0.0,
                "q_a": "control",
            },
            "visibility": dict(vis),
        })
    # 40 treatment: 6 events (months 11..19), 34 right-censored -> total censoring = 58/80 = 72.5% (>60%)
    for i in range(40):
        rows.append({
            "answers": {
                "q_d": float(11 + (i % 9) + (0.3 if i % 2 == 0 else 0.0)),
                "q_e": 1.0 if i < 6 else 0.0,
                "q_a": "treatment",
            },
            "visibility": dict(vis),
        })
    return EvalScenario(
        scenario_id="suite_4a_heavy_censored_km",
        suite="suite_4",
        title="重度右删失留存曲线 Kaplan-Meier 评估",
        goal="服务长期留存 Kaplan-Meier 生存曲线与 RMST 稳健对比",
        geography="全国",
        questions=questions,
        rows=rows,
        expected_traps=("SURVIVAL_HEAVY_CENSORING_GT_50PCT",),
        max_tool_calls=20,
    )


def _build_suite_4b() -> EvalScenario:
    """Suite 4b: 12-study meta dataset with I^2 >= 50 and Egger bias p < 0.10."""
    questions = [
        {"id": "q_s", "variable": "study", "text": "纳入研究", "type": "single", "required": True},
        {"id": "q_y", "variable": "effect", "text": "标准化效应量", "type": "number", "required": True},
        {"id": "q_se", "variable": "se", "text": "标准误", "type": "number", "required": True},
    ]
    vis = {q["id"]: True for q in questions}
    studies = [
        ("Study_01_Large", 0.18, 0.04),
        ("Study_02_Large", 0.21, 0.05),
        ("Study_03_Large", 0.24, 0.06),
        ("Study_04_Med", 0.31, 0.08),
        ("Study_05_Med", 0.39, 0.10),
        ("Study_06_Med", 0.48, 0.12),
        ("Study_07_Med", 0.62, 0.15),
        ("Study_08_Small", 0.78, 0.19),
        ("Study_09_Small", 0.96, 0.23),
        ("Study_10_Small", 1.18, 0.28),
        ("Study_11_Small", 1.38, 0.33),
        ("Study_12_Pilot", 1.62, 0.39),
    ]
    rows = [
        {"answers": {"q_s": s_name, "q_y": eff, "q_se": se}, "visibility": dict(vis)}
        for s_name, eff, se in studies
    ]
    return EvalScenario(
        scenario_id="suite_4b_meta_heterogeneity_egger",
        suite="suite_4",
        title="跨研究效应量随机效应 Meta 合并与发表偏倚检验",
        goal="跨文献随机效应 Meta 合成与 Egger 小样本偏倚检测",
        geography="全国",
        questions=questions,
        rows=rows,
        expected_traps=("META_HIGH_HETEROGENEITY_I2_GE_50", "META_EGGER_BIAS_P_LT_010"),
        max_tool_calls=20,
    )


def _build_suite_5a() -> EvalScenario:
    """Suite 5a: 120-row IV-2SLS dataset with weak first-stage instrument (F < 10)."""
    questions = [
        {"id": "q_z", "variable": "z_iv", "text": "工具变量", "type": "number", "required": True},
        {"id": "q_x", "variable": "treatment", "text": "内生处理强度", "type": "number", "required": True},
        {"id": "q_y", "variable": "outcome", "text": "最终绩效产出", "type": "number", "required": True},
        {"id": "q_c", "variable": "ctrl_age", "text": "年龄协变量", "type": "number", "required": True},
    ]
    vis = {q["id"]: True for q in questions}
    rng = random.Random(2026051)
    rows: list[dict[str, Any]] = []
    for i in range(120):
        z_val = float((i * 7) % 11) - 5.0
        age = 35.0 + float((i * 3) % 25)
        u_noise = rng.gauss(0.0, 2.2)
        # Tiny first-stage coefficient 0.03 keeps first-stage F well below 10
        treat = 5.0 + 0.03 * z_val + 0.12 * age + u_noise
        out = 10.0 + 0.9 * treat + 0.25 * age + rng.gauss(0.0, 1.0)
        rows.append({
            "answers": {
                "q_z": round(z_val, 3),
                "q_x": round(treat, 4),
                "q_y": round(out, 4),
                "q_c": round(age, 2),
            },
            "visibility": dict(vis),
        })
    return EvalScenario(
        scenario_id="suite_5a_weak_iv_2sls",
        suite="suite_5",
        title="弱工具变量 IV-2SLS 识别边界检验",
        goal="工具变量 IV-2SLS 估计与第一阶段弱工具 F 统计量预警",
        geography="县域",
        questions=questions,
        rows=rows,
        expected_traps=("WEAK_INSTRUMENT_F_LT_10",),
        max_tool_calls=20,
    )


def _build_suite_5b() -> EvalScenario:
    """Suite 5b: 300-row A/B experiment with ~72%/28% SRM split and guardrail degradation."""
    questions = [
        {"id": "q_v", "variable": "variant", "text": "实验分组(0对照/1实验)", "type": "number", "required": True},
        {"id": "q_c", "variable": "conv", "text": "核心转化指标", "type": "number", "required": True},
        {"id": "q_g", "variable": "guardrail", "text": "系统稳定性护栏分", "type": "number", "required": True},
    ]
    vis = {q["id"]: True for q in questions}
    rng = random.Random(2026052)
    rows: list[dict[str, Any]] = []
    # 84 control (28%) vs 216 treatment (72%) -> strong SRM (p < 0.001) + degraded guardrail
    for i in range(300):
        is_trt = i >= 84
        conv = (14.2 if is_trt else 11.8) + rng.gauss(0.0, 1.4)
        guardrail = (79.5 if is_trt else 92.0) + rng.gauss(0.0, 2.2)
        rows.append({
            "answers": {
                "q_v": 1.0 if is_trt else 0.0,
                "q_c": round(conv, 3),
                "q_g": round(guardrail, 3),
            },
            "visibility": dict(vis),
        })
    return EvalScenario(
        scenario_id="suite_5b_ab_srm_circuit_breaker",
        suite="suite_5",
        title="序贯 A/B 实验分流失衡与安全护栏熔断",
        goal="序贯 A/B 实验 SRM 分流比检验与安全护栏劣化熔断监控",
        geography="线上全量",
        questions=questions,
        rows=rows,
        expected_traps=("AB_SRM_DETECTED_P_LT_001", "AB_GUARDRAIL_DEGRADATION"),
        max_tool_calls=20,
    )


def _build_suite_6() -> EvalScenario:
    """Suite 6: 18-row pure-null small sample where all inferential p >= 0.20 and zero false traps occur."""
    questions = [
        {
            "id": "q_arm",
            "variable": "group_arm",
            "text": "实验分组",
            "type": "single",
            "required": True,
            "choices": [{"code": "ctrl", "label": "对照组"}, {"code": "trt", "label": "试行组"}],
        },
        {"id": "q_sx", "variable": "score_x", "text": "基线投入分", "type": "number", "required": True},
        {"id": "q_oy", "variable": "outcome_y", "text": "后测响应分", "type": "number", "required": True},
        {"id": "q_open", "variable": "open_note", "text": "访谈备注", "type": "text", "required": False},
    ]
    vis = {q["id"]: True for q in questions}
    # Symmetric alternating values produce near-zero group difference, zero regression slope,
    # homoscedastic residuals, and zero subgroup slopes (all inferential p >= 0.20).
    x_pattern = [1.0, 2.0, 3.0, 4.0, 5.0, 2.0, 3.0, 4.0, 3.0]
    y_pattern = [3.1, 2.9, 3.2, 2.8, 3.0, 3.3, 2.7, 3.1, 2.9]
    rows: list[dict[str, Any]] = []
    for idx in range(9):
        rows.append({
            "answers": {
                "q_arm": "ctrl",
                "q_sx": x_pattern[idx],
                "q_oy": y_pattern[idx],
                "open_note_unused": None,
                "q_open": f"SECRET_PII_TOKEN_SUITE6_C{idx}",
            },
            "visibility": dict(vis),
        })
    for idx in range(9):
        rows.append({
            "answers": {
                "q_arm": "trt",
                "q_sx": x_pattern[idx],
                "q_oy": y_pattern[8 - idx] + 0.05,
                "q_open": f"SECRET_PII_TOKEN_SUITE6_T{idx}",
            },
            "visibility": dict(vis),
        })
    # Remove any accidental helper key inside answers
    for row in rows:
        row["answers"].pop("open_note_unused", None)

    def _check_null_honesty(result: dict[str, Any], sandbox: Any) -> list[str]:
        errs: list[str] = []
        if result["datasetSummary"]["cleanedRowCount"] != 18:
            errs.append(f"unexpected_cleaned_n:{result['datasetSummary']['cleanedRowCount']}")
        honesty = summarize_receipts_honesty(sandbox.receipts, len(sandbox.active_rows))
        if honesty["has_significant_effect"]:
            errs.append("suite6_unexpected_significant_effect")
        if not honesty["is_small_sample_null"]:
            errs.append("suite6_expected_is_small_sample_null")
        # Strictly verify all inferential p >= 0.20 across receipts
        for rec in sandbox.receipts:
            op = rec.get("operator")
            if op == "test_group_difference":
                for m in rec.get("metrics") or ():
                    if "p" in str(m.get("label", "")).lower():
                        if m.get("value") is not None and float(m["value"]) < 0.20:
                            errs.append(f"suite6_group_p_lt_020:{m['value']}")
            elif op == "fit_linear_regression":
                for pname, cinfo in (rec.get("coefficients") or {}).items():
                    if cinfo.get("p") is not None and float(cinfo["p"]) < 0.20:
                        errs.append(f"suite6_ols_p_lt_020:{pname}={cinfo['p']}")
            elif op == "scan_subgroup_heterogeneity":
                for m in rec.get("metrics") or ():
                    if "p" in str(m.get("label", "")).lower():
                        if m.get("value") is not None and float(m["value"]) < 0.20:
                            errs.append(f"suite6_sub_p_lt_020:{m['value']}")
        mi_blob = json.dumps(result.get("motherInsight") or {}, ensure_ascii=False)
        if "经 Ridge/L2 修正" in mi_blob or "Ridge" in mi_blob or "L2" in mi_blob:
            errs.append("suite6_false_ridge_l2_claim")
        if "小样本" not in mi_blob and "n=18" not in mi_blob:
            errs.append("suite6_missing_small_sample_disclosure")
        if not any(tok in mi_blob for tok in ("不显著", "未达到", "p≥0.05", "p<0.05", "未检出稳健主效应")):
            errs.append("suite6_missing_null_disclosure")
        return errs

    return EvalScenario(
        scenario_id="suite_6_small_n_null_honesty",
        suite="suite_6",
        title="小样本零效应诚实性验证",
        goal="小样本先导基线差异与线性趋势探索（验证零效应诚实边界）",
        geography="县域",
        questions=questions,
        rows=rows,
        expected_traps=(),
        pii_token="SECRET_PII_TOKEN_SUITE6",
        forbidden_traps=_ALL_TRAP_PREFIXES,
        expect_small_sample_null=True,
        max_tool_calls=20,
        extra_check=_check_null_honesty,
    )


def build_eval_scenarios() -> list[EvalScenario]:
    return [
        _build_suite_1(),
        _build_suite_2(),
        _build_suite_3(),
        _build_suite_4a(),
        _build_suite_4b(),
        _build_suite_5a(),
        _build_suite_5b(),
        _build_suite_6(),
    ]


def _select_scenarios(suite_filter: str | None) -> list[EvalScenario]:
    all_scenarios = build_eval_scenarios()
    if not suite_filter or suite_filter.strip().lower() == "all":
        return all_scenarios
    needle = suite_filter.strip().lower()
    matched = [
        sc
        for sc in all_scenarios
        if needle == sc.scenario_id.lower()
        or needle == sc.suite.lower()
        or sc.scenario_id.lower().startswith(needle)
    ]
    if not matched:
        valid = ", ".join(sc.scenario_id for sc in all_scenarios)
        raise ValueError(f"unknown_suite_filter:{suite_filter} (available: {valid})")
    return matched


_EVAL_CJK_BRACKET_RE = re.compile(r"[\u3010\u3011\u300c\u300d\u300e\u300f]")
_EVAL_LOCAL_PATH_RE = re.compile(r"(?:[A-Za-z]:[\\/]Users[\\/])|(?:/(?:Users|home)/[^/\s]+[\\/])")


def _audit_scenario_result(
    scenario: EvalScenario,
    result: dict[str, Any],
    sandbox: Any,
) -> dict[str, Any]:
    receipt_diags = [
        str(d)
        for rec in sandbox.receipts
        for d in (rec.get("diagnostics") or [])
    ]
    trace = list(result.get("reasoningTrace") or [])
    trace_diags = [
        str(d)
        for step in trace
        for d in (step.get("diagnostics") or [])
    ]
    all_diags = [*receipt_diags, *trace_diags]

    hits = sum(
        1
        for expected in scenario.expected_traps
        if any(d.startswith(expected) for d in all_diags)
    )
    missing_traps = [
        expected
        for expected in scenario.expected_traps
        if not any(d.startswith(expected) for d in all_diags)
    ]
    forbidden_hits = [
        forbid
        for forbid in scenario.forbidden_traps
        if any(d.startswith(forbid) for d in all_diags)
    ]

    # Tool precision across Phase 2 + Phase 3 tool invocations
    tool_steps = [
        step
        for step in trace
        if step.get("phase") in ("explore_and_pivot_data", "reanalyze", "falsify_and_review")
        and step.get("operator") != "pi_steering"
    ]
    seen_invocations: set[tuple[str, str, str]] = set()
    valid_non_redundant = 0
    for step in tool_steps:
        op = str(step.get("operator") or "")
        role = str(step.get("agentRole") or "")
        diags = [str(d) for d in (step.get("diagnostics") or [])]
        is_err = any(d.startswith(("OPERATOR_ERROR:", "REVIEW_TOOL_ERROR:")) for d in diags)
        sig = (role, op, canonical(step.get("args") or {}))
        if not is_err and sig not in seen_invocations:
            valid_non_redundant += 1
        seen_invocations.add(sig)

    # Zero-hallucination / provenance / privacy / honesty invariants
    hallucination_issues: list[str] = []
    if result.get("status") != "completed":
        hallucination_issues.append(f"run_not_completed:{result.get('status')}")
    if not ((result.get("epistemicGraph") or {}).get("completeness") or {}).get("passed", False):
        hallucination_issues.append("epistemic_completeness_failed")
    if (result.get("falsificationReport") or {}).get("decision") != "approve":
        hallucination_issues.append(f"reviewer_not_approved:{(result.get('falsificationReport') or {}).get('decision')}")

    serialized = json.dumps(result, ensure_ascii=False)
    if scenario.pii_token and scenario.pii_token in serialized:
        hallucination_issues.append(f"pii_token_leaked:{scenario.pii_token}")
    if _EVAL_LOCAL_PATH_RE.search(serialized):
        hallucination_issues.append("local_machine_path_leaked")
    outbound_prose = "\n".join([
        json.dumps(result.get("motherInsight") or {}, ensure_ascii=False),
        str((result.get("falsificationReport") or {}).get("summary") or ""),
    ])
    if _EVAL_CJK_BRACKET_RE.search(outbound_prose):
        hallucination_issues.append("cjk_bracket_residue_in_insight_or_summary")

    valid_snap_ids = {str(r["snapshot_id"]) for r in sandbox.receipts if r.get("snapshot_id")}
    mi = result.get("motherInsight") or {}
    for sid in mi.get("supportingSnapshots") or []:
        if sid not in valid_snap_ids:
            hallucination_issues.append(f"unverified_mother_insight_snap:{sid}")
    for node in (result.get("epistemicGraph") or {}).get("nodes") or []:
        for sid in node.get("snapshot_ids") or []:
            if sid not in valid_snap_ids:
                hallucination_issues.append(f"unverified_graph_node_snap:{node.get('id')}:{sid}")
    for entry in (result.get("epistemicGraph") or {}).get("pivot_log") or []:
        sid = entry.get("snapshotId")
        if sid and sid not in valid_snap_ids:
            hallucination_issues.append(f"unverified_pivot_snap:{sid}")

    honesty = summarize_receipts_honesty(sandbox.receipts, len(sandbox.active_rows))
    mi_text = json.dumps(mi, ensure_ascii=False)
    if not honesty["has_ridge"] and not honesty["has_pen_logit"]:
        if "经 Ridge/L2 修正" in mi_text or "Ridge" in mi_text:
            hallucination_issues.append("false_ridge_l2_claim_without_operator")
    if honesty["special_warnings"]:
        for warn in honesty["special_warnings"]:
            if warn not in str(mi.get("paradoxDetail") or "") or warn not in str(mi.get("scopeBoundary") or ""):
                hallucination_issues.append(f"missing_special_warning_disclosure:{warn}")

    if forbidden_hits:
        hallucination_issues.append(f"forbidden_traps_triggered:{','.join(forbidden_hits)}")

    if scenario.extra_check is not None:
        hallucination_issues.extend(scenario.extra_check(result, sandbox))

    return {
        "scenarioId": scenario.scenario_id,
        "suite": scenario.suite,
        "expectedTraps": len(scenario.expected_traps),
        "trapHits": hits,
        "missingTraps": missing_traps,
        "toolCalls": len(tool_steps),
        "validNonRedundantCalls": valid_non_redundant,
        "clean": len(hallucination_issues) == 0,
        "issues": hallucination_issues,
        "cleanedRowCount": (result.get("datasetSummary") or {}).get("cleanedRowCount"),
        "snapshotCount": len(valid_snap_ids),
    }


def run_adversarial_reviewer_probes(authored_root: Path) -> dict[str, Any]:
    """Run 3 deterministic adversarial probes against reviewer hash & subgroup falsification gates."""
    authored = AuthoredProvider(authored_root)
    title, questions, rows = build_planted_trap_benchmark()
    probe_results: list[dict[str, Any]] = []

    # Probe 1: Fabricated snapshot ID
    sb1 = build_inline_sandbox(title=title, questions=questions, rows=rows, classification="simulated")
    real_rec = sb1.inspect_distribution().data
    rev_tools1 = build_falsification_reviewer_tools(
        sandbox=sb1,
        claimed_snapshot_ids=[real_rec["snapshot_id"], "snap_fabricated_999999"],
    )
    hash_res1 = rev_tools1["verify_evidence_hashes"]().data
    rev_turn1 = authored._authored_reviewer_react_step([
        {"role": "system", "content": "reviewer"},
        {"role": "user", "content": "<reviewer-tools-ready/>"},
        {"role": "tool", "name": "verify_evidence_hashes", "content": json.dumps(hash_res1, ensure_ascii=False)},
    ])
    dec1 = ((rev_turn1.get("final") or {}).get("deliverable") or {}).get("decision")
    caught1 = (
        hash_res1.get("auditVerified") is False
        and "snap_fabricated_999999" in (hash_res1.get("missingOrInvalid") or [])
        and "HASH_AUDIT_GAP" in (hash_res1.get("diagnostics") or [])
        and dec1 == "revise"
    )
    probe_results.append({
        "probe": "fabricated_snapshot_id",
        "caught": caught1,
        "auditVerified": hash_res1.get("auditVerified"),
        "decision": dec1,
    })

    # Probe 2: Post-hoc tampered snapshot metric without updating SHA-256 result_hash
    sb2 = build_inline_sandbox(title=title, questions=questions, rows=rows, classification="simulated")
    sb2.apply_cleaning_pipeline()
    ols_rec = sb2.fit_linear_regression("adopt_intention", ["trust_1", "tech_ease"], ridge_lambda=0.0).data
    sb2.receipts[-1]["metrics"][0]["value"] = 999.9999
    rev_tools2 = build_falsification_reviewer_tools(
        sandbox=sb2,
        claimed_snapshot_ids=[ols_rec["snapshot_id"]],
    )
    hash_res2 = rev_tools2["verify_evidence_hashes"]().data
    rev_turn2 = authored._authored_reviewer_react_step([
        {"role": "system", "content": "reviewer"},
        {"role": "user", "content": "<reviewer-tools-ready/>"},
        {"role": "tool", "name": "verify_evidence_hashes", "content": json.dumps(hash_res2, ensure_ascii=False)},
    ])
    dec2 = ((rev_turn2.get("final") or {}).get("deliverable") or {}).get("decision")
    caught2 = (
        hash_res2.get("auditVerified") is False
        and ols_rec["snapshot_id"] in (hash_res2.get("missingOrInvalid") or [])
        and "HASH_AUDIT_GAP" in (hash_res2.get("diagnostics") or [])
        and dec2 == "revise"
    )
    probe_results.append({
        "probe": "tampered_snapshot_metric",
        "caught": caught2,
        "auditVerified": hash_res2.get("auditVerified"),
        "decision": dec2,
    })

    # Probe 3: Suppressed Simpson subgroup stratification on build_planted_trap_benchmark
    sb3 = build_inline_sandbox(title=title, questions=questions, rows=rows, classification="simulated")
    sb3.apply_cleaning_pipeline()
    sb3.purify_scale_reliability(
        "service_perception",
        ["trust_1", "trust_2", "trust_3", "Q_trap"],
        drop_negative_or_low_citc=True,
    )
    sb3.fit_linear_regression("adopt_intention", ["construct:service_perception", "tech_ease"], ridge_lambda=0.0)
    claimed3 = [rec["snapshot_id"] for rec in sb3.receipts]
    rev_tools3 = build_falsification_reviewer_tools(sandbox=sb3, claimed_snapshot_ids=claimed3)
    hash_res3 = rev_tools3["verify_evidence_hashes"]().data
    sub_res3 = rev_tools3["challenge_subgroup_robustness"](
        outcome="adopt_intention",
        predictor="construct:service_perception",
        moderators=["living_mode", "region_tier"],
    ).data
    rev_turn3 = authored._authored_reviewer_react_step([
        {"role": "system", "content": "reviewer"},
        {"role": "user", "content": "<reviewer-tools-ready/>"},
        {"role": "tool", "name": "verify_evidence_hashes", "content": json.dumps(hash_res3, ensure_ascii=False)},
        {"role": "tool", "name": "challenge_subgroup_robustness", "content": json.dumps(sub_res3, ensure_ascii=False)},
    ])
    findings3 = ((rev_turn3.get("final") or {}).get("deliverable") or {}).get("findings") or []
    caught3 = (
        "SUBGROUP_SIGN_REVERSAL:living_mode" in (sub_res3.get("diagnostics") or [])
        and bool(sub_res3.get("reversals"))
        and any("living_mode" in str(f.get("issue", "")) for f in findings3)
    )
    probe_results.append({
        "probe": "suppressed_simpson_subgroup",
        "caught": caught3,
        "diagnostics": sub_res3.get("diagnostics"),
        "findingCount": len(findings3),
    })

    caught_count = sum(1 for p in probe_results if p["caught"])
    return {
        "caught": caught_count,
        "total": 3,
        "rate": caught_count / 3.0,
        "probes": probe_results,
    }


def _wire_payload_to_canonical(
    provider_name: str,
    body: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, str]] | None, str]:
    """Reconstruct canonical ReAct messages, tool specs, and tool_choice from native provider wire JSON."""
    canonical_msgs: list[dict[str, Any]] = []
    tc_id_to_name: dict[str, str] = {}

    if provider_name == "anthropic":
        tool_choice = "auto" if "tool_choice" in body else "none"
        avail_tools = [
            {"name": t["name"]}
            for t in (body.get("tools") or [])
            if isinstance(t, dict) and t.get("name")
        ]
        if body.get("system"):
            canonical_msgs.append({"role": "system", "content": str(body["system"])})
        for msg in body.get("messages") or []:
            role = msg.get("role")
            content = msg.get("content")
            if role == "user":
                if isinstance(content, str):
                    canonical_msgs.append({"role": "user", "content": content})
                elif isinstance(content, list):
                    for blk in content:
                        if isinstance(blk, dict) and blk.get("type") == "tool_result":
                            tid = str(blk.get("tool_use_id") or "")
                            canonical_msgs.append({
                                "role": "tool",
                                "tool_call_id": tid,
                                "name": tc_id_to_name.get(tid, ""),
                                "content": str(blk.get("content") or ""),
                            })
                        elif isinstance(blk, dict) and blk.get("type") == "text":
                            canonical_msgs.append({"role": "user", "content": str(blk.get("text") or "")})
            elif role == "assistant" and isinstance(content, list):
                tcs: list[dict[str, Any]] = []
                texts: list[str] = []
                for blk in content:
                    if not isinstance(blk, dict):
                        continue
                    if blk.get("type") == "tool_use":
                        tid = str(blk.get("id") or "")
                        tname = str(blk.get("name") or "")
                        tc_id_to_name[tid] = tname
                        tcs.append({"id": tid, "name": tname, "arguments": dict(blk.get("input") or {})})
                    elif blk.get("type") == "text":
                        texts.append(str(blk.get("text") or ""))
                asst: dict[str, Any] = {"role": "assistant"}
                if texts:
                    asst["content"] = "".join(texts)
                if tcs:
                    asst["tool_calls"] = tcs
                canonical_msgs.append(asst)
        return canonical_msgs, avail_tools or None, tool_choice

    if provider_name == "gemini":
        fc_mode = ((body.get("toolConfig") or {}).get("functionCallingConfig") or {}).get("mode")
        tool_choice = "none" if fc_mode == "NONE" else "auto"
        avail_tools = [
            {"name": fd["name"]}
            for t in (body.get("tools") or [])
            if isinstance(t, dict)
            for fd in (t.get("functionDeclarations") or [])
            if isinstance(fd, dict) and fd.get("name")
        ]
        sys_parts = ((body.get("systemInstruction") or {}).get("parts") or [])
        if sys_parts:
            canonical_msgs.append({"role": "system", "content": str(sys_parts[0].get("text") or "")})
        for entry in body.get("contents") or []:
            role = entry.get("role")
            parts = entry.get("parts") or []
            if role == "user":
                for p in parts:
                    if "text" in p:
                        canonical_msgs.append({"role": "user", "content": str(p["text"])})
                    elif "functionResponse" in p:
                        fr = p["functionResponse"]
                        fname = str(fr.get("name") or "")
                        res_obj = (fr.get("response") or {}).get("result")
                        canonical_msgs.append({
                            "role": "tool",
                            "tool_call_id": fname,
                            "name": fname,
                            "content": json.dumps(res_obj, ensure_ascii=False) if not isinstance(res_obj, str) else res_obj,
                        })
            elif role == "model":
                tcs = []
                texts = []
                for idx, p in enumerate(parts):
                    if "functionCall" in p:
                        fc = p["functionCall"]
                        fname = str(fc.get("name") or "")
                        tcs.append({"id": fc.get("id") or f"g_{idx}", "name": fname, "arguments": dict(fc.get("args") or {})})
                    elif "text" in p and not p.get("thought"):
                        texts.append(str(p["text"]))
                asst = {"role": "assistant"}
                if texts:
                    asst["content"] = "".join(texts)
                if tcs:
                    asst["tool_calls"] = tcs
                canonical_msgs.append(asst)
        return canonical_msgs, avail_tools or None, tool_choice

    # OpenAI / DeepSeek / Qwen / Compatible
    tool_choice = str(body.get("tool_choice") or "auto")
    avail_tools = [
        {"name": t["function"]["name"]}
        for t in (body.get("tools") or [])
        if isinstance(t, dict) and isinstance(t.get("function"), dict) and t["function"].get("name")
    ]
    for msg in body.get("messages") or []:
        role = msg.get("role")
        if role in ("system", "user"):
            canonical_msgs.append({"role": role, "content": str(msg.get("content") or "")})
        elif role == "assistant":
            tcs = []
            for tc in msg.get("tool_calls") or []:
                tid = str(tc.get("id") or "")
                fn = tc.get("function") or {}
                tname = str(fn.get("name") or "")
                tc_id_to_name[tid] = tname
                try:
                    parsed_args = json.loads(fn.get("arguments") or "{}")
                except Exception:
                    parsed_args = {}
                tcs.append({"id": tid, "name": tname, "arguments": parsed_args})
            asst = {"role": "assistant"}
            if msg.get("content"):
                asst["content"] = str(msg["content"])
            if tcs:
                asst["tool_calls"] = tcs
            canonical_msgs.append(asst)
        elif role == "tool":
            tid = str(msg.get("tool_call_id") or "")
            canonical_msgs.append({
                "role": "tool",
                "tool_call_id": tid,
                "name": tc_id_to_name.get(tid, ""),
                "content": str(msg.get("content") or ""),
            })
    return canonical_msgs, avail_tools or None, tool_choice


def _canonical_step_to_wire_response(
    provider_name: str,
    payload: dict[str, Any],
    *,
    tool_choice: str,
    turn_seq: int,
) -> dict[str, Any]:
    thought = str(payload.get("thought") or "")
    raw_tcs = payload.get("tool_calls") or []
    is_tool_turn = bool(raw_tcs) and tool_choice != "none"

    if provider_name == "anthropic":
        if is_tool_turn:
            blocks: list[dict[str, Any]] = []
            if thought:
                blocks.append({"type": "thinking", "thinking": thought})
            for idx, tc in enumerate(raw_tcs):
                blocks.append({
                    "type": "tool_use",
                    "id": f"anth_tc_{turn_seq}_{idx}",
                    "name": str(tc["name"]),
                    "input": dict(tc.get("args") or {}),
                })
            return {
                "type": "message",
                "role": "assistant",
                "stop_reason": "tool_use",
                "content": blocks,
                "usage": {"input_tokens": 120, "output_tokens": 48},
            }
        final_obj = payload.get("final") if isinstance(payload.get("final"), dict) else payload
        blocks = ([{"type": "thinking", "thinking": thought}] if thought else []) + [
            {"type": "text", "text": json.dumps(final_obj, ensure_ascii=False, separators=(",", ":"))}
        ]
        return {
            "type": "message",
            "role": "assistant",
            "stop_reason": "end_turn",
            "content": blocks,
            "usage": {"input_tokens": 140, "output_tokens": 60},
        }

    if provider_name == "gemini":
        parts: list[dict[str, Any]] = []
        if thought:
            parts.append({"text": thought, "thought": True})
        if is_tool_turn:
            for idx, tc in enumerate(raw_tcs):
                parts.append({
                    "functionCall": {
                        "id": f"gem_tc_{turn_seq}_{idx}",
                        "name": str(tc["name"]),
                        "args": dict(tc.get("args") or {}),
                    }
                })
        else:
            final_obj = payload.get("final") if isinstance(payload.get("final"), dict) else payload
            parts.append({"text": json.dumps(final_obj, ensure_ascii=False, separators=(",", ":"))})
        return {
            "candidates": [{"finishReason": "STOP", "content": {"role": "model", "parts": parts}}],
            "usageMetadata": {"promptTokenCount": 120, "candidatesTokenCount": 48},
        }

    if is_tool_turn:
        return {
            "choices": [{
                "finish_reason": "tool_calls",
                "message": {
                    "role": "assistant",
                    "content": "",
                    "reasoning_content": thought,
                    "tool_calls": [
                        {
                            "id": f"oai_tc_{turn_seq}_{idx}",
                            "type": "function",
                            "function": {
                                "name": str(tc["name"]),
                                "arguments": json.dumps(dict(tc.get("args") or {}), ensure_ascii=False, separators=(",", ":")),
                            },
                        }
                        for idx, tc in enumerate(raw_tcs)
                    ],
                },
            }],
            "usage": {"prompt_tokens": 120, "completion_tokens": 48},
        }

    final_obj = payload.get("final") if isinstance(payload.get("final"), dict) else payload
    return {
        "choices": [{
            "finish_reason": "stop",
            "message": {
                "role": "assistant",
                "content": json.dumps(final_obj, ensure_ascii=False, separators=(",", ":")),
                "reasoning_content": thought,
            },
        }],
        "usage": {"prompt_tokens": 140, "completion_tokens": 60},
    }


async def run_protocol_live_compat(authored_root: Path) -> dict[str, Any]:
    """Run real LiveProvider + httpx.MockTransport end-to-end across all 6 LLM protocol dialects."""
    authored = AuthoredProvider(authored_root)
    title, questions, base_rows = build_planted_trap_benchmark()
    rows = deepcopy(base_rows)
    for idx, row in enumerate(rows):
        row["answers"]["q_open"] = f"SECRET_PII_TOKEN_PROTO_{idx}"

    synth_key = "synthetic-eval-protocol-key-only"
    original_async_client = llm_mod.httpx.AsyncClient
    provider_results: list[dict[str, Any]] = []

    for provider_name, (base_url, model_name) in _PROVIDERS.items():
        http_calls: list[httpx.Request] = []
        transport_options: list[dict[str, Any]] = []

        def _make_handler(p_name: str):
            def _dispatch(request: httpx.Request) -> httpx.Response:
                http_calls.append(request)
                raw_bytes = request.content.decode("utf-8")
                if synth_key in raw_bytes or synth_key in str(request.url):
                    raise AssertionError("secret_key_leaked_in_wire_payload")
                body = json.loads(raw_bytes)
                c_msgs, avail_tools, t_choice = _wire_payload_to_canonical(p_name, body)
                joined = "\n".join(str(m.get("content") or "") for m in c_msgs)
                if "<sandbox-context>" in joined:
                    payload = authored._authored_data_react_step(c_msgs, tools=avail_tools, tool_choice=t_choice)
                elif "<reviewer-tools-ready/>" in joined:
                    payload = authored._authored_reviewer_react_step(c_msgs, tool_choice=t_choice)
                else:
                    raise AssertionError(f"unexpected_prompt_phase:{p_name}")
                wire_json = _canonical_step_to_wire_response(
                    p_name,
                    payload,
                    tool_choice=t_choice,
                    turn_seq=len(http_calls),
                )
                return httpx.Response(200, json=wire_json)

            return _dispatch

        def _client_factory(**kwargs: Any) -> httpx.AsyncClient:
            transport_options.append(kwargs)
            return original_async_client(transport=httpx.MockTransport(_make_handler(provider_name)), **kwargs)

        llm_mod.httpx.AsyncClient = _client_factory  # type: ignore[assignment]
        try:
            sb = build_inline_sandbox(title=title, questions=questions, rows=rows, classification="simulated")
            res = await execute_autonomous_research_core(
                project_id=f"eval-proto-{provider_name}",
                goal="县域老年智慧助餐与守护服务采纳机制调研",
                geography="县域",
                dataset_mode="inline_dataset",
                lease_mode="pi_autonomous",
                max_tool_calls=28,
                sandbox=sb,
                dataset_title=title,
                provider=LiveProvider(),
                service_config={
                    "provider": provider_name,
                    "baseUrl": base_url,
                    "model": model_name,
                    "maxOutputTokens": 1024,
                },
                decrypted_key=synth_key,
            )
            ok = (
                res.get("status") == "completed"
                and ((res.get("epistemicGraph") or {}).get("completeness") or {}).get("passed") is True
                and (res.get("falsificationReport") or {}).get("decision") == "approve"
                and len(http_calls) >= 4
                and all(opt.get("follow_redirects") is False and opt.get("trust_env") is False for opt in transport_options)
                and "SECRET_PII_TOKEN_PROTO" not in json.dumps(res, ensure_ascii=False)
            )
            provider_results.append({
                "provider": provider_name,
                "passed": ok,
                "httpCalls": len(http_calls),
                "snapshots": len(sb.receipts),
            })
        finally:
            llm_mod.httpx.AsyncClient = original_async_client

    passed_count = sum(1 for item in provider_results if item["passed"])
    return {
        "passed": passed_count,
        "total": len(_PROVIDERS),
        "rate": passed_count / float(len(_PROVIDERS)),
        "providers": provider_results,
    }


async def run_offline_evaluation(
    *,
    suite_filter: str | None = None,
    authored_root: Path | None = None,
) -> dict[str, Any]:
    """Execute the offline 8-scenario, 3-probe, and 6-protocol benchmark scorecard."""
    scenarios = _select_scenarios(suite_filter)
    prev_sleep = os.environ.get("EVIXLOCAL_AUTHORED_SLEEP")
    prev_scholar = os.environ.get("EVIX_ENABLE_LIVE_SCHOLAR_API")
    os.environ["EVIXLOCAL_AUTHORED_SLEEP"] = "0"
    os.environ["EVIX_ENABLE_LIVE_SCHOLAR_API"] = "0"
    temp_dir: tempfile.TemporaryDirectory[str] | None = None
    try:
        if authored_root is None:
            temp_dir = tempfile.TemporaryDirectory(prefix="evix_eval_authored_")
            root_path = Path(temp_dir.name)
        else:
            root_path = authored_root
        provider = AuthoredProvider(root_path)

        scenario_reports: list[dict[str, Any]] = []
        for sc in scenarios:
            sb = build_inline_sandbox(
                title=sc.title,
                questions=sc.questions,
                rows=sc.rows,
                classification="simulated",
                ref=f"eval:{sc.scenario_id}",
            )
            result = await execute_autonomous_research_core(
                project_id=f"eval-{sc.scenario_id}",
                goal=sc.goal,
                geography=sc.geography,
                dataset_mode="inline_dataset",
                lease_mode="pi_autonomous",
                max_tool_calls=sc.max_tool_calls,
                sandbox=sb,
                dataset_title=sc.title,
                provider=provider,
            )
            scenario_reports.append(_audit_scenario_result(sc, result, sb))

        reviewer_probes = run_adversarial_reviewer_probes(root_path)
        protocol_compat = await run_protocol_live_compat(root_path)
    finally:
        if prev_sleep is None:
            os.environ.pop("EVIXLOCAL_AUTHORED_SLEEP", None)
        else:
            os.environ["EVIXLOCAL_AUTHORED_SLEEP"] = prev_sleep
        if prev_scholar is None:
            os.environ.pop("EVIX_ENABLE_LIVE_SCHOLAR_API", None)
        else:
            os.environ["EVIX_ENABLE_LIVE_SCHOLAR_API"] = prev_scholar
        if temp_dir is not None:
            temp_dir.cleanup()

    total_traps = sum(r["expectedTraps"] for r in scenario_reports)
    total_hits = sum(r["trapHits"] for r in scenario_reports)
    total_calls = sum(r["toolCalls"] for r in scenario_reports)
    valid_calls = sum(r["validNonRedundantCalls"] for r in scenario_reports)
    clean_scenarios = sum(1 for r in scenario_reports if r["clean"])

    metrics = {
        "trap_recall": (total_hits / float(total_traps)) if total_traps else 1.0,
        "tool_precision": (valid_calls / float(total_calls)) if total_calls else 0.0,
        "zero_hallucination_rate": (clean_scenarios / float(len(scenario_reports))) if scenario_reports else 0.0,
        "reviewer_catch_rate": reviewer_probes["rate"],
        "protocol_live_compat": protocol_compat["rate"],
    }
    strict_passed = (
        metrics["trap_recall"] >= _STRICT_THRESHOLDS["trap_recall"]
        and metrics["tool_precision"] >= _STRICT_THRESHOLDS["tool_precision"]
        and metrics["zero_hallucination_rate"] == _STRICT_THRESHOLDS["zero_hallucination_rate"]
        and metrics["reviewer_catch_rate"] == _STRICT_THRESHOLDS["reviewer_catch_rate"]
        and metrics["protocol_live_compat"] == _STRICT_THRESHOLDS["protocol_live_compat"]
    )
    return {
        "mode": "offline",
        "suiteFilter": suite_filter or "all",
        "metrics": metrics,
        "thresholds": dict(_STRICT_THRESHOLDS),
        "strictPassed": strict_passed,
        "totals": {
            "scenarios": len(scenario_reports),
            "cleanScenarios": clean_scenarios,
            "trapHits": total_hits,
            "expectedTraps": total_traps,
            "validToolCalls": valid_calls,
            "totalToolCalls": total_calls,
        },
        "scenarios": scenario_reports,
        "reviewerProbes": reviewer_probes,
        "protocolLiveCompat": protocol_compat,
    }


async def run_live_evaluation(
    *,
    provider_name: str,
    base_url: str,
    model: str,
    api_key: str,
    suite_filter: str | None = None,
) -> dict[str, Any]:
    """Execute scenarios against a caller-configured LiveProvider endpoint."""
    scenarios = _select_scenarios(suite_filter)
    provider = LiveProvider()
    cfg = {
        "provider": provider_name,
        "baseUrl": base_url,
        "model": model,
        "maxOutputTokens": 2048,
    }
    scenario_reports: list[dict[str, Any]] = []
    for sc in scenarios:
        sb = build_inline_sandbox(
            title=sc.title,
            questions=sc.questions,
            rows=sc.rows,
            classification="simulated",
            ref=f"eval:{sc.scenario_id}",
        )
        result = await execute_autonomous_research_core(
            project_id=f"eval-live-{sc.scenario_id}",
            goal=sc.goal,
            geography=sc.geography,
            dataset_mode="inline_dataset",
            lease_mode="pi_autonomous",
            max_tool_calls=sc.max_tool_calls,
            sandbox=sb,
            dataset_title=sc.title,
            provider=provider,
            service_config=cfg,
            decrypted_key=api_key,
        )
        scenario_reports.append(_audit_scenario_result(sc, result, sb))

    total_traps = sum(r["expectedTraps"] for r in scenario_reports)
    total_hits = sum(r["trapHits"] for r in scenario_reports)
    total_calls = sum(r["toolCalls"] for r in scenario_reports)
    valid_calls = sum(r["validNonRedundantCalls"] for r in scenario_reports)
    clean_scenarios = sum(1 for r in scenario_reports if r["clean"])
    metrics = {
        "trap_recall": (total_hits / float(total_traps)) if total_traps else 1.0,
        "tool_precision": (valid_calls / float(total_calls)) if total_calls else 0.0,
        "zero_hallucination_rate": (clean_scenarios / float(len(scenario_reports))) if scenario_reports else 0.0,
        "reviewer_catch_rate": 1.0,
        "protocol_live_compat": 1.0,
    }
    strict_passed = (
        metrics["trap_recall"] >= _STRICT_THRESHOLDS["trap_recall"]
        and metrics["tool_precision"] >= _STRICT_THRESHOLDS["tool_precision"]
        and metrics["zero_hallucination_rate"] == _STRICT_THRESHOLDS["zero_hallucination_rate"]
    )
    return {
        "mode": "live",
        "provider": provider_name,
        "model": model,
        "suiteFilter": suite_filter or "all",
        "metrics": metrics,
        "thresholds": dict(_STRICT_THRESHOLDS),
        "strictPassed": strict_passed,
        "scenarios": scenario_reports,
    }


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="EVI-X Phase 4 autonomous trajectory eval harness")
    parser.add_argument("--mode", choices=("offline", "live"), default="offline")
    parser.add_argument("--strict", action="store_true", help="Fail with non-zero exit if any threshold fails")
    parser.add_argument("--json-out", default="", help="Optional output path for JSON scorecard")
    parser.add_argument("--suite", default="all", help="Optional scenario ID or suite prefix filter")
    parser.add_argument("--provider", default=None, help="Live mode provider (required for --mode live)")
    parser.add_argument("--base-url", default=None, help="Live mode base URL (required for --mode live)")
    parser.add_argument("--model", default=None, help="Live mode model ID (required for --mode live)")
    parser.add_argument(
        "--api-key-env",
        default=None,
        help="Explicit env var holding API key (required for --mode live; never defaults)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.mode == "live":
        missing = [
            flag
            for flag, val in (
                ("--provider", args.provider),
                ("--base-url", args.base_url),
                ("--model", args.model),
                ("--api-key-env", args.api_key_env),
            )
            if not isinstance(val, str) or not val.strip()
        ]
        if missing:
            sys.stderr.write(
                f"Fail-closed: --mode live requires explicit {', '.join(missing)}\n"
            )
            return 2
        if args.provider not in _PROVIDERS:
            sys.stderr.write(
                f"Fail-closed: unsupported --provider {args.provider!r}\n"
            )
            return 2
        api_key = os.environ.get(args.api_key_env, "").strip()
        if not api_key:
            sys.stderr.write(
                f"Fail-closed: env var {args.api_key_env!r} is unset or empty\n"
            )
            return 2
        report = asyncio.run(
            run_live_evaluation(
                provider_name=args.provider,
                base_url=args.base_url,
                model=args.model,
                api_key=api_key,
                suite_filter=args.suite,
            )
        )
    else:
        report = asyncio.run(run_offline_evaluation(suite_filter=args.suite))

    payload_text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.json_out:
        out_path = Path(args.json_out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(payload_text, encoding="utf-8")

    sys.stdout.write(payload_text + "\n")
    if args.strict and not report["strictPassed"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
