/**
 * Pure-Vector Track 2 Bento Editorial Infographic Renderer (`360x228` native / `960x608` report print).
 *
 * Reuses `deriveInkPalette` from `./chart-example-renderer.ts` so every plate harmonizes dynamically
 * with the active `FigurePalette/v1` and passes strict SVG 1.1 `assertTrueVector` checks across
 * Browser Preview, Word `.docx`, PowerPoint `.pptx`, and XeLaTeX PDF.
 */
import type { FigureInk } from '../figure-palette.ts';
import { assertTrueVector as assertSvgSafe } from '../svg-safety.ts';
import { assertTrueVector as assertStrictOfficeVector } from '../vector-svg.ts';
import { deriveInkPalette, type ResolvedInk } from './chart-example-renderer.ts';

export type BentoInfographicArchetype =
  | 'low_altitude_logistics'
  | 'llm_rag_eval'
  | 'ev_charging_profile'
  | 'county_medical_referral'
  | 'crossborder_supply_loss'
  | 'grad_skill_mismatch'
  | 'pocket_park_renewal'
  | 'synbio_pilot_kpi'
  | 'heritage_digital_twin'
  | 'smart_farmland_water'
  | 'livestream_impulse_return'
  | 'community_childcare_radius'
  | 'silver_fintech_antifraud'
  | 'campus_mental_triage'
  | 'zerowaste_circular_community'
  | 'rural_coldchain_precool'
  | 'smart_port_customs'
  | 'raredisease_multitier_ins'
  | 'ai_vocational_reskilling'
  | 'natpark_wildlife_coexist'
  | 'instant_retail_darkstore'
  | 'silver_home_telehealth'
  | 'retail_cohort_frequency'
  | 'silver_caregiver_dyad'
  | 'retail_30d_pilot_action'
  | 'silver_community_grid_action'
  | 'four_segment_precision_policy'
  | 'regional_respondent_portrait'
  | 'grid_v2g_peak_shaving'
  | 'rural_express_co_delivery'
  | 'youth_night_school_public'
  | 'drg_clinical_pathway_cost'
  | 'semiconductor_fab_yield'
  | 'ocean_blue_carbon_ranch'
  | 'embodied_humanoid_factory'
  | 'county_rural_canteen_elder'
  | 'urban_flood_sponge_grid'
  | 'agri_seed_nanfan_breeding'
  | 'youth_flexible_gig_social'
  | 'cross_province_medical_settle'
  | 'cbam_green_export_compliance'
  | 'silver_ltci_home_care'
  | 'smart_grid_micro_storage'
  | 'rural_ecomm_live_cluster'
  | 'autonomous_robotaxi_trust'
  | 'hospital_ai_triage_safety'
  | 'quantum_computing_supply_chain'
  | 'green_hydrogen_port_corridor'
  | 'smart_rail_transit_tod'
  | 'digital_renminbi_crossborder'
  | 'precision_oncology_companion'
  | 'rural_water_conservancy_twin';

export interface BentoKpiMetric {
  readonly label: string;
  readonly value: string;
}

export interface BentoPlateMetadata {
  readonly domainBadge: string;
  readonly subtitle: string;
  readonly waffleRatio: number; // 0..10 filled waffle units
  readonly waffleLabel: string;
  readonly kpis: readonly [BentoKpiMetric, BentoKpiMetric, BentoKpiMetric];
  readonly bars: readonly [readonly [string, number], readonly [string, number], readonly [string, number]];
  readonly rows: readonly [
    readonly [string, string, string],
    readonly [string, string, string],
    readonly [string, string, string],
  ];
  readonly footnote: string;
}

