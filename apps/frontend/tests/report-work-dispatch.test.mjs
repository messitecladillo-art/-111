import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
function repositoryRoot(start) {
  for (let dir=start, depth=0;depth<10;depth++,dir=path.dirname(dir)) {
    if (fs.existsSync(path.join(dir,'PROJECT_FRAMEWORK.md')) && fs.existsSync(path.join(dir,'apps/frontend'))) return dir;
    if (path.dirname(dir)===dir) break;
  }
  throw Error('Repository root not found; boundary tests cannot be skipped');
}
const root=repositoryRoot(path.dirname(fileURLToPath(import.meta.url)));
const model = await import(pathToFileURL(path.join(root, 'apps/frontend/lib/agent/report-work.ts')));
const ts = createRequire(path.join(root, 'package.json'))('typescript');
const file = path.join(root, 'apps/frontend/components/agent/AgentShell.tsx');
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let clause, scopeRead, cleanupCallback, liveExpression;
function walk(node) {
  if (ts.isCaseClause(node) && node.expression.getText(ast) === "'generateFullReport'") clause = node.getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'readReportScope') scopeRead = node.getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'liveWriting') liveExpression = node.initializer.getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('cancelScope(scope)')) cleanupCallback = node.arguments[0].getText(ast);
  ts.forEachChild(node, walk);
}
walk(ast);
assert.ok(clause && scopeRead && cleanupCallback && liveExpression, 'Production dispatch/scope/cleanup expressions must be found');
const js = ts.transpileModule(`const ${scopeRead}; function perform(action) { switch(action.type) { ${clause} } }; globalThis.perform=perform; globalThis.cleanupReport=(${cleanupCallback})(); globalThis.liveFor=(writingEnvelope,displayScope)=>${liveExpression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const reply=()=>({ok:true,pack:{report:{report:[{id:'s1'}]}},summary:{totalSectionsGenerated:1,totalParagraphsWritten:1,totalFactsCited:0,totalDurationMs:1,totalTokens:0,advisorPassCount:0,advisorTotalCount:0}});
const settle=()=>new Promise(resolve=>setTimeout(resolve,25));
function harness({fresh=false}={}) {
  let resolveFetch, rejectFetch, envelope=null, dispatched=0;
  let currentOwner='owner-a', currentEpoch=1;
  const messages=[];const applied=[];const marks=[];const failures=[];const activeCalls=new Map();
  const book={active:fresh?null:'thread-a',draftProject:'project-a',threads:fresh?[]:[{id:'thread-a',projectId:'project-a'},{id:'thread-b',projectId:'project-b'}]};
  const identity=(owner,epoch)=>owner===currentOwner&&epoch===currentEpoch;
  const gate=new model.ReportRunFence();
  const context={
    ReportRunFence:model.ReportRunFence,sameReportRunScope:model.sameReportRunScope,reportRuns:gate,
    owner:'owner-a',identityEpoch:1,thread:fresh?null:{id:'thread-a'},reportProject:'project-a',
    isCurrentIdentity:identity,isCurrentAccount:identity,useCallback:f=>f,
    latest:{current:{owner:'owner-a',identityEpoch:1,report:{title:'Study'},isCurrentIdentity:identity,isCurrentAccount:identity}},
    threads:{view:()=>book,append:ms=>{messages.push(...ms);if(!book.active){book.active='thread-a';book.threads.push({id:'thread-a',projectId:book.draftProject});}},patch:(id,f)=>{const at=messages.findIndex(m=>m.id===id);if(at>=0)messages[at]=f(messages[at]);}},
    window:{sessionStorage:{getItem:()=>null}},say:()=>{},setStage:()=>{},closePanel:()=>{},stamp:()=>({id:`message-${messages.length}`,at:1}),span:text=>text,
    setWritingEnvelope:f=>{envelope=typeof f==='function'?f(envelope):f;},autoFollowRef:{current:false},
    startCall:(id,owner,epoch)=>activeCalls.set(id,{owner,epoch}),finishCall:id=>activeCalls.delete(id),
    fetch:()=>{dispatched++;return new Promise((resolve,reject)=>{resolveFetch=resolve;rejectFetch=reject;});},
    loadBenchmark:(...args)=>{applied.push(['loadBenchmark',...args]);return Promise.resolve(true);},
    setLiveReport:(...args)=>applied.push(['setLiveReport',...args]),
    pickSection:()=>{},requestAnimationFrame:f=>{f();return 1;},
    choreo:{animateIncomingSection:()=>{},runReviewAndFormatChoreography:()=>{}},
    replace:(id,value)=>failures.push(value),mark:(id,status)=>marks.push(status),TextDecoder,Promise,AbortController,
  };
  vm.runInNewContext(js,context);
  return {context,book,gate,messages,applied,marks,failures,activeCalls,get envelope(){return envelope;},get dispatched(){return dispatched;},
    start:()=>context.perform({type:'generateFullReport',topic:'Synthetic review'}),
    invalidate:()=>{currentOwner='owner-b';currentEpoch=2;},
    resolve:res=>resolveFetch(res),reject:err=>rejectFetch(err),
    json:value=>resolveFetch({ok:true,headers:{get:()=> 'application/json'},json:async()=>value}),
    stream:events=>{
      const bytes=new TextEncoder().encode(events.map(e=>JSON.stringify(e)).join('\n'));
      const cuts=[bytes.slice(0,4),bytes.slice(4,19),bytes.slice(19)];
      resolveFetch({ok:true,headers:{get:()=> 'application/x-ndjson'},body:{getReader:()=>({read:async()=>cuts.length?{done:false,value:cuts.shift()}:{done:true},cancel:async()=>{}})}});
    },
  };
}

test('synchronous identity invalidation stops replies before React effects',async()=>{
  const h=harness();h.start();assert.equal(h.dispatched,1);h.invalidate();h.json(reply());await settle();
  assert.equal(h.applied.length,0,'old identity published a report before cleanup');
});
test('one active dispatch rejects repeated clicks',async()=>{
  const h=harness();h.start();h.start();assert.equal(h.dispatched,1);assert.equal(h.activeCalls.size,1);
  h.json(reply());await settle();assert.equal(h.gate.active,false);assert.equal(h.activeCalls.size,0);
});
test('an unterminated final NDJSON line is accepted only with valid done',async()=>{
  const h=harness();h.start();h.stream([{type:'done',...reply()}]);await settle();
  assert.equal(h.envelope.status.phase,'done');assert.equal(h.envelope.status.active,false);assert.equal(h.applied.length,1);
});
test('EOF without done preserves error, never completion',async()=>{
  const h=harness();h.start();h.stream([]);await settle();assert.equal(h.envelope.status.phase,'error');assert.equal(h.envelope.status.active,false);assert.equal(h.applied.length,0);
});
test('provider error and transport failure stop animation with no automatic new dispatch',async()=>{
  for(const mode of ['event','transport']){
    const h=harness();h.start();if(mode==='event')h.stream([{type:'error',message:'Synthetic failure'}]);else h.reject(Error('Synthetic network failure'));
    await settle();assert.equal(h.envelope.status.phase,'error');assert.equal(h.dispatched,1);assert.equal(h.gate.active,false);
  }
});
test('leaving and returning to an old scope cannot resurrect an active apparatus',async()=>{
  const h=harness();h.start();h.context.cleanupReport();assert.equal(h.activeCalls.size,0);h.book.active='thread-b';h.json(reply());await settle();
  h.book.active='thread-a';const shown=h.context.liveFor(h.envelope,{owner:'owner-a',epoch:1,thread:'thread-a',project:'project-a'});
  assert.ok(!shown||!shown.active,'cancelled task became animated on return');assert.equal(h.applied.length,0);
});
test('a moved project rejects late output before React cleanup',async()=>{
  const h=harness();h.start();h.book.threads[0].projectId='project-other';h.json(reply());await settle();assert.equal(h.applied.length,0);
});
test('scope copies and stale cleanup cannot affect a newer task',()=>{
  const gate=new model.ReportRunFence();const scope={owner:'a',epoch:1,thread:'t',project:'p'};const first=gate.start(scope);scope.project='changed';assert.equal(first.scope.project,'p');
  gate.cancel();const second=gate.start({...scope,epoch:2});gate.cancelScope(first.scope);gate.finish(first);assert.equal(gate.accepts(second,{...scope,epoch:2}),true);
});
test('placement stays below content and above footer for boundary heights',()=>{
  for(let bottom=0;bottom<=940;bottom+=7){const fit=model.reportWorkPlacement([{first:0,last:0,start:0,end:bottom}],[0],[bottom],['body'],930,260);if(fit){assert.ok(fit.top>=bottom+24);assert.ok(fit.top+260+16<=930);}}
  for(const style of ['cover','appendix','unknown'])assert.equal(model.reportWorkPlacement([{first:0,last:0,start:0,end:40}],[0],[40],[style],930,260),null);
});

test('a first conversation is bound after append; old draft-scope cleanup leaves the new ticket intact',async()=>{
  const h=harness({fresh:true});h.start();assert.equal(h.book.active,'thread-a');assert.equal(h.dispatched,1);
  h.context.cleanupReport();assert.equal(h.gate.active,true,'old draft cleanup cancelled the newly created conversation');
  h.json(reply());await settle();assert.equal(h.envelope.status.phase,'done');assert.equal(h.applied.length,1);
});
test('an unconfirmed identity cannot dispatch a new model request',()=>{
  const h=harness();h.invalidate();h.start();assert.equal(h.dispatched,0);assert.equal(h.gate.active,false);assert.equal(h.messages.length,0);
});
