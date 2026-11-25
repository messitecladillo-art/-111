import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorContent, parseEditorContent, applyCoverImage } from '../lib/editor-model.ts';
import { DEFAULT_REPORT_SETTINGS } from '../lib/report-format.ts';
import { digestText, resultPayload } from '../lib/research-quality.ts';
import { parseCoverImage } from '../lib/page-art.ts';
import { buildLatexSource, createLatexReport, escapeLatexParagraphText, escapeLatexText, generateLatexBody, LATEX_IMAGE_LIMITS, LATEX_INSERTS, latexColumns, latexCompileInput, latexCompileKey, latexReportHash, latexSha256 } from '../lib/latex-report.ts';

test('LaTeX is optional and old backups round trip without adding a draft', async () => {
  const original = createEditorContent();
  assert.deepEqual(parseEditorContent(JSON.parse(JSON.stringify(original))), original);
  assert.equal(Object.hasOwn(original, 'latex'), false);
  const content = { ...original, latex: await createLatexReport(original) };
  assert.deepEqual(parseEditorContent(JSON.parse(JSON.stringify(content))), content);
  for (const latex of [null, {}, { ...content.latex, version: 2 }, { ...content.latex, reportHash: 'A'.repeat(64) }, { ...content.latex, source: 'extra' }, { ...content.latex, body: 1 }]) assert.throws(() => parseEditorContent({ ...original, latex }));
});

test('UTF16 body and whole document limits both apply without truncation', async () => {
  const original = createEditorContent(), latex = await createLatexReport(original);
  assert.equal(parseEditorContent({ ...original, latex: { ...latex, body: '😀'.repeat(60000) } }).latex.body.length, 120000);
  assert.throws(() => parseEditorContent({ ...original, latex: { ...latex, body: '😀'.repeat(60000) + 'a' } }));
  const report = Array.from({ length: 70 }, (_, i) => ({ id: String(i), title: '章节', source: '', body: '中'.repeat(11000) }));
  assert.throws(() => parseEditorContent({ ...original, report, latex }), /2 MB/);
  assert.throws(() => generateLatexBody({ ...original, report }), /120,000/);
});

test('report identity is stable under JSONB key order and excludes independent slides, theme and source edits', async () => {
  const content = { ...createEditorContent(), reportFormat: structuredClone(DEFAULT_REPORT_SETTINGS) };
  const hash = await latexReportHash(content), reordered = structuredClone(content);
  reordered.report = reordered.report.map(item => Object.fromEntries(Object.entries(item).reverse()));
  reordered.reportFormat.options = Object.fromEntries(Object.entries(reordered.reportFormat.options).reverse());
  reordered.reportFormat = Object.fromEntries(Object.entries(reordered.reportFormat).reverse());
  assert.equal(await latexReportHash(reordered), hash);
  assert.equal(await latexReportHash({ ...content, slides: [], accent: 'burgundy', latex: { version: 1, body: 'custom', reportHash: 'f'.repeat(64) } }), hash);
  for (const changed of [{ ...content, title: '标题改变' }, { ...content, subtitle: '副标题改变' }, { ...content, report: content.report.toReversed() }, { ...content, report: content.report.map((s, i) => i ? s : { ...s, source: '新增来源' }) }, { ...content, reportFormat: { ...content.reportFormat, region: '湖北' } }, { ...content, reportFormat: { ...content.reportFormat, options: { ...content.reportFormat.options, numberPages: false } } }]) assert.notEqual(await latexReportHash(changed), hash);
});

test('all plain report text is escaped once, including malicious commands and Unicode', () => {
  assert.equal(escapeLatexText('\\{}$&#%_~^中文😀'), '\\textbackslash{}\\{\\}\\$\\&\\#\\%\\_\\textasciitilde{}\\textasciicircum{}中文😀');
  const content = createEditorContent();
  content.report = [{ id: 's', title: '一、A&B', body: '\\input{secret}\n50% & 变量_1\r\n中文😀', source: '\\end{document}' }];
  const before = structuredClone(content), generated = generateLatexBody(content);
  assert.deepEqual(content, before);
  assert.ok(generated.startsWith('\\section{一、A\\&B}'));
  assert.ok(generated.includes('\\textbackslash{}input\\{secret\\}\\par'));
  assert.ok(generated.includes('50\\% \\& 变量\\_1\\par\n中文😀\\par'));
  assert.ok(generated.includes('\\textbackslash{}end\\{document\\}'));
  assert.ok(!generated.includes('\\input{'));
});

