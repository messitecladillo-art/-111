import test from 'node:test';
import assert from 'node:assert/strict';
import sax from 'sax';
import { parseSurveyCsv, SURVEY_LIMITS } from '../lib/survey-analysis.ts';
import { createPlanNode, runPlanNode } from '../lib/analysis-plan.ts';
import { buildChartSnapshot } from '../lib/chart-data.ts';
import { buildChartOption, buildTableSVG } from '../lib/chart-options.ts';
import { defaultChartStyle, validateChartStyle } from '../lib/chart-theme.ts';
import { engine } from '../lib/chart-engine.ts';

// Independent diagnostic fixtures, deliberately separate from the producer's stress CSV.
const binding = { dataHash: 'b'.repeat(64), signature: 'independent-max-boundary', computedAt: '2026-10-11T02:30:00+08:00' };
const csv = (headers, rows) => [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
const build = (input, method, x, y = null, scale = null) => {
  const table = parseSurveyCsv(input);
  const node = { ...createPlanNode(method, 'independent-max'), x, y, scale };
  const result = runPlanNode(table, node, []);
  return { table, result, snapshot: buildChartSnapshot(table, node, result, [], binding) };
};
const style = () => ({ ...defaultChartStyle('复杂图独立验收'), showLegend: false });
function render(snapshot, kind, settings = style()) {
  const option = buildChartOption(snapshot, kind, settings, 'teal');
  const instance = engine.init(null, undefined, { renderer: 'svg', ssr: true, width: settings.width, height: settings.height });
  try {
    instance.setOption(option);
    const svg = instance.renderToSVGString({ useViewBox: true });
    const tags = [], texts = [];
    const parser = sax.parser(true, { xmlns: true, strictEntities: true });
    parser.onerror = error => { throw error; };
    parser.onopentag = tag => {
      const attributes = Object.fromEntries(Object.entries(tag.attributes).map(([key, value]) => [key, value.value]));
      tags.push({ name: tag.name, attributes });
      for (const key of ['x', 'y', 'width', 'height', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r']) {
        if (key in attributes && !attributes[key].includes('%')) assert.ok(Number.isFinite(Number(attributes[key])), `nonfinite ${key}`);
      }
      assert.ok(!/(?:NaN|Infinity)/.test(attributes.d || ''), 'nonfinite path geometry');
    };
    parser.ontext = text => texts.push(text);
    parser.write(svg).close();
    const chartTags = tags.filter(tag => tag.attributes.ecmeta_ssr_type === 'chart' && tag.attributes.ecmeta_data_index !== undefined);
    return { option, svg, tags, chartTags, texts };
  } finally { instance.dispose(); }
}

test('maximum rows, data cells and columns are inclusive; one extra is rejected without truncation', () => {
  const input = csv(Array.from({ length: 40 }, (_, i) => `测量${i}`), Array.from({ length: 5000 }, () => Array(40).fill('1')));
  const table = parseSurveyCsv(input);
  assert.equal(table.rows.length, 5000); assert.equal(table.headers.length * table.rows.length, 200000);
  assert.throws(() => parseSurveyCsv(input + '\n' + Array(40).fill('1').join(',')), /5,000/);
  assert.throws(() => parseSurveyCsv(csv(Array.from({ length: 41 }, (_, i) => `测量${i}`), Array.from({ length: 5000 }, () => Array(41).fill('1')))), /200,000/);
  const eighty = parseSurveyCsv(csv(Array.from({ length: 80 }, (_, i) => `测量${i}`), Array.from({ length: 2500 }, () => Array(80).fill('1'))));
  assert.equal(eighty.rows.length * eighty.headers.length, 200000);
  assert.throws(() => parseSurveyCsv(csv(Array.from({ length: 81 }, (_, i) => `测量${i}`), [Array(81).fill('1')])), /80/);
});

test('file ceiling is exactly 2000000 UTF-8 bytes for ASCII and Chinese, rather than two MiB', () => {
  const ascii = 'r\n' + Array.from({ length: 5000 }, (_, i) => 'a'.repeat(i === 0 ? 398 : 399)).join('\n');
  const chinese = '内容\n' + Array.from({ length: 5000 }, (_, i) => '证'.repeat(132) + (i < 2 ? '' : 'abc')).join('\n');
  assert.equal(SURVEY_LIMITS.bytes, 2_000_000);
  for (const input of [ascii, chinese]) {
    assert.equal(new TextEncoder().encode(input).length, 2_000_000);
    assert.equal(parseSurveyCsv(input).rows.length, 5000);
    assert.throws(() => parseSurveyCsv(input + 'a'), /2 MB/);
  }
});

test('5000 complete scatter pairs survive actual modular-engine SVG serialization', () => {
  const { snapshot } = build(csv(['测量甲', '测量乙'], Array.from({ length: 5000 }, (_, i) => [i + 1, 2 * i + 3])), 'pearson', 0, 1);
  assert.equal(snapshot.n, 5000); assert.equal(snapshot.pairs.values.length, 5000);
  assert.deepEqual(snapshot.pairs.values.at(-1), [5000, 10001]);
  const rendered = render(snapshot, 'scatter');
  assert.equal(rendered.option.series[0].data.length, 5000);
  const indices = new Set(rendered.chartTags.filter(tag => tag.attributes.ecmeta_series_index === '0').map(tag => Number(tag.attributes.ecmeta_data_index)));
  assert.equal(indices.size, 5000); assert.ok(indices.has(0) && indices.has(4999));
});

test('20 by 20 matrix preserves all 400 exact cells and percentages in the actual heatmap SVG', () => {
  const { snapshot } = build(csv(['行维度', '列维度'], Array.from({ length: 5000 }, (_, i) => [`分区${i % 20}`, `场景${Math.floor(i / 20) % 20}`])), 'crosstab', 0, 1);
  assert.equal(snapshot.n, 5000); assert.equal(snapshot.cross.cells.length, 400);
  for (const cell of snapshot.cross.cells) {
    const column = Number(cell.column.slice(2));
    assert.equal(cell.count, column < 10 ? 13 : 12);
    assert.equal(cell.rowPercent, (column < 10 ? 13 : 12) / 250 * 100);
  }
  const heatmap = render(snapshot, 'heatmap');
  assert.equal(new Set(heatmap.chartTags.map(tag => tag.attributes.ecmeta_data_index)).size, 400);
  const mosaic = render(snapshot, 'mosaic');
  assert.equal(mosaic.option.series.filter(series => series.type === 'custom').flatMap(series => series.data).reduce((n, cell) => n + cell[4], 0), 5000);
  assert.throws(() => build(csv(['行维度', '列维度'], Array.from({ length: 21 }, (_, i) => [`分区${i}`, `场景${i % 2}`])), 'crosstab', 0, 1), /20 类/);
});

test('400-row SVG table retains every frequency in its actual column and order', () => {
  const { snapshot } = build(csv(['行维度', '列维度'], Array.from({ length: 5000 }, (_, i) => [`分区${i % 20}`, `场景${Math.floor(i / 20) % 20}`])), 'crosstab', 0, 1);
  const settings = style();
  const exported = buildTableSVG(snapshot, settings);
  const counts = [];
  const frequencyColumn = snapshot.table.headers.indexOf('频数');
  assert.ok(frequencyColumn >= 0, 'fixture expects the public frequency column');
  const x = 28 + (frequencyColumn + .5) * ((settings.width - 56) / snapshot.table.headers.length);
  const parser = sax.parser(true, { xmlns: true, strictEntities: true });
  let frequencyText = false;
  parser.onerror = error => { throw error; };
  parser.onopentag = tag => {
    frequencyText = tag.name === 'text' && Math.abs(Number(tag.attributes.x?.value) - x) < 1e-8;
    if (frequencyText) assert.equal(tag.attributes['text-anchor']?.value, 'middle');
  };
  parser.ontext = value => { if (frequencyText && /^\d+$/.test(value)) counts.push(Number(value)); };
  parser.onclosetag = name => { if (name === 'text') frequencyText = false; };
  parser.write(exported.svg).close();
  assert.deepEqual(counts, snapshot.table.rows.map(row => row[frequencyColumn]));
  assert.equal(counts.length, 400);
  assert.equal(counts.reduce((sum, count) => sum + count, 0), 5000);
  assert.ok(exported.height > 8192, 'full SVG intrinsically exceeds the guarded PNG canvas height');
});

test('sparse 20 by 20 mosaic retains zero cells as data without inventing visible areas', () => {
  const { snapshot } = build(csv(['行维度', '列维度'], Array.from({ length: 5000 }, (_, i) => [`分区${i % 20}`, `场景${i % 20}`])), 'crosstab', 0, 1);
  assert.equal(snapshot.cross.cells.length, 400);
  assert.equal(snapshot.cross.cells.filter(cell => cell.count === 0).length, 380);
  const rendered = render(snapshot, 'mosaic');
  const expected = rendered.option.series.flatMap((series, seriesIndex) => series.data.flatMap((cell, dataIndex) => cell[4] > 0 ? [`${seriesIndex}:${dataIndex}`] : []));
  const drawn = [...new Set(rendered.chartTags.map(tag => `${tag.attributes.ecmeta_series_index}:${tag.attributes.ecmeta_data_index}`))];
  assert.equal(expected.length, 20);
  assert.deepEqual(drawn.sort(), expected.sort());
  assert.equal(rendered.option.series.flatMap(series => series.data).length, 400);
  assert.equal(snapshot.table.rows.length, 400);
});

test('20 group rainclouds retain all 5000 observations and their actual group means', () => {
  const rows = Array.from({ length: 5000 }, (_, i) => [`组别${i % 20}`, Math.floor(i / 20) % 11 - 5 + i % 20 / 10]);
  const { snapshot } = build(csv(['分组维度', '测量结果'], rows), 'groups', 0, 1);
  assert.equal(snapshot.n, 5000); assert.equal(snapshot.distributions.length, 20);
  for (let group = 0; group < 20; group++) {
    const expected = rows.filter(row => row[0] === `组别${group}`).map(row => row[1]);
    const distribution = snapshot.distributions.find(item => item.label === `组别${group}`);
    assert.equal(distribution.values.length, 250);
    assert.ok(Math.abs(distribution.summary.mean - expected.reduce((sum, n) => sum + n, 0) / 250) < 1e-12);
  }
  const rendered = render(snapshot, 'group_raincloud');
  for (const distribution of snapshot.distributions) assert.ok(rendered.texts.includes(distribution.label), `static chart must distinguish short group name ${distribution.label}`);
  const scatterIndices = new Set(rendered.option.series.flatMap((series, i) => series.type === 'scatter' ? [String(i)] : []));
  assert.equal(rendered.chartTags.filter(tag => scatterIndices.has(tag.attributes.ecmeta_series_index)).length, 5000);
  assert.throws(() => build(csv(['分组维度', '测量结果'], Array.from({ length: 21 }, (_, i) => [`组别${i}`, i + 1])), 'groups', 0, 1), /20 类/);
});

test('30 reversed scale items retain n5000, exact alpha1 and all item means', () => {
  const headers = Array.from({ length: 30 }, (_, i) => `量表题项${i}`);
  const reverse = Array.from({ length: 30 }, (_, i) => i).filter(i => i % 7 === 0);
  const rows = Array.from({ length: 5000 }, (_, row) => Array.from({ length: 30 }, (_, item) => item % 7 === 0 ? 6 - (row % 5 + 1) : row % 5 + 1));
  const scale = { columns: Array.from({ length: 30 }, (_, i) => i), reverse, min: 1, max: 5, construct: '共同计分' };
  const { result, snapshot } = build(csv(headers, rows), 'alpha', null, null, scale);
  assert.equal(result.reliability.alpha, 1); assert.equal(snapshot.n, 5000); assert.equal(snapshot.reliability.length, 30);
  for (const item of snapshot.reliability) { assert.ok(Math.abs(item.mean - 3) < 1e-12); assert.ok(Math.abs(item.correctedItemTotal - 1) < 1e-12); }
  const rendered = render(snapshot, 'item_mean');
  assert.equal(new Set(rendered.chartTags.map(tag => tag.attributes.ecmeta_data_index)).size, 30);
  const tooMany = { ...scale, columns: Array.from({ length: 31 }, (_, i) => i) };
  assert.throws(() => build(csv([...headers, '额外题项'], rows.map(row => [...row, 3])), 'alpha', null, null, tooMany), /30/);
});

test('long Chinese table labels and legal maximum title remain complete and XML-safe', () => {
  const labels = Array.from({ length: 50 }, (_, i) => `第${i}类` + '复杂中文类别与研究场景'.repeat(8));
  const { snapshot } = build(csv(['类别变量'], Array.from({ length: 5000 }, (_, i) => [labels[i % 50]])), 'frequency', 0);
  assert.equal(snapshot.n, 5000); assert.equal(snapshot.categories.length, 50);
  assert.ok(snapshot.categories.every(item => item.count === 100));
  const settings = validateChartStyle({ ...style(), title: '证'.repeat(300), width: 2400, height: 1800 });
  const table = buildTableSVG(snapshot, settings);
  const parser = sax.parser(true, { xmlns: true, strictEntities: true });
  const texts = [], centered = [];
  let currentCentered = null;
  const cellWidth = (settings.width - 56) / snapshot.table.headers.length;
  parser.onerror = error => { throw error; };
  parser.ontext = text => { texts.push(text); if (currentCentered) currentCentered.text += text; };
  parser.onopentag = tag => {
    if (tag.name !== 'text' || tag.attributes['text-anchor']?.value !== 'middle') return;
    const x = Number(tag.attributes.x?.value), y = Number(tag.attributes.y?.value);
    const column = Math.round((x - 28) / cellWidth - .5);
    assert.ok(column >= 0 && column < snapshot.table.headers.length);
    assert.ok(Math.abs(x - (28 + (column + .5) * cellWidth)) < 1e-8);
    assert.ok(Number.isFinite(y) && y > 0 && y < table.height);
    currentCentered = { column, x, y, text: '' }; centered.push(currentCentered);
  };
  parser.onclosetag = name => { if (name === 'text') currentCentered = null; };
  parser.write(table.svg).close();
  const joined = texts.join('');
  for (const label of labels) assert.ok(joined.includes(label), 'table dropped a complete category label');
  assert.ok(joined.includes('证'.repeat(300)));
  assert.ok(centered.length > 50 * snapshot.table.headers.length, 'long labels must wrap onto complete centered lines');
  assert.equal(new Set(centered.map(text => text.column)).size, snapshot.table.headers.length);
  const frequencyColumn = snapshot.table.headers.indexOf('频数');
  let labelLines = [];
  const rowCenters = [];
  for (const text of centered) {
    if (text.column === 0) labelLines.push(text);
    if (text.column !== frequencyColumn) continue;
    if (text.text === '100') {
      assert.ok(labelLines.length > 1, 'fixture requires multiline category with single-line frequency');
      const meanBaseline = labelLines.reduce((sum, line) => sum + line.y, 0) / labelLines.length;
      assert.ok(Math.abs(text.y - meanBaseline) < 1e-8, 'single-line numeric cell is not vertically centered with its multiline category');
      rowCenters.push(text.y);
    }
    labelLines = [];
  }
  assert.equal(rowCenters.length, 50);
  const rendered = render(snapshot, 'horizontal_bar', settings);
  assert.equal(new Set(rendered.chartTags.map(tag => tag.attributes.ecmeta_data_index)).size, 50);
});
