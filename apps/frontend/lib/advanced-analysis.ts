/**
 * The advanced methods run on a loaded survey table: complete cases of the chosen columns (missing codes excluded,
 * nothing imputed), the method, its report write-up and figure, and the insert that writes it into the report's
 * blueprint section — the method paragraph, formulas, the 式中 paragraph, the result table (registered as a result)
 * and the reading, which cites the table it travels with. AHP takes the experts' judgement matrix instead of data.
 */
import { finiteNumber, type SurveyTable } from './survey-analysis.ts';
import { samplingAdequacy } from './psychometrics.ts';
import { exploratoryFactors } from './factor-analysis.ts';
import { linearRegression } from './regression.ts';
import { logisticRegression } from './logistic.ts';
import { ahp } from './ahp.ts';
import { ipa } from './ipa.ts';
import { kmeans, silhouette, standardize } from './kmeans.ts';
import { ahpWriting, clusterWriting, ipaWriting, logisticWriting, regressionWriting, validityWriting, type MethodWriting } from './method-writing.ts';
import { figureMetrics, methodFigure, type FigureMetric, type MethodFigureData } from './method-figures.ts';
import type { FigurePlan } from './report-figures.ts';
import type { ReportInsert } from './report-insert.ts';
import { digestText, snapshotRecipe } from './research-quality.ts';

export type AdvancedSpec =
  | { method: 'validity'; items: number[] }
  | { method: 'regression'; outcome: number; predictors: number[] }
  | { method: 'logistic'; outcome: number; predictors: number[] }
  | { method: 'ipa'; performance: number[]; importance: number[] | null; overall: number | null }
  | { method: 'cluster'; variables: number[]; k: number }
  | { method: 'ahp'; criteria: string[]; matrix: number[][] };
export type AdvancedMethod = AdvancedSpec['method'];
/** `chart` is what the report figure plots, as the result's metrics; `figure` draws it for the preview. */
export type AdvancedRun = { method: AdvancedMethod; title: string; variables: string[]; n: number; total: number; writing: MethodWriting;
  chart: { caption: string; metrics: FigureMetric[] } | null; figure: FigurePlan | null };

export const ADVANCED_METHODS: readonly { id: AdvancedMethod; title: string; use: string; node: string }[] = [
  { id: 'validity', title: '效度：KMO 与因子分析', use: '判断量表题项是否适合因子分析，并给出旋转后的因子结构。', node: 'data.testing' },
  { id: 'regression', title: '多元线性回归', use: '在控制其他变量后，看哪些因素与一个数值结果相关。', node: 'drivers.model' },
  { id: 'logistic', title: '二元 Logistic 回归', use: '结果是“是 / 否”时，看哪些因素与其发生概率相关。', node: 'drivers.model' },
  { id: 'ipa', title: '重要性—表现分析（IPA）', use: '找出重要但表现欠佳、应优先改进的属性。', node: 'diagnosis.evaluation' },
  { id: 'cluster', title: 'K-means 聚类画像', use: '把受访者分成特征相近的几类人群。', node: 'segments.cluster' },
  { id: 'ahp', title: '层次分析法（AHP）', use: '由专家两两比较，确定各方案准则的权重。', node: 'plan.priority' },
];
const REFUSALS: Record<string, string> = {
  'too-few-items': '至少需要 3 个题项。', 'too-few-cases': '完整案例太少，不足以估计。', 'constant-item': '有题项在完整案例中没有变化。',
  'constant-outcome': '因变量在完整案例中没有变化。', 'constant-predictor': '有自变量在完整案例中没有变化。', collinear: '自变量之间完全共线，请去掉重复或可由其他变量推出的变量。',
  'no-predictors': '至少选择一个自变量。', 'not-binary': '因变量须编码为 0 / 1（1 表示事件发生），请先在数据中重新编码。', 'one-class': '因变量只有一类取值，无法比较。',
  separation: '某个自变量能完全区分两类结果，估计值不存在；请合并类别或去掉该变量。', singular: '题项之间完全共线，请去掉重复题项。', heywood: '出现共同度大于 1 的 Heywood 情形，请减少因子数或检查题项。',
  'not-converged': '主轴因子法没有收敛，题项之间缺少共同变异。', 'bad-factor-count': '因子数须小于题项数。', 'too-few-rows': '完整案例太少。', 'bad-k': '聚类数须在 2 到案例数之间。',
  'too-few-distinct': '不同的观测少于聚类数。', 'uneven-rows': '变量长度不一致。', 'too-few-attributes': '至少需要 2 个属性。', 'uneven-columns': '属性评分的长度不一致。',
  'no-importance': '请为每个属性选择重要性评分，或选择总体满意度以推导重要性。', 'no-cases': '没有完整案例。', 'too-small': '至少需要 2 个准则。', 'too-large': '准则不能超过 15 个。',
  'not-square': '判断矩阵须为方阵。', 'not-positive': '判断矩阵的值须为正数。', 'not-reciprocal': '判断矩阵须满足 aji = 1 / aij。',
};
export const refusalText = (code: string) => REFUSALS[code] ?? '无法计算。';

