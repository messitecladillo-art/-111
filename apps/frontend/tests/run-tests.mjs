import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, mkdir, readdir, copyFile, writeFile, lstat } from "node:fs/promises";
import { inspect } from "node:util";
import { createServer } from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEditorContent } from "../lib/editor-model.ts";
import { blankStoryCard, buildStoryboard, reportLinkState } from "../lib/report-storyboard.ts";
import { buildDocx } from "../lib/editor-export.ts";
import { createRecoveryKey } from "../lib/editor-recovery.ts";
import { isOwnedReadiness, isOwnedShutdown } from "./helpers/dev-server-contract.mjs";
import { readWindowsProcesses, captureOwnedTree } from "./helpers/process-tree.mjs";
import { createIsolatedTestEnv } from "./helpers/isolated-test-env.mjs";
import { runBoundedCommand, createWindowsProcessAdapter, updateOwnedProcesses } from "./helpers/bounded-command.mjs";

const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const cliPath = fileURLToPath(
  new URL("./helpers/dev-server.mjs", import.meta.url),
);
const wranglerPath = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const builtWranglerConfig = fileURLToPath(
  new URL("../dist/server/wrangler.json", import.meta.url),
);
const migration0000 = fileURLToPath(
  new URL("../drizzle/0000_hot_quasimodo.sql", import.meta.url),
);
const migration0001 = fileURLToPath(
  new URL("../drizzle/0001_overjoyed_robin_chapel.sql", import.meta.url),
);

const requestedPhase = process.env.EVI_X_TEST_PHASE || "full";
if (!["full", "general-restart"].includes(requestedPhase)) throw new Error("Unknown EVI_X_TEST_PHASE");
const nativeOnly = process.env.EVI_X_TEST_NATIVE_ONLY === "1";
if (nativeOnly && requestedPhase !== "full") throw new Error("Native-only and general-restart scopes cannot be combined");
const testRoot = await mkdtemp(join(tmpdir(), "evi-x-d1-"));
const nativeRecoveryRecordPath = join(testRoot, "native-recovery-record.json");
const freshState = join(testRoot, "fresh-state");
const legacyState = join(testRoot, "legacy-state");
const migrationRoot = join(testRoot, "migration-inputs");
const migrationConfig = join(migrationRoot, "wrangler.json");
const keepState = process.env.EVI_X_TEST_KEEP_STATE === "1";
let childEnv;
let migrationFiles = [];
let commandSequence = 0;
let server = null;
let serverLock = null;
let output = "";
let baseUrl = "";
let testExitCode = 1;
let phase = "setup";
let serverSequence = 0;
let processTreeUnconfirmed = false;
const confirmedStoppedTrees = new WeakSet();
const gracefulStopReceipts = new WeakSet();
const usedPorts = new Set();
let docsServer = null;
let docsOrigin = "";
const docsSecret = "synthetic-onlyoffice-http-test-secret-20260927-NE";

try {
  trace("scope", { scope: nativeOnly ? "native-only" : requestedPhase, fullRegression: !nativeOnly && requestedPhase === "full" });
  await prepareIsolatedInputs();
  if (!nativeOnly) await verifyLegacyMigration();
  await applyAllMigrations(freshState);
  await verifyFreshSchema();
  await startMockDocs();

  if (requestedPhase === "general-restart") {
    await startServer(freshState);
    await verifyGeneralRestart();
    testExitCode = 0;
  } else {
  phase = "native-origin-boundaries";
  for (const unsafe of ["shell-same-host", "docs-same-host"]) {
    await startServer(freshState, true, unsafe);
    const check = await jsonRequest("/api/drafts/native/status");
    assert.equal(check.response.status, 200);
    assert.equal(check.body.configured, false, `unsafe ${unsafe} hostname topology must fail closed`);
    await stopServer();
  }
  await startServer(freshState, true, "shared-service-host");
  const dockerTopology = await jsonRequest("/api/drafts/native/status");
  assert.equal(dockerTopology.response.status, 200);
  assert.equal(dockerTopology.body.configured, true, "two exact service ports may share a Docker gateway hostname");
  await stopServer();

  await startServer(freshState);
  phase = "http-assertions";
  const httpCode = await runHttpTests();
  if (httpCode !== 0) {
    process.stderr.write(`HTTP test server exit=${server?.exitCode} signal=${server?.signalCode}\n${output}\n`);
    testExitCode = httpCode;
  } else {
    phase = "native-recovery-restart";
    await verifyNativeRecoveryAfterRestart();
    if (nativeOnly) { testExitCode = 0; }
    else {
    await verifyGeneralRestart();
    testExitCode = 0;
    }
  }
  }
} catch (error) {
  trace("failure", { pid: server?.pid, exitCode: server?.exitCode, signalCode: server?.signalCode });
  process.stderr.write(inspect(error, { depth: 5, maxStringLength: 4000, maxArrayLength: 6, customInspect: false, getters: false }) + "\n");
  if (output) process.stderr.write("Server output:\n" + output + "\n");
  testExitCode = 1;
} finally {
  let cleanupConfirmed = false;
  try {
    await stopServer();
    cleanupConfirmed = !processTreeUnconfirmed;
  } catch (error) {
    testExitCode = 1;
    trace("cleanup-failed", { pid: server?.pid, exitCode: server?.exitCode, signalCode: server?.signalCode });
    process.stderr.write(inspect(error, { depth: 3, maxStringLength: 2000, customInspect: false, getters: false }) + "\n");
  }
  if (docsServer) await new Promise(resolve => docsServer.close(resolve));
  if (cleanupConfirmed && testExitCode === 0 && !keepState) {
  assert.equal(dirname(resolve(testRoot)), resolve(tmpdir()), "cleanup must stay in this run's temporary directory");
  assert.match(basename(testRoot), /^evi-x-d1-[A-Za-z0-9]+$/);
  assert.equal(await realpath(testRoot), testRoot, "refuse redirected cleanup target");
  await rm(testRoot, {
    recursive: true,
    force: true,
    maxRetries: process.platform === "win32" ? 10 : 2,
    retryDelay: 200,
  });
  } else {
    // Retain only this run's synthetic state for diagnosis. Never remove a
    // directory while descendants may still be using it.
    trace("temporary-state-retained", { path: testRoot });
  }
}
process.exitCode = testExitCode;

