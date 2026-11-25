import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createEditorContent } from '../lib/editor-model.ts';
import { parseFigurePalette } from '../lib/figure-palette.ts';
import { applyReportInsert } from '../lib/report-insert.ts';
import { BLUEPRINT } from '../lib/report-blueprint.ts';
import { figureSVG, svgSize } from '../lib/report-figures.ts';
import { wordBlocks } from '../lib/quality-export.ts';
import { createLatexReport } from '../lib/latex-report.ts';
import { fromDrawioXml } from '../lib/diagram-figures.ts';
import { assertTrueVector } from '../lib/svg-safety.ts';
import { assertTrueVector as assertStrictOfficeVector } from '../lib/vector-svg.ts';
import {
  CHART_CATALOG,
  buildChartSampleInsert,
  renderChartPreviewSvg,
} from '../lib/resource-library/chart-catalog.ts';
import {
  TABLE_CATALOG,
  buildTableInsert,
  renderTablePreviewSvg,
} from '../lib/resource-library/table-catalog.ts';
import {
  DIAGRAM_CATALOG,
  buildDiagramInsert,
  renderDiagramPreviewSvg,
} from '../lib/resource-library/diagram-catalog.ts';
import {
  VISUAL_CATALOG,
  VISUAL_FILTER_LABELS,
  buildInfographicInsert,
  renderPaletteBoardSvg,
  renderVisualSpecSvg,
} from '../lib/resource-library/visual-catalog.ts';
import {
  LANDMARK_ARCHETYPES,
  COUNTY_EXACT_LANDMARKS,
} from '../lib/resource-library/landmark-illustrations.ts';
import {
  INSPECTOR_PALETTE_PRESETS,
  buildChartPythonCode,
  buildDiagramCode,
  buildTableLatexCode,
  buildVectorAssetLatexCode,
} from '../lib/resource-library/reproducible-code.ts';
import { buildSmartRecommendations } from '../lib/resource-library/smart-recommender.ts';
import {
  buildGazetteerInsert,
  buildGazetteerLandmarkInsert,
  buildGazetteerTopicPrompt,
  getAllCuratedProfiles,
  getCountiesForSelection,
  getCountyProfile,
  getGazetteerStatsSummary,
  getPrefecturesForProvince,
  getProvinceList,
  renderRegionVisualCardSvg,
  searchCountyGazetteer,
} from '../lib/resource-library/china-county-gazetteer.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(TEST_DIR, '../public');

test('Resource Library catalogs provide >=192 charts, >=94 Booktabs tables, >=96 diagrams, >=121 visuals (>=44 palettes & >=52 100% Bento infographics), and zero-truncation labeled SVGs', async () => {
  assert.ok(CHART_CATALOG.length >= 192, `Expected >=192 charts, got ${CHART_CATALOG.length}`);
  assert.ok(TABLE_CATALOG.length >= 94, `Expected >=94 tables, got ${TABLE_CATALOG.length}`);
  assert.ok(DIAGRAM_CATALOG.length >= 96, `Expected >=96 diagrams, got ${DIAGRAM_CATALOG.length}`);
  assert.ok(VISUAL_CATALOG.length >= 121, `Expected >=121 visuals, got ${VISUAL_CATALOG.length}`);
  const paletteBoards = VISUAL_CATALOG.filter(v => v.kind === 'palette_board');
  assert.ok(paletteBoards.length >= 44, `Expected >=44 palette_board items, got ${paletteBoards.length}`);
  const infos = VISUAL_CATALOG.filter(v => v.kind === 'infographic');
  assert.ok(infos.length >= 52, `Expected >=52 infographics, got ${infos.length}`);
  assert.ok(infos.every(v => Boolean(v.bentoArchetype)), '100% of infographic items must carry a pure-vector Bento archetype');
  assert.ok(VISUAL_FILTER_LABELS.length >= 6);

  for (const ch of CHART_CATALOG) {
    assert.ok(BLUEPRINT.some(b => b.id === ch.targetNode), `Unknown chart blueprint node ${ch.targetNode}`);
    const svg = assertStrictOfficeVector(assertTrueVector(renderChartPreviewSvg(ch, '#0F766E')));
    assert.match(svg, /viewBox="0 0 360 228"/);
    assert.match(svg, /<text\b/, `Expected labeled publication chart SVG for ${ch.id}`);
    assert.ok(!svg.includes('…'), `Unexpected ellipsis truncation in chart SVG ${ch.id}`);
  }
  for (const tb of TABLE_CATALOG) {
    assert.ok(BLUEPRINT.some(b => b.id === tb.targetNode), `Unknown table blueprint node ${tb.targetNode}`);
    const svg = assertStrictOfficeVector(assertTrueVector(renderTablePreviewSvg(tb, '#0F766E')));
    assert.match(svg, /viewBox="0 0 360 228"/);
    assert.match(svg, /<text\b/, `Expected labeled Booktabs SVG for ${tb.id}`);
    assert.ok(!svg.includes('…'), `Unexpected ellipsis truncation in table SVG ${tb.id}`);
  }
  for (const dg of DIAGRAM_CATALOG) {
    assert.ok(BLUEPRINT.some(b => b.id === dg.targetNode), `Unknown diagram blueprint node ${dg.targetNode}`);
    const svg = assertStrictOfficeVector(assertTrueVector(renderDiagramPreviewSvg(dg, '#234E80')));
    assert.match(svg, /viewBox="0 0 360 228"/);
    assert.match(svg, /<text\b/, `Expected labeled framework SVG for ${dg.id}`);
    assert.ok(!svg.includes('…'), `Unexpected ellipsis truncation in diagram SVG ${dg.id}`);
  }
  const samplePaletteInk = INSPECTOR_PALETTE_PRESETS.find(p => p.id === 'lancet_blue')?.palette ?? '#1D4E89';
  for (const vis of VISUAL_CATALOG) {
    const specSvg = assertStrictOfficeVector(assertTrueVector(renderVisualSpecSvg(vis, samplePaletteInk)));
    assert.match(specSvg, /viewBox="0 0 360 228"/);
    assert.ok(!specSvg.includes('88% 版心全透明') && !specSvg.includes('顶部负空间叠字区') && !specSvg.includes('图文一体标题口袋') && !specSvg.includes('Bento 栅格'), `Unexpected schematic placeholder inside ${vis.id}`);
    assert.ok(!specSvg.includes('…'), `Unexpected ellipsis truncation in visual SVG ${vis.id}`);
    if (vis.assetUrl) {
      const diskPath = path.join(PUBLIC_DIR, vis.assetUrl.replace(/^\/+/, ''));
      assert.ok(fs.existsSync(diskPath), `Missing public visual asset on disk: ${diskPath}`);
    }
    if (vis.kind === 'palette_board') {
      assert.ok(vis.palette, `Missing FigurePalette on ${vis.id}`);
      parseFigurePalette(vis.palette);
      const boardSvg = assertTrueVector(renderPaletteBoardSvg(vis));
      assert.match(boardSvg, /<text\b/);
    }
  }
  for (const info of infos) {
    const infoInsert = await buildInfographicInsert(info, '低空经济');
    assert.ok(infoInsert.items.length >= 3, `Expected Bento infographic insert items on ${info.id}`);
  }

  const base = createEditorContent();
  const cRes = applyReportInsert(base, await buildChartSampleInsert(CHART_CATALOG[0], '低空经济'));
  assert.ok((cRes.content.quality?.results.length ?? 0) >= 1);
  const causalChart = CHART_CATALOG.find(c => c.intent === 'causal_econometrics') ?? CHART_CATALOG[1];
  const cRes2 = applyReportInsert(cRes.content, await buildChartSampleInsert(causalChart, '低空经济'));
  assert.ok((cRes2.content.quality?.results.length ?? 0) >= 2);
  const tRes = applyReportInsert(cRes2.content, await buildTableInsert(TABLE_CATALOG[0], '低空经济'));
  assert.ok((tRes.content.quality?.results.length ?? 0) >= 3);
  const dRes = applyReportInsert(tRes.content, await buildDiagramInsert(DIAGRAM_CATALOG[0], '低空经济'));
  assert.ok((dRes.content.quality?.results.length ?? 0) >= 4);
});

