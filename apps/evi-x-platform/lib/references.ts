/**
 * References under GB/T 7714—2015, numeric system (顺序编码制): structured entries are formatted by type, cited in the
 * text as `[[引:ID]]`, numbered in order of first citation, and printed as superscript "[1]", "[1,3]" or "[2-4]".
 * Entries never cited follow the cited ones and are reported, since the numeric system lists only what the text cites.
 */
import type { EditorContent } from './editor-model.ts';
import { reportPart } from './report-format.ts';
import { qualityRecord } from './research-quality.ts';

export const REFERENCE_TYPES = {
  J: '期刊文章', M: '专著', D: '学位论文', C: '会议论文集析出文献', R: '报告', N: '报纸文章', S: '标准', 'EB/OL': '电子资源', other: '其他（按原文）',
} as const;
export type ReferenceType = keyof typeof REFERENCE_TYPES;
export type ReferenceEntry = {
  id: string; type: ReferenceType; authors: string[]; title: string;
  /** 刊名、报纸名或文集名. */ source: string;
  /** 出版者、保存单位或发布机构. */ publisher: string;
  /** 出版地或保存地. */ place: string;
  year: string; volume: string; issue: string; pages: string; edition: string;
  /** 报纸的出版日期，或电子资源的发布 / 更新日期，YYYY-MM-DD. */ date: string;
  /** 电子资源的引用日期，YYYY-MM-DD. */ accessed: string;
  url: string; doi: string;
  /** 标准号或报告编号. */ number: string;
  /** 'other' 类型按原文著录的整条文献. */ text: string;
};
export const REFERENCE_LIMIT = 200;
const FIELDS = ['id', 'type', 'authors', 'title', 'source', 'publisher', 'place', 'year', 'volume', 'issue', 'pages', 'edition', 'date', 'accessed', 'url', 'doi', 'number', 'text'] as const;
const LIMITS: Record<string, number> = { id: 80, title: 400, source: 200, publisher: 200, place: 80, year: 20, volume: 40, issue: 40, pages: 60, edition: 40, date: 20, accessed: 20, url: 1000, doi: 200, number: 80, text: 1000 };

export function emptyReference(type: ReferenceType = 'J'): ReferenceEntry {
  return { id: crypto.randomUUID(), type, authors: [], title: '', source: '', publisher: '', place: '', year: '', volume: '', issue: '', pages: '', edition: '', date: '', accessed: '', url: '', doi: '', number: '', text: '' };
}

const fail = (why: string): never => { throw Error(`参考文献格式无效：${why}`); };
const line = (value: unknown, max: number, field: string) => {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f\p{Surrogate}]/u.test(value)) return fail(`${field}须为不超过 ${max} 字的单行文本。`);
  return value;
};
/**
 * Strict structure, lenient content: known fields only and single-line text, so a half-typed link or date never
 * blocks saving; `referenceProblems` reports what a complete record still needs. Links are never rendered as links.
 */
export function parseReferences(value: unknown): ReferenceEntry[] {
  if (!Array.isArray(value) || value.length > REFERENCE_LIMIT) return fail(`最多 ${REFERENCE_LIMIT} 条。`);
  const entries = value.map((raw): ReferenceEntry => {
    // Plain objects with exactly the known own fields; inherited properties never count.
    let x: Record<string, unknown>;
    try { x = qualityRecord(raw, [...FIELDS]); } catch { return fail('条目字段含未知或非法字段。'); }
    if (FIELDS.some(k => !Object.hasOwn(x, k))) return fail('条目字段不完整。');
    if (typeof x.type !== 'string' || !Object.hasOwn(REFERENCE_TYPES, x.type)) return fail('文献类型不受支持。');
    if (!Array.isArray(x.authors) || x.authors.length > 30) return fail('责任者最多 30 个。');
    const entry = { ...Object.fromEntries(FIELDS.filter(k => k !== 'type' && k !== 'authors').map(k => [k, line(x[k], LIMITS[k], k)])), type: x.type as ReferenceType, authors: x.authors.map(a => line(a, 120, '责任者')) } as ReferenceEntry;
    if (!entry.id.trim()) return fail('条目缺少标识。');
    return entry;
  });
  if (new Set(entries.map(e => e.id)).size !== entries.length) return fail('条目标识重复。');
  return entries;
}

