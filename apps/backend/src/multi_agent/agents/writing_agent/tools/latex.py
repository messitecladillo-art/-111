"""Bounded project-scoped XeLaTeX export of a closed, body-only TeX subset."""
import base64
from decimal import Decimal, ROUND_HALF_UP, localcontext
import hashlib
import math
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import threading
import time

from shared.errors import ApiError
from shared.contracts import object_fields, text

MAX_BODY = 120000
MAX_PDF = 4 * 1024 * 1024
MAX_LOG = 1024 * 1024
MAX_FILES = 12 * 1024 * 1024
ENVIRONMENTS = frozenset("itemize enumerate description center quote quotation equation equation* align align* aligned gather gather* gathered split cases matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix table tabular array figure tikzpicture axis".split())
COMMANDS = frozenset((
    "section subsection subsubsection paragraph subparagraph par newline linebreak textbf textit emph textrm textsf texttt textnormal underline textsuperscript textsubscript "
    "item caption label ref eqref centering toprule midrule bottomrule multicolumn "
    "textbackslash textasciitilde textasciicircum textdegree textendash textemdash textquotedblleft textquotedblright "
    "frac dfrac tfrac sqrt overline widehat widetilde hat bar vec dot ddot tilde acute grave breve check mathrm mathbf mathit mathsf mathtt mathcal mathbb mathop operatorname text "
    "left right middle big Big bigg Bigg bigl bigr Bigl Bigr biggl biggr Biggl Biggr "
    "alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega "
    "Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega "
    "sum prod coprod int iint iiint oint lim limsup liminf max min sup inf sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln exp det gcd Pr "
    "infty partial nabla forall exists nexists neg land lor wedge vee cap cup bigcap bigcup emptyset varnothing in notin ni subset supset subseteq supseteq "
    "le leq ge geq ne neq approx sim simeq equiv propto ll gg times cdot div pm mp circ bullet star ast oplus otimes perp parallel "
    "to mapsto rightarrow leftarrow leftrightarrow Rightarrow Leftarrow Leftrightarrow iff implies uparrow downarrow "
    "ldots cdots vdots ddots dots langle rangle lvert rvert lVert rVert vert Vert lceil rceil lfloor rfloor "
    "quad qquad enspace thinspace negthinspace displaystyle textstyle scriptstyle scriptscriptstyle limits nolimits underbrace overbrace underset overset binom dbinom tbinom not hbar ell Re Im angle triangle square degree "
    "begin end addplot definecolor"
).split())
SYMBOLS = frozenset("\\%&#_${},;:!()[] ")


def options(value):
    x = object_fields(value, ("part", "includeCover", "includeToc", "firstLineChars", "numberPages"))
    if x["part"] not in ("main", "appendix") or any(type(x[k]) is not bool for k in ("includeCover", "includeToc", "numberPages")) or type(x["firstLineChars"]) is not int or x["firstLineChars"] not in (0, 2):
        raise ApiError()
    return x


def escape(value):
    replacements = {"\\": r"\textbackslash{}", "{": r"\{", "}": r"\}", "$": r"\$", "&": r"\&", "#": r"\#", "%": r"\%", "_": r"\_", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}", "\r": " ", "\n": " "}
    return "".join(replacements.get(c, c) for c in value)


def normalize_body(content):
    # TeX treats CR and CRLF as line endings; the validator and compiler must see identical lines.
    return content.replace("\r\n", "\n").replace("\r", "\n")


