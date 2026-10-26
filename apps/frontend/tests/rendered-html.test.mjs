import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { heldOpenUpload } from "./helpers/held-open-upload.mjs";
import {
  canInterpretLifecycleSnapshot,
  isLifecycleSnapshotExpired,
  LIFECYCLE_SNAPSHOT_MAX_AGE_MS,
  selectLifecyclePresentation,
} from "../lib/lifecycle-interpretation.js";

const baseUrl = process.env.EVI_X_TEST_BASE_URL;
assert.ok(baseUrl, "EVI_X_TEST_BASE_URL must be provided by tests/run-tests.mjs");

test("renders workbench panels and unbiased native evidence choices", async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /class="workbench" data-theme="light"/);
  for (const panel of ["overview", "cases", "diagnose", "workspace", "rules", "editor", "analysis", "design", "defense"]) {
    assert.match(html, new RegExp(`data-workbench-panel="${panel}"`));
  }
  assert.match(html, /data-testid="evidence-flight" data-phase="idle" data-stage="Q"/);
  const evidenceInputs = [...html.matchAll(/<input\b[^>]*name="diagnosis-evidence"[^>]*>/g)].map(match => match[0]);
  assert.equal(evidenceInputs.length, 4);
  for (const input of evidenceInputs) {
    assert.match(input, /type="radio"/);
    assert.match(input, /\brequired=""/);
    assert.doesNotMatch(input, /\bchecked(?:=|\s|>)/);
  }
  assert.match(html, /aria-label="报告案例库"/);
  assert.match(html, /aria-label="选择原报告 PDF"/);
  assert.match(html, /aria-label="检索报告"/);
  assert.match(html, /路演与答辩/);
  assert.match(html, /证据定位/);
  assert.match(html, /不是官方时限/);
  assert.match(html, /只抽象训练机制/);
});

const PROJECT_STAGES = [
  "intake",
  "rule_lock",
  "problem_framing",
  "exploratory_research",
  "survey_design",
  "fieldwork",
  "data_analysis",
  "insight_action",
  "report_visual",
  "defense",
  "submission_ready",
  "closed",
];
const GATE_NAMES = [
  "rule",
  "problem",
  "design",
  "fieldwork",
  "data",
  "inference",
  "action",
  "visual",
  "submission",
];
const GATE_VALUES = [
  "not_run",
  "running",
  "pass",
  "warning",
  "fail",
  "unknown",
  "stale",
];

test("interprets lifecycle advice only for current healthy coherent snapshots", () => {
  const valid = {
    hasSnapshot: true,
    contractMatches: true,
    consistent: true,
    stale: false,
    doctorHealthy: true,
    doctorExitCode: 0,
    checksPassed: true,
  };
  assert.equal(canInterpretLifecycleSnapshot(valid), true);
  for (const [field, value] of [
    ["hasSnapshot", false],
    ["contractMatches", false],
    ["consistent", false],
    ["stale", true],
    ["doctorHealthy", false],
    ["doctorExitCode", 2],
    ["checksPassed", false],
  ]) {
    const denied = { ...valid, [field]: value };
    assert.equal(canInterpretLifecycleSnapshot(denied), false, `${field} must fail closed`);
    assert.deepEqual(selectLifecyclePresentation(denied), {
      showTransition: false,
      showMaterials: false,
      showNextAction: false,
      showParallelWork: false,
      showRawTechnicalDetails: true,
    });
  }
  assert.deepEqual(selectLifecyclePresentation(valid), {
    showTransition: true,
    showMaterials: true,
    showNextAction: true,
    showParallelWork: true,
    showRawTechnicalDetails: false,
  });
});

test("expires lifecycle snapshots at the five-minute evidence boundary", () => {
  const observedAt = "2026-08-28T00:00:00.000Z";
  const observedMs = Date.parse(observedAt);
  assert.equal(
    isLifecycleSnapshotExpired(observedAt, observedMs + LIFECYCLE_SNAPSHOT_MAX_AGE_MS - 1),
    false,
  );
  assert.equal(
    isLifecycleSnapshotExpired(observedAt, observedMs + LIFECYCLE_SNAPSHOT_MAX_AGE_MS),
    true,
  );
  assert.equal(isLifecycleSnapshotExpired("invalid", observedMs), true);
  assert.equal(isLifecycleSnapshotExpired(observedAt, observedMs - 31_000), true);
});

