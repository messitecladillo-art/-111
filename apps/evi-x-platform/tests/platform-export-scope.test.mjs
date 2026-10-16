import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {newQuestion,newQuestionnaire} from '../lib/questionnaire.ts';
import {parseSurveyCsv,profileSurvey,analyzeReliability} from '../lib/survey-analysis.ts';
import {datasetIdentity,mappingCurrent} from '../lib/questionnaire-mapping.ts';
import {numericColumnRecords} from '../lib/analysis-summary.ts';
import {routingSummary} from '../lib/routing-evidence.ts';
import {platformDatasetIdentity,createPlatformMapping,confirmPlatformMapping} from '../lib/platform-data-mapping.ts';
import {previewPlatformAnalysis} from '../lib/platform-analysis-adapter.ts';
import {platformAnalysisDataset,platformAnalysisCurrent} from '../lib/platform-analysis-dataset.ts';

// Exercise the actual download action with synthetic, genuinely approved v2
// data. React setters and browser downloads are captured; calculators are real.
const source=readFileSync(new URL('../components/analysis/SurveyLab.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('SurveyLab.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const component=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='SurveyLab');
const action=component?.body?.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='exportSummary');
assert.ok(action,'The real export action must exist');
const constants=tree.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['format','SOURCES'].includes(d.name.getText(tree))));
const code=ts.transpileModule([...constants.map(n=>n.getText(tree)),action.getText(tree)].join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function harness(f,overrides={}){
 const downloads=[],notices=[];
 const env={dataset:f.dataset,rawDataset:f.original,profile:profileSurvey(f.dataset.table,[]),interpretationPending:false,missing:{codes:[]},mapping:f.mapping,mappingStale:false,routing:{policy:'strict',confirmed:true},currentResult:null,currentEligibility:null,construct:'合成构念',selected:[1,2],reverse:[],minText:'0',maxText:'6',activeLink:null,numericColumnRecords,mappingCurrent,routingSummary,displayColumn:id=>id,saveText:(content,name,type)=>downloads.push({content,name,type}),setNotice:value=>notices.push(value),...overrides};
 const call=new Function(...Object.keys(env),`${code}\nreturn exportSummary;`)(...Object.values(env));
 return {call,downloads,notices,env};
}
const hash='a'.repeat(64);
async function fixture(){
 const rows=Array.from({length:10},(_,i)=>[i<4?'1':'0',i<4?String(i*2):'',i<4?String(i*2):'',i<4?'0':'',i<4?`DERIVED_RESPONSE_SECRET_${i}`:'',...Array.from({length:3},(_,j)=>`ORIGINAL_RESPONSE_SECRET_${i}_${j}`)]);
 const table=parseSurveyCsv(['P,S1,S2,Z,T,R1,R2,R3',...rows.map(row=>row.join(','))].join('\n'));
 const original={name:'synthetic.csv',hash,kind:'user_provided',encoding:'utf-8',table,identity:await datasetIdentity(hash,'utf-8',table)};
 const design=newQuestionnaire();design.title='合成导出验收';
 design.questions=[{...newQuestion('parent','P'),text:'筛选',choices:[{code:'1',label:'符合'},{code:'0',label:'不符合'}]},...['S1','S2','Z','T'].map(variable=>({...newQuestion(variable,variable),text:variable,type:variable==='T'?'text':'number',choices:[],min:0,max:6,condition:{questionId:'parent',codes:['1']}}))];
 const assignments=design.questions.map(q=>({kind:'column',questionId:q.id,column:q.variable,representation:'code',recodes:[],unmapped:'identity',missingCodes:[],userMissing:'preserve'}));
 const mapping=await confirmPlatformMapping(createPlatformMapping(design,await platformDatasetIdentity(table,null,hash),assignments));
 const context={table,metadata:null,sourceHash:hash,design},preview=await previewPlatformAnalysis(mapping,context,'strict');
 const view=await platformAnalysisDataset(mapping,preview,context),platform={mapping,preview};
 assert.ok(platformAnalysisCurrent(platform,view.mapping,view.identity,false));
 assert.equal(original.table.rows.length,10);assert.equal(original.table.headers.length,8);
 assert.equal(view.table.rows.length,4);assert.equal(view.table.headers.length,5);
 return {original,dataset:{...original,table:view.table,identity:view.identity,encoding:'平台解释 v2 · 共同应答范围',platform},mapping:view.mapping};
}
function json(h){h.call(false);assert.equal(h.downloads.length,1);return JSON.parse(h.downloads[0].content);}
function assertNoAnswers(value){
 const content=JSON.stringify(value);assert.ok(!content.includes('RESPONSE_SECRET_'));
 function visit(item){if(!item||typeof item!=='object')return;for(const [key,value] of Object.entries(item)){assert.ok(!['table','rawRows','importMetadata','savDetails','answerCells'].includes(key),key);if(key==='rows')assert.equal(typeof value,'number');visit(value);}}
 visit(value);
}

test('v2 JSON separately records original 10×8 and common-response 4×5 with existing identity fingerprints',async()=>{
 const f=await fixture(),r=json(harness(f)),selection=f.dataset.identity.importMetadata.selection;
 assert.equal(r.profile.scope,'platform_common_response_cell_check');assert.equal(r.profile.rows,4);
 assert.deepEqual([r.dataScope.original.rows,r.dataScope.original.columns],[10,8]);
 assert.deepEqual([r.dataScope.analysis.rows,r.dataScope.analysis.columns],[4,5]);
 assert.deepEqual(r.dataScope.original.identity,f.original.identity);
 assert.equal(r.dataScope.analysis.interpretationHash,f.dataset.identity.interpretationHash);
 for(const key of ['sourceInterpretationHash','mappingHash','scopeHash'])assert.equal(r.dataScope[key],selection[key]);
 assert.equal(r.source.encoding,'utf-8');assert.equal(r.source.sha256,hash);assert.equal(r.interpretationHash,f.dataset.identity.interpretationHash);
});
test('v2 TXT labels original record count and derived missing/duplicate checks separately',async()=>{
 const h=harness(await fixture());h.call(true);const text=h.downloads[0].content;
 assert.ok(text.includes('原文件共读取 10 条记录、8 列。'));assert.ok(text.includes('当前共同应答范围 4 条记录、5 列'));
 assert.ok(text.includes('不是原文件缺失口径'));assert.ok(text.includes('当前共同应答范围内完全相同记录'));
 assert.ok(!text.includes('原文件共读取 4'));assert.ok(!text.includes('有效答卷数'));
 for(const label of ['原表解析身份 SHA-256','平台原始解释指纹','平台映射指纹','共同应答范围指纹'])assert.ok(text.includes(label));
});
test('JSON and TXT never include original or derived answers or opaque import metadata',async()=>{
 const f=await fixture();f.original.identity.importMetadata={answerCells:[['ORIGINAL_RESPONSE_SECRET_EXTRA']]};
 f.dataset.identity.importMetadata.selection.rawRows=[['DERIVED_RESPONSE_SECRET_EXTRA']];
 const h=harness(f),r=json(h);assertNoAnswers(r);h.call(true);assert.ok(!h.downloads[1].content.includes('RESPONSE_SECRET_'));
 assert.deepEqual(Object.keys(r.dataScope.original.identity).sort(),['sourceHash','interpretationHash','parser','encoding','delimiter','headers','rows'].sort());
});
test('export reads original dimensions without profiling or scanning original answers',async()=>{
 const f=await fixture();f.original.table.rows=new Proxy(f.original.table.rows,{get(target,key){if(key==='length')return target.length;throw Error(`Original answers read: ${String(key)}`);}});
 const h=harness(f);h.call(false);h.call(true);assert.equal(h.downloads.length,2);
});
test('real numerical records, zero means and reliability results are unchanged by scope metadata',async()=>{
 const f=await fixture(),before=structuredClone(f),currentResult=analyzeReliability(f.dataset.table,{columns:[1,2],reverse:[],min:0,max:6,missingCodes:[]});
 const expected=numericColumnRecords(f.dataset.table,[],f.mapping,f.dataset.identity,false,{policy:'strict',confirmed:true});
 const h=harness(f,{currentResult}),r=json(h);assert.deepEqual(r.numericSummaries,expected);assert.deepEqual(r.reliability.result,currentResult);
 assert.equal(r.numericSummaries[3].column.stats.mean,0);assert.equal(r.numericSummaries[1].column.stats.min,0);assert.equal(r.reliability.result.alpha,1);
 h.call(true);assert.ok(h.downloads[1].content.includes('均值=0'));assert.ok(h.downloads[1].content.includes('Cronbach α=1'));
 assert.deepEqual(f,before);
});
test('legacy CSV exports retain raw scope, structure and wording without added v2 metadata',async()=>{
 const f=await fixture();f.dataset=f.original;f.mapping=null;const h=harness(f),r=json(h);
 assert.equal(r.profile.scope,'raw_file_cell_check');assert.equal(r.profile.rows,10);assert.ok(!Object.hasOwn(r,'dataScope'));
 assert.deepEqual(r.source,{name:f.original.name,sha256:hash,classification:'user_provided',encoding:'utf-8',delimiter:',',skippedBlankLines:0});
 h.call(true);assert.ok(h.downloads[1].content.includes('原文件共读取 10 条记录、8 列；空白/缺失代码 24/80 个单元格（包含正常跳题，不是漏答率）。'));
 assert.ok(!h.downloads[1].content.includes('共同应答范围'));
});
test('both downloads refuse pending SAV or stale v2 interpretation before any statistics',async()=>{
 const f=await fixture();for(const dataset of [f.dataset,{...f.original,savDetails:{}}]){
  const h=harness({...f,dataset},{interpretationPending:true,numericColumnRecords:()=>{throw Error('Pending statistics must not run');}});
  h.call(false);h.call(true);assert.deepEqual(h.downloads,[]);assert.deepEqual(h.notices,[]);
 }
});
test('v2 refuses absent independent original data instead of labeling derived data as the source',async()=>{
 const f=await fixture();for(const original of [null,f.dataset]){const h=harness({...f,original});h.call(false);h.call(true);assert.deepEqual(h.downloads,[]);assert.equal(h.notices.length,2);assert.ok(h.notices.every(value=>value.includes('缺少原表身份')));}
});
test('v2 refuses missing or malformed binding fingerprints without generating replacements',async()=>{
 const f=await fixture();for(const key of ['sourceInterpretationHash','mappingHash','scopeHash'])for(const invalid of [undefined,null,'',hash.slice(1),['a']]){
  const altered=structuredClone(f);altered.dataset.identity.importMetadata.selection[key]=invalid;
  const h=harness(altered);h.call(false);h.call(true);assert.deepEqual(h.downloads,[]);assert.ok(h.notices.every(value=>value.includes('指纹')));
 }
});
