import assert from 'node:assert/strict';

// Exercise URLs emitted by the actual renderer: an HTML 200 alone cannot
// establish that a published page has its styles or browser runtime.
const input = process.argv[2];
assert(input, 'Usage: node scripts/check-cloudflare-preview.mjs https://<worker>.workers.dev');
const base = new URL(input);
assert(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password);
const resources = new Map();
const pages = [];
async function request(path) {
  const url = new URL(path, base);
  assert.equal(url.origin, base.origin, 'Preview checks must remain on the selected origin');
  const response = await fetch(url, {
    headers: { 'User-Agent': 'EviX-Deployment-Smoke/1.0' },
    redirect: 'error', signal: AbortSignal.timeout(30_000),
  });
  return { response, text: await response.text() };
}
for (const path of ['/', '/agent', '/workspace', '/knowledge', '/services', '/projects']) {
  const { response, text } = await request(path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
  assert.equal(response.headers.get('x-evix-deployment-scope'), 'frontend-preview');
  assert.match(text, /<html[^>]*lang="zh-CN"/);
  let styles = 0;
  for (const tag of text.matchAll(/<(?:link|script)\b[^>]*>/g)) {
    const source = tag[0].match(/\b(?:href|src)="([^"]+)"/)?.[1];
    if (!source?.startsWith('/_next/static/')) continue;
    const css = /rel="stylesheet"/.test(tag[0]);
    const js = /^<script/.test(tag[0]) || /rel="modulepreload"/.test(tag[0]);
    if (css) styles++;
    if (css || js) resources.set(source, css ? 'css' : 'js');
  }
  assert(styles > 0, `${path} must include real stylesheets`);
  pages.push({ path, status: response.status, styles });
}
assert(resources.size > 0 && resources.size <= 250, 'Unexpected browser resource manifest');
const pending = [...resources];
const checked = [];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (pending.length) {
    const [path, kind] = pending.shift();
    const { response, text } = await request(path);
    assert.equal(response.status, 200, `Missing ${kind}: ${path}`);
    assert.match(response.headers.get('content-type') ?? '', kind === 'css' ? /^text\/css/ : /^(?:text|application)\/(?:javascript|ecmascript)/, path);
    assert(text.length > 0 && !/^\s*<!doctype html/i.test(text), path);
    checked.push({ path, kind, status: response.status, bytes: Buffer.byteLength(text) });
  }
}));
const boundaries = [];
for (const path of ['/api/auth/session', '/api/projects', '/api/agent/full-report', '/%61pi/projects']) {
  const { response, text } = await request(path);
  assert.equal(response.status, 503, path);
  assert.equal(JSON.parse(text).error.code, 'preview_backend_unavailable', path);
  boundaries.push({ path, status: response.status });
}
console.log(JSON.stringify({ origin: base.origin, pages, browserResources: checked.length, stylesheets: checked.filter(item => item.kind === 'css').length, boundaries, resources: checked }, null, 2));