test('China County Gazetteer covers 34 provinces, 333 cities, 2845 counties, >=104 landmark archetypes, unique Jinhua 9-county landmarks, and valid SVGs', () => {
  assert.ok(LANDMARK_ARCHETYPES.length >= 104, `Expected >=104 archetypes, got ${LANDMARK_ARCHETYPES.length}`);
  const usedArchetypes = new Set(Object.values(COUNTY_EXACT_LANDMARKS).map(item => item.kind));
  const unusedArchetypes = LANDMARK_ARCHETYPES.filter(kind => !usedArchetypes.has(kind));
  assert.equal(unusedArchetypes.length, 0, `All 104 archetypes must be referenced in COUNTY_EXACT_LANDMARKS, unused: ${unusedArchetypes.join(', ')}`);

  const stats = getGazetteerStatsSummary();
  assert.equal(stats.provinceCount, 34);
  assert.equal(stats.prefectureCount, 333);
  assert.equal(stats.countyCount, 2845);
  assert.equal(stats.officialPackCount, 20);

  const provinces = getProvinceList();
  assert.equal(provinces.length, 34);
  const allCurated = getAllCuratedProfiles();
  assert.ok(allCurated.length >= 940, `Expected >= 940 curated+pack profiles, got ${allCurated.length}`);
  for (const prof of allCurated) {
    const dimText = Object.values(prof.features).join(' ');
    assert.ok(!/[\d\p{Nd}]/u.test(dimText), `Qualitative five-dimension features must remain digit-free for ${prof.code} ${prof.name}`);
  }
  assert.ok(allCurated.some(p => p.code === '469005'), 'Curated profiles must include 469005 文昌市');
  assert.ok(allCurated.some(p => p.code === '513322'), 'Curated profiles must include 513322 泸定县');
  assert.ok(allCurated.some(p => p.code === '140225'), 'Curated profiles must include 140225 浑源县');
  assert.ok(allCurated.some(p => p.code === '330206'), 'Curated profiles must include 330206 北仑区');
  assert.ok(allCurated.some(p => p.code === '530802'), 'Curated profiles must include 530802 思茅区');
  assert.ok(allCurated.some(p => p.code === '540223'), 'Curated profiles must include 540223 定日县');
  assert.ok(allCurated.some(p => p.code === '150785'), 'Curated profiles must include 150785 根河市');
  assert.ok(allCurated.some(p => p.code === '520524'), 'Curated profiles must include 520524 织金县');
  assert.ok(allCurated.some(p => p.code === '513233'), 'Curated profiles must include 513233 红原县');
  assert.ok(allCurated.some(p => p.code === '340406'), 'Curated profiles must include 340406 潘集区');
  assert.ok(allCurated.some(p => p.code === '350623'), 'Curated profiles must include 350623 漳浦县');
  assert.ok(allCurated.some(p => p.code === '331181'), 'Curated profiles must include 331181 龙泉市');
  assert.ok(allCurated.some(p => p.code === '620922'), 'Curated profiles must include 620922 瓜州县');
  assert.ok(searchCountyGazetteer('659001').some(p => p.code === '659001'), 'Adcode 659001 search must match 石河子市');
  assert.ok(
    searchCountyGazetteer('419001', { dimension: 'economyIndustry' }).some(p => p.code === '419001'),
    'Dimension-filtered adcode 419001 search must match 济源市',
  );

  for (const prov of provinces) {
    const provCurated = allCurated.filter(c => c.provinceCode === prov.code);
    assert.ok(
      provCurated.length >= 2,
      `Province ${prov.code} ${prov.name} expected >= 2 curated units, got ${provCurated.length}`,
    );
    const prefs = getPrefecturesForProvince(prov.code);
    assert.ok(prefs.length >= 1, `Expected cascade prefectures/direct entries for ${prov.name}`);
    const firstChildren = getCountiesForSelection(prov.code, prefs[0].code);
    assert.ok(firstChildren.length >= 1, `Expected selectable children under ${prov.name}`);
    for (const sampleCounty of firstChildren.slice(0, 3)) {
      assert.ok(sampleCounty.landmarkName.length >= 2, `Missing landmarkName on ${sampleCounty.code}`);
      assertTrueVector(renderRegionVisualCardSvg(sampleCounty));
    }
  }

  // Verify Jinhua's 9 counties/districts all possess distinct architectural landmarks & SVGs
  const jinhua = getCountiesForSelection('330000', '330700');
  assert.equal(jinhua.length, 9, `Expected 9 counties under Jinhua, got ${jinhua.length}`);
  const jhLandmarks = new Set(jinhua.map(c => c.landmarkName));
  const jhKinds = new Set(jinhua.map(c => c.landmarkKind));
  const jhSvgs = new Set(jinhua.map(c => renderRegionVisualCardSvg(c, '#0F766E')));
  assert.equal(jhLandmarks.size, 9, 'All 9 Jinhua counties must have unique landmark names');
  assert.equal(jhKinds.size, 9, 'All 9 Jinhua counties must use distinct landmark architectural archetypes');
  assert.equal(jhSvgs.size, 9, 'All 9 Jinhua counties must render distinct landmark SVGs');
  for (const jc of jinhua) {
    const svg = assertTrueVector(renderRegionVisualCardSvg(jc, '#0F766E'));
    assert.match(svg, /<text\b/);
  }

  // Test curated, official-pack, SAR/Taiwan, and arbitrary non-curated counties
  const probeCodes = ['110108', '330702', '330782', '445103', '532901', '421222', '710000-taipei', '810000-central', '820000-peninsula', '130102', '610103'];
  for (const code of probeCodes) {
    const prof = getCountyProfile(code);
    assert.ok(prof, `Missing county profile for ${code}`);
    assert.ok(prof.landmarkName.length >= 2, `Missing landmarkName for ${code}`);
    assert.ok(prof.features.politicsGovernance.length > 8);
    assert.ok(prof.features.economyIndustry.length > 8);
    assert.ok(prof.features.cultureHeritage.length > 8);
    assert.ok(prof.features.societyLivelihood.length > 8);
    assert.ok(prof.features.customsLifestyle.length > 8);
    assert.ok(prof.surveyHooks.length >= 1);
    const svg = assertTrueVector(renderRegionVisualCardSvg(prof));
    assert.match(svg, /<svg\b/);
    assert.match(svg, /<text\b/);
  }

  const yiwuHits = searchCountyGazetteer('义乌');
  assert.ok(yiwuHits.some(h => h.code === '330782'));
  const bayongHits = searchCountyGazetteer('八咏楼');
  assert.ok(bayongHits.some(h => h.code === '330702'));
  const teaHits = searchCountyGazetteer('单丛茶');
  assert.ok(teaHits.some(h => h.code === '445103'));

  const yiwu = getCountyProfile('330782');
  assert.ok(yiwu);
  const gIns = buildGazetteerInsert(yiwu);
  const gApplied = applyReportInsert(createEditorContent(), gIns);
  assert.ok(gApplied.blocks.some(b => b.kind === 'paragraph' && b.text.includes('义乌')));
  assert.ok(buildGazetteerTopicPrompt(yiwu).includes('义乌'));
});

