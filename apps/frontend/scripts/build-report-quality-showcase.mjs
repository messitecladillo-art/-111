/** Four-page direction sample. Uses product calculations, figure contracts and Office exporters. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import JSZip from 'jszip';
import {parseSurveyCsv} from '../lib/survey-analysis.ts';
import {createPlanNode, runPlanNode} from '../lib/analysis-plan.ts';
import {calculationReceipt} from '../lib/analysis-result-receipt.ts';
import {datasetIdentity} from '../lib/questionnaire-mapping.ts';
import {createEditorContent, parseEditorContent} from '../lib/editor-model.ts';
import {digestText, defaultFinding, snapshotRecipe, makeSlideObject, verifyResearchQuality} from '../lib/research-quality.ts';
import {figureFromResult, parseReportFigure, reportFigureSVG, projectPalette} from '../lib/report-figure.ts';
import {buildDocx, buildPptx} from '../lib/editor-export.ts';
import {bindReportSlideSources, reportFigureCoverage, reportLinkState} from '../lib/report-storyboard.ts';
import {getVectorAsset} from '../lib/vector-assets.ts';
import {assertTrueVector} from '../lib/vector-svg.ts';

const SOURCE_URL = 'https://archive.ics.uci.edu/dataset/222/bank%2Bmarketing';
const VERSION = 'report-quality-showcase/2026-10-17-v2';
const EXPECTED = {
  'bank.csv': {rows:4521, columns:17, subscribed:521, hash:'dc8d576e9bda0f41ee891251bd84bab9a39ce576cba715aac08adc2374a01fde'},
  'bank-additional.csv': {rows:4119, columns:21, subscribed:451, hash:'7e59cf650004d65d1c9d6b08553bad2ee9a9ad70d594f536e3c584ee6ed5df50'},
};
const pct = value => Number(value).toFixed(2);
const num = value => Number(value).toFixed(2);
const pText = value => value < .001 ? '< .001' : `= ${value.toFixed(3)}`;
const sha = value => createHash('sha256').update(value).digest('hex');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const renderSvg = async svg => new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
const OPTIONS = {part:'main',includeCover:false,includeToc:false,firstLineChars:2,numberPages:true};
const INK = '#263D4D', BLUE = '#255D87', MUTED = '#617582';

function argumentsOf(argv) {
  const args = {};
  for (let i=0;i<argv.length;i+=2) {
    if (!['--bank','--additional','--out'].includes(argv[i]) || !argv[i+1] || Object.hasOwn(args,argv[i])) throw Error('Use --bank <bank.csv> --additional <bank-additional.csv> --out <private directory>.');
    args[argv[i]]=path.resolve(argv[i+1]);
  }
  if (Object.keys(args).length!==3) throw Error('Both published CSV samples and an output directory are required. No data is downloaded.');
  return args;
}

function objectFactory(prefix) {
  let sequence=0;
  return (kind, patch) => makeSlideObject(kind,{id:`${prefix}-${String(++sequence).padStart(2,'0')}`,...patch});
}

function chrome(o,number,label,title) {
  return [
    o('shape',{x:4,y:7,width:1,height:10,color:BLUE}),
    o('text',{x:7,y:7,width:84,height:5,fontSize:14,text:`${String(number).padStart(2,'0')} / ${label}`,color:MUTED}),
    o('text',{x:7,y:14,width:87,height:12,fontSize:34,bold:true,text:title,color:INK}),
    o('shape',{x:4,y:93,width:87,height:.15,color:'#CFDBE3'}),
    o('text',{x:4,y:95,width:84,height:4,fontSize:12,text:'历史营销记录研究 · 来源与完整计算口径见讲稿和报告',color:MUTED}),
    o('text',{x:92,y:94.5,width:4,height:4,fontSize:14,text:String(number).padStart(2,'0'),color:BLUE,align:'right'}),
  ];
}

function figureObject(o,sectionId,figure,block,x,y,width,height,fontSize=18) {
  return o(figure.kind==='table'?'table':'chart',{x,y,width,height,fontSize,color:INK,evidenceId:figure.resultId,figureId:figure.id,valueColumn:block.valueColumn,sourceBlockId:block.id,sourceSectionId:sectionId});
}

function tableFigure(result,id,title,headers,rows,decimals=2) {
  return parseReportFigure({...figureFromResult(result,'table',1,id),title,table:{headers,rows},style:{decimals,showLabels:true,showGrid:false,showBorder:false}});
}

/** Persist only aggregated result rows, never the parsed CSV, raw projections or respondent identities. */
async function calculate(table,sourceHash,sourceName) {
  const col = name => {const index=table.headers.indexOf(name);assert(index>=0,`Missing column ${name}`);return index;};
  const definitions = [
    ['subscription','frequency','y',null,'这批记录的订阅结果如何分布？'],
    ['history','crosstab','poutcome','y','不同既往联络结果的订阅构成有何差异？'],
    ['age','groups','y','age','订阅与未订阅记录的年龄差异是否稳定？'],
    ['campaign','numeric','campaign',null,'本轮联络次数的中位数、上四分位数与极值是什么？'],
  ];
  const identity=await datasetIdentity(sourceHash,'utf-8',table),results=[],nodes=[];
  const sample={totalRows:table.rows.length,branchRows:table.rows.length,excludedRows:0,missingRows:0,filterColumn:null,values:[]};
  for (const [id,method,x,y,question] of definitions) {
    const node={...createPlanNode(method,id),x:col(x),y:y===null?null:col(y),question,branch:'全部公开记录'};
    const computed=runPlanNode(table,node,[]);
    computed.warnings=[...computed.warnings,'公开历史营销记录，以文件记录为分析单位，不作当前总体或因果外推。'];
    const receipt=calculationReceipt(node,table.headers,[],identity.interpretationHash,null,sample,computed.total,null,null);
    const result=await snapshotRecipe(computed,{title:question,sourceName,sourceUrl:SOURCE_URL,sourceHash,classification:'public'},id,receipt);
    assert.equal(result.n,table.rows.length,`${id} denominator`);
    assert.deepEqual(result.receipt.calculation.sample,{originalRows:table.rows.length,branchRows:table.rows.length,commonEligibleRows:table.rows.length,filterExcludedRows:0,filterMissingRows:0});
    results.push(result);nodes.push(node);
  }
  await verifyResearchQuality({version:1,results,findings:[]});
  return {results,nodes,interpretationHash:identity.interpretationHash};
}

