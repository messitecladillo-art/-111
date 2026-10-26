# Zhengda Cup Champion Workspace

For every substantive task in this repository, read `skill/zhengda-cup-champion/SKILL.md` completely and follow it before acting. Load only the task-relevant files it routes to under `references/`.

Use `corpus-source/` as the provenance layer for official notices and extracted rule snapshots. Use `evals/` to regression-test changes to the agent. Keep real project work in a project directory initialized by `skill/zhengda-cup-champion/scripts/agentctl.py <project> bootstrap --title <title>`.

For a continuation or takeover, run `agentctl.py <project> status` and `next` before editing artifacts. `.agent/state.json` is the authoritative workflow state; `project.status` is only its mirror, while `project.stage` is the competition stage. Never hand-edit state, events, checkpoints, or revisions. Advance only through the CLI, one adjacent stage at a time, with current evidence-backed Gate results.

Never fabricate fieldwork, respondents, data, citations, model output, awards, or judge feedback. Separate actual, proposed, simulated, and inferred content. Resolve edition, group, region, track, and stage before applying any hard competition rule.

For brand, IP, image-generation, report/PPT visual, poster, or derivative tasks, load `skill/zhengda-cup-champion/references/brand-system.md` and/or `skill/zhengda-cup-champion/references/visual-production.md` as routed by the Skill. Treat 证见 EVI-X as an independent non-official agent identity. Resolve `visual.mode` before using assets: EVI-X branding is permitted for `agent_ui` and `public_promo`, while `competition_submission` is neutral by default and must not contain the EVI-X logo or IP character when anonymity applies. Preserve approved masters, version derivatives non-destructively, and record generated-asset provenance and human review.

Before handing off a competition artifact, run `agentctl.py <project> audit --all` and `doctor`, verify key calculations and cross-file consistency, render and inspect visual outputs, confirm asset rights and anonymity safety, and list unresolved hard-rule unknowns. Final delivery requires `agentctl.py <project> handoff` to return Go; a fatal/high blocker or non-current Gate is No-Go.

## Shared development boundaries

Read `PROJECT_FRAMEWORK.md` and `docs/development-workflow.md` for source ownership, shared seams and current entry points. `apps/frontend` and `apps/backend` are the only application roots; do not recreate retired `apps/evi-x-platform` or `apps/evi-x-api` runtimes from an old branch. Claude follows this same file through `CLAUDE.md`; do not maintain competing copies of the rules.

Start from the confirmed integration commit in an isolated branch/worktree. Preserve other dirty checkouts, uncommitted candidates and running previews. Assign one integrator per task for shared hosts, contracts, handoff acknowledgements, lockfiles, migrations and CI; do not let multiple workers silently edit the same path. When relocating a file, follow its current responsibility rather than Git's rename guess.

Run `python -X utf8 scripts/check-repo-layout.py` plus the relevant application and architecture checks. A stack's leaf PR being merged does not mean its root reached the integration branch. Handoff must distinguish produced, committed, PR-open, merged and preview-verified states, with exact commit/PR, tests, untested environments and next action. Personal installed Skills and desktop archives are not production source.
