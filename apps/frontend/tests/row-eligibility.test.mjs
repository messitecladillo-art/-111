import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {newQuestion,newQuestionnaire} from '../lib/questionnaire.ts';
import {assessEligibility} from '../lib/row-eligibility.ts';
import {runRecipe} from '../lib/analysis-recipes.ts';
import {parseRoutingEvidence,routingEvidence,routingSummary} from '../lib/routing-evidence.ts';
import {datasetIdentity,mappingSignature,prepareLinkedAnalysis,scaleSuggestions,researchLink} from '../lib/questionnaire-mapping.ts';
import {analyzeReliability} from '../lib/survey-analysis.ts';
import {frequencyEvidence,reliabilityEvidence,linkEvidence,parseEvidence,evidenceSection,evidenceContract} from '../lib/research-flow.ts';
import {parseResearchLink} from '../lib/research-link.ts';
import {numericColumnRecords,profileColumn} from '../lib/analysis-summary.ts';

// Synthetic only. Gold buckets were derived before reading the implementation;
// see .collab/runs/20260930-row-eligibility/review/independent-fixture-design.md.
const selection = (id, variable, choices, condition=null) => ({
  ...newQuestion(id,variable),text:`Synthetic ${variable}`,choices,condition,
});
const numeric = (id, variable, condition=null) => ({
  ...newQuestion(id,variable),text:`Synthetic ${variable}`,type:'number',min:null,max:null,choices:[],condition,
});
function fixture(representation='code') {
  const design=newQuestionnaire();
  design.questions=[
    selection('p','P',[{code:'A',label:'Branch A'},{code:'B',label:'Branch B'}]),
    selection('q','Q',[{code:'X',label:'Child X'},{code:'Y',label:'Child Y'}],{questionId:'p',codes:['A']}),
    numeric('r','R',{questionId:'q',codes:['X']}),
    numeric('s','S',{questionId:'p',codes:['B']}),
    numeric('u','U'),
  ];
  const rows=[
    ['A','X','10','','1'], ['A','Y','','','2'], ['B','','','20','3'],
    ['','X','11','','4'], ['INVALID','X','12','','5'], ['B','X','13','30','6'],
    ['A','','14','','7'], ['A','INVALID','','','8'], ['A','X','','','9'],
    ['B','','','','10'], ['A','Y','19','','11'], ['NA','','','','12'],
  ];
  if(representation==='label')for(const row of rows){
    row[0]=({A:'Branch A',B:'Branch B'})[row[0]]??row[0];
    row[1]=({X:'Child X',Y:'Child Y'})[row[1]]??row[1];
  }
  return {design,assignments:design.questions.map(q=>({questionId:q.id,column:q.variable,representation:q.type==='single'?representation:'code'})),table:{headers:['P','Q','R','S','U'],rows,delimiter:',',skippedBlankLines:0},missing:['NA']};
}
const assess=(f,ids)=>assessEligibility(f.design,f.assignments,f.table,f.missing,ids);
const buckets = result => ({eligible:result.eligibleRows,structural:result.ineligibleRows,unknown:result.unknownRows,contradictory:result.contradictionRows});
function validatePartition(result){
  assert.equal(result.schema,'row-eligibility/v1');
  assert.equal(result.eligibleRows+result.ineligibleRows+result.unknownRows,result.totalRows);
  assert.equal(result.eligibleIndices.length,result.eligibleRows);
  assert.equal(new Set(result.eligibleIndices).size,result.eligibleRows);
  for(const item of result.questionCounts)assert.equal(Object.entries(item).filter(([key])=>key!=='questionId').reduce((sum,[,value])=>sum+value,0),result.totalRows);
}
function countFor(result,id){return result.questionCounts.find(q=>q.questionId===id);}
function frozen(value){
  if(value&&typeof value==='object'){for(const item of Object.values(value))frozen(item);Object.freeze(value);}
  return value;
}
async function linked(f=fixture()){
  const identity=await datasetIdentity('a'.repeat(64),'utf-8',f.table);
  const mapping={design:f.design,assignments:f.assignments,confirmed:null,sourceSignature:null};
  mapping.confirmed=mappingSignature(mapping,identity);
  return {...f,identity,mapping};
}
const prepare=(f,request,routing)=>prepareLinkedAnalysis(f.mapping,f.identity,false,f.table,f.missing,request,routing);
function scaleFixture(){
  const source=fixture();source.design.questions=source.design.questions.filter(q=>['p','r','u'].includes(q.id));
  for(const q of source.design.questions.filter(q=>['r','u'].includes(q.id))){
    q.type='likert';q.min=1;q.max=5;q.minLabel='low';q.maxLabel='high';q.construct='Synthetic';q.condition={questionId:'p',codes:['A']};
  }
  source.table={headers:['P','R','U'],rows:[['A','1','2'],['A','2','3'],['A','4','5'],['A','','3'],['B','',''],['B','5','1'],['','2','2']],delimiter:',',skippedBlankLines:0};
  source.assignments=source.design.questions.map(q=>({questionId:q.id,column:q.variable,representation:'code'}));
  return source;
}
async function branchFrequencyEvidence(){
  const f=await linked(),p=prepare(f,{method:'frequency',columns:[2]},{policy:'exclude',confirmed:true});
  const result=runRecipe(p.table,{id:'freq',method:'frequency',x:2,y:null,question:'Synthetic branch scope'},f.missing);
  const input=frequencyEvidence(result,{hash:f.identity.sourceHash,simulated:true,question:'Synthetic branch scope',variable:'R',column:2,missingCodes:f.missing});
  return {f,p,input,link:await researchLink(f.mapping,f.identity,false)};
}

