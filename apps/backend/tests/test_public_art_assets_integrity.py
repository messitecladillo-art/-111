"""Deterministic integrity & metadata-hygiene guard for all 32 static PNG assets in public/art."""

from __future__ import annotations

import io
from pathlib import Path
import re
import struct
import zlib

from PIL import Image
import pytest

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
ART_ROOT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "art"

EXPECTED_A4_1000X1414 = frozenset(
    {
        "candidates/backdrop-cand-a.png",
        "candidates/backdrop-cand-b.png",
        "candidates/backdrop-cand-c.png",
        "candidates/backdrop-cand-d.png",
        "candidates/backdrop-cand-e.png",
        "candidates/backdrop-cand-f.png",
        "candidates/cover-cand-a.png",
        "candidates/cover-cand-b.png",
        "candidates/cover-cand-c.png",
        "candidates/cover-cand-d.png",
        "candidates/cover-cand-e.png",
        "candidates/cover-cand-f.png",
        "candidates/cover-v3-1.png",
        "candidates/cover-v3-2.png",
        "candidates/cover-v3-3.png",
        "candidates/cover-v3-4.png",
        "cover-blue-editorial.png",
        "cover-burgundy-editorial.png",
        "cover-silver-illustrated.png",
        "cover-teal-editorial.png",
        "frame-academic-a4.png",
        "frame-blue-geometric-a4.png",
    }
)
EXPECTED_A4_FRAMES_1240X1754 = frozenset(
    {
        "candidates/frame-cand-a.png",
        "candidates/frame-cand-b.png",
        "candidates/frame-cand-c.png",
    }
)
EXPECTED_EXHIBITS_1280X720 = frozenset(
    {
        "demographic-retail-profile.png",
        "demographic-silver-profile.png",
        "overview-instant-retail.png",
        "overview-silver-health.png",
        "roadmap-retail-action.png",
        "roadmap-silver-action.png",
        "summary-classification-support.png",
    }
)
ALL_EXPECTED_PNGS = EXPECTED_A4_1000X1414 | EXPECTED_A4_FRAMES_1240X1754 | EXPECTED_EXHIBITS_1280X720

LOCAL_PATH_RE = re.compile(
    r"(?:[A-Za-z]:[\\/]+Users[\\/]+|(?<![A-Za-z0-9])/Users/[A-Za-z0-9._-]+|(?<![A-Za-z0-9])/home/[A-Za-z0-9._-]+|AppData[\\/]+Local)",
    re.IGNORECASE,
)
SECRET_TOKEN_RE = re.compile(
    r"(?:\bsk-[A-Za-z0-9_-]{12,}|\bAIza[0-9A-Za-z_-]{16,}|Authorization\s*:\s*Bearer\s+\S+|\bEVIX_(?:AUTH_SECRET|KEYRING)\b)",
    re.IGNORECASE,
)
CORNER_BRACKET_RE = re.compile(r"[\u300c\u300d\u300e\u300f\u3010\u3011]")


