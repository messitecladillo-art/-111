import test from 'node:test';
import assert from 'node:assert/strict';
import sax from 'sax';
import { RESEARCH_PALETTES } from '../lib/chart-palette-reserve.ts';
import { CHART_THEMES, defaultChartStyle, serializeChartSettings, restoreChartSettings, themeColor } from '../lib/chart-theme.ts';
import { buildChartOption } from '../lib/chart-options.ts';
import { engine } from '../lib/chart-engine.ts';
import { buildStressScenarios } from './fixtures/chart-stress-data.ts';

const scenarios = buildStressScenarios();
test('palette reserve has exact public provenance and complete valid category/numeric color arrays', () => {
  assert.equal(RESEARCH_PALETTES.length, 9);
  assert.equal(new Set(RESEARCH_PALETTES.map(item => item.id)).size, 9);
  assert.equal(CHART_THEMES.length, 14);
  for (const palette of RESEARCH_PALETTES) {
    assert.match(palette.id, /^ref_[a-z0-9_]+$/);
    assert.equal(palette.source.url, 'https://zhuanlan.zhihu.com/p/670396774');
    assert.ok(palette.colors.length >= 2);
    const theme = CHART_THEMES.find(item => item.id === palette.id);
    assert.deepEqual(theme.colors, palette.colors);
    for (const color of [...theme.colors, ...theme.continuous]) assert.match(color, /^#[0-9A-F]{6}$/);
    assert.ok(theme.continuous.length >= 2);
  }
});

test('old themes retain original heatmap endpoints; new categorical hues and numeric ramps remain separate', () => {
  for (const theme of CHART_THEMES.slice(0, 5)) assert.deepEqual(theme.continuous, [theme.colors.at(-1), theme.colors[0]]);
  const warm = RESEARCH_PALETTES.find(item => item.kind === 'sequential');
  assert.deepEqual(CHART_THEMES.find(item => item.id === warm.id).continuous, warm.colors);
  const cross = scenarios.find(item => item.kind === 'heatmap').module.snapshot;
  for (const theme of CHART_THEMES) {
    const option = buildChartOption(cross, 'heatmap', defaultChartStyle('频数强度'), theme.id);
    assert.deepEqual(option.visualMap.inRange.color, theme.continuous);
    assert.equal(option.visualMap.min, 0);
    assert.deepEqual(option.visualMap.text, [String(Math.max(...cross.cross.cells.map(cell => cell.count))), '0']);
    assert.equal(option.series[0].data.length, 400);
    assert.ok(option.series[0].data.every(cell => Number.isFinite(cell[2])));
    const emphasis = buildChartOption(cross, 'heatmap', { ...defaultChartStyle(''), accent: '#145678' }, theme.id);
    assert.deepEqual(emphasis.visualMap.inRange.color, [theme.continuous[0], '#145678']);
  }
});

test('all reserve IDs survive strict current-version format roundtrip without observations or palette drift', () => {
  const chartModule = scenarios[0].module;
  for (const palette of RESEARCH_PALETTES) {
    const settings = { schema: 'chart-style/v1', theme: palette.id, figures: { [chartModule.id]: { kind: 'group_raincloud', style: defaultChartStyle(chartModule.title) } } };
    const raw = serializeChartSettings(settings, [chartModule]);
    assert.deepEqual(restoreChartSettings(raw, [chartModule]), settings);
    assert.ok(!raw.includes('"observations"'));
    for (const key of ['["组别","甲"]', '["组别","乙"]']) {
      const color = themeColor(key, palette.id);
      assert.ok(palette.colors.includes(color));
      assert.equal(themeColor(key, palette.id), color);
    }
    const invalid = JSON.parse(raw); invalid.theme += '_unregistered';
    assert.throws(() => restoreChartSettings(JSON.stringify(invalid), [chartModule]), /项目色系无效/);
  }
});

test('default 20-group static raincloud retains distinct complete axis labels and full non-paginated legend', () => {
  const snapshot = scenarios[0].module.snapshot, style = defaultChartStyle('二十组复杂图');
  const option = buildChartOption(snapshot, 'group_raincloud', style, 'teal');
  assert.equal(option.legend.type, 'plain');
  assert.deepEqual(option.legend.data, snapshot.distributions.map(item => item.label));
  const chart = engine.init(null, undefined, { renderer: 'svg', ssr: true, width: style.width, height: style.height });
  let svg;
  try { chart.setOption(option); svg = chart.renderToSVGString(); } finally { chart.dispose(); }
  const texts = []; let buffer = null;
  const parser = sax.parser(true, { xmlns: true, strictEntities: true });
  parser.onerror = error => { throw error; };
  parser.onopentag = node => { if (node.local === 'text') buffer = ''; };
  parser.ontext = value => { if (buffer !== null) buffer += value; };
  parser.onclosetag = name => { if (name === 'text' && buffer !== null) { texts.push(buffer); buffer = null; } };
  parser.write(svg).close();
  for (const label of snapshot.distributions.map(item => item.label)) {
    assert.ok(texts.filter(value => value === label).length >= 2, `Missing distinct axis label and full legend: ${label}`);
  }
  assert.ok(!texts.includes('人群…'));
});