export const BENTO_PLATE_META: Readonly<Record<BentoInfographicArchetype, BentoPlateMetadata>> = {
  low_altitude_logistics: {
    domainBadge: '低空经济 · 末端配送',
    subtitle: '无人机起降点、航线高度层与冷链时效实证',
    waffleRatio: 8,
    waffleLabel: '准点达标 8/10',
    kpis: [
      { label: '跨江直飞时效', value: '14 min' },
      { label: '山区单票降本', value: '-28.4%' },
      { label: '气象可用窗口', value: '86.2%' },
    ],
    bars: [
      ['生鲜冷链急送', 88],
      ['基层急救血样', 82],
      ['岛屿件即时达', 74],
    ],
    rows: [
      ['120m 空域走廊', '14.2 min', '-28.4%'],
      ['骑手接驳微仓', '29.5 min', '-11.0%'],
      ['传统路网迂回', '54.0 min', '基线对照'],
    ],
    footnote: '参考模板样例数据 · 插入报告前须替换为实际航线实测指标',
  },
  llm_rag_eval: {
    domainBadge: '知识问答 · 检索核验',
    subtitle: '多跳检索、重排门控与幻觉拦截双盲评测',
    waffleRatio: 9,
    waffleLabel: '证据闭环 9/10',
    kpis: [
      { label: '幻觉率降幅', value: '-64.5%' },
      { label: '引用忠实度', value: '93.8%' },
      { label: 'P95 首字延迟', value: '620 ms' },
    ],
    bars: [
      ['语义重排命中', 94],
      ['反证拒答稳健', 89],
      ['多表数值溯源', 84],
    ],
    rows: [
      ['混合检索 + 校验门', '93.8%', '1.9% 幻觉'],
      ['纯向量 Top-K 召回', '76.4%', '7.8% 幻觉'],
      ['零检索直出基线', '52.0%', '18.4% 幻觉'],
    ],
    footnote: '参考模板样例数据 · 适配数智治理或知识问答系统评估章节',
  },
  ev_charging_profile: {
    domainBadge: '新能源 · 潮汐补能',
    subtitle: '快充桩排队焦虑、分时电价弹性与 V2G 响应',
    waffleRatio: 7,
    waffleLabel: '谷电迁移 7/10',
    kpis: [
      { label: '谷段响应占比', value: '68.4%' },
      { label: '节假日平均等桩', value: '37 min' },
      { label: '充电价格弹性', value: '-0.52' },
    ],
    bars: [
      ['家充私桩谷电', 86],
      ['枢纽液冷超充', 78],
      ['高速服务区等位', 64],
    ],
    rows: [
      ['分时电价拉差引导', '68.4%', '峰荷 -19%'],
      ['预约锁桩提前导航', '54.1%', '等桩 -14m'],
      ['移动储能车应急补能', '41.8%', '满意 +0.72'],
    ],
    footnote: '参考模板样例数据 · 适配新能源汽车补能行为与基础设施调研',
  },
  county_medical_referral: {
    domainBadge: '县域医共体 · 分级诊疗',
    subtitle: '村医首诊、县级影像共享中心与上转下沉路径',
    waffleRatio: 8,
    waffleLabel: '基层首诊 8/10',
    kpis: [
      { label: '县域内就诊率', value: '84.6%' },
      { label: '检验互认率', value: '79.2%' },
      { label: '慢病随访留存', value: '+31.5%' },
    ],
    bars: [
      ['远程心电/影像判读', 89],
      ['村卫生室常用药配齐', 81],
      ['康复期下转承接', 72],
    ],
    rows: [
      ['远程云影像会诊', '18 min', '误漏降 42%'],
      ['慢病长处方延伸', '82.4%', '停药减半'],
      ['双向绿色转诊通道', '79.2%', '省外迁减'],
    ],
    footnote: '参考模板样例数据 · 适配基层医疗卫生与公共服务可及性评估',
  },
  crossborder_supply_loss: {
    domainBadge: '跨境电商 · 海外仓',
    subtitle: '选品退货、干线甩柜与尾程合规损耗多级拆解',
    waffleRatio: 7,
    waffleLabel: '履约完好 7/10',
    kpis: [
      { label: '全链路综合损耗', value: '6.8%' },
      { label: '海外仓周转天数', value: '34 d' },
      { label: '尺码/破损退货', value: '48.2%' },
    ],
    bars: [
      ['智能预备货预测', 84],
      ['本土化退换检测仓', 76],
      ['多口岸海空联运', 69],
    ],
    rows: [
      ['前置海外仓备货', '4.2 d 达', '退货可二次售'],
      ['跨境小包直邮', '11.5 d', '丢破损 8.9%'],
      ['独立站多币种清分', 'T+2 结算', '拒付率 0.6%'],
    ],
    footnote: '参考模板样例数据 · 适配外贸跨境产业带与供应链效率调查',
  },
  grad_skill_mismatch: {
    domainBadge: '青年就业 · 技能错配',
    subtitle: '高校培养结构、新兴岗胜任力与薪资期望落差',
    waffleRatio: 6,
    waffleLabel: '岗课吻合 6/10',
    kpis: [
      { label: '数字工具胜任率', value: '61.5%' },
      { label: '首份工作留存', value: '14.2 mo' },
      { label: '微证书溢价效应', value: '+14.8%' },
    ],
    bars: [
      ['数智协同工具应用', 82],
      ['行业项目实战履历', 74],
      ['跨界合规表达素养', 66],
    ],
    rows: [
      ['校企联合订单班', '86.4%', '起薪 +14.8%'],
      ['通识型传统授课', '54.2%', '磨合期 5.2m'],
      ['跨专业微证书补训', '73.8%', '转正 +18%'],
    ],
    footnote: '参考模板样例数据 · 适配大学生就业质量与职业技能培训研究',
  },
  pocket_park_renewal: {
    domainBadge: '城市微更新 · 口袋公园',
    subtitle: '闲置边角地改造、适老无障碍与夜间照度实测',
    waffleRatio: 8,
    waffleLabel: '全龄满意 8/10',
    kpis: [
      { label: '5 分钟可达户数', value: '91.4%' },
      { label: '长者日均停留', value: '48 min' },
      { label: '夜间安全感评分', value: '4.46/5' },
    ],
    bars: [
      ['遮阴休憩座椅密度', 91],
      ['防滑无障碍坡道', 87],
      ['儿童游戏防撞铺装', 79],
    ],
    rows: [
      ['高密防滑坐凳 + 扶手', '48 min', '满意度 4.58'],
      ['补光低眩夜行步道', '4.46 / 5', '夜访 +62%'],
      ['雨水花园微气候调温', '-1.8 ℃', '运维降 24%'],
    ],
    footnote: '参考模板样例数据 · 适配城市社区微更新、绿地公平性与适老化调查',
  },
  synbio_pilot_kpi: {
    domainBadge: '绿色制造 · 合成生物',
    subtitle: '发酵中试放大良率、酶催化能耗与减排收益',
    waffleRatio: 8,
    waffleLabel: '中试稳态 8/10',
    kpis: [
      { label: '吨产品碳降幅', value: '-41.3%' },
      { label: '中试批次良率', value: '87.5%' },
      { label: '溶剂水耗下降', value: '-53.0%' },
    ],
    bars: [
      ['发酵底物转化效率', 88],
      ['连续流分离收率', 82],
      ['尾液生物回用率', 76],
    ],
    rows: [
      ['生物酶法路线', '87.5%', '碳足迹 -41.3%'],
      ['传统石化合成', '91.0%', '高危废高能耗'],
      ['智能代谢流优化迭代', '+9.4%', '周期缩 32%'],
    ],
    footnote: '参考模板样例数据 · 适配新质生产力、化工减排与生物制造调研',
  },
  heritage_digital_twin: {
    domainBadge: '文博数字孪生 · 活化',
    subtitle: '毫米级激光点云监测、病害预警与沉浸叙事消费',
    waffleRatio: 9,
    waffleLabel: '病害预警 9/10',
    kpis: [
      { label: '木构微变形精度', value: '0.8 mm' },
      { label: '线上云游复购转化', value: '24.6%' },
      { label: '客流峰谷平滑度', value: '+36.0%' },
    ],
    bars: [
      ['AR 实景古建导览', 89],
      ['温湿度裂隙预警', 93],
      ['数字文创二消渗透', 71],
    ],
    rows: [
      ['数字孪生巡检哨兵', '0.8 mm', '抢修提前 45d'],
      ['AR 叙事研学路线', '24.6%', '停留增 52 min'],
      ['预约分时限流调控', '+36.0%', '挤拥投诉 -64%'],
    ],
    footnote: '参考模板样例数据 · 适配文化遗产保护、博物馆数智化与文旅消费',
  },
  smart_farmland_water: {
    domainBadge: '高标准农田 · 节水增产',
    subtitle: '墒情传感联动智能滴灌、水肥一体与小农户采纳',
    waffleRatio: 8,
    waffleLabel: '托管覆盖 8/10',
    kpis: [
      { label: '亩均灌溉节水', value: '34.8%' },
      { label: '托管采纳意愿', value: '76.5%' },
      { label: '化肥减施降本', value: '-21.2%' },
    ],
    bars: [
      ['水肥一体自动化率', 85],
      ['合作社社会化托管', 78],
      ['无人机巡田植保频', 83],
    ],
    rows: [
      ['传感阀 + 水肥一体', '-34.8% 水', '亩增收益 280 元'],
      ['半托管社会化服务', '76.5% 愿', '劳力释出 58%'],
      ['传统漫灌农户对照', '基线耗水', '施肥超量 22%'],
    ],
    footnote: '参考模板样例数据 · 适配三农乡村振兴、智慧农业与节水灌溉调研',
  },
  livestream_impulse_return: {
    domainBadge: '直播电商 · 退货归因',
    subtitle: '稀缺话术唤起、冲动下单与七天退货心理契约失衡',
    waffleRatio: 6,
    waffleLabel: '低退货组 6/10',
    kpis: [
      { label: '冲动单七日退货', value: '31.4%' },
      { label: '高感知透明度降退', value: '-42.0%' },
      { label: '退货险道德风险差', value: '+11.8%' },
    ],
    bars: [
      ['倒计时紧迫促单', 89],
      ['实拍色差与尺码疑虑', 84],
      ['权威第三方质检背书', 46],
    ],
    rows: [
      ['强促销闪购专场', '31.4% 退', '情绪唤起 β=0.62'],
      ['车间溯源慢直播', '14.2% 退', '信任中介 54.6%'],
      ['智能虚拟试穿匹配', '18.1% 退', '尺码误选减半'],
    ],
    footnote: '参考模板样例数据 · 适配直播消费心理学、电商治理与消费者权益保护',
  },
  community_childcare_radius: {
    domainBadge: '普惠托育 · 15 分钟圈',
    subtitle: '社区嵌入式托位供给、适价区间与双职工信任阈值',
    waffleRatio: 7,
    waffleLabel: '托位匹配 7/10',
    kpis: [
      { label: '步行可达承受上限', value: '12 min' },
      { label: '家庭月支付意愿', value: '2,150 元' },
      { label: '保育师生比关切', value: '94.2%' },
    ],
    bars: [
      ['实时透明安全监控', 94],
      ['下班弹性延时托管', 88],
      ['楼宇园区配建便利', 81],
    ],
    rows: [
      ['社区嵌入式公助民营', '2,150 元/m', '入住意愿 83.4%'],
      ['企业园区托育福利', '8 min 接送', '返岗稳定 +29%'],
      ['隔代祖辈辅助照料', '零货币支', '教育分歧率 44%'],
    ],
    footnote: '参考模板样例数据 · 适配生育支持政策、家政服务与社区公共设施调研',
  },
  silver_fintech_antifraud: {
    domainBadge: '银发金融 · 反诈防线',
    subtitle: '大额转账冷静期、适老交互门槛与亲情守护联动',
    waffleRatio: 8,
    waffleLabel: '拦截有效 8/10',
    kpis: [
      { label: '高危转账拦截率', value: '89.4%' },
      { label: '亲情延迟核验窗', value: '15 min' },
      { label: '误触诈骗降幅', value: '-61.8%' },
    ],
    bars: [
      ['亲情协同二次确认', 92],
      ['大额冷静期延时锁', 85],
      ['适老关怀大字防误', 78],
    ],
    rows: [
      ['守护人协防冷静锁', '89.4%', '误转 -62%'],
      ['实时语音防骗弹窗', '74.2%', '识破 +41%'],
      ['传统短信单向预警', '38.5%', '基线漏防'],
    ],
    footnote: '参考模板样例数据 · 适配银发数字金融、适老防诈与代际监护调研',
  },
  campus_mental_triage: {
    domainBadge: '高校心理 · 分级分流',
    subtitle: '宿舍-学院-校心三级筛查、匿名倾诉与预约提速',
    waffleRatio: 8,
    waffleLabel: '首诊提速 8/10',
    kpis: [
      { label: '匿名求助触达率', value: '82.6%' },
      { label: '首轮面询候诊', value: '1.8 d' },
      { label: '高危干预回稳', value: '91.2%' },
    ],
    bars: [
      ['匿名线上倾诉入口', 91],
      ['宿舍心理委员哨点', 84],
      ['学业减压弹性转介', 76],
    ],
    rows: [
      ['匿名轻咨询分流', '1.8 d', '求助 +46%'],
      ['学院心中心联动', '88.5%', '脱落 -34%'],
      ['传统线下排号制', '9.4 d', '病耻拒访'],
    ],
    footnote: '参考模板样例数据 · 适配青少年心理健康、高校育人与服务可达性研究',
  },
  zerowaste_circular_community: {
    domainBadge: '无废社区 · 两网融合',
    subtitle: '源头分拣纯度、再生资源回收与居民碳积分激励',
    waffleRatio: 8,
    waffleLabel: '分类达标 8/10',
    kpis: [
      { label: '可回收分拣纯度', value: '88.6%' },
      { label: '户均年碳积分', value: '42.5 kg' },
      { label: '源头厨余减量', value: '-31.4%' },
    ],
    bars: [
      ['智能回收箱两网融合', 90],
      ['碳积分兑换商超激励', 84],
      ['物业督导精准破袋', 73],
    ],
    rows: [
      ['两网融合智能箱', '88.6% 纯', '减量 -31%'],
      ['碳普惠积分返现', '69.4% 参', '复投 +42%'],
      ['传统混合投放点', '46.2% 纯', '分拣成本高'],
    ],
    footnote: '参考模板样例数据 · 适配垃圾分类治理、绿色社区与双碳普惠调研',
  },
  rural_coldchain_precool: {
    domainBadge: '田头预冷 · 冷链降损',
    subtitle: '采后预冷断链损耗拆解、移动共享冷库与冷链直发',
    waffleRatio: 7,
    waffleLabel: '温控闭环 7/10',
    kpis: [
      { label: '最先一公里损耗', value: '18.6%' },
      { label: '共享预冷降损率', value: '-54.2%' },
      { label: '农户冷库租用费', value: '0.18 元' },
    ],
    bars: [
      ['田头移动预冷站', 89],
      ['合作社共享冷库', 81],
      ['常温待运热损伤', 68],
    ],
    rows: [
      ['田头共享预冷车', '5.8% 损', '保鲜 +12d'],
      ['镇级集配冷库群', '9.4% 损', '溢价 +22%'],
      ['常温收购直装车', '18.6% 损', '断链腐损高'],
    ],
    footnote: '参考模板样例数据 · 适配农产品冷链物流、县域流通与三农增收调研',
  },
  smart_port_customs: {
    domainBadge: '智慧港口 · 多式联运',
    subtitle: '无纸化秒放行、远控岸桥作业与海铁集疏运时效',
    waffleRatio: 9,
    waffleLabel: '无纸通关 9/10',
    kpis: [
      { label: '平均泊位停时', value: '11.4 h' },
      { label: '无纸化放行率', value: '96.8%' },
      { label: '海铁联运占比', value: '28.5%' },
    ],
    bars: [
      ['单一窗口预申报', 95],
      ['自动化远控岸桥', 88],
      ['海铁直装集疏运', 79],
    ],
    rows: [
      ['船边直提无纸放', '11.4 h', '周转 +38%'],
      ['海铁专列直联', '28.5%', '减排 -44%'],
      ['传统人工审查验', '26.8 h', '压港滞箱高'],
    ],
    footnote: '参考模板样例数据 · 适配港口航运、跨境贸易口岸效率与物流调研',
  },
  raredisease_multitier_ins: {
    domainBadge: '罕见病 · 三重共付',
    subtitle: '基本医保兜底、惠民保二次报销与慈善赠药减负',
    waffleRatio: 7,
    waffleLabel: '可负担性 7/10',
    kpis: [
      { label: '患者自付降幅', value: '-68.5%' },
      { label: '惠民保衔接率', value: '74.8%' },
      { label: '灾难性支出降', value: '-49.2%' },
    ],
    bars: [
      ['基本医保目录报销', 91],
      ['城市定制型惠民保', 83],
      ['慈善赠药PAP援助', 76],
    ],
    rows: [
      ['三重梯次共付后', '21.5% 付', '降负 68.5%'],
      ['仅医保与自筹', '48.6% 付', '超支风险高'],
      ['未参保纯自费', '100% 付', '停药率 64%'],
    ],
    footnote: '参考模板样例数据 · 适配多层次医疗保障、罕见病用药与民生兜底研究',
  },
  ai_vocational_reskilling: {
    domainBadge: '技能转型 · 培训券',
    subtitle: '技能培训券核销、人机协同转岗周期与薪资恢复',
    waffleRatio: 7,
    waffleLabel: '人岗重配 7/10',
    kpis: [
      { label: '培训券核销转化', value: '78.4%' },
      { label: '半年薪资恢复比', value: '94.6%' },
      { label: '转岗空窗期缩短', value: '-4.2 wk' },
    ],
    bars: [
      ['数智工具实操认证', 90],
      ['培训券带薪脱产补贴', 84],
      ['跨岗推荐对接成功率', 75],
    ],
    rows: [
      ['培训券订单转岗', '94.6% 薪', '空窗 -4.2w'],
      ['自主碎片化网课', '71.2% 薪', '完课率 34%'],
      ['无补贴裸辞试错', '63.8% 薪', '技能折旧快'],
    ],
    footnote: '参考模板样例数据 · 适配岗位数智转型、终身职业培训与劳动力政策',
  },
  natpark_wildlife_coexist: {
    domainBadge: '国家公园 · 人兽共生',
    subtitle: '生态公益岗位补偿、野生动物肇事保险与特许经营',
    waffleRatio: 8,
    waffleLabel: '社区共赢 8/10',
    kpis: [
      { label: '肇事保险赔付率', value: '92.4%' },
      { label: '特许经营户增收', value: '+34.6%' },
      { label: '报复猎捕降幅', value: '-76.0%' },
    ],
    bars: [
      ['野生动物肇事险兜底', 91],
      ['生态管护员优先聘用', 86],
      ['自然研学特许经营权', 78],
    ],
    rows: [
      ['商业险生态管护', '92.4% 赔', '冲突 -76%'],
      ['生态导赏特许营', '+34.6% 收', '护林意愿高'],
      ['事后单一救济', '31.5% 补', '时滞争议大'],
    ],
    footnote: '参考模板样例数据 · 适配国家公园治理、生态补偿与乡村振兴耦合调研',
  },
  instant_retail_darkstore: {
    domainBadge: '即时零售 · 闪电仓',
    subtitle: '前置仓 3km 履约密度、波峰骑手调度与冷热品损耗',
    waffleRatio: 9,
    waffleLabel: '30分达标 9/10',
    kpis: [
      { label: '30分钟履约率', value: '93.6%' },
      { label: '骑手均摊单距', value: '1.8 km' },
      { label: '生鲜热品损耗', value: '3.4%' },
    ],
    bars: [
      ['前置仓网格覆盖率', 94],
      ['波峰动态派单准点', 88],
      ['冷热分装温控保鲜', 82],
    ],
    rows: [
      ['前置闪仓3km圈', '24.5 m', '损耗 3.4%'],
      ['中心大仓调拨达', '52.0 m', '超时 +19%'],
      ['夜间弹性激励池', '91.2%', '运力 +34%'],
    ],
    footnote: '参考模板样例数据 · 适配即时零售前置仓布局与末端履约调研',
  },
  silver_home_telehealth: {
    domainBadge: '银发智守 · 居家监护',
    subtitle: '可穿戴体征监测、异常体征秒级预警与社区医护闭环',
    waffleRatio: 9,
    waffleLabel: '闭环响应 9/10',
    kpis: [
      { label: '异常预警秒响应', value: '18 s' },
      { label: '社区医护接警', value: '4.2 m' },
      { label: '独居长者留存', value: '86.5%' },
    ],
    bars: [
      ['跌倒心率秒级识警', 93],
      ['社区驿站医护上门', 86],
      ['子女端同步告警率', 91],
    ],
    rows: [
      ['腕表智能监测闭环', '18 s 警', '送医快 40m'],
      ['社区医护网格联', '4.2 m', '复测率 87%'],
      ['传统电话被动访', '滞后响应', '漏报率 38%'],
    ],
    footnote: '参考模板样例数据 · 适配银发居家监测与社区智慧养老协防调研',
  },
  retail_cohort_frequency: {
    domainBadge: '客群画像 · 频次结构',
    subtitle: '青年白领、家庭刚需与夜间补给客群下单频次对比',
    waffleRatio: 8,
    waffleLabel: '高频复购 8/10',
    kpis: [
      { label: '周均下单频次', value: '3.4 次' },
      { label: '夜间补给客单', value: '68.5 元' },
      { label: 'Z世代渗透占比', value: '54.2%' },
    ],
    bars: [
      ['职场白领高频日配', 89],
      ['家庭急需生鲜补买', 83],
      ['22点后夜间急送单', 72],
    ],
    rows: [
      ['高粘性高频客群', '4.8 次/w', '客单 74 元'],
      ['夜间应急补给组', '2.3 次/w', '毛利 +16%'],
      ['价格敏感偶发客', '0.7 次/w', '补贴敏感高'],
    ],
    footnote: '参考模板样例数据 · 适配第 4 章即时零售客群构成与频次画像',
  },
  silver_caregiver_dyad: {
    domainBadge: '双主体 · 照护画像',
    subtitle: '失能长者与配偶子女双视角负担、支付意愿与适老障碍',
    waffleRatio: 7,
    waffleLabel: '双端协同 7/10',
    kpis: [
      { label: '配偶子女协同率', value: '71.8%' },
      { label: '月均支付意愿', value: '1,480 元' },
      { label: '适老交互障碍率', value: '38.4%' },
    ],
    bars: [
      ['界面字小误触痛点', 87],
      ['夜间照护精力过载', 84],
      ['长护险共付接受度', 79],
    ],
    rows: [
      ['高龄失能长者组', '障碍 46%', '需语音大字'],
      ['在职子女照护方', '2.8 h/日', '愿付 1,480'],
      ['社区喘息服务补', '负担 -39%', '满意 +0.84'],
    ],
    footnote: '参考模板样例数据 · 适配长者-照护者双主体配对与适老障碍调研',
  },
  retail_30d_pilot_action: {
    domainBadge: '30天试点 · 协同路径',
    subtitle: '痛点诊断、政企骑手协防、30天损耗压降试点与推广',
    waffleRatio: 8,
    waffleLabel: '试点达成 8/10',
    kpis: [
      { label: '试点损耗降幅', value: '-41.5%' },
      { label: '骑手准点提升', value: '+12.4%' },
      { label: '闭环试点周期', value: '30 d' },
    ],
    bars: [
      ['前7天冷链动线重排', 91],
      ['15天骑手驿站补给', 86],
      ['30天损耗复盘推广', 82],
    ],
    rows: [
      ['D1–D7 仓内溯源', '损耗 -18%', '锁定断链点'],
      ['D8–D21 政企协防', '超时 -36%', '开绿色通道'],
      ['D22–D30 复测推', '净效 +24%', '标准化推广'],
    ],
    footnote: '参考模板样例数据 · 适配第 9 章即时零售协同治理 30 天试点路径',
  },
  silver_community_grid_action: {
    domainBadge: '网格协同 · 治理举措',
    subtitle: '社区网格吹哨、医联体分诊与家属端闭环 30 天治理',
    waffleRatio: 9,
    waffleLabel: '联动闭环 9/10',
    kpis: [
      { label: '网格响应达标率', value: '92.8%' },
      { label: '医联体绿色转诊', value: '12 min' },
      { label: '试点户均降险', value: '-48.0%' },
    ],
    bars: [
      ['网格员入户建档排查', 94],
      ['医联体远程分级处置', 89],
      ['家属端亲情实时反馈', 85],
    ],
    rows: [
      ['L1 社区网格吹哨', '3 min 到', '高频日覆盖'],
      ['L2 医联体云接诊', '12 m 判', '慢病直转诊'],
      ['L3 家属端闭环核', '92.8%', '长效留存稳'],
    ],
    footnote: '参考模板样例数据 · 适配社区嵌入式银发治理与医联体协同路径',
  },
  four_segment_precision_policy: {
    domainBadge: '四分群 · 精准施策',
    subtitle: 'K-Means/LCA 四分群特征画像与差异化精准抓手矩阵',
    waffleRatio: 8,
    waffleLabel: '分群覆盖 8/10',
    kpis: [
      { label: '聚类轮廓系数', value: '0.64' },
      { label: '高潜转化增益', value: '+29.4%' },
      { label: '四分群总覆盖', value: '100%' },
    ],
    bars: [
      ['数字原住民(34%)', 90],
      ['价格敏感型(28%)', 83],
      ['银发依赖型(21%)', 77],
    ],
    rows: [
      ['数字原住民 34%', '高频尝鲜', '智能推荐提'],
      ['价格敏感型 28%', '补贴弹性', '阶梯券转化'],
      ['银发/观望 38%', '信任门槛', '极简适老版'],
    ],
    footnote: '参考模板样例数据 · 适配 K-Means/LCA 聚类细分与精准施策总结',
  },
  regional_respondent_portrait: {
    domainBadge: '地域画像 · 田野锚点',
    subtitle: '地域风物嵌入、区县梯度抽样与方言/数字鸿沟校准',
    waffleRatio: 8,
    waffleLabel: '样本代表 8/10',
    kpis: [
      { label: '区县梯度覆盖', value: '12 区县' },
      { label: '方言适老访谈比', value: '42.6%' },
      { label: '城乡结构偏差', value: '< 2.1%' },
    ],
    bars: [
      ['中心城区核心样本', 92],
      ['近郊县域产业带样', 85],
      ['远郊乡土田野访谈', 78],
    ],
    rows: [
      ['核心城区样本群', '46.2%', '素养分 4.3'],
      ['县域城镇过渡群', '31.5%', '方言助答38%'],
      ['偏远乡土锚点群', '22.3%', '入户面访稳'],
    ],
    footnote: '参考模板样例数据 · 适配地方文化嵌入与省市县抽样代表性校准',
  },
  grid_v2g_peak_shaving: {
    domainBadge: '车网互动 · V2G削峰',
    subtitle: '虚拟电厂聚合调峰、车主放电补贴与电池顾虑权衡',
    waffleRatio: 8,
    waffleLabel: '响应意愿 8/10',
    kpis: [
      { label: '晚峰削减潜力', value: '22.8%' },
      { label: '放电补贴阈值', value: '1.65 元' },
      { label: '年均V2G净收益', value: '2,460 元' },
    ],
    bars: [
      ['电价差补贴激励弹性', 91],
      ['电池质保延保消虑', 87],
      ['双向桩社区安装渗透', 76],
    ],
    rows: [
      ['1.6元度+延保', '78.4% 愿', '晚峰荷 -23%'],
      ['仅分时价差引导', '49.2% 愿', '顾虑电池衰'],
      ['无双向桩基线组', '14.5% 愿', '硬设施缺口'],
    ],
    footnote: '参考模板样例数据 · 适配车网互动 V2G、虚拟电厂与新型电力调研',
  },
  rural_express_co_delivery: {
    domainBadge: '客货邮 · 统仓共配',
    subtitle: '县乡村三级客货邮融合、统仓共配降本与驻村覆盖',
    waffleRatio: 8,
    waffleLabel: '行政村达 8/10',
    kpis: [
      { label: '单票进村降本', value: '-34.2%' },
      { label: '驻村站点覆盖', value: '91.6%' },
      { label: '农品上行提速', value: '+46.0%' },
    ],
    bars: [
      ['县级统仓共配分拣', 92],
      ['城乡公交客货邮捎带', 85],
      ['村级综合服务自提站', 88],
    ],
    rows: [
      ['统仓共配+客货邮', '0.78 元', '进村次日达'],
      ['多品牌分散自派', '1.19 元', '二次收费高'],
      ['农产品冷链捎带', '上行 +46%', '空载降 38%'],
    ],
    footnote: '参考模板样例数据 · 适配县乡村三级物流共配与乡村振兴流通调研',
  },
  youth_night_school_public: {
    domainBadge: '青年夜校 · 文化供给',
    subtitle: '错峰空间复用、非遗美育报名溢价与同城社交解压',
    waffleRatio: 9,
    waffleLabel: '满班复学 9/10',
    kpis: [
      { label: '首轮报名满班率', value: '94.8%' },
      { label: '合理单课接受价', value: '48.5 元' },
      { label: '15分通勤可达', value: '78.2%' },
    ],
    bars: [
      ['非遗手作与美育体验', 93],
      ['数智办公与技能夜修', 87],
      ['同城轻量社交解压感', 84],
    ],
    rows: [
      ['文化馆错峰复用', '45 元/节', '满班 94.8%'],
      ['商圈楼宇嵌入式', '58 元/节', '通勤降 62%'],
      ['商业高价兴趣班', '198 元/节', '价格劝退高'],
    ],
    footnote: '参考模板样例数据 · 适配公共文化空间错峰活化与青年夜校需求调研',
  },
  drg_clinical_pathway_cost: {
    domainBadge: '公立医院 · DRG控费',
    subtitle: 'DRG/DIP 病组控费、药耗比优化与临床质量均衡实证',
    waffleRatio: 8,
    waffleLabel: '质费均衡 8/10',
    kpis: [
      { label: '次均住院费降幅', value: '-14.6%' },
      { label: '平均住院日缩短', value: '6.8 d' },
      { label: '30天非计划再入', value: '1.9%' },
    ],
    bars: [
      ['临床路径标准化率', 91],
      ['药耗占比结构压降', 86],
      ['患者就医体验稳态', 88],
    ],
    rows: [
      ['DRG路径+绩效', '-14.6% 费', '再入院 1.9%'],
      ['单病种定额试点', '-8.2% 费', '耗材仍偏高'],
      ['传统按项目付费', '基线高位', '住院 9.1 天'],
    ],
    footnote: '参考模板样例数据 · 适配公立医院 DRG/DIP 支付改革与绩效评估',
  },
  semiconductor_fab_yield: {
    domainBadge: '集成电路 · 国产EDA',
    subtitle: '成熟制程良率爬坡、国产 EDA 工具链耦合与备品替代韧性',
    waffleRatio: 8,
    waffleLabel: '良率稳态 8/10',
    kpis: [
      { label: '28nm 稳定良率', value: '94.2%' },
      { label: '国产EDA替换率', value: '63.5%' },
      { label: '关键备件交期', value: '-31.0%' },
    ],
    bars: [
      ['版图验证仿真全流程', 91],
      ['光刻工艺窗口冗余度', 85],
      ['特气靶材本地双备份', 82],
    ],
    rows: [
      ['国产EDA+PDK协同', '94.2%', '流片周期 -24%'],
      ['单点工具混跑过渡', '87.6%', '接口校验耗时'],
      ['境外单源备件依赖', '基线风险', '断供停线 42d'],
    ],
    footnote: '参考模板样例数据 · 适配半导体晶圆厂调研与国产 EDA 供应链韧性评估',
  },
  ocean_blue_carbon_ranch: {
    domainBadge: '海洋牧场 · 蓝碳交易',
    subtitle: '深远海贝藻立体固碳、红树林碳汇核证与渔民增收实证',
    waffleRatio: 8,
    waffleLabel: '碳汇核证 8/10',
    kpis: [
      { label: '年固碳量增幅', value: '+38.6%' },
      { label: '蓝碳均价溢价', value: '96.4 元' },
      { label: '渔户年均增收', value: '1.84 万' },
    ],
    bars: [
      ['红树林潮间带碳汇', 92],
      ['贝藻立体养殖固碳', 86],
      ['蓝碳质押绿色信贷', 78],
    ],
    rows: [
      ['红树林+贝藻混养', '14.6 t/ha', '碳汇核证 +39%'],
      ['单一网箱传统养殖', '3.8 t/ha', '富营养风险高'],
      ['蓝碳汇入省交易池', '96.4 元/t', '渔民分红 +22%'],
    ],
    footnote: '参考模板样例数据 · 适配海洋生态牧场、红树林修复与蓝碳交易调研',
  },
  embodied_humanoid_factory: {
    domainBadge: '具身智能 · 产线协同',
    subtitle: '人形机器人高危工位替代、人机协同节拍与技工角色重塑',
    waffleRatio: 8,
    waffleLabel: '人机协同 8/10',
    kpis: [
      { label: '产线节拍提升', value: '+26.8%' },
      { label: '高危工伤降幅', value: '-71.4%' },
      { label: '技工转岗留任', value: '88.5%' },
    ],
    bars: [
      ['重体力搬运工位替代', 93],
      ['多模态质检协同效率', 87],
      ['工人运维微技能适配', 81],
    ],
    rows: [
      ['人机混线+示教运维', '+26.8%', '工伤降 71.4%'],
      ['纯机械臂刚性产线', '+14.2%', '换产柔度偏低'],
      ['传统纯人工装配线', '基线节拍', '腰肌劳损率高'],
    ],
    footnote: '参考模板样例数据 · 适配具身智能制造落地与一线产业工人转型调研',
  },
  county_rural_canteen_elder: {
    domainBadge: '农村助餐 · 互助养老',
    subtitle: '幸福院日间照料、邻里低偿送餐与村集体造血可持续测算',
    waffleRatio: 8,
    waffleLabel: '运营收支 8/10',
    kpis: [
      { label: '一餐自付均价', value: '4.5 元' },
      { label: '送餐覆盖村庄', value: '86.4%' },
      { label: '财政补贴依赖', value: '-32.0%' },
    ],
    bars: [
      ['高龄独居热食保障', 94],
      ['低龄老人互助积分', 85],
      ['村集体微菜园自供', 79],
    ],
    rows: [
      ['幸福院+微菜园造血', '4.5 元/餐', '收支平衡 88%'],
      ['纯财政兜底食堂', '3.0 元/餐', '财政续补承压'],
      ['社会化志愿配餐点', '6.2 元/餐', '送达 18 min'],
    ],
    footnote: '参考模板样例数据 · 适配县域农村互助养老与长者食堂可持续运营研究',
  },
  urban_flood_sponge_grid: {
    domainBadge: '海绵城市 · 内涝避险',
    subtitle: '透水下凹绿地蓄滞、积水点智能哨兵与 5 分钟紧急避险响应',
    waffleRatio: 9,
    waffleLabel: '避险达标 9/10',
    kpis: [
      { label: '5分钟避险覆盖', value: '91.8%' },
      { label: '积水退水提速', value: '-46.5%' },
      { label: '预警提前时长', value: '38 min' },
    ],
    bars: [
      ['下凹绿地雨水花园', 91],
      ['立交桥电子水尺预警', 89],
      ['社区应急避险点导引', 84],
    ],
    rows: [
      ['海绵蓄滞+智能预警', '38 min 先', '内涝时长 -47%'],
      ['仅管网清淤改造', '12 min 先', '极值降雨溢流'],
      ['传统老旧排水片区', '滞后被动', '积水超 45 cm'],
    ],
    footnote: '参考模板样例数据 · 适配极端天气韧性城市、海绵改造与应急避险评估',
  },
  agri_seed_nanfan_breeding: {
    domainBadge: '生物育种 · 南繁硅谷',
    subtitle: '南繁加代缩短育种周期、耐盐碱良种采纳与农户亩产增益',
    waffleRatio: 9,
    waffleLabel: '良种推广 9/10',
    kpis: [
      { label: '盐碱地亩产增', value: '+18.4%' },
      { label: '育种周期缩短', value: '-42.0%' },
      { label: '种业农户采纳', value: '82.6%' },
    ],
    bars: [
      ['分子标记辅助筛选', 93],
      ['重度盐碱试种稳产', 87],
      ['农技特派田间指导', 81],
    ],
    rows: [
      ['南繁分子耐盐稻种', '548 kg/亩', '增产 +18.4%'],
      ['常规改良杂交稻种', '486 kg/亩', '耐盐度中低'],
      ['普通地方对照品种', '463 kg/亩', '盐害减产风险'],
    ],
    footnote: '参考模板样例数据 · 适配生物育种、南繁种业安全与盐碱地综合利用调研',
  },
  youth_flexible_gig_social: {
    domainBadge: '新业态 · 弹性参保',
    subtitle: '外卖/网约骑手按单计费职业伤害险、断保痛点与异地接续',
    waffleRatio: 8,
    waffleLabel: '参保覆盖 8/10',
    kpis: [
      { label: '按单参保覆盖', value: '91.2%' },
      { label: '理赔到账时效', value: '4.6 d' },
      { label: '养老续保意愿', value: '68.4%' },
    ],
    bars: [
      ['平台按单代扣职伤险', 94],
      ['无户籍门槛弹性医保', 84],
      ['跨平台工龄积分通认', 76],
    ],
    rows: [
      ['按单职伤+弹性医保', '91.2%', '意外兜底稳'],
      ['全额灵活就业参保', '34.5%', '月缴费压力高'],
      ['未参保纯商业意外', '风险敞口', '赔付门槛严'],
    ],
    footnote: '参考模板样例数据 · 适配外卖骑手、网约司机等新就业群体社保调研',
  },
  cross_province_medical_settle: {
    domainBadge: '跨省医保 · 直接结算',
    subtitle: '线上备案免跑腿、跨省联网刷卡垫资降幅与大病基层康复衔接',
    waffleRatio: 9,
    waffleLabel: '联网直结 9/10',
    kpis: [
      { label: '住院直结率', value: '92.4%' },
      { label: '家庭垫资降幅', value: '-76.5%' },
      { label: '线上备案时长', value: '3.2 min' },
    ],
    bars: [
      ['住院跨省联网免垫资', 93],
      ['门诊慢特病直接结算', 84],
      ['医保码自助线上备案', 89],
    ],
    rows: [
      ['线上备案+跨省直结', '92.4%', '垫资降 76.5%'],
      ['省内异地联网结算', '96.8%', '报销同比例'],
      ['传统人工回乡报销', '垫资 45 d', '交通材料繁'],
    ],
    footnote: '参考模板样例数据 · 适配跨省异地就医医保直接结算与随迁老人就医调研',
  },
  cbam_green_export_compliance: {
    domainBadge: '碳关税 · 绿电溯源',
    subtitle: '出口产品隐含碳核算、绿电直供溯源与 CBAM 税负压降',
    waffleRatio: 8,
    waffleLabel: '溯源合标 8/10',
    kpis: [
      { label: 'CBAM税负降幅', value: '-38.4%' },
      { label: '绿电直供占比', value: '64.2%' },
      { label: '全工序碳排降', value: '-41.6%' },
    ],
    bars: [
      ['园区绿电直供溯源', 91],
      ['铝钢上游绿料替代', 84],
      ['数字碳账本核证率', 79],
    ],
    rows: [
      ['绿电直供+数字盘查', '-38.4% 税', '核证周期 5d'],
      ['仅购绿证GEC抵扣', '-14.2% 税', '欧盟认受受限'],
      ['传统灰电出口基线', '全额征缴', '利润压缩 9%'],
    ],
    footnote: '参考模板样例数据 · 适配欧盟 CBAM 碳关税应对与外贸绿色转型调研',
  },
  silver_ltci_home_care: {
    domainBadge: '长护险 · 居家辅具',
    subtitle: '失能等级评估、居家专业照护工时与辅具租赁响应实证',
    waffleRatio: 8,
    waffleLabel: '护理兑现 8/10',
    kpis: [
      { label: '辅具租赁响应', value: '24 h' },
      { label: '居家自付降幅', value: '-62.5%' },
      { label: '家属喘息时长', value: '+14.8 h' },
    ],
    bars: [
      ['重度失能上门护理', 93],
      ['护理床防褥疮辅具', 86],
      ['失能等级复评便利', 78],
    ],
    rows: [
      ['居家照护+辅具租赁', '24 h 达', '自付降 62.5%'],
      ['纯机构托养照护组', '床位紧缺', '月均支 5,400'],
      ['未参保纯家庭兜底', '零补贴支', '照护倦怠高'],
    ],
    footnote: '参考模板样例数据 · 适配长期护理保险制度试点与居家适老辅具调研',
  },
  smart_grid_micro_storage: {
    domainBadge: '微电网 · 光储充',
    subtitle: '分布式光伏自发自用、储能峰谷套利与变压器需量压降',
    waffleRatio: 9,
    waffleLabel: '绿电消纳 9/10',
    kpis: [
      { label: '峰值需量压降', value: '-26.4%' },
      { label: '光伏就地消纳', value: '91.8%' },
      { label: '储能套利IRR', value: '14.6%' },
    ],
    bars: [
      ['两充两放峰谷套利', 92],
      ['需量管理防超容罚', 87],
      ['直流微网光储直柔', 81],
    ],
    rows: [
      ['光储充+需量智控', '91.8% 消', '电费降 24.5%'],
      ['纯光伏无储能直并', '63.4% 消', '午间弃光明显'],
      ['传统市电直供园区', '基线高位', '尖峰罚费多'],
    ],
    footnote: '参考模板样例数据 · 适配零碳产业园区、光储充一体化与电力需求响应',
  },
  rural_ecomm_live_cluster: {
    domainBadge: '县域农品 · 云仓协同',
    subtitle: '地标农产品直播选品标准、一物一码溯源与云仓统发履约',
    waffleRatio: 8,
    waffleLabel: '品控合格 8/10',
    kpis: [
      { label: '地标溢价增收', value: '+28.6%' },
      { label: '坏果退赔降幅', value: '-56.4%' },
      { label: '云仓集单降费', value: '-31.0%' },
    ],
    bars: [
      ['果径糖度分级标准', 92],
      ['产地一物一码溯源', 86],
      ['云仓统配冷链直发', 84],
    ],
    rows: [
      ['分级选品+云仓统发', '退赔 2.1%', '溢价 +28.6%'],
      ['主播散户各自发货', '退赔 8.4%', '物流高 31%'],
      ['传统批发中间收购', '渠道折价', '品牌感知弱'],
    ],
    footnote: '参考模板样例数据 · 适配县域数字乡村、直播助农产业带与地理标志品牌',
  },
  autonomous_robotaxi_trust: {
    domainBadge: '自动驾驶 · 人机信任',
    subtitle: '无人出租复杂路况接管焦虑、透明人机交互屏与复乘意愿',
    waffleRatio: 7,
    waffleLabel: '复乘信任 7/10',
    kpis: [
      { label: '首次试乘转化', value: '68.4%' },
      { label: '交互透明降焦虑', value: '-43.2%' },
      { label: '夜雨复乘保留', value: '74.8%' },
    ],
    bars: [
      ['车内轨迹透明屏提示', 91],
      ['远程安全员一键接管', 88],
      ['施工路段平稳避让度', 79],
    ],
    rows: [
      ['透明HMI+远程兜底', '74.8% 复乘', '焦虑分 2.14'],
      ['纯黑箱无语音播报', '41.5% 复乘', '焦虑分 3.86'],
      ['限域高频通勤试点', '82.6% 愿', '价格折让敏感'],
    ],
    footnote: '参考模板样例数据 · 适配智慧出行、L4 级自动驾驶商业化信任与采纳调研',
  },
  hospital_ai_triage_safety: {
    domainBadge: '智慧急诊 · 复核闭环',
    subtitle: '智能急诊预检分级、医生人工双签纠偏与患者安全感容错',
    waffleRatio: 9,
    waffleLabel: '分诊一致 9/10',
    kpis: [
      { label: '分诊一致准确率', value: '93.4%' },
      { label: '急诊候诊耗时', value: '-44.8%' },
      { label: '双签后患者信任', value: '89.2%' },
    ],
    bars: [
      ['急诊医生双签复核', 95],
      ['红区危重零漏诊兜底', 92],
      ['主诉语音多模态采集', 84],
    ],
    rows: [
      ['智能初筛+医生双签', '93.4% 准', '信任 89.2%'],
      ['无人工复核自动分', '86.1% 准', '误判容错低'],
      ['传统人工台前分诊', '88.5% 准', '高峰排队长'],
    ],
    footnote: '参考模板样例数据 · 适配临床智能辅助决策、医患信任与医疗安全调研',
  },
  quantum_computing_supply_chain: {
    domainBadge: '量子计算 · 测控国产',
    subtitle: '稀释制冷机国产化、测控机柜脉冲保真度与量子算力云接入',
    waffleRatio: 8,
    waffleLabel: '测控自研 8/10',
    kpis: [
      { label: '测控国产替代率', value: '74.6%' },
      { label: '单比特门保真度', value: '99.92%' },
      { label: '云算力接入降本', value: '-41.8%' },
    ],
    bars: [
      ['国产AWG脉冲同步', 93],
      ['10mK稀释制冷稳态', 86],
      ['量子云异构调度口', 82],
    ],
    rows: [
      ['全栈国产测控云', '99.92%', '成本降 41.8%'],
      ['进口混拼机柜组', '99.85%', '备件交期 18w'],
      ['离线单机实验室', '排队 14d', '算力利用偏低'],
    ],
    footnote: '参考模板样例数据 · 适配量子计算产业链、科研仪器国产替代与算力云调研',
  },
  green_hydrogen_port_corridor: {
    domainBadge: '绿氢走廊 · 港口加注',
    subtitle: '深远海风电直供电解槽、绿氨绿醇储运与远洋船用加注经济性',
    waffleRatio: 8,
    waffleLabel: '走廊贯通 8/10',
    kpis: [
      { label: '绿醇加注平价差', value: '-22.4%' },
      { label: '全链航运减碳率', value: '84.6%' },
      { label: '槽群绿电直供比', value: '78.5%' },
    ],
    bars: [
      ['风电直供电解制氢', 92],
      ['港区低温绿氨周转', 85],
      ['船对船同步加注率', 81],
    ],
    rows: [
      ['风氢直供+船加注', '-84.6% 碳', 'LCOH 17.8元'],
      ['岸电并网离岸制', '-56.2% 碳', '过网费推高本'],
      ['传统船用重油线', '全额碳税', 'IMO罚则递增'],
    ],
    footnote: '参考模板样例数据 · 适配绿色航运走廊、氢氨醇加注港与新能源基础设施调研',
  },
  smart_rail_transit_tod: {
    domainBadge: '市域快轨 · TOD站城',
    subtitle: '四网融合同台换乘、站城地上地下复合开发与通勤分担率实证',
    waffleRatio: 9,
    waffleLabel: '站城协同 9/10',
    kpis: [
      { label: '跨线换乘步行时', value: '3.4 min' },
      { label: '轨交通勤分担率', value: '66.8%' },
      { label: '500m圈活力提升', value: '+34.2%' },
    ],
    bars: [
      ['快慢越行同台换乘', 94],
      ['地下商业公服连通', 88],
      ['风雨廊与P+R接驳', 83],
    ],
    rows: [
      ['立体TOD+同台换', '3.4 min', '分担率 66.8%'],
      ['常规地下通道换', '7.8 min', '换乘瓶颈明显'],
      ['站城割裂孤立站', '12.5 min', '接驳失流 41%'],
    ],
    footnote: '参考模板样例数据 · 适配都市圈市域快轨、TOD 站城一体与公共交通评价',
  },
  digital_renminbi_crossborder: {
    domainBadge: '数币跨境 · mBridge',
    subtitle: '多边央行货币桥点对点 PvP 原子结算、代理行省去与外贸降费意愿',
    waffleRatio: 8,
    waffleLabel: '合规直清 8/10',
    kpis: [
      { label: '跨境清算时延', value: '8.5 s' },
      { label: '汇兑手续费降幅', value: '-52.4%' },
      { label: '外贸企采纳意愿', value: '76.8%' },
    ],
    bars: [
      ['PvP原子结算省代理', 94],
      ['智能合约退税秒审', 87],
      ['外贸多币种对冲窗', 81],
    ],
    rows: [
      ['mBridge桥直清', '8.5 s', '费率降 52.4%'],
      ['CIPS+双边本币', '2.4 h', '费率降 26.0%'],
      ['传统多级SWIFT', '2.8 d', '中间行扣费高'],
    ],
    footnote: '参考模板样例数据 · 适配数字人民币国际化、mBridge 货币桥与外贸金融调研',
  },
  precision_oncology_companion: {
    domainBadge: '肿瘤伴随 · 医保共付',
    subtitle: '多基因 NGS 伴随检测降费、药诊联动医保共付与地市县渗透均衡',
    waffleRatio: 8,
    waffleLabel: '基层可达 8/10',
    kpis: [
      { label: '地市基层送检率', value: '69.4%' },
      { label: '患者检测自付降', value: '-58.2%' },
      { label: '靶向首诊匹配率', value: '86.5%' },
    ],
    bars: [
      ['药诊捆绑医保共付', 93],
      ['县域冷链中央送检', 87],
      ['远程MDT报告解读', 82],
    ],
    rows: [
      ['医保共付+县域检', '69.4% 检', '自付降 58.2%'],
      ['惠民保特药附加险', '44.8% 检', '限定癌种报销'],
      ['纯自费外送商业检', '21.6% 检', '均费 6,800元'],
    ],
    footnote: '参考模板样例数据 · 适配精准肿瘤诊疗、伴随诊断医保支付与基层可及性调研',
  },
  rural_water_conservancy_twin: {
    domainBadge: '数字孪生 · 灌区节水',
    subtitle: '墒情卫星遥感耦合孪生调度、智能闸门按需放水与水权节水奖补',
    waffleRatio: 9,
    waffleLabel: '精准配水 9/10',
    kpis: [
      { label: '渠系输水利用率', value: '0.684' },
      { label: '亩均灌溉节水率', value: '-29.6%' },
      { label: '农户节水净回报', value: '+24.8%' },
    ],
    bars: [
      ['太阳能闸门控流', 93],
      ['孪生墒情动态配水', 89],
      ['水权节水阶梯奖补', 84],
    ],
    rows: [
      ['孪生配水+智能闸', '218方/亩', '增效 +24.8%'],
      ['人工量水定额轮灌', '274方/亩', '尾水损耗偏高'],
      ['传统大水漫灌基线', '310方/亩', '水费负担偏重'],
    ],
    footnote: '参考模板样例数据 · 适配数字孪生灌区、农业水价改革与智慧水利三农调研',
  },
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/gu, ch => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return ch;
    }
  });
}

