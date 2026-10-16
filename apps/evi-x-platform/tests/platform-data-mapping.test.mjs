import assert from 'node:assert/strict';
import {test} from 'node:test';
import {newQuestion,newQuestionnaire} from '../lib/questionnaire.ts';
import {parseSurveyCsv,describeNumbers,finiteNumber,profileSurvey} from '../lib/survey-analysis.ts';
import {datasetIdentity,mappingCurrent,suggestAssignments,mappingSignature} from '../lib/questionnaire-mapping.ts';
import {
  parseSavImport,platformDatasetIdentity,createPlatformMapping,confirmPlatformMapping,
  platformMappingBackup,parsePlatformMapping,preparePlatformMapping,platformMultiCounts,
  platformNumericProblems,platformMappingHash
} from '../lib/platform-data-mapping.ts';

const sourceHash='a'.repeat(64);
const col=(name,patch={})=>({
  name,label:null,measurement:'unknown',originalFormat:'F8.2',storageType:'double',alignment:'right',
  valueLabels:[],userMissingValues:[],userMissingRanges:[],dateEncoding:null,systemMissingCount:0,...patch
});
function savFixture(){
  return {
    schema:'survey-import/sav-v1',format:'sav',parser:'pyreadstat/1.3.6',sourceSha256:sourceHash,
    bytes:1200,rowCount:3,columnCount:3,fileEncoding:'UTF-8',
    columns:[
      col('A',{label:'评价',valueLabels:[{value:1,label:'同意'},{value:2,label:'同意'},{value:99,label:'拒答'}],userMissingValues:[99],systemMissingCount:1}),
      col('B',{label:'评价',userMissingRanges:[{lo:95,hi:99}]}),
      col('DATE',{originalFormat:'DATETIME20',dateEncoding:{kind:'date-time',unit:'seconds',epoch:'1582-10-14T00:00:00',timezone:null}})
    ],
    rows:[[1,8,14011632000],[99,97,14011632001],[null,5,14011632002]],
    cleanup:{completed:true,reason:'temporary-upload'}
  };
}
function designOf(questions){
  const d=newQuestionnaire();d.questions=questions;return d;
}
function numberQuestion(id='q',variable='SCORE',patch={}){
  return {...newQuestion(id,variable),text:'合成数值题',type:'number',choices:[],min:null,max:null,...patch};
}
function singleQuestion(id='q',variable='CHOICE',patch={}){
  return {...newQuestion(id,variable),text:'合成类别题',choices:[{code:'1',label:'甲'},{code:'2',label:'乙'}],...patch};
}
function multiQuestion(patch={}){
  return {...newQuestion('multi','Q2'),text:'合成多选题',type:'multi',choices:[{code:'a',label:'交通方便'},{code:'b',label:'价格合适'}],...patch};
}
function columnAssignment(questionId,column,patch={}){
  return {kind:'column',questionId,column,representation:'code',recodes:[],unmapped:'identity',missingCodes:[],userMissing:'preserve',...patch};
}
function binaryAssignment(patch={}){
  return {kind:'binary-split',questionId:'multi',columns:[
    {column:'H',optionCode:'a',selectedValues:['1'],unselectedValues:['0']},
    {column:'I',optionCode:'b',selectedValues:['1'],unselectedValues:['0']}
  ],blankPolicy:'reject-partial',missingCodes:[],userMissing:'preserve',...patch};
}
async function configure(table,design,assignments,metadata=null){
  const dataset=await platformDatasetIdentity(table,metadata,sourceHash);
  const mapping=await confirmPlatformMapping(createPlatformMapping(design,dataset,assignments));
  const context={table,metadata,sourceHash,design,rowIndices:table.rows.map((_,i)=>i)};
  return {mapping,context};
}
async function prepared(table,design,assignments,metadata=null){
  const {mapping,context}=await configure(table,design,assignments,metadata);
  return preparePlatformMapping(mapping,context);
}