function trace(event, details = {}) {
  process.stderr.write(JSON.stringify({ kind: "integration_lifecycle", time: new Date().toISOString(), phase, event, ...details }) + "\n");
}

async function verifyGeneralRestart() {
  phase = "general-fixture-create";
  trace("phase-start");
  const fixture = await createD1Fixture();
  phase = "general-fixture-restart";
  await stopServer();
  await startServer(freshState);
  await verifyD1FixtureAfterRestart(fixture);
  phase = "office-binding-disabled";
  await stopServer();
  await startServer(freshState, false);
  const missingOffice = await jsonRequest('/api/drafts/files', {headers:d1Headers(fixture.ownerKey,false)});
  assert.equal(missingOffice.response.status,503);
  assert.equal(missingOffice.body.error.code,'office_storage_unavailable');
  const independentDraft = await jsonRequest(`/api/drafts/${fixture.draftId}`, {headers:d1Headers(fixture.ownerKey,false)});
  assert.equal(independentDraft.response.status,200);
  assert.deepEqual(independentDraft.body.draft.content,fixture.content);
  process.stdout.write("Office binding disabled: real-file API fails closed while legacy drafts remain intact.\n");
  process.stdout.write("D1 integration: isolated migration, owner partition, and restart persistence passed.\n");
}

async function assertNoImplicitConfig() {
  // Some plugins load dotenv themselves, ignoring Vite envDir. Check only file
  // names, never contents; refuse real local settings rather than copy them.
  const appNames = await readdir(projectRoot);
  assert(!appNames.some(name => /^\.(?:env|dev\.vars)(?:\.|$)/i.test(name)), "Synthetic integration refuses project dotenv/dev-vars files; no contents were read");
  for (let dir = projectRoot;; dir = dirname(dir)) {
    const names = await readdir(dir);
    assert(!names.some(name => /^wrangler\.(?:toml|jsonc?)$/i.test(name)), "Synthetic integration refuses implicit ancestor Wrangler config; no contents were read");
    if (dirname(dir) === dir) break;
  }
}

async function prepareIsolatedInputs() {
  await assertNoImplicitConfig();
  await mkdir(join(testRoot, "child-context"));
  const isolated = createIsolatedTestEnv({ rootDir: join(testRoot, "child-context"), inherited: process.env });
  childEnv = isolated.env;
  await mkdir(join(migrationRoot, "migrations"), { recursive: true });
  // Only explicitly synthetic local bindings may enter this integration fixture.
  // Do not pass the built application config, vars, or user .env files to Wrangler.
  const built = JSON.parse(await readFile(builtWranglerConfig, "utf8"));
  assert.equal(built.d1_databases?.length, 1);
  const database = built.d1_databases[0];
  assert.equal(database.binding, "DB");
  assert.equal(database.database_id, "00000000-0000-4000-8000-000000000000");
  const sourceDir = join(projectRoot, "drizzle");
  assert.equal(await realpath(sourceDir), sourceDir);
  migrationFiles = (await readdir(sourceDir)).filter(name => /\.sql$/i.test(name)).sort();
  assert(migrationFiles.length > 0);
  assert(migrationFiles.every(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)), "Refuse an unrecognized SQL filename rather than silently omit a migration");
  const inputs = [];
  for (const name of migrationFiles) {
    const source = join(sourceDir, name), metadata = await lstat(source);
    assert(metadata.isFile() && !metadata.isSymbolicLink());
    const bytes = await readFile(source);
    inputs.push({ name, sha256: createHash("sha256").update(bytes).digest("hex") });
    await copyFile(source, join(migrationRoot, "migrations", name));
  }
  await writeFile(migrationConfig, JSON.stringify({ name: "evix-synthetic-integration", compatibility_date: built.compatibility_date,
    d1_databases: [{ binding: "DB", database_name: "site-creator-d1", database_id: database.database_id, migrations_dir: "./migrations" }] }), { flag: "wx" });
  await writeFile(join(testRoot, "migration-inputs.json"), JSON.stringify(inputs, null, 2), { flag: "wx" });
  trace("isolated-context-ready", { path: testRoot, migrations: inputs.length, inheritedSecrets: false, offlineGuarantee: false });
}

