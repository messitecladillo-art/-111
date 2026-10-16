"""Synthetic documents exercise real pinned auditor and disposable processes."""
import asyncio
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import sys
import time
import zipfile
import zlib

import pytest
from PIL import Image
from pypdf import PdfWriter
from evix_api import submission_preflight as pf
from evix_api import survey_import as scratch


def office_bytes(format="docx", *, text="中性研究", extra=None):
    word = format == "docx"
    main = "word/document.xml" if word else "ppt/presentation.xml"
    kind = "wordprocessingml.document" if word else "presentationml.presentation"
    root = (f'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>' if word else
            '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>')
    parts = {main: root, "[Content_Types].xml": f'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/{main}" ContentType="application/vnd.openxmlformats-officedocument.{kind}.main+xml"/></Types>'}
    parts["_rels/.rels"] = f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="{main}"/></Relationships>'
    parts.update(extra or {})
    raw = io.BytesIO()
    with zipfile.ZipFile(raw, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, value in parts.items():
            archive.writestr(name, value)
    return raw.getvalue()


def pdf_bytes(*, author=None, encrypted=False):
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.metadata = None
    if author:
        writer.add_metadata({"/Author": author})
    if encrypted:
        writer.encrypt("not-empty")
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def xmp_office_bytes():
    """A linked, synthetic JPEG with numeric-reference identity XMP."""
    encoded_title = "".join(f"&#{ord(char)};" for char in "某某大学")
    xmp = (f'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
           f'<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt>'
           f'<rdf:li xml:lang="x-default">{encoded_title}</rdf:li></rdf:Alt></dc:title>'
           '</rdf:Description></rdf:RDF></x:xmpmeta>').encode()
    buffer = io.BytesIO()
    Image.new("RGB", (1, 1), (128, 128, 128)).save(buffer, format="JPEG")
    jpeg = buffer.getvalue()
    payload = b"http://ns.adobe.com/xap/1.0/\x00" + xmp
    image = jpeg[:2] + b"\xff\xe1" + struct.pack(">H", len(payload) + 2) + payload + jpeg[2:]
    return office_bytes(extra={
        "word/media/image1.jpg": image,
        "word/_rels/document.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.jpg"/></Relationships>',
    })


def parsed(tmp_path, content, format="docx", *, name=None, terms=None):
    path = tmp_path / ("input." + format)
    path.write_bytes(content)
    return pf._report(path, name or ("中性文件." + format), format, terms or [])


def test_terms_js_contract_unicode_order_and_header_bounds():
    terms = ["  ＡＢＣ \u200b大学  ", "abc 大学", "ß", "SS", "x\n y", ""]
    assert pf.normalize_terms(terms) == ["abc 大学", "ß", "ss", "x y"]
    expected = hashlib.sha256('["abc 大学","ß","ss","x y"]'.encode()).hexdigest()
    assert pf.terms_hash(terms) == expected
    header = base64.urlsafe_b64encode(json.dumps(terms, ensure_ascii=False).encode()).decode().rstrip("=")
    assert pf.decode_terms(header) == pf.normalize_terms(terms)
    for bad in [None, "***", "Ww", "e30", "a" * 5463]:
        with pytest.raises(pf.PreflightError):
            pf.decode_terms(bad)
    for bad in [["a" * 65], ["x"] * 129, [0], ["\ud800"], [chr(0)], [str(i) + "某" * 60 for i in range(128)]]:
        with pytest.raises(pf.PreflightError):
            pf.normalize_terms(bad)


@pytest.mark.parametrize("name,format", [("../file.docx", "docx"), ("foo\\file.pdf", "pdf"), ("foo.exe", "pdf"), ("foo.pdf\n", "pdf"), ("foo.docx", "zip"), ("a" * 241 + ".pdf", "pdf")])
def test_names_are_display_only_never_paths(name, format):
    with pytest.raises(pf.PreflightError):
        pf.validate_input(name, format, [])


@pytest.mark.parametrize("format", ["docx", "pptx", "pdf"])
def test_neutral_files_have_honest_manual_coverage(tmp_path, format):
    content = pdf_bytes() if format == "pdf" else office_bytes(format)
    value = parsed(tmp_path, content, format)
    assert value["status"] == "no_issues_in_checked_scope" and value["findings"] == []
    assert value["scope"] == "server-deep" and value["sha256"] == hashlib.sha256(content).hexdigest()
    assert next(row for row in value["coverage"] if row["id"] == "identity_terms")["status"] == "manual"
    assert {row["id"] for row in value["coverage"] if row["status"] == "manual"} == {"identity_terms", "rendered_pixels", "applicable_rules"}
    pf.validate_report(value, name=value["name"], format=format, terms=[], source_bytes=len(content), source_hash=value["sha256"], cleaned=False)


def test_office_author_hidden_parts_and_terms_locate_not_dump_content(tmp_path):
    raw = office_bytes(text="某某大学（验收）", extra={
        "docProps/core.xml": '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>不公开作者值</dc:creator></cp:coreProperties>',
        "word/comments.xml": '<comments>验收批注</comments>', "docProps/thumbnail.png": b"synthetic",
    })
    value = parsed(tmp_path, raw, terms=["某某大学"])
    codes = {row["code"] for row in value["findings"]}
    assert {"identity_metadata", "forbidden_identity_term", "comments_present", "package_thumbnail_present"} <= codes
    assert value["status"] == "issues_found"
    assert any("word/document.xml" in row["location"] for row in value["findings"] if row["code"] == "forbidden_identity_term")
    assert "不公开作者值" not in json.dumps(value, ensure_ascii=False) and str(tmp_path) not in repr(value)


def test_numeric_reference_image_xmp_is_inspected(tmp_path):
    value = parsed(tmp_path, xmp_office_bytes(), terms=["某某大学"])
    assert value["status"] == "issues_found"
    findings = [row for row in value["findings"] if row["code"] == "forbidden_identity_term"]
    assert findings and any("image1.jpg" in row["location"] for row in findings)
    assert "某某大学" not in json.dumps(value, ensure_ascii=False)
    assert next(row for row in value["coverage"] if row["id"] == "metadata")["status"] == "checked"


@pytest.mark.parametrize("module", ["defusedxml", "defusedxml.ElementTree"])
def test_missing_safe_xmp_parser_cannot_claim_checked_coverage(tmp_path, monkeypatch, module):
    monkeypatch.setitem(sys.modules, module, None)
    with pytest.raises(pf.PreflightError) as error:
        parsed(tmp_path, xmp_office_bytes(), terms=["某某大学"])
    assert error.value.code == "preflight_dependency"


async def test_actual_subprocess_numeric_reference_xmp_and_cleanup(tmp_path):
    root = tmp_path / "private"
    value = await pf.audit_bytes(xmp_office_bytes(), name="中性文件.docx", format="docx", terms=["某某大学"], temp_root=root)
    assert value["status"] == "issues_found"
    assert any(row["code"] == "forbidden_identity_term" and "image1.jpg" in row["location"] for row in value["findings"])
    assert list(root.glob("preflight-*")) == []


def test_pdf_author_and_filename_terms(tmp_path):
    value = parsed(tmp_path, pdf_bytes(author="不公开作者值"), "pdf", name="某某大学.pdf", terms=["某某大学"])
    assert {row["code"] for row in value["findings"]} >= {"identity_metadata", "forbidden_identity_term"}
    assert any(row["location"] == "文件名" for row in value["findings"])
    assert "不公开作者值" not in json.dumps(value, ensure_ascii=False)


def test_encrypted_pdf_is_incomplete_not_a_pass(tmp_path):
    value = parsed(tmp_path, pdf_bytes(encrypted=True), "pdf")
    assert value["status"] == "incomplete" and value["findings"][0]["code"] == "encrypted_pdf_unreadable"
    assert any(row["status"] == "not_checked" for row in value["coverage"])


@pytest.mark.parametrize("extra", [{"word/document.xml": "<fake/>"}, {"[Content_Types].xml": "<Types/>"}, {"word/evil.xml": '<!DOCTYPE x [<!ENTITY e "boom">]><x>&e;</x>'}, {"../elsewhere.xml": "<x/>"}])
def test_fake_ooxml_and_dtd_and_path_traversal_rejected(tmp_path, extra):
    with pytest.raises(pf.PreflightError):
        parsed(tmp_path, office_bytes(extra=extra))


def test_raw_zip_and_part_expansion_limit(tmp_path):
    with pytest.raises(pf.PreflightError) as error:
        parsed(tmp_path, office_bytes(extra={"word/large.xml": "x" * (pf.MAX_PART_BYTES + 1)}))
    assert error.value.code == "preflight_limits"
    with pytest.raises(pf.PreflightError):
        parsed(tmp_path, b"PK-invalid-private-body")


def test_forged_prefix_size_and_crc_cannot_hide_inflate_output(tmp_path):
    prefix = b"<data>neutral</data>"
    raw = bytearray(office_bytes(extra={"word/custom.xml": prefix + b"x" * (1024 * 1024)}))
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        info = archive.getinfo("word/custom.xml")
    crc = zlib.crc32(prefix)
    struct.pack_into("<I", raw, info.header_offset + 14, crc)
    struct.pack_into("<I", raw, info.header_offset + 22, len(prefix))
    central = raw.find(b"PK\x01\x02")
    while central >= 0:
        size = struct.unpack_from("<H", raw, central + 28)[0]
        name = raw[central + 46:central + 46 + size]
        if name == b"word/custom.xml":
            struct.pack_into("<I", raw, central + 16, crc)
            struct.pack_into("<I", raw, central + 24, len(prefix))
            break
        central = raw.find(b"PK\x01\x02", central + 4)
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        assert archive.read("word/custom.xml") == prefix  # vulnerable stdlib consumer
    with pytest.raises(pf.PreflightError) as error:
        parsed(tmp_path, bytes(raw))
    assert error.value.code == "preflight_invalid"


def test_unlisted_gap_and_hidden_records_before_central_rejected(tmp_path):
    raw = office_bytes()
    eocd = raw.rfind(b"PK\x05\x06")
    central_start = struct.unpack_from("<I", raw, eocd + 16)[0]
    gap = b"SYNTHETIC-UNDECLARED-private-identity"
    forged = bytearray(raw[:central_start] + gap + raw[central_start:])
    struct.pack_into("<I", forged, eocd + len(gap) + 16, central_start + len(gap))
    with zipfile.ZipFile(io.BytesIO(forged)) as archive:
        assert len(archive.infolist()) == 3 and archive.read("word/document.xml")
    with pytest.raises(pf.PreflightError) as error:
        parsed(tmp_path, bytes(forged))
    assert error.value.code == "preflight_invalid"


@pytest.mark.parametrize("kind", ["extra", "comment"])
def test_uninspectable_entry_extensions_not_silently_accepted(tmp_path, kind):
    original = office_bytes()
    buffer = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(original)) as source, zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for entry in source.infolist():
            if entry.filename == "word/document.xml":
                if kind == "extra":
                    payload = b"SYNTHETIC-PRIVATE"
                    entry.extra = struct.pack("<HH", 0xcafe, len(payload)) + payload
                else:
                    entry.comment = b"SYNTHETIC-PRIVATE"
            archive.writestr(entry, source.read(entry))
    with pytest.raises(pf.PreflightError) as error:
        parsed(tmp_path, buffer.getvalue())
    assert error.value.code == "preflight_zip_extensions"


