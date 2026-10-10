#!/usr/bin/env python3
"""Audit DOCX, PPTX, and PDF submission files for hidden identity and review residue."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import posixpath
import re
import sys
import unicodedata
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any, Iterable
from xml.etree import ElementTree


SUPPORTED_SUFFIXES = {".docx", ".pptx", ".pdf"}
CORE_NS = {
    "cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
    "dc": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms/",
}
OFFICE_IDENTITY_FIELDS = {
    "creator",
    "last_modified_by",
    "title",
    "subject",
    "keywords",
    "category",
    "company",
    "manager",
}
PDF_IDENTITY_FIELDS = {"author", "title", "subject", "keywords", "company"}
PDF_SAFE_ANNOTATION_SUBTYPES = {"Link", "PrinterMark", "TrapNet"}
PDF_DANGEROUS_ACTION_TYPES = {
    "JavaScript",
    "Launch",
    "GoToR",
    "Sound",
    "Movie",
    "Rendition",
    "RichMediaExecute",
    "SubmitForm",
    "ImportData",
    "Hide",
    "SetOCGState",
}
OFFICE_DANGEROUS_RELATIONSHIP_TOKENS = {
    "vbaproject",
    "activex",
    "control",
    "customui",
    "oleobject",
    "package",
    "attachedtemplate",
    "externallink",
    "dataconnection",
    "connection",
    "querytable",
    "webextension",
    "extensibility",
}
OFFICE_DANGEROUS_RELATIONSHIP_PREFIXES = {
    "vbaproject",
    "activex",
    "control",
    "externallink",
    "dataconnection",
    "connection",
    "querytable",
    "webextension",
}
OFFICE_DANGEROUS_CONTENT_TYPE_TOKENS = {
    "macroenabled",
    "vbaproject",
    "activex",
}
WORD_REVIEW_TAGS = {
    "ins",
    "del",
    "moveFrom",
    "moveTo",
    "moveFromRangeStart",
    "moveFromRangeEnd",
    "moveToRangeStart",
    "moveToRangeEnd",
    "cellIns",
    "cellDel",
    "cellMerge",
}


def is_word_review_tag(tag: str) -> bool:
    """Cover content, move-range, table, numbering, and formatting revisions."""
    return (
        tag in WORD_REVIEW_TAGS
        or tag.endswith("Change")
        or bool(re.fullmatch(r"customXml(?:Ins|Del|MoveFrom|MoveTo)Range(?:Start|End)", tag))
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def office_archive_boundary(path: Path, archive: zipfile.ZipFile) -> dict[str, Any]:
    """Validate that an OOXML ZIP has no prepended or appended polyglot data."""
    raw = path.read_bytes()
    first_header_offsets = [info.header_offset for info in archive.infolist()]
    starts_at_zero = bool(raw.startswith(b"PK\x03\x04") and first_header_offsets and min(first_header_offsets) == 0)
    eocd_candidates: list[dict[str, int]] = []
    cursor = 0
    signature = b"PK\x05\x06"
    while True:
        index = raw.find(signature, cursor)
        if index < 0:
            break
        cursor = index + 1
        if index + 22 > len(raw):
            continue
        comment_length = int.from_bytes(raw[index + 20:index + 22], "little")
        end_offset = index + 22 + comment_length
        central_size = int.from_bytes(raw[index + 12:index + 16], "little")
        central_offset = int.from_bytes(raw[index + 16:index + 20], "little")
        central_alignment = (
            central_size == 0xFFFFFFFF
            or central_offset == 0xFFFFFFFF
            or central_offset + central_size == index
        )
        if central_alignment:
            eocd_candidates.append({
                "offset": index,
                "end_offset": end_offset,
                "comment_length": comment_length,
                "central_size": central_size,
                "central_offset": central_offset,
            })
    exact_candidates = [row for row in eocd_candidates if row["end_offset"] == len(raw)]
    return {
        "bytes": len(raw),
        "starts_at_zero": starts_at_zero,
        "first_header_offset": min(first_header_offsets) if first_header_offsets else None,
        "eocd_candidates": eocd_candidates[-10:],
        "ends_at_eocd": bool(exact_candidates),
        "zip_comment_bytes": len(archive.comment or b""),
    }


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def clean_value(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalized_term_scan_text(value: Any, *, compact: bool = False) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = "".join(character for character in text if unicodedata.category(character) != "Cf")
    text = re.sub(r"\s+", " ", text).strip().casefold()
    return re.sub(r"\s+", "", text) if compact else text


def resolved_pdf_object(value: Any) -> Any:
    try:
        return value.get_object()
    except (AttributeError, TypeError, ValueError):
        return value


def finding(
    *,
    level: str,
    code: str,
    message: str,
    location: str | None = None,
    field: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"level": level, "code": code, "message": message}
    if location:
        payload["location"] = location
    if field:
        payload["field"] = field
    return payload


def parse_xml(archive: zipfile.ZipFile, name: str) -> ElementTree.Element | None:
    requested = unicodedata.normalize("NFKC", name).casefold()
    matches = [
        member
        for member in archive.namelist()
        if unicodedata.normalize("NFKC", member).casefold() == requested
    ]
    if not matches:
        return None
    return ElementTree.fromstring(archive.read(matches[0]))


def office_metadata(archive: zipfile.ZipFile) -> dict[str, str]:
    metadata: dict[str, str] = {}
    core = parse_xml(archive, "docProps/core.xml")
    if core is not None:
        fields = {
            "title": "dc:title",
            "subject": "dc:subject",
            "creator": "dc:creator",
            "keywords": "cp:keywords",
            "last_modified_by": "cp:lastModifiedBy",
            "category": "cp:category",
            "description": "dc:description",
            "created": "dcterms:created",
            "modified": "dcterms:modified",
        }
        for key, query in fields.items():
            node = core.find(query, CORE_NS)
            value = clean_value(node.text if node is not None else "")
            if value:
                metadata[key] = value

    app = parse_xml(archive, "docProps/app.xml")
    if app is not None:
        for node in app.iter():
            name = local_name(node.tag).lower()
            if name in {"company", "manager", "application", "appversion"}:
                value = clean_value(node.text)
                if value:
                    metadata[name] = value

    custom = parse_xml(archive, "docProps/custom.xml")
    if custom is not None:
        for prop in custom:
            prop_name = clean_value(prop.get("name")) or "unnamed"
            values = [clean_value(node.text) for node in prop.iter() if clean_value(node.text)]
            if values:
                metadata[f"custom:{prop_name}"] = " | ".join(values)
    return metadata


def xml_text(xml_bytes: bytes) -> str:
    root = ElementTree.fromstring(xml_bytes)
    values = []
    for node in root.iter():
        if local_name(node.tag) in {"t", "delText"} and node.text:
            values.append(node.text)
    return "\n".join(values)


def xml_attribute_text(root: ElementTree.Element) -> str:
    """Expose alt text, object names, relationship targets, and other XML attributes to term scans."""
    return "\n".join(
        clean_value(value)
        for node in root.iter()
        for value in node.attrib.values()
        if clean_value(value)
    )


def xml_node_text(root: ElementTree.Element) -> str:
    """Expose text stored in standard and custom OOXML data parts."""
    values: list[str] = []
    for node in root.iter():
        for value in (node.text, node.tail):
            cleaned = clean_value(value)
            if cleaned:
                values.append(cleaned)
    return "\n".join(values)


def pdf_object_strings(value: Any, *, max_nodes: int = 10000) -> list[str]:
    """Collect strings from a bounded PDF object graph without following cycles forever."""
    values: list[str] = []
    seen: set[tuple[int, int] | int] = set()
    visited = 0

    def walk(item: Any) -> None:
        nonlocal visited
        visited += 1
        if visited > max_nodes:
            raise ValueError(f"PDF object traversal exceeded {max_nodes} nodes")
        reference_key: tuple[int, int] | int
        if hasattr(item, "idnum") and hasattr(item, "generation"):
            reference_key = (int(item.idnum), int(item.generation))
        else:
            reference_key = id(item)
        if reference_key in seen:
            return
        seen.add(reference_key)
        resolved = resolved_pdf_object(item)
        if resolved is not item:
            walk(resolved)
            return
        if isinstance(resolved, str):
            cleaned = clean_value(resolved)
            if cleaned:
                values.append(cleaned)
            return
        title = getattr(resolved, "title", None)
        if isinstance(title, str) and clean_value(title):
            values.append(clean_value(title))
        if isinstance(resolved, (list, tuple)):
            for child in resolved:
                walk(child)
            return
        if hasattr(resolved, "items"):
            object_type = clean_value(resolved.get("/Type")) if hasattr(resolved, "get") else ""
            if object_type in {"/Page", "/Pages"}:
                return
            for key, child in resolved.items():
                if isinstance(key, str):
                    values.append(clean_value(key))
                if clean_value(key) in {"/Parent", "/Pg", "/Resources", "/Contents", "/Annots"}:
                    continue
                walk(child)

    walk(value)
    return values


def pdf_outline_titles(outline: Any, *, max_items: int = 10000) -> list[str]:
    """Read bookmark titles without following their page destinations."""
    titles: list[str] = []
    visited = 0

    def walk(item: Any) -> None:
        nonlocal visited
        visited += 1
        if visited > max_items:
            raise ValueError(f"PDF outline traversal exceeded {max_items} items")
        if isinstance(item, (list, tuple)):
            for child in item:
                walk(child)
            return
        title = getattr(item, "title", None)
        if title is None and hasattr(item, "get"):
            title = item.get("/Title")
        cleaned = clean_value(title)
        if cleaned:
            titles.append(cleaned)

    walk(outline)
    return titles


def pdf_name_tree_labels(value: Any, *, max_nodes: int = 20000) -> list[str]:
    """Collect PDF name-tree labels while deliberately not following destinations."""
    labels: list[str] = []
    seen: set[tuple[int, int] | int] = set()
    visited = 0

    def walk(item: Any) -> None:
        nonlocal visited
        visited += 1
        if visited > max_nodes:
            raise ValueError(f"PDF name-tree traversal exceeded {max_nodes} nodes")
        if hasattr(item, "idnum") and hasattr(item, "generation"):
            key: tuple[int, int] | int = (int(item.idnum), int(item.generation))
        else:
            key = id(item)
        if key in seen:
            return
        seen.add(key)
        resolved = resolved_pdf_object(item)
        if resolved is not item:
            walk(resolved)
            return
        if not hasattr(resolved, "get"):
            return
        names = resolved_pdf_object(resolved.get("/Names")) or []
        if isinstance(names, (list, tuple)):
            for index in range(0, len(names), 2):
                label = clean_value(resolved_pdf_object(names[index]))
                if label:
                    labels.append(label)
        limits = resolved_pdf_object(resolved.get("/Limits")) or []
        if isinstance(limits, (list, tuple)):
            labels.extend(clean_value(resolved_pdf_object(item)) for item in limits if clean_value(resolved_pdf_object(item)))
        kids = resolved_pdf_object(resolved.get("/Kids")) or []
        if isinstance(kids, (list, tuple)):
            for child in kids:
                walk(child)

    walk(value)
    return labels


def pdf_action_types(value: Any, *, max_nodes: int = 2000) -> list[str]:
    """Return `/S` action kinds from an action or additional-actions graph."""
    action_types: list[str] = []
    seen: set[tuple[int, int] | int] = set()
    visited = 0

    def walk(item: Any) -> None:
        nonlocal visited
        visited += 1
        if visited > max_nodes:
            raise ValueError(f"PDF action traversal exceeded {max_nodes} nodes")
        if hasattr(item, "idnum") and hasattr(item, "generation"):
            key: tuple[int, int] | int = (int(item.idnum), int(item.generation))
        else:
            key = id(item)
        if key in seen:
            return
        seen.add(key)
        resolved = resolved_pdf_object(item)
        if resolved is not item:
            walk(resolved)
            return
        if isinstance(resolved, (list, tuple)):
            for child in resolved:
                walk(child)
            return
        if not hasattr(resolved, "items"):
            return
        object_type = clean_value(resolved.get("/Type")) if hasattr(resolved, "get") else ""
        if object_type in {"/Page", "/Pages"}:
            return
        action_type = clean_value(resolved.get("/S")).lstrip("/")
        if action_type:
            action_types.append(action_type)
        for key_name, child in resolved.items():
            if clean_value(key_name) in {"/Parent", "/Pg", "/Resources", "/Contents", "/Annots"}:
                continue
            walk(child)

    walk(value)
    return action_types


def pdf_structure_tree_strings(value: Any, *, max_nodes: int = 50000) -> list[str]:
    """Collect human-facing accessibility text without following page graphs."""
    values: list[str] = []
    seen: set[tuple[int, int] | int] = set()
    visited = 0
    text_keys = {"/Alt", "/ActualText", "/E", "/T", "/ID", "/Lang", "/Phoneme"}

    def walk(item: Any) -> None:
        nonlocal visited
        visited += 1
        if visited > max_nodes:
            raise ValueError(f"PDF structure-tree traversal exceeded {max_nodes} nodes")
        if hasattr(item, "idnum") and hasattr(item, "generation"):
            key: tuple[int, int] | int = (int(item.idnum), int(item.generation))
        else:
            key = id(item)
        if key in seen:
            return
        seen.add(key)
        resolved = resolved_pdf_object(item)
        if resolved is not item:
            walk(resolved)
            return
        if isinstance(resolved, (list, tuple)):
            for child in resolved:
                walk(child)
            return
        if not hasattr(resolved, "get"):
            return
        for text_key in text_keys:
            raw_value = resolved.get(text_key)
            if raw_value is not None:
                values.extend(pdf_object_strings(raw_value, max_nodes=1000))
        for child_key in ("/K", "/Kids"):
            children = resolved.get(child_key)
            if children is not None:
                walk(children)

    walk(value)
    return values


def pdf_reachable_object_refs(reader: Any, *, max_nodes: int = 250000) -> set[tuple[int, int]]:
    """Walk the trailer graph and return every reachable indirect object ref."""
    reachable: set[tuple[int, int]] = set()
    seen_direct: set[int] = set()
    visited = 0

    def walk(item: Any) -> None:
        nonlocal visited
        visited += 1
        if visited > max_nodes:
            raise ValueError(f"PDF reachability traversal exceeded {max_nodes} nodes")
        if hasattr(item, "idnum") and hasattr(item, "generation"):
            key = (int(item.idnum), int(item.generation))
            if key in reachable:
                return
            reachable.add(key)
            walk(resolved_pdf_object(item))
            return
        direct_key = id(item)
        if direct_key in seen_direct:
            return
        seen_direct.add(direct_key)
        resolved = resolved_pdf_object(item)
        if resolved is not item:
            walk(resolved)
            return
        if isinstance(resolved, (list, tuple)):
            for child in resolved:
                walk(child)
            return
        if hasattr(resolved, "items"):
            for child in resolved.values():
                walk(child)

    walk(reader.trailer)
    return reachable


def pdf_all_indirect_object_strings(
    reader: Any,
) -> tuple[
    set[tuple[int, int]],
    list[tuple[str, str]],
    list[str],
    list[str],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[str],
]:
    """Enumerate all xref objects, including object streams, and collect strings."""
    from pypdf.generic import IndirectObject  # type: ignore

    refs: set[tuple[int, int]] = set()
    for generation, entries in (getattr(reader, "xref", {}) or {}).items():
        if not isinstance(entries, dict):
            continue
        for object_id in entries:
            if int(object_id) > 0 and int(generation) != 65535:
                refs.add((int(object_id), int(generation)))
    for object_id in (getattr(reader, "xref_objStm", {}) or {}):
        if int(object_id) > 0:
            refs.add((int(object_id), 0))

    locations: list[tuple[str, str]] = []
    errors: list[str] = []
    associated_file_refs: list[str] = []
    metadata_streams: list[dict[str, Any]] = []
    image_metadata: list[dict[str, Any]] = []
    media_errors: list[str] = []
    metadata_stream_total = 0
    for object_id, generation in sorted(refs):
        try:
            reference = IndirectObject(object_id, generation, reader)
            payload = reader.get_object(reference)
            if hasattr(payload, "get"):
                associated_files = resolved_pdf_object(payload.get("/AF"))
                if associated_files:
                    associated_file_refs.append(f"{object_id}:{generation}")
            values = pdf_object_strings(payload, max_nodes=10000)
            if values:
                locations.append((f"pdf_object:{object_id}:{generation}", " | ".join(values)))
            if hasattr(payload, "get") and hasattr(payload, "get_data"):
                object_type = clean_value(payload.get("/Type")).lstrip("/").casefold()
                subtype = clean_value(payload.get("/Subtype")).lstrip("/").casefold()
                if object_type == "metadata" or subtype == "xml":
                    try:
                        raw_metadata = payload.get_data()
                        if len(raw_metadata) > 5 * 1024 * 1024:
                            raise ValueError("metadata stream exceeds 5 MiB inspection limit")
                        metadata_stream_total += len(raw_metadata)
                        if metadata_stream_total > 20 * 1024 * 1024:
                            raise ValueError("aggregate metadata streams exceed 20 MiB inspection limit")
                        metadata_root = ElementTree.fromstring(raw_metadata)
                        metadata_text = "\n".join(
                            item
                            for item in (xml_node_text(metadata_root), xml_attribute_text(metadata_root))
                            if item
                        )
                        record = {
                            "object": f"{object_id}:{generation}",
                            "type": object_type,
                            "subtype": subtype,
                            "bytes": len(raw_metadata),
                            "sha256": hashlib.sha256(raw_metadata).hexdigest(),
                            "text_characters": len(metadata_text),
                        }
                        metadata_streams.append(record)
                        if metadata_text:
                            locations.append((f"pdf_metadata_stream:{object_id}:{generation}", metadata_text))
                    except Exception as exc:
                        media_errors.append(
                            f"metadata {object_id}:{generation}: {type(exc).__name__}: {exc}"
                        )
                if subtype == "image":
                    filters_raw = resolved_pdf_object(payload.get("/Filter"))
                    if isinstance(filters_raw, (list, tuple)):
                        filters = [clean_value(item).lstrip("/").casefold() for item in filters_raw]
                    else:
                        filters = [clean_value(filters_raw).lstrip("/").casefold()]
                    if any(item in {"dctdecode", "jpxdecode"} for item in filters):
                        try:
                            image_bytes = payload.get_data()
                            if len(image_bytes) > 64 * 1024 * 1024:
                                raise ValueError("encoded PDF image exceeds 64 MiB inspection limit")
                            record, metadata_rows = raster_image_metadata_from_bytes(
                                image_bytes,
                                label=f"pdf_image:{object_id}:{generation}",
                            )
                            record.update({
                                "object": f"{object_id}:{generation}",
                                "filters": filters,
                            })
                            image_metadata.append(record)
                            if metadata_rows:
                                locations.append(
                                    (
                                        f"pdf_image_metadata:{object_id}:{generation}",
                                        "\n".join(f"{field}={value}" for field, value in metadata_rows),
                                    )
                                )
                        except Exception as exc:
                            media_errors.append(
                                f"image {object_id}:{generation}: {type(exc).__name__}: {exc}"
                            )
        except Exception as exc:
            errors.append(f"{object_id}:{generation}: {type(exc).__name__}: {exc}")
    return (
        refs,
        locations,
        errors,
        associated_file_refs,
        metadata_streams,
        image_metadata,
        media_errors,
    )


def pdf_stream_texts(value: Any, *, max_bytes: int = 10 * 1024 * 1024) -> list[str]:
    """Decode bounded stream packets such as XFA for identity-term scanning."""
    values: list[str] = []
    seen: set[tuple[int, int] | int] = set()
    total_bytes = 0

    def walk(item: Any) -> None:
        nonlocal total_bytes
        if hasattr(item, "idnum") and hasattr(item, "generation"):
            key: tuple[int, int] | int = (int(item.idnum), int(item.generation))
        else:
            key = id(item)
        if key in seen:
            return
        seen.add(key)
        resolved = resolved_pdf_object(item)
        if resolved is not item:
            walk(resolved)
            return
        if isinstance(resolved, (list, tuple)):
            for child in resolved:
                walk(child)
            return
        if hasattr(resolved, "get_data"):
            payload = resolved.get_data()
            total_bytes += len(payload)
            if total_bytes > max_bytes:
                raise ValueError(f"PDF stream packets exceed {max_bytes} byte inspection limit")
            decoded = payload.decode("utf-8", errors="ignore")
            if not decoded:
                decoded = payload.decode("utf-16", errors="ignore")
            if not decoded:
                decoded = payload.decode("latin-1", errors="ignore")
            cleaned = clean_value(decoded)
            if cleaned:
                values.append(cleaned)
            return
        if isinstance(resolved, str):
            cleaned = clean_value(resolved)
            if cleaned:
                values.append(cleaned)

    walk(value)
    return values


def external_relationships(archive: zipfile.ZipFile) -> list[dict[str, str]]:
    relationships: list[dict[str, str]] = []
    for name in archive.namelist():
        if not name.casefold().endswith(".rels"):
            continue
        root = ElementTree.fromstring(archive.read(name))
        for node in root:
            if clean_value(node.get("TargetMode")).lower() == "external":
                relationships.append({
                    "part": name,
                    "target": clean_value(node.get("Target")),
                    "type": clean_value(node.get("Type")),
                })
    return relationships


def internal_relationship_targets(archive: zipfile.ZipFile) -> set[str]:
    """Resolve internal relationship targets to normalized package member names."""
    targets: set[str] = set()
    for name in archive.namelist():
        lowered_name = name.casefold()
        if not lowered_name.endswith(".rels"):
            continue
        root = ElementTree.fromstring(archive.read(name))
        if lowered_name == "_rels/.rels":
            base = ""
        elif "/_rels/" in lowered_name:
            marker_index = lowered_name.index("/_rels/")
            base = name[:marker_index]
        else:
            base = posixpath.dirname(name)
        for node in root:
            if clean_value(node.get("TargetMode")).lower() == "external":
                continue
            target = clean_value(node.get("Target")).replace("\\", "/")
            if not target or "://" in target:
                continue
            normalized = posixpath.normpath(posixpath.join(base, target.lstrip("/")))
            if normalized and normalized != "." and not normalized.startswith("../"):
                targets.add(unicodedata.normalize("NFKC", normalized).casefold())
    return targets


def dangerous_office_relationships(archive: zipfile.ZipFile) -> list[dict[str, str]]:
    """Detect active/embedded semantics even when an attacker renames the target part."""
    rows: list[dict[str, str]] = []
    for name in archive.namelist():
        if not name.casefold().endswith(".rels"):
            continue
        root = ElementTree.fromstring(archive.read(name))
        for node in root:
            relationship_type = clean_value(node.get("Type"))
            relationship_kind = relationship_type.rstrip("/").rsplit("/", 1)[-1].casefold()
            matched = sorted(
                token
                for token in OFFICE_DANGEROUS_RELATIONSHIP_TOKENS
                if relationship_kind == token
                or (
                    token in OFFICE_DANGEROUS_RELATIONSHIP_PREFIXES
                    and relationship_kind.startswith(token)
                )
            )
            if not matched:
                continue
            rows.append({
                "part": name,
                "target": clean_value(node.get("Target")),
                "type": relationship_type,
                "matched_tokens": ",".join(matched),
            })
    return rows


def dangerous_office_content_types(archive: zipfile.ZipFile) -> list[dict[str, str]]:
    """Detect macro-enabled or ActiveX content types independently of filenames."""
    content_type_parts = [
        name for name in archive.namelist()
        if unicodedata.normalize("NFKC", name).casefold() == "[content_types].xml"
    ]
    if not content_type_parts:
        return []
    root = ElementTree.fromstring(archive.read(content_type_parts[0]))
    rows: list[dict[str, str]] = []
    for node in root:
        content_type = clean_value(node.get("ContentType"))
        folded_type = content_type.casefold()
        matched = sorted(token for token in OFFICE_DANGEROUS_CONTENT_TYPE_TOKENS if token in folded_type)
        if not matched:
            continue
        rows.append({
            "source_part": content_type_parts[0],
            "part_name": clean_value(node.get("PartName")),
            "extension": clean_value(node.get("Extension")),
            "content_type": content_type,
            "matched_tokens": ",".join(matched),
        })
    return rows


def dangerous_external_target(target: str) -> bool:
    normalized = target.strip().replace("\\", "/")
    lowered = normalized.casefold()
    if lowered.startswith(("http://", "https://")):
        return False
    return bool(
        lowered.startswith(("file:", "mailto:", "ftp:", "//"))
        or re.match(r"^[a-z]:/", lowered)
        or normalized.startswith(("../", "./"))
        or lowered
    )


def dangerous_external_relationship(row: dict[str, str]) -> bool:
    """Allow only ordinary web hyperlinks; remote templates/data are active content."""
    target = row.get("target", "")
    if dangerous_external_target(target):
        return True
    relationship_type = row.get("type", "").rstrip("/").rsplit("/", 1)[-1].casefold()
    return relationship_type != "hyperlink"


def forbidden_hits(
    terms: list[str],
    locations: Iterable[tuple[str, str]],
) -> list[dict[str, Any]]:
    hits = []
    for location, text in locations:
        folded = normalized_term_scan_text(text)
        compact_folded = normalized_term_scan_text(text, compact=True)
        for term in terms:
            normalized_term = normalized_term_scan_text(term)
            compact_term = normalized_term_scan_text(term, compact=True)
            if not normalized_term:
                continue
            count = folded.count(normalized_term)
            if compact_term:
                count = max(count, compact_folded.count(compact_term))
            if count:
                hits.append(
                    finding(
                        level="error",
                        code="forbidden_identity_term",
                        message=f"Forbidden identity term appears {count} normalized time(s): {term}",
                        location=location,
                    )
                )
    return hits


def flatten_metadata_strings(value: Any, *, prefix: str = "", depth: int = 0) -> list[tuple[str, str]]:
    """Flatten bounded textual image metadata for term scanning."""
    if depth > 8:
        return []
    if isinstance(value, bytes):
        decoded = value.decode("utf-8", errors="ignore") or value.decode("latin-1", errors="ignore")
        cleaned = clean_value(decoded[:8192])
        return [(prefix or "value", cleaned)] if cleaned else []
    if isinstance(value, str):
        cleaned = clean_value(value[:8192])
        return [(prefix or "value", cleaned)] if cleaned else []
    if isinstance(value, dict):
        rows: list[tuple[str, str]] = []
        for key, child in value.items():
            child_prefix = f"{prefix}.{clean_value(key)}" if prefix else clean_value(key)
            rows.extend(flatten_metadata_strings(child, prefix=child_prefix, depth=depth + 1))
        return rows
    if isinstance(value, (list, tuple, set)):
        rows = []
        for index, child in enumerate(value):
            rows.extend(flatten_metadata_strings(child, prefix=f"{prefix}[{index}]", depth=depth + 1))
        return rows
    if isinstance(value, (int, float, bool)):
        return [(prefix or "value", clean_value(value))]
    return []


def office_image_metadata(
    archive: zipfile.ZipFile,
    names: list[str],
) -> tuple[list[dict[str, Any]], list[tuple[str, str]], list[str]]:
    """Inspect metadata (not pixels/OCR) of common Office raster media."""
    try:
        from PIL import ExifTags, Image, IptcImagePlugin  # type: ignore
    except ImportError as exc:
        raise RuntimeError("Office media metadata audit requires Pillow") from exc

    supported = {
        ".jpg", ".jpeg", ".tif", ".tiff", ".png", ".webp",
        ".gif", ".bmp", ".dib", ".ico",
    }
    identity_names = {
        "artist", "copyright", "imagedescription", "usercomment", "comment",
        "xpauthor", "xpcomment", "ownername", "cameraownername", "author",
        "credit", "byline", "contact", "creatorcontactinfo",
    }
    geography_names = {
        "gps", "gpslatitude", "gpslongitude", "latitude", "longitude",
        "location", "sublocation", "city", "state", "country", "geolocation",
    }
    records: list[dict[str, Any]] = []
    locations: list[tuple[str, str]] = []
    errors: list[str] = []
    for name in names:
        lowered_name = name.casefold()
        if not lowered_name.startswith(("word/media/", "ppt/media/")):
            continue
        suffix = Path(lowered_name).suffix
        if suffix not in supported:
            continue
        try:
            payload = archive.read(name)
            with Image.open(io.BytesIO(payload)) as image:
                metadata_rows: list[tuple[str, str]] = []
                exif = image.getexif()
                gps_present = 34853 in exif
                for tag_id, value in exif.items():
                    tag_name = clean_value(ExifTags.TAGS.get(tag_id, tag_id))
                    metadata_rows.extend(flatten_metadata_strings(value, prefix=f"EXIF.{tag_name}"))
                info_payload = {
                    clean_value(key): value
                    for key, value in image.info.items()
                    if clean_value(key).casefold() not in {"icc_profile", "exif"}
                }
                metadata_rows.extend(flatten_metadata_strings(info_payload, prefix="INFO"))
                try:
                    metadata_rows.extend(flatten_metadata_strings(image.getxmp(), prefix="XMP"))
                except (AttributeError, ValueError, TypeError):
                    pass
                try:
                    metadata_rows.extend(flatten_metadata_strings(IptcImagePlugin.getiptcinfo(image) or {}, prefix="IPTC"))
                except (AttributeError, ValueError, TypeError, OSError):
                    pass
                identity_fields = []
                geography_fields = []
                for field, value in metadata_rows:
                    if not value:
                        continue
                    normalized = (field + " " + value).casefold().replace("_", "").replace("-", "")
                    identity_hit = any(token in normalized for token in identity_names)
                    if "creator" in normalized and "creatortool" not in normalized:
                        identity_hit = True
                    if identity_hit:
                        identity_fields.append(field)
                    field_tokens = re.findall(r"[a-z0-9]+", field.casefold())
                    geography_hit = any(
                        token in geography_names
                        or token.startswith("gps")
                        or token.endswith(("latitude", "longitude", "location"))
                        for token in field_tokens
                    )
                    if geography_hit:
                        geography_fields.append(field)
                identity_fields = sorted(set(identity_fields))
                geography_fields = sorted(set(geography_fields))
                gps_present = gps_present or bool(geography_fields)
                if metadata_rows:
                    locations.append((f"image_metadata:{name}", "\n".join(f"{field}={value}" for field, value in metadata_rows)))
                records.append({
                    "part": name,
                    "bytes": len(payload),
                    "sha256": hashlib.sha256(payload).hexdigest(),
                    "metadata_fields": sorted({field for field, value in metadata_rows if value}),
                    "identity_fields": identity_fields,
                    "geography_fields": geography_fields,
                    "gps_present": gps_present,
                })
        except Exception as exc:
            errors.append(f"{name}: {type(exc).__name__}: {exc}")
    return records, locations, errors


def raster_image_metadata_from_bytes(
    payload: bytes,
    *,
    label: str,
) -> tuple[dict[str, Any], list[tuple[str, str]]]:
    """Extract bounded EXIF/XMP/IPTC/comment metadata from a standalone raster."""
    try:
        from PIL import ExifTags, Image, IptcImagePlugin  # type: ignore
    except ImportError as exc:
        raise RuntimeError("Raster metadata audit requires Pillow") from exc

    identity_names = {
        "artist", "copyright", "imagedescription", "usercomment", "comment",
        "xpauthor", "xpcomment", "ownername", "cameraownername", "author",
        "credit", "byline", "contact", "creatorcontactinfo",
    }
    geography_names = {
        "gps", "gpslatitude", "gpslongitude", "latitude", "longitude",
        "location", "sublocation", "city", "state", "country", "geolocation",
    }
    with Image.open(io.BytesIO(payload)) as image:
        metadata_rows: list[tuple[str, str]] = []
        exif = image.getexif()
        gps_present = 34853 in exif
        for tag_id, value in exif.items():
            tag_name = clean_value(ExifTags.TAGS.get(tag_id, tag_id))
            metadata_rows.extend(flatten_metadata_strings(value, prefix=f"EXIF.{tag_name}"))
        info_payload = {
            clean_value(key): value
            for key, value in image.info.items()
            if clean_value(key).casefold() not in {"icc_profile", "exif"}
        }
        metadata_rows.extend(flatten_metadata_strings(info_payload, prefix="INFO"))
        try:
            metadata_rows.extend(flatten_metadata_strings(image.getxmp(), prefix="XMP"))
        except (AttributeError, ValueError, TypeError):
            pass
        try:
            metadata_rows.extend(flatten_metadata_strings(IptcImagePlugin.getiptcinfo(image) or {}, prefix="IPTC"))
        except (AttributeError, ValueError, TypeError, OSError):
            pass

        identity_fields: list[str] = []
        geography_fields: list[str] = []
        for field, value in metadata_rows:
            if not value:
                continue
            normalized = (field + " " + value).casefold().replace("_", "").replace("-", "")
            identity_hit = any(token in normalized for token in identity_names)
            if "creator" in normalized and "creatortool" not in normalized:
                identity_hit = True
            if identity_hit:
                identity_fields.append(field)
            field_tokens = re.findall(r"[a-z0-9]+", field.casefold())
            geography_hit = any(
                token in geography_names
                or token.startswith("gps")
                or token.endswith(("latitude", "longitude", "location"))
                for token in field_tokens
            )
            if geography_hit:
                geography_fields.append(field)
        identity_fields = sorted(set(identity_fields))
        geography_fields = sorted(set(geography_fields))
        gps_present = gps_present or bool(geography_fields)
        return (
            {
                "label": label,
                "format": clean_value(image.format),
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
                "metadata_fields": sorted({field for field, value in metadata_rows if value}),
                "identity_fields": identity_fields,
                "geography_fields": geography_fields,
                "gps_present": gps_present,
            },
            metadata_rows,
        )


def audit_office(path: Path, *, strict: bool, terms: list[str]) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    details: dict[str, Any] = {}
    with zipfile.ZipFile(path) as archive:
        archive_boundary = office_archive_boundary(path, archive)
        details["archive_boundary"] = archive_boundary
        if not archive_boundary["starts_at_zero"] or not archive_boundary["ends_at_eocd"]:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="office_archive_extra_data",
                    message="OOXML ZIP has prepended/appended data or an inconsistent physical EOCD boundary",
                    location="ZIP physical boundary",
                )
            )
        archive_comment = archive.comment or b""
        archive_comment_text = archive_comment.decode("utf-8", errors="ignore") or archive_comment.decode("latin-1", errors="ignore")
        if archive_comment:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="office_archive_comment_present",
                    message=f"OOXML ZIP contains a {len(archive_comment)}-byte archive comment",
                    location="ZIP EOCD comment",
                )
            )
        names = [info.filename for info in archive.infolist()]
        duplicate_member_counts = {
            name: count
            for name, count in Counter(names).items()
            if name and not name.endswith("/") and count > 1
        }
        details["duplicate_archive_members"] = duplicate_member_counts
        if duplicate_member_counts:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="duplicate_archive_members",
                    message="Office package contains duplicate ZIP member names with ambiguous consumer behavior: "
                    + ", ".join(f"{name} x{count}" for name, count in sorted(duplicate_member_counts.items())),
                    location="ZIP central directory",
                )
            )
        normalized_member_groups: dict[str, list[str]] = {}
        for name in names:
            normalized_name = unicodedata.normalize("NFKC", name).casefold()
            normalized_member_groups.setdefault(normalized_name, []).append(name)
        casefold_collisions = {
            normalized: originals
            for normalized, originals in normalized_member_groups.items()
            if len(set(originals)) > 1
        }
        details["casefold_archive_member_collisions"] = casefold_collisions
        if casefold_collisions:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="casefold_archive_member_collision",
                    message="Office package contains member names that collide after Unicode normalization and case-folding",
                    location=" | ".join(
                        f"{normalized}: {', '.join(originals)}"
                        for normalized, originals in sorted(casefold_collisions.items())
                    ),
                )
            )
        metadata = office_metadata(archive)
        details["metadata"] = metadata
        identity_fields = {
            key: value
            for key, value in metadata.items()
            if key in OFFICE_IDENTITY_FIELDS or key.startswith("custom:")
        }
        for field, value in identity_fields.items():
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="identity_metadata",
                    message="Submission metadata is not blank and may identify the team or editing environment",
                    location="docProps",
                    field=field,
                )
            )

        thumbnail_parts = [
            name for name in names
            if name.casefold().startswith("docprops/thumbnail.") and not name.endswith("/")
        ]
        thumbnail_records = []
        for name in thumbnail_parts:
            payload = archive.read(name)
            thumbnail_records.append({
                "part": name,
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            })
        details["package_thumbnails"] = thumbnail_records
        if thumbnail_records:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="package_thumbnail_present",
                    message=f"Found {len(thumbnail_records)} package thumbnail(s); a stale preview can expose an old cover or identity",
                    location=", ".join(thumbnail_parts),
                )
            )

        comment_parts = [
            name for name in names
            if "comment" in name.casefold() and name.casefold().endswith(".xml")
        ]
        details["comment_parts"] = comment_parts
        if comment_parts:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="comments_present",
                    message=f"Found {len(comment_parts)} comment-related XML part(s)",
                    location=", ".join(comment_parts),
                )
            )

        locations: list[tuple[str, str]] = [("filename", path.name)]
        if archive_comment_text:
            locations.append(("zip_archive_comment", archive_comment_text))
        if names:
            locations.append(("archive_member_names", "\n".join(names)))
        locations.extend((f"metadata:{key}", value) for key, value in metadata.items())
        review_counts: Counter[str] = Counter()
        unparseable_parts: list[str] = []
        hidden_slides = 0
        note_parts = 0
        nonempty_notes = 0
        custom_xml_parts = [
            name for name in names
            if name.casefold().startswith("customxml/") and name.casefold().endswith((".xml", ".rels"))
        ]
        details["custom_xml_parts"] = custom_xml_parts
        if custom_xml_parts:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="custom_xml_parts_present",
                    message=f"Found {len(custom_xml_parts)} custom XML data part(s); remove or inspect hidden content-control data",
                    location=", ".join(custom_xml_parts),
                )
            )
        for name in names:
            lowered_name = name.casefold()
            if not lowered_name.endswith((".xml", ".rels", ".svg")):
                continue
            data = archive.read(name)
            try:
                root = ElementTree.fromstring(data)
            except ElementTree.ParseError:
                unparseable_parts.append(name)
                decoded = data.decode("utf-8", errors="ignore")
                if decoded:
                    locations.append((f"unparseable:{name}", decoded))
                continue
            visible_text = xml_node_text(root)
            attribute_text = xml_attribute_text(root)
            combined_text = "\n".join(item for item in (visible_text, attribute_text) if item)
            if combined_text:
                locations.append((name, combined_text))
            if lowered_name.startswith("word/") and lowered_name.endswith(".xml"):
                for node in root.iter():
                    tag = local_name(node.tag)
                    if is_word_review_tag(tag):
                        review_counts[tag] += 1
            if re.fullmatch(r"ppt/slides/slide\d+\.xml", lowered_name):
                show = clean_value(root.get("show")).lower()
                if show in {"0", "false", "off", "no"}:
                    hidden_slides += 1
            if re.fullmatch(r"ppt/notesslides/notesslide\d+\.xml", lowered_name):
                note_parts += 1
                if clean_value(visible_text):
                    nonempty_notes += 1

        review_total = sum(review_counts.values())
        details["unparseable_office_parts"] = unparseable_parts
        if unparseable_parts:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="unparseable_office_parts",
                    message=f"Found {len(unparseable_parts)} Office-package XML part(s) that could not be audited",
                    location=", ".join(unparseable_parts),
                )
            )
        details["tracked_change_counts"] = dict(sorted(review_counts.items()))
        if review_total:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="tracked_changes_present",
                    message=f"Found {review_total} tracked-change element(s)",
                    location="word/document.xml",
                )
            )

        image_metadata_records, image_locations, image_errors = office_image_metadata(archive, names)
        details["image_metadata"] = image_metadata_records
        details["unparseable_media_images"] = image_errors
        locations.extend(image_locations)
        identity_media = [row for row in image_metadata_records if row.get("identity_fields")]
        gps_media = [row for row in image_metadata_records if row.get("gps_present")]
        if identity_media:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="image_identity_metadata_present",
                    message=f"Found identity-bearing EXIF/XMP/IPTC fields in {len(identity_media)} Office image(s)",
                    location=", ".join(str(row.get("part")) for row in identity_media),
                )
            )
        if gps_media:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="image_gps_metadata_present",
                    message=f"Found GPS EXIF metadata in {len(gps_media)} Office image(s)",
                    location=", ".join(str(row.get("part")) for row in gps_media),
                )
            )
        if image_errors:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="unparseable_media_images",
                    message=f"Could not inspect metadata for {len(image_errors)} supported Office image(s)",
                    location=" | ".join(image_errors),
                )
            )

        details["hidden_slides"] = hidden_slides
        if hidden_slides:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="hidden_slides_present",
                    message=f"Found {hidden_slides} hidden slide(s)",
                    location="ppt/slides",
                )
            )

        details["notes_parts"] = note_parts
        details["nonempty_notes"] = nonempty_notes
        if nonempty_notes:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="speaker_notes_present",
                    message=f"Found non-empty speaker notes on {nonempty_notes} slide(s); inspect for identity or unsupported claims",
                    location="ppt/notesSlides",
                )
            )

        embeddings = [
            name
            for name in names
            if name.casefold().startswith(("word/embeddings/", "ppt/embeddings/"))
            and not name.endswith("/")
        ]
        details["embedded_files"] = embeddings
        if embeddings:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="embedded_files_present",
                    message=f"Found {len(embeddings)} embedded file(s); inspect their metadata and submission necessity",
                    location=", ".join(embeddings),
                )
            )

        active_content_parts = []
        for name in names:
            lowered = name.casefold()
            if name.endswith("/"):
                continue
            if (
                "vbaproject" in lowered
                or lowered.endswith("/vbadata.xml")
                or "/activex/" in lowered
                or lowered.startswith("customui/")
                or "/customui/" in lowered
            ):
                active_content_parts.append(name)
        active_content_relationships = dangerous_office_relationships(archive)
        active_content_types = dangerous_office_content_types(archive)
        details["active_content_parts"] = active_content_parts
        details["active_content_relationships"] = active_content_relationships
        details["active_content_types"] = active_content_types
        if active_content_parts or active_content_relationships or active_content_types:
            locations_found = list(active_content_parts)
            locations_found.extend(
                f"{row['part']} -> {row['target']} ({row['type']})"
                for row in active_content_relationships
            )
            locations_found.extend(
                f"[Content_Types].xml:{row['part_name'] or row['extension']} ({row['content_type']})"
                for row in active_content_types
            )
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="active_content_present",
                    message=(
                        "Found active, macro-enabled, OLE/package, or custom-UI semantics in "
                        f"{len(active_content_parts)} named part(s), {len(active_content_relationships)} relationship(s), "
                        f"and {len(active_content_types)} content-type declaration(s); final frozen submissions must not contain active content"
                    ),
                    location=", ".join(locations_found),
                )
            )

        related_parts = internal_relationship_targets(archive)
        binary_prefixes = (
            "word/media/",
            "ppt/media/",
            "word/embeddings/",
            "ppt/embeddings/",
            "word/activex/",
            "ppt/activex/",
        )
        orphan_binary_parts = [
            name for name in names
            if name.casefold().startswith(binary_prefixes)
            and not name.casefold().endswith(("/", ".xml", ".rels"))
            and unicodedata.normalize("NFKC", name).casefold() not in related_parts
        ]
        details["orphan_binary_parts"] = orphan_binary_parts
        if orphan_binary_parts:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="orphan_binary_parts_present",
                    message=f"Found {len(orphan_binary_parts)} unreferenced media, embedding, or active-content part(s)",
                    location=", ".join(orphan_binary_parts),
                )
            )

        external_rows = external_relationships(archive)
        dangerous_external_rows = [row for row in external_rows if dangerous_external_relationship(row)]
        web_external_rows = [row for row in external_rows if row not in dangerous_external_rows]
        details["external_relationships"] = external_rows
        details["dangerous_external_relationships"] = dangerous_external_rows
        if dangerous_external_rows:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="external_local_or_identity_relationships",
                    message=f"Found {len(dangerous_external_rows)} external local, mail, or non-web relationship(s)",
                    location="*.rels",
                )
            )
        if web_external_rows:
            findings.append(
                finding(
                    level="warning",
                    code="external_web_relationships_present",
                    message=f"Found {len(web_external_rows)} external web relationship(s); verify source and privacy",
                    location="*.rels",
                )
            )

        findings.extend(forbidden_hits(terms, locations))
    return {"details": details, "findings": findings}


def audit_pdf(path: Path, *, strict: bool, terms: list[str]) -> dict[str, Any]:
    try:
        from pypdf import PdfReader  # type: ignore
    except ImportError as exc:
        raise RuntimeError("PDF submission audit requires pypdf") from exc

    reader = PdfReader(str(path))
    raw_pdf = path.read_bytes()
    encrypted = reader.is_encrypted
    if encrypted:
        try:
            unlocked = bool(reader.decrypt(""))
        except Exception:
            unlocked = False
        if not unlocked:
            return {
                "details": {
                    "metadata": {},
                    "xmp_metadata": {},
                    "page_count": None,
                    "encrypted": True,
                    "attachments": [],
                },
                "findings": [
                    finding(
                        level="error",
                        code="encrypted_pdf_unreadable",
                        message="Encrypted PDF cannot be inspected with an empty password; provide an auditable frozen submission",
                        location="PDF encryption dictionary",
                    )
                ],
            }
    metadata = {
        clean_value(key).lstrip("/").lower(): clean_value(value)
        for key, value in (reader.metadata or {}).items()
        if clean_value(value)
    }
    findings: list[dict[str, Any]] = []
    pdf_structure_errors: list[str] = []
    pdf_header_offset = raw_pdf.find(b"%PDF-")
    last_eof_offset = raw_pdf.rfind(b"%%EOF")
    trailing_after_eof = (
        raw_pdf[last_eof_offset + len(b"%%EOF"):]
        if last_eof_offset >= 0
        else raw_pdf
    )
    pdf_extra_data_present = bool(
        pdf_header_offset != 0
        or last_eof_offset < 0
        or trailing_after_eof.strip(b" \t\r\n\f\x00")
    )
    if pdf_extra_data_present:
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_extra_data_present",
                message="PDF has bytes before its header or non-whitespace data after the final EOF marker",
                location="PDF physical boundary",
            )
        )
    try:
        root = resolved_pdf_object(reader.trailer.get("/Root"))
    except Exception as exc:
        root = None
        pdf_structure_errors.append(f"catalog: {type(exc).__name__}: {exc}")
    incremental_signals = {
        "startxref_count": raw_pdf.count(b"startxref"),
        "eof_count": raw_pdf.count(b"%%EOF"),
        "prev_token_count": len(re.findall(rb"/Prev\b", raw_pdf)),
    }
    incremental_updates_present = bool(
        incremental_signals["startxref_count"] > 1
        or incremental_signals["eof_count"] > 1
    )
    if incremental_updates_present:
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_incremental_updates_present",
                message="PDF contains incremental revision history; fully rewrite the file before anonymity review",
                location="PDF raw revision structure",
            )
        )
    for field in sorted(PDF_IDENTITY_FIELDS & set(metadata)):
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="identity_metadata",
                message="PDF metadata is not blank and may identify the team or editing environment",
                location="PDF Info dictionary",
                field=field,
            )
        )
    software_fields = {key: metadata[key] for key in ("creator", "producer") if key in metadata}
    if software_fields:
        findings.append(
            finding(
                level="warning",
                code="software_metadata_present",
                message="PDF software metadata remains; confirm the final metadata policy",
                location="PDF Info dictionary",
            )
        )
    xmp_metadata: dict[str, str] = {}
    try:
        xmp = reader.xmp_metadata
    except Exception:
        xmp = None
    if xmp is not None:
        xmp_fields = {
            "creator": "dc_creator",
            "title": "dc_title",
            "subject": "dc_subject",
            "keywords": "pdf_keywords",
            "creator_tool": "xmp_creator_tool",
        }
        for field, attribute in xmp_fields.items():
            raw_value = getattr(xmp, attribute, None)
            if isinstance(raw_value, dict):
                value = " | ".join(clean_value(item) for item in raw_value.values() if clean_value(item))
            elif isinstance(raw_value, (list, tuple, set)):
                value = " | ".join(clean_value(item) for item in raw_value if clean_value(item))
            else:
                value = clean_value(raw_value)
            if value:
                xmp_metadata[field] = value
        for field in sorted({"creator", "title", "subject", "keywords"} & set(xmp_metadata)):
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="identity_metadata",
                    message="PDF XMP metadata is not blank and may identify the team or artifact",
                    location="PDF XMP metadata",
                    field=field,
                )
            )
        if "creator_tool" in xmp_metadata:
            findings.append(
                finding(
                    level="warning",
                    code="software_metadata_present",
                    message="PDF XMP creator-tool metadata remains; confirm the final metadata policy",
                    location="PDF XMP metadata",
                )
            )

    raw_xmp_record: dict[str, Any] = {}
    raw_xmp_text = ""
    if hasattr(root, "get") and root.get("/Metadata") is not None:
        try:
            metadata_stream = resolved_pdf_object(root.get("/Metadata"))
            if not hasattr(metadata_stream, "get_data"):
                raise ValueError("Catalog Metadata object is not a readable stream")
            raw_xmp = metadata_stream.get_data()
            if len(raw_xmp) > 5 * 1024 * 1024:
                raise ValueError("raw XMP metadata exceeds 5 MiB inspection limit")
            xmp_root = ElementTree.fromstring(raw_xmp)
            raw_xmp_text = "\n".join(
                item for item in (xml_node_text(xmp_root), xml_attribute_text(xmp_root)) if item
            )
            raw_xmp_record = {
                "bytes": len(raw_xmp),
                "sha256": hashlib.sha256(raw_xmp).hexdigest(),
                "text_characters": len(raw_xmp_text),
            }
        except Exception as exc:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="pdf_xmp_uninspectable",
                    message=f"Could not completely inspect raw PDF XMP metadata: {type(exc).__name__}: {exc}",
                    location="PDF Catalog/Metadata",
                )
            )

    locations = [("filename", path.name)]
    locations.extend((f"metadata:{key}", value) for key, value in metadata.items())
    locations.extend((f"xmp:{key}", value) for key, value in xmp_metadata.items())
    if raw_xmp_text:
        locations.append(("pdf_raw_xmp", raw_xmp_text))

    all_object_refs: set[tuple[int, int]] = set()
    reachable_object_refs: set[tuple[int, int]] = set()
    unreachable_object_refs: list[tuple[int, int]] = []
    object_graph_errors: list[str] = []
    associated_file_refs: list[str] = []
    pdf_metadata_streams: list[dict[str, Any]] = []
    pdf_image_metadata: list[dict[str, Any]] = []
    pdf_media_errors: list[str] = []
    try:
        (
            all_object_refs,
            object_locations,
            object_errors,
            associated_file_refs,
            pdf_metadata_streams,
            pdf_image_metadata,
            pdf_media_errors,
        ) = pdf_all_indirect_object_strings(reader)
        locations.extend(object_locations)
        object_graph_errors.extend(object_errors)
        reachable_object_refs = pdf_reachable_object_refs(reader)
        unreachable_object_refs = sorted(all_object_refs - reachable_object_refs)
    except Exception as exc:
        object_graph_errors.append(f"xref/reachability: {type(exc).__name__}: {exc}")
    if unreachable_object_refs:
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_unreachable_objects_present",
                message=f"Found {len(unreachable_object_refs)} xref object(s) unreachable from the current trailer; fully rewrite the PDF",
                location=", ".join(f"{object_id}:{generation}" for object_id, generation in unreachable_object_refs[:200]),
            )
        )
    if object_graph_errors:
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_object_graph_uninspectable",
                message="Could not completely inspect all PDF xref objects: " + " | ".join(object_graph_errors[:50]),
                location="PDF xref/object graph",
            )
        )
    if associated_file_refs:
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_associated_files_present",
                message=f"Found PDF 2.0 associated-file arrays on {len(associated_file_refs)} object(s)",
                location=", ".join(associated_file_refs),
            )
        )
    identity_pdf_images = [row for row in pdf_image_metadata if row.get("identity_fields")]
    gps_pdf_images = [row for row in pdf_image_metadata if row.get("gps_present")]
    if identity_pdf_images:
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_image_identity_metadata_present",
                message=f"Found identity-bearing metadata in {len(identity_pdf_images)} encoded PDF image(s)",
                location=", ".join(str(row.get("object")) for row in identity_pdf_images),
            )
        )
    if gps_pdf_images:
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_image_gps_metadata_present",
                message=f"Found GPS/location metadata in {len(gps_pdf_images)} encoded PDF image(s)",
                location=", ".join(str(row.get("object")) for row in gps_pdf_images),
            )
        )
    if pdf_media_errors:
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_hidden_metadata_uninspectable",
                message="Could not completely inspect PDF metadata/image streams: " + " | ".join(pdf_media_errors[:50]),
                location="PDF xref metadata/image streams",
            )
        )

    outline_entries: list[str] = []
    document_level_strings: list[str] = []
    page_label_strings: list[str] = []
    structure_tree_strings: list[str] = []
    action_type_locations: list[tuple[str, str]] = []
    try:
        outline_entries = pdf_outline_titles(reader.outline)
        if outline_entries:
            locations.append(("pdf_outline", " | ".join(outline_entries)))
    except Exception as exc:
        pdf_structure_errors.append(f"outline: {type(exc).__name__}: {exc}")

    try:
        if hasattr(root, "get"):
            names_root = resolved_pdf_object(root.get("/Names"))
            if hasattr(names_root, "items"):
                for tree_name, tree_payload in names_root.items():
                    values = [clean_value(tree_name)] + pdf_name_tree_labels(tree_payload)
                    # JavaScript and embedded-file dictionaries can carry
                    # identity strings beyond the name-tree labels.  Inspect
                    # those payloads, but do not follow ordinary destinations.
                    if clean_value(tree_name) in {"/JavaScript", "/EmbeddedFiles"}:
                        values.extend(pdf_object_strings(tree_payload))
                    values = [item for item in values if item]
                    document_level_strings.extend(values)
                    if values:
                        locations.append((f"pdf_root:/Names/{clean_value(tree_name)}", " | ".join(values)))
            for key in ("/OpenAction", "/AA"):
                payload = root.get(key)
                if payload is not None:
                    values = pdf_object_strings(payload)
                    action_types = pdf_action_types(payload)
                    action_type_locations.extend((f"PDF Catalog{key}", item) for item in action_types)
                    document_level_strings.extend(values)
                    if values:
                        locations.append((f"pdf_root:{key}", " | ".join(values)))
            page_labels = root.get("/PageLabels")
            if page_labels is not None:
                page_label_strings = pdf_object_strings(page_labels)
                if page_label_strings:
                    locations.append(("pdf_page_labels", " | ".join(page_label_strings)))
            structure_tree = root.get("/StructTreeRoot")
            if structure_tree is not None:
                structure_tree_strings = pdf_structure_tree_strings(structure_tree)
                if structure_tree_strings:
                    locations.append(("pdf_structure_tree", " | ".join(structure_tree_strings)))
    except Exception as exc:
        pdf_structure_errors.append(f"document-level objects: {type(exc).__name__}: {exc}")

    if pdf_structure_errors:
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_structure_uninspectable",
                message="Could not completely inspect PDF outline or document-level names/actions: "
                + " | ".join(pdf_structure_errors),
                location="PDF Catalog",
            )
        )
    if hasattr(root, "get") and any(root.get(key) is not None for key in ("/OpenAction", "/AA")):
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_document_actions_present",
                message="PDF contains document-level open or additional actions",
                location="PDF Catalog",
            )
        )
    if hasattr(root, "get"):
        names_root = resolved_pdf_object(root.get("/Names"))
        if hasattr(names_root, "get") and names_root.get("/JavaScript") is not None:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="pdf_javascript_present",
                    message="PDF contains a document-level JavaScript name tree",
                    location="PDF Catalog/Names/JavaScript",
                )
            )

    xfa_present = False
    xfa_texts: list[str] = []
    catalog_form_structure_present = False
    if hasattr(root, "get") and root.get("/AcroForm") is not None:
        try:
            acroform = resolved_pdf_object(root.get("/AcroForm"))
            if not hasattr(acroform, "get"):
                raise ValueError("AcroForm is not a readable dictionary")
            xfa = acroform.get("/XFA")
            if xfa is not None:
                xfa_present = True
                xfa_texts = pdf_stream_texts(xfa)
                if xfa_texts:
                    locations.append(("pdf_xfa", " | ".join(xfa_texts)))
                findings.append(
                    finding(
                        level="error" if strict else "warning",
                        code="pdf_xfa_present",
                        message="PDF contains XFA packets; flatten/remove dynamic form content before submission",
                        location="PDF Catalog/AcroForm/XFA",
                    )
                )
            fields_payload = resolved_pdf_object(acroform.get("/Fields")) or []
            calculation_order = resolved_pdf_object(acroform.get("/CO")) or []
            need_appearances = bool(resolved_pdf_object(acroform.get("/NeedAppearances")))
            sig_flags = int(resolved_pdf_object(acroform.get("/SigFlags")) or 0)
            catalog_form_structure_present = bool(
                fields_payload or calculation_order or need_appearances or sig_flags
            )
            if catalog_form_structure_present:
                findings.append(
                    finding(
                        level="error" if strict else "warning",
                        code="pdf_form_fields_present",
                        message="PDF Catalog contains form fields, calculation order, appearance behavior, or signature flags",
                        location="PDF Catalog/AcroForm",
                    )
                )
        except Exception as exc:
            findings.append(
                finding(
                    level="error" if strict else "warning",
                    code="pdf_structure_uninspectable",
                    message=f"Could not completely inspect PDF AcroForm/XFA: {type(exc).__name__}: {exc}",
                    location="PDF Catalog/AcroForm",
                )
            )

    annotation_counts: Counter[str] = Counter()
    page_thumbnails: list[int] = []
    for page_number, page in enumerate(reader.pages, start=1):
        page_text = ""
        if terms:
            try:
                page_text = clean_value(page.extract_text() or "")
            except Exception:
                page_text = ""
        if page_text:
            locations.append((f"page:{page_number}", page_text))
        if page.get("/Thumb") is not None:
            page_thumbnails.append(page_number)
        page_actions = page.get("/AA")
        if page_actions is not None:
            try:
                values = pdf_object_strings(page_actions)
                action_types = pdf_action_types(page_actions)
                action_type_locations.extend((f"page:{page_number}:/AA", item) for item in action_types)
                if values:
                    locations.append((f"page:{page_number}:/AA", " | ".join(values)))
            except Exception as exc:
                pdf_structure_errors.append(f"page {page_number} actions: {type(exc).__name__}: {exc}")
        annotations = resolved_pdf_object(page.get("/Annots")) or []
        if not isinstance(annotations, (list, tuple)):
            try:
                annotations = list(annotations)
            except TypeError:
                annotations = []
        for annotation_index, reference in enumerate(annotations, start=1):
            annotation = resolved_pdf_object(reference)
            if not hasattr(annotation, "get"):
                continue
            subtype = clean_value(annotation.get("/Subtype")).lstrip("/") or "Unknown"
            annotation_counts[subtype] += 1
            values = []
            for key in ("/T", "/Contents", "/Subj", "/NM", "/TU", "/V", "/DV"):
                value = clean_value(resolved_pdf_object(annotation.get(key)))
                if value:
                    values.append(f"{key}={value}")
            for key in ("/A", "/AA", "/Dest"):
                payload = annotation.get(key)
                if payload is None:
                    continue
                try:
                    hidden_values = pdf_object_strings(payload)
                    values.extend(f"{key}={item}" for item in hidden_values)
                    action_types = pdf_action_types(payload)
                    action_type_locations.extend(
                        (f"page:{page_number}:annotation:{annotation_index}:{key}", item)
                        for item in action_types
                    )
                except Exception as exc:
                    pdf_structure_errors.append(
                        f"page {page_number} annotation {annotation_index} {key}: {type(exc).__name__}: {exc}"
                    )
            if values:
                locations.append((f"page:{page_number}:annotation:{annotation_index}", " | ".join(values)))

    if page_thumbnails:
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_page_thumbnails_present",
                message=f"Found stale-capable page thumbnail streams on {len(page_thumbnails)} page(s); remove them before submission",
                location=", ".join(str(item) for item in page_thumbnails),
            )
        )

    review_annotation_count = sum(
        count for name, count in annotation_counts.items() if name not in PDF_SAFE_ANNOTATION_SUBTYPES
    )
    if review_annotation_count:
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_review_annotations_present",
                message=f"Found {review_annotation_count} PDF review/comment annotation(s)",
                location="PDF page annotations",
            )
        )

    form_fields: dict[str, Any] = {}
    try:
        form_fields = reader.get_fields() or {}
    except Exception:
        form_fields = {}
    for field_name, field_payload in form_fields.items():
        values = [clean_value(field_name)]
        if hasattr(field_payload, "get"):
            for key in ("/T", "/TU", "/TM", "/V", "/DV"):
                value = clean_value(resolved_pdf_object(field_payload.get(key)))
                if value:
                    values.append(f"{key}={value}")
            for key in ("/A", "/AA"):
                payload = field_payload.get(key)
                if payload is None:
                    continue
                try:
                    hidden_values = pdf_object_strings(payload)
                    values.extend(f"{key}={item}" for item in hidden_values)
                    action_types = pdf_action_types(payload)
                    action_type_locations.extend((f"pdf_form:{field_name}:{key}", item) for item in action_types)
                except Exception as exc:
                    pdf_structure_errors.append(f"form {field_name} {key}: {type(exc).__name__}: {exc}")
        locations.append((f"pdf_form:{field_name}", " | ".join(item for item in values if item)))
    if form_fields and not catalog_form_structure_present:
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_form_fields_present",
                message=f"Found {len(form_fields)} PDF form field(s) with potentially hidden values or identities",
                location="PDF AcroForm",
            )
        )

    optional_content_names: list[str] = []
    try:
        oc_properties = resolved_pdf_object(root.get("/OCProperties")) if hasattr(root, "get") else None
        oc_groups = resolved_pdf_object(oc_properties.get("/OCGs")) if hasattr(oc_properties, "get") else []
        for reference in oc_groups or []:
            group = resolved_pdf_object(reference)
            name = clean_value(group.get("/Name")) if hasattr(group, "get") else ""
            optional_content_names.append(name or "unnamed")
    except Exception:
        optional_content_names = []
    if optional_content_names:
        locations.append(("pdf_optional_content", " | ".join(optional_content_names)))
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_optional_content_present",
                message=f"Found {len(optional_content_names)} optional-content layer(s); flatten or inspect every layer",
                location="PDF OCProperties",
            )
        )

    dangerous_actions = [
        (location, action_type)
        for location, action_type in action_type_locations
        if action_type in PDF_DANGEROUS_ACTION_TYPES
    ]
    if dangerous_actions:
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_dangerous_actions_present",
                message="Found dangerous PDF action type(s): "
                + ", ".join(sorted({action_type for _, action_type in dangerous_actions})),
                location=" | ".join(f"{location}={action_type}" for location, action_type in dangerous_actions),
            )
        )

    # Action/page/form traversal happens after the first structure check.
    # Emit one additional fail-closed finding if those later inspections failed.
    late_structure_errors = [
        item for item in pdf_structure_errors
        if item.startswith(("page ", "form "))
    ]
    if late_structure_errors:
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_structure_uninspectable",
                message="Could not completely inspect PDF page, annotation, or form actions: "
                + " | ".join(late_structure_errors),
                location="PDF page/form actions",
            )
        )

    attachments = []
    try:
        attachments = sorted((reader.attachments or {}).keys())
    except (AttributeError, TypeError):
        attachments = []
    if attachments:
        locations.append(("pdf_attachments", " | ".join(attachments)))
        findings.append(
            finding(
                level="error" if strict else "warning",
                code="pdf_attachments_present",
                message=f"Found {len(attachments)} embedded PDF attachment(s)",
                location="PDF Names/EmbeddedFiles",
            )
        )
    findings.extend(forbidden_hits(terms, locations))
    return {
        "details": {
            "metadata": metadata,
            "xmp_metadata": xmp_metadata,
            "raw_xmp": raw_xmp_record,
            "incremental_update_signals": incremental_signals,
            "physical_boundary": {
                "header_offset": pdf_header_offset,
                "last_eof_offset": last_eof_offset,
                "trailing_bytes": len(trailing_after_eof),
                "extra_data_present": pdf_extra_data_present,
            },
            "page_count": len(reader.pages),
            "encrypted": encrypted,
            "attachments": attachments,
            "annotation_counts": dict(sorted(annotation_counts.items())),
            "form_fields": sorted(str(item) for item in form_fields),
            "xfa_present": xfa_present,
            "xfa_packet_count": len(xfa_texts),
            "optional_content_layers": optional_content_names,
            "outline_entries": outline_entries,
            "document_level_strings": document_level_strings,
            "structure_errors": pdf_structure_errors,
            "page_label_strings": page_label_strings,
            "structure_tree_strings": structure_tree_strings,
            "action_types": [
                {"location": location, "type": action_type}
                for location, action_type in action_type_locations
            ],
            "xref_object_count": len(all_object_refs),
            "reachable_object_count": len(reachable_object_refs),
            "unreachable_object_refs": [
                {"object_id": object_id, "generation": generation}
                for object_id, generation in unreachable_object_refs[:1000]
            ],
            "object_graph_errors": object_graph_errors,
            "associated_file_object_refs": associated_file_refs,
            "metadata_streams": pdf_metadata_streams,
            "image_metadata": pdf_image_metadata,
            "hidden_metadata_errors": pdf_media_errors,
            "page_thumbnails": page_thumbnails,
        },
        "findings": findings,
    }


def discover(paths: list[str]) -> list[Path]:
    discovered: dict[Path, None] = {}
    for raw_path in paths:
        path = Path(raw_path).expanduser().resolve()
        if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES:
            discovered[path] = None
        elif path.is_dir():
            for candidate in sorted(path.rglob("*")):
                if candidate.is_file() and candidate.suffix.lower() in SUPPORTED_SUFFIXES:
                    discovered[candidate.resolve()] = None
        else:
            raise ValueError(f"No supported submission file found at: {raw_path}")
    if not discovered:
        raise ValueError("No DOCX, PPTX, or PDF submission file was discovered")
    return sorted(discovered)


def audit_file(path: Path, *, strict: bool, terms: list[str]) -> dict[str, Any]:
    base = {
        "path": str(path),
        "type": path.suffix.lower(),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }
    if path.suffix.lower() in {".docx", ".pptx"}:
        result = audit_office(path, strict=strict, terms=terms)
    else:
        result = audit_pdf(path, strict=strict, terms=terms)
    findings = result["findings"]
    base.update(result)
    base["summary"] = {
        "errors": sum(item["level"] == "error" for item in findings),
        "warnings": sum(item["level"] == "warning" for item in findings),
    }
    return base


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", help="Submission file or directory; repeat as needed")
    parser.add_argument("--strict", action="store_true", help="Fail on identity metadata and editing residue")
    parser.add_argument("--forbidden-term", action="append", default=[], help="Identity term that must not appear; repeat as needed")
    parser.add_argument("--output")
    args = parser.parse_args()

    try:
        files = discover(args.paths)
        results = [audit_file(path, strict=args.strict, terms=args.forbidden_term) for path in files]
    except (OSError, ValueError, RuntimeError, zipfile.BadZipFile, ElementTree.ParseError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    errors = [
        {"path": row["path"], **item}
        for row in results
        for item in row["findings"]
        if item["level"] == "error"
    ]
    warnings = [
        {"path": row["path"], **item}
        for row in results
        for item in row["findings"]
        if item["level"] == "warning"
    ]
    payload = {
        "schema_version": "1.0.0",
        "strict": args.strict,
        "files": results,
        "errors": errors,
        "warnings": warnings,
        "summary": {
            "files": len(results),
            "errors": len(errors),
            "warnings": len(warnings),
            "passed": not errors,
        },
    }
    rendered = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
