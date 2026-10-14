import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import sharp from 'sharp';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { buildDocx } from '../lib/editor-export.ts';
import { parseSurveyCsv } from '../lib/survey-analysis.ts';
import { runRecipe } from '../lib/analysis-recipes.ts';
import { parseResultSnapshot, resultPayload, digestText, snapshotRecipe } from '../lib/research-quality.ts';
import { blueprintSections, matchBlueprintNode } from '../lib/report-blueprint.ts';
import { danglingReferences, reportLabels, resolveReferences } from '../lib/report-numbering.ts';
import { methodIntro, readingParagraph, resultCaption, variableLabel } from '../lib/report-templates.ts';
import { defaultColumn, placeResult, sectionForNode, suggestedExhibits, suggestedNode } from '../lib/report-placement.ts';
import { splitInlineMath } from '../lib/inline-math.ts';
import { seededRandom } from '../lib/sampling-core.ts';
import { texProblem, texToOmml } from '../lib/omml.ts';

const renderSvg = async svg => new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
// Seeded teaching-simulation data: no real respondents.
const random = seededRandom('report-templates-test');
const draw = (items, weights) => { let u = random() * weights.reduce((a, b) => a + b, 0); for (let i = 0; i < items.length; i++) { u -= weights[i]; if (u <= 0) return items[i]; } return items.at(-1); };
const rows = Array.from({ length: 120 }, (_, i) => {
  const age = ['18–24岁', '25–34岁', '35–49岁'][i % 3], kind = draw(['健身路径', '篮球场', '羽毛球馆', '其他'], [40, 25, 25, 10]);
  const score = Math.min(5, Math.max(1, Math.round(3 + (kind === '羽毛球馆' ? 0.6 : 0) + (random() - 0.5) * 3))), walk = 5 + Math.round(random() * 30);
  return [String(i + 1), i % 2 ? '男' : '女', age, draw(['从不', '偶尔', '经常'], age === '18–24岁' ? [2, 4, 6] : [4, 4, 3]), kind, ['非常不满意', '不满意', '一般', '满意', '非常满意'][score - 1], String(score), String(walk), String(40 + walk * 3 + Math.round(random() * 20))];
});
const table = parseSurveyCsv([['编号', 'Q1. 您的性别（单选）', '年龄组', '使用频次', '常用设施', '满意度', '满意度得分', '步行时间（分钟）', '每月花费'].join(','), ...rows.map(r => r.join(','))].join('\n'));
const source = { sourceName: '教学模拟数据', sourceUrl: '', sourceHash: 'c'.repeat(64), classification: 'simulated' };
const snap = (id, method, x, y = null) => snapshotRecipe(runRecipe(table, { id, method, x, y, question: `问题${id}` }, []), { ...source, title: `问题${id}`, variables: [x, y].filter(c => c !== null).map(c => table.headers[c]) }, id);
const r = {
  gender: await snap('gender', 'frequency', 1), sat: await snap('sat', 'frequency', 5), age: await snap('age', 'frequency', 2), kind: await snap('kind', 'frequency', 4),
  cross: await snap('cross', 'crosstab', 2, 3), groups: await snap('groups', 'groups', 4, 6), two: await snap('two', 'groups', 1, 6),
  walk: await snap('walk', 'numeric', 7), corr: await snap('corr', 'pearson', 7, 8), rho: await snap('rho', 'spearman', 7, 6),
};
const mathOf = text => splitInlineMath(text).filter(p => p.math).map(p => p.text);

test('variables travel with a result, and results registered without them keep their fingerprints', async () => {
  assert.deepEqual(r.cross.variables, ['年龄组', '使用频次']);
  assert.deepEqual(parseResultSnapshot(r.cross).variables, ['年龄组', '使用频次']);
  const { variables, ...old } = r.cross;
  const legacy = { ...old, resultHash: await digestText(JSON.stringify(resultPayload({ ...old, resultHash: '' }))) };
  assert.equal(parseResultSnapshot(legacy).variables, undefined);
  assert.equal(await digestText(JSON.stringify(resultPayload(parseResultSnapshot(legacy)))), legacy.resultHash, 'old snapshots hash exactly as before');
  assert.throws(() => parseResultSnapshot({ ...r.cross, variables: ['a', 'b', 'c', 'd', 'e'] }));
  assert.throws(() => parseResultSnapshot({ ...r.cross, variables: [''] }));
  void variables;
});

