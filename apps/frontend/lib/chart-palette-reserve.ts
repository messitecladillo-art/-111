export type ResearchPalette = {
  id: `ref_${string}`;
  title: string;
  colors: readonly string[];
  kind: 'categorical' | 'sequential' | 'diverging';
  /** EVI-X's suggested use; this is not a claim made by the source author. */
  use: string;
  source: {
    url: string;
    image: number;
    author: string;
    editedAt: string;
    checkedAt: string;
  };
};

const ARTICLE_URL = 'https://zhuanlan.zhihu.com/p/670396774';
const source = (image: number) => ({
  url: ARTICLE_URL,
  image,
  author: 'slandarer',
  editedAt: '2024-04-19 01:08',
  checkedAt: '2026-10-11',
});

/** HEX labels visually checked on the source cards; names, kinds and uses are ours. */
export const RESEARCH_PALETTES = [
  {
    id: 'ref_zhihu_02', title: '晴雾五色', kind: 'categorical',
    colors: ['#A5AEB7', '#925EB0', '#7E99F4', '#CC7C71', '#7AB656'],
    use: '五类人群或五条序列的分类比较；固定每一类别的颜色。',
    source: source(2),
  },
  {
    id: 'ref_zhihu_05', title: '麦穗对照', kind: 'categorical',
    colors: ['#DDDDDD', '#E6B745', '#D0DD97'],
    use: '基准组与两个比较组；浅色填充搭配深色轮廓和标签。',
    source: source(5),
  },
  {
    id: 'ref_zhihu_07', title: '原野七色', kind: 'categorical',
    colors: ['#A51C36', '#7ABBDB', '#84BA42', '#682487', '#DBB428', '#D4562E', '#4485C7'],
    use: '最多七类的条形图、分组图或多序列比较；较多类别时同时使用图例与标签。',
    source: source(7),
  },
  {
    id: 'ref_zhihu_14', title: '青金三色', kind: 'categorical',
    colors: ['#D8B365', '#5BB5AC', '#DE526C'],
    use: '三个群体的均值、分布或时间序列比较，也可选其中两色建立双组对照。',
    source: source(14),
  },
  {
    id: 'ref_zhihu_19', title: '晴空三色', kind: 'categorical',
    colors: ['#7EA6D9', '#D4E6BC', '#F8F2A4'],
    use: '三类构成或并排比较；浅绿与浅黄在白底上配合深色边线。',
    source: source(19),
  },
  {
    id: 'ref_zhihu_26', title: '墨彩六色', kind: 'categorical',
    colors: ['#32183C', '#A21A54', '#E7724F', '#000000', '#36659E', '#40B7AD'],
    use: '两组各三条序列或六类比较；深紫与黑色可用不同点形或线型辅助区分。',
    source: source(26),
  },
  {
    id: 'ref_zhihu_28', title: '石青三色', kind: 'categorical',
    colors: ['#2B5863', '#6A8078', '#9D9D9D'],
    use: '两条模型或趋势与一条基准序列；低饱和颜色搭配不同线型。',
    source: source(28),
  },
  {
    id: 'ref_zhihu_31', title: '暮霞六色', kind: 'categorical',
    colors: ['#B6B3D6', '#DAD7E9', '#CFCFD0', '#FDE2D8', '#F58F7A', '#E9687A'],
    use: '六类构成、堆叠条形图或分面比较；相近浅色增加分隔线与数值标注。',
    source: source(31),
  },
  {
    id: 'ref_zhihu_31_warm', title: '暮霞渐阶', kind: 'sequential',
    colors: ['#FDE2D8', '#F58F7A', '#E9687A'],
    use: '由浅到深表示较低至较高的单向数值；取自同一色卡的暖色子集，并按强度重排。',
    source: source(31),
  },
] as const satisfies readonly ResearchPalette[];

export type ResearchPaletteId = typeof RESEARCH_PALETTES[number]['id'];
