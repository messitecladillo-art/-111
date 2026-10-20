import catalog from '../../content/topic-advisor/catalog.json' with { type: 'json' };
import sources from '../../content/topic-advisor/sources.json' with { type: 'json' };
import model from '../../content/topic-advisor/ranker.json' with { type: 'json' };
import events from '../../content/topic-advisor/hotspot-events.json' with { type: 'json' };
import { recommendTopics } from '../topic-advisor/core.ts';
import { parseExecutableTopicProfile, parseTopicBundle, parseTopicProfile, object, profileFingerprint, stableStringify } from '../topic-advisor/parse.ts';
import { profileRegionStatus } from '../topic-advisor/geography.ts';
import { TOPIC_REGION_CATALOG, regionPath } from '../topic-advisor/regions.ts';
import type { TopicProfile, TopicRecommendation } from '../topic-advisor/types.ts';
import { TOPIC_SOURCE_VERSIONS, parseTopicSourceVersions, type TopicRefinement, type TopicSourceVersions } from '../topic-proposal.ts';
import { rejectDuplicateMembers } from '../questionnaire.ts';
import { buildTopicFirstWeekPlan, selectTopicResearchCandidates } from './research.ts';
export { buildTopicFirstWeekPlan, interpretTopicResearchFocus } from './research.ts';

export type AgentIntent = 'recommend' | 'compare' | 'refine' | 'plan';
export type AgentToolReceipt = { name: 'context' | 'catalog' | 'feasibility' | 'sources' | 'draft'; status: 'complete' | 'blocked'; summary: string; patternIds: string[]; sourceIds: string[] };
export type AgentSource = { id: string; title: string; url?: string; path?: string; authority?: string; coverage?: 'fulltext' | 'listing_only' | 'reference' | 'search_excerpt'; limitations?: string[]; publishedAt?: string; retrievedAt?: string; supportedClaims?: string[]; locator?: string; rights?: string; snippet?: string; sha256?: string };
export type TopicAgentRequest = { schemaVersion: 1; idempotencyKey: string; catalogVersion: string; profile: TopicProfile; candidateIds: string[]; message: string; intent: AgentIntent; parentTurnId: string | null; mode: 'local' | 'model'; serviceId: string | null; serviceRevision: number | null; consent: boolean; lookupId?: string; projectId?: string | null };
export type TopicAgentPending = { schemaVersion: 1; ownerId: string; namespace: string; request: TopicAgentRequest; context: string; sourceVersions: TopicSourceVersions };
export type TopicAgentTurn = { schemaVersion: 1; id: string; status: 'running' | 'ready' | 'failed' | 'outcome_unknown'; classification: 'proposed'; mode: 'local' | 'model'; providerMode: 'local' | 'fixture' | 'live'; modelCalled: boolean; catalogVersion: string; sourceVersions: TopicSourceVersions; inputFingerprint: string; profile: TopicProfile; message: string; intent: AgentIntent; candidateIds: string[]; parentTurnId: string | null; turnIndex: number; serviceId: string | null; serviceRevision: number | null; createdAt: string; finishedAt: string | null; assistant: { text: string; questions: string[]; items: TopicRefinement[] } | null; tools: AgentToolReceipt[]; sources: AgentSource[]; errorCode: string | null; projectId?: string | null };
export const TOPIC_AGENT_INTENTS: ReadonlyArray<{ id: AgentIntent; label: string }> = [{ id: 'recommend', label: '寻找方向' }, { id: 'compare', label: '比较取舍' }, { id: 'refine', label: '深入选题' }, { id: 'plan', label: '安排验证' }];
const bundle = parseTopicBundle({ catalog, sources, model, events });
const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const fail = (): never => { throw Error('选题 Agent 记录格式无效。'); };
function record(value: unknown, allowed: string[]): Record<string, unknown> { const row = object(value, '选题 Agent'); if (Object.keys(row).some(key => !allowed.includes(key))) fail(); return row; }
function text(value: unknown, max = 1200, empty = false): string { if (typeof value !== 'string' || value.length > max || !empty && !value.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail(); return value as string; }
function list(value: unknown, count: number, max = 160): string[] { if (!Array.isArray(value) || value.length > count) fail(); for (let index = 0; index < (value as unknown[]).length; index++) { const descriptor = Object.getOwnPropertyDescriptor(value, String(index)); if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail(); } const items = (value as unknown[]).map(item => text(item, max)); if (new Set(items).size !== items.length) fail(); return items; }
function enumeration<T extends string>(value: unknown, allowed: readonly T[]): T { if (typeof value !== 'string' || !allowed.includes(value as T)) fail(); return value as T; }
function uuid(value: unknown): string { if (typeof value !== 'string' || !uuidPattern.test(value)) fail(); return value as string; }
function projectField(value: { projectId?: unknown }): { projectId?: string | null } { return Object.hasOwn(value, 'projectId') ? { projectId: value.projectId === null ? null : uuid(value.projectId) } : {}; }
function projectScope(value?: string | null): string | null { return value == null ? null : uuid(value); }
export function topicAgentScopeQuery(projectId?: string | null): string { const scope = projectScope(projectId); return scope === null ? '?scope=global' : `?projectId=${encodeURIComponent(scope)}`; }
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail(); return value as number; }
function iso(value: unknown): string { const result = text(value, 50); if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result))) fail(); return result; }
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export function inferTopicAgentIntent(message: string): AgentIntent { return /比较|对比|取舍|哪个更|二选|三选/.test(message) ? 'compare' : /第一周|计划|安排|接下来|下一步|验证|怎么做/.test(message) ? 'plan' : /深入|细化|创新|差异|研究问题|深挖|改题/.test(message) ? 'refine' : 'recommend'; }