test('SAV normalization preserves raw codes, duplicated labels and missing definitions without replacing data',()=>{
  const result=parseSavImport(JSON.stringify(savFixture()));
  assert.deepEqual(result.table.headers,['A','B','DATE']);
  assert.deepEqual(result.table.rows,[['1','8','14011632000'],['99','97','14011632001'],['','5','14011632002']]);
  assert.equal(result.raw.rows[2][0],null);
  assert.deepEqual(result.raw.columns[0].valueLabels.map(v=>v.label),['同意','同意','拒答']);
  assert.deepEqual(result.metadata.selection.savColumns[1].userMissingRanges,[{lo:95,hi:99}]);
  assert.equal(result.metadata.columns[0].label,result.metadata.columns[1].label);
  assert.ok(result.opinions.some(o=>o.code==='user-missing'));
  assert.ok(result.opinions.some(o=>o.code==='duplicate-label'));
  assert.ok(result.opinions.some(o=>o.code==='date-format'));
  assert.ok(!Object.hasOwn(result.metadata.selection,'rows'));
  assert.ok(Object.isFrozen(result.raw.rows[0]));
  assert.throws(()=>{result.table.rows[0][0]='2';},TypeError);
});

test('strict SAV JSON rejects duplicate decoded keys, unknown fields, infinite/unsafe values and underflow',()=>{
  const raw=JSON.stringify(savFixture());
  for(const bad of [
    raw.replace('"bytes":1200','"bytes":1200,"bytes":1200'),
    raw.replace('"bytes":1200','"bytes":1200,"\\u0062ytes":1200'),
    raw.replace('"bytes":1200','"bytes":1200,"extra":true'),
    raw.replace('[[1,8,','[[1e999,8,'),
    raw.replace('[[1,8,','[[9007199254740993,8,'),
    raw.replace('[[1,8,','[[1e-999,8,')
  ])assert.throws(()=>parseSavImport(bad));
});

test('SAV dimensions, cleanup receipts and system-missing counters are verified rather than trusted',()=>{
  for(const modify of [
    x=>{x.columns[0].systemMissingCount=0;},
    x=>{x.rowCount=4;},
    x=>{x.columns[1].name='A';},
    x=>{x.cleanup.completed=false;},
    x=>{x.bytes=2_000_001;},
    x=>{x.columns[0].valueLabels.push({value:1,label:'重复代码'});}
  ]){
    const x=savFixture();modify(x);assert.throws(()=>parseSavImport(JSON.stringify(x)));
  }
});

test('UTF-16 limits and malformed Unicode are rejected while Chinese and paired emoji are preserved',()=>{
  const x=savFixture();x.columns[0].label='中文😀';
  assert.equal(parseSavImport(JSON.stringify(x)).raw.columns[0].label,'中文😀');
  for(const label of ['a'.repeat(2001),'😀'.repeat(1001),'\ud800','\udc00']){
    const y=savFixture();y.columns[0].label=label;assert.throws(()=>parseSavImport(JSON.stringify(y)));
  }
});

test('user-missing ranges remain values unless an explicit exclude policy is confirmed',async()=>{
  const n=parseSavImport(JSON.stringify(savFixture()));
  const d=designOf([numberQuestion('b','RESULT')]);
  const keep=await prepared(n.table,d,[columnAssignment('b','B')],n.metadata);
  assert.deepEqual(keep.problems,[]);
  assert.deepEqual(keep.table.rows,[['8'],['97'],['5']]);
  const exclude=await prepared(n.table,d,[columnAssignment('b','B',{userMissing:'exclude'})],n.metadata);
  assert.deepEqual(exclude.table.rows,[['8'],[''],['5']]);
  assert.equal(describeNumbers(exclude.table.rows.map(r=>finiteNumber(r[0])).filter(v=>v!==null)).n,2);
  assert.equal(n.table.rows[1][1],'97');
});

test('standard and unknown date display formats cannot enter numeric analysis',async()=>{
  for(const format of ['DATETIME20','MOYR8','QYR8','WKDAY9','TIME8.2']){
    const x=savFixture();x.columns[2].originalFormat=format;
    if(format!=='DATETIME20')x.columns[2].dateEncoding=null;
    const n=parseSavImport(JSON.stringify(x));
    const p=await prepared(n.table,designOf([numberQuestion()]),[columnAssignment('q','DATE')],n.metadata);
    assert.deepEqual(p.problems,[]);
    assert.ok(platformNumericProblems(p,{method:'numeric',columns:[0]}).some(s=>s.includes('日期')));
    assert.equal(p.table.rows[0][0],'14011632000');
  }
});

