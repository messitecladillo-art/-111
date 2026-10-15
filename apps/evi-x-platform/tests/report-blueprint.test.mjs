import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BLUEPRINT, blueprintNode, blueprintOutline, blueprintSections, chineseNumeral, DEFAULT_REPORT_TYPE, insertBeforeBackMatter, insertBlueprintNode, LEGACY_SECTION_IDS, matchBlueprintNode, renumberHeadings, REPORT_TYPES, reportType, stripHeadingNumber } from '../lib/report-blueprint.ts';
import { createEditorContent, EDITOR_LIMITS, parseEditorContent } from '../lib/editor-model.ts';
import { reportHeadingLevel, reportPart } from '../lib/report-format.ts';
import { newProjectReport, reportContentsEqual } from '../lib/project-report.ts';

const section = (id, title, body = '') => ({ id, title, body, source: '' });

test('blueprint nodes are unique, stay inside their chapters and are numbered from position', () => {
  const ids = BLUEPRINT.map(n => n.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const [i, node] of BLUEPRINT.entries()) {
    if (node.kind === 'section') {
      const chapter = ids.indexOf(node.chapter);
      assert.ok(chapter >= 0 && chapter < i, `${node.id} follows its chapter`);
      assert.ok(BLUEPRINT.slice(chapter + 1, i).every(n => n.kind === 'section' && n.chapter === node.chapter), `${node.id} stays inside its chapter`);
      if (blueprintNode(node.chapter).optional) assert.ok(node.optional, `${node.id} is optional with its chapter`);
    }
    assert.ok(node.purpose.length > 4, node.id);
    assert.ok(node.kind === 'chapter' || node.moves.length > 0, `${node.id} has writing moves`);
  }
  assert.deepEqual([1, 2, 9, 10, 11, 19, 20, 21, 99].map(chineseNumeral), ['一', '二', '九', '十', '十一', '十九', '二十', '二十一', '九十九']);
  const core = blueprintOutline({ includeOptional: false }).map(x => x.title);
  for (const title of ['摘要', '一、研究项目简介', '二、调查方案设计与实施', '（五）抽样设计', '参考文献', '附录1 调查问卷']) assert.ok(core.includes(title), title);
  const full = blueprintOutline({ includeOptional: true }).map(x => x.title);
  assert.ok(full.includes('二、网络文本与二手资料分析') && full.includes('三、调查方案设计与实施'), 'optional chapters shift later numbers');
  assert.equal(full.length, BLUEPRINT.length);
});

test('the skeleton is a valid report whose parts, heading levels and titles round-trip', () => {
  for (const includeOptional of [false, true]) {
    const sections = blueprintSections({ includeOptional });
    assert.ok(sections.length <= EDITOR_LIMITS.sections);
    const content = { ...createEditorContent(), report: sections };
    assert.deepEqual(parseEditorContent(content), content);
    for (const { node, title } of blueprintOutline({ includeOptional })) {
      const expected = node.kind === 'abstract' || node.kind === 'references' || node.kind === 'appendix' ? node.kind : 'body';
      assert.equal(reportPart(title), expected, title);
      if (node.kind === 'chapter') assert.equal(reportHeadingLevel(title), 1, title);
      if (node.kind === 'section') assert.equal(reportHeadingLevel(title), 2, title);
      assert.equal(matchBlueprintNode(title)?.id, node.id, `${title} is recognised as ${node.id}`);
    }
    // Guidance is shown beside the section while writing and never stored in the body.
    for (const s of sections) assert.equal(s.body, '', s.title);
  }
  assert.equal(blueprintSections({ includeOptional: false }).length, blueprintSections().length, 'no modules chosen means the default report type');
});

