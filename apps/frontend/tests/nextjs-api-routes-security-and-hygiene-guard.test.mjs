import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import * as httpHelper from '../app/api/_lib/http.ts';
import * as competitionUpdateMod from '../data/competition-update.ts';
import * as controlContractMod from '../data/control-plane-contract.generated.ts';
import * as controlPortalMod from '../data/control-portal.ts';
import * as ruleCorpusMod from '../data/rule-corpus.generated.ts';
import { fullReportInputRevision } from '../lib/agent/full-report-request.ts';
import * as fullReportServerMod from '../lib/agent/full-report-server.ts';
import * as imageGenEngineMod from '../lib/agent/image-gen-engine.ts';
import * as toolsSchemaMod from '../lib/agent/tools-schema.ts';
import { createEditorContent } from '../lib/editor-model.ts';
import * as knowledgePubMod from '../lib/knowledge/publication.ts';
import * as knowledgeTypesMod from '../lib/knowledge/types.ts';
import * as diagnosisHelper from '../lib/project-diagnosis.ts';
import { newQuestionnaire } from '../lib/questionnaire.ts';
import * as caseCatalogMod from '../lib/report-case-catalog.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const knowledgePublishedJson = require('../content/knowledge/published.json');

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = path.join(FRONTEND_ROOT, 'app');

/**
 * Canonical 11/11 Next.js App Router Route Handlers (`CI-FE-16`).
 */
const CANONICAL_ROUTE_HANDLERS = Object.freeze([
  'app/api/agent/autonomous/route.ts',
  'app/api/agent/brain/route.ts',
  'app/api/agent/full-report/route.ts',
  'app/api/agent/image-gen/route.ts',
  'app/api/cases/[id]/route.ts',
  'app/api/cases/route.ts',
  'app/api/control-contract/route.ts',
  'app/api/diagnose/route.ts',
  'app/api/rules/route.ts',
  'app/knowledge-data/catalog.json/route.ts',
  'app/knowledge-data/entries/[entryId]/[version]/route.ts',
]);

const FORBIDDEN_BRACKETS_RE = /[\u3010\u3011\u300c\u300d\u300e\u300f]/u;
const FORBIDDEN_JARGON_RE = /\b(?:BYOK|ReAct|EpistemicGraph)\b/iu;
const STACK_TRACE_RE = /(?:at\s+[A-Za-z0-9_$.]+\s+\(|Traceback\s*\(most recent call last\)|node:internal\/)/u;

const LOCAL_ORIGIN = 'http://127.0.0.1:3180';
const LOCAL_HOST = '127.0.0.1:3180';

const OFFLINE_PROD_ENV = Object.freeze({
  NODE_ENV: 'production',
  EVIX_ENABLE_LOCAL_MODEL_GATEWAY: '0',
  EVIX_LOCAL_MODEL_GATEWAY_ORIGIN: '',
  OPENAI_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  GEMINI_API_KEY: '',
  GOOGLE_API_KEY: '',
  DASHSCOPE_API_KEY: '',
  QWEN_API_KEY: '',
  IMAGE_GEN_API_KEY: '',
  EVIX_ENABLE_LIVE_SCHOLAR_API: '0',
});

const OFFLINE_LOCAL_DEV_ENV = Object.freeze({
  ...OFFLINE_PROD_ENV,
  NODE_ENV: 'development',
  EVIX_ENABLE_LOCAL_MODEL_GATEWAY: '1',
  EVIX_LOCAL_MODEL_GATEWAY_ORIGIN: LOCAL_ORIGIN,
});

function discoverRouteHandlers(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...discoverRouteHandlers(full));
    } else if (/^route\.(?:ts|tsx|js|mjs)$/u.test(entry.name)) {
      found.push(path.relative(FRONTEND_ROOT, full).replace(/\\/gu, '/'));
    }
  }
  return found.sort();
}

function compileRouteModule(relPath, { env = OFFLINE_PROD_ENV, imports = {}, fetchImpl, cwd = FRONTEND_ROOT } = {}) {
  const absPath = path.join(FRONTEND_ROOT, relPath);
  const source = fs.readFileSync(absPath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: absPath,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  });

  const moduleObj = { exports: {} };
  const nextServerStub = {
    NextResponse: {
      json(body, init = {}) {
        return Response.json(body, init);
      },
    },
  };
  const isolatedFs = {
    ...fs,
    existsSync(target) {
      const normalized = String(target).replace(/\\/gu, '/');
      if (normalized.endsWith('/openai.key')) return false;
      return fs.existsSync(target);
    },
  };

  const sandboxRequire = (specifier) => {
    if (Object.hasOwn(imports, specifier)) return imports[specifier];
    if (specifier === 'next/server') return nextServerStub;
    if (specifier === 'node:fs' || specifier === 'fs') return isolatedFs;
    if (specifier === 'node:path' || specifier === 'path') return path;
    if (specifier === 'node:string_decoder' || specifier === 'string_decoder') return { StringDecoder };
    throw new Error(`Unexpected module require in ${relPath}: ${specifier}`);
  };

  const sandboxProcess = {
    env: { ...env },
    platform: process.platform,
    cwd: () => cwd,
  };

  vm.runInNewContext(
    outputText,
    {
      exports: moduleObj.exports,
      module: moduleObj,
      require: sandboxRequire,
      process: sandboxProcess,
      fetch: fetchImpl ?? (async () => {
        throw new Error('Unexpected outbound fetch call in route test');
      }),
      URL,
      Request,
      Response,
      Headers,
      AbortController,
      AbortSignal,
      ReadableStream,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      Buffer,
      Error,
      TypeError,
      RangeError,
      crypto,
      setTimeout,
      clearTimeout,
    },
    { filename: relPath },
  );
  return moduleObj.exports;
}

function compileLocalGatewayPolicy(env) {
  return compileRouteModule('lib/agent/local-gateway-policy.ts', { env });
}

function makeLocalGatewayRequest(pathname, { method = 'POST', body, rawBody, headers = {}, origin = LOCAL_ORIGIN, host = LOCAL_HOST } = {}) {
  const initHeaders = new Headers(headers);
  if (origin !== null) initHeaders.set('origin', origin);
  if (host !== null) initHeaders.set('host', host);
  if (method === 'GET' && !headers.origin) {
    initHeaders.delete('origin');
    initHeaders.set('sec-fetch-site', 'same-origin');
    initHeaders.set('referer', `${LOCAL_ORIGIN}/agent`);
  }
  if (rawBody !== undefined) {
    if (!initHeaders.has('content-type')) initHeaders.set('content-type', 'application/json');
    return new Request(`${LOCAL_ORIGIN}${pathname}`, { method, headers: initHeaders, body: rawBody });
  }
  if (body !== undefined) {
    if (!initHeaders.has('content-type')) initHeaders.set('content-type', 'application/json');
    return new Request(`${LOCAL_ORIGIN}${pathname}`, { method, headers: initHeaders, body: JSON.stringify(body) });
  }
  return new Request(`${LOCAL_ORIGIN}${pathname}`, { method, headers: initHeaders });
}

