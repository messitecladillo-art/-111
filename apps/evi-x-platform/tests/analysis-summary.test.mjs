import assert from 'node:assert/strict';
import {test} from 'node:test';
import {newQuestion,newQuestionnaire} from '../lib/questionnaire.ts';
import {parseSurveyCsv,profileSurvey} from '../lib/survey-analysis.ts';
import {datasetIdentity,suggestAssignments,mappingSignature} from '../lib/questionnaire-mapping.ts';
import {numericColumnRecords,profileColumn} from '../lib/analysis-summary.ts';

async function fixture(){
  const design=newQuestionnaire();
  design.questions=[{...newQuestion('p','P'),text:'合成筛选',choices:[{code:'1',label:'是'},{code:'0',label:'否'}]},
    {...newQuestion('value','VALUE'),text:'合成数值',type:'number',choices:[],min:0,max:100,condition:{questionId:'p',codes:['1']}}];
  const table=parseSurveyCsv('P,VALUE\n1,10\n1,20\n1,\n0,\n0,999\n,80');
  const identity=await datasetIdentity('a'.repeat(64),'utf-8',table),mapping={design,assignments:suggestAssignments(design,identity),confirmed:null,sourceSignature:null};
  mapping.confirmed=mappingSignature(mapping,identity);return{table,identity,mapping};
}
test('numeric exports separate raw blank checks from eligible counts and statistics',async()=>{
  const {table,identity,mapping}=await fixture();
  const raw=profileSurvey(table,[]),records=numericColumnRecords(table,[],mapping,identity,false,{policy:'exclude',confirmed:true});
  assert.equal(raw.rows,6);assert.equal(raw.columns[1].missing,2);
  assert.equal(records[0].status,'blocked'); // nominal code is not a number measurement
  const result=records[1];assert.equal(result.total,3);assert.equal(result.column.numeric,2);assert.equal(result.column.missing,1);assert.equal(result.column.stats.mean,15);assert.equal(result.column.index,1);
  assert.equal(result.eligibility.totalRows,6);assert.equal(result.eligibility.ineligibleRows,2);assert.equal(result.eligibility.unknownRows,1);assert.equal(result.eligibility.contradictionRows,1);
  assert.ok(!JSON.stringify(records).includes('eligibleIndices'));assert.ok(!JSON.stringify(records).includes('999'));
});
test('unconfirmed, strict, stale, and invalid eligible values cannot leak raw numeric means to linked exports',async()=>{
  const {table,identity,mapping}=await fixture();
  for(const [stale,choice] of [[false,{policy:'exclude',confirmed:false}],[false,{policy:'strict',confirmed:true}],[true,{policy:'exclude',confirmed:true}]]){
    const item=numericColumnRecords(table,[],mapping,identity,stale,choice)[1];assert.equal(item.status,'blocked');assert.equal(item.column,null);assert.equal(item.total,null);assert.equal(item.eligibility,null);
  }
  const bad=structuredClone(table);bad.rows[0][1]='999';assert.equal(numericColumnRecords(bad,[],mapping,identity,false,{policy:'exclude',confirmed:true})[1].column,null);
});
test('manual column profiles remain raw encoding checks and identifier columns stay hidden',async()=>{
  const {table,identity}=await fixture(),rows=numericColumnRecords(table,[],null,identity,false,{policy:'strict',confirmed:false});
  assert.equal(rows[1].scope,'raw_encoding_check');assert.equal(rows[1].total,6);assert.equal(rows[1].eligibility,null);
  const idTable={...table,headers:['P','手机号']};const item=numericColumnRecords(idTable,[],null,identity,false,{policy:'strict',confirmed:false})[1];assert.equal(item.column,null);
  const column=profileColumn({...table,rows:table.rows.slice(0,3)},1,[]);assert.equal(column.index,1);assert.equal(column.stats.mean,15);
});
