/**
 * Response-quality checks for imported survey data.
 * Rules are registered before results are seen; flagged rows are listed with reasons,
 * never silently dropped. The original table is not modified.
 */
import { isMissing, type SurveyTable } from './survey-analysis.ts';

export type QualityRules = {
  /** Response identifier used in the exclusion ledger (e.g. 问卷星「序号」). */
  idColumn: number | null;
  duration: { column: number; mode: 'median-fraction' | 'seconds'; value: number } | null;
  straightlining: { columns: number[] } | null;
  attention: { column: number; expected: string } | null;
  duplicateIp: { column: number } | null;
  duplicateAnswers: boolean;
};
export type RuleId = 'duration' | 'straightlining' | 'attention' | 'duplicateIp' | 'duplicateAnswers';
export type RuleSummary = { id: RuleId; label: string; criterion: string; flagged: number; unparsed?: number };
export type FlaggedRow = { row: number; id: string; reasons: RuleId[] };
export type QualityReport = { total: number; kept: number; flagged: FlaggedRow[]; rules: RuleSummary[]; notes: string[] };

const ID_HEADER = /^(序号|编号|答卷编号|答卷id|response ?id|id|respondent ?id)$/i;
// Whole-header matches for platform fields only, so questions such as 通勤用时（分钟） are never mistaken for response time.
const DURATION_HEADER = /^(所用时间|答题时长|作答时长|填写时长|答题用时|所用时间[（(]秒[)）]|duration|duration \(in seconds\)|time ?taken)$/i;
const IP_HEADER = /来自ip|ip地址|^ip$|^ip ?address$/i;
// Platform metadata only, so ordinary questions that mention time stay in the comparison.
const META_TIME_HEADER = /^(提交答卷时间|开始时间|结束时间|提交时间|开始答题时间|所用时间|答题时长|作答时长|填写时长|答题用时|所用时间[（(]秒[)）]|start ?time|end ?time|submit(ted)? ?(at|time)?|duration|duration \(in seconds\)|time ?taken)$/i;
/** Guess platform metadata columns from their headers; the user confirms before use. */
/** Imported XLSX/SAV tables keep stable IDs as headers and the platform names as labels; check both. */
const matches = (table: SurveyTable, column: number, pattern: RegExp) => [table.headers[column], table.columnLabels?.[table.headers[column]]].some(name => !!name && pattern.test(name.trim()));
export function detectQualityColumns(table: SurveyTable): { id: number | null; duration: number | null; ip: number | null } {
  const find = (pattern: RegExp) => { const i = table.headers.findIndex((_, c) => matches(table, c, pattern)); return i < 0 ? null : i; };
  return { id: find(ID_HEADER), duration: find(DURATION_HEADER), ip: find(IP_HEADER) };
}

