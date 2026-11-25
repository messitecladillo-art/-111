/**
 * Publication-grade academic & engineering example-diagram ("例图") SVG renderer (`360 × 228`).
 *
 * Every output is 100% self-contained pure vector markup (`assertTrueVector`-safe: zero `<style>`, `<filter>`,
 * `url(...)`, gradients, clipPaths, images, or external references), pairing concise Chinese labels with
 * semantic micro-glyphs, inset mini-analytics, dual-hue connector routing, and explicit polygon arrowheads.
 */
import type { DiagramEdgeSpec, DiagramNodeSpec } from '../diagram-figures.ts';
import type { FigureInk } from '../figure-palette.ts';

export type DiagramExampleArchetype =
  | 'roadmap_dual'
  | 'sem_path'
  | 'mediation_moderation'
  | 'prisma_funnel'
  | 'system_pipeline_inset'
  | 'partition_matrix'
  | 'evolutionary_game'
  | 'tree_branch'
  | 'swimlane_loop';

export type DiagramLayoutHint =
  | 'layered'
  | 'funnel'
  | 'triad'
  | 'matrix_flow'
  | 'swimlane'
  | 'tree'
  | 'system_inset'
  | 'game_loop';

export interface DiagramExampleSpec {
  id: string;
  title: string;
  intent: string;
  direction: 'TB' | 'LR';
  layoutHint: DiagramLayoutHint;
  exampleArchetype?: DiagramExampleArchetype;
  exampleBadge?: string;
  nodes: readonly DiagramNodeSpec[];
  edges: readonly DiagramEdgeSpec[];
}

type Palette = {
  primary: string;
  secondary: string;
  opposite: string;
  inkDark: string;
  inkMuted: string;
  paperBg: string;
  borderMuted: string;
};

type MicroGlyphKind =
  | 'docs'
  | 'database'
  | 'matrix'
  | 'chart_bar'
  | 'chart_trend'
  | 'gate'
  | 'neural'
  | 'shield'
  | 'cycle'
  | 'users';

const FONT_SANS = "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif";

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const clean = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#0F766E';
    return [1, 3, 5].map(i => parseInt(clean.slice(i, i + 2), 16));
  };
  const ca = parse(a);
  const cb = parse(b);
  return `#${ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function resolvePalette(ink: FigureInk): Palette {
  const rawPrimary = typeof ink === 'string' ? ink : ink.primary;
  const primary = /^#[0-9A-Fa-f]{6}$/.test(rawPrimary) ? rawPrimary.toUpperCase() : '#0F766E';
  const fallbackSecondary = primary === '#234E80' ? '#0F766E' : '#234E80';
  const rawSecondary = typeof ink === 'string' ? fallbackSecondary : ink.secondary;
  const secondary = /^#[0-9A-Fa-f]{6}$/.test(rawSecondary) && rawSecondary.toUpperCase() !== primary
    ? rawSecondary.toUpperCase()
    : fallbackSecondary;
  const rawOpposite = typeof ink === 'string' ? '#B45309' : ink.opposite;
  const opposite = /^#[0-9A-Fa-f]{6}$/.test(rawOpposite) ? rawOpposite.toUpperCase() : '#B45309';

  return {
    primary,
    secondary,
    opposite,
    inkDark: '#0F172A',
    inkMuted: '#475569',
    paperBg: '#FAF8F4',
    borderMuted: '#CBD5E1',
  };
}

function charUnits(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code > 127) return 1;
  if (/[A-Z0-9MW@#%&]/.test(ch)) return 0.65;
  if (/[ilI.,:;!|()\[\]\s]/.test(ch)) return 0.36;
  return 0.56;
}

function cjkSpan(text: string): number {
  let w = 0;
  for (const ch of text) w += charUnits(ch);
  return w;
}

function wrapCleanLines(raw: string, maxSpanPerLine: number): string[] {
  const clean = raw.trim();
  if (!clean) return [];
  const chars = [...clean];
  const isAsciiToken = (ch: string) => /[A-Za-z0-9_.=<>+\-*%/]/.test(ch);
  const isSoftBreak = (ch: string) => '；，。：、;,.·—/ '.includes(ch);

  const lines: string[] = [];
  let start = 0;
  while (start < chars.length) {
    while (start < chars.length && chars[start] === ' ') start++;
    if (start >= chars.length) break;

    let w = 0;
    let cut = start;
    let lastSoft = -1;
    for (let i = start; i < chars.length; i++) {
      const cw = charUnits(chars[i]);
      if (w + cw > maxSpanPerLine && i > start) break;
      w += cw;
      cut = i + 1;
      if (isSoftBreak(chars[i])) lastSoft = i + 1;
    }

    if (cut < chars.length) {
      // Avoid breaking inside short parentheticals like "(M1)" or "(A1–A30)"
      const openParen = Math.max(chars.lastIndexOf('(', cut - 1), chars.lastIndexOf('（', cut - 1));
      if (openParen >= start + 2 && cut - openParen <= 9) {
        cut = openParen;
      } else if (lastSoft > start + 2 && lastSoft - start >= (cut - start) * 0.58) {
        cut = lastSoft;
      } else if (isAsciiToken(chars[cut - 1]) && isAsciiToken(chars[cut])) {
        let back = cut - 1;
        while (back > start + 1 && isAsciiToken(chars[back - 1])) back--;
        if (back > start + 1) cut = back;
      }
    }

    const piece = chars.slice(start, cut).join('').replace(/^[、，·\s]+/u, '').replace(/[、，·\s]+$/u, '').trim();
    if (piece) lines.push(piece);
    start = Math.max(start + 1, cut);
  }
  return lines;
}

function splitBalancedLines(raw: string, maxLines: number): string[] {
  const clean = raw.trim();
  if (!clean || maxLines <= 1) return clean ? [clean] : [];
  const chars = [...clean];
  if (chars.length <= maxLines) return chars;

  const total = cjkSpan(clean);
  const isAsciiToken = (ch: string) => /[A-Za-z0-9_.=<>+\-*%/]/.test(ch);
  const lines: string[] = [];
  let start = 0;

  for (let li = 0; li < maxLines - 1 && start < chars.length; li++) {
    const remainingTotal = cjkSpan(chars.slice(start).join(''));
    const target = remainingTotal / (maxLines - li);
    let w = 0;
    let cut = start + 1;
    for (let i = start; i < chars.length - (maxLines - li - 1); i++) {
      w += charUnits(chars[i]);
      cut = i + 1;
      if (w >= target) break;
    }
    if (cut < chars.length && isAsciiToken(chars[cut - 1]) && isAsciiToken(chars[cut])) {
      let back = cut - 1;
      while (back > start + 1 && isAsciiToken(chars[back - 1])) back--;
      if (back > start + 1) cut = back;
    }
    const piece = chars.slice(start, cut).join('').trim();
    if (piece) lines.push(piece);
    start = cut;
  }

  const tail = chars.slice(start).join('').trim();
  if (tail) lines.push(tail);
  return lines.length ? lines : [clean.slice(0, Math.ceil(total))];
}

function fitTextBlock(
  raw: string,
  maxPx: number,
  idealSize: number,
  maxLines: number,
  minSize = 4.6,
): { lines: string[]; size: number } {
  const clean = raw.trim();
  if (!clean) return { lines: [], size: idealSize };
  const safeMaxPx = Math.max(12, maxPx);
  const totalSpan = Math.max(0.5, cjkSpan(clean));

  if (totalSpan * idealSize <= safeMaxPx) {
    return { lines: [clean], size: idealSize };
  }

  if (maxLines <= 1) {
    const scaled = Math.min(idealSize, Math.floor(((safeMaxPx - 0.25) / totalSpan) * 100) / 100);
    return { lines: [clean], size: Math.max(3.8, scaled) };
  }

  const step = 0.2;
  for (let s = idealSize; s >= minSize - 0.001; s -= step) {
    const size = Number(Math.max(minSize, s).toFixed(2));
    const lineLimit = (safeMaxPx - 0.25) / size;
    const wrapped = wrapCleanLines(clean, lineLimit);
    if (wrapped.length <= maxLines && wrapped.every(l => cjkSpan(l) * size <= safeMaxPx + 0.15)) {
      return { lines: wrapped, size };
    }
  }

  // Exact-fit balanced fallback (guaranteed zero ellipsis, zero box overflow)
  const balanced = splitBalancedLines(clean, maxLines);
  const widest = Math.max(0.5, ...balanced.map(cjkSpan));
  const exactSize = Math.min(idealSize, Math.floor(((safeMaxPx - 0.25) / widest) * 100) / 100);
  return { lines: balanced, size: Math.max(3.6, exactSize) };
}

function renderFittedText(
  x: number,
  centerY: number,
  raw: string,
  opts: {
    maxPx: number;
    idealSize: number;
    maxLines: number;
    minSize?: number;
    fill: string;
    weight?: number;
    anchor?: 'start' | 'middle' | 'end';
    lineHeightRatio?: number;
  },
): string {
  const fit = fitTextBlock(raw, opts.maxPx, opts.idealSize, opts.maxLines, opts.minSize ?? 4.6);
  if (!fit.lines.length) return '';
  const lineGap = fit.size * (opts.lineHeightRatio ?? 1.24);
  const y0 = centerY - ((fit.lines.length - 1) * lineGap) / 2 + 0.28 * fit.size;
  return fit.lines
    .map((line, idx) =>
      textEl(x, y0 + idx * lineGap, line, {
        size: fit.size,
        fill: opts.fill,
        weight: opts.weight,
        anchor: opts.anchor,
      }),
    )
    .join('');
}

function roleColor(role: string | undefined, pal: Palette): string {
  switch (role) {
    case 'output':
      return pal.primary;
    case 'method':
      return pal.secondary;
    case 'decision':
      return pal.opposite;
    case 'process':
      return mixHex(pal.primary, pal.secondary, 0.45);
    case 'stage':
    default:
      return mixHex(pal.primary, '#1E293B', 0.25);
  }
}

function textEl(
  x: number,
  y: number,
  content: string,
  opts: { size: number; fill: string; weight?: number; anchor?: 'start' | 'middle' | 'end' },
): string {
  const anchorAttr = opts.anchor && opts.anchor !== 'start' ? ` text-anchor="${opts.anchor}"` : '';
  const weightAttr = opts.weight ? ` font-weight="${opts.weight}"` : '';
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}"${anchorAttr} fill="${opts.fill}" font-family="${FONT_SANS}" font-size="${opts.size}"${weightAttr}>${esc(content)}</text>`;
}

function arrowHead(x: number, y: number, dir: 'up' | 'down' | 'left' | 'right', fill: string, size = 4.4): string {
  const s = size;
  const w = size * 0.7;
  switch (dir) {
    case 'down':
      return `<polygon points="${x.toFixed(1)},${y.toFixed(1)} ${(x - w).toFixed(1)},${(y - s).toFixed(1)} ${(x + w).toFixed(1)},${(y - s).toFixed(1)}" fill="${fill}"/>`;
    case 'up':
      return `<polygon points="${x.toFixed(1)},${y.toFixed(1)} ${(x - w).toFixed(1)},${(y + s).toFixed(1)} ${(x + w).toFixed(1)},${(y + s).toFixed(1)}" fill="${fill}"/>`;
    case 'left':
      return `<polygon points="${x.toFixed(1)},${y.toFixed(1)} ${(x + s).toFixed(1)},${(y - w).toFixed(1)} ${(x + s).toFixed(1)},${(y + w).toFixed(1)}" fill="${fill}"/>`;
    case 'right':
    default:
      return `<polygon points="${x.toFixed(1)},${y.toFixed(1)} ${(x - s).toFixed(1)},${(y - w).toFixed(1)} ${(x - s).toFixed(1)},${(y + w).toFixed(1)}" fill="${fill}"/>`;
  }
}

