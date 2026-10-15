import {chartData, resultFor, verifyResearchQuality, findingNeedsReview, findingSignature, type ReportBlock, type ResultSnapshot, type SlideObject} from './research-quality.ts';
import type {EditorContent} from './editor-model.ts';
import {getVectorPrimitives} from './vector-assets.ts';
import {assertTrueVector} from './svg-safety.ts';
import {blockLabel, numberedCaption, resolveReferences, type BlockLabel} from './report-numbering.ts';
import {columnWeights, presentResult, sectionNotes, sourceLine, tableSpans} from './report-tables.ts';
import {splitInlineMath} from './inline-math.ts';
import type PptxGenJS from 'pptxgenjs';
export {assertTrueVector};
export const evidenceLabel=(r:ResultSnapshot)=>`来源：${r.sourceName}${r.sourceUrl?' · '+r.sourceUrl:''}；有效样本 n=${r.n} / ${r.total}；${r.classification==='simulated'?'模拟数据':r.classification==='public'?'公开数据':'用户提供数据'}${r.warnings.length?'；'+r.warnings.join('；'):''}`;
export const valueText=(v:string|number|null)=>v===null?'—':typeof v==='number'?String(Number(v.toFixed(3))):v;
export const chartNumberFormat=(values:number[])=>values.every(Number.isInteger)?'0':'0.000';
export function assertTableRows(r:ResultSnapshot){if(!r.rows.length)throw Error(`表格“${r.title}”没有数据行，请调整筛选或共同应答范围后重新计算，或移除该表格。`);}
export function assertFindingReferences(c:EditorContent){for(const section of c.report)for(const id of section.findingIds??[]){const finding=c.quality?.findings.find(f=>f.id===id);if(!finding)throw Error('章节引用的研究发现不存在：'+id);if(!c.quality||findingNeedsReview(finding,c.quality))throw Error('章节引用的研究发现待复核：'+id);if(section.findingSnapshots?.[id]!==findingSignature(finding))throw Error('发现内容已更新，请核对章节并更新关联。');}}
export async function validateQuality(c:EditorContent){if(c.quality)await verifyResearchQuality(c.quality);}
const xml=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]!);
const b64=(bytes:Uint8Array)=>btoa(Array.from(bytes,v=>String.fromCharCode(v)).join(''));
export const svgURI=(svg:string)=>`data:image/svg+xml;base64,${b64(new TextEncoder().encode(assertTrueVector(svg)))}`;
export function chartSVG(r:ResultSnapshot,column:number,color='#255D87'){
 if(!/^#[a-fA-F0-9]{6}$/.test(color))throw Error('图表颜色无效。');const {labels,values}=chartData(r,column);if(labels.length>16||values.some(v=>Math.abs(v)>1e12))throw Error('图表类别或数值范围过大，请分拆或转换计量单位。');const min=Math.min(0,...values),max=Math.max(0,...values),span=max-min||1,slot=840/labels.length;
 const y=(v:number)=>40+(max-v)/span*510;
 const parts=['<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700"><rect width="1000" height="700" fill="white"/>','<path d="M110 40V550H970" stroke="#334155" fill="none"/>'];
 for(let i=0;i<=4;i++){const v=min+span*i/4;parts.push(`<text x="96" y="${y(v)+7}" font-family="sans-serif" font-size="30" text-anchor="end">${xml(valueText(v))}</text>`);}
 labels.forEach((label,i)=>{const x=110+slot*(i+.5);parts.push(`<rect x="${110+slot*(i+.15)}" y="${Math.min(y(values[i]),y(0))}" width="${slot*.7}" height="${Math.abs(y(values[i])-y(0))}" fill="${color}"/><text x="${x}" y="${y(values[i])-10}" font-family="sans-serif" font-size="30" text-anchor="middle">${xml(valueText(values[i]))}</text><text x="${x}" y="582" font-family="sans-serif" font-size="28" text-anchor="middle" transform="rotate(-35 ${x} 582)">${xml(label)}</text>`);});
 return assertTrueVector(parts.join('')+'</svg>');
}
export type SvgPreviewRenderer=(svg:string)=>Promise<Uint8Array>;
async function preview(svg:string){
 // SVG remains authoritative; compatibility previews must be genuinely rendered at the figure's own size.
 if(typeof document==='undefined')throw Error('SVG 兼容预览需要渲染器，请在浏览器导出或提供 SVG 渲染器。');
 const size=/<svg\b[^>]*?\bwidth="(\d+(?:\.\d+)?)"[^>]*?\bheight="(\d+(?:\.\d+)?)"/.exec(svg),width=Math.round(Number(size?.[1]??1000)),height=Math.round(Number(size?.[2]??700));
 const image=new Image();image.src=svgURI(svg);await image.decode();const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;const ctx=canvas.getContext('2d');if(!ctx)throw Error('兼容预览生成失败。');ctx.drawImage(image,0,0,width*2,height*2);return Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));
}

