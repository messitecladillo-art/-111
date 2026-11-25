'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACCENT } from '@/components/editors/PaperBlocks';
import type { EditorContent } from '@/lib/editor-model';
import { applyCoverImage, applyFrameImage, applySectionIllustration } from '@/lib/editor-model';
import { paletteFromPixels, parseFigurePalette, type FigurePalette } from '@/lib/figure-palette';
import {
  coverHasEmbeddedTitle,
  coverImageFromFile,
  frameImageFromFile,
  pageArtDataUrl,
  parseCoverImage,
  parseFrameImage,
  parseSectionIllustration,
  presetCoverImageFromBlob,
  sectionIllustrationDataUrl,
  sectionIllustrationFromBlob,
  type CoverImage,
  type FrameImage,
  type SectionIllustration,
} from '@/lib/page-art';
import { placeResult, targetSection } from '@/lib/report-placement';
import { appendRegisteredResult } from '@/lib/result-registration';
import { assertTrueVector } from '@/lib/svg-safety';
import { descriptiveInfographicSVG } from '@/lib/diagram-figures';
import {
  CLEAN_BACKDROP_PRESETS,
  COVER_TYPOGRAPHY_STYLE_OPTIONS,
  buildTransparentCoverTypographySvg,
  createInitialCoverLayeredState,
  requestBackendCoverAssembly,
  resolveCoverReferenceAnchors,
  svgToDataUrl,
  type CleanBackdropPreset,
  type CleanBackdropPresetId,
  type CoverInkMode,
  type CoverLayeredState,
  type CoverPipelineMode,
  type CoverTypographyStyle,
} from '@/lib/cover-assembly';
import {
  buildActionRoadmapPrompt,
  buildArtisticFramePrompt,
  buildDemographicInfographicPrompt,
  buildEmbeddedCoverPrompt,
  buildInfographicResultSnapshot,
  buildReportDrivenImagePrompt,
  buildStructuredSummaryCardPrompt,
  buildTopicOverviewAcademicTitle,
  COVER_CANDIDATE_PRESETS,
  extractDescriptivePanelsFromReport,
  FRAME_CANDIDATE_PRESETS,
  generateActionRoadmapArt,
  generateCoverCandidates,
  generateDemographicInfographicArt,
  generateDenseWordCloudArt,
  generateFrameCandidates,
  generateStructuredSummaryCardArt,
  IMAGE_GEN_MODELS,
  REPORT_IMAGE_TASKS,
  SHOWCASE_PAGE_ART_ASSETS,
  V3_OPEN_COVER_SHOWCASE,
  buildOpenArtDirectionBriefs,
  synthesizeDeterministicCoverArt,
  synthesizeDeterministicFrameArt,
  type CoverArtCandidateItem,
  type FrameArtCandidateItem,
  type OpenArtDirectionBrief,
  type ReportImageTaskId,
  type SummaryCardSlot,
  type V3OpenCoverShowcaseItem,
} from '@/lib/agent/image-gen-engine';
import styles from './Studio.module.css';

const MODE1_COVER_PRIORITY_IDS = [
  'cover-cand-f',
  'cover-cand-e',
  'cover-cand-c',
  'cover-cand-b',
  'cover-cand-d',
  'cover-cand-a',
] as const;

const MODE1_ORDERED_COVER_PRESETS = MODE1_COVER_PRIORITY_IDS.map(
  id => COVER_CANDIDATE_PRESETS.find(preset => preset.id === id)!,
).filter(Boolean);

const MODE2_BACKDROP_PRIORITY = ['f', 'e', 'c', 'b', 'd', 'a'] as const;

const BACKDROP_SHORT_LABELS: Readonly<Record<string, string>> = {
  f: '★ F · 晶透光学微距',
  e: 'E · 暖阳胶片大刊',
  c: 'C · 丹青朱砂竖排',
  b: 'B · 钴蓝瑞士蓝图',
  d: 'D · 靛蓝琥珀暗底',
  a: 'A · 宣纸青金行楷',
};

function getOrderedBackdropPresets(): CleanBackdropPreset[] {
  const ordered: CleanBackdropPreset[] = [];
  for (const key of MODE2_BACKDROP_PRIORITY) {
    const found = CLEAN_BACKDROP_PRESETS.find(p => String(p.id) === key);
    if (found) ordered.push(found);
  }
  for (const p of CLEAN_BACKDROP_PRESETS) {
    if (!ordered.some(o => o.id === p.id)) ordered.push(p);
  }
  return ordered;
}

async function detectBackdropInkModeFromDataUrl(dataUrl: string): Promise<CoverInkMode> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return 'dark_on_light';
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('load failed'));
      el.src = dataUrl;
    });
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext('2d');
    if (!ctx) return 'dark_on_light';
    ctx.drawImage(img, 0, 0, 32, 32);
    const data = ctx.getImageData(0, 0, 32, 18).data;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      count++;
    }
    return count > 0 && sum / count < 108 ? 'light_on_dark' : 'dark_on_light';
  } catch {
    return 'dark_on_light';
  }
}

const FRIENDLY_ENGINE_LABELS: Record<string, string> = {
  'gpt-image-1.5': '图文一体精排（推荐）',
  'gpt-image-2': '旗舰高精绘图',
  'chatgpt-image-latest': '智能版式排版',
  'gpt-image-1': '标准兼容模式',
  'dall-e-3': '编辑概念插画',
  'gemini-2.5-flash-image': '极速创意配图',
  'gemini-3-pro-image-preview': '超清精绘模式',
  'imagen-3.0-generate-002': '出版级插画模式',
};

function friendlyEngineLabel(spec: { id: string }): string {
  return FRIENDLY_ENGINE_LABELS[spec.id] ?? '智能配图模式';
}

function scrubCornerQuotes(text: string): string {
  return text
    .replace(/\u300c/gu, '“')
    .replace(/\u300d/gu, '”')
    .replace(/\u300e/gu, '‘')
    .replace(/\u300f/gu, '’')
    .replace(/[\u3010\u3011]/gu, '');
}

function sanitizeLayeredState(state: CoverLayeredState): CoverLayeredState {
  const cleanSvg = scrubCornerQuotes(state.vectorTypographySvg);
  return {
    ...state,
    competitionName: scrubCornerQuotes(state.competitionName),
    title: scrubCornerQuotes(state.title),
    subtitle: scrubCornerQuotes(state.subtitle),
    teamName: scrubCornerQuotes(state.teamName),
    vectorTypographySvg: cleanSvg,
    vectorTypographyDataUrl: cleanSvg === state.vectorTypographySvg ? state.vectorTypographyDataUrl : svgToDataUrl(cleanSvg),
  };
}

const STYLE_PRESETS = [
  { id: 'architectural', label: '🏛 建筑纸雕', clause: '采用温暖日光下的建筑多层纸雕浮雕质感，边缘锐利、纸纹清爽。' },
  { id: 'etching', label: '🖋 孔版版画', clause: '采用孔版与铜版套色版画质感，搭配暖白书纸与单一学科强调色。' },
  { id: 'diorama', label: '🧊 空间白模', clause: '采用清爽等距微缩建筑白模质感，搭配柔和日光与哑光纸板纹理。' },
  { id: 'infographic_flat', label: '👥 人物画像', clause: '采用温暖编辑级扁平人物画像配比卡片质感，辅以清爽米白纸底。' },
] as const;

type ShowcaseGalleryItem = {
  id: string;
  kind: 'cover' | 'frame' | 'demographic' | 'roadmap' | 'summary' | 'overview';
  url: string;
  title: string;
  subtitle: string;
  swatch: string;
  embeddedTitle?: boolean;
};

const EXACT_CHINESE_COLOR_NAMES: Readonly<Record<string, string>> = {
  '#0F766E': '松石青',
  '#0D9488': '松石青',
  '#115E59': '深林青',
  '#134E4A': '深林青',
  '#234E80': '深海靛',
  '#234E8C': '深海靛',
  '#1E3A8A': '深海靛',
  '#1D4ED8': '群青蓝',
  '#2563EB': '霁空蓝',
  '#8A3449': '丹绯红',
  '#8A3448': '丹绯红',
  '#9F1239': '绛朱红',
  '#881337': '胭脂绛',
  '#B45309': '琥珀金',
  '#D97706': '暖琥珀',
  '#C2410C': '赭石橙',
  '#334155': '岩板灰',
  '#475569': '石板灰',
  '#1E293B': '黛墨灰',
};

function formatChineseColorName(hex: string): string {
  const normalized = (hex || '').trim().toUpperCase();
  const exact = EXACT_CHINESE_COLOR_NAMES[normalized];
  if (exact) return exact;
  const clean = normalized.replace(/^#/u, '');
  const full =
    clean.length === 3
      ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
      : clean;
  if (!/^[0-9A-F]{6}$/u.test(full)) return '雅致主题色';
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 0.08) {
    if (l < 0.25) return '墨玉灰';
    if (l > 0.82) return '暖瓷白';
    return '岩板灰';
  }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  if (s < 0.14) return l < 0.42 ? '黛青灰' : '云母灰';
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  if (h < 18 || h >= 342) return l < 0.45 ? '丹绯红' : '朱砂红';
  if (h < 42) return '琥珀橙';
  if (h < 68) return '暖缃金';
  if (h < 152) return '竹篁绿';
  if (h < 196) return '松石青';
  if (h < 228) return '霁空蓝';
  if (h < 268) return '深海靛';
  if (h < 312) return '暮山紫';
  return '丹绯红';
}

const SUMMARY_SLOT_OPTIONS: readonly { slot: SummaryCardSlot; label: string }[] = [
  { slot: 'plan.measures', label: '第九章 · 分类支持路径卡' },
  { slot: 'intro.significance', label: '绪论 · 研究意义总结卡' },
  { slot: 'intro.innovation', label: '绪论 · 三维创新总结卡' },
  { slot: 'conclusion.findings', label: '第十章 · 实证发现总结卡' },
];

const SHOWCASE_GALLERY_ITEMS: readonly ShowcaseGalleryItem[] = [
  {
    id: 'showcase-cover-silver-illustrated',
    kind: 'cover',
    url: SHOWCASE_PAGE_ART_ASSETS.covers.silverIllustrated,
    title: '图文一体国奖封面',
    subtitle: '图文一体 · 题名入图',
    swatch: '#0F766E',
    embeddedTitle: true,
  },
  {
    id: 'showcase-cover-teal',
    kind: 'cover',
    url: SHOWCASE_PAGE_ART_ASSETS.covers.teal,
    title: '林青纸雕封面',
    subtitle: '顶部叠题 · 松石青',
    swatch: '#0F766E',
  },
  {
    id: 'showcase-cover-blue',
    kind: 'cover',
    url: SHOWCASE_PAGE_ART_ASSETS.covers.blue,
    title: '靛蓝白模封面',
    subtitle: '顶部叠题 · 深海靛',
    swatch: '#234E80',
  },
  {
    id: 'showcase-cover-burgundy',
    kind: 'cover',
    url: SHOWCASE_PAGE_ART_ASSETS.covers.burgundy,
    title: '绛红版画封面',
    subtitle: '顶部叠题 · 丹绯红',
    swatch: '#8A3449',
  },
  {
    id: 'showcase-frame-teal',
    kind: 'frame',
    url: SHOWCASE_PAGE_ART_ASSETS.frames.teal,
    title: '青绿流线页框',
    subtitle: '透明版心 · A4 页框',
    swatch: '#0F766E',
  },
  {
    id: 'showcase-frame-blue',
    kind: 'frame',
    url: SHOWCASE_PAGE_ART_ASSETS.frames.blue,
    title: '靛蓝几何页框',
    subtitle: '透明版心 · A4 页框',
    swatch: '#234E80',
  },
  {
    id: 'showcase-demo-silver',
    kind: 'demographic',
    url: SHOWCASE_PAGE_ART_ASSETS.demographics.silverProfile,
    title: '银发受访画像图',
    subtitle: '小人进度条 · 第4章',
    swatch: '#0F766E',
  },
  {
    id: 'showcase-demo-retail',
    kind: 'demographic',
    url: SHOWCASE_PAGE_ART_ASSETS.demographics.retailProfile,
    title: '闪仓客群画像图',
    subtitle: '小人进度条 · 第4章',
    swatch: '#234E80',
  },
  {
    id: 'showcase-roadmap-silver',
    kind: 'roadmap',
    url: SHOWCASE_PAGE_ART_ASSETS.roadmaps.silverAction,
    title: '协同治理路径图',
    subtitle: '实施机制 · 图9-1',
    swatch: '#0F766E',
  },
  {
    id: 'showcase-roadmap-retail',
    kind: 'roadmap',
    url: SHOWCASE_PAGE_ART_ASSETS.roadmaps.retailAction,
    title: '闪仓治理路径图',
    subtitle: '实施机制 · 图9-1',
    swatch: '#234E80',
  },
  {
    id: 'showcase-summary-support',
    kind: 'summary',
    url: SHOWCASE_PAGE_ART_ASSETS.summaries.classificationSupport,
    title: '分类支持总结卡',
    subtitle: '纯白四栏 · 第9章',
    swatch: '#0F766E',
  },
];

type RawSectionArt = {
  mime: 'image/png' | 'image/jpeg';
  data: string;
  widthPx: number;
  heightPx: number;
};

function isGptImageTypographyCapable(modelId: string): boolean {
  const spec = IMAGE_GEN_MODELS.find(m => m.id === modelId);
  const api = spec?.apiModel ?? modelId;
  return /^(?:gpt-image-|chatgpt-image-)/iu.test(api);
}

function buildStudioPromptForSelection(
  draft: EditorContent,
  selectedTask: ReportImageTaskId,
  secId: string,
  selectedModelId: string,
): string {
  if (isGptImageTypographyCapable(selectedModelId)) {
    switch (selectedTask) {
      case 'report_cover':
        return buildEmbeddedCoverPrompt({
          title: draft.title,
          subtitle: draft.subtitle,
          accent: draft.accent,
        });
      case 'report_frame':
        return buildArtisticFramePrompt({
          title: draft.title,
          accent: draft.accent,
        });
      case 'descriptive_infographic':
        return buildDemographicInfographicPrompt({
          content: draft,
          variant: 'profile',
        });
      case 'section_illustration':
        return buildActionRoadmapPrompt({
          content: draft,
        });
    }
  }
  return buildReportDrivenImagePrompt(draft, selectedTask, secId);
}

