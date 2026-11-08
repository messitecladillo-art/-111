import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTIFACT_LIMITS,
  artifactHash,
  captureArtifacts,
  collectReportArtifacts,
  emptyArtifactLibrary,
  mergeArtifacts,
  readArtifactLibrary,
  applyArtifactToReport,
  validateArtifactLibrary,
  verifyArtifactLibrary,
  sectionRevisionArtifact,
} from '../lib/agent/artifact-library.ts';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { defaultProjectVisualStyle, figureFromResult } from '../lib/report-figure.ts';
import { snapshotRecipe } from '../lib/research-quality.ts';
import { emptyReference } from '../lib/references.ts';
import { SIMULATED_MARK } from '../lib/report-placement.ts';
import { approveReportFrame,createReportFrame } from '../lib/report-frame.ts';
import { prepareSectionRevision,proposalFromReceipt } from '../lib/agent/section-revision.ts';

const capturedAt = '2026-11-09T00:00:00Z';
const block = (kind, text, patch = {}) => ({ id: `source-${kind}`, kind, text, evidenceId: '', valueColumn: 1, ...patch });
const seed = (value, patch = {}) => ({ familyId: 'section:source', kind: 'text', title: '源成果', origin: '软件测试', status: 'stored', classification: 'unclassified', value, ...patch });
const textSeed = (patch = {}, options = {}) => seed({ type: 'text', section: { id: 'source-section', title: '源章节', body: '已确认段落。', source: '原始来源定位：第3页。', ...patch } }, options);
const formulaSeed = () => seed({ type: 'block', block: block('formula', 'y = x + 1') }, { familyId: 'formula:source', kind: 'formula' });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function recordOf(input) {
  return mergeArtifacts(emptyArtifactLibrary(), [{ seed: input, hash: await artifactHash(input.value) }], capturedAt).records[0];
}
async function resultFixture({ classification = 'public', firstCount = 7 } = {}) {
  return snapshotRecipe({ method: 'frequency', interpretation: '仅作软件测试', n: 10, total: 10, excluded: 0, missingRows: 0, invalidRows: 0, headers: ['类别', '人数'], rows: [['甲', firstCount], ['乙', 10 - firstCount]], metrics: [], warnings: [] }, { title: '软件测试分布', sourceName: '合成软件测试夹具', sourceUrl: '', sourceHash: 'a'.repeat(64), classification }, 'fixture-result');
}
function withResult(result) {
  return parseEditorContent({ ...createEditorContent(), version: 2, quality: { version: 1, results: [result], findings: [] } });
}

// Minimal transaction stub for the capture boundary only; it does not model browser tab scheduling or quota behavior.
function memoryIndexedDB() {
  const data = new Map();
  return {
    data,
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          close() {},
          transaction() {
            let aborted = false;
            const pending = new Map();
            const tx = {
              abort() { aborted = true; },
              objectStore() {
                return {
                  put(value, key) { pending.set(key, structuredClone(value)); },
                  get(key) {
                    const get = {};
                    queueMicrotask(() => {
                      get.result = structuredClone(data.get(key));
                      get.onsuccess?.();
                      queueMicrotask(() => {
                        if (aborted) return tx.onabort?.();
                        for (const [pendingKey, value] of pending) data.set(pendingKey, value);
                        tx.oncomplete?.();
                      });
                    });
                    return get;
                  },
                };
              },
            };
            return tx;
          },
        };
        request.onsuccess?.();
      });
      return request;
    },
  };
}

test('default report capture creates no phantom cover, text, illustration or chart', () => {
  const content = createEditorContent(), before = structuredClone(content);
  assert.deepEqual(collectReportArtifacts(content, '首次打开', 'stored'), []);
  assert.deepEqual(collectReportArtifacts(content, '手动采集', 'stored', true), []);
  assert.deepEqual(content, before);
});

