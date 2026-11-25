import { sectionProseText, type EditorContent, type ReportSection, type Slide } from './editor-model.ts';
import {findingSignature,makeSlideObject,resultFor,type SlideObject,verifyResearchQuality} from './research-quality.ts';
import {referenceSegments,reportLabels,resolveReferences} from './report-numbering.ts';
import {referenceNumbers} from './references.ts';
import {splitInlineMath} from './inline-math.ts';
import {normalizeAcademicPunctuation,normalizePaperProse} from './typography.ts';
const SUPERSCRIPTS: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻' };
const SUBSCRIPTS: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '⁷', '8': '⁸', '9': '₉', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', n: 'ₙ' };
const GREEK_AND_OPS: ReadonlyArray<[RegExp, string]> = [
  [/\\alpha\b/gu, 'α'], [/\\beta\b/gu, 'β'], [/\\gamma\b/gu, 'γ'], [/\\delta\b/gu, 'δ'], [/\\Delta\b/gu, 'Δ'],
  [/\\chi\b/gu, 'χ'], [/\\lambda\b/gu, 'λ'], [/\\mu\b/gu, 'μ'], [/\\sigma\b/gu, 'σ'], [/\\rho\b/gu, 'ρ'],
  [/\\tau\b/gu, 'τ'], [/\\theta\b/gu, 'θ'], [/\\eta\b/gu, 'η'], [/\\var(?:epsilon)\b|\\epsilon\b/gu, 'ε'],
  [/\\omega\b/gu, 'ω'], [/\\pi\b/gu, 'π'], [/\\Phi\b/gu, 'Φ'], [/\\phi\b/gu, 'φ'],
  [/\\leq?\b/gu, '≤'], [/\\geq?\b/gu, '≥'], [/\\neq?\b/gu, '≠'], [/\\approx\b/gu, '≈'], [/\\sim\b/gu, '~'],
  [/\\pm\b/gu, '±'], [/\\times\b/gu, '×'], [/\\cdot\b/gu, '·'], [/\\rightarrow\b|\\to\b/gu, '→'],
  [/\\%/gu, '%'], [/\\‰/gu, '‰'],
];

function texMathToPlain(tex: string): string {
  let out = tex.trim();
  out = out.replace(/\\(?:text|mathrm|mathbf|mathit)\{([^}]*)\}/gu, '$1');
  out = out.replace(/\\bar\{([A-Za-z\u0370-\u03ff])\}/gu, '$1\u0304');
  out = out.replace(/\\hat\{([A-Za-z\u0370-\u03ff])\}/gu, '$1\u0302');
  out = out.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/gu, (_, a: string, b: string) =>
    /^[A-Za-z0-9.]+$/u.test(a.trim()) && /^[A-Za-z0-9.]+$/u.test(b.trim()) ? `${a.trim()}/${b.trim()}` : `(${a.trim()})/(${b.trim()})`,
  );
  for (const [pattern, replacement] of GREEK_AND_OPS) out = out.replace(pattern, replacement as string);
  out = out.replace(/\^\{([0-9+-]+)\}/gu, (_, s: string) => [...s].map(ch => SUPERSCRIPTS[ch] ?? ch).join(''));
  out = out.replace(/\^([0-9+-])/gu, (_, ch: string) => SUPERSCRIPTS[ch] ?? `^${ch}`);
  out = out.replace(/_\{([0-9ijkn]+)\}/gu, (_, s: string) => [...s].map(ch => SUBSCRIPTS[ch] ?? ch).join(''));
  out = out.replace(/_\{([^}]+)\}/gu, '($1)');
  out = out.replace(/_([0-9ijkn])/gu, (_, ch: string) => SUBSCRIPTS[ch] ?? `_${ch}`);
  out = out.replace(/[{}]/gu, '').replace(/\\([A-Za-z]+)/gu, '$1');
  out = out.replace(/\s*([=≤≥≠≈<>])\s*/gu, ' $1 ');
  return out.replace(/\s+/gu, ' ').trim();
}

/** Formats inline `$...$` expressions into clean Unicode/plain text suitable for slides and `.pptx` export. */
export function formatSlideInlineMath(raw: string): string {
  if (!raw.includes('$')) return raw;
  return splitInlineMath(raw)
    .map(part => (part.math ? texMathToPlain(part.text) : part.text))
    .join('');
}

