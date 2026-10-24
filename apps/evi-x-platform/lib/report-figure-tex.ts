import {assertFormalFigureCapacity,parseReportFigure,projectPalette,type ProjectVisualStyle,type ReportFigure} from './report-figure.ts';

/** Rendering only; geometry is computed from retained aggregates, never samples. */
const number=(value:number,decimals=6)=>{
 if(!Number.isFinite(value)||Math.abs(value)>1e12)throw Error('图形坐标或数值超出范围。');
 const raw=value.toFixed(decimals),text=decimals?raw.replace(/0+$/,'').replace(/\.$/,''):raw;return text==='-0'?'0':text;
};
const literal=(value:string)=>Array.from(value.replace(/[\r\n\t]/g,' '),c=>({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','%':'\\%','_':'\\_','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[c]??c)).join('');
const macroName=(index:number)=>`ResearchFigure${index}`;
export const registryMacroNames=(count:number)=>{
 if(!Number.isInteger(count)||count<0||count>120)throw Error('图形数量超过限制。');
 return Array.from({length:count},(_,i)=>macroName(i));
};

function drawing(value:ReportFigure):string[]{
 const f=parseReportFigure(value);assertFormalFigureCapacity(f);
 const fmt=(value:number|null)=>value===null?'—':number(value,f.style.decimals);
 if(f.kind==='table'){
  const row=(values:(string|number|null)[])=>values.map(value=>literal(typeof value==='number'?fmt(value):value??'—')).join(' & ')+String.raw` \\`;
  return ['\\begingroup','\\fontsize{9}{11}\\selectfont','\\renewcommand{\\arraystretch}{1.15}',`\\begin{tabular}{${'c'.repeat(f.table.headers.length)}}`,'\\toprule[1.5bp]',row(f.table.headers),'\\midrule[0.75bp]',...f.table.rows.map(row),'\\bottomrule[1.5bp]','\\end{tabular}','\\endgroup'];
 }
 const out=['\\begin{tikzpicture}[x=0.1464mm,y=0.1464mm]','\\path[use as bounding box] (0,0) rectangle (1000,700);'];
 const point=(x:number,y:number)=>`(${number(x)},${number(700-y)})`;
 const color=(index:number)=>`ResearchFigureColour${index}`;
 const label=(text:string,x:number,y:number,anchor:'start'|'middle'|'end'='middle',ink='ResearchFigureInk',size=9)=>out.push(`\\node[anchor=${anchor==='start'?'west':anchor==='end'?'east':'center'},inner sep=0pt,text=${ink},font={\\fontsize{${size}}{${size+2}}\\selectfont}] at ${point(x,y)} {${literal(text)}};`);
 const line=(x1:number,y1:number,x2:number,y2:number,ink='ResearchFigureInk',width=.5)=>out.push(`\\draw[draw=${ink},line width=${number(width)}bp] ${point(x1,y1)} -- ${point(x2,y2)};`);
 const rect=(x:number,y:number,width:number,height:number,ink:string,opacity=1)=>out.push(`\\path[fill=${ink},fill opacity=${number(opacity)},draw=none] ${point(x,y)} rectangle ${point(x+width,y+height)};`);
 label(f.title,50,35,'start','ResearchFigureInk',10);label(`n = ${f.n}`,950,35,'end');
 const top=100,bottom=485,left=f.kind==='horizontal_bar'||f.kind==='heatmap'?250:115,right=945,w=right-left,h=bottom-top;
 if(f.kind==='boxplot'){
  const min=Math.min(...f.boxes.map(b=>b.low)),max=Math.max(...f.boxes.map(b=>b.high)),span=max-min||1,y=(v:number)=>bottom-(v-min)/span*h;
  for(let i=0;i<=(max===min?0:4);i++){const value=min+(max-min)*i/4;if(f.style.showGrid)line(left,y(value),right,y(value),'ResearchFigureGrid',.3);label(fmt(value),left-14,y(value),'end');}
  f.boxes.forEach((b,i)=>{const x=left+w*(i+.5)/f.boxes.length,bw=Math.min(80,w/f.boxes.length*.5);line(x,y(b.low),x,y(b.high),color(0),.7);line(x-bw/3,y(b.low),x+bw/3,y(b.low));line(x-bw/3,y(b.high),x+bw/3,y(b.high));rect(x-bw/2,y(b.q3),bw,y(b.q1)-y(b.q3),color(4));line(x-bw/2,y(b.median),x+bw/2,y(b.median),color(0),1);label(b.label,x,bottom+35);});
 }else if(f.kind==='heatmap'){
  const all=f.series.flatMap(s=>s.values.filter((v):v is number=>v!==null)),min=Math.min(...all),max=Math.max(...all),span=max-min||1,cw=w/f.series.length,ch=h/f.labels.length;
  f.labels.forEach((value,i)=>{label(value,left-14,top+(i+.5)*ch,'end');f.series.forEach((s,j)=>{const v=s.values[i],opacity=v===null?0:.15+.85*(v-min)/span;rect(left+j*cw,top+i*ch,cw,ch,color(0),opacity);if(f.style.showLabels)label(fmt(v),left+(j+.5)*cw,top+(i+.5)*ch,'middle',opacity>.6?'ResearchFigureWhite':'ResearchFigureInk');});});
  f.series.forEach((s,j)=>label(s.name,left+(j+.5)*cw,bottom+35));label(`${fmt(min)} — ${fmt(max)}`,right,595,'end');
 }else{
  const horizontal=f.kind==='horizontal_bar',hist=f.kind==='histogram';
  const labels=hist?f.bins.map(b=>`${fmt(b.start)}–${fmt(b.end)}`):f.labels;
  const series=hist?[{name:'频数',values:f.bins.map(b=>b.count)}]:f.kind==='percent_stacked'?f.series.map(s=>({...s,values:s.values.map((v,i)=>100*(v??0)/f.series.reduce((sum,item)=>sum+(item.values[i]??0),0))})):f.series;
  const values=series.flatMap(s=>s.values.filter((v):v is number=>v!==null)),min=f.kind==='percent_stacked'?0:Math.min(0,...values),max=f.kind==='percent_stacked'?100:Math.max(0,...values),span=max-min||1;
  const y=(v:number)=>bottom-(v-min)/span*h,x=(v:number)=>left+(v-min)/span*w;
  for(let i=0;i<=4;i++){const value=min+span*i/4;if(horizontal){if(f.style.showGrid)line(x(value),top,x(value),bottom,'ResearchFigureGrid',.3);label(fmt(value),x(value),bottom+35);}else{if(f.style.showGrid)line(left,y(value),right,y(value),'ResearchFigureGrid',.3);label(fmt(value)+(f.kind==='percent_stacked'?'%':''),left-14,y(value),'end');}}
  labels.forEach((value,i)=>{const slot=(horizontal?h:w)/labels.length;label(value,horizontal?left-14:left+slot*(i+.5),horizontal?top+slot*(i+.5):bottom+35,horizontal?'end':'middle');let stacked=0;
   series.forEach((s,j)=>{const value=s.values[i];if(value===null)return;
    if(f.kind==='percent_stacked'){rect(left+slot*(i+.16),y(stacked+value),slot*.68,value/span*h,color(j));if(f.style.showLabels&&value>=7)label(fmt(value)+'%',left+slot*(i+.5),y(stacked+value/2),'middle',j<3?'ResearchFigureWhite':'ResearchFigureInk');stacked+=value;}
    else if(horizontal){const rh=slot*.7/series.length;rect(Math.min(x(value),x(0)),top+slot*(i+.15)+j*rh,Math.abs(x(value)-x(0)),rh*.95,color(j));if(f.style.showLabels)label(fmt(value),x(value)+(value<0?-9:9),top+slot*(i+.15)+(j+.5)*rh,value<0?'end':'start');}
    else{const constant=hist&&f.bins[0].start===f.bins.at(-1)!.end,range=hist?f.bins.at(-1)!.end-f.bins[0].start:1;
     const bw=hist?(constant?w:(f.bins[i].end-f.bins[i].start)/range*w):slot*.7/series.length,px=hist?(constant?left:left+(f.bins[i].start-f.bins[0].start)/range*w):left+slot*(i+.15)+j*bw;
     rect(px,Math.min(y(value),y(0)),bw*(hist?1:.95),Math.abs(y(value)-y(0)),color(j));if(f.style.showLabels)label(fmt(value),px+bw*.5,y(value)+(value<0?22:-10));}
   });
  });line(left,bottom,right,bottom);
  if(series.length>1)series.forEach((s,i)=>{const px=left+(i%4)*w/4,py=555+Math.floor(i/4)*27;rect(px,py-7,13,13,color(i));label(s.name,px+20,py,'start');});
 }
 if(f.style.showBorder)out.push(`\\draw[draw=ResearchFigureInk,line width=0.5bp] ${point(2,2)} rectangle ${point(998,698)};`);
 label(f.kind==='horizontal_bar'?f.yLabel:f.xLabel,525,650);
 if(f.yLabel)label(f.kind==='horizontal_bar'?f.xLabel:f.yLabel,50,75,'start');
 out.push('\\end{tikzpicture}');
 if(f.note)out.push(`{\\fontsize{9}{11}\\selectfont ${literal(f.note)}\\par}`);
 return out;
}

/** Only this trusted preamble emits drawing commands; user body uses an index. */
export function figureTexPreamble(figures:ReportFigure[],style:ProjectVisualStyle):string[]{
 registryMacroNames(figures.length);const palette=projectPalette(style),out=['\\definecolor{ResearchFigureInk}{HTML}{263D4D}','\\definecolor{ResearchFigureGrid}{HTML}{E4E9EC}','\\definecolor{ResearchFigureWhite}{HTML}{FFFFFF}'];
 // Names cycle for palettes with <20 colours while every series keeps its index.
 for(let i=0;i<20;i++)out.push(`\\definecolor{ResearchFigureColour${i}}{HTML}{${palette.colors[i%palette.colors.length].slice(1)}}`);
 out.push('\\providecommand{\\ResearchFigure}[1]{\\ifcsname ResearchFigure#1\\endcsname\\csname ResearchFigure#1\\endcsname\\else\\PackageError{researchfigure}{Unknown figure index}{}\\fi}');
 figures.forEach((figure,i)=>out.push(`\\expandafter\\def\\csname ${macroName(i)}\\endcsname{`,...drawing(figure),'}'));
 return out;
}
