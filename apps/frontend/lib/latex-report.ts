import {assertFindingReferences, assertTableRows, evidenceLabel, valueText} from './quality-export.ts';
import { chartData, resultFor, verifyResearchQuality, type ReportBlock } from './research-quality.ts';
import {parseEditorContent,type EditorContent,type LatexReport} from './editor-model.ts';
import { DEFAULT_REPORT_SETTINGS, parseReportFormatOptions, parseReportFormatSettings, reportPart, type ReportFormatOptions } from './report-format.ts';
import { referenceSegments, reportLabels, type BlockLabel } from './report-numbering.ts';
import { formatReference, referenceNumbers, unfinishedCited, unfinishedReference } from './references.ts';
import {frameTexPreamble} from './report-frame-export.ts';
import {parseReportFrame,assertApprovedFrame,type ReportFrameStyle} from './report-frame.ts';
import {figureTexPreamble} from './report-figure-tex.ts';
import {figureFor,type ReportFigure,type ProjectVisualStyle} from './report-figure.ts';
import {carriesFigure} from './method-figures.ts';

export const LATEX_LIMITS = { body: 120000, pdfBytes: 4 * 1024 * 1024, responseBytes: 8 * 1024 * 1024, timeoutMs: 65000 } as const;
export type LatexCompileInput = { title: string; subtitle: string; body: string; options: ReportFormatOptions; frame?:ReportFrameStyle; figures?:ReportFigure[];visualStyle?:ProjectVisualStyle };
export type LatexDiagnostic = { severity: 'error' | 'warning'; line: number | null; message: string };
export type LatexCompileReceipt = { status: 'compiled' | 'error' | 'unavailable'; source: string; sourceHash: string; pdfBase64: string | null; diagnostics: LatexDiagnostic[]; engine: 'xelatex' | null };

/** Plain report text never becomes executable TeX. */
export function escapeLatexText(value: string): string {
  const replacements: Record<string, string> = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&', '#': '\\#', '%': '\\%', '_': '\\_', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' };
  return Array.from(value, character => replacements[character] ?? character).join('');
}

/** Fine optional breaks make long identifiers fit without touching ordinary words. */
export function escapeLatexParagraphText(value: string): string {
  return value.split(/([A-Za-z0-9]{32,})/g).map(part => {
    if (/^[A-Za-z0-9]{32,}$/.test(part)) {
      return part.match(/[A-Za-z0-9]{1,4}/g)!.map(escapeLatexText).join('\\linebreak[0]');
    }
    return escapeLatexText(part);
  }).join('');
}

