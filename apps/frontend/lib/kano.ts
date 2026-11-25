/**
 * KANO paired-question demand classification analyzer (Kano et al., 1984; Berger et al., 1993).
 *
 * Evaluates paired functional ("如果具备该功能") and dysfunctional ("如果不具备该功能") 5-level questions
 * through the standard 5×5 KANO evaluation matrix into six categories:
 * - M (Must-be / 必备型)
 * - O (One-dimensional / 期望型)
 * - A (Attractive / 魅力型)
 * - I (Indifferent / 无差异型)
 * - R (Reverse / 反向型)
 * - Q (Questionable / 可疑结果)
 *
 * Separates structural skips (ineligible respondents routed past the module) from item missingness and
 * invalid response codes, computes Better = (A + O) / (A + O + M + I) and Worse = -(O + M) / (A + O + M + I),
 * and produces a SHA-256-verified ResultSnapshot and ReportInsert for the report editor.
 */

import { isMissing, type SurveyTable } from './survey-analysis.ts';
import type { ReportInsert } from './report-insert.ts';
import { snapshotRecipe, type ResultSnapshot } from './research-quality.ts';
import { coef, exhibitName, lead, literalText } from './report-templates.ts';

export type KanoLevel = 1 | 2 | 3 | 4 | 5;
export type KanoCategory = 'M' | 'O' | 'A' | 'I' | 'R' | 'Q';

export const KANO_CATEGORY_LABELS: Readonly<Record<KanoCategory, string>> = {
  M: '必备型（M）',
  O: '期望型（O）',
  A: '魅力型（A）',
  I: '无差异型（I）',
  R: '反向型（R）',
  Q: '可疑结果（Q）',
};

const DOMINANCE_ORDER: readonly KanoCategory[] = ['M', 'O', 'A', 'I', 'R', 'Q'];

/**
 * Standard 5×5 KANO evaluation matrix: rows = functional (具备, 1..5), columns = dysfunctional (不具备, 1..5).
 * 1 = 我很喜欢/很满意, 2 = 理应如此, 3 = 无所谓, 4 = 可以忍受, 5 = 我很不喜欢/很不满意.
 */
export const KANO_MATRIX: readonly (readonly [KanoCategory, KanoCategory, KanoCategory, KanoCategory, KanoCategory])[] = [
  ['Q', 'A', 'A', 'A', 'O'],
  ['R', 'I', 'I', 'I', 'M'],
  ['R', 'I', 'I', 'I', 'M'],
  ['R', 'I', 'I', 'I', 'M'],
  ['R', 'R', 'R', 'R', 'Q'],
] as const;

const LEVEL_PATTERNS: readonly [RegExp, KanoLevel][] = [
  [/^(?:1|(?:1\s*[.．、:：)\]]\s*)?(?:我很喜欢|非常喜欢|很喜欢|喜欢|非常满意|很满意|满意))$/u, 1],
  [/^(?:2|(?:2\s*[.．、:：)\]]\s*)?(?:理应如此|应当如此|理所当然|应该如此|本该如此|必须如此))$/u, 2],
  [/^(?:3|(?:3\s*[.．、:：)\]]\s*)?(?:无所谓|中立|一般|说不清|没感觉|无感))$/u, 3],
  [/^(?:4|(?:4\s*[.．、:：)\]]\s*)?(?:可以忍受|勉强接受|能忍受|尚可忍受|可忍受|勉强可以|还能接受))$/u, 4],
  [/^(?:5|(?:5\s*[.．、:：)\]]\s*)?(?:我很不喜欢|非常不喜欢|很不喜欢|不喜欢|非常不满意|很不满意|不满意|无法接受))$/u, 5],
];

/** Parse a raw survey answer cell into a 1..5 KANO level, supporting numeric codes and Chinese anchor labels. */
export function parseKanoLevel(raw: string, customMap?: ReadonlyMap<string, KanoLevel>): KanoLevel | null {
  const trimmed = (raw ?? '').normalize('NFKC').trim();
  if (!trimmed) return null;
  if (customMap?.has(trimmed)) return customMap.get(trimmed)!;
  for (const [pattern, level] of LEVEL_PATTERNS) {
    if (pattern.test(trimmed)) return level;
  }
  return null;
}

