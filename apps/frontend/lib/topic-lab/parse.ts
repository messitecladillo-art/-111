/**
 * Literature export parsers for the topic lab. Everything runs locally on text the user exported
 * from a database; nothing is fetched or inferred. Unknown fields stay empty rather than guessed.
 *
 * Supported: Web of Science plain text (FN/PT … ER), RIS (TY  - … ER  -), BibTeX (@article{…}),
 * RefWorks tagged text as exported by CNKI (RT … ), and EndNote tagged text (%0 … ).
 */
/** 'library' marks records built from the in-app award-case index rather than a database export. */
export type LitFormat = 'wos' | 'ris' | 'bibtex' | 'refworks' | 'endnote' | 'library';
export type LitRecord = {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  source: string;
  /** Author keywords (WoS DE, RIS KW, CNKI K1 …). */
  keywords: string[];
  /** Database-assigned keywords such as WoS Keywords Plus (ID). */
  keywordsPlus: string[];
  abstract: string;
  /** Times cited as reported by the exporting database at export time. */
  citations: number | null;
  doi: string;
  /** Normalized cited-reference keys (WoS CR / BibTeX Cited-References). */
  refs: string[];
  /** Readable cited-reference strings, aligned with refs. */
  refLabels: string[];
  format: LitFormat;
};
export type ParseReport = { format: LitFormat | 'unknown'; records: LitRecord[]; skipped: number; warnings: string[] };

export const MAX_RECORDS = 20000;