function pillTag(cx: number, cy: number, label: string, color: string, maxPx = 56, idealSize = 6.4): string {
  const fit = fitTextBlock(label, maxPx, idealSize, 1, 4.7);
  if (!fit.lines.length) return '';
  const text = fit.lines[0];
  const pw = Math.max(20, Math.ceil(cjkSpan(text) * fit.size + 7));
  const ph = Math.ceil(fit.size + 4.0);
  const safeCx = Math.max(10 + pw / 2, Math.min(350 - pw / 2, cx));
  const x = safeCx - pw / 2;
  const y = cy - ph / 2;
  return `<g>`
    + `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${pw}" height="${ph}" rx="${(ph / 2).toFixed(1)}" fill="#FFFFFF" fill-opacity="0.97" stroke="${color}" stroke-opacity="0.58" stroke-width="0.85"/>`
    + textEl(safeCx, cy + fit.size * 0.34, text, { size: fit.size, fill: color, weight: 600, anchor: 'middle' })
    + `</g>`;
}

function tintedCard(
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  opts: { rx?: number; opacity?: number; strokeWidth?: number; dashed?: boolean; leftBar?: boolean } = {},
): string {
  const rx = opts.rx ?? 6;
  const opacity = opts.opacity ?? 0.12;
  const sw = opts.strokeWidth ?? 1.25;
  const dash = opts.dashed ? ` stroke-dasharray="3.5 2.5"` : '';
  const bar = opts.leftBar
    ? `<rect x="${(x + 0.6).toFixed(1)}" y="${(y + 4).toFixed(1)}" width="3" height="${Math.max(4, h - 8).toFixed(1)}" rx="1.5" fill="${color}" fill-opacity="0.9"/>`
    : '';
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}" fill="#FFFFFF"/>`
    + `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="${sw}"${dash}/>`
    + bar;
}

function inferGlyphKind(node: DiagramNodeSpec, archetype: DiagramExampleArchetype): MicroGlyphKind {
  const text = `${node.stage ?? ''} ${node.label} ${node.sublabel ?? ''}`;
  if (/语义|多跳|词元|MoE|神经|BERTopic|RAG|Transformer|融合|识别|嵌入/u.test(text)) return 'neural';
  if (/质控|检验|核验|验算|审计|校验|隐私|合规|脱敏|信度|效度|并行趋势|稳健|护栏/u.test(text)) return 'shield';
  if (/闭环|迭代|PDCA|演化|博弈|反馈|对齐|均衡|循环/u.test(text)) return 'cycle';
  if (/筛选|分支|跳题|决策|门|阈值|路由|判定|开关|断点/u.test(text)) return 'gate';
  if (/库|数据|样本|存储|向量|台账|清洗|入库/u.test(text)) return 'database';
  if (/趋势|RDD|DID|曲线|WTP|价格|收敛|轨迹|时间轴/u.test(text)) return 'chart_trend';
  if (/回归|OLS|Logit|ANOVA|统计|权重|得分|分布|排序|SHAP|TOPSIS|AHP|计算/u.test(text)) return 'chart_bar';
  if (/矩阵|编码|象限|网格|特征|向量|表格|组态|IPA|Kano|蓝图/u.test(text)) return 'matrix';
  if (/群体|分层|聚类|政府|企业|农户|居民|用户|多方|主体|团队/u.test(text)) return 'users';
  if (/文献|语料|文本|访谈|问卷|记录|题项|检索/u.test(text)) return 'docs';

  if (archetype === 'system_pipeline_inset') return node.role === 'output' ? 'shield' : 'neural';
  if (archetype === 'evolutionary_game') return 'cycle';
  if (node.role === 'decision') return 'gate';
  if (node.role === 'output') return 'shield';
  if (node.role === 'method') return 'chart_bar';
  if (node.role === 'process') return 'matrix';
  return 'docs';
}

/** Draw a crisp 14×14 pure-vector semantic micro-glyph anchored at `(x, y)`. */
function renderMicroGlyph(kind: MicroGlyphKind, x: number, y: number, color: string, accent2: string): string {
  switch (kind) {
    case 'docs':
      return `<g>`
        + `<rect x="${(x + 3.5).toFixed(1)}" y="${(y + 0.5).toFixed(1)}" width="8.5" height="10.5" rx="1.4" fill="#FFFFFF" stroke="${color}" stroke-opacity="0.55" stroke-width="0.95"/>`
        + `<rect x="${(x + 1.5).toFixed(1)}" y="${(y + 2.5).toFixed(1)}" width="8.5" height="10.5" rx="1.4" fill="#FFFFFF" stroke="${color}" stroke-width="1.15"/>`
        + `<line x1="${(x + 3.4).toFixed(1)}" y1="${(y + 5.8).toFixed(1)}" x2="${(x + 8.1).toFixed(1)}" y2="${(y + 5.8).toFixed(1)}" stroke="${color}" stroke-width="1"/>`
        + `<line x1="${(x + 3.4).toFixed(1)}" y1="${(y + 8.2).toFixed(1)}" x2="${(x + 7.2).toFixed(1)}" y2="${(y + 8.2).toFixed(1)}" stroke="${accent2}" stroke-width="1"/>`
        + `</g>`;
    case 'database':
      return `<g>`
        + `<path d="M ${(x + 2).toFixed(1)} ${(y + 3.5).toFixed(1)} V ${(y + 10.8).toFixed(1)} C ${(x + 2).toFixed(1)} ${(y + 12.6).toFixed(1)} ${(x + 12).toFixed(1)} ${(y + 12.6).toFixed(1)} ${(x + 12).toFixed(1)} ${(y + 10.8).toFixed(1)} V ${(y + 3.5).toFixed(1)}" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="1.1"/>`
        + `<ellipse cx="${(x + 7).toFixed(1)}" cy="${(y + 3.5).toFixed(1)}" rx="5" ry="2.1" fill="#FFFFFF" stroke="${color}" stroke-width="1.1"/>`
        + `<path d="M ${(x + 2).toFixed(1)} ${(y + 7.2).toFixed(1)} C ${(x + 2).toFixed(1)} ${(y + 8.9).toFixed(1)} ${(x + 12).toFixed(1)} ${(y + 8.9).toFixed(1)} ${(x + 12).toFixed(1)} ${(y + 7.2).toFixed(1)}" stroke="${color}" stroke-opacity="0.7" stroke-width="0.95"/>`
        + `</g>`;
    case 'matrix':
      return `<g>`
        + [0, 1, 2].flatMap(r => [0, 1, 2].map(c => {
            const op = ((r + c) % 3 === 0 ? 0.85 : (r + c) % 2 === 0 ? 0.45 : 0.2);
            const col = r === 1 && c === 1 ? accent2 : color;
            return `<rect x="${(x + 1.2 + c * 4).toFixed(1)}" y="${(y + 1.2 + r * 4).toFixed(1)}" width="3.2" height="3.2" rx="0.7" fill="${col}" fill-opacity="${op}"/>`;
          })).join('')
        + `</g>`;
    case 'chart_bar':
      return `<g>`
        + `<line x1="${(x + 1).toFixed(1)}" y1="${(y + 12.2).toFixed(1)}" x2="${(x + 13).toFixed(1)}" y2="${(y + 12.2).toFixed(1)}" stroke="${color}" stroke-width="1"/>`
        + `<rect x="${(x + 2.2).toFixed(1)}" y="${(y + 6.8).toFixed(1)}" width="2.4" height="5.4" rx="0.6" fill="${color}" fill-opacity="0.65"/>`
        + `<rect x="${(x + 5.8).toFixed(1)}" y="${(y + 2.4).toFixed(1)}" width="2.4" height="9.8" rx="0.6" fill="${color}"/>`
        + `<rect x="${(x + 9.4).toFixed(1)}" y="${(y + 4.8).toFixed(1)}" width="2.4" height="7.4" rx="0.6" fill="${accent2}"/>`
        + `</g>`;
    case 'chart_trend':
      return `<g>`
        + `<polyline points="${(x + 1.5).toFixed(1)},${(y + 11.2).toFixed(1)} ${(x + 5.5).toFixed(1)},${(y + 6.6).toFixed(1)} ${(x + 8.8).toFixed(1)},${(y + 8.4).toFixed(1)} ${(x + 12.5).toFixed(1)},${(y + 2.8).toFixed(1)}" stroke="${color}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>`
        + `<line x1="${(x + 7.2).toFixed(1)}" y1="${(y + 2).toFixed(1)}" x2="${(x + 7.2).toFixed(1)}" y2="${(y + 12.5).toFixed(1)}" stroke="${accent2}" stroke-dasharray="2 1.5" stroke-width="0.9"/>`
        + `<circle cx="${(x + 12.5).toFixed(1)}" cy="${(y + 2.8).toFixed(1)}" r="1.7" fill="${accent2}"/>`
        + `</g>`;
    case 'gate':
      return `<g>`
        + `<polygon points="${(x + 7).toFixed(1)},${(y + 1.2).toFixed(1)} ${(x + 12.8).toFixed(1)},${(y + 7).toFixed(1)} ${(x + 7).toFixed(1)},${(y + 12.8).toFixed(1)} ${(x + 1.2).toFixed(1)},${(y + 7).toFixed(1)}" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="1.2"/>`
        + `<circle cx="${(x + 7).toFixed(1)}" cy="${(y + 7).toFixed(1)}" r="1.8" fill="${color}"/>`
        + `</g>`;
    case 'neural':
      return `<g>`
        + `<line x1="${(x + 3).toFixed(1)}" y1="${(y + 4).toFixed(1)}" x2="${(x + 7).toFixed(1)}" y2="${(y + 7).toFixed(1)}" stroke="${color}" stroke-opacity="0.6" stroke-width="0.85"/>`
        + `<line x1="${(x + 3).toFixed(1)}" y1="${(y + 10).toFixed(1)}" x2="${(x + 7).toFixed(1)}" y2="${(y + 7).toFixed(1)}" stroke="${color}" stroke-opacity="0.6" stroke-width="0.85"/>`
        + `<line x1="${(x + 7).toFixed(1)}" y1="${(y + 7).toFixed(1)}" x2="${(x + 11.2).toFixed(1)}" y2="${(y + 4).toFixed(1)}" stroke="${accent2}" stroke-opacity="0.8" stroke-width="0.9"/>`
        + `<line x1="${(x + 7).toFixed(1)}" y1="${(y + 7).toFixed(1)}" x2="${(x + 11.2).toFixed(1)}" y2="${(y + 10).toFixed(1)}" stroke="${accent2}" stroke-opacity="0.8" stroke-width="0.9"/>`
        + `<circle cx="${(x + 2.8).toFixed(1)}" cy="${(y + 4).toFixed(1)}" r="1.6" fill="${color}"/>`
        + `<circle cx="${(x + 2.8).toFixed(1)}" cy="${(y + 10).toFixed(1)}" r="1.6" fill="${color}"/>`
        + `<circle cx="${(x + 7).toFixed(1)}" cy="${(y + 7).toFixed(1)}" r="2" fill="${accent2}"/>`
        + `<circle cx="${(x + 11.4).toFixed(1)}" cy="${(y + 4).toFixed(1)}" r="1.6" fill="${color}"/>`
        + `<circle cx="${(x + 11.4).toFixed(1)}" cy="${(y + 10).toFixed(1)}" r="1.6" fill="${color}"/>`
        + `</g>`;
    case 'shield':
      return `<g>`
        + `<path d="M ${(x + 7).toFixed(1)} ${(y + 1.2).toFixed(1)} L ${(x + 12).toFixed(1)} ${(y + 3.2).toFixed(1)} V ${(y + 7.2).toFixed(1)} C ${(x + 12).toFixed(1)} ${(y + 10.2).toFixed(1)} ${(x + 7).toFixed(1)} ${(y + 12.6).toFixed(1)} ${(x + 7).toFixed(1)} ${(y + 12.6).toFixed(1)} C ${(x + 7).toFixed(1)} ${(y + 12.6).toFixed(1)} ${(x + 2).toFixed(1)} ${(y + 10.2).toFixed(1)} ${(x + 2).toFixed(1)} ${(y + 7.2).toFixed(1)} V ${(y + 3.2).toFixed(1)} Z" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="1.15"/>`
        + `<polyline points="${(x + 4.4).toFixed(1)},${(y + 7).toFixed(1)} ${(x + 6.4).toFixed(1)},${(y + 9).toFixed(1)} ${(x + 9.8).toFixed(1)},${(y + 5.2).toFixed(1)}" stroke="${color}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>`
        + `</g>`;
    case 'cycle':
      return `<g>`
        + `<path d="M ${(x + 3.2).toFixed(1)} ${(y + 5.6).toFixed(1)} A 4.4 4.4 0 0 1 ${(x + 10.8).toFixed(1)} ${(y + 5.2).toFixed(1)}" stroke="${color}" stroke-width="1.25" stroke-linecap="round"/>`
        + `<polygon points="${(x + 11.8).toFixed(1)},${(y + 6.4).toFixed(1)} ${(x + 9.4).toFixed(1)},${(y + 5.5).toFixed(1)} ${(x + 11.4).toFixed(1)},${(y + 3.6).toFixed(1)}" fill="${color}"/>`
        + `<path d="M ${(x + 10.8).toFixed(1)} ${(y + 8.6).toFixed(1)} A 4.4 4.4 0 0 1 ${(x + 3.2).toFixed(1)} ${(y + 9).toFixed(1)}" stroke="${accent2}" stroke-width="1.25" stroke-linecap="round"/>`
        + `<polygon points="${(x + 2.2).toFixed(1)},${(y + 7.8).toFixed(1)} ${(x + 4.6).toFixed(1)},${(y + 8.7).toFixed(1)} ${(x + 2.6).toFixed(1)},${(y + 10.6).toFixed(1)}" fill="${accent2}"/>`
        + `</g>`;
    case 'users':
    default:
      return `<g>`
        + `<circle cx="${(x + 5.2).toFixed(1)}" cy="${(y + 4.4).toFixed(1)}" r="2" fill="${color}"/>`
        + `<path d="M ${(x + 1.8).toFixed(1)} ${(y + 11.6).toFixed(1)} C ${(x + 1.8).toFixed(1)} ${(y + 8.8).toFixed(1)} ${(x + 8.6).toFixed(1)} ${(y + 8.8).toFixed(1)} ${(x + 8.6).toFixed(1)} ${(y + 11.6).toFixed(1)}" fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="1"/>`
        + `<circle cx="${(x + 9.8).toFixed(1)}" cy="${(y + 5).toFixed(1)}" r="1.7" fill="${accent2}"/>`
        + `<path d="M ${(x + 7.6).toFixed(1)} ${(y + 11.6).toFixed(1)} C ${(x + 7.6).toFixed(1)} ${(y + 9.4).toFixed(1)} ${(x + 12.5).toFixed(1)} ${(y + 9.4).toFixed(1)} ${(x + 12.5).toFixed(1)} ${(y + 11.6).toFixed(1)}" stroke="${accent2}" stroke-width="1"/>`
        + `</g>`;
  }
}