test('Reproducible code engine and all 2845 exact 6-digit county landmarks (100% coverage) pass integrity checks', () => {
  assert.ok(INSPECTOR_PALETTE_PRESETS.length >= 6);
  for (const preset of INSPECTOR_PALETTE_PRESETS) {
    if (preset.palette) parseFigurePalette(preset.palette);
  }

  const lancetPalette = INSPECTOR_PALETTE_PRESETS.find(p => p.id === 'lancet_blue')?.palette;
  assert.ok(lancetPalette);
  for (const ch of CHART_CATALOG) {
    const py = buildChartPythonCode(ch, lancetPalette);
    assert.match(py, /import matplotlib/, `Missing matplotlib import for ${ch.id}`);
    assert.ok(py.includes(lancetPalette.primary), `Missing palette hex for ${ch.id}`);
  }
  for (const tb of TABLE_CATALOG) {
    const tex = buildTableLatexCode(tb);
    assert.match(tex, /\\toprule/, `Missing \\toprule for ${tb.id}`);
    assert.match(tex, /\\midrule/, `Missing \\midrule for ${tb.id}`);
    assert.match(tex, /\\bottomrule/, `Missing \\bottomrule for ${tb.id}`);
  }
  for (const dg of DIAGRAM_CATALOG) {
    const { tikz, mermaid } = buildDiagramCode(dg);
    assert.match(tikz, /\\begin\{tikzpicture\}/, `Missing tikzpicture for ${dg.id}`);
    assert.match(mermaid, /flowchart\s+(LR|TD)/, `Missing Mermaid flowchart header for ${dg.id}`);
  }
  const vecTex = buildVectorAssetLatexCode({
    assetId: '522727-平塘县-FAST',
    title: '平塘天眼 FAST 地标插画',
    caption: '贵州省平塘县喀斯特天文科研锚点',
  });
  assert.match(vecTex, /\\usepackage\{svg\}/);
  assert.match(vecTex, /\\includesvg\[width=14\.5cm\]/);

  const exactCountyKeys = Object.keys(COUNTY_EXACT_LANDMARKS).filter(k => /^\d{6}$/.test(k));
  assert.equal(exactCountyKeys.length, 2845, `Expected 100% (2845) 6-digit county landmarks, got ${exactCountyKeys.length}`);
  for (const code of exactCountyKeys) {
    const prof = getCountyProfile(code);
    assert.ok(prof, `Missing county profile for exact code ${code}`);
    assertStrictOfficeVector(renderRegionVisualCardSvg(prof, lancetPalette));
  }
  const famousSpotChecks = [
    '320581', '320282', '513337', '522634', '230883', '540424', '653131', '522727', '441403', '140727',
    '360203', '510302', '532528', '410185', '360781', '652702', '420506', '500111',
    '130128', '231223', '411424', '511526', '659012',
    '469005', '513322', '130730', '330421', '330523', '532822', '450503', '150621',
    '370683', '140225', '220621', '330206', '540223', '360281', '440117', '530802',
    '450321', '370783', '150781', '350524', '350128', '440224', '150785', '410581',
    '330481', '350623', '520524', '340406', '500236', '331181', '513233', '620922',
  ];
  for (const code of famousSpotChecks) {
    const prof = getCountyProfile(code);
    assert.ok(prof, `Expected famous county ${code}`);
    assert.ok(prof.landmarkName.length >= 2);
    const svg = assertTrueVector(renderRegionVisualCardSvg(prof, lancetPalette));
    assert.match(svg, /<text\b/);
  }
});

