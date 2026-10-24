import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { ANALYSIS_BLOCKS } from '../lib/analysis-recipes.ts';
import { finiteNumber, parseSurveyCsv } from '../lib/survey-analysis.ts';
import { createPlanNode, planNodeSignature, restorePlan, runPlanNode, serializePlan } from '../lib/analysis-plan.ts';
import { buildChartSnapshot } from '../lib/chart-data.ts';
import { defaultChartSettings, defaultChartStyle, restoreChartSettings, serializeChartSettings } from '../lib/chart-theme.ts';

// Execute the board's real pure guards/signature, so a portable-plan roundtrip
// exercises the UI binding rather than a test-only copy of its formula.
const source = readFileSync(new URL('../components/analysis/AnalysisRecipeBoard.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('AnalysisRecipeBoard.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const statements = tree.statements.filter(statement =>
  (ts.isFunctionDeclaration(statement) && statement.name?.text === 'inputProblems') ||
  (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => ['nodeOnly', 'resultSignature'].includes(declaration.name.getText(tree)))));
assert.equal(statements.length, 3, 'the board must expose both pure boundaries to the regression');
const js = ts.transpileModule(statements.map(statement => statement.getText(tree)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { nodeOnly, resultSignature, inputProblems } = new Function('planNodeSignature', 'finiteNumber', 'ANALYSIS_BLOCKS', `${js}\nreturn { nodeOnly, resultSignature, inputProblems };`)(planNodeSignature, finiteNumber, ANALYSIS_BLOCKS);
const table = parseSurveyCsv('Q1,Q2,Q3\n0,1,2\n1,2,3\n2,3,4\n3,4,5\n4,5,6');
const sourceIdentity = { hash: 'a'.repeat(64), interpretationHash: 'b'.repeat(64), headers: table.headers, expectedMapping: null };
const context = 'same-data-and-routing-context';
function fixture() {
  const node = { ...createPlanNode('alpha', 'scale_fixture'), question: '合成量表的内部一致性如何？', scale: { columns: [0, 1, 2], reverse: [], min: 0, max: 7, construct: '合成构念' } };
  // Valid edits normalize into numeric scale settings but retain input text in the live board.
  const edited = { ...node, boundsDraft: { min: '0.0', max: '7.00' } };
  const plan = { schema: 'analysis-plan/v1', title: '合成恢复验收', template: null, nodes: [node], source: sourceIdentity, missingCodes: [] };
  const restored = restorePlan(serializePlan(plan), sourceIdentity, []).nodes[0];
  return { node, edited, restored };
}
function moduleFor(node) {
  const result = runPlanNode(table, nodeOnly(node), []);
  const snapshot = buildChartSnapshot(table, nodeOnly(node), result, [], { dataHash: sourceIdentity.hash, signature: resultSignature(node, context, []), computedAt: '2026-10-11T13:30:00Z' });
  return { id: node.id, title: '信度与题项诊断', question: node.question, current: inputProblems(node).length === 0, snapshot };
}

test('alpha format survives plan save/reload/recompute after valid scoring-bound edits', () => {
  const { edited, restored } = fixture();
  assert.deepEqual(inputProblems(edited), []);
  assert.equal(resultSignature(edited, context, []), resultSignature(restored, context, []));
  const settings = { ...defaultChartSettings(), theme: 'teal', figures: { [edited.id]: { kind: 'table', style: { ...defaultChartStyle('量表诊断'), note: '合成验收 · 保留格式' } } } };
  const raw = serializeChartSettings(settings, [moduleFor(edited)]);
  assert.deepEqual(restoreChartSettings(raw, [moduleFor(restored)]), settings);
});

test('actual scoring-bound change invalidates the result and exported format', () => {
  const { edited, restored } = fixture();
  const changed = { ...restored, scale: { ...restored.scale, max: 6 } };
  assert.notEqual(resultSignature(edited, context, []), resultSignature(changed, context, []));
  const settings = { ...defaultChartSettings(), figures: { [edited.id]: { kind: 'table', style: defaultChartStyle('量表诊断') } } };
  const raw = serializeChartSettings(settings, [moduleFor(edited)]);
  assert.throws(() => restoreChartSettings(raw, [moduleFor(changed)]), /数据或模块设置已变化/);
});

test('incomplete, invalid or reversed bounds drafts never make a prior result current', () => {
  const { restored } = fixture();
  for (const boundsDraft of [{ min: '', max: '7' }, { min: '-', max: '7' }, { min: '0', max: 'no' }, { min: '7', max: '0' }, { min: '0', max: '1000001' }]) {
    const draft = { ...restored, boundsDraft };
    assert.ok(inputProblems(draft).includes('设置有效计分范围'));
    assert.equal(moduleFor(draft).current, false);
  }
});