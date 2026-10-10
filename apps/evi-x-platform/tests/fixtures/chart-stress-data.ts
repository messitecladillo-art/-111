import { createPlanNode, planNodeSignature, runPlanNode, type PlanNode, type PlanResult } from '../../lib/analysis-plan.ts';
import { buildChartSnapshot } from '../../lib/chart-data.ts';
import { defaultChartStyle } from '../../lib/chart-theme.ts';
import { parseSurveyCsv, profileSurvey, type SurveyTable } from '../../lib/survey-analysis.ts';
import type { ChartKind, ChartModule, ChartStyle } from '../../lib/chart-types.ts';

/** Deterministic synthetic records only. No fieldwork, respondent or model output. */
export const STRESS_FIXTURE = {
  version: 'chart-stress/synthetic-v1', rows: 5000, columns: 40,
  missingCodes: ['NA'], computedAt: '2026-10-11T02:21:00+08:00',
  // Verified by the Node stress runner against the exact UTF-8 CSV bytes.
  csvSHA256: 'd239148425ef28fe6deb58d20db38401446424cb43c40b43398f481b42a8b916',
} as const;

const category = (prefix: string, index: number) => `${prefix}${String(index + 1).padStart(2, '0')}`;
const quote = (value: string) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function buildStressCSV(): string {
  const headers = ['消费组别', '使用场景', '推荐渠道', '体验强度', '消费投入', '满意等级', '服务时长', '响应波段', '数据情境', '接触频率', ...Array.from({ length: 30 }, (_, item) => `体验题${String(item + 1).padStart(2, '0')}${item % 5 === 4 ? '_反向' : ''}`)];
  const records = [headers.join(',')];
  for (let i = 0; i < STRESS_FIXTURE.rows; i++) {
    const group = i % 20;
    const mode = Math.floor(i / 40) % 3;
    const wave = ((i * 37) % 503) / 50;
    const intensity = (mode === 0 ? -18 : mode === 1 ? 14 : 46) + group * .55 + wave + (i % 127 === 0 ? 110 : 0);
    const spend = 12 + ((i * 17) % 211) ** 2 / 18 + (i % 149 === 0 ? 7500 : 0);
    const latent = 1 + Math.floor(i / 20) % 5;
    const items = Array.from({ length: 30 }, (_, item) => {
      if (i % 101 === 0 && item === 0) return 'NA';
      if (i % 257 === 0 && item === 1) return '不可解析';
      if (i % 389 === 0 && item === 2) return '6';
      const perturb = (i * (item + 3) + item * 7) % 11 === 0 ? (item % 2 ? -1 : 1) : 0;
      const score = Math.max(1, Math.min(5, latent + perturb));
      return String(item % 5 === 4 ? 6 - score : score);
    });
    const row = [
      i % 211 === 0 ? 'NA' : category('人群', group),
      i % 173 === 0 ? 'NA' : category('场景', (Math.floor(i / 20) + Math.floor(i / 400) * 3) % 20),
      i % 97 === 0 ? 'NA' : category('渠道', (i * 13) % 50),
      i % 89 === 0 ? 'NA' : i % 137 === 0 ? '不可解析' : intensity.toFixed(3),
      i % 113 === 0 ? 'NA' : i % 191 === 0 ? '不可解析' : spend.toFixed(3),
      String(1 + (i * 7) % 5),
      (4 + Math.sin(i * .13) * 2 + group * .08).toFixed(3),
      `波段${String(1 + i % 7)} · 中文与 Unicode α₁`,
      '教学模拟数据', String(i % 9), ...items,
    ];
    records.push(row.map(quote).join(','));
  }
  return records.join('\n');
}