test('Smart recommender ranks charts, tables, diagrams, and geography landmarks from snapshots & title', () => {
  const sample = createEditorContent();
  sample.title = '义乌市跨境直播电商商户数字化转型与满意度调研';
  sample.subtitle = '基于二元 Logistic 与非参稳健检验的县域实证分析';
  sample.quality = {
    version: 1,
    results: [
      {
        id: 'snap_1',
        title: '消费支出差异非参检验',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: 'a'.repeat(64),
        resultHash: 'b'.repeat(64),
        classification: 'simulated',
        method: 'groups',
        n: 200,
        total: 200,
        headers: ['组别', '中位数'],
        rows: [['甲', 120]],
        metrics: [{ label: 'Mann-Whitney U', value: 420 }],
        warnings: ['NONPARAMETRIC_AUTO_FALLBACK:SKEWED_OUTCOME'],
      },
      {
        id: 'snap_2',
        title: '转型采纳二元 Logistic',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: 'a'.repeat(64),
        resultHash: 'c'.repeat(64),
        classification: 'simulated',
        method: 'logit',
        n: 200,
        total: 200,
        headers: ['变量', 'OR'],
        rows: [['感知收益', 2.41]],
        metrics: [{ label: 'LR χ²', value: 24.5 }],
        warnings: [],
      },
    ],
    findings: [],
  };

  const recs = buildSmartRecommendations(sample);
  assert.equal(recs.charts.length, 8);
  assert.equal(recs.tables.length, 4);
  assert.equal(recs.diagrams.length, 4);
  assert.equal(recs.infographics.length, 2);
  assert.ok(recs.infographics.every(v => Boolean(v.item.bentoArchetype)));
  assert.equal(recs.palettes.length, 2);
  assert.ok(recs.palettes.every(p => p.item.kind === 'palette_board'));
  assert.ok(recs.palettes.some(p => p.item.id === 'palette-aer-qje-econometrics' || p.item.id === 'palette-finance-wallstreet-graphite'));
  assert.ok(recs.charts.some(r => r.item.id === 'chart-raincloud' || r.item.id === 'chart-forest-or'));
  assert.ok(recs.tables.some(r => r.item.id === 'tbl-nonparam-rank'));
  assert.ok(recs.tables.some(r => r.item.id === 'tbl-logit-or'));
  assert.ok(recs.counties.some(c => c.item.code === '330782' && c.item.landmarkName.includes('国际商贸城')));

  const esgCase = createEditorContent();
  esgCase.title = '双碳能源转型与公立医院低碳就医体验跨层实证';
  esgCase.subtitle = '基于跨层线性模型 (HLM) 与合成双重差分 (SDID) 分析';
  esgCase.quality = {
    version: 1,
    results: [
      {
        id: 'snap_hlm',
        title: '医院—患者跨层随机斜率估计',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: 'd'.repeat(64),
        resultHash: 'e'.repeat(64),
        classification: 'simulated',
        method: 'hlm',
        n: 420,
        total: 420,
        headers: ['参数', '估计值'],
        rows: [['组内斜率', 0.42]],
        metrics: [{ label: 'ICC', value: 0.18 }],
        warnings: [],
      },
      {
        id: 'snap_sdid',
        title: '合成双重差分试点评估',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: 'f'.repeat(64),
        resultHash: 'g'.repeat(64),
        classification: 'simulated',
        method: 'sdid',
        n: 420,
        total: 420,
        headers: ['指标', 'ATT'],
        rows: [['政策净效应', 0.19]],
        metrics: [{ label: 'ATT', value: 0.19 }],
        warnings: [],
      },
    ],
    findings: [],
  };
  const esgRecs = buildSmartRecommendations(esgCase);
  assert.equal(esgRecs.infographics.length, 2);
  assert.ok(esgRecs.infographics.some(i => i.item.id === 'info-bento-county-medical' || i.item.id === 'info-bento-synbio-pilot'));
  assert.equal(esgRecs.palettes.length, 2);
  assert.ok(esgRecs.palettes.some(p => p.item.id === 'palette-esg-carbon-energy' || p.item.id === 'palette-lancet-nejm-clinical'));
  assert.ok(esgRecs.charts.some(c => c.item.id === 'chart-hlm-random-slopes'));
  assert.ok(esgRecs.charts.some(c => c.item.id === 'chart-sdid-weights' || c.item.id === 'chart-dag-backdoor'));
  assert.ok(esgRecs.tables.some(t => t.item.id === 'tbl-hlm-multilevel'));
  assert.ok(esgRecs.tables.some(t => t.item.id === 'tbl-sdid-weights'));
  assert.ok(esgRecs.diagrams.some(d => d.item.id === 'diag-hlm-nested-mech'));

  const cmbCase = createEditorContent();
  cmbCase.title = '社区居民数字素养量表预调研与双变量相关稳健检验';
  cmbCase.quality = {
    version: 1,
    results: [
      {
        id: 'snap_cmb',
        title: 'Harman 单因子与游程随机性诊断',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: 'h'.repeat(64),
        resultHash: 'i'.repeat(64),
        classification: 'simulated',
        method: 'quality-control',
        n: 360,
        total: 360,
        headers: ['诊断项', '指标'],
        rows: [['第一主成分方差%', 43.2]],
        metrics: [{ label: 'Harman %', value: 43.2 }],
        warnings: ['COMMON_METHOD_BIAS_RISK_GE_40PCT'],
      },
      {
        id: 'snap_spearman',
        title: '核心潜变量 Spearman 相关矩阵',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: 'j'.repeat(64),
        resultHash: 'k'.repeat(64),
        classification: 'simulated',
        method: 'spearman',
        n: 360,
        total: 360,
        headers: ['变量对', 'ρ'],
        rows: [['v1~v2', 0.84]],
        metrics: [{ label: 'max |ρ|', value: 0.84 }],
        warnings: ['HIGH_PAIRWISE_CORRELATION:v1~v2'],
      },
    ],
    findings: [],
  };
  const cmbRecs = buildSmartRecommendations(cmbCase);
  assert.ok(cmbRecs.charts.some(c => c.item.id === 'chart-efa-scree'));
  assert.ok(cmbRecs.charts.some(c => c.item.id === 'chart-corr-heatmap'));
  assert.ok(cmbRecs.tables.some(t => t.item.id === 'tbl-efa-loadings'));
  assert.ok(cmbRecs.tables.some(t => t.item.id === 'tbl-corr-collinearity'));

  const r28Case = createEditorContent();
  r28Case.title = '银发金融反诈防线交错政策试点效应与靶向干预实验';
  r28Case.subtitle = '基于 Callaway-SantAnna 多期 DID 与 Split Conformal 因果森林分析';
  r28Case.quality = {
    version: 1,
    results: [
      {
        id: 'snap_cs_did',
        title: 'Callaway-SantAnna 动态 ATT',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: 'k'.repeat(64),
        resultHash: 'l'.repeat(64),
        classification: 'simulated',
        method: 'cs-did',
        n: 640,
        total: 640,
        headers: ['Cohort', 'ATT'],
        rows: [['G2024', 0.24]],
        metrics: [{ label: 'ATT', value: 0.24 }],
        warnings: [],
      },
      {
        id: 'snap_uplift',
        title: '因果森林靶向反诈增益',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: 'm'.repeat(64),
        resultHash: 'n'.repeat(64),
        classification: 'simulated',
        method: 'uplift',
        n: 640,
        total: 640,
        headers: ['十分位', 'CATE'],
        rows: [['Top10%', 0.31]],
        metrics: [{ label: 'Qini AUUC', value: 0.18 }],
        warnings: [],
      },
    ],
    findings: [],
  };
  const r28Recs = buildSmartRecommendations(r28Case);
  assert.ok(r28Recs.infographics.some(v => v.item.id === 'info-bento-silver-antifraud'));
  assert.ok(r28Recs.charts.some(c => c.item.id === 'chart-cs-group-time-att'));
  assert.ok(r28Recs.charts.some(c => c.item.id === 'chart-uplift-qini-curve' || c.item.id === 'chart-conformal-interval-band'));
  assert.ok(r28Recs.tables.some(t => t.item.id === 'tbl-cs-staggered-did'));
  assert.ok(r28Recs.tables.some(t => t.item.id === 'tbl-uplift-cate-deciles'));
  assert.ok(r28Recs.diagrams.some(d => d.item.id === 'diag-staggered-did-cs' || d.item.id === 'diag-causal-forest-uplift'));

  const r33Case = createEditorContent();
  r33Case.title = '城市青年夜校与车网互动 V2G 虚拟电厂调峰空间分异研究';
  r33Case.subtitle = '基于贝叶斯 MCMC 层次模型与 BERTopic/GraphRAG 语料聚类分析';
  r33Case.quality = {
    version: 1,
    results: [
      {
        id: 'snap_bayes',
        title: '贝叶斯分层 MCMC 收敛',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: 'p'.repeat(64),
        resultHash: 'q'.repeat(64),
        classification: 'simulated',
        method: 'bayesian',
        n: 520,
        total: 520,
        headers: ['参数', 'CrI'],
        rows: [['τ_intercept', 0.41]],
        metrics: [{ label: 'Rhat', value: 1.002 }],
        warnings: [],
      },
      {
        id: 'snap_bertopic',
        title: 'BERTopic 与 RAGAS 语义主题',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: 'r'.repeat(64),
        resultHash: 's'.repeat(64),
        classification: 'simulated',
        method: 'bertopic',
        n: 520,
        total: 520,
        headers: ['主题', 'C_v'],
        rows: [['T0 错峰充电激励', 0.72]],
        metrics: [{ label: 'C_v', value: 0.72 }],
        warnings: [],
      },
    ],
    findings: [],
  };
  const r33Recs = buildSmartRecommendations(r33Case);
  assert.ok(r33Recs.charts.some(c => c.item.id === 'chart-mcmc-trace-rhat'));
  assert.ok(r33Recs.charts.some(c => c.item.id === 'chart-bertopic-intertopic' || c.item.id === 'chart-rag-latency-pareto'));
  assert.ok(r33Recs.tables.some(t => t.item.id === 'tbl-bayesian-mcmc-rhat'));
  assert.ok(r33Recs.tables.some(t => t.item.id === 'tbl-bertopic-ctfidf-coherence' || t.item.id === 'tbl-ragas-eval-ablation'));
  assert.ok(r33Recs.diagrams.some(d => d.item.id === 'diag-bayesian-hierarchical-workflow'));
  assert.ok(r33Recs.diagrams.some(d => d.item.id === 'diag-graphrag-community-pipeline'));

  const semiCase = createEditorContent();
  semiCase.title = '高新园区半导体光刻与国产 EDA 软件产线适配调查';
  const semiRecs = buildSmartRecommendations(semiCase);
  assert.ok(semiRecs.palettes.some(p => p.item.id === 'palette-semiconductor-eda-silicon'));

  const disasterCase = createEditorContent();
  disasterCase.title = '极端天气下韧性城市应急管理与防灾减灾避险圈评估';
  const disasterRecs = buildSmartRecommendations(disasterCase);
  assert.ok(disasterRecs.palettes.some(p => p.item.id === 'palette-disaster-resilience-command'));

  const r38Case = createEditorContent();
  r38Case.title = '多期政策断点与需求属性优先级实证研究';
  r38Case.quality = {
    version: 1,
    results: [
      {
        id: 'snap_r38_rdd',
        title: '政策门槛 Sharp RDD 识别',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: 'a'.repeat(64),
        resultHash: 'b'.repeat(64),
        classification: 'simulated',
        method: 'rdd',
        n: 300,
        total: 300,
        headers: ['带宽', 'τ'],
        rows: [['1.0h', 1.8]],
        metrics: [{ label: 'τ', value: 1.8 }],
        warnings: [],
      },
      {
        id: 'snap_r38_kano',
        title: 'Kano Better-Worse 分流',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: 'c'.repeat(64),
        resultHash: 'd'.repeat(64),
        classification: 'simulated',
        method: 'kano',
        n: 300,
        total: 300,
        headers: ['特性', 'Better'],
        rows: [['导诊', 0.85]],
        metrics: [{ label: 'Better', value: 0.85 }],
        warnings: [],
      },
      {
        id: 'snap_r38_conf',
        title: 'Split Conformal 不确定性',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: 'e'.repeat(64),
        resultHash: 'f'.repeat(64),
        classification: 'simulated',
        method: 'conformal',
        n: 300,
        total: 300,
        headers: ['维度', '值'],
        rows: [['覆盖', 0.91]],
        metrics: [{ label: 'q̂', value: 0.5 }],
        warnings: [],
      },
    ],
    findings: [],
  };
  const r38Recs = buildSmartRecommendations(r38Case);
  assert.ok(r38Recs.charts.some(c => c.item.id === 'chart-rdd-local-poly' || c.item.id === 'chart-kano-better-worse-scatter'));
  assert.ok(r38Recs.charts.some(c => c.item.id === 'chart-conformal-interval-fan'));
  assert.ok(r38Recs.tables.some(t => t.item.id === 'tbl-rdd-bandwidth-sensitivity' || t.item.id === 'tbl-kano-better-worse-matrix'));
  assert.ok(r38Recs.tables.some(t => t.item.id === 'tbl-conformal-coverage-band'));
  assert.ok(r38Recs.diagrams.some(d => d.item.id === 'diag-rdd-manipulation-workflow' || d.item.id === 'diag-kano-ipa-priority-matrix'));

  const r41CausalCase = createEditorContent();
  r41CausalCase.title = '欧盟 CBAM 碳关税冲击下的跨境集装箱航运与企业绿色转型实证';
  r41CausalCase.subtitle = '基于倾向得分匹配 (PSM)、熵权 TOPSIS 与 CBAM 关税情境模拟';
  r41CausalCase.quality = {
    version: 1,
    results: [
      {
        id: 'snap_r41_psm',
        title: '绿色出口认证企业倾向得分匹配平衡检验',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: '1'.repeat(64),
        resultHash: '2'.repeat(64),
        classification: 'simulated',
        method: 'psm',
        n: 360,
        total: 360,
        headers: ['协变量', 'SMD'],
        rows: [['企业规模', 0.04]],
        metrics: [{ label: 'ATT', value: 0.24 }],
        warnings: [],
      },
      {
        id: 'snap_r41_topsis',
        title: '出口港口绿电转型熵权 TOPSIS 综合排序',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: '3'.repeat(64),
        resultHash: '4'.repeat(64),
        classification: 'simulated',
        method: 'topsis',
        n: 360,
        total: 360,
        headers: ['评价对象', 'C_i'],
        rows: [['穿山港区', 0.81]],
        metrics: [{ label: 'C_i', value: 0.81 }],
        warnings: [],
      },
      {
        id: 'snap_r41_cbam',
        title: 'CBAM 隐含碳税成本模拟',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: '5'.repeat(64),
        resultHash: '6'.repeat(64),
        classification: 'simulated',
        method: 'cbam',
        n: 360,
        total: 360,
        headers: ['情景', '税额'],
        rows: [['高碳情景', 84.2]],
        metrics: [{ label: '成本弹性', value: -0.17 }],
        warnings: [],
      },
    ],
    findings: [],
  };
  const r41Recs = buildSmartRecommendations(r41CausalCase);
  assert.ok(r41Recs.charts.some(c => c.item.id === 'chart-psm-love-smd-panel'));
  assert.ok(r41Recs.charts.some(c => c.item.id === 'chart-topsis-closeness-rank'));
  assert.ok(r41Recs.tables.some(t => t.item.id === 'tbl-psm-covariate-smd'));
  assert.ok(r41Recs.tables.some(t => t.item.id === 'tbl-entropy-topsis-weights'));
  assert.ok(r41Recs.tables.some(t => t.item.id === 'tbl-carbon-cbam-tariff-sim'));
  assert.ok(r41Recs.diagrams.some(d => d.item.id === 'diag-psm-caliper-balance'));
  assert.ok(r41Recs.diagrams.some(d => d.item.id === 'diag-entropy-topsis-pipeline'));
  assert.ok(r41Recs.diagrams.some(d => d.item.id === 'diag-cbam-carbon-border'));
  assert.ok(r41Recs.infographics.some(i => i.item.id === 'info-bento-cbam-export'));
  assert.ok(r41Recs.palettes.some(p => p.item.id === 'palette-logistics-maritime-navy'));

  const r41NeuroCase = createEditorContent();
  r41NeuroCase.title = '脑科学 fMRI 神经影像辅诊与自动驾驶 Robotaxi 乘客信任调查';
  const r41NeuroRecs = buildSmartRecommendations(r41NeuroCase);
  assert.ok(r41NeuroRecs.palettes.some(p => p.item.id === 'palette-biomed-neuroscience-cobalt'));
  assert.ok(r41NeuroRecs.infographics.some(i => i.item.id === 'info-bento-robotaxi-trust'));

  const r44ScmCase = createEditorContent();
  r44ScmCase.title = '数字人民币 mBridge 跨境清算港口走廊与绿氢加注多尺度地理空间实证';
  r44ScmCase.subtitle = '基于合成控制法 (SCM)、空间 GWR 与马尔可夫状态迁移模型';
  r44ScmCase.quality = {
    version: 1,
    results: [
      {
        id: 'snap_r44_scm',
        title: '港口绿氢试点合成控制法反事实估计',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: '7'.repeat(64),
        resultHash: '8'.repeat(64),
        classification: 'simulated',
        method: 'scm',
        n: 280,
        total: 280,
        headers: ['供体单元', '权重'],
        rows: [['对照港A', 0.48]],
        metrics: [{ label: 'RMSPE', value: 0.032 }],
        warnings: [],
      },
      {
        id: 'snap_r44_gwr',
        title: '多尺度 GWR 局域非平稳拟合',
        sourceName: 'survey',
        sourceUrl: '',
        sourceHash: '9'.repeat(64),
        resultHash: '0'.repeat(64),
        classification: 'simulated',
        method: 'gwr',
        n: 280,
        total: 280,
        headers: ['模型', 'AICc'],
        rows: [['MGWR', 412.5]],
        metrics: [{ label: 'Adj-R2', value: 0.78 }],
        warnings: [],
      },
    ],
    findings: [],
  };
  const r44Recs = buildSmartRecommendations(r44ScmCase);
  assert.ok(r44Recs.charts.some(c => c.item.id === 'chart-counterfactual-synthetic-ctrl'));
  assert.ok(r44Recs.charts.some(c => c.item.id === 'chart-spatial-gwr-coef-surface'));
  assert.ok(r44Recs.tables.some(t => t.item.id === 'tbl-synthetic-control-weights'));
  assert.ok(r44Recs.tables.some(t => t.item.id === 'tbl-spatial-gwr-diagnostics'));
  assert.ok(r44Recs.diagrams.some(d => d.item.id === 'diag-synthetic-control-donor'));
  assert.ok(r44Recs.diagrams.some(d => d.item.id === 'diag-gwr-spatial-nonstationarity'));
  assert.ok(r44Recs.infographics.some(i => i.item.id === 'info-bento-green-hydrogen-port' || i.item.id === 'info-bento-ecny-crossborder'));

  const r44GeoCase = createEditorContent();
  r44GeoCase.title = '稀土矿产勘查地质岩层调查与市域快轨 TOD 站城一体开发研究';
  const r44GeoRecs = buildSmartRecommendations(r44GeoCase);
  assert.ok(r44GeoRecs.palettes.some(p => p.item.id === 'palette-geology-mineral-terracotta'));
  assert.ok(r44GeoRecs.infographics.some(i => i.item.id === 'info-bento-smart-rail-tod'));
});