test('authored paragraph blocks are captured even when the section body is empty, and the capture is detached', () => {
  const original = createEditorContent();
  const content = parseEditorContent({ ...original, version: 2, quality: { version: 1, results: [], findings: [] }, report: original.report.map((section, index) => index === 1 ? { ...section, body: '', blocks: [block('paragraph', '只存在于内容块的正文。')] } : section) });
  const before = structuredClone(content);
  assert.deepEqual(collectReportArtifacts(content, '自动', 'adopted', false), []);
  const captured = collectReportArtifacts(content, '手动', 'stored', true);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].familyId, 'section:section-2');
  assert.deepEqual(captured[0].value.section, content.report[1]);
  assert.deepEqual(content, before);
  content.report[1].blocks[0].text = '后续修改';
  assert.equal(captured[0].value.section.blocks[0].text, '只存在于内容块的正文。');
});

test('collect keeps real figure, standalone table and formula identities without duplicating a figure-backed block', async () => {
  const result = await resultFixture(), figure = figureFromResult(result, 'bar', 1, 'shared-figure');
  const base = withResult(result);
  const content = parseEditorContent({ ...base, version: 3, figures: [figure], visualStyle: defaultProjectVisualStyle(), report: base.report.map((section, index) => index === 1 ? { ...section, blocks: [block('chart', '共享图', { id: 'shared-placement', evidenceId: result.id, figureId: figure.id }), block('table', '独立表', { evidenceId: result.id }), block('formula', 'y = x + 1')] } : section) });
  const before = structuredClone(content), captured = collectReportArtifacts(content, '现有报告', 'adopted');
  assert.deepEqual(captured.map(item => item.familyId), ['figure:shared-figure', 'block:section-2:source-table', 'block:section-2:source-formula']);
  assert.deepEqual(captured.map(item => item.kind), ['chart', 'table', 'formula']);
  assert.equal(captured[0].value.result.resultHash, result.resultHash);
  assert.deepEqual(captured[0].value.visualStyle, content.visualStyle);
  assert.deepEqual(content, before);
  captured[0].value.result.rows[0][1] = 0;
  assert.equal(content.quality.results[0].rows[0][1], 7);
});

test('capture freezes all seed values before asynchronous hashing, so caller edits cannot mismatch stored bytes and hash', async t => {
  const idb = memoryIndexedDB(), previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, writable: true, value: idb });
  const input = [textSeed()], expectedValue = structuredClone(input[0].value), expectedHash = await artifactHash(expectedValue);
  const entered = deferred(), release = deferred(), realDigest = crypto.subtle.digest.bind(crypto.subtle);
  t.mock.method(crypto.subtle, 'digest', async (...args) => { entered.resolve(); await release.promise; return realDigest(...args); });
  try {
    const saving = captureArtifacts('scope:one', input);
    await entered.promise;
    input[0].value.section.body = '用户在哈希等待期间继续编辑。';
    input[0].title = '修改后的标题';
    input.push(formulaSeed());
    release.resolve();
    const library = await saving;
    assert.equal(library.records.length, 1);
    assert.deepEqual(library.records[0].value, expectedValue);
    assert.equal(library.records[0].title, '源成果');
    assert.equal(library.records[0].hash, expectedHash);
    assert.equal(await artifactHash(library.records[0].value), library.records[0].hash);
    assert.deepEqual(await readArtifactLibrary('scope:one'), library);
  } finally {
    release.resolve();
    if (previous) Object.defineProperty(globalThis, 'indexedDB', previous);
    else delete globalThis.indexedDB;
  }
});

