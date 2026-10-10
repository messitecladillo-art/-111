# P0 capability migration ledger

Baseline: source manifest `fc3da02c0118cc388cd7c5a9934969599a104167d14bc7d39c3ded58b8b64844`, 452 files.
The existing EVI-X application is upgraded in place, as requested by the user. A source snapshot remains the migration reference. New hosted accounts and projects use only the new API and database. Existing local editing/analysis/export tools keep their navigation entries; cloud operations are enabled only after their API has migrated.

| Existing capability | Target batch | Acceptance scenario |
|---|---|---|
| Questionnaire design schema, issues, routing | P0 shared/frontend | Existing accepted/rejected designs agree; title/item edits, cancel, undo, JSON restore |
| Personal model settings and encrypted key contract | P0 API/frontend | Key never returned, owner isolation, config CAS, replacement and removal |
| Invited email identity | P0 API/frontend | OTP delivery adapter, atomic verification, replay, revocation, stable account |
| Questionnaire model proposal | P0 API/frontend | Explicit payload approval, duplicate request, unknown outcome, preview, apply, undo |
| Questionnaire version library | P0 API/frontend | Save, concurrent conflict, reload, immutable history, explicit restore as new version |
| Project registry | P0 API/frontend | Team scoped registration/read; workflow capability remains unavailable until integrated |
| Research-question / variable mapping | P0 design fields; P1 data linkage | Preserve mapping on edit/save/reload; link codebook to released form and dataset |
| Questionnaire review/repair provenance | P1 | Review binds exact design revision; repair origin survives save and import |
| Fieldwork and questionnaire collection | P1 new implementation | Frozen release, repeat/disconnected submission, consent, withdrawal |
| Basic statistics / analysis recipes | P2 registered compute | Independent numeric comparisons; counts, exclusions, missingness and branch eligibility |
| Workflow, nine Gates, CLI audit/handoff | P2 domain integration | One write authority, exact revisions, evidence invalidation, independent approval |
| Evidence/claims and research runs | P2 | Source versions, fact arithmetic, affected outputs marked stale |
| Structured report/PPT and export | P3 | Text/chart edits, undo, exact references, editable native export |
| Native Office storage/editor protocol | P3 | Actual edit-save-reopen, permission/target checks, callbacks and conflict recovery |
| Defense themes and timed rehearsal | P3 | Project-backed questions, persistent notes, roles and timing |
| Brand assets / responsive workbench | P0 UI; P3 submission separation | Desktop/mobile rendering, keyboard operation, neutral competition output |
| Rules/cases corpus and notices | P2 read-only sources | Source/version/date retained; rules scoped to edition/group/region/track/stage |

Each target is accepted only after its scenario is verified. Later-batch functionality is not advertised as executable in the P0 interface.
