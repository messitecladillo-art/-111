import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import sharp from 'sharp';
import PptxGenJS from 'pptxgenjs';
import {createEditorContent,parseEditorContent} from '../lib/editor-model.ts';
import {snapshotRecipe,makeSlideObject} from '../lib/research-quality.ts';
import {createPlanNode,runPlanNode} from '../lib/analysis-plan.ts';
import {parseSurveyCsv} from '../lib/survey-analysis.ts';
import {buildChartSnapshot} from '../lib/chart-data.ts';
import {defaultChartStyle,CHART_THEMES} from '../lib/chart-theme.ts';
import {addQualityObjects,assertTrueVector} from '../lib/quality-export.ts';
import {buildDocx} from '../lib/editor-export.ts';
import {REPORT_FIGURE_KINDS,figureFromSnapshot,figureFromResult,figuresFromRegistration,figureFor,parseReportFigure,projectPalette,reportFigureChoices,reportFigureSVG,percentSeries} from '../lib/report-figure.ts';

const visual={schema:'ProjectVisualStyle/v1',paletteId:'forest',version:1};
const source={title:'公开测试摘要',sourceName:'合成回归用例',sourceUrl:'',sourceHash:'a'.repeat(64),classification:'simulated'};
const render=async svg=>new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
async function compute(raw,method,x=0,y=null){
 const table=parseSurveyCsv(raw),node={...createPlanNode(method,'test'),x,y},value=runPlanNode(table,node,[]);
 const snapshot=buildChartSnapshot(table,node,value,[],{dataHash:source.sourceHash,signature:'test-only',computedAt:'2026-10-17T00:00:00Z'});
 return {value,snapshot,result:await snapshotRecipe(value,source)};
}
const fixture=(result,figure)=>({...createEditorContent(),version:3,visualStyle:visual,figures:[figure],quality:{version:1,results:[result],findings:[]},report:[{id:'section',title:'数值结果',body:'保留正文',source:'',blocks:[{id:'block',kind:figure.kind==='table'?'table':'chart',text:figure.title,evidenceId:result.id,valueColumn:1,figureId:figure.id}]}],slides:[{id:'slide',title:'数值结果',body:'',aside:'',notes:'',layout:'chart',objects:[makeSlideObject(figure.kind==='table'?'table':'chart',{figureId:figure.id,evidenceId:result.id,x:5,y:10,width:90,height:80,fontSize:16})]}]});
async function ppt(content,renderer=render){const p=new PptxGenJS();p.layout='LAYOUT_WIDE';const s=p.addSlide();await addQualityObjects(s,p,content.slides[0].objects,content,renderer);return JSZip.loadAsync(await p.write({outputType:'arraybuffer'}));}

test('all eight formal kinds use exact retained aggregates or registered result columns',async()=>{
 const frequency=await compute('类型\n甲\n乙\n甲\n丙\n甲\n乙','frequency');
 const cross=await compute('人群,选择\n甲,是\n甲,否\n乙,是\n乙,是\n乙,否','crosstab',0,1);
 const numeric=await compute('数值\n0\n1\n2\n3\n100','numeric');
 const covered=new Set();
 for(const input of [frequency,cross,numeric])for(const kind of REPORT_FIGURE_KINDS){try{const figure=figureFromSnapshot(input.snapshot,kind,{id:`f-${kind}`,resultId:input.result.id,resultHash:input.result.resultHash,title:input.result.title});assertTrueVector(reportFigureSVG(figure,visual));assert.equal(figure.n,input.result.n);covered.add(kind);}catch(error){assert.match(error.message,/图形定义/);}}
 assert.deepEqual([...covered].sort(),[...REPORT_FIGURE_KINDS].sort());
});

test('histogram conserves actual count and does not persist observations or outlier values',async()=>{
 const {snapshot,result}=await compute('数值\n0\n1\n2\n3\n100','numeric');
 const f=figureFromSnapshot(snapshot,'histogram',{id:'hist',resultId:result.id,resultHash:result.resultHash,title:'分布'});
 assert.equal(f.bins.reduce((a,b)=>a+b.count,0),5);assert.deepEqual(f.bins,snapshot.distributions[0].bins);
 assert.ok(!Object.hasOwn(f,'values'));assert.ok(!Object.hasOwn(f,'pairs'));assert.ok(!Object.hasOwn(f.boxes[0],'outliers'));
 const b=figureFromSnapshot(snapshot,'boxplot',{id:'box',resultId:result.id,resultHash:result.resultHash,title:'箱须'});
 assert.deepEqual(b.boxes,[{label:'数值',low:0,q1:1,median:2,q3:3,high:3}]);
 const broken=structuredClone(f);broken.bins[0].count++;assert.throws(()=>parseReportFigure(broken));
});