async function applyAllMigrations(statePath) {
  await runWrangler(
    [
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--persist-to",
      statePath,
      "--config",
      migrationConfig,
    ],
    "fresh D1 migrations",
  );
}

async function verifyLegacyMigration() {
  const legacyProjectId = "11111111-1111-4111-8111-111111111111";
  const legacyGateStatus = JSON.stringify({
    rule: "pass",
    problem: "unknown",
    design: "unknown",
    fieldwork: "unknown",
    data: "unknown",
    inference: "unknown",
    action: "unknown",
    visual: "unknown",
    submission: "unknown",
  });
  const commonArgs = [
    "d1",
    "execute",
    "DB",
    "--local",
    "--persist-to",
    legacyState,
    "--config",
    migrationConfig,
  ];

  await runWrangler([...commonArgs, "--file", join(migrationRoot, "migrations", basename(migration0000))], "legacy schema setup");
  const fixtureSql = [
    "INSERT INTO projects (id, client_key_hash, title, stage, gate_status, created_at, updated_at)",
    "VALUES ('" + legacyProjectId + "', '" + "a".repeat(64) + "', 'Legacy fixture', 'rule_scoped', '" + legacyGateStatus + "', '2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z');",
    "INSERT INTO project_events (project_id, event_type, stage_from, stage_to, created_at) VALUES",
    "('" + legacyProjectId + "', 'project_created', NULL, 'initialized', '2026-08-01T00:00:00.000Z'),",
    "('" + legacyProjectId + "', 'stage_updated', 'initialized', 'rule_scoped', '2026-08-02T00:00:00.000Z'),",
    "('" + legacyProjectId + "', 'gate_updated', NULL, NULL, '2026-08-02T00:00:01.000Z');",
  ].join(" ");
  await runWrangler([...commonArgs, "--command", fixtureSql], "legacy fixture insert");
  await runWrangler([...commonArgs, "--file", join(migrationRoot, "migrations", basename(migration0001))], "canonical migration");

  const query = [
    "SELECT p.id, p.stage, p.gate_status, p.legacy_stage, p.legacy_gate_status,",
    "p.authority, p.integrity, p.updated_at,",
    "(SELECT COUNT(*) FROM project_events e WHERE e.project_id = p.id) AS event_count,",
    "(SELECT COUNT(*) FROM project_events e WHERE e.project_id = p.id AND e.id <= 3 AND e.workflow_version IS NULL) AS preserved_legacy_events,",
    "(SELECT COUNT(*) FROM project_events e WHERE e.project_id = p.id AND e.event_type = 'legacy_web_v1_migrated_to_canonical_v1') AS migration_events",
    "FROM projects p WHERE p.id = '" + legacyProjectId + "';",
  ].join(" ");
  const result = parseWranglerJson(
    await runWrangler([...commonArgs, "--command", query, "--json"], "legacy migration query"),
  );
  const row = result[0]?.results?.[0];
  assert.ok(row, "legacy project must survive migration");
  assert.equal(row.stage, "intake");
  assert.equal(row.legacy_stage, "rule_scoped");
  assert.equal(row.legacy_gate_status, legacyGateStatus);
  assert.equal(row.updated_at, "2026-08-02T00:00:00.000Z");
  assert.equal(row.authority, "legacy_unverified");
  assert.equal(row.integrity, "needs_revalidation");
  assert.equal(Number(row.event_count), 4);
  assert.equal(Number(row.preserved_legacy_events), 3);
  assert.equal(Number(row.migration_events), 1);
  assert.ok(
    Object.values(JSON.parse(row.gate_status)).every((value) => value === "not_run"),
    "canonical gate status must reset fail-closed",
  );

  const foreignKeys = parseWranglerJson(
    await runWrangler(
      [...commonArgs, "--command", "PRAGMA foreign_key_check;", "--json"],
      "legacy foreign key check",
    ),
  );
  assert.equal(foreignKeys[0]?.success, true);
  assert(Array.isArray(foreignKeys[0]?.results));
  assert.equal(foreignKeys[0].results.length, 0);
  process.stdout.write(
    "D1 migration: legacy stage/gates and all events preserved without implicit mapping.\n",
  );
}

