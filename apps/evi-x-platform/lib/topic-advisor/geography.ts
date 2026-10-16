/** Geographic scope only: directory membership does not establish local evidence or school location. */
import { TOPIC_REGION_CATALOG, getRegionByCode, regionPath, type RegionCatalog, type RegionRecord, type RegionRef } from './regions.ts';

export type ProfileRegionFields = { schemaVersion?: never; regionRef?: never } | { schemaVersion: 2; regionRef: RegionRef | null };
export type RegionAwareProfile = { region: string; city: string } & ProfileRegionFields;
export type ProfileRegionStatus = 'legacy' | 'unset' | 'current' | 'migration_required';
export type GeographicConstraints = { regionTags: readonly string[]; cityTags: readonly string[] };
export type PatternGeographyFit = 'exact' | 'transferable' | 'unknown' | 'mismatch';
export type EventRegionScope = { level: 'national' | 'province' | 'city'; region: string; city: string } | { level: 'county'; schemaVersion: 2; regionRef: RegionRef; region: string; city: string };
const fail = (message: string): never => { throw new Error(`选题地区：${message}`); };
const municipalities = new Set(['110000', '120000', '310000', '500000']);
/** These are the explicit aliases in regions.ts, not a generic suffix-removal rule. */
const provinceAliases: Readonly<Record<string, string>> = Object.freeze({ '150000': '内蒙古', '450000': '广西', '540000': '西藏', '640000': '宁夏', '650000': '新疆', '810000': '香港', '820000': '澳门' });

function plain(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail('应为普通对象。');
  if (Object.getOwnPropertySymbols(value).length) fail('不支持符号字段。');
  for (const [key, d] of Object.entries(Object.getOwnPropertyDescriptors(value))) if (!d.enumerable || !Object.hasOwn(d, 'value') || ['__proto__', 'prototype', 'constructor'].includes(key)) fail('不支持隐藏字段或动态属性。');
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 160): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return fail('地区文字无效或过长。');
  return value;
}
/** Exact same width and outer-space handling as v1; never remove inner whitespace. */
export function geographicKey(value: string): string { return text(value).normalize('NFKC').trim(); }
function shapeRegionRef(value: unknown): RegionRef {
  const v = plain(value);
  if (Object.keys(v).length !== 2 || !Object.hasOwn(v, 'code') || !Object.hasOwn(v, 'catalogVersion')) fail('地区引用字段缺失或包含未知字段。');
  const code = text(v.code, 6), catalogVersion = text(v.catalogVersion, 100);
  if (!/^[1-9]\d{5}$/.test(code) || catalogVersion !== catalogVersion.trim() || !/^cn-admin-[A-Za-z0-9-]+$/.test(catalogVersion)) fail('地区代码或目录版本格式无效。');
  return { code, catalogVersion };
}