def parse_png_structure_and_metadata(raw: bytes) -> dict:
    """Parse raw PNG binary chunks, verify CRC32s, extract IHDR dimensions, and decode tEXt/zTXt/iTXt/eXIf."""
    if len(raw) < 33 or raw[:8] != PNG_SIGNATURE:
        raise ValueError("Invalid PNG file signature")

    pos = 8
    chunks: list[str] = []
    width = height = 0
    bit_depth = color_type = 0
    idat_bytes = 0
    metadata_entries: list[tuple[str, str]] = []

    while pos < len(raw):
        if pos + 8 > len(raw):
            raise ValueError("Truncated PNG chunk header")
        length = struct.unpack(">I", raw[pos : pos + 4])[0]
        ctype_bytes = raw[pos + 4 : pos + 8]
        ctype = ctype_bytes.decode("ascii")
        data_start = pos + 8
        data_end = data_start + length
        crc_end = data_end + 4
        if crc_end > len(raw):
            raise ValueError(f"Truncated PNG chunk body for {ctype}")

        cdata = raw[data_start:data_end]
        expected_crc = struct.unpack(">I", raw[data_end:crc_end])[0]
        actual_crc = zlib.crc32(ctype_bytes + cdata) & 0xFFFFFFFF
        if actual_crc != expected_crc:
            raise ValueError(f"CRC32 mismatch in chunk {ctype}")

        chunks.append(ctype)
        pos = crc_end

        if ctype == "IHDR":
            if length != 13:
                raise ValueError("IHDR chunk must be 13 bytes")
            width, height, bit_depth, color_type, _, _, _ = struct.unpack(">IIBBBBB", cdata)
        elif ctype == "IDAT":
            idat_bytes += length
        elif ctype == "tEXt":
            nul = cdata.find(b"\x00")
            if nul != -1:
                key = cdata[:nul].decode("latin1", errors="replace")
                val = cdata[nul + 1 :].decode("utf-8", errors="replace")
                metadata_entries.append((ctype, f"{key}={val}"))
            else:
                metadata_entries.append((ctype, cdata.decode("utf-8", errors="replace")))
        elif ctype == "zTXt":
            nul = cdata.find(b"\x00")
            if nul == -1 or nul + 2 > len(cdata):
                raise ValueError("Malformed zTXt chunk")
            key = cdata[:nul].decode("latin1", errors="replace")
            inflated = zlib.decompress(cdata[nul + 2 :]).decode("utf-8", errors="replace")
            metadata_entries.append((ctype, f"{key}={inflated}"))
        elif ctype == "iTXt":
            nul = cdata.find(b"\x00")
            if nul == -1 or nul + 3 > len(cdata):
                raise ValueError("Malformed iTXt chunk")
            key = cdata[:nul].decode("latin1", errors="replace")
            comp_flag = cdata[nul + 1]
            rest = cdata[nul + 3 :]
            # Skip language tag and translated keyword (two NUL-terminated fields)
            lang_nul = rest.find(b"\x00")
            if lang_nul != -1:
                after_lang = rest[lang_nul + 1 :]
                trans_nul = after_lang.find(b"\x00")
                text_bytes = after_lang[trans_nul + 1 :] if trans_nul != -1 else after_lang
            else:
                text_bytes = rest
            text_val = (
                zlib.decompress(text_bytes).decode("utf-8", errors="replace")
                if comp_flag == 1
                else text_bytes.decode("utf-8", errors="replace")
            )
            metadata_entries.append((ctype, f"{key}={text_val}"))
        elif ctype == "eXIf":
            metadata_entries.append((ctype, cdata.decode("utf-8", errors="replace")))

        if ctype == "IEND":
            break

    if not chunks or chunks[0] != "IHDR" or chunks[-1] != "IEND" or idat_bytes <= 0:
        raise ValueError("Incomplete PNG chunk sequence")

    return {
        "width": width,
        "height": height,
        "bitDepth": bit_depth,
        "colorType": color_type,
        "idatBytes": idat_bytes,
        "chunks": chunks,
        "metadata": metadata_entries,
    }


def find_metadata_hygiene_violations(metadata_entries: list[tuple[str, str]]) -> list[str]:
    issues: list[str] = []
    for ctype, text in metadata_entries:
        if LOCAL_PATH_RE.search(text):
            issues.append(f"{ctype}:local_path_leak")
        if SECRET_TOKEN_RE.search(text):
            issues.append(f"{ctype}:secret_token_leak")
        if CORNER_BRACKET_RE.search(text):
            issues.append(f"{ctype}:corner_bracket_residue")
    return issues


def test_public_art_directory_inventory_and_default_cover_sync():
    assert ART_ROOT.is_dir(), f"Missing art directory: {ART_ROOT}"

    all_files = [p for p in ART_ROOT.rglob("*") if p.is_file()]
    forbidden_ext = {".icns", ".jxl", ".heif", ".heic", ".avif"}
    assert not [p.name for p in all_files if p.suffix.lower() in forbidden_ext]

    png_rels = {p.relative_to(ART_ROOT).as_posix() for p in all_files if p.suffix.lower() == ".png"}
    assert len(png_rels) == 32
    assert png_rels == ALL_EXPECTED_PNGS

    # Default showcase cover stays byte-for-byte synchronized with candidate f
    silver_bytes = (ART_ROOT / "cover-silver-illustrated.png").read_bytes()
    cand_f_bytes = (ART_ROOT / "candidates" / "cover-cand-f.png").read_bytes()
    assert silver_bytes == cand_f_bytes