function validateRequest(input: Omit<TopicAgentRequest, 'schemaVersion' | 'idempotencyKey' | 'catalogVersion'>): typeof input {
  const profile = parseExecutableTopicProfile(input.profile), ids = list(input.candidateIds, 3, 100), message = text(input.message).trim();
  if (ids.some(id => !bundle.catalog.patterns.some(pattern => pattern.id === id))) fail();
  const mode = enumeration(input.mode, ['local', 'model']), intent = enumeration(input.intent, ['recommend', 'compare', 'refine', 'plan']);
  const parentTurnId = input.parentTurnId === null ? null : uuid(input.parentTurnId);
  if (typeof input.consent !== 'boolean') fail();
  if (mode === 'model') { uuid(input.serviceId); integer(input.serviceRevision, 1); if (!input.consent || !ids.length) fail(); }
  else if (input.serviceId !== null || input.serviceRevision !== null || input.consent !== false) fail();
  if (input.lookupId !== undefined) uuid(input.lookupId);
  return { ...input, ...projectField(input), profile, candidateIds: [...ids], message, intent, mode, parentTurnId };
}
export function freezeTopicAgentRequest(input: Omit<TopicAgentRequest, 'schemaVersion' | 'idempotencyKey' | 'catalogVersion'>): TopicAgentRequest {
  return clone({ ...validateRequest(input), schemaVersion: 1, idempotencyKey: crypto.randomUUID(), catalogVersion: bundle.catalog.contentVersion });
}
/** Historical pending payload validation preserves the original nonce and source bytes binding. */
export function parseTopicAgentPending(raw: unknown, ownerId: string, namespace: string): TopicAgentPending | null {
  if (raw == null) return null;
  let input = raw;
  if (typeof input === 'string') { if (new TextEncoder().encode(input).byteLength > 150_000) fail(); rejectDuplicateMembers(input); input = JSON.parse(input); }
  const saved = record(input, ['schemaVersion', 'ownerId', 'namespace', 'request', 'context', 'sourceVersions']);
  if (saved.ownerId !== ownerId || saved.namespace !== namespace || !ownerId) return null;
  if (saved.schemaVersion !== 1) fail();
  const body = record(saved.request, ['schemaVersion', 'idempotencyKey', 'catalogVersion', 'profile', 'candidateIds', 'message', 'intent', 'parentTurnId', 'mode', 'serviceId', 'serviceRevision', 'consent', 'lookupId', 'projectId']);
  if (body.schemaVersion !== 1 || body.mode !== 'model' || body.consent !== true) fail();
  const request: TopicAgentRequest = { schemaVersion: 1, idempotencyKey: uuid(body.idempotencyKey), catalogVersion: text(body.catalogVersion, 100), profile: parseTopicProfile(body.profile), candidateIds: list(body.candidateIds, 3, 100), message: text(body.message), intent: enumeration(body.intent, ['recommend', 'compare', 'refine', 'plan']), parentTurnId: body.parentTurnId === null ? null : uuid(body.parentTurnId), mode: 'model', serviceId: uuid(body.serviceId), serviceRevision: integer(body.serviceRevision, 1), consent: true };
  if (!request.candidateIds.length || stableStringify(request.profile) !== stableStringify(body.profile) || request.message !== request.message.trim()) fail();
  if (body.lookupId !== undefined) request.lookupId = uuid(body.lookupId);
  Object.assign(request, projectField(body));
  if (Object.hasOwn(request, 'projectId') && namespace !== (request.projectId ? `project:${request.projectId}` : 'global')) fail();
  return { schemaVersion: 1, ownerId, namespace, request, context: text(saved.context, 30000), sourceVersions: parseTopicSourceVersions(saved.sourceVersions) };
}
export function topicAgentFingerprintMaterial(request: TopicAgentRequest, sourceVersions: TopicSourceVersions = TOPIC_SOURCE_VERSIONS) {
  return { schemaVersion: 1, catalogVersion: request.catalogVersion, profile: request.profile, candidateIds: request.candidateIds, message: request.message, intent: request.intent, parentTurnId: request.parentTurnId, mode: request.mode, serviceId: request.serviceId, serviceRevision: request.serviceRevision, lookupId: request.lookupId ?? null, sourceVersions, ...projectField(request) };
}
async function digest(value: unknown): Promise<string> { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableStringify(value))))].map(value => value.toString(16).padStart(2, '0')).join(''); }
function parseSource(value: unknown): AgentSource {
  const row = record(value, ['id', 'title', 'url', 'path', 'authority', 'coverage', 'limitations', 'publishedAt', 'retrievedAt', 'supportedClaims', 'locator', 'rights', 'snippet', 'sha256']);
  const result: AgentSource = { id: text(row.id, 160), title: text(row.title, 600) };
  for (const key of ['url', 'path', 'authority', 'publishedAt', 'retrievedAt', 'locator', 'rights', 'snippet'] as const) if (row[key] !== undefined) result[key] = text(row[key], 4000, true);
  if (result.url) { try { const url = new URL(result.url); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail(); } catch { fail(); } }
  if (row.coverage !== undefined) result.coverage = enumeration(row.coverage, ['fulltext', 'listing_only', 'reference', 'search_excerpt'] as const);
  if (row.sha256 !== undefined) { result.sha256 = text(row.sha256, 64, true); if (result.sha256 && !/^[a-f0-9]{64}$/.test(result.sha256)) fail(); }
  if (row.limitations !== undefined) result.limitations = list(row.limitations, 30, 1200);
  if (row.supportedClaims !== undefined) result.supportedClaims = list(row.supportedClaims, 30, 1200);
  return result;
}
function parseItem(value: unknown, ids: string[], sourceIds: string[]): TopicRefinement {
  const row = record(value, ['patternId', 'title', 'researchQuestion', 'decisionOwner', 'decision', 'whyHere', 'firstWeekPlan', 'unknowns', 'sourceIds']);
  const item: TopicRefinement = { patternId: text(row.patternId, 100), title: text(row.title, 160), researchQuestion: text(row.researchQuestion, 600), decisionOwner: text(row.decisionOwner, 600), decision: text(row.decision, 600), whyHere: text(row.whyHere, 600), firstWeekPlan: list(row.firstWeekPlan, 5, 300), unknowns: list(row.unknowns, 8, 300), sourceIds: list(row.sourceIds, 20, 160) };
  if (!ids.includes(item.patternId) || !item.firstWeekPlan.length || !item.sourceIds.length || item.sourceIds.some(id => !sourceIds.includes(id))) fail(); return item;
}
export function parseTopicAgentTurn(raw: unknown): TopicAgentTurn {
  const row = record(raw, ['schemaVersion', 'id', 'status', 'classification', 'mode', 'providerMode', 'modelCalled', 'catalogVersion', 'sourceVersions', 'inputFingerprint', 'profile', 'message', 'intent', 'candidateIds', 'parentTurnId', 'turnIndex', 'serviceId', 'serviceRevision', 'createdAt', 'finishedAt', 'assistant', 'tools', 'sources', 'errorCode', 'projectId']);
  if (row.schemaVersion !== 1 || row.classification !== 'proposed' || typeof row.modelCalled !== 'boolean') fail();
  const mode = enumeration(row.mode, ['local', 'model']), status = enumeration(row.status, ['running', 'ready', 'failed', 'outcome_unknown']), providerMode = enumeration(row.providerMode, ['local', 'fixture', 'live']);
  const ids = list(row.candidateIds, 3, 100), sourceVersions = parseTopicSourceVersions(row.sourceVersions);
  const profile = parseTopicProfile(row.profile), inputFingerprint = text(row.inputFingerprint, 64);
  if (!/^[a-f0-9]{64}$/.test(inputFingerprint) || mode === 'local' && (row.modelCalled || providerMode !== 'local') || mode === 'model' && providerMode === 'local') fail();
  if (!Array.isArray(row.sources) || row.sources.length > 100 || !Array.isArray(row.tools) || row.tools.length > 12) fail();
  const sourceList = (row.sources as unknown[]).map(parseSource), sourceIds = sourceList.map(source => source.id);
  if (new Set(sourceIds).size !== sourceIds.length) fail();
  const tools: AgentToolReceipt[] = (row.tools as unknown[]).map(value => { const tool = record(value, ['name', 'status', 'summary', 'patternIds', 'sourceIds']); const result = { name: enumeration(tool.name, ['context', 'catalog', 'feasibility', 'sources', 'draft']), status: enumeration(tool.status, ['complete', 'blocked']), summary: text(tool.summary, 1200), patternIds: list(tool.patternIds, 100, 100), sourceIds: list(tool.sourceIds, 100, 160) }; if (result.sourceIds.some(id => !sourceIds.includes(id))) fail(); return result; });
  let assistant: TopicAgentTurn['assistant'] = null;
  if (row.assistant !== null) { const reply = record(row.assistant, ['text', 'questions', 'items']); if (!Array.isArray(reply.items) || reply.items.length > 3) fail(); const items = (reply.items as unknown[]).map(value => parseItem(value, ids, sourceIds)); if (new Set(items.map(item => item.patternId)).size !== items.length) fail(); assistant = { text: text(reply.text, 2400), questions: list(reply.questions, 5, 240), items }; }
  const finishedAt = row.finishedAt === null ? null : iso(row.finishedAt), errorCode = row.errorCode === null ? null : text(row.errorCode, 100);
  if (status === 'ready' ? !assistant || !finishedAt || errorCode : status === 'running' ? assistant || finishedAt || errorCode : assistant || !finishedAt || !errorCode) fail();
  const blocked = new Set(tools.filter(tool => tool.name === 'feasibility' && tool.status === 'blocked').flatMap(tool => tool.patternIds));
  if (assistant?.items.some(item => blocked.has(item.patternId))) fail();
  const serviceId = row.serviceId === null ? null : uuid(row.serviceId), serviceRevision = row.serviceRevision === null ? null : integer(row.serviceRevision, 1);
  if (mode === 'local' && (serviceId || serviceRevision) || mode === 'model' && (!serviceId || !serviceRevision)) fail();
  return { schemaVersion: 1, id: uuid(row.id), status, classification: 'proposed', mode, providerMode, modelCalled: row.modelCalled as boolean, catalogVersion: text(row.catalogVersion, 100), sourceVersions, inputFingerprint, profile, message: text(row.message), intent: enumeration(row.intent, ['recommend', 'compare', 'refine', 'plan']), candidateIds: ids, parentTurnId: row.parentTurnId === null ? null : uuid(row.parentTurnId), turnIndex: integer(row.turnIndex, 1, 12), serviceId, serviceRevision, createdAt: iso(row.createdAt), finishedAt, assistant, tools, sources: sourceList, errorCode, ...projectField(row) };
}
export async function verifyTopicAgentTurn(raw: TopicAgentTurn, request: TopicAgentRequest, expectedVersions: TopicSourceVersions = TOPIC_SOURCE_VERSIONS): Promise<void> {
  const turn = parseTopicAgentTurn(raw);
  const versions = parseTopicSourceVersions(expectedVersions), expected = topicAgentFingerprintMaterial(request, versions);
  if (stableStringify(projectField(turn)) !== stableStringify(projectField(request)) || turn.id !== request.idempotencyKey || turn.catalogVersion !== request.catalogVersion || turn.message !== request.message || turn.intent !== request.intent || turn.parentTurnId !== request.parentTurnId || turn.mode !== request.mode || turn.serviceId !== request.serviceId || turn.serviceRevision !== request.serviceRevision || stableStringify(turn.profile) !== stableStringify(request.profile) || stableStringify(turn.candidateIds) !== stableStringify(request.candidateIds) || stableStringify(turn.sourceVersions) !== stableStringify(versions) || turn.inputFingerprint !== await digest(expected)) throw Error('选题 Agent 回执与本次材料不一致，请核对原请求。');
}

