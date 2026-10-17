# ReportFrameStyle/v1 geometry contract

Read this reference when constructing a frame or adapting it to a document exporter. All coordinates are **millimetres**, all line widths are **points** (1 pt = 25.4/72 mm). This is a controlled candidate format, not permission to render arbitrary SVG or TeX.

```json
{
  "schema": "ReportFrameStyle/v1",
  "id": "banking-grid",
  "version": 1,
  "title": "银行研究·几何页框",
  "status": "vector_draft",
  "theme": "finance-grid",
  "variant": "body",
  "layout": "corners",
  "paper": {"widthMm": 210, "heightMm": 297},
  "marginsMm": {"top": 25.4, "right": 31.8, "bottom": 25.4, "left": 31.8},
  "guardMm": 3,
  "trimGuardMm": 3,
  "protectedAreas": [
    {"id": "page-number", "kind": "page_number", "xMm": 84, "yMm": 280, "widthMm": 42, "heightMm": 10}
  ],
  "palette": {"id": "blue", "version": 1, "primary": "#255D87", "secondary": "#5492B2", "accent": "#A0C8D7"},
  "lineWidthPt": 0.85,
  "cornerSizeMm": 12,
  "density": 0.4,
  "strength": 0.6,
  "appliesTo": ["body", "appendix"],
  "sourceConcept": null,
  "review": null
}
```

## Values and version binding

- `theme`: `finance-grid` or `sports-track`; these are original parametric starting points, not locked recommendations for a research subject.
- `variant`: `body`, `chapter`, `cover`. It changes motif treatment, **not margins or text geometry**. Use independent style versions when geometry changes.
- `layout`: `none`, `corners`, `open`, `closed`; `none` is always available. The `closed` frame remains outside the text guard; headers or page numbers can require an explicitly interrupted border.
- `status`: `concept`, `vector_draft`, `approved`. Raster concepts do not satisfy vector acceptance. A built-in or generated candidate is not human approved.
- `palette`: exactly the project's saved semantic colours and palette version. This example takes positions 0, 2 and 4 from the existing `blue` project chart palette; the sports fixture uses the equivalent positions of `forest`. Resolve the current project style rather than treating these as a fixed brand scheme.
- `guardMm` must be at least 3. The body rectangle is derived from `paper` and `marginsMm`; protect its outward expansion by `guardMm`.
- `protectedAreas` add header, footer, page-number, footnote or local exclusions. Kinds: `header`, `footer`, `page_number`, `caption`, `footnote`, `other`. Recalculate these for the actual exporter; the example footer is only a starting point.
- `lineWidthPt`: 0.25–2; `cornerSizeMm`: 2–24; `density` and `strength`: 0–1. The builder fails if a requested motif cannot fit outside the protected regions; it never narrows the body to make it fit.
- `appliesTo`: any combination of `body`, `chapter`, `cover`, `appendix`; scope is the user's choice.
- `sourceConcept`, when supplied: `{assetId, sha256, promptRef}`. Preserve the generated bitmap and prompt separately. This reference connects an original raster study to its vector reconstruction; it never embeds it.
- Approval is explicit: `review` is `{decision:"approved", reviewer, at, definitionSha256}`. `at` is a timezone-aware ISO timestamp. The definition hash is SHA-256 of the shared bounded canonical JSON below, excluding only `status` and `review`. Changing geometry, colours, content version, title or source invalidates approval. A user apply action can supply the reviewer identity and the exact candidate hash; do not synthesize a human decision.

### Shared hash serialization

This is a deliberately bounded cross-language format, not a general RFC canonical JSON implementation. All specification keys are fixed ASCII names. Sort object keys, preserve array order, encode strings as ordinary JSON with literal Unicode (`ensure_ascii=False`), and omit whitespace or BOM. Escape JSON controls, quotation marks and backslashes; do not escape slashes. Numeric leaves must be finite, at most 1,000,000 in absolute value, with no more than six fractional decimal places. Emit fixed-six decimal notation and trim fractional trailing zeroes and then the decimal point; integral values use `1` rather than `1.0`; negative zero becomes `0`. Never use exponent notation. The included hash parity fixture covers integer-valued floats, 0.000001, -0 and a Chinese title.

## Native primitive output

`scripts/frame_geometry.py` returns `build_frame(spec)` with `body`, `protected`, `primitives`, `svg`, `definitionSha256`, and `warnings`. Primitives are `line`, `polyline`, `rect`, or `circle`; numeric values are in mm. Each primitive has `stroke` (hex or `none`), `fill` (hex or `none`), `strokeWidthPt`, `opacity`; geometry keys are `x1/y1/x2/y2`, `points`, `x/y/width/height/rx`, or `cx/cy/r` respectively. SVG stroke-width is converted to mm.

Decorations use the perimeter that is 2 mm beyond the body guard. Stroke-expanded segments and shapes are tested against every protected rectangle and the trim guard. Native Word or trusted TeX adapters must consume these same primitive coordinates; do not parse image pixels or generate arbitrary commands from a user string.

The standalone SVG validator deliberately supports only these primitives. It rejects paths, transforms, references (including local references), fonts, foreign objects, animation, CSS, metadata payloads, filters, images, external entities and unknown attributes. A separate chart SVG sanitizer may support a larger, independently validated subset; do not broaden this frame validator to accept it.

## Pagination and export checks

- Record the body rectangle, baseline text sequence, page count, line positions and table breaks before applying a background frame.
- Place Word decorations in fixed page coordinates in a header background layer, behind text and outside wrapping flow; never in body paragraphs. Simple borders may use Word page borders when their distances map to this geometry.
- For LaTeX, emit finite numbers and allowlisted native primitives in the trusted preamble/background template. This contract does not enable `input`, shell escape or arbitrary file reads in report body text.
- Export each target through the real native engine, compare text/pagination and inspect vector path operators in PDF. A valid SVG/package alone does not prove Word/WPS/PDF compatibility. Record WPS and Word separately.