test('explicit platform option 3 maps to score zero and unknown recodes block calculation',async()=>{
  const table=parseSurveyCsv('PLATFORM\n1\n2\n3');
  const d=designOf([numberQuestion('zero','Q5',{type:'likert',min:0,max:5,minLabel:'0 分',maxLabel:'5 分'})]);
  const a=columnAssignment('zero','PLATFORM',{unmapped:'reject',recodes:[{from:'1',to:'1'},{from:'2',to:'2'},{from:'3',to:'0'}]});
  const p=await prepared(table,d,[a]);
  assert.deepEqual(p.problems,[]);
  assert.deepEqual(p.table.rows,[['1'],['2'],['0']]);
  assert.equal(table.rows[2][0],'3');
  const wrong=await prepared(parseSurveyCsv('PLATFORM\n4'),d,[a]);
  assert.ok(wrong.problems.some(s=>s.includes('明确映射')));
  assert.deepEqual(wrong.table.rows,[]);
});

test('multi-choice counts use independent respondent and selection denominators; zero means unselected',async()=>{
  const table=parseSurveyCsv('H,I\n1,1\n1,0\n0,1\n0,0\n,');
  const before=structuredClone(table);
  const p=await prepared(table,designOf([multiQuestion()]),[binaryAssignment()]);
  assert.deepEqual(p.problems,[]);
  const r=platformMultiCounts(p,'multi');
  assert.equal(r.eligible,5);assert.equal(r.respondents,4);assert.equal(r.unanswered,1);assert.equal(r.selections,4);
  assert.deepEqual(r.options.map(o=>[o.count,o.respondentPercent,o.selectionPercent]),[[2,50,50],[2,50,50]]);
  assert.deepEqual(p.table.rows[3],['0','0']);
  assert.deepEqual(p.table.rows[4],['','']);
  assert.deepEqual(table,before);
  assert.throws(()=>{p.table.rows[0][0]='0';},TypeError);
});

test('multiple selections yield percentages over 100 by respondents without changing selection denominator',async()=>{
  const p=await prepared(parseSurveyCsv('H,I\n1,1\n1,1\n1,0'),designOf([multiQuestion()]),[binaryAssignment()]);
  const r=platformMultiCounts(p,'multi');
  assert.equal(r.respondents,3);assert.equal(r.selections,5);
  assert.deepEqual(r.options.map(o=>o.count),[3,2]);
  assert.equal(r.options[0].respondentPercent,100);
  assert.equal(r.options[0].selectionPercent,60);
  assert.equal(r.options[1].respondentPercent,2/3*100);
  assert.equal(r.options.reduce((n,o)=>n+o.selectionPercent,0),100);
});

test('all-zero respondents are observed answers; no selections gives a null selection percentage',async()=>{
  const p=await prepared(parseSurveyCsv('H,I\n0,0\n0,0'),designOf([multiQuestion()]),[binaryAssignment()]);
  const r=platformMultiCounts(p,'multi');
  assert.equal(r.respondents,2);assert.equal(r.unanswered,0);assert.equal(r.selections,0);
  assert.deepEqual(r.options.map(o=>[o.respondentPercent,o.selectionPercent]),[[0,null],[0,null]]);
});

test('partial blanks never become zero without an explicit strategy',async()=>{
  const table=parseSurveyCsv('H,I\n1,\n,\n0,');
  const d=designOf([multiQuestion()]);
  const strict=await prepared(table,d,[binaryAssignment()]);
  assert.ok(strict.problems.some(s=>s.includes('空白策略')));
  assert.throws(()=>platformMultiCounts(strict,'multi'));
  const chosen=await prepared(table,d,[binaryAssignment({blankPolicy:'unselected-if-any-observed'})]);
  assert.deepEqual(chosen.table.rows,[['1','0'],['',''],['0','0']]);
  const r=platformMultiCounts(chosen,'multi');
  assert.equal(r.respondents,2);assert.equal(r.unanswered,1);assert.equal(r.selections,1);
});

test('caller-supplied eligible rows exclude branch outsiders without interpreting blanks as no-selection',async()=>{
  const table=parseSurveyCsv('H,I\n1,1\n,\n0,0\n9,9'),d=designOf([multiQuestion()]);
  const {mapping,context}=await configure(table,d,[binaryAssignment()]);
  const p=await preparePlatformMapping(mapping,{...context,rowIndices:[0,2]});
  assert.deepEqual(p.problems,[]);
  assert.deepEqual(p.sourceRows,[0,2]);
  assert.equal(platformMultiCounts(p,'multi').respondents,2);
  assert.deepEqual(p.table.rows,[['1','1'],['0','0']]);
  for(const rowIndices of [[0,0],[4],[-1],[0.5],[]]){
    const invalid=await preparePlatformMapping(mapping,{...context,rowIndices});assert.ok(invalid.problems.length);
  }
});

