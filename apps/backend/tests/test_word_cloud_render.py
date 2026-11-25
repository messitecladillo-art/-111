"""Tests for multi-theme word cloud silhouettes, custom maskBase64 Otsu binarization, and HTTP route."""
import base64
import io

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from evix_api.routes.reports import WORDCLOUD_OPTIONAL, register_reports
from multi_agent.agents.writing_agent.services.word_cloud_render import (
    BUILTIN_SHAPES,
    associate_topic_silhouettes,
    render_dense_wordcloud,
)

SAMPLE_FREQS = {
    "智能化服务": 42,
    "物流配送效率": 37,
    "基层治理": 31,
    "消费满意度": 28,
    "安全规范": 24,
    "价格感知": 21,
    "体验品质": 19,
    "文化传承": 17,
    "品牌信任": 15,
    "数字赋能": 14,
    "绿色低碳": 12,
    "便捷度": 10,
}


def test_new_theme_silhouettes_render_clean_pngs_and_topic_association():
    new_shapes = (
        "book_scroll",
        "city_skyline",
        "delivery_box",
        "teacup_leaf",
        "drone_wing",
        "paw_care",
        "museum_arch",
    )
    for shape in new_shapes:
        assert shape in BUILTIN_SHAPES
        out = render_dense_wordcloud({
            "frequencies": SAMPLE_FREQS,
            "shape": shape,
            "maxWords": 80,
            "seed": 7,
        })
        assert out["ok"] is True
        assert out["shape"] == shape
        raw = base64.b64decode(out["data"])
        assert raw.startswith(b"\x89PNG\r\n\x1a\n")
        assert 1000 < len(raw) <= 500_000
        with Image.open(io.BytesIO(raw)) as im:
            assert im.size == (1280, 720)
            # Edges stay clean pure white (zero black outline border artifact)
            assert im.getpixel((0, 0)) == (255, 255, 255)
            assert im.getpixel((1279, 719)) == (255, 255, 255)

    assert associate_topic_silhouettes("低空无人机物流配送调研")[1]["shape"] == "drone_wing"
    assert associate_topic_silhouettes("伴侣宠物医疗与情感消费调研")[0]["shape"] == "paw_care"
    assert associate_topic_silhouettes("县域非遗博物馆数字化展陈调研")[0]["shape"] == "museum_arch"


def test_custom_mask_base64_and_wordcloud_route():
    mask_img = Image.new("RGB", (400, 300), (255, 255, 255))
    draw = ImageDraw.Draw(mask_img)
    draw.polygon([(200, 24), (360, 272), (40, 272)], fill=(15, 23, 42))
    buf = io.BytesIO()
    mask_img.save(buf, format="PNG")
    mask_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    out = render_dense_wordcloud({
        "frequencies": SAMPLE_FREQS,
        "maskBase64": f"data:image/png;base64,{mask_b64}",
        "maxWords": 80,
    })
    assert out["ok"] is True
    assert out["shape"] == "custom_mask"
    assert out["wordCount"] >= 8
    assert "maskBase64" in WORDCLOUD_OPTIONAL and "maskDataUrl" in WORDCLOUD_OPTIONAL

    app = FastAPI()
    register_reports(app, auth=lambda: None, db=lambda: None, owned_project=lambda *a, **k: None, operation=lambda *a, **k: None)
    with TestClient(app) as client:
        res = client.post("/api/reports/wordcloud", json={
            "frequencies": SAMPLE_FREQS,
            "maskBase64": mask_b64,
            "topic": "低空无人机植保调研",
            "maxWords": 60,
        })
        assert res.status_code == 200, res.text
        assert res.json()["shape"] == "custom_mask"
