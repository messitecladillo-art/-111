import type {
  AwardCase,
  AwardCaseLibraryStats,
  CaseSourceRef,
  CaseSourceTier,
  CompetitionGroup,
} from "./case-types";

const OFFICIAL_SAFETY_NOTE =
  "本卡片仅收录公开获奖公告可直接核验的题名、学校、组别、奖项和届次；未披露的方法、样本、结论及评委意见一律不推断。获奖不等于每个技术细节均可安全复用。";

const USER_ATTESTED_SAFETY_NOTE =
  "奖项层级来自用户陈述，具体一等奖或二等奖映射及官方公告尚未独立核验；结构化亮点属于案例分析，不是获奖因果，复用前仍须通过方法、数据、隐私与匿名审计。";

type VerifiedCaseInput = {
  id: string;
  title: string;
  edition: "第十四届" | "第十五届";
  year: 2024 | 2025;
  institution: string;
  group: Exclude<CompetitionGroup, "unknown">;
  award: string;
  sourceUrl: string;
  sourceLabel: string;
  sourceTier: Exclude<CaseSourceTier, "user_provided_artifact">;
  literalTags: string[];
};

const uniqueTags = (tags: string[]) => [...new Set(tags.filter(Boolean))];

const verifiedCase = (input: VerifiedCaseInput): AwardCase => {
  const sourceRef: CaseSourceRef = {
    label: input.sourceLabel,
    sourceTier: input.sourceTier,
    url: input.sourceUrl,
    verifiedFields: ["title", "institution", "group", "award", "edition"],
  };

  return {
    id: input.id,
    title: input.title,
    edition: input.edition,
    year: input.year,
    institution: input.institution,
    group: input.group,
    award: input.award,
    verification: "official_verified",
    verificationStatus: "official_verified",
    sourceTier: input.sourceTier,
    caseDepth: "listing_only",
    sourceUrl: input.sourceUrl,
    topic: input.literalTags,
    sourceRefs: [sourceRef],
    tags: uniqueTags([
      input.edition,
      String(input.year),
      input.institution,
      input.group,
      input.award,
      "全国总决赛",
      "official_verified",
      ...input.literalTags,
    ]),
    safetyNote: OFFICIAL_SAFETY_NOTE,
  };
};

const CSSC_2025_URL =
  "https://www.china-cssc.org/uploadfile/20250523/1748002351891035.pdf";
const CSSC_2025_LABEL =
  "中国商业统计学会：第十五届全国大学生市场调查与分析大赛研究生组总决赛获奖公告";
const BNU_2024_URL =
  "https://stat.bnu.edu.cn/xwdt1/fb3df5478c2046eabcb7c5ee832a176d.htm";
const CSUST_2024_URL = "https://www.csust.edu.cn/stxy/info/1054/8553.htm";
const NJUCM_2024_URL =
  "https://jwc.njucm.edu.cn/2024/0605/c3866a128121/page.htm";
const NUC_2024_URL = "https://www.nuc.edu.cn/info/1013/32533.htm";

export const awardCaseLibraryNotice = {
  title: "精选获奖案例索引（非全量榜单）",
  body: "“官方来源已核验（official_verified）”表示题名、学校、组别、奖项和届次已由主办方或高校官网公告核验，不表示案例全文、方法、样本、结论或评委理由已公开。“用户陈述奖项（user_attested）”表示奖项由用户确认但尚缺独立官方映射。禁止把标题关键词扩写成未经来源支持的研究事实。",
  coverage:
    "当前官方层收录第十五届研究生组全国一等奖公告前 14 项，以及第十四届 4 所高校官网公开的 15 项；另含 3 项用户提供材料的深读记录。该快照不是历届全量榜单，不能据此推断选题偏好、评审因果或获奖概率。",
  capturedAt: "2026-08-04",
} as const;

