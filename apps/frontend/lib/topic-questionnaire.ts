/** Deterministic, proposed design transfer. Never creates survey items or certifies source facts.
 * The binding is a separate append-only relation, never JSON hidden in a questionnaire text field.
 * A caller must commit design + binding together and recheck its edit epoch after awaited calls.
 */
import { parseQuestionnaire, rejectDuplicateMembers, type Questionnaire } from './questionnaire.ts';
import { parseTopicResearchBrief, parseTopicVersionSummary, type TopicResearchBrief, type TopicVersionSummary } from './topic-project.ts';
import { topicTransferHash } from '../../../packages/evi-x-shared/src/topic-transfer.ts';

export const TOPIC_QUESTIONNAIRE_SCHEMA = 'topic-questionnaire-binding/v1' as const;
export type TopicQuestionnaireSource = { brief: TopicResearchBrief; version: TopicVersionSummary; dirty: boolean; decisionRevision: number };
/** versionId/revision identify the saved base. contentHash below identifies the actual editable draft. */
export type TopicQuestionnaireTarget = { design: Questionnaire; pending: boolean; versionId: string | null; revision: number };
export type TopicQuestionnaireReference = { baseVersionId: string | null; baseRevision: number; contentHash: string };
export type TopicQuestionnaireMapping = { questionId: string; researchQuestionIds: string[]; constructIds: string[] };
export type TopicQuestionnaireBriefField = 'title' | 'objective' | 'population' | 'geography' | 'pilotNotes';
export type TopicQuestionnaireQuestionField = 'researchQuestion' | 'construct';
export type TopicQuestionnaireChange = {
  id: string; kind: 'brief' | 'question'; field: TopicQuestionnaireBriefField | TopicQuestionnaireQuestionField;
  questionId: string | null; label: string; before: string; after: string; max: number;
  issues: Array<{ code: 'length' | 'empty_source'; message: string; actual: number; max: number }>;
  researchQuestionIds: string[]; constructIds: string[];
};
export type TopicQuestionnaireSourceSnapshot = { version: TopicVersionSummary; briefHash: string; brief: TopicResearchBrief };
export type TopicQuestionnaireAdoption = {
  proposalId: string; sourceVersionId: string; sourceContentHash: string; sourceBriefHash: string;
  before: TopicQuestionnaireReference; after: TopicQuestionnaireReference;
  changes: Array<{ id: string; kind: 'brief' | 'question'; field: TopicQuestionnaireChange['field']; questionId: string | null; researchQuestionIds: string[]; constructIds: string[] }>;
};
export type TopicQuestionnaireBinding = {
  schema: typeof TOPIC_QUESTIONNAIRE_SCHEMA; classification: 'proposed';
  sources: TopicQuestionnaireSourceSnapshot[]; applications: TopicQuestionnaireAdoption[];
};
export type TopicQuestionnaireProposal = {
  schema: 'topic-questionnaire-proposal/v1'; classification: 'proposed'; id: string;
  source: { version: TopicVersionSummary; briefHash: string; fingerprint: string };
  target: TopicQuestionnaireReference & { fingerprint: string };
  bindingFingerprint: string | null; mappings: TopicQuestionnaireMapping[]; fields: TopicQuestionnaireChange[];
};
export type TopicQuestionnaireApplication = {
  before: Questionnaire; after: Questionnaire; beforeBinding: TopicQuestionnaireBinding | null;
  binding: TopicQuestionnaireBinding; provenance: TopicQuestionnaireAdoption; mappings: TopicQuestionnaireMapping[];
};

const BRIEF_FIELDS = ['title', 'objective', 'population', 'geography', 'pilotNotes'] as const;
const QUESTION_FIELDS = ['researchQuestion', 'construct'] as const;
const fail = (message: string): never => { throw new Error(`选题与问卷：${message}`); };

