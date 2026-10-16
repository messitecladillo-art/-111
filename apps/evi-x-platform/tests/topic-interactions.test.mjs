import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import * as shared from '../../../packages/evi-x-shared/src/index.ts';
import * as proposal from '../lib/topic-proposal.ts';
import {parseTopicProfile, stableStringify} from '../lib/topic-advisor/parse.ts';

// Execute production handlers/effects without browser access. These are lifecycle
// tests, not evidence of layout, focus, IME, hydration or a live provider call.
const ts=createRequire(import.meta.url)('typescript');
const compiled=ts.transpileModule(fs.readFileSync(new URL('../components/topic-advisor/TopicModelProposal.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const sameDeps=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
const service={id:'11111111-1111-4111-8111-111111111111',revision:1,label:'合成验收模型',provider:'compatible',baseUrl:'https://example.org/v1',model:'synthetic',maxOutputTokens:1000,capabilities:['research']};
const account='account-a',stamp='2026-10-15T08:00:00Z';
const key=id=>`evix.topic.proposal.v1:${encodeURIComponent(id)}`;
class HostedApiError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
const nodes=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
const label=node=>node==null?'':Array.isArray(node)?node.map(label).join(''):typeof node==='object'?label(node.props?.children):String(node);
function field(s,aria){const n=nodes(s.tree).find(n=>n.props?.['aria-label']===aria);assert.ok(n,aria);return n;}
function button(s,name){const n=nodes(s.tree).find(n=>n.type==='button'&&label(n)===name);assert.ok(n,`Button ${name}`);return n;}
function text(s){return label(s.tree);}
function received(body,status='ready',versions=proposal.TOPIC_SOURCE_VERSIONS){
  return {id:body.idempotencyKey,status,classification:'proposed',serviceId:body.serviceId,serviceRevision:body.serviceRevision,catalogVersion:body.catalogVersion,
    inputFingerprint:createHash('sha256').update(stableStringify({profile:body.profile,candidateIds:body.candidateIds,goal:body.goal,catalogVersion:body.catalogVersion,lookupId:body.lookupId??null,...(body.profile.schemaVersion===2?{sourceVersions:versions}:{})})).digest('hex'),
    ...(body.profile.schemaVersion===2?{sourceVersions:JSON.parse(JSON.stringify(versions))}:{}),
    createdAt:stamp,finishedAt:status==='running'?null:stamp,proposal:status==='ready'?{classification:'proposed',items:body.candidateIds.map(patternId=>({patternId,title:'拟议武汉服务调查',researchQuestion:'哪些服务入口值得先验证？',decisionOwner:'拟沟通的社区合作方',decision:'选择服务入口',whyHere:'武汉背景，渠道仍待确认',firstWeekPlan:['核对公开资料','联系拟调查对象'],unknowns:['尚未确认访问渠道'],sourceIds:['s1']}))}:null,
    sources:[{id:'s1',title:'合成验收来源',url:'https://example.org/source'}],trainingExampleIds:['synthetic-1'],errorCode:status==='outcome_unknown'?'provider_timeout':null,providerMode:'fixture'};
}
function make({owner=account,storage=new Map(),drafts=new Map(),services=[service],holdVerification=false,profile:profileInput}={}){
  let ownerNow=owner,epoch=1,alive=true,cells=[],index=0,effects=[],dirty=true,tree,props;
  const calls=[],reads=[],adoptions=[],downloads=[],verifications=[],unsaved=new Map();
  let writesAfterUnmount=0,releaseVerification;
  const auth={session:owner?{user:{id:owner},mode:'local_test'}:{authenticated:false,mode:'local_test'},identityEpoch:1,
    getDraft:k=>drafts.get(k),cacheDraft:(k,value,_changed,id)=>{if(id===ownerNow)drafts.set(k,value);},setUnsaved:(k,value)=>unsaved.set(k,value),
    isCurrentAccount:(id,version)=>id===ownerNow&&version===epoch,
    mutate:(path,body)=>new Promise((resolve,reject)=>calls.push({path,body,resolve,reject}))};
  const hooks={
    useState(initial){const at=index++;if(!cells[at])cells[at]={value:typeof initial==='function'?initial():initial};return[cells[at].value,value=>{if(!alive)writesAfterUnmount++;const next=typeof value==='function'?value(cells[at].value):value;if(!Object.is(next,cells[at].value)){cells[at].value=next;dirty=true;}}];},
    useRef(initial){const at=index++;return cells[at]??={current:initial};},
    useEffect(fn,deps){const at=index++;if(!cells[at]||!sameDeps(cells[at].deps,deps)){const old=cells[at];cells[at]={deps};effects.push(()=>{old?.cleanup?.();cells[at].cleanup=fn();});}},
  };
  const jsx=(type,props,key)=>({type,props,key});
  const imports={react:hooks,'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'a'},'@evix/shared':shared,
    '@/components/hosted/HostedSession':{useHostedSession:()=>auth},'@/lib/topic-proposal':{...proposal,verifyTopicReceipt(...args){const actual=proposal.verifyTopicReceipt(...args);const verified=holdVerification?actual.then(()=>new Promise(resolve=>{releaseVerification=resolve;})):actual;verifications.push(verified);return verified;}},
    '@/components/knowledge/KnowledgeLookupPanel':{default:'KnowledgeLookupPanel'},'./TopicModelProposal.module.css':{default:{}},
    '@/components/hosted/api-client':{HostedApiError,errorMessage:e=>e.message,hostedRequest:async path=>{reads.push(path);if(path==='/api/services')return{services};if(path==='/api/topic-advisor/proposals')return{receipts:calls.filter(c=>c.saved).map(c=>({id:c.body.idempotencyKey,status:c.saved.status,createdAt:stamp}))};const c=calls.find(c=>path.endsWith(c.body.idempotencyKey));if(c?.saved)return c.saved;throw Error('not_found');}}};
  const box={exports:{},require:name=>{assert.ok(name in imports,`Unexpected module: ${name}`);return imports[name];},JSON,console,crypto,structuredClone,Blob,TextEncoder,Date,
    sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    URL:{createObjectURL:()=> 'blob:synthetic-receipt',revokeObjectURL(){}},setTimeout:fn=>{fn();},
    document:{createElement:()=>{const a={click:()=>downloads.push(a.download)};return a;}}};
  vm.runInNewContext(compiled,box);
  props={profile:profileInput??parseTopicProfile({region:'湖北',city:'武汉',referenceDate:'2026-10-15'}),recommendation:{patternId:'p1',title:'武汉研究方向',population:'拟调查居民'},stale:false,catalogVersion:'test-v1',onUseTopic:value=>adoptions.push(value)};
  const s={
    async settle(){for(let n=0;n<30;n++){index=0;dirty=false;tree=box.exports.default(props);const queue=effects;effects=[];queue.forEach(fn=>fn());await tick();if(!dirty&&!effects.length)return;}throw Error('Unstable component effects');},
    async until(predicate){for(let n=0;n<100;n++){await s.settle();if(predicate())return;await new Promise(resolve=>setTimeout(resolve,2));}throw Error('Expected component state did not arrive');},
    async flushResponse(){await tick();await Promise.allSettled(verifications);await tick();},
    get tree(){return tree;},get props(){return props;},calls,reads,adoptions,downloads,storage,drafts,unsaved,
    get writesAfterUnmount(){return writesAfterUnmount;},
    get verificationPending(){return Boolean(releaseVerification);},finishVerification(){assert.ok(releaseVerification);releaseVerification();},
    update(patch){props={...props,...patch};},switchAccount(id){ownerNow=id;epoch++;},
    resolve(index,status='ready',versions=proposal.TOPIC_SOURCE_VERSIONS){const c=calls[index];c.saved=received(c.body,status,versions);c.resolve(c.saved);},
    unmount(){alive=false;cells.forEach(c=>c.cleanup?.());},
  };return s;
}
async function consent(s){field(s,'确认选题模型调用').props.onChange({target:{checked:true}});await s.settle();}
async function launch(s){await s.settle();await consent(s);const b=button(s,'生成细化提案');assert.equal(b.props.disabled,false);b.props.onClick();await s.settle();}

test('production component requires a selected service, topic and explicit current consent',async()=>{
  const s=make();await s.settle();assert.equal(button(s,'生成细化提案').props.disabled,true);button(s,'生成细化提案').props.onClick();assert.equal(s.calls.length,0);
  await consent(s);s.update({recommendation:null});await s.settle();assert.equal(button(s,'生成细化提案').props.disabled,true);s.unmount();
  const anonymous=make({owner:null});await anonymous.settle();assert.ok(text(anonymous).includes('登录'));assert.equal(anonymous.reads.length,0);anonymous.unmount();
});
test('real handlers freeze Chinese input, dispatch once, verify result and only adopt on user action',async()=>{
  const s=make();await s.settle();field(s,'选题细化要求').props.onChange({target:{value:'  武汉社区服务，先核对访问渠道。  '}});await s.settle();await consent(s);
  const start=button(s,'生成细化提案');start.props.onClick();start.props.onClick();await s.settle();assert.equal(s.calls.length,1);assert.equal(s.calls[0].body.goal,'武汉社区服务，先核对访问渠道。');assert.equal(s.adoptions.length,0);
  assert.equal(field(s,'选题细化要求').props.disabled,true);s.resolve(0);await s.until(()=>text(s).includes('细化提案已返回'));
  assert.equal(s.adoptions.length,0);const adopt=button(s,'采用此提案，继续项目诊断');assert.equal(adopt.props.disabled,false);adopt.props.onClick();assert.equal(s.adoptions.length,1);assert.equal(s.adoptions[0].geography,'湖北 武汉');assert.equal(s.adoptions[0].population,'拟调查居民');s.unmount();
});
test('new profile or goal invalidates old proposal and requires new consent',async()=>{
  const s=make();await launch(s);s.resolve(0);await s.until(()=>text(s).includes('细化提案已返回'));
  const before=s.props.profile;s.update({profile:{...before,city:'上海'}});await s.settle();assert.equal(button(s,'采用此提案，继续项目诊断').props.disabled,true);assert.equal(field(s,'确认选题模型调用').props.checked,false);
  s.update({profile:before});await s.settle();field(s,'选题细化要求').props.onChange({target:{value:'改变研究要求'}});await s.settle();assert.equal(button(s,'采用此提案，继续项目诊断').props.disabled,true);assert.equal(button(s,'生成细化提案').props.disabled,true);s.unmount();
});
test('network loss and 401 keep the exact pending request across unmount and retry',async()=>{
  const s=make();await launch(s);const first=JSON.stringify(s.calls[0].body);s.calls[0].reject(Error('network_lost'));await s.until(()=>text(s).includes('network_lost'));assert.equal(button(s,'生成细化提案').props.disabled,true);s.unmount();
  const restored=make({storage:s.storage,drafts:s.drafts});await restored.settle();button(restored,'核对原请求').props.onClick();await restored.settle();assert.equal(JSON.stringify(restored.calls[0].body),first);
  restored.calls[0].reject(new HostedApiError(401,'session_required'));await restored.until(()=>text(restored).includes('session_required'));assert.ok(restored.storage.has(key(account)));
  button(restored,'核对原请求').props.onClick();await restored.settle();assert.equal(JSON.stringify(restored.calls[1].body),first);restored.resolve(1);await restored.until(()=>text(restored).includes('细化提案已返回'));restored.unmount();
});
test('unknown call remains unresolved while a known rejected request becomes editable',async()=>{
  const unknown=make();await launch(unknown);unknown.resolve(0,'outcome_unknown');await unknown.until(()=>text(unknown).includes('调用结果待核对'));assert.equal(button(unknown,'生成细化提案').props.disabled,true);assert.ok(unknown.storage.has(key(account)));unknown.unmount();
  const rejected=make();await launch(rejected);rejected.calls[0].reject(new HostedApiError(409,'topic_infeasible'));await rejected.until(()=>text(rejected).includes('topic_infeasible'));assert.equal(rejected.storage.has(key(account)),false);assert.equal(field(rejected,'选题细化要求').props.disabled,false);rejected.unmount();
});
test('late response after identity change or unmount never becomes an adopted result',async()=>{
  for(const boundary of ['account','unmount']){const s=make();await launch(s);if(boundary==='account')s.switchAccount('account-b');else s.unmount();s.resolve(0);await s.flushResponse();if(boundary==='account')await s.settle();assert.equal(s.adoptions.length,0);assert.ok(!text(s).includes('细化提案已返回'));assert.equal(s.writesAfterUnmount,0);assert.ok(!text(s).includes('采用此提案'));if(boundary==='account')s.unmount();}
});
test('identity and unmount guards also hold after asynchronous fingerprint verification',async()=>{
  for(const boundary of ['account','unmount']){const s=make({holdVerification:true});await launch(s);s.resolve(0);await s.until(()=>s.verificationPending);if(boundary==='account')s.switchAccount('account-b');else s.unmount();s.finishVerification();await s.flushResponse();if(boundary==='account')await s.settle();assert.equal(s.writesAfterUnmount,0);assert.ok(!text(s).includes('细化提案已返回'));assert.ok(!text(s).includes('采用此提案'));if(boundary==='account')s.unmount();}
});
test('receipt with a changed fingerprint never unlocks adoption',async()=>{
  const s=make();await launch(s);s.calls[0].resolve({...received(s.calls[0].body),inputFingerprint:'0'.repeat(64)});await s.until(()=>text(s).includes('材料指纹不一致'));assert.ok(!text(s).includes('采用此提案'));assert.equal(button(s,'生成细化提案').props.disabled,true);s.unmount();
});
test('partial date edits remain rendered and cannot be dispatched',async()=>{
  const s=make();await s.settle();s.update({profile:{...s.props.profile,referenceDate:'2026-10-'}});await s.settle();await consent(s);button(s,'生成细化提案').props.onClick();assert.equal(s.calls.length,0);assert.ok(text(s).includes('参考日期'));s.unmount();
});
test('history retrieval and receipt download do not dispatch a second model call',async()=>{
  const s=make();await launch(s);s.resolve(0);await s.until(()=>text(s).includes('细化提案已返回'));button(s,'查找之前的调用').props.onClick();await s.until(()=>text(s).includes('下载回执'));button(s,'下载回执').props.onClick();await s.until(()=>s.downloads.length===1);assert.equal(s.calls.length,1);assert.ok(s.downloads[0].includes(s.calls[0].body.idempotencyKey));s.unmount();
});
test('goal draft restores for its owner but does not leak to a different account',async()=>{
  const s=make();await s.settle();field(s,'选题细化要求').props.onChange({target:{value:'尚未发送的中文要求'}});await s.settle();s.unmount();const restored=make({drafts:s.drafts});await restored.settle();assert.equal(field(restored,'选题细化要求').props.value,'尚未发送的中文要求');restored.unmount();const other=make({owner:'account-b',drafts:s.drafts,storage:s.storage});await other.settle();assert.equal(field(other,'选题细化要求').props.value,'');other.unmount();
});

const v2Profile=(code='420106')=>parseTopicProfile({region:'山西',city:'晋城',referenceDate:'2026-10-15',schemaVersion:2,regionRef:{code,catalogVersion:proposal.TOPIC_SOURCE_VERSIONS.regionCatalog.catalogVersion}});
test('v2 actual handlers bind receipt versions outside unchanged request body and hand off the canonical full path',async()=>{
  const s=make({profile:v2Profile()});await launch(s);
  assert.equal(Object.hasOwn(s.calls[0].body,'sourceVersions'),false);
  assert.deepEqual(JSON.parse(s.storage.get(key(account))).sourceVersions,proposal.TOPIC_SOURCE_VERSIONS);
  const lookup=nodes(s.tree).find(n=>n.type==='KnowledgeLookupPanel');assert.ok(lookup.props.initialQuery.startsWith('湖北省 · 武汉市 · 武昌区'));
  s.resolve(0);await s.until(()=>text(s).includes('细化提案已返回'));button(s,'采用此提案，继续项目诊断').props.onClick();
  assert.equal(s.adoptions[0].geography,'湖北省 · 武汉市 · 武昌区');assert.equal(s.calls.length,1);s.unmount();
});
test('v2 explicit unset never uses retained legacy city for search, displayed scope or adopted geography',async()=>{
  const s=make({profile:{...v2Profile(),region:'湖北',city:'武汉',regionRef:null}});await launch(s);
  const lookup=nodes(s.tree).find(n=>n.type==='KnowledgeLookupPanel');assert.ok(lookup.props.initialQuery.startsWith('全国 '));assert.ok(text(s).includes('地区：未选择地区'));
  s.resolve(0);await s.until(()=>text(s).includes('细化提案已返回'));button(s,'采用此提案，继续项目诊断').props.onClick();assert.equal(s.adoptions[0].geography,'');s.unmount();
});
test('new dispatch and consent reject stale refs with the actionable directory reason',async()=>{
  const stale={...v2Profile(),regionRef:{code:'420106',catalogVersion:'cn-admin-2024-old'}},s=make({profile:stale});await s.settle();await consent(s);
  assert.equal(field(s,'确认选题模型调用').props.disabled,true);assert.equal(button(s,'生成细化提案').props.disabled,true);button(s,'生成细化提案').props.onClick();assert.equal(s.calls.length,0);
  assert.ok(text(s).includes('确认迁移'));assert.ok(!text(s).includes('天数与预算'));s.unmount();
});
test('wrong v2 metadata never unlocks adoption or loses an uncertain original request',async()=>{
  const s=make({profile:v2Profile()});await launch(s);const original=JSON.stringify(s.calls[0].body),bad=received(s.calls[0].body);bad.sourceVersions.topicDigest='0'.repeat(64);s.calls[0].resolve(bad);
  await s.until(()=>text(s).includes('来源版本与原请求不一致'));assert.ok(!text(s).includes('采用此提案'));assert.ok(s.storage.has(key(account)));
  button(s,'核对原请求').props.onClick();await s.settle();assert.equal(JSON.stringify(s.calls[1].body),original);s.resolve(1);await s.until(()=>text(s).includes('细化提案已返回'));s.unmount();
});
test('old bound v2 unknown calls recover exact raw bytes across directory change and reconcile without a fresh dispatch',async()=>{
  const oldVersions={topicDigest:'a'.repeat(64),regionCatalog:{catalogVersion:'cn-admin-2024-old',asOf:'2024-12-31',catalogSha256:'b'.repeat(64)}},body={serviceId:service.id,serviceRevision:1,idempotencyKey:'22222222-2222-4222-8222-222222222222',consent:true,catalogVersion:'test-v1',profile:{...v2Profile(),city:' 原始旧城市 ',regionRef:{code:'420106',catalogVersion:oldVersions.regionCatalog.catalogVersion}},candidateIds:['p1'],goal:' 原始旧要求 '};
  const pending={schemaVersion:1,accountId:account,body,snapshotKey:JSON.stringify([parseTopicProfile(body.profile),body.candidateIds,body.catalogVersion,oldVersions]),sourceVersions:oldVersions},storage=new Map([[key(account),JSON.stringify(pending)]]);
  const s=make({profile:v2Profile(),storage});await s.settle();assert.equal(s.calls.length,0);assert.equal(button(s,'生成细化提案').props.disabled,true);
  button(s,'核对原请求').props.onClick();await s.settle();assert.equal(JSON.stringify(s.calls[0].body),JSON.stringify(body));s.resolve(0,'outcome_unknown',oldVersions);await s.until(()=>text(s).includes('调用结果待核对'));s.unmount();
  const recovered=make({profile:v2Profile('420100'),storage,drafts:s.drafts});await recovered.settle();button(recovered,'核对原请求').props.onClick();await recovered.settle();assert.equal(JSON.stringify(recovered.calls[0].body),JSON.stringify(body));recovered.resolve(0,'ready',oldVersions);await recovered.until(()=>text(recovered).includes('细化提案已返回'));
  assert.equal(button(recovered,'采用此提案，继续项目诊断').props.disabled,true);assert.equal(recovered.calls.length,1);assert.ok(text(recovered).includes('保留供对照'));recovered.unmount();
});
