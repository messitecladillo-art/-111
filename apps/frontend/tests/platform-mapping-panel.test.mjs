import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {newQuestion,newQuestionnaire} from '../lib/questionnaire.ts';
import {parseMissingCodes,parseSurveyCsv} from '../lib/survey-analysis.ts';
import {canonical,prepareLinkedAnalysis,snapshotSignature} from '../lib/questionnaire-mapping.ts';
import {confirmPlatformMapping,createPlatformMapping,parsePlatformMapping,platformDatasetIdentity,platformMappingBackup} from '../lib/platform-data-mapping.ts';
import {previewPlatformAnalysis} from '../lib/platform-analysis-adapter.ts';
import {platformAnalysisCurrent,platformAnalysisDataset} from '../lib/platform-analysis-dataset.ts';

// Execute the actual component action bodies with controlled state. These tests
// check stale async results and interpretation guards; browser acceptance is separate.
const lab=ts.createSourceFile('SurveyLab.tsx',readFileSync(new URL('../components/analysis/SurveyLab.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const panel=ts.createSourceFile('PlatformMappingPanel.tsx',readFileSync(new URL('../components/analysis/PlatformMappingPanel.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function statements(tree,component){
  if(!component)return tree.statements;
  const fn=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===component);
  assert.ok(fn?.body,'Component action host must exist');
  return fn.body.statements;
}
function statement(tree,component,name){
  const found=statements(tree,component).find(n=>(ts.isFunctionDeclaration(n)&&n.name?.text===name)||(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&d.name.text===name)));
  assert.ok(found,`Actual declaration ${name} must exist`);
  return found.getText(tree);
}
const panelGlobals=compile(statement(panel,null,'own')+'\n'+statement(panel,null,'initial'));
function action(tree,component,name,env){
  const code=(tree===panel?panelGlobals:'')+compile(statement(tree,component,name));
  return new Function(...Object.keys(env),`${code};return ${name};`)(...Object.values(env));
}
function selection(dataset,mapping,designSnapshot,originalDataset=null,designTransfer=null){
  const code=compile(['sourceSnapshot','sourceTransfer','sourceSignature','mappingStale','interpretationPending','rawDataset','platformDesign'].map(name=>statement(lab,'SurveyLab',name)).join('\n'));
  return new Function('dataset','mapping','designSnapshot','originalDataset','designTransfer','snapshotSignature','platformAnalysisCurrent',`${code};return {sourceSnapshot,sourceTransfer,sourceSignature,mappingStale,interpretationPending,rawDataset,platformDesign};`)(dataset,mapping,designSnapshot,originalDataset,designTransfer,snapshotSignature,platformAnalysisCurrent);
}
function sharedSource(dataset,interpretationPending){
  const declaration=statements(lab,'SurveyLab').find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&d.name.text==='shared'));
  const initializer=declaration?.declarationList.declarations.find(d=>ts.isIdentifier(d.name)&&d.name.text==='shared')?.initializer;
  assert.ok(initializer&&ts.isCallExpression(initializer));
  const code=compile('const select='+initializer.arguments[0].getText(lab));
  return new Function('dataset','interpretationPending','missing',`${code};return select();`)(dataset,interpretationPending,{codes:[],error:null});
}
const sourceHash='c'.repeat(64);
const number=(id,variable)=>({...newQuestion(id,variable),text:'合成数值',type:'number',choices:[],min:0,max:30});
const columnAssignment=(questionId,column)=>({kind:'column',questionId,column,representation:'code',recodes:[],unmapped:'identity',missingCodes:[],userMissing:'preserve'});
async function fixture(){
  const table=parseSurveyCsv('H,I,N\n1,0,2\n0,1,4\n1,1,6');
  const design={...newQuestionnaire(),questions:[{...newQuestion('m','CHOICE'),text:'合成多选',type:'multi',choices:[{code:'a',label:'甲'},{code:'b',label:'乙'}]},number('n','VALUE')]};
  const assignments=[{kind:'binary-split',questionId:'m',columns:[{column:'H',optionCode:'a',selectedValues:['1'],unselectedValues:['0']},{column:'I',optionCode:'b',selectedValues:['1'],unselectedValues:['0']}],blankPolicy:'reject-partial',missingCodes:[],userMissing:'preserve'},columnAssignment('n','N')];
  const identity=await platformDatasetIdentity(table,null,sourceHash),mapping=await confirmPlatformMapping(createPlatformMapping(design,identity,assignments));
  const context={table,metadata:null,sourceHash,design},preview=await previewPlatformAnalysis(mapping,context,'strict');
  return {mapping,context,preview};
}
function rawDataset(f){return {table:f.context.table,identity:{importMetadata:null},hash:sourceHash,name:'synthetic.csv',kind:'user_provided',encoding:'csv'};}
function applyHarness(raw,designSnapshot,platformDesign,derive=platformAnalysisDataset){
  const state={adopted:[],bridges:[],originals:[]},datasetRef={current:raw},designRef={current:platformDesign},readEpoch={current:0};
  const call=action(lab,'SurveyLab','applyPlatform',{
    rawDataset:raw,designSnapshot,sourceSnapshot:selection(raw,null,designSnapshot).sourceSnapshot,datasetRef,designRef,readEpoch,platformAnalysisDataset:derive,canonical,snapshotSignature,
    setOriginalDataset:v=>state.originals.push(v),adopt:(v,keep)=>state.adopted.push({value:v,keep}),setMapping:v=>state.bridges.push(v),setSection:()=>{},setNotice:()=>{}
  });
  return {call,state,datasetRef,designRef,readEpoch};
}
function restoreHarness(table,design,drafts,approved=null){
  const context=canonical({sourceHash,metadata:null,design,table,drafts,policy:'strict'});
  const state={drafts,approved,result:approved?{fixture:true}:null,resultKey:approved?context:'',pending:null,error:'',notice:''};
  const epoch={current:0},latest={current:context},mounted={current:true};
  const env={table,metadata:null,sourceHash,design,context,epoch,latest,mounted,controller:{current:null},parsePlatformMapping,platformDatasetIdentity,canonical};
  for(const name of ['Drafts','Approved','Result','ResultKey','Pending','Error','Notice'])env['set'+name]=v=>{state[name[0].toLowerCase()+name.slice(1)]=v;};
  return {state,context,epoch,latest,mounted,call:action(panel,'PlatformMappingPanel','restore',env)};
}