export function resolveExampleArchetype(item: DiagramExampleSpec): DiagramExampleArchetype {
  if (item.exampleArchetype) return item.exampleArchetype;
  const sig = `${item.id} ${item.title}`;
  switch (item.layoutHint) {
    case 'funnel':
      return 'prisma_funnel';
    case 'system_inset':
      return 'system_pipeline_inset';
    case 'game_loop':
      return 'evolutionary_game';
    case 'tree':
      return 'tree_branch';
    case 'swimlane':
      return 'swimlane_loop';
    case 'matrix_flow':
      return 'partition_matrix';
    case 'triad':
      return /中介|调节|PROCESS/u.test(sig) ? 'mediation_moderation' : 'sem_path';
    case 'layered':
    default:
      return 'roadmap_dual';
  }
}

function defaultBadge(item: DiagramExampleSpec, archetype: DiagramExampleArchetype): string {
  if (item.exampleBadge) return item.exampleBadge;
  const n = item.nodes.length;
  switch (archetype) {
    case 'roadmap_dual':
      return `${n}阶双轨`;
    case 'sem_path':
      return `${Math.max(n, item.edges.length)}路径SEM`;
    case 'mediation_moderation':
      return '有调节中介';
    case 'prisma_funnel':
      return /PRISMA/i.test(item.title) ? 'PRISMA筛选' : '四步质控漏斗';
    case 'system_pipeline_inset':
      return item.intent === 'system_ai' ? '智能系统流程' : '系统嵌入检验';
    case 'partition_matrix':
      return '2×2决策矩阵';
    case 'evolutionary_game':
      return /PDCA/i.test(item.title) ? 'PDCA迭代环' : '三方演化博弈';
    case 'tree_branch':
      return '多分支决策树';
    case 'swimlane_loop':
      return '跨层协同闭环';
  }
}

function renderHeaderBanner(item: DiagramExampleSpec, archetype: DiagramExampleArchetype, pal: Palette): string {
  const badge = defaultBadge(item, archetype);
  const badgeW = Math.max(46, Math.ceil(cjkSpan(badge) * 7.0 + 12));
  const badgeX = 346 - badgeW;
  const availTitlePx = Math.max(90, badgeX - 26);

  return `<g>`
    + `<rect x="8" y="6" width="344" height="25" rx="6" fill="#FFFFFF"/>`
    + `<rect x="8" y="6" width="344" height="25" rx="6" fill="${pal.primary}" fill-opacity="0.07" stroke="${pal.primary}" stroke-opacity="0.22" stroke-width="0.95"/>`
    + `<rect x="13" y="10.5" width="3.2" height="16" rx="1.6" fill="${pal.primary}"/>`
    + renderFittedText(21, 18.5, item.title, {
      maxPx: availTitlePx,
      idealSize: 9.6,
      maxLines: 2,
      minSize: 6.4,
      fill: pal.inkDark,
      weight: 700,
      lineHeightRatio: 1.2,
    })
    + `<rect x="${badgeX}" y="11" width="${badgeW}" height="15" rx="7.5" fill="${pal.primary}" fill-opacity="0.14" stroke="${pal.primary}" stroke-opacity="0.42" stroke-width="0.85"/>`
    + textEl(badgeX + badgeW / 2, 21.1, badge, { size: 7.0, fill: pal.primary, weight: 700, anchor: 'middle' })
    + `</g>`;
}

/** 1. Dual-Rail Layered Roadmap + Right Verification Spine */
function renderRoadmapDual(item: DiagramExampleSpec, pal: Palette): string {
  const nodes = item.nodes.slice(0, 6);
  const count = Math.max(1, nodes.length);
  const topY = 38;
  const totalH = 183;
  const stepY = totalH / count;
  const boxH = Math.min(27, Math.floor(stepY - 7));
  const mainX = 10;
  const mainW = 236;
  const cx = mainX + mainW / 2;

  const isSampling = /抽样|PPS/u.test(item.title);
  const railTitle = isSampling ? '抽样精度校核轨' : '严谨性与反馈校验';
  const railChecks = isSampling
    ? [
        { k: '分层框权重', v: '按常住规模成比例' },
        { k: '群内相关 ρ', v: 'Deff = 1+(m-1)ρ' },
        { k: '非概率偏差', v: 'Raking 后分层加权' },
      ]
    : [
        { k: '样本分母边界', v: '隔离未用群防偏' },
        { k: '稳健推断准则', v: 'HC3 + VIF < 5' },
        { k: '反馈调参闭环', v: '回溯修正题项权重' },
      ];

  const cards = nodes.map((n, i) => {
    const y = topY + i * stepY;
    const c = roleColor(n.role, pal);
    const glyph = inferGlyphKind(n, 'roadmap_dual');
    const stageIdx = `0${i + 1}`;
    const subRaw = n.sublabel ?? n.stage ?? '';
    const showSub = boxH >= 23 && Boolean(subRaw);
    const maxTextPx = mainW - 47;

    return tintedCard(mainX, y, mainW, boxH, c, { rx: 5.5, opacity: n.role === 'output' ? 0.16 : 0.11, leftBar: true })
      + `<rect x="${mainX + 7}" y="${(y + boxH / 2 - 7).toFixed(1)}" width="16" height="14" rx="3.5" fill="${c}" fill-opacity="0.88"/>`
      + textEl(mainX + 15, y + boxH / 2 + 2.6, stageIdx, { size: 7, fill: '#FFFFFF', weight: 700, anchor: 'middle' })
      + renderMicroGlyph(glyph, mainX + 26, y + boxH / 2 - 7, c, pal.opposite)
      + renderFittedText(mainX + 43, showSub ? y + boxH * 0.34 : y + boxH / 2, n.label, {
        maxPx: maxTextPx,
        idealSize: 8.2,
        maxLines: showSub ? 1 : 2,
        minSize: 5.5,
        fill: pal.inkDark,
        weight: 700,
      })
      + (showSub
        ? renderFittedText(mainX + 43, y + boxH * 0.74, subRaw, {
            maxPx: maxTextPx,
            idealSize: 6.6,
            maxLines: 1,
            minSize: 4.8,
            fill: pal.inkMuted,
          })
        : '');
  }).join('');

  const conns = nodes.slice(0, -1).map((n, i) => {
    const y = topY + i * stepY;
    const nextY = topY + (i + 1) * stepY;
    const edge = item.edges.find(e => e.source === n.id && e.target === nodes[i + 1].id);
    const gapMidY = (y + boxH + nextY) / 2;
    return `<line x1="${cx}" y1="${(y + boxH).toFixed(1)}" x2="${cx}" y2="${(nextY - 3).toFixed(1)}" stroke="${pal.primary}" stroke-width="1.3"/>`
      + arrowHead(cx, nextY, 'down', pal.primary, 4)
      + (edge?.label ? pillTag(cx + 38, gapMidY, edge.label, pal.secondary, 58, 5.8) : '');
  }).join('');

  const railX = 258;
  const railW = 92;
  const backFromY = topY + Math.max(1, count - 2) * stepY + boxH / 2;
  const backToY = topY + 1 * stepY + boxH / 2;

  const railMarkup = `<g>`
    + tintedCard(railX, topY, railW, totalH - 6, pal.secondary, { rx: 6, opacity: 0.06, strokeWidth: 1, dashed: true })
    + renderFittedText(railX + railW / 2, topY + 10.5, railTitle, {
      maxPx: railW - 8,
      idealSize: 7.4,
      maxLines: 1,
      minSize: 5.4,
      fill: pal.secondary,
      weight: 700,
      anchor: 'middle',
    })
    + `<line x1="${railX + 8}" y1="${topY + 17}" x2="${railX + railW - 8}" y2="${topY + 17}" stroke="${pal.secondary}" stroke-opacity="0.35" stroke-width="0.8"/>`
    + railChecks.map((rc, idx) => {
      const ry = topY + 24 + idx * 49;
      const col = idx === 2 ? pal.opposite : idx === 1 ? pal.secondary : pal.primary;
      return tintedCard(railX + 6, ry, railW - 12, 41, col, { rx: 4.5, opacity: 0.10, strokeWidth: 0.9 })
        + renderMicroGlyph(idx === 2 ? 'cycle' : 'shield', railX + 9, ry + 5, col, pal.opposite)
        + renderFittedText(railX + 25, ry + 12, rc.k, {
          maxPx: railW - 29,
          idealSize: 7.1,
          maxLines: 1,
          minSize: 5.3,
          fill: pal.inkDark,
          weight: 700,
        })
        + renderFittedText(railX + 9, ry + 29, rc.v, {
          maxPx: railW - 15,
          idealSize: 6.5,
          maxLines: 1,
          minSize: 4.9,
          fill: pal.inkMuted,
        });
    }).join('')
    + `<path d="M ${mainX + mainW} ${backFromY.toFixed(1)} H 252 V ${backToY.toFixed(1)} H ${mainX + mainW + 3}" stroke="${pal.opposite}" stroke-width="1.2" stroke-dasharray="3 2"/>`
    + arrowHead(mainX + mainW, backToY, 'left', pal.opposite, 4)
    + pillTag(252, (backFromY + backToY) / 2, '反馈', pal.opposite, 24, 6.1)
    + `</g>`;

  return cards + conns + railMarkup;
}

