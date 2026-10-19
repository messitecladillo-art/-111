import type { EChartsOption, SeriesOption, CustomSeriesOption } from 'echarts';
import type { ChartDistribution, ChartKind, ChartSnapshot, ChartStyle, ChartThemeId } from './chart-types.ts';
import { chartChoices } from './chart-registry.ts';
import { chartFont, CHART_THEMES, formatChartNumber, themeColor, THREE_LINE_TABLE_RULES } from './chart-theme.ts';

const key = (variable: string, label: string) => JSON.stringify([variable, label]);
const wrap = (text: string, columns: number) => text.split('\n').flatMap(line => { const chars = Array.from(line); return chars.length ? Array.from({ length: Math.ceil(chars.length / columns) }, (_, i) => chars.slice(i * columns, (i + 1) * columns).join('')) : ['']; }).join('\n');
export const chartCaption = (snapshot: ChartSnapshot, kind: ChartKind) => {
  const notes = [`n = ${snapshot.n}`];
  if (kind === 'mean_sd') notes.push('误差线：均值 ± 1 个样本标准差（SD）');
  if (kind === 'waffle') notes.push('每格 = 1 条有效记录');
  if (kind.includes('boxplot') || kind.includes('raincloud')) notes.push('四分位数：Type 7；须：Tukey 1.5 IQR');
  if (['density', 'violin', 'raincloud', 'group_density', 'group_violin', 'group_raincloud'].includes(kind)) notes.push('Gaussian KDE · Silverman robust 带宽' + (kind.includes('violin') || kind.includes('raincloud') ? ' · 各组峰宽独立归一' : ''));
  if (kind === 'histogram') notes.push('Sturges 等宽箱 · 末箱右闭');
  if (kind === 'rank_scatter') notes.push('当前有效配对的平均秩');
  return notes.join('  ·  ');
};

