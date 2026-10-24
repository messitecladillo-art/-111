import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createEditorContent } from '../lib/editor-model.ts';
import { buildDocx, buildPptx } from '../lib/editor-export.ts';
import { OFFICE_LIMITS, parseOfficeFilename, parseOfficeLabel, officeDisposition } from '../lib/office-model.ts';
const base = process.env.EVI_X_TEST_BASE_URL;
if (!base || !['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Isolated local test server required');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtures = Promise.all([buildDocx(createEditorContent()), buildPptx(createEditorContent())]).then(async files => Promise.all(files.map(async file => Buffer.from(await file.arrayBuffer()))));
async function request(path, options={}) {
  const response=await fetch(base+path,options); const raw=await response.text(); let body;try{body=JSON.parse(raw);}catch{body={message:raw};}return {status:response.status,headers:response.headers,body};
}
async function owner() {
  const session=await request('/api/drafts/session',{method:'POST'}); assert.equal(session.status,200);
  const cookie=session.headers.get('set-cookie').split(';')[0];
  const list=await request('/api/drafts/files',{headers:{cookie}}); assert.equal(list.status,200,JSON.stringify(list.body)); assert.equal(list.body.storage,'local-r2');
  assert.equal(list.body.available,true); assert.deepEqual(list.body.limits,OFFICE_LIMITS);
  return {cookie,'x-editor-scope':list.body.scope};
}
function operation(bytes, kind='docx', overrides={}) {
  return {fileId:crypto.randomUUID(),versionId:crypto.randomUUID(),filename:`原始作品.${kind}`,label:'初稿',bytes,...overrides};
}
async function upload(headers,op,revision) {
  return request('/api/drafts/files'+(revision ? '/'+op.fileId : ''),{
    method:'POST',headers:{...headers,'content-type':'application/octet-stream','x-office-version-id':op.versionId,'x-office-name':encodeURIComponent(op.filename),'x-office-label':encodeURIComponent(op.label),...(revision?{'x-office-base-revision':String(revision)}:{'x-office-file-id':op.fileId}),...op.extraHeaders},body:op.bytes,
  });
}
async function download(headers,op) {
  const response=await fetch(`${base}/api/drafts/files/${op.fileId}/versions/${op.versionId}`,{headers});
  return {response,bytes:Buffer.from(await response.arrayBuffer())};
}
test('Office filename, Unicode and attachment boundaries are deterministic',()=>{
  for(const name of ['../报告.docx','C:\\报告.docx','bad\r\n.docx','CON.pptx','.隐藏.docx','演示.pptm','报告\u202e.docx','bad\ud800.docx']) assert.throws(()=>parseOfficeFilename(name));
  assert.deepEqual(parseOfficeFilename('报告书（定稿）.DOCX'),{filename:'报告书（定稿）.DOCX',kind:'docx'});
  assert.equal(parseOfficeLabel('  决赛前  '),'决赛前'); assert.throws(()=>parseOfficeLabel('a\nB'));
  const disposition=officeDisposition("John's 作品.pptx",'pptx'); assert.match(disposition,/^attachment;/);assert.match(disposition,/%27/); assert.doesNotMatch(disposition,/作品|John's/);
});
test('Real DOCX and PPTX are owned, immutable and downloaded byte-for-byte',async()=>{
  const headers=await owner(), other=await owner();
  const files=await fixtures;
  for(const [index,kind] of ['docx','pptx'].entries()) {
    const op=operation(files[index],kind); const saved=await upload(headers,op);
    assert.equal(saved.status,201,JSON.stringify(saved.body)); assert.equal(saved.body.file.revision,1); assert.equal(saved.body.version.sha256,digest(op.bytes));
    assert.equal('objectKey' in saved.body.version,false); assert.equal('ownerHash' in saved.body.file,false);
    const got=await download(headers,op);assert.equal(got.response.status,200);assert.deepEqual(got.bytes,op.bytes);assert.equal(got.response.headers.get('x-office-sha256'),digest(op.bytes));assert.equal(got.response.headers.get('cache-control'),'no-store');assert.match(got.response.headers.get('content-disposition'),/^attachment;/);
    assert.equal((await download(other,op)).response.status,404);
    assert.equal((await request('/api/drafts/files/'+op.fileId,{headers:other})).status,404);
    assert.equal((await upload(other,{...op,versionId:crypto.randomUUID()},1)).status,404);
    const meta=await request('/api/drafts/files/'+op.fileId,{headers}); assert.equal(meta.body.versions.length,1);
  }
  assert.deepEqual((await request('/api/drafts/files',{headers:other})).body.files,[]);
});
test('Office APIs fail closed for sessions, CSRF, scope, names and disguised files',async()=>{
  const headers=await owner(); const [docx,pptx]=await fixtures; const op=operation(docx);
  assert.equal((await request('/api/drafts/files')).status,401);
  assert.equal((await upload({},op)).status,401);
  assert.equal((await upload({cookie:headers.cookie},op)).status,409);
  assert.equal((await upload({...headers,'x-editor-scope':'wrong'},op)).status,409);
  assert.equal((await upload({...headers,origin:'https://foreign.invalid'},op)).status,403);
  assert.equal((await upload({...headers,'sec-fetch-site':'cross-site'},op)).status,403);
  assert.equal((await upload(headers,{...op,filename:'../原件.docx'})).status,400);
  assert.equal((await upload(headers,{...op,filename:'宏文件.docm'})).status,400);
  assert.equal((await upload(headers,{...op,bytes:pptx})).status,400);
  assert.equal((await upload(headers,{...op,bytes:Buffer.from('Not a ZIP')})).status,400);
  assert.equal((await upload(headers,{...op,bytes:Buffer.alloc(0)})).status,400);
  assert.equal((await upload(headers,{...op,extraHeaders:{'x-office-name':'%E0%A4%A'}})).status,400);
  assert.equal((await upload(headers,{...op,extraHeaders:{'content-type':'text/html'}})).status,415);
  assert.equal((await upload(headers,{...op,extraHeaders:{'content-encoding':'gzip'}})).status,415);
  assert.equal((await upload(headers,{...op,bytes:Buffer.alloc(OFFICE_LIMITS.bytes+1)})).status,413);
  assert.deepEqual((await request('/api/drafts/files',{headers})).body.files,[]);
});
test('Idempotency checks content, filename, label, owner and original base revision',async()=>{
  const headers=await owner(),other=await owner();const [docx]=await fixtures; const op=operation(docx);
  assert.equal((await upload(headers,op)).status,201);assert.equal((await upload(headers,op)).status,201);
  for(const changed of [{label:'不同说明'},{filename:'不同名字.docx'},{bytes:Buffer.from(await (await buildDocx({...createEditorContent(),title:'改变内容'})).arrayBuffer())}]) assert.equal((await upload(headers,{...op,...changed})).status,409);
  assert.equal((await upload(other,op)).status,409);
  const v2={...op,versionId:crypto.randomUUID(),label:'更新版'}; assert.equal((await upload(headers,v2,1)).status,201);
  const retry=await upload(headers,op);assert.equal(retry.status,201);assert.equal(retry.body.version.revision,1);assert.equal(retry.body.file.revision,2);
  assert.equal((await upload(headers,v2,1)).status,201);assert.equal((await upload(headers,v2,2)).status,409);
  const versions=(await request('/api/drafts/files/'+op.fileId,{headers})).body.versions;assert.deepEqual(versions.map(v=>v.revision),[2,1]);
  assert.deepEqual((await download(headers,op)).bytes,docx);
});
test('Concurrent Office versions have exactly one winner and preserve both histories',async()=>{
  const headers=await owner();const [docx,pptx]=await fixtures;const op=operation(docx);assert.equal((await upload(headers,op)).status,201);
  const a={...op,versionId:crypto.randomUUID(),label:'分支甲'},b={...op,versionId:crypto.randomUUID(),label:'分支乙'};
  const results=await Promise.all([upload(headers,a,1),upload(headers,b,1)]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  assert.equal((await upload(headers,{...op,versionId:crypto.randomUUID(),filename:'异类.pptx',bytes:pptx},2)).status,400);
  const current=await request('/api/drafts/files/'+op.fileId,{headers});assert.equal(current.body.file.revision,2);assert.equal(current.body.versions.length,2);
  const same={...op,versionId:crypto.randomUUID(),label:'同一操作重试'};const repeats=await Promise.all([upload(headers,same,2),upload(headers,same,2)]);assert.deepEqual(repeats.map(r=>r.status),[201,201]);assert.equal((await request('/api/drafts/files/'+op.fileId,{headers})).body.versions.length,3);
});
test('File and version caps are enforced without removing old binary versions',async()=>{
  const headers=await owner();const [docx]=await fixtures;const op=operation(docx);assert.equal((await upload(headers,op)).status,201);
  for(let i=1;i<20;i++) assert.equal((await upload(headers,{...op,versionId:crypto.randomUUID(),label:`版本${i+1}`},i)).status,201);
  assert.equal((await upload(headers,{...op,versionId:crypto.randomUUID()},20)).status,409);
  for(let i=1;i<20;i++) assert.equal((await upload(headers,operation(docx))).status,201);
  assert.equal((await upload(headers,operation(docx))).status,409);
  assert.equal((await request('/api/drafts/files',{headers})).body.files.length,20);
  assert.equal((await request('/api/drafts/files/'+op.fileId,{headers})).body.versions.length,20);
  assert.deepEqual((await download(headers,op)).bytes,docx);
});
