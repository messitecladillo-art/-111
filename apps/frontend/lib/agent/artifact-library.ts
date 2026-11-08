/** Independent browser library. Report placement does not own an artifact's lifetime. */
import { createEditorContent, parseEditorContent, type EditorContent, type ReportSection } from '../editor-model.ts';
import { parseProjectVisualStyle, parseReportFigure, type ReportFigure, type ProjectVisualStyle } from '../report-figure.ts';
import { parseReportFrame, type ReportFrameStyle } from '../report-frame.ts';
import { appendQualityResult } from '../quality-layouts.ts';
import { appendBlocks, SIMULATED_MARK } from '../report-placement.ts';
import { parseReportBlock, parseResultSnapshot, verifyResearchQuality, type ReportBlock, type ResultSnapshot } from '../research-quality.ts';
import { assertTrueVector } from '../vector-assets.ts';
import type { SectionRevisionProposal } from './section-revision.ts';

export type ArtifactKind = 'cover'|'frame'|'diagram'|'chart'|'table'|'formula'|'text'|'file';
export type ArtifactValue =
  | { type:'cover'; title:string; subtitle:string; accent:EditorContent['accent'] }
  | { type:'frame'; frame:ReportFrameStyle }
  | { type:'figure'; figure:ReportFigure; result:ResultSnapshot; visualStyle?:ProjectVisualStyle }
  | { type:'block'; block:ReportBlock; result?:ResultSnapshot }
  | { type:'text'; section:ReportSection; resultHashes?:Record<string,string> }
  | { type:'file'; name:string; mime:string; dataUrl:string };
export type ArtifactSeed = { familyId:string;kind:ArtifactKind;title:string;origin:string;status:'candidate'|'adopted'|'stored';classification:'simulated'|'public'|'user_provided'|'mixed'|'unclassified';value:ArtifactValue };
export type ArtifactRecord = ArtifactSeed & { schema:'Artifact/v1';id:string;version:number;hash:string;updatedAt:string;archived:boolean };
export type ArtifactLibrary = { schema:'ArtifactLibrary/v1'; revision:number; records:ArtifactRecord[] };
export const ARTIFACT_LIMITS = { records:240, bytes:45_000_000, fileBytes:6_000_000 } as const;
export const emptyArtifactLibrary = ():ArtifactLibrary => ({schema:'ArtifactLibrary/v1',revision:0,records:[]});
let guestId:string|null=null;
function libraryOwner(owner:string):string {
  if(owner!=='guest'||typeof window==='undefined')return owner;
  if(!guestId){try{guestId=window.sessionStorage.getItem('evix.artifact-guest.v1');if(!guestId){guestId=crypto.randomUUID();window.sessionStorage.setItem('evix.artifact-guest.v1',guestId);}}catch{guestId=crypto.randomUUID();}}
  return `guest:${guestId}`;
}
export const artifactScope = (owner:string,project:string|null) => JSON.stringify(['artifact-library/v1',libraryOwner(owner),project]);
const clone = <T>(x:T):T => structuredClone(x);
export async function artifactHash(value:ArtifactValue):Promise<string> {
  const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,x])=>[k,canonical(x)])):v;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(value)))))].map(b=>b.toString(16).padStart(2,'0')).join('');
}

/** Shared by import and restoration: a stored URL can never fetch a remote image. */
export function artifactImageMime(bytes:Uint8Array):string {
  const starts=(magic:number[],offset=0)=>magic.every((b,i)=>bytes[offset+i]===b);
  if(starts([137,80,78,71,13,10,26,10]))return 'image/png';
  if(starts([255,216,255]))return 'image/jpeg';
  if(starts([82,73,70,70])&&starts([87,69,66,80],8))return 'image/webp';
  let svg='';try{svg=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/u,'').trim();}catch{return '';}
  if(!/^<svg\s/u.test(svg))return '';
  assertTrueVector(svg);return 'image/svg+xml';
}

