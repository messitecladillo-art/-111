import MiniSearch from 'minisearch';
import type { KnowledgeContext, KnowledgeEntry, KnowledgeSearchHit, KnowledgeSearchOptions } from './types.ts';

const STOP_WORDS = new Set(['的', '了', '吗', '呢', '什么', '怎么', '如何', '为什么', '是不是', '是否', '一个', '这个', '我', '请问', '问题', 'the', 'a', 'an', 'is', 'what', 'how', 'why', 'and', 'of', 'to']);
const MAX_QUERY = 300;
/** Same normalisation in the index and query; symbols remain searchable aliases. */
export function normalizeKnowledgeText(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[’‘]/g, "'").replace(/\b([a-z]+)'s\b/g, '$1')
    .replace(/([a-z])\.(?=[a-z])/g, '$1').replace(/\b([a-z]{2,})\.(?=\s|$)/g, '$1')
    .replace(/α/g, ' alpha ').replace(/β/g, ' beta ').replace(/χ/g, ' chi ').replace(/ρ/g, ' rho ')
    .replace(/[\p{P}\p{S}\s]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
const exactKey = (value: string) => normalizeKnowledgeText(value).replace(/\s/g, '');
let segmenter: Intl.Segmenter | null = null;
try { segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' }); } catch { /* Bigrams below support older engines. */ }
/** CJK word segmentation plus bigrams handles unknown compounds without a remote tokenizer. */
export function tokenizeKnowledgeText(value: string): string[] {
  const normalized = normalizeKnowledgeText(value);
  const tokens = new Set<string>();
  for (const word of normalized.match(/[a-z\d]+|[\p{Script=Han}]+/gu) ?? []) {
    if (STOP_WORDS.has(word)) continue;
    tokens.add(word);
    if (/\p{Script=Han}/u.test(word)) {
      if (segmenter) for (const part of segmenter.segment(word)) if (part.isWordLike && !STOP_WORDS.has(part.segment)) tokens.add(part.segment);
      const characters = Array.from(word);
      for (let i = 0; i < characters.length - 1; i++) {
        const pair = characters[i] + characters[i + 1];
        if (!STOP_WORDS.has(pair)) tokens.add(pair);
      }
    }
  }
  return [...tokens].filter(token => token.length > 1 || /^\d$/.test(token));
}
function primaryQueryTerms(value: string): string[] {
  const words = new Set<string>();
  for (const phrase of value.match(/[a-z\d]+|[\p{Script=Han}]+/gu) ?? []) {
    if (segmenter && /\p{Script=Han}/u.test(phrase)) {
      for (const part of segmenter.segment(phrase)) if (part.isWordLike && part.segment.length >= 2 && !STOP_WORDS.has(part.segment)) words.add(part.segment);
    } else if (!STOP_WORDS.has(phrase)) words.add(phrase);
  }
  return [...words];
}

const MODULE_DOMAINS: Partial<Record<KnowledgeContext['module'], string[]>> = {
  design: ['research', 'stats'], sampling: ['stats', 'research'], analysis: ['stats', 'ml', 'computing'],
  editor: ['research', 'philosophy'], defense: ['philosophy', 'stats', 'research'], silicon: ['ml', 'research'],
  canvas: ['computing', 'research'], diagnose: ['research', 'social'], exam: ['research', 'stats'],
};
function contextBoost(entry: KnowledgeEntry, context?: KnowledgeContext): number {
  if (!context) return 0;
  let score = MODULE_DOMAINS[context.module]?.includes(entry.domain) ? 20 : 0;
  const names = [entry.name, entry.englishName ?? '', ...entry.aliases].map(exactKey);
  if (context.helpTags.some(tag => tag === entry.id || names.includes(exactKey(tag)))) score += 80;
  return score;
}
type SearchDocument = { id: string; name: string; aliases: string; definition: string; questions: string; usage: string };
export type KnowledgeSearch = {
  search(query: string, options?: KnowledgeSearchOptions): KnowledgeSearchHit[];
  recognize(text: string, options?: KnowledgeSearchOptions): KnowledgeSearchHit[];
  readonly size: number;
};
export function createKnowledgeSearch(entries: readonly KnowledgeEntry[], options: { includeDrafts?: boolean } = {}): KnowledgeSearch {
  if (entries.length > 5000) throw new Error('知识索引最多支持 5,000 条概念。');
  const documents = entries.filter(entry => options.includeDrafts || entry.review.status === 'reviewed');
  const byId = new Map<string, KnowledgeEntry>();
  const exactNames = new Map<string, Array<{ id: string; name: string; canonical: boolean }>>();
  const names: Array<{ key: string; name: string; id: string; canonical: boolean }> = [];
  const index = new MiniSearch<SearchDocument>({
    fields: ['name', 'aliases', 'definition', 'questions', 'usage'],
    tokenize: tokenizeKnowledgeText,
    processTerm: token => token,
    searchOptions: { boost: { name: 8, aliases: 7, questions: 3, definition: 2, usage: 1 }, combineWith: 'OR' },
  });
  for (const entry of documents) {
    if (byId.has(entry.id)) throw new Error(`知识索引包含重复 ID：${entry.id}`);
    byId.set(entry.id, entry);
    for (const [position, name] of [entry.name, entry.englishName ?? '', ...entry.aliases].entries()) {
      const key = exactKey(name);
      if (!key) continue;
      const item = { id: entry.id, name, canonical: position === 0 };
      exactNames.set(key, [...(exactNames.get(key) ?? []), item]);
      names.push({ ...item, key });
    }
  }
  index.addAll(documents.map(entry => ({ id: entry.id, name: `${entry.name} ${entry.englishName ?? ''}`, aliases: entry.aliases.join(' '), definition: `${entry.definition} ${entry.examples.join(' ')}`, questions: entry.questions.map(item => `${item.question} ${item.answer}`).join(' '), usage: entry.uses.join(' ') })));

  function search(query: string, searchOptions: KnowledgeSearchOptions = {}): KnowledgeSearchHit[] {
    const limit = Math.min(50, Math.max(1, searchOptions.limit ?? 12));
    const normalized = normalizeKnowledgeText(query.slice(0, MAX_QUERY));
    const key = exactKey(normalized);
    const found = new Map<string, KnowledgeSearchHit>();
    const insert = (id: string, match: KnowledgeSearchHit['match'], matchedName: string, weight: number, ambiguous = false) => {
      const entry = byId.get(id);
      if (!entry || (searchOptions.domain && entry.domain !== searchOptions.domain)) return;
      const hit = { entry, score: weight + contextBoost(entry, searchOptions.context), match, matchedName, ambiguous };
      const previous = found.get(id);
      if (!previous || hit.score > previous.score) found.set(id, hit);
      else if (ambiguous) previous.ambiguous = true;
    };
    if (!key) return documents.filter(entry => !searchOptions.domain || entry.domain === searchOptions.domain)
      .map(entry => ({ entry, score: contextBoost(entry, searchOptions.context), match: 'text' as const, matchedName: entry.name, ambiguous: false }))
      .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name, 'zh-CN')).slice(0, limit);
    const exactMatches = exactNames.get(key) ?? [];
    const ambiguous = new Set(exactMatches.map(item => item.id)).size > 1;
    for (const exact of exactMatches) insert(exact.id, exact.canonical ? 'name' : 'alias', exact.name, exact.canonical ? 100000 : 90000, ambiguous);
    if (key.length >= 2) for (const name of names) if (name.key.startsWith(key) && name.key !== key) insert(name.id, 'prefix', name.name, 70000 - Math.min(1000, name.key.length - key.length));
    // A full concept phrase inside a natural question is relevant; one shared syllable is not.
    for (const name of names) {
      const embedded = /\p{Script=Han}/u.test(name.key)
        ? name.key.length >= 2 && key.includes(name.key)
        : (` ${normalized} `).includes(` ${normalizeKnowledgeText(name.name)} `);
      if (embedded && name.key !== key) insert(name.id, name.canonical ? 'name' : 'alias', name.name, 60000 + Math.min(1000, name.key.length), new Set((exactNames.get(name.key) ?? []).map(item => item.id)).size > 1);
    }
    // Long English tokens tolerate one typo; Chinese/symbol near matches do not erase ambiguity.
    const queryTokens = tokenizeKnowledgeText(normalized);
    const primaryTerms = primaryQueryTerms(normalized);
    const shortLatinQuery = queryTokens.length <= 3 && queryTokens.every(token => /^[a-z\d]+$/.test(token));
    const fulltext = index.search(normalized, { boost: { name: 1, aliases: 1, questions: 3, definition: 3, usage: 1 }, prefix: token => token.length >= 2, fuzzy: token => /^[a-z]{4,}$/.test(token) ? 0.34 : false });
    for (const result of fulltext.slice(0, 200)) {
      const titleMatch = Object.values(result.match).some(fields => fields.includes('name') || fields.includes('aliases'));
      const nearName = titleMatch && shortLatinQuery;
      const matchedTerms = primaryTerms.filter(term => Object.hasOwn(result.match, term)).length;
      if (!nearName && !found.has(String(result.id)) && (matchedTerms < Math.min(2, primaryTerms.length) || matchedTerms / Math.max(1, primaryTerms.length) < 0.4)) continue;
      insert(String(result.id), nearName ? 'fuzzy' : 'text', byId.get(String(result.id))?.name ?? '', (nearName ? 50000 : 10000) + Math.min(1000, result.score));
    }
    return [...found.values()].sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name, 'zh-CN')).slice(0, limit);
  }
  function recognize(text: string, searchOptions: KnowledgeSearchOptions = {}): KnowledgeSearchHit[] {
    const normalized = normalizeKnowledgeText(text.slice(0, 12000));
    const compact = normalized.replace(/\s/g, '');
    const found = new Map<string, KnowledgeSearchHit>();
    for (const name of names) {
      // English acronyms must be standalone words: SEM does not match semantic.
      const normalizedName = normalizeKnowledgeText(name.name);
      const match = /^[a-z\d]+$/.test(name.key)
        ? (` ${normalized} `).includes(` ${normalizedName} `)
        : name.key.length >= 2 && compact.includes(name.key);
      if (!match) continue;
      const aliases = exactNames.get(name.key) ?? [];
      const ambiguous = new Set(aliases.map(item => item.id)).size > 1;
      const entry = byId.get(name.id)!;
      if (searchOptions.domain && entry.domain !== searchOptions.domain) continue;
      const hit = { entry, score: name.key.length * 10 + contextBoost(entry, searchOptions.context), match: name.canonical ? 'name' as const : 'alias' as const, matchedName: name.name, ambiguous };
      if (!found.has(name.id) || found.get(name.id)!.score < hit.score) found.set(name.id, hit);
    }
    return [...found.values()].sort((a, b) => b.score - a.score).slice(0, Math.min(30, Math.max(1, searchOptions.limit ?? 12)));
  }
  return { search, recognize, size: documents.length };
}
