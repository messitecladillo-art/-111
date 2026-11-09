/**
 * A teaching simulation for any topic: an original questionnaire, simulated answers, and a report whose every number
 * the platform computed from those answers.
 *
 * - The questionnaire follows one general survey structure (who the respondent is, how they take part, five aspects
 *   of the experience, an attention item, support for a proposed mechanism, overall satisfaction, intention to keep
 *   using and recommend, and a spending band), worded for the topic.
 * - The answers come from a model seeded by the topic: every respondent is drawn on their own, and a few answers are
 *   the kind a quality screening exists to catch (a failed attention item, the same answer to every scale item, a
 *   resubmitted copy). Nothing is typed in: the model sets tendencies, the counts and statistics fall out of the draw.
 * - The report registers and places what the analysis engine computes on the screened answers, and its back matter
 *   says what was simulated, what was computed and what is still to be written.
 *
 * Nothing here is taken from a real report: no title, sentence, finding or number.
 */

import { advancedInsert, runAdvanced, type AdvancedSpec } from '../advanced-analysis.ts';
import { filterPlanSample, runPlanNode, type PlanMethod, type PlanScale } from '../analysis-plan.ts';
import { calculationReceipt } from '../analysis-result-receipt.ts';
import type { DatasetValue } from '../canvas/execute.ts';
import { evaluateQuality, keptTable, qualityResult, type RuleId } from '../data-quality.ts';
import { createEditorContent, parseEditorContent, type EditorContent } from '../editor-model.ts';
import { parseQuestionnaire, type DesignQuestion, type Questionnaire } from '../questionnaire.ts';
import { datasetIdentity } from '../questionnaire-mapping.ts';
import { blueprintOutline } from '../report-blueprint.ts';
import { applyReportInsert } from '../report-insert.ts';
import { placeResult } from '../report-placement.ts';
import { snapshotRecipe } from '../research-quality.ts';
import { appendRegisteredResult } from '../result-registration.ts';
import type { SurveyTable } from '../survey-analysis.ts';

export type DemoDimension = { code: 'Q3' | 'Q4' | 'Q5' | 'Q6' | 'Q7'; short: string; question: string };

/** A topic laid out on the survey structure: the names of its groups, states, aspects and scales. No numbers. */
export type DemoBlueprint = {
  id: string;
  slug: string;
  domainLabel: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  region: string;
  groupConstruct: string;
  groupA: string;
  groupB: string;
  statusConstruct: string;
  statusCategories: [string, string, string, string];
  scaleConstruct: string;
  dimensions: [DemoDimension, DemoDimension, DemoDimension, DemoDimension, DemoDimension];
  mechanismConstruct: string;
  mechanismQuestion: string;
  overallSatConstruct: string;
  overallSatQuestion: string;
  conversionConstruct: string;
  conversionQuestion: string;
  tierConstruct: string;
  tierQuestion: string;
  tierChoices: [string, string, string, string];
  keywords: string[];
  /** One sentence of background for the topic; it states no fact that would need a source. */
  context: string;
};

export type DemoStudy = { blueprint: DemoBlueprint; design: Questionnaire; dataset: DatasetValue };
export type DemoPack = DemoStudy & { report: EditorContent };

/* ───────── topics ───────── */

type Template = Omit<DemoBlueprint, 'id' | 'slug' | 'title' | 'subtitle' | 'region'> & { match: RegExp; defaultTitle: string };

