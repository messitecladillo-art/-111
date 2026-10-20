import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { projectCountyPublications } from '../lib/topic-publication-projection.ts';
import { TOPIC_REGION_CATALOG as catalog } from '../lib/topic-advisor/regions.ts';
import { prepareTopicPublication, applyTopicPublication, TOPIC_PUBLICATION_UI_CONTRACT, TOPIC_PUBLICATION_UI_FIELDS } from '../lib/topic-publication.ts';

// Synthetic publication decisions exercise mechanics; they approve no actual content.
const now = '2026-10-15T10:00:00.000Z';
const registry = histories => JSON.stringify({ schemaVersion: 1, histories });
function fixture(packId = 'projection-synthetic') {
  const profiles = [['one', '421222', '通城县'], ['two', '320623', '如东县']].map(([id, code, name]) => ({
    id, displayName: name, regionRef: { code, catalogVersion: catalog.catalogVersion }, tags: [],
    facts: [{ id: `${id}-fact`, text: `Synthetic ${id} historical fact`, sourceIds: ['shared'], temporalKind: 'historical_reference', asOfDate: null }],
    directions: [{ id: `${id}-direction`, title: `Synthetic ${id} proposed study`, question: 'What should be investigated?', decisionOwner: 'Proposed service owner', decision: 'Compare possible actions', population: 'Proposed adult population', requiredAccess: ['community_residents'], minimumEvidence: ['Check access', 'Pilot interview', 'Compare evidence'], sourceIds: ['shared'], classification: 'proposed' }],
    status: 'draft', gaps: [`Synthetic ${id} research gap`],
  }));
  return { schemaVersion: 1, id: packId, contentVersion: 'test-1', catalogVersion: catalog.catalogVersion,
    sources: [{ id: 'shared', title: 'Synthetic shared source', url: 'https://example.gov.cn/synthetic', publishedAt: null, retrievedAt: '2026-10-15', authority: 'synthetic_fixture', locator: 'Synthetic source location', supportedClaims: profiles.flatMap(p => p.facts.map(f => f.text)) }], profiles };
}
async function release(pack = fixture(), profileIds = ['one']) {
  const sourceReads = [{ sourceId: 'shared', coverage: 'fulltext', readAt: '2026-10-15T08:00:00.000Z', locator: 'Synthetic read location', supportedFactIds: pack.profiles.flatMap(p => p.facts.map(f => f.id)) }];
  const draft = await prepareTopicPublication(JSON.stringify(pack), 'synthetic-private-author', sourceReads);
  const decision = { id: 'synthetic-publish', action: 'publish', packId: pack.id, contentVersion: pack.contentVersion, packHash: draft.packHash, profileIds, expectedPreviousHash: null,
    ui: { contractVersion: TOPIC_PUBLICATION_UI_CONTRACT, fields: [...TOPIC_PUBLICATION_UI_FIELDS] },
    reviews: draft.items.filter(item => profileIds.includes(item.profileId)).map(item => ({ id: `review-${item.id}`, packId: pack.id, contentVersion: pack.contentVersion, packHash: draft.packHash, itemId: item.id, itemHash: item.itemHash, author: draft.author, reviewer: 'synthetic-private-reviewer', reviewedAt: '2026-10-15T09:00:00.000Z', decision: 'approve', scope: item.kind === 'fact' ? 'body_claim' : 'proposed' })) };
  const input = { rawPack: draft.rawPack, author: draft.author, sourceReads, history: [], decision, now };
  return { draft, input, history: await applyTopicPublication(input) };
}

test('empty maintained registry produces no counties and the checked-in public projection is exactly reproducible', async () => {
  assert.deepEqual((await projectCountyPublications(registry([]))).profiles, []);
  const raw = fs.readFileSync(new URL('../../../corpus-source/topic-advisor/county-publications.json', import.meta.url), 'utf8');
  const output = await projectCountyPublications(raw);
  assert.equal(output.registrySha256, createHash('sha256').update(raw).digest('hex'));
  assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../content/topic-advisor/published-counties.json', import.meta.url), 'utf8')), output);
  const result = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('../scripts/publish-topic-counties.mjs', import.meta.url))], { cwd: os.tmpdir(), encoding: 'utf8', timeout: 30_000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).publishedProfiles, output.profiles.length);
});

