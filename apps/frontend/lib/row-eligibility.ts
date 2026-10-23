import type { DesignQuestion, Questionnaire } from './questionnaire.ts';
import type { SurveyTable } from './survey-analysis.ts';

/** A deterministic local assessment, not permission to exclude rows or run an analysis. */
export const ROW_ELIGIBILITY_VERSION = 'row-eligibility/v1' as const;
export type EligibilityAssignment = { questionId: string; column: string; representation: 'code' | 'label' };
export type QuestionEligibilityCounts = {
  questionId: string;
  eligibleAnswered: number; eligibleMissing: number;
  ineligibleBlank: number; ineligibleAnswered: number;
  unknownBlank: number; unknownAnswered: number;
};
export type RowEligibilityAssessment = {
  schema: typeof ROW_ELIGIBILITY_VERSION;
  hasConditions: boolean;
  totalRows: number; eligibleRows: number; ineligibleRows: number; unknownRows: number;
  /** Separate QC count; overlaps the disjoint row buckets and must not be added to them. */
  contradictionRows: number;
  /** Selected questions and their complete ancestor closure, in questionnaire order. */
  questionCounts: QuestionEligibilityCounts[];
  /** Local row positions only. Never persist/export these as summary evidence. */
  eligibleIndices: number[];
  /** Structural failures block analysis; missing/invalid parent responses instead yield unknown rows. */
  problems: string[];
};

type Eligibility = 'eligible' | 'ineligible' | 'unknown';
type PreparedQuestion = {
  question: DesignQuestion;
  column: number;
  parent: string | null;
  conditionCodes: Set<string>;
  responseCodes: Map<string, string>;
  invalid: boolean;
};

const emptyCounts = (questionId: string): QuestionEligibilityCounts => ({
  questionId, eligibleAnswered: 0, eligibleMissing: 0,
  ineligibleBlank: 0, ineligibleAnswered: 0, unknownBlank: 0, unknownAnswered: 0,
});

/**
 * Eligibility is a routing property, not complete-case analysis or response validity.
 * Blank includes configured missing codes. An eligible missing answer stays eligible;
 * the downstream analysis remains responsible for its declared missing-value policy.
 *
 * A child cannot become visible through an answer stored for a hidden parent. A missing
 * or invalid answer to an otherwise eligible parent leaves descendant eligibility unknown.
 * A known-ineligible selected question makes the common response universe ineligible,
 * even if another selected question is unknown; per-question unknown counts are retained.
 * Structural errors fail closed (all aggregate rows unknown; no eligible row indices).
 * Inputs and original strings are never mutated, and no raw response is returned.
 */
