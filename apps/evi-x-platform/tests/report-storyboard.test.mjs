import assert from 'node:assert/strict';
import {test} from 'node:test';
import JSZip from 'jszip';
import {createEditorContent,parseEditorContent} from '../lib/editor-model.ts';
import {blankStoryCard,buildStoryboard,parseReportSlideLink,reportLinkState,reportExportWarnings,selectMainSources,reportFigureCoverage,bindReportSlideSources,buildReportBlockSlide} from '../lib/report-storyboard.ts';
import {buildPptx} from '../lib/editor-export.ts';
import {snapshotRecipe} from '../lib/research-quality.ts';
import {parseSurveyCsv} from '../lib/survey-analysis.ts';
import {createPlanNode,runPlanNode} from '../lib/analysis-plan.ts';
import {figureFromResult} from '../lib/report-figure.ts';
function fixture(){const content=createEditorContent();content.report=[{id:'evidence-1',title:'调查发现',body:'前文'.repeat(3200)+'原文尾部证据：本样本 12 / 30 选择 A。仅限本样本。',source:'出处'.repeat(700)+'完整来源尾部'}];const c={...blankStoryCard('evidence-1','card-1'),title:'样本中的选择分布',excerpt:'本样本 12 / 30 选择 A。',limitation:'仅限本样本，不能外推或推断因果。',implication:'先复核招募范围，再决定后续访谈。',locator:'模拟稿 v1，第 3 章表 2',classification:'simulated'};return {content,c};}
test('legacy editor content remains identical with no mandatory metadata',()=>{const c=createEditorContent();assert.deepEqual(parseEditorContent(c),c);});
test('long source is selectively mapped without loss of selected tail or full source',async()=>{const {content,c}=fixture(),before=structuredClone(content);const slides=await buildStoryboard(content,[c],'append');assert.equal(slides.length,4);assert.deepEqual(slides.slice(0,3),content.slides);assert.match(slides[3].body,/12 \/ 30/);assert.match(slides[3].aside,/不能外推/);assert.ok(slides[3].notes.includes(content.report[0].source));assert.deepEqual(content,before);assert.equal(await reportLinkState(content,slides[3]),'current');slides[0].body='detached';assert.deepEqual(content,before);});
test('link survives JSON/server parser round trip without verified fields',async()=>{const {content,c}=fixture();const slides=await buildStoryboard(content,[c],'replace');const restored=parseEditorContent(JSON.parse(JSON.stringify({...content,slides})));assert.deepEqual(restored.slides,slides);assert.equal(await reportLinkState(restored,restored.slides[0]),'current');assert.equal(restored.slides[0].reportLink.verified,undefined);});
test('same chapter can be split repeatedly and manual ordering remains exact',async()=>{const {content,c}=fixture();const slides=await buildStoryboard(content,[{...c,id:'c2',title:'先讲边界'},{...c,title:'再讲分布'}],'replace');assert.deepEqual(slides.map(s=>s.title),['先讲边界','再讲分布']);assert.notEqual(slides[0].id,slides[1].id);});
for(const field of ['body','title','source'])test(`report ${field} drift invalidates the link`,async()=>{const {content,c}=fixture();const [slide]=await buildStoryboard(content,[c],'replace');content.report[0][field]+='变更';assert.equal(await reportLinkState(content,slide),'report_changed');});
for(const field of ['title','body','aside','notes','layout'])test(`slide ${field} drift is detected`,async()=>{const {content,c}=fixture();const [slide]=await buildStoryboard(content,[c],'replace');slide[field]=field==='layout'?'content':slide[field]+'changed';assert.equal(await reportLinkState(content,slide),'slide_changed');});
test('removed source and unlinked old slides are distinct',async()=>{const {content,c}=fixture();const [slide]=await buildStoryboard(content,[c],'replace');assert.equal(await reportLinkState(content,content.slides[0]),'unlinked');content.report=[];assert.equal(await reportLinkState(content,slide),'missing_source');});
test('missing requirements, fabricated excerpts, duplicates and length overflow reject',async()=>{const {content,c}=fixture();for(const patch of [{title:''},{excerpt:'不存在的原文'},{limitation:''},{implication:''},{locator:''},{seconds:9},{seconds:NaN},{seconds:301},{title:'x'.repeat(121)},{excerpt:'x'.repeat(401)},{classification:'actual'},{job:'unknown'}])await assert.rejects(()=>buildStoryboard(content,[{...c,...patch}],'append'));await assert.rejects(()=>buildStoryboard(content,[c,c],'replace'),/重复/);await assert.rejects(()=>buildStoryboard(content,[],'replace'));});
test('40 slide capacity includes retained slides and never clips items',async()=>{const {content,c}=fixture();content.slides=Array.from({length:40},(_,i)=>({...content.slides[0],id:`s${i}`}));await assert.rejects(()=>buildStoryboard(content,[c],'append'),/40/);assert.equal((await buildStoryboard(content,[c],'replace')).length,1);});
test('link strict parser rejects forged verification, missing fields, invalid hashes',async()=>{const {content,c}=fixture();const [slide]=await buildStoryboard(content,[c],'replace');const link=slide.reportLink;for(const bad of [null,[],{...link,verified:true},{...link,version:3},{...link,sectionHash:'A'.repeat(64)},{...link,slideHash:'short'},{...link,sectionId:'\u0000'}])assert.throws(()=>parseReportSlideLink(bad));assert.throws(()=>parseEditorContent({...content,slides:[{...slide,reportLink:null}]}));});
test('known generated simulation marker cannot be downgraded',async()=>{const {content,c}=fixture();content.report[0].body='【教学模拟数据，不能作为实际调查结果】'+content.report[0].body;await assert.rejects(()=>buildStoryboard(content,[{...c,classification:'user_provided'}],'replace'),/模拟/);assert.match((await buildStoryboard(content,[c],'replace'))[0].body,/教学模拟/);});
test('async assembly snapshots inputs before hashing',async()=>{const {content,c}=fixture();const original=structuredClone(content);const promise=buildStoryboard(content,[c],'replace');content.report[0].source='mid-hash';c.limitation='mid-hash';const [slide]=await promise;assert.equal(await reportLinkState(original,slide),'current');assert.ok(slide.notes.includes(original.report[0].source));});
test('PPTX exporter retains exact selected evidence, visible limits and complete source notes',async()=>{const {content,c}=fixture();content.slides=await buildStoryboard(content,[c],'replace');const ppt=await buildPptx(content);const zip=await JSZip.loadAsync(await ppt.arrayBuffer());const xml=await zip.file('ppt/slides/slide1.xml').async('string');const notes=await zip.file('ppt/notesSlides/notesSlide1.xml').async('string');assert.match(xml,/12 \/ 30/);assert.match(xml,/不能外推或推断因果/);assert.match(xml,/教学模拟/);assert.match(notes,/完整来源尾部/);assert.doesNotMatch(xml,/证见|EVI-X/);});
test('export checks all linked slides including non-selected pages',async()=>{const {content,c}=fixture();assert.deepEqual(await reportExportWarnings(content),[]);content.slides=await buildStoryboard(content,[c,{...c,id:'c2'}],'append');assert.deepEqual(await reportExportWarnings(content),[]);content.slides[3].body+='edit';assert.deepEqual(await reportExportWarnings(content),[{page:4,state:'slide_changed'}]);content.report[0].source+='new';assert.deepEqual(await reportExportWarnings(content),[{page:4,state:'report_changed'},{page:5,state:'report_changed'}]);content.report=[];assert.deepEqual(await reportExportWarnings(content),[{page:4,state:'missing_source'},{page:5,state:'missing_source'}]);});
test('export check snapshots before awaits and cannot report failed hashing as current',async()=>{const {content,c}=fixture();content.slides=await buildStoryboard(content,[c],'replace');const pending=reportExportWarnings(content);content.report[0].body+='changed later';assert.deepEqual(await pending,[]);content.slides[0].reportLink.sectionHash='invalid';assert.deepEqual(await reportExportWarnings(content),[{page:1,state:'check_failed'}]);});

