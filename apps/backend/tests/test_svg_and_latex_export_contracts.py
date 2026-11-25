"""Permanent contract guard for SVG plotting (`plot_sandbox.py`) and TeX export (`latex.py`).

Verifies live offline SVG rendering and deterministic XeLaTeX source generation:
1. `plot_sandbox.py` outputs well-formed XML `<svg>`, zero bare unescaped `&`,
   zero forbidden East Asian brackets, and zero `<text>` ellipsis truncation (`…` / `...`).
2. `writing_agent/tools/latex.py` enforces strict `{}` brace & environment balance across
   formulas and Booktabs three-line tables, zero forbidden brackets, and zero bare `#RRGGBB`
   hex color leaks in generated `.tex` output and compiler diagnostics.
"""

from __future__ import annotations

import hashlib
import re
from types import SimpleNamespace
import xml.etree.ElementTree as ET

import pytest

from multi_agent.agents.writing_agent.services.report_figure_template import figure_tex_preamble
from multi_agent.agents.writing_agent.tools import latex
from multi_agent.plot_sandbox import (
    SandboxSecurityError,
    _format_plot_title,
    _humanize_plot_text,
    audit_svg_layout,
    build_snapshot_plot_script,
    execute_sandbox_plot,
)

# Forbidden bracket codepoints (\u300c\u300d\u300e\u300f\u3010\u3011) via unicode escapes.
FORBIDDEN_BRACKETS_RE = re.compile("[\u300c\u300d\u300e\u300f\u3010\u3011]")
# Any '&' not starting a valid XML predefined or numeric character entity reference.
BARE_AMPERSAND_RE = re.compile(r"&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)")
# Unescaped '#RRGGBB' token (not preceded by a TeX escape backslash).
BARE_HEX_COLOR_RE = re.compile(r"(?<!\\)#[0-9A-Fa-f]{6}\b")

LATEX_OPTIONS = {
    "part": "main",
    "includeCover": True,
    "includeToc": True,
    "firstLineChars": 2,
    "numberPages": True,
}

VISUAL_STYLE_TEAL = {
    "schema": "ProjectVisualStyle/v1",
    "paletteId": "teal",
    "version": 1,
}


