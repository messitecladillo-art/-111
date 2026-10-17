import test from 'node:test';
import assert from 'node:assert/strict';
import {runRecipe} from '../lib/analysis-recipes.ts';
import {runPlanNode,filterPlanSample} from '../lib/analysis-plan.ts';
import {calculationReceipt,parseAnalysisResultReceipt} from '../lib/analysis-result-receipt.ts';
import {parseResultSnapshot,snapshotRecipe,resultPayload,digestText,verifyResearchQuality} from '../lib/research-quality.ts';
import {createEditorContent,parseEditorContent} from '../lib/editor-model.ts';
const source={title:'合成验收',sourceName:'本地合成参考',sourceUrl:'',sourceHash:'a'.repeat(64),classification:'simulated'};
const node=(method,x=0,y=null)=>({id:'node',method,x,y,question:'测试问题',branch:'全部',filter:null,scale:null});
const table={headers:['组别','数值','另一数值'],rows:[['A','1','4'],['A','3','5'],['A','6','7'],['B','2','1'],['B','8','6'],['B','9','8'],['C','4','3'],['C','7','8'],['C','10','5'],['A','','坏值'],['B','NA','3']]};
function params(table,n,missing,result,sample=filterPlanSample(table,null,missing).evidence){return calculationReceipt(n,table.headers,missing,'c'.repeat(64),null,sample,result.total,null,null);}
test('every existing recipe preserves complete inference, interpretation, CI cells and settings through save/load',async()=>{
  for(const n of [node('frequency'),node('numeric',1),node('groups',0,1),node('crosstab',0,2),node('pearson',1,2),node('spearman',1,2)]){
    const value=runRecipe(table,n,['NA']),r=await snapshotRecipe(value,source,n.method,params(table,n,['NA'],value));
    assert.deepEqual(r.receipt.inference,value.inference);assert.equal(r.receipt.interpretation,value.interpretation);
    assert.deepEqual(r.rows,value.rows);assert.equal(r.receipt.sample.analysisRows,value.n);
    assert.deepEqual(r.receipt.calculation.missingCodes,['NA']);
    const content={...createEditorContent(),version:2,quality:{version:1,results:[r],findings:[]}};
    assert.deepEqual(parseEditorContent(JSON.parse(JSON.stringify(content))),content);await verifyResearchQuality(content.quality);
  }
});
test('Holm follow-up, effect interval and undefined inference survive without converting null to zero',async()=>{
  const groups=runRecipe(table,node('groups',0,1),[]),g=await snapshotRecipe(groups,source);
  assert.equal(g.receipt.inference.comparisons.length,3);
  assert.ok(g.receipt.inference.comparisons.every(p=>p.adjusted>=p.p));
  const two={headers:table.headers,rows:table.rows.slice(0,6)},t=await snapshotRecipe(runRecipe(two,node('groups',0,1),[]),source);
  assert.deepEqual(t.receipt.inference.primary.effect.interval,runRecipe(two,node('groups',0,1),[]).inference.primary.effect.interval);
  const constant={headers:['组','值'],rows:[['A','3'],['A','3'],['B','3'],['B','3']]};
  const zero=await snapshotRecipe(runRecipe(constant,node('groups',0,1),[]),source);
  assert.equal(zero.receipt.inference.primary.p,null);assert.match(zero.receipt.inference.primary.line,/不定义/);
});
test('filter, routing intersection and overlapping exclusions preserve the distinct denominator chain',async()=>{
  const n={...node('pearson',1,2),filter:{column:0,values:['A','B']}},branch=filterPlanSample(table,n.filter,['NA']);
  // This explicit common response subset stands for the original-table routing intersection.
  const input={...table,rows:branch.table.rows.slice(0,7)},value=runPlanNode(input,n,['NA']);
  const calculation=params(table,n,['NA'],value,branch.evidence),r=await snapshotRecipe(value,source,'filtered',calculation);
  assert.deepEqual(calculation.sample,{originalRows:11,branchRows:8,commonEligibleRows:7,filterExcludedRows:3,filterMissingRows:0});
  assert.equal(r.total,7);assert.equal(r.n,6);assert.equal(r.receipt.sample.missingRows,1);assert.equal(r.receipt.sample.invalidRows,1);
  assert.equal(r.receipt.sample.excludedRows,1,'missing and invalid overlap, never add them');
  assert.equal(r.receipt.calculation.filter.values[0],'A');
  assert.ok(!JSON.stringify(calculation).includes('坏值'),'calculation receipt never copies raw cells');
});
test('alpha retains ordered items, reverse coding, range and complete-case reasons',async()=>{
  const t={headers:['S1','S2','S3'],rows:[['1','5','2'],['2','4','3'],['3','3','4'],['4','2','5'],['','3','2'],['6','2','4'],['坏值','1','4']]};
  const n={...node('alpha',null),scale:{columns:[0,1,2],reverse:[1],min:1,max:5,construct:'合成构念'}};
  const value=runPlanNode(t,n,[]),r=await snapshotRecipe(value,source,'alpha',params(t,n,[],value));
  assert.deepEqual(r.receipt.calculation.scale,n.scale);assert.equal(r.receipt.sample.outOfRangeRows,1);
  assert.equal(r.receipt.sample.analysisRows,4);assert.equal(r.receipt.percentageBasis,'none');
});
test('routing records are aggregate-only and bind their original table and mapping versions',async()=>{
  const n=node('numeric',1),input={...table,rows:table.rows.slice(0,8)},value=runPlanNode(input,n,[]);
  const sample=filterPlanSample(table,null,[]).evidence;
  const routing={schema:'row-eligibility/v1',policy:'exclude',totalRows:11,eligibleRows:8,ineligibleRows:2,unknownRows:1,contradictionRows:1,questionCounts:[{questionId:'q1',eligibleAnswered:7,eligibleMissing:1,ineligibleBlank:1,ineligibleAnswered:1,unknownBlank:0,unknownAnswered:1}]};
  const calculation=calculationReceipt(n,table.headers,[],'c'.repeat(64),{questionnaireHash:'d'.repeat(64),mappingHash:'e'.repeat(64)},sample,8,routing,null);
  const r=await snapshotRecipe(value,source,'routing',calculation);
  assert.deepEqual(r.receipt.calculation.routing.analysis,routing);
  for(const change of [x=>x.calculation.mapping=null,x=>x.calculation.routing.analysis.totalRows=10,x=>x.calculation.routing.analysis.questionCounts[0].rawRows=[]]){
    const receipt=structuredClone(r.receipt);change(receipt);assert.throws(()=>parseAnalysisResultReceipt(receipt,r));
  }
});
test('legacy results remain byte/hash stable and gain no invented receipt on read',async()=>{
  const legacy=parseResultSnapshot({id:'legacy',...source,resultHash:'0'.repeat(64),method:'frequency',n:2,total:3,headers:['类别','n'],rows:[['A',2]],metrics:[],warnings:[]});
  legacy.resultHash=await digestText(JSON.stringify(resultPayload(legacy)));
  const before=JSON.stringify(legacy),parsed=parseResultSnapshot(JSON.parse(before));
  assert.equal(JSON.stringify(parsed),before);assert.equal(Object.hasOwn(parsed,'receipt'),false);
  await verifyResearchQuality({version:1,results:[parsed],findings:[]});
});
test('receipt changes invalidate the result hash, including textual interpretation and filters',async()=>{
  const n=node('frequency'),value=runRecipe(table,n,[]),r=await snapshotRecipe(value,source,'hash',params(table,n,[],value));
  for(const change of [x=>x.receipt.interpretation+='更改',x=>x.receipt.calculation.missingCodes.push('NA')]){
    const altered=structuredClone(r);change(altered);await assert.rejects(verifyResearchQuality({version:1,results:[altered],findings:[]}),/指纹/);
  }
});
test('strict receipts reject unbounded, nonfinite, raw-row and inconsistent nested data',async()=>{
  const n=node('groups',0,1),value=runRecipe(table,n,[]),r=await snapshotRecipe(value,source,'invalid',params(table,n,[],value));
  const changes=[x=>x.rawRows=[],x=>x.inference.primary.p=NaN,x=>x.inference.primary.effect.value=Infinity,x=>x.inference.comparisons[0].df=0,x=>x.inference.comparisons[0].adjusted=-.1,x=>x.inference.notes=Array(31).fill('x'),x=>x.calculation.variables[0].rows=[1],x=>x.calculation.sample.originalRows=1,x=>x.sample.analysisRows=0,x=>x.calculation.filter={column:0,values:Array(51).fill('A')},x=>x.calculation.routing.analysis={rawData:[]},x=>x.inference.primary.effect.interval={lower:2,upper:1}];
  for(const change of changes){const receipt=structuredClone(r.receipt);change(receipt);assert.throws(()=>parseAnalysisResultReceipt(receipt,r));}
  const deep=structuredClone(r.receipt);deep.inference.primary.effect.interval={lower:{value:1},upper:2};assert.throws(()=>parseAnalysisResultReceipt(deep,r));
});