/** Map a (functional, dysfunctional) pair on 1..5 onto its KANO category M/O/A/I/R/Q. */
export function classifyKanoPair(functional: number, dysfunctional: number): KanoCategory | null {
  if (!Number.isInteger(functional) || !Number.isInteger(dysfunctional)) return null;
  if (functional < 1 || functional > 5 || dysfunctional < 1 || dysfunctional > 5) return null;
  return KANO_MATRIX[functional - 1][dysfunctional - 1];
}

export type KanoPairSpec = {
  name: string;
  functionalCol: number;
  dysfunctionalCol: number;
};

export type KanoFeatureSummary = {
  name: string;
  functionalCol: number;
  dysfunctionalCol: number;
  totalRows: number;
  structuralSkipRows: number;
  eligibleRows: number;
  missingRows: number;
  invalidRows: number;
  validN: number;
  counts: Record<KanoCategory, number>;
  shares: Record<KanoCategory, number>;
  dominantCategory: KanoCategory;
  dominantLabel: string;
  effectiveDenominator: number;
  better: number | null;
  worse: number | null;
  questionableRate: number;
};

export type KanoAnalysis = {
  totalRows: number;
  structuralSkipRows: number;
  eligibleRows: number;
  /** Minimum valid paired responses across features (or exact n when all pairs share the same completeness). */
  n: number;
  maxValidN: number;
  anyMissingRows: number;
  anyInvalidRows: number;
  features: KanoFeatureSummary[];
  warnings: string[];
};

export type KanoRefusal = {
  refused: 'no-pairs' | 'invalid-column' | 'duplicate-column' | 'no-eligible-rows' | 'too-few-cases';
  detail: string;
};

export type KanoOptions = {
  missingCodes?: readonly string[];
  /**
   * Optional per-row eligibility mask aligned with `table.rows`. Rows where `eligibleMask[i] === false`
   * are counted as `structuralSkipRows` rather than item missingness.
   */
  eligibleMask?: readonly boolean[] | null;
  /** Optional structural-skip sentinel codes (e.g. `['-98']`) when structural skips carry a dedicated code. */
  structuralSkipCodes?: readonly string[];
  choiceMap?: ReadonlyMap<string, KanoLevel>;
  minCases?: number;
};

