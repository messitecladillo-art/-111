import { rejectDuplicateMembers } from './questionnaire.ts';
import type { ChartModule, ChartStyle, ChartThemeId, ChartWorkspaceSettings, FigureSettings } from './chart-types.ts';
import { chartChoices, defaultChart } from './chart-registry.ts';
import { RESEARCH_PALETTES } from './chart-palette-reserve.ts';

/** CSS uses 96 pixels per inch; physical table-rule points use 72 per inch. */
export const POINT_TO_CSS_PIXEL = 96 / 72;
export const THREE_LINE_TABLE_RULES = Object.freeze({
  outerPt: 1.5, headerPt: .75,
  outerPx: 1.5 * POINT_TO_CSS_PIXEL, headerPx: .75 * POINT_TO_CSS_PIXEL,
});

const BASE_THEMES: { id: ChartThemeId; title: string; colors: string[] }[] = [
  { id: 'blue', title: '研究蓝', colors: ['#255D87', '#3C779E', '#5492B2', '#77ADC6', '#A0C8D7', '#C4E0E8'] },
  { id: 'teal', title: '洞见青', colors: ['#156B6B', '#278582', '#459C94', '#6CB5A7', '#9BCDBE', '#C6E2D4'] },
  { id: 'forest', title: '山林绿', colors: ['#38604A', '#527A59', '#709365', '#94AC80', '#B8C6A0', '#D5DEC2'] },
  { id: 'plum', title: '墨紫', colors: ['#615174', '#7D638C', '#997DA5', '#B49ABB', '#CDB9D0', '#E1D7E3'] },
  { id: 'slate', title: '石墨', colors: ['#364A5A', '#526574', '#74838D', '#95A1A8', '#B7C0C5', '#D9DFE2'] },
];

// Nominal category hues must not become a misleading numeric heatmap ramp.
function continuousRamp(colors: readonly string[]): string[] {
  const channels = (hex: string) => [1, 3, 5].map(start => Number.parseInt(hex.slice(start, start + 2), 16));
  const luminance = (hex: string) => channels(hex).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
  const darkest = [...colors].sort((a, b) => luminance(a) - luminance(b))[0];
  const rgb = channels(darkest);
  return [.92, .6, .3, 0].map(white => '#' + rgb.map(value => Math.round(value * (1 - white) + 255 * white).toString(16).padStart(2, '0')).join('').toUpperCase());
}
export const CHART_THEMES: { id: ChartThemeId; title: string; colors: string[]; continuous: string[] }[] = [
  ...BASE_THEMES.map(theme => ({ ...theme, continuous: [theme.colors.at(-1)!, theme.colors[0]] })),
  ...RESEARCH_PALETTES.map(palette => ({ id: palette.id, title: palette.title, colors: [...palette.colors], continuous: palette.kind === 'sequential' ? [...palette.colors] : continuousRamp(palette.colors) })),
];

export function defaultChartStyle(title: string): ChartStyle {
  return { title: title.slice(0, 300), subtitle: '', xLabel: '', yLabel: '', note: '', fontFamily: 'sans', fontSize: 20, decimals: 2, showLegend: true, showLabels: false, showGrid: true, showBorder: false, background: '#FFFFFF', ink: '#263D4D', accent: null, lineWidth: 2, pointSize: 6, width: 1200, height: 720, tableRules: 'three_line' };
}
export function defaultChartSettings(): ChartWorkspaceSettings { return { schema: 'chart-style/v1', theme: 'blue', figures: {} }; }

export function resolveFigureSettings(item: ChartModule, settings: ChartWorkspaceSettings): FigureSettings {
  return Object.hasOwn(settings.figures, item.id) ? settings.figures[item.id] : { kind: item.snapshot ? defaultChart(item.snapshot) : 'table', style: defaultChartStyle(item.question || item.title) };
}

/** Portable exports reflect the active roster. Removed/pending preferences remain available for undo/recompute. */
export function currentChartSettings(settings: ChartWorkspaceSettings, modules: ChartModule[]): ChartWorkspaceSettings {
  return { ...settings, figures: Object.fromEntries(modules.filter(item => item.current && item.snapshot).map(item => [item.id, resolveFigureSettings(item, settings)])) };
}

/** Category identity, never its current rank or index, determines its color. */
export function themeColor(key: string, theme: ChartThemeId, accent: string | null = null): string {
  if (accent) return accent;
  const colors = CHART_THEMES.find(t => t.id === theme)?.colors ?? CHART_THEMES[0].colors;
  let hash = 2166136261;
  for (const point of key) { hash ^= point.codePointAt(0)!; hash = Math.imul(hash, 16777619); }
  return colors[(hash >>> 0) % colors.length];
}
export function formatChartNumber(value: number | null, decimals: number): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('zh-CN', { maximumFractionDigits: decimals });
}
// SVG renderer serializes CSS into double-quoted XML attributes; single-quote font families keep it valid XML.
export const chartFont = (style: ChartStyle) => style.fontFamily === 'serif' ? "'Noto Serif SC', 'SimSun', serif" : "'Microsoft YaHei', 'Noto Sans SC', Arial, sans-serif";