async function assemble(fileName,sourcePath) {
  const raw=await fs.readFile(sourcePath,'utf8'),sourceHash=await digestText(raw),table=parseSurveyCsv(raw,';'),expected=EXPECTED[fileName];
  assert.equal(sourceHash,expected.hash,`${fileName}: this benchmark requires the recorded public sample bytes`);
  assert.equal(table.rows.length,expected.rows);assert.equal(table.headers.length,expected.columns);
  const additional=fileName==='bank-additional.csv',sourceName=`UCI ${fileName}`;
  const calculated=await calculate(table,sourceHash,sourceName),[subscription,history,age,campaign]=calculated.results;
  const yes=subscription.rows.find(row=>row[0]==='yes'),no=subscription.rows.find(row=>row[0]==='no');
  assert.equal(yes[1],expected.subscribed);assert.equal(yes[1]+no[1],table.rows.length);
  const categories=[...new Set(history.rows.map(row=>row[0]))];
  const short={unknown:'未记录',nonexistent:'无既往',failure:'未成功',success:'既往成功',other:'其他'};
  const long={...short,unknown:'未记录历史',nonexistent:'无既往联络'};
  const historical=categories.map(category=>{
    const rows=history.rows.filter(row=>row[0]===category),n=rows.reduce((sum,row)=>sum+row[2],0),subscribed=rows.find(row=>row[1]==='yes');
    assert(Math.abs(subscribed[3]-100*subscribed[2]/n)<1e-12,'Derived table must retain the registered row denominator.');
    return {code:category,label:short[category],n,subscribed:subscribed[2],rate:subscribed[3]};
  });
  const successful=historical.find(row=>row.code==='success'),baseline=historical.find(row=>row.code===(additional?'nonexistent':'unknown'));
  const gap=successful.rate-baseline.rate;
  const ay=age.rows.find(row=>row[0]==='yes'),an=age.rows.find(row=>row[0]==='no');
  const value=name=>campaign.rows.find(row=>row[0]===name)[1];
  const ageInference=age.receipt.inference,historyInference=history.receipt.inference;
  assert(ageInference?.primary.effect && ageInference.robustness[0]?.effect && historyInference?.primary.effect);

  const subscriptionFigure=parseReportFigure({...figureFromResult(subscription,'horizontal_bar',2,'subscription-chart'),title:'定期存款订阅结果',xLabel:'订阅结果',yLabel:'有效记录占比 (%)',labels:['未订阅','已订阅'],style:{decimals:2,showLabels:true,showGrid:true,showBorder:false},note:'分母为全部有效结果记录；原编码 no / yes。'});
  const historyFigure=parseReportFigure({...figureFromResult(history,'percent_stacked',3,'history-chart'),title:'既往联络结果与本轮订阅构成',labels:categories.map(code=>long[code]),series:figureFromResult(history,'percent_stacked',3,'temporary').series.map(series=>({...series,name:series.name==='yes'?'已订阅':'未订阅'})),style:{decimals:1,showLabels:true,showGrid:true,showBorder:false}});
  const historyTable=tableFigure(history,'history-table','不同历史状态的记录数与订阅比例',['组别','n','订阅数','占比%'],historical.map(row=>[row.label,row.n,row.subscribed,row.rate]),1);
  const ageTable=tableFigure(age,'age-table','订阅结果分组的年龄描述',['结果','n','均值','标准差','中位数','Q1','Q3'],age.rows.map(row=>[row[0]==='yes'?'已订阅':'未订阅',...row.slice(1)]),2);
  const campaignTable=tableFigure(campaign,'campaign-table','本轮联络次数的关键分位与极值',['指标','次数'],['中位数','Q3','最大值'].map(name=>[name==='Q3'?'上四分位':name,value(name)]),0);
  const figures=[subscriptionFigure,historyFigure,historyTable,ageTable,campaignTable];
  const block=(id,figure,text,column=1)=>({id,kind:figure.kind==='table'?'table':'chart',text,evidenceId:figure.resultId,valueColumn:column,figureId:figure.id});
  const blocks={subscription:block('fig-subscription',subscriptionFigure,'图1  定期存款订阅结果构成',2),history:block('fig-history',historyFigure,'图2  不同既往联络结果的本轮订阅构成',3),historyTable:block('tbl-history',historyTable,'表1  不同既往联络结果的订阅记录与行内比例',3),age:block('tbl-age',ageTable,'表2  两类订阅结果的年龄分布',2),campaign:block('tbl-campaign',campaignTable,'表3  本轮联络次数的分位数与最大值',1)};
  const n=table.rows.length.toLocaleString('zh-CN'),priorNote=additional?'pdays=999 表示此前未联络':'pdays=-1 表示此前未联络';
  const historyNext=additional?'无既往联络记录组使用首次联络脚本，并单独评价需求识别与首次订阅。':'未记录历史结果组先核查状态记录，再进入相应试点层。';
  const findings=[
    {...defaultFinding(subscription),id:'finding-structure',title:`${pct(yes[2])}% 的记录已订阅`,question:subscription.title,interpretation:`${n} 条记录中 ${yes[1]} 条已订阅，${no[1]} 条未订阅。评价触达效率，需要把结果与联络投入同时记录。`,alternatives:'产品需求、联络安排及样本构成可能共同影响观察比例。',scope:'这批历史营销记录的描述比例；不代表当前市场总体订阅率。',action:'以后续试点的新增订阅数、联络成本与停止规则共同评价。'},
    {...defaultFinding(history),id:'finding-history',title:'历史结果适合作为试点分层线索',question:history.title,interpretation:`既往成功组 ${successful.subscribed}/${successful.n}，订阅比例 ${pct(successful.rate)}%；${long[baseline.code]}组 ${baseline.subscribed}/${baseline.n}，比例 ${pct(baseline.rate)}%，相差 ${pct(gap)} 个百分点。`,alternatives:'此前客户筛选、未观测的产品需求和联络时机可能解释部分差异。',scope:'交叉构成与统计关联，不等于再次联络的增量效果或下一轮转化预测。',action:'按历史状态建立小规模分层对照，比较新增订阅与单位新增订阅成本。'},
    {...defaultFinding(age),id:'finding-synthesis',evidenceIds:['age','campaign'],title:'年龄差异需要与离散程度、投入一起解释',question:age.title,interpretation:`已订阅组均值 ${num(ay[2])} 岁、未订阅组 ${num(an[2])} 岁；Hedges g=${ageInference.primary.effect.value.toFixed(3)}。秩检验 p ${pText(ageInference.robustness[0].p)}。联络次数中位数 ${value('中位数')}、上四分位数 ${value('Q3')}、最大值 ${value('最大值')}。`,alternatives:'组内异质性、尾部年龄与客户需求可能共同影响均值；两项边际分析没有识别联合人群。',scope:'均值检验与秩检验关注不同问题，不能用均值差直接规定稳定画像；联络次数不是实际成本。',action:'年龄暂不作为硬性筛选条件；另记时间与金额，并预先设定停止追加联络规则。'},
  ];
  const report=[
    {id:'structure',title:'一、从订阅结构界定决策问题',body:`下一轮客户触达应先试哪一层，何时停止追加投入？本研究将问题拆为结果结构、历史差异、解释约束与行动评价四步。以 UCI Bank Marketing 的 ${fileName} 为输入，共 ${n} 条、${table.headers.length} 列。它是公开历史营销记录，本样板按文件记录分析，不是本团队的问卷或现场调查。\n${findings[0].interpretation} 比例的分母是结果变量有效的 ${n} 条记录，不是联络次数。固定频数程序还保留了比例区间；这些区间依赖抽样前提，本节不据其推断当前市场。\n处理保留全部记录，不加权、不插补；unknown 作为独立状态，${priorNote}。duration 在联络后才可知，不进入本样板的联络前决策。研究重点是形成可检验的试点，而不是将历史记录包装成转化预测。`,source:'UCI Bank Marketing，CC BY 4.0；完整来源、SHA-256、变量和有效样本链见随附 source-ledger.json。',blocks:[blocks.subscription]},
    {id:'comparison',title:'二、历史结果提示明显分层，但不解释增量',body:`${findings[1].interpretation} 图2突出各历史状态的内部构成，表1同时给出分母，避免把大组和小组的比例读成同等信息量。\n${historyInference.primary.line}。检验和效应量保存在原结果凭据中。这里能确认的是当前记录里的统计关联；${findings[1].alternatives}\n因此，既往成功状态值得成为优先试点层，但 ${pct(successful.rate)}% 不能直接作为下一轮预期转化率。${historyNext} 需要通过同层内的可比安排，判断多投入一次联络究竟带来多少新增订阅。`,source:'poutcome × y；行内比例分母为该历史状态的有效记录数。类别文字是原编码的展示字典，不重编码原始结果。',blocks:[blocks.history,blocks.historyTable]},
    {id:'synthesis',title:'三、综合解释：均值差异与联络投入分别约束行动',body:`表2中，已订阅组平均年龄 ${num(ay[2])} 岁，未订阅组 ${num(an[2])} 岁，相差 ${num(ay[2]-an[2])} 岁；组内标准差分别为 ${num(ay[3])} 与 ${num(an[3])} 岁。${ageInference.primary.line}。${ageInference.robustness[0].line}。\n两种检验关注的分布问题不同：均值差有信号，秩位置的信号较弱，且标准化均值差较小。暂不把年龄变成硬性筛选条件，更适合作为试点监测与需求访谈的背景变量。\n表3显示，联络次数中位数为 ${value('中位数')}，上四分位数为 ${value('Q3')}，最大值为 ${value('最大值')}。少数高次数记录值得核查，但当前记录不能说明追加联络带来增量。年龄与联络次数在本节分别分析，不能据此拼出未经联合分析的人群。实际时间、金额和新增结果要在下一轮同步采集。`,source:'年龄：按 y 分组的完整有效数值；次数：campaign 的有效数值。分位数和描述统计沿用产品计算，未引入外部统计程序。',blocks:[blocks.age,blocks.campaign]},
    {id:'action',title:'四、行动建议：先验证分层，再扩大投入',body:`第一步，由客户运营按既往联络状态登记试点层，写明目标、可比安排与评价周期。研究团队核对原始状态口径，${historyNext}\n第二步，在资源允许的情况下，同层内采用可比的随机安排；如无法随机，则记录分配规则与可观测差异，不把组间比较当成因果效果。每层报告新增订阅数、有效触达数、实际时间与金额，计算单位新增订阅成本。年龄用于监测分布，不作为排除条件。\n第三步，在试点前确定最低可接受收益、成本与停止规则，按执行记录复核后决定继续、调整或停止。这里尚无成本金额、预算或试验结果，不给出未经验证的收益承诺。\n这条行动链分别承接图1的结果结构、图2与表1的历史差异、表2与表3的解释边界。报告保留论据与替代解释，PPT突出决定、关键对照与执行路径，两者共享相同结果版本。`,source:'拟议试点方案，尚未执行；依据为本文已登记的公开历史结果。结构与页数用于方向审阅，不是赛事硬性模板。',blocks:[]},
  ];
  let content={...createEditorContent(),version:3,title:'从客户差异到分层触达试点',subtitle:`公开历史营销记录研究 · ${fileName}`,accent:'blue',visualStyle:{schema:'ProjectVisualStyle/v1',paletteId:'blue',version:1},figures,quality:{version:1,results:calculated.results,findings},report,slides:[]};
  const baseNotes=`数据：${sourceName}\n来源：${SOURCE_URL}\nSHA-256：${sourceHash}\n输入 ${table.rows.length} 条，${table.headers.length} 列；无筛选、无插补、不加权。\n公开历史数据不作当前总体或因果外推。建议是未执行的试点方案。`;
  const slides=[];
  {
    const o=objectFactory('s1'),objects=chrome(o,1,'结果结构','先看结构，再讨论触达效率');
    objects.push(o('text',{x:7,y:32,width:35,height:16,fontSize:64,bold:true,text:`${pct(yes[2])}%`,color:BLUE}),o('text',{x:7,y:49,width:33,height:7,fontSize:21,text:'记录已订阅定期存款',color:INK}),o('text',{x:7,y:59,width:33,height:6,fontSize:20,text:`${yes[1]} / ${n} 条有效记录`,color:INK}),o('text',{x:7,y:71,width:32,height:16,fontSize:21,text:'结果与投入一起看，\n才能讨论下一轮效率。',color:MUTED}),o('text',{x:45,y:27,width:49,height:6,fontSize:20,bold:true,text:'订阅结果构成',color:INK}),figureObject(o,'structure',subscriptionFigure,blocks.subscription,44,35,51,48),o('vector',{x:88,y:82,width:8,height:9,assetId:'mosaic-edge',color:BLUE,opacity:.2}));
    slides.push({id:'core-finding',title:'先看结构，再讨论触达效率',body:findings[0].interpretation,aside:'',notes:`${baseNotes}\n依据：subscription。${findings[0].scope}\n本页大数字是观察比例，不是下一轮预测。`,layout:'chart',objects});
  }
  {
    const o=objectFactory('s2'),objects=chrome(o,2,'组间比较','历史结果，是值得验证的分层线索');
    objects.push(o('text',{x:5,y:27,width:55,height:6,fontSize:20,bold:true,text:'各历史状态的本轮订阅构成',color:INK}),figureObject(o,'comparison',historyFigure,blocks.history,4,35,55,49),o('text',{x:63,y:27,width:33,height:6,fontSize:18,bold:true,text:'同时保留组内分母',color:INK}),figureObject(o,'comparison',historyTable,blocks.historyTable,63,36,33,34,16),o('text',{x:63,y:73,width:32,height:17,fontSize:20,text:`既往成功组 ${pct(successful.rate)}%\n${long[baseline.code]}组 ${pct(baseline.rate)}%\n观察差：${pct(gap)} 个百分点`,color:BLUE}));
    slides.push({id:'group-comparison',title:'历史结果，是值得验证的分层线索',body:findings[1].interpretation,aside:'',notes:`${baseNotes}\n依据：history。${historyInference.primary.line}\n${findings[1].alternatives}\n${findings[1].scope}\n各组 n 和订阅数采用原始交叉频数，百分比以每组为分母。`,layout:'comparison',objects});
  }
  {
    const o=objectFactory('s3'),objects=chrome(o,3,'综合洞察','均值有差异，不等于稳定的人群画像');
    objects.push(o('text',{x:5,y:27,width:90,height:6,fontSize:20,bold:true,text:'年龄：差异要结合组内分布阅读',color:INK}),figureObject(o,'synthesis',ageTable,blocks.age,5,35,90,22,18),o('text',{x:5,y:61,width:40,height:6,fontSize:18,bold:true,text:'联络次数：另记真实投入',color:INK}),figureObject(o,'synthesis',campaignTable,blocks.campaign,5,69,40,22,16),o('shape',{x:51,y:61,width:.3,height:27,color:'#A0C8D7'}),o('text',{x:55,y:61,width:40,height:28,fontSize:19,text:`Hedges g（未订阅－已订阅）=${ageInference.primary.effect.value.toFixed(3)}\nWelch p ${pText(ageInference.primary.p)}；秩检验 p ${pText(ageInference.robustness[0].p)}\n\n年龄暂不作为硬性筛选条件。\n次数是投入线索，还需记录时间与金额。`,color:INK}));
    slides.push({id:'composite-insight',title:'均值有差异，不等于稳定的人群画像',body:findings[2].interpretation,aside:'',notes:`${baseNotes}\n依据：age、campaign，两个不同结果 ID。\n${ageInference.primary.line}\n${ageInference.robustness[0].line}\n两种检验关注不同分布问题，标准化效应较小。两项边际分析没有识别联合人群。次数不是货币成本。`,layout:'insight',objects});
  }
  {
    const o=objectFactory('s4'),objects=chrome(o,4,'行动建议','先验证分层，再扩大投入');
    const steps=[
      {x:7,no:'01',title:'登记试点层',body:`客户运营 × 研究团队\n\n按既往状态分层。\n${additional?'无既往组另设首次联络脚本。':'未记录组先核查历史状态。'}\n年龄用于分布监测。`},
      {x:38,no:'02',title:'形成可比安排',body:'同层内比较\n\n条件允许时随机安排。\n记录新增订阅、触达与成本。\n不能随机时保留分配依据。'},
      {x:69,no:'03',title:'按规则决策',body:'运营负责人复核\n\n提前约定收益与停止规则。\n根据实际结果决定\n继续、调整或停止。'},
    ];
    for (const step of steps) objects.push(o('text',{x:step.x,y:32,width:25,height:11,fontSize:44,bold:true,text:step.no,color:'#A0C8D7'}),o('text',{x:step.x,y:47,width:26,height:8,fontSize:25,bold:true,text:step.title,color:BLUE}),o('text',{x:step.x,y:59,width:26,height:29,fontSize:18,text:step.body,color:INK}));
    objects.push(o('shape',{x:29,y:39,width:7,height:.2,color:'#A0C8D7'}),o('shape',{x:60,y:39,width:7,height:.2,color:'#A0C8D7'}));
    slides.push({id:'action-plan',title:'先验证分层，再扩大投入',body:report[3].body,aside:'',notes:`${baseNotes}\n建议尚未执行。依据：subscription、history、age、campaign。\n承接图1的结果结构、图2和表1的历史分层、表2与表3的解释约束。\n目前没有真实预算、成本金额或试验结果，因此不填写虚构收益、样本量或时间表。`,layout:'action',objects});
  }
  content.slides=slides;
  const refs=[
    [{sectionId:'structure',blockIds:[blocks.subscription.id]}],
    [{sectionId:'comparison',blockIds:[blocks.history.id,blocks.historyTable.id]}],
    [{sectionId:'synthesis',blockIds:[blocks.age.id,blocks.campaign.id]}],
    [{sectionId:'action',blockIds:[]},{sectionId:'structure',blockIds:[]},{sectionId:'comparison',blockIds:[]},{sectionId:'synthesis',blockIds:[]}],
  ];
  for (let i=0;i<slides.length;i++) content.slides[i]=await bindReportSlideSources(content,slides[i],refs[i]);
  content=parseEditorContent(content);await verifyResearchQuality(content.quality);
  for(const slide of content.slides)for(const object of slide.objects.filter(o=>o.figureId)) {
    const owner=content.report.find(section=>section.id===object.sourceSectionId);
    assert(owner?.blocks?.some(block=>block.id===object.sourceBlockId&&block.figureId===object.figureId&&block.evidenceId===object.evidenceId),'Every shared figure object must retain its real owning chapter.');
  }
  const coverage=await reportFigureCoverage(content);
  assert.equal(coverage.length,figures.length);assert(coverage.every(item=>item.state==='current'&&item.pages.length));
  for (const slide of content.slides) assert.equal(await reportLinkState(content,slide),'current');
  assert(content.slides[2].objects.filter(o=>o.figureId).map(o=>o.evidenceId).includes('campaign'));
  assert.equal(new Set(content.slides[2].objects.filter(o=>o.figureId).map(o=>o.evidenceId)).size,2);
  assert.equal(content.reportFrame,undefined,'No frame is approved by automatic sample generation.');
  assert(content.quality.findings.every(f=>f.status==='draft'&&Object.keys(f.confirmedHashes).length===0));
  const persisted=JSON.stringify(content);
  for (const key of ['"rawRows"','"respondentId"','"distributions"','"pairs"','"outliers"']) assert(!persisted.includes(key),`Raw projections may not persist: ${key}`);
  const ledger={schema:VERSION,source:{fileName,sourceUrl:SOURCE_URL,licence:'CC BY 4.0',sourceHash,rows:table.rows.length,columns:table.headers.length,unit:'file record'},processing:{engine:'analysis-plan/v1',missingCodes:[],filter:null,weighted:false,imputation:false,duplicateRemoval:false,unknown:'retained category',priorDayNote:priorNote,duration:'post-contact; excluded from pre-contact decisions'},interpretationHash:calculated.interpretationHash,nodes:calculated.nodes,results:content.quality.results.map(r=>({id:r.id,method:r.method,n:r.n,total:r.total,resultHash:r.resultHash,receipt:r.receipt})),review:{humanApproval:'not requested',findings:'draft proposals',frame:'not applied',nativeApplicationRendering:'pending root review'}};
  return {content,coverage,ledger,expected};
}

