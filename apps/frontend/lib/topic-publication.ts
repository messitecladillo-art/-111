/** Offline editorial gates. Global authority remains a maintainer-reviewed Git PR. */
import { encodeTopicTransfer, topicTransferHash } from '../../../packages/evi-x-shared/src/topic-transfer.ts';
import { rejectDuplicateMembers } from './questionnaire.ts';
import { TOPIC_REGION_CATALOG, getRegionByCode, validateRegionRef, type RegionRef } from './topic-advisor/regions.ts';
import { ACCESS_OPTIONS } from './topic-advisor/types.ts';

export const TOPIC_PUBLICATION_UI_CONTRACT = 'evix-topic-publication-ui/1';
export const TOPIC_PUBLICATION_UI_FIELDS = ['fact', 'hypothesis', 'geography', 'time', 'readscope', 'status'] as const;
export const TOPIC_PUBLICATION_REVIEW_DAYS = 30;
type Source = { id: string; title: string; url: string; publishedAt: string | null; retrievedAt: string; authority: string; locator: string; supportedClaims: string[] };
type Fact = { id: string; text: string; sourceIds: string[]; temporalKind: 'historical_reference'; asOfDate: string | null };
type Direction = { id: string; title: string; question: string; decisionOwner: string; decision: string; population: string; requiredAccess: string[]; minimumEvidence: string[]; sourceIds: string[]; classification: 'proposed' };
type CountyProfile = { id: string; regionRef: RegionRef; displayName: string; tags: { label: string; sourceIds: string[] }[]; facts: Fact[]; directions: Direction[]; status: 'draft'; gaps: string[] };
type Pack = { schemaVersion: 1; id: string; contentVersion: string; catalogVersion: string; sources: Source[]; profiles: CountyProfile[] };
export type TopicSourceRead = { sourceId: string; coverage: 'fulltext' | 'listing_only' | 'unread'; readAt: string | null; locator: string; supportedFactIds: string[] };
export type TopicPublicationItem = { id: string; profileId: string; kind: 'fact' | 'direction'; itemHash: string };
export type TopicPublicationDraft = { rawPack: string; author: string; packHash: string; pack: Pack; sourceReads: TopicSourceRead[]; items: TopicPublicationItem[] };
export type TopicPublicationReview = {
  id: string; packId: string; contentVersion: string; packHash: string; itemId: string; itemHash: string;
  author: string; reviewer: string; reviewedAt: string; decision: 'approve'; scope: 'listing_entry' | 'body_claim' | 'proposed';
};
type Binding = { id: string; packId: string; contentVersion: string; packHash: string; profileIds: string[]; expectedPreviousHash: string | null };
export type TopicPublicationDecision = Binding & (
  { action: 'publish'; ui: { contractVersion: string; fields: string[] }; reviews: TopicPublicationReview[] } |
  { action: 'withdraw'; reason: string }
);
export type TopicPublicationRelease = {
  schemaVersion: 1; revision: number; at: string; previousHash: string | null; releaseHash: string;
  draft: TopicPublicationDraft; decision: TopicPublicationDecision;
};
export type PublishedCountyProfile = {
  packId: string; contentVersion: string; packHash: string; releaseHash: string; status: 'published';
  profile: CountyProfile; sources: Source[]; sourceReads: TopicSourceRead[];
};
function fail(message: string): never { throw new Error(`Topic publication: ${message}`); }
const equal = (actual: unknown, expected: unknown, label: string) => { if (actual !== expected) fail(`${label} mismatch`); };
function obj(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail('object required');
  const r = value as Record<string, unknown>;
  if (Object.getOwnPropertySymbols(r).length || Object.getOwnPropertyNames(r).length !== keys.length || keys.some(k => !Object.hasOwn(r, k))) fail('missing or unknown fields');
  for (const d of Object.values(Object.getOwnPropertyDescriptors(r))) if (!d.enumerable || !Object.hasOwn(d, 'value')) fail('dynamic/hidden fields');
  return r;
}
function text(value: unknown, max = 2000): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) return fail('invalid text');
  return value;
}
function id(value: unknown): string { const s = text(value, 100); if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(s)) fail('invalid ID'); return s; }
function hash(value: unknown): string { const s = text(value, 64); if (!/^[a-f0-9]{64}$/.test(s)) fail('invalid SHA256'); return s; }
function list(value: unknown, max = 1000): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== value.length + 1) return fail('invalid list');
  for (let i = 0; i < value.length; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail('sparse/dynamic list'); } return value;
}
function strings(value: unknown, min = 0): string[] {
  const a = list(value).map(v => text(v));
  if (a.length < min || new Set(a).size !== a.length) fail('empty or duplicate list'); return a;
}
function date(value: unknown): string {
  const s = text(value, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) fail('invalid date'); return s;
}
function instant(value: unknown): string {
  const s = text(value, 24); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString() !== s) fail('UTC milliseconds timestamp required'); return s;
}
function copy<T>(value: T): T { encodeTopicTransfer(value); return JSON.parse(JSON.stringify(value)) as T; }
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const digest = (kind: string, value: unknown) => topicTransferHash({ contract: `evix-topic-publication/${kind}/1`, value });
async function rawHash(raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(raw);
  if (bytes.length > 1_500_000) fail('pack exceeds 1.5MB');
  const result = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(result), b => b.toString(16).padStart(2, '0')).join('');
}
function parsePack(raw: string, current: boolean): Pack {
  if (typeof raw !== 'string' || raw.length > 1_500_000) return fail('raw JSON pack required');
  let value: unknown; try { value = JSON.parse(raw); rejectDuplicateMembers(raw); } catch { return fail('invalid JSON or duplicate members'); }
  const p = obj(copy(value), ['schemaVersion', 'id', 'contentVersion', 'catalogVersion', 'sources', 'profiles']);
  equal(p.schemaVersion, 1, 'schema'); id(p.id); id(p.contentVersion); text(p.catalogVersion, 100);
  if (current) equal(p.catalogVersion, TOPIC_REGION_CATALOG.catalogVersion, 'catalog');
  const sources = new Map<string, Source>(), allIds = new Set<string>(), codes = new Set<string>();
  for (const value of list(p.sources)) {
    const s = obj(value, ['id', 'title', 'url', 'publishedAt', 'retrievedAt', 'authority', 'locator', 'supportedClaims']);
    const sid = id(s.id); if (sources.has(sid)) fail('duplicate source'); text(s.title); text(s.authority); text(s.locator); strings(s.supportedClaims, 1);
    let url: URL; try { url = new URL(text(s.url)); } catch { return fail('invalid source URL'); }
    if (url.protocol !== 'https:' || url.username || url.password || !/^(?:[a-z0-9-]+\.)+gov\.cn$/i.test(url.hostname)) fail('primary government HTTPS source required');
    date(s.retrievedAt); if (s.publishedAt !== null && date(s.publishedAt) > (s.retrievedAt as string)) fail('publication after retrieval');
    sources.set(sid, s as Source);
  }
  const refs = (value: unknown) => { const a = strings(value, 1); if (a.some(s => !sources.has(s))) fail('unknown source reference'); return a; };
  const uniqueId = (value: unknown) => { const s = id(value); if (allIds.has(s)) fail('duplicate profile/item ID'); allIds.add(s); return s; };
  const profiles = list(p.profiles, 100);
  if (!profiles.length || !sources.size) fail('empty pack');
  for (const value of profiles) {
    const r = obj(value, ['id', 'regionRef', 'displayName', 'tags', 'facts', 'directions', 'status', 'gaps']); uniqueId(r.id); text(r.displayName); equal(r.status, 'draft', 'draft status'); strings(r.gaps, 1);
    const ref = obj(r.regionRef, ['code', 'catalogVersion']); if (!/^[1-9]\d{5}$/.test(text(ref.code))) fail('invalid region code'); equal(ref.catalogVersion, p.catalogVersion, 'profile catalog');
    if (codes.has(ref.code as string)) fail('duplicate geography'); codes.add(ref.code as string);
    if (current) { validateRegionRef(ref); const row = getRegionByCode(ref.code as string)!; equal(row.level, 'county', 'county level'); equal(r.displayName, row.name, 'canonical name'); }
    for (const tag of list(r.tags)) { const t = obj(tag, ['label', 'sourceIds']); text(t.label); refs(t.sourceIds); }
    const facts = list(r.facts), directions = list(r.directions);
    if (!facts.length || !directions.length) fail('facts and directions required');
    for (const value of facts) {
      const f = obj(value, ['id', 'text', 'sourceIds', 'temporalKind', 'asOfDate']); uniqueId(f.id); text(f.text); equal(f.temporalKind, 'historical_reference', 'fact time classification');
      const ids = refs(f.sourceIds); if (ids.some(s => !sources.get(s)!.supportedClaims.includes(f.text as string))) fail('fact outside declared source claims');
      if (f.asOfDate !== null && ids.some(s => date(f.asOfDate) > sources.get(s)!.retrievedAt)) fail('fact date after retrieval');
    }
    for (const value of directions) {
      const d = obj(value, ['id', 'title', 'question', 'decisionOwner', 'decision', 'population', 'requiredAccess', 'minimumEvidence', 'sourceIds', 'classification']); uniqueId(d.id);
      for (const k of ['title', 'question', 'decisionOwner', 'decision', 'population']) text(d[k]);
      equal(d.classification, 'proposed', 'direction classification'); refs(d.sourceIds); strings(d.minimumEvidence, 3);
      if (strings(d.requiredAccess, 1).some(a => !ACCESS_OPTIONS.some(v => v.id === a))) fail('unknown access requirement');
    }
  }
  return p as Pack;
}
function parseReads(value: unknown, pack: Pack): TopicSourceRead[] {
  const reads = list(copy(value)).map(value => {
    const r = obj(value, ['sourceId', 'coverage', 'readAt', 'locator', 'supportedFactIds']); id(r.sourceId); text(r.locator);
    if (!pack.sources.some(s => s.id === r.sourceId) || !['fulltext', 'listing_only', 'unread'].includes(r.coverage as string)) fail('unknown read source/coverage');
    const ids = strings(r.supportedFactIds);
    if (ids.some(fid => !pack.profiles.some(p => p.facts.some(f => f.id === fid && f.sourceIds.includes(r.sourceId as string))))) fail('read scope references another fact');
    if (r.coverage === 'unread') { if (r.readAt !== null || ids.length) fail('unread source cannot support claims'); }
    else { instant(r.readAt); if ((r.readAt as string).slice(0, 10) < pack.sources.find(s => s.id === r.sourceId)!.retrievedAt) fail('read before retrieval'); }
    return r as TopicSourceRead;
  });
  if (new Set(reads.map(r => r.sourceId)).size !== reads.length) fail('duplicate source read'); return reads;
}
async function prepare(rawPack: string, author: string, sourceReads: unknown, current: boolean): Promise<TopicPublicationDraft> {
  const pack = parsePack(rawPack, current); text(author, 160);
  return prepareParsed(rawPack, author, pack, parseReads(sourceReads, pack));
}
async function prepareParsed(rawPack: string, author: string, pack: Pack, reads: TopicSourceRead[]): Promise<TopicPublicationDraft> {
  const packHash = await rawHash(rawPack), items: TopicPublicationItem[] = [];
  for (const p of pack.profiles) for (const [kind, values] of [['fact', p.facts], ['direction', p.directions]] as const) for (const item of values) {
    const context = { id: p.id, regionRef: p.regionRef, displayName: p.displayName, tags: p.tags, gaps: p.gaps };
    const itemHash = await digest('item', { packHash, author, context, kind, item, sources: item.sourceIds.map(id => ({ source: pack.sources.find(s => s.id === id)!, read: reads.find(r => r.sourceId === id) ?? null })) });
    items.push({ id: item.id, profileId: p.id, kind, itemHash });
  }
  return freeze({ rawPack, author, packHash, pack, sourceReads: reads, items });
}
/** Parsing/preparation grants no publication and accepts incomplete reading evidence. */
export function prepareTopicPublication(rawPack: string, author: string, sourceReads: unknown): Promise<TopicPublicationDraft> { return prepare(rawPack, author, sourceReads, true); }
function parseDecision(value: unknown): TopicPublicationDecision {
  const v = copy(value), action = (v as Record<string, unknown>)?.action;
  const d = obj(v, ['id', 'packId', 'contentVersion', 'packHash', 'profileIds', 'expectedPreviousHash', 'action', ...(action === 'publish' ? ['ui', 'reviews'] : ['reason'])]);
  id(d.id); id(d.packId); id(d.contentVersion); hash(d.packHash); strings(d.profileIds, 1).forEach(id); if (d.expectedPreviousHash !== null) hash(d.expectedPreviousHash);
  if (action === 'publish') {
    const ui = obj(d.ui, ['contractVersion', 'fields']); equal(ui.contractVersion, TOPIC_PUBLICATION_UI_CONTRACT, 'UI contract');
    const fields = strings(ui.fields); if (fields.length !== TOPIC_PUBLICATION_UI_FIELDS.length || TOPIC_PUBLICATION_UI_FIELDS.some(k => !fields.includes(k))) fail('UI disclosure capability missing');
    list(d.reviews);
  } else if (action === 'withdraw') text(d.reason); else fail('explicit publish/withdraw action required');
  return d as TopicPublicationDecision;
}
function checkReviews(draft: TopicPublicationDraft, decision: TopicPublicationDecision, at: string, used: Set<string>): void {
  if (decision.action !== 'publish') return;
  const selected = draft.items.filter(i => decision.profileIds.includes(i.profileId)), covered = new Set<string>();
  if (decision.reviews.length !== selected.length) fail('one explicit review per selected fact/direction required');
  for (const value of decision.reviews) {
    const r = obj(value, ['id', 'packId', 'contentVersion', 'packHash', 'itemId', 'itemHash', 'author', 'reviewer', 'reviewedAt', 'decision', 'scope']);
    const rid = id(r.id); if (used.has(rid)) fail('replayed review'); used.add(rid);
    equal(r.packId, draft.pack.id, 'review pack'); equal(r.contentVersion, draft.pack.contentVersion, 'review version'); equal(r.packHash, draft.packHash, 'review pack hash'); equal(r.author, draft.author, 'review author');
    if (text(r.reviewer, 160) === draft.author) fail('reviewer must differ from author'); equal(r.decision, 'approve', 'review decision');
    const item = selected.find(i => i.id === r.itemId); if (!item || covered.has(item.id)) fail('unselected/duplicate review item'); covered.add(item.id); equal(r.itemHash, item.itemHash, 'review item hash');
    const reviewedAt = instant(r.reviewedAt), age = Date.parse(at) - Date.parse(reviewedAt);
    if (age < 0 || age > TOPIC_PUBLICATION_REVIEW_DAYS * 86_400_000) fail('review outside bounded window');
    const p = draft.pack.profiles.find(p => p.id === item.profileId)!, content = [...p.facts, ...p.directions].find(v => v.id === item.id)!;
    if (item.kind === 'direction') equal(r.scope, 'proposed', 'hypothesis review scope');
    else if (!['listing_entry', 'body_claim'].includes(r.scope as string)) fail('fact review scope required');
    for (const sid of content.sourceIds) {
      const read = draft.sourceReads.find(v => v.sourceId === sid);
      if (!read || read.coverage === 'unread' || !read.readAt || read.readAt > reviewedAt) fail('source not actually read before review');
      if (item.kind === 'fact' && (!read.supportedFactIds.includes(item.id) || (r.scope === 'body_claim' && read.coverage !== 'fulltext'))) fail('source read scope insufficient');
    }
    for (const tag of p.tags) if (tag.sourceIds.some(sid => !draft.sourceReads.some(r => r.sourceId === sid && r.coverage !== 'unread' && r.readAt && r.readAt <= reviewedAt))) fail('tag source unread');
  }
}
function bind(draft: TopicPublicationDraft, d: TopicPublicationDecision): void {
  equal(d.packId, draft.pack.id, 'decision pack'); equal(d.contentVersion, draft.pack.contentVersion, 'decision version'); equal(d.packHash, draft.packHash, 'decision hash');
  if (d.profileIds.some(id => !draft.pack.profiles.some(p => p.id === id))) fail('unknown selected profile');
}
type Identities = { profiles: Map<string, string>; counties: Map<string, string> };
function registerIdentity(draft: TopicPublicationDraft, decision: TopicPublicationDecision, identities: Identities): void {
  if (decision.action !== 'publish') return;
  const scope = `${draft.pack.id}\0${draft.pack.catalogVersion}\0`;
  for (const p of draft.pack.profiles.filter(p => decision.profileIds.includes(p.id))) {
    const priorCode = identities.profiles.get(scope + p.id), priorId = identities.counties.get(scope + p.regionRef.code);
    if (priorCode !== undefined) equal(p.regionRef.code, priorCode, 'published profile county identity');
    if (priorId !== undefined) equal(p.id, priorId, 'published county profile identity');
    identities.profiles.set(scope + p.id, p.regionRef.code); identities.counties.set(scope + p.regionRef.code, p.id);
  }
}
async function history(input: unknown): Promise<TopicPublicationRelease[]> {
  const entries = list(input).map(value => copy(value));
  const out: TopicPublicationRelease[] = [], used = new Set<string>(), versions = new Map<string, string>(), identities: Identities = { profiles: new Map(), counties: new Map() };
  for (const value of entries) {
    const r = obj(value, ['schemaVersion', 'revision', 'at', 'previousHash', 'releaseHash', 'draft', 'decision']);
    equal(r.schemaVersion, 1, 'release schema'); equal(r.revision, out.length + 1, 'release revision'); instant(r.at); hash(r.releaseHash);
    equal(r.previousHash, out.at(-1)?.releaseHash ?? null, 'history chain'); if (out.length && (r.at as string) < out.at(-1)!.at) fail('history clock reversed');
    const raw = obj(r.draft, ['rawPack', 'author', 'packHash', 'pack', 'sourceReads', 'items']);
    const draft = await prepare(raw.rawPack as string, raw.author as string, raw.sourceReads, false), decision = parseDecision(r.decision);
    equal(await digest('draft', raw), await digest('draft', draft), 'historical draft'); bind(draft, decision); equal(decision.expectedPreviousHash, r.previousHash, 'expected previous release');
    if (out.length) equal(draft.pack.id, out[0].draft.pack.id, 'history pack');
    const prior = versions.get(draft.pack.contentVersion); if (prior && prior !== draft.packHash) fail('immutable content version reused'); versions.set(draft.pack.contentVersion, draft.packHash);
    if (used.has(decision.id)) fail('replayed release decision'); used.add(decision.id); checkReviews(draft, decision, r.at as string, used);
    registerIdentity(draft, decision, identities);
    if (decision.action === 'withdraw' && decision.profileIds.some(id => activeProfiles(out).get(id)?.packHash !== draft.packHash)) fail('historical withdrawal requires exact active content');
    const { releaseHash: claimed, ...body } = r; equal(await digest('release', body), claimed, 'release hash'); out.push(r as TopicPublicationRelease);
  }
  return out;
}
/** Append an event; never mutate draft statuses or discard historical versions. No I/O. */
export async function applyTopicPublication(input: { rawPack: string; author: string; sourceReads: unknown; history: unknown; decision: unknown; now: string }): Promise<readonly TopicPublicationRelease[]> {
  obj(input, ['rawPack', 'author', 'sourceReads', 'history', 'decision', 'now']);
  const rawPack = input.rawPack, author = text(input.author, 160), decision = parseDecision(input.decision), at = instant(input.now);
  const pack = parsePack(rawPack, decision.action === 'publish'), reads = parseReads(input.sourceReads, pack), prior = await history(input.history);
  if (prior.length >= 1000) fail('ledger capacity reached; cannot append an unreadable history');
  const draft = await prepareParsed(rawPack, author, pack, reads); bind(draft, decision);
  equal(decision.expectedPreviousHash, prior.at(-1)?.releaseHash ?? null, 'stale release head');
  if (prior.length) { equal(draft.pack.id, prior[0].draft.pack.id, 'history pack'); if (at < prior.at(-1)!.at) fail('clock reversed'); }
  if (prior.some(r => r.draft.pack.contentVersion === draft.pack.contentVersion && r.draft.packHash !== draft.packHash)) fail('immutable content version reused');
  const used = new Set(prior.flatMap(r => [r.decision.id, ...(r.decision.action === 'publish' ? r.decision.reviews.map(v => v.id) : [])]));
  if (used.has(decision.id)) fail('replayed release decision'); used.add(decision.id); checkReviews(draft, decision, at, used);
  const identities: Identities = { profiles: new Map(), counties: new Map() };
  for (const r of prior) registerIdentity(r.draft, r.decision, identities); registerIdentity(draft, decision, identities);
  const active = activeProfiles(prior);
  if (decision.action === 'withdraw' && decision.profileIds.some(id => active.get(id)?.packHash !== draft.packHash)) fail('withdraw requires exact active content');
  const body = { schemaVersion: 1 as const, revision: prior.length + 1, at, previousHash: prior.at(-1)?.releaseHash ?? null, draft, decision };
  return freeze([...prior, { ...body, releaseHash: await digest('release', body) }]);
}
function activeProfiles(history: TopicPublicationRelease[]): Map<string, PublishedCountyProfile> {
  const active = new Map<string, PublishedCountyProfile>();
  for (const r of history) for (const id of r.decision.profileIds) {
    if (r.decision.action === 'withdraw') { active.delete(id); continue; }
    const profile = r.draft.pack.profiles.find(p => p.id === id)!;
    const ids = new Set([...profile.facts, ...profile.directions, ...profile.tags].flatMap(v => v.sourceIds));
    active.set(id, { packId: r.draft.pack.id, contentVersion: r.draft.pack.contentVersion, packHash: r.draft.packHash, releaseHash: r.releaseHash, status: 'published', profile, sources: r.draft.pack.sources.filter(s => ids.has(s.id)), sourceReads: r.draft.sourceReads.filter(s => ids.has(s.sourceId)) });
  }
  return active;
}
/** Fresh selection excludes drafts, withdrawals and old-catalog geography; history stays readable. */
export async function freshTopicPublication(value: unknown): Promise<readonly PublishedCountyProfile[]> {
  const active = activeProfiles(await history(value));
  return freeze([...active.values()].filter(p => { const row = getRegionByCode(p.profile.regionRef.code); return p.profile.regionRef.catalogVersion === TOPIC_REGION_CATALOG.catalogVersion && row?.level === 'county' && row.name === p.profile.displayName; }));
}
