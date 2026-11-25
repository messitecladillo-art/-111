"""Tests for unified pre-submission red-team gate, CLI script, and FastAPI route."""
import json
import re
from pathlib import Path
import subprocess
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient

from evix_api.routes.reports import register_reports
from multi_agent.agents.writing_agent.services.pre_submission_gate import run_preflight_audit


def test_clean_draft_passes_preflight_gate():
    clean_payload = {
        "title": "县域低空无人机农林植保消费意愿与采纳机制实证研究",
        "competitionName": "“益普索杯”第十七届全国大学生市场调查与分析大赛",
        "expectedEdition": 17,
        "requireBlindReview": True,
        "estimatedPages": 54,
        "sections": [
            {
                "id": "abs",
                "title": "摘要",
                "body": "围绕县域农林植保低空无人机服务扩散痛点，本研究基于多阶段分层配额抽样获得有效样本 n=486 份（乘以设计效应 Deff=1.35 校核）。表1-1 显示整体采纳意愿均值为 3.84 分；OLS 与有序 Logit 结果提示操作信任与补贴认知显著正向关联采纳意愿，但在横截面设计下相关关系不等同于严格因果推断。建议从农机服务站示范试用、保险托底、分时租赁及村集体统筹四个维度落地改进。" + "实证数据充实。" * 10,
            },
            {
                "id": "s1",
                "title": "一、抽样设计与数据质量",
                "body": "表 1-1 本研究采用多阶段分层 PPS 抽样，考虑设计效应 Deff = 1.35 后确定有效样本量 n = 486 份，均已做匿名脱敏处理。",
            },
            {
                "id": "s2",
                "title": "二、开放题词云与模型检验",
                "body": "图 2-1 高频词云结果与问卷 Q12 满意度及服务信任维度均值呈同向印证，结构方程拟合 RMSEA = 0.048，CFI = 0.942，TLI = 0.928，模型拟合良好。",
            },
            {
                "id": "app_ai",
                "title": "附录四：AI工具使用说明",
                "body": "本研究在文案润色环节遵循赛事 AIGC 披露规范，仅用于语言检查与合规核验。",
            },
        ],
    }
    res = run_preflight_audit(clean_payload)
    assert res["ok"] is True
    assert res["passed"] is True
    assert res["summary"]["errors"] == 0
    assert res["score"] >= 90


