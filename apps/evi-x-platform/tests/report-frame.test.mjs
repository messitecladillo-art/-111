import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from 'jszip';
import {createReportFrame,parseReportFrame,frameDefinitionHash,frameCanonical,buildFramePrimitives,approveReportFrame,assertApprovedFrame,frameSVG} from '../lib/report-frame.ts';
import {createEditorContent,parseEditorContent} from '../lib/editor-model.ts';
import {buildDocx} from '../lib/editor-export.ts';
import {buildLatexSource} from '../lib/latex-report.ts';
import {frameTexPreamble} from '../lib/report-frame-export.ts';
import {CHART_THEMES} from '../lib/chart-theme.ts';
const parity=JSON.parse(fs.readFileSync(new URL('../../../skill/research-report-frame/tests/fixtures/cross-runtime-parity.json',import.meta.url),'utf8'));
const visualStyle={schema:'ProjectVisualStyle/v1',paletteId:'blue',version:1};
test('shared Python/JS canonical hash and full vector geometry agree for both topics and variants',async()=>{
 assert.equal(frameCanonical(parity.canonicalExample.input),parity.canonicalExample.canonical);
 for(const example of parity.examples){assert.equal(await frameDefinitionHash(example.style),example.definitionSha256);const output=buildFramePrimitives(example.style);assert.equal(output.length,example.primitiveCount);output.forEach((p,i)=>{const e=example.primitives[i];assert.equal(p.type,e.type);assert.equal(p.fill,e.fill);assert.equal(p.stroke,e.stroke);assert.equal(Number(p.opacity.toFixed(6)),e.opacity);const expected=e.type==='line'?[[e.x1,e.y1],[e.x2,e.y2]]:e.points;if(expected)p.points.forEach((point,j)=>point.forEach((v,k)=>assert.ok(Math.abs(v-expected[j][k])<1e-9)));});}
});
test('geometry excludes body/footer without shrinking text; impossible ornaments fail visibly',()=>{
 for(const theme of ['finance-grid','sports-track'])for(const lineWidthPt of [.25,2]){const f={...createReportFrame(visualStyle,theme),lineWidthPt};assert.ok(buildFramePrimitives(f).length);assert.doesNotMatch(frameSVG(f),/<image|filter|script|href/i);assert.equal(f.marginsMm.left,31.8);}
 const f=createReportFrame(visualStyle);assert.throws(()=>buildFramePrimitives({...f,cornerSizeMm:24}));assert.throws(()=>buildFramePrimitives({...f,protectedAreas:[...f.protectedAreas,{id:'header',kind:'header',xMm:0,yMm:0,widthMm:210,heightMm:22}]}));
});
test('approval and assertion consume one immutable snapshot across delayed hashing',async()=>{
 const f=createReportFrame(visualStyle);const pending=approveReportFrame(f,'automated-test-actor');f.palette.primary='#112233';const approved=await pending;assert.equal(approved.palette.primary,'#255D87');assert.equal(approved.review.definitionSha256,await frameDefinitionHash(approved));const pendingAssert=assertApprovedFrame(approved);approved.palette.primary='#112233';const frozen=await pendingAssert;assert.equal(frozen.palette.primary,'#255D87');await assert.rejects(assertApprovedFrame(approved));
});
test('precision, impossible date, draft review and reserved exclusion IDs are rejected',async()=>{
 const f=createReportFrame(visualStyle);for(const x of [{...f,strength:.1+.2},{...f,protectedAreas:[{id:'body-guard',kind:'other',xMm:0,yMm:0,widthMm:1,heightMm:1}]},{...f,guardMm:13},{...f,status:'concept'}])assert.throws(()=>buildFramePrimitives(x));
 assert.throws(()=>frameCanonical({value:.1+.2}));const a=await approveReportFrame(f,'test');assert.throws(()=>parseReportFrame({...a,review:{...a.review,at:'2026-02-30T08:00:00Z'}}));assert.throws(()=>parseReportFrame({...f,review:a.review}));
});
test('every actual project palette including three-colour reserves produces valid frames',()=>{for(const p of CHART_THEMES){const s={...visualStyle,paletteId:p.id};const f=createReportFrame(s);assert.equal(f.palette.accent,p.colors[4%p.colors.length]);assert.ok(buildFramePrimitives(f).length);const c={...createEditorContent(),version:3,visualStyle:s,reportFrame:f};assert.deepEqual(parseEditorContent(c).reportFrame,f);}const c={...createEditorContent(),version:3,reportFrame:createReportFrame(visualStyle)};c.reportFrame.palette.primary='#112233';assert.throws(()=>parseEditorContent(c));});
test('Word background is native fixed geometry and preserves exact body content and margins',async()=>{
 const c=createEditorContent();c.report=[{id:'s',title:'研究问题',body:'保留原有正文。\n第二段仍可编辑。',source:''}];c.slides=c.slides.slice(0,1);const options={part:'main',includeCover:false,includeToc:false,firstLineChars:2,numberPages:true};
 const plain=await JSZip.loadAsync(await (await buildDocx(c,options)).arrayBuffer());const framed={...c,version:3,visualStyle,reportFrame:await approveReportFrame(createReportFrame(visualStyle),'automated-test-actor')};const zip=await JSZip.loadAsync(await (await buildDocx(framed,options)).arrayBuffer());
 const xml=await zip.file('word/document.xml').async('string'),before=await plain.file('word/document.xml').async('string');assert.equal(xml.replace(/<w:headerReference[^>]*\/>/g,''),before);const header=await zip.file('word/headerReportFrame.xml').async('string');assert.match(header,/v:line/);assert.match(header,/relative:page/);assert.match(header,/z-index:-/);assert.doesNotMatch(header,/v:imagedata|<w:t>/);assert.equal(Object.keys(zip.files).filter(n=>n.startsWith('word/media/')).length,0);
 await assert.rejects(buildDocx({...framed,reportFrame:createReportFrame(visualStyle)},options),/预览并应用/);
});
test('trusted TeX background is outside user body and keeps the original text geometry',async()=>{
 const f=await approveReportFrame(createReportFrame(visualStyle),'automated-test-actor');const input={title:'研究问题',subtitle:'',body:'正文\\par',options:{part:'main',includeCover:false,includeToc:false,firstLineChars:2,numberPages:true}};
 const plain=buildLatexSource(input),framed=buildLatexSource({...input,frame:f});assert.match(framed,/shipout\/background/);assert.equal(framed.split('% BODY START')[1],plain.split('% BODY START')[1]);assert.ok(frameTexPreamble(f).some(s=>s.includes('\\draw')));assert.match(framed,/left=31.8mm,right=31.8mm/);
});
