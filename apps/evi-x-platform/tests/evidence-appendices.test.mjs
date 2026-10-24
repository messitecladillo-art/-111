import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorContent,parseEditorContent} from '../lib/editor-model.ts';
import {runRecipe} from '../lib/analysis-recipes.ts';
import {runPlanNode,filterPlanSample} from '../lib/analysis-plan.ts';
import {calculationReceipt} from '../lib/analysis-result-receipt.ts';
import {snapshotRecipe,resultPayload,digestText,parseResultSnapshot,confirmFinding,defaultFinding,findingSignature,makeSlideObject} from '../lib/research-quality.ts';
import {figureFromResult} from '../lib/report-figure.ts';
import {bindReportSlideSources} from '../lib/report-storyboard.ts';
import {APPENDIX_BODY_LIMIT,createEvidenceAppendixProposal,appendEvidenceAppendixSections,parseAiUsageLedger,createDefenseEvidenceReference,verifyDefenseEvidenceReference,formatDefenseEvidenceReference} from '../lib/evidence-appendices.ts';

const source={title:'合成汇总回归样例',sourceName:'本地合成数据，仅用于测试',sourceUrl:'',sourceHash:'a'.repeat(64),classification:'simulated'};
const table={headers:['组别','数值','另一数值'],rows:[['A','1','4'],['A','3','5'],['A','6','7'],['B','2','1'],['B','8','6'],['B','9','8'],['C','4','3'],['C','7','8'],['C','10','5'],['A','','坏值'],['B','NA','3']]};
const node=(method,x=0,y=null)=>({id:'node',method,x,y,question:'测试问题',branch:'全部',filter:null,scale:null});
const text=(proposal,kind)=>proposal.sections.filter(s=>proposal.groups[kind].includes(s.id)).map(s=>s.body).join('\n\n');
const usage=(patch={})=>({id:'call-1',provider:'openai',model:'configured-model',purpose:'report-draft',status:'unknown',requestedAt:'2026-10-17T07:30:00Z',finishedAt:null,inputHash:'b'.repeat(64),outputHash:null,usage:{inputTokens:null,outputTokens:null,cost:null,currency:null},...patch});
const ledger=records=>({schema:'AiUsageLedger/v1',coverage:'partial',projectId:'project-1',records});
async function aggregate(method='frequency'){
  const n=node(method,method==='frequency'?0:1,method==='pearson'?2:null),value=runRecipe(table,n,['NA']);
  const calculation=calculationReceipt(n,table.headers,['NA'],'c'.repeat(64),null,filterPlanSample(table,null,['NA']).evidence,value.total,null,null);
  return snapshotRecipe(value,source,'result-1',calculation);
}
async function fixture(){
  const result=await aggregate(),content={...createEditorContent(),version:3,quality:{version:1,results:[result],findings:[]},visualStyle:{schema:'ProjectVisualStyle/v1',paletteId:'blue',version:1}};
  const finding=confirmFinding({...defaultFinding(result),id:'finding-1',title:'测试发现',question:'哪组出现较多？',interpretation:'仅描述本合成样例，不外推总体。',scope:'本测试数据',alternatives:'分类结构可能影响频数。',action:'后续核对抽样。'},content.quality);
  content.quality.findings=[finding];const figure=figureFromResult(result,'bar',1,'figure-1');content.figures=[figure];
  Object.assign(content.report[0],{findingIds:[finding.id],findingSnapshots:{[finding.id]:findingSignature(finding)},blocks:[{id:'block-1',kind:'chart',text:'测试分布',evidenceId:result.id,valueColumn:1,figureId:figure.id}]});
  content.slides[1].objects=[makeSlideObject('chart',{id:'object-1',evidenceId:result.id,figureId:figure.id})];
  content.slides[1]=await bindReportSlideSources(content,content.slides[1],[{sectionId:content.report[0].id,blockIds:['block-1']}]);
  return parseEditorContent(content);
}