export const awardCases: AwardCase[] = [
  // 第十五届（2025）研究生组：全国主办方公告，一等奖前 14 项。
  verifiedCase({
    id: "15-grad-first-001-anhui-university-rural-toilet",
    title:
      "小“厕”大“策”：从“臭角落”到“新亮点”——农村厕所革命现状及数字化赋能路径探究",
    edition: "第十五届",
    year: 2025,
    institution: "安徽大学",
    group: "研究生组",
    award: "全国总决赛一等奖",
    sourceUrl: CSSC_2025_URL,
    sourceLabel: CSSC_2025_LABEL,
    sourceTier: "national_organizer_notice",
    literalTags: ["农村厕所革命", "数字化赋能"],
  }),
  verifiedCase({
    id: "15-grad-first-002-huaibei-normal-anhui-noodles",
    title:
      "吃一“皖”板面，传“徽”食文化：基于消费者偏好与文化认知的安徽板面营销策略研究——以皖北地区为例",
    edition: "第十五届",
    year: 2025,
    institution: "淮北师范大学",
    group: "研究生组",
    award: "全国总决赛一等奖",
    sourceUrl: CSSC_2025_URL,
    sourceLabel: CSSC_2025_LABEL,
    sourceTier: "national_organizer_notice",
    literalTags: ["安徽板面", "皖北", "文化认知", "消费者偏好"],
  }),
  verifiedCase({
    id: "15-grad-first-003-city-university-macau-self-heating-food",
    title:
      "自热食品消费的抉择密码——基于大学生对自热食品安全风险感知的消费决策机制研究",
    edition: "第十五届",
    year: 2025,
    institution: "澳门城市大学",
    group: "研究生组",
    award: "全国总决赛一等奖",
    sourceUrl: CSSC_2025_URL,
    sourceLabel: CSSC_2025_LABEL,
    sourceTier: "national_organizer_notice",
    literalTags: ["自热食品", "食品安全", "风险感知", "大学生"],
  }),
  verifiedCase({
    id: "15-grad-first-004-macao-tourism-university-digital-transition",
    title: "时代坐标下的澳门：社会经济转型的数智化路径探析",
    edition: "第十五届",
    year: 2025,
    institution: "澳门旅游大学",
    group: "研究生组",
    award: "全国总决赛一等奖",
    sourceUrl: CSSC_2025_URL,
    sourceLabel: CSSC_2025_LABEL,
    sourceTier: "national_organizer_notice",
    literalTags: ["澳门", "社会经济转型", "数智化"],
  }),
  verifiedCase({
    id: "15-grad-first-005-north-china-tech-cp-prepared-food",
    title:
      "封存烟火气，开盖飨知音——北京市正大预制菜市场健康度评估与提升研究",
    edition: "第十五届",
    year: 2025,
    institution: "北方工业大学",
    group: "研究生组",
    award: "全国总决赛一等奖",
    sourceUrl: CSSC_2025_URL,
    sourceLabel: CSSC_2025_LABEL,
    sourceTier: "national_organizer_notice",
    literalTags: ["北京", "正大", "预制菜", "市场健康度"],
  }),
  verifiedCase({
    id: "15-grad-first-006-north-china-tech-guoyar-rice-crust",
    title:
      "谁家新炊锅巴香，脆声惊动少年郎——面向北京市年轻群体的狗牙儿锅巴品牌认知与消费偏好研究",
    edition: "第十五届",
    year: 2025,
    institution: "北方工业大学",
    group: "研究生组",
    award: "全国总决赛一等奖",
    sourceUrl: CSSC_2025_URL,
    sourceLabel: CSSC_2025_LABEL,
    sourceTier: "national_organizer_notice",
    literalTags: ["北京", "年轻群体", "狗牙儿锅巴", "品牌认知", "消费偏好"],
  }),
  verifiedCase({
    id: "15-grad-first-007-btbu-cp-dumpling",
    title: "“饺”尽心思，“味”来可期—北京市正大创意水饺新品方案设计与可行性研究",
    edition: "第十五届",
    year: 2025,
    institution: "北京工商大学",
    group: "研究生组",
    award: "全国总决赛一等奖",
    sourceUrl: CSSC_2025_URL,
    sourceLabel: CSSC_2025_LABEL,
    sourceTier: "national_organizer_notice",
    literalTags: ["北京", "正大", "创意水饺", "新品方案"],
  }),
  verifiedCase({
    id: "15-grad-first-008-cufe-hanfu-photography",
    title: "汉服镜影，古韵新生——北京市汉服写真市场满意度与服务提升策略研究",
    edition: "第十五届",
    year: 2025,
    institution: "中央财经大学",
    group: "研究生组",
    award: "全国总决赛一等奖",
    sourceUrl: CSSC_2025_URL,
    sourceLabel: CSSC_2025_LABEL,
    sourceTier: "national_organizer_notice",
    literalTags: ["北京", "汉服写真", "市场满意度", "服务提升"],
  }),
  verifiedCase({
    id: "15-grad-first-009-cufe-old-community-renewal",
    title: "旧貌换新颜，老宅化美居——北京市老旧小区改造的居民满意度与需求意愿调研",
    edition: "第十五届",
    year: 2025,
    institution: "中央财经大学",
    group: "研究生组",
    award: "全国总决赛一等奖",
    sourceUrl: CSSC_2025_URL,
    sourceLabel: CSSC_2025_LABEL,
    sourceTier: "national_organizer_notice",
    literalTags: ["北京", "老旧小区改造", "居民满意度", "需求意愿"],
  }),
  verifiedCase({
    id: "15-grad-first-010-minzu-ne-zha-ip",
    title: "百亿票房男主哪吒的破圈之路——中国传统神话人物现象级 IP 打造全攻略",
    edition: "第十五届",
    year: 2025,
    institution: "中央民族大学",
    group: "研究生组",
    award: "全国总决赛一等奖",
    sourceUrl: CSSC_2025_URL,
    sourceLabel: CSSC_2025_LABEL,
    sourceTier: "national_organizer_notice",
    literalTags: ["哪吒", "传统神话", "IP"],
  }),
  verifiedCase({
    id: "15-grad-first-011-minzu-ne-zha-2-animation",
    title: "票房狂飙，魔丸“制霸”——《哪吒 2》破圈之路与国漫电影的逆袭指南",
    edition: "第十五届",
    year: 2025,
    institution: "中央民族大学",
    group: "研究生组",
    award: "全国总决赛一等奖",
    sourceUrl: CSSC_2025_URL,
    sourceLabel: CSSC_2025_LABEL,
    sourceTier: "national_organizer_notice",
    literalTags: ["哪吒2", "国漫电影", "破圈"],
  }),
  verifiedCase({
    id: "15-grad-first-012-fafu-xiaomi-fujian",
    title: "“MI”出新高度，智享新维“度”—福建省小米品牌产品消费需求及市场前景调研",
    edition: "第十五届",
    year: 2025,
    institution: "福建农林大学",
    group: "研究生组",
    award: "全国总决赛一等奖",
    sourceUrl: CSSC_2025_URL,
    sourceLabel: CSSC_2025_LABEL,
    sourceTier: "national_organizer_notice",
    literalTags: ["福建", "小米", "消费需求", "市场前景"],
  }),
  verifiedCase({
    id: "15-grad-first-013-huaqiao-xiamen-real-estate",
    title:
      "“鹭岛楼市何所向，厝边信心何所依？”——基于厦门市房地产新政效果与居民购房信心的调查研究",
    edition: "第十五届",
    year: 2025,
    institution: "华侨大学",
    group: "研究生组",
    award: "全国总决赛一等奖",
    sourceUrl: CSSC_2025_URL,
    sourceLabel: CSSC_2025_LABEL,
    sourceTier: "national_organizer_notice",
    literalTags: ["厦门", "房地产新政", "购房信心"],
  }),
  verifiedCase({
    id: "15-grad-first-014-xiamen-rural-medical-insurance",
    title:
      "千村万舍康衢远，一针一药总关情——吉安市农村居民城乡居民医保满意度及购买意愿调查研究",
    edition: "第十五届",
    year: 2025,
    institution: "厦门大学",
    group: "研究生组",
    award: "全国总决赛一等奖",
    sourceUrl: CSSC_2025_URL,
    sourceLabel: CSSC_2025_LABEL,
    sourceTier: "national_organizer_notice",
    literalTags: ["吉安", "农村居民", "城乡居民医保", "满意度", "购买意愿"],
  }),

  // 第十四届（2024）：高校官网公告。
  verifiedCase({
    id: "14-grad-first-bnu-guochao-fragrance",
    title: "“时光知味，岁月留香”——广州市国潮香氛品牌产品购买行为及市场拓展策略分析",
    edition: "第十四届",
    year: 2024,
    institution: "北京师范大学",
    group: "研究生组",
    award: "全国总决赛一等奖",
    sourceUrl: BNU_2024_URL,
    sourceLabel: "北京师范大学统计学院：2024年度获奖队伍详细情况",
    sourceTier: "official_university_notice",
    literalTags: ["广州", "国潮香氛", "购买行为", "市场拓展"],
  }),
  verifiedCase({
    id: "14-undergrad-second-bnu-carbon-label",
    title:
      "绿色标签助推低碳行动：你愿意为降碳而买单吗？——粤港澳大湾区九市碳标签产品的支付意愿调查与推广路径分析",
    edition: "第十四届",
    year: 2024,
    institution: "北京师范大学",
    group: "本科组",
    award: "全国总决赛二等奖",
    sourceUrl: BNU_2024_URL,
    sourceLabel: "北京师范大学统计学院：2024年度获奖队伍详细情况",
    sourceTier: "official_university_notice",
    literalTags: ["粤港澳大湾区", "碳标签", "支付意愿", "低碳"],
  }),
  verifiedCase({
    id: "14-undergrad-second-bnu-prepared-food",
    title: "预知市场风向，开拓预制市预制菜消费及企业战略调研报告",
    edition: "第十四届",
    year: 2024,
    institution: "北京师范大学",
    group: "本科组",
    award: "全国总决赛二等奖",
    sourceUrl: BNU_2024_URL,
    sourceLabel: "北京师范大学统计学院：2024年度获奖队伍详细情况",
    sourceTier: "official_university_notice",
    literalTags: ["预制菜", "消费", "企业战略", "题名按官网原文收录"],
  }),
  verifiedCase({
    id: "14-grad-first-csust-zibo-tourism",
    title: "“有淄有味，滨至如归”——新媒体营销对高校学生旅游意愿影响",
    edition: "第十四届",
    year: 2024,
    institution: "长沙理工大学",
    group: "研究生组",
    award: "全国总决赛一等奖",
    sourceUrl: CSUST_2024_URL,
    sourceLabel: "长沙理工大学数学与统计学院：第十四届研究生组获奖队伍名单",
    sourceTier: "official_university_notice",
    literalTags: ["淄博", "新媒体营销", "高校学生", "旅游意愿"],
  }),
  verifiedCase({
    id: "14-grad-third-csust-green-power-construction",
    title:
      "“电”亮绿色未来：输电线路绿色机械化施工现状调查与方案研究——基于长沙地区样本",
    edition: "第十四届",
    year: 2024,
    institution: "长沙理工大学",
    group: "研究生组",
    award: "全国总决赛三等奖",
    sourceUrl: CSUST_2024_URL,
    sourceLabel: "长沙理工大学数学与统计学院：第十四届研究生组获奖队伍名单",
    sourceTier: "official_university_notice",
    literalTags: ["长沙", "输电线路", "绿色机械化施工"],
  }),
  verifiedCase({
    id: "14-grad-third-csust-power-demand-response",
    title:
      '电力新潮 "独立"前行——双碳背景下广西地区第三方独立主体电力需求响应市场调查',
    edition: "第十四届",
    year: 2024,
    institution: "长沙理工大学",
    group: "研究生组",
    award: "全国总决赛三等奖",
    sourceUrl: CSUST_2024_URL,
    sourceLabel: "长沙理工大学数学与统计学院：第十四届研究生组获奖队伍名单",
    sourceTier: "official_university_notice",
    literalTags: ["广西", "双碳", "电力需求响应", "第三方独立主体"],
  }),
  verifiedCase({
    id: "14-grad-third-csust-tea-brand-collaboration",
    title:
      "新茶饮爱上联名，“X”魔法再涌新潮——新茶饮品牌联名营销市场调查与消费者购买行为研究",
    edition: "第十四届",
    year: 2024,
    institution: "长沙理工大学",
    group: "研究生组",
    award: "全国总决赛三等奖",
    sourceUrl: CSUST_2024_URL,
    sourceLabel: "长沙理工大学数学与统计学院：第十四届研究生组获奖队伍名单",
    sourceTier: "official_university_notice",
    literalTags: ["新茶饮", "品牌联名", "购买行为"],
  }),
  verifiedCase({
    id: "14-undergrad-first-njucm-integrated-eldercare",
    title: "老有所“医”，老有所“养”——医养结合背景下健康养老服务供需匹配分析及优化研究",
    edition: "第十四届",
    year: 2024,
    institution: "南京中医药大学",
    group: "本科组",
    award: "全国总决赛一等奖",
    sourceUrl: NJUCM_2024_URL,
    sourceLabel: "南京中医药大学教务处：第十四届获奖名单",
    sourceTier: "official_university_notice",
    literalTags: ["医养结合", "健康养老", "供需匹配"],
  }),
  verifiedCase({
    id: "14-undergrad-second-njucm-coconut-chicken",
    title: "“鸡”寒交迫 琼浆玉“椰”——基于正大旗下“椰子鸡”类养生药膳的消费群体分析挖掘",
    edition: "第十四届",
    year: 2024,
    institution: "南京中医药大学",
    group: "本科组",
    award: "全国总决赛二等奖",
    sourceUrl: NJUCM_2024_URL,
    sourceLabel: "南京中医药大学教务处：第十四届获奖名单",
    sourceTier: "official_university_notice",
    literalTags: ["正大", "椰子鸡", "养生药膳", "消费群体"],
  }),
  verifiedCase({
    id: "14-undergrad-second-njucm-biopharma-talent",
    title: "南京生物医药行业数字经济人才需求以及岗位能力模型、培养方式调研",
    edition: "第十四届",
    year: 2024,
    institution: "南京中医药大学",
    group: "本科组",
    award: "全国总决赛二等奖",
    sourceUrl: NJUCM_2024_URL,
    sourceLabel: "南京中医药大学教务处：第十四届获奖名单",
    sourceTier: "official_university_notice",
    literalTags: ["南京", "生物医药", "数字经济人才", "岗位能力模型"],
  }),
  verifiedCase({
    id: "14-undergrad-third-njucm-tongrentang",
    title:
      "百年明月今犹在，巧以新桃换旧符——基于Z世代中医药老字号品牌活化路径探索：以同仁堂为例",
    edition: "第十四届",
    year: 2024,
    institution: "南京中医药大学",
    group: "本科组",
    award: "全国总决赛三等奖",
    sourceUrl: NJUCM_2024_URL,
    sourceLabel: "南京中医药大学教务处：第十四届获奖名单",
    sourceTier: "official_university_notice",
    literalTags: ["Z世代", "中医药老字号", "品牌活化", "同仁堂"],
  }),
  verifiedCase({
    id: "14-undergrad-third-njucm-elderly-care-robots",
    title: "智慧陪护，乐享晚年——智慧养老背景下南京市老年人陪护机器人使用意愿及影响因素调查研究",
    edition: "第十四届",
    year: 2024,
    institution: "南京中医药大学",
    group: "本科组",
    award: "全国总决赛三等奖",
    sourceUrl: NJUCM_2024_URL,
    sourceLabel: "南京中医药大学教务处：第十四届获奖名单",
    sourceTier: "official_university_notice",
    literalTags: ["南京", "智慧养老", "陪护机器人", "使用意愿"],
  }),
  verifiedCase({
    id: "14-undergrad-third-njucm-pet-tcm",
    title: "集本草之精华，达宠物之大康——南京地区宠物中医市场前景调研及机会挖掘",
    edition: "第十四届",
    year: 2024,
    institution: "南京中医药大学",
    group: "本科组",
    award: "全国总决赛三等奖",
    sourceUrl: NJUCM_2024_URL,
    sourceLabel: "南京中医药大学教务处：第十四届获奖名单",
    sourceTier: "official_university_notice",
    literalTags: ["南京", "宠物中医", "市场前景"],
  }),
  verifiedCase({
    id: "14-undergrad-third-njucm-young-baijiu",
    title: "青春诗意·洋河韵——洋河白酒年轻化融合之道",
    edition: "第十四届",
    year: 2024,
    institution: "南京中医药大学",
    group: "本科组",
    award: "全国总决赛三等奖",
    sourceUrl: NJUCM_2024_URL,
    sourceLabel: "南京中医药大学教务处：第十四届获奖名单",
    sourceTier: "official_university_notice",
    literalTags: ["洋河", "白酒年轻化"],
  }),
  verifiedCase({
    id: "14-undergrad-first-nuc-tourism-short-video",
    title:
      "“晋秀山河，掌中画卷”——山西省文旅短视频的传播现状及传播效果分析——基于山河四省Z世代的调查",
    edition: "第十四届",
    year: 2024,
    institution: "中北大学",
    group: "本科组",
    award: "全国总决赛一等奖",
    sourceUrl: NUC_2024_URL,
    sourceLabel: "中北大学：第十四届本科组全国总决赛获奖新闻",
    sourceTier: "official_university_notice",
    literalTags: ["山西", "文旅短视频", "山河四省", "Z世代"],
  }),

  // 用户提供的三件国奖深度案例：奖项为 user_attested，具体一/二等奖未知。
  {
    id: "user-16-football-dual-track",
    title: "足梦前行，绝不蒜鸟——武汉城市足球超级联赛城区—高校双轨赛道赛事反馈与优化路径",
    edition: "第十六届（作品自述）",
    year: 2026,
    institution: "未披露",
    group: "unknown",
    award: "国家一等奖或二等奖（具体未知）",
    verification: "user_attested",
    verificationStatus: "user_attested",
    sourceTier: "user_provided_artifact",
    caseDepth: "artifact_deep_dive",
    topic: ["城市足球", "高校赛道", "赛事运营"],
    region: ["武汉"],
    summary:
      "围绕武汉城市足球超级联赛城区—高校双轨赛道的反馈与优化展开；当前可学习的是问题张力、双轴细分、母洞察与报告—PPT转译机制。",
    highlights: [
      "真实管理选择与双轨结构张力",
      "学生与居民等多维细分",
      "一条母洞察贯穿结论与行动",
      "报告承担举证、PPT重建决策故事",
    ],
    sourceRefs: [
      {
        label: "用户案例接收与哈希登记",
        sourceTier: "user_provided_artifact",
        repositoryPath:
          "corpus-source/case-studies/user-case-intake-2026-08-04.json",
        verifiedFields: [
          "title",
          "artifactClaimedEdition",
          "awardStatus",
          "artifactHashes",
        ],
      },
      {
        label: "三案例结构与复用安全分析",
        sourceTier: "user_provided_artifact",
        repositoryPath:
          "skill/zhengda-cup-champion/references/case-corpus.md",
        verifiedFields: ["abstractedPatterns", "reuseSafetyLimits"],
      },
    ],
    tags: [
      "第十六届",
      "2026",
      "user_attested",
      "国家一等奖或二等奖",
      "武汉",
      "城市足球",
      "高校赛道",
      "双轨赛事",
      "赛事运营",
      "深度案例",
    ],
    safetyNote: USER_ATTESTED_SAFETY_NOTE,
  },
  {
    id: "user-16-new-blue-collar",
    title: "脱下长衫之后——武汉市高校毕业生新蓝领群体就业选择、分层画像与成长支持路径研究",
    edition: "第十六届（作品自述）",
    year: 2026,
    institution: "未披露",
    group: "unknown",
    award: "国家一等奖或二等奖（具体未知）",
    verification: "user_attested",
    verificationStatus: "user_attested",
    sourceTier: "user_provided_artifact",
    caseDepth: "artifact_deep_dive",
    topic: ["高校毕业生", "新蓝领", "就业选择", "成长支持"],
    region: ["武汉"],
    summary:
      "聚焦武汉高校毕业生新蓝领群体的就业选择、分层画像与成长支持；当前可学习的是有张力的群体界定、递进证据链和画像—行动一致性。",
    highlights: [
      "高张力公共议题被收窄到可调查的本地群体",
      "特征识别—需求诊断—群体分层—机制解释—文本校验的递进结构",
      "画像系统贯穿需求、机制与支持路径",
      "结论与分层行动保持结构对应",
    ],
    sourceRefs: [
      {
        label: "用户案例接收与哈希登记",
        sourceTier: "user_provided_artifact",
        repositoryPath:
          "corpus-source/case-studies/user-case-intake-2026-08-04.json",
        verifiedFields: [
          "title",
          "artifactClaimedEdition",
          "awardStatus",
          "artifactHashes",
        ],
      },
      {
        label: "三案例结构与复用安全分析",
        sourceTier: "user_provided_artifact",
        repositoryPath:
          "skill/zhengda-cup-champion/references/case-corpus.md",
        verifiedFields: ["abstractedPatterns", "reuseSafetyLimits"],
      },
    ],
    tags: [
      "第十六届",
      "2026",
      "user_attested",
      "国家一等奖或二等奖",
      "武汉",
      "高校毕业生",
      "新蓝领",
      "就业选择",
      "分层画像",
      "成长支持",
      "深度案例",
    ],
    safetyNote: USER_ATTESTED_SAFETY_NOTE,
  },
  {
    id: "user-16-generation-z-offline-entertainment",
    title: "娱你相遇，因为心动——Z世代线下观演类娱乐的消费态度、行为和体验研究",
    edition: "第十六届（作品自述）",
    year: 2026,
    institution: "未披露",
    group: "unknown",
    award: "国家一等奖或二等奖（具体未知）",
    verification: "user_attested",
    verificationStatus: "user_attested",
    sourceTier: "user_provided_artifact",
    caseDepth: "artifact_deep_dive",
    topic: ["Z世代", "线下观演", "娱乐消费", "体验研究"],
    summary:
      "聚焦Z世代线下观演类娱乐的消费态度、行为与体验；当前可学习的是旅程式叙事、体验状态与品类双轴细分及发现—行动覆盖。",
    highlights: [
      "记忆型标题与体验旅程框架",
      "参与状态与娱乐品类的双轴细分",
      "人群—品类—体验痛点—行动的完整映射",
      "报告与PPT保持视觉和叙事连续性",
    ],
    sourceRefs: [
      {
        label: "用户案例接收与哈希登记",
        sourceTier: "user_provided_artifact",
        repositoryPath:
          "corpus-source/case-studies/user-case-intake-2026-08-04.json",
        verifiedFields: [
          "title",
          "artifactClaimedEdition",
          "awardStatus",
          "artifactHashes",
        ],
      },
      {
        label: "三案例结构与复用安全分析",
        sourceTier: "user_provided_artifact",
        repositoryPath:
          "skill/zhengda-cup-champion/references/case-corpus.md",
        verifiedFields: ["abstractedPatterns", "reuseSafetyLimits"],
      },
    ],
    tags: [
      "第十六届",
      "2026",
      "user_attested",
      "国家一等奖或二等奖",
      "Z世代",
      "线下观演",
      "娱乐消费",
      "体验研究",
      "双轴细分",
      "深度案例",
    ],
    safetyNote: USER_ATTESTED_SAFETY_NOTE,
  },
];

export const awardCaseLibraryStats: AwardCaseLibraryStats = awardCases.reduce<AwardCaseLibraryStats>(
  (stats, item) => {
    stats.total += 1;
    if (item.verification === "official_verified") {
      stats.officialVerified += 1;
    } else {
      stats.userAttested += 1;
    }
    stats.byEdition[item.edition] = (stats.byEdition[item.edition] ?? 0) + 1;
    return stats;
  },
  {
    total: 0,
    officialVerified: 0,
    userAttested: 0,
    byEdition: {},
  },
);

export const findAwardCases = (query: string): AwardCase[] => {
  const needle = query.trim().toLocaleLowerCase("zh-CN");
  if (!needle) return awardCases;

  return awardCases.filter((item) =>
    [
      item.title,
      item.edition,
      String(item.year),
      item.institution,
      item.group,
      item.award,
      ...item.tags,
    ]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(needle),
  );
};
