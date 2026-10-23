import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYSIS_PLAN_VERSION, PLAN_LIMITS, PLAN_TEMPLATES, createPlanNode, createTemplateNodes, serializePlan, restorePlan, filterPlanSample, planNodeSignature, planNodeRequest, runPlanNode, exportPlanResult } from '../lib/analysis-plan.ts';
import { analyzeReliability, parseSurveyCsv, profileSurvey } from '../lib/survey-analysis.ts';
import { runRecipe } from '../lib/analysis-recipes.ts';

// Synthetic records exercise source binding and exact denominator propagation.
const table = parseSurveyCsv('参与,Q1,Q2,Q3,金额\n是,1,2,5,10\n是,2,3,4,20\n否,3,3,3,30\n是,4,4,2,40\n未答,5,5,1,50\n,1,1,5,60\n是,,4,2,70\n是,99,no,2,80');
const source = { hash: 'a'.repeat(64), headers: table.headers, interpretationHash: 'b'.repeat(64), expectedMapping: null };
const node = (method = 'frequency', id = 'node-1') => ({ ...createPlanNode(method, id), x: method === 'alpha' ? null : 0 });
const plan = () => ({ schema: ANALYSIS_PLAN_VERSION, title: '研究路线 🧩', template: null, nodes: [node()], source: structuredClone(source), missingCodes: ['未答'] });
const restore = value => restorePlan(JSON.stringify(value), source, ['未答']);

test('portable plans round-trip UTF-8 and incomplete configurations without raw responses or results', () => {
  const draft = plan(); draft.nodes.push(createPlanNode('alpha', 'scale-1'));
  draft.nodes.push({ ...createPlanNode('groups', 'group-1'), filter: { column: null, values: [] } });
  const serialized = serializePlan(draft);
  assert.deepEqual(restorePlan('\uFEFF' + serialized, source, ['未答']), draft);
  assert.equal(serialized.includes('"rows"'), false); assert.equal(serialized.includes('"result"'), false);
  const copy = restore(draft); copy.source.headers[0] = '更改'; copy.nodes[0].question = '独立副本';
  assert.equal(draft.source.headers[0], '参与'); assert.equal(draft.nodes[0].question, '');
});

test('all three editable routes instantiate only registered methods and unique unbound nodes', () => {
  assert.deepEqual(PLAN_TEMPLATES.map(item => item.id), ['activity', 'support', 'consumer']);
  for (const template of PLAN_TEMPLATES) {
    let next = 0; const nodes = createTemplateNodes(template.id, () => `n-${++next}`);
    const sample = { ...plan(), template: { id: template.id, version: 1 }, nodes };
    assert.deepEqual(restore(sample), sample);
    assert.ok(nodes.length <= 12); assert.ok(nodes.every(node => node.x === null && node.y === null));
    assert.ok(nodes.some(node => node.filter?.column === null));
    assert.ok(nodes.every(node => !['efa', 'regression', 'clustering'].includes(node.method)));
    assert.throws(() => createTemplateNodes(template.id, () => 'same'), /重复/);
  }
  assert.throws(() => createTemplateNodes('unknown', () => 'n'), /版本/);
});

test('strict nested schemas reject hidden data, outcomes, approvals and unknown properties', () => {
  for (const mutate of [
    p => { p.rows = table.rows; }, p => { p.approved = true; }, p => { p.nodes[0].result = { n: 5 }; },
    p => { p.source.rows = 8; }, p => { p.nodes[0].filter = { column: 0, values: ['是'], passed: true }; },
    p => { p.template = { id: 'activity', version: 1, verified: true }; },
    p => { p.nodes[0] = { ...createPlanNode('alpha', 'a'), scale: { columns: [], reverse: [], min: 1, max: 5, construct: '', result: 1 } }; },
  ]) { const value = plan(); mutate(value); assert.throws(() => restore(value), /未知或缺失/); }
  const polluted = JSON.stringify(plan()).replace('"title":', '"__proto__":{},"title":');
  assert.throws(() => restorePlan(polluted, source, ['未答']), /未知或缺失/);
});

