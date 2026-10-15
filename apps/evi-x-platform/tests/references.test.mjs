import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { buildDocx } from '../lib/editor-export.ts';
import { generateLatexBody } from '../lib/latex-report.ts';
import { DEFAULT_REPORT_SETTINGS } from '../lib/report-format.ts';
import { buildStoryboard } from '../lib/report-storyboard.ts';
import { danglingReferences, referenceSegments, reportLabels } from '../lib/report-numbering.ts';
import { benchmarkReport } from '../lib/report-benchmark.ts';
import { citationLabel, citationSegments, citationToken, emptyReference, formatReference, importReferenceLines, missingFields, parseReferences, referenceNumbers, referenceProblems } from '../lib/references.ts';

// Bibliographic records written for the tests; the standard and the textbook are real publications cited by their metadata.
const entry = (type, fields) => ({ ...emptyReference(type), ...fields });
const J = entry('J', { id: 'j', authors: ['张三', '李四'], title: '城市社区体育设施使用研究', source: '体育科学', year: '2023', volume: '43', issue: '5', pages: '12-20' });
const M = entry('M', { id: 'm', authors: ['金勇进', '杜子芳', '蒋妍'], title: '抽样技术', edition: '4版', place: '北京', publisher: '中国人民大学出版社', year: '2015' });
const S = entry('S', { id: 's', authors: ['全国信息与文献标准化技术委员会'], title: '信息与文献 参考文献著录规则', number: 'GB/T 7714—2015', place: '北京', publisher: '中国标准出版社', year: '2015' });
const E = entry('EB/OL', { id: 'e', authors: ['某市体育局'], title: '全民健身设施建设情况通报', date: '2024-02-29', accessed: '2024-10-01', url: 'https://example.org/notice' });
const many = entry('J', { id: 'x', authors: ['SMITH J', 'DOE A', 'LEE K', 'WANG L'], title: 'Use of public sports facilities', source: 'Journal of Leisure Research', year: '2022', volume: '54', issue: '2', pages: '101-118', doi: '10.1000/xyz' });

test('entries print in GB/T 7714—2015 form for each type', () => {
  assert.equal(formatReference(J), '张三, 李四. 城市社区体育设施使用研究[J]. 体育科学, 2023, 43(5): 12-20.');
  assert.equal(formatReference(M), '金勇进, 杜子芳, 蒋妍. 抽样技术[M]. 4版. 北京: 中国人民大学出版社, 2015.');
  assert.equal(formatReference(S), '全国信息与文献标准化技术委员会. 信息与文献 参考文献著录规则: GB/T 7714—2015[S]. 北京: 中国标准出版社, 2015.');
  assert.equal(formatReference(E), '某市体育局. 全民健身设施建设情况通报[EB/OL]. (2024-02-29)[2024-10-01]. https://example.org/notice.');
  assert.equal(formatReference(many), 'SMITH J, DOE A, LEE K, et al. Use of public sports facilities[J]. Journal of Leisure Research, 2022, 54(2): 101-118. DOI: 10.1000/xyz.');
  assert.ok(formatReference({ ...J, authors: ['甲', '乙', '丙', '丁'] }).startsWith('甲, 乙, 丙, 等. 城市'), 'four authors print as three and 等');
  assert.equal(formatReference(entry('D', { authors: ['王五'], title: '居民体育参与研究', place: '上海', publisher: '某大学', year: '2021' })), '王五. 居民体育参与研究[D]. 上海: 某大学, 2021.');
  assert.equal(formatReference(entry('N', { authors: ['赵六'], title: '社区健身点增至三百个', source: '某市日报', date: '2024-03-01', pages: '05' })), '赵六. 社区健身点增至三百个[N]. 某市日报, 2024-03-01(05).');
  assert.equal(formatReference(entry('other', { text: '某作者. 某题名[R]. 某机构, 2020.' })), '某作者. 某题名[R]. 某机构, 2020.');
  assert.deepEqual(missingFields(entry('J', { title: '只有题名' })), ['责任者', '刊名或文集名', '年份']);
  // Blank items drop out with their punctuation while a record is being filled in.
  assert.equal(formatReference(entry('J', { title: '只有题名' })), '只有题名[J].');
  assert.equal(formatReference(entry('M', { authors: ['甲'], title: '书名', publisher: '某出版社' })), '甲. 书名[M]. 某出版社.');
  assert.equal(formatReference(entry('EB/OL', { title: '网页', url: 'https://example.org' })), '网页[EB/OL]. https://example.org.');
  for (const type of ['J', 'M', 'D', 'C', 'R', 'N', 'S', 'EB/OL']) assert.doesNotMatch(formatReference(entry(type, { title: '题名' })), /,\s*[,.:]|:\s*[,.:]|\.\s*\./, type);
  // Partly filled records: whatever subset is present, no doubled separators.
  const partial = [
    entry('J', { title: '题名', source: '刊名', volume: '43', issue: '5', pages: '12-20' }), entry('J', { title: '题名', pages: '12-20' }), entry('J', { title: '题名', year: '2023', pages: '12-20' }),
    entry('M', { title: '书名', publisher: '出版社', pages: '12' }), entry('M', { title: '书名', place: '北京', year: '2015', pages: '12' }), entry('C', { title: '题名', source: '文集', pages: '3-9' }),
  ];
  for (const e of partial) assert.doesNotMatch(formatReference(e), /,\s*[,.:]|:\s*[,.:]|\.\s*\./, formatReference(e));
  assert.equal(formatReference(partial[0]), '题名[J]. 刊名, 43(5): 12-20.', 'pages follow 卷(期) with a colon even before the year is known');
  assert.equal(formatReference(partial[2]), '题名[J]. 2023: 12-20.');
  assert.equal(formatReference(partial[4]), '书名[M]. 北京, 2015: 12.');
  assert.deepEqual(referenceProblems({ ...E, url: 'example.org', accessed: '2024年10月1日' }), ['链接须以 http:// 或 https:// 开头且不含空格', '日期写作 YYYY-MM-DD']);
});