/** Bounded JSON snapshot; reject accessors/symbols/holes rather than executing caller code. */
function canonical(value: unknown): string {
  let nodes = 0;
  function encode(v: unknown, depth: number): string {
    if (++nodes > 160000 || depth > 16) return fail('输入结构超出范围。');
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
    if (!v || typeof v !== 'object' || Object.getOwnPropertySymbols(v).length) return fail('只接受普通 JSON 数据。');
    if (Array.isArray(v)) {
      if (v.length > 10000 || Object.getOwnPropertyNames(v).length !== v.length + 1) return fail('列表包含空项或额外字段。');
      return '[' + Array.from({ length: v.length }, (_, i) => {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) return fail('列表包含空项或访问器。');
        return encode(d.value, depth + 1);
      }).join(',') + ']';
    }
    if (Object.getPrototypeOf(v) !== Object.prototype) return fail('只接受普通对象。');
    return '{' + Object.getOwnPropertyNames(v).sort().map(k => {
      const d = Object.getOwnPropertyDescriptor(v, k)!;
      if (!d.enumerable || !Object.hasOwn(d, 'value') || ['__proto__', 'prototype', 'constructor'].includes(k)) return fail('对象包含隐藏、访问器或特殊字段。');
      return JSON.stringify(k) + ':' + encode(d.value, depth + 1);
    }).join(',') + '}';
  }
  const result = encode(value, 0);
  if (new TextEncoder().encode(result).length > 2_000_000) fail('输入超过 2 MB，请分开保存历史关联。');
  return result;
}
function copy(value: unknown): unknown { return JSON.parse(canonical(value)); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail('对象格式无效。');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail('字段缺失或包含未知字段。');
  return v;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return fail('文字无效或过长。');
  return value;
}
function id(value: unknown): string {
  const v = text(value, 100);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(v) || ['__proto__', 'prototype', 'constructor'].includes(v)) fail('标识无效。');
  return v;
}
function questionId(value: unknown): string {
  const v = text(value, 64); if (!/^[A-Za-z0-9_-]+$/.test(v)) fail('问卷题目标识无效。'); return v;
}
function hash(value: unknown): string { const v = text(value, 64); if (!/^[a-f0-9]{64}$/.test(v)) fail('SHA-256 指纹无效。'); return v; }
function integer(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) return fail('版本号无效。'); return value as number; }
function list<T>(value: unknown, max: number, parser: (v: unknown) => T): T[] { if (!Array.isArray(value) || value.length > max) return fail(`列表不能超过 ${max} 项。`); return value.map(parser); }
function unique<T>(values: T[], key: (v: T) => string): T[] { if (new Set(values.map(key)).size !== values.length) fail('标识或关联重复。'); return values; }
function ids(value: unknown, max: number): string[] { return unique(list(value, max, id), v => v); }
function reference(value: unknown): TopicQuestionnaireReference {
  const v = object(value, ['baseVersionId', 'baseRevision', 'contentHash']);
  const baseVersionId = v.baseVersionId === null ? null : id(v.baseVersionId), baseRevision = integer(v.baseRevision);
  if ((baseVersionId === null) !== (baseRevision === 0)) fail('问卷保存版本引用不完整。');
  return { baseVersionId, baseRevision, contentHash: hash(v.contentHash) };
}
function safeSource(raw: TopicQuestionnaireSource): TopicQuestionnaireSource {
  const v = object(copy(raw), ['brief', 'version', 'dirty', 'decisionRevision']);
  if (typeof v.dirty !== 'boolean') fail('选题未保存状态无效。');
  if (v.dirty) fail('当前选题有未保存修改，请先保存，再重新预览。');
  const decisionRevision = integer(v.decisionRevision);
  if (decisionRevision < 1) fail('请先确认当前研究简报版本。');
  return { brief: parseTopicResearchBrief(v.brief), version: parseTopicVersionSummary(v.version), dirty: false, decisionRevision };
}
function safeTarget(raw: TopicQuestionnaireTarget): TopicQuestionnaireTarget {
  const v = object(copy(raw), ['design', 'pending', 'versionId', 'revision']);
  if (typeof v.pending !== 'boolean') fail('问卷暂存状态无效。');
  if (v.pending) fail('问卷仍有未完成输入，请处理后重新预览。');
  const versionId = v.versionId === null ? null : id(v.versionId), revision = integer(v.revision);
  if ((versionId === null) !== (revision === 0)) fail('问卷保存版本引用不完整。');
  return { design: parseQuestionnaire(canonical(v.design)), pending: false, versionId, revision };
}
function mapping(raw: unknown): TopicQuestionnaireMapping {
  const v = object(raw, ['questionId', 'researchQuestionIds', 'constructIds']);
  const result = { questionId: questionId(v.questionId), researchQuestionIds: ids(v.researchQuestionIds, 12), constructIds: ids(v.constructIds, 20) };
  if (!result.researchQuestionIds.length && !result.constructIds.length) fail('题目关联至少选择一个研究问题或概念。');
  return result;
}
function checkMapping(m: TopicQuestionnaireMapping, brief: TopicResearchBrief, design?: Questionnaire): void {
  if (design && !design.questions.some(q => q.id === m.questionId)) fail(`题目 ${m.questionId} 已删除或不存在。`);
  if (m.researchQuestionIds.some(r => !brief.questions.some(q => q.id === r)) || m.constructIds.some(c => !brief.constructs.some(q => q.id === c))) fail('关联的研究问题或概念已删除或不存在。');
  if (m.constructIds.some(c => brief.constructs.find(q => q.id === c)!.questionIds.some(r => !m.researchQuestionIds.includes(r)))) fail('请同时选择概念所关联的全部研究问题，未自动补选。');
}
export async function topicQuestionnaireHash(value: unknown): Promise<string> {
  return topicTransferHash(value);
}

