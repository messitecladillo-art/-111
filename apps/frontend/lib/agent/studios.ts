/**
 * 证见 EVI-X · the contestant's studios, opened from the agent:
 * 1. Chart studio (`/绘图`): the project's registered results as editable charts.
 * 2. Code studio (`/编程`): scripts that compute each analysis from the data file, and booktabs tables built from
 *    the project's registered results.
 * 3. Writing studio (`/撰稿`): section templates whose blanks the author fills from the registered facts.
 * 4. The teaching demo (`/铸造`, `/国奖`) and the preparation route (`/备赛`).
 *
 * No number is written in here: a figure, a table cell or a fact either comes from a result the project registered,
 * or is a blank for the author to fill. A project with nothing registered gets the empty forms, not an example's
 * numbers.
 */

import type { Questionnaire } from '../questionnaire.ts';
import type { ResultSnapshot } from '../research-quality.ts';
import { presentResult } from '../report-tables.ts';
import type { DemoBlueprint, DemoDimension } from './demo-study.ts';
import { lightBar, percent } from './glyphs.ts';
import type { Illumination } from './illumination.ts';
import type { RoomId } from './rooms.ts';
import type { AgentCard, AgentLink, AgentTurn, Line, Mark, ResultsView, RouterContext, Span } from './router.ts';

const t = (text: string, mark?: Mark): Span => (mark ? { text, mark } : { text });
const say = (label: string, text = label): AgentLink => ({ label, action: { type: 'say', text } });
const recommend = (link: AgentLink): AgentLink => ({ ...link, primary: true });

const LIT_ROOMS = ['design', 'sampling', 'analysis', 'editor'] as const satisfies readonly RoomId[];
const roomLight = (light: Illumination, room: RoomId) => light.rooms.find(r => r.room === room) ?? null;
const DEMO_QUESTION_COUNT = 20;

type StudioTopicTemplate = Omit<DemoBlueprint, 'id' | 'slug' | 'title' | 'subtitle' | 'region'> & {
  match: RegExp;
  defaultTitle: string;
};

const STUDIO_TOPIC_TEMPLATES: readonly StudioTopicTemplate[] = [
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
    match: /aigc|生成式|\u5927\u6a21\u578b|人工智能|ai\s*工具|chatgpt|deepseek|智能助手/iu,
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
    match: /正大|水饺|好咖|鸡肉|无抗/u,
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

const STUDIO_REGIONS = /^(全国|北京|上海|广州|深圳|武汉|重庆|南京|杭州|成都|西安|长沙|苏州|天津|青岛|郑州|合肥|厦门|宁波|济南|沈阳|大连|昆明|福州|长三角|粤港澳|京津冀|川渝)/u;

function fnvHash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Pure, dependency-free topic blueprint resolver matching `demo-study.ts:decomposeTopic` without pulling in
 * the simulation/analysis/diagram/dagre graph at module evaluation time.
 */
function decomposeStudioTopic(rawTopic = '', existingDesign?: Questionnaire | null): DemoBlueprint {
  const input = (rawTopic || existingDesign?.title || '').trim();
  const region = STUDIO_REGIONS.exec(input)?.[1] ?? '样本城市';
  const slug = `topic_${fnvHash32(input || 'demo').toString(16).padStart(8, '0')}`;
  const template = STUDIO_TOPIC_TEMPLATES.find(tpl => tpl.match.test(input)) ?? (input ? null : STUDIO_TOPIC_TEMPLATES[0]);
  if (template) {
    const { match: _match, defaultTitle, ...rest } = template;
    void _match;
    const title = input.length >= 8 ? input : defaultTitle;
    return { ...rest, id: `demo-${slug}`, slug, title, subtitle: '教学模拟数据，不作为实际调查结论', region };
  }

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
  const isCivic = /社区|政务|垃圾分类|环保|低碳|公益|养老|医保|医疗|托育|公交|地铁|物业|公租房|惠民|社保|志愿/u.test(input);
  const isDigital = /软件|小程序|App|平台|系统|数字化|在线|互联网|电商|直播|算法/iu.test(input);
  const statusCategories: [string, string, string, string] = isCivic
    ? ['长期稳定参与使用', '经常按需使用', '仅偶尔尝试了解', '了解但尚未使用过']
    : isDigital
      ? ['高频深度使用', '常规按需使用', '偶尔浅层试用', '了解但尚未使用过']
      : ['经常使用该服务', '偶尔按需体验', '早先试用后暂停', '了解但尚未使用过'];
  const tierSpec: { construct: string; question: string; choices: [string, string, string, string] } = isCivic
    ? {
        construct: '可接受的月度配套支出',
        question: `若使用${subject}相关便民增值服务，您每月最多愿意承担多少费用？`,
        choices: ['零额外支出', '10 元及以下', '11–30 元', '30 元以上'],
      }
    : isDigital
      ? {
          construct: '每月可接受的服务支出',
          question: `在${subject}相关服务或功能上，您每月可接受的支出区间是？`,
          choices: ['仅用免费功能', '1–20 元', '21–50 元', '50 元以上'],
        }
      : {
          construct: '单次体验可接受的费用区间',
          question: `体验或消费${subject}时，您单次可接受的费用区间大致是？`,
          choices: ['20 元及以下', '21–50 元', '51–100 元', '100 元以上'],
        };

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
    statusConstruct: '使用状态',
    statusCategories,
    scaleConstruct: `${shortTitle}体验量表`,
    dimensions: [
      aspect(0, '核心服务质量', `您对${subject}的核心服务质量满意吗？`),
      aspect(1, '环境与设施', `您对${subject}的环境和设施满意吗？`),
      aspect(2, '预约与信息获取', `您觉得了解${subject}的规则与使用方式方便吗？`),
      aspect(3, '配套与衔接保障', `您对${subject}的配套支持与响应服务满意吗？`),
      aspect(4, '综合体验与获得感', `您对${subject}的综合体验与长期价值满意吗？`),
    ],
    mechanismConstruct: isCivic ? '规则透明与分步指引支持度' : '规则透明与自主选择支持度',
    mechanismQuestion: isCivic
      ? `如果${subject}配备清晰分步指引并公开服务规则，您支持吗？`
      : `如果${subject}提供透明规则说明并保留本人自主选择权，您支持吗？`,
    overallSatConstruct: `${shortTitle}整体满意度`,
    overallSatQuestion: `总的来说，您对${subject}满意吗？`,
    conversionConstruct: '继续使用并推荐的意愿',
    conversionQuestion: `今后您愿意继续使用${subject}，并推荐给亲友吗？`,
    tierConstruct: tierSpec.construct,
    tierQuestion: tierSpec.question,
    tierChoices: tierSpec.choices,
    keywords: [shortTitle, '使用体验', '满意度', '持续使用意愿'],
    context: `${subject}能否留住使用者，取决于核心服务和配套细节；本研究据此设计问卷。`,
  };
}

const STUDIO_ADVANCED_NODES: Readonly<Record<string, string>> = {
  validity: 'data.testing',
  regression: 'drivers.model',
  logistic: 'drivers.model',
  ipa: 'diagnosis.evaluation',
  cluster: 'segments.cluster',
  ahp: 'plan.priority',
  profile: 'compare.tests',
  likert: 'sample.descriptive',
  correlation: 'compare.tests',
};

const STUDIO_DEMOGRAPHIC_RE = /性别|年龄|代际|世代|年级|学历|受教育|收入|职业|身份|专业|户籍|居住|婚姻|家庭|地区|城市|民族|政治面貌/u;