const clean = (s: string) => s.replace(/[\s\u3000]+/g, ' ').trim();
const cleanTitle = (s: string) => clean(s).replace(/[.。]\s*$/, '');
export function normalizeDoi(s: string): string {
  const m = clean(s).toLowerCase().match(/10\.\d{4,9}\/\S+/);
  return m ? m[0].replace(/[.,;]+$/, '') : '';
}
function parseYear(s: string): number | null {
  const m = String(s).match(/(19|20)\d{2}/);
  const y = m ? Number(m[0]) : NaN;
  return y >= 1900 && y <= 2100 ? y : null;
}
function parseIntOrNull(s: string): number | null {
  const n = Number(String(s).replace(/[^\d]/g, ''));
  return String(s).trim() && Number.isFinite(n) ? n : null;
}
export function splitKeywords(s: string): string[] {
  const parts = /[;；]/.test(s) ? s.split(/[;；]/) : s.split(/[,，]/);
  return parts.map(p => clean(p).replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')).filter(p => p.length > 0 && p.length <= 80);
}
/** A cited reference is keyed by its DOI when present, otherwise by first author, year and source. */
export function referenceKey(raw: string): string {
  const doi = normalizeDoi(raw);
  if (doi) return 'doi:' + doi;
  const parts = clean(raw).toUpperCase().split(',').map(p => p.trim()).filter(Boolean);
  return parts.slice(0, 3).join('|');
}

export function detectFormat(text: string): LitFormat | 'unknown' {
  const head = text.slice(0, 6000).replace(/^﻿/, '');
  if (/^(FN |VR |PT [A-Z]\s*$)/m.test(head) && /^ER\s*$/m.test(text)) return 'wos';
  if (/^TY {2}- /m.test(head)) return 'ris';
  if (/^\s*@\w+\s*[{(]/m.test(head)) return 'bibtex';
  if (/^RT \S/m.test(head) && /^(A1|T1) /m.test(head)) return 'refworks';
  if (/^%0 /m.test(head) || (/^%T /m.test(head) && /^%A /m.test(head))) return 'endnote';
  return 'unknown';
}

type Raw = Record<string, string[]>;
const first = (r: Raw, ...keys: string[]) => { for (const k of keys) if (r[k]?.length) return r[k].join(' '); return ''; };
const all = (r: Raw, ...keys: string[]) => keys.flatMap(k => r[k] ?? []);

function fromRaw(r: Raw, format: LitFormat, map: { title: string[]; authors: string[]; year: string[]; source: string[]; keywords: string[]; plus?: string[]; abstract: string[]; citations?: string[]; doi: string[]; refs?: string[] }): LitRecord | null {
  const title = cleanTitle(first(r, ...map.title));
  if (!title) return null;
  const refLabels = (map.refs ? all(r, ...map.refs) : []).map(clean).filter(Boolean);
  return {
    id: '', title,
    authors: all(r, ...map.authors).flatMap(a => a.split(/[;；]/)).map(clean).filter(Boolean),
    year: parseYear(first(r, ...map.year)),
    source: clean(first(r, ...map.source)),
    keywords: all(r, ...map.keywords).flatMap(splitKeywords),
    keywordsPlus: map.plus ? all(r, ...map.plus).flatMap(splitKeywords) : [],
    abstract: clean(first(r, ...map.abstract)),
    citations: map.citations ? parseIntOrNull(first(r, ...map.citations)) : null,
    doi: normalizeDoi(first(r, ...map.doi)),
    refs: refLabels.map(referenceKey),
    refLabels,
    format,
  };
}

function parseWos(text: string): { records: LitRecord[]; skipped: number } {
  const records: LitRecord[] = []; let skipped = 0;
  let cur: Raw = {}, tag = '';
  const wrapped = new Set(['TI', 'SO', 'AB', 'DE', 'ID']);
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (/^ER\s*$/.test(line)) {
      const rec = fromRaw(cur, 'wos', { title: ['TI'], authors: ['AU', 'AF'], year: ['PY', 'EA'], source: ['SO'], keywords: ['DE'], plus: ['ID'], abstract: ['AB'], citations: ['TC', 'Z9'], doi: ['DI'], refs: ['CR'] });
      if (rec) records.push(rec); else if (Object.keys(cur).length) skipped++;
      cur = {}; tag = ''; continue;
    }
    const m = line.match(/^([A-Z][A-Z0-9]) (.*)$/) ?? line.match(/^([A-Z][A-Z0-9])$/);
    if (m && !line.startsWith('   ')) { tag = m[1]; if (tag === 'FN' || tag === 'VR' || tag === 'EF') { tag = ''; continue; } (cur[tag] ??= []).push(m[2] ?? ''); continue; }
    if (tag && line.startsWith('   ')) {
      const v = line.slice(3);
      if (wrapped.has(tag)) { const arr = cur[tag]; arr[arr.length - 1] += ' ' + v; } else (cur[tag] ??= []).push(v);
    }
  }
  return { records, skipped };
}

function parseTagged(text: string, re: RegExp, start: (tag: string) => boolean, end: ((tag: string) => boolean) | null, build: (r: Raw) => LitRecord | null): { records: LitRecord[]; skipped: number } {
  const records: LitRecord[] = []; let skipped = 0;
  let cur: Raw = {}, tag = '';
  const flush = () => { if (Object.keys(cur).length) { const rec = build(cur); if (rec) records.push(rec); else skipped++; } cur = {}; tag = ''; };
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(re);
    if (m) {
      const t = m[1];
      if (end?.(t)) { flush(); continue; }
      if (start(t) && Object.keys(cur).length) flush();
      tag = t; (cur[tag] ??= []).push(m[2] ?? ''); continue;
    }
    if (!line.trim()) { if (!end) { /* blank line separates RefWorks / EndNote records */ if (Object.keys(cur).length && (cur.T1 || cur.TI || cur.T)) flush(); } continue; }
    if (tag) { const arr = cur[tag]; arr[arr.length - 1] += ' ' + line.trim(); }
  }
  flush();
  return { records, skipped };
}

function parseRis(text: string) {
  return parseTagged(text, /^([A-Z][A-Z0-9]) {2}- ?(.*)$/, t => t === 'TY', t => t === 'ER', r => fromRaw(r, 'ris', { title: ['TI', 'T1', 'CT'], authors: ['AU', 'A1', 'A2'], year: ['PY', 'Y1', 'DA'], source: ['T2', 'JO', 'JF', 'JA', 'BT'], keywords: ['KW'], abstract: ['AB', 'N2'], doi: ['DO', 'DOI'], citations: ['TC'] }));
}
function parseRefworks(text: string) {
  return parseTagged(text, /^(RT|SR|A1|A2|A3|AD|T1|T2|JF|JO|YR|FD|IS|vo|VO|OP|SP|K1|AB|SN|CN|LA|DS|LK|TD|DO|PB|CL|UL|NO|ID|ED|PP|WP|AU|TI|KW) (.*)$/, t => t === 'RT', null, r => fromRaw(r, 'refworks', { title: ['T1', 'TI'], authors: ['A1', 'AU'], year: ['YR', 'FD'], source: ['JF', 'JO', 'T2'], keywords: ['K1', 'KW'], abstract: ['AB'], doi: ['DO', 'DOI'] }));
}
function parseEndnote(text: string) {
  return parseTagged(text, /^%([0-9A-Z@+#$!&()*~^]) ?(.*)$/, t => t === '0', null, r => fromRaw(r, 'endnote', { title: ['T'], authors: ['A'], year: ['D'], source: ['J', 'B'], keywords: ['K'], abstract: ['X'], doi: ['R'] }));
}

function parseBibtex(text: string): { records: LitRecord[]; skipped: number } {
  const records: LitRecord[] = []; let skipped = 0, i = 0;
  const s = text.replace(/^﻿/, '');
  while ((i = s.indexOf('@', i)) !== -1) {
    const head = s.slice(i).match(/^@(\w+)\s*[{(]/);
    if (!head) { i++; continue; }
    const type = head[1].toLowerCase();
    let j = i + head[0].length, depth = 1;
    const bodyStart = j;
    while (j < s.length && depth > 0) { if (s[j] === '{' || s[j] === '(') depth++; else if (s[j] === '}' || s[j] === ')') depth--; j++; }
    const body = s.slice(bodyStart, j - 1);
    i = j;
    if (type === 'comment' || type === 'string' || type === 'preamble') continue;
    const fields: Raw = {};
    let k = body.indexOf(',') + 1;
    while (k > 0 && k < body.length) {
      const fm = body.slice(k).match(/^\s*([\w-]+)\s*=\s*/);
      if (!fm) break;
      const name = fm[1].toLowerCase(); k += fm[0].length;
      let value = '';
      if (body[k] === '{') { let d = 1, e = k + 1; while (e < body.length && d > 0) { if (body[e] === '{') d++; else if (body[e] === '}') d--; e++; } value = body.slice(k + 1, e - 1); k = e; }
      else if (body[k] === '"') { const e = body.indexOf('"', k + 1); value = body.slice(k + 1, e); k = e + 1; }
      else { const e = body.slice(k).search(/[,\n]/); value = e === -1 ? body.slice(k) : body.slice(k, k + e); k += e === -1 ? body.length : e; }
      const comma = body.indexOf(',', k); k = comma === -1 ? body.length : comma + 1;
      fields[name] = [value];
    }
    const strip = (v: string) => v.replace(/[{}]/g, '');
    const refs = (fields['cited-references']?.[0] ?? '').split(/\r?\n/).map(strip).map(clean).filter(Boolean);
    const rec: Raw = Object.fromEntries(Object.entries(fields).map(([k2, v]) => [k2, v.map(strip)]));
    rec.author = (rec.author?.[0] ?? '').split(/\s+and\s+/i);
    rec.__refs = refs;
    const built = fromRaw(rec, 'bibtex', { title: ['title'], authors: ['author'], year: ['year', 'date'], source: ['journal', 'booktitle'], keywords: ['keywords', 'author-keywords'], plus: ['keywords-plus'], abstract: ['abstract'], citations: ['times-cited', 'citation-count'], doi: ['doi'], refs: ['__refs'] });
    if (built) records.push(built); else skipped++;
  }
  return { records, skipped };
}

export function parseLiterature(text: string): ParseReport {
  const format = detectFormat(text);
  const warnings: string[] = [];
  if (format === 'unknown') return { format, records: [], skipped: 0, warnings: ['无法识别文件格式。请从数据库导出为 Web of Science 纯文本、RIS、BibTeX、RefWorks 或 EndNote 格式。'] };
  const out = format === 'wos' ? parseWos(text) : format === 'ris' ? parseRis(text) : format === 'bibtex' ? parseBibtex(text) : format === 'refworks' ? parseRefworks(text) : parseEndnote(text);
  let records = out.records;
  if (records.length > MAX_RECORDS) { warnings.push(`单个文件超过 ${MAX_RECORDS} 条，只读取前 ${MAX_RECORDS} 条。`); records = records.slice(0, MAX_RECORDS); }
  if (out.skipped) warnings.push(`${out.skipped} 条记录缺少题名，已跳过。`);
  return { format, records, skipped: out.skipped, warnings };
}

const titleKey = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
/** Merge several parsed files, dropping duplicates by DOI, then by normalized title. */
export function mergeRecords(lists: LitRecord[][]): { records: LitRecord[]; duplicates: number } {
  const seen = new Set<string>(), records: LitRecord[] = [];
  let duplicates = 0;
  for (const list of lists) for (const r of list) {
    const keys = [r.doi ? 'doi:' + r.doi : '', 't:' + titleKey(r.title) + ':' + (r.year ?? '')].filter(Boolean);
    if (keys.some(k => seen.has(k))) { duplicates++; continue; }
    keys.forEach(k => seen.add(k));
    records.push({ ...r, id: `p${records.length}` });
  }
  return { records, duplicates };
}

export const FORMAT_LABELS: Record<LitFormat, string> = { wos: 'Web of Science 纯文本', ris: 'RIS', bibtex: 'BibTeX', refworks: 'RefWorks（知网）', endnote: 'EndNote（知网）', library: '内置获奖案例索引' };
