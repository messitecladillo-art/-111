import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionProblem, defaultConfig, emptyDoc, parseDoc, REL_IN, REL_OUT, topoOrder } from '../lib/canvas/graph.ts';
import { applyPositions, cloneSelection, deleteSelection, pasteSelection, positionsChanged } from '../lib/canvas/operations.ts';
import { emptyHistory, record, redo, snapshotOf, undo } from '../lib/canvas/history.ts';
import { createCanvasFixture } from '../scripts/canvas-interaction-fixtures.mjs';

const node = (id, kind = 'note', position = { x: 0, y: 0 }, parent = null, config = {}) => ({ id, kind, title: id, position, parent, config: { ...defaultConfig(kind), ...config } });
const graph = (nodes = [], edges = []) => ({ ...emptyDoc(), nodes, edges });
const relation = (id, source, target) => ({ id, kind: 'relation', source, target, sourcePort: REL_OUT, targetPort: REL_IN });
const ids = () => { let count = 0; return prefix => `${prefix}-copy-${++count}`; };

test('position changes preserve untouched node identities and ignore reorder or an empty gesture', () => {
  const a = node('a'), b = node('b', 'note', { x: 90, y: 20 }), doc = graph([a, b]);
  assert.equal(applyPositions(doc, new Map()), doc);
  assert.equal(applyPositions(doc, new Map([['unknown', { x: 2, y: 5 }], ['a', { x: 0, y: 0 }]])), doc);
  const moved = applyPositions(doc, new Map([['a', { x: 40, y: 50 }]]));
  assert.notEqual(moved.nodes[0], a);
  assert.equal(moved.nodes[1], b);
  assert.deepEqual(a.position, { x: 0, y: 0 });
  assert.equal(positionsChanged(doc, moved), true);
  assert.equal(positionsChanged(doc, graph([b, a])), false);
  assert.equal(positionsChanged(doc, doc), false);
  assert.throws(() => applyPositions(doc, new Map([['a', { x: NaN, y: 0 }]])), /有效数字/);
  assert.throws(() => applyPositions(doc, new Map([['a', { x: 1e7 + 1, y: 0 }]])), /有效数字/);
});

test('one multi-node drag records one transaction, and cancellation restores positions without history', () => {
  const doc = graph([node('a'), node('b', 'note', { x: 20, y: 30 })]);
  const before = snapshotOf(doc);
  let transient = applyPositions(doc, new Map([['a', { x: 10, y: 10 }], ['b', { x: 30, y: 40 }]]));
  transient = applyPositions(transient, new Map([['a', { x: 40, y: 30 }], ['b', { x: 60, y: 60 }]]));
  const committed = positionsChanged(before, transient) ? record(emptyHistory(), '移动节点', before) : emptyHistory();
  assert.equal(committed.past.length, 1);
  assert.deepEqual(undo(committed, snapshotOf(transient)).snap, before);
  const cancel = applyPositions(transient, new Map(before.nodes.map(n => [n.id, n.position])));
  const canceledHistory = positionsChanged(before, cancel) ? record(emptyHistory(), '移动节点', before) : emptyHistory();
  assert.equal(canceledHistory.past.length, 0);
  assert.deepEqual(cancel.nodes, doc.nodes);
  assert.equal(positionsChanged(before, { ...doc, nodes: [doc.nodes[0], { ...doc.nodes[1], parent: 'new-parent' }] }), true);
});

test('deleting nodes removes incident edges and undo/redo restores exact node and edge identities', () => {
  const doc = graph([node('a'), node('b'), node('c')], [relation('ab', 'a', 'b'), relation('bc', 'b', 'c')]);
  const changed = deleteSelection(doc, ['b']);
  assert.deepEqual(changed.nodes.map(n => n.id), ['a', 'c']);
  assert.equal(changed.edges.length, 0);
  assert.equal(changed.nodes[0], doc.nodes[0]);
  assert.equal(deleteSelection(doc, ['absent'], ['missing']), doc);
  const h = record(emptyHistory(), '删除节点', snapshotOf(doc)), restored = undo(h, snapshotOf(changed));
  assert.deepEqual(restored.snap, snapshotOf(doc));
  assert.deepEqual(redo(restored.history, restored.snap).snap, snapshotOf(changed));
  assert.deepEqual(deleteSelection(doc, [], ['ab']).edges.map(e => e.id), ['bc']);
});

test('deleting a group ungroups survivors without moving them; selected members are deleted', () => {
  const group = node('group', 'group', { x: 100, y: 80 }), inner = node('inner', 'group', { x: 20, y: 30 }, 'group');
  const child = node('child', 'note', { x: 40, y: 50 }, 'inner'), sibling = node('sibling', 'note', { x: 10, y: 20 }, 'group');
  const doc = graph([group, inner, child, sibling], [relation('child-sibling', 'child', 'sibling')]);
  const out = deleteSelection(doc, ['group', 'sibling']);
  assert.deepEqual(out.nodes[0], { ...inner, parent: null, position: { x: 120, y: 110 } });
  assert.equal(out.nodes[1], child);
  assert.equal(out.edges.length, 0);
  const flattened = deleteSelection(doc, ['group', 'inner']);
  assert.deepEqual(flattened.nodes[0].position, { x: 160, y: 160 });
  assert.equal(flattened.nodes[0].parent, null);
});