/** Shape-only: old or unknown codes remain readable. Call the execution guard before model use. */
export function parseProfileRegionFields(input: unknown): ProfileRegionFields {
  const profile = plain(input), hasVersion = Object.hasOwn(profile, 'schemaVersion'), hasRef = Object.hasOwn(profile, 'regionRef');
  if (!hasVersion && !hasRef) return {};
  if (!hasVersion || !hasRef || profile.schemaVersion !== 2) fail('schemaVersion:2 与 regionRef 必须同时存在；旧版背景应同时省略。');
  return { schemaVersion: 2, regionRef: profile.regionRef === null ? null : shapeRegionRef(profile.regionRef) };
}
function profileCopy(input: RegionAwareProfile): RegionAwareProfile {
  const profile = plain(input);
  return { region: text(profile.region), city: text(profile.city), ...parseProfileRegionFields(profile) } as RegionAwareProfile;
}
export function profileRegionStatus(profile: unknown, catalog: RegionCatalog = TOPIC_REGION_CATALOG): ProfileRegionStatus {
  const fields = parseProfileRegionFields(profile);
  if (fields.schemaVersion !== 2) return 'legacy';
  if (fields.regionRef === null) return 'unset';
  return fields.regionRef.catalogVersion === catalog.catalogVersion && getRegionByCode(fields.regionRef.code, catalog) ? 'current' : 'migration_required';
}
/** Legacy execution is retained; a stale v2 ref must be explicitly migrated before any model run. */
export function assertProfileRegionExecutable(profile: unknown, catalog: RegionCatalog = TOPIC_REGION_CATALOG): ProfileRegionStatus {
  const status = profileRegionStatus(profile, catalog);
  if (status === 'migration_required') fail('地区引用不属于当前目录或代码已失效，请明确确认迁移后再运行；未自动替换为历史候选。');
  return status;
}
function names(row: RegionRecord): string[] {
  const alias = row.level === 'province' ? provinceAliases[row.code] ?? row.name.replace(/(?:省|市)$/u, '') : row.level === 'prefecture' ? row.name.replace(/(?:市|地区|盟)$/u, '') : '';
  return [...new Set([row.name, ...(alias ? [alias] : [])].map(geographicKey))];
}
function scope(profile: RegionAwareProfile, catalog: RegionCatalog): { status: ProfileRegionStatus; province: string[]; city: string[]; path: RegionRecord[] } {
  const status = profileRegionStatus(profile, catalog);
  if (status === 'legacy') return { status, province: geographicKey(profile.region) ? [geographicKey(profile.region)] : [], city: geographicKey(profile.city) ? [geographicKey(profile.city)] : [], path: [] };
  if (status !== 'current' || !profile.regionRef) return { status, province: [], city: [], path: [] };
  const path = regionPath(profile.regionRef, catalog), province = path.filter(r => r.level === 'province').flatMap(names);
  const city = path.filter(r => r.level !== 'province' || municipalities.has(r.code)).flatMap(names);
  return { status, province, city, path };
}
const countyNameIndexes = new WeakMap<RegionCatalog, Map<string, RegionRecord[]>>();
function localSourceNameMatches(actual: ReturnType<typeof scope>, key: string, sourceProvinces: readonly string[], catalog: RegionCatalog): boolean {
  if (!actual.city.includes(key)) return false;
  if (actual.status === 'legacy') return true;
  // A prefecture/city tag keeps its independent OR meaning. A county name in
  // an external source needs an unambiguous identity, even for a known profile.
  if (actual.path.some(row => (row.level === 'prefecture' || municipalities.has(row.code)) && names(row).includes(key))) return true;
  const county = actual.path.find(row => row.level === 'county' && names(row).includes(key));
  if (!county) return false;
  let index = countyNameIndexes.get(catalog);
  if (!index) {
    index = new Map();
    for (const row of catalog.records) if (row.level === 'county') {
      const name = geographicKey(row.name);
      index.set(name, [...(index.get(name) ?? []), row]);
    }
    countyNameIndexes.set(catalog, index);
  }
  const declared = new Set(catalog.records.filter(row => row.level === 'province' && sourceProvinces.some(label => names(row).includes(geographicKey(label)))).map(row => row.code));
  const candidates = (index.get(key) ?? []).filter(row => !declared.size || declared.has(row.provinceCode));
  return candidates.length === 1 && candidates[0].code === county.code;
}
function constraintsCopy(input: GeographicConstraints): GeographicConstraints {
  const v = plain(input);
  function tags(raw: unknown): string[] {
    if (!Array.isArray(raw) || raw.length > 100 || Object.getOwnPropertySymbols(raw).length || Object.getOwnPropertyNames(raw).length !== raw.length + 1) return fail('地区标签列表无效。');
    return Array.from({ length: raw.length }, (_, i) => {
      const d = Object.getOwnPropertyDescriptor(raw, String(i)); if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) return fail('地区标签列表存在空项或动态属性。');
      return geographicKey(text(d.value));
    });
  }
  return { regionTags: tags(v.regionTags), cityTags: tags(v.cityTags) };
}

