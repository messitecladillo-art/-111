import catalogData from '../../content/topic-advisor/regions.catalog.json' with { type: 'json' };
import { rejectDuplicateMembers } from '../questionnaire.ts';

export type RegionLevel = 'province' | 'prefecture' | 'county';
export type RegionRef = Readonly<{ code: string; catalogVersion: string }>;
export type RegionRecord = Readonly<{
  code: string; name: string; level: RegionLevel; parentCode: string | null; provinceCode: string; startYear: number;
}>;
export type HistoricalRegionName = Readonly<{
  code: string; name: string; parentCode: string | null; startYear: number; endYear: number;
  candidateCodes: readonly string[]; relation: 'historical_candidate';
}>;
/** Functional areas are separate places. Their links do not grant administrative status. */
export type FunctionalArea = Readonly<{
  id: string; name: string; kind: 'industrial_park' | 'campus' | 'tourism_area' | 'other';
  regionCodes: readonly string[]; sourceIds: readonly string[]; classification: 'curated' | 'user_defined';
}>;
export type RegionCatalog = Readonly<{
  schemaVersion: 1; catalogVersion: string; asOf: string;
  source: Readonly<{
    id: string; repository: string; commit: string; rawPath: string; rawSha256: string;
    license: 'CC0-1.0'; officialSource: string; verification: 'community_compilation_official_full_recheck_pending';
  }>;
  coverage: Readonly<{
    provinceCount: number; prefectureCount: number; countyCount: number;
    provinceOnlyCodes: readonly string[]; countyContent: 'directory_only'; limitations: readonly string[];
  }>;
  records: readonly RegionRecord[]; historicalNames: readonly HistoricalRegionName[]; functionalAreas: readonly FunctionalArea[];
}>;
export type RegionSearchResult = RegionRecord & Readonly<{
  match: 'code' | 'exact' | 'alias' | 'prefix' | 'contains' | 'historical';
  matchedName: string; requiresConfirmation: boolean;
}>;
export type LegacyRegionResolution = Readonly<{
  status: 'empty' | 'unmatched' | 'candidates' | 'ambiguous'; candidates: readonly RegionSearchResult[];
  notices: readonly string[]; requiresConfirmation: true;
}>;

