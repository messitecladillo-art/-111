import type { CSSProperties, ReactNode } from 'react';

/**
 * 证见 EVI-X · 专属小图标 UI 系统（32 枚出版级双色精密线性微图标）
 *
 * 设计语法：Editorial Duotone Line
 * - 基准画布：24×24px 光学栅格（2px 安全内边距，20×20 核心光学区）
 * - 描边规范：strokeWidth = 1.75（<=16px 自动微调至 1.85），圆角端点与圆角折角
 * - 色彩语义：深墨结构线（#181C22 / currentColor）+ 林青学术双色层（#0F766E）+ 暖金循证锚点（#C4933F）
 */
export const EVIX_ICON_IDS = [
  // 01 · 品牌与研究主流程（16 枚）
  'prism',
  'overview',
  'literature',
  'cooccurrence',
  'questionnaire',
  'sampling',
  'silicon',
  'modeling',
  'ipa',
  'editorial',
  'page-grid',
  'chart-studio',
  'compliance',
  'provenance',
  'defense',
  'judge-qa',
  // 02 · 纸面微操作、统计图种与合规同步（16 枚）
  'polish',
  'redraw',
  'swap-chart',
  'export-hd',
  'likert',
  'silhouette',
  'forest',
  'kmeans',
  'booktabs',
  'formula',
  'page-frame',
  'fingerprint',
  'blind-mask',
  'causal-scale',
  'page-limit',
  'cloud-sync',
] as const;

export type EvixIconId = (typeof EVIX_ICON_IDS)[number];

export type EvixIconVariant = 'outline' | 'duotone' | 'tile';

export const EVIX_ICON_LABELS: Record<EvixIconId, string> = {
  prism: '证见棱镜',
  overview: '研究总览',
  literature: '选题文献',
  cooccurrence: '词共现网络',
  questionnaire: '问卷设计',
  sampling: '分层抽样',
  silicon: '样本预演',
  modeling: '统计建模',
  ipa: '重要度表现矩阵',
  editorial: '论文精修',
  'page-grid': '全书鸟瞰',
  'chart-studio': '图表工坊',
  compliance: '规范核验',
  provenance: '证据溯源',
  defense: '答辩路演',
  'judge-qa': '评委追问',
  polish: '段落润色',
  redraw: '重绘此图',
  'swap-chart': '切换图种',
  'export-hd': '高清导出',
  likert: '量表分布图',
  silhouette: '人群分布图',
  forest: '效应森林图',
  kmeans: '分群聚类',
  booktabs: '学术三线表',
  formula: '数学公式',
  'page-frame': '页框装饰',
  fingerprint: '数据一致性校验',
  'blind-mask': '盲审脱敏',
  'causal-scale': '因果克制',
  'page-limit': '篇幅核查',
  'cloud-sync': '云端同步',
};

function sanitizeIconTitle(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/[\u300c\u300e]/gu, '“')
    .replace(/[\u300d\u300f]/gu, '”')
    .replace(/\u3010([^\u3011]+)\u3011/gu, '（$1）')
    .replace(/[{}]/gu, '')
    .trim();
  return cleaned || undefined;
}

const EVIX_ICON_SET: ReadonlySet<string> = new Set<string>(EVIX_ICON_IDS);

export function isEvixIconId(value: string): value is EvixIconId {
  return EVIX_ICON_SET.has(value);
}

type Palette = {
  ink: string;
  tealFill: string;
  tealStroke: string;
  gold: string;
  goldSoft: string;
};

function resolvePalette(variant: EvixIconVariant, tone: 'default' | 'on-dark'): Palette {
  if (variant === 'outline') {
    return {
      ink: 'currentColor',
      tealFill: 'none',
      tealStroke: 'currentColor',
      gold: 'currentColor',
      goldSoft: 'none',
    };
  }
  if (tone === 'on-dark') {
    return {
      ink: 'var(--evix-icon-on-dark, #F8FAFC)',
      tealFill: 'rgba(45, 212, 191, 0.24)',
      tealStroke: '#5EEAD4',
      gold: '#E0B25B',
      goldSoft: 'rgba(224, 178, 91, 0.24)',
    };
  }
  return {
    ink: 'var(--evix-icon-ink, currentColor)',
    tealFill: 'var(--evix-icon-teal-fill, rgba(15, 118, 110, 0.22))',
    tealStroke: 'var(--evix-icon-teal, #0F766E)',
    gold: 'var(--evix-icon-gold, #C4933F)',
    goldSoft: 'var(--evix-icon-gold-soft, rgba(196, 147, 63, 0.24))',
  };
}