test('decoded duplicate JSON fields including Unicode escapes are rejected at every depth', () => {
  const raw = JSON.stringify(plan());
  for (const poisoned of [
    raw.replace('"title":', '"title":"forged","title":'),
    raw.replace('"title":', '"\\u0074itle":"forged","title":'),
    raw.replace('"method":', '"method":"numeric","method":'),
    raw.replace('"hash":', '"hash":"' + 'c'.repeat(64) + '","\\u0068ash":'),
  ]) assert.throws(() => restorePlan(poisoned, source, ['未答']), /重复字段/);
});

test('unsupported versions, duplicate IDs, unknown methods, invalid indexes and hidden settings reject atomically', () => {
  for (const mutate of [
    p => { p.schema = 'analysis-plan/v2'; }, p => { p.template = { id: 'activity', version: 2 }; },
    p => { p.nodes.push(structuredClone(p.nodes[0])); }, p => { p.nodes[0].id = '../node'; },
    p => { p.nodes[0].method = 'efa'; }, p => { p.nodes[0].x = -1; }, p => { p.nodes[0].x = .5; },
    p => { p.nodes[0].x = 80; }, p => { p.nodes[0].x = '0'; }, p => { p.nodes[0].y = 1; },
    p => { p.nodes[0].scale = { columns: [], reverse: [], min: 1, max: 5, construct: '' }; },
    p => { p.nodes = Array.from({ length: 13 }, (_, i) => node('frequency', `n-${i}`)); },
  ]) { const value = plan(); mutate(value); assert.throws(() => restore(value)); }
  assert.throws(() => createPlanNode('efa', 'n'));
  assert.throws(() => createPlanNode('numeric', ' '));
});

test('source binding checks file hash, exact headers, interpretation and missing policy', () => {
  const raw = serializePlan(plan());
  for (const changed of [
    { ...source, hash: 'c'.repeat(64) }, { ...source, interpretationHash: 'c'.repeat(64) },
    { ...source, headers: [...source.headers].reverse() }, { ...source, headers: ['参与 ', ...source.headers.slice(1)] },
  ]) assert.throws(() => restorePlan(raw, changed, ['未答']));
  assert.throws(() => restorePlan(raw, source, []), /缺失代码/);
  const p = plan(); p.missingCodes = ['未答', 'NA'];
  assert.deepEqual(restorePlan(serializePlan(p), source, ['NA', '未答']), p);
  for (const codes of [['未答', '未答'], [' 未答'], [''], [1]]) { const p = plan(); p.missingCodes = codes; assert.throws(() => restore(p)); }
});

test('bounded imports reject oversized, non-finite, overdeep and malformed payloads', () => {
  assert.throws(() => restorePlan('{', source, []), /无法解析/);
  assert.throws(() => restorePlan(' '.repeat(PLAN_LIMITS.bytes + 1), source, []), /100 KB/);
  assert.throws(() => restorePlan('"' + '中'.repeat(40000) + '"', source, []), /100 KB/);
  assert.throws(() => restorePlan('['.repeat(17) + '0' + ']'.repeat(17), source, []), /嵌套过深/);
  const p = plan(); p.nodes[0] = createPlanNode('alpha', 'alpha');
  const raw = JSON.stringify(p).replace('"max":5', '"max":1e999');
  assert.throws(() => restorePlan(raw, source, ['未答']), /有限数值/);
  p.nodes[0].scale.max = Infinity; assert.throws(() => serializePlan(p), /有限数值/);
});

test('restore never silently drops, adds or changes questionnaire mapping and routing policy', () => {
  const p = plan(); p.source.expectedMapping = { questionnaireHash: 'c'.repeat(64), mappingHash: 'd'.repeat(64), routingPolicy: 'exclude' };
  const raw = serializePlan(p);
  assert.deepEqual(restorePlan(raw, p.source, p.missingCodes), p);
  assert.throws(() => restorePlan(raw, source, p.missingCodes), /问卷版本/);
  assert.throws(() => restorePlan(serializePlan(plan()), p.source, p.missingCodes), /问卷版本/);
  for (const change of [{ questionnaireHash: 'e'.repeat(64) }, { mappingHash: 'e'.repeat(64) }, { routingPolicy: 'strict' }]) {
    assert.throws(() => restorePlan(raw, { ...p.source, expectedMapping: { ...p.source.expectedMapping, ...change } }, p.missingCodes), /问卷版本/);
  }
  p.source.expectedMapping.confirmed = true; assert.throws(() => serializePlan(p), /未知或缺失/);
});

