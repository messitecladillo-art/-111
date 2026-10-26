"""Guard the fields that collided when PR38 met the modular-agent main branch."""
import copy
import json

import pytest

from shared.errors import ApiError
from multi_agent.agents.writing_agent.services.reports import report_content
from tests.test_report_quality import reference, v2


def combined_content():
    # Software-only fixture: no fieldwork, inferential result or paid model call.
    value = v2()
    value.update(version=3, visualStyle={"schema": "ProjectVisualStyle/v1", "paletteId": "blue", "version": 1}, figures=[], references=[reference()])
    result = value["quality"]["results"][0]
    result["variables"] = ["渠道"]
    result["receipt"] = {
        "version": 1, "interpretation": "软件合成样本的频数登记，不是实地调查。",
        "sample": {"calculationRows": 3, "analysisRows": 2, "excludedRows": 1,
                   "missingRows": 1, "invalidRows": 0, "outOfRangeRows": None},
        "percentageBasis": "effective-sample",
    }
    return value


def test_v3_keeps_main_references_and_variable_names_with_pr38_receipts():
    original = combined_content()
    stored = json.loads(json.dumps(original, ensure_ascii=False))
    assert report_content(stored) == original
    assert stored["quality"]["results"][0]["resultHash"] == "b" * 64
    assert stored["references"][0]["authors"] == ["张三", "SMITH J"]


@pytest.mark.parametrize("invalid", ["variables", "receipt", "references", "old-version-visuals"])
def test_combined_fields_do_not_disable_each_others_validation(invalid):
    value = copy.deepcopy(combined_content())
    if invalid == "variables":
        value["quality"]["results"][0]["variables"] = ["x"] * 5
    elif invalid == "receipt":
        value["quality"]["results"][0]["receipt"]["sample"]["analysisRows"] = 3
    elif invalid == "references":
        value["references"][0]["title"] = "line one\nline two"
    else:
        value["version"] = 2
    with pytest.raises(ApiError):
        report_content(value)
