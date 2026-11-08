/** Pure adapters over existing research tools. No storage, provider, scheduler or competition state writes. */
import catalog from '../../content/topic-advisor/catalog.json' with { type: 'json' };
import sources from '../../content/topic-advisor/sources.json' with { type: 'json' };
import model from '../../content/topic-advisor/ranker.json' with { type: 'json' };
import events from '../../content/topic-advisor/hotspot-events.json' with { type: 'json' };
import { parseExecutableTopicProfile, parseTopicBundle, stableStringify } from '../topic-advisor/parse.ts';
import { recommendTopics } from '../topic-advisor/core.ts';
import { EMPTY_TOPIC_PROFILE, type TopicProfile } from '../topic-advisor/types.ts';
import { TOPIC_AGENT_SOURCE_VERSIONS, parseTopicAgentTurn, runLocalTopicAgent, type TopicAgentTurn } from '../topic-agent/index.ts';
import { adoptTopicRecommendation, emptyTopicProject, parseTopicProjectDocument, withTopicAgentEvidence, type TopicProjectDocument } from '../topic-project.ts';
import { mergeRecords, parseLiterature, type LitRecord } from '../topic-lab/parse.ts';
import { buildTermIndex, defaultSource, type TermSource } from '../topic-lab/terms.ts';
import { buildTermMap } from '../topic-lab/network.ts';
import { paperGraph } from '../topic-lab/papers.ts';
import { keywordBursts } from '../topic-lab/burst.ts';

const bundle = parseTopicBundle({ catalog, sources, model, events });
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const MAX_CORPUS_BYTES = 5 * 1024 * 1024;
export const MAX_INTAKE_LITERATURE_RECORDS = 2000;
function fail(message: string): never { throw Error(`研究入口：${message}`); }
const size = (value: unknown) => new TextEncoder().encode(stableStringify(value)).byteLength;
async function hash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export type ResearchIntake = {
  schemaVersion: 1; status: 'ready' | 'blocked'; classification: 'proposed'; inputHash: string;
  turn: TopicAgentTurn; candidates: { patternId: string; document: TopicProjectDocument }[]; missing: string[];
};

/** Adoption remains a candidate document; the caller owns explicit acceptance/version saving. */
export function adoptIntakeCandidate(rawTurn: TopicAgentTurn, patternId: string): TopicProjectDocument {
  const turn = parseTopicAgentTurn(rawTurn);
  if (turn.status !== 'ready' || !turn.assistant || turn.catalogVersion !== bundle.catalog.contentVersion
    || stableStringify(turn.sourceVersions) !== stableStringify(TOPIC_AGENT_SOURCE_VERSIONS)) fail('候选回执未完成或来源版本已变化，请重新准备。');
  const item = turn.assistant.items.find(candidate => candidate.patternId === patternId);
  if (!item || !turn.candidateIds.includes(patternId)) fail('该方向不在本轮候选中。');
  const ranked = recommendTopics(turn.profile, bundle, Math.min(50, bundle.catalog.patterns.length));
  const original = ranked.items.find(candidate => candidate.patternId === patternId);
  if (!original || original.feasibility === 'blocked') fail('当前条件下该方向不可采纳。');
  // Population comes only from the ranked registered pattern, never inferred from an assistant title.
  const recommendation = { ...original, title: item.title, question: item.researchQuestion, decisionOwner: item.decisionOwner,
    decision: item.decision, firstWeekPlan: item.firstWeekPlan, unknowns: item.unknowns, sourceIds: item.sourceIds };
  const document = adoptTopicRecommendation(emptyTopicProject(turn.profile.referenceDate), recommendation, turn.profile, bundle);
  return parseTopicProjectDocument(withTopicAgentEvidence(document, item.sourceIds, turn.sources));
}

export async function prepareResearchIntake(direction: string, profile?: TopicProfile, projectId?: string | null): Promise<ResearchIntake> {
  if (typeof direction !== 'string' || !direction.trim() || direction.length > 1200 || CONTROL.test(direction)) fail('请提供 1 至 1200 字的研究方向。');
  const parsed = parseExecutableTopicProfile(profile ?? structuredClone(EMPTY_TOPIC_PROFILE));
  const turn = await runLocalTopicAgent({ profile: parsed, message: direction.trim(), intent: 'recommend', projectId });
  const candidates = (turn.assistant?.items ?? []).map(item => ({ patternId: item.patternId, document: adoptIntakeCandidate(turn, item.patternId) }));
  return { schemaVersion: 1, status: candidates.length ? 'ready' : 'blocked', classification: 'proposed',
    inputHash: await hash({ direction: direction.trim(), profile: parsed, projectId: projectId ?? null, sourceVersions: turn.sourceVersions }),
    turn, candidates, missing: [...(turn.assistant?.questions ?? []), ...(!candidates.length ? ['请补充可调查方向、地区与实际资源后重新筛选。'] : [])] };
}