def _local_xml_tag(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _strip_tex_comments(tex: str) -> str:
    """Strip unescaped TeX '%' comments line-by-line while preserving escaped '\\%'."""
    out_lines: list[str] = []
    for raw_line in tex.splitlines():
        i = 0
        buf: list[str] = []
        while i < len(raw_line):
            ch = raw_line[i]
            if ch == "\\":
                if i + 1 < len(raw_line):
                    buf.append(raw_line[i : i + 2])
                    i += 2
                    continue
                buf.append(ch)
                i += 1
                continue
            if ch == "%":
                break
            buf.append(ch)
            i += 1
        out_lines.append("".join(buf))
    return "\n".join(out_lines)


def _analyze_tex_structure(tex: str) -> tuple[int, int, list[str]]:
    """Lex TeX control sequences/escapes and return (final_brace_depth, max_depth, unclosed_envs)."""
    depth = 0
    max_depth = 0
    env_stack: list[str] = []
    clean = _strip_tex_comments(tex)
    i = 0
    n = len(clean)
    while i < n:
        ch = clean[i]
        if ch == "\\":
            if i + 1 >= n:
                i += 1
                continue
            nxt = clean[i + 1]
            if nxt.isalpha():
                m = re.match(r"[A-Za-z]+", clean[i + 1 :])
                assert m is not None
                cmd = m.group(0)
                i += 1 + len(cmd)
                if cmd in ("begin", "end"):
                    arg_m = re.match(r"\s*\{([A-Za-z*]+)\}", clean[i:])
                    if arg_m:
                        env_name = arg_m.group(1)
                        i += arg_m.end()
                        if cmd == "begin":
                            env_stack.append(env_name)
                        else:
                            assert env_stack and env_stack[-1] == env_name, (
                                f"mismatched \\end{{{env_name}}} against stack {env_stack}"
                            )
                            env_stack.pop()
                continue
            # Non-letter control symbol such as \{, \}, \\, \#, \%, \&, \$, \_
            i += 2
            continue
        if ch == "{":
            depth += 1
            max_depth = max(max_depth, depth)
        elif ch == "}":
            depth -= 1
            assert depth >= 0, f"negative brace depth at offset {i}"
        i += 1
    return depth, max_depth, env_stack


def _sample_report_figures() -> list[dict]:
    digest_a = hashlib.sha256(b"wave20-figure-bar").hexdigest()
    digest_b = hashlib.sha256(b"wave20-figure-table").hexdigest()
    return [
        {
            "schema": "ReportFigure/v1",
            "id": "fig_adopt_bar",
            "resultId": "res_adopt_01",
            "resultHash": digest_a,
            "kind": "bar",
            "title": "各代际服务采纳均值 & 主色对照 #156B6B",
            "xLabel": "年龄分组",
            "yLabel": "得分均值",
            "note": "注：样本 n = 420，色彩参考 #0F766E & 显著性 p < 0.001。",
            "n": 420,
            "labels": ["60–69岁 & 低龄组", "70–79岁 & 中龄组", "80岁及以上"],
            "series": [{"name": "采纳均值", "values": [3.82, 4.15, 3.64]}],
            "bins": [],
            "boxes": [],
            "table": {"headers": [], "rows": []},
            "style": {"decimals": 2, "showLabels": True, "showGrid": True, "showBorder": False},
        },
        {
            "schema": "ReportFigure/v1",
            "id": "fig_reg_table",
            "resultId": "res_reg_02",
            "resultHash": digest_b,
            "kind": "table",
            "title": "多元回归核心系数汇总",
            "xLabel": "",
            "yLabel": "",
            "note": "",
            "n": 420,
            "labels": [],
            "series": [],
            "bins": [],
            "boxes": [],
            "table": {
                "headers": ["解释变量", "系数估计", "标准误"],
                "rows": [
                    ["适老界面 & 语音辅助", 0.418, 0.052],
                    ["社区补贴覆盖 #255D87", 0.309, 0.047],
                ],
            },
            "style": {"decimals": 3, "showLabels": True, "showGrid": False, "showBorder": False},
        },
    ]


@pytest.mark.parametrize("chart_kind", ["auto", "bar", "line", "forest", "dumbbell"])
def test_plot_sandbox_live_svg_xml_validity_and_zero_leak_contracts(chart_kind: str) -> None:
    """Live-execute `plot_sandbox` across all chart kinds and verify XML + text hygiene."""
    adversarial_title = (
        "[12] \u3010核心母洞察\u3011\uff1a\u300c智慧医养 & 社区协同\u300d对\u300e高龄独居群体\u300f"
        "续费采纳意愿的边际效应分析（p = 0.000, rho=0.68, 科研绘图沙盒）..."
    )
    adversarial_categories = [
        "\u3010construct:service_perception\u3011 & 医疗响应",
        "\u300ctech_ease\u300d & 语音交互",
        "\u300esubsidy_support\u300f & 补贴覆盖",
        "Q_trap 质控检验 (p = 0.000)",
        "living_mode & 社区互助 (rho=0.54)",
        "region_tier 县域基层站点",
        "renew_tier 年度续约意愿",
    ]
    snapshot = {
        "snapshot_id": f"snap_w20_{chart_kind}",
        "title": adversarial_title,
        "chart": {
            "title": adversarial_title,
            "categories": adversarial_categories,
            "values": [0.48, 0.36, 0.62, -0.19, 0.41, 0.29, 0.55],
        },
    }

    script, payload = build_snapshot_plot_script(snapshot, chart_kind=chart_kind)
    expected_kind = "barh" if chart_kind == "auto" else chart_kind
    assert payload["kind"] == expected_kind
    assert FORBIDDEN_BRACKETS_RE.search(payload["title"]) is None
    assert "..." not in payload["title"] and "…" not in payload["title"]
    for cat in payload["categories"]:
        assert FORBIDDEN_BRACKETS_RE.search(cat) is None
        assert "construct:" not in cat and "Q_trap" not in cat

    res = execute_sandbox_plot(script, payload, auto_repair=True, max_repairs=2, timeout_s=15.0)
    assert res["ok"] is True
    svg = res["svg"]
    assert isinstance(svg, str) and len(svg) > 600
    assert re.fullmatch(r"[0-9a-f]{64}", res["svgSha256"]) is not None

    # 1. Strict XML well-formedness and <svg> root contract
    root = ET.fromstring(svg)
    assert _local_xml_tag(root.tag) == "svg"

    # 2. Zero bare unescaped '&' in raw SVG XML; literal '&' must be encoded as '&amp;'
    assert BARE_AMPERSAND_RE.search(svg) is None
    assert "&amp;" in svg

    # 3. Zero forbidden brackets anywhere in raw SVG or parsed <text> nodes
    assert FORBIDDEN_BRACKETS_RE.search(svg) is None

    # 4. Zero ellipsis truncation ('…' or '...') in any <text> element + clean layout audit
    text_contents: list[str] = []
    for elem in root.iter():
        if _local_xml_tag(elem.tag) == "text":
            txt = re.sub(r"\s+", " ", "".join(elem.itertext())).strip()
            if txt:
                text_contents.append(txt)
                assert "…" not in txt, f"ellipsis char found in SVG <text>: {txt!r}"
                assert "..." not in txt, f"ASCII ellipsis found in SVG <text>: {txt!r}"
                assert FORBIDDEN_BRACKETS_RE.search(txt) is None

    joined_text = " | ".join(text_contents)
    assert len(text_contents) >= 6
    assert "服务感知综合分 & 医疗响应" in joined_text
    assert "“适老易用度” & 语音交互" in joined_text
    assert "p < 0.0001" in joined_text
    assert "ρ=0.54" in joined_text

    audit = res["audit"]
    assert audit["passed"] is True, f"SVG layout audit failed: {audit['issues']}"
    assert audit["vectorPure"] is True
    assert audit["truncationCount"] == 0
    assert audit["smallFontCount"] == 0


def test_svg_auditor_rejects_bare_ampersand_ellipsis_and_impure_elements() -> None:
    """`audit_svg_layout` deterministically blocks malformed XML, `<text>` ellipsis, and scripts."""
    bare_amp_svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180">'
        '<rect x="10" y="10" width="80" height="40" fill="#1f4e78"/>'
        '<rect x="110" y="10" width="80" height="40" fill="#4a7ebb"/>'
        '<text x="20" y="90" font-size="10">研发投入 & 产出比</text>'
        "</svg>"
    )
    with pytest.raises(ET.ParseError):
        ET.fromstring(bare_amp_svg)
    bare_audit = audit_svg_layout(bare_amp_svg)
    assert bare_audit["passed"] is False
    assert "invalid_svg_xml" in bare_audit["issues"]

    ellipsis_svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">'
        '<rect x="12" y="16" width="90" height="42" fill="#1f4e78"/>'
        '<rect x="120" y="16" width="90" height="42" fill="#4a7ebb"/>'
        '<text x="20" y="105" font-size="10">适老照护满意度标题被截断…</text>'
        '<text x="20" y="135" font-size="10">Secondary label...</text>'
        "</svg>"
    )
    trunc_audit = audit_svg_layout(ellipsis_svg)
    assert trunc_audit["passed"] is False
    assert trunc_audit["truncationCount"] == 2
    assert sum(1 for item in trunc_audit["issues"] if item.startswith("ellipsis_truncation:")) == 2

    impure_svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180">'
        '<script>alert(1)</script>'
        '<rect x="10" y="10" width="80" height="40" fill="#1f4e78"/>'
        '<rect x="110" y="10" width="80" height="40" fill="#4a7ebb"/>'
        "</svg>"
    )
    impure_audit = audit_svg_layout(impure_svg)
    assert impure_audit["passed"] is False
    assert impure_audit["vectorPure"] is False

    with pytest.raises(SandboxSecurityError):
        execute_sandbox_plot("import os\n", {})


