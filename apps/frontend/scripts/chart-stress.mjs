import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import sax from 'sax';
import { performance } from 'node:perf_hooks';
import { buildStressCSV, buildStressDataset, buildStressScenarios, STRESS_FIXTURE } from '../tests/fixtures/chart-stress-data.ts';
import { createPlanNode, runPlanNode } from '../lib/analysis-plan.ts';
import { chartChoices } from '../lib/chart-registry.ts';
import { defaultChartStyle } from '../lib/chart-theme.ts';
import { buildChartOption, buildTableSVG } from '../lib/chart-options.ts';
import { engine } from '../lib/chart-engine.ts';
import { parseSurveyCsv, profileSurvey, finiteNumber, isMissing, SURVEY_LIMITS } from '../lib/survey-analysis.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outputDir = path.join(projectRoot, '.collab/runs/20261011-chart-stress/evidence/node');
const phase = process.argv.includes('--release') ? 'final-release' : process.argv.includes('--three-line') ? 'final-three-line' : process.argv.includes('--final') ? 'final' : 'baseline';
const hash = data => createHash('sha256').update(data).digest('hex');
const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const duration = callback => { const begin = performance.now(); const value = callback(); return { value, ms: performance.now() - begin }; };
const summary = values => ({ min: Math.min(...values), median: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)], p95: [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1], max: Math.max(...values) });
const trace = [];
const record = data => { trace.push(data); console.log(JSON.stringify(data)); };

function strictXML(svg) {
  const parser = sax.parser(true, { xmlns: true, strictEntities: true });
  let elements = 0, texts = 0, root = null; const chartData = new Map();
  parser.onerror = error => { throw error; };
  parser.onopentag = element => {
    elements++; if (!root) root = element; if (element.local === 'text') texts++;
    const attrs = element.attributes;
    if (attrs.ecmeta_ssr_type?.value === 'chart' && attrs.ecmeta_series_index && attrs.ecmeta_data_index) {
      const seriesIndex = Number(attrs.ecmeta_series_index.value), dataIndex = Number(attrs.ecmeta_data_index.value);
      if (!chartData.has(seriesIndex)) chartData.set(seriesIndex, new Set());
      chartData.get(seriesIndex).add(dataIndex);
    }
  };
  parser.write(svg).close();
  assert.equal(root.local, 'svg');
  assert.ok(!/\b(?:NaN|Infinity)\b/.test(svg));
  assert.ok(!/<(?:script|iframe|foreignObject)\b/i.test(svg));
  const result = { elements, texts };
  // Evidence logs retain counts; full transient indices are used for exact observation assertions only.
  Object.defineProperty(result, 'chartData', { value: chartData, enumerable: false });
  return result;
}

function assertRenderedObservations(rendered, parsed) {
  for (const expected of rendered.observationSeries || []) {
    const actual = [...(parsed.chartData.get(expected.seriesIndex) || [])].sort((a, b) => a - b);
    assert.deepEqual(actual, Array.from({ length: expected.count }, (_, i) => i), `SVG omitted observations in series ${expected.seriesIndex}`);
  }
}

function render(snapshot, kind, style) {
  if (kind === 'table') {
    const { svg, width, height } = buildTableSVG(snapshot, style);
    return { svg, width, height, series: 0, points: snapshot.table.rows.length, instanceDisposed: true };
  }
  const option = buildChartOption(snapshot, kind, style, 'teal');
  const instance = engine.init(null, null, { renderer: 'svg', ssr: true, width: style.width, height: style.height });
  let svg;
  try { instance.setOption(option); svg = instance.renderToSVGString(); }
  finally { instance.dispose(); }
  assert.equal(instance.isDisposed(), true);
  const series = Array.isArray(option.series) ? option.series : [option.series];
  const sampleKinds = ['scatter', 'rank_scatter', 'waffle', 'strip', 'raincloud', 'group_raincloud'];
  const observationSeries = sampleKinds.includes(kind) ? series.flatMap((s, seriesIndex) => s.type === 'scatter' && !s.name.includes('离群点') ? [{ seriesIndex, count: s.data.length }] : []) : [];
  return { svg, width: style.width, height: style.height, series: series.length, points: series.reduce((n, s) => n + (s?.data?.length || 0), 0), instanceDisposed: true, observationSeries };
}

