/**
 * Multi-response (multiple-choice, semicolon-delimited) survey item analyzer.
 *
 * Separates structural skips from item missingness and invalid choice tokens, distinguishes:
 * - Eligible answering respondent denominator `n` (`% of respondents` / 个案普及率, summing to >= 100% when multiple options are chosen)
 * - Total selections `totalSelections` (`% of responses` / 响应占比, summing to 100.0%)
 *
 * Enforces/audits `maxChoices` constraints and produces a SHA-256-verified ResultSnapshot and ReportInsert
 * directly compatible with `lib/report-figures.ts` horizontal bar charts (`barsHorizontal`).
 */

import { isMissing, type SurveyTable } from './survey-analysis.ts';
import type { ReportInsert } from './report-insert.ts';
import { snapshotRecipe, type ResultSnapshot } from './research-quality.ts';
import { exhibitName, lead, literalText } from './report-templates.ts';

export type MultiChoiceOption = {
  code: string;
  label: string;
};

export type MultiResponseRow = {
  code: string;
  label: string;
  count: number;
  /** Share among eligible answering respondents `n` (0..1). */
  respondentShare: number;
  /** Percentage among eligible answering respondents `n` (0..100). */
  respondentPct: number;
  /** Share among total selections `totalSelections` (0..1). */
  responseShare: number;
  /** Percentage among total selections `totalSelections` (0..100, sums to 100). */
  responsePct: number;
};

export type MultiResponseAnalysis = {
  column: number;
  questionLabel: string;
  totalRows: number;
  structuralSkipRows: number;
  eligibleRows: number;
  missingRows: number;
  invalidRows: number;
  /** Eligible respondent denominator: respondents who gave valid non-empty multi-select answers. */
  n: number;
  /** Total valid option selections across the `n` respondents. */
  totalSelections: number;
  meanSelections: number;
  maxChoices: number | null;
  maxObservedChoices: number;
  overLimitRows: number;
  withinMaxChoices: boolean;
  duplicateTokenRows: number;
  options: MultiResponseRow[];
  warnings: string[];
};

export type MultiResponseRefusal = {
  refused: 'invalid-column' | 'no-eligible-rows' | 'no-valid-responses' | 'exceeds-max-choices' | 'too-many-categories';
  detail: string;
  overLimitRows?: number;
};

export type MultiResponseOptions = {
  choices?: readonly MultiChoiceOption[];
  missingCodes?: readonly string[];
  /** Per-row routing eligibility mask (`false` = structural skip, excluded from missingness). */
  eligibleMask?: readonly boolean[] | null;
  structuralSkipCodes?: readonly string[];
  maxChoices?: number | null;
  overLimitPolicy?: 'flag' | 'exclude' | 'refuse';
  delimiter?: RegExp;
  keepZeroOptions?: boolean;
};

const DEFAULT_DELIMITER = /[;；]/u;

/** Split a semicolon-delimited multi-response cell into trimmed non-empty tokens. */
export function splitMultiTokens(raw: string, delimiter: RegExp = DEFAULT_DELIMITER): string[] {
  return (raw ?? '')
    .split(delimiter)
    .map(token => token.trim())
    .filter(Boolean);
}

