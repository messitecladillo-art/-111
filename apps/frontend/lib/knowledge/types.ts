/** Conceptual knowledge is distinct from empirical findings and competition Gate evidence. */
export type KnowledgeDomain = 'stats' | 'math' | 'computing' | 'ml' | 'research' | 'philosophy' | 'geography' | 'social';
export const KNOWLEDGE_DOMAINS: Record<KnowledgeDomain, string> = {
  stats: '统计与抽样', math: '数学', computing: '计算机与数据', ml: '机器学习',
  research: '调查与研究方法', philosophy: '哲学与论证', geography: '地理与空间', social: '经济、社会与管理',
};
export type KnowledgeSource = { id: string; title: string; url: string; locator: string; scope: string };
export type KnowledgeEntry = {
  id: string; version: number; name: string; englishName?: string; aliases: string[];
  domain: KnowledgeDomain; depth: 'deep' | 'brief'; definition: string;
  uses: string[]; examples: string[];
  formula?: { tex: string; symbols: Array<{ symbol: string; meaning: string; unit?: string }>; conditions: string[] };
  confusions: Array<{ entryId: string; distinction: string }>;
  questions: Array<{ question: string; answer: string }>;
  relatedIds: string[]; methodIds: string[]; materialIds: string[];
  toolLinks: Array<{ label: string; href: string }>; sources: KnowledgeSource[];
  review: { status: 'draft' | 'reviewed'; producer: string; reviewer?: string; checkedAt?: string };
  updatedAt: string;
};
export type KnowledgePack = { schemaVersion: 1; version: string; entries: KnowledgeEntry[] };
export type KnowledgeModule = 'overview' | 'design' | 'sampling' | 'analysis' | 'editor' | 'defense' | 'silicon' | 'canvas' | 'cases' | 'diagnose' | 'exam' | 'rules' | 'preflight' | 'knowledge';
export type KnowledgeContext = {
  module: KnowledgeModule; label: string; helpTags: string[];
  projectId?: string; selectedText?: string; documentPage?: { documentId: string; page: number };
};
export type KnowledgeReference = {
  id: string; projectId: string; entryId: string; entryVersion: number;
  kind: 'concept' | 'method'; createdAt: string; createdBy: string;
};
export type KnowledgeWindowPreference = { mode: 'float' | 'dock' | 'reading'; x: number; y: number };
export type KnowledgeUserState = {
  schemaVersion: 1; version: number; favorites: Array<{ entryId: string; entryVersion: number }>;
  recent: Array<{ entryId: string; entryVersion: number; visitedAt?: string }>;
  window: KnowledgeWindowPreference;
};
export type KnowledgeLookup = {
  id: string; status: 'queued' | 'running' | 'ready' | 'failed' | 'outcome_unknown';
  query: string; requestedAt: string; retrievedAt?: string; providerRequestId?: string;
  creditsReserved?: number; creditsUsed?: number; error?: { code: string; message: string };
  results: Array<{ title: string; url: string; snippet: string }>;
};
export type KnowledgeSearchHit = {
  entry: KnowledgeEntry; score: number; match: 'name' | 'alias' | 'prefix' | 'fuzzy' | 'text';
  matchedName: string; ambiguous: boolean;
};
export type KnowledgeSearchOptions = { limit?: number; context?: KnowledgeContext; domain?: KnowledgeDomain };

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,95}$/;
export function isKnowledgeId(value: unknown): value is string { return typeof value === 'string' && SAFE_ID.test(value); }
export function isKnowledgeSourceUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export function isKnowledgeToolHref(value: string): boolean {
  return /^\/workspace(?:#[a-z][a-z-]*)?$/.test(value) || /^\/knowledge(?:\?[a-zA-Z0-9%&=_-]*)?$/.test(value) || value === '/examples/bank-marketing' || value === '/services';
}
/** Fail closed on malformed or falsely reviewed public entries; never coerce external metadata. */
export function validateKnowledgePack(value: unknown): KnowledgePack {
  if (!value || typeof value !== 'object') throw new Error('知识包不是有效对象。');
  const pack = value as KnowledgePack;
  if (pack.schemaVersion !== 1 || typeof pack.version !== 'string' || !pack.version || !Array.isArray(pack.entries) || pack.entries.length > 5000) throw new Error('知识包版本或容量无效。');
  const ids = new Set<string>();
  const entryFields = new Set(['id', 'version', 'name', 'englishName', 'aliases', 'domain', 'depth', 'definition', 'uses', 'examples', 'formula', 'confusions', 'questions', 'relatedIds', 'methodIds', 'materialIds', 'toolLinks', 'sources', 'review', 'updatedAt']);
  for (const entry of pack.entries) {
    if (!entry || !isKnowledgeId(entry.id) || ids.has(entry.id) || !Number.isInteger(entry.version) || entry.version < 1 || entry.version > 2147483647 || typeof entry.name !== 'string' || !entry.name.trim() || !Object.hasOwn(KNOWLEDGE_DOMAINS, entry.domain) || !['deep', 'brief'].includes(entry.depth) || typeof entry.definition !== 'string' || !entry.definition.trim()) throw new Error('知识条目身份或定义无效。');
    ids.add(entry.id);
    if (Object.keys(entry).some(key => !entryFields.has(key)) || (entry.englishName !== undefined && typeof entry.englishName !== 'string')) throw new Error(`知识条目 ${entry.id} 含有未登记字段。`);
    for (const field of ['aliases', 'uses', 'examples', 'relatedIds', 'methodIds', 'materialIds'] as const) {
      if (!Array.isArray(entry[field]) || entry[field].some(item => typeof item !== 'string') || entry[field].length > 100) throw new Error(`知识条目 ${entry.id} 的 ${field} 无效。`);
    }
    if (!Array.isArray(entry.sources) || !entry.sources.length || entry.sources.some(source => !source || !isKnowledgeId(source.id) || typeof source.title !== 'string' || !source.title || typeof source.url !== 'string' || !isKnowledgeSourceUrl(source.url) || typeof source.locator !== 'string' || !source.locator || typeof source.scope !== 'string' || !source.scope)) throw new Error(`知识条目 ${entry.id} 缺少有效来源定位。`);
    if (!Array.isArray(entry.toolLinks) || entry.toolLinks.some(tool => !tool || typeof tool.label !== 'string' || !tool.label || typeof tool.href !== 'string' || !isKnowledgeToolHref(tool.href))) throw new Error(`知识条目 ${entry.id} 的工具入口无效。`);
    if (!Array.isArray(entry.confusions) || entry.confusions.some(item => !item || !isKnowledgeId(item.entryId) || typeof item.distinction !== 'string') || !Array.isArray(entry.questions) || entry.questions.some(item => !item || typeof item.question !== 'string' || typeof item.answer !== 'string')) throw new Error(`知识条目 ${entry.id} 的关联解释无效。`);
    if (!entry.review || !['draft', 'reviewed'].includes(entry.review.status) || typeof entry.review.producer !== 'string' || !entry.review.producer || (entry.review.status === 'reviewed' && (!entry.review.reviewer || entry.review.reviewer === entry.review.producer || !entry.review.checkedAt || !Number.isFinite(Date.parse(entry.review.checkedAt))))) throw new Error(`知识条目 ${entry.id} 的独立审核记录无效。`);
    if (!Number.isFinite(Date.parse(entry.updatedAt))) throw new Error(`知识条目 ${entry.id} 的更新时间无效。`);
    if (entry.formula && (typeof entry.formula.tex !== 'string' || entry.formula.tex.length > 4000 || !Array.isArray(entry.formula.symbols) || entry.formula.symbols.some(item => !item || typeof item.symbol !== 'string' || typeof item.meaning !== 'string' || (item.unit !== undefined && typeof item.unit !== 'string')) || !Array.isArray(entry.formula.conditions) || entry.formula.conditions.some(item => typeof item !== 'string'))) throw new Error(`知识条目 ${entry.id} 的公式无效。`);
  }
  for (const entry of pack.entries) {
    if ([...entry.relatedIds, ...entry.confusions.map(item => item.entryId)].some(id => !ids.has(id))) throw new Error(`知识条目 ${entry.id} 关联了不存在的概念。`);
  }
  return pack;
}
