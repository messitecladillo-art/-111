"""Unit and HTTP contract tests for Wave 8 Dual-Track Cover Production Engine (`cover_assembly.py` & `/api/reports/cover-assemble`)."""
from __future__ import annotations

import base64
import io
from pathlib import Path
import re
from xml.etree import ElementTree as ET

from fastapi.testclient import TestClient
from PIL import Image
import pytest

from evix_api.app import create_app
from multi_agent.agents.writing_agent.services.cover_assembly import (
    CLEAN_BACKDROP_PRESET_IDS,
    COVER_HEIGHT,
    COVER_PIPELINE_MODES,
    COVER_TYPOGRAPHY_STYLES,
    COVER_WIDTH,
    analyze_reference_cover,
    assemble_cover_from_layers,
    build_clean_backdrop_prompt,
    generate_vector_art_typography_svg,
    rasterize_vector_typography_svg,
)
from multi_agent.agents.writing_agent.services.page_art import cover_image_bytes
from multi_agent.agents.writing_agent.services.report_visuals import validate_report_visuals
from shared.errors import ApiError

CANDIDATES_DIR = Path(__file__).resolve().parents[2] / "frontend" / "public" / "art" / "candidates"


def _synthetic_png_bytes(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), rgb).save(buf, format="PNG")
    return buf.getvalue()


def test_clean_backdrop_prompt_enforces_zero_text_and_upper_breathing_zones():
    assert COVER_PIPELINE_MODES == ("direct_illustrated", "layered_assembly")
    assert COVER_TYPOGRAPHY_STYLES == (
        "sculpted_orbit",
        "cinnabar_vertical",
        "xuan_calligraphy",
        "staggered_poster",
        "editorial_serif",
        "modern_geometric",
    )

    prompt_h = build_clean_backdrop_prompt(
        topic="北京大学银发「智」守市场调查与统计分析报告",
        typography_style="sculpted_orbit",
    )
    assert "44%" in prompt_h
    for token in ("零汉字", "零字母", "零数字", "零印章"):
        assert token in prompt_h
    assert "北京大学" not in prompt_h
    assert "市场调查与统计分析报告" not in prompt_h

    prompt_v = build_clean_backdrop_prompt(
        topic="银发「智」守：城市老年人智能健康监测调查",
        typography_style="cinnabar_vertical",
    )
    assert "58%" in prompt_v

    with pytest.raises(ApiError):
        build_clean_backdrop_prompt(topic="测试", typography_style="unknown_style")


def test_analyze_reference_cover_detects_orientation_zones_and_ink_mode():
    ref_f = (CANDIDATES_DIR / "cover-cand-f.png").read_bytes()
    analysis_f = analyze_reference_cover(ref_f)
    assert analysis_f["canvasWidth"] == COVER_WIDTH and analysis_f["canvasHeight"] == COVER_HEIGHT
    assert analysis_f["titleDirection"] == "horizontal"
    assert analysis_f["inkMode"] == "dark_on_light"
    assert analysis_f["breathingZoneRatio"] == 0.44
    for zone_name in ("headerZone", "titleZone", "subtitleZone", "teamPlaqueZone"):
        zone = analysis_f[zone_name]
        assert set(zone) == {"x", "y", "width", "height"}
        assert zone["width"] > 0 and zone["height"] > 0

    ref_c = (CANDIDATES_DIR / "cover-cand-c.png").read_bytes()
    analysis_c = analyze_reference_cover(ref_c)
    assert analysis_c["titleDirection"] == "vertical"
    assert analysis_c["recommendedStyle"] == "cinnabar_vertical"
    assert analysis_c["inkMode"] == "dark_on_light"
    assert analysis_c["breathingZoneRatio"] == 0.58

    dark_png = _synthetic_png_bytes(1000, 1414, (14, 24, 42))
    analysis_dark = analyze_reference_cover(dark_png)
    assert analysis_dark["inkMode"] == "light_on_dark"


