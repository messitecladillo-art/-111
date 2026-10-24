/**
 * Term handling for the topic lab: normalization, user thesaurus, and keyword extraction from titles
 * and abstracts when an export carries no keyword field. Counts are document frequencies (a term is
 * counted once per record), the same convention VOSviewer calls full counting.
 */
import type { LitRecord } from './parse.ts';

export type TermSource = 'keywords' | 'keywords+plus' | 'title' | 'title+abstract';
export type TermOptions = { source: TermSource; synonyms?: Map<string, string>; exclude?: Set<string>; minLength?: number };
export type TermStat = { key: string; label: string; df: number; meanYear: number | null; meanCitations: number | null; byYear: Map<number, number> };
export type TermIndex = { terms: Map<string, TermStat>; docs: string[][]; records: LitRecord[]; source: TermSource; notes: string[] };

const PLURAL_KEEP = new Set(['series', 'species', 'news', 'gas', 'bus', 'lens', 'status', 'analysis', 'basis', 'thesis', 'crisis', 'process', 'access', 'business', 'success', 'stress', 'loss', 'class', 'mass', 'press', 'glass', 'grass', 'cross', 'data', 'media', 'criteria', 'covid', 'sars', 'lbs', 'ses', 'ess', 'aids']);
function singular(word: string): string {
  if (word.length <= 4 || PLURAL_KEEP.has(word) || /(ss|us|is|ics|ous|sis|xis)$/.test(word) || !/^[a-z-]+$/.test(word)) return word;
  if (/ies$/.test(word) && word.length > 5) return word.slice(0, -3) + 'y';
  if (/(ches|shes|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (/s$/.test(word)) return word.slice(0, -1);
  return word;
}
/** Comparison key: width-folded, lower-cased Latin, single spaces, last English word singularized. */
export function termKey(raw: string): string {
  // Plural acronyms (EVs, SMEs) lose the s before case folding hides that they are acronyms.
  let s = raw.normalize('NFKC').trim().replace(/\b([A-Z][A-Z0-9]+)s$/, '$1').toLowerCase().replace(/[　\s]+/g, ' ').replace(/^[\s"'“”‘’()（）[\]【】《》<>.,;:!?-]+|[\s"'“”‘’()（）[\]【】《》<>.,;:!?-]+$/g, '').trim();
  if (/^[a-z0-9][a-z0-9 \-/&]*$/.test(s)) { const parts = s.split(' '); parts[parts.length - 1] = singular(parts[parts.length - 1]); s = parts.join(' '); }
  return s;
}

/** "原词 => 统一词" per line; keys compare after termKey. */
export function parseThesaurus(text: string): { synonyms: Map<string, string>; exclude: Set<string> } {
  const synonyms = new Map<string, string>(), exclude = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const m = t.split(/\s*(?:=>|→|＝>)\s*/);
    if (m.length === 2 && m[0] && m[1]) synonyms.set(termKey(m[0]), termKey(m[1]));
    else exclude.add(termKey(t));
  }
  return { synonyms, exclude };
}

const EN_STOP = new Set(('a about above across after again against all almost along also although always am among an and another any are around as at be because been before being below between both but by can could did do does doing done down during each either else enough especially even ever every few for from further had has have having he her here hers him his how however i if in into is it its itself just least less like made make many may me might more most much must my neither no nor not now of off often on once one only or other others our out over own per perhaps rather same several she should since so some such than that the their them then there therefore these they this those though through thus to too toward towards under until up upon us very via was we were what when where whether which while who whom whose why will with within without would yet you your ' +
  'study studies paper article research result results finding findings method methods approach approaches based using use used new show shows shown propose proposed present presents provide provides provided analysis analyses analyze analyzed effect effects impact impacts role significant significantly important various different two three first second however within among case cases data model models evidence existing current recent further review literature aim aims objective purpose conclusion conclusions implication implications discuss discussed investigate investigated examine examined explore explored develop developed').split(/\s+/));
// Generic research wording is cut out before segmentation; these phrases never name a topic.
const ZH_STOP_PHRASES = ['基于', '关于', '对于', '面向', '以及', '研究', '分析', '探究', '探析', '探讨', '探索', '调查', '调研', '视角', '视域', '背景下', '路径', '策略', '对策', '建议', '现状', '问题', '影响因素', '机制', '实证', '为例', '我国', '报告'];
const ZH_STOP_RE = new RegExp(ZH_STOP_PHRASES.sort((a, b) => b.length - a.length).join('|'), 'g');
// Single-character function words end a phrase only when the segmenter returns them as a whole word,
// so 上海 or 中医 are never cut.
const ZH_STOP_SEGMENTS = new Set(['的', '与', '及', '和', '或', '对', '之', '以', '为', '于', '下', '并', '等', '在', '其', '从', '向', '把', '被', '是']);
const HAN = /\p{Script=Han}/u;
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;

/** Chinese phrases built from 1–4 consecutive dictionary words, never starting or ending inside a word. */
function chinesePhrases(text: string, out: Set<string>) {
  for (const part of text.normalize('NFKC').replace(ZH_STOP_RE, '|').split(/[|\s]+/)) {
    if (!HAN.test(part)) continue;
    const runs: string[][] = [[]];
    if (segmenter) {
      for (const seg of segmenter.segment(part)) {
        const w = seg.segment;
        if (seg.isWordLike && /^[\p{Script=Han}A-Za-z0-9]+$/u.test(w) && !ZH_STOP_SEGMENTS.has(w)) runs[runs.length - 1].push(w);
        else runs.push([]);
      }
    } else {
      // Without a word segmenter fall back to character runs between punctuation.
      for (const run of part.split(/[^\p{Script=Han}A-Za-z0-9]+/u)) runs.push([...run]);
    }
    for (const run of runs) for (let n = 1; n <= 4; n++) for (let i = 0; i + n <= run.length; i++) {
      const g = run.slice(i, i + n).join('');
      if (g.length >= 2 && g.length <= 10 && HAN.test(g) && !/^\d/.test(g)) out.add(g);
    }
  }
}

/** Candidate phrases for one text: English stop-word-bounded 1–3-grams and Chinese word n-grams. */
function candidates(text: string): Set<string> {
  const out = new Set<string>();
  const lower = text.normalize('NFKC').toLowerCase();
  // English: runs of non-stop tokens → n-grams up to 3.
  for (const chunk of lower.split(/[.,;:!?()[\]{}"“”'‘’/\\|]+/)) {
    const toks = chunk.split(/[^a-z0-9-]+/).filter(Boolean);
    let run: string[] = [];
    const flush = () => { for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= run.length; i++) { const g = run.slice(i, i + n); if (g[0].length < 3 && n === 1) continue; out.add(termKey(g.join(' '))); } run = []; };
    for (const t of toks) { if (EN_STOP.has(t) || /^\d+$/.test(t) || t.length < 2) flush(); else run.push(t); }
    flush();
  }
  if (HAN.test(text)) chinesePhrases(text, out);
  return out;
}

/**
 * Keep candidates that recur in at least minDf records, then drop a phrase when a longer phrase
 * containing it accounts for nearly all of its occurrences (so "电动" yields to "电动汽车").
 */
function extractTerms(texts: string[], minDf: number): string[][] {
  const per = texts.map(candidates), df = new Map<string, number>();
  for (const set of per) for (const c of set) df.set(c, (df.get(c) ?? 0) + 1);
  const kept = [...df].filter(([, n]) => n >= minDf).sort((a, b) => b[1] - a[1]).slice(0, 4000).map(([c]) => c).sort((a, b) => b.length - a.length);
  const keep: string[] = [];
  for (const c of kept) {
    const n = df.get(c)!;
    if (!keep.some(longer => longer.includes(c) && df.get(longer)! >= n * .8)) keep.push(c);
  }
  const keepSet = new Set(keep);
  return per.map(set => [...set].filter(c => keepSet.has(c)));
}

export const ABSTRACT_LIMIT = 1500;

export function buildTermIndex(records: LitRecord[], opts: TermOptions): TermIndex {
  const synonyms = opts.synonyms ?? new Map(), exclude = opts.exclude ?? new Set();
  const minLen = opts.minLength ?? 2, notes: string[] = [];
  let raw: string[][];
  if (opts.source === 'keywords' || opts.source === 'keywords+plus') raw = records.map(r => opts.source === 'keywords' ? r.keywords : [...r.keywords, ...r.keywordsPlus]);
  else {
    const withAbstract = opts.source === 'title+abstract' && records.length <= ABSTRACT_LIMIT;
    if (opts.source === 'title+abstract' && !withAbstract) notes.push(`记录超过 ${ABSTRACT_LIMIT} 条，摘要抽词改为只用题名。`);
    raw = extractTerms(records.map(r => withAbstract ? `${r.title}. ${r.abstract}` : r.title), Math.max(2, Math.ceil(records.length * .004)));
    notes.push('抽词按出现频次切分短语，未使用词典；请在「合并与排除」中清理不成词的片段。');
  }
  const labels = new Map<string, Map<string, number>>();
  const docs = raw.map(list => {
    const keys = new Set<string>();
    for (const surface of list) {
      let k = termKey(surface);
      k = synonyms.get(k) ?? k;
      if (!k || k.length < minLen || exclude.has(k)) continue;
      keys.add(k);
      const m = labels.get(k) ?? new Map<string, number>(); const lab = surface.trim(); m.set(lab, (m.get(lab) ?? 0) + 1); labels.set(k, m);
    }
    return [...keys];
  });
  type Acc = { df: number; ys: number; yn: number; cs: number; cn: number; byYear: Map<number, number> };
  const acc = new Map<string, Acc>();
  docs.forEach((keys, i) => {
    const r = records[i];
    for (const k of keys) {
      let a = acc.get(k);
      if (!a) { a = { df: 0, ys: 0, yn: 0, cs: 0, cn: 0, byYear: new Map() }; acc.set(k, a); }
      a.df++;
      if (r.year !== null) { a.ys += r.year; a.yn++; a.byYear.set(r.year, (a.byYear.get(r.year) ?? 0) + 1); }
      if (r.citations !== null) { a.cs += r.citations; a.cn++; }
    }
  });
  const terms = new Map<string, TermStat>();
  for (const [k, a] of acc) {
    // Display the most frequent surface form; a synonym target that never appears verbatim keeps its key.
    const forms = labels.get(k);
    const label = forms ? [...forms].sort((x, y) => y[1] - x[1] || x[0].length - y[0].length)[0][0] : k;
    terms.set(k, { key: k, label, df: a.df, meanYear: a.yn ? a.ys / a.yn : null, meanCitations: a.cn ? a.cs / a.cn : null, byYear: a.byYear });
  }
  return { terms, docs, records, source: opts.source, notes };
}

/** Pick the richest available source: author keywords when most records carry them, else titles. */
export function defaultSource(records: LitRecord[]): TermSource {
  if (!records.length) return 'keywords';
  const withKw = records.filter(r => r.keywords.length > 0).length / records.length;
  if (withKw >= .6) return 'keywords';
  const withAbs = records.filter(r => r.abstract.length > 40).length / records.length;
  return withAbs >= .6 ? 'title+abstract' : 'title';
}

export const SOURCE_LABELS: Record<TermSource, string> = { keywords: '作者关键词', 'keywords+plus': '作者关键词 + 数据库扩展词', title: '题名抽词', 'title+abstract': '题名与摘要抽词' };
