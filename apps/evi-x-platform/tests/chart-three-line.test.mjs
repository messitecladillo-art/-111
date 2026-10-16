import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import sax from 'sax';
import { defaultChartStyle, formatChartNumber, POINT_TO_CSS_PIXEL, THREE_LINE_TABLE_RULES } from '../lib/chart-theme.ts';
import { parseSurveyCsv } from '../lib/survey-analysis.ts';
import { createPlanNode, runPlanNode } from '../lib/analysis-plan.ts';
import { buildChartSnapshot } from '../lib/chart-data.ts';
import { buildTableSVG } from '../lib/chart-options.ts';

const fixture = () => {
  const table = parseSurveyCsv('类别\n甲\n乙\n甲');
  const node = { ...createPlanNode('frequency', 'three_line_fixture'), x: 0 };
  const result = runPlanNode(table, node, []);
  return buildChartSnapshot(table, node, result, [], { dataHash: 'a'.repeat(64), signature: 'synthetic-three-line-v1', computedAt: '2026-10-11T02:37:00+08:00' });
};

async function loadStaticPreview() {
  const source = await readFile(new URL('../components/analysis/ChartPreview.tsx', import.meta.url), 'utf8');
  let compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const name of ['react/jsx-runtime', 'react']) compiled = compiled.replaceAll(`"${name}"`, JSON.stringify(import.meta.resolve(name))).replaceAll(`'${name}'`, JSON.stringify(import.meta.resolve(name)));
  for (const name of ['chart-options', 'chart-theme', 'chart-engine', 'workspace-motion']) compiled = compiled.replaceAll(`'@/lib/${name}'`, JSON.stringify(new URL(`../lib/${name}.ts`, import.meta.url).href)).replaceAll(`"@/lib/${name}"`, JSON.stringify(new URL(`../lib/${name}.ts`, import.meta.url).href));
  const classes = { tablePaper: 'tablePaper', tableScroll: 'tableScroll', caption: 'caption', paper: 'paper', host: 'host', status: 'status' };
  const cssModule = 'data:text/javascript;base64,' + Buffer.from(`export default ${JSON.stringify(classes)};`).toString('base64');
  compiled = compiled.replaceAll("'./ChartPreview.module.css'", JSON.stringify(cssModule)).replaceAll('"./ChartPreview.module.css"', JSON.stringify(cssModule));
  return (await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))).default;
}

test('three-line rules preserve physical pt units and exact CSS/SVG conversion', () => {
  assert.equal(POINT_TO_CSS_PIXEL, 96 / 72);
  assert.deepEqual(THREE_LINE_TABLE_RULES, { outerPt: 1.5, headerPt: .75, outerPx: 2, headerPx: 1 });
  assert.ok(Object.isFrozen(THREE_LINE_TABLE_RULES));
});

test('actual React table markup binds fixed pt rules independently of chart line width', async () => {
  const ChartPreview = await loadStaticPreview(), snapshot = fixture();
  const render = lineWidth => renderToStaticMarkup(React.createElement(ChartPreview, { snapshot, kind: 'table', theme: 'blue', style: { ...defaultChartStyle('合成三线表'), lineWidth } }));
  const thin = render(.5), thick = render(6);
  assert.equal(thin, thick);
  assert.match(thin, /data-rules="three_line"/);
  assert.match(thin, /--three-line-outer:1\.5pt/);
  assert.match(thin, /--three-line-header:0\.75pt/);
  assert.ok(!thin.includes('--table-line'));
  assert.equal((thin.match(/<tr>/g) || []).length, snapshot.table.rows.length + 1);
  assert.ok(thin.includes('n = 3'));
});

test('preview CSS resets cell borders and scopes only three fixed horizontal rules', async () => {
  const css = await readFile(new URL('../components/analysis/ChartPreview.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.tablePaper table\s*\{[^}]*border:\s*0\s*;/);
  assert.match(css, /\.tablePaper th,\.tablePaper td\s*\{[^}]*border:\s*0\s*;/);
  assert.match(css, /\.tablePaper th,\.tablePaper td\s*\{[^}]*text-align:\s*center\s*;/);
  assert.match(css, /\.tablePaper th,\.tablePaper td\s*\{[^}]*vertical-align:\s*middle\s*;/);
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selector]) => selector.includes('three_line'));
  assert.equal(rules.length, 2);
  assert.match(rules[0][2], /border-block:\s*var\(--three-line-outer,\s*1\.5pt\)\s*solid currentColor/);
  assert.match(rules[1][1], /thead th/);
  assert.match(rules[1][2], /border-bottom:\s*var\(--three-line-header,\s*\.75pt\)\s*solid currentColor/);
  assert.ok(!rules.some(([, , body]) => /border-(?:left|right|inline)|--table-line/.test(body)));
});

test('each SVG header and data cell is independently centered in its own column', () => {
  const snapshot = fixture(), style = defaultChartStyle('表头与正文按列居中');
  const { svg } = buildTableSVG(snapshot, style), texts = []; let current = null;
  const parser = sax.parser(true, { xmlns: true, strictEntities: true });
  parser.onerror = error => { throw error; };
  parser.onopentag = node => { if (node.local === 'text') current = { x: Number(node.attributes.x.value), anchor: node.attributes['text-anchor']?.value, content: '' }; };
  parser.ontext = text => { if (current) current.content += text; };
  parser.onclosetag = name => { if (name === 'text' && current) { texts.push(current); current = null; } };
  parser.write(svg).close();
  const cells = texts.filter(text => text.anchor === 'middle');
  const expected = [snapshot.table.headers, ...snapshot.table.rows];
  // Long cells wrap onto several centred lines; each line stays centred in its own column.
  const columns = snapshot.table.headers.length, columnWidth = (style.width - 56) / columns, byColumn = Array.from({ length: columns }, () => '');
  cells.forEach(cell => {
    const column = Math.round((cell.x - 28) / columnWidth - .5);
    assert.ok(column >= 0 && column < columns && Math.abs(cell.x - (28 + (column + .5) * columnWidth)) < 1e-10);
    byColumn[column] += cell.content;
  });
  byColumn.forEach((content, column) => assert.equal(content, expected.map(row => typeof row[column] === 'string' ? row[column] : formatChartNumber(row[column], style.decimals)).join('')));
  assert.ok(texts.filter(text => text.anchor !== 'middle').every(text => text.anchor === 'start'));
  assert.ok(texts.some(text => text.content === style.title && text.anchor === 'start'));
  assert.ok(texts.some(text => text.content === 'n = 3' && text.anchor === 'start'));
});

test('actual SVG exports have exactly 1.5pt/0.75pt/1.5pt rules for both line-width extremes', () => {
  const snapshot = fixture();
  for (const lineWidth of [.5, 6]) {
    const { svg } = buildTableSVG(snapshot, { ...defaultChartStyle('合成三线表'), lineWidth });
    const lines = [];
    const parser = sax.parser(true, { xmlns: true, strictEntities: true });
    parser.onerror = error => { throw error; };
    parser.onopentag = node => { if (node.local === 'line') lines.push(Object.fromEntries(Object.entries(node.attributes).map(([name, value]) => [name, Number(value.value)]))); };
    parser.write(svg).close();
    assert.equal(lines.length, 3);
    assert.deepEqual(lines.map(line => line['stroke-width']), [2, 1, 2]);
    assert.ok(lines.every(line => line.y1 === line.y2 && line.x1 < line.x2));
    assert.ok(lines[0].y1 < lines[1].y1 && lines[1].y1 < lines[2].y1);
  }
});
