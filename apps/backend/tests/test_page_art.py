import base64
import json
from pathlib import Path
import subprocess

import pytest

from multi_agent.agents.writing_agent.services.page_art import (
    COVER_CANDIDATE_SPEC_POOL,
    DEFAULT_COVER_COMPETITION_NAME,
    DEFAULT_PREFERRED_COVER_CANDIDATE_ID,
    FRAME_CLEAR_ZONES_MM,
    FRAME_OUTER_BAND_SPEC,
    MAX_PAGE_ART_BYTES,
    MAX_SECTION_ILLUSTRATIONS,
    build_clean_backdrop_prompt,
    build_cover_typography_prompt,
    build_frame_perimeter_prompt,
    cover_image_bytes,
    derive_blind_safe_team_name,
    frame_image_bytes,
    image_size,
    normalize_cover_text_spec,
    retract_frame_rgba_crisply,
    section_illustration_bytes,
)
from multi_agent.agents.writing_agent.services.report_visuals import validate_report_visuals
from multi_agent.agents.writing_agent.services import reports as report_domain
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


def test_a_figure_palette_is_three_upper_case_hex_colours_of_a_version_three_draft():
    palette = {"schema": "FigurePalette/v1", "primary": "#293652", "secondary": "#C39045", "opposite": "#A65A3A", "source": "cover"}
    validate_report_visuals({"version": 3, "figurePalette": palette})
    for bad in ({**palette, "primary": "#293652;"}, {**palette, "primary": "#29365c"}, {**palette, "source": "ai"}, {**palette, "extra": 1}):
        with pytest.raises(ApiError):
            validate_report_visuals({"version": 3, "figurePalette": bad})
    with pytest.raises(ApiError):
        validate_report_visuals({"version": 2, "figurePalette": palette})


def illustration(raw=None, mime="image/png", width=1280, height=720, **changes):
    raw = png(width, height) if raw is None else raw
    value = {
        "schema": "SectionIllustration/v1",
        "id": "ill-1",
        "resultId": "res-1",
        "mime": mime,
        "data": base64.b64encode(raw).decode(),
        "widthPx": width,
        "heightPx": height,
        "note": "AI 生成课题总体特征图（gpt-image-1）",
    }
    value.update(changes)
    return value


def test_section_illustrations_validate_bounds_result_references_and_sit_outside_text_cap():
    assert MAX_SECTION_ILLUSTRATIONS == 12
    assert MAX_PAGE_ART_BYTES == 12_000_000
    assert report_domain.MAX_PAGE_ART_BYTES == 12_000_000
    assert "illustrations" in report_domain.PAGE_ART_KEYS
    assert section_illustration_bytes(illustration()).startswith(b"\x89PNG")
    assert section_illustration_bytes(illustration(raw=jpeg(1536, 1024), mime="image/jpeg", width=1536, height=1024)).startswith(b"\xff\xd8")

    for bad in (
        illustration(widthPx=1281),
        illustration(raw=png(319, 720), width=319, height=720),
        illustration(raw=png(2401, 720), width=2401, height=720),
        illustration(raw=png(1280, 199), width=1280, height=199),
        illustration(raw=png(1280, 1801), width=1280, height=1801),
        illustration(raw=png(1280, 720) + b"\x00" * 650_000),
        illustration(id=" "),
        illustration(resultId=""),
        illustration(note="换行\n说明"),
        {**illustration(), "extra": 1},
    ):
        with pytest.raises(ApiError):
            section_illustration_bytes(bad)

    results = [{"id": f"res-{i}", "title": "总体特征", "sourceName": "实证调研数据", "sourceUrl": "", "sourceHash": "a" * 64,
                "resultHash": "b" * 64, "classification": "user_provided", "method": "infographic", "n": 500, "total": 500,
                "headers": ["指标", "数值"], "rows": [["样本", 500]], "metrics": [], "warnings": []} for i in range(1, 14)]
    draft = {
        "version": 3, "title": "总体特征插画验收", "subtitle": "V3 草稿", "accent": "teal",
        "quality": {"version": 1, "results": results, "findings": []},
        "report": [{"id": "s1", "title": "一、绪论", "body": "正文。" * 200, "source": ""}],
        "slides": [{"id": "p1", "title": "封面", "body": "摘要", "aside": "", "notes": "", "layout": "cover"}],
        "illustrations": [
            illustration(id=f"ill-{i}", resultId=f"res-{i}", raw=png(1280, 720) + b"\x00" * 400_000)
            for i in range(1, 13)
        ],
    }
    # 12 * ~533 KB base64 (~6.4 MB) sits outside the 2 MB text cap and passes report_content cleanly.
    assert report_domain.report_content(draft) == draft

    for invalid_draft in (
        {**draft, "version": 2},
        {**draft, "illustrations": [illustration(resultId="missing-result")]},
        {**draft, "illustrations": [illustration(id="dup", resultId="res-1"), illustration(id="dup", resultId="res-2")]},
        {**draft, "illustrations": [illustration(id="ill-a", resultId="res-1"), illustration(id="ill-b", resultId="res-1")]},
        {**draft, "illustrations": [illustration(id=f"ill-{i}", resultId=f"res-{i}") for i in range(1, 14)]},
    ):
        with pytest.raises(ApiError):
            report_domain.report_content(invalid_draft)

    png_ill = illustration(width=1280, height=720)
    assert len(latex.checked_images([{"mime": png_ill["mime"], "data": png_ill["data"], "widthPx": png_ill["widthPx"], "heightPx": png_ill["heightPx"]}])) == 1