def test_plot_text_and_title_humanizer_contracts() -> None:
    """Title formatter wraps long headings without ellipsis and strips forbidden brackets."""
    raw = (
        "[08] 关键结论更新：\u3010EpistemicGraph\u3011\u300cconstruct:digital_trust\u300d"
        "与受控算子在科研绘图沙盒中的显著性检验 p = 0.000, rho=0.73……..."
    )
    formatted = _format_plot_title(raw)
    assert FORBIDDEN_BRACKETS_RE.search(formatted) is None
    assert "..." not in formatted and "…" not in formatted
    assert "EpistemicGraph" not in formatted and "沙盒" not in formatted and "算子" not in formatted
    assert "digital_trust综合分" in formatted

    humanized = _humanize_plot_text("\u3010Q_trap\u3011\u300econstruct:service_perception\u300f p=0.000")
    assert FORBIDDEN_BRACKETS_RE.search(humanized) is None
    assert humanized == "反向异常题项“服务感知综合分” p < 0.0001"


def test_latex_formula_and_booktabs_tables_strict_brace_balance() -> None:
    """Academic formulas, Booktabs three-line tables, longtables, and PGFPlots stay brace-balanced."""
    rich_body = "\n".join(
        [
            r"\section{四、实证模型与参数估计}",
            r"行内估计式：\(\hat{\beta}_{1}=\frac{\sum_{i=1}^{n}(x_{i}-\bar{x})(y_{i}-\bar{y})}{\sum_{i=1}^{n}(x_{i}-\bar{x})^{2}}\)，显著性满足 \(p \le 0.001\)。\par",
            r"\begin{equation}",
            r"\Pr(Y_{i}=1 \vert \mathbf{X}_{i}) = \frac{1}{1 + \exp\left(-\left(\beta_{0} + \sum_{k=1}^{K}\beta_{k}X_{ik}\right)\right)} \tag{4-1}\label{eq:logit}",
            r"\end{equation}",
            r"\begin{align*}",
            r"\mathbf{\Sigma} &= \begin{pmatrix} \sigma_{11} & \sigma_{12} \\ \sigma_{21} & \sigma_{22} \end{pmatrix}, \\",
            r"\Delta \mathrm{BIC} &= -2\ln\mathcal{L}_{1} + k\ln n.",
            r"\end{align*}",
            r"\begin{table}[htbp]",
            r"\centering",
            r"\caption*{表 4-1\quad 核心构念回归结果汇总（对照公式 \eqref{eq:logit}）}",
            r"\addcontentsline{lot}{table}{表 4-1\quad 核心构念回归结果汇总}",
            r"\begin{tabular}{C{36mm}ccc}",
            r"\toprule",
            r"研究构念 & \multicolumn{2}{c}{回归估计与标准误} & 显著性 \\",
            r"\midrule",
            r"服务感知 \& 适老交互 & 0.462 & (0.048) & 99.9\% \\",
            r"社区补贴覆盖率 \#1 & 0.315 & (0.051) & 99.0\% \\",
            r"\bottomrule",
            r"\end{tabular}",
            r"\end{table}",
            r"\begin{longtable}{ccc}",
            r"\caption*{表 4-2\quad 分县域稳健性检验跨页三线表}",
            r"\addcontentsline{lot}{table}{表 4-2\quad 分县域稳健性检验跨页三线表}\\",
            r"\toprule[1.5bp]",
            r"层级分组 & 样本量 & 采纳率 \\",
            r"\midrule[0.75bp]",
            r"\endfirsthead",
            r"\caption*{续表 4-2\quad 分县域稳健性检验跨页三线表}\\",
            r"\toprule[1.5bp]",
            r"层级分组 & 样本量 & 采纳率 \\",
            r"\midrule[0.75bp]",
            r"\endhead",
            r"城关街道 & 210 & 68.5\% \\",
            r"远郊乡镇 & 210 & 54.2\% \\",
            r"\bottomrule[1.5bp]",
            r"\end{longtable}",
            r"\begin{figure}[htbp]",
            r"\definecolor{ResearchAccent}{HTML}{0F766E}",
            r"\centering",
            r"\begin{tikzpicture}",
            r"\begin{axis}[width=13cm,height=8cm,ybar,bar width=12pt,xtick={0,1,2},xticklabels={{低龄组 \& 城区},{中龄组 \& 镇区},{高龄组 \& 乡村}},x tick label style={rotate=35,anchor=east},ylabel={采纳比例（\%）},enlarge x limits=0.12,nodes near coords,point meta=explicit symbolic,ymin=0]",
            r"\addplot[fill=ResearchAccent,draw=ResearchAccent] coordinates {(0,68.5) [68.5] (1,59.25) [59.25] (2,47.125) [47.125]};",
            r"\end{axis}",
            r"\end{tikzpicture}",
            r"\caption*{图 4-1\quad 分组采纳比例柱状图}",
            r"\addcontentsline{lof}{figure}{图 4-1\quad 分组采纳比例柱状图}",
            r"\end{figure}",
            r"\begin{figure}[htbp]",
            r"\centering",
            r"\ResearchFigure{0}",
            r"\caption*{图 4-2\quad 注册图形宏输出}",
            r"\end{figure}",
            r"\begin{table}[htbp]",
            r"\centering",
            r"\ResearchFigure{1}",
            r"\caption*{表 4-3\quad 注册三线表宏输出}",
            r"\end{table}",
        ]
    )

    figures = _sample_report_figures()
    latex.validate_body(rich_body, figure_count=len(figures))

    body_depth, body_max_depth, body_envs = _analyze_tex_structure(rich_body)
    assert body_depth == 0
    assert 1 <= body_max_depth <= 32
    assert body_envs == []

    source = latex.build_source(
        "智慧医养服务采纳机制调研 & 实证报告",
        "主色调 #0F766E · 样本量 n = 420 & 置信水平 95%",
        rich_body,
        LATEX_OPTIONS,
        figures=figures,
        visual_style=VISUAL_STYLE_TEAL,
    )
    src_depth, _, src_envs = _analyze_tex_structure(source)
    assert src_depth == 0
    assert src_envs == []
    assert source.count(r"\begin{document}") == 1
    assert source.endswith("\\end{document}\n")


