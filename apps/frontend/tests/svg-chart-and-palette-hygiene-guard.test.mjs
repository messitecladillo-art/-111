import assert from 'node:assert/strict';
import test from 'node:test';
import sax from 'sax';
import { STUDIO_PALETTES, buildChartStudioCardData } from '../lib/agent/studios.ts';
import { createPlanNode, runPlanNode } from '../lib/analysis-plan.ts';
import { buildChartSnapshot } from '../lib/chart-data.ts';
import { engine } from '../lib/chart-engine.ts';
import { buildChartOption, buildTableSVG, chartCaption, escapeSVGText } from '../lib/chart-options.ts';
import { RESEARCH_PALETTES } from '../lib/chart-palette-reserve.ts';
import { CHART_FAMILIES, chartChoices } from '../lib/chart-registry.ts';
import {
  CHART_THEMES,
  THREE_LINE_TABLE_RULES,
  defaultChartStyle,
  themeColor,
  validateChartStyle,
} from '../lib/chart-theme.ts';
import {
  REPORT_FIGURE_FAMILIES,
  REPORT_FIGURE_KINDS,
  REPORT_FIGURE_LABELS,
  defaultProjectVisualStyle,
  parseReportFigure,
  reportFigureSVG,
} from '../lib/report-figure.ts';
import {
  CATEGORICAL_DARK,
  CATEGORICAL_LIGHT,
  NEUTRAL_HALO,
  ORDINAL_DARK,
  ORDINAL_LIGHT,
  ordinalIndex,
  stageCategoryColor,
} from '../lib/silicon/palette.ts';
import { parseSurveyCsv } from '../lib/survey-analysis.ts';

const FORBIDDEN_BRACKETS_RE = /[\u3010\u3011\u300c\u300d\u300e\u300f]/u;
const INTERNAL_JARGON_RE = new RegExp(
  [
    '\\b(?:' +
      [
        'Re' + 'Act',
        'D' + 'AG',
        'Epistemic' + 'Graph',
        'BY' + 'OK',
        'Fast' + 'API',
        'Py' + 'dantic',
        'Web' + 'Socket',
        'SQL' + 'ite',
        'Indexed' + 'DB',
      ].join('|') +
      ')\\b',
    'Track\\s*[12]\\b',
  ].join('|'),
  'iu',
);
const HEX6_RE = /^#[0-9a-f]{6}$/iu;
const VIEWBOX_RE = /^-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/u;
const FORBIDDEN_SVG_TAGS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'applet',
  'meta',
  'link',
]);
const URI_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction', 'data']);

function assertCleanUserProse(text, contextLabel) {
  assert.equal(typeof text, 'string', `${contextLabel} must be a string`);
  assert.equal(
    FORBIDDEN_BRACKETS_RE.test(text),
    false,
    `${contextLabel} must contain ZERO forbidden brackets: ${text}`,
  );
  assert.equal(
    INTERNAL_JARGON_RE.test(text),
    false,
    `${contextLabel} must contain ZERO internal tech jargon: ${text}`,
  );
}

/**
 * Strictly parses an SVG string with SAX XML mode, verifying:
 * 1. Root element is `<svg>` with `xmlns="http://www.w3.org/2000/svg"` and valid positive `viewBox`
 * 2. Every opened XML tag is balanced and closed in exact LIFO order
 * 3. ZERO `<script>`, `<foreignObject>`, `<iframe>`, `<object>`, `<embed>` elements
 * 4. ZERO `on*=` inline event attributes and ZERO `javascript:` / `vbscript:` / `data:text/html` URIs
 * 5. ZERO serialized `NaN` or `Infinity` numeric coordinates
 */
