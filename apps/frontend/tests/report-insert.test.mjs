import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import sharp from 'sharp';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { buildDocx, buildPptx } from '../lib/editor-export.ts';
import { makeSlideObject, snapshotRecipe, verifyResearchQuality } from '../lib/research-quality.ts';
import { qualityResult } from '../lib/data-quality.ts';
import { blueprintSections, matchBlueprintNode } from '../lib/report-blueprint.ts';
import { placeResult } from '../lib/report-placement.ts';
import { presentResult, sourceLine, tableSpans } from '../lib/report-tables.ts';
import { captionText, readingParagraph } from '../lib/report-templates.ts';
import { applyReportInsert, frameGroup, insertSummary, sampleSizeInsert, samplingDesignInsert } from '../lib/report-insert.ts';
import { generateLatexBody } from '../lib/latex-report.ts';
import { INLINE_XREF_RE } from '../lib/report-numbering.ts';
import { benchmarkReport } from '../lib/report-benchmark.ts';
import { emptyReference } from '../lib/references.ts';
import { normalizeAcademicPunctuation, normalizePaperProse } from '../lib/typography.ts';
import {
  buildGroundedAbstractDraft,
  buildPreSubmissionAuditSummary,
  buildStatPresetFinding,
  buildStatPresetResultSnapshot,
} from '../lib/agent/autonomous-agent.ts';
import { groupStatement, parseSelectionTree } from '../lib/sampling-selection.ts';
import { sampleSize, methodsStatement } from '../lib/sampling.ts';
import { texProblem } from '../lib/omml.ts';
import { evidenceLabel, oneLine } from '../lib/quality-export.ts';

const renderSvg = async svg => new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
const report = () => parseEditorContent({ ...createEditorContent(), version: 2, report: blueprintSections({ includeOptional: false }), quality: { version: 1, results: [], findings: [] } });
const stage = (id, unit, frame, method, take = null, frameSize = null) => ({ id, unit, frame, method, take, frameSize, sizeMeasure: method === 'pps' ? '常住人口' : '', strata: '' });
// Placeholder names, as the design builder's own example uses.
const groups = [
  { id: 'g1', name: '城区居民', population: '在本市居住半年以上的城镇居民', completes: 300, tree: parseSelectionTree('甲区\n  一街道\n  二街道\n乙区\n  三街道\n  四街道'),
    stages: [stage('s1', '行政区', '全市所有行政区', 'srs', 2, 13), stage('s2', '街道', '所有街道', 'srs', 2, 8), stage('s3', '居民', '所有居民', 'intercept')] },
  { id: 'g2', name: '高校学生', population: '本市全日制在校生', completes: 200, tree: parseSelectionTree('某理工大学\n某师范大学'),
    stages: [stage('t1', '学校', '全市高校', 'srs', 2, 20), stage('t2', '学生', '所有学生', 'srs', 100, 12000)] },
];
const screening = { total: 432, kept: 397, flagged: [], notes: ['作答时长列有 2 行无法读取'], rules: [
  { id: 'attention', label: '注意力题未通过', criterion: '第 12 题未选“比较同意”', flagged: 20 },
  { id: 'duration', label: '作答过快', criterion: '用时少于中位数的 1/3', flagged: 15, unparsed: 2 },
  { id: 'duplicateIp', label: '同一 IP 重复提交', criterion: '同一 IP 出现两次以上', flagged: 3 },
  { id: 'duplicateAnswers', label: '答案完全重复', criterion: '全部题目答案相同', flagged: 0 },
] };

test('a screening becomes a report result whose table and paragraph separate removed from marked responses', async () => {
  const input = qualityResult(screening, new Set(['attention', 'duration', 'duplicateAnswers']), 35);
  const r = await snapshotRecipe(input, { title: '回收问卷质量控制', sourceName: '教学模拟问卷', sourceUrl: '', sourceHash: 'c'.repeat(64), classification: 'simulated' }, 'qc');
  assert.deepEqual([r.n, r.total], [397, 432]);
  const table = presentResult(r);
  assert.deepEqual(table.rows.map(x => x[2]), ['20', '15', '3', '0'], 'counts stay whole numbers, zero included');
  assert.equal(table.rows[1][1], '用时少于中位数的 1/3；2 行无法读取');
  const text = readingParagraph(r, { table: 't' });
  assert.equal(text, '本次调查共回收问卷 432 份。按[[表:t]]规则逐份筛查：注意力题未通过 20 份，作答过快 15 份（同一份问卷可能触发多条规则）；同一 IP 重复提交 3 份，仅作标记，未剔除。共剔除 35 份，得到有效问卷 397 份，问卷有效率为 91.9%。');
  const content = parseEditorContent({ ...report(), quality: { version: 1, results: [r], findings: [] } });
  const placed = placeResult(content, 'qc');
  assert.equal(matchBlueprintNode(placed.content.report.find(s => s.id === placed.sectionId).title).id, 'data.cleaning');
  assert.deepEqual(placed.blocks.map(b => b.kind), ['table', 'paragraph']);
});

