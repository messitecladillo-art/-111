/**
 * The modules the 证见 agent opens in its side panel. Each hosts one workbench module under that module's own hash
 * route, so a module that moves the user on (the analysis sending a result to the report) moves the panel with it.
 */
export type RoomId = 'overview' | 'diagnose' | 'rules' | 'design' | 'sampling' | 'analysis' | 'canvas' | 'editor' | 'defense'
  | 'cases' | 'silicon' | 'exam' | 'preflight' | 'workspace' | 'services';
/** The overview, the research path in working order, references (they inform, they conclude nothing), and tools. */
export type RoomGroup = 'lobby' | 'path' | 'gallery' | 'tools';
export type Room = {
  id: RoomId; name: string; group: RoomGroup;
  /** One character that names the room in the compact rail. */
  glyph: string;
  /** What the room is for, in one line. */
  line: string;
  /** The slash command that opens the room, and the words that name it in a sentence. */
  command: string; aliases: readonly string[];
};

export const ROOM_GROUPS: Record<RoomGroup, string> = { lobby: '', path: '研究流程', gallery: '参考', tools: '工具' };

/** Modules go by the names the product already uses; the 镜室 room names remain aliases, so "打开问卷室" still works. */
export const ROOMS: readonly Room[] = [
  { id: 'overview', name: '项目全景', glyph: '全', group: 'lobby', line: '哪里的证据已经到位，哪里还缺，下一步做什么。', command: '全景', aliases: ['项目全景', '全景', '前厅', '概览', '总览', '首页'] },
  { id: 'diagnose', name: '选题诊断', glyph: '选', group: 'path', line: '结合热点、地区与团队资源筛选选题，检查研究准备度。', command: '选题', aliases: ['选题诊断', '选题室', '选题', '诊断', '准备度', '热点', '研究方向'] },
  { id: 'rules', name: '规则门禁', glyph: '规', group: 'path', line: '对齐届次、组别、赛区、赛道与阶段，锁定适用规则。', command: '规则', aliases: ['规则门禁', '规则室', '规则', '门禁', '赛事规则', '组别', '赛区', '赛道'] },
  { id: 'design', name: '问卷设计', glyph: '问', group: 'path', line: '把研究问题、题项、变量与计划分析逐一对齐。', command: '问卷', aliases: ['问卷设计', '问卷室', '问卷', '题项', '量表', '题目', '出题'] },
  { id: 'sampling', name: '抽样设计', glyph: '抽', group: 'path', line: '抽样框、样本量、分配、抽取、估计与加权。', command: '抽样', aliases: ['抽样设计', '抽样室', '抽样', '样本量', '抽样框', '分层', '整群', '配额', '加权'] },
  { id: 'analysis', name: '数据分析', glyph: '析', group: 'path', line: '导入数据、质控清洗、检验与图表，结果登记后送进报告。', command: '分析', aliases: ['数据分析', '分析室', '分析', '数据', '统计', '检验', '清洗', '质控', '信度', '效度', '回归', '图表'] },
  { id: 'canvas', name: '研究画布', glyph: '画', group: 'path', line: '把问卷、数据、统计与图表连成一条可运行、可复核的流程。', command: '画布', aliases: ['研究画布', '画布', '流程图', '节点', '工作流'] },
  { id: 'editor', name: '报告与 PPT', glyph: '报', group: 'path', line: '按蓝图写报告，排版 Word 与 PPT，对标体检。', command: '报告', aliases: ['报告与 PPT', '报告室', '报告', '写作', '论文', '排版', '幻灯片', 'PPT', 'Word', '摘要', '参考文献'] },
  { id: 'defense', name: '路演答辩', glyph: '答', group: 'path', line: '按主题演练追问，定位证据，编排讲述时间。', command: '答辩', aliases: ['路演答辩', '答辩室', '答辩', '路演', '演练', '追问', '讲稿'] },
  { id: 'cases', name: '获奖案例', glyph: '案', group: 'gallery', line: '对照真实获奖案例；它只作参照，不替你下结论。', command: '案例', aliases: ['获奖案例', '案例库', '案例', '获奖', '范例', '往届'] },
  { id: 'silicon', name: '硅基样本', glyph: '硅', group: 'gallery', line: '让 AI 扮演设定人群预答问卷，在真人作答前发现问题。', command: '硅基', aliases: ['硅基样本', '硅基', '模拟作答', '预答', '预测试', '虚拟样本', '模拟人群'] },
  { id: 'exam', name: '网赛刷题', glyph: '网', group: 'tools', line: '按章节练习，重做错题，用模拟自测掌握调查方法。', command: '题库', aliases: ['网赛刷题', '网赛题库', '网赛', '刷题', '题库', '错题', '练习'] },
  { id: 'preflight', name: '提交前体检', glyph: '提', group: 'tools', line: '检查身份与编辑残留，定位文件部件并下载记录。', command: '提交', aliases: ['提交前体检', '提交前', '提交检查', '匿名检查', '编辑残留', '元数据'] },
  { id: 'workspace', name: '项目门户', glyph: '项', group: 'tools', line: '创建团队项目，保存协作登记与问卷版本。', command: '项目', aliases: ['项目门户', '团队项目', '协作', '生命周期'] },
  { id: 'services', name: '模型服务', glyph: '模', group: 'tools', line: '接入自己的 API Key，为研究能力选择服务。', command: '模型', aliases: ['模型服务', '密钥', 'API Key', '接入模型'] },
];

export const roomById = (id: RoomId): Room => ROOMS.find(r => r.id === id)!;
export const isRoomId = (value: string): value is RoomId => ROOMS.some(r => r.id === value);