def test_cover_typography_spec_enforces_three_elements_calligraphy_and_blind_review():
    assert DEFAULT_COVER_COMPETITION_NAME == "“益普索杯”第十七届全国大学生市场调查与分析大赛"
    assert DEFAULT_PREFERRED_COVER_CANDIDATE_ID == "cover-cand-f"
    assert [item["id"] for item in COVER_CANDIDATE_SPEC_POOL] == [
        "cover-cand-f",
        "cover-cand-a",
        "cover-cand-b",
        "cover-cand-c",
        "cover-cand-d",
        "cover-cand-e",
    ]
    assert COVER_CANDIDATE_SPEC_POOL[0]["isDefaultPreferred"] is True

    spec = normalize_cover_text_spec({
        "title": "银发「智」守：城市老年人智能健康监测设备采纳意愿与家庭代际数字反哺机制调查",
        "subtitle": "基于多阶段分层抽样与社区实地入户调查的实证研究",
    })
    assert spec["competitionName"] == "“益普索杯”第十七届全国大学生市场调查与分析大赛"
    assert spec["teamName"] == "银发智守调研队"
    assert spec["teamLabel"] == "参赛团队：银发智守调研队"
    assert spec["titleLayout"] == "horizontal"

    # Legacy 17th-edition strings automatically correct to 益普索杯
    legacy_17th = normalize_cover_text_spec({
        "title": "银发智守",
        "competitionName": "“正大杯”第十七届全国大学生市场调查与分析大赛",
    })
    assert legacy_17th["competitionName"] == "“益普索杯”第十七届全国大学生市场调查与分析大赛"

    prompt_h = build_cover_typography_prompt({
        "title": spec["mainTitle"],
        "subtitle": spec["subtitle"],
        "titleLayout": "horizontal",
    })
    assert "“益普索杯”第十七届全国大学生市场调查与分析大赛" in prompt_h
    assert "横排或阶梯错落非板正艺术字" in prompt_h
    assert "严禁使用死板机械的电脑印刷黑体或印刷宋体" in prompt_h
    assert "参赛团队：银发智守调研队" in prompt_h
    assert "市场调查与统计分析报告" not in prompt_h

    prompt_dark = build_cover_typography_prompt(
        {"title": spec["mainTitle"], "subtitle": spec["subtitle"]},
        ink_mode="light_on_dark",
    )
    assert "亮暖金/象牙白高反差字色" in prompt_dark

    prompt_v = build_cover_typography_prompt({
        "title": spec["mainTitle"],
        "subtitle": spec["subtitle"],
        "competitionName": "“正大杯”第十六届全国大学生市场调查与分析大赛",
        "teamName": "北京大学张三测试调研队",
        "titleLayout": "vertical",
    })
    assert "“正大杯”第十六届全国大学生市场调查与分析大赛" in prompt_v
    assert "竖排非板正艺术字" in prompt_v
    assert "北京大学" not in prompt_v and "测试" not in prompt_v
    assert "参赛团队：" in prompt_v

    backdrop_dark = build_clean_backdrop_prompt(
        topic="城市夜经济消费活力调查",
        typography_style="staggered_poster",
        ink_mode="light_on_dark",
        art_direction="深夜霓虹街景微缩电影级质感",
    )
    assert "深色呼吸负空间" in backdrop_dark
    assert "深夜霓虹街景微缩电影级质感" in backdrop_dark
    assert "strictly zero Chinese characters" in backdrop_dark
    assert "老花镜" not in backdrop_dark

    # Bare 2-3 char personal name is never echoed onto cover; falls back to topic team name
    safe_spec = normalize_cover_text_spec({"title": "银发「智」守：健康监测调查", "teamName": "王小明"})
    assert safe_spec["teamName"] == derive_blind_safe_team_name("银发「智」守：健康监测调查") == "银发智守调研队"

    with pytest.raises(ApiError):
        normalize_cover_text_spec({"title": "题目", "titleLayout": "diagonal"})


