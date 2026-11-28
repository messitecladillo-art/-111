import assert from 'node:assert/strict';
import test from 'node:test';
import { createCloudflarePreview } from '../lib/cloudflare-preview.ts';

const origin = 'https://preview.example';

test('hosted and unknown APIs are refused before the application handler', async () => {
  let calls = 0;
  const worker = createCloudflarePreview({ fetch() { calls++; throw Error('must not reach application'); } });
  for (const path of [
    '/api', '/api/auth/session', '/api/projects', '/api/projects/project-id',
    '/api/agent/services', '/api/agent/full-report', '/api/drafts', '/api/unknown',
    '/api/cases/id/extra', '/api/cases%2Fid', '/%61pi/projects', '//api/projects',
  ]) {
    const response = await worker.fetch(new Request(origin + path, { method: 'POST' }), {}, {});
    assert.equal(response.status, 503, path);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-evix-deployment-scope'), 'frontend-preview');
    assert.equal((await response.json()).error.code, 'preview_backend_unavailable');
  }
  assert.equal(calls, 0);
});

test('local API routes and pages preserve requests, environment and responses', async () => {
  const env = {}, context = {};
  const paths = ['/api/cases', '/api/cases/report-01', '/api/rules', '/api/diagnose', '/api/control-contract', '/api/agent/brain', '/api/agent/image-gen', '/api/cases/', '/', '/workspace', '/projects'];
  let calls = 0;
  const worker = createCloudflarePreview({
    fetch(request, receivedEnv, receivedContext) {
      calls++;
      assert.strictEqual(receivedEnv, env);
      assert.strictEqual(receivedContext, context);
      assert.equal(request.headers.get('x-probe'), 'preserved');
      return new Response(request.url, { status: 202, headers: { 'x-handler': 'preserved', 'content-type': 'text/plain' } });
    },
  });
  for (const path of paths) {
    const request = new Request(origin + path, { headers: { 'x-probe': 'preserved' } });
    const response = await worker.fetch(request, env, context);
    assert.equal(response.status, 202, path);
    assert.equal(response.headers.get('x-handler'), 'preserved');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(await response.text(), request.url);
  }
  assert.equal(calls, paths.length);
});

test('OCR assets receive their stricter script and worker policy', async () => {
  const worker = createCloudflarePreview({ fetch: () => new Response('asset') });
  const response = await worker.fetch(new Request(origin + '/knowledge-assets/tesseract-7.0.0/worker.min.js'), {}, {});
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'");
});

test('malformed encoded paths fail without reaching application code', async () => {
  const worker = createCloudflarePreview({ fetch() { throw Error('must not reach application'); } });
  const response = await worker.fetch(new Request(origin + '/api/%E0%A4%A'), {}, {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_path');
});

test('generated browser assets are served by ASSETS before the application router', async () => {
  const seen = [];
  const worker = createCloudflarePreview({ fetch() { throw Error('compiled assets must bypass application routing'); } });
  const env = { ASSETS: { fetch(request) {
    seen.push(request);
    const css = new URL(request.url).pathname.endsWith('.css');
    return new Response(request.method === 'HEAD' ? null : css ? 'body{color:red}' : 'export{}', {
      headers: { 'Content-Type': css ? 'text/css' : 'text/javascript', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  } } };
  for (const [path, method, mime] of [
    ['/_next/static/css/main.hash.css', 'GET', 'text/css'],
    ['/_next/static/chunks/page.hash.js', 'GET', 'text/javascript'],
    ['/_next/static/media/font.hash.woff2', 'HEAD', 'text/javascript'],
  ]) {
    const request = new Request(origin + path, { method });
    const response = await worker.fetch(request, env, {});
    assert.strictEqual(seen.at(-1), request);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), mime);
    assert.match(response.headers.get('cache-control'), /immutable/);
    assert.equal(response.headers.get('x-evix-deployment-scope'), 'frontend-preview');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    if (method === 'HEAD') assert.equal(await response.text(), '');
  }
});

test('missing compiled assets stay 404 and mutating requests cannot reach asset storage', async () => {
  let assetCalls = 0;
  const env = { ASSETS: { fetch() { assetCalls++; return new Response('Not Found', { status: 404 }); } } };
  const worker = createCloudflarePreview({ fetch() { throw Error('must not render HTML for generated assets'); } });
  const missing = await worker.fetch(new Request(origin + '/_next/static/chunks/missing.js'), env, {});
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), 'Not Found');
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const response = await worker.fetch(new Request(origin + '/_next/static/css/main.css', { method }), env, {});
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
  }
  assert.equal(assetCalls, 1);
});
