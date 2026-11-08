import { createEditorContent, type EditorContent } from '../editor-model.ts';
import { newQuestionnaire, type Questionnaire } from '../questionnaire.ts';
import type { DatasetValue } from '../canvas/execute.ts';
import { canonical } from '../questionnaire-mapping.ts';

export type ReportRunSource={design:Questionnaire|null;dataset:DatasetValue|null;report:EditorContent|null;inputPending?:boolean};
export type ReportChange={sectionId:string;title:string;before:string;after:string;changeType:'added'|'updated'|'removed';details?:string[]};
export function reportSourceKey(source:ReportRunSource):string{return canonical(source);}
export async function reportInputRevision(value:unknown):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
/** Teaching packs may fill an empty workspace or an existing teaching study. */
export function hasUserResearchSource(source:ReportRunSource):boolean{
  const results=source.report?.quality?.results??[];
  if(source.inputPending||source.dataset?.kind==='user_provided'||results.some(result=>result.classification!=='simulated'))return true;
  const blank=createEditorContent();
  // A visual or layout choice belongs to the author, even when the data is a teaching simulation.
  if(source.report&&(source.report.reportFrame||source.report.visualStyle||source.report.reportFormat||source.report.accent!==blank.accent))return true;
  if(source.dataset?.kind==='simulated')return false;
  if(source.design&&canonical(source.design)!==canonical(newQuestionnaire()))return true;
  if(!source.report)return false;
  return source.report.title!==blank.title||source.report.subtitle!==blank.subtitle||source.report.report.length!==blank.report.length
    ||source.report.report.some((section,index)=>section.title!==blank.report[index]?.title||section.body!==blank.report[index]?.body||!!section.source.trim()||!!section.blocks?.length)
    ||canonical(source.report.slides)!==canonical(blank.slides)||!!source.report.latex?.body.trim()||!!source.report.figures?.length||!!source.report.references?.length;
}
export function reportChanges(before:EditorContent,after:EditorContent):ReportChange[]{
  const previous=new Map(before.report.map(section=>[section.id,section]));
  const changes:ReportChange[]=after.report.flatMap(section=>{
    const old=previous.get(section.id);if(old&&canonical(old)===canonical(section))return [];
    const details:string[]=[];
    if(old&&old.title!==section.title)details.push(`标题由「${old.title}」改为「${section.title}」。`);
    if(old&&old.source!==section.source)details.push(`资料出处由「${old.source||'未填写'}」改为「${section.source||'未填写'}」。`);
    if(old&&canonical(old.blocks??[])!==canonical(section.blocks??[]))details.push('图表或结构化内容发生变化，请打开章节核对。');
    if(old&&canonical(old.findingIds??[])!==canonical(section.findingIds??[]))details.push('章节关联的研究发现发生变化。');
    return [{sectionId:section.id,title:section.title,before:old?.body??'',after:section.body,changeType:old?'updated' as const:'added' as const,details}];
  });
  for(const section of before.report)if(!after.report.some(item=>item.id===section.id))changes.push({sectionId:section.id,title:section.title,before:section.body,after:'',changeType:'removed',details:['候选稿不包含此原稿章节。锁定后会保留原稿内容。']});
  return changes;
}
export function mergeReportCandidate(current:EditorContent,candidate:EditorContent,lockedSectionIds:readonly string[]):EditorContent{
  const locked=new Set(lockedSectionIds),previous=new Map(current.report.map(section=>[section.id,section]));
  const report=candidate.report.flatMap(section=>locked.has(section.id)?previous.has(section.id)?[previous.get(section.id)!]:[]:[section]);
  current.report.forEach((section,index)=>{if(locked.has(section.id)&&!report.some(item=>item.id===section.id))report.splice(Math.min(index,report.length),0,section);});
  return {...candidate,report};
}
export function canAcceptReportCandidate(input:{sourceKey:string;currentSource:ReportRunSource;status:'draft'|'needs_review'|'blocked';pending:boolean}):boolean{
  return !input.pending&&!input.currentSource.inputPending&&input.status!=='blocked'&&input.sourceKey===reportSourceKey(input.currentSource);
}