def build_source(title, subtitle, content, settings):
    """Keep byte-identical with the frontend generator; source is always returned by API."""
    lines = [
        r"\documentclass[UTF8,a4paper,zihao=-4]{ctexart}",
        r"\usepackage[top=25.4mm,bottom=25.4mm,left=31.8mm,right=31.8mm]{geometry}",
        r"\usepackage{amsmath,amssymb,booktabs,array,caption,setspace}",
        r"\IfFontExistsTF{Times New Roman}{\setmainfont{Times New Roman}}{}",
        r"\setstretch{1.25}", r"\setlength{\emergencystretch}{5em}", r"\setlength{\parskip}{0.5\baselineskip}",
        "\\setlength{\\parindent}{" + str(settings["firstLineChars"]) + "em}",
        r"\setlength{\heavyrulewidth}{1.5bp}", r"\setlength{\lightrulewidth}{0.75bp}",
        r"\renewcommand{\arraystretch}{1.2}",
        r"\DeclareCaptionFont{reportcaption}{\fontsize{12bp}{14.4bp}\selectfont}",
        r"\captionsetup{font=reportcaption,labelsep=quad,justification=centering,singlelinecheck=false}",
        r"\ctexset{section={format=\fontsize{15bp}{18.75bp}\selectfont\heiti},subsection={format=\fontsize{14bp}{17.5bp}\selectfont\heiti},subsubsection={format=\fontsize{12bp}{15bp}\selectfont\songti}}",
        r"\setcounter{secnumdepth}{-1}",
        "\\pagestyle{" + ("plain" if settings["numberPages"] else "empty") + "}",
        r"\begin{document}",
        r"\fontsize{12bp}{14.4bp}\selectfont",
    ]
    if r"\begin{tikzpicture}" in content:
        lines[3:3] = [r"\usepackage{pgfplots}", r"\pgfplotsset{compat=1.18}"]
    if settings["includeCover"]:
        lines += [r"\begin{titlepage}", r"\centering", r"\vspace*{25mm}", "{\\songti\\bfseries\\fontsize{16bp}{20bp}\\selectfont " + escape(title) + r"\par}", r"\vspace{10mm}", escape(subtitle) + r"\par", r"\end{titlepage}"]
    if settings["includeToc"]:
        lines += [r"\pagenumbering{Roman}", r"\tableofcontents", r"\clearpage", r"\pagenumbering{arabic}"]
    lines += ["% BODY START", normalize_body(content), "% BODY END", r"\end{document}", ""]
    return "\n".join(lines)


class UnsafeBody(Exception):
    def __init__(self, message, line):
        self.message, self.line = message, line


def chart_display_number(value):
    """Match String(Number(binary64.toFixed(3))) within the bounded chart range.

    toFixed rounds the actual binary64 value, with exact half ties away from zero;
    Python round uses ties-to-even and rounding a decimal input string loses that input.
    """
    with localcontext() as context:
        context.prec = 32
        rounded = Decimal.from_float(value).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
    if not rounded:
        return "0"  # JavaScript String(Number("-0.000")) normalizes negative zero.
    return format(rounded, "f").rstrip("0").rstrip(".")