function visualWidthUnits(text: string): number {
  let units = 0;
  for (const ch of text) {
    units += ch.charCodeAt(0) > 127 ? 1 : 0.56;
  }
  return units;
}

function fitFontSize(text: string, maxWidthPx: number, basePx: number, minPx: number): number {
  const units = visualWidthUnits(text.trim());
  if (units <= 0) return basePx;
  const needed = maxWidthPx / units;
  return Math.max(minPx, Math.min(basePx, Math.floor(needed * 10) / 10));
}

function renderZoneGlyph(archetype: BentoInfographicArchetype, c: ResolvedInk): string {
  // Region: x=196..346, y=42..118 (150x76 box, inner graphic area x=204..338, y=58..112)
  switch (archetype) {
    case 'low_altitude_logistics':
      return (
        `<path d="M214,96 Q258,54 328,84" fill="none" stroke="${c.secondary}" stroke-width="1.5" stroke-dasharray="3 2"/>`
        + `<circle cx="214" cy="96" r="4" fill="${c.primary}"/>`
        + `<circle cx="328" cy="84" r="4.5" fill="${c.opposite}"/>`
        + `<rect x="260" y="62" width="16" height="8" rx="2.5" fill="${c.primary}"/>`
        + `<line x1="252" y1="60" x2="262" y2="60" stroke="${c.axis}" stroke-width="1.4"/>`
        + `<line x1="274" y1="60" x2="284" y2="60" stroke="${c.axis}" stroke-width="1.4"/>`
        + `<rect x="264" y="70" width="8" height="6" rx="1" fill="${c.opposite}"/>`
        + `<rect x="206" y="100" width="132" height="8" rx="2" fill="${c.primarySoft}"/>`
        + `<text x="272" y="106.5" font-family="sans-serif" font-size="5.8" text-anchor="middle" fill="${c.text}">120m 低空起降走廊 · 点对点直飞</text>`
      );
    case 'llm_rag_eval':
      return (
        `<rect x="206" y="64" width="32" height="24" rx="4" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<text x="222" y="78" font-family="sans-serif" font-size="6.2" font-weight="700" text-anchor="middle" fill="${c.primary}">检索</text>`
        + `<line x1="238" y1="76" x2="254" y2="76" stroke="${c.axis}" stroke-width="1.3"/>`
        + `<polygon points="256,63 288,63 279,89 265,89" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.2"/>`
        + `<text x="272" y="78" font-family="sans-serif" font-size="6.2" font-weight="700" text-anchor="middle" fill="${c.secondary}">重排门</text>`
        + `<line x1="285" y1="76" x2="302" y2="76" stroke="${c.axis}" stroke-width="1.3"/>`
        + `<rect x="304" y="64" width="34" height="24" rx="4" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1.2"/>`
        + `<text x="321" y="78" font-family="sans-serif" font-size="6.2" font-weight="700" text-anchor="middle" fill="${c.opposite}">验真卡</text>`
        + `<text x="272" y="104" font-family="sans-serif" font-size="5.8" text-anchor="middle" fill="${c.muted}">引文逐句锚定 → 低幻觉输出</text>`
      );
    case 'ev_charging_profile':
      return (
        `<path d="M206,96 L226,90 L248,66 L274,84 L298,94 L336,64" fill="none" stroke="${c.opposite}" stroke-width="1.8" stroke-linejoin="round"/>`
        + `<rect x="242" y="60" width="18" height="26" rx="3" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<polygon points="252,65 247,73 252,73 249,81 256,71 251,71" fill="${c.primary}"/>`
        + `<rect x="282" y="96" width="52" height="10" rx="2.5" fill="${c.secondarySoft}"/>`
        + `<text x="308" y="103" font-family="sans-serif" font-size="5.6" font-weight="700" text-anchor="middle" fill="${c.secondary}">谷段充电</text>`
        + `<text x="242" y="103" font-family="sans-serif" font-size="5.6" fill="${c.muted}">峰谷分时负荷曲线</text>`
      );
    case 'county_medical_referral':
      return (
        `<rect x="256" y="57" width="32" height="16" rx="4" fill="${c.primary}" fill-opacity="0.16" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<text x="272" y="67.5" font-family="sans-serif" font-size="6" font-weight="700" text-anchor="middle" fill="${c.primary}">县总院</text>`
        + `<line x1="264" y1="73" x2="232" y2="87" stroke="${c.secondary}" stroke-width="1.2"/>`
        + `<line x1="280" y1="73" x2="312" y2="87" stroke="${c.secondary}" stroke-width="1.2"/>`
        + `<line x1="232" y1="95" x2="312" y2="95" stroke="${c.opposite}" stroke-width="1.1" stroke-dasharray="2.5 2"/>`
        + `<rect x="208" y="87" width="46" height="15" rx="3.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1"/>`
        + `<text x="231" y="96.5" font-family="sans-serif" font-size="5.7" text-anchor="middle" fill="${c.text}">乡镇卫生院</text>`
        + `<rect x="290" y="87" width="46" height="15" rx="3.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1"/>`
        + `<text x="313" y="96.5" font-family="sans-serif" font-size="5.7" text-anchor="middle" fill="${c.text}">村医疗哨点</text>`
      );
    case 'crossborder_supply_loss':
      return (
        `<polygon points="208,61 334,61 322,74 220,74" fill="${c.primary}" fill-opacity="0.24" stroke="${c.primary}" stroke-width="1"/>`
        + `<polygon points="222,77 320,77 310,90 232,90" fill="${c.secondary}" fill-opacity="0.22" stroke="${c.secondary}" stroke-width="1"/>`
        + `<polygon points="236,93 306,93 296,106 246,106" fill="${c.opposite}" fill-opacity="0.24" stroke="${c.opposite}" stroke-width="1"/>`
        + `<text x="271" y="70" font-family="sans-serif" font-size="5.8" font-weight="700" text-anchor="middle" fill="${c.text}">产业带直发 · 100%</text>`
        + `<text x="271" y="86" font-family="sans-serif" font-size="5.8" font-weight="700" text-anchor="middle" fill="${c.text}">海外仓周转 · -3.2%</text>`
        + `<text x="271" y="102" font-family="sans-serif" font-size="5.8" font-weight="700" text-anchor="middle" fill="${c.text}">退货质检妥投 · 93.2%</text>`
      );
    case 'grad_skill_mismatch':
      return (
        `<polygon points="271,57 301,71 293,101 249,101 241,71" fill="none" stroke="${c.grid}" stroke-width="1"/>`
        + `<polygon points="271,64 292,74 286,95 256,95 250,74" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.3"/>`
        + `<polygon points="271,60 298,76 283,98 258,92 246,72" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1.3" stroke-dasharray="3 2"/>`
        + `<rect x="206" y="102" width="132" height="8" rx="2" fill="${c.primarySoft}"/>`
        + `<text x="272" y="108" font-family="sans-serif" font-size="5.6" text-anchor="middle" fill="${c.text}">实线:岗位需求 · 虚线:毕业生自评</text>`
      );
    case 'pocket_park_renewal':
      return (
        `<circle cx="232" cy="79" r="14" fill="${c.primary}" fill-opacity="0.22" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<circle cx="246" cy="74" r="11" fill="${c.secondary}" fill-opacity="0.24"/>`
        + `<rect x="230" y="90" width="4" height="10" fill="${c.axis}"/>`
        + `<rect x="268" y="84" width="28" height="7" rx="2" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1.2"/>`
        + `<line x1="272" y1="91" x2="272" y2="99" stroke="${c.axis}" stroke-width="1.3"/>`
        + `<line x1="292" y1="91" x2="292" y2="99" stroke="${c.axis}" stroke-width="1.3"/>`
        + `<path d="M210,104 Q272,94 334,104" fill="none" stroke="${c.primary}" stroke-width="2" stroke-linecap="round"/>`
        + `<circle cx="318" cy="70" r="5" fill="${c.opposite}"/>`
        + `<text x="272" y="64" font-family="sans-serif" font-size="5.8" text-anchor="middle" fill="${c.muted}">绿冠遮阴 + 适老扶手步道</text>`
      );
    case 'synbio_pilot_kpi':
      return (
        `<rect x="216" y="60" width="26" height="38" rx="6" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.3"/>`
        + `<rect x="220" y="75" width="18" height="19" rx="3" fill="${c.primary}" fill-opacity="0.45"/>`
        + `<circle cx="226" cy="71" r="2" fill="${c.primary}"/>`
        + `<circle cx="233" cy="68" r="1.5" fill="${c.secondary}"/>`
        + `<line x1="242" y1="79" x2="262" y2="79" stroke="${c.axis}" stroke-width="1.3"/>`
        + `<circle cx="296" cy="80" r="20" fill="none" stroke="${c.grid}" stroke-width="4.5"/>`
        + `<circle cx="296" cy="80" r="20" fill="none" stroke="${c.primary}" stroke-width="4.5" stroke-dasharray="102 28"/>`
        + `<text x="296" y="82.5" font-family="monospace" font-size="7.2" font-weight="700" text-anchor="middle" fill="${c.primary}">87.5%</text>`
        + `<text x="272" y="108" font-family="sans-serif" font-size="5.6" text-anchor="middle" fill="${c.muted}">生物反应器中试稳定收率</text>`
      );
    case 'heritage_digital_twin':
      return (
        `<polygon points="272,58 232,76 312,76" fill="${c.primary}" fill-opacity="0.18" stroke="${c.primary}" stroke-width="1.3"/>`
        + `<rect x="242" y="76" width="60" height="22" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<line x1="254" y1="76" x2="254" y2="98" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<line x1="272" y1="76" x2="272" y2="98" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<line x1="290" y1="76" x2="290" y2="98" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<circle cx="220" cy="64" r="3" fill="${c.opposite}"/>`
        + `<line x1="220" y1="64" x2="262" y2="72" stroke="${c.opposite}" stroke-width="1" stroke-dasharray="2 2"/>`
        + `<line x1="220" y1="64" x2="288" y2="82" stroke="${c.opposite}" stroke-width="1" stroke-dasharray="2 2"/>`
        + `<text x="272" y="108" font-family="sans-serif" font-size="5.6" text-anchor="middle" fill="${c.muted}">激光点云扫测 · 0.8mm 微变形哨兵</text>`
      );
    case 'smart_farmland_water':
      return (
        `<line x1="210" y1="74" x2="334" y2="74" stroke="${c.primary}" stroke-width="1.6"/>`
        + `<line x1="210" y1="88" x2="334" y2="88" stroke="${c.primary}" stroke-width="1.6"/>`
        + `<line x1="210" y1="102" x2="334" y2="102" stroke="${c.primary}" stroke-width="1.6"/>`
        + `<circle cx="232" cy="74" r="3" fill="${c.secondary}"/>`
        + `<circle cx="268" cy="74" r="3" fill="${c.secondary}"/>`
        + `<circle cx="304" cy="74" r="3" fill="${c.secondary}"/>`
        + `<circle cx="250" cy="88" r="3" fill="${c.secondary}"/>`
        + `<circle cx="286" cy="88" r="3" fill="${c.secondary}"/>`
        + `<circle cx="322" cy="88" r="3" fill="${c.opposite}"/>`
        + `<rect x="242" y="57" width="60" height="11" rx="3" fill="${c.primarySoft}"/>`
        + `<text x="272" y="65" font-family="sans-serif" font-size="5.8" font-weight="700" text-anchor="middle" fill="${c.primary}">墒情阀精密滴灌</text>`
      );
    case 'livestream_impulse_return':
      return (
        `<path d="M210,88 L226,88 L236,64 L250,94 L264,70 L276,84 L290,84" fill="none" stroke="${c.opposite}" stroke-width="1.6" stroke-linejoin="round"/>`
        + `<rect x="298" y="64" width="34" height="22" rx="4" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<text x="315" y="77.5" font-family="sans-serif" font-size="6.2" font-weight="700" text-anchor="middle" fill="${c.primary}">退货率</text>`
        + `<path d="M315,88 Q290,104 252,98" fill="none" stroke="${c.secondary}" stroke-width="1.4" stroke-dasharray="3 2"/>`
        + `<text x="272" y="109" font-family="sans-serif" font-size="5.6" text-anchor="middle" fill="${c.muted}">促单情绪峰值 → 七日反向退货回流</text>`
      );
    case 'community_childcare_radius':
      return (
        `<circle cx="272" cy="82" r="24" fill="${c.primary}" fill-opacity="0.08" stroke="${c.primary}" stroke-width="1" stroke-dasharray="3 2"/>`
        + `<circle cx="272" cy="82" r="15" fill="${c.secondary}" fill-opacity="0.14" stroke="${c.secondary}" stroke-width="1.2"/>`
        + `<circle cx="272" cy="82" r="5" fill="${c.opposite}"/>`
        + `<text x="292" y="66" font-family="monospace" font-size="5.8" font-weight="700" fill="${c.primary}">15m</text>`
        + `<text x="272" y="112" font-family="sans-serif" font-size="5.6" text-anchor="middle" fill="${c.muted}">社区托育 12–15 分钟步行等时圈</text>`
      );
    case 'silver_fintech_antifraud':
      return (
        `<rect x="210" y="59" width="26" height="38" rx="4" fill="${c.surface}" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="213" y="64" width="20" height="26" rx="2" fill="${c.oppositeSoft}"/>`
        + `<text x="223" y="75" font-family="sans-serif" font-size="5.6" font-weight="700" text-anchor="middle" fill="${c.opposite}">大额</text>`
        + `<text x="223" y="83.5" font-family="sans-serif" font-size="5.6" font-weight="700" text-anchor="middle" fill="${c.opposite}">转账</text>`
        + `<circle cx="223" cy="93.5" r="1.4" fill="${c.axis}"/>`
        + `<line x1="236" y1="78" x2="254" y2="78" stroke="${c.opposite}" stroke-width="1.3" stroke-dasharray="2.5 2"/>`
        + `<path d="M271,58 L288,64 L288,78 C288,89 280,95 271,99 C262,95 254,89 254,78 L254,64 Z" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.4"/>`
        + `<polyline points="264,78 269,83 279,72" fill="none" stroke="${c.primary}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
        + `<line x1="288" y1="78" x2="302" y2="78" stroke="${c.secondary}" stroke-width="1.3"/>`
        + `<rect x="302" y="62" width="34" height="33" rx="4" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.2"/>`
        + `<circle cx="319" cy="72" r="3.5" fill="${c.secondary}"/>`
        + `<path d="M312,83 C312,78 326,78 326,83" fill="none" stroke="${c.secondary}" stroke-width="1.3" stroke-linecap="round"/>`
        + `<text x="319" y="91" font-family="sans-serif" font-size="5.3" font-weight="700" text-anchor="middle" fill="${c.secondary}">亲情监护</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.5" text-anchor="middle" fill="${c.muted}">涉诈风险触发 → 15m 冷静延迟 → 亲情拦截</text>`
      );
    case 'campus_mental_triage':
      return (
        `<rect x="206" y="59" width="86" height="12" rx="3" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<text x="249" y="67" font-family="sans-serif" font-size="5.5" font-weight="700" text-anchor="middle" fill="${c.primary}">一级筛查 · 班级宿舍哨点</text>`
        + `<line x1="249" y1="71" x2="249" y2="75" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="216" y="75" width="66" height="12" rx="3" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<text x="249" y="83" font-family="sans-serif" font-size="5.5" font-weight="700" text-anchor="middle" fill="${c.secondary}">二级分流 · 匿名倾诉</text>`
        + `<line x1="249" y1="87" x2="249" y2="91" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="226" y="91" width="46" height="12" rx="3" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1.1"/>`
        + `<text x="249" y="99" font-family="sans-serif" font-size="5.5" font-weight="700" text-anchor="middle" fill="${c.opposite}">三级临床转介</text>`
        + `<rect x="298" y="59" width="40" height="44" rx="4" fill="${c.canvas}" stroke="${c.border}" stroke-width="0.9"/>`
        + `<text x="318" y="68" font-family="sans-serif" font-size="5.3" font-weight="700" text-anchor="middle" fill="${c.muted}">首诊候时</text>`
        + `<rect x="304" y="73" width="10" height="20" rx="1.5" fill="${c.opposite}" fill-opacity="0.75"/>`
        + `<text x="309" y="100" font-family="monospace" font-size="5.2" text-anchor="middle" fill="${c.opposite}">9.4d</text>`
        + `<rect x="322" y="87" width="10" height="6" rx="1.5" fill="${c.primary}"/>`
        + `<text x="327" y="100" font-family="monospace" font-size="5.2" font-weight="700" text-anchor="middle" fill="${c.primary}">1.8d</text>`
        + `<text x="272" y="111.5" font-family="sans-serif" font-size="5.5" text-anchor="middle" fill="${c.muted}">三级漏斗分流 + 匿名入口 → 候诊显著压缩</text>`
      );
    case 'zerowaste_circular_community':
      return (
        `<circle cx="272" cy="81" r="18" fill="none" stroke="${c.primary}" stroke-width="1.6" stroke-dasharray="14 5"/>`
        + `<circle cx="272" cy="81" r="11.5" fill="${c.primarySoft}"/>`
        + `<text x="272" y="83" font-family="sans-serif" font-size="5.6" font-weight="700" text-anchor="middle" fill="${c.primary}">碳普惠</text>`
        + `<rect x="248" y="56" width="48" height="12" rx="3" fill="${c.surface}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<text x="272" y="64" font-family="sans-serif" font-size="5.5" font-weight="700" text-anchor="middle" fill="${c.primary}">源头净分类</text>`
        + `<rect x="206" y="87" width="46" height="12" rx="3" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<text x="229" y="95" font-family="sans-serif" font-size="5.5" font-weight="700" text-anchor="middle" fill="${c.secondary}">两网交投站</text>`
        + `<rect x="292" y="87" width="46" height="12" rx="3" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1.1"/>`
        + `<text x="315" y="95" font-family="sans-serif" font-size="5.5" font-weight="700" text-anchor="middle" fill="${c.opposite}">积分兑返利</text>`
        + `<text x="272" y="111" font-family="sans-serif" font-size="5.5" text-anchor="middle" fill="${c.muted}">两网融合回收闭环 · 提升分类纯度与减排</text>`
      );
    case 'rural_coldchain_precool':
      return (
        `<rect x="206" y="61" width="35" height="25" rx="4" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1.2"/>`
        + `<text x="223.5" y="71.5" font-family="sans-serif" font-size="5.5" font-weight="700" text-anchor="middle" fill="${c.opposite}">田头预冷</text>`
        + `<text x="223.5" y="81" font-family="monospace" font-size="5.3" text-anchor="middle" fill="${c.text}">28→4℃</text>`
        + `<line x1="241" y1="73.5" x2="253" y2="73.5" stroke="${c.axis}" stroke-width="1.3"/>`
        + `<rect x="253" y="61" width="36" height="25" rx="4" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.2"/>`
        + `<text x="271" y="71.5" font-family="sans-serif" font-size="5.5" font-weight="700" text-anchor="middle" fill="${c.secondary}">冷藏干线</text>`
        + `<text x="271" y="81" font-family="monospace" font-size="5.3" text-anchor="middle" fill="${c.text}">2–4℃</text>`
        + `<line x1="289" y1="73.5" x2="301" y2="73.5" stroke="${c.axis}" stroke-width="1.3"/>`
        + `<rect x="301" y="61" width="36" height="25" rx="4" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<text x="319" y="71.5" font-family="sans-serif" font-size="5.5" font-weight="700" text-anchor="middle" fill="${c.primary}">销地冷仓</text>`
        + `<text x="319" y="81" font-family="monospace" font-size="5.3" text-anchor="middle" fill="${c.text}">5.8%损</text>`
        + `<rect x="208" y="92" width="38" height="5" rx="1.5" fill="${c.opposite}"/>`
        + `<rect x="252" y="93.5" width="38" height="3.5" rx="1.5" fill="${c.secondary}"/>`
        + `<rect x="296" y="95" width="38" height="2" rx="1" fill="${c.primary}"/>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.5" text-anchor="middle" fill="${c.muted}">最先一公里及时预冷 → 损耗 18.6% 降至 5.8%</text>`
      );
    case 'smart_port_customs':
      return (
        `<line x1="210" y1="66" x2="274" y2="66" stroke="${c.primary}" stroke-width="2" stroke-linecap="round"/>`
        + `<line x1="226" y1="66" x2="222" y2="96" stroke="${c.primary}" stroke-width="1.5"/>`
        + `<line x1="250" y1="66" x2="254" y2="96" stroke="${c.primary}" stroke-width="1.5"/>`
        + `<line x1="226" y1="66" x2="238" y2="59" stroke="${c.secondary}" stroke-width="1.2"/>`
        + `<line x1="238" y1="59" x2="254" y2="66" stroke="${c.secondary}" stroke-width="1.2"/>`
        + `<line x1="264" y1="66" x2="264" y2="75" stroke="${c.axis}" stroke-width="1.1"/>`
        + `<rect x="256" y="75" width="16" height="9" rx="1.5" fill="${c.opposite}"/>`
        + `<rect x="229" y="88" width="18" height="8" rx="1" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1"/>`
        + `<rect x="284" y="60" width="50" height="11" rx="3" fill="${c.primarySoft}"/>`
        + `<text x="309" y="67.5" font-family="sans-serif" font-size="5.3" font-weight="700" text-anchor="middle" fill="${c.primary}">无纸秒放 96.8%</text>`
        + `<rect x="282" y="77" width="22" height="9" rx="1.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<rect x="307" y="77" width="22" height="9" rx="1.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<circle cx="289" cy="89" r="2" fill="${c.axis}"/>`
        + `<circle cx="298" cy="89" r="2" fill="${c.axis}"/>`
        + `<circle cx="314" cy="89" r="2" fill="${c.axis}"/>`
        + `<circle cx="323" cy="89" r="2" fill="${c.axis}"/>`
        + `<line x1="276" y1="92" x2="336" y2="92" stroke="${c.axis}" stroke-width="1.4"/>`
        + `<line x1="208" y1="97" x2="336" y2="97" stroke="${c.grid}" stroke-width="1.1"/>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.5" text-anchor="middle" fill="${c.muted}">远控岸桥船边直提 → 集装箱海铁快速联运</text>`
      );
    case 'raredisease_multitier_ins':
      return (
        `<text x="206" y="68" font-family="sans-serif" font-size="5.4" fill="${c.muted}">单一自费</text>`
        + `<rect x="234" y="61" width="100" height="10" rx="2" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1"/>`
        + `<text x="284" y="68" font-family="monospace" font-size="5.3" font-weight="700" text-anchor="middle" fill="${c.opposite}">自付 100%</text>`
        + `<text x="206" y="85" font-family="sans-serif" font-size="5.4" font-weight="700" fill="${c.text}">三重共付</text>`
        + `<rect x="234" y="77" width="44" height="12" rx="1.5" fill="${c.primary}"/>`
        + `<rect x="279" y="77" width="20" height="12" rx="1.5" fill="${c.secondary}"/>`
        + `<rect x="300" y="77" width="13" height="12" rx="1.5" fill="${c.primaryMid}"/>`
        + `<rect x="314" y="77" width="20" height="12" rx="1.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1"/>`
        + `<text x="256" y="85" font-family="sans-serif" font-size="5.1" font-weight="700" text-anchor="middle" fill="${c.surface}">医保44%</text>`
        + `<text x="289" y="85" font-family="sans-serif" font-size="5" font-weight="700" text-anchor="middle" fill="${c.surface}">惠</text>`
        + `<text x="324" y="85" font-family="monospace" font-size="5" font-weight="700" text-anchor="middle" fill="${c.opposite}">21%</text>`
        + `<rect x="208" y="95" width="5.5" height="5.5" rx="1" fill="${c.primary}"/>`
        + `<text x="215.5" y="99.8" font-family="sans-serif" font-size="5.1" fill="${c.muted}">基本医保</text>`
        + `<rect x="243" y="95" width="5.5" height="5.5" rx="1" fill="${c.secondary}"/>`
        + `<text x="250.5" y="99.8" font-family="sans-serif" font-size="5.1" fill="${c.muted}">惠民保</text>`
        + `<rect x="272" y="95" width="5.5" height="5.5" rx="1" fill="${c.primaryMid}"/>`
        + `<text x="279.5" y="99.8" font-family="sans-serif" font-size="5.1" fill="${c.muted}">慈善PAP</text>`
        + `<rect x="305" y="95" width="5.5" height="5.5" rx="1" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="0.7"/>`
        + `<text x="312.5" y="99.8" font-family="sans-serif" font-size="5.1" fill="${c.opposite}">自付</text>`
        + `<text x="272" y="111" font-family="sans-serif" font-size="5.5" text-anchor="middle" fill="${c.muted}">基本医保+惠民保+赠药 → 自付减负 68.5%</text>`
      );
    case 'ai_vocational_reskilling':
      return (
        `<rect x="206" y="82" width="32" height="16" rx="3" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1.1"/>`
        + `<text x="222" y="92" font-family="sans-serif" font-size="5.4" font-weight="700" text-anchor="middle" fill="${c.opposite}">传统岗位</text>`
        + `<rect x="304" y="70" width="34" height="28" rx="3" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<text x="321" y="82" font-family="sans-serif" font-size="5.4" font-weight="700" text-anchor="middle" fill="${c.primary}">人机协同</text>`
        + `<text x="321" y="91.5" font-family="monospace" font-size="5.2" text-anchor="middle" fill="${c.primary}">94.6%薪</text>`
        + `<path d="M238,85 Q271,69 304,76" fill="none" stroke="${c.primary}" stroke-width="1.8" stroke-linecap="round"/>`
        + `<path d="M238,89 Q271,105 304,84" fill="none" stroke="${c.opposite}" stroke-width="1.2" stroke-dasharray="3 2"/>`
        + `<rect x="250" y="58" width="42" height="11" rx="3" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1"/>`
        + `<text x="271" y="65.5" font-family="sans-serif" font-size="5.3" font-weight="700" text-anchor="middle" fill="${c.secondary}">技能培训券</text>`
        + `<text x="272" y="111" font-family="sans-serif" font-size="5.5" text-anchor="middle" fill="${c.muted}">实线:培训券平滑跨沟 · 虚线:裸转岗收入谷</text>`
      );
    case 'natpark_wildlife_coexist':
      return (
        `<polygon points="208,95 234,61 260,95" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.2"/>`
        + `<polygon points="234,95 258,67 282,95" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<path d="M262,76 Q289,61 314,73" fill="none" stroke="${c.primary}" stroke-width="1.5" stroke-dasharray="3 2"/>`
        + `<text x="289" y="63" font-family="sans-serif" font-size="5.3" font-weight="700" text-anchor="middle" fill="${c.primary}">生态廊道</text>`
        + `<rect x="292" y="73" width="44" height="22" rx="4" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1.1"/>`
        + `<text x="314" y="82.5" font-family="sans-serif" font-size="5.4" font-weight="700" text-anchor="middle" fill="${c.opposite}">肇事保险</text>`
        + `<text x="314" y="90.5" font-family="monospace" font-size="5.2" text-anchor="middle" fill="${c.text}">92.4% 赔</text>`
        + `<line x1="206" y1="95" x2="338" y2="95" stroke="${c.axis}" stroke-width="1.1"/>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.5" text-anchor="middle" fill="${c.muted}">生态管护补偿 + 肇事保险兜底与特许增收</text>`
      );
    case 'instant_retail_darkstore':
      return (
        `<circle cx="226" cy="78" r="20" fill="${c.primarySoft}" fill-opacity="0.45" stroke="${c.primary}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`
        + `<rect x="210" y="65" width="32" height="25" rx="4" fill="${c.surface}" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<polygon points="227,68 222,76 226,76 224,83 231,74 227,74" fill="${c.opposite}"/>`
        + `<text x="226" y="88" font-family="sans-serif" font-size="5.2" font-weight="700" text-anchor="middle" fill="${c.primary}">前置闪仓</text>`
        + `<path d="M242,72 Q267,62 292,64" fill="none" stroke="${c.primary}" stroke-width="1.3"/>`
        + `<line x1="242" y1="77.5" x2="292" y2="77.5" stroke="${c.secondary}" stroke-width="1.3"/>`
        + `<path d="M242,83 Q267,93 292,91" fill="none" stroke="${c.opposite}" stroke-width="1.3"/>`
        + `<rect x="292" y="58" width="45" height="11" rx="2.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="0.9"/>`
        + `<text x="314.5" y="65.5" font-family="sans-serif" font-size="5" font-weight="700" text-anchor="middle" fill="${c.primary}">30m达 93.6%</text>`
        + `<rect x="292" y="72" width="45" height="11" rx="2.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="0.9"/>`
        + `<text x="314.5" y="79.5" font-family="sans-serif" font-size="5" font-weight="700" text-anchor="middle" fill="${c.secondary}">峰单 1.8km</text>`
        + `<rect x="292" y="86" width="45" height="11" rx="2.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="0.9"/>`
        + `<text x="314.5" y="93.5" font-family="sans-serif" font-size="5" font-weight="700" text-anchor="middle" fill="${c.opposite}">损耗 3.4%</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">3km 闪电仓网格 → 峰值骑手调度与冷热减损</text>`
      );
    case 'silver_home_telehealth':
      return (
        `<rect x="206" y="60" width="38" height="35" rx="4" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1.1"/>`
        + `<text x="225" y="69" font-family="sans-serif" font-size="5.3" font-weight="700" text-anchor="middle" fill="${c.opposite}">居家体征</text>`
        + `<polyline points="209,81 215,81 218,73 222,88 226,75 229,81 241,81" fill="none" stroke="${c.opposite}" stroke-width="1.5" stroke-linejoin="round"/>`
        + `<text x="225" y="92" font-family="monospace" font-size="4.8" text-anchor="middle" fill="${c.muted}">78 bpm</text>`
        + `<line x1="244" y1="77.5" x2="256" y2="77.5" stroke="${c.opposite}" stroke-width="1.3" stroke-dasharray="2.5 2"/>`
        + `<path d="M271,59 L286,65 L286,79 C286,88 279,94 271,97 C263,94 256,88 256,79 L256,65 Z" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.3"/>`
        + `<text x="271" y="76" font-family="sans-serif" font-size="5.2" font-weight="700" text-anchor="middle" fill="${c.primary}">智能哨兵</text>`
        + `<text x="271" y="85" font-family="monospace" font-size="5.2" font-weight="700" text-anchor="middle" fill="${c.opposite}">18 s</text>`
        + `<line x1="286" y1="71" x2="297" y2="67" stroke="${c.secondary}" stroke-width="1.2"/>`
        + `<line x1="286" y1="83" x2="297" y2="87" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<rect x="297" y="60" width="41" height="14" rx="3" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1"/>`
        + `<text x="317.5" y="69" font-family="sans-serif" font-size="5.1" font-weight="700" text-anchor="middle" fill="${c.secondary}">社区医护</text>`
        + `<rect x="297" y="80" width="41" height="14" rx="3" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1"/>`
        + `<text x="317.5" y="89" font-family="sans-serif" font-size="5.1" font-weight="700" text-anchor="middle" fill="${c.primary}">子女端告警</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">连续采集 → 秒级异常识警 → 医社家协同</text>`
      );
    case 'retail_cohort_frequency':
      return (
        Array.from({ length: 10 }, (_, idx) => {
          const px = 211 + idx * 12.8;
          const col = idx < 5 ? c.primary : idx < 8 ? c.secondary : c.opposite;
          return (
            `<circle cx="${px}" cy="61" r="2.2" fill="${col}"/>`
            + `<rect x="${px - 2.6}" y="64.5" width="5.2" height="7" rx="1.6" fill="${col}"/>`
          );
        }).join('')
        + `<rect x="206" y="76" width="76" height="24" rx="3.5" fill="${c.canvas}" stroke="${c.border}" stroke-width="0.8"/>`
        + `<rect x="214" y="87" width="8" height="9" rx="1" fill="${c.primaryMid}"/>`
        + `<rect x="228" y="84" width="8" height="12" rx="1" fill="${c.secondary}"/>`
        + `<rect x="242" y="82" width="8" height="14" rx="1" fill="${c.primary}"/>`
        + `<rect x="256" y="79" width="8" height="17" rx="1" fill="${c.opposite}"/>`
        + `<text x="271" y="90" font-family="monospace" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.opposite}">22h+</text>`
        + `<rect x="286" y="76" width="52" height="24" rx="3.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="0.9"/>`
        + `<text x="312" y="85.5" font-family="sans-serif" font-size="5.2" font-weight="700" text-anchor="middle" fill="${c.opposite}">夜间补给</text>`
        + `<text x="312" y="95" font-family="monospace" font-size="5.4" font-weight="700" text-anchor="middle" fill="${c.text}">68.5元/单</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">Z世代54% · 周均3.4次 · 22点波峰高溢价</text>`
      );
    case 'silver_caregiver_dyad':
      return (
        `<rect x="206" y="58" width="46" height="31" rx="4" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<circle cx="229" cy="66" r="3" fill="${c.primary}"/>`
        + `<text x="229" y="76.5" font-family="sans-serif" font-size="5.3" font-weight="700" text-anchor="middle" fill="${c.primary}">失能长者端</text>`
        + `<text x="229" y="85" font-family="monospace" font-size="5" text-anchor="middle" fill="${c.text}">障碍 38.4%</text>`
        + `<line x1="252" y1="73" x2="292" y2="73" stroke="${c.opposite}" stroke-width="1.3"/>`
        + `<rect x="255" y="65" width="34" height="15" rx="3" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="0.9"/>`
        + `<text x="272" y="74.5" font-family="monospace" font-size="5.2" font-weight="700" text-anchor="middle" fill="${c.opposite}">1,480元</text>`
        + `<rect x="292" y="58" width="46" height="31" rx="4" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<circle cx="315" cy="66" r="3" fill="${c.secondary}"/>`
        + `<text x="315" y="76.5" font-family="sans-serif" font-size="5.3" font-weight="700" text-anchor="middle" fill="${c.secondary}">照护家属端</text>`
        + `<text x="315" y="85" font-family="monospace" font-size="5" text-anchor="middle" fill="${c.text}">协同 71.8%</text>`
        + `<rect x="206" y="92" width="40" height="10" rx="2.5" fill="${c.canvas}" stroke="${c.border}" stroke-width="0.8"/>`
        + `<text x="226" y="99" font-family="sans-serif" font-size="4.9" text-anchor="middle" fill="${c.text}">语音大字</text>`
        + `<rect x="252" y="92" width="40" height="10" rx="2.5" fill="${c.canvas}" stroke="${c.border}" stroke-width="0.8"/>`
        + `<text x="272" y="99" font-family="sans-serif" font-size="4.9" text-anchor="middle" fill="${c.text}">夜间喘息</text>`
        + `<rect x="298" y="92" width="40" height="10" rx="2.5" fill="${c.canvas}" stroke="${c.border}" stroke-width="0.8"/>`
        + `<text x="318" y="99" font-family="sans-serif" font-size="4.9" text-anchor="middle" fill="${c.text}">长护共付</text>`
        + `<text x="272" y="110.5" font-family="sans-serif" font-size="5.3" text-anchor="middle" fill="${c.muted}">双主体负担—支付意愿—适老门槛联动</text>`
      );
    case 'retail_30d_pilot_action':
      return (
        `<rect x="206" y="81" width="30" height="17" rx="2.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1"/>`
        + `<text x="221" y="89" font-family="monospace" font-size="5" font-weight="700" text-anchor="middle" fill="${c.primary}">D1–7</text>`
        + `<text x="221" y="95.5" font-family="sans-serif" font-size="4.8" text-anchor="middle" fill="${c.text}">溯源</text>`
        + `<rect x="240" y="74" width="30" height="24" rx="2.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1"/>`
        + `<text x="255" y="83" font-family="monospace" font-size="5" font-weight="700" text-anchor="middle" fill="${c.secondary}">D8–15</text>`
        + `<text x="255" y="92" font-family="sans-serif" font-size="4.8" text-anchor="middle" fill="${c.text}">骑手协防</text>`
        + `<rect x="274" y="67" width="30" height="31" rx="2.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1"/>`
        + `<text x="289" y="77" font-family="monospace" font-size="5" font-weight="700" text-anchor="middle" fill="${c.primary}">D16–23</text>`
        + `<text x="289" y="87" font-family="sans-serif" font-size="4.8" text-anchor="middle" fill="${c.text}">损耗压降</text>`
        + `<rect x="308" y="60" width="30" height="38" rx="2.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1"/>`
        + `<text x="323" y="72" font-family="monospace" font-size="5" font-weight="700" text-anchor="middle" fill="${c.opposite}">D24–30</text>`
        + `<text x="323" y="83" font-family="sans-serif" font-size="4.8" text-anchor="middle" fill="${c.text}">复测推广</text>`
        + `<polyline points="214,62 252,65 290,71 326,86" fill="none" stroke="${c.opposite}" stroke-width="1.5" stroke-dasharray="2.5 2"/>`
        + `<circle cx="214" cy="62" r="2.2" fill="${c.opposite}"/>`
        + `<circle cx="326" cy="86" r="2.2" fill="${c.opposite}"/>`
        + `<text x="260" y="61.5" font-family="monospace" font-size="5" font-weight="700" fill="${c.opposite}">损耗 -41.5%</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">政企骑手协防 + 30天损耗压降四维路线</text>`
      );
    case 'silver_community_grid_action':
      return (
        `<line x1="272" y1="68" x2="232" y2="89" stroke="${c.primary}" stroke-width="1.3"/>`
        + `<line x1="272" y1="68" x2="312" y2="89" stroke="${c.secondary}" stroke-width="1.3"/>`
        + `<line x1="232" y1="90" x2="312" y2="90" stroke="${c.opposite}" stroke-width="1.3" stroke-dasharray="2.5 2"/>`
        + `<rect x="245" y="57" width="54" height="14" rx="3.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<text x="272" y="66" font-family="sans-serif" font-size="5.2" font-weight="700" text-anchor="middle" fill="${c.primary}">医联体 12m判</text>`
        + `<circle cx="272" cy="80" r="6.5" fill="${c.surface}" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<text x="272" y="82" font-family="monospace" font-size="5" font-weight="700" text-anchor="middle" fill="${c.primary}">30d</text>`
        + `<rect x="206" y="84" width="52" height="15" rx="3.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1"/>`
        + `<text x="232" y="93.5" font-family="sans-serif" font-size="5.1" font-weight="700" text-anchor="middle" fill="${c.secondary}">社区网格 3m</text>`
        + `<rect x="286" y="84" width="52" height="15" rx="3.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1"/>`
        + `<text x="312" y="93.5" font-family="sans-serif" font-size="5.1" font-weight="700" text-anchor="middle" fill="${c.opposite}">家属端 核验</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">社区网格吹哨—医联体转诊—家属端闭环</text>`
      );
    case 'four_segment_precision_policy':
      return (
        `<rect x="206" y="57" width="64" height="20" rx="3.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1"/>`
        + `<text x="238" y="65.5" font-family="sans-serif" font-size="5.2" font-weight="700" text-anchor="middle" fill="${c.primary}">数字原住民 34%</text>`
        + `<text x="238" y="73.5" font-family="sans-serif" font-size="4.8" text-anchor="middle" fill="${c.muted}">智能推荐·尝鲜</text>`
        + `<rect x="274" y="57" width="64" height="20" rx="3.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1"/>`
        + `<text x="306" y="65.5" font-family="sans-serif" font-size="5.2" font-weight="700" text-anchor="middle" fill="${c.secondary}">价格敏感型 28%</text>`
        + `<text x="306" y="73.5" font-family="sans-serif" font-size="4.8" text-anchor="middle" fill="${c.muted}">阶梯补贴·拼团</text>`
        + `<rect x="206" y="80" width="64" height="20" rx="3.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1"/>`
        + `<text x="238" y="88.5" font-family="sans-serif" font-size="5.2" font-weight="700" text-anchor="middle" fill="${c.opposite}">银发依赖型 21%</text>`
        + `<text x="238" y="96.5" font-family="sans-serif" font-size="4.8" text-anchor="middle" fill="${c.muted}">极简适老·亲情</text>`
        + `<rect x="274" y="80" width="64" height="20" rx="3.5" fill="${c.canvas}" stroke="${c.axis}" stroke-width="1"/>`
        + `<text x="306" y="88.5" font-family="sans-serif" font-size="5.2" font-weight="700" text-anchor="middle" fill="${c.text}">审慎观望型 17%</text>`
        + `<text x="306" y="96.5" font-family="sans-serif" font-size="4.8" text-anchor="middle" fill="${c.muted}">信任背书·试用</text>`
        + `<text x="272" y="110.5" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">K-Means/LCA 四分群精准施策矩阵</text>`
      );
    case 'regional_respondent_portrait':
      return (
        `<polygon points="218,74 234,62 250,74" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1"/>`
        + `<polygon points="222,66 234,58 246,66" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="0.9"/>`
        + `<rect x="223" y="74" width="22" height="12" fill="${c.surface}" stroke="${c.primary}" stroke-width="1"/>`
        + `<path d="M264,86 Q296,65 328,86" fill="none" stroke="${c.secondary}" stroke-width="1.6"/>`
        + `<line x1="258" y1="86" x2="334" y2="86" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<line x1="278" y1="70" x2="278" y2="86" stroke="${c.secondary}" stroke-width="1"/>`
        + `<line x1="314" y1="70" x2="314" y2="86" stroke="${c.secondary}" stroke-width="1"/>`
        + `<path d="M206,89 Q240,86 272,89 T338,89" fill="none" stroke="${c.primaryMid}" stroke-width="1.1"/>`
        + `<rect x="206" y="92" width="42" height="10" rx="2.5" fill="${c.primarySoft}"/>`
        + `<text x="227" y="99" font-family="sans-serif" font-size="4.9" font-weight="700" text-anchor="middle" fill="${c.primary}">城区 46%</text>`
        + `<rect x="251" y="92" width="42" height="10" rx="2.5" fill="${c.secondarySoft}"/>`
        + `<text x="272" y="99" font-family="sans-serif" font-size="4.9" font-weight="700" text-anchor="middle" fill="${c.secondary}">县域 32%</text>`
        + `<rect x="296" y="92" width="42" height="10" rx="2.5" fill="${c.oppositeSoft}"/>`
        + `<text x="317" y="99" font-family="sans-serif" font-size="4.9" font-weight="700" text-anchor="middle" fill="${c.opposite}">乡土 22%</text>`
        + `<text x="272" y="110.5" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">地域风物锚点 + 区县梯度与方言校准</text>`
      );
    case 'grid_v2g_peak_shaving':
      return (
        `<rect x="206" y="69" width="32" height="16" rx="3.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<circle cx="214" cy="86" r="2.6" fill="${c.axis}"/>`
        + `<circle cx="230" cy="86" r="2.6" fill="${c.axis}"/>`
        + `<text x="222" y="79" font-family="sans-serif" font-size="5" font-weight="700" text-anchor="middle" fill="${c.primary}">EV双向</text>`
        + `<path d="M242,88 L254,88 L266,64 L278,86 L290,78 L302,68" fill="none" stroke="${c.opposite}" stroke-width="1.5" stroke-dasharray="2.5 2"/>`
        + `<path d="M242,83 L256,77 L268,75 L280,78 L292,76 L302,75" fill="none" stroke="${c.primary}" stroke-width="1.7"/>`
        + `<rect x="256" y="58" width="38" height="10" rx="2.5" fill="${c.oppositeSoft}"/>`
        + `<text x="275" y="65" font-family="monospace" font-size="4.9" font-weight="700" text-anchor="middle" fill="${c.opposite}">削峰 22.8%</text>`
        + `<polygon points="322,60 311,90 333,90" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<line x1="314" y1="73" x2="330" y2="73" stroke="${c.secondary}" stroke-width="1"/>`
        + `<text x="322" y="98" font-family="sans-serif" font-size="5" font-weight="700" text-anchor="middle" fill="${c.secondary}">虚拟电厂</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">车主 1.65元/kWh 放电激励 → 削峰填谷</text>`
      );
    case 'rural_express_co_delivery':
      return (
        `<rect x="206" y="61" width="35" height="22" rx="3.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<text x="223.5" y="70.5" font-family="sans-serif" font-size="5.2" font-weight="700" text-anchor="middle" fill="${c.primary}">县统仓</text>`
        + `<text x="223.5" y="79" font-family="sans-serif" font-size="4.8" text-anchor="middle" fill="${c.muted}">分拣共配</text>`
        + `<line x1="241" y1="72" x2="254" y2="72" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="254" y="61" width="36" height="22" rx="3.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<text x="272" y="70.5" font-family="sans-serif" font-size="5.2" font-weight="700" text-anchor="middle" fill="${c.secondary}">客货邮</text>`
        + `<text x="272" y="79" font-family="sans-serif" font-size="4.8" text-anchor="middle" fill="${c.muted}">公交捎带</text>`
        + `<line x1="290" y1="72" x2="303" y2="72" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="303" y="61" width="35" height="22" rx="3.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1.1"/>`
        + `<text x="320.5" y="70.5" font-family="sans-serif" font-size="5.2" font-weight="700" text-anchor="middle" fill="${c.opposite}">驻村站</text>`
        + `<text x="320.5" y="79" font-family="monospace" font-size="4.8" text-anchor="middle" fill="${c.text}">91.6%覆</text>`
        + `<rect x="208" y="88" width="128" height="10" rx="2.5" fill="${c.canvas}" stroke="${c.border}" stroke-width="0.8"/>`
        + `<rect x="210" y="90" width="84" height="6" rx="1.5" fill="${c.opposite}" fill-opacity="0.35"/>`
        + `<rect x="210" y="90" width="54" height="6" rx="1.5" fill="${c.primary}"/>`
        + `<text x="315" y="95" font-family="monospace" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">0.78元(-34%)</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">县乡村统仓共配 + 农产品双向捎带上行</text>`
      );
    case 'youth_night_school_public':
      return (
        `<rect x="206" y="59" width="42" height="39" rx="4" fill="${c.primary}" fill-opacity="0.14" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<circle cx="225" cy="72" r="6.5" fill="${c.secondary}"/>`
        + `<circle cx="228" cy="70.5" r="5.5" fill="${c.primarySoft}"/>`
        + `<text x="227" y="87" font-family="monospace" font-size="5" font-weight="700" text-anchor="middle" fill="${c.primary}">19–21h</text>`
        + `<text x="227" y="94.5" font-family="sans-serif" font-size="4.8" text-anchor="middle" fill="${c.muted}">错峰复用</text>`
        + `<rect x="254" y="59" width="84" height="11" rx="2.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="0.9"/>`
        + `<text x="259" y="66.5" font-family="sans-serif" font-size="5" font-weight="700" fill="${c.opposite}">非遗美育手作</text>`
        + `<text x="333" y="66.5" font-family="monospace" font-size="5" font-weight="700" text-anchor="end" fill="${c.opposite}">93%</text>`
        + `<rect x="254" y="73" width="84" height="11" rx="2.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="0.9"/>`
        + `<text x="259" y="80.5" font-family="sans-serif" font-size="5" font-weight="700" fill="${c.primary}">数智办公夜修课</text>`
        + `<text x="333" y="80.5" font-family="monospace" font-size="5" font-weight="700" text-anchor="end" fill="${c.primary}">87%</text>`
        + `<rect x="254" y="87" width="84" height="11" rx="2.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="0.9"/>`
        + `<text x="259" y="94.5" font-family="sans-serif" font-size="5" font-weight="700" fill="${c.secondary}">同城轻量社交</text>`
        + `<text x="333" y="94.5" font-family="monospace" font-size="5" font-weight="700" text-anchor="end" fill="${c.secondary}">84%</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">文化馆错峰开放 → 满班 94.8% · 48.5元/节</text>`
      );
    case 'drg_clinical_pathway_cost':
      return (
        `<rect x="206" y="59" width="54" height="11" rx="2.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="0.9"/>`
        + `<text x="233" y="66.5" font-family="sans-serif" font-size="5" font-weight="700" text-anchor="middle" fill="${c.primary}">标准临床路径</text>`
        + `<line x1="233" y1="70" x2="233" y2="74" stroke="${c.axis}" stroke-width="1"/>`
        + `<rect x="206" y="74" width="54" height="11" rx="2.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="0.9"/>`
        + `<text x="233" y="81.5" font-family="sans-serif" font-size="5" font-weight="700" text-anchor="middle" fill="${c.secondary}">药耗占比优化</text>`
        + `<line x1="233" y1="85" x2="233" y2="89" stroke="${c.axis}" stroke-width="1"/>`
        + `<rect x="206" y="89" width="54" height="11" rx="2.5" fill="${c.canvas}" stroke="${c.border}" stroke-width="0.9"/>`
        + `<text x="233" y="96.5" font-family="monospace" font-size="5" font-weight="700" text-anchor="middle" fill="${c.text}">住院 6.8 d</text>`
        + `<line x1="302" y1="61" x2="302" y2="96" stroke="${c.axis}" stroke-width="1.3"/>`
        + `<line x1="276" y1="67" x2="328" y2="67" stroke="${c.primary}" stroke-width="1.5"/>`
        + `<polygon points="297,98 307,98 302,92" fill="${c.axis}"/>`
        + `<rect x="266" y="74" width="31" height="16" rx="2.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="0.9"/>`
        + `<text x="281.5" y="81" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">控费</text>`
        + `<text x="281.5" y="87.5" font-family="monospace" font-size="4.8" text-anchor="middle" fill="${c.text}">-14.6%</text>`
        + `<rect x="307" y="74" width="31" height="16" rx="2.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="0.9"/>`
        + `<text x="322.5" y="81" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.opposite}">质量</text>`
        + `<text x="322.5" y="87.5" font-family="monospace" font-size="4.8" text-anchor="middle" fill="${c.text}">再入1.9%</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">DRG/DIP 病组控费降耗与医疗质量双稳均衡</text>`
      );
    case 'semiconductor_fab_yield':
      return (
        `<circle cx="226" cy="78" r="16.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<line x1="214" y1="73" x2="238" y2="73" stroke="${c.primary}" stroke-width="0.7" stroke-opacity="0.55"/>`
        + `<line x1="214" y1="83" x2="238" y2="83" stroke="${c.primary}" stroke-width="0.7" stroke-opacity="0.55"/>`
        + `<line x1="221" y1="65" x2="221" y2="91" stroke="${c.primary}" stroke-width="0.7" stroke-opacity="0.55"/>`
        + `<line x1="231" y1="65" x2="231" y2="91" stroke="${c.primary}" stroke-width="0.7" stroke-opacity="0.55"/>`
        + `<rect x="222" y="74" width="8" height="8" rx="1" fill="${c.primary}" fill-opacity="0.45"/>`
        + `<rect x="232" y="67" width="5" height="5" rx="0.8" fill="${c.opposite}"/>`
        + `<line x1="243" y1="78" x2="254" y2="78" stroke="${c.axis}" stroke-width="1.3"/>`
        + `<rect x="254" y="59" width="84" height="39" rx="3.5" fill="${c.canvas}" stroke="${c.border}" stroke-width="0.9"/>`
        + `<rect x="258" y="62" width="44" height="10" rx="2.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="0.7"/>`
        + `<text x="280" y="69" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.secondary}">国产EDA闭环</text>`
        + `<text x="333" y="69" font-family="monospace" font-size="5.3" font-weight="700" text-anchor="end" fill="${c.primary}">94.2%</text>`
        + `<path d="M260,93 C280,93 300,86 332,81" fill="none" stroke="${c.opposite}" stroke-width="1.2" stroke-dasharray="2.5 2"/>`
        + `<path d="M260,93 C276,92 288,78 332,75" fill="none" stroke="${c.primary}" stroke-width="1.7" stroke-linecap="round"/>`
        + `<circle cx="332" cy="75" r="2.2" fill="${c.primary}"/>`
        + `<circle cx="332" cy="81" r="1.8" fill="${c.opposite}"/>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">晶圆流片校验 + 国产 EDA 闭环 → 良率爬坡</text>`
      );
    case 'ocean_blue_carbon_ranch':
      return (
        `<rect x="206" y="80" width="92" height="19" rx="2.5" fill="${c.secondarySoft}" fill-opacity="0.5"/>`
        + `<path d="M206,79 Q228,74 250,79 T298,79" fill="none" stroke="${c.secondary}" stroke-width="1.4"/>`
        + `<circle cx="222" cy="67" r="7" fill="${c.primary}" fill-opacity="0.28" stroke="${c.primary}" stroke-width="1"/>`
        + `<circle cx="234" cy="64" r="8" fill="${c.primary}" fill-opacity="0.35" stroke="${c.primary}" stroke-width="1"/>`
        + `<circle cx="244" cy="69" r="6" fill="${c.primary}" fill-opacity="0.24" stroke="${c.primary}" stroke-width="1"/>`
        + `<path d="M224,73 Q220,83 216,92" fill="none" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<line x1="233" y1="72" x2="233" y2="93" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<path d="M241,74 Q245,83 249,92" fill="none" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<line x1="260" y1="77" x2="296" y2="77" stroke="${c.axis}" stroke-width="1.1"/>`
        + `<line x1="268" y1="77" x2="268" y2="95" stroke="${c.primary}" stroke-width="1"/>`
        + `<circle cx="268" cy="84" r="2.1" fill="${c.primary}"/>`
        + `<circle cx="268" cy="91" r="2.1" fill="${c.primary}"/>`
        + `<line x1="279" y1="77" x2="279" y2="96" stroke="${c.primary}" stroke-width="1"/>`
        + `<circle cx="279" cy="83" r="2.2" fill="${c.secondary}"/>`
        + `<circle cx="279" cy="90" r="2.2" fill="${c.secondary}"/>`
        + `<line x1="290" y1="77" x2="290" y2="95" stroke="${c.primary}" stroke-width="1"/>`
        + `<circle cx="290" cy="85" r="2.1" fill="${c.primary}"/>`
        + `<circle cx="290" cy="92" r="2.1" fill="${c.primary}"/>`
        + `<rect x="302" y="59" width="36" height="38" rx="3.5" fill="${c.surface}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<rect x="305" y="62" width="30" height="10" rx="2" fill="${c.primarySoft}"/>`
        + `<text x="320" y="69" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">蓝碳核证</text>`
        + `<text x="320" y="81" font-family="monospace" font-size="5.2" font-weight="700" text-anchor="middle" fill="${c.opposite}">96.4元</text>`
        + `<text x="320" y="90.5" font-family="monospace" font-size="4.8" text-anchor="middle" fill="${c.muted}">+38.6%碳</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">红树林湿汇 + 贝藻立体固碳 → 蓝碳交易增收</text>`
      );
    case 'embodied_humanoid_factory':
      return (
        `<rect x="208" y="59" width="36" height="38" rx="4" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<rect x="220" y="63" width="12" height="7" rx="2" fill="${c.primary}"/>`
        + `<line x1="223" y1="66.5" x2="229" y2="66.5" stroke="${c.surface}" stroke-width="1.4" stroke-linecap="round"/>`
        + `<rect x="218" y="72" width="16" height="12" rx="2" fill="${c.secondary}"/>`
        + `<line x1="214" y1="74" x2="218" y2="74" stroke="${c.axis}" stroke-width="1.5"/>`
        + `<line x1="234" y1="74" x2="242" y2="78" stroke="${c.axis}" stroke-width="1.5"/>`
        + `<line x1="222" y1="84" x2="222" y2="90" stroke="${c.axis}" stroke-width="1.5"/>`
        + `<line x1="230" y1="84" x2="230" y2="90" stroke="${c.axis}" stroke-width="1.5"/>`
        + `<text x="226" y="95.5" font-family="sans-serif" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.primary}">高危替代</text>`
        + `<rect x="249" y="60" width="44" height="12" rx="2.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="0.9"/>`
        + `<text x="271" y="68" font-family="monospace" font-size="5" font-weight="700" text-anchor="middle" fill="${c.opposite}">工伤 -71%</text>`
        + `<rect x="248" y="81" width="46" height="7" rx="3.5" fill="${c.canvas}" stroke="${c.axis}" stroke-width="1.1"/>`
        + `<rect x="256" y="75" width="7" height="6" rx="1" fill="${c.primary}"/>`
        + `<rect x="271" y="75" width="7" height="6" rx="1" fill="${c.secondary}"/>`
        + `<rect x="284" y="75" width="6" height="6" rx="1" fill="${c.primaryMid}"/>`
        + `<text x="271" y="95.5" font-family="monospace" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">节拍 +27%</text>`
        + `<rect x="298" y="59" width="40" height="38" rx="4" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<circle cx="318" cy="68" r="3.5" fill="${c.secondary}"/>`
        + `<path d="M311,78 C311,73 325,73 325,78" fill="none" stroke="${c.secondary}" stroke-width="1.4" stroke-linecap="round"/>`
        + `<text x="318" y="86.5" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.secondary}">示教运维</text>`
        + `<text x="318" y="94" font-family="monospace" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.text}">88.5%留</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">人形机器人代劳高危工位 + 技工示教协同</text>`
      );
    case 'county_rural_canteen_elder':
      return (
        `<polygon points="208,73 230,59 252,73" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1.1"/>`
        + `<rect x="212" y="73" width="36" height="24" rx="2" fill="${c.surface}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<path d="M222,82 A8,6 0 0,0 238,82 Z" fill="${c.primary}"/>`
        + `<text x="230" y="92.5" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">村幸福院</text>`
        + `<line x1="248" y1="78" x2="294" y2="70" stroke="${c.secondary}" stroke-width="1.2" stroke-dasharray="2.5 2"/>`
        + `<line x1="248" y1="86" x2="294" y2="90" stroke="${c.primary}" stroke-width="1.2" stroke-dasharray="2.5 2"/>`
        + `<rect x="255" y="76" width="34" height="11" rx="2.5" fill="${c.primarySoft}"/>`
        + `<text x="272" y="83.5" font-family="monospace" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">4.5元/餐</text>`
        + `<rect x="294" y="61" width="44" height="16" rx="3" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1"/>`
        + `<text x="316" y="68" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.secondary}">邻里送餐</text>`
        + `<text x="316" y="74.5" font-family="monospace" font-size="4.6" text-anchor="middle" fill="${c.text}">86.4%村</text>`
        + `<rect x="294" y="81" width="44" height="16" rx="3" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1"/>`
        + `<text x="316" y="88" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.opposite}">菜园造血</text>`
        + `<text x="316" y="94.5" font-family="monospace" font-size="4.6" text-anchor="middle" fill="${c.text}">补贴-32%</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">幸福院堂食 + 互助送餐 + 村集体微菜园造血</text>`
      );
    case 'urban_flood_sponge_grid':
      return (
        `<line x1="214" y1="60" x2="211" y2="67" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<line x1="226" y1="60" x2="223" y2="67" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<line x1="238" y1="60" x2="235" y2="67" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<line x1="250" y1="60" x2="247" y2="67" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<rect x="208" y="69" width="52" height="15" rx="3" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<circle cx="215" cy="76.5" r="1.4" fill="${c.primary}"/>`
        + `<circle cx="222" cy="74.5" r="1.2" fill="${c.primary}"/>`
        + `<circle cx="228" cy="78" r="1.4" fill="${c.primary}"/>`
        + `<text x="256" y="78.5" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="end" fill="${c.primary}">下凹蓄滞</text>`
        + `<rect x="208" y="87" width="52" height="12" rx="2.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="0.9"/>`
        + `<text x="234" y="95" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.opposite}">提前 38 min</text>`
        + `<line x1="260" y1="81" x2="285" y2="81" stroke="${c.axis}" stroke-width="1.2" stroke-dasharray="2.5 2"/>`
        + `<circle cx="308" cy="79" r="20" fill="${c.primary}" fill-opacity="0.09" stroke="${c.primary}" stroke-width="1" stroke-dasharray="3 2"/>`
        + `<circle cx="308" cy="79" r="13" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<circle cx="308" cy="79" r="5" fill="${c.opposite}"/>`
        + `<text x="308" y="66.5" font-family="monospace" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">5 min</text>`
        + `<text x="308" y="96.5" font-family="monospace" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.secondary}">91.8%</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">海绵绿地滞水 + 积水哨兵 → 5分钟避险圈</text>`
      );
    case 'agri_seed_nanfan_breeding':
      return (
        `<rect x="208" y="59" width="40" height="38" rx="4" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<path d="M217,64 C224,70 232,70 239,64" fill="none" stroke="${c.primary}" stroke-width="1.3"/>`
        + `<path d="M217,74 C224,68 232,68 239,74" fill="none" stroke="${c.secondary}" stroke-width="1.3"/>`
        + `<path d="M217,84 C224,78 232,78 239,84" fill="none" stroke="${c.primary}" stroke-width="1.3"/>`
        + `<line x1="222" y1="67" x2="222" y2="71" stroke="${c.axis}" stroke-width="0.9"/>`
        + `<line x1="234" y1="67" x2="234" y2="71" stroke="${c.axis}" stroke-width="0.9"/>`
        + `<line x1="222" y1="77" x2="222" y2="81" stroke="${c.axis}" stroke-width="0.9"/>`
        + `<line x1="234" y1="77" x2="234" y2="81" stroke="${c.axis}" stroke-width="0.9"/>`
        + `<text x="228" y="93.5" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">南繁加代</text>`
        + `<line x1="248" y1="78" x2="260" y2="78" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="260" y="59" width="78" height="38" rx="4" fill="${c.canvas}" stroke="${c.border}" stroke-width="0.9"/>`
        + `<rect x="264" y="88" width="70" height="6" rx="1.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="0.7"/>`
        + `<rect x="272" y="75" width="12" height="13" rx="1.5" fill="${c.grid}" stroke="${c.axis}" stroke-width="0.7"/>`
        + `<text x="278" y="72.5" font-family="monospace" font-size="4.6" text-anchor="middle" fill="${c.muted}">463</text>`
        + `<rect x="295" y="66" width="14" height="22" rx="1.5" fill="${c.primary}"/>`
        + `<text x="302" y="64" font-family="monospace" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.primary}">548</text>`
        + `<rect x="313" y="63" width="22" height="12" rx="2.5" fill="${c.secondarySoft}"/>`
        + `<text x="324" y="71" font-family="monospace" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.secondary}">+18%</text>`
        + `<text x="324" y="84" font-family="sans-serif" font-size="4.5" text-anchor="middle" fill="${c.opposite}">盐碱地</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">南繁分子加代育种 → 盐碱地良种稳产增收</text>`
      );
    case 'youth_flexible_gig_social':
      return (
        `<rect x="206" y="59" width="42" height="38" rx="4" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<path d="M219,73 A8,7 0 0,1 235,73 Z" fill="${c.secondary}"/>`
        + `<circle cx="220" cy="81" r="3" fill="none" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<circle cx="234" cy="81" r="3" fill="none" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<line x1="220" y1="81" x2="234" y2="81" stroke="${c.primary}" stroke-width="1.3"/>`
        + `<text x="227" y="93" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.secondary}">按单触发</text>`
        + `<line x1="248" y1="78" x2="257" y2="78" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<path d="M272,60 L287,65 L287,79 C287,89 280,94 272,97 C264,94 257,89 257,79 L257,65 Z" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.3"/>`
        + `<polyline points="265,78 270,83 280,72" fill="none" stroke="${c.primary}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`
        + `<line x1="287" y1="78" x2="296" y2="78" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="296" y="60" width="42" height="16" rx="3" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1"/>`
        + `<text x="317" y="67" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">职伤即时保</text>`
        + `<text x="317" y="73.5" font-family="monospace" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.text}">91.2%覆</text>`
        + `<rect x="296" y="81" width="42" height="16" rx="3" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1"/>`
        + `<text x="317" y="88" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.opposite}">弹性异地续</text>`
        + `<text x="317" y="94.5" font-family="monospace" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.text}">4.6d赔</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">按单计费职业伤害险 + 跨平台弹性接续</text>`
      );
    case 'cross_province_medical_settle':
      return (
        `<rect x="206" y="60" width="38" height="25" rx="3.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<text x="225" y="70.5" font-family="sans-serif" font-size="4.9" font-weight="700" text-anchor="middle" fill="${c.secondary}">参保地</text>`
        + `<text x="225" y="79" font-family="monospace" font-size="4.8" text-anchor="middle" fill="${c.text}">3.2m备案</text>`
        + `<line x1="244" y1="72.5" x2="254" y2="72.5" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="254" y="60" width="36" height="25" rx="3.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<text x="272" y="70.5" font-family="sans-serif" font-size="4.9" font-weight="700" text-anchor="middle" fill="${c.primary}">国家医保</text>`
        + `<text x="272" y="79" font-family="sans-serif" font-size="4.7" text-anchor="middle" fill="${c.text}">跨省联网</text>`
        + `<line x1="290" y1="72.5" x2="300" y2="72.5" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="300" y="60" width="38" height="25" rx="3.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1.1"/>`
        + `<text x="319" y="70.5" font-family="sans-serif" font-size="4.9" font-weight="700" text-anchor="middle" fill="${c.opposite}">就医直结</text>`
        + `<text x="319" y="79" font-family="monospace" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.text}">垫资-76%</text>`
        + `<path d="M319,86 Q272,102 225,86" fill="none" stroke="${c.primary}" stroke-width="1.2" stroke-dasharray="2.5 2"/>`
        + `<rect x="249" y="89" width="46" height="10" rx="2.5" fill="${c.canvas}" stroke="${c.border}" stroke-width="0.7"/>`
        + `<text x="272" y="96" font-family="sans-serif" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.primary}">康复下转社区</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">线上即刻备案 → 跨省刷码直结 → 垫资减负76%</text>`
      );
    case 'cbam_green_export_compliance':
      return (
        `<rect x="206" y="59" width="38" height="17" rx="3" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1"/>`
        + `<text x="225" y="66.5" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.opposite}">工序碳源</text>`
        + `<text x="225" y="73" font-family="monospace" font-size="4.5" text-anchor="middle" fill="${c.text}">-41.6%排</text>`
        + `<rect x="206" y="80" width="38" height="17" rx="3" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1"/>`
        + `<text x="225" y="87.5" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">绿电直供</text>`
        + `<text x="225" y="94" font-family="monospace" font-size="4.5" text-anchor="middle" fill="${c.text}">64.2%占比</text>`
        + `<line x1="244" y1="67.5" x2="256" y2="75" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<line x1="244" y1="88.5" x2="256" y2="81" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<path d="M272,60 L287,65 L287,79 C287,89 280,94 272,97 C264,94 257,89 257,79 L257,65 Z" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.2"/>`
        + `<text x="272" y="76.5" font-family="sans-serif" font-size="4.9" font-weight="700" text-anchor="middle" fill="${c.secondary}">碳账本</text>`
        + `<text x="272" y="85" font-family="monospace" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">5d核证</text>`
        + `<line x1="287" y1="78" x2="296" y2="78" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="296" y="60" width="42" height="37" rx="3.5" fill="${c.canvas}" stroke="${c.border}" stroke-width="0.9"/>`
        + `<text x="317" y="68" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.text}">CBAM税负</text>`
        + `<rect x="303" y="73" width="10" height="19" rx="1.5" fill="${c.opposite}" fill-opacity="0.72"/>`
        + `<rect x="320" y="80" width="10" height="12" rx="1.5" fill="${c.primary}"/>`
        + `<text x="317" y="95.5" font-family="monospace" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.primary}">-38.4%</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">绿电直供溯源 + 碳账本核证 → 压降欧盟关税</text>`
      );
    case 'silver_ltci_home_care':
      return (
        `<rect x="206" y="60" width="38" height="11" rx="2.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="0.9"/>`
        + `<text x="225" y="67.5" font-family="sans-serif" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.opposite}">重度失能</text>`
        + `<rect x="206" y="74" width="38" height="11" rx="2.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="0.9"/>`
        + `<text x="225" y="81.5" font-family="sans-serif" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.secondary}">中度分级</text>`
        + `<rect x="206" y="88" width="38" height="11" rx="2.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="0.9"/>`
        + `<text x="225" y="95.5" font-family="sans-serif" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.primary}">辅具适配</text>`
        + `<line x1="244" y1="79.5" x2="255" y2="79.5" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<polygon points="256,74 272,62 288,74" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<rect x="259" y="74" width="26" height="22" rx="2" fill="${c.surface}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<text x="272" y="84" font-family="sans-serif" font-size="4.9" font-weight="700" text-anchor="middle" fill="${c.primary}">长护险</text>`
        + `<text x="272" y="92" font-family="monospace" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.opposite}">-62.5%</text>`
        + `<line x1="285" y1="74" x2="296" y2="69" stroke="${c.secondary}" stroke-width="1.2"/>`
        + `<line x1="285" y1="86" x2="296" y2="90" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<rect x="296" y="60" width="42" height="17" rx="3" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1"/>`
        + `<text x="317" y="67.5" font-family="sans-serif" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.secondary}">居家护工</text>`
        + `<text x="317" y="74" font-family="monospace" font-size="4.6" text-anchor="middle" fill="${c.text}">+14.8h</text>`
        + `<rect x="296" y="81" width="42" height="17" rx="3" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1"/>`
        + `<text x="317" y="88.5" font-family="sans-serif" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.primary}">辅具租配</text>`
        + `<text x="317" y="95" font-family="monospace" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.text}">24h响应</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">失能评定 → 居家护理工时 + 辅具 24h 租配</text>`
      );
    case 'smart_grid_micro_storage':
      return (
        `<rect x="206" y="60" width="36" height="16" rx="2.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1"/>`
        + `<line x1="212" y1="68" x2="236" y2="68" stroke="${c.secondary}" stroke-width="0.7" stroke-opacity="0.6"/>`
        + `<text x="224" y="71" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.secondary}">屋顶光伏</text>`
        + `<rect x="206" y="81" width="36" height="16" rx="2.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1"/>`
        + `<rect x="210" y="85" width="7" height="8" rx="1" fill="${c.primary}"/>`
        + `<text x="229" y="91" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">储能柜</text>`
        + `<line x1="242" y1="68" x2="255" y2="68" stroke="${c.secondary}" stroke-width="1.3"/>`
        + `<line x1="242" y1="89" x2="255" y2="89" stroke="${c.primary}" stroke-width="1.3"/>`
        + `<line x1="255" y1="61" x2="255" y2="96" stroke="${c.axis}" stroke-width="2.2" stroke-linecap="round"/>`
        + `<text x="263" y="66" font-family="sans-serif" font-size="4.6" font-weight="700" fill="${c.axis}">母线</text>`
        + `<line x1="255" y1="78" x2="270" y2="78" stroke="${c.opposite}" stroke-width="1.3"/>`
        + `<rect x="270" y="60" width="68" height="37" rx="3.5" fill="${c.canvas}" stroke="${c.border}" stroke-width="0.9"/>`
        + `<text x="304" y="68" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.text}">峰谷套利与削峰</text>`
        + `<path d="M275,90 L286,88 L296,72 L308,86 L320,73 L332,90" fill="none" stroke="${c.opposite}" stroke-width="1.2" stroke-dasharray="2.5 1.8"/>`
        + `<path d="M275,87 L288,83 L300,80 L312,82 L322,80 L332,83" fill="none" stroke="${c.primary}" stroke-width="1.7"/>`
        + `<text x="304" y="95" font-family="monospace" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.primary}">需量 -26.4%</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">光储直柔母线联动 → 消纳 91.8% · 套利削峰</text>`
      );
    case 'rural_ecomm_live_cluster':
      return (
        `<rect x="206" y="60" width="38" height="26" rx="3.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<circle cx="218" cy="68" r="2.6" fill="${c.secondary}"/>`
        + `<circle cx="226" cy="68" r="2.6" fill="${c.opposite}"/>`
        + `<circle cx="233" cy="68" r="2.1" fill="${c.primary}"/>`
        + `<text x="225" y="79" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.secondary}">分级选品</text>`
        + `<line x1="244" y1="73" x2="254" y2="73" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="254" y="60" width="36" height="26" rx="3.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<rect x="266" y="64" width="12" height="8" rx="1.5" fill="${c.primary}" fill-opacity="0.28" stroke="${c.primary}" stroke-width="0.8"/>`
        + `<text x="272" y="80" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">溯源品控</text>`
        + `<line x1="290" y1="73" x2="300" y2="73" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="300" y="60" width="38" height="26" rx="3.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1.1"/>`
        + `<polygon points="309,70 319,63 329,70" fill="${c.opposite}"/>`
        + `<text x="319" y="80" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.opposite}">云仓统发</text>`
        + `<rect x="206" y="90" width="132" height="10" rx="2.5" fill="${c.canvas}" stroke="${c.border}" stroke-width="0.7"/>`
        + `<text x="272" y="97" font-family="monospace" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">退赔 8.4% → 2.1% · 地标溢价 +28.6%</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">果径分级选品池 + 一物一码 + 县域云仓履约</text>`
      );
    case 'autonomous_robotaxi_trust':
      return (
        `<path d="M236,68 A16,14 0 0,1 236,92" fill="none" stroke="${c.secondary}" stroke-width="1.1" stroke-dasharray="2.5 2"/>`
        + `<path d="M242,72 A11,10 0 0,1 242,88" fill="none" stroke="${c.primary}" stroke-width="1.3"/>`
        + `<rect x="208" y="72" width="28" height="14" rx="4" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<rect x="215" y="67" width="14" height="5" rx="2" fill="${c.primary}"/>`
        + `<circle cx="215" cy="87" r="2.8" fill="${c.axis}"/>`
        + `<circle cx="229" cy="87" r="2.8" fill="${c.axis}"/>`
        + `<text x="222" y="81" font-family="sans-serif" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.primary}">L4智驾</text>`
        + `<line x1="246" y1="80" x2="262" y2="70" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<line x1="246" y1="80" x2="262" y2="90" stroke="${c.opposite}" stroke-width="1.2"/>`
        + `<rect x="262" y="59" width="76" height="17" rx="3" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1"/>`
        + `<text x="300" y="66.5" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">透明轨迹 HMI 屏</text>`
        + `<text x="300" y="73" font-family="monospace" font-size="4.5" text-anchor="middle" fill="${c.text}">接管焦虑 -43.2%</text>`
        + `<rect x="262" y="80" width="76" height="17" rx="3" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1"/>`
        + `<text x="300" y="87.5" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.opposite}">云端安全员兜底</text>`
        + `<text x="300" y="94" font-family="monospace" font-size="4.5" font-weight="700" text-anchor="middle" fill="${c.text}">复乘意愿 74.8%</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">透明意图交互 + 远程安全接管 → 破除接管焦虑</text>`
      );
    case 'hospital_ai_triage_safety':
      return (
        `<rect x="206" y="64" width="34" height="26" rx="3.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<text x="223" y="75" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.secondary}">急诊主诉</text>`
        + `<text x="223" y="83" font-family="sans-serif" font-size="4.5" text-anchor="middle" fill="${c.text}">多模态录</text>`
        + `<line x1="240" y1="77" x2="250" y2="77" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<polygon points="271,60 292,77 271,94 250,77" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<text x="271" y="75.5" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">智能预检</text>`
        + `<text x="271" y="83" font-family="monospace" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.opposite}">93.4%</text>`
        + `<line x1="292" y1="77" x2="302" y2="69" stroke="${c.opposite}" stroke-width="1.2"/>`
        + `<line x1="292" y1="77" x2="302" y2="86" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<rect x="302" y="60" width="36" height="16" rx="3" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1"/>`
        + `<text x="320" y="67" font-family="sans-serif" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.opposite}">红区预警</text>`
        + `<text x="320" y="73.5" font-family="monospace" font-size="4.4" text-anchor="middle" fill="${c.text}">零漏诊</text>`
        + `<rect x="302" y="80" width="36" height="16" rx="3" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1"/>`
        + `<text x="320" y="87" font-family="sans-serif" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.primary}">医生双签</text>`
        + `<text x="320" y="93.5" font-family="monospace" font-size="4.4" font-weight="700" text-anchor="middle" fill="${c.text}">89.2%信</text>`
        + `<path d="M320,96 Q271,103 223,90" fill="none" stroke="${c.secondary}" stroke-width="1.1" stroke-dasharray="2.5 2"/>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">智能预检提速 44.8% + 医生复核闭环兜底容错</text>`
      );
    case 'quantum_computing_supply_chain':
      return (
        `<rect x="208" y="59" width="28" height="38" rx="4" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<text x="222" y="65" font-family="monospace" font-size="4.4" font-weight="700" text-anchor="middle" fill="${c.primary}">10mK</text>`
        + `<line x1="211" y1="68" x2="233" y2="68" stroke="${c.primary}" stroke-width="0.9"/>`
        + `<line x1="213" y1="75" x2="231" y2="75" stroke="${c.secondary}" stroke-width="0.9"/>`
        + `<line x1="216" y1="82" x2="228" y2="82" stroke="${c.opposite}" stroke-width="0.9"/>`
        + `<circle cx="222" cy="87.5" r="2.4" fill="${c.opposite}"/>`
        + `<text x="222" y="95.5" font-family="sans-serif" font-size="4.3" font-weight="700" text-anchor="middle" fill="${c.text}">稀释制冷</text>`
        + `<line x1="236" y1="78" x2="248" y2="78" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="248" y="59" width="42" height="38" rx="3.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<text x="269" y="67.5" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.secondary}">国产测控</text>`
        + `<polyline points="252,79 258,79 261,72 265,85 269,73 273,83 276,79 286,79" fill="none" stroke="${c.primary}" stroke-width="1.3" stroke-linejoin="round"/>`
        + `<text x="269" y="93.5" font-family="monospace" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">99.92%</text>`
        + `<line x1="290" y1="78" x2="300" y2="78" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="300" y="59" width="38" height="38" rx="4" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1.1"/>`
        + `<circle cx="315" cy="70" r="4.5" fill="${c.opposite}" fill-opacity="0.28"/>`
        + `<circle cx="322" cy="69" r="5" fill="${c.opposite}" fill-opacity="0.35"/>`
        + `<rect x="311" y="70" width="16" height="5.5" rx="2" fill="${c.opposite}" fill-opacity="0.3"/>`
        + `<text x="319" y="84" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.opposite}">算力云</text>`
        + `<text x="319" y="93.5" font-family="monospace" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.text}">-41.8%费</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">极低温制冷 → 国产测控脉控 → 量子算力云接入</text>`
      );
    case 'green_hydrogen_port_corridor':
      return (
        `<rect x="206" y="59" width="36" height="38" rx="3.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<line x1="224" y1="69" x2="224" y2="83" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<line x1="224" y1="69" x2="217" y2="63" stroke="${c.primary}" stroke-width="1.3" stroke-linecap="round"/>`
        + `<line x1="224" y1="69" x2="231" y2="63" stroke="${c.primary}" stroke-width="1.3" stroke-linecap="round"/>`
        + `<line x1="224" y1="69" x2="224" y2="77" stroke="${c.primary}" stroke-width="1.3" stroke-linecap="round"/>`
        + `<circle cx="224" cy="69" r="1.8" fill="${c.opposite}"/>`
        + `<text x="224" y="92.5" font-family="sans-serif" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.primary}">海上绿氢</text>`
        + `<line x1="242" y1="78" x2="252" y2="78" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="252" y="59" width="38" height="38" rx="3.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<circle cx="263" cy="71" r="6" fill="${c.surface}" stroke="${c.secondary}" stroke-width="1"/>`
        + `<circle cx="279" cy="71" r="6" fill="${c.surface}" stroke="${c.primary}" stroke-width="1"/>`
        + `<text x="263" y="72.8" font-family="monospace" font-size="4.3" font-weight="700" text-anchor="middle" fill="${c.secondary}">NH3</text>`
        + `<text x="279" y="72.8" font-family="monospace" font-size="4" font-weight="700" text-anchor="middle" fill="${c.primary}">CH3OH</text>`
        + `<text x="271" y="85.5" font-family="sans-serif" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.secondary}">港口储运</text>`
        + `<text x="271" y="93.5" font-family="monospace" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.opposite}">-84.6%碳</text>`
        + `<line x1="290" y1="78" x2="300" y2="78" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="300" y="59" width="38" height="38" rx="3.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1.1"/>`
        + `<text x="319" y="67.5" font-family="sans-serif" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.opposite}">船对船加注</text>`
        + `<rect x="311" y="71" width="16" height="8" rx="1" fill="${c.opposite}"/>`
        + `<polygon points="305,79 333,79 329,86 309,86" fill="${c.primary}"/>`
        + `<path d="M304,89 Q312,87 319,89 T334,89" fill="none" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<text x="319" y="95.5" font-family="monospace" font-size="4.5" font-weight="700" text-anchor="middle" fill="${c.text}">17.8元/kg</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">深远海风电制氢 → 氨醇合成储运 → 船对船加注</text>`
      );
    case 'smart_rail_transit_tod':
      return (
        `<rect x="210" y="59" width="18" height="16" rx="1.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1"/>`
        + `<rect x="232" y="61" width="22" height="14" rx="1.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1"/>`
        + `<rect x="258" y="59" width="28" height="16" rx="1.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1"/>`
        + `<text x="272" y="69" font-family="sans-serif" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.primary}">TOD 商业</text>`
        + `<rect x="206" y="77" width="84" height="10" rx="2" fill="${c.surface}" stroke="${c.axis}" stroke-width="1"/>`
        + `<text x="248" y="84" font-family="sans-serif" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.opposite}">同台换乘 · 3.4 min</text>`
        + `<rect x="210" y="89" width="36" height="7" rx="2" fill="${c.primary}"/>`
        + `<rect x="252" y="89" width="34" height="7" rx="2" fill="${c.secondary}"/>`
        + `<line x1="206" y1="97.5" x2="290" y2="97.5" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<circle cx="317" cy="79" r="19" fill="${c.primary}" fill-opacity="0.1" stroke="${c.primary}" stroke-width="1" stroke-dasharray="3 2"/>`
        + `<circle cx="317" cy="79" r="12" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<circle cx="317" cy="79" r="4" fill="${c.opposite}"/>`
        + `<text x="317" y="67.5" font-family="monospace" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.primary}">500m</text>`
        + `<text x="317" y="96.5" font-family="monospace" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.secondary}">66.8%</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">站上复合开发 + 立体同台换乘 → 500m 活力圈</text>`
      );
    case 'digital_renminbi_crossborder':
      return (
        `<rect x="206" y="61" width="36" height="35" rx="3.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<circle cx="224" cy="73" r="6.5" fill="${c.surface}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<text x="224" y="75" font-family="monospace" font-size="4.5" font-weight="700" text-anchor="middle" fill="${c.primary}">e-CNY</text>`
        + `<text x="224" y="89.5" font-family="sans-serif" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.primary}">外贸付款</text>`
        + `<path d="M242,75 Q272,58 302,75" fill="none" stroke="${c.primary}" stroke-width="1.8"/>`
        + `<path d="M242,88 Q272,102 302,88" fill="none" stroke="${c.opposite}" stroke-width="1.1" stroke-dasharray="2.5 2"/>`
        + `<rect x="252" y="67" width="40" height="15" rx="3" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<text x="272" y="73.5" font-family="monospace" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.secondary}">mBridge</text>`
        + `<text x="272" y="80" font-family="monospace" font-size="4.4" font-weight="700" text-anchor="middle" fill="${c.primary}">PvP 8.5s</text>`
        + `<text x="272" y="98.5" font-family="monospace" font-size="4.3" text-anchor="middle" fill="${c.opposite}">SWIFT 2.8d</text>`
        + `<rect x="302" y="61" width="36" height="35" rx="3.5" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1.1"/>`
        + `<text x="320" y="73.5" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.opposite}">境外直收</text>`
        + `<text x="320" y="83" font-family="monospace" font-size="5" font-weight="700" text-anchor="middle" fill="${c.primary}">-52.4%</text>`
        + `<text x="320" y="91.5" font-family="sans-serif" font-size="4.5" text-anchor="middle" fill="${c.text}">省代理费</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">跳过多级代理行 → mBridge 秒级 PvP 原子直清</text>`
      );
    case 'precision_oncology_companion':
      return (
        `<rect x="206" y="60" width="38" height="37" rx="3.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<text x="225" y="69" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.secondary}">NGS 伴随</text>`
        + `<rect x="212" y="73" width="12" height="3" rx="1" fill="${c.primary}"/>`
        + `<rect x="226" y="73" width="12" height="3" rx="1" fill="${c.opposite}"/>`
        + `<rect x="212" y="79" width="18" height="3" rx="1" fill="${c.secondary}"/>`
        + `<rect x="212" y="85" width="10" height="3" rx="1" fill="${c.primary}"/>`
        + `<rect x="224" y="85" width="14" height="3" rx="1" fill="${c.opposite}"/>`
        + `<text x="225" y="94.5" font-family="monospace" font-size="4.4" text-anchor="middle" fill="${c.text}">靶点分型</text>`
        + `<line x1="244" y1="78" x2="255" y2="78" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<path d="M272,60 L289,66 L289,80 C289,89 281,95 272,98 C263,95 255,89 255,80 L255,66 Z" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<text x="272" y="75" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.primary}">医保共付</text>`
        + `<text x="272" y="84.5" font-family="monospace" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.opposite}">-58.2%</text>`
        + `<line x1="289" y1="74" x2="300" y2="68" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<line x1="289" y1="84" x2="300" y2="88" stroke="${c.opposite}" stroke-width="1.2"/>`
        + `<rect x="300" y="60" width="38" height="16" rx="3" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1"/>`
        + `<text x="319" y="67" font-family="sans-serif" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.primary}">基层送检</text>`
        + `<text x="319" y="73.5" font-family="monospace" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.text}">69.4%</text>`
        + `<rect x="300" y="80" width="38" height="16" rx="3" fill="${c.oppositeSoft}" stroke="${c.opposite}" stroke-width="1"/>`
        + `<text x="319" y="87" font-family="sans-serif" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.opposite}">靶向匹配</text>`
        + `<text x="319" y="93.5" font-family="monospace" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.text}">86.5%</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">NGS 基因分型 → 药诊捆绑共付 → 县域精准匹配</text>`
      );
    case 'rural_water_conservancy_twin':
    default:
      return (
        `<rect x="206" y="60" width="36" height="37" rx="3.5" fill="${c.secondarySoft}" stroke="${c.secondary}" stroke-width="1.1"/>`
        + `<path d="M217,67 Q224,62 231,67" fill="none" stroke="${c.secondary}" stroke-width="1.2"/>`
        + `<path d="M220,71 Q224,68 228,71" fill="none" stroke="${c.primary}" stroke-width="1.2"/>`
        + `<circle cx="224" cy="75" r="2.2" fill="${c.opposite}"/>`
        + `<text x="224" y="85" font-family="sans-serif" font-size="4.8" font-weight="700" text-anchor="middle" fill="${c.secondary}">孪生墒情</text>`
        + `<text x="224" y="93" font-family="monospace" font-size="4.5" text-anchor="middle" fill="${c.text}">动态配水</text>`
        + `<line x1="242" y1="78" x2="252" y2="78" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="252" y="60" width="40" height="37" rx="3.5" fill="${c.canvas}" stroke="${c.border}" stroke-width="1"/>`
        + `<rect x="255" y="76" width="14" height="14" rx="1" fill="${c.secondary}" fill-opacity="0.35"/>`
        + `<rect x="275" y="82" width="14" height="8" rx="1" fill="${c.primary}" fill-opacity="0.45"/>`
        + `<rect x="269" y="68" width="6" height="22" rx="1" fill="${c.primary}"/>`
        + `<rect x="265" y="63" width="14" height="4" rx="1" fill="${c.opposite}"/>`
        + `<text x="272" y="95.5" font-family="sans-serif" font-size="4.5" font-weight="700" text-anchor="middle" fill="${c.primary}">太阳能闸门</text>`
        + `<line x1="292" y1="78" x2="302" y2="78" stroke="${c.axis}" stroke-width="1.2"/>`
        + `<rect x="302" y="60" width="36" height="37" rx="3.5" fill="${c.primarySoft}" stroke="${c.primary}" stroke-width="1.1"/>`
        + `<line x1="312" y1="81" x2="312" y2="71" stroke="${c.primary}" stroke-width="1.4" stroke-linecap="round"/>`
        + `<line x1="320" y1="81" x2="320" y2="69" stroke="${c.primary}" stroke-width="1.4" stroke-linecap="round"/>`
        + `<line x1="328" y1="81" x2="328" y2="72" stroke="${c.primary}" stroke-width="1.4" stroke-linecap="round"/>`
        + `<text x="320" y="88.5" font-family="monospace" font-size="4.7" font-weight="700" text-anchor="middle" fill="${c.opposite}">-29.6%水</text>`
        + `<text x="320" y="95" font-family="monospace" font-size="4.6" font-weight="700" text-anchor="middle" fill="${c.primary}">+24.8%收</text>`
        + `<text x="272" y="110" font-family="sans-serif" font-size="5.4" text-anchor="middle" fill="${c.muted}">墒情孪生推演 → 智能闸门控流 → 节水回购增收</text>`
      );
  }
}

