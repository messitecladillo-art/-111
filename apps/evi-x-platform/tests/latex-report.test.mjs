import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { DEFAULT_REPORT_SETTINGS } from '../lib/report-format.ts';
import { buildLatexSource, createLatexReport, escapeLatexParagraphText, escapeLatexText, generateLatexBody, LATEX_INSERTS, latexCompileInput, latexCompileKey, latexReportHash, latexSha256 } from '../lib/latex-report.ts';

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
  const report = Array.from({ length: 20 }, (_, i) => ({ id: String(i), title: '章节', source: '', body: '中'.repeat(11000) }));
  assert.throws(() => parseEditorContent({ ...original, report, latex }), /500 KB/);
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

// Frozen hashes generated independently by evix_api.latex.build_source (2026-10-11).
const parity = [
  { input: { title:'合成研究 A&B_1', subtitle:'标签 % # $ { } \\ ^ ~', body:'\\section{摘要}\n合成结果。\\par\n\\[ \\bar{x}=\\frac{1}{n}\\sum_{i=1}^{n}x_i \\]', options:{part:'main',includeCover:true,includeToc:true,firstLineChars:2,numberPages:true} }, hash:'2513889ce995061eecfc03eb90c9f5a9984459bd2ecfda68cf263657f366f024' },
  { input: { title:'附录',subtitle:'',body:'\\section{补充材料}\n\\begin{tabular}{cc}\\toprule 变量 & 数值 \\\\ \\midrule A & 12 \\\\ \\bottomrule\\end{tabular}',options:{part:'appendix',includeCover:false,includeToc:false,firstLineChars:0,numberPages:false} },hash:'fc2d4e8b503ad1a1ef19486bd292d3d39fa1f3f1c0c687918f31d694055f4efa' },
  { input: { title:'CR normalization',subtitle:'',body:'% comment\r\\section{Newline}\r\nText\\par',options:{part:'appendix',includeCover:false,includeToc:false,firstLineChars:0,numberPages:false} },hash:'c5d1675edd73eb5d22019d7f5c995bc0ee64891ebb2b6af0e6ad9895a2003748' },
];
test('full source matches independent backend golden fixtures byte for byte', async () => {
  for (const {input,hash} of parity) assert.equal(await latexSha256(buildLatexSource(input)),hash);
});

test('trusted layout fixes A4, Chinese body, three lines and centered columns with neutral source', () => {
  const source = buildLatexSource(parity[0].input);
  assert.ok(source.includes('a4paper')); assert.ok(source.includes('top=25.4mm,bottom=25.4mm,left=31.8mm,right=31.8mm'));
  assert.ok(source.includes('\\heavyrulewidth}{1.5bp}')); assert.ok(source.includes('\\lightrulewidth}{0.75bp}'));
  assert.ok(source.includes('\\fontsize{12bp}{14.4bp}')); assert.ok(source.includes('\\setcounter{secnumdepth}{-1}'));
  assert.ok(source.includes('\\DeclareCaptionFont{reportcaption}{\\fontsize{12bp}{14.4bp}\\selectfont}'));
  assert.ok(source.includes('\\fontsize{16bp}{20bp}')); assert.ok(source.includes('\\fontsize{15bp}{18.75bp}'));
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
