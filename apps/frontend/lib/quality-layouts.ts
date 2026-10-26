import {parseEditorContent, type EditorContent, type Slide} from './editor-model.ts';
import { makeSlideObject, QUALITY_LIMITS, type QualityLayout, type ResearchQuality, type SlideObject } from './research-quality.ts';
import {projectPalette,type ProjectVisualStyle} from './report-figure.ts';

export const QUALITY_LAYOUT_LABELS:Record<QualityLayout,string>={cover:'封面',problem:'问题与研究路线',chart:'主图发现',comparison:'并列比较',segments:'人群分层',insight:'综合洞察',action:'行动建议',closing:'结论页'};
/** Layouts are editable starting positions, never a forced chapter or evidence order. */
export function composeQualitySlide(slide:Slide,layout:QualityLayout,quality:ResearchQuality,evidenceId=quality.results[0]?.id??'',navigationStep?:0|1|2|3,visualStyle?:ProjectVisualStyle):Slide {
  const objects:SlideObject[]=[];
  const palette=visualStyle?projectPalette(visualStyle).colors:null;
  const ink='#0A1F33',teal=palette?.[0]??'#00796F',gold=palette?.[2]??'#F4B942',muted='#536677',pale=palette?.at(-1)??'#E7EEF3';
  const text=(value:string,x:number,y:number,width:number,height:number,fontSize:number,color=ink,bold=false,align:SlideObject['align']='left')=>makeSlideObject('text',{text:value,x,y,width,height,fontSize,color,bold,align});
  const shape=(kind:SlideObject['shape'],x:number,y:number,width:number,height:number,color:string,opacity=1)=>makeSlideObject('shape',{shape:kind,x,y,width,height,color,opacity});
  const addText=(...args:Parameters<typeof text>)=>objects.push(text(...args));
  const line=(x:number,y:number,width:number,color=pale)=>objects.push(shape('line',x,y,width,.1,color));
  const result=quality.results.find(r=>r.id===evidenceId);
  const valueColumn=result?.method==='groups'||result?.method==='crosstab'?2:1;
  const section=navigationStep??(layout==='cover'||layout==='problem'?0:layout==='chart'||layout==='comparison'||layout==='segments'?2:layout==='insight'?2:3);
  // Navigation expresses the research story, not the competition's CLI stages.
  const navigation=['研究问题','数据与方法','研究发现','行动建议'];
  objects.push(shape('rect',0,0,100,7.5,ink));
  navigation.forEach((label,index)=>addText(label,7+index*21.5,2,21.5,4,15,index===section?'#FFFFFF':'#C9D5DF',index===section,'center'));
  objects.push(shape('rect',7+section*21.5,7.5,21.5,.5,gold));
  line(7,92,86);
  addText(QUALITY_LAYOUT_LABELS[layout],74,93.5,19,4,13,muted,false,'right');
  if(slide.aside)addText(slide.aside.replace(/\r?\n/g,' '),7,93.5,65,4,13,muted);

  if(layout==='cover'){
    addText(slide.title,7,20,75,23,40,ink,true);
    objects.push(shape('rect',7,48,8,.7,gold));
    addText(slide.body,7,54,64,30,22,muted);
    objects.push(makeSlideObject('vector',{assetId:'mosaic-edge',x:75,y:56,width:18,height:29,color:teal,opacity:.5}));
  }else if(layout==='problem'){
    addText(slide.title,7,13,86,13,32,ink,true);
    addText('问题与决策',7,29,45,5,19,teal,true);
    addText(slide.body,7,37,45,47,21,ink);
    addText('研究路线',61,29,32,5,19,teal,true);
    // These editable labels describe a proposed research sequence, not executed fieldwork.
    const steps=['明确研究问题','对照已有证据','解释结果与范围','确定试点评价'];
    objects.push(shape('line',63.5,39, .1,37,teal));
    steps.forEach((label,index)=>{
      const y=37+index*12;
      objects.push(shape('ellipse',61.8,y+1.1,3.5,6.2,teal));
      addText(String(index+1),61.8,y+2.1,3.5,4,16,'#FFFFFF',true,'center');
      addText(label,68,y,25,8,18,ink,true);
    });
    if(result)addText(`当前关联结果：${result.title}`,61,84,32,6.8,14,muted);
  }else if(['chart','segments'].includes(layout)&&result){
    addText(slide.title,7,13,86,13,32,ink,true);
    addText(result.title,7,28,58,7,17,teal,true);
    objects.push(makeSlideObject('chart',{evidenceId,x:7,y:37,width:58,height:51,valueColumn,color:teal}));
    objects.push(shape('rect',68,31,.4,54,gold));
    addText(layout==='segments'?'人群解释':'结果解释',72,29,21,5,19,teal,true);
    addText(slide.body,72,38,21,49,20,ink);
  }else if(layout==='comparison'&&result){
    addText(slide.title,7,13,86,13,32,ink,true);
    const compact=result.rows.length<=4;
    objects.push(makeSlideObject('table',{evidenceId,x:7,y:27,width:86,height:compact?25:44,fontSize:16,color:ink}));
    const explanationY=compact?60:74,explanationH=compact?30:17;
    if(compact)addText('如何理解这组结果',10,54,83,5,19,teal,true);
    objects.push(shape('rect',7,explanationY,.5,explanationH,gold));
    addText(slide.body,10,explanationY,83,explanationH,compact?18:16,ink,true);
  }else if(layout==='insight'){
    addText(slide.title,7,13,86,13,32,ink,true);
    addText('综合解释',7,30,46,5,19,teal,true);
    addText(slide.body,7,39,46,48,22,ink);
    if(result){
      addText('支持结果',61,30,32,5,19,teal,true);
      objects.push(makeSlideObject('chart',{evidenceId,x:61,y:40,width:32,height:46,valueColumn,color:teal}));
    }else objects.push(makeSlideObject('vector',{assetId:'focus-loop',x:62,y:37,width:31,height:46,color:teal,opacity:.65}));
  }else if(layout==='action'){
    addText(slide.title,7,13,86,13,32,ink,true);
    // Keep every paragraph. The fourth zone receives any remaining paragraphs.
    const paragraphs=slide.body.split(/\r?\n\s*\r?\n/).filter(value=>value.trim());
    const actions=paragraphs.length>4?[...paragraphs.slice(0,3),paragraphs.slice(3).join('\n\n')]:paragraphs.length?paragraphs:[slide.body];
    const width=(86-(actions.length-1)*4)/actions.length;
    if(actions.length>1)line(7+width/2,40,86-width,teal);
    actions.forEach((body,index)=>{
      const x=7+index*(width+4),center=x+width/2;
      objects.push(shape('ellipse',center-2.25,36,4.5,8,teal));
      addText(String(index+1).padStart(2,'0'),center-2.25,38.3,4.5,4,17,'#FFFFFF',true,'center');
      const [heading,...detail]=body.split('\n');
      if(detail.length){addText(heading,x,51,width,7,19,teal,true);addText(detail.join('\n'),x,62,width,27,18,ink);}
      else addText(body,x,51,width,36,actions.length>=4?18:21,ink);
      objects.push(shape('rect',x,47,width,.5,gold));
    });
  }else{
    addText(slide.title,7,13,86,13,32,ink,true);
    addText(slide.body,7,35,68,49,24,ink);
    objects.push(shape('rect',7,30,8,.7,gold));
    objects.push(makeSlideObject('vector',{assetId:'mosaic-edge',x:78,y:58,width:15,height:27,color:teal,opacity:.45}));
  }
  return {...slide,layout,objects};
}
export function withQuality(content:EditorContent):EditorContent {
  return {...content,version:content.version===1?2:content.version,quality:content.quality??{version:1,results:[],findings:[]}};
}
export function appendQualityResult(content:EditorContent,result:ResearchQuality['results'][number]):EditorContent {
  const next=withQuality(content),q=next.quality!,existing=q.results.find(r=>r.id===result.id);
  if(existing){if(JSON.stringify(existing)!==JSON.stringify(result))throw Error('结果标识已使用，请登记为新的结果版本。');return content;}
  if(q.results.length>=QUALITY_LIMITS.results)throw Error(`成果最多保留 ${QUALITY_LIMITS.results} 个结果，请先整理或另存作品。`);
  return parseEditorContent({...next,quality:{...q,results:[...q.results,result]}});
}
