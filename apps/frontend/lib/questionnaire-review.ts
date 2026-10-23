/** Reproducible design checks, not a human review, fieldwork evidence or competition Gate. */
import { questionnaireIssues, type DesignIssue } from './questionnaire.ts';
import { parseQuestionnaireLibraryContent } from './questionnaire-library.ts';
import {isQuestionnaireTimestamp,questionnaireContentSha256} from './questionnaire-version.ts';

// Increment whenever questionnaireIssues or this projection changes its output.
export const QUESTIONNAIRE_REVIEW_ENGINE = 'questionnaire-structure/1' as const;
export type QuestionnaireReviewFinding = DesignIssue & { id: string; questionNumber: number | null; variable: string | null };
export type QuestionnaireReviewResult = {
  schema: 'questionnaire-review-result/v1'; engine: typeof QUESTIONNAIRE_REVIEW_ENGINE;
  classification: 'automated_design_check'; status: 'structure_changes_needed' | 'human_review_required';
  summary: { questions: number; blockers: number; reviews: number };
  findings: QuestionnaireReviewFinding[];
  humanChecks: { id: string; title: string; evidenceNeeded: string }[];
  nextSteps: { id: string; title: string; findingIds: string[] }[];
};
export type QuestionnaireReviewRecord = {
  id: string; projectId: string; versionId: string; revision: number; sourceSha256: string;
  engine: string; createdAt: string; resultSha256: string; result: QuestionnaireReviewResult;
};

function sameJson(value: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== 'object') return value === expected;
  if (!value || typeof value !== 'object' || Object.getOwnPropertySymbols(value).length) return false;
  if (Array.isArray(value) !== Array.isArray(expected) || Object.getPrototypeOf(value) !== Object.getPrototypeOf(expected)) return false;
  const keys = Object.keys(expected), descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(value).length !== keys.length || Object.getOwnPropertyNames(value).length !== keys.length + (Array.isArray(value) ? 1 : 0)) return false;
  return keys.every(key => {
    const descriptor = descriptors[key];
    return descriptor?.enumerable && Object.hasOwn(descriptor, 'value') && sameJson(descriptor.value, (expected as Record<string, unknown>)[key]);
  });
}

export function reviewQuestionnaire(value: unknown): QuestionnaireReviewResult {
  const { content } = parseQuestionnaireLibraryContent(value);
  const issues = questionnaireIssues(content);
  // Stable priority order preserves question order within each severity.
  const findings = [...issues.filter(i => i.level === 'blocker'), ...issues.filter(i => i.level === 'review')].map((issue, index) => {
    const questionIndex = content.questions.findIndex(q => q.id === issue.questionId);
    return { ...issue, id: `finding-${index + 1}`, questionNumber: questionIndex < 0 ? null : questionIndex + 1, variable: questionIndex < 0 ? null : content.questions[questionIndex].variable };
  });
  const blockers = findings.filter(i => i.level === 'blocker').length;
  const nextSteps: QuestionnaireReviewResult['nextSteps'] = [];
  if (blockers) nextSteps.push({ id: 'repair_structure', title: '先修复题干、编码、选项与显示条件中的结构问题', findingIds: findings.filter(i => i.level === 'blocker').map(i => i.id) });
  const brief = findings.filter(i => i.level === 'review' && i.questionId === null);
  if (brief.length) nextSteps.push({ id: 'complete_brief', title: '补充研究简介、招募和预试依据；未实施的内容标为计划', findingIds: brief.map(i => i.id) });
  const items = findings.filter(i => i.level === 'review' && i.questionId !== null);
  if (items.length) nextSteps.push({ id: 'review_items', title: '逐题核对研究用途、测量、措辞和来源，不机械删除题项', findingIds: items.map(i => i.id) });
  nextSteps.push({ id: 'human_review', title: '邀请方法与调研人员审阅，开展认知访谈或预试并留存记录', findingIds: [] });
  return {
    schema: 'questionnaire-review-result/v1', engine: QUESTIONNAIRE_REVIEW_ENGINE,
    classification: 'automated_design_check', status: blockers ? 'structure_changes_needed' : 'human_review_required',
    summary: { questions: content.questions.length, blockers, reviews: findings.length - blockers }, findings,
    humanChecks: [
      { id: 'sampling', title: '总体、招募与推断范围', evidenceNeeded: '目标总体、可用样本框、实际招募机制及覆盖限制；填入文字不证明代表性。' },
      { id: 'measurement', title: '构念与测量效度', evidenceNeeded: '构念依据、量表来源与改编记录、内容审查；信度和效度不能由空字段检查认证。' },
      { id: 'pilot', title: '理解、负担与路径预试', evidenceNeeded: '实际认知访谈或预试的对象、日期、发现及修订；计划不能冒充已实施。' },
      { id: 'ethics', title: '知情同意与材料权利', evidenceNeeded: '适用的同意文本、退出安排、敏感信息保护和材料使用权限。' },
      { id: 'rules', title: '当前赛事规则适配', evidenceNeeded: '明确届次、组别、赛区、赛道和阶段，核验对应官方通知；本引擎不自动判定规则。' },
    ], nextSteps,
  };
}