test('constant single-bin histogram keeps true endpoints without inventing interval width',async()=>{
 const {snapshot,result}=await compute('数值\n7\n7\n7','numeric');const f=figureFromSnapshot(snapshot,'histogram',{id:'constant',resultId:result.id,resultHash:result.resultHash,title:'常量'});
 assert.deepEqual(f.bins,[{start:7,end:7,count:3}]);assert.doesNotThrow(()=>reportFigureSVG(f,visual));
});

test('percent stacks normalize each row denominator, preserve raw frequencies and reject zero denominators',async()=>{
 const {result}=await compute('人群,选择\n甲,是\n甲,否\n乙,是\n乙,是\n乙,否','crosstab',0,1);
 const f=figureFromResult(result,'percent_stacked',2,'percent'),before=JSON.stringify(f.series),s=percentSeries(f);
 assert.deepEqual(f.labels,['甲','乙']);assert.equal(s[0].values[0],50);assert.equal(s[0].values[1],200/3);
 assert.equal(s.reduce((sum,item)=>sum+item.values[1],0),100);assert.equal(JSON.stringify(f.series),before);
 const invalid=structuredClone(f);invalid.series.forEach(item=>item.values[0]=0);assert.throws(()=>parseReportFigure(invalid));
 const svg=reportFigureSVG(f,visual);assert.match(svg,/>50%<|>66.67%</);
});

test('grouped comparisons use requested mean column and do not revive an older count plot',async()=>{
 const {result}=await compute('组,值\n甲,2\n甲,4\n乙,5\n乙,7','groups',0,1);
 const count=figureFromResult(result,'bar',1,'count'),mean=reportFigureChoices(result,[count],2).find(c=>c.kind==='bar').figure;
 assert.deepEqual(count.series[0].values,[2,2]);assert.deepEqual(mean.series[0].values,[3,6]);
 assert.equal(reportFigureChoices(result).find(c=>c.kind==='histogram').available,false);
 assert.throws(()=>figureFromResult(result,'histogram'),/不能.*推测/);
});

test('registry binds exact result version and keeps old documents free from implicit migration',async()=>{
 const {result}=await compute('类\n甲\n乙\n甲','frequency'),figure=figureFromResult(result,'bar',1,'figure');
 const content=fixture(result,figure);assert.equal(figureFor(content,figure.id,result.id).resultHash,result.resultHash);
 const old=createEditorContent();assert.deepEqual(parseEditorContent(old),old);assert.equal(old.figures,undefined);
 content.quality.results[0]={...result,resultHash:'b'.repeat(64)};assert.throws(()=>figureFor(content,figure.id),/版本已变化/);
});

test('registration keeps selected palette and format but excludes raw pairs and observations',async()=>{
 const {snapshot,result}=await compute('数值\n1\n2\n3\n4','numeric'),settings={kind:'histogram',style:{...defaultChartStyle('分析中编辑的标题'),decimals:1,showLabels:true,showGrid:false,note:'自定义图注'}};
 const figures=figuresFromRegistration(result,{snapshot,settings,theme:'forest'});
 assert.ok(figures.some(f=>f.kind==='histogram'));assert.ok(figures.some(f=>f.kind==='boxplot'));assert.ok(figures.every(f=>f.title==='分析中编辑的标题'&&f.note==='自定义图注'&&f.style.decimals===1&&!f.style.showGrid));
 for(const f of figures)assert.ok(!JSON.stringify(f).includes('outliers'));
 const changed=structuredClone(snapshot);changed.binding.dataHash='b'.repeat(64);assert.throws(()=>figuresFromRegistration(result,{snapshot:changed,settings,theme:'forest'}),/来源.*不一致/);
});