function assertCleanResponseText(rawText, contextLabel, secretCanaries = []) {
  assert.doesNotMatch(rawText, FORBIDDEN_BRACKETS_RE, `${contextLabel}: must contain zero forbidden CJK brackets`);
  assert.doesNotMatch(rawText, FORBIDDEN_JARGON_RE, `${contextLabel}: must contain zero internal jargon (BYOK/ReAct/EpistemicGraph)`);
  assert.doesNotMatch(rawText, STACK_TRACE_RE, `${contextLabel}: must never echo Error.stack or internal frames`);
  for (const canary of secretCanaries) {
    assert.equal(rawText.includes(canary), false, `${contextLabel}: must never echo secret canary`);
  }
}

test('11/11 Next.js App Router route handler census & static AST hygiene guard (zero stack echo, zero brackets, zero BYOK)', () => {
  const discovered = discoverRouteHandlers(APP_DIR);
  assert.equal(discovered.length, 11);
  assert.deepEqual(discovered, [...CANONICAL_ROUTE_HANDLERS]);

  const filesToAudit = [
    ...CANONICAL_ROUTE_HANDLERS,
    'app/api/_lib/http.ts',
    'app/api/_lib/diagnosis.ts',
  ];

  const stackReads = [];
  const literalViolations = [];

  for (const relPath of filesToAudit) {
    const src = fs.readFileSync(path.join(FRONTEND_ROOT, relPath), 'utf8');
    const sf = ts.createSourceFile(relPath, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    const visit = (node) => {
      if (ts.isPropertyAccessExpression(node) && node.name.text === 'stack') {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        stackReads.push(`${relPath}:${line}`);
      }
      if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const val = node.text;
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        if (FORBIDDEN_BRACKETS_RE.test(val)) {
          literalViolations.push(`${relPath}:${line} forbidden bracket in literal`);
        }
        if (FORBIDDEN_JARGON_RE.test(val)) {
          literalViolations.push(`${relPath}:${line} forbidden jargon in literal`);
        }
      }
      if (ts.isTemplateExpression(node)) {
        const chunks = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join('');
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        if (FORBIDDEN_BRACKETS_RE.test(chunks)) {
          literalViolations.push(`${relPath}:${line} forbidden bracket in template`);
        }
        if (FORBIDDEN_JARGON_RE.test(chunks)) {
          literalViolations.push(`${relPath}:${line} forbidden jargon in template`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  assert.deepEqual(stackReads, []);
  assert.deepEqual(literalViolations, []);

  for (const agentRoute of [
    'app/api/agent/autonomous/route.ts',
    'app/api/agent/brain/route.ts',
    'app/api/agent/full-report/route.ts',
    'app/api/agent/image-gen/route.ts',
  ]) {
    const src = fs.readFileSync(path.join(FRONTEND_ROOT, agentRoute), 'utf8');
    assert.match(src, /export\s+const\s+runtime\s*=\s*['"]nodejs['"]/u, `${agentRoute} must pin nodejs runtime`);
  }
});

test('app/api/cases/route.ts & app/api/cases/[id]/route.ts reject path traversal, invalid slugs, oversized filters, and mask unexpected errors', async () => {
  const sharedImports = {
    '@/lib/report-case-catalog': caseCatalogMod,
    '../_lib/http': httpHelper,
    '../../_lib/http': httpHelper,
  };
  const casesListRoute = compileRouteModule('app/api/cases/route.ts', { imports: sharedImports });
  const caseDetailRoute = compileRouteModule('app/api/cases/[id]/route.ts', { imports: sharedImports });

  const listOk = await casesListRoute.GET(new Request('https://example.test/api/cases?q=' + encodeURIComponent('养老')));
  assert.equal(listOk.status, 200);
  const listRaw = await listOk.text();
  assertCleanResponseText(listRaw, 'cases GET 200');
  const listJson = JSON.parse(listRaw);
  assert.ok(Array.isArray(listJson.cases));

  for (const badQuery of [
    '?verification=official',
    '?q=' + '甲'.repeat(81),
    '?region=' + '乙'.repeat(49),
    '?topic=' + '丙'.repeat(49),
  ]) {
    const res = await casesListRoute.GET(new Request(`https://example.test/api/cases${badQuery}`));
    assert.equal(res.status, 400, `Expected 400 for ${badQuery}`);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/u);
    assertCleanResponseText(await res.text(), `cases GET ${badQuery}`);
  }

  const traversalAndInvalidSlugs = [
    '../secret',
    '../../etc/passwd',
    '..%2f..%2fsecret',
    '..\\windows\\win.ini',
    '/etc/passwd',
    'case/nested',
    'UPPERCASE-CASE',
    'ab',
    'a'.repeat(129),
    '-leading-hyphen',
    'case_underscore',
    'case.dot',
    'case\u0000null',
    'case space',
    '',
    '__proto__',
  ];

  for (const badId of traversalAndInvalidSlugs) {
    const res = await caseDetailRoute.GET(
      new Request('https://example.test/api/cases/item'),
      { params: Promise.resolve({ id: badId }) },
    );
    assert.equal(res.status, 400, `Expected 400 for slug "${badId}"`);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/u);
    const text = await res.text();
    assertCleanResponseText(text, `cases/[id] ${badId}`);
    assert.equal(JSON.parse(text).error.code, 'invalid_case_id');
  }

  const missingRes = await caseDetailRoute.GET(
    new Request('https://example.test/api/cases/missing-valid-slug-2026'),
    { params: Promise.resolve({ id: 'missing-valid-slug-2026' }) },
  );
  assert.equal(missingRes.status, 404);
  const missingText = await missingRes.text();
  assertCleanResponseText(missingText, 'cases/[id] 404');
  assert.equal(JSON.parse(missingText).error.code, 'case_not_found');

  const firstCase = caseCatalogMod.REPORT_CASES[0];
  const validDetail = await caseDetailRoute.GET(
    new Request(`https://example.test/api/cases/${firstCase.id}`),
    { params: Promise.resolve({ id: firstCase.id }) },
  );
  assert.equal(validDetail.status, 200);
  const validDetailText = await validDetail.text();
  assertCleanResponseText(validDetailText, 'cases/[id] 200');
  assert.equal(JSON.parse(validDetailText).case.id, firstCase.id);

  const crashedParams = Promise.reject(Object.assign(new Error('SQLITE_CANTOPEN /var/private/db.sqlite sk-secret-999'), {
    stack: 'Error: SQLITE_CANTOPEN /var/private/db.sqlite\n    at Object.open (/srv/internal/db.ts:12:4)',
  }));
  crashedParams.catch(() => undefined);
  const masked500 = await caseDetailRoute.GET(new Request('https://example.test/api/cases/crash'), { params: crashedParams });
  assert.equal(masked500.status, 500);
  const maskedText = await masked500.text();
  assertCleanResponseText(maskedText, 'cases/[id] masked 500', ['sk-secret-999', 'SQLITE_CANTOPEN', '/var/private']);
  assert.deepEqual(JSON.parse(maskedText), {
    error: { code: 'internal_error', message: '服务暂时不可用，请稍后重试。' },
  });
});

test('app/knowledge-data/catalog.json & entries/[entryId]/[version] enforce strict slug/version bounds, nosniff, and path-traversal rejection', async () => {
  const knowledgeImports = {
    '@/content/knowledge/published.json': knowledgePublishedJson,
    '@/lib/knowledge/publication': knowledgePubMod,
    '@/lib/knowledge/types': knowledgeTypesMod,
  };
  const catalogRoute = compileRouteModule('app/knowledge-data/catalog.json/route.ts', { imports: knowledgeImports });
  const entryRoute = compileRouteModule('app/knowledge-data/entries/[entryId]/[version]/route.ts', { imports: knowledgeImports });

  const catRes = await catalogRoute.GET();
  assert.equal(catRes.status, 200);
  assert.equal(catRes.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(catRes.headers.get('Cache-Control') ?? '', /max-age=300/u);
  const catText = await catRes.text();
  assertCleanResponseText(catText, 'knowledge catalog GET');
  const catBody = JSON.parse(catText);
  assert.equal(catBody.schemaVersion, 1);
  assert.ok(Array.isArray(catBody.entries) && catBody.entries.length > 0);

  const sampleEntry = catBody.entries[0];
  const badEntryPairs = [
    ['../published.json', '1'],
    ['../../etc/passwd', '1'],
    ['..%2fpublished', '1'],
    ['stats/../../secret', '1'],
    ['stats\\secret', '1'],
    ['UpperCaseEntry', '1'],
    ['-leading-dash', '1'],
    ['entry\u0000null', '1'],
    ['', '1'],
    ['a'.repeat(97), '1'],
    [sampleEntry.id, '0'],
    [sampleEntry.id, '-1'],
    [sampleEntry.id, '01'],
    [sampleEntry.id, '1.5'],
    [sampleEntry.id, '../1'],
    [sampleEntry.id, '2147483648'],
    [sampleEntry.id, '99999999999'],
    [sampleEntry.id, 'NaN'],
    [sampleEntry.id, 'v1'],
    [sampleEntry.id, ''],
  ];

  for (const [entryId, version] of badEntryPairs) {
    const res = await entryRoute.GET(
      new Request('https://example.test/knowledge-data/entries/x/1'),
      { params: Promise.resolve({ entryId, version }) },
    );
    assert.equal(res.status, 404, `Expected 404 for entryId="${entryId}" version="${version}"`);
    const bodyText = await res.text();
    assertCleanResponseText(bodyText, `knowledge entry ${entryId}@${version}`);
    assert.deepEqual(JSON.parse(bodyText), { code: 'knowledge_version_unavailable' });
  }

  const missingVerRes = await entryRoute.GET(
    new Request(`https://example.test/knowledge-data/entries/${sampleEntry.id}/999999`),
    { params: Promise.resolve({ entryId: sampleEntry.id, version: '999999' }) },
  );
  assert.equal(missingVerRes.status, 404);
  assert.equal(missingVerRes.headers.get('Cache-Control'), 'no-store');

  const hitRes = await entryRoute.GET(
    new Request(`https://example.test/knowledge-data/entries/${sampleEntry.id}/${sampleEntry.version}`),
    { params: Promise.resolve({ entryId: sampleEntry.id, version: String(sampleEntry.version) }) },
  );
  assert.equal(hitRes.status, 200);
  assert.equal(hitRes.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(hitRes.headers.get('Cache-Control') ?? '', /immutable/u);
  const hitText = await hitRes.text();
  assertCleanResponseText(hitText, 'knowledge entry 200');
  assert.equal(JSON.parse(hitText).id, sampleEntry.id);
});

test('app/api/control-contract, app/api/diagnose & app/api/rules enforce strict JSON media type, byte caps, schema allowlists, and pure Chinese hygiene', async () => {
  const contractRoute = compileRouteModule('app/api/control-contract/route.ts', {
    imports: {
      '@/data/control-plane-contract.generated': controlContractMod,
      '@/data/control-portal': controlPortalMod,
      '../_lib/http': httpHelper,
    },
  });
  const diagnoseRoute = compileRouteModule('app/api/diagnose/route.ts', {
    imports: {
      '@/data/control-plane-contract.generated': controlContractMod,
      '../_lib/diagnosis': diagnosisHelper,
      '../_lib/http': httpHelper,
    },
  });
  const rulesRoute = compileRouteModule('app/api/rules/route.ts', {
    imports: {
      '@/data/rule-corpus.generated': ruleCorpusMod,
      '@/data/competition-update': competitionUpdateMod,
      '../_lib/http': httpHelper,
    },
  });

  const contractRes = await contractRoute.GET();
  assert.equal(contractRes.status, 200);
  assert.match(contractRes.headers.get('cache-control') ?? '', /no-store/u);
  const contractText = await contractRes.text();
  assertCleanResponseText(contractText, 'control-contract GET');
  assert.deepEqual(JSON.parse(contractText).stages, controlContractMod.PROJECT_STAGES);

  // Diagnose route checks: 415 wrong media type, 400 malformed/array/bad-utf8, 413 > 8192 bytes, 400 unexpected key, 200 clean
  const wrongMedia = await diagnoseRoute.POST(new Request('https://example.test/api/diagnose', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: '{}',
  }));
  assert.equal(wrongMedia.status, 415);
  assertCleanResponseText(await wrongMedia.text(), 'diagnose 415');

  for (const rawPayload of ['{malformed', '[]', '"string"', Uint8Array.of(0xff, 0xfe)]) {
    const res = await diagnoseRoute.POST(new Request('https://example.test/api/diagnose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: rawPayload,
    }));
    assert.equal(res.status, 400);
    assertCleanResponseText(await res.text(), 'diagnose 400 malformed');
  }

  const streamOversizedBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"problem":"' + '甲'.repeat(3500) + '"}'));
      controller.close();
    },
  });
  const diagnose413 = await diagnoseRoute.POST(new Request('https://example.test/api/diagnose', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: streamOversizedBody,
    duplex: 'half',
  }));
  assert.equal(diagnose413.status, 413);
  const d413Text = await diagnose413.text();
  assertCleanResponseText(d413Text, 'diagnose 413');
  assert.equal(JSON.parse(d413Text).error.code, 'payload_too_large');

  const validDiagnosePayload = {
    title: '社区长者助餐服务可持续运营调查',
    problem: '评估社区老年助餐点的定价承受度、配送半径与财政补贴效率，识别复购流失环节。',
    decisionOwner: '街道民生服务办与社区助餐运营方',
    population: '辖区 60 岁及以上常住老年人及家属',
    geography: '杭州市上城区六个样本街道',
    stage: controlContractMod.PROJECT_STAGES[0],
    evidenceStatus: diagnosisHelper.EVIDENCE_STATUSES[0],
  };

  const extraKeyRes = await diagnoseRoute.POST(new Request('https://example.test/api/diagnose', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...validDiagnosePayload, apiKey: 'sk-unexpected-123' }),
  }));
  assert.equal(extraKeyRes.status, 400);
  const extraKeyText = await extraKeyRes.text();
  assertCleanResponseText(extraKeyText, 'diagnose unexpected key', ['sk-unexpected-123']);
  assert.equal(JSON.parse(extraKeyText).error.code, 'unexpected_fields');

  const diagnoseOk = await diagnoseRoute.POST(new Request('https://example.test/api/diagnose', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validDiagnosePayload),
  }));
  assert.equal(diagnoseOk.status, 200);
  assert.match(diagnoseOk.headers.get('cache-control') ?? '', /no-store/u);
  const diagnoseOkText = await diagnoseOk.text();
  assertCleanResponseText(diagnoseOkText, 'diagnose 200');
  assert.equal(JSON.parse(diagnoseOkText).persistence, 'not_persisted');

  // Rules GET + POST bounds (4,096 byte limit, unmatched blocking, exact match)
  const rulesGetRes = await rulesRoute.GET();
  assert.equal(rulesGetRes.status, 200);
  const rulesGetText = await rulesGetRes.text();
  assertCleanResponseText(rulesGetText, 'rules GET');

  const rules413 = await rulesRoute.POST(new Request('https://example.test/api/rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '5000' },
    body: '{}',
  }));
  assert.equal(rules413.status, 413);
  assertCleanResponseText(await rules413.text(), 'rules 413');

  const rulesNoMatch = await rulesRoute.POST(new Request('https://example.test/api/rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      edition: '未收录届次-2099',
      group: '本科生组',
      region: '全国',
      track: '市场调查',
      stage: '总决赛',
    }),
  }));
  assert.equal(rulesNoMatch.status, 200);
  const noMatchText = await rulesNoMatch.text();
  assertCleanResponseText(noMatchText, 'rules POST none');
  const noMatchBody = JSON.parse(noMatchText);
  assert.equal(noMatchBody.match, 'none');
  assert.equal(noMatchBody.blocking, true);

  const firstScope = ruleCorpusMod.RULE_SCOPES[0];
  const pickDim = (sel, fallback) => (sel.mode === 'all' ? fallback : sel.values[0]);
  const rulesExact = await rulesRoute.POST(new Request('https://example.test/api/rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      edition: pickDim(firstScope.edition, '第十六届'),
      group: pickDim(firstScope.group, '本科生组'),
      region: pickDim(firstScope.region, '全国'),
      track: pickDim(firstScope.track, '常规赛道'),
      stage: pickDim(firstScope.stage, '国赛'),
    }),
  }));
  assert.equal(rulesExact.status, 200);
  const exactText = await rulesExact.text();
  assertCleanResponseText(exactText, 'rules POST exact');
  assert.equal(JSON.parse(exactText).match, 'exact');
});