const CJK = /[㐀-鿿]/u;
/** Up to three authors, then "等" (Chinese) or "et al." (other languages), as GB/T 7714 lists them. */
function authorList(entry: ReferenceEntry): string {
  const names = entry.authors.map(a => a.trim()).filter(Boolean);
  if (!names.length) return '';
  const chinese = CJK.test(names[0]) || CJK.test(entry.title);
  return names.length > 3 ? `${names.slice(0, 3).join(', ')}, ${chinese ? '等' : 'et al'}` : names.join(', ');
}
const end = (s: string) => /[.。]$/.test(s) ? s : `${s}.`;

/** One entry formatted for the reference list (without its number). */
export function formatReference(e: ReferenceEntry): string {
  if (e.type === 'other') return e.text.trim();
  // Items left blank are left out with their punctuation, so an unfinished record never prints stray marks.
  const t = (s: string) => s.trim(), who = authorList(e), head = who ? `${who}. ` : '';
  // Pages follow the year or volume with a colon ("2015: 12-20", "43(5): 12-20"); after a publisher alone, a comma.
  const publication = (place: string, publisher: string, year: string, pages = '') => {
    const issuer = [t(place), t(publisher)].filter(Boolean).join(': '), dated = t(year) ? `${t(year)}${t(pages) ? `: ${t(pages)}` : ''}` : t(pages);
    return [issuer, dated].filter(Boolean).join(', ');
  };
  const dated = [t(e.year), `${t(e.volume)}${t(e.issue) ? `(${t(e.issue)})` : ''}`].filter(Boolean).join(', ');
  const issue = t(e.pages) ? (dated ? `${dated}: ${t(e.pages)}` : t(e.pages)) : dated;
  const parts = (title: string, rest: string) => end(`${head}${title}${rest ? `. ${rest}` : ''}`);
  switch (e.type) {
    case 'J': return parts(`${t(e.title)}[J]`, [t(e.source), issue].filter(Boolean).join(', ')) + (t(e.doi) ? ` DOI: ${t(e.doi)}.` : '');
    case 'M': return parts(`${t(e.title)}[M]`, [t(e.edition), publication(e.place, e.publisher, e.year, e.pages)].filter(Boolean).join('. '));
    case 'D': return parts(`${t(e.title)}[D]`, publication(e.place, e.publisher, e.year));
    case 'C': return parts(`${t(e.title)}[C]${t(e.source) ? `//${t(e.source)}` : ''}`, publication(e.place, e.publisher, e.year, e.pages));
    case 'R': return parts(`${t(e.title)}${t(e.number) ? `: ${t(e.number)}` : ''}[R]`, publication(e.place, e.publisher, e.year));
    case 'N': return parts(`${t(e.title)}[N]`, [t(e.source), `${t(e.date)}${t(e.pages) ? `(${t(e.pages)})` : ''}`].filter(Boolean).join(', '));
    case 'S': return parts(`${t(e.title)}${t(e.number) ? `: ${t(e.number)}` : ''}[S]`, publication(e.place, e.publisher, e.year));
    case 'EB/OL': return parts(`${t(e.title)}[EB/OL]`, [`${t(e.date) ? `(${t(e.date)})` : ''}${t(e.accessed) ? `[${t(e.accessed)}]` : ''}`, t(e.url)].filter(Boolean).join('. '));
  }
}
/** An entry with nothing to print yet: no title (or, for a verbatim entry, no text). */
export const unfinishedReference = (e: ReferenceEntry) => e.type === 'other' ? !e.text.trim() : !e.title.trim();

const REQUIRED: Record<ReferenceType, readonly (keyof ReferenceEntry)[]> = {
  J: ['authors', 'title', 'source', 'year'], M: ['authors', 'title', 'place', 'publisher', 'year'], D: ['authors', 'title', 'place', 'publisher', 'year'],
  C: ['authors', 'title', 'source', 'publisher', 'year'], R: ['title', 'publisher', 'year'], N: ['title', 'source', 'date'], S: ['title', 'number'],
  'EB/OL': ['title', 'accessed', 'url'], other: ['text'],
};
const FIELD_NAMES: Partial<Record<keyof ReferenceEntry, string>> = {
  authors: '责任者', title: '题名', source: '刊名或文集名', publisher: '出版者或机构', place: '出版地', year: '年份', date: '日期', accessed: '引用日期', url: '链接', number: '编号', text: '著录内容',
};
/** Fields an entry still lacks for a complete GB/T 7714 record. */
export function missingFields(e: ReferenceEntry): string[] {
  return REQUIRED[e.type].filter(k => k === 'authors' ? !e.authors.some(a => a.trim()) : !(e[k] as string).trim()).map(k => FIELD_NAMES[k] ?? k);
}
/** What a record still needs to be complete and well-formed: missing items, a link without http(s), a date not written YYYY-MM-DD. */
export function referenceProblems(e: ReferenceEntry): string[] {
  const problems = missingFields(e).length ? [`缺${missingFields(e).join('、')}`] : [];
  if (e.url && !/^https?:\/\/[^\s<>"]+$/.test(e.url)) problems.push('链接须以 http:// 或 https:// 开头且不含空格');
  if ([e.date, e.accessed].some(d => d && !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(d))) problems.push('日期写作 YYYY-MM-DD');
  return problems;
}

export const citationToken = (id: string) => `[[引:${id}]]`;
const CITE = /\[\[引:([^\]\n]{1,80})\]\]/g;
const citedIn = (content: EditorContent) => content.report.filter(s => reportPart(s.title) !== 'references').flatMap(s => [s.body, ...(s.blocks ?? []).map(b => b.text)]);

/** Numbers by order of first citation in the text; entries never cited follow in their stored order. */
export function referenceNumbers(content: EditorContent): { numbers: Map<string, number>; order: ReferenceEntry[]; uncited: ReferenceEntry[] } {
  const entries = content.references ?? [], known = new Set(entries.map(e => e.id)), cited: string[] = [];
  for (const text of citedIn(content)) for (const match of text.matchAll(CITE)) if (known.has(match[1]) && !cited.includes(match[1])) cited.push(match[1]);
  const uncited = entries.filter(e => !cited.includes(e.id));
  const order = [...cited.map(id => entries.find(e => e.id === id)!), ...uncited];
  return { numbers: new Map(order.map((e, i) => [e.id, i + 1])), order, uncited };
}

/** "[1,3,5-7]": consecutive runs of three or more become a range. */
export function citationLabel(numbers: readonly number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b), parts: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j - i >= 2 ? `${sorted[i]}-${sorted[j]}` : sorted.slice(i, j + 1).join(','));
    i = j + 1;
  }
  return `[${parts.join(',')}]`;
}

