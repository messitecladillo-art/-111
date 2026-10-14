/**
 * Report figures drawn from registered results with ECharts' server-side SVG renderer, so the same figure is
 * produced in the browser and in tests. Figures follow print conventions: body-text fonts, a restrained
 * palette, readable tick values, and the chart type that fits the result (a crosstab becomes grouped bars).
 */
import type { CustomSeriesOption, EChartsOption, SeriesOption } from 'echarts';
import type { ResultSnapshot } from './research-quality.ts';
import { assertTrueVector } from './svg-safety.ts';
import { naturalOrder } from './report-tables.ts';

/** SVG canvas; placed in Word at the full text width (14.64 cm), so 22 px text prints at about 9.5 pt. */
export const FIGURE_SIZE = { width: 960, height: 540 } as const;
const FONT = 'Times New Roman, SimSun, Songti SC, serif';
const INK = '#1F2329', AXIS = '#3A4049', GRID = '#E3E6EA';
/** Distinct hues that stay apart in greyscale print. */
export const REPORT_PALETTE = ['#2F5D8A', '#C9822B', '#4E8F6E', '#8B5A8C', '#5F6B7A', '#B4544B', '#6FA3C7', '#A7B66A'] as const;

const numeric = (v: string | number | null): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const width = (s: string) => [...s].reduce((w, c) => w + (/[⺀-￿]/.test(c) ? 2 : 1), 0);
const percentColumn = (r: ResultSnapshot, column: number) => /%|％|百分/.test(r.headers[column] ?? '');
const valueText = (v: number, percent: boolean, integer: boolean) => percent ? `${v.toFixed(1)}%` : integer ? String(v) : Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(2);

const text = { color: INK, fontFamily: FONT, fontSize: 22 };
function base(): EChartsOption {
  return {
    animation: false, backgroundColor: '#FFFFFF', textStyle: text,
    grid: { left: 24, right: 32, top: 40, bottom: 24, outerBoundsMode: 'same' as const, outerBoundsContain: 'all' as const },
    tooltip: { show: false },
  };
}
const valueAxis = (name: string) => ({
  type: 'value' as const, name, nameTextStyle: { ...text, fontSize: 20, padding: [0, 0, 4, 0] },
  axisLine: { show: true, lineStyle: { color: AXIS } }, axisTick: { show: true, lineStyle: { color: AXIS } },
  axisLabel: { ...text, fontSize: 20 }, splitLine: { show: true, lineStyle: { color: GRID, type: 'dashed' as const } },
});
const categoryAxis = (labels: string[], horizontal: boolean) => ({
  type: 'category' as const, data: labels, axisLine: { show: true, lineStyle: { color: AXIS } }, axisTick: { show: false },
  axisLabel: { ...text, fontSize: 20, interval: 0, ...(horizontal ? {} : { overflow: 'break' as const, width: Math.max(80, 820 / Math.max(1, labels.length)) }) },
  ...(horizontal ? { inverse: true } : {}),
});

/** One series of bars; long or many labels lie horizontally so they stay readable. */
function bars(labels: string[], values: number[], name: string, percent: boolean, color: string): EChartsOption {
  const horizontal = labels.length > 7 || Math.max(...labels.map(width)) > 12;
  const integer = values.every(Number.isInteger);
  const series: SeriesOption = {
    type: 'bar', name, data: values, barMaxWidth: horizontal ? 34 : 64, itemStyle: { color },
    label: { show: true, position: horizontal ? 'right' : 'top', ...text, fontSize: 20, formatter: (p: { value: unknown }) => valueText(Number(p.value), percent, integer) },
  };
  return horizontal
    ? { ...base(), xAxis: valueAxis(name), yAxis: categoryAxis(labels, true), series: [series] }
    : { ...base(), xAxis: categoryAxis(labels, false), yAxis: valueAxis(name), series: [series] };
}

