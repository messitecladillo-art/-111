import type { EditorContent, ReportSection, Slide } from './editor-model.ts';
import {findingSignature,makeSlideObject,resultFor,type SlideObject,verifyResearchQuality} from './research-quality.ts';
import {referenceSegments,reportLabels,resolveReferences} from './report-numbering.ts';
import {referenceNumbers} from './references.ts';
import {splitInlineMath} from './inline-math.ts';
/**
 * The slide text for an excerpt of a section. The excerpt may be copied from the editor (with [[图:…]] tokens)
 * or from the preview (with figure numbers); slides show figure numbers, refuse broken references as the Word
 * export does, and refuse inline formulas, which slides cannot typeset yet.
 */
function slideText(excerpt:string,section:ReportSection,content:EditorContent,outside:string):string{
  const labels=reportLabels(content.report),citations=referenceNumbers(content).numbers,where=section.title||'未命名章节';
  let text:string;
  if(section.body.includes(excerpt))text=resolveReferences(excerpt,labels,where,citations);
  else{
    // Match against the preview text, remembering where broken references were rendered.
    let shown='';const broken:[number,number][]=[];
    for(const segment of referenceSegments(section.body,labels,citations)){const start=shown.length;shown+=segment.text;if(segment.missing)broken.push([start,shown.length]);}
    let at=shown.indexOf(excerpt),clean=false;
    if(at<0)throw Error(outside);
    for(;at>=0;at=shown.indexOf(excerpt,at+1))if(!broken.some(([a,b])=>at<b&&at+excerpt.length>a)){clean=true;break;}
    if(!clean)throw Error(`「${where}」中有图表引用已失效，请先在正文重新插入引用。`);
    text=excerpt;
  }
  if(splitInlineMath(text).some(part=>part.math))throw Error('节选含行内公式，幻灯片暂不能排版行内公式；请改选不含公式的原文。');
  return text;
}
import {figureFor,projectPalette} from './report-figure.ts';

export type ReportSlideLink = { version: 1|2|3; sectionId: string; sectionHash: string; slideHash: string; sources?:{sectionId:string;sectionHash:string;blockIds:string[]}[] };
export const STORY_JOBS = { problem: '界定问题', design: '说明调查', finding: '呈现发现', action: '提出行动', limitation: '说明边界' } as const;
export const STORY_CLASSES = { user_provided: '用户材料，尚待核验', proposed: '拟议方案，尚未执行', simulated: '教学模拟，非真实调研', inferred: '推断解释，需注明依据' } as const;
export type StorySourceSelection = {sectionId:string;blockIds:string[]};
export type StoryCard = { id: string; sectionId: string; job: keyof typeof STORY_JOBS; classification: keyof typeof STORY_CLASSES; title: string; excerpt: string; limitation: string; implication: string; locator: string; seconds: number; sources?:StorySourceSelection[] };
export type LinkState = 'unlinked' | 'current' | 'report_changed' | 'slide_changed' | 'missing_source';
export const LINK_LABELS: Record<LinkState,string> = { unlinked: '未建立报告关联', current: '关联指纹匹配，内容仍需人工核验', report_changed: '报告依据已变化，请重新制作此页', slide_changed: '页面已修改，请重新核对依据与边界', missing_source: '关联章节已移除，请重新选择依据' };

