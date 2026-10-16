import { parseQuestionnaire, questionnaireIssues, rejectDuplicateMembers, type Questionnaire, type QuestionType } from './questionnaire.ts';

export const WJX_EXPORT_SCHEMA = 'questionnaire-platform-export/v1' as const;
export const WJX_TEXT_EXPORTER = 'wjx-text/v1' as const;
export const WJX_HELP_REFERENCE = 'https://www.wjx.cn/help/help.aspx?h=1&helpid=138';
const MANIFEST_BYTES = 2_000_000;

export type WjxExportIssue = { code: string; questionId: string | null; questionNumber: number | null; field: string; message: string };
export type WjxManualSetting = {
  code: 'title' | 'introduction' | 'required' | 'condition' | 'number-validation' | 'likert-scoring' | 'option-codes' | 'import-review';
  questionId: string | null; questionNumber: number | null; message: string;
};
export type WjxOptionPreview = { order: number; originalCode: string; label: string; importLabel: string; originalScore: number | null };
export type WjxQuestionPreview = {
  platformNumber: number; questionId: string; variable: string; originalType: QuestionType;
  platformType: 'single' | 'multi' | 'text'; stem: string; options: WjxOptionPreview[];
  required: boolean; condition: Questionnaire['questions'][number]['condition'];
  scoring: null | { min: number | null; max: number | null; minLabel: string; maxLabel: string; reverse: boolean };
};
export type WjxExportReview = { blockers: WjxExportIssue[]; manualSettings: WjxManualSetting[]; questions: WjxQuestionPreview[] };
export type WjxExportManifest = {
  schema: typeof WJX_EXPORT_SCHEMA; exporter: typeof WJX_TEXT_EXPORTER; target: 'wjx'; classification: 'proposed'; manifestSha256: string;
  source: { questionnaireHash: string; revision: number | null; questionnaire: Questionnaire };
  text: { sha256: string; encoding: 'utf-8'; newline: 'LF' };
  reference: { url: string; checkedOn: '2026-10-12'; basis: 'published-help-examples'; runtimeVerified: false };
  questions: WjxQuestionPreview[]; settings: WjxManualSetting[];
};
export type WjxExportBundle = { text: string; manifest: WjxExportManifest; settings: WjxManualSetting[]; review: WjxExportReview };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function sha256(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// No escaping convention is documented. Ambiguous content must be edited explicitly,
// rather than allowing a second title, option or platform directive to be inserted.
const LINE_BREAK = /[\r\n\u0085\u2028\u2029]/u;
const HIDDEN_FORMAT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/u;
const NUMBER_PREFIX = /^(?:第\s*[零〇一二三四五六七八九十百\d０-９]+\s*题|(?:[\d０-９]+|[A-Za-zＡ-Ｚａ-ｚ]|[零〇一二三四五六七八九十百]+)\s*[.．、:：)）])/u;
// WJX may split bare numeric option lines into questions. Only the generated
// Likert A.–O. prefix has been checked; custom numeric-start labels require an
// explicit edit, including decimals, exponents, ranges and units after a value.
const NUMERIC_OPTION_PREFIX = /^[+\-−＋－]?\s*(?:[\d０-９]|[.．][\d０-９])/u;
const TYPE_DIRECTIVE = /[\[\]［］]|[【〔](?:单选|多选|填空|矩阵|表格|排序|比重|量表|段落|必答|非必答|分值|答案|横向|竖向|数字)[^】〕]*[】〕]/u;

function inspectText(value: string, q: Questionnaire['questions'][number], index: number, field: string, blockers: WjxExportIssue[]) {
  const add = (code: string, message: string) => blockers.push({ code, questionId: q.id, questionNumber: index + 1, field, message });
  if (/\p{Cs}/u.test(value)) add('invalid-unicode', field + '含未配对的 Unicode 字符，请重新输入该段文字。');
  if (LINE_BREAK.test(value)) add('line-break', `${field}含换行；请改成单行，再生成导入文本。`);
  if (value.includes('\t') || HIDDEN_FORMAT.test(value)) add('hidden-format', `${field}含制表符或不可见格式字符，请检查并移除。`);
  if (TYPE_DIRECTIVE.test(value)) add('platform-directive', `${field}含方括号或题型指令，可能被识别为平台设置；请改用普通文字。`);
  if (/_{4,}/u.test(value)) add('blank-directive', `${field}含连续下划线，可能被识别为多项填空；请改用普通文字。`);
  if (NUMBER_PREFIX.test(value.trim())) add('number-prefix', `${field}以题号或选项编号开头，请移除自带编号；导出时会统一编号。`);
}