function renderEvixGlyph(name: EvixIconId, p: Palette): ReactNode {
  switch (name) {
    // 01 · 品牌与研究主流程（16 枚）
    case 'prism':
      return (
        <>
          <path d="M14.6 9.6H20.5L12 20.2 14.6 9.6Z" fill={p.tealFill} stroke="none" />
          <path d="M7.2 4.5h9.6l3.7 5.1L12 20.2 3.5 9.6l3.7-5.1Z" stroke={p.ink} />
          <path d="M3.5 9.6h17" stroke={p.ink} />
          <path d="M7.2 4.5 9.4 9.6 12 20.2l2.6-10.6 2.2-5.1" stroke={p.tealStroke} />
          <circle cx="12" cy="12.3" r="1.15" fill={p.gold} stroke="none" />
        </>
      );

    case 'overview':
      return (
        <>
          <rect x="4.2" y="4.2" width="6.6" height="6.6" rx="1.6" stroke={p.ink} />
          <rect x="13.2" y="4.2" width="6.6" height="6.6" rx="1.6" fill={p.tealFill} stroke={p.tealStroke} />
          <rect x="4.2" y="13.2" width="6.6" height="6.6" rx="1.6" stroke={p.ink} />
          <rect x="13.2" y="13.2" width="6.6" height="6.6" rx="1.6" stroke={p.ink} />
          <circle cx="7.5" cy="7.5" r="1" fill={p.gold} stroke="none" />
          <circle cx="16.5" cy="16.5" r="1" fill={p.gold} stroke="none" />
        </>
      );

    case 'literature':
      return (
        <>
          <path d="M12 6.2c2.5-1.5 5.3-1.5 8-.7v12.6c-2.7-.8-5.5-.8-8 .7V6.2Z" fill={p.tealFill} stroke="none" />
          <path d="M12 6.2c-2.5-1.5-5.3-1.5-8-.7v12.6c2.7-.8 5.5-.8 8 .7 2.5-1.5 5.3-1.5 8-.7V5.5c-2.7-.8-5.5-.8-8 .7Z" stroke={p.ink} />
          <path d="M12 6.2v12.6" stroke={p.ink} />
          <path d="M6.5 9.5h3.2M6.5 12.5h3.2" stroke={p.ink} />
          <path d="M16 9.2l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" fill={p.gold} stroke={p.tealStroke} strokeWidth="1.2" />
        </>
      );

    case 'cooccurrence':
      return (
        <>
          <path d="M7.6 11.6 10.2 8M8.1 13.1l5.2 4.1M11.8 7.5l3.5-.8M16.2 8.7l-1.5 7.5M15.8 17.2l2.2-2.6M11.6 8.3l6.1 4.6" stroke={p.ink} />
          <circle cx="6.2" cy="12.5" r="2.3" fill={p.tealFill} stroke={p.tealStroke} />
          <circle cx="16.6" cy="6.4" r="2.2" fill={p.goldSoft} stroke={p.gold} />
          <circle cx="14.4" cy="18" r="2.0" fill={p.tealFill} stroke={p.ink} />
          <circle cx="10.8" cy="7.4" r="1.45" fill="none" stroke={p.ink} />
          <circle cx="18.6" cy="13.6" r="1.45" fill="none" stroke={p.tealStroke} />
        </>
      );

    case 'questionnaire':
      return (
        <>
          <rect x="4" y="4" width="11.2" height="16" rx="2.1" fill={p.tealFill} stroke={p.ink} />
          <path d="m6.6 8.2 1.2 1.2 2.1-2.2" stroke={p.tealStroke} />
          <path d="M11.2 8.2h2.2M6.8 12h6.6M6.8 15.5h4.8" stroke={p.ink} />
          <path d="M15.2 8.5h2.2a1.8 1.8 0 0 1 1.8 1.8v4.2" stroke={p.tealStroke} />
          <path d="m17.5 13 1.7 1.8 1.7-1.8" stroke={p.tealStroke} />
          <circle cx="19.2" cy="17.8" r="1.45" fill={p.gold} stroke="none" />
        </>
      );

    case 'sampling':
      return (
        <>
          <path d="M12 4.4 14.7 9.6H9.3L12 4.4Z" fill={p.goldSoft} stroke="none" />
          <path d="M9.3 9.6h5.4l2.5 4.9H6.8l2.5-4.9Z" fill={p.tealFill} stroke="none" />
          <path d="M12 4.4 19.6 19.2H4.4L12 4.4Z" stroke={p.ink} />
          <path d="M9.3 9.6h5.4M6.8 14.5h10.4" stroke={p.ink} />
          <circle cx="16.8" cy="7.2" r="1.05" fill={p.gold} stroke="none" />
          <circle cx="18.8" cy="11.8" r="1.05" fill={p.gold} stroke="none" />
        </>
      );

    case 'silicon':
      return (
        <>
          <circle cx="12" cy="9.2" r="2.7" fill={p.tealFill} stroke={p.ink} />
          <path d="M7.3 18.4a4.7 4.7 0 0 1 9.4 0" stroke={p.ink} />
          <circle cx="6.8" cy="10.2" r="2" stroke={p.ink} />
          <path d="M3.8 17.6a3.4 3.4 0 0 1 3.4-3" stroke={p.ink} />
          <circle cx="17.2" cy="10.2" r="2" stroke={p.ink} />
          <path d="M20.2 17.6a3.4 3.4 0 0 0-3.4-3" stroke={p.ink} />
          <circle cx="12" cy="18.4" r="1.4" fill={p.tealFill} stroke={p.tealStroke} />
          <circle cx="15" cy="5.2" r="1.1" fill={p.gold} stroke="none" />
        </>
      );

    case 'modeling':
      return (
        <>
          <path d="M5.6 18.4c2.4 0 3.3-10.2 5.9-10.2s3.5 10.2 6.5 10.2H5.6Z" fill={p.tealFill} stroke="none" />
          <path d="M4.5 4.8v14.4h15" stroke={p.ink} />
          <path d="M5.6 18.4c2.4 0 3.3-10.2 5.9-10.2s3.5 10.2 6.5 10.2" stroke={p.ink} />
          <path d="M6.2 18c3.8-.4 5.4-8.2 12.6-9" stroke={p.tealStroke} />
          <circle cx="11.5" cy="8.2" r="1.3" fill={p.gold} stroke="none" />
        </>
      );

    case 'ipa':
      return (
        <>
          <rect x="12" y="4.5" width="7.5" height="7.5" rx="1" fill={p.tealFill} stroke="none" />
          <path d="M12 4.5v15M4.5 12h15" stroke={p.ink} />
          <circle cx="7.2" cy="7.2" r="1.5" fill={p.gold} stroke="none" />
          <circle cx="15.8" cy="8.2" r="1.35" fill={p.tealStroke} stroke="none" />
          <circle cx="8.4" cy="15.6" r="1.15" fill={p.ink} stroke="none" />
          <circle cx="15.4" cy="15.6" r="1.2" fill={p.tealStroke} stroke="none" />
        </>
      );

    case 'editorial':
      return (
        <>
          <path d="M6 4.2h7.6l3.8 3.8v11.3a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V5.7A1.5 1.5 0 0 1 6 4.2Z" stroke={p.ink} />
          <path d="M13.5 4.2V8h3.9" stroke={p.ink} />
          <path d="M7.5 17h3.2" stroke={p.tealStroke} />
          <path d="m12.8 16.6 1.8-4.2 4-4 2.1 2.1-4 4-3.9 2.1Z" fill={p.tealFill} stroke={p.ink} />
          <circle cx="14.2" cy="15" r="0.95" fill={p.gold} stroke="none" />
        </>
      );

    case 'page-grid':
      return (
        <>
          <rect x="4" y="4.2" width="4.4" height="6.8" rx="0.9" fill={p.tealFill} stroke={p.tealStroke} />
          <rect x="9.8" y="4.2" width="4.4" height="6.8" rx="0.9" stroke={p.ink} />
          <rect x="15.6" y="4.2" width="4.4" height="6.8" rx="0.9" stroke={p.ink} />
          <rect x="4" y="13" width="4.4" height="6.8" rx="0.9" stroke={p.ink} />
          <rect x="9.8" y="13" width="4.4" height="6.8" rx="0.9" stroke={p.ink} />
          <rect x="15.6" y="13" width="4.4" height="6.8" rx="0.9" stroke={p.ink} />
          <circle cx="17.8" cy="16.4" r="0.95" fill={p.gold} stroke="none" />
        </>
      );

    case 'chart-studio':
      return (
        <>
          <path d="M4.6 5v14.2h14.6" stroke={p.ink} />
          <path d="M12 8.2c2.1 2.7 3.1 4.3 3.1 5.9a3.1 3.1 0 1 1-6.2 0c0-1.6 1-3.2 3.1-5.9Z" fill={p.tealFill} stroke={p.tealStroke} />
          <path d="M17.5 5.2l.55 1.45 1.45.55-1.45.55-.55 1.45-.55-1.45-1.45-.55 1.45-.55.55-1.45Z" fill={p.gold} stroke="none" />
        </>
      );

    case 'compliance':
      return (
        <>
          <path d="M12 3.8 18.6 6.4v5.2c0 4.3-2.8 7.3-6.6 8.8-3.8-1.5-6.6-4.5-6.6-8.8V6.4L12 3.8Z" fill={p.tealFill} stroke={p.ink} />
          <path d="m9.2 12.1 2 2.1 4-4.2" stroke={p.tealStroke} />
          <circle cx="17.6" cy="17.2" r="1.45" fill={p.gold} stroke="none" />
        </>
      );

    case 'provenance':
      return (
        <>
          <path d="M9.6 14.4l-1.6 1.6a3 3 0 0 1-4.2-4.2l3-3a3 3 0 0 1 4.2 0" stroke={p.ink} />
          <path d="M10.8 9.6l1.5-1.5a3 3 0 0 1 4.2 4.2l-.7.7" stroke={p.ink} />
          <circle cx="15.2" cy="15.2" r="3.4" fill={p.tealFill} stroke={p.tealStroke} />
          <path d="m17.7 17.7 2.5 2.5" stroke={p.ink} />
          <circle cx="7.2" cy="13.2" r="1" fill={p.gold} stroke="none" />
        </>
      );

    case 'defense':
      return (
        <>
          <rect x="5" y="5.2" width="14" height="10.4" rx="1.5" fill={p.tealFill} stroke={p.ink} />
          <path d="M4 5.2h16M12 15.6v4M9 20l3-3.4 3 3.4" stroke={p.ink} />
          <circle cx="9.6" cy="10.4" r="2.2" fill={p.tealStroke} stroke="none" />
          <path d="M13.8 9.2h2.8M13.8 11.8h2" stroke={p.gold} />
        </>
      );

    case 'judge-qa':
      return (
        <>
          <path d="M4.2 9.4a4.8 4.8 0 0 1 5.2-4.6h2a4.8 4.8 0 0 1 4.8 4.6 4.6 4.6 0 0 1-4.8 4.5H8.2l-3 2.3v-2.8a4.5 4.5 0 0 1-1-4Z" fill={p.tealFill} stroke={p.ink} />
          <path d="M9.4 8.2a1.3 1.3 0 0 1 2.4.6c0 .9-1.2 1.1-1.2 1.9" stroke={p.tealStroke} />
          <circle cx="10.6" cy="12.2" r="0.65" fill={p.tealStroke} stroke="none" />
          <path d="M13 14.2h3a3.8 3.8 0 0 1 3.8 3.6c0 1.2-.5 2.2-1.4 2.9v1.8l-2.3-1.5h-3.1a3.6 3.6 0 0 1-3.4-2.5" stroke={p.ink} />
          <path d="m13.8 16.5 1.3 1.3 2.4-2.5" stroke={p.gold} />
        </>
      );

    // 02 · 纸面微操作、图种与合规同步（16 枚）
    case 'polish':
      return (
        <>
          <rect x="4.2" y="6" width="10.8" height="2.8" rx="1" fill={p.tealFill} stroke="none" />
          <rect x="4.2" y="10.4" width="9.4" height="2.8" rx="1" fill={p.tealFill} stroke="none" />
          <path d="M5.2 7.4h8.6M5.2 11.8h7.2M5.2 16.2h5.2" stroke={p.ink} />
          <path d="m13.2 17.6 1.3-3.5 4.2-4.2 2 2-4.2 4.2-3.3 1.5Z" fill={p.goldSoft} stroke={p.ink} />
          <circle cx="18.2" cy="5.8" r="1.15" fill={p.gold} stroke="none" />
        </>
      );

    case 'redraw':
      return (
        <>
          <rect x="8.2" y="8.8" width="7.6" height="6.4" rx="1.2" fill={p.tealFill} stroke={p.tealStroke} />
          <path d="m9.4 14 2.1-2.2 1.6 1.6 1.5-1.4" stroke={p.tealStroke} />
          <circle cx="13.8" cy="10.7" r="0.85" fill={p.gold} stroke="none" />
          <path d="M5.2 10A7.4 7.4 0 0 1 18 7.4M18.8 14A7.4 7.4 0 0 1 6 16.6" stroke={p.ink} />
          <path d="M18.2 4.8v2.8h-2.8M5.8 19.2v-2.8h2.8" stroke={p.ink} />
        </>
      );

    case 'swap-chart':
      return (
        <>
          <path d="M4.2 11.2h6.8M5.6 11.2V8.2M7.8 11.2V5.6M10 11.2V7.2" stroke={p.tealStroke} />
          <path d="M13.5 7.5h5.2m-1.8-1.8 1.8 1.8-1.8 1.8" stroke={p.ink} />
          <path d="M10.5 16.5H5.3m1.8-1.8-1.8 1.8 1.8 1.8" stroke={p.ink} />
          <path d="M13.4 13v6.4h6.4" stroke={p.ink} />
          <circle cx="15.6" cy="16.8" r="1.05" fill={p.tealStroke} stroke="none" />
          <circle cx="18.2" cy="14.8" r="1.15" fill={p.gold} stroke="none" />
        </>
      );

    case 'export-hd':
      return (
        <>
          <rect x="5.6" y="5.6" width="12.8" height="12.8" rx="1.8" fill={p.tealFill} stroke={p.ink} />
          <path d="M12 8.4v5.8m-2.4-2.2L12 14.4l2.4-2.4" stroke={p.ink} />
          <path d="M9 16.2h6" stroke={p.tealStroke} />
          <circle cx="4.2" cy="4.2" r="0.85" fill={p.gold} stroke="none" />
          <circle cx="19.8" cy="19.8" r="0.85" fill={p.gold} stroke="none" />
        </>
      );

    case 'likert':
      return (
        <>
          <rect x="5.2" y="6" width="6.8" height="2.8" rx="0.7" fill={p.tealStroke} stroke="none" />
          <rect x="12" y="6" width="6.2" height="2.8" rx="0.7" fill={p.ink} stroke="none" />
          <rect x="7.2" y="10.6" width="4.8" height="2.8" rx="0.7" fill={p.tealFill} stroke={p.tealStroke} />
          <rect x="12" y="10.6" width="4.6" height="2.8" rx="0.7" stroke={p.ink} />
          <rect x="9" y="15.2" width="3" height="2.8" rx="0.7" fill={p.tealFill} stroke={p.tealStroke} />
          <rect x="12" y="15.2" width="3.2" height="2.8" rx="0.7" stroke={p.ink} />
          <path d="M12 4.2v15.6" stroke={p.gold} strokeDasharray="2 2" />
        </>
      );

    case 'silhouette':
      return (
        <>
          {[6.5, 12, 17.5].map((cx, i) => (
            <g key={`top-${cx}`}>
              <circle cx={cx} cy="7.2" r="1.5" fill={p.tealFill} stroke={p.tealStroke} />
              <path d={`M${cx - 2.1} 11.4a2.1 2.1 0 0 1 4.2 0`} stroke={p.tealStroke} />
              <circle cx={cx} cy="14.8" r="1.5" fill={i === 0 ? p.goldSoft : 'none'} stroke={i === 0 ? p.gold : p.ink} />
              <path d={`M${cx - 2.1} 19a2.1 2.1 0 0 1 4.2 0`} stroke={i === 0 ? p.gold : p.ink} />
            </g>
          ))}
        </>
      );

    case 'forest':
      return (
        <>
          <path d="M12 4.4v15.2" stroke={p.ink} strokeDasharray="2 2.2" />
          <path d="M5.4 8h8.2M5.4 6.9v2.2M13.6 6.9v2.2" stroke={p.tealStroke} />
          <circle cx="9.5" cy="8" r="1.45" fill={p.tealStroke} stroke="none" />
          <path d="M9.6 12h9M9.6 10.9v2.2M18.6 10.9v2.2" stroke={p.ink} />
          <circle cx="14.4" cy="12" r="1.5" fill={p.gold} stroke="none" />
          <path d="M6.2 16h8.4M6.2 14.9v2.2M14.6 14.9v2.2" stroke={p.tealStroke} />
          <circle cx="10.4" cy="16" r="1.45" fill={p.tealStroke} stroke="none" />
        </>
      );

    case 'kmeans':
      return (
        <>
          <circle cx="8.2" cy="8.6" r="3.6" fill={p.tealFill} stroke={p.tealStroke} strokeDasharray="2 2" />
          <circle cx="15.8" cy="8.6" r="3.6" fill={p.tealFill} stroke={p.tealStroke} strokeDasharray="2 2" />
          <circle cx="12" cy="15.8" r="3.6" fill="none" stroke={p.ink} strokeDasharray="2 2" />
          <circle cx="8.2" cy="8.6" r="1.2" fill={p.gold} stroke="none" />
          <circle cx="15.8" cy="8.6" r="1.2" fill={p.gold} stroke="none" />
          <circle cx="12" cy="15.8" r="1.2" fill={p.gold} stroke="none" />
        </>
      );

    case 'booktabs':
      return (
        <>
          <rect x="4.4" y="6" width="15.2" height="4.2" fill={p.tealFill} stroke="none" />
          <path d="M4.4 6h15.2M4.4 18h15.2" stroke={p.ink} strokeWidth="2.1" />
          <path d="M4.4 10.2h15.2" stroke={p.tealStroke} />
          <path d="M9.6 6v12" stroke={p.ink} />
          <circle cx="16.8" cy="14.2" r="1" fill={p.gold} stroke="none" />
        </>
      );

    case 'formula':
      return (
        <>
          <path d="M6.6 5.8H4.8v12.4h1.8M17.4 5.8h1.8v12.4h-1.8" stroke={p.tealStroke} />
          <path d="M14.8 7.6H9.2l3.4 4.4-3.4 4.4h5.6" stroke={p.ink} />
          <circle cx="16" cy="16.8" r="1.05" fill={p.gold} stroke="none" />
        </>
      );

    case 'page-frame':
      return (
        <>
          <path d="M6.6 4.6h7.6l3.6 3.6v11.2H6.6V4.6Z" stroke={p.ink} />
          <path d="M14.2 4.6v3.6h3.6" stroke={p.ink} />
          <path d="M4.6 8.4V4.6h3.8" stroke={p.tealStroke} />
          <path d="M19.4 15.6v3.8h-3.8" stroke={p.gold} />
        </>
      );

    case 'fingerprint':
      return (
        <>
          <path d="M7.2 10.5a4.8 4.8 0 0 1 9.6 0v1.2M5.2 12a6.8 6.8 0 0 1 13.2-2.2M9.2 12a2.8 2.8 0 0 1 5.6 0v2M11.6 11.8v5.6M8.8 14.2c0 1.8-.4 3.2-1.2 4.4" stroke={p.ink} />
          <rect x="13.8" y="14" width="6" height="5" rx="1.2" fill={p.tealFill} stroke={p.tealStroke} />
          <path d="M15.4 14v-1.2a1.4 1.4 0 0 1 2.8 0V14" stroke={p.gold} />
          <circle cx="16.8" cy="16.5" r="0.85" fill={p.gold} stroke="none" />
        </>
      );

    case 'blind-mask':
      return (
        <>
          <path d="M12 3.8 18.6 6.4v5.2c0 4.3-2.8 7.3-6.6 8.8-3.8-1.5-6.6-4.5-6.6-8.8V6.4L12 3.8Z" fill={p.tealFill} stroke={p.ink} />
          <path d="M8.2 11.8c1.1-1.8 2.4-2.6 3.8-2.6s2.7.8 3.8 2.6c-1.1 1.8-2.4 2.6-3.8 2.6s-2.7-.8-3.8-2.6Z" stroke={p.tealStroke} />
          <path d="m8.6 15.2 6.8-6.8" stroke={p.gold} />
        </>
      );

    case 'causal-scale':
      return (
        <>
          <path d="M12 5.4v13.8M8.6 19.2h6.8M6 8h12" stroke={p.ink} />
          <path d="m6 8-2.2 4.8h4.4L6 8ZM18 8l-2.2 4.8h4.4L18 8Z" stroke={p.tealStroke} />
          <path d="M3.8 12.8a2.2 2.2 0 0 0 4.4 0H3.8ZM15.8 12.8a2.2 2.2 0 0 0 4.4 0h-4.4Z" fill={p.tealFill} stroke={p.tealStroke} />
          <circle cx="12" cy="6.6" r="1.25" fill={p.gold} stroke="none" />
        </>
      );

    case 'page-limit':
      return (
        <>
          <rect x="5.4" y="4.4" width="13.2" height="15.2" rx="2" fill={p.tealFill} stroke={p.ink} />
          <path d="M5.4 8h2.6M5.4 11h2M5.4 14h2.6M5.4 17h2M10.8 4.4v15.2" stroke={p.ink} />
          <path d="M13.8 4.4v5.6l1.6-1.2 1.6 1.2V4.4" fill={p.goldSoft} stroke={p.gold} />
        </>
      );

    case 'cloud-sync':
      return (
        <>
          <path d="M7.2 18.2a4.2 4.2 0 0 1-.5-8.36A5.6 5.6 0 0 1 17.6 9a3.8 3.8 0 0 1-.4 9.2H7.2Z" fill={p.tealFill} stroke={p.ink} />
          <path d="M9.8 13.1a2.5 2.5 0 0 1 4.1-.7M14.2 14.9a2.5 2.5 0 0 1-4.1.7" stroke={p.tealStroke} />
          <circle cx="16.8" cy="10.2" r="0.95" fill={p.gold} stroke="none" />
        </>
      );
  }
}

