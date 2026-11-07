import { CHART_THEMES } from '../chart-theme.ts';
import { parseEditorContent, type EditorContent } from '../editor-model.ts';
import { REPORT_FIGURE_LABELS, figureFromResult, parseReportFigure, type ProjectVisualStyle, type ReportFigure, type ReportFigureKind } from '../report-figure.ts';
import { defaultColumn } from '../report-placement.ts';
import type { ResultSnapshot } from '../research-quality.ts';

/**
 * A figure changed by a sentence: "换成条形图", "配色换成青色", "去掉数值". The change lands on the report's own figure for
 * that result, the one its chart blocks and slides draw, as one undoable step in the editor. What a figure does not
 * carry (font size, a distribution behind a summary table) is said plainly instead of pretended.
 */
export type FigureChange = { kind?: ReportFigureKind; paletteId?: string; showLabels?: boolean; showGrid?: boolean; showBorder?: boolean; decimals?: number };
export type FigureRequest = { change: FigureChange; unsupported: string[] };
export type FigureTweak = { id: string; resultId: string; change: FigureChange };

const ABOUT_FIGURE = /图|配色|颜色|色系|小数|数值|标签|网格|格线|边框|字号|字体/u;
// Order matters: 分组柱形 before 柱形, 百分比堆叠 before 堆叠.
const KINDS: [RegExp, ReportFigureKind][] = [
  [/分组柱/u, 'grouped_bar'], [/堆叠/u, 'percent_stacked'], [/热力/u, 'heatmap'],
  [/横向|条形/u, 'horizontal_bar'], [/柱形|柱状|竖向|竖着/u, 'bar'],
];
const COLOURS: [RegExp, string][] = [[/蓝/u, 'blue'], [/青/u, 'teal'], [/绿/u, 'forest'], [/紫/u, 'plum'], [/灰|石墨|黑白/u, 'slate']];
const paletteTitle = (id: string) => CHART_THEMES.find(t => t.id === id)?.title ?? id;
const PALETTES_SAID = () => CHART_THEMES.slice(0, 5).map(t => t.title).join('、');
const OFF = /去掉|隐藏|不显示|不要|关掉|取消/u, ON = /显示|加上|标出|打开|加/u;

/** What the sentence asks of the figure; null when it is not about a figure at all. */
export function parseFigureRequest(raw: string): FigureRequest | null {
  const text = raw.trim();
  if (!text || /^[/／]/u.test(text) || !ABOUT_FIGURE.test(text)) return null;
  const change: FigureChange = {}, unsupported: string[] = [];
  const kind = KINDS.find(([pattern]) => pattern.test(text));
  if (kind) change.kind = kind[1];
  else if (/直方图|箱线图|箱型图/u.test(text)) unsupported.push('直方图和箱线图要用登记时的原始分布，不能从汇总表重画；请到「数据分析」的图表工作室重新登记。');
  else if (/三线表|表格/u.test(text)) unsupported.push('要把图换成三线表，请在报告里把这张图删掉、插入它的表；这里只改图的样式。');
  const named = CHART_THEMES.find(t => text.includes(t.title));
  const colour = named ? named.id : COLOURS.find(([pattern]) => pattern.test(text))?.[1];
  if (colour) change.paletteId = colour;
  else if (/配色|颜色|色系|红|橙|黄|粉/u.test(text)) unsupported.push(`现有的配色方案是：${PALETTES_SAID()}，以及「晴雾五色」等研究配色；说出其中一个就能换。`);
  const toggle = (subject: RegExp): boolean | undefined => {
    const at = text.search(subject);
    if (at < 0) return undefined;
    const before = text.slice(Math.max(0, at - 6), at);
    return OFF.test(before) ? false : ON.test(before) ? true : undefined;
  };
  const labels = toggle(/数值|数字|标签/u), grid = toggle(/网格|格线/u), border = toggle(/边框/u);
  if (labels !== undefined) change.showLabels = labels;
  if (grid !== undefined) change.showGrid = grid;
  if (border !== undefined) change.showBorder = border;
  const digits = /(\d)\s*位小数/u.exec(text);
  if (digits) change.decimals = Math.min(4, Number(digits[1]));
  else if (/保留整数|不要小数|取整/u.test(text)) change.decimals = 0;
  if (/字号|字体|字.{0,2}大|字.{0,2}小/u.test(text)) unsupported.push('图里的字号由导出时的报告排版统一设定（正文五号、图注小五），这里不单独改；打开代码视图可以在本地改 FONT_SIZE 重画。');
  return Object.keys(change).length || unsupported.length ? { change, unsupported } : null;
}

