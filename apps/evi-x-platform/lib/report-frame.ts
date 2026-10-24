import {projectPalette,type ProjectVisualStyle} from './report-figure.ts';

export type FrameArea={id:string;kind:'header'|'footer'|'page_number'|'caption'|'footnote'|'other';xMm:number;yMm:number;widthMm:number;heightMm:number};
export type ReportFrameStyle={
 schema:'ReportFrameStyle/v1';id:string;version:number;title:string;status:'concept'|'vector_draft'|'approved';
 theme:'finance-grid'|'sports-track';variant:'body'|'chapter'|'cover';layout:'none'|'corners'|'open'|'closed';
 paper:{widthMm:number;heightMm:number};marginsMm:{top:number;right:number;bottom:number;left:number};guardMm:number;trimGuardMm:number;
 protectedAreas:FrameArea[];palette:{id:string;version:number;primary:string;secondary:string;accent:string};
 lineWidthPt:number;cornerSizeMm:number;density:number;strength:number;appliesTo:('body'|'chapter'|'cover'|'appendix')[];
 sourceConcept:{assetId:string;sha256:string;promptRef:string}|null;
 review:{decision:'approved';reviewer:string;at:string;definitionSha256:string}|null;
};
export type FramePrimitive={type:'line'|'polyline'|'circle';points:[number,number][];stroke:string;fill:string;strokeWidthPt:number;opacity:number;cx?:number;cy?:number;r?:number};
const fail=():never=>{throw Error('页框定义无效，或装饰超出可用留白。');};
const obj=(v:unknown,keys:string[])=>{if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).some(k=>typeof k!=='string'||!keys.includes(k)||!('value' in Object.getOwnPropertyDescriptor(v,k)!))||Object.keys(v).length!==keys.length)return fail();return v as Record<string,unknown>;};
const txt=(v:unknown,max=160):string=>typeof v==='string'&&v.trim().length>0&&Array.from(v).length<=max&&!/[\u0000-\u001f\p{Surrogate}]/u.test(v)?v:fail();
const number=(v:unknown,min:number,max:number):number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max&&Number(v.toFixed(6))===v?v:fail();
const choose=<T extends string>(v:unknown,items:readonly T[]):T=>items.includes(v as T)?v as T:fail();
export function parseReportFrame(value:unknown):ReportFrameStyle {
 const x=obj(value,['schema','id','version','title','status','theme','variant','layout','paper','marginsMm','guardMm','trimGuardMm','protectedAreas','palette','lineWidthPt','cornerSizeMm','density','strength','appliesTo','sourceConcept','review']);
 if(x.schema!=='ReportFrameStyle/v1'||!Number.isSafeInteger(x.version)||Number(x.version)<1||Number(x.version)>1e6)return fail();
 const p=obj(x.paper,['widthMm','heightMm']),m=obj(x.marginsMm,['top','right','bottom','left']),c=obj(x.palette,['id','version','primary','secondary','accent']);
 const paper={widthMm:number(p.widthMm,80,594),heightMm:number(p.heightMm,80,594)},limit=Math.min(paper.widthMm,paper.heightMm)/2,marginsMm={top:number(m.top,6,limit),right:number(m.right,6,limit),bottom:number(m.bottom,6,limit),left:number(m.left,6,limit)};
 if(paper.widthMm-marginsMm.left-marginsMm.right<50||paper.heightMm-marginsMm.top-marginsMm.bottom<60||!Number.isSafeInteger(c.version)||Number(c.version)<1||Number(c.version)>1e6)return fail();
 const hex=(v:unknown)=>typeof v==='string'&&/^#[a-fA-F0-9]{6}$/.test(v)?v:fail();
 if(!Array.isArray(x.protectedAreas)||x.protectedAreas.length>24||!Array.isArray(x.appliesTo)||!x.appliesTo.length||x.appliesTo.length>4||new Set(x.appliesTo).size!==x.appliesTo.length)return fail();
 const protectedAreas=x.protectedAreas.map(v=>{const a=obj(v,['id','kind','xMm','yMm','widthMm','heightMm']);return {id:txt(a.id,96),kind:choose(a.kind,['header','footer','page_number','caption','footnote','other'] as const),xMm:number(a.xMm,0,paper.widthMm),yMm:number(a.yMm,0,paper.heightMm),widthMm:number(a.widthMm,.1,paper.widthMm),heightMm:number(a.heightMm,.1,paper.heightMm)};});
 if(new Set(protectedAreas.map(a=>a.id)).size!==protectedAreas.length||protectedAreas.some(a=>['body','body-guard'].includes(a.id)||a.xMm+a.widthMm>paper.widthMm||a.yMm+a.heightMm>paper.heightMm))return fail();
 let sourceConcept:ReportFrameStyle['sourceConcept']=null,review:ReportFrameStyle['review']=null;
 const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)?v:fail();
 if(x.sourceConcept!==null){const a=obj(x.sourceConcept,['assetId','sha256','promptRef']);sourceConcept={assetId:txt(a.assetId,96),sha256:hash(a.sha256),promptRef:txt(a.promptRef,240)};}
 if(x.review!==null){const r=obj(x.review,['decision','reviewer','at','definitionSha256']);const date=typeof r.at==='string'?r.at.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/):null;if(r.decision!=='approved'||!date||!Number.isFinite(Date.parse(r.at as string))||new Date(Date.UTC(Number(date[1]),Number(date[2])-1,Number(date[3]))).toISOString().slice(0,10)!==date[0].slice(0,10)||Number(date[4])>23||Number(date[5])>59||Number(date[6])>59)return fail();review={decision:'approved',reviewer:txt(r.reviewer),at:r.at as string,definitionSha256:hash(r.definitionSha256)};}
 if((x.status==='approved')!==Boolean(review))return fail();
 return {schema:'ReportFrameStyle/v1',id:txt(x.id,96),version:x.version as number,title:txt(x.title),status:choose(x.status,['concept','vector_draft','approved'] as const),theme:choose(x.theme,['finance-grid','sports-track'] as const),variant:choose(x.variant,['body','chapter','cover'] as const),layout:choose(x.layout,['none','corners','open','closed'] as const),paper,marginsMm,guardMm:number(x.guardMm,3,12),trimGuardMm:number(x.trimGuardMm,0,10),protectedAreas,palette:{id:txt(c.id,96),version:c.version as number,primary:hex(c.primary),secondary:hex(c.secondary),accent:hex(c.accent)},lineWidthPt:number(x.lineWidthPt,.25,2),cornerSizeMm:number(x.cornerSizeMm,2,24),density:number(x.density,0,1),strength:number(x.strength,0,1),appliesTo:x.appliesTo.map(v=>choose(v,['body','chapter','cover','appendix'] as const)),sourceConcept,review};
}
export function createReportFrame(style:ProjectVisualStyle,theme:ReportFrameStyle['theme']='finance-grid'):ReportFrameStyle {
 const colors=projectPalette(style).colors;
 return {schema:'ReportFrameStyle/v1',id:crypto.randomUUID(),version:1,title:theme==='finance-grid'?'几何连接':'运动轨迹',status:'vector_draft',theme,variant:'body',layout:'corners',paper:{widthMm:210,heightMm:297},marginsMm:{top:25.4,right:31.8,bottom:25.4,left:31.8},guardMm:3,trimGuardMm:3,protectedAreas:[{id:'page-number',kind:'page_number',xMm:84,yMm:280,widthMm:42,heightMm:10}],palette:{id:style.paletteId,version:style.version,primary:colors[0],secondary:colors[2%colors.length],accent:colors[4%colors.length]},lineWidthPt:.85,cornerSizeMm:12,density:.4,strength:.6,appliesTo:['body','appendix'],sourceConcept:null,review:null};
}
/** Shared bounded-number canonical JSON, mirrored by the Skill. */
export function frameCanonical(value:unknown):string {
 if(typeof value==='number'){number(value,-1e6,1e6);return value.toFixed(6).replace(/\.?0+$/,'')||'0';}
 if(Array.isArray(value))return '['+value.map(frameCanonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+frameCanonical(v)).join(',')+'}';
 return JSON.stringify(value);
}
export async function frameDefinitionHash(frame:ReportFrameStyle){const {status: _status,review: _review,...definition}=parseReportFrame(frame);void _status;void _review;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(frameCanonical(definition))))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function approveReportFrame(frame:ReportFrameStyle,reviewer:string){const snapshot=parseReportFrame(frame);buildFramePrimitives(snapshot);const hash=await frameDefinitionHash(snapshot);return parseReportFrame({...snapshot,status:'approved',review:{decision:'approved',reviewer,at:new Date().toISOString(),definitionSha256:hash}});}
export async function assertApprovedFrame(frame:ReportFrameStyle){const snapshot=parseReportFrame(frame);if(snapshot.layout==='none')return snapshot;if(snapshot.status!=='approved'||!snapshot.review||snapshot.review.definitionSha256!==await frameDefinitionHash(snapshot))throw Error('请先预览并应用当前页框。');buildFramePrimitives(snapshot);return snapshot;}
function segmentHit(a:[number,number],b:[number,number],r:FrameArea,pad:number){const minX=r.xMm-pad,maxX=r.xMm+r.widthMm+pad,minY=r.yMm-pad,maxY=r.yMm+r.heightMm+pad;let lo=0,hi=1;const dx=b[0]-a[0],dy=b[1]-a[1];for(const [p,q] of [[-dx,a[0]-minX],[dx,maxX-a[0]],[-dy,a[1]-minY],[dy,maxY-a[1]]]){if(Math.abs(p)<1e-12){if(q<0)return false;}else{const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;}}return true;}
export function buildFramePrimitives(value:ReportFrameStyle):FramePrimitive[]{
 const s=parseReportFrame(value);if(s.status==='concept')return fail();if(s.layout==='none')return [];const m=s.marginsMm,g=s.guardMm,w=s.paper.widthMm,h=s.paper.heightMm;
 const areas:FrameArea[]=[{id:'body-guard',kind:'other',xMm:m.left-g,yMm:m.top-g,widthMm:w-m.left-m.right+2*g,heightMm:h-m.top-m.bottom+2*g},...s.protectedAreas];
 const left=m.left-g-2,right=w-m.right+g+2,top=m.top-g-2,bottom=h-m.bottom+g+2,size=s.cornerSizeMm,out:FramePrimitive[]=[];
 const line=(a:[number,number],b:[number,number],color='primary',opacity=1)=>out.push({type:'line',points:[a,b],stroke:s.palette[color as 'primary'],fill:'none',strokeWidthPt:s.lineWidthPt,opacity:s.strength*opacity});
 if(s.layout==='closed')[[[left,top],[right,top]],[[right,top],[right,bottom]],[[right,bottom],[left,bottom]],[[left,bottom],[left,top]]].forEach(p=>line(p[0] as [number,number],p[1] as [number,number]));
 else if(s.layout==='open'){line([left+size,top],[right-size,top],'secondary',.7);line([left,top+size],[left,bottom-size],'secondary',.7);line([right,top+size],[right,bottom-size],'secondary',.7);}
 const weight={body:1,chapter:1.15,cover:1.3}[s.variant],repeats=Math.min(4,1+Math.floor(s.density*2)+Number(s.variant!=='body'));
 for(const [index,[cx,cy,sx,sy]] of [[left,top,-1,-1],[right,top,1,-1],[left,bottom,-1,1],[right,bottom,1,1]].entries()){
  if(s.layout!=='closed'){line([cx-sx*size,cy],[cx,cy]);line([cx,cy],[cx,cy-sy*size]);}
  for(let i=0;i<repeats;i++){let points:[number,number][];if(s.theme==='finance-grid'){const scale=Math.max(2,size-i*3),px=cx+sx*1.6*(i+1),py=cy+sy*1.6*(i+1);points=[[px,py+sy*scale*.7],[px,py],[px+sx*scale*.45,py],[px+sx*scale*.45,py+sy*scale*.25],[px+sx*scale*.8,py+sy*scale*.25]];}else{const radius=Math.max(2,size-i*2.4);points=Array.from({length:13},(_,j)=>[cx+sx*radius*Math.cos(j*Math.PI/24),cy+sy*radius*Math.sin(j*Math.PI/24)]);}
   out.push({type:'polyline',points,stroke:s.palette[i?'secondary':'primary'],fill:'none',strokeWidthPt:s.lineWidthPt,opacity:Number((s.strength/weight).toFixed(6))});}
  if(s.theme==='finance-grid'&&s.density>=.25)out.push({type:'circle',points:[],cx:cx+sx*(size*.8+1.6),cy:cy+sy*1.6,r:.55,stroke:s.palette.accent,fill:s.palette.accent,strokeWidthPt:s.lineWidthPt,opacity:s.strength});
  if(s.theme==='sports-track'&&(s.variant!=='body'||s.density>.6))out.push({type:'circle',points:[],cx:cx+sx*size*.72,cy:cy+sy*size*.72,r:.65,stroke:s.palette.accent,fill:s.palette.accent,strokeWidthPt:s.lineWidthPt,opacity:s.strength});
  if(s.variant==='cover'&&(index===0||index===3))line([cx-sx*size*1.8,cy+sy*1.2],[cx-sx*size*.2,cy+sy*1.2],'accent',.8);
 }
 for(const p of out){const pad=p.strokeWidthPt*25.4/72/2,pts=p.type==='circle'?[[p.cx!-p.r!,p.cy!-p.r!],[p.cx!+p.r!,p.cy!+p.r!]]:p.points;if(pts.some(([x,y])=>x-pad<s.trimGuardMm||y-pad<s.trimGuardMm||x+pad>w-s.trimGuardMm||y+pad>h-s.trimGuardMm))return fail();for(const a of areas){if(p.type==='circle'){const dx=p.cx!-Math.max(a.xMm,Math.min(p.cx!,a.xMm+a.widthMm)),dy=p.cy!-Math.max(a.yMm,Math.min(p.cy!,a.yMm+a.heightMm));if(Math.hypot(dx,dy)<=p.r!+pad)return fail();}else if(p.points.slice(1).some((b,i)=>segmentHit(p.points[i],b,a,pad)))return fail();}}
 return out;
}
export function frameSVG(frame:ReportFrameStyle){const p=buildFramePrimitives(frame);const fmt=(v:number)=>Number(v.toFixed(6));return `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.paper.widthMm}mm" height="${frame.paper.heightMm}mm" viewBox="0 0 ${frame.paper.widthMm} ${frame.paper.heightMm}">${p.map(p=>{const common=`stroke="${p.stroke}" fill="${p.fill}" stroke-width="${fmt(p.strokeWidthPt*25.4/72)}" opacity="${fmt(p.opacity)}" stroke-linecap="round" stroke-linejoin="round"`;return p.type==='circle'?`<circle cx="${fmt(p.cx!)}" cy="${fmt(p.cy!)}" r="${p.r}" ${common}/>`:`<polyline points="${p.points.map(([x,y])=>`${fmt(x)},${fmt(y)}`).join(' ')}" ${common}/>`;}).join('')}</svg>`;}