test("offline zero-key behavior when OPENAI_API_KEY='' across brain, image-gen, and autonomous routes makes zero outbound calls", async () => {
  let fetchCalls = 0;
  let spawnCalls = 0;
  const countingFetch = async () => {
    fetchCalls += 1;
    throw new Error('Outbound fetch must never be called when OPENAI_API_KEY is empty');
  };
  const countingSpawn = () => {
    spawnCalls += 1;
    throw new Error('Python CLI must never spawn when local gateway is disabled');
  };

  // 1. Production mode (all keys empty)
  const prodPolicy = compileLocalGatewayPolicy(OFFLINE_PROD_ENV);
  const prodBrain = compileRouteModule('app/api/agent/brain/route.ts', {
    env: OFFLINE_PROD_ENV,
    fetchImpl: countingFetch,
    imports: {
      '@/lib/agent/local-gateway-policy': prodPolicy,
      '@/lib/agent/tools-schema': toolsSchemaMod,
    },
  });
  const prodImage = compileRouteModule('app/api/agent/image-gen/route.ts', {
    env: OFFLINE_PROD_ENV,
    fetchImpl: countingFetch,
    imports: {
      '@/lib/agent/local-gateway-policy': prodPolicy,
      '@/lib/agent/image-gen-engine': imageGenEngineMod,
    },
  });
  const prodAuto = compileRouteModule('app/api/agent/autonomous/route.ts', {
    env: OFFLINE_PROD_ENV,
    fetchImpl: countingFetch,
    imports: {
      'node:child_process': { spawn: countingSpawn },
      '@/lib/agent/local-gateway-policy': prodPolicy,
    },
  });

  const brainGetProd = await prodBrain.GET(makeLocalGatewayRequest('/api/agent/brain', { method: 'GET' }));
  assert.equal(brainGetProd.status, 200);
  const brainGetProdText = await brainGetProd.text();
  assertCleanResponseText(brainGetProdText, 'brain GET offline prod');
  assert.equal(JSON.parse(brainGetProdText).available, false);
  assert.equal(JSON.parse(brainGetProdText).source, 'offline');

  const brainPostProd = await prodBrain.POST(makeLocalGatewayRequest('/api/agent/brain', {
    body: { message: '测试问题', context: {}, custom: { apiKey: 'sk-ignored-in-prod-123' } },
  }));
  assert.equal(brainPostProd.status, 503);
  assertCleanResponseText(await brainPostProd.text(), 'brain POST offline prod', ['sk-ignored-in-prod-123']);

  const imageGetProd = await prodImage.GET(makeLocalGatewayRequest('/api/agent/image-gen', { method: 'GET' }));
  assert.equal(imageGetProd.status, 200);
  assert.deepEqual(await imageGetProd.json(), {
    providers: { gemini: false, imagen: false, openai_compatible: false },
  });

  const imagePostProd = await prodImage.POST(makeLocalGatewayRequest('/api/agent/image-gen', {
    body: { prompt: '社区养老调查研究封面' },
  }));
  assert.equal(imagePostProd.status, 200);
  const imagePostProdText = await imagePostProd.text();
  assertCleanResponseText(imagePostProdText, 'image-gen POST offline prod');
  assert.equal(JSON.parse(imagePostProdText).mode, 'data_bound_composite');

  const autoPostProd = await prodAuto.POST(makeLocalGatewayRequest('/api/agent/autonomous', {
    body: { goal: '检验满意度影响因素' },
  }));
  assert.equal(autoPostProd.status, 503);
  assertCleanResponseText(await autoPostProd.text(), 'autonomous POST offline prod');

  // 2. Local development gateway enabled, but OPENAI_API_KEY='' / DEEPSEEK_API_KEY='' / GEMINI_API_KEY=''
  const devPolicy = compileLocalGatewayPolicy(OFFLINE_LOCAL_DEV_ENV);
  const devBrain = compileRouteModule('app/api/agent/brain/route.ts', {
    env: OFFLINE_LOCAL_DEV_ENV,
    fetchImpl: countingFetch,
    imports: {
      '@/lib/agent/local-gateway-policy': devPolicy,
      '@/lib/agent/tools-schema': toolsSchemaMod,
    },
  });
  const devImage = compileRouteModule('app/api/agent/image-gen/route.ts', {
    env: OFFLINE_LOCAL_DEV_ENV,
    fetchImpl: countingFetch,
    imports: {
      '@/lib/agent/local-gateway-policy': devPolicy,
      '@/lib/agent/image-gen-engine': imageGenEngineMod,
    },
  });

  const devBrainGet = await devBrain.GET(makeLocalGatewayRequest('/api/agent/brain', { method: 'GET' }));
  assert.equal((await devBrainGet.json()).available, false);

  const devBrainPost = await devBrain.POST(makeLocalGatewayRequest('/api/agent/brain', {
    body: { message: '请帮我核查样本量公式', context: { stage: 'design' } },
  }));
  assert.equal(devBrainPost.status, 503);
  const devBrainPostText = await devBrainPost.text();
  assertCleanResponseText(devBrainPostText, 'brain POST local dev empty key');
  assert.equal(JSON.parse(devBrainPostText).code, 'offline');

  const devImageGet = await devImage.GET(makeLocalGatewayRequest('/api/agent/image-gen', { method: 'GET' }));
  assert.deepEqual(await devImageGet.json(), {
    providers: { gemini: false, imagen: false, openai_compatible: false },
  });

  const devImageComposite = await devImage.POST(makeLocalGatewayRequest('/api/agent/image-gen', {
    body: { prompt: '问卷分析流程示意图' },
  }));
  assert.equal(devImageComposite.status, 200);
  const devImageCompBody = await devImageComposite.json();
  assert.equal(devImageCompBody.mode, 'data_bound_composite');
  assertCleanResponseText(JSON.stringify(devImageCompBody), 'image-gen dev composite');

  const devImageStrict = await devImage.POST(makeLocalGatewayRequest('/api/agent/image-gen', {
    body: { prompt: '问卷分析流程示意图', allowDeterministicFallback: false },
  }));
  assert.equal(devImageStrict.status, 503);
  const devImageStrictText = await devImageStrict.text();
  assertCleanResponseText(devImageStrictText, 'image-gen dev strict 503');
  assert.equal(JSON.parse(devImageStrictText).code, 'image_provider_not_configured');

  assert.equal(fetchCalls, 0);
  assert.equal(spawnCalls, 0);
});

