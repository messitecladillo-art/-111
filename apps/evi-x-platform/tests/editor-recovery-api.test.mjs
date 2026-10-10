import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRecoveryKey} from '../lib/editor-recovery.ts';
import {createEditorContent} from '../lib/editor-model.ts';
import {buildDocx,buildPptx} from '../lib/editor-export.ts';
const base=process.env.EVI_X_TEST_BASE_URL;
if(!base || !['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Isolated local server required');
const origin=new URL(base).origin, route='/api/drafts/session/recovery', restore='/api/drafts/session/restore';
async function call(url,method='GET',headers={},body){const res=await fetch(base+url,{method,headers:{'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await res.text();let value;try{value=JSON.parse(text);}catch{value={nonJson:true};}return {status:res.status,headers:res.headers,body:value,text};}
async function client(){const session=await call('/api/drafts/session','POST',{origin});assert.equal(session.status,200);const cookie=session.headers.get('set-cookie').split(';')[0];const headers={cookie,origin,'x-editor-recovery':'1'};const status=await call(route,'GET',headers);assert.equal(status.status,200);return {cookie,scope:status.body.scope,headers:{...headers,'x-editor-scope':status.body.scope}};}
async function configured(){const c=await client(),key=createRecoveryKey();assert.equal((await call(route,'POST',c.headers,{key,revision:0})).status,200);return {...c,key};}

test('recovery HTTP requires explicit same-origin intent and current cookie scope',async()=>{
  const c=await client(),key=createRecoveryKey();
  assert.equal((await call(route)).status,403);
  assert.equal((await call(route,'GET',{origin,'x-editor-recovery':'1'})).status,401);
  assert.equal((await call(route,'GET',{cookie:c.cookie,'sec-fetch-site':'same-origin','x-editor-recovery':'1'})).status,200,'browser GET can omit Origin');
  assert.equal((await call(route,'GET',{cookie:c.cookie,'x-editor-recovery':'1'})).status,403);
  assert.equal((await call(route,'GET',{...c.headers,origin:'null'})).status,403);
  assert.equal((await call(route,'GET',{...c.headers,'sec-fetch-site':'cross-site'})).status,403);
  assert.equal((await call(route,'GET',{...c.headers,'x-editor-recovery':''})).status,403);
  for(const url of [route+'?key=synthetic',route+'?clientKey=synthetic'])assert.equal((await call(url,'GET',c.headers)).status,400);
  assert.equal((await call(route,'GET',{...c.headers,'x-client-key':'synthetic'})).status,400);
  assert.equal((await call(route,'GET',{...c.headers,'oai-authenticated-user-id':'synthetic'})).status,400);
  for(const scope of ['', 'wrong', '0'.repeat(64)]) {
    assert.equal((await call(route,'POST',{...c.headers,'x-editor-scope':scope},{key,revision:0})).status,409);
    assert.equal((await call(restore,'POST',{...c.headers,'x-editor-scope':scope},{key})).status,409);
  }
  assert.equal((await call(route,'POST',{cookie:c.cookie,'x-editor-recovery':'1','x-editor-scope':c.scope},{key,revision:0})).status,403);
  assert.equal((await call(route,'GET',c.headers)).body.recovery.configured,false);
});

test('recovery rejects malformed or oversized secrets without echoing input',async()=>{
  const c=await client();
  for(const key of ['secret',null,123,'evxr_'+'x'.repeat(43),' evxr_'+'A'.repeat(43)]) {
    const response=await call(route,'POST',c.headers,{key,revision:0});assert.equal(response.status,400);
    if(typeof key==='string')assert.equal(response.text.includes(key),false);
  }
  const key=createRecoveryKey();
  for(const revision of [-1,1.5,'0',null,1000000])assert.equal((await call(route,'POST',c.headers,{key,revision})).status,400);
  for(const body of [{key},{key,revision:0,extra:'sensitive'},[],{key,revision:0,owner_hash:c.scope}])assert.equal((await call(route,'POST',c.headers,body)).status,400);
  const tooBig=await call(route,'POST',c.headers,{key:'x'.repeat(2048),revision:0});assert.equal(tooBig.status,413);
  assert.equal((await call(route,'POST',{...c.headers,'content-type':'text/plain'},{key,revision:0})).status,415);
  assert.equal((await call(route,'POST',{...c.headers,'content-encoding':'identity'},{key,revision:0})).status,415);
  assert.equal((await call(restore,'POST',c.headers,{key})).status,401);
});

test('recovery rotation is CAS, idempotent, non-transferable and does not disclose credentials',async()=>{
  const c=await client(), key=createRecoveryKey();
  const first=await call(route,'POST',c.headers,{key,revision:0});assert.equal(first.status,200);assert.equal(first.body.recovery.revision,1);
  assert.match(first.headers.get('cache-control'),/no-store/);assert.equal(first.headers.get('set-cookie'),null);assert.equal(first.text.includes(key),false);assert.equal(first.text.includes(c.cookie),false);
  const retry=await call(route,'POST',c.headers,{key,revision:0});assert.equal(retry.status,200);assert.deepEqual(retry.body,first.body);
  const other=await client();assert.equal((await call(route,'POST',other.headers,{key,revision:0})).status,409);
  const left=createRecoveryKey(),right=createRecoveryKey();
  const races=await Promise.all([call(route,'POST',c.headers,{key:left,revision:1}),call(route,'POST',c.headers,{key:right,revision:1})]);
  assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
  const current=races[0].status===200?left:right;
  assert.equal((await call(route,'POST',c.headers,{key,revision:0})).status,409,'stale lost-response retry must not revive retired key');
  assert.equal((await call(route,'POST',other.headers,{key,revision:0})).status,409,'retired keys stay globally reserved');
  assert.equal((await call(route,'POST',c.headers,{key,revision:2})).status,409,'retired key cannot be reused by original owner');
  assert.equal((await call(restore,'POST',other.headers,{key})).status,401);
  const recovered=await call(restore,'POST',other.headers,{key:current});assert.equal(recovered.status,200);assert.equal(recovered.body.scope,c.scope);
  assert.match(recovered.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Path=\/api\/drafts; Max-Age=2592000/);
  assert.equal(recovered.text.includes(current),false);assert.equal('token' in recovered.body,false);
  assert.equal((await call(route,'GET',c.headers)).status,200,'key rotation does not revoke the original browser session');
});

test('after cookie loss, recovery restores drafts, notes, named versions and exact DOCX/PPTX bytes',async()=>{
  const c=await configured(), content=createEditorContent();content.title='恢复隔离验收';content.report[0].body='报告原文，需完整保留';content.slides[0].notes='答辩讲稿，需完整保留';
  const draftId=crypto.randomUUID(), snapshotId=crypto.randomUUID();
  assert.equal((await call('/api/drafts','POST',c.headers,{id:draftId,content})).status,201);
  assert.equal((await call(`/api/drafts/${draftId}/versions`,'POST',c.headers,{id:snapshotId,label:'恢复前版本',revision:1})).status,201);
  const files=[];
  for(const [kind,build] of [['docx',buildDocx],['pptx',buildPptx]]){
    const bytes=Buffer.from(await (await build(content)).arrayBuffer()),id=crypto.randomUUID(),versionId=crypto.randomUUID();
    const response=await fetch(base+'/api/drafts/files',{method:'POST',headers:{...c.headers,'content-type':'application/octet-stream','x-office-file-id':id,'x-office-version-id':versionId,'x-office-name':encodeURIComponent(`恢复验收.${kind}`),'x-office-label':encodeURIComponent('恢复前原件')},body:bytes});
    // Consume the entire response before asserting, including a rejected upload.
    // Do not depend on GC to release a pooled connection between recovery steps.
    const saved=await response.json();
    assert.equal(response.status,201);
    assert.equal(saved.file.id,id);
    assert.equal(saved.version.id,versionId);
    assert.equal(saved.version.fileId,id);
    for(const record of [saved.file,saved.version]){
      assert.equal(record.revision,1);
      assert.equal(record.kind,kind);
      assert.equal(record.size,bytes.length);
    }
    files.push({id,versionId,bytes});
  }
  const other=await client(), unrelated=crypto.randomUUID();
  assert.equal((await call('/api/drafts','POST',other.headers,{id:unrelated,content:{...content,title:'另一个身份的作品'}})).status,201);
  assert.equal((await call(`/api/drafts/${draftId}`,'GET',other.headers)).status,404);
  const result=await call(restore,'POST',other.headers,{key:c.key});assert.equal(result.status,200);assert.equal(result.body.scope,c.scope);
  const restored={...other.headers,cookie:result.headers.get('set-cookie').split(';')[0],'x-editor-scope':c.scope};
  const draft=await call(`/api/drafts/${draftId}`,'GET',restored);assert.equal(draft.status,200);assert.deepEqual(draft.body.draft.content,content);
  const snapshot=await call(`/api/drafts/${draftId}/versions/${snapshotId}`,'GET',restored);assert.equal(snapshot.status,200);assert.deepEqual(snapshot.body.version.content,content);
  assert.equal((await call(`/api/drafts/${unrelated}`,'GET',restored)).status,404,'no merging or transfer of old identity data');
  assert.equal((await call(`/api/drafts/${unrelated}`,'GET',other.headers)).status,200);
  assert.equal((await call('/api/drafts','GET',{...restored,'x-editor-scope':other.scope})).status,409,'stale tabs cannot silently follow new cookie');
  const listed=await call('/api/drafts/files','GET',restored);assert.equal(listed.status,200);assert.equal(listed.body.files.length,2);
  for(const file of files){const download=await fetch(`${base}/api/drafts/files/${file.id}/versions/${file.versionId}`,{headers:restored});assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),file.bytes);}
});

test('recovered session cap fails without deleting files or invalidating existing sessions',async()=>{
  const c=await configured();let savedCookie;
  for(let n=0;n<20;n++) {const response=await call(restore,'POST',c.headers,{key:c.key});assert.equal(response.status,200);savedCookie??=response.headers.get('set-cookie').split(';')[0];}
  assert.equal((await call(restore,'POST',c.headers,{key:c.key})).status,429);
  assert.equal((await call(route,'GET',{...c.headers,cookie:savedCookie})).status,200);
  assert.equal((await call(route,'GET',c.headers)).status,200);
});
