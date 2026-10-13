/**
 * Node catalog for the research canvas. Every node kind declares its ports, its capability and the
 * workbench section that holds its full editor. Only capabilities the product already implements are
 * runnable here; anything else is a reference that opens the existing editor, never a placeholder
 * that pretends to compute.
 */
export type PortType = 'dataset' | 'result' | 'chart' | 'bundle';
export type InputPort = { id: string; label: string; accepts: PortType[]; multiple?: boolean; optional?: boolean };
export type OutputPort = { id: string; label: string; type: PortType | 'passthrough' };
export type Capability = 'run' | 'reference' | 'note';
export type CategoryId = 'design' | 'questionnaire' | 'sample' | 'data' | 'stats' | 'chart' | 'flow' | 'output';
/** Workbench sections a node can open; mirrors the section ids in components/workbench/shell-kit.tsx. */
export type EditorSection = 'design' | 'silicon' | 'analysis' | 'editor' | 'defense' | 'diagnose' | 'cases' | 'rules';

export type StatMethod = 'frequency' | 'numeric' | 'groups' | 'crosstab' | 'pearson' | 'spearman' | 'alpha';
export type NodeKind =
  | 'question' | 'material' | 'method' | 'note'
  | 'questionnaire' | 'silicon'
  | 'dataset' | 'filter' | 'missing'
  | 'frequency' | 'numeric' | 'groups' | 'crosstab' | 'pearson' | 'spearman' | 'alpha'
  | 'chart'
  | 'join' | 'review'
  | 'conclusion' | 'report' | 'defense' | 'topics' | 'cases' | 'rules'
  | 'group';

export type NodeDef = {
  kind: NodeKind; title: string; category: CategoryId; capability: Capability; summary: string;
  inputs: InputPort[]; outputs: OutputPort[]; section?: EditorSection; boundary?: string; keywords?: string;
};

const datasetIn: InputPort = { id: 'data', label: '数据', accepts: ['dataset'] };
const resultOut: OutputPort = { id: 'result', label: '结果', type: 'result' };
const statBoundary: Record<StatMethod, string> = {
  frequency: '比例分母为该列非缺失样本，不推断总体。',
  numeric: '标准差用 n−1，四分位数为 Type 7。',
  groups: '两组用 Welch t 检验、多组用 Welch 方差分析，附秩检验对照与效应量；检验以随机抽样为前提，不证明因果。',
  crosstab: 'χ² 不作连续性校正，报告 p 值与 Cramér V；2×2 稀疏表以 Fisher 精确检验为准。',
  pearson: '报告双侧 p 与 Fisher z 95% 区间；相关不证明因果。',
  spearman: 'p 值为 t 近似；有序编码须保持真实顺序，不证明因果。',
  alpha: '原始 Cronbach α 只描述内部一致性，不证明单维性或效度。',
};
const stat = (kind: StatMethod, title: string, summary: string, roles: number, keywords = ''): NodeDef => ({
  kind, title, category: 'stats', capability: 'run', summary, inputs: [datasetIn], outputs: [resultOut], section: 'analysis', boundary: statBoundary[kind], keywords: `统计 ${keywords} ${roles}`,
});