test('app/api/agent/brain/route.ts enforces 120KB body cap, validation limits, secret-echo scrubbing, and zero stack leak', async () => {
  const SECRET_CANARY = 'sk-brain-secret-canary-884422';
  const env = {
    ...OFFLINE_LOCAL_DEV_ENV,
    DEEPSEEK_API_KEY: SECRET_CANARY,
  };
  const policy = compileLocalGatewayPolicy(env);

  let upstreamBehavior = async () => Response.json({ choices: [{ message: { content: '正常回复' } }] });
  let upstreamCalls = 0;
  const brain = compileRouteModule('app/api/agent/brain/route.ts', {
    env,
    fetchImpl: async (url, init) => {
      upstreamCalls += 1;
      return upstreamBehavior(url, init);
    },
    imports: {
      '@/lib/agent/local-gateway-policy': policy,
      '@/lib/agent/tools-schema': toolsSchemaMod,
    },
  });

  // Malformed, array, and >120,000 byte bodies -> 400 with 0 upstream calls
  for (const badRaw of ['{bad-json', '[1,2,3]', '', '{"pad":"' + 'a'.repeat(120_500) + '"}']) {
    const res = await brain.POST(makeLocalGatewayRequest('/api/agent/brain', { rawBody: badRaw }));
    assert.equal(res.status, 400);
    assertCleanResponseText(await res.text(), 'brain 400 invalid/oversized json', [SECRET_CANARY]);
  }

  // Message, step, and context validation -> 422 with 0 upstream calls
  for (const invalidBody of [
    { message: '   ', context: {} },
    { message: '字'.repeat(2401), context: {} },
    { message: '核验抽样方案', step: 0, context: {} },
    { message: '核验抽样方案', step: 7, context: {} },
    { message: '核验抽样方案', context: null },
    { message: '核验抽样方案', context: ['array'] },
    { message: '核验抽样方案', context: { huge: 'x'.repeat(20_100) } },
  ]) {
    const res = await brain.POST(makeLocalGatewayRequest('/api/agent/brain', { body: invalidBody }));
    assert.equal(res.status, 422);
    assertCleanResponseText(await res.text(), 'brain 422 validation', [SECRET_CANARY]);
  }

  // Secret canary pasted into message, history, context, or tool trace -> 422 sensitive_input, 0 upstream calls
  for (const leakedPayload of [
    { message: `请检查配置 ${SECRET_CANARY}`, context: {} },
    { message: '继续分析', history: [{ role: 'user', text: SECRET_CANARY }], context: {} },
    { message: '继续分析', context: { leaked: SECRET_CANARY } },
    { message: '继续分析', context: {}, steps: [{ toolOutputs: [{ tool: 'light', text: SECRET_CANARY }] }] },
  ]) {
    const res = await brain.POST(makeLocalGatewayRequest('/api/agent/brain', { body: leakedPayload }));
    assert.equal(res.status, 422);
    const text = await res.text();
    assertCleanResponseText(text, 'brain 422 sensitive_input', [SECRET_CANARY]);
    assert.equal(JSON.parse(text).code, 'sensitive_input');
  }
  assert.equal(upstreamCalls, 0);

  // Upstream 401 echoing raw API key -> scrubbed, 502 authentication_failed
  upstreamBehavior = async () => Response.json(
    { error: { message: `Invalid token ${SECRET_CANARY} rejected` } },
    { status: 401 },
  );
  const authFailRes = await brain.POST(makeLocalGatewayRequest('/api/agent/brain', {
    body: { message: '检查样本代表性', context: { stage: 'sampling' } },
  }));
  assert.equal(authFailRes.status, 502);
  const authFailText = await authFailRes.text();
  assertCleanResponseText(authFailText, 'brain 502 scrubbed auth error', [SECRET_CANARY]);
  assert.match(authFailText, /已脱敏/u);

  // Upstream 200 echoing raw API key in content, reasoning, and tool call -> scrubbed & dropped
  upstreamBehavior = async () => Response.json({
    choices: [{
      message: {
        content: `建议核对抽样框（凭据 ${SECRET_CANARY}）。`,
        reasoning_content: `内部推演含 ${SECRET_CANARY}`,
        tool_calls: [
          { id: `call-${SECRET_CANARY}`, type: 'function', function: { name: 'light', arguments: '{}' } },
          { id: 'call-leak-arg', type: 'function', function: { name: 'lookup', arguments: JSON.stringify({ query: SECRET_CANARY }) } },
        ],
      },
    }],
    usage: { prompt_tokens: 20, completion_tokens: 12 },
  });
  const scrubbedOk = await brain.POST(makeLocalGatewayRequest('/api/agent/brain', {
    body: { message: '检查样本代表性', context: { stage: 'sampling' } },
  }));
  assert.equal(scrubbedOk.status, 200);
  const scrubbedOkText = await scrubbedOk.text();
  assertCleanResponseText(scrubbedOkText, 'brain 200 scrubbed output', [SECRET_CANARY]);
  const scrubbedBody = JSON.parse(scrubbedOkText);
  assert.equal(scrubbedBody.toolCalls[0].id, 'tc-1');

  // Upstream network exception carrying Error.stack and secret -> 502 generic pure-Chinese message
  upstreamBehavior = async () => {
    const boom = new Error(`ECONNRESET to ${SECRET_CANARY}`);
    boom.stack = `Error: ECONNRESET ${SECRET_CANARY}\n    at Socket.onError (node:internal/net:99:11)`;
    throw boom;
  };
  const netErrRes = await brain.POST(makeLocalGatewayRequest('/api/agent/brain', {
    body: { message: '检查样本代表性', context: { stage: 'sampling' } },
  }));
  assert.equal(netErrRes.status, 502);
  assertCleanResponseText(await netErrRes.text(), 'brain 502 network throw', [SECRET_CANARY, 'ECONNRESET']);
});