test('raw SAV interpretation blocks overview, reliability, export and canvas transfer',()=>{
  const dataset={table:parseSurveyCsv('N\n1\n2'),savDetails:{fixture:true},name:'synthetic.sav',hash:sourceHash,kind:'user_provided'};
  const selected=selection(dataset,null,null);
  assert.equal(selected.interpretationPending,true);
  const env={dataset,...selected,profile:{}};
  const prepare=action(lab,'SurveyLab','prepareOverview',env);
  assert.ok(prepare(0,'numeric').problems.length);
  assert.deepEqual(prepare(0,'frequency').table.rows,[]);
  // Any unguarded side effect would reach a missing dependency and fail.
  action(lab,'SurveyLab','calculate',env)();
  const download=action(lab,'SurveyLab','exportSummary',env);
  download(false);download(true);
  assert.equal(sharedSource(dataset,selected.interpretationPending),null);
  assert.equal(sharedSource({table:dataset.table,name:'csv',hash:sourceHash,kind:'user_provided'},false).table,dataset.table);
});

test('derived multiselect columns cannot enter manual numerical analysis after unlink',async()=>{
  const f=await fixture(),v=await platformAnalysisDataset(f.mapping,f.preview,f.context);
  const dataset={table:v.table,identity:v.identity,platform:{mapping:f.mapping,preview:v.preview}};
  const snapshot={design:f.context.design,pending:false};
  assert.equal(selection(dataset,v.mapping,snapshot).interpretationPending,false);
  const selected=selection(dataset,null,snapshot),index=v.table.headers.findIndex(h=>h.endsWith('__a'));
  assert.ok(index>=0);
  const prepare=action(lab,'SurveyLab','prepareOverview',{dataset,mapping:null,...selected,prepareLinkedAnalysis,missing:{codes:[]},routing:{}});
  assert.ok(prepare(index,'numeric').problems.length);
  assert.equal(sharedSource(dataset,false),null,'v2 remains withheld from canvas until semantic adapter exists');
});