test('main and appendix exports keep distinct parts and preserve chosen chapter order', () => {
  const content = { ...createEditorContent(), reportFormat: structuredClone(DEFAULT_REPORT_SETTINGS) };
  content.report = [{ id:'r',title:'参考文献',body:'reference',source:'' }, { id:'a',title:'附录一',body:'appendix',source:'' }, { id:'s',title:'摘要',body:'summary',source:'' }, { id:'b',title:'一、研究',body:'body',source:'' }];
  const main = generateLatexBody(content);
  assert.ok(main.indexOf('reference') < main.indexOf('summary'));
  assert.ok(main.indexOf('summary') < main.indexOf('body'));
  assert.ok(!main.includes('appendix'));
  content.reportFormat.options = { ...content.reportFormat.options, part:'appendix', includeCover:false, includeToc:false };
  const appendix = generateLatexBody(content);
  assert.ok(appendix.includes('appendix')); assert.ok(!appendix.includes('summary'));
  assert.throws(() => generateLatexBody({ ...content, report: content.report.filter(s=>s.id!=='a') }), /附录/);
});

// Frozen hashes generated independently by evix_api.latex.build_source (2026-11-08, Word-measured line and paragraph spacing).
const parity = [
  { input: { title:'合成研究 A&B_1', subtitle:'标签 % # $ { } \\ ^ ~', body:'\\section{摘要}\n合成结果。\\par\n\\[ \\bar{x}=\\frac{1}{n}\\sum_{i=1}^{n}x_i \\]', options:{part:'main',includeCover:true,includeToc:true,firstLineChars:2,numberPages:true} }, hash:'d313e11bc708823b3989d14e345fe0ef1eca8d577ff9915d47d2ce6896f78e79' },
  { input: { title:'附录',subtitle:'',body:'\\section{补充材料}\n\\begin{tabular}{cc}\\toprule 变量 & 数值 \\\\ \\midrule A & 12 \\\\ \\bottomrule\\end{tabular}',options:{part:'appendix',includeCover:false,includeToc:false,firstLineChars:0,numberPages:false} },hash:'a6986ba7bf889bcc49c8420a39807529ac3e580129dbb0773dc9521a70bb0893' },
  { input: { title:'CR normalization',subtitle:'',body:'% comment\r\\section{Newline}\r\nText\\par',options:{part:'appendix',includeCover:false,includeToc:false,firstLineChars:0,numberPages:false} },hash:'450e2fa667ffcd573b6e277ba4f329da1d47d043da3628c1d80682d094a03e87' },
];
test('full source matches independent backend golden fixtures byte for byte', async () => {
  for (const {input,hash} of parity) assert.equal(await latexSha256(buildLatexSource(input)),hash);
});

test('trusted layout fixes A4, Chinese body, three lines and centered columns with neutral source', () => {
  const source = buildLatexSource(parity[0].input);
  assert.ok(source.includes('a4paper')); assert.ok(source.includes('top=25.4mm,bottom=25.4mm,left=31.8mm,right=31.8mm'));
  assert.ok(source.includes('\\heavyrulewidth}{1.5bp}')); assert.ok(source.includes('\\lightrulewidth}{0.75bp}'));
  assert.ok(source.includes('\\fontsize{12bp}{15.552bp}')); assert.ok(source.includes('\\setlength{\\parskip}{6bp}')); assert.ok(source.includes('\\setcounter{secnumdepth}{-1}'));
  assert.ok(source.includes('\\DeclareCaptionFont{reportcaption}{\\fontsize{12bp}{15.552bp}\\selectfont}'));
  assert.ok(source.includes('\\fontsize{16bp}{20bp}')); assert.ok(source.includes('\\centering\\heiti\\zihao{3}\\bfseries'));
  assert.ok(!source.includes('EVI-X')); assert.ok(!source.includes('fontset=auto'));
  assert.ok(source.includes('\\pagenumbering{Roman}')); assert.ok(source.includes('\\pagenumbering{arabic}'));
  assert.ok(LATEX_INSERTS.table.includes('\\begin{tabular}{ccc}'));
  assert.equal((LATEX_INSERTS.table.match(/\\\\\n/g) || []).length,2);
  assert.deepEqual([...LATEX_INSERTS.table.matchAll(/\\(toprule|midrule|bottomrule)/g)].map(m=>m[1]),['toprule','midrule','bottomrule']);
  assert.ok(!LATEX_INSERTS.table.includes('hline')); assert.ok(!LATEX_INSERTS.table.includes('12'));
});

