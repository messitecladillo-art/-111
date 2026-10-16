import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {legacySource} from './helpers/legacy-source.mjs';
import {parseEvidence,evidenceSection,appendEvidence,frequencyEvidence,reliabilityEvidence} from '../lib/research-flow.ts';
import {createEditorContent,EDITOR_LIMITS} from '../lib/editor-model.ts';
import {parseSurveyCsv,analyzeReliability,DEMO_SURVEY_CSV} from '../lib/survey-analysis.ts';
import {runRecipe} from '../lib/analysis-recipes.ts';
const base=()=>({version:1,sourceHash:'a'.repeat(64),classification:'simulated',question:'样本结构如何？',variables:['渠道'],missingCodes:[],total:12,n:12,calculation:{method:'frequency',counts:[6,6],column:0}});
test('strict aggregate whitelist rejects raw rows, arbitrary conclusions, coercion and impossible denominator',()=>{
  assert.deepEqual(parseEvidence(base()),base());
  for(const patch of [{rows:[]},{verified:true},{question:''},{sourceHash:'bad'},{classification:'actual'},{n:0},{n:13},{n:'12'},{total:10001},{calculation:{method:'frequency',counts:[6,5],column:0}},{calculation:{method:'frequency',counts:[6,6],column:0,labels:['private']}}])assert.throws(()=>parseEvidence({...base(),...patch}));
  const prose=evidenceSection(base(),'test');assert.match(prose.body,/50.00%/);assert.match(prose.body,/教学模拟/);assert.match(prose.body,/未读取原始答卷/);
});
test('frequency aggregate strips category labels and matches real calculator without sending raw responses',()=>{
  const table=parseSurveyCsv(DEMO_SURVEY_CSV),result=runRecipe(table,{id:'x',method:'frequency',x:0,y:null,question:'渠道如何'},[]);
  const input=frequencyEvidence(result,{hash:'a'.repeat(64),simulated:true,question:'渠道构成\n是否不同',variable:'渠道',column:0,missingCodes:[]});
  assert.equal(input.question,'渠道构成 是否不同');
  assert.equal(input.n,result.n);assert.equal(input.calculation.counts.reduce((a,b)=>a+b,0),input.n);
  for(const secret of ['校园','社区','rows','headers'])assert.ok(!JSON.stringify(input).includes(secret));
});
test('alpha summary formula matches existing engine; preserves negative values and rejects degeneracy',()=>{
  for(const csv of ['a,b,c\n1,1,2\n2,2,3\n3,3,4\n4,5,5','a,b,c\n1,5,2\n2,4,3\n3,3,3\n4,2,4']){
    const table=parseSurveyCsv(csv),options={columns:[0,1,2],reverse:[],min:1,max:5,missingCodes:[]},result=analyzeReliability(table,options);
    const input=reliabilityEvidence(result,options,{hash:'a'.repeat(64),simulated:true,question:'一致性如何'}),c=input.calculation;
    assert.ok(Math.abs(3/2*(1-c.itemVarianceSum/c.totalVariance)-result.alpha)<1e-12);
    const prose=evidenceSection(input,'a');assert.match(prose.body,/样本很小/);assert.match(prose.body,/不证明单维性或效度/);
    assert.throws(()=>parseEvidence({...input,calculation:{...c,totalVariance:0}}));
    assert.throws(()=>parseEvidence({...input,calculation:{...c,totalVariance:c.itemVarianceSum*4}}));
    assert.throws(()=>parseEvidence({...input,calculation:{...c,reverse:[99]}}));
  }
});
test('proposal appends once and preserves every report/PPT field; rejects capacity without mutation',()=>{
  const original=createEditorContent(),before=JSON.stringify(original),proposal=evidenceSection(base(),'unique');
  const next=appendEvidence(original,proposal);assert.equal(JSON.stringify(original),before);assert.deepEqual(next.slides,original.slides);assert.deepEqual(next.report.slice(0,-1),original.report);assert.throws(()=>appendEvidence(next,proposal));
  const full={...original,report:Array.from({length:EDITOR_LIMITS.sections},(_,i)=>({...original.report[0],id:`s${i}`}))};assert.throws(()=>appendEvidence(full,proposal));
});
test('privacy and UI approval boundaries remain explicit; no implicit result adoption in editor',async()=>{
  const flow=await readFile(new URL('../components/analysis/ResearchFlow.tsx',import.meta.url),'utf8');
  assert.match(flow,/consent!==|!consent/);assert.match(flow,/input:candidate.input,consent:true/);assert.ok(!/table\.rows|dataset\.table|localStorage|sessionStorage/.test(flow));
  assert.match(flow,/!approval\|\|!inputCurrent\|\|stale/);assert.match(flow,/x-editor-scope/);assert.match(flow,/EDITOR_RECOVERY_EVENT/);
  const api=await readFile(legacySource(new URL('../app/api/drafts/research-runs/route.ts',import.meta.url)),'utf8');assert.match(api,/body.consent!==true/);assert.match(api,/parseEvidence/);
});
