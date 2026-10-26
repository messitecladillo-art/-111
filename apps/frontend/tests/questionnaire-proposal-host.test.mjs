import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Permanent regression of the reviewed actual handlers and repositories; controlled hooks/IO, no React DOM.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const frontend = path.join(root, 'apps/frontend');
const ts = createRequire(path.join(frontend, 'package.json'))('typescript');
const shared = await import(pathToFileURL(path.join(root, 'packages/evi-x-shared/src/index.ts')));
const mapping = await import(pathToFileURL(path.join(frontend, 'lib/questionnaire-mapping.ts')));
const library = await import(pathToFileURL(path.join(frontend, 'lib/questionnaire-library.ts')));
const contract = await import(pathToFileURL(path.join(frontend, 'lib/topic-questionnaire-api.ts')));
const persistence = await import(pathToFileURL(path.join(frontend, 'lib/questionnaire-persistence.ts')));
const core = await import(pathToFileURL(path.join(frontend, 'lib/topic-questionnaire.ts')));
const resultRegistration = await import(pathToFileURL(path.join(frontend, 'lib/result-registration.ts')));
const tick = () => new Promise(resolve => setImmediate(resolve));
const same = (a,b) => a && b && a.length === b.length && a.every((v,i) => Object.is(v,b[i]));
const plain = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n,...nodes(n.props?.children)];
const text = n => n == null ? '' : Array.isArray(n) ? n.map(text).join('') : typeof n === 'object' ? text(n.props?.children) : String(n);
const projectId = '11111111-1111-4111-8111-111111111111';
const foreignProject = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const v1 = '44444444-4444-4444-8444-444444444444';
const v2 = '55555555-5555-4555-8555-555555555555';
const serviceId='66666666-6666-4666-8666-666666666666';
const wrongId='77777777-7777-4777-8777-777777777777';
const time = '2026-10-20T10:00:00Z';
class HostedApiError extends Error { constructor(status,code='synthetic_error') {super(`Synthetic HTTP ${status}`);this.status=status;this.code=code;} }
function mount(imports) {
  let cells=[],index=0,effects=[],dirty=true,tree,alive=true,writesAfterUnmount=0;
  const hooks={
    useState(init){const at=index++;cells[at]??={value:typeof init==='function'?init():init};return[cells[at].value,next=>{if(!alive){writesAfterUnmount++;return;}next=typeof next==='function'?next(cells[at].value):next;if(!Object.is(next,cells[at].value)){cells[at].value=next;dirty=true;}}];},
    useRef(init){return cells[index++]??={current:init};},
    useMemo(fn,deps){const at=index++;if(!cells[at]||!same(cells[at].deps,deps))cells[at]={value:fn(),deps};return cells[at].value;},
    useCallback(fn,deps){return hooks.useMemo(()=>fn,deps);},
    useEffect(fn,deps){const at=index++;if(!cells[at]||!same(cells[at].deps,deps)){const old=cells[at];cells[at]={deps};effects.push(()=>{old?.cleanup?.();cells[at].cleanup=fn();});}},
    useSyncExternalStore(subscribe,getSnapshot){const[,invalidate]=hooks.useState(0);hooks.useEffect(()=>subscribe(()=>invalidate(n=>n+1)),[subscribe]);return getSnapshot();},
  };
  hooks.useLayoutEffect=hooks.useEffect;
  const jsx=(type,props,key)=>({type,props,key});
  const mocks={react:hooks,'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/result-registration':resultRegistration,...imports};
  const modules=new Map();
  function compile(filename,host=false){
    if(modules.has(filename))return modules.get(filename);
    const box={exports:{},require:name=>{
      if(name in mocks)return mocks[name];
      if(name.startsWith('@/')||name.startsWith('./')||name.startsWith('../')){
        let file=name.startsWith('@/')?path.join(frontend,name.slice(2)):path.resolve(path.dirname(filename),name);
        if(!/\.[cm]?[jt]sx?$/.test(file))file+=fs.existsSync(file+'.ts')?'.ts':'.tsx';
        assert.ok(file.startsWith(frontend+path.sep),`Outside declared frontend: ${file}`);
        return compile(file);
      }
      throw Error(`Unmocked dependency ${name}`);
    },JSON,crypto,structuredClone,console,TextEncoder,TextDecoder,URL,URLSearchParams,queueMicrotask,setTimeout,clearTimeout,window:{confirm:()=>true},location:{reload(){}}};
    modules.set(filename,box.exports);
    const source=fs.readFileSync(filename,'utf8');
    const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const run=vm.runInThisContext('(function('+Object.keys(box).join(',')+'){'+code+(host?'\nexports.tested=ProjectEditor;':'')+'\n})',{filename});run(...Object.values(box));return box.exports;
  }
  const component=compile(path.join(frontend,'components/hosted/HostedProject.tsx'),true).tested;
  const screen={get tree(){return tree;},role(value){const cell=cells.find(c=>c.value==='owner'||c.value==='viewer');assert.ok(cell,'role state');cell.value=value;dirty=true;},get writesAfterUnmount(){return writesAfterUnmount;},async settle(){for(let n=0;n<60;n++){if(!alive)return;index=0;dirty=false;tree=component({projectId});const queued=effects;effects=[];queued.forEach(fn=>fn());await tick();if(!dirty&&!effects.length)return;}throw Error('Unsettled host');},async until(fn){for(let n=0;n<100;n++){await screen.settle();if(fn())return;await new Promise(resolve=>setTimeout(resolve,2));}throw Error(`Expected transition; UI=${text(tree).slice(0,400)}`);},unmount(){cells.forEach(c=>c.cleanup?.());alive=false;}};return screen;
}
function proposalHost({pending=false,existing=false,list=false,role='owner',uncertain=pending}={}){
 const design={...shared.newQuestionnaire(),title:'合成问卷'};
 const head={id:v1,projectId,revision:1,design,updatedAt:time};
 const request={serviceId,serviceRevision:3,brief:'合成研究需求',expectedQuestionnaireRevision:1,idempotencyKey:v2,consent:true};
 const ready={id:v2,projectId,serviceId,serviceRevision:3,inputRevision:1,status:'ready',design:{...design,title:'新的模型提案'},createdAt:time};
 const unknown={...ready,status:'outcome_unknown',design:undefined}; delete unknown.design;
 let owner=userId,epoch=1,lastCache,dirtyFlag,unsavedFlag,holdList=false,listResolve;
 const writes=[],reads=[],readPending=[],cacheEvents=[];
 const auth={session:{user:{id:userId},mode:'local_test'},identityEpoch:1,isCurrentAccount:(id,e)=>id===owner&&e===epoch,
 getDraft:()=>({head,initial:design,snapshot:{design,pending:false,editRevision:0},headBinding:null,proposal:existing?unknown:null,brief:request.brief,pendingSave:null,pendingGeneration:pending?request:null,saveUncertain:false,generationUncertain:uncertain,conflict:false}),
 cacheDraft:(_key,value,dirty)=>{lastCache=value;dirtyFlag=dirty;cacheEvents.push(value);},setUnsaved:(_key,value)=>{unsavedFlag=value;},
 mutate:(endpoint,body)=>new Promise((resolve,reject)=>writes.push({endpoint,body,resolve,reject}))};
 const summary=shared.summarizeProposal(ready);
 const api={HostedApiError,errorMessage:e=>e.message,downloadQuestionnaire(){},hostedRequest:async endpoint=>{
   reads.push(endpoint);
   if(endpoint.endsWith('/topic-binding'))return{versionId:v1,binding:null,bindingHash:null,designTransferHash:await core.topicQuestionnaireHash(design)};
   if(endpoint.endsWith('/questionnaire'))return{questionnaire:head};
   if(endpoint.endsWith('/versions'))return{versions:[],nextBeforeRevision:null};
   if(endpoint==='/api/services')return{services:[{id:serviceId,label:'合成模型',provider:'openai',baseUrl:'https://api.openai.com/v1',model:'synthetic',maxOutputTokens:1024,capabilities:['questionnaire'],revision:3}]};
   if(endpoint.endsWith('/proposals')){
     if(holdList)return new Promise(resolve=>{listResolve=resolve;});
     return{proposals:list?[summary]:[]};
   }
   if(endpoint.includes('/proposals/'))return new Promise((resolve,reject)=>readPending.push({endpoint,resolve,reject}));
   return{project:{id:projectId,title:'合成提案宿主',teamId:userId,revision:1,createdAt:time},membershipRole:role};
 }};
 const safeContract={...contract,verifyTopicBindingReceipt:(raw,expected)=>contract.verifyTopicBindingReceipt(plain(raw),plain(expected))};
 const screen=mount({'next/link':{default:'a'},'next/dynamic':{default:fn=>fn.toString().match(/components\/([^'\"]+)/)?.[1]?.split('/').at(-1)??'Dynamic'},'@evix/shared':shared,'@/lib/questionnaire-library':library,'@/lib/questionnaire-mapping':mapping,'@/lib/questionnaire-persistence':persistence,'@/lib/topic-questionnaire-api':safeContract,'@/components/topic-advisor/TopicQuestionnaireProposal':{default:'TopicQuestionnaireProposal'},'./api-client':api,'./HostedSession':{useHostedSession:()=>auth},'./HostedFrame':{LoginRequired:'LoginRequired'},'./HostedMembers':{default:'HostedMembers'},'../research-view/ResearchViewHost':{default:'ResearchViewHost'},'./silicon-runner':{createSiliconRunner:()=>null,serviceNames:()=>new Map(),parseSiliconLimits:()=>null},'@/components/motion/useWorkspaceMotion':{useContentReveal(){},useKeyedListMotion(){}}});
 const button=label=>{const b=nodes(screen.tree).find(n=>n.type==='button'&&text(n)===label);assert.ok(b,`Button ${label}; UI=${text(screen.tree).slice(0,800)}`);return b;};
 return{screen,request,ready,summary,writes,reads,readPending,cacheEvents,button,get cache(){return lastCache;},get dirty(){return dirtyFlag;},get unsaved(){return unsavedFlag;},get listHeld(){return Boolean(listResolve);},async readyUI(){await screen.until(()=>!text(screen.tree).includes('正在恢复项目与问卷版本'));},async consent(){const c=nodes(screen.tree).find(n=>n.type==='input'&&n.props.type==='checkbox');assert.ok(c);c.props.onChange({target:{checked:true}});await screen.settle();},generate(){button(pending?'核对原生成请求':'生成问卷建议').props.onClick();},reject(status){writes.at(-1).reject(new HostedApiError(status));},complete(changes={}){writes.at(-1).resolve({...ready,...changes});},switchAccount(){owner=foreignProject;epoch++;},holdList(){holdList=true;},releaseList(rows=[]){listResolve({proposals:rows});},proposal(){return nodes(screen.tree).find(n=>n.props?.['aria-label']==='模型问卷提案');}};
}

test('ordinary ready receipt becomes a proposal without changing questionnaire draft',async()=>{
 const h=proposalHost();await h.readyUI();await h.consent();h.generate();await h.screen.until(()=>h.writes.length===1);h.complete();await h.screen.until(()=>h.cache?.proposal?.status==='ready');assert.equal(h.cache.pendingGeneration,null);assert.equal(h.cache.snapshot.design.title,'合成问卷');assert.ok(h.proposal());h.screen.unmount();
});
for(const status of [403,409])test(`cached unknown replay HTTP ${status} keeps original request and uncertainty`,async()=>{
 const h=proposalHost({pending:true});await h.readyUI();h.generate();await h.screen.until(()=>h.writes.length===1);assert.equal(h.writes[0].body,h.request);h.reject(status);await h.screen.settle();assert.equal(h.cache.pendingGeneration,h.request);assert.equal(h.cache.generationUncertain,true);h.screen.unmount();
});
test('new unknown response then rejected replay retains exactly the first key and payload',async()=>{
 const h=proposalHost();await h.readyUI();await h.consent();h.generate();await h.screen.until(()=>h.writes.length===1);const request=h.writes[0].body;h.writes[0].reject(Error('lost synthetic receipt'));await h.screen.until(()=>h.cache.generationUncertain);h.button('核对原生成请求').props.onClick();await h.screen.until(()=>h.writes.length===2);assert.equal(h.writes[1].body,request);h.reject(403);await h.screen.settle();assert.equal(h.cache.pendingGeneration,request);assert.equal(h.cache.generationUncertain,true);h.screen.unmount();
});
for(const [name,changes] of [['malformed',{status:'ready',design:undefined}],['foreign project',{projectId:foreignProject}],['wrong service',{serviceId:wrongId}],['wrong service revision',{serviceRevision:4}],['wrong input revision',{inputRevision:2}]])test(`${name} generation receipt cannot resolve original request`,async()=>{
 const h=proposalHost();await h.readyUI();await h.consent();h.generate();await h.screen.until(()=>h.writes.length===1);const request=h.writes[0].body;h.complete(changes);await h.screen.settle();assert.equal(h.cache.pendingGeneration,request);assert.equal(h.cache.generationUncertain,true);assert.equal(h.cache.proposal,null);h.screen.unmount();
});
test('rapid duplicate generate callback before render creates only one HTTP request',async()=>{
 const h=proposalHost();await h.readyUI();await h.consent();const callback=h.button('生成问卷建议').props.onClick;callback();callback();await tick();assert.equal(h.writes.length,1);h.complete();await h.screen.settle();h.screen.unmount();
});
test('account invalidation fences late generation receipt and leaves original pending record',async()=>{
 const h=proposalHost();await h.readyUI();await h.consent();h.generate();await h.screen.until(()=>h.writes.length===1);const before=h.cacheEvents.length;h.switchAccount();h.complete();await h.screen.settle();assert.equal(h.cacheEvents.length,before);assert.ok(h.cache.pendingGeneration);assert.equal(h.proposal(),undefined);h.screen.unmount();
});
test('write downgrade then restoration cannot authorize the prior running response',async()=>{
 const h=proposalHost();await h.readyUI();await h.consent();h.generate();await h.screen.until(()=>h.writes.length===1);h.screen.role('viewer');await h.screen.settle();h.screen.role('owner');await h.screen.settle();h.complete();await h.screen.settle();assert.ok(h.cache.pendingGeneration);assert.equal(h.cache.generationUncertain,true);assert.equal(h.cache.proposal,null);h.screen.unmount();
});
test('old proposal catalogue response cannot erase the freshly generated summary',async()=>{
 const h=proposalHost();await h.readyUI();h.holdList();h.button('刷新调用记录').props.onClick();await h.screen.until(()=>h.listHeld);await h.consent();h.generate();await h.screen.until(()=>h.writes.length===1);h.complete();await h.screen.until(()=>h.cache.proposal?.status==='ready');assert.ok(h.button('查看提案与状态'));h.releaseList();await h.screen.settle();assert.ok(nodes(h.screen.tree).some(n=>n.type==='button'&&text(n)==='查看提案与状态'));h.screen.unmount();
});
for(const readMode of ['open','refresh'])test(`${readMode} rejects a proposal response belonging to a different selected ID`,async()=>{
 const h=proposalHost({existing:readMode==='refresh',list:readMode==='open'});await h.readyUI();h.button(readMode==='open'?'查看提案与状态':'核对调用状态').props.onClick();await h.screen.until(()=>h.readPending.length===1);h.readPending[0].resolve({...h.ready,id:wrongId});await h.screen.settle();assert.notEqual(h.cache.proposal?.id,wrongId);h.screen.unmount();
});
test('generation in flight participates in session dirty and before-unload state',async()=>{
 const h=proposalHost();await h.readyUI();await h.consent();h.generate();await h.screen.until(()=>h.writes.length===1);assert.equal(h.dirty,true);assert.equal(h.unsaved,true);h.complete();await h.screen.settle();h.screen.unmount();
});
test('audited pre-provider rejection clears only the uncommitted fresh request',async()=>{
 const h=proposalHost();await h.readyUI();await h.consent();h.generate();await h.screen.until(()=>h.writes.length===1);h.writes.at(-1).reject(new HostedApiError(422,'capability_unavailable'));await h.screen.settle();assert.equal(h.cache.pendingGeneration,null);assert.equal(h.cache.generationUncertain,false);assert.equal(h.cache.snapshot.design.title,'合成问卷');h.screen.unmount();
});
test('new generation request is detached and deeply frozen before dispatch',async()=>{
 const h=proposalHost();await h.readyUI();await h.consent();h.generate();await h.screen.until(()=>h.writes.length===1);assert.equal(Object.isFrozen(h.writes[0].body),true);h.complete();await h.screen.settle();h.screen.unmount();
});
test('restored cached pending request implies uncertainty even when old boolean was false',async()=>{
 const h=proposalHost({pending:true,uncertain:false});await h.readyUI();assert.equal(h.cache.generationUncertain,true);assert.equal(h.dirty,true);assert.equal(h.unsaved,true);assert.ok(h.button('核对原生成请求'));h.screen.unmount();
});
for(const readMode of ['open','refresh'])for(const [name,change] of [['project',{projectId:foreignProject}],['service',{serviceId:wrongId}],['serviceRevision',{serviceRevision:99}],['inputRevision',{inputRevision:99}]])test(`${readMode} verifies selected ${name} identity in addition to ID`,async()=>{
 const h=proposalHost({existing:readMode==='refresh',list:readMode==='open'});await h.readyUI();h.button(readMode==='open'?'查看提案与状态':'核对调用状态').props.onClick();await h.screen.until(()=>h.readPending.length===1);h.readPending[0].resolve({...h.ready,...change});await h.screen.settle();assert.equal(h.cache.proposal?.status,readMode==='refresh'?'outcome_unknown':undefined);h.screen.unmount();
});
for(const readMode of ['open','refresh'])test(`${readMode} ignores late reply after account authority invalidation`,async()=>{
 const h=proposalHost({existing:readMode==='refresh',list:readMode==='open'});await h.readyUI();h.button(readMode==='open'?'查看提案与状态':'核对调用状态').props.onClick();await h.screen.until(()=>h.readPending.length===1);const before=h.cacheEvents.length;h.switchAccount();h.readPending[0].resolve(h.ready);await h.screen.settle();assert.equal(h.cacheEvents.length,before);assert.equal(h.cache.proposal?.status,readMode==='refresh'?'outcome_unknown':undefined);h.screen.unmount();
});

for(const [status,code] of [[401,'login_required'],[403,'permission_denied'],[404,'not_found'],[409,'synthetic_error']])test(`even fresh ${status}/${code} can follow a charged call and must retain its request`,async()=>{
 const h=proposalHost();await h.readyUI();await h.consent();h.generate();await h.screen.until(()=>h.writes.length===1);const original=h.writes[0].body;h.writes[0].reject(new HostedApiError(status,code));await h.screen.settle();assert.equal(h.cache.pendingGeneration,original);assert.equal(h.cache.generationUncertain,true);h.screen.unmount();
});