export type CitationSegment = { text: string; cite?: boolean; missing?: boolean };
/** Text split into plain runs and citation marks; adjacent tokens merge into one mark, unknown IDs are flagged. */
export function citationSegments(text: string, numbers: ReadonlyMap<string, number>): CitationSegment[] {
  const out: CitationSegment[] = [];
  let last = 0, group: number[] = [], missing = false, groupEnd = -1;
  const flush = () => { if (group.length || missing) out.push(missing ? { text: '[文献引用失效]', cite: true, missing: true } : { text: citationLabel(group), cite: true }); group = []; missing = false; };
  for (const match of text.matchAll(CITE)) {
    if (match.index !== groupEnd) { flush(); if (match.index > last) out.push({ text: text.slice(last, match.index) }); }
    const n = numbers.get(match[1]);
    if (n === undefined) missing = true; else group.push(n);
    last = groupEnd = match.index + match[0].length;
  }
  flush();
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Export-time resolution to plain text ("…研究[1,3]。"), stopping on a citation whose entry was deleted. */
export function resolveCitations(text: string, numbers: ReadonlyMap<string, number>, where: string): string {
  const segments = citationSegments(text, numbers);
  if (segments.some(s => s.missing)) throw Error(`「${where}」中有文献引用已失效（对应的参考文献已删除），请重新插入引用后再导出。`);
  return segments.map(s => s.text).join('');
}

/**
 * Lines of an older references section written by hand, as raw entries: a leading "[n]" is dropped and the rest kept
 * verbatim (tabs become spaces), so they can be numbered and cited like any other entry. Nothing is ever cut: a line
 * too long, or more lines than the list can hold beside `existing` entries, refuses the whole import.
 */
export function importReferenceLines(body: string, existing = 0): ReferenceEntry[] {
  const lines = body.split(/\r\n|\r|\n/).map(l => l.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim().replace(/^[[［]\s*\d+\s*[\]］]\s*/u, '')).filter(Boolean);
  const long = lines.findIndex(l => l.length > LIMITS.text);
  if (long >= 0) throw Error(`第 ${long + 1} 条超过 ${LIMITS.text} 字，请先在正文中拆分或删减，再转为文献条目。`);
  if (existing + lines.length > REFERENCE_LIMIT) throw Error(`转换后将有 ${existing + lines.length} 条文献，超过 ${REFERENCE_LIMIT} 条上限；请先删去部分条目。`);
  return lines.map(text => ({ ...emptyReference('other'), text }));
}
