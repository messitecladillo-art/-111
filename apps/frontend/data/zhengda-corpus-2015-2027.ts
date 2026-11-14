/**
 * 2015–2027 正大杯市场调查与分析大赛全量语料、第十七届官方赛程/名额/评分规范、
 * 2027 年 50 大高潜选题池与 17 类经典调查问卷模板中心。
 *
 * 数据来源声明（严格分层，绝不混淆来源级别）：
 * 1. `ZHENGDA_ARCHIVE_2015_2025`: 源自用户本地 2014–2025 历届正大杯报告 PDF 合集（204 篇题名与 SHA-256 去重索引），
 *    属于 `user_provided_local_archive` 描述性参照语料，用于文献图谱词云/共现/突现分析与结构借鉴，不作官网公告核验声明。
 * 2. `EDITION_17_OFFICIAL_GUIDE`: 严格依据《关于第十七届全国大学生市场调查与分析大赛的通知》（中商统〔2026〕33号）、
 *    实践赛指导意见、本科/研究生评分打分表与《附件8：报告排版格式要求》整理。
 * 3. `TOPICS_2027_POOL`: 源自用户提供的《50 个 2027 年正大杯高质量选题参考》（五大主题完整 50 条）。
 * 4. `SURVEY_17_CATEGORY_TEMPLATES`: 提炼自《17种类别调查问卷案例及参考资料》（涵盖 16 个实地分类目录 + 社会现状调研范式）。
 */

import archiveData from './zhengda-award-archive-2015-2025.json' with { type: 'json' };
import type { LitRecord } from '../lib/topic-lab/parse.ts';
import type { LiteratureCandidate } from '../lib/agent/studio-tools.ts';

/* ───────── 1. 2015–2025 历届国奖全量题录索引（204 篇） ───────── */

export type ArchiveReportRecord = {
  id: string;
  title: string;
  hook: string;
  subtitle: string;
  year: number;
  edition: string;
  award: string;
  group: string;
  isCpProposition: boolean;
  keywords: string[];
  pages: number | null;
  sha256Prefix: string;
  sourceTag: string;
  provenance: string;
};

export const ZHENGDA_ARCHIVE_META = {
  schema: archiveData.schema,
  capturedAt: archiveData.capturedAt,
  provenance: archiveData.provenance,
  disclaimer: archiveData.disclaimer,
  totalReports: archiveData.totalReports,
  yearSpan: archiveData.yearSpan as [number, number],
  cpPropositions: archiveData.cpPropositions,
} as const;

export const ZHENGDA_ARCHIVE_2015_2025: readonly ArchiveReportRecord[] = archiveData.records;

/** 将 200+ 篇历届国奖题录转为 TopicLab 可直接计算词云、共现网络、Kleinberg 突现与研究空白的 LitRecord 列表。 */
export function zhengdaArchiveLitRecords(): LitRecord[] {
  return ZHENGDA_ARCHIVE_2015_2025.map(item => ({
    id: item.id,
    title: item.title,
    authors: item.isCpProposition ? ['正大杯企业命题组'] : ['正大杯参赛团队'],
    year: item.year,
    source: `${item.edition} · ${item.award}${item.group !== '本科组/未标注' ? `（${item.group}）` : ''}`,
    keywords: item.keywords,
    keywordsPlus: item.isCpProposition ? ['正大集团企业命题', item.edition] : [item.edition],
    abstract: item.subtitle ? `主标题：${item.hook || item.title}；研究聚焦：${item.subtitle}` : item.title,
    citations: null,
    doi: '',
    refs: [],
    refLabels: [],
    format: 'library' as const,
  }));
}

/* ───────── 2. 2027 年正大杯 50 个高质量选题参考（五大主题） ───────── */

export type TopicTheme2027 =
  | '智能与 AI 消费'
  | '情绪 · 圈层与 IP 消费'
  | '文旅 · 城市与赛事经济'
  | '银发 · 健康与宠物消费'
  | '渠道 · 零售 · 校园与可持续消费';

export type TopicPoolItem2027 = {
  id: number;
  theme: TopicTheme2027;
  categoryTag: string;
  title: string;
  methodDesign: string;
  coreConstructs: string[];
  sampleTarget: string;
};

export const TOPIC_THEMES_2027: readonly TopicTheme2027[] = [
  '智能与 AI 消费',
  '情绪 · 圈层与 IP 消费',
  '文旅 · 城市与赛事经济',
  '银发 · 健康与宠物消费',
  '渠道 · 零售 · 校园与可持续消费',
];