/** Run KANO paired evaluation across one or more (functional, dysfunctional) column pairs. */
export function analyzeKano(
  table: SurveyTable,
  pairs: readonly KanoPairSpec[],
  options: KanoOptions = {},
): KanoAnalysis | KanoRefusal {
  if (!pairs.length) return { refused: 'no-pairs', detail: '请至少配置一对 KANO 正反向题目。' };
  const colCount = table.headers.length;
  const usedCols: number[] = [];
  for (const p of pairs) {
    if (
      !Number.isInteger(p.functionalCol) || p.functionalCol < 0 || p.functionalCol >= colCount ||
      !Number.isInteger(p.dysfunctionalCol) || p.dysfunctionalCol < 0 || p.dysfunctionalCol >= colCount
    ) {
      return { refused: 'invalid-column', detail: `属性“${p.name}”引用了无效的数据列索引。` };
    }
    if (p.functionalCol === p.dysfunctionalCol) {
      return { refused: 'duplicate-column', detail: `属性“${p.name}”的正向题与负向题不能使用同一数据列。` };
    }
    usedCols.push(p.functionalCol, p.dysfunctionalCol);
  }
  if (new Set(usedCols).size !== usedCols.length) {
    return { refused: 'duplicate-column', detail: '不同 KANO 属性对之间存在重复复用的数据列。' };
  }

  const totalRows = table.rows.length;
  const mask = options.eligibleMask;
  if (mask && mask.length !== totalRows) {
    return { refused: 'invalid-column', detail: '应答资格掩码长度与数据表行数不一致。' };
  }
  const missingCodes = [...(options.missingCodes ?? ['-99'])];
  const skipSet = new Set((options.structuralSkipCodes ?? []).map(c => c.trim()).filter(Boolean));
  const minCases = options.minCases ?? 5;

  let globalStructuralSkip = 0;
  let anyMissingRows = 0;
  let anyInvalidRows = 0;

  for (let i = 0; i < totalRows; i++) {
    if (mask && !mask[i]) {
      globalStructuralSkip++;
      continue;
    }
    const row = table.rows[i];
    if (skipSet.size > 0 && pairs.every(p => skipSet.has((row[p.functionalCol] ?? '').trim()) && skipSet.has((row[p.dysfunctionalCol] ?? '').trim()))) {
      globalStructuralSkip++;
      continue;
    }
    let rowMiss = false;
    let rowInv = false;
    for (const p of pairs) {
      const fRaw = (row[p.functionalCol] ?? '').trim();
      const dRaw = (row[p.dysfunctionalCol] ?? '').trim();
      if (skipSet.has(fRaw) || skipSet.has(dRaw)) continue;
      const fMiss = isMissing(fRaw, missingCodes);
      const dMiss = isMissing(dRaw, missingCodes);
      if (fMiss || dMiss) {
        rowMiss = true;
        continue;
      }
      if (parseKanoLevel(fRaw, options.choiceMap) === null || parseKanoLevel(dRaw, options.choiceMap) === null) {
        rowInv = true;
      }
    }
    if (rowMiss) anyMissingRows++;
    if (rowInv) anyInvalidRows++;
  }

  const globalEligible = totalRows - globalStructuralSkip;
  if (globalEligible <= 0) {
    return { refused: 'no-eligible-rows', detail: '过滤结构性跳题后没有符合应答资格的记录。' };
  }

  const features: KanoFeatureSummary[] = [];
  for (const pair of pairs) {
    const counts: Record<KanoCategory, number> = { M: 0, O: 0, A: 0, I: 0, R: 0, Q: 0 };
    let structuralSkipRows = 0;
    let missingRows = 0;
    let invalidRows = 0;
    let validN = 0;

    for (let i = 0; i < totalRows; i++) {
      const row = table.rows[i];
      const fRaw = (row[pair.functionalCol] ?? '').trim();
      const dRaw = (row[pair.dysfunctionalCol] ?? '').trim();
      if ((mask && !mask[i]) || skipSet.has(fRaw) || skipSet.has(dRaw)) {
        structuralSkipRows++;
        continue;
      }
      if (isMissing(fRaw, missingCodes) || isMissing(dRaw, missingCodes)) {
        missingRows++;
        continue;
      }
      const fLevel = parseKanoLevel(fRaw, options.choiceMap);
      const dLevel = parseKanoLevel(dRaw, options.choiceMap);
      if (fLevel === null || dLevel === null) {
        invalidRows++;
        continue;
      }
      const cat = classifyKanoPair(fLevel, dLevel)!;
      counts[cat]++;
      validN++;
    }

    if (validN < minCases) {
      return { refused: 'too-few-cases', detail: `属性“${pair.name}”有效正反配对仅 ${validN} 份，少于最低样本要求（${minCases} 份）。` };
    }

    const shares: Record<KanoCategory, number> = {
      M: (counts.M / validN) * 100,
      O: (counts.O / validN) * 100,
      A: (counts.A / validN) * 100,
      I: (counts.I / validN) * 100,
      R: (counts.R / validN) * 100,
      Q: (counts.Q / validN) * 100,
    };

    let dominantCategory: KanoCategory = DOMINANCE_ORDER[0];
    for (const cat of DOMINANCE_ORDER) {
      if (counts[cat] > counts[dominantCategory]) dominantCategory = cat;
    }

    const effectiveDenominator = counts.A + counts.O + counts.M + counts.I;
    const rawBetter = effectiveDenominator > 0 ? (counts.A + counts.O) / effectiveDenominator : null;
    const rawWorse = effectiveDenominator > 0 ? -((counts.O + counts.M) / effectiveDenominator) : null;
    const better = rawBetter === null ? null : (rawBetter === 0 ? 0 : rawBetter);
    const worse = rawWorse === null ? null : (rawWorse === 0 ? 0 : rawWorse);

    features.push({
      name: pair.name.trim() || `功能 ${features.length + 1}`,
      functionalCol: pair.functionalCol,
      dysfunctionalCol: pair.dysfunctionalCol,
      totalRows,
      structuralSkipRows,
      eligibleRows: totalRows - structuralSkipRows,
      missingRows,
      invalidRows,
      validN,
      counts,
      shares,
      dominantCategory,
      dominantLabel: KANO_CATEGORY_LABELS[dominantCategory],
      effectiveDenominator,
      better,
      worse,
      questionableRate: counts.Q / validN,
    });
  }

  const warnings: string[] = [];
  if (globalStructuralSkip > 0) {
    warnings.push(`已将结构性跳题 ${globalStructuralSkip} 份与题项缺失分离核算，不混入有效配对分母`);
  }
  if (anyMissingRows > 0) {
    warnings.push(`合格应答范围内有 ${anyMissingRows} 份记录在至少一对 KANO 题上存在缺失，按各属性完整配对剔除`);
  }
  if (anyInvalidRows > 0) {
    warnings.push(`检测到 ${anyInvalidRows} 份记录含非标准 KANO 选项编码，未计入分类统计`);
  }
  const highQ = features.filter(f => f.questionableRate > 0.05);
  if (highQ.length > 0) {
    warnings.push(`属性${highQ.map(f => `“${f.name}”`).join('、')}的可疑结果（Q）占比超过 5%，建议复核正反向题干措辞是否存在双重否定歧义`);
  }

  const validNs = features.map(f => f.validN);
  return {
    totalRows,
    structuralSkipRows: globalStructuralSkip,
    eligibleRows: globalEligible,
    n: Math.min(...validNs),
    maxValidN: Math.max(...validNs),
    anyMissingRows,
    anyInvalidRows,
    features,
    warnings,
  };
}