test('Resource Library chart, diagram, and landmark inserts preserve full vector parity across report, Word, and LaTeX', async () => {
  let content = createEditorContent();
  const shapChart = CHART_CATALOG.find(c => c.id === 'chart-shap-beeswarm');
  assert.ok(shapChart);
  const cInsert = await buildChartSampleInsert(shapChart, '电商信用评估');
  assert.ok(!cInsert.items.some(i => i.kind === 'figure' && i.caption.includes('[[图:@0]]')), 'Chart caption must not leak raw placeholder');
  content = applyReportInsert(content, cInsert).content;

  const ragDiagram = DIAGRAM_CATALOG.find(d => d.id === 'diag-agentic-rag-arch');
  assert.ok(ragDiagram);
  content = applyReportInsert(content, await buildDiagramInsert(ragDiagram, '电商信用评估')).content;

  const yiwu = getCountyProfile('330782');
  assert.ok(yiwu);
  content = applyReportInsert(content, await buildGazetteerLandmarkInsert(yiwu)).content;

  const bento = VISUAL_CATALOG.find(v => v.id === 'info-bento-low-altitude');
  assert.ok(bento);
  content = applyReportInsert(content, await buildInfographicInsert(bento, '低空经济配送')).content;

  const snaps = content.quality?.results ?? [];
  assert.equal(snaps.length, 4);
  for (const snap of snaps) {
    const svg = await figureSVG(snap, 1, '#1D4E89');
    assertTrueVector(svg);
    assert.equal(svgSize(svg).width, 960, `Expected report print width 960 on ${snap.id}`);
  }

  const dummyPng = async () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  for (const sec of content.report) {
    if (sec.blocks?.length) {
      const blocks = await wordBlocks(sec.blocks, content, dummyPng);
      assert.ok(blocks.length >= 1, `Expected Word output blocks for section ${sec.id}`);
    }
  }
  const tex = await createLatexReport(content);
  assert.match(tex.body, /\\ResearchImage\{0\}/);
  assert.match(tex.body, /\\ResearchImage\{3\}/);

  const customSecId = content.report.find(s => s.id !== cInsert.node)?.id ?? content.report[0].id;
  const customApplied = applyReportInsert(createEditorContent(), cInsert, customSecId);
  assert.equal(customApplied.sectionId, customSecId);
  const targetSec = customApplied.content.report.find(s => s.id === customSecId);
  assert.ok(targetSec && targetSec.blocks.length > 0, `Expected blocks routed into custom target section ${customSecId}`);
});

