import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NODE_DEFS, nodeDef, searchCatalog, isStat } from '../lib/canvas/catalog.ts';
import { connectionProblem, defaultConfig, emptyDoc, parseDoc, partitionScope, preflight, runScope, serializeDoc, topoOrder, upstreamOf, REL_IN, REL_OUT } from '../lib/canvas/graph.ts';
import { runCanvas, reviewKey, hash53 } from '../lib/canvas/execute.ts';
import { emptyHistory, record, undo, redo, snapshotOf } from '../lib/canvas/history.ts';
import { autoLayout } from '../lib/canvas/layout.ts';
import { FLOW_TEMPLATES, buildTemplate } from '../lib/canvas/templates.ts';
import { DEMO_SURVEY_CSV, parseSurveyCsv } from '../lib/survey-analysis.ts';
import { filterPlanSample, runPlanNode } from '../lib/analysis-plan.ts';

// The demo CSV is the product's own teaching dataset (simulated); no real respondents.
const table = parseSurveyCsv(DEMO_SURVEY_CSV);
const sha = createHash('sha256').update(DEMO_SURVEY_CSV).digest('hex');
const workspace = { name: '示例数据', sourceHash: sha, kind: 'simulated', table, missingCodes: ['99'], lineage: [] };
const run = { workspace, files: new Map() };

let counter = 0;
const id = p => `${p}-${++counter}`;
function node(kind, config = {}, title) {
  return { id: id('n'), kind, title: title ?? nodeDef(kind).title, position: { x: 0, y: 0 }, parent: null, config: { ...defaultConfig(kind), ...config } };
}
function edge(source, target, sourcePort, targetPort) {
  return { id: id('e'), kind: 'data', source: source.id, target: target.id, sourcePort: sourcePort ?? nodeDef(source.kind).outputs[0].id, targetPort: targetPort ?? nodeDef(target.kind).inputs[0].id };
}
function doc(nodes, edges) { return { ...emptyDoc(), nodes, edges }; }

test('catalog: every kind has ports and a capability; search finds Chinese keywords', () => {
  for (const d of NODE_DEFS) { assert.ok(d.title && d.summary); assert.ok(['run', 'reference', 'note'].includes(d.capability)); if (d.capability === 'reference') assert.ok(d.section, d.kind); }
  assert.ok(searchCatalog('信度').some(d => d.kind === 'alpha'));
  assert.ok(searchCatalog('三线表').some(d => d.kind === 'chart'));
  assert.equal(searchCatalog('').length, NODE_DEFS.length);
});

test('connections are typed, single inputs stay single, and cycles are refused with a reason', () => {
  const data = node('dataset'), freq = node('frequency', { x: '渠道' }), chart = node('chart'), freq2 = node('frequency');
  const d = doc([data, freq, chart, freq2], [edge(data, freq)]);
  assert.match(connectionProblem(d, { source: data.id, sourcePort: 'data', target: chart.id, targetPort: 'result' }), /类型不匹配/);
  assert.match(connectionProblem(d, { source: data.id, sourcePort: 'data', target: freq.id, targetPort: 'data' }), /已存在|已有输入/);
  assert.equal(connectionProblem(d, { source: freq.id, sourcePort: 'result', target: chart.id, targetPort: 'result' }), null);
  assert.match(connectionProblem(d, { source: data.id, sourcePort: 'data', target: data.id, targetPort: 'data' }), /自身/);
  // filter → filter loop
  const f1 = node('filter'), f2 = node('filter');
  const loop = doc([f1, f2], [edge(f1, f2)]);
  assert.match(connectionProblem(loop, { source: f2.id, sourcePort: 'data', target: f1.id, targetPort: 'data' }), /循环/);
  // relation links only between relation handles, once per pair
  const q = node('question');
  const rel = doc([q, data], [{ id: 'r1', kind: 'relation', source: q.id, target: data.id, sourcePort: REL_OUT, targetPort: REL_IN }]);
  assert.match(connectionProblem(rel, { source: data.id, sourcePort: REL_OUT, target: q.id, targetPort: REL_IN }), /已有说明连线/);
  assert.match(connectionProblem(rel, { source: q.id, sourcePort: REL_OUT, target: data.id, targetPort: 'data' }), /关联点/);
  // review passes its input type through
  const review = node('review'), chart2 = node('chart');
  const pass = doc([freq, review, chart2], [edge(freq, review)]);
  assert.equal(connectionProblem(pass, { source: review.id, sourcePort: 'output', target: chart2.id, targetPort: 'result' }), null);
  void freq2;
});