function cleanSlideReferencePreview(raw: string, content: EditorContent): string {
  const labels = reportLabels(content.report);
  const citations = referenceNumbers(content).numbers;
  const resolved = referenceSegments(raw, labels, citations)
    .map(seg => (seg.missing ? '' : seg.text))
    .join('');
  return formatSlideInlineMath(resolved).replace(/\s+/gu, ' ').trim();
}

/** Picks a clean, math-formatted default slide excerpt from a section (including V2 block-interleaved prose). */
export function defaultSlideExcerptForSection(section: ReportSection, content: EditorContent, maxChars = 360): string {
  const paragraphs = sectionProseText(section)
    .split(/\r?\n+/)
    .map(line => line.trim())
    .filter(line => line && !/^【教学模拟数据/u.test(line) && !/^注[：:]/u.test(line));
  const candidate = paragraphs[0] ?? section.body.trim() ?? sectionProseText(section).trim();
  if (!candidate) return '';
  const cleaned = cleanSlideReferencePreview(candidate, content);
  if (cleaned.length <= maxChars) return cleaned;
  const cut = cleaned.slice(0, maxChars);
  const endPunct = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('；'), cut.lastIndexOf('！'), maxChars <= 120 ? cut.lastIndexOf('，') : -1);
  const minCut = Math.min(60, Math.floor(maxChars * 0.4));
  return endPunct >= minCut ? cut.slice(0, endPunct + (cut[endPunct] === '，' ? 0 : 1)) : cut;
}

/**
 * The slide text for an excerpt of a section. The excerpt may be copied from the editor (with [[图:…]] tokens),
 * from the preview (with figure numbers), or with inline `$...$` math; slides resolve figure/citation numbers,
 * refuse broken references as the Word export does, and convert `$...$` math to readable Unicode notation.
 */
function slideText(excerpt:string,section:ReportSection,content:EditorContent,outside:string):string{
  if(splitInlineMath(excerpt).some(p=>p.math))throw Error('节选含行内公式；PPT 不直接渲染原始 LaTeX 公式代码，请改用已转换的纯文本记号或不含公式的句子。');
  const labels=reportLabels(content.report),citations=referenceNumbers(content).numbers,where=section.title||'未命名章节';
  const prose=sectionProseText(section);
  let text:string;
  if(prose.includes(excerpt))text=resolveReferences(excerpt,labels,where,citations);
  else{
    // Match against the preview text, remembering where broken references were rendered.
    let shown='';const broken:[number,number][]=[];
    for(const segment of referenceSegments(prose,labels,citations)){const start=shown.length;shown+=segment.text;if(segment.missing)broken.push([start,shown.length]);}
    let at=shown.indexOf(excerpt),clean=false;
    if(at>=0){
      for(;at>=0;at=shown.indexOf(excerpt,at+1))if(!broken.some(([a,b])=>at<b&&at+excerpt.length>a)){clean=true;break;}
      if(!clean)throw Error(`“${where}”中有图表引用已失效，请先在正文重新插入引用。`);
      text=excerpt;
    }else{
      let plainShown='';const plainBroken:[number,number][]=[];
      for(const segment of referenceSegments(prose,labels,citations)){
        const piece=formatSlideInlineMath(segment.text);
        const start=plainShown.length;plainShown+=piece;
        if(segment.missing)plainBroken.push([start,plainShown.length]);
      }
      const normShown=plainShown.replace(/\s+/gu,' ').trim();
      const plainExcerpt=formatSlideInlineMath(excerpt).replace(/\s+/gu,' ').trim();
      if(!plainExcerpt||!normShown.includes(plainExcerpt))throw Error(outside);
      const pat=plainShown.indexOf(formatSlideInlineMath(excerpt));
      if(pat>=0&&plainBroken.some(([a,b])=>pat<b&&pat+formatSlideInlineMath(excerpt).length>a))throw Error(`“${where}”中有图表引用已失效，请先在正文重新插入引用。`);
      if(pat<0&&plainBroken.length&&excerpt.includes('【引用已失效】'))throw Error(`“${where}”中有图表引用已失效，请先在正文重新插入引用。`);
      text=excerpt;
    }
  }
  return formatSlideInlineMath(text);
}
import {figureFor,projectPalette} from './report-figure.ts';
import {parseLinkSources,parseReportSlideLink} from './report-storyboard-schema.ts';
export * from './report-storyboard-schema.ts';