const STUDIO_METHOD_LABELS: Readonly<Record<string, string>> = {
  'macro-trend': '宏观背景双轴趋势图',
  'summary-card': '结构化路径与总结框架图',
  cooccurrence: '文献关键词共现聚类网络',
  wordcloud: '文献与语料关键词词云',
  framework: '研究技术路线图',
  diagram: '研究结构流程图',
  infographic: '描述性统计复合信息图',
  frequency: '频数分析',
  crosstab: '交叉分析与卡方检验',
  groups: '分组均值比较',
  numeric: '数值描述',
  pearson: 'Pearson 相关',
  spearman: 'Spearman 相关',
  'bootstrap-ci': 'Bootstrap 95% 置信区间',
  'spearman-matrix': 'Spearman 秩相关稳健矩阵',
  'mann-whitney': "Mann-Whitney U 与 Cliff's δ 非参数检验",
  alpha: '信度分析',
  efa: 'KMO 与因子适宜性',
  'quality-control': '问卷质量筛查',
  'sampling-frame': '抽样设计',
  validity: '因子分析（效度）',
  regression: '线性回归',
  logistic: 'Logistic 回归',
  logit: '二元 Logistic 回归',
  mediation: 'Bootstrap 中介效应',
  interaction: '子群异质性与调节检验',
  'cs-did': '交错多期 DID (CS-ATT)',
  conformal: 'Split Conformal 预测带',
  did: '双重差分 (DID)',
  sdid: '合成双重差分 (SDID)',
  rdd: '断点回归 (RDD)',
  hlm: '多层线性模型 (HLM)',
  uplift: '因果森林增益 (Uplift)',
  kano: 'Kano 需求属性与 Better-Worse 象限',
  psm: '倾向得分匹配 (PSM)',
  topsis: '熵权 TOPSIS 综合评价',
  iv: '工具变量二阶段最小二乘 (IV-2SLS)',
  ab: '在线/田野序贯 A/B 实验检验',
  survival: 'Kaplan-Meier 生存分析与 Log-Rank 检验',
  meta: '随机效应 Meta 合成与异质性检验',
  ipa: '重要性—表现分析（IPA）',
  cluster: '聚类分析',
  ahp: '层次分析（AHP）',
};

function suggestedStudioNode(r: ResultSnapshot): string {
  if (STUDIO_ADVANCED_NODES[r.method]) return STUDIO_ADVANCED_NODES[r.method];
  switch (r.method) {
    case 'macro-trend': return 'intro.background';
    case 'summary-card': {
      const tag = `${r.id} ${r.title}`;
      if (/innovation|创新/iu.test(tag)) return 'intro.innovation';
      if (/measure|action|路径|对策|支持|干预/iu.test(tag)) return 'plan.measures';
      if (/conclusion|finding|发现|结论/iu.test(tag)) return 'conclusion.findings';
      return 'intro.significance';
    }
    case 'cooccurrence': case 'wordcloud': case 'meta': return 'intro.literature';
    case 'framework': case 'diagram': return 'design.content';
    case 'infographic': case 'bootstrap-ci': return 'sample.descriptive';
    case 'frequency': case 'numeric': return STUDIO_DEMOGRAPHIC_RE.test(r.variables?.[0] ?? '') ? 'sample.profile' : 'sample.descriptive';
    case 'crosstab': case 'groups': case 'pearson': case 'spearman': case 'spearman-matrix': case 'mann-whitney': case 'interaction': case 'ab': return 'compare.tests';
    case 'alpha': case 'efa': return 'data.testing';
    case 'logit': case 'mediation': case 'cs-did': case 'did': case 'sdid': case 'rdd': case 'psm': case 'iv': case 'conformal': case 'hlm': case 'survival': return 'drivers.model';
    case 'kano': case 'topsis': return 'diagnosis.evaluation';
    case 'uplift': return 'plan.priority';
    case 'quality-control': return 'data.cleaning';
    case 'sampling-frame': return 'design.sampling';
    default: return 'sample.descriptive';
  }
}

