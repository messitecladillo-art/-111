import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { autospace } from '../lib/paper-layout.ts';
import {
  normalizeAcademicPunctuation,
  normalizeAcademicPunctuationKeepingBraces,
  normalizePaperProse,
  normalizePaperProseKeepingBraces,
} from '../lib/typography.ts';

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const glue = (left, right) => `${left}${right}`;

function collectSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, out);
    } else if (entry.isFile() && /\.(?:ts|tsx|mjs)$/u.test(entry.name)) {
      out.push(fullPath);
    }
  }
  return out;
}

test('normalizes all 10 glued statistical test symbols into canonical spaced academic notation', () => {
  const cases = [
    [glue('Mann-Whitney', 'U'), 'Mann-Whitney U'],
    [glue('Mann\u2013Whitney', 'U'), 'Mann-Whitney U'],
    [glue("Cliff's", 'δ'), "Cliff's δ"],
    [glue('Cliff\u2019s', 'δ'), "Cliff's δ"],
    [glue("Cliff's", 'Delta'), "Cliff's δ"],
    [glue('Cliff\u2019s', 'Delta'), "Cliff's δ"],
    ["Cliff's Delta", "Cliff's δ"],
    [glue('Kruskal-Wallis', 'H'), 'Kruskal-Wallis H'],
    [glue('Kruskal\u2014Wallis', 'H'), 'Kruskal-Wallis H'],
    [glue('Wilcoxon', 'W'), 'Wilcoxon W'],
    [glue("Student's", 't'), "Student's t"],
    [glue('Student\u2019s', 't'), "Student's t"],
    [glue("Welch's", 't'), "Welch's t"],
    [glue('Welch\u2019s', 't'), "Welch's t"],
    [glue("Cohen's", 'd'), "Cohen's d"],
    [glue('Cohen\u2019s', 'd'), "Cohen's d"],
    [glue("Cram\u00e9r's", 'V'), "Cram\u00e9r's V"],
    [glue("Cramer's", 'V'), "Cram\u00e9r's V"],
    [glue('Cram\u00e9r\u2019s', 'V'), "Cram\u00e9r's V"],
    [glue("Cronbach's", 'α'), "Cronbach's α"],
    [glue('Cronbach\u2019s', 'α'), "Cronbach's α"],
    [glue('Spearman', 'ρ'), 'Spearman ρ'],
  ];

  for (const [raw, expected] of cases) {
    assert.equal(normalizeAcademicPunctuation(raw), expected, `punctuation normalizer failed on ${raw}`);
    assert.equal(normalizePaperProse(raw), expected, `prose normalizer failed on ${raw}`);
    assert.equal(
      normalizeAcademicPunctuationKeepingBraces(raw),
      expected,
      `brace-preserving punctuation normalizer failed on ${raw}`,
    );
    assert.equal(
      normalizePaperProseKeepingBraces(raw),
      expected,
      `brace-preserving prose normalizer failed on ${raw}`,
    );
  }
});

test('heals historical glued Chinese keywords and prose sentences idempotently across Word/Paper autospace', () => {
  const legacyKeywords = `关键词：义乌市；数字适老化；${glue('Mann-Whitney', 'U')} 与 ${glue("Cliff's", 'δ')}；${glue('Kruskal-Wallis', 'H')}；${glue("Cramer's", 'V')}；${glue('Spearman', 'ρ')}`;
  const once = autospace(normalizePaperProse(legacyKeywords));
  const twice = autospace(normalizePaperProse(once));

  assert.equal(
    once,
    "关键词：义乌市；数字适老化；Mann-Whitney U 与 Cliff's δ；Kruskal-Wallis H；Cramér's V；Spearman ρ",
  );
  assert.equal(twice, once, 'statistical symbol spacing must be strictly idempotent');

  const inlineChinese = `本研究综合运用${glue('Mann-Whitney', 'U')}检验、${glue("Cliff's", 'δ')}效应量、${glue('Wilcoxon', 'W')}秩和、${glue("Welch's", 't')}检验、${glue("Student's", 't')}分布、${glue("Cohen's", 'd')}与${glue("Cronbach's", 'α')}系数（p=0.000）。`;
  const healed = autospace(normalizePaperProse(inlineChinese));
  assert.equal(
    healed,
    "本研究综合运用 Mann-Whitney U 检验、Cliff's δ 效应量、Wilcoxon W 秩和、Welch's t 检验、Student's t 分布、Cohen's d 与 Cronbach's α 系数（p < 0.0001）。",
  );
  assert.equal(autospace(normalizePaperProse(healed)), healed);
});

