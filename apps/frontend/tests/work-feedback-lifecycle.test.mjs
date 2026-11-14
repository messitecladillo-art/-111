// Independent component branch cases from /root/report_workstation_review.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const require=createRequire(path.join(root,'package.json'));
const ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const noop=()=>{};
function render(file,states,props,auth={session:{authenticated:true,user:{id:'A'}},identityEpoch:1},externalSnapshots=[true,false]){
 let index=0,externalIndex=0;
 const fakeReact={...React,useState:init=>[index<states.length?states[index++]:typeof init==='function'?init():init,noop],useRef:init=>({current:init}),useEffect:noop,useLayoutEffect:noop,useId:()=> 'synthetic-id',useSyncExternalStore:()=>externalSnapshots[externalIndex++]};
 const js=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const cjs={exports:{}};
 const localRequire=id=>{
  if(id==='react')return fakeReact;
  if(id==='react/jsx-runtime')return require(id);
  if(id==='./geometry')return {BASE:[],CARRIAGE:[],CONTROL:[],FEEDER:[],FRAME:[],OUTPUT:[],DIAL:{minor:'',major:''},RULER:{minor:'',major:''},SHADOW:[0,0],travel:[0,0],WIDTH:600,HEIGHT:300};
  if(id.endsWith('.module.css'))return {default:new Proxy({},{get:(_t,key)=>String(key)})};
  if(id.includes('/report-workstation/'))return {default:({kind,state,paused,heading})=>React.createElement('div',{'data-workstation':true,'data-kind':kind,'data-phase':state.phase,'data-paused':String(!!paused)},heading)};
  if(id.includes('HostedSession'))return {useHostedSession:()=>auth};
  if(id.includes('api-client'))return {HostedApiError:class extends Error{},errorMessage:String};
  if(id.includes('api-contracts'))return {parseKnowledgeLookup:x=>x};
  if(id.includes('account-sync'))return {confirmedKnowledgeQuery:x=>x,parseStoredKnowledgeLookup:()=>null,isKnownLookupRejection:()=>false};
  if(id.includes('knowledge/types'))return {KNOWLEDGE_DOMAINS:{}};
  if(id.includes('analysis-journey'))return {JOURNEY_STATUS_LABELS:{ready:'Ready'}};
  if(id.includes('useWorkspaceMotion'))return {useContentReveal:()=>({current:null})};
  throw Error('Unexpected dependency '+id);
 };
 vm.runInNewContext(js,{module:cjs,exports:cjs.exports,require:localRequire,console,Date});
 return renderToStaticMarkup(cjs.exports.default(props));
}
const lookupFile='apps/frontend/components/knowledge/KnowledgeLookupPanel.tsx';
const pending=(status='running')=>({schemaVersion:1,accountId:'A',idempotencyKey:'synthetic',query:'Synthetic',status});
function lookup({status='running',busy=false,receipt=null,stateAccount='A',accountId='A'}={}){
 const states=[stateAccount,'Synthetic',receipt,pending(status),busy,'','Synthetic','','','',false,false];
 return render(lookupFile,states,{}, {session:{authenticated:true,user:{id:accountId}},identityEpoch:1});
}
test('restored unresolved lookup does not animate until its receipt is rechecked',()=>{
 const html=lookup();assert.doesNotMatch(html,/data-phase="writing"|data-phase="preparing"/);assert.match(html,/data-phase="waiting"/);
});
test('queued and unknown lookup receipts remain static, while current dispatch shows preparation',()=>{
 for(const status of ['queued','outcome_unknown'])assert.match(lookup({status:'running',receipt:{status,query:'Synthetic',results:[],credits:0,createdAt:'2026-01-01'}}),/data-phase="waiting"/);
 assert.match(lookup({busy:true}),/data-phase="preparing"/);
});
test('settled lookup hides apparatus and another account never sees the old query or apparatus',()=>{
 for(const status of ['ready','failed'])assert.doesNotMatch(lookup({status}),/data-workstation/);
 assert.doesNotMatch(lookup({stateAccount:'A',accountId:'B'}),/data-workstation|检索词：Synthetic/);
});
const analysisFile='apps/frontend/components/analysis/AnalysisJourney.tsx';
const base={reading:true,readPhase:'reading',readName:'Synthetic.csv',dataset:null,importError:'',setupIssue:'',setupTarget:'data',modules:[],activeId:null,onNavigate:noop};
test('analysis uses only actual reading and forwards pause/visibility/collapse without altering phase',()=>{
 for(const [expansion,paused,visible,expectPaused] of [[null,false,true,false],[null,true,true,true],[null,false,false,true],[false,false,true,true]]){
  const html=render(analysisFile,[expansion,paused,visible],base);assert.match(html,/data-kind="analysis"/);assert.match(html,/data-phase="preparing"/);assert.match(html,new RegExp(`data-paused="${expectPaused}"`));
 }
 assert.doesNotMatch(render(analysisFile,[null,false,true],{...base,reading:false}),/data-workstation/);
});

const workstationFile='apps/frontend/components/figures/report-workstation/ReportWorkstation.tsx';
test('apparatus pause, hidden page, offscreen and reduced motion preserve phase/count but stop movement',()=>{
 const input={state:{phase:'writing',detail:'Synthetic task',completed:2,total:5}};
 for(const [visible,pageVisible,reduced,paused,expected] of [[true,true,false,false,true],[true,true,false,true,false],[false,true,false,false,false],[true,false,false,false,false],[true,true,true,false,false]]){
  const html=render(workstationFile,[false,visible],{...input,paused},undefined,[pageVisible,reduced]);
  assert.match(html,new RegExp(`data-running="${expected}"`));assert.match(html,/data-phase="writing"/);assert.match(html,/<b>2<\/b>/);
 }
 for(const phase of ['waiting','error','complete'])assert.match(render(workstationFile,[false,true],{...input,state:{...input.state,phase}},undefined,[true,false]),/data-running="false"/);
});

test('anatomy typewriter telemetry drives carriage/strike/returning while motion allowed and halts when paused or reduced',()=>{
 const input={state:{phase:'writing',detail:'Typewriter pass',completed:2,total:5},telemetry:{lineRatio:0.5,strikeTick:3,returning:true,activePhrase:'测试文本行'}};
 const activeHtml=render(workstationFile,[false,true],input,undefined,[true,false]);
 assert.match(activeHtml,/data-typing="true"/);
 assert.match(activeHtml,/data-driven="true"/);
 assert.match(activeHtml,/data-strike="1"/);
 assert.match(activeHtml,/data-returning="true"/);
 assert.match(activeHtml,/--drive-x:/);
 assert.match(activeHtml,/ANATOMY · TYPE/);
 assert.match(activeHtml,/测试文本行/);
 for(const [paused,reduced] of [[true,false],[false,true]]){
  const haltedHtml=render(workstationFile,[false,true],{...input,paused},undefined,[true,reduced]);
  assert.doesNotMatch(haltedHtml,/data-typing="true"/);
  assert.doesNotMatch(haltedHtml,/data-driven="true"/);
  assert.doesNotMatch(haltedHtml,/data-strike=/);
  assert.doesNotMatch(haltedHtml,/data-returning=/);
 }
});
