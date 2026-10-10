/** Deterministic, browser-safe survey analysis. No I/O, storage, automatic cleaning or inference. */
export const SURVEY_LIMITS = { bytes: 2_000_000, rows: 5000, columns: 80, cells: 200000, cellLength: 2000, scaleItems: 30 } as const;
export type Delimiter = "," | "\t" | ";";
export type SurveyTable = { headers: string[]; rows: string[][]; skippedBlankLines: number; delimiter: Delimiter };
export type NumericSummary = { n: number; mean: number; sd: number | null; min: number; q1: number; median: number; q3: number; max: number };
export type ColumnSummary = { index: number; name: string; missing: number; numeric: number; nonNumeric: number; distinct: number; likelyIdentifier: boolean; stats: NumericSummary | null };
export type SurveyProfile = { rows: number; columns: ColumnSummary[]; missingCells: number; totalCells: number; duplicateRows: number };
export type ScaleOptions = { columns: number[]; reverse: number[]; min: number; max: number; missingCodes: string[] };
export type ReliabilityResult = { n: number; total: number; excluded: number; missingRows: number; nonNumericRows: number; outOfRangeRows: number; k: number; alpha: number | null; aggregate: { itemVarianceSum: number; totalVariance: number } | null; warnings: string[]; items: { index: number; name: string; reversed: boolean; mean: number | null; sd: number | null; correctedItemTotal: number | null; alphaIfDeleted: number | null }[] };

export function parseSurveyCsv(input: string, delimiter: Delimiter = ","): SurveyTable {
  if (![",", "\t", ";"].includes(delimiter)) throw new Error("请选择逗号、分号或制表符分隔。");
  if (new TextEncoder().encode(input).length > SURVEY_LIMITS.bytes) throw new Error("文件超过 2 MB，请拆分后再分析。");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(input)) throw new Error("文件含不支持的控制字符；请另存为 CSV 文本。");
  const text = input.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closed = false, touched = false, skippedBlankLines = 0;
  const finishField = () => {
    if (field.length > SURVEY_LIMITS.cellLength) throw new Error("单元格超过 2,000 字，请移除过长开放题或拆分文件。");
    row.push(field); field = ""; closed = false;
    if (row.length > SURVEY_LIMITS.columns) throw new Error("最多支持 80 列。");
  };
  const finishRow = () => {
    if (!touched && !row.length && !field.length) { skippedBlankLines++; return; }
    finishField(); records.push(row); row = []; touched = false;
    if (records.length > SURVEY_LIMITS.rows + 1) throw new Error("最多支持 5,000 条数据记录。");
    if (records.length * records[0].length > SURVEY_LIMITS.cells + records[0].length) throw new Error("最多支持 200,000 个数据单元格。");
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === delimiter) { finishField(); touched = true; }
    else if (c === "\n" || c === "\r") { finishRow(); if (c === "\r" && text[i + 1] === "\n") i++; }
    else if (closed) throw new Error(`第 ${records.length + 1} 条记录的引号后有多余字符。`);
    else if (c === '"') { if (field.length) throw new Error(`第 ${records.length + 1} 条记录的引号位置不合法。`); quoted = true; touched = true; }
    else { field += c; touched = true; }
    if (field.length > SURVEY_LIMITS.cellLength) throw new Error("单元格超过 2,000 字。");
  }
  if (quoted) throw new Error("存在未闭合的双引号，请检查 CSV 导出格式。");
  if (touched || row.length || field.length || closed) finishRow();
  if (records.length < 2) throw new Error("至少需要表头和一条数据记录。");
  const headers = records[0].map(x => x.trim());
  if (headers.some(x => !x || x.length > 120)) throw new Error("列名不能为空，且不能超过 120 字。");
  if (new Set(headers).size !== headers.length) throw new Error("列名重复，请为每道题保留唯一列名。");
  for (let i = 1; i < records.length; i++) if (records[i].length !== headers.length) throw new Error(`第 ${i + 1} 条非空记录有 ${records[i].length} 列，表头有 ${headers.length} 列。请核对分隔符；未自动补齐或截断。`);
  return { headers, rows: records.slice(1), skippedBlankLines, delimiter };
}

