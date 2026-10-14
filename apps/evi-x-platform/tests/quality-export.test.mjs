import assert from 'node:assert/strict';
import {test} from 'node:test';
import JSZip from 'jszip';
import sharp from 'sharp';
import {getVectorPrimitives} from '../lib/vector-assets.ts';
import {createEditorContent,parseEditorContent} from '../lib/editor-model.ts';
import {makeSlideObject,resultPayload,digestText,confirmFinding,findingSignature} from '../lib/research-quality.ts';
import {buildDocx,buildPptx} from '../lib/editor-export.ts';
import {createLatexReport,generateLatexBody,latexReportKey,buildLatexSource} from '../lib/latex-report.ts';
import {assertTrueVector,chartSVG} from '../lib/quality-export.ts';
const renderSvg=async svg=>new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
const word=c=>buildDocx(c,undefined,renderSvg);
async function fixture(){
 const r={id:'freq',title:'公开参考结果',sourceName:'公开资料',sourceUrl:'https://example.org/data',sourceHash:'a'.repeat(64),resultHash:'0'.repeat(64),classification:'public',method:'frequency',n:8,total:10,headers:['类别','人数','比例'],rows:[['甲',3,.375],['乙',5,.625]],metrics:[],warnings:[]};r.resultHash=await digestText(JSON.stringify(resultPayload(r)));
 const c=createEditorContent();c.version=2;c.quality={version:1,results:[r],findings:[]};
 c.report=[{id:'s',title:'研究结果',body:'保留正文',source:'原始说明',blocks:[{id:'t',kind:'table',text:'比较表',evidenceId:'freq',valueColumn:1},{id:'g',kind:'chart',text:'分类人数',evidenceId:'freq',valueColumn:1}]}];
 c.slides=[{id:'slide',title:'研究结果',body:'',aside:'',notes:'原始讲稿',layout:'chart',objects:[makeSlideObject('vector',{assetId:'mosaic-edge',x:80,y:0,width:20,height:20}),makeSlideObject('chart',{evidenceId:'freq',x:5,y:22,width:50,height:65}),makeSlideObject('table',{evidenceId:'freq',x:58,y:22,width:38,height:60,fontSize:16}),makeSlideObject('text',{text:'研究结果',x:5,y:5,width:70,height:10,fontSize:28})]}];return c;
}
test('Word uses native centered three-line table and authoritative SVG chart',async()=>{
 const zip=await JSZip.loadAsync(await (await word(await fixture())).arrayBuffer()),doc=await zip.file('word/document.xml').async('string');
 assert.match(doc,/<w:tbl>/);assert.match(doc,/w:sz="12"/);assert.match(doc,/w:sz="6"/);assert.match(doc,/w:pStyle w:val="ReportTableText"/);assert.match(doc,/3/);assert.match(doc,/0.375/);assert.match(doc,/有效样本 n = 8（共 10）/);assert.match(doc,/asvg:svgBlip/);
 const styles=await zip.file('word/styles.xml').async('string');assert.match(styles.match(/<w:style\b[^>]*w:styleId="ReportTableText"[\s\S]*?<\/w:style>/)[0],/<w:jc w:val="center"\/>/);
 const files=Object.values(zip.files).filter(f=>f.name.endsWith('.svg'));assert.equal(files.length,1);const svg=await files[0].async('string');assert.match(svg,/<path/);assert.doesNotMatch(svg,/<image|data:image|href=|<style/);assert.match(svg,/>5</);
});
test('PPT has native chart workbook, editable centered table, text and vector shapes',async()=>{
 const zip=await JSZip.loadAsync(await (await buildPptx(await fixture())).arrayBuffer());const slide=await zip.file('ppt/slides/slide1.xml').async('string');
 assert.match(slide,/<c:chart/);assert.match(slide,/<a:tbl>/);assert.match(slide,/w="19050"/);assert.match(slide,/w="9525"/);assert.match(slide,/algn="ctr"/);assert.doesNotMatch(slide,/svgBlip|<p:pic>/);assert.match(slide,/研究结果/);
 const chart=await zip.file('ppt/charts/chart1.xml').async('string');assert.match(chart,/<c:v>3<\/c:v>/);assert.match(chart,/<c:v>5<\/c:v>/);assert.match(chart,/externalData/);assert.ok(Object.keys(zip.files).some(n=>n.includes('embeddings')&&n.endsWith('.xlsx')));
 const notes=await zip.file('ppt/notesSlides/notesSlide1.xml').async('string');assert.match(notes,/原始讲稿/);assert.match(notes,/n=8 \/ 10/);assert.equal(Object.keys(zip.files).filter(n=>/^ppt\/media\//.test(n)&&!n.endsWith('/')).length,0);assert.ok([...slide.matchAll(/<a:prstGeom prst="rect"/g)].length>=6);
});
test('LaTeX exports complete table and numeric PGF plot with scoped packages',async()=>{
 const c=await fixture(),draft=await createLatexReport(c),body=draft.body;assert.match(body,/\\toprule\[1.5bp\]/);assert.match(body,/\\midrule\[0.75bp\]/);assert.match(body,/\\bottomrule\[1.5bp\]/);assert.match(body,/\\begin\{tabular\}\{ccc\}/);assert.ok(body.includes('(0,3) [3]'));assert.ok(body.includes('(1,5) [5]'));assert.match(body,/0.375/);assert.match(body,/保留正文/);
 const full=buildLatexSource({title:c.title,subtitle:c.subtitle,body,options:{part:'main',includeCover:true,includeToc:true,firstLineChars:2,numberPages:true}});assert.match(full,/\\usepackage\{pgfplots\}/);
 const before=latexReportKey(c);c.report[0].blocks[0].text='新表题';assert.notEqual(latexReportKey(c),before);
});
test('tampered result hash prevents every async output',async()=>{const c=await fixture();c.quality.results[0].rows[0][1]=300;await assert.rejects(word(c),/指纹/);await assert.rejects(buildPptx(c),/指纹/);await assert.rejects(createLatexReport(c),/指纹/);});
test('missing references and overflowing objects fail instead of silently dropping content',async()=>{const c=await fixture();c.slides[0].objects[1].evidenceId='missing';await assert.rejects(buildPptx(c),/不存在/);c.slides[0].objects=[makeSlideObject('text',{text:'正文'.repeat(800),width:10,height:5})];await assert.rejects(buildPptx(c),/分拆/);c.report[0].blocks=[{id:'math',kind:'formula',text:'x^2',evidenceId:'',valueColumn:1}];const math=await JSZip.loadAsync(await (await word(c)).arrayBuffer());assert.match(await math.file('word/document.xml').async('string'),/<m:oMathPara>[\s\S]*<m:sSup>/);assert.match(generateLatexBody(c),/x\^2/);c.report[0].blocks[0].text='\\frac{x';await assert.rejects(word(c),/公式无法解析/);});
test('true SVG rejects disguised bitmap, scripts, external resources and unsafe formula commands',async()=>{for(const svg of ['<svg><image href="x"/></svg>','<svg><script/></svg>','<svg><path href="https://bad"/></svg>','<svg><filter/></svg>'])assert.throws(()=>assertTrueVector(svg));const c=await fixture();assert.match(chartSVG(c.quality.results[0],1),/>3</);c.report[0].blocks=[{id:'bad',kind:'formula',text:'\\input{secret}',evidenceId:'',valueColumn:1}];assert.throws(()=>generateLatexBody(c),/非数学/);});

test('unsupported native transforms and overfull LaTeX tables require explicit adjustment',async()=>{const c=await fixture();c.slides[0].objects[1].rotation=25;await assert.rejects(buildPptx(c),/旋转/);c.report[0].blocks=[c.report[0].blocks[0]];c.quality.results[0].rows=Array.from({length:26},(_,i)=>['类别'+i,i,i]);assert.throws(()=>generateLatexBody(c),/分拆/);c.report[0].blocks=[{id:'f',kind:'formula',text:'\\write18{command}',evidenceId:'',valueColumn:1}];assert.throws(()=>generateLatexBody(c),/非数学/);assert.throws(()=>assertTrueVector('<svg onload="alert(1)"><rect/></svg>'));});


test('explicit empty object page stays blank instead of resurrecting legacy content',async()=>{const c=await fixture();c.slides[0]={...c.slides[0],objects:[],title:'已删除标题',body:'已删除正文'};const zip=await JSZip.loadAsync(await (await buildPptx(c)).arrayBuffer());const xml=await zip.file('ppt/slides/slide1.xml').async('string');assert.doesNotMatch(xml,/已删除标题|已删除正文|<a:t>|<c:chart|<a:tbl>/);});
test('scope and missing-value context survive Word, PPT notes and LaTeX',async()=>{const c=await fixture(),r=c.quality.results[0];r.warnings=['原表10行，筛选后9行，共同应答范围8行','缺失编码：99'];r.resultHash=await digestText(JSON.stringify(resultPayload(r)));const doc=await JSZip.loadAsync(await (await word(c)).arrayBuffer());const ppt=await JSZip.loadAsync(await (await buildPptx(c)).arrayBuffer());for(const text of [await doc.file('word/document.xml').async('string'),await ppt.file('ppt/notesSlides/notesSlide1.xml').async('string'),generateLatexBody(c)]){assert.match(text,/共同应答范围8行/);assert.match(text,/缺失编码：99/);}});
test('missing or stale chapter findings prevent every export',async()=>{const c=await fixture();c.quality.findings=[confirmFinding({id:'f',title:'分类差异',question:'哪类更多',evidenceIds:['freq'],interpretation:'乙为5，甲为3',alternatives:'仅描述统计',scope:'公开数据8条',action:'进一步检验',status:'draft',confirmedHashes:{}},c.quality)];c.report[0].findingIds=['f'];c.report[0].findingSnapshots={f:findingSignature(c.quality.findings[0])};await word(c);await buildPptx(c);generateLatexBody(c);c.quality.findings[0].status='draft';await assert.rejects(word(c),/待复核/);await assert.rejects(buildPptx(c),/待复核/);assert.throws(()=>generateLatexBody(c),/待复核/);c.quality.findings[0].status='confirmed';c.quality.results[0].n=7;c.quality.results[0].resultHash=await digestText(JSON.stringify(resultPayload(c.quality.results[0])));await assert.rejects(word(c),/待复核/);await assert.rejects(buildPptx(c),/待复核/);assert.throws(()=>generateLatexBody(c),/待复核/);c.report[0].findingIds=['missing'];await assert.rejects(word(c),/不存在/);await assert.rejects(buildPptx(c),/不存在/);assert.throws(()=>generateLatexBody(c),/不存在/);});
test('display uses three decimals while native chart data retains full precision',async()=>{const c=await fixture(),r=c.quality.results[0];r.rows[0][1]=1/3;r.resultHash=await digestText(JSON.stringify(resultPayload(r)));const zip=await JSZip.loadAsync(await (await buildPptx(c)).arrayBuffer());assert.match(await Object.values(zip.files).find(f=>/^ppt\/charts\/chart\d+\.xml$/.test(f.name)).async('string'),/<c:v>0.3333333333333333<\/c:v>/);assert.match(await zip.file('ppt/slides/slide1.xml').async('string'),/>0.333</);assert.match(generateLatexBody(c),/\(0,0.3333333333333333\) \[0.333\]/);});


test('valid zero-row table snapshots are rejected consistently before native export',async()=>{
 const c=await fixture(),r=c.quality.results[0];r.rows=[];r.n=0;r.resultHash=await digestText(JSON.stringify(resultPayload(r)));c.report[0].blocks=[c.report[0].blocks[0]];c.slides[0].objects=[c.slides[0].objects[2]];
 const parsed=parseEditorContent(c);assert.equal(parsed.quality.results[0].rows.length,0);
 const actionable=/没有数据行.*调整筛选或共同应答范围.*重新计算.*移除/;
 await assert.rejects(word(parsed),actionable);await assert.rejects(buildPptx(parsed),actionable);await assert.rejects(createLatexReport(parsed),actionable);assert.throws(()=>generateLatexBody(parsed),actionable);
 r.rows=[['甲',0,0]];r.resultHash=await digestText(JSON.stringify(resultPayload(r)));const doc=await JSZip.loadAsync(await (await word(c)).arrayBuffer());const xml=await doc.file('word/document.xml').async('string');assert.match(xml,/>0</);assert.equal([...xml.matchAll(/<w:bottom\b(?=[^>]*w:val="single")(?=[^>]*w:sz="12")[^>]*\/>/g)].length,3);await buildPptx(c);assert.match(generateLatexBody(c),/甲 & 0 & 0/);
});
test('zero-row charts cannot produce empty SVG, native PPT chart or PGF plot',async()=>{
 const c=await fixture(),r=c.quality.results[0];r.rows=[];r.n=0;r.resultHash=await digestText(JSON.stringify(resultPayload(r)));c.report[0].blocks=[c.report[0].blocks[1]];c.slides[0].objects=[c.slides[0].objects[1]];
 assert.throws(()=>chartSVG(r,1),/1–50 个有效类别/);await assert.rejects(word(c),/没有数据行.*改用表格/);await assert.rejects(buildPptx(c),/1–50 个有效类别/);await assert.rejects(createLatexReport(c),/1–50 个有效类别/);
});

test('edited and reconfirmed finding requires renewing the chapter snapshot in every export',async()=>{
 const c=await fixture();const finding=confirmFinding({id:'f',title:'分类差异',question:'哪类更多',evidenceIds:['freq'],interpretation:'乙为5，甲为3',alternatives:'仅描述统计',scope:'公开数据8条',action:'进一步检验',status:'draft',confirmedHashes:{}},c.quality);c.quality.findings=[finding];c.report[0].findingIds=['f'];c.report[0].findingSnapshots={f:findingSignature(finding)};
 await word(c);await buildPptx(c);await createLatexReport(c);
 const keyBefore=latexReportKey(c);c.quality.findings[0]=confirmFinding({...finding,interpretation:'经重新审阅后的解释：乙更多，但不能推断因果'},c.quality);
 const stale=/发现内容已更新.*核对章节.*更新关联/;await assert.rejects(word(c),stale);await assert.rejects(buildPptx(c),stale);await assert.rejects(createLatexReport(c),stale);assert.throws(()=>generateLatexBody(c),stale);
 c.report[0].findingSnapshots.f=findingSignature(c.quality.findings[0]);assert.notEqual(latexReportKey(c),keyBefore);await word(c);await buildPptx(c);await createLatexReport(c);
});

test('finding-only chapters still verify result payload hashes in all async exports',async()=>{
 const c=await fixture();const f=confirmFinding({id:'f',title:'分类差异',question:'哪类更多',evidenceIds:['freq'],interpretation:'乙为5，甲为3',alternatives:'仅描述统计',scope:'公开数据8条',action:'进一步检验',status:'draft',confirmedHashes:{}},c.quality);c.quality.findings=[f];c.report[0].blocks=[];c.report[0].findingIds=['f'];c.report[0].findingSnapshots={f:findingSignature(f)};c.slides[0].objects=[];
 c.quality.results[0].rows[0][1]=300;
 await assert.rejects(word(c),/指纹/);await assert.rejects(buildPptx(c),/指纹/);await assert.rejects(createLatexReport(c),/指纹/);
});
test('native chart labels use explicit placement and avoid optional decimal point artifacts',async()=>{
 const c=await fixture();let zip=await JSZip.loadAsync(await (await buildPptx(c)).arrayBuffer());let xml=await Object.values(zip.files).find(f=>/^ppt\/charts\/chart\d+\.xml$/.test(f.name)).async('string');assert.match(xml,/formatCode="0"/);assert.match(xml,/<c:dLblPos val="ctr"/);
 const r=c.quality.results[0];r.rows[0][1]=1/3;r.resultHash=await digestText(JSON.stringify(resultPayload(r)));zip=await JSZip.loadAsync(await (await buildPptx(c)).arrayBuffer());xml=await Object.values(zip.files).find(f=>/^ppt\/charts\/chart\d+\.xml$/.test(f.name)).async('string');assert.match(xml,/formatCode="0.000"/);assert.match(xml,/<c:v>0.3333333333333333<\/c:v>/);
});
test('Word chart and captions remain a local group without binding the whole report',async()=>{
 const zip=await JSZip.loadAsync(await (await word(await fixture())).arrayBuffer()),xml=await zip.file('word/document.xml').async('string');const paragraphs=[...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(m=>m[0]);assert.match(paragraphs.find(p=>p.includes('asvg:svgBlip')),/<w:keepNext\/>/);assert.match(paragraphs.find(p=>p.includes('ReportFigureCaption')&&p.includes('分类人数')),/<w:keepNext\/>/);assert.doesNotMatch(paragraphs.find(p=>p.includes('保留正文')),/<w:keepNext\/>/);
});

test('native decorative geometry preserves vector shapes, negative line direction and transforms',async()=>{
 const c=await fixture();const assets=['mosaic-edge','focus-loop','path-ribbon'];c.slides[0].objects=assets.map((assetId,i)=>makeSlideObject('vector',{assetId,x:5+i*30,y:10,width:25,height:65,rotation:25,opacity:.8}));const zip=await JSZip.loadAsync(await (await buildPptx(c)).arrayBuffer()),xml=await zip.file('ppt/slides/slide1.xml').async('string');
 assert.doesNotMatch(xml,/<p:pic>|svgBlip/);assert.equal(Object.keys(zip.files).filter(n=>/^ppt\/media\//.test(n)&&!n.endsWith('/')).length,0);
 const expected=assets.reduce((n,id)=>n+getVectorPrimitives(id).length,0);assert.equal([...xml.matchAll(/<p:sp>/g)].length,expected);assert.match(xml,/flipV="1"/);assert.match(xml,/rot="1500000"/);assert.match(xml,/prst="ellipse"/);assert.match(xml,/prst="roundRect"/);assert.match(xml,/<a:alpha val=/);
});
test('headless Word chart requires a real renderer and supplied preview contains chart pixels',async()=>{
 const c=await fixture();await assert.rejects(buildDocx(c),/兼容预览需要渲染器/);const zip=await JSZip.loadAsync(await (await word(c)).arrayBuffer()),file=Object.values(zip.files).find(f=>/^word\/media\/.*\.png$/.test(f.name));assert.ok(file);
 const png=await file.async('nodebuffer'),metadata=await sharp(png).metadata(),stats=await sharp(png).stats();assert.equal(metadata.width,960);assert.equal(metadata.height,540);assert.ok(stats.channels.some(channel=>channel.stdev>10));assert.match(await zip.file('word/document.xml').async('string'),/asvg:svgBlip/);
});