/** Strict shape and foreign-key validation. Hash/content agreement is checked by verify below. */
export function parseTopicQuestionnaireBinding(raw: unknown): TopicQuestionnaireBinding {
  let input = raw;
  if (typeof raw === 'string') { if (new TextEncoder().encode(raw).length > 2_000_000) fail('关联备份超过 2 MB。'); input = JSON.parse(raw); rejectDuplicateMembers(raw); }
  const v = object(copy(input), ['schema', 'classification', 'sources', 'applications']);
  if (v.schema !== TOPIC_QUESTIONNAIRE_SCHEMA || v.classification !== 'proposed') fail('关联版本或分类不支持。');
  const sources = unique(list(v.sources, 80, rawSource => {
    const s = object(rawSource, ['version', 'briefHash', 'brief']);
    return { version: parseTopicVersionSummary(s.version), briefHash: hash(s.briefHash), brief: parseTopicResearchBrief(s.brief) };
  }), s => s.version.id);
  const applications = unique(list(v.applications, 400, rawApplication => {
    const a = object(rawApplication, ['proposalId', 'sourceVersionId', 'sourceContentHash', 'sourceBriefHash', 'before', 'after', 'changes']);
    const sourceVersionId = id(a.sourceVersionId), sourceContentHash = hash(a.sourceContentHash), sourceBriefHash = hash(a.sourceBriefHash);
    const s = sources.find(s => s.version.id === sourceVersionId && s.version.contentHash === sourceContentHash && s.briefHash === sourceBriefHash);
    if (!s) return fail('历史关联引用的精确选题版本不存在。');
    const changes = unique(list(a.changes, 165, rawChange => {
      const c = object(rawChange, ['id', 'kind', 'field', 'questionId', 'researchQuestionIds', 'constructIds']);
      const researchQuestionIds = ids(c.researchQuestionIds, 12), constructIds = ids(c.constructIds, 20);
      if (c.kind === 'brief') {
        if (typeof c.field !== 'string' || !BRIEF_FIELDS.includes(c.field as TopicQuestionnaireBriefField) || c.questionId !== null || researchQuestionIds.length || constructIds.length || c.id !== `brief:${c.field}`) return fail('简介关联无效。');
        return { id: c.id as string, kind: 'brief' as const, field: c.field as TopicQuestionnaireBriefField, questionId: null, researchQuestionIds, constructIds };
      }
      if (c.kind !== 'question' || typeof c.field !== 'string' || !QUESTION_FIELDS.includes(c.field as TopicQuestionnaireQuestionField)) return fail('题目关联无效。');
      const qid = questionId(c.questionId);
      if (c.id !== `question:${qid}:${c.field}` || c.field === 'researchQuestion' && (!researchQuestionIds.length || constructIds.length) || c.field === 'construct' && !constructIds.length) return fail('题目关联字段无效。');
      checkMapping({ questionId: qid, researchQuestionIds, constructIds }, s.brief);
      return { id: c.id as string, kind: 'question' as const, field: c.field as TopicQuestionnaireQuestionField, questionId: qid, researchQuestionIds, constructIds };
    }), c => c.id);
    if (!changes.length) fail('历史采纳不能为空。');
    return { proposalId: hash(a.proposalId), sourceVersionId, sourceContentHash, sourceBriefHash, before: reference(a.before), after: reference(a.after), changes };
  }), a => a.proposalId);
  return { schema: TOPIC_QUESTIONNAIRE_SCHEMA, classification: 'proposed', sources, applications };
}
export async function verifyTopicQuestionnaireBinding(raw: unknown): Promise<TopicQuestionnaireBinding> {
  const binding = parseTopicQuestionnaireBinding(raw);
  for (const source of binding.sources) if (source.briefHash !== await topicQuestionnaireHash(source.brief)) fail('历史研究简报与指纹不符。');
  return binding;
}
function change(kind: 'brief' | 'question', field: TopicQuestionnaireChange['field'], questionId: string | null, label: string, before: string, after: string, max: number, researchQuestionIds: string[] = [], constructIds: string[] = [], blankSourceIds: string[] = []): TopicQuestionnaireChange {
  const issues: TopicQuestionnaireChange['issues'] = [];
  if (after.length > max) issues.push({ code: 'length', actual: after.length, max, message: `${label}为 ${after.length} 字符，超过问卷字段 ${max} 字符上限；未截断。请缩短选题原文或取消此项。` });
  if (blankSourceIds.length) issues.push({ code: 'empty_source', actual: after.length, max, message: `${label}选中的来源 ${blankSourceIds.join('、')} 文字为空或仅含空白；请补充选题原文，或取消这些来源关联后重新预览。未清空现有问卷字段。` });
  return { id: kind === 'brief' ? `brief:${field}` : `question:${questionId}:${field}`, kind, field, questionId, label, before, after, max,
    issues, researchQuestionIds, constructIds };
}