test('app/api/agent/image-gen/route.ts enforces 40KB body cap, SSRF gateway allowlist, model/secret validation, and zero stack echo', async () => {
  const IMG_CANARY = 'sk-image-secret-canary-553311';
  const openAiSpec = imageGenEngineMod.IMAGE_GEN_MODELS.find((m) => m.provider === 'openai_compatible');
  assert.ok(openAiSpec, 'Expected at least one openai_compatible image model');
  const openAiModelId = openAiSpec.id;
  const env = {
    ...OFFLINE_LOCAL_DEV_ENV,
    OPENAI_API_KEY: IMG_CANARY,
  };
  const policy = compileLocalGatewayPolicy(env);

  let upstreamCalls = 0;
  let upstreamImpl = async () => Response.json({ data: [{ b64_json: 'c3ludGhldGlj', revised_prompt: '干净封面底图' }] });

  const imageRoute = compileRouteModule('app/api/agent/image-gen/route.ts', {
    env,
    fetchImpl: async (url, init) => {
      upstreamCalls += 1;
      return upstreamImpl(url, init);
    },
    imports: {
      '@/lib/agent/local-gateway-policy': policy,
      '@/lib/agent/image-gen-engine': imageGenEngineMod,
    },
  });

  // Malformed, array, and >40,000 byte bodies -> 400
  for (const rawBody of ['{broken', '[]', '{"prompt":"' + '图'.repeat(15_000) + '"}']) {
    const res = await imageRoute.POST(makeLocalGatewayRequest('/api/agent/image-gen', { rawBody }));
    assert.equal(res.status, 400);
    assertCleanResponseText(await res.text(), 'image-gen 400', [IMG_CANARY]);
  }

  // Prompt, aspect, path-traversal customModelName, SSRF baseUrl, and secret-in-prompt -> 422 with 0 upstream calls
  for (const invalidPayload of [
    { modelId: openAiModelId, prompt: '' },
    { modelId: openAiModelId, prompt: '画'.repeat(8001) },
    { modelId: openAiModelId, prompt: '调查封面', aspect: '21:9' },
    { modelId: openAiModelId, prompt: '调查封面', customModelName: '..\\..\\secret' },
    { modelId: openAiModelId, prompt: '调查封面', customModelName: 'model?key=leak' },
    { modelId: openAiModelId, prompt: '调查封面', customModelName: 'm'.repeat(101) },
    { modelId: openAiModelId, prompt: '调查封面', baseUrl: 'http://169.254.169.254/latest/meta-data' },
    { modelId: openAiModelId, prompt: '调查封面', baseUrl: 'http://127.0.0.1:8180' },
    { modelId: openAiModelId, prompt: '调查封面', baseUrl: 'https://attacker.example.test/v1' },
    { modelId: openAiModelId, prompt: '调查封面', baseUrl: 'file:///etc/passwd' },
    { modelId: openAiModelId, prompt: `包含敏感词 ${IMG_CANARY} 的提示词` },
    { modelId: openAiModelId, prompt: '调查封面', apiKey: 'sk-bad\r\nX-Header: injected' },
    { modelId: openAiModelId, prompt: '调查封面', apiKey: 'k'.repeat(513) },
  ]) {
    const res = await imageRoute.POST(makeLocalGatewayRequest('/api/agent/image-gen', { body: invalidPayload }));
    assert.equal(res.status, 422);
    assertCleanResponseText(await res.text(), 'image-gen 422 validation', [IMG_CANARY]);
  }
  assert.equal(upstreamCalls, 0);

  // Upstream echoing apiKey in b64_json is refused (502 provider_outcome_unknown)
  upstreamImpl = async () => Response.json({ data: [{ b64_json: IMG_CANARY }] });
  const leakedB64Res = await imageRoute.POST(makeLocalGatewayRequest('/api/agent/image-gen', {
    body: { modelId: openAiModelId, prompt: '干净封面设计', disableFallback: true },
  }));
  assert.equal(leakedB64Res.status, 502);
  assertCleanResponseText(await leakedB64Res.text(), 'image-gen 502 leaked b64', [IMG_CANARY]);

  // Upstream echoing apiKey in revised_prompt scrubs raw key before returning 200
  upstreamImpl = async () => Response.json({
    data: [{ b64_json: 'c3ludGhldGlj', revised_prompt: `封面构图说明 ${IMG_CANARY}` }],
  });
  const scrubbedRevisedRes = await imageRoute.POST(makeLocalGatewayRequest('/api/agent/image-gen', {
    body: { modelId: openAiModelId, prompt: '干净封面设计', disableFallback: true },
  }));
  assert.equal(scrubbedRevisedRes.status, 200);
  assertCleanResponseText(await scrubbedRevisedRes.text(), 'image-gen 200 scrubbed revised_prompt', [IMG_CANARY]);

  // Gemini URL path encodes slashes in customModelName via encodeURIComponent so ../ traversal cannot escape /v1beta/models/
  const geminiSpec = imageGenEngineMod.IMAGE_GEN_MODELS.find((m) => m.provider === 'gemini');
  if (geminiSpec) {
    let observedGeminiUrl = '';
    const geminiEnv = { ...OFFLINE_LOCAL_DEV_ENV, GEMINI_API_KEY: IMG_CANARY };
    const geminiRoute = compileRouteModule('app/api/agent/image-gen/route.ts', {
      env: geminiEnv,
      fetchImpl: async (url) => {
        observedGeminiUrl = String(url);
        return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'c3ludGhldGlj' } }] } }] });
      },
      imports: {
        '@/lib/agent/local-gateway-policy': compileLocalGatewayPolicy(geminiEnv),
        '@/lib/agent/image-gen-engine': imageGenEngineMod,
      },
    });
    const gemRes = await geminiRoute.POST(makeLocalGatewayRequest('/api/agent/image-gen', {
      body: { modelId: geminiSpec.id, customModelName: '../../v1/files', prompt: '干净封面设计' },
    }));
    assert.equal(gemRes.status, 200);
    assert.equal(
      observedGeminiUrl,
      'https://generativelanguage.googleapis.com/v1beta/models/..%2F..%2Fv1%2Ffiles:generateContent',
    );
  }

  // Upstream throwing Error with stack trace -> 502 generic pure-Chinese fallback without stack echo
  upstreamImpl = async () => {
    const err = new Error(`TLS handshake failed for ${IMG_CANARY}`);
    err.stack = `Error: TLS handshake failed\n    at TLSSocket.onConnect (node:internal/tls:120:7)`;
    throw err;
  };
  const throwRes = await imageRoute.POST(makeLocalGatewayRequest('/api/agent/image-gen', {
    body: { modelId: openAiModelId, prompt: '干净封面设计', disableFallback: true },
  }));
  assert.equal(throwRes.status, 502);
  assertCleanResponseText(await throwRes.text(), 'image-gen 502 network throw', [IMG_CANARY, 'TLSSocket']);
});

