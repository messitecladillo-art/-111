import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import sharp from 'sharp';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { buildDocx, buildPptx } from '../lib/editor-export.ts';
import { makeSlideObject, snapshotRecipe } from '../lib/research-quality.ts';
import { qualityResult } from '../lib/data-quality.ts';
import { blueprintSections, matchBlueprintNode } from '../lib/report-blueprint.ts';
import { placeResult } from '../lib/report-placement.ts';
import { presentResult, sourceLine, tableSpans } from '../lib/report-tables.ts';
import { readingParagraph } from '../lib/report-templates.ts';
import { applyReportInsert, frameGroup, insertSummary, sampleSizeInsert, samplingDesignInsert } from '../lib/report-insert.ts';
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
  assert.match(xml, /资料来源：本研究抽样设计。/);
  assert.doesNotMatch(xml, /有效样本 n = 0/);
});