test('All 96 DIAGRAM_CATALOG frameworks export valid .drawio XML and round-trip identically via fromDrawioXml', () => {
  assert.ok(DIAGRAM_CATALOG.length >= 96);
  for (const diag of DIAGRAM_CATALOG) {
    const code = buildDiagramCode(diag);
    assert.ok(code.drawio.includes('<mxfile'), `Missing <mxfile> in Draw.io XML for ${diag.id}`);
    assert.ok(code.drawio.includes('<mxGraphModel'), `Missing <mxGraphModel> in Draw.io XML for ${diag.id}`);
    const parsed = fromDrawioXml(code.drawio);
    assert.equal(parsed.nodes.length, diag.nodes.length, `Node count mismatch after .drawio round-trip on ${diag.id}`);
    assert.equal(parsed.edges.length, diag.edges.length, `Edge count mismatch after .drawio round-trip on ${diag.id}`);
  }
});

test('Autonomous backend snapshots route accurately to blueprint chapters and render reading prose via placeResult', async () => {
  const { placeResult, suggestedExhibits, suggestedNode } = await import('../lib/report-placement.ts');
  const { methodIntro } = await import('../lib/report-templates.ts');
  const { digestText, parseResultSnapshot, resultPayload } = await import('../lib/research-quality.ts');

  const mkSnap = async (id, method, title, headers, rows, metrics, warnings = []) => {
    const base = {
      id,
      title,
      sourceName: 'autonomous-sandbox',
      sourceUrl: '',
      sourceHash: 'a'.repeat(64),
      classification: 'simulated',
      method,
      n: 420,
      total: 420,
      headers,
      rows,
      metrics,
      warnings,
    };
    const resultHash = await digestText(JSON.stringify(resultPayload(base)));
    return parseResultSnapshot({ ...base, resultHash });
  };

  const csDid = await mkSnap('snap_r32_did', 'cs-did', '交错试点动态ATT', ['组别 / 事件期', '净对照样本 n', 'ATT(g,t)', 'SE', 'p 值'], [['G=2024 | t=2025', 220, 0.312, 0.081, 0.001]], [{ label: 'CS 聚合 ATT', value: 0.312 }], ['TWFE_NEGATIVE_WEIGHT_DISTORTION']);
  const conformal = await mkSnap('snap_r32_conf', 'conformal', 'Split Conformal 校准带宽', ['校准评估维度', '数值结果', '统计学解释'], [['实测校准集覆盖率', '91.2%', '通过']], [{ label: 'Conformal 半宽 q̂', value: 0.642 }, { label: '实测校准覆盖率', value: 0.912 }], ['CONFORMAL_WIDE_INTERVAL_HIGH_UNCERTAINTY']);
  const efa = await mkSnap('snap_r32_efa', 'efa', 'KMO 与因子适宜性', ['检验项', '统计量'], [['KMO', 0.86]], [{ label: 'KMO 抽样适切性', value: 0.86 }]);
  const med = await mkSnap('snap_r32_med', 'mediation', 'Bootstrap 中介传导', ['效应路径', '估计值'], [['间接效应 a×b', 0.14]], [{ label: '间接效应', value: 0.14 }]);
  const corrMat = await mkSnap('snap_r32_corr', 'spearman', 'Spearman 配对矩阵', ['配对变量', 'Spearman ρ', 't 统计量', 'p 值', '相关强度判定'], [['x1 × x2', 0.84, 9.2, 0.0001, '极强相关'], ['x1 × x3', 0.42, 4.1, 0.001, '中高相关']], [{ label: '最大 |Spearman ρ|', value: 0.84 }, { label: '高相关变量对(|r|≥0.80)', value: 1 }]);
  const corrSingle = await mkSnap('snap_r32_single', 'spearman', '单一相关检验', ['指标', '数值'], [['Spearman ρ', 0.51]], [{ label: 'Spearman ρ', value: 0.51 }, { label: 'p 值（双侧）', value: 0.001 }], []);
  const kanoSnap = await mkSnap('snap_r36_kano', 'kano', 'Kano 需求属性与 Better-Worse 象限', ['需求特性', '有效样本', '主导属性', 'Better系数', 'Worse系数', '反向+可疑(%)'], [['AI智能导诊', 25, '魅力属性 (A)', 1.0, -0.24, 0.0], ['病房洁净安全', 25, '必备属性 (M)', 0.16, -1.0, 0.0]], [{ label: '均值 Better 系数', value: 0.58 }, { label: '均值 |Worse| 系数', value: 0.62 }], ['KANO_HIGH_REVERSE_OR_QUESTIONABLE']);
  const rddSnap = await mkSnap('snap_r36_rdd', 'rdd', 'Sharp RDD 三角核断点跳跃估计', ['带宽规格', '有效样本(左/右)', '断点跳跃 τ', '稳健 SE', '95% CI', 'p 值'], [['1.0×主带宽(基准)', '22 / 22', 1.985, 0.142, '[1.707, 2.263]', 0.0001]], [{ label: '断点局部效应 τ', value: 1.985 }, { label: '双侧 p 值', value: 0.0001 }, { label: '密度连续性 z', value: 0.15 }], []);
  const psmSnap = await mkSnap('snap_r40_psm', 'psm', '倾向得分匹配 PSM 平衡检验', ['协变量', '匹配前 |SMD|', '匹配后 |SMD|', '偏差降幅(%)', '平衡判定'], [['家庭收入阶梯', 0.85, 0.04, 95.3, '达标 (<0.10)'], ['数字素养分', 0.62, 0.05, 91.9, '达标 (<0.10)']], [{ label: '匹配净效应 ATT', value: 1.98 }, { label: '双侧 p 值', value: 0.0002 }, { label: '最大匹配后 |SMD|', value: 0.05 }], ['PSM_COVARIATE_BALANCE_OK']);
  const topsisSnap = await mkSnap('snap_r40_topsis', 'topsis', '熵权 TOPSIS 区域综合评价', ['综合位次', '评价对象', '正理想距 D+', '负理想距 D-', '贴近度 C_i', '梯度分级'], [[1, '城南示范区', 0.04, 0.42, 0.913, '高优示范 (≥0.65)'], [2, '高新园区', 0.14, 0.31, 0.689, '高优示范 (≥0.65)'], [3, '远郊生态区', 0.41, 0.05, 0.109, '待提升 (<0.40)']], [{ label: '最高贴近度 C_max', value: 0.913 }, { label: '最低贴近度 C_min', value: 0.109 }, { label: '评价对象数', value: 3 }], ['TOPSIS_WEIGHT_ENTROPY_VALID']);
  const ivSnap = await mkSnap('snap_r43_iv', 'iv', '工具变量 IV-2SLS 局部效应估计', ['估计阶段与变量', '点估计 β', '稳健 SE', 't / z 统计量', '95% CI', 'p 值'], [['第一阶段 (培训补贴 → 培育成效)', 0.91, 0.07, 13.0, '[0.77, 1.05]', 0.0001], ['第二阶段 2SLS LATE (培育成效)', 1.48, 0.16, 9.25, '[1.17, 1.79]', 0.0001], ['OLS 基准对照 (培育成效)', 2.04, 0.11, 18.5, '[1.82, 2.26]', 0.0001]], [{ label: '2SLS 局部效应 β_IV', value: 1.48 }, { label: '第一阶段 F 统计量', value: 42.6 }, { label: '双侧 p 值', value: 0.0001 }, { label: 'Wu-Hausman 内生性 p 值', value: 0.002 }], ['IV_STRONG_FIRST_STAGE', 'IV_ENDOGENEITY_CONFIRMED']);
  const abSnap = await mkSnap('snap_r43_ab', 'ab', '序贯 A/B 实验分层检验', ['指标类别与名称', '对照组均值', '实验组均值', '净提升 Δ', '稳健 SE', '95% CI', 'p 值 / OBF 判定'], [['核心北极星指标 (转化率指数)', 10.6, 14.1, 3.5, 0.28, '[2.95, 4.05]', 'p=0.0001 (突破OBF边界)'], ['安全护栏指标 (响应体验护栏)', 86.0, 85.8, -0.2, 0.31, '[-0.81, 0.41]', 'p=0.52 (护栏平稳)']], [{ label: '主指标净提升 Δ', value: 3.5 }, { label: '相对提升(%)', value: 33.02 }, { label: '双侧 p 值', value: 0.0001 }, { label: 'SRM 检验 p 值', value: 0.89 }], ['AB_SRM_BALANCED', 'AB_SEQUENTIAL_SIGNIFICANT']);
  const survivalSnap = await mkSnap('snap_r46_surv', 'survival', 'Kaplan-Meier 留存生存曲线与 Log-Rank 检验', ['队列分组', '样本量 n', '终点事件数 d', '删失率(%)', '中位生存期', 'RMST 均值', '期末生存率 S(t)'], [['常规服务组', 15, 12, 20.0, 4.8, 5.12, 0.2], ['AI伴随照护组', 15, 2, 86.7, '未达中位', 8.45, 0.867]], [{ label: 'Log-Rank χ²', value: 12.64 }, { label: '双侧 p 值', value: 0.0004 }, { label: 'RMST 差值 Δ', value: 3.33 }, { label: '总删失率(%)', value: 53.3 }], ['SURVIVAL_LOGRANK_SIGNIFICANT', 'SURVIVAL_HEAVY_CENSORING_GT_50PCT']);
  const metaSnap = await mkSnap('snap_r46_meta', 'meta', '跨地域实证效应随机效应 Meta 合成', ['研究单元 / 合并项', '效应量 θ_i', '标准误 SE', '随机权重(%)', '95% CI', '贡献判定'], [['华东队列', 0.38, 0.08, 32.0, '[0.223, 0.537]', '高权重'], ['中西部队列', 0.64, 0.12, 28.0, '[0.405, 0.875]', '常规权重'], ['DerSimonian-Laird 随机效应合并', 0.51, 0.09, 100.0, '[0.334, 0.686]', 'p=0.0001 | I²=58.2%']], [{ label: '合并效应 θ_RE', value: 0.51 }, { label: '合并 SE', value: 0.09 }, { label: '双侧 p 值', value: 0.0001 }, { label: '异质性 I²(%)', value: 58.2 }, { label: 'Egger 偏倚 p 值', value: 0.072 }], ['META_HIGH_HETEROGENEITY_I2_GE_50', 'META_EGGER_BIAS_P_LT_010']);

  assert.equal(suggestedNode(csDid), 'drivers.model');
  assert.equal(suggestedNode(conformal), 'drivers.model');
  assert.equal(suggestedNode(efa), 'data.testing');
  assert.equal(suggestedNode(med), 'drivers.model');
  assert.equal(suggestedNode(kanoSnap), 'diagnosis.evaluation');
  assert.equal(suggestedNode(rddSnap), 'drivers.model');
  assert.equal(suggestedNode(psmSnap), 'drivers.model');
  assert.equal(suggestedNode(topsisSnap), 'diagnosis.evaluation');
  assert.equal(suggestedNode(ivSnap), 'drivers.model');
  assert.equal(suggestedNode(abSnap), 'compare.tests');
  assert.equal(suggestedNode(survivalSnap), 'drivers.model');
  assert.equal(suggestedNode(metaSnap), 'intro.literature');

  const autoSnaps = [kanoSnap, rddSnap, csDid, psmSnap, conformal, topsisSnap, ivSnap, abSnap, survivalSnap, metaSnap];
  for (const dualSnap of autoSnaps) {
    assert.deepEqual(suggestedExhibits(dualSnap), ['table', 'chart'], `Expected dual ['table','chart'] placement for ${dualSnap.method}`);
    const intro = methodIntro(dualSnap);
    assert.ok(intro && intro.formulas.length >= 1, `Expected formal methodIntro equations for ${dualSnap.method}`);
  }
  assert.deepEqual(suggestedExhibits(corrMat), ['table']);
  assert.deepEqual(suggestedExhibits(corrSingle), []);

  let doc = createEditorContent();
  doc = { ...doc, version: 2, quality: { version: 1, results: [csDid, conformal, efa, med, corrMat, kanoSnap, rddSnap, psmSnap, topsisSnap, ivSnap, abSnap, survivalSnap, metaSnap], findings: [] } };
  for (const r of doc.quality.results) {
    const res = placeResult(doc, r.id);
    doc = res.content;
    assert.ok(res.blocks.some(b => b.kind === 'paragraph' && b.text.length > 15), `Expected readable prose for ${r.id}`);
  }
  const kanoSec = doc.report.find(s => s.id === 'diagnosis.evaluation' || (s.blocks ?? []).some(b => b.evidenceId === 'snap_r36_kano'));
  assert.ok(kanoSec && (kanoSec.blocks ?? []).some(b => b.text.includes('Better') && b.text.includes('Worse')), 'Kano reading prose must render Better/Worse interpretation');
  const rddSec = doc.report.find(s => (s.blocks ?? []).some(b => b.evidenceId === 'snap_r36_rdd'));
  assert.ok(rddSec && (rddSec.blocks ?? []).some(b => b.text.includes('\\hat{\\tau}') && b.text.includes('Sharp RDD')), 'RDD reading prose must render tau estimate');
  const psmSec = doc.report.find(s => (s.blocks ?? []).some(b => b.evidenceId === 'snap_r40_psm'));
  assert.ok(psmSec && (psmSec.blocks ?? []).some(b => b.text.includes('倾向得分匹配') && b.text.includes('ATT')), 'PSM reading prose must render ATT and SMD');
  const topSec = doc.report.find(s => (s.blocks ?? []).some(b => b.evidenceId === 'snap_r40_topsis'));
  assert.ok(topSec && (topSec.blocks ?? []).some(b => b.text.includes('TOPSIS') && b.text.includes('0.913')), 'TOPSIS reading prose must render C_i span');
  const ivSec = doc.report.find(s => (s.blocks ?? []).some(b => b.evidenceId === 'snap_r43_iv'));
  assert.ok(ivSec && (ivSec.blocks ?? []).some(b => b.text.includes('IV-2SLS') && b.text.includes('1.48')), 'IV reading prose must render beta_IV and F');
  const abSec = doc.report.find(s => (s.blocks ?? []).some(b => b.evidenceId === 'snap_r43_ab'));
  assert.ok(abSec && (abSec.blocks ?? []).some(b => b.text.includes('O\'Brien-Fleming') && b.text.includes('3.50')), 'AB reading prose must render lift and OBF');
  const survSec = doc.report.find(s => (s.blocks ?? []).some(b => b.evidenceId === 'snap_r46_surv'));
  assert.ok(survSec && (survSec.blocks ?? []).some(b => b.text.includes('Kaplan-Meier') && b.text.includes('RMST')), 'Survival reading prose must render KM and RMST');
  const metaSec = doc.report.find(s => (s.blocks ?? []).some(b => b.evidenceId === 'snap_r46_meta'));
  assert.ok(metaSec && (metaSec.blocks ?? []).some(b => b.text.includes('DerSimonian-Laird') && b.text.includes('0.51')), 'Meta reading prose must render theta_RE');

  for (const figSnap of autoSnaps) {
    const svg = assertTrueVector(await figureSVG(figSnap, 1, '#1D4E89'));
    assert.equal(svgSize(svg).width, 960, `Expected 960px publication SVG for ${figSnap.method}`);
    assert.match(svg, /<text\b/);
  }
  const kanoSvg = await figureSVG(kanoSnap, 1, '#1D4E89');
  assert.match(kanoSvg, /魅力属性|期望属性/);
  const rddSvg = await figureSVG(rddSnap, 1, '#1D4E89');
  assert.match(rddSvg, /Sharp RDD|置信区间/);
  const psmSvg = await figureSVG(psmSnap, 1, '#1D4E89');
  assert.match(psmSvg, /SMD=0\.10|匹配前/);
  const confSvg = await figureSVG(conformal, 1, '#1D4E89');
  assert.match(confSvg, /Split Conformal/);
  const topSvg = await figureSVG(topsisSnap, 1, '#1D4E89');
  assert.match(topSvg, /城南示范区/);
  const ivSvg = await figureSVG(ivSnap, 1, '#1D4E89');
  assert.match(ivSvg, /IV-2SLS|2SLS LATE/);
  const abSvg = await figureSVG(abSnap, 1, '#1D4E89');
  assert.match(abSvg, /序贯 A\/B|护栏/);
  const survSvg = await figureSVG(survivalSnap, 1, '#1D4E89');
  assert.match(survSvg, /限制平均生存时间|常规服务组/);
  const metaSvg = await figureSVG(metaSnap, 1, '#1D4E89');
  assert.match(metaSvg, /Meta 合成森林图|DerSimonian-Laird/);

  // Full end-to-end WYSIWYG export parity: all 10 autonomous figure snapshots + formal equations embed into LaTeX & Word!
  const fullTex = await createLatexReport(doc);
  const latexImages = fullTex.body.match(/\\ResearchImage\{\d+\}/g) || [];
  assert.ok(latexImages.length >= 10, `Expected >=10 LaTeX \\ResearchImage blocks for placed autonomous figures, got ${latexImages.length}`);
  assert.ok(fullTex.body.includes('\\[') && fullTex.body.includes('DerSimonian-Laird'), 'LaTeX export must retain formal method formulas and prose cleanly');
  const dummyPng = () => new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,13,73,68,65,84,120,156,99,248,15,4,0,9,251,3,253,167,168,243,255,0,0,0,0,73,69,78,68,174,66,96,130]);
  for (const sec of doc.report) {
    if ((sec.blocks ?? []).some(b => b.kind === 'chart' || b.kind === 'table' || b.kind === 'formula')) {
      const blocks = await wordBlocks(sec.blocks ?? [], doc, dummyPng);
      assert.ok(blocks.length >= 1, `Expected Word output blocks for section ${sec.id}`);
    }
  }
});

