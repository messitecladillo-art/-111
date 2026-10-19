import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { topicTransferHash } from '../../../packages/evi-x-shared/src/topic-transfer.ts';
import { TOPIC_REGION_CATALOG as catalog } from '../lib/topic-advisor/regions.ts';
import {
  prepareTopicPublication, applyTopicPublication, freshTopicPublication,
  TOPIC_PUBLICATION_UI_CONTRACT, TOPIC_PUBLICATION_UI_FIELDS,
} from '../lib/topic-publication.ts';

// Authored synthetic contract cases. No assertion below approves actual county content.
const now = '2026-10-15T10:00:00.000Z', readAt = '2026-10-15T08:00:00.000Z', reviewedAt = '2026-10-15T09:00:00.000Z';
const ui = () => ({ contractVersion: TOPIC_PUBLICATION_UI_CONTRACT, fields: [...TOPIC_PUBLICATION_UI_FIELDS] });
function fixture() {
  const sources = ['body', 'list'].map(id => ({ id, title: `Synthetic ${id}`, url: `https://example.gov.cn/${id}`, publishedAt: null, retrievedAt: '2026-10-15', authority: 'synthetic_official_record', locator: 'Synthetic locator', supportedClaims: [`Synthetic ${id} fact`] }));
  const profiles = [['nanjing', '320106', 'body'], ['xuzhou', '320302', 'list']].map(([id, code, sid]) => ({
    id, regionRef: { code, catalogVersion: catalog.catalogVersion }, displayName: '鼓楼区', tags: [{ label: 'Synthetic tag', sourceIds: [sid] }],
    facts: [{ id: `${id}-fact`, text: `Synthetic ${sid} fact`, sourceIds: [sid], temporalKind: 'historical_reference', asOfDate: null }],
    directions: [{ id: `${id}-direction`, title: 'Synthetic proposed direction', question: 'Which option needs investigation?', decisionOwner: 'Proposed owner', decision: 'Compare options', population: 'Proposed population', requiredAccess: ['merchants'], minimumEvidence: ['Verify access', 'Pilot interview', 'Compare observations'], sourceIds: [sid], classification: 'proposed' }],
    status: 'draft', gaps: ['Synthetic coverage gap'],
  }));
  return { schemaVersion: 1, id: 'synthetic-pack', contentVersion: 'test-1', catalogVersion: catalog.catalogVersion, sources, profiles };
}
function reads(pack = fixture()) {
  return pack.sources.map(s => ({ sourceId: s.id, coverage: s.id === 'list' ? 'listing_only' : 'fulltext', readAt, locator: 'Actually read synthetic locator', supportedFactIds: pack.profiles.flatMap(p => p.facts.filter(f => f.sourceIds.includes(s.id)).map(f => f.id)) }));
}
async function prepared(pack = fixture(), sourceReads = reads(pack)) {
  return prepareTopicPublication(JSON.stringify(pack), 'author-a', sourceReads);
}
function reviews(draft, profileIds = ['nanjing'], prefix = 'review') {
  return draft.items.filter(i => profileIds.includes(i.profileId)).map(i => ({
    id: `${prefix}-${i.id}`, packId: draft.pack.id, contentVersion: draft.pack.contentVersion, packHash: draft.packHash,
    itemId: i.id, itemHash: i.itemHash, author: draft.author, reviewer: 'reviewer-b', reviewedAt, decision: 'approve',
    scope: i.kind === 'direction' ? 'proposed' : i.profileId === 'xuzhou' ? 'listing_entry' : 'body_claim',
  }));
}
function publish(draft, profileIds = ['nanjing'], prior = [], prefix = 'first') {
  return { id: `${prefix}-decision`, action: 'publish', packId: draft.pack.id, contentVersion: draft.pack.contentVersion, packHash: draft.packHash, profileIds, expectedPreviousHash: prior.at(-1)?.releaseHash ?? null, ui: ui(), reviews: reviews(draft, profileIds, prefix) };
}
const input = (draft, decision, history = []) => ({ rawPack: draft.rawPack, author: draft.author, sourceReads: draft.sourceReads, history, decision, now });
const apply = (draft, decision = publish(draft), history = []) => applyTopicPublication(input(draft, decision, history));
// External ledger serialization per the documented public release hash contract.
async function ledgerEvent(draft, decision, prior = []) {
  const body = { schemaVersion: 1, revision: prior.length + 1, at: now, previousHash: prior.at(-1)?.releaseHash ?? null, draft, decision };
  return { ...body, releaseHash: await topicTransferHash({ contract: 'evix-topic-publication/release/1', value: body }) };
}