function exact(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) throw Error(`${label}字段不完整或包含未知设置。`);
  return value as Record<string, unknown>;
}
function boundedText(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw Error('图表文字过长或含无效字符。');
  return value;
}
function boundedNumber(value: unknown, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw Error('图表尺寸或数值格式超出范围。');
  return value;
}
function color(value: unknown): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw Error('颜色须为六位 HEX 色值。');
  return value;
}
export function validateChartStyle(value: unknown): ChartStyle {
  const s = exact(value, Object.keys(defaultChartStyle('')), '图表格式');
  for (const key of ['showLegend', 'showLabels', 'showGrid', 'showBorder']) if (typeof s[key] !== 'boolean') throw Error('图表开关设置无效。');
  if (s.fontFamily !== 'sans' && s.fontFamily !== 'serif') throw Error('字体选项无效。');
  if (!['three_line', 'grid', 'minimal'].includes(String(s.tableRules))) throw Error('表格框线选项无效。');
  return { title: boundedText(s.title, 300), subtitle: boundedText(s.subtitle, 300), xLabel: boundedText(s.xLabel, 120), yLabel: boundedText(s.yLabel, 120), note: boundedText(s.note, 1000), fontFamily: s.fontFamily, fontSize: boundedNumber(s.fontSize, 9, 24, true), decimals: boundedNumber(s.decimals, 0, 6, true), showLegend: s.showLegend as boolean, showLabels: s.showLabels as boolean, showGrid: s.showGrid as boolean, showBorder: s.showBorder as boolean, background: color(s.background), ink: color(s.ink), accent: s.accent === null ? null : color(s.accent), lineWidth: boundedNumber(s.lineWidth, .5, 6), pointSize: boundedNumber(s.pointSize, 2, 16), width: boundedNumber(s.width, 480, 2400, true), height: boundedNumber(s.height, 320, 1800, true), tableRules: s.tableRules as ChartStyle['tableRules'] };
}
function validTheme(value: unknown): ChartThemeId {
  if (!CHART_THEMES.some(t => t.id === value)) throw Error('项目色系无效。');
  return value as ChartThemeId;
}

/** Portable style only. No cells, observations or computed statistics are serialized. */
export function serializeChartSettings(settings: ChartWorkspaceSettings, modules: ChartModule[]): string {
  const figures = Object.entries(settings.figures).map(([id, figure]) => {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id)) throw Error('图表模块编号不支持保存格式，请重新建立该分析模块。');
    const item = modules.find(m => m.id === id);
    if (!item?.current || !item.snapshot) throw Error('请先重新计算需要保存格式的模块。');
    if (!chartChoices(item.snapshot).some(choice => choice.id === figure.kind && choice.available)) throw Error('当前数据不支持所选图型。');
    return { id, binding: { dataHash: item.snapshot.binding.dataHash, signature: item.snapshot.binding.signature }, kind: figure.kind, style: validateChartStyle(figure.style) };
  });
  const raw = JSON.stringify({ schema: 'chart-format/v1', theme: validTheme(settings.theme), figures }, null, 2);
  if (new TextEncoder().encode(raw).length > 100_000) throw Error('图表格式文件超过 100 KB。');
  return raw;
}
export function restoreChartSettings(raw: string, modules: ChartModule[]): ChartWorkspaceSettings {
  if (new TextEncoder().encode(raw).length > 100_000) throw Error('图表格式文件超过 100 KB。');
  rejectDuplicateMembers(raw);
  let value: unknown;
  try { value = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { throw Error('图表格式 JSON 无法解析。'); }
  const doc = exact(value, ['schema', 'theme', 'figures'], '图表格式文件');
  if (doc.schema !== 'chart-format/v1') throw Error('图表格式版本不支持。');
  if (!Array.isArray(doc.figures) || doc.figures.length > 12) throw Error('一份格式文件最多包含 12 个模块。');
  const figures: Record<string, FigureSettings> = {};
  for (const item of doc.figures) {
    const f = exact(item, ['id', 'binding', 'kind', 'style'], '单图格式');
    const id = boundedText(f.id, 64);
    if (!/^[A-Za-z0-9_-]+$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id) || Object.hasOwn(figures, id)) throw Error('图表模块编号无效或重复。');
    const selectedModule = modules.find(m => m.id === id), binding = exact(f.binding, ['dataHash', 'signature'], '结果版本');
    if (!selectedModule?.current || !selectedModule.snapshot || binding.dataHash !== selectedModule.snapshot.binding.dataHash || binding.signature !== selectedModule.snapshot.binding.signature) throw Error('格式对应的数据或模块设置已变化，请先恢复方案并重新计算。');
    const choice = chartChoices(selectedModule.snapshot).find(c => c.id === f.kind && c.available);
    if (!choice) throw Error('当前结果不支持格式文件中的图型。');
    figures[id] = { kind: choice.id, style: validateChartStyle(f.style) };
  }
  return { schema: 'chart-style/v1', theme: validTheme(doc.theme), figures };
}
