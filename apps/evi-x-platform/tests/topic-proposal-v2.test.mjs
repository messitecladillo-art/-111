import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {parseTopicProfile,stableStringify} from '../lib/topic-advisor/parse.ts';
import {TOPIC_SOURCE_VERSIONS,parseTopicSourceVersions,freezeTopicProposal,parsePendingTopic,parseTopicReceipt,verifyTopicReceipt,topicSnapshot,topicGeographyLabel} from '../lib/topic-proposal.ts';
import {deriveTopicSourceVersions,loadTopicSourceVersions,checkPublicTopicSourceVersions} from '../scripts/sync-topic-source-versions.mjs';

const clone=value=>JSON.parse(JSON.stringify(value)),hash=value=>createHash('sha256').update(value).digest('hex');
const profile=()=>parseTopicProfile({schemaVersion:2,regionRef:{code:'420106',catalogVersion:TOPIC_SOURCE_VERSIONS.regionCatalog.catalogVersion},region:'山西',city:'晋城',referenceDate:'2026-10-15'});
const request=()=>({serviceId:'11111111-1111-4111-8111-111111111111',serviceRevision:1,idempotencyKey:'22222222-2222-4222-8222-222222222222',consent:true,catalogVersion:'test-v1',profile:profile(),candidateIds:['p1'],goal:' 核对中文研究需求 '});
const material=(r,versions)=>({profile:r.profile,candidateIds:r.candidateIds,goal:r.goal,catalogVersion:r.catalogVersion,lookupId:r.lookupId??null,...(r.profile.schemaVersion===2?{sourceVersions:versions}:{})});
function receipt(r,versions=TOPIC_SOURCE_VERSIONS){return{id:r.idempotencyKey,status:'outcome_unknown',classification:'proposed',serviceId:r.serviceId,serviceRevision:r.serviceRevision,catalogVersion:r.catalogVersion,inputFingerprint:hash(stableStringify(material(r,versions))),createdAt:'2026-10-15T08:00:00Z',finishedAt:null,proposal:null,sources:[],trainingExampleIds:[],errorCode:'provider_timeout',providerMode:'fixture',...(r.profile.schemaVersion===2?{sourceVersions:clone(versions)}:{})};}

test('public source bindings reproduce the API canonical manifest digest and exact directory bytes',async()=>{
  const root=new URL('../../evi-x-api/src/evix_api/topic_assets/',import.meta.url),read=name=>fs.readFileSync(new URL(name,root));
  const original=JSON.parse(read('manifest.json')),canonical=value=>value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
  assert.equal(TOPIC_SOURCE_VERSIONS.topicDigest,hash(canonical(original)));
  assert.equal(TOPIC_SOURCE_VERSIONS.regionCatalog.catalogSha256,hash(read('regions.catalog.json')));
  assert.deepEqual(await loadTopicSourceVersions(),TOPIC_SOURCE_VERSIONS);
  const raw=fs.readFileSync(new URL('../content/topic-advisor/source-versions.json',import.meta.url));assert.ok(raw.byteLength<512);assert.deepEqual(Object.keys(JSON.parse(raw)),['topicDigest','regionCatalog']);
  const checked=spawnSync(process.execPath,['scripts/sync-topic-source-versions.mjs'],{cwd:new URL('..',import.meta.url),encoding:'utf8',windowsHide:true});assert.equal(checked.status,0,checked.stderr);
});

test('offline source check detects changed public metadata, duplicate manifest members and changed source/catalog bytes',()=>{
  const root=new URL('../../evi-x-api/src/evix_api/topic_assets/',import.meta.url),read=name=>fs.readFileSync(new URL(name,root));
  const input={topicManifest:read('manifest.json'),regionManifest:read('regions.manifest.json'),topicAssets:Object.fromEntries(['catalog','sources','hotspot-events','train'].map(name=>[name,read(`${name}.json`)])),regionCatalog:read('regions.catalog.json')};
  assert.deepEqual(deriveTopicSourceVersions(input),TOPIC_SOURCE_VERSIONS);
  for(const name of Object.keys(input.topicAssets))assert.throws(()=>deriveTopicSourceVersions({...input,topicAssets:{...input.topicAssets,[name]:Buffer.concat([input.topicAssets[name],Buffer.from(' ')])}}),/bytes drift/);
  assert.throws(()=>deriveTopicSourceVersions({...input,regionCatalog:Buffer.concat([input.regionCatalog,Buffer.from(' ')])}),/bytes drift/);
  const duplicate=Buffer.from(input.topicManifest.toString().replace('"schemaVersion": 1','"schemaVersion": 1,"schemaVersion": 1'));assert.throws(()=>deriveTopicSourceVersions({...input,topicManifest:duplicate}),/duplicate members/);
  const publicRaw=Buffer.from(JSON.stringify({...TOPIC_SOURCE_VERSIONS,topicDigest:'0'.repeat(64)},null,2)+'\n');assert.throws(()=>checkPublicTopicSourceVersions(publicRaw,TOPIC_SOURCE_VERSIONS),/binding drift/);
});