export const NODE_DEFS: readonly NodeDef[] = [
  { kind: 'question', title: '研究问题', category: 'design', capability: 'note', summary: '写下要回答的问题、决策者与证据缺口。', inputs: [], outputs: [], keywords: '问题 决策 目标' },
  { kind: 'material', title: '材料引用', category: 'design', capability: 'note', summary: '记录一份文献、政策或访谈材料的出处与要点。', inputs: [], outputs: [], keywords: '文献 资料 来源 引用' },
  { kind: 'method', title: '方法卡', category: 'design', capability: 'note', summary: '说明选择某种方法的理由与边界。', inputs: [], outputs: [], keywords: '方法 理由 设计' },
  { kind: 'note', title: '注释', category: 'design', capability: 'note', summary: '自由备注，不参与运行。', inputs: [], outputs: [], keywords: '备注 说明' },
  { kind: 'questionnaire', title: '问卷', category: 'questionnaire', capability: 'reference', summary: '引用「问卷设计」中的当前草稿，在问卷编辑器中修改。', inputs: [], outputs: [], section: 'design', keywords: '问卷 题目 设计' },
  { kind: 'silicon', title: '硅基样本预测试', category: 'sample', capability: 'reference', summary: '在「硅基样本」中让模型扮演虚构受访者预答问卷；结果只用于预测试。', inputs: [], outputs: [], section: 'silicon', keywords: '硅基 模拟 预测试 人设' },
  { kind: 'dataset', title: '数据集', category: 'data', capability: 'run', summary: '读取「数据分析」中已载入的数据，或在画布上选择本地 CSV（只在本机解析，不上传）。', inputs: [], outputs: [{ id: 'data', label: '数据', type: 'dataset' }], section: 'analysis', keywords: '数据 CSV 答卷 导入' },
  { kind: 'filter', title: '样本筛选', category: 'data', capability: 'run', summary: '按一个分类变量保留指定类别的样本，形成分支。', inputs: [datasetIn], outputs: [{ id: 'data', label: '筛选后', type: 'dataset' }], boundary: '缺失值不能作为纳入类别；疑似标识列不能用于筛选。', keywords: '筛选 分支 子样本 过滤' },
  { kind: 'missing', title: '缺失处理', category: 'data', capability: 'run', summary: '声明缺失代码，并可只保留指定变量都有效的完整案例。', inputs: [datasetIn], outputs: [{ id: 'data', label: '处理后', type: 'dataset' }], boundary: '只删除不插补；删除行数会写入结果说明。', keywords: '缺失 完整案例 清洗' },
  stat('frequency', '频数与比例', '单个分类变量的类别频数与有效占比。', 1, '频数 比例 分类'),
  stat('numeric', '数值描述', '均值、标准差、中位数与四分位数。', 1, '描述 均值 标准差'),
  stat('groups', '分组比较', '按分组变量比较一个数值变量，附差异检验与效应量。', 2, '分组 比较 组间 t检验 方差分析'),
  stat('crosstab', '交叉表', '两个分类变量的交叉频数、行内比例、χ² 检验与 Cramér V。', 2, '交叉 卡方 关联 Fisher'),
  stat('pearson', 'Pearson 相关', '两个数值变量的线性相关、p 值与 95% 区间。', 2, '相关 线性'),
  stat('spearman', 'Spearman 秩相关', '两个有序或数值变量的单调关联。', 2, '秩 相关 有序'),
  stat('alpha', '信度（Cronbach α）', '量表题项的内部一致性、校正题总相关与删除后 α。', 3, '信度 量表 α alpha'),
  { kind: 'chart', title: '图表', category: 'chart', capability: 'run', summary: '把统计结果画成图或三线表，可选图形、配色与格式。', inputs: [{ id: 'result', label: '结果', accepts: ['result'] }], outputs: [{ id: 'chart', label: '图表', type: 'chart' }], section: 'analysis', keywords: '图 可视化 三线表 配色' },
  { kind: 'join', title: '结果汇集', category: 'flow', capability: 'run', summary: '把多个分支的结果按名称汇总，供结论与报告使用。', inputs: [{ id: 'items', label: '结果', accepts: ['result', 'chart'], multiple: true }], outputs: [{ id: 'bundle', label: '汇集', type: 'bundle' }], keywords: '汇集 合并 汇总 分支' },
  { kind: 'review', title: '人工复核', category: 'flow', capability: 'run', summary: '在继续之前由人确认上游结果；上游变化后需重新确认。', inputs: [{ id: 'input', label: '待复核', accepts: ['dataset', 'result', 'chart', 'bundle'] }], outputs: [{ id: 'output', label: '已复核', type: 'passthrough' }], keywords: '复核 确认 审核 人工' },
  { kind: 'conclusion', title: '结论草稿', category: 'output', capability: 'run', summary: '列出上游结果中的事实数字，由你写出结论；不会自动生成解释。', inputs: [{ id: 'evidence', label: '证据', accepts: ['result', 'chart', 'bundle'], multiple: true }], outputs: [], keywords: '结论 发现 洞察' },
  { kind: 'report', title: '报告章节', category: 'output', capability: 'run', summary: '把频数与信度结果整理成可下载的报告证据段落，并在「报告与 PPT」中编辑。', inputs: [{ id: 'evidence', label: '证据', accepts: ['result', 'bundle'], multiple: true }], outputs: [], section: 'editor', boundary: '目前支持频数与信度结果；其他方法的段落请在报告编辑器中撰写。', keywords: '报告 章节 Word PPT 段落' },
  { kind: 'defense', title: '路演与答辩', category: 'output', capability: 'reference', summary: '在「路演与答辩」中编排讲述与追问演练。', inputs: [], outputs: [], section: 'defense', keywords: '答辩 路演 演练' },
  { kind: 'topics', title: '词云与选题', category: 'design', capability: 'reference', summary: '在「Agent 诊断 · 词云与选题」中查看文献图谱与候选题目的证据画像。', inputs: [], outputs: [], section: 'diagnose', keywords: '选题 文献 词云' },
  { kind: 'cases', title: '获奖案例', category: 'design', capability: 'reference', summary: '在「获奖案例库」中查阅已核验的获奖题名与来源。', inputs: [], outputs: [], section: 'cases', keywords: '案例 获奖 参考' },
  { kind: 'rules', title: '规则与门禁', category: 'output', capability: 'reference', summary: '在「规则与门禁」中核对届次、组别、赛区、赛道与阶段。', inputs: [], outputs: [], section: 'rules', keywords: '规则 格式 门禁' },
];
export const GROUP_DEF: NodeDef = { kind: 'group', title: '编组', category: 'flow', capability: 'note', summary: '整理布局，不规定执行顺序。', inputs: [], outputs: [] };

