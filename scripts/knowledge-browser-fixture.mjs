import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, version as esbuildVersion } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platform = path.join(root, 'apps/evi-x-platform');
const output = path.join(root, '.collab/runs/20261014-knowledge/browser-benchmark');
if (!output.startsWith(root + path.sep)) throw Error('Benchmark output must remain inside this checkout.');
const workerPath = path.join(platform, 'lib/knowledge/knowledge.worker.ts');
const searchPath = path.join(platform, 'lib/knowledge/search.ts');
const clientPath = path.join(platform, 'lib/knowledge/worker-client.ts');
const port = 3191;
const sha = value => createHash('sha256').update(value).digest('hex');
const args = new Set(process.argv.slice(2));
if ([...args].some(arg => !['--prepare-only', '--serve-existing'].includes(arg))) throw Error('Use --prepare-only or --serve-existing.');

// Every record is deliberately synthetic. The reviewed field exercises the real
// public-index filter; it does not attest semantic review of 5,000 concepts.
function syntheticEntries() {
  const domains = ['stats', 'math', 'computing', 'ml', 'research', 'philosophy', 'geography', 'social'];
  return Array.from({ length: 5000 }, (_, index) => {
    const code = String(index).padStart(5, '0');
    return {
      id: `synthetic-${code}`, version: 1, name: `合成概念 ${code}`, englishName: `Synthetic Concept ${code}`,
      aliases: [`SYN${code}`, `基准案例${code}`, `synthetic reference ${code}`],
      domain: domains[index % domains.length], depth: 'brief',
      definition: `合成压力记录编号 ${code}，用于搜索索引的性能测试。样本、数据、矩阵、变量和估计只作为测试词。独有检索标记 bodycode${code}。`,
      uses: [`测量合成记录 ${code} 的查询性能，不参与项目证据或知识内容发布。`],
      examples: [`合成示例 ${code}：查询只应返回这里的基准记录。`],
      confusions: [], questions: [{ question: `如何定位案例 ${code}`, answer: `按合成编号 ${code} 定位。` }],
      relatedIds: [], methodIds: [], materialIds: [], toolLinks: [],
      sources: [{ id: 'synthetic-only', title: '本地合成基准，不访问来源', url: 'https://example.invalid/synthetic-benchmark', locator: code, scope: '仅用于隔离压力测试' }],
      review: { status: 'reviewed', producer: 'synthetic-fixture', reviewer: 'synthetic-test-driver', checkedAt: '2026-10-15T00:00:00Z' }, updatedAt: '2026-10-15',
    };
  });
}
function syntheticQueries() {
  return Array.from({ length: 120 }, (_, index) => {
    const number = (index * 347 + 173) % 5000, code = String(number).padStart(5, '0');
    const kind = index % 10;
    if (kind < 2) return { query: `合成概念 ${code}`, expectedId: `synthetic-${code}`, kind: 'canonical' };
    if (kind < 4) return { query: `SYN${code}`, expectedId: `synthetic-${code}`, kind: 'alias' };
    if (kind < 6) return { query: `synthetic reference ${code.slice(0, 4)}`, expectedPrefix: `synthetic-${code.slice(0, 4)}`, kind: 'prefix' };
    if (kind < 8) return { query: `bodycode${code}`, expectedId: `synthetic-${code}`, kind: 'definition' };
    if (kind === 8) return { query: `synthetci reference ${code}`, expectedId: `synthetic-${code}`, kind: 'typo' };
    return { query: `quasar-unmatched-${index}`, expectedEmpty: true, kind: 'zero' };
  });
}

const workerInstrumentation = `
const __benchAdd = globalThis.addEventListener.bind(globalThis);
const __benchPost = globalThis.postMessage.bind(globalThis);
let __benchStarted = 0, __benchHeapBefore = null;
globalThis.addEventListener = function(type, callback, options) {
  if (type !== 'message') return __benchAdd(type, callback, options);
  return __benchAdd(type, event => {
    __benchHeapBefore = performance.memory?.usedJSHeapSize ?? null;
    __benchStarted = performance.now();
    callback.call(globalThis, event);
  }, options);
};
globalThis.postMessage = function(message, transfer) {
  const measured = performance.now();
  const metadata = { cpuMs: measured - __benchStarted, indexedCount: globalThis.__EVIX_KNOWLEDGE_BENCH_INDEX_SIZE__ ?? null,
    heapBeforeBytes: __benchHeapBefore, heapAfterBytes: performance.memory?.usedJSHeapSize ?? null };
  return __benchPost({ ...message, __benchmark: metadata }, transfer);
};
`;