export function buildChartOption(snapshot: ChartSnapshot, kind: ChartKind, style: ChartStyle, theme: ChartThemeId): EChartsOption {
  if (!chartChoices(snapshot).some(choice => choice.id === kind && choice.available) || kind === 'table') throw Error('当前结果不支持所选图型。');
  const selectedTheme = CHART_THEMES.find(t => t.id === theme)!;
  const palette = selectedTheme.colors;
  const color = (identity: string) => themeColor(identity, theme, style.accent);
  const fmt = (value: number | null) => formatChartNumber(value, style.decimals);
  const title = wrap(style.title, Math.max(12, Math.floor((style.width - 64) / (style.fontSize * 1.4))));
  const subtitle = wrap(style.subtitle, Math.max(12, Math.floor((style.width - 64) / style.fontSize)));
  const caption = wrap([style.note, chartCaption(snapshot, kind)].filter(Boolean).join('\n'), Math.max(12, Math.floor((style.width - 64) / style.fontSize)));
  const legendLabels = snapshot.cross && ['grouped_bar', 'stacked_bar', 'percent_stacked', 'mosaic'].includes(kind) ? snapshot.cross.columns : snapshot.method === 'groups' && ['group_density', 'group_violin', 'group_raincloud'].includes(kind) ? snapshot.distributions.map(item => item.label) : null;
  const fullLegend = !!legendLabels && legendLabels.length > 8;
  const legendRows = fullLegend && legendLabels ? Math.ceil(legendLabels.reduce((width, name) => width + Array.from(name).length * style.fontSize + 54, 0) / (style.width - 56)) : 1;
  const legendHeight = style.showLegend ? Math.max(32, legendRows * (style.fontSize * 1.3 + 12)) : 0;
  const top = 32 + (title ? title.split('\n').length * style.fontSize * 1.7 : 0) + (subtitle ? subtitle.split('\n').length * style.fontSize * 1.4 + 12 : 0) + legendHeight;
  const bottom = 60 + caption.split('\n').length * style.fontSize * 1.4;
  if (style.height - top - bottom < 90) throw Error('标题或图注需要更多空间，请增加图形高度或缩短文字。');
  const xName = style.xLabel || snapshot.xLabel, yName = style.yLabel || snapshot.yLabel;
  const axis = { axisLine: { show: style.showBorder, lineStyle: { color: style.ink } }, axisTick: { show: style.showBorder }, axisLabel: { color: style.ink, fontSize: style.fontSize, formatter: (value: number | string) => typeof value === 'number' ? fmt(value) : value }, splitLine: { show: style.showGrid, lineStyle: { color: '#DDE4E8', type: 'dashed' as const } }, nameTextStyle: { color: style.ink, fontSize: style.fontSize }, nameGap: 30, nameLocation: 'middle' as const };
  const option: EChartsOption = {
    animation: false, backgroundColor: style.background, color: style.accent ? [style.accent] : palette,
    textStyle: { color: style.ink, fontFamily: chartFont(style), fontSize: style.fontSize },
    title: { text: title, subtext: subtitle, left: 28, top: 20, textStyle: { color: style.ink, fontSize: style.fontSize * 1.5, fontWeight: 600, lineHeight: style.fontSize * 1.7 }, subtextStyle: { color: style.ink, fontSize: style.fontSize, lineHeight: style.fontSize * 1.4 } },
    legend: { show: style.showLegend, top: top - legendHeight, left: 28, right: 28, type: fullLegend ? 'plain' : 'scroll', ...(legendLabels ? { data: legendLabels } : {}), textStyle: { color: style.ink, fontFamily: chartFont(style), fontSize: style.fontSize } },
    tooltip: { trigger: 'item', renderMode: 'richText', confine: true, valueFormatter: value => typeof value === 'number' ? fmt(value) : String(value ?? '—') },
    grid: { top, bottom, left: 82, right: 48, outerBoundsMode: 'same', outerBoundsContain: 'all' },
    xAxis: { ...axis, type: 'category', name: xName }, yAxis: { ...axis, type: 'value', name: yName },
    graphic: [{ type: 'text', left: 28, bottom: 16, style: { text: caption, fill: style.ink, font: `${style.fontSize}px ${chartFont(style)}`, lineHeight: style.fontSize * 1.4 } }],
  };
  const label = { show: style.showLabels, color: style.ink, fontSize: style.fontSize, formatter: (p: { value: unknown }) => typeof p.value === 'number' ? fmt(p.value) : '' };
  const series: SeriesOption[] = [];
  const categoryAxis = (labels: string[], vertical = false) => ({ ...axis, type: 'category' as const, data: labels, name: xName, axisLabel: { ...axis.axisLabel, interval: 0, hideOverlap: true, overflow: 'break' as const, width: vertical ? 160 : 120, rotate: !vertical && labels.length > 10 ? 60 : 0 } });
  const points = (name: string, data: [number, number][], identity: string): SeriesOption => ({ type: 'scatter', name, data, symbolSize: style.pointSize, itemStyle: { color: color(identity), opacity: .75 }, label: { ...label, formatter: p => Array.isArray(p.value) ? `(${fmt(Number(p.value[0]))}, ${fmt(Number(p.value[1]))})` : '' } });

  if (snapshot.method === 'frequency') {
    const categories = snapshot.categories, labels = categories.map(c => c.label);
    const data = categories.map(c => ({ name: c.label, value: c.count, itemStyle: { color: color(c.key) } }));
    option.xAxis = categoryAxis(labels);
    if (kind === 'bar') series.push({ type: 'bar', name: '频数', data, label: { ...label, position: 'top' }, barMaxWidth: 70 });
    if (kind === 'horizontal_bar' || kind === 'lollipop') {
      option.xAxis = { ...axis, type: 'value', name: style.xLabel || '频数' };
      option.yAxis = { ...categoryAxis(labels), name: style.yLabel || snapshot.xLabel, inverse: true, axisLabel: { ...axis.axisLabel, width: 160, overflow: 'truncate' } };
      series.push({ type: 'bar', name: '频数', data, barWidth: kind === 'lollipop' ? style.lineWidth : undefined, barMaxWidth: 44, label: { ...label, position: 'right' } });
      if (kind === 'lollipop') series.push({ type: 'scatter', name: '频数点', data: categories.map(c => ({ name: c.label, value: c.count, itemStyle: { color: color(c.key) } })), symbolSize: style.pointSize + 4 });
    }
    if (kind === 'pie' || kind === 'donut') {
      delete option.xAxis; delete option.yAxis; delete option.grid;
      const availableHeight = style.height - top - bottom;
      series.push({ type: 'pie', name: '频数', data, center: [style.width / 2, top + availableHeight / 2], radius: kind === 'donut' ? [availableHeight * .22, availableHeight * .42] : availableHeight * .42, label: { show: true, color: style.ink, fontSize: style.fontSize, formatter: p => style.showLabels ? `${p.name}\n${fmt(Number(p.value))} · ${fmt(snapshot.n ? Number(p.value) / snapshot.n * 100 : null)}%` : p.name }, itemStyle: { borderColor: style.background, borderWidth: style.showBorder ? style.lineWidth : 1 } });
      option.legend = { ...option.legend as object, data: labels };
    }
    if (kind === 'treemap') {
      delete option.xAxis; delete option.yAxis; delete option.grid;
      series.push({ type: 'treemap', data, top, bottom, left: 28, right: 28, roam: false, nodeClick: false, breadcrumb: { show: false }, label: { show: true, color: style.ink, fontSize: style.fontSize, formatter: p => style.showLabels ? `${p.name}\n${fmt(Number(p.value))}` : p.name }, itemStyle: { borderColor: style.background, borderWidth: style.showBorder ? style.lineWidth : 2 } });
    }
    if (kind === 'waffle') {
      const columns = Math.ceil(Math.sqrt(snapshot.n * 1.6)), rows = Math.ceil(snapshot.n / columns);
      option.xAxis = { type: 'value', show: false, min: -.6, max: columns - .4 }; option.yAxis = { type: 'value', show: false, min: -.6, max: rows - .4, inverse: true };
      const cellSize = Math.max(1, Math.min((style.width - 130) / columns, (style.height - top - bottom) / rows) * .8);
      let index = 0;
      for (const c of categories) {
        const values: [number, number][] = Array.from({ length: c.count }, () => { const i = index++; return [i % columns, Math.floor(i / columns)]; });
        series.push({ ...points(c.label, values, c.key), symbol: 'rect', symbolSize: cellSize });
      }
    }
  } else if (snapshot.cross) {
    const cross = snapshot.cross;
    const cellsByRow = new Map(cross.rows.map(row => [row, new Map(cross.cells.filter(cell => cell.row === row).map(cell => [cell.column, cell]))]));
    const rowIndexes = new Map(cross.rows.map((row, i) => [row, i])), columnIndexes = new Map(cross.columns.map((column, i) => [column, i]));
    option.xAxis = categoryAxis(cross.rows); option.yAxis = { ...axis, type: 'value', name: style.yLabel || (kind === 'percent_stacked' ? '行内占比 (%)' : '频数') };
    if (['grouped_bar', 'stacked_bar', 'percent_stacked'].includes(kind)) {
      cross.columns.forEach(column => series.push({ type: 'bar', name: column, stack: kind === 'grouped_bar' ? undefined : 'total', itemStyle: { color: color(key(snapshot.yLabel, column)) }, label, data: cross.rows.map(row => { const cell = cellsByRow.get(row)!.get(column)!; return kind === 'percent_stacked' ? cell.rowPercent : cell.count; }) }));
      if (kind === 'percent_stacked') option.yAxis = { ...option.yAxis as object, max: 100 };
    } else if (kind === 'heatmap') {
      option.xAxis = { ...categoryAxis(cross.columns), name: style.xLabel || snapshot.yLabel }; option.yAxis = { ...categoryAxis(cross.rows, true), name: style.yLabel || snapshot.xLabel, inverse: true };
      const maxCount = Math.max(1, ...cross.cells.map(c => c.count));
      option.visualMap = { min: 0, max: maxCount, text: [fmt(maxCount), fmt(0)], orient: 'horizontal', bottom: bottom - 35, left: 'center', calculable: false, inRange: { color: style.accent ? [selectedTheme.continuous[0], style.accent] : selectedTheme.continuous }, textStyle: { color: style.ink, fontFamily: chartFont(style), fontSize: style.fontSize } };
      series.push({ type: 'heatmap', name: '交叉频数', data: cross.cells.map(c => [columnIndexes.get(c.column)!, rowIndexes.get(c.row)!, c.count]), label: { ...label, formatter: p => fmt(Number((p.value as number[])[2])) }, itemStyle: { borderColor: style.background, borderWidth: style.showBorder ? style.lineWidth : .5 } });
    } else if (kind === 'mosaic') {
      option.xAxis = { ...axis, type: 'value', min: 0, max: 1, show: false }; option.yAxis = { ...axis, type: 'value', min: 0, max: 1, show: false };
      const geometry = new Map(cross.columns.map(column => [column, [] as number[][]]));
      let left = 0;
      cross.rows.forEach((row, rowIndex) => {
        const cells = [...cellsByRow.get(row)!.values()], total = cells.reduce((sum, c) => sum + c.count, 0), width = total / snapshot.n;
        let base = 0;
        for (const cell of cells) { const y0 = base; base += total ? cell.count / total : 0; geometry.get(cell.column)!.push([left, y0, left + width, base, cell.count, rowIndex]); }
        left += width;
      });
      // Batch by column identity: at most20 render series, with all400 cells retained.
      cross.columns.forEach(column => series.push({ type: 'custom', name: column, data: geometry.get(column)!, encode: { x: [0, 2], y: [1, 3] }, tooltip: { formatter: p => { const value = (Array.isArray(p) ? p[0] : p).value as number[]; return `${cross.rows[value[5]]} · ${column}\n频数：${fmt(value[4])}`; } }, renderItem: (_, api) => {
        const a = api.coord([Number(api.value(0)), Number(api.value(1))]), b = api.coord([Number(api.value(2)), Number(api.value(3))]);
        const width = b[0] - a[0], height = a[1] - b[1], count = Number(api.value(4));
        if (width <= 0 || height <= 0 || count === 0) return null;
        const row = cross.rows[Number(api.value(5))], full = `${row} · ${column}${style.showLabels ? `\n${fmt(count)}` : ''}`;
        const text = width >= Array.from(`${row} · ${column}`).length * style.fontSize && height >= style.fontSize * (style.showLabels ? 2.6 : 1.3)
          ? full : style.showLabels && width >= fmt(count).length * style.fontSize * .7 + 8 && height >= style.fontSize * 1.3 + 4 ? fmt(count) : '';
        return { type: 'group', children: [{ type: 'rect', shape: { x: a[0], y: b[1], width, height }, style: { fill: color(key(snapshot.yLabel, column)), stroke: style.background, lineWidth: style.showBorder ? style.lineWidth : 1 } }, ...(text ? [{ type: 'text' as const, style: { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, text, font: `${style.fontSize}px ${chartFont(style)}`, fill: style.ink, align: 'center' as const, verticalAlign: 'middle' as const, width: Math.max(0, width - 8), overflow: 'truncate' as const } }] : [])] };
      } }));
    }
  } else if (snapshot.pairs) {
    option.xAxis = { ...axis, type: 'value', name: style.xLabel || snapshot.xLabel + (kind === 'rank_scatter' ? '（平均秩）' : ''), scale: true };
    option.yAxis = { ...axis, type: 'value', name: style.yLabel || snapshot.yLabel + (kind === 'rank_scatter' ? '（平均秩）' : ''), scale: true };
    series.push(points('有效配对', kind === 'rank_scatter' ? snapshot.pairs.ranks : snapshot.pairs.values, key(snapshot.xLabel, snapshot.yLabel)));
  } else if (snapshot.method === 'alpha') {
    option.xAxis = categoryAxis(snapshot.reliability.map(item => item.label));
    const field = kind === 'item_correlation' ? 'correctedItemTotal' : kind === 'alpha_deleted' ? 'alphaIfDeleted' : 'mean';
    const name = kind === 'item_correlation' ? '校正题总相关' : kind === 'alpha_deleted' ? '删除后 α' : '计分均值';
    option.yAxis = { ...axis, type: 'value', name: style.yLabel || name };
    series.push({ type: 'bar', name, data: snapshot.reliability.map(item => ({ name: item.label, value: item[field], itemStyle: { color: color(item.key) } })), label: { ...label, position: 'top' }, barMaxWidth: 60 });
  } else {
    const distributions = snapshot.distributions;
    const labels = snapshot.method === 'groups' ? snapshot.table.rows.map(row => String(row[0])) : distributions.map(d => d.label);
    const indexOf = (d: ChartDistribution) => labels.indexOf(d.label);
    if (kind === 'group_mean' || kind === 'mean_sd') {
      option.xAxis = categoryAxis(labels); option.yAxis = { ...axis, type: 'value', name: style.yLabel || snapshot.yLabel, scale: false };
      series.push({ type: 'bar', name: '均值', data: snapshot.table.rows.map(row => ({ name: String(row[0]), value: row[2], itemStyle: { color: color(key(snapshot.xLabel, String(row[0]))) } })), barMaxWidth: 60, label: { ...label, position: 'top' } });
      if (kind === 'mean_sd') {
        const data = distributions.filter(d => d.summary.sd !== null).map(d => [indexOf(d), d.summary.mean, d.summary.mean - d.summary.sd!, d.summary.mean + d.summary.sd!]);
        series.push({ type: 'custom', name: '±1 SD', data, encode: { x: 0, y: [2, 3] }, renderItem: (_, api) => {
          const a = api.coord([Number(api.value(0)), Number(api.value(2))]), b = api.coord([Number(api.value(0)), Number(api.value(3))]);
          return { type: 'group', children: [[a, b], [[a[0] - 6, a[1]], [a[0] + 6, a[1]]], [[b[0] - 6, b[1]], [b[0] + 6, b[1]]]].map(([u, v]) => ({ type: 'line', shape: { x1: u[0], y1: u[1], x2: v[0], y2: v[1] }, style: { stroke: style.ink, lineWidth: style.lineWidth } })) };
        } });
      }
    } else if (kind === 'histogram') {
      const d = distributions[0]; option.xAxis = categoryAxis(d.bins.map((bin, i) => bin.start === bin.end ? fmt(bin.start) : `[${fmt(bin.start)}, ${fmt(bin.end)}${i === d.bins.length - 1 ? ']' : ')'}`));
      option.yAxis = { ...axis, type: 'value', name: style.yLabel || '频数' };
      series.push({ type: 'bar', name: '频数', data: d.bins.map(bin => bin.count), barCategoryGap: '2%', itemStyle: { color: style.accent || palette[0] }, label: { ...label, position: 'top' } });
    } else if (kind === 'density' || kind === 'group_density' || kind === 'ecdf') {
      option.xAxis = { ...axis, type: 'value', name: style.xLabel || (snapshot.method === 'groups' ? snapshot.yLabel : snapshot.xLabel), scale: true };
      option.yAxis = { ...axis, type: 'value', name: style.yLabel || (kind === 'ecdf' ? '累计比例' : '概率密度'), max: kind === 'ecdf' ? 1 : undefined };
      distributions.forEach(d => series.push({ type: 'line', name: d.label, data: kind === 'ecdf' ? [[d.summary.min, 0], ...d.ecdf] : d.density!.points, step: kind === 'ecdf' ? 'end' : false, showSymbol: false, smooth: false, lineStyle: { color: color(d.key), width: style.lineWidth }, itemStyle: { color: color(d.key) } }));
    } else {
      option.xAxis = categoryAxis(labels); option.yAxis = { ...axis, type: 'value', name: style.yLabel || (snapshot.method === 'groups' ? snapshot.yLabel : snapshot.xLabel), scale: true };
      const isRain = kind.includes('raincloud'), isViolin = kind.includes('violin') || isRain;
      if (isViolin) distributions.forEach(d => {
        const values = d.density!.points, peak = Math.max(...values.map(p => p[1])), center = indexOf(d);
        const data = [[center, values[0][0], values[values.length - 1][0]]];
        const custom: CustomSeriesOption = { type: 'custom', name: d.label, data, encode: { x: 0, y: [1, 2] }, renderItem: (_, api) => {
          const size = api.size!([1, 0]);
          const width = Math.min(55, Math.abs(Array.isArray(size) ? size[0] : size) * .32);
          const left = values.map(([v, density]) => { const p = api.coord([center, v]); return [p[0] - density / peak * width, p[1]]; });
          const right = [...values].reverse().map(([v, density]) => { const p = api.coord([center, v]); return [p[0] + (isRain ? 0 : density / peak * width), p[1]]; });
          return { type: 'polygon', shape: { points: [...left, ...right] }, style: { fill: color(d.key), opacity: .65, stroke: style.showBorder ? style.ink : color(d.key), lineWidth: style.lineWidth } };
        } }; series.push(custom);
      });
      if (kind.includes('boxplot') || isRain) {
        series.push({ type: 'boxplot', name: '四分位数', data: labels.map(name => { const d = distributions.find(item => item.label === name); return d ? { value: [d.box.low, d.box.q1, d.box.median, d.box.q3, d.box.high], itemStyle: { color: isRain ? style.background : color(d.key), borderColor: style.ink, borderWidth: style.lineWidth } } : { value: ['-', '-', '-', '-', '-'] }; }), boxWidth: isRain ? [5, 12] : [12, 55] });
        distributions.forEach(d => { if (d.box.outliers.length) series.push(points(`${d.label} · 离群点`, d.box.outliers.map(v => [indexOf(d), v]), d.key)); });
      }
      if (kind === 'strip' || isRain) distributions.forEach(d => {
        const center = indexOf(d), data: [number, number][] = d.values.map(v => [center, v]);
        series.push({ ...points(d.label, data, d.key), symbolOffset: isRain ? [12, 0] : [0, 0] });
      });
    }
  }
  option.series = series;
  return option;
}