const TEMPLATES: readonly Template[] = [
  {
    match: /银发|养老|助餐|适老|老年|长者|社区食堂/u,
    defaultTitle: '城市社区助餐服务的使用体验、满意度与持续使用意愿调查',
    domainLabel: '社区养老与助餐服务',
    shortTitle: '社区助餐服务',
    groupConstruct: '年龄分组',
    groupA: '60–70 岁老年人',
    groupB: '71 岁及以上老年人',
    statusConstruct: '助餐服务使用方式',
    statusCategories: ['堂食和送餐都用过', '只在助餐点堂食', '只用过送餐上门', '知道但还没用过'],
    scaleConstruct: '助餐服务体验量表',
    dimensions: [
      { code: 'Q3', short: '菜品口味与营养搭配', question: '您对助餐点菜品的口味和营养搭配满意吗？' },
      { code: 'Q4', short: '步行可达与就餐环境', question: '您对从家走到助餐点的方便程度和就餐环境满意吗？' },
      { code: 'Q5', short: '点餐与支付的便利', question: '您觉得助餐点点餐、刷卡或扫码付款方便吗？' },
      { code: 'Q6', short: '送餐准时与补贴结算', question: '您对送餐是否准时、补贴是否算得清楚满意吗？' },
      { code: 'Q7', short: '邻里交流与健康服务', question: '您对在助餐点和邻居交流、参加健康服务活动满意吗？' },
    ],
    mechanismConstruct: '助餐与健康服务联动的支持度',
    mechanismQuestion: '如果助餐点和社区卫生服务、文体活动联动起来，您支持吗？',
    overallSatConstruct: '助餐服务整体满意度',
    overallSatQuestion: '总的来说，您对社区助餐服务满意吗？',
    conversionConstruct: '继续使用并推荐的意愿',
    conversionQuestion: '今后您愿意继续使用社区助餐服务，并推荐给身边的老人吗？',
    tierConstruct: '可接受的每餐自付金额',
    tierQuestion: '一顿饭您自己最多愿意付多少钱？',
    tierChoices: ['8 元及以下', '9–12 元', '13–18 元', '18 元以上'],
    keywords: ['社区助餐', '老年人', '服务体验', '满意度', '持续使用意愿'],
    context: '社区助餐是居家养老服务的一部分，服务能否让老人愿意长期使用，取决于饭菜、距离、价格和服务细节。',
  },
  {
    match: /aigc|生成式|大模型|人工智能|ai\s*工具|chatgpt|deepseek|智能助手/iu,
    defaultTitle: '大学生使用 AI 学习工具的体验、规范认知与持续使用意愿调查',
    domainLabel: '高校学习与数字工具',
    shortTitle: '大学生 AI 学习工具',
    groupConstruct: '学科门类',
    groupA: '理工医农类学生',
    groupB: '人文社科类学生',
    statusConstruct: 'AI 工具使用场景',
    statusCategories: ['课程学习和科研都用', '只在课程作业中用', '只用来查资料或润色', '了解但还没用过'],
    scaleConstruct: 'AI 学习工具体验量表',
    dimensions: [
      { code: 'Q3', short: '查找资料与启发思路', question: '您对 AI 工具帮助查找资料、启发思路的效果满意吗？' },
      { code: 'Q4', short: '解题与写作辅助', question: '您对 AI 工具在解题、编程或写作中的辅助效果满意吗？' },
      { code: 'Q5', short: '回答的可靠程度', question: '您觉得 AI 工具给出的内容和引用可靠吗？' },
      { code: 'Q6', short: '使用规范的清晰程度', question: '您所在学校或课程关于使用 AI 的规定清楚吗？' },
      { code: 'Q7', short: '对独立思考的帮助', question: '您觉得使用 AI 工具对自己的独立思考有帮助吗？' },
    ],
    mechanismConstruct: '透明使用声明制度的支持度',
    mechanismQuestion: '如果课程要求在作业中说明 AI 的使用方式，您支持吗？',
    overallSatConstruct: 'AI 学习工具整体满意度',
    overallSatQuestion: '总的来说，您对用 AI 工具辅助学习满意吗？',
    conversionConstruct: '继续规范使用的意愿',
    conversionQuestion: '今后您愿意在遵守规定的前提下继续使用 AI 工具学习吗？',
    tierConstruct: '每月在 AI 工具上的花费',
    tierQuestion: '您每月在 AI 工具上大约花多少钱？',
    tierChoices: ['不花钱', '1–30 元', '31–100 元', '100 元以上'],
    keywords: ['生成式人工智能', '大学生', '学习体验', '使用规范', '持续使用意愿'],
    context: 'AI 工具已进入许多大学生的日常学习，高校需要弄清学生怎样使用、遇到哪些问题，才能把规范定得既清楚又可行。',
  },
  {
    match: /赛事|球赛|足球|篮球|演出|音乐节|演唱会|文旅|景区|旅游|观赛|展会|博物馆/u,
    defaultTitle: '城市文体活动的现场体验、满意度与重游意愿调查',
    domainLabel: '城市文体活动与文旅消费',
    shortTitle: '城市文体活动',
    groupConstruct: '受访者身份',
    groupA: '本地常住居民',
    groupB: '外地来访者',
    statusConstruct: '参与方式',
    statusCategories: ['现场和线上都参与过', '只到过现场', '只在线上关注', '了解但没参与过'],
    scaleConstruct: '活动体验量表',
    dimensions: [
      { code: 'Q3', short: '现场氛围与内容质量', question: '您对活动现场氛围和内容质量满意吗？' },
      { code: 'Q4', short: '场馆设施与秩序', question: '您对场馆设施和现场秩序满意吗？' },
      { code: 'Q5', short: '购票与信息获取', question: '您觉得购票、查询活动信息方便吗？' },
      { code: 'Q6', short: '交通往返与散场疏导', question: '您对往返交通和散场疏导满意吗？' },
      { code: 'Q7', short: '周边餐饮与文创消费', question: '您对活动周边的餐饮和文创消费体验满意吗？' },
    ],
    mechanismConstruct: '凭票享受周边优惠的支持度',
    mechanismQuestion: '如果凭活动票可以在周边商家享受优惠，您支持吗？',
    overallSatConstruct: '活动整体满意度',
    overallSatQuestion: '总的来说，您对这项活动满意吗？',
    conversionConstruct: '再次参与并推荐的意愿',
    conversionQuestion: '今后您愿意再次参加，并推荐给亲友吗？',
    tierConstruct: '单次活动的周边花费',
    tierQuestion: '参加一次活动，您在周边大约会花多少钱？',
    tierChoices: ['50 元及以下', '51–100 元', '101–200 元', '200 元以上'],
    keywords: ['文体活动', '现场体验', '满意度', '重游意愿', '文旅消费'],
    context: '文体活动能把人带到城市里来，但人们愿不愿意再来，取决于现场体验和交通、购票、周边消费这些配套。',
  },
];