const error = (message: string): never => { throw new Error(`地区目录：${message}`); };
const unsafe = new Set(['__proto__', 'constructor', 'prototype']);
function obj(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return error('对象格式无效');
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (unsafe.has(key) || !allowed.includes(key) || descriptor.get || descriptor.set) error('包含不支持字段或动态属性');
  }
  return value as Record<string, unknown>;
}
function str(value: unknown, max = 160): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) return error('文字为空、过长或包含控制字符');
  return value;
}
function code(value: unknown): string { const result = str(value); if (!/^[1-9]\d{5}$/.test(result)) error('行政区划代码必须为6位字符串'); return result; }
function integer(value: unknown, min = 0, max = 20000): number { if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) return error('数字超出范围'); return value as number; }
function rows(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max || Object.getPrototypeOf(value) !== Array.prototype) return error('列表格式无效或过长');
  for (let i = 0; i < value.length; i++) { const descriptor = Object.getOwnPropertyDescriptor(value, String(i)); if (!descriptor || descriptor.get || descriptor.set) error('列表存在空位或动态属性'); }
  return value;
}
function strings(value: unknown, max: number): string[] {
  const list = rows(value, max).map(v => str(v, 1000));
  if (new Set(list).size !== list.length) error('列表包含重复项');
  return list;
}
const levelOf = (value: string): RegionLevel => Number(value) % 10000 === 0 ? 'province' : Number(value) % 100 === 0 ? 'prefecture' : 'county';
const httpUrl = (value: unknown): string => { const text = str(value, 2000); let url: URL; try { url = new URL(text); } catch { return error('来源URL无效'); } if (url.protocol !== 'https:' || url.username || url.password) error('来源仅接受不含凭据的HTTPS地址'); return text; };
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function parseRegionCatalog(input: unknown): RegionCatalog {
  let value = input;
  if (typeof value === 'string') {
    if (value.length > 4_000_000) error('文件超过4MB');
    const raw = value.replace(/^\uFEFF/, '');
    try { value = JSON.parse(raw); rejectDuplicateMembers(raw); } catch { return error('JSON无效、字段重复或嵌套过深'); }
  }
  const root = obj(value, ['schemaVersion', 'catalogVersion', 'asOf', 'source', 'coverage', 'records', 'historicalNames', 'functionalAreas']);
  if (root.schemaVersion !== 1) error('不支持的版本');
  const catalogVersion = str(root.catalogVersion, 100), asOf = str(root.asOf, 10);
  if (!/^cn-admin-[a-zA-Z0-9-]+$/.test(catalogVersion) || !/^\d{4}-12-31$/.test(asOf)) error('目录版本或年度边界无效');
  const year = Number(asOf.slice(0, 4));
  const source = obj(root.source, ['id', 'repository', 'commit', 'rawPath', 'rawSha256', 'license', 'officialSource', 'verification']);
  if (source.license !== 'CC0-1.0' || source.verification !== 'community_compilation_official_full_recheck_pending') error('许可或核验状态无效');
  const commit = str(source.commit, 40), rawSha256 = str(source.rawSha256, 64), rawPath = str(source.rawPath, 300);
  if (!/^[a-f0-9]{40}$/.test(commit) || !/^[a-f0-9]{64}$/.test(rawSha256) || /^(?:[a-z]:|[\\/])/i.test(rawPath) || rawPath.split(/[\\/]/).some(p => p === '..')) error('来源指纹或相对路径无效');
  const records = rows(root.records, 10000).map(value => {
    const r = obj(value, ['code', 'name', 'level', 'parentCode', 'provinceCode', 'startYear']);
    const regionCode = code(r.code), level = levelOf(regionCode);
    if (r.level !== level) error('节点级别与代码不一致');
    return { code: regionCode, name: str(r.name), level, parentCode: r.parentCode === null ? null : code(r.parentCode), provinceCode: code(r.provinceCode), startYear: integer(r.startYear, 1900, year) };
  });
  if (!records.length || new Set(records.map(r => r.code)).size !== records.length) error('节点为空或代码重复');
  const byCode = new Map(records.map(r => [r.code, r]));
  for (const row of records) {
    const province = byCode.get(row.provinceCode), parent = row.parentCode ? byCode.get(row.parentCode) : undefined;
    if (!province || province.level !== 'province' || row.provinceCode !== row.code.slice(0, 2) + '0000') error('省级归属无效');
    if (row.level === 'province' ? row.parentCode !== null : !parent || parent.provinceCode !== row.provinceCode || parent.level === 'county' || (row.level === 'prefecture' && parent.level !== 'province')) error('父级关系无效');
    if (row.level === 'county') {
      const encodedPrefecture = row.code.slice(0, 4) + '00';
      if (parent?.level === 'prefecture' && parent.code !== encodedPrefecture || byCode.get(encodedPrefecture)?.level === 'prefecture' && row.parentCode !== encodedPrefecture) error('县级代码与地级父级不一致');
    }
  }
  const historicalNames = rows(root.historicalNames, 20000).map(value => {
    const r = obj(value, ['code', 'name', 'parentCode', 'startYear', 'endYear', 'candidateCodes', 'relation']);
    if (r.relation !== 'historical_candidate') error('历史关系不能作为自动替换');
    const startYear = integer(r.startYear, 1900, year), endYear = integer(r.endYear, 1900, year);
    if (endYear <= startYear) error('历史生效区间无效');
    const candidateCodes = strings(r.candidateCodes, 100).map(code);
    if (candidateCodes.some(c => !byCode.has(c))) error('历史候选指向目录外节点');
    return { code: code(r.code), name: str(r.name), parentCode: r.parentCode === null ? null : code(r.parentCode), startYear, endYear, candidateCodes, relation: 'historical_candidate' as const };
  });
  const historicalKeys = historicalNames.map(r => `${r.code}:${r.startYear}:${r.endYear}:${r.name}`);
  if (new Set(historicalKeys).size !== historicalKeys.length) error('历史节点重复');
  const functionalAreas = rows(root.functionalAreas, 5000).map(value => {
    const r = obj(value, ['id', 'name', 'kind', 'regionCodes', 'sourceIds', 'classification']);
    const id = str(r.id, 100), kind = str(r.kind), classification = str(r.classification);
    if (!/^[a-z][a-z0-9_.:-]*$/.test(id) || !['industrial_park', 'campus', 'tourism_area', 'other'].includes(kind) || !['curated', 'user_defined'].includes(classification)) error('功能区类型无效');
    const regionCodes = strings(r.regionCodes, 100).map(code), sourceIds = strings(r.sourceIds, 30);
    if (!regionCodes.length || regionCodes.some(c => !byCode.has(c)) || (classification === 'curated' && !sourceIds.length)) error('功能区缺少有效行政区关联或来源');
    return { id, name: str(r.name), kind: kind as FunctionalArea['kind'], regionCodes, sourceIds, classification: classification as FunctionalArea['classification'] };
  });
  if (new Set(functionalAreas.map(r => r.id)).size !== functionalAreas.length) error('功能区ID重复');
  const coverage = obj(root.coverage, ['provinceCount', 'prefectureCount', 'countyCount', 'provinceOnlyCodes', 'countyContent', 'limitations']);
  const provinceOnlyCodes = strings(coverage.provinceOnlyCodes, 100).map(code);
  if (coverage.countyContent !== 'directory_only' || provinceOnlyCodes.some(c => byCode.get(c)?.level !== 'province' || records.some(r => r.parentCode === c))) error('覆盖范围与实际节点不一致');
  const counts = { provinceCount: integer(coverage.provinceCount), prefectureCount: integer(coverage.prefectureCount), countyCount: integer(coverage.countyCount) };
  if (counts.provinceCount !== records.filter(r => r.level === 'province').length || counts.prefectureCount !== records.filter(r => r.level === 'prefecture').length || counts.countyCount !== records.filter(r => r.level === 'county').length) error('覆盖计数不一致');
  return freeze({ schemaVersion: 1, catalogVersion, asOf, source: { id: str(source.id), repository: httpUrl(source.repository), commit, rawPath, rawSha256, license: 'CC0-1.0', officialSource: httpUrl(source.officialSource), verification: 'community_compilation_official_full_recheck_pending' }, coverage: { ...counts, provinceOnlyCodes, countyContent: 'directory_only', limitations: strings(coverage.limitations, 30) }, records, historicalNames, functionalAreas });
}