test('compile identity changes for title, subtitle, body and layout, independent of key insertion order', () => {
  const content = createEditorContent(); content.latex={version:1,body:'内容',reportHash:'a'.repeat(64)};
  const input=latexCompileInput(content), key=latexCompileKey(input);
  assert.equal(latexCompileKey({...input,options:Object.fromEntries(Object.entries(input.options).reverse())}),key);
  for(const change of [{...input,title:'新标题'},{...input,subtitle:'副标题'},{...input,body:'编辑'},{...input,options:{...input.options,firstLineChars:0}}]) assert.notEqual(latexCompileKey(change),key);
  assert.ok(buildLatexSource({...input,title:'A\nB\rC'}).includes('A B C\\par'));
});

test('managed source normalizes TeX newline semantics while preserving stored body', () => {
  const input = { ...parity[0].input, body: '% comment\r\\input{private}\r\n中文' };
  const source = buildLatexSource(input);
  assert.ok(source.includes('% comment\n\\input{private}\n中文'));
  assert.ok(!source.includes('\r'));
  assert.equal(input.body, '% comment\r\\input{private}\r\n中文');
});

test('generated long identifiers add optional break points while preserving every original character',()=>{
  const hash='a0123456789bcdef'.repeat(4), run='A'.repeat(33), text='数据指纹：'+hash+' / '+run;
  const escaped=escapeLatexParagraphText(text);
  assert.equal(escaped.split('\\linebreak[0]').join(''),escapeLatexText(text));
  assert.ok(escaped.includes(hash.slice(0,4)+'\\linebreak[0]'+hash.slice(4,8)));
  assert.ok(!/[A-Za-z0-9]{17,}/.test(escaped));
  assert.equal(escapeLatexParagraphText('ID123 短标识 0123456789abcdef'),'ID123 短标识 0123456789abcdef');
  assert.equal(escapeLatexParagraphText('A'.repeat(31)),'A'.repeat(31));
  assert.equal(escapeLatexParagraphText('W'.repeat(32)).split('\\linebreak[0]').join(''),'W'.repeat(32));
  assert.equal(escapeLatexParagraphText('W'.repeat(32)).split('\\linebreak[0]').length,8);
  assert.ok(buildLatexSource(parity[0].input).includes('\\setlength{\\emergencystretch}{5em}'));
});

test('wrapping happens after escaping raw chunks and cannot activate injected TeX',()=>{
  const text='\\input{'+ 'a'.repeat(64) +'}%_&$中文😀';
  const wrapped=escapeLatexParagraphText(text);
  assert.equal(wrapped.replaceAll('\\linebreak[0]',''),escapeLatexText(text));
  assert.ok(wrapped.startsWith('\\textbackslash{}input\\{'));
  assert.ok(wrapped.endsWith('\\}\\%\\_\\&\\$中文😀'));
  assert.ok(!wrapped.includes('\\input{'));
});

test('only generated paragraph and source text gains break opportunities; handwritten body remains exact',()=>{
  const content=createEditorContent(),hash='c'.repeat(64);
  content.report=[{id:'b',title:'一、研究',body:'正文 '+hash,source:'来源 '+hash},{id:'a',title:'摘要',body:'最后的摘要',source:''}];
  const generated=generateLatexBody(content);
  assert.equal(generated.split('\\linebreak[0]').join(''),'\\section{一、研究}\n正文 '+hash+'\\par\n\\textbf{来源 / 说明：} 来源 '+hash+'\\par\n\n\\section{摘要}\n最后的摘要\\par\n');
  const handwritten='\\section{自定义}\n'+hash+'\\par';
  content.latex={version:1,body:handwritten,reportHash:'a'.repeat(64)};
  assert.equal(latexCompileInput(content).body,handwritten);
  assert.ok(buildLatexSource(latexCompileInput(content)).includes(handwritten));
});

test('wrap expansion still enforces the final generated body capacity without truncation',()=>{
  const content=createEditorContent();
  content.report=Array.from({length:6},(_,i)=>({id:String(i),title:'章节',body:'A'.repeat(12000),source:''}));
  assert.throws(()=>generateLatexBody(content),/120,000/);
  assert.equal(content.report[0].body,'A'.repeat(12000));
});