const PRINTED_FACT_NUMBER_RE = /^[<>＜＞≤≥]?\s*[−-]?\d+(?:\.\d+)?\s*[%％]?$/u;
const EMPTY_FACT_CELL_RE = /^[—–-]?$/u;
const tidyFactText = (text: string) => text.replace(/\s+/gu, ' ').trim();
const clipFactText = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit - 1)}\u2026` : text);

function formatFactNumber(label: string, value: number): string {
  if (Number.isInteger(value)) return String(value);
  if (/(^|[^a-z])p(\s*值|$|[^a-z])|显著性|sig/iu.test(label) && Math.abs(value) < 0.001) return '<0.001';
  const fixed = Math.abs(value) < 1 ? value.toFixed(3) : value.toFixed(2);
  return fixed.replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '');
}

function formatFactCell(header: string, cell: unknown): string | null {
  const share = /[%％]/u.test(header);
  if (typeof cell === 'number') return Number.isFinite(cell) ? `${formatFactNumber(header, cell)}${share ? '%' : ''}` : null;
  if (typeof cell !== 'string') return null;
  const text = cell.trim().replace(/\s+/gu, '');
  if (!PRINTED_FACT_NUMBER_RE.test(text)) return null;
  if (/^[<>＜＞≤≥]/u.test(text) || /[−%％]/u.test(text)) return text;
  const n = Number(text);
  return Number.isFinite(n) ? `${formatFactNumber(header, n)}${share ? '%' : ''}` : null;
}

/**
 * Pure local fact extractor matching `draft.ts:draftFacts` without pulling in `draft.ts -> router.ts`
 * (which otherwise eagerly drags ~3.5 MB of county gazetteer, catalogs, and study engines into `/agent` studio bundles).
 */
function extractStudioFacts(held: NonNullable<ResultsView>, nodeId: string): Array<{ id: string; text: string; value: string }> {
  const ordered = [...held.results].reverse().sort((a, b) => Number(suggestedStudioNode(b) === nodeId) - Number(suggestedStudioNode(a) === nodeId));
  const facts: Array<{ text: string; value: string }> = [];
  const add = (text: string, value: string) => {
    if (facts.length < 80) facts.push({ text: clipFactText(tidyFactText(text), 160), value });
  };
  for (const r of ordered) {
    const title = clipFactText(r.title, 40);
    const isSamplingFrame = r.method === 'sampling-frame';
    const methodLabel = Object.hasOwn(STUDIO_METHOD_LABELS, r.method) ? STUDIO_METHOD_LABELS[r.method] : r.method;
    if (!isSamplingFrame) {
      add(`“${title}”：${methodLabel}，有效样本 ${r.n}（共 ${r.total}）${r.classification === 'simulated' ? '，教学模拟数据' : ''}`, String(r.n));
    }
    for (const m of r.metrics.slice(0, 4)) {
      if (m.value !== null && Number.isFinite(m.value)) {
        const share = /[%％]/u.test(m.label);
        const name = m.label.replace(/\s*[（(]\s*[%％]\s*[)）]/gu, '').trim();
        const value = `${formatFactNumber(m.label, m.value)}${share ? '%' : ''}`;
        add(`“${title}”的${name}为 ${value}`, value);
      }
    }
    if (!isSamplingFrame) {
      for (const row of r.rows.slice(0, 6)) {
        const words = row.flatMap((cell, i) =>
          typeof cell === 'string' && !EMPTY_FACT_CELL_RE.test(cell.trim()) && formatFactCell(r.headers[i] ?? '', cell) === null
            ? [{ cell: tidyFactText(cell), header: r.headers[i] ?? '' }]
            : [],
        );
        if (!words.length) continue;
        const notes = words.slice(1).map(w => `${w.header ? `${tidyFactText(w.header)}：` : ''}${clipFactText(w.cell, 16)}`);
        const rowLabel = notes.length ? `${clipFactText(words[0].cell, 24)}（${notes.join('；')}）` : clipFactText(words[0].cell, 30);
        let shown = 0;
        row.forEach((cell, i) => {
          const header = r.headers[i] ?? '';
          const value = header ? formatFactCell(header, cell) : null;
          if (value === null || shown >= 2) return;
          shown++;
          const name = header.replace(/\s*[（(]\s*[%％]\s*[)）]/gu, '').trim();
          add(`“${title}”中“${rowLabel}”的${name}为 ${value}`, value);
        });
      }
    }
  }
  return facts.map((f, i) => ({ id: `F${i + 1}`, ...f }));
}

/**
 * The topic the studios work on: the topic named in the command, else the project's title or questionnaire, laid
 * out on the survey structure.
 */
export function resolveActiveBlueprint(ctx: RouterContext, query = ''): DemoBlueprint {
  const cleanedQuery = query
    .replace(/^[/／]?(?:生成|启动|运行)?(?:国奖|铸造|标杆|教学模拟研究|全链条演示|\u0061typica|硅基推演|硅基深访|硅基访谈|硅基剧场|实时推演|绘图工坊|画图工坊|制图工坊|图表工坊|绘图|画图|制图|代码工坊|编程|代码|写作工坊|撰稿工坊|撰稿|润色|备赛路线|备赛|教练)\s*[·:：\-—]*\s*/iu, '')
    .replace(/^(?:五维|ipa|列联|卡方|帕累托|摘要|抽样|实证|对策|答辩)\s*[·:：\-—]*\s*/iu, '')
    .trim();
  const designRoom = ctx.light.rooms.find(r => r.room === 'design');
  const rawDesignDetail = designRoom?.checks[0]?.detail ?? '';
  const extractedFromLight = rawDesignDetail.startsWith('《') && rawDesignDetail.endsWith('》') ? rawDesignDetail.slice(1, -1).trim() : '';
  const projectTitle = ctx.projectTitle?.trim() || ctx.design?.title?.trim() || extractedFromLight || '';
  return decomposeStudioTopic(cleanedQuery.length >= 4 ? cleanedQuery : projectTitle, ctx.design);
}

/** The project's registered results, sampling frames aside. */
const registered = (ctx: RouterContext): ResultSnapshot[] => (ctx.results?.results ?? []).filter(r => r.method !== 'sampling-frame');

/* ──────────────────────────────────────────────────────────────────────────
 * 1. Chart studio (`/绘图`)
 * ────────────────────────────────────────────────────────────────────────── */

export type StudioChartKind = 'bar' | 'lollipop' | 'grouped' | 'line' | 'pareto';
export type StudioPaletteId = 'pitch-green' | 'jinmo-gold' | 'jade-vermilion' | 'academic-slate';

export type StudioChartPoint = {
  label: string;
  primary: number;
  secondary?: number;
  note?: string;
};

export type ChartStudioSpec = {
  id: string;
  title: string;
  subtitle: string;
  unit: string;
  primaryLabel: string;
  secondaryLabel?: string;
  defaultKind: StudioChartKind;
  defaultPalette: StudioPaletteId;
  sourceLabel: string;
  annotation: string;
  targetNode: string;
  points: StudioChartPoint[];
};

export type ChartStudioCardData = {
  activeDatasetId: string;
  /** Empty until the project registers a result: the studio then says where results come from. */
  datasets: ChartStudioSpec[];
};

export const STUDIO_PALETTES: Record<
  StudioPaletteId,
  { name: string; primary: string; secondary: string; accent: string; surface: string; ink: string; grid: string }
> = {
  'pitch-green': {
    name: '青松绿茵 · 金青',
    primary: '#0F766E',
    secondary: '#C8902F',
    accent: '#B83239',
    surface: '#FAF6EE',
    ink: '#172321',
    grid: '#D9D2C3',
  },
  'jinmo-gold': {
    name: '金墨寻证 · 宋刻',
    primary: '#85590A',
    secondary: '#00796F',
    accent: '#B83239',
    surface: '#FAF6EE',
    ink: '#1E1B16',
    grid: '#DED5C4',
  },
  'jade-vermilion': {
    name: '青玉朱砂 · 象限诊断',
    primary: '#00796F',
    secondary: '#B83239',
    accent: '#C8902F',
    surface: '#F7F9F8',
    ink: '#162422',
    grid: '#CFDAD7',
  },
  'academic-slate': {
    name: '学术岩灰 · 期刊印刷',
    primary: '#234E80',
    secondary: '#5B728A',
    accent: '#8A3449',
    surface: '#F9FAFB',
    ink: '#1A2330',
    grid: '#D5DCE4',
  },
};

const cellNumber = (cell: unknown): number | null => {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
  if (typeof cell !== 'string') return null;
  const n = Number(cell.replace(/[−]/gu, '-').replace(/[%％]$/u, ''));
  return cell.trim() && Number.isFinite(n) ? n : null;
};

/** A registered result as a chart: each row a point, its first number the bar and its second the companion. */
function resultChart(r: ResultSnapshot): ChartStudioSpec | null {
  const numericColumns = r.headers.map((_, i) => i).filter(i => r.rows.some(row => cellNumber(row[i]) !== null));
  const [first, second] = numericColumns;
  if (first === undefined) return null;
  const points: StudioChartPoint[] = [];
  for (const row of r.rows.slice(0, 8)) {
    const value = cellNumber(row[first]);
    if (value === null) continue;
    const label = row.filter((cell, i) => !numericColumns.includes(i) && typeof cell === 'string' && cell.trim()).join('·') || `第 ${points.length + 1} 项`;
    const companion = second === undefined ? null : cellNumber(row[second]);
    points.push({ label: label.slice(0, 24), primary: Number(value.toFixed(3)), ...(companion === null ? {} : { secondary: Number(companion.toFixed(3)) }) });
  }
  if (points.length < 2) return null;
  return {
    id: `result-${r.id}`,
    title: r.title,
    subtitle: `已登记结果 · ${r.method} · 有效样本 ${r.n}${r.classification === 'simulated' ? ' · 教学模拟数据' : ''}`,
    unit: /%/u.test(r.headers[first] ?? '') ? '%' : '',
    primaryLabel: r.headers[first] ?? '统计值',
    ...(second === undefined ? {} : { secondaryLabel: r.headers[second] }),
    defaultKind: second === undefined ? 'bar' : 'grouped',
    defaultPalette: 'jinmo-gold',
    sourceLabel: `${r.sourceName}（n = ${r.n}）`,
    annotation: r.receipt?.interpretation || `来自已登记结果“${r.title}”。`,
    targetNode: 'sample.descriptive',
    points,
  };
}

export function buildChartStudioCardData(ctx: RouterContext, query = ''): ChartStudioCardData {
  const datasets = registered(ctx).map(resultChart).filter((d): d is ChartStudioSpec => !!d).slice(0, 12);
  const q = query.trim().toLowerCase();
  const asked = q ? datasets.find(d => d.title.toLowerCase().includes(q)) : undefined;
  return { activeDatasetId: (asked ?? datasets[0])?.id ?? '', datasets };
}

/* ──────────────────────────────────────────────────────────────────────────
 * 2. Code studio (`/编程`)
 * ────────────────────────────────────────────────────────────────────────── */

export type CodeStudioLang = 'python' | 'r' | 'spss' | 'latex';

export type CodeStudioRecipe = {
  id: string;
  title: string;
  badge: string;
  summary: string;
  auditUpgrade: string;
  targetNode: string;
  snippets: Record<CodeStudioLang, string>;
};

export type CodeStudioCardData = {
  activeRecipeId: string;
  activeLang: CodeStudioLang;
  recipes: CodeStudioRecipe[];
};

const latexEscape = (text: string) => text.replace(/\\/gu, '\\textbackslash{}').replace(/([&%$#_{}])/gu, '\\$1').replace(/~/gu, '\\textasciitilde{}').replace(/\^/gu, '\\textasciicircum{}');

/**
 * A booktabs table: the registered result's own cells when the project has one, else the columns with a dash in every
 * cell and a note that the platform fills them once the analysis runs.
 */
function booktabs(caption: string, label: string, result: ResultSnapshot | undefined, skeleton: readonly string[]): string {
  const table = result ? presentResult(result) : null;
  const headers = table?.headers ?? [...skeleton];
  const rows = table ? table.rows.slice(0, 20) : [skeleton.map(() => '—')];
  const n = result ? `（$n = ${result.n}$）` : '';
  return [
    '\\begin{table}[htbp]',
    '  \\centering',
    `  \\caption{${latexEscape(caption)}${n}}`,
    `  \\label{${label}}`,
    `  \\begin{tabular}{${'l' + 'c'.repeat(Math.max(0, headers.length - 1))}}`,
    '    \\toprule',
    `    ${headers.map(latexEscape).join(' & ')} \\\\`,
    '    \\midrule',
    ...rows.map(row => `    ${row.map(cell => latexEscape(String(cell))).join(' & ')} \\\\`),
    '    \\bottomrule',
    '  \\end{tabular}',
    ...(result ? [] : ['  % 运行这项分析并登记后，平台按登记结果填入各单元格；在此之前不要手填数字。']),
    '\\end{table}',
  ].join('\n');
}

export function buildCodeStudioCardData(ctx: RouterContext, query = ''): CodeStudioCardData {
  const bp = resolveActiveBlueprint(ctx, query);
  const csvName = ctx.datasetName || `${bp.slug}.csv`;
  const [d3, d4, d5, d6, d7] = bp.dimensions;
  const results = registered(ctx);
  const find = (method: string) => results.find(r => r.method === method);

  const recipes: CodeStudioRecipe[] = [
    {
      id: 'crosstab-chi2',
      title: `01 ${bp.groupConstruct}与${bp.statusConstruct}的列联 χ² 与 Cramér’s V`,
      badge: '名义变量关联',
      summary: `检验${bp.groupA}与${bp.groupB}在${bp.statusConstruct}上的分布差异，并报告效应量与调整后标准化残差。`,
      auditUpgrade: '两个无序分类变量用 Pearson χ² 与 Cramér’s V，不用 Spearman 秩相关；期望频数过小时改用 Fisher 精确检验。',
      targetNode: 'compare.tests',
      snippets: {
        python: `import numpy as np
