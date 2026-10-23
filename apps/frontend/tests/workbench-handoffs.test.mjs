import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkbenchHandoffs } from '../lib/workbench-handoffs.ts';
import { newQuestionnaire } from '../lib/questionnaire.ts';
import { parseSurveyCsv } from '../lib/survey-analysis.ts';
import { runRecipe } from '../lib/analysis-recipes.ts';
import { snapshotRecipe, verifyResearchQuality } from '../lib/research-quality.ts';

function store(scope = 'project-a') {
  let delivery = 0;
  return createWorkbenchHandoffs(scope, { makeId: () => `${scope}-delivery-${++delivery}` });
}
function designSnapshot() {
  return { design: newQuestionnaire(), pending: true, editRevision: 3, topicBinding: null, topicRestoreOrigin: null };
}
function datasetValue() {
  return {
    name: '合成数据', sourceHash: 'a'.repeat(64), kind: 'simulated',
    table: parseSurveyCsv('类别,评分\n甲,1\n乙,2\n甲,3'),
    missingCodes: ['99'], lineage: ['合成测试数据；没有真实受访者'],
  };
}
function channelPayloads() {
  return {
    design: { id: 'design-business-id', snapshot: designSnapshot() },
    dataset: {
      id: 'dataset-business-id', name: '合成质控结果', csv: '类别,评分\n甲,1\n乙,2',
      origin: {
        kind: 'quality', parentName: '合成数据', parentHash: 'a'.repeat(64),
        simulated: true, silicon: false, removed: 1, ledgerHash: 'b'.repeat(64),
        rules: ['合成规则'], missingCodes: ['99'],
      },
    },
    brief: {
      id: 'brief-business-id',
      input: {
        title: '拟议研究', problem: '合成测试问题', decisionOwner: '待确认',
        population: '拟调查群体', geography: '武汉', stage: 'intake', evidenceStatus: 'proposed',
      },
    },
    questionnaire: {
      id: 'questionnaire-business-id', serviceId: 'service-a', serviceRevision: 2,
      model: 'test-model', design: newQuestionnaire(),
    },
    result: {
      id: 'result-business-id', title: '合成结果', sourceName: '合成数据', sourceUrl: '',
      sourceHash: 'a'.repeat(64), resultHash: 'b'.repeat(64), classification: 'simulated',
      method: 'frequency', n: 3, total: 3, headers: ['类别', '频数'],
      rows: [['甲', 2], ['乙', 1]], metrics: [{ label: '样本量', value: 3 }], warnings: ['合成测试'],
    },
    report: {
      id: 'report-business-id',
      section: {
        id: 'section-business-id', title: '合成章节', body: '拟议内容', source: '合成测试',
        blocks: [{ id: 'block-a', kind: 'paragraph', text: '合成正文', evidenceId: '', valueColumn: 1 }],
        findingIds: ['finding-a'], findingSnapshots: { 'finding-a': 'unchanged-evidence' },
      },
    },
  };
}
function assertDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

test('an idle store has stable immutable snapshots and null setters do not notify', () => {
  const handoffs = store(), initial = handoffs.getSnapshot();
  let notifications = 0;
  handoffs.subscribe(() => { notifications++; });
  assert.deepEqual(initial, {
    scope: 'project-a', design: null, dataset: null,
    pending: { design: null, dataset: null, brief: null, questionnaire: null, result: null, report: null },
  });
  handoffs.setDesign(null);
  handoffs.setDataset(null);
  assert.equal(handoffs.getSnapshot(), initial);
  assert.equal(notifications, 0);
  assertDeepFrozen(initial);
});

for (const channel of Object.keys(channelPayloads())) {
  test(`${channel}: publishing A then B makes the old acknowledgement harmless`, () => {
    const handoffs = store(), payload = channelPayloads()[channel], observed = [];
    handoffs.subscribe(() => observed.push(handoffs.getSnapshot()));
    const a = handoffs.publish(channel, payload);
    const afterA = handoffs.getSnapshot();
    // Re-sending even the same object/business ID is a new delivery.
    const b = handoffs.publish(channel, payload);
    const afterB = handoffs.getSnapshot();
    assert.notEqual(a, b);
    assert.notEqual(afterA, afterB);
    assert.equal(afterB.pending[channel].payload.id, payload.id);
    assert.deepEqual(afterB.pending[channel].payload, payload);
    assert.notEqual(afterB.pending[channel].payload, payload);
    assert.equal(handoffs.acknowledge(channel, a), false);
    assert.equal(handoffs.getSnapshot(), afterB);
    assert.equal(handoffs.getSnapshot().pending[channel].deliveryId, b);
    assert.equal(handoffs.acknowledge(channel, payload.id), false);
    assert.equal(handoffs.acknowledge(channel, b), true);
    const cleared = handoffs.getSnapshot();
    assert.equal(cleared.pending[channel], null);
    assert.equal(handoffs.acknowledge(channel, b), false);
    assert.equal(handoffs.getSnapshot(), cleared);
    assert.equal(afterA.pending[channel].deliveryId, a);
    assert.equal(afterB.pending[channel].deliveryId, b);
    assert.equal(observed.length, 3);
    assert.deepEqual(observed, [afterA, afterB, cleared]);
    assertDeepFrozen(afterB);
  });
}

