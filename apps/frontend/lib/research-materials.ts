import data from '../data/research-materials.json' with { type: 'json' };
import { DESIGN_LIMITS, nextVariable, parseQuestionnaire, questionnaireIssues, type Questionnaire } from './questionnaire.ts';

export type MaterialContext = 'questionnaire' | 'analysis' | 'report' | 'defense' | 'learning';
export type MaterialSource = { id: string; filename: string; collection: string; sha256: string; scope: string; hardRule: false };
export type MaterialCard = {
  id: string; title: string; category: string; contexts: MaterialContext[]; availability: 'guidance'; researchQuestion: string;
  preconditions: string[]; steps: string[]; diagnostics: string[]; outputs: string[]; limits: string[];
  sourceRefs: { sourceId: string; locators: string[] }[];
  questionGroupId?: string; quiz?: { options: string[]; answer: number; explanation: string };
};
export const MATERIAL_VERSION = data.version;
export const MATERIAL_SOURCES = data.sources as MaterialSource[];
export const MATERIAL_CARDS = data.cards as MaterialCard[];
export const MATERIAL_QUESTION_GROUPS = data.questionGroups as { id: string; title: string; design: Questionnaire }[];

/** A view projection; selecting guidance never changes a project or registers an executor. */
export function findMaterialCards(context: MaterialContext, query = '', category = '', all = false): MaterialCard[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return MATERIAL_CARDS.filter(c => (all || c.contexts.includes(context)) && (!category || c.category === category) &&
    terms.every(term => [c.title,c.researchQuestion,c.category,...c.steps,...c.diagnostics,...c.outputs].join(' ').toLocaleLowerCase().includes(term)));
}

/** Apply an original candidate group atomically, with fresh IDs and remapped internal branches. */
export function appendMaterialQuestionGroup(design: Questionnaire, groupId: string, createId: () => string): Questionnaire {
  const group = MATERIAL_QUESTION_GROUPS.find(g => g.id === groupId);
  if (!group) throw new Error('请选择有效题组。');
  const draft = parseQuestionnaire(JSON.stringify(group.design));
  if (design.questions.length + draft.questions.length > DESIGN_LIMITS.questions) throw new Error('合计超过 80 题，请减少题目或拆分问卷。');
  const used = new Set(design.questions.map(q => q.id));
  const ids = new Map<string,string>();
  for (const q of draft.questions) {
    const id = createId();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || used.has(id)) throw new Error('新增题目 ID 无效或重复，未修改问卷。');
    used.add(id); ids.set(q.id,id);
  }
  const next = { ...design, questions: [...design.questions] };
  const allowed = new Set<string>();
  for (const q of draft.questions) {
    if (q.condition && !allowed.has(q.condition.questionId)) throw new Error('题组显示条件必须引用本组前面的单选题。');
    const condition = q.condition ? { questionId: ids.get(q.condition.questionId)!, codes: [...q.condition.codes] } : null;
    next.questions.push({ ...structuredClone(q), id: ids.get(q.id)!, variable: nextVariable(next), condition });
    if (q.type === 'single') allowed.add(q.id);
  }
  const safe = parseQuestionnaire(JSON.stringify(next));
  const appendedIds = new Set(ids.values());
  if (questionnaireIssues(safe).some(i => i.level === 'blocker' && i.questionId && appendedIds.has(i.questionId))) throw new Error('题组包含结构问题，未修改问卷。');
  return safe;
}

export function materialCardText(card: MaterialCard, checked: readonly number[] = []): string {
  const refs = card.sourceRefs.map(r => {
    const source = MATERIAL_SOURCES.find(s => s.id === r.sourceId);
    return `${source?.filename ?? r.sourceId}\n定位：${r.locators.join('；')}\nSHA256：${source?.sha256 ?? ''}`;
  });
  const exercise = card.quiz ? ['\n知识练习', ...card.quiz.options.map((text,i)=>`${String.fromCharCode(65+i)}. ${text}`), `答案：${String.fromCharCode(65+card.quiz.answer)}`, `解析：${card.quiz.explanation}`] : [];
  return [card.title,card.researchQuestion,...exercise,'\n开始前',...card.preconditions,'\n操作',...card.steps,
    '\n核对',...card.diagnostics.map((t,i) => `${checked.includes(i) ? '[x]' : '[ ]'} ${t}`),'\n输出',...card.outputs,
    '\n解释范围',...card.limits,'\n方法依据',...refs,`\n资料库版本：${MATERIAL_VERSION}`].join('\n');
}
