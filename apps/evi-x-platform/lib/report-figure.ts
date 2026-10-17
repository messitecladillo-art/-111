import { CHART_THEMES } from './chart-theme.ts';
import type { ChartSnapshot, ChartThemeId, FigureSettings } from './chart-types.ts';
import type {ResultSnapshot} from './research-quality.ts';

export const REPORT_FIGURE_KINDS = ['bar','horizontal_bar','grouped_bar','percent_stacked','heatmap','histogram','boxplot','table'] as const;
export type ReportFigureKind = typeof REPORT_FIGURE_KINDS[number];
export type ProjectVisualStyle = {schema:'ProjectVisualStyle/v1'; paletteId:ChartThemeId; version:number};
/** Aggregate-only portable figure. No record pairs, strips or outlier identities. */
export type ReportFigure = {
  schema:'ReportFigure/v1'; id:string; resultId:string; resultHash:string; kind:ReportFigureKind;
  title:string; xLabel:string; yLabel:string; note:string; n:number;
  labels:string[]; series:{name:string;values:(number|null)[]}[];
  bins:{start:number;end:number;count:number}[];
  boxes:{label:string;low:number;q1:number;median:number;q3:number;high:number}[];
  table:{headers:string[];rows:(string|number|null)[][]};
  style:{decimals:number;showLabels:boolean;showGrid:boolean;showBorder:boolean};
};
export type FigureContext={figures?:ReportFigure[];visualStyle?:ProjectVisualStyle;quality?:{results:Pick<ResultSnapshot,'id'|'resultHash'>[]}};
/** Browser-only source; only figuresFromRegistration's aggregate output persists. */
export type ChartRegistrationContext={snapshot:ChartSnapshot;settings:FigureSettings;theme:ChartThemeId};
export const REPORT_FIGURE_LABELS:Record<ReportFigureKind,string>={bar:'柱形图',horizontal_bar:'条形图',grouped_bar:'分组柱形图',percent_stacked:'百分比堆叠图',heatmap:'热力图',histogram:'直方图',boxplot:'箱线图',table:'三线表'};
export const REPORT_FIGURE_FAMILIES=[{title:'比较与构成',kinds:['bar','horizontal_bar','grouped_bar','percent_stacked']},{title:'分布与结构',kinds:['heatmap','histogram','boxplot']},{title:'精确数值',kinds:['table']}] as const;
export const defaultProjectVisualStyle=():ProjectVisualStyle=>({schema:'ProjectVisualStyle/v1',paletteId:'blue',version:1});
const fail=():never=>{throw Error('图形定义无效或与当前结果不一致。');};
function record(v:unknown,keys:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).some(k=>typeof k!=='string'||!keys.includes(k)||!('value' in Object.getOwnPropertyDescriptor(v,k)!)))return fail();return v as Record<string,unknown>;}
const text=(v:unknown,max=300):string=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\p{Surrogate}]/u.test(v)?v:fail();
const num=(v:unknown,min=-1e12,max=1e12):number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:fail();
const list=<T>(v:unknown,max:number,parse:(v:unknown)=>T):T[]=>Array.isArray(v)&&v.length<=max?v.map(parse):fail();
export function parseProjectVisualStyle(v:unknown):ProjectVisualStyle {const x=record(v,['schema','paletteId','version']);if(x.schema!=='ProjectVisualStyle/v1'||!CHART_THEMES.some(t=>t.id===x.paletteId)||!Number.isSafeInteger(x.version)||Number(x.version)<1)return fail();return {schema:x.schema,paletteId:x.paletteId as ChartThemeId,version:x.version as number};}
export function projectPalette(style:ProjectVisualStyle){return CHART_THEMES.find(t=>t.id===parseProjectVisualStyle(style).paletteId)!;}
export function parseReportFigure(value:unknown):ReportFigure {
  const x=record(value,['schema','id','resultId','resultHash','kind','title','xLabel','yLabel','note','n','labels','series','bins','boxes','table','style']);
  if(x.schema!=='ReportFigure/v1'||!REPORT_FIGURE_KINDS.includes(x.kind as ReportFigureKind)||typeof x.resultHash!=='string'||!/^\w{64}$/.test(x.resultHash)||!/^[a-f0-9]{64}$/.test(x.resultHash))return fail();
  const labels=list(x.labels,50,v=>text(v,160)),series=list(x.series,20,v=>{const s=record(v,['name','values']);return {name:text(s.name,160),values:list(s.values,50,v=>v===null?null:num(v))};});
  if(series.some(s=>s.values.length!==labels.length))return fail();
  const bins=list(x.bins,50,v=>{const b=record(v,['start','end','count']);const start=num(b.start),end=num(b.end),count=num(b.count,0,5000);if(end<start||!Number.isInteger(count))return fail();return {start,end,count};});
  if(bins.length>1&&bins.some(b=>b.start===b.end))return fail();
  const boxes=list(x.boxes,20,v=>{const b=record(v,['label','low','q1','median','q3','high']);const result={label:text(b.label,160),low:num(b.low),q1:num(b.q1),median:num(b.median),q3:num(b.q3),high:num(b.high)};if([result.low,result.q1,result.median,result.q3,result.high].some((v,i,a)=>i>0&&v<a[i-1]))return fail();return result;});
  const t=record(x.table,['headers','rows']),headers=list(t.headers,30,v=>text(v,160));
  const rows=list(t.rows,400,v=>{const row=list(v,30,c=>c===null?null:typeof c==='number'?num(c):text(c,2000));if(row.length!==headers.length)return fail();return row;});
  const s=record(x.style,['decimals','showLabels','showGrid','showBorder']);if(!Number.isInteger(s.decimals)||Number(s.decimals)<0||Number(s.decimals)>6||['showLabels','showGrid','showBorder'].some(k=>typeof s[k]!=='boolean'))return fail();
  const kind=x.kind as ReportFigureKind,n=num(x.n,0,5000);if(!Number.isInteger(n))return fail();
  if(kind==='histogram'&&(!bins.length||bins.some((b,i)=>i>0&&b.start!==bins[i-1].end)||bins.reduce((a,b)=>a+b.count,0)!==n))return fail();
  if(kind==='boxplot'&&!boxes.length)return fail();
  if(kind==='table'&&(!headers.length||!rows.length))return fail();
  if(!['histogram','boxplot','table'].includes(kind)&&(!labels.length||!series.length||!series.some(s=>s.values.some(v=>v!==null))))return fail();
  if(kind==='percent_stacked'&&(series.some(s=>s.values.some(v=>v===null||v<0))||labels.some((_,i)=>series.reduce((sum,s)=>sum+(s.values[i]??0),0)<=0)))return fail();
  if(!text(x.id,80).trim()||!text(x.resultId,80).trim()||!text(x.title).trim())return fail();
  return {schema:'ReportFigure/v1',id:text(x.id,80),resultId:text(x.resultId,80),resultHash:x.resultHash,kind,title:text(x.title),xLabel:text(x.xLabel),yLabel:text(x.yLabel),note:text(x.note,2000),n,labels,series,bins,boxes,table:{headers,rows},style:s as ReportFigure['style']};
}
export function figureFor(context:FigureContext,id:string,evidenceId?:string):ReportFigure {
 const value=context.figures?.find(f=>f.id===id);if(!value)throw Error('引用的共享图形不存在，请重新选择图形。');
 const figure=parseReportFigure(value),result=context.quality?.results.find(r=>r.id===figure.resultId);
 if(!result||result.resultHash!==figure.resultHash||(evidenceId!==undefined&&figure.resultId!==evidenceId))throw Error('共享图形对应的结果版本已变化，请核对后重新登记图形。');return figure;
}
/** Reconstruct only aggregate forms justified by an existing registered summary. */
export function figureFromResult(result:ResultSnapshot,kind:ReportFigureKind,valueColumn=1,id=crypto.randomUUID()):ReportFigure {
 const base={schema:'ReportFigure/v1',id,resultId:result.id,resultHash:result.resultHash,kind,title:result.title,xLabel:result.headers[0],yLabel:result.headers[valueColumn]??'',note:'',n:result.n,labels:[] as string[],series:[] as ReportFigure['series'],bins:[],boxes:[],table:{headers:result.headers,rows:result.rows},style:{decimals:2,showLabels:true,showGrid:true,showBorder:false}};
 if(kind==='table')return parseReportFigure(base);
 if(kind==='histogram'||kind==='boxplot')throw Error('需要登记计算时的分箱或箱须摘要，不能从描述统计表推测原始分布。');
 if(['grouped_bar','percent_stacked','heatmap'].includes(kind)){
  if(result.method!=='crosstab')throw Error('该图形需要交叉表的分类频数。');
  const labels=[...new Set(result.rows.map(row=>String(row[0])))],columns=[...new Set(result.rows.map(row=>String(row[1])))],cells=new Map<string,number>();
  for(const row of result.rows){if(typeof row[2]!=='number'||row[2]<0||!Number.isInteger(row[2]))return fail();const key=JSON.stringify([row[0],row[1]]);if(cells.has(key))return fail();cells.set(key,row[2]);}
  if([...cells.values()].reduce((a,b)=>a+b,0)!==result.n)return fail();
  return parseReportFigure({...base,xLabel:kind==='heatmap'?result.headers[1]:result.headers[0],yLabel:kind==='heatmap'?result.headers[0]:kind==='percent_stacked'?'行内占比 (%)':'频数',labels,series:columns.map(column=>({name:column,values:labels.map(label=>cells.get(JSON.stringify([label,column]))??0)})),note:kind==='percent_stacked'?'各行内构成：分母为该行全部分类频数；各行合计100%。':''});
 }
 if(!Number.isInteger(valueColumn)||valueColumn<1||valueColumn>=result.headers.length)throw Error('请选择有效数值列。');
 if(result.rows.some(row=>typeof row[valueColumn]!=='number'))throw Error('所选列含缺失或非数值，请使用三线表。');
 return parseReportFigure({...base,labels:result.rows.map(row=>result.method==='crosstab'?String(row[0])+' · '+String(row[1]):String(row[0])),series:[{name:result.headers[valueColumn],values:result.rows.map(row=>row[valueColumn] as number)}]});
}
export function reportFigureChoices(result:ResultSnapshot,retained:ReportFigure[]=[],valueColumn=1){return REPORT_FIGURE_KINDS.map(kind=>{const saved=['histogram','boxplot'].includes(kind)?retained.find(f=>f.kind===kind&&f.resultId===result.id&&f.resultHash===result.resultHash):undefined;try{const figure=saved?parseReportFigure(saved):figureFromResult(result,kind,valueColumn,'candidate');return {kind,title:REPORT_FIGURE_LABELS[kind],available:true,reason:'',figure};}catch(error){return {kind,title:REPORT_FIGURE_LABELS[kind],available:false,reason:(error as Error).message,figure:null};}});}
export function percentSeries(value:ReportFigure):ReportFigure['series']{const f=parseReportFigure(value);if(f.kind!=='percent_stacked')throw Error('当前图形不是百分比堆叠图。');return f.series.map(s=>({...s,values:s.values.map((value,i)=>100*(value??0)/f.series.reduce((sum,item)=>sum+(item.values[i]??0),0))}));}
export function assertFormalFigureCapacity(figure:ReportFigure):void {
 if(figure.kind==='table'){if(figure.table.rows.length>25||figure.table.headers.length>10)throw Error('正式表格最多25行、10列，请分拆后导出。');return;}
 if(figure.labels.length>20||figure.series.length>10||figure.boxes.length>12||figure.bins.length>20)throw Error('正式图形过密，请分拆为不超过20类、10系列或12组箱线；直方图最多20箱。');
}
export function figureFromSnapshot(snapshot:ChartSnapshot,kind:ReportFigureKind,binding:{id:string;resultId:string;resultHash:string;title:string}):ReportFigure {
  const cross=snapshot.cross;
  const matrix=cross?cross.columns.map(column=>({name:column,values:cross.rows.map(row=>cross.cells.find(c=>c.row===row&&c.column===column)?.count??0)})):[];
  const categorySeries=[{name:snapshot.yLabel,values:snapshot.categories.map(c=>c.count)}];
  return parseReportFigure({schema:'ReportFigure/v1',...binding,kind,xLabel:kind==='heatmap'?snapshot.yLabel:kind==='histogram'&&snapshot.method==='groups'?snapshot.yLabel:snapshot.xLabel,yLabel:kind==='heatmap'?snapshot.xLabel:kind==='percent_stacked'?'行内占比 (%)':kind==='histogram'||cross?'频数':kind==='boxplot'&&snapshot.method==='numeric'?snapshot.xLabel:snapshot.yLabel,n:snapshot.n,note:snapshot.statistics.join('；'),labels:cross?cross.rows:snapshot.categories.map(c=>c.label),series:cross?matrix:categorySeries,bins:snapshot.distributions.length===1?snapshot.distributions[0].bins:[],boxes:snapshot.distributions.map(d=>({label:d.label,low:d.box.low,q1:d.box.q1,median:d.box.median,q3:d.box.q3,high:d.box.high})),table:snapshot.table,style:{decimals:2,showLabels:true,showGrid:true,showBorder:false}});
}
export function figuresFromRegistration(result:ResultSnapshot,context:ChartRegistrationContext):ReportFigure[]{
 if(context.snapshot.n!==result.n||context.snapshot.binding.dataHash!==result.sourceHash)throw Error('图形来源与结果样本不一致，请重新计算。');
 return REPORT_FIGURE_KINDS.flatMap(kind=>{try{const figure=figureFromSnapshot(context.snapshot,kind,{id:crypto.randomUUID(),resultId:result.id,resultHash:result.resultHash,title:context.settings.style.title||result.title}),style=context.settings.style;return [parseReportFigure({...figure,xLabel:style.xLabel||figure.xLabel,yLabel:style.yLabel||figure.yLabel,note:style.note||figure.note,style:{decimals:style.decimals,showLabels:style.showLabels,showGrid:style.showGrid,showBorder:style.showBorder}})];}catch{return [];}});
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]!);
/** Deterministic SVG shared by editor and Office. PDF uses these same aggregate values. */
export function reportFigureSVG(value:ReportFigure,style:ProjectVisualStyle):string {
  const f=parseReportFigure(value),palette=projectPalette(style),colors=palette.colors,ink='#263D4D';assertFormalFigureCapacity(f);
  const out=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" width="1000" height="700" role="img" aria-label="${escape(f.title)}"><desc>${escape(f.note)}</desc><rect width="1000" height="700" fill="#FFFFFF"/>`];
  const label=(s:string,x:number,y:number,size=20,anchor='middle',fill=ink)=>out.push(`<text x="${x}" y="${y}" font-family="sans-serif" font-size="${size}" text-anchor="${anchor}" fill="${fill}">${escape(s)}</text>`);
  const line=(x1:number,y1:number,x2:number,y2:number,color=ink,width=1)=>out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"/>`);
  const rect=(x:number,y:number,w:number,h:number,fill:string)=>out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`);
  const fmt=(n:number|null)=>n===null?'—':String(Number(n.toFixed(f.style.decimals)));
  label(f.title,50,40,28,'start');label(`n = ${f.n}`,950,40,18,'end');
  const top=95,bottom=500,left=f.kind==='horizontal_bar'?250:100,right=950,w=right-left,h=bottom-top;
  if(f.kind==='table'){
    if(f.table.rows.length>18||f.table.headers.length>10)throw Error('表格需分页或分拆后预览。');
    const cw=850/f.table.headers.length,rh=Math.min(30,450/(f.table.rows.length+1));
    // 1000px preview represents a 6.08 inch report figure: pt are scaled physically.
    const pt=1000/(146.4/25.4*72);line(75,90,925,90,ink,1.5*pt);line(75,90+rh,925,90+rh,ink,.75*pt);
    [f.table.headers,...f.table.rows].forEach((row,i)=>row.forEach((v,j)=>label(typeof v==='number'?fmt(v):v??'—',75+(j+.5)*cw,90+(i+.72)*rh,18)));
    line(75,90+(f.table.rows.length+1)*rh,925,90+(f.table.rows.length+1)*rh,ink,1.5*pt);
  }else if(f.kind==='boxplot'){
    const min=Math.min(...f.boxes.map(b=>b.low)),max=Math.max(...f.boxes.map(b=>b.high)),span=max-min||1,y=(v:number)=>bottom-(v-min)/span*h;
    for(let i=0;i<=(max===min?0:4);i++){const value=min+(max-min)*i/4;if(f.style.showGrid)line(left,y(value),right,y(value),'#E4E9EC');label(fmt(value),left-12,y(value)+6,20,'end');}
    f.boxes.forEach((b,i)=>{const x=left+w*(i+.5)/f.boxes.length,bw=Math.min(80,w/f.boxes.length*.5);line(x,y(b.low),x,y(b.high),colors[0],2);line(x-bw/3,y(b.low),x+bw/3,y(b.low));line(x-bw/3,y(b.high),x+bw/3,y(b.high));rect(x-bw/2,y(b.q3),bw,y(b.q1)-y(b.q3),colors[4%colors.length]);line(x-bw/2,y(b.median),x+bw/2,y(b.median),colors[0],3);label(b.label,x,bottom+30,18);});
    label('箱须采用已登记摘要 · 不显示逐条离群值',left,615,18,'start');
  }else if(f.kind==='heatmap'){
    const all=f.series.flatMap(s=>s.values.filter((v):v is number=>v!==null)),min=Math.min(...all),max=Math.max(...all),span=max-min||1;
    const cw=w/f.series.length,ch=h/f.labels.length;
    f.labels.forEach((r,i)=>{label(r,left-10,top+(i+.6)*ch,17,'end');f.series.forEach((s,j)=>{const v=s.values[i];const opacity=v===null?0:.15+.85*(v-min)/span;out.push(`<rect x="${left+j*cw}" y="${top+i*ch}" width="${cw}" height="${ch}" fill="${colors[0]}" fill-opacity="${opacity}"/>`);if(f.style.showLabels)label(fmt(v),left+(j+.5)*cw,top+(i+.6)*ch,18,'middle',opacity>.6?'#FFFFFF':ink);});});
    f.series.forEach((s,j)=>label(s.name,left+(j+.5)*cw,bottom+30,17));label(`${fmt(min)} — ${fmt(max)}`,right,615,18,'end');
  }else{
    const horizontal=f.kind==='horizontal_bar',hist=f.kind==='histogram';
    const labels=hist?f.bins.map(b=>`${fmt(b.start)}–${fmt(b.end)}`):f.labels;
    let series=hist?[{name:'频数',values:f.bins.map(b=>b.count)}]:f.series;
    if(f.kind==='percent_stacked')series=percentSeries(f);
    const values=series.flatMap(s=>s.values.filter((v):v is number=>v!==null)),min=f.kind==='percent_stacked'?0:Math.min(0,...values),max=f.kind==='percent_stacked'?100:Math.max(0,...values),span=max-min||1;
    const y=(v:number)=>bottom-(v-min)/span*h,x=(v:number)=>left+(v-min)/span*w;
    for(let i=0;i<=4;i++){const v=min+span*i/4;if(horizontal){if(f.style.showGrid)line(x(v),top,x(v),bottom,'#E4E9EC');label(fmt(v),x(v),bottom+28,17);}else{if(f.style.showGrid)line(left,y(v),right,y(v),'#E4E9EC');label(fmt(v),left-12,y(v)+6,17,'end');}}
    labels.forEach((cat,i)=>{const slot=(horizontal?h:w)/labels.length;if(horizontal)label(cat,left-15,top+slot*(i+.62),18,'end');else label(cat,left+slot*(i+.5),bottom+32,18);
      let stacked=0;series.forEach((s,j)=>{const v=s.values[i];if(v===null)return;const fill=colors[j%colors.length];if(f.kind==='percent_stacked'){rect(left+slot*(i+.16),y(stacked+v),slot*.68,v/span*h,fill);if(f.style.showLabels&&v>=7)label(fmt(v)+'%',left+slot*(i+.5),y(stacked+v/2)+6,18,'middle',j<3?'#FFFFFF':ink);stacked+=v;}else if(horizontal){const rh=slot*.7/series.length;rect(Math.min(x(v),x(0)),top+slot*(i+.15)+j*rh,Math.abs(x(v)-x(0)),rh*.95,fill);if(f.style.showLabels)label(fmt(v),x(v)+(v<0?-8:8),top+slot*(i+.15)+(j+.7)*rh,16,v<0?'end':'start');}else{const constant=hist&&f.bins[0].start===f.bins.at(-1)!.end,binRange=hist?f.bins.at(-1)!.end-f.bins[0].start:1,bw=hist?(constant?w:(f.bins[i].end-f.bins[i].start)/binRange*w):slot*.7/series.length,px=hist?(constant?left:left+(f.bins[i].start-f.bins[0].start)/binRange*w):left+slot*(i+.15)+j*bw;rect(px,Math.min(y(v),y(0)),bw*(hist?1:.95),Math.abs(y(v)-y(0)),fill);if(f.style.showLabels)label(fmt(v),px+bw*.5,y(v)+(v<0?22:-8),16);}});
    });
    line(left,bottom,right,bottom);if(series.length>1)series.forEach((s,i)=>{const x=left+(i%5)*w/5,y=560+Math.floor(i/5)*22,short=Array.from(s.name).slice(0,8).join('');rect(x,y-12,12,12,colors[i%colors.length]);out.push(`<text x="${x+18}" y="${y}" font-family="sans-serif" font-size="16" fill="${ink}"><title>${escape(s.name)}</title>${escape(short+(short.length<s.name.length?'…':''))}</text>`);});
  }
  if(f.style.showBorder)out.push(`<rect x="2" y="2" width="996" height="696" fill="none" stroke="${ink}"/>`);
  label(f.kind==='horizontal_bar'?f.yLabel:f.xLabel,525,654,18);if(f.yLabel)label((f.kind==='horizontal_bar'?f.xLabel:f.yLabel).slice(0,60),50,75,18,'start');label(f.note.slice(0,75),50,685,15,'start');return out.join('')+'</svg>';
}
