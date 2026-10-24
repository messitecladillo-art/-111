import assert from 'node:assert/strict';

const base = process.env.EVIX_LANDING_URL || 'http://127.0.0.1:3180';
const results = [];
for (const pathname of ['/', '/explore', '/workspace', '/login', '/projects', '/services']) {
  const response = await fetch(new URL(pathname, base), { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, pathname);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  const html = await response.text();
  assert.match(html, /证见/);
  if (pathname === '/') {
    assert.match(html, /data-landing="evidence-journey"/);
    assert.match(html, /href="\/explore"/);
    assert.doesNotMatch(html, /id="questions"|题目文字|产品演示视图/);
    assert.match(html, /href="\/login"/);
  } else {
    assert.doesNotMatch(html, /data-landing="evidence-journey"/);
    if (pathname === '/explore') assert.match(html, /产品演示视图/);
  }
  results.push({ pathname, status: response.status, bytes: Buffer.byteLength(html) });
}
console.log(JSON.stringify({ kind: 'SSR route smoke; browser interactions verified separately', results }));
