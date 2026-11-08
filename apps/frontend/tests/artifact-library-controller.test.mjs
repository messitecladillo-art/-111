import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as artifacts from '../lib/agent/artifact-library.ts';
import * as model from '../lib/editor-model.ts';
import * as figures from '../lib/report-figure.ts';
import * as frames from '../lib/report-frame.ts';
import * as vectors from '../lib/vector-assets.ts';
import * as tweaks from '../lib/agent/figure-tweak.ts';
import {snapshotRecipe} from '../lib/research-quality.ts';
const source=fs.readFileSync(new URL('../components/agent/useArtifactLibrary.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function libraryOf(seeds){return artifacts.mergeArtifacts(artifacts.emptyArtifactLibrary(),await Promise.all(seeds.map(async seed=>({seed,hash:await artifacts.artifactHash(seed.value)}))),'2026-11-09T00:00:00Z');}
async function figureFixture(){
 const result=await snapshotRecipe({method:'frequency',interpretation:'仅作合成软件验证',n:3,total:3,excluded:0,missingRows:0,invalidRows:0,headers:['类别','人数'],rows:[['甲',1],['乙',2]],metrics:[],warnings:[]},{title:'合成检验',sourceName:'合成测试数据',sourceUrl:'',sourceHash:'a'.repeat(64),classification:'simulated'},'test-result');
 const first=figures.figureFromResult(result,'bar',1,'first-figure'),second=figures.figureFromResult(result,'horizontal_bar',1,'second-figure'),visualStyle=figures.defaultProjectVisualStyle();
 const report=model.parseEditorContent({...model.createEditorContent(),version:3,quality:{version:1,results:[result],findings:[]},figures:[first,second],visualStyle});
 const seeds=artifacts.collectReportArtifacts(report,'合成测试','stored',false);return {result,first,second,report,seeds,library:await libraryOf(seeds)};
}
function harness({stored=artifacts.emptyArtifactLibrary(),read,approve,captureFailure=false}={}){
 const slots=[],layouts=[],effects=[],timers=new Map(),captures=[],uses=[],drafts=[],downloads=[],stores=new Map();let cursor=0,timerId=0,props,api;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
 const hooks={
  useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],next=>{slots[index]=typeof next==='function'?next(slots[index]):next;}];},
  useRef(initial){const index=cursor++;return slots[index]??={current:initial};},
  useMemo(create,deps){const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps))slots[index]={value:create(),deps};return slots[index].value;},
  useCallback(callback,deps){return hooks.useMemo(()=>callback,deps);},
 };
 for(const [name,queue] of [['useLayoutEffect',layouts],['useEffect',effects]])hooks[name]=(effect,deps)=>{const index=cursor++,previous=slots[index];if(!previous||!same(previous.deps,deps))queue.push(()=>{previous?.cleanup?.();slots[index]={deps,cleanup:effect()};});};
 const jsx=(type,values,key)=>({type,key,props:values??{}});
 const modules={
  react:hooks,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'@/components/math/Tex':{Formula:'Formula'},
  '@/lib/editor-model':model,'@/lib/report-figure':{...figures,parseReportFigure:value=>figures.parseReportFigure(structuredClone(value))},
  '@/lib/report-frame':{...frames,parseReportFrame:value=>frames.parseReportFrame(structuredClone(value)),approveReportFrame:approve??frames.approveReportFrame},
  '@/lib/vector-assets':vectors,'@/lib/agent/figure-tweak':tweaks,
  '@/lib/agent/artifact-library':{...artifacts,
   readArtifactLibrary:async scope=>read?read(scope):stores.get(scope)??stored,
   captureArtifacts:async(scope,seeds)=>{if(captureFailure)throw Error('Synthetic storage refusal');captures.push({scope,seeds:structuredClone(seeds)});const before=stores.get(scope)??stored;const next=artifacts.mergeArtifacts(before,await Promise.all(seeds.map(async seed=>({seed,hash:await artifacts.artifactHash(seed.value)}))),'2026-11-09T00:00:00Z');stores.set(scope,next);return next;},
   updateArtifactLibrary:async(scope,update)=>{const next=update(stores.get(scope)??stored);stores.set(scope,next);return next;},
  },
 };
 const exports={};const urls=new Map();
 const live={scope:artifacts.artifactScope('owner-a','project-a'),content:model.createEditorContent(),sectionId:'section-2',blocked:false};
 vm.runInNewContext(compiled,{exports,require:name=>{assert.ok(modules[name],`Unexpected dependency ${name}`);return modules[name];},crypto,structuredClone,TextEncoder,TextDecoder,Uint8Array,Blob,File,btoa,atob,console,
  URL:{createObjectURL:blob=>{const url=`blob:synthetic-${urls.size}`;urls.set(url,blob);return url;},revokeObjectURL:url=>urls.delete(url)},
  document:{createElement:()=>({href:'',download:'',click(){downloads.push({name:this.download,blob:urls.get(this.href)});}})},
  setTimeout:callback=>{timers.set(++timerId,callback);return timerId;},clearTimeout:id=>timers.delete(id),
 });
 props={owner:'owner-a',projectId:'project-a',content:null,candidate:null,selectedSectionId:'section-2',readCurrent:()=>live,apply:(record,sectionId)=>{uses.push({record,sectionId});return {ok:true};},onSay:text=>drafts.push(text)};
 const h={exports,live,captures,uses,drafts,downloads,stores,timers,get api(){return api;},
  render(next){if(next)props={...props,...next};cursor=0;layouts.length=0;effects.length=0;api=exports.useArtifactLibrary(props);for(const effect of layouts.splice(0))effect();for(const effect of effects.splice(0))effect();return api;},
  async settle(){for(let i=0;i<200;i++){await new Promise(done=>setTimeout(done,1));h.render();if(i>=6&&!api.busy)return api;}throw Error('Hook queue did not settle within the bounded test wait');},
  async flushTimers(){for(const [id,callback]of [...timers]){timers.delete(id);callback();}return h.settle();},
  switch(project){live.scope=artifacts.artifactScope('owner-a',project);h.render({projectId:project});},
  find(node,predicate){if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const child of node){const match=h.find(child,predicate);if(match)return match;}return null;}return predicate(node)?node:h.find(node.props?.children,predicate);},
 };
 h.render();return h;
}
const png=()=>new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=','base64')],'one.png',{type:'image/png'});

