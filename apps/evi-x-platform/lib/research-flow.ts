import { parseEditorContent, type EditorContent, type ReportSection } from './editor-model.ts';
import type { ReliabilityResult, ScaleOptions } from './survey-analysis.ts';
import type { RecipeResult } from './analysis-recipes.ts';
import { parseResearchLink, type ResearchLink } from './research-link.ts';
import { parseRoutingEvidence, routingSummary, type RoutingEvidence } from './routing-evidence.ts';

export const FLOW_VERSION = 'research-flow/v1';
export const FLOW_LIMIT = 80;
type EvidenceBase = {
  sourceHash: string; classification: 'simulated' | 'user_provided';
  question: string; variables: string[]; missingCodes: string[];
  total: number; n: number;
  calculation: { method: 'frequency'; counts: number[]; column: number }
    | { method: 'alpha'; columns: number[]; reverse: number[]; min: number; max: number; itemVarianceSum: number; totalVariance: number };
};
export type EvidenceInput = EvidenceBase & ({version:1} | {version:2;link:ResearchLink} | {version:3;link:ResearchLink;eligibility:RoutingEvidence});
export function evidenceContract(input:EvidenceInput):string{return input.version===3?'research-flow/v3':input.version===2?'research-flow/v2':FLOW_VERSION;}
export type EvidenceCandidate = { key: string; input: EvidenceInput; label: string; contextKey?:string };
export type ResearchRun = {
  id: string; draftId: string; baseRevision: number; input: EvidenceInput; inputHash: string;
  proposal: ReportSection; proposalHash: string; status: 'pending' | 'accepted' | 'cancelled';
  createdAt: string; decidedAt: string | null; acceptedRevision: number | null; versionId: string;
  currentRevision: number; events: { type: string; at: string }[];
};
function record(x: unknown, keys: string[]): Record<string, unknown> {
  if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).some(k => !keys.includes(k))) throw Error('证据结构不受支持，不能附加原始答卷或结论。');
  return x as Record<string, unknown>;
}
function integer(x: unknown, min: number, max: number): number {
  if (!Number.isSafeInteger(x) || (x as number) < min || (x as number) > max) throw Error('样本数或变量位置超出允许范围。');
  return x as number;
}
function number(x: unknown, min: number, max: number): number {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) throw Error('汇总数值无效。');
  return x;
}
function text(x: unknown, max: number, min = 1): string {
  if (typeof x !== 'string' || x.trim().length < min || x.length > max || /[\u0000-\u001f\u007f]/u.test(x)) throw Error('证据说明需使用有长度限制的单行文本。');
  return x.trim();
}
function array<T>(x: unknown, min: number, max: number, f: (x: unknown) => T): T[] {
  if (!Array.isArray(x) || x.length < min || x.length > max) throw Error('汇总项目数量不符合要求。');
  return x.map(f);
}
/** Strict whitelist prevents raw records, arbitrary output text and forged verification labels. */
export function parseEvidence(value: unknown): EvidenceInput {
  const version=(value as {version?:unknown})?.version;
  const x = record(value, ['version','sourceHash','classification','question','variables','missingCodes','total','n','calculation',...(version===3?['link','eligibility']:version===2?['link']:[])]);
  if (![1,2,3].includes(x.version as number) || typeof x.classification!=='string'||!['simulated','user_provided'].includes(x.classification) || typeof x.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(x.sourceHash)) throw Error('缺少有效的数据指纹或来源分类。');
  if(x.version!==1&&Object.getPrototypeOf(value)!==Object.prototype)throw Error('证据必须为普通对象。');
  const total = integer(x.total, 1, x.version!==1?5000:10000), n = integer(x.n, 1, total);
  const variables = array(x.variables, 1, 30, v => text(v, x.version!==1?120:100));
  const missingCodes = array(x.missingCodes, 0, x.version!==1?20:30, v => text(v, 40));
  const c = record(x.calculation, ['method','counts','column','columns','reverse','min','max','itemVarianceSum','totalVariance']);
  if(x.version!==1&&Object.getPrototypeOf(c)!==Object.prototype)throw Error('计算证据必须为普通对象。');
  let calculation: EvidenceInput['calculation'];
  if (c.method === 'frequency') {
    record(c, ['method','counts','column']);
    const counts = array(c.counts, 1, 50, v => integer(v, 1, n));
    if (variables.length !== 1 || counts.reduce((s,v) => s+v,0) !== n) throw Error('分类频数之和必须等于有效样本数。');
    calculation = { method: 'frequency', counts, column: integer(c.column, 0, 119) };
  } else if (c.method === 'alpha') {
    record(c, ['method','columns','reverse','min','max','itemVarianceSum','totalVariance']);
    const columns = array(c.columns, 2, 30, v => integer(v,0,119)), reverse = array(c.reverse,0,30,v=>integer(v,0,119));
    const min = number(c.min,-1e6,1e6), max = number(c.max,-1e6,1e6);
    const itemVarianceSum = number(c.itemVarianceSum,0,1e15), totalVariance = number(c.totalVariance,Number.MIN_VALUE,1e15);
    if (n < 2 || min >= max || variables.length !== columns.length || new Set(columns).size !== columns.length || new Set(reverse).size !== reverse.length || reverse.some(i=>!columns.includes(i))) throw Error('量表题项、反向题或完整案例口径无效。');
    // All variances use one common scale. Cauchy: Var(sum) <= k*sum(Var).
    if (itemVarianceSum <= 0 || totalVariance > columns.length * itemVarianceSum * (1+1e-8)) throw Error('题项方差与总分方差不相容。');
    const alpha = columns.length/(columns.length-1)*(1-itemVarianceSum/totalVariance);
    if (!Number.isFinite(alpha)) throw Error('α 计算退化，不能形成报告提案。');
    calculation = {method:'alpha',columns,reverse,min,max,itemVarianceSum,totalVariance};
  } else throw Error('首版报告链路只接入频数与比例、原始 Cronbach α。其他分析仍可在原工作台计算。');
  const base={sourceHash:x.sourceHash,classification:x.classification as EvidenceInput['classification'],question:text(x.question,300),variables,missingCodes,total,n,calculation};
  if(x.version===1)return {version:1,...base};
  const link=parseResearchLink(x.link,x.version===3),columns=calculation.method==='frequency'?[calculation.column]:calculation.columns;
  if(link.bindings.length!==columns.length||columns.some((column,i)=>link.bindings[i].column!==column))throw Error('证据关联的题项顺序与计算列不一致。');
  if(calculation.method==='alpha'){
    const scale=calculation,construct=link.bindings[0].construct;
    if(!construct.trim()||link.bindings.some(b=>b.type!=='likert'||b.construct!==construct||b.min!==scale.min||b.max!==scale.max||b.reverse!==scale.reverse.includes(b.column)))throw Error('α 的题型、构念、范围或反向设置与关联问卷不一致。');
  }
  if(x.version===3){
    if(!link.bindings.some(binding=>binding.conditional))throw Error('跳题证据 v3 必须包含至少一个条件题；无条件题请使用原关联契约。');
    const eligibility=parseRoutingEvidence(x.eligibility,link.bindings.map(binding=>binding.questionId),base.total);
    const selectedCounts=link.bindings.map(binding=>eligibility.questionCounts.find(count=>count.questionId===binding.questionId)!);
    // Alpha uses a common complete-case subset after the local domain-value guard.
    // Marginal missing totals bound, but do not identify, the complete-case overlap;
    // these arithmetic checks cannot attest the raw data or submitted variances.
    if(selectedCounts.some(count=>base.n>count.eligibleAnswered))throw Error('分析有效样本数不能超过所选题目的应答且非缺失行数。');
    if(calculation.method==='frequency'&&base.n!==selectedCounts[0].eligibleAnswered)throw Error('频数分母必须等于该题符合显示条件且非缺失的行数。');
    if(calculation.method==='alpha'&&base.n<Math.max(0,eligibility.eligibleRows-selectedCounts.reduce((sum,count)=>sum+count.eligibleMissing,0)))throw Error('完整案例数低于所选题目缺失计数允许的下界，请核对分析口径。');
    return {version:3,...base,link,eligibility};
  }
  return {version:2,...base,link};
}
export function linkEvidence(input:EvidenceInput,link:ResearchLink,eligibility?:RoutingEvidence|null):EvidenceInput{
  const normalized=parseEvidence(input);
  const columns=normalized.calculation.method==='frequency'?[normalized.calculation.column]:normalized.calculation.columns;
  const {sourceHash,classification,question,variables,missingCodes,total,n,calculation}=normalized;
  return parseEvidence({version:eligibility?3:2,sourceHash,classification,question,variables,missingCodes,total,n,calculation,link:{...link,bindings:columns.map(column=>link.bindings.find(b=>b.column===column))},...(eligibility?{eligibility}:{})});
}
const f = (v: number) => v.toFixed(4).replace(/\.?0+$/,'');
/** Deterministic prose only; no model can replace the arithmetic or claim verification. */
export function evidenceSection(raw: EvidenceInput, runId: string): ReportSection {
  const e = parseEvidence(raw), c = e.calculation;
  const simulated = e.classification === 'simulated';
  const provenance = simulated ? '【教学模拟数据，不能作为实际调查结果】' : '【用户提供数据；来源、抽样与田野过程尚未独立核验】';
  const body = [provenance, `研究问题（用户填写，非计算结论）：${e.question}`, `变量：${e.variables.join('、')}。`, ...(e.version===3?[
    `原始记录 ${e.eligibility.totalRows} 行 → 所选题目共同符合显示条件 ${e.total} 行 → 本次分析有效样本 ${e.n} 行；符合条件但未进入本次计算 ${e.total-e.n} 行。`,
    routingSummary(e.eligibility),
  ]:[`共读取 ${e.total} 行，本次分析纳入 ${e.n} 行，未纳入 ${e.total-e.n} 行。`]),
    ...(c.method === 'frequency' ? [
      ...c.counts.map((count,i)=>`类别 ${i+1}：${count} / ${e.n}，占有效样本的 ${(count/e.n*100).toFixed(2)}%。`),
      '类别已替换为代号；对应关系需回到原分析卡片核对，不能将代号解释为特定人群。空白及指定缺失代码不进入分母。',
    ] : [
      `同一完整案例集合、${c.columns.length} 个题项的原始 Cronbach α = ${f(c.columns.length/(c.columns.length-1)*(1-c.itemVarianceSum/c.totalVariance))}。`,
      `计分范围 ${c.min} 至 ${c.max}；反向题：${c.reverse.map(i=>e.variables[c.columns.indexOf(i)]).join('、') || '无'}。反向计分为下限 + 上限 − 原值。`,
      '完整案例需所有选中值非缺失、为数值且位于计分范围内；使用同一尺度下的题项方差和与总分方差复算。',
      'α 仅描述内部一致性，不证明单维性或效度；负值不能截为零，高值也不自动代表量表合格。',
      ...(e.n<30?['当前完整案例样本很小，结果可能不稳定；30 不是通用合格线。']:[]),
      ...(c.columns.length/(c.columns.length-1)*(1-c.itemVarianceSum/c.totalVariance)<0?['本次 α 为负值，请核对反向计分与构念一致性，不能直接判定通过。']:[]),
      ...(c.columns.length/(c.columns.length-1)*(1-c.itemVarianceSum/c.totalVariance)>.95?['本次 α 很高，可能存在题项冗余，需结合内容复核。']:[]),
      '本段未携带零方差题项、CITC 与删除后 α 诊断；请回到量表分析区核对，不据此自动删题。',
    ]),
    `缺失代码：${e.missingCodes.join('、') || '未额外指定'}；空白始终作为缺失。不插补、不加权、不自动去重。`,
    '核验边界：服务器仅对浏览器提交的汇总做结构、算术与模板核验，未读取原始答卷，不能证明汇总与原始文件一致。',
    '解释范围仅限本次纳入样本；不提供显著性、因果或总体代表性结论。提交前仍需核对变量含义、招募过程和小样本泄露风险。',
    ...(e.version!==1?['问卷关联：本结果绑定用户确认的设计快照与数据列。设计仍为拟议内容，不证明实际施测使用了该版本。服务器未读取本地问卷或答卷，也不能感知未上传的后续修改。']:[]),
    ...(e.version===3?['跳题范围：结果仅适用于所选题目的共同应答范围，不把结构性跳过当作漏答、零值或全体受访者分母。资格与质控计数是客户端汇总，服务器未复核逐行分支，也不证明实际问卷正确执行了跳题。']:[])];
  return { id: `evidence-${runId}`, title: `${simulated?'模拟演示 · ':''}${c.method === 'frequency'?'样本结构统计':'量表内部一致性'}`, body: body.join('\n'), source: `证据记录 ${runId}\n数据 SHA-256：${e.sourceHash}\n计算契约：${evidenceContract(e)}；汇总来源：浏览器计算；非竞赛 Gate 证据。${e.version!==1?`\n问卷 SHA-256：${e.link.questionnaireHash}\n解析身份 SHA-256：${e.link.interpretationHash}\n对应 SHA-256：${e.link.mappingHash}\n关联题项：${e.link.bindings.length} 项；完整题目 ID 与题目指纹见执行记录。`:''}` };
}
export function appendEvidence(content: EditorContent, proposal: ReportSection): EditorContent {
  if (content.report.some(s=>s.id === proposal.id)) throw Error('该证据章节已经存在，未重复插入。');
  return parseEditorContent({...content,report:[...content.report,proposal]});
}
export function frequencyEvidence(result: RecipeResult, options: {hash:string; simulated:boolean; question:string; variable:string; column:number; missingCodes:string[]}): EvidenceInput {
  if (result.method !== 'frequency') throw Error('不是频数结果。');
  return parseEvidence({version:1,sourceHash:options.hash,classification:options.simulated?'simulated':'user_provided',question:options.question.replace(/[\r\n\t]+/g,' '),variables:[options.variable],missingCodes:options.missingCodes,total:result.total,n:result.n,calculation:{method:'frequency',counts:result.rows.map(r=>r[1]),column:options.column}});
}
export function reliabilityEvidence(result: ReliabilityResult, options: ScaleOptions, source: {hash:string; simulated:boolean; question:string}): EvidenceInput {
  if (!result.aggregate || result.alpha === null) throw Error('α 未定义，不能生成报告提案。');
  return parseEvidence({version:1,sourceHash:source.hash,classification:source.simulated?'simulated':'user_provided',question:source.question,variables:result.items.map(i=>i.name),missingCodes:options.missingCodes,total:result.total,n:result.n,calculation:{method:'alpha',columns:options.columns,reverse:options.reverse,min:options.min,max:options.max,...result.aggregate}});
}
