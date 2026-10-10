import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import { createEditorContent, parseEditorContent, reportToSlides } from '../lib/editor-model.ts';
import { buildDocx, buildPptx } from '../lib/editor-export.ts';

test('editor template validates and strict boundaries reject malformed drafts', () => {
  const initial=createEditorContent();
  assert.deepEqual(parseEditorContent(initial),initial);
  assert.throws(()=>parseEditorContent({...initial,unknown:1}));
  assert.throws(()=>parseEditorContent({...initial,title:''}));
  assert.throws(()=>parseEditorContent({...initial,report:[]}));
  assert.throws(()=>parseEditorContent({...initial,report:[initial.report[0],initial.report[0]]}));
  assert.throws(()=>parseEditorContent({...initial,report:[{...initial.report[0],body:'x'.repeat(12001)}]}));
  assert.throws(()=>parseEditorContent({...initial,slides:[{...initial.slides[0],layout:'<script>'}]}));
  assert.throws(()=>parseEditorContent({...initial,subtitle:'a\x00b'}));
});
test('compact backups round-trip near capacity and 40 chapters never silently truncate', () => {
  const content=createEditorContent();
  content.report=Array.from({length:40},(_,i)=>({id:`s-${i}`,title:'chapter',body:'x'.repeat(12000),source:'s'.repeat(300)}));
  assert.ok(Buffer.byteLength(JSON.stringify(content))<500000);
  assert.deepEqual(parseEditorContent(JSON.parse(JSON.stringify(content))),content);
  assert.throws(()=>reportToSlides(content),/39/);
  content.report=content.report.slice(0,4);
  assert.throws(()=>reportToSlides(content),/不再截断/);
  content.report=content.report.map(s=>({...s,body:'短正文',source:'完整来源'}));
  assert.equal(reportToSlides(content).length,5);
});
test('UTF-8 capacity and every nested field remain strict and round-trip safely', () => {
  const content=createEditorContent();
  content.report=Array.from({length:20},(_,i)=>({id:`cn-${i}`,title:'中文章节',body:'汉'.repeat(12000),source:''}));
  assert.ok(JSON.stringify(content).length<500000,'fixture stays below a character-only limit');
  assert.ok(Buffer.byteLength(JSON.stringify(content),'utf8')>500000,'fixture exceeds the actual byte limit');
  assert.throws(()=>parseEditorContent(content),/500 KB/);
  const initial=createEditorContent();
  for(const invalid of [
    {...initial,report:[{...initial.report[0],source:'x'.repeat(1501)}]},
    {...initial,report:[{...initial.report[0],title:'x'.repeat(151)}]},
    {...initial,report:[{...initial.report[0],id:' '}]},
    {...initial,report:[{...initial.report[0],html:'<b>not supported</b>'}]},
    {...initial,slides:[initial.slides[0],initial.slides[0]]},
    {...initial,slides:[{...initial.slides[0],notes:'x'.repeat(6001)}]},
    {...initial,slides:[{...initial.slides[0],aside:'x'.repeat(1801)}]},
    {...initial,slides:[{...initial.slides[0],src:'https://untrusted.invalid/image'}]},
    {...initial,slides:[]},
    {...initial,slides:Array.from({length:41},(_,i)=>({...initial.slides[0],id:`overflow-${i}`}))},
  ]) assert.throws(()=>parseEditorContent(invalid));
  initial.report[0].body='保持原样：<script>alert(1)</script>\n制表\t多语种 🙂 & < >';
  assert.deepEqual(parseEditorContent(JSON.parse(JSON.stringify(initial))),initial,'plain text is data, never silently sanitized or interpreted');
});
test('legacy outline refuses lossy conversion and preserves short content exactly', () => {
  const content=createEditorContent();
  content.report=[{id:'first',title:'提纲章节',body:'正'.repeat(650)+'尾'.repeat(5350)+'超出讲稿部分',source:'证'.repeat(700)+'未提取来源'}];
  const before=structuredClone(content);
  assert.throws(()=>reportToSlides(content),/不再截断/);
  assert.deepEqual(content,before);
  content.report=[{id:'first',title:'提纲章节',body:'完整短文',source:'完整来源'}];
  const shortBefore=structuredClone(content);
  const slides=reportToSlides(content);
  assert.equal(slides.length,2);assert.equal(slides[0].layout,'cover');
  assert.equal(slides[1].layout,'two-column');assert.equal(slides[1].body,'完整短文');
  assert.equal(slides[1].aside,'完整来源');assert.equal(slides[1].notes,'完整短文');
  assert.equal(new Set(slides.map(s=>s.id)).size,slides.length);
  assert.deepEqual(content,shortBefore,'outline creation never changes report text or prior slides');
  slides[1].body='编辑提纲';
  assert.deepEqual(content,shortBefore,'editing resulting slides must not mutate report objects');
});
test('Word export is native OOXML, preserves report text and neutral metadata', async () => {
  const content=createEditorContent(); content.report[0].body='XML < > & 安全与可编辑文字';
  const file=await buildDocx(content);
  const zip=await JSZip.loadAsync(await file.arrayBuffer());
  const xml=await zip.file('word/document.xml').async('string');
  assert.match(xml,/XML &lt; &gt; &amp; 安全与可编辑文字/);
  assert.match(xml,/调查方案与问卷/);
  assert.doesNotMatch(xml,/EVI-X|证见/);
  assert.doesNotMatch(await zip.file('docProps/core.xml').async('string'),/EVI-X|证见/);
});
test('PowerPoint export contains editable slide text, 16:9 canvas and speaker notes', async () => {
  const content=createEditorContent(); content.slides[1].aside='证据旁注'; content.slides[1].notes='中文讲稿验收';
  const file=await buildPptx(content);
  const zip=await JSZip.loadAsync(await file.arrayBuffer());
  assert.equal(Object.keys(zip.files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p)).length,3);
  const xml=await zip.file('ppt/slides/slide2.xml').async('string');
  assert.match(xml,/证据旁注/); assert.match(xml,/研究对象与边界/); assert.doesNotMatch(xml,/EVI-X|证见/);
  assert.match(await zip.file('ppt/notesSlides/notesSlide2.xml').async('string'),/中文讲稿验收/);
  assert.match(await zip.file('ppt/presentation.xml').async('string'),/cx="12192000" cy="6858000"/);
});
