import { ACCENTS, type EditorContent } from "./editor-model.ts";
import { DEFAULT_REPORT_OPTIONS, parseReportFormatOptions, reportHeadingLevel, reportPart, type ReportFormatOptions } from './report-format.ts';

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function fileName(title: string) { return title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 80) || "未命名研究"; }
export async function buildDocx(content: EditorContent, inputOptions: ReportFormatOptions = DEFAULT_REPORT_OPTIONS): Promise<Blob> {
  const options=parseReportFormatOptions(inputOptions);
  const report=content.report.filter(section=>options.part==='appendix'?reportPart(section.title)==='appendix':reportPart(section.title)!=='appendix');
  // Stable grouping changes only the exported layout; the saved editor order remains intact.
  if(options.part==='main'){
    const roleOrder={abstract:0,body:1,references:2,appendix:3};
    report.sort((left,right)=>roleOrder[reportPart(left.title)]-roleOrder[reportPart(right.title)]);
  }
  if(!report.length)throw Error(options.part==='appendix'?'请先添加独立的“附录”章节，再单独导出附录。':'报告正文至少需要一个章节。');
  const { Document, Packer, Paragraph, TextRun, AlignmentType, Footer, PageNumber, NumberFormat, SectionType, TableOfContents } = await import("docx");
  const {default:JSZip}=await import('jszip');
  const font=(name:string)=>({ascii:name,hAnsi:name,eastAsia:name,cs:name,hint:'eastAsia'});
  const bodyRun={font:font('宋体'),size:24,sizeComplexScript:24,color:'000000'};
  const headingRun=(level:number)=>({font:font(level<=2?'黑体':'宋体'),size:level===1?30:level===2?28:24,sizeComplexScript:level===1?30:level===2?28:24,bold:false,color:'000000'});
  const bodyParagraph={spacing:{before:120,after:0,line:300},indent:{firstLineChars:options.firstLineChars*100},widowControl:true};
  const styles=[
    {id:'Normal',name:'Normal',run:bodyRun,paragraph:bodyParagraph},
    {id:'Title',name:'Title',basedOn:'Normal',next:'Normal',run:{...bodyRun,size:32,sizeComplexScript:32,bold:true},paragraph:{alignment:AlignmentType.CENTER,spacing:{line:240,beforeAutoSpacing:true,afterAutoSpacing:true},indent:{firstLine:0,firstLineChars:0},keepNext:true}},
    ...[1,2,3,4,5].map(level=>({id:`Heading${level}`,name:`heading ${level}`,basedOn:'Normal',next:'Normal',quickFormat:true,run:headingRun(level),paragraph:{spacing:{line:300,before:120,after:0},indent:{firstLine:0,firstLineChars:0},keepNext:true,keepLines:true,outlineLevel:level-1}})),
    {id:'ReportSpecialHeading',name:'摘要与参考文献名称',basedOn:'Normal',next:'Normal',run:{...bodyRun,font:font('黑体'),size:28,sizeComplexScript:28},paragraph:{alignment:AlignmentType.CENTER,spacing:{line:300,before:120,after:0},indent:{firstLine:0,firstLineChars:0},keepNext:true}},
    {id:'ReportReference',name:'参考文献正文',basedOn:'Normal',run:bodyRun,paragraph:{...bodyParagraph,indent:{firstLine:0,firstLineChars:0}}},
    {id:'ReportCaption',name:'图表题',basedOn:'Normal',run:bodyRun,paragraph:{alignment:AlignmentType.CENTER,spacing:{line:300,before:120,after:0},indent:{firstLine:0,firstLineChars:0},keepNext:true}},
    {id:'ReportTableText',name:'表内文字',basedOn:'Normal',run:bodyRun,paragraph:{spacing:{line:240,before:0,after:0},indent:{firstLine:0,firstLineChars:0}}},
    ...[1,2,3].map(level=>({id:`TOC${level}`,name:`toc ${level}`,basedOn:'Normal',run:bodyRun,paragraph:{spacing:{line:300,before:0,after:0},indent:{left:(level-1)*240,firstLine:0,firstLineChars:0}}})),
  ];
  const page={size:{width:11906,height:16838},margin:{top:1440,bottom:1440,left:1803,right:1803,header:720,footer:720,gutter:0}};
  const sections:ConstructorParameters<typeof Document>[0]['sections'][number][]=[];
  const footer=()=>new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,indent:{firstLine:0,firstLineChars:0},spacing:{before:0,after:0,line:240},children:[new TextRun({...bodyRun,children:[PageNumber.CURRENT]})]})]});
  function addSection(children:(InstanceType<typeof Paragraph>|InstanceType<typeof TableOfContents>)[],kind:'cover'|'preliminary'|'body',restart?:number){
    sections.push({properties:{type:SectionType.NEXT_PAGE,page:{...page,...(kind==='cover'||!options.numberPages?{}:{pageNumbers:{formatType:kind==='preliminary'?NumberFormat.UPPER_ROMAN:NumberFormat.DECIMAL,...(restart===undefined?{}:{start:restart})}})}},footers:{default:kind==='cover'||!options.numberPages?new Footer({children:[]}):footer()},children});
  }
  const title=()=>new Paragraph({style:'Title',children:[new TextRun({...bodyRun,text:content.title,size:32,sizeComplexScript:32,bold:true})]});
  if(options.includeCover&&options.part==='main')addSection([title(),...(content.subtitle?[new Paragraph({alignment:AlignmentType.CENTER,indent:{firstLine:0,firstLineChars:0},children:[new TextRun({...bodyRun,text:content.subtitle})]})]:[])],'cover');
  let bodyStarted=false,tocInserted=false,preliminaryStarted=false;
  function toc(){if(options.includeToc&&options.part==='main'&&!tocInserted){addSection([new Paragraph({style:'ReportSpecialHeading',text:'目录'}),new TableOfContents('目录',{hyperlink:true,headingStyleRange:'1-3'})],'preliminary',preliminaryStarted?undefined:1);preliminaryStarted=true;tocInserted=true;}}
  report.forEach(section=>{
    const part=reportPart(section.title),preliminary=part==='abstract'&&!bodyStarted;
    if(!preliminary)toc();
    const headingStyle=part==='abstract'||part==='references'?'ReportSpecialHeading':`Heading${reportHeadingLevel(section.title)||1}`;
    const children=[...(!options.includeCover&&!sections.length?[title()]:[]),new Paragraph({style:headingStyle,children:[new TextRun({text:section.title||'未命名章节'})]})];
    section.body.split('\n').forEach(line=>{
      const heading=part==='body'&&line.length<=100?reportHeadingLevel(line):null;
      children.push(new Paragraph({style:heading?`Heading${heading}`:part==='references'?'ReportReference':'Normal',children:[new TextRun({text:line})]}));
    });
    if(section.source)children.push(new Paragraph({style:'ReportReference',children:[new TextRun({text:`来源 / 说明：${section.source}`})]}));
    if(preliminary){addSection(children,'preliminary',preliminaryStarted?undefined:1);preliminaryStarted=true;}
    else if(part==='body'&&bodyStarted){const index=sections.length-1;sections[index]={...sections[index],children:[...sections[index].children,...children]};}
    else {addSection(children,'body',bodyStarted?undefined:1);bodyStarted=true;}
  });
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
  return new Blob([await archive.generateAsync({type:'arraybuffer',compression:'DEFLATE'})],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
export async function buildPptx(content: EditorContent): Promise<Blob> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = ""; pptx.company = ""; pptx.subject = ""; pptx.title = content.title;
  pptx.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei" };
  const accent = ACCENTS[content.accent];
  for (const [index, item] of content.slides.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.15, h: 7.5, line: { transparency: 100 }, fill: { color: accent } });
    const cover = item.layout === "cover";
    const two = item.layout === "two-column";
    slide.addText(item.title, { x: .65, y: cover ? 1.8 : .55, w: 12, h: cover ? 1.8 : 1.25, fontSize: cover ? 34 : 28, bold: true, color: accent, margin: 0, breakLine: false, fit: "shrink" });
    slide.addText(item.body, { x: .68, y: cover ? 4 : 2.05, w: two ? 7.1 : 11.95, h: cover ? 2.4 : 4.55, fontSize: cover ? 22 : 21, color: "263340", margin: 0, valign: "top", fit: "shrink", paraSpaceAfter: 14, lineSpacingMultiple: 1.25 });
    if (two) {
      slide.addShape(pptx.ShapeType.rect, { x: 8.35, y: 2.05, w: 4.2, h: 4.55, line: { transparency: 100 }, fill: { color: "F0F4F6" } });
      slide.addText(item.aside, { x: 8.6, y: 2.3, w: 3.7, h: 4.05, fontSize: 18, color: "34495E", margin: 0, valign: "top", fit: "shrink" });
    }
    slide.addText(String(index + 1).padStart(2, "0"), { x: 12, y: 7.02, w: .6, h: .22, fontSize: 10, color: "64748B", margin: 0, align: "right" });
    if (item.notes) slide.addNotes(item.notes);
  }
  return await pptx.write({ outputType: "blob", compression: true }) as Blob;
}
