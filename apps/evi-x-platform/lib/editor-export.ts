import { validateQuality, wordBlocks, addQualityObjects, assertFindingReferences, insertMath, richRuns, type SvgPreviewRenderer, type WordContext } from "./quality-export.ts";
import { blockLabel, reportLabels } from "./report-numbering.ts";
import { ACCENTS, type EditorContent } from "./editor-model.ts";
import { DEFAULT_REPORT_OPTIONS, parseReportFormatOptions, reportHeadingLevel, reportPart, type ReportFormatOptions } from './report-format.ts';
import { formatReference, referenceNumbers, unfinishedReference } from './references.ts';

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function fileName(title: string) { return title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 80) || "未命名研究"; }
export async function buildDocx(content: EditorContent, inputOptions: ReportFormatOptions = content.reportFormat?.options ?? DEFAULT_REPORT_OPTIONS, renderSvg?:SvgPreviewRenderer): Promise<Blob> {
  assertFindingReferences(content);
  await validateQuality(content);
  const options=parseReportFormatOptions(inputOptions);
  const report=content.report.filter(section=>options.part==='appendix'?reportPart(section.title)==='appendix':reportPart(section.title)!=='appendix');
  if(!report.length)throw Error(options.part==='appendix'?'请先添加独立的“附录”章节，再单独导出附录。':'报告正文至少需要一个章节。');
  // Structured references become the numbered list of the references section; a list also typed into that section would be numbered twice.
  const cited = referenceNumbers(content);
  if (cited.order.length && options.part !== 'appendix') {
    const listSection = content.report.find(s => reportPart(s.title) === 'references');
    if (!listSection) throw Error('已录入参考文献，但报告中没有「参考文献」一节，请先插入该节。');
    if (listSection.body.trim()) throw Error('「参考文献」一节中仍有手写条目。请在参考文献面板中转为文献条目，或清空该节正文后再导出。');
    const blank = cited.order.findIndex(unfinishedReference);
    if (blank >= 0) throw Error(`第 ${blank + 1} 条参考文献尚未填写题名，请补全或删除后再导出。`);
  }
  const { Document, Packer, Paragraph, TextRun, AlignmentType, Footer, PageNumber, NumberFormat, SectionType, TableOfContents, StyleLevel } = await import("docx");
  const {default:JSZip}=await import('jszip');
  // Chinese in 宋体 / 黑体; Latin letters and numbers in Times New Roman, as competition templates set them.
  const font=(eastAsia:string)=>({ascii:'Times New Roman',hAnsi:'Times New Roman',eastAsia,cs:'Times New Roman',hint:'eastAsia'});
  const bodyRun={font:font('宋体'),size:24,sizeComplexScript:24,color:'000000'};
  const smallRun={...bodyRun,size:18,sizeComplexScript:18};
  const headingRun=(level:number)=>({font:font(level<=2?'黑体':'宋体'),size:level===1?30:level===2?28:24,sizeComplexScript:level===1?30:level===2?28:24,bold:false,color:'000000'});
  const bodyParagraph={spacing:{before:120,after:0,line:300},indent:{firstLineChars:options.firstLineChars*100},widowControl:true};
  const flush={indent:{firstLine:0,firstLineChars:0}};
  const styles=[
    {id:'Normal',name:'Normal',run:bodyRun,paragraph:bodyParagraph},
    {id:'Title',name:'Title',basedOn:'Normal',next:'Normal',run:{...bodyRun,size:32,sizeComplexScript:32,bold:true},paragraph:{alignment:AlignmentType.CENTER,spacing:{line:240,beforeAutoSpacing:true,afterAutoSpacing:true},...flush,keepNext:true}},
    ...[1,2,3,4,5].map(level=>({id:`Heading${level}`,name:`heading ${level}`,basedOn:'Normal',next:'Normal',quickFormat:true,run:headingRun(level),paragraph:{spacing:{line:300,before:120,after:0},...flush,keepNext:true,keepLines:true,outlineLevel:level-1}})),
    {id:'ReportSpecialHeading',name:'摘要与参考文献名称',basedOn:'Normal',next:'Normal',run:{...bodyRun,font:font('黑体'),size:28,sizeComplexScript:28},paragraph:{alignment:AlignmentType.CENTER,spacing:{line:300,before:120,after:0},...flush,keepNext:true}},
    {id:'ReportReference',name:'参考文献正文',basedOn:'Normal',run:bodyRun,paragraph:{...bodyParagraph,...flush}},
    // Numbered entries hang: "[1]" at the margin, the entry and its wrapped lines aligned one centimetre in.
    {id:'ReportReferenceItem',name:'参考文献条目',basedOn:'ReportReference',run:bodyRun,paragraph:{spacing:{line:300,before:0,after:0},indent:{left:567,hanging:567,firstLine:0,firstLineChars:0}}},
    {id:'ReportCaption',name:'图表题',basedOn:'Normal',run:bodyRun,paragraph:{alignment:AlignmentType.CENTER,spacing:{line:300,before:120,after:0},...flush,keepNext:true}},
    // Figure captions sit below the figure and table captions above the table; the names drive the lists of figures and tables.
    {id:'ReportFigureCaption',name:'图题',basedOn:'ReportCaption',next:'Normal',run:bodyRun,paragraph:{alignment:AlignmentType.CENTER,spacing:{line:300,before:60,after:120},...flush}},
    {id:'ReportTableCaption',name:'表题',basedOn:'ReportCaption',next:'Normal',run:bodyRun,paragraph:{alignment:AlignmentType.CENTER,spacing:{line:300,before:240,after:60},...flush,keepNext:true}},
    {id:'ReportFigure',name:'图',basedOn:'Normal',run:bodyRun,paragraph:{alignment:AlignmentType.CENTER,spacing:{line:240,before:240,after:0},...flush,keepNext:true}},
    {id:'ReportTableText',name:'表内文字',basedOn:'Normal',run:{...bodyRun,size:21,sizeComplexScript:21},paragraph:{alignment:AlignmentType.CENTER,spacing:{line:240,before:30,after:30},...flush}},
    {id:'ReportSource',name:'资料来源',basedOn:'Normal',run:smallRun,paragraph:{alignment:AlignmentType.LEFT,spacing:{line:240,before:40,after:120},...flush}},
    {id:'ReportNote',name:'注释',basedOn:'Normal',run:smallRun,paragraph:{alignment:AlignmentType.LEFT,spacing:{line:260,before:120,after:120},...flush}},
    {id:'ReportEquation',name:'公式',basedOn:'Normal',run:bodyRun,paragraph:{spacing:{line:240,before:60,after:60},...flush}},
    {id:'ReportCoverTitle',name:'封面标题',basedOn:'Normal',next:'ReportCoverSubtitle',run:{...bodyRun,font:font('黑体'),size:44,sizeComplexScript:44,bold:true},paragraph:{alignment:AlignmentType.CENTER,spacing:{line:400,before:4200,after:360},...flush}},
    {id:'ReportCoverSubtitle',name:'封面副标题',basedOn:'Normal',run:{...bodyRun,size:28,sizeComplexScript:28},paragraph:{alignment:AlignmentType.CENTER,spacing:{line:360,before:120,after:0},...flush}},
    ...[1,2,3].map(level=>({id:`TOC${level}`,name:`toc ${level}`,basedOn:'Normal',run:bodyRun,paragraph:{spacing:{line:300,before:0,after:0},indent:{left:(level-1)*240,firstLine:0,firstLineChars:0}}})),
  ];
  const page={size:{width:11906,height:16838},margin:{top:1440,bottom:1440,left:1803,right:1803,header:720,footer:720,gutter:0}};
  const sections:ConstructorParameters<typeof Document>[0]['sections'][number][]=[];
  const footer=()=>new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,indent:{firstLine:0,firstLineChars:0},spacing:{before:0,after:0,line:240},children:[new TextRun({...bodyRun,children:[PageNumber.CURRENT]})]})]});
  function addSection(children:ConstructorParameters<typeof Document>[0]["sections"][number]["children"],kind:'cover'|'preliminary'|'body',restart?:number){
    sections.push({properties:{type:SectionType.NEXT_PAGE,page:{...page,...(kind==='cover'||!options.numberPages?{}:{pageNumbers:{formatType:kind==='preliminary'?NumberFormat.UPPER_ROMAN:NumberFormat.DECIMAL,...(restart===undefined?{}:{start:restart})}})}},footers:{default:kind==='cover'||!options.numberPages?new Footer({children:[]}):footer()},children});
  }
  const title=()=>new Paragraph({style:'Title',children:[new TextRun({...bodyRun,text:content.title,size:32,sizeComplexScript:32,bold:true})]});
  if(options.includeCover)addSection([new Paragraph({style:'ReportCoverTitle',children:[new TextRun({text:content.title})]}),...(content.subtitle?[new Paragraph({style:'ReportCoverSubtitle',children:[new TextRun({text:content.subtitle})]})]:[])],'cover');
  // Numbers come from the whole draft, so the main text and a separately exported appendix agree.
  const ctx:WordContext={labels:reportLabels(content.report),math:[],where:'',section:'',citations:cited.numbers};
  const exported=(kind:'figure'|'table')=>report.some(s=>(s.blocks??[]).some(b=>blockLabel(ctx.labels,s.id,b.id)?.kind===kind));
  let bodyStarted=false,tocInserted=false,preliminaryStarted=false;
  function toc(){
    if(!options.includeToc||tocInserted)return;
    const children:Array<ConstructorParameters<typeof Document>[0]["sections"][number]["children"][number]>=[new Paragraph({style:'ReportSpecialHeading',text:'目录'}),new TableOfContents('目录',{hyperlink:true,headingStyleRange:'1-3'})];
    if(exported('table'))children.push(new Paragraph({style:'ReportSpecialHeading',pageBreakBefore:true,text:'表目录'}),new TableOfContents('表目录',{hyperlink:true,stylesWithLevels:[new StyleLevel('表题',1)]}));
    // The figure list follows the table list on the same page; both stay within the counted front matter.
    if(exported('figure'))children.push(new Paragraph({style:'ReportSpecialHeading',pageBreakBefore:!exported('table'),spacing:{before:480},text:'图目录'}),new TableOfContents('图目录',{hyperlink:true,stylesWithLevels:[new StyleLevel('图题',1)]}));
    addSection(children,'preliminary',preliminaryStarted?undefined:1);preliminaryStarted=true;tocInserted=true;
  }
  for(const section of report){
    const part=reportPart(section.title),preliminary=part==='abstract'&&!bodyStarted;
    if(!preliminary)toc();
    ctx.where=section.title||'未命名章节';ctx.section=section.id;
    const headingStyle=part==='abstract'||part==='references'?'ReportSpecialHeading':`Heading${reportHeadingLevel(section.title)||1}`;
    const children:Array<ConstructorParameters<typeof Document>[0]["sections"][number]["children"][number]>=[...(!options.includeCover&&!sections.length?[title()]:[]),new Paragraph({style:headingStyle,children:[new TextRun({text:section.title||'未命名章节'})]})];
    // A chapter heading followed directly by its first section has no body; do not emit a blank paragraph.
    if(section.body)for(const line of section.body.split('\n')){
      const heading=part==='body'&&line.length<=100?reportHeadingLevel(line):null;
      children.push(new Paragraph({style:heading?`Heading${heading}`:part==='references'?'ReportReference':'Normal',children:await richRuns(line,ctx)}));
    }
    if(part==='references')cited.order.forEach((entry,i)=>children.push(new Paragraph({style:'ReportReferenceItem',children:[new TextRun(`[${i+1}]\t`),new TextRun(formatReference(entry))]})));
    if(section.blocks?.length)children.push(...await wordBlocks(section.blocks,content,renderSvg,ctx));
    if(section.source)children.push(new Paragraph({style:'ReportSource',children:[new TextRun({text:`来源 / 说明：${section.source}`})]}));
    if(preliminary){addSection(children,'preliminary',preliminaryStarted?undefined:1);preliminaryStarted=true;}
    else if(part==='body'&&bodyStarted){const index=sections.length-1;sections[index]={...sections[index],children:[...sections[index].children,...children]};}
    else {addSection(children,'body',bodyStarted?undefined:1);bodyStarted=true;}
  }
  if(!bodyStarted)toc();
  const doc=new Document({creator:'',lastModifiedBy:'',title:'',description:'',features:{updateFields:true},styles:{default:{document:{run:bodyRun,paragraph:bodyParagraph}},paragraphStyles:styles},sections});
  // Word's half-line spacing is a line-relative measure, not an approximation in points.
  // docx exposes twips but not beforeLines, so set this exact OOXML attribute after packing.
  const archive=await JSZip.loadAsync(await Packer.toArrayBuffer(doc));
  const styleXml=await archive.file('word/styles.xml')!.async('string');
  archive.file('word/styles.xml',styleXml.replace(/<w:style\b[\s\S]*?<\/w:style>/g,block=>{
    if(!/w:styleId="(?:Normal|ReportReference|ReportSpecialHeading|ReportCaption|Heading[1-5])"/.test(block))return block;
    return block.replace(/<w:spacing\b([^>]*)\/>/,(_match,attrs:string)=>`<w:spacing${attrs.replace(/\s+w:before="[^"]*"/g,'')} w:beforeLines="50"/>`);
  }));
  if(ctx.math.length){
    // docx cannot write Office Math, so formulas travel as placeholder runs and are swapped in here.
    const documentXml=insertMath(await archive.file('word/document.xml')!.async('string'),ctx.math);
    if(documentXml.includes('§§OMML'))throw Error('公式写入失败，请检查公式后重试。');
    archive.file('word/document.xml',documentXml);
  }
  return new Blob([await archive.generateAsync({type:'arraybuffer',compression:'DEFLATE'})],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
export async function buildPptx(content: EditorContent): Promise<Blob> {
  assertFindingReferences(content);
  await validateQuality(content);
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = ""; pptx.company = ""; pptx.subject = ""; pptx.title = content.title;
  pptx.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei" };
  const accent = ACCENTS[content.accent];
  // PowerPoint uses the run language for Chinese punctuation and line breaking.
  const chineseText = { fontFace: "Microsoft YaHei", lang: "zh-CN" };
  for (const [index, item] of content.slides.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    if(item.objects!==undefined){
      const sources=addQualityObjects(slide,pptx,item.objects,content);
      if(item.notes||sources)slide.addNotes([item.notes,sources].filter(Boolean).join("\n\n"));
      continue;
    }
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.15, h: 7.5, line: { transparency: 100 }, fill: { color: accent } });
    const cover = item.layout === "cover";
    const two = item.layout === "two-column";
    slide.addText(item.title, { ...chineseText, x: .65, y: cover ? 1.8 : .55, w: 12, h: cover ? 1.8 : 1.25, fontSize: cover ? 34 : 28, bold: true, color: accent, margin: 0, breakLine: false, fit: "shrink" });
    slide.addText(item.body, { ...chineseText, x: .68, y: cover ? 4 : 2.05, w: two ? 7.1 : 11.95, h: cover ? 2.4 : 4.55, fontSize: cover ? 22 : 21, color: "263340", margin: 0, valign: "top", fit: "shrink", paraSpaceAfter: 14, lineSpacingMultiple: 1.25 });
    if (two) {
      slide.addShape(pptx.ShapeType.rect, { x: 8.35, y: 2.05, w: 4.2, h: 4.55, line: { transparency: 100 }, fill: { color: "F0F4F6" } });
      slide.addText(item.aside, { ...chineseText, x: 8.6, y: 2.3, w: 3.7, h: 4.05, fontSize: 18, color: "34495E", margin: 0, valign: "top", fit: "shrink" });
    }
    slide.addText(String(index + 1).padStart(2, "0"), { ...chineseText, x: 12, y: 7.02, w: .6, h: .22, fontSize: 10, color: "64748B", margin: 0, align: "right" });
    if (item.notes) slide.addNotes(item.notes);
  }
  return await pptx.write({ outputType: "blob", compression: true }) as Blob;
}
