import { ANALYSIS_BLOCKS, exportRecipeResult, runRecipe, type AnalysisMethod, type RecipeResult } from './analysis-recipes.ts';
import { analyzeReliability, isMissing, profileSurvey, SURVEY_LIMITS, type ReliabilityResult, type SurveyTable } from './survey-analysis.ts';
import { canonical, type AnalysisRequest } from './questionnaire-mapping.ts';
import { rejectDuplicateMembers } from './questionnaire.ts';

export const ANALYSIS_PLAN_VERSION = 'analysis-plan/v1';
export const PLAN_LIMITS = { nodes: 12, bytes: 100_000, filterValues: 50 } as const;
export type PlanMethod = AnalysisMethod | 'alpha';
export type PlanFilter = { column: number | null; values: string[] };
export type PlanScale = { columns: number[]; reverse: number[]; min: number; max: number; construct: string };
export type PlanNode = { id: string; method: PlanMethod; x: number | null; y: number | null; question: string; branch: string; filter: PlanFilter | null; scale: PlanScale | null };
export type PlanSource = { hash: string; headers: string[]; interpretationHash: string; expectedMapping: { questionnaireHash: string; mappingHash: string; routingPolicy: 'strict' | 'exclude' } | null };
export type PlanTemplateId = 'activity' | 'support' | 'consumer';
export type AnalysisPlan = { schema: typeof ANALYSIS_PLAN_VERSION; title: string; template: { id: PlanTemplateId; version: 1 } | null; nodes: PlanNode[]; source: PlanSource; missingCodes: string[] };
export type PlanResult = Omit<RecipeResult, 'method'> & { method: PlanMethod; reliability?: ReliabilityResult };
export type PlanFilterEvidence = { totalRows: number; branchRows: number; excludedRows: number; missingRows: number; filterColumn: number | null; values: string[] };
type TemplateStep = { method: PlanMethod; question: string; branch: string; filtered: boolean };
export type PlanTemplate = { id: PlanTemplateId; version: 1; title: string; description: string; steps: readonly TemplateStep[] };

/** Research routes are editable starters, not claims that every method is necessary. */
export const PLAN_TEMPLATES: readonly PlanTemplate[] = [
  { id: 'activity', version: 1, title: '活动体验与运营改进', description: '从参与状态出发，比较体验与需求，寻找可落实的改进方向。', steps: [
    { method: 'frequency', question: '本次样本由哪些人群组成？', branch: '全部样本', filtered: false },
    { method: 'frequency', question: '受访者的参与状态如何分布？', branch: '全部样本', filtered: false },
    { method: 'frequency', question: '未参与者主要遇到哪些参与障碍？', branch: '未参与者', filtered: true },
    { method: 'frequency', question: '参与者的体验评价如何分布？', branch: '参与者', filtered: true },
    { method: 'crosstab', question: '不同参与人群提出的改进需求有何差异？', branch: '参与者', filtered: true },
  ] },
  { id: 'support', version: 1, title: '人群分层与服务支持', description: '核对对象范围，描述不同状态人群的需求，再比较支持方向。', steps: [
    { method: 'frequency', question: '样本的就业或经历状态如何分布？', branch: '全部样本', filtered: false },
    { method: 'frequency', question: '目标人群当前最需要哪些支持？', branch: '目标人群', filtered: true },
    { method: 'crosstab', question: '不同状态的人群在支持需求上如何分布？', branch: '目标人群', filtered: true },
    { method: 'groups', question: '不同人群的数值型投入或负担有何差异？', branch: '目标人群', filtered: true },
    { method: 'frequency', question: '目标人群偏好哪些支持渠道？', branch: '目标人群', filtered: true },
  ] },
  { id: 'consumer', version: 1, title: '消费体验与增长机会', description: '区分未参与者和参与者，分别研究障碍、消费与再次参与意愿。', steps: [
    { method: 'frequency', question: '样本的消费或参与经历如何分布？', branch: '全部样本', filtered: false },
    { method: 'frequency', question: '未参与者最主要的消费障碍是什么？', branch: '未参与者', filtered: true },
    { method: 'frequency', question: '参与者选择了哪些消费类别？', branch: '参与者', filtered: true },
    { method: 'groups', question: '不同参与人群的实际消费金额有何差异？', branch: '参与者', filtered: true },
    { method: 'spearman', question: '有序体验评价与再次参与意愿有何单调关联？', branch: '参与者', filtered: true },
    { method: 'frequency', question: '参与者的推荐意愿如何分布？', branch: '参与者', filtered: true },
  ] },
];

