# Frame acceptance record

Use actual outputs and one shared palette version. A rejected or unavailable check remains visible; do not infer it from a successful generation/build.

| Check | Required evidence |
|---|---|
| Topic coherence | Selected motif rationale and fit to the current topic; compare concepts when the task requests new directions. Two unrelated topics are a Skill capability trial for initial/major revisions, not mandatory extra designs for each report or colour edit. |
| Chosen output format | PNG: native pixels, final physical size, effective resolution, actual alpha and clear edges. SVG/native: helper receipt where used and target rendering. Vector preservation is required only when explicitly selected. |
| Geometry | Paper/margins/body rectangle unchanged; zero trim/protected-area intersections including stroke width |
| Sparse page | Short abstract or chapter opener has a stable reading focus, no oversized empty inner panel |
| Medium page | Paragraphs + graph/short table; captions/sources/page number avoid decoration |
| Dense page | Long table/multiple paragraphs; line order, table breaks and page count match the no-frame baseline |
| Colour | Shared palette/version across figures and frame; compare final appearance and grayscale. Controlled primitives retain exact token values; generated/raster edges and colour profiles need actual-page comparison rather than assuming every pixel equals a token. |
| Word | Fixed page coordinates and behind-text layer; edit/save/reopen; native PDF export inspected |
| WPS | Separate native edit/save/reopen and PDF checks, or explicitly pending |
| XeLaTeX | Trusted preamble uses controlled primitives; user-body command whitelist unchanged; compiled PDF inspected |
| Versioning | Concept and candidate remain drafts until hash-bound apply/review; colour or geometry change invalidates approval |
| Neutrality | No product/school/team identity; reference ownership and applicable decoration rules recorded |

The helper validates physical geometry conservatively. It cannot determine aesthetic quality, image rights, applicable contest rules, native editor behaviour, body pagination, or whether human approval is authentic. Inspect these independently.

Select checks by the requested artifact and change scope. Word, WPS and XeLaTeX are separate targets; unrequested formats are not automatically new deliverables. A colour-only change rechecks contrast and target output without redesigning the motif or recomputing research. A geometry change requires affected layout checks. Never claim an unexecuted target passed.

Record measured facts: source/output hashes, chosen format, target application's exact version, file/page count, text and table-break comparisons, reviewer, time and any pending item. For raster assets record native pixels, actual insertion size and effective resolution; for a requested vector deliverable record actual object inspection. A clear PNG may be formal decoration; neither a bitmap nor upscaled pixels may be described as vector or newly recovered detail.