test('pending source design prevents applying an older bound platform preview',async()=>{
  const f=await fixture(),raw=rawDataset(f),oldSnapshot={design:f.context.design,pending:false};
  const design=structuredClone(f.context.design);design.questions[1].text='尚未保存的修改';
  const snapshot={design,pending:true},mapping={design:f.context.design,sourceSignature:snapshotSignature(oldSnapshot)};
  const selected=selection(raw,mapping,snapshot);
  assert.equal(selected.mappingStale,true);
  assert.equal(selected.platformDesign,null);
  const h=applyHarness(raw,snapshot,selected.platformDesign);
  assert.equal(await h.call({mapping:f.mapping,preview:f.preview},new AbortController().signal),false);
  assert.equal(h.state.adopted.length,0);
});

test('unlink retains dataset source binding when questionnaire is pending, absent or changed',async()=>{
  const f=await fixture(),v=await platformAnalysisDataset(f.mapping,f.preview,f.context),snapshot={design:f.context.design,pending:false};
  const dataset={table:v.table,identity:v.identity,platform:{mapping:f.mapping,preview:v.preview},platformSourceSignature:snapshotSignature(snapshot)};
  for(const current of [{design:f.context.design,pending:true},null,{design:{...f.context.design,title:'changed'},pending:false}]){
    const selected=selection(dataset,null,current);
    assert.equal(selected.sourceSignature,dataset.platformSourceSignature);
    assert.equal(selected.mappingStale,true);
    assert.equal(selected.interpretationPending,true);
    assert.equal(selected.platformDesign,null);
  }
});

test('late platform apply cannot overwrite a new dataset, design, epoch or cancelled request',async()=>{
  const f=await fixture(),v=await platformAnalysisDataset(f.mapping,f.preview,f.context),snapshot={design:f.context.design,pending:false};
  for(const cause of ['dataset','design','epoch','abort']){
    const raw=rawDataset(f),signal=new AbortController();let release;
    const h=applyHarness(raw,snapshot,f.context.design,()=>new Promise(resolve=>{release=resolve;}));
    const running=h.call({mapping:f.mapping,preview:f.preview},signal.signal);
    if(cause==='dataset')h.datasetRef.current={...raw,name:'replacement.csv'};
    if(cause==='design')h.designRef.current=structuredClone(f.context.design);
    if(cause==='epoch')h.readEpoch.current++;
    if(cause==='abort')signal.abort();
    release(structuredClone(v));
    assert.equal(await running,false,cause);
    assert.deepEqual(h.state,{adopted:[],bridges:[],originals:[]});
  }
});

test('valid platform apply stores source binding; return to original uses the exact untouched source',async()=>{
  const f=await fixture(),raw=rawDataset(f),before=structuredClone(raw.table),snapshot={design:f.context.design,pending:false};
  const h=applyHarness(raw,snapshot,f.context.design);
  assert.equal(await h.call({mapping:f.mapping,preview:f.preview},new AbortController().signal),true);
  assert.equal(h.state.adopted[0].keep,true);
  assert.equal(h.state.adopted[0].value.platformSourceSignature,snapshotSignature(snapshot));
  assert.equal(h.state.bridges[0].sourceSignature,snapshotSignature(snapshot));
  assert.equal(h.state.originals[0],raw);
  let restored,section;const readEpoch={current:4};
  action(lab,'SurveyLab','restoreOriginal',{originalDataset:raw,readEpoch,adopt:v=>{restored=v;},setSection:v=>{section=v;},setNotice:()=>{}})();
  assert.equal(restored,raw);
  assert.equal(readEpoch.current,5);
  assert.equal(section,'mapping');
  assert.deepEqual(raw.table,before);
});

