"""The browser's compile request against the server: the payload the frontend builds (latexCompilePayload) passes the
route's own body parser and field list, the service's checks, and reaches the compiler with every file it includes."""
import json
from pathlib import Path
import subprocess
from types import SimpleNamespace

import pytest

from evix_api.requests import body
from evix_api.routes.latex import COMPILE_LIMIT, COMPILE_OPTIONAL, COMPILE_REQUIRED
from multi_agent.agents.writing_agent.tools import latex
from tests.test_report_adapter_contract import CompileSession, latex_service

SCRIPT = r"""
import {buildDemoPack} from './lib/agent/demo-study.ts';
import {applyCoverImage,applyFrameImage} from './lib/editor-model.ts';
import {parseCoverImage,parseFrameImage} from './lib/page-art.ts';
import {generateLatexBody,latexCompileInput,buildLatexSource} from './lib/latex-report.ts';
import {latexImages,latexCompilePayload} from './lib/latex-images.ts';
const u32=n=>[n>>>24&255,n>>>16&255,n>>>8&255,n&255];
const png=(w,h)=>Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13,0x49,0x48,0x44,0x52,...u32(w),...u32(h),8,2,0,0,0]);
const b64=bytes=>Buffer.from(bytes).toString('base64');
const pack=await buildDemoPack('城市社区助餐服务的使用体验、满意度与持续使用意愿调查');
let c=applyFrameImage(applyCoverImage(pack.report,parseCoverImage({schema:'CoverImage/v1',mime:'image/png',data:b64(png(1000,1414)),widthPx:1000,heightPx:1414,note:'封面'})),parseFrameImage({schema:'FrameImage/v1',mime:'image/png',data:b64(png(1240,1754)),widthPx:1240,heightPx:1754,note:'页框'}));
c={...c,latex:{version:1,body:generateLatexBody(c),reportHash:'0'.repeat(64)}};
const input=latexCompileInput(c);
const payload=latexCompilePayload(input,await latexImages(c,input,async(svg,width)=>({bytes:png(width,Math.round(width*0.6)),width,height:Math.round(width*0.6)})));
process.stdout.write(JSON.stringify({payload,source:buildLatexSource(payload)}));
"""


class JsonRequest:
    def __init__(self, raw):
        self.raw = raw
        self.headers = {"content-type": "application/json", "content-length": str(len(raw))}

    async def stream(self):
        for i in range(0, len(self.raw), 65536):
            yield self.raw[i:i + 65536]


@pytest.mark.asyncio
async def test_the_browser_payload_passes_the_route_and_reaches_the_compiler_with_its_files(tmp_path, monkeypatch):
    platform = Path(__file__).resolve().parents[2] / "frontend"
    process = subprocess.run(["node", "--experimental-strip-types", "--input-type=module", "-e", SCRIPT], cwd=platform,
                             capture_output=True, text=True, encoding="utf-8", timeout=120)
    assert process.returncode == 0, process.stderr
    built = json.loads(process.stdout)
    raw = json.dumps(built["payload"], ensure_ascii=False).encode("utf-8")
    assert len(raw) < COMPILE_LIMIT
    data = await body(JsonRequest(raw), COMPILE_REQUIRED, COMPILE_OPTIONAL, limit=COMPILE_LIMIT)
    assert {"coverImage", "frameImage", "images"} <= set(data) and "figureImages" not in data

    executable = tmp_path / "xelatex.exe"; executable.write_bytes(b"synthetic-placeholder")
    service = latex_service()
    service.compiler = latex.LatexCompiler(SimpleNamespace(latex_concurrency=1, latex_compiler=str(executable), latex_timeout_seconds=30))
    seen = []
    def fake_run(exe, folder, deadline):
        seen.append(sorted(p.name for p in folder.iterdir()))
        (folder / "document.pdf").write_bytes(b"%PDF-synthetic-fixture")
        return 0, ""
    monkeypatch.setattr(latex, "run_pass", fake_run)
    result = await service.compile_report(project_id="p", user=SimpleNamespace(id="u"), session=CompileSession(),
                                          check_session=lambda _: SimpleNamespace(id="u"), data=data)
    assert result["status"] == "compiled", result["diagnostics"]
    assert result["source"] == built["source"], "the server builds the source the browser previewed"
    files = set(seen[0])
    assert {"document.tex", "cover-image.png", "frame-image.png"} <= files
    assert {f"exhibit-{k}.png" for k in range(len(data["images"]))} <= files