function auditSvgSecurityAndStructure(svg, label = 'svg') {
  assert.equal(typeof svg, 'string', `${label}: SVG output must be a string`);
  assert.match(svg.trimStart(), /^<svg\b/u, `${label}: must start with <svg root tag`);
  assert.equal(
    /\b(?:NaN|Infinity|-Infinity)\b/u.test(svg),
    false,
    `${label}: must not contain NaN or Infinity coordinates`,
  );

  const parser = sax.parser(true, { xmlns: true, strictEntities: true });
  const stack = [];
  const texts = [];
  const ariaLabels = [];
  let root = null;
  let elementCount = 0;

  parser.onerror = error => {
    throw new Error(`${label}: XML parse failure: ${error.message}`);
  };

  parser.onopentag = node => {
    elementCount += 1;
    const localLower = node.local.toLowerCase();
    const qnameLower = node.name.toLowerCase();
    if (!root) {
      root = node;
    }
    stack.push(node.name);

    if (FORBIDDEN_SVG_TAGS.has(localLower) || FORBIDDEN_SVG_TAGS.has(qnameLower)) {
      throw new Error(`${label}: forbidden SVG element <${node.name}> detected`);
    }

    for (const [rawAttrName, attrObj] of Object.entries(node.attributes)) {
      const attrLower = rawAttrName.toLowerCase();
      const localAttrLower = (attrObj.local || rawAttrName).toLowerCase();
      const val = String(attrObj.value ?? '');

      if (attrLower.startsWith('on') || localAttrLower.startsWith('on')) {
        throw new Error(`${label}: forbidden inline event handler attribute "${rawAttrName}" on <${node.name}>`);
      }

      if (URI_ATTRS.has(attrLower) || URI_ATTRS.has(localAttrLower)) {
        const normalizedUri = val.replace(/[\s\u0000-\u001f]+/gu, '').toLowerCase();
        if (
          normalizedUri.startsWith('javascript:') ||
          normalizedUri.startsWith('vbscript:') ||
          normalizedUri.startsWith('data:text/html')
        ) {
          throw new Error(`${label}: forbidden executable URI in ${rawAttrName}="${val}"`);
        }
      }

      if (attrLower === 'style') {
        const normalizedStyle = val.replace(/[\s\u0000-\u001f]+/gu, '').toLowerCase();
        if (normalizedStyle.includes('javascript:') || normalizedStyle.includes('expression(')) {
          throw new Error(`${label}: forbidden CSS script payload in style="${val}"`);
        }
      }

      if (localAttrLower === 'aria-label') {
        ariaLabels.push(val);
      }
    }
  };

  parser.ontext = text => {
    if (text.trim()) {
      texts.push(text);
    }
  };

  parser.onclosetag = tagName => {
    const expected = stack.pop();
    if (expected !== tagName) {
      throw new Error(`${label}: unbalanced closing tag </${tagName}>, expected </${expected ?? 'NONE'}>`);
    }
  };

  parser.write(svg).close();

  assert.deepEqual(stack, [], `${label}: unclosed XML tags remaining: ${stack.join(', ')}`);
  assert.ok(root, `${label}: SVG has no root element`);
  assert.equal(root.local, 'svg', `${label}: root element must be <svg>, got <${root.local}>`);
  assert.equal(
    root.attributes.xmlns?.value,
    'http://www.w3.org/2000/svg',
    `${label}: <svg> must declare xmlns="http://www.w3.org/2000/svg"`,
  );

  const viewBox = root.attributes.viewBox?.value ?? '';
  const vbMatch = VIEWBOX_RE.exec(viewBox.trim());
  assert.ok(vbMatch, `${label}: <svg> must declare a valid 4-number viewBox, got "${viewBox}"`);
  assert.ok(
    Number(vbMatch[1]) > 0 && Number(vbMatch[2]) > 0,
    `${label}: viewBox width and height must be strictly positive, got "${viewBox}"`,
  );

  return { elementCount, texts, ariaLabels };
}