/** Reject corrupt or unsupported records without erasing the user's saved library. */
export function validateArtifactLibrary(value:unknown):ArtifactLibrary {
  const fail=()=>{throw Error('成果架记录无法读取，请保留浏览器数据并导出备份。');};
  const object=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:fail();
  const text=(x:unknown,max:number,min=0)=>typeof x==='string'&&x.length<=max&&x.trim().length>=min&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(x)?x:fail();
  const x=object(value);
  if(x.schema!=='ArtifactLibrary/v1'||!Number.isSafeInteger(x.revision)||(x.revision as number)<0||!Array.isArray(x.records)||x.records.length>ARTIFACT_LIMITS.records)fail();
  const ids=new Set<string>(),versions=new Set<string>();
  for(const raw of x.records as unknown[]){
    const r=object(raw),v=object(r.value);
    const id=text(r.id,100,1),family=text(r.familyId,300,1);
    if(r.schema!=='Artifact/v1'||ids.has(id)||!Number.isSafeInteger(r.version)||(r.version as number)<1||versions.has(`${family}:${r.version}`)||typeof r.archived!=='boolean'||!['candidate','adopted','stored'].includes(r.status as string)||!['simulated','public','user_provided','mixed','unclassified'].includes(r.classification as string)||!/^[a-f0-9]{64}$/u.test(text(r.hash,64,64))||!Number.isFinite(Date.parse(text(r.updatedAt,60,1))))fail();
    ids.add(id);versions.add(`${family}:${r.version}`);text(r.title,300,1);text(r.origin,300,1);
    const kinds:Record<string,string[]>= {cover:['cover'],frame:['frame'],figure:['chart','table'],block:['chart','table','formula'],text:['text'],file:['cover','diagram','file']};
    if(!kinds[v.type as string]?.includes(r.kind as string))fail();
    if(v.type==='cover'){text(v.title,120,1);text(v.subtitle,240);if(!['teal','blue','burgundy'].includes(v.accent as string))fail();}
    else if(v.type==='frame')parseReportFrame(v.frame);
    else if(v.type==='figure'){
      const f=parseReportFigure(v.figure),result=parseResultSnapshot(v.result);
      if(f.resultId!==result.id||f.resultHash!==result.resultHash||f.n!==result.n||(f.kind==='table')!==(r.kind==='table'))fail();
      if(v.visualStyle)parseProjectVisualStyle(v.visualStyle);
    }else if(v.type==='block'){
      const b=parseReportBlock(v.block);if(b.kind!==r.kind||b.figureId)fail();
      if(v.result){const result=parseResultSnapshot(v.result);if(b.evidenceId!==result.id)fail();}
      else if(b.kind!=='formula')fail();
    }else if(v.type==='text'){
      const s=object(v.section);text(s.id,80,1);text(s.title,150);text(s.body,12000);text(s.source,1500);
      if(s.blocks!==undefined){if(!Array.isArray(s.blocks)||s.blocks.length>60)fail();(s.blocks as unknown[]).forEach(parseReportBlock);}
      if(v.resultHashes!==undefined)for(const [key,hash]of Object.entries(object(v.resultHashes))){text(key,80,1);if(!/^[a-f0-9]{64}$/u.test(text(hash,64,64)))fail();}
    }else{
      text(v.name,180,1);const url=text(v.dataUrl,Math.ceil(ARTIFACT_LIMITS.fileBytes*4/3)+100,1);
      const match=/^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/]+={0,2})$/u.exec(url);
      if(!match||match[1]!==v.mime)fail();
      const binary=atob(match![2]);if(binary.length>ARTIFACT_LIMITS.fileBytes||artifactImageMime(Uint8Array.from(binary,c=>c.charCodeAt(0)))!==v.mime)fail();
    }
  }
  if(new TextEncoder().encode(JSON.stringify(value)).length>ARTIFACT_LIMITS.bytes)fail();
  return value as ArtifactLibrary;
}

async function verifyArtifactResult(value:ArtifactValue):Promise<void>{
  const result=value.type==='figure'?value.result:value.type==='block'?value.result:undefined;
  if(result)await verifyResearchQuality({version:1,results:[result],findings:[]});
}
export async function verifyArtifactLibrary(library:ArtifactLibrary):Promise<void>{
  await Promise.all(library.records.map(async record=>{
    if(await artifactHash(record.value)!==record.hash)throw Error('素材指纹不一致，原记录已保留，请先核对备份。');
    await verifyArtifactResult(record.value);
  }));
}