const REGIONS = /^(全国|北京|上海|广州|深圳|武汉|重庆|南京|杭州|成都|西安|长沙|苏州|天津|青岛|郑州|合肥|厦门|宁波|济南|沈阳|大连|昆明|福州|长三角|粤港澳|京津冀|川渝)/u;

/** A 32-bit FNV-1a hash of a string: the seed every simulated answer of a topic is drawn from. */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * The topic laid out on the survey structure. A topic close to one of the written templates takes its wording; any
 * other topic gets general wording built from its own words, borrowing the groups and scale items of a questionnaire
 * the project already has.
 */
export function decomposeTopic(rawTopic = '', existingDesign?: Questionnaire | null): DemoBlueprint {
  const input = (rawTopic || existingDesign?.title || '').trim();
  const region = REGIONS.exec(input)?.[1] ?? '样本城市';
  const slug = `topic_${hash32(input || 'demo').toString(16).padStart(8, '0')}`;
  const template = TEMPLATES.find(t => t.match.test(input)) ?? (input ? null : TEMPLATES[0]);
  if (template) {
    const { match: _match, defaultTitle, ...rest } = template;
    void _match;
    const title = input.length >= 8 ? input : defaultTitle;
    return { ...rest, id: `demo-${slug}`, slug, title, subtitle: '教学模拟数据，不作为实际调查结论', region };
  }

  // The thing the topic is about: its words before what the study asks of it ("新能源汽车社区共享充电桩" out of
  // "新能源汽车社区共享充电桩供需错配与动态定价机制调研").
  const stem = input
    .replace(/^.*——/u, '')
    .replace(/^(基于|围绕|关于)/u, '')
    .replace(new RegExp(`^${region}(市|省|地区)?`, 'u'), '')
    .trim();
  const cut = stem.slice(4).search(/的|与|及|和|供需|使用|消费|满意|体验|需求|现状|发展|影响|机制|优化|问题|行为|意愿|调研|调查|研究|分析/u);
  const subject = (cut >= 0 ? stem.slice(0, cut + 4) : stem).slice(0, 16) || '目标服务';
  const shortTitle = subject.slice(0, 12);
  const single = existingDesign?.questions.find(q => q.type === 'single' && q.choices.length >= 2);
  const likerts = (existingDesign?.questions ?? []).filter(q => q.type === 'likert' && q.purpose !== 'screening');
  const aspect = (i: number, short: string, question: string): DemoDimension => ({
    code: (['Q3', 'Q4', 'Q5', 'Q6', 'Q7'] as const)[i],
    short: likerts[i]?.construct?.slice(0, 12) || short,
    question: likerts[i]?.text || question,
  });
  return {
    id: `demo-${slug}`,
    slug,
    domainLabel: `${shortTitle}调查`,
    title: input.length >= 8 ? input : `${region}${subject}的使用体验与满意度调查`,
    shortTitle,
    subtitle: '教学模拟数据，不作为实际调查结论',
    region,
    groupConstruct: single?.construct || '使用频率分组',
    groupA: single?.choices[0]?.label?.slice(0, 18) || '经常使用者',
    groupB: single?.choices[1]?.label?.slice(0, 18) || '偶尔使用者',
    statusConstruct: '使用渠道',
    statusCategories: ['线上线下都用过', '只用过线下', '只用过线上', '了解但还没用过'],
    scaleConstruct: `${shortTitle}体验量表`,
    dimensions: [
      aspect(0, '核心服务质量', `您对${subject}的核心服务质量满意吗？`),
      aspect(1, '环境与设施', `您对${subject}的环境和设施满意吗？`),
      aspect(2, '预约与信息获取', `您觉得预约${subject}、查询相关信息方便吗？`),
      aspect(3, '交通与配套服务', `您对前往${subject}的交通和配套服务满意吗？`),
      aspect(4, '附加体验与社群', `您对${subject}的附加体验和交流氛围满意吗？`),
    ],
    mechanismConstruct: '线上线下权益互通的支持度',
    mechanismQuestion: `如果${subject}的线上和线下权益可以互通，您支持吗？`,
    overallSatConstruct: `${shortTitle}整体满意度`,
    overallSatQuestion: `总的来说，您对${subject}满意吗？`,
    conversionConstruct: '继续使用并推荐的意愿',
    conversionQuestion: `今后您愿意继续使用${subject}，并推荐给亲友吗？`,
    tierConstruct: '每次的相关花费',
    tierQuestion: `每次使用${subject}，您大约会花多少钱？`,
    tierChoices: ['50 元及以下', '51–100 元', '101–200 元', '200 元以上'],
    keywords: [shortTitle, '使用体验', '满意度', '持续使用意愿'],
    context: `${subject}能否留住使用者，取决于核心服务和配套细节；本研究据此设计问卷。`,
  };
}