test('app/api/agent/autonomous/route.ts enforces 1.5MB cap, strips paid API keys from child env, and sanitizes NDJSON/error responses', async () => {
  const PAID_OPENAI = 'sk-operator-openai-canary-112233';
  const PAID_DEEPSEEK = 'sk-operator-deepseek-canary-445566';
  const env = {
    ...OFFLINE_LOCAL_DEV_ENV,
    OPENAI_API_KEY: PAID_OPENAI,
    DEEPSEEK_API_KEY: PAID_DEEPSEEK,
  };
  const policy = compileLocalGatewayPolicy(env);

  const spawnedRecords = [];
  let childMode = 'json_ok';

  function fakeSpawn(cmd, args, options) {
    spawnedRecords.push({ cmd, args, options });
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
    };

    child.stdin.on('finish', () => {
      setImmediate(() => {
        if (childMode === 'json_ok') {
          child.stdout.end(JSON.stringify({ snapshotId: 'snap-001', status: 'completed' }) + '\n');
          child.stderr.end();
          child.emit('close', 0);
        } else if (childMode === 'bad_stdout') {
          child.stdout.end('NOT_VALID_JSON');
          child.stderr.end();
          child.emit('close', 0);
        } else if (childMode === 'stream_ok') {
          child.stdout.write(JSON.stringify({ type: 'progress', step: '正在执行稳健性检验' }) + '\n');
          child.stdout.end(JSON.stringify({ type: 'done', snapshotId: 'snap-stream-1' }) + '\n');
          child.stderr.end();
          child.emit('close', 0);
        }
      });
    });
    return child;
  }

  const autonomousRoute = compileRouteModule('app/api/agent/autonomous/route.ts', {
    env,
    imports: {
      'node:child_process': { spawn: fakeSpawn },
      '@/lib/agent/local-gateway-policy': policy,
    },
  });

  // Malformed JSON, empty body, and >1,500,000 bytes -> 400 with 0 spawns
  for (const rawBody of ['{invalid', '', '{"huge":"' + 'x'.repeat(1_500_200) + '"}']) {
    const res = await autonomousRoute.POST(makeLocalGatewayRequest('/api/agent/autonomous', { rawBody }));
    assert.equal(res.status, 400);
    assertCleanResponseText(await res.text(), 'autonomous 400', [PAID_OPENAI, PAID_DEEPSEEK]);
  }

  // Non-object JSON -> 422 with 0 spawns
  for (const nonObjectJson of ['[]', 'null', '"text"', '123']) {
    const res = await autonomousRoute.POST(makeLocalGatewayRequest('/api/agent/autonomous', { rawBody: nonObjectJson }));
    assert.equal(res.status, 422);
    assertCleanResponseText(await res.text(), 'autonomous 422', [PAID_OPENAI, PAID_DEEPSEEK]);
  }
  assert.equal(spawnedRecords.length, 0);

  // Valid non-streaming call strips OPENAI_API_KEY & DEEPSEEK_API_KEY from child env
  childMode = 'json_ok';
  const okRes = await autonomousRoute.POST(makeLocalGatewayRequest('/api/agent/autonomous', {
    body: { goal: '检验不同年龄段受访者满意度差异', datasetMode: 'benchmark' },
  }));
  assert.equal(okRes.status, 200);
  assert.match(okRes.headers.get('cache-control') ?? '', /no-store/u);
  const okText = await okRes.text();
  assertCleanResponseText(okText, 'autonomous 200', [PAID_OPENAI, PAID_DEEPSEEK]);
  assert.equal(spawnedRecords.length, 1);
  assert.equal(Object.hasOwn(spawnedRecords[0].options.env, 'OPENAI_API_KEY'), false);
  assert.equal(Object.hasOwn(spawnedRecords[0].options.env, 'DEEPSEEK_API_KEY'), false);

  // Invalid child stdout returns clean Chinese message without stack trace
  childMode = 'bad_stdout';
  const badOutRes = await autonomousRoute.POST(makeLocalGatewayRequest('/api/agent/autonomous', {
    body: { goal: '检验异常输出' },
  }));
  assert.equal(badOutRes.status, 500);
  const badOutText = await badOutRes.text();
  assertCleanResponseText(badOutText, 'autonomous 500 invalid child stdout', [PAID_OPENAI, PAID_DEEPSEEK]);
  assert.equal(JSON.parse(badOutText).error, '自主探索服务返回的数据格式无效。');

  // Streaming NDJSON mode sets strict headers and emits clean frames
  childMode = 'stream_ok';
  const streamRes = await autonomousRoute.POST(makeLocalGatewayRequest('/api/agent/autonomous', {
    body: { goal: '流式检验', stream: true },
  }));
  assert.equal(streamRes.status, 200);
  assert.match(streamRes.headers.get('content-type') ?? '', /application\/x-ndjson/u);
  assert.match(streamRes.headers.get('cache-control') ?? '', /no-store/u);
  const ndjsonText = await streamRes.text();
  assertCleanResponseText(ndjsonText, 'autonomous NDJSON stream', [PAID_OPENAI, PAID_DEEPSEEK]);
  const lines = ndjsonText.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.at(-1).type, 'done');
});