test('run scope includes the selection plus data upstream, in topological order; preflight explains gaps', () => {
  const data = node('dataset'), f = node('filter'), freq = node('frequency'), chart = node('chart'), lone = node('numeric'), note = node('note');
  const d = doc([chart, freq, f, data, lone, note], [edge(data, f), edge(f, freq), edge(freq, chart)]);
  assert.deepEqual(runScope(d, [chart.id]), [data.id, f.id, freq.id, chart.id]);
  assert.deepEqual(new Set(runScope(d, null)), new Set([data.id, f.id, freq.id, chart.id, lone.id]));
  assert.ok(upstreamOf(d, [chart.id]).has(data.id));
  const issues = preflight(d, runScope(d, null));
  assert.ok(issues.some(i => i.nodeId === lone.id && /缺少输入/.test(i.message)));
  assert.ok(issues.some(i => i.nodeId === f.id && /筛选变量/.test(i.message)));
  assert.ok(issues.some(i => i.nodeId === freq.id && /选择变量/.test(i.message)));
  assert.equal(topoOrder(d).cyclic.length, 0);
});

test('documents parse strictly, drop unknown config keys and never carry raw rows', () => {
  const data = node('dataset', { source: 'file', fileName: 'a.csv', fileHash: sha });
  const raw = JSON.parse(JSON.stringify(doc([data], [])));
  raw.nodes[0].config.rows = [['张三', '13800000000']];
  raw.nodes[0].config.csv = DEMO_SURVEY_CSV;
  const parsed = parseDoc(raw);
  assert.equal(parsed.nodes[0].config.rows, undefined);
  assert.equal(parsed.nodes[0].config.csv, undefined);
  assert.equal(parseDoc(JSON.parse(serializeDoc(parsed))).nodes[0].config.fileHash, sha);
  assert.throws(() => parseDoc({ ...raw, schema: 'other' }), /版本/);
  assert.throws(() => parseDoc({ ...raw, nodes: [...raw.nodes, raw.nodes[0]] }), /重复/);
  assert.throws(() => parseDoc({ ...raw, edges: [{ id: 'e1', kind: 'data', source: 'x', target: 'y', sourcePort: 'a', targetPort: 'b' }] }), /不存在/);
});

test('statistics on the canvas equal the 数据分析 module exactly, including filtered branches', async () => {
  const data = node('dataset');
  const nodes = [data], edges = [], expect = [];
  const specs = [
    ['frequency', { x: '渠道' }, { method: 'frequency', x: 0, y: null }],
    ['numeric', { x: '体验清晰' }, { method: 'numeric', x: 1, y: null }],
    ['groups', { x: '渠道', y: '推荐意愿' }, { method: 'groups', x: 0, y: 4 }],
    ['crosstab', { x: '渠道', y: '推荐意愿' }, { method: 'crosstab', x: 0, y: 4 }],
    ['pearson', { x: '体验清晰', y: '推荐意愿' }, { method: 'pearson', x: 1, y: 4 }],
    ['spearman', { x: '操作方便', y: '推荐意愿' }, { method: 'spearman', x: 2, y: 4 }],
  ];
  for (const [kind, config, plan] of specs) {
    const n = node(kind, config); nodes.push(n); edges.push(edge(data, n));
    expect.push([n.id, runPlanNode(table, { id: n.id, branch: '画布', filter: null, scale: null, question: '', ...plan }, ['99'])]);
  }
  const alpha = node('alpha', { columns: ['体验清晰', '操作方便', '遇到困难_反向'], reverse: ['遇到困难_反向'], min: 1, max: 5, construct: '使用体验' });
  nodes.push(alpha); edges.push(edge(data, alpha));
  expect.push([alpha.id, runPlanNode(table, { id: alpha.id, method: 'alpha', x: null, y: null, question: '', branch: '画布', filter: null, scale: { columns: [1, 2, 3], reverse: [3], min: 1, max: 5, construct: '使用体验' } }, ['99'])]);
  // Filtered branch: 渠道 = 校园
  const f = node('filter', { column: '渠道', values: ['校园'] }), sub = node('numeric', { x: '推荐意愿' });
  nodes.push(f, sub); edges.push(edge(data, f), edge(f, sub));
  const branch = filterPlanSample(table, { column: 0, values: ['校园'] }, ['99']).table;
  expect.push([sub.id, runPlanNode(branch, { id: sub.id, method: 'numeric', x: 4, y: null, question: '', branch: '画布', filter: null, scale: null }, ['99'])]);

  const d = doc(nodes, edges);
  const states = await runCanvas(d, runScope(d, null), run);
  for (const [nid, want] of expect) {
    const s = states.get(nid);
    assert.equal(s.status, 'done', `${nid}: ${s.message}`);
    assert.deepEqual(s.output.value.result, want);
  }
  assert.equal(states.get(sub.id).output.value.dataset.lineage[0], `筛选「渠道」= 校园：保留 ${branch.rows.length} / ${table.rows.length} 行`);
});

