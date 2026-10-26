import {assertApprovedFrame,buildFramePrimitives,type ReportFrameStyle} from './report-frame.ts';
import type JSZip from 'jszip';
const fmt=(n:number)=>String(Number(n.toFixed(6)));
/** Native VML shapes are anchored to page coordinates in a zero-height header.
 * They never enter body flow, and no raster image is embedded in this layer. */
export function frameHeaderXML(frame:ReportFrameStyle){
 const shapes=buildFramePrimitives(frame).map((p,i)=>{
  const common=`id="ReportFrame${i}" strokecolor="${p.stroke}" strokeweight="${fmt(p.strokeWidthPt)}pt" filled="${p.fill==='none'?'f':'t'}" fillcolor="${p.fill==='none'?p.stroke:p.fill}"`;
  const stroke=`<v:stroke opacity="${fmt(p.opacity)}" endcap="round"/><v:fill opacity="${fmt(p.opacity)}"/>`;
  const base='position:absolute;mso-position-horizontal-relative:page;mso-position-vertical-relative:page;z-index:-251654144;mso-wrap-style:none;';
  if(p.type==='circle')return `<v:oval ${common} style="${base}left:${fmt(p.cx!-p.r!)}mm;top:${fmt(p.cy!-p.r!)}mm;width:${fmt(p.r!*2)}mm;height:${fmt(p.r!*2)}mm">${stroke}<w10:wrap type="none"/></v:oval>`;
  // Each segment is a native line. Avoid path grammar and inherited group coordinates.
  return p.points.slice(1).map((b,j)=>{const a=p.points[j];return `<v:line ${common.replace(`ReportFrame${i}`,`ReportFrame${i}_${j}`)} style="${base}" from="${fmt(a[0])}mm,${fmt(a[1])}mm" to="${fmt(b[0])}mm,${fmt(b[1])}mm">${stroke}<w10:wrap type="none"/></v:line>`;}).join('');
 }).join('');
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w10="urn:schemas-microsoft-com:office:word"><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr><w:r><w:pict>${shapes}</w:pict></w:r></w:p></w:hdr>`;
}
export async function addFrameToWord(archive:JSZip,frame:ReportFrameStyle,sectionKinds:('cover'|'body'|'appendix'|'preliminary')[]){
 const approved=await assertApprovedFrame(frame);if(approved.layout==='none')return;
 const name='headerReportFrame.xml',id='rIdReportFrame',emptyName='headerReportFrameEmpty.xml',emptyId='rIdReportFrameEmpty';
 archive.file('word/'+name,frameHeaderXML(approved));
 archive.file('word/'+emptyName,'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr></w:p></w:hdr>');
 const relPath='word/_rels/document.xml.rels',relations=await archive.file(relPath)!.async('string');
 if(relations.includes(`Id="${id}"`))throw Error('页框关系标识冲突。');
 archive.file(relPath,relations.replace('</Relationships>',`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="${name}"/><Relationship Id="${emptyId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="${emptyName}"/></Relationships>`));
 const types=await archive.file('[Content_Types].xml')!.async('string');archive.file('[Content_Types].xml',types.replace('</Types>',`<Override PartName="/word/${name}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/${emptyName}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>`));
 const document=await archive.file('word/document.xml')!.async('string');let index=0;
 archive.file('word/document.xml',document.replace(/<w:sectPr\b([^>]*?)(?:\/>|>([\s\S]*?)<\/w:sectPr>)/g,(_all,attrs:string,inside='')=>{const kind=sectionKinds[index++];const apply=kind!=='preliminary'&&approved.appliesTo.includes(kind as 'cover'|'body'|'appendix');return `<w:sectPr${attrs}><w:headerReference w:type="default" r:id="${apply?id:emptyId}"/>${inside.replace(/<w:headerReference\b(?=[^>]*w:type="default")[^>]*\/>/g,'')}</w:sectPr>`;}));
}
/** Trusted template code only. Report body never receives these commands. */
export function frameTexPreamble(frame:ReportFrameStyle){
 const s=frame,primitives=buildFramePrimitives(s);if(s.layout==='none')return [];
 const definitions=[`\\definecolor{FramePrimary}{HTML}{${s.palette.primary.slice(1)}}`,`\\definecolor{FrameSecondary}{HTML}{${s.palette.secondary.slice(1)}}`,`\\definecolor{FrameAccent}{HTML}{${s.palette.accent.slice(1)}}`];
 const color=(hex:string)=>hex===s.palette.primary?'FramePrimary':hex===s.palette.secondary?'FrameSecondary':'FrameAccent';
 // A white report page permits exact colour blending without late shipout alpha resources.
 const draws=primitives.map(p=>{const blend=(hex:string)=>`${color(hex)}!${fmt(p.opacity*100)}!white`;return `\\draw[draw=${blend(p.stroke)},${p.fill==='none'?'fill=none':`fill=${blend(p.fill)}`},line width=${fmt(p.strokeWidthPt)}pt,line cap=round,line join=round] `+(p.type==='circle'?`(${fmt(p.cx!)},${fmt(p.cy!)}) circle[radius=${fmt(p.r!)}mm]`:p.points.map(([x,y])=>`(${fmt(x)},${fmt(y)})`).join(' -- '))+';';});
 return ['\\usepackage{tikz}',...definitions,'\\newif\\ifReportFrameActive','\\ReportFrameActivefalse','\\AddToHook{shipout/background}{\\ifReportFrameActive','\\begin{tikzpicture}[remember picture,overlay,x=1mm,y=-1mm]','\\begin{scope}[shift={(current page.north west)}]',...draws,'\\end{scope}','\\end{tikzpicture}','\\fi}'];
}
