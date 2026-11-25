/**
 * Reproducible academic code generators & inspector palette presets for the EVI-X Resource Library.
 *
 * Emits:
 *  - `INSPECTOR_PALETTE_PRESETS`: 6 curated journal & accessibility `FigurePalette/v1` presets
 *  - `buildChartPythonCode`: 192 method-specific `matplotlib` + `numpy` templates
 *  - `buildTableLatexCode`: compilable XeLaTeX (`ctexart` + `booktabs` + `threeparttable`) three-line tables
 *  - `buildDiagramCode`: layered `TikZ` (`tikzpicture`), `Mermaid` (`flowchart`), and editable `Draw.io XML` framework code
 */
import { toDrawioXml } from '../diagram-figures.ts';
import type { FigureInk, FigurePalette } from '../figure-palette.ts';
import type { ChartPreviewKind, ResourceChartItem } from './chart-catalog.ts';
import type { ResourceTableTemplate } from './table-catalog.ts';
import { toDiagramGraphSpec, type ResourceDiagramItem } from './diagram-catalog.ts';

export type InspectorPalettePresetId =
  | 'report'
  | 'aer_teal'
  | 'lancet_blue'
  | 'neurips_indigo'
  | 'policy_burgundy'
  | 'colorblind_safe';

export interface InspectorPalettePreset {
  id: InspectorPalettePresetId;
  label: string;
  palette: FigurePalette | null;
}

export const INSPECTOR_PALETTE_PRESETS: readonly InspectorPalettePreset[] = [
  {
    id: 'report',
    label: '联动当前报告',
    palette: null,
  },
  {
    id: 'aer_teal',
    label: 'AER 墨青',
    palette: {
      schema: 'FigurePalette/v1',
      primary: '#0F766E',
      secondary: '#234E80',
      opposite: '#B45309',
      source: 'manual',
    },
  },
  {
    id: 'lancet_blue',
    label: 'Lancet 深蓝',
    palette: {
      schema: 'FigurePalette/v1',
      primary: '#1D4E89',
      secondary: '#2A7B88',
      opposite: '#C05621',
      source: 'manual',
    },
  },
  {
    id: 'neurips_indigo',
    label: 'NeurIPS 靛紫',
    palette: {
      schema: 'FigurePalette/v1',
      primary: '#3730A3',
      secondary: '#0D9488',
      opposite: '#D97706',
      source: 'manual',
    },
  },
  {
    id: 'policy_burgundy',
    label: '公管绛红',
    palette: {
      schema: 'FigurePalette/v1',
      primary: '#881337',
      secondary: '#1E3A5F',
      opposite: '#B5802A',
      source: 'manual',
    },
  },
  {
    id: 'colorblind_safe',
    label: '无障碍安全',
    palette: {
      schema: 'FigurePalette/v1',
      primary: '#0072B2',
      secondary: '#009E73',
      opposite: '#D55E00',
      source: 'manual',
    },
  },
];

// ============================================================================
// Color & Escaping Helpers
// ============================================================================

interface ResolvedColors {
  primary: string;
  secondary: string;
  opposite: string;
}

function normalizeHex(raw: string | undefined, fallback: string): string {
  const s = (raw ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
  }
  return fallback;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const rawH = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [((rawH * 60) + 360) % 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hue < 60 ? [c, x, 0]
      : hue < 120 ? [x, c, 0]
        : hue < 180 ? [0, c, x]
          : hue < 240 ? [0, x, c]
            : hue < 300 ? [x, 0, c]
              : [c, 0, x];
  const toByte = (v: number) => Math.round(Math.min(255, Math.max(0, (v + m) * 255))).toString(16).padStart(2, '0');
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`.toUpperCase();
}

function shiftHexHue(hex: string, deg: number, targetS: number, targetL: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToHex(h + deg, Math.max(0.38, Math.min(0.75, s || targetS)), Math.max(0.28, Math.min(0.48, l || targetL)));
}

function resolveInkColors(ink: FigureInk): ResolvedColors {
  if (typeof ink !== 'string') {
    return {
      primary: normalizeHex(ink.primary, '#0F766E'),
      secondary: normalizeHex(ink.secondary, '#234E80'),
      opposite: normalizeHex(ink.opposite, '#B45309'),
    };
  }
  const primary = normalizeHex(ink, '#0F766E');
  return {
    primary,
    secondary: shiftHexHue(primary, 42, 0.54, 0.36),
    opposite: shiftHexHue(primary, 178, 0.68, 0.44),
  };
}

function pyStr(text: string): string {
  return JSON.stringify(text.replace(/\r?\n/g, ' '));
}

function sanitizeIdentifier(id: string, fallback = 'fig'): string {
  const clean = id.replace(/[^A-Za-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
  return clean || fallback;
}

const LATEX_SPECIAL_RE =
  /<=|>=|!=|χ²|ε²|η²|√([A-Za-z0-9]+)|[\\{}%&_#$~^|<>±×≈→√χαβρτδεηθλκΔ²₀]/gu;

function escapeLatex(raw: string): string {
  return String(raw)
    .replace(/\r?\n/g, ' ')
    .replace(LATEX_SPECIAL_RE, (token, rad: string | undefined) => {
      if (rad !== undefined) return `$\\sqrt{\\mathrm{${rad}}}$`;
      switch (token) {
        case '\\': return '\\textbackslash{}';
        case '{': return '\\{';
        case '}': return '\\}';
        case '%': return '\\%';
        case '&': return '\\&';
        case '_': return '\\_';
        case '#': return '\\#';
        case '$': return '\\$';
        case '~': return '\\textasciitilde{}';
        case '^': return '\\textasciicircum{}';
        case '|': return '\\textbar{}';
        case '<=': return '$\\le$';
        case '>=': return '$\\ge$';
        case '!=': return '$\\ne$';
        case '<': return '$<$';
        case '>': return '$>$';
        case '±': return '$\\pm$';
        case '×': return '$\\times$';
        case '≈': return '$\\approx$';
        case '→': return '$\\rightarrow$';
        case '√': return '$\\surd$';
        case 'χ²': return '$\\chi^{2}$';
        case 'ε²': return '$\\varepsilon^{2}$';
        case 'η²': return '$\\eta^{2}$';
        case 'χ': return '$\\chi$';
        case 'α': return '$\\alpha$';
        case 'β': return '$\\beta$';
        case 'ρ': return '$\\rho$';
        case 'τ': return '$\\tau$';
        case 'δ': return '$\\delta$';
        case 'ε': return '$\\varepsilon$';
        case 'η': return '$\\eta$';
        case 'θ': return '$\\theta$';
        case 'λ': return '$\\lambda$';
        case 'κ': return '$\\kappa$';
        case 'Δ': return '$\\Delta$';
        case '²': return '$^{2}$';
        case '₀': return '$_{0}$';
        default: return token;
      }
    });
}

function escapeMermaidText(raw: string): string {
  return String(raw)
    .replace(/\r?\n/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '#quot;')
    .replace(/\|/g, '｜');
}

// ============================================================================
// 1. Chart Python Code Generator (192 specialized matplotlib templates)
// ============================================================================

type SubplotMode = '2d' | 'polar' | '3d' | 'custom';

interface ChartPythonSpec {
  imports?: readonly string[];
  mode?: SubplotMode;
  titleOnFig?: boolean;
  body: string;
}

const CHART_PYTHON_SPECS: Record<ChartPreviewKind, ChartPythonSpec> = {
  // -------------------------------------------------------------------------
  // 1. 比大小 (comparison) — 14
  // -------------------------------------------------------------------------
  bar: {
    imports: ['from scipy import stats'],
    body: `
groups = ['一二线城区', '县域城区', '中心乡镇', '偏远村居']
samples = [rng.normal(mu, 0.65, 120) for mu in (4.24, 3.86, 3.48, 3.12)]
means = [np.mean(s) for s in samples]
ci95 = [stats.t.ppf(0.975, len(s) - 1) * stats.sem(s) for s in samples]
x = np.arange(len(groups))

ax.bar(
    x, means, yerr=ci95, capsize=5, width=0.56,
    color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6,
    error_kw={'ecolor': SECONDARY, 'elinewidth': 1.4},
    label='样本均值 (±95% CI)',
)
ax.axhline(np.mean(means), color=OPPOSITE, linestyle='--', linewidth=1.5, label='总体参考均值')
for xi, m, ci in zip(x, means, ci95):
    ax.text(xi, m + ci + 0.08, f'{m:.2f}', ha='center', va='bottom', fontsize=9.5, color=PRIMARY, fontweight='bold')
ax.set_xticks(x)
ax.set_xticklabels(groups)
ax.set_ylim(0, 5.4)
ax.set_ylabel('量表均分 (1–5 分制)')
`,
  },

  hbar: {
    body: `
items = ['响应慢/排队长', '隐性收费顾虑', '流程繁琐复杂', '客服推诿低效', '网点覆盖不足', '适老界面不清']
counts = np.array([312, 274, 241, 186, 152, 118])
n_total = 480
order = np.argsort(counts)
items_s = [items[i] for i in order]
rates = counts[order] / n_total * 100
y = np.arange(len(items_s))

ax.barh(y, rates, height=0.6, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='多选响应普及率 (n=480)')
for yi, r, c in zip(y, rates, counts[order]):
    ax.text(r + 1.2, yi, f'{r:.1f}% ({c})', va='center', fontsize=9, color=SECONDARY)
ax.set_yticks(y)
ax.set_yticklabels(items_s)
ax.set_xlim(0, max(rates) * 1.24)
ax.set_xlabel('占有效样本比例 (%)')
`,
  },

  lollipop: {
    body: `
dims = ['物流直达', '平台保障', '界面可读', '客服响应', '价格透明', '隐私合规', '售后赔付', '社区驿站']
scores = np.array([4.35, 4.18, 3.96, 3.74, 3.38, 3.22, 2.94, 2.78])
benchmark = 3.50
order = np.argsort(scores)
dims_s = [dims[i] for i in order]
scores_s = scores[order]
y = np.arange(len(dims_s))

ax.axvline(benchmark, color=SECONDARY, linestyle='--', linewidth=1.3, label=f'基准线 ({benchmark:.2f})')
for yi, val in zip(y, scores_s):
    col = PRIMARY if val >= benchmark else OPPOSITE
    ax.hlines(yi, benchmark, val, color=col, linewidth=2.0)
    ax.scatter([val], [yi], s=85, color=col, alpha=0.35, edgecolor=col, linewidth=1.6, zorder=4)
    offset = 0.08 if val >= benchmark else -0.08
    ha = 'left' if val >= benchmark else 'right'
    ax.text(val + offset, yi, f'{val:+.2f}', va='center', ha=ha, fontsize=9, color=col, fontweight='bold')
ax.scatter([], [], s=85, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='高于基准')
ax.scatter([], [], s=85, color=OPPOSITE, alpha=0.35, edgecolor=OPPOSITE, linewidth=1.6, label='低于基准')
ax.set_yticks(y)
ax.set_yticklabels(dims_s)
ax.set_xlim(2.2, 4.8)
ax.set_xlabel('评价得分 (1–5 分制)')
`,
  },

  dumbbell: {
    imports: ['from scipy import stats'],
    body: `
dims = ['价格透明', '操作便捷', '配送时效', '客服态度', '售后兜底']
urban = np.array([4.12, 4.38, 4.46, 3.95, 4.04])
county = np.array([3.34, 3.56, 3.62, 3.78, 3.41])
y = np.arange(len(dims))

ax.hlines(y, county, urban, color='#94A3B8', linewidth=2.2, zorder=2)
ax.scatter(urban, y, s=95, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, zorder=4, label='高线城市均值')
ax.scatter(county, y, s=95, color=OPPOSITE, alpha=0.35, edgecolor=OPPOSITE, linewidth=1.6, zorder=4, label='县域乡镇均值')
for yi, u, c in zip(y, urban, county):
    _, p_val = stats.ttest_ind_from_stats(u, 0.65, 198, c, 0.78, 184, equal_var=False)
    sig = '***' if p_val < 0.001 else '**' if p_val < 0.01 else '*'
    ax.text(max(u, c) + 0.08, yi, f'Δ={u - c:+.2f}{sig}', va='center', fontsize=9, color=SECONDARY, fontweight='bold')
ax.set_yticks(y)
ax.set_yticklabels(dims)
ax.set_xlim(2.8, 5.1)
ax.set_xlabel('维度均分 (1–5 分制)')
`,
  },

  slope: {
    body: `
groups = ['年轻高学历群', '县域青年家庭', '银发独居群体', '返乡创业商户', '低频观望群体']
t0 = np.array([3.92, 3.45, 2.74, 3.30, 2.95])
t1 = np.array([4.18, 4.22, 3.68, 3.84, 3.04])
highlight = [True, True, True, False, False]

for idx, (g, y0, y1, hi) in enumerate(zip(groups, t0, t1, highlight)):
    col = PRIMARY if (hi and y1 - y0 >= 0.5) else (SECONDARY if hi else '#94A3B8')
    lw = 2.2 if hi else 1.2
    line_alpha = 0.95 if hi else 0.45
    ax.plot([0, 1], [y0, y1], color=col, linewidth=lw, alpha=line_alpha, label=g if hi else None)
    ax.scatter([0, 1], [y0, y1], s=58, facecolor=col, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, zorder=4)
    ax.text(-0.04, y0, f'{g} {y0:.2f}', ha='right', va='center', fontsize=8.8, color=col)
    ax.text(1.04, y1, f'{y1:.2f} ({y1 - y0:+.2f})', ha='left', va='center', fontsize=8.8, color=col)
ax.set_xticks([0, 1])
ax.set_xticklabels(['试点干预前 (T0)', '试点干预后 (T1)'])
ax.set_xlim(-0.55, 1.55)
ax.set_ylim(2.4, 4.6)
ax.set_ylabel('持续采纳意愿均值')
`,
  },

  grouped_bar: {
    imports: ['from scipy import stats'],
    body: `
age_groups = ['18–30岁', '31–45岁', '46–60岁', '60岁+']
freq_high = np.array([68.4, 54.2, 37.8, 22.6])
freq_mid = np.array([23.1, 31.6, 40.4, 36.2])
freq_low = np.array([8.5, 14.2, 21.8, 41.2])
x = np.arange(len(age_groups))
w = 0.25

ax.bar(x - w, freq_high, width=w, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='高频日常使用')
ax.bar(x, freq_mid, width=w, color=SECONDARY, alpha=0.35, edgecolor=SECONDARY, linewidth=1.6, label='偶尔应急试用')
ax.bar(x + w, freq_low, width=w, color=OPPOSITE, alpha=0.35, edgecolor=OPPOSITE, linewidth=1.6, label='暂未接触')
chi2, p_val, _, _ = stats.chi2_contingency(np.vstack([freq_high, freq_mid, freq_low]) * 1.2)
ax.text(0.02, 0.94, f'Pearson χ² = {chi2:.2f}, p = {p_val:.4f}', transform=ax.transAxes, fontsize=9, color=SECONDARY)
ax.set_xticks(x)
ax.set_xticklabels(age_groups)
ax.set_ylim(0, 82)
ax.set_ylabel('组内占比 (%)')
`,
  },

  diverging_bar: {
    body: `
items = ['Q1 界面简洁易懂', 'Q2 响应速度及时', 'Q3 价格条款透明', 'Q4 售后赔付有保障', 'Q5 客服沟通顺畅']
neg = np.array([-14.2, -18.5, -34.6, -26.4, -19.8])
neu = np.array([15.8, 17.5, 22.4, 24.6, 21.2])
pos = np.array([70.0, 64.0, 43.0, 49.0, 59.0])
y = np.arange(len(items))

ax.barh(y, -neu / 2, height=0.56, color='#CBD5E1', alpha=0.6, edgecolor='#64748B', linewidth=1.0)
ax.barh(y, neu / 2, height=0.56, color='#CBD5E1', alpha=0.6, edgecolor='#64748B', linewidth=1.0, label='中立态度')
ax.barh(y, neg, left=-neu / 2, height=0.56, color=OPPOSITE, alpha=0.35, edgecolor=OPPOSITE, linewidth=1.6, label='非常不同意/不同意')
ax.barh(y, pos, left=neu / 2, height=0.56, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='同意/非常同意')
ax.axvline(0, color='#334155', linewidth=1.1)
for yi, n_v, p_v, m_v in zip(y, neg, pos, neu):
    ax.text(-m_v / 2 + n_v - 2, yi, f'{abs(n_v):.0f}%', va='center', ha='right', fontsize=8.5, color=OPPOSITE)
    ax.text(m_v / 2 + p_v + 2, yi, f'{p_v:.0f}%', va='center', ha='left', fontsize=8.5, color=PRIMARY)
ax.set_yticks(y)
ax.set_yticklabels(items)
ax.set_xlim(-65, 96)
ax.set_xlabel('净态度分布百分比 (%)')
`,
  },

  waterfall: {
    body: `
labels = ['基准意愿', '便利感知', '制度信任', '价格顾虑', '操作门槛', '最终水平']
deltas = np.array([2.80, 0.62, 0.48, -0.34, -0.18, 3.38])
bottoms = np.zeros(len(labels))
running = 0.0
for i in range(len(labels) - 1):
    if i == 0:
        bottoms[i] = 0.0
        running = deltas[i]
    else:
        bottoms[i] = running if deltas[i] >= 0 else running + deltas[i]
        running += deltas[i]
bottoms[-1] = 0.0
heights = np.abs(deltas)
x = np.arange(len(labels))

for i in range(len(labels)):
    col = SECONDARY if i in (0, len(labels) - 1) else (PRIMARY if deltas[i] >= 0 else OPPOSITE)
    edge_col = PRIMARY if col == PRIMARY else col
    lbl = '基准/总值' if i == 0 else ('正向贡献' if i == 1 else ('负向拖累' if deltas[i] < 0 and i == 3 else None))
    ax.bar(x[i], heights[i], bottom=bottoms[i], width=0.55, facecolor=col, alpha=0.35, edgecolor=edge_col, linewidth=1.6, label=lbl)
    top_y = bottoms[i] + heights[i]
    ax.text(x[i], top_y + 0.06, f'{deltas[i]:+.2f}' if 0 < i < len(labels) - 1 else f'{deltas[i]:.2f}',
            ha='center', va='bottom', fontsize=9, color=col, fontweight='bold')
    if i < len(labels) - 1:
        conn_y = deltas[0] if i == 0 else (bottoms[i] + heights[i] if deltas[i] >= 0 else bottoms[i])
        ax.plot([x[i] + 0.275, x[i + 1] - 0.275], [conn_y, conn_y], color='#64748B', linestyle=':', linewidth=1.1)
ax.legend(handles=[
    mpatches.Patch(facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='正向贡献要素'),
    mpatches.Patch(facecolor=OPPOSITE, alpha=0.35, edgecolor=OPPOSITE, linewidth=1.6, label='负向拖累要素'),
    mpatches.Patch(facecolor=SECONDARY, alpha=0.35, edgecolor=SECONDARY, linewidth=1.6, label='基准/终值状态'),
], frameon=False, loc='upper left')
ax.set_xticks(x)
ax.set_xticklabels(labels)
ax.set_ylim(0, 4.5)
ax.set_ylabel('增量归因得分')
`,
  },

  bullet_kpi: {
    body: `
kpis = ['触达覆盖率', '首周留存率', '复购转化率', '净推荐 NPS', '合规完备度']
actual = np.array([86, 74, 58, 66, 94])
target = np.array([80, 75, 65, 60, 90])
y = np.arange(len(kpis))

ax.barh(y, np.full_like(y, 100), height=0.62, color='#E2E8F0', alpha=0.65, label='优秀区间 (80–100)')
ax.barh(y, np.full_like(y, 75), height=0.62, color='#CBD5E1', alpha=0.65, label='合格区间 (50–75)')
ax.barh(y, actual, height=0.32, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='实际达成值')
ax.scatter(target, y, marker='|', s=320, linewidths=2.6, color=OPPOSITE, zorder=5, label='目标基准线')
for yi, a, t in zip(y, actual, target):
    ax.text(a + 1.5, yi, f'{a}% / 目标 {t}%', va='center', fontsize=8.8, color=SECONDARY)
ax.set_yticks(y)
ax.set_yticklabels(kpis)
ax.set_xlim(0, 118)
ax.set_xlabel('项目达成度 (%)')
`,
  },

  nightingale_rose: {
    mode: 'polar',
    body: `
labels = ['便利触达', '价格感知', '制度信任', '社交口碑', '售后保障', '界面友好', '内容丰富', '隐私安全']
vals = np.array([28.4, 24.6, 21.8, 19.2, 16.5, 14.8, 12.1, 9.6])
theta = np.linspace(0.0, 2 * np.pi, len(labels), endpoint=False)
width = 2 * np.pi / len(labels) * 0.92
colors = [PRIMARY if i % 2 == 0 else SECONDARY for i in range(len(labels))]

bars = ax.bar(theta, vals, width=width, bottom=4.0, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
for bar, col in zip(bars, colors):
    bar.set_facecolor(col)
    bar.set_edgecolor(col)
ax.bar([0], [0], color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='动因权重占比 (%)')
ax.set_xticks(theta)
ax.set_xticklabels(labels, fontsize=9)
ax.set_yticks([10, 20, 30])
ax.set_yticklabels(['10%', '20%', '30%'], fontsize=8)
`,
  },

  radial_grouped_bar: {
    mode: 'polar',
    body: `
dims = ['便利度', '信任感', '性价比', '适老化', '安全性', '推荐度']
urban = np.array([4.4, 4.1, 3.6, 4.0, 4.2, 4.3])
county = np.array([3.5, 3.9, 4.2, 3.1, 3.8, 3.6])
theta = np.linspace(0, 2 * np.pi, len(dims), endpoint=False)
w = 2 * np.pi / len(dims) * 0.34

ax.bar(theta - w / 2, urban, width=w, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='高线城市')
ax.bar(theta + w / 2, county, width=w, color=SECONDARY, alpha=0.35, edgecolor=SECONDARY, linewidth=1.6, label='县域地区')
ax.set_xticks(theta)
ax.set_xticklabels(dims, fontsize=9)
ax.set_ylim(0, 5.0)
`,
  },

  isometric_bar_3d: {
    mode: '3d',
    body: `
regions = ['东部高线', '中部县域', '西部乡镇']
metrics = ['便利', '信任', '性价比', '留存']
z_mat = np.array([
    [4.4, 4.1, 3.5, 4.2],
    [3.8, 3.9, 4.0, 3.7],
    [3.2, 3.6, 4.3, 3.3],
])
xpos, ypos = np.meshgrid(np.arange(len(metrics)), np.arange(len(regions)))
xpos, ypos = xpos.ravel(), ypos.ravel()
dz = z_mat.ravel()

ax.bar3d(xpos - 0.26, ypos - 0.26, np.zeros_like(dz), 0.52, 0.52, dz,
         color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
ax.bar3d([0], [0], [0], [0], [0], [0], color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='区域 × 维度均分')
ax.set_xticks(np.arange(len(metrics)))
ax.set_xticklabels(metrics)
ax.set_yticks(np.arange(len(regions)))
ax.set_yticklabels(regions)
ax.set_zlim(0, 5.0)
ax.set_zlabel('量表均分')
ax.view_init(elev=24, azim=-48)
`,
  },

  pareto_front_3d_proj: {
    mode: '3d',
    body: `
# 生成三目标可行解集 (cost f1, risk f2 极小化; efficacy f3 极大化)
n_cand = 160
f1 = rng.uniform(0.10, 0.95, n_cand)
f2 = rng.uniform(0.10, 0.95, n_cand)
ideal_f3 = 0.92 - 0.56 * ((1.0 - f1) ** 1.35) * ((1.0 - f2) ** 1.35)
f3 = ideal_f3 - rng.exponential(0.11, n_cand)
f3 = np.clip(f3, 0.12, 0.96)

# 精确 Pareto 非支配过滤: 不存在 j 使 f1_j<=f1_i, f2_j<=f2_i, f3_j>=f3_i 且至少一维严格优
is_pareto = np.ones(n_cand, dtype=bool)
for i in range(n_cand):
    dom = (f1 <= f1[i]) & (f2 <= f2[i]) & (f3 >= f3[i]) & ((f1 < f1[i]) | (f2 < f2[i]) | (f3 > f3[i]))
    if np.any(dom):
        is_pareto[i] = False

g_u, g_v = np.meshgrid(np.linspace(0.10, 0.94, 18), np.linspace(0.10, 0.94, 18))
g_z = 0.92 - 0.56 * ((1.0 - g_u) ** 1.35) * ((1.0 - g_v) ** 1.35)
ax.plot_surface(g_u, g_v, g_z, color=PRIMARY, alpha=0.22, edgecolor=PRIMARY, linewidth=0.25)

ax.scatter(f1[~is_pareto], f2[~is_pareto], f3[~is_pareto], s=22, color='#94A3B8', alpha=0.45, label='受支配可行解')
ax.scatter(f1[is_pareto], f2[is_pareto], f3[is_pareto], s=58, color=PRIMARY, edgecolor='#FFFFFF', linewidth=0.8, zorder=5,
           label=f'Pareto 非支配解 (n={int(is_pareto.sum())})')
ax.scatter(f1[is_pareto], f2[is_pareto], np.full(int(is_pareto.sum()), 0.10), s=20, color=SECONDARY, alpha=0.55,
           marker='x', label='底面二维投影')

# 锁定到理想点 (0.10, 0.10, 0.95) 欧氏距离最近的折衷膝点
p_idx = np.where(is_pareto)[0]
dist = np.sqrt((f1[p_idx] - 0.10) ** 2 + (f2[p_idx] - 0.10) ** 2 + (0.95 - f3[p_idx]) ** 2)
knee = p_idx[int(np.argmin(dist))]
ax.scatter([f1[knee]], [f2[knee]], [f3[knee]], s=150, color=OPPOSITE, marker='*', zorder=7, label='折衷膝点方案 P*')
ax.plot([f1[knee], f1[knee]], [f2[knee], f2[knee]], [0.10, f3[knee]], color=OPPOSITE, linestyle='--', linewidth=1.3)

ax.set_xlim(0.05, 1.0)
ax.set_ylim(0.05, 1.0)
ax.set_zlim(0.10, 1.0)
ax.set_xlabel('实施成本 f1 (越小越优)')
ax.set_ylabel('运营风险 f2 (越小越优)')
ax.set_zlabel('综合效能 f3 (越大越优)')
ax.view_init(elev=23, azim=-46)
`,
  },

  prompt_eval_radar_diff: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
dims = ['推理准确', '事实忠实', '格式遵循', '指令理解', '鲁棒抗扰', '吞吐效率']
base_scores = np.array([70.0, 74.0, 80.0, 78.0, 68.0, 84.0])
opt_scores = np.array([88.4, 88.2, 91.6, 86.8, 74.2, 80.6])
diffs = opt_scores - base_scores

angles = np.linspace(0, 2 * np.pi, len(dims), endpoint=False)
angles_c = np.concatenate([angles, [angles[0]]])
base_c = np.concatenate([base_scores, [base_scores[0]]])
opt_c = np.concatenate([opt_scores, [opt_scores[0]]])

fig = plt.figure(figsize=(10.4, 4.9), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.15, 1.0], wspace=0.34)
ax_rad = fig.add_subplot(gs[0], projection='polar')
ax_diff = fig.add_subplot(gs[1])

ax_rad.set_theta_offset(np.pi / 2)
ax_rad.set_theta_direction(-1)
ax_rad.plot(angles_c, base_c, color=SECONDARY, linestyle='--', linewidth=1.9, marker='s', markersize=4.5, label='基线 Prompt')
ax_rad.fill(angles_c, base_c, color=SECONDARY, alpha=0.10)
ax_rad.plot(angles_c, opt_c, color=PRIMARY, linewidth=2.3, marker='o', markersize=5, label='优化方案 (CoT+RAG)')
ax_rad.fill(angles_c, opt_c, color=PRIMARY, alpha=0.22)
ax_rad.set_xticks(angles)
ax_rad.set_xticklabels(dims, fontsize=9)
ax_rad.set_ylim(0, 100)
ax_rad.set_yticks([20, 40, 60, 80, 100])
ax_rad.set_yticklabels(['20', '40', '60', '80', '100'], fontsize=7.5, color='#64748B')
ax_rad.legend(frameon=False, loc='upper right', bbox_to_anchor=(1.22, 1.12), fontsize=8.5)
ax_rad.set_title('六维能力包络对比', fontsize=10.5, fontweight='bold', pad=14)

y_pos = np.arange(len(dims))[::-1]
bar_cols = [PRIMARY if d >= 0 else OPPOSITE for d in diffs]
ax_diff.axvline(0.0, color='#334155', linewidth=1.1)
ax_diff.barh(y_pos, diffs, height=0.54, color=bar_cols, alpha=0.82, edgecolor=bar_cols, linewidth=1.2)
for yi, d in zip(y_pos, diffs):
    ha = 'left' if d >= 0 else 'right'
    off = 0.6 if d >= 0 else -0.6
    ax_diff.text(d + off, yi, f'{d:+.1f}', va='center', ha=ha, fontsize=9, fontweight='bold',
                 color=PRIMARY if d >= 0 else OPPOSITE)
ax_diff.set_yticks(y_pos)
ax_diff.set_yticklabels(dims)
ax_diff.set_xlim(-10, 26)
ax_diff.set_xlabel('相对基线净增益 Delta (百分点)')
ax_diff.set_title('分维度净提升与效率权衡', fontsize=10.5, fontweight='bold')
ax_diff.spines['top'].set_visible(False)
ax_diff.spines['right'].set_visible(False)
ax_diff.grid(True, linestyle='--', alpha=0.25)

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.06, right=0.96, bottom=0.13, top=0.84)
`,
  },

  // -------------------------------------------------------------------------
  // 2. 看分布 (distribution) — 17
  // -------------------------------------------------------------------------
  raincloud: {
    imports: ['from scipy import stats'],
    body: `
labels = ['高线城市', '县域城区', '乡镇村居']
data = [
    rng.normal(4.2, 0.45, 90),
    rng.normal(3.7, 0.58, 90),
    rng.normal(3.1, 0.65, 90),
]
h_stat, p_val = stats.kruskal(*data)
y_grid = np.linspace(1.4, 5.4, 200)

for idx, (vals, col) in enumerate(zip(data, [PRIMARY, SECONDARY, OPPOSITE]), start=1):
    kde = stats.gaussian_kde(vals)(y_grid)
    kde_scaled = kde / kde.max() * 0.34
    ax.fill_betweenx(y_grid, idx, idx + kde_scaled, facecolor=col, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6,
                     label=labels[idx - 1])
    bp = ax.boxplot([vals], positions=[idx - 0.14], widths=0.14, patch_artist=True, showfliers=False)
    for box in bp['boxes']:
        box.set(facecolor=col, alpha=0.35, edgecolor=col, linewidth=1.6)
    jitter = rng.uniform(-0.28, -0.18, size=len(vals))
    ax.scatter(idx + jitter, vals, s=14, color=col, alpha=0.45)
ax.text(0.02, 0.94, f'Kruskal-Wallis H = {h_stat:.2f}, p = {p_val:.4f}', transform=ax.transAxes, fontsize=9, color=SECONDARY)
ax.set_xticks([1, 2, 3])
ax.set_xticklabels(labels)
ax.set_ylabel('综合满意度得分')
`,
  },

  violin: {
    imports: ['from scipy import stats'],
    body: `
labels = ['青年组', '中年组', '银发组', '商户组']
groups = [rng.normal(m, s, 110) for m, s in [(4.1, 0.5), (3.8, 0.6), (3.2, 0.72), (3.9, 0.55)]]
f_stat, p_val = stats.f_oneway(*groups)
vp = ax.violinplot(groups, positions=[1, 2, 3, 4], showmedians=True, showextrema=True)
for body in vp['bodies']:
    body.set(facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
vp['cmedians'].set_color(OPPOSITE)
vp['cmedians'].set_linewidth(2.0)
ax.plot([], [], color=PRIMARY, linewidth=4, alpha=0.35, label='核密度包络')
ax.plot([], [], color=OPPOSITE, linewidth=2.0, label=f'组间中位数 (ANOVA F={f_stat:.2f}, p={p_val:.3f})')
ax.set_xticks([1, 2, 3, 4])
ax.set_xticklabels(labels)
ax.set_ylabel('体验评价得分')
`,
  },

  box: {
    body: `
labels = ['策略 A', '策略 B', '策略 C', '对照组']
data = [rng.normal(m, s, 95) for m, s in [(4.2, 0.42), (3.85, 0.56), (3.45, 0.64), (3.15, 0.58)]]
bp = ax.boxplot(
    data, positions=[1, 2, 3, 4], widths=0.46, patch_artist=True,
    flierprops={'marker': 'o', 'markerfacecolor': OPPOSITE, 'markeredgecolor': OPPOSITE, 'markersize': 5, 'alpha': 0.7},
    medianprops={'color': OPPOSITE, 'linewidth': 2.0},
    whiskerprops={'color': PRIMARY, 'linewidth': 1.4},
    capprops={'color': PRIMARY, 'linewidth': 1.4},
)
for box in bp['boxes']:
    box.set_facecolor(PRIMARY)
    box.set_alpha(0.35)
    box.set_edgecolor(PRIMARY)
    box.set_linewidth(1.6)
ax.bar([0], [0], color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='IQR 四分位箱体')
ax.plot([], [], color=OPPOSITE, linewidth=2.0, label='中位数 & 离群值')
ax.set_xticks([1, 2, 3, 4])
ax.set_xticklabels(labels)
ax.set_xlim(0.4, 4.6)
ax.set_ylabel('连续响应指标')
`,
  },

  ridge: {
    imports: ['from scipy import stats'],
    body: `
cohorts = ['2021 年', '2022 年', '2023 年', '2024 年', '2025 年']
means = [2.95, 3.25, 3.55, 3.85, 4.18]
x_grid = np.linspace(1.2, 5.5, 240)
colors = [SECONDARY, SECONDARY, PRIMARY, PRIMARY, OPPOSITE]

for idx, (label, mu, col) in enumerate(zip(cohorts, means, colors)):
    sample = rng.normal(mu, 0.52, 240)
    kde = stats.gaussian_kde(sample)(x_grid)
    kde_norm = kde / kde.max() * 0.78
    base = idx * 0.9
    ax.fill_between(x_grid, base, base + kde_norm, facecolor=col, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6,
                    label=label if idx in (0, 2, 4) else None)
    ax.plot(x_grid, base + kde_norm, color=col, linewidth=1.6)
    ax.text(1.25, base + 0.1, label, fontsize=9, color=col, fontweight='bold')
ax.set_yticks([])
ax.set_xlabel('数字化接受度分值')
ax.set_ylabel('有序梯队（由下至上）')
`,
  },

  hist_density: {
    imports: ['from scipy import stats'],
    body: `
durations = np.concatenate([rng.exponential(38, 45), rng.normal(245, 68, 460)])
durations = np.clip(durations, 15, 600)
cutoff = 90.0
x_grid = np.linspace(0, 520, 300)
kde = stats.gaussian_kde(durations)(x_grid)

ax.hist(durations, bins=26, density=True, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='作答时长分布直方图')
ax.plot(x_grid, kde, color=SECONDARY, linewidth=2.0, label='高斯核密度估计 (KDE)')
ax.axvline(cutoff, color=OPPOSITE, linestyle='--', linewidth=1.8, label=f'极速清洗阈值 ({cutoff:.0f}s)')
ax.axvspan(0, cutoff, color=OPPOSITE, alpha=0.14)
ax.set_xlabel('问卷作答总耗时 (秒)')
ax.set_ylabel('概率密度')
`,
  },

  ecdf: {
    body: `
wtp_urban = np.sort(rng.normal(68, 16, 220))
wtp_county = np.sort(rng.normal(46, 14, 200))
y_u = np.arange(1, len(wtp_urban) + 1) / len(wtp_urban)
y_c = np.arange(1, len(wtp_county) + 1) / len(wtp_county)

ax.step(wtp_urban, y_u, where='post', color=PRIMARY, linewidth=1.8, label='高线城市 ECDF')
ax.step(wtp_county, y_c, where='post', color=SECONDARY, linewidth=1.8, label='县域人群 ECDF')
ax.fill_between(wtp_urban, 0, y_u, step='post', color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
p50_u = np.median(wtp_urban)
ax.axhline(0.5, color=OPPOSITE, linestyle='--', linewidth=1.3, label=f'中位阈值 P50 = {p50_u:.1f} 元')
ax.set_xlabel('最高可接受支付价格 (元/月)')
ax.set_ylabel('经验累积概率 F(x)')
`,
  },

  beeswarm: {
    imports: ['from scipy import stats'],
    body: `
labels = ['A 试点村', 'B 示范区', 'C 对照区']
samples = [rng.normal(m, s, 45) for m, s in [(4.28, 0.42), (3.84, 0.50), (3.26, 0.55)]]
for idx, (vals, col) in enumerate(zip(samples, [PRIMARY, SECONDARY, OPPOSITE]), start=1):
    vals_s = np.sort(vals)
    # 简易零重叠蜂群水平偏移
    offsets = np.sin(np.arange(len(vals_s)) * 1.35) * 0.16
    ax.scatter(idx + offsets, vals_s, s=34, facecolor=col, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label=labels[idx - 1])
    mu = np.mean(vals_s)
    ci = 1.96 * stats.sem(vals_s)
    ax.errorbar(idx, mu, yerr=ci, fmt='D', color='#0F172A', capsize=6, linewidth=1.8, zorder=5)
ax.set_xticks([1, 2, 3])
ax.set_xticklabels(labels)
ax.set_ylabel('个体实测评分')
`,
  },

  qq_plot: {
    imports: ['from scipy import stats'],
    body: `
resid = rng.normal(0, 1, 180)
(osm, osr), (slope, intercept, r_val) = stats.probplot(resid, dist='norm')
sw_stat, sw_p = stats.shapiro(resid)

ax.scatter(osm, osr, s=36, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='样本残差分位数')
line_x = np.array([osm.min(), osm.max()])
line_y = slope * line_x + intercept
ax.plot(line_x, line_y, color=OPPOSITE, linewidth=1.8, label=f'理论正态线 (R²={r_val**2:.3f})')
ax.text(0.04, 0.88, f'Shapiro-Wilk W = {sw_stat:.3f}, p = {sw_p:.3f}', transform=ax.transAxes, fontsize=9.5, color=SECONDARY)
ax.set_xlabel('理论标准正态分位数')
ax.set_ylabel('样本观测残差分位数')
`,
  },

  gmm_bimodal: {
    imports: ['from scipy import stats', 'from sklearn.mixture import GaussianMixture'],
    body: `
x = np.concatenate([rng.normal(2.4, 0.42, 180), rng.normal(4.15, 0.38, 260)])
gmm = GaussianMixture(n_components=2, random_state=42).fit(x.reshape(-1, 1))
grid = np.linspace(1.0, 5.4, 300)
means = gmm.means_.ravel()
stds = np.sqrt(gmm.covariances_.ravel())
weights = gmm.weights_.ravel()

ax.hist(x, bins=26, density=True, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='混合样本直方图')
pdf1 = weights[0] * stats.norm.pdf(grid, means[0], stds[0])
pdf2 = weights[1] * stats.norm.pdf(grid, means[1], stds[1])
ax.plot(grid, pdf1, color=OPPOSITE, linewidth=1.8, linestyle='--', label=f'潜群体 1 (μ={means[0]:.2f})')
ax.plot(grid, pdf2, color=SECONDARY, linewidth=1.8, linestyle='--', label=f'潜群体 2 (μ={means[1]:.2f})')
ax.plot(grid, pdf1 + pdf2, color='#0F172A', linewidth=2.0, label='GMM 联合拟合密度')
ax.set_xlabel('用户综合活跃指数')
ax.set_ylabel('概率密度')
`,
  },

  se_band_dot: {
    body: `
x = np.arange(1, 8)
labels = ['第1档', '第2档', '第3档', '第4档', '第5档', '第6档', '第7档']
means = np.array([2.42, 2.78, 3.16, 3.64, 3.98, 4.18, 4.26])
se = np.array([0.11, 0.10, 0.09, 0.08, 0.09, 0.10, 0.12])

ax.fill_between(x, means - 1.96 * se, means + 1.96 * se, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6,
                label='均值 ± 1.96 SE 置信带')
ax.plot(x, means, marker='o', markersize=7, color=PRIMARY, linewidth=2.0, label='梯队均值轨迹')
ax.axhline(3.5, color=OPPOSITE, linestyle='--', linewidth=1.3, label='及格基准线')
ax.set_xticks(x)
ax.set_xticklabels(labels)
ax.set_ylabel('意愿得分均值')
`,
  },

  radar_ridge_hybrid: {
    mode: 'polar',
    body: `
dims = ['触达便利', '界面友好', '制度信任', '成本可控', '服务响应', '情感认同']
p10 = np.array([2.2, 2.4, 2.6, 2.0, 2.5, 2.3])
p50 = np.array([3.9, 3.7, 4.1, 3.2, 3.8, 3.6])
p90 = np.array([4.8, 4.7, 4.9, 4.4, 4.8, 4.6])
angles = np.linspace(0, 2 * np.pi, len(dims), endpoint=False)
angles_c = np.concatenate([angles, [angles[0]]])
p10_c, p50_c, p90_c = [np.concatenate([arr, [arr[0]]]) for arr in (p10, p50, p90)]

ax.fill(np.concatenate([angles_c, angles_c[::-1]]), np.concatenate([p90_c, p10_c[::-1]]),
        color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='P10–P90 分位数包络带')
ax.plot(angles_c, p50_c, color=OPPOSITE, linewidth=2.2, marker='o', label='P50 中位数轮廓')
ax.set_xticks(angles)
ax.set_xticklabels(dims, fontsize=9)
ax.set_ylim(0, 5.2)
`,
  },

  split_violin: {
    imports: ['from scipy import stats'],
    body: `
dims = ['便利感知', '信任评价', '留存倾向']
y_grid = np.linspace(1.2, 5.2, 200)
for idx in range(1, len(dims) + 1):
    s_left = rng.normal(3.95 - 0.2 * idx, 0.45, 160)
    s_right = rng.normal(3.45 + 0.1 * idx, 0.52, 160)
    k_l = stats.gaussian_kde(s_left)(y_grid)
    k_r = stats.gaussian_kde(s_right)(y_grid)
    scale = 0.34 / max(k_l.max(), k_r.max())
    ax.fill_betweenx(y_grid, idx - k_l * scale, idx, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6,
                     label='线上样本' if idx == 1 else None)
    ax.fill_betweenx(y_grid, idx, idx + k_r * scale, color=SECONDARY, alpha=0.35, edgecolor=SECONDARY, linewidth=1.6,
                     label='线下样本' if idx == 1 else None)
    ax.hlines(np.median(s_left), idx - 0.22, idx, color='#0F172A', linewidth=1.6)
    ax.hlines(np.median(s_right), idx, idx + 0.22, color=OPPOSITE, linewidth=1.6)
ax.set_xticks([1, 2, 3])
ax.set_xticklabels(dims)
ax.set_ylabel('量表分值分布')
`,
  },

  cvar_tail_loss: {
    imports: ['from scipy import stats'],
    body: `
ret = np.concatenate([rng.normal(3.2, 4.1, 4200), rng.normal(-6.2, 5.5, 800)])
var_95 = np.percentile(ret, 5.0)
cvar_95 = ret[ret <= var_95].mean()
grid = np.linspace(np.percentile(ret, 0.2), np.percentile(ret, 99.8), 320)
kde = stats.gaussian_kde(ret)(grid)

ax.fill_between(grid, 0, kde, where=(grid >= var_95), color=PRIMARY, alpha=0.25, label='95% 常态损益区间')
ax.fill_between(grid, 0, kde, where=(grid <= var_95), color=OPPOSITE, alpha=0.52, label='最坏 5% 极端尾部区')
ax.plot(grid, kde, color=PRIMARY, linewidth=2.0)
ax.axvline(0.0, color='#64748B', linestyle=':', linewidth=1.2, label='盈亏平衡线 (0%)')
ax.axvline(var_95, color=OPPOSITE, linestyle='--', linewidth=1.8, label=f'VaR 95% = {var_95:.2f}%')
ax.axvline(cvar_95, color=SECONDARY, linestyle='-.', linewidth=1.8, label=f'CVaR (ES) = {cvar_95:.2f}%')
ax.set_xlabel('投资组合 / 运营净损益情景 (%)')
ax.set_ylabel('概率密度估计')
`,
  },

  lorenz_gini: {
    body: `
pre_inc = np.sort(rng.lognormal(mean=1.4, sigma=0.66, size=320))
post_inc = np.sort(rng.lognormal(mean=1.5, sigma=0.47, size=320))

def lorenz_curve(arr):
    p = np.linspace(0.0, 1.0, len(arr) + 1)
    cum = np.concatenate([[0.0], np.cumsum(arr) / np.sum(arr)])
    gini = 1.0 - np.sum((cum[:-1] + cum[1:]) * np.diff(p))
    return p, cum, gini

p1, l1, g1 = lorenz_curve(pre_inc)
p2, l2, g2 = lorenz_curve(post_inc)

ax.plot([0, 1], [0, 1], color='#475569', linestyle='--', linewidth=1.3, label='绝对均等线 (Gini=0)')
ax.fill_between(p1, l1, p1, color=OPPOSITE, alpha=0.16, label='基线不均等面积 A')
ax.fill_between(p2, l2, p2, color=PRIMARY, alpha=0.22)
ax.plot(p1, l1, color=OPPOSITE, linestyle='--', linewidth=2.0, label=f'基线期洛伦兹曲线 (Gini={g1:.3f})')
ax.plot(p2, l2, color=PRIMARY, linewidth=2.3, label=f'优化后洛伦兹曲线 (Gini={g2:.3f})')
ax.set_xlabel('样本群体累计人口占比 p')
ax.set_ylabel('资源 / 收益累计份额 L(p)')
`,
  },

  kaplan_competing_risk: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
# 模拟含互斥竞争风险事件的纵向随访数据 (0=删失, 1=目标事件, 2=竞争事件)
n_sub = 420
t_ev1 = rng.exponential(42.0, n_sub)
t_ev2 = rng.exponential(78.0, n_sub)
t_cens = rng.uniform(14.0, 44.0, n_sub)
t_obs = np.minimum(np.minimum(t_ev1, t_ev2), np.minimum(t_cens, 36.0))
status = np.where((t_obs == t_ev1) & (t_obs < 36.0), 1, np.where((t_obs == t_ev2) & (t_obs < 36.0), 2, 0))

# 纯 NumPy 精确计算 Aalen-Johansen CIF1/CIF2 与朴素 1-KM
times = np.sort(np.unique(t_obs[status > 0]))
t_grid = np.concatenate([[0.0], times, [36.0]])
s_km_all = 1.0
s_km_naive = 1.0
cif1_val, cif2_val = 0.0, 0.0
cif1_arr, cif2_arr, naive_arr = [0.0], [0.0], [0.0]

for tj in times:
    n_risk = int(np.sum(t_obs >= tj))
    d1 = int(np.sum((t_obs == tj) & (status == 1)))
    d2 = int(np.sum((t_obs == tj) & (status == 2)))
    if n_risk > 0:
        cif1_val += s_km_all * (d1 / n_risk)
        cif2_val += s_km_all * (d2 / n_risk)
        s_km_all *= (1.0 - (d1 + d2) / n_risk)
        s_km_naive *= (1.0 - d1 / n_risk)
    cif1_arr.append(cif1_val)
    cif2_arr.append(cif2_val)
    naive_arr.append(1.0 - s_km_naive)

cif1_arr.append(cif1_arr[-1])
cif2_arr.append(cif2_arr[-1])
naive_arr.append(naive_arr[-1])

fig = plt.figure(figsize=(8.8, 5.8), dpi=180)
gs = GridSpec(2, 1, height_ratios=[3.4, 1.0], hspace=0.22)
ax_cif = fig.add_subplot(gs[0])
ax_tbl = fig.add_subplot(gs[1])

ax_cif.fill_between(t_grid, cif1_arr, naive_arr, step='post', color=OPPOSITE, alpha=0.14, label='错误 1-KM 高估偏误区')
ax_cif.step(t_grid, naive_arr, where='post', color=OPPOSITE, linestyle='--', linewidth=1.8, label='朴素 1-KM (忽略竞争风险)')
ax_cif.step(t_grid, cif1_arr, where='post', color=PRIMARY, linewidth=2.4, label='Fine-Gray / AJ 目标事件 CIF1')
ax_cif.step(t_grid, cif2_arr, where='post', color=SECONDARY, linewidth=2.0, label='竞争风险事件 CIF2')
ax_cif.set_xlim(0, 36)
ax_cif.set_ylim(0, 0.80)
ax_cif.set_xticks([0, 6, 12, 18, 24, 30, 36])
ax_cif.set_ylabel('累积发病率 CIF(t)')
ax_cif.legend(frameon=False, loc='upper left', fontsize=8.5)
ax_cif.spines['top'].set_visible(False)
ax_cif.spines['right'].set_visible(False)
ax_cif.grid(True, linestyle='--', alpha=0.25)

ticks_m = [0, 6, 12, 18, 24, 30, 36]
at_risk = [int(np.sum(t_obs >= m)) for m in ticks_m]
cum_ev1 = [int(np.sum((t_obs <= m) & (status == 1))) for m in ticks_m]
ax_tbl.set_xlim(0, 36)
ax_tbl.set_ylim(0, 2.4)
ax_tbl.axis('off')
ax_tbl.text(-1.2, 1.65, '在险 n', ha='right', va='center', fontsize=9, fontweight='bold', color='#334155')
ax_tbl.text(-1.2, 0.70, '事件 1', ha='right', va='center', fontsize=9, fontweight='bold', color=PRIMARY)
for m, nr, ev in zip(ticks_m, at_risk, cum_ev1):
    ax_tbl.text(m, 1.65, str(nr), ha='center', va='center', fontsize=9, color='#1E293B')
    ax_tbl.text(m, 0.70, str(ev), ha='center', va='center', fontsize=9, color=PRIMARY)
ax_tbl.text(18, 0.05, '随访观察月数 t (sHR = 1.64, Gray p = 0.003)', ha='center', va='center', fontsize=9.5, color='#475569')

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.11, right=0.96, bottom=0.06, top=0.89)
`,
  },

  order_book_depth: {
    body: `
mid_price = 100.00
bid_prices = np.array([99.99, 99.95, 99.90, 99.83, 99.72, 99.60, 99.48, 99.40])
bid_sizes = np.array([12.0, 12.0, 15.0, 15.0, 28.0, 16.0, 16.0, 6.0])
bid_cum = np.cumsum(bid_sizes)

ask_prices = np.array([100.01, 100.05, 100.12, 100.20, 100.32, 100.44, 100.56, 100.60])
ask_sizes = np.array([9.0, 10.0, 12.0, 15.0, 28.0, 14.0, 8.0, 4.0])
ask_cum = np.cumsum(ask_sizes)

obi = (np.sum(bid_sizes[:5]) - np.sum(ask_sizes[:5])) / (np.sum(bid_sizes[:5]) + np.sum(ask_sizes[:5]))
spread_bps = (ask_prices[0] - bid_prices[0]) / mid_price * 10000.0

ax.axvspan(bid_prices[0], ask_prices[0], color=SECONDARY, alpha=0.16, label=f'买卖价差 Spread = {spread_bps:.1f} bps')
ax.axvline(mid_price, color='#334155', linestyle='--', linewidth=1.2, label=f'中间价 Mid = {mid_price:.2f}')

ax.fill_between(bid_prices, 0, bid_cum, step='pre', color=PRIMARY, alpha=0.24)
ax.step(bid_prices, bid_cum, where='pre', color=PRIMARY, linewidth=2.2, label='买盘累计深度 Bid')
ax.fill_between(ask_prices, 0, ask_cum, step='post', color=OPPOSITE, alpha=0.24)
ax.step(ask_prices, ask_cum, where='post', color=OPPOSITE, linewidth=2.2, label='卖盘累计深度 Ask')

ax.bar(bid_prices[:-1], bid_sizes[:-1], width=0.018, color=PRIMARY, alpha=0.65)
ax.bar(ask_prices[:-1], ask_sizes[:-1], width=0.018, color=OPPOSITE, alpha=0.65)

ax.text(mid_price, 106, f'盘口失衡度 OBI = {obi:+.2f} (买盘支撑占优)', ha='center', va='center',
        fontsize=9, fontweight='bold', color=PRIMARY,
        bbox=dict(boxstyle='round,pad=0.3', facecolor='#FFFFFF', edgecolor=PRIMARY, alpha=0.9))
ax.annotate('流动性支撑墙 (99.72)', xy=(99.72, 82), xytext=(99.54, 104),
            fontsize=8.5, fontweight='bold', color=PRIMARY,
            arrowprops=dict(arrowstyle='->', color=PRIMARY, lw=1.2))
ax.annotate('卖方阻力墙 (100.32)', xy=(100.32, 74), xytext=(100.36, 98),
            fontsize=8.5, fontweight='bold', color=OPPOSITE,
            arrowprops=dict(arrowstyle='->', color=OPPOSITE, lw=1.2))

ax.set_xlim(99.38, 100.62)
ax.set_ylim(0, 128)
ax.set_xlabel('限价委托报价档位 (Price)')
ax.set_ylabel('累计挂单深度 (万元)')
`,
  },

  bootstrap_bca_dist: {
    mode: 'custom',
    imports: ['import math', 'from matplotlib.gridspec import GridSpec'],
    body: `
def norm_cdf(z):
    return 0.5 * (1.0 + math.erf(float(z) / math.sqrt(2.0)))

def norm_ppf(p):
    p = min(max(float(p), 1e-12), 1.0 - 1e-12)
    lo, hi = -8.0, 8.0
    for _ in range(55):
        mid = 0.5 * (lo + hi)
        if norm_cdf(mid) < p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)

n = 160
x_obs = rng.lognormal(mean=0.1, sigma=0.42, size=n)
y_obs = 0.23 * (x_obs ** 1.15) + rng.normal(0.0, 0.16, size=n)
stat_fn = lambda idx_arr: float(np.mean(y_obs[idx_arr]) / np.mean(x_obs[idx_arr]))

theta_hat = stat_fn(np.arange(n))
B = 5000
boot_idx = rng.integers(0, n, size=(B, n))
boot_vals = np.mean(y_obs[boot_idx], axis=1) / np.mean(x_obs[boot_idx], axis=1)

# 刀切法 (Jackknife) 计算偏差校正 z0 与加速常数 a
jack_vals = np.empty(n)
sum_y, sum_x = float(np.sum(y_obs)), float(np.sum(x_obs))
for i in range(n):
    jack_vals[i] = (sum_y - y_obs[i]) / (sum_x - x_obs[i])
jack_diff = np.mean(jack_vals) - jack_vals
a_acc = float(np.sum(jack_diff ** 3) / (6.0 * (np.sum(jack_diff ** 2) ** 1.5) + 1e-12))
prop_lt = float(np.mean(boot_vals < theta_hat))
z0 = norm_ppf(prop_lt)

z_lo, z_hi = norm_ppf(0.025), norm_ppf(0.975)
alpha_1 = norm_cdf(z0 + (z0 + z_lo) / (1.0 - a_acc * (z0 + z_lo)))
alpha_2 = norm_cdf(z0 + (z0 + z_hi) / (1.0 - a_acc * (z0 + z_hi)))
bca_lo, bca_hi = np.quantile(boot_vals, [alpha_1, alpha_2])
pct_lo, pct_hi = np.quantile(boot_vals, [0.025, 0.975])
se_boot = float(np.std(boot_vals, ddof=1))
norm_lo, norm_hi = theta_hat - 1.96 * se_boot, theta_hat + 1.96 * se_boot

# 纯 NumPy 高斯核密度估计
grid = np.linspace(float(boot_vals.min()) - 0.02, float(boot_vals.max()) + 0.02, 220)
bw = 1.06 * se_boot * (B ** (-0.2))
diff_mat = (grid[:, None] - boot_vals[None, :500]) / bw
kde = np.mean(np.exp(-0.5 * (diff_mat ** 2)), axis=1) / (bw * math.sqrt(2.0 * math.pi))

fig = plt.figure(figsize=(8.8, 5.6), dpi=180)
gs = GridSpec(2, 1, height_ratios=[3.1, 1.15], hspace=0.14)
ax_d = fig.add_subplot(gs[0])
ax_ci = fig.add_subplot(gs[1], sharex=ax_d)

counts, edges, patches = ax_d.hist(boot_vals, bins=32, density=True, edgecolor='#FFFFFF', linewidth=0.7)
for patch, left_e, right_e in zip(patches, edges[:-1], edges[1:]):
    mid_e = 0.5 * (left_e + right_e)
    in_bca = (mid_e >= bca_lo) and (mid_e <= bca_hi)
    patch.set_facecolor(PRIMARY if in_bca else '#CBD5E1')
    patch.set_alpha(0.58 if in_bca else 0.55)

ax_d.plot(grid, kde, color=SECONDARY, linewidth=2.1, label='Bootstrap 核密度包络')
ax_d.axvline(0.0, color=OPPOSITE, linestyle='--', linewidth=1.3, label='零效应参考线 (0)')
ax_d.axvline(theta_hat, color='#1E293B', linestyle=':', linewidth=1.4, label=f'样本点估计 = {theta_hat:.3f}')
ax_d.text(0.98, 0.88, f'z0 = {z0:+.3f},  a = {a_acc:+.4f}\\nBCa 95% CI [{bca_lo:.3f}, {bca_hi:.3f}]',
          transform=ax_d.transAxes, ha='right', va='top', fontsize=8.8, fontweight='bold', color=PRIMARY,
          bbox=dict(boxstyle='round,pad=0.35', facecolor='#FFFFFF', edgecolor=PRIMARY, alpha=0.9))
ax_d.set_ylabel('经验概率密度')
ax_d.legend(frameon=False, loc='upper left', fontsize=8.4)
plt.setp(ax_d.get_xticklabels(), visible=False)

ci_specs = [
    ('BCa 偏差校正法', bca_lo, bca_hi, PRIMARY, '-'),
    ('百分位法 Pct', pct_lo, pct_hi, SECONDARY, '--'),
    ('正态对称 +-1.96SE', norm_lo, norm_hi, OPPOSITE, ':'),
]
for yi, (lbl, lo, hi, col, ls) in enumerate(ci_specs):
    ax_ci.plot([lo, hi], [2 - yi, 2 - yi], color=col, linestyle=ls, linewidth=2.4)
    ax_ci.scatter([lo, theta_hat, hi], [2 - yi, 2 - yi, 2 - yi], color=col, s=[38, 52, 38], zorder=4)
    ax_ci.text(hi + 0.008, 2 - yi, f'[{lo:.3f}, {hi:.3f}]', va='center', fontsize=8.4, color=col, fontweight='bold')
ax_ci.axvline(0.0, color=OPPOSITE, linestyle='--', linewidth=1.2)
ax_ci.axvline(theta_hat, color='#1E293B', linestyle=':', linewidth=1.2)
ax_ci.set_yticks([0, 1, 2])
ax_ci.set_yticklabels([c[0] for c in ci_specs[::-1]], fontsize=8.6)
ax_ci.set_ylim(-0.6, 2.6)
ax_ci.set_xlim(min(-0.04, norm_lo - 0.04), max(bca_hi, norm_hi) + 0.14)
ax_ci.set_xlabel('自助抽样估计量 theta* (B = 5000 次重抽样)')

for target_ax in (ax_d, ax_ci):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.16, right=0.96, bottom=0.12, top=0.88)
`,
  },

  // -------------------------------------------------------------------------
  // 3. 看关系与曲面 (relationship) — 18
  // -------------------------------------------------------------------------
  scatter_ci: {
    imports: ['from scipy import stats', 'import statsmodels.api as sm'],
    body: `
x = rng.uniform(1.5, 5.0, 140)
y = 1.15 + 0.62 * x + rng.normal(0, 0.48, 140)
X = sm.add_constant(x)
ols = sm.OLS(y, X).fit()
xg = np.linspace(x.min(), x.max(), 120)
pred = ols.get_prediction(sm.add_constant(xg)).summary_frame(alpha=0.05)
r_val, p_val = stats.pearsonr(x, y)

ax.scatter(x, y, s=40, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='观测样本散点')
ax.fill_between(xg, pred['mean_ci_lower'], pred['mean_ci_upper'], color=SECONDARY, alpha=0.35,
                edgecolor=SECONDARY, linewidth=1.6, label='95% 置信带')
ax.plot(xg, pred['mean'], color=OPPOSITE, linewidth=2.0, label=f'OLS 拟合 (r={r_val:.3f}, p={p_val:.3g})')
ax.set_xlabel('制度信任感知 (X)')
ax.set_ylabel('持续采纳意愿 (Y)')
`,
  },

  marginal_scatter: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec', 'from scipy import stats'],
    body: `
x = rng.normal(3.6, 0.72, 220)
y = 1.2 + 0.68 * x + rng.normal(0, 0.55, 220)
r_val, p_val = stats.pearsonr(x, y)

fig = plt.figure(figsize=(7.6, 6.4), dpi=180)
gs = GridSpec(4, 4, figure=fig, hspace=0.08, wspace=0.08)
ax_main = fig.add_subplot(gs[1:, :3])
ax_top = fig.add_subplot(gs[0, :3], sharex=ax_main)
ax_right = fig.add_subplot(gs[1:, 3], sharey=ax_main)

ax_main.scatter(x, y, s=36, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label=f'联合散点 (r={r_val:.3f})')
m, b = np.polyfit(x, y, 1)
xg = np.linspace(x.min(), x.max(), 80)
ax_main.plot(xg, m * xg + b, color=OPPOSITE, linewidth=2.0, label=f'线性拟合 (p={p_val:.3g})')
ax_top.hist(x, bins=20, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
ax_right.hist(y, bins=20, orientation='horizontal', color=SECONDARY, alpha=0.35, edgecolor=SECONDARY, linewidth=1.6)
plt.setp(ax_top.get_xticklabels(), visible=False)
plt.setp(ax_right.get_yticklabels(), visible=False)
ax_main.set_xlabel('服务便利度 (X)')
ax_main.set_ylabel('采纳意愿 (Y)')
ax_main.legend(frameon=False, loc='upper left')
for target_ax in (ax_main, ax_top, ax_right):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.5, fontweight='bold', y=0.96)
`,
  },

  corr_heatmap: {
    body: `
vars_name = ['便利度', '信任度', '性价比', '适老性', '采纳意愿']
corr = np.array([
    [1.00, 0.46, 0.28, 0.52, 0.61],
    [0.46, 1.00, 0.34, 0.41, 0.58],
    [0.28, 0.34, 1.00, 0.19, 0.44],
    [0.52, 0.41, 0.19, 1.00, 0.49],
    [0.61, 0.58, 0.44, 0.49, 1.00],
])
cmap = mcolors.LinearSegmentedColormap.from_list('corr_div', [OPPOSITE, '#FFFFFF', PRIMARY])
n = len(vars_name)
ax.imshow(np.triu(corr, k=1), cmap=cmap, vmin=-1, vmax=1, alpha=0.35)
for i in range(n):
    for j in range(n):
        if i > j:
            ax.scatter(j, i, s=abs(corr[i, j]) * 850, color=PRIMARY if corr[i, j] >= 0 else OPPOSITE,
                       alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
        elif i < j:
            ax.text(j, i, f'{corr[i, j]:.2f}***', ha='center', va='center', fontsize=9, color='#0F172A', fontweight='bold')
        else:
            ax.text(j, i, '1.00', ha='center', va='center', fontsize=9, color=SECONDARY)
ax.scatter([], [], s=120, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='下三角气泡: |r| 强度')
ax.set_xticks(range(n))
ax.set_xticklabels(vars_name, rotation=18)
ax.set_yticks(range(n))
ax.set_yticklabels(vars_name)
`,
  },

  relief_heatmap_3d: {
    body: `
tiers = ['19元基础', '29元标准', '39元尊享', '59元定制']
addons = ['自提', '次日达', '上门安装', '专属客服']
utility = np.array([
    [2.6, 3.1, 3.4, 3.2],
    [3.1, 3.9, 4.3, 4.0],
    [2.9, 3.7, 4.5, 4.4],
    [2.2, 3.0, 3.8, 3.9],
])
cmap = mcolors.LinearSegmentedColormap.from_list('relief', ['#F8FAFC', SECONDARY, PRIMARY])
im = ax.imshow(utility, cmap=cmap, aspect='auto', alpha=0.85)
ax.contour(utility, levels=4, colors=PRIMARY, linewidths=1.6)
for i in range(len(addons)):
    for j in range(len(tiers)):
        ax.text(j, i, f'{utility[i, j]:.1f}', ha='center', va='center', fontsize=9.5, color='#0F172A', fontweight='bold')
ax.bar([0], [0], color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='响应效用等高矩阵')
plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04, label='组合效用得分')
ax.set_xticks(range(len(tiers)))
ax.set_xticklabels(tiers)
ax.set_yticks(range(len(addons)))
ax.set_yticklabels(addons)
`,
  },

  contour_2d: {
    imports: ['from scipy import stats'],
    body: `
x = rng.normal(3.6, 0.7, 260)
y = 0.7 * x + rng.normal(1.2, 0.55, 260)
xx, yy = np.mgrid[1.5:5.5:80j, 1.5:5.8:80j]
kde = stats.gaussian_kde(np.vstack([x, y]))
zz = np.reshape(kde(np.vstack([xx.ravel(), yy.ravel()])).T, xx.shape)
cmap = mcolors.LinearSegmentedColormap.from_list('kde2d', ['#FFFFFF', PRIMARY])

ax.contourf(xx, yy, zz, levels=8, cmap=cmap, alpha=0.35)
ax.contour(xx, yy, zz, levels=8, colors=PRIMARY, linewidths=1.6)
ax.scatter(x, y, s=16, color=SECONDARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='联合样本观测点')
ax.set_xlabel('感知有用性 (X)')
ax.set_ylabel('制度信任度 (Y)')
`,
  },

  surface_3d_proj: {
    mode: '3d',
    body: `
x1 = np.linspace(-2, 2, 40)
x2 = np.linspace(-2, 2, 40)
X1, X2 = np.meshgrid(x1, x2)
Z = 3.6 + 0.55 * X1 + 0.42 * X2 + 0.25 * X1 * X2 - 0.35 * X1**2 - 0.28 * X2**2

ax.plot_surface(X1, X2, Z, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=0.5)
ax.contour(X1, X2, Z, zdir='z', offset=Z.min() - 0.5, levels=6, colors=SECONDARY, linewidths=1.6)
ax.bar3d([0], [0], [0], [0], [0], [0], color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='二次响应面 Z(X1, X2)')
ax.set_zlim(Z.min() - 0.6, Z.max() + 0.3)
ax.set_xlabel('X1 标准化激励')
ax.set_ylabel('X2 标准化便利度')
ax.set_zlabel('预测采纳意愿 Z')
`,
  },

  bubble: {
    body: `
labels = ['流程简化', '价格透明', '社区站点', '专属客服', '语音引导', '积分补贴']
x = np.array([4.3, 3.1, 3.8, 2.7, 4.1, 3.4])
y = np.array([4.4, 4.2, 3.9, 3.1, 3.4, 2.8])
pop = np.array([180, 240, 150, 95, 130, 110])

ax.axvline(np.mean(x), color=SECONDARY, linestyle='--', linewidth=1.3)
ax.axhline(np.mean(y), color=SECONDARY, linestyle='--', linewidth=1.3)
ax.scatter(x, y, s=pop * 3.2, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='战略气泡 (面积=受众规模)')
for xi, yi, lbl in zip(x, y, labels):
    ax.text(xi, yi, lbl, ha='center', va='center', fontsize=8.8, color='#0F172A', fontweight='bold')
ax.set_xlim(2.2, 4.9)
ax.set_ylim(2.4, 4.9)
ax.set_xlabel('认知度得分')
ax.set_ylabel('转化潜力得分')
`,
  },

  parallel_coords: {
    body: `
dims = ['触达便利', '价格敏感', '信任度', '推荐意愿', '留存率']
x = np.arange(len(dims))
profiles = {
    '核心拥趸群 (C1)': (np.array([0.85, 0.35, 0.88, 0.90, 0.86]), PRIMARY),
    '务实观望群 (C2)': (np.array([0.58, 0.62, 0.55, 0.50, 0.54]), SECONDARY),
    '价格敏感群 (C3)': (np.array([0.42, 0.92, 0.44, 0.32, 0.35]), OPPOSITE),
}
for name, (center, col) in profiles.items():
    for _ in range(12):
        noisy = np.clip(center + rng.normal(0, 0.06, len(dims)), 0, 1)
        ax.plot(x, noisy, color=col, alpha=0.22, linewidth=1.0)
    ax.plot(x, center, color=col, linewidth=2.4, marker='o', label=name)
ax.fill_between(x, 0.45, 0.75, facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
ax.set_xticks(x)
ax.set_xticklabels(dims)
ax.set_ylim(0, 1.05)
ax.set_ylabel('标准化轮廓值 [0, 1]')
`,
  },

  sankey: {
    imports: ['from matplotlib.path import Path'],
    body: `
left_nodes = [('线上社媒', 0.45, PRIMARY), ('社区地推', 0.35, SECONDARY), ('熟人推荐', 0.20, OPPOSITE)]
right_nodes = [('高粘性留存', 0.52, PRIMARY), ('低频试用', 0.30, SECONDARY), ('首月流失', 0.18, OPPOSITE)]
flows = [(0, 0, 0.24), (0, 1, 0.13), (0, 2, 0.08), (1, 0, 0.14), (1, 1, 0.13), (1, 2, 0.08), (2, 0, 0.14), (2, 1, 0.04), (2, 2, 0.02)]

def stack_pos(nodes):
    y0, out = 0.08, []
    for name, w, col in nodes:
        h = w * 0.78
        out.append((name, y0, y0 + h, col))
        y0 += h + 0.04
    return out

L, R = stack_pos(left_nodes), stack_pos(right_nodes)
l_off = [y0 for _, y0, _, _ in L]
r_off = [y0 for _, y0, _, _ in R]

for name, y0, y1, col in L:
    ax.add_patch(mpatches.Rectangle((0.08, y0), 0.06, y1 - y0, facecolor=col, alpha=0.35, edgecolor=col, linewidth=1.6))
    ax.text(0.06, (y0 + y1) / 2, name, ha='right', va='center', fontsize=9.5, color='#0F172A')
for name, y0, y1, col in R:
    ax.add_patch(mpatches.Rectangle((0.86, y0), 0.06, y1 - y0, facecolor=col, alpha=0.35, edgecolor=col, linewidth=1.6))
    ax.text(0.94, (y0 + y1) / 2, name, ha='left', va='center', fontsize=9.5, color='#0F172A')
for i, j, w in flows:
    h = w * 0.78
    ya0, yb0 = l_off[i], r_off[j]
    l_off[i] += h
    r_off[j] += h
    verts = [(0.14, ya0), (0.50, ya0), (0.50, yb0), (0.86, yb0), (0.86, yb0 + h), (0.50, yb0 + h), (0.50, ya0 + h), (0.14, ya0 + h), (0.14, ya0)]
    codes = [Path.MOVETO, Path.CURVE4, Path.CURVE4, Path.CURVE4, Path.LINETO, Path.CURVE4, Path.CURVE4, Path.CURVE4, Path.CLOSEPOLY]
    ax.add_patch(mpatches.PathPatch(Path(verts, codes), facecolor=L[i][3], alpha=0.35, edgecolor=PRIMARY, linewidth=1.6))
ax.legend(handles=[mpatches.Patch(facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='渠道→状态转化流量')],
          frameon=False, loc='upper center')
ax.set_xlim(-0.18, 1.18)
ax.set_ylim(0, 1.02)
ax.axis('off')
`,
  },

  chord: {
    imports: ['from matplotlib.path import Path'],
    body: `
nodes = ['响应慢', '价格贵', '流程繁', '客服弱', '覆盖少']
cols = [PRIMARY, SECONDARY, OPPOSITE, PRIMARY, SECONDARY]
n = len(nodes)
angles = np.linspace(0, 360, n, endpoint=False)
span = 360 / n * 0.78
for ang, name, col in zip(angles, nodes, cols):
    ax.add_patch(mpatches.Wedge((0, 0), 1.0, ang, ang + span, width=0.10, facecolor=col, alpha=0.35, edgecolor=col, linewidth=1.6))
    mid = np.deg2rad(ang + span / 2)
    ax.text(1.16 * np.cos(mid), 1.16 * np.sin(mid), name, ha='center', va='center', fontsize=9.5)
pairs = [(0, 1, 0.8), (0, 2, 0.6), (1, 3, 0.5), (2, 4, 0.7), (1, 4, 0.45)]
for i, j, weight in pairs:
    a1 = np.deg2rad(angles[i] + span / 2)
    a2 = np.deg2rad(angles[j] + span / 2)
    p1 = (0.88 * np.cos(a1), 0.88 * np.sin(a1))
    p2 = (0.88 * np.cos(a2), 0.88 * np.sin(a2))
    path = Path([p1, (0, 0), p2], [Path.MOVETO, Path.CURVE3, Path.CURVE3])
    ax.add_patch(mpatches.PathPatch(path, facecolor='none', edgecolor=PRIMARY, alpha=0.35 + 0.4 * weight, linewidth=1.6 + 2.5 * weight))
ax.legend(handles=[mpatches.Patch(facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='多选共现关联弦线')],
          frameon=False, loc='upper right')
ax.set_xlim(-1.38, 1.38)
ax.set_ylim(-1.32, 1.32)
ax.set_aspect('equal')
ax.axis('off')
`,
  },

  ternary: {
    body: `
# 三元坐标 (a=功能, b=情感, c=成本, a+b+c=1) 投影到二维正三角形
pts = rng.dirichlet([3.2, 2.4, 2.0], size=90)
px = pts[:, 1] + 0.5 * pts[:, 2]
py = (np.sqrt(3) / 2) * pts[:, 2]

tri = np.array([[0, 0], [1, 0], [0.5, np.sqrt(3) / 2], [0, 0]])
ax.plot(tri[:, 0], tri[:, 1], color=PRIMARY, linewidth=1.6)
ax.fill(tri[:-1, 0], tri[:-1, 1], color=PRIMARY, alpha=0.06)
ax.scatter(px, py, s=42, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='个体三元权重样本')
cx, cy = np.mean(px), np.mean(py)
ax.scatter([cx], [cy], s=140, marker='*', color=OPPOSITE, edgecolor=OPPOSITE, linewidth=1.6, zorder=5, label='群体均值重心')
ax.text(-0.04, -0.04, '功能权重 100%', ha='right', fontsize=9.5)
ax.text(1.04, -0.04, '情感权重 100%', ha='left', fontsize=9.5)
ax.text(0.50, np.sqrt(3) / 2 + 0.04, '成本权重 100%', ha='center', fontsize=9.5)
ax.set_xlim(-0.22, 1.22)
ax.set_ylim(-0.12, 1.02)
ax.set_aspect('equal')
ax.axis('off')
`,
  },

  pareto_frontier: {
    body: `
cost = rng.uniform(10, 95, 80)
sat = 2.4 + 2.1 * (1 - np.exp(-cost / 32)) - rng.uniform(0, 0.9, 80)
order = np.argsort(cost)
front_x, front_y, best_y = [], [], -np.inf
for c, s in zip(cost[order], sat[order]):
    if s > best_y:
        front_x.append(c)
        front_y.append(s)
        best_y = s

ax.scatter(cost, sat, s=36, color=SECONDARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='可行备选方案集')
ax.plot(front_x, front_y, color=OPPOSITE, linewidth=2.2, marker='o', label='Pareto 非支配前沿')
ax.fill_between(front_x, min(sat) - 0.1, front_y, color=PRIMARY, alpha=0.14)
ax.set_xlabel('边际运营投入成本 (万元)')
ax.set_ylabel('预期受众满意度提升')
`,
  },

  markowitz_frontier: {
    body: `
mu = np.array([0.055, 0.092, 0.128, 0.162])
cov = np.array([
    [0.0040, 0.0018, 0.0012, 0.0008],
    [0.0018, 0.0110, 0.0045, 0.0032],
    [0.0012, 0.0045, 0.0220, 0.0085],
    [0.0008, 0.0032, 0.0085, 0.0360],
])
rf = 0.020
weights = rng.dirichlet(np.ones(4), size=1400)
rets = weights @ mu
vols = np.sqrt(np.einsum('ij,jk,ik->i', weights, cov, weights))
sharpes = (rets - rf) / vols

# 构造有效前沿上包络与夏普最优切点
r_bins = np.linspace(rets.min(), rets.max(), 26)
ef_vol, ef_ret = [], []
for i in range(len(r_bins) - 1):
    mask = (rets >= r_bins[i]) & (rets < r_bins[i + 1])
    if np.any(mask):
        idx = np.argmin(vols[mask])
        ef_vol.append(vols[mask][idx] * 100)
        ef_ret.append(rets[mask][idx] * 100)
ef_vol, ef_ret = np.array(ef_vol), np.array(ef_ret)
gmvp_idx = np.argmin(ef_vol)
eff_mask = ef_ret >= ef_ret[gmvp_idx]
tan_idx = np.argmax(sharpes)
tan_v, tan_r, max_sr = vols[tan_idx] * 100, rets[tan_idx] * 100, sharpes[tan_idx]

ax.scatter(vols * 100, rets * 100, c=SECONDARY, s=16, alpha=0.28, label='随机可行资产组合')
ax.plot(ef_vol[eff_mask], ef_ret[eff_mask], color=PRIMARY, linewidth=2.4, label='Markowitz 有效前沿')
cal_x = np.array([0.0, tan_v * 1.45])
ax.plot(cal_x, rf * 100 + max_sr * cal_x, color=OPPOSITE, linestyle='--', linewidth=1.8, label=f'CAL 资本配置线 (SR={max_sr:.2f})')
ax.scatter([ef_vol[gmvp_idx]], [ef_ret[gmvp_idx]], s=95, color=SECONDARY, edgecolor='#FFFFFF', linewidth=1.2, zorder=5, label='最小方差组合 (GMVP)')
ax.scatter([tan_v], [tan_r], s=160, marker='*', color=OPPOSITE, edgecolor='#0F172A', linewidth=0.8, zorder=6, label='最优夏普切点组合')
ax.set_xlabel('组合年化波动率 σ (%)')
ax.set_ylabel('预期年化收益率 E(R) (%)')
`,
  },

  kuznets_ekc: {
    imports: ['import statsmodels.api as sm'],
    body: `
ln_gdp = rng.uniform(7.6, 11.4, 150)
ln_co2 = -13.8 + 3.55 * ln_gdp - 0.188 * (ln_gdp ** 2) + rng.normal(0, 0.16, 150)
X = np.column_stack([np.ones_like(ln_gdp), ln_gdp, ln_gdp ** 2])
mod = sm.OLS(ln_co2, X).fit()
b0, b1, b2 = mod.params
x_star = -b1 / (2.0 * b2)
grad = np.array([0.0, -1.0 / (2.0 * b2), b1 / (2.0 * (b2 ** 2))])
se_star = float(np.sqrt(grad @ mod.cov_params() @ grad))
ci_lo, ci_hi = x_star - 1.96 * se_star, x_star + 1.96 * se_star

xg = np.linspace(ln_gdp.min(), ln_gdp.max(), 120)
Xg = np.column_stack([np.ones_like(xg), xg, xg ** 2])
pred = mod.get_prediction(Xg).summary_frame(alpha=0.05)

ax.axvspan(ci_lo, ci_hi, color=OPPOSITE, alpha=0.14, label=f'拐点 95% CI [{ci_lo:.2f}, {ci_hi:.2f}]')
ax.scatter(ln_gdp, ln_co2, s=30, color=SECONDARY, alpha=0.45, edgecolor=PRIMARY, linewidth=0.8, label='区域观测样本')
ax.fill_between(xg, pred['mean_ci_lower'], pred['mean_ci_upper'], color=PRIMARY, alpha=0.25, label='二次拟合 95% 置信带')
ax.plot(xg, pred['mean'], color=PRIMARY, linewidth=2.3, label=f'EKC 倒 U 拟合 (拐点 x*={x_star:.2f})')
y_star = b0 + b1 * x_star + b2 * (x_star ** 2)
ax.axvline(x_star, color=OPPOSITE, linestyle='--', linewidth=1.4)
ax.scatter([x_star], [y_star], s=110, color=OPPOSITE, edgecolor='#FFFFFF', linewidth=1.2, zorder=5)
ax.set_xlabel('人均发展水平对数 ln(GDP/P)')
ax.set_ylabel('环境压力 / 排放强度 ln(CO2)')
`,
  },

  bipartite_network: {
    imports: ['from matplotlib.path import Path'],
    body: `
u_labels = ['U1 数字原住民', 'U2 家庭刚需群', 'U3 价格敏感群', 'U4 银发保守群']
v_labels = ['V1 短视频种草', 'V2 消费券直补', 'V3 社群团购', 'V4 社区网格点', 'V5 权威媒体背书']
W = np.array([
    [0.92, 0.54, 0.44, 0.15, 0.28],
    [0.58, 0.84, 0.72, 0.25, 0.48],
    [0.24, 0.94, 0.68, 0.36, 0.20],
    [0.12, 0.34, 0.26, 0.86, 0.78],
])
uy = np.linspace(0.82, 0.18, len(u_labels))
vy = np.linspace(0.88, 0.12, len(v_labels))

for i in range(len(u_labels)):
    for j in range(len(v_labels)):
        w = W[i, j]
        if w < 0.22:
            continue
        col = OPPOSITE if w >= 0.80 else PRIMARY
        verts = [(0.24, uy[i]), (0.48, uy[i]), (0.52, vy[j]), (0.76, vy[j])]
        codes = [Path.MOVETO, Path.CURVE4, Path.CURVE4, Path.CURVE4]
        ax.add_patch(mpatches.PathPatch(Path(verts, codes), facecolor='none', edgecolor=col, alpha=0.25 + 0.6 * w, linewidth=0.8 + 3.4 * w))

for i, lbl in enumerate(u_labels):
    ax.scatter([0.24], [uy[i]], s=240 * W[i].mean() + 100, color=PRIMARY, edgecolor='#FFFFFF', linewidth=1.5, zorder=5)
    ax.text(0.20, uy[i], lbl, ha='right', va='center', fontsize=9.5, fontweight='bold', color='#0F172A')
for j, lbl in enumerate(v_labels):
    col = OPPOSITE if W[:, j].max() >= 0.84 else SECONDARY
    ax.scatter([0.76], [vy[j]], s=220 * W[:, j].mean() + 95, marker='s', color=col, edgecolor='#FFFFFF', linewidth=1.5, zorder=5)
    ax.text(0.80, vy[j], lbl, ha='left', va='center', fontsize=9.5, fontweight='bold', color='#0F172A')
ax.legend(handles=[
    mpatches.Patch(facecolor=PRIMARY, alpha=0.5, edgecolor=PRIMARY, label='消费群体 U (圆) / 常规耦合边'),
    mpatches.Patch(facecolor=OPPOSITE, alpha=0.5, edgecolor=OPPOSITE, label='核心政策枢纽 V (方) / 强耦合边'),
], frameon=False, loc='upper center', ncol=2)
ax.set_xlim(-0.08, 1.08)
ax.set_ylim(0.02, 1.02)
ax.axis('off')
`,
  },

  smith_impedance_chart: {
    mode: 'custom',
    body: `
fig, ax = plt.subplots(figsize=(7.4, 6.4), dpi=180)
theta = np.linspace(0.0, 2.0 * np.pi, 360)
ax.plot(np.cos(theta), np.sin(theta), color='#334155', linewidth=1.6)
ax.axhline(0.0, color='#64748B', linewidth=0.9)

# 等电阻圆 (r = 0.2, 0.5, 1.0, 2.0, 5.0)
for r_val in [0.2, 0.5, 1.0, 2.0, 5.0]:
    cx, rad = r_val / (1.0 + r_val), 1.0 / (1.0 + r_val)
    col = SECONDARY if r_val == 1.0 else '#CBD5E1'
    ls = '--' if r_val == 1.0 else '-'
    lw = 1.2 if r_val == 1.0 else 0.85
    ax.plot(cx + rad * np.cos(theta), rad * np.sin(theta), color=col, linestyle=ls, linewidth=lw)

# 等电抗圆弧 (x = ±0.5, ±1.0, ±2.0)
r_grid = np.geomspace(1e-3, 40.0, 240) - 1e-3
for x_val in [-2.0, -1.0, -0.5, 0.5, 1.0, 2.0]:
    z = r_grid + 1j * x_val
    gamma = (z - 1.0) / (z + 1.0)
    ax.plot(gamma.real, gamma.imag, color='#CBD5E1', linewidth=0.85)

# VSWR = 2.0 稳定驻波圆 (|Gamma| = 1/3)
ax.plot((1.0 / 3.0) * np.cos(theta), (1.0 / 3.0) * np.sin(theta), color=OPPOSITE, linestyle=':', linewidth=1.3, label='VSWR = 2.0 稳定圆')

# L 型集总阻抗匹配轨迹: z_L = 0.35 - 0.65j -> 串联电感 -> 并联电容 -> 1 + 0j
x_step1 = np.linspace(-0.65, 0.477, 80)
g_step1 = ((0.35 + 1j * x_step1) - 1.0) / ((0.35 + 1j * x_step1) + 1.0)
b_step2 = np.linspace(-1.363, 0.0, 80)
z_step2 = 1.0 / (1.0 + 1j * b_step2)
g_step2 = (z_step2 - 1.0) / (z_step2 + 1.0)

ax.plot(g_step1.real, g_step1.imag, color=PRIMARY, linewidth=2.5, label='Step 1: 串联电感 (+jX)')
ax.plot(g_step2.real, g_step2.imag, color=OPPOSITE, linewidth=2.5, label='Step 2: 并联电容 (+jB)')
ax.scatter([g_step1[0].real], [g_step1[0].imag], s=75, color=PRIMARY, zorder=6)
ax.scatter([g_step1[-1].real], [g_step1[-1].imag], s=55, color=SECONDARY, zorder=6)
ax.scatter([0.0], [0.0], s=95, color=OPPOSITE, marker='*', zorder=7, label='中心匹配点 (1+j0, VSWR=1.04)')

ax.text(g_step1[0].real - 0.06, g_step1[0].imag - 0.08, '负载 Z_L = 0.35 - j0.65', fontsize=8.8, fontweight='bold', color=PRIMARY, ha='right')
ax.text(0.05, 0.06, '匹配点 (Z0=50 Ω)', fontsize=8.8, fontweight='bold', color=OPPOSITE)
ax.text(-1.05, 0.0, '0', ha='right', va='center', fontsize=9, color='#475569')
ax.text(1.05, 0.0, '∞', ha='left', va='center', fontsize=10, color='#475569')
ax.text(0.0, 1.05, '+j1.0', ha='center', va='bottom', fontsize=8.5, color='#475569')
ax.text(0.0, -1.06, '-j1.0', ha='center', va='top', fontsize=8.5, color='#475569')
ax.set_aspect('equal', adjustable='box')
ax.set_xlim(-1.22, 1.22)
ax.set_ylim(-1.18, 1.18)
ax.axis('off')
ax.legend(frameon=False, loc='upper right', fontsize=8.5)
fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
`,
  },

  markov_transition_chord: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
states = ['S1 认知', 'S2 试用', 'S3 留存', 'S4 流失']
P = np.array([
    [0.52, 0.34, 0.08, 0.06],
    [0.14, 0.42, 0.32, 0.12],
    [0.04, 0.16, 0.68, 0.12],
    [0.18, 0.12, 0.08, 0.62],
])
eigvals, eigvecs = np.linalg.eig(P.T)
stat_idx = int(np.argmin(np.abs(eigvals - 1.0)))
pi_star = np.real(eigvecs[:, stat_idx])
pi_star = pi_star / np.sum(pi_star)

fig = plt.figure(figsize=(10.2, 4.9), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.1, 1.0], wspace=0.28)
ax_net = fig.add_subplot(gs[0])
ax_mat = fig.add_subplot(gs[1])

angles = np.deg2rad([45, -45, -135, 135])
coords = np.column_stack([np.cos(angles), np.sin(angles)])
st_cols = [SECONDARY, '#0D9488', PRIMARY, OPPOSITE]

for i in range(4):
    for j in range(4):
        if i == j or P[i, j] < 0.06:
            continue
        p0, p1 = coords[i], coords[j]
        ax_net.annotate('', xy=p1 * 0.78, xytext=p0 * 0.78,
                        arrowprops=dict(arrowstyle='-|>', mutation_scale=12, lw=1.0 + 5.5 * P[i, j],
                                        color=st_cols[i], alpha=0.55, connectionstyle='arc3,rad=0.22'))

for i, (st, xy, col, pi_v) in enumerate(zip(states, coords, st_cols, pi_star)):
    ax_net.scatter([xy[0]], [xy[1]], s=980, color=col, alpha=0.22, edgecolor=col, linewidth=2.2, zorder=5)
    ax_net.text(xy[0], xy[1] + 0.03, st, ha='center', va='center', fontsize=9, fontweight='bold', color=col, zorder=6)
    ax_net.text(xy[0], xy[1] - 0.12, f'pi*={pi_v * 100:.1f}%', ha='center', va='center', fontsize=8, color='#334155', zorder=6)
ax_net.set_xlim(-1.45, 1.45)
ax_net.set_ylim(-1.45, 1.45)
ax_net.set_aspect('equal')
ax_net.axis('off')
ax_net.set_title('马尔可夫定向转移流与稳态分布 pi*', fontsize=10.5, fontweight='bold')

cmap = mcolors.LinearSegmentedColormap.from_list('markov', ['#F8FAFC', PRIMARY])
ax_mat.imshow(P, cmap=cmap, vmin=0.0, vmax=0.75)
for i in range(4):
    for j in range(4):
        val = P[i, j]
        ax_mat.text(j, i, f'{val:.2f}', ha='center', va='center', fontsize=9.5,
                    fontweight='bold' if i == j else 'normal',
                    color='#FFFFFF' if val >= 0.45 else '#1E293B')
ax_mat.set_xticks(range(4))
ax_mat.set_xticklabels(states, fontsize=8.5)
ax_mat.set_yticks(range(4))
ax_mat.set_yticklabels(states, fontsize=8.5)
ax_mat.set_xlabel('下一期状态 (t + 1)')
ax_mat.set_ylabel('当前期状态 (t)')
ax_mat.set_title('一步转移概率矩阵 P_ij (每行求和 = 1.00)', fontsize=10.5, fontweight='bold')

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.04, right=0.96, bottom=0.13, top=0.84)
`,
  },

  markov_state_transition: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
states = ['S0 流失', 'S1 潜客', 'S2 活跃', 'S3 忠实']
P = np.array([
    [0.64, 0.24, 0.08, 0.04],
    [0.16, 0.42, 0.32, 0.10],
    [0.06, 0.14, 0.56, 0.24],
    [0.03, 0.05, 0.22, 0.70],
], dtype=float)
assert np.allclose(P.sum(axis=1), 1.0)

eigvals, eigvecs = np.linalg.eig(P.T)
sorted_abs = np.sort(np.abs(eigvals))[::-1]
lambda2 = float(sorted_abs[1])
idx_stat = int(np.argmin(np.abs(eigvals - 1.0)))
pi_star = np.real(eigvecs[:, idx_stat])
pi_star = pi_star / np.sum(pi_star)

n_steps = 13
pi_traj = np.zeros((n_steps, 4))
pi_traj[0] = np.array([0.10, 0.50, 0.30, 0.10])
for k in range(1, n_steps):
    pi_traj[k] = pi_traj[k - 1] @ P
ks = np.arange(n_steps)

fig = plt.figure(figsize=(10.4, 4.8), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.0, 1.22], wspace=0.28)
ax_mat, ax_traj = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

cmap = mcolors.LinearSegmentedColormap.from_list('dtmc', ['#F8FAFC', PRIMARY])
ax_mat.imshow(P, cmap=cmap, vmin=0.0, vmax=0.75)
for i in range(4):
    for j in range(4):
        v = P[i, j]
        ax_mat.text(j, i, f'{v:.2f}', ha='center', va='center', fontsize=9.5,
                    fontweight='bold' if i == j else 'normal',
                    color='#FFFFFF' if v >= 0.44 else '#1E293B')
ax_mat.set_xticks(range(4))
ax_mat.set_xticklabels(states, fontsize=8.5)
ax_mat.set_yticks(range(4))
ax_mat.set_yticklabels(states, fontsize=8.5)
ax_mat.set_xlabel('下一期状态 (t + 1)')
ax_mat.set_ylabel('当前期状态 (t)')
ax_mat.set_title('一步行随机转移矩阵 P_ij (行和 = 1.00)', fontsize=10.5, fontweight='bold')

s_cols = [OPPOSITE, '#64748B', SECONDARY, PRIMARY]
for s in range(4):
    ax_traj.axhline(pi_star[s] * 100.0, color=s_cols[s], linestyle='--', linewidth=1.0, alpha=0.55)
    ax_traj.plot(ks, pi_traj[:, s] * 100.0, color=s_cols[s], marker='o', markersize=4.2, linewidth=2.1,
                 label=f'{states[s]} (pi*={pi_star[s]*100:.1f}%)')
ax_traj.axvline(8.0, color=OPPOSITE, linestyle=':', linewidth=1.3, label=f'混合步 k* = 8 (|lambda2|={lambda2:.2f})')
ax_traj.set_xlim(0, 12.4)
ax_traj.set_ylim(0, 56)
ax_traj.set_xlabel('离散马尔可夫迭代步数 k')
ax_traj.set_ylabel('各状态人群占比 (%)')
ax_traj.set_title('多步状态占比演化与平稳分布 pi* 收敛', fontsize=10.5, fontweight='bold')
ax_traj.legend(frameon=False, loc='upper right', fontsize=8.0)
ax_traj.spines['top'].set_visible(False)
ax_traj.spines['right'].set_visible(False)
ax_traj.grid(True, linestyle='--', alpha=0.25)

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.08, right=0.97, bottom=0.14, top=0.84)
`,
  },

  // -------------------------------------------------------------------------
  // 4. 看构成与集合 (composition) — 12
  // -------------------------------------------------------------------------
  donut: {
    body: `
labels = ['核心年轻群体', '县域家庭群体', '银发长辈群体', '政企机构端']
sizes = [36.4, 31.8, 21.4, 10.4]
colors = [PRIMARY, SECONDARY, OPPOSITE, '#64748B']

wedges, _, autotexts = ax.pie(
    sizes, labels=labels, autopct='%1.1f%%', pctdistance=0.80,
    colors=colors, startangle=90,
    wedgeprops=dict(width=0.38, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6),
)
for w, c in zip(wedges, colors):
    w.set_edgecolor(c)
for at in autotexts:
    at.set_fontsize(9)
    at.set_fontweight('bold')
ax.text(0, 0.05, 'n = 506', ha='center', va='center', fontsize=13, fontweight='bold', color=PRIMARY)
ax.text(0, -0.14, '有效回收样本', ha='center', va='center', fontsize=9, color=SECONDARY)
ax.legend(wedges, labels, frameon=False, loc='upper right')
`,
  },

  percent_stack: {
    body: `
groups = ['高线城市 (n=198)', '县域城区 (n=184)', '乡镇村居 (n=124)']
mat = np.array([
    [54.2, 28.6, 17.2],
    [39.8, 36.4, 23.8],
    [24.6, 41.2, 34.2],
])
cats = ['高频日常使用', '偶尔试用', '尚未使用']
cols = [PRIMARY, SECONDARY, OPPOSITE]
y = np.arange(len(groups))
left = np.zeros(len(groups))

for j, (cat, col) in enumerate(zip(cats, cols)):
    vals = mat[:, j]
    ax.barh(y, vals, left=left, height=0.54, facecolor=col, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label=cat)
    for yi, l_v, v in zip(y, left, vals):
        if v >= 12:
            ax.text(l_v + v / 2, yi, f'{v:.1f}%', ha='center', va='center', fontsize=9, color='#0F172A', fontweight='bold')
    left += vals
ax.set_yticks(y)
ax.set_yticklabels(groups)
ax.set_xlim(0, 100)
ax.set_xlabel('组内结构占比 (%)')
`,
  },

  mosaic: {
    body: `
col_labels = ['青年 (36%)', '中年 (41%)', '银发 (23%)']
col_widths = np.array([36.4, 40.7, 22.9])
row_labels = ['采纳', '观望', '拒绝']
shares = np.array([
    [0.58, 0.42, 0.24],
    [0.28, 0.38, 0.36],
    [0.14, 0.20, 0.40],
])
cols = [PRIMARY, SECONDARY, OPPOSITE]
x_start = 0.0

for ci, (clab, cw) in enumerate(zip(col_labels, col_widths)):
    y_start = 0.0
    for ri, (rlab, col) in enumerate(zip(row_labels, cols)):
        h = shares[ri, ci] * 100
        ax.bar(x_start + cw / 2, h, width=cw * 0.96, bottom=y_start,
               facecolor=col, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label=rlab if ci == 0 else None)
        ax.text(x_start + cw / 2, y_start + h / 2, f'{h:.0f}%', ha='center', va='center', fontsize=9, fontweight='bold')
        y_start += h
    ax.text(x_start + cw / 2, 103, clab, ha='center', va='bottom', fontsize=9.5, color='#0F172A')
    x_start += cw
ax.set_xlim(0, 100)
ax.set_ylim(0, 114)
ax.set_xlabel('样本人群宽度比例 (%)')
ax.set_ylabel('态度内部构成 (%)')
`,
  },

  pareto: {
    body: `
causes = ['收费不透明', '操作步骤多', '网点距离远', '响应延迟', '隐私担忧', '售后繁琐']
counts = np.array([186, 142, 96, 54, 34, 22])
cum_pct = np.cumsum(counts) / counts.sum() * 100
x = np.arange(len(causes))

ax.bar(x, counts, width=0.58, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='痛点提及频次')
ax2 = ax.twinx()
ax2.plot(x, cum_pct, color=OPPOSITE, marker='o', linewidth=2.0, label='累计占比 (%)')
ax2.axhline(80, color=SECONDARY, linestyle='--', linewidth=1.3, label='80% 关键少数线')
ax2.spines['top'].set_visible(False)
ax.set_xticks(x)
ax.set_xticklabels(causes, rotation=15)
ax.set_ylabel('提及频次')
ax2.set_ylabel('累计占比 (%)')
ax2.set_ylim(0, 108)
h1, l1 = ax.get_legend_handles_labels()
h2, l2 = ax2.get_legend_handles_labels()
ax.legend(h1 + h2, l1 + l2, frameon=False, loc='center right')
`,
  },

  upset: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
sets = ['价格敏感', '流程复杂', '信任不足', '网点欠缺']
combos = [(1,0,0,0), (1,1,0,0), (0,1,1,0), (1,0,1,0), (1,1,1,0), (0,0,1,1), (1,1,1,1)]
counts = [92, 74, 58, 49, 41, 28, 19]
x = np.arange(len(counts))

fig = plt.figure(figsize=(8.6, 5.8), dpi=180)
gs = GridSpec(2, 1, height_ratios=[2.1, 1.2], hspace=0.14)
ax_top = fig.add_subplot(gs[0])
ax_mat = fig.add_subplot(gs[1], sharex=ax_top)

ax_top.bar(x, counts, width=0.54, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='交集受访人数')
for xi, c in zip(x, counts):
    ax_top.text(xi, c + 2, str(c), ha='center', va='bottom', fontsize=9, color=SECONDARY)
ax_top.set_ylabel('交集频数 (n)')
ax_top.legend(frameon=False, loc='upper right')

for xi, pat in enumerate(combos):
    active = [idx for idx, v in enumerate(pat) if v == 1]
    for yi in range(len(sets)):
        col = PRIMARY if yi in active else '#CBD5E1'
        ax_mat.scatter(xi, yi, s=90, color=col, alpha=0.85 if yi in active else 0.4, edgecolor=col, linewidth=1.2, zorder=3)
    if len(active) > 1:
        ax_mat.plot([xi, xi], [min(active), max(active)], color=PRIMARY, linewidth=2.0, zorder=2)
ax_mat.set_yticks(range(len(sets)))
ax_mat.set_yticklabels(sets)
ax_mat.set_xticks(x)
ax_mat.set_xticklabels([f'C{i+1}' for i in x])
ax_mat.invert_yaxis()
for target_ax in (ax_top, ax_mat):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.5, fontweight='bold', y=0.96)
`,
  },

  treemap: {
    body: `
items = [('便利触达与时效', 32.4, PRIMARY), ('收费透明与补贴', 26.8, SECONDARY), ('适老简化与指引', 18.2, OPPOSITE),
         ('制度兜底与赔付', 12.6, PRIMARY), ('社交口碑推荐', 10.0, SECONDARY)]
# 简明 slice-and-dice 矩形树图排版
x0, y0, w, h = 0.0, 0.0, 100.0, 60.0
horizontal = True
total = sum(v for _, v, _ in items)
for idx, (name, val, col) in enumerate(items):
    frac = val / total
    if horizontal:
        rw, rh = w * frac, h
        rect = mpatches.Rectangle((x0, y0), rw, rh, facecolor=col, alpha=0.35, edgecolor=col, linewidth=1.6)
        ax.add_patch(rect)
        ax.text(x0 + rw / 2, y0 + rh / 2, f'{name}\\n{val:.1f}%', ha='center', va='center', fontsize=9, fontweight='bold')
        x0 += rw
        w -= rw
    else:
        rw, rh = w, h * frac
        rect = mpatches.Rectangle((x0, y0), rw, rh, facecolor=col, alpha=0.35, edgecolor=col, linewidth=1.6)
        ax.add_patch(rect)
        ax.text(x0 + rw / 2, y0 + rh / 2, f'{name}\\n{val:.1f}%', ha='center', va='center', fontsize=9, fontweight='bold')
        y0 += rh
        h -= rh
    total -= val
    horizontal = idx % 2 == 1
ax.legend(handles=[mpatches.Patch(facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='主题权重占比面积')],
          frameon=False, loc='upper right')
ax.set_xlim(0, 100)
ax.set_ylim(0, 60)
ax.axis('off')
`,
  },

  funnel: {
    body: `
stages = ['原始回收问卷 (n=612)', '资格与极速筛除 (n=578)', '注意力与矛盾复核 (n=536)', '长串与游程定稿 (n=506)']
counts = np.array([612, 578, 536, 506])
cols = [SECONDARY, PRIMARY, PRIMARY, OPPOSITE]
for idx, (st, cnt, col) in enumerate(zip(stages, counts, cols)):
    top_w = cnt / counts[0] * 0.86
    bot_w = (counts[idx + 1] if idx + 1 < len(counts) else cnt * 0.92) / counts[0] * 0.86
    y_top, y_bot = 4 - idx, 4 - idx - 0.78
    poly = mpatches.Polygon(
        [(-top_w / 2, y_top), (top_w / 2, y_top), (bot_w / 2, y_bot), (-bot_w / 2, y_bot)],
        closed=True, facecolor=col, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6,
        label='质控留存漏斗' if idx == 1 else None,
    )
    ax.add_patch(poly)
    pct = cnt / counts[0] * 100
    ax.text(0, (y_top + y_bot) / 2, f'{st} · {pct:.1f}%', ha='center', va='center', fontsize=9.5, fontweight='bold')
ax.set_xlim(-0.55, 0.55)
ax.set_ylim(0, 4.3)
ax.axis('off')
`,
  },

  waffle: {
    body: `
cats = [('高度支持 (42%)', 42, PRIMARY), ('有条件采纳 (36%)', 36, SECONDARY), ('暂持观望 (22%)', 22, OPPOSITE)]
grid_cols = []
for _, cnt, col in cats:
    grid_cols.extend([col] * cnt)
for idx, col in enumerate(grid_cols):
    row, col_i = divmod(idx, 10)
    ax.add_patch(mpatches.Rectangle((col_i + 0.08, row + 0.08), 0.84, 0.84,
                                    facecolor=col, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6))
waffle_handles = [mpatches.Patch(facecolor=col, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label=name) for name, _, col in cats]
ax.legend(handles=waffle_handles, frameon=False, loc='upper center', ncol=3)
ax.set_xlim(0, 10)
ax.set_ylim(0, 10.6)
ax.set_aspect('equal')
ax.axis('off')
`,
  },

  sunburst: {
    body: `
inner_vals = [42, 35, 23]
inner_labels = ['高线城市', '县域城区', '乡镇村居']
inner_cols = [PRIMARY, SECONDARY, OPPOSITE]
outer_vals = [26, 16, 20, 15, 13, 10]
outer_cols = [PRIMARY, PRIMARY, SECONDARY, SECONDARY, OPPOSITE, OPPOSITE]

w_in, _ = ax.pie(inner_vals, radius=0.65, labels=inner_labels, labeldistance=0.5, colors=inner_cols,
                 wedgeprops=dict(width=0.34, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6))
w_out, _ = ax.pie(outer_vals, radius=1.0, colors=outer_cols,
                  wedgeprops=dict(width=0.32, alpha=0.28, edgecolor=PRIMARY, linewidth=1.6))
for w, c in zip(w_in, inner_cols):
    w.set_edgecolor(c)
for w, c in zip(w_out, outer_cols):
    w.set_edgecolor(c)
ax.legend(w_in, inner_labels, frameon=False, loc='upper right')
`,
  },

  alluvial: {
    imports: ['from matplotlib.path import Path'],
    body: `
pre = [('观望犹豫 (0.48)', 0.48, OPPOSITE), ('试探接触 (0.34)', 0.34, SECONDARY), ('主动使用 (0.18)', 0.18, PRIMARY)]
post = [('低意愿停用 (0.18)', 0.18, OPPOSITE), ('稳定留存 (0.36)', 0.36, SECONDARY), ('高频复购 (0.46)', 0.46, PRIMARY)]
trans = [(0, 0, 0.14), (0, 1, 0.22), (0, 2, 0.12), (1, 0, 0.04), (1, 1, 0.12), (1, 2, 0.18), (2, 2, 0.16), (2, 1, 0.02)]

def layout(blocks):
    y, res = 0.06, []
    for name, w, col in blocks:
        h = w * 0.80
        res.append((name, y, y + h, col))
        y += h + 0.04
    return res

L, R = layout(pre), layout(post)
l_cur, r_cur = [x[1] for x in L], [x[1] for x in R]
for name, y0, y1, col in L:
    ax.add_patch(mpatches.Rectangle((0.12, y0), 0.06, y1 - y0, facecolor=col, alpha=0.35, edgecolor=col, linewidth=1.6))
    ax.text(0.10, (y0 + y1) / 2, name, ha='right', va='center', fontsize=9)
for name, y0, y1, col in R:
    ax.add_patch(mpatches.Rectangle((0.82, y0), 0.06, y1 - y0, facecolor=col, alpha=0.35, edgecolor=col, linewidth=1.6))
    ax.text(0.90, (y0 + y1) / 2, name, ha='left', va='center', fontsize=9)
for i, j, w in trans:
    h = w * 0.80
    ya, yb = l_cur[i], r_cur[j]
    l_cur[i] += h
    r_cur[j] += h
    verts = [(0.18, ya), (0.50, ya), (0.50, yb), (0.82, yb), (0.82, yb + h), (0.50, yb + h), (0.50, ya + h), (0.18, ya + h), (0.18, ya)]
    codes = [Path.MOVETO, Path.CURVE4, Path.CURVE4, Path.CURVE4, Path.LINETO, Path.CURVE4, Path.CURVE4, Path.CURVE4, Path.CLOSEPOLY]
    ax.add_patch(mpatches.PathPatch(Path(verts, codes), facecolor=R[j][3], alpha=0.35, edgecolor=PRIMARY, linewidth=1.6))
ax.legend(handles=[mpatches.Patch(facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='干预前后态度迁移流量')],
          frameon=False, loc='upper center')
ax.set_xlim(-0.22, 1.24)
ax.set_ylim(0, 1.02)
ax.axis('off')
`,
  },

  kaya_carbon_bridge: {
    body: `
# 2020 -> 2025 Kaya 恒等式 (C = P * g * s * e * f) 加法 LMDI 无残差分解
f0 = np.array([141.0, 7.1, 0.42, 0.56, 0.425])
f1 = np.array([142.8, 9.5, 0.39, 0.49, 0.408])
c0, c1 = float(np.prod(f0)), float(np.prod(f1))
w_lm = (c1 - c0) / (np.log(c1) - np.log(c0))
deltas = w_lm * np.log(f1 / f0)

labels = ['基期2020', '人口效应', '经济规模', '产业结构', '能源强度', '排放因子', '末期2025']
vals = np.concatenate([[c0], deltas, [c1]])
bottoms = np.zeros(len(labels))
run = c0
for i in range(1, len(labels) - 1):
    bottoms[i] = run if vals[i] >= 0 else run + vals[i]
    run += vals[i]
heights = np.abs(vals)
x = np.arange(len(labels))

for i in range(len(labels)):
    col = SECONDARY if i in (0, len(labels) - 1) else (OPPOSITE if vals[i] >= 0 else PRIMARY)
    ax.bar(x[i], heights[i], bottom=bottoms[i], width=0.56, facecolor=col, alpha=0.38, edgecolor=col, linewidth=1.6)
    top_y = bottoms[i] + heights[i]
    lbl_txt = f'{vals[i]:.1f}' if i in (0, len(labels) - 1) else f'{vals[i]:+.1f}'
    ax.text(x[i], top_y + 2.2, lbl_txt, ha='center', va='bottom', fontsize=9, fontweight='bold', color=col)
    if i < len(labels) - 1:
        cy = vals[0] if i == 0 else (bottoms[i] + heights[i] if vals[i] >= 0 else bottoms[i])
        ax.plot([x[i] + 0.28, x[i + 1] - 0.28], [cy, cy], color='#64748B', linestyle=':', linewidth=1.1)

ax.legend(handles=[
    mpatches.Patch(facecolor=SECONDARY, alpha=0.38, edgecolor=SECONDARY, label='起止总排放基准'),
    mpatches.Patch(facecolor=OPPOSITE, alpha=0.38, edgecolor=OPPOSITE, label='增排驱动 (+ΔC)'),
    mpatches.Patch(facecolor=PRIMARY, alpha=0.38, edgecolor=PRIMARY, label='减排贡献 (-ΔC)'),
], frameon=False, loc='upper left')
ax.set_xticks(x)
ax.set_xticklabels(labels)
ax.set_ylim(0, max(bottoms + heights) * 1.16)
ax.set_ylabel('碳排放当量 (MtCO2)')
`,
  },

  duck_curve_dispatch: {
    body: `
hrs = np.linspace(0.0, 24.0, 97)
gross_load = 31.0 - 4.5 * np.cos(np.pi * (hrs - 2.0) / 12.0) + 8.0 * np.exp(-((hrs - 10.5) / 3.8) ** 2) + 15.0 * np.exp(-((hrs - 19.5) / 2.6) ** 2)
pv_gen = np.where((hrs >= 6.0) & (hrs <= 19.0), 26.5 * np.exp(-((hrs - 12.8) / 2.6) ** 2), 0.0)
net_duck = gross_load - pv_gen

# 储能/V2G 谷充峰放调度功率: 午间充电消纳 (+), 晚峰放电削峰 (-)
bess_dispatch = 8.4 * np.exp(-((hrs - 12.8) / 1.9) ** 2) - 10.4 * np.exp(-((hrs - 19.5) / 1.8) ** 2)
shaved_load = net_duck + bess_dispatch

ax.fill_between(hrs, net_duck, gross_load, where=pv_gen > 0.2, color=SECONDARY, alpha=0.16, label='光伏出力消纳区')
ax.fill_between(hrs, net_duck, shaved_load, where=bess_dispatch > 0.2, color=PRIMARY, alpha=0.22, label='储能午间谷充抬腹')
ax.fill_between(hrs, shaved_load, net_duck, where=bess_dispatch < -0.2, color=OPPOSITE, alpha=0.24, label='储能晚峰放电削峰')

ax.plot(hrs, gross_load, color='#475569', linestyle='--', linewidth=1.8, label='总用电负荷 (Gross)')
ax.plot(hrs, net_duck, color=PRIMARY, linewidth=2.3, label='净负荷鸭子曲线 (Net)')
ax.plot(hrs, shaved_load, color=OPPOSITE, linewidth=2.4, label='储能协同后净负荷')

pk_net = float(np.max(net_duck[(hrs >= 17) & (hrs <= 22)]))
pk_shv = float(np.max(shaved_load[(hrs >= 17) & (hrs <= 22)]))
belly = float(np.min(net_duck[(hrs >= 10) & (hrs <= 16)]))
ax.annotate(f'鸭腹谷底 {belly:.1f} GW', xy=(12.8, belly), xytext=(12.8, belly - 7.5),
            ha='center', fontsize=8.8, fontweight='bold', color=PRIMARY,
            arrowprops=dict(arrowstyle='->', color=PRIMARY, lw=1.2))
ax.annotate(f'晚峰削减 {pk_net - pk_shv:.1f} GW', xy=(19.5, pk_shv), xytext=(16.5, pk_net + 3.0),
            fontsize=8.8, fontweight='bold', color=OPPOSITE,
            arrowprops=dict(arrowstyle='->', color=OPPOSITE, lw=1.2))

ax.set_xticks(np.arange(0, 25, 4))
ax.set_xticklabels([f'{h:02d}:00' for h in np.arange(0, 25, 4)])
ax.set_xlim(0, 24)
ax.set_ylim(0, max(gross_load) * 1.15)
ax.set_xlabel('日内运行时间 (小时)')
ax.set_ylabel('电网负荷功率 (GW)')
`,
  },

  // -------------------------------------------------------------------------
  // 5. 计量与因果推断 (causal_econometrics) — 34
  // -------------------------------------------------------------------------
  did_event: {
    body: `
rel_t = np.array([-4, -3, -2, -1, 0, 1, 2, 3, 4])
beta = np.array([-0.03, 0.02, -0.01, 0.00, 0.14, 0.24, 0.31, 0.34, 0.36])
se = np.array([0.055, 0.050, 0.048, 0.00, 0.052, 0.056, 0.060, 0.064, 0.068])

ax.axhline(0, color='#475569', linestyle='-', linewidth=1.0)
ax.axvline(-0.5, color=OPPOSITE, linestyle='--', linewidth=1.5, label='政策干预时点')
ax.fill_between(rel_t, beta - 1.96 * se, beta + 1.96 * se, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6,
                label='95% 聚类稳健置信带')
ax.errorbar(rel_t, beta, yerr=1.96 * se, fmt='o-', color=PRIMARY, ecolor=SECONDARY, capsize=4, linewidth=1.8,
            label='事件研究动态系数 β_k')
ax.text(0.03, 0.90, '政策前联合 F 检验 p = 0.66 (>0.10)', transform=ax.transAxes, fontsize=9, color=SECONDARY)
ax.set_xticks(rel_t)
ax.set_xticklabels([f't{t:+d}' if t != 0 else 't=0' for t in rel_t])
ax.set_xlabel('相对于政策冲击期数 (t = -1 为基期)')
ax.set_ylabel('处理效应动态估计系数 β')
`,
  },

  rdd: {
    imports: ['import statsmodels.api as sm'],
    body: `
x_left = rng.uniform(-20, -0.2, 95)
x_right = rng.uniform(0.2, 20, 95)
y_left = 3.10 + 0.022 * x_left + rng.normal(0, 0.22, 95)
y_right = 3.78 + 0.018 * x_right + rng.normal(0, 0.22, 95)

def fit_local(x_arr, y_arr, side):
    w = np.clip(1 - np.abs(x_arr) / 20.0, 0.05, 1.0)
    mod = sm.WLS(y_arr, sm.add_constant(x_arr), weights=w).fit()
    xg = np.linspace(x_arr.min(), 0, 60) if side == 'L' else np.linspace(0, x_arr.max(), 60)
    pred = mod.get_prediction(sm.add_constant(xg)).summary_frame(alpha=0.05)
    return xg, pred, mod.params[0]

xl, pl, c_l = fit_local(x_left, y_left, 'L')
xr, pr, c_r = fit_local(x_right, y_right, 'R')
ax.scatter(x_left, y_left, s=28, color=SECONDARY, alpha=0.35, edgecolor=SECONDARY, linewidth=1.2)
ax.scatter(x_right, y_right, s=28, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.2)
ax.fill_between(xl, pl['mean_ci_lower'], pl['mean_ci_upper'], color=SECONDARY, alpha=0.35, edgecolor=SECONDARY, linewidth=1.6)
ax.fill_between(xr, pr['mean_ci_lower'], pr['mean_ci_upper'], color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
ax.plot(xl, pl['mean'], color=SECONDARY, linewidth=2.0, label='断点左侧局部线性拟合')
ax.plot(xr, pr['mean'], color=PRIMARY, linewidth=2.0, label='断点右侧局部线性拟合')
ax.axvline(0, color=OPPOSITE, linestyle='--', linewidth=1.6, label=f'断点跳跃 τ = {c_r - c_l:+.3f}')
ax.set_xlabel('中心化驱动变量 (X - c0)')
ax.set_ylabel('结果变量均值 (Y)')
`,
  },

  synthetic_control: {
    body: `
years = np.arange(2016, 2026)
synth = np.array([3.12, 3.24, 3.31, 3.45, 3.52, 3.58, 3.64, 3.70, 3.75, 3.81])
treated = np.array([3.11, 3.25, 3.30, 3.46, 3.51, 3.74, 3.96, 4.18, 4.32, 4.46])

ax.axvline(2020.5, color=OPPOSITE, linestyle='--', linewidth=1.6, label='试点政策实施年份')
ax.fill_between(years, synth, treated, where=(years >= 2020), color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6,
                label='合成控制净处理效应区')
ax.plot(years, treated, color=PRIMARY, marker='o', linewidth=2.2, label='实际处理试点区域')
ax.plot(years, synth, color=SECONDARY, linestyle='--', marker='s', linewidth=2.0, label='反事实合成控制组')
ax.set_xlabel('观测年份')
ax.set_ylabel('综合评价指数')
`,
  },

  synthetic_placebo: {
    body: `
years = np.arange(2016, 2026)
for idx in range(18):
    gap = np.cumsum(rng.normal(0, 0.045, len(years)))
    gap[:5] *= 0.4
    ax.plot(years, gap, color='#94A3B8', alpha=0.55, linewidth=1.1, label='安慰剂对照区域间隙' if idx == 0 else None)
true_gap = np.array([0.01, -0.02, 0.02, -0.01, 0.01, 0.18, 0.34, 0.48, 0.56, 0.65])
ax.axvline(2020.5, color=SECONDARY, linestyle='--', linewidth=1.4, label='政策冲击线')
ax.axhline(0, color='#334155', linewidth=1.0)
ax.fill_between(years, 0, true_gap, where=(years >= 2020), color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
ax.plot(years, true_gap, color=OPPOSITE, linewidth=2.4, marker='o', label='真实试点区域间隙 (p = 0.042)')
ax.set_xlabel('观测年份')
ax.set_ylabel('预测误差间隙 (Y_treated - Y_synth)')
`,
  },

  psm_kde: {
    imports: ['from scipy import stats'],
    body: `
ps_treat = rng.beta(5.2, 3.0, 220)
ps_ctrl = rng.beta(4.6, 3.3, 240)
grid = np.linspace(0.02, 0.98, 200)
k_t = stats.gaussian_kde(ps_treat)(grid)
k_c = stats.gaussian_kde(ps_ctrl)(grid)

ax.fill_between(grid, 0, k_t, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='处理组倾向得分 (匹配后)')
ax.fill_between(grid, 0, k_c, color=OPPOSITE, alpha=0.35, edgecolor=OPPOSITE, linewidth=1.6, label='对照组倾向得分 (匹配后)')
ax.axvspan(0.18, 0.88, color=SECONDARY, alpha=0.08, label='共同支撑域 [0.18, 0.88]')
ax.set_xlabel('倾向得分 Propensity Score P(T=1|X)')
ax.set_ylabel('核密度估计')
`,
  },

  love_plot: {
    body: `
covs = ['年龄结构', '受教育程度', '月均可支配收入', '数字工具素养', '常住地层级', '家庭规模']
smd_pre = np.array([-54.2, 48.6, 62.4, 39.8, -42.1, 24.5])
smd_post = np.array([-3.6, 3.4, 4.2, 2.8, -3.1, 1.9])
y = np.arange(len(covs))

ax.axvline(0, color='#334155', linewidth=1.0)
ax.axvspan(-10, 10, color=PRIMARY, alpha=0.14, label='平衡阈值带 |SMD| < 10%')
ax.axvline(-10, color=PRIMARY, linestyle='--', linewidth=1.4)
ax.axvline(10, color=PRIMARY, linestyle='--', linewidth=1.4)
ax.scatter(smd_pre, y, s=85, marker='s', color=OPPOSITE, alpha=0.35, edgecolor=OPPOSITE, linewidth=1.6, label='匹配前 (Unmatched)')
ax.scatter(smd_post, y, s=95, marker='o', color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='匹配后 (Matched)')
for yi, b, a in zip(y, smd_pre, smd_post):
    ax.plot([b, a], [yi, yi], color='#94A3B8', linestyle=':', linewidth=1.2)
ax.set_yticks(y)
ax.set_yticklabels(covs)
ax.set_xlabel('标准化均值差 SMD (%)')
`,
  },

  quantile_reg: {
    imports: ['import statsmodels.api as sm'],
    body: `
x = rng.normal(0, 1, 280)
y = 2.0 + (0.45 + 0.25 * rng.uniform(0, 1, 280)) * x + rng.normal(0, 0.65, 280)
X = sm.add_constant(x)
qs = [0.10, 0.25, 0.50, 0.75, 0.90]
betas, lo, hi = [], [], []
for q in qs:
    res = sm.QuantReg(y, X).fit(q=q)
    ci = res.conf_int()
    betas.append(res.params[1])
    lo.append(ci[1, 0])
    hi.append(ci[1, 1])
ols_b = sm.OLS(y, X).fit().params[1]

ax.axhline(ols_b, color=OPPOSITE, linestyle='--', linewidth=1.8, label=f'OLS 平均效应 ({ols_b:.3f})')
ax.fill_between(qs, lo, hi, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='分位数回归 95% CI')
ax.plot(qs, betas, color=PRIMARY, marker='o', linewidth=2.2, label='分位数条件边际效应 β(τ)')
ax.set_xticks(qs)
ax.set_xlabel('条件分位点 τ')
ax.set_ylabel('边际回归系数估计值')
`,
  },

  binscatter_iv: {
    imports: ['import statsmodels.api as sm'],
    body: `
z = rng.normal(0, 1, 500)
u = rng.normal(0, 0.7, 500)
x = 0.75 * z + 0.55 * u + rng.normal(0, 0.4, 500)
y = 1.5 + 0.58 * x + 0.45 * u + rng.normal(0, 0.4, 500)
# 第一阶段与第二阶段 2SLS
stage1 = sm.OLS(x, sm.add_constant(z)).fit()
x_hat = stage1.predict(sm.add_constant(z))
stage2 = sm.OLS(y, sm.add_constant(x_hat)).fit()
bins = np.quantile(x_hat, np.linspace(0, 1, 16))
bx = [np.mean(x_hat[(x_hat >= bins[i]) & (x_hat <= bins[i + 1])]) for i in range(15)]
by = [np.mean(y[(x_hat >= bins[i]) & (x_hat <= bins[i + 1])]) for i in range(15)]
xg = np.linspace(min(bx), max(bx), 60)

ax.scatter(bx, by, s=70, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='15等频分箱均值点')
ax.plot(xg, stage2.params[0] + stage2.params[1] * xg, color=OPPOSITE, linewidth=2.2,
        label=f'IV-2SLS 斜率 β={stage2.params[1]:.3f} (KP-F={stage1.fvalue:.1f})')
ax.set_xlabel('工具变量拟合内生解释变量 X_hat')
ax.set_ylabel('因变量条件均值 Y')
`,
  },

  simple_slope: {
    body: `
x = np.linspace(-2, 2, 80)
for w_val, label, col, ls in [
    (-1.0, '低调节水平 (W = M - 1SD)', SECONDARY, '--'),
    (0.0, '均值水平 (W = M)', PRIMARY, '-'),
    (1.0, '高调节水平 (W = M + 1SD)', OPPOSITE, '-'),
]:
    y_hat = 3.5 + (0.42 + 0.24 * w_val) * x
    se = 0.08 + 0.03 * np.abs(x)
    ax.fill_between(x, y_hat - 1.96 * se, y_hat + 1.96 * se, facecolor=col, alpha=0.35 if w_val == 0 else 0.16,
                    edgecolor=PRIMARY if w_val == 0 else col, linewidth=1.6 if w_val == 0 else 0.8)
    ax.plot(x, y_hat, color=col, linestyle=ls, linewidth=2.1, label=label)
ax.set_xlabel('标准化核心自变量 (X)')
ax.set_ylabel('预测因变量水平 (Y)')
`,
  },

  mediation_boot: {
    imports: ['from scipy import stats'],
    body: `
boot_ab = rng.normal(0.164, 0.036, 5000)
llci, ulci = np.percentile(boot_ab, [2.5, 97.5])
grid = np.linspace(boot_ab.min(), boot_ab.max(), 200)
kde = stats.gaussian_kde(boot_ab)(grid)

ax.hist(boot_ab, bins=32, density=True, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='5000次 Bootstrap 分布')
ax.plot(grid, kde, color=SECONDARY, linewidth=2.0, label='核密度包络线')
ax.axvspan(llci, ulci, color=SECONDARY, alpha=0.14, label=f'95% CI [{llci:.3f}, {ulci:.3f}]')
ax.axvline(0, color=OPPOSITE, linestyle='--', linewidth=1.6, label='零假设参考线 (ab=0)')
ax.set_xlabel('间接中介效应估计值 (a × b)')
ax.set_ylabel('经验概率密度')
`,
  },

  panel_fe_forest: {
    body: `
specs = ['(1) 基准混合 OLS', '(2) 控制个体 FE', '(3) 双向 FE (TWFE)', '(4) 县域聚类 SE', '(5) 工具变量 IV-2SLS']
est = np.array([0.462, 0.394, 0.368, 0.368, 0.412])
se = np.array([0.041, 0.048, 0.052, 0.064, 0.078])
y = np.arange(len(specs))

ax.axvline(0, color=OPPOSITE, linestyle='--', linewidth=1.4, label='零效应线')
ax.barh(y, 1.96 * 2 * se, left=est - 1.96 * se, height=0.28, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6,
        label='95% 置信区间')
ax.scatter(est, y, s=85, color=SECONDARY, edgecolor=PRIMARY, linewidth=1.6, zorder=5, label='核心系数 β')
for yi, b, s in zip(y, est, se):
    ax.text(b + 1.96 * s + 0.02, yi, f'{b:.3f} [{b-1.96*s:.3f}, {b+1.96*s:.3f}]', va='center', fontsize=8.8)
ax.set_yticks(y)
ax.set_yticklabels(specs)
ax.set_xlim(-0.08, 0.85)
ax.set_xlabel('核心解释变量估计系数及 95% CI')
`,
  },

  mccrary_density: {
    imports: ['from scipy import stats'],
    body: `
r_l = rng.uniform(-10, -0.05, 180)
r_r = rng.uniform(0.05, 10, 185)
gl = np.linspace(-10, -0.05, 120)
gr = np.linspace(0.05, 10, 120)
dl = stats.gaussian_kde(r_l)(gl)
dr = stats.gaussian_kde(r_r)(gr)

ax.fill_between(gl, np.maximum(0, dl - 0.015), dl + 0.015, color=SECONDARY, alpha=0.35, edgecolor=SECONDARY, linewidth=1.6)
ax.fill_between(gr, np.maximum(0, dr - 0.015), dr + 0.015, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
ax.plot(gl, dl, color=SECONDARY, linewidth=2.0, label='断点左侧密度估计')
ax.plot(gr, dr, color=PRIMARY, linewidth=2.0, label='断点右侧密度估计')
ax.axvline(0, color=OPPOSITE, linestyle='--', linewidth=1.6, label='McCrary 连续性检验 (p = 0.58)')
ax.set_xlabel('中心化分配变量 (X - c0)')
ax.set_ylabel('局部样本密度 f(X)')
`,
  },

  its_interrupted_ts: {
    imports: ['import statsmodels.api as sm'],
    body: `
t = np.arange(1, 37)
t0 = 19
D = (t >= t0).astype(float)
P = np.maximum(0.0, t - t0)
y = 40.0 + 0.82 * t + 7.4 * D + 0.96 * P + rng.normal(0, 1.8, len(t))

X = sm.add_constant(np.column_stack([t, D, P]))
fit = sm.OLS(y, X).fit(cov_type='HAC', cov_kwds={'maxlags': 2})
pred = fit.get_prediction(X).summary_frame(alpha=0.05)
cf = fit.params[0] + fit.params[1] * t[t >= t0]

ax.axvline(t0 - 0.5, color=OPPOSITE, linestyle='--', linewidth=1.6, label='政策干预时点 T0')
ax.scatter(t, y, s=30, color=SECONDARY, alpha=0.65, label='月度观测指标')
ax.fill_between(t[t < t0], pred['mean_ci_lower'][t < t0], pred['mean_ci_upper'][t < t0], color=SECONDARY, alpha=0.22)
ax.fill_between(t[t >= t0], pred['mean_ci_lower'][t >= t0], pred['mean_ci_upper'][t >= t0], color=PRIMARY, alpha=0.25)
ax.plot(t[t < t0], pred['mean'][t < t0], color=SECONDARY, linewidth=2.2, label='干预前基线拟合')
ax.plot(t[t >= t0], cf, color='#64748B', linestyle='--', linewidth=1.6, label='反事实外推基线')
ax.plot(t[t >= t0], pred['mean'][t >= t0], color=PRIMARY, linewidth=2.4,
        label=f'干预后拟合 (β2={fit.params[2]:+.2f}, β3={fit.params[3]:+.2f})')
ax.set_xlabel('观测期序 (月度 t)')
ax.set_ylabel('目标评价指标 Yt')
`,
  },

  diff_in_disc: {
    imports: ['import statsmodels.api as sm'],
    body: `
x_pre = rng.uniform(-20, 20, 180)
x_post = rng.uniform(-20, 20, 180)
y_pre = 2.6 + 0.016 * x_pre + 0.14 * (x_pre >= 0) + rng.normal(0, 0.18, 180)
y_post = 2.9 + 0.018 * x_post + 0.62 * (x_post >= 0) + rng.normal(0, 0.18, 180)

def local_fit(x_arr, y_arr):
    out = {}
    for side, mask in [('L', x_arr < 0), ('R', x_arr >= 0)]:
        xs, ys = x_arr[mask], y_arr[mask]
        w = np.clip(1.0 - np.abs(xs) / 20.0, 0.05, 1.0)
        mod = sm.WLS(ys, sm.add_constant(xs), weights=w).fit()
        xg = np.linspace(xs.min(), 0, 50) if side == 'L' else np.linspace(0, xs.max(), 50)
        pred = mod.get_prediction(sm.add_constant(xg)).summary_frame(alpha=0.05)
        out[side] = (xg, pred, mod.params[0])
    return out, out['R'][2] - out['L'][2]

f_pre, tau_pre = local_fit(x_pre, y_pre)
f_post, tau_post = local_fit(x_post, y_post)

ax.axvline(0, color=OPPOSITE, linestyle='--', linewidth=1.5, label=f'断点差分 Δτ = {tau_post - tau_pre:+.3f}')
for side in ('L', 'R'):
    xg0, p0, _ = f_pre[side]
    xg1, p1, _ = f_post[side]
    ax.plot(xg0, p0['mean'], color=SECONDARY, linestyle='--', linewidth=1.9, label=f'基线期 (τ_pre={tau_pre:+.2f})' if side == 'L' else None)
    ax.fill_between(xg1, p1['mean_ci_lower'], p1['mean_ci_upper'], color=PRIMARY, alpha=0.22)
    ax.plot(xg1, p1['mean'], color=PRIMARY, linewidth=2.3, label=f'干预后 (τ_post={tau_post:+.2f})' if side == 'L' else None)
ax.scatter(x_pre, y_pre, s=18, color=SECONDARY, alpha=0.28)
ax.scatter(x_post, y_post, s=22, color=PRIMARY, alpha=0.35)
ax.set_xlabel('中心化驱动变量 (X - c0)')
ax.set_ylabel('结果条件均值 Y')
`,
  },

  dag_backdoor: {
    body: `
nodes = {
    'Z': (0.50, 0.82, '混杂变量 [Z]\\n(最小调整集 · 已控制)', SECONDARY, True),
    'X': (0.16, 0.48, '处理变量 X\\n(外生政策暴露)', PRIMARY, False),
    'M': (0.50, 0.48, '中介变量 M\\n(总效应禁控)', '#475569', False),
    'Y': (0.84, 0.48, '结果变量 Y\\n(目标响应指标)', SECONDARY, False),
    'C': (0.50, 0.14, '对撞因子 C\\n(X→C←Y 禁控!)', OPPOSITE, True),
}

for key, (nx, ny, lbl, col, dashed) in nodes.items():
    box = mpatches.FancyBboxPatch(
        (nx - 0.125, ny - 0.085), 0.25, 0.17,
        boxstyle='round,pad=0.015,rounding_size=0.03',
        facecolor='#FFFFFF', edgecolor=col,
        linestyle='--' if key == 'C' else '-', linewidth=2.0, zorder=3,
    )
    ax.add_patch(box)
    ax.text(nx, ny, lbl, ha='center', va='center', fontsize=8.8, fontweight='bold', color=col, zorder=4)

def draw_edge(p0, p1, col, ls='-', rad=0.0, tag=None):
    arr = mpatches.FancyArrowPatch(
        p0, p1, connectionstyle=f'arc3,rad={rad}',
        arrowstyle='-|>,head_length=7,head_width=4',
        color=col, linestyle=ls, linewidth=1.8, zorder=2,
    )
    ax.add_patch(arr)
    if tag:
        mx = (p0[0] + p1[0]) / 2
        my = (p0[1] + p1[1]) / 2 + (0.06 if rad < 0 else 0.02)
        ax.text(mx, my, tag, ha='center', va='center', fontsize=8.2, color=col,
                bbox=dict(boxstyle='round,pad=0.18', facecolor='#FFFFFF', edgecolor='none', alpha=0.85))

draw_edge((0.39, 0.77), (0.21, 0.56), SECONDARY, '--', 0.0, '✕ 后门截断')
draw_edge((0.61, 0.77), (0.79, 0.56), SECONDARY, '--', 0.0, '✕ 后门截断')
draw_edge((0.29, 0.48), (0.37, 0.48), PRIMARY, '-', 0.0)
draw_edge((0.63, 0.48), (0.71, 0.48), PRIMARY, '-', 0.0)
draw_edge((0.23, 0.56), (0.77, 0.56), PRIMARY, '-', -0.22, '直接效应 X → Y')
draw_edge((0.21, 0.39), (0.38, 0.20), OPPOSITE, ':', 0.0, '误控开启虚假路径')
draw_edge((0.79, 0.39), (0.62, 0.20), OPPOSITE, ':', 0.0)

ax.plot([], [], color=PRIMARY, linewidth=2.0, label='有效因果路径')
ax.plot([], [], color=SECONDARY, linestyle='--', linewidth=1.8, label='调整 [Z] 截断后门')
ax.plot([], [], color=OPPOSITE, linestyle=':', linewidth=1.8, label='对撞偏误禁止控制')
ax.set_xlim(0.0, 1.0)
ax.set_ylim(0.0, 1.0)
ax.set_xticks([])
ax.set_yticks([])
ax.spines['left'].set_visible(False)
ax.spines['bottom'].set_visible(False)
`,
  },

  sdid_unit_time_weights: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
years = np.arange(2016, 2025)
t0_idx = 5  # 2021 年实施政策干预
y_treat = np.array([42.0, 44.2, 46.8, 49.5, 52.1, 61.8, 69.4, 75.8, 81.2])
y_sdid_ctrl = np.array([41.2, 43.3, 45.9, 48.7, 51.3, 53.6, 56.2, 58.9, 61.5])
lambda_t = np.array([0.05, 0.08, 0.14, 0.29, 0.44, 0.0, 0.0, 0.0, 0.0])

fig = plt.figure(figsize=(8.8, 5.6), dpi=180)
gs = GridSpec(2, 1, height_ratios=[2.8, 1.0], hspace=0.14)
ax_top = fig.add_subplot(gs[0])
ax_bot = fig.add_subplot(gs[1], sharex=ax_top)

ax_top.axvspan(2020.5, 2024.3, color=PRIMARY, alpha=0.06)
ax_top.axvline(2020.5, color=OPPOSITE, linestyle='--', linewidth=1.4)
ax_top.fill_between(years[t0_idx - 1:], y_sdid_ctrl[t0_idx - 1:], y_treat[t0_idx - 1:], color=PRIMARY, alpha=0.18)
ax_top.plot(years, y_sdid_ctrl, color=SECONDARY, linestyle='--', marker='s', linewidth=2.0, label='ω_i 单元加权合成对照')
ax_top.plot(years, y_treat, color=PRIMARY, marker='o', linewidth=2.4, label='处理组实测均值轨迹')
att_est = np.mean(y_treat[t0_idx:] - y_sdid_ctrl[t0_idx:]) - np.sum(lambda_t[:t0_idx] * (y_treat[:t0_idx] - y_sdid_ctrl[:t0_idx]))
ax_top.annotate(f'ATT_SDID = {att_est:+.2f}', xy=(2024, y_treat[-1]), xytext=(2022.4, y_treat[-1] + 2.0),
                fontsize=9.5, fontweight='bold', color=OPPOSITE)
ax_top.set_ylabel('目标指标水平 Y')
ax_top.legend(frameon=False, loc='upper left')
plt.setp(ax_top.get_xticklabels(), visible=False)

ax_bot.axvline(2020.5, color=OPPOSITE, linestyle='--', linewidth=1.4)
ax_bot.bar(years[:t0_idx], lambda_t[:t0_idx], width=0.58, color=OPPOSITE, alpha=0.45, edgecolor=OPPOSITE, linewidth=1.4, label='时间权重 λ_t (Σλ_t=1)')
for yr, w in zip(years[:t0_idx], lambda_t[:t0_idx]):
    ax_bot.text(yr, w + 0.02, f'{w:.2f}', ha='center', va='bottom', fontsize=8.5, color=OPPOSITE, fontweight='bold')
ax_bot.set_ylim(0, 0.56)
ax_bot.set_xticks(years)
ax_bot.set_ylabel('时间权重 λ_t')
ax_bot.set_xlabel('观测年份 (下方展示前测基期时间权重 λ_t)')
ax_bot.legend(frameon=False, loc='upper right')

for target_ax in (ax_top, ax_bot):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.5, fontweight='bold', y=0.97)
`,
  },

  var_irf: {
    body: `
A1 = np.array([[0.54, 0.22], [0.28, 0.48]])
A2 = np.array([[-0.12, -0.06], [-0.08, -0.10]])
Sigma = np.array([[0.09, 0.025], [0.025, 0.08]])
P = np.linalg.cholesky(Sigma)
H = 12

def compute_irf(a1, a2, chol_p, horizon):
    irfs = [chol_p]
    for h in range(1, horizon + 1):
        prev1 = irfs[h - 1]
        prev2 = irfs[h - 2] if h >= 2 else np.zeros_like(chol_p)
        irfs.append(a1 @ prev1 + a2 @ prev2)
    return np.array([m[1, 0] for m in irfs])

irf_mean = compute_irf(A1, A2, P, H)
boot_irfs = np.array([
    compute_irf(A1 + rng.normal(0, 0.055, (2, 2)), A2 + rng.normal(0, 0.035, (2, 2)), P, H)
    for _ in range(250)
])
ci_lo = np.percentile(boot_irfs, 2.5, axis=0)
ci_hi = np.percentile(boot_irfs, 97.5, axis=0)
hs = np.arange(H + 1)

ax.axhline(0, color='#475569', linestyle='--', linewidth=1.2)
ax.fill_between(hs, ci_lo, ci_hi, color=SECONDARY, alpha=0.22, label='95% Bootstrap 置信带')
ax.plot(hs, irf_mean, color=PRIMARY, marker='o', linewidth=2.3, label='正交化脉冲响应 ΔY_t+h')
pk = int(np.argmax(np.abs(irf_mean)))
ax.scatter([hs[pk]], [irf_mean[pk]], s=110, color=OPPOSITE, zorder=5, label=f'峰值响应 h={pk} ({irf_mean[pk]:+.3f})')
ax.set_xticks(hs)
ax.set_xlabel('外生冲击滞后期数 h')
ax.set_ylabel('被冲击变量响应幅度 ΔY')
`,
  },

  cs_group_time_att: {
    body: `
years = np.arange(2016, 2026)
cohorts = [2020, 2022, 2023]
n_per_group = 60

# 构建模拟交错面板: 3个处理队列 + 1个从未处理干净对照组
unit_fe = rng.normal(50.0, 4.0, (4, n_per_group))
time_fe = np.linspace(0.0, 5.4, len(years))

y_ctrl = unit_fe[3][:, None] + time_fe[None, :] + rng.normal(0, 0.35, (n_per_group, len(years)))
event_grid = np.arange(-3, 5)
cohort_styles = [(2020, '2020首批试点队列', PRIMARY, 'o'), (2022, '2022扩围试点队列', SECONDARY, 's'), (2023, '2023全覆盖队列', OPPOSITE, '^')]

all_post = []
for idx_g, (g, lbl, col, mk) in enumerate(cohort_styles):
    g_pos = int(np.where(years == g)[0][0])
    base_pos = g_pos - 1  # g - 1 作为事件基准期
    dyn_eff = np.array([0.0 if t < g else (0.14 + 0.11 * (t - g) - 0.04 * idx_g) for t in years])
    y_g = unit_fe[idx_g][:, None] + time_fe[None, :] + dyn_eff[None, :] + rng.normal(0, 0.35, (n_per_group, len(years)))

    es, atts, ses = [], [], []
    for e in event_grid:
        t_idx = g_pos + e
        if 0 <= t_idx < len(years):
            diff_g = y_g[:, t_idx] - y_g[:, base_pos]
            diff_c = y_ctrl[:, t_idx] - y_ctrl[:, base_pos]
            att_gt = float(np.mean(diff_g) - np.mean(diff_c))
            se_gt = float(np.sqrt(np.var(diff_g, ddof=1) / n_per_group + np.var(diff_c, ddof=1) / n_per_group))
            es.append(e)
            atts.append(att_gt)
            ses.append(se_gt)
            if e >= 0:
                all_post.append(att_gt)

    es_a, atts_a, ses_a = np.array(es), np.array(atts), np.array(ses)
    ax.fill_between(es_a, atts_a - 1.96 * ses_a, atts_a + 1.96 * ses_a, color=col, alpha=0.12)
    ax.plot(es_a, atts_a, color=col, marker=mk, linewidth=2.0, markersize=5.5, label=lbl)

ax.axhline(0.0, color='#475569', linestyle='--', linewidth=1.2)
ax.axvline(-0.5, color=OPPOSITE, linestyle='--', linewidth=1.3, label='政策入组冲击分界')
ax.axvspan(-0.5, 4.3, color=PRIMARY, alpha=0.05)
ax.set_xticks(event_grid)
ax.set_xlabel('相对入组时期 e = t - g (仅与从未处理组比较)')
ax.set_ylabel('组别—时期动态效应 ATT(g, t)')
ax.text(0.03, 0.93, f'总体加权 ATT = {np.mean(all_post):+.3f}', transform=ax.transAxes,
        fontsize=9.5, fontweight='bold', color=PRIMARY)
`,
  },

  bacon_decomp_2x2: {
    body: `
years = np.arange(2016, 2026)
T = len(years)
n_e, n_l, n_u = 40, 40, 60
t_e, t_l = 2019, 2022

# 模拟异质动态增长型处理效应: 早处理组斜率大、晚处理组刚起步
y_e = np.array([[50 + 0.5 * (t - 2016) + (0.28 * (t - t_e + 1) if t >= t_e else 0) + rng.normal(0, 0.15) for t in years] for _ in range(n_e)])
y_l = np.array([[48 + 0.5 * (t - 2016) + (0.22 * (t - t_l + 1) if t >= t_l else 0) + rng.normal(0, 0.15) for t in years] for _ in range(n_l)])
y_u = np.array([[46 + 0.5 * (t - 2016) + rng.normal(0, 0.15) for t in years] for _ in range(n_u)])

def did_2x2(yt, yc, mask_post, mask_pre):
    return float((yt[:, mask_post].mean() - yt[:, mask_pre].mean()) - (yc[:, mask_post].mean() - yc[:, mask_pre].mean()))

m_e_post, m_e_pre = years >= t_e, years < t_e
m_l_post, m_l_pre = years >= t_l, years < t_l
m_mid = (years >= t_e) & (years < t_l)

# 计算四类规范 2x2 DID 及其方差加权 Goodman-Bacon 权重
raw_pairs = [
    ('早处理 vs 从未处理 (干净)', PRIMARY, 'o', did_2x2(y_e, y_u, m_e_post, m_e_pre), n_e * n_u * m_e_post.mean() * m_e_pre.mean()),
    ('晚处理 vs 从未处理 (干净)', SECONDARY, 's', did_2x2(y_l, y_u, m_l_post, m_l_pre), n_l * n_u * m_l_post.mean() * m_l_pre.mean()),
    ('早处理 vs 尚未处理 (干净)', '#0EA5E9', '^', did_2x2(y_e, y_l, m_mid, m_e_pre), n_e * n_l * (m_mid.sum() / (m_mid.sum() + m_e_pre.sum())) * (m_e_pre.sum() / (m_mid.sum() + m_e_pre.sum())) * ((m_mid.sum() + m_e_pre.sum()) / T) ** 2),
    ('晚处理 vs 已处理早组 (污染!)', OPPOSITE, 'X', did_2x2(y_l, y_e, m_l_post, m_mid), n_l * n_e * (m_l_post.sum() / (m_l_post.sum() + m_mid.sum())) * (m_mid.sum() / (m_l_post.sum() + m_mid.sum())) * ((m_l_post.sum() + m_mid.sum()) / T) ** 2),
]

tot_w = sum(p[4] for p in raw_pairs)
pairs = [(lbl, col, mk, est, w / tot_w) for lbl, col, mk, est, w in raw_pairs]
twfe_est = sum(est * w for _, _, _, est, w in pairs)
clean_est = sum(est * w for lbl, _, _, est, w in pairs if '污染' not in lbl) / sum(w for lbl, _, _, _, w in pairs if '污染' not in lbl)

ax.axhline(0.0, color='#64748B', linewidth=1.0)
ax.axhline(twfe_est, color='#0F172A', linestyle='--', linewidth=1.6, label=f'TWFE 汇总估计 ({twfe_est:+.3f})')
ax.axhline(clean_est, color=PRIMARY, linestyle='-.', linewidth=1.5, label=f'干净对照加权均值 ({clean_est:+.3f})')

for lbl, col, mk, est, w in pairs:
    ax.scatter([w], [est], s=110 + 480 * w, color=col, marker=mk, edgecolor='#FFFFFF', linewidth=1.1, zorder=5, label=f'{lbl} (w={w:.2f})')

ax.set_xlim(0, max(p[4] for p in pairs) * 1.25)
ax.set_xlabel('Goodman-Bacon 分解权重 w_k (Σw_k = 1)')
ax.set_ylabel('2×2 DID 子比较估计值 beta_k')
`,
  },

  oster_delta_bounds: {
    body: `
n = 600
w_obs = rng.normal(0, 1, n)
u_unobs = rng.normal(0, 1, n)
x = 0.55 * w_obs + 0.25 * u_unobs + rng.normal(0, 0.85, n)
y = 0.45 * x + 0.52 * w_obs + 0.30 * u_unobs + rng.normal(0, 0.90, n)

def ols_fit(X_mat, y_vec):
    coef, *_ = np.linalg.lstsq(X_mat, y_vec, rcond=None)
    pred = X_mat @ coef
    ss_res = float(np.sum((y_vec - pred) ** 2))
    ss_tot = float(np.sum((y_vec - np.mean(y_vec)) ** 2))
    return coef, 1.0 - ss_res / ss_tot

c_short, r2_short = ols_fit(np.column_stack([np.ones(n), x]), y)
c_ctrl, r2_tilde = ols_fit(np.column_stack([np.ones(n), x, w_obs]), y)
beta_short, beta_tilde = float(c_short[1]), float(c_ctrl[1])
r2_max = min(1.0, 1.3 * r2_tilde)

# Oster (2019) 偏误修正界函数 β*(δ, R_max)
deltas = np.linspace(0.0, 2.8, 120)
slope_bias = (beta_short - beta_tilde) * (r2_max - r2_tilde) / max(1e-6, r2_tilde - r2_short)
beta_star = beta_tilde - deltas * slope_bias
beta_at_1 = float(beta_tilde - 1.0 * slope_bias)
delta_zero = float(beta_tilde / slope_bias) if slope_bias > 1e-6 else np.nan

ax.axhspan(min(beta_tilde, beta_at_1), max(beta_tilde, beta_at_1), xmin=0.0, xmax=1.0 / 2.8, color=SECONDARY, alpha=0.16,
           label=f'识别集合 [{min(beta_tilde, beta_at_1):.3f}, {max(beta_tilde, beta_at_1):.3f}]')
ax.axhline(0.0, color='#475569', linestyle='--', linewidth=1.2)
ax.axvline(1.0, color=OPPOSITE, linestyle='--', linewidth=1.4, label='经验阈值基准 δ = 1.0')
ax.plot(deltas, beta_star, color=PRIMARY, linewidth=2.4, label='偏误修正曲线 β*(δ, Rmax)')

ax.scatter([0.0, 1.0], [beta_tilde, beta_at_1], s=85, color=[SECONDARY, PRIMARY], zorder=5)
ax.annotate(f'beta_tilde = {beta_tilde:.3f}', xy=(0.0, beta_tilde), xytext=(0.12, beta_tilde + 0.03), fontsize=9, fontweight='bold', color=SECONDARY)
ax.annotate(f'β*(1) = {beta_at_1:.3f}', xy=(1.0, beta_at_1), xytext=(1.08, beta_at_1 + 0.03), fontsize=9, fontweight='bold', color=PRIMARY)
if np.isfinite(delta_zero) and 0 < delta_zero < 2.75:
    ax.scatter([delta_zero], [0.0], s=95, color=OPPOSITE, zorder=6)
    ax.annotate(f'δ* = {delta_zero:.2f} (归零阈值)', xy=(delta_zero, 0.0), xytext=(delta_zero - 0.15, 0.06),
                fontsize=9, fontweight='bold', color=OPPOSITE, ha='center')

ax.set_xlim(0.0, 2.8)
ax.set_xlabel('不可观测与可观测变量选择比例 δ (Rmax = 1.3 R_tilde^2)')
ax.set_ylabel('偏误修正处理效应 β*(δ)')
`,
  },

  spatial_sar_impacts: {
    body: `
# 构造 36 个区域单元的空间邻接矩阵 W (行标准化) 并模拟 SDM 数据生成过程
n_reg = 36
grid_xy = np.array([(i // 6, i % 6) for i in range(n_reg)], dtype=float)
dist_mat = np.hypot(grid_xy[:, 0:1] - grid_xy[:, 0:1].T, grid_xy[:, 1:2] - grid_xy[:, 1:2].T)
W_raw = ((dist_mat > 0) & (dist_mat <= 1.1)).astype(float)
W = W_raw / np.maximum(1.0, W_raw.sum(axis=1, keepdims=True))

rho_true = 0.34
cov_names = ['数字基础设施', '财政政策补贴', '研发人才集聚', '行政准入壁垒']
beta_true = np.array([0.26, 0.19, 0.15, -0.13])
theta_true = np.array([0.11, 0.08, 0.16, -0.04])
beta_se = np.array([0.032, 0.028, 0.026, 0.025])
theta_se = np.array([0.042, 0.038, 0.036, 0.030])

def sdm_impacts(rho, b_vec, t_vec):
    A_inv = np.linalg.inv(np.eye(n_reg) - rho * W)
    direct, indirect, total = [], [], []
    for bk, tk in zip(b_vec, t_vec):
        S_k = A_inv @ (bk * np.eye(n_reg) + tk * W)
        d_val = float(np.mean(np.diag(S_k)))
        tot_val = float(np.mean(S_k.sum(axis=1)))
        direct.append(d_val)
        total.append(tot_val)
        indirect.append(tot_val - d_val)
    return np.array(direct), np.array(indirect), np.array(total)

d_est, i_est, t_est = sdm_impacts(rho_true, beta_true, theta_true)
# Monte Carlo 参数抽样构造 LeSage-Pace 偏微分 95% 置信区间
draws_d, draws_i, draws_t = [], [], []
for _ in range(300):
    r_d = np.clip(rng.normal(rho_true, 0.05), -0.6, 0.8)
    b_d = rng.normal(beta_true, beta_se)
    t_d = rng.normal(theta_true, theta_se)
    dd, ii, tt = sdm_impacts(r_d, b_d, t_d)
    draws_d.append(dd)
    draws_i.append(ii)
    draws_t.append(tt)

d_ci = 1.96 * np.std(draws_d, axis=0)
i_ci = 1.96 * np.std(draws_i, axis=0)
t_ci = 1.96 * np.std(draws_t, axis=0)

y_pos = np.arange(len(cov_names))[::-1]
h_bar = 0.22
ax.axvline(0.0, color='#475569', linestyle='--', linewidth=1.2)
ax.barh(y_pos + h_bar, d_est, height=h_bar, xerr=d_ci, color=PRIMARY, alpha=0.82, capsize=3, label='直接效应 (Direct)')
ax.barh(y_pos, i_est, height=h_bar, xerr=i_ci, color=SECONDARY, alpha=0.82, capsize=3, label='空间溢出效应 (ρW)')
ax.errorbar(t_est, y_pos - h_bar, xerr=t_ci, fmt='D', color=OPPOSITE, markersize=6.5, elinewidth=2.0, capsize=3.5, label='总效应 (Total ± 95% CI)')

for yp, tot, ci in zip(y_pos, t_est, t_ci):
    offset = ci + 0.02 if tot >= 0 else -(ci + 0.02)
    ha = 'left' if tot >= 0 else 'right'
    ax.text(tot + offset, yp - h_bar, f'{tot:+.2f}', va='center', ha=ha, fontsize=8.5, fontweight='bold', color=OPPOSITE)

ax.set_yticks(y_pos)
ax.set_yticklabels(cov_names)
ax.set_xlim(min(t_est - t_ci) - 0.16, max(t_est + t_ci) + 0.16)
ax.set_xlabel(f'LeSage-Pace 偏微分边际效应 (空间自回归 ρ = {rho_true:.2f})')
`,
  },

  sc_donor_convex_hull: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
# 构造捐赠池特征坐标 (Z1, Z2) 与目标试点单元坐标
donors = np.array([
    [-1.9, -1.4], [-1.6, 1.5], [-0.4, 2.0], [1.8, 1.7], [2.1, -0.5],
    [1.3, -1.9], [-0.7, -1.8], [0.5, 0.8], [-1.0, -0.2], [-1.1, 1.0],
    [1.2, 1.1], [0.2, -1.2],
])
treat_z = np.array([0.08, 0.42])

# 投影单纯形梯度下降求解最优凸权重 (w >= 0, sum(w) = 1)
def project_simplex(v):
    u = np.sort(v)[::-1]
    cssv = np.cumsum(u) - 1.0
    ind = np.arange(1, len(v) + 1)
    cond = u - cssv / ind > 0
    rho = ind[cond][-1]
    theta = cssv[cond][-1] / float(rho)
    return np.maximum(v - theta, 0.0)

w = np.full(len(donors), 1.0 / len(donors))
for _ in range(300):
    grad = 2.0 * donors @ (donors.T @ w - treat_z)
    w = project_simplex(w - 0.04 * grad)
synth_z = donors.T @ w

# Andrew 单调链求解捐赠池二维凸包顶点
pts_sorted = sorted([tuple(p) for p in donors])
def cross(o, a, b):
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
lower, upper = [], []
for p in pts_sorted:
    while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
        lower.pop()
    lower.append(p)
for p in reversed(pts_sorted):
    while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
        upper.pop()
    upper.append(p)
hull = np.array(lower[:-1] + upper[:-1] + [lower[0]])

years = np.arange(2016, 2025)
t0 = 2021
y_pre_err = rng.normal(0.0, 0.35, 5)
gap = np.concatenate([y_pre_err, np.array([4.8, 9.6, 14.5, 19.2])])
rmspe_pre = float(np.sqrt(np.mean(gap[:5] ** 2)))
rmspe_post = float(np.sqrt(np.mean(gap[5:] ** 2)))

fig = plt.figure(figsize=(10.2, 4.8), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.1, 1.0], wspace=0.28)
ax1, ax2 = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

ax1.fill(hull[:, 0], hull[:, 1], color='#CBD5E1', alpha=0.22)
ax1.plot(hull[:, 0], hull[:, 1], color='#64748B', linestyle='--', linewidth=1.3, label='捐赠池凸包边界')
top_idx = np.argsort(w)[-3:]
ax1.scatter(donors[:, 0], donors[:, 1], s=40, color='#94A3B8', alpha=0.8, label='零权重捐赠单元')
ax1.scatter(donors[top_idx, 0], donors[top_idx, 1], s=140 + 480 * w[top_idx], color=SECONDARY, alpha=0.88, edgecolor='#FFFFFF', linewidth=1.1, label='正权重捐赠单元')
for idx in top_idx:
    ax1.annotate(f'D{idx+1} (w={w[idx]:.2f})', (donors[idx, 0], donors[idx, 1]), xytext=(6, 5), textcoords='offset points', fontsize=8, fontweight='bold', color=SECONDARY)
ax1.scatter([synth_z[0]], [synth_z[1]], s=95, marker='s', color=PRIMARY, zorder=6, label='合成对照投影点')
ax1.scatter([treat_z[0]], [treat_z[1]], s=135, marker='*', color=OPPOSITE, zorder=7, label='处理试点单元')
ax1.set_xlabel('标准化预测特征 Z1')
ax1.set_ylabel('标准化预测特征 Z2')
ax1.set_title('捐赠池特征凸包与权重投影', fontsize=10.5, fontweight='bold')
ax1.legend(frameon=False, loc='lower left', fontsize=8)

ax2.axhspan(-2.0 * rmspe_pre, 2.0 * rmspe_pre, color=SECONDARY, alpha=0.16, label=f'±2 RMSPE_pre 带 (±{2*rmspe_pre:.2f})')
ax2.axhline(0.0, color='#475569', linestyle='--', linewidth=1.0)
ax2.axvline(t0 - 0.5, color=OPPOSITE, linestyle='--', linewidth=1.3, label='政策干预节点')
ax2.plot(years, gap, color=PRIMARY, marker='o', linewidth=2.2, label='处理效应残差 Gap')
ax2.text(0.04, 0.90, f'RMSPE_post / RMSPE_pre = {rmspe_post / rmspe_pre:.1f}×', transform=ax2.transAxes, fontsize=9, fontweight='bold', color=OPPOSITE)
ax2.set_xticks(years)
ax2.set_xlabel('观测年份')
ax2.set_ylabel('实测与合成轨迹差值 Gap')
ax2.set_title('事前拟合残差带与事后跃迁', fontsize=10.5, fontweight='bold')
ax2.legend(frameon=False, loc='lower right', fontsize=8)

for target_ax in (ax1, ax2):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.08, right=0.97, bottom=0.14, top=0.84)
`,
  },

  quantile_process_band: {
    body: `
n = 360
x = rng.normal(0.0, 1.0, n)
# 异方差数据生成过程: 随分位点 tau 升高条件边际斜率单调递增
y = 1.8 + 0.38 * x + (0.18 + 0.28 * (x - np.min(x))) * rng.normal(0.0, 1.0, n)
X = np.column_stack([np.ones(n), x])

# 纯 NumPy IRLS 求解连续分位数回归过程 beta_hat(tau)
def quantreg_irls(X_mat, y_vec, tau, n_iter=35):
    b = np.linalg.lstsq(X_mat, y_vec, rcond=None)[0]
    for _ in range(n_iter):
        r = y_vec - X_mat @ b
        w = np.where(r >= 0, tau, 1.0 - tau) / np.maximum(np.abs(r), 1e-4)
        Xw = X_mat * w[:, None]
        b = np.linalg.solve(Xw.T @ X_mat + 1e-6 * np.eye(X_mat.shape[1]), Xw.T @ y_vec)
    return b

taus = np.linspace(0.10, 0.90, 17)
betas = np.array([quantreg_irls(X, y, t)[1] for t in taus])

# Bootstrap 估计逐点 95% CI 与一致置信带 (Uniform Band)
n_boot = 120
boot_mat = np.zeros((n_boot, len(taus)))
for b_idx in range(n_boot):
    idx = rng.integers(0, n, size=n)
    Xb, yb = X[idx], y[idx]
    for t_idx, t in enumerate(taus):
        boot_mat[b_idx, t_idx] = quantreg_irls(Xb, yb, t)[1]

se_tau = np.std(boot_mat, axis=0)
pw_lo, pw_hi = betas - 1.96 * se_tau, betas + 1.96 * se_tau
sup_t = np.quantile(np.max(np.abs(boot_mat - betas) / np.maximum(se_tau, 1e-5), axis=1), 0.95)
un_lo, un_hi = betas - sup_t * se_tau, betas + sup_t * se_tau

ols_b = float(np.linalg.lstsq(X, y, rcond=None)[0][1])
ols_res = y - X @ np.linalg.lstsq(X, y, rcond=None)[0]
ols_se = float(np.sqrt(np.sum(ols_res ** 2) / (n - 2) * np.linalg.inv(X.T @ X)[1, 1]))

ax.axhspan(ols_b - 1.96 * ols_se, ols_b + 1.96 * ols_se, color=OPPOSITE, alpha=0.14, label='OLS 均值 95% CI 带')
ax.axhline(ols_b, color=OPPOSITE, linestyle='--', linewidth=1.6, label=f'OLS 均值估计 ({ols_b:.3f})')
ax.axhline(0.0, color='#64748B', linestyle=':', linewidth=1.0)
ax.fill_between(taus, un_lo, un_hi, color=PRIMARY, alpha=0.13, label='95% 一致置信带 (Uniform)')
ax.fill_between(taus, pw_lo, pw_hi, color=PRIMARY, alpha=0.28, label='95% 逐点置信带 (Pointwise)')
ax.plot(taus, betas, color=PRIMARY, marker='o', markersize=4.5, linewidth=2.3, label='分位数回归过程 beta_hat(τ)')
ax.set_xticks(np.arange(0.1, 0.95, 0.1))
ax.set_xlabel('条件分位点 τ (连续过程格点 0.10 → 0.90)')
ax.set_ylabel('边际回归斜率 beta_hat(τ)')
`,
  },

  rdd_local_poly: {
    body: `
# 模拟 Sharp RDD 数据并执行纯 NumPy 三角核局部二次多项式估计
n_obs = 480
x_raw = rng.uniform(-30.0, 30.0, n_obs)
x_raw = x_raw[np.abs(x_raw) > 0.25]
y_true = np.where(x_raw < 0, 2.98 + 0.015 * x_raw - 0.00018 * (x_raw ** 2),
                  3.64 + 0.022 * x_raw - 0.00022 * (x_raw ** 2))
y_obs = y_true + rng.normal(0.0, 0.22, len(x_raw))

h_opt = 14.0
def local_quad_fit(x_side, y_side, x_grid, h):
    w = np.maximum(0.0, 1.0 - np.abs(x_side) / 28.0)
    w = np.where(np.abs(x_side) <= h, 1.0 - np.abs(x_side) / h, 0.15 * w)
    X = np.column_stack([np.ones_like(x_side), x_side, x_side ** 2])
    W = w[:, None]
    xtwx = X.T @ (W * X) + 1e-6 * np.eye(3)
    beta = np.linalg.solve(xtwx, X.T @ (w * y_side))
    res = y_side - X @ beta
    s2 = float(np.sum(w * (res ** 2)) / max(1.0, np.sum(w > 0.2) - 3))
    cov = s2 * np.linalg.inv(xtwx) @ (X.T @ ((w ** 2)[:, None] * X)) @ np.linalg.inv(xtwx)
    Xg = np.column_stack([np.ones_like(x_grid), x_grid, x_grid ** 2])
    y_hat = Xg @ beta
    se = np.sqrt(np.maximum(1e-6, np.sum((Xg @ cov) * Xg, axis=1)))
    return y_hat, y_hat - 1.96 * se, y_hat + 1.96 * se, float(beta[0])

mask_l, mask_r = x_raw < 0, x_raw >= 0
xg_l = np.linspace(-29.0, 0.0, 60)
xg_r = np.linspace(0.0, 29.0, 60)
yl_hat, yl_lo, yl_hi, c_l = local_quad_fit(x_raw[mask_l], y_obs[mask_l], xg_l, h_opt)
yr_hat, yr_lo, yr_hi, c_r = local_quad_fit(x_raw[mask_r], y_obs[mask_r], xg_r, h_opt)
tau_est = c_r - c_l

# 计算等距分箱均值散点
bins_l = np.linspace(-28.0, 0.0, 9)
bins_r = np.linspace(0.0, 28.0, 9)
bx_l = 0.5 * (bins_l[:-1] + bins_l[1:])
by_l = [float(np.mean(y_obs[(x_raw >= bins_l[i]) & (x_raw < bins_l[i + 1])])) for i in range(len(bx_l))]
bx_r = 0.5 * (bins_r[:-1] + bins_r[1:])
by_r = [float(np.mean(y_obs[(x_raw >= bins_r[i]) & (x_raw <= bins_r[i + 1])])) for i in range(len(bx_r))]

ax.axvspan(-h_opt, h_opt, color=PRIMARY, alpha=0.08, label=f'CCT 最优带宽 [-{h_opt:.0f}, +{h_opt:.0f}]')
ax.axvline(0.0, color=OPPOSITE, linestyle='--', linewidth=1.5, label=f'断点跳跃 tau = {tau_est:+.3f} (p < 0.001)')
ax.fill_between(xg_l, yl_lo, yl_hi, color=SECONDARY, alpha=0.22)
ax.fill_between(xg_r, yr_lo, yr_hi, color=PRIMARY, alpha=0.22)
ax.plot(xg_l, yl_hat, color=SECONDARY, linewidth=2.2, label='左侧局部二次拟合 (p=2)')
ax.plot(xg_r, yr_hat, color=PRIMARY, linewidth=2.2, label='右侧局部二次拟合 (p=2)')
ax.scatter(bx_l, by_l, s=48, color=SECONDARY, edgecolor='#FFFFFF', linewidth=0.9, zorder=5, label='分箱样本均值')
ax.scatter(bx_r, by_r, s=48, color=PRIMARY, edgecolor='#FFFFFF', linewidth=0.9, zorder=5)
ax.set_xlabel('中心化分配变量 (X - c0)')
ax.set_ylabel('结果变量均值 (Y)')
`,
  },

  synthetic_did_unit_weights: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
years = np.arange(2019, 2026)
y_treat = np.array([42.0, 45.0, 48.2, 58.6, 65.4, 71.2, 76.4])
y_sdid = np.array([41.5, 44.6, 47.7, 50.8, 53.9, 56.8, 59.8])
y_did = np.array([45.8, 48.0, 50.2, 52.6, 55.0, 57.4, 59.8])

donors = ['苏州', '无锡', '嘉兴', '常州', '绍兴', '其他']
omega = np.array([0.34, 0.25, 0.18, 0.12, 0.07, 0.04])

fig = plt.figure(figsize=(10.2, 4.7), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.45, 1.0], wspace=0.28)
ax_tr = fig.add_subplot(gs[0])
ax_wt = fig.add_subplot(gs[1])

ax_tr.axvline(2021.5, color=OPPOSITE, linestyle='--', linewidth=1.4, label='试点冲击年份 (2022)')
ax_tr.fill_between(years[2:], y_sdid[2:], y_treat[2:], color=PRIMARY, alpha=0.16, label='SDID 净处理效应区')
ax_tr.plot(years, y_did, color='#94A3B8', linestyle=':', linewidth=1.6, label='未加权普通 DID 对照')
ax_tr.plot(years, y_sdid, color=SECONDARY, linestyle='--', marker='s', linewidth=2.0, label='SDID 单元加权合成对照')
ax_tr.plot(years, y_treat, color=PRIMARY, marker='o', linewidth=2.3, label='实际处理组均值')
att = float(np.mean(y_treat[3:] - y_sdid[3:]) - np.mean(y_treat[:3] - y_sdid[:3]))
ax_tr.text(2024.8, 69.0, f'ATT = {att:+.2f}', ha='right', fontsize=9.5, fontweight='bold', color=OPPOSITE)
ax_tr.set_xlabel('观测年份 (2019–2025)')
ax_tr.set_ylabel('核心目标指标 Y')
ax_tr.set_title('处理组 vs SDID 与普通 DID 轨迹对照', fontsize=10.5, fontweight='bold')
ax_tr.legend(frameon=False, loc='upper left', fontsize=8)

y_idx = np.arange(len(donors))[::-1]
bar_cols = [PRIMARY, PRIMARY, SECONDARY, SECONDARY, '#0D9488', '#64748B']
ax_wt.barh(y_idx, omega, height=0.56, color=bar_cols, alpha=0.82)
for yi, w in zip(y_idx, omega):
    ax_wt.text(w + 0.01, yi, f'{w:.2f}', va='center', fontsize=9, fontweight='bold', color='#1E293B')
ax_wt.set_yticks(y_idx)
ax_wt.set_yticklabels(donors)
ax_wt.set_xlim(0, 0.44)
ax_wt.set_xlabel('最优捐赠单元权重 omega_i (求和 = 1.00)')
ax_wt.set_title('反事实合成单元权重分解', fontsize=10.5, fontweight='bold')

for target_ax in (ax_tr, ax_wt):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.07, right=0.97, bottom=0.14, top=0.84)
`,
  },

  psm_love_smd_panel: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
covs = ['家庭月收入', '数字素养分', '受访者年龄', '受教育年限', '常住城市层', '基线意愿分']
smd_pre = np.array([0.48, 0.41, 0.34, 0.29, 0.24, 0.19])
smd_post = np.array([0.04, 0.05, 0.03, 0.04, 0.02, 0.05])
vr_pre = np.array([1.84, 1.66, 0.56, 1.54, 1.42, 0.68])
vr_post = np.array([1.04, 0.96, 0.98, 1.03, 1.01, 0.95])
y = np.arange(len(covs))[::-1]

fig = plt.figure(figsize=(10.2, 4.9), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.25, 1.0], wspace=0.16)
ax_smd = fig.add_subplot(gs[0])
ax_vr = fig.add_subplot(gs[1], sharey=ax_smd)

ax_smd.axvspan(0.0, 0.10, color=PRIMARY, alpha=0.12, label='安全阈值带 |SMD| <= 0.10')
ax_smd.axvline(0.10, color=PRIMARY, linestyle='--', linewidth=1.4)
ax_smd.axvline(0.25, color=OPPOSITE, linestyle=':', linewidth=1.2, label='警戒线 0.25')
for yi, s0, s1 in zip(y, smd_pre, smd_post):
    ax_smd.plot([s1, s0], [yi, yi], color='#CBD5E1', linewidth=1.5, zorder=2)
ax_smd.scatter(smd_pre, y, s=68, facecolor='#FFFFFF', edgecolor=OPPOSITE, linewidth=1.8, zorder=4, label='匹配前 (Unmatched)')
ax_smd.scatter(smd_post, y, s=72, color=PRIMARY, zorder=5, label='匹配后 (Matched)')
ax_smd.set_yticks(y)
ax_smd.set_yticklabels(covs)
ax_smd.set_xlim(0.0, 0.56)
ax_smd.set_xlabel('绝对标准化均值差 |SMD|')
ax_smd.set_title('一阶均值平衡 Love 检验 (max |SMD| = 0.05)', fontsize=10.2, fontweight='bold')
ax_smd.legend(frameon=False, loc='lower right', fontsize=8.0)

ax_vr.axvspan(0.5, 2.0, color=SECONDARY, alpha=0.10, label='Rubin 方差比区间 [0.5, 2.0]')
ax_vr.axvline(1.0, color='#475569', linestyle='--', linewidth=1.2)
ax_vr.axvline(0.5, color=OPPOSITE, linestyle=':', linewidth=1.1)
ax_vr.axvline(2.0, color=OPPOSITE, linestyle=':', linewidth=1.1)
for yi, v0, v1 in zip(y, vr_pre, vr_post):
    ax_vr.plot([v1, v0], [yi, yi], color='#CBD5E1', linewidth=1.5, zorder=2)
ax_vr.scatter(vr_pre, y, s=64, facecolor='#FFFFFF', edgecolor=OPPOSITE, linewidth=1.7, zorder=4, label='匹配前 VR')
ax_vr.scatter(vr_post, y, s=68, color=SECONDARY, zorder=5, label='匹配后 VR')
ax_vr.tick_params(labelleft=False)
ax_vr.set_xlim(0.35, 2.20)
ax_vr.set_xlabel('二阶方差比 Variance Ratio (VR)')
ax_vr.set_title('协变量方差比 Rubin 准则检核', fontsize=10.2, fontweight='bold')
ax_vr.legend(frameon=False, loc='lower right', fontsize=8.0)

for target_ax in (ax_smd, ax_vr):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, axis='x', linestyle='--', alpha=0.25)

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.12, right=0.97, bottom=0.14, top=0.84)
`,
  },

  iv_2sls_first_stage: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
n = 260
z = rng.uniform(0.2, 3.8, n)
u = rng.normal(0.0, 0.85, n)
x = 1.15 + 0.78 * z - 0.52 * u + rng.normal(0.0, 0.42, n)
y = 0.85 + 0.64 * x + 0.72 * u + rng.normal(0.0, 0.40, n)

# 第一阶段 OLS: X ~ 1 + Z
X1 = np.column_stack([np.ones(n), z])
b1 = np.linalg.lstsq(X1, x, rcond=None)[0]
x_hat = X1 @ b1
ssr1 = float(np.sum((x_hat - np.mean(x)) ** 2))
sse1 = float(np.sum((x - x_hat) ** 2))
f_stat = (ssr1 / 1.0) / (sse1 / (n - 2))

# 朴素 OLS 与 2SLS 第二阶段估计
b_ols = np.linalg.lstsq(np.column_stack([np.ones(n), x]), y, rcond=None)[0]
b_iv = np.linalg.lstsq(np.column_stack([np.ones(n), x_hat]), y, rcond=None)[0]
resid_iv = y - (b_iv[0] + b_iv[1] * x)
s2_iv = float(np.sum(resid_iv ** 2)) / (n - 2)
cov_iv = s2_iv * np.linalg.inv(np.column_stack([np.ones(n), x_hat]).T @ np.column_stack([np.ones(n), x_hat]))

bins = np.linspace(z.min(), z.max(), 13)
z_bin, x_bin, y_bin, xh_bin = [], [], [], []
for k in range(len(bins) - 1):
    m = (z >= bins[k]) & (z <= bins[k + 1])
    if np.any(m):
        z_bin.append(float(np.mean(z[m])))
        x_bin.append(float(np.mean(x[m])))
        y_bin.append(float(np.mean(y[m])))
        xh_bin.append(float(np.mean(x_hat[m])))

fig = plt.figure(figsize=(10.2, 4.8), dpi=180)
gs = GridSpec(1, 2, wspace=0.28)
ax1, ax2 = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

zg = np.linspace(0.2, 3.8, 60)
ax1.scatter(z, x, s=14, color='#94A3B8', alpha=0.30, label='原始样本点')
ax1.scatter(z_bin, x_bin, s=55, color=SECONDARY, edgecolor='#FFFFFF', linewidth=0.9, zorder=4, label='等距分箱均值')
ax1.plot(zg, b1[0] + b1[1] * zg, color=SECONDARY, linewidth=2.3, label=f'第一阶段斜率 = {b1[1]:.2f}')
ax1.text(0.05, 0.90, f'First-stage F = {f_stat:.1f} > Stock-Yogo 16.38', transform=ax1.transAxes,
         fontsize=8.6, fontweight='bold', color=SECONDARY, bbox=dict(boxstyle='round,pad=0.3', fc='#FFFFFF', ec=SECONDARY, alpha=0.9))
ax1.set_xlabel('外生工具变量 Z')
ax1.set_ylabel('内生解释变量 X')
ax1.set_title('第一阶段相关性与弱工具检验', fontsize=10.5, fontweight='bold')
ax1.legend(frameon=False, loc='lower right', fontsize=8.2)

xg = np.linspace(min(xh_bin) - 0.15, max(xh_bin) + 0.15, 60)
Xg = np.column_stack([np.ones_like(xg), xg])
se_g = np.sqrt(np.sum((Xg @ cov_iv) * Xg, axis=1))
yg_iv = b_iv[0] + b_iv[1] * xg
yg_ols = b_ols[0] + b_ols[1] * xg
ax2.fill_between(xg, yg_iv - 1.96 * se_g, yg_iv + 1.96 * se_g, color=PRIMARY, alpha=0.18, label='2SLS 95% 置信带')
ax2.plot(xg, yg_ols, color=OPPOSITE, linestyle='--', linewidth=1.8, label=f'朴素 OLS (偏误斜率 = {b_ols[1]:.2f})')
ax2.plot(xg, yg_iv, color=PRIMARY, linewidth=2.4, label=f'2SLS LATE (净效应 = {b_iv[1]:.2f})')
ax2.scatter(xh_bin, y_bin, s=55, color=PRIMARY, edgecolor='#FFFFFF', linewidth=0.9, zorder=5, label='分箱均值 (X_hat, Y)')
ax2.set_xlabel('第一阶段拟合内生变量 X_hat')
ax2.set_ylabel('结果变量 Y')
ax2.set_title('第二阶段 2SLS 局部平均效应 vs OLS 偏误', fontsize=10.5, fontweight='bold')
ax2.legend(frameon=False, loc='upper left', fontsize=8.0)

for target_ax in (ax1, ax2):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.07, right=0.97, bottom=0.14, top=0.84)
`,
  },

  diff_in_diff_bacon_scatter: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
# 构造交错 DID 四类 2x2 分解子组: (权重 w_k, 2x2 估计值 beta_k, 类别)
pairs = [
    (0.22, 0.48, '早处理 vs 从未处理'),
    (0.18, 0.45, '早处理 vs 从未处理'),
    (0.14, 0.41, '晚处理 vs 从未处理'),
    (0.11, 0.39, '晚处理 vs 从未处理'),
    (0.09, 0.35, '早处理 vs 晚未处理'),
    (0.07, 0.32, '早处理 vs 晚未处理'),
    (0.11, -0.15, '晚处理 vs 早已处理(禁忌)'),
    (0.08, -0.11, '晚处理 vs 早已处理(禁忌)'),
]
styles = {
    '早处理 vs 从未处理': (PRIMARY, 'o'),
    '晚处理 vs 从未处理': (SECONDARY, 's'),
    '早处理 vs 晚未处理': ('#0D9488', 'D'),
    '晚处理 vs 早已处理(禁忌)': (OPPOSITE, 'X'),
}
twfe_est = sum(w * b for w, b, _ in pairs)
clean_w = sum(w for w, _, g in pairs if '禁忌' not in g)
clean_est = sum(w * b for w, b, g in pairs if '禁忌' not in g) / clean_w

fig = plt.figure(figsize=(10.4, 4.8), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.45, 1.0], wspace=0.28)
ax_sc, ax_bar = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

ax_sc.axhline(0.0, color='#64748B', linewidth=1.0)
ax_sc.axhline(clean_est, color=PRIMARY, linestyle='--', linewidth=1.5, label=f'干净对照均值 = {clean_est:+.3f}')
ax_sc.axhline(twfe_est, color='#1E293B', linestyle=':', linewidth=1.6, label=f'TWFE 汇总值 = {twfe_est:+.3f}')
plotted = set()
for w, b, g in pairs:
    col, mk = styles[g]
    lbl = g if g not in plotted else None
    plotted.add(g)
    ax_sc.scatter([w], [b], s=95, color=col, marker=mk, edgecolor='#FFFFFF', linewidth=0.9, zorder=5, label=lbl)
ax_sc.set_xlim(0.04, 0.26)
ax_sc.set_ylim(-0.24, 0.58)
ax_sc.set_xlabel('Goodman-Bacon 2x2 权重 w_k (合计 = 1.00)')
ax_sc.set_ylabel('2x2 DID 估计值 beta_k')
ax_sc.set_title('2x2 子比较组权重与估计值散点分布', fontsize=10.5, fontweight='bold')
ax_sc.legend(frameon=False, loc='lower right', fontsize=7.8)

grp_names = list(styles.keys())
grp_w = [sum(w for w, _, g in pairs if g == gn) * 100.0 for gn in grp_names]
grp_b = [sum(w * b for w, b, g in pairs if g == gn) / sum(w for w, _, g in pairs if g == gn) for gn in grp_names]
y_idx = np.arange(len(grp_names))[::-1]
cols = [styles[gn][0] for gn in grp_names]
ax_bar.barh(y_idx, grp_w, height=0.52, color=cols, alpha=0.82)
for yi, wv, bv, col in zip(y_idx, grp_w, grp_b, cols):
    ax_bar.text(wv + 1.0, yi, f'{wv:.0f}% (均值 {bv:+.2f})', va='center', fontsize=8.4, fontweight='bold', color=col)
ax_bar.set_yticks(y_idx)
ax_bar.set_yticklabels(['早 vs 从未', '晚 vs 从未', '早 vs 晚未', '晚 vs 早(禁忌)'])
ax_bar.set_xlim(0.0, 62.0)
ax_bar.set_xlabel('类别汇总权重占比 (%)')
ax_bar.set_title('四类比较组权重占比与平均估计值', fontsize=10.5, fontweight='bold')

for target_ax in (ax_sc, ax_bar):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.07, right=0.97, bottom=0.14, top=0.84)
`,
  },

  ab_sequential_pvalue: {
    mode: 'custom',
    imports: ['import math', 'from matplotlib.gridspec import GridSpec'],
    body: `
# 使用 O'Brien-Fleming (OBF) 序贯 alpha 消耗函数计算中期检视界值
t_frac = np.array([0.20, 0.35, 0.50, 0.65, 0.80, 1.00])
alpha_total = 0.05
norm_cdf = np.vectorize(lambda z: 0.5 * (1.0 + math.erf(z / math.sqrt(2.0))))
z_crit_final = 1.959964
# OBF 近似消耗界: 2 * (1 - Phi(z_{alpha/2} / sqrt(t)))
z_obf = z_crit_final / np.sqrt(t_frac)
cum_spend = 2.0 * (1.0 - norm_cdf(z_obf))
cum_spend[-1] = alpha_total
# 将单步离散递增界限调整为递增 p 值停试门限
p_obf_bound = np.array([0.0008, 0.0052, 0.0138, 0.0235, 0.0338, 0.0442])
p_observed = np.array([0.0920, 0.0640, 0.0340, 0.0125, 0.0068, 0.0031])

fig = plt.figure(figsize=(9.2, 5.4), dpi=180)
gs = GridSpec(2, 1, height_ratios=[1.55, 1.0], hspace=0.20)
ax_p = fig.add_subplot(gs[0])
ax_a = fig.add_subplot(gs[1], sharex=ax_p)

ax_p.axhline(0.05, color='#94A3B8', linestyle=':', linewidth=1.4, label='固定阈值 p = 0.05 (频繁偷看假阳性陷阱)')
ax_p.plot(t_frac * 100, p_obf_bound, color=OPPOSITE, linestyle='--', marker='^', markersize=5.5, linewidth=1.8,
          label="O'Brien-Fleming 动态 alpha 消耗边界")
ax_p.plot(t_frac * 100, p_observed, color=PRIMARY, marker='o', markersize=6.5, linewidth=2.3, label='实验组实时观测 p 值')
hit_idx = int(np.where(p_observed < p_obf_bound)[0][0])
ax_p.scatter([t_frac[hit_idx] * 100], [p_observed[hit_idx]], s=130, facecolor='none', edgecolor=OPPOSITE, linewidth=2.2, zorder=6)
ax_p.annotate(f't={t_frac[hit_idx]*100:.0f}% 越界提前停试\\np={p_observed[hit_idx]:.4f} < {p_obf_bound[hit_idx]:.4f}',
              xy=(t_frac[hit_idx] * 100, p_observed[hit_idx]),
              xytext=(t_frac[hit_idx] * 100 + 8, p_observed[hit_idx] + 0.028),
              arrowprops=dict(arrowstyle='->', color=OPPOSITE, lw=1.3),
              fontsize=8.5, fontweight='bold', color=OPPOSITE)
ax_p.set_ylabel('双侧检视 p 值')
ax_p.set_ylim(-0.004, 0.110)
ax_p.set_title('实时显著性轨迹与动态序贯停试门限', fontsize=10.5, fontweight='bold')
ax_p.legend(frameon=False, loc='upper right', fontsize=8.2)
ax_p.tick_params(labelbottom=False)

ax_a.axhline(alpha_total, color=OPPOSITE, linestyle='--', linewidth=1.2, label='总 I 类错误预算 alpha = 0.050')
ax_a.fill_between(t_frac * 100, 0.0, cum_spend, color=SECONDARY, alpha=0.22)
ax_a.plot(t_frac * 100, cum_spend, color=SECONDARY, marker='s', markersize=5, linewidth=2.0, label='累积已消耗 alpha_t')
ax_a.axvline(t_frac[hit_idx] * 100, color=OPPOSITE, linestyle=':', linewidth=1.2)
ax_p.axvline(t_frac[hit_idx] * 100, color=OPPOSITE, linestyle=':', linewidth=1.2)
ax_a.set_xlabel('序贯实验样本信息量进度 n / N_max (%)')
ax_a.set_ylabel('累积消耗 alpha')
ax_a.set_ylim(0.0, 0.062)
ax_a.legend(frameon=False, loc='upper left', fontsize=8.2)

for target_ax in (ax_p, ax_a):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.09, right=0.96, bottom=0.11, top=0.87)
`,
  },

  mediation_sem_path: {
    mode: 'custom',
    body: `
# 生成含潜变量观测题项、调节交互项 X*W 与误差残差的结构方程模拟样本
n = 480
X_lat = rng.normal(0.0, 1.0, n)
W_lat = 0.30 * X_lat + rng.normal(0.0, 0.95, n)
XW = X_lat * W_lat
M_lat = 0.48 * X_lat + 0.25 * W_lat + 0.19 * XW + rng.normal(0.0, 0.72, n)
Y_lat = 0.21 * X_lat + 0.44 * M_lat + rng.normal(0.0, 0.64, n)

def std_z(v):
    return (v - np.mean(v)) / np.std(v, ddof=1)

Xz, Wz, Mz, Yz = std_z(X_lat), std_z(W_lat), std_z(M_lat), std_z(Y_lat)
XWz = std_z(Xz * Wz)
x1 = 0.83 * Xz + rng.normal(0, 0.55, n)
x2 = 0.86 * Xz + rng.normal(0, 0.50, n)
m1 = 0.80 * Mz + rng.normal(0, 0.59, n)
m2 = 0.85 * Mz + rng.normal(0, 0.52, n)
y1 = 0.84 * Yz + rng.normal(0, 0.54, n)
y2 = 0.88 * Yz + rng.normal(0, 0.47, n)

lam = [float(np.corrcoef(Xz, x1)[0, 1]), float(np.corrcoef(Xz, x2)[0, 1]),
       float(np.corrcoef(Mz, m1)[0, 1]), float(np.corrcoef(Mz, m2)[0, 1]),
       float(np.corrcoef(Yz, y1)[0, 1]), float(np.corrcoef(Yz, y2)[0, 1])]

Xm = np.column_stack([np.ones(n), Xz, Wz, XWz])
b_m = np.linalg.lstsq(Xm, Mz, rcond=None)[0]
r2_m = 1.0 - float(np.var(Mz - Xm @ b_m) / np.var(Mz))
Xy = np.column_stack([np.ones(n), Xz, Mz])
b_y = np.linalg.lstsq(Xy, Yz, rcond=None)[0]
r2_y = 1.0 - float(np.var(Yz - Xy @ b_y) / np.var(Yz))

a1, a2, a3 = float(b_m[1]), float(b_m[2]), float(b_m[3])
c_prime, b_path = float(b_y[1]), float(b_y[2])
zeta_m, zeta_y = 1.0 - r2_m, 1.0 - r2_y
imm = a3 * b_path

fig, ax = plt.subplots(figsize=(10.2, 5.4), dpi=180)
ax.set_xlim(0, 10)
ax.set_ylim(0, 6.2)
ax.axis('off')

def draw_latent(cx, cy, lbl, col, bg):
    ell = mpatches.Ellipse((cx, cy), width=1.65, height=0.82, facecolor=bg, edgecolor=col, linewidth=1.8, zorder=3)
    ax.add_patch(ell)
    ax.text(cx, cy, lbl, ha='center', va='center', fontsize=9.5, fontweight='bold', color=col, zorder=4)

def draw_obs(cx, cy, lbl):
    box = mpatches.FancyBboxPatch((cx - 0.36, cy - 0.22), 0.72, 0.44, boxstyle='round,pad=0.04',
                                  facecolor='#FFFFFF', edgecolor='#475569', linewidth=1.1, zorder=3)
    ax.add_patch(box)
    ax.text(cx, cy, lbl, ha='center', va='center', fontsize=8.5, fontweight='bold', color='#1E293B', zorder=4)

def draw_err(cx, cy, lbl):
    circ = mpatches.Circle((cx, cy), radius=0.22, facecolor='#FFFFFF', edgecolor='#94A3B8', linewidth=1.0, zorder=3)
    ax.add_patch(circ)
    ax.text(cx, cy, lbl, ha='center', va='center', fontsize=7.8, color='#475569', zorder=4)

def draw_arrow(p0, p1, col, lw=1.6, ls='-', lbl='', lbl_off=(0.0, 0.14)):
    ax.annotate('', xy=p1, xytext=p0,
                arrowprops=dict(arrowstyle='->', color=col, lw=lw, linestyle=ls, shrinkA=2, shrinkB=2), zorder=2)
    if lbl:
        mx, my = 0.5 * (p0[0] + p1[0]) + lbl_off[0], 0.5 * (p0[1] + p1[1]) + lbl_off[1]
        ax.text(mx, my, lbl, ha='center', va='center', fontsize=8.4, fontweight='bold', color=col,
                bbox=dict(boxstyle='round,pad=0.14', facecolor='#FFFFFF', edgecolor='none', alpha=0.88), zorder=5)

draw_latent(2.6, 3.0, 'X 感知质量', SECONDARY, '#EFF6FF')
draw_latent(4.6, 5.1, 'W 制度信任', '#0D9488', '#F0FDFA')
xw_box = mpatches.FancyBboxPatch((3.75, 3.82), 1.70, 0.54, boxstyle='round,pad=0.06',
                                 facecolor='#FFF7ED', edgecolor=OPPOSITE, linestyle='--', linewidth=1.4, zorder=3)
ax.add_patch(xw_box)
ax.text(4.6, 4.09, 'X * W 交互项', ha='center', va='center', fontsize=8.8, fontweight='bold', color=OPPOSITE, zorder=4)
draw_latent(5.9, 2.2, 'M 平台认同', PRIMARY, '#F0FDFA')
draw_latent(8.2, 3.0, 'Y 持续意愿', OPPOSITE, '#FFF7ED')

obs_specs = [
    ((0.95, 3.75), (0.32, 3.75), (1.85, 3.22), 'x1', 'd1', lam[0], SECONDARY),
    ((0.95, 2.25), (0.32, 2.25), (1.85, 2.78), 'x2', 'd2', lam[1], SECONDARY),
    ((5.15, 0.85), (4.45, 0.85), (5.55, 1.82), 'm1', 'e1', lam[2], PRIMARY),
    ((6.65, 0.85), (7.35, 0.85), (6.25, 1.82), 'm2', 'e2', lam[3], PRIMARY),
    ((9.45, 3.75), (9.45, 4.45), (8.95, 3.22), 'y1', 'e3', lam[4], OPPOSITE),
    ((9.45, 2.25), (9.45, 1.55), (8.95, 2.78), 'y2', 'e4', lam[5], OPPOSITE),
]
for op, ep, lp, o_lbl, e_lbl, l_val, col in obs_specs:
    draw_obs(op[0], op[1], o_lbl)
    draw_err(ep[0], ep[1], e_lbl)
    draw_arrow(ep, op, '#94A3B8', lw=1.0)
    draw_arrow(lp, op, col, lw=1.2, lbl=f'{l_val:.2f}', lbl_off=(0.0, 0.14))

draw_err(7.1, 1.45, 'z1')
draw_arrow((6.92, 1.56), (6.52, 1.92), '#64748B', lw=1.2, lbl=f'残差 {zeta_m:.2f}', lbl_off=(0.35, -0.10))
draw_err(8.2, 4.45, 'z2')
draw_arrow((8.2, 4.22), (8.2, 3.44), '#64748B', lw=1.2, lbl=f'残差 {zeta_y:.2f}', lbl_off=(0.45, 0.0))

ax.annotate('', xy=(3.82, 5.05), xytext=(2.6, 3.42),
            arrowprops=dict(arrowstyle='<->', color='#64748B', lw=1.2, linestyle='--', connectionstyle='arc3,rad=-0.25'))
ax.text(2.85, 4.55, f'r = {float(np.corrcoef(Xz, Wz)[0, 1]):.2f}', fontsize=8.2, color='#475569')

draw_arrow((3.40, 2.82), (5.12, 2.34), PRIMARY, lw=2.2, lbl=f'a1 = {a1:.2f}***', lbl_off=(-0.15, -0.22))
draw_arrow((5.32, 4.82), (5.92, 2.62), '#0D9488', lw=1.6, lbl=f'a2 = {a2:.2f}**', lbl_off=(0.38, 0.15))
draw_arrow((4.95, 3.80), (5.68, 2.58), OPPOSITE, lw=2.1, lbl=f'a3(X*W) = {a3:.2f}**', lbl_off=(-0.48, 0.08))
draw_arrow((6.68, 2.34), (7.42, 2.82), PRIMARY, lw=2.2, lbl=f'b = {b_path:.2f}***', lbl_off=(0.15, -0.22))
draw_arrow((3.44, 3.00), (7.35, 3.00), '#334155', lw=1.4, ls='--', lbl=f"c' = {c_prime:.2f}*", lbl_off=(0.75, 0.16))

ax.text(5.0, 0.18,
        f'有调节中介指数 IMM = a3 * b = {imm:.3f}  |  R^2(M) = {r2_m:.2f}, R^2(Y) = {r2_y:.2f}  |  结构拟合参照: CFI=0.962, RMSEA=0.044',
        ha='center', va='center', fontsize=8.8, fontweight='bold', color=PRIMARY,
        bbox=dict(boxstyle='round,pad=0.32', facecolor='#F8FAFC', edgecolor=PRIMARY, linewidth=1.1))
ax.set_title(TITLE, fontsize=12.0, fontweight='bold', pad=8)
fig.tight_layout()
`,
  },

  moderated_slopes_jn: {
    mode: 'custom',
    imports: ['import math', 'from matplotlib.gridspec import GridSpec'],
    body: `
n = 420
X = rng.normal(0.0, 1.0, n)
W = rng.normal(0.15, 0.95, n)
Y = 3.20 + 0.28 * X + 0.18 * W + 0.25 * (X * W) + rng.normal(0.0, 0.58, n)

X_des = np.column_stack([np.ones(n), X, W, X * W])
beta_hat, _, _, _ = np.linalg.lstsq(X_des, Y, rcond=None)
resid = Y - X_des @ beta_hat
s2 = float(np.sum(resid ** 2) / (n - X_des.shape[1]))
cov_mat = s2 * np.linalg.inv(X_des.T @ X_des)

b1, b3 = float(beta_hat[1]), float(beta_hat[3])
v11, v33, v13 = float(cov_mat[1, 1]), float(cov_mat[3, 3]), float(cov_mat[1, 3])
t_crit = 1.9657  # df = 416 双侧 alpha = 0.05

w_grid = np.linspace(float(W.min()), float(W.max()), 240)
theta_w = b1 + b3 * w_grid
se_w = np.sqrt(np.maximum(1e-12, v11 + 2.0 * w_grid * v13 + (w_grid ** 2) * v33))
ci_lo = theta_w - t_crit * se_w
ci_hi = theta_w + t_crit * se_w

# 解析求解 Johnson-Neyman 临界边界根: (b1 + b3*w)^2 = t_crit^2 * (v11 + 2*v13*w + v33*w^2)
A_jn = b3 ** 2 - (t_crit ** 2) * v33
B_jn = 2.0 * (b1 * b3 - (t_crit ** 2) * v13)
C_jn = b1 ** 2 - (t_crit ** 2) * v11
disc = max(0.0, B_jn ** 2 - 4.0 * A_jn * C_jn)
roots = [(-B_jn - math.sqrt(disc)) / (2.0 * A_jn), (-B_jn + math.sqrt(disc)) / (2.0 * A_jn)]
w_star = min(roots, key=lambda r: abs(b1 + b3 * r))
pct_sig = float(np.mean(W >= w_star) * 100.0)

fig = plt.figure(figsize=(8.8, 5.6), dpi=180)
gs = GridSpec(2, 1, height_ratios=[3.6, 1.0], hspace=0.12)
ax_jn = fig.add_subplot(gs[0])
ax_h = fig.add_subplot(gs[1], sharex=ax_jn)

sig_mask = ci_lo > 0.0
ns_mask = ~sig_mask
ax_jn.axvspan(w_grid.min(), w_star, color='#CBD5E1', alpha=0.22, label='不显著区 (95% CI 含 0)')
ax_jn.axvspan(w_star, w_grid.max(), color=PRIMARY, alpha=0.11, label=f'显著正向调节区 ({pct_sig:.1f}% 样本)')
ax_jn.fill_between(w_grid, ci_lo, ci_hi, where=sig_mask, color=PRIMARY, alpha=0.28)
ax_jn.fill_between(w_grid, ci_lo, ci_hi, where=ns_mask, color='#94A3B8', alpha=0.26)
ax_jn.plot(w_grid[sig_mask], theta_w[sig_mask], color=PRIMARY, linewidth=2.4, label='条件边际斜率 theta(W) (p < 0.05)')
ax_jn.plot(w_grid[ns_mask], theta_w[ns_mask], color='#64748B', linestyle='--', linewidth=2.0)
ax_jn.plot(w_grid, ci_lo, color=PRIMARY, linestyle=':', linewidth=1.1)
ax_jn.plot(w_grid, ci_hi, color=PRIMARY, linestyle=':', linewidth=1.1)
ax_jn.axhline(0.0, color='#334155', linestyle='--', linewidth=1.1)
ax_jn.axvline(w_star, color=OPPOSITE, linestyle='--', linewidth=1.6, label=f'J-N 临界阈值 W* = {w_star:.2f}')
ax_jn.scatter([w_star], [0.0], s=68, color=OPPOSITE, edgecolor='#FFFFFF', linewidth=1.2, zorder=6)
ax_jn.set_ylabel('X 对 Y 的条件边际斜率 theta(W)')
ax_jn.legend(frameon=False, loc='upper left', fontsize=8.4)
plt.setp(ax_jn.get_xticklabels(), visible=False)

counts, edges, patches = ax_h.hist(W, bins=24, edgecolor='#FFFFFF', linewidth=0.6)
for patch, le, re in zip(patches, edges[:-1], edges[1:]):
    patch.set_facecolor(SECONDARY if 0.5 * (le + re) >= w_star else '#94A3B8')
    patch.set_alpha(0.75 if 0.5 * (le + re) >= w_star else 0.50)
ax_h.axvline(w_star, color=OPPOSITE, linestyle='--', linewidth=1.5)
ax_h.set_xlabel('调节变量 W 实测取值范围 (附底部观测分布密度)')
ax_h.set_ylabel('样本频数')

for target_ax in (ax_jn, ax_h):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.10, right=0.96, bottom=0.12, top=0.88)
`,
  },

  panel_fe_event_window: {
    body: `
# 构造 N=80 个体 x T=11 期 (k=-5..+5) 平衡面板并执行双向固定效应 TWFE + 个体聚类稳健方差估计
N, T = 80, 11
ks = np.arange(-5, 6)
treated = np.zeros(N)
treated[:40] = 1.0
true_att = np.array([0.0, 0.0, 0.0, 0.0, 0.0, 0.20, 0.34, 0.45, 0.50, 0.52, 0.49])

unit_fe = rng.normal(0.0, 0.8, N)[:, None]
time_fe = np.linspace(-0.2, 0.3, T)[None, :]
err = rng.normal(0.0, 0.34, (N, T))
Y = 2.5 + unit_fe + time_fe + (treated[:, None] * true_att[None, :]) + err

event_ks = [k for k in ks if k != -1]
K = len(event_ks)
X_raw = np.zeros((N, T, K))
for j, k_val in enumerate(event_ks):
    t_idx = k_val + 5
    X_raw[:, t_idx, j] = treated

# 双向固定效应组内离差变换 (Two-Way Within Transformation)
Y_dm = Y - Y.mean(axis=1, keepdims=True) - Y.mean(axis=0, keepdims=True) + Y.mean()
X_dm = X_raw - X_raw.mean(axis=1, keepdims=True) - X_raw.mean(axis=0, keepdims=True) + X_raw.mean(axis=(0, 1), keepdims=True)

X_flat = X_dm.reshape(N * T, K)
Y_flat = Y_dm.reshape(N * T)
XtX_inv = np.linalg.inv(X_flat.T @ X_flat)
beta_hat = XtX_inv @ (X_flat.T @ Y_flat)
u_mat = (Y_flat - X_flat @ beta_hat).reshape(N, T)

# 个体聚类稳健三明治协方差矩阵 (Cluster-Robust Sandwich Variance)
meat = np.zeros((K, K))
for i in range(N):
    score_i = X_dm[i].T @ u_mat[i]
    meat += np.outer(score_i, score_i)
dof_corr = (N / (N - 1.0)) * ((N * T - 1.0) / (N * T - N - T - K))
V_cluster = dof_corr * (XtX_inv @ meat @ XtX_inv)
se_hat = np.sqrt(np.diag(V_cluster))

# 前驱平行趋势联合 Wald F 检验 (k = -5, -4, -3, -2)
pre_idx = [0, 1, 2, 3]
b_pre = beta_hat[pre_idx]
V_pre = V_cluster[np.ix_(pre_idx, pre_idx)]
wald_f = float((b_pre.T @ np.linalg.inv(V_pre) @ b_pre) / len(pre_idx))

betas_full = np.insert(beta_hat, 4, 0.0)
ses_full = np.insert(se_hat, 4, 0.0)
sa_iw = betas_full + np.array([0.01, -0.01, 0.01, -0.01, 0.0, 0.02, 0.02, 0.03, 0.02, 0.02, 0.03])

ax.axvspan(-5.4, -0.5, color=SECONDARY, alpha=0.07, label='前驱平行校验窗 [-5, -1]')
ax.axvspan(-0.5, 5.4, color=PRIMARY, alpha=0.07, label='政策后动态窗口 [0, +5]')
ax.axhline(0.0, color='#475569', linestyle='--', linewidth=1.1)
ax.axvline(-0.5, color=OPPOSITE, linestyle='--', linewidth=1.4, label='政策实施冲击线')

ax.plot(ks, betas_full, color=PRIMARY, linewidth=1.5, alpha=0.75)
for k, b, s in zip(ks, betas_full, ses_full):
    col = PRIMARY if k >= 0 else SECONDARY
    if k != -1:
        ax.errorbar(k, b, yerr=1.96 * s, fmt='none', ecolor=col, elinewidth=1.2, capsize=3.5, zorder=3)
        ax.plot([k, k], [b - 1.645 * s, b + 1.645 * s], color=col, linewidth=3.0, zorder=4)
    ax.scatter([k], [b], s=58, color='#FFFFFF' if k == -1 else col, edgecolor=col, linewidth=1.6, zorder=5)
ax.scatter(ks + 0.16, sa_iw, s=36, marker='D', facecolor='#FFFFFF', edgecolor=OPPOSITE, linewidth=1.2,
           zorder=5, label='Sun-Abraham IW 稳健对照')

ax.errorbar([], [], yerr=[], color=PRIMARY, elinewidth=1.2, capsize=3.5, label='TWFE 点估计 (90% 粗 / 95% 细 CI)')
ax.text(-4.9, 0.62, f'前驱联合检验 F({len(pre_idx)}, {N - 1}) = {wald_f:.2f}\\n基期 t = -1 归一化归零',
        fontsize=8.6, fontweight='bold', color=SECONDARY,
        bbox=dict(boxstyle='round,pad=0.3', facecolor='#FFFFFF', edgecolor=SECONDARY, alpha=0.9))
ax.set_xticks(ks)
ax.set_xticklabels([f'+{k}' if k > 0 else f'{k} (Ref)' if k == -1 else str(k) for k in ks], fontsize=8.5)
ax.set_xlim(-5.5, 5.5)
ax.set_ylim(-0.35, 0.78)
ax.set_xlabel('相对政策冲击事件研究窗 k (个体聚类稳健标准误)')
ax.set_ylabel('动态处理效应估计系数 beta_k')
`,
  },

  qca_xy_necessity: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
# 生成 42 个跨案例模糊集隶属度 (X: 组态条件隶属度, Y: 高绩效结果隶属度)
typ_x = np.array([0.82, 0.76, 0.90, 0.68, 0.62, 0.85, 0.56, 0.72, 0.78, 0.66, 0.88, 0.74, 0.60, 0.80, 0.69, 0.92])
typ_y = np.clip(typ_x + rng.uniform(0.02, 0.16, len(typ_x)), 0.54, 0.98)
alt_x = np.array([0.24, 0.32, 0.18, 0.42, 0.36, 0.28, 0.45, 0.20])
alt_y = np.array([0.78, 0.84, 0.66, 0.74, 0.80, 0.62, 0.71, 0.58])
con_x = np.array([0.72, 0.64])
con_y = np.array([0.34, 0.42])
low_x = np.array([0.14, 0.22, 0.35, 0.28, 0.44, 0.16, 0.31, 0.39, 0.12, 0.25, 0.40, 0.19, 0.33, 0.47, 0.21, 0.37])
low_y = np.clip(low_x + rng.uniform(-0.08, 0.12, len(low_x)), 0.08, 0.47)

X_all = np.concatenate([typ_x, alt_x, con_x, low_x])
Y_all = np.concatenate([typ_y, alt_y, con_y, low_y])

inter_xy = np.sum(np.minimum(X_all, Y_all))
inter_xy_noty = np.sum(np.minimum(np.minimum(X_all, Y_all), 1.0 - Y_all))
consistency = float(inter_xy / np.sum(X_all))
coverage = float(inter_xy / np.sum(Y_all))
pri = float((inter_xy - inter_xy_noty) / max(1e-9, float(np.sum(X_all)) - inter_xy_noty))
cons_nec = float(np.sum(np.minimum(np.clip(Y_all + 0.06, 0.0, 1.0), Y_all)) / np.sum(Y_all))

fig = plt.figure(figsize=(10.2, 4.9), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.15, 1.0], wspace=0.28)
ax_xy, ax_bar = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

ax_xy.fill([0, 1, 0], [0, 1, 1], color=PRIMARY, alpha=0.09, label='充分性三角域 (Y >= X)')
ax_xy.plot([0, 1], [0, 1], color=PRIMARY, linewidth=1.6)
ax_xy.axhline(0.5, color='#475569', linestyle='--', linewidth=1.0)
ax_xy.axvline(0.5, color='#475569', linestyle='--', linewidth=1.0)

ax_xy.scatter(low_x, low_y, s=36, color='#94A3B8', alpha=0.72, label='低隶属无关区')
ax_xy.scatter(alt_x, alt_y, s=48, color=SECONDARY, alpha=0.85, label='等效替代路径区')
ax_xy.scatter(typ_x, typ_y, s=56, color=PRIMARY, edgecolor='#FFFFFF', linewidth=0.8, zorder=4, label='典型一致案例 (X>0.5, Y>=X)')
ax_xy.scatter(con_x, con_y, s=82, facecolor='#FFFFFF', edgecolor=OPPOSITE, linewidth=2.0, zorder=5, label='逻辑矛盾案例 (X>0.5, Y<0.5)')
ax_xy.text(0.75, 0.16, f'逻辑矛盾区\\n占比 {len(con_x)}/{len(X_all)} ({len(con_x)/len(X_all)*100:.1f}%)',
           ha='center', va='center', fontsize=8.4, fontweight='bold', color=OPPOSITE)
ax_xy.set_xlim(0.0, 1.02)
ax_xy.set_ylim(0.0, 1.02)
ax_xy.set_aspect('equal')
ax_xy.set_xlabel('组态条件 H1 模糊集隶属度 (X)')
ax_xy.set_ylabel('高绩效结果集合隶属度 (Y)')
ax_xy.set_title('fsQCA 模糊集 XY 子集关系散点', fontsize=10.5, fontweight='bold')
ax_xy.legend(frameon=False, loc='upper left', fontsize=7.6)

m_labels = ['充分一致性 (Cons)', '非对称 PRI 指标', '原始覆盖度 (Raw Cov)', '唯一覆盖度 (Unique)', '必要性检验 (Cons_nec)']
m_vals = [consistency, pri, coverage, 0.215, cons_nec]
m_cols = [PRIMARY, PRIMARY, SECONDARY, '#0D9488', SECONDARY]
y_pos = np.arange(len(m_labels))[::-1]
ax_bar.axvline(0.80, color=OPPOSITE, linestyle='--', linewidth=1.3, label='充分性门槛 0.80')
ax_bar.axvline(0.90, color='#475569', linestyle=':', linewidth=1.3, label='必要性门槛 0.90')
ax_bar.barh(y_pos, m_vals, height=0.52, color=m_cols, alpha=0.84)
for yi, val, col in zip(y_pos, m_vals, m_cols):
    ax_bar.text(val + 0.02, yi, f'{val:.3f}', va='center', fontsize=8.8, fontweight='bold', color=col)
ax_bar.set_yticks(y_pos)
ax_bar.set_yticklabels(m_labels, fontsize=8.6)
ax_bar.set_xlim(0.0, 1.08)
ax_bar.set_xlabel('fsQCA 集合论检验指标值')
ax_bar.set_title('组态 H1 一致性—PRI—覆盖度评估', fontsize=10.5, fontweight='bold')
ax_bar.legend(frameon=False, loc='lower right', fontsize=8.0)

for target_ax in (ax_xy, ax_bar):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.07, right=0.97, bottom=0.13, top=0.84)
`,
  },

  counterfactual_synthetic_ctrl: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
# 概率单形投影梯度下降求解合成控制 SCM 非负凸权重 (w >= 0, sum(w) = 1)
def project_simplex(v):
    u = np.sort(v)[::-1]
    cssv = np.cumsum(u) - 1.0
    ind = np.arange(1, len(v) + 1)
    cond = u - cssv / ind > 0
    rho = ind[cond][-1]
    theta = cssv[cond][-1] / float(rho)
    return np.maximum(v - theta, 0.0)

def fit_scm(y_target_pre, Y_donors_pre, steps=350, lr=0.05):
    w = np.full(Y_donors_pre.shape[1], 1.0 / Y_donors_pre.shape[1])
    for _ in range(steps):
        grad = 2.0 * Y_donors_pre.T @ (Y_donors_pre @ w - y_target_pre) / len(y_target_pre)
        w = project_simplex(w - lr * grad)
    return w

T_total, T_pre, J = 10, 5, 20
years = np.arange(2016, 2026)
factors = np.column_stack([np.linspace(3.1, 3.8, T_total), np.sin(np.linspace(0, 2.2, T_total)) * 0.14])
loadings = rng.uniform(0.75, 1.25, (J, 2))
Y_donors = loadings @ factors.T + rng.normal(0.0, 0.035, (J, T_total))
true_w = np.zeros(J)
true_w[:4] = [0.40, 0.25, 0.20, 0.15]
y_treat = (true_w @ Y_donors) + rng.normal(0.0, 0.020, T_total)
y_treat[T_pre:] += np.array([0.16, 0.33, 0.49, 0.60, 0.69])

w_treat = fit_scm(y_treat[:T_pre], Y_donors[:, :T_pre].T)
y_synth = w_treat @ Y_donors
pre_rmspe_t = float(np.sqrt(np.mean((y_treat[:T_pre] - y_synth[:T_pre]) ** 2)))
post_rmspe_t = float(np.sqrt(np.mean((y_treat[T_pre:] - y_synth[T_pre:]) ** 2)))
ratio_treat = post_rmspe_t / max(pre_rmspe_t, 1e-6)

# 捐赠池空间安慰剂循环求解 Post/Pre RMSPE 比值分布
ratios = [('实际试点区', ratio_treat, True)]
for j in range(J):
    mask = np.arange(J) != j
    wj = fit_scm(Y_donors[j, :T_pre], Y_donors[mask, :T_pre].T)
    yj_synth = wj @ Y_donors[mask]
    pre_j = float(np.sqrt(np.mean((Y_donors[j, :T_pre] - yj_synth[:T_pre]) ** 2)))
    post_j = float(np.sqrt(np.mean((Y_donors[j, T_pre:] - yj_synth[T_pre:]) ** 2)))
    ratios.append((f'对照 #{j + 1}', post_j / max(pre_j, 1e-6), False))

ratios.sort(key=lambda item: item[1], reverse=True)
rank_treat = next(idx + 1 for idx, item in enumerate(ratios) if item[2])
perm_p = rank_treat / len(ratios)
top_show = ratios[:10][::-1]

fig = plt.figure(figsize=(10.4, 4.8), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.25, 1.0], wspace=0.28)
ax_traj, ax_rank = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

ax_traj.axvline(2020.5, color='#475569', linestyle='--', linewidth=1.3, label='政策干预节点')
ax_traj.fill_between(years, y_synth, y_treat, where=(years >= 2021), color=PRIMARY, alpha=0.22, label='净处理效应 Gap')
ax_traj.plot(years, y_synth, color=OPPOSITE, linestyle='--', marker='s', markersize=4.5, linewidth=2.0, label='反事实合成控制组')
ax_traj.plot(years, y_treat, color=PRIMARY, marker='o', markersize=5.0, linewidth=2.3, label='实际试点区')
ax_traj.text(2016.2, float(y_treat.max()) - 0.12, f'Pre-RMSPE = {pre_rmspe_t:.3f}', fontsize=8.6, fontweight='bold', color=SECONDARY,
             bbox=dict(boxstyle='round,pad=0.28', facecolor='#FFFFFF', edgecolor=SECONDARY, alpha=0.9))
ax_traj.set_xlabel('观测年份')
ax_traj.set_ylabel('目标评估指数')
ax_traj.set_title('凸组合反事实轨迹贴合对比', fontsize=10.5, fontweight='bold')
ax_traj.legend(frameon=False, loc='lower right', fontsize=8.0)

y_idx = np.arange(len(top_show))
cols_r = [PRIMARY if item[2] else '#CBD5E1' for item in top_show]
vals_r = [item[1] for item in top_show]
ax_rank.barh(y_idx, vals_r, height=0.58, color=cols_r, edgecolor=[PRIMARY if item[2] else '#94A3B8' for item in top_show], linewidth=1.0)
for yi, (lbl, rv, is_t) in enumerate(top_show):
    ax_rank.text(rv + 0.25, yi, f'{rv:.1f}x', va='center', fontsize=8.4,
                 fontweight='bold' if is_t else 'normal', color=PRIMARY if is_t else '#475569')
ax_rank.set_yticks(y_idx)
ax_rank.set_yticklabels([item[0] for item in top_show], fontsize=8.4)
ax_rank.set_xlim(0.0, max(vals_r) * 1.24)
ax_rank.set_xlabel('Post / Pre RMSPE 比值')
ax_rank.set_title(f'安慰剂 RMSPE 比置换排序 (Rank {rank_treat}/{len(ratios)}, p={perm_p:.3f})', fontsize=10.2, fontweight='bold')

for target_ax in (ax_traj, ax_rank):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.07, right=0.97, bottom=0.14, top=0.84)
`,
  },

  // -------------------------------------------------------------------------
  // 6. 机器学习与可解释 (ml_explainability) — 24
  // -------------------------------------------------------------------------
  shap_beeswarm: {
    body: `
feats = ['响应时效', '隐性收费', '熟人推荐', '适老界面', '网点距离', '数字素养']
y_pos = np.arange(len(feats))[::-1]
cmap = mcolors.LinearSegmentedColormap.from_list('shap', [SECONDARY, '#E2E8F0', OPPOSITE])

ax.axvline(0, color='#475569', linewidth=1.1)
for yi, spread in zip(y_pos, [0.42, 0.34, 0.28, 0.22, 0.18, 0.14]):
    f_val = rng.uniform(0, 1, 120)
    shap_v = (f_val - 0.5) * 2 * spread + rng.normal(0, 0.06, 120)
    jitter = rng.normal(0, 0.11, 120)
    sc = ax.scatter(shap_v, yi + jitter, c=f_val, cmap=cmap, s=22, alpha=0.72)
plt.colorbar(sc, ax=ax, fraction=0.04, pad=0.03, label='特征取值 (低 → 高)')
ax.scatter([], [], s=45, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='SHAP 边际归因分布')
ax.set_yticks(y_pos)
ax.set_yticklabels(feats)
ax.set_xlabel('SHAP 值 (对预测概率对数优势的贡献)')
`,
  },

  shap_composite: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
feats = ['响应时效', '隐性收费', '熟人推荐', '适老界面', '网点距离']
mean_abs = np.array([0.284, 0.212, 0.167, 0.132, 0.094])
y = np.arange(len(feats))[::-1]
cmap = mcolors.LinearSegmentedColormap.from_list('shap_c', [SECONDARY, '#CBD5E1', OPPOSITE])

fig = plt.figure(figsize=(9.2, 5.2), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1, 1.35], wspace=0.18)
ax_l, ax_r = fig.add_subplot(gs[0]), fig.add_subplot(gs[1], sharey=None)

ax_l.barh(y, mean_abs, height=0.56, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='Mean |SHAP|')
ax_l.set_yticks(y)
ax_l.set_yticklabels(feats)
ax_l.set_xlabel('平均绝对贡献 Mean(|SHAP|)')
ax_l.legend(frameon=False, loc='lower right')

ax_r.axvline(0, color='#475569', linewidth=1.0)
for yi, sp in zip(y, mean_abs * 1.4):
    fv = rng.uniform(0, 1, 100)
    sv = (fv - 0.5) * 2 * sp + rng.normal(0, 0.04, 100)
    ax_r.scatter(sv, yi + rng.normal(0, 0.10, 100), c=fv, cmap=cmap, s=20, alpha=0.75)
ax_r.set_yticks(y)
ax_r.set_yticklabels([])
ax_r.set_xlabel('SHAP 归因方向蜂群')
for target_ax in (ax_l, ax_r):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.5, fontweight='bold', y=0.98)
`,
  },

  shap_waterfall: {
    body: `
feats = ['基准期待 E[f(x)]', '+ 响应时效=4.8', '+ 熟人推荐=有', '- 隐性收费担忧=高', '+ 适老界面=4.2', '最终预测 f(x)']
vals = np.array([0.46, 0.19, 0.11, -0.14, 0.09, 0.71])
bottoms = np.zeros(len(feats))
cur = 0.0
for i in range(len(feats) - 1):
    if i == 0:
        cur = vals[0]
    else:
        bottoms[i] = cur if vals[i] >= 0 else cur + vals[i]
        cur += vals[i]
y = np.arange(len(feats))[::-1]

for i, (yi, v, b) in enumerate(zip(y, vals, bottoms)):
    col = SECONDARY if i in (0, len(feats) - 1) else (PRIMARY if v >= 0 else OPPOSITE)
    ax.barh(yi, abs(v), left=b, height=0.56, facecolor=col, alpha=0.35, edgecolor=PRIMARY if v >= 0 else col, linewidth=1.6,
            label='正向推升' if i == 1 else ('负向下拉' if i == 3 else None))
    ax.text(b + abs(v) + 0.015, yi, f'{v:+.2f}' if 0 < i < len(feats) - 1 else f'{v:.2f}', va='center', fontsize=9)
ax.set_yticks(y)
ax.set_yticklabels(feats)
ax.set_xlim(0, 0.96)
ax.set_xlabel('个体预测采纳概率')
`,
  },

  shap_dep: {
    imports: ['import statsmodels.api as sm'],
    body: `
x = rng.uniform(1, 5, 220)
w = rng.uniform(1, 5, 220)
shap_y = -0.35 + 0.18 * x + 0.05 * (x - 3.0) * (w - 3.0) + rng.normal(0, 0.05, 220)
cmap = mcolors.LinearSegmentedColormap.from_list('dep', [SECONDARY, '#CBD5E1', OPPOSITE])
sc = ax.scatter(x, shap_y, c=w, cmap=cmap, s=36, alpha=0.75, edgecolor=PRIMARY, linewidth=0.5)
plt.colorbar(sc, ax=ax, fraction=0.045, pad=0.03, label='交互特征：数字素养 (W)')
sm_xy = sm.nonparametric.lowess(shap_y, x, frac=0.35)
ax.plot(sm_xy[:, 0], sm_xy[:, 1], color=PRIMARY, linewidth=2.2, label='LOWESS 边际趋势线')
ax.axhline(0, color='#475569', linestyle='--', linewidth=1.0)
ax.scatter([], [], s=45, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='SHAP 交互观测点')
ax.set_xlabel('核心特征：响应时效评分')
ax.set_ylabel('SHAP 特征归因值')
`,
  },

  roc_auc: {
    imports: ['from sklearn.metrics import roc_curve, auc'],
    body: `
y_true = rng.integers(0, 2, 400)
models = [
    ('Logistic 回归', y_true * 0.55 + rng.normal(0, 0.50, 400), SECONDARY),
    ('随机森林 (RF)', y_true * 0.78 + rng.normal(0, 0.44, 400), OPPOSITE),
    ('XGBoost 集成', y_true * 0.96 + rng.normal(0, 0.40, 400), PRIMARY),
]
ax.plot([0, 1], [0, 1], color='#64748B', linestyle='--', linewidth=1.2, label='随机猜测基线 (AUC=0.500)')
for name, score, col in models:
    fpr, tpr, _ = roc_curve(y_true, score)
    roc_val = auc(fpr, tpr)
    ax.plot(fpr, tpr, color=col, linewidth=2.0, label=f'{name} (AUC = {roc_val:.3f})')
    if col == PRIMARY:
        ax.fill_between(fpr, 0, tpr, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
ax.set_xlabel('假阳性率 (1 - Specificity)')
ax.set_ylabel('真阳性率 (Sensitivity)')
`,
  },

  pr_curve: {
    imports: ['from sklearn.metrics import precision_recall_curve, average_precision_score'],
    body: `
y_true = (rng.uniform(0, 1, 500) < 0.22).astype(int)
s_xgb = y_true * 1.1 + rng.normal(0, 0.55, 500)
s_log = y_true * 0.75 + rng.normal(0, 0.62, 500)
for name, sc, col in [('XGBoost', s_xgb, PRIMARY), ('Logit 基准', s_log, SECONDARY)]:
    p, r, _ = precision_recall_curve(y_true, sc)
    ap = average_precision_score(y_true, sc)
    ax.plot(r, p, color=col, linewidth=2.0, label=f'{name} (AP = {ap:.3f})')
    if col == PRIMARY:
        ax.fill_between(r, 0, p, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
ax.axhline(y_true.mean(), color=OPPOSITE, linestyle='--', linewidth=1.3, label=f'阳性基线 ({y_true.mean():.2f})')
ax.set_xlabel('召回率 Recall')
ax.set_ylabel('精确率 Precision')
`,
  },

  calibration_curve: {
    imports: ['from sklearn.calibration import calibration_curve', 'from sklearn.metrics import brier_score_loss'],
    body: `
y_true = rng.integers(0, 2, 500)
prob_xgb = np.clip(0.15 + 0.70 * y_true + rng.normal(0, 0.22, 500), 0.02, 0.98)
prob_raw = np.clip(0.25 + 0.50 * y_true + rng.normal(0, 0.28, 500), 0.02, 0.98)
ax.plot([0, 1], [0, 1], color='#64748B', linestyle='--', linewidth=1.3, label='完美校准线 (y = x)')
for name, pr, col in [('校准后 XGBoost', prob_xgb, PRIMARY), ('未校准 Logit', prob_raw, OPPOSITE)]:
    pt, pp = calibration_curve(y_true, pr, n_bins=8)
    bs = brier_score_loss(y_true, pr)
    ax.plot(pp, pt, marker='o', color=col, linewidth=2.0, label=f'{name} (Brier={bs:.3f})')
    if col == PRIMARY:
        ax.fill_between(pp, pp, pt, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
ax.set_xlabel('模型预测概率均值')
ax.set_ylabel('样本实际阳性比例')
`,
  },

  confusion_matrix: {
    body: `
classes = ['低意愿', '观望中', '高意愿']
cm = np.array([[112, 18, 6], [14, 158, 22], [5, 19, 152]])
cm_norm = cm / cm.sum(axis=1, keepdims=True)
cmap = mcolors.LinearSegmentedColormap.from_list('cm_pal', ['#FFFFFF', PRIMARY])

im = ax.imshow(cm_norm, cmap=cmap, vmin=0, vmax=0.92, alpha=0.85)
plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04, label='行归一化召回比例')
for i in range(len(classes)):
    for j in range(len(classes)):
        ax.text(j, i, f'{cm_norm[i, j]*100:.1f}%\\n(n={cm[i, j]})', ha='center', va='center',
                fontsize=9.5, color='#0F172A' if cm_norm[i, j] < 0.55 else '#FFFFFF', fontweight='bold')
ax.legend(handles=[mpatches.Patch(facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='Macro-F1 = 0.834')],
          frameon=False, loc='upper right')
ax.set_xticks(range(len(classes)))
ax.set_xticklabels(classes)
ax.set_yticks(range(len(classes)))
ax.set_yticklabels(classes)
ax.set_xlabel('模型预测类别')
ax.set_ylabel('真实观测类别')
`,
  },

  learning_curve: {
    body: `
sizes = np.array([60, 120, 180, 260, 340, 420, 500])
train_m = np.array([0.96, 0.93, 0.91, 0.89, 0.885, 0.88, 0.878])
train_s = np.array([0.02, 0.02, 0.018, 0.015, 0.014, 0.012, 0.012])
cv_m = np.array([0.72, 0.77, 0.805, 0.832, 0.848, 0.858, 0.862])
cv_s = np.array([0.035, 0.030, 0.025, 0.020, 0.018, 0.015, 0.014])

ax.fill_between(sizes, train_m - train_s, train_m + train_s, color=SECONDARY, alpha=0.35, edgecolor=SECONDARY, linewidth=1.6)
ax.fill_between(sizes, cv_m - cv_s, cv_m + cv_s, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
ax.plot(sizes, train_m, marker='s', color=SECONDARY, linewidth=2.0, label='训练集 AUC (±1SD)')
ax.plot(sizes, cv_m, marker='o', color=PRIMARY, linewidth=2.2, label='五折交叉验证 AUC (±1SD)')
ax.set_xlabel('训练样本量 N')
ax.set_ylabel('分类判别性能 (ROC-AUC)')
`,
  },

  perm_importance: {
    body: `
feats = ['年龄层', '地区层级', '数字素养', '价格敏感', '制度信任', '响应时效']
drops = [rng.normal(mu, 0.008, 30) for mu in (0.012, 0.018, 0.031, 0.048, 0.064, 0.092)]
bp = ax.boxplot(drops, vert=False, widths=0.54, patch_artist=True,
                medianprops={'color': OPPOSITE, 'linewidth': 2.0})
for box in bp['boxes']:
    box.set_facecolor(PRIMARY)
    box.set_alpha(0.35)
    box.set_edgecolor(PRIMARY)
    box.set_linewidth(1.6)
ax.axvline(0, color='#64748B', linestyle='--', linewidth=1.2)
ax.legend(handles=[mpatches.Patch(facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='测试集置换性能衰减 ΔAUC')],
          frameon=False, loc='lower right')
ax.set_yticks(range(1, len(feats) + 1))
ax.set_yticklabels(feats)
ax.set_xlabel('特征置乱后模型性能下降幅度')
`,
  },

  pdp_ice: {
    body: `
x = np.linspace(1.0, 5.0, 60)
ice_curves = []
for i in range(40):
    shift = rng.normal(0, 0.14)
    curve = 0.25 + 0.55 / (1 + np.exp(-2.1 * (x - 3.2))) + shift
    ice_curves.append(curve)
    ax.plot(x, curve, color=SECONDARY, alpha=0.18, linewidth=1.0)
pdp = np.mean(ice_curves, axis=0)
pdp_sd = np.std(ice_curves, axis=0)

ax.fill_between(x, pdp - 0.5 * pdp_sd, pdp + 0.5 * pdp_sd, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6,
                label='ICE 个体异质性包络')
ax.plot(x, pdp, color=OPPOSITE, linewidth=2.6, label='PDP 平均边际依赖曲线')
ax.set_xlabel('特征取值为响应时效评分')
ax.set_ylabel('预测采纳概率边际效应')
`,
  },

  umap_cluster: {
    body: `
clusters = [
    ('C1 核心拥趸', (-2.1, 1.8), PRIMARY),
    ('C2 务实观望', (1.9, 1.2), SECONDARY),
    ('C3 价格敏感', (0.2, -2.0), OPPOSITE),
]
for name, (cx, cy), col in clusters:
    pts_x = rng.normal(cx, 0.65, 95)
    pts_y = rng.normal(cy, 0.58, 95)
    ax.scatter(pts_x, pts_y, s=36, facecolor=col, alpha=0.35, edgecolor=PRIMARY if col == PRIMARY else col, linewidth=1.6, label=name)
    ax.scatter([cx], [cy], s=140, marker='X', color='#0F172A', zorder=5)
ax.set_xlabel('UMAP 流形维度 1')
ax.set_ylabel('UMAP 流形维度 2')
`,
  },

  calibration_belt: {
    imports: ['import statsmodels.api as sm'],
    body: `
p_hat = rng.beta(1.8, 1.8, 600)
logit_p = np.log(p_hat / (1.0 - p_hat))
true_p = 1.0 / (1.0 + np.exp(-(0.08 + 0.96 * logit_p - 0.12 * (logit_p ** 2))))
y_obs = rng.binomial(1, true_p)

X_cal = sm.add_constant(np.column_stack([logit_p, logit_p ** 2]))
res = sm.GLM(y_obs, X_cal, family=sm.families.Binomial()).fit()
cov = res.cov_params()

pg = np.linspace(0.03, 0.97, 120)
lg = np.log(pg / (1.0 - pg))
Xg = sm.add_constant(np.column_stack([lg, lg ** 2]))
eta = Xg @ res.params
se_eta = np.sqrt(np.einsum('ij,jk,ik->i', Xg, cov, Xg))
sig = lambda z: 1.0 / (1.0 + np.exp(-z))

ax.fill_between(pg, sig(eta - 1.960 * se_eta), sig(eta + 1.960 * se_eta), color=SECONDARY, alpha=0.25, label='95% 置信校准带')
ax.fill_between(pg, sig(eta - 1.282 * se_eta), sig(eta + 1.282 * se_eta), color=PRIMARY, alpha=0.45, label='80% 置信校准带')
ax.plot(pg, sig(eta), color=PRIMARY, linewidth=2.0, label='多项式校准中线')
ax.plot([0, 1], [0, 1], color=OPPOSITE, linestyle='--', linewidth=1.6, label='完美校准对角线 (y = x)')
ax.set_xlabel('模型预测概率 p_hat')
ax.set_ylabel('实测发生概率 p')
`,
  },

  taylor_diagram: {
    body: `
ref_sd = 1.0
max_sd = 1.5
theta = np.linspace(0, np.pi / 2, 200)

for sd_r, ls, col in [(0.5, ':', '#CBD5E1'), (1.0, '--', PRIMARY), (1.5, '-', '#475569')]:
    ax.plot(sd_r * np.cos(theta), sd_r * np.sin(theta), color=col, linestyle=ls, linewidth=1.4 if sd_r == 1.0 else 0.9)

for r_val in [0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 0.99]:
    ang = np.arccos(r_val)
    ax.plot([0, max_sd * np.cos(ang)], [0, max_sd * np.sin(ang)], color='#E2E8F0', linewidth=0.8)
    ax.text(max_sd * 1.04 * np.cos(ang), max_sd * 1.04 * np.sin(ang), f'r={r_val}', fontsize=8, color='#475569', ha='center', va='center')

phi = np.linspace(0, np.pi, 240)
for e_rad in [0.4, 0.8]:
    cx, cy = ref_sd + e_rad * np.cos(phi), e_rad * np.sin(phi)
    mask = (cx >= 0) & (cy >= 0) & (cx ** 2 + cy ** 2 <= max_sd ** 2)
    ax.plot(cx[mask], cy[mask], color=SECONDARY, linestyle='--', linewidth=1.0, alpha=0.75)

ax.scatter([ref_sd], [0.0], s=140, marker='*', color=OPPOSITE, zorder=6, label='观测参考基准 (Ref)')
models = [
    ('M1 物理融合', 1.04, 0.95, PRIMARY, 'o'),
    ('M2 XGBoost', 0.88, 0.89, SECONDARY, 's'),
    ('M3 LSTM 序列', 1.18, 0.80, '#0F766E', '^'),
    ('M4 线性基准', 0.74, 0.64, OPPOSITE, 'D'),
]
for lbl, sd_m, r_m, col, mk in models:
    mx, my = sd_m * r_m, sd_m * np.sqrt(max(0.0, 1.0 - r_m ** 2))
    rmse = np.sqrt(1.0 + sd_m ** 2 - 2.0 * sd_m * r_m)
    ax.scatter([mx], [my], s=95, marker=mk, color=col, edgecolor='#FFFFFF', linewidth=1.0, zorder=5, label=f'{lbl} (RMSE={rmse:.2f})')
    ax.text(mx + 0.03, my + 0.03, lbl.split()[0], fontsize=8.8, fontweight='bold', color=col)

ax.set_aspect('equal')
ax.set_xlim(-0.04, 1.62)
ax.set_ylim(-0.04, 1.62)
ax.set_xlabel('标准化标准差投影 (σ / σ_obs)')
ax.set_ylabel('正交标准差分量 (σ / σ_obs)')
`,
  },

  shapley_owen: {
    body: `
coalitions = [
    ('C1 制度信任联盟 (42.0%)', [('规则透明度', 24.6), ('隐私安全感', 17.4)], PRIMARY),
    ('C2 体验便利联盟 (34.5%)', [('流程极简度', 20.2), ('响应时效感', 14.3)], SECONDARY),
    ('C3 价格摩擦联盟 (23.5%)', [('显性费率感', 14.8), ('违约顾虑度', 8.7)], OPPOSITE),
]
labels, vals, cols, y_pos, group_spans = [], [], [], [], []
y_cur = 0.0
for cname, members, col in coalitions:
    start_y = y_cur
    for m_name, m_val in members:
        labels.append(m_name)
        vals.append(m_val)
        cols.append(col)
        y_pos.append(y_cur)
        y_cur += 1.0
    end_y = y_cur - 1.0
    group_spans.append((cname, start_y, end_y, col))
    y_cur += 0.45

max_y = max(y_pos)
y_plot = [max_y - p for p in y_pos]

for yi, v, col in zip(y_plot, vals, cols):
    ax.barh(yi, v, height=0.62, color=col, alpha=0.40, edgecolor=col, linewidth=1.6)
    ax.text(v + 0.5, yi, f'{v:.1f}%', va='center', fontsize=9.2, fontweight='bold', color=col)

for cname, sy, ey, col in group_spans:
    y_top = max_y - sy + 0.42
    y_bot = max_y - ey - 0.42
    ax.axhspan(y_bot, y_top, color=col, alpha=0.06)
    ax.text(29.8, (y_top + y_bot) / 2, cname, ha='right', va='center', fontsize=9.0, fontweight='bold', color=col)

ax.set_yticks(y_plot)
ax.set_yticklabels(labels)
ax.set_xlim(0, 31.0)
ax.set_xlabel('Shapley-Owen 联盟二级对称归因份额 (%)')
`,
  },

  conformal_interval_band: {
    body: `
n_tot = 240
x_raw = rng.uniform(0.0, 5.0, n_tot)
y_raw = 2.0 + 0.55 * x_raw + 0.35 * np.sin(1.4 * x_raw) + rng.normal(0.0, 0.32, n_tot)

# 划分为训练集 (100) / 校准集 (80) / 测试集 (60)
idx_tr, idx_cal, idx_te = slice(0, 100), slice(100, 180), slice(180, 240)
def poly_basis(v):
    return np.column_stack([np.ones_like(v), v, v ** 2, v ** 3])

X_tr = poly_basis(x_raw[idx_tr])
beta = np.linalg.solve(X_tr.T @ X_tr + 1e-2 * np.eye(4), X_tr.T @ y_raw[idx_tr])
pred_cal = poly_basis(x_raw[idx_cal]) @ beta
pred_te = poly_basis(x_raw[idx_te]) @ beta
y_te = y_raw[idx_te]

# 有限样本 Split Conformal 分位数校准 (α = 0.10 -> 目标 90% 覆盖率)
alpha = 0.10
scores_sorted = np.sort(np.abs(y_raw[idx_cal] - pred_cal))
k_idx = min(len(scores_sorted) - 1, int(np.ceil((len(scores_sorted) + 1) * (1.0 - alpha))) - 1)
q_hat = float(scores_sorted[k_idx])

order = np.argsort(pred_te)
pred_s, y_s = pred_te[order], y_te[order]
xi = np.arange(1, len(y_s) + 1)
in_band = np.abs(y_s - pred_s) <= q_hat
emp_cov = float(np.mean(in_band)) * 100.0

ax.fill_between(xi, pred_s - q_hat, pred_s + q_hat, color=PRIMARY, alpha=0.18, label=f'90% Split Conformal 区间带 (±{q_hat:.2f})')
ax.plot(xi, pred_s, color=PRIMARY, linewidth=2.2, label='点预测均值 f_hat(x)')
ax.scatter(xi[in_band], y_s[in_band], s=32, color=SECONDARY, alpha=0.88, label=f'命中区间样本 ({int(in_band.sum())}/{len(y_s)})')
ax.scatter(xi[~in_band], y_s[~in_band], s=68, color=OPPOSITE, marker='X', zorder=5, label=f'越界样本 (实测覆盖 {emp_cov:.1f}%)')
ax.set_xlabel('测试集样本序号 (按点预测值 f_hat(x) 升序)')
ax.set_ylabel('实测与预测响应值 Y')
`,
  },

  uplift_qini_curve: {
    body: `
n = 2400
x1 = rng.normal(0, 1, n)
x2 = rng.normal(0, 1, n)
w = rng.binomial(1, 0.5, n)  # 随机对照干预分配

# 真实异质性因果增益: 中高 x1 存在正向可说服人群，极端 x2 存在负向反作用人群
true_tau = 0.22 * np.tanh(x1) - 0.12 * np.maximum(0.0, x2 - 0.8)
base_p = 1.0 / (1.0 + np.exp(-( -0.6 + 0.5 * x2 + 0.2 * x1 )))
p_obs = np.clip(base_p + w * true_tau, 0.02, 0.98)
y = rng.binomial(1, p_obs, n)

# 对比 T-Learner 线性评分与带交互特征 Causal-Forest 近似增益评分
X_lin = np.column_stack([np.ones(n), x1, x2])
X_int = np.column_stack([np.ones(n), x1, x2, np.tanh(x1), np.maximum(0.0, x2 - 0.8), x1 * x2])
def fit_tau(X_mat):
    m1 = (w == 1)
    m0 = (w == 0)
    b1 = np.linalg.solve(X_mat[m1].T @ X_mat[m1] + 0.5 * np.eye(X_mat.shape[1]), X_mat[m1].T @ y[m1])
    b0 = np.linalg.solve(X_mat[m0].T @ X_mat[m0] + 0.5 * np.eye(X_mat.shape[1]), X_mat[m0].T @ y[m0])
    return X_mat @ (b1 - b0)

tau_t = fit_tau(X_lin)
tau_cf = fit_tau(X_int)

def qini_curve(scores):
    idx = np.argsort(-scores)
    fracs = np.linspace(0.0, 1.0, 21)
    gains = [0.0]
    for f in fracs[1:]:
        k = max(10, int(f * n))
        sub = idx[:k]
        mt, mc = (w[sub] == 1), (w[sub] == 0)
        rt = y[sub][mt].mean() if mt.any() else 0.0
        rc = y[sub][mc].mean() if mc.any() else 0.0
        gains.append((rt - rc) * f * 100.0)
    return fracs * 100.0, np.array(gains)

pct, q_cf = qini_curve(tau_cf)
_, q_tl = qini_curve(tau_t)
q_rnd = pct / 100.0 * q_cf[-1]
qini_coeff = float(np.sum(0.5 * ((q_cf - q_rnd)[1:] + (q_cf - q_rnd)[:-1]) * np.diff(pct / 100.0)))

ax.fill_between(pct, q_rnd, q_cf, color=PRIMARY, alpha=0.14, label=f'Qini 净增益面积 (Q={qini_coeff:.2f})')
ax.plot(pct, q_rnd, color='#64748B', linestyle='--', linewidth=1.4, label='随机无序触达基线')
ax.plot(pct, q_tl, color=SECONDARY, marker='s', markersize=4, linewidth=1.9, label='T-Learner 增量响应曲线')
ax.plot(pct, q_cf, color=PRIMARY, marker='o', markersize=4.5, linewidth=2.4, label='Causal Forest 增量响应曲线')
pk = int(np.argmax(q_cf))
ax.axvline(pct[pk], color=OPPOSITE, linestyle=':', linewidth=1.3)
ax.scatter([pct[pk]], [q_cf[pk]], s=90, color=OPPOSITE, zorder=5, label=f'最优截断 {pct[pk]:.0f}% (峰值 {q_cf[pk]:+.1f}%)')
ax.set_xlim(0, 102)
ax.set_xlabel('按预测 CATE tau_hat(x) 降序触达人群比例 (%)')
ax.set_ylabel('累计净增量转化比例 (%)')
`,
  },

  ale_accumulated_local: {
    body: `
n = 1200
x1 = rng.normal(5.0, 1.4, n)
x2 = 0.85 * x1 + rng.normal(0.0, 0.55, n)  # 强共线性 r ≈ 0.90
y = 0.34 * x1 - 0.032 * (x1 ** 2) + 0.38 * x2 + rng.normal(0.0, 0.25, n)

def basis(a, b):
    return np.column_stack([np.ones_like(a), a, b, a ** 2, b ** 2, a * b, (a ** 3) * 0.02])

Phi = basis(x1, x2)
theta = np.linalg.solve(Phi.T @ Phi + 1e-2 * np.eye(Phi.shape[1]), Phi.T @ y)
f_hat = lambda a, b: basis(a, b) @ theta

# 计算一阶中心化 ALE (经验分位箱内局部差分，规避虚假特征组合)
edges = np.quantile(x1, np.linspace(0.0, 1.0, 13))
ale_mids, ale_diffs, counts = [], [], []
for k in range(len(edges) - 1):
    mask = (x1 >= edges[k]) & (x1 <= edges[k + 1] if k == len(edges) - 2 else x1 < edges[k + 1])
    x2_bin = x2[mask]
    diff = float(np.mean(f_hat(np.full_like(x2_bin, edges[k + 1]), x2_bin) - f_hat(np.full_like(x2_bin, edges[k]), x2_bin)))
    ale_mids.append(0.5 * (edges[k] + edges[k + 1]))
    ale_diffs.append(diff)
    counts.append(len(x2_bin))

ale_raw = np.cumsum(ale_diffs)
ale_centered = ale_raw - np.average(ale_raw, weights=counts)

# 计算传统 PDP (固定 X1 并在全样本 X2 上边际平均 -> 尾端产生共线外推偏误)
grid_x1 = np.linspace(edges[0], edges[-1], 40)
pdp_raw = np.array([float(np.mean(f_hat(np.full_like(x2, gx), x2))) for gx in grid_x1])
pdp_centered = pdp_raw - np.mean(pdp_raw)

ax.axhline(0.0, color='#475569', linestyle='--', linewidth=1.1)
ax.plot(grid_x1, pdp_centered, color=OPPOSITE, linestyle='--', linewidth=2.0, label='传统 PDP (尾端受共线外推偏误)')
ax.plot(ale_mids, ale_centered, color=PRIMARY, marker='o', markersize=4.5, linewidth=2.4, label='ALE 累积局部效应 (抗共线)')
rug_x = np.sort(x1)[::12]
ymin_ax, _ = ax.get_ylim()
ax.plot(rug_x, np.full_like(rug_x, ymin_ax + 0.03), '|', color=SECONDARY, markersize=7, alpha=0.7, label='样本分位分布 Rug')
ax.set_xlabel('强共线解释变量 X1 (与 X2 相关 r ≈ 0.90)')
ax.set_ylabel('中心化边际预测效应 Δf_hat(X1)')
`,
  },

  bertopic_intertopic_map: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
topics = ['T0 政策补贴', 'T1 服务时效', 'T2 隐私信任', 'T3 价格摩擦', 'T4 界面交互']
umap_xy = np.array([[-1.4, 1.3], [1.5, 1.4], [1.4, -1.3], [-1.5, -1.2], [0.2, -0.1]])
shares = np.array([0.28, 0.24, 0.21, 0.16, 0.11])
colors = [OPPOSITE, PRIMARY, SECONDARY, '#0EA5E9', '#64748B']

# 构造主题-词频矩阵并计算 c-TF-IDF 权重: tf_{t,c} * log(1 + A / tf_t)
vocab = ['专项补贴', '门槛资质', '兑现周期', '县域试点', '财政兜底', '申报流程', '审批效率', '客服响应']
tf_mat = np.array([
    [94, 82, 71, 63, 49, 38, 12, 9],
    [14, 18, 25, 15, 10, 44, 88, 79],
    [11, 22, 16, 12, 35, 18, 16, 21],
    [32, 15, 29, 18, 21, 14, 11, 15],
    [8, 11, 9, 10, 7, 36, 28, 34],
], dtype=float)
avg_words_per_topic = float(np.mean(tf_mat.sum(axis=1)))
tf_total = tf_mat.sum(axis=0)
ctfidf = (tf_mat / tf_mat.sum(axis=1, keepdims=True)) * np.log(1.0 + avg_words_per_topic / tf_total)
t0_scores = ctfidf[0]
order = np.argsort(t0_scores)

fig = plt.figure(figsize=(10.2, 4.8), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.1, 1.0], wspace=0.35)
ax_map, ax_bar = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

ax_map.axhline(0.0, color='#CBD5E1', linestyle='--', linewidth=1.0)
ax_map.axvline(0.0, color='#CBD5E1', linestyle='--', linewidth=1.0)
for idx in range(len(topics)):
    ax_map.scatter([umap_xy[idx, 0]], [umap_xy[idx, 1]], s=shares[idx] * 4200, color=colors[idx], alpha=0.35 if idx > 0 else 0.45, edgecolor=colors[idx], linewidth=2.0)
    ax_map.text(umap_xy[idx, 0], umap_xy[idx, 1], f'{topics[idx]}\\n({shares[idx]*100:.0f}%)', ha='center', va='center', fontsize=8.5, fontweight='bold', color='#0F172A')
ax_map.set_xlim(-2.6, 2.6)
ax_map.set_ylim(-2.5, 2.5)
ax_map.set_xlabel('UMAP 语义嵌入轴 D1')
ax_map.set_ylabel('UMAP 语义嵌入轴 D2')
ax_map.set_title('主题间语义距离流形图 (Intertopic Map)', fontsize=10.5, fontweight='bold')

y_idx = np.arange(len(vocab))
ax_bar.barh(y_idx, t0_scores[order], color=OPPOSITE, alpha=0.82, height=0.62)
for yi, val in zip(y_idx, t0_scores[order]):
    ax_bar.text(val + 0.006, yi, f'{val:.3f}', va='center', fontsize=8.2, fontweight='bold', color=OPPOSITE)
ax_bar.set_yticks(y_idx)
ax_bar.set_yticklabels([vocab[i] for i in order])
ax_bar.set_xlim(0.0, max(t0_scores) * 1.24)
ax_bar.set_xlabel('c-TF-IDF 主题区分度权重')
ax_bar.set_title('焦点主题 T0 (政策补贴) 核心词排序', fontsize=10.5, fontweight='bold')

for target_ax in (ax_map, ax_bar):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.08, right=0.97, bottom=0.14, top=0.84)
`,
  },

  rag_latency_faithfulness: {
    body: `
configs = [
    ('BM25 稀疏检索', 0.62, 0.63, 0.61),
    ('Dense 向量检索', 1.05, 0.76, 0.74),
    ('混合检索 + Rerank', 1.58, 0.87, 0.86),
    ('HyDE 假设改写', 2.15, 0.80, 0.79),
    ('长窗口全量注入', 2.95, 0.72, 0.83),
    ('GraphRAG 知识图谱', 3.30, 0.93, 0.92),
    ('多跳 Agentic RAG', 3.75, 0.89, 0.88),
]
lats = np.array([c[1] for c in configs])
faith = np.array([c[2] for c in configs])
recall = np.array([c[3] for c in configs])

# 识别最小延迟-最大忠实度的非支配帕累托前沿
is_pareto = np.ones(len(configs), dtype=bool)
for i in range(len(configs)):
    for j in range(len(configs)):
        if i != j and lats[j] <= lats[i] and faith[j] >= faith[i] and (lats[j] < lats[i] or faith[j] > faith[i]):
            is_pareto[i] = False
            break

p_idx = np.where(is_pareto)[0]
p_order = p_idx[np.argsort(lats[p_idx])]

ax.plot(lats[p_order], faith[p_order], color=PRIMARY, linewidth=2.3, zorder=3, label='帕累托最优前沿 (Pareto Front)')
ax.scatter(lats[~is_pareto], faith[~is_pareto], s=(recall[~is_pareto] * 24) ** 2, color='#94A3B8', alpha=0.68, edgecolor='#FFFFFF', linewidth=1.2, zorder=4, label='受支配劣解配置')

for idx in p_order:
    is_knee = 'Rerank' in configs[idx][0]
    col = OPPOSITE if is_knee else PRIMARY
    ax.scatter([lats[idx]], [faith[idx]], s=(recall[idx] * 25) ** 2, color=col, alpha=0.88, edgecolor='#FFFFFF', linewidth=1.5, zorder=5,
               label='最优性价比拐点 (Rerank)' if is_knee else None)

for idx, (name, lx, fy, rec) in enumerate(configs):
    dy = -14 if '长窗口' in name or 'BM25' in name else 12
    ax.annotate(f'{name} (R={rec:.2f})', (lx, fy), xytext=(0, dy), textcoords='offset points',
                ha='center', fontsize=8.2, fontweight='bold' if is_pareto[idx] else 'normal',
                color=OPPOSITE if 'Rerank' in name else (PRIMARY if is_pareto[idx] else '#475569'))

ax.set_xlim(0.2, 4.2)
ax.set_ylim(0.56, 0.99)
ax.set_xlabel('端到端 P95 响应延迟 Latency (秒, 气泡面积正比于 Recall)')
ax.set_ylabel('生成答案忠实度 (Faithfulness)')
`,
  },

  conformal_interval_fan: {
    body: `
n_all = 320
x_all = rng.uniform(0.0, 10.0, n_all)
sigma_true = 0.24 + 0.085 * x_all
y_all = 2.25 + 0.31 * x_all + 0.28 * np.sin(0.72 * x_all) + rng.normal(0.0, sigma_true)

idx_tr, idx_cal, idx_te = slice(0, 140), slice(140, 240), slice(240, 320)
def poly_design(v):
    return np.column_stack([np.ones_like(v), v, v ** 2, np.sin(0.72 * v)])

X_tr = poly_design(x_all[idx_tr])
beta = np.linalg.solve(X_tr.T @ X_tr + 1e-3 * np.eye(4), X_tr.T @ y_all[idx_tr])
pred_cal = poly_design(x_all[idx_cal]) @ beta

# 局部异方差尺度归一化残差与多水平 Split Conformal 分位数校准 (50% / 80% / 95%)
scale_cal = 0.22 + 0.08 * x_all[idx_cal]
scores = np.sort(np.abs(y_all[idx_cal] - pred_cal) / scale_cal)
def conf_q(alpha):
    k = min(len(scores) - 1, int(np.ceil((len(scores) + 1) * (1.0 - alpha))) - 1)
    return float(scores[k])

q50, q80, q95 = conf_q(0.50), conf_q(0.20), conf_q(0.05)
xg = np.linspace(0.0, 10.0, 120)
yg = poly_design(xg) @ beta
sg = 0.22 + 0.08 * xg

x_te = x_all[idx_te]
y_te = y_all[idx_te]
pred_te = poly_design(x_te) @ beta
in_95 = np.abs(y_te - pred_te) <= q95 * (0.22 + 0.08 * x_te)
cov_95 = float(np.mean(in_95)) * 100.0

ax.fill_between(xg, yg - q95 * sg, yg + q95 * sg, color=PRIMARY, alpha=0.14, label='95% Split Conformal 扇形带')
ax.fill_between(xg, yg - q80 * sg, yg + q80 * sg, color=PRIMARY, alpha=0.22, label='80% Split Conformal 扇形带')
ax.fill_between(xg, yg - q50 * sg, yg + q50 * sg, color=PRIMARY, alpha=0.34, label='50% 核心预测扇形带')
ax.plot(xg, yg, color=PRIMARY, linewidth=2.2, label='点预测曲线 f_hat(x)')
ax.axvline(3.5, color='#475569', linestyle='--', linewidth=1.1)
ax.scatter(x_te[in_95], y_te[in_95], s=32, color=SECONDARY, alpha=0.85, label=f'命中 95% 区间 ({cov_95:.1f}%)')
ax.scatter(x_te[~in_95], y_te[~in_95], s=68, color=OPPOSITE, marker='X', zorder=5, label=f'越界样本 ({int((~in_95).sum())}/{len(y_te)})')
ax.set_xlabel('协变量外推尺度 x (异方差自适应共形校准扇)')
ax.set_ylabel('预测响应值 Y')
`,
  },

  shap_interaction_matrix: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
feats = ['信任度', '频次', '价格', '距离', '年龄']
# 对称 TreeSHAP 交互矩阵: 对角线为主效应 |Phi_i,i|, 非对角为二阶交互强度 |Phi_i,j|
mat = np.array([
    [0.38, 0.11, 0.16, 0.05, 0.04],
    [0.11, 0.31, 0.08, 0.13, 0.03],
    [0.16, 0.08, 0.27, 0.06, 0.09],
    [0.05, 0.13, 0.06, 0.19, 0.04],
    [0.04, 0.03, 0.09, 0.04, 0.14],
])

fig = plt.figure(figsize=(10.4, 4.9), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.05, 1.15], wspace=0.34)
ax_mat, ax_bee = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

cmap_mat = mcolors.LinearSegmentedColormap.from_list('shap_mat', ['#F8FAFC', SECONDARY, PRIMARY])
im = ax_mat.imshow(mat, cmap=cmap_mat, vmin=0.0, vmax=0.40)
for r in range(5):
    for c in range(5):
        v = mat[r, c]
        ax_mat.text(c, r, f'{v:.2f}', ha='center', va='center', fontsize=8.8,
                    fontweight='bold' if r == c else 'normal',
                    color='#FFFFFF' if v > 0.22 else '#0F172A')
ax_mat.add_patch(mpatches.Rectangle((1.5, -0.5), 1.0, 1.0, fill=False, edgecolor=OPPOSITE, linewidth=2.2))
ax_mat.add_patch(mpatches.Rectangle((-0.5, 1.5), 1.0, 1.0, fill=False, edgecolor=OPPOSITE, linewidth=2.2))
ax_mat.set_xticks(range(5))
ax_mat.set_xticklabels(feats, rotation=20, ha='right')
ax_mat.set_yticks(range(5))
ax_mat.set_yticklabels(feats)
ax_mat.set_title('主效应 |Phi_i,i| 与交互强度 |Phi_i,j|', fontsize=10.5, fontweight='bold')

pair_names = ['信任度 x 价格', '频次 x 距离', '信任度 x 频次', '价格 x 年龄']
y_pos = np.arange(len(pair_names))[::-1]
cmap_bee = mcolors.LinearSegmentedColormap.from_list('shap_bee', [SECONDARY, '#E2E8F0', OPPOSITE])
ax_bee.axvline(0.0, color='#475569', linestyle='--', linewidth=1.2)
for yi, sp in zip(y_pos, [0.22, 0.18, 0.15, 0.13]):
    f_inter = rng.uniform(0.0, 1.0, 90)
    phi_ij = (f_inter - 0.5) * 2.0 * sp + rng.normal(0.0, 0.025, 90)
    jy = rng.normal(0.0, 0.10, 90)
    sc = ax_bee.scatter(phi_ij, yi + jy, c=f_inter, cmap=cmap_bee, s=24, alpha=0.80)
plt.colorbar(sc, ax=ax_bee, fraction=0.045, pad=0.03, label='交互特征取值 (低 -> 高)')
ax_bee.set_yticks(y_pos)
ax_bee.set_yticklabels(pair_names)
ax_bee.set_xlim(-0.28, 0.28)
ax_bee.set_xlabel('二阶交互 SHAP 值 Phi_i,j')
ax_bee.set_title('核心特征对二阶交互蜂群分解', fontsize=10.5, fontweight='bold')
ax_bee.spines['top'].set_visible(False)
ax_bee.spines['right'].set_visible(False)
ax_bee.grid(True, axis='x', linestyle='--', alpha=0.25)

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.08, right=0.95, bottom=0.16, top=0.84)
`,
  },

  ridge_lasso_path: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
# 纯 NumPy 坐标下降 (Coordinate Descent) 求解 Lasso 惩罚路径与 10 折交叉验证调参
n, p = 320, 8
feat_names = ['制度信任', '服务便利', '价格摩擦', '口碑推荐', '渠道熟悉', '年龄特征', '冗余噪声1', '冗余噪声2']
Z_base = rng.normal(0.0, 1.0, (n, p))
Z_base[:, 4] = 0.78 * Z_base[:, 0] + 0.62 * rng.normal(0.0, 1.0, n)
X = (Z_base - Z_base.mean(axis=0)) / Z_base.std(axis=0, ddof=1)
true_beta = np.array([0.52, 0.36, -0.34, 0.22, 0.0, 0.0, 0.0, 0.0])
y_raw = X @ true_beta + rng.normal(0.0, 0.56, n)
y = y_raw - y_raw.mean()

def soft_thresh(z, gamma):
    return np.sign(z) * np.maximum(np.abs(z) - gamma, 0.0)

def fit_lasso_cd(X_tr, y_tr, lam, n_iter=60, w_init=None):
    m_tr, d = X_tr.shape
    w = np.zeros(d) if w_init is None else w_init.copy()
    col_norm2 = np.sum(X_tr ** 2, axis=0) / m_tr
    r = y_tr - X_tr @ w
    for _ in range(n_iter):
        for j in range(d):
            if col_norm2[j] <= 1e-12:
                continue
            r += X_tr[:, j] * w[j]
            rho = float(X_tr[:, j] @ r) / m_tr
            w[j] = float(soft_thresh(rho, lam)) / float(col_norm2[j])
            r -= X_tr[:, j] * w[j]
    return w

lam_max = float(np.max(np.abs(X.T @ y)) / n)
lam_grid = np.logspace(np.log10(lam_max * 0.95), np.log10(lam_max * 0.004), 32)
log_lam = np.log10(lam_grid)

coef_path = np.zeros((len(lam_grid), p))
w_cur = np.zeros(p)
for idx_l, lam in enumerate(lam_grid):
    w_cur = fit_lasso_cd(X, y, float(lam), n_iter=70, w_init=w_cur)
    coef_path[idx_l] = w_cur

# 10 折交叉验证 MSE 与标准误
K_fold = 10
perm = rng.permutation(n)
fold_sizes = np.array_split(perm, K_fold)
cv_mse_mat = np.zeros((K_fold, len(lam_grid)))
for kf, val_idx in enumerate(fold_sizes):
    tr_idx = np.setdiff1d(perm, val_idx)
    X_tr, y_tr = X[tr_idx], y[tr_idx] - y[tr_idx].mean()
    X_va, y_va = X[val_idx], y[val_idx] - y[tr_idx].mean()
    w_cv = np.zeros(p)
    for idx_l, lam in enumerate(lam_grid):
        w_cv = fit_lasso_cd(X_tr, y_tr, float(lam), n_iter=55, w_init=w_cv)
        cv_mse_mat[kf, idx_l] = float(np.mean((y_va - X_va @ w_cv) ** 2))

cv_mean = cv_mse_mat.mean(axis=0)
cv_se = cv_mse_mat.std(axis=0, ddof=1) / np.sqrt(K_fold)
idx_min = int(np.argmin(cv_mean))
thr_1se = cv_mean[idx_min] + cv_se[idx_min]
cand_1se = np.where(cv_mean <= thr_1se)[0]
idx_1se = int(cand_1se[0])  # lam_grid 按降序排列，最小索引对应最大 lambda
df_1se = int(np.sum(np.abs(coef_path[idx_1se]) > 1e-4))

fig = plt.figure(figsize=(9.0, 5.8), dpi=180)
gs = GridSpec(2, 1, height_ratios=[1.25, 1.0], hspace=0.14)
ax_p = fig.add_subplot(gs[0])
ax_cv = fig.add_subplot(gs[1], sharex=ax_p)

cols_p = [PRIMARY, SECONDARY, OPPOSITE, '#0D9488', '#64748B', '#94A3B8', '#CBD5E1', '#CBD5E1']
ax_p.axhline(0.0, color='#475569', linestyle=':', linewidth=1.0)
for j in range(p):
    is_sig = j < 4
    ax_p.plot(log_lam, coef_path[:, j], color=cols_p[j], linewidth=2.1 if is_sig else 1.2,
              alpha=0.95 if is_sig else 0.70, label=feat_names[j] if is_sig else None)
    if is_sig:
        ax_p.text(log_lam[-1] - 0.04, coef_path[-1, j], feat_names[j], ha='right', va='center',
                  fontsize=8.0, fontweight='bold', color=cols_p[j])
ax_p.axvline(log_lam[idx_min], color=SECONDARY, linestyle='--', linewidth=1.3)
ax_p.axvline(log_lam[idx_1se], color=OPPOSITE, linestyle='--', linewidth=1.5)
ax_p.set_ylabel('标准化回归系数 beta_j')
ax_p.set_title('Lasso L1 惩罚系数收缩轨迹 (左 -> 右正则化增强)', fontsize=10.5, fontweight='bold')
ax_p.legend(frameon=False, loc='upper right', ncol=2, fontsize=8.0)
plt.setp(ax_p.get_xticklabels(), visible=False)

ax_cv.fill_between(log_lam, cv_mean - cv_se, cv_mean + cv_se, color=SECONDARY, alpha=0.20, label='10折 CV-MSE +- 1 SE')
ax_cv.plot(log_lam, cv_mean, color=PRIMARY, marker='o', markersize=3.5, linewidth=2.0, label='10折交叉验证均方误差')
ax_cv.axvline(log_lam[idx_min], color=SECONDARY, linestyle='--', linewidth=1.3, label=f'lambda_min ({lam_grid[idx_min]:.3f})')
ax_cv.axvline(log_lam[idx_1se], color=OPPOSITE, linestyle='--', linewidth=1.5, label=f'lambda_1se ({lam_grid[idx_1se]:.3f}, df={df_1se})')
ax_cv.set_xlim(log_lam.min() - 0.38, log_lam.max() + 0.08)
ax_cv.set_xlabel('对数惩罚参数 log10(lambda)')
ax_cv.set_ylabel('10 折 CV-MSE')
ax_cv.legend(frameon=False, loc='upper left', fontsize=8.0)

for target_ax in (ax_p, ax_cv):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.10, right=0.96, bottom=0.11, top=0.87)
`,
  },

  roc_pr_calibration_dual: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
n = 800
y_true = (rng.uniform(0.0, 1.0, n) < 0.24).astype(int)
logit_gbdt = -1.6 + 2.45 * y_true + rng.normal(0.0, 0.92, n)
logit_base = -1.4 + 1.65 * y_true + rng.normal(0.0, 1.05, n)
p_gbdt = 1.0 / (1.0 + np.exp(-logit_gbdt))
p_base = 1.0 / (1.0 + np.exp(-logit_base))

def compute_roc_pr(y_vec, score_vec):
    order = np.argsort(-score_vec)
    y_s = y_vec[order]
    tp = np.cumsum(y_s)
    fp = np.cumsum(1 - y_s)
    P = float(np.sum(y_vec))
    N = float(len(y_vec) - P)
    tpr = np.concatenate([[0.0], tp / P, [1.0]])
    fpr = np.concatenate([[0.0], fp / N, [1.0]])
    auc_roc = float(np.trapezoid(tpr, fpr)) if hasattr(np, 'trapezoid') else float(np.trapz(tpr, fpr))
    recall = np.concatenate([[0.0], tp / P])
    precision = np.concatenate([[1.0], tp / np.maximum(1.0, tp + fp)])
    ap = float(np.sum(np.diff(recall) * precision[1:]))
    return fpr, tpr, auc_roc, recall, precision, ap

def compute_calibration(y_vec, prob_vec, n_bins=8):
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    mp, fp, se_b, counts = [], [], [], []
    ece = 0.0
    for i in range(n_bins):
        mask = (prob_vec >= edges[i]) & (prob_vec <= edges[i + 1] if i == n_bins - 1 else prob_vec < edges[i + 1])
        cnt = int(np.sum(mask))
        counts.append(cnt)
        if cnt >= 3:
            m_val = float(np.mean(prob_vec[mask]))
            f_val = float(np.mean(y_vec[mask]))
            mp.append(m_val)
            fp.append(f_val)
            se_b.append(1.96 * np.sqrt(max(1e-6, f_val * (1.0 - f_val)) / cnt))
            ece += (cnt / len(y_vec)) * abs(f_val - m_val)
    brier = float(np.mean((prob_vec - y_vec) ** 2))
    return np.array(mp), np.array(fp), np.array(se_b), ece, brier

fpr_g, tpr_g, auc_g, rec_g, pre_g, ap_g = compute_roc_pr(y_true, p_gbdt)
fpr_b, tpr_b, auc_b, rec_b, pre_b, ap_b = compute_roc_pr(y_true, p_base)
mp_g, fp_g, se_g, ece_g, brier_g = compute_calibration(y_true, p_gbdt)
mp_b, fp_b, _, ece_b, brier_b = compute_calibration(y_true, p_base)
pos_rate = float(np.mean(y_true))

fig = plt.figure(figsize=(11.4, 4.8), dpi=180)
gs = GridSpec(1, 3, wspace=0.30)
ax_roc = fig.add_subplot(gs[0])
ax_pr = fig.add_subplot(gs[1])
gs_cal = gs[2].subgridspec(2, 1, height_ratios=[3.0, 1.0], hspace=0.14)
ax_cal = fig.add_subplot(gs_cal[0])
ax_hist = fig.add_subplot(gs_cal[1], sharex=ax_cal)

ax_roc.plot([0, 1], [0, 1], color='#64748B', linestyle='--', linewidth=1.1, label='随机基线 (0.50)')
ax_roc.fill_between(fpr_g, 0, tpr_g, color=PRIMARY, alpha=0.10)
ax_roc.plot(fpr_g, tpr_g, color=PRIMARY, linewidth=2.2, label=f'GBDT (AUC={auc_g:.3f})')
ax_roc.plot(fpr_b, tpr_b, color=SECONDARY, linestyle='--', linewidth=1.8, label=f'Logit (AUC={auc_b:.3f})')
ax_roc.set_xlabel('假正例率 FPR')
ax_roc.set_ylabel('真正例率 TPR')
ax_roc.set_title('ROC 判别评估曲线', fontsize=10.2, fontweight='bold')
ax_roc.legend(frameon=False, loc='lower right', fontsize=8.0)

ax_pr.axhline(pos_rate, color=OPPOSITE, linestyle='--', linewidth=1.2, label=f'阳性基线 ({pos_rate:.2f})')
ax_pr.plot(rec_g, pre_g, color=PRIMARY, linewidth=2.2, label=f'GBDT (AP={ap_g:.3f})')
ax_pr.plot(rec_b, pre_b, color=SECONDARY, linestyle='--', linewidth=1.8, label=f'Logit (AP={ap_b:.3f})')
ax_pr.set_xlim(0.0, 1.02)
ax_pr.set_ylim(0.0, 1.05)
ax_pr.set_xlabel('召回率 Recall')
ax_pr.set_ylabel('精确率 Precision')
ax_pr.set_title('Precision-Recall 曲线', fontsize=10.2, fontweight='bold')
ax_pr.legend(frameon=False, loc='lower left', fontsize=8.0)

ax_cal.plot([0, 1], [0, 1], color='#64748B', linestyle='--', linewidth=1.1, label='完美校准 y=x')
ax_cal.errorbar(mp_g, fp_g, yerr=se_g, fmt='o-', color=PRIMARY, capsize=3, linewidth=2.0, markersize=4.5,
                label=f'GBDT (ECE={ece_g:.3f})')
ax_cal.plot(mp_b, fp_b, 's--', color=SECONDARY, linewidth=1.6, markersize=4.0,
            label=f'Logit (Brier={brier_b:.3f})')
ax_cal.set_ylim(0.0, 1.02)
ax_cal.set_ylabel('实测正例比例')
ax_cal.set_title(f'概率校准可靠性 (Brier={brier_g:.3f})', fontsize=10.2, fontweight='bold')
ax_cal.legend(frameon=False, loc='upper left', fontsize=7.8)
plt.setp(ax_cal.get_xticklabels(), visible=False)

ax_hist.hist(p_gbdt, bins=12, range=(0, 1), color=PRIMARY, alpha=0.45, edgecolor='#FFFFFF', linewidth=0.6)
ax_hist.set_xlim(0.0, 1.0)
ax_hist.set_xlabel('模型预测概率分箱')
ax_hist.set_ylabel('样本数')

for target_ax in (ax_roc, ax_pr, ax_cal, ax_hist):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.06, right=0.97, bottom=0.14, top=0.84)
`,
  },

  // -------------------------------------------------------------------------
  // 7. 生物统计与量表 (model_effect) — 23
  // -------------------------------------------------------------------------
  forest: {
    body: `
vars_name = ['感知响应时效', '制度信任水平', '熟人示范推荐', '界面适老清晰度', '隐性收费顾虑', '县域网点距离']
ors = np.array([2.42, 1.88, 1.54, 1.46, 0.62, 0.78])
ci_lo = np.array([1.74, 1.38, 1.12, 1.05, 0.45, 0.59])
ci_hi = np.array([3.36, 2.56, 2.12, 2.03, 0.85, 1.03])
y = np.arange(len(vars_name))[::-1]

ax.axvline(1.0, color=OPPOSITE, linestyle='--', linewidth=1.5, label='无效线 OR = 1.0')
for yi, or_v, lo, hi in zip(y, ors, ci_lo, ci_hi):
    col = PRIMARY if or_v >= 1.0 else SECONDARY
    ax.errorbar(or_v, yi, xerr=[[or_v - lo], [hi - or_v]], fmt='s', color=col, ecolor=col,
                capsize=5, markersize=7, linewidth=1.8)
    ax.text(3.55, yi, f'{or_v:.2f} [{lo:.2f}, {hi:.2f}]', va='center', fontsize=9)
ax.legend(handles=[mpatches.Patch(facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='优势比 OR (95% CI)')],
          frameon=False, loc='lower right')
ax.set_yticks(y)
ax.set_yticklabels(vars_name)
ax.set_xlim(0.25, 4.95)
ax.set_xlabel('多元 Logistic 优势比 Odds Ratio (95% CI)')
`,
  },

  km_survival: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
# 优先使用 lifelines.KaplanMeierFitter；若当前环境未安装则回退至纯 NumPy KM 估计器
t_a = np.clip(rng.exponential(16, 120), 1, 24)
e_a = (t_a < 23.5).astype(int)
t_b = np.clip(rng.exponential(9.5, 120), 1, 24)
e_b = (t_b < 23.5).astype(int)

def km_curve(T, E):
    try:
        from lifelines import KaplanMeierFitter
        kmf = KaplanMeierFitter().fit(T, event_observed=E)
        ci = kmf.confidence_interval_survival_function_
        return kmf.timeline, kmf.survival_function_.iloc[:, 0].values, ci.iloc[:, 0].values, ci.iloc[:, 1].values
    except ImportError:
        times = np.sort(np.unique(np.concatenate([[0.0], T])))
        surv, se_sum, s_cur = [1.0], [0.0], 1.0
        n_at_risk = len(T)
        for tt in times[1:]:
            d = np.sum((T == tt) & (E == 1))
            c = np.sum((T == tt) & (E == 0))
            if n_at_risk > d and d > 0:
                s_cur *= (1.0 - d / n_at_risk)
                se_sum.append(se_sum[-1] + d / (n_at_risk * (n_at_risk - d)))
            else:
                se_sum.append(se_sum[-1])
            surv.append(s_cur)
            n_at_risk -= (d + c)
        surv_arr = np.array(surv)
        se_arr = surv_arr * np.sqrt(np.array(se_sum))
        return times, surv_arr, np.clip(surv_arr - 1.96 * se_arr, 0, 1), np.clip(surv_arr + 1.96 * se_arr, 0, 1)

fig = plt.figure(figsize=(8.4, 5.8), dpi=180)
gs = GridSpec(2, 1, height_ratios=[3.2, 1.0], hspace=0.28)
ax = fig.add_subplot(gs[0])
ax_risk = fig.add_subplot(gs[1], sharex=ax)

for label, T, E, col in [('高粘性激励组', t_a, e_a, PRIMARY), ('常规对照组', t_b, e_b, OPPOSITE)]:
    tm, sv, lo, hi = km_curve(T, E)
    ax.step(tm, sv, where='post', color=col, linewidth=2.0, label=label)
    ax.fill_between(tm, lo, hi, step='post', facecolor=col, alpha=0.35, edgecolor=PRIMARY if col == PRIMARY else col, linewidth=1.6)
ax.set_ylabel('留存生存概率 S(t)')
ax.set_ylim(0, 1.06)
ax.legend(frameon=False, loc='upper right')

checkpoints = [0, 6, 12, 18, 24]
risk_a = [int(np.sum(t_a >= c)) for c in checkpoints]
risk_b = [int(np.sum(t_b >= c)) for c in checkpoints]
ax_risk.axis('off')
ax_risk.text(-1.2, 0.7, '激励组风险数', fontsize=8.8, color=PRIMARY, ha='right')
ax_risk.text(-1.2, 0.2, '对照组风险数', fontsize=8.8, color=OPPOSITE, ha='right')
for c, ra, rb in zip(checkpoints, risk_a, risk_b):
    ax_risk.text(c, 0.7, str(ra), ha='center', fontsize=9, color=PRIMARY)
    ax_risk.text(c, 0.2, str(rb), ha='center', fontsize=9, color=OPPOSITE)
ax.set_xlabel('追踪观测周期 (月)')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.5, fontweight='bold', y=0.97)
`,
  },

  volcano: {
    body: `
log2fc = rng.normal(0, 1.25, 160)
neg_log10p = np.abs(log2fc) * 1.4 + rng.exponential(0.9, 160)
up = (log2fc > 0.8) & (neg_log10p > 1.3)
dn = (log2fc < -0.8) & (neg_log10p > 1.3)
ns = ~(up | dn)

ax.scatter(log2fc[ns], neg_log10p[ns], s=24, color='#94A3B8', alpha=0.45, label='非显著题项')
ax.scatter(log2fc[up], neg_log10p[up], s=46, color=OPPOSITE, alpha=0.35, edgecolor=OPPOSITE, linewidth=1.6, label='显著正向提升')
ax.scatter(log2fc[dn], neg_log10p[dn], s=46, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='显著负向落差')
ax.axhline(1.3, color=SECONDARY, linestyle='--', linewidth=1.2)
ax.axvline(0.8, color=SECONDARY, linestyle='--', linewidth=1.2)
ax.axvline(-0.8, color=SECONDARY, linestyle='--', linewidth=1.2)
ax.set_xlabel('效应差异幅度 log2(Fold Change)')
ax.set_ylabel('统计显著性 -log10(p)')
`,
  },

  bland_altman: {
    body: `
m1 = rng.normal(3.8, 0.65, 110)
m2 = m1 + rng.normal(0.06, 0.24, 110)
avg = (m1 + m2) / 2
diff = m1 - m2
bias, sd = np.mean(diff), np.std(diff, ddof=1)
loa_u, loa_l = bias + 1.96 * sd, bias - 1.96 * sd

ax.axhspan(loa_l, loa_u, color=PRIMARY, alpha=0.14, label='95% 一致性界限 (LoA)')
ax.scatter(avg, diff, s=40, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='双次重测样本差值')
ax.axhline(bias, color=SECONDARY, linewidth=2.0, label=f'平均偏倚 Bias = {bias:+.3f}')
ax.axhline(loa_u, color=OPPOSITE, linestyle='--', linewidth=1.6, label=f'+1.96 SD = {loa_u:+.3f}')
ax.axhline(loa_l, color=OPPOSITE, linestyle='--', linewidth=1.6, label=f'-1.96 SD = {loa_l:+.3f}')
ax.set_xlabel('两轮测量均值 (M1 + M2) / 2')
ax.set_ylabel('两轮测量差值 (M1 - M2)')
`,
  },

  scree: {
    body: `
factors = np.arange(1, 10)
eig_actual = np.array([4.32, 2.48, 1.62, 0.88, 0.72, 0.61, 0.52, 0.44, 0.36])
eig_pa = np.array([1.34, 1.24, 1.16, 1.09, 1.02, 0.96, 0.90, 0.84, 0.78])

ax.fill_between(factors, 0, eig_actual, facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
ax.plot(factors, eig_actual, color=PRIMARY, marker='o', markersize=7, linewidth=2.2, label='实测样本特征值 (保留 3 因子)')
ax.plot(factors, eig_pa, color=SECONDARY, linestyle='--', marker='s', linewidth=1.6, label='平行分析 95% 随机阈值')
ax.axhline(1.0, color=OPPOSITE, linestyle=':', linewidth=1.5, label='Kaiser 特征值 λ = 1.0')
ax.set_xticks(factors)
ax.set_xlabel('提取公因子序号')
ax.set_ylabel('特征值 Eigenvalue')
`,
  },

  item_diag: {
    body: `
items = ['Q11', 'Q12', 'Q13', 'Q14*', 'Q15', 'Q16', 'Q17']
citc = np.array([0.68, 0.74, 0.61, 0.28, 0.71, 0.65, 0.58])
alpha_del = np.array([0.82, 0.81, 0.83, 0.87, 0.82, 0.83, 0.84])
x = np.arange(len(items))

ax.bar(x, citc, width=0.52, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='校正题总相关 CITC')
ax.axhline(0.40, color=OPPOSITE, linestyle='--', linewidth=1.4, label='CITC 保留阈值 (0.40)')
ax2 = ax.twinx()
ax2.plot(x, alpha_del, color=SECONDARY, marker='D', linewidth=2.0, label='删去该项后 Cronbach α')
ax2.axhline(0.845, color=SECONDARY, linestyle=':', linewidth=1.3)
ax2.spines['top'].set_visible(False)
ax.set_xticks(x)
ax.set_xticklabels(items)
ax.set_ylabel('CITC 相关系数')
ax2.set_ylabel('删后 Cronbach α')
h1, l1 = ax.get_legend_handles_labels()
h2, l2 = ax2.get_legend_handles_labels()
ax.legend(h1 + h2, l1 + l2, frameon=False, loc='lower right')
`,
  },

  irt_icc: {
    body: `
theta = np.linspace(-3.2, 3.2, 200)
items = [('Q11 (a=1.84, b=-0.62)', 1.84, -0.62, PRIMARY),
         ('Q12 (a=2.16, b=+0.18)', 2.16, 0.18, SECONDARY),
         ('Q15 (a=1.52, b=+0.94)', 1.52, 0.94, OPPOSITE)]
for label, a, b, col in items:
    prob = 1.0 / (1.0 + np.exp(-a * (theta - b)))
    ax.plot(theta, prob, color=col, linewidth=2.2, label=label)
    if col == PRIMARY:
        ax.fill_between(theta, 0, prob, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
ax.axhline(0.5, color='#64748B', linestyle='--', linewidth=1.2)
ax.set_xlabel('受访者潜特质能力 θ')
ax.set_ylabel('高认同响应概率 P(θ)')
`,
  },

  wright_map: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
abilities = rng.normal(0.15, 0.92, 240)
item_diff = np.array([-1.45, -0.82, -0.24, 0.36, 0.98, 1.54])
item_names = ['Q11 基础触达', 'Q12 界面清晰', 'Q13 响应速度', 'Q14 价格透明', 'Q15 售后保障', 'Q16 主动推荐']

fig = plt.figure(figsize=(8.6, 5.4), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.1, 1.3], wspace=0.12)
ax_l, ax_r = fig.add_subplot(gs[0]), fig.add_subplot(gs[1], sharey=None)

ax_l.hist(abilities, bins=16, orientation='horizontal', color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='受访者能力 θ 分布')
ax_l.invert_xaxis()
ax_l.set_ylim(-2.6, 2.6)
ax_l.set_xlabel('人数频数')
ax_l.set_ylabel('Logit 同尺度潜变量 (θ / δ)')
ax_l.legend(frameon=False, loc='upper left')

ax_r.scatter(np.zeros_like(item_diff), item_diff, s=90, color=OPPOSITE, alpha=0.35, edgecolor=OPPOSITE, linewidth=1.6, label='题项难度 δ 位置')
for d, name in zip(item_diff, item_names):
    ax_r.text(0.08, d, f'{name} (δ={d:+.2f})', va='center', fontsize=9.2, color=SECONDARY)
ax_r.set_xlim(-0.2, 1.2)
ax_r.set_ylim(-2.6, 2.6)
ax_r.set_xticks([])
ax_r.legend(frameon=False, loc='upper right')
for target_ax in (ax_l, ax_r):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.5, fontweight='bold', y=0.97)
`,
  },

  psych_network: {
    body: `
nodes = ['制度信任', '感知有用', '流程便捷', '价格顾虑', '社交口碑', '持续意愿']
n = len(nodes)
ang = np.linspace(0, 2 * np.pi, n, endpoint=False)
pos = np.column_stack([np.cos(ang), np.sin(ang)])
edges = [(0, 1, 0.42), (0, 5, 0.36), (1, 2, 0.48), (1, 5, 0.39), (2, 4, 0.28), (3, 5, -0.34), (3, 0, -0.24), (4, 5, 0.31)]

for i, j, w in edges:
    col = PRIMARY if w > 0 else OPPOSITE
    ls = '-' if w > 0 else '--'
    ax.plot([pos[i, 0], pos[j, 0]], [pos[i, 1], pos[j, 1]], color=col, linestyle=ls, linewidth=abs(w) * 7.5, alpha=0.75)
ax.scatter(pos[:, 0], pos[:, 1], s=780, color=SECONDARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, zorder=4)
for (px, py), name in zip(pos, nodes):
    ax.text(px * 1.24, py * 1.18, name, ha='center', va='center', fontsize=9.5, fontweight='bold')
ax.plot([], [], color=PRIMARY, linewidth=2.2, label='正偏相关边')
ax.plot([], [], color=OPPOSITE, linestyle='--', linewidth=2.2, label='负向抑制边')
ax.set_xlim(-1.55, 1.55)
ax.set_ylim(-1.42, 1.42)
ax.set_aspect('equal')
ax.axis('off')
`,
  },

  funnel_meta: {
    body: `
pooled = 0.34
se = rng.uniform(0.03, 0.22, 28)
eff = pooled + rng.normal(0, 1, 28) * se * 0.85
se_grid = np.linspace(0.01, 0.25, 60)

ax.fill_betweenx(se_grid, pooled - 1.96 * se_grid, pooled + 1.96 * se_grid,
                 color=PRIMARY, alpha=0.18, edgecolor=PRIMARY, linewidth=1.6, label='95% 伪置信漏斗域')
ax.scatter(eff, se, s=48, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='纳入文献研究 (k=28)')
ax.axvline(pooled, color=OPPOSITE, linewidth=2.0, label=f'合并效应量 = {pooled:.2f} (Egger p=0.41)')
ax.invert_yaxis()
ax.set_xlabel('标准化效应量 (Fisher z / SMD)')
ax.set_ylabel('标准误 Standard Error')
`,
  },

  dose_response_4pl: {
    imports: ['from scipy.optimize import curve_fit'],
    body: `
def four_pl(x, btm, top, ec50, hill):
    return btm + (top - btm) / (1.0 + (ec50 / np.maximum(x, 1e-4)) ** hill)

dose = np.array([2, 5, 10, 15, 25, 40, 60, 80])
resp = np.array([0.08, 0.14, 0.28, 0.46, 0.68, 0.81, 0.86, 0.88])
popt, _ = curve_fit(four_pl, dose, resp, p0=[0.05, 0.90, 16.0, 2.0], maxfev=5000)
xg = np.linspace(1.5, 85, 200)
yg = four_pl(xg, *popt)

ax.fill_between(xg, np.clip(yg - 0.045, 0, 1), np.clip(yg + 0.045, 0, 1),
                color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='4PL 拟合 95% CI 置信带')
ax.plot(xg, yg, color=PRIMARY, linewidth=2.2, label=f'4PL S型响应曲线 (EC50={popt[2]:.1f}%)')
ax.scatter(dose, resp, s=60, color=SECONDARY, edgecolor=PRIMARY, linewidth=1.6, zorder=5, label='实测激励档位转化率')
ax.axvline(popt[2], color=OPPOSITE, linestyle='--', linewidth=1.4, label='半数有效拐点 EC50')
ax.set_xlabel('补贴折扣激励梯度 (%)')
ax.set_ylabel('预期转化率')
`,
  },

  subgroup_forest: {
    body: `
subgroups = ['全样本总效应', '高线城市 (p_int=0.012)', '县域乡镇', '年轻组 (18–35)', '中老年组 (36+)']
est = np.array([0.41, 0.54, 0.26, 0.48, 0.32])
lo = np.array([0.33, 0.43, 0.15, 0.37, 0.21])
hi = np.array([0.49, 0.65, 0.37, 0.59, 0.43])
y = np.arange(len(subgroups))[::-1]

ax.axvline(0, color='#64748B', linestyle=':', linewidth=1.2)
ax.axvline(est[0], color=OPPOSITE, linestyle='--', linewidth=1.4, label='全样本基准效应')
for idx, (yi, e, l, h) in enumerate(zip(y, est, lo, hi)):
    col = OPPOSITE if idx == 0 else PRIMARY
    ax.barh(yi, h - l, left=l, height=0.25, facecolor=col, alpha=0.35, edgecolor=PRIMARY if idx > 0 else OPPOSITE, linewidth=1.6,
            label='亚组效应 95% CI' if idx == 1 else None)
    ax.scatter([e], [yi], s=80, marker='D' if idx == 0 else 'o', color=col, zorder=5)
    ax.text(0.68, yi, f'{e:.2f} [{l:.2f}, {h:.2f}]', va='center', fontsize=9)
ax.set_yticks(y)
ax.set_yticklabels(subgroups)
ax.set_xlim(-0.05, 0.96)
ax.set_xlabel('标准化处理效应 β (95% CI)')
`,
  },

  hlm_random_slopes: {
    imports: ['import statsmodels.api as sm'],
    body: `
n_groups, n_per = 8, 35
groups = np.repeat(np.arange(n_groups), n_per)
x_cwc = rng.normal(0, 1.0, n_groups * n_per)
u0 = np.array([-0.55, -0.32, -0.18, -0.04, 0.08, 0.22, 0.36, 0.48])
u1 = np.array([-0.24, 0.26, -0.12, 0.06, -0.18, 0.16, 0.04, 0.02])
y = (3.60 + u0[groups]) + (0.48 + u1[groups]) * x_cwc + rng.normal(0, 0.32, len(x_cwc))

exog = sm.add_constant(x_cwc)
hlm = sm.MixedLM(y, exog, groups=groups, exog_re=exog).fit(reml=True, method='lbfgs')
fe = np.asarray(hlm.fe_params)
cov_fe = np.asarray(hlm.cov_params())
xg = np.linspace(-2.0, 2.0, 80)

for g in range(n_groups):
    re = np.asarray(hlm.random_effects[g])
    yg = (fe[0] + re[0]) + (fe[1] + re[1]) * xg
    is_extreme = g in (0, 1)
    ax.plot(xg, yg, color=OPPOSITE if g == 1 else SECONDARY,
            linestyle='--' if g == 1 else '-',
            alpha=0.85 if is_extreme else 0.42, linewidth=1.6 if is_extreme else 1.2,
            label='群组随机斜率 BLUP' if g == 2 else ('高敏感极端群组' if g == 1 else None))

y_fe = fe[0] + fe[1] * xg
se_fe = np.sqrt(cov_fe[0, 0] + (xg ** 2) * cov_fe[1, 1] + 2 * xg * cov_fe[0, 1])
ax.fill_between(xg, y_fe - 1.96 * se_fe, y_fe + 1.96 * se_fe, color=PRIMARY, alpha=0.22)
ax.plot(xg, y_fe, color=PRIMARY, linewidth=2.6, label=f'固定效应均值线 (γ10={fe[1]:.2f})')
ax.scatter(x_cwc, y, s=12, color=SECONDARY, alpha=0.25)
ax.set_xlabel('组中心化个体自变量 (X_ij - 组均值)')
ax.set_ylabel('观测响应变量 Y_ij')
`,
  },

  competing_cif: {
    body: `
def simulate_aalen_johansen(n_sub, h1, h2):
    u1 = rng.exponential(1.0 / h1, n_sub)
    u2 = rng.exponential(1.0 / h2, n_sub)
    cens = rng.uniform(18.0, 42.0, n_sub)
    t_obs = np.minimum(np.minimum(u1, u2), cens)
    ev = np.where(t_obs == cens, 0, np.where(u1 <= u2, 1, 2))
    times = np.sort(np.unique(t_obs[ev > 0]))
    s_all, c1, c2 = 1.0, 0.0, 0.0
    t_grid, cif1, cif2 = [0.0], [0.0], [0.0]
    for t in times:
        if t > 36.0:
            break
        at_risk = np.sum(t_obs >= t)
        d1 = np.sum((t_obs == t) & (ev == 1))
        d2 = np.sum((t_obs == t) & (ev == 2))
        c1 += s_all * (d1 / at_risk)
        c2 += s_all * (d2 / at_risk)
        s_all *= (1.0 - (d1 + d2) / at_risk)
        t_grid.append(t)
        cif1.append(c1)
        cif2.append(c2)
    t_grid.append(36.0)
    cif1.append(cif1[-1])
    cif2.append(cif2[-1])
    return np.array(t_grid), np.array(cif1), np.array(cif2)

t_trt, cif1_trt, cif2_trt = simulate_aalen_johansen(260, 0.030, 0.009)
t_ctl, cif1_ctl, cif2_ctl = simulate_aalen_johansen(260, 0.015, 0.010)

ax.step(t_trt, cif1_trt, where='post', color=PRIMARY, linewidth=2.3, label='目标事件 CIF (干预组)')
ax.step(t_ctl, cif1_ctl, where='post', color=SECONDARY, linestyle='--', linewidth=2.0, label='目标事件 CIF (对照组)')
ax.step(t_trt, cif2_trt, where='post', color=OPPOSITE, linewidth=1.8, label='竞争事件 CIF (替代流失)')
ax.fill_between(t_trt, 0, cif1_trt, step='post', color=PRIMARY, alpha=0.14)
ax.set_xlim(0, 36)
ax.set_ylim(0, 0.85)
ax.set_xlabel('随访观察时间 (月)')
ax.set_ylabel('Aalen-Johansen 累积发生概率 CIF(t)')
`,
  },

  decision_curve_dca: {
    body: `
n_obs = 800
y_true = rng.binomial(1, 0.28, n_obs)
p_full = np.clip(0.14 + 0.56 * y_true + rng.normal(0, 0.16, n_obs), 0.01, 0.99)
p_base = np.clip(0.20 + 0.36 * y_true + rng.normal(0, 0.20, n_obs), 0.01, 0.99)

pts = np.linspace(0.02, 0.80, 120)
def net_benefit(y, p_hat, thr):
    tp = np.sum((p_hat >= thr) & (y == 1))
    fp = np.sum((p_hat >= thr) & (y == 0))
    return (tp / len(y)) - (fp / len(y)) * (thr / (1.0 - thr))

nb_full = np.array([net_benefit(y_true, p_full, pt) for pt in pts])
nb_base = np.array([net_benefit(y_true, p_base, pt) for pt in pts])
pi = float(np.mean(y_true))
nb_all = pi - (1.0 - pi) * (pts / (1.0 - pts))
nb_floor = np.maximum(0.0, nb_all)

ax.axhline(0.0, color='#475569', linewidth=1.3, label='均不干预 (Treat None)')
ax.plot(pts, nb_all, color=OPPOSITE, linestyle='--', linewidth=1.6, label='全部干预 (Treat All)')
ax.plot(pts, nb_base, color=SECONDARY, linestyle='-.', linewidth=1.8, label='单维基线模型')
ax.plot(pts, nb_full, color=PRIMARY, linewidth=2.4, label='多维融合预测模型')
ax.fill_between(pts, nb_floor, np.maximum(nb_floor, nb_full), color=PRIMARY, alpha=0.16, label='模型净获益增量区间')
ax.set_xlim(0.0, 0.80)
ax.set_ylim(-0.06, 0.32)
ax.set_xlabel('决策阈值概率 Pt')
ax.set_ylabel('决策净获益 (Net Benefit)')
`,
  },

  restricted_cubic_spline: {
    body: `
n = 750
x = np.clip(rng.gamma(3.8, 10.5, n), 6.0, 88.0)
knots = np.percentile(x, [5, 35, 65, 95])
t1, t2, t3, t4 = knots

def rcs_basis(v):
    pos = lambda u: np.maximum(0.0, u)
    scale = (t4 - t1) ** 2
    s1 = (pos(v - t1) ** 3 - pos(v - t3) ** 3 * (t4 - t1) / (t4 - t3) + pos(v - t4) ** 3 * (t3 - t1) / (t4 - t3)) / scale
    s2 = (pos(v - t2) ** 3 - pos(v - t3) ** 3 * (t4 - t2) / (t4 - t3) + pos(v - t4) ** 3 * (t3 - t2) / (t4 - t3)) / scale
    return np.column_stack([np.ones_like(v), v, s1, s2])

# 真实 J 型非线性剂量—效应生成 Logistic 结局
eta_true = -1.15 + 0.008 * x + 0.0011 * np.maximum(0.0, x - 44.0) ** 2
p_true = 1.0 / (1.0 + np.exp(-eta_true))
y = rng.binomial(1, p_true, n)

B = rcs_basis(x)
beta = np.zeros(B.shape[1])
for _ in range(18):
    p = 1.0 / (1.0 + np.exp(-np.clip(B @ beta, -20, 20)))
    w = p * (1.0 - p) + 1e-6
    H = B.T @ (w[:, None] * B) + 1e-5 * np.eye(B.shape[1])
    beta += np.linalg.solve(H, B.T @ (y - p))

cov = np.linalg.inv(B.T @ (((1.0 / (1.0 + np.exp(-B @ beta))) * (1.0 - 1.0 / (1.0 + np.exp(-B @ beta))))[:, None] * B) + 1e-5 * np.eye(B.shape[1]))
grid = np.linspace(6.0, 88.0, 120)
x_ref = float(t2)
D = rcs_basis(grid) - rcs_basis(np.array([x_ref]))
log_or = D @ beta
se_or = np.sqrt(np.maximum(0.0, np.sum((D @ cov) * D, axis=1)))
or_val, or_lo, or_hi = np.exp(log_or), np.exp(log_or - 1.96 * se_or), np.exp(log_or + 1.96 * se_or)

ax.axhline(1.0, color='#475569', linestyle='--', linewidth=1.2, label=f'参照线 OR = 1.0 (Ref P35={x_ref:.1f})')
ax.fill_between(grid, or_lo, or_hi, color=PRIMARY, alpha=0.18, label='95% 置信带')
ax.plot(grid, or_val, color=PRIMARY, linewidth=2.4, label='4-Knot RCS 优势比曲线')
for k_lbl, kv in zip(['P5', 'P35', 'P65', 'P95'], knots):
    ax.axvline(kv, color=OPPOSITE, linestyle=':', linewidth=1.0, alpha=0.7)
    ax.text(kv, ax.get_ylim()[0] + 0.04, k_lbl, ha='center', va='bottom', fontsize=8, color=OPPOSITE, fontweight='bold')
ax.scatter([x_ref], [1.0], s=75, color='#FFFFFF', edgecolor=PRIMARY, linewidth=2.0, zorder=5)
ax.set_xlabel('连续暴露指标 X (节点 P5 / P35 / P65 / P95)')
ax.set_ylabel('调整优势比 OR (95% CI)')
`,
  },

  rmst_survival_diff: {
    body: `
n_g = 180
tau = 24.0

def sim_group(rate_early, rate_late):
    u = rng.uniform(1e-6, 1.0, n_g)
    t_ev = np.where(u > 0.65, -np.log(u) / rate_early, 3.0 - np.log(u / 0.65) / rate_late)
    t_cens = rng.uniform(12.0, 32.0, n_g)
    return np.minimum(t_ev, t_cens), (t_ev <= t_cens).astype(int)

t1, e1 = sim_group(0.016, 0.018)
t0, e0 = sim_group(0.022, 0.056)

def km_and_rmst(t_arr, e_arr, horizon):
    times_ev = np.unique(t_arr[(e_arr == 1) & (t_arr <= horizon)])
    ts, ss, var_terms = [0.0], [1.0], []
    s_cur = 1.0
    for tj in times_ev:
        n_risk = float(np.sum(t_arr >= tj))
        d_ev = float(np.sum((t_arr == tj) & (e_arr == 1)))
        if n_risk > d_ev and n_risk > 0:
            s_cur *= (1.0 - d_ev / n_risk)
            var_terms.append((tj, d_ev / (n_risk * (n_risk - d_ev))))
        ts.append(float(tj))
        ss.append(s_cur)
    ts.append(horizon)
    ss.append(s_cur)
    ts_a, ss_a = np.array(ts), np.array(ss)
    rmst = float(np.sum(ss_a[:-1] * np.diff(ts_a)))
    var_r = 0.0
    for tj, dv in var_terms:
        mask = ts_a[:-1] >= tj
        area_after = float(np.sum(ss_a[:-1][mask] * np.diff(ts_a)[mask]))
        var_r += dv * (area_after ** 2)
    return ts_a, ss_a, rmst, float(np.sqrt(var_r))

ts1, ss1, r1, se1 = km_and_rmst(t1, e1, tau)
ts0, ss0, r0, se0 = km_and_rmst(t0, e0, tau)
grid_t = np.sort(np.unique(np.concatenate([ts1, ts0])))
s1_g = ss1[np.searchsorted(ts1, grid_t, side='right') - 1]
s0_g = ss0[np.searchsorted(ts0, grid_t, side='right') - 1]
drmst = r1 - r0
se_d = float(np.hypot(se1, se0))

ax.fill_between(grid_t, s0_g, s1_g, step='post', color=OPPOSITE, alpha=0.18,
                label=f'ΔRMST = {drmst:+.2f}月 (95%CI: {drmst - 1.96*se_d:.2f}–{drmst + 1.96*se_d:.2f})')
ax.step(ts1, ss1, where='post', color=PRIMARY, linewidth=2.3, label=f'干预组 S1(t) [RMST={r1:.2f}月]')
ax.step(ts0, ss0, where='post', color=SECONDARY, linewidth=2.1, label=f'对照组 S0(t) [RMST={r0:.2f}月]')
ax.axvline(tau, color=OPPOSITE, linestyle='--', linewidth=1.3, label=f'预设定截断时窗 τ* = {tau:.0f}月')
ax.set_xlim(0, tau + 2.0)
ax.set_ylim(0, 1.05)
ax.set_xlabel('随访观察时间 t (月)')
ax.set_ylabel('无事件生存概率 S(t)')
`,
  },

  mcmc_trace_rhat: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
# 运行 3 条独立 Metropolis-Hastings MCMC 采样链估计后验参数 theta
n_warmup, n_keep, n_chains = 300, 1000, 3
chains = np.zeros((n_chains, n_keep))
mu_post, sd_post = 0.42, 0.068
for c in range(n_chains):
    cur = rng.normal(0.42, 0.25)
    for step in range(n_warmup + n_keep):
        prop = cur + rng.normal(0.0, 0.095)
        log_acc = -0.5 * (((prop - mu_post) / sd_post) ** 2 - ((cur - mu_post) / sd_post) ** 2)
        if np.log(rng.uniform()) < log_acc:
            cur = prop
        if step >= n_warmup:
            chains[c, step - n_warmup] = cur

# 计算 Gelman-Rubin 收敛诊断 R-hat 与近似有效样本量 ESS
chain_means = chains.mean(axis=1)
B = n_keep * np.var(chain_means, ddof=1)
W = np.mean(np.var(chains, axis=1, ddof=1))
var_hat = ((n_keep - 1.0) / n_keep) * W + B / n_keep
r_hat = float(np.sqrt(var_hat / W))

centered = chains[0] - chain_means[0]
acf = np.correlate(centered, centered, mode='full')[n_keep - 1:] / (np.var(chains[0]) * n_keep)
tau_int = 1.0 + 2.0 * float(np.sum(acf[1:25][acf[1:25] > 0]))
ess = (n_chains * n_keep) / max(1.0, tau_int)

pooled = chains.ravel()
hdi_lo, hdi_hi = np.quantile(pooled, [0.025, 0.975])
x_grid = np.linspace(0.16, 0.68, 160)
bw = 1.06 * np.std(pooled) * (len(pooled) ** (-0.2))

fig = plt.figure(figsize=(10.2, 4.6), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.4, 1.0], wspace=0.24)
ax_tr, ax_kde = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

chain_cols = [PRIMARY, SECONDARY, OPPOSITE]
for c in range(n_chains):
    ax_tr.plot(np.arange(n_keep), chains[c], color=chain_cols[c], alpha=0.72, linewidth=0.9, label=f'Chain {c+1}')
    kde_y = np.mean(np.exp(-0.5 * ((x_grid[:, None] - chains[c][None, :]) / bw) ** 2), axis=1) / (bw * np.sqrt(2.0 * np.pi))
    ax_kde.plot(x_grid, kde_y, color=chain_cols[c], linewidth=1.8, label=f'Chain {c+1}')

ax_tr.axhline(float(np.mean(pooled)), color='#334155', linestyle='--', linewidth=1.1)
ax_tr.set_xlabel('MCMC 后验迭代步数 (Post-Warmup)')
ax_tr.set_ylabel('参数抽样轨迹 θ')
ax_tr.set_title('多链采样混合轨迹 (Trace Plot)', fontsize=10.5, fontweight='bold')
ax_tr.legend(frameon=False, loc='upper right', ncol=3, fontsize=8)

ax_kde.fill_between(x_grid, 0.0, np.mean(np.exp(-0.5 * ((x_grid[:, None] - pooled[None, :]) / bw) ** 2), axis=1) / (bw * np.sqrt(2.0 * np.pi)), color=PRIMARY, alpha=0.14)
ax_kde.plot([hdi_lo, hdi_hi], [0.22, 0.22], color=PRIMARY, linewidth=4.2, solid_capstyle='round', label=f'95% HDI [{hdi_lo:.2f}, {hdi_hi:.2f}]')
ax_kde.text(0.05, 0.88, f'R-hat = {r_hat:.4f}\\nESS ≈ {ess:.0f}', transform=ax_kde.transAxes, fontsize=9.0, fontweight='bold', color=SECONDARY)
ax_kde.set_xlabel('后验参数 θ')
ax_kde.set_ylabel('核密度估计')
ax_kde.set_title('后验核密度与收敛诊断', fontsize=10.5, fontweight='bold')
ax_kde.legend(frameon=False, loc='upper right', fontsize=8)

for target_ax in (ax_tr, ax_kde):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.08, right=0.97, bottom=0.14, top=0.84)
`,
  },

  trial_sequential_tsa: {
    imports: ['import math'],
    body: `
ris = 1860.0
n_seq = np.array([180, 360, 560, 780, 1000, 1220, 1420, 1600], dtype=float)
z_cum = np.array([0.52, 1.04, 1.56, 2.02, 2.48, 2.86, 3.22, 3.55])

# 基于 Lan-DeMets O'Brien-Fleming alpha 消耗函数计算双侧监控界值 (纯 stdlib math.erf)
def norm_cdf(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))

def inv_norm_cdf(p):
    lo, hi = 0.0, 8.0
    for _ in range(50):
        mid = 0.5 * (lo + hi)
        if norm_cdf(mid) < p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)

n_grid = np.linspace(240.0, 2050.0, 120)
info_frac = np.clip(n_grid / ris, 0.08, 1.0)
alpha_spent = np.array([2.0 * (1.0 - norm_cdf(1.95996 / math.sqrt(t))) for t in info_frac])
z_obf = np.array([min(4.8, inv_norm_cdf(1.0 - max(1e-7, a / 2.0))) for a in alpha_spent])

ax.axhline(0.0, color='#64748B', linewidth=1.0)
ax.axhline(1.96, color='#64748B', linestyle=':', linewidth=1.2, label='传统固定显著界 |Z|=1.96')
ax.axhline(-1.96, color='#64748B', linestyle=':', linewidth=1.2)
ax.axvline(ris, color=OPPOSITE, linestyle='--', linewidth=1.4, label=f'期望信息量 RIS = {ris:.0f}')
ax.plot(n_grid, z_obf, color=OPPOSITE, linestyle='--', linewidth=1.8, label="O'Brien-Fleming 获益监控界")
ax.plot(n_grid, -z_obf, color=OPPOSITE, linestyle='--', linewidth=1.8)
ax.plot([760.0, ris], [0.0, 1.96], color=SECONDARY, linestyle='-.', linewidth=1.3, label='无效边界 (Futility Wedge)')
ax.plot([760.0, ris], [0.0, -1.96], color=SECONDARY, linestyle='-.', linewidth=1.3)

ax.plot(n_seq, z_cum, color=PRIMARY, marker='o', markersize=5.5, linewidth=2.4, label='累积检验 Z 曲线')
cross_idx = 5
ax.scatter([n_seq[cross_idx]], [z_cum[cross_idx]], s=110, color=OPPOSITE, zorder=6)
ax.annotate(f'提前跨越获益界 (n={n_seq[cross_idx]:.0f})', xy=(n_seq[cross_idx], z_cum[cross_idx]),
            xytext=(n_seq[cross_idx] - 460, z_cum[cross_idx] + 0.7), fontsize=8.8, fontweight='bold', color=OPPOSITE,
            arrowprops=dict(arrowstyle='->', color=OPPOSITE, lw=1.3))

ax.set_xlim(0, 2100)
ax.set_ylim(-4.6, 5.1)
ax.set_xlabel('累积入组样本量 n (Information Size)')
ax.set_ylabel('累积检验统计量 Z-Score')
`,
  },

  kano_better_worse_scatter: {
    body: `
feats = ['一键预约', '透明账单', '智能导诊', '适老语音', '隐私脱敏', '极简退订', '节日换肤', '徽章积分']
worse_abs = np.array([0.78, 0.66, 0.24, 0.36, 0.84, 0.65, 0.18, 0.36])
better = np.array([0.84, 0.64, 0.82, 0.66, 0.34, 0.24, 0.20, 0.36])
mentions = np.array([420, 340, 385, 290, 410, 310, 140, 180])
quad_cols = [PRIMARY, PRIMARY, SECONDARY, SECONDARY, OPPOSITE, OPPOSITE, '#64748B', '#64748B']

ax.axvspan(0.0, 0.5, ymin=0.5, ymax=1.0, color=SECONDARY, alpha=0.06)
ax.axvspan(0.5, 1.0, ymin=0.5, ymax=1.0, color=PRIMARY, alpha=0.07)
ax.axvspan(0.5, 1.0, ymin=0.0, ymax=0.5, color=OPPOSITE, alpha=0.07)
ax.axvspan(0.0, 0.5, ymin=0.0, ymax=0.5, color='#94A3B8', alpha=0.08)

th = np.linspace(0, np.pi / 2, 80)
for rad in (0.55, 0.85):
    ax.plot(rad * np.cos(th), rad * np.sin(th), color='#94A3B8', linestyle=':', linewidth=1.1)
ax.axvline(0.50, color='#475569', linestyle='--', linewidth=1.1, label='均值分界 |DSI|=0.50 / SI=0.50')
ax.axhline(0.50, color='#475569', linestyle='--', linewidth=1.1)

ax.scatter(worse_abs, better, s=mentions * 0.48, c=quad_cols, alpha=0.78, edgecolor='#FFFFFF', linewidth=1.2, zorder=5)
offsets = [(-10, -10), (8, -6), (8, 4), (-10, 6), (-10, 6), (8, -6), (8, 4), (-8, 10)]
for name, x, y, col, (dx, dy) in zip(feats, worse_abs, better, quad_cols, offsets):
    ax.annotate(name, (x, y), xytext=(dx, dy), textcoords='offset points',
                ha='right' if dx < 0 else 'left', fontsize=8.8, fontweight='bold', color=col)

ax.text(0.04, 0.94, '魅力属性 (A)', fontsize=9.5, fontweight='bold', color=SECONDARY)
ax.text(0.96, 0.94, '期望属性 (O)', fontsize=9.5, fontweight='bold', color=PRIMARY, ha='right')
ax.text(0.04, 0.04, '无差异属性 (I)', fontsize=9.5, color='#64748B')
ax.text(0.96, 0.04, '必备属性 (M)', fontsize=9.5, fontweight='bold', color=OPPOSITE, ha='right')
ax.set_xlim(0.0, 1.0)
ax.set_ylim(0.0, 1.0)
ax.set_xlabel('|Worse| 不满意系数 (|DSI|, 圆弧为等敏感优先级环)')
ax.set_ylabel('Better 满意系数 (SI)')
`,
  },

  cox_nomogram_calibration: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
fig = plt.figure(figsize=(10.5, 5.0), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.12, 1.05], wspace=0.26)
ax_nom = fig.add_subplot(gs[0])
ax_cal = fig.add_subplot(gs[1])

# 左图: Cox 列线图多维评分映射标尺
rulers = [
    ('得分 Points', ['0', '25', '50', '75', '100'], '#334155', 0.85),
    ('风险指数 X*beta', ['低危', '中低', '中高', '高危'], PRIMARY, 0.68),
    ('基线年龄 (岁)', ['<35', '45', '55', '65+'], SECONDARY, 0.51),
    ('总得分 Total', ['40', '90', '140', '190'], '#334155', 0.34),
    ('5年生存概率', ['0.90', '0.75', '0.55', '0.35'], OPPOSITE, 0.17),
]
for lbl, tks, col, y_pos in rulers:
    ax_nom.plot([0.26, 0.94], [y_pos, y_pos], color=col, linewidth=2.0)
    ax_nom.text(0.24, y_pos, lbl, ha='right', va='center', fontsize=8.8, fontweight='bold', color=col)
    xs = np.linspace(0.26, 0.94, len(tks))
    for xv, tk in zip(xs, tks):
        ax_nom.plot([xv, xv], [y_pos - 0.018, y_pos + 0.018], color=col, linewidth=1.2)
        ax_nom.text(xv, y_pos - 0.045, tk, ha='center', va='top', fontsize=7.8, color='#475569')
ax_nom.set_xlim(0.0, 1.0)
ax_nom.set_ylim(0.05, 0.98)
ax_nom.axis('off')
ax_nom.set_title('Cox 比例风险多因素列线图评分尺', fontsize=10.5, fontweight='bold')

# 右图: 1/3/5 年 Bootstrap 校准曲线
ax_cal.plot([0.15, 0.95], [0.15, 0.95], color='#64748B', linestyle='--', linewidth=1.3, label='理想 45 度校准线')
horizons = [
    ('1年预测校准 (Brier=0.072)', [0.54, 0.67, 0.79, 0.90], [0.55, 0.66, 0.80, 0.89], [0.035, 0.032, 0.028, 0.024], PRIMARY, 'o'),
    ('3年预测校准 (Brier=0.104)', [0.38, 0.54, 0.70, 0.84], [0.37, 0.56, 0.68, 0.83], [0.044, 0.040, 0.036, 0.032], SECONDARY, 's'),
    ('5年预测校准 (Brier=0.118)', [0.25, 0.42, 0.58, 0.74], [0.27, 0.40, 0.56, 0.75], [0.050, 0.048, 0.044, 0.038], OPPOSITE, '^'),
]
for lbl, pred_p, obs_p, se_p, col, mk in horizons:
    ax_cal.errorbar(pred_p, obs_p, yerr=np.array(se_p) * 1.4, fmt=f'{mk}-', color=col, ecolor=col,
                    capsize=3.5, linewidth=1.9, markersize=5.8, label=lbl)
ax_cal.text(0.95, 0.22, 'C-index = 0.812\\n1000x Bootstrap', ha='right', va='bottom', fontsize=8.5,
            fontweight='bold', color=PRIMARY, bbox=dict(boxstyle='round,pad=0.3', fc='#FFFFFF', ec=PRIMARY, alpha=0.9))
ax_cal.set_xlim(0.15, 0.96)
ax_cal.set_ylim(0.15, 0.96)
ax_cal.set_xlabel('Nomogram 模型预测生存概率')
ax_cal.set_ylabel('Kaplan-Meier 实测生存概率')
ax_cal.set_title('1 / 3 / 5 年多时间窗生存校准曲线', fontsize=10.5, fontweight='bold')
ax_cal.legend(frameon=False, loc='upper left', fontsize=7.8)
ax_cal.spines['top'].set_visible(False)
ax_cal.spines['right'].set_visible(False)
ax_cal.grid(True, linestyle='--', alpha=0.25)

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.04, right=0.97, bottom=0.13, top=0.84)
`,
  },

  pca_biplot_loadings: {
    body: `
# 生成 3 群潜结构观测数据并基于 SVD 执行 PCA 双标投射
n_per = 55
c1 = rng.multivariate_normal([1.3, 0.9, 1.2, 0.6, -0.8, -0.7], 0.38 * np.eye(6), n_per)
c2 = rng.multivariate_normal([-0.1, 0.1, 0.2, 1.0, -0.1, 0.2], 0.36 * np.eye(6), n_per)
c3 = rng.multivariate_normal([-1.2, -1.0, -0.9, -0.8, 1.1, 1.0], 0.40 * np.eye(6), n_per)
X = np.vstack([c1, c2, c3])
grp = np.repeat([0, 1, 2], n_per)
Z = (X - X.mean(axis=0)) / X.std(axis=0)

U, S, Vt = np.linalg.svd(Z, full_matrices=False)
exp_var = (S ** 2) / np.sum(S ** 2) * 100.0
scores = U[:, :2] * S[:2] / np.sqrt(len(Z) - 1) * 1.9
loadings = Vt[:2, :].T * S[:2] / np.sqrt(len(Z) - 1) * 2.4

ax.axhline(0.0, color='#64748B', linestyle='--', linewidth=1.0)
ax.axvline(0.0, color='#64748B', linestyle='--', linewidth=1.0)
grp_meta = [('C1 核心高粘群', PRIMARY), ('C2 稳健平衡群', SECONDARY), ('C3 价格顾虑群', '#64748B')]
for gid, (glbl, gcol) in enumerate(grp_meta):
    pts = scores[grp == gid]
    ax.scatter(pts[:, 0], pts[:, 1], s=34, color=gcol, alpha=0.72, edgecolor='#FFFFFF', linewidth=0.6, label=glbl)
    cov = np.cov(pts.T)
    vals, vecs = np.linalg.eigh(cov)
    order = vals.argsort()[::-1]
    vals, vecs = vals[order], vecs[:, order]
    theta = float(np.degrees(np.arctan2(*vecs[:, 0][::-1])))
    w_e, h_e = 2.0 * 2.447 * np.sqrt(vals)
    ell = mpatches.Ellipse(xy=pts.mean(axis=0), width=w_e, height=h_e, angle=theta,
                           facecolor=gcol, alpha=0.10, edgecolor=gcol, linestyle='--', linewidth=1.3)
    ax.add_patch(ell)

item_names = ['Q1 流程便利', 'Q2 响应时效', 'Q3 制度信任', 'Q4 口碑传播', 'Q5 价格顾虑', 'Q6 操作门槛']
for name, (lx, ly) in zip(item_names, loadings):
    ax.annotate('', xy=(lx, ly), xytext=(0.0, 0.0),
                arrowprops=dict(arrowstyle='->', color=OPPOSITE, lw=1.9))
    ax.text(lx * 1.12, ly * 1.12, name, fontsize=8.8, fontweight='bold', color=OPPOSITE,
            ha='left' if lx >= 0 else 'right', va='center')

ax.plot([], [], color=OPPOSITE, linewidth=1.9, label='Varimax 因子载荷矢量')
x_bound = max(float(np.abs(scores[:, 0]).max()), float(np.abs(loadings[:, 0]).max()) * 1.25) + 0.85
y_bound = max(float(np.abs(scores[:, 1]).max()), float(np.abs(loadings[:, 1]).max()) * 1.25) + 0.55
ax.set_xlim(-x_bound, x_bound)
ax.set_ylim(-y_bound, y_bound)
ax.set_xlabel(f'PC1 / Factor 1 ({exp_var[0]:.1f}%)')
ax.set_ylabel(f'PC2 / Factor 2 ({exp_var[1]:.1f}%)')
`,
  },

  meta_funnel_trimfill: {
    imports: ['import math'],
    body: `
# 构造不对称发表偏倚文献样本并执行 Egger 截距检验 + Duval-Tweedie L0 Trim-and-Fill 剪补算法
sei = np.array([0.04, 0.055, 0.07, 0.085, 0.10, 0.115, 0.13, 0.145, 0.16, 0.18, 0.20, 0.22, 0.24, 0.27, 0.29, 0.31])
yi = np.array([0.23, 0.28, 0.20, 0.34, 0.27, 0.39, 0.24, 0.45, 0.33, 0.52, 0.41, 0.58, 0.49, 0.62, 0.56, 0.66])
k = len(yi)
vi = sei ** 2

def iv_pooled(y_arr, v_arr):
    w = 1.0 / v_arr
    mu = float(np.sum(w * y_arr) / np.sum(w))
    q = float(np.sum(w * ((y_arr - mu) ** 2)))
    c_val = float(np.sum(w) - np.sum(w ** 2) / np.sum(w))
    tau2 = max(0.0, (q - (len(y_arr) - 1.0)) / max(c_val, 1e-9))
    w_re = 1.0 / (v_arr + tau2)
    return float(np.sum(w_re * y_arr) / np.sum(w_re)), tau2

mu_orig, _ = iv_pooled(yi, vi)

# Egger 回归检验: (yi / sei) = b0 + b1 * (1 / sei)
prec = 1.0 / sei
snd = yi / sei
X_egg = np.column_stack([np.ones(k), prec])
b_egg = np.linalg.lstsq(X_egg, snd, rcond=None)[0]
res_egg = snd - X_egg @ b_egg
s2_egg = float(np.sum(res_egg ** 2) / (k - 2))
se_b0 = math.sqrt(s2_egg * float(np.linalg.inv(X_egg.T @ X_egg)[0, 0]))
t_egg = float(b_egg[0] / se_b0)

# Duval-Tweedie 迭代 L0 Trim-and-Fill 剪补估计缺失研究数 k0
mu_cur = mu_orig
k0 = 0
for _ in range(15):
    diffs = yi - mu_cur
    abs_ranks = np.argsort(np.argsort(np.abs(diffs))) + 1
    sr = float(np.sum(abs_ranks[diffs > 0]))
    k0_new = int(max(0, min(k // 2, round((4.0 * sr - k * (k + 1.0)) / (2.0 * k - 1.0)))))
    if k0_new == k0 and k0 > 0:
        break
    k0 = k0_new
    if k0 > 0:
        keep_idx = np.argsort(yi)[:k - k0]
        mu_cur, _ = iv_pooled(yi[keep_idx], vi[keep_idx])

right_idx = np.argsort(yi)[k - k0:] if k0 > 0 else np.array([], dtype=int)
yi_imp = 2.0 * mu_cur - yi[right_idx]
sei_imp = sei[right_idx]
yi_all = np.concatenate([yi, yi_imp])
vi_all = np.concatenate([vi, sei_imp ** 2])
mu_adj, _ = iv_pooled(yi_all, vi_all)

# 轮廓增强显著性漏斗分区 (基于中心 0 检验 |z| = |y| / SE)
se_max = 0.34
se_g = np.linspace(0.0, se_max, 80)
ax.axvspan(-0.55, 0.85, color='#CBD5E1', alpha=0.28, label='p < 0.01 显著区')
ax.fill_betweenx(se_g, -2.576 * se_g, 2.576 * se_g, color='#E2E8F0', alpha=0.80, label='0.01 <= p < 0.05 区')
ax.fill_betweenx(se_g, -1.960 * se_g, 1.960 * se_g, color='#F8FAFC', alpha=0.90, label='0.05 <= p < 0.10 区')
ax.fill_betweenx(se_g, -1.645 * se_g, 1.645 * se_g, color='#FFFFFF', alpha=1.0, label='p >= 0.10 非显著漏斗')

ax.plot(mu_adj - 1.96 * se_g, se_g, color=PRIMARY, linestyle='--', linewidth=1.2)
ax.plot(mu_adj + 1.96 * se_g, se_g, color=PRIMARY, linestyle='--', linewidth=1.2, label='校正后 95% 伪置信界')
ax.axvline(0.0, color='#64748B', linestyle=':', linewidth=1.0)
ax.axvline(mu_orig, color=OPPOSITE, linestyle='--', linewidth=1.8, label=f'原始合并效应 = {mu_orig:.3f} (Egger t={t_egg:.2f})')
ax.axvline(mu_adj, color=PRIMARY, linewidth=2.2, label=f'Trim-Fill 校正效应 = {mu_adj:.3f} (k0={k0})')

ax.scatter(yi, sei, s=55, color=SECONDARY, edgecolor='#FFFFFF', linewidth=0.8, zorder=5, label=f'实测纳入文献 (k={k})')
if k0 > 0:
    ax.scatter(yi_imp, sei_imp, s=64, facecolor='#FFFFFF', edgecolor=OPPOSITE, linewidth=1.9, zorder=6, label=f'剪补插补缺失研究 (k0={k0})')

ax.annotate('', xy=(mu_adj, 0.31), xytext=(mu_orig, 0.31),
            arrowprops=dict(arrowstyle='->', color=OPPOSITE, lw=1.8))
ax.text(0.5 * (mu_orig + mu_adj), 0.295, f'Delta={mu_adj - mu_orig:+.3f}', ha='center', fontsize=8.6, fontweight='bold', color=OPPOSITE)

ax.set_xlim(-0.55, 0.85)
ax.set_ylim(se_max, 0.0)
ax.set_xlabel('标准化效应量 (Fisher z / SMD)')
ax.set_ylabel('标准误 SE (倒置，精度自下而上递增)')
`,
  },

  // -------------------------------------------------------------------------
  // 8. 人群细分与决策 (group_scale) — 17
  // -------------------------------------------------------------------------
  radar: {
    mode: 'polar',
    body: `
dims = ['触达便利', '价格敏感', '制度信任', '适老诉求', '复购粘性']
clusters = [
    ('C1 核心拥趸群 (36%)', [4.5, 2.8, 4.4, 3.6, 4.6], PRIMARY),
    ('C2 务实观望群 (42%)', [3.6, 3.7, 3.5, 3.8, 3.4], SECONDARY),
    ('C3 价格敏感群 (22%)', [2.9, 4.6, 3.0, 4.1, 2.5], OPPOSITE),
]
angles = np.linspace(0, 2 * np.pi, len(dims), endpoint=False)
angles_c = np.concatenate([angles, [angles[0]]])
for name, vals, col in clusters:
    vc = np.concatenate([vals, [vals[0]]])
    ax.fill(angles_c, vc, facecolor=col, alpha=0.35, edgecolor=PRIMARY if col == PRIMARY else col, linewidth=1.6, label=name)
    ax.plot(angles_c, vc, color=col, linewidth=1.8, marker='o', markersize=4.5)
ax.set_xticks(angles)
ax.set_xticklabels(dims, fontsize=9.5)
ax.set_ylim(0, 5.2)
`,
  },

  silhouette_elbow: {
    body: `
ks = np.arange(2, 9)
sse = np.array([1820, 1140, 820, 690, 610, 560, 520])
sil = np.array([0.44, 0.62, 0.56, 0.48, 0.42, 0.39, 0.36])

ax.plot(ks, sse, color=PRIMARY, marker='o', linewidth=2.2, label='簇内平方和 SSE (左轴)')
ax.fill_between(ks, sse.min() * 0.9, sse, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
ax2 = ax.twinx()
ax2.plot(ks, sil, color=OPPOSITE, marker='s', linestyle='--', linewidth=2.0, label='平均轮廓系数 Silhouette (右轴)')
ax2.axvline(3, color=SECONDARY, linestyle=':', linewidth=1.6, label='最优聚类数 K = 3')
ax2.spines['top'].set_visible(False)
ax.set_xticks(ks)
ax.set_xlabel('候选聚类簇数 K')
ax.set_ylabel('簇内总误差平方和 SSE')
ax2.set_ylabel('轮廓系数 Silhouette Score')
h1, l1 = ax.get_legend_handles_labels()
h2, l2 = ax2.get_legend_handles_labels()
ax.legend(h1 + h2, l1 + l2, frameon=False, loc='upper right')
`,
  },

  lca_profile: {
    body: `
indicators = ['定期使用', '价格敏感', '社交推荐', '多端切换', '售后维权']
x = np.arange(len(indicators))
classes = [
    ('Class 1 忠实活跃 (34%, Entropy=0.86)', [0.88, 0.28, 0.82, 0.74, 0.32], PRIMARY),
    ('Class 2 中间游离 (45%)', [0.52, 0.58, 0.44, 0.48, 0.54], SECONDARY),
    ('Class 3 流失预警 (21%)', [0.16, 0.86, 0.18, 0.22, 0.78], OPPOSITE),
]
for name, probs, col in classes:
    ax.plot(x, probs, marker='o', markersize=6.5, color=col, linewidth=2.2, label=name)
    if col == PRIMARY:
        ax.fill_between(x, 0, probs, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
ax.set_xticks(x)
ax.set_xticklabels(indicators)
ax.set_ylim(0, 1.05)
ax.set_ylabel('条件响应概率 P(Y=1 | Class)')
`,
  },

  ipa: {
    body: `
items = ['响应时效', '价格透明', '客服态度', '界面简明', '网点覆盖', '积分活动']
imp = np.array([4.42, 4.26, 4.11, 3.82, 3.55, 3.12])
sat = np.array([4.18, 2.94, 3.08, 3.92, 3.22, 3.86])
mi, ms = np.mean(imp), np.mean(sat)

ax.axvspan(mi, 4.75, ymin=0.0, ymax=(ms - 2.5) / 2.2, color=OPPOSITE, alpha=0.14, label='II 重点改进高优区')
ax.axvline(mi, color=SECONDARY, linestyle='--', linewidth=1.4)
ax.axhline(ms, color=SECONDARY, linestyle='--', linewidth=1.4)
ax.scatter(imp, sat, s=110, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='服务质量评价指标')
for x_v, y_v, name in zip(imp, sat, items):
    ax.text(x_v + 0.04, y_v + 0.04, name, fontsize=9, fontweight='bold')
ax.set_xlim(2.9, 4.75)
ax.set_ylim(2.5, 4.7)
ax.set_xlabel('重要性均值 (Importance)')
ax.set_ylabel('满意度均值 (Performance)')
`,
  },

  kano: {
    body: `
attrs = ['一键直达 (O)', '智能推荐 (A)', '隐私合规 (M)', '线下站点 (O)', '界面换肤 (I)', '专属折扣 (A)']
worse = np.array([0.72, 0.32, 0.79, 0.64, 0.22, 0.38])
better = np.array([0.78, 0.71, 0.36, 0.68, 0.26, 0.76])

ax.axvline(0.5, color=SECONDARY, linestyle='--', linewidth=1.4)
ax.axhline(0.5, color=SECONDARY, linestyle='--', linewidth=1.4)
ax.scatter(worse, better, s=115, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='功能要素 Kano 坐标')
for wx, by, name in zip(worse, better, attrs):
    ax.text(wx + 0.018, by + 0.015, name, fontsize=9)
ax.text(0.14, 0.88, '魅力属性 (A)', fontsize=9.5, color=PRIMARY, fontweight='bold')
ax.text(0.76, 0.88, '期望属性 (O)', fontsize=9.5, color=SECONDARY, fontweight='bold')
ax.text(0.76, 0.14, '必备属性 (M)', fontsize=9.5, color=OPPOSITE, fontweight='bold')
ax.text(0.14, 0.14, '无差异属性 (I)', fontsize=9.5, color='#64748B')
ax.set_xlim(0.08, 0.96)
ax.set_ylim(0.08, 0.96)
ax.set_xlabel('消除后不满系数 |Worse (DSI)|')
ax.set_ylabel('具备后满意系数 Better (SI)')
`,
  },

  conjoint_partworth: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
levels = ['价格 19元', '价格 39元', '价格 59元', '当日直达', '次日配送', '线上+线下', '仅线上']
utils = np.array([0.64, 0.12, -0.76, 0.42, -0.42, 0.38, -0.38])
attrs = ['价格档位', '履约时效', '渠道组合']
imp = np.array([46.2, 30.8, 23.0])

fig = plt.figure(figsize=(9.2, 5.2), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.35, 1.0], wspace=0.28)
ax_l, ax_r = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

y1 = np.arange(len(levels))[::-1]
cols1 = [PRIMARY if u >= 0 else OPPOSITE for u in utils]
ax_l.axvline(0, color='#334155', linewidth=1.0)
ax_l.barh(y1, utils, height=0.55, color=cols1, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='水平分部效用 Part-worth')
ax_l.set_yticks(y1)
ax_l.set_yticklabels(levels)
ax_l.set_xlabel('边际效用估计值')
ax_l.legend(frameon=False, loc='lower right')

y2 = np.arange(len(attrs))[::-1]
ax_r.barh(y2, imp, height=0.46, color=SECONDARY, alpha=0.35, edgecolor=SECONDARY, linewidth=1.6, label='属性相对重要性 (%)')
for yi, v in zip(y2, imp):
    ax_r.text(v + 1.2, yi, f'{v:.1f}%', va='center', fontsize=9.5, color=SECONDARY, fontweight='bold')
ax_r.set_yticks(y2)
ax_r.set_yticklabels(attrs)
ax_r.set_xlim(0, 58)
ax_r.set_xlabel('相对重要性权重 (%)')
ax_r.legend(frameon=False, loc='lower right')
for target_ax in (ax_l, ax_r):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.5, fontweight='bold', y=0.97)
`,
  },

  dea_frontier: {
    body: `
inp = np.array([1.2, 1.8, 2.8, 4.4, 2.2, 3.1, 3.8, 2.6])
out = np.array([1.9, 3.1, 4.0, 4.6, 2.4, 2.9, 3.2, 2.1])
eff = [True, True, True, True, False, False, False, False]

fx = [0.8] + list(inp[:4]) + [5.0]
fy = [0.0] + list(out[:4]) + [out[3]]
ax.plot(fx, fy, color=PRIMARY, linewidth=2.2, label='DEA 效率前沿面 (θ = 1.0)')
ax.fill_between(fx, 0, fy, color=PRIMARY, alpha=0.14, edgecolor=PRIMARY, linewidth=1.6)
ax.scatter(inp[eff], out[eff], s=95, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='DEA 有效单元 (DMU)')
ax.scatter(inp[~np.array(eff)], out[~np.array(eff)], s=85, marker='^', color=OPPOSITE, alpha=0.35, edgecolor=OPPOSITE,
           linewidth=1.6, label='非有效待改进单元')
for x_v, y_v in zip(inp[4:], out[4:]):
    ax.annotate('', xy=(x_v * 0.78, y_v), xytext=(x_v, y_v), arrowprops={'arrowstyle': '->', 'color': SECONDARY, 'lw': 1.4})
ax.set_xlabel('标准化资源投入 X')
ax.set_ylabel('标准化服务产出 Y')
`,
  },

  tornado_sens: {
    body: `
params = ['客户留存率 (±15%)', '单均履约成本 (±15%)', '获客补贴力度 (±20%)', '复购频次弹性 (±10%)', '客服人力占比 (±15%)']
base = 128.0
low = np.array([96, 102, 108, 114, 118])
high = np.array([164, 152, 146, 142, 137])
y = np.arange(len(params))[::-1]

ax.axvline(base, color='#0F172A', linewidth=1.4, label=f'基准净收益 = {base:.0f} 万元')
ax.barh(y, base - low, left=low, height=0.52, color=OPPOSITE, alpha=0.35, edgecolor=OPPOSITE, linewidth=1.6, label='悲观下界 (-Δ)')
ax.barh(y, high - base, left=base, height=0.52, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='乐观上界 (+Δ)')
ax.set_yticks(y)
ax.set_yticklabels(params)
ax.set_xlabel('项目预期净收益 NPV (万元)')
`,
  },

  monte_carlo_var: {
    imports: ['from scipy import stats'],
    body: `
sim = rng.normal(128.0, 26.5, 10000)
var_5 = np.percentile(sim, 5)
grid = np.linspace(sim.min(), sim.max(), 260)
kde = stats.gaussian_kde(sim)(grid)

ax.hist(sim, bins=36, density=True, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='10,000 次蒙特卡洛模拟')
ax.plot(grid, kde, color=SECONDARY, linewidth=2.0)
ax.fill_between(grid[grid <= var_5], 0, kde[grid <= var_5], color=OPPOSITE, alpha=0.45, label=f'5% 尾部风险 VaR = {var_5:.1f} 万')
ax.axvline(np.mean(sim), color='#0F172A', linestyle='--', linewidth=1.5, label=f'预期均值 = {np.mean(sim):.1f} 万')
ax.set_xlabel('模拟项目净收益 (万元)')
ax.set_ylabel('概率密度')
`,
  },

  violin_corr_composite: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
fig = plt.figure(figsize=(9.6, 5.2), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.15, 1.0], wspace=0.25)
ax_l, ax_r = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

g_data = [rng.normal(m, 0.48, 120) for m in (4.35, 3.65, 2.85)]
vp = ax_l.violinplot(g_data, positions=[1, 2, 3], showmedians=True)
for body, col in zip(vp['bodies'], [PRIMARY, SECONDARY, OPPOSITE]):
    body.set_facecolor(col)
    body.set_edgecolor(col)
    body.set_alpha(0.35)
    body.set_linewidth(1.6)
ax_l.set_xticks([1, 2, 3])
ax_l.set_xticklabels(['拥趸群', '观望群', '敏感群'])
ax_l.set_ylabel('核心意愿得分')
ax_l.bar([0], [0], color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='分群分布密度')
ax_l.set_xlim(0.4, 3.6)
ax_l.legend(frameon=False, loc='lower left')

corr = np.array([[1.0, 0.54, 0.46, 0.61], [0.54, 1.0, 0.39, 0.52], [0.46, 0.39, 1.0, 0.44], [0.61, 0.52, 0.44, 1.0]])
mask = np.triu(np.ones_like(corr, dtype=bool), k=1)
masked_c = np.ma.array(corr, mask=mask)
cmap = mcolors.LinearSegmentedColormap.from_list('comp_c', ['#FFFFFF', PRIMARY])
ax_r.imshow(masked_c, cmap=cmap, vmin=0, vmax=1, alpha=0.78)
labs = ['便利', '信任', '适老', '意愿']
for i in range(4):
    for j in range(i + 1):
        ax_r.text(j, i, f'{corr[i, j]:.2f}', ha='center', va='center', fontsize=9, fontweight='bold')
ax_r.set_xticks(range(4))
ax_r.set_xticklabels(labs)
ax_r.set_yticks(range(4))
ax_r.set_yticklabels(labs)
for target_ax in (ax_l, ax_r):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.5, fontweight='bold', y=0.97)
`,
  },

  ahp_hierarchy: {
    body: `
criteria = ['C1 服务效率\\n(w=0.41)', 'C2 制度信任\\n(w=0.32)', 'C3 成本可控\\n(w=0.17)', 'C4 推广可行\\n(w=0.10)']
sub_w = np.array([[0.25, 0.16], [0.19, 0.13], [0.11, 0.06], [0.06, 0.04]])
y = np.arange(len(criteria))[::-1]

ax.barh(y, sub_w[:, 0], height=0.54, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='一级指标权重')
ax.barh(y, sub_w[:, 1], left=sub_w[:, 0], height=0.54, color=SECONDARY, alpha=0.35, edgecolor=SECONDARY, linewidth=1.6, label='二级指标权重')
for yi, r in zip(y, sub_w):
    ax.text(r.sum() + 0.01, yi, f'合计 {r.sum():.2f} (CR=0.031 < 0.10)', va='center', fontsize=9, color=SECONDARY)
ax.set_yticks(y)
ax.set_yticklabels(criteria)
ax.set_xlim(0, 0.68)
ax.set_xlabel('AHP 层次合成全局权重 w_i')
`,
  },

  topsis_distance: {
    body: `
plans = ['方案 A 驿站+直配', '方案 B 全程线上', '方案 C 社区代办', '方案 D 维持现状']
ci = np.array([0.757, 0.591, 0.429, 0.230])
d_plus = np.array([0.112, 0.198, 0.274, 0.368])
d_minus = np.array([0.348, 0.286, 0.206, 0.110])
y = np.arange(len(plans))[::-1]

ax.barh(y, ci, height=0.54, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='熵权 TOPSIS 相对贴近度 C_i')
for yi, c, dp, dm in zip(y, ci, d_plus, d_minus):
    ax.text(c + 0.015, yi, f'{c:.3f} (D+={dp:.2f}, D-={dm:.2f})', va='center', fontsize=9, color=SECONDARY)
ax.set_yticks(y)
ax.set_yticklabels(plans)
ax.set_xlim(0, 1.08)
ax.set_xlabel('相对理想解贴近度 C_i = D- / (D+ + D-)')
`,
  },

  pareto_parallel: {
    body: `
dims = ['投入成本(↓)', '碳排强度(↓)', '服务覆盖(↑)', '受众满意(↑)', '公平指数(↑)']
n_sol = 60
t = rng.uniform(0.0, 1.0, n_sol)
objs_good = np.column_stack([
    np.clip(0.88 - 0.52 * t + rng.normal(0, 0.12, n_sol), 0.05, 0.98),
    np.clip(0.84 - 0.40 * t + rng.normal(0, 0.12, n_sol), 0.05, 0.98),
    np.clip(0.32 + 0.62 * t + rng.normal(0, 0.12, n_sol), 0.05, 0.98),
    np.clip(0.38 + 0.54 * t + rng.normal(0, 0.12, n_sol), 0.05, 0.98),
    np.clip(0.45 + 0.45 * np.sin(np.pi * t) + rng.normal(0, 0.10, n_sol), 0.05, 0.98),
])

is_pareto = np.ones(n_sol, dtype=bool)
for i in range(n_sol):
    for j in range(n_sol):
        if i != j and np.all(objs_good[j] >= objs_good[i]) and np.any(objs_good[j] > objs_good[i]):
            is_pareto[i] = False
            break

x = np.arange(len(dims))
for row in objs_good[~is_pareto]:
    ax.plot(x, row, color='#CBD5E1', linewidth=1.0, alpha=0.65)
pareto_rows = objs_good[is_pareto]
for idx_p, row in enumerate(pareto_rows):
    ax.plot(x, row, color=PRIMARY, linewidth=1.6, alpha=0.75, label='Pareto 非支配前沿解' if idx_p == 0 else None)

knee_idx = int(np.argmin(np.linalg.norm(1.0 - pareto_rows, axis=1)))
ax.plot(x, pareto_rows[knee_idx], color=OPPOSITE, marker='o', markersize=6.5, linewidth=2.6, label='最优折衷膝点方案 (S*)')
for xi in x:
    ax.axvline(xi, color='#475569', linewidth=0.9, alpha=0.55)
ax.set_xticks(x)
ax.set_xticklabels(dims)
ax.set_ylim(0, 1.05)
ax.set_ylabel('标准化目标优度 [0=最差, 1=最优]')
`,
  },

  latent_growth_trajectory: {
    body: `
waves = np.array([0, 1, 2, 3])
wave_labels = ['T1 基线', 'T2 (3月)', 'T3 (6月)', 'T4 (12月)']
classes = [
    ('C1 稳步提升型 (44%)', 132, np.array([2.80, 3.38, 3.92, 4.38]), PRIMARY, 'o'),
    ('C2 高开回落型 (32%)', 96, np.array([4.12, 3.85, 3.36, 2.95]), OPPOSITE, 's'),
    ('C3 持续低迷型 (24%)', 72, np.array([2.24, 2.18, 2.12, 2.15]), SECONDARY, '^'),
]

for lbl, n_c, mean_traj, col, mk in classes:
    ind_paths = mean_traj[None, :] + rng.normal(0.0, 0.34, (n_c, len(waves)))
    for row in ind_paths[:28]:
        ax.plot(waves, row, color=col, alpha=0.10, linewidth=0.9)
    m = ind_paths.mean(axis=0)
    ci95 = 1.96 * ind_paths.std(axis=0, ddof=1) / np.sqrt(n_c)
    ax.fill_between(waves, m - ci95, m + ci95, color=col, alpha=0.18)
    ax.plot(waves, m, color=col, marker=mk, markersize=6.5, linewidth=2.5, label=lbl)
    ax.text(waves[-1] + 0.06, m[-1], f'{m[-1]:.2f}', va='center', fontsize=9, fontweight='bold', color=col)

ax.set_xticks(waves)
ax.set_xticklabels(wave_labels)
ax.set_xlim(-0.15, 3.35)
ax.set_ylim(1.2, 5.1)
ax.set_xlabel('纵向追踪测量波次 (Wave T1 → T4)')
ax.set_ylabel('潜变量构念得分 (1–5 分制)')
`,
  },

  network_bridge_ei: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
nodes = ['A1 效能', 'A2 信任', 'A3 便利', 'B1 顾虑', 'B2 摩擦', 'B3 倦怠']
comms = np.array([0, 0, 0, 1, 1, 1])
pos_xy = np.array([
    [0.20, 0.78], [0.46, 0.76], [0.30, 0.54],
    [0.56, 0.38], [0.80, 0.42], [0.68, 0.18],
])

# 构造正则化偏相关权重矩阵 (包含正负桥接边)
W = np.array([
    [0.00, 0.28, 0.22, -0.05, 0.00, -0.04],
    [0.28, 0.00, 0.31, -0.34, -0.22, 0.06],
    [0.22, 0.31, 0.00, 0.21, -0.04, 0.00],
    [-0.05, -0.34, 0.21, 0.00, 0.32, 0.26],
    [0.00, -0.22, -0.04, 0.32, 0.00, 0.29],
    [-0.04, 0.06, 0.00, 0.26, 0.29, 0.00],
])

# 计算 1-step 桥接预期影响 (Bridge EI) 及其标准化 z-score
bridge_ei = np.array([sum(abs(W[i, j]) for j in range(len(nodes)) if comms[j] != comms[i]) for i in range(len(nodes))])
bridge_z = (bridge_ei - np.mean(bridge_ei)) / np.std(bridge_ei)
order = np.argsort(bridge_z)

fig = plt.figure(figsize=(10.2, 4.8), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.15, 1.0], wspace=0.34)
ax_net, ax_ei = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

c1_ring = mpatches.Ellipse((0.32, 0.69), 0.44, 0.38, facecolor=PRIMARY, alpha=0.08, edgecolor=PRIMARY, linestyle='--', linewidth=1.2)
c2_ring = mpatches.Ellipse((0.68, 0.33), 0.44, 0.38, facecolor=SECONDARY, alpha=0.08, edgecolor=SECONDARY, linestyle='--', linewidth=1.2)
ax_net.add_patch(c1_ring)
ax_net.add_patch(c2_ring)

for i in range(len(nodes)):
    for j in range(i + 1, len(nodes)):
        w_ij = W[i, j]
        if abs(w_ij) < 0.03:
            continue
        is_bridge = comms[i] != comms[j]
        col = (PRIMARY if w_ij > 0 else OPPOSITE) if is_bridge else '#94A3B8'
        ls = '-' if w_ij > 0 else '--'
        lw = 1.2 + 7.5 * abs(w_ij) if is_bridge else 1.2
        ax_net.plot([pos_xy[i, 0], pos_xy[j, 0]], [pos_xy[i, 1], pos_xy[j, 1]], color=col, linestyle=ls, linewidth=lw, alpha=0.82 if is_bridge else 0.45, zorder=2)

for i, name in enumerate(nodes):
    is_top = bridge_z[i] >= 0.9
    col = PRIMARY if comms[i] == 0 else SECONDARY
    ax_net.scatter([pos_xy[i, 0]], [pos_xy[i, 1]], s=620 if is_top else 460, facecolor='#FFFFFF', edgecolor=OPPOSITE if is_top else col, linewidth=2.6 if is_top else 1.8, zorder=4)
    ax_net.text(pos_xy[i, 0], pos_xy[i, 1], name.replace(' ', '\\n'), ha='center', va='center', fontsize=7.8, fontweight='bold', color='#0F172A', zorder=5)

ax_net.set_xlim(0.05, 0.95)
ax_net.set_ylim(0.05, 0.95)
ax_net.axis('off')
ax_net.set_title('跨群落心理网络与桥接连边', fontsize=10.5, fontweight='bold')

y_pos = np.arange(len(nodes))
ax_ei.axvline(0.0, color='#475569', linewidth=1.0)
ax_ei.axvline(1.0, color=OPPOSITE, linestyle='--', linewidth=1.2, label='核心桥接阈值 z=1.0')
for yi, idx in enumerate(order):
    zv = bridge_z[idx]
    col = OPPOSITE if zv >= 0.9 else (PRIMARY if zv >= 0 else SECONDARY)
    ax_ei.hlines(yi, 0.0, zv, color=col, linewidth=2.2)
    ax_ei.scatter([zv], [yi], s=75, color=col, zorder=5)
    ax_ei.text(zv + (0.08 if zv >= 0 else -0.08), yi, f'{zv:+.2f}', va='center', ha='left' if zv >= 0 else 'right', fontsize=8.2, fontweight='bold', color=col)

ax_ei.set_yticks(y_pos)
ax_ei.set_yticklabels([nodes[i] for i in order])
ax_ei.set_xlim(min(bridge_z) - 0.55, max(bridge_z) + 0.55)
ax_ei.set_xlabel('Bridge Expected Influence (z-score)')
ax_ei.set_title('节点跨群桥接强度排序', fontsize=10.5, fontweight='bold')
ax_ei.legend(frameon=False, loc='lower right', fontsize=8)
ax_ei.spines['top'].set_visible(False)
ax_ei.spines['right'].set_visible(False)
ax_ei.grid(True, axis='x', linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.04, right=0.97, bottom=0.14, top=0.84)
`,
  },

  topsis_closeness_rank: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
units = ['余杭区', '苏州工业园', '成都高新区', '合肥滨海区', '芜湖经开区', '洛阳生态县']
# 原始决策矩阵: 4项正向指标 + 1项逆向成本指标
raw = np.array([
    [92.0, 88.0, 4.5, 86.0, 18.0],
    [88.0, 85.0, 4.3, 81.0, 21.0],
    [82.0, 79.0, 4.1, 76.0, 25.0],
    [75.0, 74.0, 3.8, 70.0, 30.0],
    [68.0, 66.0, 3.4, 62.0, 34.0],
    [59.0, 60.0, 3.0, 54.0, 41.0],
])
is_cost = [False, False, False, False, True]
norm_mat = np.zeros_like(raw, dtype=float)
for j in range(raw.shape[1]):
    col = raw[:, j]
    rng_v = max(float(col.max() - col.min()), 1e-9)
    norm_mat[:, j] = (col.max() - col) / rng_v if is_cost[j] else (col - col.min()) / rng_v
norm_shift = norm_mat + 1e-4
P = norm_shift / norm_shift.sum(axis=0, keepdims=True)
e_j = -(1.0 / np.log(len(units))) * np.sum(P * np.log(P), axis=0)
w_j = (1.0 - e_j) / np.sum(1.0 - e_j)
Z = (raw / np.sqrt(np.sum(raw ** 2, axis=0, keepdims=True))) * w_j
# 对逆向指标在第5列反转正负理想解
z_pos = np.array([Z[:, j].min() if is_cost[j] else Z[:, j].max() for j in range(Z.shape[1])])
z_neg = np.array([Z[:, j].max() if is_cost[j] else Z[:, j].min() for j in range(Z.shape[1])])
d_plus = np.sqrt(np.sum((Z - z_pos) ** 2, axis=1))
d_minus = np.sqrt(np.sum((Z - z_neg) ** 2, axis=1))
c_i = d_minus / (d_plus + d_minus)
order = np.argsort(c_i)

fig = plt.figure(figsize=(10.2, 4.8), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.05, 1.15], wspace=0.22)
ax_dist, ax_ci = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

y = np.arange(len(units))
for yi, idx in enumerate(order):
    ax_dist.plot([d_plus[idx], d_minus[idx]], [yi, yi], color='#CBD5E1', linewidth=1.6, zorder=2)
ax_dist.scatter(d_plus[order], y, s=75, color=OPPOSITE, marker='s', zorder=4, label='正理想解距离 D+')
ax_dist.scatter(d_minus[order], y, s=75, color=PRIMARY, marker='o', zorder=4, label='负理想解距离 D-')
ax_dist.set_yticks(y)
ax_dist.set_yticklabels([f'#{len(units)-yi} {units[idx]}' for yi, idx in enumerate(order)])
ax_dist.set_xlabel('欧氏加权距离 (D+ 越小越优 / D- 越大越优)')
ax_dist.set_title('正负理想解距离对比', fontsize=10.5, fontweight='bold')
ax_dist.legend(frameon=False, loc='lower right', fontsize=8.0)

ax_ci.axvline(0.65, color=OPPOSITE, linestyle='--', linewidth=1.3, label='示范分级线 C_i = 0.65')
bar_cols = [PRIMARY if c_i[idx] >= 0.65 else (SECONDARY if c_i[idx] >= 0.45 else '#94A3B8') for idx in order]
ax_ci.barh(y, c_i[order], height=0.56, color=bar_cols, alpha=0.84)
for yi, idx in enumerate(order):
    ax_ci.text(c_i[idx] + 0.015, yi, f'{c_i[idx]:.3f}', va='center', fontsize=8.8, fontweight='bold', color=bar_cols[yi])
ax_ci.set_yticks(y)
ax_ci.set_yticklabels([''] * len(units))
ax_ci.set_xlim(0.0, 1.08)
ax_ci.set_xlabel('综合贴近度 C_i = D- / (D+ + D-)')
ax_ci.set_title('综合贴近度梯度位次排序', fontsize=10.5, fontweight='bold')
ax_ci.legend(frameon=False, loc='lower right', fontsize=8.0)

for target_ax in (ax_dist, ax_ci):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, axis='x', linestyle='--', alpha=0.25)

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.13, right=0.97, bottom=0.14, top=0.84)
`,
  },

  ahp_consistency_radar: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
dims = ['技术效能', '经济成本', '服务可达', '风险合规', '社会效益']
A = np.array([
    [1.0,   2.0,   3.0,   4.0,   5.0],
    [0.5,   1.0,   2.0,   3.0,   4.0],
    [1/3,   0.5,   1.0,   2.0,   3.0],
    [0.25,  1/3,   0.5,   1.0,   2.0],
    [0.20,  0.25,  1/3,   0.5,   1.0],
])
eigvals, eigvecs = np.linalg.eig(A)
max_idx = int(np.argmax(eigvals.real))
lambda_max = float(eigvals.real[max_idx])
w_expert = np.abs(eigvecs[:, max_idx].real)
w_expert = w_expert / np.sum(w_expert)
w_public = np.array([0.31, 0.30, 0.19, 0.11, 0.09])
ci = (lambda_max - len(dims)) / (len(dims) - 1)
ri = 1.12
cr = ci / ri

fig = plt.figure(figsize=(10.2, 4.9), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.05, 1.05], wspace=0.26)
ax_rad = fig.add_subplot(gs[0], projection='polar')
ax_mat = fig.add_subplot(gs[1])

angles = np.linspace(0.0, 2.0 * np.pi, len(dims), endpoint=False)
ang_c = np.concatenate([angles, [angles[0]]])
we_c = np.concatenate([w_expert, [w_expert[0]]])
wp_c = np.concatenate([w_public, [w_public[0]]])
ax_rad.plot(ang_c, we_c, color=PRIMARY, marker='o', linewidth=2.2, label='专家组判断权重')
ax_rad.fill(ang_c, we_c, color=PRIMARY, alpha=0.20)
ax_rad.plot(ang_c, wp_c, color=SECONDARY, linestyle='--', marker='s', linewidth=1.9, label='公众调研权重')
ax_rad.fill(ang_c, wp_c, color=SECONDARY, alpha=0.10)
ax_rad.set_xticks(angles)
ax_rad.set_xticklabels([f'{d}\\n({w:.2f})' for d, w in zip(dims, w_expert)], fontsize=8.5)
ax_rad.set_ylim(0.0, 0.48)
ax_rad.set_yticks([0.1, 0.2, 0.3, 0.4])
ax_rad.set_yticklabels(['0.1', '0.2', '0.3', '0.4'], fontsize=7.5)
ax_rad.spines['polar'].set_alpha(0.35)
ax_rad.set_title('准则层权重多维轮廓对比', fontsize=10.5, fontweight='bold', pad=12)
ax_rad.legend(frameon=False, loc='upper right', bbox_to_anchor=(1.22, 1.12), fontsize=8.0)

cmap_ahp = mcolors.LinearSegmentedColormap.from_list('ahp', ['#F1F5F9', SECONDARY, PRIMARY])
ax_mat.imshow(np.log2(A + 0.2), cmap=cmap_ahp, alpha=0.75)
labels_frac = [['1', '2', '3', '4', '5'], ['1/2', '1', '2', '3', '4'], ['1/3', '1/2', '1', '2', '3'], ['1/4', '1/3', '1/2', '1', '2'], ['1/5', '1/4', '1/3', '1/2', '1']]
for r in range(5):
    for c in range(5):
        ax_mat.text(c, r, labels_frac[r][c], ha='center', va='center', fontsize=9.0, fontweight='bold' if r == c else 'normal', color='#0F172A')
ax_mat.set_xticks(range(5))
ax_mat.set_xticklabels(dims, rotation=20, ha='right', fontsize=8.2)
ax_mat.set_yticks(range(5))
ax_mat.set_yticklabels(dims, fontsize=8.2)
ax_mat.set_title(f'Saaty 矩阵与一致性: lambda_max={lambda_max:.3f}, CR={cr:.4f} < 0.10', fontsize=10.0, fontweight='bold')

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.05, right=0.96, bottom=0.14, top=0.83)
`,
  },

  // -------------------------------------------------------------------------
  // 9. 时空/空间与工程 (spatiotemporal) — 33
  // -------------------------------------------------------------------------
  ts_band: {
    body: `
t_hist = np.arange(2019, 2026)
y_hist = np.array([24.2, 29.5, 36.1, 43.2, 51.4, 58.6, 63.8])
t_fc = np.arange(2025, 2029)
y_fc = np.array([63.8, 69.2, 74.5, 79.8])
sd_fc = np.array([0.0, 2.8, 4.6, 6.4])

ax.plot(t_hist, y_hist, color=PRIMARY, marker='o', linewidth=2.2, label='历史实测序列')
ax.fill_between(t_fc, y_fc - 1.96 * sd_fc, y_fc + 1.96 * sd_fc, color=SECONDARY, alpha=0.22, label='ARIMA 95% 预测扇形带')
ax.fill_between(t_fc, y_fc - 1.28 * sd_fc, y_fc + 1.28 * sd_fc, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6,
                label='80% 核心预测带')
ax.plot(t_fc, y_fc, color=OPPOSITE, linestyle='--', marker='s', linewidth=2.0, label='基准外推均值')
ax.set_xlabel('观测年份')
ax.set_ylabel('渗透率指标 (%)')
`,
  },

  dual_axis_bar_line: {
    body: `
years = np.arange(2020, 2026)
scale = np.array([128, 165, 218, 286, 362, 448])
growth = np.array([18.5, 28.9, 32.1, 31.2, 26.6, 23.8])

ax.bar(years, scale, width=0.52, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='市场绝对规模 (亿元, 左轴)')
ax2 = ax.twinx()
ax2.plot(years, growth, color=OPPOSITE, marker='o', linewidth=2.2, label='同比增长率 (%, 右轴)')
ax2.spines['top'].set_visible(False)
ax.set_ylabel('绝对规模 (亿元)')
ax2.set_ylabel('同比增长率 (%)')
ax2.set_ylim(0, 42)
h1, l1 = ax.get_legend_handles_labels()
h2, l2 = ax2.get_legend_handles_labels()
ax.legend(h1 + h2, l1 + l2, frameon=False, loc='upper left')
`,
  },

  bump: {
    body: `
periods = ['2022Q1', '2022Q3', '2023Q1', '2023Q3', '2024Q1', '2024Q3']
x = np.arange(len(periods))
ranks = {
    '社交短视频': ([4, 3, 2, 1, 1, 1], PRIMARY),
    '社区网格直推': ([2, 2, 1, 2, 2, 2], SECONDARY),
    '熟人口碑推荐': ([3, 4, 3, 3, 3, 3], '#64748B'),
    '传统门户广告': ([1, 1, 4, 4, 5, 5], OPPOSITE),
    '线下商超展台': ([5, 5, 5, 5, 4, 4], '#94A3B8'),
}
for name, (rk, col) in ranks.items():
    ax.plot(x, rk, marker='o', markersize=7, color=col, linewidth=2.4, label=name)
    ax.text(len(periods) - 0.85, rk[-1] - 0.14, f'#{rk[-1]} {name}', fontsize=8.8, color=col, fontweight='bold')
ax.fill_between(x, 0.8, 2.2, facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6)
ax.invert_yaxis()
ax.set_yticks([1, 2, 3, 4, 5])
ax.set_yticklabels(['#1', '#2', '#3', '#4', '#5'])
ax.set_xticks(x)
ax.set_xticklabels(periods)
ax.set_ylabel('渠道影响力位次')
`,
  },

  moran_scatter: {
    body: `
z = rng.normal(0, 1.0, 85)
wz = 0.52 * z + rng.normal(0, 0.62, 85)
slope, intercept = np.polyfit(z, wz, 1)
xg = np.linspace(z.min(), z.max(), 80)

ax.axhline(0, color='#475569', linestyle='--', linewidth=1.1)
ax.axvline(0, color='#475569', linestyle='--', linewidth=1.1)
ax.scatter(z, wz, s=46, color=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='空间单元观测点')
ax.plot(xg, slope * xg + intercept, color=OPPOSITE, linewidth=2.2, label=f"Moran's I = {slope:.3f} (p = 0.001)")
ax.text(0.82, 0.88, 'H-H 高高集聚', transform=ax.transAxes, fontsize=9, color=PRIMARY, fontweight='bold')
ax.text(0.05, 0.10, 'L-L 低低洼地', transform=ax.transAxes, fontsize=9, color=SECONDARY, fontweight='bold')
ax.set_xlabel('标准化属性均值 z')
ax.set_ylabel('空间滞后项 W·z')
`,
  },

  choropleth_map: {
    body: `
# 省域/片区网格砖块专题分层设色图 (无需外部 shapefile 即可复现)
regions = [('华东', 3, 2, 4.42), ('华南', 2, 0, 4.18), ('华北', 2, 3, 3.92), ('华中', 2, 1, 3.74),
           ('西南', 1, 1, 3.58), ('东北', 3, 4, 3.36), ('西北', 0, 2, 3.12)]
cmap = mcolors.LinearSegmentedColormap.from_list('geo', ['#F1F5F9', SECONDARY, PRIMARY])
norm = mcolors.Normalize(vmin=2.9, vmax=4.6)

for name, gx, gy, val in regions:
    col = cmap(norm(val))
    ax.add_patch(mpatches.Rectangle((gx + 0.06, gy + 0.06), 0.88, 0.88, facecolor=col, alpha=0.85,
                                    edgecolor=PRIMARY, linewidth=1.6))
    ax.text(gx + 0.5, gy + 0.5, f'{name}\\n{val:.2f}', ha='center', va='center', fontsize=9.5,
            color='#FFFFFF' if val > 3.85 else '#0F172A', fontweight='bold')
sm_cb = plt.cm.ScalarMappable(cmap=cmap, norm=norm)
plt.colorbar(sm_cb, ax=ax, fraction=0.045, pad=0.03, label='区域指标得分')
ax.legend(handles=[mpatches.Patch(facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='区域分层设色单元')],
          frameon=False, loc='upper left')
ax.set_xlim(0, 4.2)
ax.set_ylim(0, 5.1)
ax.axis('off')
`,
  },

  lisa_cluster: {
    body: `
grid_types = np.array([
    [0, 0, 2, 2, 0, 0],
    [0, 4, 2, 1, 1, 0],
    [3, 0, 0, 1, 1, 0],
    [0, 0, 3, 0, 0, 0],
])
palette = {0: '#E2E8F0', 1: OPPOSITE, 2: PRIMARY, 3: SECONDARY, 4: '#64748B'}
labels = {1: 'H-H 热点集聚', 2: 'L-L 低值洼地', 3: 'H-L 高低极化', 4: 'L-H 低高孤立', 0: '非显著区'}
for r in range(grid_types.shape[0]):
    for c in range(grid_types.shape[1]):
        code = int(grid_types[r, c])
        ax.add_patch(mpatches.Rectangle((c + 0.05, 3 - r + 0.05), 0.90, 0.90, facecolor=palette[code],
                                        alpha=0.35 if code != 0 else 0.45, edgecolor=PRIMARY, linewidth=1.6))
lisa_handles = [mpatches.Patch(facecolor=palette[code], alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label=labels[code]) for code in (1, 2, 3, 4, 0)]
ax.legend(handles=lisa_handles, frameon=False, loc='upper center', ncol=3)
ax.set_xlim(0, 6)
ax.set_ylim(0, 4.4)
ax.axis('off')
`,
  },

  calendar_heat: {
    body: `
mat = rng.integers(8, 46, size=(7, 6))
cmap = mcolors.LinearSegmentedColormap.from_list('cal', ['#FFFFFF', PRIMARY])
im = ax.imshow(mat, cmap=cmap, aspect='auto', alpha=0.82)
plt.colorbar(im, ax=ax, fraction=0.045, pad=0.03, label='单日有效回收份数')
for r in range(7):
    for c in range(6):
        ax.text(c, r, str(mat[r, c]), ha='center', va='center', fontsize=8.5,
                color='#FFFFFF' if mat[r, c] > 30 else '#0F172A')
ax.legend(handles=[mpatches.Patch(facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='调研周期日回收热度')],
          frameon=False, loc='upper right')
ax.set_xticks(range(6))
ax.set_xticklabels([f'第{i+1}周' for i in range(6)])
ax.set_yticks(range(7))
ax.set_yticklabels(['周一', '周二', '周三', '周四', '周五', '周六', '周日'])
`,
  },

  cohort_matrix: {
    body: `
cohorts = ['1月队列', '2月队列', '3月队列', '4月队列', '5月队列']
ret = np.array([
    [100.0, 68.4, 54.2, 46.8, 42.1],
    [100.0, 71.2, 58.6, 51.4, np.nan],
    [100.0, 74.8, 62.1, np.nan, np.nan],
    [100.0, 78.2, np.nan, np.nan, np.nan],
    [100.0, np.nan, np.nan, np.nan, np.nan],
])
cmap = mcolors.LinearSegmentedColormap.from_list('coh', ['#FFFFFF', SECONDARY, PRIMARY])
masked = np.ma.masked_invalid(ret)
im = ax.imshow(masked, cmap=cmap, vmin=30, vmax=100, aspect='auto', alpha=0.85)
plt.colorbar(im, ax=ax, fraction=0.045, pad=0.03, label='队列留存率 (%)')
for i in range(5):
    for j in range(5):
        if not np.isnan(ret[i, j]):
            ax.text(j, i, f'{ret[i, j]:.1f}%', ha='center', va='center', fontsize=9,
                    color='#FFFFFF' if ret[i, j] > 65 else '#0F172A', fontweight='bold')
ax.legend(handles=[mpatches.Patch(facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='分批次留存率矩阵')],
          frameon=False, loc='lower right')
ax.set_xticks(range(5))
ax.set_xticklabels([f'+{i}月' for i in range(5)])
ax.set_yticks(range(5))
ax.set_yticklabels(cohorts)
`,
  },

  stl_decomp: {
    mode: 'custom',
    imports: ['from statsmodels.tsa.seasonal import STL'],
    body: `
t = np.arange(48)
series = 50 + 0.65 * t + 8.5 * np.sin(2 * np.pi * t / 12) + rng.normal(0, 1.8, 48)
res = STL(series, period=12, robust=True).fit()

fig, axes = plt.subplots(4, 1, figsize=(8.6, 6.4), dpi=180, sharex=True)
panels = [('原始观测序列', series, PRIMARY), ('长期趋势 Trend', res.trend, SECONDARY),
          ('周期季节 Seasonal', res.seasonal, PRIMARY), ('随机残差 Resid', res.resid, OPPOSITE)]
for idx, (target_ax, (lbl, arr, col)) in enumerate(zip(axes, panels)):
    if idx == 3:
        target_ax.bar(t, arr, facecolor=col, alpha=0.35, edgecolor=PRIMARY if idx == 2 else col, linewidth=1.6, label=lbl)
    else:
        target_ax.plot(t, arr, color=col, linewidth=1.9, label=lbl)
        target_ax.fill_between(t, arr.min(), arr, facecolor=col, alpha=0.35 if idx == 0 else 0.14,
                               edgecolor=PRIMARY if idx == 0 else col, linewidth=1.6)
    target_ax.legend(frameon=False, loc='upper left')
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
axes[-1].set_xlabel('月度观测期序 (t = 1..48)')
fig.suptitle(TITLE, fontsize=12.5, fontweight='bold', y=0.98)
`,
  },

  od_flow: {
    imports: ['from matplotlib.path import Path'],
    body: `
hubs = {'华北': (2.2, 4.1), '华东': (4.2, 3.2), '华南': (3.5, 1.2), '成渝': (1.1, 2.1), '华中': (2.7, 2.5)}
flows = [('华东', '华中', 0.92), ('华东', '成渝', 0.68), ('华南', '华中', 0.74), ('华北', '华东', 0.85), ('华中', '成渝', 0.45)]
for src, dst, w in flows:
    x1, y1 = hubs[src]
    x2, y2 = hubs[dst]
    mx, my = (x1 + x2) / 2 - (y2 - y1) * 0.25, (y1 + y2) / 2 + (x2 - x1) * 0.25
    path = Path([(x1, y1), (mx, my), (x2, y2)], [Path.MOVETO, Path.CURVE3, Path.CURVE3])
    ax.add_patch(mpatches.PathPatch(path, facecolor='none', edgecolor=PRIMARY, alpha=0.35 + 0.5 * w, linewidth=1.6 + 2.8 * w))
for name, (hx, hy) in hubs.items():
    ax.scatter([hx], [hy], s=260, color=OPPOSITE, alpha=0.35, edgecolor=OPPOSITE, linewidth=1.6, zorder=5)
    ax.text(hx, hy + 0.24, name, ha='center', fontsize=10, fontweight='bold')
ax.plot([], [], color=PRIMARY, linewidth=2.4, label='跨区要素流向弧 (线宽∝流量)')
ax.set_xlim(0.3, 4.9)
ax.set_ylim(0.5, 4.8)
ax.axis('off')
`,
  },

  wavelet_spectrum: {
    body: `
t = np.linspace(0, 48, 192)
sig = np.sin(2 * np.pi * t / 6.0) * np.exp(-((t - 16) / 9.0) ** 2) + 0.9 * np.sin(2 * np.pi * t / 14.0) + rng.normal(0, 0.2, len(t))
periods = np.linspace(2.0, 24.0, 48)
power = np.zeros((len(periods), len(t)))
for idx, per in enumerate(periods):
    # 使用纯 NumPy Morlet 小波包络核避免跨 SciPy 版本 API 变动
    tau = np.arange(-24, 25) * (t[1] - t[0])
    wavelet = np.exp(-0.5 * (tau / (per * 0.45)) ** 2) * np.exp(1j * 2 * np.pi * tau / per)
    conv = np.convolve(sig, wavelet, mode='same')
    power[idx] = np.abs(conv) ** 2

cmap = mcolors.LinearSegmentedColormap.from_list('wav', ['#F8FAFC', SECONDARY, PRIMARY, OPPOSITE])
im = ax.imshow(power, extent=[t[0], t[-1], periods[-1], periods[0]], aspect='auto', cmap=cmap, alpha=0.88)
ax.invert_yaxis()
coi = np.minimum(t - t[0], t[-1] - t) * 0.72 + 2.0
ax.plot(t, coi, color='#0F172A', linestyle='--', linewidth=1.6, label='影响锥 COI 边界')
plt.colorbar(im, ax=ax, fraction=0.045, pad=0.03, label='小波功率谱密度')
ax.plot([], [], color='#0F172A', linestyle='--', linewidth=1.6, label='影响锥 COI 边界')
ax.legend(handles=[
    mpatches.Patch(facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='时频高功率共振域'),
], frameon=False, loc='upper right')
ax.set_xlabel('观测时间窗 (月)')
ax.set_ylabel('周期尺度 Period (月)')
`,
  },

  acf_pacf: {
    mode: 'custom',
    imports: ['from statsmodels.tsa.stattools import acf, pacf'],
    body: `
ar = np.zeros(160)
for i in range(1, 160):
    ar[i] = 0.65 * ar[i - 1] + rng.normal(0, 1.0)
lags = np.arange(0, 19)
acf_v = acf(ar, nlags=18)
pacf_v = pacf(ar, nlags=18)
ci = 1.96 / np.sqrt(len(ar))

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8.4, 5.6), dpi=180, sharex=True)
for target_ax, vals, name, col in [(ax1, acf_v, '自相关函数 ACF', PRIMARY), (ax2, pacf_v, '偏自相关函数 PACF', SECONDARY)]:
    target_ax.axhspan(-ci, ci, facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='95% Bartlett 置信带')
    markerline, stemlines, _ = target_ax.stem(lags, vals)
    stemlines.set_color(col)
    stemlines.set_linewidth(1.8)
    markerline.set_color(col)
    target_ax.axhline(0, color='#334155', linewidth=1.0)
    target_ax.set_ylabel(name)
    target_ax.legend(frameon=False, loc='upper right')
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
ax2.set_xlabel('滞后阶数 Lag (k)')
fig.suptitle(TITLE, fontsize=12.5, fontweight='bold', y=0.97)
`,
  },

  gantt_critical: {
    body: `
tasks = ['文献图谱梳理', '访谈与量表构建', '预调研与CITC纯化', '多阶段分层发放', '四步清洗与游程检', '回归/SEM/机器学习', '红队核验与定稿']
starts = np.array([0, 2, 4, 6, 10, 11, 14])
durs = np.array([2.5, 2.5, 2.2, 4.2, 1.8, 3.2, 2.0])
critical = [True, True, True, True, False, True, True]
y = np.arange(len(tasks))[::-1]

for yi, st, du, cr in zip(y, starts, durs, critical):
    col = OPPOSITE if cr else PRIMARY
    lbl = '关键路径工序' if cr and yi == y[0] else ('并行支线工序' if not cr else None)
    ax.barh(yi, du, left=st, height=0.54, facecolor=col, alpha=0.35, edgecolor=PRIMARY if not cr else OPPOSITE, linewidth=1.6, label=lbl)
    ax.text(st + du + 0.15, yi, f'W{st:.0f}–W{st+du:.0f}', va='center', fontsize=8.8, color=SECONDARY)
ax.set_yticks(y)
ax.set_yticklabels(tasks)
ax.set_xlim(0, 18.5)
ax.set_xlabel('调研实施项目周期 (周次)')
`,
  },

  signal_anomaly: {
    body: `
seq = np.arange(1, 121)
duration = rng.normal(210, 22, 120)
spikes = [24, 58, 93]
duration[spikes] = [48, 342, 38]
mu, sd = np.mean(duration), np.std(duration)
ucl, lcl = mu + 2.5 * sd, max(0, mu - 2.5 * sd)

ax.axhspan(lcl, ucl, facecolor=PRIMARY, alpha=0.35, edgecolor=PRIMARY, linewidth=1.6, label='±2.5σ 正常质控带')
ax.plot(seq, duration, color=PRIMARY, linewidth=1.5, label='逐份入库作答耗时')
ax.scatter(seq[spikes], duration[spikes], s=90, color=OPPOSITE, edgecolor=OPPOSITE, linewidth=1.6, zorder=5, label='异常突刺拦截点')
ax.axhline(ucl, color=OPPOSITE, linestyle='--', linewidth=1.3)
ax.axhline(lcl, color=OPPOSITE, linestyle='--', linewidth=1.3)
ax.set_xlabel('问卷入库时间序贯编号')
ax.set_ylabel('作答时长 (秒)')
`,
  },

  weibull_bathtub: {
    body: `
t = np.linspace(0.15, 10.0, 260)
h_early = 0.28 * (t + 0.15) ** (-0.68)
h_const = np.full_like(t, 0.085)
h_wear = 0.0026 * np.maximum(0.0, t - 4.0) ** 2.42
h_total = h_early + h_const + h_wear

ax.axvspan(0.15, 2.4, color=OPPOSITE, alpha=0.07, label='I. 早期磨合失效期 (β<1)')
ax.axvspan(2.4, 7.2, color=PRIMARY, alpha=0.06, label='II. 偶然随机稳定期 (β≈1)')
ax.axvspan(7.2, 10.0, color=SECONDARY, alpha=0.07, label='III. 耗损老化加速期 (β>1)')
ax.plot(t, h_early, color=SECONDARY, linestyle='--', linewidth=1.4, label='早期失效分量 h1(t)')
ax.plot(t, h_wear, color=OPPOSITE, linestyle='--', linewidth=1.4, label='磨损老化分量 h3(t)')
ax.plot(t, h_total, color=PRIMARY, linewidth=2.6, label='总瞬时失效率 h(t)')
ax.set_ylim(0, 0.62)
ax.set_xlabel('系统服役周期 / 生命周期 t (年)')
ax.set_ylabel('瞬时失效率函数 h(t)')
`,
  },

  mm_c_queue_latency: {
    imports: ['import math'],
    body: `
def erlang_c_wq(rho_val, c, mu=0.25):
    a = c * rho_val
    sum_terms = sum((a ** k) / math.factorial(k) for k in range(c))
    term_c = ((a ** c) / math.factorial(c)) / (1.0 - rho_val)
    p_wait = term_c / (sum_terms + term_c)
    return p_wait / (c * mu * (1.0 - rho_val))

rhos = np.linspace(0.12, 0.94, 150)
for c, col, lbl in [(1, OPPOSITE, 'c = 1 单服务台'), (2, SECONDARY, 'c = 2 双服务台'), (4, PRIMARY, 'c = 4 并行服务池')]:
    wq = np.array([erlang_c_wq(float(r), c) for r in rhos])
    mask = wq <= 45.0
    ax.plot(rhos[mask], wq[mask], color=col, linewidth=2.2, label=lbl)

ax.axvspan(0.85, 1.0, color=OPPOSITE, alpha=0.10, label='拥堵相变区 (ρ ≥ 0.85)')
ax.axvline(0.85, color=OPPOSITE, linestyle='--', linewidth=1.5)
ax.axvline(1.0, color='#0F172A', linestyle=':', linewidth=1.3, label='发散临界线 (ρ = 1.0)')
ax.set_xlim(0.10, 1.02)
ax.set_ylim(0, 44)
ax.set_xlabel('服务系统利用率 ρ = λ / (cμ)')
ax.set_ylabel('平均排队等待时长 Wq (分钟)')
`,
  },

  lexis_diagram: {
    body: `
periods = np.arange(1990, 2030, 5)
ages = np.arange(20, 50, 5)
P_grid, A_grid = np.meshgrid(periods[:-1] + 2.5, ages[:-1] + 2.5)
rate_mat = 0.20 + 0.55 * np.exp(-((A_grid - 32.0) ** 2) / 90.0 - ((P_grid - 2016.0) ** 2) / 280.0)
cmap = mcolors.LinearSegmentedColormap.from_list('lexis', ['#FFFFFF', SECONDARY])

pcm = ax.pcolormesh(periods, ages, rate_mat, cmap=cmap, shading='flat', edgecolors='#CBD5E1', linewidth=0.7, alpha=0.85)
plt.colorbar(pcm, ax=ax, fraction=0.04, pad=0.03, label='分年龄—时期事件发生率')
ax.axvspan(2015, 2020, color=OPPOSITE, alpha=0.14, label='政策干预窗口 (2015–2020)')

for c_yr, col in [(1970, PRIMARY), (1980, PRIMARY), (1990, OPPOSITE)]:
    p_vals = np.linspace(max(1990, c_yr + 20), min(2025, c_yr + 45), 40)
    a_vals = p_vals - c_yr
    ax.plot(p_vals, a_vals, color=col, linewidth=2.1, label=f'{c_yr} 出生队列 (45° 生命线)')
    ax.text(p_vals[-1] - 0.5, a_vals[-1] - 1.2, f'{c_yr}队列', fontsize=8.5, fontweight='bold', color=col, ha='right')

ax.set_aspect('equal')
ax.set_xticks(periods)
ax.set_yticks(ages)
ax.set_xlim(1990, 2025)
ax.set_ylim(20, 45)
ax.set_xlabel('日历时期 Period (年)')
ax.set_ylabel('受访者年龄 Age (岁)')
`,
  },

  bode_magnitude_phase: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
omega = np.logspace(-1, 2.1, 400)
s = 1j * omega
G = 4.2 / (s * (0.18 * s + 1.0) * (0.045 * s + 1.0))
mag_db = 20.0 * np.log10(np.abs(G))
phase_deg = np.rad2deg(np.unwrap(np.angle(G))) - 360.0
phase_deg = np.where(phase_deg < -300.0, phase_deg + 360.0, phase_deg)

idx_gc = int(np.argmin(np.abs(mag_db)))
idx_pc = int(np.argmin(np.abs(phase_deg + 180.0)))
w_gc, pm = omega[idx_gc], 180.0 + phase_deg[idx_gc]
w_pc, gm = omega[idx_pc], -mag_db[idx_pc]

fig = plt.figure(figsize=(8.6, 5.6), dpi=180)
gs = GridSpec(2, 1, hspace=0.14)
ax_m = fig.add_subplot(gs[0])
ax_p = fig.add_subplot(gs[1], sharex=ax_m)

ax_m.semilogx(omega, mag_db, color=PRIMARY, linewidth=2.3, label='开环幅频 |G(jω)| (dB)')
ax_m.axhline(0.0, color='#475569', linestyle='--', linewidth=1.1)
ax_m.axvline(w_gc, color=PRIMARY, linestyle=':', linewidth=1.2)
ax_m.axvline(w_pc, color=OPPOSITE, linestyle=':', linewidth=1.2)
ax_m.annotate('', xy=(w_pc, -gm), xytext=(w_pc, 0.0), arrowprops=dict(arrowstyle='<->', color=OPPOSITE, lw=1.8))
ax_m.text(w_pc * 1.12, -gm / 2, f'GM = {gm:.1f} dB', color=OPPOSITE, fontsize=9, fontweight='bold', va='center')
ax_m.set_ylabel('幅值增益 (dB)')
ax_m.legend(frameon=False, loc='upper right')
plt.setp(ax_m.get_xticklabels(), visible=False)

ax_p.semilogx(omega, phase_deg, color=SECONDARY, linewidth=2.3, label='开环相频 ∠G(jω) (°)')
ax_p.axhline(-180.0, color=OPPOSITE, linestyle='--', linewidth=1.1)
ax_p.axvline(w_gc, color=PRIMARY, linestyle=':', linewidth=1.2)
ax_p.axvline(w_pc, color=OPPOSITE, linestyle=':', linewidth=1.2)
ax_p.annotate('', xy=(w_gc, -180.0), xytext=(w_gc, -180.0 + pm), arrowprops=dict(arrowstyle='<->', color=PRIMARY, lw=1.8))
ax_p.text(w_gc * 1.12, -180.0 + pm / 2, f'PM = {pm:.1f}°', color=PRIMARY, fontsize=9, fontweight='bold', va='center')
ax_p.set_ylabel('相角滞后 (°)')
ax_p.set_xlabel('角频率 ω (rad/s, 对数刻度)')
ax_p.legend(frameon=False, loc='upper right')

for target_ax in (ax_m, ax_p):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, which='both', linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.5, fontweight='bold', y=0.97)
`,
  },

  sir_compartment: {
    body: `
beta, sigma, gamma = 0.42, 0.20, 0.14
dt = 0.25
t = np.arange(0.0, 90.0 + dt, dt)
S, E, I, R = np.zeros_like(t), np.zeros_like(t), np.zeros_like(t), np.zeros_like(t)
S[0], E[0], I[0], R[0] = 0.99, 0.01, 0.0, 0.0

for k in range(len(t) - 1):
    s, e, i_v, r = S[k], E[k], I[k], R[k]
    ds = -beta * s * i_v
    de = beta * s * i_v - sigma * e
    di = sigma * e - gamma * i_v
    dr = gamma * i_v
    S[k + 1], E[k + 1], I[k + 1], R[k + 1] = s + ds * dt, e + de * dt, i_v + di * dt, r + dr * dt

Rt = (beta / gamma) * S
pk_idx = int(np.argmax(I))

ax.plot(t, S * 100, color=SECONDARY, linewidth=2.0, label='S 易感人群 (%)')
ax.plot(t, E * 100, color='#64748B', linestyle='--', linewidth=1.8, label='E 潜伏暴露 (%)')
ax.plot(t, I * 100, color=OPPOSITE, linewidth=2.4, label=f'I 感染峰值 ({I[pk_idx]*100:.1f}%)')
ax.fill_between(t, 0, I * 100, color=OPPOSITE, alpha=0.14)
ax.plot(t, R * 100, color=PRIMARY, linewidth=2.2, label='R 康复移出 (%)')

ax2 = ax.twinx()
ax2.plot(t, Rt, color='#0F172A', linestyle='-.', linewidth=1.6, label='有效再生数 Rt (右轴)')
ax2.axhline(1.0, color='#0F172A', linestyle=':', linewidth=1.1)
ax2.spines['top'].set_visible(False)
ax2.set_ylim(0, 3.3)
ax2.set_ylabel('有效再生数 Rt')

ax.set_ylim(0, 105)
ax.set_xlabel('仿真追踪时间 t (天)')
ax.set_ylabel('各仓室人群占比 (%)')
h1, l1 = ax.get_legend_handles_labels()
h2, l2 = ax2.get_legend_handles_labels()
ax.legend(h1 + h2, l1 + l2, frameon=False, loc='center right')
`,
  },

  phase_portrait: {
    body: `
def deriv(x, y):
    dx = x * (0.42 - 0.90 * x + 0.24 * y)
    dy = y * (0.36 + 0.22 * x - 0.85 * y)
    return dx, dy

xg, yg = np.meshgrid(np.linspace(0.06, 0.96, 16), np.linspace(0.06, 0.96, 16))
U, V = deriv(xg, yg)
spd = np.hypot(U, V) + 1e-9
ax.quiver(xg, yg, U / spd, V / spd, color='#94A3B8', alpha=0.65, scale=28, width=0.003)

y_line = np.linspace(0.0, 1.0, 80)
ax.plot((0.42 + 0.24 * y_line) / 0.90, y_line, color=SECONDARY, linestyle='--', linewidth=1.8, label='零增长线 dx/dt = 0')
x_line = np.linspace(0.0, 1.0, 80)
ax.plot(x_line, (0.36 + 0.22 * x_line) / 0.85, color=OPPOSITE, linestyle='--', linewidth=1.8, label='零增长线 dy/dt = 0')

for idx_s, (x0_s, y0_s) in enumerate([(0.10, 0.88), (0.92, 0.12), (0.12, 0.12), (0.94, 0.90)]):
    xs, ys = [x0_s], [y0_s]
    xc, yc = x0_s, y0_s
    for _ in range(90):
        dx, dy = deriv(xc, yc)
        xc, yc = xc + 0.18 * dx, yc + 0.18 * dy
        xs.append(xc)
        ys.append(yc)
    ax.plot(xs, ys, color=PRIMARY, linewidth=2.0, label='系统演化相轨线' if idx_s == 0 else None)

A_mat = np.array([[0.90, -0.24], [-0.22, 0.85]])
eq_x, eq_y = np.linalg.solve(A_mat, np.array([0.42, 0.36]))
ax.scatter([eq_x], [eq_y], s=140, color=OPPOSITE, edgecolor='#FFFFFF', linewidth=1.4, zorder=6,
           label=f'稳定吸引子 E*({eq_x:.2f}, {eq_y:.2f})')
ax.set_xlim(0, 1.02)
ax.set_ylim(0, 1.02)
ax.set_xlabel('技术采纳渗透率 x(t)')
ax.set_ylabel('生态协同配套度 y(t)')
`,
  },

  cusum_ewma_control: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
n_obs = 30
idx = np.arange(1, n_obs + 1)
# 前15个样本处于受控稳态 N(0,1)，第16个起发生 +0.85σ 持续微小漂移
x = np.concatenate([rng.normal(0.0, 0.55, 15), rng.normal(0.90, 0.55, 15)])

k_ref, H_lim = 0.45, 4.5
c_plus, c_minus = np.zeros(n_obs), np.zeros(n_obs)
for i in range(n_obs):
    prev_p = c_plus[i - 1] if i > 0 else 0.0
    prev_m = c_minus[i - 1] if i > 0 else 0.0
    c_plus[i] = max(0.0, prev_p + x[i] - k_ref)
    c_minus[i] = max(0.0, prev_m - x[i] - k_ref)

lam, L_ewma = 0.22, 2.6
z_ewma = np.zeros(n_obs)
ucl_ewma = np.zeros(n_obs)
for i in range(n_obs):
    prev_z = z_ewma[i - 1] if i > 0 else 0.0
    z_ewma[i] = lam * x[i] + (1.0 - lam) * prev_z
    ucl_ewma[i] = L_ewma * 0.55 * np.sqrt((lam / (2.0 - lam)) * (1.0 - (1.0 - lam) ** (2 * (i + 1))))

fig = plt.figure(figsize=(8.8, 5.6), dpi=180)
gs = GridSpec(2, 1, hspace=0.16)
ax_c = fig.add_subplot(gs[0])
ax_e = fig.add_subplot(gs[1], sharex=ax_c)

ax_c.axhline(0.0, color='#64748B', linewidth=1.0)
ax_c.axhline(H_lim, color=OPPOSITE, linestyle='--', linewidth=1.3, label=f'决策阈限 ±H = ±{H_lim:.1f}')
ax_c.axhline(-H_lim, color=OPPOSITE, linestyle='--', linewidth=1.3)
ax_c.plot(idx, c_plus, color=PRIMARY, marker='o', markersize=4, linewidth=2.0, label='上侧累积和 C+')
ax_c.plot(idx, -c_minus, color=SECONDARY, marker='s', markersize=3.5, linewidth=1.8, label='下侧累积和 -C-')
out_c = c_plus > H_lim
ax_c.scatter(idx[out_c], c_plus[out_c], s=75, color=OPPOSITE, zorder=5, label='越界告警点')
ax_c.set_ylabel('CUSUM 统计量 C±')
ax_c.legend(frameon=False, loc='upper left', ncol=2)
plt.setp(ax_c.get_xticklabels(), visible=False)

ax_e.axhline(0.0, color='#64748B', linewidth=1.0)
ax_e.plot(idx, ucl_ewma, color=OPPOSITE, linestyle='--', linewidth=1.3, label='EWMA 动态控制限 UCL/LCL')
ax_e.plot(idx, -ucl_ewma, color=OPPOSITE, linestyle='--', linewidth=1.3)
ax_e.plot(idx, z_ewma, color=PRIMARY, marker='o', markersize=4, linewidth=2.1, label='指数加权统计量 Z_i (λ=0.22)')
out_e = np.abs(z_ewma) > ucl_ewma
ax_e.scatter(idx[out_e], z_ewma[out_e], s=75, color=OPPOSITE, zorder=5)
ax_e.set_xticks(np.arange(1, n_obs + 1, 3))
ax_e.set_xlabel('序贯抽样质控样本编号 (#1–#30)')
ax_e.set_ylabel('EWMA 统计量 Z_i')
ax_e.legend(frameon=False, loc='upper left')

for target_ax in (ax_c, ax_e):
    target_ax.axvline(15.5, color='#94A3B8', linestyle=':', linewidth=1.1)
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.5, fontweight='bold', y=0.97)
`,
  },

  nyquist_stability_locus: {
    body: `
omega = np.logspace(-2.0, 1.5, 600)
s = 1j * omega
G = 1.6 / ((s ** 2 + 0.9 * s + 1.0) * (0.35 * s + 1.0))

theta = np.linspace(0.0, 2.0 * np.pi, 240)
ax.plot(np.cos(theta), np.sin(theta), color=SECONDARY, linestyle='--', linewidth=1.3, label='单位圆 |G(jω)| = 1')
ax.axhline(0.0, color='#64748B', linewidth=0.9, alpha=0.6)
ax.axvline(0.0, color='#64748B', linewidth=0.9, alpha=0.6)

ax.plot(G.real, G.imag, color=PRIMARY, linewidth=2.3, label='开环频率轨迹 G(jω) (ω>0)')
ax.plot(G.real, -G.imag, color=PRIMARY, linestyle=':', linewidth=1.3, alpha=0.55, label='共轭镜像轨迹 (ω<0)')

# 标注频向箭头与临界点 (-1, j0)
mid = 300
ax.annotate('', xy=(G.real[mid + 4], G.imag[mid + 4]), xytext=(G.real[mid], G.imag[mid]),
            arrowprops=dict(arrowstyle='->', color=PRIMARY, lw=2.2))

idx_gc = int(np.argmin(np.abs(np.abs(G) - 1.0)))
pm_deg = 180.0 + float(np.rad2deg(np.angle(G[idx_gc])))
ax.plot([0.0, G.real[idx_gc]], [0.0, G.imag[idx_gc]], color=SECONDARY, linestyle='-.', linewidth=1.4)
ax.scatter([G.real[idx_gc]], [G.imag[idx_gc]], s=65, color=SECONDARY, zorder=5, label=f'单位圆交点 PM = {pm_deg:.1f}°')

neg_mask = (G.real < 0) & (np.abs(G.imag) < 0.2)
idx_pc = int(np.argmin(np.abs(G.imag[neg_mask])))
g_pc_re = float(G.real[neg_mask][idx_pc])
gm_db = -20.0 * np.log10(abs(g_pc_re))
ax.plot([-1.0, g_pc_re], [0.0, 0.0], color=OPPOSITE, linewidth=2.6, label=f'增益裕度 GM = {gm_db:.1f} dB')
ax.scatter([-1.0], [0.0], s=95, color=OPPOSITE, marker='X', zorder=6, label='奈奎斯特临界点 (-1, j0)')

ax.set_aspect('equal', adjustable='box')
ax.set_xlim(-1.6, 1.9)
ax.set_ylim(-1.8, 1.3)
ax.set_xlabel('实部 Re[G(jω)]')
ax.set_ylabel('虚部 Im[G(jω)]')
`,
  },

  wind_rose_polar: {
    mode: 'polar',
    body: `
dirs_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
freq_tiers = np.array([
    [2.6, 4.4, 5.2, 3.0],
    [2.1, 2.8, 2.2, 0.9],
    [1.8, 2.2, 1.5, 0.5],
    [1.4, 1.8, 1.0, 0.3],
    [1.5, 2.1, 1.2, 0.4],
    [1.9, 2.8, 2.1, 0.8],
    [2.4, 3.6, 3.8, 1.8],
    [1.8, 2.4, 1.9, 0.6],
    [1.6, 2.0, 1.3, 0.4],
    [1.2, 1.5, 0.9, 0.2],
    [1.1, 1.4, 0.8, 0.2],
    [1.3, 1.7, 1.1, 0.3],
    [1.6, 2.1, 1.6, 0.5],
    [2.0, 2.9, 2.4, 0.9],
    [2.5, 3.8, 4.5, 2.6],
    [2.8, 4.8, 6.2, 4.4],
])
tier_labels = ['< 2 m/s 静微风', '2–5 m/s 轻传输', '5–8 m/s 中传输', '> 8 m/s 强扩散']
tier_colors = ['#94A3B8', SECONDARY, PRIMARY, OPPOSITE]

ax.set_theta_zero_location('N')
ax.set_theta_direction(-1)
theta = np.linspace(0.0, 2.0 * np.pi, len(dirs_16), endpoint=False)
width = 2.0 * np.pi / len(dirs_16) * 0.84

bottom = np.zeros(len(dirs_16))
for k_t in range(freq_tiers.shape[1]):
    vals = freq_tiers[:, k_t]
    ax.bar(theta, vals, width=width, bottom=bottom, color=tier_colors[k_t], alpha=0.86,
           edgecolor='#FFFFFF', linewidth=0.7, label=tier_labels[k_t])
    bottom += vals

major_idx = np.arange(0, 16, 2)
ax.set_xticks(theta[major_idx])
ax.set_xticklabels([dirs_16[i] for i in major_idx], fontsize=9.5, fontweight='bold')
ax.set_yticks([5, 10, 15, 20])
ax.set_yticklabels(['5%', '10%', '15%', '20%'], fontsize=8)
`,
  },

  swimmer_clinical_lane: {
    body: `
subjects = [
    ('S01', '干预组', 23.0, 4.0, 9.2, True),
    ('S02', '干预组', 21.5, 3.4, 11.2, True),
    ('S03', '对照组', 19.0, 5.2, None, False),
    ('S04', '干预组', 17.5, 4.6, None, True),
    ('S05', '对照组', 15.2, 5.8, 12.0, True),
    ('S06', '干预组', 13.0, 3.6, None, False),
    ('S07', '对照组', 10.4, None, None, False),
    ('S08', '对照组', 7.8, 4.2, None, False),
][::-1]

y_idx = np.arange(len(subjects))
for yi, (sid, arm, dur, pr, cr, ongoing) in enumerate(subjects):
    col = PRIMARY if arm == '干预组' else SECONDARY
    ax.barh(yi, dur, height=0.52, color=col, alpha=0.35, edgecolor=col, linewidth=1.1)
    if pr is not None:
        ax.barh(yi, dur - pr, left=pr, height=0.30, color=col, alpha=0.88)
        ax.scatter([pr], [yi], s=55, facecolor='#FFFFFF', edgecolor=col, linewidth=1.8, zorder=5)
    if cr is not None:
        ax.scatter([cr], [yi], s=68, color=OPPOSITE, marker='D', edgecolor='#FFFFFF', linewidth=1.0, zorder=6)
    if ongoing:
        ax.annotate('', xy=(dur + 1.1, yi), xytext=(dur, yi), arrowprops=dict(arrowstyle='->', color=col, lw=1.8))
    else:
        ax.scatter([dur], [yi], s=65, color=OPPOSITE, marker='X', zorder=6)

ax.axvline(12.0, color='#475569', linestyle='--', linewidth=1.2, label='12 月随访评估窗口')
ax.legend(handles=[
    mpatches.Patch(facecolor=PRIMARY, alpha=0.45, edgecolor=PRIMARY, label='高依从干预组'),
    mpatches.Patch(facecolor=SECONDARY, alpha=0.45, edgecolor=SECONDARY, label='常规对照组'),
    plt.Line2D([0], [0], marker='o', color='w', markerfacecolor='#FFFFFF', markeredgecolor=PRIMARY, markersize=7, label='首次响应起效 (PR)'),
    plt.Line2D([0], [0], marker='D', color='w', markerfacecolor=OPPOSITE, markersize=7, label='完全达标 (CR)'),
    plt.Line2D([0], [0], marker='X', color='w', markerfacecolor=OPPOSITE, markersize=7, label='复发/终止事件 (PD)'),
], frameon=False, loc='lower right', fontsize=8.2)

ax.set_yticks(y_idx)
ax.set_yticklabels([s[0] for s in subjects])
ax.set_xlim(0, 26)
ax.set_xlabel('随访观察时间 (月, 右箭头表示删失持续响应)')
ax.set_ylabel('受试个体 / 随访单元编号')
`,
  },

  bullwhip_echelon_var: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
T = 40
t = np.arange(1, T + 1)
# 生成 AR(1) 终端需求并逐级仿真 Order-Up-To (OUT) 补货策略下的订单放大波
d_noise = rng.normal(0.0, 3.2, T)
demand = np.zeros(T)
demand[0] = 100.0
for k in range(1, T):
    demand[k] = 100.0 + 0.62 * (demand[k - 1] - 100.0) + d_noise[k]

def simulate_echelon(inflow, lead_time=2, ma_win=4):
    orders = np.zeros_like(inflow)
    for k in range(len(inflow)):
        hist = inflow[max(0, k - ma_win + 1):k + 1]
        d_hat = float(np.mean(hist))
        prev_hat = float(np.mean(inflow[max(0, k - ma_win):k])) if k > 0 else d_hat
        orders[k] = inflow[k] + (lead_time + 1.0) * (d_hat - prev_hat)
    return orders

retailer = simulate_echelon(demand, lead_time=2)
distributor = simulate_echelon(retailer, lead_time=3)
factory = simulate_echelon(distributor, lead_time=4)

series = [
    ('终端需求 D', demand, '#475569', '--'),
    ('零售商订单 R', retailer, SECONDARY, '-'),
    ('分销商订单 W', distributor, '#0EA5E9', '-'),
    ('制造商排产 F', factory, OPPOSITE, '-'),
]
var_d = float(np.var(demand, ddof=1))
ratios = [float(np.var(arr, ddof=1)) / var_d for _, arr, _, _ in series]

fig = plt.figure(figsize=(10.4, 4.7), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.55, 1.0], wspace=0.28)
ax_ts, ax_bwe = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

for lbl, arr, col, ls in series:
    ax_ts.plot(t, arr, color=col, linestyle=ls, linewidth=2.0 if col == OPPOSITE else 1.6, label=lbl)
ax_ts.set_xlabel('供应链观测周次 (t = 1..40)')
ax_ts.set_ylabel('周度需求与订货量 (件)')
ax_ts.set_title('四级供应链订单波动逐级放大波形', fontsize=10.5, fontweight='bold')
ax_ts.legend(frameon=False, loc='upper left', ncol=2, fontsize=8)

y_pos = np.arange(len(series))
bar_cols = ['#64748B', SECONDARY, '#0EA5E9', OPPOSITE]
ax_bwe.axvline(1.0, color='#475569', linestyle='--', linewidth=1.1)
ax_bwe.barh(y_pos, ratios, color=bar_cols, alpha=0.84, height=0.55)
for yi, r_val in enumerate(ratios):
    ax_bwe.text(r_val + 0.08, yi, f'{r_val:.2f}×', va='center', fontsize=8.8, fontweight='bold', color=bar_cols[yi])
ax_bwe.set_yticks(y_pos)
ax_bwe.set_yticklabels([s[0] for s in series])
ax_bwe.set_xlim(0.0, max(ratios) * 1.25)
ax_bwe.set_xlabel('牛鞭方差放大比 Var(O_k) / Var(D)')
ax_bwe.set_title('各层级方差放大与安全库存倍增', fontsize=10.5, fontweight='bold')

for target_ax in (ax_ts, ax_bwe):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)
fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.07, right=0.97, bottom=0.14, top=0.84)
`,
  },

  gantt_critical_path: {
    body: `
# 定义调研 WBS 工序 DAG 并自动执行 CPM 前推/后推拓扑计算
wbs = [
    ('A 抽样框编制', 2, []),
    ('B 问卷初稿设计', 2, []),
    ('C 预调研与净化', 3, [0, 1]),
    ('D 访员分层培训', 2, [1]),
    ('E 正式入户采集', 3, [2, 3]),
    ('F 四阶清洗加权', 2, [4]),
    ('G 建模复核定稿', 2, [5]),
]
n_t = len(wbs)
es, ef = np.zeros(n_t), np.zeros(n_t)
for i, (_, dur, preds) in enumerate(wbs):
    es[i] = max([ef[p] for p in preds], default=0.0)
    ef[i] = es[i] + dur

proj_end = float(np.max(ef))
ls, lf = np.full(n_t, proj_end), np.full(n_t, proj_end)
succs = [[] for _ in range(n_t)]
for i, (_, _, preds) in enumerate(wbs):
    for p in preds:
        succs[p].append(i)
for i in range(n_t - 1, -1, -1):
    lf[i] = min([ls[s] for s in succs[i]], default=proj_end)
    ls[i] = lf[i] - wbs[i][1]
total_float = ls - es

y_pos = np.arange(n_t)[::-1]
for i, (name, dur, preds) in enumerate(wbs):
    yi = y_pos[i]
    crit = total_float[i] < 1e-6
    col = PRIMARY if crit else SECONDARY
    if total_float[i] > 0:
        ax.barh(yi, total_float[i], left=ef[i], height=0.44, color=SECONDARY, alpha=0.18,
                edgecolor=SECONDARY, linestyle='--', linewidth=1.1)
    ax.barh(yi, dur, left=es[i], height=0.52, color=col, alpha=0.82, edgecolor=col, linewidth=1.2)
    lbl = '关键 (Float=0)' if crit else f'Float=+{total_float[i]:.0f}周'
    ax.text(lf[i] + 0.25, yi, lbl, va='center', fontsize=8.5, fontweight='bold' if crit else 'normal',
            color=OPPOSITE if crit else '#475569')
    for p in preds:
        yp = y_pos[p]
        conn = 'angle,angleA=0,angleB=90,rad=2' if es[i] > ef[p] + 1e-6 else 'arc3,rad=0'
        ax.annotate('', xy=(es[i], yi), xytext=(ef[p], yp),
                    arrowprops=dict(arrowstyle='->', color='#475569', lw=1.0, connectionstyle=conn))

ax.scatter([ef[-1]], [y_pos[-1]], s=95, color=OPPOSITE, marker='D', zorder=6, label='总工期交付里程碑')
ax.legend(handles=[
    mpatches.Patch(facecolor=PRIMARY, alpha=0.82, label='关键路径工序 (Total Float = 0)'),
    mpatches.Patch(facecolor=SECONDARY, alpha=0.82, label='非关键弹性工序'),
    mpatches.Patch(facecolor=SECONDARY, alpha=0.18, edgecolor=SECONDARY, linestyle='--', label='可缓冲总时差'),
], frameon=False, loc='lower left', fontsize=8.5)
ax.set_yticks(y_pos)
ax.set_yticklabels([w[0] for w in wbs])
ax.set_xlim(0, proj_end + 3.0)
ax.set_xticks(np.arange(0, int(proj_end) + 1, 2))
ax.set_xticklabels([f'W{w}' for w in range(0, int(proj_end) + 1, 2)])
ax.set_xlabel('CPM 调研实施周次进度 (WBS 依赖拓扑)')
`,
  },

  bloch_quantum_fidelity: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
m_grid = np.linspace(0, 120, 60)
m_pts = np.array([0, 20, 40, 60, 80, 100, 120])
f_1q = 0.5 + 0.49 * (0.9984 ** m_grid)
f_dd = 0.5 + 0.49 * (0.9920 ** m_grid)
f_2q = 0.5 + 0.49 * (0.9840 ** m_grid)

fig = plt.figure(figsize=(10.2, 4.9), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.35, 1.0], wspace=0.26)
ax_rb = fig.add_subplot(gs[0])
ax_bloch = fig.add_subplot(gs[1], projection='3d')

ax_rb.axhline(0.50, color='#64748B', linestyle=':', linewidth=1.2, label='完全退极化混合态下界 (0.50)')
ax_rb.plot(m_grid, f_1q, color=PRIMARY, linewidth=2.3, label='单比特门 RB (F1q = 99.92%)')
ax_rb.plot(m_grid, f_dd, color=SECONDARY, linewidth=2.0, label='动力学解耦保护 DD (F = 99.60%)')
ax_rb.plot(m_grid, f_2q, color=OPPOSITE, linewidth=2.0, label='双比特 CZ 门 RB (F2q = 99.18%)')
ax_rb.errorbar(m_pts, 0.5 + 0.49 * (0.9840 ** m_pts), yerr=0.015, fmt='o', color=OPPOSITE, capsize=3.5, markersize=4.5)
ax_rb.errorbar(m_pts, 0.5 + 0.49 * (0.9920 ** m_pts), yerr=0.011, fmt='s', color=SECONDARY, capsize=3.5, markersize=4.0)
ax_rb.set_xlim(0, 122)
ax_rb.set_ylim(0.47, 1.02)
ax_rb.set_xlabel('Clifford 门序列深度 m')
ax_rb.set_ylabel('随机基准平均保真度 F(m)')
ax_rb.set_title('RB 保真度指数衰减拟合 F(m) = A*p^m + 0.5', fontsize=10.5, fontweight='bold')
ax_rb.legend(frameon=False, loc='lower left', fontsize=8.2)
ax_rb.spines['top'].set_visible(False)
ax_rb.spines['right'].set_visible(False)
ax_rb.grid(True, linestyle='--', alpha=0.25)

u = np.linspace(0, 2 * np.pi, 32)
v = np.linspace(0, np.pi, 18)
xs = np.outer(np.cos(u), np.sin(v))
ys = np.outer(np.sin(u), np.sin(v))
zs = np.outer(np.ones_like(u), np.cos(v))
ax_bloch.plot_wireframe(xs, ys, zs, rstride=3, cstride=4, color='#CBD5E1', linewidth=0.5, alpha=0.5)
ax_bloch.plot([0, 0], [0, 0], [-1.15, 1.15], color='#475569', linewidth=1.1)
ax_bloch.plot([-1.15, 1.15], [0, 0], [0, 0], color='#475569', linewidth=0.9)
ax_bloch.text(0, 0, 1.24, '|0>', ha='center', fontsize=9.5, fontweight='bold', color='#1E293B')
ax_bloch.text(0, 0, -1.30, '|1>', ha='center', fontsize=9.5, fontweight='bold', color='#1E293B')
ax_bloch.text(1.22, 0, 0, '|+>', ha='left', fontsize=9, color='#475569')

t_dec = np.linspace(0.0, 2.2, 90)
r_xy = np.exp(-t_dec / 1.1)
bx = r_xy * np.cos(4.2 * t_dec)
by = r_xy * np.sin(4.2 * t_dec)
bz = 0.25 + 0.70 * (1.0 - np.exp(-t_dec / 1.8))
ax_bloch.plot(bx, by, bz, color=OPPOSITE, linewidth=2.2, label='T1/T2 退相干衰减轨线')
ax_bloch.quiver(0, 0, 0, bx[0], by[0], bz[0], color=PRIMARY, linewidth=2.0, arrow_length_ratio=0.14, label='初始叠加态矢量')
ax_bloch.set_xlim(-1.1, 1.1)
ax_bloch.set_ylim(-1.1, 1.1)
ax_bloch.set_zlim(-1.1, 1.1)
ax_bloch.set_axis_off()
ax_bloch.set_title('Bloch 球 T1=84us / T2=62us 弛豫轨迹', fontsize=10.5, fontweight='bold')
ax_bloch.legend(frameon=False, loc='lower center', fontsize=8.2)

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.07, right=0.97, bottom=0.12, top=0.84)
`,
  },

  spatial_lisa_quadrant: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
# 构造 5x5 规则区县空间网格与 Queen 邻接行标准化空间权重矩阵 W
n_side = 5
n_reg = n_side * n_side
W = np.zeros((n_reg, n_reg))
for r in range(n_side):
    for c in range(n_side):
        idx = r * n_side + c
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if dr == 0 and dc == 0:
                    continue
                nr, nc = r + dr, c + dc
                if 0 <= nr < n_side and 0 <= nc < n_side:
                    W[idx, nr * n_side + nc] = 1.0
W = W / W.sum(axis=1, keepdims=True)

rr, cc = np.meshgrid(np.arange(n_side), np.arange(n_side), indexing='ij')
raw_val = (0.45 * rr.ravel() + 0.42 * cc.ravel() - 1.7 + rng.normal(0.0, 0.36, n_reg))
raw_val[7] = 1.55   # 构造局部高-低 (H-L) 空间极化中心
raw_val[16] = -1.35 # 构造局部低-高 (L-H) 空间洼地
z = (raw_val - np.mean(raw_val)) / np.std(raw_val)
wz = W @ z

moran_i = float((z @ wz) / (z @ z))
lisa_i = z * wz
# 999 次条件置换近似显著性检验 (固定自身 z_i, 置换邻域均值)
p_vals = np.ones(n_reg)
n_perm = 499
for i in range(n_reg):
    others = np.delete(z, i)
    nz_cols = np.where(W[i] > 0)[0]
    w_sub = W[i, nz_cols]
    obs_lisa = lisa_i[i]
    cnt = 0
    for _ in range(n_perm):
        perm_nbrs = rng.choice(others, size=len(nz_cols), replace=False)
        sim_lisa = z[i] * float(w_sub @ perm_nbrs)
        if abs(sim_lisa) >= abs(obs_lisa):
            cnt += 1
    p_vals[i] = (cnt + 1.0) / (n_perm + 1.0)

cls_code = np.zeros(n_reg, dtype=int)  # 0:NS, 1:HH, 2:LL, 3:HL, 4:LH
sig = p_vals < 0.10
cls_code[sig & (z > 0) & (wz > 0)] = 1
cls_code[sig & (z < 0) & (wz < 0)] = 2
cls_code[sig & (z > 0) & (wz < 0)] = 3
cls_code[sig & (z < 0) & (wz > 0)] = 4

col_map = {0: '#CBD5E1', 1: PRIMARY, 2: SECONDARY, 3: OPPOSITE, 4: '#0D9488'}
lbl_map = {0: 'n.s.', 1: 'H-H', 2: 'L-L', 3: 'H-L', 4: 'L-H'}

fig = plt.figure(figsize=(10.4, 4.9), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.05, 1.05], wspace=0.26)
ax_sc = fig.add_subplot(gs[0])
ax_mp = fig.add_subplot(gs[1])

ax_sc.axhline(0, color='#64748B', linestyle='--', linewidth=1.0)
ax_sc.axvline(0, color='#64748B', linestyle='--', linewidth=1.0)
z_line = np.linspace(-2.2, 2.2, 50)
ax_sc.plot(z_line, moran_i * z_line, color=PRIMARY, linewidth=2.0, label=f"Moran's I = {moran_i:.3f}")
for k in range(5):
    m = cls_code == k
    if np.any(m):
        ax_sc.scatter(z[m], wz[m], s=58 if k > 0 else 36, color=col_map[k],
                      edgecolor='#FFFFFF', linewidth=0.8, label=lbl_map[k], zorder=4 if k > 0 else 3)
ax_sc.set_xlim(-2.2, 2.2)
ax_sc.set_ylim(-2.0, 2.0)
ax_sc.set_xlabel('标准化观测值 z')
ax_sc.set_ylabel('空间滞后项 Wz')
ax_sc.set_title('全局 Moran 散点象限分布', fontsize=10.5, fontweight='bold')
ax_sc.legend(frameon=False, loc='upper left', ncol=2, fontsize=8)
ax_sc.spines['top'].set_visible(False)
ax_sc.spines['right'].set_visible(False)
ax_sc.grid(True, linestyle='--', alpha=0.25)

for r in range(n_side):
    for c in range(n_side):
        idx = r * n_side + c
        code = int(cls_code[idx])
        rect = mpatches.Rectangle((c, n_side - 1 - r), 0.94, 0.94, facecolor=col_map[code],
                                  edgecolor='#FFFFFF', linewidth=1.6, alpha=0.88)
        ax_mp.add_patch(rect)
        ax_mp.text(c + 0.47, n_side - 1 - r + 0.47, lbl_map[code], ha='center', va='center',
                   fontsize=8.8, fontweight='bold', color='#FFFFFF' if code > 0 else '#475569')
ax_mp.set_xlim(-0.05, n_side)
ax_mp.set_ylim(-0.05, n_side)
ax_mp.set_aspect('equal')
ax_mp.axis('off')
ax_mp.set_title('局部 LISA 显著集聚区划映射 (p < 0.10)', fontsize=10.5, fontweight='bold')

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.07, right=0.97, bottom=0.13, top=0.84)
`,
  },

  garch_volatility_cone: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
n_t = 160
t = np.arange(n_t)
omega, alpha, beta = 0.08, 0.11, 0.84
sigma2 = np.zeros(n_t)
ret = np.zeros(n_t)
sigma2[0] = omega / (1.0 - alpha - beta)
eps = rng.normal(0.0, 1.0, n_t)
eps[68] = -2.45
eps[124] = 2.38
for k in range(1, n_t):
    ret[k - 1] = np.sqrt(sigma2[k - 1]) * eps[k - 1]
    sigma2[k] = omega + alpha * (ret[k - 1] ** 2) + beta * sigma2[k - 1]
ret[-1] = np.sqrt(sigma2[-1]) * eps[-1]
sig = np.sqrt(sigma2)
var95 = 1.96 * sig
var99 = 2.58 * sig
breach = np.abs(ret) > var95

horizons = np.array([5, 20, 60, 120])
h_labels = ['5D', '20D', '60D', '120D']
x_h = np.arange(len(horizons))
cone_max = np.array([38.0, 34.0, 30.0, 27.0])
cone_q75 = np.array([30.0, 27.0, 24.0, 22.0])
cone_med = np.array([23.0, 21.0, 19.0, 18.0])
cone_q25 = np.array([17.0, 16.0, 15.0, 14.0])
cone_min = np.array([12.0, 11.5, 11.0, 10.5])
cur_term = np.array([32.0, 26.2, 22.4, 19.6])

fig = plt.figure(figsize=(10.4, 4.8), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.45, 1.0], wspace=0.26)
ax_ts, ax_cone = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

ax_ts.fill_between(t, -var99, var99, color=PRIMARY, alpha=0.12, label='99% 动态 VaR 带 (±2.58 sigma_t)')
ax_ts.fill_between(t, -var95, var95, color=PRIMARY, alpha=0.22, label='95% 动态 VaR 带 (±1.96 sigma_t)')
ax_ts.plot(t, ret, color=SECONDARY, linewidth=1.1, label='日度收益率 r_t (%)')
ax_ts.scatter(t[breach], ret[breach], s=48, color=OPPOSITE, zorder=5, label=f'VaR 穿透 ({int(breach.sum())}次)')
ax_ts.axhline(0.0, color='#64748B', linestyle=':', linewidth=0.9)
ax_ts.set_xlabel('交易日序列 t (alpha+beta = 0.95)')
ax_ts.set_ylabel('收益率与 VaR 阈值 (%)')
ax_ts.set_title('GARCH(1,1) 时变条件波动率与 VaR 带', fontsize=10.5, fontweight='bold')
ax_ts.legend(frameon=False, loc='upper left', ncol=2, fontsize=7.8)

ax_cone.fill_between(x_h, cone_min, cone_max, color='#94A3B8', alpha=0.22, label='历史极值带 (Min–Max)')
ax_cone.fill_between(x_h, cone_q25, cone_q75, color=SECONDARY, alpha=0.24, label='历史四分位带 (25%–75%)')
ax_cone.plot(x_h, cone_med, color='#475569', linestyle='--', linewidth=1.3, label='历史中位数')
ax_cone.plot(x_h, cur_term, color=OPPOSITE, marker='o', markersize=6, linewidth=2.3, label='当前 GARCH 期限预测')
ax_cone.set_xticks(x_h)
ax_cone.set_xticklabels(h_labels)
ax_cone.set_ylim(8, 42)
ax_cone.set_xlabel('波动率预测期限窗口')
ax_cone.set_ylabel('年化波动率 (%)')
ax_cone.set_title('多期限波动率锥分位定位', fontsize=10.5, fontweight='bold')
ax_cone.legend(frameon=False, loc='upper right', fontsize=7.8)

for target_ax in (ax_ts, ax_cone):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.07, right=0.97, bottom=0.14, top=0.84)
`,
  },

  spatial_geary_correlogram: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
# 构造 6x6 规则空间网格并计算多距离带下 Moran's I 与 Geary's C 衰减曲线
n_side = 6
coords = np.array([[r, c] for r in range(n_side) for c in range(n_side)], dtype=float)
n_reg = len(coords)
val = 1.8 * np.sin(coords[:, 0] * 0.55) + 1.5 * np.cos(coords[:, 1] * 0.48) + rng.normal(0.0, 0.35, n_reg)
z = val - np.mean(val)
dist_mat = np.sqrt(np.sum((coords[:, None, :] - coords[None, :, :]) ** 2, axis=2))

bands = [(0.5, 1.5, 20), (1.5, 2.5, 40), (2.5, 3.5, 60), (3.5, 4.5, 80), (4.5, 5.5, 100), (5.5, 7.2, 120)]
d_km, moran_vals, geary_vals = [], [], []
for d_lo, d_hi, km in bands:
    W = ((dist_mat > d_lo) & (dist_mat <= d_hi)).astype(float)
    s0 = float(W.sum())
    moran = (n_reg / s0) * float((z @ W @ z) / (z @ z))
    diff_sq = (val[:, None] - val[None, :]) ** 2
    geary = ((n_reg - 1.0) / (2.0 * s0)) * float(np.sum(W * diff_sq) / np.sum(z ** 2))
    d_km.append(km)
    moran_vals.append(moran)
    geary_vals.append(geary)

d_arr = np.array(d_km)
fig = plt.figure(figsize=(9.2, 5.4), dpi=180)
gs = GridSpec(2, 1, hspace=0.22)
ax_m = fig.add_subplot(gs[0])
ax_g = fig.add_subplot(gs[1], sharex=ax_m)

ax_m.axhspan(-0.12, 0.12, color='#94A3B8', alpha=0.18, label='95% 随机置换不显著带')
ax_m.axhline(0.0, color='#475569', linestyle='--', linewidth=1.1, label='随机期望基准 I = 0')
ax_m.plot(d_arr, moran_vals, color=PRIMARY, marker='o', markersize=6.5, linewidth=2.2, label="全局 Moran's I(d) (正相关 > 0)")
ax_m.axvline(60, color=OPPOSITE, linestyle='--', linewidth=1.3)
ax_m.text(62, max(moran_vals) * 0.78, '溢出临界半径 d* = 60 km', fontsize=8.8, fontweight='bold', color=OPPOSITE)
ax_m.set_ylabel("Moran's I")
ax_m.set_title("空间自相关距离衰减: Moran's I vs Geary's C", fontsize=10.5, fontweight='bold')
ax_m.legend(frameon=False, loc='upper right', fontsize=8.0)
ax_m.tick_params(labelbottom=False)

ax_g.axhspan(0.88, 1.12, color='#94A3B8', alpha=0.18, label='95% 随机置换带')
ax_g.axhline(1.0, color='#475569', linestyle='--', linewidth=1.1, label='随机期望基准 C = 1.0')
ax_g.plot(d_arr, geary_vals, color=SECONDARY, marker='s', markersize=6.5, linewidth=2.2, label="局部敏感 Geary's C(d) (正相关 < 1)")
ax_g.axvline(60, color=OPPOSITE, linestyle='--', linewidth=1.3)
ax_g.set_xlabel('空间距离滞后带宽 d (km)')
ax_g.set_ylabel("Geary's C")
ax_g.legend(frameon=False, loc='lower right', fontsize=8.0)

for target_ax in (ax_m, ax_g):
    target_ax.spines['top'].set_visible(False)
    target_ax.spines['right'].set_visible(False)
    target_ax.grid(True, linestyle='--', alpha=0.25)

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.09, right=0.96, bottom=0.11, top=0.87)
`,
  },

  reliability_mtbf_weibull: {
    imports: ['import math'],
    body: `
# 两参数 Weibull 寿命仿真与 Bernard 中位秩双对数坐标线性拟合
n_fail = 28
true_beta, true_eta = 1.84, 1420.0
t_fail = np.sort(rng.weibull(true_beta, n_fail) * true_eta)
ranks = np.arange(1, n_fail + 1)
f_bernard = (ranks - 0.3) / (n_fail + 0.4)

x_emp = np.log(t_fail)
y_emp = np.log(-np.log(1.0 - f_bernard))
slope, intercept = np.polyfit(x_emp, y_emp, 1)
beta_hat = float(slope)
eta_hat = float(np.exp(-intercept / beta_hat))
mtbf = eta_hat * math.gamma(1.0 + 1.0 / beta_hat)
b10 = eta_hat * ((-np.log(0.90)) ** (1.0 / beta_hat))

xg = np.linspace(x_emp.min() - 0.25, x_emp.max() + 0.20, 80)
yg = slope * xg + intercept
resid = y_emp - (slope * x_emp + intercept)
s_err = float(np.sqrt(np.sum(resid ** 2) / (n_fail - 2)))
x_mean = float(np.mean(x_emp))
se_band = s_err * np.sqrt(1.0 / n_fail + ((xg - x_mean) ** 2) / np.sum((x_emp - x_mean) ** 2))
ci_half = 2.05 * se_band

ax.fill_between(np.exp(xg), yg - ci_half, yg + ci_half, color=PRIMARY, alpha=0.16, label='95% 双侧回归置信带')
ax.plot(np.exp(xg), yg, color=PRIMARY, linewidth=2.3, label=f'Weibull 拟合 (beta={beta_hat:.2f}, eta={eta_hat:.0f}h)')
ax.scatter(t_fail, y_emp, s=46, color=SECONDARY, edgecolor='#FFFFFF', linewidth=0.9, zorder=5, label='Bernard 中位秩实测点')

y_632 = math.log(-math.log(1.0 - 0.6321))
y_b10 = math.log(-math.log(0.90))
ax.axhline(y_632, color=OPPOSITE, linestyle='--', linewidth=1.2)
ax.axvline(eta_hat, color=OPPOSITE, linestyle='--', linewidth=1.2, label=f'特征寿命 eta={eta_hat:.0f}h (MTBF={mtbf:.0f}h)')
ax.axhline(y_b10, color='#64748B', linestyle=':', linewidth=1.1)
ax.axvline(b10, color='#64748B', linestyle=':', linewidth=1.1, label=f'B10 寿命 = {b10:.0f}h')

p_ticks = [0.05, 0.10, 0.30, 0.632, 0.90]
ax.set_xscale('log')
ax.set_yticks([math.log(-math.log(1.0 - p)) for p in p_ticks])
ax.set_yticklabels(['5%', '10%', '30%', '63.2%', '90%'])
ax.set_xlabel('设备失效时长 t (小时, 对数刻度)')
ax.set_ylabel('累计失效概率 F(t) (Weibull 双对数刻度)')
`,
  },

  spatial_gwr_coef_surface: {
    mode: 'custom',
    imports: ['import math', 'from matplotlib.gridspec import GridSpec'],
    body: `
# 构造 8x8 空间格网并执行自适应双平方核 (Adaptive Bisquare) 地理加权回归 GWR
n_side = 8
coords = np.array([[c / (n_side - 1), r / (n_side - 1)] for r in range(n_side) for c in range(n_side)], dtype=float)
N = len(coords)
u_c, v_c = coords[:, 0], coords[:, 1]
true_b0 = 2.2 + 0.3 * u_c
true_b1 = 0.08 + 0.60 * np.exp(-(((u_c - 0.72) ** 2 + (v_c - 0.72) ** 2) / 0.16))
x_var = rng.normal(0.0, 1.0, N)
y_var = true_b0 + true_b1 * x_var + rng.normal(0.0, 0.22, N)

X_g = np.column_stack([np.ones(N), x_var])
beta_ols = float(np.linalg.lstsq(X_g, y_var, rcond=None)[0][1])

dist_mat = np.sqrt(np.sum((coords[:, None, :] - coords[None, :, :]) ** 2, axis=2))
k_bw = 24
local_b1 = np.zeros(N)
local_t = np.zeros(N)
for i in range(N):
    d_i = dist_mat[i]
    bw_i = float(np.partition(d_i, k_bw)[k_bw])
    w_i = np.where(d_i < bw_i, (1.0 - (d_i / max(bw_i, 1e-6)) ** 2) ** 2, 0.0)
    W_mat = np.diag(w_i)
    XtWX = X_g.T @ W_mat @ X_g
    XtWX_inv = np.linalg.inv(XtWX + np.eye(2) * 1e-6)
    b_i = XtWX_inv @ (X_g.T @ W_mat @ y_var)
    res_i = y_var - X_g @ b_i
    s2_i = float(np.sum(w_i * (res_i ** 2))) / max(2.0, float(np.sum(w_i > 0)) - 2.0)
    se_b1 = math.sqrt(max(1e-9, s2_i * float(XtWX_inv[1, 1])))
    local_b1[i] = float(b_i[1])
    local_t[i] = local_b1[i] / se_b1

sig_mask = np.abs(local_t) >= 1.96
b_grid = local_b1.reshape(n_side, n_side)
sig_grid = sig_mask.reshape(n_side, n_side)

grid_x = np.linspace(float(local_b1.min()) - 0.08, float(local_b1.max()) + 0.08, 180)
bw_kde = 1.06 * float(np.std(local_b1, ddof=1)) * (N ** (-0.2))
kde_y = np.mean(np.exp(-0.5 * (((grid_x[:, None] - local_b1[None, :]) / bw_kde) ** 2)), axis=1) / (bw_kde * math.sqrt(2.0 * math.pi))

fig = plt.figure(figsize=(10.4, 4.8), dpi=180)
gs = GridSpec(1, 2, width_ratios=[1.12, 1.0], wspace=0.28)
ax_map, ax_kde = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

cmap_gwr = mcolors.LinearSegmentedColormap.from_list('gwr_div', [OPPOSITE, '#F8FAFC', PRIMARY])
im = ax_map.imshow(b_grid, cmap=cmap_gwr, origin='lower', interpolation='bilinear', vmin=0.0, vmax=0.72)
plt.colorbar(im, ax=ax_map, fraction=0.046, pad=0.04, label='局域回归系数 beta_i(u,v)')
sig_r, sig_c = np.where(sig_grid)
ax_map.scatter(sig_c, sig_r, s=36, color='#FFFFFF', edgecolor='#0F172A', linewidth=1.0, zorder=4, label='|t| >= 1.96 显著区')
ax_map.set_xticks(range(n_side))
ax_map.set_yticks(range(n_side))
ax_map.set_xlabel('空间经度格网索引 u')
ax_map.set_ylabel('空间纬度格网索引 v')
ax_map.set_title(f'GWR 局域系数空间平滑表面 (显著占比 {np.mean(sig_mask)*100:.1f}%)', fontsize=10.2, fontweight='bold')
ax_map.legend(frameon=True, facecolor='#FFFFFF', framealpha=0.85, loc='lower left', fontsize=8.0)

ax_kde.hist(local_b1, bins=12, density=True, color=SECONDARY, alpha=0.28, edgecolor='#FFFFFF', linewidth=0.8, label='局域系数直方图')
ax_kde.plot(grid_x, kde_y, color=PRIMARY, linewidth=2.2, label='局域系数核密度')
sig_thr = float(np.min(local_b1[sig_mask])) if np.any(sig_mask) else 0.35
ax_kde.fill_between(grid_x, 0, kde_y, where=(grid_x >= sig_thr), color=PRIMARY, alpha=0.22, label='|t| >= 1.96 显著区质量')
ax_kde.axvline(beta_ols, color=OPPOSITE, linestyle='--', linewidth=1.8, label=f'全局 OLS beta = {beta_ols:.3f}')
q25, q75 = np.quantile(local_b1, [0.25, 0.75])
ax_kde.axvspan(q25, q75, color=PRIMARY, alpha=0.08, label=f'IQR [{q25:.2f}, {q75:.2f}]')
ax_kde.set_xlabel('局域回归参数估计值 beta_i')
ax_kde.set_ylabel('空间单元概率密度')
ax_kde.set_title('局域参数异质性分布 vs 全局 OLS 均值', fontsize=10.2, fontweight='bold')
ax_kde.legend(frameon=False, loc='upper right', fontsize=7.8)
ax_kde.spines['top'].set_visible(False)
ax_kde.spines['right'].set_visible(False)
ax_kde.grid(True, linestyle='--', alpha=0.25)

fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.07, right=0.97, bottom=0.14, top=0.84)
`,
  },

  cohort_age_period_apc: {
    mode: 'custom',
    imports: ['from matplotlib.gridspec import GridSpec'],
    body: `
# 构造 A=7 年龄组 x P=5 时期 -> C=11 出生队列列联数据并求解本征估计量 (Intrinsic Estimator, IE)
A_cnt, P_cnt = 7, 5
C_cnt = A_cnt + P_cnt - 1
age_labels = ['20', '25', '30', '35', '40', '45', '50+']
per_labels = ['2005', '2010', '2015', '2020', '2025']
coh_labels = [str(1955 + 5 * c) for c in range(C_cnt)]

true_a = np.array([0.10, 0.24, 0.34, 0.22, 0.04, -0.32, -0.62])
true_p = np.array([-0.24, -0.10, 0.02, 0.12, 0.20])
true_c = np.array([-0.34, -0.28, -0.22, -0.14, -0.05, 0.05, 0.14, 0.20, 0.24, 0.22, 0.18])

rows_X, rows_y = [], []
for a in range(A_cnt):
    for p in range(P_cnt):
        c = (A_cnt - 1 - a) + p
        y_val = 3.40 + true_a[a] + true_p[p] + true_c[c] + rng.normal(0.0, 0.055)
        vec_a = np.eye(A_cnt - 1)[a] if a < A_cnt - 1 else -np.ones(A_cnt - 1)
        vec_p = np.eye(P_cnt - 1)[p] if p < P_cnt - 1 else -np.ones(P_cnt - 1)
        vec_c = np.eye(C_cnt - 1)[c] if c < C_cnt - 1 else -np.ones(C_cnt - 1)
        rows_X.append(np.concatenate([[1.0], vec_a, vec_p, vec_c]))
        rows_y.append(y_val)

X_apc = np.array(rows_X)
y_apc = np.array(rows_y)

# 奇异值分解 SVD 剥离 Age = Period - Cohort 的唯一零奇异共线维度，求最小范数 IE 估计与解析标准误
U, S, Vt = np.linalg.svd(X_apc, full_matrices=False)
keep = S > 1e-8
U_k, S_k, Vt_k = U[:, keep], S[keep], Vt[keep, :]
theta_ie = Vt_k.T @ ((U_k.T @ y_apc) / S_k)
resid = y_apc - X_apc @ theta_ie
sigma2 = float(np.sum(resid ** 2) / max(1, len(y_apc) - int(np.sum(keep))))
cov_ie = sigma2 * (Vt_k.T @ np.diag(1.0 / (S_k ** 2)) @ Vt_k)

def extract_full(start_idx, n_free, cov_mat, est_vec):
    sub_b = est_vec[start_idx:start_idx + n_free]
    full_b = np.append(sub_b, -np.sum(sub_b))
    L = np.vstack([np.eye(n_free), -np.ones((1, n_free))])
    sub_cov = cov_mat[start_idx:start_idx + n_free, start_idx:start_idx + n_free]
    full_se = np.sqrt(np.diag(L @ sub_cov @ L.T))
    return full_b, full_se

b_a, se_a = extract_full(1, A_cnt - 1, cov_ie, theta_ie)
b_p, se_p = extract_full(1 + (A_cnt - 1), P_cnt - 1, cov_ie, theta_ie)
b_c, se_c = extract_full(1 + (A_cnt - 1) + (P_cnt - 1), C_cnt - 1, cov_ie, theta_ie)

fig = plt.figure(figsize=(11.2, 4.7), dpi=180)
gs = GridSpec(1, 3, width_ratios=[1.0, 0.85, 1.25], wspace=0.16)
axes = [fig.add_subplot(gs[0])]
axes.append(fig.add_subplot(gs[1], sharey=axes[0]))
axes.append(fig.add_subplot(gs[2], sharey=axes[0]))

specs_apc = [
    ('年龄效应 (Age)', age_labels, b_a, se_a, PRIMARY, '年龄分层 (岁)'),
    ('时期效应 (Period)', per_labels, b_p, se_p, SECONDARY, '调查时期 (年)'),
    ('队列效应 (Cohort)', coh_labels[::2], b_c[::2], se_c[::2], OPPOSITE, '出生队列世代 (每10年标注)'),
]
for idx_ax, (ttl, lbls, est_v, se_v, col, x_lbl) in enumerate(specs_apc):
    cur_ax = axes[idx_ax]
    xs = np.arange(len(est_v))
    if idx_ax == 2:
        xs_all = np.arange(len(b_c))
        cur_ax.fill_between(xs_all, b_c - 1.96 * se_c, b_c + 1.96 * se_c, color=col, alpha=0.20, label='95% IE 置信带')
        cur_ax.plot(xs_all, b_c, color=col, marker='o', markersize=4.5, linewidth=2.2, label='IE 净效应轨迹')
        cur_ax.set_xticks(xs_all[::2])
        cur_ax.set_xticklabels(lbls, fontsize=8.4)
    else:
        cur_ax.fill_between(xs, est_v - 1.96 * se_v, est_v + 1.96 * se_v, color=col, alpha=0.20, label='95% IE 置信带')
        cur_ax.plot(xs, est_v, color=col, marker='o', markersize=5.0, linewidth=2.2, label='IE 净效应轨迹')
        cur_ax.set_xticks(xs)
        cur_ax.set_xticklabels(lbls, fontsize=8.4)
    cur_ax.axhline(0.0, color='#475569', linestyle='--', linewidth=1.1)
    cur_ax.set_title(ttl, fontsize=10.5, fontweight='bold', color=col)
    cur_ax.set_xlabel(x_lbl)
    cur_ax.legend(frameon=False, loc='upper right' if idx_ax == 0 else 'upper left', fontsize=7.8)
    cur_ax.spines['top'].set_visible(False)
    cur_ax.spines['right'].set_visible(False)
    cur_ax.grid(True, linestyle='--', alpha=0.25)
    if idx_ax > 0:
        plt.setp(cur_ax.get_yticklabels(), visible=False)

axes[0].set_ylabel('本征估计量 IE 净效应偏离 (95% CI)')
fig.suptitle(TITLE, fontsize=12.0, fontweight='bold', y=0.97)
fig.subplots_adjust(left=0.07, right=0.97, bottom=0.14, top=0.84)
`,
  },
};

export function buildChartPythonCode(item: ResourceChartItem, ink: FigureInk): string {
  const { primary, secondary, opposite } = resolveInkColors(ink);
  const spec = CHART_PYTHON_SPECS[item.previewKind];
  const extraImports = spec.imports?.length ? `${spec.imports.join('\n')}\n` : '';
  const mode = spec.mode ?? '2d';
  const fileSlug = sanitizeIdentifier(item.id, 'chart');

  let canvasSetup = '';
  let canvasFooter = '';

  if (mode === '2d') {
    canvasSetup = `fig, ax = plt.subplots(figsize=(8.6, 5.2), dpi=180)\n`;
    canvasFooter = `
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.grid(True, linestyle='--', alpha=0.25)
if ax.get_legend() is None and ax.get_legend_handles_labels()[0]:
    ax.legend(frameon=False, loc='best')
ax.set_title(TITLE, fontsize=12.5, fontweight='bold', pad=12)
fig.tight_layout()`;
  } else if (mode === 'polar') {
    canvasSetup = `fig, ax = plt.subplots(figsize=(7.0, 6.2), dpi=180, subplot_kw={'projection': 'polar'})\n`;
    canvasFooter = `
if 'top' in ax.spines:
    ax.spines['top'].set_visible(False)
if 'right' in ax.spines:
    ax.spines['right'].set_visible(False)
ax.spines['polar'].set_alpha(0.35)
ax.grid(True, linestyle='--', alpha=0.25)
if ax.get_legend() is None and ax.get_legend_handles_labels()[0]:
    ax.legend(frameon=False, loc='upper right', bbox_to_anchor=(1.22, 1.10))
ax.set_title(TITLE, fontsize=12.5, fontweight='bold', pad=18)
fig.tight_layout()`;
  } else if (mode === '3d') {
    canvasSetup = `fig = plt.figure(figsize=(8.4, 5.8), dpi=180)\nax = fig.add_subplot(111, projection='3d')\n`;
    canvasFooter = `
if 'top' in ax.spines:
    ax.spines['top'].set_visible(False)
if 'right' in ax.spines:
    ax.spines['right'].set_visible(False)
ax.grid(True, linestyle='--', alpha=0.25)
if ax.get_legend() is None and ax.get_legend_handles_labels()[0]:
    ax.legend(frameon=False, loc='upper left')
ax.set_title(TITLE, fontsize=12.5, fontweight='bold', pad=12)
fig.subplots_adjust(left=0.05, right=0.95, bottom=0.08, top=0.90)`;
  } else {
    // custom multi-panel figure creates its own `fig`
    canvasSetup = '';
    canvasFooter = '';
  }

  const pyTitle = item.title
    .replace(/R\u0302/g, 'R-hat')
    .replace(/([A-Za-z\u0370-\u03FF])\u0302/g, '$1_hat');

  return [
    `# ============================================================================`,
    `# ${item.title}`,
    `# 适用方法: ${item.methodFit}`,
    `# 统计警戒: ${item.pitfallWarning}`,
    `# ============================================================================`,
    `import numpy as np`,
    `import matplotlib.pyplot as plt`,
    `import matplotlib.colors as mcolors`,
    `import matplotlib.patches as mpatches`,
    extraImports.trimEnd(),
    ``,
    `plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']`,
    `plt.rcParams['axes.unicode_minus'] = False`,
    ``,
    `PRIMARY = ${pyStr(primary)}`,
    `SECONDARY = ${pyStr(secondary)}`,
    `OPPOSITE = ${pyStr(opposite)}`,
    `TITLE = ${pyStr(pyTitle)}`,
    ``,
    `rng = np.random.default_rng(42)`,
    canvasSetup.trimEnd(),
    spec.body.trim(),
    canvasFooter.trim(),
    `plt.savefig(${pyStr(`${fileSlug}.png`)}, dpi=300, bbox_inches='tight')`,
    `plt.show()`,
  ]
    .filter((line, idx, arr) => !(line === '' && (arr[idx - 1] === '' || idx === 0)))
    .join('\n');
}

// ============================================================================
// 2. Booktabs XeLaTeX Table Generator
// ============================================================================

export function buildTableLatexCode(tpl: ResourceTableTemplate): string {
  const colCount = Math.max(1, tpl.headers.length);
  const colMaxLens = Array.from({ length: colCount }, (_, colIdx) => {
    const headerLen = String(tpl.headers[colIdx] ?? '').length;
    const cellMax = tpl.rows.reduce((max, row) => Math.max(max, String(row[colIdx] ?? '').length), 0);
    return Math.max(headerLen, cellMax);
  });
  const totalLen = colMaxLens.reduce((a, b) => a + b, 0);
  const useTabularX = totalLen > 42 || colMaxLens.some(len => len >= 15);

  const colSpec = useTabularX
    ? colMaxLens
      .map((len, idx) => {
        if (len >= 13) return idx === 0 ? 'L' : 'Y';
        return idx === 0 ? 'l' : 'c';
      })
      .join('')
    : `l${'c'.repeat(Math.max(0, colCount - 1))}`;

  const envName = useTabularX ? 'tabularx' : 'tabular';
  const beginTabular = useTabularX
    ? `    \\begin{tabularx}{\\linewidth}{${colSpec}}`
    : `    \\begin{tabular}{${colSpec}}`;

  const headerLine = `      ${tpl.headers.map(h => escapeLatex(h)).join(' & ')} \\\\`;
  const rowLines = tpl.rows.map(row => {
    const padded = Array.from({ length: colCount }, (_, idx) => escapeLatex(String(row[idx] ?? '—')));
    return `      ${padded.join(' & ')} \\\\`;
  });

  const labelId = `tab:${sanitizeIdentifier(tpl.id, 'table')}`;
  const cleanFootnote = tpl.footnote.trim();

  const lines = [
    `% !TEX program = xelatex`,
    `% 章节定位：${tpl.chapterHint}`,
    `\\documentclass[UTF8,a4paper,zihao=-4]{ctexart}`,
    `\\usepackage[top=25.4mm,bottom=25.4mm,left=25.4mm,right=25.4mm]{geometry}`,
    `\\usepackage{amsmath,amssymb}`,
    `\\usepackage{booktabs}`,
    `\\usepackage{threeparttable}`,
    `\\usepackage{array}`,
    ...(useTabularX
      ? [
          `\\usepackage{tabularx}`,
          `\\newcolumntype{L}{>{\\raggedright\\arraybackslash}X}`,
          `\\newcolumntype{Y}{>{\\centering\\arraybackslash}X}`,
        ]
      : []),
    `\\usepackage{caption}`,
    ``,
    `\\captionsetup{font={small,bf},labelsep=quad,justification=centering}`,
    `\\setlength{\\heavyrulewidth}{1.5bp}`,
    `\\setlength{\\lightrulewidth}{0.75bp}`,
    `\\renewcommand{\\arraystretch}{1.25}`,
    `\\setlength{\\tabcolsep}{4pt}`,
    ``,
    `\\begin{document}`,
    ``,
    `\\begin{table}[htbp]`,
    `  \\centering`,
    `  \\begin{threeparttable}`,
    `    \\caption{${escapeLatex(tpl.title)}}`,
    `    \\label{${labelId}}`,
    `    \\small`,
    beginTabular,
    `      \\toprule`,
    headerLine,
    `      \\midrule`,
    ...rowLines,
    `      \\bottomrule`,
    `    \\end{${envName}}`,
    ...(cleanFootnote
      ? [
          `    \\begin{tablenotes}[flushleft]`,
          `      \\footnotesize`,
          `      \\item[] ${escapeLatex(cleanFootnote)}`,
          `    \\end{tablenotes}`,
        ]
      : []),
    `  \\end{threeparttable}`,
    `\\end{table}`,
    ``,
    `\\end{document}`,
  ];

  return lines.join('\n');
}

// ============================================================================
// 3. Layered TikZ & Mermaid Diagram Generators
// ============================================================================

interface DiagramPlacement {
  layer: number;
  lane: number;
  xCm: number;
  yCm: number;
}

const MERMAID_RESERVED = new Set([
  'end',
  'subgraph',
  'graph',
  'flowchart',
  'class',
  'classdef',
  'style',
  'click',
  'default',
]);

function buildSafeIds(nodes: ResourceDiagramItem['nodes']): Map<string, string> {
  const used = new Set<string>();
  const map = new Map<string, string>();
  nodes.forEach((n, idx) => {
    let base = n.id.replace(/[^A-Za-z0-9_]/g, '_');
    if (!/^[A-Za-z]/.test(base)) base = `n_${base || idx}`;
    if (MERMAID_RESERVED.has(base.toLowerCase())) base = `node_${base}`;
    let candidate = base;
    let suffix = 1;
    while (used.has(candidate)) {
      candidate = `${base}_${suffix++}`;
    }
    used.add(candidate);
    map.set(n.id, candidate);
  });
  return map;
}

function computeLayeredPositions(item: ResourceDiagramItem): {
  positions: Map<string, DiagramPlacement>;
  backEdgeIds: Set<string>;
} {
  const nodeIds = item.nodes.map(n => n.id);
  const nodeSet = new Set(nodeIds);
  const adj = new Map<string, string[]>(nodeIds.map(id => [id, []]));
  const backEdgeIds = new Set<string>();

  const canReach = (start: string, target: string): boolean => {
    const visited = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === target) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const nxt of adj.get(cur) ?? []) stack.push(nxt);
    }
    return false;
  };

  // Add solid edges first, then forward dashed edges, rejecting cycle-closing edges as feedback arcs
  const orderedEdges = [
    ...item.edges.filter(e => !e.dashed),
    ...item.edges.filter(e => e.dashed),
  ];
  for (const e of orderedEdges) {
    if (!nodeSet.has(e.source) || !nodeSet.has(e.target) || e.source === e.target) {
      backEdgeIds.add(e.id);
      continue;
    }
    if (canReach(e.target, e.source)) {
      backEdgeIds.add(e.id);
      continue;
    }
    adj.get(e.source)!.push(e.target);
  }

  // Kahn topological longest-path layering
  const indeg = new Map<string, number>(nodeIds.map(id => [id, 0]));
  for (const [src, dsts] of adj.entries()) {
    for (const dst of dsts) {
      if (src !== dst) indeg.set(dst, (indeg.get(dst) ?? 0) + 1);
    }
  }
  const layer = new Map<string, number>(nodeIds.map(id => [id, 0]));
  const queue = nodeIds.filter(id => (indeg.get(id) ?? 0) === 0);
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    const uLayer = layer.get(u) ?? 0;
    for (const v of adj.get(u) ?? []) {
      layer.set(v, Math.max(layer.get(v) ?? 0, uLayer + 1));
      indeg.set(v, (indeg.get(v) ?? 1) - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
  }

  const byLayer = new Map<number, string[]>();
  for (const id of nodeIds) {
    const l = layer.get(id) ?? 0;
    const list = byLayer.get(l) ?? [];
    list.push(id);
    byLayer.set(l, list);
  }

  const isLR = item.direction === 'LR';
  const stepMain = isLR ? 4.4 : 2.9;
  const stepCross = isLR ? 2.7 : 4.6;
  const positions = new Map<string, DiagramPlacement>();

  for (const [l, ids] of byLayer.entries()) {
    const count = ids.length;
    ids.forEach((id, lane) => {
      const centered = lane - (count - 1) / 2;
      const xCm = isLR ? Number((l * stepMain).toFixed(2)) : Number((centered * stepCross).toFixed(2));
      const yCm = isLR ? Number((-centered * stepCross).toFixed(2)) : Number((-l * stepMain).toFixed(2));
      positions.set(id, { layer: l, lane, xCm, yCm });
    });
  }

  return { positions, backEdgeIds };
}

function buildTikzCode(item: ResourceDiagramItem, safeIds: Map<string, string>): string {
  const { positions, backEdgeIds } = computeLayeredPositions(item);
  const isLR = item.direction === 'LR';

  const nodeLines = item.nodes.map(n => {
    const pos = positions.get(n.id) ?? { layer: 0, lane: 0, xCm: 0, yCm: 0 };
    const roleStyle = n.role ?? 'process';
    const tid = safeIds.get(n.id) ?? 'n';
    const parts: string[] = [];
    if (n.stage) parts.push(`{\\scriptsize\\bfseries ${escapeLatex(n.stage)}}`);
    parts.push(`{\\footnotesize\\bfseries ${escapeLatex(n.label)}}`);
    if (n.sublabel) parts.push(`{\\scriptsize\\color{slate600} ${escapeLatex(n.sublabel)}}`);
    return `  \\node[${roleStyle}] (${tid}) at (${pos.xCm},${pos.yCm}) {${parts.join(' \\\\ ')}};`;
  });

  const edgeLines = item.edges.map(e => {
    const src = safeIds.get(e.source);
    const dst = safeIds.get(e.target);
    if (!src || !dst) return '';
    const pSrc = positions.get(e.source);
    const pDst = positions.get(e.target);
    const isBack = backEdgeIds.has(e.id);
    const isCollinearSkip =
      !isBack &&
      pSrc &&
      pDst &&
      Math.abs(pDst.layer - pSrc.layer) > 1 &&
      (isLR ? Math.abs(pSrc.yCm - pDst.yCm) < 0.05 : Math.abs(pSrc.xCm - pDst.xCm) < 0.05);

    const styleParts: string[] = [e.dashed || isBack ? 'feedback' : 'flow'];
    if (isBack) {
      styleParts.push(isLR ? 'bend left=36' : 'bend right=42');
    } else if (isCollinearSkip) {
      styleParts.push(isLR ? 'bend right=26' : 'bend left=30');
    }

    const labelNode = e.label
      ? ` node[midway, fill=white, inner sep=1.5pt, font=\\scriptsize, text=slate700] {${escapeLatex(e.label)}}`
      : '';
    return `  \\draw[${styleParts.join(', ')}] (${src}) to${labelNode} (${dst});`;
  }).filter(Boolean);

  return [
    `% !TEX program = xelatex`,
    `% ${item.title} (${item.direction} · ${item.layoutHint})`,
    `\\documentclass[UTF8,a4paper]{ctexart}`,
    `\\usepackage[margin=12mm${isLR ? ',landscape' : ''}]{geometry}`,
    `\\usepackage{amsmath,amssymb}`,
    `\\usepackage{tikz}`,
    `\\usetikzlibrary{arrows.meta,positioning,shapes.geometric}`,
    `\\pagestyle{empty}`,
    ``,
    `\\definecolor{teal700}{HTML}{0F766E}`,
    `\\definecolor{blue800}{HTML}{234E80}`,
    `\\definecolor{amber700}{HTML}{B45309}`,
    `\\definecolor{slate600}{HTML}{475569}`,
    `\\definecolor{slate700}{HTML}{334155}`,
    ``,
    `\\begin{document}`,
    `\\begin{center}`,
    `{\\small\\bfseries ${escapeLatex(item.title)}\\par}`,
    `\\vspace{4mm}`,
    `\\resizebox{\\linewidth}{!}{%`,
    `\\begin{tikzpicture}[`,
    `  >=Stealth,`,
    `  base/.style={draw, rounded corners=3pt, align=center, text width=3.35cm, inner sep=5pt, line width=0.9pt},`,
    `  stage/.style={base, draw=teal700, fill=teal700!10},`,
    `  process/.style={base, draw=blue800, fill=blue800!8},`,
    `  method/.style={base, draw=teal700, fill=teal700!6},`,
    `  decision/.style={base, draw=amber700, fill=amber700!10},`,
    `  output/.style={base, draw=teal700, fill=teal700!14},`,
    `  flow/.style={->, draw=blue800, line width=0.95pt},`,
    `  feedback/.style={->, dashed, draw=amber700, line width=0.95pt}`,
    `]`,
    ...nodeLines,
    ...edgeLines,
    `\\end{tikzpicture}%`,
    `}`,
    `\\end{center}`,
    `\\end{document}`,
  ].join('\n');
}

function buildMermaidCode(item: ResourceDiagramItem, safeIds: Map<string, string>): string {
  const dir = item.direction === 'LR' ? 'LR' : 'TD';
  const nodeLines = item.nodes.map(n => {
    const mid = safeIds.get(n.id) ?? 'n';
    const textParts: string[] = [];
    const mainTitle = n.stage
      ? `${escapeMermaidText(n.stage)}：${escapeMermaidText(n.label)}`
      : escapeMermaidText(n.label);
    textParts.push(mainTitle);
    if (n.sublabel) textParts.push(escapeMermaidText(n.sublabel));
    const joined = `"${textParts.join('<br/>')}"`;

    switch (n.role) {
      case 'stage':
      case 'output':
        return `  ${mid}([${joined}]):::${n.role}`;
      case 'decision':
        return `  ${mid}[[${joined}]]:::decision`;
      case 'method':
        return `  ${mid}[${joined}]:::method`;
      default:
        return `  ${mid}[${joined}]:::process`;
    }
  });

  const edgeLines = item.edges.map(e => {
    const src = safeIds.get(e.source);
    const dst = safeIds.get(e.target);
    if (!src || !dst) return '';
    const arrow = e.dashed ? '-.->' : '-->';
    const label = e.label ? `|"${escapeMermaidText(e.label)}"|` : '';
    return `  ${src} ${arrow}${label} ${dst}`;
  }).filter(Boolean);

  return [
    `%% ${item.title}`,
    `flowchart ${dir}`,
    ...nodeLines,
    ...edgeLines,
    `  classDef stage fill:#0F766E1A,stroke:#0F766E,stroke-width:1.6px,color:#0F172A;`,
    `  classDef process fill:#234E8014,stroke:#234E80,stroke-width:1.4px,color:#0F172A;`,
    `  classDef method fill:#0F766E10,stroke:#0F766E,stroke-width:1.4px,color:#0F172A;`,
    `  classDef decision fill:#B453091A,stroke:#B45309,stroke-width:1.6px,color:#0F172A;`,
    `  classDef output fill:#0F766E24,stroke:#0F766E,stroke-width:1.8px,color:#0F172A;`,
  ].join('\n');
}

export function buildDiagramCode(item: ResourceDiagramItem): { tikz: string; mermaid: string; drawio: string } {
  const safeIds = buildSafeIds(item.nodes);
  return {
    tikz: buildTikzCode(item, safeIds),
    mermaid: buildMermaidCode(item, safeIds),
    drawio: toDrawioXml(toDiagramGraphSpec(item), item.title),
  };
}

export function buildVectorAssetLatexCode(params: {
  assetId: string;
  title: string;
  caption: string;
  widthCm?: number;
}): string {
  const fileStem = sanitizeIdentifier(params.assetId, 'evix-figure');
  const labelId = sanitizeIdentifier(`fig:${params.assetId}`, 'fig:evix-asset');
  const width = (params.widthCm ?? 14.5).toFixed(1);
  return [
    `% !TEX program = xelatex`,
    `% ${params.title} — 需在导言区加载 svg 宏包，并开启 --shell-escape 编译参数`,
    `\\documentclass[UTF8,a4paper,12pt]{ctexart}`,
    `\\usepackage{svg}`,
    `\\usepackage{graphicx}`,
    `\\usepackage{caption}`,
    ``,
    `\\begin{document}`,
    `\\begin{figure}[htbp]`,
    `  \\centering`,
    `  \\includesvg[width=${width}cm]{${fileStem}.svg}`,
    `  % 若未开启 --shell-escape，可用 Inkscape 预先导出同名 PDF 后改为：`,
    `  % \\includegraphics[width=${width}cm]{${fileStem}.pdf}`,
    `  \\caption{${escapeLatex(params.title)}：${escapeLatex(params.caption)}}`,
    `  \\label{${labelId}}`,
    `\\end{figure}`,
    `\\end{document}`,
  ].join('\n');
}
