import copy
import hashlib
import json
from pathlib import Path

import pytest

from shared.errors import ApiError
from multi_agent.agents.writing_agent.services.cover_art import checked_cover_art
from multi_agent.agents.writing_agent.tools import latex

ART = json.loads((Path(__file__).parent / "fixtures" / "cover_art_flowing_lines.json").read_text(encoding="utf-8"))
OPTIONS = {"part": "main", "includeCover": True, "includeToc": True, "firstLineChars": 2, "numberPages": True}


def test_cover_ornament_source_matches_the_frontend_byte_for_byte():
    source = latex.build_source("社区助餐服务调查", "教学模拟数据", "正文。", OPTIONS, None, None, None, ART)
    # Frozen from the frontend's buildLatexSource on the same input (tests/cover-art.test.mjs).
    assert hashlib.sha256(source.encode("utf-8")).hexdigest() == "1023a0f8fbe3b3648b07e148ad6dbffc0e63922606b7264610c1318e6f6e550d"
    assert "tikzpicture" not in latex.build_source("社区助餐服务调查", "", "正文。", {**OPTIONS, "includeCover": False}, None, None, None, ART)


@pytest.mark.parametrize("change", [
    lambda a: a["strokes"][0].update(points=[[10, 100], [20, 100]]),
    lambda a: a["strokes"][0].update(points=[[10, 60], [20, 200]]),
    lambda a: a["strokes"][0].update(points=[[10.123, 20], [20, 20]]),
    lambda a: a["strokes"][0].update(color="red"),
    lambda a: a.update(svg="<svg/>"),
])
def test_cover_ornament_outside_its_bounds_is_refused(change):
    art = copy.deepcopy(ART)
    change(art)
    with pytest.raises(ApiError):
        checked_cover_art(art)