test('report types are starting combinations of analysis modules, not one fixed outline', () => {
  const frame = BLUEPRINT.filter(n => !n.optional).map(n => n.id);
  for (const id of ['abstract', 'intro', 'design', 'design.sampling', 'data', 'sample', 'conclusion', 'references']) assert.ok(frame.includes(id), `${id} belongs to every report`);
  // No analysis module is part of the frame: which ones a report needs depends on its research questions.
  for (const id of ['compare', 'drivers', 'segments', 'demand', 'diagnosis', 'plan', 'secondary']) assert.ok(blueprintNode(id).optional, id);
  const outlines = new Map(REPORT_TYPES.map(type => [type.id, blueprintSections({ nodes: type.nodes }).map(s => s.title).join('|')]));
  assert.equal(new Set(outlines.values()).size, REPORT_TYPES.length, 'every type gives a different outline');
  for (const type of REPORT_TYPES) {
    for (const id of type.nodes) assert.ok(blueprintNode(id).optional, `${type.id}: ${id} is a module`);
    const sections = blueprintSections({ nodes: type.nodes });
    assert.deepEqual(parseEditorContent({ ...createEditorContent(), report: sections }).report, sections);
    assert.ok(type.summary.length > 10 && type.label.length > 1);
  }
  assert.ok(!blueprintSections().some(s => /回归模型|满意度与绩效评价|人群画像|方案优先级/.test(s.title)), 'the default asks for no particular model');
  assert.equal(reportType(DEFAULT_REPORT_TYPE).id, 'status');
  const demand = blueprintSections({ nodes: reportType('demand').nodes }).map(s => s.title);
  assert.ok(demand.includes('五、需求与意愿分析') && demand.includes('七、人群细分与画像') && !demand.some(t => /评价与问题诊断/.test(t)));
  // A section brings its chapter even when only the section was asked for.
  assert.ok(blueprintSections({ nodes: ['drivers.model'] }).some(s => s.id === 'bp-drivers'));
  assert.throws(() => reportType('exemplar'), /没有这种报告类型/);
  // Earlier skeletons' section IDs point at the sections that took them over.
  const ids = new Set(blueprintSections({ includeOptional: true }).map(s => s.id));
  for (const [from, to] of Object.entries(LEGACY_SECTION_IDS)) { assert.ok(!ids.has(from), from); assert.ok(ids.has(to), to); }
});

test('new project reports are deterministic, so an untouched draft is not dirty', () => {
  const a = newProjectReport('测试项目'), b = newProjectReport('测试项目');
  assert.ok(reportContentsEqual(a, b));
  assert.deepEqual(parseEditorContent(a), a);
  assert.equal(a.report[0].title, '摘要');
  assert.ok(a.report.some(s => s.title === '参考文献'));
});

test('outline numbers are stripped without eating digits that belong to the title', () => {
  assert.equal(stripHeadingNumber('（五）抽样设计'), '抽样设计');
  assert.equal(stripHeadingNumber('一、绪论'), '绪论');
  assert.equal(stripHeadingNumber('3.2 样本量与抽样'), '样本量与抽样');
  assert.equal(stripHeadingNumber('1. 研究背景'), '研究背景');
  assert.equal(stripHeadingNumber('（3）检验结果'), '检验结果');
  assert.equal(stripHeadingNumber('附录 3：访谈记录'), '访谈记录');
  assert.equal(stripHeadingNumber('5G 用户满意度'), '5G 用户满意度');
});

test('titles written in the author\'s own words still map to blueprint sections', () => {
  const cases = [
    ['一、绪论', 'intro'], ['研究背景', 'intro.background'], ['（五）抽样方案设计', 'design.sampling'], ['3.2 样本量与抽样', 'design.sampling'],
    ['（三）基于 K-means 的人群细分', 'segments.cluster'], ['（四）多分类 Logistic 回归', 'drivers.model'], ['（一）IPA 分析', 'diagnosis.evaluation'],
    ['5G 用户满意度评价', 'diagnosis.evaluation'], ['六、结论与建议', 'conclusion'], ['（二）对策与建议', 'conclusion.suggestions'],
    ['附录 3：访谈记录', 'appendix.interviews'], ['附录5 Python 代码', 'appendix.code'], ['参考文献', 'references'], ['摘要', 'abstract'], ['我们的发现', null],
  ];
  for (const [title, id] of cases) assert.equal(matchBlueprintNode(title)?.id ?? null, id, title);
});

