import base64
import copy
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import time
from uuid import uuid4

import pytest

from evix_api import latex
from evix_api.contracts import ApiError
from evix_api.reports import report_content
from .test_reports import content
from .test_postgres import project


OPTIONS = {"part": "main", "includeCover": True, "includeToc": True, "firstLineChars": 2, "numberPages": True}
SAFE = r"\section{合成验收}" + "\n" + r"公式：\(\bar{x}=\frac{1}{n}\sum_{i=1}^{n}x_i\)。\par" + "\n" + r"\begin{tabular}{cc}\toprule 变量 & 数值 \\ \midrule A & 12 \\ \bottomrule\end{tabular}"


@pytest.mark.parametrize("unsafe", [
    r"\input{secret}", r"\include{secret}", r"\write18{anything}", r"\csname input\endcsname{a}",
    r"\newcommand{\a}{x}", r"\def\a{x}", r"\catcode`\x=0", r"\directlua{anything}",
    r"\special{pdf:fstream}", r"\font\f=cmr10", r"\usepackage{shellesc}", r"\documentclass{article}",
    r"\begin{document}x\end{document}", r"\begin{filecontents}{x}a\end{filecontents}",
    r"^^5cinput{a}", "% ^^5cinput{a}", r"\textbf{\input{a}}", r"\begin{tabular}{*{999999999}{c}}x\end{tabular}",
    r"\begin{tabular}{lc}\toprule a&b\\\midrule a&b\\\bottomrule\end{tabular}",
    r"\begin{array}{c@{\input{x}}c}a&b\end{array}",
    r"\begin{tabular}{cc}\toprule[10000pt]a&b\\\midrule a&b\\\bottomrule\end{tabular}",
    "\\begin{tabular}{cc}\\toprule% comment\n[100pt]a&b\\\\\\midrule a&b\\\\\\bottomrule\\end{tabular}",
    r"\begin{tabular}{c}\toprule a\\\midrule a\\*[99999pt]\bottomrule\end{tabular}",
    r"\begin{tabular}{c}\toprule a\\\bottomrule\end{tabular}", r"\label{\section{abc}}", "{" * 33 + "x" + "}" * 33,
    r"\begin{itemize}\end{enumerate}", r"\end{equation}", "}\n",
    "% harmless\r\\input{synthetic-canary.tex}", "% harmless\r\n\\input{synthetic-canary.tex}",
    "% harmless\r\\write18{synthetic}", "% harmless\r^^5cinput{synthetic}",
    "\\begin{tabular}{cc}\\toprule% comment\r[100pt]a&b\\\\\\midrule a&b\\\\\\bottomrule\\end{tabular}",
])
def test_closed_language_rejects_unsafe_or_unbounded_tex_before_process(settings, monkeypatch, unsafe):
    monkeypatch.setattr(latex, "run_pass", lambda *_: pytest.fail("invalid body reached compiler"))
    result = latex.LatexCompiler(settings).compile("合成", "", unsafe, OPTIONS)
    assert result["status"] == "error" and result["pdfBase64"] is None
    assert result["diagnostics"][0]["line"] >= 1


def test_safe_subset_and_metadata_escaping():
    latex.validate_body(SAFE)
    latex.validate_body(r"\begin{enumerate}\item 文本 \textbf{加粗}\item \(\sqrt{1+x^2}\)\end{enumerate}")
    latex.validate_body(r"\[\begin{pmatrix}a&b\\c&d\end{pmatrix}\]")
    title = "\\input{secret}% # & $ _ ^ ~"
    source = latex.build_source(title, "line\nnext", SAFE, OPTIONS)
    assert r"\textbackslash{}input\{secret\}\% \# \& \$ \_ \textasciicircum{} \textasciitilde{}" in source
    assert r"\setlength{\heavyrulewidth}{1.5bp}" in source and r"\setlength{\lightrulewidth}{0.75bp}" in source
    assert r"\fontsize{12bp}{14.4bp}" in source and r"\fontsize{15bp}{18.75bp}" in source and r"\fontsize{16bp}{20bp}" in source
    assert source.count(r"\begin{document}") == 1 and source.endswith("\\end{document}\n")
    assert "fontset=auto" not in source and "line next" in source
    assert source.splitlines().index("% BODY START") < source.splitlines().index("% BODY END")
    assert source == latex.build_source(title, "line\nnext", SAFE, dict(reversed(list(OPTIONS.items()))))