/** Explicit ordering makes the source identity stable after a JSONB round trip. */
export function latexReportKey(content: EditorContent): string {
  const settings = parseReportFormatSettings(content.reportFormat ?? DEFAULT_REPORT_SETTINGS);
  const options = settings.options;
  return JSON.stringify({ title: content.title, subtitle: content.subtitle,
    ...(content.reportFrame?{reportFrame:content.reportFrame}:{}),...(content.figures?.length?{figures:content.figures,visualStyle:content.visualStyle}:{}),
    report: content.report.map(section => ({ id: section.id, title: section.title, body: section.body, source: section.source, ...(section.blocks?.length ? { blocks: section.blocks } : {}), ...(section.findingIds ? { findingIds: section.findingIds } : {}), ...(section.findingSnapshots ? { findingSnapshots: section.findingSnapshots } : {}) })),
    ...(content.report.some(s=>s.blocks?.length||s.findingIds?.length) ? { quality: content.quality } : {}),
    // Only drafts with structured references carry them, so the key of every older draft is unchanged.
    ...(content.references?.length ? { references: content.references } : {}),
    reportFormat: { edition: settings.edition, group: settings.group, region: settings.region, track: settings.track, stage: settings.stage, profileId: settings.profileId,
      options: { part: options.part, includeCover: options.includeCover, includeToc: options.includeToc, firstLineChars: options.firstLineChars, numberPages: options.numberPages } },
  });
}
export async function latexSha256(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function latexReportHash(content: EditorContent): Promise<string> { return latexSha256(latexReportKey(content)); }

type Cites = { labels: Map<string, BlockLabel>; citations: ReadonlyMap<string, number> };
/**
 * A line of report text for LaTeX: figure, table and equation references as their numbers, citations as superscript
 * marks, everything else escaped; a dangling reference or citation stops the generation as the Word export does.
 */
function latexLine(text: string, refs: Cites, where: string): string {
  const segments = referenceSegments(text, refs.labels, refs.citations);
  if (segments.some(s => s.missing)) throw Error(`「${where}」中有${segments.some(s => s.missing && s.cite) ? '文献' : '图表'}引用已失效，请重新插入引用后再生成。`);
  // The editor writes a literal dollar as \$; LaTeX escapes the dollar itself.
  return segments.map(s => s.cite ? `\\textsuperscript{${escapeLatexText(s.text)}}` : escapeLatexParagraphText(s.text.replace(/\\\$/g, '$'))).join('');
}

function latexBlocks(blocks: ReportBlock[], content: EditorContent, refs: Cites = { labels: reportLabels(content.report), citations: referenceNumbers(content).numbers }, where = '内容块'): string {
  return blocks.map(block=>{
    if(block.kind==='formula'){
      const commands=[...block.text.matchAll(/\\([A-Za-z]+)/g)].map(m=>m[1]);
      if(commands.some(cmd=>!['frac','sqrt','sum','prod','int','iint','iiint','lim','log','ln','sin','cos','tan','exp','alpha','beta','gamma','delta','mu','sigma','theta','lambda','pi','rho','eta','epsilon','chi','omega','Delta','Sigma','Omega','cdot','times','le','ge','neq','approx','pm','in','infty','left','right','overline','underline','hat','bar','vec','mathrm','mathbf','text',
        // Math-mode commands the method write-ups use, each also on the compiler's list (tools/latex.py COMMANDS).
        'varepsilon','lVert','rVert','lvert','rvert','max','min','ne','qquad','quad','dfrac','tfrac','operatorname','sim','tilde','widehat','dots','cdots','ldots'].includes(cmd)))throw Error('公式块包含非数学命令，请使用 LaTeX 工作台检查。');
      return `\\[\n${block.text}\n\\]`;
    }
    if(block.kind!=='chart'&&block.kind!=='table')return `${latexLine(block.text,refs,where)}\\par`;
    const r=resultFor(content.quality,block.evidenceId);
    const source=escapeLatexParagraphText(evidenceLabel(r));
    if(block.figureId){const figure=figureFor(content,block.figureId,block.evidenceId),index=content.figures!.findIndex(f=>f.id===figure.id),table=figure.kind==='table';return [`\\begin{${table?'table':'figure'}}[htbp]`,'\\centering',...(table?[`\\caption{${escapeLatexText(block.text||figure.title)}}`]:[]),`\\ResearchFigure{${index}}`,...(!table?[`\\caption{${escapeLatexText(block.text||figure.title)}}`]:[]),`\\end{${table?'table':'figure'}}`,`${source}\\par`].join('\n');}
    if(block.kind==='table'){
      assertTableRows(r);
      if(r.headers.length>10||r.rows.length>25)throw Error('表格超过 10 列或 25 行，请分拆后导出 LaTeX。');
      const cells=(row:(string|number|null)[])=>row.map(v=>escapeLatexText(valueText(v))).join(' & ')+String.raw` \\`;
      return ['\\begin{table}[htbp]','\\centering',`\\caption{${escapeLatexText(block.text||r.title)}}`,`\\begin{tabular}{${'c'.repeat(r.headers.length)}}`,'\\toprule[1.5bp]',cells(r.headers),'\\midrule[0.75bp]',...r.rows.map(cells),'\\bottomrule[1.5bp]','\\end{tabular}','\\end{table}',`${source}\\par`].join('\n');
    }
    // An advanced method's own figure (forest, scree, quadrant, profile) is drawn in the Word export only; here its
    // number and caption stay, so references to it still resolve, and the box says where to see it.
    if(carriesFigure(r))return ['\\begin{figure}[htbp]','\\centering','\\textit{此图为方法图，在 Word 导出中绘制；其数值见同节结果表。}',`\\caption{${escapeLatexText(block.text||r.title)}}`,'\\end{figure}',`${source}\\par`].join('\n');
    const data=chartData(r,block.valueColumn);
    if(data.labels.length>16||data.values.some(v=>Math.abs(v)>1e12))throw Error('图表类别或数值范围过大，请分拆或转换计量单位。');
    const ticks=data.labels.map((_,i)=>i).join(','), labels=data.labels.map(x=>`{${escapeLatexText(x)}}`).join(',');
    return ['\\begin{figure}[htbp]','\\centering',`\\definecolor{ResearchAccent}{HTML}{${content.accent==='teal'?'0F766E':content.accent==='burgundy'?'8A3449':'234E80'}}`,'\\begin{tikzpicture}',`\\begin{axis}[width=13cm,height=8cm,ybar,bar width=12pt,xtick={${ticks}},xticklabels={${labels}},x tick label style={rotate=35,anchor=east},ylabel={${escapeLatexText(r.headers[block.valueColumn])}},enlarge x limits=0.12,nodes near coords,point meta=explicit symbolic]`,`\\addplot[fill=ResearchAccent,draw=ResearchAccent] coordinates {${data.values.map((v,i)=>`(${i},${v}) [${valueText(v)}]`).join(' ')}};`,'\\end{axis}','\\end{tikzpicture}',`\\caption{${escapeLatexText(block.text||r.title)}}`,'\\end{figure}',`${source}\\par`].join('\n');
  }).join('\n\n');
}

export function generateLatexBody(content: EditorContent): string {
  assertFindingReferences(content);
  const part = (content.reportFormat ?? DEFAULT_REPORT_SETTINGS).options.part;
  const sections = content.report.filter(section => (reportPart(section.title) === 'appendix') === (part === 'appendix'));
  if (!sections.length) throw Error(part === 'appendix' ? '请先添加独立附录章节。' : '报告正文至少需要一个章节。');
  const refs: Cites = { labels: reportLabels(content.report), citations: referenceNumbers(content).numbers }, entries = referenceNumbers(content).order;
  // An appendix-only export prints no reference list, so an unfinished entry of the main report does not stop it.
  if (part === 'appendix' && unfinishedCited(content, sections)) throw Error(`附录引用的第 ${unfinishedCited(content, sections)} 条参考文献尚未填写题名，请补全后再生成。`);
  if (part !== 'appendix' && entries.some(unfinishedReference)) throw Error(`第 ${entries.findIndex(unfinishedReference) + 1} 条参考文献尚未填写题名，请补全或删除后再生成。`);
  const paragraphs = (text: string, where: string) => text.split(/\r\n|\r|\n/).map(line => `${latexLine(line, refs, where)}\\par`).join('\n');
  // Structured references print as a hanging list in citation order, as in the Word export.
  const list = entries.map((entry, i) => `\\noindent\\hangindent=2em\\hangafter=1 [${i + 1}]~${escapeLatexParagraphText(formatReference(entry))}\\par`).join('\n');
  const body = sections.map(section => `\\section{${escapeLatexText(section.title || '未命名章节')}}\n${paragraphs(section.body, section.title || '未命名章节')}${reportPart(section.title) === 'references' && list ? `\n${list}` : ''}${section.blocks?.length ? `\n${latexBlocks(section.blocks,content,refs,section.title || '未命名章节')}` : ''}${section.source ? `\n\\textbf{来源 / 说明：} ${paragraphs(section.source, section.title || '未命名章节')}` : ''}`).join('\n\n') + '\n';
  if (body.length > LATEX_LIMITS.body) throw Error('生成正文超过 120,000 字符，请先拆分报告。');
  return body;
}
export async function createLatexReport(content: EditorContent): Promise<LatexReport> {
  assertFindingReferences(content);content=parseEditorContent(content);
  if(content.reportFrame)await assertApprovedFrame(content.reportFrame);
  if(content.quality)await verifyResearchQuality(content.quality);
  const body = generateLatexBody(content), reportHash = await latexReportHash(content);
  return { version: 1, body, reportHash };
}
/** The same literal controls/comments as the bounded backend language, not a global regex. */
export function latexFigureReferences(body:string):{index:number;start:number;end:number}[]{
 const refs:{index:number;start:number;end:number}[]=[];let i=0;
 while(i<body.length){if(body[i]==='%'){while(i<body.length&&body[i]!=='\n'&&body[i]!=='\r')i++;continue;}if(body[i]!=='\\'){i++;continue;}const match=body.slice(i+1).match(/^[A-Za-z]+/);if(!match){i+=2;continue;}i+=1+match[0].length;if(match[0]!=='ResearchFigure')continue;const arg=body.slice(i).match(/^([\s]*)\{(0|[1-9][0-9]{0,2})\}/);if(!arg)continue;const start=i+arg[1].length+1;refs.push({index:Number(arg[2]),start,end:start+arg[2].length});i+=arg[0].length;}
 return refs;
}
export function latexCompileInput(content: EditorContent): LatexCompileInput {
  const options = parseReportFormatOptions((content.reportFormat ?? DEFAULT_REPORT_SETTINGS).options);
  const original=content.latex?.body??'',refs=latexFigureReferences(original),used=[...new Set(refs.map(r=>r.index))].sort((a,b)=>a-b);
  if(used.some(index=>!content.figures?.[index]))return {title:content.title,subtitle:content.subtitle,body:original,options,...(content.reportFrame?{frame:parseReportFrame(content.reportFrame),visualStyle:content.visualStyle}:{})};
  let offset=0,body='';for(const ref of refs){body+=original.slice(offset,ref.start)+used.indexOf(ref.index);offset=ref.end;}body+=original.slice(offset);
  return { title: content.title, subtitle: content.subtitle, body, options,...(content.reportFrame?{frame:parseReportFrame(content.reportFrame),visualStyle:content.visualStyle}:{}),...(used.length?{figures:used.map(i=>content.figures![i]),visualStyle:content.visualStyle}:{}) };
}
export function latexCompileKey(input: LatexCompileInput): string {
  const o = input.options;
  return JSON.stringify({ title: input.title, subtitle: input.subtitle, body: input.body,
    ...(input.frame?{frame:input.frame}:{}),
    ...(input.figures?.length?{figures:input.figures}:{}),...(input.visualStyle?{visualStyle:input.visualStyle}:{}),
    options: { part: o.part, includeCover: o.includeCover, includeToc: o.includeToc, firstLineChars: o.firstLineChars, numberPages: o.numberPages } });
}

/** Byte-identical counterpart of multi_agent.agents.writing_agent.latex.build_source; checked against its fixtures. */
export function buildLatexSource(input: LatexCompileInput): string {
  if(latexFigureReferences(input.body).some(r=>r.index>=(input.figures?.length??0)))throw Error('图形引用不在本次图形版本中，请重新选择。');
  const o = parseReportFormatOptions(input.options);
  const metadata = (text: string) => escapeLatexText(text.replace(/[\r\n]/g, ' '));
  const lines = [
    '\\documentclass[UTF8,a4paper,zihao=-4]{ctexart}',
    '\\usepackage[top=25.4mm,bottom=25.4mm,left=31.8mm,right=31.8mm]{geometry}',
    '\\usepackage{amsmath,amssymb,booktabs,array,caption,setspace}',
    '\\IfFontExistsTF{Times New Roman}{\\setmainfont{Times New Roman}}{}',
    '\\setstretch{1.25}', '\\setlength{\\emergencystretch}{5em}', '\\setlength{\\parskip}{0.5\\baselineskip}',
    `\\setlength{\\parindent}{${o.firstLineChars}em}`,
    '\\setlength{\\heavyrulewidth}{1.5bp}', '\\setlength{\\lightrulewidth}{0.75bp}',
    '\\renewcommand{\\arraystretch}{1.2}',
    '\\DeclareCaptionFont{reportcaption}{\\fontsize{12bp}{14.4bp}\\selectfont}',
    '\\captionsetup{font=reportcaption,labelsep=quad,justification=centering,singlelinecheck=false}',
    '\\ctexset{section={format=\\fontsize{15bp}{18.75bp}\\selectfont\\heiti},subsection={format=\\fontsize{14bp}{17.5bp}\\selectfont\\heiti},subsubsection={format=\\fontsize{12bp}{15bp}\\selectfont\\songti}}',
    '\\setcounter{secnumdepth}{-1}', `\\pagestyle{${o.numberPages ? 'plain' : 'empty'}}`, '\\begin{document}',
    '\\fontsize{12bp}{14.4bp}\\selectfont',
  ];
  if(input.body.includes('\\begin{tikzpicture}'))lines.splice(3,0,'\\usepackage{pgfplots}','\\pgfplotsset{compat=1.18}');
  if(input.figures?.length){if(!input.visualStyle)throw Error('图形缺少配色版本。');lines.splice(3,0,'\\usepackage{tikz}');lines.splice(lines.indexOf('\\begin{document}'),0,...figureTexPreamble(input.figures,input.visualStyle));}
  const frame=input.frame?parseReportFrame(input.frame):null;
  if(frame&&frame.layout!=='none'){lines.splice(lines.indexOf('\\begin{document}'),0,...frameTexPreamble(frame));if(frame.appliesTo.includes('cover'))lines.push('\\ReportFrameActivetrue');}
  if (o.includeCover) lines.push('\\begin{titlepage}', '\\centering', '\\vspace*{25mm}', `{\\songti\\bfseries\\fontsize{16bp}{20bp}\\selectfont ${metadata(input.title)}\\par}`, '\\vspace{10mm}', `${metadata(input.subtitle)}\\par`, '\\end{titlepage}');
  if(frame&&frame.layout!=='none')lines.push('\\ReportFrameActivefalse');
  if (o.includeToc) lines.push('\\pagenumbering{Roman}', '\\tableofcontents', '\\clearpage', '\\pagenumbering{arabic}');
  if(frame&&frame.layout!=='none'&&frame.appliesTo.includes(o.part==='appendix'?'appendix':'body'))lines.push('\\ReportFrameActivetrue');
  lines.push('% BODY START', input.body.replace(/\r\n?/g, '\n'), '% BODY END', '\\end{document}', '');
  const source=lines.join('\n');if(new TextEncoder().encode(source).length>2_000_000)throw Error('排版源码超过 2 MB，请拆分图形或文档。');return source;
}
export function previewLatexSource(input:LatexCompileInput):{source:string;error:string}{try{return {source:buildLatexSource(input),error:''};}catch(error){return {source:'',error:error instanceof Error?error.message:'源码暂不能生成，请调整图形或文档。'};}}
export async function approvedLatexSource(input:LatexCompileInput):Promise<{source:string;inputKey:string}>{const snapshot=structuredClone(input);if(snapshot.frame)snapshot.frame=await assertApprovedFrame(snapshot.frame);return {source:buildLatexSource(snapshot),inputKey:latexCompileKey(snapshot)};}

export type LatexCompileTicket = { generation: number; projectId: string; inputKey: string };
/** A response is useful only for its original project and exact input, even after cancel/retry. */
export function createLatexCompileGuard() {
  let generation = 0;
  return {
    start: (projectId: string, inputKey: string): LatexCompileTicket => ({ generation: ++generation, projectId, inputKey }),
    cancel: () => { generation++; },
    accepts: (ticket: LatexCompileTicket, projectId: string, inputKey: string): boolean => ticket.generation === generation && ticket.projectId === projectId && ticket.inputKey === inputKey,
  };
}

export const LATEX_INSERTS = {
  formula: '\n\\[\n\\frac{a}{b}\n\\]\n',
  table: '\n\\begin{table}\n\\centering\n\\caption{表格标题}\n\\begin{tabular}{ccc}\n\\toprule\n变量 & 数值 & 说明 \\\\\n\\midrule\n待填写 & 待填写 & 待填写 \\\\\n\\bottomrule\n\\end{tabular}\n\\end{table}\n',
} as const;

/** DOM textarea offsets refer to LF-normalized text, including a restored CRLF draft. */
export function insertLatexSnippet(body: string, snippet: string, selectionStart?: number, selectionEnd?: number): { body: string; start: number; end: number } {
  const displayed = body.replace(/\r\n?/g, '\n');
  const start = Math.max(0, Math.min(displayed.length, selectionStart ?? displayed.length));
  const end = Math.max(start, Math.min(displayed.length, selectionEnd ?? start));
  return { body: displayed.slice(0, start) + snippet + displayed.slice(end), start, end: start + snippet.length };
}

export function latexLineSelection(body: string, line: number): { start: number; end: number } {
  const lines: { start: number; end: number }[] = [];
  let start = 0;
  for (const match of body.matchAll(/\r\n|\r|\n/g)) {
    lines.push({ start, end: match.index }); start = match.index + match[0].length;
  }
  lines.push({ start, end: body.length });
  return lines[Math.max(0, Math.min(lines.length - 1, Math.trunc(line) - 1))];
}

export async function parseLatexCompileReceipt(value: unknown, expectedSource: string): Promise<LatexCompileReceipt> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('编译回执格式无效。');
  const x = value as Record<string, unknown>;
  const fields = ['status', 'source', 'sourceHash', 'pdfBase64', 'diagnostics', 'engine'];
  if (Object.keys(x).length !== fields.length || Object.keys(x).some(key => !fields.includes(key)) || !['compiled', 'error', 'unavailable'].includes(x.status as string) || !['xelatex', null].includes(x.engine as 'xelatex' | null)) throw Error('编译回执字段无效。');
  if (x.source !== expectedSource || typeof x.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(x.sourceHash) || await latexSha256(expectedSource) !== x.sourceHash) throw Error('编译源码与本次请求不一致，请重新核对。');
  if (!Array.isArray(x.diagnostics) || x.diagnostics.length > 100) throw Error('编译诊断格式无效。');
  const diagnostics: LatexDiagnostic[] = x.diagnostics.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('编译诊断格式无效。');
    const item = value as Record<string, unknown>;
    if (Object.keys(item).length !== 3 || Object.keys(item).some(key => !['severity', 'line', 'message'].includes(key)) || !['error', 'warning'].includes(item.severity as string) || typeof item.message !== 'string' || item.message.length > 2000 || (item.line !== null && (!Number.isSafeInteger(item.line) || (item.line as number) < 1 || (item.line as number) > LATEX_LIMITS.body + 1))) throw Error('编译诊断内容无效。');
    return { severity: item.severity as LatexDiagnostic['severity'], line: item.line as number | null, message: item.message };
  });
  if (x.status === 'compiled') {
    if (x.engine !== 'xelatex' || typeof x.pdfBase64 !== 'string') throw Error('编译结果缺少 PDF。');
    decodeLatexPdf(x.pdfBase64);
  } else if (x.pdfBase64 !== null) throw Error('未完成的编译不能返回 PDF。');
  return { status: x.status as LatexCompileReceipt['status'], source: expectedSource, sourceHash: x.sourceHash, pdfBase64: x.pdfBase64 as string | null, diagnostics, engine: x.engine as LatexCompileReceipt['engine'] };
}
export function decodeLatexPdf(value: string): Uint8Array<ArrayBuffer> {
  if (value.length > 4 * Math.ceil(LATEX_LIMITS.pdfBytes / 3) || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw Error('PDF 回执编码无效。');
  const raw = atob(value);
  if (raw.length > LATEX_LIMITS.pdfBytes || !raw.startsWith('%PDF-')) throw Error('PDF 回执内容无效。');
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}