/* ───────── questionnaire ───────── */

/** The twelve questions of the survey structure, worded for the topic. Variables run Q1 to Q12 in the data. */
export function buildDemoQuestionnaire(bp: DemoBlueprint): Questionnaire {
  const base = { required: true, source: '本研究自编（教学模拟）', min: null, max: null, minLabel: '', maxLabel: '', reverse: false, condition: null };
  const single = (id: string, variable: string, text: string, construct: string, labels: readonly string[], purpose: DesignQuestion['purpose'], analysis: DesignQuestion['analysis'], researchQuestion: string, decisionUse: string): DesignQuestion => ({
    ...base, id, variable, text, type: 'single', purpose, analysis, researchQuestion, construct, decisionUse,
    choices: labels.map((label, i) => ({ code: String(i + 1), label })),
  });
  const likert = (id: string, variable: string, text: string, construct: string, analysis: DesignQuestion['analysis'], researchQuestion: string, decisionUse: string, low = '非常不满意', high = '非常满意', purpose: DesignQuestion['purpose'] = 'research'): DesignQuestion => ({
    ...base, id, variable, text, type: 'likert', purpose, analysis, researchQuestion, construct, decisionUse, choices: [], min: 1, max: 5, minLabel: low, maxLabel: high,
  });
  const questions: DesignQuestion[] = [
    single('q1_group', 'Q1', `您属于以下哪一类？（${bp.groupConstruct}）`, bp.groupConstruct, [bp.groupA, bp.groupB], 'background', 'comparison', '两类受访者的体验与意愿是否不同？', '作为组间比较的分组变量。'),
    single('q2_status', 'Q2', `您目前的${bp.statusConstruct}是？`, bp.statusConstruct, bp.statusCategories, 'background', 'comparison', '不同参与方式的人体验是否不同？', '描述参与结构，并作为分组变量。'),
    ...bp.dimensions.map((d, i) => likert(`q${i + 3}_aspect`, d.code, d.question, bp.scaleConstruct, 'measurement', `受访者对“${d.short}”的评价如何？`, '计算该方面的均值，用于比较与重要性—表现分析。')),
    likert('q8_attention', 'Q8', '本题用于检查作答是否认真，请直接选择“4”。', '注意力检查', 'description', '受访者是否认真读题？', '未选“4”的答卷在质量筛查中剔除。', '1', '5', 'screening'),
    likert('q9_mechanism', 'Q9', bp.mechanismQuestion, bp.mechanismConstruct, 'association', '受访者是否支持这项机制？', '与持续意愿做关联分析。', '非常不支持', '非常支持'),
    likert('q10_overall', 'Q10', bp.overallSatQuestion, bp.overallSatConstruct, 'association', '整体满意度处于什么水平？', '作为重要性—表现分析的总体满意度。'),
    likert('q11_intention', 'Q11', bp.conversionQuestion, bp.conversionConstruct, 'association', '体验与满意度和持续意愿有怎样的关联？', '作为回归分析的结果变量。', '非常不愿意', '非常愿意'),
    single('q12_tier', 'Q12', bp.tierQuestion, bp.tierConstruct, bp.tierChoices, 'research', 'description', '受访者能接受怎样的花费？', '描述花费档位分布，并与分组做交叉分析。'),
  ];
  return parseQuestionnaire(JSON.stringify({
    schema: 'questionnaire-design/v1',
    classification: 'proposed',
    title: `${bp.shortTitle}使用体验调查问卷（教学模拟）`,
    objective: `了解${bp.groupA}与${bp.groupB}在${bp.shortTitle}上的参与方式、五个方面的体验、整体满意度与持续使用意愿。`,
    population: `${bp.region}的${bp.groupA}与${bp.groupB}`,
    geography: bp.region,
    period: '教学模拟，不对应真实调查时间',
    recruitment: '线上公开链接与现场自愿作答相结合的便利样本（教学模拟）；未建立抽样框，结论不外推到总体。',
    introduction: '您好！本问卷用于课程教学中的调查方法演示，匿名作答，约需三分钟。',
    pilotNotes: '',
    questions,
  }));
}