@pytest.mark.parametrize("style", COVER_TYPOGRAPHY_STYLES)
def test_vector_typography_svg_emits_true_cubic_bezier_paths_transparent_canvas_and_three_elements(style):
    svg = generate_vector_art_typography_svg(
        title="银发「智」守：城市老年人智能健康监测设备采纳意愿与家庭代际数字反哺机制调查",
        subtitle="基于多阶段分层抽样与社区实地入户调查的实证研究",
        competition_name="“正大杯”第十七届全国大学生市场调查与分析大赛",
        team_name="清华大学李华市场调查与统计分析报告调研队",
        typography_style=style,
    )
    root = ET.fromstring(svg)
    assert root.attrib.get("viewBox") == "0 0 1000 1414"
    assert root.attrib.get("fill") == "none"

    # Strictly zero full-canvas background <rect>
    for elem in root.iter():
        if elem.tag.split("}")[-1] == "rect":
            w = float(elem.attrib.get("width", "0"))
            h = float(elem.attrib.get("height", "0"))
            assert not (w >= 950 and h >= 1350), "Transparent vector typography layer must never contain a full-canvas background rect"

    # Mandatory 3 text elements + blind-review & 17th-edition auto-correction
    assert "“益普索杯”第十七届全国大学生市场调查与分析大赛" in svg
    assert "正大杯" not in svg
    assert "清华大学" not in svg
    assert "市场调查与统计分析报告" not in svg
    assert "参赛团队：" in svg
    assert "城市老年人智能健康监测设备采纳意愿与" in svg

    # Verify hero characters are rendered as genuine cubic Bézier `<path d="M ... C ... Z"/>` curves when system fonts are present
    bezier_glyph_paths = re.findall(r'<path\s+d="(M [^"]*C [^"]*Z)"[^>]*data-glyph="([^"]+)"', svg)
    assert len(bezier_glyph_paths) >= 4
    assert 'data-role="highlight-glyph"' in svg

    # Verify transparent RGBA rasterization keeps background alpha == 0
    rgba_layer = rasterize_vector_typography_svg(svg, scale=1)
    assert rgba_layer.size == (1000, 1414)
    assert rgba_layer.getpixel((12, 12))[3] == 0
    assert rgba_layer.getpixel((500, 900))[3] == 0


def test_vector_typography_graceful_text_fallback_when_fonts_unavailable():
    svg_fallback = generate_vector_art_typography_svg(
        title="银发「智」守：健康监测调查",
        typography_style="sculpted_orbit",
        force_text_fallback=True,
    )
    root = ET.fromstring(svg_fallback)
    assert root.attrib.get("viewBox") == "0 0 1000 1414"
    assert 'data-glyph="智"' in svg_fallback
    assert "“益普索杯”第十七届全国大学生市场调查与分析大赛" in svg_fallback