def test_newline_normalization_matches_validator_and_generated_source():
    body = "% harmless\r\\section{正文}\r\n正文\\par"
    latex.validate_body(body)
    assert latex.build_source("合成", "", body, OPTIONS) == latex.build_source("合成", "", body.replace("\r\n", "\n").replace("\r", "\n"), OPTIONS)
    with pytest.raises(latex.UnsafeBody) as error:
        latex.validate_body("% harmless\r\\input{synthetic-canary.tex}")
    assert error.value.line == 2


@pytest.mark.parametrize("name,limit", [("document.log", "MAX_LOG"), ("document.aux", "MAX_FILES")])
def test_fast_success_still_checks_all_output_limits(tmp_path, monkeypatch, name, limit):
    class Process:
        returncode, pid = 0, 123
        def poll(self): return 0
    class Job:
        closed = False
        def assign(self, process): pass
        def close(self): self.closed = True
    job = Job()
    monkeypatch.setattr(latex, "WindowsJob", lambda: job)
    monkeypatch.setattr(latex.subprocess, "Popen", lambda *args, **kwargs: Process())
    monkeypatch.setattr(latex.os, "killpg", lambda *_: None, raising=False)
    monkeypatch.setattr(latex, limit, 1024)
    (tmp_path / name).write_bytes(b"x" * 2048)
    with pytest.raises(OverflowError): latex.run_pass("synthetic-xelatex", tmp_path, time.monotonic() + 10)
    if os.name == "nt": assert job.closed


@pytest.mark.skipif(os.name != "nt", reason="Windows taskkill fallback")
@pytest.mark.parametrize("exception", [subprocess.TimeoutExpired("taskkill", 5), OSError("unavailable")])
def test_taskkill_failure_still_kills_and_reaps_owned_process(monkeypatch, exception):
    class Process:
        pid, killed, reaped = 123, False, False
        def poll(self): return None
        def kill(self): self.killed = True
        def wait(self, timeout): self.reaped = True
    process = Process()
    def fail(*args, **kwargs): raise exception
    monkeypatch.setattr(latex.subprocess, "run", fail)
    latex.stop_process(process)
    assert process.killed and process.reaped