/** Only objects actually present in a report are collected; no synthetic illustration is invented to fill a shelf. */
export function collectReportArtifacts(content:EditorContent,origin:string,status:ArtifactSeed['status'],includeText=false):ArtifactSeed[] {
  const c=parseEditorContent(content), results=c.quality?.results??[];
  const classes=[...new Set(results.map(r=>r.classification))];
  const classification=classes.length===1?classes[0]:classes.length?'mixed':'unclassified';
  const seeds:ArtifactSeed[]=[];
  const add=(familyId:string,kind:ArtifactKind,title:string,value:ArtifactValue)=>seeds.push({familyId,kind,title,origin,status,classification,value:clone(value)});
  const blank=createEditorContent(),templates=new Set(blank.report.map(s=>s.body.trim()));
  if(c.title!==blank.title||c.subtitle!==blank.subtitle||c.accent!==blank.accent)add('cover:report','cover',`封面文字 · ${c.title}`,{type:'cover',title:c.title,subtitle:c.subtitle,accent:c.accent});
  if(c.reportFrame)add('frame:report','frame',c.reportFrame.title||'报告主题页框',{type:'frame',frame:c.reportFrame});
  for(const f of c.figures??[]){const r=results.find(r=>r.id===f.resultId&&r.resultHash===f.resultHash);if(r)add(`figure:${f.id}`,f.kind==='table'?'table':'chart',f.title,{type:'figure',figure:f,result:r,...(c.visualStyle?{visualStyle:c.visualStyle}:{})});}
  for(const s of c.report){
    if(includeText&&((s.body.trim()&&!templates.has(s.body.trim()))||s.blocks?.some(b=>b.kind==='paragraph'&&b.text.trim())))add(`section:${s.id}`,'text',s.title||'报告段落',{type:'text',section:s,resultHashes:Object.fromEntries(results.map(r=>[r.id,r.resultHash]))});
    for(const b of s.blocks??[]){
      if(b.figureId||!['chart','table','formula'].includes(b.kind))continue;
      const result=results.find(r=>r.id===b.evidenceId);
      if(b.kind!=='formula'&&!result)continue;
      add(`block:${s.id}:${b.id}`,b.kind==='chart'?'chart':b.kind==='table'?'table':'formula',b.text||s.title,{type:'block',block:b,...(result?{result}:{})});
    }
  }
  return seeds;
}

/** Retain the exact returned prose independently of whether the candidate is adopted. */
export function sectionRevisionArtifact(proposal:SectionRevisionProposal):ArtifactSeed {
  const original=JSON.parse(proposal.anchor.section) as ReportSection;
  const results=(JSON.parse(proposal.anchor.basis) as {quality?:{results:ResultSnapshot[]}}).quality?.results??[];
  const classes=[...new Set(results.map(r=>r.classification))];
  return {familyId:`section:${original.id}`,kind:'text',title:original.title||'报告段落',origin:'本节修订候选',status:'candidate',classification:classes.length===1?classes[0]:classes.length?'mixed':'unclassified',value:{type:'text',section:{id:original.id,title:original.title,body:proposal.paragraphs.join('\n'),source:original.source},resultHashes:Object.fromEntries(results.map(r=>[r.id,r.resultHash]))}};
}

/** An append-only version per family. A repeated capture is idempotent, including after hiding a version. */
export function mergeArtifacts(library:ArtifactLibrary,items:readonly {seed:ArtifactSeed;hash:string}[],at:string):ArtifactLibrary {
  const records=[...library.records];let changed=false;
  for(const {seed,hash} of items){
    const previous=records.find(r=>r.familyId===seed.familyId&&r.hash===hash);
    if(previous){if(previous.status!=='adopted'&&seed.status==='adopted'){records[records.indexOf(previous)]={...previous,status:'adopted'};changed=true;}continue;}
    const version=Math.max(0,...records.filter(r=>r.familyId===seed.familyId).map(r=>r.version))+1;
    records.push({...clone(seed),schema:'Artifact/v1',id:crypto.randomUUID(),version,hash,updatedAt:at,archived:false});changed=true;
  }
  if(!changed)return library;
  const next:ArtifactLibrary={schema:'ArtifactLibrary/v1',revision:library.revision+1,records};
  if(records.length>ARTIFACT_LIMITS.records||new TextEncoder().encode(JSON.stringify(next)).length>ARTIFACT_LIMITS.bytes)throw Error('成果架空间已满，请先导出整理；现有成果仍完整保留。');
  return next;
}