function assertRetainedData(snapshot, kind, style) {
  if (kind === 'table') {
    const svg = buildTableSVG(snapshot, style).svg;
    const parser = sax.parser(true, { xmlns: true }); const texts = [], positionedTexts = []; let current = null;
    parser.onopentag = node => { if (node.local === 'text') current = { value: '', x: Number(node.attributes.x.value), anchor: node.attributes['text-anchor']?.value }; };
    parser.ontext = text => { if (current !== null) current.value += text; };
    parser.onclosetag = name => { if (name === 'text' && current !== null) { texts.push(current.value); positionedTexts.push(current); current = null; } };
    parser.write(svg).close();
    for (const row of snapshot.table.rows) for (const cell of row.filter(value => typeof value === 'string')) assert.ok(texts.join('').includes(cell), `table text omitted: ${cell}`);
    assert.ok(texts.includes(`n = ${snapshot.n}`));
    // Exact frequency-column position/order proves all 400 rows were emitted, not just a nonempty SVG.
    if (snapshot.cross) {
      const columnX = 28 + 2.5 * (style.width - 56) / snapshot.table.headers.length;
      const frequencyTexts = positionedTexts.filter(text => text.anchor === 'middle' && Math.abs(text.x - columnX) < 1e-8).map(text => text.value);
      assert.deepEqual(frequencyTexts, [snapshot.table.headers[2], ...snapshot.table.rows.map(row => String(row[2]))], 'table frequency column is truncated or out of order');
    }
    return;
  }
  const option = buildChartOption(snapshot, kind, style, 'teal'), series = Array.isArray(option.series) ? option.series : [option.series];
  if (kind === 'waffle') assert.equal(series.reduce((n, s) => n + s.data.length, 0), snapshot.n);
  if (kind === 'scatter' || kind === 'rank_scatter') assert.equal(series[0].data.length, snapshot.n);
  if (['grouped_bar', 'stacked_bar', 'percent_stacked'].includes(kind)) {
    assert.equal(series.length, snapshot.cross.columns.length);
    assert.equal(series.reduce((n, s) => n + s.data.length, 0), snapshot.cross.cells.length);
    if (kind !== 'percent_stacked') assert.equal(series.reduce((n, s) => n + s.data.reduce((a, b) => a + b, 0), 0), snapshot.n);
  }
  if (kind === 'heatmap') { assert.equal(series[0].data.length, 400); assert.equal(series[0].data.reduce((n, row) => n + row[2], 0), snapshot.n); }
  if (kind === 'mosaic') {
    const cells = series.flatMap(s => s.data.map(data => ({ data, column: s.name })));
    assert.equal(cells.length, snapshot.cross.cells.length);
    assert.equal(cells.reduce((n, cell) => n + cell.data[4], 0), snapshot.n);
    let area = 0;
    for (const { data, column } of cells) {
      const [x0, y0, x1, y1, count, rowIndex] = data;
      const row = snapshot.cross.rows[rowIndex], expected = snapshot.cross.cells.find(cell => cell.row === row && cell.column === column);
      assert.equal(count, expected.count);
      const rowTotal = snapshot.cross.cells.filter(cell => cell.row === row).reduce((n, cell) => n + cell.count, 0);
      near(x1 - x0, rowTotal / snapshot.n); near(y1 - y0, count / rowTotal);
      near((x1 - x0) * (y1 - y0), count / snapshot.n); area += (x1 - x0) * (y1 - y0);
    }
    near(area, 1);
  }
  if (kind === 'group_raincloud' || kind === 'raincloud') {
    const sampleSeries = series.filter(s => s.type === 'scatter' && !s.name.includes('离群点'));
    assert.equal(sampleSeries.reduce((n, s) => n + s.data.length, 0), snapshot.n);
    assert.equal(series.filter(s => s.type === 'custom').length, snapshot.distributions.length);
  }
  if (['item_correlation', 'alpha_deleted', 'item_mean'].includes(kind)) assert.equal(series[0].data.length, 30);
}