test('only active selected county evidence enters the browser projection; unselected source claims and reviews stay outside', async () => {
  const { history } = await release(), raw = registry([history]), output = await projectCountyPublications(raw);
  assert.equal(output.profiles.length, 1);
  const item = output.profiles[0];
  assert.equal(item.status, 'published'); assert.equal(item.profile.status, 'draft');
  assert.equal(item.profile.facts[0].temporalKind, 'historical_reference'); assert.equal(item.profile.directions[0].classification, 'proposed');
  assert.deepEqual(item.sources[0].supportedClaims, ['Synthetic one historical fact']);
  assert.deepEqual(item.sourceReads[0].supportedFactIds, ['one-fact']);
  assert.equal(item.sources[0].publishedAt, null);
  const text = JSON.stringify(output);
  for (const privateText of ['Synthetic two', 'synthetic-private-author', 'synthetic-private-reviewer', 'rawPack', 'reviews']) assert.equal(text.includes(privateText), false, privateText);
  assert.equal(JSON.stringify(history).includes('Synthetic two historical fact'), true);
  assert.ok(Object.isFrozen(output) && Object.isFrozen(item.sources[0].supportedClaims));
});

test('withdrawn contents disappear and corrupted or stale publication events fail before projection', async () => {
  const { draft, input, history } = await release();
  const withdrawn = await applyTopicPublication({ ...input, history, decision: { id: 'synthetic-withdraw', action: 'withdraw', packId: draft.pack.id, contentVersion: draft.pack.contentVersion, packHash: draft.packHash, profileIds: ['one'], expectedPreviousHash: history[0].releaseHash, reason: 'Synthetic retraction' } });
  assert.deepEqual((await projectCountyPublications(registry([withdrawn]))).profiles, []);
  const corrupt = structuredClone(history); corrupt[0].releaseHash = 'f'.repeat(64);
  await assert.rejects(projectCountyPublications(registry([corrupt])), /release hash/);
  const stale = structuredClone(history); stale[0].decision.expectedPreviousHash = 'a'.repeat(64);
  await assert.rejects(projectCountyPublications(registry([stale])), /expected previous release/);
});

test('multiple histories of one pack and competing active packs for a county require an explicit maintained resolution', async () => {
  const first = await release();
  await assert.rejects(projectCountyPublications(registry([first.history, first.history])), /duplicate pack history/);
  const second = await release(fixture('different-synthetic-pack'));
  await assert.rejects(projectCountyPublications(registry([first.history, second.history])), /multiple active packs/);
  const disjoint = await release(fixture('disjoint-synthetic-pack'), ['two']);
  assert.deepEqual((await projectCountyPublications(registry([first.history, disjoint.history]))).profiles.map(p => p.profile.regionRef.code), ['320623', '421222']);
});

test('registry schemas, duplicate JSON members, drafts and oversized input do not become publication', async () => {
  for (const raw of ['null', '[]', '{}', '{"schemaVersion":1,"histories":[],"schemaVersion":1}', registry([[]]), registry([fixture()]), JSON.stringify({ schemaVersion: 1, histories: [], extra: true }), registry(Array.from({ length: 65 }, () => []))]) await assert.rejects(projectCountyPublications(raw));
  await assert.rejects(projectCountyPublications(' '.repeat(8 * 1024 * 1024 + 1)), /exceeds/);
  await assert.rejects(projectCountyPublications({}), /JSON text/);
});

test('a changed region directory prevents historical county records from entering a fresh public projection', async () => {
  const { history } = await release();
  const moduleUrl = new URL('../lib/topic-publication-projection.ts', import.meta.url).href;
  const script = `import fs from 'node:fs'; import {registerHooks} from 'node:module';
    registerHooks({load(url,context,next){const result=next(url,context);if(url.endsWith('/regions.catalog.json')){const data=JSON.parse(result.source.toString());data.catalogVersion='cn-admin-2026-synthetic';return {...result,source:JSON.stringify(data)};}return result;}});
    const {projectCountyPublications}=await import(${JSON.stringify(moduleUrl)});console.log(JSON.stringify(await projectCountyPublications(fs.readFileSync(0,'utf8'))));`;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { input: registry([history]), encoding: 'utf8', timeout: 30_000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr); assert.deepEqual(JSON.parse(result.stdout).profiles, []);
});