test('question labels become variable names and captions in report style', () => {
  assert.equal(variableLabel('Q1. 您的性别（单选）'), '性别');
  assert.equal(variableLabel('3、您每周使用几次？'), '您每周使用几次');
  assert.equal(variableLabel('第5题：月收入'), '月收入');
  assert.equal(variableLabel('2023年收入'), '2023年收入', 'a year is not a question number');
  assert.equal(resultCaption(r.gender), '受访者性别分布');
  assert.equal(resultCaption(r.cross), '不同年龄组受访者的使用频次分布');
  assert.equal(resultCaption(r.groups), '不同常用设施受访者的满意度得分比较');
  assert.equal(resultCaption(r.walk), '步行时间（分钟）的分布');
  assert.equal(resultCaption(r.corr), '步行时间（分钟）与每月花费的相关分析');
  assert.equal(resultCaption({ ...r.gender, variables: undefined }), '问题gender', 'without variables the registered title is used');
});

test('reading paragraphs state the pattern and the full test, with symbols as formulas and no causal claims', () => {
  const all = Object.values(r).map(x => readingParagraph(x, { figure: 'f', table: 't' }));
  for (const text of all) {
    assert.doesNotMatch(text, /NaN|undefined|null|Infinity/);
    assert.doesNotMatch(text, /导致|造成了|决定了|促使/, 'association is never written as causation');
    for (const tex of mathOf(text)) assert.equal(texProblem(tex), null, `inline formula ${tex} must typeset`);
  }
  const freq = readingParagraph(r.kind, { figure: 'f' });
  assert.match(freq, /^由\[\[图:f\]\]可知，在 120 名有效受访者中，就常用设施而言，/);
  assert.match(freq, /95% 置信区间为 \d+\.\d%～\d+\.\d%/);
  assert.match(freq, /“其他”/, 'every answer named is a registered category');
  const sat = readingParagraph(r.sat, {});
  assert.match(sat, /选择“非常满意”或“满意”的合计占 \d+\.\d%，选择(?:“非常不满意”或)?“不满意”的(?:合计)?占 \d+\.\d%；单项中“[^”]+”最多/);
  assert.match(readingParagraph(r.age, {}), /18–24岁占 33\.3%，25–34岁占 33\.3%，35–49岁占 33\.3%/);
  const cross = readingParagraph(r.cross, { figure: 'f', table: 't' });
  assert.match(cross, /^由\[\[图:f\]\]和\[\[表:t\]\]可知，/);
  const chi = r.cross.metrics.find(m => m.label === 'Pearson χ²').value, df = r.cross.metrics.find(m => m.label === '自由度').value;
  assert.ok(cross.includes(`$\\chi^2(${df})=${chi.toFixed(2)}$`), cross);
  assert.match(cross, /Cramér \$V=0\.\d{3}\$/);
  assert.match(cross, /在 0\.05 的显著性水平下|未达到 0\.05 的显著性水平/);
  const groups = readingParagraph(r.groups, { figure: 'f' });
  const f = r.groups.metrics.find(m => m.label === 'Welch F').value;
  assert.ok(groups.includes(`=${f.toFixed(2)}$`) && /\$F\(3,\\,\d+\.\d{2}\)=/.test(groups), groups);
  assert.match(groups, /\$\\eta\^2=0\.\d{3}\$，效应量/);
  assert.match(readingParagraph(r.two, {}), /Welch \$t\$ 检验结果为 \$t\(\d+\.\d{2}\)=\d+\.\d{2}\$，\$p[<=]0\.\d{3}\$，Hedges \$g=\d+\.\d{2}\$/);
  const legacy = { ...r.groups, metrics: r.groups.metrics.filter(m => !['Welch F', '分子自由度', '分母自由度'].includes(m.label)) };
  assert.match(readingParagraph(legacy, {}), /Welch 方差分析结果为 \$p[<=]/, 'results registered before statistics were stored still read correctly');
  assert.match(readingParagraph(r.walk, {}), /均值为 \d+\.\d{2}，标准差为 \d+\.\d{2}（均值的 95% 置信区间为 [\d.]+～[\d.]+）；中位数为 \d+/);
  const corr = readingParagraph(r.corr, {});
  assert.match(corr, /Pearson 相关系数为 \$r=0\.\d{3}\$（95% 置信区间为/);
  assert.match(corr, /呈较强的正相关。相关系数只描述关联，不能据此推断因果。$/);
  assert.match(readingParagraph(r.rho, {}), /Spearman 秩相关系数为 \$\\rho=-?0\.\d{3}\$/);
});