def test_standard_streaming_data_descriptors_supported(tmp_path):
    class NonSeeking(io.BytesIO):
        def seek(self, *_):
            raise io.UnsupportedOperation()
    buffer = NonSeeking()
    with zipfile.ZipFile(io.BytesIO(office_bytes())) as source, zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for entry in source.infolist():
            archive.writestr(entry.filename, source.read(entry))
    value = parsed(tmp_path, buffer.getvalue())
    assert value["status"] == "no_issues_in_checked_scope"


@pytest.mark.asyncio
@pytest.mark.parametrize("format", ["docx", "pptx", "pdf"])
async def test_actual_subprocess_source_receipt_and_cleanup(tmp_path, format):
    content = pdf_bytes(author="合成验收作者") if format == "pdf" else office_bytes(format)
    events = []
    result = await pf.audit_bytes(content, name="合成测试." + format, format=format, terms=[], temp_root=tmp_path / "private", on_event=events.append)
    assert result["sha256"] == hashlib.sha256(content).hexdigest()
    assert result["cleanup"] == {"completed": True, "reason": "temporary-upload"}
    assert not list((tmp_path / "private").glob("preflight-*"))
    assert [row["status"] for row in events] == ["started", "completed_cleaned"]
    assert all(set(row) == {"importId", "status", "at"} for row in events)