/* ───────── simulated answers ───────── */

/** A small seeded generator (mulberry32), so a topic always draws the same answers. */
function generator(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  // A standard normal from twelve uniforms (Irwin–Hall): only additions, which IEEE 754 makes the same in every
  // engine. Math.log and Math.cos need not be correctly rounded, and a last-bit difference between Node and a browser
  // once changed a rounded answer, so a topic's simulation differed by one respondent between them.
  const normal = () => {
    let sum = 0;
    for (let k = 0; k < 12; k++) sum += next();
    return sum - 6;
  };
  /** The items in an order drawn from the generator (Fisher–Yates), the same in every engine. */
  const shuffle = <T,>(items: readonly T[]) => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  };
  const pick = (weights: readonly number[]) => {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = next() * total;
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
    return weights.length - 1;
  };
  return { next, normal, pick, shuffle };
}

const likertOf = (value: number) => String(Math.min(5, Math.max(1, Math.round(value))));

/**
 * Simulated answers to the demo questionnaire. Each respondent has a general satisfaction drawn on its own; the five
 * aspects, the mechanism, overall satisfaction and intention follow it with their own noise, so they correlate as
 * real scales do without any value being set. About one answer in twenty-five fails the attention item, one in fifty
 * gives the same answer to every aspect, and one in a hundred is a resubmitted copy; a few spending answers are missing.
 * Single-choice answers carry the questionnaire's labels, as an exported survey does.
 */
export function simulateDemoResponses(bp: DemoBlueprint, design: Questionnaire, options: { seed?: number; issued?: number } = {}): { table: SurveyTable; issued: number } {
  const seed = options.seed ?? hash32(`${bp.id}:${bp.title}`);
  const rng = generator(seed);
  const issued = options.issued ?? 600 + Math.floor(rng.next() * 81);
  // Tendencies of this topic's population, drawn once: where each aspect sits and how strongly it moves with
  // general satisfaction. Two aspects are drawn lower than the rest, as most services have a weak spot or two.
  const weak = rng.shuffle([0, 1, 2, 3, 4]).slice(0, 2);
  const centre = [0, 1, 2, 3, 4].map(i => (weak.includes(i) ? 2.9 + rng.next() * 0.5 : 3.6 + rng.next() * 0.6));
  const loading = [0, 1, 2, 3, 4].map(() => 0.65 + rng.next() * 0.35);
  const groupTilt = [0, 1, 2, 3, 4].map(() => (rng.next() - 0.5) * 0.5);
  const weight = [0, 1, 2, 3, 4].map(() => 0.5 + rng.next());
  const weightSum = weight.reduce((a, b) => a + b, 0);
  const shareA = 0.44 + rng.next() * 0.14;
  const statusA = [0.5 + rng.next() * 0.15, 0.12 + rng.next() * 0.08, 0.1 + rng.next() * 0.1, 0.08 + rng.next() * 0.06];
  const statusB = [0.35 + rng.next() * 0.15, 0.2 + rng.next() * 0.1, 0.06 + rng.next() * 0.08, 0.12 + rng.next() * 0.08];
  const tierA = [0.18, 0.4, 0.3, 0.12], tierB = [0.32, 0.4, 0.2, 0.08];

  const labels = (variable: string) => design.questions.find(q => q.variable === variable)?.choices.map(c => c.label) ?? [];
  const groupLabels = labels('Q1'), statusLabels = labels('Q2'), tierLabels = labels('Q12');
  const rows: string[][] = [];
  for (let i = 0; i < issued; i++) {
    // A resubmitted copy of an earlier answer.
    if (rows.length > 20 && rng.next() < 0.01) { rows.push([...rows[Math.floor(rng.next() * rows.length)]]); continue; }
    const isA = rng.next() < shareA;
    const status = rng.pick(isA ? statusA : statusB);
    const theta = rng.normal() + (status === 0 ? 0.25 : status === 3 ? -0.4 : 0);
    const aspects = centre.map((c, d) => c + loading[d] * theta + (isA ? groupTilt[d] : -groupTilt[d]) + rng.normal() * 0.6);
    const mechanism = 3.7 + 0.45 * theta + (status === 0 ? 0.2 : 0) + rng.normal() * 0.8;
    const overall = aspects.reduce((s, a, d) => s + a * weight[d], 0) / weightSum + 0.3 * theta + rng.normal() * 0.5;
    const intention = 0.6 + 0.55 * overall + 0.2 * mechanism - (status === 3 ? 0.35 : 0) + rng.normal() * 0.55;
    let scale = aspects.map(likertOf);
    let attention = '4';
    if (rng.next() < 0.02) { const same = likertOf(1 + rng.next() * 4); scale = scale.map(() => same); attention = same; }
    else if (rng.next() < 0.04) attention = String([1, 2, 3, 5][Math.floor(rng.next() * 4)]);
    const tier = rng.next() < 0.01 ? '-99' : tierLabels[rng.pick(isA ? tierA : tierB)];
    rows.push([groupLabels[isA ? 0 : 1], statusLabels[status], ...scale, attention, likertOf(mechanism), likertOf(overall), likertOf(intention), tier]);
  }
  const headers = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11', 'Q12'];
  const columnLabels: Record<string, string> = {
    Q1: bp.groupConstruct, Q2: bp.statusConstruct,
    ...Object.fromEntries(bp.dimensions.map(d => [d.code, d.short])),
    Q8: '注意力检查', Q9: bp.mechanismConstruct, Q10: bp.overallSatConstruct, Q11: bp.conversionConstruct, Q12: bp.tierConstruct,
  };
  return { table: { headers, rows, skippedBlankLines: 0, delimiter: ',', columnLabels }, issued };
}