async function combinedFixture(){
  const table=parseSurveyCsv('参与,反馈\n是,满意\n否,一般\n是,满意\n是,一般');
  const results=[];for(const x of [0,1]){const value=runPlanNode(table,{...createPlanNode('frequency','test-'+x),x},[]);results.push(await snapshotRecipe(value,{title:'组合排版验收',sourceName:'合成测试',sourceUrl:'',sourceHash:'a'.repeat(64),classification:'simulated'}));}
  const figures=[figureFromResult(results[0],'bar',1,'participation'),figureFromResult(results[1],'table',1,'feedback')];
  // This report table intentionally presents frequencies; the full registered inference remains in its source result.
  figures[1].table={headers:figures[1].table.headers.slice(0,2),rows:figures[1].table.rows.map(row=>row.slice(0,2))};
  const content={...createEditorContent(),version:3,visualStyle:{schema:'ProjectVisualStyle/v1',paletteId:'blue',version:1},figures,quality:{version:1,results,findings:[]},report:[
    {id:'participation',title:'参与情况',body:'本样本的选择存在差异。',source:'测试来源甲，非实际调查。',blocks:[{id:'participation-chart',kind:'chart',text:'参与选择',evidenceId:results[0].id,valueColumn:1,figureId:figures[0].id},{id:'context',kind:'paragraph',text:'用于软件验证。',evidenceId:'',valueColumn:1}]},
    {id:'feedback',title:'服务反馈',body:'反馈用于比较样本选择。',source:'测试来源乙，非实际调查。',blocks:[{id:'feedback-table',kind:'table',text:'反馈分布',evidenceId:results[1].id,valueColumn:1,figureId:figures[1].id}]},
  ]};
  const card={...blankStoryCard('participation','combined'),title:'参与与反馈',excerpt:'本样本的选择存在差异。',limitation:'仅限软件测试样本。',implication:'继续核对原因。',locator:'合成测试版',classification:'simulated',sources:[{sectionId:'participation',blockIds:['participation-chart']},{sectionId:'feedback',blockIds:['feedback-table']}]};
  return {content,card};
}

