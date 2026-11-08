import base64
import json
from pathlib import Path
import subprocess

import pytest

from multi_agent.agents.writing_agent.services.page_art import cover_image_bytes, frame_image_bytes, image_size
from multi_agent.agents.writing_agent.services.report_visuals import validate_report_visuals
from multi_agent.agents.writing_agent.tools import latex
from shared.errors import ApiError

OPTIONS = {"part": "main", "includeCover": True, "includeToc": True, "firstLineChars": 2, "numberPages": True}
BODY = r"\section{合成验收}" + "\n" + "正文。\\par"


def png(width, height):
    return b"\x89PNG\r\n\x1a\n" + (13).to_bytes(4, "big") + b"IHDR" + width.to_bytes(4, "big") + height.to_bytes(4, "big") + b"\x08\x02\x00\x00\x00" + b"\x00" * 8


def jpeg(width, height):
    app0 = b"\xff\xe0" + (16).to_bytes(2, "big") + b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    sof = b"\xff\xc0" + (17).to_bytes(2, "big") + b"\x08" + height.to_bytes(2, "big") + width.to_bytes(2, "big") + b"\x03" + b"\x01\x22\x00\x02\x11\x01\x03\x11\x01"
    return b"\xff\xd8" + app0 + sof + b"\xff\xd9"


def frame(**changes):
    value = cover(**changes)
    value.update(schema="FrameImage/v1", note="页框由报告页框技能生成。")
    value.update({k: v for k, v in changes.items() if k in ("schema", "note")})
    return value


def cover(raw=None, mime="image/png", width=1000, height=1414, **changes):
    raw = png(width, height) if raw is None else raw
    value = {"schema": "CoverImage/v1", "mime": mime, "data": base64.b64encode(raw).decode(), "widthPx": width, "heightPx": height, "note": "封面由报告封面技能生成。"}
    value.update(changes)
    return value


def test_size_is_read_from_the_file_header():
    assert image_size(png(1000, 1414), "image/png") == (1000, 1414)
    assert image_size(jpeg(1240, 1754), "image/jpeg") == (1240, 1754)
    assert image_size(png(1000, 1414), "image/jpeg") is None and image_size(jpeg(1, 1), "image/png") is None


@pytest.mark.parametrize("bad", [
    cover(widthPx=1001),
    cover(raw=png(1000, 1000), width=1000, height=1000),
    cover(raw=png(700, 990), width=700, height=990),
    cover(mime="image/gif"),
    cover(data="not base64!"),
    cover(note=""),
    cover(note="换行\n注释"),
    cover(note="长" * 301),
    {**cover(), "extra": 1},
    cover(raw=png(1000, 1414) + b"\x00" * 1_000_000),
    cover(raw=jpeg(1000, 1414), mime="image/png"),
])
def test_a_cover_must_be_an_a4_portrait_image_that_states_its_own_size(bad):
    with pytest.raises(ApiError):
        cover_image_bytes(bad)


def test_a_cover_is_a_version_three_draft_field():
    assert cover_image_bytes(cover(raw=jpeg(1240, 1754), mime="image/jpeg", width=1240, height=1754)).startswith(b"\xff\xd8")
    validate_report_visuals({"version": 3, "coverImage": cover()})
    with pytest.raises(ApiError):
        validate_report_visuals({"version": 2, "coverImage": cover()})
    with pytest.raises(ApiError):
        validate_report_visuals({"version": 3, "coverImage": cover(widthPx=999)})


def test_a_frame_is_a_transparent_png_and_never_sits_beside_a_drawn_frame():
    assert frame_image_bytes(frame()).startswith(b"\x89PNG")
    for bad in (frame(raw=jpeg(1240, 1754), mime="image/jpeg", width=1240, height=1754), cover(), frame(raw=png(1000, 1414) + b"\x00" * 600_000)):
        with pytest.raises(ApiError):
            frame_image_bytes(bad)
    validate_report_visuals({"version": 3, "frameImage": frame()})
    with pytest.raises(ApiError):
        validate_report_visuals({"version": 2, "frameImage": frame()})