export const TOPICS_2027_POOL: readonly TopicPoolItem2027[] = [
  // 一、智能与 AI 消费（12 个）
  {
    id: 1,
    theme: '智能与 AI 消费',
    categoryTag: 'AI 消费',
    title: '生成式 AI 会员到底值多少钱？订阅制付费意愿与价格敏感度测算',
    methodDesign: 'PSM 价格敏感度测试 + Conjoint 联合分析（拆解深度推理/长文档/图像/陪伴功能边际 WTP）',
    coreConstructs: ['生成式AI', '付费意愿', '价格敏感度', '联合分析'],
    sampleTarget: '有过 AIGC 使用经历的大学生与职场青年',
  },
  {
    id: 2,
    theme: '智能与 AI 消费',
    categoryTag: 'AI 消费',
    title: '从“工具”到“陪伴者”：AI 情感陪伴类产品的付费意愿与用户黏性形成机制',
    methodDesign: '结构方程模型（SEM）检验孤独感/拟人化感知/情绪补偿对付费转化的中介与隐私调节效应',
    coreConstructs: ['AI陪伴', '拟人化', '情绪补偿', '用户黏性', '隐私顾虑'],
    sampleTarget: '在校大学生和初入职场青年',
  },
  {
    id: 3,
    theme: '智能与 AI 消费',
    categoryTag: 'AI 消费',
    title: '“懂我”还是“盯着我”？算法个性化推荐的双刃剑效应',
    methodDesign: '倒 U 型关系检验 + 带调节变量的中介模型（推荐便利感 vs 被追踪不适感）',
    coreConstructs: ['个性化推荐', '双刃剑效应', '购买意愿', '隐私侵入'],
    sampleTarget: '高频使用内容与电商平台的用户群体',
  },
  {
    id: 4,
    theme: '智能与 AI 消费',
    categoryTag: 'AI 消费',
    title: '把“选品权”交给 AI 吗？智能购物助手介入购买决策的机制研究',
    methodDesign: 'SEM 路径分析（AI 信任、感知准确性、隐私担忧与决策疲劳对让渡决策权的影响）',
    coreConstructs: ['智能购物助手', '决策权让渡', 'AI信任', '决策疲劳'],
    sampleTarget: '网购高频群体与电商 AI 导购用户',
  },
  {
    id: 5,
    theme: '智能与 AI 消费',
    categoryTag: 'AI 消费',
    title: 'AI 写的推荐，你信几分？AI 生成内容与真人博主推荐的信任对比实验',
    methodDesign: '单因素组间情境实验（标明 AI 生成 vs 达人原创文案，比较信任度/购买倾向/转发意愿）',
    coreConstructs: ['AIGC内容', '信任差异', '情境实验', '口碑传播'],
    sampleTarget: '高校大学生与社交媒体重度用户',
  },
  {
    id: 6,
    theme: '智能与 AI 消费',
    categoryTag: 'AI 终端',
    title: '“下一块屏”会是眼镜吗？青年群体对 AI 眼镜的采纳意愿与场景需求',
    methodDesign: '场景偏好排序（实时翻译/拍摄/导航/纪要）+ UTAUT/阻碍因素回归（售价/外形/续航/隐私）',
    coreConstructs: ['AI眼镜', '技术采纳', '场景需求', '隐私阻碍'],
    sampleTarget: '城市青年、科技数码关注群体与高校学生',
  },
  {
    id: 7,
    theme: '智能与 AI 消费',
    categoryTag: 'AI 终端',
    title: '陪聊机器人、AI 玩偶谁会买单？陪伴类智能硬件的接受度与人群细分',
    methodDesign: '三线对照比较（儿童/独居青年/老人）+ 聚类细分与价格区间测算',
    coreConstructs: ['陪伴硬件', '智能玩偶', '人群细分', '情感预期'],
    sampleTarget: '家长群体、独居青年及中老年人家庭照护者',
  },
  {
    id: 8,
    theme: '智能与 AI 消费',
    categoryTag: 'AI 伦理消费',
    title: '标了“AI 制作”还买吗？生成式广告披露对品牌评价的影响',
    methodDesign: '2×2 组间情境实验（是否标注 AI 生成 × 产品卷入度高低对品牌信任与购买意愿影响）',
    coreConstructs: ['AI披露', '生成式广告', '产品卷入度', '品牌信任'],
    sampleTarget: '青年消费群体及社交媒体广告受众',
  },
  {
    id: 9,
    theme: '智能与 AI 消费',
    categoryTag: 'AI+零售',
    title: '无人便利店为什么叫好不叫座？消费者对无人零售的接受度与阻力',
    methodDesign: '障碍因子识别回归（便利性、技术焦虑、支付安全、售后保障、隐私风险排序改进优先级）',
    coreConstructs: ['无人零售', '技术焦虑', '支付安全', '使用阻力'],
    sampleTarget: '社区与写字楼周边零售消费者',
  },
  {
    id: 10,
    theme: '智能与 AI 消费',
    categoryTag: 'AI+文旅',
    title: 'AI 讲解能替代导游吗？游客对智能导览服务的接受机制',
    methodDesign: '景区现场拦截访问 + 三方式对照（AI 讲解 vs 传统语音导览 vs 人工讲解同量表对比）',
    coreConstructs: ['AI导览', '文旅体验', '服务替代', '景区拦截'],
    sampleTarget: '本地博物馆或热门景区现场游客',
  },
  {
    id: 11,
    theme: '智能与 AI 消费',
    categoryTag: '智能穿戴',
    title: '不只是数步数：智能手表的功能价值排序与持续使用、付费转化',
    methodDesign: 'MaxDiff/功能价值排序 + Logistic/回归识别续费与口碑推荐核心驱动功能',
    coreConstructs: ['智能手表', '功能排序', '持续使用', '健康预警'],
    sampleTarget: '智能穿戴设备在用者与潜在换购人群',
  },
  {
    id: 12,
    theme: '智能与 AI 消费',
    categoryTag: '直播电商',
    title: '真人达人、品牌自播、数字人主播：三类主播的信任与转化差异',
    methodDesign: '三组对照实验（主播类型 × 产品类型调节，测度信任感、临场感与购买意愿）',
    coreConstructs: ['数字人主播', '直播电商', '临场感', '信任转化'],
    sampleTarget: '直播间常驻消费人群',
  },

  // 二、情绪 · 圈层与 IP 消费（10 个）
  {
    id: 13,
    theme: '情绪 · 圈层与 IP 消费',
    categoryTag: '情绪经济',
    title: '“买的是开心”：青年情绪价值消费的动机结构与人群分化',
    methodDesign: '探索性因子分析（EFA）提炼情绪动机 + K-means 聚类（疗愈型/社交型/犒赏型/收藏型）',
    coreConstructs: ['情绪价值', '自我奖励', '心理疗愈', '人群聚类'],
    sampleTarget: '18–35 岁都市青年消费者',
  },
  {
    id: 14,
    theme: '情绪 · 圈层与 IP 消费',
    categoryTag: '悦己经济',
    title: '单价不高、频次不低：小额悦己消费的心理账户与复购逻辑',
    methodDesign: '心理账户量表 + 复购频次结构方程建模（聚焦鲜花、咖啡、香氛、小饰品与甜点）',
    coreConstructs: ['悦己消费', '心理账户', '高频复购', '情绪回报'],
    sampleTarget: '都市轻熟青年与在校大学生',
  },
  {
    id: 15,
    theme: '情绪 · 圈层与 IP 消费',
    categoryTag: '谷子经济',
    title: '从入坑到退坑：IP 周边消费的生命周期与运营策略',
    methodDesign: '四阶段队列对照（入坑—沉迷—稳定—退坑）× 忠诚度/社群归属/稀缺感知差异检验',
    coreConstructs: ['谷子经济', 'IP周边', '社群归属', '生命周期'],
    sampleTarget: '二次元与潮玩 IP 周边活跃/退坑消费者',
  },
  {
    id: 16,
    theme: '情绪 · 圈层与 IP 消费',
    categoryTag: '潮玩消费',
    title: '隐藏款为什么让人上头？随机奖励机制下的重复购买行为',
    methodDesign: '损失厌恶/FOMO 错失恐惧/沉没成本多重中介 + 过度营销反噬检验',
    coreConstructs: ['盲盒复购', '损失厌恶', '错失恐惧', '随机奖励'],
    sampleTarget: '盲盒与随机抽取型潮玩消费群体',
  },
  {
    id: 17,
    theme: '情绪 · 圈层与 IP 消费',
    categoryTag: 'IP 经济',
    title: '为角色买单还是为产品买单？联名款中 IP 价值对溢价支付的影响',
    methodDesign: '联名强度实验/品牌对照 + 文化认同对溢价支付意愿（WTP）回归分析',
    coreConstructs: ['IP联名', '品牌溢价', '文化认同', '购买动机'],
    sampleTarget: '咖啡茶饮与美妆服饰联名款消费者',
  },
  {
    id: 18,
    theme: '情绪 · 圈层与 IP 消费',
    categoryTag: '情绪消费',
    title: '“丑萌”为什么好卖？非主流审美产品的情绪价值与传播机制',
    methodDesign: '荒诞感/解压感中介模型（检验非主流审美向购买与社交自发分享的转化机制）',
    coreConstructs: ['丑萌文创', '非主流审美', '解压感', '社交裂变'],
    sampleTarget: 'Z 世代文创周边及表情包衍生品受众',
  },
  {
    id: 19,
    theme: '情绪 · 圈层与 IP 消费',
    categoryTag: '情绪消费',
    title: '“好运经济”的理性一面：年轻人转运类消费的行为逻辑',
    methodDesign: '不确定性感知与心理慰藉驱动模型（涵盖祈愿饰品、寺庙文创、好运手机壳）',
    coreConstructs: ['好运经济', '不确定性感知', '心理慰藉', '仪式感'],
    sampleTarget: '高校毕业生、考研考公及青年职场人群',
  },
  {
    id: 20,
    theme: '情绪 · 圈层与 IP 消费',
    categoryTag: '社交消费',
    title: '“出片率”值多少钱？空间可展示性对线下消费选择的影响',
    methodDesign: '到店意愿与价格溢价联合测定（检验拍照传播价值向实际客单价的转化）',
    coreConstructs: ['空间打卡', '出片率', '价格溢价', '到店意愿'],
    sampleTarget: '网红餐饮、咖啡馆、民宿与打卡景区访客',
  },
  {
    id: 21,
    theme: '情绪 · 圈层与 IP 消费',
    categoryTag: '反向消费',
    title: '不看牌子看成分：质价比导向下的品牌选择逻辑变迁',
    methodDesign: '全链路决策过程对比（品牌光环消退与成分/耐用性/平替评估权重测算）',
    coreConstructs: ['质价比', '成分党', '平替消费', '品牌忠诚迁移'],
    sampleTarget: '日化、食品与服装高频理性消费者',
  },
  {
    id: 22,
    theme: '情绪 · 圈层与 IP 消费',
    categoryTag: '主理人经济',
    title: '小而美为什么有人买单？主理人品牌的信任建构机制',
    methodDesign: '独立小店 vs 连锁品牌配对对照研究（人格化叙事、专业感与社群黏性）',
    coreConstructs: ['主理人品牌', '人格化叙事', '品牌信任', '独立商业'],
    sampleTarget: '独立咖啡烘焙及文创街区消费者',
  },

  // 三、文旅 · 城市与赛事经济（10 个）
  {
    id: 23,
    theme: '文旅 · 城市与赛事经济',
    categoryTag: '赛事经济',
    title: '为一场赛事赴一座城：赛事流量向消费“留量”的转化路径',
    methodDesign: '外地观众住/餐/行/游/购完整消费链条追踪与城市消费拉动乘数测算',
    coreConstructs: ['赛事经济', '票根拉动', '跨城观众', '消费留量'],
    sampleTarget: '马拉松、大型球赛或电竞赛事外地观赛人群',
  },
  {
    id: 24,
    theme: '文旅 · 城市与赛事经济',
    categoryTag: '票根经济',
    title: '一张票根能带动多少消费？演出与赛事的消费外溢效应',
    methodDesign: '连带消费结构计量 + “票根—场景—消费”结构方程外溢路径模型',
    coreConstructs: ['票根经济', '消费外溢', '连带消费', '文旅协同'],
    sampleTarget: '演唱会与体育赛事持票入场观众',
  },
  {
    id: 25,
    theme: '文旅 · 城市与赛事经济',
    categoryTag: '演出经济',
    title: '跟着演唱会去旅行：跨城观众的消费决策与城市复游',
    methodDesign: '本地 vs 跨城观众双群对照（停留时长、消费构成与城市重游意愿差异）',
    coreConstructs: ['跨城观演', '停留时长', '消费结构', '重游意愿'],
    sampleTarget: '大型巡回演唱会现场散场及周边商圈观众',
  },
  {
    id: 26,
    theme: '文旅 · 城市与赛事经济',
    categoryTag: '影视文旅',
    title: '为一部剧赴一座城：影视与微短剧取景地对出游决策的影响',
    methodDesign: '短视频平台传播二手数据 + 游客问卷一手数据混合路径建模',
    coreConstructs: ['微短剧文旅', '取景地种草', '出游意向', '混合数据'],
    sampleTarget: '热播影视剧/微短剧取景地访客及潜在游客',
  },
  {
    id: 27,
    theme: '文旅 · 城市与赛事经济',
    categoryTag: '沉浸文旅',
    title: 'NPC 为什么让人愿意排队互动？景区角色互动对沉浸体验与二次消费的影响',
    methodDesign: '互动质量→心流沉浸感→园内二次消费链路检验（SEM+Bootstrap）',
    coreConstructs: ['景区NPC', '沉浸体验', '二次消费', '角色互动'],
    sampleTarget: '沉浸式主题乐园与夜游街区现场游客',
  },
  {
    id: 28,
    theme: '文旅 · 城市与赛事经济',
    categoryTag: '城市微旅行',
    title: 'Citywalk 为什么火？城市微度假中的体验价值与消费路径',
    methodDesign: '路线消费节点空间记录（咖啡/文创/拍照点/零售）+ 体验价值回归',
    coreConstructs: ['Citywalk', '微度假', '边逛边买', '空间路径'],
    sampleTarget: '城市特色历史文化街区漫步人群',
  },
  {
    id: 29,
    theme: '文旅 · 城市与赛事经济',
    categoryTag: '反向旅游',
    title: '不去热门城市：青年小城出游的决策机制',
    methodDesign: '推拉理论模型（拥挤厌恶、原真性追求、预算敏感、社媒种草与情绪回报）',
    coreConstructs: ['反向旅游', '县域小城', '拥挤厌恶', '原真性'],
    sampleTarget: '选择冷门宝藏小城出游的青年旅客',
  },
  {
    id: 30,
    theme: '文旅 · 城市与赛事经济',
    categoryTag: '非遗消费',
    title: '从看到买：Z 世代非遗体验消费与品牌年轻化',
    methodDesign: '体验转化实证路径（区分“文化认同”与“实际买单文创衍生/餐饮/服饰”落差）',
    coreConstructs: ['非遗传承', 'Z世代', '体验消费', '购买转化'],
    sampleTarget: '非遗市集、文创工坊与老字号年轻客群',
  },
  {
    id: 31,
    theme: '文旅 · 城市与赛事经济',
    categoryTag: '国潮消费',
    title: '国风元素越多越好吗？文化符号强度对购买意愿的影响',
    methodDesign: '三组刺激材料实验（轻国风 / 中国风 / 强国风）检验审美评价与购买意愿倒 U 型关系',
    coreConstructs: ['国潮符号', '文化强度', '倒U型效应', '美学审美'],
    sampleTarget: '国潮服饰、茶饮包装与文创消费者',
  },
  {
    id: 32,
    theme: '文旅 · 城市与赛事经济',
    categoryTag: '户外经济',
    title: '“轻户外”为什么留住年轻人？城市青年户外消费的场景化需求',
    methodDesign: '参与动机—装备支出—社交需求关联建模（覆盖徒步、骑行、露营、桨板、飞盘）',
    coreConstructs: ['轻户外', '露营骑行', '社交属性', '装备消费'],
    sampleTarget: '城市近郊轻户外运动社群成员',
  },

  // 四、银发 · 健康与宠物消费（9 个）
  {
    id: 33,
    theme: '银发 · 健康与宠物消费',
    categoryTag: '银发经济',
    title: '别把老年人当成一类人：新银发群体的需求分层与机会识别',
    methodDesign: '多维聚类画像（健康状态、数字技能、收入水平、社交活跃度、生活方式五维分群）',
    coreConstructs: ['新银发群体', '需求分层', '多维聚类', '未被满足需求'],
    sampleTarget: '55–75 岁城市及社区活力长者与高龄老人',
  },
  {
    id: 34,
    theme: '银发 · 健康与宠物消费',
    categoryTag: '银发经济',
    title: '买的人和用的人不是同一个：银发产品的代际决策机制',
    methodDesign: '父母（使用者）与子女（购买者）双样本配对施测 + 属性偏好及决策权差异检验',
    coreConstructs: ['代际决策', '购买使用分离', '银发产品', '适老化'],
    sampleTarget: '有养老产品购置经历的中老年父母及其成年子女配对样本',
  },
  {
    id: 35,
    theme: '银发 · 健康与宠物消费',
    categoryTag: '银发经济',
    title: '为什么老人总觉得“太复杂”？适老化智能产品的使用障碍',
    methodDesign: '操作门槛、学习成本与信任顾虑 IPA-障碍优先级矩阵（智能手表/音箱/扫地机/中控）',
    coreConstructs: ['适老化改造', '智能家居', '操作门槛', '数字鸿沟'],
    sampleTarget: '居家使用或弃用智能硬件的老年居民',
  },
  {
    id: 36,
    theme: '银发 · 健康与宠物消费',
    categoryTag: '银发文旅',
    title: '从“养老”到“享老”：新银发群体康养旅游需求与产品设计',
    methodDesign: '慢游/康养/旅居偏好 Conjoint 属性权衡 + 服务痛点文本挖掘',
    coreConstructs: ['康养旅游', '享老生活', '旅居产品', '出行痛点'],
    sampleTarget: '有出行能力和康养意愿的低龄银发族群',
  },
  {
    id: 37,
    theme: '银发 · 健康与宠物消费',
    categoryTag: '健康消费',
    title: '“预防式养生”：健康焦虑如何变成实际消费',
    methodDesign: '健康焦虑→控制感补偿→非医疗健康消费（运动/睡眠/低糖/体检/可穿戴）传导机制',
    coreConstructs: ['预防式养生', '健康焦虑', '低糖轻食', '健康消费'],
    sampleTarget: '22–45 岁关注亚健康调理的城市白领与青年',
  },
  {
    id: 38,
    theme: '银发 · 健康与宠物消费',
    categoryTag: '健康消费',
    title: '配料表成了“第二价签”？食品成分透明度对购买决策的影响',
    methodDesign: '配料表详略与清洁营养标签组间实验（比较透明度对品牌信任与选择的直接效应）',
    coreConstructs: ['清洁标签', '成分透明度', '信任建立', '食品选择'],
    sampleTarget: '商超及即时零售包装食品与饮品购买者',
  },
  {
    id: 39,
    theme: '银发 · 健康与宠物消费',
    categoryTag: '宠物经济',
    title: '“它不是宠物，是家人”：宠物拟人化如何改写消费决策',
    methodDesign: '拟人化倾向对宠粮/保险/医疗/智能用品溢价支付及品牌忠诚的回归预测',
    coreConstructs: ['宠物拟人化', '溢价支付', '科学养宠', '品牌忠诚'],
    sampleTarget: '养宠家庭与年轻单身“铲屎官”',
  },
  {
    id: 40,
    theme: '银发 · 健康与宠物消费',
    categoryTag: '宠物经济',
    title: '为它买，还是为自己买？宠物消费中的“悦己悖论”',
    methodDesign: '自我表达/社交展示/情感补偿三重中介模型（区分功能养育与主人情感自我满足）',
    coreConstructs: ['悦己悖论', '情感补偿', '社交展示', '宠物经济'],
    sampleTarget: '重度宠物消费与宠物服饰/摄影用户',
  },
  {
    id: 41,
    theme: '银发 · 健康与宠物消费',
    categoryTag: '宠物经济',
    title: '智能养宠能替代人工陪伴吗？宠物智能硬件购买意愿',
    methodDesign: 'UTAUT+陪伴愧疚感缓解分析（自动喂食器、智能猫砂盆、陪伴摄像头、定位器）',
    coreConstructs: ['智能养宠', '宠物硬件', '陪伴替代', '场景痛点'],
    sampleTarget: '工作日长时间离家的城市上班族养宠群体',
  },

  // 五、渠道 · 零售 · 校园与可持续消费（9 个）
  {
    id: 42,
    theme: '渠道 · 零售 · 校园与可持续消费',
    categoryTag: '即时零售',
    title: '30 分钟到家改变了什么？即时零售对大学生计划性与冲动性消费的影响',
    methodDesign: '多品类对比研究（奶茶/药品/日用品/数码/美妆/生鲜）+ 计划vs冲动下单触发因素分析',
    coreConstructs: ['即时零售', '冲动消费', '计划购买', '分钟级履约'],
    sampleTarget: '高校集中区即时配送外卖/闪购用户',
  },
  {
    id: 43,
    theme: '渠道 · 零售 · 校园与可持续消费',
    categoryTag: '即时零售',
    title: '补贴退去之后谁会留下？即时零售用户留存与平台迁移机制',
    methodDesign: '推-拉-锚定（PPM）迁移模型（价格、时效、品类丰富度与使用惯性贡献度量化）',
    coreConstructs: ['用户留存', '平台迁移', '推拉锚定', '即时配送'],
    sampleTarget: '使用过两家以上即时零售平台的双栖/单栖用户',
  },
  {
    id: 44,
    theme: '渠道 · 零售 · 校园与可持续消费',
    categoryTag: '即时零售',
    title: '“快”到底值多少钱？配送时效对支付溢价的影响',
    methodDesign: 'Conjoint 联合分析正交设计（15/30/60 分钟 × 配送费 × 品牌 × 售后），计算时效货币估值',
    coreConstructs: ['配送时效', '支付溢价', '联合分析', '边际效用'],
    sampleTarget: '高频点外卖与生鲜即时买单消费者',
  },
  {
    id: 45,
    theme: '渠道 · 零售 · 校园与可持续消费',
    categoryTag: '消费心理',
    title: '满减真的省钱吗？复杂优惠规则下的价格感知与购买行为',
    methodDesign: '4 组实验对比（直降 vs 满减 vs 优惠券 vs 会员价），测度规则复杂度对价格公平感的影响',
    coreConstructs: ['复杂优惠', '价格公平感', '决策信心', '促销疲劳'],
    sampleTarget: '大促期间活跃的电商购物群体',
  },
  {
    id: 46,
    theme: '渠道 · 零售 · 校园与可持续消费',
    categoryTag: '订阅经济',
    title: '会员越来越多，为什么不想续了？数字会员疲劳的形成机制',
    methodDesign: '跨平台框架实证（视频/音乐/网盘/AI/外卖/电商）验证“会员疲劳→感知价值下降→不续费”链条',
    coreConstructs: ['数字会员疲劳', '感知价值', '续费意愿', '订阅过载'],
    sampleTarget: '同时持有 3 个及以上数字订阅会员的青年群体',
  },
  {
    id: 47,
    theme: '渠道 · 零售 · 校园与可持续消费',
    categoryTag: '二手消费',
    title: '不是买不起新品：青年二手消费的价值观转向与平台信任',
    methodDesign: '多品类二手循环动机验证（数码/服饰/图书/奢侈品/谷子）与平台验真信任机理',
    coreConstructs: ['二手循环', '质价比转向', '平台信任', '可持续消费'],
    sampleTarget: '闲置交易平台活跃的青年买卖双方',
  },
  {
    id: 48,
    theme: '渠道 · 零售 · 校园与可持续消费',
    categoryTag: '校园经济',
    title: '校园闲置交易为什么难做？平台痛点与可行的运营模式',
    methodDesign: '校内抽样痛点诊断（信任/定价/面交成本）+ 可落地校园循环方案与经济闭环设计',
    coreConstructs: ['校园闲置', '运营模式', '信任机制', '调研+方案'],
    sampleTarget: '目标高校不同年级在校住宿学生',
  },
  {
    id: 49,
    theme: '渠道 · 零售 · 校园与可持续消费',
    categoryTag: '绿色消费',
    title: '嘴上环保、买时看价：绿色消费态度与行为的落差',
    methodDesign: '碳标签/绿色价差实验处理（解释“高环保态度—低绿色溢价支付”的态度行为缺口）',
    coreConstructs: ['态度行为缺口', '碳标签', '绿色溢价', '环保消费'],
    sampleTarget: '日常日用品与包装饮料消费者',
  },
  {
    id: 50,
    theme: '渠道 · 零售 · 校园与可持续消费',
    categoryTag: '校园消费',
    title: '大学生的一天能被还原吗？基于消费场景链的生活方式分群与商业生态',
    methodDesign: '一天生活场景链日志（餐/学/动/社/购）+ 序列分析与生活方式 K-means 聚类',
    coreConstructs: ['场景链', '生活方式分群', '校园商业生态', '时间序列消费'],
    sampleTarget: '大学城商圈及各年级在校学生',
  },
];