test('acknowledging an empty, wrong or unknown channel leaves every delivery unchanged', () => {
  const handoffs = store(), payloads = channelPayloads();
  const design = handoffs.publish('design', payloads.design);
  const dataset = handoffs.publish('dataset', payloads.dataset);
  const current = handoffs.getSnapshot();
  let notifications = 0;
  handoffs.subscribe(() => { notifications++; });
  for (const [channel, id] of [
    ['brief', design], ['brief', undefined], ['brief', null], ['brief', ''],
    ['dataset', design], ['design', dataset],
    ['design', 'missing-id'], ['missing-channel', design], ['__proto__', design],
  ]) assert.equal(handoffs.acknowledge(channel, id), false);
  assert.equal(handoffs.getSnapshot(), current);
  assert.equal(notifications, 0);
  assert.equal(handoffs.acknowledge('design', design), true);
  assert.equal(handoffs.getSnapshot().pending.dataset, current.pending.dataset);
  assert.equal(notifications, 1);
});

test('all payloads are detached from producer objects and nested receivers cannot mutate them', () => {
  const handoffs = store(), payloads = channelPayloads(), expected = structuredClone(payloads);
  for (const [channel, payload] of Object.entries(payloads)) handoffs.publish(channel, payload);
  payloads.design.snapshot.design.questions[0].choices[0].label = 'later design edit';
  payloads.dataset.origin.rules.push('later rule');
  payloads.brief.input.population = 'later population';
  payloads.questionnaire.design.questions[0].text = 'later question';
  payloads.result.rows[0][1] = 999;
  payloads.result.metrics[0].value = 999;
  payloads.report.section.blocks[0].text = 'later report edit';
  payloads.report.section.findingSnapshots['finding-a'] = 'later evidence';
  const snapshot = handoffs.getSnapshot();
  for (const channel of Object.keys(payloads)) assert.deepEqual(snapshot.pending[channel].payload, expected[channel]);
  assertDeepFrozen(snapshot);
  assert.throws(() => { snapshot.pending.design.payload.snapshot.design.questions[0].choices[0].label = 'mutate'; }, TypeError);
  assert.throws(() => snapshot.pending.dataset.payload.origin.rules.push('mutate'), TypeError);
  assert.throws(() => { snapshot.pending.result.payload.rows[0][1] = 999; }, TypeError);
  assert.throws(() => { snapshot.pending.report.payload.section.findingSnapshots['finding-a'] = 'mutate'; }, TypeError);
  assert.equal(Object.isFrozen(payloads.design), false);
  assert.equal(Object.isFrozen(payloads.result.rows), false);
});

test('design and dataset snapshots detach inputs and only affect their own fields', () => {
  const handoffs = store(), design = designSnapshot(), dataset = datasetValue();
  const expectedDesign = structuredClone(design), expectedDataset = structuredClone(dataset);
  handoffs.publish('brief', channelPayloads().brief);
  const pending = handoffs.getSnapshot().pending;
  let notifications = 0;
  handoffs.subscribe(() => { notifications++; });
  handoffs.setDesign(design);
  const afterDesign = handoffs.getSnapshot();
  handoffs.setDataset(dataset);
  const current = handoffs.getSnapshot();
  assert.equal(current.pending, pending);
  assert.equal(current.design, afterDesign.design);
  design.design.questions[0].choices[0].label = 'edited later';
  dataset.table.rows[0][1] = '999';
  dataset.missingCodes.push('100');
  dataset.lineage.push('edited later');
  assert.deepEqual(current.design, expectedDesign);
  assert.deepEqual(current.dataset, expectedDataset);
  assertDeepFrozen(current);
  assert.throws(() => current.dataset.table.rows.push(['丙', '4']), TypeError);
  handoffs.setDesign(current.design);
  handoffs.setDataset(current.dataset);
  assert.equal(handoffs.getSnapshot(), current);
  assert.equal(notifications, 2);
  handoffs.setDesign(null);
  handoffs.setDataset(null);
  const cleared = handoffs.getSnapshot();
  handoffs.setDesign(null);
  handoffs.setDataset(null);
  assert.equal(handoffs.getSnapshot(), cleared);
  assert.equal(cleared.pending, pending);
  assert.equal(notifications, 4);
  assert.deepEqual(current.design, expectedDesign);
  assert.deepEqual(current.dataset, expectedDataset);
});