/** Unknown scope does not earn an exact/local fit. Known wrong ancestors are a mismatch. */
export function patternGeographyFit(pattern: GeographicConstraints, profileInput: RegionAwareProfile, catalog: RegionCatalog = TOPIC_REGION_CATALOG): PatternGeographyFit {
  const profile = profileCopy(profileInput), tags = constraintsCopy(pattern);
  if (!tags.regionTags.length && !tags.cityTags.length) return 'transferable';
  const actual = scope(profile, catalog);
  let unknown = false;
  for (const [expected, available, local] of [[tags.regionTags, actual.province, false], [tags.cityTags, actual.city, true]] as const) {
    if (!expected.length) continue;
    if (!available.length) { unknown = true; continue; }
    if (!expected.some(tag => local ? localSourceNameMatches(actual, tag, tags.regionTags, catalog) : available.includes(tag))) return 'mismatch';
  }
  return unknown ? 'unknown' : 'exact';
}
/** Constraint check only: missing scope is nonblocking, but is never an affirmative local match. */
export function matchesProfileGeography(profile: RegionAwareProfile, constraints: GeographicConstraints, catalog: RegionCatalog = TOPIC_REGION_CATALOG): boolean {
  return patternGeographyFit(constraints, profile, catalog) !== 'mismatch';
}
/** Positive free-text predicate for candidate geography. School text is deliberately never consulted. */
export function profileMatchesGeography(profileInput: RegionAwareProfile, place: string, catalog: RegionCatalog = TOPIC_REGION_CATALOG): boolean {
  const profile = profileCopy(profileInput), key = geographicKey(place);
  if (!key) return false;
  const actual = scope(profile, catalog);
  return [...actual.province, ...actual.city].includes(key);
}

function eventScope(input: EventRegionScope): EventRegionScope {
  const v = plain(input), region = text(v.region), city = text(v.city);
  if (v.level === 'national' || v.level === 'province' || v.level === 'city') {
    if (Object.keys(v).length !== 3 || !['level', 'region', 'city'].every(k => Object.hasOwn(v, k))) fail('事件地区字段无效。');
    return { level: v.level, region, city };
  }
  if (v.level !== 'county' || v.schemaVersion !== 2 || Object.keys(v).length !== 5 || !['level', 'region', 'city', 'schemaVersion', 'regionRef'].every(k => Object.hasOwn(v, k))) return fail('事件必须声明已知地区层级；县级事件需要版本化地区引用。');
  return { level: 'county', schemaVersion: 2, regionRef: shapeRegionRef(v.regionRef), region, city };
}
/** Events require positive known scope. Existing city:'阳城县' data matches that selected county only. */
export function eventRegionIncludesProfile(profileInput: RegionAwareProfile, geography: EventRegionScope, catalog: RegionCatalog = TOPIC_REGION_CATALOG): boolean {
  const profile = profileCopy(profileInput), event = eventScope(geography), actual = scope(profile, catalog);
  if (actual.status === 'migration_required') return false;
  if (event.level === 'national') return true;
  if (event.level === 'province') return !!geographicKey(event.region) && actual.province.includes(geographicKey(event.region));
  if (event.level === 'city') return !!geographicKey(event.city) && localSourceNameMatches(actual, geographicKey(event.city), [event.region], catalog) && (!geographicKey(event.region) || actual.province.includes(geographicKey(event.region)));
  if (event.level !== 'county' || actual.status !== 'current' || event.regionRef.catalogVersion !== catalog.catalogVersion) return false;
  const region = getRegionByCode(event.regionRef.code, catalog);
  if (!region || region.level !== 'county' || !actual.path.some(r => r.code === region.code)) return false;
  // Optional display labels may not contradict the explicit reference.
  if (geographicKey(event.region) && !actual.province.includes(geographicKey(event.region))) return false;
  if (geographicKey(event.city) && !actual.city.includes(geographicKey(event.city))) return false;
  return true;
}
