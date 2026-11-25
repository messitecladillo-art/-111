import { validateQuality, wordBlocks, addQualityObjects, assertFindingReferences, ensureXmlDescr, insertMath, richRuns, sanitizeExportAltText, smoothBodyMethodLead, textRuns, type SvgPreviewRenderer, type WordContext } from "./quality-export.ts";
import { blockLabel, reportLabels } from "./report-numbering.ts";
import { ACCENTS, parseEditorContent, type EditorContent } from "./editor-model.ts";
import {addFrameToWord} from './report-frame-export.ts';
import { DEFAULT_REPORT_OPTIONS, parseReportFormatOptions, reportHeadingLevel, reportPart, type ReportFormatOptions } from './report-format.ts';
import { formatReference, referenceNumbers, unfinishedCited, unfinishedReference } from './references.ts';
import { A4_PAGE_PX, coverHasEmbeddedTitle, pageArtBytes } from './page-art.ts';
import { normalizeAcademicPunctuation, normalizePaperProse } from './typography.ts';

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function fileName(title: string) { return title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 80) || "未命名研究"; }
export async function buildDocx(content: EditorContent, inputOptions: ReportFormatOptions = content.reportFormat?.options ?? DEFAULT_REPORT_OPTIONS, renderSvg?:SvgPreviewRenderer): Promise<Blob> {
  assertFindingReferences(content);
  content=parseEditorContent(content);
  await validateQuality(content);
  const options=parseReportFormatOptions(inputOptions);
  const report=content.report.filter(section=>options.part==='appendix'?reportPart(section.title)==='appendix':reportPart(section.title)!=='appendix');
  if(!report.length)throw Error(options.part==='appendix'?'请先添加独立的“附录”章节，再单独导出附录。':'报告正文至少需要一个章节。');
  // An appendix-only export prints no list, but a number it cites must still belong to a finished entry.
  if(options.part==='appendix'&&unfinishedCited(content,report))throw Error(`附录引用的第 ${unfinishedCited(content,report)} 条参考文献尚未填写题名，请补全后再导出。`);
  // Structured references become the numbered list of the references section; a list also typed into that section would be numbered twice.
  const cited = referenceNumbers(content);
  if (cited.order.length && options.part !== 'appendix') {
    const listSection = content.report.find(s => reportPart(s.title) === 'references');
    if (!listSection) throw Error('已录入参考文献，但报告中没有“参考文献”一节，请先插入该节。');
    if (listSection.body.trim()) throw Error('参考文献一节中仍有手写条目，请在参考文献面板中转为文献条目，或清空该节正文后再导出。');
    const blank = cited.order.findIndex(unfinishedReference);
    if (blank >= 0) throw Error(`第 ${blank + 1} 条参考文献尚未填写题名，请补全或删除后再导出。`);
  }
  const { Document, Packer, Paragraph, TextRun, AlignmentType, Footer, Header, ImageRun, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType, PageNumber, NumberFormat, SectionType, TableOfContents, StyleLevel } = await import("docx");
  const {default:JSZip}=await import('jszip');
  // Chinese in 宋体 / 黑体; Latin letters and numbers in Times New Roman, as competition templates set them.
  const font=(eastAsia:string)=>({ascii:'Times New Roman',hAnsi:'Times New Roman',eastAsia,cs:'Times New Roman',hint:'eastAsia'});
  const bodyRun={font:font('宋体'),size:24,sizeComplexScript:24,color:'000000'};
  const smallRun={...bodyRun,size:18,sizeComplexScript:18};
  const headingRun=(level:number)=>({font:font(level<=2?'黑体':'宋体'),size:level===1?30:level===2?28:24,sizeComplexScript:level===1?30:level===2?28:24,bold:level===1,color:'000000'});
  const bodyParagraph={spacing:{before:120,after:0,line:300},indent:{firstLineChars:options.firstLineChars*100},widowControl:true};
  const flush={indent:{firstLine:0,firstLineChars:0}};
  const styles=[
    {id:'Normal',name:'Normal',run:bodyRun,paragraph:bodyParagraph},
    {id:'Title',name:'Title',basedOn:'Normal',next:'Normal',run:{...bodyRun,size:32,sizeComplexScript:32,bold:true},paragraph:{alignment:AlignmentType.CENTER,spacing:{line:240,beforeAutoSpacing:true,afterAutoSpacing:true},...flush,keepNext:true}},
    ...[1,2,3,4,5].map(level=>({id:`Heading${level}`,name:`heading ${level}`,basedOn:'Normal',next:'Normal',quickFormat:true,run:headingRun(level),paragraph:{...(level===1?{alignment:AlignmentType.CENTER}:{}),spacing:{line:300,before:120,after:0},...flush,keepNext:true,keepLines:true,outlineLevel:level-1}})),
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
  const sectionKinds:('cover'|'body'|'appendix'|'preliminary')[]=[];
  const footer=()=>new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,indent:{firstLine:0,firstLineChars:0},spacing:{before:0,after:0,line:240},children:[new TextRun({...bodyRun,children:[PageNumber.CURRENT]})]})]});
  // A whole-page image behind the text, placed at the page's top-left corner: the cover, or the frame in the header.
  const pageImage=(art:NonNullable<EditorContent['coverImage']|EditorContent['frameImage']>,name:string,title:string,description:string)=>new ImageRun({type:art.mime==='image/png'?'png':'jpg',data:pageArtBytes(art),transformation:{width:A4_PAGE_PX.width,height:A4_PAGE_PX.height},altText:{title,description,name},floating:{horizontalPosition:{relative:HorizontalPositionRelativeFrom.PAGE,offset:0},verticalPosition:{relative:VerticalPositionRelativeFrom.PAGE,offset:0},behindDocument:true,allowOverlap:true,lockAnchor:true,layoutInCell:false,wrap:{type:TextWrappingType.NONE}}});
  // The frame image sits in the first header after the cover; later sections link to it, so the file holds it once.
  let frameHeaderPlaced=false;
  const frameHeader=()=>{if(!content.frameImage||frameHeaderPlaced)return undefined;frameHeaderPlaced=true;return {default:new Header({children:[new Paragraph({...flush,spacing:{before:0,after:0,line:240},children:[pageImage(content.frameImage,'frame-image','页框','页面四周的装饰页框')]})]})};};
  function addSection(children:ConstructorParameters<typeof Document>[0]["sections"][number]["children"],kind:'cover'|'preliminary'|'body',restart?:number){
    sectionKinds.push(kind==='body'&&options.part==='appendix'?'appendix':kind);
    const headers=kind==='cover'?undefined:frameHeader();
    sections.push({...(headers?{headers}:{}),properties:{type:SectionType.NEXT_PAGE,page:{...page,...(kind==='cover'||!options.numberPages?{}:{pageNumbers:{formatType:kind==='preliminary'?NumberFormat.UPPER_ROMAN:NumberFormat.DECIMAL,...(restart===undefined?{}:{start:restart})}})}},footers:{default:kind==='cover'||!options.numberPages?new Footer({children:[]}):footer()},children});
  }
  const title=()=>new Paragraph({style:'Title',children:textRuns(TextRun,normalizeAcademicPunctuation(content.title),{...bodyRun,size:32,sizeComplexScript:32,bold:true})});
  if(options.includeCover&&content.coverImage){
    const rawCoverTitle=content.title.trim()||'专题调查报告';
    const coverAlt=sanitizeExportAltText(content.subtitle?`报告封面“${rawCoverTitle}——${content.subtitle}”`:`报告封面“${rawCoverTitle}”`,'调查研究报告封面');
    const embeddedCoverTitle=coverHasEmbeddedTitle(content.coverImage)||/(?:封面技能|题名字形在图中|图文一体)/u.test(content.coverImage.note);
    if(embeddedCoverTitle){
      // Integrated GPT-Image / `research-report-cover` artwork with lettering drawn directly in the image: keep single empty paragraph.
      addSection([new Paragraph({...flush,spacing:{before:0,after:0,line:240},children:[pageImage(content.coverImage,'cover-image','封面',coverAlt)]})],'cover');
    }else{
      // Track-2 / showcase editorial cover with upper negative space reserved for crisp overlaid title + subtitle only.
      const coverChildren:InstanceType<typeof Paragraph>[]=[
        new Paragraph({
          style:'ReportCoverTitle',
          spacing:{before:720,after:180,line:420},
          children:[
            pageImage(content.coverImage,'cover-image','封面',coverAlt),
            ...textRuns(TextRun,normalizeAcademicPunctuation(content.title),{font:font('黑体'),size:42,sizeComplexScript:42,bold:true,color:'0F172A'}),
          ],
        }),
        ...(content.subtitle?[
          new Paragraph({
            style:'ReportCoverSubtitle',
            spacing:{before:60,after:140,line:340},
            children:textRuns(TextRun,normalizeAcademicPunctuation(content.subtitle),{font:font('宋体'),size:26,sizeComplexScript:26,color:'1E293B'}),
          }),
        ]:[]),
      ];
      addSection(coverChildren,'cover');
    }
    // The artwork is the whole page: no page frame is printed over it.
    sectionKinds[sectionKinds.length-1]='preliminary';
  }
  else if(options.includeCover){
    addSection([new Paragraph({style:'ReportCoverTitle',children:textRuns(TextRun,normalizeAcademicPunctuation(content.title))}),...(content.subtitle?[new Paragraph({style:'ReportCoverSubtitle',children:textRuns(TextRun,normalizeAcademicPunctuation(content.subtitle))})]:[])],'cover');
  }
  // Numbers come from the whole draft, so the main text and a separately exported appendix agree.
  const ctx:WordContext={labels:reportLabels(content.report),math:[],where:'',section:'',citations:cited.numbers};
  const exported=(kind:'figure'|'table')=>report.some(s=>(s.blocks??[]).some(b=>blockLabel(ctx.labels,s.id,b.id)?.kind===kind));
  let bodyStarted=false,tocInserted=false,preliminaryStarted=false;
  function toc(){
    if(!options.includeToc||tocInserted)return;
    const children:Array<ConstructorParameters<typeof Document>[0]["sections"][number]["children"][number]>=[new Paragraph({style:'ReportSpecialHeading',text:'目录'}),new TableOfContents('目录',{hyperlink:true,headingStyleRange:'1-3'})];
    if(exported('table'))children.push(new Paragraph({style:'ReportSpecialHeading',pageBreakBefore:true,text:'表目录'}),new TableOfContents('表目录',{hyperlink:true,stylesWithLevels:[new StyleLevel('表题',1)]}));
    // The list of figures starts a page of its own, as the contents and the list of tables do; all stay within the counted front matter.
    if(exported('figure'))children.push(new Paragraph({style:'ReportSpecialHeading',pageBreakBefore:true,text:'图目录'}),new TableOfContents('图目录',{hyperlink:true,stylesWithLevels:[new StyleLevel('图题',1)]}));
    addSection(children,'preliminary',preliminaryStarted?undefined:1);preliminaryStarted=true;tocInserted=true;
  }
  for(const section of report){
    const part=reportPart(section.title),preliminary=part==='abstract'&&!bodyStarted;
    if(!preliminary)toc();
    ctx.where=section.title||'未命名章节';ctx.section=section.id;
    const headingStyle=part==='abstract'||part==='references'?'ReportSpecialHeading':`Heading${reportHeadingLevel(section.title)||1}`;
    const children:Array<ConstructorParameters<typeof Document>[0]["sections"][number]["children"][number]>=[...(!options.includeCover&&!sections.length?[title()]:[]),new Paragraph({style:headingStyle,children:textRuns(TextRun,normalizeAcademicPunctuation(section.title||'未命名章节'))})];
    // A chapter heading followed directly by its first section has no body; do not emit a blank paragraph.
    const generatedAppendix=part==='appendix'&&!section.blocks?.length&&/^appendix-(?:data|ai|claims)-[a-f0-9]{64}$/.test(section.id);
    if(generatedAppendix){
      const records=section.body.split('\n\n');
      for(const [index,record] of records.entries()){
        const runs=[];
        for(const [i,line] of record.split('\n').entries()){
          if(i)runs.push(new TextRun({break:1}));
          runs.push(...await richRuns(line,ctx));
        }
        if(index===records.length-1&&section.source)runs.push(new TextRun({break:1}),...textRuns(TextRun,`来源 / 说明：${normalizeAcademicPunctuation(section.source)}`));
        children.push(new Paragraph({style:'ReportReference',children:runs}));
      }
    }else{
    const lines=section.body?section.body.split('\n'):[];
    const lastWritten=lines.findLastIndex(line=>line.trim().length>0);
    const attachSource=part==='appendix'&&!!section.source&&!section.blocks?.length&&lastWritten>=0&&lines[lastWritten].length<=500;
    for(const [i,line] of lines.entries()){
      const heading=part==='body'&&line.length<=100?reportHeadingLevel(line):null;
      // "关键词：" opens the keyword line in bold, as abstracts set it.
      const keywords=part==='abstract'?/^(关键词[:：])\s*/.exec(line):null;
      const bodyLine=part==='body'&&!heading&&!/写作提示/u.test(line)?smoothBodyMethodLead(line):line;
      // A questionnaire item stays on the page of the options printed under it.
      children.push(new Paragraph({style:heading?`Heading${heading}`:part==='references'?'ReportReference':'Normal',...(/^[○□]/.test(lines[i+1]??'')||attachSource&&i>=lastWritten?{keepNext:true}:{}),children:keywords?[new TextRun({text:keywords[1],bold:true,font:font('黑体')}),...await richRuns(line.slice(keywords[0].length),ctx)]:await richRuns(bodyLine,ctx)}));
    }
    }
    if(part==='references')cited.order.forEach((entry,i)=>children.push(new Paragraph({style:'ReportReferenceItem',children:[new TextRun(`[${i+1}]\t`),...textRuns(TextRun,normalizeAcademicPunctuation(formatReference(entry)))]})));
    if(section.blocks?.length)children.push(...await wordBlocks(section.blocks,content,renderSvg,ctx));
    if(section.source&&!generatedAppendix)children.push(new Paragraph({style:'ReportSource',...(part==='appendix'&&section.source.length<=500?{keepLines:true}:{}),children:textRuns(TextRun,`来源 / 说明：${normalizeAcademicPunctuation(section.source)}`)}));
    if(preliminary){addSection(children,'preliminary',preliminaryStarted?undefined:1);preliminaryStarted=true;}
    else if(part==='body'&&bodyStarted){const index=sections.length-1;sections[index]={...sections[index],children:[...sections[index].children,...children]};}
    else {addSection(children,'body',bodyStarted?undefined:1);bodyStarted=true;}
  }
  if(!bodyStarted)toc();
  const doc=new Document({creator:'',lastModifiedBy:'',title:'',description:'',features:{updateFields:true},styles:{default:{document:{run:bodyRun,paragraph:bodyParagraph}},paragraphStyles:styles},sections});
  // Word's half-line spacing is a line-relative measure, not an approximation in points.
  // docx exposes twips but not beforeLines, so set this exact OOXML attribute after packing.
  const archive=await JSZip.loadAsync(await Packer.toArrayBuffer(doc));
  if(content.reportFrame)await addFrameToWord(archive,content.reportFrame,sectionKinds);
  const styleXml=await archive.file('word/styles.xml')!.async('string');
  archive.file('word/styles.xml',styleXml.replace(/<w:style\b[\s\S]*?<\/w:style>/g,block=>{
    // A style that sets its own space before (table text, captions, figures, notes, contents, the cover) states that
    // it is not line-relative: an inherited beforeLines would otherwise win over its points, as Word resolves them.
    if(!/w:styleId="(?:Normal|ReportReference|ReportSpecialHeading|ReportCaption|Heading[1-5])"/.test(block))return block.replace(/<w:spacing\b([^>]*\sw:before="[^"]*"[^>]*)\/>/,(_match,attrs:string)=>`<w:spacing${attrs} w:beforeLines="0"/>`);
    return block.replace(/<w:spacing\b([^>]*)\/>/,(_match,attrs:string)=>`<w:spacing${attrs.replace(/\s+w:before="[^"]*"/g,'')} w:beforeLines="50"/>`);
  }));
  const shortNumericCellRe=/^(?:[−+-]?\d+(?:\.\d+)?(?:\*{1,3}|%)?|<0\.\d+\*{0,3}|&lt;0\.\d+\*{0,3}|\[[−+-]?\d+(?:\.\d+)?,\s*[−+-]?\d+(?:\.\d+)?\]|—)$/u;
  // A paragraph that sets its own space before in points states that it is not line-relative, as its style would say.
  for(const name of Object.keys(archive.files).filter(n=>/^word\/(?:document|footer\d+|header\d+)\.xml$/.test(n))){
    let xml=await archive.file(name)!.async('string');
    xml=xml.replace(/<w:spacing\b(?![^>]*w:beforeLines)([^>]*\sw:before="[^"]*"[^>]*?)\/>/g,(_m,attrs:string)=>`<w:spacing${attrs} w:beforeLines="0"/>`);
    xml=ensureXmlDescr(xml,'docx');
    if(name==='word/document.xml'){
      // Keep short numeric cells in data rows on a single line (<w:noWrap/> before <w:tcMar> per ECMA-376 CT_TcPrBase).
      xml=xml.replace(/<w:tr[\s>][\s\S]*?<\/w:tr>/g,(rowXml)=>{
        if(rowXml.includes('<w:tblHeader/>'))return rowXml;
        return rowXml.replace(/<w:tc>([\s\S]*?)<\/w:tc>/g,(cellXml,inner:string)=>{
          if(inner.includes('<w:tc>')||inner.includes('<w:noWrap'))return cellXml;
          const txt=[...inner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('').trim();
          if(!txt||txt.length>18||!shortNumericCellRe.test(txt))return cellXml;
          return cellXml.replace('<w:tcMar>','<w:noWrap/><w:tcMar>');
        });
      });
    }
    archive.file(name,xml);
  }
  if(ctx.math.length){
    // docx cannot write Office Math, so formulas travel as placeholder runs and are swapped in here.
    const documentXml=insertMath(await archive.file('word/document.xml')!.async('string'),ctx.math);
    if(documentXml.includes('§§OMML'))throw Error('公式写入失败，请检查公式后重试。');
    archive.file('word/document.xml',documentXml);
  }
  return new Blob([await archive.generateAsync({type:'arraybuffer',compression:'DEFLATE'})],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
export async function buildPptx(content: EditorContent, renderSvg?:SvgPreviewRenderer): Promise<Blob> {
  assertFindingReferences(content);
  content=parseEditorContent(content);
  await validateQuality(content);
  const { default: PptxGenJS } = await import("pptxgenjs");
  const { default: JSZip } = await import("jszip");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = ""; pptx.company = ""; pptx.subject = ""; pptx.title = normalizeAcademicPunctuation(content.title);
  pptx.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei" };
  const accent = ACCENTS[content.accent];
  // PowerPoint uses the run language for Chinese punctuation and line breaking.
  const chineseText = { fontFace: "Microsoft YaHei", lang: "zh-CN" };
  const slideAltMaps: Map<string, string>[] = [];
  for (const [index, item] of content.slides.entries()) {
    const slide = pptx.addSlide();
    const altMap = new Map<string, string>();
    slideAltMaps.push(altMap);
    slide.background = { color: "FFFFFF" };
    if(item.objects!==undefined){
      const sources=await addQualityObjects(slide,pptx,item.objects,content,renderSvg,altMap);
      if(item.notes||sources)slide.addNotes(normalizePaperProse([item.notes,sources].filter(Boolean).join("\n\n")));
      continue;
    }
    const accentName = `slide-${index + 1}-accent`;
    altMap.set(accentName, "幻灯片侧边装饰色条");
    slide.addShape(pptx.ShapeType.rect, { objectName: accentName, x: 0, y: 0, w: 0.15, h: 7.5, line: { transparency: 100 }, fill: { color: accent } });
    const cover = item.layout === "cover";
    const two = item.layout === "two-column";
    const cleanTitle = normalizeAcademicPunctuation(item.title);
    const titleName = `slide-${index + 1}-title`;
    altMap.set(titleName, sanitizeExportAltText(cleanTitle ? `幻灯片标题“${cleanTitle}”` : "幻灯片页面标题", "幻灯片页面标题"));
    slide.addText(cleanTitle, { ...chineseText, objectName: titleName, x: .65, y: cover ? 1.8 : .55, w: 12, h: cover ? 1.8 : 1.25, fontSize: cover ? 34 : 28, bold: true, color: accent, margin: 0, breakLine: false, fit: "shrink" });
    const cleanBody = normalizePaperProse(item.body);
    const bodyName = `slide-${index + 1}-body`;
    altMap.set(bodyName, "幻灯片正文内容");
    slide.addText(cleanBody, { ...chineseText, objectName: bodyName, x: .68, y: cover ? 4 : 2.05, w: two ? 7.1 : 11.95, h: cover ? 2.4 : 4.55, fontSize: cover ? 22 : 21, color: "263340", margin: 0, valign: "top", fit: "shrink", paraSpaceAfter: 14, lineSpacingMultiple: 1.25 });
    if (two) {
      const asideBgName = `slide-${index + 1}-aside-bg`;
      const asideName = `slide-${index + 1}-aside`;
      altMap.set(asideBgName, "幻灯片双栏对照底衬色块");
      altMap.set(asideName, "幻灯片侧栏补充说明");
      slide.addShape(pptx.ShapeType.rect, { objectName: asideBgName, x: 8.35, y: 2.05, w: 4.2, h: 4.55, line: { transparency: 100 }, fill: { color: "F0F4F6" } });
      slide.addText(normalizePaperProse(item.aside), { ...chineseText, objectName: asideName, x: 8.6, y: 2.3, w: 3.7, h: 4.05, fontSize: 18, color: "34495E", margin: 0, valign: "top", fit: "shrink" });
    }
    const pageNumName = `slide-${index + 1}-pagenum`;
    altMap.set(pageNumName, `第 ${index + 1} 页页码标识`);
    slide.addText(String(index + 1).padStart(2, "0"), { ...chineseText, objectName: pageNumName, x: 12, y: 7.02, w: .6, h: .22, fontSize: 10, color: "64748B", margin: 0, align: "right" });
    if (item.notes) slide.addNotes(normalizePaperProse(item.notes));
  }
  const rawBuffer = await pptx.write({ outputType: "arraybuffer", compression: true }) as ArrayBuffer;
  const archive = await JSZip.loadAsync(rawBuffer);
  for (const name of Object.keys(archive.files)) {
    const m = /^ppt\/slides\/slide(\d+)\.xml$/.exec(name);
    if (!m) continue;
    const slideIndex = Number(m[1]) - 1;
    const slideXml = await archive.file(name)!.async("string");
    archive.file(name, ensureXmlDescr(slideXml, "pptx", slideAltMaps[slideIndex]));
  }
  return new Blob([await archive.generateAsync({ type: "arraybuffer", compression: "DEFLATE" })], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}