test('merge deduplicates repeated or hidden versions, keeps history and increments only the changed family', async () => {
  const first = textSeed(), hash = await artifactHash(first.value);
  const initial = mergeArtifacts(emptyArtifactLibrary(), [{ seed: first, hash }], capturedAt);
  const hidden = { ...initial, records: initial.records.map(record => ({ ...record, archived: true })) };
  assert.equal(mergeArtifacts(hidden, [{ seed: first, hash }], '2026-11-10T00:00:00Z'), hidden);
  const second = textSeed({ body: '同一成果的新版本。' }), sibling = formulaSeed(), before = structuredClone(hidden);
  const next = mergeArtifacts(hidden, [{ seed: second, hash: await artifactHash(second.value) }, { seed: sibling, hash: await artifactHash(sibling.value) }], '2026-11-10T00:00:00Z');
  assert.equal(next.revision, hidden.revision + 1);
  assert.deepEqual(next.records[0], hidden.records[0]);
  assert.deepEqual(next.records.map(record => [record.familyId, record.version]), [['section:source', 1], ['section:source', 2], ['formula:source', 1]]);
  assert.equal(new Set(next.records.map(record => record.id)).size, 3);
  assert.deepEqual(hidden, before);
  second.value.section.body = '采集后的外部修改';
  assert.equal(next.records[1].value.section.body, '同一成果的新版本。');
});

test('adoption promotes a stored version without duplicating or rewriting its original value and provenance', async () => {
  const input = textSeed(), hash = await artifactHash(input.value), initial = mergeArtifacts(emptyArtifactLibrary(), [{ seed: input, hash }], capturedAt), before = structuredClone(initial);
  const adopted = mergeArtifacts(initial, [{ seed: { ...input, status: 'adopted', origin: '后续入口' }, hash }], '2026-11-10T00:00:00Z');
  assert.equal(adopted.records.length, 1);
  assert.deepEqual(adopted.records[0], { ...initial.records[0], status: 'adopted' });
  assert.equal(mergeArtifacts(adopted, [{ seed: input, hash }], capturedAt), adopted);
  assert.deepEqual(initial, before);
});

test('record capacity failure preserves every existing version instead of evicting or partly adding records', () => {
  const items = Array.from({ length: ARTIFACT_LIMITS.records }, (_, index) => ({ seed: seed({ type: 'block', block: block('formula', 'y = x') }, { familyId: `formula:${index}`, kind: 'formula' }), hash: 'a'.repeat(64) }));
  const full = mergeArtifacts(emptyArtifactLibrary(), items, capturedAt), before = structuredClone(full);
  assert.equal(full.records.length, ARTIFACT_LIMITS.records);
  assert.throws(() => mergeArtifacts(full, [{ seed: formulaSeed(), hash: 'b'.repeat(64) }], capturedAt), /空间已满/u);
  assert.deepEqual(full, before);
  assert.equal(mergeArtifacts(full, [items[0]], capturedAt), full, 'a duplicate capture remains usable at capacity');
});

test('using a standalone formula upgrades v1 at the exact target while preserving other sections and source input', async () => {
  const content = createEditorContent(), record = await recordOf(formulaSeed()), before = structuredClone(content), recordBefore = structuredClone(record);
  const next = applyArtifactToReport(content, record, 'section-2');
  assert.equal(next.version, 2);
  assert.deepEqual(next.quality, { version: 1, results: [], findings: [] });
  assert.deepEqual(next.report[1].blocks, [{ ...record.value.block, id: `artifact-${record.id}` }]);
  assert.equal(next.report[1].body, content.report[1].body);
  assert.equal(next.report[1].source, content.report[1].source);
  assert.deepEqual(next.report.filter(section => section.id !== 'section-2'), content.report.filter(section => section.id !== 'section-2'));
  assert.deepEqual(next.slides, content.slides);
  assert.deepEqual(parseEditorContent(next), next);
  assert.deepEqual(content, before);
  assert.deepEqual(record, recordBefore);
});

test('missing, removed or title-only targets fail rather than silently placing into another section', async () => {
  const content = createEditorContent(), record = await recordOf(formulaSeed()), before = structuredClone(content);
  for (const target of [null, 'removed-section', content.report[1].title]) assert.throws(() => applyArtifactToReport(content, record, target), /选择目标章节/u);
  assert.deepEqual(content, before);
});

