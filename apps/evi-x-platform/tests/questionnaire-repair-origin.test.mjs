import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInThisContext} from 'node:vm';
import ts from 'typescript';
import {legacySource} from './helpers/legacy-source.mjs';
import {newQuestionnaire} from '../lib/questionnaire.ts';
import {parseQuestionnaireRepairOriginInput,parseQuestionnaireRepairOrigin,parseQuestionnaireLibraryContent,questionnaireRequestPayload} from '../lib/questionnaire-library.ts';
import {verifyQuestionnaireVersion,verifyQuestionnaireSaveReceipt} from '../lib/questionnaire-version.ts';

// Actual app modules; only Workers' D1 binding is replaced with private in-memory SQLite.
// No listening socket, Workerd, caller environment, user data or disk database.
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..'),environment={},cache=new Map();
const allowed=new Set(['app/api/_lib/http.ts','app/api/_lib/security.ts','app/api/_lib/editor-auth.ts','db/editor-recovery-repository.ts','lib/questionnaire.ts','lib/questionnaire-library.ts','lib/questionnaire-version.ts','lib/questionnaire-review.ts','db/questionnaire-repository.ts','db/questionnaire-review-repository.ts','db/questionnaire-review-integrity.ts','app/api/drafts/questionnaires/_input.ts','app/api/drafts/questionnaires/route.ts','app/api/drafts/questionnaires/[id]/versions/route.ts','app/api/drafts/questionnaires/[id]/versions/[versionId]/review/route.ts'].map(p=>resolve(app,p)));
function load(path){
  if(!path.endsWith('.ts'))path+='.ts';if(!allowed.has(path))throw Error('Unlisted test source: '+path);if(cache.has(path))return cache.get(path).exports;
  const compiledModule={exports:{}};cache.set(path,compiledModule);
  const code=ts.transpileModule(readFileSync(legacySource(path),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const require=name=>name==='cloudflare:workers'?{env:environment}:load(name.startsWith('@/')?resolve(app,name.slice(2)):resolve(dirname(path),name));
  runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:path})(require,compiledModule,compiledModule.exports);return compiledModule.exports;
}
const repo=load(resolve(app,'db/questionnaire-repository.ts')),checks=load(resolve(app,'db/questionnaire-review-repository.ts'));
const createRoute=load(resolve(app,'app/api/drafts/questionnaires/route.ts')),appendRoute=load(resolve(app,'app/api/drafts/questionnaires/[id]/versions/route.ts')),auth=load(resolve(app,'app/api/_lib/editor-auth.ts'));
const hash=s=>createHash('sha256').update(s).digest('hex'),cookie=actor=>`evix_editor_session=evx_${actor.repeat(43)}`;
function adapter(db,metrics){return {prepare(sql){
  async function execute(fn){metrics.queries++;metrics.active++;metrics.maxActive=Math.max(metrics.maxActive,metrics.active);try{await Promise.resolve();return fn();}finally{metrics.active--;}}
  const statement=params=>({bind(...v){return statement(v);},async first(){return execute(()=>db.prepare(sql).get(...params)??null);},async all(){return execute(()=>({results:db.prepare(sql).all(...params),success:true}));},async run(){return execute(()=>({...db.prepare(sql).run(...params),success:true}));}});return statement([]);
}};}
async function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  for(const name of readdirSync(resolve(app,'drizzle')).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(resolve(app,'drizzle',name),'utf8'));
  const metrics={queries:0,active:0,maxActive:0};environment.DB=adapter(db,metrics);
  const owner=await auth.editorOwner(new Request('http://localhost',{headers:{cookie:cookie('a')}})),projectId=randomUUID(),versionId=randomUUID(),content=newQuestionnaire();
  content.title='合成修订来源；没有实际调研';
  const input={kind:'create',projectId,versionId,baseRevision:0,label:'v1',content};
  const saved=await repo.saveQuestionnaireVersion(input,owner),record=(await checks.executeQuestionnaireDesignReview(projectId,versionId,saved.version.sha256,owner)).review;
  const finding=record.result.findings.find(f=>f.questionId!==null),origin={reviewId:record.id,questionId:finding.questionId,code:finding.code};
  const full={...origin,sourceVersionId:versionId,sourceRevision:1,sourceSha256:saved.version.sha256,engine:record.engine};
  const next=(patch={})=>({kind:'append',projectId,versionId:randomUUID(),baseRevision:1,label:'v2',content:{...content,title:'用户自行修订的合成问卷'},repairOrigin:origin,...patch});
  async function post(body,kind='append',actor='a',raw){
    const request=new Request('http://localhost/api/drafts/questionnaires'+(kind==='append'?`/${projectId}/versions`:''),{method:'POST',headers:{'content-type':'application/json',cookie:cookie(actor)},body:raw??JSON.stringify(body)});
    const response=await (kind==='append'?appendRoute.POST(request,{params:Promise.resolve({id:projectId})}):createRoute.POST(request));return {status:response.status,body:await response.json()};
  }
  return {db,owner,projectId,versionId,content,input,saved,record,origin,full,next,post,metrics,count:()=>db.prepare('SELECT COUNT(*) AS n FROM questionnaire_versions').get().n,close(){db.close();delete environment.DB;}};
}
async function using(fn){const f=await fixture();try{await fn(f);}finally{f.close();}}
function appendBody(input){return {id:input.versionId,baseRevision:input.baseRevision,label:input.label,content:input.content,consent:true,repairOrigin:input.repairOrigin};}
const isConflict=e=>e.status===409;

