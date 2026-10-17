import {chartData, resultFor, verifyResearchQuality, findingNeedsReview, findingSignature, type ReportBlock, type ResultSnapshot, type SlideObject} from './research-quality.ts';
import type {EditorContent} from './editor-model.ts';
import {getVectorPrimitives} from './vector-assets.ts';
import type PptxGenJS from 'pptxgenjs';
import {figureFor,reportFigureSVG,assertFormalFigureCapacity,projectPalette,defaultProjectVisualStyle,percentSeries,type ReportFigure} from './report-figure.ts';
import {assertTrueVector} from './vector-svg.ts';
export {assertTrueVector} from './vector-svg.ts';
export const evidenceLabel=(r:ResultSnapshot)=>`来源：${r.sourceName}${r.sourceUrl?' · '+r.sourceUrl:''}；有效样本 n=${r.n} / ${r.total}；${r.classification==='simulated'?'模拟数据':r.classification==='public'?'公开数据':'用户提供数据'}${r.warnings.length?'；'+r.warnings.join('；'):''}`;
export const valueText=(v:string|number|null)=>v===null?'—':typeof v==='number'?String(Number(v.toFixed(3))):v;
export const chartNumberFormat=(values:number[])=>values.every(Number.isInteger)?'0':'0.000';
export function assertTableRows(r:ResultSnapshot){if(!r.rows.length)throw Error(`表格“${r.title}”没有数据行，请调整筛选或共同应答范围后重新计算，或移除该表格。`);}
export function assertFindingReferences(c:EditorContent){for(const section of c.report)for(const id of section.findingIds??[]){const finding=c.quality?.findings.find(f=>f.id===id);if(!finding)throw Error('章节引用的研究发现不存在：'+id);if(!c.quality||findingNeedsReview(finding,c.quality))throw Error('章节引用的研究发现待复核：'+id);if(section.findingSnapshots?.[id]!==findingSignature(finding))throw Error('发现内容已更新，请核对章节并更新关联。');}}
export async function validateQuality(c:EditorContent){if(c.quality)await verifyResearchQuality(c.quality);for(const figure of c.figures??[])figureFor(c,figure.id);}
const figureCell=(value:string|number|null,figure?:ReportFigure|null)=>typeof value==='number'&&figure?String(Number(value.toFixed(figure.style.decimals))):valueText(value);
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
 // SVG remains authoritative; compatibility previews must be genuinely rendered.
 if(typeof document==='undefined')throw Error('SVG 兼容预览需要渲染器，请在浏览器导出或提供 SVG 渲染器。');
 const image=new Image();image.src=svgURI(svg);await image.decode();const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=700;const ctx=canvas.getContext('2d');if(!ctx)throw Error('兼容预览生成失败。');ctx.drawImage(image,0,0,1000,700);return Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));
}
export async function wordBlocks(blocks:ReportBlock[],c:EditorContent,renderSvg:SvgPreviewRenderer=preview){
 const {Paragraph,TextRun,Table,TableRow,TableCell,AlignmentType,BorderStyle,WidthType,ImageRun}=await import('docx');const out:(InstanceType<typeof Paragraph>|InstanceType<typeof Table>)[]=[];
 for(const b of blocks){
  if(b.kind==='formula')throw Error('Word 暂不导出公式块，请使用 LaTeX 或改为正文公式说明。');
  if(b.kind!=='chart'&&b.kind!=='table'){out.push(new Paragraph({style:b.kind==='citation'?'ReportReference':'Normal',text:b.text}));continue;}
  const r=resultFor(c.quality,b.evidenceId),figure=b.figureId?figureFor(c,b.figureId,b.evidenceId):null;
  if(figure&&((b.kind==='table')!==(figure.kind==='table')))throw Error('图形与内容块类型不一致，请重新选择。');
  if(b.kind==='chart'){const svg=figure?reportFigureSVG(figure,c.visualStyle??defaultProjectVisualStyle()):chartSVG(r,b.valueColumn,`#${c.accent==='teal'?'0F766E':c.accent==='burgundy'?'8A3449':'234E80'}`);out.push(new Paragraph({alignment:AlignmentType.CENTER,keepNext:true,keepLines:true,children:[new ImageRun({type:'svg',data:new TextEncoder().encode(svg),fallback:{type:'png',data:await renderSvg(svg)},transformation:{width:530,height:371},altText:{title:b.text||r.title,description:evidenceLabel(r),name:b.id}})]}),new Paragraph({style:'ReportCaption',keepNext:true,keepLines:true,text:b.text||r.title}));}
  else{const table=figure?.table??r;assertTableRows({...r,rows:table.rows});if(table.headers.length>10)throw Error('表格超过 10 列，请分拆后导出 Word。');if(b.text)out.push(new Paragraph({style:'ReportCaption',keepNext:true,keepLines:true,text:b.text}));const none={style:BorderStyle.NONE,size:0,color:'FFFFFF'};const rows=[table.headers,...table.rows].map((row,i)=>new TableRow({tableHeader:i===0,cantSplit:true,children:row.map(cell=>new TableCell({borders:{top:i===0?{style:BorderStyle.SINGLE,size:12,color:'000000'}:none,bottom:i===0?{style:BorderStyle.SINGLE,size:6,color:'000000'}:i===table.rows.length?{style:BorderStyle.SINGLE,size:12,color:'000000'}:none,left:none,right:none},children:[new Paragraph({style:'ReportTableText',alignment:AlignmentType.CENTER,keepNext:table.rows.length<=15||i===table.rows.length,keepLines:true,children:[new TextRun({text:figureCell(cell,figure),bold:i===0})]})]}))}));out.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows,borders:{top:none,bottom:none,left:none,right:none,insideHorizontal:none,insideVertical:none}}));}
  if(figure?.note)out.push(new Paragraph({style:'ReportReference',text:figure.note}));
  out.push(new Paragraph({style:'ReportReference',keepLines:evidenceLabel(r).length<500,text:evidenceLabel(r)}));
 }return out;
}
function fitText(text:string,w:number,h:number,fs:number){const slots=Math.max(1,Math.floor(w*72/fs));const lines=text.split(/\r?\n/).reduce((n,l)=>n+Math.max(1,Math.ceil(Array.from(l).reduce((a,c)=>a+(/[\u3000-\uffff]/.test(c)?1:.55),0)/slots)),0);if(lines*fs*1.22>h*72)throw Error('文本超出对象尺寸，请扩大对象或分拆幻灯片。');}
async function addSvgFigure(slide:PptxGenJS.Slide,svg:string,box:{x:number;y:number;w:number;h:number;objectName:string},renderSvg:SvgPreviewRenderer){
 const png=await renderSvg(svg);if(png.length<8||![137,80,78,71,13,10,26,10].every((v,i)=>png[i]===v))throw Error('SVG 兼容预览不是有效 PNG。');
 // PptxGenJS4's Node path otherwise substitutes IMG_BROKEN. Patch only the
 // newly created preview relation, retaining its authoritative SVG relation.
 const media=(slide as unknown as {_relsMedia?:{isSvgPng?:boolean;type?:string;data?:string}[]})._relsMedia;
 if(!media)throw Error('PPT SVG 兼容层不可用。');const offset=media.length;
 slide.addImage({...box,data:svgURI(svg)});
 const fallback=media.slice(offset).find(rel=>rel.isSvgPng&&rel.type==='image/png');
 if(!fallback)throw Error('PPT SVG 兼容层未生成预览关系。');fallback.data=`data:image/png;base64,${b64(png)}`;fallback.isSvgPng=false;
}
export async function addQualityObjects(slide:PptxGenJS.Slide,pptx:PptxGenJS,objects:SlideObject[],c:EditorContent,renderSvg:SvgPreviewRenderer=preview){
 const evidence=new Map<string,ResultSnapshot>();
 const figureNotes=new Set<string>();
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
  else{if(o.rotation!==0||o.opacity!==1)throw Error('原生图表和表格暂不支持旋转或透明度，请恢复为 0° 和完全不透明。');const sourceResult=resultFor(c.quality,o.evidenceId),figure=o.figureId?figureFor(c,o.figureId,o.evidenceId):null;const r=figure?.kind==='table'?{...sourceResult,...figure.table}:sourceResult;evidence.set(sourceResult.id,sourceResult);
   if(figure&&((o.kind==='table')!==(figure.kind==='table')))throw Error('图形与对象类型不一致，请重新选择。');if(figure?.note)figureNotes.add(`${figure.title}：${figure.note}`);
   if(figure)assertFormalFigureCapacity(figure);
   if(o.kind==='chart'&&figure){
    if(box.h<1.5||box.w<3)throw Error('图表对象过小，请扩大图表。');
    const palette=projectPalette(c.visualStyle??defaultProjectVisualStyle()),native=['bar','horizontal_bar','grouped_bar','percent_stacked'].includes(figure.kind)&&figure.series.every(s=>s.values.every(v=>v!==null));
    if(native){const series=figure.kind==='percent_stacked'?percentSeries(figure):figure.series;const format=figure.kind==='percent_stacked'?'0'+(figure.style.decimals?'.'+'0'.repeat(figure.style.decimals):'')+'"%"':'0'+(figure.style.decimals?'.'+'0'.repeat(figure.style.decimals):'');
     slide.addChart(pptx.ChartType.bar,series.map(s=>({name:s.name,labels:figure.labels,values:s.values as number[]})),{...box,h:box.h-.4,barDir:figure.kind==='horizontal_bar'?'bar':'col',barGrouping:figure.kind==='percent_stacked'?'stacked':'clustered',showLegend:series.length>1,showValue:figure.style.showLabels,showTitle:false,chartColors:palette.colors.map(color=>color.slice(1)),catAxisLabelFontFace:'Microsoft YaHei',catAxisLabelFontSize:16,valAxisLabelFontSize:16,dataLabelFontFace:'Microsoft YaHei',dataLabelFontSize:16,dataLabelColor:'263D4D',legendFontSize:16,dataLabelFormatCode:format,dataLabelPosition:figure.kind==='percent_stacked'?'ctr':'outEnd',catAxisLabelPos:'low',valAxisLabelFormatCode:figure.kind==='percent_stacked'?'0"%"':undefined,valAxisMinVal:figure.kind==='percent_stacked'?0:undefined,valAxisMaxVal:figure.kind==='percent_stacked'?100:undefined,catAxisTitle:figure.xLabel,valAxisTitle:figure.yLabel,catAxisLineShow:figure.style.showBorder,valAxisLineShow:figure.style.showBorder,valGridLine:{style:figure.style.showGrid?'solid':'none',color:'E4E9EC',size:1}});
    }else await addSvgFigure(slide,reportFigureSVG(figure,c.visualStyle??defaultProjectVisualStyle()),{...box,h:box.h-.4},renderSvg);
   }
   else if(o.kind==='chart'){const {labels,values}=chartData(r,o.valueColumn);if(o.chartType==='pie'&&(values.some(v=>v<0)||values.reduce((a,b)=>a+b,0)<=0))throw Error('饼图需要非负且总和大于零的数值。');if(box.h<1.5||box.w<3)throw Error('图表对象过小，请扩大图表。');slide.addChart(pptx.ChartType[o.chartType],[{name:r.headers[o.valueColumn],labels,values}],{...box,h:box.h-.4,barDir:'col',showLegend:o.chartType==='pie',showValue:true,showTitle:false,chartColors:[o.color.slice(1),'4C83A8','78A8B9','B6CED6','E0EBEE'],catAxisLabelFontFace:'Microsoft YaHei',catAxisLabelFontSize:14,valAxisLabelFontSize:14,dataLabelFontFace:'Microsoft YaHei',dataLabelFontSize:16,dataLabelColor:o.chartType==='bar'?'FFFFFF':'243849',legendFontSize:16,dataLabelFormatCode:chartNumberFormat(values),dataLabelPosition:o.chartType==='bar'?'ctr':o.chartType==='line'?'t':'bestFit',catAxisLabelPos:'low'});}
   else{assertTableRows(r);const rows=[r.headers,...r.rows],fs=Math.max(14,o.fontSize),rowH=fs*1.45/72;if(rows.length>15||r.headers.length>8||rows.length*rowH>box.h-.35)throw Error('表格容量超出幻灯片，请分拆表格或扩大对象。');const none={type:'solid' as const,pt:0,color:'FFFFFF'};const cells=rows.map((row,i)=>row.map(cell=>{fitText(figureCell(cell,figure),box.w/r.headers.length-.1,rowH,fs);return{text:figureCell(cell,figure),options:{bold:i===0,align:'center' as const,border:[i===0?{type:'solid' as const,pt:1.5,color:'000000'}:none,none,i===0?{type:'solid' as const,pt:.75,color:'000000'}:i===rows.length-1?{type:'solid' as const,pt:1.5,color:'000000'}:none,none] as [PptxGenJS.BorderProps,PptxGenJS.BorderProps,PptxGenJS.BorderProps,PptxGenJS.BorderProps]}};}));slide.addTable(cells,{...box,h:box.h-.35,fontSize:fs,fontFace:'Microsoft YaHei',color:o.color.slice(1),align:'center',valign:'middle',margin:2,autoPage:false,rowH,border:none});}
   const caption=`n=${r.n} / ${r.total} · ${r.sourceName}`;fitText(caption,box.w,.27,13);
   slide.addText(caption,{x:box.x,y:box.y+box.h-.28,w:box.w,h:.27,fontFace:'Microsoft YaHei',fontSize:13,color:'64748B',margin:0});
  }
 }return [...[...evidence.values()].map(evidenceLabel),...figureNotes].join('\n');
}