async function verifyFreshSchema() {
  const args = ["d1", "execute", "DB", "--local", "--persist-to", freshState, "--config", migrationConfig];
  const query = "SELECT name FROM d1_migrations ORDER BY name; SELECT name FROM sqlite_master WHERE type='table' ORDER BY name; PRAGMA foreign_key_check; PRAGMA quick_check;";
  const result = parseWranglerJson(await runWrangler([...args, "--command", query, "--json"], "fresh schema ledger check"));
  assert.equal(result.length, 4); assert(result.every(item => item.success === true));
  assert.deepEqual(result[0].results.map(row => row.name), migrationFiles, "Every source migration must be present exactly once");
  const schema = await readFile(join(projectRoot, "db/schema.ts"), "utf8");
  const requiredTables = [...schema.matchAll(/sqliteTable\(\s*"([a-z_]+)"/g)].map(match => match[1]);
  assert(requiredTables.length > 0);
  const present = new Set(result[1].results.map(row => row.name));
  for (const name of requiredTables) assert(present.has(name), `Missing table ${name}`);
  assert.equal(result[2].results.length, 0, "Fresh foreign keys must be consistent");
  assert.deepEqual(result[3].results, [{ quick_check: "ok" }]);
  trace("fresh-storage-preflight-verified", { migrations: migrationFiles, tablePresence: requiredTables, foreignKeyViolations: 0, quickCheck: "ok", completeColumnConstraintEquivalence: false });
}

async function runWrangler(args, label) {
  assert(childEnv, "Isolated environment must be prepared before commands");
  assert(args.includes("--local") && !args.includes("--remote"));
  const sequence = ++commandSequence;
  trace("migration-command-start", { sequence, label });
  const result = await runBoundedCommand({ command: process.execPath, args: [wranglerPath, ...args],
    cwd: migrationRoot, env: childEnv, timeoutMs: 120_000, maxOutputBytes: 2 * 1024 * 1024 });
  await writeFile(join(testRoot, `command-${sequence}.json`), JSON.stringify({ label, ...result.receipt }, null, 2), { flag: "wx" });
  await writeFile(join(testRoot, `command-${sequence}.stdout.log`), result.stdout, { flag: "wx" });
  await writeFile(join(testRoot, `command-${sequence}.stderr.log`), result.stderr, { flag: "wx" });
  trace("migration-command-end", { sequence, label, ...result.receipt });
  if (!result.receipt.passed) {
    processTreeUnconfirmed = true;
    throw new Error(`${label} failed bounded setup; retained command evidence in ${testRoot}`);
  }
  return result.stdout;
}

function parseWranglerJson(raw) {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end < start) {
    throw new Error("Wrangler did not return JSON.\n" + raw);
  }
  return JSON.parse(raw.slice(start, end + 1));
}

async function startServer(statePath, officeEnabled = true, unsafeNativeTopology = "") {
  await assertNoImplicitConfig();
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const port = await getFreePort();
    const startedAfter = Date.now() - 1_000;
    const nonce = randomBytes(32).toString("hex");
    baseUrl = "http://localhost:" + port;
    output = "";
    server = spawn(
      process.execPath,
      [cliPath, String(port), nonce],
      {
        cwd: projectRoot,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        env: {
          ...childEnv,
          EVI_X_TEST_RUN_ROOT: testRoot,
          EVI_X_D1_PERSIST_PATH: statePath,
          EVI_X_OFFICE_LOCAL_FILES: officeEnabled ? "1" : "0",
          EVI_X_ONLYOFFICE_BROWSER_ORIGIN: docsOrigin,
          EVI_X_ONLYOFFICE_DOWNLOAD_ORIGIN: unsafeNativeTopology === "shared-service-host" ? "http://host.docker.internal:8080" : docsOrigin,
          EVI_X_ONLYOFFICE_APP_ORIGIN: unsafeNativeTopology === "shared-service-host" ? "http://host.docker.internal:3001" : baseUrl,
          EVI_X_ONLYOFFICE_SHELL_ORIGIN: unsafeNativeTopology === "shell-same-host" ? "http://localhost:3002" : "http://127.0.0.2:3002",
          EVI_X_ONLYOFFICE_BROWSER_APP_ORIGIN: baseUrl,
          ...(unsafeNativeTopology === "docs-same-host" ? { EVI_X_ONLYOFFICE_BROWSER_ORIGIN: "http://localhost:39999" } : {}),
          EVI_X_ONLYOFFICE_JWT_SECRET: unsafeNativeTopology === "unconfigured" ? "" : docsSecret,
          EVI_X_ONLYOFFICE_LOCAL_DEV: "1",
          WRANGLER_WRITE_LOGS: "false",
          WRANGLER_LOG_PATH: join(testRoot, "server-logs"),
          MINIFLARE_REGISTRY_PATH: join(testRoot, "registry"),
        },
      },
    );
    // Spawn failure reports asynchronously even when no PID is assigned.
    // Observe it before any assertion can unwind this startup frame.
    server.on("error", error => trace("server-error", { pid: server?.pid, code: error.code }));
    if (!Number.isInteger(server.pid) || server.pid <= 0) {
      throw new Error("Isolated Vite launcher did not return a process identifier.");
    }
    serverLock = {
      pid: server.pid,
      port,
      hostname: "localhost",
      cwd: projectRoot,
      startedAfter,
      nonce,
    };

    const active = server;
    let readyMessage = null;
    active.on("message", message => {
      const identity = { nonce, pid: active.pid, port, hostname: "localhost", cwd: projectRoot };
      if (isOwnedReadiness(message, identity)) readyMessage = message;
      if (isOwnedShutdown(message, identity)) gracefulStopReceipts.add(active);
    });
    const sequence = ++serverSequence;
    trace("server-start", { sequence, pid: active.pid, port, officeEnabled, topology: unsafeNativeTopology || "normal" });
    const collect = (chunk) => { if (server === active) output = (output + chunk.toString()).slice(-64 * 1024); };
    active.stdout.on("data", collect);
    active.stderr.on("data", collect);
    active.on("exit", (exitCode, signalCode) => trace("server-exit", { sequence, pid: active.pid, exitCode, signalCode }));
    try {
      await waitUntilReady(() => readyMessage !== null);
      const current = readyMessage;
      assert.equal(current.pid, active.pid, "readiness must belong to this exact child process");
      assert.equal(current.port, port, "a fallback or stale server port is not the requested endpoint");
      assert.equal(current.hostname, serverLock.hostname);
      assert.equal(current.cwd, projectRoot);
      assert.equal(current.nonce, nonce, "readiness must arrive on the owned IPC channel with this run's nonce");
      trace("server-ready", { sequence, pid: active.pid, port });
      return;
    } catch (error) {
      lastError = error;
      const addressWasTaken = /EADDRINUSE|address already in use/i.test(output);
      await stopServer();
      if (!addressWasTaken || attempt === 2) throw error;
    }
  }
  throw lastError ?? new Error("Unable to start vinext dev server.");
}