test('saved filter/routing/analysis denominators remain distinct and overlapping reasons never summed',async()=>{
  const n={...node('pearson',1,2),filter:{column:0,values:['A','B']}},branch=filterPlanSample(table,n.filter,['NA']);
  const input={...table,rows:branch.table.rows.slice(0,7)},value=runPlanNode(input,n,['NA']);
  const calculation=calculationReceipt(n,table.headers,['NA'],'c'.repeat(64),null,branch.evidence,value.total,null,null);
  const r=await snapshotRecipe(value,source,'result-1',calculation),content={...createEditorContent(),version:2,quality:{version:1,results:[r],findings:[]}};
  const proposal=await createEvidenceAppendixProposal(content),body=text(proposal,'data');
  assert.match(body,/原始 11 → 筛选分支 8 → 共同可应答 7 → 有效分析 6/);
  assert.match(body,/剔除 1/);assert.match(body,/缺失 1；无效 1/);assert.match(body,/不相加/);
  assert.ok(body.includes(r.resultHash));assert.ok(body.includes(calculation.interpretationHash));
  assert.ok(!body.includes('坏值'),'raw cells never copied from source table');
  assert.equal(content.report.length,6,'proposal creation does not write');
});
test('default local proposal explicitly leaves AI coverage unavailable and legacy receipts absent',async()=>{
  const r=parseResultSnapshot({id:'legacy',...source,resultHash:'0'.repeat(64),method:'frequency',n:2,total:3,headers:['类','n'],rows:[['A',2]],metrics:[],warnings:[]});
  r.resultHash=await digestText(JSON.stringify(resultPayload(r)));
  const content={...createEditorContent(),version:2,quality:{version:1,results:[r],findings:[]}},before=JSON.stringify(content),proposal=await createEvidenceAppendixProposal(content);
  assert.match(text(proposal,'data'),/历史结果未登记计算凭据/);assert.equal(proposal.coverage.legacyReceiptCount,1);
  assert.match(text(proposal,'ai'),/无法判断是否使用过 AI/);assert.match(text(proposal,'ai'),/不能以此空记录声明未使用 AI/);
  assert.equal(JSON.stringify(content),before);assert.equal(r.receipt,undefined);
});
test('partial AI ledger preserves unknown receipt, missing usage and actual times without inventing zero cost',async()=>{
  const proposal=await createEvidenceAppendixProposal(createEditorContent(),{projectId:'project-1',aiLedger:ledger([usage()])}),body=text(proposal,'ai');
  assert.match(body,/调用结果未知，待对账/);assert.match(body,/费用 未提供／未定义/);assert.match(body,/结束时间：未登记/);
  assert.ok(!body.includes('费用 0'));assert.ok(body.includes('2026-10-17T07:30:00Z'));
  assert.equal(proposal.coverage.ai,'partial');assert.equal(proposal.coverage.aiRecords,1);
  const empty=await createEvidenceAppendixProposal(createEditorContent(),{projectId:'project-1',aiLedger:ledger([])});
  assert.match(text(empty,'ai'),/0 条脱敏凭据，完整覆盖尚未核验/);
});
test('personally scoped questionnaire adapter leaves historical provider/model unknown and names its exact coverage',async()=>{
  const scoped={...ledger([usage({purpose:'questionnaire',provider:null,model:null})]),scope:'own-questionnaire-proposals/latest-200'};
  const parsed=parseAiUsageLedger(scoped,'project-1');assert.equal(parsed.records[0].model,null);assert.equal(parsed.records[0].provider,null);
  const proposal=await createEvidenceAppendixProposal(createEditorContent(),{projectId:'project-1',aiLedger:scoped}),body=text(proposal,'ai');
  assert.match(body,/仅本人问卷提案最近 200 条/);assert.match(body,/其他模块、队友及外部工具未覆盖/);assert.match(body,/供应商 未登记；模型 未登记/);
  assert.equal(proposal.coverage.aiScope,'own-questionnaire-proposals/latest-200');
  for(const provider of ['deepseek','qwen'])assert.equal(parseAiUsageLedger(ledger([usage({provider})]),'project-1').records[0].provider,provider);
  const empty=await createEvidenceAppendixProposal(createEditorContent(),{projectId:'project-1',aiLedger:{...scoped,records:[]}});assert.match(text(empty,'ai'),/空记录不能声明未使用 AI/);
  assert.throws(()=>parseAiUsageLedger({...scoped,scope:'all-team-calls'},'project-1'));
  assert.throws(()=>parseAiUsageLedger({...scoped,records:[usage()]},'project-1'),'scope cannot mislabel report calls as questionnaire calls');
});
test('two hundred real-receipt slots split into bounded appendix sections without dropping calls',async()=>{
  const records=Array.from({length:200},(_,i)=>usage({id:`call-${i}`,purpose:'questionnaire',provider:null,model:null}));
  const proposal=await createEvidenceAppendixProposal(createEditorContent(),{projectId:'project-1',aiLedger:{...ledger(records),scope:'own-questionnaire-proposals/latest-200'}});
  const body=text(proposal,'ai');assert.ok(proposal.groups.ai.length>1);assert.equal((body.match(/调用 call-\d+：/g)??[]).length,200);
  assert.ok(proposal.sections.every(s=>s.body.length<=APPENDIX_BODY_LIMIT));assert.doesNotThrow(()=>appendEvidenceAppendixSections(createEditorContent(),proposal.sections));
  assert.throws(()=>parseAiUsageLedger(ledger([...records,usage({id:'extra'})]),'project-1'));
});
test('AI parser is project-bound, rejects prompt/key/raw fields, credentials, getters and falsely complete coverage',()=>{
  for(const change of [x=>x.prompt='raw',x=>x.key='secret',x=>x.answers=['raw'],x=>x.model='sk-secret-value',x=>x.usage.prompt='raw',x=>x.usage.cost=Infinity,x=>x.requestedAt='2026-02-31T00:00:00Z',x=>x.finishedAt='2026-10-16T00:00:00Z',x=>x.outputHash='bad']){
    const r=usage();change(r);assert.throws(()=>parseAiUsageLedger(ledger([r]),'project-1'));
  }
  assert.throws(()=>parseAiUsageLedger(ledger([usage()]),'other-project'));
  assert.throws(()=>parseAiUsageLedger(ledger([usage()])));
  assert.throws(()=>parseAiUsageLedger({...ledger([]),coverage:'complete'},'project-1'));
  assert.throws(()=>parseAiUsageLedger({...ledger([usage()]),coverage:'unavailable'},'project-1'));
  assert.throws(()=>parseAiUsageLedger(ledger([usage(),usage()]),'project-1'));
  const getter=usage();Object.defineProperty(getter,'model',{enumerable:true,get(){throw Error('must not execute getter');}});
  assert.throws(()=>parseAiUsageLedger(ledger([getter]),'project-1'),/结构无效/);
});
test('claims reference exact wording, source, shared figure and bound report/PPT locations',async()=>{
  const content=await fixture(),proposal=await createEvidenceAppendixProposal(content),ref=await createDefenseEvidenceReference(content,'finding-1');
  assert.equal(ref.status,'confirmed');assert.deepEqual(ref.locations.map(l=>l.kind),['report','slide','figure']);
  assert.ok(ref.locations.every(l=>l.state==='current'));assert.equal(ref.evidence[0].n,11);
  assert.equal(ref.findingHash,await digestText(findingSignature(content.quality.findings[0])));
  assert.ok(text(proposal,'claims').includes(ref.referenceHash));assert.ok(formatDefenseEvidenceReference(ref).includes(content.quality.results[0].resultHash));
  assert.equal((await verifyDefenseEvidenceReference(content,ref)).state,'current');
});
test('wording, evidence, palette and slide changes require renewed defense references',async()=>{
  const content=await fixture(),ref=await createDefenseEvidenceReference(content,'finding-1');
  for(const change of [c=>c.quality.findings[0].interpretation+=' 新解释',c=>c.report[0].body+=' 新正文',c=>c.slides[1].title+=' 新标题',c=>c.figures[0].note='新图注',c=>c.visualStyle.paletteId='forest']){
    const changed=structuredClone(content);change(changed);assert.equal((await verifyDefenseEvidenceReference(changed,ref)).state,'review');
  }
  const changed=structuredClone(content),r=changed.quality.results[0];r.rows[0][1]++;r.resultHash=await digestText(JSON.stringify(resultPayload(r)));changed.figures[0].resultHash=r.resultHash;
  const next=await createDefenseEvidenceReference(changed,'finding-1');assert.equal(next.status,'needs_review');assert.equal((await verifyDefenseEvidenceReference(changed,ref)).state,'review');
  const absent=structuredClone(content);absent.quality.findings=[];delete absent.report[0].findingIds;delete absent.report[0].findingSnapshots;
  assert.equal((await verifyDefenseEvidenceReference(absent,ref)).state,'missing');
});
test('unbound or hidden slide evidence and stale report wording are not presented as confirmed placement',async()=>{
  const content=await fixture();delete content.slides[1].reportLink;content.report[0].findingSnapshots['finding-1']='旧文字';
  let ref=await createDefenseEvidenceReference(content,'finding-1');assert.equal(ref.locations.find(l=>l.kind==='report').state,'review');assert.equal(ref.locations.find(l=>l.kind==='slide').state,'unlinked');
  assert.equal((await verifyDefenseEvidenceReference(content,ref)).state,'review');
  content.slides[1].objects[0].opacity=0;ref=await createDefenseEvidenceReference(content,'finding-1');assert.equal(ref.locations.find(l=>l.kind==='slide').state,'hidden');
});
test('tampered analysis or citation hashes fail closed',async()=>{
  const content=await fixture(),ref=await createDefenseEvidenceReference(content,'finding-1');
  const bad=structuredClone(content);bad.quality.results[0].rows[0][1]++;
  await assert.rejects(createEvidenceAppendixProposal(bad),/指纹/);
  await assert.rejects(createDefenseEvidenceReference(bad,'finding-1'),/指纹/);
  const altered=structuredClone(ref);altered.interpretation='未经核验的修改';assert.equal((await verifyDefenseEvidenceReference(content,altered)).state,'invalid');
});
test('stable appendices are idempotent, preserve existing work and refuse same-ID edits',async()=>{
  const content=await fixture(),proposal=await createEvidenceAppendixProposal(content),before=structuredClone(content.report);
  const appended=appendEvidenceAppendixSections(content,proposal.sections);assert.deepEqual(appended.report.slice(0,before.length),before);
  const twice=appendEvidenceAppendixSections(appended,proposal.sections);assert.deepEqual(twice,appended);
  const regenerated=await createEvidenceAppendixProposal(appended);assert.deepEqual(regenerated.sections,proposal.sections);
  const edited=structuredClone(appended);edited.report.at(-1).body+=' 用户修改';
  assert.throws(()=>appendEvidenceAppendixSections(edited,proposal.sections),/保留原文/);assert.ok(edited.report.at(-1).body.endsWith('用户修改'));
  assert.equal(content.report.length,before.length);
});
test('long appendices split without losing text or breaking Unicode and fit report limits',async()=>{
  const content={...createEditorContent(),version:2,quality:{version:1,results:[],findings:[]}};
  const marker='完整段落🙂';
  for(let i=0;i<10;i++){
    const r=await aggregate();r.id=`r-${i}`;r.title=`结果 ${i}`;r.warnings=[marker.repeat(100)];r.resultHash=await digestText(JSON.stringify(resultPayload(r)));content.quality.results.push(r);
  }
  const p=await createEvidenceAppendixProposal(content),data=p.sections.filter(s=>p.groups.data.includes(s.id));
  assert.ok(data.length>1);assert.ok(data.every(s=>s.body.length<=APPENDIX_BODY_LIMIT&&s.id.length<=80));
  assert.equal(text(p,'data').split(marker).length-1,1000,'every source marker is retained');
  assert.ok(data.every(s=>!/[\uD800-\uDBFF]$/.test(s.body)&&!/[\uDC00-\uDFFF]/.test(s.body[0])));
  assert.doesNotThrow(()=>appendEvidenceAppendixSections(content,p.sections));
  const full=createEditorContent();full.report=Array.from({length:100},(_,i)=>({...full.report[0],id:`section-${i}`}));
  assert.throws(()=>appendEvidenceAppendixSections(full,p.sections),/章节数量超过上限/);
});
test('async proposal captures original editor and AI receipt before changes arrive',async()=>{
  const content=await fixture(),input=ledger([usage()]),before=JSON.stringify(content),pending=createEvidenceAppendixProposal(content,{projectId:'project-1',aiLedger:input});
  content.title='改动后的作品';content.quality.findings[0].interpretation='晚到的新解释';input.records[0].status='succeeded';
  const p=await pending;assert.equal(p.base,before);assert.equal(p.baseHash,await digestText(before));
  assert.match(text(p,'ai'),/调用结果未知/);assert.ok(!text(p,'claims').includes('晚到的新解释'));
  assert.notEqual(p.base,JSON.stringify(content),'parent exact-base guard can reject this late proposal');
});
test('async defense reference also captures a detached input and reports pre-existing draft state',async()=>{
  const content=await fixture();content.quality.findings[0].status='draft';
  const pending=createDefenseEvidenceReference(content,'finding-1');content.quality.findings[0].title='晚到修改';const ref=await pending;
  assert.equal(ref.title,'测试发现');assert.equal(ref.status,'needs_review');
});
