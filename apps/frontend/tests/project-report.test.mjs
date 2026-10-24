import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { appendEvidenceSection, evidenceSectionId, newProjectReport, parseProjectReport, parseReportHead, reportContentsEqual } from '../lib/project-report.ts';
import { DEFAULT_REPORT_SETTINGS, reportExportOptions } from '../lib/report-format.ts';
import { evidenceSection } from '../lib/research-flow.ts';

test('report snapshot round trips scope and preserves old backups without adding fields',()=>{
  const old=createEditorContent();assert.deepEqual(parseEditorContent(old),old);
  const scoped={...old,reportFormat:structuredClone(DEFAULT_REPORT_SETTINGS)};
  scoped.reportFormat.region='湖北';assert.deepEqual(parseEditorContent(scoped),scoped);
  assert.throws(()=>parseEditorContent({...scoped,reportFormat:{...scoped.reportFormat,officiallyApproved:true}}));
  const id='acb5e3b7-c318-4d4d-8b52-9c9d85a24540';
  const reply={id,projectId:id,revision:1,title:scoped.title,updatedAt:'2026-10-11T00:00:00Z',content:scoped};
  assert.deepEqual(parseReportHead({report:reply},id),reply);
  assert.throws(()=>parseProjectReport(reply,'wrong-project'));
  assert.throws(()=>parseReportHead({report:reply,verified:true},id));
});

test('saved report equality ignores field insertion order without hiding edits or invalid drafts',()=>{
  const current={...createEditorContent(),reportFormat:structuredClone(DEFAULT_REPORT_SETTINGS)};
  current.reportFormat.options.firstLineChars=0;
  const before=structuredClone(current), receipt=parseEditorContent(current);
  assert.notEqual(JSON.stringify(current),JSON.stringify(receipt));
  assert.equal(reportContentsEqual(current,receipt),true);
  const reversed=structuredClone(receipt);
  reversed.reportFormat.options=Object.fromEntries(Object.entries(reversed.reportFormat.options).reverse());
  assert.equal(reportContentsEqual(current,reversed),true,'nested format key order also varies in database receipts');
  assert.deepEqual(current,before,'comparison must not replace or mutate the editor');
  assert.equal(reportContentsEqual({...current,title:'新标题'},receipt),false);
  assert.equal(reportContentsEqual({...current,report:[...current.report].reverse()},receipt),false);
  assert.equal(reportContentsEqual({...current,reportFormat:{...current.reportFormat,options:{...current.reportFormat.options,firstLineChars:2}}},receipt),false);
  assert.equal(reportContentsEqual({...current,title:''},receipt),false);
  assert.equal(reportContentsEqual({...current,title:''},{...current,title:''}),false);
  assert.equal(reportContentsEqual({...current,unexpected:true},receipt),false);
});

test('confirmed evidence appends without modifying report or slides and duplicate replay is rejected',()=>{
  const content=newProjectReport('合成流程验收');const before=structuredClone(content);
  const section=evidenceSection({version:1,sourceHash:'a'.repeat(64),classification:'simulated',question:'测试类别比例',variables:['Q1'],missingCodes:[],total:10,n:8,calculation:{method:'frequency',counts:[3,5],column:0}},'test-proposal');
  const next=appendEvidenceSection(content,section);
  assert.deepEqual(content,before);assert.deepEqual(next.slides,before.slides);
  const at=next.report.findIndex(s=>s.id===section.id);
  assert.deepEqual(next.report.filter(s=>s.id!==section.id),before.report);assert.deepEqual(next.report[at],section);
  assert.equal(next.report[at+1].title,'参考文献','evidence lands before the references and appendices');
  assert.match(section.body,/模拟/);assert.match(section.source,/aaaaaaaa/);
  assert.throws(()=>appendEvidenceSection(next,section),/已加入/);
  assert.ok(next.report.some(s=>s.title==='参考文献'));assert.ok(next.report.some(s=>s.title.startsWith('附录')));
});

test('project title truncation preserves complete Unicode characters',()=>{
  const value=newProjectReport('A'+'😀'.repeat(60));
  assert.equal(value.title.length,119);assert.equal(value.title.isWellFormed(),true);
});

test('evidence identity survives repeated proposals and main export preserves layout choices',async()=>{
  const input={version:1,sourceHash:'a'.repeat(64),classification:'simulated',question:'分类',variables:['Q1'],missingCodes:[],total:10,n:8,calculation:{method:'frequency',counts:[3,5],column:0}};
  assert.equal(await evidenceSectionId(input),await evidenceSectionId(structuredClone(input)));
  assert.notEqual(await evidenceSectionId(input),await evidenceSectionId({...input,question:'新问题'}));
  const options={part:'appendix',includeCover:false,includeToc:false,firstLineChars:0,numberPages:false};
  assert.deepEqual(reportExportOptions(options,'main'),{...options,part:'main'});
  assert.deepEqual(options,{part:'appendix',includeCover:false,includeToc:false,firstLineChars:0,numberPages:false});
});