async function request(path = "/", init = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: init.body ? "application/json" : "text/html",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
}

async function jsonRequest(path, init = {}) {
  const response = await request(path, {
    ...init,
    headers: { accept: "application/json", ...init.headers },
  });
  return { response, body: await response.json() };
}

test("server-renders the finished EVI-X product shell", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);

  const html = await response.text();
  assert.match(html, /<title>证见 EVI-X｜正大杯冠军 Agent<\/title>/);
  assert.match(html, /让每个问题/);
  assert.match(html, /报告案例库/);
  assert.match(html, /Agent 诊断/);
  assert.match(html, /项目控制门户/);
  assert.match(html, /生命周期作战室/);
  assert.match(html, /门户登记态｜不是进度凭证/);
  assert.match(html, /本地权威态｜只读/);
  assert.match(html, /五维赛事规则解析器/);
  assert.match(html, /控制执行保持关闭/);
  assert.doesNotMatch(html, /保存阶段|更新控制阶段|修改 Gate|签发交接/);
  assert.match(html, /证见 EVI-X/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("publishes the hash-locked canonical control contract and fail-closed capabilities", async () => {
  const [{ response, body }, snapshotRaw] = await Promise.all([
    jsonRequest("/api/control-contract"),
    readFile(new URL("../data/control-plane-contract.snapshot.json", import.meta.url), "utf8"),
  ]);
  const snapshot = JSON.parse(snapshotRaw);

  assert.equal(response.status, 200);
  assert.deepEqual(body.stages, PROJECT_STAGES);
  assert.deepEqual(body.gates.names, GATE_NAMES);
  assert.deepEqual(body.gates.values, GATE_VALUES);
  assert.deepEqual(body.gates.accepted, ["pass", "warning"]);
  assert.deepEqual(body.gates.blocking, ["not_run", "running", "fail", "unknown", "stale"]);
  assert.equal(body.transitions.length, 11);
  assert.equal(body.contract.workflowSha256, snapshot.source.workflowRawSha256);
  assert.equal(body.contract.gatesSha256, snapshot.source.gatesRawSha256);
  assert.equal(body.capabilities.registryRead, true);
  assert.equal(body.capabilities.registryCreate, true);
  assert.equal(body.capabilities.evaluateGate, false);
  assert.equal(body.capabilities.advanceControlStatus, false);
  assert.equal(body.capabilities.handoff, false);
  assert.equal(body.capabilities.reason, "control_plane_unavailable");
});

test("serves only cases with complete original report metadata", async () => {
  const { response, body } = await jsonRequest("/api/cases");
  assert.equal(response.status, 200);
  assert.equal(body.total, 9);
  assert.equal(body.library.fullReports, body.total);
  assert.ok(body.cases.every(item => /^[a-f0-9]{64}$/.test(item.sha256) && item.pages > 0));
  assert.ok(body.cases.every(item => item.readingGuide.length >= 3));
  assert.ok(body.cases.every(item => item.award === null));
  assert.equal(new Set(body.cases.map(item => item.id)).size, body.total);
  const filtered = await jsonRequest("/api/cases?q=露营");
  assert.equal(filtered.response.status, 200);
  assert.equal(filtered.body.total, 1);
  const first = body.cases[0];
  const detail = await jsonRequest(`/api/cases/${first.id}`);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.case.sha256, first.sha256);
  const removed = await jsonRequest('/api/cases/15-grad-first-001-anhui-university-rural-toilet');
  assert.equal(removed.response.status, 404);
});
test("returns bounded Q-D-I-A readiness without echoing raw project text", async () => {
  const marker = "UNIQUE-RAW-PROBLEM-DO-NOT-PERSIST";
  const { response, body } = await jsonRequest("/api/diagnose", {
    method: "POST",
    body: JSON.stringify({
      title: "银发人群智能出行服务研究",
      problem: `${marker}：某市交通主管部门要在本年度决定是否优化适老出行服务资源配置，并识别优先场景。`,
      decisionOwner: "某市交通主管部门公共服务处",
      population: "某市60岁及以上常住居民",
      geography: "武汉市中心城区",
      stage: "problem_framing",
      evidenceStatus: "partial",
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(body.diagnosis.metric, "project_readiness_not_award_probability");
  assert.ok(body.diagnosis.readiness >= 0 && body.diagnosis.readiness <= 100);
  assert.deepEqual(Object.keys(body.diagnosis.scores), ["Q", "D", "I", "A"]);
  assert.ok(Object.values(body.diagnosis.scores).every((score) => score >= 0 && score <= 25));
  assert.ok(body.diagnosis.risks.length >= 1);
  assert.ok(body.diagnosis.nextSteps.length >= 1);
  assert.equal(body.diagnosis.transitionPlan.currentStage, "problem_framing");
  assert.equal(body.diagnosis.transitionPlan.nextStage, "exploratory_research");
  assert.deepEqual(body.diagnosis.transitionPlan.requiredGates, ["rule", "problem"]);
  assert.deepEqual(body.diagnosis.transitionPlan.requiredArtifacts, ["project-brief.md", "evidence/decision-log.md"]);
  assert.equal(body.diagnosis.transitionPlan.authority, "canonical_contract_read_only");
  assert.match(body.diagnosis.transitionPlan.note, /不代表 Gate 已通过或阶段已推进/);
  assert.match(body.diagnosis.disclaimer, /不是获奖概率|不保证获得任何奖项/);
  assert.match(body.privacy, /不会被持久化/);
  assert.equal(body.persistence, "not_persisted");
  assert.doesNotMatch(JSON.stringify(body), new RegExp(marker));
});

// Keep rejection cases separate: a transport crash must identify the exact
// failed boundary instead of masking the next two checks in a grouped test.
async function assertRejectionRecovery() {
  const response = await fetch(`${baseUrl}/api/rules`, {
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(response.status, 200, "service remains usable after rejection");
  assert.equal((await response.json()).totalRules, 10);
  const post = await fetch(`${baseUrl}/api/rules`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({edition:"synthetic-unknown",group:"synthetic",region:"synthetic",track:"synthetic",stage:"synthetic"}),
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(post.status, 200, "subsequent request-body handling remains usable");
  const body = await post.json();
  assert.equal(body.blocking, true);
  assert.equal(body.match, "none");
  assert.deepEqual(body.rules, []);
}

test("request rejection: invalid UTF-8 returns 400 and preserves service health", {timeout:15_000}, async () => {
  const invalidEncoding = await fetch(`${baseUrl}/api/diagnose`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: Uint8Array.from([123,34,120,34,58,34,195,40,34,125]),
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(invalidEncoding.status, 400);
  assert.equal((await invalidEncoding.json()).error.code, "invalid_json");
  await assertRejectionRecovery();
});

test("request rejection: unsupported media returns 415 and preserves service health", {timeout:15_000}, async () => {
  const unsupported = await fetch(`${baseUrl}/api/diagnose`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "{}",
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(unsupported.status, 415);
  assert.equal((await unsupported.json()).error.code, "unsupported_media_type");
  await assertRejectionRecovery();
});

test("request rejection: oversized streamed JSON returns 413 and preserves service health", {timeout:15_000}, async () => {
  const largeStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`{"problem":"${"x".repeat(9_000)}`));
      controller.enqueue(new TextEncoder().encode('"}'));
      controller.close();
    },
  });
  const oversized = await fetch(`${baseUrl}/api/diagnose`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: largeStream,
    duplex: "half",
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "payload_too_large");
  await assertRejectionRecovery();
});

test("request rejection: ongoing upload receives 413 before EOF and preserves service health", {timeout:20_000}, async () => {
  const upload = heldOpenUpload(8_192);
  try {
    const response = await fetch(`${baseUrl}/api/diagnose`, {
      method:"POST", headers:{"content-type":"application/json"},
      body:upload.body, duplex:"half", signal:upload.signal,
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error.code, "payload_too_large");
    assert.equal(upload.eofReleased, false, "413 must precede client EOF cleanup");
    assert.equal(upload.signal.aborted, false, "deadline must not produce a successful rejection");
  } finally { upload.cleanup(); }
  await assertRejectionRecovery();
});

test("resolves five-dimensional rules exactly and blocks cross-scope fallback", async () => {
  const [{ response: indexResponse, body: index }, snapshotRaw] = await Promise.all([
    jsonRequest("/api/rules"),
    readFile(new URL("../data/rule-corpus.snapshot.json", import.meta.url), "utf8"),
  ]);
  const snapshot = JSON.parse(snapshotRaw);
  assert.equal(indexResponse.status, 200);
  assert.equal(index.totalRules, 10);
  assert.equal(index.totalSources, 1);
  assert.equal(index.competitionUpdate.edition, "第十七届");
  assert.equal(index.competitionUpdate.fullRuleSnapshotAvailable, false);
  assert.equal(index.corpus.sourceRawSha256, snapshot.source.rawSha256);
  assert.match(index.notice.body, /没有匹配即阻断|不会回退/);

  const exactScope = {
    edition: "第十六届",
    group: "本科组",
    region: "全国",
    track: "自主选题",
    stage: "校赛及企业命题赛",
  };
  const exact = await jsonRequest("/api/rules", {
    method: "POST",
    body: JSON.stringify(exactScope),
  });
  assert.equal(exact.response.status, 200);
  assert.equal(exact.body.match, "exact");
  assert.equal(exact.body.blocking, false);
  assert.equal(exact.body.rules.length, 10);
  assert.equal(exact.body.sources.length, 1);
  assert.equal(exact.body.rules.filter((rule) => rule.severity === "disqualifying").length, 2);
  assert.equal(exact.body.rules.find(rule => rule.id === "undergrad-report-anonymity").severity, "hard");
  assert.match(exact.body.rules.find(rule => rule.id === "undergrad-stage-format").rule, /省赛和国赛均分初审和决赛/);
  assert.ok(exact.body.rules.every((rule) => rule.source_id === "edition16-undergrad-practice"));
  assert.equal(exact.body.sources[0].sha256, "7bca601071854c06ca74a50ce7f1a20bd3208c735f662e51792aeb71fc054196");

  for (const override of [
    { edition: "第十五届" },
    { edition: "第十七届" },
    { group: "研究生组" },
    { stage: "全国总决赛" },
  ]) {
    const unmatched = await jsonRequest("/api/rules", {
      method: "POST",
      body: JSON.stringify({ ...exactScope, ...override }),
    });
    assert.equal(unmatched.response.status, 200);
    assert.equal(unmatched.body.match, "none");
    assert.equal(unmatched.body.blocking, true);
    assert.deepEqual(unmatched.body.rules, []);
    assert.match(unmatched.body.unknowns.join(" "), /不得用其他届次、组别或阶段/);
  }
});

test("isolates registry projects and fails closed without an agentctl executor", async () => {
  const keyA = "evx_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg";
  const keyB = "evx_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
  const headersA = { "x-client-key": keyA };

  const weakKey = await jsonRequest("/api/projects", {
    headers: { "x-client-key": "aaaaaaaaaaaaaaaa" },
  });
  assert.equal(weakKey.response.status, 400);
  assert.equal(weakKey.body.error.code, "invalid_client_key");

  const partialIdentity = await jsonRequest("/api/projects", {
    headers: { "oai-authenticated-user-id": "user-123" },
  });
  assert.equal(partialIdentity.response.status, 401);
  assert.equal(partialIdentity.body.error.code, "incomplete_authenticated_identity");

  const queryKey = await jsonRequest(`/api/projects?clientKey=${keyA}`);
  assert.equal(queryKey.response.status, 400);
  assert.equal(queryKey.body.error.code, "client_key_location_forbidden");

  const bodyKeyOnly = await jsonRequest("/api/projects", {
    method: "POST",
    body: JSON.stringify({ clientKey: keyA, title: "不应创建" }),
  });
  assert.equal(bodyKeyOnly.response.status, 400);
  assert.equal(bodyKeyOnly.body.error.code, "unexpected_fields");

  const forgedInitialState = await jsonRequest("/api/projects", {
    method: "POST",
    headers: headersA,
    body: JSON.stringify({
      title: "不应创建",
      stage: "closed",
      gateStatus: Object.fromEntries(GATE_NAMES.map((name) => [name, "pass"])),
    }),
  });
  assert.equal(forgedInitialState.response.status, 400);
  assert.equal(forgedInitialState.body.error.code, "unexpected_fields");

  const created = await jsonRequest("/api/projects", {
    method: "POST",
    headers: headersA,
    body: JSON.stringify({ title: "接口回归项目" }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.storage, "demo-memory");
  assert.equal(created.body.ownershipMode, "anonymous_key");
  assert.equal(created.body.project.controlStatus, "intake");
  assert.equal(created.body.project.competitionStage, "unknown");
  assert.equal(created.body.project.statusRevision, 0);
  assert.equal(created.body.project.authority, "web_registry");
  assert.equal(created.body.project.integrity, "current");
  assert.equal(created.body.project.stage, undefined);
  assert.deepEqual(Object.keys(created.body.project.gateStatus), GATE_NAMES);
  assert.ok(Object.values(created.body.project.gateStatus).every((value) => value === "not_run"));
  assert.equal(created.body.capabilities.advanceControlStatus, false);
  assert.doesNotMatch(JSON.stringify(created.body), new RegExp(keyA));
  const id = created.body.project.id;

  const ownList = await jsonRequest("/api/projects", { headers: headersA });
  assert.equal(ownList.response.status, 200);
  assert.ok(ownList.body.projects.some((project) => project.id === id));

  const otherList = await jsonRequest("/api/projects", {
    headers: { "x-client-key": keyB },
  });
  assert.equal(otherList.response.status, 200);
  assert.ok(otherList.body.projects.every((project) => project.id !== id));

  const blocked = await jsonRequest(`/api/projects/${id}`, {
    method: "PATCH",
    headers: headersA,
    body: JSON.stringify({
      stage: "rule_lock",
      gate: { name: "rule", status: "pass" },
    }),
  });
  assert.equal(blocked.response.status, 503);
  assert.equal(blocked.body.error.code, "control_plane_unavailable");

  const wrongOwner = await jsonRequest(`/api/projects/${id}`, {
    headers: { "x-client-key": keyB },
  });
  assert.equal(wrongOwner.response.status, 404);
  assert.equal(wrongOwner.body.error.code, "project_not_found");

  const detail = await jsonRequest(`/api/projects/${id}`, { headers: headersA });
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.project.id, id);
  assert.equal(detail.body.project.controlStatus, "intake");
  assert.ok(Object.values(detail.body.project.gateStatus).every((value) => value === "not_run"));
  assert.deepEqual(detail.body.events.map((event) => event.eventType), ["registry_project_created"]);

  const wrongOwnerPatch = await jsonRequest(`/api/projects/${id}`, {
    method: "PATCH",
    headers: { "x-client-key": keyB },
    body: JSON.stringify({ stage: "rule_lock" }),
  });
  assert.equal(wrongOwnerPatch.response.status, 404);
  assert.equal(wrongOwnerPatch.body.error.code, "project_not_found");
});

test("caps persistent project creation per owner", async () => {
  const key = "evx_quota000123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const headers = { "x-client-key": key };
  for (let index = 0; index < 20; index += 1) {
    const created = await jsonRequest("/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: `配额回归项目 ${index + 1}` }),
    });
    assert.equal(created.response.status, 201);
    assert.deepEqual(created.body.quota, { used: index + 1, limit: 20 });
  }
  const list = await jsonRequest("/api/projects", { headers });
  assert.equal(list.response.status, 200);
  assert.equal(list.body.projects.length, 20);
  const blocked = await jsonRequest("/api/projects", {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "第 21 个项目" }),
  });
  assert.equal(blocked.response.status, 429);
  assert.equal(blocked.body.error.code, "project_quota_exceeded");
  assert.equal(blocked.response.headers.get("retry-after"), "3600");
});

test("connects complete original reports, verified file identities, and bounded reading locations", async () => {
  const [platformSource, caseLibrarySource, reportCatalogRaw] = await Promise.all([
    readFile(new URL("../components/EviXPlatform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/cases/ReportCaseLibrary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../data/report-cases.json", import.meta.url), "utf8"),
  ]);
  assert.match(platformSource, /import CaseLibrary from ['"]@\/components\/cases\/ReportCaseLibrary['"]/);
  assert.match(platformSource, /cases:\s*<CaseLibrary\s*\/>/);
  assert.match(caseLibrarySource, /<CaseReportLibraryTools\s+reports=\{REPORT_CASES\}\s+onAvailabilityChange=\{setAvailableIds\}/);
  assert.match(caseLibrarySource, /<CaseReportCover\s+report=\{report\}\s+available=\{availableIds\.includes\(report\.id\)\}/);
  assert.match(caseLibrarySource, /<CaseReportReader\b[^>]*report=\{selected\}[^>]*initialPage=\{page\}[^>]*onPageChange=\{setPage\}/);
  assert.match(caseLibrarySource, /selected\.readingGuide\.map\(/);
  assert.match(caseLibrarySource, /onClick=\{\(\) => setPage\(entry\.page\)\}/);
  assert.match(caseLibrarySource, /filterReportCases\(\{ q: query, region, method \}\)/);
  assert.match(caseLibrarySource, /学校及奖项未独立核验/);
  assert.match(caseLibrarySource, /selected\.sourceCollection/);
  assert.match(caseLibrarySource, /selected\.sha256/);
  assert.match(caseLibrarySource, /createPortal\(/);
  assert.match(caseLibrarySource, /data-dialog-background/);
  assert.match(caseLibrarySource, /role="dialog" aria-modal="true" aria-labelledby="report-reading-title"/);
  const reportCatalog = JSON.parse(reportCatalogRaw);
  assert.ok(reportCatalog.cases.length > 0, 'the reading library needs complete original reports');
  assert.equal(new Set(reportCatalog.cases.map(report => report.id)).size, reportCatalog.cases.length);
  assert.equal(new Set(reportCatalog.cases.map(report => report.sha256)).size, reportCatalog.cases.length);
  for (const report of reportCatalog.cases) {
    assert.match(report.filename, /\.pdf$/i);
    assert.match(report.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(report.pages) && report.pages > 0);
    assert.ok(Number.isSafeInteger(report.bytes) && report.bytes > 0);
    assert.ok(report.sourceCollection.trim(), `${report.id}: original source is identified`);
    assert.ok(report.readingGuide.length > 0, `${report.id}: has reading locations`);
    for (const entry of report.readingGuide) assert.ok(Number.isSafeInteger(entry.page) && entry.page >= 1 && entry.page <= report.pages, `${report.id}: guide stays inside the original PDF`);
  }
  assert.ok(caseLibrarySource.includes('aria-label={`阅读原报告：${report.title}`}'));
});

test("keeps migration, local-read boundary, and visual assets auditable", async () => {
  const [migration, canonicalMigration, provenanceRaw, image, platformSource, recoverySource, projectsSource, capabilitiesSource, lifecycleSource, bridgeSource] = await Promise.all([
    readFile(new URL("../drizzle/0000_hot_quasimodo.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_overjoyed_robin_chapel.sql", import.meta.url), "utf8"),
    readFile(new URL("../data/asset-provenance.json", import.meta.url), "utf8"),
    readFile(new URL("../public/og.png", import.meta.url)),
    readFile(new URL("../components/EviXPlatform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/editors/EditorRecovery.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/hosted/HostedProjects.tsx", import.meta.url), "utf8"),
    readFile(new URL("../data/control-portal.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/LifecycleWarRoom.tsx", import.meta.url), "utf8"),
    readFile(new URL("../local-bridge/agentctl_read_bridge.py", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE [`"]projects[`"]/i);
  assert.match(migration, /CREATE TABLE [`"]project_events[`"]/i);
  assert.match(migration, /CREATE TABLE [`"]diagnoses[`"]/i);
  assert.doesNotMatch(migration, /respondent|phone|email|survey_raw/i);
  assert.doesNotMatch(canonicalMigration, /DROP TABLE|__new_projects|ALTER TABLE [`"]projects[`"] RENAME/i);
  assert.match(canonicalMigration, /legacy_stage/);
  assert.match(canonicalMigration, /legacy_gate_status/);
  assert.match(canonicalMigration, /legacy_unverified/);
  assert.match(canonicalMigration, /needs_revalidation/);
  assert.match(canonicalMigration, /legacy_web_v1_migrated_to_canonical_v1/);
  // Recovery credentials and project selection now live in their dedicated views.
  assert.match(recoverySource, /aria-label="编辑文件访问恢复" aria-busy=\{Boolean\(busy\)\}/);
  assert.match(recoverySource, /candidate\.state === "saved" \? "已登记，请保管备份" : "仅保留在本页内存"/);
  assert.match(recoverySource, /type=\{visible \? "text" : "password"\} value=\{candidate\.key\} readOnly autoComplete="off"/);
  assert.match(recoverySource, /onClick=\{\(\) => void copyKey\(\)\}>复制密钥/);
  assert.match(recoverySource, /navigator\.clipboard\.writeText\(value\.key\)/);
  assert.match(projectsSource, /<LoginRequired><ProjectList\s*\/><\/LoginRequired>/);
  assert.ok(projectsSource.includes('href={`/projects/${p.id}`}'));
  assert.match(projectsSource, /aria-busy=\{loading\}/);
  assert.match(platformSource, /href="\/projects"/);
  for (const capability of ["evaluateGate", "advanceControlStatus", "handoff", "executorConnected"]) {
    assert.match(capabilitiesSource, new RegExp(`${capability}: false`));
  }
  assert.match(capabilitiesSource, /reason: "control_plane_unavailable"/);
  assert.match(lifecycleSource, /pageAccess !== "allowed" \|\| !isAllowedPageHost\(\)/);
  assert.match(lifecycleSource, /<GateGrid gates=\{portalGateList\}/);
  assert.match(lifecycleSource, /<GateGrid gates=\{snapshot\.status\.gates\}/);
  assert.match(lifecycleSource, /gate\.status === "pass"/);
  assert.match(lifecycleSource, /gate\.status === "warning"/);
  assert.match(lifecycleSource, /GATE_STATUS_LABELS\[gate\.status\]/);
  assert.ok(platformSource.includes("aria-busy={submitting}"));
  assert.doesNotMatch(platformSource, /\["takeaways", "lessons", "insights", "highlights", "tags"\]/);
  assert.match(lifecycleSource, /http:\/\/127\.0\.0\.1:8765/);
  assert.match(lifecycleSource, /Authorization: `Bearer \$\{token\}`/);
  assert.match(lifecycleSource, /credentials: "omit"/);
  assert.match(lifecycleSource, /门户登记态｜不是进度凭证/);
  assert.match(lifecycleSource, /本地权威态｜只读/);
  assert.match(lifecycleSource, /snapshotStale/);
  assert.match(lifecycleSource, /stale:\s*snapshotStale/);
  assert.match(lifecycleSource, /SNAPSHOT_TIMEOUT_MS = 90_000/);
  assert.match(bridgeSource, /MAX_SNAPSHOT_WALL_SECONDS = 75\.0/);
  assert.match(lifecycleSource, /是否允许推进仍由本机完整校验决定/);
  assert.doesNotMatch(lifecycleSource, /前置条件显示已就绪/);
  assert.match(lifecycleSource, /presentation\.showMaterials/);
  assert.match(lifecycleSource, /presentation\.showParallelWork/);
  assert.match(lifecycleSource, /CONTROL_CONTRACT_META\.workflowSha256/);
  assert.doesNotMatch(lifecycleSource, /localStorage|sessionStorage|document\.cookie/);
  assert.doesNotMatch(lifecycleSource, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);

  const provenance = JSON.parse(provenanceRaw);
  const socialAsset = provenance.assets.find((asset) => asset.path === "public/og.png");
  assert.ok(socialAsset);
  assert.equal(image.readUInt32BE(16), 1672);
  assert.equal(image.readUInt32BE(20), 941);
  assert.equal(createHash("sha256").update(image).digest("hex"), socialAsset.sha256);
});