/* ───────── 3. 第十七届官方赛程、名额晋级计算器与评分/排版规范 ───────── */

export type CompetitionTrackGroup = '专科组' | '本科组' | '研究生组' | '在华留学生组';

export function calculateProvincialQuota(
  group: CompetitionTrackGroup,
  passedOrPaidCount: number,
): { quota: number; rule: string } {
  const n = Math.max(0, Math.floor(Number.isFinite(passedOrPaidCount) ? passedOrPaidCount : 0));
  if (group === '在华留学生组') {
    return {
      quota: 3,
      rule: '在华留学生组不设省赛与企业命题赛，各校直接选拔优秀团队进全国初赛，每校最多选拔 3 支（校赛须于 2027-03-30 前完成）。',
    };
  }
  if (group === '专科组') {
    const raw = Math.round(n / 10);
    return {
      quota: Math.min(15, raw),
      rule: '专科组：网考通过人数 ÷ 10（四舍五入），每所参赛校省赛上限 15 支（不含省赛承办校 2 支直晋名额）。',
    };
  }
  if (group === '研究生组') {
    const raw = n <= 200 ? Math.round(n / 10) : Math.round((n - 200) / 20 + 15);
    return {
      quota: Math.min(20, raw),
      rule: '研究生组：网上报名且缴费人数 ≤200 按 ÷10 四舍五入（上限 15）；>200 按 (N-200)/20+15 四舍五入（每校封顶 20 支，不含承办校 2 支）。',
    };
  }
  // 本科组
  const raw = n <= 300 ? Math.round(n / 20) : Math.round((n - 300) / 30 + 15);
  return {
    quota: Math.min(30, raw),
    rule: '本科组：网考通过人数 ≤300 按 ÷20 四舍五入（上限 15）；>300 按 (N-300)/30+15 四舍五入（每校封顶 30 支，不含承办校 2 支）。',
  };
}

