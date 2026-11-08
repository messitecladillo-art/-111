import test from 'node:test';
import assert from 'node:assert/strict';
import {applyReportFrame,createEditorContent,parseEditorContent} from '../lib/editor-model.ts';
import {newQuestionnaire} from '../lib/questionnaire.ts';
import {createReportFrame} from '../lib/report-frame.ts';
import {DEFAULT_REPORT_FORMAT_SETTINGS} from '../lib/report-format.ts';
import {canAcceptReportCandidate,hasUserResearchSource,mergeReportCandidate,reportChanges,reportInputRevision,reportSourceKey} from '../lib/agent/report-run.ts';
const source=()=>({design:newQuestionnaire(),dataset:null,report:createEditorContent(),inputPending:false});

test('candidate acceptance freezes the actual source and rejects pending input or blocked quality',()=>{
  const original=source(),key=reportSourceKey(original);
  const accept=currentSource=>canAcceptReportCandidate({sourceKey:key,currentSource,status:'needs_review',pending:false});
  assert.equal(accept(original),true);
  assert.equal(accept({...original,inputPending:true}),false);
  assert.equal(accept({...original,report:{...original.report,title:'用户新标题'}}),false);
  assert.equal(canAcceptReportCandidate({sourceKey:key,currentSource:original,status:'blocked',pending:false}),false);
  assert.equal(canAcceptReportCandidate({sourceKey:key,currentSource:original,status:'draft',pending:true}),false);
});
test('section differences include deletion, title, source and structured content changes',()=>{
  const before=createEditorContent(), first=before.report[0];
  const after={...before,report:[{...first,title:'新节标题',source:'新来源',blocks:[]},...before.report.slice(2)]};
  const changes=reportChanges(before,after);
  assert.ok(changes.some(c=>c.sectionId===first.id&&c.changeType==='updated'&&c.details.some(d=>d.includes('资料出处'))));
  assert.ok(changes.some(c=>c.sectionId===before.report[1].id&&c.changeType==='removed'));
});
test('locking preserves full original sections, restores removals, and excludes locked new sections',()=>{
  const before=createEditorContent(), first=before.report[0], removed=before.report[1];
  const added={...first,id:'new-section',title:'新增节',body:'候选正文'};
  const candidate={...before,report:[{...first,body:'新正文',source:'新出处'},added,...before.report.slice(2)]};
  const merged=mergeReportCandidate(before,candidate,[first.id,removed.id,added.id]);
  assert.deepEqual(merged.report.find(s=>s.id===first.id),first);
  assert.deepEqual(merged.report[1],removed);
  assert.equal(merged.report.some(s=>s.id===added.id),false);
  assert.notEqual(candidate.report[0].body,first.body,'merge does not mutate the candidate');
});
test('teaching pack protection recognises questionnaire metadata and authored report surfaces',()=>{
  assert.equal(hasUserResearchSource(source()),false);
  for(const change of [s=>{s.design.title='真实研究';},s=>{s.design.pilot={...s.design.pilot,summary:'真实预测试记录'};},s=>{s.report.title='自己的标题';},s=>{s.report.report[0].source='真实资料';},s=>{s.report.slides[0].title='自己撰写的答辩';}]){
    const s=source();change(s);assert.equal(hasUserResearchSource(s),true);
  }
  assert.equal(hasUserResearchSource({...source(),inputPending:true}),true);
  assert.equal(hasUserResearchSource({...source(),dataset:{kind:'user_provided'}}),true);
});
test('teaching pack replacement preserves authored frames, palettes and report layout even with simulated data',()=>{
  const blank=createEditorContent(),visualStyle={schema:'ProjectVisualStyle/v1',paletteId:'teal',version:1};
  const reports=[
    applyReportFrame(blank,createReportFrame(visualStyle)),
    parseEditorContent({...blank,version:3,visualStyle}),
    parseEditorContent({...blank,reportFormat:{...DEFAULT_REPORT_FORMAT_SETTINGS,options:{...DEFAULT_REPORT_FORMAT_SETTINGS.options,includeCover:false}}}),
    parseEditorContent({...blank,accent:'blue'}),
  ];
  const snapshots=reports.map(report=>JSON.stringify(report));
  for(const report of reports){
    assert.equal(hasUserResearchSource({...source(),report}),true);
    assert.equal(hasUserResearchSource({...source(),report,dataset:{kind:'simulated'}}),true);
  }
  assert.deepEqual(reports.map(report=>JSON.stringify(report)),snapshots,'source protection leaves every object unchanged');
  assert.equal(hasUserResearchSource({...source(),dataset:{kind:'simulated'}}),false,'an uncustomised teaching workspace remains replaceable');
});

test('source hashes are key-order stable but detect substantive edits',async()=>{
  const a=await reportInputRevision({b:2,a:1}),b=await reportInputRevision({a:1,b:2});
  assert.equal(a,b);assert.match(a,/^[a-f0-9]{64}$/);assert.notEqual(a,await reportInputRevision({a:1,b:3}));
});