export const TOPIC_REGION_CATALOG: RegionCatalog = parseRegionCatalog(catalogData);
const indexes = new WeakMap<RegionCatalog, Map<string, RegionRecord>>();
function index(catalog: RegionCatalog): Map<string, RegionRecord> {
  let value = indexes.get(catalog);
  if (!value) { value = new Map(catalog.records.map(r => [r.code, r])); indexes.set(catalog, value); }
  return value;
}

export function validateRegionRef(input: unknown, catalog: RegionCatalog = TOPIC_REGION_CATALOG): RegionRef {
  const r = obj(input, ['code', 'catalogVersion']);
  const regionCode = code(r.code);
  if (r.catalogVersion !== catalog.catalogVersion) error('地区引用属于其他目录版本，请先确认迁移候选');
  if (!index(catalog).has(regionCode)) error('地区引用未在该目录版本中登记');
  return Object.freeze({ code: regionCode, catalogVersion: catalog.catalogVersion });
}
export function getRegionByCode(value: string, catalog: RegionCatalog = TOPIC_REGION_CATALOG): RegionRecord | undefined { return index(catalog).get(code(value)); }
export function regionPath(value: string | RegionRef, catalog: RegionCatalog = TOPIC_REGION_CATALOG): RegionRecord[] {
  const regionCode = typeof value === 'string' ? code(value) : validateRegionRef(value, catalog).code;
  let current = index(catalog).get(regionCode);
  const result: RegionRecord[] = [], visited = new Set<string>();
  while (current) {
    if (visited.has(current.code)) error('地区父链存在循环');
    visited.add(current.code); result.unshift(current);
    current = current.parentCode ? index(catalog).get(current.parentCode) : undefined;
  }
  return result;
}
function queryText(value: string): string {
  if (typeof value !== 'string' || value.length > 160 || /[\u0000-\u001f\u007f]/u.test(value)) return error('搜索词过长或包含控制字符');
  return value.normalize('NFKC').trim().replace(/\s+/gu, '');
}
function aliases(row: RegionRecord): string[] {
  const special: Record<string, string> = { '150000': '内蒙古', '450000': '广西', '540000': '西藏', '640000': '宁夏', '650000': '新疆', '810000': '香港', '820000': '澳门' };
  const short = row.level === 'province' ? special[row.code] ?? row.name.replace(/(?:省|市)$/u, '') : row.level === 'prefecture' ? row.name.replace(/(?:市|地区|盟)$/u, '') : '';
  return short && short !== row.name ? [short] : [];
}
function within(row: RegionRecord, parent: string | null, catalog: RegionCatalog): boolean { return parent === null || regionPath(row.code, catalog).some(r => r.code === parent); }