@pytest.mark.skipif(os.name != "nt", reason="Windows process-tree isolation")
def test_windows_job_closes_descendants_after_leader_exits():
    import ctypes
    from ctypes import wintypes
    job = latex.WindowsJob()
    process = None
    handle = None
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.WaitForSingleObject.restype = wintypes.DWORD
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    try:
        code = "import subprocess,sys,time; time.sleep(.2); child=subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)']); print(child.pid,flush=True)"
        # Child stdout must not inherit the parent's pipe, otherwise communicate would await it too.
        code = code.replace("sleep(30)']);", "sleep(30)'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);")
        process = subprocess.Popen([sys.executable, "-c", code], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
        job.assign(process)
        output, _ = process.communicate(timeout=5)
        assert process.returncode == 0
        handle = kernel.OpenProcess(0x100000, False, int(output.strip()))
        assert handle and kernel.WaitForSingleObject(handle, 0) == 258
        job.close()
        assert kernel.WaitForSingleObject(handle, 5000) == 0
    finally:
        if process: latex.stop_process(process)
        job.close()
        if handle: kernel.CloseHandle(handle)


def test_schema_keeps_unfinished_latex_and_legacy_without_adding_fields():
    old = content(); assert "latex" not in report_content(old)
    draft = {"version": 1, "body": r"\frac{", "reportHash": "a" * 64}
    updated = {**old, "latex": draft}; assert report_content(updated)["latex"] == draft
    for bad in [{**draft, "version": True}, {**draft, "reportHash": "A" * 64}, {**draft, "extra": 1}, {**draft, "body": "😀" * 60001}]:
        with pytest.raises(ApiError): report_content({**old, "latex": bad})
    large = copy.deepcopy(updated)
    large["latex"]["body"] = "中" * 120000
    large["report"] = [{"id": str(i), "title": "", "source": "", "body": "中" * 12000} for i in range(5)]
    with pytest.raises(ApiError) as error: report_content(large)
    assert error.value.status == 413


def test_sanitized_environment_never_inherits_application_secrets(tmp_path, monkeypatch):
    monkeypatch.setenv("EVIX_AUTH_SECRET", "must-not-leak")
    monkeypatch.setenv("DATABASE_URL", "must-not-leak")
    monkeypatch.setenv("OPENAI_API_KEY", "must-not-leak")
    monkeypatch.setenv("TEXINPUTS", "/secret")
    env = latex.sanitized_environment(tmp_path, "/fixed/bin/xelatex")
    assert not any(key in env for key in ("EVIX_AUTH_SECRET", "DATABASE_URL", "OPENAI_API_KEY", "TEXINPUTS"))
    assert env["openin_any"] == env["openout_any"] == "p" and env["shell_escape"] == "f"


def test_unavailable_compiler_still_returns_reproducible_source(settings):
    response = latex.LatexCompiler(settings).compile("合成", "", SAFE, OPTIONS)
    assert response["status"] == "unavailable" and response["pdfBase64"] is None and response["engine"] is None
    assert response["sourceHash"] == hashlib.sha256(response["source"].encode()).hexdigest()


def test_two_passes_limits_slot_release_and_sanitized_diagnostics(settings, tmp_path, monkeypatch):
    executable = tmp_path / "xelatex.exe"; executable.write_bytes(b"synthetic-placeholder")
    settings.latex_compiler = str(executable)
    calls = []
    def fake_run(exe, folder, deadline):
        calls.append((exe, folder, deadline))
        (folder / "document.pdf").write_bytes(b"%PDF-synthetic-fixture")
        return 0, "Overfull box at C:/private/server/profile\n"
    monkeypatch.setattr(latex, "run_pass", fake_run)
    compiler = latex.LatexCompiler(settings)
    result = compiler.compile("合成", "", SAFE, OPTIONS)
    assert result["status"] == "compiled" and base64.b64decode(result["pdfBase64"]).startswith(b"%PDF-")
    assert len(calls) == 2 and calls[0][2] == calls[1][2] and not calls[0][1].exists()
    assert "private" not in str(result) and result["diagnostics"][0]["severity"] == "warning"
    for exception in (TimeoutError, OverflowError, OSError):
        monkeypatch.setattr(latex, "run_pass", lambda *_: (_ for _ in ()).throw(exception()))
        assert compiler.compile("合成", "", SAFE, OPTIONS)["status"] in ("error", "unavailable")
        assert compiler.slots.acquire(blocking=False) and compiler.slots.acquire(blocking=False)
        compiler.slots.release(); compiler.slots.release()
    assert compiler.slots.acquire(blocking=False) and compiler.slots.acquire(blocking=False)
    try:
        with pytest.raises(ApiError) as error: compiler.compile("合成", "", SAFE, OPTIONS)
        assert error.value.status == 429
    finally: compiler.slots.release(); compiler.slots.release()


def test_compiler_error_lines_are_body_relative_and_logs_are_not_exposed():
    source = latex.build_source("合成", "", "first\nsecond", OPTIONS)
    line = source.splitlines().index("% BODY START") + 3
    result = latex.compiler_diagnostic(f"C:/private/server/document.tex:{line}: Missing $ inserted", source)
    assert result["line"] == 2 and "private" not in result["message"]


@pytest.mark.postgres
def test_project_auth_csrf_quota_and_optional_latex_storage(harness, monkeypatch):
    app, login, _, _ = harness
    owner, _ = login(); other, other_session = login("b@example.test")
    p, team = project(owner)
    path = f'/api/projects/{p["id"]}/report/latex/compile'
    request = {"title": "合成", "subtitle": "", "body": SAFE, "options": OPTIONS}
    assert other.post(path, json=request).status_code == 404
    assert owner.post(path, headers={"x-csrf-token": "invalid"}, json=request).status_code == 403
    assert owner.post(path, headers={"origin": "https://foreign.invalid"}, json=request).status_code == 403
    reply = owner.post(path, json=request)
    assert reply.status_code == 200 and reply.json()["status"] == "unavailable", reply.text
    assert owner.post(path, json={**request, "arbitrary": True}).status_code == 422
    owner.post(f'/api/teams/{team}/members', json={"email": "b@example.test", "role": "viewer"})
    assert other.post(path, json=request).status_code == 200
    owner.delete(f'/api/teams/{team}/members/{other_session["user"]["id"]}')
    assert other.post(path, json=request).status_code == 404
    app.state.settings.latex_hourly_compiles = 1
    assert owner.post(path, json=request).status_code == 429
    stored = {**content(), "latex": {"version": 1, "body": r"\frac{", "reportHash": "b" * 64}}
    response = owner.post(f'/api/projects/{p["id"]}/report/versions', json={"content": stored, "expectedRevision": 0, "idempotencyKey": str(uuid4())})
    assert response.status_code == 201, response.text
    assert owner.get(f'/api/projects/{p["id"]}/report').json()["report"]["content"]["latex"] == stored["latex"]


@pytest.mark.postgres
def test_revocation_during_compile_blocks_late_pdf(harness, monkeypatch):
    app, login, _, _ = harness
    owner, _ = login(); viewer, identity = login("b@example.test")
    p, team = project(owner)
    owner.post(f'/api/teams/{team}/members', json={"email": "b@example.test", "role": "viewer"})
    def compile_then_revoke(*args):
        response = owner.delete(f'/api/teams/{team}/members/{identity["user"]["id"]}')
        assert response.status_code == 204
        return {"status": "compiled", "pdfBase64": "should-not-escape"}
    monkeypatch.setattr(app.state.latex_compiler, "compile", compile_then_revoke)
    response = viewer.post(f'/api/projects/{p["id"]}/report/latex/compile', json={"title": "合成", "subtitle": "", "body": SAFE, "options": OPTIONS})
    assert response.status_code == 404 and "should-not-escape" not in response.text


def test_real_xelatex_synthetic_pdf_and_malformed_math(settings):
    executable = os.getenv("EVIX_TEST_LATEX_COMPILER")
    if not executable: pytest.skip("Explicit local XeLaTeX test executable required")
    settings.latex_compiler = executable
    compiler = latex.LatexCompiler(settings)
    result = compiler.compile("合成验收 A&B_1", "软件验收 · 无实际数据", SAFE, OPTIONS)
    assert result["status"] == "compiled", result["diagnostics"]
    pdf = base64.b64decode(result["pdfBase64"])
    assert pdf.startswith(b"%PDF-") and 1000 < len(pdf) <= latex.MAX_PDF
    failed = compiler.compile("公式错误验收", "", r"\section{错误公式} $ x_1", OPTIONS)
    assert failed["status"] == "error" and failed["pdfBase64"] is None


@pytest.mark.parametrize("identifier", ["0123456789abcdef" * 4, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" * 3, "W" * 64])
def test_real_xelatex_long_identifiers_stay_within_paragraph_width(settings, identifier):
    executable = os.getenv("EVIX_TEST_LATEX_COMPILER")
    if not executable: pytest.skip("Explicit local XeLaTeX test executable required")
    settings.latex_compiler = executable
    wrapped = r"\linebreak[0]".join(identifier[i:i + 8] for i in range(0, len(identifier), 8))
    body = r"\section{排版验收}" + "\n" + "数据指纹：" + wrapped + r"。\par"
    result = latex.LatexCompiler(settings).compile("合成排版验收", "", body, {**OPTIONS, "includeCover": False, "includeToc": False})
    assert result["status"] == "compiled", result["diagnostics"]
    assert result["diagnostics"] == []  # A successful PDF alone does not prove that long text fits.
    assert base64.b64decode(result["pdfBase64"]).startswith(b"%PDF-")
    assert wrapped.replace(r"\linebreak[0]", "") == identifier


def test_real_xelatex_timeout_cleanup(settings, tmp_path):
    executable = os.getenv("EVIX_TEST_LATEX_COMPILER")
    if not executable: pytest.skip("Explicit local XeLaTeX test executable required")
    (tmp_path / "document.tex").write_text(latex.build_source("超时验收", "", SAFE, OPTIONS), encoding="utf-8")
    with pytest.raises(TimeoutError): latex.run_pass(executable, tmp_path, time.monotonic() - 1)


@pytest.mark.parametrize("part", ["main", "appendix"])
@pytest.mark.parametrize("cover,toc", [(False, False), (False, True), (True, False), (True, True)])
def test_real_xelatex_independent_cover_toc_options(settings, part, cover, toc):
    executable = os.getenv("EVIX_TEST_LATEX_COMPILER")
    if not executable: pytest.skip("Explicit local XeLaTeX test executable required")
    settings.latex_compiler = executable
    selected = latex.options({**OPTIONS, "part": part, "includeCover": cover, "includeToc": toc})
    body = r"\section{先看发现}合成发现。\par" + "\n" + r"\section{自定义方法}合成方法。\par"
    result = latex.LatexCompiler(settings).compile("自定义结构验收", "合成验收", body, selected)
    assert result["status"] == "compiled", result["diagnostics"]
    assert (r"\begin{titlepage}" in result["source"]) is cover
    assert (r"\tableofcontents" in result["source"]) is toc
    assert result["source"].index(r"\section{先看发现}") < result["source"].index(r"\section{自定义方法}")
    assert base64.b64decode(result["pdfBase64"]).startswith(b"%PDF-")


@pytest.mark.parametrize("field,value", [("includeCover", 0), ("includeToc", 1), ("numberPages", "false"), ("firstLineChars", True), ("firstLineChars", 1), ("part", "other")])
def test_flexible_options_preserve_strict_contract(field, value):
    selected = {**OPTIONS, "includeCover": False, "includeToc": False, field: value}
    with pytest.raises(ApiError): latex.options(selected)
    draft = content()
    draft["reportFormat"]["options"] = selected
    with pytest.raises(ApiError): report_content(draft)
