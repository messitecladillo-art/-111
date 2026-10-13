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
/** Recommended starting choices; the author owns the final document structure. */
export const DEFAULT_REPORT_OPTIONS: ReportFormatOptions = { part:'main',includeCover: true, includeToc: true, firstLineChars: 2, numberPages: true };
export function parseReportFormatOptions(value: unknown): ReportFormatOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('报告排版选项无效。');
  const options = value as Record<string, unknown>;
  if (Object.keys(options).length !== 5 || Object.keys(options).some(key => !['part','includeCover','includeToc','firstLineChars','numberPages'].includes(key)) || !['main','appendix'].includes(options.part as string) || ['includeCover','includeToc','numberPages'].some(key=>typeof options[key]!=='boolean') || ![0,2].includes(options.firstLineChars as number)) throw Error('报告排版选项无效。');
  return { ...options as ReportFormatOptions };
}

export type ReportFormatSettings = {
  edition: string;
  group: string;
  region: string;
  track: string;
  stage: string;
  profileId: string;
  options: ReportFormatOptions;
};

/** Export buttons select a part without replacing the author's layout choices. */
export function reportExportOptions(value: ReportFormatOptions, part: 'main'|'appendix'): ReportFormatOptions {
  const options = parseReportFormatOptions(value);
  return parseReportFormatOptions({...options,part});
}

export const REPORT_FORMAT_PROFILES = [
  {
    id: 'research-default', label: '研究文档标准排版', edition: null,
    sourceTitle: '证见研究文档排版设置', sourceUrl: null, sourceSha256: null,
    scope: '研究文档', verifiedAt: null,
  },
  {
    id: REPORT_FORMAT.id, label: '第十六届公开排版范本', edition: '第十六届',
    sourceTitle: REPORT_FORMAT.sourceTitle, sourceUrl: REPORT_FORMAT.sourceUrl,
    sourceSha256: REPORT_FORMAT.sourceSha256, scope: '安徽工程大学第十六届实践赛与省赛选拔附件',
    verifiedAt: REPORT_FORMAT.verifiedAt,
  },
  {
    id: 'btbu-17-report-layout-v1', label: '第十七届校赛排版参考 · 北工商', edition: '第十七届',
    sourceTitle: '北京工商大学第十六届立丰杯校赛《报告格式和封面参考》',
    sourceUrl: 'https://stxy.btbu.edu.cn/tzgg/40e1699e94774c69b98ea3a94f2112a2.htm',
    sourceSha256: '1c5dc579bd453bb50fa8362581001f37883cc487129bd3efa3f85f80925352d4',
    scope: '北京工商大学校级选拔；衔接全国第十七届', verifiedAt: '2026-10-11',
  },
] as const;

export type ReportFormatProfile = (typeof REPORT_FORMAT_PROFILES)[number];
export const DEFAULT_REPORT_FORMAT_SETTINGS: ReportFormatSettings = {
  edition: '第十七届', group: '', region: '', track: '', stage: '',
  profileId: 'research-default', options: { ...DEFAULT_REPORT_OPTIONS },
};
export const DEFAULT_REPORT_SETTINGS = DEFAULT_REPORT_FORMAT_SETTINGS;

const SCOPE_FIELDS = ['edition', 'group', 'region', 'track', 'stage'] as const;
const SETTING_FIELDS = [...SCOPE_FIELDS, 'profileId', 'options'] as const;
// Length matches the persisted contract's UTF-16 units, including astral characters.
const CONTROL_OR_LINE_BREAK = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;

export function parseReportFormatSettings(value: unknown): ReportFormatSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('报告格式设置无效。');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== SETTING_FIELDS.length || Object.keys(record).some(key => !SETTING_FIELDS.includes(key as (typeof SETTING_FIELDS)[number]))) throw Error('报告格式设置字段无效。');
  for (const field of SCOPE_FIELDS) {
    const input = record[field];
    if (typeof input !== 'string' || input.length > (field === 'edition' ? 20 : 80) || CONTROL_OR_LINE_BREAK.test(input)) throw Error('赛事范围格式无效。');
  }
  if (!['第十六届', '第十七届'].includes(record.edition as string)) throw Error('赛事届次无效。');
  if (!REPORT_FORMAT_PROFILES.some(profile => profile.id === record.profileId)) throw Error('报告排版范本无效。');
  return {
    edition: record.edition as string, group: record.group as string, region: record.region as string,
    track: record.track as string, stage: record.stage as string, profileId: record.profileId as string,
    options: parseReportFormatOptions(record.options),
  };
}

export type ReportFormatEvaluation = {
  status: 'unknown' | 'not_applicable' | 'reference_only';
  label: string;
  detail: string;
  missingScope: (typeof SCOPE_FIELDS)[number][];
  profile: ReportFormatProfile;
  /** No loaded profile establishes a hard limit for the selected project scope. */
  pageLimit: null;
};

export function evaluateReportFormat(value: ReportFormatSettings): ReportFormatEvaluation {
  const settings = parseReportFormatSettings(value);
  const profile = REPORT_FORMAT_PROFILES.find(item => item.id === settings.profileId)!;
  const missingScope = SCOPE_FIELDS.filter(field => !settings[field].trim());
  const base = { profile, missingScope, pageLimit: null };
  if (profile.edition && profile.edition !== settings.edition) return {
    ...base, status: 'not_applicable', label: '范本届次不匹配', detail: `当前选择${settings.edition}，该范本属于${profile.edition}。`,
  };
  if (missingScope.length) return {
    ...base, status: 'unknown', label: '赛事范围待完善', detail: '补充组别、赛区、赛道与阶段。',
  };
  return {
    ...base, status: 'reference_only', label: profile.id === 'research-default' ? '研究排版' : '排版参考',
    detail: settings.edition === '第十七届' ? '第十七届实践赛格式细则待绑定。' : '选择对应学校、赛区与阶段的正式提交要求。',
  };
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
  if(sections.some(s=>/参考文献.*附录|附录.*参考文献/.test(s.title)))notices.push('需要单独导出附录时，可将“参考文献与附录”拆成两个章节。');
  if(!sections.some(s=>reportPart(s.title)==='abstract'))notices.push('可添加摘要，概括研究问题、方法与主要发现。');
  if(!sections.some(s=>reportPart(s.title)==='references'))notices.push('可添加参考文献，集中列出引用来源。');
  return notices;
}