/** Columns that look like rating items: mostly numeric answers with at most 11 distinct values. */
export function likertCandidates(table: SurveyTable, missingCodes: string[] = []): number[] {
  const skip = new Set(Object.values(detectQualityColumns(table)).filter((v): v is number => v !== null));
  return table.headers.flatMap((h, c) => {
    if (skip.has(c) || matches(table, c, META_TIME_HEADER)) return [];
    const values = table.rows.map(r => r[c]).filter(v => !isMissing(v, missingCodes)).map(v => v.trim());
    if (!values.length) return [];
    const numeric = values.filter(v => /^-?\d+(\.\d+)?$/.test(v));
    return numeric.length / values.length >= 0.9 && new Set(numeric).size <= 11 ? [c] : [];
  });
}
/** Seconds from "123", "123秒", "2分3秒", "1.5分钟", "00:02:03" or "02:03"; null when unreadable. */
export function parseDurationSeconds(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/.exec(t);
  if (clock) return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  const parts = /^(?:(\d+(?:\.\d+)?)\s*(?:小时|时|h))?\s*(?:(\d+(?:\.\d+)?)\s*(?:分钟|分|min|m))?\s*(?:(\d+(?:\.\d+)?)\s*(?:秒|s|sec))?$/i.exec(t);
  if (parts && (parts[1] || parts[2] || parts[3])) return Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0);
  return null;
}
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function validateRules(table: SurveyTable, rules: QualityRules): string[] {
  const issues: string[] = [], valid = (c: number | null | undefined) => c !== null && c !== undefined && Number.isInteger(c) && c >= 0 && c < table.headers.length;
  if (rules.idColumn !== null && !valid(rules.idColumn)) issues.push('答卷编号列无效。');
  if (rules.duration) {
    if (!valid(rules.duration.column)) issues.push('请选择作答时长列。');
    if (rules.duration.mode === 'median-fraction' && !(rules.duration.value > 0 && rules.duration.value < 1)) issues.push('时长阈值须为中位数的 0–1 倍之间。');
    if (rules.duration.mode === 'seconds' && !(rules.duration.value > 0)) issues.push('最短作答秒数须大于 0。');
  }
  if (rules.straightlining && (rules.straightlining.columns.length < 3 || !rules.straightlining.columns.every(valid) || new Set(rules.straightlining.columns).size !== rules.straightlining.columns.length)) issues.push('直线作答检查至少选择 3 道同一量表的题目。');
  if (rules.attention && (!valid(rules.attention.column) || !rules.attention.expected.trim())) issues.push('注意力题须选择题目并填写正确答案。');
  if (rules.duplicateIp && !valid(rules.duplicateIp.column)) issues.push('请选择 IP 列。');
  if (!rules.duration && !rules.straightlining && !rules.attention && !rules.duplicateIp && !rules.duplicateAnswers) issues.push('至少启用一条规则。');
  return issues;
}