function reviewSnapshot(d: Questionnaire): WjxExportReview {
  const blockers: WjxExportIssue[] = questionnaireIssues(d).filter(issue => issue.level === 'blocker').map(issue => ({
    code: issue.code, questionId: issue.questionId,
    questionNumber: issue.questionId === null ? null : d.questions.findIndex(q => q.id === issue.questionId) + 1,
    field: '问卷设计', message: issue.message,
  }));
  const settings: WjxManualSetting[] = [
    { code: 'title', questionId: null, questionNumber: null, message: `设置问卷名称：${d.title || '请填写名称'}。` },
    { code: 'introduction', questionId: null, questionNumber: null, message: '导入文本只包含题目；请将调查说明设置到问卷说明区，并核对告知内容。' },
  ];
  const questions: WjxQuestionPreview[] = d.questions.map((q, index) => {
    inspectText(q.text, q, index, '题干', blockers);
    if (q.type === 'single' || q.type === 'multi') q.choices.forEach((choice, i) => {
      const field = `选项 ${i + 1}`;
      inspectText(choice.label, q, index, field, blockers);
      if (NUMERIC_OPTION_PREFIX.test(choice.label.trim())) blockers.push({
        code: 'numeric-option-prefix', questionId: q.id, questionNumber: index + 1, field,
        message: `${field}以数值开头，可能被平台拆成题目；请在数值前添加说明文字（例如「次数：0」），再生成导入文本。`,
      });
    });
    if (q.type === 'likert') {
      inspectText(q.minLabel, q, index, '下限锚点', blockers);
      inspectText(q.maxLabel, q, index, '上限锚点', blockers);
    }
    const questionNumber = index + 1;
    const setting = (code: WjxManualSetting['code'], message: string) => settings.push({ code, questionId: q.id, questionNumber, message });
    setting('required', `第 ${questionNumber} 题应设为${q.required ? '必答' : '选答'}，请核对平台导入后的默认设置。`);
    if (q.condition) {
      const parentNumber = d.questions.findIndex(parent => parent.id === q.condition!.questionId) + 1;
      const parent = d.questions[parentNumber - 1];
      const choices = q.condition.codes.map(code => {
        const position = parent?.choices.findIndex(choice => choice.code === code) ?? -1;
        return position < 0 ? `原编码 ${code}` : `选项 ${position + 1}「${parent.choices[position].label}」（原编码 ${code}）`;
      }).join('、');
      setting('condition', `第 ${questionNumber} 题仅在第 ${parentNumber} 题选择${choices}时显示；父题隐藏或未答时不显示。请在平台设置显示逻辑。`);
    }
    if (q.type === 'number') setting('number-validation', `第 ${questionNumber} 题导入为填空；请设置数值验证，范围 ${q.min ?? '不限'} 至 ${q.max ?? '不限'}。`);
    if (q.type === 'likert') setting('likert-scoring', `第 ${questionNumber} 题按单选导入，保留 ${q.min} 至 ${q.max} 的原始分值及两端锚点；如改为量表，请逐项核对计分。${q.reverse ? '反向计分只在分析端处理，不重写题干。' : ''}`);
    if (q.type === 'single' || q.type === 'multi' || q.type === 'likert') setting('option-codes', `第 ${questionNumber} 题按当前选项顺序导入；回收后用对应清单核对原始编码，平台编码未经确认不能直接用于分析。`);
    let options: WjxOptionPreview[] = [];
    if (q.type === 'single' || q.type === 'multi') options = q.choices.map((choice, i) => ({ order: i + 1, originalCode: choice.code, label: choice.label.trim(), importLabel: choice.label.trim(), originalScore: null }));
    // A genuine platform scale can use different score origins. Export as a single
    // choice so neither negative/zero scores nor reversed scoring are fabricated.
    if (q.type === 'likert' && q.min !== null && q.max !== null && Number.isInteger(q.min) && Number.isInteger(q.max) && q.max > q.min && q.max - q.min <= 14) {
      options = Array.from({ length: q.max - q.min + 1 }, (_, i) => {
        const score = q.min! + i;
        const anchor = score === q.min ? q.minLabel.trim() : score === q.max ? q.maxLabel.trim() : '';
        const label=anchor ? `${score} — ${anchor}` : String(score);
        return { order: i + 1, originalCode: String(score), label, importLabel:`${String.fromCharCode(65+i)}. ${label}`, originalScore: score };
      });
    }
    return {
      platformNumber: questionNumber, questionId: q.id, variable: q.variable, originalType: q.type,
      platformType: q.type === 'multi' ? 'multi' : q.type === 'single' || q.type === 'likert' ? 'single' : 'text',
      stem: q.text.trim(), options, required: q.required,
      condition: q.condition ? { questionId: q.condition.questionId, codes: [...q.condition.codes] } : null,
      scoring: q.type === 'likert' || q.type === 'number' ? { min: q.min, max: q.max, minLabel: q.minLabel, maxLabel: q.maxLabel, reverse: q.reverse } : null,
    };
  });
  settings.push({ code: 'import-review', questionId: null, questionNumber: null, message: '在平台预览并核对题数、题型、题干、选项顺序及显示逻辑。' });
  return { blockers, manualSettings: settings, questions };
}

