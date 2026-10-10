/** A sourced layout profile, not an assertion about an unresolved competition edition. */
export const REPORT_FORMAT = {
  id: 'ahpu-16-report-layout-v1',
  label: '第十六届公开报告格式范本',
  sourceTitle: '安徽工程大学第十六届实践赛暨省赛选拔通知所附《报告排版格式要求》',
  sourceUrl: 'https://jwc.ahpu.edu.cn/2026/0317/c8503a265448/page.psp',
  sourceFile: 'corpus-source/official-rules/report-format-20261007-ahpu.doc',
  sourceSha256: '190a0e093ab8fa53378f0ce74628cf60516886330050f1cfdc3bae4c2dbe762e',
  sourceScope: '第十六届高校实践赛与省赛选拔公开附件，作为有来源的排版范本；第十七届及其他赛区、阶段须另行绑定正式通知。',
  verifiedAt: '2026-10-07',
  verified: {
    paper: 'A4 · 210 × 297 mm',
    margins: '上、下 25.4 mm；左、右 31.8 mm',
    body: '宋体 12 pt；1.25 倍行距；段前 0.5 行',
    title: '宋体 16 pt 加粗；单倍行距；段前、段后自动',
    headings: '一级黑体 15 pt；二级黑体 14 pt；其余标题宋体 12 pt',
    abstractReferences: '摘要、参考文献名称黑体 14 pt；内容宋体 12 pt',
    captions: '图表题宋体 12 pt；图题在下、表题在上，居中，序题之间两格',
    numbering: '层次序号：一、 → （一） → 1. → （1） → 1）',
    parts: '报告正文与附录分别提交；标题页、摘要页、目录页、正文页计入正文，正文不超过 65 页',
    references: '附件提供分类型参考文献著录格式；同一来源复用序号，页码标于对应引用处。导出保留录入内容，著录准确性需核对。',
  },
  unbound: ['本项目所属届次、组别和赛区', '封面、目录与附录的具体版式', '页码位置和摘要目录的编号方式', '首行缩进'],
} as const;

export type ReportFormatOptions = { part:'main'|'appendix'; includeCover: boolean; includeToc: boolean; firstLineChars: 0 | 2; numberPages: boolean };
/** Explicit product choices where the cited attachment does not prescribe a value. */
export const DEFAULT_REPORT_OPTIONS: ReportFormatOptions = { part:'main',includeCover: true, includeToc: true, firstLineChars: 2, numberPages: true };
export function parseReportFormatOptions(value: ReportFormatOptions): ReportFormatOptions {
  if (!value || typeof value !== 'object' || Object.keys(value).some(key => !['part','includeCover','includeToc','firstLineChars','numberPages'].includes(key)) || !['main','appendix'].includes(value.part) || ['includeCover','includeToc','numberPages'].some(key=>typeof value[key as keyof ReportFormatOptions]!=='boolean') || ![0,2].includes(value.firstLineChars)) throw Error('报告排版选项无效。');
  if(value.part==='main'&&(!value.includeCover||!value.includeToc))throw Error('本范本的报告正文需包含标题页和目录页。');
  return { ...value };
}
export type ReportPart = 'abstract'|'references'|'appendix'|'body';
export function reportPart(title: string): ReportPart {
  const text=title.trim().replace(/^[一二三四五六七八九十\d]+[、.．]\s*/, '');
  if (/^(摘要|abstract)$/i.test(text)) return 'abstract';
  if (/^(参考文献|references)$/i.test(text)) return 'references';
  if (/^(附录|附件)(?:\s|[A-ZＡ-Ｚ一二三四五六七八九十\d]|$)/.test(text)) return 'appendix';
  return 'body';
}
export function reportHeadingLevel(text: string): 1|2|3|4|5|null {
  if (/^[一二三四五六七八九十]+、/.test(text.trim())) return 1;
  if (/^[（(][一二三四五六七八九十]+[）)]/.test(text.trim())) return 2;
  if (/^\d+[.．](?!\d)/.test(text.trim())) return 3;
  if (/^[（(]\d+[）)]/.test(text.trim())) return 4;
  if (/^\d+[）)]/.test(text.trim())) return 5;
  return null;
}
export function reportFormatNotices(sections:readonly {title:string}[]):string[]{
  const notices:string[]=[];
  if(sections.some(s=>/参考文献.*附录|附录.*参考文献/.test(s.title)))notices.push('将“参考文献与附录”拆成两个章节，才能分别分页；当前仍完整保留该章节。');
  if(!sections.some(s=>reportPart(s.title)==='abstract'))notices.push('尚无独立“摘要”章节；导出不会代写摘要。');
  if(!sections.some(s=>reportPart(s.title)==='references'))notices.push('尚无独立“参考文献”章节；请录入实际引用的文献。');
  return notices;
}