export const EDITION_17_OFFICIAL_GUIDE = {
  noticeId: '中商统〔2026〕33号',
  signedDate: '2026-09-20',
  teamPolicy: {
    teamSize: '3–5 名学生（鼓励跨专业跨院系，须同一高校）',
    advisorCap: '每位指导教师最多指导 5 个团队；每名学生只能参加 1 个团队',
    intlRequirement: '在华留学生组：3 人团队至少 2 名留学生，4–5 人团队至少 3 名留学生；中文报告/PPT，中文或中英双语答辩',
    knowledgeTestRule: '专科/本科组须个人网考 60 分及以上且在全校参考前 70% 核定线内，95 分+可获官方荣誉榜单与免费证书',
  },
  milestones: [
    { stage: '参赛报名截止', window: '即日起至 2026-10-31（研究生/留学生可延至 2026-11-15）' },
    { stage: '个人知识赛网考', window: '2026-11-01 至 2026-11-20（模拟考 10-20~11-10，可考 1–2 次取最高）' },
    { stage: '实践赛与企业命题公布', window: '2026-11-17 发文（11-18 至 11-30 命题解读）' },
    { stage: '校级选拔赛', window: '2027-03-22 前完成（留学生组 03-30 前）' },
    { stage: '企业命题专项赛', window: '2027-03 月底提交报告，04-10 前完成全国专家与命题企业联合评审' },
    { stage: '省区赛截止', window: '专科 04-12 · 研究生 04-20 · 本科 04-30' },
    { stage: '全国总决赛（初赛）', window: '专科/留学生 04-20 · 研究生 04-30 · 本科 05-14（报告+PPT评审）' },
    { stage: '全国总决赛（现场答辩）', window: '专科：江苏经贸职业技术学院（05-08~09）· 研&留学：上海工程技术大学（05-15~16）· 本科：上海财经大学（05-29~30）' },
    { stage: '亚太地区总决赛', window: '2027年8月下旬（泰国，专科第1名 & 本科前6名晋级）' },
  ],
  reportScoringWeights: [
    { id: 'topic', item: '一、研究选题', points: 10, subitems: '选题新颖 5 分 + 结合实际 5 分' },
    { id: 'literature', item: '二、文献研究', points: 7, subitems: '理论/文献综述 4 分 + 研究思路与方法 3 分' },
    { id: 'design', item: '三、方案设计', points: 28, subitems: '调查方案设计 10 分 + 样本代表性 9 分 + 问卷/技术设计 9 分（权重最大）' },
    { id: 'fieldwork', item: '四、调查实施', points: 20, subitems: '调查组织科学 5 分 + 执行完整 3 分 + 数据处理严谨 5 分 + 质量控制严格 7 分' },
    { id: 'analysis', item: '五、分析与结论', points: 20, subitems: '选择方法正确 7 分 + 数据运用充分 5 分 + 分析支持结论 5 分 + 结论实用适用 3 分' },
    { id: 'text', item: '六、报告文本', points: 15, subitems: '完整充分 7 分 + 观点表述清晰 5 分 + 格式规范 3 分' },
  ],
  defenseScoringWeights: [
    { id: 'slides', item: '展示文件水平（PPT/多媒体）', points: 15, ratioHint: '最终总分 = 60% 书面报告 + 40% 现场答辩' },
    { id: 'presentation', item: '现场陈述（逻辑+简炼+口齿）', points: 45, ratioHint: '逻辑性强 15 + 语言简炼 15 + 口齿清楚 15' },
    { id: 'qa', item: '评委问答（正确+清晰+仪态）', points: 40, ratioHint: '回答正确 15 + 思路清晰 15 + 仪态大方 10' },
  ],
  formattingRedlines: [
    '正文总字数严控 1 万至 2 万字；提交 Word (.docx/.doc) 文档按 A4 版式排版。',
    '严格匿名红线：正文中绝对禁止直接出现参赛学校名称、院系及指导教师姓名，以防被评委扣分。',
    '页面边距与字号：上下 2.54cm、左右 3.18cm；总标题宋体三号加粗，一级黑体小三，二级黑体四号，正文与摘要宋体小四（1.25 倍行距、段前 0.5 行）。',
    '层次与图表规则：层次序号依次为“一、；（一）；1.；（1）；1）”；图序图题置于图下方居中，表序表题置于表上方居中，序号与标题间空两格。',
    '公式与引文规范：公式编号加圆括号右对齐不加虚线；参考文献须按 GB/T 7714 专著/期刊/报纸格式连续编号。',
  ],
  classicJudgeQaFromWinners: [
    {
      id: 'winner-qa-pps',
      label: '国奖追问 #1 · 抽样框与 PPS 规模指标依据',
      question: '你们为何选取该市/这些街道作为调查点，如果用了 PPS 抽样，各阶段衡量“规模”的指标是什么？',
      answerBlueprint:
        '（1）地域选取须交代研究场景代表性与团队实地访员人力/交通可行性边界；（2）多阶段 PPS 不等概抽样须明确给出每层 PSU/SSU 的规模代理变量（如常住目标群体人口数、街道户数或门店核定客流）及比例分配算式，不可以用“方便拦截”冒充概率抽样。',
    },
    {
      id: 'winner-qa-pilot',
      label: '国奖追问 #2 · 预调查发现与问卷实质性修订记录',
      question: '正式发放前做过预调查吗？预调查样本发现了哪些问题、具体修改了哪几道题或抽样分布？',
      answerBlueprint:
        '现场应能报出预调查实际回收数、无效剔除数与关键年龄/群体分布偏差（例如网调发现样本过度集中于青年段而通过线下分层补抽平衡），并展示修改前后的题项对照与 Cronbach α / KMO 复核记录。',
    },
    {
      id: 'winner-qa-diff',
      label: '国奖追问 #3 · 未参与人群对照与异质性模型价值',
      question: '调查结论除了描述满意度均值，是否把已使用者和未使用者/不同特征群体做过严谨对比？',
      answerBlueprint:
        '采用二元/多元 Logit 或多群组交叉分析对比两类人群在年龄、月收入、认知度与支持度上的显著差异；既说明现有用户在乎什么改进项（IPA），也量化未转化群体面临的最大阻碍因子。',
    },
    {
      id: 'winner-qa-action',
      label: '国奖追问 #4 · 对策落地责任主体与非空泛建议边界',
      question: '你们对政府或企业提的建议是不是太泛泛而谈？可操作性和实施优先级在哪里？',
      answerBlueprint:
        '拒绝纯口号式呼吁！每条建议必须绑定唯一责任主体（企业品类部/运营中心、街道/医院管理方等）、对应调研核心阻碍数据依据与分期试点验证指标（从行业水准、产品形态、宣传触点与服务质量四维压缩为可执行方案）。',
    },
  ],
} as const;

