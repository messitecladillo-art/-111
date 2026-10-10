import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {createEditorContent,parseEditorContent} from '../lib/editor-model.ts';
import {buildDocx} from '../lib/editor-export.ts';
import {DEFAULT_REPORT_OPTIONS,REPORT_FORMAT,reportPart,reportFormatNotices} from '../lib/report-format.ts';
const style=(xml,id)=>[...xml.matchAll(/<w:style\b[\s\S]*?<\/w:style>/g)].map(m=>m[0]).filter(s=>new RegExp(`w:styleId="${id}"`).test(s));
test('sourced report output has exact A4, margins, East Asian fonts and line-relative spacing',async()=>{
  const zip=await JSZip.loadAsync(await (await buildDocx(createEditorContent())).arrayBuffer());
  const xml=await zip.file('word/document.xml').async('string'),styles=await zip.file('word/styles.xml').async('string');
  assert.match(xml,/<w:pgSz[^>]*w:w="11906"[^>]*w:h="16838"/);
  for(const attributes of xml.matchAll(/<w:pgMar\b[^>]*\/>/g)){assert.match(attributes[0],/w:top="1440"/);assert.match(attributes[0],/w:bottom="1440"/);assert.match(attributes[0],/w:left="1803"/);assert.match(attributes[0],/w:right="1803"/);}
  for(const [id,font,size] of [['Normal','宋体',24],['Title','宋体',32],['Heading1','黑体',30],['Heading2','黑体',28],['Heading3','宋体',24],['Heading4','宋体',24],['Heading5','宋体',24],['ReportSpecialHeading','黑体',28],['ReportReference','宋体',24]]){
    const found=style(styles,id);assert.equal(found.length,1,`${id} must be unambiguous`);assert.match(found[0],new RegExp(`w:eastAsia="${font}"`));assert.match(found[0],new RegExp(`w:ascii="${font}"`));assert.match(found[0],new RegExp(`<w:sz w:val="${size}"`));
  }
  assert.match(style(styles,'Normal')[0],/w:beforeLines="50"/);assert.match(style(styles,'Normal')[0],/w:line="300"/);
  assert.match(style(styles,'Title')[0],/w:line="240"/);assert.match(style(styles,'Title')[0],/w:beforeAutospacing="(?:1|true)"/);assert.match(style(styles,'Title')[0],/w:afterAutospacing="(?:1|true)"/);
  assert.match(xml,/TOC /);assert.match(xml,/w:fmt="upperRoman"/);assert.match(xml,/w:fmt="decimal"/);assert.match(xml,/w:start="1"/);
  assert.doesNotMatch(await zip.file('docProps/core.xml').async('string'),/证见|EVI-X/);
});
test('main and appendix exports are separate while old combined headings are preserved',async()=>{
  const content=createEditorContent();const original=structuredClone(content);
  content.report.push({id:'appendix',title:'附录 1 调查工具',body:'ONLY_APPENDIX_CONTENT',source:''});
  const main=await JSZip.loadAsync(await (await buildDocx(content)).arrayBuffer());
  const appendix=await JSZip.loadAsync(await (await buildDocx(content,{...DEFAULT_REPORT_OPTIONS,part:'appendix'})).arrayBuffer());
  const mainXml=await main.file('word/document.xml').async('string'),appendixXml=await appendix.file('word/document.xml').async('string');
  assert.doesNotMatch(mainXml,/ONLY_APPENDIX_CONTENT/);assert.match(mainXml,/参考文献与附录/);assert.match(appendixXml,/ONLY_APPENDIX_CONTENT/);assert.doesNotMatch(appendixXml,/研究背景与问题/);
  assert.equal(reportPart('参考文献与附录'),'body');assert.ok(reportFormatNotices(original.report).length);
  assert.deepEqual(parseEditorContent(original),original,'old version 1 backup remains valid');
  await assert.rejects(()=>buildDocx(original,{...DEFAULT_REPORT_OPTIONS,part:'appendix'}),/附录/);
});
test('source profile binds checked edition and supports explicit unsourced layout choices',async()=>{
  assert.match(REPORT_FORMAT.sourceScope,/第十六届/);assert.match(REPORT_FORMAT.sourceScope,/第十七届/);assert.match(REPORT_FORMAT.sourceSha256,/^[a-f0-9]{64}$/);
  const zip=await JSZip.loadAsync(await (await buildDocx(createEditorContent(),{...DEFAULT_REPORT_OPTIONS,firstLineChars:0,numberPages:false})).arrayBuffer());
  const styles=await zip.file('word/styles.xml').async('string'),xml=await zip.file('word/document.xml').async('string');
  assert.match(style(styles,'Normal')[0],/w:firstLineChars="0"/);assert.doesNotMatch(xml,/<w:pgNumType[^>]*w:(?:fmt|start)=/);
  for(const [name,entry] of Object.entries(zip.files)){if(/^word\/footer\d+\.xml$/.test(name))assert.doesNotMatch(await entry.async('string'),/\bPAGE\b/);}
});
test('export groups late abstracts and references without mutating source or dropping mixed sections',async()=>{
  const content=createEditorContent();
  content.report=[
    {id:'ref',title:'参考文献',body:'REFERENCE_CONTENT_MARKER',source:''},
    {id:'body-1',title:'一、第一项',body:'FIRST_BODY_MARKER',source:''},
    {id:'abstract',title:'摘要',body:'ABSTRACT_CONTENT_MARKER',source:''},
    {id:'mixed',title:'参考文献与附录',body:'MIXED_BODY_MARKER',source:''},
    {id:'body-2',title:'二、第二项',body:'LAST_BODY_MARKER',source:''},
  ];
  const before=structuredClone(content);
  const zip=await JSZip.loadAsync(await (await buildDocx(content)).arrayBuffer());
  const xml=await zip.file('word/document.xml').async('string');
  const order=['ABSTRACT_CONTENT_MARKER','FIRST_BODY_MARKER','MIXED_BODY_MARKER','LAST_BODY_MARKER','REFERENCE_CONTENT_MARKER'].map(value=>xml.indexOf(value));
  assert.ok(order.every((index,i)=>index>=0&&(i===0||index>order[i-1])));
  assert.deepEqual(content,before);
});