export function parseReportSlideLink(value: unknown): ReportSlideLink {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw Error('报告关联结构无效。');
  const x=value as Record<string,unknown>;
  if (Object.keys(x).some(k=>!['version','sectionId','sectionHash','slideHash','sources'].includes(k)) || ![1,2,3].includes(x.version as number) || typeof x.sectionId!=='string' || !x.sectionId.trim() || x.sectionId.length>80 || /[\u0000-\u001f\u007f\p{Surrogate}]/u.test(x.sectionId) || typeof x.sectionHash!=='string' || !/^[a-f0-9]{64}$/.test(x.sectionHash) || typeof x.slideHash!=='string' || !/^[a-f0-9]{64}$/.test(x.slideHash)) throw Error('报告关联版本或指纹无效。');
  if(x.version!==3&&Object.hasOwn(x,'sources'))throw Error('旧关联不支持多来源。');
  const sources=x.version===3?parseLinkSources(x.sources):undefined;
  if(sources&&(sources[0].sectionId!==x.sectionId||sources[0].sectionHash!==x.sectionHash))throw Error('主来源与来源清单不一致。');
  return {version:x.version as 1|2|3,sectionId:x.sectionId,sectionHash:x.sectionHash,slideHash:x.slideHash,...(sources?{sources}:{})};
}
function parseLinkSources(value:unknown){if(!Array.isArray(value)||!value.length||value.length>12)throw Error('页面来源数量无效。');const sources=value.map(v=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==3||Object.keys(v).some(k=>!['sectionId','sectionHash','blockIds'].includes(k)))throw Error('页面来源无效。');const x=v as Record<string,unknown>;const parsed=parseReportSlideLink({version:2,sectionId:x.sectionId,sectionHash:x.sectionHash,slideHash:x.sectionHash});if(!Array.isArray(x.blockIds)||x.blockIds.length>60||x.blockIds.some(id=>typeof id!=='string'||!id.trim()||id.length>80||/[\u0000-\u001f\p{Surrogate}]/u.test(id))||new Set(x.blockIds).size!==x.blockIds.length)throw Error('内容块引用无效。');return {sectionId:parsed.sectionId,sectionHash:parsed.sectionHash,blockIds:x.blockIds as string[]};});if(new Set(sources.map(s=>s.sectionId)).size!==sources.length)throw Error('页面来源重复。');return sources;}
async function fingerprint(value: unknown, ordered=false): Promise<string> {
  const order=(item:unknown):unknown=>Array.isArray(item)?item.map(order):item!==null&&typeof item==='object'?Object.fromEntries(Object.keys(item).sort().map(key=>[key,order((item as Record<string,unknown>)[key])])):item;
  const bytes=new TextEncoder().encode(JSON.stringify(ordered?order(value):value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
const sectionValue=(s:ReportSection)=>({id:s.id,title:s.title,body:s.body,source:s.source});
const slideValue=(s:Slide)=>({title:s.title,body:s.body,aside:s.aside,notes:s.notes,layout:s.layout});
const richSectionValue=(s:ReportSection,c:EditorContent,withVisuals=Boolean(s.blocks?.some(b=>b.figureId)))=>({
  ...sectionValue(s),blocks:s.blocks??[],findingIds:s.findingIds??[],findingSnapshots:(s.findingIds??[]).map(id=>[id,s.findingSnapshots?.[id]??null]),
  results:[...new Set((s.blocks??[]).filter(b=>['chart','table'].includes(b.kind)).map(b=>b.evidenceId))].map(id=>c.quality?.results.find(r=>r.id===id)??null),
  findings:(s.findingIds??[]).map(id=>{const f=c.quality?.findings.find(f=>f.id===id);return f?[id,findingSignature(f),f.status,f.evidenceIds.map(e=>[e,f.confirmedHashes[e]??null,c.quality?.results.find(r=>r.id===e)?.resultHash??null])]:[id,null];}),
  ...(withVisuals?{figures:(s.blocks??[]).filter(b=>b.figureId).map(b=>c.figures?.find(f=>f.id===b.figureId)??null),visualStyle:c.visualStyle??null}:{}),
});
const richSlideValue=(s:Slide)=>({...slideValue(s),objects:s.objects??null});
/** Frozen linkage records editing provenance, not approval of a scientific claim. */
export async function bindReportSlide(content:EditorContent,slide:Slide,sectionId:string):Promise<Slide>{
  const c=structuredClone(content),s=structuredClone(slide),section=c.report.find(r=>r.id===sectionId);
  if(!section)throw Error('关联章节不存在。');
  if(c.version===3)return bindReportSlideSources(c,s,[{sectionId,blockIds:(section.blocks??[]).filter(b=>['chart','table'].includes(b.kind)).map(b=>b.id)}]);
  return {...s,reportLink:{version:c.version===2?2:1,sectionId,sectionHash:await fingerprint(c.version===2?richSectionValue(section,c):sectionValue(section)),slideHash:await fingerprint(c.version===2?richSlideValue(s):slideValue(s))}};
}
export async function bindReportSlideSources(content:EditorContent,slide:Slide,refs:{sectionId:string;blockIds:string[]}[]):Promise<Slide>{
 const c=structuredClone(content),s=structuredClone(slide);if(c.version!==3||!refs.length||refs.length>12||new Set(refs.map(r=>r.sectionId)).size!==refs.length)throw Error('请为 v3 页面选择不同章节来源。');
 const sources=[];for(const ref of refs){const section=c.report.find(r=>r.id===ref.sectionId);if(!section||ref.blockIds.some(id=>!section.blocks?.some(b=>b.id===id)))throw Error('关联章节或内容块不存在。');sources.push({sectionId:ref.sectionId,sectionHash:await fingerprint(richSectionValue(section,c,true),true),blockIds:[...ref.blockIds]});}
 const reportLink=parseReportSlideLink({version:3,sectionId:sources[0].sectionId,sectionHash:sources[0].sectionHash,slideHash:await fingerprint(richSlideValue(s),true),sources});return {...s,reportLink};
}
export async function reportLinkState(content: EditorContent, slide: Slide): Promise<LinkState> {
  if (!slide.reportLink) return 'unlinked';
  if(slide.reportLink.version===3){const link=parseReportSlideLink(slide.reportLink);for(const ref of link.sources!){const section=content.report.find(s=>s.id===ref.sectionId);if(!section||ref.blockIds.some(id=>!section.blocks?.some(b=>b.id===id)))return 'missing_source';if(await fingerprint(richSectionValue(section,content,true),true)!==ref.sectionHash)return 'report_changed';}return await fingerprint(richSlideValue(slide),true)===link.slideHash?'current':'slide_changed';}
  const link=parseReportSlideLink(slide.reportLink),section=content.report.find(s=>s.id===link.sectionId);
  if(!section)return 'missing_source';
  if(await fingerprint(link.version===2?richSectionValue(section,content):sectionValue(section))!==link.sectionHash)return 'report_changed';
  if(await fingerprint(link.version===2?richSlideValue(slide):slideValue(slide))!==link.slideHash)return 'slide_changed';
  return 'current';
}
export type ReportLinkWarning = {page:number;state:Exclude<LinkState,'current'|'unlinked'>|'check_failed'};
/** Checks a detached export snapshot; a failed check is never a passing check. */
export async function reportExportWarnings(content:EditorContent):Promise<ReportLinkWarning[]> {
  const snapshot=structuredClone(content),warnings:ReportLinkWarning[]=[];
  for(const [index,slide] of snapshot.slides.entries()){
    if(!slide.reportLink)continue;
    try{
      const state=await reportLinkState(snapshot,slide);
      if(state!=='current'&&state!=='unlinked')warnings.push({page:index+1,state});
    }catch{warnings.push({page:index+1,state:'check_failed'});}
  }
  return warnings;
}
export function blankStoryCard(sectionId:string,id=crypto.randomUUID()):StoryCard {
  return {id,sectionId,job:'finding',classification:'user_provided',title:'',excerpt:'',limitation:'',implication:'',locator:'',seconds:45};
}
/** Changing the narrative anchor reorders explicit selections; it never removes the old anchor. */
export function selectMainSources(sources:StorySourceSelection[],sectionId:string):StorySourceSelection[]{
  if(typeof sectionId!=='string'||!sectionId.trim()||sectionId.length>80||/[\u0000-\u001f\u007f\p{Surrogate}]/u.test(sectionId))throw Error('主讲章节无效。');
  const parsed=parseLinkSources(sources.map(s=>({...s,sectionHash:'0'.repeat(64)}))),selected=parsed.find(s=>s.sectionId===sectionId);
  const next=[selected??{sectionId,blockIds:[]},...parsed.filter(s=>s.sectionId!==sectionId)];
  if(next.length>12)throw Error('本页已有 12 个来源，请先移除一个来源后再添加主讲章节。');
  return next.map(s=>({sectionId:s.sectionId,blockIds:[...s.blockIds]}));
}
function required(value:string,label:string,max:number):string {
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))throw Error(`${label}需填写，最多 ${max} 字；超长内容请拆页，不会自动截断。`);
  return value;
}
/** Selection is explicit: a chapter can supply context, while only selected blocks enter the page. */
function storySources(content:EditorContent,card:StoryCard){
  const refs=card.sources;
  if(!Array.isArray(refs)||!refs.length||refs.length>12||refs[0]?.sectionId!==card.sectionId||new Set(refs.map(r=>r.sectionId)).size!==refs.length)throw Error('请选择 1 至 12 个不同来源，主讲章节须保留在首位。');
  return refs.map(ref=>{
    if(!ref||Object.keys(ref).some(k=>!['sectionId','blockIds'].includes(k))||!Array.isArray(ref.blockIds)||ref.blockIds.length>60||new Set(ref.blockIds).size!==ref.blockIds.length)throw Error('来源或内容块选择无效。');
    const section=content.report.find(s=>s.id===ref.sectionId);if(!section)throw Error('所选来源章节已移除，请重新选择。');
    const blocks=ref.blockIds.map(id=>{const block=section.blocks?.find(b=>b.id===id);if(!block)throw Error('所选内容块已移除，请重新选择。');if(block.kind==='formula')throw Error('公式请在成果编辑器中单独编排。');return block;});
    return {section,blocks};
  });
}
/** Editable chart/table objects reuse the exact report evidence and shared figure ID. */
async function composeStoryPage(content:EditorContent,card:StoryCard,slide:Slide):Promise<Slide>{
  const selected=storySources(content,card),visuals=selected.flatMap(s=>s.blocks.filter(b=>['chart','table'].includes(b.kind)).map(block=>({section:s.section,block}))),textBlocks=selected.flatMap(s=>s.blocks.filter(b=>!['chart','table'].includes(b.kind)));
  if(visuals.length>2)throw Error('一页最多组合 2 幅图表，请把其余图表拆到下一页。');
  if(selected.some(s=>s.section.body.includes('【教学模拟数据，不能作为实际调查结果】'))&&card.classification!=='simulated')throw Error('所选来源含教学模拟标记，请保留教学模拟类别。');
  if(visuals.length&&content.quality)await verifyResearchQuality(content.quality);
  for(const {block} of visuals){const result=resultFor(content.quality,block.evidenceId);if(result.classification==='simulated'&&card.classification!=='simulated')throw Error('所选图表含教学模拟结果，请保留教学模拟类别。');if(block.figureId)figureFor(content,block.figureId,block.evidenceId);}
  const extra=textBlocks.map(b=>required(b.text,'所选内容块',12000)).join('\n\n');
  const body=[slide.body,extra].filter(Boolean).join('\n\n');if(body.length>1800)throw Error('本页文字超过容量，请减少原文或把所选内容块拆页。');
  const notes=[slide.notes,`报告定位：${card.locator}`,...selected.slice(1).map(s=>`关联章节 ID：${s.section.id}\n${s.section.title}\n来源与说明（完整保留）：\n${s.section.source||'原章未填写来源，须补证'}`),...selected.map(s=>s.blocks.length?`已选内容块（${s.section.id}）：\n${s.blocks.map(b=>`${b.id}：${b.text}${b.figureId?`\n共享图形：${b.figureId}`:''}`).join('\n')}`:'')].filter(Boolean).join('\n\n');
  if(notes.length>6000)throw Error('本页完整来源超过讲稿容量，请分拆来源；不会截断来源记录。');
  const colors=content.visualStyle?projectPalette(content.visualStyle).colors:[{teal:'#0F766E',blue:'#234E80',burgundy:'#8A3449'}[content.accent]];
  const text=(value:string,x:number,y:number,width:number,height:number,fontSize:number,color='#233747',bold=false)=>makeSlideObject('text',{text:value,x,y,width,height,fontSize,color,bold});
  const objects:SlideObject[]=[text(slide.title,7,8,86,13,32,colors[0],true)];
  if(visuals.length){
    const wideTable=visuals.length===1&&visuals[0].block.kind==='table';
    visuals.forEach(({section,block},i)=>{const x=visuals.length===2?7+i*45:7,width=wideTable?86:visuals.length===2?41:54;const result=resultFor(content.quality,block.evidenceId),figure=block.figureId?figureFor(content,block.figureId,block.evidenceId):null;
      const caption=block.text||figure?.title||result.title;if(caption.length>120)throw Error('图表标题过长，请先精简报告图题，或单独编排此图表。');
      objects.push(text(caption,x,24,width,6,18,colors[0],true),makeSlideObject(block.kind as 'chart'|'table',{x,y:32,width,height:visuals.length===2||wideTable?42:55,fontSize:wideTable?17:18,color:colors[0],evidenceId:block.evidenceId,valueColumn:block.valueColumn,sourceBlockId:block.id,sourceSectionId:section.id,...(block.figureId?{figureId:block.figureId}:{})}));
    });
    const summary=body.replace(/\r?\n+/g,' ');
    objects.push(visuals.length===2||wideTable?text(summary,7,78,86,10,18):text(summary,66,24,27,63,18),text(`适用边界：${card.limitation}`,7,90,86,7,15,'#536677'));
  }else{
    objects.push(text(body,7,28,62,59,22),text(slide.aside,73,28,20,59,17,'#536677'));
  }
  const composed={...slide,body,notes,layout:(visuals.length===2?'comparison':visuals.length?'chart':'two-column') as Slide['layout'],objects};
  const bound=await bindReportSlideSources({...content,version:3},composed,selected.map(s=>({sectionId:s.section.id,blockIds:s.blocks.map(b=>b.id)})));
  // Existing export fit checks reject a crowded starting layout instead of shrinking its text.
  const {buildPptx}=await import('./editor-export.ts');
  try{await buildPptx({...content,version:3,report:selected.map(s=>s.section),slides:[bound]});}
  catch(error){throw Error(`本页暂不能清晰呈现，请减少文字、改为单图或拆页。${error instanceof Error?error.message:''}`);}
  return bound;
}
/** Deterministic assembly of user-selected, user-written content. No semantic approval. */
export async function buildStoryboard(content:EditorContent,cards:StoryCard[],mode:'append'|'replace'):Promise<Slide[]> {
  content=structuredClone(content);cards=structuredClone(cards);
  if(!['append','replace'].includes(mode)||!Array.isArray(cards)||cards.length<1||cards.length>40)throw Error('请添加 1 至 40 张分镜。');
  if((mode==='append'?content.slides.length:0)+cards.length>40)throw Error('生成后超过 40 页，请移除分镜或明确选择替换。');
  if(new Set(cards.map(c=>c.id)).size!==cards.length)throw Error('分镜标识重复。');
  const built:Slide[]=[];
  for(const [index,c] of cards.entries()){
    const section=content.report.find(s=>s.id===c.sectionId);
    if(!section)throw Error(`第 ${index+1} 页关联章节不存在，请重新选择。`);
    if(!Object.hasOwn(STORY_JOBS,c.job)||!Object.hasOwn(STORY_CLASSES,c.classification))throw Error('请选择页面任务和内容类别。');
    if(section.body.includes('【教学模拟数据，不能作为实际调查结果】')&&c.classification!=='simulated')throw Error('本章带有系统模拟数据标记，页面必须保留教学模拟类别。');
    if(!Number.isInteger(c.seconds)||c.seconds<10||c.seconds>300)throw Error('单页预计讲述时间为 10 至 300 秒，属于排练计划而非赛事规定。');
    const title=required(c.title,'页面标题',120),excerpt=required(c.excerpt,'报告原文节选',400),limitation=required(c.limitation,'适用边界',220),implication=required(c.implication,'意义或下一步',220),locator=required(c.locator,'版本 / 页表定位',160);
    const shown=slideText(excerpt,section,content,`第 ${index+1} 页节选不在当前章节原文中，请重新选择原文；解释请写入标题或下一步。`);
    const body=`【${STORY_CLASSES[c.classification]}】\n${shown}\n\n意义 / 下一步：${implication}`;
    const aside=`适用边界\n${limitation}\n\n报告定位\n${section.title || '未命名章节'}\n${locator}`;
    const notes=`页面任务：${STORY_JOBS[c.job]}\n预计讲述：${c.seconds} 秒（自行规划）\n关联章节 ID：${section.id}\n来源与说明（完整保留）：\n${section.source || '原章未填写来源，须补证'}\n\n本页由人工选择与改写，不代表证据已核验。报告关联指纹仅用于检测编辑变化。`;
    if(body.length>1800||aside.length>1800||notes.length>6000)throw Error(`第 ${index+1} 页超出编辑器容量，请拆页或精简人工填写部分。来源不会被截断。`);
    const slide:Slide={id:crypto.randomUUID(),title,body,aside,notes,layout:'two-column'};
    if(c.sources)built.push(await composeStoryPage(content,c,slide));
    else{slide.reportLink={version:1,sectionId:section.id,sectionHash:await fingerprint(sectionValue(section)),slideHash:await fingerprint(slideValue(slide))};built.push(slide);}
  }
  return mode==='append'?[...content.slides.map(s=>structuredClone(s)),...built]:built;
}

export type FigureCoverage={sectionId:string;blockId:string;title:string;state:'unused'|'current'|'review';pages:number[]};
/** Ownership is chapter-scoped. Legacy objects need an unambiguous structural match. */
export async function reportFigureCoverage(content:EditorContent):Promise<FigureCoverage[]>{
  const c=structuredClone(content),items=c.report.flatMap(section=>(section.blocks??[]).filter(block=>['chart','table'].includes(block.kind)).map(block=>({section,block}))),pages=new Map<string,{page:number;valid:boolean}[]>();
  const key=(sectionId:string,blockId:string)=>JSON.stringify([sectionId,blockId]);
  const matches=(o:SlideObject,b:typeof items[number]['block'])=>o.kind===b.kind&&o.evidenceId===b.evidenceId&&o.figureId===b.figureId&&(o.kind!=='chart'||o.valueColumn===b.valueColumn);
  for(const [index,slide] of c.slides.entries()){
    const link=slide.reportLink;
    const scoped=items.filter(({section,block})=>link?.version===3?link.sources?.some(s=>s.sectionId===section.id&&s.blockIds.includes(block.id)):link?.version===2&&link.sectionId===section.id);
    const seen=new Map<string,boolean[]>();
    for(const object of slide.objects??[]){
      if(!object.sourceBlockId)continue;
      const sameId=scoped.filter(s=>s.block.id===object.sourceBlockId);
      const exact=sameId.filter(s=>matches(object,s.block));
      const owned=object.sourceSectionId?sameId.filter(s=>s.section.id===object.sourceSectionId):null;
      const targets=owned??(exact.length?exact:sameId),unique=owned?owned.length===1:exact.length===1;
      for(const target of targets){const id=key(target.section.id,target.block.id),valid=unique&&object.opacity>0&&matches(object,target.block);seen.set(id,[...(seen.get(id)??[]),valid]);}
    }
    if(!seen.size)continue;
    let current=false;try{current=await reportLinkState(c,slide)==='current';}catch{/* A broken link cannot establish current coverage. */}
    for(const [id,states] of seen)pages.set(id,[...(pages.get(id)??[]),{page:index+1,valid:current&&states.every(Boolean)}]);
  }
  return items.map(({section,block})=>{const uses=pages.get(key(section.id,block.id))??[];return {sectionId:section.id,blockId:block.id,title:block.text||section.title,state:!uses.length?'unused':uses.every(p=>p.valid)?'current':'review',pages:uses.map(p=>p.page)};});
}
export async function buildReportBlockSlide(content:EditorContent,sectionId:string,blockId:string,excerpt?:string):Promise<Slide>{
  const c=structuredClone(content),section=c.report.find(s=>s.id===sectionId),block=section?.blocks?.find(b=>b.id===blockId);
  if(c.version===1||!section||!block||!['chart','table'].includes(block.kind))throw Error('请选择报告中的图表或表格。');
  if(c.slides.length>=40)throw Error('已有40页，请先整理页面。');
  const chosen=excerpt??section.body,outside='请从本章选择一段要讲述的原文，最多600字。';
  if(!chosen.trim()||chosen.length>600)throw Error(outside);
  const body=slideText(chosen,section,c,outside);
  if(c.quality)await verifyResearchQuality(c.quality);
  const {composeQualitySlide}=await import('./quality-layouts.ts');
  const slide=composeQualitySlide({id:crypto.randomUUID(),title:block.text||section.title,body,aside:'',notes:section.source,layout:block.kind==='table'?'comparison':'chart'},block.kind==='table'?'comparison':'chart',c.quality!,block.evidenceId);
  slide.objects=slide.objects?.map(o=>o.kind===block.kind?{...o,valueColumn:block.valueColumn,sourceBlockId:block.id,...(c.version===3?{sourceSectionId:section.id}:{}),...(block.figureId?{figureId:block.figureId}:{})}:o);
  const bound=await bindReportSlide(c,slide,section.id);
  const {buildPptx}=await import('./editor-export.ts');
  await buildPptx({...c,report:[section],slides:[bound]});
  return bound;
}