test('alpha and screening paragraphs judge the measures by their usual thresholds', () => {
  const alpha = { ...r.kind, method: 'alpha', variables: ['满意度'], headers: ['题项', '反向计分', '均值', '样本标准差', '校正题总相关', '删除后 α'],
    rows: [['设施', '否', 3.2, 0.9, 0.62, 0.71], ['环境', '是', 3.4, 0.8, 0.21, 0.83], ['服务', '否', 3.1, 1.0, 0.55, 0.74]], metrics: [{ label: 'Cronbach α', value: 0.78 }, { label: '题项数', value: 3 }] };
  const text = readingParagraph(alpha, { table: 't' });
  assert.match(text, /^由\[\[表:t\]\]可知，满意度量表共 3 个题项（其中 1 个反向计分），Cronbach's \$\\alpha\$ 系数为 0\.780，内部一致性可以接受/);
  assert.match(text, /“环境”低于 0\.3/);
  assert.match(text, /删除“环境”后 \$\\alpha\$ 系数将升至 0\.830/);
  const qc = { ...r.kind, method: 'quality-control', n: 400, total: 432, headers: ['规则', '判定标准', '标记份数', '处理'], rows: [['注意力题未通过', '第 12 题未选“比较同意”', 20, '剔除'], ['作答过快', '用时少于 90 秒', 15, '剔除'], ['重复作答', '同一设备', 0, '剔除']], metrics: [] };
  assert.equal(readingParagraph(qc, { table: 't' }), '本次调查共回收问卷 432 份。按[[表:t]]规则逐份筛查：注意力题未通过 20 份，作答过快 15 份（同一份问卷可能触发多条规则）。剔除后得到有效问卷 400 份，问卷有效率为 92.6%。');
});

test('method paragraphs carry formulas that typeset in the preview and in Word', () => {
  for (const x of Object.values(r)) {
    const intro = methodIntro(x);
    if (!intro) { assert.ok(['frequency', 'numeric'].includes(x.method), `${x.method} needs a method paragraph`); continue; }
    for (const tex of intro.formulas) { assert.equal(texProblem(tex), null); assert.match(texToOmml(tex, true), /^<m:oMath>/); }
    for (const tex of [...mathOf(intro.text), ...mathOf(intro.where)]) assert.equal(texProblem(tex), null, tex);
    assert.match(intro.where, /^式中，/);
  }
  assert.match(methodIntro(r.two).text, /Welch \$t\$ 检验/, 'two groups use the t test');
  assert.match(methodIntro(r.groups).text, /Welch 方差分析/);
});

test('a result goes to its blueprint section with one exhibit and a reading paragraph that cites it', () => {
  assert.equal(suggestedNode(r.gender), 'sample.profile', 'demographics describe the sample');
  assert.equal(suggestedNode(r.kind), 'sample.descriptive');
  assert.equal(suggestedNode(r.cross), 'drivers.tests');
  assert.deepEqual(suggestedExhibits(r.corr), [], 'a single coefficient is reported in the text');
  assert.equal(defaultColumn(r.cross), 3);
  const base = { ...createEditorContent(), version: 2, report: blueprintSections({ includeOptional: false }), quality: { version: 1, results: Object.values(r), findings: [] } };
  const placed = placeResult(parseEditorContent(base), 'cross');
  assert.deepEqual(placed.created, [], 'the blueprint report already has the section');
  const section = placed.content.report.find(s => s.id === placed.sectionId);
  assert.equal(matchBlueprintNode(section.title).id, 'drivers.tests');
  assert.deepEqual(section.blocks.map(b => b.kind), ['paragraph', 'formula', 'formula', 'paragraph', 'chart', 'paragraph']);
  const chart = section.blocks.find(b => b.kind === 'chart');
  assert.equal(chart.text, '不同年龄组受访者的使用频次分布');
  assert.equal(chart.valueColumn, 3);
  assert.ok(section.blocks.at(-1).text.startsWith(`由[[图:${chart.id}]]可知`));
  assert.deepEqual(danglingReferences(placed.content), []);
  const labels = reportLabels(placed.content.report);
  assert.match(resolveReferences(section.blocks.at(-1).text, labels, '测试'), /^由图 \d+-1可知/);
  const again = placeResult(placed.content, 'cross', { exhibits: ['table'] });
  const added = again.blocks;
  assert.deepEqual(added.map(b => b.kind), ['table', 'paragraph'], 'the method paragraph and formulas appear once per report');
  assert.ok(added[1].text.startsWith(`由[[表:${added[0].id}]]可知`));
  assert.deepEqual(placeResult(placed.content, 'corr', { exhibits: [] }).blocks.map(b => b.kind), ['paragraph', 'formula', 'paragraph', 'paragraph']);
});

test('a legacy report gains the blueprint chapter and section before its back matter', () => {
  const legacy = { ...createEditorContent(), version: 2, quality: { version: 1, results: [r.kind], findings: [] } };
  const placed = placeResult(parseEditorContent(legacy), 'kind');
  assert.equal(placed.created.length, 2, 'chapter and section');
  const titles = placed.content.report.map(s => s.title);
  const at = titles.findIndex(t => /描述性统计分析/.test(t));
  assert.ok(at > 0 && at < titles.findIndex(t => /参考文献/.test(t)));
  assert.equal(sectionForNode(placed.content, 'sample.descriptive').id, placed.sectionId);
  assert.throws(() => placeResult(parseEditorContent(legacy), 'kind', { sectionId: 'gone' }), /目标章节不存在/);
  const chosen = placeResult(parseEditorContent(legacy), 'kind', { sectionId: 'section-3' });
  assert.equal(chosen.sectionId, 'section-3');
  const full = structuredClone(legacy);
  full.report[2].blocks = Array.from({ length: 59 }, (_, i) => ({ id: `p${i}`, kind: 'paragraph', text: '段落', evidenceId: '', valueColumn: 1 }));
  assert.throws(() => placeResult(parseEditorContent(full), 'kind', { sectionId: 'section-3' }), /超过 60 个/);
});

test('placed results export to Word with their method formulas, figure and resolved citations', async () => {
  let content = parseEditorContent({ ...createEditorContent(), version: 2, report: blueprintSections({ includeOptional: false }), quality: { version: 1, results: Object.values(r), findings: [] } });
  for (const id of ['gender', 'kind', 'cross', 'groups', 'walk']) content = placeResult(content, id).content;
  const zip = await JSZip.loadAsync(await (await buildDocx(content, undefined, renderSvg)).arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  assert.ok((xml.match(/<m:oMathPara>/g) ?? []).length >= 3, 'χ², V and Welch F are display equations');
  assert.match(xml, /由图 \d+-\d+可知/);
  assert.doesNotMatch(xml, /\[\[|§§OMML/);
  assert.equal(Object.keys(zip.files).filter(name => /^word\/media\/.*\.svg$/.test(name)).length, 5, 'one figure per result');
});
