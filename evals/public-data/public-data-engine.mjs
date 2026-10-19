import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { parseSurveyCsv } from '../../apps/frontend/lib/survey-analysis.ts';
import { runRecipe } from '../../apps/frontend/lib/analysis-recipes.ts';

const { values } = parseArgs({ options: { csv: { type: 'string' } }, strict: true });
if (!values.csv) throw new Error('Usage: node --experimental-strip-types public-data-engine.mjs --csv <bank.csv>');

const bytes = readFileSync(values.csv);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const expected = 'dc8d576e9bda0f41ee891251bd84bab9a39ce576cba715aac08adc2374a01fde';
if (sha256 !== expected) throw new Error('Unexpected dataset SHA-256; use the unchanged 4,521-row bank.csv subset.');
const table = parseSurveyCsv(bytes.toString('utf8'), ';');
const cases = [
  ['frequency', 'job', null],
  ['numeric', 'balance', null],
  ['groups', 'education', 'balance'],
  ['crosstab', 'education', 'y'],
  ['pearson', 'age', 'balance'],
  ['spearman', 'age', 'balance'],
  ['numeric', 'pdays', null],
];
const results = [];
for (const missingCodes of [[], ['unknown']]) {
  for (const [method, x, y] of cases) {
    const id = [method, x, y || '', missingCodes.length ? 'unknown_missing' : 'original_codes'].join('/');
    const recipe = {
      id, method, x: table.headers.indexOf(x), y: y ? table.headers.indexOf(y) : null,
      question: '公开历史数据功能验收',
    };
    results.push({ id, method, x, y, missingCodes, result: runRecipe(table, recipe, missingCodes) });
  }
}
console.log(JSON.stringify({ sha256, rows: table.rows.length, columns: table.headers.length, node: process.version, results }));