/** Rows where every chosen column is a finite number and not a missing code; nothing is imputed. */
export function completeCases(table: SurveyTable, columns: readonly number[], missingCodes: readonly string[]): { columns: number[][]; n: number; total: number } {
  const missing = new Set(missingCodes.map(c => c.trim())), kept: number[][] = columns.map(() => []);
  let n = 0;
  for (const row of table.rows) {
    const values = columns.map(c => { const text = (row[c] ?? '').trim(); return !text || missing.has(text) ? null : finiteNumber(text); });
    if (values.some(v => v === null)) continue;
    values.forEach((v, j) => kept[j].push(v!));
    n++;
  }
  return { columns: kept, n, total: table.rows.length };
}

const label = (table: SurveyTable, c: number) => table.columnLabels?.[table.headers[c]] ?? table.headers[c] ?? `第 ${c + 1} 列`;

/** One method on the table, written up for the report; a refusal says why in the user's words. */
export function runAdvanced(spec: AdvancedSpec, table: SurveyTable, missingCodes: readonly string[]): AdvancedRun | { refused: string } {
  if (spec.method === 'ahp') {
    const r = ahp(spec.matrix);
    if ('refused' in r) return { refused: refusalText(r.refused) };
    return { method: 'ahp', title: '评价准则权重', variables: spec.criteria, n: spec.criteria.length, total: spec.criteria.length, writing: ahpWriting(r, spec.criteria), chart: null, figure: null };
  }
  const columns = spec.method === 'validity' ? spec.items : spec.method === 'cluster' ? spec.variables
    : spec.method === 'ipa' ? [...spec.performance, ...(spec.importance ?? []), ...(spec.overall === null ? [] : [spec.overall])] : [spec.outcome, ...spec.predictors];
  if (new Set(columns).size !== columns.length) return { refused: '同一列不能同时担任两个角色。' };
  const data = completeCases(table, columns, missingCodes), names = columns.map(c => label(table, c));
  if (!data.n) return { refused: refusalText('no-cases') };
  switch (spec.method) {
    case 'validity': {
      const adequacy = samplingAdequacy(data.columns);
      if ('refused' in adequacy) return { refused: refusalText(adequacy.refused) };
      const solution = exploratoryFactors(data.columns);
      if ('refused' in solution) return { refused: refusalText(solution.refused) };
      if (solution.factors > MAX_FACTORS) return { refused: `提取出 ${solution.factors} 个因子，超过 ${MAX_FACTORS} 个，载荷表无法排进报告；请按维度分组后分别检验。` };
      return withFigure({ method: 'validity', title: '题项旋转后因子载荷', variables: names, n: data.n, total: data.total, writing: validityWriting(adequacy, solution, names) },
        '题项相关矩阵特征值碎石图', { kind: 'scree', eigenvalues: solution.eigenvalues });
    }
    case 'regression': case 'logistic': {
      const [y, ...xs] = data.columns, predictors = xs.map((values, j) => ({ name: names[j + 1], values }));
      if (spec.method === 'regression') {
        const fit = linearRegression(y, predictors);
        if ('refused' in fit) return { refused: refusalText(fit.refused) };
        return withFigure({ method: 'regression', title: `${names[0]}影响因素`, variables: names, n: data.n, total: data.total, writing: regressionWriting(fit, names[0]) },
          `${names[0]}影响因素的回归系数及其 95% 置信区间`, { kind: 'forest', rows: fit.coefficients.slice(1).map(c => ({ name: c.name, estimate: c.estimate, low: c.ci[0], high: c.ci[1] })) });
      }
      const fit = logisticRegression(y, predictors);
      if ('refused' in fit) return { refused: refusalText(fit.refused) };
      return withFigure({ method: 'logistic', title: `${names[0]}影响因素`, variables: names, n: data.n, total: data.total, writing: logisticWriting(fit, names[0], names[0]) },
        `${names[0]}影响因素的发生比比率及其 95% 置信区间`, { kind: 'forest', rows: fit.coefficients.slice(1).map(c => ({ name: c.name, estimate: c.oddsRatio, low: c.oddsRatioCi[0], high: c.oddsRatioCi[1] })) });
    }
    case 'ipa': {
      const k = spec.performance.length, performance = data.columns.slice(0, k), importance = spec.importance ? data.columns.slice(k, 2 * k) : null;
      const overall = spec.overall === null ? undefined : data.columns.at(-1)!;
      const result = ipa(performance.map((values, j) => ({ name: names[j], performance: values, ...(importance ? { importance: importance[j] } : {}) })), { overall });
      if ('refused' in result) return { refused: refusalText(result.refused) };
      return withFigure({ method: 'ipa', title: '各属性重要性与表现', variables: names.slice(0, k), n: data.n, total: data.total, writing: ipaWriting(result) },
        '各属性重要性—表现象限图', { kind: 'quadrant', points: result.points, lines: result.lines });
    }
    case 'cluster': {
      if (spec.variables.length > MAX_CLUSTER_VARIABLES) return { refused: `聚类变量至多 ${MAX_CLUSTER_VARIABLES} 个，结果表才能排进报告（不超过 10 列）。` };
      const rows = standardize(data.columns[0].map((_, i) => data.columns.map(c => c[i])));
      const fit = kmeans(rows, spec.k, { seed: 'evix-advanced' });
      if ('refused' in fit) return { refused: refusalText(fit.refused) };
      return withFigure({ method: 'cluster', title: '各类人群的标准化中心', variables: names, n: data.n, total: data.total, writing: clusterWriting(fit, silhouette(...silhouetteSample(rows, fit.assignments)).mean, names) },
        '各类人群标准化中心剖面图', { kind: 'profile', centers: fit.centers, sizes: fit.sizes, variables: names });
    }
  }
}
const ACCENT = '#2F6B4F';
/** The source an AHP result names: the experts' judgement matrix entered for this study. */
export const AHP_SOURCE = '本研究专家两两比较判断矩阵';
// The widest result table the Word export takes is 10 columns: a cluster table has 3 more than its variables, a
// factor table 2 more than its factors.
export const MAX_CLUSTER_VARIABLES = 7, MAX_FACTORS = 8;