test('simulated figure reuse retains its result and style, marks only the target and is idempotent', async () => {
  const result = await resultFixture({ classification: 'simulated' }), figure = figureFromResult(result, 'bar', 1, 'stored-figure');
  const record = await recordOf(seed({ type: 'figure', figure, result, visualStyle: defaultProjectVisualStyle() }, { familyId: 'figure:stored-figure', kind: 'chart', classification: 'simulated' }));
  const original = createEditorContent(), before = structuredClone(original), recordBefore = structuredClone(record);
  const next = applyArtifactToReport(original, record, 'section-3');
  assert.equal(next.version, 3);
  assert.deepEqual(next.quality.results, [result]);
  assert.deepEqual(next.figures, [figure]);
  assert.deepEqual(next.visualStyle, record.value.visualStyle);
  assert.equal(next.report[2].body, `${SIMULATED_MARK}\n${original.report[2].body}`);
  assert.equal(next.report[2].blocks[0].figureId, figure.id);
  assert.deepEqual(next.report.filter(section => section.id !== 'section-3'), original.report.filter(section => section.id !== 'section-3'));
  assert.equal(applyArtifactToReport(next, record, 'section-3'), next);
  assert.equal(next.report[2].body.split(SIMULATED_MARK).length - 1, 1);
  assert.equal(next.report[2].blocks.length, 1);
  assert.deepEqual(original, before);
  assert.deepEqual(record, recordBefore);
});

test('a changed result with the same identity rejects both old block and figure reuse without altering the report', async () => {
  const oldResult = await resultFixture(), currentResult = await resultFixture({ firstCount: 6 });
  assert.notEqual(oldResult.resultHash, currentResult.resultHash);
  const content = withResult(currentResult), before = structuredClone(content);
  const values = [{ type: 'block', block: block('table', '旧表', { evidenceId: oldResult.id }), result: oldResult }, { type: 'figure', figure: figureFromResult(oldResult, 'bar', 1, 'old-figure'), result: oldResult, visualStyle: defaultProjectVisualStyle() }];
  for (const value of values) {
    const record = await recordOf(seed(value, { kind: value.type === 'figure' ? 'chart' : 'table' }));
    assert.throws(() => applyArtifactToReport(content, record, 'section-2'), /分析依据已更新/u);
  }
  assert.deepEqual(content, before);
});

test('text with dangling chart, table or reference tokens, or stale result fingerprints, is rejected atomically', async () => {
  const content = createEditorContent(), before = structuredClone(content);
  for (const token of ['[[图:missing-chart]]', '[[表:missing-table]]', '[[引:missing-reference]]']) {
    const record = await recordOf(textSeed({ body: `详见${token}。` }));
    assert.throws(() => applyArtifactToReport(content, record, 'section-2'), /文字引用的图表或文献/u);
  }
  const input = textSeed();
  input.value.resultHashes = { 'missing-result': 'b'.repeat(64) };
  const staleRecord = await recordOf(input);
  assert.throws(() => applyArtifactToReport(content, staleRecord, 'section-2'), /分析结果已变化/u);
  assert.deepEqual(content, before);
});

test('text reuse keeps valid citations and both source trails, preserves siblings and never duplicates on repeated Use', async () => {
  const result = await resultFixture(), base = withResult(result), reference = { ...emptyReference('other'), id: 'ref-a', text: '软件测试文献定位' };
  const content = parseEditorContent({ ...base, references: [reference], report: base.report.map((section, index) => index === 0 ? { ...section, blocks: [block('chart', '现有图', { id: 'existing-chart', evidenceId: result.id }), block('table', '现有表', { id: 'existing-table', evidenceId: result.id })] } : index === 1 ? { ...section, source: '目标原有来源。' } : section) });
  const input = textSeed({ body: '参见[[图:existing-chart]]、[[表:existing-table]]和[[引:ref-a]]。', blocks: [block('paragraph', '补充结论。')] }, { classification: 'public' });
  input.value.resultHashes = { [result.id]: result.resultHash };
  const record = await recordOf(input), before = structuredClone(content), recordBefore = structuredClone(record);
  const next = applyArtifactToReport(content, record, 'section-2');
  assert.equal(next.report[1].body, content.report[1].body);
  assert.equal(next.report[1].source, `${content.report[1].source}\n${input.value.section.source}`);
  assert.equal(next.report[1].blocks[0].text, `${input.value.section.body}\n补充结论。`);
  assert.deepEqual(next.report.filter(section => section.id !== 'section-2'), content.report.filter(section => section.id !== 'section-2'));
  assert.deepEqual(next.references, content.references);
  assert.deepEqual(next.quality, content.quality);
  assert.deepEqual(next.slides, content.slides);
  assert.equal(applyArtifactToReport(next, record, 'section-2'), next);
  assert.deepEqual(content, before);
  assert.deepEqual(record, recordBefore);
});