export const STORY_JOBS = { problem: '界定问题', design: '说明调查', finding: '呈现发现', action: '提出行动', limitation: '说明边界' } as const;
export const STORY_CLASSES = { user_provided: '用户材料，尚待核验', proposed: '拟议方案，尚未执行', simulated: '教学模拟，非真实调研', inferred: '推断解释，需注明依据' } as const;
export type StorySourceSelection = {sectionId:string;blockIds:string[]};
export type StoryCard = { id: string; sectionId: string; job: keyof typeof STORY_JOBS; classification: keyof typeof STORY_CLASSES; title: string; excerpt: string; limitation: string; implication: string; locator: string; seconds: number; sources?:StorySourceSelection[] };
export type LinkState = 'unlinked' | 'current' | 'report_changed' | 'slide_changed' | 'missing_source';
export const LINK_LABELS: Record<LinkState,string> = { unlinked: '未建立报告关联', current: '关联指纹匹配，内容仍需人工核验', report_changed: '报告依据已变化，请重新制作此页', slide_changed: '页面已修改，请重新核对依据与边界', missing_source: '关联章节已移除，请重新选择依据' };
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
  const selected=storySources(content,card),visuals=selected.flatMap(s=>s.blocks.filter(b=>['chart','table'].includes(b.kind)).map(block=>({section:s.section,block}))),textBlocks=selected.flatMap(s=>s.blocks.filter(b=>!['chart','table'].includes(b.kind)).map(block=>({section:s.section,block})));
  if(visuals.length>2)throw Error('一页最多组合 2 幅图表，请把其余图表拆到下一页。');
  if(selected.some(s=>/【教学模拟数据/u.test(sectionProseText(s.section)))&&card.classification!=='simulated')throw Error('所选来源含教学模拟标记，请保留教学模拟类别。');
  if(visuals.length&&content.quality)await verifyResearchQuality(content.quality);
  for(const {block} of visuals){const result=resultFor(content.quality,block.evidenceId);if(result.classification==='simulated'&&card.classification!=='simulated')throw Error('所选图表含教学模拟结果，请保留教学模拟类别。');if(block.figureId)figureFor(content,block.figureId,block.evidenceId);}
  const labels=reportLabels(content.report),citations=referenceNumbers(content).numbers;
  const extra=textBlocks.map(({section,block})=>{
    const raw=required(block.text,'所选内容块',12000);
    return formatSlideInlineMath(resolveReferences(raw,labels,section.title||'未命名章节',citations));
  }).join('\n\n');
  const body=[slide.body,extra].filter(Boolean).join('\n\n');if(body.length>1800)throw Error('本页文字超过容量，请减少原文或把所选内容块拆页。');
  const notes=normalizeAcademicPunctuation([slide.notes,`报告定位在 ${card.locator}`,...selected.slice(1).map(s=>`关联章节编号 ${s.section.id}\n${s.section.title}\n完整保留来源与说明如下\n${s.section.source||'原章未填写来源，须补证'}`),...selected.map(s=>s.blocks.length?`已选内容块（${s.section.id}）\n${s.blocks.map(b=>`${b.id} · ${b.text}${b.figureId?`\n共享图形 ${b.figureId}`:''}`).join('\n')}`:'')].filter(Boolean).join('\n\n'));
  if(notes.length>6000)throw Error('本页完整来源超过讲稿容量，请分拆来源；不会截断来源记录。');
  const colors=content.visualStyle?projectPalette(content.visualStyle).colors:[{teal:'#0F766E',blue:'#234E80',burgundy:'#8A3449'}[content.accent]];
  const text=(value:string,x:number,y:number,width:number,height:number,fontSize:number,color='#233747',bold=false)=>makeSlideObject('text',{text:value,x,y,width,height,fontSize,color,bold});
  const objects:SlideObject[]=[text(normalizeAcademicPunctuation(slide.title),7,8,86,13,32,colors[0],true)];
  if(visuals.length){
    const wideTable=visuals.length===1&&visuals[0].block.kind==='table';
    visuals.forEach(({section,block},i)=>{const x=visuals.length===2?7+i*45:7,width=wideTable?86:visuals.length===2?41:54;const result=resultFor(content.quality,block.evidenceId),figure=block.figureId?figureFor(content,block.figureId,block.evidenceId):null;
      const caption=normalizeAcademicPunctuation(formatSlideInlineMath(block.text||figure?.title||result.title));if(caption.length>120)throw Error('图表标题过长，请先精简报告图题，或单独编排此图表。');
      objects.push(text(caption,x,24,width,6,18,colors[0],true),makeSlideObject(block.kind as 'chart'|'table',{x,y:32,width,height:visuals.length===2||wideTable?42:55,fontSize:wideTable?17:18,color:colors[0],evidenceId:block.evidenceId,valueColumn:block.valueColumn,sourceBlockId:block.id,sourceSectionId:section.id,...(block.figureId?{figureId:block.figureId}:{})}));
    });
    const summary=normalizePaperProse(body.replace(/\r?\n+/g,' '));
    objects.push(visuals.length===2||wideTable?text(summary,7,78,86,10,18):text(summary,66,24,27,63,18),text(normalizeAcademicPunctuation(`适用边界为${card.limitation}`),7,90,86,7,15,'#536677'));
  }else{
    objects.push(text(normalizePaperProse(body),7,28,62,59,22),text(normalizeAcademicPunctuation(slide.aside),73,28,20,59,17,'#536677'));
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
    if(/【教学模拟数据/u.test(sectionProseText(section))&&c.classification!=='simulated')throw Error('本章带有系统模拟数据标记，页面必须保留教学模拟类别。');
    if(!Number.isInteger(c.seconds)||c.seconds<10||c.seconds>300)throw Error('单页预计讲述时间为 10 至 300 秒，属于排练计划而非赛事规定。');
    const title=normalizeAcademicPunctuation(required(c.title,'页面标题',120)),excerpt=required(c.excerpt,'报告原文节选',400),limitation=required(c.limitation,'适用边界',220),implication=required(c.implication,'意义或下一步',220),locator=required(c.locator,'版本 / 页表定位',160);
    const shown=slideText(excerpt,section,content,`第 ${index+1} 页节选不在当前章节原文中，请重新选择原文；解释请写入标题或下一步。`);
    const body=normalizePaperProse(`${STORY_CLASSES[c.classification]}\n${shown}\n\n后续行动与意义在于${implication}`);
    const aside=normalizeAcademicPunctuation(`适用边界\n${limitation}\n\n报告定位\n${section.title || '未命名章节'}\n${locator}`);
    const notes=normalizeAcademicPunctuation(`本页用于${STORY_JOBS[c.job]}\n预计讲述 ${c.seconds} 秒（自行规划）\n关联章节编号 ${section.id}\n完整保留来源与说明如下\n${section.source || '原章未填写来源，须补证'}\n\n本页由人工选择与改写，不代表证据已核验。报告关联指纹仅用于检测编辑变化。`);
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
  const chosen=excerpt??(section.body.trim()?section.body:sectionProseText(section)),outside='请从本章选择一段要讲述的原文，最多600字。';
  if(!chosen.trim()||chosen.length>600)throw Error(outside);
  const body=slideText(chosen,section,c,outside);
  if(c.quality)await verifyResearchQuality(c.quality);
  const {composeQualitySlide}=await import('./quality-layouts.ts');
  const slide=composeQualitySlide({id:crypto.randomUUID(),title:normalizeAcademicPunctuation(formatSlideInlineMath(block.text||section.title)),body:normalizePaperProse(body),aside:'',notes:normalizeAcademicPunctuation(section.source),layout:block.kind==='table'?'comparison':'chart'},block.kind==='table'?'comparison':'chart',c.quality!,block.evidenceId);
  slide.objects=slide.objects?.map(o=>o.kind===block.kind?{...o,valueColumn:block.valueColumn,sourceBlockId:block.id,...(c.version===3?{sourceSectionId:section.id}:{}),...(block.figureId?{figureId:block.figureId}:{})}:o);
  const bound=await bindReportSlide(c,slide,section.id);
  const {buildPptx}=await import('./editor-export.ts');
  await buildPptx({...c,report:[section],slides:[bound]});
  return bound;
}

