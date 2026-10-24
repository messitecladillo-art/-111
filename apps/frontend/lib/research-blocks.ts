import { DESIGN_LIMITS, newQuestion, nextVariable, parseQuestionnaire, type DesignQuestion, type Questionnaire } from './questionnaire.ts';

export const QUESTION_BLOCKS = [
  { id: 'screen', title: '对象筛选', stage: '01 · 确定对象', description: '核对纳入条件，后续题目可据此设置显示条件。', count: 1 },
  { id: 'profile', title: '分层画像', stage: '02 · 认识样本', description: '当前状态与参与渠道，为分组描述保留变量。', count: 2 },
  { id: 'behavior', title: '行为与投入', stage: '03 · 描述行为', description: '指定参照期，分别询问频率与时间投入。', count: 2 },
  { id: 'experience', title: '体验测量', stage: '04 · 测量体验', description: '清晰度、便利性、总体评价分别设题，不合并提问。', count: 3 },
  { id: 'barriers', title: '障碍与需求', stage: '05 · 识别问题', description: '多选障碍与最优先支持需求，连接行动方案。', count: 2 },
  { id: 'intention', title: '未来意愿', stage: '06 · 观察意向', description: '区分主观意愿与已经发生的行为。', count: 1 },
  { id: 'open', title: '开放补充', stage: '07 · 倾听原因', description: '保留受访者自己的表达，不强制作答。', count: 1 },
] as const;
export type QuestionBlockId = typeof QUESTION_BLOCKS[number]['id'];
const source = '工作台自编模块草稿，非获奖原问卷、非成熟量表；需核对文献、对象与语义并完成认知访谈和预试。';
function base(type: DesignQuestion['type'], text: string, analysis: DesignQuestion['analysis'], extra: Partial<DesignQuestion> = {}): DesignQuestion {
  return { ...newQuestion('', ''), type, text, analysis, source, choices: [], min: null, max: null, ...extra };
}
const choices = (...labels: string[]) => labels.map((label, i) => ({ code: String(i + 1), label }));
function templates(id: QuestionBlockId, topic: string): DesignQuestion[] {
  switch (id) {
    case 'screen': return [base('single', '您是否符合本研究的调查对象条件？（请将条件写具体）', 'routing', {purpose: 'screening', choices: choices('符合', '不符合', '不确定'), decisionUse: '仅纳入符合条件者；需手动设置下游题显示条件。'})];
    case 'profile': return [base('single', '您目前所处的主要状态是？（按研究对象修改分类）', 'comparison', {purpose:'background', choices:choices('状态 A（待细化）','状态 B（待细化）','其他','不愿回答')}), base('single', `您主要通过哪种渠道了解${topic}？`, 'description', {choices:choices('线下渠道（待细化）','线上渠道（待细化）','他人介绍','其他','不了解')})];
    case 'behavior': return [base('number', `在过去 30 天，您参与${topic}相关活动的次数是多少？`, 'description', {min:0}), base('number', `在过去 30 天，您在${topic}相关活动上累计投入多少小时？`, 'description', {min:0})];
    case 'experience': return ['相关信息对我来说是清楚的。','相关流程对我来说是便利的。','总体而言，我对相关体验感到满意。'].map(text => base('likert', `结合您最近一次${topic}的经历：${text}`, 'measurement', {construct:'体验评价（维度待论证，勿默认合并计分）', min:1,max:5,minLabel:'非常不同意',maxLabel:'非常同意'}));
    case 'barriers': return [base('multi', `在${topic}方面，您遇到了哪些障碍？（可多选）`, 'description', {choices:choices('信息不足','时间受限','费用压力','缺少支持','其他')}), base('single', `在${topic}方面，您最希望优先获得哪一种支持？`, 'description', {choices:choices('信息指导','技能培训','资源对接','其他','暂无需求')})];
    case 'intention': return [base('likert', `未来 3 个月，您参与${topic}相关活动的意愿如何？`, 'association', {min:1,max:5,minLabel:'完全不愿意',maxLabel:'非常愿意'})];
    case 'open': return [base('text', `关于${topic}，还有哪些具体经历或建议是前面没有涉及的？请勿填写姓名或联系方式。`, 'coding')];
  }
}
/** Append atomically. Existing order, routes, IDs and v1 backup format remain unchanged. */
export function appendQuestionBlocks(design: Questionnaire, ids: QuestionBlockId[], topic: string, createId: () => string): Questionnaire {
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !QUESTION_BLOCKS.some(b => b.id === id))) throw new Error('请选择不同的有效模块。');
  if (!topic.trim() || topic.trim().length > 60) throw new Error('请填写 1–60 字的研究主题。');
  return appendDrafts(design, ids.flatMap(id => templates(id, topic.trim())), createId);
}
export function appendScaleBlock(design: Questionnaire, options: { construct: string; lines: string; points: 5 | 7; minLabel: string; maxLabel: string; source: string }, createId: () => string) {
  const lines = options.lines.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (!options.construct.trim() || options.construct.length > 120) throw new Error('请填写 1–120 字的构念名称。');
  if (lines.length < 2 || lines.length > 12 || lines.some(x => x.length > 600)) throw new Error('请逐行填写 2–12 个题项，每题不超过 600 字。');
  if (![5,7].includes(options.points) || !options.minLabel.trim() || !options.maxLabel.trim()) throw new Error('请选择 5 / 7 点计分并填写两端含义。');
  return appendDrafts(design, lines.map(text => base('likert',text,'measurement',{construct:options.construct.trim(),min:1,max:options.points,minLabel:options.minLabel.trim(),maxLabel:options.maxLabel.trim(),source:options.source.trim() || source})),createId);
}
function appendDrafts(design: Questionnaire, drafts: DesignQuestion[], createId: () => string) {
  if (design.questions.length + drafts.length > DESIGN_LIMITS.questions) throw new Error(`本次将超过 ${DESIGN_LIMITS.questions} 题；请减少模块或拆分问卷。`);
  const next = { ...design, questions: [...design.questions] };
  for (const draft of drafts) next.questions.push({...draft,id:createId(),variable:nextVariable(next)});
  return parseQuestionnaire(JSON.stringify(next));
}