// Instrument only the factory boundary. The actual search implementation and
// worker/client protocol are bundled from the product source without editing it.
const actualIndexPlugin = {
  name: 'benchmark-actual-index-size',
  setup(builder) {
    builder.onResolve({ filter: /^\.\/search\.ts$/ }, request => {
      if (path.resolve(request.importer) === workerPath) return { path: 'actual-search-factory', namespace: 'benchmark' };
    });
    builder.onLoad({ filter: /^actual-search-factory$/, namespace: 'benchmark' }, () => ({
      contents: `import { createKnowledgeSearch as actualCreate } from ${JSON.stringify(searchPath.replaceAll('\\', '/'))};
export function createKnowledgeSearch(entries, options) { const index = actualCreate(entries, options); globalThis.__EVIX_KNOWLEDGE_BENCH_INDEX_SIZE__ = index.size; return index; }`,
      loader: 'js', resolveDir: platform,
    }));
  },
};

const browserApp = `
import {createKnowledgeSearchClient} from ${JSON.stringify(clientPath.replaceAll('\\', '/'))};
const button=document.querySelector('#run'), status=document.querySelector('#status'), output=document.querySelector('#receipt');
let client=null, lastReceipt=null;
const quantiles=values=>{const ordered=[...values].sort((a,b)=>a-b);const at=p=>ordered[Math.max(0,Math.ceil(p*ordered.length)-1)];return {n:ordered.length,min:ordered[0],median:at(.5),p95:at(.95),max:ordered.at(-1)};};
const heap=()=>performance.memory?{usedBytes:performance.memory.usedJSHeapSize,totalBytes:performance.memory.totalJSHeapSize,limitBytes:performance.memory.jsHeapSizeLimit}:null;
const pause=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
async function run(){
  button.disabled=true; document.querySelector('#download').disabled=true;output.textContent='';lastReceipt=null;client?.dispose();
  const records=[],workerMeasurements=[],workerResults=new Map();let initialized=null;
  try{
    status.textContent='读取隔离的合成记录…';
    const [entries,queries,manifest]=await Promise.all(['/entries.json','/queries.json','/manifest.json'].map(async p=>{const r=await fetch(p,{cache:'no-store'});if(!r.ok)throw Error('Fixture fetch failed: '+r.status);return r.json();}));
    if(entries.length!==5000||new Set(entries.map(e=>e.id)).size!==5000)throw Error('Fixture must contain 5,000 distinct records');
    const memoryBefore=heap(),begin=performance.now();
    status.textContent='实际 Worker 正在构建索引…';
    client=createKnowledgeSearchClient(entries,{timeoutMs:30000,workerFactory:()=>{
      const worker=new Worker('/knowledge.worker.js',{type:'module',name:'evix-knowledge-benchmark'});
      worker.addEventListener('message',event=>{const message=event.data;if(message.kind==='initialized')initialized=message.__benchmark;if(message.kind==='result'){workerResults.set(message.id,message.__benchmark);workerMeasurements.push(message.__benchmark);}});
      return worker;
    }});
    await client.ready;
    const readyRoundTripMs=performance.now()-begin;
    if(client.mode!=='worker'||!initialized||initialized.indexedCount!==5000)throw Error('Real Worker / actual index size not verified; fallback is not accepted');
    status.textContent='索引已确认：5,000 条。预热 20 次…';await pause();
    for(let i=0;i<20;i++)await client.search(queries[i].query,{limit:3});
    for(let i=0;i<100;i++){
      const item=queries[i+20],before=performance.now();const hits=await client.search(item.query,{limit:3});const elapsed=performance.now()-before;
      const measurement=workerResults.get(i+21);if(!measurement||!Number.isFinite(measurement.cpuMs))throw Error('Missing CPU timing for actual worker response');
      if(client.mode!=='worker')throw Error('Worker switched to fallback');
      const ids=hits.map(hit=>hit.entry.id);
      const correct=item.expectedEmpty?ids.length===0:item.expectedPrefix?ids.length>0&&ids.every(id=>id.startsWith(item.expectedPrefix)):ids.includes(item.expectedId);
      records.push({index:i+1,kind:item.kind,query:item.query,hitIds:ids,correct,cpuMs:measurement.cpuMs,endToEndMs:elapsed});
      if((i+1)%10===0){status.textContent='实际回执 '+(i+1)+' / 100';await pause();}
    }
    const manifestDigest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(entries)));
    const fixtureHash=[...new Uint8Array(manifestDigest)].map(v=>v.toString(16).padStart(2,'0')).join('');
    if(fixtureHash!==manifest.fixtureCanonicalSha256)throw Error('Fixture hash does not match the build manifest');
    lastReceipt={schemaVersion:1,measuredAt:new Date().toISOString(),classification:'synthetic isolated browser benchmark',
      entryCount:entries.length,indexedCount:initialized.indexedCount,warmupQueries:20,measuredQueries:100,clientMode:client.mode,fallbackObserved:false,
      readyRoundTripMs,cpuIndexBuildMs:initialized.cpuMs,cpuSearchMs:quantiles(records.map(r=>r.cpuMs)),endToEndMs:quantiles(records.map(r=>r.endToEndMs)),
      referenceChecks:{passed:records.filter(r=>r.correct).length,total:100},memory:{mainBefore:memoryBefore,mainAfter:heap(),workerBeforeBytes:initialized.heapBeforeBytes,workerAfterBytes:initialized.heapAfterBytes,workerLastBytes:workerMeasurements.at(-1)?.heapAfterBytes??null},
      browser:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency??null,deviceMemoryGiB:navigator.deviceMemory??null,crossOriginIsolated},
      viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},manifest,fixtureHash,records};
    output.textContent=JSON.stringify(lastReceipt,null,2);
    document.querySelector('#cpu').textContent=lastReceipt.cpuSearchMs.p95.toFixed(2)+' ms';
    document.querySelector('#rtt').textContent=lastReceipt.endToEndMs.p95.toFixed(2)+' ms';
    document.querySelector('#build').textContent=lastReceipt.cpuIndexBuildMs.toFixed(2)+' ms';
    document.querySelector('#index').textContent='5,000 / Worker';
    status.textContent='100 次实际回执完成；核对 '+lastReceipt.referenceChecks.passed+'/100。';
    document.querySelector('#download').disabled=false;
  }catch(error){status.textContent='测试未通过：'+(error instanceof Error?error.message:String(error));output.textContent=JSON.stringify({status:'failed',clientMode:client?.mode??null,error:String(error)},null,2);}
  finally{button.disabled=false;client?.dispose();}
}
button.addEventListener('click',()=>void run());
document.querySelector('#download').addEventListener('click',()=>{if(!lastReceipt)return;const url=URL.createObjectURL(new Blob([JSON.stringify(lastReceipt,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='knowledge-browser-receipt.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
`;

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>证见 · 搜索 Worker 性能验收</title><style>
:root{color-scheme:dark;font-family:Inter,"Microsoft YaHei UI",sans-serif;background:#0d171c;color:#e9eeeb}*{box-sizing:border-box}body{margin:0;padding:44px 7vw}main{max-width:1160px;margin:auto}p{color:#aabbb4;line-height:1.7}h1{font-size:30px;letter-spacing:-.6px;margin:8px 0 12px}small{color:#8ca79a}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0}.metric{border:1px solid #2b4037;border-radius:14px;padding:20px;background:#13231d}.metric strong{display:block;margin-top:12px;font-size:24px;font-weight:600}button{font:inherit;padding:12px 18px;border-radius:10px;border:1px solid #527562;background:#b4d4bc;color:#102117;cursor:pointer}button+button{margin-left:10px;background:transparent;color:#dce5df}button:disabled{opacity:.45;cursor:default}#status{min-height:28px}pre{background:#09130f;border:1px solid #263c31;border-radius:14px;padding:22px;overflow:auto;max-height:570px;font:12px/1.6 Consolas,monospace;color:#bbd0c2}button:focus-visible{outline:3px solid #e5ba5b;outline-offset:3px}
</style><script type="module" src="/app.js"></script></head><body><main><small>EVI-X / ISOLATED ACCEPTANCE</small><h1>知识搜索，真实浏览器压力测试</h1><p>5,000 条合成记录 · 实际产品 Worker 与搜索客户端 · 预热 20 次后，记录 100 次查询。CPU 计算与端到端响应分别计时，不含界面防抖。此页面只供本地验收。</p><button id="run">运行浏览器 Worker 压力测试</button><button id="download" disabled>下载测试回执</button><p id="status" role="status">等待执行</p><section class="metrics"><div class="metric"><small>实际索引</small><strong id="index">待验证</strong></div><div class="metric"><small>查询 CPU P95</small><strong id="cpu">—</strong></div><div class="metric"><small>端到端 P95</small><strong id="rtt">—</strong></div><div class="metric"><small>索引 CPU 构建</small><strong id="build">—</strong></div></section><pre id="receipt" aria-label="浏览器性能回执"></pre></main></body></html>`;

async function prepare() {
  await mkdir(output, { recursive: true });
  const sourcePaths = { search: searchPath, worker: workerPath, client: clientPath };
  const sourceHashes = Object.fromEntries(await Promise.all(Object.entries(sourcePaths).map(async ([name, filename]) => [name, sha(await readFile(filename))])));
  const entries = syntheticEntries();
  await Promise.all([
    build({ entryPoints: [workerPath], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(output, 'knowledge.worker.js'), banner: { js: workerInstrumentation }, plugins: [actualIndexPlugin], sourcemap: false }),
    build({ stdin: { contents: browserApp, resolveDir: root, sourcefile: 'browser-benchmark-entry.mjs', loader: 'js' }, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(output, 'app.js'), sourcemap: false }),
  ]);
  for (const [name, filename] of Object.entries(sourcePaths)) if (sha(await readFile(filename)) !== sourceHashes[name]) throw Error('Product source changed during bundle; prepare again.');
  const mini = JSON.parse(await readFile(path.join(root, 'node_modules/minisearch/package.json'), 'utf8'));
  let revision = 'unavailable';try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* Source hashes remain authoritative. */ }
  const manifest = { preparedAt: new Date().toISOString(), inputRevision: revision, sourceHashes, nodeVersion: process.version, esbuildVersion, miniSearchVersion: mini.version,
    fixtureCount: entries.length, fixtureCanonicalSha256: sha(JSON.stringify(entries)), protocol: 'actual KnowledgeWorkerRequest/Response with additional isolated timing metadata',
    capabilities: ['static loopback fixture only', 'no APIs or external sources'], notes: ['CPU times stop before response serialization; end-to-end includes message cloning and round-trip scheduling.', 'Main JS heap excludes the Worker; unsupported browser memory measurements remain null.', 'Synthetic reviewed metadata exercises the production filter; it is not semantic content approval.'] };
  await Promise.all([writeFile(path.join(output, 'entries.json'), JSON.stringify(entries)), writeFile(path.join(output, 'queries.json'), JSON.stringify(syntheticQueries())), writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2)), writeFile(path.join(output, 'index.html'), html)]);
  console.log(JSON.stringify({ prepared: true, output, entries: 5000, sourceHashes, url: `http://127.0.0.1:${port}/` }));
}
if (!args.has('--serve-existing')) await prepare();
if (!args.has('--prepare-only')) {
  const files = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/index.html', ['index.html', 'text/html; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/knowledge.worker.js', ['knowledge.worker.js', 'text/javascript; charset=utf-8']], ['/entries.json', ['entries.json', 'application/json; charset=utf-8']], ['/queries.json', ['queries.json', 'application/json; charset=utf-8']], ['/manifest.json', ['manifest.json', 'application/json; charset=utf-8']]]);
  const server = createServer(async (request, response) => {
    const item = files.get(request.url?.split('?')[0] ?? '');
    if (!['GET', 'HEAD'].includes(request.method ?? '') || !item) { response.writeHead(404);response.end('Not found');return; }
    try {
      const bytes = await readFile(path.join(output, item[0]));
      response.writeHead(200, { 'Content-Type': item[1], 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { response.writeHead(404);response.end('Fixture unavailable; prepare first.'); }
  });
  server.on('error', error => { console.error(error.message);process.exitCode=1; });
  server.listen(port, '127.0.0.1', () => console.log(`Synthetic benchmark ready: http://127.0.0.1:${port}/`));
  process.once('SIGINT', () => server.close());process.once('SIGTERM', () => server.close());
}