import pandas as pd
from scipy.stats import chi2_contingency

df = pd.read_csv("${csvName}")
obs = pd.crosstab(df["Q1"], df["Q2"])  # ${bp.groupConstruct} × ${bp.statusConstruct}
chi2, p_val, dof, expected = chi2_contingency(obs.values, correction=False)
n = obs.values.sum()
cramers_v = np.sqrt(chi2 / (n * (min(obs.shape) - 1)))

# 调整后标准化残差：|z| > 1.96 的单元格偏离独立性
rows = obs.values.sum(axis=1, keepdims=True)
cols = obs.values.sum(axis=0, keepdims=True)
adj = (obs.values - expected) / np.sqrt(expected * (1 - rows / n) * (1 - cols / n))
print(f"chi2({dof}) = {chi2:.2f}, p = {p_val:.3g}, Cramer's V = {cramers_v:.3f}, min expected = {expected.min():.2f}")
print(pd.DataFrame(adj, index=obs.index, columns=obs.columns).round(2))`,
        r: `df <- read.csv("${csvName}")
obs <- table(df$Q1, df$Q2)  # ${bp.groupConstruct} × ${bp.statusConstruct}
test <- chisq.test(obs, correct = FALSE)
cramers_v <- sqrt(as.numeric(test$statistic) / (sum(obs) * (min(dim(obs)) - 1)))
cat(sprintf("chi2(%d) = %.2f, p = %.3g, Cramer's V = %.3f\\n", test$parameter, test$statistic, test$p.value, cramers_v))
print(round(prop.table(obs, margin = 1) * 100, 2))
print(round(test$stdres, 2))`,
        spss: `* ${bp.groupConstruct} (Q1) × ${bp.statusConstruct} (Q2).
CROSSTABS
  /TABLES = Q1 BY Q2
  /FORMAT = AVALUE TABLES
  /STATISTICS = CHISQ PHI
  /CELLS = COUNT EXPECTED ROW ASRESID
  /COUNT ROUND CELL.`,
        latex: booktabs(`${bp.groupConstruct}与${bp.statusConstruct}的交叉分布`, `tab:${bp.slug}-crosstab`, find('crosstab'), [bp.groupConstruct, ...bp.statusCategories]),
      },
    },
    {
      id: 'implicit-ipa',
      title: `02 ${bp.scaleConstruct}的重要性—表现分析（IPA）`,
      badge: '短板定位',
      summary: `以各方面对${bp.overallSatConstruct}的标准化回归系数作为隐性重要性，与表现均值一起划分四个象限。`,
      auditUpgrade: '隐性重要性取标准化回归系数而非简单相关，并报告共线性诊断；象限分界用均值，结论只说关联不说因果。',
      targetNode: 'diagnosis.evaluation',
      snippets: {
        python: `import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler

df = pd.read_csv("${csvName}")
dims = ["Q3", "Q4", "Q5", "Q6", "Q7"]
labels = ["${d3.short}", "${d4.short}", "${d5.short}", "${d6.short}", "${d7.short}"]
X = StandardScaler().fit_transform(df[dims])
y = StandardScaler().fit_transform(df[["Q10"]]).ravel()
importance = LinearRegression().fit(X, y).coef_
performance = df[dims].mean().values
cut_i, cut_p = importance.mean(), performance.mean()
quadrant = ["继续保持" if p >= cut_p and i >= cut_i else "重点改进" if i >= cut_i else "过度投入" if p >= cut_p else "次要改进"
            for p, i in zip(performance, importance)]
print(pd.DataFrame({"方面": labels, "表现": performance.round(2), "隐性重要性": importance.round(3), "象限": quadrant}))`,
        r: `df <- read.csv("${csvName}")
dims <- c("Q3", "Q4", "Q5", "Q6", "Q7")
z <- as.data.frame(scale(df[, c(dims, "Q10")]))
importance <- coef(lm(Q10 ~ Q3 + Q4 + Q5 + Q6 + Q7, data = z))[-1]
performance <- colMeans(df[, dims])
print(data.frame(Performance = round(performance, 2), Importance = round(importance, 3)))`,
        spss: `* ${bp.scaleConstruct} 对 ${bp.overallSatConstruct} (Q10) 的回归，取标准化系数作为隐性重要性.
REGRESSION
  /STATISTICS COEFF OUTS R ANOVA COLLIN TOL
  /DEPENDENT Q10
  /METHOD = ENTER Q3 Q4 Q5 Q6 Q7.`,
        latex: booktabs(`${bp.scaleConstruct}各方面的重要性与表现`, `tab:${bp.slug}-ipa`, find('ipa'), ['方面', '隐性重要性', '表现均值', '象限']),
      },
    },
    {
      id: 'sampling-size',
      title: '03 Cochran 样本量公式与设计效应',
      badge: '抽样设计',
      summary: '按置信水平、允许误差和预估比例算出所需样本量；有抽样框的复杂抽样再乘设计效应，并按预估有效率放大发放量。',
      auditUpgrade: '设计效应与有效率是设计时的假设，须写明来源；便利样本没有抽样框，算出的样本量只服务估计精度，不能把便利样本说成概率样本。',
      targetNode: 'design.sampling',
      snippets: {
        python: `import math

z, p, e = 1.96, 0.5, 0.05   # 95% 置信水平、预估比例、允许误差
deff = 1.0                  # 设计效应：简单随机抽样为 1；分层或整群抽样按设计估计后填写
valid_rate = 0.9            # 预估有效率：按预调查结果填写

n0 = z ** 2 * p * (1 - p) / e ** 2
n_design = math.ceil(n0 * deff)
n_issue = math.ceil(n_design / valid_rate)
print(f"n0 = {n0:.2f}, 设计后 = {n_design}, 计划发放 = {n_issue}")`,
        r: `z <- 1.96; p <- 0.5; e <- 0.05
