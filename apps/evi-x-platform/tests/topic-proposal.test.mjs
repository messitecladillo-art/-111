import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {parseTopicProfile,stableStringify} from '../lib/topic-advisor/parse.ts';
import {freezeTopicProposal,parsePendingTopic,parseTopicReceipt,verifyTopicReceipt,topicSnapshot,knownTopicRejection} from '../lib/topic-proposal.ts';
const req={serviceId:'11111111-1111-1111-1111-111111111111',serviceRevision:1,idempotencyKey:'22222222-2222-2222-2222-222222222222',consent:true,catalogVersion:'test-v1',profile:parseTopicProfile({region:'湖北',city:'武汉',interests:['就业与科技']}),candidateIds:['p1'],goal:'试用\n中文要求'};
const digest=x=>createHash('sha256').update(stableStringify({profile:x.profile,candidateIds:x.candidateIds,goal:x.goal,catalogVersion:x.catalogVersion,lookupId:x.lookupId??null})).digest('hex');
const receipt=()=>({id:req.idempotencyKey,status:'ready',classification:'proposed',serviceId:req.serviceId,serviceRevision:1,catalogVersion:req.catalogVersion,inputFingerprint:digest(req),createdAt:'2026-10-15T05:00:00Z',finishedAt:'2026-10-15T05:01:00Z',proposal:{classification:'proposed',items:[{patternId:'p1',title:'拟议题目',researchQuestion:'问题',decisionOwner:'决策方',decision:'决策',whyHere:'待核实条件',firstWeekPlan:['访谈'],unknowns:['渠道'],sourceIds:['s1']}]},sources:[{id:'s1',title:'原始来源',url:'https://example.org'}],trainingExampleIds:['t1'],errorCode:null,providerMode:'fixture'});
test('回执校验绑定请求与中文材料指纹',async()=>{const r=parseTopicReceipt(receipt(),req);await verifyTopicReceipt(r,req);await assert.rejects(()=>verifyTopicReceipt(r,{...req,goal:'已变更'}));});
test('不接受未知来源和空引用',()=>{for(const ids of [[],['other']]){const r=receipt();r.proposal.items[0].sourceIds=ids;assert.throws(()=>parseTopicReceipt(r,req));}});
test('不接受服务版本与请求ID漂移',()=>{for(const patch of [{serviceRevision:2},{id:req.serviceId},{catalogVersion:'old'}])assert.throws(()=>parseTopicReceipt({...receipt(),...patch},req));});
test('未知或运行中不携带完成提案',()=>{for(const status of ['running','failed','outcome_unknown'])assert.throws(()=>parseTopicReceipt({...receipt(),status},req));});
test('账户隔离与重复字段拒绝',()=>{const saved={schemaVersion:1,accountId:'a',body:req,snapshotKey:topicSnapshot(req.profile,req.candidateIds,req.catalogVersion)},raw=JSON.stringify(saved);assert.ok(parsePendingTopic(raw,'a'));assert.equal(parsePendingTopic(raw,'b'),null);assert.equal(parsePendingTopic(raw.replace('"schemaVersion":1','"schemaVersion":1,"schemaVersion":1'),'a'),null);});
test('拒绝脚本来源与访问器对象',()=>{const r=receipt();r.sources[0].url='javascript:alert(1)';assert.throws(()=>parseTopicReceipt(r,req));assert.throws(()=>parseTopicReceipt({get id(){throw Error('must not run')}},req));});
test('会话失效和未知回执不允许清除原调用',()=>{for(const code of ['session_required','csrf_required','origin_forbidden','outcome_unknown'])assert.equal(knownTopicRejection(401,code),false);assert.equal(knownTopicRejection(409,'topic_infeasible'),true);});

test('新请求先规范化并冻结，再以完全相同的内容恢复',()=>{
  const input={...req,profile:{...req.profile,school:' 示例学校 ',city:' 武汉 ',interests:[' 就业 '],access:{campus_students:'possible'}},candidateIds:['p1'],goal:' 待核验问题 '};
  const frozen=freezeTopicProposal('a',input),before=stableStringify(frozen.body);
  assert.equal(frozen.body.profile.school,'示例学校');assert.equal(frozen.body.profile.city,'武汉');assert.deepEqual(frozen.body.profile.interests,['就业']);assert.equal(frozen.body.goal,'待核验问题');
  input.profile.school='已修改';input.profile.interests[0]='已修改';input.profile.access.campus_students='unavailable';input.candidateIds[0]='p2';
  assert.equal(stableStringify(frozen.body),before);
  const restored=parsePendingTopic(JSON.stringify(frozen),'a');assert.ok(restored);assert.equal(stableStringify(restored.body),before);assert.equal(restored.body.idempotencyKey,input.idempotencyKey);
});
test('已派发的旧请求恢复不去空格，保留 nonce 和服务器材料指纹',async()=>{
  const legacy={...req,profile:{...req.profile,region:' 湖北 ',city:' 武汉 ',school:' 示例学校 ',discipline:' 市场调查 ',interests:[' 就业与科技 ']},goal:' 原始要求 '};
  const saved={schemaVersion:1,accountId:'a',body:legacy,snapshotKey:topicSnapshot(legacy.profile,legacy.candidateIds,legacy.catalogVersion)};
  const restored=parsePendingTopic(JSON.stringify(saved),'a');assert.ok(restored);assert.equal(stableStringify(restored.body),stableStringify(legacy));assert.equal(restored.body.idempotencyKey,legacy.idempotencyKey);
  const serverReceipt={...receipt(),inputFingerprint:digest(legacy)};
  await verifyTopicReceipt(parseTopicReceipt(serverReceipt,restored.body),restored.body);
  await assert.rejects(()=>verifyTopicReceipt(serverReceipt,{...legacy,profile:parseTopicProfile(legacy.profile)}));
});
test('旧请求保留原值仍拒绝非法背景和不一致的快照',()=>{
  const frozen=freezeTopicProposal('a',req);
  assert.equal(parsePendingTopic(JSON.stringify({...frozen,snapshotKey:'tampered'}),'a'),null);
  assert.equal(parsePendingTopic(JSON.stringify({...frozen,body:{...frozen.body,profile:{...frozen.body.profile,days:-1}}}),'a'),null);
});