test('copying a child alone detaches it at its absolute position and creates independent nested config', () => {
  const outer = node('outer', 'group', { x: 100, y: 80 }), group = node('group', 'group', { x: 10, y: 20 }, 'outer');
  const child = node('child', 'alpha', { x: 30, y: 40 }, 'group', { columns: ['Q1', 'Q2'], reverse: ['Q2'] });
  const doc = graph([outer, group, child]), clip = cloneSelection(doc, ['child', 'missing']);
  assert.equal(clip.nodes.length, 1);
  assert.equal(clip.nodes[0].parent, null);
  assert.deepEqual(clip.nodes[0].position, { x: 140, y: 140 });
  const pasted = pasteSelection(doc, clip, { x: 40, y: 20 }, ids());
  const copy = pasted.doc.nodes.at(-1);
  assert.deepEqual(copy.position, { x: 180, y: 160 });
  copy.config.columns.push('Q3');
  assert.deepEqual(child.config.columns, ['Q1', 'Q2']);
  assert.deepEqual(clip.nodes[0].config.columns, ['Q1', 'Q2']);
  assert.equal(doc.nodes.length, 3);
});

test('copying groups includes descendants and internal links, orders parents first, and resets review approval', () => {
  const group = node('group', 'group', { x: 100, y: 80 });
  const data = node('data', 'dataset', { x: 20, y: 20 }, 'group');
  const review = node('review', 'review', { x: 310, y: 20 }, 'group', { approvedHash: 'old-result', approvedAt: 'now', note: '保留复核备注' });
  const outside = node('outside');
  const edge = { id: 'data-review', kind: 'data', source: 'data', sourcePort: 'data', target: 'review', targetPort: 'input' };
  const doc = graph([review, data, outside, group], [edge, relation('out-link', 'review', 'outside')]);
  const clip = cloneSelection(doc, ['group']);
  assert.deepEqual(clip.nodes.map(n => n.id), ['group', 'review', 'data']);
  assert.equal(clip.edges.length, 1);
  const pasted = pasteSelection(doc, clip, { x: 50, y: 60 }, ids());
  const appended = pasted.doc.nodes.slice(doc.nodes.length), copyGroup = appended[0], copyReview = appended[1], copyData = appended[2];
  assert.deepEqual(copyGroup.position, { x: 150, y: 140 });
  assert.equal(copyReview.parent, copyGroup.id);
  assert.deepEqual(copyReview.position, review.position);
  assert.equal(copyReview.config.approvedHash, '');
  assert.equal(copyReview.config.approvedAt, '');
  assert.equal(copyReview.config.note, '保留复核备注');
  assert.equal(review.config.approvedHash, 'old-result');
  assert.deepEqual(pasted.doc.edges.at(-1), { ...edge, id: 'e-copy-4', source: copyData.id, target: copyReview.id });
  assert.equal(connectionProblem({ ...pasted.doc, edges: pasted.doc.edges.slice(0, -1) }, pasted.doc.edges.at(-1)), null);
  assert.deepEqual(pasted.ids, appended.map(n => n.id));
});

test('repeated paste uses distinct IDs and offsets without mutating or accumulating offsets in the clipboard', () => {
  const doc = graph([node('a'), node('b', 'note', { x: 300, y: 0 })], [relation('ab', 'a', 'b')]);
  const clip = cloneSelection(doc, ['a', 'b']), initial = structuredClone(clip), makeId = ids();
  const first = pasteSelection(doc, clip, { x: 40, y: 40 }, makeId);
  const second = pasteSelection(first.doc, clip, { x: 80, y: 80 }, makeId);
  assert.deepEqual(clip, initial);
  assert.equal(new Set(second.doc.nodes.map(n => n.id)).size, 6);
  assert.equal(new Set(second.doc.edges.map(e => e.id)).size, 3);
  assert.deepEqual(second.doc.nodes.at(-2).position, { x: 80, y: 80 });
  assert.ok(first.ids.every(id => !second.ids.includes(id)));
  assert.equal(pasteSelection(doc, { nodes: [], edges: [] }, { x: 0, y: 0 }).doc, doc);
  assert.throws(() => pasteSelection(doc, clip, { x: 0, y: 0 }, () => 'a'), /重复/);
  assert.throws(() => pasteSelection(doc, clip, { x: Infinity, y: 0 }, makeId), /有效数字/);
  assert.throws(() => pasteSelection(doc, clip, { x: 1e7, y: 0 }, makeId), /有效数字/);
});

