import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as catalog from '../lib/report-case-catalog.ts';

// Execute the actual Next route handlers and HTTP helpers. No HTTP server,
// backend, private PDF or browser cache is needed for this API contract check.
function moduleFromSource(relative, imports = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, URL, Request, Response, Headers, TextDecoder, Uint8Array,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `unexpected dependency: ${name}`);
      return imports[name];
    },
  });
  return exports;
}

const http = moduleFromSource('../app/api/_lib/http.ts');
const imports = { '@/lib/report-case-catalog': catalog, '../_lib/http': http, '../../_lib/http': http };
const list = moduleFromSource('../app/api/cases/route.ts', imports);
const detail = moduleFromSource('../app/api/cases/[id]/route.ts', imports);
const request = query => new Request(`https://example.test/api/cases${query}`);

test('case list returns the complete-report catalogue, never a PDF or download payload', async () => {
  const response = await list.GET(request(''));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  const body = await response.json();
  assert.equal(body.total, 9);
  assert.equal(body.library.fullReports, 9);
  assert.equal(body.library.pages, 982);
  assert.equal(body.library.readingGuides, 45);
  assert.deepEqual(body.cases.map(item => item.id), catalog.REPORT_CASES.map(item => item.id));
  for (const item of body.cases) {
    assert.match(item.sha256, /^[a-f\d]{64}$/);
    for (const key of ['blob', 'data', 'buffer', 'downloadUrl', 'originalUrl', 'localPath']) {
      assert.equal(Object.hasOwn(item, key), false, key);
    }
  }
  assert.doesNotMatch(JSON.stringify(body), /C:\\Users|data:application\/pdf|file:\/\//i);
});

test('case filters use research metadata, with clear empty and invalid-query states', async () => {
  const response = await list.GET(request('?q=' + encodeURIComponent('露营')));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.total, 1);
  assert.ok(body.cases[0].region.includes('重庆'));
  const noMatch = await list.GET(request('?q=' + encodeURIComponent('露营') + '&region=' + encodeURIComponent('武汉')));
  assert.equal((await noMatch.json()).total, 0);
  const retired = await list.GET(request('?verification=official_verified'));
  assert.equal(retired.status, 400);
  assert.equal((await retired.json()).error.code, 'retired_case_filter');
  const oversized = await list.GET(request('?q=' + 'x'.repeat(81)));
  assert.equal(oversized.status, 400);
  assert.match(oversized.headers.get('cache-control'), /no-store/);
});

test('dynamic details stay in the same catalogue and reject legacy, missing and invalid IDs', async () => {
  const sample = catalog.REPORT_CASES[0];
  const response = await detail.GET(request('/' + sample.id), { params: Promise.resolve({ id: sample.id }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual((await response.json()).case, JSON.parse(JSON.stringify(sample)));
  for (const id of ['report-not-in-catalogue', '15-grad-first-001-anhui-university-rural-toilet']) {
    const missing = await detail.GET(request('/' + id), { params: Promise.resolve({ id }) });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'case_not_found');
  }
  const invalid = await detail.GET(request('/invalid'), { params: Promise.resolve({ id: '../original.pdf' }) });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'invalid_case_id');
});