test('local imports check real signatures, MIME/extension consistency, size and active SVG content',async()=>{
 const h=harness(),file=png(),value=await h.exports.readArtifactImage(file);assert.equal(value.mime,'image/png');assert.deepEqual(Buffer.from(value.dataUrl.split(',')[1],'base64'),Buffer.from(await file.arrayBuffer()));
 await assert.rejects(h.exports.readArtifactImage(new File([await file.arrayBuffer()],'wrong.jpg',{type:'image/jpeg'})));
 await assert.rejects(h.exports.readArtifactImage({size:6_000_001,arrayBuffer(){throw Error('must not read');}}));
 for(const svg of ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>','<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.invalid/image.png"/></svg>'])await assert.rejects(h.exports.readArtifactImage(new File([svg],'unsafe.svg',{type:'image/svg+xml'})));
 const svg='<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';const safe=await h.exports.readArtifactImage(new File([svg],'safe.svg',{type:'image/svg+xml'}));assert.equal(Buffer.from(safe.dataUrl.split(',')[1],'base64').toString(),svg);
});
test('figure commands fork the exact selected version and preserve registered evidence and sibling objects',async()=>{
 const fixture=await figureFixture(),h=harness({stored:fixture.library}),record=fixture.library.records.find(r=>r.familyId==='figure:second-figure'),before=JSON.stringify(fixture);
 const seed=h.exports.artifactFigureCommand(record,'隐藏数值标签');assert.equal(seed.value.figure.style.showLabels,false);assert.notEqual(seed.value.figure.id,record.value.figure.id);assert.equal(seed.familyId,record.familyId);assert.equal(seed.value.result.resultHash,record.value.result.resultHash);assert.equal(seed.value.figure.resultHash,record.value.figure.resultHash);assert.equal(JSON.stringify(fixture),before);
 assert.throws(()=>h.exports.artifactFigureCommand({...record,value:{...record.value,figure:{...record.value.figure,resultHash:'b'.repeat(64)}}},'隐藏数值标签'));
 assert.throws(()=>h.exports.artifactFigureCommand(record,'字体大一点'));
});
test('late load and retained callbacks cannot cross scope A to B to A',async()=>{
 const fixture=await figureFixture(),late=deferred();let readCount=0;const h=harness({read:async scope=>scope===artifacts.artifactScope('owner-a','project-a')&&readCount++===0?late.promise:fixture.library});
 await tick();h.switch('project-b');await h.settle();const oldUse=h.api.onUse;h.switch('project-a');await h.settle();const selected=h.api.selectedId;late.resolve(await libraryOf([{familyId:'secret',kind:'text',title:'Old delayed data',origin:'old',status:'stored',classification:'unclassified',value:{type:'text',section:{id:'old',title:'old',body:'old',source:''}}}]));await h.settle();
 assert.ok(!h.api.items.some(item=>item.familyId==='secret'));oldUse(selected);await h.settle();assert.equal(h.uses.length,0);
});
test('initial report capture includes text once, later automatic capture is visual only and completed candidates survive discard',async()=>{
 const report=model.createEditorContent(),h=harness();report.report[1].body='已保存的自写研究正文';h.live.content=report;h.render({content:report});await h.settle();await h.flushTimers();assert.ok(h.captures[0].seeds.some(seed=>seed.value.type==='text'));
 const edited={...report,report:report.report.map((s,i)=>i===1?{...s,body:'Current authored prose'}:s)};h.live.content=edited;h.render({content:edited});await h.settle();await h.flushTimers();assert.ok(h.captures.at(-1).seeds.every(seed=>seed.value.type!=='text'));
 const candidate={...edited,title:'Candidate title',report:edited.report.map((s,i)=>i===1?{...s,body:'Completed candidate prose'}:s)};h.render({candidate:{id:'completed-run',report:candidate}});await h.settle();assert.ok(h.api.items.some(item=>item.status==='candidate'));const ids=h.api.items.map(item=>item.id);h.render({candidate:null});await h.settle();assert.deepEqual(h.api.items.map(item=>item.id),ids);
 h.api.onCapture();await h.settle();assert.ok(h.captures.at(-1).seeds.some(seed=>seed.value.type==='text'&&seed.value.section.body==='Current authored prose'));
});
test('fresh scope or blocked state rejects report reuse without waiting for a hook render',async()=>{
 const fixture=await figureFixture(),h=harness({stored:fixture.library});await h.settle();const record=fixture.library.records.find(r=>r.familyId==='figure:second-figure');h.api.onSelect(record.id);h.render();h.live.blocked=true;h.api.onUse(record.id);await h.settle();assert.equal(h.uses.length,0);assert.ok(h.api.error);
 h.live.blocked=false;h.live.scope='different synchronous scope';h.api.onUse(record.id);h.api.onCommand(record.id,'修改标题');await tick();assert.equal(h.uses.length,0);assert.equal(h.drafts.length,0);
});
test('frame approval finishing after leaving scope cannot persist or apply into the new project',async()=>{
 const frame=frames.createReportFrame(figures.defaultProjectVisualStyle()),stored=await libraryOf([{familyId:'frame:report',kind:'frame',title:frame.title,origin:'test',status:'stored',classification:'unclassified',value:{type:'frame',frame}}]),wait=deferred(),h=harness({stored,approve:()=>wait.promise});await h.settle();h.api.onUse(h.api.selectedId);await tick();h.switch('project-b');wait.resolve(await frames.approveReportFrame(frame,'owner-a'));await h.settle();assert.equal(h.uses.length,0);assert.equal(h.captures.length,0);
});
test('manual chart edit saves a new library version and applies only after explicit Use acknowledgement',async()=>{
 const fixture=await figureFixture(),h=harness({stored:fixture.library});await h.settle();const record=fixture.library.records.find(r=>r.familyId==='figure:second-figure');h.api.onSelect(record.id);h.render();h.api.onEdit(record.id);h.render();const title=h.find(h.api.preview,node=>node.props?.['aria-label']==='素材标题');title.props.onChange({target:{value:'Edited figure'}});h.render();h.api.preview.props.onSubmit({preventDefault(){}});await h.settle();assert.equal(h.uses.length,0);const newId=h.api.selectedId;assert.notEqual(newId,record.id);const edited=h.api.items.find(item=>item.id===newId);assert.equal(edited.title,'Edited figure');assert.equal(edited.version,record.version+1);h.api.onUse(newId);await h.settle();assert.equal(h.uses.length,1);assert.notEqual(h.uses[0].record.value.figure.id,record.value.figure.id);assert.equal(h.uses[0].record.value.result.resultHash,record.value.result.resultHash);assert.equal(fixture.second.title,record.value.figure.title);
});
test('unsupported commands retain the typed instruction and exact selected identity in a local draft without asset data',async()=>{
 const fixture=await figureFixture(),h=harness({stored:fixture.library});await h.settle();const record=fixture.library.records.find(r=>r.familyId==='figure:second-figure');h.api.onSelect(record.id);h.render();h.api.onCommand(record.id,'请把标题缩短一些');assert.equal(h.drafts.length,1);assert.ok(h.drafts[0].includes('请把标题缩短一些'));assert.ok(h.drafts[0].includes(record.id));assert.ok(h.drafts[0].includes(record.hash));assert.ok(!h.drafts[0].includes(JSON.stringify(record.value.result.rows)));assert.equal(h.uses.length,0);
});
test('imported image Use downloads original bytes and storage refusal retains existing objects',async()=>{
 const h=harness();await h.settle();const file=png();h.api.onImport(file,'cover');await h.settle();const id=h.api.selectedId;assert.ok(id);assert.equal(h.captures[0].seeds[0].classification,'unclassified');h.api.onUse(id);await h.settle();assert.equal(h.uses.length,0);assert.equal(h.downloads.length,1);assert.deepEqual(Buffer.from(await h.downloads[0].blob.arrayBuffer()),Buffer.from(await file.arrayBuffer()));
 h.api.onImport(png(),'diagram',{origin:'内置示例',classification:'simulated'});await h.settle();assert.equal(h.captures.at(-1).seeds[0].origin,'内置示例');assert.equal(h.captures.at(-1).seeds[0].classification,'simulated');
 const fixture=await figureFixture(),failed=harness({stored:fixture.library,captureFailure:true});await failed.settle();const old=failed.api.items.map(item=>item.id);failed.api.onImport(png(),'diagram');await failed.settle();assert.deepEqual(failed.api.items.map(item=>item.id),old);assert.ok(failed.api.error);
});

test('a returned section candidate remains available after dismissal without adopting or calling a model',async()=>{
 const seed={familyId:'section:section-2',kind:'text',title:'本节候选',origin:'本节修订候选',status:'candidate',classification:'unclassified',value:{type:'text',section:{id:'section-2',title:'本节候选',body:'模型已返回的修订正文',source:'原章节来源'},resultHashes:{}}};
 const h=harness();await h.settle();h.render({sectionCandidate:{id:'section-receipt-1',seed}});await h.settle();const record=h.api.items.find(item=>item.origin==='本节修订候选');assert.ok(record);assert.equal(record.status,'candidate');assert.equal(h.uses.length,0);assert.equal(h.drafts.length,0);
 h.render({sectionCandidate:null});await h.settle();assert.ok(h.api.items.some(item=>item.id===record.id));h.render({sectionCandidate:{id:'section-receipt-1',seed}});await h.settle();assert.equal(h.api.items.filter(item=>item.familyId===seed.familyId).length,1);
});

test('account storage is loaded once the same-scope thread hydration fence becomes ready',async()=>{
 const fixture=await figureFixture();let ready=false;
 const h=harness({stored:fixture.library});h.live.scope=null;h.render({readCurrent:()=>({...h.live,scope:ready?artifacts.artifactScope('owner-a','project-a'):null})});await h.settle();assert.equal(h.api.items.length,0);
 ready=true;h.live.scope=artifacts.artifactScope('owner-a','project-a');h.render({readCurrent:()=>h.live});await h.settle();assert.equal(h.api.items.length,fixture.library.records.length);assert.ok(h.api.items.some(item=>item.familyId==='figure:first-figure'));
});
