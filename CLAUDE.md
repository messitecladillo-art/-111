# Shared repository instructions

Read and follow [AGENTS.md](AGENTS.md), then [PROJECT_FRAMEWORK.md](PROJECT_FRAMEWORK.md) and [the collaboration workflow](docs/development-workflow.md) before substantive work.

These files are the shared source of repository rules for Claude, Codex and human maintainers. This file intentionally does not duplicate them.

Use an isolated branch/worktree from the confirmed integration commit. Preserve other dirty checkouts and running previews. Agree on one writer for shared contracts, entry points, lockfiles and CI. Run the repository layout check and relevant regressions before submitting a PR; report the exact commit, checks, merge state and preview location.