const expectations = { stress_frequency: 4948, stress_small_frequency: 5000, stress_numeric: 4907, stress_groups: 4884, stress_cross: 4948, stress_pearson: 4837, stress_spearman: 5000, stress_alpha: 4919 };
async function main() {
  await mkdir(outputDir, { recursive: true });
  const sources = ['tests/fixtures/chart-stress-data.ts', 'scripts/chart-stress.mjs', 'lib/chart-options.ts', 'lib/chart-data.ts', 'lib/chart-types.ts', 'lib/chart-registry.ts', 'lib/chart-engine.ts', 'lib/chart-theme.ts', 'lib/chart-palette-reserve.ts', 'lib/analysis-plan.ts', 'lib/analysis-recipes.ts', 'lib/survey-analysis.ts'];
  const sourceManifest = await Promise.all(sources.map(async name => ({ path: `apps/frontend/${name}`, sha256: hash(await readFile(path.join(projectRoot, 'apps/frontend', name))) })));
  const startedAt = new Date().toISOString();
  const csv = buildStressCSV();
  assert.equal(hash(csv), STRESS_FIXTURE.csvSHA256);
  assert.ok(Buffer.byteLength(csv) < SURVEY_LIMITS.bytes);
  const parse = duration(() => parseSurveyCsv(csv));
  assert.equal(parse.value.rows.length, 5000); assert.equal(parse.value.headers.length, 40); assert.equal(parse.value.rows.length * parse.value.headers.length, 200000);
  const profile = duration(() => profileSurvey(parse.value, ['NA']));
  assert.equal(profile.value.columns.filter(c => c.likelyIdentifier).length, 0);
  const prepare = duration(buildStressDataset), dataset = prepare.value;
  const scenarios = buildStressScenarios();
  const before = hash(JSON.stringify(dataset.computed));
  const numerical = [];
  for (const item of dataset.computed) {
    const snapshot = item.module.snapshot;
    assert.equal(snapshot.n, expectations[item.id]); assert.equal(snapshot.n, item.result.n);
    const rows = dataset.table.rows, missing = ['NA'];
    const validNumber = (row, column) => !isMissing(row[column], missing) && finiteNumber(row[column]) !== null;
    let expected;
    if (item.node.method === 'frequency') expected = rows.filter(row => !isMissing(row[item.node.x], missing)).length;
    else if (item.node.method === 'numeric') expected = rows.filter(row => validNumber(row, item.node.x)).length;
    else if (item.node.method === 'groups') expected = rows.filter(row => !isMissing(row[item.node.x], missing) && validNumber(row, item.node.y)).length;
    else if (item.node.method === 'crosstab') expected = rows.filter(row => !isMissing(row[item.node.x], missing) && !isMissing(row[item.node.y], missing)).length;
    else if (item.node.method === 'alpha') expected = rows.filter(row => item.node.scale.columns.every(c => validNumber(row, c) && Number(row[c]) >= 1 && Number(row[c]) <= 5)).length;
    else expected = rows.filter(row => validNumber(row, item.node.x) && validNumber(row, item.node.y)).length;
    assert.equal(snapshot.n, expected);
    if (snapshot.categories.length) { assert.equal(snapshot.categories.reduce((n, c) => n + c.count, 0), expected); near(snapshot.categories.reduce((n, c) => n + c.percent, 0), 100); }
    for (const d of snapshot.distributions) {
      assert.equal(d.values.length, d.summary.n); assert.equal(d.bins.reduce((n, b) => n + b.count, 0), d.values.length);
      assert.equal(d.ecdf.at(-1)[1], 1); assert.ok(d.density === null || d.density.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
    }
    if (snapshot.distributions.length) assert.equal(snapshot.distributions.reduce((n, d) => n + d.values.length, 0), expected);
    if (snapshot.cross) { assert.equal(snapshot.cross.rows.length, 20); assert.equal(snapshot.cross.columns.length, 20); assert.equal(snapshot.cross.cells.length, 400); assert.equal(snapshot.cross.cells.reduce((n, c) => n + c.count, 0), expected); }
    if (snapshot.pairs) assert.equal(snapshot.pairs.values.length, expected);
    if (snapshot.reliability.length) { assert.equal(snapshot.reliability.length, 30); assert.ok(snapshot.reliability.every(item => [item.mean, item.sd, item.correctedItemTotal, item.alphaIfDeleted].every(value => value === null || Number.isFinite(value)))); }
    const calculate = duration(() => runPlanNode(dataset.table, item.node, missing));
    numerical.push({ id: item.id, n: snapshot.n, calculationMs: calculate.ms, tableRows: snapshot.table.rows.length });
  }
  record({ phase, stage: 'data-ready', csvBytes: Buffer.byteLength(csv), csvSHA256: hash(csv), parseMs: parse.ms, profileMs: profile.ms, preparationMs: prepare.ms, numerical });
  const boundaries = [];
  function reject(label, callback, pattern) { const begin = performance.now(); assert.throws(callback, pattern); boundaries.push({ id: label, expected: 'rejected', ms: performance.now() - begin }); }
  reject('5001-rows', () => parseSurveyCsv('数值\n' + Array(5001).fill('1').join('\n')), /5,000/);
  reject('205000-cells', () => parseSurveyCsv(Array.from({ length: 41 }, (_, i) => `列${i}`).join(',') + '\n' + Array(5000).fill(Array(41).fill('1').join(',')).join('\n')), /200,000/);
  const short = '数值\n1\n', exactBytes = short + '\n'.repeat(2_000_000 - Buffer.byteLength(short));
  assert.equal(Buffer.byteLength(exactBytes), 2_000_000); assert.equal(parseSurveyCsv(exactBytes).rows.length, 1);
  boundaries.push({ id: 'exact-2000000-bytes', expected: 'accepted' });
  reject('2000001-bytes', () => parseSurveyCsv(exactBytes + '\n'), /2 MB/);
  reject('81-columns', () => parseSurveyCsv(Array.from({ length: 81 }, (_, i) => `列${i}`).join(',') + '\n' + Array(81).fill('1').join(',')), /80/);
  const eighty = parseSurveyCsv(Array.from({ length: 80 }, (_, i) => `列${i}`).join(',') + '\n' + Array(2500).fill(Array(80).fill('1').join(',')).join('\n'));
  assert.equal(eighty.rows.length * eighty.headers.length, 200000); boundaries.push({ id: '2500x80-cells', expected: 'accepted' });
  reject('31-scale-items', () => runPlanNode(dataset.table, { ...createPlanNode('alpha', 'oversize'), scale: { columns: Array.from({ length: 31 }, (_, i) => i + 9), reverse: [], min: 1, max: 5, construct: '合成量表' } }, ['NA']), /30/);
  const fiftyOne = parseSurveyCsv('类别\n' + Array.from({ length: 51 }, (_, i) => `类别${i}`).join('\n'));
  reject('51-frequency-categories', () => runPlanNode(fiftyOne, { ...createPlanNode('frequency', 'oversize'), x: 0 }, []), /50/);
  const twentyOne = parseSurveyCsv('类别,分值,场景\n' + Array.from({ length: 21 }, (_, i) => `类别${i},${i},场景${i % 2}`).join('\n'));
  reject('21-groups', () => runPlanNode(twentyOne, { ...createPlanNode('groups', 'oversize'), x: 0, y: 1 }, []), /20/);
  reject('21-cross-levels', () => runPlanNode(twentyOne, { ...createPlanNode('crosstab', 'oversize'), x: 0, y: 2 }, []), /20/);
  const eligible = [], exercised = new Set();
  for (const item of dataset.computed) for (const choice of chartChoices(item.module.snapshot).filter(choice => choice.available)) for (const fontFamily of ['sans', 'serif']) {
    const style = { ...defaultChartStyle(`${STRESS_FIXTURE.version} · ${choice.title} α₁`), fontSize: 16, width: 1600, height: 1000, fontFamily, note: '教学模拟数据 <合成> & 完整有效样本' };
    assertRetainedData(item.module.snapshot, choice.id, style);
    const measured = duration(() => render(item.module.snapshot, choice.id, style));
    const svgStats = strictXML(measured.value.svg);
    assertRenderedObservations(measured.value, svgStats);
    assert.ok(measured.value.svg.includes('教学模拟数据'));
    assert.ok(measured.value.svg.includes(`n = ${item.result.n}`));
    if (['scatter', 'rank_scatter', 'waffle', 'strip', 'raincloud', 'group_raincloud'].includes(choice.id)) assert.ok(svgStats.elements >= item.result.n, `${choice.id} omitted observation symbols from actual SVG`);
    eligible.push({ module: item.id, kind: choice.id, fontFamily, n: item.result.n, ms: measured.ms, bytes: Buffer.byteLength(measured.value.svg), width: measured.value.width, height: measured.value.height, series: measured.value.series, points: measured.value.points, ...svgStats });
    exercised.add(choice.id);
  }
  assert.equal(exercised.size, 31); // 30 graphical recipes plus the table.
  record({ phase, stage: 'eligible-render-complete', renders: eligible.length, distinctKinds: exercised.size, slowest: [...eligible].sort((a, b) => b.ms - a.ms).slice(0, 8) });
  const artifacts = [];
  for (const scenario of scenarios) {
    const value = render(scenario.module.snapshot, scenario.kind, scenario.style); const svgStats = strictXML(value.svg); assertRenderedObservations(value, svgStats);
    const name = `${phase}-${scenario.id}.svg`, target = path.join(outputDir, name);
    await writeFile(target, value.svg); artifacts.push({ path: path.relative(projectRoot, target).replaceAll('\\', '/'), sha256: hash(value.svg), bytes: Buffer.byteLength(value.svg), width: value.width, height: value.height, n: scenario.module.snapshot.n });
  }
  // Warm every primary scenario before collecting heap points; retain no SVG or engine instance.
  for (const scenario of scenarios) render(scenario.module.snapshot, scenario.kind, scenario.style);
  const explicitGC = typeof global.gc === 'function';
  if (explicitGC) global.gc();
  const samples = [{ cycle: 0, heapUsed: process.memoryUsage().heapUsed, rss: process.memoryUsage().rss }];
  const cycles = [];
  for (let i = 0; i < 120; i++) {
    const scenario = scenarios[i % scenarios.length];
    const begin = performance.now();
    const value = render(scenario.module.snapshot, scenario.kind, { ...scenario.style, fontFamily: i % 2 ? 'serif' : 'sans' });
    const stats = strictXML(value.svg);
    assertRenderedObservations(value, stats);
    cycles.push({ cycle: i + 1, scenario: scenario.id, n: scenario.module.snapshot.n, ms: performance.now() - begin, bytes: Buffer.byteLength(value.svg), instanceDisposed: value.instanceDisposed, ...stats });
    if ((i + 1) % 20 === 0) {
      if (explicitGC) global.gc();
      samples.push({ cycle: i + 1, heapUsed: process.memoryUsage().heapUsed, rss: process.memoryUsage().rss });
      record({ phase, stage: 'repeated-render', completed: i + 1, total: 120, heap: samples.at(-1) });
    }
  }
  assert.equal(hash(JSON.stringify(dataset.computed)), before, 'rendering mutated input data or result snapshots');
  const afterHashes = await Promise.all(sourceManifest.map(async entry => ({ path: entry.path, sha256: hash(await readFile(path.join(projectRoot, entry.path))) })));
  assert.deepEqual(afterHashes, sourceManifest, 'production source changed during this run; rerun against a stable revision');
  const result = {
    schema: 'chart-stress-evidence/v1', phase, status: 'passed', startedAt, completedAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpuModel: os.cpus()[0]?.model, cpuCount: os.cpus().length, echarts: engine.version },
    fixture: { ...STRESS_FIXTURE, csvBytes: Buffer.byteLength(csv), cells: 200000, dataClass: 'synthetic' }, sourceManifest,
    data: { parseMs: parse.ms, profileMs: profile.ms, preparationMs: prepare.ms, numerical }, boundaries,
    allEligible: { renders: eligible.length, distinctKinds: [...exercised].sort(), measurements: eligible },
    repeated: { cycles: 120, measurements: cycles, durationMs: summary(cycles.map(row => row.ms)), explicitGC, warmupRenders: scenarios.length, heapSamples: samples, postGCHeapDeltaBytes: explicitGC ? samples.at(-1).heapUsed - samples[0].heapUsed : null },
    artifacts, limitations: ['Synthetic maximum supported row/cell cases only; not evidence of 50,000-row support.', 'Node SSR is distinct from browser layout, long tasks, React races, PNG conversion and device performance.', 'Heap samples are same-process observations after warmup; no universal memory/performance guarantee or inferred leak classification.'],
  };
  const evidencePath = path.join(outputDir, `${phase}.json`);
  await writeFile(evidencePath, JSON.stringify(result, null, 2) + '\n');
  await writeFile(path.join(outputDir, `${phase}.jsonl`), trace.map(value => JSON.stringify(value)).join('\n') + '\n');
  record({ phase, stage: 'complete', status: 'passed', evidence: path.relative(projectRoot, evidencePath).replaceAll('\\', '/'), sha256: hash(await readFile(evidencePath)), cycles: 120, durationMs: result.repeated.durationMs, explicitGC, postGCHeapDeltaBytes: result.repeated.postGCHeapDeltaBytes });
}
try { await main(); }
catch (error) { console.error(error); process.exitCode = 1; }