deff <- 1.0        # 设计效应，按抽样设计填写
valid_rate <- 0.9  # 预估有效率，按预调查填写
n0 <- z^2 * p * (1 - p) / e^2
cat(sprintf("n0 = %.2f, 设计后 = %d, 计划发放 = %d\\n", n0, ceiling(n0 * deff), ceiling(ceiling(n0 * deff) / valid_rate)))`,
        spss: `* 质量筛查：注意力题须选 4，并检查直线作答（五个方面答案完全相同）.
COMPUTE attention_ok = (Q8 = 4).
COMPUTE straight = (Q3 = Q4 AND Q4 = Q5 AND Q5 = Q6 AND Q6 = Q7).
FREQUENCIES VARIABLES = attention_ok straight.`,
        latex: `\\begin{equation}
  n_{0} = \\frac{Z_{\\alpha/2}^{2}\\,P(1-P)}{e^{2}}, \\qquad
  n_{\\text{设计}} = \\left\\lceil n_{0} \\times \\mathrm{DEFF} \\right\\rceil, \\qquad
  n_{\\text{发放}} = \\left\\lceil \\frac{n_{\\text{设计}}}{\\text{预估有效率}} \\right\\rceil
\\end{equation}`,
      },
    },
    {
      id: 'kmeans-silhouette',
      title: `04 受访者 K 均值分群与轮廓系数`,
      badge: '分群核验',
      summary: '在标准化后的五个方面上做 K 均值聚类，用轮廓系数比较不同的 k，并用重抽样检查分群是否稳定。',
      auditUpgrade: '参与聚类的变量不能再拿来做显著性检验来“证明”分群有效；k 的选择要写出依据。',
      targetNode: 'sample.profile',
      snippets: {
        python: `import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import StandardScaler

df = pd.read_csv("${csvName}")
X = StandardScaler().fit_transform(df[["Q3", "Q4", "Q5", "Q6", "Q7"]])
for k in range(2, 7):
    labels = KMeans(n_clusters=k, n_init=20, random_state=42).fit_predict(X)
    print(f"k = {k}: silhouette = {silhouette_score(X, labels):.3f}")

k = 3  # 按上面的轮廓系数和解释性选择
base = KMeans(n_clusters=k, n_init=30, random_state=42).fit(X)
rng = np.random.default_rng(42)
aris = []
for _ in range(100):
    idx = rng.choice(len(X), size=len(X), replace=True)
    boot = KMeans(n_clusters=k, n_init=10, random_state=42).fit(X[idx])
    aris.append(adjusted_rand_score(base.labels_[idx], boot.labels_))
print(f"bootstrap ARI = {np.mean(aris):.3f} (SD {np.std(aris):.3f})")`,
        r: `library(cluster)
df <- read.csv("${csvName}")
X <- scale(df[, c("Q3", "Q4", "Q5", "Q6", "Q7")])
set.seed(42)
for (k in 2:6) {
  km <- kmeans(X, centers = k, nstart = 25)
  cat(sprintf("k = %d: silhouette = %.3f\\n", k, summary(silhouette(km$cluster, dist(X)))$avg.width))
}`,
        spss: `* 先把 Q3–Q7 标准化为 ZQ3–ZQ7.
QUICK CLUSTER ZQ3 ZQ4 ZQ5 ZQ6 ZQ7
  /MISSING = LISTWISE
  /CRITERIA = CLUSTER(3) MXITER(50)
  /SAVE CLUSTER(cluster_k3)
  /PRINT INITIAL ANOVA CLUSTER.`,
        latex: booktabs('各类受访者在五个方面上的标准化中心', `tab:${bp.slug}-clusters`, find('cluster'), ['类别', '人数', d3.short, d4.short, d5.short, d6.short, d7.short]),
      },
    },
    {
      id: 'regression',
      title: `05 ${bp.conversionConstruct}影响因素的多元回归`,
      badge: '关联建模',
      summary: `以五个方面、${bp.mechanismConstruct}和${bp.overallSatConstruct}预测${bp.conversionConstruct}，报告系数、置信区间与共线性诊断。`,
      auditUpgrade: '横截面回归只说明控制其他变量后的关联，不写成“导致”；同时报告 VIF 和异方差检验，必要时用稳健标准误。',
      targetNode: 'drivers.model',
      snippets: {
        python: `import pandas as pd
import statsmodels.api as sm
from statsmodels.stats.outliers_influence import variance_inflation_factor

df = pd.read_csv("${csvName}")
X = sm.add_constant(df[["Q3", "Q4", "Q5", "Q6", "Q7", "Q9", "Q10"]])
model = sm.OLS(df["Q11"], X).fit(cov_type="HC3")  # 稳健标准误
print(model.summary())
print({c: round(variance_inflation_factor(X.values, i), 2) for i, c in enumerate(X.columns) if c != "const"})`,
        r: `df <- read.csv("${csvName}")
