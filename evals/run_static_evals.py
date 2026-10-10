#!/usr/bin/env python3
"""Run deterministic repository, visual-governance, and brand-asset evaluations."""

from __future__ import annotations

import ast
import csv
import hashlib
import io
import json
import re
import subprocess
import sys
import tempfile
import warnings
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SKILL = ROOT / "skill" / "zhengda-cup-champion"


def write_submission_audit_fixture(
    path: Path,
    *,
    unsafe: bool,
    presentation: bool = False,
    formatting_revision_only: bool = False,
    malformed_hidden: bool = False,
    custom_xml_hidden: bool = False,
    speaker_notes_text: str | None = None,
    stale_thumbnail: bool = False,
    orphan_media_hidden: bool = False,
    exif_media_hidden: bool = False,
    svg_media_hidden: bool = False,
    geo_media_hidden: bool = False,
    obfuscated_identity: bool = False,
    duplicate_member_hidden: bool = False,
    vba_hidden: bool = False,
    referenced_activex: bool = False,
    renamed_vba_hidden: bool = False,
    macro_content_type_hidden: bool = False,
    external_template_hidden: bool = False,
    uppercase_main_xml_hidden: bool = False,
    gif_media_hidden: bool = False,
    standard_properties_rel: bool = False,
) -> None:
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        if standard_properties_rel:
            archive.writestr(
                "_rels/.rels",
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rIdCore" '
                'Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" '
                'Target="docProps/core.xml"/>'
                '</Relationships>',
            )
            archive.writestr(
                "docProps/core.xml",
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"/>',
            )
        if macro_content_type_hidden:
            archive.writestr(
                "[Content_Types].xml",
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                '<Override PartName="/word/document.xml" '
                'ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/>'
                '</Types>',
            )
        if stale_thumbnail:
            archive.writestr("docProps/thumbnail.jpeg", b"stale cover preview: Team Alpha")
        if orphan_media_hidden:
            archive.writestr("word/media/Team Alpha old-cover.png", b"orphan media fixture")
        relationship_rows: list[str] = []
        if exif_media_hidden:
            from PIL import Image
            image = Image.new("RGB", (2, 2), color=(255, 255, 255))
            exif = Image.Exif()
            exif[315] = "Team Alpha"
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", exif=exif)
            archive.writestr("word/media/image1.jpeg", buffer.getvalue())
            relationship_rows.append('<Relationship Id="rIdMedia1" Type="fixture" Target="media/image1.jpeg"/>')
        if svg_media_hidden:
            archive.writestr(
                "word/media/image2.svg",
                '<svg xmlns="http://www.w3.org/2000/svg"><title>Team Alpha old cover</title><desc>Secret University</desc></svg>',
            )
            relationship_rows.append('<Relationship Id="rIdMedia2" Type="fixture" Target="media/image2.svg"/>')
        if geo_media_hidden:
            from PIL import Image
            from PIL.PngImagePlugin import PngInfo
            image = Image.new("RGB", (2, 2), color=(255, 255, 255))
            png_info = PngInfo()
            png_info.add_itxt(
                "XML:com.adobe.xmp",
                '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:Description xmlns:rdf="rdf" '
                'xmlns:exif="exif" exif:GPSLatitude="30.5" exif:GPSLongitude="114.3"/></x:xmpmeta>',
            )
            buffer = io.BytesIO()
            image.save(buffer, format="PNG", pnginfo=png_info)
            archive.writestr("word/media/image3.png", buffer.getvalue())
            relationship_rows.append('<Relationship Id="rIdMedia3" Type="fixture" Target="media/image3.png"/>')
        if vba_hidden:
            archive.writestr("word/vbaProject.bin", b"macro fixture Team Alpha")
            relationship_rows.append('<Relationship Id="rIdVba" Type="fixture" Target="vbaProject.bin"/>')
        if referenced_activex:
            archive.writestr("word/activeX/activeX1.bin", b"ActiveX fixture Team Alpha")
            relationship_rows.append('<Relationship Id="rIdActiveX" Type="fixture" Target="activeX/activeX1.bin"/>')
        if renamed_vba_hidden:
            archive.writestr("word/foo.bin", b"renamed macro fixture Team Alpha")
            relationship_rows.append(
                '<Relationship Id="rIdRenamedVba" '
                'Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" '
                'Target="foo.bin"/>'
            )
        if external_template_hidden:
            relationship_rows.append(
                '<Relationship Id="rIdTemplate" '
                'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" '
                'Target="https://example.com/template.dotm" TargetMode="External"/>'
            )
        if gif_media_hidden:
            from PIL import Image
            image = Image.new("P", (2, 2), color=1)
            buffer = io.BytesIO()
            image.save(buffer, format="GIF", comment=b"Team Alpha hidden comment")
            archive.writestr("word/media/image4.gif", buffer.getvalue())
            relationship_rows.append('<Relationship Id="rIdMedia4" Type="fixture" Target="media/image4.gif"/>')
        if relationship_rows:
            archive.writestr(
                "word/_rels/document.xml.rels",
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                + "".join(relationship_rows)
                + '</Relationships>',
            )
        if unsafe:
            archive.writestr(
                "docProps/core.xml",
                """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties
 xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:creator>Team Alpha</dc:creator>
  <cp:lastModifiedBy>Reviewer Name</cp:lastModifiedBy>
</cp:coreProperties>""",
            )
        if presentation:
            show = ' show="0"' if unsafe else ""
            archive.writestr(
                "ppt/slides/slide1.xml",
                f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"{show}>
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Safe slide</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>""",
            )
            if unsafe or speaker_notes_text is not None:
                note_text = speaker_notes_text if speaker_notes_text is not None else "Team Alpha"
                archive.writestr(
                    "ppt/notesSlides/notesSlide1.xml",
                    f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>{note_text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:notes>""",
                )
            if unsafe:
                archive.writestr("ppt/embeddings/workbook.xlsx", b"deterministic embedded fixture")
                archive.writestr(
                    "ppt/slides/_rels/slide1.xml.rels",
                    """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="fixture" Target="file:///C:/Users/Named Author/source.xlsx" TargetMode="External"/>
</Relationships>""",
                )
        else:
            if duplicate_member_hidden:
                archive.writestr(
                    "word/document.xml",
                    '<?xml version="1.0" encoding="UTF-8"?>'
                    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                    '<w:body><w:p><w:r><w:t>Team Alpha</w:t></w:r></w:p></w:body></w:document>',
                )
            if obfuscated_identity:
                revision = (
                    "<w:r><w:t>Team\u200b</w:t></w:r><w:r><w:t> Alpha</w:t></w:r>"
                    "<w:r><w:t>Secret</w:t></w:r><w:r><w:t>University</w:t></w:r>"
                )
            elif formatting_revision_only:
                revision = (
                    '<w:pPr><w:pPrChange w:id="1" w:author="Team Alpha"><w:pPr/></w:pPrChange></w:pPr>'
                    "<w:r><w:t>formatting revision only</w:t></w:r>"
                )
            elif unsafe:
                revision = "<w:ins><w:r><w:t>tracked text</w:t></w:r></w:ins>"
            else:
                revision = "<w:r><w:t>clean text</w:t></w:r>"
            archive.writestr(
                "word/document.XML" if uppercase_main_xml_hidden else "word/document.xml",
                f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p>{'<w:r><w:t>Team Alpha</w:t></w:r>' if uppercase_main_xml_hidden else revision}</w:p></w:body>
</w:document>""",
            )
            if malformed_hidden:
                archive.writestr("word/header1.xml", b"<w:hdr>Team Alpha<broken")
            if custom_xml_hidden:
                archive.writestr(
                    "customXml/item1.xml",
                    """<?xml version="1.0" encoding="UTF-8"?>
<identity><team>Team Alpha</team><institution>Secret University</institution></identity>""",
                )


def run(command: list[str], expected: int = 0) -> tuple[bool, str]:
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    ok = result.returncode == expected
    detail = (result.stdout + result.stderr).strip()
    return ok, detail


def run_json(command: list[str], expected: int = 0) -> tuple[bool, dict[str, object] | None, str]:
    ok, detail = run(command, expected=expected)
    if not ok:
        return False, None, detail
    try:
        payload = json.loads(detail)
    except json.JSONDecodeError:
        return False, None, f"command did not return JSON: {detail}"
    if not isinstance(payload, dict):
        return False, None, f"command returned non-object JSON: {detail}"
    return True, payload, detail


def main() -> int:
    failures: list[str] = []
    passes: list[str] = []

    benchmark = json.loads((ROOT / "evals" / "benchmark-tasks.json").read_text(encoding="utf-8"))
    task_ids = [task.get("id") for task in benchmark.get("tasks", [])]
    if len(task_ids) >= 15 and len(task_ids) == len(set(task_ids)):
        passes.append("benchmark task count and IDs")
    else:
        failures.append("benchmark requires at least 15 unique task IDs")
    categories = {task.get("category") for task in benchmark.get("tasks", [])}
    if {"visual-governance", "visual-integrity", "brand-production", "visual-quality"} <= categories:
        passes.append("visual benchmark coverage")
    else:
        failures.append("visual benchmark categories are incomplete")

    rubric = json.loads((ROOT / "evals" / "evaluation-rubric.json").read_text(encoding="utf-8"))
    weights = sum(item.get("weight", 0) for item in rubric.get("dimensions", []))
    if weights == 100:
        passes.append("rubric weights sum to 100")
    else:
        failures.append(f"rubric weights sum to {weights}, expected 100")
    dimension_ids = {item.get("id") for item in rubric.get("dimensions", [])}
    if "visual_integrity_and_craft" in dimension_ids:
        passes.append("visual scoring dimension")
    else:
        failures.append("visual scoring dimension is missing")

    for script in sorted((SKILL / "scripts").rglob("*.py")):
        try:
            ast.parse(script.read_text(encoding="utf-8-sig"), filename=str(script))
        except SyntaxError as exc:
            failures.append(f"syntax: {script.name}: {exc}")
    if not any(item.startswith("syntax:") for item in failures):
        passes.append("all Python scripts parse")

    sys.path.insert(0, str(SKILL / "scripts"))
    try:
        from agent_runtime.audits import _active_registry_rows

        old = {"artifact_id": "ART-OLD", "artifact_type": "report", "status": "final"}
        replacement = {
            "artifact_id": "ART-NEW",
            "artifact_type": "report",
            "status": "final",
            "supersedes_artifact_id": "ART-OLD",
        }
        draft_replacement = dict(replacement, status="draft")
        active_final = _active_registry_rows([old, replacement], {"report"}, final_only=True)
        retained_final = _active_registry_rows([old, draft_replacement], {"report"}, final_only=True)
        if (
            [row.get("artifact_id") for row in active_final] == ["ART-NEW"]
            and [row.get("artifact_id") for row in retained_final] == ["ART-OLD"]
        ):
            passes.append("superseded artifact versions cannot win final audit selection")
        else:
            failures.append(
                "active artifact selection regression: "
                f"active={[row.get('artifact_id') for row in active_final]}, "
                f"retained={[row.get('artifact_id') for row in retained_final]}"
            )
    except Exception as exc:
        failures.append(f"active artifact selection import failed: {exc}")
    finally:
        try:
            sys.path.remove(str(SKILL / "scripts"))
        except ValueError:
            pass

    nested_readmes = [path for path in SKILL.rglob("README.md")]
    if nested_readmes:
        failures.append("skill contains non-entry README files: " + ", ".join(str(path.relative_to(ROOT)) for path in nested_readmes))
    else:
        passes.append("skill uses SKILL.md plus progressive-disclosure references")

    package_config = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    required_distribution_entries = {
        "skill entry": "skill/zhengda-cup-champion/SKILL.md",
        "agent metadata": "skill/zhengda-cup-champion/agents/*.yaml",
        "reference corpus": "skill/zhengda-cup-champion/references/*.md",
        "brand manifest": "skill/zhengda-cup-champion/assets/brand/*.json",
        "brand prompts": "skill/zhengda-cup-champion/assets/brand/prompts/*.md",
        "brand raster assets": "skill/zhengda-cup-champion/assets/brand/raster/*",
    }
    missing_distribution_entries = [
        label for label, entry in required_distribution_entries.items() if entry not in package_config
    ]
    if missing_distribution_entries:
        failures.append(
            "wheel distribution omits required Agent resources: "
            + ", ".join(missing_distribution_entries)
        )
    else:
        passes.append("wheel distribution includes Skill, references, metadata, and brand resources")

    stale_patterns = {
        "legacy color #22C7C9": "#22C7C9",
        "legacy color #E5B64B": "#E5B64B",
        "legacy color #F4EFE5": "#F4EFE5",
        "legacy color #435466": "#435466",
        "legacy color #071725": "#071725",
        "legacy color #102A43": "#102A43",
        "legacy visual.surface field": "visual.surface",
        "unfinished pass-or-fail placeholder": "pass|fail",
    }
    text_suffixes = {".md", ".json", ".yaml", ".yml", ".csv", ".py"}
    stale_hits: list[str] = []
    for path in sorted(SKILL.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in text_suffixes:
            continue
        content = path.read_text(encoding="utf-8-sig")
        for label, pattern in stale_patterns.items():
            if pattern in content:
                stale_hits.append(f"{label} in {path.relative_to(ROOT)}")
    if stale_hits:
        failures.extend(stale_hits)
    else:
        passes.append("canonical modes, colors, and completed prompt records")

    openai_yaml = (SKILL / "agents" / "openai.yaml").read_text(encoding="utf-8")
    resource_errors: list[str] = []
    for key in ("icon_small", "icon_large"):
        match = re.search(rf'^\s*{key}:\s*["\']?([^"\'\r\n]+)', openai_yaml, re.MULTILINE)
        if not match:
            resource_errors.append(f"openai.yaml missing {key}")
            continue
        relative = match.group(1).strip()
        if not (SKILL / relative.removeprefix("./")).is_file():
            resource_errors.append(f"openai.yaml {key} target missing: {relative}")
    if 'brand_color: "#0A1F33"' not in openai_yaml:
        resource_errors.append("openai.yaml canonical brand color is missing")
    if resource_errors:
        failures.extend(resource_errors)
    else:
        passes.append("Agent metadata and UI asset paths")

    fixtures = ROOT / "evals" / "fixtures"
    scripts = SKILL / "scripts"
    ok, payload, detail = run_json(
        [sys.executable, "-X", "utf8", str(scripts / "audit_questionnaire.py"), str(fixtures / "questionnaire.csv")],
        expected=1,
    )
    if ok and isinstance(payload.get("summary"), dict) and payload["summary"].get("errors", 0) >= 2:
        passes.append("questionnaire defects detected")
    else:
        failures.append(f"questionnaire fixture regression: {detail}")

    ok, payload, detail = run_json([
        sys.executable, "-X", "utf8", str(scripts / "audit_dataset.py"), str(fixtures / "dataset.csv"),
        "--id-column", "response_id", "--likert-columns", "Q1,Q2,Q3,Q4",
        "--duration-column", "duration_seconds", "--min-duration", "60",
    ])
    if (
        ok
        and isinstance(payload.get("summary"), dict)
        and payload["summary"].get("exact_duplicate_rows") == 1
        and payload["summary"].get("short_duration_rows") == 2
    ):
        passes.append("survey data defects detected")
    else:
        failures.append(f"dataset fixture regression: {detail}")

    ok, payload, detail = run_json(
        [sys.executable, "-X", "utf8", str(scripts / "audit_report.py"), str(fixtures / "report.md")]
    )
    if ok and isinstance(payload.get("summary"), dict) and payload["summary"].get("errors") == 0:
        passes.append("report audit fixture")
    else:
        failures.append(f"report fixture regression: {detail}")

    with tempfile.TemporaryDirectory(prefix="evi_x_method_contract_") as temp:
        method_fixture = Path(temp) / "method-contract.md"
        method_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n\n方便抽样后，在95%置信水平下代表全国消费者。"
            + "\n采用KANO比较有无提及者的均值。"
            + "\n采用KMeans聚类并命名三类市场。"
            + "\n机器学习预测模型验证了收入直接提升。"
            + "\n相关系数证明二者呈倒 U 型关系。"
            + "\n性别差异存在中介作用。"
            + "\n情景假设新增20%用户，验证了实际提升。\n",
            encoding="utf-8",
        )
        method_ok, method_payload, method_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_report.py"),
            str(method_fixture),
            "--strict-methods",
        ], expected=1)
        method_codes = {
            item.get("code")
            for item in (method_payload or {}).get("issues", [])
            if isinstance(item, dict)
        }
        expected_method_codes = {
            "nonprobability_inference_guard",
            "kano_contract_incomplete",
            "clustering_contract_incomplete",
            "predictive_model_contract_incomplete",
            "nonlinear_claim_without_model_signal",
            "mediation_contract_incomplete",
            "scenario_presented_as_realized",
        }
        safe_kano_fixture = Path(temp) / "safe-kano.md"
        safe_kano_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\nKANO采用正向问题和反向问题，并按KANO评价矩阵计算分类。\n"
            + "\nIdentity marker: Team\u200b Alpha.\n",
            encoding="utf-8",
        )
        nonprobability_model_ci_fixture = Path(temp) / "safe-nonprobability-model-ci.md"
        nonprobability_model_ci_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n本研究采用方便抽样，仅描述达成样本，不代表总体。"
            + "多分类Logistic报告回归系数及95%置信区间。\n",
            encoding="utf-8",
        )
        model_ci_ok, model_ci_payload, model_ci_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_report.py"),
            str(nonprobability_model_ci_fixture),
            "--strict-methods",
        ])
        model_ci_codes = {
            item.get("code")
            for item in (model_ci_payload or {}).get("issues", [])
            if isinstance(item, dict)
        }
        sampling_negative_fixture = Path(temp) / "sampling-inference-negative.md"
        sampling_negative_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n方便抽样。样本不能完全代表全国总体。"
            + "\n配额抽样。本样本不足以代表总体。"
            + "\n便利抽样。不应将结果视为代表全市的估计。\n",
            encoding="utf-8",
        )
        sampling_negative_ok, sampling_negative_payload, sampling_negative_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_report.py"),
            str(sampling_negative_fixture),
            "--strict-methods",
        ])
        sampling_negative_codes = {
            item.get("code")
            for item in (sampling_negative_payload or {}).get("issues", [])
            if isinstance(item, dict)
        }
        sampling_positive_fixture = Path(temp) / "sampling-inference-positive.md"
        sampling_positive_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n方便抽样。结果能够代表武汉市Z世代总体。"
            + "\n配额抽样。结论可推广至全国Z世代。"
            + "\n便利抽样。由此可对全市消费者作出总体推断。\n",
            encoding="utf-8",
        )
        sampling_positive_ok, sampling_positive_payload, sampling_positive_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_report.py"),
            str(sampling_positive_fixture),
            "--strict-methods",
        ], expected=1)
        sampling_positive_codes = {
            item.get("code")
            for item in (sampling_positive_payload or {}).get("issues", [])
            if isinstance(item, dict)
        }
        nonuse_fixture = Path(temp) / "method-nonuse-context.md"
        nonuse_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n既有研究使用KANO模型，但本研究不采用KANO。"
            + "\n未来可考虑机器学习预测收入，本研究未实施。"
            + "\n相关系数不能证明倒U型关系，本文不作该主张。\n",
            encoding="utf-8",
        )
        nonuse_ok, nonuse_payload, nonuse_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_report.py"),
            str(nonuse_fixture),
            "--strict-methods",
        ])
        nonuse_codes = {
            item.get("code")
            for item in (nonuse_payload or {}).get("issues", [])
            if isinstance(item, dict)
        }
        nonuse_forbidden_codes = {
            "kano_contract_incomplete",
            "predictive_model_contract_incomplete",
            "nonlinear_claim_without_model_signal",
        }
        mixed_use_fixture = Path(temp) / "method-mixed-use-context.md"
        mixed_use_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n本研究不采用KANO，而是采用K-means聚类形成画像。"
            + "\n本研究未使用传统回归，改用XGBoost预测收入。\n",
            encoding="utf-8",
        )
        mixed_use_ok, mixed_use_payload, mixed_use_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_report.py"),
            str(mixed_use_fixture),
            "--strict-methods",
        ], expected=1)
        mixed_use_codes = {
            item.get("code")
            for item in (mixed_use_payload or {}).get("issues", [])
            if isinstance(item, dict)
        }
        false_contract_evidence_fixture = Path(temp) / "method-false-contract-evidence.md"
        false_contract_evidence_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n本研究采用KANO分析。我们未设置正向题，未设置反向题，也未使用KANO评价矩阵。"
            + "\n本研究采用K-means聚类。我们未标准化数据；既有研究报告轮廓系数；未来可做稳定性检验。"
            + "\n本研究用XGBoost预测收入，但未划分训练集和测试集；既有研究报告AUC。"
            + "\n本文声称倒U型关系。既有研究使用二次项；本研究未纳入二次项，也没有加入平方项。"
            + "\n本文声称存在中介作用；既有研究使用Bootstrap，本研究未检验间接效应。\n",
            encoding="utf-8",
        )
        false_contract_ok, false_contract_payload, false_contract_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_report.py"),
            str(false_contract_evidence_fixture), "--strict-methods",
        ], expected=1)
        false_contract_codes = {
            item.get("code") for item in (false_contract_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        false_contract_expected = {
            "kano_contract_incomplete",
            "clustering_contract_incomplete",
            "predictive_model_contract_incomplete",
            "nonlinear_claim_without_model_signal",
            "mediation_contract_incomplete",
        }
        same_segment_false_evidence_fixture = Path(temp) / "method-same-segment-false-evidence.md"
        same_segment_false_evidence_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n本研究采用KANO分析。本研究采用访谈且未设置正向题并未设置反向题且未使用KANO评价矩阵。"
            + "\n本研究采用K-means聚类。本研究采用访谈且未标准化、未报告轮廓系数、未设置随机种子。\n",
            encoding="utf-8",
        )
        same_segment_ok, same_segment_payload, same_segment_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_report.py"),
            str(same_segment_false_evidence_fixture), "--strict-methods",
        ], expected=1)
        same_segment_codes = {
            item.get("code") for item in (same_segment_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        contextual_use_fixture = Path(temp) / "method-contextual-current-use.md"
        contextual_use_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n本研究在已有研究基础上采用KANO分析。"
            + "\n参考前人研究后本研究采用K-means聚类。\n",
            encoding="utf-8",
        )
        contextual_use_ok, contextual_use_payload, contextual_use_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_report.py"),
            str(contextual_use_fixture), "--strict-methods",
        ], expected=1)
        contextual_use_codes = {
            item.get("code") for item in (contextual_use_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        reference_only_fixture = Path(temp) / "method-reference-only.md"
        reference_only_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\nKANO模型是需求分类工具，本研究并未采用该方法。\n"
            + "\n参考文献\n[1] 张三. 基于KANO模型的需求研究[J]. 管理评论, 2024.\n"
            + "K-means Clustering for Consumers[J]. 2023.\n",
            encoding="utf-8",
        )
        reference_only_ok, reference_only_payload, reference_only_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_report.py"),
            str(reference_only_fixture), "--strict-methods",
        ])
        reference_only_codes = {
            item.get("code") for item in (reference_only_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        supplement_report_fixture = Path(temp) / "supplement-after-references.md"
        supplement_report_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n本研究采用KANO分析。\n参考文献\n[1] 示例文献。\n",
            encoding="utf-8",
        )
        supplement_fixture = Path(temp) / "registered-method-supplement.md"
        supplement_fixture.write_text(
            "本研究设置正向题和反向题，并使用KANO评价矩阵计算分类。\n",
            encoding="utf-8",
        )
        supplement_ok, supplement_payload, supplement_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_report.py"),
            str(supplement_report_fixture), "--strict-methods", "--supplement", str(supplement_fixture),
        ])
        supplement_codes = {
            item.get("code") for item in (supplement_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        split_run_docx = Path(temp) / "split-run.docx"
        with zipfile.ZipFile(split_run_docx, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "word/document.xml",
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
                '<w:p><w:r><w:t>抽样</w:t></w:r><w:r><w:t>方法</w:t></w:r></w:p>'
                '<w:p><w:r><w:t>本研究采用</w:t></w:r><w:r><w:t>KANO</w:t></w:r><w:r><w:t>分析</w:t></w:r></w:p>'
                '<w:p><w:r><w:t>本研究设置正向题和反向题，并使用KANO评价矩阵计算分类。</w:t></w:r></w:p>'
                '<w:p><w:r><w:t>质量控制 数据分析 对策建议 研究局限</w:t></w:r></w:p>'
                '</w:body></w:document>',
            )
        split_run_ok, split_run_payload, split_run_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_report.py"),
            str(split_run_docx), "--strict-methods",
        ])
        split_run_codes = {
            item.get("code") for item in (split_run_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        distant_sampling_fixture = Path(temp) / "distant-nonprobability-inference.md"
        distant_sampling_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n本研究采用便利抽样。问卷共三部分。进行了数据清洗。"
            + "调查结果代表全国Z世代总体。\n",
            encoding="utf-8",
        )
        distant_sampling_ok, distant_sampling_payload, distant_sampling_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_report.py"),
            str(distant_sampling_fixture), "--strict-methods",
        ], expected=1)
        distant_sampling_codes = {
            item.get("code") for item in (distant_sampling_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        distant_percentage_fixture = Path(temp) / "distant-nonprobability-percentage.md"
        distant_percentage_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n本研究采用方便抽样。问卷共三部分。进行了数据清洗。"
            + "全国Z世代中70%喜欢线下娱乐。\n",
            encoding="utf-8",
        )
        distant_percentage_ok, distant_percentage_payload, distant_percentage_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_report.py"),
            str(distant_percentage_fixture), "--strict-methods",
        ], expected=1)
        distant_percentage_codes = {
            item.get("code") for item in (distant_percentage_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        unrelated_scenario_fixture = Path(temp) / "unrelated-scenario-validation.md"
        unrelated_scenario_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n情景假设痛点下降20%，用于敏感性讨论。"
            + "分类模型在测试集验证了预测性能。\n",
            encoding="utf-8",
        )
        unrelated_scenario_ok, unrelated_scenario_payload, unrelated_scenario_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_report.py"),
            str(unrelated_scenario_fixture), "--strict-methods",
        ])
        unrelated_scenario_codes = {
            item.get("code") for item in (unrelated_scenario_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        comma_unrelated_scenario_fixture = Path(temp) / "comma-unrelated-scenario-validation.md"
        comma_unrelated_scenario_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n情景假设痛点下降20%，分类模型在测试集验证了性能。\n",
            encoding="utf-8",
        )
        comma_unrelated_ok, comma_unrelated_payload, comma_unrelated_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_report.py"),
            str(comma_unrelated_scenario_fixture), "--strict-methods",
        ])
        comma_unrelated_codes = {
            item.get("code") for item in (comma_unrelated_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        linked_scenario_fixture = Path(temp) / "linked-scenario-overclaim.md"
        linked_scenario_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n情景假设收入提升20%，由此验证了收入直接提升。\n",
            encoding="utf-8",
        )
        linked_scenario_ok, linked_scenario_payload, linked_scenario_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_report.py"),
            str(linked_scenario_fixture), "--strict-methods",
        ], expected=1)
        linked_scenario_codes = {
            item.get("code") for item in (linked_scenario_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        causal_no_design_fixture = Path(temp) / "causal-no-design.md"
        causal_no_design_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8") + "\n参与度提升导致满意度提升。\n",
            encoding="utf-8",
        )
        causal_no_design_ok, causal_no_design_payload, causal_no_design_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_report.py"),
            str(causal_no_design_fixture), "--strict-methods",
        ], expected=1)
        causal_no_design_codes = {
            item.get("code") for item in (causal_no_design_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        causal_negated_design_fixture = Path(temp) / "causal-negated-design.md"
        causal_negated_design_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n本研究未采用随机实验，但参与度提升导致满意度提升。\n",
            encoding="utf-8",
        )
        causal_negated_ok, causal_negated_payload, causal_negated_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_report.py"),
            str(causal_negated_design_fixture), "--strict-methods",
        ], expected=1)
        causal_negated_codes = {
            item.get("code") for item in (causal_negated_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        causal_literature_design_fixture = Path(temp) / "causal-literature-design.md"
        causal_literature_design_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n既有研究使用双重差分，但本文结果表明参与度导致满意度提升。\n",
            encoding="utf-8",
        )
        causal_literature_ok, causal_literature_payload, causal_literature_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_report.py"),
            str(causal_literature_design_fixture), "--strict-methods",
        ], expected=1)
        causal_literature_codes = {
            item.get("code") for item in (causal_literature_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        causal_heading_fixture = Path(temp) / "causal-design-heading-only.md"
        causal_heading_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n随机实验的局限\n本研究采用横截面问卷。结果表明教育投入提升了就业率。\n",
            encoding="utf-8",
        )
        causal_heading_ok, causal_heading_payload, causal_heading_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_report.py"),
            str(causal_heading_fixture), "--strict-methods",
        ], expected=1)
        causal_heading_codes = {
            item.get("code") for item in (causal_heading_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        causal_actual_design_fixture = Path(temp) / "causal-actual-design.md"
        causal_actual_design_fixture.write_text(
            (fixtures / "report.md").read_text(encoding="utf-8")
            + "\n本研究采用双重差分，结果显示参与度提升导致满意度提升。\n",
            encoding="utf-8",
        )
        causal_actual_ok, causal_actual_payload, causal_actual_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_report.py"),
            str(causal_actual_design_fixture), "--strict-methods",
        ])
        causal_actual_codes = {
            item.get("code") for item in (causal_actual_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        safe_kano_ok, safe_kano_payload, safe_kano_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_report.py"),
            str(safe_kano_fixture),
            "--strict-methods",
        ])
        safe_kano_codes = {
            item.get("code")
            for item in (safe_kano_payload or {}).get("issues", [])
            if isinstance(item, dict)
        }
        identity_ok, identity_payload, identity_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_report.py"),
            str(safe_kano_fixture),
            "--banned-term",
            "team alpha",
        ], expected=1)
        identity_codes = {
            item.get("code")
            for item in (identity_payload or {}).get("issues", [])
            if isinstance(item, dict)
        }
        if (
            method_ok
            and expected_method_codes <= method_codes
            and safe_kano_ok
            and "kano_contract_incomplete" not in safe_kano_codes
            and model_ci_ok
            and "nonprobability_inference_guard" not in model_ci_codes
            and sampling_negative_ok
            and "nonprobability_inference_guard" not in sampling_negative_codes
            and sampling_positive_ok
            and "nonprobability_inference_guard" in sampling_positive_codes
            and nonuse_ok
            and not (nonuse_forbidden_codes & nonuse_codes)
            and mixed_use_ok
            and {"clustering_contract_incomplete", "predictive_model_contract_incomplete"} <= mixed_use_codes
            and "kano_contract_incomplete" not in mixed_use_codes
            and false_contract_ok
            and false_contract_expected <= false_contract_codes
            and same_segment_ok
            and {"kano_contract_incomplete", "clustering_contract_incomplete"} <= same_segment_codes
            and contextual_use_ok
            and {"kano_contract_incomplete", "clustering_contract_incomplete"} <= contextual_use_codes
            and reference_only_ok
            and not ({"kano_contract_incomplete", "clustering_contract_incomplete"} & reference_only_codes)
            and supplement_ok
            and "kano_contract_incomplete" not in supplement_codes
            and split_run_ok
            and bool((split_run_payload or {}).get("section_signals", {}).get("sampling"))
            and "kano_contract_incomplete" not in split_run_codes
            and distant_sampling_ok
            and "nonprobability_inference_guard" in distant_sampling_codes
            and distant_percentage_ok
            and "nonprobability_inference_guard" in distant_percentage_codes
            and unrelated_scenario_ok
            and "scenario_presented_as_realized" not in unrelated_scenario_codes
            and comma_unrelated_ok
            and "scenario_presented_as_realized" not in comma_unrelated_codes
            and linked_scenario_ok
            and "scenario_presented_as_realized" in linked_scenario_codes
            and causal_no_design_ok
            and "causal_language_without_design_signal" in causal_no_design_codes
            and causal_negated_ok
            and "causal_language_without_design_signal" in causal_negated_codes
            and causal_literature_ok
            and "causal_language_without_design_signal" in causal_literature_codes
            and causal_heading_ok
            and "causal_language_without_design_signal" in causal_heading_codes
            and causal_actual_ok
            and "causal_language_without_design_signal" not in causal_actual_codes
            and identity_ok
            and "banned_identity_term" in identity_codes
        ):
            passes.append("high-risk method-contract signals detected")
        else:
            failures.append(
                f"method-contract audit regression: {method_detail}; "
                f"codes={sorted(str(item) for item in method_codes)}; safe_kano={safe_kano_detail}; "
                f"model_ci={model_ci_detail}; model_ci_codes={sorted(str(item) for item in model_ci_codes)}; "
                f"sampling_negative={sampling_negative_detail}; sampling_negative_codes={sorted(str(item) for item in sampling_negative_codes)}; "
                f"sampling_positive={sampling_positive_detail}; sampling_positive_codes={sorted(str(item) for item in sampling_positive_codes)}; "
                f"nonuse={nonuse_detail}; nonuse_codes={sorted(str(item) for item in nonuse_codes)}; "
                f"mixed_use={mixed_use_detail}; mixed_use_codes={sorted(str(item) for item in mixed_use_codes)}; "
                f"false_contract={false_contract_detail}; false_contract_codes={sorted(str(item) for item in false_contract_codes)}; "
                f"same_segment={same_segment_detail}; same_segment_codes={sorted(str(item) for item in same_segment_codes)}; "
                f"contextual_use={contextual_use_detail}; contextual_use_codes={sorted(str(item) for item in contextual_use_codes)}; "
                f"reference_only={reference_only_detail}; reference_only_codes={sorted(str(item) for item in reference_only_codes)}; "
                f"supplement={supplement_detail}; supplement_codes={sorted(str(item) for item in supplement_codes)}; "
                f"split_run={split_run_detail}; split_run_codes={sorted(str(item) for item in split_run_codes)}; "
                f"distant_sampling={distant_sampling_detail}; distant_sampling_codes={sorted(str(item) for item in distant_sampling_codes)}; "
                f"distant_percentage={distant_percentage_detail}; distant_percentage_codes={sorted(str(item) for item in distant_percentage_codes)}; "
                f"unrelated_scenario={unrelated_scenario_detail}; unrelated_scenario_codes={sorted(str(item) for item in unrelated_scenario_codes)}; "
                f"comma_unrelated={comma_unrelated_detail}; comma_unrelated_codes={sorted(str(item) for item in comma_unrelated_codes)}; "
                f"linked_scenario={linked_scenario_detail}; linked_scenario_codes={sorted(str(item) for item in linked_scenario_codes)}; "
                f"causal_no_design={causal_no_design_detail}; causal_no_design_codes={sorted(str(item) for item in causal_no_design_codes)}; "
                f"causal_negated={causal_negated_detail}; causal_negated_codes={sorted(str(item) for item in causal_negated_codes)}; "
                f"causal_literature={causal_literature_detail}; causal_literature_codes={sorted(str(item) for item in causal_literature_codes)}; "
                f"causal_heading={causal_heading_detail}; causal_heading_codes={sorted(str(item) for item in causal_heading_codes)}; "
                f"causal_actual={causal_actual_detail}; causal_actual_codes={sorted(str(item) for item in causal_actual_codes)}; "
                f"identity={identity_detail}"
            )

    with tempfile.TemporaryDirectory(prefix="evi_x_submission_audit_") as temp:
        temp_path = Path(temp)
        clean_docx = temp_path / "clean.docx"
        unsafe_docx = temp_path / "unsafe.docx"
        unsafe_pptx = temp_path / "unsafe.pptx"
        formatting_docx = temp_path / "formatting-revision-only.docx"
        malformed_docx = temp_path / "malformed-hidden-part.docx"
        custom_xml_docx = temp_path / "custom-xml-hidden.docx"
        benign_notes_pptx = temp_path / "benign-notes.pptx"
        thumbnail_pptx = temp_path / "stale-thumbnail.pptx"
        orphan_media_docx = temp_path / "orphan-media.docx"
        exif_media_docx = temp_path / "exif-media.docx"
        svg_media_docx = temp_path / "svg-media.docx"
        geo_media_docx = temp_path / "geo-media.docx"
        obfuscated_identity_docx = temp_path / "obfuscated-identity.docx"
        duplicate_member_docx = temp_path / "duplicate-member.docx"
        vba_docx = temp_path / "vba.docx"
        activex_docx = temp_path / "activex.docx"
        renamed_vba_docx = temp_path / "renamed-vba.docx"
        macro_content_type_docx = temp_path / "macro-content-type.docx"
        external_template_docx = temp_path / "external-template.docx"
        uppercase_xml_docx = temp_path / "uppercase-main-xml.docx"
        gif_media_docx = temp_path / "gif-media.docx"
        trailer_docx = temp_path / "archive-trailer.docx"
        comment_docx = temp_path / "archive-comment.docx"
        standard_rel_docx = temp_path / "standard-core-properties-rel.docx"
        annotation_pdf = temp_path / "annotation-only.pdf"
        javascript_link_pdf = temp_path / "javascript-link.pdf"
        custom_xmp_pdf = temp_path / "custom-xmp.pdf"
        page_labels_pdf = temp_path / "page-labels.pdf"
        clean_pdf = temp_path / "clean.pdf"
        structure_tree_pdf = temp_path / "structure-tree.pdf"
        incremental_base_pdf = temp_path / "incremental-base.pdf"
        incremental_pdf = temp_path / "incremental.pdf"
        orphan_object_pdf = temp_path / "orphan-object.pdf"
        associated_file_pdf = temp_path / "associated-file.pdf"
        hide_link_pdf = temp_path / "hide-link.pdf"
        xfa_pdf = temp_path / "xfa.pdf"
        object_xmp_pdf = temp_path / "object-xmp.pdf"
        image_exif_pdf = temp_path / "image-exif.pdf"
        page_thumbnail_pdf = temp_path / "page-thumbnail.pdf"
        trailer_pdf = temp_path / "pdf-trailer.pdf"
        write_submission_audit_fixture(clean_docx, unsafe=False)
        write_submission_audit_fixture(unsafe_docx, unsafe=True)
        write_submission_audit_fixture(unsafe_pptx, unsafe=True, presentation=True)
        write_submission_audit_fixture(formatting_docx, unsafe=False, formatting_revision_only=True)
        write_submission_audit_fixture(malformed_docx, unsafe=False, malformed_hidden=True)
        write_submission_audit_fixture(custom_xml_docx, unsafe=False, custom_xml_hidden=True)
        write_submission_audit_fixture(
            benign_notes_pptx,
            unsafe=False,
            presentation=True,
            speaker_notes_text="答辩时提醒翻到下一页",
        )
        write_submission_audit_fixture(
            thumbnail_pptx,
            unsafe=False,
            presentation=True,
            stale_thumbnail=True,
        )
        write_submission_audit_fixture(
            orphan_media_docx,
            unsafe=False,
            orphan_media_hidden=True,
        )
        write_submission_audit_fixture(exif_media_docx, unsafe=False, exif_media_hidden=True)
        write_submission_audit_fixture(svg_media_docx, unsafe=False, svg_media_hidden=True)
        write_submission_audit_fixture(geo_media_docx, unsafe=False, geo_media_hidden=True)
        write_submission_audit_fixture(obfuscated_identity_docx, unsafe=False, obfuscated_identity=True)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            write_submission_audit_fixture(duplicate_member_docx, unsafe=False, duplicate_member_hidden=True)
        write_submission_audit_fixture(vba_docx, unsafe=False, vba_hidden=True)
        write_submission_audit_fixture(activex_docx, unsafe=False, referenced_activex=True)
        write_submission_audit_fixture(renamed_vba_docx, unsafe=False, renamed_vba_hidden=True)
        write_submission_audit_fixture(macro_content_type_docx, unsafe=False, macro_content_type_hidden=True)
        write_submission_audit_fixture(external_template_docx, unsafe=False, external_template_hidden=True)
        write_submission_audit_fixture(uppercase_xml_docx, unsafe=False, uppercase_main_xml_hidden=True)
        write_submission_audit_fixture(gif_media_docx, unsafe=False, gif_media_hidden=True)
        write_submission_audit_fixture(trailer_docx, unsafe=False)
        with trailer_docx.open("ab") as handle:
            handle.write(b"Team Alpha hidden trailer")
        write_submission_audit_fixture(comment_docx, unsafe=False)
        with zipfile.ZipFile(comment_docx, "a") as archive:
            archive.comment = b"Team Alpha hidden comment"
        write_submission_audit_fixture(standard_rel_docx, unsafe=False, standard_properties_rel=True)
        from pypdf import PdfWriter
        from pypdf.generic import (
            ArrayObject, DecodedStreamObject, DictionaryObject, FloatObject,
            NameObject, NumberObject, TextStringObject,
        )

        writer = PdfWriter()
        page = writer.add_blank_page(width=72, height=72)
        annotation = DictionaryObject({
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Text"),
            NameObject("/Rect"): ArrayObject([FloatObject(0), FloatObject(0), FloatObject(20), FloatObject(20)]),
            NameObject("/Contents"): TextStringObject("Team Alpha hidden review note"),
            NameObject("/T"): TextStringObject("Reviewer Zhang"),
        })
        page[NameObject("/Annots")] = ArrayObject([writer._add_object(annotation)])
        writer.add_outline_item("Team Alpha — Secret University", page_number=0)
        with annotation_pdf.open("wb") as handle:
            writer.write(handle)

        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        with clean_pdf.open("wb") as handle:
            writer.write(handle)

        writer = PdfWriter()
        page = writer.add_blank_page(width=72, height=72)
        javascript_action = DictionaryObject({
            NameObject("/S"): NameObject("/JavaScript"),
            NameObject("/JS"): TextStringObject("app.alert('Team Alpha')"),
        })
        link_annotation = DictionaryObject({
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Link"),
            NameObject("/Rect"): ArrayObject([FloatObject(0), FloatObject(0), FloatObject(20), FloatObject(20)]),
            NameObject("/A"): javascript_action,
        })
        page[NameObject("/Annots")] = ArrayObject([writer._add_object(link_annotation)])
        with javascript_link_pdf.open("wb") as handle:
            writer.write(handle)

        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        xmp_stream = DecodedStreamObject()
        xmp_stream.set_data(
            b'<?xml version="1.0"?><x:xmpmeta xmlns:x="adobe:ns:meta/" '
            b'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" '
            b'xmlns:custom="https://example.invalid/custom/"><rdf:RDF><rdf:Description '
            b'custom:TeamName="Team Alpha"/></rdf:RDF></x:xmpmeta>'
        )
        xmp_stream[NameObject("/Type")] = NameObject("/Metadata")
        xmp_stream[NameObject("/Subtype")] = NameObject("/XML")
        writer._root_object[NameObject("/Metadata")] = writer._add_object(xmp_stream)
        with custom_xmp_pdf.open("wb") as handle:
            writer.write(handle)

        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        page_label_dictionary = DictionaryObject({
            NameObject("/Nums"): ArrayObject([
                NumberObject(0),
                DictionaryObject({
                    NameObject("/S"): NameObject("/D"),
                    NameObject("/P"): TextStringObject("Team Alpha-"),
                }),
            ])
        })
        writer._root_object[NameObject("/PageLabels")] = writer._add_object(page_label_dictionary)
        with page_labels_pdf.open("wb") as handle:
            writer.write(handle)

        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        structure_element = DictionaryObject({
            NameObject("/S"): NameObject("/Figure"),
            NameObject("/Alt"): TextStringObject("Team Alpha"),
            NameObject("/ActualText"): TextStringObject("Secret College"),
        })
        structure_root = DictionaryObject({
            NameObject("/Type"): NameObject("/StructTreeRoot"),
            NameObject("/K"): writer._add_object(structure_element),
        })
        writer._root_object[NameObject("/StructTreeRoot")] = writer._add_object(structure_root)
        with structure_tree_pdf.open("wb") as handle:
            writer.write(handle)

        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        writer.add_metadata({"/Author": "Team Alpha", "/Title": "Secret College"})
        with incremental_base_pdf.open("wb") as handle:
            writer.write(handle)
        writer = PdfWriter(str(incremental_base_pdf), incremental=True)
        writer.add_metadata({"/Author": "", "/Title": ""})
        with incremental_pdf.open("wb") as handle:
            writer.write(handle)

        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        writer._add_object(DictionaryObject({NameObject("/Secret"): TextStringObject("Team Alpha")}))
        with orphan_object_pdf.open("wb") as handle:
            writer.write(handle)

        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        embedded_stream = DecodedStreamObject()
        embedded_stream.set_data(b"Team Alpha hidden associated payload")
        embedded_ref = writer._add_object(embedded_stream)
        file_spec = DictionaryObject({
            NameObject("/Type"): NameObject("/Filespec"),
            NameObject("/F"): TextStringObject("Team Alpha evidence.txt"),
            NameObject("/UF"): TextStringObject("Team Alpha evidence.txt"),
            NameObject("/Desc"): TextStringObject("Secret College associated file"),
            NameObject("/AFRelationship"): NameObject("/Data"),
            NameObject("/EF"): DictionaryObject({NameObject("/F"): embedded_ref}),
        })
        writer._root_object[NameObject("/AF")] = ArrayObject([writer._add_object(file_spec)])
        with associated_file_pdf.open("wb") as handle:
            writer.write(handle)

        writer = PdfWriter()
        page = writer.add_blank_page(width=72, height=72)
        hide_action = DictionaryObject({
            NameObject("/S"): NameObject("/Hide"),
            NameObject("/T"): TextStringObject("hidden-field"),
        })
        hide_link = DictionaryObject({
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Link"),
            NameObject("/Rect"): ArrayObject([FloatObject(0), FloatObject(0), FloatObject(20), FloatObject(20)]),
            NameObject("/A"): hide_action,
        })
        page[NameObject("/Annots")] = ArrayObject([writer._add_object(hide_link)])
        with hide_link_pdf.open("wb") as handle:
            writer.write(handle)

        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        xfa_stream = DecodedStreamObject()
        xfa_stream.set_data(b'<xfa:datasets xmlns:xfa="xfa"><team>Team Alpha</team></xfa:datasets>')
        acroform = DictionaryObject({
            NameObject("/Fields"): ArrayObject([]),
            NameObject("/XFA"): writer._add_object(xfa_stream),
        })
        writer._root_object[NameObject("/AcroForm")] = writer._add_object(acroform)
        with xfa_pdf.open("wb") as handle:
            writer.write(handle)

        writer = PdfWriter()
        page = writer.add_blank_page(width=72, height=72)
        object_metadata = DecodedStreamObject()
        object_metadata.set_data(
            b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><creator>Team Alpha</creator></x:xmpmeta>'
        )
        object_metadata[NameObject("/Type")] = NameObject("/Metadata")
        object_metadata[NameObject("/Subtype")] = NameObject("/XML")
        tiny_image = DecodedStreamObject()
        tiny_image.set_data(b"\x00")
        tiny_image[NameObject("/Type")] = NameObject("/XObject")
        tiny_image[NameObject("/Subtype")] = NameObject("/Image")
        tiny_image[NameObject("/Width")] = NumberObject(1)
        tiny_image[NameObject("/Height")] = NumberObject(1)
        tiny_image[NameObject("/ColorSpace")] = NameObject("/DeviceGray")
        tiny_image[NameObject("/BitsPerComponent")] = NumberObject(8)
        tiny_image[NameObject("/Metadata")] = writer._add_object(object_metadata)
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/XObject"): DictionaryObject({NameObject("/Im1"): writer._add_object(tiny_image)}),
        })
        with object_xmp_pdf.open("wb") as handle:
            writer.write(handle)

        from PIL import Image
        jpeg_image = Image.new("RGB", (2, 2), color=(255, 255, 255))
        jpeg_exif = Image.Exif()
        jpeg_exif[315] = "Team Alpha"
        jpeg_buffer = io.BytesIO()
        jpeg_image.save(jpeg_buffer, format="JPEG", exif=jpeg_exif)
        writer = PdfWriter()
        page = writer.add_blank_page(width=72, height=72)
        jpeg_stream = DecodedStreamObject()
        jpeg_stream.set_data(jpeg_buffer.getvalue())
        jpeg_stream[NameObject("/Type")] = NameObject("/XObject")
        jpeg_stream[NameObject("/Subtype")] = NameObject("/Image")
        jpeg_stream[NameObject("/Width")] = NumberObject(2)
        jpeg_stream[NameObject("/Height")] = NumberObject(2)
        jpeg_stream[NameObject("/ColorSpace")] = NameObject("/DeviceRGB")
        jpeg_stream[NameObject("/BitsPerComponent")] = NumberObject(8)
        jpeg_stream[NameObject("/Filter")] = NameObject("/DCTDecode")
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/XObject"): DictionaryObject({NameObject("/Im1"): writer._add_object(jpeg_stream)}),
        })
        with image_exif_pdf.open("wb") as handle:
            writer.write(handle)

        writer = PdfWriter()
        page = writer.add_blank_page(width=72, height=72)
        thumbnail_stream = DecodedStreamObject()
        thumbnail_stream.set_data(b"\x00")
        thumbnail_stream[NameObject("/Type")] = NameObject("/XObject")
        thumbnail_stream[NameObject("/Subtype")] = NameObject("/Image")
        thumbnail_stream[NameObject("/Width")] = NumberObject(1)
        thumbnail_stream[NameObject("/Height")] = NumberObject(1)
        thumbnail_stream[NameObject("/ColorSpace")] = NameObject("/DeviceGray")
        thumbnail_stream[NameObject("/BitsPerComponent")] = NumberObject(8)
        page[NameObject("/Thumb")] = writer._add_object(thumbnail_stream)
        with page_thumbnail_pdf.open("wb") as handle:
            writer.write(handle)

        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        with trailer_pdf.open("wb") as handle:
            writer.write(handle)
        with trailer_pdf.open("ab") as handle:
            handle.write(b"Team Alpha hidden trailer")

        clean_ok, clean_payload, clean_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_submission_files.py"),
            str(clean_docx),
            "--strict",
        ])
        unsafe_ok, unsafe_payload, unsafe_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_submission_files.py"),
            str(unsafe_docx),
            str(unsafe_pptx),
            "--strict",
            "--forbidden-term",
            "Team Alpha",
        ], expected=1)
        empty_directory = temp_path / "empty"
        empty_directory.mkdir()
        empty_ok, empty_detail = run([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_submission_files.py"),
            str(empty_directory),
            "--strict",
        ], expected=2)
        formatting_ok, formatting_payload, formatting_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_submission_files.py"),
            str(formatting_docx),
            "--strict",
            "--forbidden-term",
            "Team Alpha",
        ], expected=1)
        formatting_codes = {
            item.get("code")
            for item in (formatting_payload or {}).get("errors", [])
            if isinstance(item, dict)
        }
        annotation_ok, annotation_payload, annotation_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_submission_files.py"),
            str(annotation_pdf),
            "--strict",
            "--forbidden-term",
            "Team Alpha",
        ], expected=1)
        annotation_codes = {
            item.get("code")
            for item in (annotation_payload or {}).get("errors", [])
            if isinstance(item, dict)
        }
        clean_pdf_ok, clean_pdf_payload, clean_pdf_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(clean_pdf), "--strict",
        ])
        javascript_ok, javascript_payload, javascript_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(javascript_link_pdf), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        javascript_codes = {
            item.get("code") for item in (javascript_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        custom_xmp_ok, custom_xmp_payload, custom_xmp_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(custom_xmp_pdf), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        custom_xmp_codes = {
            item.get("code") for item in (custom_xmp_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        custom_xmp_details = (custom_xmp_payload or {}).get("files", [{}])[0].get("details", {}).get("raw_xmp", {})
        page_labels_ok, page_labels_payload, page_labels_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(page_labels_pdf), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        page_labels_codes = {
            item.get("code") for item in (page_labels_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        page_label_details = (page_labels_payload or {}).get("files", [{}])[0].get("details", {}).get("page_label_strings", [])
        structure_tree_ok, structure_tree_payload, structure_tree_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(structure_tree_pdf), "--strict",
            "--forbidden-term", "Team Alpha", "--forbidden-term", "Secret College",
        ], expected=1)
        structure_tree_codes = {
            item.get("code") for item in (structure_tree_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        structure_tree_details = (structure_tree_payload or {}).get("files", [{}])[0].get("details", {}).get("structure_tree_strings", [])
        incremental_ok, incremental_payload, incremental_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(incremental_pdf), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        incremental_codes = {
            item.get("code") for item in (incremental_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        orphan_object_ok, orphan_object_payload, orphan_object_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(orphan_object_pdf), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        orphan_object_codes = {
            item.get("code") for item in (orphan_object_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        associated_file_ok, associated_file_payload, associated_file_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(associated_file_pdf), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        associated_file_codes = {
            item.get("code") for item in (associated_file_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        hide_link_ok, hide_link_payload, hide_link_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(hide_link_pdf), "--strict",
        ], expected=1)
        hide_link_codes = {
            item.get("code") for item in (hide_link_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        xfa_ok, xfa_payload, xfa_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(xfa_pdf), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        xfa_codes = {
            item.get("code") for item in (xfa_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        malformed_ok, malformed_payload, malformed_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_submission_files.py"),
            str(malformed_docx),
            "--strict",
            "--forbidden-term",
            "Team Alpha",
        ], expected=1)
        malformed_codes = {
            item.get("code")
            for item in (malformed_payload or {}).get("errors", [])
            if isinstance(item, dict)
        }
        custom_xml_ok, custom_xml_payload, custom_xml_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_submission_files.py"),
            str(custom_xml_docx),
            "--strict",
            "--forbidden-term",
            "Team Alpha",
        ], expected=1)
        custom_xml_codes = {
            item.get("code")
            for item in (custom_xml_payload or {}).get("errors", [])
            if isinstance(item, dict)
        }
        benign_notes_ok, benign_notes_payload, benign_notes_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_submission_files.py"),
            str(benign_notes_pptx),
            "--strict",
        ], expected=1)
        benign_notes_codes = {
            item.get("code")
            for item in (benign_notes_payload or {}).get("errors", [])
            if isinstance(item, dict)
        }
        thumbnail_ok, thumbnail_payload, thumbnail_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_submission_files.py"),
            str(thumbnail_pptx),
            "--strict",
        ], expected=1)
        thumbnail_codes = {
            item.get("code")
            for item in (thumbnail_payload or {}).get("errors", [])
            if isinstance(item, dict)
        }
        thumbnail_details = (thumbnail_payload or {}).get("files", [{}])[0].get("details", {}).get("package_thumbnails", [])
        orphan_media_ok, orphan_media_payload, orphan_media_detail = run_json([
            sys.executable,
            "-X",
            "utf8",
            str(scripts / "audit_submission_files.py"),
            str(orphan_media_docx),
            "--strict",
            "--forbidden-term",
            "Team Alpha",
        ], expected=1)
        orphan_media_codes = {
            item.get("code")
            for item in (orphan_media_payload or {}).get("errors", [])
            if isinstance(item, dict)
        }
        exif_media_ok, exif_media_payload, exif_media_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(exif_media_docx), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        exif_media_codes = {
            item.get("code") for item in (exif_media_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        svg_media_ok, svg_media_payload, svg_media_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(svg_media_docx), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        svg_media_codes = {
            item.get("code") for item in (svg_media_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        geo_media_ok, geo_media_payload, geo_media_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(geo_media_docx), "--strict",
        ], expected=1)
        geo_media_codes = {
            item.get("code") for item in (geo_media_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        obfuscated_ok, obfuscated_payload, obfuscated_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(obfuscated_identity_docx), "--strict",
            "--forbidden-term", "Team Alpha", "--forbidden-term", "SecretUniversity",
        ], expected=1)
        obfuscated_codes = {
            item.get("code") for item in (obfuscated_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        duplicate_member_ok, duplicate_member_payload, duplicate_member_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(duplicate_member_docx), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        duplicate_member_codes = {
            item.get("code") for item in (duplicate_member_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        vba_ok, vba_payload, vba_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(vba_docx), "--strict",
        ], expected=1)
        vba_codes = {
            item.get("code") for item in (vba_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        activex_ok, activex_payload, activex_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(activex_docx), "--strict",
        ], expected=1)
        activex_codes = {
            item.get("code") for item in (activex_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        renamed_vba_ok, renamed_vba_payload, renamed_vba_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(renamed_vba_docx), "--strict",
        ], expected=1)
        renamed_vba_codes = {
            item.get("code") for item in (renamed_vba_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        macro_content_type_ok, macro_content_type_payload, macro_content_type_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(macro_content_type_docx), "--strict",
        ], expected=1)
        macro_content_type_codes = {
            item.get("code") for item in (macro_content_type_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        external_template_ok, external_template_payload, external_template_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(external_template_docx), "--strict",
        ], expected=1)
        external_template_codes = {
            item.get("code") for item in (external_template_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        uppercase_xml_ok, uppercase_xml_payload, uppercase_xml_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(uppercase_xml_docx), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        uppercase_xml_codes = {
            item.get("code") for item in (uppercase_xml_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        gif_media_ok, gif_media_payload, gif_media_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(gif_media_docx), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        gif_media_codes = {
            item.get("code") for item in (gif_media_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        trailer_docx_ok, trailer_docx_payload, trailer_docx_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(trailer_docx), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        trailer_docx_codes = {
            item.get("code") for item in (trailer_docx_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        comment_docx_ok, comment_docx_payload, comment_docx_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(comment_docx), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        comment_docx_codes = {
            item.get("code") for item in (comment_docx_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        object_xmp_ok, object_xmp_payload, object_xmp_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(object_xmp_pdf), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        object_xmp_codes = {
            item.get("code") for item in (object_xmp_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        image_exif_ok, image_exif_payload, image_exif_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(image_exif_pdf), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        image_exif_codes = {
            item.get("code") for item in (image_exif_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        page_thumbnail_ok, page_thumbnail_payload, page_thumbnail_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(page_thumbnail_pdf), "--strict",
        ], expected=1)
        page_thumbnail_codes = {
            item.get("code") for item in (page_thumbnail_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        trailer_pdf_ok, trailer_pdf_payload, trailer_pdf_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(trailer_pdf), "--strict", "--forbidden-term", "Team Alpha",
        ], expected=1)
        trailer_pdf_codes = {
            item.get("code") for item in (trailer_pdf_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        standard_rel_ok, standard_rel_payload, standard_rel_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "audit_submission_files.py"),
            str(standard_rel_docx), "--strict",
        ])
        standard_rel_codes = {
            item.get("code") for item in (standard_rel_payload or {}).get("errors", []) if isinstance(item, dict)
        }
        unsafe_codes = {
            item.get("code")
            for item in (unsafe_payload or {}).get("errors", [])
            if isinstance(item, dict)
        }
        expected_codes = {
            "identity_metadata",
            "tracked_changes_present",
            "hidden_slides_present",
            "speaker_notes_present",
            "embedded_files_present",
            "external_local_or_identity_relationships",
            "forbidden_identity_term",
        }
        if (
            clean_ok
            and isinstance(clean_payload, dict)
            and isinstance(clean_payload.get("summary"), dict)
            and clean_payload["summary"].get("passed") is True
            and unsafe_ok
            and expected_codes <= unsafe_codes
            and empty_ok
            and formatting_ok
            and {"tracked_changes_present", "forbidden_identity_term"} <= formatting_codes
            and annotation_ok
            and {"pdf_review_annotations_present", "forbidden_identity_term"} <= annotation_codes
            and "Team Alpha — Secret University" in (annotation_payload or {}).get("files", [{}])[0].get("details", {}).get("outline_entries", [])
            and clean_pdf_ok
            and javascript_ok
            and {"pdf_dangerous_actions_present", "forbidden_identity_term"} <= javascript_codes
            and custom_xmp_ok
            and "forbidden_identity_term" in custom_xmp_codes
            and bool(custom_xmp_details.get("sha256"))
            and page_labels_ok
            and "forbidden_identity_term" in page_labels_codes
            and any("Team Alpha" in str(item) for item in page_label_details)
            and structure_tree_ok
            and "forbidden_identity_term" in structure_tree_codes
            and "Team Alpha" in structure_tree_details
            and "Secret College" in structure_tree_details
            and incremental_ok
            and "pdf_incremental_updates_present" in incremental_codes
            and orphan_object_ok
            and {"pdf_unreachable_objects_present", "forbidden_identity_term"} <= orphan_object_codes
            and associated_file_ok
            and {"pdf_associated_files_present", "forbidden_identity_term"} <= associated_file_codes
            and hide_link_ok
            and "pdf_dangerous_actions_present" in hide_link_codes
            and xfa_ok
            and {"pdf_xfa_present", "forbidden_identity_term"} <= xfa_codes
            and malformed_ok
            and {"unparseable_office_parts", "forbidden_identity_term"} <= malformed_codes
            and custom_xml_ok
            and {"custom_xml_parts_present", "forbidden_identity_term"} <= custom_xml_codes
            and benign_notes_ok
            and "speaker_notes_present" in benign_notes_codes
            and thumbnail_ok
            and "package_thumbnail_present" in thumbnail_codes
            and bool(thumbnail_details)
            and bool(thumbnail_details[0].get("sha256"))
            and orphan_media_ok
            and {"orphan_binary_parts_present", "forbidden_identity_term"} <= orphan_media_codes
            and exif_media_ok
            and {"image_identity_metadata_present", "forbidden_identity_term"} <= exif_media_codes
            and "orphan_binary_parts_present" not in exif_media_codes
            and svg_media_ok
            and "forbidden_identity_term" in svg_media_codes
            and geo_media_ok
            and "image_gps_metadata_present" in geo_media_codes
            and obfuscated_ok
            and "forbidden_identity_term" in obfuscated_codes
            and duplicate_member_ok
            and "duplicate_archive_members" in duplicate_member_codes
            and vba_ok
            and "active_content_present" in vba_codes
            and activex_ok
            and "active_content_present" in activex_codes
            and "orphan_binary_parts_present" not in activex_codes
            and renamed_vba_ok
            and "active_content_present" in renamed_vba_codes
            and macro_content_type_ok
            and "active_content_present" in macro_content_type_codes
            and external_template_ok
            and {"active_content_present", "external_local_or_identity_relationships"} <= external_template_codes
            and uppercase_xml_ok
            and "forbidden_identity_term" in uppercase_xml_codes
            and gif_media_ok
            and {"image_identity_metadata_present", "forbidden_identity_term"} <= gif_media_codes
            and trailer_docx_ok
            and "office_archive_extra_data" in trailer_docx_codes
            and comment_docx_ok
            and {"office_archive_comment_present", "forbidden_identity_term"} <= comment_docx_codes
            and object_xmp_ok
            and "forbidden_identity_term" in object_xmp_codes
            and image_exif_ok
            and {"pdf_image_identity_metadata_present", "forbidden_identity_term"} <= image_exif_codes
            and page_thumbnail_ok
            and "pdf_page_thumbnails_present" in page_thumbnail_codes
            and trailer_pdf_ok
            and "pdf_extra_data_present" in trailer_pdf_codes
            and standard_rel_ok
            and "active_content_present" not in standard_rel_codes
        ):
            passes.append("submission metadata and hidden-content audit")
        else:
            failures.append(
                "submission-file audit regression: "
                f"clean={clean_detail}; unsafe={unsafe_detail}; empty={empty_detail}; "
                f"formatting={formatting_detail}; formatting_codes={sorted(str(item) for item in formatting_codes)}; "
                f"annotation={annotation_detail}; annotation_codes={sorted(str(item) for item in annotation_codes)}; "
                f"clean_pdf={clean_pdf_detail}; "
                f"javascript={javascript_detail}; javascript_codes={sorted(str(item) for item in javascript_codes)}; "
                f"custom_xmp={custom_xmp_detail}; custom_xmp_codes={sorted(str(item) for item in custom_xmp_codes)}; "
                f"page_labels={page_labels_detail}; page_labels_codes={sorted(str(item) for item in page_labels_codes)}; "
                f"structure_tree={structure_tree_detail}; structure_tree_codes={sorted(str(item) for item in structure_tree_codes)}; "
                f"incremental={incremental_detail}; incremental_codes={sorted(str(item) for item in incremental_codes)}; "
                f"orphan_object={orphan_object_detail}; orphan_object_codes={sorted(str(item) for item in orphan_object_codes)}; "
                f"associated_file={associated_file_detail}; associated_file_codes={sorted(str(item) for item in associated_file_codes)}; "
                f"hide_link={hide_link_detail}; hide_link_codes={sorted(str(item) for item in hide_link_codes)}; "
                f"xfa={xfa_detail}; xfa_codes={sorted(str(item) for item in xfa_codes)}; "
                f"malformed={malformed_detail}; malformed_codes={sorted(str(item) for item in malformed_codes)}; "
                f"custom_xml={custom_xml_detail}; custom_xml_codes={sorted(str(item) for item in custom_xml_codes)}; "
                f"benign_notes={benign_notes_detail}; benign_notes_codes={sorted(str(item) for item in benign_notes_codes)}; "
                f"thumbnail={thumbnail_detail}; thumbnail_codes={sorted(str(item) for item in thumbnail_codes)}; "
                f"orphan_media={orphan_media_detail}; orphan_media_codes={sorted(str(item) for item in orphan_media_codes)}; "
                f"exif_media={exif_media_detail}; exif_media_codes={sorted(str(item) for item in exif_media_codes)}; "
                f"svg_media={svg_media_detail}; svg_media_codes={sorted(str(item) for item in svg_media_codes)}; "
                f"geo_media={geo_media_detail}; geo_media_codes={sorted(str(item) for item in geo_media_codes)}; "
                f"obfuscated={obfuscated_detail}; obfuscated_codes={sorted(str(item) for item in obfuscated_codes)}; "
                f"duplicate_member={duplicate_member_detail}; duplicate_member_codes={sorted(str(item) for item in duplicate_member_codes)}; "
                f"vba={vba_detail}; vba_codes={sorted(str(item) for item in vba_codes)}; "
                f"activex={activex_detail}; activex_codes={sorted(str(item) for item in activex_codes)}; "
                f"renamed_vba={renamed_vba_detail}; renamed_vba_codes={sorted(str(item) for item in renamed_vba_codes)}; "
                f"macro_content_type={macro_content_type_detail}; macro_content_type_codes={sorted(str(item) for item in macro_content_type_codes)}; "
                f"external_template={external_template_detail}; external_template_codes={sorted(str(item) for item in external_template_codes)}; "
                f"uppercase_xml={uppercase_xml_detail}; uppercase_xml_codes={sorted(str(item) for item in uppercase_xml_codes)}; "
                f"gif_media={gif_media_detail}; gif_media_codes={sorted(str(item) for item in gif_media_codes)}; "
                f"trailer_docx={trailer_docx_detail}; trailer_docx_codes={sorted(str(item) for item in trailer_docx_codes)}; "
                f"comment_docx={comment_docx_detail}; comment_docx_codes={sorted(str(item) for item in comment_docx_codes)}; "
                f"object_xmp={object_xmp_detail}; object_xmp_codes={sorted(str(item) for item in object_xmp_codes)}; "
                f"image_exif={image_exif_detail}; image_exif_codes={sorted(str(item) for item in image_exif_codes)}; "
                f"page_thumbnail={page_thumbnail_detail}; page_thumbnail_codes={sorted(str(item) for item in page_thumbnail_codes)}; "
                f"trailer_pdf={trailer_pdf_detail}; trailer_pdf_codes={sorted(str(item) for item in trailer_pdf_codes)}; "
                f"standard_rel={standard_rel_detail}; standard_rel_codes={sorted(str(item) for item in standard_rel_codes)}; "
                f"codes={sorted(str(item) for item in unsafe_codes)}"
            )

    ok, payload, detail = run_json(
        [sys.executable, "-X", "utf8", str(scripts / "check_traceability.py"), str(fixtures / "evidence-ledger.csv")]
    )
    if ok and isinstance(payload.get("summary"), dict) and payload["summary"].get("traceability_rate") == 1.0:
        passes.append("claim-to-evidence traceability fixture")
    else:
        failures.append(f"traceability fixture regression: {detail}")

    with tempfile.TemporaryDirectory(prefix="evi_x_traceability_shape_") as temp:
        shape_dir = Path(temp)
        ledger_header = (fixtures / "evidence-ledger.csv").read_text(encoding="utf-8").splitlines()[0]
        header_only = shape_dir / "header-only.csv"
        header_only.write_text(ledger_header + "\n", encoding="utf-8")
        empty_ok, empty_payload, empty_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "check_traceability.py"),
            str(header_only), "--strict",
        ], expected=1)
        empty_codes = {
            item.get("code") for item in (empty_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        rogue = shape_dir / "rogue-trailing-field.csv"
        valid_lines = (fixtures / "evidence-ledger.csv").read_text(encoding="utf-8").splitlines()
        rogue.write_text(valid_lines[0] + "\n" + valid_lines[1] + ",ROGUE_TRAILING_FIELD\n", encoding="utf-8")
        rogue_ok, rogue_payload, rogue_detail = run_json([
            sys.executable, "-X", "utf8", str(scripts / "check_traceability.py"),
            str(rogue), "--strict",
        ], expected=1)
        rogue_codes = {
            item.get("code") for item in (rogue_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        if (
            empty_ok and "empty_evidence_ledger" in empty_codes
            and rogue_ok and "extra_csv_fields" in rogue_codes
        ):
            passes.append("evidence-ledger row-shape and empty-ledger guards")
        else:
            failures.append(
                f"traceability row-shape regression: empty={empty_detail}; empty_codes={sorted(str(item) for item in empty_codes)}; "
                f"rogue={rogue_detail}; rogue_codes={sorted(str(item) for item in rogue_codes)}"
            )

    with tempfile.TemporaryDirectory(prefix="evi_x_fact_ledger_") as temp:
        fact_fixture = Path(temp) / "evidence-ledger.csv"
        fact_fixture.write_text(
            "claim_id,claim,content_class,population,analysis_sample_n,numerator,denominator,unit,reported_value,"
            "evidence_source,data_field,transformation,method,result,limitation,recommendation,output_location,confidence,status\n"
            "CLM-001,达成样本中有经历者占比,actual,目标年龄达成样本,197,137,197,percent,70.1,"
            "data/processed/survey.csv,experience,筛选目标年龄,频数统计,70.1%,非概率样本不外推,按样本描述,"
            "deliverables/report/report.md;deliverables/ppt/deck.md,high,verified\n"
            "CLM-002,情景假设验证了实际提升,simulated,策略情景,197,20,100,percent,20,"
            "analysis/outputs/scenario.json,scenario,人为参数,情景测算,已经实现20%提升,非真实试点,待试点,"
            "deliverables/report/report.md,low,verified\n"
            "CLM-003,达成样本有经历者占70.1%,,,,,,,,data/processed/survey.csv,experience,筛选目标年龄,"
            "频数统计,70.1%,非概率样本不外推,按样本描述,deliverables/report/report.md,high,verified\n"
            "CLM-004,达成样本中二分之一有经历,actual,目标年龄达成样本,2,1,2,percent,NaN,"
            "data/processed/survey.csv,experience,无,频数统计,二分之一,非概率样本不外推,按样本描述,"
            "deliverables/report/report.md,high,verified\n"
            "CLM-005,达成样本量为2,actual,目标年龄达成样本,2,,,count,2,data/processed/survey.csv,"
            "response_id,无,频数统计,样本量为2,仅为fixture,无,deliverables/report/report.md,high,verifiedd\n"
            "CLM-006,拟议样本量为2,proposed,拟议总体,2,,,count,2,project-brief.md,response_id,无,"
            "规划,拟议样本量为2,尚未实施,后续执行,deliverables/report/report.md,low,draft\n"
            "CLM-007,有经历者较多,actual,目标年龄达成样本,197,,,,70.1,data/processed/survey.csv,experience,无,"
            "频数统计,有经历者较多,非概率样本不外推,按样本描述,deliverables/report/report.md,high,verified\n"
            "CLM-008,有经历者达70.1,actual,目标年龄达成样本,197,137,197,points,70.1,data/processed/survey.csv,"
            "experience,无,频数统计,有经历者达70.1,非概率样本不外推,按样本描述,deliverables/report/report.md,"
            "high,verified\n"
            "CLM-009,有效率为99.3%,actual,全部回收问卷,206,204,206,percent,99.3,data/processed/survey.csv,"
            "valid,无,频数统计,有效率为99.3%,按回收口径计算,修正算术,deliverables/report/report.md,high,verified\n"
            "CLM-010,样本量为197.5,actual,达成样本,197.5,,,count,197.5,data/processed/survey.csv,"
            "response_id,计数,频数统计,样本量197.5,样本数应为整数,修正口径,deliverables/report/report.md,high,verified\n",
            encoding="utf-8",
        )
        fact_ok, fact_payload, fact_detail = run_json(
            [sys.executable, "-X", "utf8", str(scripts / "check_traceability.py"), str(fact_fixture)],
            expected=1,
        )
        fact_codes = {
            item.get("code")
            for item in (fact_payload or {}).get("issues", [])
            if isinstance(item, dict)
        }
        strict_fact_ok, strict_fact_payload, strict_fact_detail = run_json(
            [
                sys.executable,
                "-X",
                "utf8",
                str(scripts / "check_traceability.py"),
                str(fact_fixture),
                "--strict",
            ],
            expected=1,
        )
        strict_fact_codes = {
            item.get("code")
            for item in (strict_fact_payload or {}).get("issues", [])
            if isinstance(item, dict)
        }
        legacy_fixture = Path(temp) / "legacy-ledger.csv"
        legacy_fixture.write_text(
            "claim_id,claim,evidence_source,method,result,limitation,output_location,confidence,status\n"
            "LEGACY-001,样本占70.1%,data.csv,频数,70.1%,不可外推,report.md,high,verified\n",
            encoding="utf-8",
        )
        legacy_ok, legacy_payload, legacy_detail = run_json(
            [sys.executable, "-X", "utf8", str(scripts / "check_traceability.py"), str(legacy_fixture)],
            expected=1,
        )
        legacy_missing = {
            item.get("message")
            for item in (legacy_payload or {}).get("issues", [])
            if isinstance(item, dict) and item.get("code") == "missing_column"
        }
        duplicate_header_fixture = Path(temp) / "duplicate-header-ledger.csv"
        duplicate_header_fixture.write_text(
            "claim_id,claim,content_class,population,analysis_sample_n,numerator,denominator,denominator,unit,"
            "reported_value,evidence_source,method,result,limitation,output_location,confidence,status\n",
            encoding="utf-8",
        )
        duplicate_ok, duplicate_payload, duplicate_detail = run_json(
            [sys.executable, "-X", "utf8", str(scripts / "check_traceability.py"), str(duplicate_header_fixture)],
            expected=1,
        )
        duplicate_codes = {
            item.get("code")
            for item in (duplicate_payload or {}).get("issues", [])
            if isinstance(item, dict)
        }
        alias_fixture = Path(temp) / "unit-alias-ledger.csv"
        alias_fixture.write_text(
            "claim_id,claim,content_class,population,analysis_sample_n,numerator,denominator,unit,reported_value,"
            "evidence_source,data_field,transformation,method,result,limitation,recommendation,output_location,confidence,status\n"
            "ALIAS-001,达成样本有经历者占比,actual,目标年龄达成样本,197,137,197,pct,69.5,"
            "data/processed/survey.csv,experience,无,频数统计,69.5%,非概率样本不外推,按样本描述,"
            "deliverables/report/report.md,high,verified\n"
            "ALIAS-002,达成样本有经历者整数百分比,actual,目标年龄达成样本,197,137,197,pct,70,"
            "data/processed/survey.csv,experience,无,频数统计,70%,非概率样本不外推,按样本描述,"
            "deliverables/report/report.md,medium,verified\n"
            "ALIAS-003,资源投入比为1.5,actual,项目投入记录,3,3,2,ratio,1.5,"
            "data/processed/resources.csv,input,求比值,比率,3比2即1.5,仅描述投入记录,保留口径,"
            "deliverables/report/report.md,medium,verified\n",
            encoding="utf-8",
        )
        alias_ok, alias_payload, alias_detail = run_json(
            [sys.executable, "-X", "utf8", str(scripts / "check_traceability.py"), str(alias_fixture)]
        )
        point_fixture = Path(temp) / "percentage-point-ledger.csv"
        point_fixture.write_text(
            "claim_id,claim,content_class,population,analysis_sample_n,numerator,denominator,baseline_numerator,"
            "baseline_denominator,baseline_value,current_numerator,current_denominator,current_value,unit,reported_value,"
            "evidence_source,data_field,transformation,method,result,limitation,recommendation,output_location,confidence,status\n"
            "POINT-001,满意率较基线提高5个百分点,actual,两期达成样本,400,,,180,400,45,200,400,50,percentage_point,5,"
            "analysis/outputs/comparison.csv,satisfaction,分别计算两期满意率后作差,两期比例差,提高5个百分点,"
            "需同时核对两期分子分母,继续试点,deliverables/report/report.md,medium,verified\n",
            encoding="utf-8",
        )
        point_ok, point_payload, point_detail = run_json(
            [sys.executable, "-X", "utf8", str(scripts / "check_traceability.py"), str(point_fixture)]
        )
        point_missing_basis_fixture = Path(temp) / "percentage-point-missing-basis-ledger.csv"
        point_missing_basis_fixture.write_text(
            "claim_id,claim,content_class,population,analysis_sample_n,numerator,denominator,baseline_numerator,"
            "baseline_denominator,baseline_value,current_numerator,current_denominator,current_value,unit,reported_value,"
            "evidence_source,data_field,transformation,method,result,limitation,recommendation,output_location,confidence,status\n"
            "POINT-002,满意率较基线提高5个百分点,actual,两期达成样本,400,,,,,,,,,percentage_point,5,"
            "analysis/outputs/comparison.csv,satisfaction,两期比例作差,difference,提高5个百分点,未登记双基线,补登记,"
            "deliverables/report/report.md,low,verified\n",
            encoding="utf-8",
        )
        point_missing_ok, point_missing_payload, point_missing_detail = run_json(
            [sys.executable, "-X", "utf8", str(scripts / "check_traceability.py"), str(point_missing_basis_fixture)],
            expected=1,
        )
        point_missing_codes = {
            item.get("code") for item in (point_missing_payload or {}).get("issues", []) if isinstance(item, dict)
        }
        point_rounded_fixture = Path(temp) / "percentage-point-rounded-basis-ledger.csv"
        point_rounded_fixture.write_text(
            "claim_id,claim,content_class,population,analysis_sample_n,numerator,denominator,baseline_numerator,"
            "baseline_denominator,baseline_value,current_numerator,current_denominator,current_value,unit,reported_value,"
            "evidence_source,data_field,transformation,method,result,limitation,recommendation,output_location,confidence,status\n"
            "POINT-003,满意率较基线提高6.6个百分点,actual,两期达成样本,197,,,137,197,69.5,150,197,76.1,"
            "percentage_point,6.6,analysis/outputs/comparison.csv,satisfaction,分别计算后按一位小数展示,两期比例差,"
            "提高6.6个百分点,显示值存在舍入,继续试点,deliverables/report/report.md,medium,verified\n",
            encoding="utf-8",
        )
        point_rounded_ok, point_rounded_payload, point_rounded_detail = run_json(
            [sys.executable, "-X", "utf8", str(scripts / "check_traceability.py"), str(point_rounded_fixture)]
        )
        expected_fact_codes = {
            "reported_percentage_mismatch",
            "scenario_claim_overstated",
            "verified_without_content_class",
            "verified_quantitative_fact_incomplete",
            "verified_ratio_without_denominator",
            "percentage_unit_mismatch",
            "invalid_reported_value",
            "unknown_status",
            "denominator_unit_unsupported",
            "non_integer_analysis_sample_n",
        }
        if (
            fact_ok
            and expected_fact_codes <= fact_codes
            and legacy_ok
            and any("denominator" in str(message) for message in legacy_missing)
            and strict_fact_ok
            and "unverified_claim_in_final_output" in strict_fact_codes
            and duplicate_ok
            and "duplicate_column" in duplicate_codes
            and alias_ok
            and point_ok
            and point_missing_ok
            and "percentage_point_basis_missing" in point_missing_codes
            and point_rounded_ok
        ):
            passes.append("denominator math and scenario-language contracts")
        else:
            failures.append(
                f"fact-ledger regression: {fact_detail}; codes={sorted(str(item) for item in fact_codes)}; "
                f"strict={strict_fact_detail}; strict_codes={sorted(str(item) for item in strict_fact_codes)}; "
                f"legacy={legacy_detail}; duplicate={duplicate_detail}; alias={alias_detail}; point={point_detail}; "
                f"point_missing={point_missing_detail}; point_missing_codes={sorted(str(item) for item in point_missing_codes)}"
                f"; point_rounded={point_rounded_detail}"
            )

    rules = ROOT / "corpus-source" / "official-rules" / "edition16-undergrad-rules.json"
    ok, payload, detail = run_json(
        [sys.executable, "-X", "utf8", str(scripts / "compare_rules.py"), str(rules), str(rules)]
    )
    if ok and isinstance(payload.get("summary"), dict) and payload["summary"].get("changed") == 0:
        passes.append("rule snapshot comparison fixture")
    else:
        failures.append(f"rule comparison fixture regression: {detail}")

    with tempfile.TemporaryDirectory(prefix="evi_x_rule_compare_") as temp:
        changed_rules = json.loads(rules.read_text(encoding="utf-8"))
        changed_rules["scopes"][0]["track"] = {"mode": "values", "values": ["企业命题"]}
        changed_rules["sources"][0]["sha256"] = "0" * 64
        changed_path = Path(temp) / "changed-rules.json"
        changed_path.write_text(
            json.dumps(changed_rules, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        ok, payload, detail = run_json(
            [sys.executable, "-X", "utf8", str(scripts / "compare_rules.py"), str(rules), str(changed_path)]
        )
        changed_rows = payload.get("changed", []) if isinstance(payload, dict) else []
        detects_scope = any(
            isinstance(row, dict)
            and isinstance(row.get("differences"), dict)
            and "scope" in row["differences"]
            for row in changed_rows
        )
        detects_source = any(
            isinstance(row, dict)
            and isinstance(row.get("differences"), dict)
            and "source_record" in row["differences"]
            for row in changed_rows
        )
        if ok and detects_scope and detects_source:
            passes.append("structured rule scope and source changes detected")
        else:
            failures.append(f"structured rule comparison regression: {detail}")

    ok, detail = run([sys.executable, "-X", "utf8", str(SKILL / "scripts" / "validate_brand_assets.py")])
    if ok:
        passes.append("brand manifest and assets")
    else:
        failures.append(f"brand validation failed: {detail}")

    with tempfile.TemporaryDirectory(prefix="evi_x_eval_") as temp:
        initialized = Path(temp) / "initialized"
        ok, detail = run([
            sys.executable,
            "-X",
            "utf8",
            str(SKILL / "scripts" / "init_project.py"),
            str(initialized),
            "--title",
            "EVI-X static evaluation",
        ])
        if ok:
            project_yaml = (initialized / "project.yaml").read_text(encoding="utf-8")
            token_payload = json.loads((initialized / "design" / "visual-tokens.json").read_text(encoding="utf-8"))
            mode_match = re.search(r"(?ms)^visual:\s.*?^  mode:\s*(\S+)", project_yaml)
            project_mode = mode_match.group(1) if mode_match else None
            anonymity_match = re.search(r"(?m)^  anonymity_required:\s*(\S+)", project_yaml)
            anonymity_required = anonymity_match.group(1) if anonymity_match else None
            empty_terms = bool(re.search(r"(?m)^  forbidden_identity_terms:\s*\[\]\s*$", project_yaml))
            token_mode = token_payload.get("project_visual_system", {}).get("mode")
            created_files = [path for path in initialized.rglob("*") if path.is_file()]
            created_relatives = {path.relative_to(initialized).as_posix() for path in created_files}
            required_initialized = {
                "project.yaml",
                "project-brief.md",
                "research/research-design.md",
                "deliverables/report/report-outline.md",
                "evidence/evidence-ledger.csv",
                "evidence/ai-use-ledger.csv",
                "evidence/decision-log.md",
                "evidence/preflight-checklist.csv",
                "design/visual-brief.md",
                "design/visual-tokens.json",
                "evidence/visual-asset-ledger.csv",
                "evidence/visual-preflight-checklist.csv",
                "evidence/rules.json",
                "evidence/team-tasks.csv",
                "evidence/blockers.csv",
                "evidence/artifact-registry.csv",
                "evidence/review-queue.csv",
                "reviews/handoff-manifest.json",
                ".agent/config.json",
                ".agent/state.json",
                ".agent/events.jsonl",
            }
            copied_brand_visuals = [path for path in created_files if path.suffix.lower() in {".png", ".svg", ".webp"}]
            if (
                required_initialized <= created_relatives
                and project_mode == token_mode == "competition_submission"
                and anonymity_required == "unknown"
                and empty_terms
                and not copied_brand_visuals
            ):
                passes.append("project initialization and safe visual default")
            else:
                failures.append(
                    "initialized project mismatch: "
                    f"missing={sorted(required_initialized - created_relatives)}, files={len(created_files)}, "
                    f"project_mode={project_mode}, token_mode={token_mode}, "
                    f"anonymity_required={anonymity_required}, empty_terms={empty_terms}, "
                    f"brand_visuals={len(copied_brand_visuals)}"
                )
            audit = SKILL / "scripts" / "audit_visual_package.py"
            audit_ok, audit_detail = run([sys.executable, "-X", "utf8", str(audit), str(initialized)])
            if audit_ok:
                passes.append("empty initialized visual ledger accepted with warning")
            else:
                failures.append(f"initialized visual package audit failed: {audit_detail}")
        else:
            failures.append(f"project initialization failed: {detail}")

        behavior_runner = ROOT / "evals" / "run_behavior_evals.py"
        ok, detail = run([sys.executable, "-X", "utf8", str(behavior_runner), "--validate-only"])
        if ok:
            passes.append("behavior scenario contracts validate")
        else:
            failures.append(f"behavior scenario validation failed: {detail}")

        submission_integration = ROOT / "evals" / "run_submission_integration_test.py"
        ok, detail = run([sys.executable, "-X", "utf8", str(submission_integration)])
        if ok:
            passes.append("unsafe final Office artifact fails aggregate submission Gate")
        else:
            failures.append(f"submission audit integration failed: {detail}")

        project = Path(temp) / "project"
        for relative in ("design/source", "design/exports", "deliverables/visuals", "evidence"):
            (project / relative).mkdir(parents=True, exist_ok=True)
        visual = project / "design" / "exports" / "chart.svg"
        visual.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>\n', encoding="utf-8")
        ledger = project / "evidence" / "visual-asset-ledger.csv"
        with (SKILL / "assets" / "templates" / "visual-asset-ledger.csv").open(
            "r", encoding="utf-8-sig", newline=""
        ) as template_handle:
            fields = next(csv.reader(template_handle))
        visual_hash = hashlib.sha256(visual.read_bytes()).hexdigest()
        with ledger.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerow({
                "asset_id": "COMP-CHART-001", "mode": "competition_submission", "asset_type": "chart",
                "title": "样本分组结果", "purpose": "展示真实调查结果", "content_class": "actual",
                "source_evidence_ids": "EV-001", "ai_generated": "no", "concept_only": "no",
                "third_party_mark_status": "not_applicable", "anonymity_checked": "yes",
                "competition_approved": "yes", "accessibility_status": "pass", "print_status": "not_applicable",
                "width": "100", "height": "100", "unit": "px", "file_path": "design/exports/chart.svg",
                "sha256": visual_hash, "version": "v1", "owner": "eval", "reviewer": "eval",
                "status": "final", "created_at": "2026-08-02", "updated_at": "2026-08-02",
                "notes": "deterministic valid fixture",
            })
        audit = SKILL / "scripts" / "audit_visual_package.py"
        ok, detail = run([sys.executable, "-X", "utf8", str(audit), str(project), "--strict"])
        if ok:
            passes.append("valid visual package accepted")
        else:
            failures.append(f"valid visual package rejected: {detail}")

        with ledger.open("a", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writerow({
                "asset_id": "COMP-FAKE-001", "mode": "competition_submission", "asset_type": "mascot",
                "title": "合成访谈现场", "purpose": "证明完成访谈", "content_class": "actual",
                "source_evidence_ids": "EV-FAKE", "ai_generated": "yes", "ai_use_ledger_id": "AI-001",
                "concept_only": "no", "third_party_mark_status": "not_applicable", "anonymity_checked": "yes",
                "competition_approved": "yes", "accessibility_status": "pass", "print_status": "not_applicable",
                "width": "100", "height": "100", "unit": "px", "file_path": "design/exports/chart.svg",
                "sha256": visual_hash, "version": "v1", "owner": "eval", "reviewer": "eval",
                "status": "final", "created_at": "2026-08-02", "updated_at": "2026-08-02",
                "notes": "deliberately invalid synthetic-evidence fixture",
            })
        ok, detail = run([sys.executable, "-X", "utf8", str(audit), str(project), "--strict"], expected=1)
        if ok:
            passes.append("synthetic evidence and brand leakage rejected")
        else:
            failures.append(f"adversarial visual package was not rejected: {detail}")

    print(json.dumps({"passed": passes, "failures": failures, "success": not failures}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