function wrap(text,maxWeight) {
  const lines=[];
  for(const explicit of text.split('\n')) {
    let line='',weight=0;
    for(const char of explicit) {const next=/[\u3000-\uffff]/.test(char)?1:.55;if(weight+next>maxWeight&&line){lines.push(line);line='';weight=0;}line+=char;weight+=next;}
    lines.push(line);
  }
  return lines;
}

/** Inspectable review only; native Office/PDF rendering remains the acceptance reference. */
function slideReviewSVG(content,slide) {
  const pieces=['<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#FFFFFF"/>'];
  const embed=(svg,x,y,w,h,originalWidth,originalHeight,opacity=1)=>`<g transform="translate(${x} ${y}) scale(${w/originalWidth} ${h/originalHeight})" opacity="${opacity}">${svg.replace(/^<svg\b[^>]*>/,'').replace(/<\/svg>\s*$/,'')}</g>`;
  for(const object of slide.objects) {
    const x=object.x*16,y=object.y*9,w=object.width*16,h=object.height*9,fs=object.fontSize*1600/(13.333333*72);
    if(object.kind==='text') {
      const anchor=object.align==='center'?'middle':object.align==='right'?'end':'start',tx=x+(object.align==='center'?w/2:object.align==='right'?w:0);
      const lines=wrap(object.text,w/fs);pieces.push(`<text x="${tx}" y="${y+fs}" font-family="Microsoft YaHei,sans-serif" font-size="${fs}" fill="${object.color}" font-weight="${object.bold?'700':'400'}" text-anchor="${anchor}" opacity="${object.opacity}">${lines.map((line,i)=>`<tspan x="${tx}" dy="${i?fs*1.22:0}">${escape(line)||' '}</tspan>`).join('')}</text>`);
    } else if(object.kind==='shape') pieces.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${object.color}" opacity="${object.opacity}"/>`);
    else if(object.kind==='vector') pieces.push(embed(getVectorAsset(object.assetId,object.color),x,y,w,h,320,240,object.opacity));
    else {
      const f=content.figures.find(f=>f.id===object.figureId);
      if(f.kind==='table') {
        const rows=[f.table.headers,...f.table.rows],rh=fs*1.45,cw=w/f.table.headers.length;
        const line=(yy,weight)=>pieces.push(`<line x1="${x}" y1="${yy}" x2="${x+w}" y2="${yy}" stroke="#000000" stroke-width="${weight*1600/(13.333333*72)}"/>`);
        line(y,1.5);line(y+rh,.75);line(y+rows.length*rh,1.5);
        rows.forEach((row,i)=>row.forEach((v,j)=>pieces.push(`<text x="${x+(j+.5)*cw}" y="${y+(i+.72)*rh}" font-family="Microsoft YaHei,sans-serif" font-size="${fs}" text-anchor="middle" fill="${INK}" font-weight="${i===0?'700':'400'}">${escape(typeof v==='number'?String(Number(v.toFixed(f.style.decimals))):v??'—')}</text>`)));
      } else pieces.push(embed(reportFigureSVG(f,content.visualStyle),x,y,w,h-48,1000,700));
      const result=content.quality.results.find(r=>r.id===f.resultId);
      pieces.push(`<text x="${x}" y="${y+h-8}" font-family="Microsoft YaHei,sans-serif" font-size="21.67" fill="${MUTED}">n=${result.n} / ${result.total} · ${escape(result.sourceName)}</text>`);
    }
  }
  return assertTrueVector(pieces.join('')+'</svg>');
}