test('sparse genuine zero columns are counted; absent columns and undefined binary values are rejected',async()=>{
  const d=designOf([multiQuestion()]);
  const p=await prepared(parseSurveyCsv('H,I\n1,0\n0,0'),d,[binaryAssignment()]);
  assert.deepEqual(platformMultiCounts(p,'multi').options.map(o=>o.count),[1,0]);
  const bad=await prepared(parseSurveyCsv('H,I\n1,2'),d,[binaryAssignment()]);
  assert.ok(bad.problems.some(s=>s.includes('未定义')));
  const table=parseSurveyCsv('H\n1');
  const dataset=await platformDatasetIdentity(table,null,sourceHash);
  assert.throws(()=>createPlatformMapping(d,dataset,[binaryAssignment()]),/不存在/);
  const incomplete=await prepared(parseSurveyCsv('H,I\n1,0'),d,[binaryAssignment({columns:binaryAssignment().columns.slice(0,1)})]);
  assert.ok(incomplete.problems.some(s=>s.includes('全部选项')));
});

test('identical display labels never select or collapse multiple raw columns automatically',async()=>{
  const x=savFixture();x.columns[0].label=x.columns[1].label='重复题干';
  const n=parseSavImport(JSON.stringify(x)),d=designOf([numberQuestion()]);
  const p=await prepared(n.table,d,[columnAssignment('q','B')],n.metadata);
  assert.deepEqual(p.table.rows,[['8'],['97'],['5']]);
  const ambiguous=designOf([singleQuestion('same','Q',{choices:[{code:'1',label:'同意'},{code:'2',label:'同意'}]})]);
  const blocked=await prepared(parseSurveyCsv('X\n同意'),ambiguous,[columnAssignment('same','X',{representation:'label'})]);
  assert.ok(blocked.problems.some(s=>s.includes('标签重复')));
});

test('identity binds actual data rows, metadata, source hash and current questionnaire revision',async()=>{
  const table=parseSurveyCsv('X\n1\n2'),d=designOf([numberQuestion()]);
  const {mapping,context}=await configure(table,d,[columnAssignment('q','X')]);
  const changed=structuredClone(table);changed.rows[0][0]='9';
  assert.notEqual((await platformDatasetIdentity(changed,null,sourceHash)).interpretationHash,mapping.dataset.interpretationHash);
  const edited=structuredClone(d);edited.questions[0].text+='修订';
  for(const patch of [{table:changed},{sourceHash:'b'.repeat(64)},{design:edited}]){
    assert.ok((await preparePlatformMapping(mapping,{...context,...patch})).problems.some(s=>s.includes('版本')));
  }
  const n=parseSavImport(JSON.stringify(savFixture()));
  const f=await configure(n.table,d,[columnAssignment('q','B')],n.metadata);
  const meta=structuredClone(n.metadata);meta.selection.savColumns[1].userMissingRanges=[];
  assert.ok((await preparePlatformMapping(f.mapping,{...f.context,metadata:meta})).problems.some(s=>s.includes('版本')));
});

test('confirmation hashes coding choices; edits and restored backups require reconfirmation',async()=>{
  const table=parseSurveyCsv('X\n1\n2'),d=designOf([numberQuestion()]);
  const {mapping,context}=await configure(table,d,[columnAssignment('q','X')]);
  assert.equal(await platformMappingHash(mapping),mapping.confirmed);
  const changed=structuredClone(mapping);changed.assignments[0].missingCodes=['2'];
  assert.ok((await preparePlatformMapping(changed,context)).problems.some(s=>s.includes('确认')));
  const restored=parsePlatformMapping(platformMappingBackup(mapping));
  assert.equal(restored.confirmed,null);
  assert.ok((await preparePlatformMapping(restored,context)).problems.some(s=>s.includes('确认')));
  for(const bad of [
    platformMappingBackup(mapping).replace('"kind": "column"','"kind": "column", "extra": true'),
    platformMappingBackup(mapping).replace('"schema":','"schema":"questionnaire-mapping/v2","schema":')
  ])assert.throws(()=>parsePlatformMapping(bad));
});

test('numeric guard keeps nominal, text, multi-choice and incompatible scale inputs out of numeric tools',async()=>{
  const p=await prepared(parseSurveyCsv('X\n1\n2'),designOf([singleQuestion()]),[columnAssignment('q','X')]);
  assert.ok(platformNumericProblems(p,{method:'numeric',columns:[0]}).length);
  assert.ok(platformNumericProblems(p,{method:'pearson',columns:[0]}).length);
  assert.ok(platformNumericProblems(p,{method:'alpha',columns:[0],construct:'x',min:0,max:5}).length);
  assert.deepEqual(platformNumericProblems(p,{method:'frequency',columns:[0]}),[]);
});