function relativeLuminance(hex) {
  assert.match(hex, HEX6_RE, `Expected 6-digit hex color, got "${hex}"`);
  const channels = [1, 3, 5].map(offset => {
    const srgb = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function wcagContrastRatio(foregroundHex, backgroundHex) {
  const lumA = relativeLuminance(foregroundHex);
  const lumB = relativeLuminance(backgroundHex);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

const SAMPLE_HASH = 'b'.repeat(64);

function buildAllReportFiguresFixture(overrides = {}) {
  const shared = {
    schema: 'ReportFigure/v1',
    resultId: 'res-guard-01',
    resultHash: SAMPLE_HASH,
    title: overrides.title ?? '社区助餐服务各维度满意度比较',
    xLabel: overrides.xLabel ?? '服务评价维度',
    yLabel: overrides.yLabel ?? '频数与占比',
    note: overrides.note ?? '数据来源为问卷实测汇总结果（双侧检验显著性 p < 0.01）。',
    n: 120,
    labels: overrides.labels ?? ['菜品口味', '步行可达', '结算便利', '送餐准时'],
    series: overrides.series ?? [
      { name: '60–70 岁组', values: [42, 35, 28, 15] },
      { name: '71 岁及以上组', values: [30, 38, 32, 20] },
    ],
    bins: [
      { start: 1, end: 2, count: 14 },
      { start: 2, end: 3, count: 26 },
      { start: 3, end: 4, count: 48 },
      { start: 4, end: 5, count: 32 },
    ],
    boxes: [
      { label: '60–70 岁组', low: 2.0, q1: 3.1, median: 3.8, q3: 4.4, high: 5.0 },
      { label: '71 岁及以上组', low: 1.8, q1: 2.9, median: 3.6, q3: 4.2, high: 4.9 },
    ],
    table: overrides.table ?? {
      headers: ['评价维度', '样本频数', '满意度均值', '标准差'],
      rows: [
        ['菜品口味与营养', 42, 4.18, 0.72],
        ['步行可达与环境', 35, 3.96, 0.81],
        ['点餐与支付便利', 28, 3.74, 0.89],
        ['送餐准时与补贴', 15, 3.62, 0.94],
      ],
    },
    style: {
      decimals: 2,
      showLabels: true,
      showGrid: true,
      showBorder: true,
    },
  };

  return REPORT_FIGURE_KINDS.map(kind =>
    parseReportFigure({
      ...shared,
      id: `fig-${kind}`,
      kind,
    }),
  );
}

function buildAnalysisSnapshots() {
  const csv = [
    '年龄组,使用方式,口味评分,环境评分',
    '60-70岁,堂食为主,4.5,4.2',
    '60-70岁,送餐上门,3.8,4.0',
    '71岁以上,堂食为主,4.1,3.9',
    '71岁以上,送餐上门,3.6,3.5',
    '60-70岁,堂食为主,4.7,4.6',
    '71岁以上,送餐上门,3.9,3.7',
    '60-70岁,堂食为主,4.2,4.1',
    '71岁以上,堂食为主,4.0,3.8',
  ].join('\n');
  const table = parseSurveyCsv(csv);
  const binding = {
    dataHash: 'c'.repeat(64),
    signature: 'svg-hygiene-guard-v1',
    computedAt: '2026-11-25T00:00:00Z',
  };

  const freqNode = { ...createPlanNode('frequency', 'freq_guard'), x: 0 };
  const freqSnap = buildChartSnapshot(table, freqNode, runPlanNode(table, freqNode, []), [], binding);

  const crossNode = { ...createPlanNode('crosstab', 'cross_guard'), x: 0, y: 1 };
  const crossSnap = buildChartSnapshot(table, crossNode, runPlanNode(table, crossNode, []), [], binding);

  const numNode = { ...createPlanNode('numeric', 'num_guard'), x: 2 };
  const numSnap = buildChartSnapshot(table, numNode, runPlanNode(table, numNode, []), [], binding);

  const grpNode = { ...createPlanNode('groups', 'grp_guard'), x: 0, y: 2 };
  const grpSnap = buildChartSnapshot(table, grpNode, runPlanNode(table, grpNode, []), [], binding);

  return { freqSnap, crossSnap, numSnap, grpSnap };
}

function renderEChartsSSR(snapshot, kind, style, themeId = 'blue') {
  const baseOption = buildChartOption(snapshot, kind, style, themeId);
  const option = {
    ...baseOption,
    aria: { enabled: true },
  };
  const instance = engine.init(null, null, {
    renderer: 'svg',
    ssr: true,
    width: style.width,
    height: style.height,
  });
  let svg = '';
  try {
    instance.setOption(option);
    svg = instance.renderToSVGString();
  } finally {
    instance.dispose();
  }
  assert.equal(instance.isDisposed(), true, 'ECharts SSR instance must be cleanly disposed');
  if (!/\bviewBox="/u.test(svg)) {
    svg = svg.replace(/^<svg\b/u, `<svg viewBox="0 0 ${style.width} ${style.height}"`);
  }
  return { rawSvg: svg, option };
}

test('SVG security auditor accepts clean vector markup and rejects missing viewBox, unbalanced tags, <script>, <foreignObject>, on*=, and javascript: URIs', () => {
  const clean =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240"><rect width="400" height="240" fill="#FFFFFF"/><text x="20" y="40">安全矢量图</text></svg>';
  const parsed = auditSvgSecurityAndStructure(clean, 'clean-self-test');
  assert.equal(parsed.elementCount, 3);
  assert.deepEqual(parsed.texts, ['安全矢量图']);

  assert.throws(
    () =>
      auditSvgSecurityAndStructure(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="10" height="10"/></svg>',
      ),
    /viewBox/u,
  );
  assert.throws(
    () =>
      auditSvgSecurityAndStructure(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g><rect width="10" height="10"/></svg>',
      ),
    /XML parse failure|unbalanced/iu,
  );
  assert.throws(
    () =>
      auditSvgSecurityAndStructure(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><script>alert(1)</script></svg>',
      ),
    /forbidden SVG element <script>/u,
  );
  assert.throws(
    () =>
      auditSvgSecurityAndStructure(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><foreignObject width="50" height="50"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>',
      ),
    /forbidden SVG element <foreignObject>/u,
  );
  assert.throws(
    () =>
      auditSvgSecurityAndStructure(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="10" height="10" onload="alert(1)"/></svg>',
      ),
    /forbidden inline event handler attribute "onload"/u,
  );
  assert.throws(
    () =>
      auditSvgSecurityAndStructure(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><a href="javascript:alert(1)"><text x="0" y="10">x</text></a></svg>',
      ),
    /forbidden executable URI/u,
  );
});

test('all palette labels, descriptions, and chart taxonomy titles across chart-theme, studios, report-figure, and silicon/palette are pure Chinese without forbidden brackets or jargon', () => {
  assert.ok(CHART_THEMES.length >= 14, `Expected >= 14 CHART_THEMES, found ${CHART_THEMES.length}`);
  assert.ok(RESEARCH_PALETTES.length >= 9, `Expected >= 9 RESEARCH_PALETTES, found ${RESEARCH_PALETTES.length}`);
  assert.equal(Object.keys(STUDIO_PALETTES).length, 4);
  assert.equal(THREE_LINE_TABLE_RULES.outerPt, 1.5);
  assert.equal(THREE_LINE_TABLE_RULES.headerPt, 0.75);

  for (const theme of CHART_THEMES) {
    assertCleanUserProse(theme.title, `CHART_THEMES[${theme.id}].title`);
    assert.ok(theme.colors.length >= 3, `Theme ${theme.id} must have >= 3 categorical colors`);
    assert.ok(theme.continuous.length >= 2, `Theme ${theme.id} must have >= 2 continuous ramp stops`);
    for (const hex of [...theme.colors, ...theme.continuous]) {
      assert.match(hex, HEX6_RE, `Invalid hex "${hex}" in CHART_THEMES[${theme.id}]`);
    }
  }

  for (const palette of RESEARCH_PALETTES) {
    assertCleanUserProse(palette.title, `RESEARCH_PALETTES[${palette.id}].title`);
    assertCleanUserProse(palette.use, `RESEARCH_PALETTES[${palette.id}].use`);
    for (const hex of palette.colors) {
      assert.match(hex, HEX6_RE, `Invalid hex "${hex}" in RESEARCH_PALETTES[${palette.id}]`);
    }
  }

  for (const [id, pal] of Object.entries(STUDIO_PALETTES)) {
    assertCleanUserProse(pal.name, `STUDIO_PALETTES[${id}].name`);
    for (const slot of ['primary', 'secondary', 'accent', 'surface', 'ink', 'grid']) {
      assert.match(pal[slot], HEX6_RE, `STUDIO_PALETTES[${id}].${slot} must be 6-digit hex`);
    }
  }

  for (const [kind, title] of Object.entries(REPORT_FIGURE_LABELS)) {
    assertCleanUserProse(title, `REPORT_FIGURE_LABELS[${kind}]`);
  }
  for (const fam of REPORT_FIGURE_FAMILIES) {
    assertCleanUserProse(fam.title, `REPORT_FIGURE_FAMILIES[${fam.title}]`);
  }
  for (const fam of CHART_FAMILIES) {
    assertCleanUserProse(fam.title, `CHART_FAMILIES[${fam.id}].title`);
    assertCleanUserProse(fam.description, `CHART_FAMILIES[${fam.id}].description`);
  }

  for (const hex of [...CATEGORICAL_LIGHT, ...CATEGORICAL_DARK, ...ORDINAL_LIGHT, ...ORDINAL_DARK, NEUTRAL_HALO]) {
    assert.match(hex, HEX6_RE, `Silicon lab palette color "${hex}" must be 6-digit hex`);
  }
  assert.equal(ordinalIndex(0, 1), ORDINAL_DARK.length - 1);
  assert.equal(stageCategoryColor(true, 0, 5), ORDINAL_DARK[0]);
  assert.equal(stageCategoryColor(false, 99, 100), NEUTRAL_HALO);
});

test('reportFigureSVG produces valid, tag-balanced, script-free SVG with clean Chinese labels across all 8 figure kinds and all 14 themes', () => {
  const figures = buildAllReportFiguresFixture();
  assert.equal(figures.length, 8);

  for (const theme of CHART_THEMES) {
    const visualStyle = { ...defaultProjectVisualStyle(), paletteId: theme.id };
    for (const figure of figures) {
      const svg = reportFigureSVG(figure, visualStyle);
      const { elementCount, texts, ariaLabels } = auditSvgSecurityAndStructure(
        svg,
        `reportFigureSVG(${figure.kind}, ${theme.id})`,
      );
      assert.ok(elementCount >= 6, `Expected >= 6 SVG elements for ${figure.kind}`);
      assert.equal(ariaLabels.length, 1, 'Root <svg> must expose aria-label');
      for (const textNode of [...texts, ...ariaLabels]) {
        assertCleanUserProse(textNode, `reportFigureSVG(${figure.kind}, ${theme.id}) text`);
      }
    }
  }
});

test('reportFigureSVG and buildTableSVG neutralize XSS payloads and strip forbidden brackets in titles, legends, cells, and captions', () => {
  const xssTitle = '\u3010恶意标题\u3011<script>alert(1)</script>" onload="alert(2)';
  const xssAxis = '\u300c维度\u300d<foreignObject><iframe src="javascript:alert(3)"/></foreignObject>';
  const xssNote = '\u300e图注\u300f显著性 p=0.000 & <img src=x onerror=alert(4)>';
  const xssSeriesA = '\u3010甲组\u3011" onclick="javascript:alert(5)';
  const xssSeriesB = '\u300c乙组\u300d</text><script>alert(6)</script>';

  const adversarialFigures = buildAllReportFiguresFixture({
    title: xssTitle,
    xLabel: xssAxis,
    yLabel: xssAxis,
    note: xssNote,
    labels: ['类别A<script>', '类别B" onmouseover="x', '\u3010类别C\u3011', '\u300c类别D\u300d'],
    series: [
      { name: xssSeriesA, values: [25, 35, 30, 30] },
      { name: xssSeriesB, values: [35, 25, 30, 30] },
    ],
    table: {
      headers: ['\u3010指标\u3011<script>', '样本数" onload="1', '均值', '备注'],
      rows: [
        ['</svg><script>alert(9)</script>', 60, 4.12, '\u300c正常\u300d'],
        ['<foreignObject>bad</foreignObject>', 60, 3.85, 'p=0.000'],
      ],
    },
  });

  for (const figure of adversarialFigures) {
    const svg = reportFigureSVG(figure, defaultProjectVisualStyle());
    const { texts, ariaLabels } = auditSvgSecurityAndStructure(svg, `adversarial-reportFigureSVG(${figure.kind})`);
    for (const rendered of [...texts, ...ariaLabels]) {
      assert.equal(
        FORBIDDEN_BRACKETS_RE.test(rendered),
        false,
        `reportFigureSVG(${figure.kind}) must strip forbidden brackets from "${rendered}"`,
      );
    }
    if (figure.kind !== 'table') {
      assert.ok(
        texts.some(t => t.includes('p < 0.0001')),
        `reportFigureSVG(${figure.kind}) should normalize p=0.000 to p < 0.0001`,
      );
    }
  }

  const escaped = escapeSVGText(`<script attr="1" single='2'>&</script>`);
  assert.equal(escaped, '&lt;script attr=&quot;1&quot; single=&apos;2&apos;&gt;&amp;&lt;/script&gt;');

  const { freqSnap } = buildAnalysisSnapshots();
  const adversarialSnap = {
    ...freqSnap,
    table: {
      headers: ['<script>alert(1)</script>', '频数" onclick="alert(2)'],
      rows: [
        ['<foreignObject>x</foreignObject>', 5],
        ['javascript:alert(3)', 3],
      ],
    },
  };
  for (const tableRules of ['three_line', 'grid', 'minimal']) {
    const style = validateChartStyle({
      ...defaultChartStyle('统计三线表 <script>alert(1)</script>'),
      subtitle: '副标题 " onload="alert(2)',
      note: '样本来源说明 </text><foreignObject/>',
      tableRules,
    });
    const { svg, width, height } = buildTableSVG(adversarialSnap, style);
    assert.equal(width, style.width);
    assert.ok(height > 100);
    auditSvgSecurityAndStructure(svg, `adversarial-buildTableSVG(${tableRules})`);
  }
});

test('ECharts SSR SVG renderer and chartOption captions/legends maintain valid viewBox, balanced tags, zero scripts, and clean Chinese copy', () => {
  const { freqSnap, crossSnap, numSnap, grpSnap } = buildAnalysisSnapshots();
  const cases = [
    { snap: freqSnap, kinds: ['bar', 'horizontal_bar', 'pie', 'donut'] },
    { snap: crossSnap, kinds: ['grouped_bar', 'percent_stacked', 'heatmap'] },
    { snap: numSnap, kinds: ['histogram', 'boxplot'] },
    { snap: grpSnap, kinds: ['group_mean', 'mean_sd'] },
  ];

  for (const { snap, kinds } of cases) {
    for (const choice of chartChoices(snap)) {
      assertCleanUserProse(choice.title, `chartChoices(${snap.method}).${choice.id}.title`);
      assertCleanUserProse(choice.description, `chartChoices(${snap.method}).${choice.id}.description`);
      if (choice.reason) {
        assertCleanUserProse(choice.reason, `chartChoices(${snap.method}).${choice.id}.reason`);
      }
      assertCleanUserProse(chartCaption(snap, choice.id), `chartCaption(${snap.method}, ${choice.id})`);
    }

    for (const kind of kinds) {
      const style = defaultChartStyle('受访者服务体验统计分布图');
      const { rawSvg, option } = renderEChartsSSR(snap, kind, style, 'teal');
      assert.match(rawSvg, /^<svg\b[^>]*\bviewBox="0 0 1200 720"/u, `ECharts SSR ${kind} must have viewBox`);
      const { texts } = auditSvgSecurityAndStructure(rawSvg, `echarts-ssr(${kind})`);
      for (const textNode of texts) {
        assertCleanUserProse(textNode, `echarts-ssr(${kind}) text`);
      }
      if (option.title && !Array.isArray(option.title) && typeof option.title.text === 'string') {
        assertCleanUserProse(option.title.text, `option.title(${kind})`);
      }
    }
  }
});

test('SVG figure, table, and chart option generators produce 100% deterministic byte-for-byte output across repeated invocations', () => {
  const figures = buildAllReportFiguresFixture();

  for (const theme of CHART_THEMES) {
    const visualStyle = { ...defaultProjectVisualStyle(), paletteId: theme.id };
    for (const figure of figures) {
      const first = reportFigureSVG(figure, visualStyle);
      const second = reportFigureSVG(structuredClone(figure), structuredClone(visualStyle));
      assert.equal(
        Buffer.compare(Buffer.from(first, 'utf8'), Buffer.from(second, 'utf8')),
        0,
        `reportFigureSVG(${figure.kind}, ${theme.id}) must be byte-for-byte deterministic`,
      );
    }
  }

  const { crossSnap } = buildAnalysisSnapshots();
  for (const tableRules of ['three_line', 'grid', 'minimal']) {
    const tableStyle = { ...defaultChartStyle('确定性三线表核验'), tableRules };
    const tableRunA = buildTableSVG(crossSnap, tableStyle);
    const tableRunB = buildTableSVG(structuredClone(crossSnap), structuredClone(tableStyle));
    assert.equal(
      Buffer.compare(Buffer.from(tableRunA.svg, 'utf8'), Buffer.from(tableRunB.svg, 'utf8')),
      0,
      `buildTableSVG(${tableRules}) must be byte-for-byte deterministic`,
    );
  }

  const chartStyle = defaultChartStyle('确定性图表配置核验');
  const optRunA = JSON.stringify(buildChartOption(crossSnap, 'grouped_bar', chartStyle, 'plum'));
  const optRunB = JSON.stringify(
    buildChartOption(structuredClone(crossSnap), 'grouped_bar', structuredClone(chartStyle), 'plum'),
  );
  assert.equal(
    Buffer.compare(Buffer.from(optRunA, 'utf8'), Buffer.from(optRunB, 'utf8')),
    0,
    'buildChartOption serialized spec must be byte-for-byte deterministic',
  );

  const canonicalizeZrenderTokens = svg => {
    const seen = new Map();
    return svg.replace(/zr\d+-(?:cls-|c)\d+/gu, token => {
      if (!seen.has(token)) {
        seen.set(token, `zr-canonical-${seen.size}`);
      }
      return seen.get(token);
    });
  };
  const ssrRunA = canonicalizeZrenderTokens(renderEChartsSSR(crossSnap, 'grouped_bar', chartStyle, 'plum').rawSvg);
  const ssrRunB = canonicalizeZrenderTokens(
    renderEChartsSSR(structuredClone(crossSnap), 'grouped_bar', structuredClone(chartStyle), 'plum').rawSvg,
  );
  assert.equal(
    Buffer.compare(Buffer.from(ssrRunA, 'utf8'), Buffer.from(ssrRunB, 'utf8')),
    0,
    'ECharts SSR SVG geometry and text must be byte-for-byte deterministic across instances',
  );

  for (const theme of CHART_THEMES) {
    const colorA = themeColor('堂食和送餐都用过', theme.id);
    const colorB = themeColor('堂食和送餐都用过', theme.id);
    assert.equal(colorA, colorB, `themeColor must be deterministic for theme ${theme.id}`);
  }
});

test('WCAG 2.1 contrast sanity holds for primary series colors and typography ink against light paper backgrounds', () => {
  assert.equal(wcagContrastRatio('#000000', '#FFFFFF'), 21);
  assert.equal(wcagContrastRatio('#FFFFFF', '#FFFFFF'), 1);

  const defaultStyle = defaultChartStyle('');
  assert.ok(
    relativeLuminance(defaultStyle.background) >= 0.95,
    `Default chart paper background ${defaultStyle.background} must be light paper`,
  );
  const defaultInkRatio = wcagContrastRatio(defaultStyle.ink, defaultStyle.background);
  assert.ok(
    defaultInkRatio >= 7.0,
    `Default chart ink ${defaultStyle.ink} on ${defaultStyle.background} must meet WCAG AAA (>= 7.0), got ${defaultInkRatio.toFixed(2)}`,
  );

  const coreThemeIds = ['blue', 'teal', 'forest', 'plum', 'slate'];
  for (const id of coreThemeIds) {
    const theme = CHART_THEMES.find(t => t.id === id);
    assert.ok(theme, `Core theme ${id} must exist in CHART_THEMES`);
    const primaryRatio = wcagContrastRatio(theme.colors[0], defaultStyle.background);
    const secondaryRatio = wcagContrastRatio(theme.colors[1], defaultStyle.background);
    assert.ok(
      primaryRatio >= 4.5,
      `Core theme "${id}" primary color ${theme.colors[0]} on ${defaultStyle.background} must be >= 4.5:1, got ${primaryRatio.toFixed(2)}`,
    );
    assert.ok(
      secondaryRatio >= 3.5,
      `Core theme "${id}" secondary color ${theme.colors[1]} on ${defaultStyle.background} must be >= 3.5:1, got ${secondaryRatio.toFixed(2)}`,
    );
  }

  for (const [id, pal] of Object.entries(STUDIO_PALETTES)) {
    assert.ok(
      relativeLuminance(pal.surface) >= 0.88,
      `STUDIO_PALETTES[${id}].surface (${pal.surface}) must be a high-luminance light paper background`,
    );
    const inkVsSurface = wcagContrastRatio(pal.ink, pal.surface);
    const primaryVsSurface = wcagContrastRatio(pal.primary, pal.surface);
    const primaryVsWhite = wcagContrastRatio(pal.primary, '#FFFFFF');
    assert.ok(
      inkVsSurface >= 12.0,
      `STUDIO_PALETTES[${id}].ink (${pal.ink}) vs surface (${pal.surface}) must be >= 12.0:1, got ${inkVsSurface.toFixed(2)}`,
    );
    assert.ok(
      primaryVsSurface >= 4.5,
      `STUDIO_PALETTES[${id}].primary (${pal.primary}) vs surface (${pal.surface}) must be >= 4.5:1, got ${primaryVsSurface.toFixed(2)}`,
    );
    assert.ok(
      primaryVsWhite >= 4.5,
      `STUDIO_PALETTES[${id}].primary (${pal.primary}) vs #FFFFFF paper must be >= 4.5:1, got ${primaryVsWhite.toFixed(2)}`,
    );
  }

  const siliconLightPaper = '#FFFDF8';
  const siliconPrimaryRatio = wcagContrastRatio(CATEGORICAL_LIGHT[0], siliconLightPaper);
  const siliconDeepOrdinalRatio = wcagContrastRatio(ORDINAL_LIGHT.at(-1), siliconLightPaper);
  assert.ok(
    siliconPrimaryRatio >= 3.0,
    `Silicon CATEGORICAL_LIGHT[0] (${CATEGORICAL_LIGHT[0]}) vs ${siliconLightPaper} must meet WCAG 1.4.11 (>= 3.0:1), got ${siliconPrimaryRatio.toFixed(2)}`,
  );
  assert.ok(
    siliconDeepOrdinalRatio >= 7.0,
    `Silicon deepest ORDINAL_LIGHT (${ORDINAL_LIGHT.at(-1)}) vs ${siliconLightPaper} must be >= 7.0:1, got ${siliconDeepOrdinalRatio.toFixed(2)}`,
  );

  for (let i = 1; i < ORDINAL_LIGHT.length; i += 1) {
    assert.ok(
      relativeLuminance(ORDINAL_LIGHT[i - 1]) > relativeLuminance(ORDINAL_LIGHT[i]),
      `ORDINAL_LIGHT must monotonically darken from index ${i - 1} to ${i}`,
    );
  }
  for (let i = 1; i < ORDINAL_DARK.length; i += 1) {
    assert.ok(
      relativeLuminance(ORDINAL_DARK[i - 1]) < relativeLuminance(ORDINAL_DARK[i]),
      `ORDINAL_DARK must monotonically brighten from index ${i - 1} to ${i}`,
    );
  }
});

test('validateChartStyle and parseReportFigure reject CSS/SVG color injection, control characters, and prototype pollution with clean Chinese errors', () => {
  const invalidStyles = [
    { ...defaultChartStyle('t'), background: 'javascript:alert(1)' },
    { ...defaultChartStyle('t'), ink: '#FFFFFF" onload="alert(1)' },
    { ...defaultChartStyle('t'), accent: 'url(javascript:alert(1))' },
    { ...defaultChartStyle('t'), title: '含控制字符\u0007标题' },
  ];

  for (const candidate of invalidStyles) {
    assert.throws(
      () => validateChartStyle(candidate),
      err => {
        assertCleanUserProse(err.message, 'validateChartStyle error');
        return true;
      },
    );
  }

  const validFigure = buildAllReportFiguresFixture()[0];
  const invalidFigures = [
    { ...validFigure, title: '含空字节\u0000标题' },
    { ...validFigure, kind: 'script_injection' },
    { ...validFigure, resultHash: 'not-a-sha256' },
  ];

  for (const badFig of invalidFigures) {
    assert.throws(
      () => parseReportFigure(badFig),
      err => {
        assertCleanUserProse(err.message, 'parseReportFigure error');
        return true;
      },
    );
  }
});

test('Chart studio dataset specs built from registered results bind valid STUDIO_PALETTES without brackets or tech jargon', () => {
  const mockCtx = {
    projectTitle: '城市社区助餐服务的使用体验与满意度调查',
    design: null,
    datasetName: 'community_meal.csv',
    light: { overall: 0.75, rooms: [] },
    results: {
      placed: [],
      results: [
        {
          id: 'res-studio-1',
          title: '社区助餐各维度满意度均值比较',
          method: '频数与均值汇总',
          n: 216,
          total: 230,
          classification: 'empirical',
          sourceName: 'community_meal.csv',
          sourceHash: SAMPLE_HASH,
          resultHash: SAMPLE_HASH,
          headers: ['评价维度', '满意度均值', '高分占比(%)'],
          rows: [
            ['菜品口味与营养', 4.32, 84.5],
            ['步行可达与环境', 4.11, 79.2],
            ['点餐与支付便利', 3.89, 71.8],
          ],
          metrics: [{ label: '样本有效率(%)', value: 93.9 }],
          receipt: { interpretation: '口味与可达性得分较高，支付环节仍有改进空间。' },
        },
      ],
    },
  };

  const studioData = buildChartStudioCardData(mockCtx);
  assert.equal(studioData.datasets.length, 1);
  const spec = studioData.datasets[0];
  assert.ok(Object.hasOwn(STUDIO_PALETTES, spec.defaultPalette));

  for (const field of [
    spec.title,
    spec.subtitle,
    spec.primaryLabel,
    spec.secondaryLabel ?? '',
    spec.sourceLabel,
    spec.annotation,
    ...spec.points.map(p => p.label),
  ]) {
    assertCleanUserProse(field, 'ChartStudioSpec field');
  }
});