test('scale definitions enforce finite range, distinct columns and reverse subset while preserving drafts', () => {
  for (const mutate of [
    s => { s.columns = [1, 1]; }, s => { s.columns = [99]; }, s => { s.columns = [1]; s.reverse = [2]; },
    s => { s.columns = [1]; s.reverse = [1, 1]; }, s => { s.min = 5; }, s => { s.max = 1e7; },
    s => { s.min = '1'; }, s => { s.construct = 'a'.repeat(121); },
  ]) { const p = plan(); p.nodes[0] = createPlanNode('alpha', 'alpha'); mutate(p.nodes[0].scale); assert.throws(() => restore(p)); }
  const p = plan(); p.nodes[0] = createPlanNode('alpha', 'alpha'); p.nodes[0].x = 1; assert.throws(() => restore(p));
});

test('branch denominator keeps original, selected, excluded and missing counts distinct', () => {
  const before = JSON.stringify(table), selected = filterPlanSample(table, { column: 0, values: ['是'] }, ['未答']);
  assert.deepEqual(selected.evidence, { totalRows: 8, branchRows: 5, excludedRows: 3, missingRows: 2, filterColumn: 0, values: ['是'] });
  assert.equal(selected.table.rows[0], table.rows[0]); // Maintains identity for routing intersections.
  const computed = runPlanNode(selected.table, { ...node('numeric'), x: 1, filter: { column: 0, values: ['是'] } }, ['未答', '99']);
  assert.equal(computed.total, 5); assert.equal(computed.n, 3); assert.equal(computed.excluded, 2);
  assert.equal(JSON.stringify(table), before);
  assert.equal(filterPlanSample(table, null, ['未答']).table, table);
  const allKnown = filterPlanSample(table, { column: 0, values: ['是', '否'] }, ['未答']);
  assert.equal(allKnown.evidence.branchRows, 6); assert.equal(allKnown.evidence.excludedRows, 2);
});

test('branch filters reject empty selections, missing values, unknown values, identifiers and duplicate categories', () => {
  for (const filter of [
    { column: null, values: [] }, { column: 0, values: [] }, { column: 0, values: ['未答'] },
    { column: 0, values: ['不存在'] }, { column: 0, values: ['是', '是'] }, { column: 0, values: [' 是'] },
    { column: 0, values: ['　'] }, { column: null, values: ['是'] }, { column: 99, values: ['是'] },
  ]) assert.throws(() => filterPlanSample(table, filter, ['未答']));
  assert.throws(() => filterPlanSample({ ...table, headers: ['姓名', ...table.headers.slice(1)] }, { column: 0, values: ['是'] }, []), /标识/);
  const high = { ...table, rows: Array.from({ length: 51 }, (_, i) => [String(i), '1', '1', '1', '1']) };
  assert.throws(() => filterPlanSample(high, { column: 0, values: ['0'] }, []), /50 个类别/);
  const p = plan(); p.nodes[0].filter = { column: 0, values: ['未答'] }; assert.throws(() => restore(p), /缺失值/);
  assert.throws(() => runPlanNode(table, { ...node(), filter: { column: 0, values: [] } }, []), /筛选/);
});

test('branch identifier checks agree with the shared heuristic without reading unrelated response cells', () => {
  for (const name of ['姓名', 'email', 'respondent_id', '联系电话', '支持需求', '参与状态']) {
    const sample = parseSurveyCsv(`${name},其他题\n是,1\n否,2`);
    const expectedIdentifier = profileSurvey(sample).columns[0].likelyIdentifier;
    if (expectedIdentifier) assert.throws(() => filterPlanSample(sample, { column: 0, values: ['是'] }, []), /标识/);
    else assert.equal(filterPlanSample(sample, { column: 0, values: ['是'] }, []).evidence.branchRows, 1);
  }
  const protectedTable = { headers: ['参与', '其他题'], delimiter: ',', skippedBlankLines: 0, rows: ['是', '否'].map(value => new Proxy([value, 'never-needed'], { get(target, property) { if (property === '1') throw Error('unrelated response read'); return Reflect.get(target, property); } })) };
  assert.equal(filterPlanSample(protectedTable, { column: 0, values: ['是'] }, []).evidence.branchRows, 1);
});

