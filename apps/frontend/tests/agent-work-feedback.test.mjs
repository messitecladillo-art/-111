// Independent React SSR cases from /root/report_workstation_review; integration by root.
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
const source=fs.readFileSync(path.join(root,'apps/frontend/components/agent/Transcript.tsx'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const stub=()=>null;
const cjs={exports:{}};
const style=new Proxy({},{get:(_target,key)=>String(key)});
const localRequire=id=>{
  if(id==='react'||id==='react/jsx-runtime')return require(id);
  if(id.endsWith('.module.css'))return {default:style};
  if(id.endsWith('/chat'))return {usageText:()=> 'usage'};
  if(id.endsWith('/Tex'))return {Formula:stub};
  if(id==='./generation')return {ConsentCard:stub,JobCard:stub,ProposalView:stub};
  if(id==='./Glyphs')return {Spans:({line})=>React.createElement('span',null,line.map(s=>s.text).join(''))};
  if(id==='./icons')return {Icon:({name})=>React.createElement('span',{'data-icon':name})};
  if(id==='./StudioCards')return {ChartStudioView:stub,CodeStudioView:stub,WritingStudioView:stub};
  if(id.includes('/report-workstation/'))return {default:({kind,state})=>React.createElement('div',{'data-workstation':true,'data-kind':kind??'report','data-phase':state.phase})};
  throw Error('Unapproved SSR dependency '+id);
};
vm.runInNewContext(js,{module:cjs,exports:cjs.exports,require:localRequire,console,Date,setInterval,clearInterval});
const Transcript=cjs.exports.default;
const message=(id,status='running')=>({id,at:1,role:'agent',model:{service:'Synthetic',step:1,status},turn:{lines:[[{text:'Synthetic receipt'}]]}});
const show=(messages,active=[],paper=false)=>renderToStaticMarkup(React.createElement(Transcript,{messages,scrollRef:{current:null},activeCallIds:new Set(active),workInPaper:paper,onAction:stub,onAnswer:stub}));
test('restored running records are static unknown, with no workstation or elapsed ticker',()=>{
  const html=show([message('old')]);assert.match(html,/data-status="unknown"/);assert.doesNotMatch(html,/data-workstation|已用/);
});
test('a request active in this mount gets exactly one visible apparatus',()=>{
  const html=show([message('now')],['now']);assert.match(html,/data-status="running"/);assert.equal((html.match(/data-workstation/g)||[]).length,1);assert.match(html,/已用/);
});
test('paper work suppresses the duplicate transcript apparatus',()=>{
  const html=show([message('now')],['now'],true);assert.doesNotMatch(html,/data-workstation/);assert.match(html,/data-status="running"/);
});
test('settled records never animate even when an active ID has not yet been cleaned up',()=>{
  for(const status of ['ready','failed','unknown','refused']){const html=show([message('done',status)],['done']);assert.doesNotMatch(html,/data-workstation|已用/);assert.match(html,new RegExp(`data-status="${status}"`));}
});
test('only the latest relevant message can show the apparatus; old live IDs do not leak to another transcript',()=>{
  const html=show([message('old'),message('next')],['old','next']);assert.equal((html.match(/data-workstation/g)||[]).length,1);
  assert.doesNotMatch(show([message('other')],['old']),/data-workstation/);
});
test('a queued knowledge request has one research apparatus and respects paper suppression',()=>{
  const m={id:'k',at:1,role:'pending',query:'Synthetic term',explicit:true};assert.match(show([m]),/data-kind="research"/);assert.doesNotMatch(show([m],[],true),/data-workstation/);
});
