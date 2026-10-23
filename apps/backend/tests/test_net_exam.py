"""The practice bank is operator-provided and served only to signed-in invited members."""
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from evix_api.app import create_app
from shared.errors import ApiError
from features.net_exam import MAX_BANK_BYTES, NetExamBank, validate_bank
from application.providers import FixtureProvider
from infrastructure.settings import Settings


def synthetic_bank(version="synthetic-v1"):
    return {
        "version": version,
        "sources": [{"id": "s1", "filename": "合成题源.docx", "sha256": "0" * 64}],
        "questions": [
            {"id": "q1", "type": "single", "chapter": "抽样与估计", "stem": "合成单选题", "options": [{"id": "A", "text": "甲"}, {"id": "B", "text": "乙"}],
             "answer": ["A"], "answerStatus": "valid", "sourceRefs": [{"sourceId": "s1", "locators": ["p1"]}]},
            {"id": "q2", "type": "multiple", "chapter": "问卷与量表", "stem": "合成多选题", "options": [{"id": "A", "text": "甲"}, {"id": "B", "text": "乙"}, {"id": "C", "text": "丙"}],
             "answer": ["A", "C"], "answerStatus": "valid", "sourceRefs": [{"sourceId": "s1", "locators": ["p2"]}]},
            {"id": "q3", "type": "boolean", "chapter": "描述统计", "stem": "合成判断题", "options": [{"id": "true", "text": "正确"}, {"id": "false", "text": "错误"}],
             "answer": ["false"], "answerStatus": "valid", "sourceRefs": []},
        ],
    }


def write(path: Path, value):
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    return path


def test_valid_bank_passes_and_is_served_as_compact_json(tmp_path):
    bank = NetExamBank(write(tmp_path / "bank.json", synthetic_bank()))
    served = json.loads(bank.body().decode("utf-8"))
    assert served == synthetic_bank()


@pytest.mark.parametrize("mutate", [
    lambda b: b.pop("version"),
    lambda b: b["questions"].clear(),
    lambda b: b["questions"][1].update(id="q1"),
    lambda b: b["questions"][0].update(type="essay"),
    lambda b: b["questions"][0].update(answer=["Z"]),
    lambda b: b["questions"][0].update(answer=["A", "B"]),
    lambda b: b["questions"][1].update(answer=["A"]),
    lambda b: b["questions"][0]["options"].append({"id": "A", "text": "重复"}),
    lambda b: b["questions"][0].update(sourceRefs=[{"sourceId": "missing", "locators": []}]),
    lambda b: b["questions"][0].update(sourceRefs=[{"sourceId": "s1"}]),
    lambda b: b["questions"][0].update(answerStatus="review"),
    lambda b: b["sources"].append({"id": "s1"}),
])
def test_structural_contract_rejects_unusable_banks(mutate):
    bank = synthetic_bank()
    mutate(bank)
    with pytest.raises(ValueError):
        validate_bank(bank)


def test_unconfigured_or_missing_bank_is_unavailable(tmp_path):
    for bank in (NetExamBank(None), NetExamBank(tmp_path / "absent.json")):
        with pytest.raises(ApiError) as error:
            bank.body()
        assert (error.value.status, error.value.code) == (404, "net_exam_bank_unavailable")


def test_invalid_or_oversized_file_is_reported_not_served(tmp_path):
    broken = tmp_path / "broken.json"
    broken.write_text("{not json", encoding="utf-8")
    oversized = tmp_path / "large.json"
    oversized.write_bytes(b" " * (MAX_BANK_BYTES + 1))
    directory = tmp_path / "directory.json"
    directory.mkdir()
    for path in (broken, oversized, directory, write(tmp_path / "shape.json", {"version": "x"})):
        with pytest.raises(ApiError) as error:
            NetExamBank(path).body()
        assert (error.value.status, error.value.code) == (503, "net_exam_bank_invalid")


def test_replaced_file_is_reloaded_and_failed_reload_does_not_serve_stale(tmp_path):
    path = write(tmp_path / "bank.json", synthetic_bank("v1"))
    bank = NetExamBank(path)
    assert json.loads(bank.body())["version"] == "v1"
    write(path, synthetic_bank("v2-longer"))
    os.utime(path, ns=(path.stat().st_atime_ns, path.stat().st_mtime_ns + 1_000_000))
    assert json.loads(bank.body())["version"] == "v2-longer"
    path.write_text("{}", encoding="utf-8")
    os.utime(path, ns=(path.stat().st_atime_ns, path.stat().st_mtime_ns + 2_000_000))
    with pytest.raises(ApiError):
        bank.body()


def test_empty_bank_path_is_rejected(settings):
    with pytest.raises(ValueError):
        Settings(**(settings.model_dump() | {"net_exam_bank_path": Path("")}))


def test_bank_requires_signed_in_member_and_is_not_cached(settings, pg_engine, tmp_path):
    deliveries = {}

    async def mail(challenge_id, email, code):
        deliveries[challenge_id] = (email, code)

    configured = Settings(**(settings.model_dump() | {"net_exam_bank_path": write(tmp_path / "bank.json", synthetic_bank())}))
    origin = {"origin": configured.allowed_origins[0]}
    with TestClient(create_app(configured, mail=mail, provider=FixtureProvider(), engine=pg_engine)) as client:
        assert client.get("/api/net-exam/bank").status_code == 401
        response = client.post("/api/auth/code", headers=origin, json={"email": "a@example.test"})
        challenge = response.json()["challengeId"]
        response = client.post("/api/auth/verify", headers=origin, json={"challengeId": challenge, "code": deliveries[challenge][1]})
        assert response.status_code == 200, response.text
        response = client.get("/api/net-exam/bank")
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"
        assert response.json()["version"] == "synthetic-v1"

    with TestClient(create_app(settings, mail=mail, provider=FixtureProvider(), engine=pg_engine)) as client:
        response = client.post("/api/auth/code", headers=origin, json={"email": "b@example.test"})
        challenge = response.json()["challengeId"]
        client.post("/api/auth/verify", headers=origin, json={"challengeId": challenge, "code": deliveries[challenge][1]})
        response = client.get("/api/net-exam/bank")
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "net_exam_bank_unavailable"