async function runHttpTests() {
  const files = nativeOnly ? ["tests/native-editor-api.test.mjs"] :
    ["tests/rendered-html.test.mjs", "tests/editor-api.test.mjs", "tests/office-api.test.mjs", "tests/editor-recovery-api.test.mjs", "tests/native-editor-api.test.mjs", "tests/research-flow-api.test.mjs"];
  const result = await runBoundedCommand({command: process.execPath,
    // Bound cross-file load; individual cases retain concurrent-write assertions.
    args: ["--test", "--test-concurrency=1", ...files], cwd: projectRoot,
    env: { ...childEnv, EVI_X_TEST_BASE_URL: baseUrl, EVI_X_TEST_DOCS_ORIGIN: docsOrigin,
      EVI_X_TEST_DOCS_SECRET: docsSecret, EVI_X_TEST_RECOVERY_RECORD_PATH: nativeRecoveryRecordPath },
    timeoutMs: 600_000, maxOutputBytes: 8 * 1024 * 1024,
    onOutput: ({stream, chunk}) => process[stream].write(chunk),
  });
  await writeFile(join(testRoot, "http-runner.json"), JSON.stringify(result.receipt, null, 2), {flag: "wx"});
  trace("http-runner-complete", result.receipt);
  if (!result.receipt.passed && (!result.receipt.captured_tree_empty || result.receipt.observation_error)) processTreeUnconfirmed = true;
  return result.receipt.passed ? 0 : result.receipt.command_exit_code || 1;
}

async function verifyNativeRecoveryAfterRestart() {
  const record = JSON.parse(await readFile(nativeRecoveryRecordPath, "utf8"));
  assert.match(record.key, /^ne_[A-Za-z0-9_-]{43}$/);
  const own = { cookie: record.cookie, "x-editor-scope": record.scope };
  await stopServer();
  await startServer(freshState, true, "unconfigured");
  const availability = await jsonRequest("/api/drafts/native/status");
  assert.equal(availability.body.configured, false, "Docs settings really must be absent after restart");
  const listing = await jsonRequest("/api/drafts/native/recoveries", { headers: own });
  assert.equal(listing.response.status, 200);
  assert.ok(listing.body.items.some(item => item.key === record.key), "same owner must re-find recovery after restart");
  const recovered = await fetch(`${baseUrl}/api/drafts/native/sessions/${record.key}/recovery`, { headers: own });
  assert.equal(recovered.status, 200, "recovery download must not depend on Docs config or availability");
  const bytes = Buffer.from(await recovered.arrayBuffer());
  assert.equal(bytes.length, record.size);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), record.sha256);
  await stopServer();

  const pastExpiry = Date.now() - 60_000;
  const originalCreated = pastExpiry - 7 * 86_400_000;
  const d1Args = ["d1", "execute", "DB", "--local", "--persist-to", freshState, "--config", migrationConfig];
  await runWrangler([...d1Args, "--command", `UPDATE native_editor_recoveries SET created_at_ms=${originalCreated},expires_at_ms=${pastExpiry} WHERE key='${record.key}';`], "expire synthetic recovery fixture");
  await startServer(freshState);
  assert.equal((await fetch(`${baseUrl}/api/drafts/native/sessions/${record.key}/recovery`, { headers: own })).status, 404);
  const expiredList = await jsonRequest("/api/drafts/native/recoveries", { headers: own });
  assert.equal(expiredList.response.status, 200);
  assert.ok(expiredList.body.items.every(item => item.key !== record.key));
  const opened = await jsonRequest("/api/drafts/native/sessions", { method: "POST", headers: {
    ...own, origin: baseUrl, "x-native-editor-intent": "open", "content-type": "application/json" },
    body: JSON.stringify({ fileId: record.fileId, revision: 2 }) });
  assert.equal(opened.response.status, 201, "new session must reclaim only an expired recovery slot");
  const head = await jsonRequest(`/api/drafts/files/${record.fileId}`, { headers: own });
  assert.equal(head.response.status, 200);
  assert.equal(head.body.file.revision, 2);
  assert.equal(head.body.file.sha256, record.headSha256, "expired conflict cleanup may not alter committed Office head");
  await stopServer();
  const remaining = parseWranglerJson(await runWrangler([...d1Args, "--command",
    `SELECT COUNT(*) AS count FROM native_editor_recoveries WHERE key='${record.key}';`, "--json"], "verify expired recovery metadata cleanup"));
  assert.equal(Number(remaining[0]?.results?.[0]?.count), 0);
  await startServer(freshState);
  process.stdout.write("Native recovery: restart/offline Docs, owner listing/download, seven-day expiry, bounded-slot cleanup and original-head preservation passed.\n");
}