export default function ImageWorkshopStudio({
  content,
  onUpdateReport,
  onSaveArtifact,
  onJumpToSection,
}: {
  content: EditorContent;
  onUpdateReport: (next: EditorContent, message: string) => void;
  onSaveArtifact?: (title: string, svg: string) => void;
  onJumpToSection?: (sectionId: string) => void;
}) {
  const [task, setTask] = useState<ReportImageTaskId>('report_cover');
  const [modelId, setModelId] = useState<string>('gpt-image-1.5');
  const [providerReady, setProviderReady] = useState<Record<string, boolean>>({});
  const defaultSecId = useMemo(
    () =>
      content.report.find(s => /基本特征|样本结构|描述|样本|现状/u.test(s.title))?.id
      ?? content.report.find(s => !/^(?:封面|目录)/u.test(s.title))?.id
      ?? content.report[0]?.id
      ?? '',
    [content.report],
  );
  const [targetSectionId, setTargetSectionId] = useState<string>(defaultSecId);
  const [prompt, setPrompt] = useState<string>(() =>
    buildStudioPromptForSelection(content, 'report_cover', defaultSecId, 'gpt-image-1.5'),
  );
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [customModelName, setCustomModelName] = useState('');
  const [showGatewayConfig, setShowGatewayConfig] = useState(false);
  const [stylePresetId, setStylePresetId] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [summarySlot, setSummarySlot] = useState<SummaryCardSlot>('plan.measures');
  const [coverCandidates, setCoverCandidates] = useState<CoverArtCandidateItem[]>([]);
  const [frameCandidates, setFrameCandidates] = useState<FrameArtCandidateItem[]>([]);
  const [adoptedCoverCandId, setAdoptedCoverCandId] = useState<string | null>(null);
  const [adoptedFrameCandId, setAdoptedFrameCandId] = useState<string | null>(null);
  const [zoomCandidate, setZoomCandidate] = useState<{
    title: string;
    badge: string;
    src: string;
    isFrame?: boolean;
    darkCheckerboard?: boolean;
  } | null>(null);
  const zoomReturnFocusRef = useRef<HTMLElement | null>(null);
  const zoomCloseBtnRef = useRef<HTMLButtonElement | null>(null);

  const openZoomDialog = useCallback(
    (next: {
      title: string;
      badge: string;
      src: string;
      isFrame?: boolean;
      darkCheckerboard?: boolean;
    }) => {
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        zoomReturnFocusRef.current = document.activeElement;
      }
      setZoomCandidate(next);
    },
    [],
  );

  const closeZoomDialog = useCallback(() => {
    setZoomCandidate(null);
    const target = zoomReturnFocusRef.current;
    zoomReturnFocusRef.current = null;
    if (
      target
      && typeof document !== 'undefined'
      && target !== document.body
      && target.isConnected
      && typeof target.focus === 'function'
    ) {
      requestAnimationFrame(() => target.focus());
    }
  }, []);

  const isZoomOpen = zoomCandidate !== null;
  useEffect(() => {
    if (!isZoomOpen) return;
    zoomCloseBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeZoomDialog();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isZoomOpen, closeZoomDialog]);
  const [quickActionBusy, setQuickActionBusy] = useState<
    'cover' | 'frame' | 'demographic' | 'roadmap' | 'summary' | 'wordcloud' | 'assemble' | 'apply_layered' | null
  >(null);
  const [applyingPresetCoverId, setApplyingPresetCoverId] = useState<string | null>(null);
  const [layeredCover, setLayeredCover] = useState<CoverLayeredState>(() =>
    sanitizeLayeredState(
      createInitialCoverLayeredState({
        title: content.title?.trim() || '城市老年人智能健康监测服务采纳意愿实证研究',
        subtitle: content.subtitle,
        presetId: 'f',
        mode: 'direct_illustrated',
      }),
    ),
  );
  const [layeredTitleEdited, setLayeredTitleEdited] = useState(false);
  const [customBackdropB64, setCustomBackdropB64] = useState<string>('');
  const [customReferenceB64, setCustomReferenceB64] = useState<string>('');
  const [customInkMode, setCustomInkMode] = useState<CoverInkMode | null>(null);
  const [cachedLayeredArt, setCachedLayeredArt] = useState<{ cover: CoverImage; palette: FigurePalette } | null>(null);
  const [applyingShowcaseId, setApplyingShowcaseId] = useState<string | null>(null);
  const [liveImageUrl, setLiveImageUrl] = useState<string | null>(null);
  const [latestCoverArt, setLatestCoverArt] = useState<CoverImage | null>(null);
  const [latestCoverPalette, setLatestCoverPalette] = useState<FigurePalette | null>(null);
  const [latestFrameArt, setLatestFrameArt] = useState<FrameImage | null>(null);
  const [latestSectionArt, setLatestSectionArt] = useState<RawSectionArt | null>(null);
  const [detCoverPreview, setDetCoverPreview] = useState<{ coverImage: CoverImage; figurePalette: FigurePalette } | null>(null);
  const [detFramePreview, setDetFramePreview] = useState<FrameImage | null>(null);

  const [viewMode, setViewMode] = useState<'vector' | 'live'>('live');
  const [previewSvg, setPreviewSvg] = useState<string>('');
  const [status, setStatus] = useState(
    '支持一键生成图文一体国奖封面（正本+附录共用）、流动艺术页框、第4章人物画像图及第9章实施路径图。',
  );

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/agent/image-gen', { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((data: { providers?: Record<string, boolean> } | null) => {
        if (data?.providers) setProviderReady(data.providers);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  const accentHex = `#${(ACCENT[content.accent] || '0F766E').replace('#', '')}`;
  const stats = useMemo(() => extractDescriptivePanelsFromReport(content), [content]);
  const activeTaskSpec = REPORT_IMAGE_TASKS.find(t => t.id === task) ?? REPORT_IMAGE_TASKS[0];
  const activeModelSpec = IMAGE_GEN_MODELS.find(m => m.id === modelId) ?? IMAGE_GEN_MODELS[0];
  const isPageArtTask = task === 'report_cover' || task === 'report_frame';

  const reportSig = `${content.title}|${content.subtitle}|${content.accent}|${content.report.map(s => s.id).join(',')}|${(content.quality?.results.length ?? 0) > 0 ? '1' : '0'}`;
  const [syncedSig, setSyncedSig] = useState(reportSig);
  if (syncedSig !== reportSig) {
    setSyncedSig(reportSig);
    const preferDesc = content.report.find(s => /基本特征|样本结构|描述|样本|现状/u.test(s.title))?.id;
    const nextTarget =
      preferDesc && (!targetSectionId || targetSectionId === 'abstract' || !content.report.some(s => s.id === targetSectionId))
        ? preferDesc
        : !content.report.some(s => s.id === targetSectionId)
          ? defaultSecId
          : targetSectionId;
    if (nextTarget !== targetSectionId) setTargetSectionId(nextTarget);
    setPrompt(buildStudioPromptForSelection(content, task, nextTarget || defaultSecId, modelId));
    if (!layeredTitleEdited && content.title.trim()) {
      const fresh = sanitizeLayeredState(
        createInitialCoverLayeredState({
          title: content.title,
          subtitle: content.subtitle,
          competitionName: layeredCover.competitionName,
          presetId: layeredCover.selectedPresetId,
          typographyStyle: layeredCover.typographyStyle,
          mode: layeredCover.mode,
        }),
      );
      setLayeredCover(prev => ({
        ...fresh,
        backdropUrl: customBackdropB64 ? prev.backdropUrl : fresh.backdropUrl,
        referenceUrl: customReferenceB64 ? prev.referenceUrl : fresh.referenceUrl,
      }));
      setCachedLayeredArt(null);
    }
  }

  const semanticFigureTitle = useMemo(() => {
    if (task === 'descriptive_infographic') {
      return '受访者群体构成、接触状态与年龄分布画像图';
    }
    if (task === 'section_illustration') {
      return '多方协同治理与三十天试点实施机制路径图';
    }
    const baseTitle = (content.title || '研究报告').replace(/[（(].*?[）)]/gu, '').trim().slice(0, 20) || '研究报告';
    return `${baseTitle}${activeTaskSpec.label}`;
  }, [content.title, activeTaskSpec.label, task]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [coverBundle, frameBundle] = await Promise.all([
          synthesizeDeterministicCoverArt({ title: content.title, accent: content.accent }),
          synthesizeDeterministicFrameArt({ accent: content.accent }),
        ]);
        if (alive) {
          setDetCoverPreview(coverBundle);
          setDetFramePreview(frameBundle);
        }
      } catch {
        // Ignore transient errors
      }
    })();
    return () => {
      alive = false;
    };
  }, [content.title, content.accent]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const snap = await buildInfographicResultSnapshot({
          content,
          title: semanticFigureTitle,
          prompt,
        });
        const svg = assertTrueVector(descriptiveInfographicSVG(snap, content.figurePalette ?? accentHex));
        if (alive) {
          setPreviewSvg(svg);
        }
      } catch {
        // Ignore transient invalid intermediate state
      }
    })();
    return () => {
      alive = false;
    };
  }, [content, content.figurePalette, accentHex, semanticFigureTitle, prompt]);

  const resolvePreferredOpenAiModel = () =>
    modelId && IMAGE_GEN_MODELS.some(m => m.id === modelId && m.provider === 'openai_compatible')
      ? modelId
      : 'gpt-image-1.5';

  const handleSelectTask = (nextTask: ReportImageTaskId) => {
    setTask(nextTask);
    const spec = REPORT_IMAGE_TASKS.find(t => t.id === nextTask);
    const nextModel = spec?.recommendedModelId ?? modelId;
    if (spec?.recommendedModelId) setModelId(spec.recommendedModelId);
    setLiveImageUrl(null);
    setLatestCoverArt(null);
    setLatestCoverPalette(null);
    setLatestFrameArt(null);
    setLatestSectionArt(null);
    setViewMode('live');
    setStylePresetId(null);

    if (nextTask === 'section_illustration') {
      const measuresSec = content.report.find(s => /对策|措施|方案|落地/u.test(s.title));
      if (measuresSec) setTargetSectionId(measuresSec.id);
    } else if (nextTask === 'descriptive_infographic') {
      const descSec = content.report.find(s => /基本特征|样本结构|描述|样本/u.test(s.title));
      if (descSec) setTargetSectionId(descSec.id);
    }

    setPrompt(buildStudioPromptForSelection(content, nextTask, targetSectionId || defaultSecId, nextModel));
    setStatus(`已切换为“${spec?.label ?? nextTask}”并按当前报告上下文构建视觉创作方案。`);
  };

  const refreshPromptFromReport = () => {
    const nextPrompt = buildStudioPromptForSelection(content, task, targetSectionId || defaultSecId, modelId);
    setStylePresetId(null);
    setPrompt(nextPrompt);
    setStatus(`已从报告《${content.title || '当前课题'}》刷新“${activeTaskSpec.label}”画面描述。`);
  };

  const toggleStylePreset = (preset: (typeof STYLE_PRESETS)[number]) => {
    const cleaned = prompt
      .replace(/\n*视觉风格：[^\n]+$/u, '')
      .trimEnd();
    if (stylePresetId === preset.id) {
      setStylePresetId(null);
      setPrompt(cleaned);
      return;
    }
    setStylePresetId(preset.id);
    setPrompt(cleaned ? `${cleaned}\n${preset.clause}` : preset.clause);
  };

  /** 1. Parallel 3-Candidate Cover Generator (`A · 铜版水彩` / `B · 建筑纸雕` / `C · 现代智库几何`) — user compares & picks */
  const handleGenerateThreeCoverCandidates = async () => {
    setQuickActionBusy('cover');
    setTask('report_cover');
    setStatus('正在并行生成 6 套跨媒介“益普索杯”封面候选（首选晶透光学微距 + 宣纸青金 / 瑞士数据蓝图 / 丹青竖排 / 靛蓝剪纸 / 暖阳胶片），完成后供横向对比…');
    try {
      const result = await generateCoverCandidates({
        content,
        modelId: 'gpt-image-2',
        quality: 'high',
        apiKey: apiKey.trim() || undefined,
      });
      setCoverCandidates(result.candidates);
      if (result.candidates[0]) {
        setLatestCoverArt(result.candidates[0].coverImage);
        setLatestCoverPalette(result.candidates[0].figurePalette);
        setLiveImageUrl(pageArtDataUrl(result.candidates[0].coverImage));
        setViewMode('live');
      }
      setStatus('✓ 已并行生成 6 套跨风格“益普索杯”封面候选（默认推荐晶透光学玻璃静物微距风）！请在下方对比墙预览并点选“采纳此版”。');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '封面候选生成失败，可点击“预置 6 套封面对比”直接预览切换。');
    } finally {
      setQuickActionBusy(null);
    }
  };

  /** Instant load of pre-generated 6 flagship cover candidates */
  const handleLoadPresetCoverCandidates = async () => {
    setQuickActionBusy('cover');
    setTask('report_cover');
    setStatus('正在载入 6 套跨媒介“益普索杯”预置封面候选（默认推荐晶透光学玻璃静物微距风）…');
    try {
      const loaded = await Promise.all(
        COVER_CANDIDATE_PRESETS.map(async (preset): Promise<CoverArtCandidateItem> => {
          const res = await fetch(preset.staticAssetUrl);
          if (!res.ok) throw new Error(`候选封面加载失败 (${res.status})`);
          const blob = await res.blob();
          const { cover, palette } = await presetCoverImageFromBlob(
            blob,
            `国奖出版级 A4 图文一体封面候选（${preset.label}，题名字形在图中）`,
          );
          return {
            id: preset.id,
            label: preset.label,
            badge: preset.badge,
            styleId: preset.styleId,
            prompt: '',
            coverImage: cover,
            figurePalette: palette,
            resolvedModel: 'preset',
            mode: 'live_api',
          };
        }),
      );
      setCoverCandidates(loaded);
      setStatus('✓ 已载入 A / B / C 三套不同风格封面候选，请点击任意方案“采纳此版（正本+附录同步）”！');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '预置封面候选载入失败。');
    } finally {
      setQuickActionBusy(null);
    }
  };

  const handleAdoptCoverCandidate = (cand: CoverArtCandidateItem) => {
    setAdoptedCoverCandId(cand.id);
    setLatestCoverArt(cand.coverImage);
    setLatestCoverPalette(cand.figurePalette);
    setLiveImageUrl(pageArtDataUrl(cand.coverImage));
    setViewMode('live');
    const next = applyCoverImage(content, cand.coverImage, cand.figurePalette);
      onUpdateReport(
        next,
        `已采纳封面“${cand.label}”（正本与附录 1:1 同步），全篇统计图表色板已联动为${formatChineseColorName(cand.figurePalette.primary)}与${formatChineseColorName(cand.figurePalette.secondary)}。`,
      );
      setStatus(`✓ 已采纳“${cand.label}”作为正本与附录封面（联动${formatChineseColorName(cand.figurePalette.primary)}主题色）！`);
    };

    /** Shared helper to fetch, apply & sync any static A4 cover asset across report body + appendix */
    const applyPresetCoverByUrl = async (id: string, label: string, staticAssetUrl: string) => {
      setApplyingPresetCoverId(id);
      setTask('report_cover');
      setStatus(`正在载入并同步“${label}”至正本与附录卷封面…`);
      try {
        const res = await fetch(staticAssetUrl);
        if (!res.ok) throw new Error('封面预设素材暂时未能读取，请稍后重试。');
        const blob = await res.blob();
        const { cover, palette } = await presetCoverImageFromBlob(
          blob,
          `国奖出版级 A4 图文一体封面候选（${label}，题名字形在图中）`,
        );
        setAdoptedCoverCandId(id);
        setLatestCoverArt(cover);
        setLatestCoverPalette(palette);
        setLiveImageUrl(pageArtDataUrl(cover));
        setViewMode('live');
        const next = applyCoverImage(content, cover, palette);
        onUpdateReport(
          next,
          `已采纳封面“${label}”（正本与附录 1:1 同步），全篇统计图表色板已联动为${formatChineseColorName(palette.primary)}与${formatChineseColorName(palette.secondary)}。`,
        );
        setStatus(`✓ 已将“${label}”设为正本与附录封面（联动${formatChineseColorName(palette.primary)}主题色）！`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '封面预设应用失败。');
    } finally {
      setApplyingPresetCoverId(null);
    }
  };

  /** Mode 1: 1-Click preview & adopt any of the 6 cross-media direct illustrated covers (`F/E/C/B/D/A`) */
  const handleAdoptDirectPreset = async (preset: (typeof COVER_CANDIDATE_PRESETS)[number]) => {
    const existing = coverCandidates.find(c => c.id === preset.id);
    if (existing) {
      handleAdoptCoverCandidate(existing);
      return;
    }
    await applyPresetCoverByUrl(preset.id, preset.label, preset.staticAssetUrl);
  };

  const openBriefs = useMemo(
    () =>
      buildOpenArtDirectionBriefs({
        topic: content.title,
        subtitle: content.subtitle,
        accent: content.accent,
      }),
    [content.title, content.subtitle, content.accent],
  );

  const handleApplyOpenBrief = (brief: OpenArtDirectionBrief) => {
    setTask('report_cover');
    setPrompt(brief.prompt);
    setStatus(`✓ 已将“${brief.label}”主题自适应视觉创作方案填入生成框，可直接点击“生成高清配图预览”。`);
  };

  const handleJumpToLayeredFromShowcase = (item: V3OpenCoverShowcaseItem) => {
    setTask('report_cover');
    setCustomBackdropB64('');
    setCustomReferenceB64('');
    setCustomInkMode(item.inkMode);
    setCachedLayeredArt(null);
    setLayeredCover(prev =>
      recomputeLayeredTypography(
        prev,
        {
          mode: 'layered_assembly',
          referenceUrl: item.staticAssetUrl,
          backdropUrl: item.staticAssetUrl,
          typographyStyle: item.recommendedTypography,
        },
        item.inkMode,
      ),
    );
    setStatus(`✓ 已将精选示范“${item.label}”导入底图与题名精调面板，可直接智能排布题名。`);
  };

  /** Layered Cover Assembly state mutators */
  const setCoverPipelineMode = (nextMode: CoverPipelineMode) => {
    setTask('report_cover');
    setLayeredCover(prev => ({ ...prev, mode: nextMode }));
    setStatus(
      nextMode === 'layered_assembly'
        ? '已切换至底图与题名精调面板，支持 6 套对称无字底图切换、暗底浅金字形与透明矢量题名导出。'
        : '已切换至整页封面选型面板，6 套跨媒介第十七届国奖级封面可一键预览同步。',
    );
  };

  const recomputeLayeredTypography = (
    base: CoverLayeredState,
    patch: Partial<Pick<CoverLayeredState, 'competitionName' | 'title' | 'subtitle' | 'teamName' | 'typographyStyle' | 'selectedPresetId' | 'referenceUrl' | 'backdropUrl' | 'mode'>>,
    inkOverride: CoverInkMode | null = customInkMode,
  ): CoverLayeredState => {
    const merged = { ...base, ...patch };
    const preset = CLEAN_BACKDROP_PRESETS.find(p => p.id === merged.selectedPresetId) ?? CLEAN_BACKDROP_PRESETS[0];
    const effectiveInk: CoverInkMode =
      inkOverride
      ?? preset.inkMode
      ?? preset.anchors.inkMode
      ?? (preset.id === 'd' ? 'light_on_dark' : 'dark_on_light');
    const baseAnchors = resolveCoverReferenceAnchors(
      merged.typographyStyle,
      merged.typographyStyle === preset.defaultTypographyStyle
        ? { ...preset.anchors, inkMode: effectiveInk }
        : { inkMode: effectiveInk },
    );
    const anchors = { ...baseAnchors, inkMode: effectiveInk };
    const svg = scrubCornerQuotes(
      buildTransparentCoverTypographySvg({
        competitionName: scrubCornerQuotes(merged.competitionName),
        title: scrubCornerQuotes(merged.title),
        subtitle: scrubCornerQuotes(merged.subtitle),
        teamName: scrubCornerQuotes(merged.teamName),
        typographyStyle: merged.typographyStyle,
        anchors,
        inkMode: effectiveInk,
      }),
    );
    return {
      ...merged,
      competitionName: scrubCornerQuotes(merged.competitionName),
      title: scrubCornerQuotes(merged.title),
      subtitle: scrubCornerQuotes(merged.subtitle),
      teamName: scrubCornerQuotes(merged.teamName),
      inkMode: effectiveInk,
      anchors,
      vectorTypographySvg: svg,
      vectorTypographyDataUrl: svgToDataUrl(svg),
      assembledDataUrl: '',
      assembledSource: 'pending',
    };
  };

  const updateLayeredTextField = (
    field: 'competitionName' | 'title' | 'subtitle' | 'teamName',
    val: string,
  ) => {
    if (field === 'title' || field === 'subtitle') setLayeredTitleEdited(true);
    setCachedLayeredArt(null);
    setLayeredCover(prev => recomputeLayeredTypography(prev, { [field]: val }));
  };

  const handleSelectBackdropPreset = (presetId: CleanBackdropPresetId) => {
    const preset = CLEAN_BACKDROP_PRESETS.find(p => p.id === presetId) ?? CLEAN_BACKDROP_PRESETS[0];
    setCustomBackdropB64('');
    setCustomReferenceB64('');
    setCustomInkMode(null);
    setCachedLayeredArt(null);
    setLayeredCover(prev =>
      recomputeLayeredTypography(
        prev,
        {
          selectedPresetId: preset.id,
          referenceUrl: preset.referenceUrl,
          backdropUrl: preset.backdropUrl,
          typographyStyle: preset.defaultTypographyStyle,
        },
        null,
      ),
    );
    const isDark = preset.anchors.inkMode === 'light_on_dark' || String(preset.id) === 'd';
    setStatus(
      `已切换分层底图预设“${preset.label}”（${isDark ? '自动启用暗色棋盘格与暖金/象牙白矢量字形' : '匹配留白锚点与深墨矢量字形'}）。`,
    );
  };

  const handleJumpToLayeredFromMode1 = (candidateId: string) => {
    const shortKey = candidateId.replace(/^cover-cand-/u, '');
    const matched = CLEAN_BACKDROP_PRESETS.find(p => String(p.id) === shortKey) ?? CLEAN_BACKDROP_PRESETS[0];
    setTask('report_cover');
    setCustomBackdropB64('');
    setCustomReferenceB64('');
    setCustomInkMode(null);
    setCachedLayeredArt(null);
    setLayeredCover(prev =>
      recomputeLayeredTypography(
        prev,
        {
          mode: 'layered_assembly',
          selectedPresetId: matched.id,
          referenceUrl: matched.referenceUrl,
          backdropUrl: matched.backdropUrl,
          typographyStyle: matched.defaultTypographyStyle,
        },
        null,
      ),
    );
    setStatus(`✓ 已载入“${matched.label}”无字底图，可自由改写题名并导出透明矢量字稿。`);
  };

  const handleToggleLayeredInkMode = () => {
    const currentInk = customInkMode ?? layeredCover.anchors.inkMode;
    const nextInk: CoverInkMode = currentInk === 'light_on_dark' ? 'dark_on_light' : 'light_on_dark';
    setCustomInkMode(nextInk);
    setCachedLayeredArt(null);
    setLayeredCover(prev => recomputeLayeredTypography(prev, {}, nextInk));
    setStatus(
      nextInk === 'light_on_dark'
        ? '已切换为暗底浅金配色，棋盘格已切为暗色底，书法字形自动呈现暖金与象牙白。'
        : '已切换为明底墨字配色，棋盘格恢复浅色底，书法字形呈现深海墨色。',
    );
  };

  const handleSelectTypographyStyle = (style: CoverTypographyStyle) => {
    setCachedLayeredArt(null);
    setLayeredCover(prev => recomputeLayeredTypography(prev, { typographyStyle: style }));
  };

  const handleSyncLayeredFromReport = () => {
    setLayeredTitleEdited(false);
    setCachedLayeredArt(null);
    setLayeredCover(prev =>
      recomputeLayeredTypography(prev, {
        title: content.title || prev.title,
        subtitle: content.subtitle || prev.subtitle,
      }),
    );
    setStatus('✓ 已将当前报告标题与副标题同步至透明矢量艺术字图层。');
  };

  const handleCustomLayerUpload = (kind: 'backdrop' | 'reference', file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] ?? '' : '';
      if (!dataUrl || !b64) return;
      setCachedLayeredArt(null);
      if (kind === 'backdrop') {
        setCustomBackdropB64(b64);
        void detectBackdropInkModeFromDataUrl(dataUrl).then(detectedInk => {
          setCustomInkMode(detectedInk);
          setLayeredCover(prev =>
            recomputeLayeredTypography(
              prev,
              { backdropUrl: dataUrl },
              detectedInk,
            ),
          );
          setStatus(
            `✓ 已载入自定义无字背景底图“${file.name}”（自动识别为${detectedInk === 'light_on_dark' ? '暗色底图·暖金浅字' : '浅色底图·深墨字形'}），可点击“对照参照图智能组装”。`,
          );
        });
      } else {
        setCustomReferenceB64(b64);
        setLayeredCover(prev => ({
          ...prev,
          referenceUrl: dataUrl,
          assembledDataUrl: '',
          assembledSource: 'pending',
        }));
        setStatus(`✓ 已载入自定义参照图“${file.name}”，可点击“对照参照图智能组装”提取版式锚点。`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadLayeredTypographySvg = () => {
    if (!layeredCover.vectorTypographySvg) return;
    const blob = new Blob([layeredCover.vectorTypographySvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evix-cover-typography-${layeredCover.typographyStyle}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('✓ 已导出 1000×1414 透明背景矢量书法字稿。');
  };

  const resolveLayeredCoverAndPalette = async (): Promise<{
    cover: CoverImage;
    palette: FigurePalette;
    source: 'backend_bezier' | 'client_canvas';
  }> => {
    const styleLabel =
      COVER_TYPOGRAPHY_STYLE_OPTIONS.find(o => o.id === layeredCover.typographyStyle)?.shortLabel
      ?? layeredCover.typographyStyle;
    const effectiveInk: CoverInkMode = customInkMode ?? layeredCover.anchors.inkMode;
    const res = await requestBackendCoverAssembly({
      referencePreset: layeredCover.selectedPresetId,
      backdropPreset: layeredCover.selectedPresetId,
      backdropUrl: layeredCover.backdropUrl,
      ...(customBackdropB64 ? { backdropBase64: customBackdropB64 } : {}),
      ...(customReferenceB64 ? { referenceBase64: customReferenceB64 } : {}),
      competitionName: layeredCover.competitionName,
      title: layeredCover.title,
      subtitle: layeredCover.subtitle,
      teamName: layeredCover.teamName,
      typographyStyle: layeredCover.typographyStyle,
      anchors: layeredCover.anchors,
      inkMode: effectiveInk,
    });
    setLayeredCover(prev => ({
      ...prev,
      anchors: res.referenceAnalysis,
      vectorTypographySvg: res.vectorTypographySvg,
      vectorTypographyDataUrl: res.vectorTypographyDataUrl,
      assembledDataUrl: res.assembledDataUrl,
      assembledSource: res.source,
    }));

    let cover = res.coverImage;
    let palette = res.figurePalette;
    if (!cover || !palette) {
      const blob = await (await fetch(res.assembledDataUrl)).blob();
      const extracted = await presetCoverImageFromBlob(
        blob,
        `国奖出版级分层组装 A4 封面（${styleLabel}，题名字形在图中）`,
      );
      cover = cover ?? extracted.cover;
      palette = palette ?? extracted.palette;
    }
    const bundle = { cover, palette };
    setCachedLayeredArt(bundle);
    return { ...bundle, source: res.source };
  };

  const handleRunLayeredAssembly = async () => {
    setQuickActionBusy('assemble');
    setTask('report_cover');
    setStatus('正在对照参照图版式锚点执行无字底图 + 透明矢量书法艺术字高精合成…');
    try {
      const { cover, palette, source } = await resolveLayeredCoverAndPalette();
      setLatestCoverArt(cover);
      setLatestCoverPalette(palette);
      setLiveImageUrl(pageArtDataUrl(cover));
      setViewMode('live');
      setStatus(
        source === 'backend_bezier'
          ? `✓ 已完成高清矢量书法艺术字与底图分层组装（1000×1414，联动${formatChineseColorName(palette.primary)}主题色）！`
          : `✓ 已完成无字底图 + 透明矢量艺术字对位组装（1000×1414，联动${formatChineseColorName(palette.primary)}主题色）！`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '参照分层组装失败，请重试。');
    } finally {
      setQuickActionBusy(null);
    }
  };

  const handleApplyLayeredCover = async () => {
    setQuickActionBusy('apply_layered');
    setTask('report_cover');
    try {
      const resolved = cachedLayeredArt
        ? { ...cachedLayeredArt, source: layeredCover.assembledSource === 'backend_bezier' ? ('backend_bezier' as const) : ('client_canvas' as const) }
        : await resolveLayeredCoverAndPalette();
      setLatestCoverArt(resolved.cover);
      setLatestCoverPalette(resolved.palette);
      setLiveImageUrl(pageArtDataUrl(resolved.cover));
      setViewMode('live');
      const styleLabel =
        COVER_TYPOGRAPHY_STYLE_OPTIONS.find(o => o.id === layeredCover.typographyStyle)?.shortLabel
        ?? layeredCover.typographyStyle;
      const next = applyCoverImage(content, resolved.cover, resolved.palette);
      onUpdateReport(
        next,
        `已应用分层组装封面“${styleLabel}”（正本与附录 1:1 同步，全篇图表色板已联动为${formatChineseColorName(resolved.palette.primary)}与${formatChineseColorName(resolved.palette.secondary)}）。`,
      );
      setStatus(`✓ 已将参照分层组装成品设为正本与附录封面（联动${formatChineseColorName(resolved.palette.primary)}主题色）！`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '应用分层组装封面失败。');
    } finally {
      setQuickActionBusy(null);
    }
  };

  /** 2. Parallel 3-Candidate Frame Generator (`A · 植物水彩金线` / `B · 学院几何折线` / `C · 极简东方双线`) — user compares & picks */
  const handleGenerateThreeFrameCandidates = async () => {
    setQuickActionBusy('frame');
    setTask('report_frame');
    setStatus('正在并行生成 3 套不同风格透明 A4 学术页框候选（植物水彩 / 学院几何 / 东方双线），正文与页码保护区全透明…');
    try {
      const result = await generateFrameCandidates({
        content,
        modelId: 'gpt-image-2',
        quality: 'high',
        apiKey: apiKey.trim() || undefined,
      });
      setFrameCandidates(result.candidates);
      if (result.candidates[0]) {
        setLatestFrameArt(result.candidates[0].frameImage);
        setLiveImageUrl(pageArtDataUrl(result.candidates[0].frameImage));
        setViewMode('live');
      }
      setStatus('✓ 已并行生成 A / B / C 三套透明页框候选！请在下方并列卡片墙中对比点选（或选“无边框”）。');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '三套页框候选生成失败，可点击“载入预置 3 套页框候选”对比。');
    } finally {
      setQuickActionBusy(null);
    }
  };

  const handleLoadPresetFrameCandidates = async () => {
    setQuickActionBusy('frame');
    setTask('report_frame');
    setStatus('正在载入预置 A / B / C 三套透明艺术页框候选供并列对比…');
    try {
      const loaded = await Promise.all(
        FRAME_CANDIDATE_PRESETS.map(async (preset): Promise<FrameArtCandidateItem> => {
          const res = await fetch(preset.staticAssetUrl);
          if (!res.ok) throw new Error(`候选页框加载失败 (${res.status})`);
          const blob = await res.blob();
          const file = new File([blob], `${preset.id}.png`, { type: 'image/png' });
          const frame = await frameImageFromFile(
            file,
            `国奖出版级 A4 透明页框候选（${preset.label}）`,
          );
          return {
            id: preset.id,
            label: preset.label,
            badge: preset.badge,
            motifId: preset.motifId,
            prompt: '',
            frameImage: frame,
            resolvedModel: 'preset',
            mode: 'live_api',
          };
        }),
      );
      setFrameCandidates(loaded);
      setStatus('✓ 已载入 A / B / C 三套透明艺术页框候选（含“无边框”对比项），点击即可实时切换纸面效果！');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '预置页框候选载入失败。');
    } finally {
      setQuickActionBusy(null);
    }
  };

  const handleAdoptFrameCandidate = (cand: FrameArtCandidateItem | null) => {
    if (!cand) {
      setAdoptedFrameCandId('none');
      setLatestFrameArt(null);
      onUpdateReport(applyFrameImage(content, undefined), '已切换为“无边框”纯净素白正文页。');
      setStatus('✓ 已切换为“无边框”素白正文页。');
      return;
    }
    setAdoptedFrameCandId(cand.id);
    setLatestFrameArt(cand.frameImage);
    setLiveImageUrl(pageArtDataUrl(cand.frameImage));
    setViewMode('live');
    const next = applyFrameImage(content, cand.frameImage);
    onUpdateReport(next, `已采纳透明页框“${cand.label}”（正文版心与页码保护区 100% 透明）。`);
    setStatus(`✓ 已采纳“${cand.label}”至正文各页！`);
  };

  /** 3. One-Click GPT-Image-1.5 Respondent Persona + Silhouette Array + Progress-Bar Infographic */
  const handleOneClickDemographicInfographic = async () => {
    setQuickActionBusy('demographic');
    setTask('descriptive_infographic');
    const chosenModel = resolvePreferredOpenAiModel();
    setModelId(chosenModel);
    const demoPrompt = buildDemographicInfographicPrompt({ content, variant: 'profile' });
    setPrompt(demoPrompt);

    setStatus('正在按报告真实样本占比绘制受访者人物画像与占比图（绑定第4章）…');
    try {
      const explicitSec =
        targetSectionId && content.report.some(s => s.id === targetSectionId && !/^(?:摘要|目录)/u.test(s.title))
          ? targetSectionId
          : undefined;
      const result = await generateDemographicInfographicArt({
        content,
        variant: 'profile',
        sectionId: explicitSec,
        modelId: chosenModel,
        apiKey: apiKey.trim() || undefined,
        allowDeterministicFallback: true,
      });
      if (result.sectionIllustration) {
        setLatestSectionArt({
          mime: result.sectionIllustration.mime,
          data: result.sectionIllustration.data,
          widthPx: result.sectionIllustration.widthPx,
          heightPx: result.sectionIllustration.heightPx,
        });
        setLiveImageUrl(sectionIllustrationDataUrl(result.sectionIllustration));
        setViewMode('live');
      } else {
        setViewMode('vector');
      }
      const secTitle = result.content.report.find(s => s.id === result.sectionId)?.title ?? '样本基本特征章节';
      onUpdateReport(
        result.content,
        result.mode === 'live_api'
          ? `已生成受访者人物画像与占比图并写入“${secTitle}”，纸面预览与导出文档同步生效。`
          : `已更新“${secTitle}”受访者基本特征复合信息图（${result.fallbackReason || '标准矢量版'}）。`,
      );
      if (result.sectionId) onJumpToSection?.(result.sectionId);
      setStatus(
        result.mode === 'live_api'
          ? `✓ 已生成受访者人物画像与占比图并写入“${secTitle}”！`
          : `✓ ${result.fallbackReason || '已写入章节'}`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '人物画像图生成失败，请重试或选用精选画廊。');
    } finally {
      setQuickActionBusy(null);
    }
  };

  /** 4. One-Click GPT-Image-1.5 Chapter 9 Action Implementation Mechanism Diagram (`图 9-1`) */
  const handleOneClickActionRoadmap = async () => {
    setQuickActionBusy('roadmap');
    setTask('section_illustration');
    const chosenModel = resolvePreferredOpenAiModel();
    setModelId(chosenModel);
    const roadmapPrompt = buildActionRoadmapPrompt({ content });
    setPrompt(roadmapPrompt);

    setStatus('正在绘制第九章多方协同治理与试点实施机制图（绑定图 9-1）…');
    try {
      const measuresSec = content.report.find(s => /对策|措施|方案|落地/u.test(s.title));
      const result = await generateActionRoadmapArt({
        content,
        sectionId: measuresSec?.id,
        modelId: chosenModel,
        apiKey: apiKey.trim() || undefined,
        allowDeterministicFallback: true,
      });
      if (result.sectionIllustration) {
        setLatestSectionArt({
          mime: result.sectionIllustration.mime,
          data: result.sectionIllustration.data,
          widthPx: result.sectionIllustration.widthPx,
          heightPx: result.sectionIllustration.heightPx,
        });
        setLiveImageUrl(sectionIllustrationDataUrl(result.sectionIllustration));
        setViewMode('live');
      } else {
        setViewMode('vector');
      }
      const secTitle = result.content.report.find(s => s.id === result.sectionId)?.title ?? '对策方案章节';
      onUpdateReport(
        result.content,
        result.mode === 'live_api'
          ? `已生成第九章协同治理与试点实施机制图并绑定“${secTitle}”。`
          : `已更新“${secTitle}”实施路径图（${result.fallbackReason || '保留矢量流程图'}）。`,
      );
      if (result.sectionId) onJumpToSection?.(result.sectionId);
      setStatus(
        result.mode === 'live_api'
          ? `✓ 已生成协同治理与试点实施路径图并绑定“${secTitle}”！`
          : `✓ ${result.fallbackReason || '已写入对策章节'}`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '实施机制图生成失败，请重试或选用精选画廊。');
    } finally {
      setQuickActionBusy(null);
    }
  };

  /** 5. One-Click GPT-Image-2 Structured Summary Card (Figure-29 style: pure #FFFFFF, 3-4 cards, ①②③ bullets) */
  const handleOneClickStructuredSummary = async () => {
    setQuickActionBusy('summary');
    setTask('section_illustration');
    const chosenModel = 'gpt-image-2';
    setModelId(chosenModel);
    const sumPrompt = buildStructuredSummaryCardPrompt({ content, slot: summarySlot });
    setPrompt(sumPrompt);

    const slotLabel = SUMMARY_SLOT_OPTIONS.find(o => o.slot === summarySlot)?.label ?? summarySlot;
    setStatus(`正在生成“${slotLabel}”纯白四栏结构化总结卡并写入章节…`);
    try {
      const result = await generateStructuredSummaryCardArt({
        content,
        slot: summarySlot,
        modelId: chosenModel,
        apiKey: apiKey.trim() || undefined,
        allowDeterministicFallback: true,
      });
      if (result.sectionIllustration) {
        setLatestSectionArt({
          mime: result.sectionIllustration.mime,
          data: result.sectionIllustration.data,
          widthPx: result.sectionIllustration.widthPx,
          heightPx: result.sectionIllustration.heightPx,
        });
        setLiveImageUrl(sectionIllustrationDataUrl(result.sectionIllustration));
        setViewMode('live');
      } else {
        setViewMode('vector');
      }
      const secTitle = result.content.report.find(s => s.id === result.sectionId)?.title ?? slotLabel;
      onUpdateReport(
        result.content,
        result.mode === 'live_api'
          ? `已生成纯白结构化总结卡并写入“${secTitle}”，纸面预览、可编辑文档、演示文稿与学术排版稿同步生效。`
          : `已更新“${secTitle}”结构化总结卡（${result.fallbackReason || '本地矢量图版'}）。`,
      );
      if (result.sectionId) onJumpToSection?.(result.sectionId);
      setStatus(
        result.mode === 'live_api'
          ? `✓ 已生成结构化图文总结卡并写入“${secTitle}”！`
          : `✓ ${result.fallbackReason || '已写入对应章节'}`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '结构化总结卡生成失败，请重试。');
    } finally {
      setQuickActionBusy(null);
    }
  };

  /** 6. One-Click Backend Python High-Density Shaped Word Cloud (`POST /api/reports/wordcloud`) */
  const handleOneClickDenseWordCloud = async () => {
    setQuickActionBusy('wordcloud');
    setStatus('正在为您生成高密度轮廓词云图…');
    try {
      const result = await generateDenseWordCloudArt({
        content,
        shape: 'auto',
      });
      if (result.mode === 'live_api' && result.sectionIllustration) {
        setLatestSectionArt({
          mime: result.sectionIllustration.mime,
          data: result.sectionIllustration.data,
          widthPx: result.sectionIllustration.widthPx,
          heightPx: result.sectionIllustration.heightPx,
        });
        setLiveImageUrl(sectionIllustrationDataUrl(result.sectionIllustration));
        setViewMode('live');
        const secTitle = result.content.report.find(s => s.id === result.sectionId)?.title ?? '样本描述章节';
        onUpdateReport(
          result.content,
          `已将高密度图形词云绑定至“${secTitle}”（1280×720 纯白无外框）。`,
        );
        if (result.sectionId) onJumpToSection?.(result.sectionId);
        setStatus(`✓ 已生成并绑定高密度图形词云至“${secTitle}”！`);
      } else {
        setStatus(result.fallbackReason || '当前未检测到可用的词频数据，或词云生成服务暂不可用。');
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '高密度图形词云调用失败。');
    } finally {
      setQuickActionBusy(null);
    }
  };

  const handleApplyShowcaseItem = async (item: ShowcaseGalleryItem) => {
    setApplyingShowcaseId(item.id);
    setStatus(`正在载入国奖精选资产“${item.title}”并写入当前报告…`);
    try {
      const res = await fetch(item.url);
      if (!res.ok) throw new Error('精选画廊素材暂时未能读取，请稍后重试。');
      const blob = await res.blob();
      const fileName = item.url.split('/').pop() || 'showcase.png';

      if (item.kind === 'cover') {
        const file = new File([blob], fileName, { type: 'image/png' });
        const coverNote = item.embeddedTitle
          ? `国奖精选 A4 图文一体封面“${item.title}”（题名字形在图中）`
          : `国奖精选 A4 封面底图“${item.title}”（报告正副标题自动叠排于顶部留白负空间，同步提取全篇图表配色）。`;
        const { cover, palette } = await coverImageFromFile(file, coverNote);
        setTask('report_cover');
        setLatestCoverArt(cover);
        setLatestCoverPalette(palette);
        setLiveImageUrl(pageArtDataUrl(cover));
        setViewMode('live');
        const next = applyCoverImage(content, cover, palette);
        onUpdateReport(
          next,
          `已套用精选封面“${item.title}”（${item.embeddedTitle ? '题名字形在图中，正本与附录共用' : '顶部留白自动叠排标题'}），全篇图表配色已同步为${formatChineseColorName(palette.primary)}、${formatChineseColorName(palette.secondary)}与${formatChineseColorName(palette.opposite)}。`,
        );
        setStatus(`✓ 已套用“${item.title}”并同步全篇图表色板（主色为${formatChineseColorName(palette.primary)}）。`);
      } else if (item.kind === 'frame') {
        const file = new File([blob], fileName, { type: 'image/png' });
        const frame = await frameImageFromFile(
          file,
          `国奖精选透明 A4 艺术页框“${item.title}”（装饰仅在页边，正文版心与页码区全透明）。`,
        );
        setTask('report_frame');
        setLatestFrameArt(frame);
        setLiveImageUrl(pageArtDataUrl(frame));
        setViewMode('live');
        const next = applyFrameImage(content, frame);
        onUpdateReport(next, `已套用精选透明艺术页框“${item.title}”，正文版心与页码保护区保持全透明。`);
        setStatus(`✓ 已套用“${item.title}”（1000×1414 透明 A4 页框）。`);
      } else if (item.kind === 'roadmap' || item.kind === 'summary') {
        setTask('section_illustration');
        const results = content.quality?.results ?? [];
        const measuresSec = content.report.find(s => /对策|措施|方案|落地/u.test(s.title));
        const existingRoadmap =
          results.find(r => r.id.startsWith('rich-action-roadmap-') || r.id.startsWith('demo-action-roadmap-'))
          ?? results.find(
            r =>
              (r.method === 'diagram' || r.method === 'framework')
              && measuresSec?.blocks?.some(b => b.kind === 'chart' && b.evidenceId === r.id),
          );

        let workingContent = content;
        let boundId = existingRoadmap?.id ?? '';
        let boundSecId = measuresSec?.id ?? '';

        if (!existingRoadmap) {
          const snap = await buildInfographicResultSnapshot({
            content,
            title: item.kind === 'summary' ? '受访群体分类支持与精准施策路径图' : '多方协同治理与三十天试点实施机制路径图',
            prompt,
          });
          const appended = appendRegisteredResult(content, { result: snap });
          const resolved = targetSection(appended, 'plan.measures', measuresSec?.id);
          const placed = placeResult(resolved.content, snap.id, {
            sectionId: resolved.sectionId,
            exhibits: ['chart'],
          });
          workingContent = placed.content;
          boundId = snap.id;
          boundSecId = placed.sectionId;
        }

        const illustration = await sectionIllustrationFromBlob(
          blob,
          boundId,
          `国奖精选对策路径与分类支持总结图“${item.title}”`,
          `ill-${boundId}`.slice(0, 80),
        );
        const withArt = applySectionIllustration(workingContent, illustration);
        setLatestSectionArt({
          mime: illustration.mime,
          data: illustration.data,
          widthPx: illustration.widthPx,
          heightPx: illustration.heightPx,
        });
        setLiveImageUrl(sectionIllustrationDataUrl(illustration));
        setViewMode('live');
        const secTitle = withArt.report.find(s => s.id === boundSecId)?.title ?? '对策方案章节';
        onUpdateReport(withArt, `已将精选实施机制图“${item.title}”绑定至“${secTitle}”。`);
        if (boundSecId) onJumpToSection?.(boundSecId);
        setStatus(`✓ 已将“${item.title}”绑定至“${secTitle}”！`);
      } else {
        setTask('descriptive_infographic');
        const results = content.quality?.results ?? [];
        const existingProfile = results.find(r => r.id.startsWith('rich-profile-infographic-'));
        let workingContent = content;
        let boundId = existingProfile?.id ?? '';
        let boundSecId =
          content.report.find(s => s.blocks?.some(b => b.kind === 'chart' && b.evidenceId === boundId))?.id ?? '';

        if (!existingProfile) {
          const snap = await buildInfographicResultSnapshot({
            content,
            title:
              item.kind === 'demographic'
                ? '受访者群体构成、接触状态与年龄分布画像图'
                : buildTopicOverviewAcademicTitle(content.title),
            prompt,
          });
          const appended = appendRegisteredResult(content, { result: snap });
          const explicitSec =
            targetSectionId && appended.report.some(s => s.id === targetSectionId && !/^(?:摘要|目录)/u.test(s.title))
              ? targetSectionId
              : undefined;
          const resolvedTarget = targetSection(appended, 'sample.profile', explicitSec);
          const placed = placeResult(resolvedTarget.content, snap.id, {
            sectionId: resolvedTarget.sectionId,
            exhibits: ['chart'],
          });
          workingContent = placed.content;
          boundId = snap.id;
          boundSecId = placed.sectionId;
        }

        const illustration = await sectionIllustrationFromBlob(
          blob,
          boundId,
          `国奖精选受访者人物画像与小人占比图“${item.title}”`,
          `ill-${boundId}`.slice(0, 80),
        );
        const withArt = applySectionIllustration(workingContent, illustration);
        setLatestSectionArt({
          mime: illustration.mime,
          data: illustration.data,
          widthPx: illustration.widthPx,
          heightPx: illustration.heightPx,
        });
        setLiveImageUrl(sectionIllustrationDataUrl(illustration));
        setViewMode('live');
        const secTitle = withArt.report.find(s => s.id === boundSecId)?.title ?? '样本特征章节';
        onUpdateReport(withArt, `已将精选人物画像图“${item.title}”写入“${secTitle}”，纸面预览、可编辑文档、演示文稿与学术排版稿同步显示。`);
        if (boundSecId) onJumpToSection?.(boundSecId);
        setStatus(`✓ 已将“${item.title}”（${illustration.widthPx}×${illustration.heightPx}）写入“${secTitle}”！`);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '套用精选画廊资产失败。');
    } finally {
      setApplyingShowcaseId(null);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setStatus(`正在生成“${activeTaskSpec.label}”高清预览…`);
    try {
      const snap = await buildInfographicResultSnapshot({
        content,
        title: semanticFigureTitle,
        prompt,
      });
      const vectorSvg = assertTrueVector(descriptiveInfographicSVG(snap, content.figurePalette ?? accentHex));
      setPreviewSvg(vectorSvg);

      const pageArtKind = task === 'report_cover' ? 'cover' : task === 'report_frame' ? 'frame' : undefined;
      const allowEmbeddedTypography =
        isGptImageTypographyCapable(modelId)
        && (task === 'report_cover' || task === 'descriptive_infographic' || task === 'section_illustration');

      const res = await fetch('/api/agent/image-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId,
          prompt,
          task,
          aspect: activeTaskSpec.aspect,
          ...(pageArtKind ? { pageArtKind } : {}),
          accent: content.accent,
          quality: task === 'report_frame' ? 'medium' : 'high',
          ...(allowEmbeddedTypography ? { allowEmbeddedTypography: true } : {}),
          apiKey: apiKey.trim() || undefined,
          baseUrl: baseUrl.trim() || undefined,
          customModelName: customModelName.trim() || undefined,
        }),
        signal: AbortSignal.timeout(90_000),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        mode?: 'live_api' | 'data_bound_composite';
        resolvedModel?: string;
        imageDataUrl?: string;
        pageArt?: unknown;
        figurePalette?: unknown;
        sectionArt?: RawSectionArt;
        fallbackReason?: string;
        error?: string;
      };

      if (json.mode === 'live_api' && json.imageDataUrl) {
        let parsedCover: CoverImage | null = null;
        let parsedPalette: FigurePalette | null = null;
        let parsedFrame: FrameImage | null = null;
        let parsedSecArt: RawSectionArt | null = null;

        if (task === 'report_cover' && json.pageArt) {
          try {
            parsedCover = parseCoverImage(json.pageArt);
          } catch {
            parsedCover = null;
          }
          if (json.figurePalette) {
            try {
              parsedPalette = parseFigurePalette(json.figurePalette);
            } catch {
              parsedPalette = null;
            }
          }
        } else if (task === 'report_frame' && json.pageArt) {
          try {
            parsedFrame = parseFrameImage(json.pageArt);
          } catch {
            parsedFrame = null;
          }
        } else if (
          !isPageArtTask
          && json.sectionArt
          && (json.sectionArt.mime === 'image/png' || json.sectionArt.mime === 'image/jpeg')
          && typeof json.sectionArt.data === 'string'
        ) {
          parsedSecArt = json.sectionArt;
        }

        setLatestCoverArt(parsedCover);
        setLatestCoverPalette(parsedPalette);
        setLatestFrameArt(parsedFrame);
        setLatestSectionArt(parsedSecArt);
        setLiveImageUrl(
          parsedCover
            ? pageArtDataUrl(parsedCover)
            : parsedFrame
              ? pageArtDataUrl(parsedFrame)
              : parsedSecArt
                ? `data:${parsedSecArt.mime};base64,${parsedSecArt.data}`
                : json.imageDataUrl,
        );
        setViewMode('live');
        setStatus(
          parsedCover && parsedPalette
            ? `✓ 已生成 A4 封面（${coverHasEmbeddedTitle(parsedCover) ? '题名字形已入图' : '预留叠题负空间'}，主色为${formatChineseColorName(parsedPalette.primary)}），点击下方按钮即可应用！`
            : parsedSecArt
              ? `✓ 已生成 ${parsedSecArt.widthPx}×${parsedSecArt.heightPx} 高清配图，点击下方按钮即可写入报告章节！`
              : '✓ 高清配图已生成，可一键应用至当前报告。',
        );
      } else {
        setLiveImageUrl(null);
        setLatestCoverArt(null);
        setLatestCoverPalette(null);
        setLatestFrameArt(null);
        setLatestSectionArt(null);
        setViewMode('vector');

        if (task === 'report_cover') {
          const det = await synthesizeDeterministicCoverArt({ title: content.title, accent: content.accent });
          setDetCoverPreview(det);
          setStatus(
            json.fallbackReason
              || `已生成国奖风标准 A4 竖版封面预览（主色为${formatChineseColorName(det.figurePalette.primary)}），点击下方按钮可一键写入报告并同步图表配色。`,
          );
        } else if (task === 'report_frame') {
          const detFrame = await synthesizeDeterministicFrameArt({ accent: content.accent });
          setDetFramePreview(detFrame);
          setStatus(
            json.fallbackReason
              || '已生成标准透明 A4 学术页框预览（正文版心与页码区全透明），点击下方按钮可一键应用。',
          );
        } else {
          onSaveArtifact?.(`${activeTaskSpec.shortLabel}-数据复合图`, vectorSvg);
          setStatus(
            json.fallbackReason
              || `当前矢量预览已同步真实样本统计（n=${stats.sampleN}）；在高级设置中连接图像服务后可生成高清信息图。`,
          );
        }
      }
    } catch (error) {
      setViewMode('vector');
      setStatus(error instanceof Error ? `已切换为标准矢量预览，${error.message}` : '已切换为标准矢量预览。');
    } finally {
      setGenerating(false);
    }
  };

  const insertInfographicIntoReport = async () => {
    try {
      const snap = await buildInfographicResultSnapshot({
        content,
        title: semanticFigureTitle,
        prompt,
      });
      const appended = appendRegisteredResult(content, { result: snap });
      const chosenSection =
        targetSectionId && appended.report.some(s => s.id === targetSectionId && !/^(?:摘要|目录)/u.test(s.title))
          ? targetSectionId
          : undefined;
      const defaultNode =
        task === 'descriptive_infographic'
          ? 'sample.profile'
          : task === 'section_illustration'
            ? 'plan.measures'
            : 'intro.background';
      const resolvedTarget = targetSection(appended, defaultNode, chosenSection);
      const placed = placeResult(resolvedTarget.content, snap.id, {
        sectionId: resolvedTarget.sectionId,
        exhibits: ['chart'],
      });

      let finalContent = placed.content;
      let attachedAiArt = false;

      if (viewMode === 'live' && (latestSectionArt || liveImageUrl)) {
        const noteText = `出版级章节专题配图（${activeTaskSpec.label}）`;
        let illustration: SectionIllustration;
        if (latestSectionArt) {
          illustration = parseSectionIllustration({
            schema: 'SectionIllustration/v1',
            id: `ill-${snap.id}`.slice(0, 80),
            resultId: snap.id,
            mime: latestSectionArt.mime,
            data: latestSectionArt.data,
            widthPx: latestSectionArt.widthPx,
            heightPx: latestSectionArt.heightPx,
            note: noteText,
          });
        } else {
          const blob = await (await fetch(liveImageUrl!)).blob();
          illustration = await sectionIllustrationFromBlob(blob, snap.id, noteText, `ill-${snap.id}`);
        }
        finalContent = applySectionIllustration(placed.content, illustration);
        attachedAiArt = true;
      }

      const secTitle = finalContent.report.find(s => s.id === placed.sectionId)?.title ?? placed.sectionId;
      onUpdateReport(
        finalContent,
        attachedAiArt
          ? `已将高清专题配图“${snap.title}”插入报告章节“${secTitle}”，纸面预览、可编辑文档、演示文稿与学术排版稿同步渲染高清原图。`
          : `已将“${snap.title}”插入报告章节“${secTitle}”，纸面预览、可编辑文档与学术排版稿同步生效。`,
      );
      onJumpToSection?.(placed.sectionId);
      setStatus(
        attachedAiArt
          ? `✓ 已将高清专题配图写入“${secTitle}”（纸面预览、可编辑文档、演示文稿与学术排版稿同步显示）！`
          : `✓ 已写入报告章节“${secTitle}”并完成数据一致性校验。`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '插入报告失败，请先确认报告已初始化章节。');
    }
  };

  const applyAsA4PageArt = async () => {
    try {
      if (task === 'report_frame') {
        if (viewMode === 'live' && latestFrameArt) {
          const next = applyFrameImage(content, latestFrameArt);
          onUpdateReport(next, `已将新生成的 ${latestFrameArt.widthPx}×${latestFrameArt.heightPx} 透明 A4 艺术页框应用至报告。`);
          setStatus(`✓ 已应用 ${latestFrameArt.widthPx}×${latestFrameArt.heightPx} 透明 A4 艺术页框（正文与页码保护区全透明）。`);
          return;
        }
        if (viewMode === 'live' && liveImageUrl) {
          const blob = await (await fetch(liveImageUrl)).blob();
          const file = new File([blob], 'generated-frame.png', { type: 'image/png' });
          const frame = await frameImageFromFile(file, '国奖出版级 A4 透明学术页框');
          const next = applyFrameImage(content, frame);
          onUpdateReport(next, `已应用 ${frame.widthPx}×${frame.heightPx} 透明 A4 学术页框。`);
          setStatus(`✓ 已应用 ${frame.widthPx}×${frame.heightPx} 透明 A4 学术页框。`);
          return;
        }
        const detFrame = detFramePreview ?? (await synthesizeDeterministicFrameArt({ accent: content.accent }));
        setDetFramePreview(detFrame);
        const next = applyFrameImage(content, detFrame);
        onUpdateReport(next, '已应用标准透明 A4 学术页框（正文与页码保护区全透明）。');
        setStatus('✓ 已应用标准透明 A4 学术页框。');
        return;
      }

      if (viewMode === 'live' && latestCoverArt) {
        let palette = latestCoverPalette;
        if (!palette) {
          const blob = await (await fetch(pageArtDataUrl(latestCoverArt))).blob();
          const file = new File([blob], 'generated-cover.png', { type: latestCoverArt.mime });
          const extracted = await coverImageFromFile(file, latestCoverArt.note);
          palette = extracted.palette;
        }
        const next = applyCoverImage(content, latestCoverArt, palette);
        onUpdateReport(
          next,
          `已将新生成封面应用为 ${latestCoverArt.widthPx}×${latestCoverArt.heightPx} A4 报告封面（正本与附录共用），并同步全篇统计图表配色（主色为${formatChineseColorName(palette.primary)}）。`,
        );
        setStatus(`✓ 已应用 A4 报告封面并同步全篇图表色板（主色${formatChineseColorName(palette.primary)}、辅色${formatChineseColorName(palette.secondary)}、对比色${formatChineseColorName(palette.opposite)}）。`);
        return;
      }

      if (viewMode === 'live' && liveImageUrl) {
        const blob = await (await fetch(liveImageUrl)).blob();
        const imgBitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = 1000;
        canvas.height = 1414;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          imgBitmap.close();
          throw new Error('浏览器无法处理封面画布。');
        }
        ctx.fillStyle = '#fcfaf5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const scale = Math.max(canvas.width / Math.max(1, imgBitmap.width), canvas.height / Math.max(1, imgBitmap.height));
        const drawW = imgBitmap.width * scale;
        const drawH = imgBitmap.height * scale;
        ctx.drawImage(imgBitmap, (canvas.width - drawW) / 2, (canvas.height - drawH) / 2, drawW, drawH);
        imgBitmap.close();

        const sample = document.createElement('canvas');
        sample.width = 120;
        sample.height = 170;
        const sctx = sample.getContext('2d');
        if (!sctx) throw new Error('浏览器无法提取封面色板。');
        sctx.drawImage(canvas, 0, 0, 120, 170);
        const palette = parseFigurePalette(paletteFromPixels(sctx.getImageData(0, 0, 120, 170).data, 'cover'));

        let encodedMime: 'image/png' | 'image/jpeg' = 'image/png';
        let encodedBase64 = canvas.toDataURL('image/png').split(',')[1] ?? '';
        const approxBytes = (b64: string) => Math.floor(b64.length * 0.75);
        if (approxBytes(encodedBase64) > 960_000) {
          encodedMime = 'image/jpeg';
          for (const quality of [0.88, 0.8, 0.72, 0.62, 0.5]) {
            const candidate = canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? '';
            encodedBase64 = candidate;
            if (approxBytes(candidate) <= 960_000) break;
          }
        }
        const suffix = isGptImageTypographyCapable(modelId)
          ? '国奖出版级 A4 图文一体封面（题名字形在图中）'
          : '国奖出版级 A4 报告封面底图';
        const cover = parseCoverImage({
          schema: 'CoverImage/v1',
          mime: encodedMime,
          data: encodedBase64,
          widthPx: 1000,
          heightPx: 1414,
          note: suffix,
        });
        const next = applyCoverImage(content, cover, palette);
        onUpdateReport(next, `已应用 1000×1414 A4 报告封面并同步全篇图表配色（主色为${formatChineseColorName(palette.primary)}）。`);
        setStatus(`✓ 已应用 1000×1414 A4 报告封面并同步全篇图表色板（主色为${formatChineseColorName(palette.primary)}）。`);
        return;
      }

      const det = detCoverPreview ?? (await synthesizeDeterministicCoverArt({ title: content.title, accent: content.accent }));
      setDetCoverPreview(det);
      const next = applyCoverImage(content, det.coverImage, det.figurePalette);
      onUpdateReport(
        next,
        `已应用标准国奖风 A4 报告封面（${det.coverImage.widthPx}×${det.coverImage.heightPx}），并同步全篇图表色板（主色为${formatChineseColorName(det.figurePalette.primary)}）。`,
      );
      setStatus(`✓ 已应用标准 A4 报告封面并同步全篇图表色板（主色为${formatChineseColorName(det.figurePalette.primary)}）。`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'A4 页面艺术资产应用失败。');
    }
  };

  const activeA4PreviewSrc = useMemo(() => {
    if (viewMode === 'live' && liveImageUrl) return liveImageUrl;
    if (task === 'report_cover') {
      if (content.coverImage) return pageArtDataUrl(content.coverImage);
      if (detCoverPreview) return pageArtDataUrl(detCoverPreview.coverImage);
    }
    if (task === 'report_frame') {
      if (content.frameImage) return pageArtDataUrl(content.frameImage);
      if (detFramePreview) return pageArtDataUrl(detFramePreview);
    }
    return '';
  }, [viewMode, liveImageUrl, task, content.coverImage, content.frameImage, detCoverPreview, detFramePreview]);

  const activePalettePreview = useMemo(
    () => latestCoverPalette ?? content.figurePalette ?? detCoverPreview?.figurePalette ?? null,
    [latestCoverPalette, content.figurePalette, detCoverPreview],
  );

  const anyBusy =
    generating
    || Boolean(quickActionBusy)
    || Boolean(applyingShowcaseId)
    || Boolean(applyingPresetCoverId);

  const downloadAsset = () => {
    if (isPageArtTask && activeA4PreviewSrc) {
      const a = document.createElement('a');
      a.href = activeA4PreviewSrc;
      a.download = `evix-${task}.png`;
      a.click();
      return;
    }
    if (viewMode === 'live' && liveImageUrl) {
      const a = document.createElement('a');
      a.href = liveImageUrl;
      a.download = `evix-${task}-${modelId}.png`;
      a.click();
      return;
    }
    if (!previewSvg) return;
    const url = URL.createObjectURL(new Blob([previewSvg], { type: 'image/svg+xml;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `evix-${task}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const orderedBackdropPresets = getOrderedBackdropPresets();
  const isDarkLayeredInk =
    (customInkMode
      ?? layeredCover.inkMode
      ?? layeredCover.anchors.inkMode
      ?? (layeredCover.selectedPresetId === 'd' ? 'light_on_dark' : 'dark_on_light'))
    === 'light_on_dark';
  const layeredCheckerboardBg = isDarkLayeredInk
    ? 'repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 50% / 12px 12px'
    : 'repeating-conic-gradient(#e2e8f0 0% 25%, #ffffff 0% 50%) 50% / 12px 12px';

  return (
    <div className={styles.studio}>
      <div className={styles.studioHeader}>
        <h4>国奖封面、页框与信息图工坊</h4>
        <span className={styles.monoTag}>
          {content.coverImage
            ? `${coverHasEmbeddedTitle(content.coverImage) ? '图文一体封面' : '叠题封面'} · 色板联动`
            : `样本 n=${stats.sampleN} · 色板联动`}
        </span>
      </div>

      {/* ★ 封面设计工作台：整页封面选型（F/E/C/B/D/A）与底图题名精调 */}
      <div className={styles.panel} role="region" aria-label="封面设计工作台">
        <div className={styles.row} style={{ justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 12 }}>“益普索杯”A4 封面设计工作台（正本与附录同步共用）</strong>
          <span className={styles.badge}>
            {layeredCover.mode === 'layered_assembly' ? '矢量分层零错字' : '6 款跨媒介候选'}
          </span>
        </div>

        <div className={styles.segBar} role="tablist" aria-label="封面设计方式">
          <button
            type="button"
            role="tab"
            aria-selected={layeredCover.mode === 'direct_illustrated'}
            className={`${styles.segBtn} ${layeredCover.mode === 'direct_illustrated' ? styles.segBtnActive : ''}`}
            onClick={() => setCoverPipelineMode('direct_illustrated')}
          >
            整页封面选型
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={layeredCover.mode === 'layered_assembly'}
            className={`${styles.segBtn} ${layeredCover.mode === 'layered_assembly' ? styles.segBtnActive : ''}`}
            onClick={() => setCoverPipelineMode('layered_assembly')}
          >
            底图与题名精调
          </button>
        </div>

        {layeredCover.mode === 'direct_illustrated' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <p className={styles.muted}>
              内置 6 套跨媒介“益普索杯”第十七届国奖级直出图文封面（F 光学玻璃静物微距 / E 暖阳胶片大刊 / C 丹青朱砂竖排 / B 瑞士数据蓝图 / D 靛蓝琥珀剪纸 / A 宣纸青金行楷），点击任意方案即刻同步正本与附录卷封面及全篇图表配色。
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7 }}>
              {MODE1_ORDERED_COVER_PRESETS.map(preset => {
                const liveCand = coverCandidates.find(c => c.id === preset.id);
                const imgSrc = liveCand ? pageArtDataUrl(liveCand.coverImage) : preset.staticAssetUrl;
                const isSelected = adoptedCoverCandId === preset.id;
                const isBusyThis = applyingPresetCoverId === preset.id;
                return (
                  <div
                    key={preset.id}
                    style={{
                      display: 'grid',
                      gap: 4,
                      padding: 6,
                      borderRadius: 8,
                      border: isSelected
                        ? '2px solid var(--c-accent, #0f766e)'
                        : preset.isDefaultPreferred
                          ? '1px solid color-mix(in srgb, var(--c-accent, #0f766e) 42%, transparent)'
                          : '1px solid rgba(15,23,42,0.11)',
                      background: isSelected ? 'rgba(15,118,110,0.05)' : '#ffffff',
                    }}
                  >
                    <div style={{ position: 'relative' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- A4 preset cover preview */}
                      <img
                        src={imgSrc}
                        alt={preset.label}
                        style={{
                          width: '100%',
                          aspectRatio: '210 / 297',
                          objectFit: 'cover',
                          borderRadius: 4,
                          border: '1px solid rgba(15,23,42,0.08)',
                          cursor: 'zoom-in',
                        }}
                        onClick={() =>
                          openZoomDialog({
                            title: preset.label,
                            badge: preset.badge,
                            src: imgSrc,
                          })
                        }
                      />
                      <button
                        type="button"
                        aria-label={`放大预览${preset.label}`}
                        onClick={() =>
                          openZoomDialog({
                            title: preset.label,
                            badge: preset.badge,
                            src: imgSrc,
                          })
                        }
                        style={{
                          position: 'absolute',
                          right: 4,
                          bottom: 4,
                          padding: '1px 5px',
                          fontSize: 9.5,
                          borderRadius: 4,
                          border: 'none',
                          background: 'rgba(15,23,42,0.68)',
                          color: '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        🔍 放大
                      </button>
                    </div>
                    <strong style={{ fontSize: 10.5, lineHeight: 1.25 }}>{preset.label}</strong>
                    <span style={{ fontSize: 9.5, color: '#64748b', lineHeight: 1.2 }}>{preset.badge}</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4 }}>
                      <button
                        type="button"
                        className={`${styles.btn} ${isSelected ? '' : styles.btnPrimary}`}
                        title="设为正本与附录封面并联动全篇图表配色"
                        style={{ minHeight: 25, padding: '2px 5px', fontSize: 10, width: '100%' }}
                        disabled={anyBusy}
                        onClick={() => void handleAdoptDirectPreset(preset)}
                      >
                        {isBusyThis ? '同步中…' : isSelected ? '✓ 已用' : '采纳封面'}
                      </button>
                      <button
                        type="button"
                        className={styles.btn}
                        title="切换至同款无字底图自由改写题名并导出透明矢量字稿"
                        style={{ minHeight: 25, padding: '2px 5px', fontSize: 9.5 }}
                        disabled={anyBusy}
                        onClick={() => handleJumpToLayeredFromMode1(preset.id)}
                      >
                        分层
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ★ 开放视觉高密度封面示范 + 任意课题画面描述生成 */}
            <div
              style={{
                display: 'grid',
                gap: 7,
                paddingTop: 8,
                marginTop: 4,
                borderTop: '1px dashed rgba(15,23,42,0.14)',
              }}
              aria-label="开放视觉示范与画面描述生成"
            >
              <div className={styles.row} style={{ justifyContent: 'space-between' }}>
                <strong style={{ fontSize: 11.5 }}>三景深开放视觉示范与专属画面描述生成</strong>
                <span className={styles.badge}>4 种印刷与电影美感</span>
              </div>
              <p className={styles.muted} style={{ fontSize: 10.5 }}>
                采用前景、中景、背景三层景深融合自适应阅读留白区，可直接采纳示范，或一键把“{content.title || '当前课题'}”专属画面描述填入下方生成框。
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
                {V3_OPEN_COVER_SHOWCASE.map(item => {
                  const matchedBrief = openBriefs.find(b => b.id === item.id);
                  const isSelected = adoptedCoverCandId === item.id;
                  const isBusyThis = applyingPresetCoverId === item.id;
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'grid',
                        gap: 4,
                        padding: 5,
                        borderRadius: 8,
                        border: isSelected
                          ? '2px solid var(--c-accent, #0f766e)'
                          : '1px solid rgba(15,23,42,0.11)',
                        background: isSelected ? 'rgba(15,118,110,0.05)' : '#faf8f4',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- open showcase cover */}
                      <img
                        src={item.staticAssetUrl}
                        alt={item.label}
                        style={{
                          width: '100%',
                          aspectRatio: '210 / 297',
                          objectFit: 'cover',
                          borderRadius: 4,
                          cursor: 'zoom-in',
                        }}
                        onClick={() =>
                          openZoomDialog({
                            title: item.label,
                            badge: item.badge,
                            src: item.staticAssetUrl,
                          })
                        }
                      />
                      <strong style={{ fontSize: 10, lineHeight: 1.25 }}>{item.label}</strong>
                      <span style={{ fontSize: 9, color: '#64748b', lineHeight: 1.2 }}>{item.directionName}</span>
                      <div style={{ display: 'grid', gridTemplateColumns: matchedBrief ? '1fr 1fr' : '1fr', gap: 3 }}>
                        <button
                          type="button"
                          className={`${styles.btn} ${isSelected ? '' : styles.btnPrimary}`}
                          style={{ gridColumn: '1 / -1', minHeight: 22, padding: '2px 4px', fontSize: 9.5 }}
                          disabled={anyBusy}
                          onClick={() => void applyPresetCoverByUrl(item.id, item.label, item.staticAssetUrl)}
                        >
                          {isBusyThis ? '…' : isSelected ? '✓ 已用' : '采纳'}
                        </button>
                        {matchedBrief && (
                          <button
                            type="button"
                            className={styles.btn}
                            title="生成当前课题的专属画面描述并填入生成框"
                            style={{ minHeight: 22, padding: '2px 3px', fontSize: 9 }}
                            disabled={anyBusy}
                            onClick={() => handleApplyOpenBrief(matchedBrief)}
                          >
                            填词
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.btn}
                          title="传入底图与题名精调面板自动匹配留白区并重排书法题名"
                          style={{ minHeight: 22, padding: '2px 3px', fontSize: 9 }}
                          disabled={anyBusy}
                          onClick={() => handleJumpToLayeredFromShowcase(item)}
                        >
                          组装
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 9 }}>
            <p className={styles.muted}>
              全 6 套无字底图（F / E / C / B / D / A）与整页封面方案一一对应，依据版面留白基准将纯无字底图与全透明矢量书法题名精准叠合，选中深色底图 D 时自动切换暗色格底与暖金象牙白字形。
            </p>

            {/* 6 套对称无字底图预设选择 + 自定义上传 + 明暗字色切换 */}
            <div style={{ display: 'grid', gap: 5 }}>
              <div className={styles.row} style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                  全 6 套对称无字底图预设（F / E / C / B / D / A）
                </span>
                <div className={styles.row} style={{ gap: 4 }}>
                  <button
                    type="button"
                    className={styles.stylePresetChip}
                    aria-pressed={isDarkLayeredInk}
                    title="切换明底墨字 / 暗底暖金象牙白字形"
                    onClick={handleToggleLayeredInkMode}
                  >
                    {isDarkLayeredInk ? '🌙 暗底浅金' : '☀️ 明底墨字'}
                  </button>
                  <label
                    className={styles.stylePresetChip}
                    style={{ cursor: 'pointer' }}
                    title="上传自定义 1000×1414 无字底图"
                  >
                    上传底图
                    <input
                      type="file"
                      aria-label="上传自定义无字底图"
                      accept="image/png,image/jpeg"
                      style={{ display: 'none' }}
                      onChange={e => {
                        handleCustomLayerUpload('backdrop', e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <label
                    className={styles.stylePresetChip}
                    style={{ cursor: 'pointer' }}
                    title="上传自定义版式参照图"
                  >
                    上传参照图
                    <input
                      type="file"
                      aria-label="上传自定义版式参照图"
                      accept="image/png,image/jpeg"
                      style={{ display: 'none' }}
                      onChange={e => {
                        handleCustomLayerUpload('reference', e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>
              <div
                role="group"
                aria-label="六套对称无字底图预设"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 5 }}
              >
                {orderedBackdropPresets.map(bp => {
                  const key = String(bp.id);
                  const active = layeredCover.selectedPresetId === bp.id && !customBackdropB64;
                  const presetDark = bp.inkMode === 'light_on_dark' || bp.anchors.inkMode === 'light_on_dark' || key === 'd';
                  return (
                    <button
                      key={key}
                      type="button"
                      className={styles.btn}
                      aria-pressed={active}
                      title={`${bp.label} — ${bp.badge}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '24px minmax(0, 1fr)',
                        alignItems: 'center',
                        gap: 5,
                        minHeight: 38,
                        padding: '4px 6px',
                        textAlign: 'left',
                        borderColor: active ? 'var(--c-accent, #0f766e)' : undefined,
                        background: active ? 'color-mix(in srgb, var(--c-accent, #0f766e) 9%, #ffffff)' : undefined,
                      }}
                      onClick={() => handleSelectBackdropPreset(bp.id)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- clean backdrop miniature thumb */}
                      <img
                        src={bp.backdropUrl}
                        alt={bp.label}
                        style={{
                          width: 24,
                          height: 34,
                          objectFit: 'cover',
                          borderRadius: 3,
                          border: '1px solid rgba(15,23,42,0.12)',
                        }}
                      />
                      <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
                        <strong
                          style={{
                            fontSize: 9.5,
                            lineHeight: 1.2,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            color: active ? 'var(--c-accent, #0f766e)' : '#0f172a',
                          }}
                        >
                          {bp.shortLabel || BACKDROP_SHORT_LABELS[key] || bp.label}
                        </strong>
                        <small style={{ fontSize: 8.5, color: presetDark ? '#b45309' : '#64748b' }}>
                          {presetDark ? '暗底浅金' : bp.anchors.titleDirection === 'vertical' ? '竖排留白' : '横排留白'}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4 套非板正艺术字风格切换 */}
            <div style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>非板正矢量书法艺术字风格（4 选 1）</span>
              <div className={styles.stylePresetBar} role="group" aria-label="矢量书法艺术字风格">
                {COVER_TYPOGRAPHY_STYLE_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    className={styles.stylePresetChip}
                    aria-pressed={layeredCover.typographyStyle === opt.id}
                    title={opt.badge}
                    onClick={() => handleSelectTypographyStyle(opt.id)}
                  >
                    {opt.shortLabel}
                  </button>
                ))}
              </div>
            </div>

            {/* 4 项封面文字实时编辑 */}
            <div className={styles.itemCard} style={{ gap: 6 }}>
              <div className={styles.row} style={{ justifyContent: 'space-between' }}>
                <strong style={{ fontSize: 11 }}>封面四要素文字实时精调（零学校/真名盲审保护）</strong>
                <button
                  type="button"
                  className={styles.btn}
                  style={{ minHeight: 22, padding: '1px 7px', fontSize: 10.5 }}
                  onClick={handleSyncLayeredFromReport}
                >
                  ↻ 同步报告题名
                </button>
              </div>
              <label className={styles.field}>
                <span>赛事届数全称</span>
                <input
                  className={styles.input}
                  aria-label="封面赛事届数全称"
                  value={layeredCover.competitionName}
                  onChange={e => updateLayeredTextField('competitionName', e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>艺术字主标题（支持“核心字”高亮）</span>
                <input
                  className={styles.input}
                  aria-label="封面艺术字主标题"
                  value={layeredCover.title}
                  onChange={e => updateLayeredTextField('title', e.target.value)}
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 6 }}>
                <label className={styles.field}>
                  <span>实证副标题</span>
                  <input
                    className={styles.input}
                    aria-label="封面实证副标题"
                    value={layeredCover.subtitle}
                    onChange={e => updateLayeredTextField('subtitle', e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span>盲审队名（自动加“参赛团队：”）</span>
                  <input
                    className={styles.input}
                    aria-label="封面盲审队名"
                    value={layeredCover.teamName}
                    onChange={e => updateLayeredTextField('teamName', e.target.value)}
                  />
                </label>
              </div>
            </div>

            {/* 4 步可视化分层组装面板 */}
            <div
              role="group"
              aria-label="四步封面分层合成预览"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7 }}
            >
              {/* ① 参照图 */}
              <div className={styles.itemCard} style={{ padding: 6, gap: 4 }}>
                <div className={styles.row} style={{ justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 10.5 }}>① 参照图</strong>
                  <span style={{ fontSize: 9.5, color: '#64748b' }}>
                    {layeredCover.anchors.titleDirection === 'vertical' ? '竖排留白参考' : '横排留白参考'}
                  </span>
                </div>
                <div style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- stage 1 reference cover */}
                  <img
                    src={layeredCover.referenceUrl}
                    alt="第一步版式参照图"
                    style={{
                      width: '100%',
                      aspectRatio: '210 / 297',
                      objectFit: 'cover',
                      borderRadius: 4,
                      border: '1px solid rgba(15,23,42,0.09)',
                      cursor: 'zoom-in',
                    }}
                    onClick={() =>
                      openZoomDialog({
                        title: '① 版式参照图',
                        badge: '顶部眉栏、主标题与底部署名区版式对位参考',
                        src: layeredCover.referenceUrl,
                      })
                    }
                  />
                </div>
                <span style={{ fontSize: 9.5, color: '#64748b', lineHeight: 1.25 }}>
                  顶部与题区预留留白
                </span>
              </div>

              {/* ② 无字背景底图 */}
              <div className={styles.itemCard} style={{ padding: 6, gap: 4 }}>
                <div className={styles.row} style={{ justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 10.5 }}>② 无字背景底图</strong>
                  <span style={{ fontSize: 9.5, color: '#0f766e' }}>零文字净空</span>
                </div>
                <div style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- stage 2 clean backdrop */}
                  <img
                    src={layeredCover.backdropUrl}
                    alt="第二步纯无字背景底图"
                    style={{
                      width: '100%',
                      aspectRatio: '210 / 297',
                      objectFit: 'cover',
                      borderRadius: 4,
                      border: '1px solid rgba(15,23,42,0.09)',
                      cursor: 'zoom-in',
                    }}
                    onClick={() =>
                      openZoomDialog({
                        title: '② 纯无字背景底图',
                        badge: '顶部呼吸留白与底部署名净空无字底图',
                        src: layeredCover.backdropUrl,
                      })
                    }
                  />
                </div>
                <span style={{ fontSize: 9.5, color: '#64748b', lineHeight: 1.25 }}>
                  纯净无字底图画面
                </span>
              </div>

              {/* ③ 矢量化透明艺术字 */}
              <div className={styles.itemCard} style={{ padding: 6, gap: 4 }}>
                <div className={styles.row} style={{ justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 10.5 }}>③ 矢量化透明艺术字</strong>
                  <span style={{ fontSize: 9.5, color: isDarkLayeredInk ? '#b45309' : '#0f766e', fontWeight: 600 }}>
                    {isDarkLayeredInk ? '暗底浅金 · ' : ''}
                    {layeredCover.vectorTypographySvg.includes('<path') ? '高清矢量字形' : '透明矢量图层'}
                  </span>
                </div>
                <div style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- stage 3 transparent vector typography */}
                  <img
                    src={layeredCover.vectorTypographyDataUrl}
                    alt="第三步矢量化透明艺术字图层"
                    data-checkerboard={isDarkLayeredInk ? 'dark' : 'light'}
                    style={{
                      width: '100%',
                      aspectRatio: '210 / 297',
                      objectFit: 'contain',
                      borderRadius: 4,
                      border: '1px solid rgba(15,23,42,0.09)',
                      background: layeredCheckerboardBg,
                      cursor: 'zoom-in',
                    }}
                    onClick={() =>
                      openZoomDialog({
                        title: '③ 矢量化透明艺术字（棋盘格代表全透明区域）',
                        badge: isDarkLayeredInk
                          ? '暗色格底 · 暖金与象牙白无背景框矢量书法字层'
                          : '无背景框透明矢量书法字层',
                        src: layeredCover.vectorTypographyDataUrl,
                        isFrame: true,
                        darkCheckerboard: isDarkLayeredInk,
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  className={styles.btn}
                  style={{ minHeight: 24, padding: '2px 6px', fontSize: 10, width: '100%' }}
                  onClick={handleDownloadLayeredTypographySvg}
                >
                  ↓ 导出透明矢量字稿
                </button>
              </div>

              {/* ④ 对照组装成品 */}
              <div
                className={styles.itemCard}
                style={{
                  padding: 6,
                  gap: 4,
                  borderColor: 'color-mix(in srgb, var(--c-accent, #0f766e) 45%, transparent)',
                }}
              >
                <div className={styles.row} style={{ justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 10.5 }}>④ 对照组装成品</strong>
                  <span style={{ fontSize: 9.5, color: '#0f766e', fontWeight: 600 }}>
                    {layeredCover.assembledSource === 'backend_bezier'
                      ? '超清合成'
                      : layeredCover.assembledSource === 'client_canvas'
                        ? '已合成成品'
                        : '实时叠合'}
                  </span>
                </div>
                {layeredCover.assembledDataUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- stage 4 assembled final cover */
                  <img
                    src={layeredCover.assembledDataUrl}
                    alt="第四步对照组装成品封面"
                    style={{
                      width: '100%',
                      aspectRatio: '210 / 297',
                      objectFit: 'cover',
                      borderRadius: 4,
                      border: '1px solid rgba(15,23,42,0.12)',
                      cursor: 'zoom-in',
                    }}
                    onClick={() =>
                      openZoomDialog({
                        title: '④ 对照组装成品（A4 竖版）',
                        badge:
                          layeredCover.assembledSource === 'backend_bezier'
                            ? '无字底图与高清矢量书法艺术字精细合成'
                            : '无字底图与透明矢量艺术字对位合成',
                        src: layeredCover.assembledDataUrl,
                      })
                    }
                  />
                ) : (
                  <div
                    role="img"
                    aria-label="第四步实时分层叠合预览"
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '210 / 297',
                      borderRadius: 4,
                      overflow: 'hidden',
                      border: '1px solid rgba(15,23,42,0.12)',
                      background: isDarkLayeredInk ? '#0f172a' : '#fcfaf5',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- live backdrop layer */}
                    <img
                      src={layeredCover.backdropUrl}
                      alt=""
                      aria-hidden="true"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element -- live transparent vector SVG layer */}
                    <img
                      src={layeredCover.vectorTypographyDataUrl}
                      alt=""
                      aria-hidden="true"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                )}
                <span style={{ fontSize: 9.5, color: '#64748b', lineHeight: 1.25 }}>
                  正本与附录同步共用
                </span>
              </div>
            </div>

            {/* 分层组装主操作按钮 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 6 }}>
              <button
                type="button"
                className={styles.btn}
                style={{
                  borderColor: 'var(--c-accent, #0f766e)',
                  color: 'var(--c-accent, #0f766e)',
                  fontWeight: 700,
                }}
                disabled={anyBusy}
                onClick={() => void handleRunLayeredAssembly()}
              >
                {quickActionBusy === 'assemble' ? '⏳ 智能组装中…' : '✨ 对照参照图智能组装'}
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={anyBusy}
                onClick={() => void handleApplyLayeredCover()}
              >
                {quickActionBusy === 'apply_layered' ? '⏳ 正在写入报告…' : '✓ 设为正本+附录封面'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 0. 四大核心一键主入口：图文一体封面 + 流动艺术页框 + 小人进度条人物画像图 + 第9章实施机制图 */}
      <div className={styles.personaDossierCard}>
        <div className={styles.row} style={{ justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 12 }}>国奖报告四大核心视觉一键生成</strong>
          <span className={styles.badge}>
            {providerReady.openai_compatible ? '高清生图已就绪' : '标准矢量模式就绪'}
          </span>
        </div>
        <p className={styles.muted}>
          图文一体 A4 封面（含赛事届次全称、非板正行楷与毛笔艺术字横竖排选题、盲审合规参赛团队，正本与附录同步共用）、4%–6% 极细锐利外缘透明页框（零羽化虚化）、小人占比画像图与实施机制图直写纸面预览、可编辑文档、演示文稿与学术排版稿。
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary} ${styles.compactActionBtn}`}
            disabled={anyBusy}
            onClick={() => void handleGenerateThreeCoverCandidates()}
          >
            {quickActionBusy === 'cover'
              ? '⏳ 并行生成 6 套封面…'
              : '✨ 生成 6 套封面对比'}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary} ${styles.compactActionBtn}`}
            disabled={anyBusy}
            onClick={() => void handleGenerateThreeFrameCandidates()}
          >
            {quickActionBusy === 'frame'
              ? '⏳ 并行生成 3 套页框…'
              : '✨ 生成 3 套页框对比'}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.compactActionBtn}`}
            disabled={anyBusy}
            onClick={() => void handleLoadPresetCoverCandidates()}
          >
            📚 预置 6 套国奖封面
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.compactActionBtn}`}
            disabled={anyBusy}
            onClick={() => void handleLoadPresetFrameCandidates()}
          >
            🖼 预置 3 套透明页框
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.compactActionBtn}`}
            style={{
              borderColor: 'color-mix(in srgb, var(--c-accent, #0f766e) 48%, transparent)',
              color: 'var(--c-accent, #0f766e)',
              fontWeight: 700,
            }}
            disabled={anyBusy}
            onClick={() => void handleOneClickDemographicInfographic()}
          >
            {quickActionBusy === 'demographic' ? '⏳ 生成画像图中…' : '👥 小人占比人物画像'}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.compactActionBtn}`}
            style={{ fontWeight: 600 }}
            disabled={anyBusy}
            onClick={() => void handleOneClickDenseWordCloud()}
          >
            {quickActionBusy === 'wordcloud' ? '⏳ 渲染词云中…' : '☁️ 智能轮廓词云'}
          </button>
          <button
            type="button"
            className={styles.btn}
            style={{ gridColumn: '1 / -1', fontWeight: 600 }}
            disabled={anyBusy}
            onClick={() => void handleOneClickActionRoadmap()}
          >
            {quickActionBusy === 'roadmap' ? '⏳ 生成路径图中…' : '🧭 协同治理路径图（图9-1）'}
          </button>
        </div>
        <div className={styles.summaryActionRow}>
          <select
            className={`${styles.select} ${styles.summarySlotSelect}`}
            aria-label="选择长文结构化总结卡章节位置"
            value={summarySlot}
            onChange={e => setSummarySlot(e.target.value as SummaryCardSlot)}
          >
            {SUMMARY_SLOT_OPTIONS.map(opt => (
              <option key={opt.slot} value={opt.slot}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`${styles.btn} ${styles.summaryActionBtn}`}
            aria-label="生成长文结构化总结卡"
            style={{
              fontWeight: 700,
              borderColor: 'color-mix(in srgb, var(--c-accent, #0f766e) 48%, transparent)',
              color: 'var(--c-accent, #0f766e)',
            }}
            disabled={anyBusy}
            onClick={() => void handleOneClickStructuredSummary()}
          >
            {quickActionBusy === 'summary' ? '⏳ 生成总结卡…' : '🗂 生成总结卡'}
          </button>
        </div>
      </div>

      {/* 0.5 候选方案并列对比挑选墙 */}
      {coverCandidates.length > 0 && (
        <div className={styles.panel} role="region" aria-label="六套封面候选并列对比">
          <div className={styles.row} style={{ justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 12 }}>“益普索杯”六大跨风格封面候选对比（默认推荐晶透光学静物微距风，正本与附录同步）</strong>
            <button
              type="button"
              className={styles.btn}
              style={{ minHeight: 22, padding: '1px 7px', fontSize: 11 }}
              onClick={() => setCoverCandidates([])}
            >
              收起对比
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {coverCandidates.map(cand => {
              const src = pageArtDataUrl(cand.coverImage);
              const isSelected = adoptedCoverCandId === cand.id;
              return (
                <div
                  key={cand.id}
                  style={{
                    display: 'grid',
                    gap: 5,
                    padding: 7,
                    borderRadius: 8,
                    border: isSelected ? '2px solid var(--c-accent, #0f766e)' : '1px solid rgba(15,23,42,0.12)',
                    background: isSelected ? 'rgba(15,118,110,0.05)' : '#ffffff',
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- candidate A4 cover data URL preview */}
                    <img
                      src={src}
                      alt={cand.label}
                      style={{
                        width: '100%',
                        aspectRatio: '210 / 297',
                        objectFit: 'cover',
                        borderRadius: 5,
                        border: '1px solid rgba(15,23,42,0.08)',
                        cursor: 'zoom-in',
                      }}
                      onClick={() => openZoomDialog({ title: cand.label, badge: cand.badge, src })}
                    />
                    <button
                      type="button"
                      aria-label={`放大预览${cand.label}`}
                      onClick={() => openZoomDialog({ title: cand.label, badge: cand.badge, src })}
                      style={{
                        position: 'absolute',
                        right: 4,
                        bottom: 4,
                        padding: '2px 5px',
                        fontSize: 10,
                        borderRadius: 4,
                        border: 'none',
                        background: 'rgba(15,23,42,0.68)',
                        color: '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      🔍 放大
                    </button>
                  </div>
                  <strong style={{ fontSize: 11, lineHeight: 1.25 }}>{cand.label}</strong>
                  <span style={{ fontSize: 10, color: '#64748b', lineHeight: 1.2 }}>{cand.badge}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {[cand.figurePalette.primary, cand.figurePalette.secondary, cand.figurePalette.opposite].map((hex, idx) => (
                      <i
                        key={`${cand.id}-${idx}`}
                        aria-hidden="true"
                        title={formatChineseColorName(hex)}
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          background: hex,
                          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)',
                        }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className={`${styles.btn} ${isSelected ? '' : styles.btnPrimary}`}
                    style={{ minHeight: 26, padding: '3px 6px', fontSize: 10.5, width: '100%' }}
                    onClick={() => handleAdoptCoverCandidate(cand)}
                  >
                    {isSelected ? '✓ 已采纳' : '采纳封面'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {frameCandidates.length > 0 && (
        <div className={styles.panel} role="region" aria-label="三套页框候选并列对比">
          <div className={styles.row} style={{ justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 12 }}>页框三方案并列对比（含“无边框”纯白素页选项）</strong>
            <div className={styles.row} style={{ gap: 4 }}>
              <button
                type="button"
                className={styles.btn}
                style={{
                  minHeight: 22,
                  padding: '1px 7px',
                  fontSize: 11,
                  fontWeight: !content.frameImage ? 700 : 500,
                }}
                onClick={() => handleAdoptFrameCandidate(null)}
              >
                {!content.frameImage ? '✓ 当前无边框' : '设为无边框'}
              </button>
              <button
                type="button"
                className={styles.btn}
                style={{ minHeight: 22, padding: '1px 7px', fontSize: 11 }}
                onClick={() => setFrameCandidates([])}
              >
                收起对比
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {frameCandidates.map(cand => {
              const src = pageArtDataUrl(cand.frameImage);
              const isSelected = adoptedFrameCandId === cand.id && Boolean(content.frameImage);
              return (
                <div
                  key={cand.id}
                  style={{
                    display: 'grid',
                    gap: 5,
                    padding: 7,
                    borderRadius: 8,
                    border: isSelected ? '2px solid var(--c-accent, #0f766e)' : '1px solid rgba(15,23,42,0.12)',
                    background: isSelected ? 'rgba(15,118,110,0.05)' : '#ffffff',
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- candidate A4 frame data URL preview */}
                    <img
                      src={src}
                      alt={cand.label}
                      style={{
                        width: '100%',
                        aspectRatio: '210 / 297',
                        objectFit: 'cover',
                        borderRadius: 5,
                        border: '1px solid rgba(15,23,42,0.08)',
                        background: 'repeating-conic-gradient(#f1f5f9 0% 25%, #ffffff 0% 50%) 50% / 10px 10px',
                        cursor: 'zoom-in',
                      }}
                      onClick={() => openZoomDialog({ title: cand.label, badge: cand.badge, src, isFrame: true })}
                    />
                    <button
                      type="button"
                      aria-label={`放大预览${cand.label}`}
                      onClick={() => openZoomDialog({ title: cand.label, badge: cand.badge, src, isFrame: true })}
                      style={{
                        position: 'absolute',
                        right: 4,
                        bottom: 4,
                        padding: '2px 5px',
                        fontSize: 10,
                        borderRadius: 4,
                        border: 'none',
                        background: 'rgba(15,23,42,0.68)',
                        color: '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      🔍 放大
                    </button>
                  </div>
                  <strong style={{ fontSize: 11, lineHeight: 1.25 }}>{cand.label}</strong>
                  <span style={{ fontSize: 10, color: '#64748b', lineHeight: 1.2 }}>{cand.badge}</span>
                  <button
                    type="button"
                    className={`${styles.btn} ${isSelected ? '' : styles.btnPrimary}`}
                    style={{ minHeight: 26, padding: '3px 6px', fontSize: 10.5, width: '100%' }}
                    onClick={() => handleAdoptFrameCandidate(cand)}
                  >
                    {isSelected ? '✓ 已采纳' : '采纳此版'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {zoomCandidate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${zoomCandidate.title}高清预览`}
          onClick={closeZoomDialog}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15,23,42,0.72)',
            backdropFilter: 'blur(8px)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: 12,
              padding: 14,
              maxWidth: 520,
              width: '100%',
              display: 'grid',
              gap: 10,
              boxShadow: '0 24px 60px rgba(0,0,0,0.32)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: 13 }}>{zoomCandidate.title}</strong>
                <div style={{ fontSize: 11.5, color: '#64748b' }}>{zoomCandidate.badge}</div>
              </div>
              <button ref={zoomCloseBtnRef} type="button" className={styles.btn} onClick={closeZoomDialog}>
                关闭
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- zoom dialog A4 high-res preview */}
            <img
              src={zoomCandidate.src}
              alt={zoomCandidate.title}
              style={{
                width: '100%',
                maxHeight: '76vh',
                objectFit: 'contain',
                borderRadius: 6,
                background: zoomCandidate.darkCheckerboard
                  ? 'repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 50% / 14px 14px'
                  : zoomCandidate.isFrame
                    ? 'repeating-conic-gradient(#f1f5f9 0% 25%, #ffffff 0% 50%) 50% / 14px 14px'
                    : '#fcfaf5',
              }}
            />
          </div>
        </div>
      )}

      {/* 1. 国奖精选封面、艺术页框、人物画像与实施机制图画廊（真图一键套用） */}
      <div className={styles.panel}>
        <div className={styles.row} style={{ justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 12 }}>国奖精选封面、页框与信息图画廊（一键套用）</strong>
          <div className={styles.row} style={{ gap: 4 }}>
            {content.coverImage && (
              <button
                type="button"
                className={styles.btn}
                style={{ minHeight: 24, padding: '2px 7px', fontSize: 11 }}
                onClick={() => {
                  onUpdateReport(applyCoverImage(content, undefined), '已移除报告封面图并恢复默认主题色。');
                  setStatus('已移除报告封面图。');
                }}
              >
                移除封面
              </button>
            )}
            {content.frameImage && (
              <button
                type="button"
                className={styles.btn}
                style={{ minHeight: 24, padding: '2px 7px', fontSize: 11 }}
                onClick={() => {
                  onUpdateReport(applyFrameImage(content, undefined), '已移除报告页框装饰。');
                  setStatus('已移除报告页框。');
                }}
              >
                移除页框
              </button>
            )}
          </div>
        </div>
        <div className={styles.personaGrid} role="group" aria-label="国奖精选封面、边框与信息图画廊">
          {SHOWCASE_GALLERY_ITEMS.map(item => {
            const busy = applyingShowcaseId === item.id;
            const isWide =
              item.kind === 'demographic'
              || item.kind === 'roadmap'
              || item.kind === 'summary'
              || item.kind === 'overview';
            return (
              <button
                key={item.id}
                type="button"
                className={styles.showcaseCardBtn}
                style={{
                  gridTemplateColumns: isWide ? '44px minmax(0, 1fr)' : '36px minmax(0, 1fr)',
                }}
                disabled={anyBusy}
                onClick={() => void handleApplyShowcaseItem(item)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- static showcase PNG preview under /art/ */}
                <img
                  src={item.url}
                  alt={item.title}
                  style={{
                    width: isWide ? 44 : 36,
                    height: isWide ? 28 : 50,
                    objectFit: 'cover',
                    borderRadius: 4,
                    border: '1px solid rgba(15,23,42,0.12)',
                    background: '#fcfaf5',
                  }}
                />
                <span className={styles.showcaseCardMeta}>
                  <strong>{busy ? '正在套用…' : item.title}</strong>
                  <small>
                    <i
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        flex: 'none',
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: item.swatch,
                      }}
                    />
                    {item.subtitle}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 细分生图任务选择 */}
      <div className={styles.taskGrid} role="tablist" aria-label="生图任务类型">
        {REPORT_IMAGE_TASKS.map(t => (
          <button
            key={t.id}
            type="button"
            className={`${styles.segBtn} ${task === t.id ? styles.segBtnActive : ''}`}
            aria-pressed={task === t.id}
            onClick={() => handleSelectTask(t.id)}
          >
            {t.shortLabel}
          </button>
        ))}
      </div>

      {/* 3. 出图模式 + 目标章节 + 画面描述细调 */}
      <div className={styles.panel}>
        <div className={styles.row} style={{ flexWrap: 'nowrap' }}>
          <label className={styles.field} style={{ flex: isPageArtTask ? '1 1 0' : '1.6 1 0' }}>
            <span>出图模式</span>
            <select
              className={styles.select}
              aria-label="选择出图模式"
              value={modelId}
              onChange={e => {
                const nextModel = e.target.value;
                setModelId(nextModel);
                setPrompt(buildStudioPromptForSelection(content, task, targetSectionId || defaultSecId, nextModel));
              }}
            >
              {IMAGE_GEN_MODELS.map(m => (
                <option key={m.id} value={m.id}>
                  {friendlyEngineLabel(m)}
                </option>
              ))}
            </select>
          </label>
          {!isPageArtTask && (
            <label className={styles.field} style={{ flex: '1 1 0' }}>
              <span>插入目标章节</span>
              <select
                className={styles.select}
                aria-label="选择插入目标章节"
                value={targetSectionId}
                onChange={e => setTargetSectionId(e.target.value)}
              >
                {content.report
                  .filter(s => !/^(?:封面|目录)/u.test(s.title))
                  .map(s => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>

        <div className={styles.row} style={{ justifyContent: 'space-between' }}>
          <span className={styles.badge}>
            {isPageArtTask ? 'A4 竖版 (210:297)' : '16:9 横版 (1280×720)'} ·{' '}
            {providerReady[activeModelSpec.provider] ? '高清生图已就绪' : '标准矢量模式就绪'}
          </span>
          <div className={styles.row}>
            <button type="button" className={styles.btn} onClick={refreshPromptFromReport}>
              生成画面描述
            </button>
            <button
              type="button"
              className={styles.btn}
              aria-expanded={showGatewayConfig}
              onClick={() => setShowGatewayConfig(v => !v)}
            >
              {showGatewayConfig ? '收起设置' : '高级设置'}
            </button>
          </div>
        </div>

        {showGatewayConfig && (
          <div className={styles.itemCard} style={{ gap: 6 }}>
            <div className={styles.row}>
              <input
                type="password"
                className={styles.input}
                aria-label="个人图像服务密钥"
                style={{ flex: 1 }}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="填入个人图像服务密钥（留空使用平台默认通道）"
              />
            </div>
            <div className={styles.row}>
              <input
                className={styles.input}
                aria-label="自定义图像服务连接地址"
                style={{ flex: 1 }}
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="自定义服务连接地址（留空使用默认通道）"
              />
              <input
                className={styles.input}
                aria-label="指定绘图服务标识"
                style={{ flex: 1 }}
                value={customModelName}
                onChange={e => setCustomModelName(e.target.value)}
                placeholder={`指定绘图服务标识（默认 ${friendlyEngineLabel(activeModelSpec)}）`}
              />
            </div>
          </div>
        )}

        <div className={styles.stylePresetBar} role="group" aria-label="快捷美术风格预设">
          {STYLE_PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              className={styles.stylePresetChip}
              aria-pressed={stylePresetId === p.id}
              onClick={() => toggleStylePreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <label className={styles.field}>
          <span>
            {isGptImageTypographyCapable(modelId) && task !== 'report_frame'
              ? '高清图文创作描述（自动同步报告标题与真实样本占比）'
              : '主题视觉创作描述（严格零内嵌文字、零虚构刻度与数值）'}
          </span>
          <textarea
            className={styles.textarea}
            aria-label="画面创作描述"
            rows={4}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="自动依据报告标题、当前样本占比与章节主线生成画面描述…"
          />
        </label>

        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={anyBusy}
          onClick={() => void handleGenerate()}
        >
          {generating ? '⏳ 正在生成高清预览…' : '✦ 生成高清配图预览'}
        </button>
      </div>

      {/* 4. 实时预览与入文落盘 */}
      <div className={styles.panel}>
        {liveImageUrl && !isPageArtTask && (
          <div className={styles.segBar}>
            <button
              type="button"
              className={`${styles.segBtn} ${viewMode === 'live' ? styles.segBtnActive : ''}`}
              onClick={() => setViewMode('live')}
            >
              高清原图预览（入文推荐）
            </button>
            <button
              type="button"
              className={`${styles.segBtn} ${viewMode === 'vector' ? styles.segBtnActive : ''}`}
              onClick={() => setViewMode('vector')}
            >
              标准矢量预览（备选）
            </button>
          </div>
        )}

        {isPageArtTask ? (
          <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
            {activeA4PreviewSrc && (
              /* eslint-disable-next-line @next/next/no-img-element -- displays A4 data URL preview directly */
              <img
                key={activeA4PreviewSrc.slice(0, 80)}
                className={styles.previewImg}
                style={{
                  width: 'auto',
                  maxWidth: '100%',
                  height: 256,
                  aspectRatio: '210 / 297',
                  objectFit: 'cover',
                  background: task === 'report_frame'
                    ? 'repeating-conic-gradient(#f1f5f9 0% 25%, #ffffff 0% 50%) 50% / 14px 14px'
                    : '#fcfaf5',
                }}
                src={activeA4PreviewSrc}
                alt={activeTaskSpec.label}
              />
            )}
            {task === 'report_cover' && activePalettePreview && (
              <div className={styles.row} style={{ justifyContent: 'center', fontSize: 11, color: '#475569' }}>
                <span>联动图表色板</span>
                {(
                  [
                    ['主色', activePalettePreview.primary],
                    ['辅色', activePalettePreview.secondary],
                    ['对比色', activePalettePreview.opposite],
                  ] as const
                ).map(([name, hex]) => (
                  <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <i
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: 11,
                        height: 11,
                        borderRadius: 3,
                        background: hex,
                        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.14)',
                      }}
                    />
                    {name}·{formatChineseColorName(hex)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : viewMode === 'live' && liveImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- displays user/model generated 16:9 image data URL directly */
          <img
            key={liveImageUrl.slice(0, 64)}
            className={styles.previewImg}
            style={{ aspectRatio: '16 / 9', objectFit: 'contain', background: '#fcfaf5' }}
            src={liveImageUrl}
            alt={activeTaskSpec.label}
          />
        ) : (
          previewSvg && <div className={styles.previewSvg} dangerouslySetInnerHTML={{ __html: previewSvg }} />
        )}

        <div className={styles.row}>
          {isPageArtTask ? (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={anyBusy}
              onClick={() => void applyAsA4PageArt()}
            >
              ✦ 应用为 A4 {task === 'report_frame' ? '艺术页框' : '报告封面（正本+附录同步）'}
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={anyBusy}
              onClick={() => void insertInfographicIntoReport()}
            >
              ✦ {viewMode === 'live' && (latestSectionArt || liveImageUrl) ? '将此高清信息图写入报告章节' : '插入当前报告章节'}
            </button>
          )}
          {!isPageArtTask && (
            <button
              type="button"
              className={styles.btn}
              onClick={() => {
                if (previewSvg) onSaveArtifact?.(`生图-${activeTaskSpec.shortLabel}`, previewSvg);
                setStatus('已存入右侧灵感素材架。');
              }}
            >
              存入素材架
            </button>
          )}
          <button type="button" className={styles.btn} onClick={downloadAsset}>
            ↓ 下载资产
          </button>
        </div>
      </div>

      <div className={styles.statusBar} role="status" aria-live="polite">
        {status}
      </div>
    </div>
  );
}