def validate_body(content):
    text(content, MAX_BODY)
    content = normalize_body(content)
    def fail(message, position):
        raise UnsafeBody(message, content.count("\n", 0, position) + 1)
    if "^^" in content:
        fail("不支持 TeX 字符重编码。请直接输入正文字符。", content.index("^^"))
    stack, depth, commands, environments = [], 0, 0, 0
    i = 0
    def next_token(position):
        while position < len(content):
            if content[position].isspace(): position += 1; continue
            if content[position] == "%":
                end = content.find("\n", position)
                position = len(content) if end == -1 else end + 1
                continue
            break
        return content[position:position + 1]
    def argument(position, pattern, message):
        match = re.match(r"\s*\{(" + pattern + r")\}", content[position:])
        if not match:
            fail(message, position)
        return match.group(1), position + match.end()
    number = r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?"
    def escaped_chart_text(value, position):
        # Generated labels are plain escaped text, never TeX instructions or PGF keys.
        remainder = re.sub(r"\\(?:textbackslash|textasciitilde|textasciicircum)\{\}|\\[{}$&#%_]", "", value)
        if "\\" in remainder or "{" in remainder or "}" in remainder or "%" in remainder:
            fail("图表标签须使用转义后的文字。", position)
    def chart_labels(value, position):
        # Each generated category has its own group; commas inside that group are text.
        labels, cursor = [], 0
        while cursor < len(value):
            if value[cursor] != "{": fail("图表类别标签须分别包裹。", position)
            start, level = cursor + 1, 1
            cursor += 1
            while cursor < len(value) and level:
                if value[cursor] == "\\": cursor += 2; continue
                if value[cursor] == "{": level += 1
                if value[cursor] == "}": level -= 1
                cursor += 1
            if level: fail("图表类别标签尚未闭合。", position)
            escaped_chart_text(value[start:cursor - 1], position)
            labels.append(value[start:cursor - 1])
            if cursor < len(value):
                if value[cursor] != ",": fail("图表类别标签分隔符无效。", position)
                cursor += 1
                if cursor == len(value): fail("图表类别标签缺失。", position)
        return labels
    def axis_options(position):
        if position >= len(content) or content[position] != "[":
            fail("图表坐标轴须使用生成的固定配置。", position)
        end, braces = position + 1, 0
        while end < len(content):
            if content[end] == "\\": end += 2; continue
            if content[end] == "{": braces += 1
            if content[end] == "}": braces -= 1
            if braces < 0: fail("图表配置括号不匹配。", end)
            if content[end] == "]" and braces == 0: break
            end += 1
        if end == len(content): fail("图表配置尚未闭合。", position)
        value = content[position + 1:end]
        pattern = r"width=13cm,height=8cm,ybar,bar width=12pt,xtick=\{(?P<ticks>[0-9,]+)\},xticklabels=\{(?P<labels>.*?)\},x tick label style=\{rotate=35,anchor=east\},ylabel=\{(?P<ylabel>.*?)\},enlarge x limits=0\.12,nodes near coords,point meta=explicit symbolic"
        match = re.fullmatch(pattern, value, re.S)
        if not match: fail("图表仅支持固定的柱状图坐标轴配置。", position)
        ticks = match["ticks"].split(",")
        if not 1 <= len(ticks) <= 16 or ticks != [str(n) for n in range(len(ticks))]:
            fail("图表类别须为 1 至 16 个连续编号。", position)
        if len(chart_labels(match["labels"], position)) != len(ticks): fail("图表类别标签与编号不匹配。", position)
        escaped_chart_text(match["ylabel"], position)
        return end + 1, len(ticks)
    def plot_coordinates(position):
        match = re.match(r"\[fill=ResearchAccent,draw=ResearchAccent\] coordinates \{([^{}]*)\};", content[position:])
        if not match: fail("图表仅接受有限的内联数值坐标。", position)
        points = re.findall(r"\((" + number + r"),(" + number + r")\) \[(" + number + r")\]", match[1])
        remainder = re.sub(r"\((" + number + r"),(" + number + r")\) \[(" + number + r")\]", "", match[1])
        if remainder.strip() or not 1 <= len(points) <= 16:
            fail("图表坐标数量或格式无效。", position)
        for n, point in enumerate(points):
            if any(not math.isfinite(float(v)) or abs(float(v)) > 1e12 for v in point) or float(point[0]) != n or point[2] != chart_display_number(float(point[1])):
                fail("图表坐标、标注与类别编号不一致。", position)
        return position + match.end(), len(points)
    while i < len(content):
        c = content[i]
        if c == "%":
            end = content.find("\n", i); i = len(content) if end == -1 else end + 1; continue
        if c == "{":
            depth += 1
            if depth > 32: fail("正文分组最多嵌套 32 层。", i)
        elif c == "}":
            depth -= 1
            if depth < 0: fail("存在未配对的右花括号。", i)
        elif c == "\\":
            start = i
            if i + 1 >= len(content): fail("反斜杠后缺少命令。", i)
            match = re.match(r"[A-Za-z]+", content[i + 1:])
            if not match:
                symbol = content[i + 1]
                if symbol not in SYMBOLS: fail("不支持这个控制符。", i)
                i += 2
                if symbol == "\\":
                    if next_token(i) in ("[", "*"): fail("表格换行不接受自定义间距。", start)
                    for entry in stack:
                        if entry["name"] in ("tabular", "array"):
                            entry["rows"] += 1
                            if entry["rows"] > 500: fail("单张表格最多 500 行。", start)
                continue
            command = match.group(0); i += 1 + len(command); commands += 1
            if command not in COMMANDS: fail("不支持命令 \\" + command + "。请使用正文、公式或三线表语法。", start)
            if commands > 20000: fail("正文命令数量超过上限。", start)
            if command in ("begin", "end"):
                name, i = argument(i, r"[A-Za-z*]+", "环境名称须为固定名称。")
                if name not in ENVIRONMENTS: fail("不支持环境 " + name + "。", start)
                if command == "begin":
                    environments += 1
                    if len(stack) >= 32 or environments > 2000: fail("正文环境数量或层级超过上限。", start)
                    entry = {"name": name, "rules": [], "rows": 0}
                    if name == "figure" and next_token(i) == "[":
                        if not content.startswith("[htbp]", i): fail("图形仅接受固定浮动位置。", start)
                        i += len("[htbp]")
                    if name == "tikzpicture":
                        if not stack or stack[-1]["name"] != "figure" or not stack[-1].get("color"): fail("图表须在固定配色的图形环境内。", start)
                        if next_token(i) == "[": fail("图表不接受自定义执行配置。", start)
                    if name == "axis":
                        if not stack or stack[-1]["name"] != "tikzpicture": fail("坐标轴须在图表环境内。", start)
                        i, entry["ticks"] = axis_options(i)
                        entry["plots"] = 0
                    if name in ("tabular", "array"):
                        _, i = argument(i, r"c{1,12}", "表格须使用 1 至 12 个居中列，例如 {ccc}。")
                    stack.append(entry)
                else:
                    if not stack or stack[-1]["name"] != name: fail("环境起止不匹配。", start)
                    entry = stack.pop()
                    if name == "axis" and entry["plots"] != 1: fail("每张图须包含一次内联坐标计算结果。", start)
                    if name == "tabular" and entry["rules"] != ["toprule", "midrule", "bottomrule"]: fail("三线表须依次包含一次 top、mid、bottomrule。", start)
            elif command == "definecolor":
                if not stack or stack[-1]["name"] != "figure" or stack[-1].get("color"): fail("图表颜色须在图形环境内定义一次。", start)
                match = re.match(r"\{ResearchAccent\}\{HTML\}\{(?:0F766E|8A3449|234E80)\}", content[i:])
                if not match: fail("图表颜色仅支持项目三枚标准色。", start)
                i += match.end(); stack[-1]["color"] = True
            elif command == "addplot":
                if not stack or stack[-1]["name"] != "axis": fail("绘图须在坐标轴环境内。", start)
                i, count = plot_coordinates(i)
                stack[-1]["plots"] += 1
                if count != stack[-1]["ticks"] or stack[-1]["plots"] > 1: fail("图表类别与数值坐标不匹配。", start)
            elif command in ("toprule", "midrule", "bottomrule"):
                if not stack or stack[-1]["name"] != "tabular": fail("三线表横线须放在 tabular 环境内。", start)
                if next_token(i) == "[":
                    fixed = "[0.75bp]" if command == "midrule" else "[1.5bp]"
                    if not content.startswith(fixed, i): fail("三线表线宽须为 1.5、0.75、1.5 磅。", start)
                    i += len(fixed)
                stack[-1]["rules"].append(command)
            elif command == "multicolumn":
                _, i = argument(i, r"(?:[1-9]|1[0-2])", "合并列数须为 1 至 12。")
                _, i = argument(i, r"c", "合并列须居中。")
            elif command in ("label", "ref", "eqref"):
                _, i = argument(i, r"[A-Za-z][A-Za-z0-9:_-]{0,63}", "交叉引用须使用英文字母开头的固定标识。")
            continue
        i += 1
    if depth or stack: fail("花括号或环境尚未闭合。", len(content))