test('nested route separates eligible missing, structural missing, unknown and contradictory responses',()=>{
  const r=assess(fixture(),['r']);validatePartition(r);
  assert.deepEqual(r.problems,[]);assert.equal(r.hasConditions,true);
  assert.deepEqual(buckets(r),{eligible:2,structural:5,unknown:5,contradictory:2});
  assert.deepEqual(r.eligibleIndices,[0,8]);
  assert.deepEqual(countFor(r,'r'),{questionId:'r',eligibleAnswered:1,eligibleMissing:1,ineligibleBlank:3,ineligibleAnswered:2,unknownBlank:2,unknownAnswered:3});
  assert.deepEqual(countFor(r,'q'),{questionId:'q',eligibleAnswered:5,eligibleMissing:1,ineligibleBlank:2,ineligibleAnswered:1,unknownBlank:1,unknownAnswered:2});
  assert.deepEqual(r.questionCounts.map(q=>q.questionId),['p','q','r']);
});
test('direct routes and unconditional selections have independently derived denominators',()=>{
  const f=fixture();
  for(const [ids,gold,indices] of [
    [['q'],{eligible:6,structural:3,unknown:3,contradictory:1},[0,1,6,7,8,10]],
    [['s'],{eligible:3,structural:6,unknown:3,contradictory:0},[2,5,9]],
    [['u'],{eligible:12,structural:0,unknown:0,contradictory:0},Array.from({length:12},(_,i)=>i)],
    [['r','u'],{eligible:2,structural:5,unknown:5,contradictory:2},[0,8]],
    [['r','s'],{eligible:0,structural:9,unknown:3,contradictory:2},[]],
  ]){const result=assess(f,ids);validatePartition(result);assert.deepEqual(buckets(result),gold);assert.deepEqual(result.eligibleIndices,indices);}
  assert.equal(assess(f,['u']).hasConditions,false);
});
test('code and unambiguous label representations preserve exactly the same nested eligibility',()=>{
  for(const ids of [['r'],['q'],['s'],['r','u']])assert.deepEqual(assess(fixture('code'),ids),assess(fixture('label'),ids));
});
test('explicit representation disambiguates labels equal to another choice code',()=>{
  const f=fixture();f.design.questions[0].choices=[{code:'A',label:'B'},{code:'B',label:'A'}];
  f.table.rows=[['B','X','10','','1']];
  assert.equal(assess(f,['r']).ineligibleRows,1);
  f.assignments[0].representation='label';
  assert.equal(assess(f,['r']).eligibleRows,1);
});
test('hidden direct parent cannot activate child even when its raw value matches the branch',()=>{
  const f=fixture();f.table.rows=[['B','X','13','30','6']];
  const result=assess(f,['r']);
  assert.deepEqual(buckets(result),{eligible:0,structural:1,unknown:0,contradictory:1});
  assert.equal(countFor(result,'q').ineligibleAnswered,1);assert.equal(countFor(result,'r').ineligibleAnswered,1);
});
test('ancestor contradictory response stays visible in QC even when selected child is blank',()=>{
  const f=fixture();f.table.rows=[['B','X','','30','6']];
  const result=assess(f,['r']);assert.equal(result.contradictionRows,1);assert.equal(countFor(result,'r').ineligibleBlank,1);
});
test('missing, configured-missing and invalid parents become unknown rather than child missingness',()=>{
  const f=fixture();f.table.rows=[['','X','10','','1'],['NA','X','10','','2'],['bad','X','10','','3'],['A','','10','','4'],['A','bad','10','','5']];
  const r=assess(f,['r']);assert.deepEqual(buckets(r),{eligible:0,structural:0,unknown:5,contradictory:0});
  assert.equal(countFor(r,'r').unknownAnswered,5);assert.deepEqual(r.problems,[]);
});
test('missing classification precedes even valid parent choices only when user configured it',()=>{
  const f=fixture();f.table.rows=[['A','X','10','','1']];
  assert.equal(assess(f,['r']).eligibleRows,1);f.missing=['A'];assert.equal(assess(f,['r']).unknownRows,1);
});
test('trimmed cell strings and trimmed configured missing values do not mutate inputs',()=>{
  const f=fixture('label');f.table.rows=[[' Branch A ',' Child X ','10','','1'],[' M ',' Child X ','10','','2']];f.missing=[' M '];
  const before=JSON.stringify(f),r=assess(f,['r']);assert.deepEqual(r.eligibleIndices,[0]);assert.equal(r.unknownRows,1);assert.equal(JSON.stringify(f),before);
});
test('unassigned or missing-column ancestors fail closed, while unrelated invalid unmapped questions do not interfere',()=>{
  for(const change of [f=>{f.assignments=f.assignments.filter(a=>a.questionId!=='p');},f=>{f.assignments[0].column='not-present';}]){
    const f=fixture();change(f);const result=assess(f,['r']);assert.ok(result.problems.length);assert.equal(result.eligibleRows,0);assert.equal(result.unknownRows,12);
  }
  const f=fixture();f.design.questions.push({...newQuestion('broken','BAD'),condition:{questionId:'absent',codes:['?']}});
  assert.deepEqual(assess(f,['r']),assess(fixture(),['r']));
});
test('invalid route references and condition codes fail closed without recursion',()=>{
  for(const change of [
    f=>{f.design.questions[2].condition.questionId='absent';},
    f=>{f.design.questions[2].condition.questionId='r';},
    f=>{f.design.questions[1].condition.questionId='r';},
    f=>{f.design.questions[2].condition={questionId:'p',codes:[]};},
    f=>{f.design.questions[2].condition={questionId:'p',codes:['A','A']};},
    f=>{f.design.questions[2].condition={questionId:'p',codes:['BAD']};},
    f=>{f.design.questions[1].type='multi';},
  ]){const f=fixture();change(f);const result=assess(f,['r']);assert.ok(result.problems.length);assert.equal(result.eligibleRows,0);validatePartition(result);}
});
test('ambiguous or invalid parent codes and ambiguous label mappings are structural failures',()=>{
  for(const change of [
    f=>{f.design.questions[0].choices[1].code='A';},
    f=>{f.design.questions[0].choices[1].code='bad code';},
    f=>{f.design.questions[0].choices.pop();},
    f=>{f.assignments[0].representation='label';f.design.questions[0].choices[1].label='Branch A';},
    f=>{f.assignments[0].representation='label';f.design.questions[0].choices[1].label='  ';},
    f=>{f.design.questions[0].choices[1].label='Branch A';},
    f=>{f.design.questions[0].choices[1].label='  ';},
  ]){const f=fixture();change(f);const result=assess(f,['r']);assert.ok(result.problems.length);assert.equal(result.eligibleRows,0);}
});
test('duplicate identity, duplicate relevant assignment and malformed tables cannot create eligible rows',()=>{
  for(const change of [
    f=>{f.design.questions.push({...f.design.questions[0]});},
    f=>{f.assignments.push({...f.assignments[0]});},
    f=>{f.assignments[1].column='P';},
    f=>{f.assignments[0].representation='guessed';},
    f=>{f.table.headers[1]='P';},
    f=>{f.table.rows[0].pop();},
    f=>{f.table.rows[0][0]=7;},
  ]){const f=fixture();change(f);const result=assess(f,['r']);assert.ok(result.problems.length);assert.equal(result.eligibleRows,0);validatePartition(result);}
});
test('empty and unknown selections fail closed; empty table has zero counts',()=>{
  const f=fixture();for(const ids of [[],['unknown']]){const r=assess(f,ids);assert.ok(r.problems.length);assert.equal(r.unknownRows,12);}
  f.table.rows=[];const r=assess(f,['r']);assert.deepEqual(buckets(r),{eligible:0,structural:0,unknown:0,contradictory:0});validatePartition(r);
});
test('all source inputs support deep freezing and repeated assessments with no mutation',()=>{
  const f=frozen(fixture()),ids=frozen(['r','u']),before=JSON.stringify({f,ids});
  const first=assess(f,ids),second=assess(f,ids);assert.deepEqual(second,first);assert.equal(JSON.stringify({f,ids}),before);
  first.eligibleIndices.push(99);assert.deepEqual(assess(f,ids).eligibleIndices,[0,8]);
});
test('eligible-row slice keeps ordinary item-missingness distinct from source exclusions in arithmetic',()=>{
  const f=fixture(),r=assess(f,['r']),table={...f.table,rows:r.eligibleIndices.map(i=>f.table.rows[i])};
  const result=runRecipe(table,{id:'independent',method:'frequency',x:2,y:null,question:'Synthetic only'},f.missing);
  assert.equal(r.totalRows,12);assert.equal(result.total,2);assert.equal(result.n,1);assert.equal(result.excluded,1);
  assert.equal(result.rows[0][1],1);assert.equal(result.rows.length,1);
});