test('formula blocks the platform writes export to LaTeX, Greek letters included', () => {
  const content = createEditorContent();
  content.report = [{ id: 's', title: '一、分析', body: '两组比较。', source: '', blocks: [{ id: 'f', kind: 'formula', text: '\\nu=\\frac{\\left(s_1^2/n_1+s_2^2/n_2\\right)^2}{\\frac{(s_1^2/n_1)^2}{n_1-1}+\\frac{(s_2^2/n_2)^2}{n_2-1}}', evidenceId: '', valueColumn: 1 }] }];
  const body = generateLatexBody(content);
  assert.match(body, /\\nu=/u);
  for (const letter of ['xi', 'tau', 'phi', 'psi', 'Phi']) {
    content.report[0].blocks[0].text = `\\${letter}=1`;
    assert.match(generateLatexBody(content), new RegExp(`\\\\${letter}=1`, 'u'), letter);
  }
  assert.match(generateLatexBody(content), /\\tag\{1-1\}/u, 'display formula carries its chapter equation tag');
});

test('section footnotes typeset inline math, captions align with chapter refs, abstract clears page, and KANO/Cluster col 0 >= 26mm', async () => {
  const r = {
    id: 'kano1',
    title: 'KANO 需求分类表',
    sourceName: '调查数据',
    sourceUrl: '',
    sourceHash: 'a'.repeat(64),
    resultHash: '0'.repeat(64),
    classification: 'simulated',
    method: 'crosstab',
    n: 504,
    total: 618,
    headers: ['功能属性', 'M(%)', 'O(%)', 'A(%)', 'I(%)', 'R(%)', 'Q(%)', '分类结果', 'Better', 'Worse'],
    rows: [['一键异常告警与定位共享', 49.7, 21.2, 14.5, 12.6, 1.2, 0.8, '必备属性', 0.364, -0.723]],
    metrics: [],
    warnings: ['卡方检验 $\\chi^2(6)=183.98$，决定系数 $R^2=0.568$，轮廓均值 $\\bar{s}=0.385$（$n=504$）'],
  };
  r.resultHash = await digestText(JSON.stringify(resultPayload(r)));
  const content = createEditorContent();
  content.version = 2;
  content.title = '银发「智」守：城市老年人智能健康监测调查';
  content.subtitle = '基于多阶抽样与实证建模';
  content.quality = { version: 1, results: [r], findings: [] };
  content.report = [
    { id: 'abs', title: '摘要', body: '摘要正文。', source: '' },
    { id: 'ch1', title: '一、研究背景', body: '背景参见 [[表:tb1]] 与 [[式:eq1]]。', source: '', blocks: [
      { id: 'eq1', kind: 'formula', text: 'R^2=1-\\frac{SS_{res}}{SS_{tot}}', evidenceId: '', valueColumn: 1 },
      { id: 'tb1', kind: 'table', text: '功能属性 KANO 分析表', evidenceId: 'kano1', valueColumn: 1 },
    ] },
  ];
  const body = generateLatexBody(content);
  assert.match(body, /\\section\{摘要\}\n摘要正文。\\par\n\\clearpage\n\n\\section\{一、研究背景\}/u);
  assert.match(body, /背景参见 表 1-1 与 式（1-1）。/u);
  assert.match(body, /\\caption\*\{表 1-1\\quad 功能属性 KANO 分析表\}/u);
  assert.match(body, /\\tag\{1-1\}/u);
  assert.match(body, /\\\(\\chi\^2\(6\)=183\.98\\\)/u);
  assert.match(body, /\\\(R\^2=0\.568\\\)/u);
  assert.match(body, /\\\(\\bar\{s\}=0\.385\\\)/u);
  assert.doesNotMatch(body, /\\\$\\textbackslash\{\}chi/u);

  const kanoSpec = latexColumns([r.headers, r.rows[0].map(String)], true);
  const leadMatch = /^C\{(\d+)mm\}/u.exec(kanoSpec);
  assert.ok(leadMatch && Number(leadMatch[1]) >= 26, `expected KANO col 0 >= 26mm, got ${kanoSpec}`);

  const clusterHeaders = ['人群类别', '人数', '占比', '界面易读性', '步骤指引度', '记录查阅度', '异常提示度', '自主操作感', '协作认同度'];
  const clusterRow = ['第 1 类（高认同稳态采纳型）', '193', '38.3%', '0.62', '0.58', '0.54', '0.49', '0.61', '0.66'];
  const clusterSpec = latexColumns([clusterHeaders, clusterRow], true);
  const clusterLead = /^C\{(\d+)mm\}/u.exec(clusterSpec);
  assert.ok(clusterLead && Number(clusterLead[1]) >= 26, `expected Cluster col 0 >= 26mm, got ${clusterSpec}`);
  assert.match(clusterSpec, /^C\{\d+mm\}c/u, 'count column stays compact centered');

  const u32 = n => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
  const png = (w, h) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...u32(w), ...u32(h), 8, 2, 0, 0, 0]).toString('base64');
  const withAiCover = applyCoverImage({ ...content, latex: { version: 1, body, reportHash: '0'.repeat(64) } }, parseCoverImage({
    schema: 'CoverImage/v1', mime: 'image/png', data: png(1000, 1414), widthPx: 1000, heightPx: 1414, note: 'AI 生成 A4 报告封面（gpt-image-1）',
  }));
  const fullTex = buildLatexSource(latexCompileInput(withAiCover));
  assert.match(fullTex, /银发「智」守：城市老年人智能健康监测调查/u);
  assert.match(fullTex, /基于多阶抽样与实证建模/u);
});

