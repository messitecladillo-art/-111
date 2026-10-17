import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorContent,parseEditorContent} from '../lib/editor-model.ts';
import {createPlanNode,runPlanNode} from '../lib/analysis-plan.ts';
import {parseSurveyCsv} from '../lib/survey-analysis.ts';
import {buildChartSnapshot} from '../lib/chart-data.ts';
import {snapshotRecipe,makeSlideObject} from '../lib/research-quality.ts';
import {figureFromResult,figureFromSnapshot} from '../lib/report-figure.ts';
import {appendRegisteredResult} from '../lib/result-registration.ts';
import {bindReportSlide,reportLinkState,reportFigureCoverage,buildReportBlockSlide} from '../lib/report-storyboard.ts';
import {latexCompileInput,latexCompileKey,previewLatexSource,approvedLatexSource} from '../lib/latex-report.ts';

const visual={schema:'ProjectVisualStyle/v1',paletteId:'blue',version:1};
async function sample(csv='数值\n1\n2\n2\n3\n4'){
 const table=parseSurveyCsv(csv),node={...createPlanNode('numeric','numeric'),x:0},value=runPlanNode(table,node,[]);
 const result=await snapshotRecipe(value,{title:'合成数值',sourceName:'软件测试',sourceUrl:'',sourceHash:'a'.repeat(64),classification:'simulated'},'numeric');
 const snapshot=buildChartSnapshot(table,node,value,[],{dataHash:result.sourceHash,signature:'fixture',computedAt:'2026-10-17T00:00:00Z'});
 return {result,figure:figureFromSnapshot(snapshot,'histogram',{id:'histogram',resultId:result.id,resultHash:result.resultHash,title:'合成分布'})};
}
async function content(){
 const {result}=await sample(),figure=figureFromResult(result,'bar',1,'summary'),base=createEditorContent();
 const block={id:'source-block',kind:'chart',text:'合成摘要',evidenceId:result.id,valueColumn:1};
 return {...base,version:2,quality:{version:1,results:[result],findings:[]},report:[{id:'source-section',title:'合成参考',body:'合成结果说明。',source:'软件参考数据',blocks:[block]}],slides:[{id:'slide',title:'合成摘要',body:'合成结果说明。',aside:'',notes:'软件参考数据',layout:'chart',objects:[makeSlideObject('chart',{id:'plot',evidenceId:result.id,valueColumn:1,sourceBlockId:block.id,x:5,y:25,width:85,height:60})]}],figure};
}

test('registration retains aggregate bins through JSON without migrating the original document',async()=>{
 const {result,figure}=await sample(),original=createEditorContent(),before=structuredClone(original);
 const next=appendRegisteredResult(original,{result,figures:[figure],visualStyle:visual});
 assert.deepEqual(original,before);assert.equal(next.version,3);assert.deepEqual(next.figures[0].bins,figure.bins);
 assert.equal(next.figures[0].bins.reduce((sum,bin)=>sum+bin.count,0),result.n);
 assert.deepEqual(parseEditorContent(JSON.parse(JSON.stringify(next))),next);
 assert(!JSON.stringify(next).includes('"outliers"'));assert(!JSON.stringify(next).includes('"values":[1,2,2,3,4]'));
});

test('small discrete samples retain a valid aggregate histogram when Tukey detects the maximum as an outlier',async()=>{
 const {figure}=await sample('数值\n1\n2\n2\n4');
 assert.equal(figure.bins.reduce((sum,bin)=>sum+bin.count,0),4);
});

test('registration preserves chosen project palette and rejects reused identities or stale figures',async()=>{
 const {result,figure}=await sample(),base={...createEditorContent(),version:3,visualStyle:{...visual,paletteId:'forest',version:2},figures:[]};
 const next=appendRegisteredResult(base,{result,figures:[figure],visualStyle:visual});
 assert.deepEqual(next.visualStyle,base.visualStyle);
 assert.deepEqual(appendRegisteredResult(next,{result,figures:[figure],visualStyle:visual}),next);
 assert.throws(()=>appendRegisteredResult(next,{result,figures:[{...figure,title:'identity collision'}],visualStyle:visual}));
 assert.throws(()=>appendRegisteredResult(base,{result,figures:[{...figure,resultHash:'b'.repeat(64)}],visualStyle:visual}));
 assert.throws(()=>appendRegisteredResult(next,{result:{...result,title:'identity collision'}}));
});

test('a pre-existing v2 single-source link survives a v3 upgrade with unrelated figures and style',async()=>{
 const {figure,...legacy}=await content(),bound=await bindReportSlide(legacy,legacy.slides[0],'source-section');
 assert.equal(bound.reportLink.version,2);
 const upgraded={...legacy,version:3,visualStyle:visual,figures:[figure],slides:[bound]};
 assert.equal(await reportLinkState(upgraded,bound),'current');
 upgraded.visualStyle={...visual,paletteId:'forest',version:2};
 assert.equal(await reportLinkState(upgraded,bound),'current');
 assert.deepEqual(parseEditorContent(upgraded).slides[0].reportLink,bound.reportLink);
});

