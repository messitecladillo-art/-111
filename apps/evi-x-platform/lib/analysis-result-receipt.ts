import type { Inference, RecipeResult, TestReport } from './analysis-recipes.ts';
import type { PlanNode, PlanFilterEvidence, PlanResult } from './analysis-plan.ts';
import type { RoutingEvidence } from './routing-evidence.ts';

/** Saved configuration and aggregate accounting only; never row indices or respondent values. */
export type AnalysisCalculationReceipt = {
  engine: 'analysis-plan/v1'; algorithmVersion: '2026-10-inference/v1'; method: string;
  variables: { column: number; name: string }[]; missingCodes: string[];
  filter: { column: number; values: string[] } | null;
  scale: { columns: number[]; reverse: number[]; min: number; max: number; construct: string } | null;
  interpretationHash: string; mapping: { questionnaireHash: string; mappingHash: string } | null;
  sample: { originalRows: number; branchRows: number; commonEligibleRows: number; filterExcludedRows: number; filterMissingRows: number };
  routing: { analysis: RoutingEvidence | null; filter: RoutingEvidence | null };
};
export type AnalysisResultReceipt = {
  version: 1; interpretation: string;
  sample: { calculationRows: number; analysisRows: number; excludedRows: number; missingRows: number; invalidRows: number; outOfRangeRows: number | null };
  /** A displayed proportion uses the effective sample, a row total, or no proportion at all. */
  percentageBasis: 'effective-sample' | 'row-total' | 'none';
  inference?: Inference; calculation?: AnalysisCalculationReceipt;
};
const METHODS = ['frequency','numeric','groups','crosstab','pearson','spearman','alpha'];
const bad = (): never => { throw Error('分析计算凭据无效，请重新登记结果。'); };
function obj(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) return bad();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (required.some(k => !Object.hasOwn(value,k)) || Reflect.ownKeys(value).some(k => typeof k !== 'string' || ![...required,...optional].includes(k) || !('value' in descriptors[k]) || !descriptors[k].enumerable)) return bad();
  return value as Record<string,unknown>;
}
function str(value: unknown, maximum: number, nonblank = false): string {
  if (typeof value !== 'string' || value.length > maximum || (nonblank && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\p{Surrogate}]/u.test(value)) return bad();
  return value;
}
function num(value: unknown, min = -1e100, max = 1e100, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) return bad();
  return value;
}
const count = (v: unknown, max = 5000) => num(v,0,max,true);
function arr<T>(value: unknown, max: number, parser: (v: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > max) return bad();
  return value.map(parser);
}
function fingerprint(value: unknown): string { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return bad(); return value; }
function indices(value: unknown): number[] { const a = arr(value,30,v => count(v,119)); if (new Set(a).size !== a.length) return bad(); return a; }
function interval(value: unknown): {lower:number;upper:number} | null {
  if (value === null) return null;
  const x = obj(value,['lower','upper']), lower = num(x.lower), upper = num(x.upper);
  if (lower > upper) return bad(); return {lower,upper};
}
function testReport(value: unknown): TestReport {
  const x = obj(value,['name','line','p'],['effect']);
  const base: TestReport = {name:str(x.name,160,true),line:str(x.line,2000,true),p:x.p === null ? null : num(x.p,0,1)};
  if (Object.hasOwn(x,'effect')) {
    const e = obj(x.effect,['name','value'],['interval']);
    base.effect = {name:str(e.name,160,true),value:e.value === null ? null : num(e.value),...(Object.hasOwn(e,'interval') ? {interval:interval(e.interval)} : {})};
  }
  return base;
}
export function parseResultInference(value: unknown): Inference {
  const x = obj(value,['primary','robustness','notes'],['comparisons']);
  return {primary:testReport(x.primary),robustness:arr(x.robustness,10,testReport),...(Object.hasOwn(x,'comparisons') ? {comparisons:arr(x.comparisons,190,v => {
    const c = obj(v,['a','b','difference','t','df','p','adjusted']);
    const result = {a:str(c.a,2000,true),b:str(c.b,2000,true),difference:num(c.difference),t:num(c.t),df:num(c.df,Number.MIN_VALUE),p:num(c.p,0,1),adjusted:num(c.adjusted,0,1)};
    if (result.a === result.b || result.adjusted + 1e-14 < result.p) return bad(); return result;
  })} : {}),notes:arr(x.notes,30,v => str(v,1000))};
}
const ROUTING_COUNTS = ['eligibleAnswered','eligibleMissing','ineligibleBlank','ineligibleAnswered','unknownBlank','unknownAnswered'] as const;
function routing(value: unknown, originalRows: number): RoutingEvidence | null {
  if (value === null) return null;
  const x = obj(value,['schema','policy','totalRows','eligibleRows','ineligibleRows','unknownRows','contradictionRows','questionCounts']);
  if (x.schema !== 'row-eligibility/v1' || !['strict','exclude'].includes(x.policy as string)) return bad();
  const totalRows = count(x.totalRows), eligibleRows = count(x.eligibleRows,totalRows), ineligibleRows = count(x.ineligibleRows,totalRows), unknownRows = count(x.unknownRows,totalRows), contradictionRows = count(x.contradictionRows,ineligibleRows);
  if (totalRows !== originalRows || eligibleRows + ineligibleRows + unknownRows !== totalRows || (x.policy === 'strict' && (unknownRows || contradictionRows))) return bad();
  const questionCounts = arr(x.questionCounts,80,v => {
    const q = obj(v,['questionId',...ROUTING_COUNTS]), questionId = str(q.questionId,64,true);
    if (!/^[A-Za-z0-9_-]+$/.test(questionId)) return bad();
    const c = Object.fromEntries(ROUTING_COUNTS.map(k => [k,count(q[k],totalRows)])) as Record<typeof ROUTING_COUNTS[number],number>;
    if (Object.values(c).reduce((a,b) => a+b,0) !== totalRows) return bad(); return {questionId,...c};
  });
  if (!questionCounts.length || new Set(questionCounts.map(q => q.questionId)).size !== questionCounts.length) return bad();
  return {schema:'row-eligibility/v1',policy:x.policy as RoutingEvidence['policy'],totalRows,eligibleRows,ineligibleRows,unknownRows,contradictionRows,questionCounts};
}
export function parseAnalysisCalculation(value: unknown, method: string, calculationRows: number): AnalysisCalculationReceipt {
  const x = obj(value,['engine','algorithmVersion','method','variables','missingCodes','filter','scale','interpretationHash','mapping','sample','routing']);
  if (x.engine !== 'analysis-plan/v1' || x.algorithmVersion !== '2026-10-inference/v1' || x.method !== method || !METHODS.includes(method)) return bad();
  const variables = arr(x.variables,30,v => { const c = obj(v,['column','name']); return {column:count(c.column,119),name:str(c.name,160,true)}; });
  if (!variables.length || new Set(variables.map(v => v.column)).size !== variables.length || (method !== 'alpha' && variables.length !== (['frequency','numeric'].includes(method) ? 1 : 2))) return bad();
  const missingCodes = arr(x.missingCodes,20,v => str(v,40,true));
  if (new Set(missingCodes).size !== missingCodes.length) return bad();
  let filter: AnalysisCalculationReceipt['filter'] = null;
  if (x.filter !== null) { const f = obj(x.filter,['column','values']); const values = arr(f.values,50,v => str(v,2000,true)); if (!values.length || new Set(values).size !== values.length || values.some(v => missingCodes.includes(v))) return bad(); filter = {column:count(f.column,119),values}; }
  let scale: AnalysisCalculationReceipt['scale'] = null;
  if (x.scale !== null) {
    const s = obj(x.scale,['columns','reverse','min','max','construct']);
    scale = {columns:indices(s.columns),reverse:indices(s.reverse),min:num(s.min,-1e6,1e6),max:num(s.max,-1e6,1e6),construct:str(s.construct,120,true)};
    if (scale.columns.length < 2 || scale.min >= scale.max || scale.reverse.some(i => !scale!.columns.includes(i)) || JSON.stringify(scale.columns) !== JSON.stringify(variables.map(v => v.column))) return bad();
  }
  if ((method === 'alpha') !== (scale !== null)) return bad();
  let mapping: AnalysisCalculationReceipt['mapping'] = null;
  if (x.mapping !== null) { const m = obj(x.mapping,['questionnaireHash','mappingHash']); mapping = {questionnaireHash:fingerprint(m.questionnaireHash),mappingHash:fingerprint(m.mappingHash)}; }
  const s = obj(x.sample,['originalRows','branchRows','commonEligibleRows','filterExcludedRows','filterMissingRows']);
  const originalRows = count(s.originalRows), branchRows = count(s.branchRows,originalRows), commonEligibleRows = count(s.commonEligibleRows,branchRows), filterExcludedRows = count(s.filterExcludedRows,originalRows), filterMissingRows = count(s.filterMissingRows,filterExcludedRows);
  if (commonEligibleRows !== calculationRows || originalRows - branchRows !== filterExcludedRows || (!filter && (branchRows !== originalRows || filterMissingRows))) return bad();
  const r = obj(x.routing,['analysis','filter']), analysis = routing(r.analysis,originalRows), filterRouting = routing(r.filter,originalRows);
  if ((analysis && commonEligibleRows > analysis.eligibleRows) || (filterRouting && commonEligibleRows > filterRouting.eligibleRows) || (!filter && filterRouting) || ((analysis || filterRouting) && !mapping)) return bad();
  return {engine:'analysis-plan/v1',algorithmVersion:'2026-10-inference/v1',method,variables,missingCodes,filter,scale,interpretationHash:fingerprint(x.interpretationHash),mapping,sample:{originalRows,branchRows,commonEligibleRows,filterExcludedRows,filterMissingRows},routing:{analysis,filter:filterRouting}};
}
export function parseAnalysisResultReceipt(value: unknown, result: {method:string;n:number;total:number}): AnalysisResultReceipt {
  const x = obj(value,['version','interpretation','sample','percentageBasis'],['inference','calculation']);
  const expectedBasis = result.method === 'frequency' ? 'effective-sample' : result.method === 'crosstab' ? 'row-total' : 'none';
  if (x.version !== 1 || x.percentageBasis !== expectedBasis) return bad();
  const s = obj(x.sample,['calculationRows','analysisRows','excludedRows','missingRows','invalidRows','outOfRangeRows']);
  const calculationRows = count(s.calculationRows), analysisRows = count(s.analysisRows,calculationRows), excludedRows = count(s.excludedRows,calculationRows), missingRows = count(s.missingRows,excludedRows), invalidRows = count(s.invalidRows,excludedRows), outOfRangeRows = s.outOfRangeRows === null ? null : count(s.outOfRangeRows,excludedRows);
  if (calculationRows !== result.total || analysisRows !== result.n || calculationRows - analysisRows !== excludedRows || excludedRows > missingRows + invalidRows + (outOfRangeRows ?? 0) || (result.method === 'alpha') !== (outOfRangeRows !== null)) return bad();
  if (Object.hasOwn(x,'inference') && !['groups','crosstab','pearson','spearman'].includes(result.method)) return bad();
  return {version:1,interpretation:str(x.interpretation,3000),sample:{calculationRows,analysisRows,excludedRows,missingRows,invalidRows,outOfRangeRows},percentageBasis:expectedBasis,...(Object.hasOwn(x,'inference') ? {inference:parseResultInference(x.inference)} : {}),...(Object.hasOwn(x,'calculation') ? {calculation:parseAnalysisCalculation(x.calculation,result.method,calculationRows)} : {})};
}
export function resultReceipt(result: Omit<RecipeResult,'method'> & {method:string;reliability?:PlanResult['reliability']}, calculation?: AnalysisCalculationReceipt): AnalysisResultReceipt {
  return parseAnalysisResultReceipt({version:1,interpretation:result.interpretation,sample:{calculationRows:result.total,analysisRows:result.n,excludedRows:result.excluded,missingRows:result.missingRows,invalidRows:result.invalidRows,outOfRangeRows:result.reliability?.outOfRangeRows ?? null},percentageBasis:result.method === 'frequency' ? 'effective-sample' : result.method === 'crosstab' ? 'row-total' : 'none',...(result.inference ? {inference:result.inference} : {}),...(calculation ? {calculation} : {})},result);
}
export function calculationReceipt(node: PlanNode, headers: string[], missingCodes: string[], interpretationHash: string, mapping: AnalysisCalculationReceipt['mapping'], sample: PlanFilterEvidence, commonEligibleRows: number, analysis: RoutingEvidence | null, filter: RoutingEvidence | null): AnalysisCalculationReceipt {
  const columns = node.scale?.columns ?? [node.x,...(['frequency','numeric'].includes(node.method) ? [] : [node.y])].filter((i): i is number => i !== null);
  return parseAnalysisCalculation({engine:'analysis-plan/v1',algorithmVersion:'2026-10-inference/v1',method:node.method,variables:columns.map(column => ({column,name:headers[column]})),missingCodes,filter:node.filter,scale:node.scale,interpretationHash,mapping,sample:{originalRows:sample.totalRows,branchRows:sample.branchRows,commonEligibleRows,filterExcludedRows:sample.excludedRows,filterMissingRows:sample.missingRows},routing:{analysis,filter}},node.method,commonEligibleRows);
}