@pytest.mark.parametrize(
    "broken_body",
    [
        r"\section{未闭合花括号}\(\frac{a+b}{c\)",
        r"\section{多余右花括号}\(\hat{\beta}_{1}}\)",
        r"\begin{tabular}{cc}\toprule 指标 & {数值 \\ \midrule A & 1 \\ \bottomrule\end{tabular}",
        r"\begin{tabular}{cc}\toprule 指标 & 数值 \\ \bottomrule\end{tabular}",
        r"\begin{tabular}{cc}\midrule 指标 & 数值 \\ \toprule A & 1 \\ \bottomrule\end{tabular}",
        r"\begin{longtable}{cc}\toprule[1.5bp] A & B \\ \bottomrule[1.5bp]\end{longtable}",
        r"\begin{equation}\frac{1}{2}\end{align*}",
        "{" * 33 + "x" + "}" * 33,
    ],
)
def test_latex_validator_rejects_unbalanced_braces_and_broken_three_line_tables(broken_body: str) -> None:
    """Unbalanced `{}` or malformed Booktabs rule sequences fail closed before compiler invocation."""
    with pytest.raises(latex.UnsafeBody):
        latex.validate_body(broken_body)

    dummy_settings = SimpleNamespace(latex_compiler="", latex_concurrency=2, latex_timeout_seconds=10)
    compiled = latex.LatexCompiler(dummy_settings).compile("契约校验", "", broken_body, LATEX_OPTIONS)
    assert compiled["status"] == "error"
    assert compiled["pdfBase64"] is None
    assert len(compiled["diagnostics"]) == 1
    diag_msg = compiled["diagnostics"][0]["message"]
    assert FORBIDDEN_BRACKETS_RE.search(diag_msg) is None
    assert BARE_HEX_COLOR_RE.search(diag_msg) is None