export type ResearchLiteratureOptions = {
  source?: TermSource; minDf?: number; maxTerms?: number; maxPapers?: number; topTerms?: number;
  resolution?: number; seed?: number; gamma?: number;
};
const RECORD_KEYS = ['id', 'title', 'authors', 'year', 'source', 'keywords', 'keywordsPlus', 'abstract', 'citations', 'doi', 'refs', 'refLabels', 'format'];
function plain(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail('输入对象格式无效。');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !keys.includes(key) || !Object.hasOwn(descriptors[key], 'value'))) fail('输入包含未知字段或访问器。');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max || CONTROL.test(value)) fail('文献字段无效或过长。');
  return value;
}
function texts(value: unknown, max: number, length: number): string[] {
  if (!Array.isArray(value) || value.length > max) fail('文献列表字段超限。');
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(i)) ?? {}, 'value')) fail('文献列表包含访问器。');
  return value.map(item => text(item, length));
}
function record(value: unknown): LitRecord {
  const r = plain(value, RECORD_KEYS);
  if (!RECORD_KEYS.every(key => Object.hasOwn(r, key))) fail('文献字段不完整。');
  const title = text(r.title, 2000);
  if (!title.trim() || (r.year !== null && (!Number.isSafeInteger(r.year) || (r.year as number) < 1900 || (r.year as number) > 2100))
    || (r.citations !== null && (!Number.isSafeInteger(r.citations) || (r.citations as number) < 0))
    || !['wos', 'ris', 'bibtex', 'refworks', 'endnote', 'library'].includes(r.format as string)) fail('文献题名、年份、引用次数或格式无效。');
  return { id: text(r.id, 100), title, authors: texts(r.authors, 100, 300), year: r.year as number | null,
    source: text(r.source, 1000), keywords: texts(r.keywords, 200, 100), keywordsPlus: texts(r.keywordsPlus, 200, 100),
    abstract: text(r.abstract, 12000), citations: r.citations as number | null, doi: text(r.doi, 500),
    refs: texts(r.refs, 500, 2000), refLabels: texts(r.refLabels, 500, 2000), format: r.format as LitRecord['format'] };
}
function options(input: ResearchLiteratureOptions, records: LitRecord[]) {
  const v = plain(input, ['source', 'minDf', 'maxTerms', 'maxPapers', 'topTerms', 'resolution', 'seed', 'gamma']);
  const number = (key: string, fallback: number, min: number, max: number, integer = true): number => {
    const value = v[key] ?? fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isSafeInteger(value)) fail('分析参数无效。');
    return value;
  };
  const source = v.source ?? defaultSource(records);
  if (!['keywords', 'keywords+plus', 'title', 'title+abstract'].includes(source as string)) fail('抽词来源无效。');
  return { source: source as TermSource, minDf: number('minDf', 2, 1, 2000), maxTerms: number('maxTerms', 40, 1, 80),
    maxPapers: number('maxPapers', 60, 1, 120), topTerms: number('topTerms', 20, 1, 80),
    resolution: number('resolution', 1, .1, 5, false), seed: number('seed', 7, 0, 2147483647), gamma: number('gamma', 1, .1, 10, false) };
}

/** Metadata computation only; imported abstracts and database citation counts do not certify fulltext review. */
export async function analyzeResearchLiterature(input: readonly LitRecord[] | string | null | undefined, rawOptions: ResearchLiteratureOptions = {}) {
  let rows: LitRecord[] = [], warnings: string[] = [];
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).byteLength > MAX_CORPUS_BYTES) fail('文献导出文本不能超过 5 MiB。');
    const parsed = parseLiterature(input); rows = parsed.records; warnings = parsed.warnings;
  } else if (input != null) {
    if (!Array.isArray(input) || input.length > MAX_INTAKE_LITERATURE_RECORDS) fail('文献记录不能超过 2000 条。');
    for (let i = 0; i < input.length; i++) if (!Object.hasOwn(Object.getOwnPropertyDescriptor(input, String(i)) ?? {}, 'value')) fail('记录列表包含访问器。');
    rows = input.map(record);
  }
  if (rows.length > MAX_INTAKE_LITERATURE_RECORDS || size(rows) > MAX_CORPUS_BYTES) fail('分析上限为 2000 条记录或 5 MiB。');
  const { records, duplicates } = mergeRecords([rows.map(record)]), params = options(rawOptions, records);
  const corpusHash = await hash(records), parameterHash = await hash(params);
  const limitations = ['仅分析所提供题录、关键词和摘要，未联网检索或核读全文。', '引用次数沿用导出数据库记录；词频、关联与突现不证明文献质量、因果或研究空白。'];
  if (!records.length) {
    const result = { schemaVersion: 1 as const, status: 'blocked' as const, classification: 'proposed' as const,
      summary: null, topTerms: [], map: null, papers: null, bursts: null, sourceIds: [], parameters: params,
      warnings, missing: ['请提供可解析的文献导出记录。'], limitations };
    return { ...result, corpusHash, parameterHash, resultHash: await hash({ corpusHash, parameterHash, result }) };
  }
  const index = buildTermIndex(records, { source: params.source });
  const years = records.flatMap(r => r.year === null ? [] : [r.year]);
  const result = { schemaVersion: 1 as const, status: 'ready' as const, classification: 'proposed' as const,
    summary: { inputRecords: rows.length, records: records.length, duplicates, withYear: years.length,
      withDoi: records.filter(r => r.doi).length, withCitations: records.filter(r => r.citations !== null).length,
      withReferences: records.filter(r => r.refs.length).length, yearRange: years.length ? [Math.min(...years), Math.max(...years)] : null },
    topTerms: [...index.terms.values()].sort((a, b) => b.df - a.df || a.key.localeCompare(b.key)).slice(0, params.topTerms)
      .map(term => ({ ...term, byYear: [...term.byYear].sort((a, b) => a[0] - b[0]) })),
    map: buildTermMap(index, params), papers: paperGraph(records, index.docs, { max: params.maxPapers }),
    bursts: keywordBursts(index, { gamma: params.gamma, maxTerms: params.maxTerms, limit: 25 }),
    sourceIds: records.map(r => r.id), parameters: params, warnings: [...warnings, ...index.notes], missing: [], limitations };
  return { ...result, corpusHash, parameterHash, resultHash: await hash({ corpusHash, parameterHash, result }) };
}