test('app/api/agent/full-report/route.ts rejects wrong media type, >8MB payloads, duplicate JSON keys, client API keys, and masks internal stacks', async () => {
  const fullReportRoute = compileRouteModule('app/api/agent/full-report/route.ts', {
    imports: {
      '@/lib/agent/full-report-server': fullReportServerMod,
    },
  });
  assert.equal(fullReportRoute.runtime, 'nodejs');
  assert.equal(fullReportRoute.dynamic, 'force-dynamic');
  assert.equal(typeof fullReportRoute.POST, 'function');

  // Wrong Content-Type -> 415
  const res415 = await fullReportRoute.POST(new Request('http://localhost/api/agent/full-report', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: '{}',
  }));
  assert.equal(res415.status, 415);
  assertCleanResponseText(await res415.text(), 'full-report 415');

  // Malformed JSON -> 400
  const res400 = await fullReportRoute.POST(new Request('http://localhost/api/agent/full-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{corrupt-json',
  }));
  assert.equal(res400.status, 400);
  assertCleanResponseText(await res400.text(), 'full-report 400');

  // Oversized body (> 8 MiB) -> 413
  const res413 = await fullReportRoute.POST(new Request('http://localhost/api/agent/full-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(8 * 1024 * 1024 + 1024) },
    body: '{}',
  }));
  assert.equal(res413.status, 413);
  assertCleanResponseText(await res413.text(), 'full-report 413');

  // Duplicate JSON member keys -> 422 invalid_report_input
  const dupKeyRes = await fullReportRoute.POST(new Request('http://localhost/api/agent/full-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"schemaVersion":1,"mode":"plan","mode":"empirical"}',
  }));
  assert.equal(dupKeyRes.status, 422);
  assertCleanResponseText(await dupKeyRes.text(), 'full-report 422 duplicate key');

  // Client-supplied apiKey / baseUrl rejected before any upstream call; unexpected internal error masks stack
  const CLIENT_SECRET = 'sk-client-supplied-secret-776655';
  const basePayload = {
    schemaVersion: 1,
    runId: 'c0f951d7-54d8-4f43-973f-bcf9d3f36d33',
    projectId: 'd8ae0d7a-619f-4c13-bcf8-554a0e14c535',
    inputRevision: '0'.repeat(64),
    serviceId: '6d33e1c2-7ad3-47c3-862f-7a034ac3bb49',
    serviceRevision: 1,
    consent: true,
    topic: '城市青年租房通勤满意度实证调查',
    mode: 'plan',
    base: { design: newQuestionnaire(), dataset: null, report: createEditorContent() },
    sectionNodes: ['intro.background'],
    concurrency: 1,
  };
  basePayload.inputRevision = await fullReportInputRevision(basePayload);

  const clientKeyRes = await fullReportRoute.POST(new Request('http://localhost/api/agent/full-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...basePayload, apiKey: CLIENT_SECRET }),
  }));
  assert.equal(clientKeyRes.status, 422);
  assertCleanResponseText(await clientKeyRes.text(), 'full-report 422 client key rejected', [CLIENT_SECRET]);

  // Unexpected internal throw inside handler never echoes Error.message or Error.stack
  const crashingHandler = fullReportServerMod.createFullReportHandler({
    apiOrigin: 'http://127.0.0.1:8180',
    fetcher: async (_url, init) => Response.json({
      ...JSON.parse(init.body),
      status: 'authorized',
      provider: 'synthetic',
      model: 'synthetic-model',
      providerMode: 'live',
      maxConcurrency: 2,
    }),
    generate: async () => {
      const crash = new Error(`INTERNAL_DB_PATH C:\\private\\vault.db ${CLIENT_SECRET}`);
      crash.stack = `Error: INTERNAL_DB_PATH\n    at generate (/srv/secret/pipeline.ts:88:3)`;
      throw crash;
    },
  });

  const maskedRes = await crashingHandler(new Request('http://localhost/api/agent/full-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(basePayload),
  }));
  assert.equal(maskedRes.status, 500);
  const maskedBodyText = await maskedRes.text();
  assertCleanResponseText(maskedBodyText, 'full-report masked 500', [CLIENT_SECRET, 'INTERNAL_DB_PATH', 'vault.db']);
  assert.deepEqual(JSON.parse(maskedBodyText), {
    error: { code: 'internal_error', message: '服务暂时不可用，请稍后重试。' },
  });
});
