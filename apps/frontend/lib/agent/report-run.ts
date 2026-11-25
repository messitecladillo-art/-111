import { createEditorContent, sectionProseText, type EditorContent } from '../editor-model.ts';
import { newQuestionnaire, type Questionnaire } from '../questionnaire.ts';
import type { DatasetValue } from '../canvas/execute.ts';
import { canonical } from '../questionnaire-mapping.ts';
import { DEFAULT_REPORT_FORMAT_SETTINGS, DEFAULT_REPORT_OPTIONS } from '../report-format.ts';

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
  const isSimulatedPack=source.dataset?.kind==='simulated'&&results.length>0&&results.every(result=>result.classification==='simulated');
  // A visual or layout choice belongs to the author, even when the data is a teaching simulation; untouched teaching pack defaults stay replaceable.
  if(source.report){
    const r=source.report;
    const defaultDemoFormat=canonical({...DEFAULT_REPORT_FORMAT_SETTINGS,profileId:'btbu-17-report-layout-v1',options:{...DEFAULT_REPORT_OPTIONS,includeCover:true,includeToc:true}});
    const authoredArt=Boolean(r.coverImage||r.frameImage||r.figurePalette);
    const authoredFrame=Boolean(r.reportFrame&&(!isSimulatedPack||r.reportFrame.review?.reviewer!=='EVI-X 教学演示'));
    const authoredStyle=Boolean(r.visualStyle&&(!isSimulatedPack||r.visualStyle.paletteId!=='teal'||r.visualStyle.version!==1));
    const authoredFormat=Boolean(r.reportFormat&&(!isSimulatedPack||(canonical(r.reportFormat)!==defaultDemoFormat&&canonical(r.reportFormat)!==canonical(DEFAULT_REPORT_FORMAT_SETTINGS))));
    if(authoredArt||authoredFrame||authoredStyle||authoredFormat||r.accent!==blank.accent)return true;
  }
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
    if(old&&old.title!==section.title)details.push(`标题由“${old.title}”改为“${section.title}”。`);
    if(old&&old.source!==section.source)details.push(`资料出处由“${old.source||'未填写'}”改为“${section.source||'未填写'}”。`);
    if(old&&canonical(old.blocks??[])!==canonical(section.blocks??[]))details.push('图表或结构化内容发生变化，请打开章节核对。');
    if(old&&canonical(old.findingIds??[])!==canonical(section.findingIds??[]))details.push('章节关联的研究发现发生变化。');
    return [{sectionId:section.id,title:section.title,before:old?sectionProseText(old):'',after:sectionProseText(section),changeType:old?'updated' as const:'added' as const,details}];
  });
  for(const section of before.report)if(!after.report.some(item=>item.id===section.id))changes.push({sectionId:section.id,title:section.title,before:sectionProseText(section),after:'',changeType:'removed',details:['候选稿不包含此原稿章节。锁定后会保留原稿内容。']});
  return changes;
}
export function mergeReportCandidate(current:EditorContent,candidate:EditorContent,lockedSectionIds:readonly string[]):EditorContent{
  const locked=new Set(lockedSectionIds),previous=new Map(current.report.map(section=>[section.id,section]));
  const report=candidate.report.flatMap(section=>locked.has(section.id)?previous.has(section.id)?[structuredClone(previous.get(section.id)!)]:[]:[section]);
  current.report.forEach((section,index)=>{if(locked.has(section.id)&&!report.some(item=>item.id===section.id))report.splice(Math.min(index,report.length),0,structuredClone(section));});

  const retained=report.filter(section=>locked.has(section.id)&&previous.has(section.id));
  if(!retained.length)return {...candidate,report};

  const candidateResults=candidate.quality?.results??[];
  const resultMap=new Map(candidateResults.map(r=>[r.id,r]));
  const currentResultMap=new Map((current.quality?.results??[]).map(r=>[r.id,r]));
  const mergedResults=[...candidateResults];
  const ensureResult=(id:string)=>{
    if(!id||resultMap.has(id))return;
    const found=currentResultMap.get(id);
    if(found&&mergedResults.length<120){resultMap.set(id,found);mergedResults.push(found);}
  };

  const candidateFigures=candidate.figures??[];
  const figureMap=new Map(candidateFigures.map(f=>[f.id,f]));
  const currentFigureMap=new Map((current.figures??[]).map(f=>[f.id,f]));
  const mergedFigures=[...candidateFigures];

  for(const section of retained){
    for(const block of section.blocks??[]){
      if(block.kind==='chart'||block.kind==='table')ensureResult(block.evidenceId);
      if(block.figureId){
        if(!figureMap.has(block.figureId)){
          const fig=currentFigureMap.get(block.figureId);
          ensureResult(fig?.resultId??'');
          const target=fig?resultMap.get(fig.resultId):undefined;
          if(fig&&target&&target.resultHash===fig.resultHash&&target.n===fig.n&&fig.resultId===block.evidenceId&&mergedFigures.length<120){
            figureMap.set(fig.id,fig);
            mergedFigures.push(fig);
          }else{
            delete block.figureId;
          }
        }else{
          const fig=figureMap.get(block.figureId)!;
          const target=resultMap.get(fig.resultId);
          if(!target||target.resultHash!==fig.resultHash||target.n!==fig.n||fig.resultId!==block.evidenceId){
            delete block.figureId;
          }
        }
      }
    }
  }

  const candidateFindings=candidate.quality?.findings??[];
  const findingMap=new Map(candidateFindings.map(f=>[f.id,f]));
  const currentFindingMap=new Map((current.quality?.findings??[]).map(f=>[f.id,f]));
  const mergedFindings=[...candidateFindings];
  for(const section of retained){
    if(!section.findingIds?.length)continue;
    for(const fid of section.findingIds){
      if(findingMap.has(fid))continue;
      const found=currentFindingMap.get(fid);
      if(found){
        found.evidenceIds.forEach(ensureResult);
        if(found.evidenceIds.every(eid=>resultMap.has(eid))){
          findingMap.set(fid,found);
          mergedFindings.push(found);
        }
      }
    }
  }

  const addedQuality=mergedResults.length>candidateResults.length||mergedFindings.length>candidateFindings.length;
  const addedFigures=mergedFigures.length>candidateFigures.length;
  let version=candidate.version;
  if(addedFigures&&version<3)version=3;
  else if(addedQuality&&version<2)version=2;

  return {
    ...candidate,
    version,
    report,
    ...(addedQuality||candidate.quality?{quality:{version:1,results:mergedResults,findings:mergedFindings}}:{}),
    ...(addedFigures?{figures:mergedFigures,...(!candidate.visualStyle&&current.visualStyle?{visualStyle:current.visualStyle}:{})}:{}),
  };
}
export function canAcceptReportCandidate(input:{sourceKey:string;currentSource:ReportRunSource;status:'draft'|'needs_review'|'blocked';pending:boolean}):boolean{
  return !input.pending&&!input.currentSource.inputPending&&input.status!=='blocked'&&input.sourceKey===reportSourceKey(input.currentSource);
}