/** 2. Structural Equation / Multi-Construct Path Model */
function renderSemPath(item: DiagramExampleSpec, pal: Palette): string {
  const nodes = item.nodes.slice(0, 7);
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const n of nodes) {
    inDeg.set(n.id, 0);
    outDeg.set(n.id, 0);
  }
  for (const e of item.edges) {
    if (!e.dashed) {
      outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
      inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
    }
  }

  let leftNodes = nodes.filter(n => (inDeg.get(n.id) ?? 0) === 0);
  let rightNodes = nodes.filter(n => (outDeg.get(n.id) ?? 0) === 0 && !leftNodes.includes(n));
  let midNodes = nodes.filter(n => !leftNodes.includes(n) && !rightNodes.includes(n));

  if (!leftNodes.length || !rightNodes.length) {
    leftNodes = nodes.slice(0, Math.min(2, Math.max(1, Math.floor(nodes.length / 2))));
    rightNodes = [nodes[nodes.length - 1]];
    midNodes = nodes.slice(leftNodes.length, nodes.length - 1);
  }

  type Box = { id: string; x: number; y: number; w: number; h: number; node: DiagramNodeSpec };
  const boxes = new Map<string, Box>();

  const placeColumn = (colNodes: DiagramNodeSpec[], x: number, w: number) => {
    const n = colNodes.length;
    if (!n) return;
    const areaTop = 38;
    const areaH = 158;
    const gap = 7;
    const h = Math.min(54, Math.floor((areaH - gap * (n - 1)) / n));
    const total = n * h + (n - 1) * gap;
    const startY = areaTop + (areaH - total) / 2;
    colNodes.forEach((node, idx) => {
      boxes.set(node.id, { id: node.id, x, y: startY + idx * (h + gap), w, h, node });
    });
  };

  if (midNodes.length) {
    placeColumn(leftNodes, 10, 90);
    placeColumn(midNodes, 135, 90);
    placeColumn(rightNodes, 260, 90);
  } else {
    placeColumn(leftNodes, 12, 124);
    placeColumn(rightNodes, 224, 124);
  }

  const edgePaths: string[] = [];
  const edgePills: string[] = [];
  const placedPills: Array<{ x: number; y: number }> = [];
  const placeNonCollidingPill = (cx: number, cy: number, label: string, col: string, maxPx: number, size: number) => {
    let px = cx;
    let py = cy;
    for (let attempt = 0; attempt < 6; attempt++) {
      const collides = placedPills.some(p => Math.abs(p.x - px) < 42 && Math.abs(p.y - py) < 12);
      if (!collides) break;
      py = attempt % 2 === 0 ? cy + 12 * Math.ceil((attempt + 1) / 2) : cy - 12 * Math.ceil((attempt + 1) / 2);
      if (py > 194 || py < 42) {
        py = cy;
        px = cx + (attempt % 2 === 0 ? -24 : 24);
      }
    }
    placedPills.push({ x: px, y: py });
    edgePills.push(pillTag(px, py, label, col, maxPx, size));
  };
  let skipCount = 0;

  item.edges.forEach((e, idx) => {
    const a = boxes.get(e.source);
    const b = boxes.get(e.target);
    if (!a || !b) return;
    const isNeg = Boolean(e.dashed) || /\(-\)|负|抑制|风险/u.test(e.label ?? '');
    const col = isNeg ? pal.opposite : idx % 2 === 0 ? pal.primary : pal.secondary;
    const dash = e.dashed ? ` stroke-dasharray="3.5 2.5"` : '';

    if (Math.abs(a.x - b.x) < 10) {
      const goingDown = b.y >= a.y;
      const vx = a.x + a.w / 2;
      const sy = goingDown ? a.y + a.h : a.y;
      const ty = goingDown ? b.y : b.y + b.h;
      edgePaths.push(
        `<line x1="${vx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${vx.toFixed(1)}" y2="${(goingDown ? ty - 4 : ty + 4).toFixed(1)}" stroke="${col}" stroke-width="1.35"${dash}/>`
          + arrowHead(vx, ty, goingDown ? 'down' : 'up', col, 4),
      );
      if (e.label) placeNonCollidingPill(vx + 24, (sy + ty) / 2, e.label, col, 46, 5.7);
      return;
    }

    const sx = a.x + a.w;
    const sy = a.y + a.h / 2;
    const tx = b.x;
    const ty = b.y + b.h / 2;
    const isSkip = tx - sx > 95 && midNodes.length > 0;
    const mx = (sx + tx) / 2;

    if (isSkip) {
      const sIdx = skipCount++;
      const curveY = 197 + Math.min(2, sIdx) * 3;
      edgePaths.push(
        `<path d="M ${(a.x + a.w / 2).toFixed(1)} ${(a.y + a.h).toFixed(1)} Q ${mx.toFixed(1)} ${curveY} ${(b.x + b.w / 2).toFixed(1)} ${(b.y + b.h + 4).toFixed(1)}" stroke="${col}" stroke-width="1.25"${dash}/>`
          + arrowHead(b.x + b.w / 2, b.y + b.h, 'up', col, 4),
      );
      if (e.label) {
        const pillX = sIdx === 0 ? mx : mx + (sIdx % 2 === 1 ? -46 : 46);
        placeNonCollidingPill(pillX, 189, e.label, col, 52, 5.7);
      }
    } else {
      edgePaths.push(
        `<path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${mx.toFixed(1)} ${sy.toFixed(1)} ${mx.toFixed(1)} ${ty.toFixed(1)} ${(tx - 4).toFixed(1)} ${ty.toFixed(1)}" stroke="${col}" stroke-width="1.35"${dash}/>`
          + arrowHead(tx, ty, 'right', col, 4.1),
      );
      if (e.label) {
        const lx = mx;
        const ly = (sy + ty) / 2 + (Math.abs(ty - sy) < 6 ? -8 : 0);
        const compactEdge = e.label.replace(/^H(\d+):\s*β=/u, 'H$1:');
        placeNonCollidingPill(lx, ly, compactEdge, col, 52, 5.7);
      }
    }
  });

  const nodesMarkup = [...boxes.values()].map(box => {
    const n = box.node;
    const c = roleColor(n.role, pal);
    const isLatent = midNodes.includes(n) || leftNodes.includes(n);
    const glyph = inferGlyphKind(n, 'sem_path');
    const subRaw = n.sublabel ?? n.stage ?? '';
    const hasSub = Boolean(subRaw) && box.h >= 36;
    const subLines = hasSub && box.h >= 46 ? 2 : 1;

    return tintedCard(box.x, box.y, box.w, box.h, c, { rx: isLatent ? 9 : 6, opacity: n.role === 'output' ? 0.16 : 0.11, strokeWidth: n.role === 'output' ? 1.5 : 1.2 })
      + (isLatent ? `<rect x="${(box.x + 2.4).toFixed(1)}" y="${(box.y + 2.4).toFixed(1)}" width="${(box.w - 4.8).toFixed(1)}" height="${(box.h - 4.8).toFixed(1)}" rx="7" stroke="${c}" stroke-opacity="0.28" stroke-width="0.7"/>` : '')
      + renderMicroGlyph(glyph, box.x + 5, box.y + 6, c, pal.opposite)
      + renderFittedText(box.x + 21, hasSub ? box.y + (subLines === 2 ? 14.5 : 16) : box.y + box.h / 2, n.label, {
        maxPx: box.w - 25,
        idealSize: 7.4,
        maxLines: 2,
        minSize: 5.0,
        fill: pal.inkDark,
        weight: 700,
        lineHeightRatio: 1.2,
      })
      + (hasSub
        ? renderFittedText(box.x + 6, box.y + box.h - (subLines === 2 ? 10 : 7.5), subRaw, {
            maxPx: box.w - 11,
            idealSize: 6.1,
            maxLines: subLines,
            minSize: 4.5,
            fill: pal.inkMuted,
            lineHeightRatio: 1.18,
          })
        : '');
  }).join('');

  const footer = `<rect x="10" y="201" width="340" height="19" rx="5" fill="#FFFFFF" stroke="${pal.borderMuted}" stroke-width="0.85"/>`
    + renderMicroGlyph('chart_bar', 15, 203.5, pal.primary, pal.secondary)
    + renderFittedText(33, 210.5, 'SEM 假设路径检验 · 5,000次 Bootstrap · 拟合基准 χ²/df < 3.0, CFI >= 0.90, RMSEA < 0.08', {
      maxPx: 312,
      idealSize: 6.9,
      maxLines: 1,
      minSize: 5.2,
      fill: pal.inkMuted,
      weight: 600,
    });

  return edgePaths.join('') + nodesMarkup + edgePills.join('') + footer;
}

