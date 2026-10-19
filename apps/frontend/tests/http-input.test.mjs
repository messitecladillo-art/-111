import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import {heldOpenUpload} from './helpers/held-open-upload.mjs';
import {isOwnedReadiness,isOwnedShutdown} from './helpers/dev-server-contract.mjs';
import {captureOwnedTree,remainingOwnedProcesses,validateProcesses} from './helpers/process-tree.mjs';
const source = await readFile(new URL('../app/api/_lib/http.ts',import.meta.url),'utf8');
const compiled = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {readJsonObject,apiErrorResponse,ApiError}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const request=body=>new Request('http://localhost/api/rules',{method:'POST',headers:{'content-type':'application/json'},body});
test('invalid UTF-8 is a client JSON error, with no partial replacement or detail leak',async()=>{
  for(const bytes of [[123,34,120,34,58,34,195,40,34,125],[239,187],[255]]){
    await assert.rejects(()=>readJsonObject(request(Uint8Array.from(bytes))),e=>{
      assert.equal(e.code,'invalid_json');assert.equal(apiErrorResponse(e).status,400);return true;
    });
  }
  assert.deepEqual(await readJsonObject(request('{"问题":"体验如何"}')),{问题:'体验如何'});
  await assert.rejects(()=>readJsonObject(request('{')),e=>e.code==='invalid_json');
  await assert.rejects(()=>readJsonObject(request('[]')),e=>e.code==='invalid_body');
});
test('bounded body limit remains enforced; internal exceptions remain redacted',async()=>{
  await assert.rejects(()=>readJsonObject(request('{"x":"12345678"}'),4),e=>e.code==='payload_too_large');
  const res=apiErrorResponse(new Error('PRIVATE-SQL-AND-PATH'));
  assert.equal(res.status,500);assert.equal(res.headers.get('cache-control'),'no-store');
  assert.doesNotMatch(await res.text(),/PRIVATE/);
});
test('trusted text observer sees exact bounded JSON once without reparsing or rewriting it',async()=>{
  const raw=' {"题":"好", "x":1,"x":2} ',seen=[];
  assert.deepEqual(await readJsonObject(request(raw),Buffer.byteLength(raw),text=>seen.push(text)),{题:'好',x:2});
  assert.deepEqual(seen,[raw]);
});
test('text observer never sees rejected headers, overflow, invalid UTF-8/JSON, or a non-object',async()=>{
  let calls=0;const observe=()=>{calls++;};
  const rejected=[
    new Request('http://localhost',{method:'POST',headers:{'content-type':'text/plain'},body:'{}'}),
    new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json','content-length':'100'},body:'{}'}),
    request('x'.repeat(40)),request(Uint8Array.of(255)),request('{'),request('[]'),
  ];
  for(const req of rejected)await assert.rejects(()=>readJsonObject(req,32,observe));
  assert.equal(calls,0);
});
test('duplicate-key observer rejection preserves its explicit API error and never returns a body',async()=>{
  const error=new ApiError(400,'invalid_json','Duplicate JSON member');let calls=0;
  await assert.rejects(()=>readJsonObject(request('{"consent":false,"consent":true}'),100,()=>{calls++;throw error;}),actual=>actual===error);
  assert.equal(calls,1);assert.equal(apiErrorResponse(error).status,400);
});
for (const mode of ['pending','rejecting','throwing']) test(`oversize returns 413 without waiting on ${mode} cancellation`,{timeout:2000},async()=>{
  let cancellationReason;
  const body=new ReadableStream({
    start(controller){controller.enqueue(new TextEncoder().encode('{"value":"oversize"}'));},
    cancel(reason){
      cancellationReason=reason;
      if(mode==='pending')return new Promise(()=>{});
      if(mode==='rejecting')return Promise.reject(new Error('private transport error'));
      throw new Error('private cancellation error');
    },
  },{highWaterMark:0});
  const req=new Request('http://localhost/api/rules',{method:'POST',headers:{'content-type':'application/json'},body,duplex:'half'});
  let timer;
  try {
    const error=await Promise.race([
      readJsonObject(req,4).then(()=>assert.fail('oversize was accepted'),e=>e),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('413 waited for cleanup')),500);}),
    ]);
    assert.equal(error.code,'payload_too_large');
    assert.equal(apiErrorResponse(error).status,413);
    assert.equal(cancellationReason,'payload_too_large');
    assert.equal(body.locked,false);
    await new Promise(resolve=>setImmediate(resolve)); // node:test also detects unhandled rejections.
  } finally { clearTimeout(timer); }
});
test('body limit counts UTF-8 bytes across chunks and accepts the exact limit',async()=>{
  const bytes=new TextEncoder().encode('{"题":"好"}');
  const stream=()=>new Request('http://localhost/api/rules',{
    method:'POST',headers:{'content-type':'application/json'},duplex:'half',
    body:new ReadableStream({start(controller){for(const byte of bytes)controller.enqueue(Uint8Array.of(byte));controller.close();}}),
  });
  assert.deepEqual(await readJsonObject(stream(),bytes.length),{题:'好'});
  await assert.rejects(()=>readJsonObject(stream(),bytes.length-1),e=>e.code==='payload_too_large');
});
test('held-open upload receives parser rejection without waiting for EOF', {timeout:2000}, async()=>{
  const upload=heldOpenUpload(32,1000);
  try{
    const req=new Request('http://localhost/api/rules',{method:'POST',headers:{'content-type':'application/json'},body:upload.body,duplex:'half',signal:upload.signal});
    assert.equal(req.headers.has('content-length'),false);
    await assert.rejects(()=>readJsonObject(req,32),e=>e.code==='payload_too_large');
    assert.equal(upload.eofReleased,false);
    assert.equal(upload.signal.aborted,false,'deadline is not accepted as a successful rejection');
  }finally{upload.cleanup();}
});
test('held-open fixture has finite bytes and withholds EOF until cleanup', {timeout:2000}, async()=>{
  const upload=heldOpenUpload(32,1000),reader=upload.body.getReader();
  try{
    const a=await reader.read(),b=await reader.read();
    assert.equal(a.value.byteLength+b.value.byteLength,upload.bytes);
    assert(upload.bytes>32);assert.equal(upload.eofReleased,false);
    let ended=false;const ending=reader.read().then(value=>{ended=true;return value;});
    await new Promise(resolve=>setImmediate(resolve));assert.equal(ended,false);
    upload.cleanup();assert.equal((await ending).done,true);assert.equal(upload.eofReleased,true);
  }finally{upload.cleanup();reader.releaseLock();}
});
test('test readiness rejects every mismatched owner or endpoint before network probing',()=>{
  const expected={nonce:'a'.repeat(64),pid:1234,port:32123,hostname:'localhost',cwd:'C:/fixture'};
  const valid={type:'evix-test-ready',...expected};
  assert.ok(isOwnedReadiness(valid,expected));
  for(const key of Object.keys(valid))assert.equal(isOwnedReadiness({...valid,[key]:'wrong'},expected),false,key);
  for(const value of [null,[],{},true,'ready'])assert.equal(isOwnedReadiness(value,expected),false);
  const stopped={...valid,type:'evix-test-stopped'};
  assert.ok(isOwnedShutdown(stopped,expected));
  assert.equal(isOwnedReadiness(stopped,expected),false);
  assert.equal(isOwnedShutdown(valid,expected),false);
  for(const key of Object.keys(stopped))assert.equal(isOwnedShutdown({...stopped,[key]:'wrong'},expected),false,key);
});
test('process cleanup requires an owned creation-time tree and observes surviving descendants',()=>{
  const row=(pid,parent,seconds)=>({pid,parent,created:`2026-09-30T00:00:${String(seconds).padStart(2,'0')}.000Z`});
  const snapshot=[row(10,1,1),row(11,10,2),row(12,11,3),row(20,1,1)];
  const tree=captureOwnedTree(snapshot,10,Date.parse('2026-09-30T00:00:00Z'));
  assert.deepEqual(tree.map(p=>p.pid),[10,11,12]);
  assert.deepEqual(remainingOwnedProcesses([snapshot[2],snapshot[3]],tree).map(p=>p.pid),[12]);
  assert.deepEqual(remainingOwnedProcesses([row(13,11,4),snapshot[3]],tree).map(p=>p.pid),[13]);
  assert.deepEqual(remainingOwnedProcesses([row(12,1,8),snapshot[3]],tree),[]);
  assert.throws(()=>captureOwnedTree(snapshot,99,0));
  assert.throws(()=>captureOwnedTree(snapshot,10,Date.parse('2026-09-30T00:00:09Z')));
  for(const bad of [null,{},[],[{pid:1,parent:0,created:'invalid'}],[snapshot[0],snapshot[0]]])assert.throws(()=>validateProcesses(bad));
  assert.throws(()=>captureOwnedTree(snapshot,10,undefined));
  assert.throws(()=>captureOwnedTree([{...snapshot[0],created:null}],10,0));
  assert.throws(()=>captureOwnedTree([...snapshot,{pid:13,parent:12,created:null}],10,0));
  assert.throws(()=>remainingOwnedProcesses([{pid:12,parent:11,created:null}],tree));
  assert.throws(()=>remainingOwnedProcesses([{pid:13,parent:12,created:null}],tree));
  assert.deepEqual(remainingOwnedProcesses([{pid:20,parent:1,created:null}],tree),[]);
});
