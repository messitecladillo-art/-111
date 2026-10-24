import { build } from 'esbuild';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Test-only, loopback-only harness; uses the real components without a product route.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '../..');
const output = path.join(repoRoot, '.collab/runs/20261011-chart-stress/evidence/browser-site');
await fs.mkdir(output, { recursive: true });
const bundled = await build({ entryPoints: [path.join(appRoot, 'tests/fixtures/chart-stress-browser.tsx')], bundle: true, splitting: false, format: 'esm', platform: 'browser', target: 'es2022', jsx: 'automatic', alias: { '@': appRoot }, tsconfig: path.join(appRoot, 'tsconfig.json'), outdir: output, entryNames: 'bundle', minify: false, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning', metafile: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceManifest = [];
for (const input of Object.keys(bundled.metafile.inputs)) {
  const absolute = path.resolve(input), relative = path.relative(repoRoot, absolute).replaceAll('\\', '/');
  if (!relative.startsWith('apps/frontend/')) continue;
  sourceManifest.push({ path: relative, sha256: hash(await fs.readFile(absolute)) });
}
sourceManifest.sort((a, b) => a.path.localeCompare(b.path, 'en'));
await fs.writeFile(path.join(output, 'build-binding.json'), JSON.stringify({ schema: 'chart-browser-build/v1', builtAt: new Date().toISOString(), sourceManifest, outputs: await Promise.all(['bundle.js', 'bundle.css'].map(async name => ({ path: name, sha256: hash(await fs.readFile(path.join(output, name))) }))) }, null, 2) + '\n');
const page = '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>证见 · 复杂图表压力验收</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/bundle.css"></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>';
const files = new Map([['/bundle.js', ['text/javascript;charset=utf-8', path.join(output, 'bundle.js')]], ['/bundle.css', ['text/css;charset=utf-8', path.join(output, 'bundle.css')]]]);
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1:3191').pathname;
  response.setHeader('Cache-Control', 'no-store');
  if (pathname === '/') { response.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' }); response.end(page); return; }
  const file = files.get(pathname);
  if (!file) { response.writeHead(404); response.end('Not found'); return; }
  try { response.writeHead(200, { 'Content-Type': file[0] }); response.end(await fs.readFile(file[1])); }
  catch { response.writeHead(500); response.end('Harness asset unavailable'); }
});
server.listen(3191, '127.0.0.1', () => console.log('Chart pressure harness: http://127.0.0.1:3191/ (local synthetic data only)'));
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