export function renderBentoInfographicSvg(
  archetype: BentoInfographicArchetype,
  title: string,
  ink: FigureInk = '#0F766E',
): string {
  const c = deriveInkPalette(ink);
  const meta = BENTO_PLATE_META[archetype];

  // Top Header + Domain Badge + Title (visual-width auto-fit, zero ellipsis truncation)
  const cleanTitle = title.trim();
  const titleFont = fitFontSize(cleanTitle, 230, 8.4, 6.2);
  const subFont = fitFontSize(meta.subtitle, 300, 6.1, 5.0);
  const badgeFont = fitFontSize(meta.domainBadge, 76, 5.8, 4.8);
  const waffleFont = fitFontSize(meta.waffleLabel, 88, 6.0, 4.8);
  const footFont = fitFontSize(meta.footnote, 236, 6.0, 5.0);

  const waffleUnits = Array.from({ length: 10 }, (_, idx) => {
    const cx = 112 + idx * 7;
    const active = idx < meta.waffleRatio;
    return `<rect x="${cx}" y="103" width="5" height="9" rx="1.4" fill="${active ? c.primary : c.grid}"/>`;
  }).join('');

  // Zone A (Top-Left KPI bento): 3 mini tiles stacked nicely
  const kpiCards = meta.kpis
    .map((kpi, idx) => {
      const kx = 18 + idx * 56;
      const accentColor = idx === 0 ? c.primary : idx === 1 ? c.opposite : c.secondary;
      const valFont = fitFontSize(kpi.value, 47, 8.6, 5.8);
      const lblFont = fitFontSize(kpi.label, 47, 5.8, 4.7);
      return (
        `<rect x="${kx}" y="58" width="52" height="39" rx="4" fill="${c.surface}" stroke="${c.border}" stroke-width="0.7"/>`
        + `<rect x="${kx}" y="58" width="52" height="3.5" rx="1.5" fill="${accentColor}"/>`
        + `<text x="${kx + 26}" y="76" font-family="sans-serif" font-size="${valFont}" font-weight="700" text-anchor="middle" fill="${accentColor}">${escapeXml(kpi.value)}</text>`
        + `<text x="${kx + 26}" y="89" font-family="sans-serif" font-size="${lblFont}" text-anchor="middle" fill="${c.muted}">${escapeXml(kpi.label.trim())}</text>`
      );
    })
    .join('');

  // Zone C-Left: Horizontal comparison bars
  const barRows = meta.bars
    .map(([label, pct], idx) => {
      const ry = 148 + idx * 19;
      const bw = Math.round((Math.max(10, Math.min(100, pct)) / 100) * 84);
      const fillCol = idx === 0 ? c.primary : idx === 1 ? c.secondary : c.opposite;
      const barLblFont = fitFontSize(label, 60, 6.2, 5.0);
      return (
        `<text x="20" y="${ry + 7}" font-family="sans-serif" font-size="${barLblFont}" fill="${c.text}">${escapeXml(label.trim())}</text>`
        + `<rect x="82" y="${ry}" width="84" height="9" rx="2.5" fill="${c.grid}"/>`
        + `<rect x="82" y="${ry}" width="${bw}" height="9" rx="2.5" fill="${fillCol}"/>`
        + `<text x="170" y="${ry + 7.2}" font-family="monospace" font-size="6.2" font-weight="700" text-anchor="start" fill="${fillCol}">${pct}%</text>`
      );
    })
    .join('');

  // Zone C-Right: Micro Booktabs summary rows
  const tableRows = meta.rows
    .map(([dim, v1, v2], idx) => {
      const ty = 158 + idx * 15;
      const dimFont = fitFontSize(dim, 56, 5.9, 4.7);
      const v1Font = fitFontSize(v1, 38, 5.9, 4.7);
      const v2Font = fitFontSize(v2, 46, 5.8, 4.7);
      return (
        `<text x="198" y="${ty}" font-family="sans-serif" font-size="${dimFont}" fill="${c.text}">${escapeXml(dim.trim())}</text>`
        + `<text x="274" y="${ty}" font-family="monospace" font-size="${v1Font}" font-weight="700" text-anchor="middle" fill="${c.primary}">${escapeXml(v1.trim())}</text>`
        + `<text x="339" y="${ty}" font-family="sans-serif" font-size="${v2Font}" text-anchor="end" fill="${c.muted}">${escapeXml(v2.trim())}</text>`
      );
    })
    .join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 228" width="360" height="228" fill="none">`
    + `<rect x="0" y="0" width="360" height="228" rx="8" fill="${c.canvas}"/>`
    + `<rect x="0.5" y="0.5" width="359" height="227" rx="8" stroke="${c.border}" stroke-width="1"/>`
    // Header Banner
    + `<rect x="12" y="8" width="336" height="30" rx="5" fill="${c.surface}" stroke="${c.border}" stroke-width="0.8"/>`
    + `<rect x="12" y="8" width="4" height="30" rx="2" fill="${c.primary}"/>`
    + `<text x="22" y="21.5" font-family="sans-serif" font-size="${titleFont}" font-weight="700" fill="${c.text}">${escapeXml(cleanTitle)}</text>`
    + `<text x="22" y="32.5" font-family="sans-serif" font-size="${subFont}" fill="${c.muted}">${escapeXml(meta.subtitle.trim())}</text>`
    + `<rect x="258" y="13" width="84" height="14" rx="7" fill="${c.primarySoft}"/>`
    + `<text x="300" y="22.3" font-family="sans-serif" font-size="${badgeFont}" font-weight="700" text-anchor="middle" fill="${c.primary}">${escapeXml(meta.domainBadge.trim())}</text>`
    // Zone A (Top-Left KPI Card)
    + `<rect x="12" y="42" width="178" height="76" rx="6" fill="${c.surface}" stroke="${c.border}" stroke-width="0.8"/>`
    + `<text x="20" y="53" font-family="sans-serif" font-size="6.8" font-weight="700" fill="${c.text}">核心指标与实证样板读数</text>`
    + kpiCards
    + `<text x="20" y="110.5" font-family="sans-serif" font-size="${waffleFont}" font-weight="700" fill="${c.secondary}">${escapeXml(meta.waffleLabel.trim())}</text>`
    + waffleUnits
    // Zone B (Top-Right Vector Scenario Glyph)
    + `<rect x="194" y="42" width="154" height="76" rx="6" fill="${c.surface}" stroke="${c.border}" stroke-width="0.8"/>`
    + `<text x="202" y="53" font-family="sans-serif" font-size="6.8" font-weight="700" fill="${c.text}">机理场景结构图解</text>`
    + renderZoneGlyph(archetype, c)
    // Zone C (Bottom Comparative Bento + Micro Booktabs)
    + `<rect x="12" y="122" width="336" height="84" rx="6" fill="${c.surface}" stroke="${c.border}" stroke-width="0.8"/>`
    + `<text x="20" y="135" font-family="sans-serif" font-size="6.8" font-weight="700" fill="${c.text}">重点触点/路径权重对照</text>`
    + barRows
    + `<line x1="190" y1="128" x2="190" y2="200" stroke="${c.grid}" stroke-width="0.8" stroke-dasharray="2 2"/>`
    + `<text x="198" y="135" font-family="sans-serif" font-size="6.8" font-weight="700" fill="${c.text}">机制对比三线摘要</text>`
    + `<line x1="198" y1="140" x2="340" y2="140" stroke="${c.axis}" stroke-width="1.2"/>`
    + `<text x="198" y="147.5" font-family="sans-serif" font-size="5.8" font-weight="700" fill="${c.muted}">维度/方案</text>`
    + `<text x="274" y="147.5" font-family="sans-serif" font-size="5.8" font-weight="700" text-anchor="middle" fill="${c.muted}">基准表现</text>`
    + `<text x="339" y="147.5" font-family="sans-serif" font-size="5.8" font-weight="700" text-anchor="end" fill="${c.muted}">效应诊断</text>`
    + `<line x1="198" y1="150" x2="340" y2="150" stroke="${c.border}" stroke-width="0.7"/>`
    + tableRows
    + `<line x1="198" y1="197" x2="340" y2="197" stroke="${c.axis}" stroke-width="1.2"/>`
    // Footer Note
    + `<text x="14" y="218" font-family="sans-serif" font-size="${footFont}" fill="${c.muted}">${escapeXml(meta.footnote.trim())}</text>`
    + `<text x="346" y="218" font-family="sans-serif" font-size="6" font-weight="700" text-anchor="end" fill="${c.primary}">EVI-X 专题信息图谱</text>`
    + `</svg>`;

  return assertStrictOfficeVector(assertSvgSafe(svg));
}