test('preserves negative-boundary English words and canonical mixed TeX notations without false rewrites', () => {
  const untouchedSamples = [
    "Student's test of significance",
    "Welch's test for unequal variances",
    'Mann-WhitneyUnit synthetic token',
    "Cliff'sDeltaValue identifier",
    'WilcoxonWall identifier',
    'Cronbach α 系数为 0.862',
    'Cramér V 与 χ² 检验',
    '由表 4-2 可知，Cramér $V=0.241$，呈中等关联。',
    "量表内部一致性良好，Cronbach's $\\alpha$ 系数为 0.891。",
    'Spearman 秩相关系数为 $\\rho=-0.412$。',
  ];

  for (const sample of untouchedSamples) {
    assert.equal(normalizeAcademicPunctuation(sample), sample, `unexpected mutation on: ${sample}`);
    assert.equal(normalizePaperProse(sample), sample, `unexpected prose mutation on: ${sample}`);
  }
});

test('protects inline $...$ and display $$...$$ TeX math blocks byte-for-byte while normalizing surrounding prose', () => {
  const gluedInMath = glue('Mann-Whitney', 'U');
  const gluedCliff = glue("Cliff's", 'δ');
  const inlineMathSample = `正文采用 ${gluedInMath} 与 ${gluedCliff}，公式记作 $\\mathrm{${gluedInMath}} = n_1 n_2 + \\frac{n_1(n_1+1)}{2}$ 且保持花括号完整。`;

  const outInline = normalizePaperProse(inlineMathSample);
  assert.ok(outInline.startsWith("正文采用 Mann-Whitney U 与 Cliff's δ，公式记作 "));
  assert.ok(
    outInline.includes(`$\\mathrm{${gluedInMath}} = n_1 n_2 + \\frac{n_1(n_1+1)}{2}$`),
    'inline TeX block must remain byte-for-byte untouched',
  );

  const displayMathSample = [
    `如表 4-3 所示，${glue('Kruskal-Wallis', 'H')} 与 ${glue('Spearman', 'ρ')} 满足：`,
    `$$H = \\frac{12}{N(N+1)}\\sum_{i=1}^{k}\\frac{R_i^2}{n_i} - 3(N+1), \\quad \\text{${glue("Cohen's", 'd')}}$$`,
    `同时 ${glue("Cronbach's", 'α')} 达标。`,
  ].join('\n');

  const outDisplay = normalizePaperProse(displayMathSample);
  assert.ok(outDisplay.includes('Kruskal-Wallis H 与 Spearman ρ 满足：'));
  assert.ok(outDisplay.includes("同时 Cronbach's α 达标。"));
  assert.ok(
    outDisplay.includes(`\\text{${glue("Cohen's", 'd')}}`),
    'multiline display TeX block must remain byte-for-byte untouched',
  );
});

test('frontend source tree contains zero hardcoded glued statistical test symbols', () => {
  const gluedDetector = new RegExp(
    [
      '(?<![A-Za-z])Mann[-–—]Whitney[U](?![A-Za-z])',
      "(?<![A-Za-z])Cliff['’]s(?:[δ]|Delta(?![A-Za-z]))",
      '(?<![A-Za-z])Kruskal[-–—]Wallis[H](?![A-Za-z])',
      '(?<![A-Za-z])Wilcoxon[W](?![A-Za-z])',
      "(?<![A-Za-z])Student['’]s[t](?![A-Za-z])",
      "(?<![A-Za-z])Welch['’]s[t](?![A-Za-z])",
      "(?<![A-Za-z])Cohen['’]s[d](?![A-Za-z])",
      "(?<![A-Za-z\\u00c0-\\u024f])Cram[eé]r['’]s[V](?![A-Za-z])",
      "(?<![A-Za-z])Cronbach['’]s[α]",
      '(?<![A-Za-z])Spearman[ρ]',
    ].join('|'),
    'gu',
  );

  const dirs = ['app', 'components', 'lib', 'data'];
  const violations = [];
  for (const d of dirs) {
    const rootDir = path.join(FRONTEND_ROOT, d);
    if (!fs.existsSync(rootDir)) continue;
    for (const filePath of collectSourceFiles(rootDir)) {
      const relPath = path.relative(FRONTEND_ROOT, filePath).replace(/\\/gu, '/');
      const content = fs.readFileSync(filePath, 'utf8');
      const matches = content.match(gluedDetector);
      if (matches?.length) {
        violations.push(`${relPath}: ${[...new Set(matches)].join(', ')}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found glued statistical test symbols in frontend source files: ${violations.join(' | ')}`,
  );
});