test('a referenced v3 figure and palette enter the single-source fingerprint',async()=>{
 const {figure,...base}=await content(),upgraded={...base,version:3,visualStyle:visual,figures:[figure]};
 upgraded.report[0].blocks[0].figureId=figure.id;upgraded.slides[0].objects[0].figureId=figure.id;
 const bound=await bindReportSlide(upgraded,upgraded.slides[0],'source-section');
 assert.equal(bound.reportLink.version,2);assert.equal(bound.reportLink.sources,undefined);
 assert.equal(await reportLinkState(upgraded,bound),'current');
 for(const change of [c=>c.figures[0].title+='改',c=>c.visualStyle.version++]){
  const changed=structuredClone(upgraded);change(changed);assert.equal(await reportLinkState(changed,bound),'report_changed');
 }
});

test('coverage rejects a different figure even when result and numeric column are identical',async()=>{
 const {figure,...base}=await content(),other={...structuredClone(figure),id:'other'};
 const upgraded={...base,version:3,visualStyle:visual,figures:[figure,other]};
 upgraded.report[0].blocks[0].figureId=figure.id;upgraded.slides[0].objects[0].figureId=other.id;
 upgraded.slides[0]=await bindReportSlide(upgraded,upgraded.slides[0],'source-section');
 assert.equal(await reportLinkState(upgraded,upgraded.slides[0]),'current');
 assert.equal((await reportFigureCoverage(upgraded))[0].state,'review');
});

test('report-to-slide composition retains the selected shared figure and yields a current link',async()=>{
 const {figure,...base}=await content(),upgraded={...base,version:3,visualStyle:visual,figures:[figure]};
 upgraded.report[0].blocks[0].figureId=figure.id;
 const slide=await buildReportBlockSlide(upgraded,'source-section','source-block');
 const plot=slide.objects.find(object=>object.kind==='chart');
 assert.equal(plot.figureId,figure.id);assert.equal(plot.sourceBlockId,'source-block');
 assert.equal((await reportFigureCoverage({...upgraded,slides:[slide]}))[0].state,'current');
});

function overfull(figure){return {...structuredClone(figure),id:'overfull',labels:Array.from({length:30},(_,i)=>`类${i}`),series:[{name:'频数',values:Array.from({length:30},()=>1)}]};}
test('an unused dense figure never breaks a plain mounted LaTeX workspace',async()=>{
 const {figure,...base}=await content(),value={...base,version:3,visualStyle:visual,figures:[overfull(figure)],latex:{version:1,body:'普通正文。',reportHash:'a'.repeat(64)}};
 const input=latexCompileInput(value),preview=previewLatexSource(input);
 assert.equal(input.figures,undefined);assert.equal(input.visualStyle,undefined);assert.equal(preview.error,'');
 assert(preview.source.includes('普通正文。'));assert(!preview.source.includes('ResearchFigureColour'));
});

test('LaTeX remaps referenced registry indices without pulling in unused oversized figures',async()=>{
 const {figure,...base}=await content(),value={...base,version:3,visualStyle:visual,figures:[overfull(figure),figure],latex:{version:1,body:'\\ResearchFigure{1}\n\\ResearchFigure{1}',reportHash:'a'.repeat(64)}};
 const input=latexCompileInput(value),preview=previewLatexSource(input);
 assert.deepEqual(input.figures,[figure]);assert.equal(input.body,'\\ResearchFigure{0}\n\\ResearchFigure{0}');assert.equal(preview.error,'');
 assert(preview.source.includes('ResearchFigure0'));assert(!preview.source.includes('ResearchFigure1'));
});

test('LaTeX figure discovery respects comments, literal backslashes and whitespace before the index',async()=>{
 const {figure,...base}=await content();
 const body=String.raw`% \ResearchFigure{0}
\\ResearchFigure{0}
\ResearchFigure {1}`;
 const value={...base,version:3,visualStyle:visual,figures:[overfull(figure),figure],latex:{version:1,body,reportHash:'a'.repeat(64)}};
 const input=latexCompileInput(value);
 assert.deepEqual(input.figures,[figure]);
 assert.equal(input.body,String.raw`% \ResearchFigure{0}
\\ResearchFigure{0}
\ResearchFigure {0}`);
 assert.equal(previewLatexSource(input).error,'');
});

test('a genuinely referenced overfull figure becomes a visible source error and cannot export',async()=>{
 const {figure,...base}=await content(),value={...base,version:3,visualStyle:visual,figures:[overfull(figure)],latex:{version:1,body:'\\ResearchFigure{0}',reportHash:'a'.repeat(64)}};
 const input=latexCompileInput(value),preview=previewLatexSource(input);
 assert.equal(preview.source,'');assert.match(preview.error,/分拆/);await assert.rejects(()=>approvedLatexSource(input),/分拆/);
});

test('formal source preparation retains its exact detached input and identity',async()=>{
 const {figure,...base}=await content(),value={...base,version:3,visualStyle:visual,figures:[figure],latex:{version:1,body:'\\ResearchFigure{0}',reportHash:'a'.repeat(64)}};
 const input=latexCompileInput(value),key=latexCompileKey(input),pending=approvedLatexSource(input);
 input.body='new body';input.figures[0].title='new title';const receipt=await pending;
 assert.equal(receipt.inputKey,key);assert(receipt.source.includes('\\ResearchFigure{0}'));assert(!receipt.source.includes('new title'));
});
