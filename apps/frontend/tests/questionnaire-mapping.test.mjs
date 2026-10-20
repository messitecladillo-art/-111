import assert from 'node:assert/strict';
import {test} from 'node:test';
import {newQuestion,newQuestionnaire} from '../lib/questionnaire.ts';
import {parseSurveyCsv,analyzeReliability} from '../lib/survey-analysis.ts';
import {datasetIdentity,suggestAssignments,mappingSignature,mappingCurrent,analysisProblems,mappingBackup,restoreMapping,researchLink,scaleSuggestions} from '../lib/questionnaire-mapping.ts';
import {linkEvidence,reliabilityEvidence,parseEvidence,evidenceSection,evidenceContract} from '../lib/research-flow.ts';
import {parseResearchLink} from '../lib/research-link.ts';
const h='a'.repeat(64);
async function fixture(csv='Q1,Q2,G\n1,2,1\n2,2,2\n3,4,1\n4,5,2'){
  const design=newQuestionnaire();design.questions=[1,2].map(i=>({...newQuestion('q'+i,'Q'+i),text:'合成量表 '+i,type:'likert',min:1,max:5,minLabel:'低',maxLabel:'高',construct:'合成体验',choices:[]}));
  design.questions.push({...newQuestion('group','G'),text:'合成类别',choices:[{code:'1',label:'甲'},{code:'2',label:'乙'}]});
  const table=parseSurveyCsv(csv),identity=await datasetIdentity(h,'utf-8',table),mapping={design,assignments:suggestAssignments(design,identity),sourceSignature:null,confirmed:null};mapping.confirmed=mappingSignature(mapping,identity);
  return {design,table,identity,mapping};
}
const alpha={method:'alpha',columns:[0,1],min:1,max:5,reverse:[],construct:'合成体验'};
test('mapping identity binds parse interpretation; confirmation changes on edits and restore never approves',async()=>{
  const f=await fixture();assert.equal(mappingCurrent(f.mapping,f.identity,false),true);
  assert.notEqual((await datasetIdentity(h,'gb18030',f.table)).interpretationHash,f.identity.interpretationHash);
  const changed=structuredClone(f.mapping);changed.design.questions[0].text+='改';assert.equal(mappingCurrent(changed,f.identity,false),false);
  const raw=mappingBackup(f.mapping,f.identity),restored=restoreMapping(raw,f.identity);assert.equal(restored.confirmed,null);assert.equal(restored.sourceSignature,null);assert.deepEqual(restored.assignments,f.mapping.assignments);
  assert.throws(()=>restoreMapping(raw,{...f.identity,encoding:'gb18030'}));assert.throws(()=>restoreMapping(raw.replace('"schema":','"schema":"bad","schema":'),f.identity));assert.ok(!raw.includes('"rows": ['));
});
test('semantic guards reject nominal numeric methods, conditional items, fractional points and out-of-domain codes',async()=>{
  const f=await fixture(),guard=r=>analysisProblems(f.mapping,f.identity,false,f.table,[],r);
  assert.deepEqual(guard(alpha),[]);assert.ok(guard({method:'numeric',columns:[2]}).length);assert.ok(guard({method:'pearson',columns:[0,2]}).length);
  for(const csv of ['Q1,Q2,G\n2.5,2,1\n3,3,2','Q1,Q2,G\n1,2,999\n3,4,1']){
    const bad=await fixture(csv);assert.ok(analysisProblems(bad.mapping,bad.identity,false,bad.table,[],csv.includes('999')?{method:'frequency',columns:[2]}:alpha).length);
  }
  f.mapping.design.questions[0].condition={questionId:'group',codes:['1']};f.mapping.confirmed=mappingSignature(f.mapping,f.identity);assert.ok(guard(alpha).some(s=>s.includes('显示条件必须引用之前的单选题')));
});
test('alpha requires matching construct, range and exact reverse policy while unrelated unmapped items do not block',async()=>{
  const f=await fixture();f.mapping.assignments=f.mapping.assignments.filter(a=>a.questionId!=='group');f.mapping.confirmed=mappingSignature(f.mapping,f.identity);
  assert.deepEqual(analysisProblems(f.mapping,f.identity,false,f.table,[],alpha),[]);
  for(const patch of [{construct:'other'},{min:0},{reverse:[0]}])assert.ok(analysisProblems(f.mapping,f.identity,false,f.table,[],{...alpha,...patch}).length);
  const suggestion=scaleSuggestions(f.mapping,f.identity)[0];assert.deepEqual(suggestion.columns,[0,1]);assert.deepEqual(suggestion.omitted,[]);
});
test('v2 evidence selects only actual calculation bindings and keeps v1 deterministic',async()=>{
  const f=await fixture(),result=analyzeReliability(f.table,{...alpha,missingCodes:[]}),input=reliabilityEvidence(result,{...alpha,missingCodes:[]},{hash:h,simulated:true,question:'合成体验一致性？'});
  const v1=evidenceSection(input,'id');assert.equal(evidenceContract(input),'research-flow/v1');
  const linked=linkEvidence(input,await researchLink(f.mapping,f.identity,false));assert.equal(linked.version,2);assert.equal(linked.link.bindings.length,2);assert.deepEqual(parseEvidence(linked),linked);assert.match(evidenceSection(linked,'id').source,/research-flow\/v2/);assert.deepEqual(evidenceSection(input,'id'),v1);
  for(const value of [['simulated'],{},true])assert.throws(()=>parseEvidence({...linked,classification:value}));
  for(const key of ['type','representation']){const bad=structuredClone(linked.link);bad.bindings[0][key]=[bad.bindings[0][key]];assert.throws(()=>parseResearchLink(bad));}
  const bad=structuredClone(linked);bad.link.bindings.forEach(b=>b.construct=' ');assert.throws(()=>parseEvidence(bad));
});