def test_the_frame_lies_behind_every_page_after_the_cover():
    source = latex.build_source("题目", "副题", BODY, OPTIONS, cover_image=cover(), frame_image=frame())
    assert source.index(r"\ifReportFrameImage") < source.index(r"\begin{document}")
    assert source.index(r"\end{titlepage}") < source.index(r"\ReportFrameImagetrue") < source.index(r"\tableofcontents")
    assert source.count(r"\usepackage{tikz}") == 1 and "{frame-image.png}" in source


def test_the_cover_page_is_the_image_alone():
    source = latex.build_source("题目", "副题", BODY, OPTIONS, cover_image=cover())
    page = source[source.index(r"\begin{titlepage}"):source.index(r"\end{titlepage}")]
    assert r"\includegraphics[width=\paperwidth,height=\paperheight]{cover-image.png}" in page
    assert "题目" not in page and "副题" not in page and r"\usepackage{tikz}" in source
    plain = latex.build_source("题目", "副题", BODY, {**OPTIONS, "includeCover": False}, cover_image=cover())
    assert "titlepage" not in plain and "tikz" not in plain


def frontend_sources(cases):
    platform = Path(__file__).resolve().parents[2] / "frontend"
    script = ("import {buildLatexSource} from './lib/latex-report.ts';let t='';for await(const c of process.stdin)t+=c;"
              "process.stdout.write(JSON.stringify(JSON.parse(t).map(input=>buildLatexSource(input))));")
    process = subprocess.run(["node", "--experimental-strip-types", "--input-type=module", "-e", script], cwd=platform,
                             input=json.dumps(cases, ensure_ascii=False), capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert process.returncode == 0, process.stderr
    return json.loads(process.stdout)


def test_cover_source_is_byte_identical_with_the_frontend():
    cases = [
        {"title": "题目", "subtitle": "副题", "body": BODY, "options": OPTIONS, "coverImage": cover()},
        {"title": "题目", "subtitle": "", "body": BODY, "options": OPTIONS, "coverImage": cover(raw=jpeg(1240, 1754), mime="image/jpeg", width=1240, height=1754)},
        {"title": "题目", "subtitle": "副题", "body": BODY, "options": {**OPTIONS, "includeCover": False}, "coverImage": cover()},
        {"title": "题目", "subtitle": "副题", "body": BODY, "options": OPTIONS, "coverImage": cover(), "frameImage": frame()},
        {"title": "题目", "subtitle": "副题", "body": BODY, "options": {**OPTIONS, "includeCover": False}, "frameImage": frame()},
    ]
    for case, source in zip(cases, frontend_sources(cases)):
        assert latex.build_source(case["title"], case["subtitle"], case["body"], case["options"], cover_image=case.get("coverImage"), frame_image=case.get("frameImage")) == source


def test_the_compiler_writes_the_cover_next_to_the_source(settings, tmp_path, monkeypatch):
    executable = tmp_path / "xelatex.exe"; executable.write_bytes(b"synthetic-placeholder")
    settings.latex_compiler = str(executable)
    seen = []
    def fake_run(exe, folder, deadline):
        seen.append(sorted(p.name for p in folder.iterdir()))
        (folder / "document.pdf").write_bytes(b"%PDF-synthetic-fixture")
        return 0, ""
    monkeypatch.setattr(latex, "run_pass", fake_run)
    value = cover(raw=jpeg(1240, 1754), mime="image/jpeg", width=1240, height=1754)
    result = latex.LatexCompiler(settings).compile("题目", "", BODY, OPTIONS, cover_image=value, frame_image=frame())
    assert result["status"] == "compiled" and "cover-image.jpg" in seen[0] and "frame-image.png" in seen[0] and "cover-image.jpg}" in result["source"]
    seen.clear()
    latex.LatexCompiler(settings).compile("题目", "", BODY, {**OPTIONS, "includeCover": False}, cover_image=value)
    assert "cover-image.jpg" not in seen[0]