/** The run with its figure, drawn from the same metrics the report's figure will be drawn from. */
function withFigure(run: Omit<AdvancedRun, 'chart' | 'figure'>, caption: string, data: MethodFigureData): AdvancedRun {
  const metrics = figureMetrics(data);
  if (!metrics) return { ...run, chart: null, figure: null };
  return { ...run, chart: { caption, metrics }, figure: methodFigure({ method: run.method, headers: run.writing.table.headers, metrics }, ACCENT) };
}
// The silhouette compares every row with every other; past this many rows it is taken on an evenly spaced sample
// of rows (as sklearn's sample_size does), which keeps a large import from freezing the page.
const SILHOUETTE_ROWS = 2000;
function silhouetteSample<T>(rows: readonly T[], assignments: readonly number[]): [T[], number[]] {
  const step = Math.max(1, Math.ceil(rows.length / SILHOUETTE_ROWS)), keep = rows.flatMap((_, i) => (i % step ? [] : [i]));
  return [keep.map(i => rows[i]), keep.map(i => assignments[i])];
}

/**
 * The insert that writes a run into its blueprint section: method paragraph, formulas, 式中 paragraph, the table
 * (registered as a result of this method, without a computation receipt) and the reading that cites it.
 */
export async function advancedInsert(run: AdvancedRun, source: { name: string; hash: string; simulated: boolean }): Promise<ReportInsert> {
  const table = run.writing.table;
  // AHP weighs the experts' pairwise judgements, not the survey: its result names that input, never the loaded data.
  const origin = run.method === 'ahp'
    ? { sourceName: AHP_SOURCE, sourceHash: await digestText(JSON.stringify([run.variables, table.rows])), classification: 'user_provided' as const }
    : { sourceName: source.name, sourceHash: source.hash, classification: source.simulated ? 'simulated' as const : 'user_provided' as const };
  const result = await snapshotRecipe({
    method: run.method, n: run.n, total: run.total, excluded: run.total - run.n, missingRows: run.total - run.n, invalidRows: 0,
    metrics: run.chart?.metrics ?? [], headers: table.headers, rows: table.rows, warnings: [], interpretation: '',
  }, { title: table.caption, sourceUrl: '', ...origin, variables: run.variables.slice(0, 4) });
  const node = ADVANCED_METHODS.find(m => m.id === run.method)!.node, at = run.writing.formulas.length + 2;
  const cites = run.chart ? `[[表:@${at}]]和[[图:@${at + 2}]]` : `[[表:@${at}]]`;
  return { id: crypto.randomUUID(), node, source: '数据分析 · 高级方法', items: [
    { kind: 'paragraph', text: run.writing.text },
    ...run.writing.formulas.map(tex => ({ kind: 'formula' as const, tex })),
    { kind: 'paragraph', text: run.writing.where },
    { kind: 'table', result, caption: table.caption },
    { kind: 'paragraph', text: table.note },
    ...(run.chart ? [{ kind: 'figure' as const, result, caption: run.chart.caption }] : []),
    // The reading cites the table (and figure) above it: "@N" names the insert's own item N, resolved when the insert is applied.
    { kind: 'paragraph', text: `由${cites}可知，${run.writing.reading}` },
  ] };
}