test('v2 receipt hash adds only exact sourceVersions while request top fields remain unchanged',async()=>{
  const frozen=freezeTopicProposal('account-a',request()),r=frozen.body,response=receipt(r);
  assert.equal(Object.hasOwn(r,'sourceVersions'),false);assert.deepEqual(frozen.sourceVersions,TOPIC_SOURCE_VERSIONS);
  assert.deepEqual(parseTopicReceipt(response,r).sourceVersions,TOPIC_SOURCE_VERSIONS);await verifyTopicReceipt(response,r);
  const unbound={...response,inputFingerprint:hash(stableStringify({profile:r.profile,candidateIds:r.candidateIds,goal:r.goal,catalogVersion:r.catalogVersion,lookupId:r.lookupId??null}))};
  await assert.rejects(()=>verifyTopicReceipt(unbound,r),/材料指纹不一致/);
  await assert.rejects(()=>verifyTopicReceipt(response,{...r,lookupId:'33333333-3333-4333-8333-333333333333'}),/材料指纹不一致/);
});

test('receipt metadata must match every captured version field and is forbidden on legacy v1 receipts',()=>{
  const r=freezeTopicProposal('account-a',request()).body;
  for(const mutate of [v=>{v.topicDigest='0'.repeat(64);},v=>{v.regionCatalog.catalogSha256='0'.repeat(64);},v=>{v.regionCatalog.catalogVersion='cn-admin-2024-old';},v=>{v.regionCatalog.asOf='2024-12-31';},v=>{v.extra=true;},v=>{v.regionCatalog.extra=true;}]){const bad=receipt(r);mutate(bad.sourceVersions);assert.throws(()=>parseTopicReceipt(bad,r),/来源版本|版本回执|回执字段/);}
  const missing=receipt(r);delete missing.sourceVersions;assert.throws(()=>parseTopicReceipt(missing,r));
  const legacy={...r,profile:parseTopicProfile({region:'湖北',city:'武汉'})};assert.throws(()=>parseTopicReceipt({...receipt(legacy),sourceVersions:clone(TOPIC_SOURCE_VERSIONS)},legacy));
  const valid=receipt(legacy);assert.doesNotThrow(()=>parseTopicReceipt(valid,legacy));assert.equal(Object.hasOwn(valid,'sourceVersions'),false);
});

test('strict source-version shapes reject arrays, getters, undefined members and malformed hashes',()=>{
  let calls=0;const accessor={...clone(TOPIC_SOURCE_VERSIONS)};Object.defineProperty(accessor,'topicDigest',{enumerable:true,get(){calls++;return 'a'.repeat(64);}});assert.throws(()=>parseTopicSourceVersions(accessor));assert.equal(calls,0);
  for(const value of [[],undefined,{...clone(TOPIC_SOURCE_VERSIONS),topicDigest:undefined},{...clone(TOPIC_SOURCE_VERSIONS),topicDigest:'A'.repeat(64)},{...clone(TOPIC_SOURCE_VERSIONS),regionCatalog:{...clone(TOPIC_SOURCE_VERSIONS.regionCatalog),asOf:['2025-12-31']}}])assert.throws(()=>parseTopicSourceVersions(value));
});

test('captured old v2 intents preserve raw body and nonce, reconcile against old captured versions and never become a fresh current intent',async()=>{
  const versions={topicDigest:'a'.repeat(64),regionCatalog:{catalogVersion:'cn-admin-2024-old',asOf:'2024-12-31',catalogSha256:'b'.repeat(64)}},body=request();body.profile.regionRef.catalogVersion=versions.regionCatalog.catalogVersion;body.profile.region=' 原始旧省份 ';body.goal=' 原始旧要求 ';
  const snapshotKey=JSON.stringify([parseTopicProfile(body.profile),body.candidateIds,body.catalogVersion,versions]),pending={schemaVersion:1,accountId:'account-a',body,snapshotKey,sourceVersions:versions};
  const restored=parsePendingTopic(JSON.stringify(pending),'account-a');assert.ok(restored);assert.deepEqual(restored.body,body);assert.deepEqual(restored.sourceVersions,versions);
  const returned=receipt(body,versions);await verifyTopicReceipt(parseTopicReceipt(returned,restored.body,restored.sourceVersions),restored.body,restored.sourceVersions);
  assert.throws(()=>parseTopicReceipt(returned,restored.body),/来源版本/);
  assert.throws(()=>freezeTopicProposal('account-a',body),/确认迁移/);assert.throws(()=>topicSnapshot(body.profile,body.candidateIds,body.catalogVersion),/确认迁移/);
  assert.equal(parsePendingTopic(JSON.stringify({...pending,sourceVersions:undefined}),'account-a'),null);
  assert.equal(parsePendingTopic(JSON.stringify(pending),'account-b'),null);
});

test('new v2 requests normalize before freezing, independently own captured versions and retain explicit-null geography',()=>{
  const input=request();input.profile.school=' 示例学校 ';const frozen=freezeTopicProposal('account-a',input),before=stableStringify(frozen);
  input.profile.regionRef.code='420100';input.profile.school='变更';input.candidateIds[0]='other';assert.equal(stableStringify(frozen),before);assert.equal(frozen.body.profile.school,'示例学校');
  assert.equal(topicGeographyLabel(frozen.body.profile),'湖北省 · 武汉市 · 武昌区');assert.equal(topicGeographyLabel({...frozen.body.profile,regionRef:null}),'');
  assert.deepEqual(parsePendingTopic(JSON.stringify(frozen),'account-a'),frozen);
});