/** All suggestions are exact supplied text plus labels. Empty source fields never clear existing work. */
export async function prepareTopicQuestionnaire(sourceInput: TopicQuestionnaireSource, targetInput: TopicQuestionnaireTarget, mappingsInput: readonly TopicQuestionnaireMapping[] = [], bindingInput: TopicQuestionnaireBinding | null = null): Promise<TopicQuestionnaireProposal> {
  const source = safeSource(sourceInput), target = safeTarget(targetInput);
  const mappings = unique(list(copy(mappingsInput), 80, mapping), m => m.questionId);
  for (const m of mappings) checkMapping(m, source.brief, target.design);
  const binding = bindingInput === null ? null : await verifyTopicQuestionnaireBinding(bindingInput);
  const b = source.brief, d = target.design;
  const candidates: Array<[TopicQuestionnaireBriefField, string, string, number]> = [
    ['title', '问卷名称', b.title, 160],
    ['objective', '决策目标', [b.decisionOwner.trim() ? `决策主体：${b.decisionOwner}` : '', b.decision.trim() ? `决策问题：${b.decision}` : ''].filter(Boolean).join('\n'), 600],
    ['population', '调查对象与纳入条件', [b.population, b.inclusion.trim() ? `纳入：${b.inclusion}` : '', b.exclusion.trim() ? `排除：${b.exclusion}` : ''].filter(s => s.trim()).join('\n'), 160],
    ['geography', '地理范围', b.geography, 160],
    ['pilotNotes', '待实施的证据与验证计划', [b.evidencePlan.trim() ? `拟议证据计划：${b.evidencePlan}` : '', b.firstWeekPlan.length ? `拟议首周计划：\n${b.firstWeekPlan.join('\n')}` : ''].filter(Boolean).join('\n'), 2000],
  ];
  const fields = candidates.filter(([key, , value]) => value.trim() && value !== d[key]).map(([key, label, value, max]) => change('brief', key, null, label, d[key], value, max));
  for (const m of mappings) {
    const q = d.questions.find(q => q.id === m.questionId)!;
    const selectedQuestions = m.researchQuestionIds.map(id => b.questions.find(r => r.id === id)!);
    const selectedConstructs = m.constructIds.map(id => b.constructs.find(c => c.id === id)!);
    if (selectedQuestions.length) fields.push(change('question', 'researchQuestion', q.id, `${q.variable || q.id} 的研究问题`, q.researchQuestion, selectedQuestions.map(r => r.text).join('\n'), 500, [...m.researchQuestionIds], [], selectedQuestions.filter(r => !r.text.trim()).map(r => r.id)));
    if (selectedConstructs.length) fields.push(change('question', 'construct', q.id, `${q.variable || q.id} 的概念`, q.construct, selectedConstructs.map(c => c.name).join('\n'), 120, [...m.researchQuestionIds], [...m.constructIds], selectedConstructs.filter(c => !c.name.trim()).map(c => c.id)));
  }
  const [briefHash, sourceFingerprint, targetFingerprint, contentHash, bindingFingerprint] = await Promise.all([
    topicQuestionnaireHash(b), topicQuestionnaireHash(source), topicQuestionnaireHash(target), topicQuestionnaireHash(d), binding === null ? null : topicQuestionnaireHash(binding),
  ]);
  const proposalId = await topicQuestionnaireHash({ sourceFingerprint, targetFingerprint, bindingFingerprint, mappings });
  return { schema: 'topic-questionnaire-proposal/v1', classification: 'proposed', id: proposalId,
    source: { version: source.version, briefHash, fingerprint: sourceFingerprint },
    target: { baseVersionId: target.versionId, baseRevision: target.revision, contentHash, fingerprint: targetFingerprint }, bindingFingerprint, mappings, fields };
}
async function currentProposal(proposal: TopicQuestionnaireProposal, source: TopicQuestionnaireSource, target: TopicQuestionnaireTarget, binding: TopicQuestionnaireBinding | null): Promise<TopicQuestionnaireProposal> {
  const safe = copy(proposal) as TopicQuestionnaireProposal;
  const expected = await prepareTopicQuestionnaire(source, target, safe.mappings, binding);
  if (canonical(safe) !== canonical(expected)) fail('选题版本、问卷、关联记录或提案已变化，请重新预览；未应用任何修改。');
  return expected;
}