export function parseMissingCodes(input: string): string[] {
  const codes = [...new Set(input.split(";").map(x => x.trim()).filter(Boolean))];
  if (codes.length > 20 || codes.some(c => c.length > 40)) throw new Error("最多 20 个缺失代码，每个不超过 40 字，用英文分号分隔。");
  return codes;
}
export const isMissing = (value: string, codes: string[]) => value.trim() === "" || codes.includes(value.trim());
export function finiteNumber(text: string): number | null {
  const value = text.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return null;
  const n = Number(value);
  // A deliberate computational bound, not a survey exclusion standard.
  const underflow = n === 0 && /[1-9]/.test(value.split(/[eE]/)[0]);
  return Number.isFinite(n) && Math.abs(n) <= 1e12 && !underflow ? n : null;
}
function moments(values: number[]) {
  const origin = values[0] || 0;
  const shifted = values.map(x => x - origin);
  const scale = shifted.reduce((largest, x) => Math.max(largest, Math.abs(x)), 0) || 1;
  let mean = 0, sumSquares = 0;
  shifted.forEach((x, i) => { const normalized = x / scale, delta = normalized - mean; mean += delta / (i + 1); sumSquares += delta * (normalized - mean); });
  const variance = values.length > 1 ? Math.max(0, sumSquares / (values.length - 1)) : null;
  return { mean: origin + mean * scale, variance: variance === null ? null : variance * scale * scale, sd: variance === null ? null : Math.sqrt(variance) * scale };
}
/** Column shifts and one shared positive scale preserve raw alpha, including unequal item units. */
function centeredColumns(columns: number[][]): number[][] {
  const shifted = columns.map(column => column.map(x => x - (column[0] || 0)));
  const scale = shifted.reduce((largest, column) => column.reduce((max, x) => Math.max(max, Math.abs(x)), largest), 0) || 1;
  return shifted.map(column => column.map(x => x / scale));
}
function compensatedSum(values: number[]): number {
  let sum = 0, correction = 0;
  for (const value of values) { const next = sum + value; correction += Math.abs(sum) >= Math.abs(value) ? (sum - next) + value : (value - next) + sum; sum = next; }
  return sum + correction;
}
function shiftedTotals(columns: number[][]): number[] {
  return columns[0]?.map((_, row) => compensatedSum(columns.map(column => column[row] - (column[0] || 0)))) || [];
}
/** R type 7: h = (n - 1)p; linear interpolation of adjacent order statistics. */
function quantile(sorted: number[], p: number) { const h = (sorted.length - 1) * p, i = Math.floor(h); return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (h - i); }
export function describeNumbers(values: number[]): NumericSummary | null {
  if (!values.length) return null;
  if (values.some(x => !Number.isFinite(x) || Math.abs(x) > 1e12)) throw new Error("数值超出计算范围。");
  const ordered = [...values].sort((a, b) => a - b), stats = moments(values);
  return { n: values.length, mean: stats.mean, sd: stats.sd, min: ordered[0], q1: quantile(ordered, .25), median: quantile(ordered, .5), q3: quantile(ordered, .75), max: ordered[ordered.length - 1] };
}
export function profileSurvey(table: SurveyTable, missingCodes: string[] = []): SurveyProfile {
  const seen = new Set<string>(); let duplicateRows = 0;
  table.rows.forEach(row => { const key = JSON.stringify(row); if (seen.has(key)) duplicateRows++; seen.add(key); });
  const columns = table.headers.map((name, index) => {
    let missing = 0, nonNumeric = 0; const values: number[] = [], distinct = new Set<string>();
    table.rows.forEach(row => { const value = row[index]; if (isMissing(value, missingCodes)) { missing++; return; } distinct.add(value.trim()); const number = finiteNumber(value); if (number === null) nonNumeric++; else values.push(number); });
    const likelyIdentifier = /(?:姓名|手机|电话|邮箱|身份证|学号|住址|地址|编号|(^|[_\s])id($|[_\s])|email|phone|name)/i.test(name);
    return { index, name, missing, numeric: values.length, nonNumeric, distinct: distinct.size, likelyIdentifier, stats: likelyIdentifier ? null : describeNumbers(values) };
  });
  return { rows: table.rows.length, columns, missingCells: columns.reduce((n, c) => n + c.missing, 0), totalCells: table.rows.length * table.headers.length, duplicateRows };
}
export function categoryCounts(table: SurveyTable, column: number, missingCodes: string[] = []) {
  if (!Number.isInteger(column) || column < 0 || column >= table.headers.length) throw new Error("请选择有效列。");
  const counts = new Map<string, number>(); let missing = 0;
  table.rows.forEach(row => { if (isMissing(row[column], missingCodes)) missing++; else { const value = row[column].trim(); counts.set(value, (counts.get(value) || 0) + 1); } });
  return { n: table.rows.length - missing, missing, values: [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN")) };
}
function correlation(x: number[], y: number[]): number | null {
  [x] = centeredColumns([x]); [y] = centeredColumns([y]);
  const mx = moments(x), my = moments(y);
  if (!mx.variance || !my.variance || x.length < 2) return null;
  const cov = x.reduce((sum, value, i) => sum + (value - mx.mean) * (y[i] - my.mean), 0) / (x.length - 1);
  return Math.max(-1, Math.min(1, cov / Math.sqrt(mx.variance * my.variance)));
}
function alphaAggregate(columns: number[][]): { itemVarianceSum: number; totalVariance: number } | null {
  if (columns.length < 2 || columns[0].length < 2) return null;
  const shifted = columns.map(column => column.map(x => x - column[0]));
  const scale = shifted.reduce((largest, column) => column.reduce((max, x) => Math.max(max, Math.abs(x)), largest), 0) || 1;
  const variances = shifted.map(column => moments(column.map(x => x / scale)).variance || 0);
  // Sum before dividing: a non-binary scale must not introduce variation into exact constant totals.
  const totalVariance = moments(shiftedTotals(columns).map(x => x / scale)).variance;
  if (!totalVariance) return null;
  return { itemVarianceSum: compensatedSum(variances), totalVariance };
}
function rawAlpha(columns: number[][]): number | null {
  const aggregate = alphaAggregate(columns);
  if (!aggregate) return null;
  const result = columns.length / (columns.length - 1) * (1 - aggregate.itemVarianceSum / aggregate.totalVariance);
  return Number.isFinite(result) ? result : null;
}
export function analyzeReliability(table: SurveyTable, options: ScaleOptions): ReliabilityResult {
  const { columns, reverse, min, max, missingCodes } = options;
  if (columns.length < 2 || columns.length > SURVEY_LIMITS.scaleItems || new Set(columns).size !== columns.length || columns.some(c => !Number.isInteger(c) || c < 0 || c >= table.headers.length)) throw new Error("请选择同一构念的 2–30 个不同题项。");
  if (new Set(reverse).size !== reverse.length || reverse.some(c => !columns.includes(c))) throw new Error("反向题必须来自当前选中的题项。");
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max || Math.max(Math.abs(min), Math.abs(max)) > 1e6) throw new Error("请设置有效的计分上下限，下限必须小于上限（绝对值不超过一百万）。");
  const data: number[][] = []; let missingRows = 0, nonNumericRows = 0, outOfRangeRows = 0;
  table.rows.forEach(row => {
    let missing = false, invalid = false, outside = false;
    const values = columns.map(c => { const cell = row[c]; if (isMissing(cell, missingCodes)) { missing = true; return 0; } const value = finiteNumber(cell); if (value === null) { invalid = true; return 0; } if (value < min || value > max) outside = true; return reverse.includes(c) ? min + max - value : value; });
    if (missing) missingRows++; if (invalid) nonNumericRows++; if (outside) outOfRangeRows++;
    if (!missing && !invalid && !outside) data.push(values);
  });
  const byItem = columns.map((_, i) => data.map(row => row[i])), warnings: string[] = [];
  if (data.length < 2) warnings.push("完整案例少于 2 行，无法计算样本方差与 α。");
  else if (data.length < 30) warnings.push("当前样本很小，结果可能不稳定；30 不是通用合格线，请结合设计与不确定性判断。");
  const constants = columns.filter((_, i) => data.length >= 2 && byItem[i].every(value => value === byItem[i][0]));
  if (constants.length) warnings.push(`有 ${constants.length} 个零方差题项，计算仍保留这些题项；请核对编码与题项内容，不能据此直接判断量表合格。`);
  const alpha = rawAlpha(byItem);
  if (data.length >= 2 && alpha === null) warnings.push("总分无变异或计算退化，α 未定义。");
  if (alpha !== null && alpha < 0) warnings.push("α 为负值：请检查反向计分、题项是否同向及构念一致性，不能把负值截为 0。");
  if (alpha !== null && alpha > .95) warnings.push("一致性很高也可能意味着题项冗余，请结合内容和维度结构复核。");
  warnings.push("α 是内部一致性指标，不证明单维性、效度、代表性或获奖水平；不要只为提高 α 而删除题项。");
  return { n: data.length, total: table.rows.length, excluded: table.rows.length - data.length, missingRows, nonNumericRows, outOfRangeRows, k: columns.length, alpha, aggregate: alphaAggregate(byItem), warnings, items: columns.map((index, j) => {
    const values = byItem[j], other = byItem.filter((_, i) => i !== j), stats = moments(values);
    return { index, name: table.headers[index], reversed: reverse.includes(index), mean: values.length ? stats.mean : null, sd: stats.sd, correctedItemTotal: values.length >= 2 ? correlation(values, shiftedTotals(other)) : null, alphaIfDeleted: rawAlpha(other) };
  }) };
}

export const DEMO_SURVEY_CSV = `渠道,体验清晰,操作方便,遇到困难_反向,推荐意愿
校园,5,5,1,5
社区,4,4,2,4
校园,3,4,3,3
社区,2,2,4,2
校园,1,2,5,1
社区,4,5,2,4
校园,5,4,1,5
社区,3,3,3,3
校园,2,3,4,2
社区,4,,2,4
校园,99,3,3,3
校园,5,5,1,5`;