test('tables with 26-120 rows emit longtable + listoftables, figures emit listoffigures, and image cap is 48 / 12 MB', async () => {
  assert.equal(LATEX_IMAGE_LIMITS.count, 48);
  assert.equal(LATEX_IMAGE_LIMITS.total, 12_000_000);

  const makeTableResult = async (id, rowCount) => {
    const r = {
      id,
      title: `长表测试 ${rowCount}`,
      sourceName: '调查数据',
      sourceUrl: '',
      sourceHash: 'a'.repeat(64),
      resultHash: '0'.repeat(64),
      classification: 'user_provided',
      method: 'frequency',
      n: 300,
      total: 300,
      headers: ['指标项', '频数', '占比(%)'],
      rows: Array.from({ length: rowCount }, (_, i) => [`选项 ${i + 1}`, i + 10, '3.3%']),
      metrics: [{ label: '有效样本', value: 300 }],
      warnings: [],
    };
    r.resultHash = await digestText(JSON.stringify(resultPayload(r)));
    return r;
  };

  const r30 = await makeTableResult('tab30', 30);
  const r121 = await makeTableResult('tab121', 121);
  const content = createEditorContent();
  content.version = 2;
  content.title = '长表与图表目录测试';
  content.quality = { version: 1, results: [r30, r121], findings: [] };
  content.report = [
    {
      id: 'ch1',
      title: '一、实证分析',
      body: '参见 [[表:tb30]] 与 [[图:fg1]]。',
      source: '',
      blocks: [
        { id: 'tb30', kind: 'table', text: '长表特征汇总', evidenceId: 'tab30', valueColumn: 1 },
        { id: 'fg1', kind: 'chart', text: '分布柱形图', evidenceId: 'tab30', valueColumn: 1 },
      ],
    },
  ];
  const body = generateLatexBody(content);
  assert.match(body, /\\begin\{longtable\}\{ccc\}/u);
  assert.match(body, /\\endfirsthead/u);
  assert.match(body, /\\caption\*\{续表 1-1\\quad 长表特征汇总\}/u);
  assert.match(body, /\\endhead/u);
  assert.match(body, /\\addcontentsline\{lot\}\{table\}\{表 1-1\\quad 长表特征汇总\}/u);
  assert.match(body, /\\addcontentsline\{lof\}\{figure\}\{图 1-1\\quad 分布柱形图\}/u);

  const source = buildLatexSource({
    title: content.title,
    subtitle: '',
    body,
    options: { part: 'main', includeCover: true, includeToc: true, firstLineChars: 2, numberPages: true },
    figureImages: ['tab30#1'],
  });
  assert.match(source, /\\usepackage\{longtable\}/u);
  assert.match(source, /\\listoftables/u);
  assert.match(source, /\\listoffigures/u);
  assert.ok(source.indexOf('\\listoftables') < source.indexOf('\\pagenumbering{arabic}'));
  assert.ok(source.indexOf('\\listoffigures') < source.indexOf('\\pagenumbering{arabic}'));

  const overflow = structuredClone(content);
  overflow.report[0].body = '参见 [[表:tb121]]。';
  overflow.report[0].blocks = [{ id: 'tb121', kind: 'table', text: '超限表', evidenceId: 'tab121', valueColumn: 1 }];
  assert.throws(() => generateLatexBody(overflow), /120 行/);
});