/** The figure a result's chart is drawn from in the report: the one its blocks use, else the first that is not a table. */
export function figureOf(content: EditorContent, result: ResultSnapshot): ReportFigure | null {
  const figures = (content.figures ?? []).filter(f => f.resultId === result.id && f.resultHash === result.resultHash && f.kind !== 'table');
  const used = new Set(content.report.flatMap(s => s.blocks ?? []).flatMap(b => b.figureId ? [b.figureId] : []));
  return figures.find(f => used.has(f.id)) ?? figures[0] ?? null;
}

export type Applied = { content: EditorContent; figure: ReportFigure; changes: string[] };
/** The report with the change made, checked as a whole; throws, in words for the user, when it cannot be made. */
export function applyFigureChange(content: EditorContent, resultId: string, change: FigureChange): Applied {
  const result = content.quality?.results.find(r => r.id === resultId);
  if (!result) throw Error('这项结果不在当前报告里，可能已被删除。');
  const before = figureOf(content, result);
  const changes: string[] = [];
  let figure: ReportFigure;
  const startKind: ReportFigureKind = before?.kind ?? (result.method === 'crosstab' ? 'grouped_bar' : 'bar');
  const kind = change.kind ?? startKind;
  try {
    // A new kind is redrawn from the registered result; its id, wording and style carry over.
    // A new kind shows the same values as before: the column the figure's series came from, not the default one.
    const shown = before?.series.length === 1 ? result.headers.indexOf(before.series[0].name) : -1;
    const drawn = before && kind === before.kind ? before : figureFromResult(result, kind, shown >= 1 ? shown : defaultColumn(result), before?.id);
    figure = before ? { ...drawn, id: before.id, title: before.title, xLabel: kind === before.kind ? before.xLabel : drawn.xLabel, yLabel: kind === before.kind ? before.yLabel : drawn.yLabel, note: before.note, style: before.style } : drawn;
  } catch (error) { throw Error(`这项结果画不成${REPORT_FIGURE_LABELS[kind]}：${(error as Error).message}`); }
  if (kind !== startKind) changes.push(`图型 ${REPORT_FIGURE_LABELS[startKind]} → ${REPORT_FIGURE_LABELS[kind]}`);
  const style = { ...figure.style };
  const flip = (key: 'showLabels' | 'showGrid' | 'showBorder', name: string) => {
    const next = change[key];
    if (next === undefined || next === style[key]) return;
    style[key] = next; changes.push(`${next ? '显示' : '隐藏'}${name}`);
  };
  flip('showLabels', '数值标签'); flip('showGrid', '网格线'); flip('showBorder', '边框');
  if (change.decimals !== undefined && change.decimals !== style.decimals) { changes.push(`小数 ${style.decimals} 位 → ${change.decimals} 位`); style.decimals = change.decimals; }
  figure = parseReportFigure({ ...figure, style });
  let visualStyle: ProjectVisualStyle | undefined = content.visualStyle;
  if (change.paletteId && change.paletteId !== (visualStyle?.paletteId ?? 'blue')) {
    if (content.reportFrame?.status === 'approved') throw Error('报告的页框配色已经定稿，整份报告的配色要在「报告与 PPT」的页框设置里改。');
    changes.push(`配色 ${paletteTitle(visualStyle?.paletteId ?? 'blue')} → ${paletteTitle(change.paletteId)}（整份报告的图一起换）`);
    visualStyle = { schema: 'ProjectVisualStyle/v1', paletteId: change.paletteId as ProjectVisualStyle['paletteId'], version: visualStyle?.version ?? 1 };
  }
  if (!changes.length) return { content, figure: before ?? figure, changes };
  const figures = before ? (content.figures ?? []).map(f => f.id === before.id ? figure : f) : [...(content.figures ?? []), figure];
  // Shared figures live in version 3 of the draft; an older draft is carried forward.
  const next = parseEditorContent(JSON.parse(JSON.stringify({ ...content, version: 3, figures, visualStyle: visualStyle ?? { schema: 'ProjectVisualStyle/v1', paletteId: 'blue', version: 1 } })));
  return { content: next, figure, changes };
}
