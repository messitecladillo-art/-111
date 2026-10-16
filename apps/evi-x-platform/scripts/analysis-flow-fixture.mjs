import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { datasetIdentity } from '../lib/questionnaire-mapping.ts';
import { ANALYSIS_PLAN_VERSION, createPlanNode } from '../lib/analysis-plan.ts';

// Deterministic synthetic QA only: these rows do not describe surveyed people.
export const FLOW_HEADERS = ['参与状态', '人群', '渠道', '消费金额', '推荐意愿', '体验清晰', '操作方便', '遇到困难_反向'];
const a = [1, 2, 3, 4, 5, 3], b = [1, 2, 3, 4, 5, 4], recommendation = [1, 2, 2, 3, 4, 5];
export const FLOW_ROWS = [
  ...Array.from({ length: 12 }, (_, i) => ['参与', i < 6 ? '校园' : '社区', i < 4 || (i >= 6 && i < 8) ? '线下' : '线上', String((i % 6 + 1) * 10 + (i >= 6 ? 5 : 0)), String(recommendation[i % 6]), String(a[i % 6]), String(b[i % 6]), String(6 - a[i % 6])]),
  ['参与', '校园', '线下', 'NA', 'NA', 'NA', '3', '3'],
  ['参与', '社区', '线下', '', '', '6', '3', '3'],
  ['未参与', '校园', '线上', '999', '5', '5', '5', '1'],
  ['未参与', '社区', '线上', '999', '5', '5', '5', '1'],
  ['未参与', '校园', '线下', '', '', '', '', ''],
  ['未参与', '社区', '线下', 'NA', 'NA', 'NA', 'NA', 'NA'],
  ['', '校园', '线上', '888', '5', '5', '5', '1'],
  ['NA', '社区', '线上', '888', '5', '5', '5', '1'],
];
export const FLOW_CSV = `${FLOW_HEADERS.join(',')}\n${FLOW_ROWS.map(row => row.join(',')).join('\n')}\n`;
export const FLOW_MISSING = ['NA'];
export function flowNodes() {
  const settings = [['frequency', 1, null], ['numeric', 3, null], ['groups', 1, 3], ['crosstab', 1, 2], ['pearson', 3, 4], ['spearman', 3, 4], ['alpha', null, null]];
  return settings.map(([method, x, y]) => ({ ...createPlanNode(method, `qa_${method}`), x, y, question: `合成验收：${method}`, branch: '参与者', filter: { column: 0, values: ['参与'] }, scale: method === 'alpha' ? { columns: [5, 6, 7], reverse: [7], min: 1, max: 5, construct: '合成体验' } : null }));
}
export async function flowPlan(table) {
  const hash = createHash('sha256').update(FLOW_CSV).digest('hex');
  const identity = await datasetIdentity(hash, 'utf-8', table);
  return { schema: ANALYSIS_PLAN_VERSION, title: '合成验收：七种已实现分析', template: null, nodes: flowNodes(), source: { hash, headers: [...table.headers], interpretationHash: identity.interpretationHash, expectedMapping: null }, missingCodes: [...FLOW_MISSING] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outputIndex = process.argv.indexOf('--out');
  if (outputIndex === -1 || !process.argv[outputIndex + 1]) throw Error('Use --out <directory> to write synthetic QA fixtures.');
  const out = resolve(process.argv[outputIndex + 1]);
  const { parseSurveyCsv } = await import('../lib/survey-analysis.ts');
  const { serializePlan } = await import('../lib/analysis-plan.ts');
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'synthetic-analysis-flow.csv'), FLOW_CSV, 'utf8');
  await writeFile(resolve(out, 'synthetic-analysis-flow.plan.json'), serializePlan(await flowPlan(parseSurveyCsv(FLOW_CSV))), 'utf8');
  console.log(JSON.stringify({ classification: 'synthetic-qa-only', rows: FLOW_ROWS.length, headers: FLOW_HEADERS, missingCodes: FLOW_MISSING, filter: { column: '参与状态', values: ['参与'], n: 14 }, csv: resolve(out, 'synthetic-analysis-flow.csv'), plan: resolve(out, 'synthetic-analysis-flow.plan.json') }));
}