/** Analyze a semicolon-delimited multi-select column on a SurveyTable. */
export function analyzeMultiResponse(
  table: SurveyTable,
  column: number,
  options: MultiResponseOptions = {},
): MultiResponseAnalysis | MultiResponseRefusal {
  if (!Number.isInteger(column) || column < 0 || column >= table.headers.length) {
    return { refused: 'invalid-column', detail: '请选择有效的多选题数据列。' };
  }
  const totalRows = table.rows.length;
  const mask = options.eligibleMask;
  if (mask && mask.length !== totalRows) {
    return { refused: 'invalid-column', detail: '应答资格掩码长度与数据表行数不一致。' };
  }
  if (options.maxChoices !== undefined && options.maxChoices !== null && (!Number.isInteger(options.maxChoices) || options.maxChoices < 1)) {
    return { refused: 'invalid-column', detail: '多选题限选上限须为正整数。' };
  }

  const missingCodes = [...(options.missingCodes ?? ['-99'])];
  const skipSet = new Set((options.structuralSkipCodes ?? []).map(c => c.trim()).filter(Boolean));
  const delimiter = options.delimiter ?? DEFAULT_DELIMITER;
  const maxChoices = options.maxChoices ?? null;
  const overLimitPolicy = options.overLimitPolicy ?? 'flag';

  const hasDefinedChoices = Array.isArray(options.choices) && options.choices.length > 0;
  const codeToOption = new Map<string, MultiChoiceOption>();
  const labelToOption = new Map<string, MultiChoiceOption>();
  const orderedCatalog: MultiChoiceOption[] = [];

  if (hasDefinedChoices) {
    for (const c of options.choices!) {
      const entry = { code: c.code.trim(), label: c.label.trim() };
      codeToOption.set(entry.code, entry);
      labelToOption.set(entry.label, entry);
      orderedCatalog.push(entry);
    }
  }

  let structuralSkipRows = 0;
  let missingRows = 0;
  let invalidRows = 0;
  let n = 0;
  let totalSelections = 0;
  let maxObservedChoices = 0;
  let overLimitRows = 0;
  let duplicateTokenRows = 0;

  const counts = new Map<string, number>();
  const discoveredOrder: MultiChoiceOption[] = [...orderedCatalog];
  for (const c of orderedCatalog) counts.set(c.code, 0);

  for (let i = 0; i < totalRows; i++) {
    const raw = (table.rows[i]?.[column] ?? '').trim();
    if ((mask && !mask[i]) || skipSet.has(raw)) {
      structuralSkipRows++;
      continue;
    }
    if (isMissing(raw, missingCodes)) {
      missingRows++;
      continue;
    }
    const rawTokens = splitMultiTokens(raw, delimiter);
    if (!rawTokens.length) {
      missingRows++;
      continue;
    }

    const resolvedCodes: string[] = [];
    let unknownToken = false;
    for (const tok of rawTokens) {
      if (hasDefinedChoices) {
        const hit = codeToOption.get(tok) ?? labelToOption.get(tok);
        if (!hit) {
          unknownToken = true;
          break;
        }
        resolvedCodes.push(hit.code);
      } else {
        if (!labelToOption.has(tok)) {
          const entry = { code: String(discoveredOrder.length + 1), label: tok };
          labelToOption.set(tok, entry);
          codeToOption.set(entry.code, entry);
          discoveredOrder.push(entry);
          counts.set(entry.code, 0);
        }
        resolvedCodes.push(labelToOption.get(tok)!.code);
      }
    }

    if (unknownToken) {
      invalidRows++;
      continue;
    }

    const uniqueCodes = [...new Set(resolvedCodes)];
    if (uniqueCodes.length < resolvedCodes.length) duplicateTokenRows++;
    if (uniqueCodes.length > maxObservedChoices) maxObservedChoices = uniqueCodes.length;

    if (maxChoices !== null && uniqueCodes.length > maxChoices) {
      overLimitRows++;
      if (overLimitPolicy === 'refuse') {
        return {
          refused: 'exceeds-max-choices',
          detail: `检测到答卷勾选 ${uniqueCodes.length} 项，超过题目设定的限选 ${maxChoices} 项上限。`,
          overLimitRows,
        };
      }
      if (overLimitPolicy === 'exclude') {
        invalidRows++;
        continue;
      }
    }

    n++;
    totalSelections += uniqueCodes.length;
    for (const code of uniqueCodes) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  const eligibleRows = totalRows - structuralSkipRows;
  if (eligibleRows <= 0) {
    return { refused: 'no-eligible-rows', detail: '过滤结构性跳题后没有符合应答资格的记录。' };
  }
  if (n <= 0 || totalSelections <= 0) {
    return { refused: 'no-valid-responses', detail: '该多选题没有有效的非空勾选记录。' };
  }
  if (discoveredOrder.length > 30) {
    return { refused: 'too-many-categories', detail: `多选拆分后共 ${discoveredOrder.length} 个类别，超过图表与报告表上限（30 项），请先归并长尾选项。` };
  }

  const keepZero = options.keepZeroOptions ?? hasDefinedChoices;
  const catalogIndex = new Map(discoveredOrder.map((c, idx) => [c.code, idx]));
  const optionRows: MultiResponseRow[] = discoveredOrder
    .filter(opt => keepZero || (counts.get(opt.code) ?? 0) > 0)
    .map(opt => {
      const count = counts.get(opt.code) ?? 0;
      const respondentShare = count / n;
      const responseShare = count / totalSelections;
      return {
        code: opt.code,
        label: opt.label,
        count,
        respondentShare,
        respondentPct: respondentShare * 100,
        responseShare,
        responsePct: responseShare * 100,
      };
    })
    .sort((a, b) => b.count - a.count || (catalogIndex.get(a.code) ?? 0) - (catalogIndex.get(b.code) ?? 0));

  const headerName = table.headers[column];
  const questionLabel = table.columnLabels?.[headerName] ?? headerName;
  const warnings: string[] = [
    '个案普及率以有效作答人数 n 为分母，各选项普及率之和可超过 100%；响应占比以总勾选人次为分母，各选项响应占比之和为 100%',
  ];
  if (structuralSkipRows > 0) {
    warnings.push(`结构性跳题 ${structuralSkipRows} 份已单独剥离，不计入题项未答缺失`);
  }
  if (maxChoices !== null && overLimitRows > 0) {
    warnings.push(
      overLimitPolicy === 'exclude'
        ? `检测到 ${overLimitRows} 份答卷超过限选 ${maxChoices} 项上限（最多勾选 ${maxObservedChoices} 项），已按异常作答剔除`
        : `检测到 ${overLimitRows} 份答卷超过限选 ${maxChoices} 项上限（最多勾选 ${maxObservedChoices} 项），请核查平台限选校验`,
    );
  }
  if (duplicateTokenRows > 0) {
    warnings.push(`${duplicateTokenRows} 份答卷在同一单元格内含重复选项编码，已按单人单次去重计入`);
  }
  if (invalidRows > 0 && (overLimitPolicy !== 'exclude' || invalidRows > overLimitRows)) {
    warnings.push(`${invalidRows} 份答卷含无法识别的选项编码或超限记录，未纳入分母计算`);
  }

  return {
    column,
    questionLabel,
    totalRows,
    structuralSkipRows,
    eligibleRows,
    missingRows,
    invalidRows,
    n,
    totalSelections,
    meanSelections: totalSelections / n,
    maxChoices,
    maxObservedChoices,
    overLimitRows,
    withinMaxChoices: overLimitRows === 0,
    duplicateTokenRows,
    options: optionRows,
    warnings,
  };
}

export type MultiResponseSnapshotOptions = {
  id?: string;
  title?: string;
  tableCaption?: string;
  chartCaption?: string;
  node?: string;
  sourceName: string;
  sourceHash: string;
  sourceUrl?: string;
  classification: ResultSnapshot['classification'];
  variables?: string[];
  exhibits?: readonly ('table' | 'figure')[];
  includeFormulas?: boolean;
  /**
   * Ensure horizontal bar rendering in `lib/report-figures.ts` even when caller passes short option labels
   * (`report-figures.ts` switches to `barsHorizontal` when `rows.length > 7` or max label CJK width > 12).
   */
  ensureHorizontalBars?: boolean;
};

const visualWidth = (s: string) => [...s].reduce((w, c) => w + (/[\u2E80-\uFFFD]/u.test(c) ? 2 : 1), 0);

/**
 * Build a verified ResultSnapshot and ReportInsert for a multi-response item.
 * Column 1 is `个案普及率 (%)` (`% of respondents`), Column 2 is `勾选频次`, Column 3 is `响应占比 (%)` (`% of responses`),
 * so `figurePlan(result, 1, ink)` renders horizontal bars of respondent penetration rates directly.
 */
export async function buildMultiResponseSnapshot(
  analysis: MultiResponseAnalysis,
  options: MultiResponseSnapshotOptions,
): Promise<{ result: ResultSnapshot; snapshot: ResultSnapshot; insert: ReportInsert }> {
  const title = (options.title ?? `${analysis.questionLabel}多重响应分析`).slice(0, 150);
  const tableCaption = exhibitName(options.tableCaption ?? `${analysis.questionLabel}多重响应频数与普及率统计表`, 'table');
  const chartCaption = exhibitName(options.chartCaption ?? `${analysis.questionLabel}个案普及率横向对比图`, 'chart');
  const node = options.node ?? 'sample.descriptive';
  const ensureHorizontal = options.ensureHorizontalBars !== false;
  const needsWidthPad =
    ensureHorizontal &&
    analysis.options.length <= 7 &&
    Math.max(0, ...analysis.options.map(o => visualWidth(o.label))) <= 12;

  const headers = ['选项', '个案普及率 (%)', '勾选频次', '响应占比 (%)'];
  const rows: (string | number | null)[][] = analysis.options.map((opt, idx) => {
    // Only if every option label was tiny (<= 6 CJK chars) and <= 7 options, append `（n = count）` on the top row
    // using report-figures.ts's native `（n = ...）` rich-text convention so horizontal bar layout is guaranteed.
    const rawLabel = literalText(opt.label);
    const label = needsWidthPad && idx === 0 ? `${rawLabel}（n = ${opt.count}）` : rawLabel;
    return [
      label,
      Number(opt.respondentPct.toFixed(2)),
      opt.count,
      Number(opt.responsePct.toFixed(2)),
    ];
  });

  const metrics: { label: string; value: number | null }[] = [
    { label: '有效作答人数 n', value: analysis.n },
    { label: '总勾选人次', value: analysis.totalSelections },
    { label: '人均勾选数', value: Number(analysis.meanSelections.toFixed(2)) },
    ...(analysis.maxChoices !== null
      ? [
          { label: '限选上限', value: analysis.maxChoices },
          { label: '超限答卷数', value: analysis.overLimitRows },
        ]
      : []),
    ...(analysis.structuralSkipRows > 0 ? [{ label: '结构性跳题份数', value: analysis.structuralSkipRows }] : []),
  ].slice(0, 40);

  const result = await snapshotRecipe(
    {
      method: 'multi-response',
      n: analysis.n,
      total: analysis.totalRows,
      excluded: analysis.totalRows - analysis.n,
      missingRows: analysis.missingRows,
      invalidRows: analysis.invalidRows,
      headers,
      rows,
      metrics,
      warnings: analysis.warnings,
      interpretation: `分母为有效作答受访者 n = ${analysis.n}，总勾选 ${analysis.totalSelections} 人次（人均 ${analysis.meanSelections.toFixed(2)} 项）。`,
    },
    {
      title,
      sourceName: options.sourceName,
      sourceUrl: options.sourceUrl ?? '',
      sourceHash: options.sourceHash,
      classification: options.classification,
      variables: (options.variables ?? [analysis.questionLabel]).slice(0, 4),
    },
    options.id,
  );

  const exhibits = options.exhibits ?? ['table', 'figure'];
  const includeFormulas = options.includeFormulas !== false;
  const maxChoiceNote = analysis.maxChoices !== null
    ? `；限选 ${analysis.maxChoices} 项（实测最大勾选 ${analysis.maxObservedChoices} 项，超限 ${analysis.overLimitRows} 份）`
    : '';
  const skipNote = analysis.structuralSkipRows > 0 ? `；结构性跳题 ${analysis.structuralSkipRows} 份` : '';
  const note = `注：有效作答人数 $n=${analysis.n}$，总勾选频次 $M=${analysis.totalSelections}$ 人次（人均勾选 $${analysis.meanSelections.toFixed(2)}$ 项，个案普及率合计 ${(analysis.meanSelections * 100).toFixed(1)}%，响应占比合计 100.0%）${maxChoiceNote}${skipNote}。`;

  const [first, second, last] = [analysis.options[0], analysis.options[1], analysis.options.at(-1)];
  const items: ReportInsert['items'] = [];

  if (includeFormulas) {
    items.push(
      {
        kind: 'paragraph',
        text: `针对多选题“${literalText(analysis.questionLabel)}”，严格区分以有效作答受访者人数为分母的个案普及率与以总勾选频次为分母的响应占比，两者计算式分别为`,
      },
      {
        kind: 'formula',
        tex: 'p_j^{\\mathrm{case}}=\\frac{n_j}{n},\\qquad p_j^{\\mathrm{resp}}=\\frac{n_j}{\\sum_{m=1}^{K}n_m}',
      },
      {
        kind: 'paragraph',
        text: '式中，$n_j$ 为勾选第 $j$ 个选项的受访者人数，$n$ 为该题有效作答受访者总数，$K$ 为选项总数（表中均换算为百分比呈现）。由于单人可多选，$\\sum_j p_j^{\\mathrm{case}}\\ge 1$（即各项个案普及率之和通常不低于 100%），图形展示统一采用横向条形图而非饼图。',
      },
    );
  }

  let tableIdx: number | undefined;
  let figureIdx: number | undefined;
  if (exhibits.includes('table')) {
    tableIdx = items.length;
    items.push({ kind: 'table', result, caption: tableCaption });
  }
  if (exhibits.includes('figure')) {
    figureIdx = items.length;
    items.push({ kind: 'figure', result, caption: chartCaption });
  }
  items.push({ kind: 'paragraph', text: note });

  const refs = {
    ...(tableIdx !== undefined ? { table: `@${tableIdx}` } : {}),
    ...(figureIdx !== undefined ? { figure: `@${figureIdx}` } : {}),
  };
  const reading = [
    `${lead(refs)}在 $n=${analysis.n}$ 名有效作答受访者中，累计产生 ${analysis.totalSelections} 人次勾选（人均 $${analysis.meanSelections.toFixed(2)}$ 项）。`,
    first
      ? `排在首位的是“${literalText(first.label)}”，共有 ${first.count} 人勾选，个案普及率达 ${first.respondentPct.toFixed(1)}%（占全部勾选响应的 ${first.responsePct.toFixed(1)}%）`
      : '',
    second
      ? `；其次为“${literalText(second.label)}”（个案普及率 ${second.respondentPct.toFixed(1)}%，响应占比 ${second.responsePct.toFixed(1)}%）`
      : '',
    last && last !== first && last !== second
      ? `；末位“${literalText(last.label)}”个案普及率为 ${last.respondentPct.toFixed(1)}%`
      : '',
    '。',
  ].join('');
  items.push({ kind: 'paragraph', text: reading });

  const insert: ReportInsert = {
    id: crypto.randomUUID(),
    node,
    source: '数据分析 · 多重响应分析',
    items,
  };

  return { result, snapshot: result, insert };
}