test('workbench instances isolate scopes, acknowledgements, snapshots and subscriptions', () => {
  const a = store('project-a'), b = store('project-b'), secondA = store('project-a');
  const bInitial = b.getSnapshot(), secondAInitial = secondA.getSnapshot();
  let bNotifications = 0;
  b.subscribe(() => { bNotifications++; });
  const aId = a.publish('design', channelPayloads().design);
  a.setDesign(designSnapshot());
  a.setDataset(datasetValue());
  assert.equal(b.getSnapshot(), bInitial);
  assert.equal(secondA.getSnapshot(), secondAInitial);
  const bId = b.publish('design', channelPayloads().design);
  const bCurrent = b.getSnapshot();
  assert.equal(b.acknowledge('design', aId), false);
  assert.equal(a.acknowledge('design', bId), false);
  assert.equal(a.acknowledge('design', aId), true);
  assert.equal(b.getSnapshot(), bCurrent);
  assert.equal(bNotifications, 1);
  assert.equal(bCurrent.design, null);
  assert.equal(bCurrent.dataset, null);
  assert.equal(secondA.getSnapshot(), secondAInitial);
});

test('a real analysis result from synthetic input retains its evidence hash and exact numbers', async () => {
  const handoffs = store(), dataset = datasetValue();
  const calculated = runRecipe(dataset.table, { id: 'recipe-a', method: 'frequency', x: 0, y: null, question: '合成类别分布' }, []);
  const result = await snapshotRecipe(calculated, {
    title: '合成数据实际计算结果', sourceName: dataset.name, sourceUrl: '',
    sourceHash: dataset.sourceHash, classification: 'simulated',
  });
  const expected = structuredClone(result);
  handoffs.publish('result', result);
  const received = handoffs.getSnapshot().pending.result.payload;
  assert.deepEqual(received, expected);
  assert.equal(received.n, 3);
  assert.equal(received.resultHash, result.resultHash);
  await verifyResearchQuality({ version: 1, results: [received], findings: [] });
  result.rows[0][1] = 999;
  assert.deepEqual(received, expected);
});

test('a 200000-cell synthetic dataset and its CSV transfer are retained without truncation', () => {
  const handoffs = store(), columns = 40, rows = 5000;
  const table = {
    headers: Array.from({ length: columns }, (_, i) => `Q${i + 1}`),
    rows: Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => String((r + c) % 7))),
    skippedBlankLines: 0, delimiter: ',', columnLabels: { Q1: '合成首列', Q40: '合成末列' },
  };
  const dataset = { ...datasetValue(), table };
  const csv = [table.headers.join(','), ...table.rows.map(row => row.join(','))].join('\n');
  const transfer = { id: 'large-data-business-id', name: dataset.name, csv, origin: { kind: 'silicon' } };
  handoffs.setDataset(dataset);
  handoffs.publish('dataset', transfer);
  const snapshot = handoffs.getSnapshot();
  assert.deepEqual(snapshot.dataset, dataset);
  assert.equal(snapshot.dataset.table.rows.length, rows);
  assert.equal(snapshot.dataset.table.rows[rows - 1].length, columns);
  assert.equal(snapshot.pending.dataset.payload.csv, csv);
  assertDeepFrozen(snapshot);
  dataset.table.rows[rows - 1][columns - 1] = 'later change';
  transfer.csv = 'later change';
  assert.equal(snapshot.dataset.table.rows[rows - 1][columns - 1], String((rows - 1 + columns - 1) % 7));
  assert.equal(snapshot.pending.dataset.payload.csv, csv);
});

test('unsubscribe is idempotent and subscribers see the committed stable snapshot once', () => {
  const handoffs = store(), seen = [], second = [];
  const unsubscribe = handoffs.subscribe(() => {
    const current = handoffs.getSnapshot();
    assert.equal(handoffs.getSnapshot(), current);
    seen.push(current);
  });
  const unsubscribeSecond = handoffs.subscribe(() => second.push(handoffs.getSnapshot()));
  const id = handoffs.publish('brief', channelPayloads().brief);
  unsubscribe();
  unsubscribe();
  handoffs.setDesign(designSnapshot());
  handoffs.acknowledge('brief', id);
  unsubscribeSecond();
  handoffs.setDataset(datasetValue());
  assert.equal(seen.length, 1);
  assert.equal(second.length, 3);
  assert.equal(seen[0], second[0]);
  assert.notEqual(second[0], second[1]);
  assert.notEqual(second[1], second[2]);
});

test('failed copying or an unknown publish channel leaves the snapshot and listeners unchanged', () => {
  const handoffs = store(), initial = handoffs.getSnapshot();
  let notifications = 0;
  handoffs.subscribe(() => { notifications++; });
  assert.throws(() => handoffs.publish('brief', { ...channelPayloads().brief, uncloneable: () => {} }), { name: 'DataCloneError' });
  assert.throws(() => handoffs.setDataset({ ...datasetValue(), uncloneable: () => {} }), { name: 'DataCloneError' });
  assert.throws(() => handoffs.publish('__proto__', channelPayloads().brief), /Unknown workbench handoff channel/);
  assert.equal(handoffs.getSnapshot(), initial);
  assert.equal(notifications, 0);
});

test('the default ID factory generates distinct delivery IDs without changing business IDs', () => {
  const handoffs = createWorkbenchHandoffs('default-id-factory'), payload = channelPayloads().brief;
  const first = handoffs.publish('brief', payload), second = handoffs.publish('brief', payload);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first, second);
  assert.equal(handoffs.getSnapshot().pending.brief.payload.id, payload.id);
});