test('v1 mapping remains deterministic and unchanged alongside the independent v2 contract',async()=>{
  const table=parseSurveyCsv('CHOICE\n1\n2'),design=designOf([singleQuestion()]);
  const identity=await datasetIdentity(sourceHash,'utf-8',table);
  const legacy={design,assignments:suggestAssignments(design,identity),confirmed:null,sourceSignature:null};
  legacy.confirmed=mappingSignature(legacy,identity);
  const before=mappingSignature(legacy,identity);
  assert.equal(mappingCurrent(legacy,identity,false),true);
  await prepared(table,design,[columnAssignment('q','CHOICE')]);
  assert.equal(mappingSignature(legacy,identity),before);
  assert.equal(mappingCurrent(legacy,identity,false),true);
});

test('strict enum values reject arrays that stringify to a valid option',async()=>{
  const x=savFixture();x.columns[2].dateEncoding.kind=['date-time'];
  assert.throws(()=>parseSavImport(JSON.stringify(x)),/日期编码/);
  const table=parseSurveyCsv('X\n1'),design=designOf([numberQuestion()]);
  await assert.rejects(()=>platformDatasetIdentity({...table,delimiter:[',']},null,sourceHash),/分隔符/);
  const dataset=await platformDatasetIdentity(table,null,sourceHash);
  for(const patch of [{userMissing:['preserve']},{representation:['code']},{unmapped:['identity']}]){
    assert.throws(()=>createPlatformMapping(design,dataset,[columnAssignment('q','X',patch)]));
  }
  const t=parseSurveyCsv('H,I\n1,0'),d=designOf([multiQuestion()]),identity=await platformDatasetIdentity(t,null,sourceHash);
  assert.throws(()=>createPlatformMapping(d,identity,[binaryAssignment({blankPolicy:['reject-partial']})]));
});

test('explicit user-missing exclusion never becomes an unselected binary zero',async()=>{
  const x=savFixture();x.columnCount=2;x.rowCount=4;x.columns=[col('H',{userMissingRanges:[{lo:95,hi:99}]}),col('I')];
  x.rows=[[99,1],[1,0],[0,0],['','']];
  const n=parseSavImport(JSON.stringify(x));
  const p=await prepared(n.table,designOf([multiQuestion()]),[binaryAssignment({userMissing:'exclude',blankPolicy:'unselected-if-any-observed'})],n.metadata);
  assert.deepEqual(p.problems,[]);
  assert.deepEqual(p.table.rows,[['',''],['1','0'],['0','0'],['','']]);
  const r=platformMultiCounts(p,'multi');
  assert.equal(r.eligible,4);assert.equal(r.respondents,2);assert.equal(r.unanswered,1);assert.equal(r.excludedMissing,1);assert.equal(r.selections,1);
  assert.equal(r.eligible,r.respondents+r.unanswered+r.excludedMissing);
  assert.deepEqual(r.options.map(o=>o.count),[1,0]);
  assert.equal(n.raw.rows[0][0],99);assert.equal(n.table.rows[0][0],'99');
  const keep=await prepared(n.table,designOf([multiQuestion()]),[binaryAssignment({columns:[
    {column:'H',optionCode:'a',selectedValues:['1'],unselectedValues:['0','99']},
    {column:'I',optionCode:'b',selectedValues:['1'],unselectedValues:['0']}
  ],userMissing:'preserve'})],n.metadata);
  assert.equal(platformMultiCounts(keep,'multi').respondents,3);
  assert.equal(platformMultiCounts(keep,'multi').excludedMissing,0);
});