/** 3. PROCESS Moderated Mediation / Serial Mediation Topology */
function renderMediationModeration(item: DiagramExampleSpec, pal: Palette): string {
  const nodes = item.nodes;
  const modNode = nodes.find(n => n.role === 'decision' || /调节|边界|W\)/u.test(n.label + (n.stage ?? '')));
  const others = nodes.filter(n => n !== modNode);
  const xNode = others[0] ?? nodes[0];
  const yNode = others[others.length - 1] ?? nodes[nodes.length - 1];
  const medNodes = others.slice(1, Math.max(1, others.length - 1)).slice(0, 2);

  const wBox = { x: 106, y: 38, w: 148, h: 32 };
  const xBox = { x: 8, y: 102, w: 74, h: 54 };
  const yBox = { x: 278, y: 102, w: 74, h: 54 };

  const medBoxes = medNodes.length >= 2
    ? [
        { x: 104, y: 101, w: 64, h: 56, node: medNodes[0] },
        { x: 192, y: 101, w: 64, h: 56, node: medNodes[1] },
      ]
    : [{ x: 124, y: 101, w: 112, h: 56, node: medNodes[0] ?? xNode }];

  const drawBox = (b: { x: number; y: number; w: number; h: number }, node: DiagramNodeSpec, forceColor?: string) => {
    const c = forceColor ?? roleColor(node.role, pal);
    const glyph = inferGlyphKind(node, 'mediation_moderation');
    const isNarrow = b.w <= 76;
    const sub = node.stage ?? '';

    if (isNarrow) {
      return tintedCard(b.x, b.y, b.w, b.h, c, { rx: 6.5, opacity: node.role === 'output' ? 0.16 : 0.11 })
        + renderMicroGlyph(glyph, b.x + b.w / 2 - 7, b.y + 4, c, pal.opposite)
        + renderFittedText(b.x + b.w / 2, sub ? b.y + 30.5 : b.y + 35, node.label, {
          maxPx: b.w - 8,
          idealSize: 7.0,
          maxLines: 2,
          minSize: 4.9,
          fill: pal.inkDark,
          weight: 700,
          anchor: 'middle',
          lineHeightRatio: 1.2,
        })
        + (sub
          ? renderFittedText(b.x + b.w / 2, b.y + b.h - 7, sub, {
              maxPx: b.w - 8,
              idealSize: 6.0,
              maxLines: 1,
              minSize: 4.5,
              fill: c,
              weight: 600,
              anchor: 'middle',
            })
          : '');
    }
    const showSub = Boolean(sub) && b.h >= 32;
    return tintedCard(b.x, b.y, b.w, b.h, c, { rx: 7, opacity: node.role === 'output' ? 0.16 : 0.11 })
      + renderMicroGlyph(glyph, b.x + 5, b.y + 5.5, c, pal.opposite)
      + renderFittedText(b.x + 21, showSub ? b.y + b.h * 0.36 : b.y + b.h / 2, node.label, {
        maxPx: b.w - 26,
        idealSize: 7.6,
        maxLines: b.h >= 40 ? 2 : 1,
        minSize: 5.2,
        fill: pal.inkDark,
        weight: 700,
      })
      + (showSub
        ? renderFittedText(b.x + 7, b.y + b.h - 7.5, sub, {
            maxPx: b.w - 12,
            idealSize: 6.2,
            maxLines: 1,
            minSize: 4.7,
            fill: c,
            weight: 600,
          })
        : '');
  };

  const edgePills: string[] = [];
  let paths = '';
  const edgeLabel = (sId: string, tId: string, fallback: string) =>
    item.edges.find(e => e.source === sId && e.target === tId)?.label ?? fallback;

  // X -> M1
  const mFirst = medBoxes[0];
  const axMid = (xBox.x + xBox.w + mFirst.x) / 2;
  paths += `<line x1="${xBox.x + xBox.w}" y1="129" x2="${mFirst.x - 4}" y2="129" stroke="${pal.primary}" stroke-width="1.45"/>`
    + arrowHead(mFirst.x, 129, 'right', pal.primary, 4.1);
  edgePills.push(pillTag(axMid, 114, edgeLabel(xNode.id, mFirst.node.id, '路径 a').replace('***', ''), pal.primary, 38, 5.7));

  if (medBoxes.length === 2) {
    const mSecond = medBoxes[1];
    const dxMid = (mFirst.x + mFirst.w + mSecond.x) / 2;
    paths += `<line x1="${mFirst.x + mFirst.w}" y1="129" x2="${mSecond.x - 4}" y2="129" stroke="${pal.secondary}" stroke-width="1.45"/>`
      + arrowHead(mSecond.x, 129, 'right', pal.secondary, 4.1);
    edgePills.push(pillTag(dxMid, 145, edgeLabel(mFirst.node.id, mSecond.node.id, 'd21').replace('***', ''), pal.secondary, 36, 5.6));
  }

  const mLast = medBoxes[medBoxes.length - 1];
  const bxMid = (mLast.x + mLast.w + yBox.x) / 2;
  paths += `<line x1="${mLast.x + mLast.w}" y1="129" x2="${yBox.x - 4}" y2="129" stroke="${pal.primary}" stroke-width="1.45"/>`
    + arrowHead(yBox.x, 129, 'right', pal.primary, 4.1);
  edgePills.push(pillTag(bxMid, 114, edgeLabel(mLast.node.id, yNode.id, '路径 b').replace('***', ''), pal.primary, 38, 5.7));

  // Direct path c' underneath
  paths += `<path d="M ${xBox.x + xBox.w / 2} ${xBox.y + xBox.h} Q 180 198 ${yBox.x + yBox.w / 2} ${yBox.y + yBox.h + 3}" stroke="${pal.secondary}" stroke-width="1.3" stroke-dasharray="3.5 2.5"/>`
    + arrowHead(yBox.x + yBox.w / 2, yBox.y + yBox.h, 'up', pal.secondary, 4.0);
  edgePills.push(pillTag(180, 181, edgeLabel(xNode.id, yNode.id, "直接路径 c'"), pal.secondary, 68, 6.1));

  // Moderation W -> path a / path b
  if (modNode) {
    const modALabel = item.edges.find(e => e.source === modNode.id)?.label ?? 'a×W调节';
    paths += `<path d="M ${wBox.x + 28} ${wBox.y + wBox.h} Q ${axMid + 10} 86 ${axMid} 123" stroke="${pal.opposite}" stroke-width="1.3" stroke-dasharray="3.5 2.5"/>`
      + arrowHead(axMid, 126, 'down', pal.opposite, 3.8)
      + `<circle cx="${axMid}" cy="129" r="2.6" fill="#FFFFFF" stroke="${pal.opposite}" stroke-width="1.2"/>`;
    edgePills.push(pillTag(axMid + 12, 85, modALabel, pal.opposite, 52, 5.8));

    if (medBoxes.length >= 2) {
      paths += `<path d="M ${wBox.x + wBox.w - 28} ${wBox.y + wBox.h} Q ${bxMid - 10} 86 ${bxMid} 123" stroke="${pal.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2.5"/>`
        + arrowHead(bxMid, 126, 'down', pal.opposite, 3.8);
      edgePills.push(pillTag(bxMid - 12, 85, 'b×W', pal.opposite, 36, 5.8));
    }
  }

  const modMarkup = modNode ? drawBox(wBox, modNode, pal.opposite) : '';
  const mainBoxes = drawBox(xBox, xNode) + medBoxes.map(mb => drawBox(mb, mb.node)).join('') + drawBox(yBox, yNode);

  const footer = `<rect x="10" y="201" width="340" height="19" rx="5" fill="#FFFFFF" stroke="${pal.borderMuted}" stroke-width="0.85"/>`
    + renderMicroGlyph('chart_trend', 15, 203.5, pal.opposite, pal.primary)
    + renderFittedText(33, 210.5, '有调节的中介传导效应 · Bootstrap 5,000次检验显著性边界 (±1 SD 斜率)', {
      maxPx: 312,
      idealSize: 6.9,
      maxLines: 1,
      minSize: 5.2,
      fill: pal.inkMuted,
      weight: 600,
    });

  return paths + modMarkup + mainBoxes + edgePills.join('') + footer;
}

/** 4. PRISMA 2020 / Quality Control Filtering Funnel + Side Exclusion Rails */
function renderPrismaFunnel(item: DiagramExampleSpec, pal: Palette): string {
  const nodes = item.nodes.slice(0, 5);
  const count = Math.max(1, nodes.length);
  const cx = 116;
  const topY = 38;
  const stepY = 180 / count;
  const boxH = Math.min(28, Math.floor(stepY - 7));

  const isPrisma = /PRISMA/i.test(item.title);
  const sampleCounts = isPrisma
    ? ['n=1,480', 'n=1,126', 'n=342', 'n=68', 'N=42 篇']
    : ['n=1,280', 'n=1,108', 'n=1,012', 'n=942', 'N=942'];
  const exclusions = isPrisma
    ? ['去重剔除 -354', '标题摘要 -784', '全文不符 -274']
    : ['异常时长 -172', '直线作答 -96', '游程偏差 -70'];

  return nodes.map((n, i) => {
    const y = topY + i * stepY;
    const w = Math.round(216 - (i * 52) / Math.max(1, count - 1));
    const x = cx - w / 2;
    const c = roleColor(n.role, pal);
    const glyph = inferGlyphKind(n, 'prisma_funnel');
    const countTag = sampleCounts[i] ?? '';
    const countPillW = 40;
    const labelMaxPx = Math.max(50, w - countPillW - 28);

    const card = tintedCard(x, y, w, boxH, c, { rx: 5.5, opacity: i === count - 1 ? 0.17 : 0.11 })
      + renderMicroGlyph(glyph, x + 5, y + boxH / 2 - 7, c, pal.opposite)
      + renderFittedText(x + 22, y + boxH / 2, n.label, {
        maxPx: labelMaxPx,
        idealSize: 7.5,
        maxLines: 2,
        minSize: 5.0,
        fill: pal.inkDark,
        weight: 700,
        lineHeightRatio: 1.18,
      })
      + `<rect x="${x + w - countPillW - 4}" y="${(y + boxH / 2 - 6.5).toFixed(1)}" width="${countPillW}" height="13" rx="6.5" fill="${c}" fill-opacity="0.16"/>`
      + textEl(x + w - countPillW / 2 - 4, y + boxH / 2 + 2.4, countTag, { size: 6.2, fill: c, weight: 700, anchor: 'middle' });

    const downArrow = i < count - 1
      ? `<line x1="${cx}" y1="${(y + boxH).toFixed(1)}" x2="${cx}" y2="${(topY + (i + 1) * stepY - 3).toFixed(1)}" stroke="${pal.primary}" stroke-width="1.35"/>`
        + arrowHead(cx, topY + (i + 1) * stepY, 'down', pal.primary, 4.1)
      : '';

    let sideExcl = '';
    if (i > 0 && i < count - 1 && i - 1 < exclusions.length) {
      const exLabel = exclusions[i - 1];
      const exX = 238;
      const exW = 112;
      const midY = y + boxH / 2;
      sideExcl = `<line x1="${x + w}" y1="${midY.toFixed(1)}" x2="${exX - 4}" y2="${midY.toFixed(1)}" stroke="${pal.opposite}" stroke-width="1.15" stroke-dasharray="3 2"/>`
        + arrowHead(exX, midY, 'right', pal.opposite, 3.8)
        + tintedCard(exX, y + 1, exW, boxH - 2, pal.opposite, { rx: 5, opacity: 0.09, strokeWidth: 1, dashed: true })
        + renderMicroGlyph('gate', exX + 4, y + boxH / 2 - 6.5, pal.opposite, pal.primary)
        + renderFittedText(exX + 20, y + boxH / 2, exLabel, {
          maxPx: exW - 24,
          idealSize: 7.1,
          maxLines: 1,
          minSize: 5.2,
          fill: pal.opposite,
          weight: 700,
        });
    }

    return card + downArrow + sideExcl;
  }).join('');
}