async function startMockDocs() {
  const files = new Map();
  const inFlightDownloads = new Set();
  docsServer = createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (path.startsWith("/probe/slowfixture/") && request.method === "GET") {
      response.writeHead(inFlightDownloads.has(path.slice("/probe".length)) ? 200 : 404).end(); return;
    }
    if ((path.startsWith("/fixture/") || path.startsWith("/slowfixture/")) && request.method === "PUT") {
      const chunks = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > 21 * 1024 * 1024) { response.writeHead(413).end(); return; } chunks.push(chunk); }
      files.set(path, Buffer.concat(chunks)); response.writeHead(200).end(); return;
    }
    if ((path.startsWith("/fixture/") || path.startsWith("/slowfixture/")) && request.method === "GET") {
      const bytes = files.get(path); if (!bytes) { response.writeHead(404).end(); return; }
      if (path.startsWith("/slowfixture/")) {
        inFlightDownloads.add(path);
        try { await new Promise(resolve => setTimeout(resolve, 2000)); }
        finally { inFlightDownloads.delete(path); }
      }
      response.writeHead(200, { "content-type": "application/octet-stream", "content-length": bytes.length, "cache-control": "no-store" }).end(bytes); return;
    }
    if (path === "/redirect" && request.method === "GET") { response.writeHead(302, { location: `${docsOrigin}/fixture/redirect-target` }).end(); return; }
    if (path === "/oversized" && request.method === "GET") { response.writeHead(200, { "content-length": String(21 * 1024 * 1024) }).end(); return; }
    response.writeHead(404).end();
  });
  await new Promise((resolve, reject) => { docsServer.once("error", reject); docsServer.listen(0, "127.0.0.1", resolve); });
  const address = docsServer.address();
  docsOrigin = `http://127.0.0.1:${address.port}`;
}

