import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {QUESTIONNAIRE_LIBRARY_LIMITS,parseQuestionnaireLibraryContent,parseQuestionnaireVersionLabel,parseQuestionnaireBaseRevision,questionnaireRequestPayload} from '../lib/questionnaire-library.ts';
import {newQuestionnaire,exampleQuestionnaire,questionnaireIssues} from '../lib/questionnaire.ts';

const request=(patch={})=>({kind:'create',projectId:'11111111-1111-4111-8111-111111111111',versionId:'22222222-2222-4222-8222-222222222222',baseRevision:0,label:'原始设计 v1',content:exampleQuestionnaire(),...patch});
const hash=value=>createHash('sha256').update(value).digest('hex');
function compiled(path,replacements={}){let text=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;for(const [from,to] of Object.entries(replacements))text=text.replace(new RegExp(`(["'])${from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\1`,'g'),JSON.stringify(to));return 'data:text/javascript;base64,'+Buffer.from(text).toString('base64');}
const http=compiled('../app/api/_lib/http.ts');
const security=compiled('../app/api/_lib/security.ts',{'./http':http});
const inputModule=compiled('../app/api/drafts/questionnaires/_input.ts',{'@/app/api/_lib/http':http,'@/app/api/_lib/security':security,'@/lib/questionnaire-library':new URL('../lib/questionnaire-library.ts',import.meta.url).href,'@/lib/questionnaire':new URL('../lib/questionnaire.ts',import.meta.url).href});
const {readQuestionnaireSaveInput}=await import(inputModule);
const httpBody=()=>({id:request().projectId,versionId:request().versionId,label:'版本1',content:newQuestionnaire(),consent:true});
const httpRequest=(body,headers={})=>new Request('http://localhost/api/drafts/questionnaires',{method:'POST',headers:{'content-type':'application/json',...headers},body});