test('routing evidence preserves independently derived counts and never exports local row indices',()=>{
  for(const ids of [['r'],['r','u'],['r','s']]){
    const assessment=assess(fixture(),ids),evidence=routingEvidence(assessment,'exclude',ids);
    assert.deepEqual(parseRoutingEvidence(evidence,ids,assessment.eligibleRows),evidence);
    assert.equal(Object.hasOwn(evidence,'eligibleIndices'),false);assert.equal(Object.hasOwn(evidence,'rows'),false);
    assert.equal(evidence.totalRows,12);assert.match(routingSummary(evidence),/应答范围/);
  }
});
test('strict routing evidence accepts clean structural skips but rejects unresolved or contradictory selected closure',()=>{
  const f=fixture();assert.throws(()=>routingEvidence(assess(f,['r']),'strict',['r']));
  f.table.rows=[['A','X','10','','1'],['B','','','20','2']];
  const e=routingEvidence(assess(f,['r']),'strict',['r']);assert.equal(e.eligibleRows,1);assert.equal(e.ineligibleRows,1);assert.equal(e.unknownRows,0);assert.equal(e.contradictionRows,0);
});
test('routing evidence parser rejects malformed counts, unknown fields, absent selected IDs and duplicate items',()=>{
  const base=routingEvidence(assess(fixture(),['r']),'exclude',['r']);
  const mutations=[
    x=>{x.totalRows=0;},x=>{x.totalRows=5001;},x=>{x.totalRows='12';},
    x=>{x.policy=['exclude'];},x=>{x.policy='drop';},x=>{x.schema='other';},
    x=>{x.eligibleRows=-1;},x=>{x.eligibleRows=1.5;},x=>{x.eligibleRows=Infinity;},
    x=>{x.unknownRows++;},x=>{x.contradictionRows=11;},x=>{x.contradictionRows=0;},
    x=>{x.questionCounts[0].eligibleAnswered++;},x=>{x.questionCounts[0].eligibleAnswered='12';},
    x=>{x.questionCounts.push({...x.questionCounts[0]});},x=>{x.questionCounts=[];},
    x=>{x.questionCounts[2].questionId='other';},x=>{x.questionCounts[0].questionId='../escape';},
    x=>{x.questionCounts[0].rowIndices=[0];},x=>{x.eligibleIndices=[0,8];},x=>{x.rawRows=[];},
  ];
  for(const mutate of mutations){const x=structuredClone(base);mutate(x);assert.throws(()=>parseRoutingEvidence(x,['r'],2));}
  assert.throws(()=>parseRoutingEvidence(base,['r'],3));
  assert.throws(()=>parseRoutingEvidence(Object.assign(Object.create({extra:1}),base),['r'],2));
});
test('routing aggregate known-ineligible union must dominate each selected question structural count',()=>{
  const evidence={schema:'row-eligibility/v1',policy:'exclude',totalRows:4,eligibleRows:1,ineligibleRows:1,unknownRows:2,contradictionRows:0,questionCounts:[
    {questionId:'a',eligibleAnswered:1,eligibleMissing:0,ineligibleBlank:2,ineligibleAnswered:0,unknownBlank:1,unknownAnswered:0},
    {questionId:'b',eligibleAnswered:2,eligibleMissing:0,ineligibleBlank:0,ineligibleAnswered:0,unknownBlank:2,unknownAnswered:0},
  ]};
  assert.throws(()=>parseRoutingEvidence(evidence,['a','b'],1));
});
test('contradictory ancestor responses cannot be recorded exclusively among unresolved common rows',()=>{
  const evidence={schema:'row-eligibility/v1',policy:'exclude',totalRows:3,eligibleRows:1,ineligibleRows:0,unknownRows:2,contradictionRows:1,questionCounts:[
    {questionId:'parent',eligibleAnswered:2,eligibleMissing:0,ineligibleBlank:0,ineligibleAnswered:1,unknownBlank:0,unknownAnswered:0},
    {questionId:'child',eligibleAnswered:1,eligibleMissing:0,ineligibleBlank:0,ineligibleAnswered:0,unknownBlank:2,unknownAnswered:0},
  ]};
  assert.throws(()=>parseRoutingEvidence(evidence,['child'],1));
});
test('bounded deterministic random branch tables satisfy aggregate parser invariants',()=>{
  let state=20260930;
  const pick=values=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return values[state%values.length];};
  for(let sample=0;sample<120;sample++){
    const f=fixture();f.table.rows=Array.from({length:25},(_,i)=>[pick(['A','B','','NA','INVALID']),pick(['X','Y','','NA','INVALID']),pick(['1','','NA']),pick(['2','','NA']),String(i)]);
    for(const ids of [['r'],['q','r'],['r','s'],['r','s','u'],['s','u']]){
      const a=assess(f,ids);validatePartition(a);assert.deepEqual(a.problems,[]);
      assert.doesNotThrow(()=>routingEvidence(a,'exclude',ids));
    }
  }
});
test('linked conditional analysis is blocked by default and strict policy, excluded only after true approval',async()=>{
  const f=await linked(),request={method:'frequency',columns:[2]};
  for(const choice of [undefined,{policy:'strict',confirmed:false},{policy:'strict',confirmed:true},{policy:'exclude',confirmed:false},{policy:'exclude',confirmed:'false'},{policy:'exclude',confirmed:[]},{policy:'exclude',confirmed:1},{policy:'guessed',confirmed:true}]){
    const r=prepare(f,request,choice);assert.ok(r.problems.length,JSON.stringify(choice));assert.equal(r.table.rows.length,0);assert.equal(r.eligibility,null);
  }
  const approved=prepare(f,request,{policy:'exclude',confirmed:true});assert.deepEqual(approved.problems,[]);assert.equal(approved.table.rows.length,2);assert.equal(approved.eligibility.totalRows,12);
  assert.deepEqual(approved.table.rows,[f.table.rows[0],f.table.rows[8]]);
});
test('linked strict analysis permits clean structural skips and unconditional analysis needs no routing approval',async()=>{
  const source=fixture();source.table.rows=[['A','X','10','','1'],['B','','','20','2']];const f=await linked(source);
  const r=prepare(f,{method:'numeric',columns:[2]},{policy:'strict',confirmed:true});assert.deepEqual(r.problems,[]);assert.equal(r.table.rows.length,1);assert.equal(r.eligibility.policy,'strict');
  const u=prepare(f,{method:'numeric',columns:[4]});assert.deepEqual(u.problems,[]);assert.equal(u.table.rows.length,2);assert.equal(u.eligibility,null);
});
test('linked response validation inspects eligible rows only and never silently drops bad eligible values',async()=>{
  const f=await linked(),request={method:'numeric',columns:[2]},choice={policy:'exclude',confirmed:true};
  f.table.rows[5][2]='NOT A NUMBER';assert.deepEqual(prepare(f,request,choice).problems,[]);
  f.table.rows[0][2]='NOT A NUMBER';const blocked=prepare(f,request,choice);assert.ok(blocked.problems.some(p=>p.includes('非缺失值')));assert.equal(blocked.table.rows.length,0);
});
test('linked selected intersections, stale mapping and invalid selected indices all fail closed',async()=>{
  const f=await linked(),choice={policy:'exclude',confirmed:true};
  for(const request of [{method:'pearson',columns:[2,3]},{method:'frequency',columns:[]},{method:'frequency',columns:[-1]},{method:'frequency',columns:[5]},{method:'frequency',columns:[2,2]},{method:'frequency',columns:[2.5]}])assert.equal(prepare(f,request,choice).table.rows.length,0);
  assert.ok(prepareLinkedAnalysis(f.mapping,f.identity,true,f.table,f.missing,{method:'numeric',columns:[2]},choice).problems.length);
  f.mapping.design.questions[2].text+='changed';assert.ok(prepare(f,{method:'numeric',columns:[2]},choice).problems.length);
});
test('linked irrelevant semantically broken unmapped design question does not block valid analysis',async()=>{
  const f=fixture();f.design.questions.push({...newQuestion('bad','BAD'),condition:{questionId:'absent',codes:['?']}});
  const p=await linked(f);assert.deepEqual(prepare(p,{method:'numeric',columns:[2]},{policy:'exclude',confirmed:true}).problems,[]);
});
test('every recipe method can consume the exact selected eligible slice and maintain its own complete-case N',async()=>{
  const f=await linked(),choice={policy:'exclude',confirmed:true};
  for(const [method,columns] of [['frequency',[2]],['numeric',[2]],['groups',[1,2]],['crosstab',[1,2]],['pearson',[2,4]],['spearman',[2,4]]]){
    const p=prepare(f,{method,columns},choice);assert.deepEqual(p.problems,[],method);assert.deepEqual(p.assessment.eligibleIndices,[0,8],method);
    const result=runRecipe(p.table,{id:method,method,x:columns[0],y:columns[1]??null,question:'Synthetic branch scope'},f.missing);
    assert.equal(result.total,2,method);assert.equal(result.n,1,method);
  }
});
test('conditional alpha uses common eligible rows and then common complete cases, with ordinary missing distinct',async()=>{
  const f=await linked(scaleFixture()),options={columns:[1,2],reverse:[],min:1,max:5,construct:'Synthetic',missingCodes:[]};
  const p=prepare(f,{method:'alpha',...options},{policy:'exclude',confirmed:true});assert.deepEqual(p.problems,[]);
  assert.equal(p.eligibility.totalRows,7);assert.equal(p.eligibility.eligibleRows,4);assert.equal(p.eligibility.ineligibleRows,2);assert.equal(p.eligibility.unknownRows,1);assert.equal(p.eligibility.contradictionRows,1);
  const result=analyzeReliability(p.table,options);assert.equal(result.total,4);assert.equal(result.n,3);assert.equal(result.missingRows,1);assert.equal(result.alpha,1);
  assert.deepEqual(scaleSuggestions(f.mapping,f.identity)[0].columns,[1,2]);
});
test('v3 frequency evidence preserves original, eligible and answered denominators through report text',async()=>{
  const {p,input,link}=await branchFrequencyEvidence(),v3=linkEvidence(input,link,p.eligibility);
  assert.equal(v3.version,3);assert.equal(evidenceContract(v3),'research-flow/v3');assert.equal(v3.total,2);assert.equal(v3.n,1);assert.equal(v3.eligibility.totalRows,12);
  assert.deepEqual(v3.link.bindings.map(b=>b.questionId),['r']);assert.deepEqual(parseEvidence(v3),v3);
  const section=evidenceSection(v3,'critic-route');assert.match(section.body,/原始记录 12 行.*符合显示条件 2 行.*有效样本 1 行/);assert.doesNotMatch(section.body,/共读取 2 行/);assert.match(section.body,/不把结构性跳过当作漏答、零值或全体受访者分母/);
  assert.doesNotMatch(JSON.stringify(v3),/eligibleIndices|rawRows/);
});
test('v3 evidence rejects impossible result denominators, forged conditional linkage and schema downgrades',async()=>{
  const {p,input,link}=await branchFrequencyEvidence(),base=linkEvidence(input,link,p.eligibility);
  for(const mutate of [
    x=>{x.n=2;x.calculation.counts=[2];},
    x=>{x.eligibility.questionCounts.find(q=>q.questionId==='r').eligibleAnswered=2;x.eligibility.questionCounts.find(q=>q.questionId==='r').eligibleMissing=0;},
    x=>{x.total=3;},x=>{x.eligibility.policy='strict';},
    x=>{x.link.bindings[0].conditional=false;},x=>{x.link.bindings[0].conditional='true';},
    x=>{x.link.bindings[0].questionId='another';},x=>{x.link.bindings[0].column=3;},
    x=>{x.link.mappingHash='bad';},x=>{x.link.questionnaireHash=[];},
    x=>{x.eligibility.eligibleIndices=[0,8];},x=>{x.version=1;},x=>{x.version=2;},
    x=>{delete x.eligibility;},x=>{delete x.link;},x=>{x.version=[3];},
  ]){const x=structuredClone(base);mutate(x);assert.throws(()=>parseEvidence(x));}
  assert.throws(()=>parseEvidence({...base,version:2,eligibility:undefined}));
  assert.throws(()=>parseEvidence(Object.assign(Object.create({flag:1}),base)));
  assert.throws(()=>parseResearchLink(base.link));assert.deepEqual(parseResearchLink(base.link,true),base.link);
  assert.throws(()=>linkEvidence(input,link));
});
test('v3 alpha validates complete-case N upper/lower bounds after eligibility without pretending to attest raw rows',async()=>{
  const f=await linked(scaleFixture()),options={columns:[1,2],reverse:[],min:1,max:5,construct:'Synthetic',missingCodes:[]};
  const p=prepare(f,{method:'alpha',...options},{policy:'exclude',confirmed:true});
  const result=analyzeReliability(p.table,options),input=reliabilityEvidence(result,options,{hash:f.identity.sourceHash,simulated:true,question:'Synthetic alpha'});
  const v3=linkEvidence(input,await researchLink(f.mapping,f.identity,false),p.eligibility);
  assert.deepEqual(parseEvidence(v3),v3);assert.equal(v3.n,3);assert.equal(v3.total,4);assert.equal(v3.eligibility.totalRows,7);
  assert.throws(()=>parseEvidence({...v3,n:2}));assert.throws(()=>parseEvidence({...v3,n:4}));
  const report=evidenceSection(v3,'critic-alpha');assert.match(report.body,/客户端汇总/);assert.match(report.body,/服务器未复核逐行分支/);
});
test('legacy v1 frequency report remains byte-stable and old versions never acquire routing metadata',()=>{
  const input={version:1,sourceHash:'a'.repeat(64),classification:'simulated',question:'Synthetic baseline?',variables:['R'],missingCodes:['NA'],total:10,n:7,calculation:{method:'frequency',column:2,counts:[4,3]}};
  const expected={id:'evidence-legacy-review',title:'模拟演示 · 样本结构统计',body:[
    '【教学模拟数据，不能作为实际调查结果】',
    '研究问题（用户填写，非计算结论）：Synthetic baseline?',
    '变量：R。',
    '共读取 10 行，本次分析纳入 7 行，未纳入 3 行。',
    '类别 1：4 / 7，占有效样本的 57.14%。',
    '类别 2：3 / 7，占有效样本的 42.86%。',
    '类别已替换为代号；对应关系需回到原分析卡片核对，不能将代号解释为特定人群。空白及指定缺失代码不进入分母。',
    '缺失代码：NA；空白始终作为缺失。不插补、不加权、不自动去重。',
    '核验边界：服务器仅对浏览器提交的汇总做结构、算术与模板核验，未读取原始答卷，不能证明汇总与原始文件一致。',
    '解释范围仅限本次纳入样本；不提供显著性、因果或总体代表性结论。提交前仍需核对变量含义、招募过程和小样本泄露风险。',
  ].join('\n'),source:`证据记录 legacy-review\n数据 SHA-256：${'a'.repeat(64)}\n计算契约：research-flow/v1；汇总来源：浏览器计算；非竞赛 Gate 证据。`};
  assert.deepEqual(evidenceSection(input,'legacy-review'),expected);assert.deepEqual(parseEvidence(input),input);
  assert.throws(()=>parseEvidence({...input,eligibility:{}}));
});
test('overview and numeric export use eligible scope, retaining source totals and refusing unapproved conditional means',async()=>{
  const f=await linked(),choice={policy:'exclude',confirmed:true};
  const records=numericColumnRecords(f.table,f.missing,f.mapping,f.identity,false,choice);
  const selected=records.find(r=>r.name==='R');assert.equal(selected.status,'computed');assert.equal(selected.scope,'question_response_universe');assert.equal(selected.total,2);assert.equal(selected.column.numeric,1);assert.equal(selected.column.missing,1);assert.equal(selected.column.stats.mean,10);assert.equal(selected.eligibility.totalRows,12);
  const prepared=prepare(f,{method:'numeric',columns:[2]},choice);assert.deepEqual(profileColumn(prepared.table,2,f.missing),selected.column);
  assert.equal(records.find(r=>r.name==='P').status,'blocked');assert.equal(records.find(r=>r.name==='U').total,12);
  for(const policy of [{policy:'exclude',confirmed:false},{policy:'strict',confirmed:true}]){
    const blocked=numericColumnRecords(f.table,f.missing,f.mapping,f.identity,false,policy).find(r=>r.name==='R');
    assert.equal(blocked.status,'blocked');assert.equal(blocked.column,null);assert.equal(blocked.total,null);assert.equal(blocked.eligibility,null);
  }
  const stale=numericColumnRecords(f.table,f.missing,f.mapping,f.identity,true,choice);assert.ok(stale.every(r=>r.status==='blocked'&&r.column===null));
  const raw=numericColumnRecords(f.table,f.missing,null,f.identity,false,choice).find(r=>r.name==='R');assert.equal(raw.scope,'raw_encoding_check');assert.equal(raw.total,12);assert.notEqual(raw.column.stats.mean,10);
});
test('static UI regression: scale shortcut preserves independent recipe candidates while data and mapping replacements clear them',async()=>{
  const source=await readFile(new URL('../components/analysis/SurveyLab.tsx',import.meta.url),'utf8');
  const ast=ts.createSourceFile('SurveyLab.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const visitAll=(node,predicate,result=[])=>{if(predicate(node))result.push(node);ts.forEachChild(node,child=>{visitAll(child,predicate,result);});return result;};
  const mappingNodes=visitAll(ast,node=>(ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node))&&node.tagName.getText(ast)==='QuestionnaireMapping');
  assert.equal(mappingNodes.length,1,'review exact QuestionnaireMapping event handlers');
  const handler=name=>{
    const attribute=mappingNodes[0].attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(ast)===name);
    assert.ok(attribute?.initializer&&ts.isJsxExpression(attribute.initializer)&&attribute.initializer.expression,`${name} is an explicit callback`);
    return attribute.initializer.expression;
  };
  const calls=node=>visitAll(node,ts.isCallExpression).map(n=>n.expression.getText(ast));
  const scaleCalls=calls(handler('onScale'));
  assert.ok(!scaleCalls.includes('setRecipeCandidates'),'scale-only changes must not clear unrelated valid frequency evidence');
  for(const name of ['setResult','setCalculationError','setSelected','setReverse','setMinText','setMaxText','setConstruct','setSection'])assert.ok(scaleCalls.includes(name),`retain alpha setup reset ${name}`);
  assert.ok(calls(handler('onChange')).includes('setRecipeCandidates'),'mapping changes still invalidate recipe evidence');
  for(const name of ['adopt','clear']){
    const fn=visitAll(ast,node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
    assert.equal(fn.length,1);assert.ok(calls(fn[0]).includes('setRecipeCandidates'),`${name} still invalidates recipe evidence`);
  }
});
test('static UI regression: mapping explains supported conditional analysis and conditional scale suggestions',async()=>{
  const source=await readFile(new URL('../components/analysis/QuestionnaireMapping.tsx',import.meta.url),'utf8');
  assert.match(source,/条件题：需在下方确认跳题处理方式；计算时核验父题链与共同应答范围/);
  assert.match(source,/条件题还需确认跳题策略并使用共同应答范围/);
  assert.doesNotMatch(source,/条件题[^<\n]*暂不支持|不含跳题/);
});