def test_bad_cases_are_caught_by_preflight_gate_and_route(tmp_path: Path):
    flawed = {
        "title": "正大杯老花镜银发调研【教学模拟】",
        "competitionName": "正大杯第十五届全国大学生市场调查与分析大赛",
        "expectedEdition": 17,
        "requireBlindReview": True,
        "estimatedPages": 72,
        "sections": [
            {
                "id": "s1",
                "title": "一、团队与背景",
                "body": "来自清华大学经管学院的小队开展调研，指导教师：张明远。使用简单随机抽样公式计算后改用方便抽样，直接导致老年人购买行为提升。",
            },
            {
                "id": "s2",
                "title": "二、统计建模结果",
                "body": "有效样本量 n = 42。我们建立验证性因子分析 CFA 与 SEM 模型，RMSEA = 0.124，CFI = 0.81，模型拟合良好。Logistic回归得出 SE = 28.6。随后用 K-Means 聚类标签作为目标训练 GBDT 模型，准确率达 98%，证明分类有效。",
            },
            {
                "id": "s3",
                "title": "三、词云印象概览",
                "body": "通过分词词频统计与词云图直观展现了访谈语料的高频词概貌与情感倾向。",
            },
        ],
    }
    res = run_preflight_audit(flawed)
    assert res["passed"] is False
    ids = {c["id"] for c in res["checks"]}
    assert "stale_competition_title" in ids
    assert "simulation_or_ai_leak" in ids
    assert "blind_school_leak" in ids
    assert "blind_person_leak" in ids
    assert "page_budget_exceeded" in ids
    assert "micro_sample_factor_model" in ids
    assert "sem_fit_overreach" in ids
    assert "complete_separation_se" in ids
    assert "circular_cluster_classifier" in ids
    assert "causal_overreach" in ids
    assert "orphan_nlp_section" in ids
    for chk in res["checks"]:
        assert not re.search(r"[【】「」『』]", chk["message"]), f"Unexpected bracket in check message: {chk['message']}"
        assert "[已脱敏]" not in chk["message"]
    for rec in res["recommendations"]:
        assert not re.search(r"[【】「」『』]", rec), f"Unexpected bracket in recommendation: {rec}"
        assert "[已脱敏]" not in rec

    from shared.errors import ApiError
    app = FastAPI()

    @app.exception_handler(ApiError)
    async def _api_err_handler(_req, exc: ApiError):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=exc.status, content={"detail": exc.message, "code": exc.code})

    register_reports(app, auth=lambda: None, db=lambda: None, owned_project=lambda *a, **k: None, operation=lambda *a, **k: None)
    with TestClient(app) as client:
        r = client.post("/api/reports/preflight-audit", json=flawed)
        assert r.status_code == 200
        assert r.json()["passed"] is False
        csrf = client.post("/api/reports/preflight-audit", json=flawed, headers={"sec-fetch-site": "cross-site"})
        assert csrf.status_code == 403

    # CLI exit code check
    draft_path = tmp_path / "flawed.json"
    draft_path.write_text(json.dumps(flawed, ensure_ascii=False), encoding="utf-8")
    cli = Path(__file__).resolve().parents[3] / "scripts" / "audit_submission_gate.py"
    proc = subprocess.run(
        [sys.executable, str(cli), "--json", str(draft_path), "--format", "json"],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert proc.returncode == 1
    cli_out = json.loads(proc.stdout)
    assert cli_out["passed"] is False


def test_blind_school_regex_eliminates_generic_false_positives_and_catches_real_schools():
    clean_generic = {
        "title": "高校数智学习平台使用现状与改进路径调查",
        "competitionName": "“益普索杯”第十七届全国大学生市场调查与分析大赛",
        "expectedEdition": 17,
        "requireBlindReview": True,
        "estimatedPages": 48,
        "sections": [
            {
                "id": "abs",
                "title": "摘要",
                "body": "围绕生成式工具在武汉市大学生群体中的渗透情况展开调查，表 1-1 显示相关工具已进入许多大学日常学习与学院科研环节。" + "样本实证分析。" * 14,
            },
            {
                "id": "s1",
                "title": "一、研究背景",
                "body": "表 1-1 本研究聚焦在武汉市大学及周边高校调研，工具已进入许多大学，重点考察衔接学院课程与结合学院实践的教学安排，以及某某大学、某高校与某某职业技术学校等匿名代称。" ,
            },
            {
                "id": "s2",
                "title": "二、实证结果",
                "body": "在大学城与大学园走访多所独立学院与公办高校，相关规律提示正向关联。",
            },
            {
                "id": "app_ai",
                "title": "附录四：AI工具使用说明",
                "body": "本研究在文案润色环节遵循 AIGC 合规核验。",
            },
        ],
    }
    res = run_preflight_audit(clean_generic)
    assert res["summary"]["errors"] == 0, res["checks"]
    assert not any(c["id"] == "blind_school_leak" for c in res["checks"])

    for leaked_text in ("清华大学经管学院课题组", "来自北京大学光华管理学院", "武汉职业技术学校调研队"):
        flagged = run_preflight_audit({
            "title": "盲审泄漏测试",
            "expectedEdition": 17,
            "requireBlindReview": True,
            "sections": [{"id": "s1", "title": "一、背景", "body": leaked_text}],
        })
        assert any(c["id"] == "blind_school_leak" for c in flagged["checks"]), leaked_text
