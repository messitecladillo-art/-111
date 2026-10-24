import type { EditorContent, ReportSection, Slide } from './editor-model.ts';
import {findingSignature,verifyResearchQuality} from './research-quality.ts';
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

export type ReportSlideLink = { version: 1|2; sectionId: string; sectionHash: string; slideHash: string };
export const STORY_JOBS = { problem: '界定问题', design: '说明调查', finding: '呈现发现', action: '提出行动', limitation: '说明边界' } as const;
export const STORY_CLASSES = { user_provided: '用户材料，尚待核验', proposed: '拟议方案，尚未执行', simulated: '教学模拟，非真实调研', inferred: '推断解释，需注明依据' } as const;
export type StoryCard = { id: string; sectionId: string; job: keyof typeof STORY_JOBS; classification: keyof typeof STORY_CLASSES; title: string; excerpt: string; limitation: string; implication: string; locator: string; seconds: number };
export type LinkState = 'unlinked' | 'current' | 'report_changed' | 'slide_changed' | 'missing_source';
export const LINK_LABELS: Record<LinkState,string> = { unlinked: '未建立报告关联', current: '关联指纹匹配，内容仍需人工核验', report_changed: '报告依据已变化，请重新制作此页', slide_changed: '页面已修改，请重新核对依据与边界', missing_source: '关联章节已移除，请重新选择依据' };

export function parseReportSlideLink(value: unknown): ReportSlideLink {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw Error('报告关联结构无效。');
  const x=value as Record<string,unknown>;
  if (Object.keys(x).some(k=>!['version','sectionId','sectionHash','slideHash'].includes(k)) || ![1,2].includes(x.version as number) || typeof x.sectionId!=='string' || !x.sectionId.trim() || x.sectionId.length>80 || /[\u0000-\u001f\u007f\p{Surrogate}]/u.test(x.sectionId) || typeof x.sectionHash!=='string' || !/^[a-f0-9]{64}$/.test(x.sectionHash) || typeof x.slideHash!=='string' || !/^[a-f0-9]{64}$/.test(x.slideHash)) throw Error('报告关联版本或指纹无效。');
  return {version:x.version as 1|2,sectionId:x.sectionId,sectionHash:x.sectionHash,slideHash:x.slideHash};
}
async function fingerprint(value: unknown): Promise<string> {
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
const sectionValue=(s:ReportSection)=>({id:s.id,title:s.title,body:s.body,source:s.source});
const slideValue=(s:Slide)=>({title:s.title,body:s.body,aside:s.aside,notes:s.notes,layout:s.layout});
const richSectionValue=(s:ReportSection,c:EditorContent)=>({
  ...sectionValue(s),blocks:s.blocks??[],findingIds:s.findingIds??[],findingSnapshots:(s.findingIds??[]).map(id=>[id,s.findingSnapshots?.[id]??null]),
  results:[...new Set((s.blocks??[]).filter(b=>['chart','table'].includes(b.kind)).map(b=>b.evidenceId))].map(id=>c.quality?.results.find(r=>r.id===id)??null),
  findings:(s.findingIds??[]).map(id=>{const f=c.quality?.findings.find(f=>f.id===id);return f?[id,findingSignature(f),f.status,f.evidenceIds.map(e=>[e,f.confirmedHashes[e]??null,c.quality?.results.find(r=>r.id===e)?.resultHash??null])]:[id,null];}),
});
const richSlideValue=(s:Slide)=>({...slideValue(s),objects:s.objects??null});
/** Frozen linkage records editing provenance, not approval of a scientific claim. */
export async function bindReportSlide(content:EditorContent,slide:Slide,sectionId:string):Promise<Slide>{
  const c=structuredClone(content),s=structuredClone(slide),section=c.report.find(r=>r.id===sectionId);
  if(!section)throw Error('关联章节不存在。');
  return {...s,reportLink:{version:c.version===2?2:1,sectionId,sectionHash:await fingerprint(c.version===2?richSectionValue(section,c):sectionValue(section)),slideHash:await fingerprint(c.version===2?richSlideValue(s):slideValue(s))}};
}
export async function reportLinkState(content: EditorContent, slide: Slide): Promise<LinkState> {
  if (!slide.reportLink) return 'unlinked';
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
function required(value:string,label:string,max:number):string {
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))throw Error(`${label}需填写，最多 ${max} 字；超长内容请拆页，不会自动截断。`);
  return value;
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
    slide.reportLink={version:1,sectionId:section.id,sectionHash:await fingerprint(sectionValue(section)),slideHash:await fingerprint(slideValue(slide))};
    built.push(slide);
  }
  return mode==='append'?[...content.slides.map(s=>structuredClone(s)),...built]:built;
}

export type FigureCoverage={sectionId:string;blockId:string;title:string;state:'unused'|'current'|'review';pages:number[]};
/** A matching source ID alone is insufficient: type, input and numeric column must match. */
export async function reportFigureCoverage(content:EditorContent):Promise<FigureCoverage[]>{
  const c=structuredClone(content),out:FigureCoverage[]=[];
  for(const section of c.report)for(const block of section.blocks??[]){
    if(!['chart','table'].includes(block.kind))continue;
    const pages:number[]=[],states:boolean[]=[];
    for(const [i,slide] of c.slides.entries()){
      if(slide.reportLink?.version!==2||slide.reportLink.sectionId!==section.id)continue;
      const refs=(slide.objects??[]).filter(o=>o.sourceBlockId===block.id);
      if(!refs.length)continue;
      pages.push(i+1);
      states.push(refs.every(o=>o.opacity>0&&o.kind===block.kind&&o.evidenceId===block.evidenceId&&(o.kind!=='chart'||o.valueColumn===block.valueColumn))&&await reportLinkState(c,slide)==='current');
    }
    out.push({sectionId:section.id,blockId:block.id,title:block.text||section.title,state:!pages.length?'unused':states.every(Boolean)?'current':'review',pages});
  }
  return out;
}
export async function buildReportBlockSlide(content:EditorContent,sectionId:string,blockId:string,excerpt?:string):Promise<Slide>{
  const c=structuredClone(content),section=c.report.find(s=>s.id===sectionId),block=section?.blocks?.find(b=>b.id===blockId);
  if(c.version!==2||!section||!block||!['chart','table'].includes(block.kind))throw Error('请选择报告中的图表或表格。');
  if(c.slides.length>=40)throw Error('已有40页，请先整理页面。');
  const chosen=excerpt??section.body,outside='请从本章选择一段要讲述的原文，最多600字。';
  if(!chosen.trim()||chosen.length>600)throw Error(outside);
  const body=slideText(chosen,section,c,outside);
  if(c.quality)await verifyResearchQuality(c.quality);
  const {composeQualitySlide}=await import('./quality-layouts.ts');
  const slide=composeQualitySlide({id:crypto.randomUUID(),title:block.text||section.title,body,aside:'',notes:section.source,layout:block.kind==='table'?'comparison':'chart'},block.kind==='table'?'comparison':'chart',c.quality!,block.evidenceId);
  slide.objects=slide.objects?.map(o=>o.kind===block.kind?{...o,valueColumn:block.valueColumn,sourceBlockId:block.id}:o);
  const bound=await bindReportSlide(c,slide,section.id);
  const {buildPptx}=await import('./editor-export.ts');
  await buildPptx({...c,report:[section],slides:[bound]});
  return bound;
}