/** Require the receipt to describe the exact previewed immutable source, not a newer/local draft. */
export function parseQuestionnaireReviewReceipt(value: unknown, source: {projectId: string; id: string; revision: number; sha256: string; content: unknown}): QuestionnaireReviewRecord {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length) throw new Error('检查回执格式无效。');
  const v = value as Record<string, unknown>;
  const allowed = ['id','projectId','versionId','revision','sourceSha256','engine','createdAt','resultSha256','result'];
  if (Object.getOwnPropertyNames(v).length !== allowed.length || Object.keys(v).length !== allowed.length || Object.keys(v).some(k => !allowed.includes(k) || !Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)!, 'value'))) throw new Error('检查回执包含未知字段。');
  if (typeof v.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(v.id) || v.projectId !== source.projectId || v.versionId !== source.id || v.revision !== source.revision || v.sourceSha256 !== source.sha256 || v.engine !== QUESTIONNAIRE_REVIEW_ENGINE) throw new Error('检查记录与预览版本不一致。');
  if (typeof v.resultSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.resultSha256) || !isQuestionnaireTimestamp(v.createdAt)) throw new Error('检查回执的时间或指纹无效。');
  // Exact reproduction rejects forged findings, counts, claims, or unknown approval fields.
  const result = reviewQuestionnaire(source.content);
  if (!sameJson(v.result, result)) throw new Error('检查结果与本版设计的可复算结果不一致。');
  return {id:v.id,projectId:source.projectId,versionId:source.id,revision:source.revision,sourceSha256:source.sha256,engine:QUESTIONNAIRE_REVIEW_ENGINE,createdAt:v.createdAt,resultSha256:v.resultSha256,result};
}

/** The UI must use this asynchronous boundary before presenting a verified result fingerprint. */
export async function verifyQuestionnaireReviewReceipt(value: unknown, source: Parameters<typeof parseQuestionnaireReviewReceipt>[1]): Promise<QuestionnaireReviewRecord> {
  const parsed = parseQuestionnaireLibraryContent(source.content);
  const record = parseQuestionnaireReviewReceipt(value, {...source,content:parsed.content});
  // Identical issue lists can describe materially different questionnaires.
  // Verify the complete source, not only this engine's lossy projection.
  if (await questionnaireContentSha256(parsed.serialized) !== record.sourceSha256) throw new Error('问卷内容与源版本指纹不一致，未接纳检查记录。');
  const hex = await questionnaireContentSha256(JSON.stringify(record.result));
  if (hex !== record.resultSha256) throw new Error('检查结果指纹不一致，未接纳此记录。');
  return record;
}