@pytest.mark.asyncio
async def test_actual_failure_cleanup_and_sanitized_error(tmp_path):
    events = []
    with pytest.raises(pf.PreflightError) as error:
        await pf.audit_bytes(b"private-source-malformed", name="test.docx", format="docx", terms=[], temp_root=tmp_path / "private", on_event=events.append)
    assert error.value.code == "preflight_invalid" and "private-source" not in str(error.value)
    assert not list((tmp_path / "private").glob("preflight-*")) and events[-1]["status"] == "failed_cleaned"


@pytest.mark.asyncio
async def test_timeout_kills_actual_worker_before_cleanup(tmp_path, monkeypatch):
    interpreter = scratch._process_executable()
    monkeypatch.setattr(pf, "_worker_command", lambda *_: (interpreter, "-I", "-B", "-c", "import time;time.sleep(20)"))
    with pytest.raises(pf.PreflightError) as error:
        await pf.audit_bytes(office_bytes(), name="test.docx", format="docx", terms=[], temp_root=tmp_path / "private", timeout_seconds=.2)
    assert error.value.code == "preflight_timeout"
    assert not list((tmp_path / "private").glob("preflight-*"))


@pytest.mark.asyncio
async def test_cancel_event_and_repeated_task_cancel_cleanup(tmp_path, monkeypatch):
    interpreter = scratch._process_executable()
    monkeypatch.setattr(pf, "_worker_command", lambda *_: (interpreter, "-I", "-B", "-c", "import time;time.sleep(20)"))
    event = asyncio.Event()
    task = asyncio.create_task(pf.audit_bytes(office_bytes(), name="test.docx", format="docx", terms=[], temp_root=tmp_path / "private", cancel_event=event))
    await asyncio.sleep(.15)
    event.set()
    with pytest.raises(pf.PreflightError) as error:
        await task
    assert error.value.code == "preflight_cancelled" and not list((tmp_path / "private").glob("preflight-*"))
    task = asyncio.create_task(pf.audit_bytes(office_bytes(), name="test.docx", format="docx", terms=[], temp_root=tmp_path / "private"))
    await asyncio.sleep(.15)
    task.cancel()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not list((tmp_path / "private").glob("preflight-*"))