export type StressComputed = { id: string; table: SurveyTable; node: PlanNode; result: PlanResult; module: ChartModule };
export function buildStressDataset(): { csv: string; table: SurveyTable; profile: ReturnType<typeof profileSurvey>; computed: StressComputed[] } {
  const csv = buildStressCSV(), table = parseSurveyCsv(csv);
  const missing = [...STRESS_FIXTURE.missingCodes];
  const nodes: PlanNode[] = [
    { ...createPlanNode('frequency', 'stress_frequency'), x: 2, question: '五十种渠道如何构成？' },
    { ...createPlanNode('frequency', 'stress_small_frequency'), x: 7, question: '七种波段如何构成？' },
    { ...createPlanNode('numeric', 'stress_numeric'), x: 3, question: '多峰体验分布与极端值如何呈现？' },
    { ...createPlanNode('groups', 'stress_groups'), x: 0, y: 3, question: '二十组体验分布有什么差异？' },
    { ...createPlanNode('crosstab', 'stress_cross'), x: 0, y: 1, question: '二十种人群与二十种场景如何交叉？' },
    { ...createPlanNode('pearson', 'stress_pearson'), x: 3, y: 4, question: '体验与偏态投入的配对关系如何？' },
    { ...createPlanNode('spearman', 'stress_spearman'), x: 5, y: 9, question: '离散有序评价与接触频率如何关联？' },
    { ...createPlanNode('alpha', 'stress_alpha'), question: '三十题含反向计分的量表诊断如何？', scale: { columns: Array.from({ length: 30 }, (_, i) => i + 10), reverse: [14, 19, 24, 29, 34, 39], min: 1, max: 5, construct: '合成体验构念' } },
  ];
  const computed = nodes.map(node => {
    const result = runPlanNode(table, node, missing);
    const binding = { dataHash: STRESS_FIXTURE.csvSHA256, signature: planNodeSignature(node, `${STRESS_FIXTURE.version}|${STRESS_FIXTURE.csvSHA256}|utf-8|comma`, missing), computedAt: STRESS_FIXTURE.computedAt };
    const snapshot = buildChartSnapshot(table, node, result, missing, binding);
    return { id: node.id, table, node, result, module: { id: node.id, title: node.question, question: node.question, current: true, snapshot } };
  });
  return { csv, table, profile: profileSurvey(table, missing), computed };
}

export type StressScenario = { id: string; title: string; module: ChartModule; kind: ChartKind; style: ChartStyle };
export function buildStressScenarios(): StressScenario[] {
  const dataset = buildStressDataset();
  const recipes: { id: string; source: string; title: string; kind: ChartKind; labels?: boolean }[] = [
    { id: 'group_raincloud', source: 'stress_groups', title: '二十组多峰雨云 · 5,000 条合成记录', kind: 'group_raincloud' },
    { id: 'heatmap', source: 'stress_cross', title: '20 × 20 交叉热力矩阵', kind: 'heatmap', labels: true },
    { id: 'grouped_bar', source: 'stress_cross', title: '二十系列分组柱状图', kind: 'grouped_bar' },
    { id: 'mosaic', source: 'stress_cross', title: '四百单元联合频数马赛克', kind: 'mosaic' },
    { id: 'scatter', source: 'stress_pearson', title: '多峰 × 长尾数值配对散点', kind: 'scatter' },
    { id: 'waffle', source: 'stress_frequency', title: '五十类全样本格图', kind: 'waffle' },
    { id: 'alpha_deleted', source: 'stress_alpha', title: '三十题删除后 α 诊断', kind: 'alpha_deleted' },
    { id: 'table', source: 'stress_cross', title: '四百行完整交叉结果表', kind: 'table' },
    { id: 'raincloud', source: 'stress_numeric', title: '多峰分布与极端值雨云', kind: 'raincloud' },
  ];
  return recipes.map(recipe => {
    const chartModule = dataset.computed.find(item => item.id === recipe.source)!.module;
    return { id: recipe.id, title: recipe.title, module: chartModule, kind: recipe.kind, style: { ...defaultChartStyle(recipe.title), width: 1600, height: 1000, fontSize: 16, showLabels: recipe.labels ?? false, note: '教学模拟数据 · 确定性压力测试 · NA 按缺失处理' } };
  });
}