/** Blank query lists immediate children; typed queries search all descendants. */
export function searchRegions(query: string, parent?: string | RegionRef | null, limit = 20, catalog: RegionCatalog = TOPIC_REGION_CATALOG): RegionSearchResult[] {
  const term = queryText(query);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) error('搜索数量应为1—100');
  const parentCode = parent === undefined || parent === null ? null : typeof parent === 'string' ? code(parent) : validateRegionRef(parent, catalog).code;
  if (parentCode && !index(catalog).has(parentCode)) error('搜索父级不存在');
  const found = new Map<string, { row: RegionSearchResult; rank: number }>();
  const add = (row: RegionRecord, match: RegionSearchResult['match'], matchedName: string, rank: number) => {
    if (!within(row, parentCode, catalog)) return;
    if ((found.get(row.code)?.rank ?? Infinity) <= rank) return;
    found.set(row.code, { row: { ...row, match, matchedName, requiresConfirmation: match === 'historical' }, rank });
  };
  for (const row of catalog.records) {
    if (!term) { if (row.parentCode === parentCode) add(row, 'exact', row.name, 0); continue; }
    if (row.code === term) add(row, 'code', row.name, 0);
    else if (row.name === term) add(row, 'exact', row.name, 1);
    else if (aliases(row).includes(term)) add(row, 'alias', term, 2);
    else if (row.name.startsWith(term) || row.code.startsWith(term)) add(row, 'prefix', row.name, 3);
    else if (row.name.includes(term)) add(row, 'contains', row.name, 4);
  }
  if (term) for (const historic of catalog.historicalNames) {
    if (historic.name !== term && historic.code !== term) continue;
    // An active code has its current meaning; never add neighbours from past boundary changes.
    if (historic.code === term && index(catalog).has(term)) continue;
    for (const candidate of historic.candidateCodes) { const row = index(catalog).get(candidate); if (row) add(row, 'historical', historic.name, 5); }
  }
  return [...found.values()].sort((a, b) => a.rank - b.rank || a.row.code.localeCompare(b.row.code)).slice(0, limit).map(v => v.row);
}

/** Legacy free text always produces suggestions. It never saves a RegionRef. */
export function resolveLegacyRegion(region: string, city: string, catalog: RegionCatalog = TOPIC_REGION_CATALOG): LegacyRegionResolution {
  const provinceText = queryText(region), cityText = queryText(city);
  if (!provinceText && !cityText) return { status: 'empty', candidates: [], notices: [], requiresConfirmation: true };
  const exact = (term: string, parent: string | null = null) => searchRegions(term, parent, 100, catalog).filter(r => ['code', 'exact', 'alias', 'historical'].includes(r.match));
  const provinces = provinceText ? exact(provinceText).filter(r => r.level === 'province') : [];
  if (provinceText && !provinces.length) return { status: 'unmatched', candidates: [], notices: ['未找到省级输入的明确候选，请选择地区；未根据城市文本自动补省或县。'], requiresConfirmation: true };
  let candidates: RegionSearchResult[];
  if (!cityText) candidates = provinces;
  else if (provinces.length) candidates = provinces.flatMap(p => exact(cityText, p.code));
  else candidates = exact(cityText);
  candidates = [...new Map(candidates.map(r => [r.code, { ...r, requiresConfirmation: true }])).values()];
  const notices = ['旧输入仅提供迁移候选，确认前不绑定县级地区。'];
  if (!candidates.length) notices.push('没有找到与输入及父级同时一致的候选，请重新选择。');
  if (candidates.some(r => r.match === 'historical')) notices.push('历史名称可能涉及撤并或分割；列出的现行地区仅为候选，请核对原研究范围。');
  if (candidates.some(r => catalog.coverage.provinceOnlyCodes.includes(r.code))) notices.push('本目录仅收录该地区省级节点，尚无下级明细。');
  return { status: !candidates.length ? 'unmatched' : candidates.length > 1 ? 'ambiguous' : 'candidates', candidates, notices, requiresConfirmation: true };
}