/** Synthesizes a clean 8–10 slide topic-synced defense deck from a populated V2 report when slides are still default placeholders. */
export function buildTopicSyncedDeck(content: EditorContent): Slide[] {
  const simulated =
    Boolean(content.quality?.results.some(r => r.classification === 'simulated')) ||
    content.report.some(s => /教学模拟/.test(sectionProseText(s))) ||
    /教学模拟/.test(content.subtitle);
  const simPrefix = simulated ? '教学模拟，非真实调研\n' : '';
  const substantive = content.report.filter(s => {
    const t = s.title.trim();
    if (!t || /^(?:封面|目录|参考文献|附录)/u.test(t)) return false;
    return defaultSlideExcerptForSection(s, content, 260).length >= 16;
  });
  const pickBy = (re: RegExp, used: Set<string>) => {
    const found = substantive.find(s => !used.has(s.id) && re.test(s.title));
    if (found) used.add(found.id);
    return found ?? null;
  };
  const used = new Set<string>();
  const picked: Array<{ sec: ReportSection; tag: string }> = [];
  const slots: Array<[RegExp, string]> = [
    [/摘要/u, '核心研究概览'],
    [/背景|问题|目的|意义/u, '现实痛点与研究边界'],
    [/方案|抽样|问卷|样本量/u, '调查设计与抽样框'],
    [/清洗|质量|信度|效度/u, '数据质控与量表信效度'],
    [/现状|描述|交叉|差异|比较/u, '样本特征与群体比较'],
    [/驱动|回归|模型|机制/u, '核心影响机制检验'],
    [/分群|聚类|画像/u, '受访人群异质性分群'],
    [/诊断|评价|IPA|KANO|痛点/u, '关键薄弱环节诊断'],
    [/对策|建议|措施|可行性|止损/u, '靶向治理对策与试行评估'],
    [/结论|发现|局限/u, '主要结论与外推边界'],
  ];
  for (const [re, tag] of slots) {
    if (picked.length >= 9) break;
    const sec = pickBy(re, used);
    if (sec) picked.push({ sec, tag });
  }
  for (const sec of substantive) {
    if (picked.length >= 8) break;
    if (!used.has(sec.id)) {
      used.add(sec.id);
      picked.push({ sec, tag: '章节要点摘录' });
    }
  }
  const deck: Slide[] = [
    {
      id: crypto.randomUUID(),
      title: normalizeAcademicPunctuation(content.title || '专题调查研究').slice(0, 120),
      body: normalizePaperProse(formatSlideInlineMath(content.subtitle || `${simPrefix.trim() || '实证研究与行动建议汇报'}`)).slice(0, 320),
      aside: '',
      notes: '开场说明研究对象、调查范围、样本口径及研究边界。',
      layout: 'cover',
    },
  ];
  for (const { sec, tag } of picked.slice(0, 9)) {
    const excerpt = defaultSlideExcerptForSection(sec, content, 260);
    if (!excerpt) continue;
    const exhibitCount = (sec.blocks ?? []).filter(b => b.kind === 'chart' || b.kind === 'table').length;
    const asideLines = [
      `本页聚焦${tag}`,
      exhibitCount > 0 ? `本章配套 ${exhibitCount} 项统计图表，可通过“发现与矢量编排”或“打开报告分镜”嵌入原图` : '',
      sec.source.trim() ? `依据源自${normalizeAcademicPunctuation(formatSlideInlineMath(sec.source.trim())).slice(0, 140)}` : '结论仅限本样本有效口径，相关不等于因果',
    ].filter(Boolean);
    deck.push({
      id: crypto.randomUUID(),
      title: normalizeAcademicPunctuation(sec.title.replace(/^[一二三四五六七八九十]+、\s*/u, '')).slice(0, 120) || tag,
      body: normalizePaperProse(`${simPrefix}${excerpt}`).slice(0, 380),
      aside: asideLines.join('\n\n').slice(0, 320),
      notes: normalizeAcademicPunctuation(`对应报告章节为“${sec.title}”\n${sec.source ? `依据源自${sec.source}` : '讲述时请结合本章登记图表说明分母与结论边界。'}`).slice(0, 2000),
      layout: 'two-column',
    });
  }
  return deck.slice(0, 10);
}