/** 5. AI / NLP / Econometric System Pipeline with Embedded Analytical Inset */
function renderSystemPipelineInset(item: DiagramExampleSpec, pal: Palette): string {
  const nodes = item.nodes.slice(0, 5);
  const n = Math.max(1, nodes.length);
  const gap = 7;
  const totalW = 340;
  const boxW = Math.floor((totalW - gap * (n - 1)) / n);
  const startX = 10;
  const topY = 36;
  const boxH = 88;

  const pipelineMarkup = nodes.map((node, i) => {
    const x = startX + i * (boxW + gap);
    const c = roleColor(node.role, pal);
    const glyph = inferGlyphKind(node, 'system_pipeline_inset');
    const stageStr = node.stage ?? `阶段 ${i + 1}`;
    const hasSub = Boolean(node.sublabel);

    const card = tintedCard(x, topY, boxW, boxH, c, { rx: 6, opacity: i === n - 1 ? 0.15 : 0.09 })
      + `<rect x="${x}" y="${topY}" width="${boxW}" height="14" rx="5" fill="${c}" fill-opacity="0.88"/>`
      + renderFittedText(x + boxW / 2, topY + 7.2, stageStr, {
        maxPx: boxW - 5,
        idealSize: 6.6,
        maxLines: 1,
        minSize: 4.5,
        fill: '#FFFFFF',
        weight: 700,
        anchor: 'middle',
      })
      + renderMicroGlyph(glyph, x + boxW / 2 - 7, topY + 16, c, pal.opposite)
      + renderFittedText(x + boxW / 2, hasSub ? topY + 46 : topY + 56, node.label, {
        maxPx: boxW - 6,
        idealSize: 7.2,
        maxLines: 3,
        minSize: 4.7,
        fill: pal.inkDark,
        weight: 700,
        anchor: 'middle',
        lineHeightRatio: 1.2,
      })
      + (hasSub
        ? renderFittedText(x + boxW / 2, topY + 74.5, node.sublabel ?? '', {
            maxPx: boxW - 6,
            idealSize: 5.9,
            maxLines: 2,
            minSize: 4.5,
            fill: pal.inkMuted,
            anchor: 'middle',
            lineHeightRatio: 1.18,
          })
        : '');

    let arrow = '';
    if (i < n - 1) {
      const midY = topY + boxH / 2 - 2;
      const nx = startX + (i + 1) * (boxW + gap);
      arrow = `<line x1="${x + boxW}" y1="${midY}" x2="${nx - 3.5}" y2="${midY}" stroke="${pal.primary}" stroke-width="1.35"/>`
        + arrowHead(nx, midY, 'right', pal.primary, 4);
    }
    return card + arrow;
  }).join('');

  const sig = `${item.id} ${item.title}`;
  let leftInsetTitle = '实时特征与分布监控窗';
  let leftGraphic = '';

  if (/RDD|断点/u.test(sig)) {
    leftInsetTitle = 'RDD 断点局域跳跃识别窗 (c = c₀)';
    leftGraphic = `<line x1="20" y1="202" x2="188" y2="202" stroke="${pal.borderMuted}" stroke-width="1"/>`
      + `<line x1="104" y1="159" x2="104" y2="202" stroke="${pal.opposite}" stroke-dasharray="3 2" stroke-width="1.2"/>`
      + `<line x1="24" y1="194" x2="102" y2="184" stroke="${pal.secondary}" stroke-width="2"/>`
      + `<line x1="106" y1="171" x2="184" y2="163" stroke="${pal.primary}" stroke-width="2"/>`
      + [[32, 192], [50, 189], [70, 187], [89, 185], [115, 172], [137, 169], [159, 166], [176, 164]].map(
        ([px, py], idx) => `<circle cx="${px}" cy="${py}" r="2.2" fill="${idx < 4 ? pal.secondary : pal.primary}"/>`,
      ).join('')
      + textEl(108, 165, 'τ_LATE', { size: 6.8, fill: pal.opposite, weight: 700 });
  } else if (/MoE|路由|并行/u.test(sig)) {
    leftInsetTitle = 'Top-K 门控路由与专家负载均衡';
    leftGraphic = [0, 1, 2, 3].map(idx => {
      const bx = 22 + idx * 41;
      const bh = [26, 36, 18, 30][idx];
      const col = idx === 1 ? pal.primary : idx === 2 ? pal.opposite : pal.secondary;
      return `<rect x="${bx}" y="${201 - bh}" width="24" height="${bh}" rx="2.5" fill="${col}" fill-opacity="0.78"/>`
        + textEl(bx + 12, 211, `E${idx + 1}`, { size: 6.5, fill: pal.inkMuted, weight: 600, anchor: 'middle' });
    }).join('');
  } else if (/RAG|BERTopic|知识图谱|文本/u.test(sig)) {
    leftInsetTitle = '语义簇群权重 × 关键词向量嵌入';
    leftGraphic = [
      { label: '核心痛点簇', w: 108, col: pal.primary },
      { label: '信任顾虑簇', w: 82, col: pal.secondary },
      { label: '政策期待簇', w: 62, col: pal.opposite },
    ].map((bar, idx) => {
      const by = 163 + idx * 16;
      return textEl(20, by + 8, bar.label, { size: 6.6, fill: pal.inkDark, weight: 600 })
        + `<rect x="70" y="${by}" width="${bar.w}" height="9" rx="2.5" fill="${bar.col}" fill-opacity="0.76"/>`;
    }).join('');
  } else {
    leftInsetTitle = '建模指标校准与误差收缩轨迹';
    leftGraphic = `<polyline points="22,197 54,187 86,179 120,170 156,165 184,162" stroke="${pal.primary}" stroke-width="1.9"/>`
      + `<polyline points="22,169 54,177 86,185 120,191 156,196 184,199" stroke="${pal.opposite}" stroke-width="1.4" stroke-dasharray="3 2"/>`
      + `<circle cx="184" cy="162" r="2.6" fill="${pal.primary}"/>`
      + textEl(164, 160, '收敛', { size: 6.4, fill: pal.primary, weight: 700 });
  }

  const leftPanel = tintedCard(10, 139, 188, 80, pal.secondary, { rx: 6, opacity: 0.06, strokeWidth: 1 })
    + renderFittedText(18, 149.5, leftInsetTitle, {
      maxPx: 172,
      idealSize: 7.3,
      maxLines: 1,
      minSize: 5.4,
      fill: pal.secondary,
      weight: 700,
    })
    + leftGraphic;

  const rightPanel = tintedCard(208, 139, 142, 80, pal.primary, { rx: 6, opacity: 0.08, strokeWidth: 1.1, dashed: true })
    + renderMicroGlyph('shield', 215, 145, pal.primary, pal.opposite)
    + textEl(233, 155, '交叉校核与闭环调优', { size: 7.5, fill: pal.inkDark, weight: 700 })
    + pillTag(244, 176, '异常熔断', pal.opposite, 52, 6.4)
    + pillTag(312, 176, '溯源重算', pal.primary, 52, 6.4)
    + textEl(279, 202, '校验不通过则触发回溯调参', { size: 6.6, fill: pal.inkMuted, anchor: 'middle' })
    + `<path d="M 279 139 V 131 H 126 V 127" stroke="${pal.opposite}" stroke-width="1.2" stroke-dasharray="3 2"/>`
    + arrowHead(126, 124, 'up', pal.opposite, 4)
    + pillTag(202, 131, '反馈调参', pal.opposite, 52, 6.0);

  return pipelineMarkup + leftPanel + rightPanel;
}

/** 6. 2×2 Partition Matrix + Converging Decision Stack */
function renderPartitionMatrix(item: DiagramExampleSpec, pal: Palette): string {
  const sig = `${item.id} ${item.title}`;
  const isDid = /DID|双重差分/u.test(sig);
  const isFsQca = /fsQCA|组态/u.test(sig);
  const isWtp = /PSM|WTP|价格/u.test(sig);

  const qLabels = isDid
    ? ['处理组 × 前期', '处理组 × 后 (ATT)', '对照组 × 前期', '对照组 × 政策后']
    : isFsQca
      ? ['核心条件齐备', '高因果组态解', '必要条件缺失', '边缘非对称路径']
      : isWtp
        ? ['太便宜/疑质', '最优价格区间', '可接受上限', '太贵/流失区']
        : ['低重要·低表现', '继续保持优势区', '低优先级区', '高重要·重点改进'];

  const mx = 10;
  const my = 41;
  const mw = 184;
  const mh = 154;
  const qw = mw / 2;
  const qh = mh / 2;
  const qColors = [pal.borderMuted, pal.primary, pal.secondary, pal.opposite];

  const matrixMarkup = `<g>`
    + `<rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="6" fill="#FFFFFF" stroke="${pal.borderMuted}" stroke-width="1"/>`
    + [0, 1].flatMap(r => [0, 1].map(c => {
      const idx = r * 2 + c;
      const qx = mx + c * qw;
      const qy = my + r * qh;
      const col = qColors[idx];
      return `<rect x="${qx}" y="${qy}" width="${qw}" height="${qh}" fill="${col}" fill-opacity="${idx === 1 || idx === 3 ? '0.13' : '0.06'}"/>`
        + `<circle cx="${qx + qw * 0.35}" cy="${qy + qh * 0.43}" r="3.2" fill="${col}" fill-opacity="0.72"/>`
        + `<circle cx="${qx + qw * 0.68}" cy="${qy + qh * 0.34}" r="4.2" fill="${col}" fill-opacity="0.55"/>`
        + renderFittedText(qx + qw / 2, qy + qh - 11, qLabels[idx], {
          maxPx: qw - 6,
          idealSize: 6.6,
          maxLines: 1,
          minSize: 5.0,
          fill: idx === 0 ? pal.inkMuted : col,
          weight: 700,
          anchor: 'middle',
        });
    })).join('')
    + `<line x1="${mx + qw}" y1="${my + 4}" x2="${mx + qw}" y2="${my + mh - 4}" stroke="${pal.inkMuted}" stroke-dasharray="3 2" stroke-width="1"/>`
    + `<line x1="${mx + 4}" y1="${my + qh}" x2="${mx + mw - 4}" y2="${my + qh}" stroke="${pal.inkMuted}" stroke-dasharray="3 2" stroke-width="1"/>`
    + `</g>`;

  const rightNodes = item.nodes.slice(-3);
  const rx = 222;
  const rw = 128;
  const rightMarkup = rightNodes.map((node, i) => {
    const ry = 41 + i * 54;
    const rh = 44;
    const c = roleColor(node.role, pal);
    const glyph = inferGlyphKind(node, 'partition_matrix');
    const subRaw = node.sublabel ?? node.stage ?? '';
    const arrowDown = i < rightNodes.length - 1
      ? `<line x1="${rx + rw / 2}" y1="${ry + rh}" x2="${rx + rw / 2}" y2="${ry + 51}" stroke="${pal.primary}" stroke-width="1.3"/>`
        + arrowHead(rx + rw / 2, ry + 54, 'down', pal.primary, 4)
      : '';
    return tintedCard(rx, ry, rw, rh, c, { rx: 6, opacity: i === rightNodes.length - 1 ? 0.16 : 0.10, leftBar: true })
      + renderMicroGlyph(glyph, rx + 7, ry + 6, c, pal.opposite)
      + renderFittedText(rx + 24, subRaw ? ry + 14.5 : ry + rh / 2, node.label, {
        maxPx: rw - 28,
        idealSize: 7.7,
        maxLines: 2,
        minSize: 5.0,
        fill: pal.inkDark,
        weight: 700,
        lineHeightRatio: 1.18,
      })
      + (subRaw
        ? renderFittedText(rx + 9, ry + 34, subRaw, {
            maxPx: rw - 14,
            idealSize: 6.3,
            maxLines: 2,
            minSize: 4.6,
            fill: pal.inkMuted,
            lineHeightRatio: 1.15,
          })
        : '')
      + arrowDown;
  }).join('');

  const bridgeArrows = `<path d="M ${mx + mw} 82 H 218" stroke="${pal.primary}" stroke-width="1.3"/>`
    + arrowHead(rx, 82, 'right', pal.primary, 4.1)
    + `<path d="M ${mx + mw} 156 H 218" stroke="${pal.opposite}" stroke-width="1.3"/>`
    + arrowHead(rx, 156, 'right', pal.opposite, 4.1)
    + pillTag(208, 119, '矩阵映射', pal.secondary, 44, 5.9);

  const footer = `<rect x="10" y="201" width="340" height="19" rx="5" fill="#FFFFFF" stroke="${pal.borderMuted}" stroke-width="0.85"/>`
    + renderFittedText(180, 210.5, `象限划分 × 多维判别输出 · ${item.nodes[0]?.label ?? '特征输入'} → 优先级排期`, {
      maxPx: 328,
      idealSize: 6.8,
      maxLines: 1,
      minSize: 5.0,
      fill: pal.inkMuted,
      weight: 600,
      anchor: 'middle',
    });

  return matrixMarkup + rightMarkup + bridgeArrows + footer;
}