/** Read an owned server transcript without treating historical proposals as current approval. */
export function parseTopicAgentConversation(raw: unknown, scope?: string | null): TopicAgentTurn[] {
  const body = record(raw, ['turns']), expected = projectScope(scope);
  if (!Array.isArray(body.turns) || !body.turns.length || body.turns.length > 12) fail();
  const input = body.turns as unknown[];
  for (let index = 0; index < input.length; index++) { const descriptor = Object.getOwnPropertyDescriptor(input, String(index)); if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail(); }
  const turns = input.map(parseTopicAgentTurn), ids = new Set<string>(), mode = turns[0].mode;
  turns.forEach((turn, index) => {
    if (ids.has(turn.id) || projectScope(turn.projectId) !== expected || turn.mode !== mode || turn.turnIndex !== index + 1 || turn.parentTurnId !== (index ? turns[index - 1].id : null) || index > 0 && Date.parse(turn.createdAt) < Date.parse(turns[index - 1].createdAt) || index < turns.length - 1 && turn.status !== 'ready') fail();
    ids.add(turn.id);
  });
  return turns;
}

/** Restoring a transcript never dispatches; a future send still needs fresh service and consent. */
export function topicAgentConversationResumable(input: TopicAgentTurn[], scope?: string | null): boolean {
  try {
    const turns = parseTopicAgentConversation({ turns: input }, scope);
    return turns.length < 12 && turns.every(turn => turn.mode === 'model' && turn.status === 'ready' && turn.catalogVersion === bundle.catalog.contentVersion && stableStringify(turn.sourceVersions) === stableStringify(TOPIC_SOURCE_VERSIONS));
  } catch { return false; }
}

