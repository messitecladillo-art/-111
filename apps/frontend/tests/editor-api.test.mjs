import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEditorContent } from '../lib/editor-model.ts';
const base=process.env.EVI_X_TEST_BASE_URL;
if(!base || !['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local isolated test base required');
async function call(path,method='GET',headers={},body){const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});const text=await response.text();let value;try{value=JSON.parse(text);}catch{value={message:text};}return {status:response.status,headers:response.headers,body:value};}

async function isolatedEditor(title) {
  const session=await call('/api/drafts/session','POST');
  assert.equal(session.status,200);
  const owner={cookie:session.headers.get('set-cookie').split(';')[0]};
  const library=await call('/api/drafts','GET',owner);
  assert.equal(library.status,200);
  const headers={...owner,'x-editor-scope':library.body.scope};
  const id=crypto.randomUUID(), content=createEditorContent(); content.title=title;
  const created=await call('/api/drafts','POST',headers,{id,content});
  assert.equal(created.status,201);
  return {id,content,headers,path:`/api/drafts/${id}/versions`};
}

test('editor D1 ownership, CAS, duplicate POST, CSRF, schema and identity boundaries',async()=>{
  assert.equal((await call('/api/drafts')).status,401);
  const session=await call('/api/drafts/session','POST');
  assert.equal(session.status,200);
  const cookie=session.headers.get('set-cookie'); assert.match(cookie,/HttpOnly/); assert.match(cookie,/SameSite=Strict/);
  const owner={cookie:cookie.split(';')[0]};
  const library=await call('/api/drafts','GET',owner);
  assert.equal(library.status,200);assert.equal(library.body.storage,'d1');
  const scoped={...owner,'x-editor-scope':library.body.scope};
  const id=crypto.randomUUID(), content=createEditorContent(); content.title='编辑器隔离验收';
  let result=await call('/api/drafts','POST',scoped,{id,content}); assert.equal(result.status,201);assert.equal(result.body.draft.revision,1);
  result=await call('/api/drafts','POST',scoped,{id,content});assert.equal(result.status,201);assert.equal(result.body.draft.revision,1);
  const changed={...content,title:'第二版',slides:content.slides.map(s=>({...s,notes:'保存后的讲稿'}))};
  const races=await Promise.all([call(`/api/drafts/${id}`,'PUT',scoped,{revision:1,content:changed}),call(`/api/drafts/${id}`,'PUT',scoped,{revision:1,content})]);
  assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
  result=await call('/api/drafts','POST',scoped,{id,content});assert.equal(result.status,409);assert.equal(result.body.error.code,'draft_conflict');
  const otherSession=await call('/api/drafts/session','POST');const other={cookie:otherSession.headers.get('set-cookie').split(';')[0]};
  assert.equal((await call(`/api/drafts/${id}`,'GET',other)).status,404);
  assert.equal((await call(`/api/drafts/${id}`,'PUT',other,{revision:2,content})).status,404);
  assert.deepEqual((await call('/api/drafts','GET',other)).body.drafts,[]);
  assert.equal((await call('/api/drafts','POST',{...scoped,origin:'https://untrusted.invalid'},{id:crypto.randomUUID(),content})).status,403);
  assert.equal((await call('/api/drafts','POST',{...scoped,'x-editor-scope':'different-scope'},{id:crypto.randomUUID(),content})).status,409);
  assert.equal((await call('/api/drafts','POST',scoped,{id:crypto.randomUUID(),content:{...content,html:'<script>'}})).status,400);
  assert.equal((await call('/api/drafts?clientKey=hidden','GET',owner)).status,400);
  assert.equal((await call('/api/drafts','GET',{...owner,'oai-authenticated-user-id':'partial'})).status,401);
  const list=(await call('/api/drafts','GET',owner)).body.drafts;
  assert.equal(list.length,1);assert.equal('content' in list[0],false);
});

