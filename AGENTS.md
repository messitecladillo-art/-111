# Zhengda Cup Champion Workspace

For every substantive task in this repository, read `skill/zhengda-cup-champion/SKILL.md` completely and follow it before acting. Load only the task-relevant files it routes to under `references/`.

Use `corpus-source/` as the provenance layer for official notices and extracted rule snapshots. Use `evals/` to regression-test changes to the agent. Keep real project work in a project directory initialized by `skill/zhengda-cup-champion/scripts/agentctl.py <project> bootstrap --title <title>`.

For a continuation or takeover, run `agentctl.py <project> status` and `next` before editing artifacts. `.agent/state.json` is the authoritative workflow state; `project.status` is only its mirror, while `project.stage` is the competition stage. Never hand-edit state, events, checkpoints, or revisions. Advance only through the CLI, one adjacent stage at a time, with current evidence-backed Gate results.

Never fabricate fieldwork, respondents, data, citations, model output, awards, or judge feedback. Separate actual, proposed, simulated, and inferred content. Resolve edition, group, region, track, and stage before applying any hard competition rule.

For brand, IP, image-generation, report/PPT visual, poster, or derivative tasks, load `skill/zhengda-cup-champion/references/brand-system.md` and/or `skill/zhengda-cup-champion/references/visual-production.md` as routed by the Skill. Treat 证见 EVI-X as an independent non-official agent identity. Resolve `visual.mode` before using assets: EVI-X branding is permitted for `agent_ui` and `public_promo`, while `competition_submission` is neutral by default and must not contain the EVI-X logo or IP character when anonymity applies. Preserve approved masters, version derivatives non-destructively, and record generated-asset provenance and human review.

Before handing off a competition artifact, run `agentctl.py <project> audit --all` and `doctor`, verify key calculations and cross-file consistency, render and inspect visual outputs, confirm asset rights and anonymity safety, and list unresolved hard-rule unknowns. Final delivery requires `agentctl.py <project> handoff` to return Go; a fatal/high blocker or non-current Gate is No-Go.
