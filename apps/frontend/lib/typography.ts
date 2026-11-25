/**
 * Shared academic punctuation & display sanitizer for Chinese survey reports.
 *
 * Eliminates informal lenticular brackets (【】), corner quotes (「」/『』),
 * stray literal curly braces ({}), p=0.0 statistical rounding artifacts, and
 * label-colon ("Method: ...") dictionary headers while preserving TeX math
 * formulas ($...$ / $$...$$).
 */

const INLINE_OR_DISPLAY_TEX_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/gu;

const STAT_METHOD_LABEL_KEYWORD: readonly [RegExp, string, RegExp][] = [
  [/^Spearman\s*秩相关稳健矩阵$/iu, 'Spearman 秩相关稳健矩阵', /Spearman/iu],
  [/^Mann[-–—]Whitney\s*U\s*与\s*Cliff['’]s\s*(?:Delta|δ)$/iu, "Mann-Whitney U 与 Cliff's δ", /Mann[-–—]Whitney/iu],
  [/^Bootstrap\s*95%\s*置信区间$/iu, 'Bootstrap 95% 置信区间', /Bootstrap/iu],
];

const STAT_SYMBOL_SPACING_RULES: readonly [RegExp, string][] = [
  [/(?<![A-Za-z])Mann[-–—]Whitney\s*U(?![A-Za-z])/giu, 'Mann-Whitney U'],
  [/(?<![A-Za-z])Cliff['’]s\s*(?:δ(?![A-Za-z\u0370-\u03ff])|Delta(?![A-Za-z]))/giu, "Cliff's δ"],
  [/(?<![A-Za-z])Kruskal[-–—]Wallis\s*H(?![A-Za-z])/giu, 'Kruskal-Wallis H'],
  [/(?<![A-Za-z])Wilcoxon\s*W(?![A-Za-z])/giu, 'Wilcoxon W'],
  [/(?<![A-Za-z])Student['’]s\s*t(?![A-Za-z])/giu, "Student's t"],
  [/(?<![A-Za-z])Welch['’]s\s*t(?![A-Za-z])/giu, "Welch's t"],
  [/(?<![A-Za-z])Cohen['’]s\s*d(?![A-Za-z])/giu, "Cohen's d"],
  [/(?<![A-Za-z\u00c0-\u024f])Cram[eé]r['’]s\s*V(?![A-Za-z])/giu, "Cramér's V"],
  [/(?<![A-Za-z\u00c0-\u024f])Cram[eé]rV(?![A-Za-z])/giu, 'Cramér V'],
  [/(?<![A-Za-z])Cronbach['’]s\s*α(?![A-Za-z\u0370-\u03ff])/giu, "Cronbach's α"],
  [/(?<![A-Za-z])Cronbachα(?![A-Za-z\u0370-\u03ff])/giu, 'Cronbach α'],
  [/(?<![A-Za-z])Spearman['’]s\s*ρ(?![A-Za-z\u0370-\u03ff])/giu, "Spearman's ρ"],
  [/(?<![A-Za-z])Spearman\s*ρ(?![A-Za-z\u0370-\u03ff])/giu, 'Spearman ρ'],
];

function normalizeStatSymbolSpacing(text: string): string {
  let out = text;
  for (const [pattern, replacement] of STAT_SYMBOL_SPACING_RULES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

const PURE_META_TAG_RE = /^(?:数据质量与核心机制核查结论|.*核心实证发现|硅基预测试推演结论.*|可复现统计程序.*)$/u;

export type SanitizeTypographyOptions = {
  preserveBraces?: boolean;
};

function cleanPlainSegment(segment: string, preserveBraces = false): string {
  const pre = normalizeStatSymbolSpacing(
    segment
      .replace(/[「『]/gu, '“')
      .replace(/[」』]/gu, '”')
      .replace(/\brho\s*=/giu, 'ρ='),
  ).replace(/\bp\s*=\s*0(?:\.0+)?(?![0-9.])/giu, 'p < 0.0001');

  const withoutBrackets = pre.replace(
    /【([^】]*)】/gu,
    (_whole, inner: string, offset: number, source: string) => {
      const trimmed = inner.trim();
      if (!trimmed) return '';
      const after = source.slice(offset + _whole.length);
      const hasBodyAfter = /^\s*[\u4e00-\u9fffA-Za-z0-9(“"‘]/u.test(after);
      if (hasBodyAfter) {
        for (const [labelRe, canonicalMethod, mentionedRe] of STAT_METHOD_LABEL_KEYWORD) {
          if (labelRe.test(trimmed)) {
            if (mentionedRe.test(after)) return '';
            return `采用 ${canonicalMethod} 检验，`;
          }
        }
        if (PURE_META_TAG_RE.test(trimmed)) return '';
      }
      return trimmed;
    },
  );

  const stripped = preserveBraces
    ? withoutBrackets.replace(/[【】]/gu, '')
    : withoutBrackets.replace(/[【】]/gu, '').replace(/[{}]/gu, '');

  return stripped
    .replace(/。\s*；/gu, '；')
    .replace(/：\s*：/gu, '：')
    .replace(/。\s*。+/gu, '。');
}

function polishProseSegment(segment: string, preserveBraces = false): string {
  let out = cleanPlainSegment(segment, preserveBraces);

  out = out.replace(
    /((?:如(?:表|图)\s*[0-9A-Za-z\-－—.]+\s*所示[，,]?\s*)?)(Spearman\s*秩相关稳健矩阵|Mann-Whitney\s*U\s*与\s*Cliff's\s*(?:Delta|δ)|Bootstrap\s*95%\s*置信区间)(?:结果显示)?[：:]\s*/giu,
    (_whole, lead: string, methodRaw: string, offset: number, source: string) => {
      const after = source.slice(offset + _whole.length);
      let canonical = methodRaw.replace(/Cliff's\s+Delta/giu, "Cliff's δ").trim();
      if (/Spearman/iu.test(canonical)) {
        if (/Spearman/iu.test(after)) return lead;
        canonical = 'Spearman 秩相关稳健矩阵';
      } else if (/Mann-Whitney/iu.test(canonical)) {
        if (/Mann-Whitney/iu.test(after)) return lead;
        canonical = "Mann-Whitney U 与 Cliff's δ";
      } else if (/Bootstrap/iu.test(canonical)) {
        if (/Bootstrap/iu.test(after)) return lead;
        canonical = 'Bootstrap 95% 置信区间';
      }
      return `${lead}采用 ${canonical} 检验，`;
    },
  );

  out = out
    .replace(/计算\s*Spearman\s*秩相关[：:]\s*/giu, '计算 Spearman 秩相关，其中')
    .replace(/上的分布差异[：:]\s*/gu, '上的分布差异，结果显示 ')
    .replace(/执行\s*1,?000\s*次非参数\s*Bootstrap[：:]\s*/giu, '执行 1,000 次非参数 Bootstrap 抽样，得到')
    .replace(
      /[。\s]*(?:（有效样本\s*n\s*=\s*(\d+)）)?\s*核心统计指标[：:][^。\n]+。?/gu,
      (_m, n: string | undefined) => (n ? `（有效样本 n=${n}）。` : '。'),
    )
    .replace(/。\s*（有效样本\s*n\s*=\s*(\d+)）/gu, '（有效样本 n=$1）。')
    .replace(/(^|\n)数据质量与核心机制核查结论[：:]\s*/gu, '$1本次核查')
    .replace(/统计修正要点[：:]\s*/gu, '核查过程同步完成了')
    .replace(/（适用边界[：:]\s*([^）]+)）/gu, '，需要说明的是，$1')
    .replace(/([。！？])(?:\s*[。！？])+/gu, '$1')
    .replace(/([，；、])(?:\s*[，；、])+/gu, '$1')
    .replace(/[ \t]{2,}/g, ' ');

  return out;
}

function sanitizeWithOptions(text: string, prose: boolean, options?: SanitizeTypographyOptions): string {
  if (!text) return '';
  const preserveBraces = options?.preserveBraces ?? false;
  return text
    .split(INLINE_OR_DISPLAY_TEX_RE)
    .map(part => (
      part.startsWith('$') && part.endsWith('$')
        ? part
        : prose
          ? polishProseSegment(part, preserveBraces)
          : cleanPlainSegment(part, preserveBraces)
    ))
    .join('');
}

export function normalizeAcademicPunctuation(text: string): string {
  return sanitizeWithOptions(text, false);
}

export function normalizePaperProse(text: string): string {
  return sanitizeWithOptions(text, true);
}

export function normalizeAcademicPunctuationKeepingBraces(text: string): string {
  return sanitizeWithOptions(text, false, { preserveBraces: true });
}

export function normalizePaperProseKeepingBraces(text: string): string {
  return sanitizeWithOptions(text, true, { preserveBraces: true });
}