function crosstab(r: ResultSnapshot, column: number): EChartsOption | null {
  const rows = naturalOrder([...new Set(r.rows.map(row => String(row[0])))]), columns = naturalOrder([...new Set(r.rows.map(row => String(row[1])))]);
  if (rows.length * columns.length !== r.rows.length || rows.length * columns.length > 80) return null;
  const at = new Map(r.rows.map(row => [`${row[0]}\u0000${row[1]}`, numeric(row[column])]));
  const percent = percentColumn(r, column);
  const integer = r.rows.every(row => Number.isInteger(row[column]));
  return {
    ...base(), color: [...REPORT_PALETTE],
    legend: { top: 0, left: 'center', textStyle: { ...text, fontSize: 20 }, itemWidth: 18, itemHeight: 12, itemGap: 18 },
    grid: { left: 24, right: 32, top: 64, bottom: 24, outerBoundsMode: 'same' as const, outerBoundsContain: 'all' as const },
    xAxis: categoryAxis(rows, false), yAxis: { ...valueAxis(r.headers[column]), ...(percent ? { max: (v: { max: number }) => Math.min(100, Math.ceil(v.max / 10) * 10 + 10) } : {}) },
    series: columns.map(c => ({
      type: 'bar' as const, name: c, barMaxWidth: 34, data: rows.map(row => at.get(`${row}\u0000${c}`) ?? null),
      label: { show: rows.length * columns.length <= 24, position: 'top' as const, ...text, fontSize: 16, formatter: (p: { value: unknown }) => valueText(Number(p.value), percent, integer) },
    })),
  };
}

function groupMeans(r: ResultSnapshot, column: number, color: string): EChartsOption {
  const labels = r.rows.map(row => String(row[0])), values = r.rows.map(row => numeric(row[column]) ?? 0);
  const option = bars(labels, values, r.headers[column], false, color);
  const sd = column === 2 && r.headers.length > 3 ? r.rows.map(row => numeric(row[3])) : null;
  if (!sd || sd.some(v => v === null) || (option.yAxis as { type?: string })?.type !== 'value') return option;
  // Error bars: mean ± one sample standard deviation.
  const whiskers: CustomSeriesOption = {
    type: 'custom', name: '±1 标准差', silent: true, z: 3,
    data: values.map((v, i) => [i, v - sd[i]!, v + sd[i]!]),
    renderItem: (_params, api) => {
      const low = api.coord([api.value(0), api.value(1)]), high = api.coord([api.value(0), api.value(2)]);
      const cap = 10;
      return { type: 'group', children: [
        { type: 'line', shape: { x1: low[0], y1: low[1], x2: high[0], y2: high[1] }, style: { stroke: AXIS, lineWidth: 2 } },
        { type: 'line', shape: { x1: low[0] - cap, y1: low[1], x2: low[0] + cap, y2: low[1] }, style: { stroke: AXIS, lineWidth: 2 } },
        { type: 'line', shape: { x1: high[0] - cap, y1: high[1], x2: high[0] + cap, y2: high[1] }, style: { stroke: AXIS, lineWidth: 2 } },
      ] };
    },
  };
  const series = option.series as SeriesOption[];
  // Whiskers occupy the bar tops, so the mean labels move to the bar feet.
  series[0] = { ...series[0], label: { ...(series[0] as { label: object }).label, position: 'insideBottom', distance: 12, color: '#FFFFFF' } } as SeriesOption;
  return { ...option, series: [...series, whiskers] };
}

/** The figure option for a result and the value column the author picked. */
export function figureOption(r: ResultSnapshot, column: number, accent: string): EChartsOption {
  if (!/^#[0-9A-Fa-f]{6}$/.test(accent)) throw Error('图表颜色无效。');
  if (column < 1 || column >= r.headers.length) throw Error('请选择有效数值列。');
  if (!r.rows.length) throw Error(`图“${r.title}”没有数据行，请重新计算或改用表格。`);
  if (r.method === 'crosstab' && r.headers[2] === '频数') { const option = crosstab(r, column); if (option) return option; }
  const values = r.rows.map(row => numeric(row[column]));
  if (values.some(v => v === null)) throw Error('图表所选列含缺失或非数值，请改用表格。');
  if (values.length > 30 || values.some(v => Math.abs(v!) > 1e12)) throw Error('图表类别或数值范围过大，请分拆或转换计量单位。');
  if (r.method === 'groups' && r.headers[1] === 'n' && r.headers[2] === '均值') return groupMeans(r, column, accent);
  return bars(r.rows.map(row => String(row[0])), values as number[], r.headers[column], percentColumn(r, column), accent);
}

/** Server-rendered SVG with ECharts' interaction styles removed, checked against the vector-asset rules. */
export async function figureSVG(r: ResultSnapshot, column: number, accent: string): Promise<string> {
  const { engine } = await import('./chart-engine.ts');
  const chart = engine.init(null, undefined, { renderer: 'svg', ssr: true, width: FIGURE_SIZE.width, height: FIGURE_SIZE.height });
  try {
    chart.setOption(figureOption(r, column, accent));
    const svg = chart.renderToSVGString()
      .replace(/<style\b[\s\S]*?<\/style>/g, '')
      .replace(/\s(?:class|pointer-events)="[^"]*"/g, '');
    return assertTrueVector(svg);
  } finally { chart.dispose(); }
}