def test_latex_source_zero_forbidden_brackets_and_zero_bare_hex_color_leak() -> None:
    """`latex.py` escapes `#RRGGBB` in text, strips `#` in `\\definecolor`, and emits zero forbidden brackets."""
    escaped = latex.escape("主题色 #0F766E & 辅色 #8A3449 (置信度 95%)")
    assert escaped == r"主题色 \#0F766E \& 辅色 \#8A3449 (置信度 95\%)"
    assert BARE_HEX_COLOR_RE.search(escaped) is None
    assert FORBIDDEN_BRACKETS_RE.search(escaped) is None

    figures = _sample_report_figures()
    preamble_lines = figure_tex_preamble(figures, VISUAL_STYLE_TEAL)
    preamble_tex = "\n".join(preamble_lines)
    assert r"\definecolor{ResearchFigureColour0}{HTML}{156B6B}" in preamble_tex
    assert r"\#156B6B" in preamble_tex
    assert r"\#0F766E" in preamble_tex
    assert r"\#255D87" in preamble_tex
    assert BARE_HEX_COLOR_RE.search(_strip_tex_comments(preamble_tex)) is None
    assert FORBIDDEN_BRACKETS_RE.search(preamble_tex) is None

    body = "\n".join(
        [
            r"\section{五、色彩编码与三线表纯净性核验}",
            "正文中引用的色值文本须写为 " + latex.escape("#0F766E 与 #234E80") + r"，不得裸露未转义井号。\par",
            r"\begin{figure}[htbp]",
            r"\definecolor{ResearchAccent}{HTML}{8A3449}",
            r"\centering",
            r"\ResearchFigure{0}",
            r"\caption*{图 5-1\quad 图形色板契约核验}",
            r"\end{figure}",
        ]
    )
    latex.validate_body(body, figure_count=len(figures))

    # Reject raw '#RRGGBB' inside \definecolor{ResearchAccent}{HTML}{...}
    bad_hex_body = body.replace("{HTML}{8A3449}", "{HTML}{#8A3449}")
    with pytest.raises(latex.UnsafeBody):
        latex.validate_body(bad_hex_body, figure_count=len(figures))

    dummy_settings = SimpleNamespace(latex_compiler="", latex_concurrency=2, latex_timeout_seconds=10)
    result = latex.LatexCompiler(dummy_settings).compile(
        "主标题色值 #0F766E & 规范核验",
        "副标题色值 #234E80 · 100% 纯净契约",
        body,
        LATEX_OPTIONS,
        figures=figures,
        visual_style=VISUAL_STYLE_TEAL,
    )
    assert result["status"] == "unavailable"
    source = result["source"]
    non_comment_source = _strip_tex_comments(source)

    # Zero unescaped '#RRGGBB' anywhere in generated .tex source
    assert BARE_HEX_COLOR_RE.search(non_comment_source) is None
    # Escaped literal hex strings remain intact as visible text
    assert r"\#0F766E" in non_comment_source
    assert r"\#234E80" in non_comment_source
    # Zero forbidden brackets across full .tex source and compiler diagnostics
    assert FORBIDDEN_BRACKETS_RE.search(source) is None
    for diag in result["diagnostics"]:
        assert FORBIDDEN_BRACKETS_RE.search(diag["message"]) is None
        assert BARE_HEX_COLOR_RE.search(diag["message"]) is None

    for log_snippet in (
        "document.tex:42: Missing $ inserted",
        "document.tex:43: Undefined control sequence",
        "File `missing.sty' not found",
        "Runaway argument?",
        "document.tex:45: Generic TeX failure #0F766E",
    ):
        mapped = latex.compiler_diagnostic(log_snippet, source)
        assert FORBIDDEN_BRACKETS_RE.search(mapped["message"]) is None
        assert BARE_HEX_COLOR_RE.search(mapped["message"]) is None