@pytest.mark.parametrize("rel_path", sorted(ALL_EXPECTED_PNGS))
def test_each_public_art_png_signature_ihdr_dimensions_size_and_metadata_hygiene(rel_path: str):
    file_path = ART_ROOT / rel_path
    raw = file_path.read_bytes()

    # Non-empty bounded asset budget (15 KB .. 1 MB)
    assert 15_000 <= len(raw) <= 1_048_576, f"{rel_path} size out of bounds: {len(raw)}"

    parsed = parse_png_structure_and_metadata(raw)
    dims = (parsed["width"], parsed["height"])
    if rel_path in EXPECTED_A4_1000X1414:
        assert dims == (1000, 1414), f"{rel_path} expected 1000x1414, got {dims}"
    elif rel_path in EXPECTED_A4_FRAMES_1240X1754:
        assert dims == (1240, 1754), f"{rel_path} expected 1240x1754, got {dims}"
    else:
        assert dims == (1280, 720), f"{rel_path} expected 1280x720, got {dims}"

    violations = find_metadata_hygiene_violations(parsed["metadata"])
    assert not violations, f"{rel_path} leaked metadata in PNG chunks: {violations}"

    # Verify full raster decode & frame center transparency invariant
    with Image.open(io.BytesIO(raw)) as img:
        img.verify()
    if Path(rel_path).name.startswith("frame-"):
        with Image.open(io.BytesIO(raw)) as frame_img:
            rgba = frame_img.convert("RGBA")
            cx, cy = rgba.width // 2, rgba.height // 2
            assert rgba.getpixel((cx, cy))[3] == 0, f"{rel_path} center body zone must stay transparent"


def _inject_chunk_before_iend(base_png: bytes, chunk_type: bytes, chunk_data: bytes) -> bytes:
    iend_offset = len(base_png) - 12
    assert base_png[iend_offset + 4 : iend_offset + 8] == b"IEND"
    crc = zlib.crc32(chunk_type + chunk_data) & 0xFFFFFFFF
    packed = struct.pack(">I", len(chunk_data)) + chunk_type + chunk_data + struct.pack(">I", crc)
    return base_png[:iend_offset] + packed + base_png[iend_offset:]


def test_png_metadata_scanner_catches_synthetic_text_ztxt_itxt_and_exif_leaks():
    buf = io.BytesIO()
    Image.new("RGB", (16, 16), (255, 255, 255)).save(buf, format="PNG")
    clean_png = buf.getvalue()
    assert find_metadata_hygiene_violations(parse_png_structure_and_metadata(clean_png)["metadata"]) == []

    # 1. tEXt leak: Windows local path
    win_leak = _inject_chunk_before_iend(clean_png, b"tEXt", b"Source\x00C:\\Users\\demo_author\\Desktop\\draft.png")
    assert "tEXt:local_path_leak" in find_metadata_hygiene_violations(
        parse_png_structure_and_metadata(win_leak)["metadata"]
    )

    # 2. zTXt leak: zlib-compressed secret API key
    ztxt_body = b"Comment\x00\x00" + zlib.compress(b"Generated with sk-liveSecretToken1234567890")
    sec_leak = _inject_chunk_before_iend(clean_png, b"zTXt", ztxt_body)
    assert "zTXt:secret_token_leak" in find_metadata_hygiene_violations(
        parse_png_structure_and_metadata(sec_leak)["metadata"]
    )

    # 3. iTXt leak: compressed UTF-8 corner brackets
    itxt_body = b"Title\x00\x01\x00zh\x00\x00" + zlib.compress("\u94f6\u53d1\u300c\u667a\u300d\u5b88".encode("utf-8"))
    brk_leak = _inject_chunk_before_iend(clean_png, b"iTXt", itxt_body)
    assert "iTXt:corner_bracket_residue" in find_metadata_hygiene_violations(
        parse_png_structure_and_metadata(brk_leak)["metadata"]
    )

    # 4. eXIf leak: POSIX /Users/ path
    exif_leak = _inject_chunk_before_iend(clean_png, b"eXIf", b"Exif\x00\x00/Users/designer/exports/cover.png")
    assert "eXIf:local_path_leak" in find_metadata_hygiene_violations(
        parse_png_structure_and_metadata(exif_leak)["metadata"]
    )