test('publication selects explicit profiles while retaining original facts, proposals, dates and read scope', async () => {
  const pack = fixture(), before = structuredClone(pack), evidence = reads(pack), draft = await prepared(pack, evidence);
  evidence[0].coverage = 'unread';
  const decision = publish(draft), history = await apply(draft, decision), selected = await freshTopicPublication(history);
  assert.equal(history.length, 1); assert.equal(selected.length, 1); assert.equal(selected[0].profile.id, 'nanjing');
  assert.equal(selected[0].status, 'published'); assert.deepEqual(selected[0].profile, before.profiles[0]);
  assert.equal(selected[0].profile.status, 'draft'); assert.equal(selected[0].profile.directions[0].classification, 'proposed');
  assert.equal(selected[0].profile.facts[0].temporalKind, 'historical_reference'); assert.equal(selected[0].sources[0].publishedAt, null);
  assert.equal(selected[0].sourceReads[0].coverage, 'fulltext'); assert.equal(selected[0].sourceReads[0].locator, 'Actually read synthetic locator');
  assert.equal(selected[0].sources[0].retrievedAt, '2026-10-15'); assert.equal('current' in selected[0].profile.facts[0], false);
  assert.deepEqual(pack, before); assert.equal(decision.expectedPreviousHash, null);
  assert.ok(Object.isFrozen(history) && Object.isFrozen(history[0].draft.pack.profiles[0].facts[0]));
  assert.throws(() => { selected[0].profile.facts[0].text = 'changed'; }, TypeError);
});

test('raw whitespace, source evidence and profile context changes invalidate item approvals', async () => {
  const draft = await prepared(), decision = publish(draft);
  const whitespace = await prepareTopicPublication(`${draft.rawPack}\n`, draft.author, draft.sourceReads);
  assert.notEqual(whitespace.packHash, draft.packHash); assert.notEqual(whitespace.items[0].itemHash, draft.items[0].itemHash);
  await assert.rejects(apply(whitespace, { ...decision, packHash: whitespace.packHash }), /review pack hash/);
  const changedReads = structuredClone(draft.sourceReads); changedReads[0].locator = 'A different actual read scope';
  const changed = await prepareTopicPublication(draft.rawPack, draft.author, changedReads);
  assert.equal(changed.packHash, draft.packHash); assert.notEqual(changed.items[0].itemHash, draft.items[0].itemHash);
  await assert.rejects(apply(changed, decision), /review item hash/);
  const pack = fixture(); pack.profiles[0].tags[0].label = 'Changed context'; const context = await prepared(pack);
  assert.notEqual(context.items[0].itemHash, draft.items[0].itemHash);
});