test('named versions enforce identity, origin, scope, strict input and draft ownership',async()=>{
  const first=await isolatedEditor('命名版本安全验收');
  const other=await isolatedEditor('不同会话作品');
  const body={id:crypto.randomUUID(),label:'问卷定稿前',revision:1};
  assert.equal((await call(first.path)).status,401);
  assert.equal((await call(first.path,'POST',{},body)).status,401);
  assert.equal((await call(first.path,'GET',other.headers)).status,404);
  assert.equal((await call(first.path,'POST',other.headers,body)).status,404);
  assert.equal((await call(first.path,'GET',{...first.headers,'x-editor-scope':'changed'})).status,409);
  assert.equal((await call(first.path,'POST',{...first.headers,'x-editor-scope':'changed'},body)).status,409);
  assert.equal((await call(first.path,'POST',{...first.headers,origin:'https://untrusted.invalid'},body)).status,403);
  assert.equal((await call(first.path,'POST',{...first.headers,'sec-fetch-site':'cross-site'},body)).status,403);
  assert.equal((await call(`${first.path}?clientKey=hidden`,'GET',first.headers)).status,400);
  assert.equal((await call(first.path,'GET',{...first.headers,'oai-authenticated-user-id':'partial'})).status,401);
  for(const label of ['', '   ', 'x'.repeat(81), 'bad\u0000label', 123, null]){
    assert.equal((await call(first.path,'POST',first.headers,{...body,label})).status,400,`reject invalid label ${JSON.stringify(label)}`);
  }
  for(const revision of [0,-1,1.5,'1',null,Number.MAX_SAFE_INTEGER+1]){
    assert.equal((await call(first.path,'POST',first.headers,{...body,revision})).status,400,`reject revision ${JSON.stringify(revision)}`);
  }
  for(const invalid of [
    {...body,id:'../../escape'},
    {...body,content:{}},
    {...body,owner_hash:'forged'},
    {...body,html:'<script>alert(1)</script>'},
    {id:body.id,label:body.label},
    {id:body.id,revision:1},
    [],
  ]) assert.equal((await call(first.path,'POST',first.headers,invalid)).status,400);
  const malformed=await fetch(base+first.path,{method:'POST',headers:{...first.headers,'content-type':'application/json'},body:'{"id":'});
  assert.equal(malformed.status,400);
  const wrongType=await fetch(base+first.path,{method:'POST',headers:{...first.headers,'content-type':'text/plain'},body:JSON.stringify(body)});
  assert.equal(wrongType.status,415);
  const oversized=await call(first.path,'POST',first.headers,{...body,label:'x'.repeat(20000)});
  assert.ok([400,413].includes(oversized.status),'oversized input must be rejected, never retained');
  const empty=await call(first.path,'GET',first.headers);
  assert.equal(empty.status,200);assert.deepEqual(empty.body.versions,[]);assert.equal(empty.body.limit,20);
});

