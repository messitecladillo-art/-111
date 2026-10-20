# Frozen public topic calibration

Run from the repository root:

```sh
node --experimental-strip-types apps/frontend/scripts/evaluate-topic-advisor.mjs --verify
node --experimental-strip-types apps/frontend/scripts/evaluate-topic-advisor.mjs --pretty
node --experimental-strip-types --test apps/frontend/tests/topic-evaluation.test.mjs
```

`manifest-v1.json` is the unchanged historical receipt. Its paths refer to the
former `apps/evi-x-platform` layout. The active `manifest-v2.json` records the
technical migration to `apps/frontend`; it includes the original manifest as a
required, hash-verified input. It does not replace the original receipt or claim
a new review.

The v2 `frozenAt` and `baseRevision` still identify the original label review.
The new `sealedAt` identifies the migrated artifact, and `migration.repositoryRevision`
identifies the repository state used for the migration. Review timestamps,
reviewer bindings, scenario bytes, labels, production scoring code, model,
training data and catalogues retain their original hashes. The only changed
members are `.gitattributes` (renamed paths and the shared parser byte policy)
and the evaluation verifier (renamed paths and the migration validation).
The manifest fixes the exact file closure; it never discovers inputs from the
filesystem or accepts replacement paths from a receipt.

Verification checks both the current byte hashes and continuity with the v1
hashes. It rejects missing/extra files, links, dynamic members, altered review
chronology, expanded migration exceptions, and changes to preserved inputs
even if only the active manifest is rehashed. Changing this package requires a
new versioned receipt and review; do not refresh hashes automatically to make
a failing check pass.

Evaluation still reports twelve authored synthetic cases and twenty checks per
baseline. These are public AI-reviewed editorial calibration labels, not human
expert gold or a sealed holdout. The migration does not establish a new score,
new expert approval, external generalization, or improved topic quality.
