"""Bounded, disposable execution of the repository's canonical submission auditor.

The adapter supplies admission limits and a small public report. It never rewrites
the auditor's rules, executes document content, extracts archives, or stores files
in projects. Windows isolation is a separate interpreter and private DACL, not an
OS sandbox. Linux workers additionally have CPU/address-space/file-size limits.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import importlib.util
import json
import math
import os
import re
import shutil
import struct
import sys
import time
import unicodedata
import uuid
import zipfile
import zlib
from xml.etree import ElementTree
from pathlib import Path
from typing import Any, Callable

if __package__:
    from . import survey_import as scratch
else:
    # Only the trusted application's source root is added, never the upload dir.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from evix_api import survey_import as scratch

AUDITOR_SHA256 = "c77acd91592f71933c668b3c57ba6cca82ebcfecc3994b5babf1607edee0ae05"
MAX_BYTES = 20 * 1024 * 1024
MAX_RESULT_BYTES = 2 * 1024 * 1024
MAX_ZIP_ENTRIES = 2000
MAX_EXPANDED_BYTES = 64 * 1024 * 1024
MAX_PART_BYTES = 8 * 1024 * 1024
MAX_PDF_OBJECTS = 50_000
MAX_FINDINGS = 500
MAX_TIMEOUT_SECONDS = 35
JOB_NAME = re.compile(r"^preflight-([a-f0-9]{32})$")
GRACE_SECONDS = MAX_TIMEOUT_SECONDS + 120
MESSAGES = {
    "preflight_empty": "请选择需要检查的文件。",
    "preflight_too_large": "文件超过 20 MiB，请精简后重试。",
    "preflight_limits": "文件展开规模超过检查上限，请精简后重试。",
    "preflight_invalid": "无法完整读取文件，请从原软件重新导出后重试。",
    "preflight_dependency": "检查依赖尚未就绪，请联系管理员。",
    "preflight_timeout": "文件检查超时，请精简后重试。",
    "preflight_cancelled": "文件检查已取消，可以重新选择。",
    "preflight_worker_failed": "检查进程未完成，请稍后重试。",
    "preflight_temp_unavailable": "临时处理空间不可用，请联系管理员。",
    "preflight_cleanup_failed": "临时文件未能清理，请联系管理员。",
    "preflight_input": "文件名称、格式或检查词设置无效，请重新选择。",
    "preflight_zip_extensions": "文件包含不支持的 ZIP 扩展或条目注释，请重新导出标准 Office 文件。",
}


class PreflightError(Exception):
    def __init__(self, code: str):
        self.code = code if code in MESSAGES else "preflight_worker_failed"
        self.message = MESSAGES[self.code]
        super().__init__(self.message)


def _json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, allow_nan=False,
                      separators=(",", ":")).encode("utf-8")


def _units(value: str) -> int:
    try:
        return len(value.encode("utf-16-le")) // 2
    except UnicodeError:
        raise PreflightError("preflight_input") from None


def normalize_terms(terms: Any) -> list[str]:
    if not isinstance(terms, list) or len(terms) > 128:
        raise PreflightError("preflight_input")
    result = []
    for term in terms:
        if not isinstance(term, str) or _units(term) > 64:
            raise PreflightError("preflight_input")
        # Match the browser contract (lower(), not casefold(): ß must stay ß).
        normalized = unicodedata.normalize("NFKC", term)
        normalized = "".join(c for c in normalized if unicodedata.category(c) != "Cf")
        normalized = re.sub(r"[ \t\n\r\f\v\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+", " ", normalized).strip(" ").lower()
        if _units(normalized) > 64 or any(unicodedata.category(c) == "Cc" for c in normalized):
            raise PreflightError("preflight_input")
        if normalized and normalized not in result:
            result.append(normalized)
    if len(_json(result)) > 4096:
        raise PreflightError("preflight_input")
    return result


def terms_hash(terms: list[str]) -> str:
    return hashlib.sha256(_json(normalize_terms(terms))).hexdigest()


def decode_terms(header: str | None) -> list[str]:
    if not isinstance(header, str) or len(header) > 5462 or not re.fullmatch(r"[A-Za-z0-9_-]+", header):
        raise PreflightError("preflight_input")
    try:
        raw = base64.b64decode(header + "=" * (-len(header) % 4), altchars=b"-_", validate=True)
        if len(raw) > 4096:
            raise ValueError()
        return normalize_terms(json.loads(raw.decode("utf-8")))
    except (ValueError, UnicodeError):
        raise PreflightError("preflight_input") from None


def validate_input(name: Any, format: Any, terms: Any) -> tuple[str, str, list[str]]:
    if (format not in {"docx", "pptx", "pdf"} or not isinstance(name, str)
            or not 1 <= _units(name) <= 240 or name != name.strip()
            or any(c in name for c in "/\\")
            or any(unicodedata.category(c).startswith("C") for c in name)
            or not name.lower().endswith("." + format)):
        raise PreflightError("preflight_input")
    return name, format, normalize_terms(terms)


def _auditor():
    packaged = Path(__file__).with_name("_submission_auditor.py")
    source = Path(__file__).resolve().parents[4] / "skill/zhengda-cup-champion/scripts/audit_submission_files.py"
    path = packaged if packaged.is_file() else source
    if not path.is_file() or scratch._is_link(path) or hashlib.sha256(path.read_bytes()).hexdigest() != AUDITOR_SHA256:
        raise PreflightError("preflight_dependency")
    spec = importlib.util.spec_from_file_location("evix_canonical_submission_auditor", path)
    if spec is None or spec.loader is None:
        raise PreflightError("preflight_dependency")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _zip_layout(path: Path, archive: zipfile.ZipFile, entries: list[zipfile.ZipInfo]) -> None:
    """Require a complete, contiguous standard ZIP record layout.

    ZipFile can ignore unlisted bytes before the central directory. Every byte
    must instead belong to a listed local record, optional data descriptor,
    central record, EOCD or its explicit comment. Multi-disk/ZIP64 directory
    records are unnecessary under these bounds and are rejected.
    """
    raw = path.read_bytes()
    eocd = raw.rfind(b"PK\x05\x06")
    if eocd < 0 or eocd + 22 > len(raw):
        raise PreflightError("preflight_invalid")
    fields = struct.unpack_from("<4s4H2IH", raw, eocd)
    _, disk, central_disk, disk_count, count, central_size, central_start, comment_size = fields
    if (disk or central_disk or disk_count != count or count != len(entries)
            or count == 65535 or central_start == 0xffffffff or central_size == 0xffffffff
            or eocd + 22 + comment_size != len(raw) or central_start + central_size != eocd
            or archive.start_dir != central_start):
        raise PreflightError("preflight_invalid")
    cursor = 0
    for info in sorted(entries, key=lambda row: row.header_offset):
        if info.extra or info.comment:
            raise PreflightError("preflight_zip_extensions")
        if info.header_offset != cursor or cursor + 30 > central_start:
            raise PreflightError("preflight_invalid")
        header = struct.unpack_from("<4s5H3I2H", raw, cursor)
        signature, _, flags, method, _, _, crc, compressed, expanded, name_size, extra_size = header
        if signature != b"PK\x03\x04" or flags != info.flag_bits or method != info.compress_type:
            raise PreflightError("preflight_invalid")
        end_header = cursor + 30 + name_size + extra_size
        if end_header > central_start:
            raise PreflightError("preflight_invalid")
        if extra_size:
            raise PreflightError("preflight_zip_extensions")
        zip64 = compressed == 0xffffffff or expanded == 0xffffffff
        if zip64:
            raise PreflightError("preflight_zip_extensions")
        cursor = end_header + info.compress_size
        if cursor > central_start:
            raise PreflightError("preflight_invalid")
        if flags & 8:
            signature_size = 4 if raw[cursor:cursor + 4] == b"PK\x07\x08" else 0
            size = 20 if zip64 else 12
            if cursor + signature_size + size > central_start:
                raise PreflightError("preflight_invalid")
            descriptor = struct.unpack_from("<IQQ" if zip64 else "<III", raw, cursor + signature_size)
            if descriptor != (info.CRC, info.compress_size, info.file_size):
                raise PreflightError("preflight_invalid")
            cursor += signature_size + size
        elif (crc, compressed, expanded) != (info.CRC, info.compress_size, info.file_size):
            raise PreflightError("preflight_invalid")
    if cursor != central_start:
        raise PreflightError("preflight_invalid")
    for _ in range(count):
        if cursor + 46 > eocd or raw[cursor:cursor + 4] != b"PK\x01\x02":
            raise PreflightError("preflight_invalid")
        name_size, extra_size, entry_comment = struct.unpack_from("<HHH", raw, cursor + 28)
        cursor += 46 + name_size + extra_size + entry_comment
        if cursor > eocd:
            raise PreflightError("preflight_invalid")
    if cursor != eocd:
        raise PreflightError("preflight_invalid")


def _bounded_zip_chunks(archive: zipfile.ZipFile, info: zipfile.ZipInfo):
    """Read the entire compressed stream; ZipExtFile truncates at declared size.

    A forged file_size/CRC can make ZipExtFile accept a valid prefix and silently
    discard a larger DEFLATE output. Validate eof, full output, CRC and lengths
    ourselves before the canonical auditor performs ordinary archive reads.
    """
    handle = archive.fp
    handle.seek(info.header_offset)
    header = handle.read(30)
    if len(header) != 30 or header[:4] != b"PK\x03\x04":
        raise PreflightError("preflight_invalid")
    fields = struct.unpack("<4s5H3I2H", header)
    flags, method, name_bytes, extra_bytes = fields[2], fields[3], fields[-2], fields[-1]
    encoded_name = handle.read(name_bytes)
    try:
        local_name = encoded_name.decode("utf-8" if flags & 0x800 else "cp437")
    except UnicodeError:
        raise PreflightError("preflight_invalid") from None
    if (local_name != info.orig_filename or flags & 1 or method != info.compress_type
            or method not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}
            or info.compress_size < 0 or info.compress_size > MAX_BYTES):
        raise PreflightError("preflight_invalid")
    handle.seek(extra_bytes, 1)
    remaining, actual, crc = info.compress_size, 0, 0
    decoder = zlib.decompressobj(-15) if method == zipfile.ZIP_DEFLATED else None
    while remaining:
        compressed = handle.read(min(64 * 1024, remaining))
        if not compressed:
            raise PreflightError("preflight_invalid")
        remaining -= len(compressed)
        while compressed:
            try:
                chunk = decoder.decompress(compressed, 64 * 1024) if decoder else compressed
            except zlib.error:
                raise PreflightError("preflight_invalid") from None
            compressed = decoder.unconsumed_tail if decoder else b""
            actual += len(chunk)
            if actual > MAX_PART_BYTES:
                raise PreflightError("preflight_limits")
            crc = zlib.crc32(chunk, crc)
            if chunk:
                yield chunk
            if decoder and decoder.unused_data:
                raise PreflightError("preflight_invalid")
    if (decoder is not None and not decoder.eof or actual != info.file_size
            or (crc & 0xffffffff) != info.CRC):
        raise PreflightError("preflight_invalid")


def _office_bounds(path: Path, format: str) -> None:
    total = 0
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_ZIP_ENTRIES:
                raise PreflightError("preflight_limits")
            _zip_layout(path, archive, entries)
            names = {info.filename for info in entries}
            expected = "word/document.xml" if format == "docx" else "ppt/presentation.xml"
            other = "ppt/presentation.xml" if format == "docx" else "word/document.xml"
            if (expected not in names or "[Content_Types].xml" not in names or "_rels/.rels" not in names
                    or other in names or "xl/workbook.xml" in names):
                raise PreflightError("preflight_invalid")
            for info in entries:
                if (info.flag_bits & 1 or info.file_size < 0 or info.file_size > MAX_PART_BYTES
                        or (info.external_attr >> 16) & 0o170000 == 0o120000
                        or info.filename.startswith(("/", "\\")) or "\\" in info.filename
                        or ".." in info.filename.split("/") or "\x00" in info.filename):
                    raise PreflightError("preflight_limits")
                total += info.file_size
                if total > MAX_EXPANDED_BYTES:
                    raise PreflightError("preflight_limits")
            # Stream all entries before the auditor's unbounded ZipFile.read.
            # This validates actual expansion and CRC, not only central sizes.
            actual_total = 0
            for info in entries:
                actual, tail = 0, b""
                xml = info.filename.lower().endswith((".xml", ".rels"))
                for chunk in _bounded_zip_chunks(archive, info):
                    actual += len(chunk)
                    actual_total += len(chunk)
                    if actual > MAX_PART_BYTES or actual_total > MAX_EXPANDED_BYTES:
                        raise PreflightError("preflight_limits")
                    if xml:
                        probe = (tail + chunk).replace(b"\x00", b"").upper()
                        if b"<!DOCTYPE" in probe or b"<!ENTITY" in probe:
                            raise PreflightError("preflight_invalid")
                        tail = chunk[-32:]
                if actual != info.file_size:
                    raise PreflightError("preflight_invalid")
            main = ElementTree.fromstring(archive.read(expected))
            accepted_roots = ({"{http://schemas.openxmlformats.org/wordprocessingml/2006/main}document",
                               "{http://purl.oclc.org/ooxml/wordprocessingml/main}document"} if format == "docx" else
                              {"{http://schemas.openxmlformats.org/presentationml/2006/main}presentation",
                               "{http://purl.oclc.org/ooxml/presentationml/main}presentation"})
            types = ElementTree.fromstring(archive.read("[Content_Types].xml"))
            type_ns = "http://schemas.openxmlformats.org/package/2006/content-types"
            expected_type = ("application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" if format == "docx" else
                             "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml")
            declarations = [row for row in types if row.tag == "{" + type_ns + "}Override" and row.get("PartName") == "/" + expected]
            rels = ElementTree.fromstring(archive.read("_rels/.rels"))
            rel_ns = "http://schemas.openxmlformats.org/package/2006/relationships"
            office_types = {"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
                            "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument"}
            root_office = [row for row in rels if row.tag == "{" + rel_ns + "}Relationship" and row.get("Type") in office_types]
            if (main.tag not in accepted_roots or types.tag != "{" + type_ns + "}Types"
                    or len(declarations) != 1 or declarations[0].get("ContentType") != expected_type
                    or rels.tag != "{" + rel_ns + "}Relationships" or len(root_office) != 1
                    or root_office[0].get("Target", "").lstrip("/") != expected
                    or root_office[0].get("TargetMode", "Internal") != "Internal"
                    or format == "docx" and not any(row.tag in {"{http://schemas.openxmlformats.org/wordprocessingml/2006/main}body",
                            "{http://purl.oclc.org/ooxml/wordprocessingml/main}body"} for row in main)):
                raise PreflightError("preflight_invalid")
    except PreflightError:
        raise
    except (OSError, zipfile.BadZipFile, RuntimeError, NotImplementedError, ElementTree.ParseError):
        raise PreflightError("preflight_invalid") from None


FINDING_MESSAGES = {
    "identity_metadata": "文件属性中保留了身份信息，请清理对应字段。",
    "forbidden_identity_term": "发现匹配的身份检查词，请核对并移除。",
    "office_archive_extra_data": "Office 文件含额外前后数据或不一致的 ZIP 边界。",
    "office_archive_comment_present": "ZIP 包注释仍有内容，请从最终文件中清除。",
    "duplicate_archive_members": "ZIP 包存在同名部件，读取结果可能不一致。",
    "casefold_archive_member_collision": "部件名称在 Unicode 规范化后发生冲突。",
    "comments_present": "文件中仍有批注，请清理后重新导出。",
    "tracked_changes_present": "文件中仍有修订记录，请确认修改并清理。",
    "custom_xml_parts_present": "文件含自定义 XML，需检查隐藏内容。",
    "package_thumbnail_present": "文件包保留了缩略图，请从最终文件中清除。",
    "hidden_slides_present": "演示文稿含隐藏页，请检查并清理。",
    "speaker_notes_present": "演示文稿含非空讲稿备注，请单独保存后清理。",
    "active_content_present": "文件含宏、活动内容或相关声明，请移除。",
    "embedded_files_present": "文件含嵌入对象，需核对其内容和身份信息。",
    "orphan_binary_parts_present": "文件包有未引用的二进制部件，请检查并移除。",
    "external_local_or_identity_relationships": "文件保留本地路径、邮箱或非网页外链。",
    "external_web_relationships_present": "文件保留网页外链，请核对链接目标。",
    "image_identity_metadata_present": "图片元数据含身份字段，请清理。",
    "image_gps_metadata_present": "图片元数据含定位信息，请清理。",
    "unparseable_media_images": "部分图片元数据未能完整检查，请人工核对。",
    "unparseable_office_parts": "部分 Office XML 部件未能完整读取。",
    "encrypted_pdf_unreadable": "加密 PDF 无法完整检查，请导出可读取的版本。",
    "software_metadata_present": "PDF 保留软件生成字段，请核对提交要求。",
    "pdf_extra_data_present": "PDF 含额外前后数据或物理边界异常。",
    "pdf_incremental_updates_present": "PDF 保留增量修改历史，请重新生成最终版本。",
    "pdf_xmp_uninspectable": "PDF XMP 元数据未能完整检查。",
    "pdf_hidden_metadata_uninspectable": "PDF 隐藏元数据或图片流未能完整检查。",
    "pdf_image_identity_metadata_present": "PDF 图片元数据含身份信息，请清理。",
    "pdf_image_gps_metadata_present": "PDF 图片元数据含定位信息，请清理。",
    "pdf_attachments_present": "PDF 含附件，请核对并移除。",
    "pdf_associated_files_present": "PDF 含关联文件，请核对并移除。",
    "pdf_javascript_present": "PDF 含 JavaScript，请移除活动内容。",
    "pdf_dangerous_actions_present": "PDF 含启动、提交或外部访问等动作。",
    "pdf_document_actions_present": "PDF 保留文档动作，请移除。",
    "pdf_form_fields_present": "PDF 含表单字段，请转为静态内容。",
    "pdf_xfa_present": "PDF 含 XFA 动态表单，请转为静态内容。",
    "pdf_optional_content_present": "PDF 含可选隐藏图层，请核对并清理。",
    "pdf_page_thumbnails_present": "PDF 页面保留缩略图，请从最终文件中清除。",
    "pdf_review_annotations_present": "PDF 含审阅批注，请清理。",
    "pdf_unreachable_objects_present": "PDF 含未引用对象，可能残留旧内容。",
    "pdf_structure_uninspectable": "PDF 结构未能完整检查。",
    "pdf_object_graph_uninspectable": "PDF 对象关系未能完整遍历。",
}
INCOMPLETE_CODES = {code for code in FINDING_MESSAGES
                    if "uninspectable" in code or "unparseable" in code} | {"encrypted_pdf_unreadable"}


def _safe_location(value: Any, path: Path) -> str:
    if not isinstance(value, str):
        return "文件结构"
    value = value.replace(str(path), "文件").replace(str(path.parent), "临时文件")
    value = re.sub(r"[\x00-\x1f\x7f-\x9f]", " ", value)
    return _truncate_units(value, 500) or "文件结构"


def _truncate_units(value: str, limit: int) -> str:
    result, units = [], 0
    for character in value:
        width = _units(character)
        if units + width > limit:
            break
        result.append(character)
        units += width
    return "".join(result)


def _report(path: Path, name: str, format: str, terms: list[str]) -> dict[str, Any]:
    try:
        import PIL
        import pypdf
        import defusedxml
        # Pillow otherwise silently returns an empty XMP dictionary. Require
        # its optional safe XML parser before claiming image metadata coverage.
        import defusedxml.ElementTree
    except ImportError:
        raise PreflightError("preflight_dependency") from None
    if (PIL.__version__ != "12.3.0" or pypdf.__version__ != "6.20.1"
            or defusedxml.__version__ != "0.7.1"):
        raise PreflightError("preflight_dependency")
    auditor = _auditor()
    if format in {"docx", "pptx"}:
        _office_bounds(path, format)
    else:
        # Bound xref enumeration before canonical full-object traversal. Parsing
        # itself remains under the process deadline and Linux resource bounds.
        reader_type = pypdf.PdfReader
        class BoundedReader(reader_type):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                count = sum(len(v) for v in self.xref.values()) + len(self.xref_objStm)
                if count > MAX_PDF_OBJECTS:
                    raise PreflightError("preflight_limits")
        pypdf.PdfReader = BoundedReader
    try:
        raw = auditor.audit_file(path, strict=True, terms=terms)
    finally:
        if format == "pdf":
            pypdf.PdfReader = reader_type
    if (not isinstance(raw, dict) or raw.get("sha256") != hashlib.sha256(path.read_bytes()).hexdigest()
            or raw.get("bytes") != path.stat().st_size or not isinstance(raw.get("findings"), list)):
        raise PreflightError("preflight_worker_failed")
    items = [*raw["findings"], *auditor.forbidden_hits(terms, [("文件名", name)])]
    findings = []
    for item in items[:MAX_FINDINGS]:
        if not isinstance(item, dict) or item.get("code") not in FINDING_MESSAGES or item.get("level") not in {"error", "warning"}:
            raise PreflightError("preflight_worker_failed")
        entry = {"level": item["level"], "code": item["code"],
                 "message": FINDING_MESSAGES[item["code"]],
                 "location": _safe_location(item.get("location"), path)}
        if isinstance(item.get("field"), str):
            entry["field"] = _truncate_units(_safe_location(item["field"], path), 120)
        findings.append(entry)
    codes = {row["code"] for row in findings}
    incomplete = bool(codes & INCOMPLETE_CODES)
    if len(items) > MAX_FINDINGS:
        incomplete = True
        findings = findings[:MAX_FINDINGS - 1] + [{"level": "warning", "code": "findings_capped",
                    "message": "发现项目超过 500 条，请处理现有问题后重新检查。", "location": "检查结果"}]
    coverage = [
        {"id": "physical_boundary", "label": "文件物理边界", "status": "checked", "detail": "检查文件边界及额外内容。"},
        {"id": "metadata", "label": "文件与图片元数据", "status": "not_checked" if codes & INCOMPLETE_CODES else "checked", "detail": "检查作者字段、元数据及可读取图片属性。"},
        {"id": "hidden_content", "label": "隐藏内容与活动对象", "status": "not_checked" if codes & INCOMPLETE_CODES else "checked", "detail": "检查隐藏页、批注、备注、嵌入对象及相关结构。"},
        {"id": "identity_terms", "label": "指定身份检查词", "status": ("checked" if not incomplete else "not_checked") if terms else "manual", "detail": "检查用户指定词的可读取内容和文件名。" if terms else "请配置团队身份检查词或人工核对。"},
        {"id": "rendered_pixels", "label": "页面与图片外观", "status": "manual", "detail": "请人工查看页面、截图和图片中的身份信息。"},
        {"id": "applicable_rules", "label": "适用提交规则", "status": "manual", "detail": "请按本届、组别、赛区与阶段核对规则。"},
    ]
    if incomplete:
        for row in coverage[:3]:
            row["status"] = "not_checked"
    return {"schema": "submission-preflight/v1", "name": name, "format": format,
            "bytes": raw["bytes"], "sha256": raw["sha256"], "scope": "server-deep",
            "status": "incomplete" if incomplete else "issues_found" if findings else "no_issues_in_checked_scope",
            "findings": findings, "coverage": coverage, "termsHash": terms_hash(terms)}


def validate_report(value: Any, *, name: str, format: str, terms: list[str],
                    source_bytes: int, source_hash: str, cleaned: bool) -> dict[str, Any]:
    """A process result is untrusted: whitelist the entire public contract."""
    keys = {"schema", "name", "format", "bytes", "sha256", "scope", "status", "findings", "coverage", "termsHash"}
    if cleaned:
        keys.add("cleanup")
    if (not isinstance(value, dict) or set(value) != keys or value.get("schema") != "submission-preflight/v1"
            or value.get("name") != name or value.get("format") != format
            or type(value.get("bytes")) is not int or value["bytes"] != source_bytes
            or value.get("sha256") != source_hash or value.get("scope") != "server-deep"
            or value.get("termsHash") != terms_hash(terms)
            or value.get("status") not in {"issues_found", "no_issues_in_checked_scope", "incomplete"}
            or not isinstance(value.get("findings"), list) or len(value["findings"]) > MAX_FINDINGS
            or not isinstance(value.get("coverage"), list) or not 1 <= len(value["coverage"]) <= 16
            or cleaned and value.get("cleanup") != {"completed": True, "reason": "temporary-upload"}):
        raise PreflightError("preflight_worker_failed")
    for item in value["findings"]:
        if (not isinstance(item, dict) or set(item) - {"level", "code", "message", "location", "field"}
                or not {"level", "code", "message", "location"} <= set(item)
                or item.get("level") not in {"error", "warning"}
                or not isinstance(item.get("code"), str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,79}", item["code"])
                or any(not isinstance(item.get(k), str) or not 1 <= _units(item[k]) <= bound
                       for k, bound in (("message", 600), ("location", 500)))
                or "field" in item and (not isinstance(item["field"], str) or _units(item["field"]) > 120)):
            raise PreflightError("preflight_worker_failed")
    ids = set()
    for item in value["coverage"]:
        if (not isinstance(item, dict) or set(item) != {"id", "label", "status", "detail"}
                or not isinstance(item.get("id"), str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,79}", item["id"])
                or item["id"] in ids or item.get("status") not in {"checked", "manual", "not_checked"}
                or any(not isinstance(item.get(k), str) or not 1 <= _units(item[k]) <= bound
                       for k, bound in (("label", 80), ("detail", 600)))):
            raise PreflightError("preflight_worker_failed")
        ids.add(item["id"])
    if (value["status"] == "no_issues_in_checked_scope" and (value["findings"] or any(row["status"] == "not_checked" for row in value["coverage"]))
            or value["status"] == "issues_found" and not value["findings"]):
        raise PreflightError("preflight_worker_failed")
    if len(_json(value)) > MAX_RESULT_BYTES:
        raise PreflightError("preflight_limits")
    return value


def _remove_job(root: Path, job: Path) -> None:
    if scratch._is_link(job) or job.parent.resolve(strict=True) != root or not JOB_NAME.fullmatch(job.name):
        raise PreflightError("preflight_cleanup_failed")
    if not job.exists():
        return
    resolved = job.resolve(strict=True)
    if resolved.parent != root:
        raise PreflightError("preflight_cleanup_failed")
    for attempt in range(len(scratch.CLEANUP_RETRY_DELAYS) + 1):
        if scratch._is_link(job) or job.parent.resolve(strict=True) != root:
            raise PreflightError("preflight_cleanup_failed")
        try:
            shutil.rmtree(resolved)
            return
        except FileNotFoundError:
            if not job.exists():
                return
            raise PreflightError("preflight_cleanup_failed") from None
        except OSError as error:
            transient = os.name == "nt" and getattr(error, "winerror", None) in {32, 33}
            if not transient or attempt == len(scratch.CLEANUP_RETRY_DELAYS):
                raise PreflightError("preflight_cleanup_failed") from None
            time.sleep(scratch.CLEANUP_RETRY_DELAYS[attempt])


def _root(temp_root: Path) -> Path:
    try:
        return scratch._root(temp_root)
    except scratch.SurveyImportError:
        raise PreflightError("preflight_temp_unavailable") from None


def _worker_pid(job: Path, identifier: str) -> int | None:
    path = job / "worker.json"
    if not path.exists():
        return None
    if scratch._is_link(path) or path.stat().st_size > 2048:
        raise PreflightError("preflight_cleanup_failed")
    value = json.loads(path.read_text(encoding="utf-8"))
    pid = value.get("pid")
    if value.get("schema") != "submission-preflight-worker/v1" or value.get("id") != identifier or type(pid) is not int or not 0 < pid < 2 ** 31:
        raise PreflightError("preflight_cleanup_failed")
    return pid


def cleanup_stale(temp_root: Path, *, now: float | None = None) -> list[dict[str, Any]]:
    root = _root(temp_root)
    timestamp = time.time() if now is None else now
    records = []
    for job in root.iterdir():
        match = JOB_NAME.fullmatch(job.name)
        if not match or scratch._is_link(job) or not job.is_dir():
            continue
        identifier = match.group(1)
        try:
            lease = job / "lease.json"
            if scratch._is_link(lease) or lease.exists() and lease.stat().st_size > 2048:
                raise PreflightError("preflight_cleanup_failed")
            worker_pid = _worker_pid(job, identifier)
            if not lease.exists():
                if job.stat().st_mtime + GRACE_SECONDS <= timestamp and not scratch._pid_alive(worker_pid):
                    _remove_job(root, job)
                    records.append({"importId": identifier, "status": "removed", "at": timestamp})
                continue
            entry = json.loads(lease.read_text(encoding="utf-8"))
            expires = entry.get("expiresAt")
            if (entry.get("schema") != "submission-preflight-lease/v1" or entry.get("id") != identifier
                    or type(expires) not in {int, float} or not math.isfinite(expires) or expires > timestamp):
                continue
            if (scratch._pid_alive(entry.get("parentPid")) or scratch._pid_alive(entry.get("childPid"))
                    or scratch._pid_alive(worker_pid) or entry.get("phase") != "prepared" and entry.get("childPid") is None and worker_pid is None):
                records.append({"importId": identifier, "status": "deferred", "at": timestamp})
                continue
            _remove_job(root, job)
            records.append({"importId": identifier, "status": "removed", "at": timestamp})
        except (OSError, ValueError, TypeError, PreflightError):
            records.append({"importId": identifier, "status": "cleanup_failed", "at": timestamp})
    return records


def _worker_command(upload: Path, output: Path, config: Path) -> tuple[str, ...]:
    executable = scratch._process_executable()
    script = str(Path(__file__).resolve())
    if executable != sys.executable:
        site_packages = str(Path(sys.prefix) / "Lib/site-packages")
        bootstrap = "import runpy,sys;sys.path.insert(0,sys.argv.pop(1));sys.argv.pop(0);runpy.run_path(sys.argv[0],run_name='__main__')"
        return (executable, "-I", "-B", "-c", bootstrap, site_packages, script, "--worker", str(upload), str(output), str(config))
    return (executable, "-I", "-B", script, "--worker", str(upload), str(output), str(config))


async def _finish(root, job, process, spawning, waiting, cancellation):
    if process is None and spawning is not None:
        try:
            process = await spawning
        except (OSError, ValueError):
            process = None
    if process is not None and process.returncode is None:
        try:
            process.kill()
        except ProcessLookupError:
            pass
        await process.wait()
    for task in (waiting, cancellation):
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
    if job.exists():
        await asyncio.to_thread(_remove_job, root, job)


async def audit_bytes(content: bytes, *, name: str, format: str, terms: list[str],
                      temp_root: Path, timeout_seconds: float = 35,
                      cancel_event: asyncio.Event | None = None,
                      on_event: Callable | None = None) -> dict[str, Any]:
    name, format, terms = validate_input(name, format, terms)
    if not isinstance(content, bytes) or not content:
        raise PreflightError("preflight_empty")
    if len(content) > MAX_BYTES:
        raise PreflightError("preflight_too_large")
    if type(timeout_seconds) not in {int, float} or not math.isfinite(timeout_seconds) or not 0 < timeout_seconds <= MAX_TIMEOUT_SECONDS:
        raise ValueError("preflight timeout must be positive and at most 35 seconds")
    if cancel_event is not None and cancel_event.is_set():
        raise PreflightError("preflight_cancelled")
    deadline = time.monotonic() + timeout_seconds
    root = await asyncio.to_thread(_root, temp_root)
    identifier = uuid.uuid4().hex
    job = root / ("preflight-" + identifier)
    process = spawning = waiting = cancellation = value = None
    completed = False
    try:
        # This one bounded filesystem operation is owned before OS spawn.
        def prepare():
            job.mkdir(mode=0o700)
            scratch._private_directory(job)
            upload, result, config = job / ("input." + format), job / "result.json", job / "config.json"
            lease = {"schema": "submission-preflight-lease/v1", "id": identifier,
                     "parentPid": os.getpid(), "childPid": None, "phase": "prepared",
                     "createdAt": time.time(), "expiresAt": time.time() + timeout_seconds + 10}
            scratch._write_lease(job, lease)
            upload.write_bytes(content)
            config.write_bytes(_json({"name": name, "format": format, "terms": terms}))
            return upload, result, config, lease
        # Keep ownership of a running thread until its writes have settled.
        preparing = asyncio.create_task(asyncio.to_thread(prepare))
        try:
            upload, result_path, config, lease = await asyncio.shield(preparing)
        except asyncio.CancelledError:
            while not preparing.done():
                try:
                    await asyncio.shield(preparing)
                except asyncio.CancelledError:
                    pass
            preparing.result()
            raise
        if time.monotonic() >= deadline:
            raise PreflightError("preflight_timeout")
        environment = {k: v for k, v in os.environ.items() if k.upper() in {"SYSTEMROOT", "WINDIR", "PATH", "TEMP", "TMP", "HOME", "USERPROFILE", "LOCALAPPDATA", "LANG"}}
        environment.update(PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8", OPENBLAS_NUM_THREADS="1", OMP_NUM_THREADS="1")
        lease["phase"] = "spawning"
        scratch._write_lease(job, lease)
        if cancel_event is not None:
            cancellation = asyncio.create_task(cancel_event.wait())
        spawning = asyncio.create_task(asyncio.create_subprocess_exec(*_worker_command(upload, result_path, config),
                    cwd=job, env=environment, stdin=asyncio.subprocess.DEVNULL,
                    stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL))
        watched = {spawning} | ({cancellation} if cancellation is not None else set())
        done, _ = await asyncio.wait(watched, timeout=max(0, deadline - time.monotonic()), return_when=asyncio.FIRST_COMPLETED)
        if cancellation is not None and cancellation in done:
            raise PreflightError("preflight_cancelled")
        if spawning not in done:
            raise PreflightError("preflight_timeout")
        process = spawning.result()
        lease.update(childPid=process.pid, phase="registered")
        scratch._write_lease(job, lease)
        scratch._emit(on_event, identifier, "started")
        waiting = asyncio.create_task(process.wait())
        watched = {waiting} | ({cancellation} if cancellation is not None else set())
        done, _ = await asyncio.wait(watched, timeout=max(0, deadline - time.monotonic()), return_when=asyncio.FIRST_COMPLETED)
        if cancellation is not None and cancellation in done:
            raise PreflightError("preflight_cancelled")
        if waiting not in done or time.monotonic() >= deadline:
            raise PreflightError("preflight_timeout")
        if process.returncode != 0 or not result_path.is_file() or scratch._is_link(result_path) or result_path.stat().st_size > MAX_RESULT_BYTES:
            raise PreflightError("preflight_worker_failed")
        response = json.loads(result_path.read_text(encoding="utf-8"))
        if not isinstance(response, dict) or response.get("ok") is not True:
            raise PreflightError(response.get("code", "preflight_worker_failed") if isinstance(response, dict) else "preflight_worker_failed")
        value = response.get("result")
        validate_report(value, name=name, format=format, terms=terms, source_bytes=len(content),
                        source_hash=hashlib.sha256(content).hexdigest(), cleaned=False)
        completed = True
        return value
    except asyncio.CancelledError:
        raise
    except PreflightError:
        raise
    except (OSError, ValueError, TypeError, scratch.SurveyImportError):
        raise PreflightError("preflight_worker_failed") from None
    finally:
        cleanup = asyncio.create_task(asyncio.to_thread(_remove_job, root, job)) if spawning is None else asyncio.create_task(_finish(root, job, process, spawning, waiting, cancellation))
        interrupted = False
        try:
            while True:
                try:
                    await asyncio.shield(cleanup)
                    break
                except asyncio.CancelledError:
                    interrupted = True
                    if cleanup.cancelled():
                        raise PreflightError("preflight_cleanup_failed") from None
                    if cleanup.done():
                        cleanup.result()
                        break
        except (OSError, PreflightError):
            scratch._emit(on_event, identifier, "cleanup_failed")
            raise PreflightError("preflight_cleanup_failed") from None
        if completed:
            value["cleanup"] = {"completed": True, "reason": "temporary-upload"}
        scratch._emit(on_event, identifier, "completed_cleaned" if completed else "failed_cleaned")
        if interrupted:
            raise asyncio.CancelledError


def _register_worker(upload: Path):
    job = upload.parent
    match = JOB_NAME.fullmatch(job.name)
    if not match or scratch._is_link(job):
        raise PreflightError("preflight_worker_failed")
    identifier = match.group(1)
    scratch._write_record(job, "worker.json", {"schema": "submission-preflight-worker/v1", "id": identifier,
                                             "pid": os.getpid(), "at": time.time()})
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        lease_path = job / "lease.json"
        if scratch._is_link(lease_path) or not lease_path.is_file() or lease_path.stat().st_size > 2048:
            raise PreflightError("preflight_worker_failed")
        lease = json.loads(lease_path.read_text(encoding="utf-8"))
        if lease.get("schema") != "submission-preflight-lease/v1" or lease.get("id") != identifier or not scratch._pid_alive(lease.get("parentPid")):
            raise PreflightError("preflight_worker_failed")
        if lease.get("phase") == "registered" and lease.get("childPid") == os.getpid():
            return
        time.sleep(0.01)
    raise PreflightError("preflight_worker_failed")


def _worker(upload: Path, output: Path, config: Path) -> int:
    try:
        if sys.platform.startswith("linux"):
            import resource
            resource.setrlimit(resource.RLIMIT_AS, (1024 * 1024 * 1024,) * 2)
            resource.setrlimit(resource.RLIMIT_CPU, (30, 31))
            resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_RESULT_BYTES,) * 2)
        _register_worker(upload)
        if config.stat().st_size > 50_000 or scratch._is_link(config):
            raise PreflightError("preflight_input")
        options = json.loads(config.read_text(encoding="utf-8"))
        name, format, terms = validate_input(options.get("name"), options.get("format"), options.get("terms"))
        value = _report(upload, name, format, terms)
        encoded = _json({"ok": True, "result": value})
        if len(encoded) > MAX_RESULT_BYTES:
            raise PreflightError("preflight_limits")
    except PreflightError as error:
        encoded = _json({"ok": False, "code": error.code})
    except Exception:
        # Parser errors can contain paths or source text; no raw exception leaves
        # the child, and stdout/stderr are both discarded by the parent.
        encoded = b'{"ok":false,"code":"preflight_invalid"}'
    output.write_bytes(encoded)
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 5 or sys.argv[1] != "--worker":
        raise SystemExit(2)
    raise SystemExit(_worker(Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4])))
