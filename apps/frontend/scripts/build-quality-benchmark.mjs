import fs from 'node:fs/promises';
import sharp from 'sharp';
const renderSvg=async svg=>new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
import path from 'node:path';
import {parseSurveyCsv} from '../lib/survey-analysis.ts';
import {runRecipe} from '../lib/analysis-recipes.ts';
import {calculationReceipt} from '../lib/analysis-result-receipt.ts';
import {datasetIdentity} from '../lib/questionnaire-mapping.ts';
import {createEditorContent,parseEditorContent} from '../lib/editor-model.ts';
import {snapshotRecipe,digestText,defaultFinding,confirmFinding,findingSignature,makeSlideObject,verifyResearchQuality} from '../lib/research-quality.ts';
import {composeQualitySlide,withQuality} from '../lib/quality-layouts.ts';
import {buildDocx,buildPptx} from '../lib/editor-export.ts';
import {buildLatexSource,generateLatexBody} from '../lib/latex-report.ts';
import {bindReportSlide,reportFigureCoverage} from '../lib/report-storyboard.ts';

const [sourcePath,outPath]=process.argv.slice(2);if(!sourcePath||!outPath)throw Error('Provide source CSV and private output directory.');
const raw=await fs.readFile(sourcePath,'utf8'),sourceHash=await digestText(raw),table=parseSurveyCsv(raw,';');
const additional=table.headers.includes('emp.var.rate');
const priorDayNote=additional?'pdays=999 表示此前未联络':'pdays=-1 表示此前未联络';
const historyAction=additional?'对无既往联络客户设计首次联络试点。':'核查历史联络结果未记录的客户信息。';
const sourceName=`UCI Bank Marketing / ${path.basename(sourcePath)}`,sourceUrl='https://archive.ics.uci.edu/dataset/222/bank%2Bmarketing';
const column=name=>{const index=table.headers.indexOf(name);if(index<0)throw Error(`Missing required column ${name}`);return index;};
const recipes=[
  {id:'subscriptions',method:'frequency',x:column('y'),y:null,question:'当前记录中，订阅结果如何分布？'},
  {id:'history',method:'crosstab',x:column('poutcome'),y:column('y'),question:'不同历史联络状态的订阅结果有何差别？'},
  {id:'age',method:'groups',x:column('y'),y:column('age'),question:'两类订阅结果对应的年龄分布如何？'},
];
const source={sourceName,sourceUrl,sourceHash,classification:'public'};
const chinese={yes:'已订阅',no:'未订阅',unknown:'未记录历史结果',nonexistent:'无既往联络记录',failure:'既往未成功',success:'既往成功',other:'其他既往结果'};
const results=[];
const identity=await datasetIdentity(sourceHash,'utf-8',table);
for(const recipe of recipes){
  const computed=runRecipe(table,recipe,[]);
  computed.rows=computed.rows.map(row=>row.map(cell=>typeof cell==='string'?chinese[cell]??cell:cell));
  if(computed.inference?.comparisons)computed.inference.comparisons=computed.inference.comparisons.map(pair=>({...pair,a:chinese[pair.a]??pair.a,b:chinese[pair.b]??pair.b}));
  computed.warnings=[...computed.warnings,'公开历史记录不作总体外推。'];
  const node={...recipe,branch:'全部记录',filter:null,scale:null};
  const sample={totalRows:table.rows.length,branchRows:table.rows.length,excludedRows:0,missingRows:0,filterColumn:null,values:[]};
  const calculation=calculationReceipt(node,table.headers,[],identity.interpretationHash,null,sample,computed.total,null,null);
  results.push(await snapshotRecipe(computed,{...source,title:recipe.question},recipe.id,calculation));
}
const yes=results[0].rows.find(row=>row[0]==='已订阅'),yesCount=yes[1],rate=yes[2];
const history=results[1];
const success=history.rows.find(row=>row[0]==='既往成功'&&row[1]==='已订阅');
const comparisonLabel=history.rows.some(row=>row[0]==='未记录历史结果')?'未记录历史结果':'无既往联络记录';
const unknown=history.rows.find(row=>row[0]===comparisonLabel&&row[1]==='已订阅');
if(!success||!unknown)throw Error('当前数据缺少比较所需的历史状态，不能生成对应发现。');
const age=results[2],subAge=age.rows.find(row=>row[0]==='已订阅'),notAge=age.rows.find(row=>row[0]==='未订阅');
const pct=x=>Number(x).toFixed(1),mean=x=>Number(x).toFixed(2);
const quality={version:1,results,findings:[]};
const findingInputs=[
  {result:results[0],title:`订阅比例为 ${pct(rate)}%`,question:recipes[0].question,interpretation:`${table.rows.length.toLocaleString('zh-CN')} 条记录中，${yesCount} 条订阅了定期存款，占 ${pct(rate)}%。评价触达时应同时关注成功结果和联络投入。`,alternatives:'订阅结果同时受产品、客户需求、联络时机等因素影响。',scope:'适用于这批历史记录的描述，不代表当前市场比例。',action:'试点评价同时记录订阅率与每次有效订阅的触达成本。'},
  {result:history,title:'既往联络状态值得分层比较',question:recipes[1].question,interpretation:`既往成功组的订阅比例为 ${pct(success[3])}%，${comparisonLabel}组为 ${pct(unknown[3])}%。两组的差异提示可以设计分层试点。`,alternatives:'客户需求、此前筛选和联络安排可能共同影响这种差异。',scope:'组间描述差异不等于再次联络的增量效果。',action:'设置分层对照试点，比较新增订阅及触达成本，再决定推广。'},
  {result:age,title:'年龄分布可帮助描述客户差异',question:recipes[2].question,interpretation:`订阅组平均年龄 ${mean(subAge[2])} 岁，未订阅组 ${mean(notAge[2])} 岁。均值需要结合组内离散程度及样本规模一起阅读。`,alternatives:'就业状态、资产需求等可能与年龄和订阅共同相关。',scope:'分组描述与差异检验均保存在计算记录中；结果只用于理解当前历史记录，不据此作总体外推或因果判断。',action:'试点分层时同时观察需求与联络历史，避免单凭年龄划分资源。'},
];
for(const input of findingInputs){const {result,...fields}=input;quality.findings.push(confirmFinding({...defaultFinding(result),...fields},quality));}
let content=withQuality(createEditorContent());content.title='客户差异与定期存款触达策略';content.subtitle='公开历史营销数据研究样板';content.accent='blue';content.quality=quality;
const scope=`公开历史记录 ${table.rows.length.toLocaleString('zh-CN')} 条；来源 UCI Bank Marketing。`;
const sections=[
  {id:'problem',title:'一、研究问题与决策',body:'同一套触达方式能否适应不同客户？\n本研究比较订阅结果、历史联络状态与年龄分布，为分层触达试点提供依据。\n决策目标是选择值得试点的人群与评价指标。',blocks:[]},
  {id:'data',title:'二、数据来源与处理',body:`${scope}\n保留所有输入记录。空白按已有引擎规则处理，unknown 保留为独立类别。${priorDayNote}，不能当作普通天数。\n本样板不使用联络后的 duration 变量制定联络前策略。`,blocks:[]},
  {id:'finding-1',title:'三、订阅结果与触达评价',body:findingInputs[0].interpretation+'\n'+findingInputs[0].scope,blocks:[{id:'figure-1',kind:'chart',text:'图1 当前记录的订阅结果',evidenceId:'subscriptions',valueColumn:1}]},
  {id:'finding-2',title:'四、历史联络状态与订阅',body:findingInputs[1].interpretation+'\n'+findingInputs[1].alternatives+'\n'+findingInputs[1].scope,blocks:[{id:'table-1',kind:'table',text:'表1 历史联络状态与订阅结果',evidenceId:'history',valueColumn:3}]},
  {id:'finding-3',title:'五、年龄分布与综合解释',body:findingInputs[2].interpretation+'\n'+findingInputs[2].scope+'\n综合判断：联络历史与客户背景可以帮助提出分层试点，但是否值得追加联络，需要用新增收益而非单次观察比例来决定。',blocks:[{id:'table-2',kind:'table',text:'表2 两类订阅结果的年龄分布',evidenceId:'age',valueColumn:2}]},
  {id:'action',title:'六、分层试点与评价',body:`1. 建立小规模分层对照，按历史联络状态比较新增订阅。\n2. 同时记录触达次数、实际成本和新增订阅，明确何时停止追加联络。\n3. ${historyAction}\n4. 结合需求与年龄观察客户差异，避免用单一标签替代客户理解。`,blocks:[]},
  {id:'appendix-data',title:'附录一 数据来源与处理记录',body:`来源：${sourceUrl}\n文件：${path.basename(sourcePath)}\nSHA-256：${sourceHash}\n输入记录：${table.rows.length}；字段：${table.headers.length}。\n处理：不加权、不插补、不自动删重复；展示标签来自原编码字典。\n计算：复用 analysis-recipes 的频数、交叉表与分组描述。`,blocks:[]},
  {id:'appendix-ai',title:'附录二 AI 使用记录',body:'本样板的内容组织与程序开发使用 AI 辅助。统计数值由固定计算程序产生。\n装饰构图使用一份图像概念稿探索，正式素材使用独立矢量图元重建。\n未向模型发送逐行客户记录。实际在线模型调用与费用以服务回执登记。',blocks:[]},
  {id:'appendix-claims',title:'附录三 主张与证据对照',body:quality.findings.map(f=>`${f.title}\n支持问题：${f.question}\n证据：${f.evidenceIds.join('、')}\n适用范围：${f.scope}\n建议：${f.action}`).join('\n\n'),blocks:[]},
];
content.report=sections.map(s=>{const index=['finding-1','finding-2','finding-3'].indexOf(s.id),f=quality.findings[index];return {...s,source:s.blocks.length?'':scope,...(f?{findingIds:[f.id],findingSnapshots:{[f.id]:findingSignature(f)}}:{})};});
const slides=[
  {id:'quality-problem',title:'客户差异，怎样变成触达策略',body:'同一套触达方式，能否适应不同客户？\n\n比较订阅结果、历史联络状态与年龄分布。\n\n为小规模分层试点确定人群与评价指标。',aside:`公开营销记录\n${table.rows.length.toLocaleString('zh-CN')} 条`,notes:`数据来源：${sourceUrl}。公开业务数据研究样板。`,layout:'problem'},
  {id:'quality-finding',title:findingInputs[0].title,body:`${yesCount} 条已订阅\n\n${pct(rate)}% 的观察比例\n\n同时关注订阅结果和联络投入。`,aside:'',notes:findingInputs[0].interpretation+'\n'+findingInputs[0].scope,layout:'chart'},
  {id:'quality-comparison',title:'历史联络状态值得分层比较',body:`既往成功组 ${pct(success[3])}%，${comparisonLabel}组 ${pct(unknown[3])}%。这种差异需要通过试点检验。`,aside:'',notes:findingInputs[1].interpretation+'\n'+findingInputs[1].scope,layout:'comparison'},
  {id:'quality-action',title:'先分层试点，再决定推广',body:`按历史联络状态建立对照试点。\n\n同时评价新增订阅与触达成本。\n\n${historyAction}\n\n结合客户需求解释年龄差异。`,aside:'',notes:'建议尚未执行。是否有效需要后续对照试点验证。',layout:'action'},
];
const dataSlide={id:'quality-data',title:'公开历史记录，支持什么判断',body:sections[1].body,aside:'来源与口径',notes:sourceUrl,layout:'insight'};
const ageSlide={id:'quality-age',title:'平均年龄有差别，解释需结合分布',body:findingInputs[2].interpretation+'\n'+findingInputs[2].scope,aside:'',notes:findingInputs[2].alternatives,layout:'comparison'};
const actionBody=[
  `订阅结构 → 营销运营\n记录新增订阅、触达次数与实际费用。\n评价：新增订阅成本。\n依据：${yesCount}/${table.rows.length}。`,
  `联络历史 → 客户运营\n按历史状态开展对照，${additional?'设计首次联络试点':'核查未记录的历史结果'}。\n评价：新增订阅率、触达成本。`,
  `年龄差异 → 研究团队\n结合客户需求理解分组差异，避免单凭年龄分配资源。\n评价：分层试点表现。`,
].join('\n\n');
slides[3].body=actionBody;
content.report.find(s=>s.id==='action').body=actionBody;
content.slides=[composeQualitySlide(slides[0],'problem',quality,'subscriptions'),composeQualitySlide(dataSlide,'insight',quality,'',1),composeQualitySlide(slides[1],'chart',quality,'subscriptions'),composeQualitySlide(slides[2],'comparison',quality,'history'),composeQualitySlide(ageSlide,'comparison',quality,'age'),composeQualitySlide(slides[3],'action',quality,'')];
const sectionIds=['problem','data','finding-1','finding-2','finding-3','action'];
for(const [i,slide] of content.slides.entries()){
  const section=content.report.find(s=>s.id===sectionIds[i]),block=section.blocks[0];
  if(block)slide.objects=slide.objects.map(o=>o.kind===block.kind?{...o,sourceBlockId:block.id,valueColumn:block.valueColumn}:o);
  content.slides[i]=await bindReportSlide(content,slide,section.id);
}
content.slides[0].objects.push(makeSlideObject('text',{x:7,y:86,width:65,height:6,fontSize:13,text:scope,color:'#536677'}));
content.slides[0]=await bindReportSlide(content,content.slides[0],'problem');
content=parseEditorContent(content);await verifyResearchQuality(quality);
await fs.mkdir(outPath,{recursive:true});await fs.writeFile(path.join(outPath,'content.json'),JSON.stringify(content,null,2));
await fs.writeFile(path.join(outPath,'quality-report.docx'),Buffer.from(await (await buildDocx(content,{part:'main',includeCover:true,includeToc:false,firstLineChars:2,numberPages:true},renderSvg)).arrayBuffer()));
await fs.writeFile(path.join(outPath,'quality-appendices.docx'),Buffer.from(await (await buildDocx(content,{part:'appendix',includeCover:false,includeToc:false,firstLineChars:0,numberPages:true},renderSvg)).arrayBuffer()));
await fs.writeFile(path.join(outPath,'quality-linked-deck.pptx'),Buffer.from(await (await buildPptx(content)).arrayBuffer()));
await fs.writeFile(path.join(outPath,'quality-four-pages.pptx'),Buffer.from(await (await buildPptx({...content,slides:[content.slides[0],content.slides[2],content.slides[3],content.slides[5]]})).arrayBuffer()));
await fs.writeFile(path.join(outPath,'report-ppt-coverage.json'),JSON.stringify({figures:await reportFigureCoverage(content),chapters:content.report.map(s=>({id:s.id,pages:content.slides.flatMap((slide,i)=>slide.reportLink?.sectionId===s.id?[i+1]:[]),role:s.id.startsWith('appendix')?'separate_appendix':'main'}))},null,2));
await fs.writeFile(path.join(outPath,'quality-report.tex'),buildLatexSource({title:content.title,subtitle:content.subtitle,body:generateLatexBody(content),options:{part:'main',includeCover:true,includeToc:false,firstLineChars:2,numberPages:true}}));
await fs.writeFile(path.join(outPath,'source-summary.json'),JSON.stringify({sourceName,sourceUrl,licence:'CC BY 4.0',sourceHash,rows:table.rows.length,columns:table.headers.length,results:results.map(r=>({id:r.id,n:r.n,headers:r.headers,rows:r.rows,resultHash:r.resultHash}))},null,2));
console.log(JSON.stringify({output:outPath,rows:table.rows.length,columns:table.headers.length,slides:content.slides.length,subscriptionCount:yesCount,subscriptionRate:rate,sourceHash}));