/** Office Math cannot be built through docx's API; formulas travel as placeholder runs and are swapped in after packing. */
export type MathSlot={omml:string;display:boolean};
export const mathPlaceholder=(index:number)=>`§§OMML${index}§§`;
/** `section` is the ID of the section being written; captions look their numbers up by section and block. */
export type WordContext={labels:Map<string,BlockLabel>;math:MathSlot[];where:string;section:string};
/** A4 text width (210 mm − 2 × 31.8 mm) in twentieths of a point, and in pixels for images. */
export const TEXT_WIDTH={twips:8300,px:553} as const;
export {splitInlineMath};
/** Text runs with figure references resolved and `$…$` turned into inline equations. */
export async function richRuns(text:string,ctx:WordContext,run:Record<string,unknown>={}){
 const {TextRun}=await import('docx');const {texToOmml}=await import('./omml.ts');
 return splitInlineMath(resolveReferences(text,ctx.labels,ctx.where)).map(part=>{
  if(!part.math)return new TextRun({...run,text:part.text});
  ctx.math.push({omml:texToOmml(part.text,false),display:false});
  return new TextRun({...run,text:mathPlaceholder(ctx.math.length-1)});
 });
}
/** Swaps every math placeholder run in document.xml for its equation. */
export function insertMath(documentXml:string,math:readonly MathSlot[]):string{
 return documentXml.replace(/<w:r>(?:(?!<\/w:r>)[\s\S])*?§§OMML(\d+)§§(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g,(_match,index:string)=>{
  const slot=math[Number(index)];if(!slot)throw Error('公式占位与公式数量不一致。');
  return slot.display?`<m:oMathPara><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>${slot.omml}</m:oMathPara>`:slot.omml;
 });
}
const ACCENT_HEX:Record<EditorContent['accent'],string>={teal:'#0F766E',blue:'#234E80',burgundy:'#8A3449'};
export async function wordBlocks(blocks:ReportBlock[],c:EditorContent,renderSvg:SvgPreviewRenderer=preview,context?:WordContext){
 const {Paragraph,TextRun,Table,TableRow,TableCell,AlignmentType,BorderStyle,WidthType,ImageRun,VerticalAlign,VerticalMergeType}=await import('docx');
 const {figureSVG,svgSize}=await import('./report-figures.ts');
 const {texToOmml}=await import('./omml.ts');
 const ctx:WordContext=context??{labels:(await import('./report-numbering.ts')).reportLabels(c.report),math:[],where:'内容块',section:''};
 const sectionId=ctx.section||c.report.find(s=>s.blocks===blocks)?.id||'';
 const out:(InstanceType<typeof Paragraph>|InstanceType<typeof Table>)[]=[];
 const none={style:BorderStyle.NONE,size:0,color:'FFFFFF'},rule=(size:number)=>({style:BorderStyle.SINGLE,size,color:'000000'});
 const used:ResultSnapshot[]=[];
 for(const [index,b] of blocks.entries()){
  if(b.kind==='formula'){
   // Display equation: a borderless three-cell row keeps Word's display style and puts the number at the right margin.
   ctx.math.push({omml:texToOmml(b.text,true),display:true});
   const label=blockLabel(ctx.labels,sectionId,b.id)?.label??'';
   // Side cells are wide enough for a number such as （12-10） on one line.
   const side=1400,middle=TEXT_WIDTH.twips-2*side;
   const cell=(width:number,children:InstanceType<typeof Paragraph>[])=>new TableCell({width:{size:width,type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,borders:{top:none,bottom:none,left:none,right:none},children});
   out.push(new Table({width:{size:TEXT_WIDTH.twips,type:WidthType.DXA},columnWidths:[side,middle,side],borders:{top:none,bottom:none,left:none,right:none,insideHorizontal:none,insideVertical:none},rows:[new TableRow({cantSplit:true,children:[
    cell(side,[new Paragraph({style:'ReportEquation'})]),
    cell(middle,[new Paragraph({style:'ReportEquation',alignment:AlignmentType.CENTER,children:[new TextRun(mathPlaceholder(ctx.math.length-1))]})]),
    cell(side,[new Paragraph({style:'ReportEquation',alignment:AlignmentType.RIGHT,children:[new TextRun(label)]})]),
   ]})]}));
   continue;
  }
  if(b.kind!=='chart'&&b.kind!=='table'){out.push(new Paragraph({style:b.kind==='citation'?'ReportReference':'Normal',children:await richRuns(b.text,ctx)}));continue;}
  const r=resultFor(c.quality,b.evidenceId);
  if(!used.includes(r))used.push(r);
  // A chart and a table of the same result share one source line, placed after the second.
  const next=blocks[index+1],source=!(next&&(next.kind==='chart'||next.kind==='table')&&next.evidenceId===b.evidenceId);
  const caption=numberedCaption(blockLabel(ctx.labels,sectionId,b.id),resolveReferences(b.text||r.title,ctx.labels,ctx.where));
  if(b.kind==='chart'){
   const svg=await figureSVG(r,b.valueColumn,ACCENT_HEX[c.accent]);
   // Figures share one width and size their height to the content; Word keeps the same proportions.
   const size=svgSize(svg),height=Math.round(TEXT_WIDTH.px*size.height/size.width);
   out.push(new Paragraph({style:'ReportFigure',keepNext:true,keepLines:true,children:[new ImageRun({type:'svg',data:new TextEncoder().encode(svg),fallback:{type:'png',data:await renderSvg(svg)},transformation:{width:TEXT_WIDTH.px,height},altText:{title:caption,description:sourceLine(r),name:b.id}})]}));
   out.push(new Paragraph({style:'ReportFigureCaption',keepNext:source,keepLines:true,children:[new TextRun(caption)]}));
  }else{
   assertTableRows(r);
   const table=presentResult(r);
   if(table.headers.length>10)throw Error('表格超过 10 列，请分拆后导出 Word。');
   const weights=columnWeights(table),total=weights.reduce((a,v)=>a+v,0);
   const widths=weights.map(w=>Math.round(TEXT_WIDTH.twips*w/total));
   out.push(new Paragraph({style:'ReportTableCaption',keepNext:true,keepLines:true,children:[new TextRun(caption)]}));
   const all=[table.headers,...table.rows];
   // Short tables stay on one page with their notes; long ones may break, with the header row repeated.
   const small=all.length<=16,follows=source||!!table.note;
   // A parent unit repeated on its children's rows (a sampling frame) is one vertically merged cell; covered cells stay empty.
   const spans=tableSpans(r,table),span=(i:number,col:number)=>i===0||!spans?1:spans[i-1][col];
   const rows=all.map((row,i)=>new TableRow({tableHeader:i===0,cantSplit:true,children:row.map((cell,col)=>new TableCell({width:{size:widths[col],type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,...(span(i,col)===0?{verticalMerge:VerticalMergeType.CONTINUE}:span(i,col)>1?{verticalMerge:VerticalMergeType.RESTART}:{}),borders:{top:i===0?rule(12):none,bottom:i===0?rule(6):i===all.length-1?rule(12):none,left:none,right:none},children:[new Paragraph({style:'ReportTableText',keepNext:small?i<all.length-1||follows:i===0,keepLines:true,children:span(i,col)===0?[]:[new TextRun({text:cell,bold:i===0})]})]}))}));
   out.push(new Table({width:{size:TEXT_WIDTH.twips,type:WidthType.DXA},columnWidths:widths,rows,borders:{top:none,bottom:none,left:none,right:none,insideHorizontal:none,insideVertical:none}}));
   if(table.note)out.push(new Paragraph({style:'ReportSource',keepNext:source,text:table.note}));
  }
  if(source)out.push(new Paragraph({style:'ReportSource',text:sourceLine(r)}));
 }
 const notes=sectionNotes(used);
 if(notes)out.push(new Paragraph({style:'ReportNote',text:notes}));
 return out;
}
function fitText(text:string,w:number,h:number,fs:number){const slots=Math.max(1,Math.floor(w*72/fs));const lines=text.split(/\r?\n/).reduce((n,l)=>n+Math.max(1,Math.ceil(Array.from(l).reduce((a,c)=>a+(/[\u3000-\uffff]/.test(c)?1:.55),0)/slots)),0);if(lines*fs*1.22>h*72)throw Error('文本超出对象尺寸，请扩大对象或分拆幻灯片。');}
export function addQualityObjects(slide:PptxGenJS.Slide,pptx:PptxGenJS,objects:SlideObject[],c:EditorContent){
 const evidence=new Map<string,ResultSnapshot>();
 for(const o of objects){const box={x:o.x/100*13.333333,y:o.y/100*7.5,w:o.width/100*13.333333,h:o.height/100*7.5,rotate:o.rotation,objectName:o.id};
  if(o.kind==='text'){fitText(o.text,box.w,box.h,o.fontSize);slide.addText(o.text,{...box,fontFace:'Microsoft YaHei',lang:'zh-CN',fontSize:o.fontSize,color:o.color.slice(1),align:o.align,bold:o.bold??false,valign:'top',margin:0,transparency:(1-o.opacity)*100});}
  else if(o.kind==='shape')slide.addShape(pptx.ShapeType[o.shape],{...box,line:{color:o.color.slice(1),transparency:(1-o.opacity)*100,width:1},fill:{color:o.color.slice(1),transparency:(1-o.opacity)*100}});
  else if(o.kind==='vector'){
   const scale=Math.min(box.w/320,box.h/240),dx=box.x+(box.w-320*scale)/2,dy=box.y+(box.h-240*scale)/2,angle=o.rotation*Math.PI/180,cx=box.x+box.w/2,cy=box.y+box.h/2;
   getVectorPrimitives(o.assetId,o.color).forEach((p,i)=>{
    const centerX=dx+(p.x+p.width/2)*scale,centerY=dy+(p.y+p.height/2)*scale;
    const x=cx+(centerX-cx)*Math.cos(angle)-(centerY-cy)*Math.sin(angle),y=cy+(centerX-cx)*Math.sin(angle)+(centerY-cy)*Math.cos(angle),w=Math.abs(p.width)*scale,h=Math.abs(p.height)*scale;
    const transparency=(1-o.opacity*(p.opacity??1))*100;
    slide.addShape(pptx.ShapeType[p.shape],{x:x-w/2,y:y-h/2,w,h,rotate:((o.rotation+(p.rotation??0))%360+360)%360,flipH:p.width<0,flipV:p.height<0,objectName:o.id+'.'+i,...(p.shape==='roundRect'?{rectRadius:7*scale}:{}),fill:p.fill?{color:p.fill.slice(1),transparency}:{color:'FFFFFF',transparency:100},line:p.stroke?{color:p.stroke.slice(1),width:(p.lineWidth??1)*scale*72,transparency}:{color:'FFFFFF',width:0,transparency:100}});
   });
  }
  else{if(o.rotation!==0||o.opacity!==1)throw Error('原生图表和表格暂不支持旋转或透明度，请恢复为 0° 和完全不透明。');const r=resultFor(c.quality,o.evidenceId);evidence.set(r.id,r);
   if(o.kind==='chart'){const {labels,values}=chartData(r,o.valueColumn);if(o.chartType==='pie'&&(values.some(v=>v<0)||values.reduce((a,b)=>a+b,0)<=0))throw Error('饼图需要非负且总和大于零的数值。');if(box.h<1.5||box.w<3)throw Error('图表对象过小，请扩大图表。');slide.addChart(pptx.ChartType[o.chartType],[{name:r.headers[o.valueColumn],labels,values}],{...box,h:box.h-.4,barDir:'col',showLegend:o.chartType==='pie',showValue:true,showTitle:false,chartColors:[o.color.slice(1),'4C83A8','78A8B9','B6CED6','E0EBEE'],catAxisLabelFontFace:'Microsoft YaHei',catAxisLabelFontSize:14,valAxisLabelFontSize:14,dataLabelFontFace:'Microsoft YaHei',dataLabelFontSize:16,dataLabelColor:o.chartType==='bar'?'FFFFFF':'243849',legendFontSize:16,dataLabelFormatCode:chartNumberFormat(values),dataLabelPosition:o.chartType==='bar'?'ctr':o.chartType==='line'?'t':'bestFit',catAxisLabelPos:'low'});}
   else{assertTableRows(r);const rows=[r.headers,...r.rows],fs=Math.max(14,o.fontSize),rowH=fs*1.45/72;if(rows.length>15||r.headers.length>8||rows.length*rowH>box.h-.35)throw Error('表格容量超出幻灯片，请分拆表格或扩大对象。');const none={type:'solid' as const,pt:0,color:'FFFFFF'};const cells=rows.map((row,i)=>row.map(cell=>{fitText(valueText(cell),box.w/r.headers.length-.1,rowH,fs);return{text:valueText(cell),options:{bold:i===0,align:'center' as const,border:[i===0?{type:'solid' as const,pt:1.5,color:'000000'}:none,none,i===0?{type:'solid' as const,pt:.75,color:'000000'}:i===rows.length-1?{type:'solid' as const,pt:1.5,color:'000000'}:none,none] as [PptxGenJS.BorderProps,PptxGenJS.BorderProps,PptxGenJS.BorderProps,PptxGenJS.BorderProps]}};}));slide.addTable(cells,{...box,h:box.h-.35,fontSize:fs,fontFace:'Microsoft YaHei',color:o.color.slice(1),align:'center',valign:'middle',margin:2,autoPage:false,rowH,border:none});}
   const caption=`n=${r.n} / ${r.total} · ${r.sourceName}`;fitText(caption,box.w,.27,13);
   slide.addText(caption,{x:box.x,y:box.y+box.h-.28,w:box.w,h:.27,fontFace:'Microsoft YaHei',fontSize:13,color:'64748B',margin:0});
  }
 }return [...evidence.values()].map(evidenceLabel).join('\n');
}