export const escapeSVGText = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
/** All cells and full labels are retained. Long tables expand vertically instead of clipping. */
export function buildTableSVG(snapshot: ChartSnapshot, style: ChartStyle): { svg: string; width: number; height: number } {
  const width = style.width, pad = 28, columns = snapshot.table.headers.length, cellWidth = (width - pad * 2) / Math.max(1, columns), font = style.fontSize, line = font * 1.55;
  const formatted = (value: string | number | null) => typeof value === 'string' ? value : formatChartNumber(value, style.decimals);
  const lines = (text: string, w = cellWidth, size = font) => wrap(text, Math.max(2, Math.floor((w - 18) / size))).split('\n');
  const titleFont = font * 1.5;
  let y = pad + titleFont;
  const elements: string[] = [];
  const text = (value: string, x: number, top: number, size = font, weight = 400, anchor: 'start' | 'middle' = 'start') => elements.push(`<text x="${x}" y="${top}" font-size="${size}" font-weight="${weight}" fill="${style.ink}" text-anchor="${anchor}">${escapeSVGText(value)}</text>`);
  if (style.title) for (const t of lines(style.title, width - pad * 2, titleFont)) { text(t, pad, y, titleFont, 600); y += titleFont * 1.55; }
  if (style.subtitle) for (const t of lines(style.subtitle, width - pad * 2)) { text(t, pad, y); y += line; }
  y += 20;
  const top = y;
  const row = (cells: (string | number | null)[], header: boolean) => {
    const cellLines = cells.map(c => lines(formatted(c))), height = Math.max(1, ...cellLines.map(l => l.length)) * line + 16;
    cellLines.forEach((ls, c) => ls.forEach((t, r) => text(t, pad + (c + .5) * cellWidth, y + font + 8 + (height - 16 - ls.length * line) / 2 + r * line, font, header ? 600 : 400, 'middle')));
    y += height; return height;
  };
  const rule = (at: number, thickness: number) => elements.push(`<line x1="${pad}" y1="${at}" x2="${width - pad}" y2="${at}" stroke="${style.ink}" stroke-width="${thickness}"/>`);
  if (style.tableRules !== 'minimal') rule(y, style.tableRules === 'three_line' ? THREE_LINE_TABLE_RULES.outerPx : style.lineWidth);
  row(snapshot.table.headers, true); rule(y, style.tableRules === 'three_line' ? THREE_LINE_TABLE_RULES.headerPx : .5);
  for (const cells of snapshot.table.rows) { row(cells, false); if (style.tableRules === 'grid') rule(y, .5); }
  if (style.tableRules === 'three_line') rule(y, THREE_LINE_TABLE_RULES.outerPx);
  if (style.tableRules === 'grid') for (let c = 0; c <= columns; c++) elements.push(`<line x1="${pad + c * cellWidth}" y1="${top}" x2="${pad + c * cellWidth}" y2="${y}" stroke="${style.ink}" stroke-width="0.5"/>`);
  y += 30;
  for (const t of lines([style.note, `n = ${snapshot.n}`].filter(Boolean).join('\n'), width - pad * 2)) { text(t, pad, y); y += line; }
  const height = Math.ceil(y + 20);
  return { width, height, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${style.background}"/><g font-family="${escapeSVGText(chartFont(style))}">${elements.join('')}</g></svg>` };
}