test('named versions are immutable, owner-bound and idempotent without hiding mismatches',async()=>{
  const fixture=await isolatedEditor('不可变版本验收');
  fixture.content.report[0].body='最初正文 < > & 中文';
  fixture.content.slides[0].notes='最初讲稿';
  const changed=await call(`/api/drafts/${fixture.id}`,'PUT',fixture.headers,{revision:1,content:fixture.content});
  assert.equal(changed.status,200);
  const versionId=crypto.randomUUID();
  const payload={id:versionId,label:'完整初版',revision:2};
  const created=await call(fixture.path,'POST',fixture.headers,payload);
  assert.equal(created.status,201);
  const snapshot=created.body.version;
  assert.equal(snapshot.id,versionId);assert.equal(snapshot.draftId,fixture.id);
  assert.equal(snapshot.label,payload.label);assert.equal(snapshot.sourceRevision,2);
  assert.ok(Number.isFinite(Date.parse(snapshot.createdAt)));
  assert.equal('content' in snapshot,false,'version lists/create replies are metadata only');
  const retry=await call(fixture.path,'POST',fixture.headers,payload);
  assert.equal(retry.status,201);assert.deepEqual(retry.body.version,snapshot);
  assert.equal((await call(fixture.path,'POST',fixture.headers,{...payload,label:'不同标签'})).status,409);
  assert.equal((await call(fixture.path,'POST',fixture.headers,{...payload,revision:1})).status,409);
  const latest=structuredClone(fixture.content);latest.title='正在修改的新版';latest.report[0].body='后续正文';latest.slides[0].notes='后续讲稿';
  assert.equal((await call(`/api/drafts/${fixture.id}`,'PUT',fixture.headers,{revision:2,content:latest})).status,200);
  const detail=await call(`${fixture.path}/${versionId}`,'GET',fixture.headers);
  assert.equal(detail.status,200);assert.deepEqual(detail.body.version,{...snapshot,content:fixture.content});
  assert.match(detail.headers.get('cache-control')||'',/no-store/);
  const oldRetry=await call(fixture.path,'POST',fixture.headers,payload);
  assert.equal(oldRetry.status,201);assert.deepEqual(oldRetry.body.version,snapshot,'exact retry survives a later draft edit');
  assert.equal((await call(fixture.path,'POST',fixture.headers,{id:crypto.randomUUID(),label:'过期快照',revision:2})).status,409);
  const otherId=crypto.randomUUID();
  assert.equal((await call('/api/drafts','POST',fixture.headers,{id:otherId,content:latest})).status,201);
  assert.equal((await call(`/api/drafts/${otherId}/versions/${versionId}`,'GET',fixture.headers)).status,404);
  assert.equal((await call(`/api/drafts/${otherId}/versions`,'POST',fixture.headers,{...payload,revision:1})).status,409);
  const other=await isolatedEditor('无权读取旧版本');
  assert.equal((await call(`${fixture.path}/${versionId}`,'GET',other.headers)).status,404);
  assert.equal((await call(`${fixture.path}/${versionId}`)).status,401);
  assert.equal((await call(`${fixture.path}/${versionId}`,'GET',{...fixture.headers,'x-editor-scope':'changed'})).status,409);
  assert.equal((await call(`${fixture.path}/${crypto.randomUUID()}`,'GET',fixture.headers)).status,404);
  const list=await call(fixture.path,'GET',fixture.headers);
  assert.equal(list.status,200);assert.equal(list.body.versions.length,1);
  assert.deepEqual(list.body.versions[0],snapshot);assert.match(list.headers.get('cache-control')||'',/no-store/);
  assert.deepEqual((await call(`/api/drafts/${fixture.id}`,'GET',fixture.headers)).body.draft.content,latest,'reading a historical version never restores over the active draft');
});

test('named version cap is atomic and exact retries remain available at capacity',async()=>{
  const fixture=await isolatedEditor('版本数量上限验收');
  const first={id:crypto.randomUUID(),label:'保存点 01',revision:1};
  const stored=await call(fixture.path,'POST',fixture.headers,first);assert.equal(stored.status,201);
  for(let i=2;i<=19;i++){
    const result=await call(fixture.path,'POST',fixture.headers,{id:crypto.randomUUID(),label:`保存点 ${i}`,revision:1});
    assert.equal(result.status,201);
  }
  const last=await Promise.all(['A','B'].map(label=>call(fixture.path,'POST',fixture.headers,{id:crypto.randomUUID(),label:`并发末位 ${label}`,revision:1})));
  assert.deepEqual(last.map(r=>r.status).sort(),[201,409]);
  const list=await call(fixture.path,'GET',fixture.headers);
  assert.equal(list.body.versions.length,20);assert.equal(list.body.limit,20);
  assert.equal(new Set(list.body.versions.map(v=>v.id)).size,20);
  assert.equal((await call(fixture.path,'POST',fixture.headers,{id:crypto.randomUUID(),label:'超出上限',revision:1})).status,409);
  const retry=await call(fixture.path,'POST',fixture.headers,first);
  assert.equal(retry.status,201);assert.deepEqual(retry.body.version,stored.body.version);
  assert.equal((await call(`${fixture.path}/${first.id}`,'GET',fixture.headers)).status,200);
});