/** Reuse only proposals that remain feasible under the actual current profile. */
export function topicAgentContinuationCandidates(profile: TopicProfile, input: TopicAgentTurn[]): TopicRefinement[] {
  try {
    const last = input[input.length - 1];
    if (!last || !topicAgentConversationResumable(input, last.projectId) || profileFingerprint(parseExecutableTopicProfile(profile)) !== profileFingerprint(last.profile)) return [];
    const feasible = new Set(recommendTopics(profile, bundle, 50).items.filter(item => item.feasibility !== 'blocked').map(item => item.patternId));
    return clone(last.assistant?.items.filter(item => feasible.has(item.patternId)) ?? []);
  } catch { return []; }
}
export function knownTopicAgentRejection(code: string): boolean { return ['invalid_input', 'invalid_request', 'invalid_json', 'duplicate_members', 'payload_too_large', 'consent_required', 'not_found', 'catalog_conflict', 'revision_conflict', 'capability_unavailable', 'call_rate_limit', 'call_active', 'topic_infeasible', 'parent_unavailable', 'parent_conflict', 'turn_limit', 'history_conflict', 'history_limit', 'lookup_unavailable', 'region_catalog_mismatch', 'unknown_region', 'sensitive_input', 'research_scope_unavailable'].includes(code); }

