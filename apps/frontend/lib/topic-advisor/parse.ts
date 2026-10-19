import { ACCESS_OPTIONS, RESOURCE_OPTIONS, SETTING_OPTIONS, DOMAIN_OPTIONS, FEATURE_NAMES } from './types.ts';
import { rejectDuplicateMembers } from '../questionnaire.ts';
import { parseProfileRegionFields, assertProfileRegionExecutable } from './geography.ts';
import type { AccessStatus, TopicProfile, TopicCandidate, TopicDraft, TopicCatalog, TopicSources, TopicEvents, TopicTraining, TopicRankerModel, TopicBundle } from './types.ts';

export class TopicInputError extends Error {
  constructor(message: string) { super(message); this.name = 'TopicInputError'; }
}
const fail = (where: string, message: string): never => { throw new TopicInputError(`${where}：${message}`); };
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export function object(input: unknown, where: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return fail(where, '应为对象');
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) return fail(where, '对象格式无效');
  for (const key of Object.keys(input)) if (forbidden.has(key)) fail(where, '不接受特殊属性');
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(input))) if (descriptor.get || descriptor.set) fail(where, '不接受动态属性');
  return input as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], where: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(where, `不支持字段 ${key}`);
}
function text(input: unknown, where: string, max = 600, optional = false): string {
  if (input === undefined && optional) return '';
  if (typeof input !== 'string') return fail(where, '应为文字');
  const value = input.trim();
  if (value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return fail(where, '文字过长或包含控制字符');
  if (!optional && !value) return fail(where, '不能为空');
  return value;
}
function list(input: unknown, where: string, maxItems = 30, maxLength = 600, optional = false): string[] {
  if (input === undefined && optional) return [];
  if (!Array.isArray(input) || input.length > maxItems) return fail(where, `应为不超过 ${maxItems} 项的列表`);
  for (let i = 0; i < input.length; i++) { const d = Object.getOwnPropertyDescriptor(input, String(i)); if (!d || d.get || d.set) fail(where, '列表不能包含空位或动态属性'); }
  const values = input.map((v, i) => text(v, `${where}[${i}]`, maxLength));
  if (new Set(values).size !== values.length) return fail(where, '列表包含重复项');
  return values;
}
function numberOrNull(input: unknown, where: string, max: number, optional = false): number | null {
  if (input === null || (input === undefined && optional)) return null;
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0 || input > max) return fail(where, '应为范围内的非负数字或 null');
  return input;
}
function enumeration<T extends string>(input: unknown, allowed: readonly T[], where: string): T {
  if (typeof input !== 'string' || !allowed.includes(input as T)) return fail(where, '选项无效');
  return input as T;
}
function bool(input: unknown, where: string): boolean { if (typeof input !== 'boolean') return fail(where, '应为布尔值'); return input; }
export function date(input: unknown, where: string, optional = false): string {
  const value = text(input, where, 10, optional);
  if (!value && optional) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) return fail(where, '应为有效的 YYYY-MM-DD 日期');
  return value;
}
function choiceList(input: unknown, options: { id: string }[], where: string, optional = false) {
  return list(input, where, 30, 100, optional).map(v => enumeration(v, options.map(o => o.id), where));
}
function statuses(input: unknown, options: { id: string }[], where: string): Record<string, AccessStatus> {
  if (input === undefined) return {};
  const value = object(input, where); keys(value, options.map(o => o.id), where);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, enumeration(v, ['confirmed', 'possible', 'unavailable'] as const, `${where}.${k}`)]));
}
export function parseTopicProfile(input: unknown): TopicProfile {
  const p = object(input, '研究背景');
  keys(p, ['region', 'city', 'school', 'schoolContext', 'discipline', 'interests', 'domains', 'days', 'budgetYuan', 'access', 'resources', 'sensitiveData', 'referenceDate', 'competitionWindow', 'schemaVersion', 'regionRef'], '研究背景');
  const regionFields = parseProfileRegionFields(p);
  let competitionWindow: TopicProfile['competitionWindow'] = null;
  if (p.competitionWindow != null) {
    const w = object(p.competitionWindow, '比赛时间范围'); keys(w, ['start', 'end'], '比赛时间范围');
    competitionWindow = { start: date(w.start, '开始日期'), end: date(w.end, '结束日期') };
    if (competitionWindow.start > competitionWindow.end) fail('比赛时间范围', '开始日期不能晚于结束日期');
  }
  return {
    region: text(p.region, '省份', 80, true), city: text(p.city, '城市', 80, true), school: text(p.school, '学校', 120, true),
    schoolContext: choiceList(p.schoolContext, SETTING_OPTIONS, '熟悉场景', true), discipline: text(p.discipline, '专业', 100, true),
    interests: list(p.interests, '兴趣', 12, 60, true), domains: choiceList(p.domains, DOMAIN_OPTIONS, '关注领域', true),
    days: numberOrNull(p.days, '可用天数', 3660, true), budgetYuan: numberOrNull(p.budgetYuan, '预算', 1e8, true),
    access: statuses(p.access, ACCESS_OPTIONS, '样本渠道'), resources: statuses(p.resources, RESOURCE_OPTIONS, '团队资源'),
    sensitiveData: p.sensitiveData === undefined ? 'avoid' : enumeration(p.sensitiveData, ['avoid', 'review_required', 'approved'] as const, '敏感研究设置'),
    referenceDate: date(p.referenceDate, '参考日期', true), competitionWindow, ...regionFields,
  };
}
/** History/read parsing remains shape-only; execution explicitly requires the active directory. */
export function parseExecutableTopicProfile(input: unknown): TopicProfile {
  const profile = parseTopicProfile(input); assertProfileRegionExecutable(profile); return profile;
}
export function parseTopicCandidate(input: unknown): TopicCandidate {
  const c = object(input, '候选选题');
  keys(c, ['title', 'decisionOwner', 'decision', 'population', 'geography', 'accessNeeds', 'resourceNeeds', 'evidencePlan', 'differentiators', 'action', 'sensitive'], '候选选题');
  return { title: text(c.title, '题目', 200, true), decisionOwner: text(c.decisionOwner, '决策者', 160, true), decision: text(c.decision, '决策', 600, true), population: text(c.population, '人群', 300, true), geography: text(c.geography, '研究地域', 160, true), accessNeeds: choiceList(c.accessNeeds, ACCESS_OPTIONS, '所需渠道', true), resourceNeeds: choiceList(c.resourceNeeds, RESOURCE_OPTIONS, '所需资源', true), evidencePlan: text(c.evidencePlan, '证据计划', 1200, true), differentiators: list(c.differentiators, '差异点', 8, 300, true), action: text(c.action, '预期行动', 600, true), sensitive: c.sensitive === undefined ? false : bool(c.sensitive, '敏感研究') };
}
export function parseTopicDraft(input: unknown): TopicDraft {
  let data = input;
  if (typeof data === 'string') {
    if (data.length > 65536) fail('选题草稿', '文件过大');
    try { const raw = data; data = JSON.parse(raw); rejectDuplicateMembers(raw); } catch { fail('选题草稿', 'JSON 格式无效、字段重复或嵌套过深'); }
  }
  const d = object(data, '选题草稿'); keys(d, ['schemaVersion', 'profile', 'candidate'], '选题草稿');
  if (d.schemaVersion !== 1 && d.schemaVersion !== 2) fail('选题草稿', '版本不支持，请使用版本 1 或 2');
  const profile = parseTopicProfile(d.profile);
  if ((d.schemaVersion === 2) !== (profile.schemaVersion === 2)) fail('选题草稿', '草稿版本与研究背景版本不一致');
  return { schemaVersion: d.schemaVersion as 1 | 2, profile, candidate: d.candidate == null ? null : parseTopicCandidate(d.candidate) };
}
export const exportTopicDraft = (draft: TopicDraft): string => JSON.stringify(parseTopicDraft(draft), null, 2);
/** Opaque, account-and-project scoped storage. No global or anonymous fallback. */
export function topicStorageKey(accountId: string, projectId: string): string {
  for (const [label, value] of [['账户', accountId], ['项目', projectId]]) if (!value || value.length > 160 || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) fail(label, '缺少有效的保存范围');
  return `evix:topic-advisor:v1:${encodeURIComponent(accountId)}:${encodeURIComponent(projectId)}`;
}
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const profileFingerprint = (profile: TopicProfile): string => stableStringify(parseTopicProfile(profile));
function root(input: unknown, key: string, max: number) {
  const r = object(input, key); if (r.schemaVersion !== 1) fail(key, '版本不支持');
  if (!Array.isArray(r[key]) || r[key].length > max) fail(key, '列表无效或过长');
  const rows = r[key] as unknown[]; const ids = new Set<string>();
  const values = rows.map((v, i) => { const o = object(v, `${key}[${i}]`); const id = text(o.id, `${key}[${i}].id`, 100); if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(id)) fail(key, 'ID 格式无效'); if (ids.has(id)) fail(key, `重复 ID ${id}`); ids.add(id); return o; });
  return { r, values };
}
export function parseTopicCatalog(input: unknown): TopicCatalog {
  const { r, values } = root(input, 'patterns', 200);
  return { schemaVersion: 1, contentVersion: text(r.contentVersion, '内容版本', 100), patterns: values.map(p => ({
    id: text(p.id, '模式 ID', 100), title: text(p.title, '模式题目', 200), domain: enumeration(p.domain, DOMAIN_OPTIONS.map(x => x.id), '模式领域'),
    regionTags: list(p.regionTags, '模式省份', 35, 80), cityTags: list(p.cityTags, '模式城市', 40, 80), settingTags: choiceList(p.settingTags, SETTING_OPTIONS, '模式场景'),
    accessNeeds: choiceList(p.accessNeeds, ACCESS_OPTIONS, '模式渠道'), resourceNeeds: choiceList(p.resourceNeeds, RESOURCE_OPTIONS, '模式资源'),
    decisionOwner: text(p.decisionOwner, '模式决策者'), decision: text(p.decision, '模式决策'), question: text(p.question, '模式问题'), population: text(p.population, '模式人群'),
    minimumEvidence: list(p.minimumEvidence, '最低证据'), methods: list(p.methods, '方法'), differentiators: list(p.differentiators, '差异点'), scopeLimits: list(p.scopeLimits, '适用边界'), rejectWhen: list(p.rejectWhen, '退出条件'), sourceIds: list(p.sourceIds, '来源 ID', 30, 100),
    minimumDays: numberOrNull(p.minimumDays, '最低天数', 3660), minimumBudgetYuan: numberOrNull(p.minimumBudgetYuan, '最低预算', 1e8), sensitive: bool(p.sensitive, '敏感模式'),
  })) };
}
export function parseTopicSources(input: unknown): TopicSources {
  const { values } = root(input, 'sources', 200);
  return { schemaVersion: 1, sources: values.map(s => {
    const url = text(s.url, '来源链接', 2000, true), path = text(s.path, '来源路径', 600, true);
    if (url) { let parsed: URL; try { parsed = new URL(url); } catch { return fail('来源链接', 'URL 无效'); } if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('来源链接', '仅接受普通网页链接'); }
    if (path && (/^(?:[a-z]:|\/|\\)/i.test(path) || path.split(/[\\/]/).includes('..'))) fail('来源路径', '必须为安全的相对路径');
    if (!url && !path) fail('来源', '缺少链接或相对路径');
    return { id: text(s.id, '来源 ID', 100), title: text(s.title, '来源标题', 300), ...(url ? { url } : {}), ...(path ? { path } : {}), authority: text(s.authority, '来源级别', 150), coverage: enumeration(s.coverage, ['fulltext', 'listing_only', 'reference'] as const, '来源覆盖'), limitations: list(s.limitations, '来源限制'), ...(s.publishedAt ? { publishedAt: date(s.publishedAt, '来源发布日期') } : {}), ...(s.retrievedAt ? { retrievedAt: date(s.retrievedAt, '来源读取日期') } : {}), supportedClaims: list(s.supportedClaims, '来源支持范围', 30, 800, true), locator: text(s.locator, '原文定位', 1000, true), rights: text(s.rights, '来源权利', 1000, true) };
  }) };
}
export function parseTopicEvents(input: unknown): TopicEvents {
  const { values } = root(input, 'events', 200);
  return { schemaVersion: 1, events: values.map(e => {
    const g = object(e.geography, '事件地域');
    const geography = { level: enumeration(g.level, ['national', 'province', 'city'] as const, '事件地域级别'), region: text(g.region, '事件省份', 80, true), city: text(g.city, '事件城市', 80, true) };
    if (geography.level === 'province' && !geography.region || geography.level === 'city' && !geography.city) fail('事件地域', '缺少精确地域');
    const validFrom = date(e.validFrom, '事件起始日期'), validUntil = date(e.validUntil, '事件复核期限');
    if (validFrom > validUntil) fail('事件日期', '起始日期晚于期限');
    return { id: text(e.id, '事件 ID', 100), title: text(e.title, '事件标题', 300), domain: enumeration(e.domain, DOMAIN_OPTIONS.map(x => x.id), '事件领域'), geography, publishedAt: date(e.publishedAt, '发布日期', e.status === 'pending_verification'), validFrom, validUntil, summary: text(e.summary, '事件摘要', 1500), researchHypotheses: list(e.researchHypotheses, '研究假设', 15, 800), patternIds: list(e.patternIds, '关联模式', 30, 100), sourceIds: list(e.sourceIds, '事件来源', 30, 100), status: enumeration(e.status, ['verified', 'pending_verification', 'historical'] as const, '事件状态'), ...(e.eventDate ? { eventDate: date(e.eventDate, '事件发生日期') } : {}), ...(e.verifiedAt ? { verifiedAt: date(e.verifiedAt, '核验日期') } : {}), referenceOnly: e.referenceOnly === undefined ? false : bool(e.referenceOnly, '仅作参考'), observedEvent: text(e.observedEvent, '已观察事件', 1500, true), validityBasis: text(e.validityBasis, '时效依据', 1200, true), limitations: list(e.limitations, '事件限制', 30, 800, true) };
  }) };
}
export function parseTopicTraining(input: unknown): TopicTraining {
  const { r, values } = root(input, 'pairs', 2000);
  if (r.split !== 'train' || r.dataClass !== 'authored_synthetic') fail('训练集', '只接受标明 train / authored_synthetic 的训练记录');
  if (!values.length) fail('训练集', '不能是空数据');
  return { schemaVersion: 1, split: 'train', dataClass: 'authored_synthetic', pairs: values.map(p => {
    const preferredPatternId = text(p.preferredPatternId, '偏好模式', 100), rejectedPatternId = text(p.rejectedPatternId, '对比模式', 100);
    if (preferredPatternId === rejectedPatternId) fail('训练对', '两个模式不能相同');
    return { id: text(p.id, '训练对 ID', 100), context: parseTopicProfile(p.context), preferredPatternId, rejectedPatternId, rationale: text(p.rationale, '作者理由', 1500), sourceIds: list(p.sourceIds, '训练来源', 30, 100) };
  }) };
}
export function parseTopicModel(input: unknown): TopicRankerModel {
  const m = object(input, '排序模型'), t = object(m.training, '训练记录');
  if (m.schemaVersion !== 1 || m.algorithm !== 'projected_pairwise_logistic_v1' || t.dataClass !== 'authored_synthetic') fail('排序模型', '不支持的模型版本或训练类别');
  if (JSON.stringify(m.featureNames) !== JSON.stringify(FEATURE_NAMES)) fail('排序模型', '特征顺序不一致');
  if (!Array.isArray(m.weights) || m.weights.length !== FEATURE_NAMES.length || m.weights.some(w => typeof w !== 'number' || !Number.isFinite(w) || w < 0 || w > 100)) fail('排序模型', '权重无效');
  const hash = (v: unknown, key: string) => { const s = text(v, key, 64); if (!/^[a-f0-9]{64}$/.test(s)) fail(key, 'SHA-256 无效'); return s; };
  const finite = (v: unknown, key: string, max = 1e8) => { const n = numberOrNull(v, key, max); if (n === null) return fail(key, '不能为空'); return n; };
  return { schemaVersion: 1, modelVersion: text(m.modelVersion, '模型版本', 150), algorithm: 'projected_pairwise_logistic_v1', featureNames: [...FEATURE_NAMES], weights: [...m.weights as number[]], training: { dataClass: 'authored_synthetic', pairCount: finite(t.pairCount, '训练数量', 2000), trainSha256: hash(t.trainSha256, '训练集指纹'), catalogSha256: hash(t.catalogSha256, '内容指纹'), eventsSha256: hash(t.eventsSha256, '事件指纹'), sourcesSha256: hash(t.sourcesSha256, '来源指纹'), epochs: finite(t.epochs, '迭代次数', 100000), learningRate: finite(t.learningRate, '学习率', 10), l2: finite(t.l2, '正则系数', 10), loss: finite(t.loss, '训练损失'), pairAccuracy: finite(t.pairAccuracy, '训练集一致率', 1) }, limitations: list(m.limitations, '模型边界') };
}
export function validateTopicReferences(catalog: TopicCatalog, sources: TopicSources, events: TopicEvents, training?: TopicTraining): void {
  const sourceIds = new Set(sources.sources.map(s => s.id)), patternIds = new Set(catalog.patterns.map(p => p.id));
  for (const row of [...catalog.patterns, ...events.events, ...(training?.pairs ?? [])]) {
    if (!row.sourceIds.length) fail(row.id, '缺少来源依据');
    for (const id of row.sourceIds) if (!sourceIds.has(id)) fail(row.id, `来源 ${id} 未登记`);
  }
  for (const e of events.events) for (const id of e.patternIds) if (!patternIds.has(id)) fail(e.id, `模式 ${id} 未登记`);
  for (const pair of training?.pairs ?? []) for (const id of [pair.preferredPatternId, pair.rejectedPatternId]) if (!patternIds.has(id)) fail(pair.id, `模式 ${id} 未登记`);
}
export function parseTopicBundle(input: unknown): TopicBundle {
  const b = object(input, '选题资料包'); const catalog = parseTopicCatalog(b.catalog), sources = parseTopicSources(b.sources), model = parseTopicModel(b.model), events = parseTopicEvents(b.events);
  validateTopicReferences(catalog, sources, events); return { catalog, sources, model, events };
}