function numbersInChart(xml) {
  return [...xml.matchAll(/<c:numCache>[\s\S]*?<\/c:numCache>/g)].flatMap(match=>[...match[0].matchAll(/<c:v>([^<]+)<\/c:v>/g)].map(v=>Number(v[1])));
}

async function verifyPackages(content,docxBytes,pptxBytes) {
  const docx=await JSZip.loadAsync(docxBytes),pptx=await JSZip.loadAsync(pptxBytes);
  const names=Object.keys(pptx.files),slides=names.filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name)),charts=names.filter(name=>/^ppt\/charts\/chart\d+\.xml$/.test(name)),embeddings=names.filter(name=>/^ppt\/embeddings\/.*\.xlsx$/.test(name));
  assert.equal(slides.length,4);assert.equal(charts.length,2);assert.equal(embeddings.length,2);
  assert.equal(names.filter(name=>/^ppt\/media\/.+/.test(name)&&!pptx.files[name].dir).length,0,'The four slides must use native vectors, charts, tables and text, not images.');
  const slideXml=await Promise.all(slides.map(name=>pptx.file(name).async('string'))),chartXml=await Promise.all(charts.map(name=>pptx.file(name).async('string')));
  assert.equal(slideXml.reduce((n,xml)=>n+(xml.match(/<a:tbl>/g)?.length??0),0),3);
  const expectedSeries=[content.figures[0].series[0].values,...content.figures[1].series.map(s=>s.values.map((v,i)=>100*v/content.figures[1].series.reduce((sum,item)=>sum+item.values[i],0)))].flat();
  const actualSeries=chartXml.flatMap(numbersInChart);
  assert.equal(actualSeries.length,expectedSeries.length);
  expectedSeries.forEach((value,i)=>assert(Math.abs(value-actualSeries[i])<1e-10,`Native chart cache differs at ${i}`));
  for(const color of [projectPalette(content.visualStyle).colors[0],projectPalette(content.visualStyle).colors[1]]) assert(chartXml.some(xml=>xml.includes(color.slice(1))),`Project palette missing ${color}`);
  assert(slideXml.every(xml=>xml.includes('Microsoft YaHei')));
  for(const xml of slideXml.filter(xml=>xml.includes('<a:tbl>'))) {
    for(const table of xml.matchAll(/<a:tbl>[\s\S]*?<\/a:tbl>/g)) {
      const rows=[...table[0].matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)];
      assert(rows[0][0].includes('w="19050"')&&rows[0][0].includes('w="9525"'),'PPT table first/second line widths');
      assert(rows.at(-1)[0].includes('w="19050"'),'PPT table final line width');
      assert(![...table[0].matchAll(/<a:pPr\b[^>]*>/g)].some(m=>!m[0].includes('algn="ctr"')),'Every PPT table column must be centered.');
    }
  }
  const wordXml=await docx.file('word/document.xml').async('string'),wordTables=[...wordXml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)];
  assert.equal(wordTables.length,3);
  for(const table of wordTables) {
    const rows=[...table[0].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
    assert(rows[0][0].includes('w:sz="12"')&&rows[0][0].includes('w:sz="6"'),'Word table first/second lines 1.5/.75 pt');
    assert(rows.at(-1)[0].includes('w:sz="12"'),'Word table final line 1.5 pt');
    assert(![...table[0].matchAll(/<w:jc\b[^>]*\/>/g)].some(m=>!m[0].includes('w:val="center"')),'Every Word table column must be centered.');
  }
  const svgNames=Object.keys(docx.files).filter(name=>/^word\/media\/.*\.svg$/.test(name));assert.equal(svgNames.length,2);
  for(const name of svgNames) assertTrueVector(await docx.file(name).async('string'));
  assert(!wordXml.includes('EVI-X')&&!slideXml.some(xml=>xml.includes('EVI-X')),'Neutral outputs');
  return {checks:'passed',pptx:{slides:slides.length,nativeCharts:charts.length,editableWorkbooks:embeddings.length,nativeTables:3,rasterMedia:0},docx:{nativeTables:wordTables.length,authoritativeSvg:svgNames.length},tableRules:'top 1.5 pt / header bottom .75 pt / final 1.5 pt; all columns centered',limits:['Package and SVG review checks do not prove PowerPoint/WPS/Word save-reopen or native PDF vector retention.','SVG review uses the product figure renderer; native chart and table Office rendering must be checked separately.']};
}