test('restoring an identical v2 backup clears old approval even when context hash is unchanged',async()=>{
  const table=parseSurveyCsv('N\n1\n2'),design={...newQuestionnaire(),questions:[number('n','VALUE')]};
  const identity=await platformDatasetIdentity(table,null,sourceHash),mapping=await confirmPlatformMapping(createPlatformMapping(design,identity,[columnAssignment('n','N')]));
  const initial= new Function(`${panelGlobals};return initial;`)();
  const h=restoreHarness(table,design,{n:{...initial(),enabled:true,column:'N'}},mapping);
  await h.call(new File([platformMappingBackup(mapping)],'mapping.json'));
  assert.equal(canonical({sourceHash,metadata:null,design,table,drafts:h.state.drafts,policy:'strict'}),h.context);
  assert.equal(h.state.approved,null);
  assert.equal(h.state.result,null);
  assert.equal(h.state.resultKey,'');
  assert.equal(h.state.error,'');
});

test('restoring a backup after context change leaves the new draft unchanged',async()=>{
  const table=parseSurveyCsv('N\n1\n2'),design={...newQuestionnaire(),questions:[number('n','VALUE')]};
  const identity=await platformDatasetIdentity(table,null,sourceHash),mapping=await confirmPlatformMapping(createPlatformMapping(design,identity,[columnAssignment('n','N')]));
  const drafts={marker:'new-context'},h=restoreHarness(table,design,drafts);let release;
  const reading=h.call({size:100,text:()=>new Promise(resolve=>{release=resolve;})});
  h.latest.current='replacement-context';h.epoch.current++;
  release(platformMappingBackup(mapping));await reading;
  assert.equal(h.state.drafts,drafts);
  assert.equal(h.state.resultKey,'');
});

test('legal prototype-name question IDs restore as own drafts and updates keep all defaults',async()=>{
  const table=parseSurveyCsv('N,C\n1,2\n2,3'),design={...newQuestionnaire(),questions:[number('__proto__','VALUE'),number('constructor','OTHER')]};
  const identity=await platformDatasetIdentity(table,null,sourceHash),mapping=await confirmPlatformMapping(createPlatformMapping(design,identity,[columnAssignment('__proto__','N'),columnAssignment('constructor','C')]));
  const h=restoreHarness(table,design,{});
  await h.call(new File([platformMappingBackup(mapping)],'special-id.json'));
  assert.equal(h.state.error,'');
  assert.equal(Object.getPrototypeOf(h.state.drafts),Object.prototype);
  assert.equal(Object.values(h.state.drafts).filter(d=>d.enabled).length,2);
  for(const id of ['__proto__','constructor']){
    assert.ok(Object.hasOwn(h.state.drafts,id));
    let drafts={};
    const update=action(panel,'PlatformMappingPanel','update',{setDrafts:fn=>{drafts=fn(drafts);},setError:()=>{},setNotice:()=>{}});
    update(id,{enabled:true});
    assert.ok(Object.hasOwn(drafts,id));
    assert.equal(drafts[id].column,'');
    assert.equal(drafts[id].selected,'1');
    assert.equal(drafts[id].blank,'reject-partial');
    assert.equal(Object.getPrototypeOf(drafts),Object.prototype);
  }
});

test('prototype-name option codes never bind an inherited value as a data column',()=>{
  const design={...newQuestionnaire(),questions:[{...newQuestion('m','CHOICE'),type:'multi',choices:[{code:'__proto__',label:'甲'},{code:'constructor',label:'乙'}]}]};
  const initial=new Function(`${panelGlobals};return initial;`)();
  const assignments=action(panel,'PlatformMappingPanel','assignments',{design,drafts:{m:{...initial(),enabled:true}},parseMissingCodes})();
  assert.deepEqual(assignments[0].columns.map(c=>c.column),['','']);
  const columns=Object.fromEntries([['__proto__','H'],['constructor','I']]);
  const actual=action(panel,'PlatformMappingPanel','assignments',{design,drafts:{m:{...initial(),enabled:true,columns}},parseMissingCodes})();
  assert.deepEqual(actual[0].columns.map(c=>c.column),['H','I']);
});

