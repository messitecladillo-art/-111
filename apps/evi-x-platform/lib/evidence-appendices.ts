import {EDITOR_LIMITS,parseEditorContent,type EditorContent,type ReportSection} from './editor-model.ts';
import {digestText,findingNeedsReview,findingSignature,verifyResearchQuality,type ResearchFinding,type ResultSnapshot} from './research-quality.ts';
import {reportLinkState} from './report-storyboard.ts';

export type AppendixKind='data'|'ai'|'claims';
export const APPENDIX_LABELS:Record<AppendixKind,string>={data:'数据来源与计算记录',ai:'AI 使用记录',claims:'主张与证据对照'};
export const APPENDIX_BODY_LIMIT=11900;
const hashPattern=/^[a-f0-9]{64}$/;
const purposes={planning:'研究规划',questionnaire:'问卷提案','analysis-explanation':'分析解释','report-draft':'报告草稿','slide-draft':'幻灯片草稿','visual-concept':'视觉概念',other:'其他'};
export type AiUsageRecord={
  id:string;provider:'openai'|'deepseek'|'qwen'|'anthropic'|'compatible'|'other'|null;model:string|null;purpose:keyof typeof purposes;
  status:'queued'|'running'|'succeeded'|'failed'|'cancelled'|'unknown';
  requestedAt:string|null;finishedAt:string|null;inputHash:string|null;outputHash:string|null;
  usage:{inputTokens:number|null;outputTokens:number|null;cost:number|null;currency:'USD'|'CNY'|null};
};
/** Caller-supplied normalized receipts. No adapter currently establishes complete project coverage. */
export type AiUsageLedger={schema:'AiUsageLedger/v1';coverage:'unavailable'|'partial';projectId:string|null;scope?:'own-questionnaire-proposals/latest-200';records:AiUsageRecord[]};
export type AppendixCoverage={resultCount:number;legacyReceiptCount:number;findingCount:number;ai:'unavailable'|'partial';aiRecords:number;aiScope?:AiUsageLedger['scope']};
export type EvidenceAppendixProposal={schema:'EvidenceAppendixProposal/v1';base:string;baseHash:string;sections:ReportSection[];groups:Record<AppendixKind,string[]>;coverage:AppendixCoverage};
type ReferenceLocation={kind:'report'|'slide'|'figure';id:string;label:string;contentHash:string;relation:'finding'|'evidence';state:'current'|'review'|'unlinked'|'hidden'};
export type DefenseEvidenceReference={
  schema:'DefenseEvidenceReference/v1';findingId:string;findingHash:string;title:string;question:string;interpretation:string;scope:string;
  status:'confirmed'|'needs_review';evidence:{id:string;title:string;resultHash:string;sourceHash:string;classification:ResultSnapshot['classification'];n:number;total:number}[];
  locations:ReferenceLocation[];referenceHash:string;
};
function invalid():never{throw Error('AI 使用记录结构无效；仅接收脱敏的调用凭据，不接收密钥、提示词或答卷内容。');}
function record(value:unknown,keys:string[],optional:string[]=[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return invalid();
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(keys.some(k=>!Object.hasOwn(value,k))||Reflect.ownKeys(value).some(k=>typeof k!=='string'||![...keys,...optional].includes(k)||!('value' in descriptors[k])||!descriptors[k].enumerable))return invalid();
  return value as Record<string,unknown>;
}
function token(value:unknown,max:number):string{
  if(typeof value!=='string'||!value.length||value.length>max||!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)||/(?:sk-|tvly-|bearer|api[_-]?key|secret|password)/i.test(value))return invalid();return value;
}
function choice<T extends string>(value:unknown,values:readonly T[]):T{if(!values.includes(value as T))return invalid();return value as T;}
function nullableHash(value:unknown):string|null{if(value===null)return null;if(typeof value!=='string'||!hashPattern.test(value))return invalid();return value;}
function nullableNumber(value:unknown,max:number,integer=false):number|null{if(value===null)return null;if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max||(integer&&!Number.isSafeInteger(value)))return invalid();return value;}
function timestamp(value:unknown):string|null{
  if(value===null)return null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))return invalid();
  if(new Date(value).toISOString().slice(0,19)!==value.slice(0,19))return invalid();return value;
}
export function parseAiUsageLedger(value:unknown,projectId?:string):AiUsageLedger{
  if(value===undefined)return {schema:'AiUsageLedger/v1',coverage:'unavailable',projectId:projectId??null,records:[]};
  const x=record(value,['schema','coverage','projectId','records'],['scope']);if(x.schema!=='AiUsageLedger/v1')return invalid();
  const coverage=choice(x.coverage,['unavailable','partial'] as const),bound=x.projectId===null?null:token(x.projectId,80);
  const scope=Object.hasOwn(x,'scope')?choice(x.scope,['own-questionnaire-proposals/latest-200'] as const):undefined;
  if(scope&&coverage!=='partial')return invalid();
  if((coverage==='partial'&&(!projectId||bound!==projectId))||(projectId&&bound!==projectId)||!Array.isArray(x.records)||x.records.length>200)return invalid();
  const records=x.records.map(v=>{
    const r=record(v,['id','provider','model','purpose','status','requestedAt','finishedAt','inputHash','outputHash','usage']);
    const requestedAt=timestamp(r.requestedAt),finishedAt=timestamp(r.finishedAt);
    if(requestedAt&&finishedAt&&Date.parse(finishedAt)<Date.parse(requestedAt))return invalid();
    const u=record(r.usage,['inputTokens','outputTokens','cost','currency']),cost=nullableNumber(u.cost,1e8),currency=u.currency===null?null:choice(u.currency,['USD','CNY'] as const);
    if(cost!==null&&currency===null)return invalid();
    return {id:token(r.id,100),provider:r.provider===null?null:choice(r.provider,['openai','deepseek','qwen','anthropic','compatible','other'] as const),model:r.model===null?null:token(r.model,120),purpose:choice(r.purpose,Object.keys(purposes) as (keyof typeof purposes)[]),status:choice(r.status,['queued','running','succeeded','failed','cancelled','unknown'] as const),requestedAt,finishedAt,inputHash:nullableHash(r.inputHash),outputHash:nullableHash(r.outputHash),usage:{inputTokens:nullableNumber(u.inputTokens,1e10,true),outputTokens:nullableNumber(u.outputTokens,1e10,true),cost,currency}};
  });
  if(new Set(records.map(r=>r.id)).size!==records.length||(coverage==='unavailable'&&records.length)||(scope&&records.some(r=>r.purpose!=='questionnaire')))return invalid();
  return {schema:'AiUsageLedger/v1',coverage,projectId:bound,...(scope?{scope}:{}),records};
}
const classification={public:'公开数据',user_provided:'用户提供数据',simulated:'合成／模拟数据'};
const basis={'effective-sample':'有效分析样本','row-total':'各行合计','none':'不计算比例'};
const value=(v:number|null|undefined)=>v===null||v===undefined?'未提供／未定义':String(v);
function dataRecord(r:ResultSnapshot):string{
  const lines=[`结果：${r.title}（${r.id}）`,`数据类别：${classification[r.classification]}`,`登记来源：${r.sourceName}`,`来源链接：${r.sourceUrl||'未登记'}`,`数据来源 SHA-256：${r.sourceHash}`,`分析结果 SHA-256：${r.resultHash}`,`方法：${r.method}；有效样本 n=${r.n}；进入计算的记录=${r.total}。`];
  const receipt=r.receipt;
  if(!receipt)lines.push('历史结果未登记计算凭据：具体剔除原因、参数及上游分母链不可追溯；不补写处理过程。');
  else{
    const s=receipt.sample;
    lines.push(`计算口径：${receipt.interpretation}`,`计算 ${s.calculationRows} → 有效 ${s.analysisRows}；剔除 ${s.excludedRows}。`,`原因计数：缺失 ${s.missingRows}；无效 ${s.invalidRows}；超量程 ${value(s.outOfRangeRows)}。原因可能重叠，不相加为剔除总量。`,`百分比分母：${basis[receipt.percentageBasis]}。`);
    const c=receipt.calculation;
    if(!c)lines.push('上游筛选、变量配置和映射版本未登记。');
    else{
      lines.push(`计算引擎：${c.engine}；算法版本：${c.algorithmVersion}。`,`分母链：原始 ${c.sample.originalRows} → 筛选分支 ${c.sample.branchRows} → 共同可应答 ${c.sample.commonEligibleRows} → 有效分析 ${s.analysisRows}。`,`筛选排除 ${c.sample.filterExcludedRows}；筛选变量缺失 ${c.sample.filterMissingRows}。`,`变量：${c.variables.map(v=>`${v.name}（列 ${v.column+1}）`).join('、')}。`,`约定缺失编码：${c.missingCodes.length?c.missingCodes.map(v=>JSON.stringify(v)).join('、'):'未指定额外编码'}。`,`筛选条件：${c.filter?`第 ${c.filter.column+1} 列 ∈ ${JSON.stringify(c.filter.values)}`:'无'}。`,`解释配置 SHA-256：${c.interpretationHash}`);
      if(c.scale)lines.push(`量表：${c.scale.construct}；题目列 ${c.scale.columns.map(i=>i+1).join('、')}；反向列 ${c.scale.reverse.map(i=>i+1).join('、')||'无'}；范围 ${c.scale.min}–${c.scale.max}。`);
      lines.push(c.mapping?`问卷 SHA-256：${c.mapping.questionnaireHash}\n映射 SHA-256：${c.mapping.mappingHash}`:'问卷与变量映射版本未登记。');
      for(const [role,routing] of Object.entries(c.routing))if(routing)lines.push(`路由口径（${role}，${routing.policy}）：总 ${routing.totalRows}，可应答 ${routing.eligibleRows}，分支外 ${routing.ineligibleRows}，未知 ${routing.unknownRows}，矛盾 ${routing.contradictionRows}。`);
    }
    if(receipt.inference){const i=receipt.inference;for(const test of [i.primary,...i.robustness])lines.push(`已保存推断：${test.name}；${test.line}；p=${value(test.p)}${test.effect?`；${test.effect.name}=${value(test.effect.value)}${test.effect.interval?`，区间 [${test.effect.interval.lower}, ${test.effect.interval.upper}]`:''}`:''}。`);for(const pair of i.comparisons??[])lines.push(`已保存比较：${pair.a} / ${pair.b}；差 ${pair.difference}；t=${pair.t}；df=${pair.df}；p=${pair.p}；校正 p=${pair.adjusted}。`);for(const note of i.notes)lines.push(`推断说明：${note}`);}
  }
  for(const warning of r.warnings)lines.push(`结果说明：${warning}`);
  return lines.join('\n');
}
function aiRecord(r:AiUsageRecord):string{
  const states={queued:'排队',running:'运行中',succeeded:'收到成功回执',failed:'收到失败回执',cancelled:'已取消',unknown:'调用结果未知，待对账'};
  return [`调用 ${r.id}：${purposes[r.purpose]}`,`供应商 ${r.provider??'未登记'}；模型 ${r.model??'未登记'}；状态：${states[r.status]}。`,`请求时间：${r.requestedAt??'未登记'}；结束时间：${r.finishedAt??'未登记'}。`,`输入内容指纹：${r.inputHash??'未登记'}；输出内容指纹：${r.outputHash??'未登记'}。`,`实际回执用量：输入 ${value(r.usage.inputTokens)} tokens；输出 ${value(r.usage.outputTokens)} tokens；费用 ${value(r.usage.cost)}${r.usage.currency?` ${r.usage.currency}`:''}。`,...(r.status==='unknown'?['结果未知不等于失败或免费；本记录不触发重试。']:[])].join('\n');
}
function splitBody(text:string):string[]{
  const chunks:string[]=[];let part='';
  for(const paragraph of text.split('\n\n')){
    const prefix=part?'\n\n':'';
    if(part.length+prefix.length+paragraph.length<=APPENDIX_BODY_LIMIT){part+=prefix+paragraph;continue;}
    if(part){chunks.push(part);part='';}
    for(const char of paragraph){if(part.length+char.length>APPENDIX_BODY_LIMIT){chunks.push(part);part='';}part+=char;}
  }
  if(part)chunks.push(part);return chunks;
}
async function sectionsFor(kind:AppendixKind,text:string):Promise<ReportSection[]>{
  const chunks=splitBody(text),letter={data:'A',ai:'B',claims:'C'}[kind],sections:ReportSection[]=[];
  for(let i=0;i<chunks.length;i++){
    const body=chunks[i],title=`附录 ${letter} ${APPENDIX_LABELS[kind]}${chunks.length>1?`（${i+1}/${chunks.length}）`:''}`,hash=await digestText(JSON.stringify({kind,title,body}));
    sections.push({id:`appendix-${kind}-${hash}`,title,body,source:`内容记录 SHA-256：${hash}`});
  }return sections;
}
async function referenceFor(content:EditorContent,finding:ResearchFinding):Promise<DefenseEvidenceReference>{
  const ids=new Set(finding.evidenceIds),locations:ReferenceLocation[]=[];
  for(const [index,section] of content.report.entries()){
    const direct=section.findingIds?.includes(finding.id),blocks=section.blocks?.filter(b=>ids.has(b.evidenceId))??[];
    if(!direct&&!blocks.length)continue;
    const state=direct&&section.findingSnapshots?.[finding.id]!==findingSignature(finding)?'review':'current';
    locations.push({kind:'report',id:section.id,label:`报告第 ${index+1} 节：${section.title||'未命名'}`,contentHash:await digestText(JSON.stringify(section)),relation:direct?'finding':'evidence',state});
  }
  for(const [index,slide] of content.slides.entries()){
    const objects=slide.objects?.filter(o=>ids.has(o.evidenceId))??[];if(!objects.length)continue;
    const link=await reportLinkState(content,slide);
    locations.push({kind:'slide',id:slide.id,label:`PPT 第 ${index+1} 页依据对象：${slide.title||'未命名'}`,contentHash:await digestText(JSON.stringify(slide)),relation:'evidence',state:objects.every(o=>o.opacity===0)?'hidden':link==='current'?'current':link==='unlinked'?'unlinked':'review'});
  }
  for(const figure of content.figures??[])if(ids.has(figure.resultId))locations.push({kind:'figure',id:figure.id,label:`共享图形：${figure.title}`,contentHash:await digestText(JSON.stringify({figure,visualStyle:content.visualStyle})),relation:'evidence',state:'current'});
  const ref:Omit<DefenseEvidenceReference,'referenceHash'>={schema:'DefenseEvidenceReference/v1',findingId:finding.id,findingHash:await digestText(findingSignature(finding)),title:finding.title,question:finding.question,interpretation:finding.interpretation,scope:finding.scope,status:findingNeedsReview(finding,content.quality!)?'needs_review':'confirmed',evidence:finding.evidenceIds.map(id=>{const r=content.quality!.results.find(r=>r.id===id)!;return {id:r.id,title:r.title,resultHash:r.resultHash,sourceHash:r.sourceHash,classification:r.classification,n:r.n,total:r.total};}),locations};
  return {...ref,referenceHash:await digestText(JSON.stringify(ref))};
}
/** Captures all input before the first async digest; never reads a changing editor after suspension. */
export async function createDefenseEvidenceReference(content:EditorContent,findingId:string):Promise<DefenseEvidenceReference>{
  const snapshot=parseEditorContent(structuredClone(content)),finding=snapshot.quality?.findings.find(f=>f.id===findingId);
  if(!finding)throw Error('研究发现不存在。');await verifyResearchQuality(snapshot.quality!);return referenceFor(snapshot,finding);
}
export async function verifyDefenseEvidenceReference(content:EditorContent,reference:DefenseEvidenceReference):Promise<{state:'current'|'review'|'missing'|'invalid';reason:string}>{
  try{
    const old=structuredClone(reference),snapshot=parseEditorContent(structuredClone(content));
    if(!old||old.schema!=='DefenseEvidenceReference/v1'||!snapshot.quality?.findings.some(f=>f.id===old.findingId))return {state:'missing',reason:'对应研究发现已移除。'};
    const {referenceHash,...payload}=old;if(!hashPattern.test(referenceHash)||await digestText(JSON.stringify(payload))!==referenceHash)return {state:'invalid',reason:'引用指纹不一致。'};
    const next=await createDefenseEvidenceReference(snapshot,old.findingId);
    if(next.referenceHash!==old.referenceHash)return {state:'review',reason:'发现、数据依据或成果位置已变化，请重新核对引用。'};
    if(next.locations.some(l=>l.state!=='current'))return {state:'review',reason:'引用版本一致，但相关成果仍有待核对、未绑定或不可见的依据位置。'};
    return next.status==='confirmed'?{state:'current',reason:'引用版本一致；确认状态不代表事实已获独立核验。'}:{state:'review',reason:'版本一致，但发现尚未确认或依据已待复核。'};
  }catch{return {state:'invalid',reason:'成果或引用结构无效，暂不可复用。'};}
}
export function formatDefenseEvidenceReference(ref:DefenseEvidenceReference):string{
  return [`发现：${ref.title}（${ref.findingId}）`,`问题：${ref.question||'未填写'}`,`主张：${ref.interpretation||'未填写'}`,`适用范围：${ref.scope||'未填写'}`,`状态：${ref.status==='confirmed'?'已确认，当前依据版本一致':'待确认／待复核'}`,`发现文字 SHA-256：${ref.findingHash}`,...ref.evidence.map(e=>`依据：${e.title}（${e.id}）；${classification[e.classification]}；n=${e.n}/${e.total}；结果 SHA-256：${e.resultHash}；数据来源 SHA-256：${e.sourceHash}`),...ref.locations.map(l=>`${l.label}（${l.id}；${l.relation==='finding'?'发现关联':'依据位置'}；${{current:'版本一致',review:'待复核',unlinked:'未绑定报告版本',hidden:'对象不可见'}[l.state]}）；内容 SHA-256：${l.contentHash}`),...(ref.locations.length?[]:['尚无报告、PPT 或图形位置关联。']),`引用 SHA-256：${ref.referenceHash}`].join('\n');
}
export async function createEvidenceAppendixProposal(content:EditorContent,options:{projectId?:string;aiLedger?:unknown}={}):Promise<EvidenceAppendixProposal>{
  const base=JSON.stringify(content),snapshot=parseEditorContent(JSON.parse(base)),ledger=parseAiUsageLedger(options.aiLedger,options.projectId);
  if(snapshot.quality)await verifyResearchQuality(snapshot.quality);
  const results=snapshot.quality?.results??[],findings=snapshot.quality?.findings??[];
  const data=['范围：以下仅转录已登记的数据来源、计算参数与汇总口径；来源指纹不等于原文件已经重新核验。未登记的过程与时间不补写。',...(results.length?results.map(dataRecord):['尚未登记分析结果，数据来源、处理过程与分母链待补充。'])].join('\n\n');
  const ai=[ledger.coverage==='unavailable'?'记录覆盖：项目级 AI 使用凭据尚未接入本附录，无法判断是否使用过 AI；不能以此空记录声明未使用 AI。':ledger.scope?`记录覆盖：仅本人问卷提案最近 200 条，本次接入 ${ledger.records.length} 条；其他模块、队友及外部工具未覆盖。空记录不能声明未使用 AI。`:`记录覆盖：仅包含调用方提供且绑定当前项目的 ${ledger.records.length} 条脱敏凭据，完整覆盖尚未核验。`, '本附录不包含提示词、原始答卷或密钥；缺少的时间、用量与费用保持未登记。',...ledger.records.map(aiRecord)].join('\n\n');
  const refs=[];for(const finding of findings)refs.push(await referenceFor(snapshot,finding));
  const claims=['范围：主张与已登记依据的版本对应，不自动判定事实真假。报告与 PPT 中的依据位置不等同于已经写入该项主张。',...(refs.length?refs.map(formatDefenseEvidenceReference):['尚未登记研究发现，主张与依据对照待补充。'])].join('\n\n');
  const groups:Record<AppendixKind,string[]>={data:[],ai:[],claims:[]},sections:ReportSection[]=[];
  for(const [kind,text] of [['data',data],['ai',ai],['claims',claims]] as const){const generated=await sectionsFor(kind,text);sections.push(...generated);groups[kind]=generated.map(s=>s.id);}
  return {schema:'EvidenceAppendixProposal/v1',base,baseHash:await digestText(base),sections,groups,coverage:{resultCount:results.length,legacyReceiptCount:results.filter(r=>!r.receipt).length,findingCount:findings.length,ai:ledger.coverage,aiRecords:ledger.records.length,...(ledger.scope?{aiScope:ledger.scope}:{})}};
}
/** Existing sections are never replaced. Root caller still enforces exact base, permission and undo. */
export function appendEvidenceAppendixSections(content:EditorContent,sections:ReportSection[]):EditorContent{
  const current=parseEditorContent(structuredClone(content)),added:ReportSection[]=[];
  if(!sections.length)throw Error('请选择要加入的附录。');
  for(const section of structuredClone(sections)){
    if(!/^appendix-(?:data|ai|claims)-[a-f0-9]{64}$/.test(section.id)||section.body.length>APPENDIX_BODY_LIMIT||section.blocks||section.findingIds||section.findingSnapshots)throw Error('附录提案结构无效，请重新生成。');
    const previous=[...current.report,...added].find(s=>s.id===section.id);
    if(previous){if(JSON.stringify(previous)!==JSON.stringify(section))throw Error('相同附录标识已有不同内容，保留原文；请重新生成或另存章节。');continue;}
    added.push(section);
  }
  if(current.report.length+added.length>EDITOR_LIMITS.sections)throw Error('章节数量超过上限，请拆分作品后再添加附录。');
  return parseEditorContent({...current,report:[...current.report,...added]});
}