async function verifyVersionAndDecodeGuards(content) {
  assert.deepEqual(parseEditorContent(JSON.parse(JSON.stringify(content))),content,'JSON save/reopen must retain exact values and references.');
  const invalidFigure=structuredClone(content);invalidFigure.figures[0].series[0].values[0]=Infinity;
  assert.throws(()=>parseEditorContent(invalidFigure),'Non-finite numbers must fail decoding.');
  const rawLeak=structuredClone(content);rawLeak.figures[0].rawRows=[['private respondent']];
  assert.throws(()=>parseEditorContent(rawLeak),'A figure cannot persist arbitrary raw records.');
  const absentFigure=structuredClone(content);absentFigure.slides[0].objects.find(o=>o.figureId).figureId='missing-figure';
  assert.throws(()=>parseEditorContent(absentFigure),'Missing references cannot silently export.');
  const alteredResult=structuredClone(content);alteredResult.quality.results[0].rows[0][1]++;
  await assert.rejects(()=>verifyResearchQuality(alteredResult.quality),'A result mutation must fail the registered hash.');
  const alteredFigure=structuredClone(content);alteredFigure.figures[0].series[0].values[0]++;
  assert.equal(await reportLinkState(alteredFigure,alteredFigure.slides[0]),'report_changed','A figure change must mark the associated slide stale.');
  const alteredPalette=structuredClone(content);alteredPalette.visualStyle.version++;
  assert.equal(await reportLinkState(alteredPalette,alteredPalette.slides[2]),'report_changed','A style version change must mark shared visuals stale.');
  const modifiedSlide=structuredClone(content);modifiedSlide.slides[0].objects[0].color='#000000';
  assert.equal(await reportLinkState(modifiedSlide,modifiedSlide.slides[0]),'slide_changed');
  const composite=content.slides[2].objects.filter(o=>o.figureId);
  assert.equal(new Set(composite.map(o=>o.evidenceId)).size,2,'The composite page must retain both independent evidence references.');
  return {checks:'passed',cases:['exact JSON roundtrip','non-finite figure rejection','raw-field rejection','missing-figure rejection','result-hash mutation rejection','figure drift','palette-version drift','slide drift','multi-evidence references']};
}