test('copy/paste retains edge semantics while graph validation rejects wrong ports, types and data cycles', () => {
  const data = node('data', 'dataset'), stat = node('stat', 'frequency'), chart = node('chart', 'chart');
  const e1 = { id: 'ds', kind: 'data', source: 'data', sourcePort: 'data', target: 'stat', targetPort: 'data' };
  const e2 = { id: 'sc', kind: 'data', source: 'stat', sourcePort: 'result', target: 'chart', targetPort: 'result' };
  const doc = graph([data, stat, chart], [e1, e2, relation('dc', 'data', 'chart')]);
  const copy = pasteSelection(doc, cloneSelection(doc, ['data', 'stat', 'chart']), { x: 0, y: 300 }, ids());
  assert.equal(topoOrder(copy.doc).cyclic.length, 0);
  for (const e of copy.doc.edges) assert.equal(connectionProblem({ ...copy.doc, edges: copy.doc.edges.filter(x => x.id !== e.id) }, e), null);
  assert.match(connectionProblem(doc, { source: 'data', sourcePort: REL_OUT, target: 'stat', targetPort: 'data' }), /说明连线/);
  assert.match(connectionProblem(doc, { source: 'data', sourcePort: 'data', target: 'chart', targetPort: 'result' }), /类型不匹配/);
  const filters = graph([node('f1', 'filter'), node('f2', 'filter')], [{ id: 'ff', kind: 'data', source: 'f1', sourcePort: 'data', target: 'f2', targetPort: 'data' }]);
  assert.match(connectionProblem(filters, { source: 'f2', sourcePort: 'data', target: 'f1', targetPort: 'data' }), /循环/);
});

test('operations reject cyclic group structure and document capacity instead of producing broken parent references', () => {
  const bad = graph([node('a', 'group', { x: 0, y: 0 }, 'b'), node('b', 'group', { x: 0, y: 0 }, 'a')]);
  assert.throws(() => cloneSelection(bad, ['a']), /循环/);
  assert.throws(() => deleteSelection(bad, ['a']), /循环/);
  const clip = cloneSelection(graph([node('source')]), ['source']);
  const full = graph(Array.from({ length: 200 }, (_, i) => node(`full-${i}`)));
  assert.throws(() => pasteSelection(full, clip, { x: 0, y: 0 }, ids()), /200/);
  const pair = graph([node('a'), node('b')], [relation('ab', 'a', 'b')]);
  const fullEdges = { ...pair, edges: Array.from({ length: 500 }, (_, i) => relation(`full-edge-${i}`, 'a', 'b')) };
  assert.throws(() => pasteSelection(fullEdges, cloneSelection(pair, ['a', 'b']), { x: 0, y: 0 }, ids()), /500/);
});

test('import rejects self-parent and nested groups, normalizing valid children after their parent without moving them', () => {
  assert.throws(() => parseDoc(graph([node('self', 'group', { x: 10, y: 20 }, 'self')])), /自身编组/);
  assert.throws(() => parseDoc(graph([node('a', 'group', { x: 0, y: 0 }, 'b'), node('b', 'group', { x: 0, y: 0 }, 'a')])), /不支持嵌套/);
  assert.throws(() => parseDoc(graph([node('outer', 'group'), node('inner', 'group', { x: 10, y: 10 }, 'outer')])), /不支持嵌套/);
  const group = node('group', 'group', { x: 100, y: 200 }), child = node('child', 'note', { x: 10, y: 20 }, 'group'), outside = node('outside');
  const imported = parseDoc(graph([child, outside, group], [relation('child-outside', 'child', 'outside')]));
  assert.deepEqual(imported.nodes.map(n => n.id), ['group', 'child', 'outside']);
  assert.deepEqual(imported.nodes[1].position, child.position);
  assert.deepEqual(imported.edges, [relation('child-outside', 'child', 'outside')]);
});

test('desktop fixtures have exact 50/80 and 200/500 sizes and valid typed, acyclic data edges', () => {
  for (const [preset, nodeCount, edgeCount] of [['daily', 50, 80], ['stress', 200, 500]]) {
    const doc = createCanvasFixture(preset);
    assert.equal(doc.nodes.length, nodeCount);
    assert.equal(doc.edges.length, edgeCount);
    assert.deepEqual(createCanvasFixture(preset), doc);
    assert.deepEqual(parseDoc(doc), doc);
    assert.ok(doc.edges.some(e => e.kind === 'data'));
    assert.ok(doc.edges.some(e => e.kind === 'relation'));
    assert.equal(topoOrder(doc).cyclic.length, 0);
    for (const e of doc.edges) assert.equal(connectionProblem({ ...doc, edges: doc.edges.filter(x => x.id !== e.id) }, e), null);
    assert.equal(JSON.stringify(doc).includes('rows'), false);
  }
  assert.throws(() => createCanvasFixture('unsupported'), /未知压力图/);
});
