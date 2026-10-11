import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { appendEvidenceSection, evidenceSectionId, newProjectReport, parseProjectReport, parseReportHead } from '../lib/project-report.ts';
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

test('confirmed evidence appends without modifying report or slides and duplicate replay is rejected',()=>{
  const content=newProjectReport('合成流程验收');const before=structuredClone(content);
  const section=evidenceSection({version:1,sourceHash:'a'.repeat(64),classification:'simulated',question:'测试类别比例',variables:['Q1'],missingCodes:[],total:10,n:8,calculation:{method:'frequency',counts:[3,5],column:0}},'test-proposal');
  const next=appendEvidenceSection(content,section);
  assert.deepEqual(content,before);assert.deepEqual(next.slides,before.slides);
  assert.deepEqual(next.report.slice(0,-1),before.report);assert.deepEqual(next.report.at(-1),section);
  assert.match(section.body,/模拟/);assert.match(section.source,/aaaaaaaa/);
  assert.throws(()=>appendEvidenceSection(next,section),/已加入/);
  assert.ok(next.report.some(s=>s.title==='参考文献'));assert.ok(next.report.some(s=>s.title.startsWith('附录')));
});

test('project title truncation preserves complete Unicode characters',()=>{
  const value=newProjectReport('A'+'😀'.repeat(60));
  assert.equal(value.title.length,119);assert.equal(value.title.isWellFormed(),true);
});

test('evidence identity survives repeated proposals and main export restores its required parts',async()=>{
  const input={version:1,sourceHash:'a'.repeat(64),classification:'simulated',question:'分类',variables:['Q1'],missingCodes:[],total:10,n:8,calculation:{method:'frequency',counts:[3,5],column:0}};
  assert.equal(await evidenceSectionId(input),await evidenceSectionId(structuredClone(input)));
  assert.notEqual(await evidenceSectionId(input),await evidenceSectionId({...input,question:'新问题'}));
  const options={part:'appendix',includeCover:false,includeToc:false,firstLineChars:0,numberPages:false};
  assert.deepEqual(reportExportOptions(options,'main'),{...options,part:'main',includeCover:true,includeToc:true});
  assert.deepEqual(options,{part:'appendix',includeCover:false,includeToc:false,firstLineChars:0,numberPages:false});
});