export type KanoSnapshotOptions = {
  id?: string;
  title?: string;
  caption?: string;
  node?: string;
  sourceName: string;
  sourceHash: string;
  sourceUrl?: string;
  classification: ResultSnapshot['classification'];
  variables?: string[];
  includeFormulas?: boolean;
};

/**
 * Build a verified ResultSnapshot and ReportInsert for KANO demand classification.
 */
export async function buildKanoSnapshot(
  analysis: KanoAnalysis,
  options: KanoSnapshotOptions,
): Promise<{ result: ResultSnapshot; snapshot: ResultSnapshot; insert: ReportInsert }> {
  const title = (options.title ?? '产品与服务功能属性 KANO 需求分类及 Better–Worse 系数').slice(0, 150);
  const caption = exhibitName(options.caption ?? title, 'table');
  const node = options.node ?? 'diagnosis.evaluation';

  const headers = [
    '功能属性',
    'M (%)',
    'O (%)',
    'A (%)',
    'I (%)',
    'R (%)',
    'Q (%)',
    '需求归类',
    'Better',
    'Worse',
  ];

  const rows: (string | number | null)[][] = analysis.features.map(f => [
    literalText(f.name),
    Number(f.shares.M.toFixed(1)),
    Number(f.shares.O.toFixed(1)),
    Number(f.shares.A.toFixed(1)),
    Number(f.shares.I.toFixed(1)),
    Number(f.shares.R.toFixed(1)),
    Number(f.shares.Q.toFixed(1)),
    f.dominantLabel,
    f.better === null ? null : Number(f.better.toFixed(3)),
    f.worse === null ? null : Number(f.worse.toFixed(3)),
  ]);

  const metrics: { label: string; value: number | null }[] = [
    { label: '有效配对样本 n', value: analysis.n },
    ...(analysis.structuralSkipRows > 0 ? [{ label: '结构性跳题份数', value: analysis.structuralSkipRows }] : []),
    ...analysis.features.slice(0, 16).flatMap(f => [
      { label: `${f.name.slice(0, 60)} Better`, value: f.better === null ? null : Number(f.better.toFixed(3)) },
      { label: `${f.name.slice(0, 60)} Worse`, value: f.worse === null ? null : Number(f.worse.toFixed(3)) },
    ]),
  ].slice(0, 40);

  const result = await snapshotRecipe(
    {
      method: 'kano',
      n: analysis.n,
      total: analysis.totalRows,
      excluded: analysis.totalRows - analysis.n,
      missingRows: analysis.anyMissingRows,
      invalidRows: analysis.anyInvalidRows,
      headers,
      rows,
      metrics,
      warnings: analysis.warnings,
      interpretation: 'Better 系数衡量功能提供后的满意提升潜力，Worse 系数衡量功能缺失时的不满敏感度；结构性跳题与题项缺失已分离核算。',
    },
    {
      title,
      sourceName: options.sourceName,
      sourceUrl: options.sourceUrl ?? '',
      sourceHash: options.sourceHash,
      classification: options.classification,
      variables: (options.variables ?? analysis.features.map(f => f.name)).slice(0, 4),
    },
    options.id,
  );

  const nRangeNote = analysis.n === analysis.maxValidN
    ? `$n=${analysis.n}$`
    : `$n=${analysis.n}\\text{–}${analysis.maxValidN}$`;
  const skipNote = analysis.structuralSkipRows > 0
    ? `；结构性跳题 ${analysis.structuralSkipRows} 份（已与题项缺失 ${analysis.anyMissingRows} 份分离）`
    : analysis.anyMissingRows > 0
      ? `；题项缺失 ${analysis.anyMissingRows} 份`
      : '';
  const note = `注：M、O、A、I、R、Q 分别表示必备型、期望型、魅力型、无差异型、反向型与可疑结果占比；${nRangeNote}（总记录 ${analysis.totalRows} 份${skipNote}）。`;

  const byCat = (cat: KanoCategory) => analysis.features.filter(f => f.dominantCategory === cat);
  const topBetter = [...analysis.features].filter(f => f.better !== null).sort((a, b) => (b.better ?? 0) - (a.better ?? 0))[0];
  const topWorse = [...analysis.features].filter(f => f.worse !== null).sort((a, b) => (a.worse ?? 0) - (b.worse ?? 0))[0];
  const catParts = (['M', 'O', 'A', 'I'] as const)
    .map(c => [c, byCat(c)] as const)
    .filter(([, list]) => list.length > 0)
    .map(([c, list]) => `归入${KANO_CATEGORY_LABELS[c]}的有${list.map(x => `“${literalText(x.name)}”`).join('、')}`);

  const includeFormulas = options.includeFormulas !== false;
  const tableIdx = includeFormulas ? 4 : 1;
  const readingParts: string[] = [
    `${lead({ table: `@${tableIdx}` })}${catParts.join('；')}。`,
  ];
  if (topBetter?.better !== null && topBetter?.better !== undefined) {
    readingParts.push(`从满意敏感度看，“${literalText(topBetter.name)}”的 Better 系数最高（$${topBetter.better.toFixed(3)}$），强化供给对提升好评的拉动空间最大；`);
  }
  if (topWorse?.worse !== null && topWorse?.worse !== undefined) {
    readingParts.push(`从不满预防看，“${literalText(topWorse.name)}”的 Worse 系数绝对值最大（$${coef(topWorse.worse).replace(/^−/u, '-')}$），一旦履约缺位最易引发受访者不满，须守住底线标准。`);
  }

  const items: ReportInsert['items'] = [
    ...(includeFormulas
      ? [
          {
            kind: 'paragraph' as const,
            text: '为区分不同功能属性对受访者满意提升与不满预防的非对称作用，采用 KANO 正反双向五级配对提问构建 5×5 评价矩阵，并计算各属性的满意系数（Better）与不满意系数（Worse）：',
          },
          {
            kind: 'formula' as const,
            tex: '\\mathrm{Better}=\\frac{A+O}{A+O+M+I}',
          },
          {
            kind: 'formula' as const,
            tex: '\\mathrm{Worse}=-\\frac{O+M}{A+O+M+I}',
          },
          {
            kind: 'paragraph' as const,
            text: '式中，$M$、$O$、$A$、$I$ 分别为某功能归入必备型、期望型、魅力型与无差异型的有效配对频数。$\\mathrm{Better}\\in[0,1]$ 越接近 1 表示提供该功能后满意度提升越明显；$\\mathrm{Worse}\\in[-1,0]$ 越接近 $-1$ 表示缺失该功能时引发的不满越强烈。',
          },
        ]
      : [
          {
            kind: 'paragraph' as const,
            text: '基于 KANO 正反双向配对矩阵对各待测功能属性进行需求分类与敏感度核算，结果汇总如下。',
          },
        ]),
    { kind: 'table', result, caption },
    { kind: 'paragraph', text: note },
    { kind: 'paragraph', text: readingParts.join('') },
  ];

  const insert: ReportInsert = {
    id: crypto.randomUUID(),
    node,
    source: '数据分析 · KANO 需求分类',
    items,
  };

  return { result, snapshot: result, insert };
}