test('stable canonical IDs preserve identifier labels through mapping and deny numeric use',async()=>{
  const table={...parseSurveyCsv('col-001\n20260001\n20260002'),columnLabels:{'col-001':'学生学号'}};
  const p=await prepared(table,designOf([numberQuestion('measure','VALUE')]),[columnAssignment('measure','col-001')]);
  assert.deepEqual(p.problems,[]);
  assert.equal(p.table.columnLabels.VALUE,'col-001 · 学生学号');
  assert.equal(profileSurvey(p.table).columns[0].likelyIdentifier,true);
  assert.equal(profileSurvey(p.table).columns[0].stats,null);
  assert.ok(platformNumericProblems(p,{method:'numeric',columns:[0]}).some(s=>s.includes('标识')));
  const metadata={schema:'survey-import-metadata/v1',parser:'synthetic/v1',columns:[{id:'col-001',label:'姓名',questionNumber:null}],selection:{format:'synthetic'}};
  const noLabels=await prepared(parseSurveyCsv('col-001\n1\n2'),designOf([numberQuestion()]),[columnAssignment('q','col-001')],metadata);
  assert.equal(profileSurvey(noLabels.table).columns[0].likelyIdentifier,true);
  const name=await prepared({...parseSurveyCsv('name\n1\n2'),columnLabels:{name:'调查字段'}},designOf([numberQuestion()]),[columnAssignment('q','name')]);
  assert.equal(profileSurvey(name.table).columns[0].likelyIdentifier,true);
  for(const columnLabels of [{'not-a-column':'姓名'}, {'col-001':1}, {'col-001':'\ud800'}, {'col-001':'a'.repeat(4002)}]){
    await assert.rejects(()=>platformDatasetIdentity({...table,columnLabels},null,sourceHash));
  }
  const changed={...table,columnLabels:{'col-001':'学生学号修订'}};
  assert.notEqual((await platformDatasetIdentity(table,null,sourceHash)).interpretationHash,(await platformDatasetIdentity(changed,null,sourceHash)).interpretationHash);
});

test('dictionary keys remain safe own keys including __proto__ and constructor',async()=>{
  const x=savFixture();x.columns[0].name='__proto__';x.columns[0].label='姓名';x.columns[1].name='constructor';
  const n=parseSavImport(JSON.stringify(x));
  assert.equal(Object.hasOwn(n.table.columnLabels,'__proto__'),true);
  assert.equal(n.table.columnLabels.__proto__,'姓名');
  assert.equal(Object.getPrototypeOf(n.table.columnLabels),Object.prototype);
  const p=await prepared(n.table,designOf([numberQuestion('safe','VALUE')]),[columnAssignment('safe','__proto__')],n.metadata);
  assert.deepEqual(p.problems,[]);assert.equal(profileSurvey(p.table).columns[0].likelyIdentifier,true);
});

test('analysis scope hashes distinguish caller-confirmed branches while preserving the mapping hash',async()=>{
  const table=parseSurveyCsv('H,I\n1,1\n0,0\n1,0'),d=designOf([multiQuestion()]);
  const {mapping,context}=await configure(table,d,[binaryAssignment()]);
  const left=await preparePlatformMapping(mapping,{...context,rowIndices:[0,1]});
  const right=await preparePlatformMapping(mapping,{...context,rowIndices:[1,2]});
  assert.equal(left.mappingHash,right.mappingHash);
  assert.notEqual(left.scopeHash,right.scopeHash);
  assert.equal(left.scopeHash,(await preparePlatformMapping(mapping,{...context,rowIndices:[0,1]})).scopeHash);
});

test('invalid JSON-like metadata inputs fail with schema errors without native coercion',async()=>{
  const table=parseSurveyCsv('X\n1');
  const base={schema:'survey-import-metadata/v1',parser:'synthetic/v1',columns:[{id:'X',label:'X',questionNumber:null}],selection:{}};
  for(const selection of [null,undefined,[],{bad:undefined}]){
    await assert.rejects(()=>platformDatasetIdentity(table,{...base,selection},sourceHash),/JSON|普通对象|字段/);
  }
});
test('reordering equal confirmed assignments never changes output indices or existing recipe inputs',async()=>{
  const table=parseSurveyCsv('A,B\n1,10\n3,30'),design=designOf([numberQuestion('qa','VALUE_A'),numberQuestion('qb','VALUE_B')]);
  const {mapping,context}=await configure(table,design,[columnAssignment('qa','A'),columnAssignment('qb','B')]);
  const first=await preparePlatformMapping(mapping,context),swapped=structuredClone(mapping);swapped.assignments.reverse();
  const second=await preparePlatformMapping(swapped,context);
  assert.deepEqual(second.problems,[]);assert.equal(first.mappingHash,second.mappingHash);assert.equal(first.scopeHash,second.scopeHash);
  assert.deepEqual(first.table,second.table);assert.deepEqual(first.columns,second.columns);assert.equal(describeNumbers(second.table.rows.map(r=>Number(r[0]))).mean,2);
});
