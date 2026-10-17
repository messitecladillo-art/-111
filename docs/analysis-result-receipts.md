# Analysis result receipts

`ResultSnapshot.receipt` is an optional, hash-bound `AnalysisResultReceipt/v1`. New analysis registrations preserve it. Loading an old report does not insert it or recalculate its fingerprint. A new registration creates a new snapshot; it does not rewrite a historical result or a confirmed finding.

## Saved evidence

- The existing aggregate table, metrics, interpretation and warnings, including confidence-interval columns.
- The complete inference object produced by the current engine: primary and robustness tests, null results, effects and intervals, Holm-adjusted pairwise comparisons and applicability notes.
- Calculation configuration frozen when the calculation runs: ordered columns and names, missing codes, exact user-selected filter, scale items, reverse coding, range, construct, interpretation identity and questionnaire/mapping fingerprints.
- Distinct sample accounting: original table, custom filter branch, intersection with applicable response scopes, and the final valid calculation sample. Missing, nonnumeric and out-of-range counts may overlap and are not added together.
- Percentage basis: the nonmissing effective sample for frequency tables, the row total for crosstabs, and no percentage denominator for other methods.

The engine identifiers are `analysis-plan/v1` and `2026-10-inference/v1`. They identify the existing deterministic implementations: sample variance (`n−1`), Type 7 quantiles, Wilson proportion intervals, t mean intervals, Welch mean comparisons with rank-test checks, Holm follow-up, the current χ²/Fisher switch and correlation inference. They do not identify new statistical capabilities. An implementation change that changes calculations needs a new algorithm version and reference-data regression.

No receipt contains respondent rows, row indices or raw answer arrays. Variable labels, selected filter values and small aggregate categories can still be sensitive; they are explicit project configuration, protected by the existing report permissions. No new raw-data upload is triggered by registration.

## Storage and integrity

The browser normalizes the bounded receipt before hashing the complete result payload. Editing an interpretation, inference value, filter or denominator changes that fingerprint and invalidates dependent finding confirmation. The API mirrors the strict nested allowlist, array budgets, finite-number bounds and arithmetic constraints. It validates storage structure and permissions; it does not attest fieldwork, recompute statistics or silently rewrite the client's result hash.

Reproduction still requires the matching private source data and its interpretation/mapping versions. A hash is an identity, not a replacement for those inputs. Legacy summaries are shown as lacking a calculation receipt until they are recalculated and explicitly registered again.

## Report completeness

The report checker reports observable evidence completeness. Figure, table, formula, method, citation and word counts are descriptive, without minimum-count quality targets. Method names or titles cannot establish execution. Inference checks apply only to used inferential results; alpha checks apply only to used alpha results. Finding confirmation must match the current evidence fingerprint. Applicable recording checks do not certify statistical assumptions or predict a competition award.

Regression coverage includes the six recipe methods and alpha, filtering plus common response scope, overlapping exclusions, undefined/zero-variance tests, CI/effect/post-hoc preservation, historical hash stability, TypeScript/Python round trips, strict hostile nested payloads and unchanged aggregate output.