test('restoration rejects remote images and stale content fingerprints without changing saved records',async()=>{
 const record=await recordOf(textSeed()),library={schema:'ArtifactLibrary/v1',revision:1,records:[record]};validateArtifactLibrary(library);await verifyArtifactLibrary(library);
 const tampered=structuredClone(library);tampered.records[0].value.section.body='未重新登记的变动';await assert.rejects(verifyArtifactLibrary(tampered),/素材指纹/);assert.equal(library.records[0].value.section.body,'已确认段落。');
 const bad=await recordOf(seed({type:'file',name:'remote.png',mime:'image/png',dataUrl:'https://example.invalid/private.png'},{kind:'diagram'}));assert.throws(()=>validateArtifactLibrary({...library,records:[bad]}));
});

test('rehashed artifacts still reject result payload changes under an unchanged analysis fingerprint',async()=>{
 const result=await resultFixture(),figure=figureFromResult(result,'bar',1,'verified-figure');const record=await recordOf(seed({type:'figure',figure,result,visualStyle:defaultProjectVisualStyle()},{kind:'chart'}));record.value.result.rows[0][1]=999;record.hash=await artifactHash(record.value);
 await assert.rejects(verifyArtifactLibrary({schema:'ArtifactLibrary/v1',revision:1,records:[record]}),/分析结果指纹/);
});

test('approved frame initializes a missing palette, while another project palette requires explicit reconciliation',async()=>{
 const frame=await approveReportFrame(createReportFrame(defaultProjectVisualStyle()),'software-reviewer'),record=await recordOf(seed({type:'frame',frame},{familyId:'frame',kind:'frame'}));const original=createEditorContent();const next=applyArtifactToReport(original,record,null);assert.equal(next.visualStyle.paletteId,frame.palette.id);assert.equal(next.visualStyle.version,frame.palette.version);assert.deepEqual(next.report,original.report);
 assert.throws(()=>applyArtifactToReport({...next,visualStyle:{...next.visualStyle,version:next.visualStyle.version+1}},record,null),/统一项目配色/);
});

test('section candidate retains returned prose and exact original basis, never another chapter',async()=>{
 const report=withResult(await resultFixture());report.report[1].body='本节原文';report.report[2].body='不应进入候选的另一节';report.report[1].source='第2页';const prepared=prepareSectionRevision({content:report,version:2,inputVersion:'input-1'},report.report[1].id,null,{owner:'software-owner',epoch:1,project:'p',thread:'t'},{id:'s',revision:1});
 const proposal=proposalFromReceipt(prepared,{id:prepared.request.idempotencyKey,node:'section.revision',status:'ready',paragraphs:[{text:'实际已返回的候选文字',facts:[]}],droppedParagraphs:0,usage:null,errorCode:null});const retained=sectionRevisionArtifact(proposal);assert.equal(retained.value.section.body,'实际已返回的候选文字');assert.equal(retained.value.section.source,'第2页');assert.equal(retained.status,'candidate');assert.equal(retained.value.resultHashes[report.quality.results[0].id],report.quality.results[0].resultHash);assert.ok(!JSON.stringify(retained).includes('不应进入候选的另一节'));
});
