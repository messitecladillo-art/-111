import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {createEditorContent} from '../lib/editor-model.ts';
import {buildDocx} from '../lib/editor-export.ts';
import {DEFAULT_REPORT_OPTIONS} from '../lib/report-format.ts';

async function paragraphs(body,source,title='附录 C 主张与证据对照',id='appendix',blocks){
  const c={...createEditorContent(),...(blocks?{version:2}:{}),report:[{id,title,body,source,...(blocks?{blocks}:{})}]};
  const blob=await buildDocx(c,{...DEFAULT_REPORT_OPTIONS,part:title.startsWith('附录')?'appendix':'main',includeCover:false,includeToc:false});
  const z=await JSZip.loadAsync(await blob.arrayBuffer());
  return (await z.file('word/document.xml').async('string')).match(/<w:p[ >][\s\S]*?<\/w:p>/g)||[];
}
test('short appendix closing record stays with its source without binding the entire appendix',async()=>{
  const ps=await paragraphs('首段可自由分页。\n末条记录。\n','内容记录 SHA-256：'+'a'.repeat(64));
  const first=ps.find(p=>p.includes('首段可自由分页。')),last=ps.find(p=>p.includes('末条记录。')),source=ps.find(p=>p.includes('内容记录 SHA-256'));
  assert.ok(!first.includes('<w:keepNext'));
  assert.ok(last.includes('<w:keepNext'));
  assert.ok(source.includes('<w:keepLines'));
  assert.ok(!source.includes('<w:keepNext'));
});
test('long closing paragraphs and long source records remain pageable',async()=>{
  const ps=await paragraphs('长'.repeat(501),'源'.repeat(501));
  assert.ok(!ps.find(p=>p.includes('长'.repeat(50))).includes('<w:keepNext'));
  assert.ok(!ps.find(p=>p.includes('源'.repeat(50))).includes('<w:keepLines'));
});

test('generated appendix records retain every field with native line breaks and unchanged base typography',async()=>{
  const ps=await paragraphs('范围：记录。\n\n结果：A\n变量：x\n结果指纹：aaa\n\n结果：B\n变量：y','内容指纹：bbb','附录 A 数据来源与计算记录','appendix-data-'+'a'.repeat(64));
  const recordA=ps.find(p=>p.includes('结果：A')),recordB=ps.find(p=>p.includes('结果：B'));
  assert.ok(recordA.includes('变量：x')&&recordA.includes('结果指纹：aaa'));
  assert.equal((recordA.match(/<w:br\s*\/>/g)||[]).length,2);
  assert.ok(recordB.includes('变量：y')&&recordB.includes('来源 / 说明：内容指纹：bbb'));
  assert.ok(recordA.includes('w:val="ReportReference"'));
  assert.ok(!recordA.includes('<w:sz'),'profile typography is inherited unchanged');
  assert.ok(!recordA.includes('<w:keepNext'),'one record may flow naturally across pages');
});


test('generated appendix with user-added native blocks preserves body, blocks and source order',async()=>{
  const ps=await paragraphs('正文记录字段。','完整来源标识','附录 A 数据来源与计算记录','appendix-data-'+'b'.repeat(64),[
    {id:'manual-block',kind:'paragraph',text:'后来加入的研究内容块',evidenceId:'',valueColumn:1},
  ]);
  const xml=ps.join(''),body=ps.find(p=>p.includes('正文记录字段。'));
  assert.ok(xml.indexOf('正文记录字段。')<xml.indexOf('后来加入的研究内容块'));
  assert.ok(xml.indexOf('后来加入的研究内容块')<xml.indexOf('来源 / 说明：完整来源标识'));
  assert.ok(!body.includes('来源 / 说明：完整来源标识'));
  assert.ok(!body.includes('<w:keepNext'),'user-added blocks must not be bound to the preceding record');
});
