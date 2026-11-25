export const ANALYSIS_BLOCKS = [
  {
    id: 'frequency',
    title: '频数与比例',
    tag: '样本结构',
    roles: ['分类变量'],
    use: '回答样本由哪些人、选择或状态组成。',
    boundary: '单列分类题；多选题须先按选项拆列，不能将组合文本当作选项占比。',
  },
  {
    id: 'numeric',
    title: '数值分布',
    tag: '描述水平',
    roles: ['数值变量'],
    use: '同时查看均值、标准差、中位数和四分位数。',
    boundary: '数字编码不自动等于连续变量；先核对单位、范围与异常值。',
  },
  {
    id: 'groups',
    title: '分组比较',
    tag: '组间差异',
    roles: ['分组变量', '数值变量'],
    use: '并排比较各组的样本数、均值与离散程度，并检验组间差异。',
    boundary:
      '两组用 Welch t 检验，三组及以上用 Welch 方差分析，均不假定方差相等；另给秩检验作稳健性对照，多组两两比较用 Holm 校正。检验不证明因果。',
  },
  {
    id: 'crosstab',
    title: '交叉表与关联强度',
    tag: '分类关联',
    roles: ['行分类变量', '列分类变量'],
    use: '查看交叉频数、行内比例、Pearson χ² 检验和 Cramér V。',
    boundary:
      'χ² 不作连续性校正；期望频数小于 5 的格较多时，2×2 表以 Fisher 精确检验为准，其他表按研究依据合并类别后再检验。',
  },
  {
    id: 'pearson',
    title: 'Pearson 相关',
    tag: '线性关联',
    roles: ['数值变量 X', '数值变量 Y'],
    use: '考察两个数值变量在当前配对样本中的线性关联，附双侧检验与 95% 区间。',
    boundary: '区间用 Fisher z 变换；先检查线性关系和异常值，相关不证明因果。',
  },
  {
    id: 'spearman',
    title: 'Spearman 秩相关',
    tag: '单调关联',
    roles: ['有序 / 数值 X', '有序 / 数值 Y'],
    use: '按有效配对重新排序，以平均秩处理并列值。',
    boundary: 'p 值用 t 近似；有序编码需保持真实顺序；不适用于无序类别，也不证明因果。',
  },
] as const;

export type AnalysisBlock = (typeof ANALYSIS_BLOCKS)[number];
export type AnalysisMethod = AnalysisBlock['id'];