def sanitized_environment(directory, executable):
    # Standard runtime/font discovery paths only; never forward arbitrary app env or EVIX secrets.
    env = {name: os.environ[name] for name in ("SystemRoot", "WINDIR", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "HOME", "LANG", "LC_ALL") if name in os.environ}
    env.update({"PATH": str(Path(executable).parent) + os.pathsep + (str(Path(env.get("SystemRoot", "/")) / "System32") if os.name == "nt" else "/usr/bin:/bin"), "TMP": str(directory), "TEMP": str(directory), "TMPDIR": str(directory), "TEXMFOUTPUT": str(directory), "openin_any": "p", "openout_any": "p", "shell_escape": "f", "MIKTEX_ENABLE_INSTALLER": "0"})
    return env


def stop_process(process):
    if process.poll() is not None:
        return
    if os.name == "nt":
        # /T selects only descendants of the process this request started.
        try:
            subprocess.run([str(Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32/taskkill.exe"), "/PID", str(process.pid), "/T", "/F"], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5, check=False, creationflags=subprocess.CREATE_NO_WINDOW)
        except (OSError, subprocess.SubprocessError):
            pass  # The owned process is still killed and reaped below; its job is closed separately.
    else:
        try: os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError: pass
    try: process.kill()
    except ProcessLookupError: pass
    process.wait(timeout=5)


class WindowsJob:
    """Keep compiler descendants bounded and kill them even if the leader exits first."""
    def __init__(self):
        import ctypes
        from ctypes import wintypes
        class Basic(ctypes.Structure):
            _fields_ = [("ProcessTime", ctypes.c_int64), ("JobTime", ctypes.c_int64), ("Flags", wintypes.DWORD), ("MinWorking", ctypes.c_size_t), ("MaxWorking", ctypes.c_size_t), ("ActiveProcesses", wintypes.DWORD), ("Affinity", ctypes.c_size_t), ("Priority", wintypes.DWORD), ("Scheduling", wintypes.DWORD)]
        class IO(ctypes.Structure):
            _fields_ = [(name, ctypes.c_uint64) for name in ("ReadOps", "WriteOps", "OtherOps", "ReadBytes", "WriteBytes", "OtherBytes")]
        class Extended(ctypes.Structure):
            _fields_ = [("Basic", Basic), ("IO", IO), ("ProcessMemory", ctypes.c_size_t), ("JobMemory", ctypes.c_size_t), ("PeakProcessMemory", ctypes.c_size_t), ("PeakJobMemory", ctypes.c_size_t)]
        self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        self.kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        self.kernel.CreateJobObjectW.restype = wintypes.HANDLE
        self.kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
        self.kernel.SetInformationJobObject.restype = wintypes.BOOL
        self.kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        self.kernel.AssignProcessToJobObject.restype = wintypes.BOOL
        self.kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        self.kernel.CloseHandle.restype = wintypes.BOOL
        self.handle = self.kernel.CreateJobObjectW(None, None)
        if not self.handle: raise OSError("Compiler process isolation unavailable")
        limits = Extended()
        limits.Basic.Flags = 0x2000 | 0x100 | 0x200 | 0x8  # kill-on-close, process/job memory, active-process count
        limits.Basic.ActiveProcesses = 8
        limits.ProcessMemory, limits.JobMemory = 512 * 1024 * 1024, 768 * 1024 * 1024
        if not self.kernel.SetInformationJobObject(self.handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            self.close(); raise OSError("Compiler process limits unavailable")

    def assign(self, process):
        if not self.kernel.AssignProcessToJobObject(self.handle, int(process._handle)):
            raise OSError("Compiler process isolation unavailable")

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle); self.handle = None


def enforce_output_limits(directory):
    sizes = {p.name: p.stat().st_size for p in directory.iterdir() if p.is_file()}
    if sizes.get("process.log", 0) > MAX_LOG or sizes.get("document.log", 0) > MAX_LOG or sum(sizes.values()) > MAX_FILES or sizes.get("document.pdf", 0) > MAX_PDF:
        raise OverflowError()


def run_pass(executable, directory, deadline):
    args = [executable, "-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error"]
    if "miktex" in executable.lower():
        args += ["-disable-installer", "-disable-write18", "-dont-parse-first-line"]
    args += ["document.tex"]
    process, job = None, WindowsJob() if os.name == "nt" else None
    try:
        with (directory / "process.log").open("wb") as output:
            process = subprocess.Popen(args, cwd=directory, env=sanitized_environment(directory, executable), stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT, shell=False, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0, start_new_session=os.name != "nt")
            if job: job.assign(process)
            while process.poll() is None:
                if time.monotonic() >= deadline: raise TimeoutError()
                enforce_output_limits(directory)
                time.sleep(0.05)
            enforce_output_limits(directory)
            return process.returncode, (directory / "process.log").read_text(encoding="utf-8", errors="replace")
    finally:
        try:
            if process: stop_process(process)
        finally:
            if job: job.close()
            elif process and os.name != "nt":
                try: os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError: pass


def diagnostic(message, line=None, severity="error"):
    return {"severity": severity, "line": line, "message": message}


def compiler_diagnostic(log, source):
    start = source.splitlines().index("% BODY START") + 2
    match = re.search(r"(?:document\.tex:|\bl\.)(\d+)", log)
    full_line = int(match.group(1)) if match else None
    line = full_line - start + 1 if full_line is not None and full_line >= start else None
    if "Missing $ inserted" in log: message = "数学模式未闭合或公式符号放在正文中，请检查 $、\\( 和 \\[。"
    elif "Undefined control sequence" in log: message = "命令无法编译，请核对命令拼写和公式环境。"
    elif "File `" in log and "not found" in log: message = "编译环境缺少预装组件，请联系管理员。"
    elif "Emergency stop" in log or "Runaway argument" in log: message = "正文结构尚未闭合，请检查花括号、公式和环境。"
    else: message = "LaTeX 编译未完成，请检查该行附近的公式和表格结构。"
    return diagnostic(message, line)


class LatexCompiler:
    def __init__(self, settings):
        self.settings = settings
        self.slots = threading.BoundedSemaphore(settings.latex_concurrency)

    def compile(self, title, subtitle, content, settings):
        source = build_source(title, subtitle, content, settings)
        result = {"status": "error", "source": source, "sourceHash": hashlib.sha256(source.encode("utf-8")).hexdigest(), "pdfBase64": None, "diagnostics": [], "engine": None}
        try: validate_body(content)
        except UnsafeBody as error:
            result["diagnostics"] = [diagnostic(error.message, error.line)]; return result
        executable = self.settings.latex_compiler
        if not executable or not Path(executable).is_file():
            result.update(status="unavailable", diagnostics=[diagnostic("PDF 编译器尚未配置。可先导出 LaTeX 源码。")]); return result
        if not self.slots.acquire(blocking=False):
            raise ApiError(429, "latex_busy", "编译任务已满，请稍后重试。")
        result["engine"] = "xelatex"
        try:
            with tempfile.TemporaryDirectory(prefix="evix-latex-") as directory:
                directory = Path(directory)
                (directory / "document.tex").write_text(source, encoding="utf-8", newline="\n")
                deadline = time.monotonic() + self.settings.latex_timeout_seconds
                log = ""
                for _ in range(2):
                    code, log = run_pass(executable, directory, deadline)
                    if code:
                        result["diagnostics"] = [compiler_diagnostic(log, source)]; return result
                pdf = directory / "document.pdf"
                if not pdf.is_file() or not 4 < pdf.stat().st_size <= MAX_PDF or not pdf.read_bytes().startswith(b"%PDF-"):
                    result["diagnostics"] = [diagnostic("编译器未生成有效 PDF，或 PDF 超过 4 MiB。")]; return result
                result.update(status="compiled", pdfBase64=base64.b64encode(pdf.read_bytes()).decode("ascii"))
                if "Overfull" in log: result["diagnostics"].append(diagnostic("部分内容超出行宽，请检查长公式或表格。", severity="warning"))
                if "Missing character" in log: result["diagnostics"].append(diagnostic("当前字体缺少部分字符，请检查 PDF 中的符号。", severity="warning"))
                return result
        except TimeoutError:
            result["diagnostics"] = [diagnostic("编译超过时间上限，请拆分长公式或表格后重试。")]
        except OverflowError:
            result["diagnostics"] = [diagnostic("编译产物超过容量上限，请精简后重试。")]
        except (OSError, subprocess.SubprocessError):
            result.update(status="unavailable", diagnostics=[diagnostic("编译器暂时不可用，请联系管理员。")])
        finally:
            self.slots.release()
        return result