test('the staged sampling design goes to the sampling section with frame tables and the inclusion probability', async () => {
  const statement = groups.map(groupStatement).join('\n');
  const insert = await samplingDesignInsert(groups, statement);
  assert.equal(insert.node, 'design.sampling');
  const tables = insert.items.filter(i => i.kind === 'table');
  assert.equal(tables.length, 2);
  assert.equal(tables[0].result.method, 'sampling-frame');
  assert.equal(sourceLine(tables[0].result), '资料来源：本研究抽样设计。');
  assert.match(tables[0].result.warnings[0], /不是概率样本/, 'an intercept stage is disclosed');
  assert.deepEqual(tables[1].result.warnings, []);
  const formulas = insert.items.filter(i => i.kind === 'formula');
  assert.equal(formulas.length, 1, 'only the all-random group has an inclusion probability');
  assert.equal(formulas[0].tex, '\\pi=\\prod_{k}\\frac{n_k}{N_k}=0.0008333', 'four significant digits of 2/20 × 100/12000');
  for (const f of formulas) assert.equal(texProblem(f.tex), null);
  const again = await samplingDesignInsert(groups, statement);
  assert.equal(again.items.find(i => i.kind === 'table').result.id, tables[0].result.id, 'the same design gives the same frame result');
  // The frame ID carries a digest of the group's stable ID: renamed and resized, the group is still the same group.
  const revised = (await samplingDesignInsert([{ ...groups[0], name: '改名后的群体', completes: (groups[0].completes ?? 0) + 50 }], statement)).items.find(i => i.kind === 'table').result.id;
  assert.notEqual(revised, tables[0].result.id);
  assert.equal(frameGroup(revised), frameGroup(tables[0].result.id));
  assert.notEqual(frameGroup(tables[0].result.id), frameGroup(tables[1].result.id));
  assert.equal(frameGroup('sampling-frame-0123456789abcdef'), null, 'frames from before the group digest have none');
  const applied = applyReportInsert(report(), insert);
  assert.equal(matchBlueprintNode(applied.content.report.find(s => s.id === applied.sectionId).title).id, 'design.sampling');
  assert.equal(applied.content.quality.results.length, 2);
  assert.equal(insertSummary(applied.blocks), '段落 3 段、表 2 张、公式 1 个');
  const twice = applyReportInsert(applied.content, again);
  assert.equal(twice.content.quality.results.length, 2, 'inserting again reuses the registered frames');
  const frame = presentResult(tables[0].result), spans = tableSpans(tables[0].result, frame);
  assert.deepEqual(spans.map(row => row[0]), [4, 0, 0, 0], 'the first-stage frame spans all its rows');
  // Placed through the general result catalogue, a frame still reads as a design, never as zero respondents.
  const placed = placeResult(applied.content, tables[0].result.id);
  assert.deepEqual(placed.blocks.map(b => b.kind), ['table', 'paragraph']);
  assert.equal(placed.blocks[1].text, `[[表:${placed.blocks[0].id}]]列出了城区居民各阶段的抽样框与入样单位。`);
  assert.doesNotMatch(evidenceLabel(tables[0].result), /n=|有效样本/);
  assert.throws(() => placeResult(applied.content, tables[0].result.id, { exhibits: [] }), /抽样框需要以表格呈现/);
  assert.doesNotMatch(readingParagraph(tables[0].result, {}), /下表|\[\[/, 'without a table the text claims none');
});

test('names typed into the design stay literal text', async () => {
  const odd = [{ ...groups[1], name: '学生[[图:x]]$1' }];
  const insert = await samplingDesignInsert(odd, groupStatement(odd[0]));
  const paragraphs = insert.items.filter(i => i.kind === 'paragraph').map(i => i.text).join('');
  assert.doesNotMatch(paragraphs, /\[\[/);
  assert.match(paragraphs, /\\\$1/);
  assert.equal(insert.items.find(i => i.kind === 'table').caption, '学生［［图:x］］＄1各阶段抽样框与入样单位');
});

test('the sample-size calculation arrives as numbered formulas with their symbols explained', () => {
  const plan = { target: 'proportion', confidence: '0.95', margin: 0.05, proportion: 0.5, sd: 1, population: 12000, designEffect: 1.5, validRate: 0.85, subgroups: 1 };
  const result = sampleSize(plan), statement = methodsStatement({ kind: 'stratified', population: '本市城镇居民', frame: '街道居民名册', plan, result });
  const insert = sampleSizeInsert(plan, result, statement);
  const formulas = insert.items.filter(i => i.kind === 'formula');
  assert.equal(formulas.length, result.steps.length);
  for (const f of formulas) assert.equal(texProblem(f.tex), null, f.tex);
  const where = insert.items.at(-1).text;
  assert.match(where, /^式中，\$z_\{\\alpha\/2\}\$ 为置信水平对应的标准正态分位数，\$p\$ 为预估比例，\$e\$ 为允许误差，\$N\$ 为总体规模，\$\\mathrm\{deff\}\$ 为设计效应，\$r\$ 为预计有效回收率。$/);
  const applied = applyReportInsert(report(), insert);
  assert.equal(applied.blocks.filter(b => b.kind === 'formula').length, result.steps.length);
  assert.equal(insert.items.filter(i => i.kind === 'paragraph' && i.text.startsWith('需要说明的是：')).length, 0, 'no caveat, no caveat paragraph');
  const tight = { ...plan, population: 150, proportion: 0.3 }, tightResult = sampleSize(tight);
  assert.ok(tightResult.warnings.length >= 2);
  const caveat = sampleSizeInsert(tight, tightResult, methodsStatement({ kind: 'stratified', population: '某校学生', frame: '学籍名册', plan: tight, result: tightResult })).items.at(-1);
  assert.equal(caveat.text, `需要说明的是：${tightResult.warnings.join('')}`, 'the calculator\'s caveats travel with its formulas');
  assert.throws(() => applyReportInsert(report(), { ...insert, items: [{ kind: 'formula', tex: '\\frac{1}{' }] }), /公式无法排版/);
  assert.throws(() => applyReportInsert(report(), { ...insert, items: [] }), /没有可写入的内容/);
});

test('a long group name shortens the slide caption instead of blocking the PPT export', async () => {
  const long = [{ ...groups[1], name: '某市各区县全日制普通高等学校与职业院校在校本科及专科学生群体'.repeat(2) }];
  const insert = await samplingDesignInsert(long, groupStatement(long[0]));
  const applied = applyReportInsert(report(), insert), frame = insert.items.find(i => i.kind === 'table').result;
  const slide = { ...applied.content.slides[0], layout: 'chart', objects: [makeSlideObject('table', { evidenceId: frame.id, x: 5, y: 10, width: 60, height: 60, fontSize: 14 })] };
  const content = parseEditorContent({ ...applied.content, slides: [slide, ...applied.content.slides.slice(1)] });
  await assert.doesNotReject(buildPptx(content));
  assert.equal(oneLine('短标题', 5, 13), '短标题');
  assert.match(oneLine('很长'.repeat(40), 2, 13), /…$/);
  assert.equal([...oneLine('😀'.repeat(40), 2, 13)].length, 11, 'an emoji counts as a full-width glyph: ten fit, then the ellipsis');
});

test('Word merges a frame table\'s parent units and keeps the three-line rules', async () => {
  const insert = await samplingDesignInsert(groups, groups.map(groupStatement).join('\n'));
  const applied = applyReportInsert(report(), insert);
  const zip = await JSZip.loadAsync(await (await buildDocx(applied.content, undefined, renderSvg)).arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  assert.ok((xml.match(/<w:vMerge w:val="restart"\/>/g) ?? []).length >= 2, 'parent units restart a vertical merge');
  assert.ok((xml.match(/<w:vMerge(?: w:val="continue")?\/>/g) ?? []).length >= 3, 'their children rows continue it');
  assert.doesNotMatch(xml, /<w:t[^>]*>资料来源/u, 'the frame table prints no source line');
  assert.doesNotMatch(xml, /有效样本 n = 0/);
});

test('the toolbar writes into the section the user picked, and a figure may plot a result the report already holds', async () => {
  const input = qualityResult(screening, new Set(['attention']), 20);
  const r = await snapshotRecipe(input, { title: '回收问卷质量控制', sourceName: '教学模拟问卷', sourceUrl: '', sourceHash: 'c'.repeat(64), classification: 'simulated' }, 'qc');
  const content = parseEditorContent({ ...report(), quality: { version: 1, results: [r], findings: [] } });
  const picked = content.report[3];
  const paragraph = applyReportInsert(content, { id: 'i1', node: 'data.cleaning', source: '报告工具栏', items: [{ kind: 'paragraph', text: '一段正文。' }], sectionId: picked.id }, picked.id);
  assert.equal(paragraph.sectionId, picked.id, 'the picked section wins over the blueprint node');
  const figure = applyReportInsert(content, { id: 'i2', node: '', source: '报告工具栏', items: [{ kind: 'figure', result: r, caption: r.title }] }, picked.id);
  assert.deepEqual(figure.blocks.map(b => b.kind), ['chart'], 'only the figure is added; the registered table is not repeated');
  const stranger = { ...r, id: 'other', resultHash: 'd'.repeat(64) };
  assert.throws(() => applyReportInsert(content, { id: 'i3', node: '', source: '报告工具栏', items: [{ kind: 'figure', result: stranger, caption: 'x' }] }, picked.id), /图须与其结果表一同写入/);
  assert.throws(() => applyReportInsert(content, { id: 'i4', node: '', source: '报告工具栏', items: [{ kind: 'paragraph', text: 'x' }] }, 'gone'), /目标章节不存在/);
});

test('structured reference inserts register into content.references, deduplicate by DOI or title, and export cleanly', async () => {
  const base = parseEditorContent({
    ...createEditorContent(),
    version: 2,
    report: blueprintSections({ includeOptional: false }).filter(s => s.title !== '参考文献'),
    quality: { version: 1, results: [], findings: [] },
  });
  const entry = {
    ...emptyReference('J'),
    id: 'ref-csdid-1',
    authors: ['Callaway, B.', "Sant'Anna, P. H. C."],
    title: 'Difference-in-Differences with multiple time periods',
    source: 'Journal of Econometrics',
    year: '2021',
    doi: '10.1016/j.jeconom.2020.12.001',
    url: 'https://doi.org/10.1016/j.jeconom.2020.12.001',
    verification: 'metadata_only',
  };
  const first = applyReportInsert(base, {
    id: 'ref-insert-1',
    node: 'references',
    source: '文献核验',
    items: [{ kind: 'reference', entry }],
  });
  assert.equal(first.referencesAdded, 1);
  assert.equal(first.content.references?.length, 1);
  assert.equal(insertSummary(first.blocks, { references: first.referencesAdded }), '参考文献 1 条');
  const refSection = first.content.report.find(s => s.id === first.sectionId);
  assert.equal(refSection?.title, '参考文献');
  assert.equal(refSection?.body, '');
  assert.equal(refSection?.blocks?.length ?? 0, 0);

  const dupByDoi = applyReportInsert(first.content, {
    id: 'ref-insert-2',
    node: 'references',
    source: '文献核验',
    items: [{ kind: 'reference', entry: { ...entry, id: 'ref-csdid-2', title: 'Different casing', doi: '10.1016/J.JECONOM.2020.12.001' } }],
  });
  assert.equal(dupByDoi.referencesAdded, 0);
  assert.equal(dupByDoi.content.references?.length, 1);
  assert.equal(insertSummary(dupByDoi.blocks, { references: dupByDoi.referencesAdded }), '该文献已在参考文献目录中（未重复写入）');

  const dupByTitle = applyReportInsert(first.content, {
    id: 'ref-insert-3',
    node: 'references',
    source: '文献核验',
    items: [{ kind: 'reference', entry: { ...entry, id: 'ref-csdid-3', doi: '', title: ' difference-in-differences with multiple time periods ' } }],
  });
  assert.equal(dupByTitle.referencesAdded, 0);
  assert.equal(dupByTitle.content.references?.length, 1);

  assert.match(generateLatexBody(first.content), /Callaway, B\., Sant'Anna, P\. H\. C\. Difference-in-Differences/);
  await assert.doesNotReject(buildDocx(first.content));
});

test('stat preset snapshots build verifiable ResultSnapshots, insert Booktabs three-line tables with live refs, and format <0.001', async () => {
  const spearmanRes = {
    projectId: 'p1',
    ok: true,
    classification: 'simulated',
    snapshotId: 'snap-sp',
    resultHash: 'a'.repeat(64),
    scriptSha256: 'b'.repeat(64),
    summary: '服务感知与采纳意愿呈正相关（rho=0.612, p < 0.0001）。',
    nEffective: 226,
    metrics: { variables: 4, top_rho: 0.612, top_p: 0.000012 },
    table: {
      headers: ['变量 A', '变量 B', 'Spearman ρ', '显著性 p 值'],
      rows: [
        ['service_perception', 'adopt_intention', 0.6123, 0.000012],
        ['ui_fluency', 'trust_score', 0.4481, 0.0042],
      ],
    },
    diagnostics: ['NONPARAMETRIC_RANK_SPEARMAN'],
    raw: {},
  };
  const spSnapshot = await buildStatPresetResultSnapshot('spearman_matrix', 'Spearman 秩相关稳健矩阵', spearmanRes);
  assert.ok(spSnapshot);
  assert.equal(spSnapshot.method, 'spearman-matrix');
  assert.equal(spSnapshot.rows[0][0], '服务感知');
  assert.equal(spSnapshot.rows[0][1], '采纳意愿');
  assert.deepEqual(presentResult(spSnapshot).rows[0], ['服务感知', '采纳意愿', '0.612', '<0.001']);

  const mwRes = {
    projectId: 'p1',
    ok: true,
    classification: 'actual',
    snapshotId: 'snap-mw',
    resultHash: 'c'.repeat(64),
    scriptSha256: 'd'.repeat(64),
    summary: "两组在采纳意愿上存在差异（Cliff's delta=0.31）。",
    nEffective: 180,
    metrics: { u_min: 3120, z_stat: -2.41, p_value: 0.0159, cliffs_delta: 0.31, n_group1: 90, n_group2: 90 },
    table: {
      headers: ['分组', '有效样本 n', '均值', '中位数'],
      rows: [
        ['高龄独居/空巢', 90, 4.12, 4.0],
        ['与子女同住', 90, 3.65, 3.5],
      ],
    },
    diagnostics: ['NONPARAMETRIC_MANN_WHITNEY'],
    raw: {},
  };
  const mwSnapshot = await buildStatPresetResultSnapshot('mann_whitney_cliff', "Mann-Whitney U 与 Cliff's Delta", mwRes);
  assert.ok(mwSnapshot);
  assert.equal(mwSnapshot.classification, 'user_provided');
  assert.equal(mwSnapshot.method, 'mann-whitney');

  const base = report();
  const applied = applyReportInsert(base, {
    id: 'stat-insert-1',
    node: 'compare.tests',
    source: '证见工坊',
    items: [
      { kind: 'table', result: spSnapshot, caption: captionText('Spearman 秩相关稳健矩阵结果汇总') },
      { kind: 'paragraph', text: `如[[表:@0]]所示，${spearmanRes.summary}` },
    ],
  });
  await assert.doesNotReject(verifyResearchQuality(applied.content.quality));
  assert.equal(applied.content.quality.results.length, 1);
  assert.equal(applied.blocks.length, 2);
  assert.equal(applied.blocks[0].kind, 'table');
  assert.equal(applied.blocks[1].text, `如[[表:${applied.blocks[0].id}]]所示，${spearmanRes.summary}`);
  assert.match(generateLatexBody(applied.content), /服务感知 & 采纳意愿/);
  await assert.doesNotReject(buildDocx(applied.content));
});

test('structured finding registration enforces scientific honesty on simulated vs user_provided results and deduplicates cleanly', async () => {
  const actualRes = {
    projectId: 'p-finding',
    ok: true,
    classification: 'actual',
    snapshotId: 'snap-actual',
    resultHash: 'e'.repeat(64),
    scriptSha256: 'f'.repeat(64),
    summary: "两组在采纳意愿上存在差异（Cliff's δ=0.31）。",
    nEffective: 180,
    metrics: { u_min: 3120, cliffs_delta: 0.31 },
    table: {
      headers: ['分组', '有效样本 n', '均值', '中位数'],
      rows: [
        ['高龄独居/空巢', 90, 4.12, 4.0],
        ['与子女同住', 90, 3.65, 3.5],
      ],
    },
    diagnostics: [],
    raw: {},
  };
  const actualSnap = await buildStatPresetResultSnapshot('mann_whitney_cliff', "Mann-Whitney U 与 Cliff's Delta", actualRes);
  assert.ok(actualSnap);
  const actualFinding = buildStatPresetFinding('mann_whitney_cliff', "Mann-Whitney U 与 Cliff's Delta", actualRes, actualSnap);
  assert.equal(actualFinding.status, 'confirmed');
  assert.equal(actualFinding.confirmedHashes[actualSnap.id], actualSnap.resultHash);

  const base = report();
  const inserted = applyReportInsert(base, {
    id: 'finding-insert-1',
    node: 'conclusion.findings',
    source: '研究发现登记',
    items: [
      { kind: 'finding', finding: actualFinding, result: actualSnap },
      { kind: 'paragraph', text: actualFinding.interpretation },
    ],
  });
  await assert.doesNotReject(verifyResearchQuality(inserted.content.quality));
  assert.equal(inserted.findingsAdded, 1);
  assert.equal(inserted.content.quality.findings.length, 1);
  assert.equal(inserted.content.quality.findings[0].status, 'confirmed');
  assert.equal(insertSummary(inserted.blocks, { findings: inserted.findingsAdded }), '段落 1 段、研究发现 1 条');

  const dup = applyReportInsert(inserted.content, {
    id: 'finding-insert-2',
    node: 'conclusion.findings',
    source: '研究发现登记',
    items: [{ kind: 'finding', finding: { ...actualFinding, id: 'other-id' } }],
  });
  assert.equal(dup.findingsAdded, 0);
  assert.equal(insertSummary(dup.blocks, { findings: dup.findingsAdded }), '该发现已在研究发现列表中（未重复写入）');

  const simRes = { ...actualRes, classification: 'simulated', resultHash: '1'.repeat(64) };
  const simSnap = await buildStatPresetResultSnapshot('mann_whitney_cliff', '教学模拟检验', simRes);
  assert.ok(simSnap);
  const simFinding = buildStatPresetFinding('mann_whitney_cliff', '教学模拟检验', simRes, simSnap);
  assert.equal(simFinding.status, 'draft');
  assert.deepEqual(simFinding.confirmedHashes, {});

  // Even if caller mistakenly passes status: 'confirmed' for simulated data, applyReportInsert downgrades it to draft.
  const forcedSim = applyReportInsert(base, {
    id: 'finding-sim-guard',
    node: 'conclusion.findings',
    source: '研究发现登记',
    items: [
      {
        kind: 'finding',
        finding: { ...simFinding, status: 'confirmed', confirmedHashes: { [simSnap.id]: simSnap.resultHash } },
        result: simSnap,
      },
    ],
  });
  assert.equal(forcedSim.content.quality.findings[0].status, 'draft');
  assert.deepEqual(forcedSim.content.quality.findings[0].confirmedHashes, {});
  const evidenceCheck = benchmarkReport(forcedSim.content).checks.find(c => c.id === 'findingEvidence');
  assert.notEqual(evidenceCheck?.status, 'fail');
});

test('INLINE_XREF_RE captures genuine figure/table/equation/citation refs while ignoring years and compounds', () => {
  const extract = s => [...s.matchAll(INLINE_XREF_RE)].map(m => m[0].trim());
  assert.deepEqual(extract('如表 4-1 所示，见图 2-3 与附表 1，由式（4-1）可得结论 [1,3]。'), ['表 4-1', '图 2-3', '附表 1', '式（4-1）', '[1,3]']);
  assert.deepEqual(extract('表 4-1 与表 4-2 对比均显示显著差异。'), ['表 4-1', '表 4-2']);
  assert.deepEqual(extract('（注：2025 年末历史目录，不代表 2026 年现势全量核验。）'), []);
  assert.deepEqual(extract('发表 2024 年研究并对比方式 1 与模式 2，其中代表 5 万人或图 3 亿元及表 2025。'), []);
});

test('inserting real paragraphs into starter hint sections clears placeholder hints and grounded abstract summarizes verified facts', async () => {
  const starter = parseEditorContent({ ...createEditorContent(), title: '县域智慧助餐适老化体验调研', version: 2 });
  const simRes = {
    projectId: 'p-abs',
    ok: true,
    classification: 'simulated',
    snapshotId: 'snap-abs',
    resultHash: 'a'.repeat(64),
    scriptSha256: 'b'.repeat(64),
    summary: '服务感知与采纳意愿呈正相关（ρ=0.612, p < 0.0001）。',
    nEffective: 240,
    metrics: { top_rho: 0.612 },
    table: {
      headers: ['变量 A', '变量 B', 'Spearman ρ', '显著性 p 值'],
      rows: [['服务感知', '采纳意愿', 0.612, 0.00001]],
    },
    diagnostics: [],
    raw: {},
  };
  const snap = await buildStatPresetResultSnapshot('spearman_matrix', 'Spearman 秩相关稳健矩阵', simRes);
  assert.ok(snap);
  const draft = buildGroundedAbstractDraft({
    projectTitle: '县域智慧助餐适老化体验调研',
    report: { ...starter, quality: { version: 1, results: [snap], findings: [] } },
  });
  assert.equal(draft.isSimulated, true);
  assert.match(draft.paragraphs[0], /【教学模拟数据，不能作为实际调查结果】/);
  assert.match(draft.paragraphs.at(-1), /^关键词：/);
  assert.equal(/(?:ReAct|Sandbox|SHA-256|算子|record_pivot)/i.test(draft.paragraphs.join('\n')), false);

  const inserted = applyReportInsert(starter, {
    id: 'abs-1',
    node: 'abstract',
    source: '证见工坊',
    items: draft.paragraphs.map(text => ({ kind: 'paragraph', text })),
  });
  const absSection = inserted.content.report.find(s => s.id === 'abstract' || s.title === '摘要');
  assert.equal(absSection?.body, '');
  const checks = benchmarkReport(inserted.content).checks;
  assert.notEqual(checks.find(c => c.id === 'abstract')?.status, 'fail');

  const starterTitled = parseEditorContent({ ...createEditorContent(), title: '我的市场调查研究', version: 2 });
  const countyReport = {
    ...starterTitled,
    quality: {
      version: 1,
      results: [
        snap,
        { ...snap, id: 'snap-mw', method: 'mann-whitney', title: 'Mann-Whitney 检验结果' },
      ],
      findings: [],
    },
    report: starterTitled.report.map(s =>
      /研究背景/.test(s.title) ? { ...s, body: '浙江省金华市义乌市（行政区划代码 330782）纳入本研究区域考察范围。' } : s,
    ),
  };
  const spacedDraft = buildGroundedAbstractDraft({
    projectTitle: '义乌县域适老化体验调研',
    report: countyReport,
  });
  assert.ok(!spacedDraft.paragraphs[0].includes('我的市场调查研究'));
  assert.ok(spacedDraft.paragraphs[0].includes('义乌县域适老化体验调研'));
  assert.ok(spacedDraft.keywords.includes('义乌市'), `expected concise county keyword, got ${spacedDraft.keywords.join(',')}`);
  assert.ok(spacedDraft.keywords.includes('Mann-Whitney 检验'), `expected preserved Latin spacing, got ${spacedDraft.keywords.join(',')}`);
  assert.equal(/Mann-WhitneyU|Cliff'sδ/.test(spacedDraft.keywords.join(';')), false);
});

test('buildPreSubmissionAuditSummary detects blind-review leaks, dangling cross-refs, metadata-only cites, and remediation flags', () => {
  const dirty = parseEditorContent({
    ...createEditorContent(),
    version: 2,
    references: [
      {
        ...emptyReference('J'),
        id: 'r-meta',
        authors: ['张三'],
        title: '县域服务调研方法',
        source: '调研科学',
        year: '2024',
        verification: 'metadata_only',
      },
    ],
    report: [
      { id: 'abs', title: '摘要', body: '【摘要写作提示】\n请补充摘要。', source: '' },
      { id: 'bg', title: '一、研究背景与问题', body: '依托某理工大学团队并在指导教师指导下完成，详见[[表:missing-table]]。', source: '' },
      { id: 'ref', title: '参考文献', body: '', source: '' },
    ],
  });
  const audit = buildPreSubmissionAuditSummary(dirty);
  assert.ok(audit.score >= 0 && audit.totalChecks > 0);
  assert.equal(audit.danglingCount, 1);
  assert.deepEqual(audit.danglingTitles, ['一、研究背景与问题']);
  assert.equal(audit.referenceCount, 1);
  assert.equal(audit.metadataOnlyRefs, 1);
  assert.ok(audit.blindLeakHits.includes('某理工大学'));
  assert.ok(audit.blindLeakHits.includes('指导教师'));
  assert.equal(audit.needsAbstract, true);
  assert.equal(audit.needsReferences, false);
  assert.equal(audit.needsResults, true);
  assert.equal(audit.needsFindings, true);
  assert.equal(audit.needsQuestionnaireAppendix, true);
  assert.equal(audit.needsDataAppendix, false);
  for (const gap of audit.topGaps) {
    assert.doesNotMatch(gap.detail, /[【】「」『』]/u);
  }
});

test('normalizeAcademicPunctuation strips brackets and stray braces while preserving TeX math and p=0.05', () => {
  const sample = '【Spearman 秩相关稳健矩阵】相关系数为 $\\frac{\\rho_{1}}{2}$，其中「当前居住模式」与『信任度』相关（B=0.561, p=0.0）。；显著性阈值设为 p=0.05，去除 {raw_tag} 并在【摘要写作提示】收尾。';
  const cleaned = normalizeAcademicPunctuation(sample);
  assert.equal(cleaned.includes('采用 Spearman 秩相关稳健矩阵 检验，相关系数为'), true);
  assert.equal(cleaned.includes('Spearman 秩相关稳健矩阵：'), false);
  assert.equal(cleaned.includes('$\\frac{\\rho_{1}}{2}$'), true);
  assert.equal(cleaned.includes('“当前居住模式”与“信任度”'), true);
  assert.equal(cleaned.includes('p < 0.0001'), true);
  assert.equal(cleaned.includes('p=0.05'), true);
  assert.equal(cleaned.includes('raw_tag'), true);
  assert.equal(cleaned.includes('摘要写作提示收尾'), true);
  assert.equal(/[【】「」『』{}]/u.test(cleaned.replace(/\$[^$]+\$/gu, '')), false);
  assert.equal(/。；|p=0\.0(?![0-9])/u.test(cleaned), false);
});

test('normalizePaperProse seamlessly weaves legacy dictionary-style method headers and metric dumps into academic sentences', () => {
  const mwRaw = '如表 5-2 所示，【Mann-Whitney U 与 Cliff\'s Delta】按「当前居住模式」对比两组（高龄独居/空巢 n=120 vs 与子女同住/高频代际照料 n=120）在「智慧终端界面清晰度与呼救反馈明确感」上的分布差异：U=6944.0, Z=0.491, p = 0.6236, Cliff\'s δ=-0.036（可忽略）。（有效样本 n=240） 核心统计指标：U 统计量 6944 · Z 值 0.4908 · p 值 0.6236 · Cliff\'s δ -0.0356。';
  const mwClean = normalizePaperProse(mwRaw);
  assert.ok(mwClean.startsWith("如表 5-2 所示，采用 Mann-Whitney U 与 Cliff's δ 检验，按“当前居住模式”"));
  assert.ok(mwClean.includes('上的分布差异，结果显示 U=6944.0'));
  assert.ok(mwClean.includes('（有效样本 n=240）。'));
  assert.equal(/Mann-Whitney U 与 Cliff's (?:Delta|δ)[：:]|核心统计指标[：:]|[【】「」『』]/u.test(mwClean), false);

  const spRaw = '如表 5-1 所示，Spearman 秩相关稳健矩阵：基于 5 个数值变量成对完整样本 (n=240) 计算 Spearman 秩相关：最强关联为 智慧终端界面清晰度与呼救反馈 × 繁琐绑定流程令我感到抗拒 (rho=-0.919, p=0.0)。核心统计指标：变量数 5 · 最强相关 ρ -0.9192 · 显著性 p < 0.0001。';
  const spClean = normalizePaperProse(spRaw);
  assert.ok(spClean.startsWith('如表 5-1 所示，基于 5 个数值变量成对完整样本 (n=240) 计算 Spearman 秩相关，其中最强关联为'));
  assert.ok(spClean.includes('(ρ=-0.919, p < 0.0001)。'));
  assert.equal(/Spearman 秩相关稳健矩阵[：:]|核心统计指标[：:]|\brho=|p=0\.0(?![0-9])|[【】「」『』]/u.test(spClean), false);
});

test('buildGroundedAbstractDraft avoids double punctuation and buildPreSubmissionAuditSummary toggles appendix flags', async () => {
  const snap = await buildStatPresetResultSnapshot('spearman_matrix', 'Spearman 秩相关稳健矩阵', {
    projectId: 'p-1',
    ok: true,
    classification: 'user_provided',
    snapshotId: 'snap-abs-2',
    resultHash: 'c'.repeat(64),
    scriptSha256: 'd'.repeat(64),
    summary: '信任度与采纳意愿呈正相关（ρ=0.623, p < 0.0001）。',
    nEffective: 218,
    metrics: { top_rho: 0.623 },
    table: {
      headers: ['变量 A', '变量 B', 'Spearman ρ', '显著性 p 值'],
      rows: [['信任度', '采纳意愿', 0.623, 0]],
    },
    diagnostics: [],
    raw: {},
  });
  assert.ok(snap);
  const baseWithResult = parseEditorContent({
    ...createEditorContent(),
    version: 2,
    quality: { version: 1, results: [snap], findings: [] },
  });
  const abstractDraft = buildGroundedAbstractDraft({
    projectTitle: '银发健康监测研究',
    report: baseWithResult,
    latestRun: {
      schemaVersion: 1,
      runId: 'run-abs-1',
      projectId: 'p-1',
      status: 'completed',
      goal: '银发健康监测研究',
      geography: '县域',
      datasetMode: 'inline_dataset',
      leaseMode: 'pi_autonomous',
      toolCallsUsed: 2,
      maxToolCalls: 12,
      reworkRounds: 0,
      datasetSummary: {
        datasetId: 'd-1',
        title: '调研数据集',
        classification: 'user_provided',
        rawRowCount: 220,
        cleanedRowCount: 218,
        variables: 6,
        sha256: 'd'.repeat(64),
      },
      motherInsight: {
        headline: '核心构念呈显著分化（B=0.561, p=0.0）。',
        mechanism: '',
        paradoxDetail: '',
        scopeBoundary: '',
        supportingSnapshots: [],
      },
      falsificationReport: { decision: 'approve', summary: '' },
      pendingMilestone: null,
      registeredResults: [],
      epistemicGraph: { nodes: [], edges: [], pivot_log: [], completeness: { totalNodes: 0, verifiedNodes: 0, dirtyNodes: 0, pivotCount: 0 } },
      reasoningTrace: [],
      epistemicMemories: [],
    },
  });
  const joinedAbstract = abstractDraft.paragraphs.join('\n');
  assert.equal(/。；|p=0\.0(?![0-9])|[「」『』]/u.test(joinedAbstract), false);
  assert.ok(joinedAbstract.includes('p < 0.0001'));

  const auditMissingData = buildPreSubmissionAuditSummary(baseWithResult);
  assert.equal(auditMissingData.needsDataAppendix, true);
  assert.equal(auditMissingData.needsQuestionnaireAppendix, true);

  const withQ = applyReportInsert(baseWithResult, {
    id: 'app-q-1',
    node: 'appendix.questionnaire',
    source: '证见工坊',
    items: [{ kind: 'paragraph', text: '1. 您是否年满 60 周岁？（单选）' }],
  }).content;
  const withBoth = applyReportInsert(withQ, {
    id: 'app-d-1',
    node: 'appendix.data',
    source: '证见工坊',
    items: [{ kind: 'paragraph', text: '共清洗剔除 2 份无效样本。' }],
  }).content;
  const auditFilled = buildPreSubmissionAuditSummary(withBoth);
  assert.equal(auditFilled.needsQuestionnaireAppendix, false);
  assert.equal(auditFilled.needsDataAppendix, false);
});

test('buildDocx sanitizes legacy corner brackets, dictionary labels, and p=0.0 while keeping OMML formulas intact', async () => {
  const content = parseEditorContent({
    ...createEditorContent(),
    version: 2,
    title: '银发「智」守专项调研报告',
    report: [
      {
        id: 'sec-1',
        title: '一、「居住模式」差异与检验',
        body: [
          '【Mann-Whitney U 与 Cliff\'s Delta】按「当前居住模式」对比两组在「智慧终端满意度」上的分布差异：U=6944.0, Z=0.491, p=0.0。（有效样本 n=240） 核心统计指标：U 统计量 6944 · Z 值 0.491。',
          '基于 5 个数值变量成对完整样本 (n=240) 计算 Spearman 秩相关：最强关联为 界面清晰度 × 绑定流程抗拒 (rho=-0.919, p=0.0)，模型公式记为 $\\alpha_{i}=0.05$。核心统计指标：变量数 5。',
        ].join('\n'),
        source: '来自「调研汇总」',
      },
    ],
  });
  const zip = await JSZip.loadAsync(await (await buildDocx(content, undefined, renderSvg)).arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  const plainRunsText = [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map(m => m[1])
    .join('')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  assert.equal(/[【】「」『』]/u.test(plainRunsText), false, `unexpected Chinese brackets in docx: ${plainRunsText}`);
  assert.equal(/Mann-Whitney U 与 Cliff's Delta[：:]|Spearman 秩相关稳健矩阵[：:]|核心统计指标[：:]|\brho=|p=0\.0(?![0-9])/u.test(plainRunsText), false);
  assert.ok(plainRunsText.includes("采用 Mann-Whitney U 与 Cliff's δ 检验，按“当前居住模式”"));
  assert.ok(plainRunsText.includes('计算 Spearman 秩相关，其中最强关联为'));
  assert.ok(plainRunsText.includes('p < 0.0001'));
  assert.ok(xml.includes('<m:oMath>'), 'inline TeX formula should still convert cleanly to OMML');
});

test('generateLatexBody and buildPptx sanitize legacy brackets, dictionary labels, rho=, and p=0.0 while preserving TeX math', async () => {
  const decodeXml = s => s
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  const content = parseEditorContent({
    ...createEditorContent(),
    version: 2,
    title: '银发「智」守专项调研报告',
    report: [
      {
        id: 'sec-1',
        title: '一、「居住模式」差异与检验',
        body: [
          '【Mann-Whitney U 与 Cliff\'s Delta】按「当前居住模式」对比两组在「智慧终端满意度」上的分布差异：U=6944.0, Z=0.491, p=0.0。（有效样本 n=240） 核心统计指标：U 统计量 6944 · Z 值 0.491。',
          '基于 5 个数值变量成对完整样本 (n=240) 计算 Spearman 秩相关：最强关联为 界面清晰度 × 绑定流程抗拒 (rho=-0.919, p=0.0)，模型公式记为 $\\alpha = 0.86$。核心统计指标：变量数 5。',
        ].join('\n'),
        source: '来自「调研汇总」',
      },
    ],
    slides: [
      {
        id: 'slide-1',
        layout: 'two-column',
        title: '一、「居住模式」差异对比',
        body: '【Mann-Whitney U 与 Cliff\'s Delta】：按「当前居住模式」检验显示 U=6944.0, p=0.0。核心统计指标：U 6944。',
        aside: '关键发现：界面清晰度与抗拒度呈显著负相关（rho=-0.919, p=0.0）。',
        notes: '备注：来源于「调研汇总」主表（p=0.0）。',
      },
    ],
  });

  const texBody = generateLatexBody(content);
  assert.equal(/[【】「」『』]/u.test(texBody), false, `unexpected Chinese brackets in LaTeX body: ${texBody}`);
  assert.equal(/Mann-Whitney U 与 Cliff's Delta[：:]|核心统计指标[：:]|\brho=|p=0\.0(?![0-9])/u.test(texBody), false);
  assert.ok(texBody.includes("采用 Mann-Whitney U 与 Cliff's δ 检验，按“当前居住模式”"));
  assert.ok(texBody.includes('计算 Spearman 秩相关，其中最强关联为'));
  assert.ok(texBody.includes('p < 0.0001'));
  assert.ok(texBody.includes('\\(\\alpha = 0.86\\)'), 'inline TeX formula should be preserved in LaTeX output');

  const pptxZip = await JSZip.loadAsync(await (await buildPptx(content, renderSvg)).arrayBuffer());
  const slideXml = await pptxZip.file('ppt/slides/slide1.xml').async('string');
  const notesXml = await pptxZip.file('ppt/notesSlides/notesSlide1.xml').async('string');
  const pptText = decodeXml([...slideXml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)].map(m => m[1]).join(''));
  const notesText = decodeXml([...notesXml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)].map(m => m[1]).join(''));
  assert.equal(/[【】「」『』]/u.test(pptText + notesText), false, `unexpected Chinese brackets in PPTX: ${pptText} | ${notesText}`);
  assert.equal(/核心统计指标[：:]|\brho=|p=0\.0(?![0-9])/u.test(pptText + notesText), false);
  assert.ok(pptText.includes("采用 Mann-Whitney U 与 Cliff's δ 检验，按“当前居住模式”"));
  assert.ok(pptText.includes('ρ=-0.919'));
  assert.ok(pptText.includes('p < 0.0001'));
  assert.ok(notesText.includes('“调研汇总”'));
  assert.ok(notesText.includes('p < 0.0001'));
});
