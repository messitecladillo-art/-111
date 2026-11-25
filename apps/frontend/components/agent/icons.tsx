import type { ReactNode } from 'react';
import {
  EvixIcon,
  isEvixIconId,
  type EvixIconId,
  type EvixIconVariant,
} from '@/components/icons/EvixIcons';
import type { RoomId } from '@/lib/agent/rooms';

export { EvixIcon, EVIX_ICON_IDS, EVIX_ICON_LABELS, isEvixIconId, type EvixIconId, type EvixIconVariant } from '@/components/icons/EvixIcons';

export const ROOM_EVIX_ICON: Record<RoomId, EvixIconId> = {
  overview: 'overview',
  diagnose: 'literature',
  rules: 'compliance',
  design: 'questionnaire',
  sampling: 'sampling',
  analysis: 'modeling',
  canvas: 'cooccurrence',
  editor: 'editorial',
  defense: 'defense',
  cases: 'page-grid',
  silicon: 'silicon',
  exam: 'causal-scale',
  preflight: 'blind-mask',
  workspace: 'cloud-sync',
  services: 'prism',
};

export const STUDIO_HUB_EVIX_ICON: Record<'visual' | 'data_collect' | 'writing' | 'defense' | 'library', EvixIconId> = {
  visual: 'chart-studio',
  data_collect: 'questionnaire',
  writing: 'polish',
  defense: 'judge-qa',
  library: 'page-grid',
};

const SEMANTIC_EVIX_BRIDGE: Partial<Record<string, EvixIconId>> = {
  spark: 'prism',
  grid: 'overview',
  book: 'literature',
  chart: 'modeling',
  cloud: 'cloud-sync',
  lamp: 'causal-scale',
};

/** Crisp 24×24 chrome & directional glyphs paired with the 32-icon Editorial Duotone system. */
const CHROME_PATHS: Record<string, ReactNode> = {
  chat: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5v-9Z" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>,
  folder: <path d="M3.5 7V6a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7Z" />,
  monitor: <><rect x="3.5" y="4.5" width="17" height="11.5" rx="2" /><path d="M9 20h6M12 16v4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>,
  bolt: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="m7 10 5 5 5-5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  sidebar: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9.5 4.5v15" /></>,
  panel: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M14.5 4.5v15" /></>,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  expand: <path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" />,
  shrink: <path d="M4 14h6v6M20 10h-6V4M20 4l-6 6M4 20l6-6" />,
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  home: <><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z" /><path d="M9.5 20.5v-6h5v6" /></>,
  more: <><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></>,
};

function sanitizeChromeTitle(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/[\u300c\u300e]/gu, '“')
    .replace(/[\u300d\u300f]/gu, '”')
    .replace(/\u3010([^\u3011]+)\u3011/gu, '（$1）')
    .replace(/[{}]/gu, '')
    .trim();
  return cleaned || undefined;
}

export function Icon({
  name,
  variant = 'duotone',
  size = 16,
  className,
  title,
}: {
  name: EvixIconId | keyof typeof CHROME_PATHS | string;
  variant?: EvixIconVariant;
  size?: number;
  className?: string;
  title?: string;
}) {
  const cleanTitle = sanitizeChromeTitle(title);
  if (isEvixIconId(name)) {
    return <EvixIcon name={name} variant={variant} size={size} className={className} title={cleanTitle} />;
  }
  const bridged = SEMANTIC_EVIX_BRIDGE[name];
  if (bridged) {
    return <EvixIcon name={bridged} variant={variant} size={size} className={className} title={cleanTitle} />;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={size <= 16 ? '1.85' : '1.75'}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      focusable="false"
      role={cleanTitle ? 'img' : undefined}
      aria-label={cleanTitle}
      aria-hidden={cleanTitle ? undefined : 'true'}
    >
      {cleanTitle ? <title>{cleanTitle}</title> : null}
      {CHROME_PATHS[name] ?? CHROME_PATHS.more}
    </svg>
  );
}