/** 7. Evolutionary Game / Cyclic Equilibrium + Phase Trajectory Inset */
function renderEvolutionaryGame(item: DiagramExampleSpec, pal: Palette): string {
  const nodes = item.nodes.slice(0, 4);
  const isPdca = /PDCA|迭代|对齐/u.test(item.title);

  let loopMarkup = '';
  if (isPdca && nodes.length >= 4) {
    const coords = [
      { x: 72, y: 39, w: 94, h: 34 },
      { x: 144, y: 110, w: 86, h: 36 },
      { x: 72, y: 182, w: 94, h: 34 },
      { x: 10, y: 110, w: 86, h: 36 },
    ];
    loopMarkup = `<path d="M 166 56 Q 192 78 188 106" stroke="${pal.primary}" stroke-width="1.35"/>`
      + arrowHead(188, 110, 'down', pal.primary, 4)
      + `<path d="M 188 146 Q 190 176 170 194" stroke="${pal.secondary}" stroke-width="1.35"/>`
      + arrowHead(166, 196, 'left', pal.secondary, 4)
      + `<path d="M 72 196 Q 48 176 50 149" stroke="${pal.opposite}" stroke-width="1.35"/>`
      + arrowHead(50, 146, 'up', pal.opposite, 4)
      + `<path d="M 50 110 Q 50 76 70 58" stroke="${pal.primary}" stroke-width="1.35"/>`
      + arrowHead(72, 56, 'right', pal.primary, 4)
      + `<rect x="97" y="117" width="44" height="22" rx="11" fill="${pal.primary}" fill-opacity="0.14" stroke="${pal.primary}" stroke-width="1.1"/>`
      + textEl(119, 130.6, '闭环迭代', { size: 6.8, fill: pal.primary, weight: 700, anchor: 'middle' })
      + coords.map((pos, i) => {
        const n = nodes[i];
        const c = roleColor(n.role, pal);
        const sub = n.stage ?? '';
        return tintedCard(pos.x, pos.y, pos.w, pos.h, c, { rx: 6, opacity: 0.13 })
          + renderFittedText(pos.x + pos.w / 2, sub ? pos.y + 12.5 : pos.y + pos.h / 2, n.label, {
            maxPx: pos.w - 8,
            idealSize: 7.2,
            maxLines: 2,
            minSize: 4.8,
            fill: pal.inkDark,
            weight: 700,
            anchor: 'middle',
            lineHeightRatio: 1.15,
          })
          + (sub
            ? renderFittedText(pos.x + pos.w / 2, pos.y + pos.h - 6.5, sub, {
                maxPx: pos.w - 8,
                idealSize: 6.2,
                maxLines: 1,
                minSize: 4.6,
                fill: c,
                weight: 600,
                anchor: 'middle',
              })
            : '');
      }).join('');
  } else {
    const tri = [
      { x: 66, y: 39, w: 108, h: 42 },
      { x: 10, y: 162, w: 104, h: 44 },
      { x: 126, y: 162, w: 104, h: 44 },
    ];
    const arcs = `<path d="M 96 81 Q 58 114 58 158" stroke="${pal.primary}" stroke-width="1.35"/>`
      + arrowHead(58, 162, 'down', pal.primary, 4.1)
      + `<path d="M 144 81 Q 182 114 182 158" stroke="${pal.secondary}" stroke-width="1.35"/>`
      + arrowHead(182, 162, 'down', pal.secondary, 4.1)
      + `<path d="M 114 184 H 123" stroke="${pal.opposite}" stroke-width="1.35" stroke-dasharray="3 2"/>`
      + arrowHead(126, 184, 'right', pal.opposite, 3.6)
      + pillTag(120, 121, 'ESS 均衡', pal.primary, 52, 6.8)
      + pillTag(62, 118, '策略互动', pal.primary, 48, 6.0)
      + pillTag(178, 118, '收益复制', pal.secondary, 48, 6.0);

    loopMarkup = arcs + tri.map((pos, i) => {
      const n = nodes[i] ?? nodes[0];
      const c = roleColor(n.role, pal);
      const glyph = inferGlyphKind(n, 'evolutionary_game');
      const sub = n.stage ?? '';
      return tintedCard(pos.x, pos.y, pos.w, pos.h, c, { rx: 6, opacity: 0.13 })
        + renderMicroGlyph(glyph, pos.x + 5, pos.y + 5, c, pal.opposite)
        + renderFittedText(pos.x + 21, sub ? pos.y + 15.5 : pos.y + pos.h / 2, n.label, {
          maxPx: pos.w - 25,
          idealSize: 7.2,
          maxLines: 2,
          minSize: 4.9,
          fill: pal.inkDark,
          weight: 700,
          lineHeightRatio: 1.18,
        })
        + (sub
          ? renderFittedText(pos.x + 7, pos.y + pos.h - 6.5, sub, {
              maxPx: pos.w - 12,
              idealSize: 6.2,
              maxLines: 1,
              minSize: 4.7,
              fill: c,
              weight: 600,
            })
          : '');
    }).join('');
  }

  // Right Phase Portrait Convergence Inset
  const rx = 238;
  const rw = 112;
  const inset = tintedCard(rx, 40, rw, 178, pal.secondary, { rx: 6, opacity: 0.06, strokeWidth: 1 })
    + textEl(rx + rw / 2, 54, isPdca ? '30天KPI与熔断轨迹' : '复制动态收敛相图', { size: 7.3, fill: pal.secondary, weight: 700, anchor: 'middle' })
    + `<line x1="${rx + 12}" y1="142" x2="${rx + rw - 10}" y2="142" stroke="${pal.borderMuted}" stroke-width="1"/>`
    + `<line x1="${rx + 12}" y1="64" x2="${rx + 12}" y2="142" stroke="${pal.borderMuted}" stroke-width="1"/>`
    + `<line x1="${rx + 12}" y1="78" x2="${rx + rw - 12}" y2="78" stroke="${pal.opposite}" stroke-dasharray="2.5 2" stroke-width="0.9"/>`
    + `<path d="M ${rx + 14} 136 Q ${rx + 45} 112 ${rx + rw - 14} 78" stroke="${pal.primary}" stroke-width="1.8"/>`
    + `<path d="M ${rx + 14} 118 Q ${rx + 56} 92 ${rx + rw - 14} 78" stroke="${pal.secondary}" stroke-width="1.5"/>`
    + `<path d="M ${rx + 14} 96 Q ${rx + 52} 122 ${rx + rw - 14} 134" stroke="${pal.opposite}" stroke-width="1.3" stroke-dasharray="3 2"/>`
    + `<circle cx="${rx + rw - 14}" cy="78" r="3" fill="${pal.primary}"/>`
    + textEl(rx + rw - 16, 72, '(1,1)', { size: 6.5, fill: pal.primary, weight: 700, anchor: 'end' })
    + tintedCard(rx + 6, 151, rw - 12, 59, pal.primary, { rx: 5, opacity: 0.12, strokeWidth: 1 })
    + renderMicroGlyph('shield', rx + 10, 155, pal.primary, pal.opposite)
    + textEl(rx + 27, 165, '均衡阈值', { size: 7.4, fill: pal.inkDark, weight: 700 })
    + renderFittedText(rx + 10, 182, nodes[nodes.length - 1]?.label ?? '稳定收敛', {
      maxPx: rw - 20,
      idealSize: 6.6,
      maxLines: 2,
      minSize: 4.8,
      fill: pal.inkMuted,
      lineHeightRatio: 1.18,
    })
    + textEl(rx + 10, 202, isPdca ? '达标扩面 / 熔断回退' : 'Jacobian 特征值 < 0', { size: 6.2, fill: pal.primary, weight: 600 });

  return loopMarkup + inset;
}

