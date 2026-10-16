import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as project from '../lib/topic-project.ts';
import * as topic from '../lib/topic-advisor/index.ts';
import {parseTopicBundle} from '../lib/topic-advisor/parse.ts';
import * as geography from '../lib/topic-advisor/geography.ts';

// Production handlers and effects; this harness does not prove native focus/IME/layout.
const ts=createRequire(import.meta.url)('typescript');
const source=fs.readFileSync(new URL('../components/hosted/HostedTopic.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const json=name=>JSON.parse(fs.readFileSync(new URL(`../content/topic-advisor/${name}.json`,import.meta.url),'utf8'));
const bundle=parseTopicBundle({catalog:json('catalog'),sources:json('sources'),model:json('ranker'),events:json('hotspot-events')});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const sameDeps=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
const plain=v=>JSON.parse(JSON.stringify(v));
class HostedApiError extends Error{constructor(status,code='rejected'){super(code);this.status=status;this.code=code;}}
const nodes=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
const label=node=>node==null?'':Array.isArray(node)?node.map(label).join(''):typeof node==='object'?label(node.props?.children):String(node);
function field(s,name){const node=nodes(s.tree).find(v=>v.props?.['aria-label']===name);assert.ok(node,name);return node;}
function button(s,name){const node=nodes(s.tree).find(v=>v.type==='button'&&label(v)===name);assert.ok(node,`Button ${name}`);return node;}
const initial=()=>({head:null,document:null,decision:{revision:0,status:'draft',versionId:null,contentHash:null},canEdit:true});
function make({owner='account-a',projectId='project-a',drafts=new Map(),server=initial(),canEdit=true,onStartQuestionnaire,onSourceChange}={}){
  let ownerNow=owner,epoch=1,alive=true,cells=[],index=0,effects=[],dirty=true,tree,props={projectId,canEdit,onStartQuestionnaire,onSourceChange},state=structuredClone(server);
  const calls=[],reads=[],unsaved=new Map(),confirmations=[];let writesAfterUnmount=0,confirmChoice=true;
  const auth={session:{user:{id:owner}},identityEpoch:1,getDraft:key=>drafts.get(key),cacheDraft:(key,value,_changed,id)=>{if(id===ownerNow)drafts.set(key,value);},setUnsaved:(key,value)=>unsaved.set(key,value),isCurrentAccount:(id,captured)=>id===ownerNow&&captured===epoch,mutate:(path,body)=>new Promise((resolve,reject)=>calls.push({path,body:plain(body),resolve,reject}))};
  const hooks={
    useState(initial){const at=index++;if(!cells[at])cells[at]={value:typeof initial==='function'?initial():initial};return[cells[at].value,value=>{if(!alive)writesAfterUnmount++;const next=typeof value==='function'?value(cells[at].value):value;if(!Object.is(next,cells[at].value)){cells[at].value=next;dirty=true;}}];},
    useRef(initial){const at=index++;return cells[at]??={current:initial};},
    useCallback(fn,deps){const at=index++;if(!cells[at]||!sameDeps(cells[at].deps,deps))cells[at]={deps,fn};return cells[at].fn;},
    useEffect(fn,deps){const at=index++;if(!cells[at]||!sameDeps(cells[at].deps,deps)){const old=cells[at];cells[at]={deps};effects.push(()=>{old?.cleanup?.();cells[at].cleanup=fn();});}},
  };hooks.useLayoutEffect=hooks.useEffect;
  const jsx=(type,props,key)=>({type,props,key});
  const guarded={...project};for(const name of ['parseTopicHead','parseTopicHistory','parseTopicProjectDocument','parseTopicVersionResponse','parseTopicDecision'])guarded[name]=value=>project[name](plain(value));
  guarded.prepareTopicSave=(value,revision,key)=>project.prepareTopicSave(plain(value),revision,key);guarded.topicDocumentsEqual=(a,b)=>project.topicDocumentsEqual(plain(a),plain(b));
  guarded.withTopicProfile=(value,profile)=>project.withTopicProfile(plain(value),plain(profile));
  const imports={react:hooks,'react/jsx-runtime':{jsx,jsxs:jsx},'../topic-advisor/TopicAdvisor':{default:'TopicAdvisor'},'./HostedSession':{useHostedSession:()=>auth},'../workbench/shell-kit':{useWorkbenchTheme:()=> 'light'},'@/lib/topic-advisor/client-bundle':{TOPIC_BUNDLE:bundle},'@/lib/topic-advisor':topic,'@/lib/topic-project':guarded,'@/lib/topic-advisor/geography':{...geography,profileRegionStatus:value=>geography.profileRegionStatus(plain(value))},'./HostedTopic.module.css':{default:{}},'./api-client':{HostedApiError,errorMessage:e=>e.message,hostedRequest:async path=>{reads.push(path);if(path.includes('/versions?'))return{versions:state.head?[state.head]:[],nextBefore:null};if(path.includes('/versions/'))return{version:state.head,document:state.document,decision:state.decision};return structuredClone(state);}}};
  const box={exports:{},require:name=>{assert.ok(name in imports,`Unexpected import ${name}`);return imports[name];},JSON,Date,Intl,crypto,structuredClone,TextEncoder,console,HTMLElement:class {},document:{activeElement:null},window:{confirm:message=>{confirmations.push(message);return confirmChoice;}},setTimeout};vm.runInNewContext(compiled,box);
  const s={
    async settle(){for(let n=0;n<40;n++){index=0;dirty=false;tree=box.exports.default(props);const queue=effects;effects=[];queue.forEach(fn=>fn());await tick();if(!dirty&&!effects.length)return;}throw Error('Unstable effects');},
    async until(predicate){for(let n=0;n<80;n++){await s.settle();if(predicate())return;await tick();}throw Error('Expected state did not arrive');},
    get tree(){return tree;},calls,reads,drafts,unsaved,confirmations,get writesAfterUnmount(){return writesAfterUnmount;},get server(){return state;},set server(value){state=structuredClone(value);},set confirm(value){confirmChoice=value;},
    change(name,value){field(s,name).props.onChange({target:{value}});},
    update(patch){props={...props,...patch};},switchAccount(id){ownerNow=id;epoch++;},
    workspace(patch){const node=nodes(tree).find(v=>v.type==='TopicAdvisor');node.props.onWorkspaceChange({...node.props.initialWorkspace,...patch});},
    choosePattern(item){const node=nodes(tree).find(v=>v.type==='TopicAdvisor');node.props.onChooseRecommendation(item,node.props.initialWorkspace.profile);},
    chooseCandidate(candidate,evaluation){nodes(tree).find(v=>v.type==='TopicAdvisor').props.onChooseCandidate(candidate,evaluation);},
    resolveSave(at){const c=calls[at],revision=c.body.expectedRevision+1;const version={id:`version-${revision}`,revision,contentHash:String(revision).repeat(64).slice(0,64),createdAt:'2026-10-15T08:00:00Z',createdBy:owner};state={head:version,document:structuredClone(c.body.document),decision:{...state.decision,status:'draft',versionId:null,contentHash:null},canEdit:true};c.resolve({version,document:state.document,decision:state.decision});},
    resolveDecision(at,currentDecision=null){const c=calls[at],receipt={revision:c.body.expectedDecisionRevision+1,status:c.body.action==='confirm'?'confirmed':'revoked',versionId:c.body.versionId,contentHash:c.body.contentHash};state.decision=currentDecision??receipt;c.resolve({decision:receipt});},
    unmount(){alive=false;cells.forEach(c=>c.cleanup?.());},
  };return s;
}
async function editBrief(s,title='研究题目'){await s.settle();s.change('研究题目',title);await s.settle();}

test('profile, shortlist and brief edits become one project-scoped draft',async()=>{
  const s=make();await editBrief(s,'未保存中文题目');const workspace=nodes(s.tree).find(n=>n.type==='TopicAdvisor').props.initialWorkspace;s.workspace({profile:{...workspace.profile,city:'武汉'},shortlistIds:['p1','p2']});await s.settle();const c=[...s.drafts.values()][0];assert.equal(c.document.brief.title,'未保存中文题目');assert.equal(c.document.profile.city,'武汉');assert.deepEqual(plain(c.document.shortlistIds),['p1','p2']);assert.ok([...s.drafts.keys()][0].includes('project-a'));s.unmount();
});
test('county selection upgrades the project envelope without discarding handwritten questions and survives a real save receipt',async()=>{
  const s=make();await editBrief(s,'不能丢弃的研究简报');button(s,'＋ 添加问题').props.onClick();await s.settle();s.change('研究问题 1','手写研究问题');await s.settle();
  const before=[...s.drafts.values()][0].document,ref={code:'420111',catalogVersion:topic.TOPIC_REGION_CATALOG.catalogVersion};s.workspace({profile:{...before.profile,schemaVersion:2,regionRef:ref,region:'湖北省',city:'武汉市'}});await s.settle();const draft=[...s.drafts.values()][0].document;assert.equal(draft.schemaVersion,2);assert.equal(draft.brief.title,before.brief.title);assert.deepEqual(plain(draft.brief.questions),plain(before.brief.questions));button(s,'保存新版本').props.onClick();await s.settle();assert.equal(s.calls[0].body.document.schemaVersion,2);assert.deepEqual(s.calls[0].body.document.profile.regionRef,ref);s.resolveSave(0);await s.until(()=>label(s.tree).includes('已保存 · v1'));s.unmount();
  const restored=make({server:s.server});await restored.settle();assert.equal(field(restored,'研究题目').props.value,'不能丢弃的研究简报');const workspace=nodes(restored.tree).find(n=>n.type==='TopicAdvisor').props.initialWorkspace;assert.deepEqual(plain(workspace.profile.regionRef),ref);assert.equal(field(restored,'研究问题 1').props.value,'手写研究问题');restored.unmount();
});
test('unknown save is frozen, remount restores it and retry uses the same request',async()=>{
  const s=make();await editBrief(s,'第一次保存');button(s,'保存新版本').props.onClick();await s.settle();assert.equal(s.calls.length,1);const first=JSON.stringify(s.calls[0].body);s.calls[0].reject(Error('offline'));await s.until(()=>label(s.tree).includes('offline'));s.change('研究题目','保存之后的新编辑');await s.settle();s.unmount();
  const restored=make({drafts:s.drafts});await restored.settle();assert.equal(field(restored,'研究题目').props.value,'保存之后的新编辑');button(restored,'核对并重试原保存').props.onClick();await restored.settle();assert.equal(JSON.stringify(restored.calls[0].body),first);restored.resolveSave(0);await restored.until(()=>label(restored.tree).includes('已保存 · v1'));assert.equal(field(restored,'研究题目').props.value,'保存之后的新编辑');assert.ok(label(restored.tree).includes('有未保存修改'));restored.unmount();
});
test('confirmation binds the exact saved version and further editing disables handoff',async()=>{
  const s=make();await editBrief(s);for(const [name,value]of[['决策对象','社区负责人'],['要支持的决定','先改善哪些服务'],['研究人群','居民'],['研究地域','武汉']])s.change(name,value);button(s,'＋ 添加问题').props.onClick();await s.settle();s.change('研究问题 1','哪些服务需要优先改进？');await s.settle();assert.equal(button(s,'确认当前版本').props.disabled,true);button(s,'保存新版本').props.onClick();await s.settle();s.resolveSave(0);await s.until(()=>button(s,'确认当前版本').props.disabled===false);button(s,'确认当前版本').props.onClick();await s.settle();assert.equal(s.calls[1].body.versionId,'version-1');assert.equal(s.calls[1].body.contentHash,'1'.repeat(64));s.resolveDecision(1);await s.until(()=>label(s.tree).includes('已确认 v1'));s.change('研究题目','再次编辑');await s.settle();assert.equal(button(s,'确认当前版本').props.disabled,true);s.unmount();
});
test('same account different projects and different accounts never restore another draft',async()=>{
  const a=make();await editBrief(a,'仅项目A');a.unmount();for(const options of[{projectId:'project-b'},{owner:'account-b'}]){const b=make({...options,drafts:a.drafts});await b.settle();assert.equal(field(b,'研究题目').props.value,'');b.unmount();}
});
test('late save after account switch, project switch, revocation or unmount cannot apply',async()=>{
  for(const kind of['account','project','revoke','unmount']){const s=make();await editBrief(s);button(s,'保存新版本').props.onClick();await s.settle();if(kind==='account')s.switchAccount('account-b');if(kind==='project')s.update({projectId:'project-b'});if(kind==='revoke')s.update({canEdit:false});if(kind==='unmount')s.unmount();else await s.settle();s.resolveSave(0);await tick();if(kind!=='unmount')await s.settle();assert.equal(s.writesAfterUnmount,0);assert.ok(!label(s.tree).includes('研究简报已保存 · v1'));if(kind!=='unmount')s.unmount();}
});
test('read-only handler calls cannot mutate or send writes',async()=>{
  const s=make({canEdit:false,server:{...initial(),canEdit:false}});await s.settle();s.change('研究题目','越权修改');button(s,'保存新版本').props.onClick();await s.settle();assert.equal(field(s,'研究题目').props.value,'');assert.equal(s.calls.length,0);s.unmount();
});
test('version conflict preserves edited text and requires explicit load',async()=>{
  const s=make();await editBrief(s,'冲突草稿');button(s,'保存新版本').props.onClick();await s.settle();s.calls[0].reject(new HostedApiError(409,'revision_conflict'));await s.until(()=>label(s.tree).includes('revision_conflict'));assert.equal(field(s,'研究题目').props.value,'冲突草稿');button(s,'核对云端版本').props.onClick();await s.settle();assert.equal(field(s,'研究题目').props.value,'冲突草稿');button(s,'取消').props.onClick();await s.settle();assert.equal(field(s,'研究题目').props.value,'冲突草稿');s.unmount();
});
function readyServer(){const document=project.emptyTopicProject('2026-10-15');Object.assign(document.brief,{title:'已保存研究',decisionOwner:'社区负责人',decision:'改进服务',population:'居民',geography:'武汉',questions:[{id:'rq-1',text:'如何改善服务？'}]});return{head:{id:'version-1',revision:1,contentHash:'1'.repeat(64),createdAt:'2026-10-15T08:00:00Z',createdBy:'account-a'},document,decision:{revision:0,status:'draft',versionId:null,contentHash:null},canEdit:true};}
test('replayed confirmation is reconciled with a newer revocation before enabling the confirmed view',async()=>{
  const s=make({server:readyServer()});await s.settle();button(s,'确认当前版本').props.onClick();await s.settle();s.calls[0].reject(Error('receipt_lost'));await s.until(()=>label(s.tree).includes('receipt_lost'));const original=JSON.stringify(s.calls[0].body);
  button(s,'核对原确认操作').props.onClick();await s.settle();assert.equal(JSON.stringify(s.calls[1].body),original);s.resolveDecision(1,{revision:2,status:'revoked',versionId:'version-1',contentHash:'1'.repeat(64)});await s.until(()=>label(s.tree).includes('当前确认状态已由其他编辑更新'));
  assert.ok(!label(s.tree).includes('研究方向已确认'));assert.equal(button(s,'确认当前版本').props.disabled,false);s.unmount();
});
test('pending decision can be reconciled after remount even when the cloud head advanced',async()=>{
  const a=make({server:readyServer()});await a.settle();button(a,'确认当前版本').props.onClick();await a.settle();const original=JSON.stringify(a.calls[0].body);a.calls[0].reject(Error('receipt_lost'));await a.until(()=>label(a.tree).includes('receipt_lost'));a.unmount();
  const newer=readyServer();newer.head={...newer.head,id:'version-2',revision:2,contentHash:'2'.repeat(64)};newer.document.brief.title='其他编辑的新版本';newer.decision={revision:1,status:'draft',versionId:null,contentHash:null};
  const b=make({drafts:a.drafts,server:newer});await b.settle();assert.ok(label(b.tree).includes('操作结果待核对'));button(b,'核对原确认操作').props.onClick();await b.settle();assert.equal(b.calls.length,1);assert.equal(JSON.stringify(b.calls[0].body),original);b.resolveDecision(0,{revision:1,status:'draft',versionId:null,contentHash:null});await b.until(()=>label(b.tree).includes('云端研究简报已有新版本'));assert.equal(field(b,'研究题目').props.value,'已保存研究');button(b,'核对云端版本').props.onClick();await b.settle();assert.equal(button(b,'确认载入').props.disabled,false);b.unmount();
});
test('adoption asks before replacing handwritten questions or verification even if the title is blank',async()=>{
  for(const content of['question','verification']){const server=readyServer();server.document.brief.title='';if(content==='verification'){server.document.brief.questions=[];server.document.verification=[{id:'t',title:'我的记录',status:'inconclusive',note:'渠道尚未确认',sourceRefs:[],recordedAt:null}];}const s=make({server});await s.settle();s.confirm=false;const item=topic.recommendTopics(server.document.profile,bundle,6).items[0];s.choosePattern(item);await s.settle();assert.equal(s.confirmations.length,1);assert.equal(field(s,'研究题目').props.value,'');const candidate={...structuredClone(topic.EMPTY_TOPIC_CANDIDATE),title:'新题目'};s.chooseCandidate(candidate,topic.evaluateCandidate(candidate,server.document.profile,bundle));await s.settle();assert.equal(s.confirmations.length,2);assert.equal(field(s,'研究题目').props.value,'');s.unmount();}
});
test('a wrong save receipt leaves the exact pending request unresolved instead of reporting success',async()=>{
  const s=make();await editBrief(s,'我的保存');button(s,'保存新版本').props.onClick();await s.settle();const fake=readyServer();s.calls[0].resolve({version:fake.head,document:fake.document,decision:fake.decision});await s.until(()=>label(s.tree).includes('保存回执与本次提交不一致'));assert.equal(field(s,'研究题目').props.value,'我的保存');assert.ok(button(s,'核对并重试原保存'));s.unmount();
});
test('an overlong interest cannot discard unrelated handwritten brief content on remount',async()=>{
  const a=make();await editBrief(a,'必须保留的手写简报');const workspace=nodes(a.tree).find(n=>n.type==='TopicAdvisor').props.initialWorkspace;a.workspace({profile:{...workspace.profile,interests:['兴'.repeat(61)]}});await a.settle();a.unmount();const b=make({drafts:a.drafts});await b.settle();assert.equal(field(b,'研究题目').props.value,'必须保留的手写简报');assert.equal(nodes(b.tree).find(n=>n.type==='TopicAdvisor').props.initialWorkspace.profile.interests[0].length,61);button(b,'保存新版本').props.onClick();await b.until(()=>label(b.tree).includes('兴趣'));assert.equal(b.calls.length,0);assert.equal(field(b,'研究题目').props.value,'必须保留的手写简报');b.unmount();
});

test('confirmed handoff reports the current decision revision and immediately invalidates on edit, revoke and IME',async()=>{
  for(const action of ['edit','revoke','composition']){
    const server=readyServer();server.decision={revision:7,status:'confirmed',versionId:server.head.id,contentHash:server.head.contentHash};
    // Confirmation is source identity, not a claim that every additional source field has been validated.
    server.document.brief.questions.push({id:'blank-rq',text:''});
    const handed=[],changes=[],s=make({server,onStartQuestionnaire:(...args)=>handed.push(plain(args)),onSourceChange:source=>changes.push(source?plain(source):null)});
    await s.settle();const handoff=button(s,'带入问卷设计 →');assert.equal(handoff.props.disabled,false);handoff.props.onClick();assert.equal(handed.length,1);assert.equal(handed[0][2],7);assert.equal(changes.at(-1).decisionRevision,7);
    if(action==='edit')s.change('研究题目','本地新题目');
    if(action==='revoke')button(s,'撤回确认').props.onClick();
    if(action==='composition')nodes(s.tree).find(n=>n.props?.['aria-label']==='项目选题工作区').props.onCompositionStart({target:{dataset:{}}});
    assert.equal(changes.at(-1),null,`${action} must invalidate before effects settle`);handoff.props.onClick();assert.equal(handed.length,1,'a retained enabled handoff cannot reuse the old source');
    await s.settle();s.unmount();
  }
});

test('historically confirmed stale geography is readable but does not emit an executable questionnaire source',async()=>{
  const server=readyServer();server.document=project.withTopicProfile(server.document,{...server.document.profile,schemaVersion:2,regionRef:{code:'420100',catalogVersion:'cn-admin-1999-01-01'}});server.decision={revision:3,status:'confirmed',versionId:server.head.id,contentHash:server.head.contentHash};
  const sources=[],handed=[],s=make({server,onSourceChange:value=>sources.push(value),onStartQuestionnaire:(...args)=>handed.push(args)});await s.settle();assert.ok(label(s.tree).includes('已确认 v1'));assert.ok(label(s.tree).includes('请重新选择并确认地区后使用研究简报'));assert.equal(button(s,'带入问卷设计 →').props.disabled,true);button(s,'带入问卷设计 →').props.onClick();assert.equal(handed.length,0);assert.ok(sources.every(v=>v===null));s.unmount();
});