test('stored draft roundtrip is exact, detached and keeps semantic issues rather than certifying them',()=>{
  const d=newQuestionnaire(),before=JSON.stringify(d),parsed=parseQuestionnaireLibraryContent(d);
  assert.equal(JSON.stringify(d),before);assert.deepEqual(parsed.content,d);assert.deepEqual(JSON.parse(parsed.serialized),d);
  assert.deepEqual(questionnaireIssues(parsed.content),questionnaireIssues(d));assert.equal(parsed.content.classification,'proposed');
  parsed.content.questions[0].text='returned edit';assert.equal(JSON.stringify(d),before);
});
test('Chinese, HTML-as-text, branch codes, reverse options and missing notes are not rewritten',()=>{
  const d=exampleQuestionnaire();d.title='武汉问卷｜新蓝领';d.questions[0].choices[0].code='01';d.questions[1].condition.codes=['01'];
  d.questions[1].reverse=true;d.questions[2].text='<script>非执行文本</script>';d.pilotNotes='尚未开展预试，不是观察记录。';
  assert.deepEqual(parseQuestionnaireLibraryContent(d).content,d);
});
test('key order changes do not change canonical bytes while meaningful labels and content do',()=>{
  const d=exampleQuestionnaire(),reordered=Object.fromEntries(Object.entries(d).reverse());
  reordered.questions=d.questions.map(q=>Object.fromEntries(Object.entries(q).reverse()));
  assert.equal(parseQuestionnaireLibraryContent(d).serialized,parseQuestionnaireLibraryContent(reordered).serialized);
  const a=questionnaireRequestPayload(request()),b=questionnaireRequestPayload(request({content:reordered}));assert.equal(a,b);
  for(const patch of [{kind:'append'},{projectId:'other'},{versionId:'other'},{baseRevision:1},{label:'原始设计 v1 '},{content:{...d,title:d.title+'新'}}])assert.notEqual(hash(a),hash(questionnaireRequestPayload(request(patch))));
});
test('no results, raw answers, evidence flag or unknown design keys can enter the stored content',()=>{
  const d=newQuestionnaire();
  for(const patch of [{classification:'actual'},{schema:'questionnaire-result/v1'},{responses:[]},{verified:true},{ownerHash:'x'},{questions:[{...d.questions[0],answers:[]}]}])assert.throws(()=>parseQuestionnaireLibraryContent({...d,...patch}));
});
test('invalid JSON-like values, nonplain objects and caller accessors are never evaluated',()=>{
  let calls=0;const d=newQuestionnaire();Object.defineProperty(d,'title',{enumerable:true,get(){calls++;return 'x';}});
  assert.throws(()=>parseQuestionnaireLibraryContent(d));assert.equal(calls,0);
  for(const bad of [null,[],Object.create(null),{...newQuestionnaire(),toJSON(){calls++;return newQuestionnaire();}},{...newQuestionnaire(),questions:new Array(1)}])assert.throws(()=>parseQuestionnaireLibraryContent(bad));
  assert.equal(calls,0);
});
test('size reflects canonical UTF-8 and over-capacity content is refused before persistence',()=>{
  const parsed=parseQuestionnaireLibraryContent(exampleQuestionnaire());assert.equal(parsed.size,Buffer.byteLength(parsed.serialized));assert.ok(parsed.size<=300000);
  const huge=newQuestionnaire();huge.questions=Array.from({length:80},(_,i)=>({...huge.questions[0],id:`q${i}`,variable:`Q${i}`,text:'题'.repeat(600),researchQuestion:'研'.repeat(500),decisionUse:'用'.repeat(500),source:'源'.repeat(500)}));
  assert.throws(()=>parseQuestionnaireLibraryContent(huge),/300 KB|超过/);
  assert.deepEqual(QUESTIONNAIRE_LIBRARY_LIMITS,{projects:40,versions:40,bytes:300000});
});
test('version labels preserve exact spelling and reject blank, overlong or control text',()=>{
  for(const label of ['版本一',' v1 ','字'.repeat(80)])assert.equal(parseQuestionnaireVersionLabel(label),label);
  for(const label of ['', '  ', '字'.repeat(81), 'v1\n', 'v1\u0000',null,1])assert.throws(()=>parseQuestionnaireVersionLabel(label));
});
test('base revision is an exact integer in library bounds, never coerced',()=>{
  for(const n of [1,2,40])assert.equal(parseQuestionnaireBaseRevision(n),n);
  for(const n of [0,-1,41,1.5,NaN,Infinity,'1',null,undefined])assert.throws(()=>parseQuestionnaireBaseRevision(n));
});
test('new migration creates only independent questionnaire storage and append-only guards work in real in-memory SQLite',()=>{
  const sql=readFileSync(new URL('../drizzle/0011_questionnaire_library.sql',import.meta.url),'utf8');
  assert.doesNotMatch(sql,/DROP\s|DELETE\s+FROM|ALTER\s+TABLE|REFERENCES\s+[`"]?projects/i);
  const db=new DatabaseSync(':memory:');try{
    db.exec(sql);const d=parseQuestionnaireLibraryContent(newQuestionnaire());
    const insert=db.prepare('INSERT INTO questionnaire_versions(id,project_id,owner_hash,revision,base_revision,operation,label,title,content,content_sha256,request_sha256,size,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const row=['version1','project1','owner',1,0,'create','v1',d.content.title,d.serialized,hash(d.serialized),'a'.repeat(64),d.size,'2026-10-02T12:00:00Z'];insert.run(...row);
    assert.throws(()=>db.prepare('UPDATE questionnaire_versions SET title=? WHERE id=?').run('tampered','version1'),/immutable/);
    assert.throws(()=>db.prepare('DELETE FROM questionnaire_versions WHERE id=?').run('version1'),/immutable/);
    assert.throws(()=>insert.run(...[...row.slice(0,3),2,0,'append',...row.slice(6)]));
    assert.throws(()=>insert.run(...['version2',...row.slice(1)]));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM questionnaire_versions').get().n,1);
  }finally{db.close();}
});
test('library helper has no hidden runtime clock, network or persistence',()=>{
  const source=readFileSync(new URL('../lib/questionnaire-library.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\b(?:Date|crypto)\s*[.(]|\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB)\s*[.(]/);
});
test('actual request reader accepts valid JSON and normalizes UUID casing without rewriting label/content',async()=>{
  const body=httpBody();body.id=body.id.toUpperCase();body.label=' v1 ';
  const parsed=await readQuestionnaireSaveInput(httpRequest(JSON.stringify(body)),'create');
  assert.equal(parsed.id,body.id.toLowerCase());assert.equal(parsed.label,body.label);assert.deepEqual(parsed.content,body.content);assert.equal(parsed.baseRevision,0);
});
test('actual request reader rejects duplicate top-level and nested decoded JSON keys before consent or data use',async()=>{
  const raw=JSON.stringify(httpBody());
  for(const bad of [raw.replace('"consent":true','"consent":false,"consent":true'),raw.replace('"consent":true','"consent":false,"conse\\u006et":true'),raw.replace('"title":"未命名问卷设计"','"title":"旧","title":"新"')])await assert.rejects(()=>readQuestionnaireSaveInput(httpRequest(bad),'create'),e=>e.status===400&&e.code==='invalid_json');
});
test('actual request reader rejects missing consent, bad IDs, unknown top-level keys and bad UTF-8',async()=>{
  for(const patch of [{consent:false},{consent:'true'},{id:null},{versionId:'not-id'},{baseRevision:1},{answers:[]}])await assert.rejects(()=>readQuestionnaireSaveInput(httpRequest(JSON.stringify({...httpBody(),...patch})),'create'),e=>e.status===400);
  await assert.rejects(()=>readQuestionnaireSaveInput(httpRequest(Uint8Array.of(255)),'create'),e=>e.status===400);
  await assert.rejects(()=>readQuestionnaireSaveInput(httpRequest('{}',{'content-type':'text/plain'}),'create'),e=>e.status===415);
});
test('actual request reader rejects overflow before EOF even when upstream cancellation remains pending',{timeout:2000},async()=>{
  const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(QUESTIONNAIRE_LIBRARY_LIMITS.bytes+4097));},cancel(){return new Promise(()=>{});}});
  const req=new Request('http://localhost/api/drafts/questionnaires',{method:'POST',headers:{'content-type':'application/json'},body,duplex:'half'});
  let timer;
  try{const error=await Promise.race([readQuestionnaireSaveInput(req,'create').then(()=>assert.fail('oversized request accepted'),e=>e),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('overflow waited for EOF/cleanup')),500);})]);assert.equal(error.status,413);}finally{clearTimeout(timer);}
});