test('Resource library catalogs, SVGs, recommendations, and generated inserts expose zero Track/Bento/mode tags or informal brackets', async () => {
  const internalLeakRe = /Track\s*[12]|Bento\s*SVG|\bBento\b|V3\s*开放美指|模式一|模式二/iu;
  const bracketRe = /[【】「」『』]/u;
  const dictLabelRe = /统计口吻警示[：:]|统计合约要求[：:]|区域风物调研情景锚点[：:]/u;

  for (const f of VISUAL_FILTER_LABELS) {
    assert.equal(internalLeakRe.test(f.label), false, `Filter label leaked jargon: ${f.label}`);
    assert.equal(bracketRe.test(f.label), false);
  }
  for (const v of VISUAL_CATALOG) {
    const joined = [v.label, v.badge, v.subnote, v.whenToUse, ...(v.keywords ?? [])].join('\n');
    assert.equal(internalLeakRe.test(joined), false, `Visual catalog item ${v.id} leaked internal term: ${joined}`);
    assert.equal(bracketRe.test(joined), false, `Visual catalog item ${v.id} leaked brackets: ${joined}`);
    const svg = renderVisualSpecSvg(v, '#0F766E');
    assert.equal(internalLeakRe.test(svg), false, `Visual SVG ${v.id} leaked internal term`);
    assert.equal(bracketRe.test(svg), false, `Visual SVG ${v.id} leaked brackets`);
  }
  for (const c of CHART_CATALOG) {
    const joined = [c.title, c.methodFit, c.whenToUse, c.pitfallWarning].join('\n');
    assert.equal(bracketRe.test(joined), false, `Chart catalog item ${c.id} leaked brackets`);
  }
  for (const t of TABLE_CATALOG) {
    const joined = [t.title, t.footnote, t.contractNotes].join('\n');
    assert.equal(bracketRe.test(joined), false, `Table catalog item ${t.id} leaked brackets`);
  }
  for (const d of DIAGRAM_CATALOG) {
    const joined = [d.title, d.usageSummary].join('\n');
    assert.equal(bracketRe.test(joined), false, `Diagram catalog item ${d.id} leaked brackets`);
  }

  const recs = buildSmartRecommendations({ title: '低空无人机与新能源汽车充电网络社区满意度调查', goal: '双碳物流与银发反诈', report: [], quality: { version: 1, results: [], findings: [] } });
  const recReasons = [...recs.charts, ...recs.tables, ...recs.diagrams, ...recs.infographics].map(x => x.reasonBadge).join('\n');
  assert.equal(internalLeakRe.test(recReasons), false, `Recommendation reasons leaked jargon: ${recReasons}`);
  assert.equal(bracketRe.test(recReasons), false);

  const yiwu = getCountyProfile('330782');
  assert.ok(yiwu);
  const bento = VISUAL_CATALOG.find(v => v.id === 'info-bento-low-altitude');
  assert.ok(bento);
  const inserts = [
    buildGazetteerInsert(yiwu),
    await buildGazetteerLandmarkInsert(yiwu),
    await buildInfographicInsert(bento, '低空经济配送'),
    await buildChartSampleInsert(CHART_CATALOG[0], '低空经济配送'),
    await buildTableInsert(TABLE_CATALOG[0], '低空经济配送'),
    await buildDiagramInsert(DIAGRAM_CATALOG[0], '低空经济配送'),
  ];
  for (const ins of inserts) {
    const texts = [
      ins.source,
      ...ins.items.flatMap(it => (it.kind === 'paragraph' ? [it.text] : [it.caption, it.result.title, it.result.sourceName, ...(it.result.warnings ?? [])])),
    ].join('\n');
    assert.equal(internalLeakRe.test(texts), false, `Insert ${ins.id} leaked internal term: ${texts}`);
    assert.equal(bracketRe.test(texts), false, `Insert ${ins.id} leaked brackets: ${texts}`);
    assert.equal(dictLabelRe.test(texts), false, `Insert ${ins.id} leaked dictionary label: ${texts}`);
  }
  const promptText = buildGazetteerTopicPrompt(yiwu);
  assert.equal(bracketRe.test(promptText), false, `Gazetteer prompt leaked brackets: ${promptText}`);
});

