"""Deterministic page-perimeter vectors; no arbitrary SVG, TeX or image execution.

The public functions accept plain dictionaries so product adapters can share the
same coordinate/primitive contract without importing a document framework.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import sys
from datetime import datetime
from decimal import Decimal, InvalidOperation
import xml.etree.ElementTree as ET

NS = "http://www.w3.org/2000/svg"
PT_MM = 25.4 / 72
MAX_SVG_BYTES = 256_000
MAX_PRIMITIVES = 128
MAX_POINTS = 64
VARIANTS = {"body", "chapter", "cover"}
THEMES = {"finance-grid", "sports-track"}
LAYOUTS = {"none", "corners", "open", "closed"}
AREA_KINDS = {"header", "footer", "page_number", "caption", "footnote", "other"}
HEX = re.compile(r"#[0-9a-fA-F]{6}\Z")
KEYS = {
    "schema", "id", "version", "title", "status", "theme", "variant", "layout",
    "paper", "marginsMm", "guardMm", "trimGuardMm", "protectedAreas", "palette",
    "lineWidthPt", "cornerSizeMm", "density", "strength", "appliesTo",
    "sourceConcept", "review",
}


class FrameError(ValueError):
    """A candidate is unsupported or cannot safely fit the chosen layout."""


def _object(value, keys, label):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise FrameError(f"{label}: expected exactly {', '.join(sorted(keys))}")
    return value


def _number(value, label, low=-10_000, high=10_000):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise FrameError(f"{label}: finite number required")
    if not math.isfinite(value) or not low <= value <= high:
        raise FrameError(f"{label}: expected {low}..{high}")
    return float(value)


def _text(value, label, maximum=160):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise FrameError(f"{label}: non-empty text up to {maximum} characters required")
    if any(ord(c) < 32 for c in value):
        raise FrameError(f"{label}: control characters are forbidden")
    return value


def _integer(value, label, minimum=1):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value != int(value) or not minimum <= value <= 1_000_000:
        raise FrameError(f"{label}: integer required")
    return value


def canonical_json(value):
    """Bounded non-RFC serializer shared with the TypeScript frame adapter.

    Numeric leaves have <=6 fractional decimals, fixed notation, no negative
    zero. This avoids Python 1.0 / JS 1 and exponent formatting differences.
    """
    if value is None or isinstance(value, (str, bool)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, (int, float)):
        if not math.isfinite(value) or abs(value) > 1_000_000:
            raise FrameError("canonical numeric value outside finite bound")
        try:
            decimal = Decimal(str(value))
            if decimal != decimal.quantize(Decimal("0.000001")):
                raise FrameError("frame numbers support at most six fractional decimal places")
        except InvalidOperation:
            raise FrameError("invalid canonical numeric value") from None
        if decimal == 0:
            return "0"
        return format(decimal, ".6f").rstrip("0").rstrip(".")
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if isinstance(value, dict) and all(isinstance(key, str) for key in value):
        return "{" + ",".join(json.dumps(key, ensure_ascii=False) + ":" + canonical_json(value[key]) for key in sorted(value)) + "}"
    raise FrameError("unsupported canonical value")


def definition_hash(spec):
    content = {k: v for k, v in spec.items() if k not in {"status", "review"}}
    raw = canonical_json(content)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _rect(x, y, width, height, ident, kind):
    return {"id": ident, "kind": kind, "xMm": x, "yMm": y, "widthMm": width, "heightMm": height}


def validate_spec(spec, require_approved=False):
    _object(spec, KEYS, "style")
    if spec["schema"] != "ReportFrameStyle/v1":
        raise FrameError("unsupported frame schema")
    _text(spec["id"], "id", 96)
    _integer(spec["version"], "version")
    _text(spec["title"], "title")
    if spec["status"] not in {"concept", "vector_draft", "approved"}:
        raise FrameError("unknown review status")
    if spec["theme"] not in THEMES or spec["variant"] not in VARIANTS or spec["layout"] not in LAYOUTS:
        raise FrameError("unsupported theme, variant or layout")
    paper = _object(spec["paper"], {"widthMm", "heightMm"}, "paper")
    width = _number(paper["widthMm"], "paper.widthMm", 80, 594)
    height = _number(paper["heightMm"], "paper.heightMm", 80, 594)
    margins = _object(spec["marginsMm"], {"top", "right", "bottom", "left"}, "marginsMm")
    for key, value in margins.items():
        _number(value, f"marginsMm.{key}", 6, min(width, height) / 2)
    guard = _number(spec["guardMm"], "guardMm", 3, 12)
    trim = _number(spec["trimGuardMm"], "trimGuardMm", 0, 10)
    body_width = width - margins["left"] - margins["right"]
    body_height = height - margins["top"] - margins["bottom"]
    if body_width < 50 or body_height < 60:
        raise FrameError("text area too small for this controlled report frame")
    body = _rect(margins["left"], margins["top"], body_width, body_height, "body", "body")
    protected = [_rect(body["xMm"] - guard, body["yMm"] - guard,
                       body_width + guard * 2, body_height + guard * 2, "body-guard", "body")]
    areas = spec["protectedAreas"]
    if not isinstance(areas, list) or len(areas) > 24:
        raise FrameError("protectedAreas: expected at most 24 rectangles")
    ids = {"body", "body-guard"}
    for area in areas:
        _object(area, {"id", "kind", "xMm", "yMm", "widthMm", "heightMm"}, "protected area")
        ident = _text(area["id"], "protected area id", 96)
        if ident in ids:
            raise FrameError("duplicate protected area id")
        ids.add(ident)
        if area["kind"] not in AREA_KINDS:
            raise FrameError("unsupported protected area kind")
        x = _number(area["xMm"], "area.xMm", 0, width)
        y = _number(area["yMm"], "area.yMm", 0, height)
        aw = _number(area["widthMm"], "area.widthMm", 0.1, width)
        ah = _number(area["heightMm"], "area.heightMm", 0.1, height)
        if x + aw > width or y + ah > height:
            raise FrameError("protected area outside paper")
        protected.append(dict(area))
    palette = _object(spec["palette"], {"id", "version", "primary", "secondary", "accent"}, "palette")
    _text(palette["id"], "palette.id", 96)
    _integer(palette["version"], "palette.version")
    for key in ("primary", "secondary", "accent"):
        if not isinstance(palette[key], str) or not HEX.fullmatch(palette[key]):
            raise FrameError(f"palette.{key}: six-digit hex required")
    _number(spec["lineWidthPt"], "lineWidthPt", 0.25, 2)
    _number(spec["cornerSizeMm"], "cornerSizeMm", 2, 24)
    _number(spec["density"], "density", 0, 1)
    _number(spec["strength"], "strength", 0, 1)
    scope = spec["appliesTo"]
    if not isinstance(scope, list) or not scope or len(set(scope)) != len(scope) or not set(scope) <= VARIANTS | {"appendix"}:
        raise FrameError("appliesTo: unique page types required")
    concept = spec["sourceConcept"]
    if concept is not None:
        _object(concept, {"assetId", "sha256", "promptRef"}, "sourceConcept")
        _text(concept["assetId"], "sourceConcept.assetId", 96)
        _text(concept["promptRef"], "sourceConcept.promptRef", 240)
        if not isinstance(concept["sha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", concept["sha256"]):
            raise FrameError("sourceConcept.sha256: lowercase SHA-256 required")
    review = spec["review"]
    if spec["status"] == "approved":
        _object(review, {"decision", "reviewer", "at", "definitionSha256"}, "review")
        if review["decision"] != "approved" or review["definitionSha256"] != definition_hash(spec):
            raise FrameError("approval does not bind this exact frame definition")
        _text(review["reviewer"], "review.reviewer", 160)
        try:
            if not isinstance(review["at"], str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})", review["at"]):
                raise ValueError("bounded ISO timestamp required")
            date = datetime.fromisoformat(review["at"].replace("Z", "+00:00"))
            if date.tzinfo is None or date.utcoffset() is None:
                raise ValueError("timezone missing")
        except (ValueError, TypeError, AttributeError):
            raise FrameError("review.at: timezone-aware ISO timestamp required") from None
    elif review is not None:
        raise FrameError("draft/concept must not carry an approval record")
    if require_approved and spec["status"] != "approved":
        raise FrameError("formal output requires explicit hash-bound approval")
    definition_hash(spec)  # Enforce the shared numeric precision, also for drafts.
    return {"body": body, "protected": protected, "width": width, "height": height, "trim": trim}


def _style(spec, colour="primary", opacity=1, fill="none"):
    return {"stroke": spec["palette"][colour], "fill": fill,
            "strokeWidthPt": spec["lineWidthPt"], "opacity": round(spec["strength"] * opacity, 6)}


def _line(spec, x1, y1, x2, y2, colour="primary", opacity=1):
    return {"type": "line", "x1": x1, "y1": y1, "x2": x2, "y2": y2, **_style(spec, colour, opacity)}


def _polyline(spec, points, colour="primary", opacity=1):
    return {"type": "polyline", "points": points, **_style(spec, colour, opacity)}


def _circle(spec, cx, cy, radius, colour="secondary", opacity=1):
    return {"type": "circle", "cx": cx, "cy": cy, "r": radius,
            **_style(spec, colour, opacity, spec["palette"][colour])}


def make_primitives(spec):
    geometry = validate_spec(spec)
    if spec["status"] == "concept":
        raise FrameError("a raster concept must be reconstructed as vector_draft before building")
    if spec["layout"] == "none":
        return []
    body, guard = geometry["body"], spec["guardMm"]
    left, top = body["xMm"] - guard - 2, body["yMm"] - guard - 2
    right = body["xMm"] + body["widthMm"] + guard + 2
    bottom = body["yMm"] + body["heightMm"] + guard + 2
    size = spec["cornerSizeMm"]
    gap = 1.6
    primitives = []
    # Frame strokes live outside the text guard. No enclosing filled rectangle.
    if spec["layout"] == "closed":
        primitives.extend([
            _line(spec, left, top, right, top), _line(spec, right, top, right, bottom),
            _line(spec, right, bottom, left, bottom), _line(spec, left, bottom, left, top),
        ])
    elif spec["layout"] == "open":
        primitives.extend([
            _line(spec, left + size, top, right - size, top, "secondary", 0.7),
            _line(spec, left, top + size, left, bottom - size, "secondary", 0.7),
            _line(spec, right, top + size, right, bottom - size, "secondary", 0.7),
        ])
    # Each corner's local positive coordinates face outward, never inward.
    corners = [(left, top, -1, -1), (right, top, 1, -1),
               (left, bottom, -1, 1), (right, bottom, 1, 1)]
    weight = {"body": 1, "chapter": 1.15, "cover": 1.3}[spec["variant"]]
    repeats = min(4, 1 + int(spec["density"] * 2) + (spec["variant"] != "body"))
    for index, (cx, cy, sx, sy) in enumerate(corners):
        # Short inward-facing strokes remain on the outer horizontal/vertical rail.
        if spec["layout"] != "closed":
            primitives.extend([
                _line(spec, cx - sx * size, cy, cx, cy),
                _line(spec, cx, cy, cx, cy - sy * size),
            ])
        if spec["theme"] == "finance-grid":
            for repeat in range(repeats):
                scale = max(2.0, size - repeat * 3.0)
                px, py = cx + sx * gap * (repeat + 1), cy + sy * gap * (repeat + 1)
                points = [(px, py + sy * scale * 0.7), (px, py),
                          (px + sx * scale * 0.45, py),
                          (px + sx * scale * 0.45, py + sy * scale * 0.25),
                          (px + sx * scale * 0.8, py + sy * scale * 0.25)]
                primitives.append(_polyline(spec, points, "primary" if repeat == 0 else "secondary", 1 / weight))
            if spec["density"] >= 0.25:
                primitives.append(_circle(spec, cx + sx * (size * 0.8 + gap), cy + sy * gap, 0.55, "accent"))
        else:
            # Rounded running-track contour: quarter arc approximated by finite
            # native line segments, not an opaque path or embedded image.
            for repeat in range(repeats):
                radius = max(2.0, size - repeat * 2.4)
                points = [(cx + sx * radius * math.cos(j * math.pi / 24),
                           cy + sy * radius * math.sin(j * math.pi / 24)) for j in range(13)]
                primitives.append(_polyline(spec, points, "primary" if repeat == 0 else "secondary", 1 / weight))
            if spec["variant"] != "body" or spec["density"] > 0.6:
                primitives.append(_circle(spec, cx + sx * size * 0.72, cy + sy * size * 0.72, 0.65, "accent"))
        if spec["variant"] == "cover" and index in {0, 3}:
            primitives.append(_line(spec, cx - sx * size * 1.8, cy + sy * 1.2,
                                    cx - sx * size * 0.2, cy + sy * 1.2, "accent", 0.8))
    return primitives


def _segment_intersects_rect(x1, y1, x2, y2, rect, padding=0):
    """Closed Liang–Barsky test, including touching an exclusion boundary."""
    xmin, ymin = rect["xMm"] - padding, rect["yMm"] - padding
    xmax, ymax = xmin + rect["widthMm"] + padding * 2, ymin + rect["heightMm"] + padding * 2
    dx, dy = x2 - x1, y2 - y1
    enter, leave = 0.0, 1.0
    for p, q in ((-dx, x1 - xmin), (dx, xmax - x1), (-dy, y1 - ymin), (dy, ymax - y1)):
        if abs(p) < 1e-12:
            if q < 0:
                return False
        else:
            ratio = q / p
            if p < 0:
                enter = max(enter, ratio)
            else:
                leave = min(leave, ratio)
            if enter > leave:
                return False
    return True


def _bounds_and_segments(primitive):
    kind = primitive["type"]
    if kind == "line":
        points = [(primitive["x1"], primitive["y1"]), (primitive["x2"], primitive["y2"])]
    elif kind == "polyline":
        points = primitive["points"]
    elif kind == "rect":
        x, y, width, height = (primitive[k] for k in ("x", "y", "width", "height"))
        points = [(x, y), (x + width, y), (x + width, y + height), (x, y + height), (x, y)]
    elif kind == "circle":
        x, y, radius = (primitive[k] for k in ("cx", "cy", "r"))
        return (x - radius, y - radius, x + radius, y + radius), []
    else:
        raise FrameError("unsupported primitive")
    return (min(p[0] for p in points), min(p[1] for p in points),
            max(p[0] for p in points), max(p[1] for p in points)), list(zip(points, points[1:]))


def validate_primitives(primitives, spec):
    geometry = validate_spec(spec)
    if not isinstance(primitives, list) or len(primitives) > MAX_PRIMITIVES:
        raise FrameError(f"at most {MAX_PRIMITIVES} primitives are allowed")
    colours = {spec["palette"][key].lower() for key in ("primary", "secondary", "accent")}
    geometry_keys = {
        "line": {"x1", "y1", "x2", "y2"}, "polyline": {"points"},
        "rect": {"x", "y", "width", "height", "rx"}, "circle": {"cx", "cy", "r"},
    }
    for index, primitive in enumerate(primitives):
        if not isinstance(primitive, dict) or primitive.get("type") not in geometry_keys:
            raise FrameError(f"primitive {index}: unsupported type")
        kind = primitive["type"]
        _object(primitive, geometry_keys[kind] | {"type", "stroke", "fill", "strokeWidthPt", "opacity"}, f"primitive {index}")
        for key in ("stroke", "fill"):
            if primitive[key] != "none" and (not isinstance(primitive[key], str) or primitive[key].lower() not in colours):
                raise FrameError(f"primitive {index}: colour not in bound project palette")
        width = _number(primitive["strokeWidthPt"], "strokeWidthPt", 0.25, 2) * PT_MM
        _number(primitive["opacity"], "opacity", 0, 1)
        if kind == "polyline":
            points = primitive["points"]
            if not isinstance(points, (list, tuple)) or not 2 <= len(points) <= MAX_POINTS:
                raise FrameError("polyline point limit exceeded")
            for point in points:
                if not isinstance(point, (list, tuple)) or len(point) != 2:
                    raise FrameError("polyline expects coordinate pairs")
                for value in point:
                    _number(value, "point")
        else:
            for key in geometry_keys[kind]:
                _number(primitive[key], key, 0 if key in {"width", "height", "rx", "r"} else -10_000)
            if kind == "rect" and (primitive["width"] <= 0 or primitive["height"] <= 0 or primitive["rx"] > min(primitive["width"], primitive["height"]) / 2):
                raise FrameError("invalid rectangle dimensions")
            if kind == "circle" and primitive["r"] <= 0:
                raise FrameError("positive radius required")
        if kind in {"line", "polyline"} and primitive["fill"] != "none":
            raise FrameError("lines cannot carry a fill")
        padding = width / 2 if primitive["stroke"] != "none" else 0
        bounds, segments = _bounds_and_segments(primitive)
        if (bounds[0] - padding < geometry["trim"] - 1e-8 or bounds[1] - padding < geometry["trim"] - 1e-8
                or bounds[2] + padding > geometry["width"] - geometry["trim"] + 1e-8
                or bounds[3] + padding > geometry["height"] - geometry["trim"] + 1e-8):
            raise FrameError(f"primitive {index}: motif crosses trim guard; reduce corner size or select no frame")
        for area in geometry["protected"]:
            hit = any(_segment_intersects_rect(*a, *b, area, padding) for a, b in segments)
            if kind == "circle":
                closest_x = max(area["xMm"], min(primitive["cx"], area["xMm"] + area["widthMm"]))
                closest_y = max(area["yMm"], min(primitive["cy"], area["yMm"] + area["heightMm"]))
                hit = math.hypot(closest_x - primitive["cx"], closest_y - primitive["cy"]) <= primitive["r"] + padding
            elif kind == "rect" and primitive["fill"] != "none":
                hit = hit or (bounds[0] - padding <= area["xMm"] + area["widthMm"]
                              and bounds[2] + padding >= area["xMm"] and bounds[1] - padding <= area["yMm"] + area["heightMm"]
                              and bounds[3] + padding >= area["yMm"])
            if hit:
                raise FrameError(f"primitive {index}: collision with protected area {area['id']}")
    return geometry


def _fmt(number):
    return f"{number:.6f}".rstrip("0").rstrip(".") or "0"


def to_svg(primitives, spec):
    validate_primitives(primitives, spec)
    width, height = spec["paper"]["widthMm"], spec["paper"]["heightMm"]
    root = ET.Element("svg", {"xmlns": NS, "width": f"{_fmt(width)}mm", "height": f"{_fmt(height)}mm",
                              "viewBox": f"0 0 {_fmt(width)} {_fmt(height)}"})
    for primitive in primitives:
        attrs = {"stroke": primitive["stroke"], "fill": primitive["fill"],
                 "stroke-width": _fmt(primitive["strokeWidthPt"] * PT_MM), "opacity": _fmt(primitive["opacity"]),
                 "stroke-linecap": "round", "stroke-linejoin": "round"}
        if primitive["type"] == "polyline":
            attrs["points"] = " ".join(f"{_fmt(x)},{_fmt(y)}" for x, y in primitive["points"])
        else:
            attrs.update({key: _fmt(value) for key, value in primitive.items()
                          if key not in {"type", "stroke", "fill", "strokeWidthPt", "opacity"}})
        ET.SubElement(root, primitive["type"], attrs)
    return ET.tostring(root, encoding="unicode", short_empty_elements=True)


def _svg_number(text, label):
    if not isinstance(text, str) or not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?", text):
        raise FrameError(f"SVG {label}: number required")
    return _number(float(text), f"SVG {label}")


def validate_svg(svg, spec):
    geometry = validate_spec(spec)
    if not isinstance(svg, str) or len(svg.encode("utf-8")) > MAX_SVG_BYTES:
        raise FrameError("SVG byte limit exceeded")
    if re.search(r"<!|<\?|url\s*\(", svg, re.IGNORECASE):
        raise FrameError("SVG declarations, entities and references are forbidden")
    try:
        root = ET.fromstring(svg)
    except ET.ParseError as error:
        raise FrameError(f"invalid SVG XML: {error}") from None
    if root.tag != f"{{{NS}}}svg" or set(root.attrib) != {"width", "height", "viewBox"}:
        raise FrameError("unsupported SVG root or attributes")
    wanted = f"0 0 {_fmt(geometry['width'])} {_fmt(geometry['height'])}"
    if root.attrib["viewBox"] != wanted or root.attrib["width"] != f"{_fmt(geometry['width'])}mm" or root.attrib["height"] != f"{_fmt(geometry['height'])}mm":
        raise FrameError("SVG dimensions differ from the bound frame definition")
    if root.text and root.text.strip():
        raise FrameError("SVG text content forbidden")
    primitives = []
    keys = {"line": {"x1", "y1", "x2", "y2"}, "polyline": {"points"},
            "rect": {"x", "y", "width", "height", "rx"}, "circle": {"cx", "cy", "r"}}
    common = {"stroke", "fill", "stroke-width", "opacity", "stroke-linecap", "stroke-linejoin"}
    if len(root) > MAX_PRIMITIVES:
        raise FrameError("SVG primitive limit exceeded")
    for node in root:
        if not node.tag.startswith(f"{{{NS}}}") or node.tag.split("}")[-1] not in keys:
            raise FrameError("unsupported SVG element")
        kind = node.tag.split("}")[-1]
        if len(node) or (node.text and node.text.strip()) or (node.tail and node.tail.strip()) or set(node.attrib) != keys[kind] | common:
            raise FrameError("unsupported SVG child, text or attributes")
        if node.attrib["stroke-linecap"] != "round" or node.attrib["stroke-linejoin"] != "round":
            raise FrameError("unsupported SVG line geometry")
        decoded_width = _svg_number(node.attrib["stroke-width"], "stroke-width") / PT_MM
        # Six-decimal millimetre serialization introduces <= 0.00000142 pt.
        # Snap only that bounded conversion error at the two supported endpoints.
        if abs(decoded_width - 0.25) <= 0.0000015:
            decoded_width = 0.25
        elif abs(decoded_width - 2) <= 0.0000015:
            decoded_width = 2
        primitive = {"type": kind, "stroke": node.attrib["stroke"], "fill": node.attrib["fill"],
                     "strokeWidthPt": round(decoded_width, 6),
                     "opacity": _svg_number(node.attrib["opacity"], "opacity")}
        if kind == "polyline":
            pairs = node.attrib["points"].split()
            if not 2 <= len(pairs) <= MAX_POINTS or any(len(pair.split(",")) != 2 for pair in pairs):
                raise FrameError("invalid SVG point list")
            primitive["points"] = [[_svg_number(number, "point") for number in pair.split(",")] for pair in pairs]
        else:
            primitive.update({key: _svg_number(node.attrib[key], key) for key in keys[kind]})
        primitives.append(primitive)
    validate_primitives(primitives, spec)
    return {"valid": True, "primitiveCount": len(primitives), "body": geometry["body"],
            "protectedAreaCount": len(geometry["protected"]), "collisionCount": 0,
            "svgSha256": hashlib.sha256(svg.encode("utf-8")).hexdigest()}


def build_frame(spec, require_approved=False):
    geometry = validate_spec(spec, require_approved)
    primitives = make_primitives(spec)
    svg = to_svg(primitives, spec)
    validation = validate_svg(svg, spec)
    return {"schema": "ReportFramePrimitives/v1", "styleId": spec["id"], "styleVersion": spec["version"],
            "status": spec["status"], "body": geometry["body"], "protected": geometry["protected"],
            "primitives": primitives, "svg": svg, "definitionSha256": definition_hash(spec),
            "validation": validation, "warnings": ([] if spec["status"] == "approved" else ["Candidate only; formal output requires explicit approval."])}


def _load_json(path):
    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise FrameError(f"duplicate JSON key: {key}")
            result[key] = value
        return result
    source = Path(path)
    if source.stat().st_size > 256_000:
        raise FrameError("style byte limit exceeded")
    return json.loads(source.read_text(encoding="utf-8-sig"), object_pairs_hook=unique_pairs,
                      parse_constant=lambda value: (_ for _ in ()).throw(FrameError(f"invalid JSON constant: {value}")))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    build = commands.add_parser("build")
    build.add_argument("--spec", required=True)
    build.add_argument("--out-dir", required=True)
    build.add_argument("--require-approved", action="store_true")
    validate = commands.add_parser("validate")
    validate.add_argument("--spec", required=True)
    validate.add_argument("--svg", required=True)
    args = parser.parse_args(argv)
    try:
        spec = _load_json(args.spec)
        if args.command == "validate":
            source = Path(args.svg)
            if source.stat().st_size > MAX_SVG_BYTES:
                raise FrameError("SVG byte limit exceeded")
            result = validate_svg(source.read_text(encoding="utf-8-sig"), spec)
        else:
            result = build_frame(spec, args.require_approved)
            out = Path(args.out_dir)
            # Do not overwrite any existing candidate artifacts, especially an
            # approved export. Choose another version directory instead.
            targets = [out / name for name in ("frame.svg", "frame.json", "validation.json")]
            if any(path.exists() for path in targets):
                raise FrameError("output artifacts already exist; select a new version directory")
            out.mkdir(parents=True, exist_ok=True)
            payloads = [result["svg"],
                        json.dumps({"style": spec, **{k: v for k, v in result.items() if k != "svg"}}, ensure_ascii=False, indent=2),
                        json.dumps(result["validation"], ensure_ascii=False, indent=2)]
            for target, payload in zip(targets, payloads):
                with target.open("x", encoding="utf-8") as handle:
                    handle.write(payload)
            result = {"valid": True, "status": spec["status"], "definitionSha256": result["definitionSha256"],
                      "svgSha256": result["validation"]["svgSha256"], "primitiveCount": len(result["primitives"]),
                      "outputDirectory": str(out.resolve()), "warnings": result["warnings"]}
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (FrameError, ValueError, OSError, TypeError, RecursionError) as error:
        print(json.dumps({"valid": False, "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