test('draft schema, IDs, current canonical county geography and source references fail closed', async () => {
  const changes = [
    p => { p.schemaVersion = 2; }, p => { p.unknown = true; }, p => { p.profiles[1].id = p.profiles[0].id; },
    p => { p.profiles[1].facts[0].id = p.profiles[0].directions[0].id; }, p => { p.sources.push(structuredClone(p.sources[0])); },
    p => { p.profiles[0].regionRef.code = '999999'; }, p => { p.profiles[0].regionRef.code = '320000'; },
    p => { p.profiles[0].regionRef.code = '810000'; }, p => { p.profiles[0].regionRef.code = 320106; },
    p => { p.profiles[0].regionRef.code = '３２０１０６'; }, p => { p.profiles[0].regionRef.extra = 1; },
    p => { p.profiles[0].regionRef.catalogVersion = 'cn-admin-2024-old'; }, p => { p.catalogVersion = 'cn-admin-2024-old'; },
    p => { p.profiles[0].displayName = '玄武区'; }, p => { p.profiles[1].regionRef.code = p.profiles[0].regionRef.code; },
    p => { p.profiles[0].status = 'published'; }, p => { p.profiles[0].facts[0].temporalKind = 'current'; },
    p => { p.profiles[0].directions[0].classification = 'verified'; }, p => { p.profiles[0].facts[0].sourceIds = ['missing']; },
    p => { p.sources[0].supportedClaims = ['A different claim']; }, p => { p.profiles[0].directions[0].requiredAccess = ['unlisted']; },
    p => { p.profiles[0].directions[0].minimumEvidence = ['Only one']; }, p => { p.profiles[0].gaps = []; },
  ];
  for (const change of changes) { const p = fixture(); change(p); await assert.rejects(prepared(p), undefined, change.toString()); }
  const raw = JSON.stringify(fixture());
  await assert.rejects(prepareTopicPublication(raw.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'), 'author-a', []), /duplicate/);
  await assert.rejects(prepareTopicPublication(raw.replace('"id":"body"', '"id":"body","i\\u0064":"body"'), 'author-a', []), /duplicate/);
});

test('source URLs, calendar dates, original claim scope and access designs are validated', async () => {
  const changes = [
    p => { p.sources[0].url = 'http://example.gov.cn/body'; }, p => { p.sources[0].url = 'https://user:pass@example.gov.cn/body'; },
    p => { p.sources[0].url = 'https://example.gov.cn.attacker.test/body'; }, p => { p.sources[0].url = 'https://example.com/body'; },
    p => { p.sources[0].retrievedAt = '2026-02-30'; }, p => { p.sources[0].publishedAt = '2026-10-16'; },
    p => { p.profiles[0].facts[0].asOfDate = '2026-10-16'; }, p => { p.profiles[0].facts[0].asOfDate = '2025-02-29'; },
    p => { p.profiles[0].facts[0].text = 'Synthetic body fact\u0000'; },
  ];
  for (const change of changes) { const p = fixture(); change(p); await assert.rejects(prepared(p)); }
  const p = fixture(); p.profiles[0].facts[0].asOfDate = '2024-02-29';
  assert.equal((await prepared(p)).pack.profiles[0].facts[0].asOfDate, '2024-02-29');
});

test('all selected facts and directions require distinct, exact, independent approvals', async () => {
  const draft = await prepared();
  const changes = [
    d => { d.reviews.pop(); }, d => { d.reviews.push(...reviews(draft, ['xuzhou'], 'extra')); },
    d => { d.reviews[1].itemId = d.reviews[0].itemId; }, d => { d.reviews[1].id = d.reviews[0].id; },
    d => { d.reviews[0].reviewer = draft.author; }, d => { d.reviews[0].author = 'other-author'; },
    d => { d.reviews[0].packId = 'other-pack'; }, d => { d.reviews[0].contentVersion = 'test-0'; },
    d => { d.reviews[0].packHash = '0'.repeat(64); }, d => { d.reviews[0].itemHash = '0'.repeat(64); },
    d => { d.reviews[0].decision = 'pending'; }, d => { d.reviews[1].scope = 'body_claim'; },
    d => { d.reviews[0].scope = 'proposed'; }, d => { d.reviews[0].extra = true; },
  ];
  for (const change of changes) { const d = publish(draft); change(d); await assert.rejects(apply(draft, d), undefined, change.toString()); }
  assert.equal((await apply(draft)).length, 1);
});

test('review time is UTC and bounded, cannot predate actual reading or come from the future', async () => {
  const draft = await prepared();
  for (const stamp of ['2026-10-15T10:00:00.001Z', '2026-10-15T07:59:59.999Z', '2026-10-15', '2026-02-30T09:00:00.000Z']) {
    const d = publish(draft); d.reviews.forEach(r => { r.reviewedAt = stamp; }); await assert.rejects(apply(draft, d));
  }
  const p = fixture(); p.sources.forEach(s => { s.retrievedAt = '2026-09-01'; }); const evidence = reads(p); evidence.forEach(r => { r.readAt = '2026-09-01T00:00:00.000Z'; });
  const old = await prepared(p, evidence), d = publish(old); d.reviews.forEach(r => { r.reviewedAt = '2026-09-15T10:00:00.000Z'; });
  assert.equal((await apply(old, d)).length, 1);
  d.reviews[0].reviewedAt = '2026-09-15T09:59:59.999Z'; await assert.rejects(apply(old, d), /bounded window/);
});

test('listing entries may publish as historical listing facts but cannot approve body claims', async () => {
  const draft = await prepared(), listing = publish(draft, ['xuzhou']);
  assert.equal((await freshTopicPublication(await apply(draft, listing)))[0].profile.id, 'xuzhou');
  listing.reviews[0].scope = 'body_claim'; await assert.rejects(apply(draft, listing), /read scope insufficient/);
  for (const mode of ['missing', 'unread', 'unsupported']) {
    const evidence = reads();
    if (mode === 'missing') evidence.shift();
    else if (mode === 'unread') { evidence[0].coverage = 'unread'; evidence[0].readAt = null; evidence[0].supportedFactIds = []; }
    else evidence[0].supportedFactIds = [];
    const d = await prepared(fixture(), evidence); await assert.rejects(apply(d), /not actually read|read scope insufficient/);
  }
});

test('source read records reject fabricated status combinations and cross-fact coverage', async () => {
  const changes = [
    r => { r[0].sourceId = 'missing'; }, r => { r.push(structuredClone(r[0])); },
    r => { r[0].coverage = 'reference'; }, r => { r[0].readAt = null; },
    r => { r[0].supportedFactIds = ['xuzhou-fact']; }, r => { r[0].readAt = '2026-10-14T23:59:59.999Z'; },
    r => { r[0].coverage = 'unread'; }, r => { r[0].supportedFactIds.push(r[0].supportedFactIds[0]); },
  ];
  for (const change of changes) { const r = reads(); change(r); await assert.rejects(prepared(fixture(), r)); }
});

test('publication requires every current UI disclosure and an explicit nonempty selection', async () => {
  const draft = await prepared();
  for (const field of TOPIC_PUBLICATION_UI_FIELDS) {
    const d = publish(draft); d.ui.fields = d.ui.fields.filter(f => f !== field); await assert.rejects(apply(draft, d), /UI disclosure/);
  }
  const changes = [
    d => { d.ui.contractVersion = 'evix-topic-publication-ui/0'; }, d => { d.ui.fields.push('unrecognized'); },
    d => { d.profileIds = []; }, d => { d.profileIds = ['missing']; }, d => { d.profileIds.push(d.profileIds[0]); },
    d => { d.action = 'bulk_publish'; }, d => { d.extra = true; }, d => { delete d.expectedPreviousHash; },
  ];
  for (const change of changes) { const d = publish(draft); change(d); await assert.rejects(apply(draft, d)); }
});

test('append, replacement and withdrawal preserve history and omit drafts/withdrawals from fresh results', async () => {
  const draft = await prepared(), first = await apply(draft), before = structuredClone(first);
  const second = await apply(draft, publish(draft, ['xuzhou'], first, 'second'), first);
  assert.deepEqual(first, before); assert.deepEqual((await freshTopicPublication(second)).map(p => p.profile.id), ['nanjing', 'xuzhou']);
  const p2 = fixture(); p2.contentVersion = 'test-2'; p2.profiles[0].directions[0].title = 'A revised proposal';
  const newer = await prepared(p2), third = await apply(newer, publish(newer, ['nanjing'], second, 'third'), second);
  const selected = await freshTopicPublication(third);
  assert.equal(selected.find(p => p.profile.id === 'nanjing').contentVersion, 'test-2'); assert.equal(selected.find(p => p.profile.id === 'xuzhou').contentVersion, 'test-1');
  const withdraw = { id: 'withdraw-one', action: 'withdraw', packId: newer.pack.id, contentVersion: newer.pack.contentVersion, packHash: newer.packHash, profileIds: ['nanjing'], expectedPreviousHash: third.at(-1).releaseHash, reason: 'Synthetic source dispute' };
  const fourth = await apply(newer, withdraw, third);
  assert.equal(fourth.length, 4); assert.deepEqual(fourth.slice(0, 3), third);
  assert.deepEqual((await freshTopicPublication(fourth)).map(p => p.profile.id), ['xuzhou']);
  assert.equal(fourth[0].draft.pack.profiles[0].directions[0].title, 'Synthetic proposed direction');
  assert.equal(fourth[2].draft.pack.profiles[0].directions[0].title, 'A revised proposal');
  await assert.rejects(apply(newer, { ...withdraw, id: 'withdraw-twice', expectedPreviousHash: fourth.at(-1).releaseHash }, fourth), /exact active/);
  await assert.rejects(apply(draft, { ...withdraw, id: 'wrong-version', contentVersion: draft.pack.contentVersion, packHash: draft.packHash }, third), /exact active/);
});

test('stale heads, repeated release/review IDs, cross-pack approvals and mutable version IDs reject', async () => {
  const draft = await prepared(), first = await apply(draft);
  await assert.rejects(apply(draft, publish(draft), first), /stale release head/);
  const replay = publish(draft, ['nanjing'], first); await assert.rejects(apply(draft, replay, first), /replayed release/);
  replay.id = 'different-decision'; await assert.rejects(apply(draft, replay, first), /replayed review/);
  const p = fixture(); p.profiles[0].directions[0].title = 'Changed bytes under the same version'; const changed = await prepared(p);
  await assert.rejects(apply(changed, publish(changed, ['nanjing'], first, 'changed'), first), /immutable content version/);
  const other = fixture(); other.id = 'another-pack'; const cross = await prepared(other);
  await assert.rejects(apply(cross, publish(cross, ['nanjing'], first, 'cross'), first), /history pack/);
  const d = publish(draft, ['xuzhou'], first, 'second'); d.id = first[0].decision.reviews[0].id; await assert.rejects(apply(draft, d, first), /replayed release/);
});

test('published profile IDs and county codes remain bidirectionally stable across versions and withdrawals', async () => {
  const draft = await prepared(), first = await apply(draft);
  const renamedPack = fixture(); renamedPack.contentVersion = 'test-2'; renamedPack.profiles[0].id = 'nanjing-renamed';
  const renamed = await prepared(renamedPack), renamedDecision = publish(renamed, ['nanjing-renamed'], first, 'renamed');
  await assert.rejects(apply(renamed, renamedDecision, first), /published county profile identity/);
  await assert.rejects(freshTopicPublication([...first, await ledgerEvent(renamed, renamedDecision, first)]), /published county profile identity/);
  const movedPack = fixture(); movedPack.contentVersion = 'test-3'; movedPack.profiles = [movedPack.profiles[0]]; movedPack.profiles[0].regionRef.code = '320302';
  const moved = await prepared(movedPack), movedDecision = publish(moved, ['nanjing'], first, 'moved');
  await assert.rejects(apply(moved, movedDecision, first), /published profile county identity/);
  await assert.rejects(freshTopicPublication([...first, await ledgerEvent(moved, movedDecision, first)]), /published profile county identity/);
  const withdrawn = await apply(draft, { id: 'identity-withdraw', action: 'withdraw', packId: draft.pack.id, contentVersion: draft.pack.contentVersion, packHash: draft.packHash, profileIds: ['nanjing'], expectedPreviousHash: first.at(-1).releaseHash, reason: 'Synthetic withdrawal' }, first);
  for (const [d, ids] of [[renamed, ['nanjing-renamed']], [moved, ['nanjing']]]) {
    const decision = publish(d, ids, withdrawn, 'after-withdraw');
    await assert.rejects(apply(d, decision, withdrawn), /identity/);
    await assert.rejects(freshTopicPublication([...withdrawn, await ledgerEvent(d, decision, withdrawn)]), /identity/);
  }
  const republished = await apply(draft, publish(draft, ['nanjing'], withdrawn, 'same-identity'), withdrawn);
  assert.deepEqual((await freshTopicPublication(republished)).map(p => p.profile.regionRef.code), ['320106']);
});

test('only selected published profiles establish or consume identity mappings', async () => {
  const draft = await prepared(), first = await apply(draft);
  const p2 = fixture(); p2.contentVersion = 'test-2'; p2.profiles[0].id = 'unpublished-renamed';
  const second = await prepared(p2), history = await apply(second, publish(second, ['xuzhou'], first, 'selected-only'), first);
  assert.deepEqual((await freshTopicPublication(history)).map(p => p.profile.id), ['nanjing', 'xuzhou']);
  await assert.rejects(apply(second, publish(second, ['unpublished-renamed'], history, 'publish-rename'), history), /published county profile identity/);
  const p3 = fixture(); p3.contentVersion = 'test-3'; p3.profiles[1].id = 'unpublished-other-name';
  const neverSelected = await prepared(p3), onlyA = await apply(neverSelected);
  const originalB = await apply(draft, publish(draft, ['xuzhou'], onlyA, 'first-selected-b'), onlyA);
  assert.deepEqual((await freshTopicPublication(originalB)).map(p => p.profile.id), ['nanjing', 'xuzhou']);
});

test('history integrity, chain, clock, schemas and original draft snapshots are checked before use', async () => {
  const draft = await prepared(), first = await apply(draft), second = await apply(draft, publish(draft, ['xuzhou'], first, 'second'), first);
  const changes = [
    h => { h[0].draft.pack.profiles[0].facts[0].text = 'Tampered'; }, h => { h[0].releaseHash = '0'.repeat(64); },
    h => { h[1].previousHash = null; }, h => { h[1].revision = 1; }, h => { h[1].at = '2026-10-15T09:59:59.999Z'; },
    h => { h[0].unknown = true; }, h => { h.reverse(); }, h => { h[0].draft.items[0].itemHash = '0'.repeat(64); },
  ];
  for (const change of changes) { const h = structuredClone(second); change(h); await assert.rejects(freshTopicPublication(h)); }
  const decision = publish(draft, ['nanjing'], second, 'back-clock');
  await assert.rejects(applyTopicPublication({ ...input(draft, decision, second), now: '2026-10-15T09:59:59.999Z' }), /clock reversed/);
});

test('history snapshots its entries synchronously before hashing can observe caller mutations', async () => {
  const draft = await prepared(), first = await apply(draft), second = await apply(draft, publish(draft, ['xuzhou'], first, 'detached-second'), first);
  const mutable = structuredClone(first), pending = freshTopicPublication(mutable);
  mutable.push(structuredClone(second[1])); mutable[0].draft.pack.profiles[0].facts[0].text = 'Changed while first hash is pending';
  const selected = await pending;
  assert.deepEqual(selected.map(p => p.profile.id), ['nanjing']); assert.equal(selected[0].profile.facts[0].text, 'Synthetic body fact');
  const removal = structuredClone(second), pendingRemoval = freshTopicPublication(removal); removal.length = 0;
  assert.deepEqual((await pendingRemoval).map(p => p.profile.id), ['nanjing', 'xuzhou']);
});

test('apply captures and validates all request values before awaiting history hashes', async () => {
  const draft = await prepared(), first = await apply(draft), second = await apply(draft, publish(draft, ['xuzhou'], first, 'reference-second'), first);
  const arg = { ...input(draft, publish(draft, ['xuzhou'], first, 'captured-second'), structuredClone(first)), sourceReads: structuredClone(draft.sourceReads) };
  const originalDecision = structuredClone(arg.decision), pending = applyTopicPublication(arg);
  arg.rawPack = '{}'; arg.author = 'different-author'; arg.now = '1999-01-01T00:00:00.000Z';
  arg.sourceReads[0].coverage = 'unread'; arg.sourceReads.length = 0;
  arg.decision.reviews.length = 0; arg.decision.profileIds = ['nanjing'];
  arg.history.push(structuredClone(second[1])); arg.history[0].draft.rawPack = '{}';
  const result = await pending, release = result.at(-1);
  assert.equal(result.length, 2); assert.equal(release.draft.rawPack, draft.rawPack); assert.equal(release.draft.author, draft.author);
  assert.deepEqual(release.draft.sourceReads, draft.sourceReads); assert.deepEqual(release.decision, originalDecision); assert.equal(release.at, now);
  assert.deepEqual((await freshTopicPublication(result)).map(p => p.profile.id), ['nanjing', 'xuzhou']);
});

test('even a correctly rehashed historical withdrawal must target exact currently active content', async () => {
  const draft = await prepared(), first = await apply(draft), pack2 = fixture(); pack2.contentVersion = 'test-2';
  const newer = await prepared(pack2);
  const withdraw = (d, profileIds = ['nanjing']) => ({ id: 'synthetic-withdraw', action: 'withdraw', packId: d.pack.id, contentVersion: d.pack.contentVersion, packHash: d.packHash, profileIds, expectedPreviousHash: first.at(-1).releaseHash, reason: 'Synthetic dispute' });
  for (const [d, ids] of [[newer, ['nanjing']], [draft, ['xuzhou']]]) {
    const forged = [...first, await ledgerEvent(d, withdraw(d, ids), first)];
    await assert.rejects(freshTopicPublication(forged), /historical withdrawal requires exact active/);
  }
  const valid = await apply(draft, withdraw(draft), first);
  const repeated = { ...withdraw(draft), id: 'different-withdraw', expectedPreviousHash: valid.at(-1).releaseHash };
  await assert.rejects(freshTopicPublication([...valid, await ledgerEvent(draft, repeated, valid)]), /historical withdrawal requires exact active/);
  assert.deepEqual(await freshTopicPublication(valid), []);
});

test('the last readable ledger cannot append an event beyond the explicit capacity bound', async () => {
  const draft = await prepared(), h = [];
  for (let i = 0; i < 1000; i++) h.push(await ledgerEvent(draft, publish(draft, ['nanjing'], h, `capacity-${i}`), h));
  assert.equal((await freshTopicPublication(h)).length, 1);
  const before = h.at(-1).releaseHash;
  await assert.rejects(apply(draft, publish(draft, ['nanjing'], h, 'capacity-overflow'), h), /ledger capacity/);
  assert.equal(h.length, 1000); assert.equal(h.at(-1).releaseHash, before);
  const all = [...h, await ledgerEvent(draft, publish(draft, ['xuzhou'], h, 'actual-1001'), h)];
  await assert.rejects(freshTopicPublication(all), /invalid list/);
  const mutable = [all[0]], pending = freshTopicPublication(mutable); mutable.push(...all.slice(1));
  assert.equal(mutable.length, 1001); assert.deepEqual((await pending).map(p => p.profile.id), ['nanjing']);
});

test('a directory rollout hides old geography from fresh results, retains history and permits exact retraction', async () => {
  const draft = await prepared(), first = await apply(draft);
  const moduleUrl = new URL('../lib/topic-publication.ts', import.meta.url).href;
  // A separate JS runtime loads the real catalog with only its version advanced.
  // No files, current exports, network or production source are mutated.
  const script = `import fs from 'node:fs'; import {registerHooks} from 'node:module';
    registerHooks({load(url, context, next){ const r=next(url,context); if(url.endsWith('/regions.catalog.json')){ const c=JSON.parse(r.source.toString()); c.catalogVersion='cn-admin-2026-synthetic-rollout'; return {...r,source:JSON.stringify(c)}; } return r; }});
    const m=await import(${JSON.stringify(moduleUrl)}); const x=JSON.parse(fs.readFileSync(0,'utf8'));
    const fresh=await m.freshTopicPublication(x.history); let rejected=false;
    try { await m.prepareTopicPublication(x.rawPack,x.author,x.sourceReads); } catch { rejected=true; }
    const d={id:'rollout-withdraw',action:'withdraw',packId:'synthetic-pack',contentVersion:'test-1',packHash:x.history[0].draft.packHash,profileIds:['nanjing'],expectedPreviousHash:x.history[0].releaseHash,reason:'Synthetic rollout retraction'};
    const result=await m.applyTopicPublication({...x,decision:d});
    console.log(JSON.stringify({fresh:fresh.length,rejected,count:result.length,original:result[0].releaseHash,withdrawn:result[1].decision.action}));`;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { input: JSON.stringify(input(draft, publish(draft), first)), encoding: 'utf8', timeout: 30_000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr); assert.deepEqual(JSON.parse(result.stdout), { fresh: 0, rejected: true, count: 2, original: first[0].releaseHash, withdrawn: 'withdraw' });
});

test('accessors, hidden/symbol fields, sparse arrays and non-JSON values never become approvals', async () => {
  let calls = 0; const evidence = reads(); Object.defineProperty(evidence[0], 'coverage', { enumerable: true, get() { calls++; return 'fulltext'; } });
  await assert.rejects(prepared(fixture(), evidence)); assert.equal(calls, 0);
  const draft = await prepared(), arg = input(draft, publish(draft));
  Object.defineProperty(arg, 'decision', { enumerable: true, get() { calls++; return publish(draft); } });
  await assert.rejects(applyTopicPublication(arg)); assert.equal(calls, 0);
  const history = []; Object.defineProperty(history, '0', { enumerable: true, get() { calls++; return {}; } });
  await assert.rejects(freshTopicPublication(history)); assert.equal(calls, 0);
  const bads = [new Array(1), [{ ...reads()[0], [Symbol('hidden')]: true }], [{ ...reads()[0], readAt: undefined }], [{ ...reads()[0], locator: '\ud800' }]];
  for (const bad of bads) await assert.rejects(prepared(fixture(), bad));
  const d = publish(draft); Object.defineProperty(d, 'secret', { value: true }); await assert.rejects(apply(draft, d));
  await assert.rejects(prepareTopicPublication(' '.repeat(1_500_001), 'author-a', []), /raw JSON/);
});
