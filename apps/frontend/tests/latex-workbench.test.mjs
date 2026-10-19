import test from 'node:test';
import assert from 'node:assert/strict';
import { createLatexCompileGuard, decodeLatexPdf, insertLatexSnippet, LATEX_INSERTS, LATEX_LIMITS, latexLineSelection, latexSha256, parseLatexCompileReceipt } from '../lib/latex-report.ts';

test('late compilation cannot replace an edited source, changed title/settings or another project', async () => {
  const guard=createLatexCompileGuard(); let resolve;
  const deferred=new Promise(done=>{resolve=done;}), ticket=guard.start('project-A','source-A');
  const result=deferred.then(()=>({ original:guard.accepts(ticket,'project-A','source-A'), edited:guard.accepts(ticket,'project-A','source-B'), otherProject:guard.accepts(ticket,'project-B','source-A') }));
  resolve(); assert.deepEqual(await result,{original:true,edited:false,otherProject:false});
});
test('cancel, unmount and retry invalidate previous response even when source returns to same value',()=>{
  const guard=createLatexCompileGuard(), first=guard.start('p','a');
  guard.cancel();assert.equal(guard.accepts(first,'p','a'),false);
  const second=guard.start('p','a');assert.equal(guard.accepts(second,'p','a'),true);assert.equal(guard.accepts(first,'p','a'),false);
  const third=guard.start('p','a');assert.equal(guard.accepts(second,'p','a'),false);assert.equal(guard.accepts(third,'p','a'),true);
  guard.cancel();assert.equal(guard.accepts(third,'p','a'),false);
});
async function receipt(source='正文') { return {status:'compiled',source,sourceHash:await latexSha256(source),pdfBase64:Buffer.from('%PDF-1.7\nsynthetic receipt\n%%EOF').toString('base64'),diagnostics:[],engine:'xelatex'}; }
test('compiled receipt binds exact full source and SHA256 before accepting PDF',async()=>{
  const valid=await receipt();assert.deepEqual(await parseLatexCompileReceipt(valid,'正文'),valid);
  for(const invalid of [{...valid,source:'另一正文'},{...valid,sourceHash:'0'.repeat(64)},{...valid,unexpected:true},{...valid,engine:null},{...valid,pdfBase64:null},{...valid,pdfBase64:Buffer.from('<html>error</html>').toString('base64')}])await assert.rejects(parseLatexCompileReceipt(invalid,'正文'));
});
test('compile errors and unavailable responses preserve actionable body-line diagnostics but cannot include PDF',async()=>{
  const valid=await receipt(), failed={...valid,status:'error',engine:null,pdfBase64:null,diagnostics:[{severity:'error',line:2,message:'环境起止不匹配。'}]};
  assert.deepEqual((await parseLatexCompileReceipt(failed,'正文')).diagnostics,failed.diagnostics);
  assert.equal((await parseLatexCompileReceipt({...failed,status:'unavailable',diagnostics:[{severity:'error',line:null,message:'未配置编译环境。'}]},'正文')).status,'unavailable');
  await assert.rejects(parseLatexCompileReceipt({...failed,pdfBase64:valid.pdfBase64},'正文'));
  for(const item of [{severity:'error',line:0,message:'x'},{severity:'error',line:1.2,message:'x'},{severity:'note',line:1,message:'x'},{severity:'error',line:null,message:'x',rawLog:'/private/path'}])await assert.rejects(parseLatexCompileReceipt({...failed,diagnostics:[item]},'正文'));
});
test('PDF decoding handles full allowed size and rejects overflow or malformed bytes without regex stack overflow',()=>{
  const bytes=Buffer.alloc(LATEX_LIMITS.pdfBytes,32);bytes.write('%PDF-1.7');
  assert.equal(decodeLatexPdf(bytes.toString('base64')).length,LATEX_LIMITS.pdfBytes);
  assert.throws(()=>decodeLatexPdf(Buffer.concat([bytes,Buffer.from(' ')]).toString('base64')));
  for(const bad of ['', '%PDF-raw', 'JVBE\nRi0=', 'AAAA====']) assert.throws(()=>decodeLatexPdf(bad));
});
test('diagnostic selection respects Unicode UTF16 textarea offsets and clamps lines',()=>{
  const body='标题😀\n公式 x\n第三行';
  assert.deepEqual(latexLineSelection(body,2),{start:5,end:9});
  assert.equal(body.slice(...Object.values(latexLineSelection(body,2))),'公式 x');
  assert.deepEqual(latexLineSelection(body,999),{start:10,end:13});
  assert.deepEqual(latexLineSelection(body,-1),{start:0,end:4});
});
test('diagnostics map normalized CR and CRLF body lines to exact unmodified draft offsets',()=>{
  const body='第一行\r中文😀\r\n第三行\n末行';
  assert.deepEqual(latexLineSelection(body,2),{start:4,end:8});
  assert.deepEqual(latexLineSelection(body,3),{start:10,end:13});
  assert.equal(body.slice(...Object.values(latexLineSelection(body,3))),'第三行');
  assert.deepEqual(latexLineSelection('',1),{start:0,end:0});
});
test('snippet insertion uses DOM offsets after restoring CRLF or CR backups and preserves surrounding text',()=>{
  for (const body of ['A\r\nB\r\nC','A\rB\rC','A\nB\nC']) {
    const inserted=insertLatexSnippet(body,LATEX_INSERTS.formula,3,3);
    assert.equal(inserted.body,'A\nB'+LATEX_INSERTS.formula+'\nC');
    assert.equal(inserted.body.slice(inserted.start,inserted.end),LATEX_INSERTS.formula);
    assert.equal(inserted.start,3);
  }
  const replaced=insertLatexSnippet('😀\r\n选中内容\r\n尾部',LATEX_INSERTS.table,3,7);
  assert.equal(replaced.body,'😀\n'+LATEX_INSERTS.table+'\n尾部');
  assert.equal(insertLatexSnippet('A\r\nB',' END').body,'A\nB END');
});