async function saveSample(fileName,sourcePath,outRoot) {
  const {content,coverage,ledger}=await assemble(fileName,sourcePath),out=path.join(outRoot,fileName.replace('.csv',''));
  await fs.mkdir(path.join(out,'figures'),{recursive:true});await fs.mkdir(path.join(out,'slides'),{recursive:true});
  const docxBytes=Buffer.from(await (await buildDocx(content,OPTIONS,renderSvg)).arrayBuffer()),pptxBytes=Buffer.from(await (await buildPptx(content,renderSvg)).arrayBuffer());
  const packageChecks=await verifyPackages(content,docxBytes,pptxBytes),guardChecks=await verifyVersionAndDecodeGuards(content);
  const files={'content.json':JSON.stringify(content,null,2),'source-ledger.json':JSON.stringify(ledger,null,2),'coverage.json':JSON.stringify({figureCoverage:coverage,pageSources:content.slides.map(slide=>({id:slide.id,reportLink:slide.reportLink})),humanApproval:'not requested'},null,2),'package-checks.json':JSON.stringify(packageChecks,null,2),'version-checks.json':JSON.stringify(guardChecks,null,2),'four-page-direction.pptx':pptxBytes,'representative-report.docx':docxBytes};
  for(const [name,bytes] of Object.entries(files)) await fs.writeFile(path.join(out,name),bytes);
  for(const figure of content.figures) await fs.writeFile(path.join(out,'figures',figure.id+'.svg'),reportFigureSVG(figure,content.visualStyle));
  for(const [index,slide] of content.slides.entries()) {
    const svg=slideReviewSVG(content,slide),base=String(index+1).padStart(2,'0')+'-'+slide.id;
    await fs.writeFile(path.join(out,'slides',base+'.svg'),svg);
    await fs.writeFile(path.join(out,'slides',base+'.png'),await sharp(Buffer.from(svg)).png().toBuffer());
  }
  const thumbWidth=800,thumbHeight=450,contactSheet=await sharp({create:{width:1600,height:900,channels:3,background:'#FFFFFF'}}).composite(await Promise.all(content.slides.map(async(slide,i)=>({input:await sharp(path.join(out,'slides',String(i+1).padStart(2,'0')+'-'+slide.id+'.png')).resize(thumbWidth,thumbHeight).toBuffer(),left:(i%2)*thumbWidth,top:Math.floor(i/2)*thumbHeight})))).png().toBuffer();
  await fs.writeFile(path.join(out,'contact-sheet.png'),contactSheet);
  const manifest=[];
  for(const [name,bytes] of Object.entries(files)) manifest.push({path:name,sha256:sha(bytes),bytes:Buffer.byteLength(bytes)});
  await fs.writeFile(path.join(out,'artifact-manifest.json'),JSON.stringify({schema:VERSION,files:manifest},null,2));
  return {dataset:fileName,output:out,sourceHash:ledger.source.sourceHash,rows:ledger.source.rows,slides:4,reportSections:4,sharedFigures:content.figures.length,coverage:coverage.every(item=>item.state==='current')?'all current':'review',packageChecks:packageChecks.checks};
}

const args=argumentsOf(process.argv.slice(2));
const summaries=[];
summaries.push(await saveSample('bank.csv',args['--bank'],args['--out']));
summaries.push(await saveSample('bank-additional.csv',args['--additional'],args['--out']));
await fs.writeFile(path.join(args['--out'],'showcase-summary.json'),JSON.stringify({schema:VERSION,samples:summaries,humanReview:'pending; no frame or research proposal has been approved'},null,2));
console.log(JSON.stringify({status:'data-and-code-ready',samples:summaries}));