/** Each mutation reads and commits in the same IndexedDB transaction, so concurrent tabs cannot replace one another. */
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const req=indexedDB.open('evix-artifact-library-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('libraries');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('无法打开成果架存储，请检查浏览器空间与权限。'));});}
export async function updateArtifactLibrary(scope:string,update:(before:ArtifactLibrary)=>ArtifactLibrary):Promise<ArtifactLibrary>{
  const db=await database();return new Promise((resolve,reject)=>{
    const tx=db.transaction('libraries','readwrite'),store=tx.objectStore('libraries'),get=store.get(scope);let result:ArtifactLibrary;let failure:unknown;
    get.onsuccess=()=>{try{const before=validateArtifactLibrary(get.result??emptyArtifactLibrary());result=update(before);if(result!==before){validateArtifactLibrary(result);store.put(result,scope);}}catch(error){failure=error;tx.abort();}};
    tx.oncomplete=()=>{db.close();void verifyArtifactLibrary(result).then(()=>resolve(result),reject);};tx.onabort=tx.onerror=()=>{db.close();reject(failure??Error('成果架未能保存，现有记录没有被覆盖。'));};
  });
}
export const readArtifactLibrary=(scope:string)=>updateArtifactLibrary(scope,x=>x);
export async function captureArtifacts(scope:string,seeds:readonly ArtifactSeed[]):Promise<ArtifactLibrary>{
  const frozen=clone(seeds);
  const items=await Promise.all(frozen.map(async seed=>{await verifyArtifactResult(seed.value);return {seed,hash:await artifactHash(seed.value)};}));
  return updateArtifactLibrary(scope,before=>mergeArtifacts(before,items,new Date().toISOString()));
}

/** Reuse is an editor operation; files remain independently downloadable until an image-placement editor exists. */
export function applyArtifactToReport(content:EditorContent,record:ArtifactRecord,sectionId:string|null):EditorContent{
  const value=record.value;
  if(value.type==='file')throw Error('这份文件可单独导出或替换；当前报告编辑器尚未接入图片块。');
  if(value.type==='cover')return parseEditorContent({...content,title:value.title,subtitle:value.subtitle,accent:value.accent});
  if(value.type==='frame'){
    const frame=parseReportFrame(value.frame);
    if(frame.layout!=='none'&&(frame.status!=='approved'||!frame.review))throw Error('请先预览并确认应用这版页框。');
    if(content.visualStyle&&(content.visualStyle.paletteId!==frame.palette.id||content.visualStyle.version!==frame.palette.version))throw Error('这版页框与报告配色不同，请先统一项目配色再应用。');
    return parseEditorContent({...content,version:3,reportFrame:frame,visualStyle:content.visualStyle??{schema:'ProjectVisualStyle/v1',paletteId:frame.palette.id,version:frame.palette.version}});
  }
  const target=content.report.find(s=>s.id===sectionId);
  if(!target)throw Error('请先在目录选择目标章节；原章节已移除时不会改写其他章节。');
  if(value.type==='text'){
    if(Object.entries(value.resultHashes??{}).some(([id,hash])=>!content.quality?.results.some(r=>r.id===id&&r.resultHash===hash)))throw Error('这段文字依赖的分析结果已变化，请先核对依据。');
    const tokens=[value.section.body,...(value.section.blocks??[]).filter(b=>b.kind==='paragraph').map(b=>b.text)].join('\n').matchAll(/\[\[(图|表|引):([^\]]+)\]\]/gu);
    for(const [,kind,id] of tokens)if(kind==='引'?!content.references?.some(r=>r.id===id):!content.report.some(s=>s.blocks?.some(b=>b.id===id&&(kind==='图'?b.kind==='chart':b.kind==='table'))))throw Error('请先把文字引用的图表或文献放入报告，再使用这段文字。');
  }
  let next=content.version===1?{...content,version:2 as const,quality:{version:1 as const,results:[],findings:[]}}:content,b:ReportBlock;
  const result=value.type==='figure'?value.result:value.type==='block'?value.result:undefined;
  if(result){const current=content.quality?.results.find(r=>r.id===result.id);if(current&&current.resultHash!==result.resultHash)throw Error('这件成果的分析依据已更新，请先重新核对版本。');next=appendQualityResult(next,result);}
  if((result?.classification==='simulated'||record.classification==='simulated')&&!target.body.includes('【教学模拟数据'))next={...next,report:next.report.map(s=>s.id===target.id?{...s,body:[SIMULATED_MARK,s.body].filter(Boolean).join('\n')}:s)};
  const id=`artifact-${record.id}`;
  if(target.blocks?.some(b=>b.id===id))return content;
  if(value.type==='figure'){
    const figure=parseReportFigure(value.figure),previous=next.figures?.find(f=>f.id===figure.id);
    if(previous&&JSON.stringify(previous)!==JSON.stringify(figure))throw Error('同名图形已有新版本，请修改后另存，避免覆盖当前图形。');
    next={...next,version:3,figures:previous?next.figures:[...(next.figures??[]),figure],...(next.visualStyle?{}:value.visualStyle?{visualStyle:value.visualStyle}:{})};
    b={id,kind:figure.kind==='table'?'table':'chart',text:figure.title,evidenceId:figure.resultId,valueColumn:1,figureId:figure.id};
  }else if(value.type==='block')b={...parseReportBlock(value.block),id};
  else b={id,kind:'paragraph',text:[value.section.body,...(value.section.blocks??[]).filter(b=>b.kind==='paragraph').map(b=>b.text)].filter(Boolean).join('\n'),evidenceId:'',valueColumn:1};
  if(value.type==='text'&&value.section.source.trim()&&!target.source.includes(value.section.source))next={...next,report:next.report.map(s=>s.id===target.id?{...s,source:[s.source,value.section.source].filter(Boolean).join('\n')}:s)};
  return appendBlocks(next,target.id,[b]);
}