/** Pure inspection. Returns editable problems without generating or uploading files. */
export function reviewWjxExport(design: Questionnaire): WjxExportReview {
  try { return reviewSnapshot(parseQuestionnaire(JSON.stringify(design))); }
  catch (error) { return { blockers: [{ code: 'invalid-design', questionId: null, questionNumber: null, field: '问卷设计', message: error instanceof Error ? error.message : '问卷设计无法校验。' }], manualSettings: [], questions: [] }; }
}

/** Captures the complete questionnaire before the first await. No model, network or storage. */
export async function exportWjxBundle(design: Questionnaire, options: { sourceRevision?: number | null } = {}): Promise<WjxExportBundle> {
  const source = parseQuestionnaire(JSON.stringify(design));
  const revision = options.sourceRevision ?? null;
  if (revision !== null && (!Number.isSafeInteger(revision) || revision < 0)) throw Error('问卷修订号必须为空或非负安全整数。');
  const review = reviewSnapshot(source);
  if (review.blockers.length) throw Error(`未生成问卷星导入文件：${review.blockers.map(issue => `${issue.questionNumber === null ? '' : `第 ${issue.questionNumber} 题：`}${issue.message}`).join(' ')}`);
  const text = review.questions.map(q => [`${q.platformNumber}. ${q.stem}${q.platformType === 'multi' ? '[多选题]' : ''}`, ...q.options.map(option => option.importLabel)].join('\n')).join('\n\n') + '\n';
  const sourceCanonical = canonical(source);
  const [questionnaireHash, textHash] = await Promise.all([sha256(sourceCanonical), sha256(text)]);
  const manifestBody: Omit<WjxExportManifest, 'manifestSha256'> = {
    schema: WJX_EXPORT_SCHEMA, exporter: WJX_TEXT_EXPORTER, target: 'wjx', classification: 'proposed',
    source: { questionnaireHash, revision, questionnaire: source },
    text: { sha256: textHash, encoding: 'utf-8', newline: 'LF' },
    reference: { url: WJX_HELP_REFERENCE, checkedOn: '2026-10-12', basis: 'published-help-examples', runtimeVerified: false },
    questions: review.questions, settings: review.manualSettings,
  };
  const manifest: WjxExportManifest = { ...manifestBody, manifestSha256: await sha256(canonical(manifestBody)) };
  if (new TextEncoder().encode(JSON.stringify(manifest, null, 2)).length > MANIFEST_BYTES) throw Error('对应清单超过 2 MB，请减少题目文字或选项后重新导出。');
  return { text, manifest, settings: review.manualSettings, review };
}

/** Accepts only an unchanged original manifest, never edited platform mappings or approvals. */
export async function parseRoundTripManifest(raw: string, expectedQuestionnaire?: Questionnaire): Promise<WjxExportManifest> {
  if (new TextEncoder().encode(raw).length > MANIFEST_BYTES) throw Error('对应清单超过 2 MB，未读取。');
  // Capture the expected live questionnaire before async digests; callers additionally
  // bind the return to their current edit revision/account before applying any proposal.
  const expected = expectedQuestionnaire === undefined ? null : parseQuestionnaire(JSON.stringify(expectedQuestionnaire));
  let value: unknown;
  try { value = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { throw Error('对应清单不是完整 JSON 文件。'); }
  rejectDuplicateMembers(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('对应清单必须为对象。');
  const record = value as Record<string, unknown>;
  if (record.schema !== WJX_EXPORT_SCHEMA || record.exporter !== WJX_TEXT_EXPORTER || record.target !== 'wjx' || record.classification !== 'proposed') throw Error('对应清单版本或目标平台不支持。');
  if (!record.source || typeof record.source !== 'object' || Array.isArray(record.source)) throw Error('对应清单缺少源问卷快照。');
  const source = record.source as Record<string, unknown>;
  const questionnaire = parseQuestionnaire(JSON.stringify(source.questionnaire));
  if (source.revision !== null && (typeof source.revision !== 'number' || !Number.isSafeInteger(source.revision) || source.revision < 0)) throw Error('对应清单修订号无效。');
  const regenerated = await exportWjxBundle(questionnaire, { sourceRevision: source.revision as number | null });
  // Regeneration verifies every nested field, exact source hash, numbering, order,
  // scoring, text hash and settings while rejecting unknown fields at any depth.
  if (canonical(record) !== canonical(regenerated.manifest)) throw Error('对应清单已修改或与源问卷不一致，请重新导出原版清单。');
  if (expected && canonical(expected) !== canonical(questionnaire)) throw Error('对应清单与当前问卷版本不一致，请核对原问卷；当前设计未被替换。');
  return regenerated.manifest;
}
