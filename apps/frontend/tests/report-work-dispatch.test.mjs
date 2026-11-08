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
const load=rel=>import(pathToFileURL(path.join(root,rel)));
const model=await load('apps/frontend/lib/agent/report-work.ts');
const client=await load('apps/frontend/components/agent/full-report-client.ts');
const {HostedApiError}=await load('apps/frontend/components/hosted/api-client.ts');
const {createEditorContent}=await load('apps/frontend/lib/editor-model.ts');
const {newQuestionnaire}=await load('apps/frontend/lib/questionnaire.ts');
const {reportSourceKey}=await load('apps/frontend/lib/agent/report-run.ts');
const ts=createRequire(path.join(root,'package.json'))('typescript');
const file=path.join(root,'apps/frontend/components/agent/AgentShell.tsx');
const source=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let clause,scopeRead,writeStatus,stopRun,cleanupCallback,liveExpression,paperSuppression;
function walk(node) {
  if(ts.isCaseClause(node)&&node.expression.getText(ast)==="'generateFullReport'")clause=node.getText(ast);
  if(ts.isVariableDeclaration(node)){
    const name=node.name.getText(ast);
    if(name==='readReportScope')scopeRead=node.getText(ast);
    if(name==='setReportWriting')writeStatus=node.getText(ast);
    if(name==='stopReportRun')stopRun=node.getText(ast);
    if(name==='liveWriting')liveExpression=node.initializer.getText(ast);
  }
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useLayoutEffect'&&node.arguments[0]?.getText(ast).includes('sameReportRunScope(current.scope, scope)'))cleanupCallback=node.arguments[0].getText(ast);
  if(ts.isJsxAttribute(node)&&node.name.getText(ast)==='workInPaper'&&node.parent.parent.tagName?.getText(ast)==='Transcript')paperSuppression=node.initializer.expression.getText(ast);
  ts.forEachChild(node,walk);
}
walk(ast);
assert.ok(clause&&scopeRead&&writeStatus&&stopRun&&cleanupCallback&&liveExpression&&paperSuppression,'Actual production dispatch, scope, status, cleanup and Transcript binding must be found');
const js=ts.transpileModule(`const ${scopeRead};const ${writeStatus};const ${stopRun};function perform(action){switch(action.type){${clause}}};globalThis.perform=perform;globalThis.enterScope=${cleanupCallback};globalThis.cleanupReport=enterScope();globalThis.liveFor=(writingEnvelope,displayScope)=>${liveExpression};globalThis.paperSuppression=(stage,liveWriting)=>${paperSuppression};globalThis.setReportWriting=setReportWriting;`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
function harness({fresh=false,deferHash=false}={}){
  let envelope=null,candidate=null,currentOwner='owner-a',currentEpoch=1,resolveHash;
  const messages=[],marks=[],notices=[],calls=[],activeCalls=new Map(),published=[];
  const book={active:fresh?null:'thread-a',draftProject:'project-a',threads:fresh?[]:[{id:'thread-a',projectId:'project-a'},{id:'thread-b',projectId:'project-b'}]};
  const identity=(owner,epoch)=>owner===currentOwner&&epoch===currentEpoch;
  const original=createEditorContent(),reportSource={design:newQuestionnaire(),dataset:null,report:original,inputPending:false};
  const service={id:'service-a',revision:1,label:'Synthetic',model:'synthetic-model',provider:'synthetic'};
  const hash='a'.repeat(64);
  const threadOf=id=>book.threads.find(t=>messages.some(m=>m.id===id&&m.threadId===t.id));
  const context={
    owner:'owner-a',identityEpoch:1,thread:fresh?null:book.threads[0],projectId:'project-a',
    isCurrentAccount:identity,useCallback:f=>f,sameReportRunScope:model.sameReportRunScope,reportWorkState:model.reportWorkState,
    activeReportRun:{current:null},preparingReport:{current:null},autoFollowRef:{current:false},
    latest:{current:{owner:'owner-a',identityEpoch:1,projectId:'project-a',reportScope:'owner-a:1:project-a',reportSource,csrfToken:'synthetic-csrf',generation:{account:'ready'},isCurrentAccount:identity}},
    threads:{view:()=>book,threadOf,append:ms=>{if(!book.active){book.active='thread-a';book.threads.push({id:'thread-a',projectId:book.draftProject});book.draftProject=null;}messages.push(...ms.map(m=>({...m,threadId:book.active})));},patch:(id,f)=>{const at=messages.findIndex(m=>m.id===id);if(at>=0)messages[at]=f(messages[at]);}},
    currentService:()=>service,matchesModelConsent:()=>true,fullReportInputRevision:()=>deferHash?new Promise(resolve=>{resolveHash=resolve;}):Promise.resolve(hash),
    reportSourceKey,hasUserResearchSource:()=>false,REPORT_MODES:{plan:'研究方案',demonstration:'教学模拟',empirical:'真实资料'},
    blankReport:createEditorContent(),crypto,AbortController,Promise,HostedApiError,fullReportFailureStatus:client.fullReportFailureStatus,
    say:line=>notices.push(line),go:()=>{},setStage:()=>{},setCopilotOpen:()=>{},closePanel:()=>{},stamp:()=>({id:`message-${messages.length}`,at:1}),span:text=>text,
    setWritingEnvelope:update=>{envelope=typeof update==='function'?update(envelope):update;},
    setCandidate:update=>{candidate=typeof update==='function'?update(candidate):update;},setLockedSections:()=>{},setReviewNotice:()=>{},
    startCall:(id,owner,epoch)=>activeCalls.set(id,{owner,epoch}),finishCall:id=>activeCalls.delete(id),
    stopChoreography:()=>{},choreo:{stop:()=>{},animateIncomingSection:()=>{},runReviewAndFormatChoreography:()=>{}},pickSection:()=>{},
    replace:()=>{},mark:(id,status)=>marks.push(status),
    // Only the real client's initial fetch is replaced. It then executes its actual NDJSON/abort validation.
    requestFullReport:(input,options)=>{
      const call={input,options};calls.push(call);
      const previous=globalThis.fetch;globalThis.fetch=()=>new Promise((resolve,reject)=>{call.resolve=resolve;call.reject=reject;});
      try{return client.requestFullReport(input,options);}finally{globalThis.fetch=previous;}
    },
    loadBenchmark:(...args)=>published.push(['loadBenchmark',...args]),setLiveReport:(...args)=>published.push(['setLiveReport',...args]),
  };
  vm.runInNewContext(js,context);
  const callAt=index=>calls.at(index??-1);
  const doneEvent=(changes={},index)=>{const call=callAt(index);return {type:'done',ok:true,runId:call.input.runId,project:{runId:call.input.runId,projectId:call.input.projectId??'local',inputRevision:call.input.inputRevision},report:createEditorContent(),pack:{design:reportSource.design,dataset:null,report:createEditorContent()},quality:{status:'needs_review',deliverable:false,checks:[],blockers:[]},revisions:[],summary:{llmSuccessCount:1,totalSectionsGenerated:1,totalParagraphsWritten:1,totalFactsCited:0,promptTokens:0,completionTokens:0,usageReported:true,fallbackCount:0},...changes};};
  const stream=(events,{index,unterminated=false}={})=>{
    const bytes=new TextEncoder().encode(events.map(e=>JSON.stringify(e)).join('\n')+(unterminated?'':'\n'));
    const cuts=[bytes.slice(0,4),bytes.slice(4,19),bytes.slice(19)];
    callAt(index).resolve(new Response(new ReadableStream({pull(controller){if(cuts.length)controller.enqueue(cuts.shift());else controller.close();}}),{headers:{'content-type':'application/x-ndjson'}}));
  };
  return {context,book,messages,marks,notices,calls,activeCalls,published,original,get candidate(){return candidate;},get envelope(){return envelope;},
    start:async()=>{context.perform({type:'generateFullReport',topic:'Synthetic review',inputRevision:hash,modelBinding:{}});await settle();},
    invalidate:(owner='owner-b',epoch=2)=>{currentOwner=owner;currentEpoch=epoch;},
    releaseHash:()=>resolveHash(hash),stream,doneEvent,
    complete:async(options={})=>{stream([doneEvent({},options.index)],options);await settle();},
    reject:async()=>{callAt().reject(Error('Synthetic network failure'));await settle();},
    renderScope:()=>{context.thread=book.threads.find(t=>t.id===book.active)??null;context.projectId=context.thread?context.thread.projectId:book.draftProject;context.latest.current.projectId=context.projectId;context.latest.current.reportScope=`owner-a:1:${context.projectId??'local'}`;return context.enterScope();},
  };
}

test('synchronous owner and epoch invalidation reject dispatch and late replies before React effects',async()=>{
  for(const [owner,epoch] of [['owner-b',1],['owner-a',2]]){
    const h=harness();await h.start();h.invalidate(owner,epoch);await h.complete();assert.equal(h.candidate.result,undefined);assert.equal(h.activeCalls.size,0);assert.deepEqual(h.published,[]);
    const early=harness();early.invalidate(owner,epoch);await early.start();assert.equal(early.calls.length,0);assert.equal(early.messages.length,0);
  }
});
test('preparation rejects synchronous project changes and a changed report source before dispatch',async()=>{
  for(const change of [h=>{h.book.threads[0].projectId='project-other';},h=>{h.context.latest.current.reportSource={...h.context.latest.current.reportSource,report:{...h.original,title:'New original'}};},h=>h.invalidate()]){
    const h=harness({deferHash:true});await h.start();assert.equal(h.calls.length,0);change(h);h.releaseHash();await settle();assert.equal(h.calls.length,0);assert.equal(h.context.preparingReport.current,null);
  }
});
test('one active dispatch rejects repeated clicks and never publishes preview into the original',async()=>{
  const h=harness();await h.start();await h.start();assert.equal(h.calls.length,1);assert.equal(h.activeCalls.size,1);assert.equal(h.envelope.status.completed,0);assert.equal(h.envelope.status.total,0);
  await h.complete();assert.equal(h.envelope.status.phase,'done');assert.equal(h.context.activeReportRun.current,null);assert.equal(h.activeCalls.size,0);assert.ok(h.candidate.result);assert.deepEqual(h.published,[]);assert.equal(h.original.title,'我的市场调查研究');
});
test('actual client accepts chunked unterminated final NDJSON only as a complete candidate',async()=>{
  const h=harness();await h.start();await h.complete({unterminated:true});assert.equal(h.envelope.status.phase,'done');assert.equal(h.envelope.status.active,false);assert.ok(h.candidate.result);assert.deepEqual(h.published,[]);
});
test('EOF without done and provider/transport failures stop activity without completion or automatic retry',async()=>{
  for(const failure of ['eof','provider','transport']){
    const h=harness();await h.start();
    if(failure==='transport')await h.reject();else{h.stream(failure==='eof'?[]:[{type:'error',runId:h.calls[0].input.runId,code:'outcome_unknown'}]);await settle();}
    assert.equal(h.envelope.status.phase,'failed');assert.equal(h.envelope.status.active,false);assert.equal(h.candidate.result,undefined);assert.equal(h.calls.length,1);assert.equal(h.activeCalls.size,0);assert.deepEqual(h.published,[]);
  }
});
test('moved projects, changed threads and deleted conversations reject events, final results and failures before React cleanup',async()=>{
  for(const change of [h=>{h.book.threads[0].projectId='project-other';},h=>{h.book.active='thread-b';},h=>{h.book.threads=h.book.threads.filter(t=>t.id!=='thread-a');}]){
    for(const fail of [false,true]){
      const h=harness();await h.start();change(h);
      if(fail)await h.reject();else{const call=h.calls[0];h.stream([{type:'section',runId:call.input.runId,phase:'wave1',sectionId:'section-1',title:'Late section',completed:1,total:1,report:createEditorContent()},h.doneEvent()]);await settle();}
      assert.equal(h.candidate.result,undefined);assert.equal(h.candidate.preview,h.original);assert.equal(h.envelope.status.completed,0);assert.equal(h.activeCalls.size,0);assert.deepEqual(h.published,[]);
    }
  }
});
test('settled or failed status is invisible in another project or conversation and cleanup prevents resurrection',async()=>{
  for(const fail of [false,true]){
    const h=harness();await h.start();if(fail)await h.reject();else await h.complete();
    const other={owner:'owner-a',epoch:1,thread:'thread-b',project:'project-b'};
    assert.equal(h.context.liveFor(h.envelope,other),null);
    h.book.active='thread-b';h.context.cleanupReport();h.renderScope();h.book.active='thread-a';h.renderScope();
    assert.equal(h.context.liveFor(h.envelope,{...other,thread:'thread-a',project:'project-a'}),null);
  }
});
test('leaving and returning cannot revive an active run and stale cleanup cannot cancel a newer run',async()=>{
  const h=harness();await h.start();const oldCleanup=h.context.cleanupReport;oldCleanup();assert.equal(h.activeCalls.size,0);assert.equal(h.context.activeReportRun.current,null);
  h.book.active='thread-b';const nextCleanup=h.renderScope();await h.start();assert.equal(h.calls.length,2);const current=h.context.activeReportRun.current;oldCleanup();assert.equal(h.context.activeReportRun.current,current);assert.equal(h.activeCalls.size,1);
  await h.complete({index:0});assert.equal(h.candidate.result,undefined);assert.equal(h.context.activeReportRun.current,current);
  await h.complete({index:1});assert.ok(h.candidate.result);nextCleanup();h.book.active='thread-a';h.renderScope();assert.equal(h.context.liveFor(h.envelope,{owner:'owner-a',epoch:1,thread:'thread-a',project:'project-a'}),null);
});
test('a first conversation binds after append and departing draft cleanup leaves its new run intact',async()=>{
  const h=harness({fresh:true});await h.start();assert.equal(h.book.active,'thread-a');assert.equal(h.calls.length,1);const run=h.context.activeReportRun.current;assert.equal(run.scope.thread,'thread-a');h.context.cleanupReport();assert.equal(h.context.activeReportRun.current,run);assert.equal(h.activeCalls.size,1);h.renderScope();await h.complete();assert.ok(h.candidate.result);assert.equal(h.envelope.status.phase,'done');
});
test('writing scopes are copied and stale status updates cannot modify a later scope',()=>{
  const h=harness(),first={owner:'owner-a',epoch:1,thread:'thread-a',project:'project-a'},status={active:true,phase:'contract',completed:0,total:0};
  h.context.setReportWriting(first,status);first.project='changed';assert.equal(h.envelope.scope.project,'project-a');
  const second={...first,thread:'thread-b'};h.context.setReportWriting(second,status);h.context.setReportWriting({...first,project:'project-a'},previous=>({...previous,completed:9}));assert.equal(h.envelope.status.completed,0);h.context.setReportWriting({...first,project:'project-a'},null);assert.equal(h.envelope.scope.thread,'thread-b');
});
test('the actual Transcript binding suppresses duplicate paper feedback only when paper work is visible',()=>{
  const h=harness();assert.equal(h.context.paperSuppression('paper',{active:true,phase:'contract',completed:0,total:0}),true);assert.equal(h.context.paperSuppression('paper',{active:false,phase:'done'}),false);assert.equal(h.context.paperSuppression('chat',{active:true,phase:'wave1',completed:1,total:2}),false);
});
test('placement stays below content and above footer for boundary heights',()=>{
  for(let bottom=0;bottom<=940;bottom+=7){const fit=model.reportWorkPlacement([{first:0,last:0,start:0,end:bottom}],[0],[bottom],['body'],930,260);if(fit){assert.ok(fit.top>=bottom+24);assert.ok(fit.top+260+16<=930);}}
  for(const style of ['cover','appendix','unknown'])assert.equal(model.reportWorkPlacement([{first:0,last:0,start:0,end:40}],[0],[40],[style],930,260),null);
});
