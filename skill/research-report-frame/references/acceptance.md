# Frame acceptance record

Use actual outputs and one shared palette version. A rejected or unavailable check remains visible; do not infer it from a successful generation/build.

| Check | Required evidence |
|---|---|
| Topic coherence | Two concepts, selected motif rationale, two unrelated topic trials |
| True vector | XML allowlist receipt; no raster/image/filter/external object; actual target PDF vector inspection |
| Geometry | Paper/margins/body rectangle unchanged; zero trim/protected-area intersections including stroke width |
| Sparse page | Short abstract or chapter opener has a stable reading focus, no oversized empty inner panel |
| Medium page | Paragraphs + graph/short table; captions/sources/page number avoid decoration |
| Dense page | Long table/multiple paragraphs; line order, table breaks and page count match the no-frame baseline |
| Colour | Equal semantic hex values across figures, frame and native export; print/grayscale remains usable |
| Word | Fixed page coordinates and behind-text layer; edit/save/reopen; native PDF export inspected |
| WPS | Separate native edit/save/reopen and PDF checks, or explicitly pending |
| XeLaTeX | Trusted preamble uses controlled primitives; user-body command whitelist unchanged; compiled PDF inspected |
| Versioning | Concept and candidate remain drafts until hash-bound apply/review; colour or geometry change invalidates approval |
| Neutrality | No product/school/team identity; reference ownership and applicable decoration rules recorded |

The helper validates physical geometry conservatively. It cannot determine aesthetic quality, image rights, applicable contest rules, native editor behaviour, body pagination, or whether human approval is authentic. Inspect these independently.

Record measured facts: source/output hashes, target application's exact version, file/page count, text and table-break comparisons, vector object count, reviewer, time and any pending item. Preview thumbnails may be raster; formal decoration may not silently degrade to raster.
