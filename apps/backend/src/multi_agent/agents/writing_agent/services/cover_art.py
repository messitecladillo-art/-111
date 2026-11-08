"""The cover ornament (frontend lib/cover-art.ts): vector strokes on the A4 cover page, never in the title band.

checked_cover_art mirrors parseCoverArt; cover_art_tex is byte-identical with coverArtTex, so the LaTeX source the
backend builds is the one the frontend shows.
"""
import math
import re

from shared.contracts import object_fields
from shared.errors import ApiError

COVER_PAGE = (210, 297)
COVER_TITLE_BAND = (70, 170)
HEX_COLOR = re.compile(r"#[0-9A-F]{6}\Z")
CONTROL = re.compile(r"[\x00-\x1f]")


def _exact2(value, low, high):
    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high or round(value, 2) != value:
        raise ApiError()
    return value


def checked_cover_art(value):
    x = object_fields(value, ("schema", "id", "title", "note", "strokes"))
    if x["schema"] != "CoverArt/v1" or not isinstance(x["strokes"], list) or not 1 <= len(x["strokes"]) <= 24:
        raise ApiError()
    for name, limit in (("id", 96), ("title", 40), ("note", 300)):
        if not isinstance(x[name], str) or not x[name].strip() or len(x[name]) > limit or CONTROL.search(x[name]):
            raise ApiError()
    strokes = []
    for item in x["strokes"]:
        s = object_fields(item, ("points", "color", "widthPt", "opacity"))
        if not isinstance(s["points"], list) or not 2 <= len(s["points"]) <= 400 or not isinstance(s["color"], str) or not HEX_COLOR.match(s["color"]):
            raise ApiError()
        points = []
        for p in s["points"]:
            if not isinstance(p, list) or len(p) != 2:
                raise ApiError()
            point = (_exact2(p[0], 0, COVER_PAGE[0]), _exact2(p[1], 0, COVER_PAGE[1]))
            if COVER_TITLE_BAND[0] < point[1] < COVER_TITLE_BAND[1]:
                raise ApiError()
            points.append(point)
        if any((a[1] <= COVER_TITLE_BAND[0]) != (b[1] <= COVER_TITLE_BAND[0]) for a, b in zip(points, points[1:])):
            raise ApiError()
        strokes.append({"points": points, "color": s["color"], "widthPt": _exact2(s["widthPt"], 0.1, 2), "opacity": _exact2(s["opacity"], 0.05, 1)})
    return {"schema": "CoverArt/v1", "id": x["id"], "title": x["title"], "note": x["note"], "strokes": strokes}


def cover_number(value):
    """Two decimals without trailing zeros, as the frontend's coverNumber prints them."""
    return f"{value:.2f}".rstrip("0").rstrip(".")


def cover_art_tex(art):
    lines = [r"\begin{tikzpicture}[remember picture,overlay,x=1mm,y=-1mm,shift={(current page.north west)}]"]
    for s in art["strokes"]:
        r, g, b = (int(s["color"][i:i + 2], 16) for i in (1, 3, 5))
        path = " -- ".join(f"({cover_number(px)},{cover_number(py)})" for px, py in s["points"])
        lines.append(
            f"\\draw[line width={cover_number(s['widthPt'])}bp,line cap=round,line join=round,"
            f"draw={{rgb,255:red,{r};green,{g};blue,{b}}},draw opacity={cover_number(s['opacity'])}] {path};"
        )
    lines.append(r"\end{tikzpicture}")
    return lines
