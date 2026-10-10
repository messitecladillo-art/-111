import { allocatePitch, DEFENSE_FIELDS, PITCH_BLOCKS, type DefenseDraft, type EvidenceState } from './defense-training.ts';

/** Local practice packages only. This parser never resolves or verifies evidence. */
export const MAX_DEFENSE_IMPORT_BYTES = 384 * 1024;

export type DefenseImport = {
  drafts: Record<string, DefenseDraft>;
  cardIds: string[];
  corpusVersion: string;
  corpusMismatch: boolean;
  total: number;
  reserve: number;
  weights: number[];
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function copyDraft(draft: DefenseDraft): DefenseDraft {
  return {
    answer: draft.answer,
    evidence: draft.evidence,
    boundary: draft.boundary,
    nextStep: draft.nextStep,
    owner: draft.owner,
    evidenceState: draft.evidenceState,
  };
}

/**
 * Accept the existing v1 export, without trusting imported titles, checks or
 * calculated timing positions. Callers must preview and confirm before merging.
 */
export function parseDefenseImport(
  bytes: Uint8Array,
  cards: readonly { id: string; title: string }[],
  currentCorpusVersion: string,
): DefenseImport {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw Error('练习包为空或无法读取，请选择导出的 JSON 文件。');
  }
  if (bytes.byteLength > MAX_DEFENSE_IMPORT_BYTES) {
    throw Error('练习包超过 384 KB，请检查文件是否为答辩练习导出包。');
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw Error('练习包不是有效的 UTF-8 文本，请重新导出。');
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error('练习包不是有效的 JSON 文件，请重新导出。');
  }
  if (!record(value) || value.schema !== 'evix-defense-practice/v1'
    || value.contentClass !== 'user_authored_practice_not_verified') {
    throw Error('文件格式不匹配，请选择 EVI-X 导出的未核验答辩练习包。');
  }
  if (typeof value.corpusVersion !== 'string' || !value.corpusVersion.trim()
    || value.corpusVersion.length > 120) {
    throw Error('练习包缺少有效的题库版本，请重新导出。');
  }
  const knownIds = new Set(cards.map(card => card.id));
  if (!Array.isArray(value.entries) || value.entries.length === 0 || value.entries.length > knownIds.size) {
    throw Error('练习包中的题目数量无效，必须包含当前题库内的练习。');
  }

  const cardIds: string[] = [];
  const drafts: Record<string, DefenseDraft> = {};
  const unsafeIds = new Set(['__proto__', 'prototype', 'constructor']);
  for (const entry of value.entries) {
    if (!record(entry) || typeof entry.cardId !== 'string'
      || !knownIds.has(entry.cardId) || unsafeIds.has(entry.cardId)) {
      throw Error('练习包包含当前题库无法识别的题目，未导入任何内容。');
    }
    if (Object.hasOwn(drafts, entry.cardId)) {
      throw Error('练习包包含重复题目，请检查文件后再导入。');
    }
    for (const field of DEFENSE_FIELDS) {
      const fieldValue = entry[field.id];
      if (typeof fieldValue !== 'string'
        || fieldValue.length > (field.id === 'owner' ? 120 : 1800)) {
        throw Error('练习内容缺少文字字段、类型不符或超过长度限制，请检查后再导入。');
      }
    }
    if (entry.evidenceState !== 'missing' && entry.evidenceState !== 'documented' && entry.evidenceState !== 'proposed') {
      throw Error('练习包中的依据声明无效；导入不会自动核验证据。');
    }
    // Pick only editable fields: imported check/verified/title objects are not state.
    drafts[entry.cardId] = copyDraft({
      answer: entry.answer as string,
      evidence: entry.evidence as string,
      boundary: entry.boundary as string,
      nextStep: entry.nextStep as string,
      owner: entry.owner as string,
      evidenceState: entry.evidenceState as EvidenceState,
    });
    cardIds.push(entry.cardId);
  }

  const timing = value.timing;
  if (!record(timing) || timing.kind !== 'user_configured_practice_not_official_rule'
    || typeof timing.total !== 'number' || typeof timing.reserve !== 'number'
    || !Array.isArray(timing.plan) || timing.plan.length !== PITCH_BLOCKS.length) {
    throw Error('练习包中的计时设置无效，请检查练习总时长、预留和五个段落。');
  }
  const weights = timing.plan.map((block, index) => {
    if (!record(block) || block.id !== PITCH_BLOCKS[index].id || typeof block.weight !== 'number') {
      throw Error('练习包的计时段落必须按当前五段顺序排列，且权重为数字。');
    }
    return block.weight;
  });
  // Recompute via the same allocator as the editor. Never use uploaded seconds,
  // start/end, prompts or labels, even when an uploaded check claims verification.
  allocatePitch(timing.total, timing.reserve, weights);
  return {
    drafts,
    cardIds,
    corpusVersion: value.corpusVersion,
    corpusMismatch: value.corpusVersion !== currentCorpusVersion,
    total: timing.total,
    reserve: timing.reserve,
    weights,
  };
}

/** Merge only after explicit UI confirmation. Both input maps remain unchanged. */
export function mergeDefenseImport(
  current: Record<string, DefenseDraft>,
  incoming: Record<string, DefenseDraft>,
): Record<string, DefenseDraft> {
  return Object.fromEntries([
    ...Object.entries(current).map(([id, draft]) => [id, copyDraft(draft)]),
    ...Object.entries(incoming).map(([id, draft]) => [id, copyDraft(draft)]),
  ]);
}