/* ───────── 4. 17 类经典调查问卷模板库（源自 17 种类别调查问卷案例及参考资料） ───────── */

export type SurveyCategoryTemplate = {
  id: string;
  category: string;
  referenceSampleName: string;
  title: string;
  population: string;
  groupQuestion: string;
  groupChoices: string[];
  dimensions: string[];
  designPitfall: string;
};

export const SURVEY_17_CATEGORY_TEMPLATES: readonly SurveyCategoryTemplate[] = [
  {
    id: 'cat-cp-fresh',
    category: '1. 客户满意度（正大优鲜/零售标杆）',
    referenceSampleName: '《正大优鲜满意度洞察问卷.docx》',
    title: '连锁品牌与社区零售门店消费者满意度及复购洞察问卷',
    population: '近三个月有过门店到店或线上购物的常住消费者',
    groupQuestion: '您近三个月主要通过哪种渠道购买该品牌商品？',
    groupChoices: ['仅线下门店自提/选购', '线上小程序/平台配送', '线上线下均高频购买'],
    dimensions: ['商品新鲜度与品质稳定度', '货品价格性价比与促销力度', '门店陈列与动线便捷度', '店员服务与售后服务响应', '整体品牌信任与推荐意愿'],
    designPitfall: '客户满意度问卷务必前置甄别题（地区 + 近3月实际体验），避免未到店样本拉低评价效度。',
  },
  {
    id: 'cat-market-stall',
    category: '2. 市场调研（消费与新业态）',
    referenceSampleName: '《成都市新型地摊经济的特征及影响因素探究.docx》',
    title: '新消费场景（市集/新零售/饮品）消费特征与市场需求调查问卷',
    population: '目标城区具备自主消费能力的青年及居民受访者',
    groupQuestion: '您在典型月份参与此类特色消费活动的频率是？',
    groupChoices: ['每周 1 次及以上高频', '每月 1–3 次', '较少参与（每季度1次及以下）'],
    dimensions: ['商品性价比与独特性', '现场氛围与社交体验感', '食品安全与质量规范保障', '区位交通与支付便利度', '二次到访及口碑传播意愿'],
    designPitfall: '注意区分管理方、经营业主与消费者三端问卷，勿将经营侧痛点题目混入C端问卷。',
  },
  {
    id: 'cat-community-groupbuy',
    category: '3. 社区团购与即时零售',
    referenceSampleName: '《社区团购消费现状与发展前景的调研问卷.docx》',
    title: '社区团购与分钟级即时零售使用意愿及平台留存调查问卷',
    population: '所在社区有家庭日常采买决策权的常住居民',
    groupQuestion: '您平时购买生鲜日用品时是否使用社区团购或即时配送？',
    groupChoices: ['每周稳定下单 3 次以上', '偶尔拼团（大促/特价时）', '使用过但现已流失退坑'],
    dimensions: ['生鲜与标品源头品控', '次日/30分钟履约准时度', '团长/骑手售后退换便利', '补贴退去后的日常定价竞争力', '平台持续留存与迁移倾向'],
    designPitfall: '问卷卷首要对「社区团购/团长」等行业术语作简明脚注界定，避免不同代际受访者理解偏差。',
  },
  {
    id: 'cat-cultural-tourism',
    category: '4. 传统文化与非遗文旅',
    referenceSampleName: '《文旅产业发展认知现状及发展趋势的调查问卷.docx》',
    title: '非遗活态传承、古村落文旅体验及文创购买转化研究问卷',
    population: '历史文化街区/非遗工坊在访游客及潜在青年客群',
    groupQuestion: '您本次了解或体验该传统文化项目的核心途径是？',
    groupChoices: ['实地深度手作/景区体验', '短视频/国潮社交平台种草', '仅听闻过尚未深入接触'],
    dimensions: ['非遗文化原真性与故事魅力', '互动体验设计（NPC/研学）趣味度', '衍生文创实用性与审美设计', '景区交通导览与商业配套水平', '文创买单溢价与重游推荐意愿'],
    designPitfall: '严禁只放“文化认同量表”，务必配套体验满意度、价格感知与实际文创购买转化问项。',
  },
  {
    id: 'cat-campus-student',
    category: '5. 校园学生与青年消费',
    referenceSampleName: '《广州市大学生群体虚拟偶像消费需求偏好调查问卷.docx》',
    title: '在校大学生数字消费、校园商业生态及学习行为调查问卷',
    population: '驻地高校全日制本科生与硕士研究生',
    groupQuestion: '您当前的在读学段与月均生活费区间主要位于？',
    groupChoices: ['低年级本科（1500元及以下）', '高年级本科（1501-2500元）', '硕博研究生（2500元以上）'],
    dimensions: ['校园场景适配度与便捷度', '价格补贴与同学口碑影响', '情绪共鸣与圈层社交属性', '时间占用与学业规范平衡', '向同校同学推荐的传播意愿'],
    designPitfall: '校园抽样切忌全靠单一学院/寝室楼滚雪球，应按年级与理工/文科专业配额分层发放。',
  },
  {
    id: 'cat-health-wellness',
    category: '6. 健身保健与轻食营养',
    referenceSampleName: '《关于消费者需求的保健品问卷调查.docx》《健康休闲食品市场调查研究.docx》',
    title: '预防式养生、低糖轻食及保健食品购买动机与渠道偏好问卷',
    population: '关注亚健康管理、体重控制及营养补给的城市消费者',
    groupQuestion: '您在日常饮食或保健调理中最为核心的诉求类型是？',
    groupChoices: ['减脂控糖与轻食代餐', '改善睡眠/缓解疲劳调理', '孝敬长辈与家庭常备滋补'],
    dimensions: ['配料表清洁度与成分透明可信', '口感风味与饱腹满足感', '专业权威认证与功效背书', '单位份量性价比与购买便利性', '长期复购与跨品类尝鲜意愿'],
    designPitfall: '保健品与轻食须区分“自己用（悦己健康）”与“给长辈买（代际礼赠）”两条决策链。',
  },
  {
    id: 'cat-social-life',
    category: '7. 社会生活与城市服务',
    referenceSampleName: '《“1+N”模式社区居民的意愿度调查问卷.docx》《末端物流满意度分析.docx》',
    title: '城市社区便民服务（快递驿站/适老食堂/公厕/出行）感知评价问卷',
    population: '城区及城乡结合部各年龄段常住居民',
    groupQuestion: '您的年龄段与日常社区公共服务使用频率是？',
    groupChoices: ['中青年高频上班族', '居家带娃或兼顾家务居民', '60岁及以上常住银发居民'],
    dimensions: ['设施空间步行可达与开放时段', '现场环境卫生与无障碍安全', '服务收费透明与价格合理度', '工作人员态度与诉求响应速度', '对试点推广模式的整体支持度'],
    designPitfall: '涉及中老年群体须提供纸质大字版+访员入户读题对照字段，不可只放手机扫码答卷。',
  },
  {
    id: 'cat-eco-carbon',
    category: '8. 生态环境与双碳治理',
    referenceSampleName: '《环境污染调查问卷及总结.docx》《瑞安原生钛室内污染调查问卷.doc》',
    title: '“无废城市”、绿色包装与居民低碳消费行为落差（态度-行为）问卷',
    population: '具备独立日常生活采购行为的城市社区居民',
    groupQuestion: '您在选购日用品或外卖时，查看环保/减碳标识的习惯是？',
    groupChoices: ['主动关注并愿付适度溢价', '关注但优先比较价格与折扣', '极少关注环保标签仅看性价比'],
    dimensions: ['生态环境风险与污染感知度', '绿色认证与碳标签清晰可信度', '绿色产品溢价经济可承受度', '社区回收设施与分类便利度', '践行长期低碳生活方式的意愿'],
    designPitfall: '环保问卷易受社会期许偏差（Social Desirability）影响，须加入预算约束情境题纠正虚高口号。',
  },
  {
    id: 'cat-mental-health',
    category: '9. 心理健康与代际关系',
    referenceSampleName: '《广州市“隐形爸爸”现状成因调查.docx》《BECK抑郁自评问卷.doc》',
    title: '青年情绪压力、亲子教育陪伴及数字社交心理调适现状问卷',
    population: '在读大中学生、青年职场人或义务教育阶段学生家长',
    groupQuestion: '近期您在学业/职场或家庭关系中感受到的压力主要来源是？',
    groupChoices: ['学业升学与就业求职竞争', '家庭育儿陪伴与代际沟通摩擦', '工作节奏过快与社交孤独感'],
    dimensions: ['情绪压力负荷自我感知强度', '家庭成员/伴侣有效情感支持', '同辈社群倾诉与减压渠道可及性', '专业心理援助服务知晓与去污名化', '整体生活掌控感与主观幸福感'],
    designPitfall: '涉及未成年人或心理敏感筛查时，卷首必须声明严格匿名且不构成临床医学诊断，避免诱发不适。',
  },
  {
    id: 'cat-personality-test',
    category: '10. 性格偏好与消费人格测评',
    referenceSampleName: '《三维人格问卷(TPQ).doc》《应对方式问卷.doc》',
    title: '消费心理人格特质（理性型/探索型/冲动型）与品牌偏好映射问卷',
    population: '18–45 岁高频消费人群',
    groupQuestion: '面对一款从未见过的新奇联名或网红新品时，您的第一反应更接近？',
    groupChoices: ['抢先尝鲜下单，乐于社交晒单', '先看评测与成分对比，再审慎决定', '等待降价或仅维持熟悉旧品牌'],
    dimensions: ['新事物寻求度与审美好奇倾向', '价格敏感度与促销规则计算意愿', '社交从众影响与圈层认同需求', '面对风险与不确定的回避倾向', '对高情感附着品牌的长期忠诚度'],
    designPitfall: '性格测评题干易出现反向计分项（reverse item），编码统计前须先核对正向/反向转化校准。',
  },
  {
    id: 'cat-hr-career',
    category: '11. 人力资源与青年就业认同',
    referenceSampleName: '《江西移动企业文化调查问卷.doc》《大学生新蓝领职业认同研究》',
    title: '新业态从业者/大学生新蓝领就业动机、职业认同与薪酬满意度问卷',
    population: '应届高校毕业生、在职青年职工或平台灵活就业者',
    groupQuestion: '您目前所处的就业形态或求职偏好属于？',
    groupChoices: ['传统企事业单位全职岗位', '新兴数字/现代服务业技能岗', '灵活自由职业及创业探索期'],
    dimensions: ['薪酬回报与社保保障公平感知', '岗位工作负荷与生活平衡度', '职业技能成长通道与培训支撑', '社会评价认知与组织文化归属感', '留任现状与行业持续从业意愿'],
    designPitfall: '涉及企业内部员工满意度时须说明独立第三方匿名回收，消除“担心被上级溯源”引发的虚高评分。',
  },
  {
    id: 'cat-public-opinion',
    category: '12. 个人看法与社会热点态度',
    referenceSampleName: '《关于居民社会安全感的调查问卷.doc》《关于食品浪费的调查问卷.doc》',
    title: '公共政策（反浪费/AI监管/食安治理）公众认知与合规意愿问卷',
    population: '年满 18 周岁的城市与县域常住居民',
    groupQuestion: '您日常了解该类公共议题与政策动态的主要信息渠道是？',
    groupChoices: ['权威官媒与政务发布平台', '短视频与社交热搜信息流', '社区宣传及亲友邻里口碑'],
    dimensions: ['核心政策细则知晓度与理解深度', '身处日常生活场景的获益切身感受', '现有监管执行力度与公正性信任', '个人主动参与配合的便利与成本门槛', '对后续政策优化方向的优先期望'],
    designPitfall: '个人看法类题目不可出现引导性/偏向性设问（如“您难道不认为应该加强管理吗”），选项正负须对称平衡。',
  },
  {
    id: 'cat-epidemic-health',
    category: '13. 公共卫生与医疗服务评价',
    referenceSampleName: '《新冠疫苗接种意愿调查问卷.docx》《25国一西安无陪护病房问卷范式》',
    title: '医院便民试点（无陪护病房/分级诊疗/疫苗预防）患者满意度问卷',
    population: '近一年内有过医疗机构就诊、陪护经历的居民及家属',
    groupQuestion: '您及家人在本次调研关联的就医服务中主要扮演的角色是？',
    groupChoices: ['住院患者本人直接体验', '患者家属（负责缴费与陪护决策）', '了解试点政策但尚未实际使用'],
    dimensions: ['专业护理/医务人员响应及时性', '收费标准透明与医保报销分担水平', '病区隐私保护与探视沟通便利度', '标准化操作流程与安全信任度', '推荐及未来优先选择该医疗模式的意愿'],
    designPitfall: '医疗与卫生调查必须避免医疗处方式推断，聚焦服务体验、价格透明度与家庭陪护减负效应。',
  },
  {
    id: 'cat-social-status',
    category: '14. 社会现状与智慧银发养老',
    referenceSampleName: '《沈阳市智慧护理养老产品的应用调查.docx》《家长教育成本压力调查问卷.docx》',
    title: '居家养老助餐、适老智能照护与家庭代际照护压力评估问卷',
    population: '60 岁以上老年人及其负责选购适老产品的成年子女',
    groupQuestion: '本份问卷的填写视角及对养老/智能产品的决策角色是？',
    groupChoices: ['长者本人填答（实际使用者）', '子女代为选择/购买的家庭决策者', '养老驿站及社区服务站基层照护员'],
    dimensions: ['硬件操作界面简洁与防误触体验', '健康异常预警与紧急求助响应信任', '补贴政策落地与月度自付经济压力', '邻里社交慰藉与上门照护服务温度', '家庭对社区医养结合方案的整体接纳度'],
    designPitfall: '银发调查经典陷阱为“买的人≠用的人”，设计两套对称题组比较代际需求剪刀差可成高分亮点。',
  },
  {
    id: 'cat-ai-product',
    category: '15. AI 消费与生成式智能工具（2027 新兴专项）',
    referenceSampleName: '《2025国一 AI客服调查》《2027热点 #1-#8 生成式AI付费测算》',
    title: '生成式 AI 付费意愿（WTP）、算法推荐信任与 AI 客服体验评估问卷',
    population: '使用过 AI 对话工具、智能客服或 AIGC 会员产品的消费者',
    groupQuestion: '您在过去三个月使用生成式 AI / 智能助手的最高频场景属于？',
    groupChoices: ['学业科研检索与文档写作润色', '消费维权与电商平台智能客服咨询', '情感陪伴聊天与创意图像内容生成'],
    dimensions: ['回答准确性与复杂问题理解深度', '人工转接门槛与问题一次解决率', '数据隐私保护与“AI生成披露”透明度', '订阅会员定价与单次购买价格公平感', '持续使用、复购续费与口碑推荐意愿'],
    designPitfall: '测算 AI 付费意愿切勿空问“愿不愿意付钱”，需拆解功能组合并用 PSM/Conjoint 定价锚定真实价格敏感点。',
  },
  {
    id: 'cat-survey-methodology',
    category: '16. 问卷设计质量自查（17类方法总纲）',
    referenceSampleName: '《网上调查问卷设计技巧和注意事项.doc》《调查问卷的要求.doc》',
    title: '通用科研问卷规范化模板（含分组配额 + 李克特五维 + 双质控校验）',
    population: '多阶段分层抽样涵盖的目标调研全体合格受访者',
    groupQuestion: '请问您当前所属的核心分层配额特征组别是？',
    groupChoices: ['核心高频目标人群（配额 A 组）', '一般活跃普通人群（配额 B 组）', '尚未转化潜在群体（对照组）'],
    dimensions: ['核心功能表现与实用价值评价', '流程便捷性、时效与交互体验', '价格透明度与权益规则公平感', '安全隐私保障与信任感支撑', '总体满意度与未来持续意愿'],
    designPitfall: '严格执行：（1）卷首隐私匿名承诺与作答时间提示；（2）严禁使用诱导性/双重否定问句；（3）必插注意力甄别题与作答时长下限质控。',
  },
  {
    id: 'cat-other-digital',
    category: '17. 中小微商业与数字化转型（其他综合）',
    referenceSampleName: '《杭州小店数字化转型调查问卷.docx》《云“播”见乡农直播电商研究》',
    title: '县域特产/小店数字化营销、直播带货信任与品牌溢价机制问卷',
    population: '线上直播间观众、地域特色农产品购买者及小店高频客户',
    groupQuestion: '您通常购买此类区域特色好物或支持独立小店的原因主要是？',
    groupChoices: ['直播/短视频内容种草性价比高', '信任主理人或源头产地的真实品质', '打卡城市风物或为家乡助农情怀买单'],
    dimensions: ['直播/店铺介绍与实物一致可信度', '地域风物文化故事吸引力与包装审美', '物流冷链时效与破损赔付效率', '复购折扣与老客社群会员权益', '作为伴手礼向亲友转发推荐意愿'],
    designPitfall: '针对直播助农或县域特色产业，须区分“助农一次性情怀购买”和“日常高频产品力复购”两大独立构念。',
  },
];