test('inserting a missing section follows blueprint order, brings its chapter and renumbers prefixes', () => {
  const content = { ...createEditorContent(), report: [
    section('a', '摘要', '概要'), section('c1', '一、研究项目简介'), section('c1s1', '（一）研究背景', '背景'),
    section('c2', '二、调查方案设计与实施'), section('c2s1', '（一）调查目的', '目的'), section('c2s2', '（二）质量控制', '质控'),
    section('c3', '三、结论与建议'), section('r', '参考文献', '[1] 文献'), section('ap', '附录1 调查问卷', '问卷'),
  ] };
  const sampling = insertBlueprintNode(content, 'design.sampling');
  assert.deepEqual(sampling.inserted, ['bp-design.sampling']);
  assert.deepEqual(sampling.content.report.map(s => s.title),
    ['摘要', '一、研究项目简介', '（一）研究背景', '二、调查方案设计与实施', '（一）调查目的', '（二）抽样设计', '（三）质量控制', '三、结论与建议', '参考文献', '附录1 调查问卷']);
  assert.equal(sampling.renumbered, 1, 'only 质量控制 changed number');
  const data = insertBlueprintNode(sampling.content, 'data.pilot');
  assert.deepEqual(data.inserted, ['bp-data', 'bp-data.pilot']);
  assert.deepEqual(data.content.report.slice(6, 10).map(s => s.title), ['（三）质量控制', '三、调查数据处理及检验', '（一）预调查', '四、结论与建议']);
  assert.equal(data.renumbered, 1);
  const ai = insertBlueprintNode(data.content, 'appendix.ai');
  assert.equal(ai.content.report.at(-1).title, '附录2 人工智能工具使用说明');
  assert.deepEqual(insertBlueprintNode(ai.content, 'design.sampling').inserted, [], 'present sections are not inserted twice');
  assert.doesNotThrow(() => parseEditorContent(ai.content));
  assert.deepEqual(content.report.map(s => s.id), ['a', 'c1', 'c1s1', 'c2', 'c2s1', 'c2s2', 'c3', 'r', 'ap'], 'input is not mutated');
  const renamed = { ...ai.content, report: ai.content.report.map(s => s.id === 'bp-design.sampling' ? { ...s, title: '（二）样本从哪里来' } : s) };
  const again = insertBlueprintNode(renamed, 'design.sampling');
  assert.deepEqual(again.inserted, ['bp-design.sampling-2'], 'a free ID is chosen when the derived one is taken');
});

test('new body sections go before the back matter, and renumbering leaves free-form titles alone', () => {
  const report = [section('b', '一、正文'), section('r', '参考文献'), section('x', '附录1 问卷')];
  assert.deepEqual(insertBeforeBackMatter(report, section('n', '新章节')).map(s => s.id), ['b', 'n', 'r', 'x']);
  assert.deepEqual(insertBeforeBackMatter(report.slice(0, 1), section('n', '新章节')).map(s => s.id), ['b', 'n']);
  const { report: renumbered, changed } = renumberHeadings([
    section('1', '三、背景'), section('2', '（五）细节'), section('3', '我的小结'), section('4', '一、方法'), section('5', '（一）抽样'),
    section('6', '附录三：问卷'), section('7', '附录 9 代码'),
  ]);
  assert.deepEqual(renumbered.map(s => s.title), ['一、背景', '（一）细节', '我的小结', '二、方法', '（一）抽样', '附录一：问卷', '附录 2 代码']);
  assert.equal(changed, 5);
});