test('the parser keeps structure strict and content lenient, so half-typed links never block saving', () => {
  assert.deepEqual(parseReferences([J, M]), [J, M]);
  assert.equal(parseReferences([{ ...E, url: 'htt' }])[0].url, 'htt', 'a link being typed is kept, and flagged by referenceProblems');
  assert.throws(() => parseReferences([{ ...J, extra: 1 }]), /未知或非法字段/);
  assert.throws(() => parseReferences([Object.assign(Object.create({ inherited: 1 }), J)]), /未知或非法字段/);
  assert.throws(() => parseReferences([{ ...J, type: 'toString' }]), /类型不受支持/);
  assert.throws(() => parseReferences([J, { ...M, id: 'j' }]), /标识重复/);
  assert.throws(() => parseReferences([{ ...J, title: '第一行\n第二行' }]), /单行文本/);
  assert.throws(() => parseReferences(Array.from({ length: 201 }, (_, i) => ({ ...J, id: `r${i}` }))), /最多 200 条/);
  const { id, ...rest } = J;
  assert.throws(() => parseReferences([rest]), /字段不完整/);
  void id;
  assert.deepEqual(importReferenceLines('[1] 甲. 题名[J]. 刊, 2020.\n\n［2］乙.\t书名[M]. 北京: 出版社, 2019.').map(e => [e.type, e.text]), [['other', '甲. 题名[J]. 刊, 2020.'], ['other', '乙. 书名[M]. 北京: 出版社, 2019.']]);
  assert.doesNotThrow(() => parseReferences(importReferenceLines('甲\t乙.')), 'tabs never make an imported entry invalid');
  // Nothing is cut: an over-long line or a list beyond the limit refuses the whole import.
  assert.throws(() => importReferenceLines('甲'.repeat(1001)), /第 1 条超过 1000 字/);
  assert.throws(() => importReferenceLines(Array.from({ length: 200 }, (_, i) => `[${i + 1}] 条目${i}`).join('\n'), 1), /转换后将有 201 条文献/);
  assert.equal(importReferenceLines(Array.from({ length: 199 }, (_, i) => `条目${i}`).join('\n'), 1).length, 199);
});

test('numbers follow the first citation; marks merge, ranges collapse, unknown entries are flagged', () => {
  assert.equal(citationLabel([3, 1, 2]), '[1-3]');
  assert.equal(citationLabel([1, 2]), '[1,2]');
  assert.equal(citationLabel([1, 3, 5, 6, 7]), '[1,3,5-7]');
  const content = { ...createEditorContent(), references: [J, M, S, E], report: [
    { id: 'a', title: '一、背景', body: `设施研究较多${citationToken('m')}${citationToken('j')}。`, source: '' },
    { id: 'b', title: '二、方法', body: `著录依据${citationToken('s')}，并参考${citationToken('j')}。`, source: '' },
    { id: 'r', title: '参考文献', body: '', source: '' },
  ] };
  const { numbers, order, uncited } = referenceNumbers(content);
  assert.deepEqual(order.map(e => e.id), ['m', 'j', 's', 'e']);
  assert.deepEqual([...numbers.entries()], [['m', 1], ['j', 2], ['s', 3], ['e', 4]]);
  assert.deepEqual(uncited.map(e => e.id), ['e'], 'never cited, listed last');
  assert.deepEqual(citationSegments(content.report[0].body, numbers), [{ text: '设施研究较多' }, { text: '[1,2]', cite: true }, { text: '。' }]);
  assert.ok(citationSegments(`见${citationToken('gone')}`, numbers).some(s => s.missing));
  assert.deepEqual(referenceSegments(content.report[1].body, reportLabels(content.report), numbers).filter(s => s.cite).map(s => s.text), ['[3]', '[2]']);
  assert.deepEqual(danglingReferences({ ...content, report: [...content.report, { id: 'c', title: '三、讨论', body: `见${citationToken('gone')}`, source: '' }] }).map(d => d.sectionId), ['c']);
});