def test_stale_cleanup_only_known_inactive_jobs(tmp_path):
    root = pf._root(tmp_path / "private")
    for number, phase in [(1, "prepared"), (2, "spawning")]:
        identifier = f"{number:032x}"
        job = root / ("preflight-" + identifier)
        job.mkdir()
        scratch._write_lease(job, {"schema": "submission-preflight-lease/v1", "id": identifier, "parentPid": -1, "childPid": None, "phase": phase, "expiresAt": 1})
    foreign = root / "unrelated-project-file"
    foreign.write_text("keep")
    records = pf.cleanup_stale(root, now=1000)
    assert {row["status"] for row in records} == {"removed", "deferred"}
    assert not (root / ("preflight-" + f"{1:032x}")).exists()
    assert (root / ("preflight-" + f"{2:032x}")).exists() and foreign.read_text() == "keep"


def test_pinned_auditor_and_public_schema_reject_unknown(tmp_path, monkeypatch):
    assert hasattr(pf._auditor(), "audit_file")
    monkeypatch.setattr(pf, "AUDITOR_SHA256", "0" * 64)
    with pytest.raises(pf.PreflightError) as error:
        pf._auditor()
    assert error.value.code == "preflight_dependency"


def test_findings_are_capped_and_incomplete(tmp_path, monkeypatch):
    class Auditor:
        def audit_file(self, path, **_):
            return {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size,
                    "findings": [{"level": "error", "code": "identity_metadata", "message": "private", "location": "metadata"}] * 501}
        def forbidden_hits(self, *_):
            return []
    monkeypatch.setattr(pf, "_auditor", lambda: Auditor())
    value = parsed(tmp_path, office_bytes())
    assert value["status"] == "incomplete" and len(value["findings"]) == 500 and value["findings"][-1]["code"] == "findings_capped"
    assert "private" not in repr(value)