function clarification(profile: TopicProfile): string[] {
  const questions: string[] = [];
  if (profileRegionStatus(profile) === 'unset' || profile.schemaVersion !== 2 && !profile.city && !profile.region) questions.push('你准备在哪个城市或区县开展调查？');
  if (!Object.values(profile.access).some(value => value === 'confirmed')) questions.push('你已经能联系到哪些人群或单位？请在团队条件中确认。');
  if (!Object.values(profile.resources).some(value => value === 'confirmed')) questions.push('目前能实际完成问卷、访谈、观察或公开资料核验中的哪些？');
  if (profile.days === null) questions.push('能用于调研的时间有多少天？');
  if (profile.budgetYuan === null) questions.push('可用的调研经费大约是多少？没有经费也可以填写 0 元。');
  return questions.slice(0, 3);
}
/** Bounded local tool runner. No model, network, profile write or competition Gate side effect. */
export async function runLocalTopicAgent({ profile: input, message: rawMessage, intent, previous, candidateIds, projectId }: { profile: TopicProfile; message: string; intent: AgentIntent; previous?: TopicAgentTurn | null; candidateIds?: string[]; projectId?: string | null }): Promise<TopicAgentTurn> {
  const profile = parseExecutableTopicProfile(input), message = text(rawMessage).trim(), prior = previous ? parseTopicAgentTurn(previous) : null;
  if (prior && (prior.mode !== 'local' || prior.providerMode !== 'local' || prior.status !== 'ready')) throw Error('请从本地资料对话继续，或新建一轮讨论。');
  if (prior && projectScope(prior.projectId) !== projectScope(projectId)) throw Error('这段讨论属于其他项目，请在当前项目开始新讨论。');
  if (prior && prior.turnIndex >= 12) throw Error('本轮讨论已满 12 次，请新建讨论继续。');
  const ranked = recommendTopics(profile, bundle, Math.min(50, bundle.catalog.patterns.length));
  const selection = selectTopicResearchCandidates({ profile, message, items: ranked.items, explicitIds: candidateIds, previousIds: prior && profileFingerprint(prior.profile) === profileFingerprint(profile) ? prior.candidateIds : [], intent });
  const ids = list(selection.ids, 3, 100);
  const request = freezeTopicAgentRequest({ profile, message, intent, candidateIds: ids, parentTurnId: prior?.id ?? null, mode: 'local', serviceId: null, serviceRevision: null, consent: false, ...(projectId === undefined ? {} : projectField({ projectId })) });
  const feasible = ids.map(id => ranked.items.find(item => item.patternId === id)).filter((item): item is TopicRecommendation => !!item && item.feasibility !== 'blocked');
  const selected = selection.allowProposals === false ? [] : feasible;
  const denied = ids.filter(id => !feasible.some(item => item.patternId === id));
  const sourceIds = [...new Set(selected.flatMap(item => [...item.sourceIds, ...item.eventLeads.flatMap(event => event.sourceIds)]))];
  const sourceList = bundle.sources.sources.filter(source => sourceIds.includes(source.id));
  const narrowing = intent === 'refine' && selected.length ? ['你想先把哪一个方向缩小到明确人群、使用情境和要支持的决定？'] : [];
  const questions = [...new Set([...selection.questions, ...narrowing, ...clarification(profile)])].slice(0, 5);
  const items: TopicRefinement[] = selected.map(item => ({ patternId: item.patternId, title: item.title.slice(0, 160), researchQuestion: item.question.slice(0, 600), decisionOwner: item.decisionOwner.slice(0, 600), decision: item.decision.slice(0, 600), whyHere: [...item.matchReasons, ...(intent === 'refine' ? [`可从这些差异点缩小范围：${bundle.catalog.patterns.find(pattern => pattern.id === item.patternId)?.differentiators.join('；') ?? ''}`] : []), ...item.scopeLimits.slice(0, 1)].join('；').slice(0, 600) || '结合当前团队条件形成的待验证方向。', firstWeekPlan: buildTopicFirstWeekPlan(profile, bundle.catalog.patterns.find(pattern => pattern.id === item.patternId)!), unknowns: [...new Set([...item.blockers, ...item.unknowns])].slice(0, 8).map(step => step.slice(0, 300)), sourceIds: item.sourceIds.slice(0, 20) }));
  const changed = prior && profileFingerprint(prior.profile) !== profileFingerprint(profile);
  let reply = selected.length ? `${changed ? '团队条件已更新，我已重新检查可行性。' : prior ? '接着上一轮，我们继续缩小研究范围。' : '先从能够取得证据的方向开始。'}\n本轮查阅了已登记资料，并用地区、时间、经费和触达条件筛选出 ${selected.length} 个待验证方向。` : `${changed ? '团队条件已更新，我已重新检查可行性。\n' : ''}当前条件下，没有可直接推进的候选方向。先核实可接触的人群、调查范围和资源，再放宽研究问题。`;
  reply += `\n${selection.explanation}`;
  if (intent === 'compare' && selected.length) reply += `\n比较时优先看样本能否触达、结果会改变谁的决定，以及第一周能否取得反例。${selected.map(item => `\n${item.title}：${item.blockers[0] ?? item.unknowns[0] ?? item.decision}`).join('')}`;
  else if (intent === 'plan' && selected.length) reply += '\n先完成下方第一周计划，再根据实际联系和查证记录决定保留、缩小或放弃题目。';
  else if (intent === 'refine') reply += '\n把范围压到一个明确人群、一个使用情境和一个决策问题；创新点要能通过新证据检验。';
  if (questions.length) reply += '\n还有几个执行条件未确认，补充后我会重新筛选。';
  const tools: AgentToolReceipt[] = [
    { name: 'context', status: 'complete', summary: `核对当前团队条件${prior ? `与第 ${prior.turnIndex} 轮记录` : ''}，保留 ${questions.length} 项优先追问。`, patternIds: [], sourceIds: [] },
    { name: 'catalog', status: 'complete', summary: `检索 ${bundle.catalog.patterns.length} 个登记方向。${selection.explanation}`, patternIds: ids, sourceIds: [] },
    { name: 'feasibility', status: denied.length ? 'blocked' : 'complete', summary: `通过 ${selected.length} 个候选，阻断 ${denied.length} 个；未知渠道仍待确认。`, patternIds: denied.length ? denied : selected.map(item => item.patternId), sourceIds: [] },
    { name: 'sources', status: 'complete', summary: `关联 ${sourceList.length} 份登记资料；历史背景和未核实热点沿用原有范围标识。`, patternIds: selected.map(item => item.patternId), sourceIds: sourceList.map(source => source.id) },
    { name: 'draft', status: 'complete', summary: `整理 ${items.length} 份研究提案与验证计划，等待你选择。`, patternIds: items.map(item => item.patternId), sourceIds: sourceList.map(source => source.id) },
  ];
  const timestamp = new Date().toISOString();
  return parseTopicAgentTurn({ schemaVersion: 1, id: request.idempotencyKey, status: 'ready', classification: 'proposed', mode: 'local', providerMode: 'local', modelCalled: false, catalogVersion: request.catalogVersion, sourceVersions: clone(TOPIC_SOURCE_VERSIONS), inputFingerprint: await digest(topicAgentFingerprintMaterial(request)), profile, message, intent, candidateIds: ids, parentTurnId: prior?.id ?? null, turnIndex: (prior?.turnIndex ?? 0) + 1, serviceId: null, serviceRevision: null, createdAt: timestamp, finishedAt: timestamp, assistant: { text: reply.slice(0, 2400), questions, items }, tools, sources: sourceList, errorCode: null, ...projectField(request) });
}

