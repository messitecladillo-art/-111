import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorContent,parseEditorContent} from '../lib/editor-model.ts';
import {withQuality} from '../lib/quality-layouts.ts';
import {snapshotRecipe,chartData} from '../lib/research-quality.ts';
import {bindReportSlide,buildReportBlockSlide,reportFigureCoverage,reportLinkState} from '../lib/report-storyboard.ts';
async function fixture(){
  const r=await snapshotRecipe({method:'frequency',n:8,total:8,headers:['类别','频数'],rows:[['甲',3],['乙',5]],metrics:[],warnings:[]},{title:'类别分布',sourceName:'公开样本',sourceUrl:'https://example.org/data',sourceHash:'a'.repeat(64),classification:'public'},'r');
  const c=withQuality(createEditorContent());c.quality.results=[r];c.report=[{id:'s',title:'调查发现',body:'乙为5，甲为3。需结合样本范围理解。',source:'公开样本8条',blocks:[{id:'b',kind:'chart',text:'图1 类别分布',evidenceId:'r',valueColumn:1}]}];return c;
}
test('report block becomes editable vector page with exact selected data and source',async()=>{
  const c=await fixture(),before=structuredClone(c),s=await buildReportBlockSlide(c,'s','b');
  assert.deepEqual(c,before);assert.equal(s.reportLink.version,2);assert.equal(await reportLinkState(c,s),'current');
  const chart=s.objects.find(o=>o.sourceBlockId==='b');assert.equal(chart.evidenceId,'r');assert.equal(chart.valueColumn,1);
  c.slides.push(s);assert.equal((await reportFigureCoverage(c))[0].state,'current');assert.equal(parseEditorContent(c).slides.at(-1).reportLink.version,2);
});
test('v2 binding detects blocks, aggregate input, wording and native object changes independently',async()=>{
  const c=await fixture(),s=await buildReportBlockSlide(c,'s','b');
  for(const mutate of [x=>x.report[0].blocks[0].text+='改版',x=>x.quality.results[0].rows[0][1]=2,x=>x.quality.results[0].warnings.push('新缺失规则')]){
    const copy=structuredClone(c);mutate(copy);assert.equal(await reportLinkState(copy,s),'report_changed');
  }
  const altered=structuredClone(s);altered.objects[0].x+=1;assert.equal(await reportLinkState(c,altered),'slide_changed');
});
test('coverage is scoped to chapter and rejects hidden or incorrectly replaced objects even after rebinding',async()=>{
  const c=await fixture(),s=await buildReportBlockSlide(c,'s','b');c.slides=[s];
  c.report.push({...structuredClone(c.report[0]),id:'copy'});
  assert.equal((await reportFigureCoverage(c))[1].state,'unused');
  for(const patch of [{opacity:0},{valueColumn:0},{evidenceId:'other'}]){
    const modified=structuredClone(s);Object.assign(modified.objects.find(o=>o.sourceBlockId==='b'),patch);
    c.slides=[await bindReportSlide(c,modified,'s')];assert.equal((await reportFigureCoverage(c))[0].state,'review');
  }
  const duplicate=structuredClone(s);duplicate.objects.push({...duplicate.objects.find(o=>o.sourceBlockId==='b'),id:'wrong',valueColumn:0});
  c.slides=[await bindReportSlide(c,duplicate,'s')];assert.equal((await reportFigureCoverage(c))[0].state,'review');
});
test('empty, fabricated or excessively long excerpt and full deck fail without changing the report',async()=>{
  const c=await fixture();await assert.rejects(buildReportBlockSlide(c,'s','b','不存在的节选'),/原文/);
  c.report[0].body='长'.repeat(601);await assert.rejects(buildReportBlockSlide(c,'s','b'),/600/);
  c.slides=Array.from({length:40},(_,i)=>({...c.slides[0],id:'p'+i}));await assert.rejects(buildReportBlockSlide(c,'s','b'),/40/);
});
test('old document accepts only legacy links and new optional typography is preserved',async()=>{
  const c=await fixture(),s=await buildReportBlockSlide(c,'s','b');const legacy=createEditorContent();legacy.slides[0].reportLink=s.reportLink;assert.throws(()=>parseEditorContent(legacy),/旧草稿/);
  assert.equal(s.objects.find(o=>o.bold)?.bold,true);
});
test('cross-table chart labels retain both categories without conflating subscription groups',async()=>{
  const c=await fixture(),r={...c.quality.results[0],method:'crosstab',headers:['历史','订阅','频数'],rows:[['既往成功','未订阅',3],['既往成功','已订阅',5]]};
  assert.deepEqual(chartData(r,2),{labels:['既往成功 · 未订阅','既往成功 · 已订阅'],values:[3,5]});
});