export const SURVEY_DESIGN_BEST_PRACTICES = [
  {
    title: '1. 甄别题与配额先行（《正大优鲜》与网调规范）',
    detail: '问卷开头 1–3 题必须先筛选合格受访者（城市范围、最近消费经历、从业回避排除），避免无效人群拉偏均值与回归系数。',
  },
  {
    title: '2. 避免“双重否定、诱导词与专业黑话”',
    detail: '如涉及“社区团购/无陪护病房/AIGC披露”等构念，题组前须用 ≤40 字通俗加注概念边界，让不同学历受访者理解一致。',
  },
  {
    title: '3. 五级/七级李克特量表对称锚点 + 注意力甄别项',
    detail: '强制统一量表方向（如 1=非常不满意 到 5=非常满意），量表题达到 8 题以上务必嵌入 1 道指定选项注意力检测题，剔除直线作答与秒交废卷。',
  },
  {
    title: '4. 30 份实测预调查（Pilot）比直接发大样本更重要',
    detail: '大赛答辩评委高频必问预调查发现了哪些歧义题、如何修订题干以及实际回测的 Cronbach α / KMO 是否达到 0.7 以上。',
  },
] as const;

/* ───────── 5. 国奖一级文献交叉引用范式库（源自 2024–2025 国一与权威指南） ───────── */