test('alpha node reuses existing complete-case engine and preserves every item diagnostic', () => {
  const alpha = { ...createPlanNode('alpha', 'a'), scale: { columns: [1, 2, 3], reverse: [3], min: 1, max: 5, construct: '体验' }, filter: { column: 0, values: ['是'] } };
  const branch = filterPlanSample(table, alpha.filter, ['未答']);
  const expected = analyzeReliability(branch.table, { ...alpha.scale, missingCodes: ['未答'] });
  const result = runPlanNode(branch.table, alpha, ['未答']);
  assert.deepEqual(result.reliability, expected); assert.equal(result.metrics[0].value, expected.alpha);
  assert.equal(result.n, 3); assert.equal(result.total, 5); assert.equal(result.excluded, 2);
  assert.equal(result.rows[2][1], '是'); assert.equal(result.rows[0][4], expected.items[0].correctedItemTotal);
  assert.equal(result.rows[0][5], expected.items[0].alphaIfDeleted);
  assert.ok(result.warnings.some(text => text.includes('超出计分范围 1')));
  const exported = exportPlanResult(result); exported.rows[0][0] = 'mutated'; assert.equal(result.rows[0][0], 'Q1');
  assert.throws(() => runPlanNode(table, createPlanNode('alpha', 'draft'), []), /构念/);
  assert.throws(() => runPlanNode(table, { ...alpha, scale: { ...alpha.scale, columns: [1], reverse: [] } }, []), /2–30/);
  assert.throws(() => runPlanNode({ ...table, headers: ['参与', '手机号', 'Q2', 'Q3', '金额'] }, alpha, []), /标识/);
});

test('six existing methods retain the exact engine output and export category redaction', () => {
  for (const method of ['frequency', 'numeric', 'groups', 'crosstab', 'pearson', 'spearman']) {
    const card = { ...createPlanNode(method, method), x: ['frequency', 'groups', 'crosstab'].includes(method) ? 0 : 1, y: ['frequency', 'numeric'].includes(method) ? null : method === 'crosstab' ? 0 : 4 };
    if (method === 'crosstab') card.x = 1;
    assert.deepEqual(runPlanNode(table, card, ['未答', '99']), runRecipe(table, card, ['未答', '99']));
  }
  const result = runPlanNode(table, node(), ['未答']), output = exportPlanResult(result);
  assert.equal(output.rows[0][0], '类别 1'); assert.equal(result.rows[0][0], '是');
});

test('computation signature excludes prose and location but binds source, parameters and branch semantics', () => {
  const original = { ...node(), filter: { column: 0, values: ['是', '否'] } };
  const sig = planNodeSignature(original, 'dataset+mapping+routing:v1', ['未答', 'NA']);
  assert.equal(planNodeSignature({ ...original, id: 'different', branch: '标题改变', question: '问题改变' }, 'dataset+mapping+routing:v1', ['NA', '未答']), sig);
  assert.equal(planNodeSignature({ ...original, filter: { column: 0, values: ['否', '是'] } }, 'dataset+mapping+routing:v1', ['未答', 'NA']), sig);
  for (const change of [{ ...original, x: 1 }, { ...original, method: 'numeric' }, { ...original, filter: null }, { ...original, filter: { column: 0, values: ['是'] } }]) assert.notEqual(planNodeSignature(change, 'dataset+mapping+routing:v1', ['未答', 'NA']), sig);
  assert.notEqual(planNodeSignature(original, 'dataset+mapping+routing:v2', ['未答', 'NA']), sig);
  assert.notEqual(planNodeSignature(original, 'dataset+mapping+routing:v1', ['NA']), sig);
});

test('mapping requests contain only effective method inputs and copy scale arrays', () => {
  assert.deepEqual(planNodeRequest(node()), { method: 'frequency', columns: [0] });
  assert.deepEqual(planNodeRequest({ ...node('groups'), y: 4 }), { method: 'groups', columns: [0, 4] });
  const alpha = { ...createPlanNode('alpha', 'alpha'), scale: { columns: [1, 2, 3], reverse: [3], min: 1, max: 5, construct: '体验' } };
  assert.deepEqual(planNodeRequest(alpha), { method: 'alpha', ...alpha.scale });
  const request = planNodeRequest(alpha); request.columns.push(4); assert.equal(alpha.scale.columns.length, 3);
});