async function createD1Fixture() {
  const ownerKey = "evx_D1owner0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const otherKey = "evx_D1other0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const created = await jsonRequest("/api/projects", {
    method: "POST",
    headers: d1Headers(ownerKey, true),
    body: JSON.stringify({ title: "D1 重启持久化回归" }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.storage, "d1");
  assert.equal(created.body.project.controlStatus, "intake");
  assert.ok(
    Object.values(created.body.project.gateStatus).every((value) => value === "not_run"),
  );

  const ownList = await jsonRequest("/api/projects", {
    headers: d1Headers(ownerKey, false),
  });
  assert.equal(ownList.response.status, 200);
  assert.equal(ownList.body.storage, "d1");
  assert.ok(ownList.body.projects.some((item) => item.id === created.body.project.id));

  const otherList = await jsonRequest("/api/projects", {
    headers: d1Headers(otherKey, false),
  });
  assert.equal(otherList.response.status, 200);
  assert.ok(otherList.body.projects.every((item) => item.id !== created.body.project.id));
  const draftId = crypto.randomUUID();
  const content = createEditorContent();
  content.title = "报告与PPT跨重启验收";
  content.report[0].body = "重启后必须保留的正文";
  content.slides[0].notes = "重启后必须保留的讲稿";
  content.slides = await buildStoryboard(content, [{...blankStoryCard(content.report[0].id), title:'合成数据持久化验收', excerpt:content.report[0].body, classification:'simulated', limitation:'仅用于本机合成验收，不是真实调研。', implication:'重启后逐字段核对内容与关联。', locator:'合成验收稿第 1 章'}], 'append');
  const draft = await jsonRequest("/api/drafts", { method: "POST", headers: d1Headers(ownerKey, true), body: JSON.stringify({ id: draftId, content }) });
  assert.equal(draft.response.status, 201);
  const versionId = crypto.randomUUID();
  const version = await jsonRequest(`/api/drafts/${draftId}/versions`, { method: "POST", headers: d1Headers(ownerKey, true), body: JSON.stringify({ id: versionId, revision: draft.body.draft.revision, label: "重启前命名版本" }) });
  assert.equal(version.response.status, 201);
  const officeHeaders=d1Headers(ownerKey,false);
  const officeList=await jsonRequest('/api/drafts/files',{headers:officeHeaders});
  assert.equal(officeList.response.status,200);
  const officeId=crypto.randomUUID(),officeVersionId=crypto.randomUUID();
  const officeBytes=Buffer.from(await (await buildDocx(content)).arrayBuffer());
  const office=await jsonRequest('/api/drafts/files',{method:'POST',headers:{...officeHeaders,'x-editor-scope':officeList.body.scope,'content-type':'application/octet-stream','x-office-file-id':officeId,'x-office-version-id':officeVersionId,'x-office-name':encodeURIComponent('重启验收.docx'),'x-office-label':encodeURIComponent('重启前原件')},body:officeBytes});
  assert.equal(office.response.status,201,JSON.stringify(office.body));
  const session = await jsonRequest('/api/drafts/session',{method:'POST',headers:{origin:baseUrl}});
  assert.equal(session.response.status,200);
  const recoveryCookie=session.response.headers.get('set-cookie').split(';')[0];
  const status=await jsonRequest('/api/drafts/session/recovery',{headers:{cookie:recoveryCookie,origin:baseUrl,'x-editor-recovery':'1'}});
  assert.equal(status.response.status,200);
  const recoveryKey=createRecoveryKey(),recoveryScope=status.body.scope;
  const recoveryHeaders={cookie:recoveryCookie,origin:baseUrl,'x-editor-recovery':'1','x-editor-scope':recoveryScope,'content-type':'application/json'};
  assert.equal((await jsonRequest('/api/drafts/session/recovery',{method:'POST',headers:recoveryHeaders,body:JSON.stringify({key:recoveryKey,revision:0})})).response.status,200);
  const recoveryDraftId=crypto.randomUUID();
  assert.equal((await jsonRequest('/api/drafts',{method:'POST',headers:recoveryHeaders,body:JSON.stringify({id:recoveryDraftId,content})})).response.status,201);
  const restored=await jsonRequest('/api/drafts/session/restore',{method:'POST',headers:recoveryHeaders,body:JSON.stringify({key:recoveryKey})});
  assert.equal(restored.response.status,200);
  return { ownerKey, id: created.body.project.id, draftId, versionId, content, officeId, officeVersionId, officeBytes, officeSha256:office.body.version.sha256, recoveryKey,recoveryScope,recoveryDraftId,recoveredCookie:restored.response.headers.get('set-cookie').split(';')[0] };
}

async function verifyD1FixtureAfterRestart(fixture) {
  const ownList = await jsonRequest("/api/projects", {
    headers: d1Headers(fixture.ownerKey, false),
  });
  assert.equal(ownList.response.status, 200);
  assert.equal(ownList.body.storage, "d1");
  assert.ok(ownList.body.projects.some((item) => item.id === fixture.id));
  const draft = await jsonRequest(`/api/drafts/${fixture.draftId}`, { headers: d1Headers(fixture.ownerKey, false) });
  assert.equal(draft.response.status, 200);
  assert.deepEqual(draft.body.draft.content, fixture.content);
  assert.equal(await reportLinkState(draft.body.draft.content, draft.body.draft.content.slides.at(-1)), 'current', 'Report storyboard link must survive HTTP storage and restart');
  const version = await jsonRequest(`/api/drafts/${fixture.draftId}/versions/${fixture.versionId}`, { headers: d1Headers(fixture.ownerKey, false) });
  assert.equal(version.response.status, 200);
  assert.deepEqual(version.body.version.content, fixture.content);
  assert.equal(version.body.version.label, "重启前命名版本");
  process.stdout.write("Named editor version survived server restart unchanged.\n");
  process.stdout.write("Editor D1 content and speaker notes survived server restart.\n");
  const office=await fetch(`${baseUrl}/api/drafts/files/${fixture.officeId}/versions/${fixture.officeVersionId}`,{headers:d1Headers(fixture.ownerKey,false)});
  assert.equal(office.status,200);assert.equal(office.headers.get('x-office-sha256'),fixture.officeSha256);
  assert.deepEqual(Buffer.from(await office.arrayBuffer()),fixture.officeBytes);
  process.stdout.write("Office binary and immutable version survived server restart byte-for-byte.\n");
  const recoveryHeaders={cookie:fixture.recoveredCookie,origin:baseUrl,'x-editor-recovery':'1','x-editor-scope':fixture.recoveryScope,'content-type':'application/json'};
  const before=await jsonRequest(`/api/drafts/${fixture.recoveryDraftId}`,{headers:recoveryHeaders});assert.equal(before.response.status,200);assert.deepEqual(before.body.draft.content,fixture.content);
  const restored=await jsonRequest('/api/drafts/session/restore',{method:'POST',headers:recoveryHeaders,body:JSON.stringify({key:fixture.recoveryKey})});assert.equal(restored.response.status,200);assert.equal(restored.body.scope,fixture.recoveryScope);
  const after=await jsonRequest(`/api/drafts/${fixture.recoveryDraftId}`,{headers:{...recoveryHeaders,cookie:restored.response.headers.get('set-cookie').split(';')[0]}});assert.equal(after.response.status,200);assert.deepEqual(after.body.draft.content,fixture.content);
  process.stdout.write("Recovery key and recovered session survived restart with identical owner, report and speaker notes.\n");
}

function d1Headers(ownerKey, hasBody) {
  return {
    accept: "application/json",
    ...(hasBody ? { "content-type": "application/json" } : {}),
    "x-client-key": ownerKey,
    "x-evi-local-storage": "d1",
  };
}

async function jsonRequest(path, init = {}) {
  try {
    // No mutation retries: retain the original failure and its socket cause.
    const response = await fetch(baseUrl + path, { ...init, signal: init.signal ?? AbortSignal.timeout(30_000) });
    return { response, body: await response.json() };
  } catch (cause) {
    throw new Error(`${phase}: ${init.method || "GET"} ${path.split("?")[0]} failed`, { cause });
  }
}

async function getFreePort() {
  // Do not reuse an origin in one run: old keep-alive connections must never
  // target a newly started process that happens to receive the same port.
  for (let attempt = 0; attempt < 16; attempt += 1) {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "localhost", resolve);
  });
  const address = probe.address();
  const selected = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => probe.close(resolve));
  if (!selected) throw new Error("Unable to reserve a test port.");
  if (usedPorts.has(selected)) continue;
  usedPorts.add(selected);
  return selected;
  }
  throw new Error("Unable to select a fresh test port after 16 attempts.");
}