test('a failing branch blocks only its dependents; independent branches still finish', async () => {
  const data = node('dataset'), bad = node('frequency', { x: '不存在的列' }), chart = node('chart'), good = node('frequency', { x: '渠道' });
  const d = doc([data, bad, chart, good], [edge(data, bad), edge(bad, chart), edge(data, good)]);
  const events = [];
  const states = await runCanvas(d, runScope(d, null), run, { onEvent: e => events.push(e) });
  assert.equal(states.get(bad.id).status, 'failed');
  assert.match(states.get(bad.id).message, /没有「不存在的列」列/);
  assert.equal(states.get(chart.id).status, 'blocked');
  assert.equal(states.get(good.id).status, 'done');
  // Hand-off pulses fire once per edge that actually delivered data.
  const handoffs = events.filter(e => e.type === 'handoff');
  assert.deepEqual(handoffs.map(e => e.edgeId).sort(), [d.edges[0].id, d.edges[2].id].sort());
  assert.deepEqual(events.map(e => e.seq), events.map((_, i) => i + 1));
});

test('a node that fails the check is skipped with its downstream; other branches still run', async () => {
  const data = node('dataset'), ok = node('frequency', { x: '渠道' }), bad = node('numeric'), chart = node('chart'), loose = node('crosstab', { x: '渠道', y: '推荐意愿' });
  const d = doc([data, ok, bad, chart, loose], [edge(data, ok), edge(data, bad), edge(bad, chart)]);
  const scope = runScope(d, null), issues = preflight(d, scope);
  const { run: runnable, skipped, blocked } = partitionScope(d, scope, issues);
  assert.deepEqual([...skipped.keys()].sort(), [bad.id, loose.id].sort());
  assert.deepEqual([...blocked.keys()], [chart.id]);
  assert.deepEqual(runnable, [data.id, ok.id]);
  const states = await runCanvas(d, runnable, run);
  assert.equal(states.get(ok.id).status, 'done');
  // Warnings (an unapproved review) never skip a node.
  const review = node('review');
  const d2 = doc([data, ok, review], [edge(data, ok), edge(ok, review)]);
  assert.equal(partitionScope(d2, runScope(d2, null), preflight(d2, runScope(d2, null))).skipped.size, 0);
});

test('missing workspace data fails with a clear reason instead of a placeholder result', async () => {
  const data = node('dataset'), freq = node('frequency', { x: '渠道' });
  const d = doc([data, freq], [edge(data, freq)]);
  const states = await runCanvas(d, runScope(d, null), { workspace: null, files: new Map() });
  assert.equal(states.get(data.id).status, 'failed');
  assert.match(states.get(data.id).message, /还没有载入数据/);
  assert.equal(states.get(freq.id).status, 'blocked');
  const file = node('dataset', { source: 'file', fileName: 'old.csv', fileHash: 'a'.repeat(64) });
  const s2 = await runCanvas(doc([file], []), [file.id], { workspace: null, files: new Map([[file.id, workspace]]) });
  assert.match(s2.get(file.id).message, /指纹不符/);
});

test('review gates downstream until the current input is approved, and re-asks after upstream changes', async () => {
  const data = node('dataset'), freq = node('frequency', { x: '渠道' }), review = node('review'), report = node('report');
  let d = doc([data, freq, review, report], [edge(data, freq), edge(freq, review), edge(review, report)]);
  let states = await runCanvas(d, runScope(d, null), run);
  assert.equal(states.get(review.id).status, 'waiting');
  assert.equal(states.get(report.id).status, 'blocked');
  const key = reviewKey(d, review.id, states);
  d = { ...d, nodes: d.nodes.map(n => n.id === review.id ? { ...n, config: { ...n.config, approvedHash: key, approvedAt: 'now' } } : n) };
  states = await runCanvas(d, runScope(d, null), run);
  assert.equal(states.get(review.id).status, 'done');
  assert.equal(states.get(report.id).status, 'done');
  const sections = states.get(report.id).output.value.sections;
  assert.equal(sections.length, 1);
  assert.match(sections[0].body, /教学模拟数据/);
  // Changing what the reviewer saw invalidates the approval.
  d = { ...d, nodes: d.nodes.map(n => n.id === freq.id ? { ...n, config: { ...n.config, x: '推荐意愿' } } : n) };
  states = await runCanvas(d, runScope(d, null), run);
  assert.equal(states.get(review.id).status, 'waiting');
  assert.match(states.get(review.id).message, /重新确认/);
});

