import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createEditorContent} from '../lib/editor-model.ts';
const base=process.env.EVI_X_TEST_BASE_URL;
if(!base||!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Isolated loopback test server required');
async function call(path,method='GET',headers={},body){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();let value;try{value=JSON.parse(text);}catch{value={message:text};}return{status:r.status,headers:r.headers,body:value};}
async function fixture(){const s=await call('/api/drafts/session','POST'),owner={cookie:s.headers.get('set-cookie').split(';')[0]},lib=await call('/api/drafts','GET',owner),headers={...owner,'x-editor-scope':lib.body.scope},draftId=crypto.randomUUID(),content=createEditorContent();content.title='P0 隔离合成验收';assert.equal((await call('/api/drafts','POST',headers,{id:draftId,content})).status,201);return{headers,draftId,content};}
const payload=f=>({id:crypto.randomUUID(),draftId:f.draftId,baseRevision:1,consent:true,input:{version:1,sourceHash:'a'.repeat(64),classification:'simulated',question:'渠道构成如何？',variables:['渠道'],missingCodes:[],total:12,n:12,calculation:{method:'frequency',counts:[6,6],column:0}}});
const path='/api/drafts/research-runs';
test('v3 conditional evidence validates original/eligible/answered N and persists exact scope through accept/retry',async()=>{
  const f=await fixture(),p=payload(f);
  const count=(questionId,eligibleAnswered,eligibleMissing,ineligibleBlank,ineligibleAnswered,unknownBlank,unknownAnswered)=>({questionId,eligibleAnswered,eligibleMissing,ineligibleBlank,ineligibleAnswered,unknownBlank,unknownAnswered});
  p.input={...p.input,version:3,total:7,n:5,calculation:{method:'frequency',counts:[3,2],column:1},
    link:{schema:'questionnaire-mapping/v1',questionnaireHash:'b'.repeat(64),interpretationHash:'c'.repeat(64),mappingHash:'d'.repeat(64),bindings:[{questionId:'child',variable:'CHILD',questionHash:'e'.repeat(64),column:1,type:'single',representation:'code',construct:'',min:null,max:null,reverse:false,conditional:true}]},
    eligibility:{schema:'row-eligibility/v1',policy:'exclude',totalRows:12,eligibleRows:7,ineligibleRows:4,unknownRows:1,contradictionRows:1,questionCounts:[count('parent',11,1,0,0,0,0),count('child',5,2,3,1,1,0)]}};
  for(const input of [
    {...p.input,eligibility:{...p.input.eligibility,eligibleIndices:[0,1]}},
    {...p.input,eligibility:{...p.input.eligibility,policy:'strict'}},
    {...p.input,eligibility:{...p.input.eligibility,totalRows:11}},
    {...p.input,n:6,calculation:{...p.input.calculation,counts:[3,3]}},
    {...p.input,version:2},
  ])assert.equal((await call(path,'POST',f.headers,{...p,input})).status,400);
  const created=await call(path,'POST',f.headers,p);assert.equal(created.status,201,JSON.stringify(created.body));
  const run=created.body.run;assert.equal(run.input.version,3);assert.deepEqual(run.input.eligibility,p.input.eligibility);assert.match(run.proposal.body,/原始记录 12 行 → 所选题目共同符合显示条件 7 行 → 本次分析有效样本 5 行/);
  assert.equal((await call(path,'POST',f.headers,p)).body.run.inputHash,run.inputHash);
  assert.equal((await call(`${path}/${run.id}`,'POST',f.headers,{action:'accept',proposalHash:run.proposalHash})).status,200);
  const current=(await call(`/api/drafts/${f.draftId}`,'GET',f.headers)).body.draft;assert.equal(current.revision,2);assert.match(current.content.report.at(-1).source,/research-flow\/v3/);assert.deepEqual(current.content.slides,f.content.slides);
  assert.equal((await call(`${path}/${run.id}`,'POST',f.headers,{action:'accept',proposalHash:run.proposalHash})).body.run.acceptedRevision,2);
});
test('v2 linked evidence preserves compact provenance across save/retry/accept and rejects enum coercion',async()=>{
  const f=await fixture(),p=payload(f);
  p.input={...p.input,version:2,link:{schema:'questionnaire-mapping/v1',questionnaireHash:'b'.repeat(64),interpretationHash:'c'.repeat(64),mappingHash:'d'.repeat(64),bindings:[{questionId:'channel',variable:'CHANNEL',questionHash:'e'.repeat(64),column:0,type:'single',representation:'code',construct:'',min:null,max:null,reverse:false,conditional:false}]}};
  for(const input of [{...p.input,classification:['simulated']},{...p.input,link:{...p.input.link,bindings:p.input.link.bindings.map(b=>({...b,type:['single']}))}},{...p.input,link:{...p.input.link,bindings:p.input.link.bindings.map(b=>({...b,column:1}))}}])assert.equal((await call(path,'POST',f.headers,{...p,input})).status,400);
  const created=await call(path,'POST',f.headers,p);assert.equal(created.status,201);const run=created.body.run;assert.equal(run.input.version,2);assert.deepEqual(run.input.link,p.input.link);assert.match(run.proposal.source,/research-flow\/v2/);assert.match(run.proposal.body,/教学模拟/);
  assert.equal((await call(path,'POST',f.headers,p)).body.run.inputHash,run.inputHash);
  assert.equal((await call(path,'POST',f.headers,{...p,input:{...p.input,link:{...p.input.link,mappingHash:'f'.repeat(64)}}})).status,409);
  const accepted=await call(`${path}/${run.id}`,'POST',f.headers,{action:'accept',proposalHash:run.proposalHash});assert.equal(accepted.status,200);assert.equal(accepted.body.run.status,'accepted');
  const current=(await call(`/api/drafts/${f.draftId}`,'GET',f.headers)).body.draft;assert.equal(current.revision,2);assert.deepEqual(current.content.slides,f.content.slides);assert.match(current.content.report.at(-1).source,/问卷 SHA-256/);
});
test('P0 isolates owners, checks consent/schema/origin and immutable input idempotency',async()=>{
  const a=await fixture(),b=await fixture(),p=payload(a);
  assert.equal((await call(path)).status,401);
  assert.equal((await call(path,'POST',a.headers,{...p,consent:false})).status,400);
  assert.equal((await call(path,'POST',a.headers,{...p,input:{...p.input,rows:[]}})).status,400);
  assert.equal((await call(path,'POST',{...a.headers,origin:'https://untrusted.invalid'},p)).status,403);
  assert.equal((await call(path,'POST',{...a.headers,'x-editor-scope':'bad'},p)).status,409);
  const create=await call(path,'POST',a.headers,p);assert.equal(create.status,201);const run=create.body.run;
  assert.equal((await call(path,'POST',a.headers,p)).body.run.id,run.id);
  assert.equal((await call(path,'POST',a.headers,{...p,input:{...p.input,question:'different'}})).status,409);
  assert.equal((await call(`${path}/${run.id}`,'GET',b.headers)).status,404);
  assert.equal((await call(`${path}/${run.id}`,'POST',b.headers,{action:'accept',proposalHash:run.proposalHash})).status,404);
  assert.deepEqual((await call(path,'GET',b.headers)).body.runs,[]);
  assert.equal((await call(`${path}/${run.id}`,'POST',a.headers,{action:'accept',proposalHash:'b'.repeat(64)})).status,409);
  assert.equal((await call(`/api/drafts/${a.draftId}`,'GET',a.headers)).body.draft.revision,1);
});
test('P0 concurrent approvals append once and preserve before/after snapshots; exact retry survives later edits',async()=>{
  const a=await fixture(),p=payload(a),run=(await call(path,'POST',a.headers,p)).body.run,decision={action:'accept',proposalHash:run.proposalHash};
  const results=await Promise.all([call(`${path}/${run.id}`,'POST',a.headers,decision),call(`${path}/${run.id}`,'POST',a.headers,decision)]);assert.deepEqual(results.map(r=>r.status),[200,200]);
  const current=(await call(`/api/drafts/${a.draftId}`,'GET',a.headers)).body.draft;assert.equal(current.revision,2);assert.equal(current.content.report.length,a.content.report.length+1);assert.deepEqual(current.content.slides,a.content.slides);
  const versions=(await call(`/api/drafts/${a.draftId}/versions`,'GET',a.headers)).body.versions;assert.equal(versions.length,2);assert.deepEqual(versions.map(v=>v.sourceRevision).sort(),[1,2]);
  for(const v of versions){const snapshot=(await call(`/api/drafts/${a.draftId}/versions/${v.id}`,'GET',a.headers)).body.version;assert.deepEqual(snapshot.content,v.sourceRevision===1?a.content:current.content);}
  const changed={...current.content,title:'后来人工修改'};assert.equal((await call(`/api/drafts/${a.draftId}`,'PUT',a.headers,{revision:2,content:changed})).status,200);
  const retry=await call(`${path}/${run.id}`,'POST',a.headers,decision);assert.equal(retry.status,200);assert.equal(retry.body.run.acceptedRevision,2);assert.equal((await call(`/api/drafts/${a.draftId}/versions`,'GET',a.headers)).body.versions.length,2);
});
test('P0 rejects stale report; cancellation is terminal; accept/cancel race has one durable winner',async()=>{
  const a=await fixture(),p=payload(a),run=(await call(path,'POST',a.headers,p)).body.run;
  await call(`/api/drafts/${a.draftId}`,'PUT',a.headers,{revision:1,content:{...a.content,title:'并行修改'}});
  assert.equal((await call(`${path}/${run.id}`,'POST',a.headers,{action:'accept',proposalHash:run.proposalHash})).status,409);
  assert.equal((await call(`${path}/${run.id}`,'POST',a.headers,{action:'cancel',proposalHash:run.proposalHash})).status,200);
  assert.equal((await call(`${path}/${run.id}`,'POST',a.headers,{action:'accept',proposalHash:run.proposalHash})).status,409);
  assert.equal((await call(`/api/drafts/${a.draftId}/versions`,'GET',a.headers)).body.versions.length,0);
  const b=await fixture(),q=payload(b),other=(await call(path,'POST',b.headers,q)).body.run;
  await Promise.all(['accept','cancel'].map(action=>call(`${path}/${other.id}`,'POST',b.headers,{action,proposalHash:other.proposalHash})));
  const final=(await call(`${path}/${other.id}`,'GET',b.headers)).body.run;
  const saved=(await call(`/api/drafts/${b.draftId}`,'GET',b.headers)).body.draft;
  assert.ok(['accepted','cancelled'].includes(final.status));assert.equal(saved.revision,final.status==='accepted'?2:1);
});
test('P0 version capacity failure leaves all state unchanged',async()=>{
  const a=await fixture();for(let i=0;i<19;i++)assert.equal((await call(`/api/drafts/${a.draftId}/versions`,'POST',a.headers,{id:crypto.randomUUID(),label:`合成快照 ${i}`,revision:1})).status,201);
  const run=(await call(path,'POST',a.headers,payload(a))).body.run;
  assert.equal((await call(`${path}/${run.id}`,'POST',a.headers,{action:'accept',proposalHash:run.proposalHash})).status,409);
  assert.equal((await call(`/api/drafts/${a.draftId}`,'GET',a.headers)).body.draft.revision,1);assert.equal((await call(`${path}/${run.id}`,'GET',a.headers)).body.run.status,'pending');assert.equal((await call(`/api/drafts/${a.draftId}/versions`,'GET',a.headers)).body.versions.length,19);
});
test('v3 endpoint enforces its bounded 96 KB body cap',async()=>{
  const f=await fixture(),p=payload(f);
  assert.equal((await call(path,'POST',f.headers,{...p,padding:'x'.repeat(96000)})).status,413);
});