async function waitUntilReady(hasOwnedReadiness = () => true) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (!server || hasExited(server)) {
      throw new Error("vinext dev exited early.\n" + output);
    }
    try {
      if (!hasOwnedReadiness()) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      const response = await fetch(baseUrl + "/api/cases", {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(Math.max(1, Math.min(3_000, deadline - Date.now()))),
      });
      await response.arrayBuffer();
      if (response.ok) return;
    } catch {
      // The server socket is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Timed out waiting for vinext dev.\n" + output);
}

async function stopServer() {
  if (!server && !serverLock) {
    server = null;
    return;
  }
  const active = server;
  const ownedLock = serverLock;
  let capturedTree = null;
  if (process.platform === "win32" && active && !hasExited(active)) {
    try { capturedTree = captureOwnedTree(readWindowsProcesses(), active.pid, ownedLock?.startedAfter); }
    catch { processTreeUnconfirmed = true; trace("tree-snapshot-unavailable", { pid: active.pid }); }
  }
  if (active && !hasExited(active) && active.connected) {
    assert.equal(active.pid, ownedLock?.pid, "shutdown must target this owned child");
    trace("server-graceful-stop", { pid: active.pid });
    active.send({ type: "evix-test-stop", nonce: ownedLock.nonce });
    if (await waitForExit(active, 15_000) && gracefulStopReceipts.has(active) && active.exitCode === 0) {
      let verified = process.platform !== "win32";
      if (capturedTree) {
        try {
          const deadline = Date.now() + 5_000;
          do {
            const snapshot = updateOwnedProcesses(readWindowsProcesses(), capturedTree);
            capturedTree = snapshot.captured;
            verified = snapshot.remaining.length === 0;
            if (!verified) await new Promise(resolve => setTimeout(resolve, 100));
          } while (!verified && Date.now() < deadline);
        } catch { verified = false; }
      }
      if (verified) { confirmedStoppedTrees.add(active); trace("server-graceful-stopped", { pid: active.pid, treeVerified: true }); }
      else { processTreeUnconfirmed = true; trace("tree-stop-unconfirmed", { pid: active.pid }); }
    }
  }
  // A crashed parent does not prove that its descendants stopped. Never use
  // its now-reusable PID for taskkill; retain this run's state for diagnosis.
  if (process.platform === "win32" && active && hasExited(active) && !confirmedStoppedTrees.has(active)) {
    processTreeUnconfirmed = true;
  }
  if (active && !hasExited(active)) {
    assert.ok(Number.isInteger(active.pid) && active.pid > 0 && active.pid === ownedLock?.pid, "only the owned live child may be stopped");
    trace("server-stop", { pid: active.pid });
    // Forced termination is a failed lifecycle gate, even if every captured
    // process disappears. Never stop a tree by a possibly recycled parent PID.
    processTreeUnconfirmed = true;
    if (process.platform === "win32" && capturedTree?.length) {
      const adapter = createWindowsProcessAdapter();
      try {
        const snapshot = updateOwnedProcesses(await adapter.readProcesses(), capturedTree);
        for (const row of snapshot.remaining) {
          const result = await adapter.stopIdentity(row);
          trace("identity-stop-result", {pid: row.pid, created: row.created, result});
        }
      } catch { trace("identity-stop-unconfirmed"); }
    }
    await waitForExit(active, 3_000);
  }
  if (active) {
    active.stdout.destroy();
    active.stderr.destroy();
  }
  if (processTreeUnconfirmed) {
    if (active?.connected) active.disconnect();
    active?.unref();
    throw new Error("Clean natural lifecycle was not confirmed; refusing further startup and preserving this run's temporary state");
  }
  // This launcher never acquires the user's Vinext lock; never unlink it.
  serverLock = null;
  server = null;
}

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child, timeoutMs) {
  if (hasExited(child)) return Promise.resolve(true);
  return new Promise(resolve => {
    const finish = stopped => { clearTimeout(timer); child.off("exit", exited); resolve(stopped); };
    const exited = () => finish(true);
    const timer = setTimeout(() => finish(hasExited(child)), timeoutMs);
    child.once("exit", exited);
  });
}