const cited = () => parseEditorContent({ ...createEditorContent(), version: 2, references: [J, M, E], report: [
  { id: 'a', title: '一、背景', body: `设施研究较多${citationToken('m')}${citationToken('j')}，近期统计亦有通报${citationToken('e')}。`, source: '' },
  { id: 'r', title: '参考文献', body: '', source: '' },
] });

test('Word sets citations as superscripts and prints the list in citation order with hanging indents', async () => {
  const zip = await JSZip.loadAsync(await (await buildDocx(cited())).arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /<w:vertAlign w:val="superscript"\/><\/w:rPr><w:t xml:space="preserve">\[1,2\]<\/w:t>/);
  assert.match(xml, /<w:t xml:space="preserve">\[3\]<\/w:t>/);
  const list = xml.split('</w:p>').filter(p => p.includes('w:val="ReportReferenceItem"')).map(p => p.replace(/<[^>]+>/g, ''));
  assert.deepEqual(list.map(l => l.slice(0, 3)), ['[1]', '[2]', '[3]']);
  assert.match(list[0], /金勇进, 杜子芳, 蒋妍\. 抽样技术\[M\]/);
  assert.doesNotMatch(xml, /\[\[引:/);
  const styles = await zip.file('word/styles.xml').async('string');
  assert.match(styles, /w:styleId="ReportReferenceItem"[\s\S]*?w:hanging="567"/);
});

test('exports stop on a hand-typed list beside structured entries, a missing section or a dangling citation', async () => {
  const typed = cited(); typed.report[1].body = '[1] 手写的文献。';
  await assert.rejects(buildDocx(typed), /仍有手写条目/);
  const noSection = cited(); noSection.report = noSection.report.slice(0, 1);
  await assert.rejects(buildDocx(noSection), /没有「参考文献」一节/);
  const dangling = cited(); dangling.references = dangling.references.filter(e => e.id !== 'j');
  await assert.rejects(buildDocx(dangling), /文献引用已失效/);
  const untitled = cited(); untitled.references = [...untitled.references, emptyReference('J')];
  await assert.rejects(buildDocx(untitled), /第 4 条参考文献尚未填写题名/);
  assert.throws(() => generateLatexBody(untitled), /尚未填写题名/);
  // An appendix-only export prints no reference list, so the main report's unfinished entry does not stop it.
  const appendixOnly = { ...untitled, reportFormat: { ...DEFAULT_REPORT_SETTINGS, options: { ...DEFAULT_REPORT_SETTINGS.options, part: 'appendix' } }, report: [...untitled.report, { id: 'ap', title: '附录1 调查问卷', body: '问卷全文。', source: '' }] };
  assert.match(generateLatexBody(appendixOnly), /问卷全文/);
});

test('LaTeX and slides print citations as numbers, never as tokens', async () => {
  const latex = generateLatexBody(cited());
  assert.match(latex, /\\textsuperscript\{\[1,2\]\}/);
  assert.match(latex, /\\hangindent=2em\\hangafter=1 \[1\]~金勇进/);
  assert.doesNotMatch(latex, /\[\[/);
  const content = cited();
  const [slide] = await buildStoryboard(content, [{ id: 'card', sectionId: 'a', job: 'problem', classification: 'user_provided', title: '研究基础', excerpt: content.report[0].body, limitation: '仅列举部分文献', implication: '说明切入点', locator: '第一章', seconds: 30 }], 'replace');
  assert.match(slide.body, /设施研究较多\[1,2\]/);
});

test('the report check reads structured references: completeness, citation coverage and a written list', () => {
  const content = cited();
  content.references = [...content.references, entry('J', { id: 'thin', title: '只有题名' })];
  const report = benchmarkReport(content);
  const check = id => report.checks.find(c => c.id === id);
  assert.match(check('referenceFormat').detail, /3 \/ 4 条文献按 GB\/T 7714 著录完整/);
  assert.match(check('citations').detail, /参考文献 4 条，正文引用了其中 3 条/);
  assert.doesNotMatch(check('unwritten').detail, /参考文献/, 'structured entries write the references section');
});