fit <- lm(Q11 ~ Q3 + Q4 + Q5 + Q6 + Q7 + Q9 + Q10, data = df)
summary(fit)
car::vif(fit)
lmtest::bptest(fit)`,
        spss: `REGRESSION
  /STATISTICS COEFF OUTS CI(95) R ANOVA COLLIN TOL
  /DEPENDENT Q11
  /METHOD = ENTER Q3 Q4 Q5 Q6 Q7 Q9 Q10.`,
        latex: booktabs(`${bp.conversionConstruct}影响因素的回归估计结果`, `tab:${bp.slug}-regression`, find('regression'), ['变量', '非标准化系数 B', '标准误', '标准化系数 β', 't', 'p', 'VIF']),
      },
    },
  ];

  const q = query.toLowerCase();
  let activeRecipeId = recipes[0].id;
  if (/ipa|痛点|象限|权重/u.test(q)) activeRecipeId = 'implicit-ipa';
  else if (/抽样|样本量|deff|cochran|清洗|质控/u.test(q)) activeRecipeId = 'sampling-size';
  else if (/聚类|分群|kmeans|轮廓/u.test(q)) activeRecipeId = 'kmeans-silhouette';
  else if (/回归|regression|影响因素/u.test(q)) activeRecipeId = 'regression';

  let activeLang: CodeStudioLang = 'python';
  if (/\br语言|\br\b|tidyverse/u.test(q)) activeLang = 'r';
  else if (/spss/u.test(q)) activeLang = 'spss';
  else if (/latex|三线表|booktabs/u.test(q)) activeLang = 'latex';

  return { activeRecipeId, activeLang, recipes };
}

/* ──────────────────────────────────────────────────────────────────────────
 * 3. Writing studio (`/撰稿`)
 * ────────────────────────────────────────────────────────────────────────── */

export type WritingTemplateSpec = {
  id: string;
  title: string;
  nodeId: string;
  nodeLabel: string;
  stageBadge: string;
  defaultDraft: string;
  checklist: string[];
};

export type WritingStudioFact = {
  id: string;
  token: string;
  label: string;
  value: string;
  origin: string;
};

export type WritingStudioCardData = {
  activeTemplateId: string;
  templates: WritingTemplateSpec[];
  /** The registered results' numbers, each with the statement it belongs to; empty until a result is registered. */
  facts: WritingStudioFact[];
};

export type WritingAuditReport = {
  score: number;
  wordCount: number;
  factMentions: number;
  checks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
};

export function auditWritingDraft(text: string): WritingAuditReport {
  const clean = text.trim();
  const wordCount = clean.length;
  const numMatches = clean.match(/\d+(?:\.\d+)?%?/gu) ?? [];
  const hasStats = /(?:χ²|卡方|t\s*[=(]|F\s*[=(]|ρ\s*=|p\s*[<=>]|α\s*=|n\s*=|OR\s*=|有效样本)/iu.test(clean);
  const blanks = (clean.match(/（待填[^）]{0,120}）|\u3010[^\u3011]{0,48}\u3011/gu) ?? []).length;
  const causalOverclaim = /相关|关联/u.test(clean) && /导致|决定了|必然引起/u.test(clean);
  const hasActor = /主办方|运营方|部门|政府|街道|社区|学校|学院|平台|企业|中心|协会|委员会/u.test(clean);
  const hasMeasure = /指标|评估|考核|复盘|跟踪|监测/u.test(clean);
  const hasBoundary = /局限|边界|外推|便利样本|非概率|意愿不等于|教学模拟/u.test(clean);
  const hasCliche = /众所周知|不言而喻|毫无疑问|填补了国内空白/u.test(clean);

  const checks = [
    {
      id: 'evidence',
      label: '数字来自登记结果',
      passed: blanks === 0 && numMatches.length >= 2 && hasStats,
      detail: blanks
        ? `尚有 ${blanks} 处待填项未补齐，请从上方实证读数胶囊点击注入已登记结果，不要手填数字。`
        : numMatches.length >= 2 && hasStats
          ? `已写入 ${numMatches.length} 处数字和检验量，请确认每个数字都来自已登记结果。`
          : '需写入样本量、比例或检验统计量，并且都来自已登记结果。',
    },
    {
      id: 'causal',
      label: '相关与因果措辞克制',
      passed: !causalOverclaim,
      detail: causalOverclaim ? '相关表述旁出现了“导致/决定了”等因果词，请改为“与……相关/伴随”。' : '关联与因果的边界表述得当。',
    },
    {
      id: 'academic',
      label: '去套话',
      passed: !hasCliche && wordCount >= 80,
      detail: hasCliche ? '含“众所周知/填补空白”等空泛套话，请直接用结果说话。' : `语体稳健（当前 ${wordCount} 字）。`,
    },
    {
      id: 'action-boundary',
      label: '执行主体、评估指标或适用边界',
      passed: (hasActor && hasMeasure) || hasBoundary,
      detail: (hasActor && hasMeasure) || hasBoundary ? '已写明执行主体与评估指标，或交代了适用边界。' : '补上由谁执行、用什么指标评估，或交代结论的适用边界。',
    },
  ];

  const passedCount = checks.filter(c => c.passed).length;
  return { score: Math.round((passedCount / checks.length) * 100), wordCount, factMentions: numMatches.length, checks };
}

export function buildWritingStudioCardData(ctx: RouterContext, query = ''): WritingStudioCardData {
  const bp = resolveActiveBlueprint(ctx, query);
  const [d3, d4, d5, d6, d7] = bp.dimensions;
  const held = ctx.results;
  const facts: WritingStudioFact[] = held && held.results.length
    ? extractStudioFacts(held, 'conclusion.findings').slice(0, 16).map(f => ({
      id: f.id,
      token: f.text.replace(/\u300c([^\u300d]+)\u300d/gu, '“$1”').replace(/\u3010([^\u3011]+)\u3011/gu, '（$1）'),
      label: f.text.replace(/^(?:\u300c([^\u300d]+)\u300d|“([^”]+)”).*$/u, '$1$2').slice(0, 18),
      value: f.value,
      origin: '已登记结果',
    }))
    : [];
  const aspects = [d3, d4, d5, d6, d7].map(d => d.short).join('、');

  const templates: WritingTemplateSpec[] = [
    {
      id: 'abstract',
      title: `01 结构化摘要（问题、方法、发现与建议）`,
      nodeId: 'abstract',
      nodeLabel: '摘要',
      stageBadge: '结构化摘要',
      defaultDraft: `针对${bp.shortTitle}中${bp.groupA}与${bp.groupB}在参与方式、服务体验与持续使用意愿上的差异，本文通过问卷调查收集数据（待填样本来源与抽样方式），获取有效样本（待填有效样本量）份。首先，运用列联表卡方检验比较两类人群的${bp.statusConstruct}（待填χ²、自由度、p值与Cramér’s V）；其次，结合信度检验与均值比较评价${aspects}五个方面（待填α系数与主要差异）；随后，借助重要性—表现分析定位亟待改进的薄弱环节（待填处于重点改进象限的方面）；最后，通过回归与秩相关考察${bp.overallSatConstruct}、${bp.mechanismConstruct}与${bp.conversionConstruct}之间的统计关联（待填主要系数），并据此提出针对性改进路径（待填对策要点）。\n关键词涵盖${bp.keywords.join('、')}`,
      checklist: ['第一句直接点明核心研究问题', '方法与发现按“首先—其次—随后—最后”依次展开', '每一处待填项都替换为已登记结果中的实测数字', '末行补充五到七个核心关键词'],
    },
    {
      id: 'sampling-qc',
      title: '02 抽样设计与数据清洗',
      nodeId: 'design.sampling',
      nodeLabel: '抽样设计',
      stageBadge: '抽样与质控',
      defaultDraft: `本研究以${bp.region}的${bp.groupA}与${bp.groupB}为调查对象，采用（待填抽样方式）获取样本。（待填抽样框来源、各阶段抽样单位与样本量计算参数，若属便利样本则写明招募方式并说明结论不外推到总体）。问卷回收后按注意力核查题、直线作答与重复提交三条规则严格筛查，累计回收（待填回收份数）份，剔除（待填剔除份数）份，保留有效样本（待填有效份数）份，有效回收率为（待填有效率），其中内容完全重复的答卷采取（待填处理方式）。`,
      checklist: ['抽样方式与实际做法一致，便利样本不借用概率抽样的名称', '样本量计算写明参数来源', '清洗规则、剔除数与有效率逐项交代', '交代结论的适用边界'],
    },
    {
      id: 'empirical',
      title: '03 实证结果解读（检验、效应量与含义）',
      nodeId: 'compare.tests',
      nodeLabel: '差异检验与相关分析',
      stageBadge: '实证读数',
      defaultDraft: `鉴于${bp.groupConstruct}与${bp.statusConstruct}均为无序分类变量，故采用 Pearson 卡方检验并以 Cramér’s V 衡量关联强度。检验结果显示（待填χ²自由度、统计量数值、p值与Cramér’s V），其中${bp.groupA}选择“${bp.statusCategories[0]}”的比例为（待填第一组比例），${bp.groupB}对应比例为（待填第二组比例）。（待填显著性判断，若检验不显著则写“现有样本不足以表明二者存在关联”，不写“没有差异”）。这一分布结果（待填对实际决策的含义），但横截面数据仅反映分布上的关联，不能据此推断因果。`,
      checklist: ['写明为什么选这个检验', '统计量、自由度、p 值与效应量一起报告', '不显著时不写成“没有差异”', '交代关联不等于因果'],
    },
    {
      id: 'suggestions',
      title: '04 对策建议（主体、做法与评估指标）',
      nodeId: 'conclusion.suggestions',
      nodeLabel: '对策建议',
      stageBadge: '对策落地',
      defaultDraft: `针对（待填重点改进象限中的薄弱方面），建议由（待填执行主体）落实（待填具体做法），并以（待填评估指标）跟踪落地效果。\n围绕（待填第二项核心发现），建议由（待填执行主体）推进（待填具体做法），并以（待填评估指标）跟踪阶段效果。\n结合（待填第三项核心发现），建议由（待填执行主体）完善（待填具体做法），并以（待填评估指标）开展复盘评估。\n以上建议基于（待填数据性质与样本覆盖范围），正式推广前应先在小范围试行。`,
      checklist: ['每条建议对应一项实证发现', '写明执行主体与具体做法', '评估指标写名称，不预设没有依据的目标值', '交代建议的适用范围'],
    },
    {
      id: 'defense',
      title: '05 答辩准备（评委常问的三组问题）',
      nodeId: 'conclusion.limits',
      nodeLabel: '研究局限',
      stageBadge: '答辩准备',
      defaultDraft: `第一组评委追问聚焦样本能否代表总体。应答时说明本研究的样本来自（待填抽样方式），共获有效样本（待填有效样本量）份；（待填代表性边界说明，若属便利样本则坦白说明不代表总体且结论只适用于样本覆盖的人群，若属概率样本则说明抽样框与权重依据）。\n\n第二组评委追问聚焦为何选用这一统计方法。应答时指出（待填变量测量类型）决定了模型适配（待填统计方法），同时报告中已配套呈现（待填效应量或稳健性检查）。\n\n第三组评委追问聚焦对策建议是否有实证依据。应答时逐条指回（待填具体图表编号或检验结果），并明确交代执行主体和跟踪评估指标。`,
      checklist: ['如实回答样本的代表性', '方法选择说得出理由', '建议能指回具体结果'],
    },
  ];

  const q = query.toLowerCase();
  let activeTemplateId = templates[0].id;
  if (/抽样|质控|清洗/u.test(q)) activeTemplateId = 'sampling-qc';
  else if (/实证|卡方|检验|读数/u.test(q)) activeTemplateId = 'empirical';
  else if (/对策|建议/u.test(q)) activeTemplateId = 'suggestions';
  else if (/答辩|路演|局限|评委/u.test(q)) activeTemplateId = 'defense';

  return { activeTemplateId, templates, facts };
}

/* ──────────────────────────────────────────────────────────────────────────
 * 4. Turns: the teaching demo (`/铸造`, `/国奖`), `/备赛`, `/绘图`, `/编程`, `/撰稿`
 * ────────────────────────────────────────────────────────────────────────── */

export function buildDemoTurn(ctx: RouterContext, query = ''): AgentTurn {
  const bp = resolveActiveBlueprint(ctx, query);
  const roomSummaryLines: Line[] = LIT_ROOMS.map(id => {
    const rl = roomLight(ctx.light, id);
    const sc = rl?.score ?? 0;
    return [
      t(id === 'design' ? '01 问卷映射' : id === 'sampling' ? '02 抽样与质控' : id === 'analysis' ? '03 统计分析' : '04 报告', 'strong'),
      t(lightBar(sc), sc >= 0.999 ? 'gold' : sc > 0 ? 'teal' : 'dim'),
      t(percent(sc), sc >= 0.999 ? 'gold' : 'dim'),
      t(rl?.summary ?? '待接入', 'dim'),
    ];
  });

  const cards: AgentCard[] = [
    {
      kind: 'tool',
      title: `选题结构 · 《${bp.title}》`,
      columns: true,
      lines: [
        [t('群际分组', 'dim'), t(`${bp.groupA} / ${bp.groupB}`, 'gold')],
        [t(bp.statusConstruct, 'dim'), t(bp.statusCategories.join(' / '), 'gold')],
        [t('核心维度', 'dim'), t(bp.dimensions.map(d => d.short).join(' · '), 'gold')],
        [t('结果变量', 'dim'), t(`${bp.overallSatConstruct} · ${bp.conversionConstruct}`, 'gold')],
      ],
      links: [
        say('换题体验 · 社区助餐', '教学模拟研究：城市社区助餐服务的使用体验、满意度与持续使用意愿调查'),
        say('换题体验 · 大学生智能学习工具', '教学模拟研究：大学生使用 AI 学习工具的体验、规范认知与持续使用意愿调查'),
        say('换题体验 · 城市文体活动', '教学模拟研究：城市文体活动的现场体验、满意度与重游意愿调查'),
      ],
    },
    {
      kind: 'confirm',
      title: `按《${bp.shortTitle}》生成一套教学模拟研究`,
      lines: [
        [
          t('本次将按选题设计 20 题多因子问卷与模拟作答（含少量会被质量筛查剔除的答卷），由分析引擎在清洗后的数据上'),
          t('实际计算', 'strong'),
          t('效度与信度（EFA / α）、列联表卡方、相关、多元回归、K-means 分群与 IPA 诊断，登记结果并自动装配十一类定量图表、结构化报告初稿、参考文献与四项可复现附录。全部标注'),
          t('教学模拟数据', 'gold'),
          t('，可在生成后直接查看论文与演示稿，或用全报告流水线逐章改写。会替换当前工作区内容。'),
        ],
      ],
      confirm: {
        label: `生成《${bp.shortTitle}》教学模拟研究`,
        action: { type: 'loadBenchmark', benchmarkId: bp.title },
        primary: true,
      },
      cancel: '先不替换当前工作区',
    },
    {
      kind: 'tool',
      title: `当前工作区证据完整度（总照度 ${percent(ctx.light.overall)}）`,
      columns: true,
      lines: roomSummaryLines,
    },
  ];

  return {
    lines: [
      [
        t('已为你准备教学模拟研究方案 '),
        t(`《${bp.title}》`, 'strong'),
        t('。问卷与作答都是为演示平台全流程生成的，报告里的每个数字都由分析引擎在模拟数据上算出，不取自任何真实报告。'),
      ],
    ],
    cards,
    chips: [
      recommend({
        label: '⚡ 启动实时深访与预测试推演',
        action: { type: 'siliconTheater', topic: bp.title, templateKey: inferSiliconTemplate(`${bp.title} ${ctx.design?.population ?? ''}`), size: 24, autoPlay: true },
        primary: true,
      }),
      say('按当前选题看图表', `打开图表工坊 · ${bp.shortTitle}`),
      say('按当前选题看代码', `打开代码工坊 · ${bp.shortTitle}`),
      say('按当前选题看写作模板', `打开撰稿工坊 · ${bp.shortTitle}`),
      say('查看备赛路线'),
    ],
  };
}

export function buildCoachTurn(ctx: RouterContext, query = ''): AgentTurn {
  const bp = resolveActiveBlueprint(ctx, query);
  const dScore = roomLight(ctx.light, 'design')?.score ?? 0;
  const sScore = roomLight(ctx.light, 'sampling')?.score ?? 0;
  const aScore = roomLight(ctx.light, 'analysis')?.score ?? 0;
  const eScore = roomLight(ctx.light, 'editor')?.score ?? 0;

  const stages: Array<{ code: string; name: string; done: boolean; standard: string; action: AgentLink['action'] }> = [
    { code: '阶段 01', name: '立题', done: dScore >= 0.5, standard: '从现实问题出发，写清研究问题、决策用途与可检验的问题', action: { type: 'open', room: 'diagnose' } },
    { code: '阶段 02', name: '问卷', done: dScore >= 0.999, standard: '每题对应构念与分析方法，量表方向一致，设置注意力检查题', action: { type: 'open', room: 'design' } },
    { code: '阶段 03', name: '抽样与预调查', done: sScore >= 0.66, standard: '样本量公式写明参数来源，有抽样框才谈设计效应，预调查校准题项', action: { type: 'open', room: 'sampling' } },
    { code: '阶段 04', name: '回收与清洗', done: sScore >= 0.999 && aScore >= 0.33, standard: '按注意力题、作答时长、直线作答与重复提交筛查，逐项报告剔除数与有效率', action: { type: 'open', room: 'analysis' } },
    { code: '阶段 05', name: '统计分析', done: aScore >= 0.66, standard: '描述 → 信度 → 差异检验（名义变量用卡方）→ 关联与回归 → 分群，每步报告效应量', action: { type: 'say', text: '打开代码工坊' } },
    { code: '阶段 06', name: '图表', done: eScore >= 0.6 && (ctx.results?.placed.length ?? 0) >= 2, standard: '一图一结论，标注样本口径与来源，正文引用并解读', action: { type: 'say', text: '打开图表工坊' } },
    { code: '阶段 07', name: '撰稿', done: aScore >= 0.999 && eScore >= 0.9, standard: '先结论后证据，数字来自登记结果，对策对应发现并写明执行主体与评估指标', action: { type: 'say', text: '打开撰稿工坊' } },
    { code: '阶段 08', name: '答辩', done: eScore >= 0.999, standard: '路演页与报告一致，预先准备样本代表性、方法选择与建议依据三类追问', action: { type: 'open', room: 'defense' } },
  ];

  const firstPending = stages.find(s => !s.done) ?? stages[stages.length - 1];
  const doneCount = stages.filter(s => s.done).length;

  return {
    lines: [
      [
        t(`备赛路线（当前选题《${bp.shortTitle}》）已完成 `),
        t(`${doneCount} / 8`, 'gold'),
        t(' 个阶段（总照度 '),
        t(percent(ctx.light.overall), 'gold'),
        t('），建议优先推进 '),
        t(`${firstPending.code} ${firstPending.name}`, 'strong'),
        t('。'),
      ],
    ],
    cards: [
      {
        kind: 'tool',
        title: `市调大赛备赛八个阶段（当前选题《${bp.shortTitle}》）`,
        columns: true,
        lines: stages.map(s => [
          t(s.done ? '● 已完成' : '○ 待推进', s.done ? 'gold' : 'teal'),
          t(`${s.code} ${s.name}`, 'strong'),
          t(s.standard, 'dim'),
        ]),
        links: [
          recommend({ label: `推进下一环节 · ${firstPending.name}`, action: firstPending.action }),
          say('生成教学模拟研究'),
          say('打开图表工坊'),
          say('打开代码工坊'),
          say('打开撰稿工坊'),
        ],
      },
    ],
    chips: [
      recommend(say('生成教学模拟研究')),
      say('打开图表工坊'),
      say('打开代码工坊'),
      say('打开撰稿工坊'),
      say('查验循证印鉴'),
    ],
  };
}

export function buildChartStudioTurn(ctx: RouterContext, query = ''): AgentTurn {
  const bp = resolveActiveBlueprint(ctx, query);
  const studio = buildChartStudioCardData(ctx, query);
  return {
    lines: [
      studio.datasets.length
        ? [t('已打开'), t('图表工坊', 'strong'), t(`，共有 ${studio.datasets.length} 项已登记结果可绘制成图，支持切换图型与配色、编辑标签、导出高清矢量图或写入报告。`)]
        : [t('图表工坊里还没有可绘制的结果，请先在数据分析里运行并登记结果，或点击下方生成一套教学模拟研究。')],
    ],
    cards: [{ kind: 'chart-studio', title: `图表工坊 · 《${bp.shortTitle}》`, studio }],
    chips: [
      recommend(say('打开代码工坊', `打开代码工坊 · ${bp.shortTitle}`)),
      say('打开撰稿工坊', `打开撰稿工坊 · ${bp.shortTitle}`),
      say('生成教学模拟研究'),
    ],
  };
}

export function buildCodeStudioTurn(ctx: RouterContext, query = ''): AgentTurn {
  const bp = resolveActiveBlueprint(ctx, query);
  const studio = buildCodeStudioCardData(ctx, query);
  return {
    lines: [
      [
        t('已打开'),
        t('代码工坊', 'strong'),
        t('，五项分析的 '),
        t('Python / R / SPSS', 'teal'),
        t(' 脚本均从数据文件直接计算；LaTeX 三线表取自已登记结果，尚未登记时仅提供表格骨架。'),
      ],
    ],
    cards: [{ kind: 'code-studio', title: `代码工坊 · 《${bp.shortTitle}》`, studio }],
    chips: [
      recommend(say('打开撰稿工坊', `打开撰稿工坊 · ${bp.shortTitle}`)),
      say('打开图表工坊', `打开图表工坊 · ${bp.shortTitle}`),
      say('生成教学模拟研究'),
    ],
  };
}

export function buildWritingStudioTurn(ctx: RouterContext, query = ''): AgentTurn {
  const bp = resolveActiveBlueprint(ctx, query);
  const studio = buildWritingStudioCardData(ctx, query);
  return {
    lines: [
      [
        t('已打开'),
        t('撰稿工坊', 'strong'),
        t('，五个核心章节支持连接智能写作服务按已登记事实自动起草，也可手动填充模板并嵌入 '),
        t(studio.facts.length ? `${studio.facts.length} 条已登记结果` : '登记后的事实', 'gold'),
        t('，完成后即时进行学术合规体检。'),
      ],
    ],
    cards: [{ kind: 'writing-studio', title: `撰稿工坊 · 《${bp.shortTitle}》`, studio }],
    chips: [
      recommend(say('查看报告进度')),
      say('打开图表工坊', `打开图表工坊 · ${bp.shortTitle}`),
      say('打开代码工坊', `打开代码工坊 · ${bp.shortTitle}`),
      say('生成教学模拟研究'),
    ],
  };
}

export type SiliconTemplateKey = 'residents' | 'students' | 'seniors';

export type SiliconTheaterCardData = {
  topic: string;
  shortTitle: string;
  domainLabel: string;
  templateKey: SiliconTemplateKey;
  size: number;
  hasBoundDesign: boolean;
  questionCount: number;
  populationLabel: string;
  dimensions: string[];
};

export function inferSiliconTemplate(raw: string): SiliconTemplateKey {
  if (/老年|老人|银发|高龄|助餐|养老|社区食堂|退休/u.test(raw)) return 'seniors';
  if (/大学|高校|校园|本科|研究生|学生|青春|Z世代|二次元/u.test(raw)) return 'students';
  return 'residents';
}

export function buildSiliconTheaterCardData(ctx: RouterContext, query = ''): SiliconTheaterCardData {
  const bp = resolveActiveBlueprint(ctx, query);
  const hasBoundDesign = Boolean(ctx.design && ctx.design.questions.length > 0);
  const templateHint = `${query} ${ctx.design?.population ?? ''} ${ctx.design?.title ?? ''} ${bp.title}`;
  const defaultQuestionCount = hasBoundDesign
    ? ctx.design!.questions.length
    : DEMO_QUESTION_COUNT;
  return {
    topic: ctx.design?.title?.trim() || bp.title,
    shortTitle: bp.shortTitle,
    domainLabel: bp.domainLabel,
    templateKey: inferSiliconTemplate(templateHint),
    size: 24,
    hasBoundDesign,
    questionCount: defaultQuestionCount,
    populationLabel: ctx.design?.population?.trim() || `${bp.groupA} / ${bp.groupB}`,
    dimensions: bp.dimensions.map(d => d.short).slice(0, 5),
  };
}

export function buildSiliconTheaterTurn(ctx: RouterContext, query = ''): AgentTurn {
  const studio = buildSiliconTheaterCardData(ctx, query);
  return {
    lines: [
      [
        t('已就绪 '),
        t('样本预测试推演流程', 'strong'),
        t(`（《${studio.shortTitle}》 · `),
        t(studio.hasBoundDesign ? `绑定当前项目 ${studio.questionCount} 题问卷` : `研究构念 ${studio.questionCount} 题问卷`, 'teal'),
        t(' · '),
        t(`${studio.size} 位分层模拟受访者`, 'gold'),
        t('）。所有回答均标注为“模拟回答 · 与真实调查分开”，推演结果可直接送入数据分析或写入预测试记录。'),
      ],
    ],
    cards: [
      {
        kind: 'silicon-theater',
        title: `样本预测试推演 · 《${studio.shortTitle}》`,
        studio,
      },
    ],
    chips: [
      recommend({
        label: '启动实时预测试推演',
        action: {
          type: 'siliconTheater',
          topic: studio.topic,
          templateKey: studio.templateKey,
          size: studio.size,
          autoPlay: true,
        },
        primary: true,
      }),
      { label: '前往工作台样本预测试 ↗', action: { type: 'href', href: '/workspace#silicon' } },
      say('生成教学模拟全案', `生成《${studio.shortTitle}》教学模拟研究`),
    ],
  };
}