export function evaluateQuality(table: SurveyTable, rules: QualityRules, missingCodes: string[] = []): QualityReport {
  const issues = validateRules(table, rules);
  if (issues.length) throw Error(issues.join(''));
  const reasons = table.rows.map(() => new Set<RuleId>()), summaries: RuleSummary[] = [], notes: string[] = [];
  if (rules.duration) {
    const { column, mode, value } = rules.duration, seconds = table.rows.map(r => parseDurationSeconds(r[column]));
    const readable = seconds.filter((s): s is number => s !== null), unparsed = seconds.length - readable.length;
    const threshold = mode === 'seconds' ? value : readable.length ? median(readable) * value : NaN;
    let flagged = 0;
    seconds.forEach((s, i) => { if (s !== null && Number.isFinite(threshold) && s < threshold) { reasons[i].add('duration'); flagged++; } });
    summaries.push({ id: 'duration', label: '作答过快', criterion: mode === 'seconds' ? `用时少于 ${value} 秒` : `用时少于中位数（${readable.length ? round(median(readable)) : '—'} 秒）的 ${round(value * 100)}%，即 ${Number.isFinite(threshold) ? round(threshold) : '—'} 秒`, flagged, unparsed });
    if (unparsed) notes.push(`${unparsed} 行作答时长无法读取，未按时长规则标记；请核对该列格式。`);
  }
  if (rules.straightlining) {
    const cols = rules.straightlining.columns;
    let flagged = 0;
    table.rows.forEach((r, i) => {
      const answers = cols.map(c => r[c]);
      if (answers.some(a => isMissing(a, missingCodes))) return;
      if (new Set(answers.map(a => a.trim())).size === 1) { reasons[i].add('straightlining'); flagged++; }
    });
    summaries.push({ id: 'straightlining', label: '直线作答', criterion: `${cols.length} 道量表题全部选同一选项（仅检查答全的行）`, flagged });
    notes.push('直线作答可能是真实一致的态度；量表中含反向题时更能区分。建议先复核标记行，再决定是否剔除。');
  }
  if (rules.attention) {
    const { column, expected } = rules.attention, want = expected.trim();
    let flagged = 0;
    table.rows.forEach((r, i) => { if (r[column].trim() !== want) { reasons[i].add('attention'); flagged++; } });
    summaries.push({ id: 'attention', label: '注意力题未通过', criterion: `「${table.headers[column]}」不等于「${want}」（未作答也计为未通过）`, flagged });
  }
  if (rules.duplicateIp) {
    const { column } = rules.duplicateIp, seen = new Set<string>();
    let flagged = 0;
    table.rows.forEach((r, i) => { const ip = r[column].trim(); if (!ip) return; if (seen.has(ip)) { reasons[i].add('duplicateIp'); flagged++; } else seen.add(ip); });
    summaries.push({ id: 'duplicateIp', label: '同一 IP 重复提交', criterion: '同一 IP 第 2 次及以后的提交（保留首次）', flagged });
    notes.push('校园网、公司网和移动网络可能多人共用 IP；同 IP 只作复核线索，结合时长和答案内容再判断。');
  }
  if (rules.duplicateAnswers) {
    const skip = new Set<number>([rules.idColumn ?? -1, rules.duration?.column ?? -1, rules.duplicateIp?.column ?? -1]);
    table.headers.forEach((_, i) => { if (matches(table, i, META_TIME_HEADER) || matches(table, i, IP_HEADER) || matches(table, i, ID_HEADER)) skip.add(i); });
    const seen = new Set<string>();
    let flagged = 0;
    table.rows.forEach((r, i) => { const key = JSON.stringify(r.filter((_, c) => !skip.has(c)).map(v => v.trim())); if (seen.has(key)) { reasons[i].add('duplicateAnswers'); flagged++; } else seen.add(key); });
    summaries.push({ id: 'duplicateAnswers', label: '答案完全重复', criterion: '除编号、时间、时长和 IP 列外所有答案相同的第 2 份及以后', flagged });
  }
  const flagged = reasons.flatMap((set, i) => set.size ? [{ row: i + 2, id: rules.idColumn === null ? '' : table.rows[i][rules.idColumn].trim(), reasons: [...set] }] : []);
  if (summaries.length > 1 && flagged.length < summaries.reduce((s, r) => s + r.flagged, 0)) notes.push('一行可能同时触发多条规则；剔除行数按行计，不是各规则计数之和。');
  return { total: table.rows.length, kept: table.rows.length - flagged.length, flagged, rules: summaries, notes };
}
const round = (n: number) => Math.round(n * 10) / 10;

/** Rows that triggered none of the selected rules, in original order. */
export function keptTable(table: SurveyTable, report: QualityReport, excluded: ReadonlySet<RuleId>): { table: SurveyTable; removed: number } {
  const drop = new Set(report.flagged.filter(f => f.reasons.some(r => excluded.has(r))).map(f => f.row - 2));
  return { table: { ...table, rows: table.rows.filter((_, i) => !drop.has(i)) }, removed: drop.size };
}

const csvCell = (v: string) => /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
export function tableCsv(table: SurveyTable): string {
  return [table.headers, ...table.rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
/** Ledger rows: original row number, response ID, reasons, and whether the row was excluded. */
export function exclusionLedger(report: QualityReport, excluded: ReadonlySet<RuleId>, meta: { sourceName: string; sourceHash: string; registeredAt: string }): string {
  const label = new Map(report.rules.map(r => [r.id, r.label]));
  const header = [`# 来源 ${meta.sourceName}`, `# SHA-256 ${meta.sourceHash}`, `# 规则登记 ${meta.registeredAt}`, ...report.rules.map(r => `# ${r.label}：${r.criterion}${excluded.has(r.id) ? '（剔除）' : '（仅标记）'}`)];
  const rows = report.flagged.map(f => [String(f.row), f.id, f.reasons.map(r => label.get(r)).join('；'), f.reasons.some(r => excluded.has(r)) ? '剔除' : '保留待复核']);
  return [...header, ['原表行号', '答卷编号', '触发规则', '处理'].join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
}
