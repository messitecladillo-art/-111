import { newQuestion, newQuestionnaire, type DesignQuestion, type Questionnaire } from '../questionnaire.ts';
import type { Expectation } from './assess.ts';
import type { Scenario } from './run.ts';

const SOURCE = '自编教学题，未经认知访谈、预试或效度验证。';

function item(id: string, variable: string, fields: Partial<DesignQuestion>): DesignQuestion {
  return { ...newQuestion(id, variable), source: SOURCE, ...fields };
}
const likert = (minLabel: string, maxLabel: string) => ({ type: 'likert' as const, min: 1, max: 5, minLabel, maxLabel, choices: [] });

/**
 * A teaching draft that exercises every silicon-sample feature: screening and routing, a `{情境}` item,
 * piping (`{FREQ}`), a reverse-worded pair inside one construct and an open item. It is a rehearsal
 * prop, not a validated instrument, and its answers from any engine describe nobody.
 */
export function siliconExampleQuestionnaire(): Questionnaire {
  const d = newQuestionnaire();
  d.title = '校园快递取件体验 · 硅基预测试教学示例';
  d.objective = '为驿站服务改进选择优先事项（教学示例，决策主体待确认）。';
  d.population = '拟调查本校在校学生；具体校区与纳入条件待补充。';
  d.period = '过去 30 天';
  d.recruitment = '尚未确定招募渠道与抽样方案；硅基样本只用于发放前的预测试。';
  d.introduction = '【教学示例，发放前请改写】本调查拟了解校园快递驿站的取件体验。参与自愿，可跳过不愿回答的问题或随时退出。请勿填写姓名、学号和联系方式。';
  d.pilotNotes = '计划：先用硅基样本走查题目与跳转，再请 5–8 位真实同学做认知访谈；均尚未完成。';
  const use = item('sx-use', 'USE', { text: '过去 30 天，您是否在校园快递驿站取过件？', purpose: 'screening', required: true, analysis: 'routing', decisionUse: '只向取过件的同学询问体验。', choices: [{ code: '1', label: '取过' }, { code: '0', label: '没有取过' }] });
  const route = { questionId: use.id, codes: ['1'] };
  d.questions = [
    use,
    item('sx-freq', 'FREQ', { text: '过去 30 天，您大约取件几次？', required: true, researchQuestion: '取件频率是否与体验评价有关？', analysis: 'description', decisionUse: '区分高频与低频用户的改进优先级。', choices: [{ code: '1', label: '1–2 次' }, { code: '2', label: '3–5 次' }, { code: '3', label: '6–10 次' }, { code: '4', label: '11 次及以上' }], condition: route }),
    item('sx-wait', 'WAIT', { ...likert('毫无压力', '压力很大'), text: '设想您在{情境}去驿站取件，预计的排队等待会让您感到多大压力？', construct: '等待压力', researchQuestion: '不同时段的等待压力有何差异？', analysis: 'comparison', decisionUse: '判断是否需要错峰或增开窗口。', condition: route }),
    item('sx-clear', 'CLEAR', { ...likert('非常不同意', '非常同意'), text: '驿站的取件流程对我来说清楚易懂。', construct: '流程体验', researchQuestion: '取件流程是否清楚？', analysis: 'measurement', decisionUse: '识别流程说明的改进需求。', condition: route }),
    item('sx-lost', 'LOST', { ...likert('非常不同意', '非常同意'), text: '我常常不确定该去哪个货架找自己的包裹。', construct: '流程体验', reverse: true, researchQuestion: '取件流程是否清楚？', analysis: 'measurement', decisionUse: '与 CLEAR 共同反映流程体验；分析端反向计分。', condition: route }),
    item('sx-barrier', 'BARRIER', { type: 'multi', text: '结合您过去 30 天的取件次数（{FREQ}），哪些问题最影响您的取件体验？（可多选）', researchQuestion: '主要阻碍是什么？', analysis: 'description', decisionUse: '排序改进事项。', choices: [{ code: '1', label: '排队时间长' }, { code: '2', label: '营业时间短' }, { code: '3', label: '货架难找' }, { code: '4', label: '包裹丢失或错拿' }, { code: '5', label: '其他' }], condition: route }),
    item('sx-sat', 'SAT', { ...likert('非常不满意', '非常满意'), text: '总体而言，您对驿站服务的满意程度如何？', construct: '总体满意', researchQuestion: '总体满意度与哪些体验相关？', analysis: 'association', decisionUse: '作为改进前后的对照指标。', condition: route }),
    item('sx-idea', 'IDEA', { type: 'text', text: '若愿意，请写下一个具体的改进建议。', researchQuestion: '有哪些具体改进线索？', analysis: 'coding', decisionUse: '形成待核实的改进线索，不把单条意见当作结论。', choices: [], condition: route }),
  ];
  return d;
}

export const EXAMPLE_SCENARIOS: Scenario[] = [
  { id: 'noon', label: '平日午间', text: '平日午间' },
  { id: 'peak', label: '晚间高峰', text: '晚上 6–8 点的高峰时段' },
];

/** Researcher hypotheses for the pattern-correspondence check: stated before looking, not derived from results. */
export const EXAMPLE_EXPECTATIONS: Expectation[] = [
  { id: 'exp-wait-sat', a: { kind: 'question', id: 'sx-wait' }, b: { kind: 'question', id: 'sx-sat' }, direction: 'negative', note: '等待压力越大，满意度应越低。' },
  { id: 'exp-clear-sat', a: { kind: 'question', id: 'sx-clear' }, b: { kind: 'question', id: 'sx-sat' }, direction: 'positive', note: '流程越清楚，满意度应越高。' },
];