export function EvixIcon({
  name,
  variant = 'duotone',
  tone = 'default',
  size = 16,
  className,
  title,
  style,
}: {
  name: EvixIconId;
  variant?: EvixIconVariant;
  tone?: 'default' | 'on-dark';
  size?: number;
  className?: string;
  title?: string;
  style?: CSSProperties;
}) {
  const strokeWidth = size <= 16 ? 1.85 : 1.75;
  const palette = resolvePalette(variant, tone);
  const cleanTitle = sanitizeIconTitle(title);
  const svg = (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      data-evix-icon={name}
      data-variant={variant}
      className={variant === 'tile' ? undefined : className}
      style={variant === 'tile' ? undefined : style}
      role={cleanTitle ? 'img' : undefined}
      aria-label={cleanTitle}
      aria-hidden={cleanTitle ? undefined : 'true'}
    >
      {cleanTitle ? <title>{cleanTitle}</title> : null}
      {renderEvixGlyph(name, palette)}
    </svg>
  );

  if (variant !== 'tile') return svg;

  const tileBox = Math.max(24, Math.round(size * 1.55));
  return (
    <span
      className={className}
      data-evix-tile={name}
      aria-hidden={cleanTitle ? undefined : 'true'}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: tileBox,
        height: tileBox,
        borderRadius: 8,
        background: 'var(--evix-icon-tile-bg, #E6F4F1)',
        color: 'var(--evix-icon-tile-fg, #0F766E)',
        flex: 'none',
        ...style,
      }}
    >
      {svg}
    </span>
  );
}