test('cross-chapter composition reuses both exact shared figures and keeps native editable evidence',async()=>{
  const {content,card}=await combinedFixture(),before=structuredClone(content),[slide]=await buildStoryboard(content,[card],'replace');
  assert.equal(slide.reportLink.version,3);assert.deepEqual(slide.reportLink.sources.map(s=>[s.sectionId,s.blockIds]),card.sources.map(s=>[s.sectionId,s.blockIds]));
  const evidence=slide.objects.filter(o=>['chart','table'].includes(o.kind));assert.deepEqual(evidence.map(o=>[o.kind,o.figureId,o.sourceBlockId]),[['chart','participation','participation-chart'],['table','feedback','feedback-table']]);
  assert.ok(slide.objects.filter(o=>o.kind==='text').every(o=>o.fontSize>=15));assert.ok(slide.notes.includes(content.report[0].source)&&slide.notes.includes(content.report[1].source)&&slide.notes.includes(card.locator));assert.deepEqual(content,before);
  const document=parseEditorContent({...content,slides:[slide]});assert.equal(await reportLinkState(document,slide),'current');
  const zip=await JSZip.loadAsync(await (await buildPptx(document)).arrayBuffer()),xml=await zip.file('ppt/slides/slide1.xml').async('string');
  assert.match(xml,/<a:tbl>/);assert.ok(Object.keys(zip.files).some(p=>/^ppt\/charts\/chart\d+\.xml$/.test(p)));assert.doesNotMatch(xml,/证见|EVI-X/);assert.equal(Object.keys(zip.files).filter(p=>p.startsWith('ppt/media/')&&!zip.files[p].dir).length,0);
});

test('composed-page provenance detects either source, selected blocks, shared formatting and page edits',async()=>{
  const {content,card}=await combinedFixture(),[slide]=await buildStoryboard(content,[card],'replace');
  for(const index of [0,1]){const changed=structuredClone(content);changed.report[index].body+='新编辑';assert.equal(await reportLinkState(changed,slide),'report_changed');}
  const missing=structuredClone(content);missing.report[1].blocks=[];assert.equal(await reportLinkState(missing,slide),'missing_source');
  const changed=structuredClone(content);changed.figures[0].style.showGrid=!changed.figures[0].style.showGrid;assert.equal(await reportLinkState(changed,slide),'report_changed');
  const moved=structuredClone(slide);moved.objects[0].x++;assert.equal(await reportLinkState(content,moved),'slide_changed');
});

