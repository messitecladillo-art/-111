# EVI-X P0 hosted API

This is a new backend module inside the existing EVI-X project. It implements
P0 registration, personal connections, single-step questionnaire proposals and
immutable questionnaire snapshots. It does not expose workflow advancement,
Gate approval, survey collection, statistical computation or Office migration.
The legacy application is not modified by this module.

## Runtime

Python 3.12, PostgreSQL, SQLAlchemy and Alembic are mandatory. The API never
creates tables. Use a migration-owner role for Alembic and a distinct unprivileged
application role. In production the application checks the migration revision
and refuses a table-owner, superuser or BYPASSRLS role.

From this directory:

```powershell
uv sync --locked
# EVIX_MIGRATION_DATABASE_URL is an explicit PostgreSQL owner URL.
uv run alembic upgrade head
uv run uvicorn evix_api.app:create_app --factory --host 127.0.0.1 --port 8180 --no-access-log
```

`create_app(settings=None, mail=None, provider=None, engine=None)` is exported.
Tests can inject a synchronous SQLAlchemy Engine and asynchronous mail/provider
callables. Production refuses these injections. No dotenv file is loaded.

## Settings

All runtime environment names start `EVIX_`. JSON collections must be valid JSON.

| Setting | Contract |
| --- | --- |
| MODE | `local_test` or `production`; default production |
| DATABASE_URL | `postgresql+psycopg://` application URL |
| MIGRATION_DATABASE_URL | separate owner URL; read only by Alembic |
| ALLOWED_ORIGINS | exact origin JSON array; production HTTPS only |
| INVITED_EMAILS | normalized invitation JSON array |
| AUTH_SECRET | random 32-byte hex, separate from vault keys |
| KEYRING | JSON object of key ID to random 32-byte hex |
| ACTIVE_KEY_ID | active encryption key ID, default `v1` |
| COMPATIBLE_BASES | exact operator-approved HTTPS bases, default `[]` |
| COOKIE_NAME | production `__Host-...`; local default `evix_session` |
| MAIL_MODE / PROVIDER_MODE | both `fixture` mandatory in local_test; production `resend` / `live` |
| MAILBOX_DIR | private ignored `.local/mailbox` for local fixture only |
| MAIL_API_KEY / MAIL_FROM | operator's real mail configuration; never a user's LLM key |

Local-test mailbox entries are `<challengeId>.json` with `challengeId`, `email`,
`code`, and `classification:"synthetic_local_test"`. Only example.test invitations
can use this fixture. OTPs are not returned by the API or emitted in application
logs. Fixture mode is explicitly returned by session/health as `local_test` and
is not a claim of successful external mail or model delivery.

## Security and persistence

Production cookies are host-only, Secure, HttpOnly, SameSite=Strict. Mutation
requests require an exact Origin; authenticated mutation requires the current
session's X-CSRF-Token. Requests never accept caller-supplied owner identity.
Membership removal and invitation withdrawal invalidate access on the next
operation. Member emails and management are owner-only. Owner/editor can write;
reviewer/viewer can read shared questionnaire versions. Proposals and model
credentials remain personal.

PostgreSQL RLS/FORCE RLS protects project content and private services,
operations and proposals with transaction-local evix.user_id. Auth and
membership metadata are accessed only through the bounded business API and
are not RLS-protected in P0; arbitrary user SQL is not available. Connection
context is never a user-provided header. Questionnaire versions also have a
database trigger rejecting changes to existing snapshots.

Keys use AES-GCM with fresh IV and owner, service ID, revision, key ID and full
configuration-fingerprint AAD. API outputs contain no key metadata. Keyring
rotation needs retained old key IDs or explicit re-encryption; losing old vault
keys makes those ciphertexts unrecoverable. This module is not a cloud KMS.

Idempotency is persistent and scoped to current user/operation. A duplicate
proposal returns the stored reservation/result without a second model call.
Reservation is committed before external I/O. Interruption/timeout becomes
outcome_unknown and is never auto-replayed. One active call/user, 12/hour,
30-second deadlines, fixed destination policy, no redirects/retries. The
proposal does not update the questionnaire; explicit version Save performs CAS.
Old proposal provenance cannot be attached to a newer base revision.
`GET /api/projects/{id}/proposals` restores the current user's latest 50
proposal records in descending creation order. It requires current project
membership; stale running reservations become outcome_unknown without another
provider call. HTTP 408 and provider 5xx responses also retain this uncertain
outcome. A proposal never silently replaces a later questionnaire edit.

### 硅基样本 runs (simulated respondents)

`POST /api/projects/{id}/silicon-runs` lets a project owner/editor run a
questionnaire pretest in which the user's own models (1–3 services with the
`research` capability) play fictional personas. The body carries the design,
persona attributes and panel, scenarios (≤4), memory mode (`carry`: one call
per persona × scenario × model; `independent`: one call per shown item),
option shuffling, `expectedCalls` and explicit `consent`. The server
recomputes the call count and rejects any mismatch (409 `estimate_conflict`),
runs above `SILICON_MAX_CALLS` (default 240), a second active run, or more than
`SILICON_HOURLY_RUNS` per hour. The reservation is committed before any provider
call; work then continues in the background with `SILICON_CONCURRENCY`
(default 3) parallel calls of at most `SILICON_CALL_SECONDS` each.

Poll `GET /api/projects/{id}/silicon-runs/{runId}` for progress and responses;
`POST …/cancel` stops unsent calls (calls already sent may still be billed).
A run without progress for `SILICON_STALE_SECONDS` becomes `outcome_unknown`
and is never replayed. Rows are RLS-scoped to their creator. Every view carries
`classification:"simulated"`; responses are answers from fictional personas,
never survey data. Routing, piping and answer normalisation mirror the browser
(`lib/silicon/run.ts`); `tests/fixtures/silicon-parity.json` is checked by both
test suites. Fixture providers return conspicuously synthetic answers.

The editor's 40-step undo limit does not limit immutable server history. Saved
versions continue until the PostgreSQL integer revision limit. Request bodies
are fully bounded and parsed before row locks are acquired; duplicate keys,
non-finite numbers and invalid Unicode are rejected before payload hashing.

## Tests

```powershell
uv run pytest tests/test_contracts.py
# Explicit owner URL of a separate synthetic database named evix_p0_test:
uv run pytest
```

PostgreSQL tests require EVIX_TEST_DATABASE_URL; absent configuration is an
explicit skip, not a SQLite substitute or PostgreSQL acceptance. Tests create
unique private schemas within that synthetic database, apply the actual Alembic
migration and run the API using a distinct non-owner, non-BYPASSRLS application
role. Set EVIX_TEST_APP_DATABASE_URL for a custom test role; the local fixture
default is evix_app with the synthetic local password from compose setup. Only
the generated test schemas are removed afterward. Do not point either test URL
at a real project database.

The suite covers replay, team revocation during an active call, RLS context
reset, immutable database triggers, concurrent CAS, late results, 41 saved
versions, private proposal recovery and unknown outcomes without retries. Real
mail/models are not called by this suite. Browser round trip and independent
review remain separate coordinator acceptance checks. On Windows, a fresh
`--basetemp` below an existing project-local directory avoids stale temporary
directory ACLs after switching process accounts.