export function assessEligibility(
  design: Questionnaire,
  assignments: readonly EligibilityAssignment[],
  table: SurveyTable,
  missingCodes: readonly string[],
  selectedQuestionIds: readonly string[],
): RowEligibilityAssessment {
  const problems = new Set<string>();
  const missing = new Set(missingCodes.map(code => code.trim()));
  const selected = new Set(selectedQuestionIds);
  const byId = new Map<string, { question: DesignQuestion; index: number }>();
  const duplicateIds = new Set<string>();
  design.questions.forEach((question, index) => {
    if (byId.has(question.id)) duplicateIds.add(question.id);
    else byId.set(question.id, { question, index });
  });

  const closure = new Set<string>();
  const pending = [...selected];
  while (pending.length) {
    const id = pending.pop()!;
    if (closure.has(id)) continue;
    closure.add(id);
    const item = byId.get(id);
    if (!item) { problems.add('所选题目或条件父题不存在，请重新核对问卷版本。'); continue; }
    if (duplicateIds.has(id)) problems.add('所选题目或条件父题的 ID 不唯一，无法判定逐行资格。');
    if (item.question.condition) pending.push(item.question.condition.questionId);
  }
  if (!selected.size) problems.add('请先选择需要核验资格的题目。');

  // Only the selected branch closure needs assignments. Unrelated unassigned questions
  // do not prevent an otherwise well-defined analysis.
  const assignmentById = new Map<string, EligibilityAssignment>();
  const invalidAssignments = new Set<string>();
  const columns = new Map<string, string>();
  for (const assignment of assignments) {
    if (!closure.has(assignment.questionId)) continue;
    if (assignmentById.has(assignment.questionId)) {
      invalidAssignments.add(assignment.questionId);
      problems.add('所选题目或条件父题存在重复对应，请为每题保留一个唯一数据列。');
    } else assignmentById.set(assignment.questionId, assignment);
    const owner = columns.get(assignment.column);
    if (owner && owner !== assignment.questionId) {
      invalidAssignments.add(owner); invalidAssignments.add(assignment.questionId);
      problems.add('所选题目与条件父题不能共用同一数据列。');
    } else columns.set(assignment.column, assignment.questionId);
  }
  const invalidTable = new Set(table.headers).size !== table.headers.length ||
    table.rows.some(row => row.length !== table.headers.length || row.some(value => typeof value !== 'string'));
  if (invalidTable) problems.add('数据表包含重复列名或不一致的记录结构，未判定逐行资格。');

  const prepared = new Map<string, PreparedQuestion>();
  const ordered = design.questions.filter((question, index) => closure.has(question.id) && byId.get(question.id)?.index === index);
  const parentIds = new Set(ordered.flatMap(question => question.condition ? [question.condition.questionId] : []));
  for (const question of ordered) {
    const index = byId.get(question.id)!.index;
    const assignment = assignmentById.get(question.id);
    const column = assignment ? table.headers.indexOf(assignment.column) : -1;
    let invalid = duplicateIds.has(question.id) || invalidAssignments.has(question.id) || invalidTable;
    if (!assignment || column < 0) {
      invalid = true;
      problems.add(`第 ${index + 1} 题${parentIds.has(question.id) ? '是条件父题，' : ''}尚未对应到现有数据列。`);
    }
    if (assignment && !['code', 'label'].includes(assignment.representation)) {
      invalid = true; problems.add(`第 ${index + 1} 题的数据取值格式无效。`);
    }
    const responseCodes = new Map<string, string>();
    // Parent responses must normalize unambiguously to an existing single-choice code.
    // Selected response-domain validation belongs to the mapping guard on eligible rows.
    if (parentIds.has(question.id)) {
      const choiceCodes = question.choices.map(choice => choice.code);
      const choiceLabels = question.choices.map(choice => choice.label.trim());
      if (question.type !== 'single' || question.choices.length < 2 ||
          choiceCodes.some(code => !/^[A-Za-z0-9_-]{1,16}$/.test(code)) || new Set(choiceCodes).size !== choiceCodes.length) {
        invalid = true; problems.add(`第 ${index + 1} 题作为条件父题时必须有唯一、有效的单选编码。`);
      }
      if (choiceLabels.some(label => !label) || new Set(choiceLabels).size !== choiceLabels.length) {
        invalid = true; problems.add(`第 ${index + 1} 题作为条件父题时选项文字不能为空或重复。`);
      }
      for (const choice of question.choices) {
        const response = assignment?.representation === 'label' ? choice.label.trim() : choice.code;
        if (!response || responseCodes.has(response)) {
          invalid = true; problems.add(`第 ${index + 1} 题的条件父题取值无法唯一转换为编码，请核对标签与对应格式。`);
        } else responseCodes.set(response, choice.code);
      }
    }
    const condition = question.condition;
    if (condition) {
      const parent = byId.get(condition.questionId);
      if (!parent || parent.index >= index || parent.question.type !== 'single') {
        invalid = true; problems.add(`第 ${index + 1} 题的显示条件必须引用之前的单选题，不能自引用或形成循环。`);
      }
      const parentCodes = new Set(parent?.question.choices.map(choice => choice.code) ?? []);
      if (!condition.codes.length || new Set(condition.codes).size !== condition.codes.length || condition.codes.some(code => !parentCodes.has(code))) {
        invalid = true; problems.add(`第 ${index + 1} 题的显示条件编码为空、重复或不属于父题。`);
      }
    }
    prepared.set(question.id, { question, column, parent: condition?.questionId ?? null,
      conditionCodes: new Set(condition?.codes ?? []), responseCodes, invalid });
  }

  const counts = ordered.map(question => emptyCounts(question.id));
  const assessment: RowEligibilityAssessment = {
    schema: ROW_ELIGIBILITY_VERSION,
    hasConditions: ordered.some(question => question.condition !== null),
    totalRows: table.rows.length, eligibleRows: 0, ineligibleRows: 0, unknownRows: 0,
    contradictionRows: 0, questionCounts: counts, eligibleIndices: [], problems: [],
  };
  table.rows.forEach((row, rowIndex) => {
    const status = new Map<string, Eligibility>();
    const values = new Map<string, string>();
    const blank = new Map<string, boolean>();
    for (const question of ordered) {
      const entry = prepared.get(question.id)!;
      const raw = row[entry.column];
      const value = typeof raw === 'string' ? raw.trim() : '';
      values.set(question.id, value);
      blank.set(question.id, !value || missing.has(value));
      let eligibility: Eligibility = 'unknown';
      if (!entry.invalid) {
        if (!entry.parent) eligibility = 'eligible';
        else {
          const parentStatus = status.get(entry.parent);
          if (parentStatus === 'ineligible') eligibility = 'ineligible';
          else if (parentStatus === 'eligible') {
            const parent = prepared.get(entry.parent)!;
            const code = blank.get(entry.parent) ? undefined : parent.responseCodes.get(values.get(entry.parent)!);
            if (code !== undefined) eligibility = entry.conditionCodes.has(code) ? 'eligible' : 'ineligible';
          }
        }
      }
      status.set(question.id, eligibility);
    }
    let contradiction = false;
    for (const count of counts) {
      const eligibility = status.get(count.questionId)!;
      const isBlank = blank.get(count.questionId)!;
      if (eligibility === 'eligible') count[isBlank ? 'eligibleMissing' : 'eligibleAnswered']++;
      else if (eligibility === 'ineligible') {
        count[isBlank ? 'ineligibleBlank' : 'ineligibleAnswered']++;
        if (!isBlank) contradiction = true;
      } else count[isBlank ? 'unknownBlank' : 'unknownAnswered']++;
    }
    if (contradiction) assessment.contradictionRows++;
    const states = [...selected].map(id => status.get(id) ?? 'unknown');
    if (problems.size) assessment.unknownRows++;
    else if (states.includes('ineligible')) assessment.ineligibleRows++;
    else if (states.includes('unknown')) assessment.unknownRows++;
    else if (contradiction) {
      // Impossible for a structurally valid ancestor closure: keep the invariant fail-closed.
      problems.add('内部资格一致性检查失败：应答行含有隐藏祖先作答，未允许分析。');
      assessment.unknownRows++;
    } else {
      assessment.eligibleRows++; assessment.eligibleIndices.push(rowIndex);
    }
  });
  if (problems.size) {
    assessment.eligibleRows = 0; assessment.ineligibleRows = 0;
    assessment.unknownRows = assessment.totalRows; assessment.eligibleIndices = [];
  }
  assessment.problems = [...problems];
  return assessment;
}