export const CATEGORIES: readonly { id: CategoryId; title: string }[] = [
  { id: 'design', title: '研究设计' }, { id: 'questionnaire', title: '问卷' }, { id: 'sample', title: '样本' }, { id: 'data', title: '数据' },
  { id: 'stats', title: '统计' }, { id: 'chart', title: '图表' }, { id: 'flow', title: '流程' }, { id: 'output', title: '成果' },
];

const BY_KIND = new Map<NodeKind, NodeDef>([...NODE_DEFS, GROUP_DEF].map(d => [d.kind, d]));
export function nodeDef(kind: NodeKind): NodeDef {
  const def = BY_KIND.get(kind);
  if (!def) throw Error(`未知节点类型：${kind}`);
  return def;
}
export const isKind = (value: unknown): value is NodeKind => typeof value === 'string' && BY_KIND.has(value as NodeKind);
export const STAT_KINDS: readonly StatMethod[] = ['frequency', 'numeric', 'groups', 'crosstab', 'pearson', 'spearman', 'alpha'];
export const isStat = (kind: NodeKind): kind is StatMethod => (STAT_KINDS as readonly string[]).includes(kind);

/** Search across title, summary and keywords; empty query returns everything in catalog order. */
export function searchCatalog(query: string): NodeDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...NODE_DEFS];
  return NODE_DEFS.filter(d => `${d.title} ${d.summary} ${d.keywords ?? ''}`.toLowerCase().includes(q));
}

/** Variable roles for statistics nodes, in the order the config panel asks for them. */
export const STAT_ROLES: Record<Exclude<StatMethod, 'alpha'>, string[]> = {
  frequency: ['分类变量'], numeric: ['数值变量'], groups: ['分组变量', '数值变量'], crosstab: ['行变量', '列变量'], pearson: ['数值变量 X', '数值变量 Y'], spearman: ['有序 / 数值 X', '有序 / 数值 Y'],
};
