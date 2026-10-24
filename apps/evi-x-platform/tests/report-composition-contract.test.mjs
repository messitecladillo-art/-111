import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parseEditorContent} from '../lib/editor-model.ts';
import {reportFigureCoverage,reportLinkState} from '../lib/report-storyboard.ts';

// Shared with Python test_report_storyboard_contract.py. Aggregate, synthetic data only.
const fixture=JSON.parse(readFileSync(new URL('./fixtures/report-storyboard/source-owner.json',import.meta.url),'utf8')).content;
const order=value=>Array.isArray(value)?value.map(order):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,order(value[key])])):value;
function legacyV2(){const content=structuredClone(fixture);content.version=2;delete content.figures;delete content.visualStyle;for(const section of content.report)for(const block of section.blocks??[])delete block.figureId;for(const slide of content.slides){delete slide.reportLink;for(const object of slide.objects??[])delete object.figureId;}return content;}

test('shared two-chapter fixture retains exact scoped block, figure and analysis references',async()=>{
  const content=parseEditorContent(fixture),slide=content.slides[0];
  assert.deepEqual(content,fixture);assert.equal(await reportLinkState(content,slide),'current');
  assert.deepEqual(slide.objects.filter(o=>o.sourceSectionId).map(o=>[o.sourceSectionId,o.sourceBlockId,o.figureId]),[['A','shared-block','figure-A'],['B','shared-block','figure-B']]);
  assert.ok((await reportFigureCoverage(content)).every(entry=>entry.state==='current'));
});

test('Python-style sorted JSON restores semantically identical v3 provenance',async()=>{
  const restored=parseEditorContent(JSON.parse(JSON.stringify(order(fixture))));
  assert.deepEqual(restored,fixture);assert.equal(await reportLinkState(restored,restored.slides[0]),'current');
});

test('old v2 rejects the new scoped-owner field while ownerless v2 remains readable',()=>{
  const old=legacyV2();assert.throws(()=>parseEditorContent(old),/旧版本/);
  for(const slide of old.slides)for(const object of slide.objects??[])delete object.sourceSectionId;
  assert.deepEqual(parseEditorContent(old),old);
});

for(const [label,patch] of [
  ['missing block reference',o=>delete o.sourceBlockId],
  ['text object owner',o=>{o.kind='text';delete o.figureId;}],
  ['empty owner',o=>o.sourceSectionId=''],
  ['BOM-only owner',o=>o.sourceSectionId='\ufeff'],
  ['control owner',o=>o.sourceSectionId='\u007f'],
  ['over-limit owner',o=>o.sourceSectionId='a'.repeat(81)],
])test(`scope contract rejects ${label}`,()=>{const content=structuredClone(fixture);patch(content.slides[0].objects.find(o=>o.kind==='chart'));assert.throws(()=>parseEditorContent(content));});