test('cache reuses identical computations; titles and research prose do not invalidate numbers', async () => {
  const data = node('dataset'), freq = node('frequency', { x: '渠道', question: '甲' });
  let d = doc([data, freq], [edge(data, freq)]);
  const cache = new Map();
  const first = await runCanvas(d, runScope(d, null), run, { cache });
  assert.equal(first.get(freq.id).cached, false);
  d = { ...d, nodes: d.nodes.map(n => n.id === freq.id ? { ...n, title: '新标题', config: { ...n.config, question: '乙' } } : n) };
  const second = await runCanvas(d, runScope(d, null), run, { cache });
  assert.equal(second.get(freq.id).cached, true);
  assert.deepEqual(second.get(freq.id).output.value.result, first.get(freq.id).output.value.result);
  d = { ...d, nodes: d.nodes.map(n => n.id === freq.id ? { ...n, config: { ...n.config, x: '推荐意愿' } } : n) };
  const third = await runCanvas(d, runScope(d, null), run, { cache });
  assert.equal(third.get(freq.id).cached, false);
});

test('cancel stops before the next node and keeps finished results', async () => {
  const data = node('dataset'), a = node('frequency', { x: '渠道' }), b = node('numeric', { x: '推荐意愿' });
  const d = doc([data, a, b], [edge(data, a), edge(data, b)]);
  const controller = new AbortController();
  const states = await runCanvas(d, runScope(d, null), run, { signal: controller.signal, onState: (nid, s) => { if (nid === a.id && s.status === 'done') controller.abort(); } });
  assert.equal(states.get(a.id).status, 'done');
  assert.equal(states.get(b.id).status, 'idle');
  assert.equal(states.get(b.id).message, '已取消');
});

test('charts, joins, conclusions and reports consume upstream results honestly', async () => {
  const data = node('dataset'), freq = node('frequency', { x: '渠道' }), num = node('numeric', { x: '推荐意愿' });
  const chart = node('chart', { kind: 'pie' }), bad = node('chart', { kind: 'scatter' }), join = node('join'), concl = node('conclusion'), report = node('report');
  const d = doc([data, freq, num, chart, bad, join, concl, report], [edge(data, freq), edge(data, num), edge(freq, chart), edge(freq, bad), edge(chart, join), edge(num, join), edge(join, concl), edge(join, report)]);
  const states = await runCanvas(d, runScope(d, null), run);
  assert.equal(states.get(chart.id).output.value.kind, 'pie');
  assert.equal(states.get(bad.id).status, 'failed');
  assert.match(states.get(bad.id).message, /不能画这种统计结果，可选：柱状图/);
  assert.deepEqual(states.get(join.id).output.value.map(i => i.type), ['chart', 'result']);
  const facts = states.get(concl.id).output.value;
  assert.equal(facts.length, 2);
  assert.ok(facts.every(f => f.simulated));
  assert.match(facts[1].text, new RegExp(`有效 \\d+ / ${table.rows.length} 行`));
  // Report: frequency becomes an evidence section; numeric is reported as not supported, not invented.
  const rep = states.get(report.id).output.value;
  assert.equal(rep.sections.length, 0);
  assert.match(rep.skipped.join(), /数值描述/);
});

test('history: one entry per gesture, undo and redo restore exact snapshots', () => {
  const a = doc([node('note')], []);
  const b = { ...a, nodes: [...a.nodes, node('question')] };
  let h = record(emptyHistory(), '添加节点', snapshotOf(a));
  h = record(h, '添加节点', snapshotOf(a));
  assert.equal(h.past.length, 1);
  const u = undo(h, snapshotOf(b));
  assert.deepEqual(u.snap.nodes, a.nodes);
  const r = redo(u.history, u.snap);
  assert.deepEqual(r.snap.nodes, b.nodes);
  assert.equal(undo(emptyHistory(), snapshotOf(a)), null);
});

test('auto layout ranks data flow left to right and keeps the first node in place', () => {
  const data = node('dataset'), freq = node('frequency'), chart = node('chart');
  data.position = { x: 500, y: 300 };
  const d = doc([data, freq, chart], [edge(data, freq), edge(freq, chart)]);
  const pos = autoLayout(d);
  assert.deepEqual(pos.get(data.id), { x: 500, y: 300 });
  assert.ok(pos.get(data.id).x < pos.get(freq.id).x && pos.get(freq.id).x < pos.get(chart.id).x);
});

test('every reference flow builds valid, editable connections', () => {
  for (const t of FLOW_TEMPLATES) {
    let n = 0;
    const built = buildTemplate(t.id, p => `${p}-${t.id}-${++n}`, { x: 0, y: 0 });
    assert.ok(built.nodes.length >= 3, t.id);
    const d = doc([], []);
    d.nodes = built.nodes;
    for (const e of built.edges) {
      assert.equal(connectionProblem(d, e), null, `${t.id}: ${e.source} → ${e.target}`);
      d.edges.push(e);
    }
    assert.equal(topoOrder(d).cyclic.length, 0);
    for (const nd of built.nodes) if (isStat(nd.kind)) assert.equal(typeof nd.config.question, 'string');
  }
  assert.equal(hash53('a'), hash53('a'));
  assert.notEqual(hash53('a'), hash53('b'));
});