/** Explicit intake proposals only. Nothing is changed until the user applies this candidate profile. */
export function proposeTopicProfile(input: TopicProfile, raw: string): { profile: TopicProfile; changes: string[] } | null {
  const profile = clone(parseExecutableTopicProfile(input)), message = text(raw).normalize('NFKC').split(/[。；;\n]/u).filter(clause => !/如果|假如|假设|比如|例如|可能|不确定|尚未确认/.test(clause)).join('。'), changes: string[] = [];
  const places = TOPIC_REGION_CATALOG.records.filter(place => place.level === 'prefecture' && new RegExp(`(?:我在|位于|所在地[是为：:]?|地区[是为：:]?|城市[是为：:]?|调研地点[是为：:]?)\\s*${place.name.replace(/市$/, '')}(?:市|[，,。；;\\s]|$)`).test(message));
  if (places.length === 1) { const place = places[0], ref = { code: place.code, catalogVersion: TOPIC_REGION_CATALOG.catalogVersion }; const path = regionPath(ref); profile.schemaVersion = 2; profile.regionRef = ref; profile.region = path[0]?.name ?? ''; profile.city = place.name; changes.push(`调查地区：${place.name}`); }
  const days = message.match(/(?:时间|调研时间|能用|有)\s*(\d{1,4})\s*天/);
  if (days && Number(days[1]) <= 3660) { profile.days = Number(days[1]); changes.push(`调研时间：${profile.days} 天`); }
  const budget = message.match(/(?:预算|经费)\s*(?:是|为|约|有|只有|大约|：|:)?\s*(\d{1,8})\s*元/);
  if (budget) { profile.budgetYuan = Number(budget[1]); changes.push(`调研经费：${profile.budgetYuan} 元`); }
  const channels = [{ id: 'campus_students', terms: '大学生|在校生|高校学生' }, { id: 'community_residents', terms: '社区居民' }, { id: 'merchants', terms: '商户|商家' }, { id: 'jobseekers', terms: '求职者' }, { id: 'firms', terms: '企业管理方|企业负责人' }, { id: 'event_organizer', terms: '活动组织方|赛事组织方' }];
  for (const channel of channels) { const denied = new RegExp(`(?:不能|无法|没法|不可)\\s*(?:联系|接触|访问)(?:到)?\\s*(?:${channel.terms})`).test(message), confirmed = !denied && new RegExp(`(?:可以|能够|能|已经|已确认可以)\\s*(?:联系|接触|访问)(?:到)?\\s*(?:${channel.terms})`).test(message); if (denied || confirmed) { profile.access[channel.id] = denied ? 'unavailable' : 'confirmed'; const name = channel.terms.split('|')[0]; changes.push(`${name}渠道：${denied ? '不可用' : '已确认'}`); } }
  return changes.length ? { profile: parseExecutableTopicProfile(profile), changes } : null;
}
