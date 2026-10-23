/**
 * Bridges a survey table (the dataset loaded in 数据分析) to the complex-sample and weighting tools.
 * Missing outcomes stay in the design as records outside the domain, so strata and PSUs are preserved,
 * which is how survey software treats item nonresponse in variance estimation.
 */
import { finiteNumber, isMissing, type SurveyTable } from './survey-analysis.ts';
import type { DesignRow } from './sampling-variance.ts';
import type { RakeMargin } from './sampling-weights.ts';

export const MISSING_CATEGORY = '（缺失）';
export type ColumnKind = { index: number; name: string; numeric: boolean; categories: string[]; missing: number };
/** Numeric when at least 90% of answered cells are numbers; categories are listed when there are at most 30. */
export function describeColumn(table: SurveyTable, index: number, codes: string[]): ColumnKind {
  let numeric = 0, answered = 0, missing = 0;
  const seen = new Map<string, number>();
  for (const row of table.rows) {
    const cell = row[index] ?? '';
    if (isMissing(cell, codes)) { missing++; continue; }
    answered++;
    if (finiteNumber(cell) !== null) numeric++;
    const key = cell.trim();
    if (seen.size <= 30 || seen.has(key)) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const categories = seen.size <= 30 ? [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k) : [];
  return { index, name: table.headers[index], numeric: answered > 0 && numeric / answered >= 0.9, categories, missing };
}

export type DesignColumns = { y: number; category: string | null; weight: number | null; stratum: number | null; psu: number | null; domain: { column: number; value: string } | null };
export type DesignBuild = { rows: DesignRow[]; excluded: number; invalidY: number; droppedWeights: number; warnings: string[] };
/** Turn table rows into design rows. External weights (e.g. from raking) override the weight column. */
export function buildDesignRows(table: SurveyTable, columns: DesignColumns, codes: string[], externalWeights: number[] | null = null): DesignBuild {
  if (externalWeights && externalWeights.length !== table.rows.length) throw Error('权数个数与数据行数不一致，请重新计算权数。');
  const rows: DesignRow[] = [], warnings: string[] = [];
  let excluded = 0, invalidY = 0, droppedWeights = 0;
  table.rows.forEach((row, i) => {
    const w = externalWeights ? externalWeights[i] : columns.weight === null ? 1 : finiteNumber(row[columns.weight] ?? '');
    if (w === null || !(w > 0)) { droppedWeights++; return; }
    const stratumCell = columns.stratum === null ? '全部' : (row[columns.stratum] ?? '').trim();
    if (columns.stratum !== null && isMissing(stratumCell, codes)) throw Error(`第 ${i + 1} 行的分层变量缺失；每条记录都需要所属的层。`);
    const psuCell = columns.psu === null ? `#${i + 1}` : (row[columns.psu] ?? '').trim();
    if (columns.psu !== null && isMissing(psuCell, codes)) throw Error(`第 ${i + 1} 行的初级单元编号缺失。`);
    const cell = row[columns.y] ?? '';
    let y = 0, inDomain = true;
    if (isMissing(cell, codes)) inDomain = false;
    else if (columns.category !== null) y = cell.trim() === columns.category ? 1 : 0;
    else { const v = finiteNumber(cell); if (v === null) { invalidY++; inDomain = false; } else y = v; }
    if (!inDomain) excluded++;
    if (columns.domain && (row[columns.domain.column] ?? '').trim() !== columns.domain.value) inDomain = false;
    rows.push({ y, w, stratum: stratumCell, psu: `${stratumCell}::${psuCell}`, inDomain });
  });
  if (droppedWeights) warnings.push(`${droppedWeights} 条记录的权数缺失或不为正数，未参与计算。`);
  if (excluded) warnings.push(`${excluded} 条记录的结果变量缺失${invalidY ? `（其中 ${invalidY} 条不是数值）` : ''}，按“子总体之外”保留在设计中，不删除，以免改变分层与群结构。`);
  return { rows, excluded, invalidY, droppedWeights, warnings };
}

/** Category of every row for each control variable; missing answers become their own category. */
export function marginValues(table: SurveyTable, column: number, codes: string[]): string[] {
  return table.rows.map(row => { const cell = row[column] ?? ''; return isMissing(cell, codes) ? MISSING_CATEGORY : cell.trim(); });
}
/** Population targets given as percentages are rescaled so that each margin sums to `total`. */
export function marginsFromShares(table: SurveyTable, controls: { column: number; shares: Record<string, number> }[], codes: string[], total: number): RakeMargin[] {
  if (!(total > 0)) throw Error('权数合计须大于 0。');
  return controls.map(c => {
    const name = table.headers[c.column], sumShares = Object.values(c.shares).reduce((s, v) => s + v, 0);
    if (Object.values(c.shares).some(v => !(v > 0))) throw Error(`「${name}」的每个类别都需要大于 0 的目标比例；样本中没有的类别请先与相邻类别合并。`);
    if (!(sumShares > 0)) throw Error(`「${name}」的目标比例合计须大于 0。`);
    return { name, values: marginValues(table, c.column, codes), targets: Object.fromEntries(Object.entries(c.shares).map(([k, v]) => [k, v / sumShares * total])) };
  });
}
