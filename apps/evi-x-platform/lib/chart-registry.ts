import type { ChartChoice, ChartFamily, ChartKind, ChartSnapshot } from './chart-types.ts';

export const CHART_FAMILIES: { id: ChartFamily; title: string; description: string }[] = [
  { id: 'comparison', title: '比较差异', description: '比较类别、组别与水平' },
  { id: 'composition', title: '展示构成', description: '观察样本中的组成与比例' },
  { id: 'distribution', title: '观察分布', description: '查看离散、形态与极端值' },
  { id: 'relationship', title: '探索关系', description: '查看配对和交叉分布' },
  { id: 'measurement', title: '检查量表', description: '查看题项与一致性诊断' },
  { id: 'table', title: '整理为表', description: '保留精确结果与统计口径' },
];
type Spec = { id: ChartKind; family: ChartFamily; title: string; description: string };
const specs: Spec[] = [
  { id: 'bar', family: 'comparison', title: '柱状图', description: '按类别比较实际频数' },
  { id: 'horizontal_bar', family: 'comparison', title: '条形图', description: '适合较长的类别名称' },
  { id: 'lollipop', family: 'comparison', title: '棒棒糖图', description: '用点与细线比较频数' },
  { id: 'pie', family: 'composition', title: '饼图', description: '少量互斥类别的整体构成' },
  { id: 'donut', family: 'composition', title: '环形图', description: '保留中心留白的比例图' },
  { id: 'treemap', family: 'composition', title: '矩形面积图', description: '以面积表示各类实际频数' },
  { id: 'waffle', family: 'composition', title: '样本格图', description: '每格代表一条有效记录' },
  { id: 'grouped_bar', family: 'comparison', title: '分组柱状图', description: '并列比较交叉分类频数' },
  { id: 'stacked_bar', family: 'composition', title: '堆叠柱状图', description: '比较行类别的数量与构成' },
  { id: 'percent_stacked', family: 'composition', title: '百分比堆叠图', description: '每个行类别的分母独立为100%' },
  { id: 'heatmap', family: 'relationship', title: '交叉热力图', description: '以颜色呈现交叉频数' },
  { id: 'mosaic', family: 'relationship', title: '马赛克图', description: '用矩形面积呈现联合频数' },
  { id: 'histogram', family: 'distribution', title: '直方图', description: '固定分箱后观察实际频数' },
  { id: 'boxplot', family: 'distribution', title: '箱线图', description: '四分位数、Tukey须与离群点' },
  { id: 'density', family: 'distribution', title: '密度曲线', description: '使用明确带宽的核密度估计' },
  { id: 'ecdf', family: 'distribution', title: '累积分布图', description: '实际观测的累计比例' },
  { id: 'strip', family: 'distribution', title: '点带图', description: '展示每个有效数值的位置' },
  { id: 'violin', family: 'distribution', title: '小提琴图', description: '左右对称呈现核密度' },
  { id: 'raincloud', family: 'distribution', title: '雨云图', description: '组合密度、箱线与实际样本点' },
  { id: 'group_mean', family: 'comparison', title: '组均值图', description: '保留每组的实际计分均值' },
  { id: 'mean_sd', family: 'comparison', title: '均值与标准差', description: '均值±一个样本标准差（SD）' },
  { id: 'group_boxplot', family: 'distribution', title: '分组箱线图', description: '并排比较各组的有效观测分布' },
  { id: 'group_violin', family: 'distribution', title: '分组小提琴图', description: '同一带宽规则的分组密度' },
  { id: 'group_density', family: 'distribution', title: '分组密度曲线', description: '按分组比较分布形态' },
  { id: 'group_raincloud', family: 'distribution', title: '分组雨云图', description: '比较形态、四分位数与样本点' },
  { id: 'scatter', family: 'relationship', title: '散点图', description: '仅显示本次计算的有效配对' },
  { id: 'rank_scatter', family: 'relationship', title: '平均秩散点图', description: '有效配对内重新计算平均秩' },
  { id: 'item_correlation', family: 'measurement', title: '校正题总相关', description: '查看每题与其余题总分的相关' },
  { id: 'alpha_deleted', family: 'measurement', title: '删除后α图', description: '同一完整案例集合的题项诊断' },
  { id: 'item_mean', family: 'measurement', title: '题项均值图', description: '采用完成反向计分后的均值' },
  { id: 'table', family: 'table', title: '统计结果表', description: '三线、网格或简洁框线' },
];
const methods: Record<ChartSnapshot['method'], ChartKind[]> = {
  frequency: ['bar', 'horizontal_bar', 'lollipop', 'pie', 'donut', 'treemap', 'waffle', 'table'],
  numeric: ['histogram', 'boxplot', 'density', 'ecdf', 'strip', 'violin', 'raincloud', 'table'],
  groups: ['group_mean', 'mean_sd', 'group_boxplot', 'group_violin', 'group_density', 'group_raincloud', 'table'],
  crosstab: ['grouped_bar', 'stacked_bar', 'percent_stacked', 'heatmap', 'mosaic', 'table'],
  pearson: ['scatter', 'rank_scatter', 'table'], spearman: ['scatter', 'rank_scatter', 'table'],
  alpha: ['item_correlation', 'alpha_deleted', 'item_mean', 'table'],
};
export function chartChoices(snapshot: ChartSnapshot): ChartChoice[] {
  return methods[snapshot.method].map(id => {
    const spec = specs.find(s => s.id === id)!;
    let reason = snapshot.n ? '' : '当前没有有效样本';
    if (id === 'table') reason = '';
    if (['pie', 'donut'].includes(id) && snapshot.categories.length > 8) reason = '类别超过8类，可选择条形图或矩形面积图';
    if (['density', 'violin', 'raincloud', 'group_density', 'group_violin', 'group_raincloud'].includes(id) && (!snapshot.distributions.length || snapshot.distributions.some(d => !d.density))) reason = '每组至少需要2个有变异的有效数值';
    if (id === 'mean_sd' && !snapshot.distributions.some(d => d.summary.sd !== null)) reason = '至少一组需要2个有效数值才能计算样本标准差';
    if (id === 'item_correlation' && !snapshot.reliability.some(item => item.correctedItemTotal !== null)) reason = '当前题总相关均未定义';
    if (id === 'alpha_deleted' && !snapshot.reliability.some(item => item.alphaIfDeleted !== null)) reason = '当前删除后α均未定义';
    return { ...spec, available: !reason, reason };
  });
}
export function defaultChart(snapshot: ChartSnapshot): ChartKind {
  return chartChoices(snapshot).find(choice => choice.available)?.id ?? 'table';
}