export async function applyTopicQuestionnaire(proposal: TopicQuestionnaireProposal, sourceInput: TopicQuestionnaireSource, targetInput: TopicQuestionnaireTarget, selectedChangeIds: readonly string[], bindingInput: TopicQuestionnaireBinding | null = null): Promise<TopicQuestionnaireApplication> {
  const source = safeSource(sourceInput), target = safeTarget(targetInput);
  const proposalSnapshot = copy(proposal) as TopicQuestionnaireProposal;
  const selection = unique(list(copy(selectedChangeIds), 165, v => text(v, 120)), v => v);
  const beforeBinding = bindingInput === null ? null : await verifyTopicQuestionnaireBinding(bindingInput);
  const expected = await currentProposal(proposalSnapshot, source, target, beforeBinding);
  if (!selection.length || selection.some(id => !expected.fields.some(f => f.id === id))) fail('请选择不重复的有效修改项。');
  const chosen = expected.fields.filter(f => selection.includes(f.id));
  for (const f of chosen) if (f.issues.length) fail(f.issues.map(i => i.message).join('\n'));
  const before = parseQuestionnaire(canonical(target.design)), next = parseQuestionnaire(canonical(before));
  for (const f of chosen) {
    if (f.kind === 'brief') next[f.field as TopicQuestionnaireBriefField] = f.after;
    else next.questions.find(q => q.id === f.questionId)![f.field as TopicQuestionnaireQuestionField] = f.after;
  }
  const after = parseQuestionnaire(canonical(next));
  const provenance: TopicQuestionnaireAdoption = { proposalId: expected.id, sourceVersionId: source.version.id, sourceContentHash: source.version.contentHash, sourceBriefHash: expected.source.briefHash,
    before: { baseVersionId: target.versionId, baseRevision: target.revision, contentHash: expected.target.contentHash },
    after: { baseVersionId: target.versionId, baseRevision: target.revision, contentHash: await topicQuestionnaireHash(after) },
    changes: chosen.map(({ id, kind, field, questionId, researchQuestionIds, constructIds }) => ({ id, kind, field, questionId, researchQuestionIds, constructIds })) };
  const previous = beforeBinding ?? { schema: TOPIC_QUESTIONNAIRE_SCHEMA, classification: 'proposed' as const, sources: [], applications: [] };
  if (previous.applications.some(a => a.proposalId === expected.id)) fail('本提案已采纳，未重复应用。');
  const existing = previous.sources.find(s => s.version.id === source.version.id);
  const snapshot = { version: source.version, briefHash: expected.source.briefHash, brief: source.brief };
  if (existing && canonical(existing) !== canonical(snapshot)) fail('同一选题版本出现不同内容，请核对来源，未覆盖历史记录。');
  const binding = parseTopicQuestionnaireBinding({ ...previous, sources: existing ? previous.sources : [...previous.sources, snapshot], applications: [...previous.applications, provenance] });
  // Inputs are caller-owned; mutation during hashing must not produce a late overwrite.
  if (canonical(safeSource(sourceInput)) !== canonical(source) || canonical(safeTarget(targetInput)) !== canonical(target) || canonical(bindingInput === null ? null : parseTopicQuestionnaireBinding(bindingInput)) !== canonical(beforeBinding)) fail('等待期间输入发生变化，请重新预览。');
  return { before, after, beforeBinding, binding, provenance, mappings: expected.mappings };
}

/** Rejecting a current proposal is a local acknowledgement only; it never mutates either input. */
export async function rejectTopicQuestionnaire(proposal: TopicQuestionnaireProposal, sourceInput: TopicQuestionnaireSource, targetInput: TopicQuestionnaireTarget, bindingInput: TopicQuestionnaireBinding | null = null): Promise<{ proposalId: string; status: 'rejected'; sourceVersionId: string; targetFingerprint: string }> {
  const source = safeSource(sourceInput), target = safeTarget(targetInput);
  const proposalSnapshot = copy(proposal) as TopicQuestionnaireProposal;
  const binding = bindingInput === null ? null : await verifyTopicQuestionnaireBinding(bindingInput);
  const expected = await currentProposal(proposalSnapshot, source, target, binding);
  if (canonical(safeSource(sourceInput)) !== canonical(source) || canonical(safeTarget(targetInput)) !== canonical(target) || canonical(bindingInput === null ? null : parseTopicQuestionnaireBinding(bindingInput)) !== canonical(binding)) fail('等待期间输入发生变化，请重新预览。');
  return { proposalId: expected.id, status: 'rejected', sourceVersionId: expected.source.version.id, targetFingerprint: expected.target.fingerprint };
}