test('composition rejects removed, duplicate or over-capacity selections without changing a draft',async()=>{
  const {content,card}=await combinedFixture(),before=structuredClone(content);
  for(const sources of [[...card.sources,{sectionId:'missing',blockIds:[]}],[{sectionId:'participation',blockIds:['missing']}],[card.sources[0],card.sources[0]]])await assert.rejects(buildStoryboard(content,[{...card,sources}],'replace'),/来源|内容块/);
  content.report[0].blocks.push({...content.report[0].blocks[0],id:'third-chart'});
  await assert.rejects(buildStoryboard(content,[{...card,sources:[{sectionId:'participation',blockIds:['participation-chart','third-chart']},card.sources[1]]}],'replace'),/最多组合 2/);
  content.report[0].blocks.pop();assert.deepEqual(content,before);
  await assert.rejects(buildStoryboard(content,[{...card,classification:'user_provided'}],'replace'),/模拟/);
});

test('up to twelve contextual sources bind precisely, while a thirteenth requires another page',async()=>{
  const {content,card}=await combinedFixture();for(let i=0;i<11;i++)content.report.push({id:'context-'+i,title:'背景'+i,body:'背景原文',source:'合成来源'});
  const sources=[...card.sources,...content.report.slice(2,12).map(s=>({sectionId:s.id,blockIds:[]}))];
  const [slide]=await buildStoryboard(content,[{...card,sources}],'replace');assert.equal(slide.reportLink.sources.length,12);
  await assert.rejects(buildStoryboard(content,[{...card,sources:[...sources,{sectionId:'context-10',blockIds:[]}]}],'replace'),/12/);
});

test('selected paragraph text survives composition and a dense page is rejected rather than shrunk',async()=>{
  const {content,card}=await combinedFixture(),withText=structuredClone(card);withText.sources[0].blockIds.push('context');
  const [slide]=await buildStoryboard(content,[withText],'replace');assert.ok(slide.body.includes('用于软件验证。'));assert.ok(slide.objects.some(o=>o.text.includes('用于软件验证。')));
  await assert.rejects(buildStoryboard(content,[{...card,implication:'进一步核对'.repeat(40)}],'replace'),/分拆|拆页/);
});

test('a full inference table receives a dedicated wide layout without discarding any columns',async()=>{
  const {content,card}=await combinedFixture();content.figures[1]=figureFromResult(content.quality.results[1],'table',1,'feedback');card.sources[0].blockIds=[];
  const [slide]=await buildStoryboard(content,[card],'replace'),table=slide.objects.find(o=>o.kind==='table');assert.equal(table.width,86);assert.equal(table.fontSize,17);assert.equal(content.figures[1].table.headers.length,5);
  const zip=await JSZip.loadAsync(await (await buildPptx({...content,slides:[slide]})).arrayBuffer()),xml=await zip.file('ppt/slides/slide1.xml').async('string');for(const header of content.figures[1].table.headers)assert.ok(xml.includes(header));
});

test('multi-source assembly detaches every selected reference before asynchronous verification',async()=>{
  const {content,card}=await combinedFixture(),original=structuredClone(content),pending=buildStoryboard(content,[card],'replace');
  content.report[1].source='晚到编辑';content.figures[0].style.showLabels=false;card.sources[1].blockIds=[];
  const [slide]=await pending;assert.equal(await reportLinkState(original,slide),'current');assert.ok(slide.notes.includes(original.report[1].source));assert.equal(slide.objects.filter(o=>['chart','table'].includes(o.kind)).length,2);
});

test('a retained legacy single-chapter card still uses its original path beside a composed page',async()=>{
  const {content,card}=await combinedFixture(),legacy={...card,id:'legacy'};delete legacy.sources;
  const slides=await buildStoryboard(content,[legacy,card],'replace');assert.equal(slides[0].reportLink.version,1);assert.equal(slides[0].objects,undefined);assert.equal(slides[1].reportLink.version,3);assert.deepEqual(slides.map(s=>s.title),[legacy.title,card.title]);
});