test('palette and textual labels are shared, safe and remain vector in SVG',async()=>{
 const {result}=await compute('类\n甲\n乙\n甲','frequency'),f=figureFromResult(result,'horizontal_bar',1,'figure');
 f.title='<img onerror="x"> & 中文';f.style.showBorder=true;
 const svg=reportFigureSVG(f,visual);assert.match(svg,/#38604A/);assert.match(svg,/&lt;img onerror=&quot;x&quot;&gt; &amp; 中文/);assert.doesNotMatch(svg,/<image|<script|href=/);assert.match(svg,/width="996"/);
 assert.deepEqual(projectPalette(visual),CHART_THEMES.find(t=>t.id==='forest'));
});

test('style controls change presentation while keeping precise aggregate data',async()=>{
 const {result}=await compute('类\n甲\n乙\n甲','frequency'),f=figureFromResult(result,'bar',1,'figure');
 f.series[0].values[0]=1/3;const values=structuredClone(f.series);f.style={decimals:3,showLabels:false,showGrid:false,showBorder:false};
 const a=reportFigureSVG(f,visual);f.style={...f.style,decimals:1,showLabels:true,showGrid:true,showBorder:true};const b=reportFigureSVG(f,visual);
 assert.deepEqual(f.series,values);assert.notEqual(a,b);assert.doesNotMatch(a,/>0.333</);assert.match(b,/>0.3</);
});

test('Word retains native centered three-line tables and registered SVG palette',async()=>{
 const {result}=await compute('类\n甲\n乙\n甲','frequency'),chart=figureFromResult(result,'horizontal_bar',1,'f-chart'),table=figureFromResult(result,'table',1,'f-table'),content=fixture(result,chart);
 content.figures.push(table);content.report[0].blocks.push({id:'table',kind:'table',text:'表',evidenceId:result.id,valueColumn:1,figureId:table.id});
 const zip=await JSZip.loadAsync(await (await buildDocx(content,undefined,render)).arrayBuffer()),xml=await zip.file('word/document.xml').async('string');
 assert.match(xml,/w:sz="12"/);assert.match(xml,/w:sz="6"/);assert.match(xml,/w:jc w:val="center"/);
 const file=Object.values(zip.files).find(f=>f.name.endsWith('.svg'));assert.match(await file.async('string'),/#38604A/);assert.match(xml,/asvg:svgBlip/);
});

test('native PPT supports horizontal, grouped and row-percentage charts with exact palette/data',async()=>{
 const {result}=await compute('人群,选择\n甲,是\n甲,否\n乙,是\n乙,是\n乙,否','crosstab',0,1);
 for(const kind of ['horizontal_bar','grouped_bar','percent_stacked']){
  const f=figureFromResult(result,kind,2,kind),zip=await ppt(fixture(result,f)),chart=await Object.values(zip.files).find(file=>/^ppt\/charts\/chart\d+\.xml$/.test(file.name)).async('string');
  assert.match(chart,/<c:chart/);assert.match(chart,/38604A/);assert.match(chart,kind==='horizontal_bar'?/<c:barDir val="bar"/:/<c:barDir val="col"/);
  if(kind==='percent_stacked'){assert.match(chart,/<c:grouping val="stacked"/);assert.match(chart,/<c:v>66.66666666666667<\/c:v>/);}else assert.match(chart,/<c:v>2<\/c:v>/);
 }
});

test('complex PPT retains real SVG plus genuinely rendered compatibility PNG',async()=>{
 const {result}=await compute('人群,选择\n甲,是\n甲,否\n乙,是\n乙,是\n乙,否','crosstab',0,1),figure=figureFromResult(result,'heatmap',2,'heat');
 const zip=await ppt(fixture(result,figure)),xml=await zip.file('ppt/slides/slide1.xml').async('string'),svg=Object.values(zip.files).find(f=>/^ppt\/media\/.*\.svg$/.test(f.name)),png=Object.values(zip.files).find(f=>/^ppt\/media\/.*\.png$/.test(f.name));
 assert.ok(svg);assert.ok(png);assert.match(xml,/asvg:svgBlip/);assert.match(await svg.async('string'),/#38604A/);
 const bytes=await png.async('nodebuffer'),meta=await sharp(bytes).metadata(),stats=await sharp(bytes).stats();assert.equal(meta.width,1000);assert.equal(meta.height,700);assert.ok(stats.channels.some(c=>c.stdev>10));
 await assert.rejects(ppt(fixture(result,figure),async()=>new Uint8Array([1,2,3])),/有效 PNG/);
});

test('invalid rows, bounds, unsafe properties and stale references fail before export',async()=>{
 const {result}=await compute('类\n甲\n乙\n甲','frequency'),f=figureFromResult(result,'bar',1,'figure');
 for(const patch of [{kind:'scatter'},{series:[{name:'bad',values:[1]}]},{bins:[{start:0,end:-1,count:3}]},{style:{...f.style,decimals:8}}])assert.throws(()=>parseReportFigure({...f,...patch}));
 assert.throws(()=>parseReportFigure({...f,rawRows:[['secret']]}));
 const c=fixture(result,f);c.figures[0]={...f,resultHash:'b'.repeat(64)};await assert.rejects(ppt(c),/版本已变化/);
});

test('SVG XML validation supports genuine local clips and gradients while rejecting namespace and reference tricks',()=>{
 const safe='<svg xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="area"><rect x="0" y="0" width="20" height="20"/></clipPath><linearGradient id="colour"><stop offset="0%" stop-color="#38604A"/><stop offset="100%" stop-color="#B8C6A0"/></linearGradient></defs><rect x="0" y="0" width="40" height="40" clip-path="url(#area)" fill="url(#colour)"/></svg>';
 assert.equal(assertTrueVector(safe),safe);
 const invalid=[
  safe.replace('url(#area)','url(https://example.org/x)'),safe.replace('url(#area)','url(#missing)'),safe.replace('url(#area)','url(#colour)'),
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:v="http://www.w3.org/2000/svg"><v:image/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><path style="filter:blur(1px)"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><g id="same"/><g id="same"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><rect x="1e999"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><use href="#x"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="loop"><rect clip-path="url(#loop)"/></clipPath></defs></svg>',
 ];for(const svg of invalid)assert.throws(()=>assertTrueVector(svg));
});