/** 8. Conditional Logic / Questionnaire Routing / Coding Decision Tree */
function renderTreeBranch(item: DiagramExampleSpec, pal: Palette): string {
  const nodes = item.nodes;
  if (item.direction === 'LR') {
    const root = nodes[0];
    const out = nodes[nodes.length - 1];
    const branches = nodes.slice(1, -1).slice(0, 3);
    const rootBox = { x: 10, y: 88, w: 88, h: 72 };
    const outBox = { x: 262, y: 88, w: 88, h: 72 };

    const branchMarkup = branches.map((b, i) => {
      const by = 40 + i * 58;
      const bw = 118;
      const bh = 50;
      const bx = 120;
      const c = roleColor(b.role, pal);
      const glyph = inferGlyphKind(b, 'tree_branch');
      const cy = by + bh / 2;
      const subRaw = b.sublabel ?? b.stage ?? '';
      return `<path d="M ${rootBox.x + rootBox.w} 124 C 108 124 108 ${cy} ${bx - 3} ${cy}" stroke="${c}" stroke-width="1.3"/>`
        + arrowHead(bx, cy, 'right', c, 3.8)
        + `<path d="M ${bx + bw} ${cy} C 248 ${cy} 248 124 ${outBox.x - 3} 124" stroke="${pal.primary}" stroke-width="1.3"/>`
        + arrowHead(outBox.x, 124, 'right', pal.primary, 3.8)
        + tintedCard(bx, by, bw, bh, c, { rx: 6, opacity: 0.11, leftBar: true })
        + renderMicroGlyph(glyph, bx + 6, by + 6, c, pal.opposite)
        + renderFittedText(bx + 23, subRaw ? by + 16 : by + bh / 2, b.label, {
          maxPx: bw - 27,
          idealSize: 7.5,
          maxLines: 2,
          minSize: 5.0,
          fill: pal.inkDark,
          weight: 700,
          lineHeightRatio: 1.18,
        })
        + (subRaw
          ? renderFittedText(bx + 8, by + 38.5, subRaw, {
              maxPx: bw - 14,
              idealSize: 6.2,
              maxLines: 2,
              minSize: 4.7,
              fill: pal.inkMuted,
              lineHeightRatio: 1.15,
            })
          : '');
    }).join('');

    const drawEnd = (b: { x: number; y: number; w: number; h: number }, node: DiagramNodeSpec, c: string) => {
      const stg = node.stage ?? '';
      return tintedCard(b.x, b.y, b.w, b.h, c, { rx: 6.5, opacity: 0.14 })
        + renderMicroGlyph(inferGlyphKind(node, 'tree_branch'), b.x + b.w / 2 - 7, b.y + 6, c, pal.opposite)
        + renderFittedText(b.x + b.w / 2, stg ? b.y + 36 : b.y + 42, node.label, {
          maxPx: b.w - 8,
          idealSize: 7.4,
          maxLines: 2,
          minSize: 4.9,
          fill: pal.inkDark,
          weight: 700,
          anchor: 'middle',
          lineHeightRatio: 1.18,
        })
        + (stg
          ? renderFittedText(b.x + b.w / 2, b.y + b.h - 9, stg, {
              maxPx: b.w - 8,
              idealSize: 6.4,
              maxLines: 1,
              minSize: 4.7,
              fill: c,
              weight: 600,
              anchor: 'middle',
            })
          : '');
    };

    return branchMarkup + drawEnd(rootBox, root, roleColor(root.role, pal)) + drawEnd(outBox, out, pal.primary);
  }

  // Top-to-Bottom branching tree (Root -> Diamond Gate -> Branches -> Convergence Output)
  const root = nodes[0];
  const gate = nodes.find(n => n.role === 'decision') ?? nodes[1] ?? root;
  const out = nodes[nodes.length - 1];
  const branches = nodes.filter(n => n !== root && n !== gate && n !== out).slice(0, 3);
  const branchList = branches.length ? branches : [nodes[1] ?? root, nodes[2] ?? out];

  const rootCard = tintedCard(76, 39, 208, 28, pal.secondary, { rx: 6, opacity: 0.11 })
    + renderMicroGlyph(inferGlyphKind(root, 'tree_branch'), 83, 46, pal.secondary, pal.primary)
    + renderFittedText(101, 53, root.label, {
      maxPx: 176,
      idealSize: 8.0,
      maxLines: 2,
      minSize: 5.2,
      fill: pal.inkDark,
      weight: 700,
      lineHeightRatio: 1.15,
    });

  const gx = 180;
  const gy = 94;
  const gw = 104;
  const gh = 17;
  const gateEl = `<line x1="180" y1="67" x2="180" y2="${gy - gh - 2}" stroke="${pal.primary}" stroke-width="1.3"/>`
    + arrowHead(180, gy - gh, 'down', pal.primary, 3.8)
    + `<polygon points="${gx},${gy - gh} ${gx + gw},${gy} ${gx},${gy + gh} ${gx - gw},${gy}" fill="#FFFFFF"/>`
    + `<polygon points="${gx},${gy - gh} ${gx + gw},${gy} ${gx},${gy + gh} ${gx - gw},${gy}" fill="${pal.opposite}" fill-opacity="0.14" stroke="${pal.opposite}" stroke-width="1.35"/>`
    + renderFittedText(gx, gy, gate.label, {
      maxPx: 114,
      idealSize: 7.2,
      maxLines: 2,
      minSize: 4.9,
      fill: pal.inkDark,
      weight: 700,
      anchor: 'middle',
      lineHeightRatio: 1.14,
    });

  const bCount = branchList.length;
  const bGap = 8;
  const bw = Math.floor((340 - bGap * (bCount - 1)) / bCount);
  const by = 128;
  const bh = 48;

  const branchesMarkup = branchList.map((b, i) => {
    const bx = 10 + i * (bw + bGap);
    const bcx = bx + bw / 2;
    const c = i === 0 ? pal.primary : i === 1 ? pal.secondary : pal.opposite;
    const edge = item.edges.find(e => e.source === gate.id && e.target === b.id);
    const startX = i === 0 && bCount === 2 ? gx - gw * 0.45 : i === bCount - 1 && bCount === 2 ? gx + gw * 0.45 : gx;
    const subRaw = b.sublabel ?? b.stage ?? '';
    return `<path d="M ${startX.toFixed(1)} ${(gy + gh * 0.55).toFixed(1)} L ${bcx.toFixed(1)} ${gy + 12} L ${bcx.toFixed(1)} ${by - 3}" stroke="${c}" stroke-width="1.25"/>`
      + arrowHead(bcx, by, 'down', c, 3.9)
      + (edge?.label ? pillTag(bcx, by - 11, edge.label, c, Math.min(82, bw - 8), 6.2) : '')
      + `<line x1="${bcx.toFixed(1)}" y1="${by + bh}" x2="180" y2="187" stroke="${pal.primary}" stroke-width="1.2"/>`
      + tintedCard(bx, by, bw, bh, c, { rx: 6, opacity: 0.11, leftBar: true })
      + renderMicroGlyph(inferGlyphKind(b, 'tree_branch'), bx + 6, by + 6, c, pal.opposite)
      + renderFittedText(bx + 23, subRaw ? by + 15.5 : by + bh / 2, b.label, {
        maxPx: bw - 27,
        idealSize: 7.6,
        maxLines: 2,
        minSize: 5.0,
        fill: pal.inkDark,
        weight: 700,
        lineHeightRatio: 1.18,
      })
      + (subRaw
        ? renderFittedText(bx + 8, by + 37, subRaw, {
            maxPx: bw - 13,
            idealSize: 6.3,
            maxLines: 2,
            minSize: 4.7,
            fill: pal.inkMuted,
            lineHeightRatio: 1.15,
          })
        : '');
  }).join('');

  const outCard = arrowHead(180, 190, 'down', pal.primary, 4.1)
    + tintedCard(56, 190, 248, 28, pal.primary, { rx: 6, opacity: 0.16, strokeWidth: 1.4 })
    + renderMicroGlyph('shield', 63, 197, pal.primary, pal.secondary)
    + renderFittedText(81, 204, out.label, {
      maxPx: 216,
      idealSize: 8.0,
      maxLines: 2,
      minSize: 5.2,
      fill: pal.inkDark,
      weight: 700,
      lineHeightRatio: 1.15,
    });

  return branchesMarkup + rootCard + gateEl + outCard;
}

/** 9. Multi-Actor Swimlanes / Service Blueprint + Right Feedback Loop */
function renderSwimlaneLoop(item: DiagramExampleSpec, pal: Palette): string {
  const lanes = item.nodes.slice(0, 5);
  const count = Math.max(1, lanes.length);
  const topY = 38;
  const totalH = 182;
  const laneH = totalH / count;
  const laneX = 10;
  const laneW = 314;

  const isBlueprint = /服务蓝图/u.test(item.title);
  const laneColors = [pal.secondary, pal.primary, mixHex(pal.primary, pal.secondary, 0.5), pal.opposite, pal.secondary];

  const lanesMarkup = lanes.map((node, i) => {
    const y = topY + i * laneH;
    const h = laneH - 5;
    const c = laneColors[i % laneColors.length];
    const glyph = inferGlyphKind(node, 'swimlane_loop');
    const roleTag = node.stage || `层级 ${i + 1}`;
    const sub = node.sublabel ?? '';
    const isLineOfVisibility = isBlueprint && i === 1;

    const laneBg = `<rect x="${laneX}" y="${y.toFixed(1)}" width="${laneW}" height="${h.toFixed(1)}" rx="5.5" fill="${c}" fill-opacity="0.06" stroke="${c}" stroke-opacity="0.32" stroke-width="0.9"/>`
      + (isLineOfVisibility
        ? `<line x1="${laneX}" y1="${(y + h + 2.5).toFixed(1)}" x2="${laneX + laneW}" y2="${(y + h + 2.5).toFixed(1)}" stroke="${pal.opposite}" stroke-dasharray="4 2.5" stroke-width="1"/>`
          + pillTag(laneX + 64, y + h + 2.5, '可见互动线', pal.opposite, 52, 5.9)
        : '');

    const headerPill = `<rect x="${laneX + 4}" y="${(y + 3).toFixed(1)}" width="84" height="${(h - 6).toFixed(1)}" rx="4.5" fill="${c}" fill-opacity="0.16" stroke="${c}" stroke-opacity="0.45" stroke-width="0.85"/>`
      + renderMicroGlyph(glyph, laneX + 8, y + h / 2 - 7, c, pal.opposite)
      + renderFittedText(laneX + 25, y + h / 2, roleTag, {
        maxPx: 59,
        idealSize: 7.1,
        maxLines: 2,
        minSize: 4.9,
        fill: c,
        weight: 700,
        lineHeightRatio: 1.18,
      });

    const showSub = Boolean(sub) && h >= 32;
    const cardMaxPx = laneW - 106;
    const taskCard = tintedCard(laneX + 93, y + 3, laneW - 99, h - 6, c, { rx: 4.5, opacity: 0.08, strokeWidth: 1.05 })
      + renderFittedText(laneX + 100, showSub ? y + h * 0.35 : y + h / 2, node.label, {
        maxPx: cardMaxPx,
        idealSize: 7.9,
        maxLines: 1,
        minSize: 5.4,
        fill: pal.inkDark,
        weight: 700,
      })
      + (showSub
        ? renderFittedText(laneX + 100, y + h * 0.72, sub, {
            maxPx: cardMaxPx,
            idealSize: 6.4,
            maxLines: 1,
            minSize: 4.8,
            fill: pal.inkMuted,
          })
        : '');

    let downConnector = '';
    if (i < count - 1) {
      const nextY = topY + (i + 1) * laneH + 3;
      const edge = item.edges.find(e => e.source === node.id && e.target === lanes[i + 1].id);
      downConnector = `<line x1="212" y1="${(y + h - 3).toFixed(1)}" x2="212" y2="${(nextY - 2).toFixed(1)}" stroke="${pal.primary}" stroke-width="1.25"/>`
        + arrowHead(212, nextY, 'down', pal.primary, 3.8)
        + (edge?.label && !isLineOfVisibility ? pillTag(268, (y + h - 3 + nextY) / 2, edge.label, pal.secondary, 54, 5.8) : '');
    }

    return laneBg + headerPill + taskCard + downConnector;
  }).join('');

  const topMidY = topY + (laneH - 5) / 2;
  const botMidY = topY + (count - 1) * laneH + (laneH - 5) / 2;
  const feedbackRail = `<path d="M ${laneX + laneW - 2} ${botMidY.toFixed(1)} H 341 V ${topMidY.toFixed(1)} H ${laneX + laneW + 2}" stroke="${pal.opposite}" stroke-width="1.35" stroke-dasharray="3.5 2.5"/>`
    + arrowHead(laneX + laneW - 2, topMidY, 'left', pal.opposite, 4.1)
    + `<rect x="330" y="96" width="21" height="58" rx="10.5" fill="#FFFFFF" stroke="${pal.opposite}" stroke-opacity="0.65" stroke-width="0.9"/>`
    + textEl(340.5, 111, '反', { size: 7.2, fill: pal.opposite, weight: 700, anchor: 'middle' })
    + textEl(340.5, 122, '馈', { size: 7.2, fill: pal.opposite, weight: 700, anchor: 'middle' })
    + textEl(340.5, 133, '闭', { size: 7.2, fill: pal.opposite, weight: 700, anchor: 'middle' })
    + textEl(340.5, 144, '环', { size: 7.2, fill: pal.opposite, weight: 700, anchor: 'middle' });

  return lanesMarkup + feedbackRail;
}

export function renderDiagramExampleSvg(item: DiagramExampleSpec, ink: FigureInk = '#0F766E'): string {
  const pal = resolvePalette(ink);
  const archetype = resolveExampleArchetype(item);

  let body = '';
  switch (archetype) {
    case 'sem_path':
      body = renderSemPath(item, pal);
      break;
    case 'mediation_moderation':
      body = renderMediationModeration(item, pal);
      break;
    case 'prisma_funnel':
      body = renderPrismaFunnel(item, pal);
      break;
    case 'system_pipeline_inset':
      body = renderSystemPipelineInset(item, pal);
      break;
    case 'partition_matrix':
      body = renderPartitionMatrix(item, pal);
      break;
    case 'evolutionary_game':
      body = renderEvolutionaryGame(item, pal);
      break;
    case 'tree_branch':
      body = renderTreeBranch(item, pal);
      break;
    case 'swimlane_loop':
      body = renderSwimlaneLoop(item, pal);
      break;
    case 'roadmap_dual':
    default:
      body = renderRoadmapDual(item, pal);
      break;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 228" width="360" height="228" fill="none">`
    + `<rect x="0" y="0" width="360" height="228" rx="8" fill="${pal.paperBg}"/>`
    + renderHeaderBanner(item, archetype, pal)
    + body
    + `</svg>`;
}