def test_cover_assemble_endpoint_and_layer_compositor_for_presets_and_custom_base64(settings):
    backdrop_f = (CANDIDATES_DIR / "backdrop-cand-f.png").read_bytes()
    assembled_raw = assemble_cover_from_layers(
        backdrop_f,
        spec={
            "title": "银发「智」守：城市老年人智能健康监测设备采纳意愿与家庭代际数字反哺机制调查",
            "typographyStyle": "sculpted_orbit",
        },
    )
    assert len(assembled_raw) <= 1_000_000
    with Image.open(io.BytesIO(assembled_raw)) as im:
        assert im.size == (1000, 1414)

    assert CLEAN_BACKDROP_PRESET_IDS == ("f", "e", "c", "b", "d", "a")

    with TestClient(create_app(settings)) as client:
        for preset_id, expected_style, expected_dir, expected_ink in (
            ("f", "sculpted_orbit", "horizontal", "dark_on_light"),
            ("e", "staggered_poster", "staggered", "dark_on_light"),
            ("c", "cinnabar_vertical", "vertical", "dark_on_light"),
            ("b", "sculpted_orbit", "horizontal", "dark_on_light"),
            ("d", "staggered_poster", "staggered", "light_on_dark"),
            ("a", "xuan_calligraphy", "horizontal", "dark_on_light"),
        ):
            res = client.post("/api/reports/cover-assemble", json={
                "referencePreset": preset_id,
                "backdropPreset": preset_id,
                "title": "银发「智」守：城市老年人智能健康监测设备采纳意愿与家庭代际数字反哺机制调查",
                "subtitle": "基于多阶段分层抽样的实证研究",
                "teamName": "银发智守调研队",
            })
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["ok"] is True
            assert body["mode"] == "layered_assembly"
            assert body["typographyStyle"] == expected_style
            assert body["referenceAnalysis"]["titleDirection"] == expected_dir
            assert body["referenceAnalysis"]["inkMode"] == expected_ink
            assert body["width"] == 1000 and body["height"] == 1414
            assert body["vectorTypographyDataUrl"].startswith("data:image/svg+xml;base64,")
            assert body["assembledDataUrl"].startswith("data:image/png;base64,")
            assert '<path d="M ' in body["vectorTypographySvg"]

            if preset_id == "d":
                assert 'data-ink-mode="light_on_dark"' in body["vectorTypographySvg"]
                assert "#FAF0D7" in body["vectorTypographySvg"] and "#14233C" in body["vectorTypographySvg"]
            elif preset_id == "b":
                assert "#F07142" in body["vectorTypographySvg"]
            elif preset_id == "e":
                assert "#B8884A" in body["vectorTypographySvg"]
            elif preset_id == "a":
                assert "#D4783E" in body["vectorTypographySvg"]

            raw_png = cover_image_bytes(body["coverImage"])
            assert len(raw_png) == body["byteLength"] <= 1_000_000
            validate_report_visuals({
                "version": 3,
                "coverImage": body["coverImage"],
                "figurePalette": body["figurePalette"],
            })

        # Custom dark base64 backdrop + reference auto-switches inkMode to light_on_dark
        custom_dark_b64 = base64.b64encode(_synthetic_png_bytes(1000, 1414, (16, 28, 48))).decode("ascii")
        res_custom = client.post("/api/reports/cover-assemble", json={
            "referenceBase64": f"data:image/png;base64,{custom_dark_b64}",
            "backdropBase64": custom_dark_b64,
            "title": "数智民生：县域即时零售履约机制调查",
            "typographyStyle": "staggered_poster",
        })
        assert res_custom.status_code == 200, res_custom.text
        custom_body = res_custom.json()
        assert custom_body["referenceAnalysis"]["inkMode"] == "light_on_dark"
        assert 'data-ink-mode="light_on_dark"' in custom_body["vectorTypographySvg"]
        assert cover_image_bytes(custom_body["coverImage"]).startswith(b"\x89PNG\r\n\x1a\n")

        # Security guards: cross-site CSRF & path traversal rejection
        csrf = client.post(
            "/api/reports/cover-assemble",
            json={"referencePreset": "f"},
            headers={"sec-fetch-site": "cross-site"},
        )
        assert csrf.status_code == 403

        traversal = client.post("/api/reports/cover-assemble", json={"referencePreset": "../../etc/passwd"})
        assert traversal.status_code == 422

        # V3 open-art-direction covers + editorial_serif / modern_geometric typography + pocket detector
        cand_dir = Path(__file__).resolve().parents[2] / "frontend" / "public" / "art" / "candidates"
        for filename, expected_ink, style_override in (
            ("cover-v3-3.png", "light_on_dark", "editorial_serif"),
            ("cover-v3-4.png", "dark_on_light", "modern_geometric"),
        ):
            v3_bytes = (cand_dir / filename).read_bytes()
            ref_info = analyze_reference_cover(v3_bytes)
            assert ref_info["inkMode"] == expected_ink, filename
            assert ref_info["readingPocket"]["name"]
            assert ref_info["extractedPalette"]["primaryHex"].startswith("#")
            assert ref_info["extractedPalette"]["accentHex"].startswith("#")

            v3_b64 = base64.b64encode(v3_bytes).decode("ascii")
            res_v3 = client.post("/api/reports/cover-assemble", json={
                "referenceBase64": f"data:image/png;base64,{v3_b64}",
                "backdropBase64": v3_b64,
                "title": "低空智航：县域无人机物流配送意愿与服务半径调查",
                "subtitle": "基于多阶段分层抽样与空间可及性模型的实证分析",
                "typographyStyle": style_override,
            })
            assert res_v3.status_code == 200, res_v3.text
            v3_body = res_v3.json()
            assert v3_body["typographyStyle"] == style_override
            assert f'data-typography-style="{style_override}"' in v3_body["vectorTypographySvg"]
            assert '<path d="M ' in v3_body["vectorTypographySvg"]
            assert v3_body["width"] == 1000 and v3_body["height"] == 1414
            assert len(cover_image_bytes(v3_body["coverImage"])) <= 960_000
