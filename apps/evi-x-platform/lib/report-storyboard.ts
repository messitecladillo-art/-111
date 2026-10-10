import type { EditorContent, ReportSection, Slide } from './editor-model.ts';

export type ReportSlideLink = { version: 1; sectionId: string; sectionHash: string; slideHash: string };
export const STORY_JOBS = { problem: '界定问题', design: '说明调查', finding: '呈现发现', action: '提出行动', limitation: '说明边界' } as const;
export const STORY_CLASSES = { user_provided: '用户材料，尚待核验', proposed: '拟议方案，尚未执行', simulated: '教学模拟，非真实调研', inferred: '推断解释，需注明依据' } as const;
export type StoryCard = { id: string; sectionId: string; job: keyof typeof STORY_JOBS; classification: keyof typeof STORY_CLASSES; title: string; excerpt: string; limitation: string; implication: string; locator: string; seconds: number };
export type LinkState = 'unlinked' | 'current' | 'report_changed' | 'slide_changed' | 'missing_source';
export const LINK_LABELS: Record<LinkState,string> = { unlinked: '未建立报告关联', current: '关联指纹匹配，内容仍需人工核验', report_changed: '报告依据已变化，请重新制作此页', slide_changed: '页面已修改，请重新核对依据与边界', missing_source: '关联章节已移除，请重新选择依据' };

export function parseReportSlideLink(value: unknown): ReportSlideLink {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw Error('报告关联结构无效。');
  const x=value as Record<string,unknown>;
  if (Object.keys(x).some(k=>!['version','sectionId','sectionHash','slideHash'].includes(k)) || x.version!==1 || typeof x.sectionId!=='string' || !x.sectionId.trim() || x.sectionId.length>80 || /[\u0000-\u001f\u007f]/u.test(x.sectionId) || typeof x.sectionHash!=='string' || !/^[a-f0-9]{64}$/.test(x.sectionHash) || typeof x.slideHash!=='string' || !/^[a-f0-9]{64}$/.test(x.slideHash)) throw Error('报告关联版本或指纹无效。');
  return {version:1,sectionId:x.sectionId,sectionHash:x.sectionHash,slideHash:x.slideHash};
}
async function fingerprint(value: unknown): Promise<string> {
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
const sectionValue=(s:ReportSection)=>({id:s.id,title:s.title,body:s.body,source:s.source});
const slideValue=(s:Slide)=>({title:s.title,body:s.body,aside:s.aside,notes:s.notes,layout:s.layout});
export async function reportLinkState(content: EditorContent, slide: Slide): Promise<LinkState> {
  if (!slide.reportLink) return 'unlinked';
  const link=parseReportSlideLink(slide.reportLink),section=content.report.find(s=>s.id===link.sectionId);
  if(!section)return 'missing_source';
  if(await fingerprint(sectionValue(section))!==link.sectionHash)return 'report_changed';
  if(await fingerprint(slideValue(slide))!==link.slideHash)return 'slide_changed';
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
    if(!section.body.includes(excerpt))throw Error(`第 ${index+1} 页节选不在当前章节原文中，请重新选择原文；解释请写入标题或下一步。`);
    const body=`【${STORY_CLASSES[c.classification]}】\n${excerpt}\n\n意义 / 下一步：${implication}`;
    const aside=`适用边界\n${limitation}\n\n报告定位\n${section.title || '未命名章节'}\n${locator}`;
    const notes=`页面任务：${STORY_JOBS[c.job]}\n预计讲述：${c.seconds} 秒（自行规划）\n关联章节 ID：${section.id}\n来源与说明（完整保留）：\n${section.source || '原章未填写来源，须补证'}\n\n本页由人工选择与改写，不代表证据已核验。报告关联指纹仅用于检测编辑变化。`;
    if(body.length>1800||aside.length>1800||notes.length>6000)throw Error(`第 ${index+1} 页超出编辑器容量，请拆页或精简人工填写部分。来源不会被截断。`);
    const slide:Slide={id:crypto.randomUUID(),title,body,aside,notes,layout:'two-column'};
    slide.reportLink={version:1,sectionId:section.id,sectionHash:await fingerprint(sectionValue(section)),slideHash:await fingerprint(slideValue(slide))};
    built.push(slide);
  }
  return mode==='append'?[...content.slides.map(s=>structuredClone(s)),...built]:built;
}