test('different per-column multiselect tokens in a backup are refused without changing drafts',async()=>{
  const f=await fixture(),mapping=structuredClone(f.mapping);
  mapping.assignments[0].columns[1].selectedValues=['Y'];
  mapping.assignments[0].columns[1].unselectedValues=['N'];
  const verified=await confirmPlatformMapping(createPlatformMapping(f.context.design,mapping.dataset,mapping.assignments));
  const drafts={marker:'keep'},h=restoreHarness(f.context.table,f.context.design,drafts);
  await h.call(new File([platformMappingBackup(verified)],'per-column.json'));
  assert.ok(h.state.error.includes('逐列取值规则不同'));
  assert.equal(h.state.drafts,drafts);
  assert.equal(h.state.approved,null);
});

test('XLSX coordinates stay hashed and invalid or unknown coordinate metadata is rejected',async()=>{
  const table=parseSurveyCsv('N\n1\n2'),metadata={schema:'survey-import-metadata/v1',parser:'xlsx-local/v3',selection:{sheetId:'sheet-0',headerRow:1,range:'A1:A3'},columns:[{id:'N',label:'数值',questionNumber:null,headerRef:'A1',columnIndex:0,columnLetter:'A'}]};
  const original=await platformDatasetIdentity(table,metadata,sourceHash);
  const changed=structuredClone(metadata);changed.columns[0].columnIndex=1;
  assert.notEqual((await platformDatasetIdentity(table,changed,sourceHash)).interpretationHash,original.interpretationHash);
  for(const patch of [{columnIndex:-1},{columnIndex:16384},{columnIndex:1.5},{columnLetter:'a'},{columnLetter:'AAAA'},{columnLetter:'A1'},{unknownCoordinate:1}]){
    const invalid=structuredClone(metadata);Object.assign(invalid.columns[0],patch);
    await assert.rejects(platformDatasetIdentity(table,invalid,sourceHash));
  }
});

test('collection source stays bound to its frozen published questionnaire despite local edits and transfers',async()=>{
 const f=await fixture(),raw=rawDataset(f),frozen={design:f.context.design,pending:false};
 raw.collection={projectId:'project',releaseId:'release',versionId:'version',questionnaireRevision:3,classification:'actual',snapshotHash:sourceHash,generatedAt:'2026-10-14T00:00:00Z',design:f.context.design};
 const changed=structuredClone(f.context.design);changed.questions[1].text='工作台未保存的后续修改';
 const local={design:changed,pending:true},transfer={id:'new-questionnaire',snapshot:local};
 const selected=selection(raw,{design:f.context.design,sourceSignature:snapshotSignature(frozen)},local,null,transfer);
 assert.equal(selected.sourceSnapshot.design,f.context.design);assert.equal(selected.sourceSnapshot.pending,false);assert.equal(selected.sourceTransfer,null);assert.equal(selected.mappingStale,false);assert.equal(selected.platformDesign,f.context.design);
 const h=applyHarness(raw,local,selected.platformDesign);assert.equal(await h.call({mapping:f.mapping,preview:f.preview},new AbortController().signal),true);
 assert.equal(h.state.adopted[0].value.platformSourceSignature,snapshotSignature(frozen));assert.equal(h.state.bridges[0].sourceSignature,snapshotSignature(frozen));assert.equal(h.state.adopted[0].value.collection,raw.collection);assert.equal(h.state.originals[0],raw);
});
test('mapping bound to a later local questionnaire cannot override a frozen collection source',async()=>{
 const f=await fixture(),raw=rawDataset(f);raw.collection={design:f.context.design,questionnaireRevision:3};
 const changed=structuredClone(f.context.design);changed.questions[1].text='另一个施测版本';
 const local={design:changed,pending:false},selected=selection(raw,{design:changed,sourceSignature:snapshotSignature(local)},local);
 assert.equal(selected.sourceSnapshot.design,f.context.design);assert.equal(selected.sourceTransfer,null);assert.equal(selected.mappingStale,true);assert.equal(selected.platformDesign,null);
 const h=applyHarness(raw,local,selected.platformDesign);assert.equal(await h.call({mapping:f.mapping,preview:f.preview},new AbortController().signal),false);assert.deepEqual(h.state,{adopted:[],bridges:[],originals:[]});
});
