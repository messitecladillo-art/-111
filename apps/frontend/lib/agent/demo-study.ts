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
import { buildDiagramResultSnapshot, buildTopicActionRoadmapSpec, buildTopicFrameworkSpec, buildWordCloudResultSnapshot } from '../diagram-figures.ts';
import type { DatasetValue } from '../canvas/execute.ts';
import { evaluateQuality, keptTable, qualityResult, type RuleId } from '../data-quality.ts';
import { applyReportFrame, createEditorContent, parseEditorContent, type EditorContent, type ReportSection } from '../editor-model.ts';
import { parseQuestionnaire, type DesignQuestion, type Questionnaire } from '../questionnaire.ts';
import { datasetIdentity } from '../questionnaire-mapping.ts';
import { type ReferenceEntry } from '../references.ts';
import { blueprintOutline } from '../report-blueprint.ts';
import { DEFAULT_REPORT_FORMAT_SETTINGS, DEFAULT_REPORT_OPTIONS } from '../report-format.ts';
import { approveReportFrame, createReportFrame } from '../report-frame.ts';
import { applyReportInsert } from '../report-insert.ts';
import { SIMULATED_MARK, placeResult, targetSection, type ExhibitKind } from '../report-placement.ts';
import { snapshotRecipe, type ResultSnapshot } from '../research-quality.ts';
import { appendRegisteredResult } from '../result-registration.ts';
import type { SurveyTable } from '../survey-analysis.ts';
import { generateInterviewCorpus, humanizeTextWithSkills } from './interview-corpus-deai.ts';

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
  {
    match: /正大|水饺|预制菜|咖啡|好咖|鸡肉|无抗|售货机|轻食|茶饮|速冻/u,
    defaultTitle: '食品饮料新品口味感知、场景渠道触达与复购意愿调查',
    domainLabel: '快消食饮与正大企业命题',
    shortTitle: '正大食品与新消费',
    groupConstruct: '日常食饮消费层级',
    groupA: 'Z世代高频尝鲜群体',
    groupB: '家庭日常刚需采购者',
    statusConstruct: '当前购买渠道',
    statusCategories: ['线下商超/自动售货机常买', '即时零售/外卖平台下单', '偶尔线上拼团购入', '关注但暂未购买'],
    scaleConstruct: '食饮产品感知与复购量表',
    dimensions: [
      { code: 'Q3', short: '口味研发与减糖/低脂配方', question: '您对产品风味口感及配料健康透明度满意吗？' },
      { code: 'Q4', short: '烹饪还原度与便携封装', question: '您对食用制备便利性及包装锁鲜体验满意吗？' },
      { code: 'Q5', short: '质价感知与单份性价比', question: '您觉得当前定价与日常份量配置合理吗？' },
      { code: 'Q6', short: '品牌信任与食品溯源背书', question: '您对企业品控溯源与冷链配送卫生放心吗？' },
      { code: 'Q7', short: '创意跨界联名与话题吸引', question: '产品的创新风味或联名场景对您的尝鲜驱动大吗？' },
    ],
    mechanismConstruct: '定制小份多拼与企业命题优化支持度',
    mechanismQuestion: '如果推出可自选组合的小份尝鲜装与营养标签可视化展示，您愿意复购吗？',
    overallSatConstruct: '产品与品牌整体满意度',
    overallSatQuestion: '总的来说，您对该食饮产品与消费体验满意吗？',
    conversionConstruct: '常态化复购并口碑推荐意愿',
    conversionQuestion: '今后您愿意将其纳入日常饮食清单并向亲友推荐吗？',
    tierConstruct: '单次采购预算区间',
    tierQuestion: '您单次购买该品类产品通常预算在什么区间？',
    tierChoices: ['20 元及以下', '21–45 元', '46–80 元', '80 元以上'],
    keywords: ['食品创新', '正大命题', '购买偏好', '复购意愿', '特征重要度'],
    context: '面对 Z 世代健康轻食与家庭快捷餐厨双重需求，食品企业需要识别口感、配料透明与渠道可达对复购转化的真实权重。',
  },
  {
    match: /低空|无人机|无人驾驶|自动驾驶|智能眼镜|机器人|智能客服|utaut/iu,
    defaultTitle: '新兴智能硬件与低空应用的技术信任、场景接受度与付费意愿调查',
    domainLabel: '低空经济与智慧智能终端',
    shortTitle: '新兴智能技术采纳',
    groupConstruct: '科技产品涉入度',
    groupA: '早期科技尝鲜用户',
    groupB: '审慎实用观望人群',
    statusConstruct: '接触与体验状态',
    statusCategories: ['高频日常或工作场景使用', '线下体验/试乘试戴过', '仅在短视频看过评测', '听说但仍存疑虑'],
    scaleConstruct: 'UTAUT-II 拓展技术采纳量表',
    dimensions: [
      { code: 'Q3', short: '功能效能与效率提升预期', question: '您认可该智能技术或低空服务在日常场景中的效率提升吗？' },
      { code: 'Q4', short: '交互易用性与学习门槛', question: '您觉得硬件操控或低空配送/预约流程直观易上手吗？' },
      { code: 'Q5', short: '隐私合规与运行安全信任', question: '您对该技术运行中的人身安全与个人数据隐私保护放心吗？' },
      { code: 'Q6', short: '价格价值与维护成本匹配', question: '相比同类传统方案，您认为它的收费或售价物有所值吗？' },
      { code: 'Q7', short: '同辈口碑与社群示范影响', question: '身边朋友评价或行业示范案例对您的使用意愿影响大吗？' },
    ],
    mechanismConstruct: '安全认证分级与透明提示支持度',
    mechanismQuestion: '若产品加装明显的安全运行认证与一键人工接管机制，您会更愿意尝试吗？',
    overallSatConstruct: '新兴智能场景整体认可度',
    overallSatQuestion: '总的来说，您对该新兴智能/低空应用的当前表现满意吗？',
    conversionConstruct: '实际下单或推广应用意愿',
    conversionQuestion: '未来一年内您愿意为相关智能硬件或服务付费并推荐他人吗？',
    tierConstruct: '单次服务可接受溢价区间',
    tierQuestion: '相比传统方式，您最多愿意额外支付多少便捷/智能服务溢价？',
    tierChoices: ['不愿付溢价', '5 元及以下', '6–15 元', '15 元以上'],
    keywords: ['低空经济', '智能终端', 'UTAUT模型', '技术信任', '采纳意愿'],
    context: '以低空配送、自动驾驶与智能可穿戴为代表的新兴业态正处市场培育期，安全感、隐私顾虑与价格价值决定了大众跃迁速度。',
  },
  {
    match: /情绪|悦己|谷子|盲盒|联名|宠物|即时零售|社区团购|二手|会员/u,
    defaultTitle: '青年情绪价值消费、圈层认同与复购转化机制调查',
    domainLabel: '情绪圈层与新消费模式',
    shortTitle: '情绪与圈层新消费',
    groupConstruct: '消费者年龄层',
    groupA: '18–25 岁青年/学生族',
    groupB: '26 岁以上在职消费群体',
    statusConstruct: '消费频次与卷入度',
    statusCategories: ['每月稳定复购核心玩家', '仅因喜爱 IP/刚需偶尔购入', '曾经购买现已趋于理性', '仅围观关注尚未下单'],
    scaleConstruct: '情绪价值与商业转化量表',
    dimensions: [
      { code: 'Q3', short: '情绪舒压与悦己治愈感知', question: '该类消费是否能显著带来快乐、舒压或陪伴满足感？' },
      { code: 'Q4', short: 'IP 设计共鸣与圈层社交标签', question: '您对商品创意设计或圈层同好认同感满意吗？' },
      { code: 'Q5', short: '实用耐用品质与售后保障', question: '相比颜值与噱头，您认为实物品质和售后规范达标吗？' },
      { code: 'Q6', short: '定价合理性与隐性规则透明', question: '您觉得会员权益/抽取机制/配送费规则清楚公平吗？' },
      { code: 'Q7', short: '线下快闪体验与社群互动', question: '线上社群或线下主题快闪活动能否增强您的消费黏性？' },
    ],
    mechanismConstruct: '透明配比/实用融合升级支持度',
    mechanismQuestion: '若产品增强日常实用属性并明确售后与定价透明机制，您支持吗？',
    overallSatConstruct: '情绪与圈层消费整体满意度',
    overallSatQuestion: '总的来说，您对该消费体验的性价比与获得感满意吗？',
    conversionConstruct: '持续支持并长期活跃意愿',
    conversionQuestion: '未来半年您愿意继续为同系列优质商品买单并自发安利吗？',
    tierConstruct: '月均情绪/圈层消费支出',
    tierQuestion: '您每月在该类悦己或圈层消费上的预算大约是多少？',
    tierChoices: ['50 元及以下', '51–150 元', '151–400 元', '400 元以上'],
    keywords: ['情绪消费', '圈层认同', '即时体验', '消费者行为', '复购黏性'],
    context: '从“谷子经济”“宠物拟人化”到“即时零售”，消费者既为情绪瞬时愉悦买单，也会迅速以实用性与透明规则检验长期忠诚度。',
  },
  {
    match: /无陪护|病房|医护|医疗|陪护|医院|疫苗|健康/u,
    defaultTitle: '医院便民医疗试点与家庭健康服务信任度及满意度调查',
    domainLabel: '公共卫生与医疗试点服务',
    shortTitle: '医院便民与健康服务',
    groupConstruct: '就医角色视角',
    groupA: '就诊患者与直接体验人',
    groupB: '陪护家属与缴费决策者',
    statusConstruct: '服务使用经历',
    statusCategories: ['全程使用过该医疗试点服务', '部分环节接触体验过', '仅在就医时听说了解', '尚不清楚具体流程'],
    scaleConstruct: '医疗照护服务感知量表',
    dimensions: [
      { code: 'Q3', short: '护理员/医护专业操作水平', question: '您对护理或医疗团队的专业操作技能和责任心满意吗？' },
      { code: 'Q4', short: '收费公开与医保分担可承受度', question: '您觉得服务日费标准透明度及家庭负担可接受吗？' },
      { code: 'Q5', short: '陪护沟通反馈与探视制度便利', question: '医患/护患间日常状态反馈及探视安排方便放心吗？' },
      { code: 'Q6', short: '病区安全隐私与饮食照料细节', question: '您对住院期间患者隐私保护、安全监护和餐食照料满意吗？' },
      { code: 'Q7', short: '缓解家庭陪护人力压力效果', question: '该试点服务在减轻子女请假陪护压力方面帮助明显吗？' },
    ],
    mechanismConstruct: '日费明细公示与分级照护机制支持度',
    mechanismQuestion: '如果推行按护理等级明码标价并开通家属日报小程序，您支持吗？',
    overallSatConstruct: '医疗便民试点整体满意度',
    overallSatQuestion: '总的来说，您对当前医疗/无陪护试点服务的质量满意吗？',
    conversionConstruct: '优先选择与主动推荐意愿',
    conversionQuestion: '若亲友未来有住院照护需要，您愿意推荐并优先选用该服务吗？',
    tierConstruct: '可接受日均自付护理费用',
    tierQuestion: '在医保外，您家庭每天最多能接受多高的专业照护自付费用？',
    tierChoices: ['80 元及以下', '81–150 元', '151–220 元', '220 元以上'],
    keywords: ['无陪护病房', '患者满意度', '家庭减负', 'IPA矩阵', '医疗服务'],
    context: '在“一人住院全家忙”的现实痛点下，评估无陪护病房等医疗试点必须兼顾护理专业度、家属知情安心感与分层费用可及性。',
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

const AGE_BRACKETS = ['18–30 岁青年', '31–45 岁中青年', '46–59 岁中年', '60 岁及以上群体'] as const;
const USAGE_FREQ = ['每周多次高频使用', '每月数次常规使用', '偶尔体验尝鲜', '了解但尚少使用'] as const;
const OUTREACH_CHANNELS = ['社区/线下门店现场指引', '微信小程序或专属弹窗提醒', '亲友熟人或社群口碑推荐', '客服热线或专员面对面协助'] as const;

/** The twenty structured questions of the survey design, preserving Q1..Q12 semantics while extending multi-factor coverage to Q13..Q20. */
export function buildDemoQuestionnaire(bp: DemoBlueprint): Questionnaire {
  const base = { required: true, source: '本研究自编（教学模拟）', min: null, max: null, minLabel: '', maxLabel: '', reverse: false, condition: null };
  const single = (id: string, variable: string, text: string, construct: string, labels: readonly string[], purpose: DesignQuestion['purpose'], analysis: DesignQuestion['analysis'], researchQuestion: string, decisionUse: string): DesignQuestion => ({
    ...base, id, variable, text, type: 'single', purpose, analysis, researchQuestion, construct, decisionUse,
    choices: labels.map((label, i) => ({ code: String(i + 1), label })),
  });
  const likert = (id: string, variable: string, text: string, construct: string, analysis: DesignQuestion['analysis'], researchQuestion: string, decisionUse: string, low = '非常不满意', high = '非常满意', purpose: DesignQuestion['purpose'] = 'research'): DesignQuestion => ({
    ...base, id, variable, text, type: 'likert', purpose, analysis, researchQuestion, construct, decisionUse, choices: [], min: 1, max: 5, minLabel: low, maxLabel: high,
  });
  const painChoices = [bp.dimensions[0].short, bp.dimensions[1].short, bp.dimensions[2].short, '收费规则与沟通响应'];
  const questions: DesignQuestion[] = [
    single('q1_group', 'Q1', `您属于以下哪一类？（${bp.groupConstruct}）`, bp.groupConstruct, [bp.groupA, bp.groupB], 'background', 'comparison', '两类受访者的体验与意愿是否不同？', '作为组间比较的分组变量。'),
    single('q2_status', 'Q2', `您目前的${bp.statusConstruct}是？`, bp.statusConstruct, bp.statusCategories, 'background', 'comparison', '不同参与方式的人体验是否不同？', '描述参与结构，并作为分组变量。'),
    ...bp.dimensions.map((d, i) => likert(`q${i + 3}_aspect`, d.code, d.question, bp.scaleConstruct, 'measurement', `受访者对“${d.short}”的评价如何？`, '计算核心维度均值，用于三因子结构效度检验与 IPA 诊断。')),
    likert('q8_attention', 'Q8', '本题用于检查作答是否认真，请直接选择“4”。', '注意力检查', 'description', '受访者是否认真读题？', '未选“4”的答卷在质量筛查中剔除。', '1', '5', 'screening'),
    likert('q9_mechanism', 'Q9', bp.mechanismQuestion, bp.mechanismConstruct, 'association', '受访者是否支持这项机制？', '与持续意愿做关联分析。', '非常不支持', '非常支持'),
    likert('q10_overall', 'Q10', bp.overallSatQuestion, bp.overallSatConstruct, 'association', '整体满意度处于什么水平？', '作为重要性—表现分析的总体满意度。'),
    likert('q11_intention', 'Q11', bp.conversionQuestion, bp.conversionConstruct, 'association', '体验与满意度和持续意愿有怎样的关联？', '作为回归分析的结果变量。', '非常不愿意', '非常愿意'),
    single('q12_tier', 'Q12', bp.tierQuestion, bp.tierConstruct, bp.tierChoices, 'research', 'description', '受访者能接受怎样的花费？', '描述花费档位分布，并与人群细分做交叉分析。'),
    single('q13_age', 'Q13', '您的年龄处于以下哪个区间？', '受访者年龄结构', AGE_BRACKETS, 'background', 'comparison', '不同年龄层受访者的信息触达与需求偏好有何差异？', '评估人口代表性并定位分渠道沟通策略。'),
    single('q14_frequency', 'Q14', `过去三个月内，您体验或关注「${bp.shortTitle}」的频次大约是？`, '实际接触频次', USAGE_FREQ, 'research', 'comparison', '高频与低频用户的评价重点是否一致？', '区分习惯用户与观望流失风险群体。'),
    likert('q15_transparency', 'Q15', `关于${bp.shortTitle}的价格细则、服务边界或使用提示，信息公示是否清楚透明？`, '规则指引透明度', 'measurement', '信息与规则透明度如何影响规范感知与满意度？', '纳入制度支持维度（F2）与 IPA 象限诊断。', '非常不清楚', '非常清楚'),
    likert('q16_responsiveness', 'Q16', `遇到临时调整或使用问题时，${bp.shortTitle}相关窗口与工作人员的响应解决是否及时？`, '反馈响应与衔接效率', 'measurement', '异常兜底与人工响应效率处于什么水平？', '纳入制度支持维度（F2）与归因回归。'),
    likert('q17_trust', 'Q17', `结合身边人反馈，您对${bp.shortTitle}整体运行安全性与可靠性有多放心？`, '安全信任与口碑评价', 'measurement', '安全信任与口碑背书对留存有多大拉动作用？', '纳入信任认同维度（F3）检验。', '非常不放心', '非常放心'),
    likert('q18_fit', 'Q18', `「${bp.shortTitle}」的实际供给在多大程度上减轻了您的日常顾虑并契合生活需求？`, '场景契合与心理获得感', 'measurement', '场景契合感如何转化为长期推荐行为？', '纳入信任认同维度（F3）检验。', '非常不契合', '非常契合'),
    single('q19_painpoint', 'Q19', `在后续改进中，您认为「${bp.shortTitle}」最需要优先补齐的一项短板是？`, '首要改善诉求', painChoices, 'research', 'description', '受访者主观最迫切的改善环节在哪里？', '与 IPA 客观短板交叉印证并按聚类群体分派整改。'),
    single('q20_channel', 'Q20', `如果「${bp.shortTitle}」优化规则与活动通知，您最容易看到且信赖的信息渠道是？`, '首选信息触达渠道', OUTREACH_CHANNELS, 'research', 'description', '哪类触达渠道最契合目标人群的获取习惯？', '为不同年龄与聚类人群精准配置政策宣传与落地渠道。'),
  ];
  return parseQuestionnaire(JSON.stringify({
    schema: 'questionnaire-design/v1',
    classification: 'proposed',
    title: `${bp.shortTitle}使用体验调查问卷（教学模拟）`,
    objective: `系统评估${bp.groupA}与${bp.groupB}在${bp.shortTitle}上的参与结构、三因子体验测量（核心表现、制度规范、信任契合）、整体满意度、痛点诉求与持续使用意愿。`,
    population: `${bp.region}的${bp.groupA}与${bp.groupB}`,
    geography: bp.region,
    period: '教学模拟，不对应真实调查时间',
    recruitment: '线上公开链接与现场自愿作答相结合的便利样本（教学模拟）；未建立抽样框，结论不外推到总体。',
    introduction: '您好！本问卷用于调查研究方法教学演示，共二十题，匿名作答，约需五分钟，谢谢您的配合。',
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
  const issued = options.issued ?? 620 + Math.floor(rng.next() * 71);
  // Topic-level aspect difficulties & factor loadings using Irwin-Hall normal + uniform draws only (deterministic across all JS engines).
  const weak = rng.shuffle([0, 1, 2, 3, 4]).slice(0, 2);
  const centre = [0, 1, 2, 3, 4].map(i => (weak.includes(i) ? 2.85 + rng.next() * 0.45 : 3.55 + rng.next() * 0.55));
  const loadingF1 = [0, 1, 2].map(() => 0.72 + rng.next() * 0.25);
  const loadingF2 = [0, 1, 2, 3].map(() => 0.68 + rng.next() * 0.28);
  const loadingF3 = [0, 1].map(() => 0.74 + rng.next() * 0.24);
  const groupTilt = [0, 1, 2, 3, 4].map(() => (rng.next() - 0.5) * 0.55);
  const weight = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(() => 0.55 + rng.next() * 0.85);
  const weightSum = weight.reduce((a, b) => a + b, 0);
  const shareA = 0.44 + rng.next() * 0.14;
  const statusA = [0.48 + rng.next() * 0.14, 0.16 + rng.next() * 0.08, 0.12 + rng.next() * 0.08, 0.08 + rng.next() * 0.05];
  const statusB = [0.32 + rng.next() * 0.14, 0.22 + rng.next() * 0.09, 0.12 + rng.next() * 0.08, 0.16 + rng.next() * 0.07];
  const ageWeightsA = [0.42, 0.31, 0.18, 0.09], ageWeightsB = [0.22, 0.34, 0.26, 0.18];
  const freqByStatus = [
    [0.52, 0.34, 0.11, 0.03],
    [0.24, 0.44, 0.24, 0.08],
    [0.12, 0.31, 0.41, 0.16],
    [0.04, 0.14, 0.36, 0.46],
  ];
  const tierWeightsSeg = [
    [0.14, 0.38, 0.34, 0.14],
    [0.24, 0.44, 0.23, 0.09],
    [0.36, 0.41, 0.17, 0.06],
  ];

  const labels = (variable: string) => design.questions.find(q => q.variable === variable)?.choices.map(c => c.label) ?? [];
  const groupLabels = labels('Q1'), statusLabels = labels('Q2'), tierLabels = labels('Q12');
  const ageLabels = labels('Q13'), freqLabels = labels('Q14'), painLabels = labels('Q19'), channelLabels = labels('Q20');

  const headers = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11', 'Q12', 'Q13', 'Q14', 'Q15', 'Q16', 'Q17', 'Q18', 'Q19', 'Q20'];
  const rows: string[][] = [];
  for (let i = 0; i < issued; i++) {
    if (rows.length > 20 && rng.next() < 0.01) { rows.push([...rows[Math.floor(rng.next() * rows.length)]]); continue; }
    const isA = rng.next() < shareA;
    const status = rng.pick(isA ? statusA : statusB);
    const ageIdx = rng.pick(isA ? ageWeightsA : ageWeightsB);
    const freqIdx = rng.pick(freqByStatus[status] ?? freqByStatus[1]);
    // 3 non-collinear behavioral segments across F1/F2/F3 so multi-factor EFA yields 3 distinct eigenvalues (>1) and clustering avoids 1D collapse
    const segIdx = rng.pick([0.34, 0.34, 0.32]);
    const segF1Shift = segIdx === 0 ? 0.85 : segIdx === 1 ? -0.92 : 0.22;
    const segF2Shift = segIdx === 0 ? 0.72 : segIdx === 1 ? 0.58 : -1.05;
    const segF3Shift = segIdx === 0 ? 0.88 : segIdx === 1 ? -0.25 : -0.82;

    const general = rng.normal() * 0.35 + (status === 0 ? 0.2 : status === 3 ? -0.3 : 0) + (freqIdx === 0 ? 0.16 : -freqIdx * 0.06);
    // 3 moderately correlated latent factors (F1: Core Delivery Q3..Q5; F2: Rules/Support Q6,Q7,Q15,Q16; F3: Trust/Fit Q17,Q18)
    const f1 = 0.42 * general + 0.72 * rng.normal() + segF1Shift;
    const f2 = 0.38 * general + 0.74 * rng.normal() + segF2Shift;
    const f3 = 0.40 * general + 0.72 * rng.normal() + segF3Shift;

    const coreAspects = [
      centre[0] + loadingF1[0] * f1 + (isA ? groupTilt[0] : -groupTilt[0]) + rng.normal() * 0.42,
      centre[1] + loadingF1[1] * f1 + (isA ? groupTilt[1] : -groupTilt[1]) + rng.normal() * 0.42,
      centre[2] + loadingF1[2] * f1 + (isA ? groupTilt[2] : -groupTilt[2]) + rng.normal() * 0.42,
      centre[3] + loadingF2[0] * f2 + (isA ? groupTilt[3] : -groupTilt[3]) + rng.normal() * 0.44,
      centre[4] + loadingF2[1] * f2 + (isA ? groupTilt[4] : -groupTilt[4]) + rng.normal() * 0.44,
    ];
    const q15Val = 3.05 + loadingF2[2] * f2 + (status === 3 ? -0.25 : 0) + rng.normal() * 0.42;
    const q16Val = 3.12 + loadingF2[3] * f2 + rng.normal() * 0.45;
    const q17Val = 3.45 + loadingF3[0] * f3 + (freqIdx === 0 ? 0.15 : 0) + rng.normal() * 0.42;
    const q18Val = 3.38 + loadingF3[1] * f3 + (isA ? 0.12 : -0.1) + rng.normal() * 0.44;
    const allNine = [...coreAspects, q15Val, q16Val, q17Val, q18Val];

    const mechanism = 3.55 + 0.48 * f2 + 0.28 * f3 + (status === 0 ? 0.18 : 0) + rng.normal() * 0.58;
    const overall = allNine.reduce((s, a, d) => s + a * weight[d], 0) / weightSum + 0.25 * f3 + rng.normal() * 0.36;
    const intention = 0.45 + 0.56 * overall + 0.22 * mechanism + 0.16 * q18Val - (status === 3 ? 0.32 : 0) + rng.normal() * 0.45;

    let coreScale = coreAspects.map(likertOf);
    let attention = '4';
    if (rng.next() < 0.02) { const same = likertOf(1 + rng.next() * 4); coreScale = coreScale.map(() => same); attention = same; }
    else if (rng.next() < 0.04) attention = String([1, 2, 3, 5][Math.floor(rng.next() * 4)]);
    const tier = rng.next() < 0.01 ? '-99' : tierLabels[rng.pick(tierWeightsSeg[segIdx])];

    // Primary pain point favors whichever aspect among Q3, Q4, Q5 or rules/response (Q15/Q16) scored lowest
    const painScores = [coreAspects[0], coreAspects[1], coreAspects[2], (q15Val + q16Val) / 2];
    const painWeights = painScores.map(v => Math.max(0.15, 5.4 - v));
    const pain = painLabels[rng.pick(painWeights)];
    const channelWeights = ageIdx >= 2
      ? [0.42, 0.18, 0.21, 0.19]
      : ageIdx === 0
        ? [0.16, 0.48, 0.26, 0.10]
        : [0.24, 0.36, 0.24, 0.16];
    const channel = channelLabels[rng.pick(channelWeights)];

    rows.push([
      groupLabels[isA ? 0 : 1],
      statusLabels[status],
      ...coreScale,
      attention,
      likertOf(mechanism),
      likertOf(overall),
      likertOf(intention),
      tier,
      ageLabels[ageIdx],
      freqLabels[freqIdx],
      likertOf(q15Val),
      likertOf(q16Val),
      likertOf(q17Val),
      likertOf(q18Val),
      pain,
      channel,
    ]);
  }
  const columnLabels: Record<string, string> = {
    Q1: bp.groupConstruct, Q2: bp.statusConstruct,
    ...Object.fromEntries(bp.dimensions.map(d => [d.code, d.short])),
    Q8: '注意力检查', Q9: bp.mechanismConstruct, Q10: bp.overallSatConstruct, Q11: bp.conversionConstruct, Q12: bp.tierConstruct,
    Q13: '受访者年龄结构', Q14: '实际接触频次', Q15: '规则指引透明度', Q16: '反馈响应与衔接效率',
    Q17: '安全信任与口碑评价', Q18: '场景契合与心理获得感', Q19: '首要改善诉求', Q20: '首选信息触达渠道',
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
  return simulateDemoStudy(blueprint, buildDemoQuestionnaire(blueprint));
}

/** Generate answers for the questionnaire shown at the teaching simulation checkpoint. */
export async function simulateDemoStudy(blueprint: DemoBlueprint, design: Questionnaire): Promise<DemoStudy> {
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

/** References cited canonically across methods, evaluation and bibliography formatting (no invented Chinese journals). */
function refEntry(fields: Partial<ReferenceEntry> & Pick<ReferenceEntry, 'id' | 'type' | 'title'>): ReferenceEntry {
  return {
    authors: [], source: '', publisher: '', place: '', year: '', volume: '', issue: '', pages: '',
    edition: '', date: '', accessed: '', url: '', doi: '', number: '', text: '',
    ...fields,
  };
}

function demoVerifiedReferences(): ReferenceEntry[] {
  return [
    refEntry({
      id: 'ref-gb7714', type: 'S', number: 'GB/T 7714—2015',
      authors: ['国家市场监督管理总局', '国家标准化管理委员会'],
      title: '信息与文献 参考文献著录规则', place: '北京', publisher: '中国标准出版社', year: '2015',
      verification: 'verified', locator: '第 8–10 章 顺序编码制着录规范',
    }),
    refEntry({
      id: 'ref-zhengda', type: 'EB/OL',
      authors: ['中国商业统计学会全国大学生市场调查与分析大赛组委会'],
      title: '关于第十七届全国大学生市场调查与分析大赛的通知: 中商统〔2026〕33号',
      date: '2026-09-21', accessed: '2026-10-15', url: 'http://www.china-cssc.org/show-304-2179-1.html',
      verification: 'verified', locator: '大赛报告编排与研究规范要求',
    }),
    refEntry({
      id: 'ref-cronbach', type: 'J',
      authors: ['CRONBACH L J'],
      title: 'Coefficient alpha and the internal structure of tests',
      source: 'Psychometrika', year: '1951', volume: '16', issue: '3', pages: '297-334',
      verification: 'verified', locator: 'pp. 297-305（α 系数内部一致性定义）',
    }),
    refEntry({
      id: 'ref-kaiser', type: 'J',
      authors: ['KAISER H F'],
      title: 'An index of factorial simplicity',
      source: 'Psychometrika', year: '1974', volume: '39', issue: '1', pages: '31-36',
      verification: 'verified', locator: 'p. 35（KMO 抽样适切性判别阈值）',
    }),
    refEntry({
      id: 'ref-cohen', type: 'M',
      authors: ['COHEN J'],
      title: 'Statistical power analysis for the behavioral sciences',
      edition: '2nd ed.', place: 'Hillsdale', publisher: 'Lawrence Erlbaum Associates', year: '1988',
      verification: 'verified', locator: 'Chapter 3 & 7（效应量解释区间准则）',
    }),
    refEntry({
      id: 'ref-martilla', type: 'J',
      authors: ['MARTILLA J A', 'JAMES J C'],
      title: 'Importance-performance analysis',
      source: 'Journal of Marketing', year: '1977', volume: '41', issue: '1', pages: '77-79',
      verification: 'verified', locator: 'pp. 77-79（重要性—表现四象限诊断框架）',
    }),
    refEntry({
      id: 'ref-rousseeuw', type: 'J',
      authors: ['ROUSSEEUW P J'],
      title: 'Silhouettes: a graphical aid to the interpretation and validation of cluster analysis',
      source: 'Journal of Computational and Applied Mathematics', year: '1987', volume: '20', pages: '53-65',
      verification: 'verified', locator: 'pp. 53-56（轮廓系数评估聚类结构）',
    }),
  ];
}

/** The line the AI appendix carries until a model drafts the narrative sections. */
export const UNDRAFTED_NOTE = '叙述性章节尚未起草；如交由大语言模型起草，起草所用模型与方式在此补记。';

function fmtMetric(v: number | null | undefined, digits = 2): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '未登记';
}

function deaiClean(lines: readonly string[]): string {
  return lines
    .filter(l => l.trim().length > 0)
    .map(l => humanizeTextWithSkills(l, 'academic_clean').rewritten)
    .join('\n');
}

/**
 * Screens the simulated answers, runs the full statistical workflow on what the screening keeps (including
 * 3-factor EFA and Silhouette-optimal K-means feeding downstream cluster cross-tabs), places exhibits, and
 * populates concise, De-AI-cleaned methodology and synthesis prose from computed results without inventing fieldwork.
 */
export async function computeDemoReport(study: DemoStudy, options: { onLog?: (line: string) => void } = {}): Promise<{ report: EditorContent; dataset: DatasetValue }> {
  const { blueprint: bp, design, dataset } = study;
  const missing = dataset.missingCodes;
  const raw = dataset.table;
  const colFrom = (tbl: SurveyTable, variable: string) => {
    const i = tbl.headers.indexOf(variable);
    if (i < 0) throw Error(`模拟数据缺少「${variable}」列`);
    return i;
  };
  const col = (variable: string) => colFrom(raw, variable);
  const five = ['Q3', 'Q4', 'Q5', 'Q6', 'Q7'].map(col);
  const suppScale = ['Q15', 'Q16', 'Q17', 'Q18'].map(col);
  const nineItems = [...five, ...suppScale];
  const tenItems = [...five, col('Q9'), ...suppScale];
  const screen = evaluateQuality(raw, { idColumn: null, duration: null, straightlining: { columns: five }, attention: { column: col('Q8'), expected: '4' }, duplicateIp: null, duplicateAnswers: true }, missing);
  const { table, removed } = keptTable(raw, screen, SCREENED_OUT);
  const screenedLine = `质控：剔除注意力题未通过与直线作答 ${removed} 份，答案完全重复的答卷仅标记、未剔除；保留 ${table.rows.length} / ${raw.rows.length} 份`;
  const screened: DatasetValue = { ...dataset, table, lineage: [...dataset.lineage, screenedLine] };
  const identity = await datasetIdentity(dataset.sourceHash, 'utf-8', table);
  const label = (variable: string, tbl: SurveyTable = raw) => tbl.columnLabels?.[variable] ?? variable;
  const source = { sourceName: dataset.name, sourceUrl: '', sourceHash: dataset.sourceHash, classification: 'simulated' as const };
  const log = (line: string) => options.onLog?.(line);

  const visualStyle = { schema: 'ProjectVisualStyle/v1' as const, paletteId: 'teal' as const, version: 1 };
  const approvedFrame = await approveReportFrame(createReportFrame(visualStyle, 'finance-grid'), 'EVI-X 教学演示');
  let content = createEditorContent();
  const outlineNodes = ['compare', 'compare.tests', 'drivers', 'drivers.model', 'segments', 'segments.cluster', 'diagnosis', 'diagnosis.evaluation', 'diagnosis.problems', 'plan', 'plan.measures', 'plan.feasibility'];
  const sections = blueprintOutline({ nodes: outlineNodes })
    .filter(x => x.node.kind !== 'appendix' && x.node.kind !== 'references')
    .map(({ node, title }) => ({ id: `s-${node.id.replace(/[^a-z0-9]+/giu, '-')}`, title, body: '', source: '' }));
  content = applyReportFrame(parseEditorContent({
    ...content,
    version: 3,
    accent: 'teal',
    title: bp.title,
    subtitle: `基于 ${table.rows.length} 份教学模拟样本的调查报告（教学模拟数据，不作为实际调查结论）`,
    reportFormat: {
      ...DEFAULT_REPORT_FORMAT_SETTINGS,
      profileId: 'btbu-17-report-layout-v1',
      options: { ...DEFAULT_REPORT_OPTIONS, includeCover: true, includeToc: true },
    },
    visualStyle,
    references: demoVerifiedReferences(),
    report: sections,
  }), approvedFrame);

  let seq = 0;
  const basic = async (
    method: PlanMethod,
    x: string | null,
    y: string | null,
    question: string,
    scale: PlanScale | null = null,
    targetTable: SurveyTable = table,
    targetIdent: { interpretationHash: string } = identity,
    targetNodeId?: string,
    exhibits?: readonly ExhibitKind[],
  ): Promise<ResultSnapshot | null> => {
    const node = { id: `demo-node-${++seq}`, method, x: x === null ? null : colFrom(targetTable, x), y: y === null ? null : colFrom(targetTable, y), question, branch: '全部样本', filter: null, scale };
    try {
      const branch = filterPlanSample(targetTable, null, missing);
      const result = runPlanNode(branch.table, node, missing);
      const calculation = calculationReceipt(node, targetTable.headers, missing, targetIdent.interpretationHash, null, branch.evidence, branch.table.rows.length, null, null);
      const variables = (scale ? scale.columns.map(i => label(targetTable.headers[i], targetTable)) : [x, y].filter((v): v is string => !!v).map(v => label(v, targetTable))).slice(0, 4);
      const snapshot = await snapshotRecipe(result, { title: question, ...source, variables }, undefined, calculation);
      content = appendRegisteredResult(content, { result: snapshot });
      const placementTarget = targetNodeId ? targetSection(content, targetNodeId) : null;
      const placeOpts = { ...(placementTarget ? { sectionId: placementTarget.sectionId } : {}), ...(exhibits ? { exhibits: [...exhibits] } : {}) };
      content = placeResult(placementTarget ? placementTarget.content : content, snapshot.id, Object.keys(placeOpts).length ? placeOpts : undefined).content;
      log(`ok ${method} ${question}`);
      return snapshot;
    } catch (error) {
      log(`skipped ${method} ${question}: ${(error as Error).message}`);
      return null;
    }
  };
  const advanced = async (spec: AdvancedSpec, name: string) => {
    try {
      const run = runAdvanced(spec, table, missing);
      if ('refused' in run) { log(`refused ${name}: ${run.refused}`); return null; }
      content = applyReportInsert(content, await advancedInsert(run, { name: dataset.name, hash: dataset.sourceHash, simulated: true })).content;
      log(`ok ${spec.method} ${name}`);
      return run;
    } catch (error) {
      log(`skipped ${name}: ${(error as Error).message}`);
      return null;
    }
  };

  // Screening result registered into data.cleaning
  const qc = await snapshotRecipe(qualityResult(screen, SCREENED_OUT, removed), { title: '问卷质量筛查', ...source, variables: ['注意力题', '直线作答', '重复答卷'] });
  content = placeResult(appendRegisteredResult(content, { result: qc }), qc.id).content;

  // Word cloud (intro.literature), research framework diagram (intro.roadmap), and action roadmap (plan.measures)
  try {
    const keywordEntries = [
      ...bp.keywords.map((word, idx) => ({ word, weight: Math.max(24, 48 - idx * 4), category: '核心热点' })),
      { word: bp.domainLabel, weight: 44, category: '研究领域' },
      { word: bp.shortTitle, weight: 40, category: '研究主题' },
      { word: bp.overallSatConstruct, weight: 36, category: '关键因变量' },
      { word: bp.conversionConstruct, weight: 33, category: '行为结果' },
      { word: bp.mechanismConstruct, weight: 30, category: '作用机制' },
      { word: bp.scaleConstruct, weight: 28, category: '测量工具' },
      ...bp.dimensions.map((d, idx) => ({ word: d.short, weight: Math.max(18, 29 - idx * 2), category: '测量维度' })),
      ...bp.statusCategories.map((c, idx) => ({ word: c, weight: Math.max(14, 21 - idx * 2), category: '群体状态' })),
      { word: bp.groupConstruct, weight: 22, category: '人口特征' },
      { word: bp.statusConstruct, weight: 20, category: '参与结构' },
      { word: bp.tierConstruct, weight: 18, category: '决策阈值' },
      { word: `${bp.region}样本`, weight: 17, category: '调研区域' },
      { word: '三因子结构', weight: 21, category: '量表检验' },
      { word: '信效度检验', weight: 19, category: '质量控制' },
      { word: '交叉卡方', weight: 17, category: '差异检验' },
      { word: '多元回归', weight: 18, category: '影响建模' },
      { word: 'IPA诊断', weight: 16, category: '改进优先' },
      { word: '轮廓聚类', weight: 15, category: '异质性分析' },
      { word: '对策路径', weight: 14, category: '治理优化' },
    ];
    const cloudSnap = await buildWordCloudResultSnapshot({
      id: `demo-wordcloud-${bp.slug}`,
      title: `${bp.shortTitle}研究高频主题词云`,
      words: keywordEntries,
      classification: 'simulated',
      sourceName: source.sourceName,
      sourceHash: source.sourceHash,
    });
    content = placeResult(appendRegisteredResult(content, { result: cloudSnap }), cloudSnap.id).content;
    log('ok wordcloud literature');

    const fwSpec = buildTopicFrameworkSpec({
      topic: bp.title,
      domainLabel: bp.domainLabel,
      dimensions: bp.dimensions.map(d => d.short),
      methodNames: ['三因子信效度检验', '交叉卡方与差异检验', '多元回归与IPA', '轮廓自适应聚类'],
    });
    const fwSnap = await buildDiagramResultSnapshot({
      id: `demo-framework-${bp.slug}`,
      title: `${bp.shortTitle}研究技术路线图`,
      spec: fwSpec,
      classification: 'simulated',
      sourceName: source.sourceName,
      sourceHash: source.sourceHash,
    });
    const roadmapTarget = targetSection(appendRegisteredResult(content, { result: fwSnap }), 'intro.roadmap');
    content = placeResult(roadmapTarget.content, fwSnap.id, { sectionId: roadmapTarget.sectionId }).content;
    log('ok framework roadmap');

    const actionSpec = buildTopicActionRoadmapSpec({
      topic: bp.shortTitle,
      dimensions: bp.dimensions.map(d => d.short),
    });
    const actionSnap = await buildDiagramResultSnapshot({
      id: `demo-action-roadmap-${bp.slug}`,
      title: `${bp.shortTitle}痛点锚定—责任主体—KPI对策闭环图`,
      spec: actionSpec,
      classification: 'simulated',
      sourceName: source.sourceName,
      sourceHash: source.sourceHash,
    });
    const measuresTarget = targetSection(appendRegisteredResult(content, { result: actionSnap }), 'plan.measures');
    content = placeResult(measuresTarget.content, actionSnap.id, { sectionId: measuresTarget.sectionId }).content;
    log('ok action roadmap measures');
  } catch (error) {
    log(`skipped diagram exhibits: ${(error as Error).message}`);
  }

  // Sample profile & descriptive frequencies (mix headline rings with concise tables to avoid visual repetition)
  await basic('frequency', 'Q1', null, `受访者的${label('Q1')}构成`, null, table, identity, 'sample.profile');
  await basic('frequency', 'Q2', null, `受访者的${label('Q2')}分布`, null, table, identity, 'sample.profile', ['table']);
  await basic('frequency', 'Q13', null, `受访者的${label('Q13')}构成`, null, table, identity, 'sample.profile', ['table']);
  await basic('frequency', 'Q14', null, `受访者的${label('Q14')}分布`, null, table, identity, 'sample.descriptive', ['table']);
  await basic('frequency', 'Q12', null, `受访者的${label('Q12')}分布`, null, table, identity, 'sample.descriptive', ['table']);
  const painFreq = await basic('frequency', 'Q19', null, `受访者的${label('Q19')}分布`, null, table, identity, 'sample.descriptive');
  const channelFreq = await basic('frequency', 'Q20', null, `受访者的${label('Q20')}分布`, null, table, identity, 'sample.descriptive', ['table']);

  // Reliability (core 5 + extended 10-item 3-factor scale including Q9) & Multi-group / correlation comparisons
  const alphaCore = await basic('alpha', null, null, `${bp.scaleConstruct}核心五题内部一致性`, { columns: five, reverse: [], min: 1, max: 5, construct: bp.scaleConstruct });
  const alphaFull = await basic('alpha', null, null, '十题项三因子拓展量表综合内部一致性', { columns: tenItems, reverse: [], min: 1, max: 5, construct: '体验、制度与信任拓展量表' });
  await basic('crosstab', 'Q1', 'Q2', `不同${label('Q1')}的${label('Q2')}差异`);
  await basic('crosstab', 'Q1', 'Q12', `不同${label('Q1')}的${label('Q12')}差异`, null, table, identity, undefined, ['table']);
  await basic('crosstab', 'Q13', 'Q20', `不同${label('Q13')}的${label('Q20')}偏好`);

  const profileDims = [...five, col('Q9'), col('Q10'), col('Q11')];
  // 8 core/institutional/intention Likert items × 5 levels = 40 metrics (<= MAX_METRICS 40), enabling diverging likertPlot
  await advanced({ method: 'likert', items: [...five, col('Q15'), col('Q17'), col('Q11')], scale: { min: 1, max: 5 } }, '各评价维度的作答分布');
  await advanced({ method: 'profile', group: col('Q1'), dimensions: profileDims }, `不同${label('Q1')}的各评价维度差异`);
  await advanced({ method: 'profile', group: col('Q2'), dimensions: profileDims }, `不同${label('Q2')}的各评价维度差异`);
  await advanced({ method: 'correlation', variables: [...five, col('Q15'), col('Q17'), col('Q10'), col('Q11')] }, '核心体验与评价维度的相关矩阵');
  const validityRun = await advanced({ method: 'validity', items: tenItems }, '三因子拓展量表的因子结构效度');
  await advanced({ method: 'regression', outcome: col('Q11'), predictors: [...nineItems, col('Q9'), col('Q10')] }, `${label('Q11')}的多因素影响模型`);
  await advanced({ method: 'ipa', performance: nineItems, importance: null, overall: col('Q10') }, '九项核心指标的重要性—表现评价');
  const clusterRun = await advanced({ method: 'cluster', variables: [...five, col('Q15'), col('Q17')], k: 'auto' }, '基于七项体验特征的自适应受访者分群');

  // Downstream cluster feedback loop: inject in-memory cluster membership into a derived table (keeps dataset unchanged) and cross-tabulate tier & pain points by segment
  if (clusterRun?.rowAssignments?.length === table.rows.length) {
    const clusterTable: SurveyTable = {
      ...table,
      headers: [...table.headers, 'Cluster'],
      columnLabels: { ...table.columnLabels, Cluster: '聚类人群分群' },
      rows: table.rows.map((r, idx) => [...r, clusterRun.rowAssignments![idx] != null ? `第 ${clusterRun.rowAssignments![idx]! + 1} 类人群` : '-99']),
    };
    const clusterIdentity = await datasetIdentity(dataset.sourceHash, 'utf-8', clusterTable);
    await basic('crosstab', 'Cluster', 'Q12', '不同细分人群的消费预算承受差异', null, clusterTable, clusterIdentity, 'segments.cluster', ['table']);
    await basic('crosstab', 'Cluster', 'Q19', '不同细分人群的首要改善诉求差异', null, clusterTable, clusterIdentity, 'segments.cluster');
  }

  const results = content.quality?.results ?? [];
  const blockToken = (snap: ResultSnapshot | null | undefined, prefer: 'chart' | 'table' = 'table'): string => {
    if (!snap) return '';
    for (const sec of content.report) {
      const hit = sec.blocks?.find(b => b.evidenceId === snap.id && b.kind === prefer)
        ?? sec.blocks?.find(b => b.evidenceId === snap.id && (b.kind === 'chart' || b.kind === 'table'));
      if (hit) return `[[${hit.kind === 'chart' ? '图' : '表'}:${hit.id}]]`;
    }
    return '';
  };
  const snapByMethod = (method: string) => results.find(r => r.method === method);
  const ipaSnap = snapByMethod('ipa');
  const regSnap = snapByMethod('regression');
  const valSnap = snapByMethod('validity');
  const cluSnap = snapByMethod('cluster');
  const fwSnapReg = snapByMethod('framework');
  const cloudSnapReg = snapByMethod('wordcloud');
  const actionSnapReg = results.find(r => r.id === `demo-action-roadmap-${bp.slug}`) ?? snapByMethod('diagram');
  const crossClusterPain = results.find(r => r.method === 'crosstab' && r.variables?.[0] === '聚类人群分群' && r.variables?.[1] === '首要改善诉求');

  const topFreqRow = (snap: ResultSnapshot | null | undefined) => {
    if (!snap?.rows.length) return null;
    const sorted = [...snap.rows].sort((a, b) => Number(b[1] ?? 0) - Number(a[1] ?? 0));
    return sorted[0];
  };
  const topPain = topFreqRow(painFreq);
  const topChannel = topFreqRow(channelFreq);
  const weakIpaItems = ipaSnap?.rows.filter(r => String(r[3] ?? '').includes('重点改进')).map(r => String(r[0])) ?? [];
  const secondaryIpaItems = ipaSnap?.rows.filter(r => String(r[3] ?? '').includes('次要改进')).map(r => String(r[0])) ?? [];
  const kmoMetric = valSnap?.metrics.find(m => /KMO/iu.test(m.label))?.value
    ?? (() => { const m = /\\mathrm\{KMO\}=([0-9.]+)/u.exec(validityRun && !('refused' in validityRun) ? validityRun.writing.table.note ?? '' : ''); return m ? Number(m[1]) : undefined; })();
  const r2Metric = regSnap?.metrics.find(m => /R²|R\^2|R2/iu.test(m.label))?.value;
  const topPredictors = regSnap?.rows
    .filter(r => String(r[0]) !== '(截距)' && Number(r[5] ?? 1) < 0.05)
    .sort((a, b) => Math.abs(Number(b[3] ?? 0)) - Math.abs(Number(a[3] ?? 0)))
    .slice(0, 3)
    .map(r => `${r[0]}（$\\beta=${Number(r[3] ?? 0).toFixed(2)}$）`) ?? [];
  const chosenK = clusterRun?.chosenK ?? 3;
  const silMean = clusterRun?.silhouetteMean;
  const coreAlpha = alphaCore?.metrics.find(m => /α|alpha/iu.test(m.label))?.value;
  const fullAlpha = alphaFull?.metrics.find(m => /α|alpha/iu.test(m.label))?.value;

  const interviewCorpus = generateInterviewCorpus({
    topic: bp.title,
    population: design.population,
    dimensions: bp.dimensions.map(d => d.short),
    groupChoices: [bp.groupA, bp.groupB],
  });
  const c0 = interviewCorpus.codingMatrix[0], c1 = interviewCorpus.codingMatrix[1], c2 = interviewCorpus.codingMatrix[2];

  const sectionProse = new Map<string, string>([
    ['abstract', deaiClean([
      `${SIMULATED_MARK}围绕「${bp.title}」，本研究立足 ${bp.domainLabel} 情境，设计涵盖群际特征、三因子拓展体验量表（核心表现 F1、制度规范 F2、安全信任 F3）、机制支持及持续意愿的二十题调查方案（参见第十七届大赛规范[[引:ref-zhengda]]），在教学演示模块下共产生模拟作答 ${raw.rows.length} 份，经注意力校验与直线作答筛查剔除 ${removed} 份后保留有效样本 $n=${table.rows.length}$ 份。`,
      `量表检测表明，核心五题 Cronbach $\\alpha=${fmtMetric(coreAlpha, 3)}$，十题三因子拓展量表 $\\alpha=${fmtMetric(fullAlpha, 3)}$${typeof kmoMetric === 'number' ? `，抽样适切性 $\\mathrm{KMO}=${kmoMetric.toFixed(3)}$` : ''}，测量工具结构稳定。相关性与多元回归显示${topPredictors.length ? `，${topPredictors.join('、')}与「${bp.conversionConstruct}」呈显著正向关联` : '，多维度体验与整体满意度同持续意愿保持稳定关联'}。`,
      `通过重要性—表现分析（IPA）${weakIpaItems.length ? `锁定“${weakIpaItems.join('、')}”处于重点改进象限` : '定位优先改善象限'}，并与用户主观痛点（${topPain ? `首要集中于“${topPain[0]}”` : '聚焦规则与核心供给'}）及附录四三级编码归因互相印证。经 $k\\in\\{2,3,4,5\\}$ 轮廓系数自适应优选出 $k=${chosenK}$ 类细分人群${typeof silMean === 'number' ? `（$\\bar{s}=${silMean.toFixed(3)}$）` : ''}，据此从供给、规则透明与触达渠道（${topChannel ? `重点依托“${topChannel[0]}”` : '线上线下协同'}）提出可落地评估的对策闭环。`,
      `关键词：${bp.keywords.slice(0, 4).join('；')}；教学模拟`,
    ])],
    ['intro.background', deaiClean([
      bp.context,
      `当前针对「${bp.shortTitle}」的讨论多停留在表层满意度均值汇总，较少把基础供给表现、制度规则透明度与群体异质性转化路径放进同一分析框架。为回答不同参与方式群体的体验差距与转化堵点，本报告构建二十题结构化观测体系并完成全流程统计演示（所有数据均为教学模拟样本，不作真实外推）。`,
    ])],
    ['intro.significance', deaiClean([
      `理论上，将核心服务评价（Q3–Q7）与规则透明（Q15）、反馈响应（Q16）、安全信任（Q17）及场景契合感（Q18）整合为三因子观测体系，可检验传统满意度模型在 ${bp.domainLabel} 中的因子解释力[[引:ref-zhengda]]。`,
      `实践上，通过 IPA 短板识别与自适应轮廓系数分群联动，能把笼统的“体验提升”拆解为可按人群精准投送的规则公示、流程精简与触达方案，帮助运营方避开同质化低效投入。`,
    ])],
    ['intro.literature', deaiClean([
      `已有消费者行为与服务质量研究普遍指出，复访与持续使用不仅取决于核心功能的即时效用，还高度受制于规则感知清晰度与异常处理信任感。结合「${bp.shortTitle}」高频主题结构${blockToken(cloudSnapReg, 'chart')}，本研究把“基础履约—制度规则—心理契合”作为问卷维度划分的主轴。`,
    ])],
    ['intro.roadmap', deaiClean([
      `全研究沿“文献维度提炼—二十题量表设计—教学模拟入库质控—三因子信效度校准—差异建模与自适应分群—IPA与质性编码双向互证”六步推进，具体技术路线如${blockToken(fwSnapReg, 'chart')}所示。`,
    ])],
    ['intro.innovation', deaiClean([
      `第一，打破单一总体量表扁平设题，在核心五题基础上引入 Q15–Q18 构建三因子测量并直接由探索性因子分析验证结构边界；第二，把 K-means 自动轮廓扫描结果作为动态分组变量回流至痛点与预算交叉检验，使分群直接服务后续精准策略分配；第三，将定量短板与附录四扎根三级编码锚点并置互证，补足纯数字归因的语义盲区。`,
    ])],
    ['design.purpose', deaiClean([
      `围绕「${bp.title}」，调查方案旨在重点厘清三项研究问题：RQ1，不同${bp.groupConstruct}、${bp.statusConstruct}与年龄层群体的参与及花费分布是否存在统计学差异；RQ2，核心五方面与九项拓展指标中，哪些环节存在明显体验落差与重要度失衡；RQ3，规则机制支持度、多维评价及信任感知与${bp.conversionConstruct}之间存在何种强度关联及群体分异。`,
    ])],
    ['design.population', deaiClean([
      `研究将目标分析视角界定为「${bp.region}」关注或接触过「${bp.shortTitle}」的「${bp.groupA}」与「${bp.groupB}」。为兼顾教学演示中的样本可复现性与群体对照，调查单元设为个体受访者（以近三个月接触经历及年龄层识别人群角色），并明确区分高频活跃者与观望试探者。`,
    ])],
    ['design.content', deaiClean([
      `正式问卷共设二十道单选及五点 Likert 量表题（完整题纲见附录一），采用按 GB/T 7714—2015 标准组织的循证文献核验体系支撑指标设计[[引:ref-gb7714]]。内容依次覆盖背景分类与接触频次（Q1、Q2、Q13、Q14）、核心服务表现五项（Q3–Q7）、注意力校验（Q8）、机制支持与结果变量（Q9–Q12）、制度与信任拓展因子（Q15–Q18），以及主观痛点与首选通知渠道（Q19、Q20）。`,
    ])],
    ['design.methods', deaiClean([
      `在分析方法协同上，首先采用 Cronbach α 系数与 KMO 检验量表内部一致性与结构效度[[引:ref-cronbach]][[引:ref-kaiser]]；其次依托列联表卡方、Kruskal–Wallis 秩和检验（Holm 多重校正）与效应量标准评估组间差异[[引:ref-cohen]]；随后建立多元线性回归剖析转化意愿关联因素，应用重要性—表现分析（IPA）识别优先短板[[引:ref-martilla]]，并以轮廓系数自适应 K-means 算法完成受访者异质性聚类[[引:ref-rousseeuw]]。`,
    ])],
    ['design.sampling', deaiClean([
      `${SIMULATED_MARK}本教学演示未建立实际抽样框，数据基于主题先验参数生成，仅用于统计分析流程与报告体例示范，不声称采用过随机抽样、分层抽样或 PPS 抽样，亦不将模拟均值或比例外推至真实总体。`,
      `在正式实地实施规划中，若开展抽样估算，可参照简单随机抽样基础规模公式 $n_0=\\frac{z^2 p(1-p)}{e^2}$：在百分之九十五置信水平（$z=1.96$）、允许误差 $e=0.05$ 且取最大方差保守比例 $p=0.5$ 时，基础样本量下限约为三百八十五份；按预估约九成有效回收率冗余计，正式投放拟安排不少于四百三十份，并对群体结构作适度配额平衡。`,
    ])],
    ['design.schedule', deaiClean([
      '调研实施筹备按四阶段有序排期：第一阶段完成二手文本梳理、定性访谈提纲设计与二十题初稿编制；第二阶段开展小规模预测试（详见预调查说明）并修订歧义措辞与跳题检查；第三阶段同步组织数据入库质控与自动统计核验；第四阶段完成实证研判、图表校验与报告定稿。',
    ])],
    ['design.qc', deaiClean([
      `为防范敷衍作答与重填记录污染模型估计，数据入库前严格施行三项质控检查规则：一是在量表中间嵌入注意力校验题 Q8（要求明确选择“4”），未选者直接剔除；二是检测核心五维度 Q3–Q7 直线同一选项作答记录并予剔除；三是识别全部二十道题作答完全一致的疑似重复答卷，按“仅标记警示、不擅自批量删除”原则登记留痕。本轮教学演示未配置作答耗时卡控或跨题逻辑互斥校验。`,
    ])],
    ['data.pilot', deaiClean([
      '【教学模拟阶段·尚未登记实证预调查数据】为遵循科学调研顺序，正式实地发放前须组织小规模试填测试；本教学演示当前尚未收集并登记预调查统计快照。正式预调查启动时拟重点检验三件事：第一，逐题核查 Q15 规则透明度与 Q16 响应效率题干是否存在阅读歧义；第二，观测完整填写二十道题的实际耗时中位数，据此标定后续正式调查的过快作答排查阈值；第三，检查拓展量表在预试样本上的内部一致性是否平稳，必要时微调题项顺序后再转入正式投放。',
    ])],
    ['diagnosis.problems', deaiClean([
      `${SIMULATED_MARK}综合前文三因子测量模型、回归估计与重要性—表现象限图，可将「${bp.shortTitle}」现存结构性症结归纳为以下三点，并与附录四定性深访三级编码锚点一一互证：`,
      `第一，关键体验短板与预期摩擦叠加。定量 IPA 结果${ipaSnap ? `（${blockToken(ipaSnap, 'chart')}）` : ''}显示，${weakIpaItems.length ? `“${weakIpaItems.join('、')}”落在高重要性却低表现的重点改进区` : secondaryIpaItems.length ? `“${secondaryIpaItems.join('、')}”处于次要待提升区` : '部分核心供给指标表现滞后'}，而受访者主观首要改进诉求（${painFreq ? `${blockToken(painFreq, 'chart')}` : ''}）亦集中在“${topPain?.[0] ?? bp.dimensions[0].short}”。结合附录四编码「${c0.openCode}」（归类为“${c0.axialCategory}”），深访原声暴露出入口指引冗长与隐性附带规则造成的初期落差，是拉低复访意愿的首要摩擦源。`,
      `第二，核心诉求在细分群体间呈显著错位。聚类分析（${cluSnap ? blockToken(cluSnap, 'chart') : ''}）识别出特征迥异的 ${chosenK} 类人群${crossClusterPain ? `，各类别在首选改善诉求上呈现明显分化（${blockToken(crossClusterPain, 'table')}）` : ''}。对应附录四编码「${c2.openCode}」（${c2.selectiveTheme}），审慎观望及边缘高频冲突人群面对替代选项切换成本偏低，现行一刀切运营难以为高痛点敏感受众提供及时安抚。`,
      `第三，应急兜底与渠道触达协同不足。回归模型${regSnap ? `（${blockToken(regSnap, 'table')}）` : ''}提示，除整体表现外，制度透明感与契合度同样牵动意愿分化；对照附录四编码「${c1.openCode}」（${c1.axialCategory}），当临时变动出现时现场人工补位能否快速响应决定了口碑传播转化效率，而不同年龄层（Q13）对首选触达渠道（${channelFreq ? `${blockToken(channelFreq, 'chart')}` : ''}）的明显偏好错位，说明传统单一通知路径存在显著触达漏损。`,
    ])],
    ['plan.feasibility', deaiClean([
      `${SIMULATED_MARK}从统计结果与受众接受度看，分层面改良方案具备较明确的可行性依据：首先，问卷模拟数据在机制支持度（Q9）与转化意愿（Q11）间呈现紧密正向伴随，表明只要消除“隐性限制感”并前置透明提示，现有审慎群体对优化举措具备正向容忍基础；其次，触达渠道分布揭示“${topChannel?.[0] ?? '主流便捷渠道'}”占据最高占比，并与年龄结构（Q13）呈跨列联差异，意味着不必大幅追加全渠道广告预算，仅通过高占比入口分龄精准分发与客服兜底，即可压缩首遇流失率。`,
      `方案落地仍需严守三项执行风险控制：其一，教学模拟反映的相关关联不能视作短期投入必然带来的因果增益，正式推广前需选取两个对等单元先做小范围 A/B 对照试运行；其二，规则公示应与一线窗口权限授权配套落地，避免仅在页面端美化说明而现场处置脱节；其三，持续跟踪三项核心监测指标——高频使用留存占比、重点改进维度随访复测均值及跨人群推荐净意愿变动。`,
    ])],
    ['conclusion.findings', deaiClean([
      `${SIMULATED_MARK}对照开篇确立的三项研究问题，本轮全流程计算形成如下实证教学发现（待真人实地调查与人工确证后生效）：`,
      `针对研究问题 RQ1，质量筛查自 ${raw.rows.length} 份模拟答卷剔除 ${removed} 份低质作答后保留 $n=${table.rows.length}$ 份有效数据。在描述构成与交叉检验中，不同${bp.groupConstruct}、${bp.statusConstruct}及年龄组在花费档位与首选信息渠道上呈现系统性分化，印证采用分人群运营的必要性。`,
      `针对研究问题 RQ2，拓展十题三因子量表保持较高内部一致性（$\\alpha=${fmtMetric(fullAlpha, 3)}$）${typeof kmoMetric === 'number' ? `，因子结构检验 KMO 达到 ${kmoMetric.toFixed(3)}` : ''}；IPA 矩阵识别出${weakIpaItems.length ? `“${weakIpaItems.join('、')}”为核心短板象限` : '若干优先改善指标'}，并与主观第一诉求“${topPain?.[0] ?? bp.dimensions[0].short}”高度收敛。`,
      `针对研究问题 RQ3，多元回归显示${topPredictors.length ? `${topPredictors.join('、')}等指标在控制其他维度的条件下与「${bp.conversionConstruct}」维持显著关联` : '各核心评价维度及机制支持感同持续使用意愿存在明确关联'}${typeof r2Metric === 'number' ? `（模型解释度 $R^2=${r2Metric.toFixed(3)}$）` : ''}；自适应轮廓聚类最终划定 $k=${chosenK}$ 个特色鲜明的细分群体，其需求差异已通过聚类—诉求交叉分析直接闭环验证。`,
    ])],
    ['conclusion.suggestions', deaiClean([
      `${SIMULATED_MARK}每条建议与上文计算结论及定性归因一一绑定，明确责任主体、执行步骤与考核指标名称：`,
      `一、优先攻坚 IPA 重点短板与首遇透明规范（对应 RQ2 与编码 A1）：由运营与品控负责部门牵头，拆解“${weakIpaItems[0] ?? topPain?.[0] ?? bp.dimensions[0].short}”卡点环节，在一线菜单与电子入口顶部集中亮明费率规则及限制边界，评估指标采用该短板项季度专项得分及首遇完成率。`,
      `二、面向核心转化驱动项实施人工兜底升级（对应 RQ3 与编码 A2）：由现场服务主管与客服支持团队执行，为突发异议配备“先处置后补录”的快速响应通道，强化过程安全信赖与契合获得感，评估指标采用异常工单首次响应时长与推荐意愿净变动。`,
      `三、按细分聚类人群与年龄特征分流推送触达（对应 RQ1 与编码 A3）：由用户增长与社区渠道条线分工，针对偏爱“${topChannel?.[0] ?? OUTREACH_CHANNELS[0]}”的目标群体做常态化分众提醒，避免对低频观望群体的过度同质打扰，评估指标采用各聚类群体月度活跃留存率。`,
    ])],
    ['conclusion.limits', deaiClean([
      '本研究在设计演示层面仍存在四项边界须诚实说明：第一，数据源自计算机按先验分布生成的教学模拟样本，旨在演示统计方法与论证架构，不代表真实田野分布，不得用于支持实际公共决策或商业投资结论；第二，当前便利样本设定下无概率抽样框支持，因此不作任何全国或市域总体的点估计外推；第三，横截面相关分析、IPA 象限与回归模型仅揭示控制其他协变量后的统计关联方向与强度，不构成因果效应证明，干预收益仍有待后续前后测对照实验检验；第四，附录四所载访谈语料亦为基于三维量表框架的教学示范推导，实地答辩前应以脱敏后的真实录音文本替换。',
    ])],
  ]);

  // Brief lead-in intros for sections that host exhibits/reading blocks so they flow seamlessly alongside quantitative exhibits
  const leadIns = new Map<string, string>([
    ['data.cleaning', deaiClean([`${SIMULATED_MARK}本节严格记录模拟调查回收、质量筛查规则执行与最终入模有效样本台账。数据共生成 ${raw.rows.length} 份作答记录，经 Q8 注意力校验及 Q3–Q7 直线作答双重筛查共剔除 ${removed} 份，完整答案重复记录仅作标记保留，最终锁定有效样本 ${table.rows.length} 份进入后续建模。`])],
    ['data.testing', deaiClean([`${SIMULATED_MARK}为检验多维测量结构是否稳定可靠，对核心五题量表与包含制度支持、规则透明度、响应效率、安全信任及心理契合在内的十题拓展量表分别计算 Cronbach $\\alpha$ 系数[[引:ref-cronbach]]，并开展 KMO 与探索性因子旋转分析[[引:ref-kaiser]]。`])],
    ['sample.profile', deaiClean([`${SIMULATED_MARK}从受访者人口角色、参与方式及年龄层构成入手，核查模拟样本群体的结构特征与分布均衡度。`])],
    ['sample.descriptive', deaiClean([`${SIMULATED_MARK}结合使用频次、预算档位、核心改进诉求、首选触达渠道与八项核心体验及意愿五点量表（核心五维及制度透明、安全信任、持续意愿）的作答分布，刻画受访群体的整体现状与内部均值掩盖的分化特征。`])],
    ['compare.tests', deaiClean([`${SIMULATED_MARK}围绕群体比较与维度联动检验：首先经列联表 Pearson $\\chi^2$ 及 Cramér’s V 检验人口变量间的关联程度；其次以 Holm 多重校正的 Kruskal–Wallis 秩和检验及 $\\varepsilon^2$ 效应量标准比较组间差异[[引:ref-cohen]]；最后通过 Spearman 相关矩阵全景展示九项评价指标间的两两关联强弱。`])],
    ['drivers.model', deaiClean([`${SIMULATED_MARK}为控制多重变量干扰并定量估计各项体验与机制认知对「${bp.conversionConstruct}」的净关联大小，以意愿得分 Q11 为因变量构建十一项自变量的多元线性回归模型。`])],
    ['segments.cluster', deaiClean([`${SIMULATED_MARK}针对各核心与拓展体验维度开展标准化后的 K-means 聚类，依据平均轮廓系数 $\\bar{s}$ 在 $k\\in\\{2,3,4,5\\}$ 间自动比选最优类别数（详见文献准则[[引:ref-rousseeuw]]），并将最优聚类类别回流至消费预算与首要痛点的交叉分析，实现精准画像。`])],
    ['diagnosis.evaluation', deaiClean([`${SIMULATED_MARK}引入经典重要性—表现分析（IPA）四象限模型[[引:ref-martilla]]，以各评价题项对整体满意度的相关性映射隐性重要性，并以各题实际均值衡定表现高低，从而在二维平面内识别应优先挽救的服务短板。`])],
    ['plan.measures', deaiClean([`${SIMULATED_MARK}紧扣上章锁定的关键短板与人群痛点错位，以下结合痛点锚定—责任主体—KPI 闭环思路${actionSnapReg ? `（${blockToken(actionSnapReg, 'chart')}）` : ''}，明确各运营层面可落地的具体整改方案。`])],
  ]);

  const resultsSnapshotCount = results.length;
  const questionnaire = design.questions.map((q, i) => {
    const options = q.choices.map(c => `${c.code}. ${c.label}`).join('；');
    return `Q${i + 1}. ${q.text}${options ? `（${options}）` : q.type === 'likert' ? `（1 = ${q.minLabel}，5 = ${q.maxLabel}）` : ''}`;
  }).join('\n');
  const flagged = screen.rules.filter(r => r.flagged > 0).map(r => `${r.label} ${r.flagged} 份`).join('、') || '无';

  const patchedReport: ReportSection[] = content.report.map(sec => {
    const node = sec.id.replace(/^s-/u, '').replace(/-/gu, '.');
    const customBody = sectionProse.get(node);
    if (customBody !== undefined) return { ...sec, body: customBody };
    const lead = leadIns.get(node);
    if (lead !== undefined) {
      const strippedExisting = sec.body.replace(SIMULATED_MARK, '').trim();
      const merged = strippedExisting ? `${lead}\n${strippedExisting}` : lead;
      return { ...sec, body: merged };
    }
    return sec;
  });

  content = parseEditorContent({
    ...content,
    report: [
      ...patchedReport,
      { id: 's-references', title: '参考文献', body: '', source: '' },
      { id: 's-appendix-1', title: '附录一 调查问卷', body: `本附录列出本次二十题教学模拟调查设计使用的问卷全部题项与计分口径。\n${questionnaire}`, source: '' },
      { id: 's-appendix-2', title: '附录二 人工智能（AI）工具使用说明', body: [
        `本报告为教学模拟演示：数据为证见平台按二十题多因子结构模拟生成的 ${raw.rows.length} 份作答，不是实际调查所得；质量筛查标记 ${flagged}，剔除 ${removed} 份后保留 ${table.rows.length} 份用于分析。`,
        `各项统计结果由证见平台的分析引擎在该模拟数据上计算并登记（共 ${resultsSnapshotCount} 项独立 SHA-256 指纹快照），并结合确定性模板生成初始结构化论述；`,
        UNDRAFTED_NOTE,
        '全部内容仍须由作者逐段核对。',
      ].join('\n'), source: '' },
      { id: 's-appendix-3', title: '附录三 数据与分析可复现说明', body: [
        `文献与参考文献编排依据国家标准着录规范整理[[引:ref-gb7714]]。数据文件：${dataset.name}；${raw.rows.length} 行 × ${raw.headers.length} 列（筛查后 ${table.rows.length} 行）；缺失值编码 ${missing.join('、')}；数据指纹 ${dataset.sourceHash.slice(0, 16)}…（教学模拟数据）。`,
        '本报告登记的全部分析结果如下，每项附结果指纹，可在平台中按同一数据与参数复算：',
        ...results.map((r, i) => `${i + 1}. ${r.title}：方法 ${r.method}，有效样本 ${r.n}，结果指纹 ${r.resultHash.slice(0, 16)}…`),
      ].join('\n'), source: '' },
      { id: 's-appendix-4', title: '附录四 定性深访与焦点小组语料实录及三级编码', body: interviewCorpus.appendixBody, source: '' },
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