test('All rendered catalog SVGs contain zero double-escaped XML entities (&amp;lt;/&amp;gt;)', () => {
  const doubleEscapeRe = /&amp;(?:lt|gt|amp|quot|#\d+);/iu;
  for (const c of CHART_CATALOG) {
    const svg = renderChartPreviewSvg(c, '#0F766E');
    assert.equal(doubleEscapeRe.test(svg), false, `Chart SVG ${c.id} double-escaped XML entity`);
  }
  for (const t of TABLE_CATALOG) {
    const svg = renderTablePreviewSvg(t, '#0F766E');
    assert.equal(doubleEscapeRe.test(svg), false, `Table SVG ${t.id} double-escaped XML entity`);
  }
  for (const d of DIAGRAM_CATALOG) {
    const svg = renderDiagramPreviewSvg(d, '#0F766E');
    assert.equal(doubleEscapeRe.test(svg), false, `Diagram SVG ${d.id} double-escaped XML entity`);
  }
  for (const v of VISUAL_CATALOG) {
    const svg = v.kind === 'palette_board' ? renderPaletteBoardSvg(v) : renderVisualSpecSvg(v, '#0F766E');
    assert.equal(doubleEscapeRe.test(svg), false, `Visual SVG ${v.id} double-escaped XML entity`);
  }
  for (const county of getCountiesForSelection('330000', '330700')) {
    const svg = renderRegionVisualCardSvg(county, '#0F766E');
    assert.equal(doubleEscapeRe.test(svg), false, `County SVG ${county.code} double-escaped XML entity`);
  }
});