def test_frame_perimeter_prompt_and_crisp_retraction_avoid_feather_blur_bite():
    assert FRAME_OUTER_BAND_SPEC["minRatio"] == 0.04
    assert FRAME_OUTER_BAND_SPEC["maxRatio"] == 0.06
    assert FRAME_OUTER_BAND_SPEC["minClearCoreRatio"] == 0.88
    assert FRAME_OUTER_BAND_SPEC["allowFeatherBlurMask"] is False

    frame_prompt = build_frame_perimeter_prompt("银发智能健康监测", "#0F766E")
    assert "4%–6%" in frame_prompt and "88%×88%" in frame_prompt
    assert "严禁任何边缘羽化虚化" in frame_prompt

    # Case 1: Crisp corner motif already within outer 5% strip stays 100% alpha=255 (zero feather-blur bite!)
    w, h = 210, 297
    clean_buf = bytearray(b"\xff\xff\xff\xff" * (w * h))
    for y in range(6, 12):
        for x in range(6, 12):
            idx = (y * w + x) * 4
            clean_buf[idx:idx + 4] = bytes((15, 118, 110, 255))
    out_clean = retract_frame_rgba_crisply(clean_buf, w, h)
    for y in range(6, 12):
        for x in range(6, 12):
            assert out_clean[(y * w + x) * 4 + 3] == 255, "Corner fretwork pixels must remain 100% crisp without feather blur"
    assert out_clean[(150 * w + 105) * 4 + 3] == 0, "White paper background is keyed to alpha=0"

    # Case 2: Intruding solid stroke at x=35mm is proportionally retracted into outer strip with zero semi-transparent blur
    intrude_buf = bytearray(b"\xff\xff\xff\xff" * (w * h))
    for y in range(10, 40):
        for x in range(8, 36):
            idx = (y * w + x) * 4
            intrude_buf[idx:idx + 4] = bytes((35, 78, 128, 255))
    out_retracted = retract_frame_rgba_crisply(intrude_buf, w, h)
    for zone in FRAME_CLEAR_ZONES_MM:
        for y in range(int(zone["y0"]), int(zone["y1"])):
            for x in range(int(zone["x0"]), int(zone["x1"])):
                assert out_retracted[(y * w + x) * 4 + 3] == 0
    semi_transparent = [
        out_retracted[i + 3]
        for i in range(0, len(out_retracted), 4)
        if 0 < out_retracted[i + 3] < 255
    ]
    assert semi_transparent == [], "Proportional retraction must introduce zero blurry semi-transparent feather pixels"
