import base64
import json
from pathlib import Path
import subprocess

import pytest

from multi_agent.agents.writing_agent.tools import latex
from shared.errors import ApiError

OPTIONS = {"part": "main", "includeCover": False, "includeToc": False, "firstLineChars": 2, "numberPages": True}
BODY = "\\section{结果}\n\\begin{figure}[htbp]\n\\centering\n\\ResearchImage{0}\n\\caption{方法图}\n\\end{figure}\n正文 \\(\\chi^2(10)=908.51\\)，\\(p<0.001\\)。\\par"


def png(width, height, pad=0):
    raw = b"\x89PNG\r\n\x1a\n" + (13).to_bytes(4, "big") + b"IHDR" + width.to_bytes(4, "big") + height.to_bytes(4, "big") + b"\x08\x02\x00\x00\x00" + b"\x00" * pad
    return {"mime": "image/png", "data": base64.b64encode(raw).decode(), "widthPx": width, "heightPx": height}


def test_images_are_pngs_that_state_their_size():
    assert len(latex.checked_images([png(1600, 960)])) == 1
    for bad in ([], [png(1600, 960)] * 25, [{**png(1600, 960), "widthPx": 1601}], [{**png(1600, 960), "mime": "image/jpeg"}],
                [{**png(1600, 960), "extra": 1}], [png(100, 960)], [png(1600, 960, 700_001)]):
        with pytest.raises(ApiError):
            latex.checked_images(bad)


def test_the_body_may_embed_only_the_images_it_was_given():
    latex.validate_body(BODY, 0, 1)
    with pytest.raises(latex.UnsafeBody):
        latex.validate_body(BODY, 0, 0)
    with pytest.raises(latex.UnsafeBody):
        latex.validate_body(BODY.replace("ResearchImage{0}", "ResearchImage{x}"), 0, 1)


def test_bars_may_be_pinned_to_zero_and_nothing_else():
    axis = "\\begin{figure}[htbp]\n\\centering\n\\definecolor{ResearchAccent}{HTML}{0F766E}\n\\begin{tikzpicture}\n\\begin{axis}[width=13cm,height=8cm,ybar,bar width=12pt,xtick={0,1},xticklabels={{甲},{乙}},x tick label style={rotate=35,anchor=east},ylabel={人数},enlarge x limits=0.12,nodes near coords,point meta=explicit symbolic%s]\n\\addplot[fill=ResearchAccent,draw=ResearchAccent] coordinates {(0,3) [3] (1,5) [5]};\n\\end{axis}\n\\end{tikzpicture}\n\\caption{x}\n\\end{figure}"
    for base in ("", ",ymin=0", ",ymax=0"):
        latex.validate_body(axis % base)
    with pytest.raises(latex.UnsafeBody):
        latex.validate_body(axis % ",ymin=40")


def test_image_source_is_byte_identical_with_the_frontend():
    platform = Path(__file__).resolve().parents[2] / "frontend"
    script = ("import {buildLatexSource} from './lib/latex-report.ts';let t='';for await(const c of process.stdin)t+=c;"
              "process.stdout.write(JSON.stringify(JSON.parse(t).map(input=>buildLatexSource(input))));")
    cases = [{"title": "题目", "subtitle": "", "body": BODY, "options": OPTIONS, "images": [png(1600, 960)]}]
    process = subprocess.run(["node", "--experimental-strip-types", "--input-type=module", "-e", script], cwd=platform,
                             input=json.dumps(cases, ensure_ascii=False), capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert process.returncode == 0, process.stderr
    for case, source in zip(cases, json.loads(process.stdout)):
        assert latex.build_source(case["title"], case["subtitle"], case["body"], case["options"], images=case["images"]) == source
        assert all(line in source for line in latex.IMAGE_PREAMBLE)


def test_the_compiler_writes_each_image_beside_the_source(settings, tmp_path, monkeypatch):
    executable = tmp_path / "xelatex.exe"; executable.write_bytes(b"synthetic-placeholder")
    settings.latex_compiler = str(executable)
    seen = []
    def fake_run(exe, folder, deadline):
        seen.append(sorted(p.name for p in folder.iterdir()))
        (folder / "document.pdf").write_bytes(b"%PDF-synthetic-fixture")
        return 0, ""
    monkeypatch.setattr(latex, "run_pass", fake_run)
    result = latex.LatexCompiler(settings).compile("题目", "", BODY, OPTIONS, images=[png(1600, 960)])
    assert result["status"] == "compiled" and "exhibit-0.png" in seen[0]
    unsafe = latex.LatexCompiler(settings).compile("题目", "", BODY, OPTIONS)
    assert unsafe["status"] == "error", "an image reference without its image never reaches the compiler"
