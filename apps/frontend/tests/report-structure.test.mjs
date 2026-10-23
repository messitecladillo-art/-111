import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { buildDocx } from '../lib/editor-export.ts';
import { DEFAULT_REPORT_OPTIONS, DEFAULT_REPORT_SETTINGS, REPORT_FORMAT_PROFILES, parseReportFormatSettings, reportExportOptions } from '../lib/report-format.ts';
import { buildLatexSource, escapeLatexText, generateLatexBody, latexCompileInput } from '../lib/latex-report.ts';

function contentWithOrder() {
  const content = { ...createEditorContent(), title:'CUSTOM_RESEARCH', subtitle:'COVER_SUBTITLE_MARKER', reportFormat:structuredClone(DEFAULT_REPORT_SETTINGS) };
  content.report=[
    {id:'body-1',title:'一、研究发现',body:'FIRST_BODY_MARKER',source:''},
    {id:'references',title:'参考文献',body:'REFERENCES_MARKER',source:''},
    {id:'abstract',title:'摘要',body:'LATE_ABSTRACT_MARKER',source:''},
    {id:'appendix-1',title:'附录 1',body:'APPENDIX_ONE_MARKER',source:''},
    {id:'body-2',title:'二、后续分析',body:'LAST_BODY_MARKER',source:''},
    {id:'appendix-2',title:'附录 2',body:'APPENDIX_TWO_MARKER',source:''},
  ];
  return content;
}

test('all eight cover/TOC/part choices persist and produce matching native DOCX and LaTeX structure', async () => {
  for(const part of ['main','appendix']) for(const includeCover of [false,true]) for(const includeToc of [false,true]) {
    const content=contentWithOrder(), options={...DEFAULT_REPORT_OPTIONS,part,includeCover,includeToc};
    content.reportFormat.options=options;
    const before=structuredClone(content), roundtrip=parseEditorContent(JSON.parse(JSON.stringify(content)));
    assert.deepEqual(roundtrip.reportFormat.options,options);
    const zip=await JSZip.loadAsync(await(await buildDocx(roundtrip)).arrayBuffer()), xml=await zip.file('word/document.xml').async('string');
    assert.equal(xml.includes('COVER_SUBTITLE_MARKER'),includeCover,part+' DOCX cover '+includeCover);
    assert.equal(xml.includes('TOC '),includeToc,part+' DOCX TOC '+includeToc);
    const body=generateLatexBody(roundtrip), source=buildLatexSource({...latexCompileInput(roundtrip),body});
    assert.equal(source.includes('\\begin{titlepage}'),includeCover,part+' TeX cover '+includeCover);
    assert.equal(source.includes('\\tableofcontents'),includeToc,part+' TeX TOC '+includeToc);
    const markers=part==='main'?['FIRST_BODY_MARKER','REFERENCES_MARKER','LATE_ABSTRACT_MARKER','LAST_BODY_MARKER']:['APPENDIX_ONE_MARKER','APPENDIX_TWO_MARKER'];
    for(const [output,encode] of [[xml, text=>text],[body,escapeLatexText]]) {
      const indices=markers.map(marker=>output.indexOf(encode(marker)));
      assert.ok(indices.every((index,i)=>index>=0&&(i===0||index>indices[i-1])),part+': preserve author order');
    }
    assert.deepEqual(content,before,'exports do not replace editor choices or chapter order');
  }
});

test('late abstract does not restart body page numbering or become a preliminary section',async()=>{
  const content=contentWithOrder(); content.reportFormat.options={...DEFAULT_REPORT_OPTIONS,includeCover:false,includeToc:false};
  const zip=await JSZip.loadAsync(await(await buildDocx(content)).arrayBuffer()),xml=await zip.file('word/document.xml').async('string');
  assert.equal((xml.match(/<w:pgNumType[^>]*w:start="1"/g)||[]).length,1);
  assert.doesNotMatch(xml,/w:fmt="upperRoman"/);
  assert.ok(xml.indexOf('LATE_ABSTRACT_MARKER')>xml.indexOf('FIRST_BODY_MARKER'));
});

test('changing the export part or chosen profile preserves all explicit layout choices',()=>{
  const options={...DEFAULT_REPORT_OPTIONS,includeCover:false,includeToc:false,firstLineChars:0,numberPages:false};
  for(const profile of REPORT_FORMAT_PROFILES) {
    const selected=parseReportFormatSettings({...DEFAULT_REPORT_SETTINGS,profileId:profile.id,options});
    const appendix=reportExportOptions(selected.options,'appendix'), main=reportExportOptions(appendix,'main');
    assert.deepEqual(appendix,{...options,part:'appendix'});
    assert.deepEqual(main,options);
    assert.deepEqual(selected.options,options);
  }
  assert.equal(DEFAULT_REPORT_OPTIONS.includeCover,true,'recommended default remains available');
  assert.equal(DEFAULT_REPORT_OPTIONS.includeToc,true);
});
