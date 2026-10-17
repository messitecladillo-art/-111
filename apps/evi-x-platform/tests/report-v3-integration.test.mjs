import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {createEditorContent,applyReportFrame} from '../lib/editor-model.ts';
import {createReportFrame,approveReportFrame} from '../lib/report-frame.ts';
import {latexCompileInput,previewLatexSource,approvedLatexSource,latexFigureReferences} from '../lib/latex-report.ts';
import {bindReportSlide,reportLinkState} from '../lib/report-storyboard.ts';
import {buildDocx} from '../lib/editor-export.ts';
import {figureFromResult} from '../lib/report-figure.ts';
const style={schema:'ProjectVisualStyle/v1',paletteId:'blue',version:1};
test('first frame applies to a legacy document without losing its text or existing slide link hashes',async()=>{
 const c=createEditorContent();c.version=2;const bound=await bindReportSlide(c,c.slides[0],c.report[0].id);c.slides[0]=bound;const frame=await approveReportFrame(createReportFrame(style),'automated-test-actor');const next=applyReportFrame(c,frame);assert.deepEqual(next.visualStyle,style);assert.equal(next.report[0].body,c.report[0].body);assert.equal(await reportLinkState(next,next.slides[0]),'current');assert.equal(applyReportFrame(next,undefined).reportFrame,undefined);
});
test('unreferenced large registered figures never crash the mounted LaTeX workspace',()=>{
 const c=createEditorContent();c.version=3;c.visualStyle=style;c.figures=[figureFromResult({id:'f',title:'三十类别',resultHash:'a'.repeat(64),method:'frequency',n:30,rows:Array.from({length:30},(_,i)=>['类别'+i,1]),headers:['类别','n']},'bar',1,'fig')];c.latex={version:1,body:'正文\\par',reportHash:'0'.repeat(64)};const input=latexCompileInput(c);assert.equal(input.figures,undefined);assert.equal(previewLatexSource(input).error,'');c.latex.body='\\ResearchFigure{0}';assert.match(previewLatexSource(latexCompileInput(c)).error,/分拆|标签|图形/);
});
test('only explicitly used figure indexes enter compilation and retain deterministic mapping',()=>{
 const c=createEditorContent();c.latex={version:1,body:'\\ResearchFigure{2}\n\\ResearchFigure{0}\n\\ResearchFigure{2}',reportHash:'0'.repeat(64)};c.figures=Array.from({length:3},(_,i)=>({id:'f'+i}));c.visualStyle=style;const input=latexCompileInput(c);assert.deepEqual(input.figures.map(f=>f.id),['f0','f2']);assert.equal(input.body,'\\ResearchFigure{1}\n\\ResearchFigure{0}\n\\ResearchFigure{1}');
});
test('registry tokenization respects comments, line endings, control symbols and argument whitespace',()=>{
 const c=createEditorContent();c.figures=[{id:'unused'},{id:'used'}];c.visualStyle=style;c.latex={version:1,body:String.raw`% \ResearchFigure{0}`+'\r'+String.raw`\ResearchFigure {1}`+'\n'+String.raw`\\ResearchFigure{1}`+'\n'+String.raw`\% text \ResearchFigure`+'\n{1}',reportHash:'0'.repeat(64)};
 const refs=latexFigureReferences(c.latex.body);assert.deepEqual(refs.map(r=>r.index),[1,1]);const input=latexCompileInput(c);assert.equal(input.figures.length,1);assert.ok(input.body.includes(String.raw`\ResearchFigure {0}`));assert.ok(input.body.includes(String.raw`\\ResearchFigure{1}`));assert.ok(input.body.startsWith(String.raw`% \ResearchFigure{0}`));assert.ok(input.body.includes('\\ResearchFigure\n{0}'));
});
test('formal TeX download rejects drafts, tampering and mutations after hashing begins',async()=>{
 const frame=await approveReportFrame(createReportFrame(style),'automated-test-actor'),input={title:'报告',subtitle:'',body:'正文',options:{part:'main',includeCover:false,includeToc:false,firstLineChars:2,numberPages:true},frame,visualStyle:style};const pending=approvedLatexSource(input);input.frame.palette.primary='#112233';const original=await pending;assert.match(original.source,/255D87/);assert.doesNotMatch(original.source,/112233/);await assert.rejects(approvedLatexSource(input));await assert.rejects(approvedLatexSource({...input,frame:createReportFrame(style)}));
});
test('cover-only frames use explicit empty headers on every following section',async()=>{
 const c=applyReportFrame(createEditorContent(),await approveReportFrame({...createReportFrame(style),appliesTo:['cover']},'automated-test-actor'));const zip=await JSZip.loadAsync(await (await buildDocx(c)).arrayBuffer()),xml=await zip.file('word/document.xml').async('string'),refs=[...xml.matchAll(/<w:headerReference[^>]*r:id="([^"]+)"/g)].map(m=>m[1]);assert.equal(refs[0],'rIdReportFrame');assert.ok(refs.length>1);assert.ok(refs.slice(1).every(r=>r==='rIdReportFrameEmpty'));
});
