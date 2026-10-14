import type { ReportSection } from './editor-model.ts';
import { parseBoundDraft, parseQuestionnaire, type DesignQuestion, type Questionnaire } from './questionnaire.ts';
import { parseSurveyCsv, SURVEY_LIMITS } from './survey-analysis.ts';

export type SurveyRelease = { id: string; projectId: string; versionId: string; questionnaireRevision: number; revision: number; status: 'open' | 'closed'; token: string; title: string; classification: 'actual' | 'synthetic'; responseCount: number; responseBytes: number; limits: { responses: 5000; answerBytes: 2097152 }; createdAt: string; closedAt: string | null };
export type PublicQuestion = Pick<DesignQuestion, 'id' | 'text' | 'type' | 'required' | 'choices' | 'min' | 'max' | 'minLabel' | 'maxLabel' | 'condition'>;
export type PublicSurvey = { id: string; status: 'open' | 'closed'; title: string; introduction: string; classification: 'actual' | 'synthetic'; questions: PublicQuestion[] };
export type SurveyReceipt = { id: string; releaseId: string; submittedAt: string; classification: 'actual' | 'synthetic' };
export type SurveyDataset = { schema: 'survey-dataset/v1'; release: SurveyRelease; design: Questionnaire; rowCount: number; sha256: string; generatedAt: string; columns: { column: string; questionId: string | null; kind: 'metadata' | 'answer' | 'visibility' }[]; csv: string; downloadCsv: string };
export type SurveyDraft = Record<string, string | string[]>;
export type SurveyAnswers = Record<string, string | number | string[] | null>;
export type SurveySubmission = { idempotencyKey: string; answers: SurveyAnswers };
export type CollectionOrigin = { kind: 'collection'; projectId: string; releaseId: string; versionId: string; questionnaireRevision: number; classification: 'actual' | 'synthetic'; snapshotHash: string; generatedAt: string; design: Questionnaire };
/** Rows kept after registered quality rules; classification is inherited from the parent data. */
export type QualityOrigin = { kind: 'quality'; parentName: string; parentHash: string; simulated: boolean; silicon: boolean; removed: number; ledgerHash: string; rules: string[]; collection?: CollectionOrigin };
/** Omitted origin is supported only for the existing silicon lab handoff. */
export type DatasetTransfer = { id: string; name: string; csv: string; origin?: CollectionOrigin | QualityOrigin | { kind: 'silicon' } };
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function object(value: unknown, keys: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw Error('调查回执格式无效。');
  const row = value as Record<string, unknown>;
  if (keys.some(key => !Object.hasOwn(row, key)) || Object.keys(row).some(key => !keys.includes(key) && !optional.includes(key))) throw Error('调查回执字段不完整。');
  return row;
}
function text(value: unknown, max: number): string { if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw Error('调查回执文字无效。'); return value; }
function uuid(value: unknown): string { const id = text(value, 36); if (!uuidPattern.test(id)) throw Error('调查标识无效。'); return id; }
function integer(value: unknown, min: number, max: number): number { if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw Error('调查回执数值无效。'); return value as number; }
function date(value: unknown): string { const result = text(value, 64); if (!/^\d{4}-\d\d-\d\dT/.test(result) || !Number.isFinite(Date.parse(result))) throw Error('调查回执时间无效。'); return result; }
function status(value: unknown): SurveyRelease['status'] { if (value !== 'open' && value !== 'closed') throw Error('调查状态无效。'); return value; }
function classification(value: unknown): SurveyRelease['classification'] { if (value !== 'actual' && value !== 'synthetic') throw Error('调查来源分类无效。'); return value; }
export function parseSurveyRelease(value: unknown): SurveyRelease {
  const x = object(value, ['id', 'projectId', 'versionId', 'questionnaireRevision', 'revision', 'status', 'token', 'title', 'classification', 'responseCount', 'responseBytes', 'limits', 'createdAt', 'closedAt']);
  const token = text(x.token, 43); if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error('调查链接无效。');
  const limits = object(x.limits, ['responses', 'answerBytes']); if (limits.responses !== 5000 || limits.answerBytes !== 2097152) throw Error('调查容量配置不支持。');
  const result: SurveyRelease = { id: uuid(x.id), projectId: uuid(x.projectId), versionId: uuid(x.versionId), questionnaireRevision: integer(x.questionnaireRevision, 1, 1e9), revision: integer(x.revision, 1, 1e9), status: status(x.status), token, title: text(x.title, 160), classification: classification(x.classification), responseCount: integer(x.responseCount, 0, 5000), responseBytes: integer(x.responseBytes, 0, 2097152), limits: { responses: 5000, answerBytes: 2097152 }, createdAt: date(x.createdAt), closedAt: x.closedAt === null ? null : date(x.closedAt) };
  if ((result.status === 'closed') !== (result.closedAt !== null)) throw Error('调查结束状态与时间不一致。');
  return result;
}
export function parseSurveyList(value: unknown): SurveyRelease[] { const x = object(value, ['surveys']); if (!Array.isArray(x.surveys) || x.surveys.length > 50) throw Error('调查列表无效。'); const rows = x.surveys.map(parseSurveyRelease); if (new Set(rows.map(r => r.id)).size !== rows.length) throw Error('调查列表有重复记录。'); return rows; }
export function parsePublicSurvey(value: unknown): PublicSurvey {
  const x = object(value, ['id', 'status', 'title', 'introduction', 'classification', 'questions']);
  if (!Array.isArray(x.questions) || !x.questions.length || x.questions.length > 80) throw Error('问卷题目数量无效。');
  const seen = new Map<string, PublicQuestion>();
  const questions = x.questions.map(raw => {
    const q = object(raw, ['id', 'text', 'type', 'required', 'choices', 'min', 'max', 'minLabel', 'maxLabel', 'condition']);
    const id = text(q.id, 64); if (!/^[A-Za-z0-9_-]+$/.test(id) || seen.has(id)) throw Error('问卷题目标识无效。');
    if (!['single', 'multi', 'likert', 'number', 'text'].includes(q.type as string) || typeof q.required !== 'boolean' || !Array.isArray(q.choices) || q.choices.length > 30) throw Error('问卷题型无效。');
    const choices = q.choices.map(rawChoice => { const c = object(rawChoice, ['code', 'label']); const code = text(c.code, 16); if (['single', 'multi'].includes(q.type as string) && !/^[A-Za-z0-9_-]+$/.test(code)) throw Error('问卷选项编码无效。'); return { code, label: text(c.label, 300) }; });
    if (['single', 'multi'].includes(q.type as string) && (new Set(choices.map(c => c.code)).size !== choices.length || choices.length < 2)) throw Error('问卷选项无效。');
    for (const bound of [q.min, q.max]) if (bound !== null && (typeof bound !== 'number' || !Number.isFinite(bound) || Math.abs(bound) > 1e9)) throw Error('问卷数值范围无效。');
    if (q.type === 'likert' && (!Number.isInteger(q.min) || !Number.isInteger(q.max) || (q.max as number) <= (q.min as number) || (q.max as number) - (q.min as number) > 14)) throw Error('量表计分点无效。');
    let condition: PublicQuestion['condition'] = null;
    if (q.condition !== null) { const c = object(q.condition, ['questionId', 'codes']); const parent = seen.get(text(c.questionId, 64)); if (!parent || parent.type !== 'single' || !Array.isArray(c.codes) || !c.codes.length || c.codes.some(code => typeof code !== 'string' || !parent.choices.some(choice => choice.code === code)) || new Set(c.codes).size !== c.codes.length) throw Error('问卷分支无效。'); condition = { questionId: parent.id, codes: c.codes as string[] }; }
    const question: PublicQuestion = { id, text: text(q.text, 600), type: q.type as PublicQuestion['type'], required: q.required, choices, min: q.min as number | null, max: q.max as number | null, minLabel: text(q.minLabel, 120), maxLabel: text(q.maxLabel, 120), condition }; seen.set(id, question); return question;
  });
  return { id: uuid(x.id), status: status(x.status), title: text(x.title, 160), introduction: text(x.introduction, 2000), classification: classification(x.classification), questions };
}
export function parseSurveyReceipt(value: unknown, releaseId: string): SurveyReceipt { const x = object(value, ['id', 'releaseId', 'submittedAt', 'classification']); const result = { id: uuid(x.id), releaseId: uuid(x.releaseId), submittedAt: date(x.submittedAt), classification: classification(x.classification) }; if (result.releaseId !== releaseId) throw Error('回执不属于本份问卷。'); return result; }
export function shownSurveyQuestions(questions: PublicQuestion[], draft: SurveyDraft): PublicQuestion[] { const shown = new Set<string>(); return questions.filter(q => { if (q.condition && (!shown.has(q.condition.questionId) || typeof draft[q.condition.questionId] !== 'string' || !q.condition.codes.includes(draft[q.condition.questionId] as string))) return false; shown.add(q.id); return true; }); }
export function pruneSurveyDraft(questions: PublicQuestion[], draft: SurveyDraft): SurveyDraft { return Object.fromEntries(shownSurveyQuestions(questions, draft).filter(q => Object.hasOwn(draft, q.id)).map(q => [q.id, draft[q.id]])); }
export function validateSurveyDraft(questions: PublicQuestion[], draft: SurveyDraft): { answers: SurveyAnswers; errors: Record<string, string> } {
  const answers: SurveyAnswers = {}, errors: Record<string, string> = {};
  for (const q of shownSurveyQuestions(questions, draft)) {
    const value = draft[q.id];
    if (value === undefined || value === '' || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length)) { if (q.required) errors[q.id] = '请回答这道题。'; continue; }
    if (q.type === 'multi') { if (!Array.isArray(value) || new Set(value).size !== value.length || value.some(code => !q.choices.some(c => c.code === code))) errors[q.id] = '请选择题目中的有效选项。'; else answers[q.id] = q.choices.filter(c => value.includes(c.code)).map(c => c.code); }
    else if (typeof value !== 'string') errors[q.id] = '答案格式无效，请重新填写。';
    else if (q.type === 'single') { if (!q.choices.some(c => c.code === value)) errors[q.id] = '请选择一个有效选项。'; else answers[q.id] = value; }
    else if (q.type === 'number' || q.type === 'likert') { const parsed = parseBoundDraft(value), number = parsed.value; if (parsed.error || number === null || (q.type === 'likert' && !Number.isInteger(number)) || (q.min !== null && number < q.min) || (q.max !== null && number > q.max)) errors[q.id] = `请输入${q.type === 'likert' ? '整数' : '数值'}${q.min !== null || q.max !== null ? `（${q.min ?? '不限'} 至 ${q.max ?? '不限'}）` : ''}。`; else answers[q.id] = number; }
    else if (value.length > 2000) errors[q.id] = '请将回答控制在 2,000 字内。';
    else answers[q.id] = value;
  }
  return { answers, errors };
}
export function parseSurveyDataset(value: unknown, projectId: string, releaseId: string): SurveyDataset {
  const x = object(value, ['schema', 'release', 'design', 'rowCount', 'sha256', 'generatedAt', 'columns', 'csv', 'downloadCsv']);
  if (x.schema !== 'survey-dataset/v1') throw Error('答卷数据版本不支持。');
  const release = parseSurveyRelease(x.release), design = parseQuestionnaire(JSON.stringify(x.design));
  if (release.id !== releaseId || release.projectId !== projectId) throw Error('答卷不属于当前调查。');
  const sha256 = text(x.sha256, 64); if (!/^[a-f0-9]{64}$/.test(sha256)) throw Error('答卷快照指纹无效。');
  const rowCount = integer(x.rowCount, 0, 5000); if (rowCount !== release.responseCount || !Array.isArray(x.columns) || x.columns.length > 162) throw Error('答卷数量或变量字典无效。');
  const columns = x.columns.map(raw => { const c = object(raw, ['column', 'questionId', 'kind']); const questionId = c.questionId === null ? null : text(c.questionId, 64); if (!['metadata', 'answer', 'visibility'].includes(c.kind as string) || (questionId !== null && !design.questions.some(q => q.id === questionId))) throw Error('答卷变量字典无效。'); return { column: text(c.column, 160), questionId, kind: c.kind as SurveyDataset['columns'][number]['kind'] }; });
  if (new Set(columns.map(c => c.column)).size !== columns.length || design.questions.some(q => columns.filter(c => c.kind === 'answer' && c.questionId === q.id && c.column === q.variable).length !== 1)) throw Error('答卷与问卷变量未对齐。');
  return { schema: 'survey-dataset/v1', release, design, rowCount, sha256, generatedAt: date(x.generatedAt), columns, csv: text(x.csv, 16_000_000), downloadCsv: text(x.downloadCsv, 16_000_000) };
}
const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
/** Project only the original variables; raw exports keep response IDs, visibility and split choices. */
export function collectionAnalysisCsv(dataset: SurveyDataset): string {
  if (!dataset.rowCount) throw Error('目前还没有答卷。');
  const selected = dataset.design.questions.map(q => dataset.columns.findIndex(c => c.kind === 'answer' && c.questionId === q.id));
  if (selected.length > SURVEY_LIMITS.columns || selected.length * dataset.rowCount > SURVEY_LIMITS.cells) throw Error('本次答卷超过单次分析的 80 列或 200,000 单元格上限，请下载 CSV 分批分析。');
  const columns = new Set(selected), records: string[][] = []; let row: string[] = [], field = '', col = 0, quoted = false, closed = false;
  const finishField = () => { if (columns.has(col)) row.push(field); field = ''; col++; closed = false; };
  const finishRow = () => { finishField(); if (col !== dataset.columns.length) throw Error('答卷导出列数不一致。'); records.push(row); row = []; col = 0; if (records.length > dataset.rowCount + 1) throw Error('答卷数量与回执不一致。'); };
  const raw = dataset.csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < raw.length; i++) { const c = raw[i]; if (quoted) { if (c === '"') { if (raw[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += c; } else if (c === ',') finishField(); else if (c === '\r' || c === '\n') { finishRow(); if (c === '\r' && raw[i + 1] === '\n') i++; } else if (c === '"' && !field && !closed) quoted = true; else { if (closed || c === '"') throw Error('答卷 CSV 格式无效。'); field += c; } }
  if (quoted) throw Error('答卷 CSV 引号未闭合。'); if (col || field || closed) finishRow();
  if (records.length !== dataset.rowCount + 1 || records[0].join('\u0000') !== dataset.design.questions.map(q => q.variable).join('\u0000')) throw Error('答卷与冻结问卷不一致。');
  const csv = records.map(row => row.map(csvCell).join(',')).join('\r\n'); parseSurveyCsv(csv); return csv;
}
export function collectionTransfer(dataset: SurveyDataset, id: string): DatasetTransfer {
  return { id, name: `${dataset.release.title} · 回收 v${dataset.release.questionnaireRevision}`, csv: collectionAnalysisCsv(dataset), origin: { kind: 'collection', projectId: dataset.release.projectId, releaseId: dataset.release.id, versionId: dataset.release.versionId, questionnaireRevision: dataset.release.questionnaireRevision, classification: dataset.release.classification, snapshotHash: dataset.sha256, generatedAt: dataset.generatedAt, design: dataset.design } };
}
export function transferClassification(transfer: DatasetTransfer): { simulated: boolean; silicon: boolean } { return transfer.origin?.kind === 'collection' ? { simulated: transfer.origin.classification === 'synthetic', silicon: false } : transfer.origin?.kind === 'quality' ? { simulated: transfer.origin.simulated, silicon: transfer.origin.silicon } : { simulated: true, silicon: true }; }
export function collectionEvidenceSource(source: string, origin: CollectionOrigin): string {
  return `${source}\n回收项目：${origin.projectId}\n发布记录：${origin.releaseId}\n问卷版本：v${origin.questionnaireRevision} · ${origin.versionId}\n回收快照 SHA-256：${origin.snapshotHash}\n快照读取时间：${origin.generatedAt}\n来源分类：${origin.classification === 'synthetic' ? '合成验收' : '问卷回收'}`;
}

/** Quality-control lineage for any paragraph computed on QC-kept rows, hosted or local. */
export function qualityEvidenceSection(section: ReportSection, quality: QualityOrigin): ReportSection {
  const lines = section.body.split('\n').filter(line => !line.startsWith('质控来源：'));
  lines.push(`质控来源：自「${quality.parentName}」剔除 ${quality.removed} 行；规则：${quality.rules.join('；')}；剔除台账 SHA-256 ${quality.ledgerHash}。`);
  return { ...section, body: lines.join('\n'), source: `${section.source}\n质控前数据 SHA-256：${quality.parentHash}\n剔除台账 SHA-256：${quality.ledgerHash}` };
}

/** Hosted collection provenance replaces the local-file wording, without changing numerical results. */
export function collectionEvidenceSection(section: ReportSection, origin: CollectionOrigin): ReportSection {
  const lines = section.body.split('\n').filter(line => !/^(核验边界：|问卷关联：)/.test(line));
  lines.push(`问卷关联：发布 v${origin.questionnaireRevision} 的冻结题目版本；计算使用本次回收快照。`);
  return { ...section, body: lines.join('\n'), source: collectionEvidenceSource(`${section.source}\n计算位置：浏览器；数值程序结果，服务器尚未独立复算。`, origin) };
}
