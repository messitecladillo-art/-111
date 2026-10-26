"""C2 regression: actual frontend frames, strict persistence and real vector PDF.

The approval actor below denotes automated software QA, never human approval.
"""
import base64
import copy
import io
import os

import pytest

from multi_agent.agents.writing_agent.tools import latex
from shared.errors import ApiError
from multi_agent.agents.writing_agent.services.reports import report_content
from .test_report_visuals import node


@pytest.fixture(scope="module")
def frame_cases():
    return node(r"""
import {createEditorContent,parseEditorContent,applyReportFrame} from './lib/editor-model.ts';
import {createReportFrame,approveReportFrame} from './lib/report-frame.ts';
import {bindReportSlide,reportLinkState} from './lib/report-storyboard.ts';
import {buildLatexSource} from './lib/latex-report.ts';
const options={part:'main',includeCover:false,includeToc:false,firstLineChars:2,numberPages:true};
const body='\\section{软件合成排版验收}\n'+Array.from({length:16},(_,i)=>`第 ${i+1} 段。本文仅用于排版软件验收，未开展实际调查。比较加框前后的文字位置与页数，边角装饰应位于版心之外，不改变段落、图题和页码的位置。\\par`).join('\n')+'\n'+String.raw`\begin{table}[htbp]
\centering
\caption{合成排版数据}
\begin{tabular}{ccc}
\toprule[1.5bp]
类别 & 数量 & 说明 \\
\midrule[0.75bp]
甲 & 12 & 排版示例 \\
乙 & 18 & 排版示例 \\
\bottomrule[1.5bp]
\end{tabular}
\end{table}`;
const cases=[];
for(const [paletteId,theme] of [['blue','finance-grid'],['forest','sports-track']]){
 const visualStyle={schema:'ProjectVisualStyle/v1',paletteId,version:1};
 const c={...createEditorContent(),version:2},section=c.report[0];
 c.slides=[await bindReportSlide(c,c.slides[0],section.id)];
 const before=c.slides[0].reportLink.sectionHash;
 const frame=await approveReportFrame(createReportFrame(visualStyle,theme),'automated-test-actor');
 const applied=await applyReportFrame({...c,version:3,visualStyle},frame);
 const input={title:'合成页框验收',subtitle:'软件验收，不代表真实研究',body,options,visualStyle,frame};
 cases.push({content:parseEditorContent(applied),input,source:buildLatexSource(input),plainSource:buildLatexSource({...input,frame:undefined}),before,after:applied.slides[0].reportLink.sectionHash,state:await reportLinkState(applied,applied.slides[0])});
}
process.stdout.write(JSON.stringify(cases));
""")


def test_two_topics_preserve_c1_links_and_have_identical_cross_language_source(frame_cases):
    for case in frame_cases:
        c = copy.deepcopy(case["content"])
        assert report_content(c) == c
        assert c["slides"][0]["reportLink"]["version"] == 2
        assert case["before"] == case["after"] and case["state"] == "current"
        value = case["input"]
        assert latex.build_source(value["title"], value["subtitle"], value["body"], value["options"], value["frame"], None, value["visualStyle"]) == case["source"]
        assert latex.build_source(value["title"], value["subtitle"], value["body"], value["options"]) == case["plainSource"]
        assert r"\usepackage[top=25.4mm,bottom=25.4mm,left=31.8mm,right=31.8mm]{geometry}" in case["source"]


def test_formal_frame_rejects_draft_tampering_and_stale_palette(frame_cases):
    value = frame_cases[0]["input"]
    draft = copy.deepcopy(value["frame"])
    draft.update(status="vector_draft", review=None)
    mutated = copy.deepcopy(value["frame"])
    mutated["strength"] = 0.5
    for frame, visual in [(draft, value["visualStyle"]), (mutated, value["visualStyle"]), (value["frame"], {**value["visualStyle"], "version": 2})]:
        with pytest.raises(ApiError):
            latex.build_source(value["title"], value["subtitle"], value["body"], value["options"], frame, None, visual)


def test_real_xelatex_frame_is_vector_and_keeps_body_positions(settings, frame_cases):
    executable = os.getenv("EVIX_TEST_LATEX_COMPILER")
    if not executable:
        pytest.skip("Explicit local XeLaTeX executable required for real C2 PDF comparison")
    from pypdf import PdfReader
    settings.latex_compiler = executable
    compiler = latex.LatexCompiler(settings)
    value = frame_cases[0]["input"]
    receipts = [compiler.compile(value["title"], value["subtitle"], value["body"], value["options"], frame, None, value["visualStyle"]) for frame in (None, value["frame"])]
    for receipt in receipts:
        assert receipt["status"] == "compiled", receipt["diagnostics"]
        assert not receipt["diagnostics"], receipt["diagnostics"]
    readers = [PdfReader(io.BytesIO(base64.b64decode(r["pdfBase64"]))) for r in receipts]
    assert len(readers[0].pages) == len(readers[1].pages) >= 2
    paths = []
    for reader in readers:
        count = 0
        for page in reader.pages:
            assert abs(float(page.mediabox.width) - 595.276) < 0.1
            assert abs(float(page.mediabox.height) - 841.89) < 0.1
            for obj in page["/Resources"].get("/XObject", {}).values():
                assert obj.get_object().get("/Subtype") != "/Image"
            count += sum(op in (b"m", b"l", b"c", b"re") for _, op in page.get_contents().operations)
        paths.append(count)
    assert paths[1] > paths[0], "Formal decoration must add vector drawing operations"
    for plain, framed in zip(readers[0].pages, readers[1].pages, strict=True):
        positions = []
        for page in (plain, framed):
            runs = []
            def visit(text, cm, tm, font, size):
                if text.strip():
                    # pypdf infers trailing newlines from intervening graphics;
                    # preserve actual text and both position matrices instead.
                    runs.append((text.rstrip("\n"), *(round(float(v), 3) for v in (*cm, *tm)), round(float(size), 3)))
            page.extract_text(visitor_text=visit)
            positions.append(runs)
        assert positions[0] == positions[1], "Decorative background changed body text or placement"