async function sha256(text: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
const csvOf = (table: SurveyTable) => [table.headers, ...table.rows].map(row => row.map(cell => (/[",\n]/u.test(cell) ? `"${cell.replace(/"/gu, '""')}"` : cell)).join(',')).join('\n');

/** The questionnaire and the raw simulated answers for a topic. */
export async function buildDemoStudy(topic = '', existingDesign?: Questionnaire | null): Promise<DemoStudy> {
  const blueprint = decomposeTopic(topic, existingDesign);
  const design = buildDemoQuestionnaire(blueprint);
  const { table } = simulateDemoResponses(blueprint, design);
  const dataset: DatasetValue = {
    name: `${blueprint.slug}_teaching_simulation.csv`,
    sourceHash: await sha256(csvOf(table)),
    kind: 'simulated',
    table,
    missingCodes: ['-99'],
    lineage: [],
  };
  return { blueprint, design, dataset };
}

/* ───────── the report, computed ───────── */

const SCREENED_OUT: ReadonlySet<RuleId> = new Set(['attention', 'straightlining']);

/** References the demo report may cite: the citation standard and the competition notice the format follows. */
const STANDARD_REFERENCES = [
  '[1] 国家市场监督管理总局, 国家标准化管理委员会. 信息与文献 参考文献著录规则: GB/T 7714—2015[S]. 北京: 中国标准出版社, 2015.',
  '[2] 中国商业统计学会全国大学生市场调查与分析大赛组委会. 关于第十七届全国大学生市场调查与分析大赛的通知: 中商统〔2026〕33号[EB/OL]. (2026-09-21). http://www.china-cssc.org/show-304-2179-1.html.',
];

/** The line the AI appendix carries until a model drafts the narrative sections. */
export const UNDRAFTED_NOTE = '叙述性章节尚未起草；如交由大语言模型起草，起草所用模型与方式在此补记。';

/**
 * Screens the simulated answers, runs the study's analyses on what the screening keeps, registers each result and
 * places it in its blueprint section, then writes the back matter from what was actually done. The report's
 * narrative sections stay empty: they are for the author, or for the drafting pipeline, to write.
 */
export async function computeDemoReport(study: DemoStudy, options: { onLog?: (line: string) => void } = {}): Promise<{ report: EditorContent; dataset: DatasetValue }> {
  const { blueprint: bp, design, dataset } = study;
  const missing = dataset.missingCodes;
  const raw = dataset.table;
  const col = (variable: string) => { const i = raw.headers.indexOf(variable); if (i < 0) throw Error(`模拟数据缺少「${variable}」列`); return i; };
  const five = ['Q3', 'Q4', 'Q5', 'Q6', 'Q7'].map(col);
  const screen = evaluateQuality(raw, { idColumn: null, duration: null, straightlining: { columns: five }, attention: { column: col('Q8'), expected: '4' }, duplicateIp: null, duplicateAnswers: true }, missing);
  const { table, removed } = keptTable(raw, screen, SCREENED_OUT);
  const screenedLine = `质控：剔除注意力题未通过与直线作答 ${removed} 份，答案完全重复的答卷仅标记、未剔除；保留 ${table.rows.length} / ${raw.rows.length} 份`;
  const screened: DatasetValue = { ...dataset, table, lineage: [...dataset.lineage, screenedLine] };
  const identity = await datasetIdentity(dataset.sourceHash, 'utf-8', table);
  const label = (variable: string) => raw.columnLabels?.[variable] ?? variable;
  const source = { sourceName: dataset.name, sourceUrl: '', sourceHash: dataset.sourceHash, classification: 'simulated' as const };
  const log = (line: string) => options.onLog?.(line);

  let content = createEditorContent();
  const sections = blueprintOutline({ nodes: undefined })
    .filter(x => x.node.kind !== 'appendix' && x.node.kind !== 'references')
    .map(({ node, title }) => ({ id: `s-${node.id.replace(/[^a-z0-9]+/giu, '-')}`, title, body: '', source: '' }));
  content = parseEditorContent({
    ...content,
    title: bp.title,
    subtitle: `基于 ${table.rows.length} 份教学模拟样本的调查报告（教学模拟数据，不作为实际调查结论）`,
    report: sections,
  });

  let seq = 0;
  const basic = async (method: PlanMethod, x: string | null, y: string | null, question: string, scale: PlanScale | null = null) => {
    const node = { id: `demo-node-${++seq}`, method, x: x === null ? null : col(x), y: y === null ? null : col(y), question, branch: '全部样本', filter: null, scale };
    try {
      const branch = filterPlanSample(table, null, missing);
      const result = runPlanNode(branch.table, node, missing);
      const calculation = calculationReceipt(node, table.headers, missing, identity.interpretationHash, null, branch.evidence, branch.table.rows.length, null, null);
      const variables = (scale ? scale.columns.map(i => label(table.headers[i])) : [x, y].filter((v): v is string => !!v).map(label)).slice(0, 4);
      const snapshot = await snapshotRecipe(result, { title: question, ...source, variables }, undefined, calculation);
      content = appendRegisteredResult(content, { result: snapshot });
      content = placeResult(content, snapshot.id).content;
      log(`ok ${method} ${question}`);
    } catch (error) {
      log(`skipped ${method} ${question}: ${(error as Error).message}`);
    }
  };
  const advanced = async (spec: AdvancedSpec, name: string) => {
    try {
      const run = runAdvanced(spec, table, missing);
      if ('refused' in run) { log(`refused ${name}: ${run.refused}`); return; }
      content = applyReportInsert(content, await advancedInsert(run, { name: dataset.name, hash: dataset.sourceHash, simulated: true })).content;
      log(`ok ${spec.method} ${name}`);
    } catch (error) {
      log(`skipped ${name}: ${(error as Error).message}`);
    }
  };

  // The screening, registered as its own result in the data-cleaning section.
  const qc = await snapshotRecipe(qualityResult(screen, SCREENED_OUT, removed), { title: '问卷质量筛查', ...source, variables: ['注意力题', '直线作答', '重复答卷'] });
  content = placeResult(appendRegisteredResult(content, { result: qc }), qc.id).content;

  await basic('frequency', 'Q1', null, `受访者的${label('Q1')}构成`);
  await basic('frequency', 'Q2', null, `受访者的${label('Q2')}分布`);
  await basic('frequency', 'Q12', null, `受访者的${label('Q12')}分布`);
  await basic('alpha', null, null, `${bp.scaleConstruct}的内部一致性`, { columns: five, reverse: [], min: 1, max: 5, construct: bp.scaleConstruct });
  await basic('crosstab', 'Q1', 'Q2', `不同${label('Q1')}的${label('Q2')}差异`);
  await basic('crosstab', 'Q1', 'Q12', `不同${label('Q1')}的${label('Q12')}差异`);
  await basic('crosstab', 'Q2', 'Q12', `不同${label('Q2')}的${label('Q12')}差异`);
  // The rating dimensions are read together, not one chart each: their whole answer distributions, every dimension
  // across the groups of each background question (one test per dimension, Holm-corrected, with effect sizes), and the
  // correlations among them.
  const dimensions = [...five, col('Q9'), col('Q10'), col('Q11')];
  await advanced({ method: 'likert', items: dimensions, scale: { min: 1, max: 5 } }, '各评价维度的作答分布');
  await advanced({ method: 'profile', group: col('Q1'), dimensions }, `不同${label('Q1')}的各评价维度差异`);
  await advanced({ method: 'profile', group: col('Q2'), dimensions }, `不同${label('Q2')}的各评价维度差异`);
  await advanced({ method: 'correlation', variables: dimensions }, '各评价维度之间的相关');
  await advanced({ method: 'validity', items: five }, `${bp.scaleConstruct}的因子结构`);
  await advanced({ method: 'regression', outcome: col('Q11'), predictors: [...five, col('Q9'), col('Q10')] }, `${label('Q11')}的影响因素`);
  await advanced({ method: 'ipa', performance: five, importance: null, overall: col('Q10') }, '五个方面的重要性与表现');
  await advanced({ method: 'cluster', variables: five, k: 3 }, '基于五个方面体验的受访者分群');

  const results = content.quality?.results ?? [];
  const questionnaire = design.questions.map((q, i) => {
    const options = q.choices.map(c => `${c.code}. ${c.label}`).join('；');
    return `Q${i + 1}. ${q.text}${options ? `（${options}）` : q.type === 'likert' ? `（1 = ${q.minLabel}，5 = ${q.maxLabel}）` : ''}`;
  }).join('\n');
  const flagged = screen.rules.filter(r => r.flagged > 0).map(r => `${r.label} ${r.flagged} 份`).join('、') || '无';
  content = parseEditorContent({
    ...content,
    report: [
      ...content.report,
      { id: 's-references', title: '参考文献', body: STANDARD_REFERENCES.join('\n'), source: '' },
      { id: 's-appendix-1', title: '附录一 调查问卷', body: `本附录列出本次教学模拟研究使用的问卷全部题项。\n${questionnaire}`, source: '' },
      { id: 's-appendix-2', title: '附录二 人工智能（AI）工具使用说明', body: [
        `本报告为教学模拟演示：数据为证见平台按问卷结构模拟生成的 ${raw.rows.length} 份作答，不是实际调查所得；质量筛查标记 ${flagged}，剔除 ${removed} 份后保留 ${table.rows.length} 份用于分析。`,
        '各项统计结果由证见平台的分析引擎在该模拟数据上计算并登记，分析各节的方法说明、公式与读数由平台的确定性模板写出。',
        UNDRAFTED_NOTE,
        '全部内容仍须由作者逐段核对。',
      ].join('\n'), source: '' },
      { id: 's-appendix-3', title: '附录三 数据与分析可复现说明', body: [
        `数据文件：${dataset.name}；${raw.rows.length} 行 × ${raw.headers.length} 列（筛查后 ${table.rows.length} 行）；缺失值编码 ${missing.join('、')}；数据指纹 ${dataset.sourceHash.slice(0, 16)}…（教学模拟数据）。`,
        '本报告登记的全部分析结果如下，每项附结果指纹，可在平台中按同一数据与参数复算：',
        ...results.map((r, i) => `${i + 1}. ${r.title}：方法 ${r.method}，有效样本 ${r.n}，结果指纹 ${r.resultHash.slice(0, 16)}…`),
      ].join('\n'), source: '' },
    ],
  });
  return { report: content, dataset: screened };
}

/** The study and its computed report: what loading a teaching demo puts in a project. */
export async function buildDemoPack(topic = '', existingDesign?: Questionnaire | null, options: { onLog?: (line: string) => void } = {}): Promise<DemoPack> {
  const study = await buildDemoStudy(topic, existingDesign);
  const { report, dataset } = await computeDemoReport(study, options);
  return { ...study, dataset, report };
}

/**
 * Records in the AI appendix that a model drafted the narrative sections, replacing the line that said they were not
 * yet drafted. A report without that appendix is returned as it is.
 */
export function noteDrafting(content: EditorContent, line: string): EditorContent {
  let changed = false;
  const report = content.report.map(s => {
    if (!/^附录.*人工智能/u.test(s.title) || s.body.includes(line)) return s;
    changed = true;
    return { ...s, body: s.body.includes(UNDRAFTED_NOTE) ? s.body.replace(UNDRAFTED_NOTE, line) : `${s.body}\n${line}` };
  });
  return changed ? { ...content, report } : content;
}