export const CP_AND_AWARD_CROSSREF_PRESETS: readonly LiteratureCandidate[] = [
  {
    id: 'ref-aapor-sampling',
    title: '分层配额抽样、覆盖误差控制与调查质量披露准则（AAPOR范式）',
    authors: '美国民意研究学会(AAPOR), 中国商业统计学会评审组',
    year: '2025',
    journal: '统计调查理论与实践指引',
    keywords: ['抽样', '配额', 'pps', '样本', '代表性', '质控', '问卷'],
    claim: '非概率配额或分层PPS抽样须明确披露抽样框、比例依据与未覆盖边界，并结合注意力甄别与直线作答清洗确保有效样本效度',
  },
  {
    id: 'ref-cp-dumpling-lda-rf',
    title: '结合 LDA 主题挖掘与随机森林算法的速冻食品创新特征及购买意愿研究（正大水饺命题范式）',
    authors: '正大杯第十五届研究生组国一研究框架提炼',
    year: '2025',
    journal: '正大杯全国大学生市场调查与分析大赛国奖范式库',
    keywords: ['正大', '水饺', '预制菜', '食品', '轻食', '随机森林', 'lda', '聚类', '偏好'],
    claim: '“一手分层抽样问卷（n>1000）+ 电商评论LDA文本挖掘 + 随机森林特征权重 + 多维消费聚类”可精准刻画不同消费层级对口味与包装的差异化需求',
  },
  {
    id: 'ref-utaut2-lowalt',
    title: '基于 UTAUT-II 与结构方程模型的低空经济及新兴智能技术嵌入意愿探究',
    authors: '正大杯第十五届国奖理论范式组',
    year: '2025',
    journal: '正大杯全国大学生市场调查与分析大赛国奖范式库',
    keywords: ['低空', 'ai', '大模型', '智能', 'utaut', '结构方程', '意愿', '接受度'],
    claim: '拓展 UTAUT-II 整合技术信任、隐私风险、社会影响与价格价值构念，能有效解释青年群体对 AI 与新兴业态从“体验意愿”向“付费/从业转化”的跃迁阻力',
  },
  {
    id: 'ref-hospital-care-ipa',
    title: '多维患者满意度测度与修正重要度-绩效分析（IPA）在医疗养老试点中的应用（无陪护病房范式）',
    authors: '国家卫健与市调实证方法论参照',
    year: '2025',
    journal: '健康服务与社会调查研究',
    keywords: ['无陪护', '医疗', '养老', '银发', '助餐', '满意度', 'ipa', '回归'],
    claim: '将服务质量、费用可及性与隐私信任纳入异质性分群回归与 IPA 优先改进矩阵，可精准识别高龄低收入人群与中青年群体的需求剪刀差',
  },
  {
    id: 'ref-heritage-tourism-cv',
    title: '文化认同、沉浸互动体验与非遗文旅二次消费转化路径分析',
    authors: '文旅融合与消费经济实证研究组',
    year: '2024',
    journal: '旅游科学实证汇编',
    keywords: ['非遗', '文旅', '簪花', '微短剧', '景区', '国潮', '重游', '消费'],
    claim: '区分“表面文化认同”与“实际消费转化”，以场景沉浸感与文创实用性为中介变量可防止传统调研“只看认同不问买单”的常见失误',
  },
];