test('origin parsers detach exact ordinary fields and normalize only absence/null',()=>{
  const origin={reviewId:randomUUID(),questionId:'q1',code:'wording'},full={...origin,sourceVersionId:randomUUID(),sourceRevision:1,sourceSha256:'a'.repeat(64),engine:'questionnaire-structure/1'};
  assert.deepEqual(parseQuestionnaireRepairOriginInput(origin),origin);assert.notEqual(parseQuestionnaireRepairOriginInput(origin),origin);assert.deepEqual(parseQuestionnaireRepairOrigin(full),full);
  for(const missing of [undefined,null]){assert.equal(parseQuestionnaireRepairOriginInput(missing),null);assert.equal(parseQuestionnaireRepairOrigin(missing),null);}
  let calls=0;const getter={...origin};Object.defineProperty(getter,'code',{enumerable:true,get(){calls++;return 'wording';}});
  for(const bad of [getter,{...origin,verified:true},{...origin,sourceRevision:1},{...origin,questionId:''},{...origin,code:'a'.repeat(65)},{...origin,reviewId:'x'.repeat(101)},Object.assign(Object.create(null),origin),{...origin,[Symbol('x')]:1}])assert.throws(()=>parseQuestionnaireRepairOriginInput(bad));
  assert.equal(calls,0);for(const patch of [{sourceRevision:0},{sourceRevision:40},{sourceSha256:'A'.repeat(64)},{engine:''},{sourceVersionId:'not-uuid'},{approved:true}])assert.throws(()=>parseQuestionnaireRepairOrigin({...full,...patch}));
});
test('legacy no-origin canonical bytes and hash are unchanged; null append normalizes away',()=>{
  const input={kind:'append',projectId:randomUUID(),versionId:randomUUID(),baseRevision:1,label:'legacy',content:newQuestionnaire()};
  function legacy(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(legacy).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+legacy(v[k])).join(',')+'}';}
  const before=legacy({schema:'questionnaire-library-request/v1',...input});assert.equal(questionnaireRequestPayload(input),before);assert.equal(questionnaireRequestPayload({...input,repairOrigin:null}),before);
});
test('create/copy cannot carry any origin, including null or server-derived fields',()=>using(async f=>{
  const body={id:randomUUID(),versionId:randomUUID(),label:'copy',content:f.content,consent:true};
  for(const value of [null,f.origin,f.full])assert.equal((await f.post({...body,repairOrigin:value},'create')).status,400);
  await assert.rejects(()=>repo.saveQuestionnaireVersion({...f.input,projectId:randomUUID(),versionId:randomUUID(),repairOrigin:null},f.owner),e=>e.status===400);assert.equal(f.count(),1);
}));
test('actual append returns server-derived full origin and exact source-bound receipt',()=>using(async f=>{
  const input=f.next(),result=await f.post(appendBody(input));assert.equal(result.status,201);assert.deepEqual(result.body.version.repairOrigin,f.full);assert.equal(f.count(),2);
  const receipt={project:result.body.project,version:result.body.version,replayed:result.body.replayed};
  const verified=await verifyQuestionnaireSaveReceipt(receipt,{projectId:f.projectId,versionId:input.versionId,baseRevision:1,label:input.label,contentKey:parseQuestionnaireLibraryContent(input.content).serialized,repairOrigin:f.full});assert.deepEqual(verified.version.repairOrigin,f.full);
  assert.equal((await checks.readQuestionnaireDesignReview(f.projectId,input.versionId,f.owner)).review,null,'save never implicitly rechecks');
  const stored=f.db.prepare('SELECT repair_review_id,repair_question_id,repair_code FROM questionnaire_versions WHERE id=?').get(input.versionId);assert.deepEqual({...stored},{repair_review_id:f.origin.reviewId,repair_question_id:f.origin.questionId,repair_code:f.origin.code});
}));
test('unknown origin fields and decoded duplicate members are rejected before persistence',()=>using(async f=>{
  const body=appendBody(f.next());
  for(const patch of [{sourceVersionId:f.versionId},{sourceRevision:1},{engine:f.record.engine},{verified:true},{questionId:5}])assert.equal((await f.post({...body,repairOrigin:{...f.origin,...patch}})).status,400);
  const raw=JSON.stringify(body).replace('"code":','"code":"wrong","co\\u0064e":');assert.equal((await f.post(body,'append','a',raw)).status,400);assert.equal(f.count(),1);
}));
test('cross-owner and cross-project review IDs are not usable or disclosed',()=>using(async f=>{
  assert.equal((await f.post(appendBody(f.next()),'append','b')).status,404);
  const otherId=randomUUID(),otherVersion=randomUUID();await repo.saveQuestionnaireVersion({...f.input,projectId:otherId,versionId:otherVersion},f.owner);
  await assert.rejects(()=>repo.saveQuestionnaireVersion(f.next({projectId:otherId}),f.owner),e=>e.status===404);assert.equal(f.count(),2);
}));
test('exact question ID and issue code membership are both necessary; global findings use null',()=>using(async f=>{
  for(const origin of [{...f.origin,questionId:'nonexistent'},{...f.origin,code:'made_up'},{...f.origin,questionId:null}])await assert.rejects(()=>repo.saveQuestionnaireVersion(f.next({repairOrigin:origin}),f.owner),isConflict);
  assert.equal(f.count(),1);
  const global=f.record.result.findings.find(i=>i.questionId===null),origin={reviewId:f.record.id,questionId:null,code:global.code};
  assert.equal((await repo.saveQuestionnaireVersion(f.next({repairOrigin:origin}),f.owner)).version.repairOrigin.questionId,null);
}));
test('historical source is allowed while append CAS always targets the current head',()=>using(async f=>{
  await repo.saveQuestionnaireVersion(f.next({repairOrigin:null}),f.owner);
  const v3=await repo.saveQuestionnaireVersion(f.next({baseRevision:2,label:'v3'}),f.owner);assert.equal(v3.version.revision,3);assert.deepEqual(v3.version.repairOrigin,f.full);
  await assert.rejects(()=>repo.saveQuestionnaireVersion(f.next(),f.owner),isConflict);assert.equal(f.count(),3);
}));
test('source must precede target; later-source origin cannot pass even with stale CAS base',()=>using(async f=>{
  const v2=await repo.saveQuestionnaireVersion(f.next({repairOrigin:null}),f.owner),r2=(await checks.executeQuestionnaireDesignReview(f.projectId,v2.version.id,v2.version.sha256,f.owner)).review;
  await assert.rejects(()=>repo.saveQuestionnaireVersion(f.next({repairOrigin:{...f.origin,reviewId:r2.id}}),f.owner),isConflict);assert.equal(f.count(),2);
}));
test('same token and exact origin replay old receipt after later updates; altered origin conflicts',()=>using(async f=>{
  const input=f.next(),v2=await repo.saveQuestionnaireVersion(input,f.owner);await repo.saveQuestionnaireVersion(f.next({baseRevision:2,label:'v3',repairOrigin:null}),f.owner);
  const retry=await repo.saveQuestionnaireVersion(input,f.owner);assert.equal(retry.replayed,true);assert.equal(retry.project.revision,3);assert.deepEqual(retry.version,v2.version);
  const another=f.record.result.findings.find(i=>i.code!==f.origin.code);
  for(const origin of [null,{reviewId:f.record.id,questionId:another.questionId,code:another.code}])await assert.rejects(()=>repo.saveQuestionnaireVersion({...input,repairOrigin:origin},f.owner),e=>e.code==='questionnaire_request_reused');assert.equal(f.count(),3);
}));
test('concurrent appends atomically keep one origin and no partial version',()=>using(async f=>{
  const outcomes=await Promise.allSettled([repo.saveQuestionnaireVersion(f.next(),f.owner),repo.saveQuestionnaireVersion(f.next({repairOrigin:null}),f.owner)]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.count(),2);
  const row=f.db.prepare('SELECT * FROM questionnaire_versions WHERE revision=2').get();assert.ok((row.repair_review_id===null&&row.repair_code===null)||(row.repair_review_id===f.record.id&&row.repair_code===f.origin.code));
}));
test('tampered complete source is refused even when its deterministic findings are unchanged',()=>using(async f=>{
  f.db.exec('DROP TRIGGER questionnaire_versions_no_update');const changed=parseQuestionnaireLibraryContent({...f.content,title:'same findings, different complete source'});
  f.db.prepare('UPDATE questionnaire_versions SET content=? WHERE id=?').run(changed.serialized,f.versionId);
  await assert.rejects(()=>repo.saveQuestionnaireVersion(f.next(),f.owner),isConflict);assert.equal(f.count(),1);
}));
test('result with recomputed forged hash still fails deterministic reproduction',()=>using(async f=>{
  f.db.exec('DROP TRIGGER questionnaire_reviews_no_update');const bad=structuredClone(f.record.result);bad.findings[0].message='forged result';const raw=JSON.stringify(bad);
  f.db.prepare('UPDATE questionnaire_design_reviews SET result_json=?,result_sha256=?,result_size=?').run(raw,hash(raw),Buffer.byteLength(raw));
  await assert.rejects(()=>repo.saveQuestionnaireVersion(f.next(),f.owner),isConflict);assert.equal(f.count(),1);
}));
test('unsupported engine and invalid date cannot serve as a repair source',()=>using(async f=>{
  f.db.exec('DROP TRIGGER questionnaire_reviews_no_update');
  f.db.prepare('UPDATE questionnaire_design_reviews SET engine_version=?').run('questionnaire-structure/old');await assert.rejects(()=>repo.saveQuestionnaireVersion(f.next(),f.owner),isConflict);
  f.db.prepare('UPDATE questionnaire_design_reviews SET engine_version=?,created_at=?').run(f.record.engine,'2026-02-30T00:00:00.000Z');await assert.rejects(()=>repo.saveQuestionnaireVersion(f.next(),f.owner),isConflict);assert.equal(f.count(),1);
}));
test('persisted origin tampering to another valid finding fails immutable request fingerprint',()=>using(async f=>{
  const v2=await repo.saveQuestionnaireVersion(f.next(),f.owner),other=f.record.result.findings.find(i=>i.code!==f.origin.code);f.db.exec('DROP TRIGGER questionnaire_versions_no_update');
  f.db.prepare('UPDATE questionnaire_versions SET repair_question_id=?,repair_code=? WHERE id=?').run(other.questionId,other.code,v2.version.id);
  await assert.rejects(()=>repo.readQuestionnaireVersion(f.projectId,v2.version.id,f.owner),isConflict);assert.equal(f.count(),2);
}));
test('history and exact reads retain full origin; legacy rows normalize null',()=>using(async f=>{
  const v2=await repo.saveQuestionnaireVersion(f.next(),f.owner),history=await repo.listQuestionnaireVersions(f.projectId,f.owner);assert.deepEqual(history[0].repairOrigin,f.full);assert.equal(history[1].repairOrigin,null);
  assert.deepEqual((await repo.readQuestionnaireVersion(f.projectId,v2.version.id,f.owner)).version.repairOrigin,f.full);assert.equal((await repo.readQuestionnaireVersion(f.projectId,f.versionId,f.owner)).version.repairOrigin,null);
}));
test('40-version history with 39 unique origins stays within query budget with one active D1 call',()=>using(async f=>{
  let previous=f.saved.version,record=f.record;
  for(let revision=2;revision<=40;revision++){
    const finding=record.result.findings[0],origin={reviewId:record.id,questionId:finding.questionId,code:finding.code};
    previous=(await repo.saveQuestionnaireVersion(f.next({baseRevision:revision-1,label:`v${revision}`,repairOrigin:origin}),f.owner)).version;
    if(revision<40)record=(await checks.executeQuestionnaireDesignReview(f.projectId,previous.id,previous.sha256,f.owner)).review;
  }
  Object.assign(f.metrics,{queries:0,active:0,maxActive:0});const history=await repo.listQuestionnaireVersions(f.projectId,f.owner);
  assert.equal(history.length,40);assert.equal(new Set(history.slice(0,39).map(v=>v.repairOrigin.reviewId)).size,39);assert.equal(history[39].repairOrigin,null);
  assert.equal(f.metrics.queries,22);assert.equal(f.metrics.maxActive,1);assert.ok(history.slice(0,39).every(v=>v.repairOrigin.sourceRevision===v.revision-1));
}));
test('40-version history reusing one source performs four bounded SELECTs, not repeated verification queries',()=>using(async f=>{
  for(let revision=2;revision<=40;revision++)await repo.saveQuestionnaireVersion(f.next({baseRevision:revision-1,label:`v${revision}`}),f.owner);
  Object.assign(f.metrics,{queries:0,active:0,maxActive:0});const history=await repo.listQuestionnaireVersions(f.projectId,f.owner);
  assert.equal(history.length,40);assert.ok(history.slice(0,39).every(v=>JSON.stringify(v.repairOrigin)===JSON.stringify(f.full)));assert.equal(f.metrics.queries,4);assert.equal(f.metrics.maxActive,1);
}));
test('database trigger rejects partial, create and cross-source edges and preserves immutability',()=>using(async f=>{
  const v2=await repo.saveQuestionnaireVersion(f.next(),f.owner);assert.throws(()=>f.db.prepare('UPDATE questionnaire_versions SET repair_code=? WHERE id=?').run('other',v2.version.id),/immutable/);assert.throws(()=>f.db.exec('DELETE FROM questionnaire_versions'),/immutable/);
  const insert=f.db.prepare('INSERT INTO questionnaire_versions(id,project_id,owner_hash,revision,base_revision,operation,label,title,content,content_sha256,request_sha256,size,created_at,repair_review_id,repair_question_id,repair_code) SELECT ?,project_id,owner_hash,3,2,\'append\',label,title,content,content_sha256,request_sha256,size,created_at,?,?,? FROM questionnaire_versions WHERE id=?');
  for(const fields of [[f.record.id,null,null],[null,'q1',null],[randomUUID(),null,f.origin.code]])assert.throws(()=>insert.run(randomUUID(),...fields,v2.version.id),/origin mismatch/);assert.equal(f.count(),2);
}));
test('capacity failure is atomic but an existing exact origin replay still works at 40 versions',()=>using(async f=>{
  const input=f.next(),v2=await repo.saveQuestionnaireVersion(input,f.owner);
  for(let n=2;n<40;n++)await repo.saveQuestionnaireVersion(f.next({baseRevision:n,label:`v${n+1}`,repairOrigin:null}),f.owner);
  await assert.rejects(()=>repo.saveQuestionnaireVersion(f.next({baseRevision:40}),f.owner),e=>e.code==='questionnaire_version_limit');assert.equal(f.count(),40);assert.deepEqual((await repo.saveQuestionnaireVersion(input,f.owner)).version,v2.version);
}));
test('receipt verifier rejects absent/altered origin and captures origin before hash-await',()=>using(async f=>{
  const input=f.next(),receipt=await repo.saveQuestionnaireVersion(input,f.owner),expected={projectId:f.projectId,versionId:input.versionId,baseRevision:1,label:input.label,contentKey:parseQuestionnaireLibraryContent(input.content).serialized,repairOrigin:structuredClone(f.full)};
  await assert.rejects(()=>verifyQuestionnaireSaveReceipt(receipt,{...expected,repairOrigin:null}));
  await assert.rejects(()=>verifyQuestionnaireSaveReceipt({...receipt,version:{...receipt.version,repairOrigin:null}},expected));
  for(const patch of [{sourceSha256:'0'.repeat(64)},{reviewId:randomUUID()},{sourceRevision:2},{sourceVersionId:input.versionId},{code:'different'}])await assert.rejects(()=>verifyQuestionnaireSaveReceipt({...receipt,version:{...receipt.version,repairOrigin:{...f.full,...patch}}},expected));
  const pending=verifyQuestionnaireSaveReceipt(receipt,expected);expected.repairOrigin.code='changed';receipt.version.repairOrigin.code='changed';assert.deepEqual((await pending).version.repairOrigin,f.full);
}));
test('legacy client version without origin normalizes null but unknown/accessor fields still fail',()=>using(async f=>{
  const legacy={...f.saved.version};delete legacy.repairOrigin;assert.equal((await verifyQuestionnaireVersion(legacy,{projectId:f.projectId,versionId:f.versionId})).repairOrigin,null);
  let calls=0;Object.defineProperty(legacy,'repairOrigin',{enumerable:true,get(){calls++;return f.full;}});await assert.rejects(()=>verifyQuestionnaireVersion(legacy,{projectId:f.projectId,versionId:f.versionId}));assert.equal(calls,0);
}));
