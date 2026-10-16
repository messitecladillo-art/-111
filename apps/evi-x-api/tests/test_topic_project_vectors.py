"""The browser and API accept/reject the same versioned reference documents."""
import json
from pathlib import Path

import pytest
from evix_api.contracts import ApiError
from evix_api.topic_projects import topic_document

VECTORS = json.loads((Path(__file__).parents[3] / "packages/evi-x-shared/fixtures/topic-project-v1.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", VECTORS["cases"], ids=lambda case: case["id"])
def test_same_topic_document_vectors(case):
    original = json.loads(json.dumps(case["document"], ensure_ascii=False))
    if case["valid"]:
        assert topic_document(case["document"]) == original
    else:
        with pytest.raises(ApiError):
            topic_document(case["document"])
    assert case["document"] == original
