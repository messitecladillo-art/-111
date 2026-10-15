import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as shared from '../../../packages/evi-x-shared/src/index.ts';
import * as questionnaire from '../lib/questionnaire.ts';
import * as library from '../lib/questionnaire-library.ts';
import * as mapping from '../lib/questionnaire-mapping.ts';
import * as revision from '../lib/questionnaire-revision.ts';
import * as core from '../lib/topic-questionnaire.ts';
import * as contract from '../lib/topic-questionnaire-api.ts';
import {emptyTopicBrief} from '../lib/topic-project.ts';

// Production component handlers/effects plus real proposal and receipt verification.
// This bounded harness does not establish native browser focus, IME or visual acceptance.
const ts=createRequire(import.meta.url)('typescript'),plain=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const sameDeps=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const label=n=>n==null?'':Array.isArray(n)?n.map(label).join(''):typeof n==='object'?label(n.props?.children):String(n);
function button(s,name){const n=nodes(s.tree).find(n=>n.type==='button'&&label(n)===name);assert.ok(n,`Missing ${name}`);return n;}
class HostedApiError extends Error{constructor(status,code='rejected'){super(code);this.status=status;this.code=code;}}
const projectId='11111111-1111-4111-8111-111111111111',v1='22222222-2222-4222-8222-222222222222',v2='33333333-3333-4333-8333-333333333333',v3='44444444-4444-4444-8444-444444444444';
const time='2026-10-15T08:00:00Z';
const source=()=>({brief:{...emptyTopicBrief(),title:'待核查的社区服务研究 🧭',decision:'拟决定优先核查哪些困难',decisionOwner:'拟联系的负责人',population:'拟访谈的居民',geography:'武汉市',questions:[{id:'rq-one',text:'哪些流程存在理解困难？'}]},version:{id:'55555555-5555-4555-8555-555555555555',revision:1,contentHash:'a'.repeat(64),createdAt:time,createdBy:projectId},dirty:false,decisionRevision:4});
function mount(relative,imports,initialProps,internal){
  let props=initialProps,cells=[],index=0,effects=[],dirty=true,tree,alive=true,writesAfterUnmount=0;
  const hooks={useState(init){const at=index++;if(!cells[at])cells[at]={value:typeof init==='function'?init():init};return[cells[at].value,next=>{if(!alive){writesAfterUnmount++;return;}next=typeof next==='function'?next(cells[at].value):next;if(!Object.is(next,cells[at].value)){cells[at].value=next;dirty=true;}}];},useRef(init){const at=index++;return cells[at]??={current:init};},useMemo(fn,deps){const at=index++;if(!cells[at]||!sameDeps(cells[at].deps,deps))cells[at]={value:fn(),deps};return cells[at].value;},useCallback(fn,deps){return hooks.useMemo(()=>fn,deps);},useEffect(fn,deps){const at=index++;if(!cells[at]||!sameDeps(cells[at].deps,deps)){const old=cells[at];cells[at]={deps};effects.push(()=>{old?.cleanup?.();cells[at].cleanup=fn();});}}};hooks.useLayoutEffect=hooks.useEffect;
  const jsx=(type,props,key)=>({type,props,key}),mocks={react:hooks,'react/jsx-runtime':{jsx,jsxs:jsx},...imports};
  const compiled=ts.transpileModule(fs.readFileSync(new URL(relative,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  class Element{}
  const doc={activeElement:null,addEventListener(){},removeEventListener(){},querySelectorAll:()=>[],getElementById:()=>null};
  const box={exports:{},require:name=>{assert.ok(name in mocks,`Unmocked ${name}`);return mocks[name];},JSON,crypto,structuredClone,console,TextDecoder,TextEncoder,document:doc,HTMLElement:Element,Node:Element,window:{confirm:()=>true,addEventListener(){},removeEventListener(){},location:{hash:''}},location:{reload(){}}};
  vm.runInNewContext(compiled+(internal?`\nexports.tested=${internal};`:''),box);const component=internal?box.exports.tested:box.exports.default;
  const s={get tree(){return tree;},get writesAfterUnmount(){return writesAfterUnmount;},get props(){return props;},update(next){props={...props,...next};},async settle(){for(let n=0;n<40;n++){if(!alive)return;index=0;dirty=false;tree=component(props);const queue=effects;effects=[];queue.forEach(f=>f());await tick();if(!dirty&&!effects.length)return;}throw Error('Unstable effects');},async until(predicate){for(let n=0;n<150;n++){await s.settle();if(predicate())return;await new Promise(r=>setTimeout(r,2));}throw Error(`Expected state: ${label(tree).slice(0,500)}`);},unmount(){cells.forEach(c=>c.cleanup?.());alive=false;}};return s;
}
function host({blank=false,cached,drafts=new Map(),serverState,role='owner',holdBase=false,holdReceipt=false}={}){
  const design=blank?questionnaire.newQuestionnaire():questionnaire.exampleQuestionnaire();
  const original={id:v1,projectId,revision:1,design,updatedAt:time};
  const state=serverState??{head:blank?null:original,versions:new Map(blank?[]:[[v1,{head:original,binding:null}]])};
  if(cached)drafts.set(`project:${projectId}`,cached);
  let owner=projectId,epoch=1,lastCache,pendingRead=[],bindingReads=0;
  const calls=[],reads=[],cacheEvents=[];
  const auth={session:{user:{id:projectId},mode:'local_test'},identityEpoch:1,isCurrentAccount:(id,e)=>id===owner&&e===epoch,getDraft:key=>drafts.get(key),cacheDraft:(key,value,changed,id)=>{if(id!==owner)return;drafts.set(key,value);if(key===`project:${projectId}`){lastCache=value;cacheEvents.push({value,changed});}},setUnsaved(){},mutate:(path,body)=>new Promise((resolve,reject)=>calls.push({path,body,resolve,reject}))};
  const safeContract={...contract,prepareTopicQuestionnaireMutation:(a,s,t)=>contract.prepareTopicQuestionnaireMutation(plain(a),plain(s),plain(t)),verifyTopicBindingReceipt:(raw,expected)=>contract.verifyTopicBindingReceipt(plain(raw),plain(expected))};
  const api={HostedApiError,errorMessage:e=>e.message,downloadQuestionnaire(){},hostedRequest:async(path,options)=>{
    reads.push({path,options});
    if(path.endsWith('/topic-binding')){
      bindingReads++;const id=path.split('/').at(-2),entry=state.versions.get(id);assert.ok(entry,id);
      const raw={versionId:id,binding:entry.binding,bindingHash:entry.binding?await core.topicQuestionnaireHash(entry.binding):null,designTransferHash:await core.topicQuestionnaireHash(entry.head.design)};
      if(holdBase&&bindingReads===2||holdReceipt&&calls.length&&id!==v1)return new Promise((resolve,reject)=>pendingRead.push({raw,resolve,reject}));
      return raw;
    }
    if(path.endsWith('/questionnaire'))return{questionnaire:state.head};
    if(path.endsWith('/questionnaire/versions'))return{versions:[...state.versions.values()].map(({head})=>({id:head.id,revision:head.revision,createdAt:time,createdBy:projectId,title:head.design.title})).sort((a,b)=>b.revision-a.revision),nextBeforeRevision:null};
    if(path.includes('/questionnaire/versions/')){const entry=state.versions.get(path.split('/').at(-1));assert.ok(entry,path);return{id:entry.head.id,revision:entry.head.revision,createdAt:time,createdBy:projectId,design:entry.head.design};}
    if(path==='/api/services')return{services:[]};
    if(path.endsWith('/proposals'))return{proposals:[]};
    return{project:{id:projectId,title:'合成集成项目',teamId:projectId,revision:1,createdAt:time},membershipRole:role};
  }};
  const s=mount('../components/hosted/HostedProject.tsx',{'next/link':{default:'a'},'next/dynamic':{default:()=> 'Dynamic'},'@evix/shared':shared,'@/lib/questionnaire-library':library,'@/lib/questionnaire-mapping':mapping,'@/components/topic-advisor/TopicQuestionnaireProposal':{default:'TopicPanel'},'@/lib/topic-questionnaire-api':safeContract,'./api-client':api,'./HostedFrame':{LoginRequired:'LoginRequired'},'./HostedSession':{useHostedSession:()=>auth},'./HostedMembers':{default:'HostedMembers'},'./silicon-runner':{serviceNames:()=>new Map(),createSiliconRunner:()=>null},'@/components/motion/useWorkspaceMotion':{useContentReveal:()=>null,useKeyedListMotion:()=>null}},{projectId},'ProjectEditor');
  const studio=()=>nodes(s.tree).find(n=>n.props?.hosted),panel=()=>nodes(s.tree).find(n=>n.type==='TopicPanel');
  return{screen:s,calls,reads,drafts,state,cacheEvents,get cache(){return lastCache;},get pendingRead(){return pendingRead;},studio,panel,
    async ready(){await s.until(()=>Boolean(studio())||role==='viewer'&&label(s.tree).includes('当前角色'));if(studio()&&!drafts.get(`project:${projectId}`)?.snapshot){const initial=studio().props.hosted;studio().props.onSnapshot({design:plain(initial.initialDesign),pending:false,topicBinding:plain(initial.initialBinding),topicRestoreOrigin:plain(initial.initialRestoreOrigin),editRevision:0});await s.settle();}},
    async open(src=source()){button(s,'选题与研究简报').props.onClick();await s.settle();const t=nodes(s.tree).find(n=>n.props?.onStartQuestionnaire);t.props.onSourceChange(src);t.props.onStartQuestionnaire(src.brief,src.version,src.decisionRevision);await s.settle();assert.ok(panel());},
    async application(ids=['brief:title']){const p=panel().props;return core.applyTopicQuestionnaire(await core.prepareTopicQuestionnaire(plain(p.source),plain(p.target),[],plain(p.binding)),plain(p.source),plain(p.target),ids,plain(p.binding));},
    apply(a){return panel().props.onApply(a).then(()=>({ok:true}),error=>({error}));},
    edit(title){const p=studio().props;p.hosted.onEdit();const current=lastCache.snapshot;p.onSnapshot({...current,design:{...current.design,title},editRevision:(current.editRevision??0)+1});},
    invalidate(){nodes(s.tree).find(n=>n.props?.onSourceChange).props.onSourceChange(null);},
    switchAccount(){owner='66666666-6666-4666-8666-666666666666';epoch++;},
    accept(binding,at=0){const call=calls[at],head={id:call.body.expectedRevision===0?v1:call.body.expectedRevision===1?v2:v3,projectId,revision:call.body.expectedRevision+1,design:plain(call.body.design),updatedAt:time};state.head=head;state.versions.set(head.id,{head,binding:plain(binding)});call.resolve(head);return head;},
    lose(binding,at=0){const call=calls[at],head={id:call.body.expectedRevision===0?v1:v2,projectId,revision:call.body.expectedRevision+1,design:plain(call.body.design),updatedAt:time};state.head=head;state.versions.set(head.id,{head,binding:plain(binding)});call.reject(Error('synthetic_lost_receipt'));return head;},
    async acknowledge(accepted=true){
      const p=studio().props,intent=p.hosted.load;assert.ok(intent);
      if(!accepted){p.hosted.onLoaded(intent.id,false);return;}
      // The production Studio emits the publication and acknowledgement in its own effect order.
      const current=lastCache.snapshot,e=makeStudio({initialDesign:current.design,binding:current.topicBinding??null,origin:current.topicRestoreOrigin??null,revisionNumber:current.editRevision??0});
      e.screen.update({onSnapshot:next=>{e.snapshots.push(next);p.onSnapshot(next);},hosted:{...e.screen.props.hosted,...p.hosted,cacheKey:'studio'}});
      await e.screen.settle();e.screen.unmount();await s.settle();
    },
  };
}

test('host saves selected fields and binding atomically, then commits through the existing editor bridge',async()=>{
  const h=host({holdReceipt:true});await h.ready();const original=h.cache.snapshot.design;await h.open();const a=await h.application(),done=h.apply(a);await h.screen.until(()=>h.calls.length===1);
  assert.equal(h.cache.pendingSave,h.calls[0].body,'the exact request is cached before dispatch');assert.equal(h.cache.snapshot.design.title,original.title);assert.equal(h.calls[0].body.topicBindingMutation.kind,'apply');assert.deepEqual(plain(h.calls[0].body.design.questions),original.questions);assert.equal(h.calls[0].body.design.objective,original.objective);
  h.accept(a.binding);await h.screen.until(()=>h.pendingRead.length===1);assert.equal(h.studio().props.hosted.load,undefined,'POST alone never commits editor content');assert.equal(h.cache.snapshot.topicBinding,null);h.pendingRead.shift().resolve(h.state.versions.get(v2)&&{versionId:v2,binding:a.binding,bindingHash:await core.topicQuestionnaireHash(a.binding),designTransferHash:await core.topicQuestionnaireHash(a.after)});
  await h.screen.until(()=>Boolean(h.studio().props.hosted.load));assert.equal(h.cache.pendingSave.idempotencyKey,h.calls[0].body.idempotencyKey,'pending nonce survives until editor acknowledgement');assert.equal(h.cache.topicReconciliation.versionId,v2);await h.acknowledge();await h.screen.settle();assert.deepEqual(await done,{ok:true});assert.equal(h.cache.pendingSave,null);assert.equal(h.cache.snapshot.design.title,a.after.title);assert.deepEqual(plain(h.cache.snapshot.topicBinding),a.binding);assert.equal(h.panel(),undefined);assert.ok(h.reads.filter(r=>r.path.endsWith('/topic-binding')).every(r=>r.options.maxBytes===2_100_000));h.screen.unmount();
});

test('source, target edits and account changes while verifying the base block a new dispatch',async()=>{
  for(const kind of ['source','target','account']){
    const h=host({holdBase:true});await h.ready();await h.open();const a=await h.application(),done=h.apply(a);await h.screen.until(()=>h.pendingRead.length===1);
    if(kind==='source')h.invalidate();if(kind==='target')h.edit('新的本地问卷');if(kind==='account')h.switchAccount();h.pendingRead.shift().resolve({versionId:v1,binding:null,bindingHash:null,designTransferHash:await core.topicQuestionnaireHash(a.before)});await h.screen.settle();assert.ok((await done).error);assert.equal(h.calls.length,0,kind);assert.equal(h.cache.snapshot.design.title,kind==='target'?'新的本地问卷':a.before.title);h.screen.unmount();
  }
});

test('late saved application preserves newer manual edits and retains a durable before-binding audit pointer',async()=>{
  const h=host({blank:true});await h.ready();await h.open();const a=await h.application(),done=h.apply(a);await h.screen.until(()=>h.calls.length===1);h.edit('等待保存时输入的中文');await h.screen.settle();h.accept(a.binding);await h.screen.until(()=>h.cache?.topicReconciliation&&h.cache.pendingSave===null);assert.ok((await done).error);assert.equal(h.cache.snapshot.design.title,'等待保存时输入的中文');assert.equal(h.studio().props.hosted.load,undefined);assert.equal(h.cache.topicReconciliation.versionId,v1);assert.equal(h.cache.topicReconciliation.beforeBinding,null);assert.equal(h.cache.conflict,true);h.screen.unmount();
});

test('lost receipt and remount replay the frozen application even when source confirmation is no longer loaded',async()=>{
  const h=host();await h.ready();await h.open();const a=await h.application(),done=h.apply(a);await h.screen.until(()=>h.calls.length===1);const original=JSON.stringify(h.calls[0].body);h.lose(a.binding);await h.screen.until(()=>h.cache?.saveUncertain);assert.ok((await done).error);h.screen.unmount();
  const r=host({drafts:h.drafts,serverState:h.state});await r.ready();button(r.screen,'核对并重试原保存').props.onClick();await r.screen.until(()=>r.calls.length===1);assert.equal(JSON.stringify(r.calls[0].body),original);r.accept(a.binding);await r.screen.until(()=>Boolean(r.studio().props.hosted.load));await r.acknowledge();await r.screen.until(()=>r.cache.pendingSave===null);assert.equal(r.cache.snapshot.design.title,a.after.title);assert.equal(r.cache.conflict,false);r.screen.unmount();
});

test('an owner awaiting or reconciling a committed-but-lost receipt retains real role and input facts',async()=>{
  const h=host();await h.ready();await h.open();const a=await h.application(),done=h.apply(a);await h.screen.until(()=>h.calls.length===1);const original=JSON.stringify(h.calls[0].body);let p=h.panel().props;assert.equal(p.writable,true);assert.equal(p.target.pending,false);assert.ok(p.disabledReason.includes('正在等待本次保存回执'));
  const head={id:v2,projectId,revision:2,design:plain(h.calls[0].body.design),updatedAt:time};h.state.head=head;h.state.versions.set(v2,{head,binding:a.binding});h.calls[0].reject(new HostedApiError(503,'synthetic_lost_receipt'));await h.screen.until(()=>h.cache.saveUncertain);assert.ok((await done).error);p=h.panel().props;assert.equal(p.writable,true);assert.equal(p.target.pending,false);assert.ok(p.disabledReason.includes('保存回执尚待核对'));assert.equal(p.target.revision,1);assert.deepEqual(plain(p.target.design),a.before);assert.deepEqual(plain(p.source),source());
  button(h.screen,'核对并重试原保存').props.onClick();await h.screen.until(()=>h.calls.length===2);assert.equal(JSON.stringify(h.calls[1].body),original);h.calls[1].resolve(head);await h.screen.until(()=>Boolean(h.studio().props.hosted.load));await h.acknowledge();await h.screen.until(()=>h.cache.pendingSave===null);assert.equal(h.cache.head.revision,2);h.screen.unmount();
});

test('remount during the editor acknowledgement retains the original request and the before-application origin',async()=>{
  const h=host({blank:true});await h.ready();await h.open();const a=await h.application(),done=h.apply(a);await h.screen.until(()=>h.calls.length===1);h.accept(a.binding);await h.screen.until(()=>Boolean(h.studio().props.hosted.load));assert.ok(h.cache.pendingSave);assert.equal(h.cache.topicReconciliation.versionId,v1);const original=JSON.stringify(h.cache.pendingSave);h.screen.unmount();await done;
  const r=host({blank:true,drafts:h.drafts,serverState:h.state});await r.ready();assert.equal(JSON.stringify(r.cache.pendingSave),original);button(r.screen,'核对并重试原保存').props.onClick();await r.screen.until(()=>r.calls.length===1);r.accept(a.binding);await r.screen.until(()=>Boolean(r.studio().props.hosted.load));await r.acknowledge();await r.screen.until(()=>r.cache.pendingSave===null);assert.equal(r.cache.snapshot.topicRestoreOrigin.questionnaireVersionId,v1);r.screen.unmount();
});

test('wrong sidecar metadata leaves the request unresolved and never reports a successful editor apply',async()=>{
  const h=host({holdReceipt:true});await h.ready();await h.open();const a=await h.application(),done=h.apply(a);await h.screen.until(()=>h.calls.length===1);h.accept(a.binding);await h.screen.until(()=>h.pendingRead.length===1);const pending=h.pendingRead.shift();pending.resolve({...pending.raw,bindingHash:'0'.repeat(64)});await h.screen.until(()=>h.cache?.saveUncertain);assert.ok((await done).error);assert.ok(h.cache.pendingSave);assert.equal(h.cache.snapshot.design.title,a.before.title);assert.equal(h.studio().props.hosted.load,undefined);h.screen.unmount();
});

test('saving a paired undo appends a new version with an explicit server-resolved restore origin',async()=>{
  const h=host();await h.ready();await h.open();const a=await h.application(),done=h.apply(a);await h.screen.until(()=>h.calls.length===1);h.accept(a.binding);await h.screen.until(()=>Boolean(h.studio().props.hosted.load));await h.acknowledge();await h.screen.settle();assert.deepEqual(await done,{ok:true});
  h.studio().props.hosted.onEdit();h.studio().props.onSnapshot({design:plain(a.before),pending:false,topicBinding:null,topicRestoreOrigin:{applicationVersionId:v2,phase:'before'},editRevision:2});await h.screen.settle();button(h.screen,'保存新版本').props.onClick();await h.screen.until(()=>h.calls.length===2);const request=h.calls[1].body;assert.equal(request.expectedRevision,2);assert.equal(request.topicBindingMutation.kind,'restore');assert.deepEqual(plain(request.topicBindingMutation.origin),{applicationVersionId:v2,phase:'before'});assert.equal(request.topicBindingMutation.expectedBindingHash,await core.topicQuestionnaireHash(a.binding));h.accept(null,1);await h.screen.until(()=>h.cache.head.revision===3&&h.cache.pendingSave===null);assert.equal(h.cache.headBinding,null);assert.equal(h.cache.snapshot.topicBinding,null);assert.deepEqual(h.state.versions.get(v2).binding,a.binding,'saved application remains immutable');h.screen.unmount();
});

test('history loads its verified binding beside content and requires explicit restore when saved again',async()=>{
  const h=host();await h.ready();await h.open();const a=await h.application(),done=h.apply(a);await h.screen.until(()=>h.calls.length===1);h.accept(a.binding);await h.screen.until(()=>Boolean(h.studio().props.hosted.load));await h.acknowledge();await h.screen.settle();await done;
  const row=nodes(h.screen.tree).find(n=>n.key===v1&&n.type==='div');assert.ok(row);nodes(row).find(n=>n.type==='button'&&label(n)==='载入编辑器').props.onClick();await h.screen.until(()=>Boolean(h.studio().props.hosted.load));const intent=h.studio().props.hosted.load;assert.equal(intent.topicBinding,null);assert.deepEqual(plain(intent.topicRestoreOrigin),{questionnaireVersionId:v1});assert.deepEqual(plain(intent.design),a.before);await h.acknowledge();await h.screen.settle();button(h.screen,'保存新版本').props.onClick();await h.screen.until(()=>h.calls.length===2);assert.deepEqual(plain(h.calls[1].body.topicBindingMutation.origin),{questionnaireVersionId:v1});h.accept(null,1);await h.screen.until(()=>h.cache.pendingSave===null);assert.equal(h.cache.head.revision,3);h.screen.unmount();
});

test('readonly handoff and retained callbacks after project switch cannot dispatch an application',async()=>{
  const read=host({role:'viewer'});await read.ready();button(read.screen,'选题与研究简报').props.onClick();await read.screen.settle();const node=nodes(read.screen.tree).find(n=>n.props?.onStartQuestionnaire),src=source();node.props.onSourceChange(src);node.props.onStartQuestionnaire(src.brief,src.version,src.decisionRevision);await read.screen.settle();assert.equal(read.panel(),undefined);assert.equal(read.calls.length,0);read.screen.unmount();
  const h=host({holdBase:true});await h.ready();await h.open();const a=await h.application(),done=h.apply(a);await h.screen.until(()=>h.pendingRead.length===1);h.screen.update({projectId:'66666666-6666-4666-8666-666666666666'});await h.screen.settle();h.pendingRead.shift().resolve({versionId:v1,binding:null,bindingHash:null,designTransferHash:await core.topicQuestionnaireHash(a.before)});await h.screen.settle();assert.ok((await done).error);assert.equal(h.calls.length,0);h.screen.unmount();
});

function makeStudio({blank=false,initialDesign,binding=null,origin={questionnaireVersionId:v1},revisionNumber=0}={}){
  const design=initialDesign??(blank?questionnaire.newQuestionnaire():questionnaire.exampleQuestionnaire()),snapshots=[],drafts=new Map(),changes=[];
  drafts.set('studio',{history:revision.initialRevisionHistory(design,binding,origin),numericDrafts:{},activeId:design.questions[0]?.id??'',editRevision:revisionNumber});
  const props={localOnly:true,hosted:{initialDesign:design,initialBinding:binding,initialRestoreOrigin:origin,writable:true,cacheKey:'studio',savedFingerprint:library.parseQuestionnaireLibraryContent(design).serialized,savedBinding:binding,onLoaded(){}},onSnapshot:s=>snapshots.push(s)};
  const s=mount('../components/design/QuestionnaireStudio.tsx',{'@/lib/questionnaire':questionnaire,'./QuestionnaireStudio.module.css':{default:{}},'./QuestionBlocks':{default:'QuestionBlocks'},'./QuestionnairePlatformExport':{default:'PlatformExport'},'../research/ResearchMaterialLibrary':{default:'MaterialLibrary'},'@/lib/research-materials':{appendMaterialQuestionGroup(){}},'@/lib/questionnaire-mapping':mapping,'./DiagnosisBriefProposal':{default:'DiagnosisProposal'},'./QuestionnaireLibrary':{default:'QuestionnaireLibrary'},'@/lib/questionnaire-library':library,'@/lib/questionnaire-revision':revision,'../hosted/HostedSession':{useHostedSession:()=>({session:{user:{id:projectId}},getDraft:key=>drafts.get(key),cacheDraft:(key,value,changed)=>{drafts.set(key,value);changes.push(changed);},setUnsaved(){}})},'@/components/motion/useWorkspaceMotion':{useContentReveal:()=>null,useKeyedListMotion:()=>null}},props);
  return{screen:s,design,snapshots,drafts,changes,get snapshot(){return snapshots.at(-1);},load(intent){s.update({hosted:{...s.props.hosted,load:intent}});}};
}

test('same editor applies content and binding in one undo step; ordinary edits, redo and cache preserve the pair',async()=>{
  const s=makeStudio();await s.screen.settle();const src=source(),target={design:s.design,pending:false,versionId:v1,revision:1},a=await core.applyTopicQuestionnaire(await core.prepareTopicQuestionnaire(src,target),src,target,['brief:title']);
  s.load({id:'apply-one',design:a.after,topicBinding:a.binding,topicRestoreOrigin:{questionnaireVersionId:v2},applicationVersionId:v2,expectedEditRevision:0,expectedBefore:mapping.canonical({design:a.before,binding:null})});await s.screen.settle();assert.equal(s.snapshot.design.title,a.after.title);assert.deepEqual(plain(s.snapshot.topicBinding),a.binding);assert.equal(s.drafts.get('studio').history.past.length,1);
  button(s.screen,'撤销').props.onClick();await s.screen.settle();assert.equal(s.snapshot.design.title,a.before.title);assert.equal(s.snapshot.topicBinding,null);assert.deepEqual(plain(s.snapshot.topicRestoreOrigin),{applicationVersionId:v2,phase:'before'});button(s.screen,'重做').props.onClick();await s.screen.settle();assert.equal(s.snapshot.design.title,a.after.title);assert.deepEqual(plain(s.snapshot.topicBinding),a.binding);
  const title=nodes(s.screen.tree).find(n=>n.props?.['data-brief-field']==='title');assert.ok(title);title.props.onChange({target:{value:'手工继续修改'}});await s.screen.settle();assert.equal(s.snapshot.design.title,'手工继续修改');assert.deepEqual(plain(s.snapshot.topicBinding),a.binding);assert.deepEqual(plain(s.snapshot.topicRestoreOrigin),{questionnaireVersionId:v2});s.screen.unmount();
});

test('Studio refuses a retained load after edit or composition and a readonly handler cannot change the content',async()=>{
  for(const kind of ['edit','composition','readonly']){
    const s=makeStudio();await s.screen.settle();const before=s.snapshot;
    if(kind==='edit')nodes(s.screen.tree).find(n=>n.props?.['data-brief-field']==='title').props.onChange({target:{value:'保留新编辑'}});
    if(kind==='composition')nodes(s.screen.tree).find(n=>n.props?.['aria-label']==='问卷设计工作台').props.onCompositionStart();
    if(kind==='readonly')s.screen.update({hosted:{...s.screen.props.hosted,writable:false}});
    await s.screen.settle();const acknowledgements=[];s.screen.update({hosted:{...s.screen.props.hosted,onLoaded:(...args)=>acknowledgements.push(args),load:{id:'stale-load',design:{...before.design,title:'不应载入'},topicBinding:null,expectedEditRevision:before.editRevision}}});await s.screen.settle();assert.equal(acknowledgements[0][1],false);assert.notEqual(s.snapshot.design.title,'不应载入');assert.equal(s.snapshot.topicBinding,null);s.screen.unmount();
  }
});

test('untouched initial baseline is clean in Studio cache while a real edit is marked unsaved',async()=>{
  const s=makeStudio();await s.screen.settle();assert.equal(s.changes.at(-1),false);nodes(s.screen.tree).find(n=>n.props?.['data-brief-field']==='title').props.onChange({target:{value:'真实修改'}});await s.screen.settle();assert.equal(s.changes.at(-1),true);s.screen.unmount();
  const h=host({blank:true});await h.ready();assert.equal(h.studio().props.hosted.savedFingerprint,library.parseQuestionnaireLibraryContent(h.cache.initial).serialized,'an empty cloud head still passes the actual initial baseline');h.screen.unmount();
});

test('multiple unsaved edits before the first application can undo two or three steps and save a new restored version',async()=>{
  for(const depth of [2,3]){
    const h=host({blank:true});await h.ready();const s=makeStudio({blank:true,origin:null});
    s.screen.update({onSnapshot:next=>{s.snapshots.push(next);h.studio().props.onSnapshot(next);},hosted:{...s.screen.props.hosted,onEdit:()=>h.studio().props.hosted.onEdit(),onLoaded:(...args)=>h.studio().props.hosted.onLoaded(...args)}});await s.screen.settle();await h.screen.settle();
    const title=()=>nodes(s.screen.tree).find(n=>n.props?.['data-brief-field']==='title');
    title().props.onChange({target:{value:'manual-one'}});await s.screen.settle();title().props.onChange({target:{value:'manual-two'}});await s.screen.settle();await h.screen.settle();await h.open();const a=await h.application(),done=h.apply(a);await h.screen.until(()=>h.calls.length===1);h.accept(a.binding);await h.screen.until(()=>Boolean(h.studio().props.hosted.load));s.load(h.studio().props.hosted.load);await s.screen.settle();await h.screen.settle();assert.deepEqual(await done,{ok:true});
    for(let i=0;i<depth;i++){button(s.screen,'撤销').props.onClick();await s.screen.settle();await h.screen.settle();}
    const expected=depth===2?'manual-one':s.design.title;assert.equal(s.snapshot.design.title,expected);assert.equal(s.snapshot.topicBinding,null);assert.deepEqual(plain(s.snapshot.topicRestoreOrigin),{applicationVersionId:v1,phase:'before'});assert.equal(h.cache.snapshot.design.title,expected);
    button(h.screen,'保存新版本').props.onClick();await h.screen.until(()=>h.calls.length===2);const request=h.calls[1].body;assert.equal(request.expectedRevision,1);assert.deepEqual(plain(request.topicBindingMutation.origin),{applicationVersionId:v1,phase:'before'});assert.equal(request.design.title,expected);h.accept(null,1);await h.screen.until(()=>h.cache.head.revision===2&&h.cache.pendingSave===null);assert.equal(h.cache.headBinding,null);assert.equal(h.state.versions.get(v1).head.design.title,'待核查的社区服务研究 🧭');assert.equal(h.state.versions.size,2);s.screen.unmount();h.screen.unmount();
  }
});

test('before-audit propagation preserves different bindings and existing historical origins',async()=>{
  const design=questionnaire.newQuestionnaire(),src=source(),target={design,pending:false,versionId:null,revision:0},a=await core.applyTopicQuestionnaire(await core.prepareTopicQuestionnaire(src,target),src,target,['brief:title']);
  const different=revision.revisionSnapshot({...design,title:'different binding'},null,a.binding,null),known=revision.revisionSnapshot({...design,title:'known origin'},null,null,{questionnaireVersionId:v2}),matching=revision.revisionSnapshot({...design,title:'unsaved matching binding'}),present=revision.revisionSnapshot({...design,title:'latest unsaved'});
  const old={past:[different,known,matching],present,future:[]},next=revision.commitTopicQuestionnaireRevision(old,a.after,a.binding,v1);
  assert.deepEqual(next.past[0],different);assert.equal(next.past[0].topicRestoreOrigin,null);assert.deepEqual(next.past[1],known);assert.deepEqual(next.past[2].content,matching.content);assert.equal(next.past[2].topicBinding,null);assert.equal(next.past[2].repairOrigin,matching.repairOrigin);assert.deepEqual(next.past[2].topicRestoreOrigin,{applicationVersionId:v1,phase:'before'});assert.equal(old.past[2].topicRestoreOrigin,null,'caller history remains untouched');
});

test('positive Studio acknowledgement observes the already-published paired snapshot and history cache',async()=>{
  const s=makeStudio({blank:true,origin:null});await s.screen.settle();const src=source(),target={design:s.design,pending:false,versionId:null,revision:0},a=await core.applyTopicQuestionnaire(await core.prepareTopicQuestionnaire(src,target),src,target,['brief:title']),acknowledged=[];
  s.screen.update({hosted:{...s.screen.props.hosted,onLoaded:(id,accepted)=>{acknowledged.push({id,accepted,published:plain(s.snapshot),cached:plain(s.drafts.get('studio'))});},load:{id:'paired-publication',design:a.after,topicBinding:a.binding,topicRestoreOrigin:{questionnaireVersionId:v1},applicationVersionId:v1,expectedEditRevision:0}}});await s.screen.settle();assert.equal(acknowledged.length,1);const ack=acknowledged[0];assert.equal(ack.accepted,true);assert.equal(ack.published.design.title,a.after.title);assert.deepEqual(ack.published.topicBinding,a.binding);assert.deepEqual(ack.published.topicRestoreOrigin,{questionnaireVersionId:v1});assert.equal(ack.cached.history.present.content.title,a.after.title);assert.deepEqual(ack.cached.history.present.topicBinding,a.binding);assert.equal(ack.cached.history.past.length,1);assert.equal(ack.cached.editRevision,ack.published.editRevision);s.screen.unmount();
});

test('an acknowledgement without paired publication cannot clear the frozen request or recovery audit pointer',async()=>{
  const h=host({blank:true});await h.ready();await h.open();const a=await h.application(),done=h.apply(a);await h.screen.until(()=>h.calls.length===1);h.accept(a.binding);await h.screen.until(()=>Boolean(h.studio().props.hosted.load));const bridge=h.studio().props.hosted;bridge.onLoaded(bridge.load.id,true);await h.screen.settle();assert.ok((await done).error);assert.ok(h.cache.pendingSave);assert.equal(h.cache.pendingSave.idempotencyKey,h.calls[0].body.idempotencyKey);assert.equal(h.cache.topicReconciliation.versionId,v1);assert.equal(h.cache.snapshot.topicBinding,null);assert.equal(h.cache.snapshot.design.title,a.before.title);assert.equal(h.cache.saveUncertain,true);h.screen.unmount();
});