export function createPlanNode(method: PlanMethod, id: string): PlanNode {
  if (!isMethod(method)) throw Error('分析方法不支持。');
  validId(id);
  return { id, method, x: null, y: null, question: '', branch: '全部样本', filter: null, scale: method === 'alpha' ? { columns: [], reverse: [], min: 1, max: 5, construct: '' } : null };
}
export function createTemplateNodes(templateId: PlanTemplateId, makeId: () => string): PlanNode[] {
  const template = PLAN_TEMPLATES.find(item => item.id === templateId);
  if (!template) throw Error('分析路线版本不支持。');
  const nodes = template.steps.map(step => ({ ...createPlanNode(step.method, makeId()), question: step.question, branch: step.branch, filter: step.filtered ? { column: null, values: [] } : null }));
  if (new Set(nodes.map(node => node.id)).size !== nodes.length) throw Error('分析节点 ID 重复。');
  return nodes;
}

function exact(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw Error(`${label}存在未知或缺失字段。`);
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, label: string, nonempty = false): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || (nonempty && !value.trim())) throw Error(`${label}必须为${nonempty ? '非空、' : ''}不超过 ${max} 字的文本。`);
  return value;
}
function isMethod(value: unknown): value is PlanMethod { return value === 'alpha' || ANALYSIS_BLOCKS.some(block => block.id === value); }
function validId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw Error('分析节点 ID 无效。');
}
function column(value: unknown, size: number, nullable = true): number | null {
  if (value === null && nullable) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value >= size) throw Error('分析变量列号无效；请重新选择当前数据中的列。');
  return value;
}
function uniqueColumns(value: unknown, size: number): number[] {
  if (!Array.isArray(value) || value.length > SURVEY_LIMITS.scaleItems) throw Error('量表最多包含 30 个题项。');
  const columns = value.map(item => column(item, size, false) as number);
  if (new Set(columns).size !== columns.length) throw Error('量表题项不能重复。');
  return columns;
}
function parseFilter(value: unknown, size: number): PlanFilter | null {
  if (value === null) return null;
  const filter = exact(value, ['column', 'values'], '样本筛选');
  if (!Array.isArray(filter.values) || filter.values.length > PLAN_LIMITS.filterValues) throw Error('样本筛选最多选择 50 个类别。');
  const values = filter.values.map(value => text(value, SURVEY_LIMITS.cellLength, '筛选值', true));
  if (values.some(value => value !== value.trim()) || new Set(values).size !== values.length) throw Error('筛选值须去除首尾空白且不能重复。');
  const index = column(filter.column, size);
  if (index === null && values.length) throw Error('请先为筛选值选择来源列。');
  return { column: index, values };
}
function parseScale(value: unknown, size: number): PlanScale {
  const scale = exact(value, ['columns', 'reverse', 'min', 'max', 'construct'], '量表设置');
  const columns = uniqueColumns(scale.columns, size), reverse = uniqueColumns(scale.reverse, size);
  if (reverse.some(index => !columns.includes(index))) throw Error('反向题必须来自当前选中的题项。');
  if (typeof scale.min !== 'number' || typeof scale.max !== 'number' || !Number.isFinite(scale.min) || !Number.isFinite(scale.max) || Math.max(Math.abs(scale.min), Math.abs(scale.max)) > 1e6 || scale.min >= scale.max) throw Error('计分上下限须为绝对值不超过一百万的有限数值，且下限小于上限。');
  return { columns, reverse, min: scale.min, max: scale.max, construct: text(scale.construct, 120, '构念') };
}
function parseNode(value: unknown, size: number): PlanNode {
  const node = exact(value, ['id', 'method', 'x', 'y', 'question', 'branch', 'filter', 'scale'], '分析节点');
  validId(node.id);
  if (!isMethod(node.method)) throw Error('分析方法不支持，未执行或替换为其他方法。');
  const x = column(node.x, size), y = column(node.y, size);
  let scale: PlanScale | null = null;
  if (node.method === 'alpha') {
    if (x !== null || y !== null) throw Error('量表模块使用题项列表，不使用单变量位置。');
    scale = parseScale(node.scale, size);
  } else if (node.scale !== null) throw Error('非量表模块不能包含隐藏的量表设置。');
  if (['frequency', 'numeric'].includes(node.method) && y !== null) throw Error('单变量模块不能包含第二个变量。');
  return { id: node.id, method: node.method, x, y, question: text(node.question, 300, '研究问题'), branch: text(node.branch, 80, '分支名称'), filter: parseFilter(node.filter, size), scale };
}
function parseSource(value: unknown): PlanSource {
  const source = exact(value, ['hash', 'headers', 'interpretationHash', 'expectedMapping'], '数据身份');
  if (typeof source.hash !== 'string' || !/^[a-f0-9]{64}$/.test(source.hash) || typeof source.interpretationHash !== 'string' || !/^[a-f0-9]{64}$/.test(source.interpretationHash)) throw Error('缺少有效的数据或解析指纹。');
  if (!Array.isArray(source.headers) || !source.headers.length || source.headers.length > SURVEY_LIMITS.columns) throw Error('数据列名数量无效。');
  const headers = source.headers.map(value => text(value, 120, '数据列名', true));
  if (new Set(headers).size !== headers.length || headers.some(header => header !== header.trim())) throw Error('数据列名无效或重复。');
  let expectedMapping: PlanSource['expectedMapping'] = null;
  if (source.expectedMapping !== null) {
    const binding = exact(source.expectedMapping, ['questionnaireHash', 'mappingHash', 'routingPolicy'], '题目对应身份');
    if (typeof binding.questionnaireHash !== 'string' || !/^[a-f0-9]{64}$/.test(binding.questionnaireHash) || typeof binding.mappingHash !== 'string' || !/^[a-f0-9]{64}$/.test(binding.mappingHash) || !['strict', 'exclude'].includes(String(binding.routingPolicy))) throw Error('题目对应指纹或跳题策略无效。');
    expectedMapping = { questionnaireHash: binding.questionnaireHash, mappingHash: binding.mappingHash, routingPolicy: binding.routingPolicy as 'strict' | 'exclude' };
  }
  return { hash: source.hash, interpretationHash: source.interpretationHash, headers, expectedMapping };
}
function parseMissing(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 20) throw Error('最多允许 20 个缺失代码。');
  const codes = value.map(code => text(code, 40, '缺失代码', true));
  if (new Set(codes).size !== codes.length || codes.some(code => code !== code.trim())) throw Error('缺失代码不能重复或含首尾空白。');
  return codes;
}
function parsePlan(value: unknown): AnalysisPlan {
  const plan = exact(value, ['schema', 'title', 'template', 'nodes', 'source', 'missingCodes'], '分析计划');
  if (plan.schema !== ANALYSIS_PLAN_VERSION) throw Error('分析计划版本不支持。');
  const source = parseSource(plan.source), missingCodes = parseMissing(plan.missingCodes);
  let template: AnalysisPlan['template'] = null;
  if (plan.template !== null) {
    const stored = exact(plan.template, ['id', 'version'], '路线记录');
    if (stored.version !== 1 || !PLAN_TEMPLATES.some(item => item.id === stored.id)) throw Error('分析路线版本不支持。');
    template = { id: stored.id as PlanTemplateId, version: 1 };
  }
  if (!Array.isArray(plan.nodes) || plan.nodes.length > PLAN_LIMITS.nodes) throw Error('一份分析计划最多包含 12 个模块。');
  const nodes = plan.nodes.map(value => parseNode(value, source.headers.length));
  if (new Set(nodes.map(node => node.id)).size !== nodes.length) throw Error('分析节点 ID 重复。');
  if (nodes.some(node => node.filter?.values.some(value => isMissing(value, missingCodes)))) throw Error('缺失值不能作为分支纳入类别，请核对计划的筛选值与缺失代码。');
  return { schema: ANALYSIS_PLAN_VERSION, title: text(plan.title, 160, '计划名称'), template, nodes, source, missingCodes };
}
/** Portable settings only: exact schemas reject raw rows, imported results and approvals. */
export function serializePlan(plan: AnalysisPlan): string {
  const result = JSON.stringify(parsePlan(plan), null, 2);
  if (new TextEncoder().encode(result).length > PLAN_LIMITS.bytes) throw Error('分析计划超过 100 KB，请减少文字或筛选类别。');
  return result;
}
export function restorePlan(raw: string, source: PlanSource, missingCodes: string[]): AnalysisPlan {
  if (new TextEncoder().encode(raw).length > PLAN_LIMITS.bytes) throw Error('分析计划超过 100 KB，未读取。');
  let value: unknown;
  try { value = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { throw Error('分析计划 JSON 无法解析，请选择完整的计划文件。'); }
  rejectDuplicateMembers(raw);
  const plan = parsePlan(value);
  const currentSource = parseSource(source);
  if (canonical(plan.source.expectedMapping) !== canonical(currentSource.expectedMapping)) throw Error('问卷版本、题目对应或跳题策略与计划不一致；请先恢复并确认原问卷对应和处理策略，再载入计划。现有计划未被替换。');
  if (canonical(plan.source) !== canonical(currentSource)) throw Error('数据文件、列名或解析设置与计划不一致；请先选择原 CSV 及原编码、分隔符，再载入计划。现有计划未被替换。');
  if (canonical([...plan.missingCodes].sort()) !== canonical(parseMissing(missingCodes).sort())) throw Error('缺失代码与计划不一致；请先在数据检查中恢复原缺失代码，再载入计划。现有计划未被替换。');
  // Guarantee an accepted compact import can also be saved in our readable format.
  serializePlan(plan);
  return plan;
}

/** Validate against the full source table before intersecting with linked-question eligibility. */
export function filterPlanSample(table: SurveyTable, filter: PlanFilter | null, missingCodes: string[]): { table: SurveyTable; evidence: PlanFilterEvidence } {
  const checked = parseFilter(filter, table.headers.length), totalRows = table.rows.length;
  parseMissing(missingCodes);
  if (!checked) return { table, evidence: { totalRows, branchRows: totalRows, excludedRows: 0, missingRows: 0, filterColumn: null, values: [] } };
  if (checked.column === null || !checked.values.length) throw Error('请为这个分支选择筛选变量和至少一个有效类别；未按全样本计算。');
  // The shared identifier heuristic examines headers only; avoid sorting unrelated data columns.
  if (profileSurvey({ ...table, rows: [] }, missingCodes).columns[checked.column].likelyIdentifier) throw Error('疑似标识列不能用于样本筛选，请先完成去标识审查。');
  if (checked.values.some(value => isMissing(value, missingCodes))) throw Error('缺失值不能作为分支纳入类别；请核对缺失代码或选择其他类别。');
  const available = new Set(table.rows.filter(row => !isMissing(row[checked.column!], missingCodes)).map(row => row[checked.column!].trim()));
  if (available.size > PLAN_LIMITS.filterValues) throw Error('筛选列超过 50 个类别，请先按研究依据编码为分类变量。');
  if (checked.values.some(value => !available.has(value))) throw Error('筛选类别不在当前原始数据中，请重新选择。');
  const selected = new Set(checked.values), rows = table.rows.filter(row => !isMissing(row[checked.column!], missingCodes) && selected.has(row[checked.column!].trim()));
  const missingRows = table.rows.filter(row => isMissing(row[checked.column!], missingCodes)).length;
  return { table: { ...table, rows }, evidence: { totalRows, branchRows: rows.length, excludedRows: totalRows - rows.length, missingRows, filterColumn: checked.column, values: [...checked.values] } };
}

/** Presentation order, ID, branch label and research prose do not change computed numbers. */
export function planNodeSignature(node: PlanNode, contextKey: string, missingCodes: string[]): string {
  return canonical({ contextKey, missingCodes: [...missingCodes].sort(), method: node.method, x: node.x, y: node.y, filter: node.filter ? { column: node.filter.column, values: [...node.filter.values].sort() } : null, scale: node.scale ? { ...node.scale, reverse: [...node.scale.reverse].sort((a, b) => a - b) } : null });
}
export function planNodeRequest(node: PlanNode): AnalysisRequest {
  if (node.method === 'alpha') {
    if (!node.scale) throw Error('请填写量表设置。');
    return { method: 'alpha', columns: [...node.scale.columns], reverse: [...node.scale.reverse], min: node.scale.min, max: node.scale.max, construct: node.scale.construct };
  }
  return { method: node.method, columns: [node.x, ...(['frequency', 'numeric'].includes(node.method) ? [] : [node.y])].filter((value): value is number => value !== null) };
}
/** Caller has already applied branch/routing restrictions; no filtering is silently repeated here. */
export function runPlanNode(table: SurveyTable, rawNode: PlanNode, missingCodes: string[]): PlanResult {
  const node = parseNode(rawNode, table.headers.length);
  parseMissing(missingCodes);
  if (node.filter && (node.filter.column === null || !node.filter.values.length)) throw Error('请先完成分支筛选设置，未按全样本计算。');
  if (node.method !== 'alpha') return runRecipe(table, { ...node, method: node.method }, missingCodes);
  const scale = node.scale!;
  if (!scale.construct.trim()) throw Error('请填写这些量表题项共同测量的构念。');
  const profile = profileSurvey({ ...table, rows: [] }, missingCodes);
  if (scale.columns.some(index => profile.columns[index].likelyIdentifier)) throw Error('疑似标识列不参与量表分析，请先完成去标识审查。');
  const reliability = analyzeReliability(table, { ...scale, missingCodes });
  return {
    method: 'alpha', n: reliability.n, total: reliability.total, excluded: reliability.excluded, missingRows: reliability.missingRows, invalidRows: reliability.nonNumericRows,
    metrics: [{ label: 'Cronbach α', value: reliability.alpha }, { label: '题项数', value: reliability.k }],
    headers: ['题项', '反向计分', '均值', '样本标准差', '校正题总相关', '删除后 α'],
    rows: reliability.items.map(item => [item.name, item.reversed ? '是' : '否', item.mean, item.sd, item.correctedItemTotal, item.alphaIfDeleted]),
    warnings: [...reliability.warnings, `超出计分范围 ${reliability.outOfRangeRows} 行；与缺失、非数值原因可能重叠，不相加。`, '使用完整案例；未加权、未自动去重、未插补。'],
    interpretation: '原始 Cronbach α 描述所选题项在当前完整案例中的内部一致性。反向题先按下限 + 上限 − 原值计分；α 不证明单维性或效度。', reliability,
  };
}
export function exportPlanResult(result: PlanResult): PlanResult {
  if (result.method !== 'alpha') return exportRecipeResult({ ...result, method: result.method });
  // Contains item names and aggregate diagnostics only; never row-level responses.
  return structuredClone(result);
}