test('changing the main speaker reorders all selected chapters and preserves independent block selections',()=>{
  const sources=[{sectionId:'A',blockIds:['shared']},{sectionId:'B',blockIds:['shared','text']},{sectionId:'C',blockIds:[]}],before=structuredClone(sources);
  const next=selectMainSources(sources,'B');assert.deepEqual(next,[before[1],before[0],before[2]]);assert.deepEqual(sources,before);
  next[0].blockIds.pop();assert.deepEqual(sources,before,'returned selections are detached');
  assert.deepEqual(selectMainSources(sources,'D'),[{sectionId:'D',blockIds:[]},...before]);
  const full=Array.from({length:12},(_,i)=>({sectionId:`s-${i}`,blockIds:[`b-${i}`]}));
  assert.equal(selectMainSources(full,'s-11').length,12);assert.throws(()=>selectMainSources(full,'new'),/12/);
});

async function repeatedBlockIds({sameKind=false,sameFigure=false}={}){
  const {content,card}=await combinedFixture();
  content.report[0].blocks[0].id='shared';content.report[1].blocks[0].id='shared';
  if(sameKind){content.figures[1]=figureFromResult(content.quality.results[1],'bar',1,'feedback');content.report[1].blocks[0].kind='chart';}
  if(sameFigure)content.report[1].blocks[0]={...content.report[0].blocks[0]};
  card.sources.forEach(ref=>ref.blockIds=['shared']);
  return {content,card};
}
test('same block ID in different chapters uses explicit owners, including chart/table differences',async()=>{
  const {content,card}=await repeatedBlockIds(),[slide]=await buildStoryboard(content,[card],'replace');
  assert.deepEqual(slide.objects.filter(o=>o.sourceBlockId).map(o=>[o.sourceSectionId,o.sourceBlockId,o.kind]),[['participation','shared','chart'],['feedback','shared','table']]);
  content.slides=[slide];assert.deepEqual((await reportFigureCoverage(content)).map(c=>c.state),['current','current']);
  const restored=parseEditorContent(content);assert.deepEqual(restored.slides[0].objects.filter(o=>o.sourceBlockId).map(o=>o.sourceSectionId),['participation','feedback']);
  const single=await buildReportBlockSlide(content,'participation','shared');assert.equal(single.objects.find(o=>o.sourceBlockId==='shared').sourceSectionId,'participation');
});
test('legacy objects without owners may resolve same block IDs using unique type, figure and evidence',async()=>{
  for(const options of [{},{sameKind:true}]){
    const {content,card}=await repeatedBlockIds(options),[slide]=await buildStoryboard(content,[card],'replace');
    for(const object of slide.objects)delete object.sourceSectionId;
    content.slides=[await bindReportSlideSources(content,slide,card.sources)];
    assert.deepEqual((await reportFigureCoverage(content)).map(c=>c.state),['current','current']);
  }
});
test('same shared figure at two chapter positions requires owners; ambiguous legacy matches remain review',async()=>{
  const {content,card}=await repeatedBlockIds({sameFigure:true}),[slide]=await buildStoryboard(content,[card],'replace');
  content.slides=[slide];assert.deepEqual((await reportFigureCoverage(content)).map(c=>[c.sectionId,c.state,c.pages]),[['participation','current',[1]],['feedback','current',[1]]]);
  for(const object of slide.objects)delete object.sourceSectionId;
  content.slides=[await bindReportSlideSources(content,slide,card.sources)];
  assert.deepEqual((await reportFigureCoverage(content)).map(c=>[c.state,c.pages]),[['review',[1]],['review',[1]]]);
});

test('v3 fingerprints survive semantic JSON key reordering without changing legacy link hashing',async()=>{
  const {content,card}=await combinedFixture(),[slide]=await buildStoryboard(content,[card],'replace');
  content.slides=[slide];
  const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
  const restored=JSON.parse(JSON.stringify(sorted(content)));
  assert.equal(await reportLinkState(restored,restored.slides[0]),'current');
  restored.figures[0].style.showLabels=!restored.figures[0].style.showLabels;
  assert.equal(await reportLinkState(restored,restored.slides[0]),'report_changed');
});
