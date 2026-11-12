/** Browser-owned literature state. No upload, global store or source verification. */
import { stableStringify } from '../topic-advisor/parse.ts';
import { mergeRecords, MAX_RECORDS, type LitRecord, type LitFormat } from './parse.ts';
import { buildTermIndex, defaultSource, parseThesaurus, type TermSource } from './terms.ts';
import { buildTermMap } from './network.ts';
import { paperGraph } from './papers.ts';
import { keywordBursts } from './burst.ts';
import { parseCloudAppearance, type CloudAppearance } from './cloud-shapes.ts';

export const MAX_LITERATURE_WORKSPACE_BYTES = 80 * 1024 * 1024;
export type LiteratureFileReport = { name: string; format: LitFormat | 'unknown'; records: number; skipped: number; warnings: string[] };
export type LiteratureCorpus = { kind: 'import' | 'library'; lists: LitRecord[][]; files: LiteratureFileReport[] };
export type LiteratureView = 'cloud' | 'map' | 'burst' | 'papers' | 'timeline' | 'studio';
export type LiteratureSettings = { source: TermSource | null; minDf: number; maxTerms: number; resolution: number; colorBy: 'cluster' | 'year'; thesaurus: string; gamma: number; view: LiteratureView; basket: string[]; cloud?: CloudAppearance };
export type LiteratureWorkspaceSnapshot = { schema: 'literature-workspace/v1'; corpus: LiteratureCorpus | null; settings: LiteratureSettings; corpusHash: string; parameterHash: string; snapshotHash: string };
export type LiteratureEvidenceReference = { schema: 'literature-evidence/v1'; classification: 'metadata_analysis'; corpusHash: string; parameterHash: string; snapshotHash: string; sourceIds: string[]; selectedTerms: string[] };
export const DEFAULT_LITERATURE_SETTINGS: LiteratureSettings = { source: null, minDf: 2, maxTerms: 100, resolution: 1, colorBy: 'cluster', thesaurus: '', gamma: 1, view: 'cloud', basket: [] };
const FORMATS = ['wos', 'ris', 'bibtex', 'refworks', 'endnote', 'library'];
const SOURCES = ['keywords', 'keywords+plus', 'title', 'title+abstract'];
const VIEWS = ['cloud', 'map', 'burst', 'papers', 'timeline', 'studio'];
const fail = (message: string): never => { throw Error(`文献工作区：${message}`); };
function object(value: unknown, keys: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return fail('对象格式无效。');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.some(key => !Object.hasOwn(descriptors, key)) || Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !keys.includes(key) && !optional.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) return fail('包含未知字段或访问器。');
  return value as Record<string, unknown>;
}
function array<T>(value: unknown, parse: (v: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > MAX_LITERATURE_WORKSPACE_BYTES) return fail('列表格式或大小无效。');
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(i)) ?? {}, 'value')) return fail('列表包含空项或访问器。');
  return value.map(parse);
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_LITERATURE_WORKSPACE_BYTES || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) return fail('文本格式或大小无效。');
  return value;
}
function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, integral = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integral && !Number.isSafeInteger(value)) return fail('数值无效。');
  return value;
}
function enumeration<T extends string>(value: unknown, choices: readonly string[]): T { if (typeof value !== 'string' || !choices.includes(value)) return fail('选项无效。'); return value as T; }
function record(value: unknown): LitRecord {
  const r = object(value, ['id', 'title', 'authors', 'year', 'source', 'keywords', 'keywordsPlus', 'abstract', 'citations', 'doi', 'refs', 'refLabels', 'format']);
  const parsed = { id: text(r.id), title: text(r.title), authors: array(r.authors, text), year: r.year === null ? null : number(r.year, 1900, 2100), source: text(r.source), keywords: array(r.keywords, text), keywordsPlus: array(r.keywordsPlus, text), abstract: text(r.abstract), citations: r.citations === null ? null : number(r.citations), doi: text(r.doi), refs: array(r.refs, text), refLabels: array(r.refLabels, text), format: enumeration<LitFormat>(r.format, FORMATS) };
  // Export parsers leave id empty; mergeRecords assigns corpus-local IDs later.
  if (!parsed.title.trim() || parsed.refs.length !== parsed.refLabels.length) return fail('题名或参考文献对应关系无效。');
  return parsed;
}
function settings(value: unknown): LiteratureSettings {
  const s = object(value, ['source', 'minDf', 'maxTerms', 'resolution', 'colorBy', 'thesaurus', 'gamma', 'view', 'basket'], ['cloud']);
  const basket = array(s.basket, text);
  if (new Set(basket).size !== basket.length) return fail('选题篮中存在重复词。');
  return { source: s.source === null ? null : enumeration<TermSource>(s.source, SOURCES), minDf: number(s.minDf, 1, 20000), maxTerms: number(s.maxTerms, 1, 200), resolution: number(s.resolution, .1, 5, false), colorBy: enumeration<'cluster' | 'year'>(s.colorBy, ['cluster', 'year']), thesaurus: text(s.thesaurus), gamma: number(s.gamma, .1, 10, false), view: enumeration<LiteratureView>(s.view, VIEWS), basket, ...(Object.hasOwn(s, 'cloud') ? { cloud: parseCloudAppearance(s.cloud) } : {}) };
}
function corpus(value: unknown): LiteratureCorpus | null {
  if (value === null) return null;
  const c = object(value, ['kind', 'lists', 'files']);
  const lists = array(c.lists, list => { if (!Array.isArray(list) || list.length > MAX_RECORDS) return fail(`单个文件最多保留 ${MAX_RECORDS} 条记录，请拆分文件。`); return array(list, record); });
  const files = array(c.files, file => { const f = object(file, ['name', 'format', 'records', 'skipped', 'warnings']); return { name: text(f.name), format: enumeration<LitFormat | 'unknown'>(f.format, [...FORMATS, 'unknown']), records: number(f.records, 0, MAX_RECORDS), skipped: number(f.skipped), warnings: array(f.warnings, text) }; });
  const kind = enumeration<'import' | 'library'>(c.kind, ['import', 'library']);
  if (kind === 'import' && (files.length !== lists.length || files.some((f, i) => f.records !== lists[i].length))) return fail('文件来源与记录列表不一致。');
  return { kind, lists, files };
}
function checkedInput(rawCorpus: unknown, rawSettings: unknown) {
  const input = { corpus: corpus(rawCorpus), settings: settings(rawSettings) };
  if (new TextEncoder().encode(stableStringify(input)).byteLength > MAX_LITERATURE_WORKSPACE_BYTES) return fail('解析后记录与配置超过 80 MiB，未保存；请减少文件或拆分工作区。');
  return input;
}
async function hash(value: unknown): Promise<string> { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableStringify(value))))].map(v => v.toString(16).padStart(2, '0')).join(''); }
function parameterMaterial(input: { corpus: LiteratureCorpus | null; settings: LiteratureSettings }) {
  const records = input.corpus ? mergeRecords(input.corpus.lists).records : [];
  const s = input.settings;
  return { source: s.source ?? (input.corpus?.kind === 'library' ? 'title' : defaultSource(records)), minDf: s.minDf, maxTerms: s.maxTerms, resolution: s.resolution, thesaurus: s.thesaurus, gamma: s.gamma };
}
export async function createLiteratureWorkspaceSnapshot(rawCorpus: LiteratureCorpus | null, rawSettings: LiteratureSettings): Promise<LiteratureWorkspaceSnapshot> {
  const input = checkedInput(rawCorpus, rawSettings);
  const [corpusHash, parameterHash, snapshotHash] = await Promise.all([hash(input.corpus), hash(parameterMaterial(input)), hash({ schema: 'literature-workspace/v1', ...input })]);
  return { schema: 'literature-workspace/v1', ...input, corpusHash, parameterHash, snapshotHash };
}
export function parseLiteratureWorkspaceSnapshot(value: unknown): LiteratureWorkspaceSnapshot {
  const s = object(value, ['schema', 'corpus', 'settings', 'corpusHash', 'parameterHash', 'snapshotHash']);
  if (s.schema !== 'literature-workspace/v1') return fail('版本不支持。');
  const input = checkedInput(s.corpus, s.settings);
  const digest = (v: unknown) => { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/u.test(v)) return fail('指纹无效。'); return v; };
  return { schema: 'literature-workspace/v1', ...input, corpusHash: digest(s.corpusHash), parameterHash: digest(s.parameterHash), snapshotHash: digest(s.snapshotHash) };
}
export async function verifyLiteratureWorkspaceSnapshot(value: unknown): Promise<LiteratureWorkspaceSnapshot> {
  const parsed = parseLiteratureWorkspaceSnapshot(value), actual = await createLiteratureWorkspaceSnapshot(parsed.corpus, parsed.settings);
  if (actual.corpusHash !== parsed.corpusHash || actual.parameterHash !== parsed.parameterHash || actual.snapshotHash !== parsed.snapshotHash) return fail('内容与指纹不一致，未恢复。');
  return actual;
}
export function literatureEvidenceReference(snapshot: LiteratureWorkspaceSnapshot): LiteratureEvidenceReference {
  const records = snapshot.corpus ? mergeRecords(snapshot.corpus.lists).records : [];
  return { schema: 'literature-evidence/v1', classification: 'metadata_analysis', corpusHash: snapshot.corpusHash, parameterHash: snapshot.parameterHash, snapshotHash: snapshot.snapshotHash, sourceIds: records.map(r => r.id), selectedTerms: [...snapshot.settings.basket] };
}
export async function literatureWorkspaceReceipt(value: unknown) {
  const snapshot = await verifyLiteratureWorkspaceSnapshot(value), { records, duplicates } = snapshot.corpus ? mergeRecords(snapshot.corpus.lists) : { records: [], duplicates: 0 };
  const parameters = parameterMaterial(snapshot), thes = parseThesaurus(parameters.thesaurus);
  const index = buildTermIndex(records, { source: parameters.source, synonyms: thes.synonyms, exclude: thes.exclude });
  const result = { ...literatureEvidenceReference(snapshot), schema: 'literature-workspace-run/v1' as const, status: records.length ? 'ready' as const : 'blocked' as const, parameters, summary: { records: records.length, duplicates }, map: buildTermMap(index, parameters), papers: paperGraph(records, index.docs), bursts: keywordBursts(index, { gamma: parameters.gamma, limit: 400 }), limitations: ['仅计算导入记录，不代表联网检索、全文核读或研究空白证明。', ...index.notes] };
  return { ...result, resultHash: await hash(result) };
}
