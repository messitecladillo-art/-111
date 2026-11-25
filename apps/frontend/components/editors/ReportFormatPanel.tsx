'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  CLEAN_BACKDROP_PRESETS,
  COVER_TYPOGRAPHY_STYLE_OPTIONS,
  buildTransparentCoverTypographySvg,
  createInitialCoverLayeredState,
  requestBackendCoverAssembly,
  resolveCoverReferenceAnchors,
  svgToDataUrl,
  type CleanBackdropPresetId,
  type CoverInkMode,
  type CoverLayeredState,
  type CoverPipelineMode,
  type CoverTypographyStyle,
} from '@/lib/cover-assembly';
import {
  COVER_CANDIDATE_PRESETS,
  FRAME_CANDIDATE_PRESETS,
  generateCoverCandidates,
  generateFrameCandidates,
  SHOWCASE_PAGE_ART_ASSETS,
  type CoverArtCandidateItem,
  type FrameArtCandidateItem,
} from '@/lib/agent/image-gen-engine';
import type { FigurePalette } from '@/lib/figure-palette';
import {
  coverHasEmbeddedTitle,
  coverImageFromFile,
  frameImageFromFile,
  pageArtDataUrl,
  presetCoverImageFromBlob,
  type CoverImage,
  type FrameImage,
} from '@/lib/page-art';
import {
  evaluateReportFormat, REPORT_FORMAT_PROFILES, reportFormatNotices,
  type ReportFormatSettings,
} from '@/lib/report-format';
import styles from './ReportFormatPanel.module.css';

type Props = {
  value: ReportFormatSettings;
  onChange: (settings: ReportFormatSettings) => void;
  sections: readonly { title: string }[];
  /** Whole-page cover artwork (shared across main report & appendix volume). */
  coverImage?: CoverImage;
  onCoverImage?: (cover: CoverImage | undefined, palette?: FigurePalette) => void;
  /** The figures' colours, taken from the cover. */
  figurePalette?: FigurePalette;
  /** Transparent thematic page frame behind every page after the cover. */
  frameImage?: FrameImage;
  onFrameImage?: (frame: FrameImage | undefined) => void;
  /** Optional active report title/subtitle/accent for 3-candidate generation. */
  reportTitle?: string;
  reportSubtitle?: string;
  accent?: 'teal' | 'blue' | 'burgundy';
};

const GROUPS = ['本科组', '专科组', '研究生组', '在华留学生组'];
const TRACKS = ['自主选题', '企业命题'];
const STAGES = ['知识赛', '校赛', '企业命题赛', '省赛', '全国赛初赛', '全国赛决赛'];

const MODE1_COVER_PRIORITY_IDS = [
  'cover-cand-f',
  'cover-cand-e',
  'cover-cand-c',
  'cover-cand-b',
  'cover-cand-d',
  'cover-cand-a',
] as const;

const MODE1_ORDERED_COVER_PRESETS = MODE1_COVER_PRIORITY_IDS.map(
  cid => COVER_CANDIDATE_PRESETS.find(preset => preset.id === cid)!,
).filter(Boolean);

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

const FORMAT_SHOWCASE_ITEMS = [
  {
    id: 'fmt-cover-teal',
    kind: 'cover' as const,
    url: SHOWCASE_PAGE_ART_ASSETS.covers.teal,
    title: '林青叠题封面',
    subtitle: '生态健康 · 松石青',
    swatch: '#0F766E',
  },
  {
    id: 'fmt-cover-blue',
    kind: 'cover' as const,
    url: SHOWCASE_PAGE_ART_ASSETS.covers.blue,
    title: '靛蓝叠题封面',
    subtitle: '科技零售 · 深海靛',
    swatch: '#234E80',
  },
  {
    id: 'fmt-cover-burgundy',
    kind: 'cover' as const,
    url: SHOWCASE_PAGE_ART_ASSETS.covers.burgundy,
    title: '绛红叠题封面',
    subtitle: '文化非遗 · 丹绯红',
    swatch: '#8A3449',
  },
  {
    id: 'fmt-frame-teal',
    kind: 'frame' as const,
    url: SHOWCASE_PAGE_ART_ASSETS.frames.teal,
    title: '林青流线艺术页框',
    subtitle: '生态金丝 · 透明版心',
    swatch: '#0F766E',
  },
  {
    id: 'fmt-frame-blue',
    kind: 'frame' as const,
    url: SHOWCASE_PAGE_ART_ASSETS.frames.blue,
    title: '靛蓝几何艺术页框',
    subtitle: '精密折线 · 透明版心',
    swatch: '#234E80',
  },
] as const;

/** One piece of skill-made page art: a thumbnail, what it does, and 3-candidate compare / upload / remove. */
function ArtRow<T extends CoverImage | FrameImage>({
  id,
  label,
  art,
  accept,
  hint,
  detail,
  warning,
  extra,
  aiActionLabel,
  presetActionLabel,
  aiBusy,
  onAiGenerate,
  onLoadPresets,
  onFile,
  onRemove,
}: {
  id: string;
  label: string;
  art?: T;
  accept: string;
  hint: string;
  detail: (art: T) => string;
  warning?: string;
  extra?: ReactNode;
  aiActionLabel?: string;
  presetActionLabel?: string;
  aiBusy?: boolean;
  onAiGenerate?: () => Promise<void>;
  onLoadPresets?: () => Promise<void>;
  onFile: (file: File) => Promise<void>;
  onRemove: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError('');
    try { await onFile(file); }
    catch (reason) { setError(reason instanceof Error ? reason.message : `${label}无法读取。`); }
    finally { setBusy(false); }
  };
  const runAi = async () => {
    if (!onAiGenerate) return;
    setError('');
    try { await onAiGenerate(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : `${label}候选生成失败。`); }
  };
  const runPresets = async () => {
    if (!onLoadPresets) return;
    setError('');
    try { await onLoadPresets(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : `${label}候选加载失败。`); }
  };
  const disabled = busy || Boolean(aiBusy);
  return <div className={styles.coverRow}>
    {/* eslint-disable-next-line @next/next/no-img-element -- the draft's own data URL; an image optimizer cannot serve it. */}
    {art ? <img className={styles.coverThumb} src={pageArtDataUrl(art)} alt={`当前${label}`} /> : <span className={styles.coverThumb} aria-hidden="true" />}
    <div className={styles.coverText}>
      <strong>{label}</strong>
      <p>{art ? detail(art) : hint}</p>
      {art && extra}
      {warning && <p className={styles.coverWarn}>{warning}</p>}
      {error && <p className={styles.coverWarn} role="alert">{error}</p>}
    </div>
    <div className={styles.coverActions} style={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}>
      {onAiGenerate && aiActionLabel && (
        <button
          type="button"
          className={styles.coverButton}
          disabled={disabled}
          onClick={() => void runAi()}
          style={{ borderColor: 'var(--wb-accent)', color: 'var(--wb-accent)', fontWeight: 600 }}
        >
          {aiBusy ? '并行生成 3 套中…' : aiActionLabel}
        </button>
      )}
      {onLoadPresets && presetActionLabel && (
        <button
          type="button"
          className={styles.coverButton}
          disabled={disabled}
          onClick={() => void runPresets()}
        >
          {presetActionLabel}
        </button>
      )}
      <label className={styles.coverButton} htmlFor={id}>{busy ? '处理中…' : art ? '本地更换' : `上传${label}`}<input id={id} aria-label={`上传${label}`} type="file" accept={accept} disabled={disabled} onChange={event => { void pick(event.target.files?.[0]); event.target.value = ''; }} /></label>
      {art && <button type="button" className={styles.coverRemove} disabled={disabled} onClick={() => { setError(''); onRemove(); }}>移除</button>}
    </div>
  </div>;
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

/** A selected layout and an applicable competition rule have separate receipts. */
export default function ReportFormatPanel({
  value,
  onChange,
  sections,
  coverImage,
  onCoverImage,
  figurePalette,
  frameImage,
  onFrameImage,
  reportTitle,
  reportSubtitle,
  accent = 'teal',
}: Props) {
  const id = useId();
  const [showcaseBusyId, setShowcaseBusyId] = useState<string | null>(null);
  const [aiCoverBusy, setAiCoverBusy] = useState(false);
  const [aiFrameBusy, setAiFrameBusy] = useState(false);
  const [coverCandidates, setCoverCandidates] = useState<CoverArtCandidateItem[]>([]);
  const [frameCandidates, setFrameCandidates] = useState<FrameArtCandidateItem[]>([]);
  const [selectedCoverCandId, setSelectedCoverCandId] = useState<string | null>(null);
  const [selectedFrameCandId, setSelectedFrameCandId] = useState<string | null>(null);
  const [zoomArt, setZoomArt] = useState<{
    title: string;
    badge: string;
    src: string;
    isFrame?: boolean;
    darkCheckerboard?: boolean;
  } | null>(null);
  const [showcaseStatus, setShowcaseStatus] = useState('');
  const [showcaseError, setShowcaseError] = useState('');
  const [applyingPresetId, setApplyingPresetId] = useState<string | null>(null);
  const [layeredBusy, setLayeredBusy] = useState<'assemble' | 'apply' | null>(null);
  const [layeredCover, setLayeredCover] = useState<CoverLayeredState>(() =>
    sanitizeLayeredState(
      createInitialCoverLayeredState({
        title: reportTitle?.trim() || '城市老年人智能健康监测服务采纳意愿实证研究',
        subtitle: reportSubtitle,
        presetId: 'f',
        mode: 'direct_illustrated',
      }),
    ),
  );
  const [layeredTitleEdited, setLayeredTitleEdited] = useState(false);
  const [syncedTitleSig, setSyncedTitleSig] = useState(`${reportTitle ?? ''}|${reportSubtitle ?? ''}`);
  const [customBackdropB64, setCustomBackdropB64] = useState('');
  const [customReferenceB64, setCustomReferenceB64] = useState('');
  const [customInkMode, setCustomInkMode] = useState<CoverInkMode | null>(null);
  const [cachedLayeredArt, setCachedLayeredArt] = useState<{ cover: CoverImage; palette: FigurePalette } | null>(null);
  const zoomTriggerRef = useRef<HTMLElement | null>(null);

  const openZoomArt = useCallback(
    (next: NonNullable<typeof zoomArt>, trigger?: EventTarget | null) => {
      if (trigger instanceof HTMLElement) {
        zoomTriggerRef.current = trigger;
      } else if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        zoomTriggerRef.current = document.activeElement;
      }
      setZoomArt(next);
    },
    [],
  );

  const closeZoomArt = useCallback(() => {
    setZoomArt(null);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const prev = zoomTriggerRef.current;
        zoomTriggerRef.current = null;
        if (prev && prev.isConnected) prev.focus();
      });
    }
  }, []);

  const isZoomOpen = zoomArt !== null;
  useEffect(() => {
    if (!isZoomOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeZoomArt();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isZoomOpen, closeZoomArt]);

  const incomingTitleSig = `${reportTitle ?? ''}|${reportSubtitle ?? ''}`;
  if (syncedTitleSig !== incomingTitleSig) {
    setSyncedTitleSig(incomingTitleSig);
    if (!layeredTitleEdited && reportTitle?.trim()) {
      const fresh = sanitizeLayeredState(
        createInitialCoverLayeredState({
          title: reportTitle,
          subtitle: reportSubtitle,
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
  const evaluation = evaluateReportFormat(value);
  const notices = reportFormatNotices(sections);
  const update = (patch: Partial<ReportFormatSettings>) => onChange({ ...value, ...patch });

  const resolveActiveTitle = () => {
    if (reportTitle?.trim()) return reportTitle.trim();
    if (typeof document !== 'undefined') {
      const domInput = document.querySelector<HTMLInputElement>('input[aria-label="作品名称"]');
      if (domInput?.value?.trim()) return domInput.value.trim();
    }
    return '社会民生与消费体验专题实证研究';
  };

  const scopeSelect = (key: 'group' | 'track' | 'stage', title: string, choices: string[]) => (
    <label htmlFor={id + '-' + key}>{title}
      <select id={id + '-' + key} value={value[key]} onChange={event => update({ [key]: event.target.value })}>
        <option value="">请选择</option>
        {value[key] && !choices.includes(value[key]) && <option value={value[key]}>{value[key]}</option>}
        {choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
      </select>
    </label>
  );

  const handleGenerateCoverCandidates = async () => {
    if (!onCoverImage) return;
    setAiCoverBusy(true);
    setShowcaseError('');
    setShowcaseStatus('正在并行生成 6 套跨色系/跨媒介“益普索杯”封面候选（首选晶透光学微距 / 宋韵宣纸青金 / 瑞士数据蓝图 / 丹青朱砂竖排 / 靛蓝琥珀剪纸 / 暖阳胶片纪实）…');
    try {
      const activeTitle = resolveActiveTitle();
      const res = await generateCoverCandidates({
        title: activeTitle,
        subtitle: reportSubtitle ?? '',
        accent,
        modelId: 'gpt-image-2',
        quality: 'high',
      });
      setCoverCandidates(res.candidates);
      setShowcaseStatus('✓ 已生成 6 套跨风格“益普索杯”封面候选（默认推荐晶透光学玻璃静物微距风），请点选“采纳此版”！');
    } catch (err) {
      setShowcaseError(err instanceof Error ? err.message : '封面候选生成失败。');
    } finally {
      setAiCoverBusy(false);
    }
  };

  const handleLoadPresetCoverCandidates = async () => {
    if (!onCoverImage) return;
    setAiCoverBusy(true);
    setShowcaseError('');
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
      setShowcaseStatus('已展开 6 套跨媒介“益普索杯”封面候选（默认推荐晶透光学玻璃静物微距风），点击“采纳此版”即可实时同步正本与附录！');
    } catch (err) {
      setShowcaseError(err instanceof Error ? err.message : '预置封面候选加载失败。');
    } finally {
      setAiCoverBusy(false);
    }
  };

  const handleGenerateFrameCandidates = async () => {
    if (!onFrameImage) return;
    setAiFrameBusy(true);
    setShowcaseError('');
    setShowcaseStatus('正在并行生成 A / B / C 三套不同风格的透明 A4 艺术页框候选供对比挑选…');
    try {
      const activeTitle = resolveActiveTitle();
      const res = await generateFrameCandidates({
        title: activeTitle,
        accent,
        modelId: 'gpt-image-2',
        quality: 'high',
      });
      setFrameCandidates(res.candidates);
      setShowcaseStatus('✓ 已生成 3 套透明页框候选（植物水彩 / 学院几何 / 东方双线），请在下方并列卡片中点选！');
    } catch (err) {
      setShowcaseError(err instanceof Error ? err.message : '三套页框候选生成失败。');
    } finally {
      setAiFrameBusy(false);
    }
  };

  const handleLoadPresetFrameCandidates = async () => {
    if (!onFrameImage) return;
    setAiFrameBusy(true);
    setShowcaseError('');
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
      setShowcaseStatus('已展开 3 套透明页框候选（并列保留“无边框”选项），点击即可实时切换纸面效果！');
    } catch (err) {
      setShowcaseError(err instanceof Error ? err.message : '预置页框候选加载失败。');
    } finally {
      setAiFrameBusy(false);
    }
  };

  const applyShowcaseAsset = async (item: (typeof FORMAT_SHOWCASE_ITEMS)[number]) => {
    if (item.kind === 'cover' && !onCoverImage) return;
    if (item.kind === 'frame' && !onFrameImage) return;
    setShowcaseBusyId(item.id);
    setShowcaseError('');
    setShowcaseStatus('');
    try {
      const res = await fetch(item.url);
      if (!res.ok) throw new Error(`无法加载精选素材（状态码 ${res.status}）。`);
      const blob = await res.blob();
      const file = new File([blob], item.url.split('/').pop() || 'showcase.png', { type: 'image/png' });
      if (item.kind === 'cover' && onCoverImage) {
        const { cover, palette } = await coverImageFromFile(
          file,
          `国奖精选 A4 封面底图“${item.title}”（报告正副标题自动叠排于顶部留白负空间，正本与附录共用，同步提取图表配色）。`,
        );
        onCoverImage(cover, palette);
        setShowcaseStatus(`已套用“${item.title}”（正本与附录共用封面），全篇图表配色已同步更新。`);
      } else if (item.kind === 'frame' && onFrameImage) {
        const frame = await frameImageFromFile(
          file,
          `国奖精选透明 A4 艺术页框“${item.title}”（装饰仅在页边，正文版心与页码区全透明）。`,
        );
        onFrameImage(frame);
        setShowcaseStatus(`已套用“${item.title}”（透明 A4 艺术页框）。`);
      }
    } catch (err) {
      setShowcaseError(err instanceof Error ? err.message : '精选资产应用失败。');
    } finally {
      setShowcaseBusyId(null);
    }
  };

  const handleAdoptDirectPreset = async (preset: (typeof COVER_CANDIDATE_PRESETS)[number]) => {
    if (!onCoverImage) return;
    const live = coverCandidates.find(c => c.id === preset.id);
    if (live) {
      setSelectedCoverCandId(live.id);
      onCoverImage(live.coverImage, live.figurePalette);
      setShowcaseStatus(`✓ 已采纳封面“${live.label}”（正本与附录同步，全篇图表色板已联动更新）！`);
      return;
    }
    setApplyingPresetId(preset.id);
    setShowcaseError('');
    try {
      const res = await fetch(preset.staticAssetUrl);
      if (!res.ok) throw new Error(`候选封面加载失败 (${res.status})`);
      const blob = await res.blob();
      const { cover, palette } = await presetCoverImageFromBlob(
        blob,
        `国奖出版级 A4 图文一体封面候选（${preset.label}，题名字形在图中）`,
      );
      setSelectedCoverCandId(preset.id);
      onCoverImage(cover, palette);
      setShowcaseStatus(`✓ 已采纳封面“${preset.label}”（正本与附录同步，全篇图表色板已联动更新）！`);
    } catch (err) {
      setShowcaseError(err instanceof Error ? err.message : '直出封面采纳失败。');
    } finally {
      setApplyingPresetId(null);
    }
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

  const setCoverPipelineMode = (mode: CoverPipelineMode) => {
    setLayeredCover(prev => ({ ...prev, mode }));
    setShowcaseError('');
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
    setShowcaseStatus(
      preset.inkMode === 'light_on_dark'
        ? `✓ 已切换至“${preset.label}”（自动启用暗色棋盘格与暖金/象牙白发光矢量字形）。`
        : `✓ 已切换至“${preset.label}”。`,
    );
  };

  const handleJumpToLayeredFromMode1 = (candidateId: string) => {
    const shortKey = candidateId.replace(/^cover-cand-/u, '');
    const matched = CLEAN_BACKDROP_PRESETS.find(p => String(p.id) === shortKey) ?? CLEAN_BACKDROP_PRESETS[0];
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
    setShowcaseStatus(`✓ 已载入同款无字底图“${matched.label}”进入分层组装模式！`);
  };

  const handleToggleLayeredInkMode = () => {
    const currentInk = customInkMode ?? layeredCover.inkMode ?? layeredCover.anchors.inkMode;
    const nextInk: CoverInkMode = currentInk === 'light_on_dark' ? 'dark_on_light' : 'light_on_dark';
    setCustomInkMode(nextInk);
    setCachedLayeredArt(null);
    setLayeredCover(prev => recomputeLayeredTypography(prev, {}, nextInk));
    setShowcaseStatus(
      nextInk === 'light_on_dark'
        ? '已切换为暗底浅金配色，棋盘格已切为暗色底，书法字形呈现暖金与象牙白。'
        : '已切换为明底墨字配色，棋盘格恢复浅色底，书法字形呈现深海墨色。',
    );
  };

  const handleSelectTypographyStyle = (style: CoverTypographyStyle) => {
    setCachedLayeredArt(null);
    setLayeredCover(prev => recomputeLayeredTypography(prev, { typographyStyle: style }));
  };

  const handleSyncLayeredFromReport = () => {
    const activeTitle = resolveActiveTitle();
    setLayeredTitleEdited(false);
    setCachedLayeredArt(null);
    setLayeredCover(prev =>
      recomputeLayeredTypography(prev, {
        title: activeTitle || prev.title,
        subtitle: reportSubtitle || prev.subtitle,
      }),
    );
    setShowcaseStatus('✓ 已同步当前报告标题与副标题至透明矢量艺术字图层。');
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
          setLayeredCover(prev => recomputeLayeredTypography(prev, { backdropUrl: dataUrl }, detectedInk));
          setShowcaseStatus(
            `✓ 已载入自定义无字背景底图“${file.name}”（自动适配${detectedInk === 'light_on_dark' ? '暗底浅金' : '明底墨字'}）。`,
          );
        });
      } else {
        setCustomReferenceB64(b64);
        setLayeredCover(prev => ({ ...prev, referenceUrl: dataUrl, assembledDataUrl: '', assembledSource: 'pending' }));
        setShowcaseStatus(`✓ 已载入自定义版式参照图“${file.name}”。`);
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
    setShowcaseStatus('✓ 已导出 1000×1414 透明背景矢量书法字稿。');
  };

  const resolveLayeredCoverAndPalette = async (): Promise<{
    cover: CoverImage;
    palette: FigurePalette;
    source: 'backend_bezier' | 'client_canvas';
  }> => {
    const styleLabel =
      COVER_TYPOGRAPHY_STYLE_OPTIONS.find(o => o.id === layeredCover.typographyStyle)?.shortLabel
      ?? layeredCover.typographyStyle;
    const effectiveInk: CoverInkMode = customInkMode ?? layeredCover.inkMode ?? layeredCover.anchors.inkMode;
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
    setLayeredBusy('assemble');
    setShowcaseError('');
    setShowcaseStatus('正在对照参照图版式锚点执行无字底图 + 透明矢量书法艺术字高精合成…');
    try {
      const { source } = await resolveLayeredCoverAndPalette();
      setShowcaseStatus(
        source === 'backend_bezier'
          ? '✓ 已完成高清平滑书法曲线与底图分层合成（正本与附录同款尺寸，全篇图表主色已联动）！'
          : '✓ 已完成无字底图与透明矢量艺术字对位合成（正本与附录同款尺寸，全篇图表主色已联动）！',
      );
    } catch (err) {
      setShowcaseError(err instanceof Error ? err.message : '封面分层合成失败。');
    } finally {
      setLayeredBusy(null);
    }
  };

  const handleApplyLayeredCover = async () => {
    if (!onCoverImage) return;
    setLayeredBusy('apply');
    setShowcaseError('');
    try {
      const resolved = cachedLayeredArt
        ? { ...cachedLayeredArt, source: layeredCover.assembledSource === 'backend_bezier' ? ('backend_bezier' as const) : ('client_canvas' as const) }
        : await resolveLayeredCoverAndPalette();
      onCoverImage(resolved.cover, resolved.palette);
      setShowcaseStatus('✓ 已应用分层组装封面至正本与附录卷，全篇图表色板已联动更新！');
    } catch (err) {
      setShowcaseError(err instanceof Error ? err.message : '分层组装封面应用失败。');
    } finally {
      setLayeredBusy(null);
    }
  };

  const visibleShowcaseItems = FORMAT_SHOWCASE_ITEMS.filter(
    item => (item.kind === 'cover' && Boolean(onCoverImage)) || (item.kind === 'frame' && Boolean(onFrameImage)),
  );
  const anyAsyncBusy =
    Boolean(showcaseBusyId)
    || aiCoverBusy
    || aiFrameBusy
    || Boolean(applyingPresetId)
    || Boolean(layeredBusy);

  const isDarkLayeredInk =
    (customInkMode
      ?? layeredCover.inkMode
      ?? layeredCover.anchors.inkMode
      ?? (layeredCover.selectedPresetId === 'd' ? 'light_on_dark' : 'dark_on_light'))
    === 'light_on_dark';
  const layeredCheckerboardBg = isDarkLayeredInk
    ? 'repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 50% / 12px 12px'
    : 'repeating-conic-gradient(#e2e8f0 0% 25%, #ffffff 0% 50%) 50% / 12px 12px';

  return <details className={styles.panel}>
    <summary className={styles.summary}>
      <span>报告格式</span>
      <span className={styles.profileName}>{evaluation.profile.label}</span>
      <span className={styles.status} data-state={evaluation.status}>{evaluation.label}</span>
    </summary>
    <div className={styles.content}>
      <div className={styles.scope}>
        <label htmlFor={id + '-edition'}>届次<select id={id + '-edition'} value={value.edition} onChange={event => update({ edition: event.target.value })}>
          <option>第十七届</option><option>第十六届</option>
        </select></label>
        {scopeSelect('group', '组别', GROUPS)}
        <label htmlFor={id + '-region'}>赛区<input id={id + '-region'} value={value.region} maxLength={80} placeholder="如：湖北" onChange={event => update({ region: event.target.value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, '') })} /></label>
        {scopeSelect('track', '赛道', TRACKS)}
        {scopeSelect('stage', '阶段', STAGES)}
      </div>
      <div className={styles.profileRow}>
        <label htmlFor={id + '-profile'}>排版方案<select id={id + '-profile'} value={value.profileId} onChange={event => update({ profileId: event.target.value })}>
          {REPORT_FORMAT_PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
        </select></label>
        <p className={styles.scopeStatus} role="status" data-state={evaluation.status}>{evaluation.detail}</p>
      </div>
      <dl className={styles.specs}>
        <div><dt>纸张与页边距</dt><dd>A4 · 上下 25.4 / 左右 31.8 mm</dd></div>
        <div><dt>正文</dt><dd>宋体 12 pt · 1.25 倍行距</dd></div>
        <div><dt>标题</dt><dd>一级黑体 15 pt · 二级黑体 14 pt</dd></div>
        <div><dt>图表题</dt><dd>宋体 12 pt · 图下表上 · 居中</dd></div>
      </dl>
      <div className={styles.options}>
        <label htmlFor={id + '-part'}>导出部分<select id={id + '-part'} value={value.options.part} onChange={event => {
          const part = event.target.value as 'main' | 'appendix';
          update({ options: { ...value.options, part } });
        }}><option value="main">报告正文</option><option value="appendix">附录</option></select></label>
        <label htmlFor={id + '-indent'}>首行缩进<select id={id + '-indent'} value={value.options.firstLineChars} onChange={event => update({ options: { ...value.options, firstLineChars: Number(event.target.value) as 0 | 2 } })}>
          <option value={2}>2 字符</option><option value={0}>不缩进</option>
        </select></label>
        <div className={styles.checks}>
          <label className={styles.check} htmlFor={id + '-cover'}><input id={id + '-cover'} type="checkbox" checked={value.options.includeCover} onChange={event => update({ options: { ...value.options, includeCover: event.target.checked } })} />标题页</label>
          <label className={styles.check} htmlFor={id + '-toc'}><input id={id + '-toc'} type="checkbox" checked={value.options.includeToc} onChange={event => update({ options: { ...value.options, includeToc: event.target.checked } })} />目录</label>
          <label className={styles.check} htmlFor={id + '-pages'}><input id={id + '-pages'} type="checkbox" checked={value.options.numberPages} onChange={event => update({ options: { ...value.options, numberPages: event.target.checked } })} />页码</label>
        </div>
      </div>
      {onCoverImage && <ArtRow id={id + '-cover-image'} label="封面图" art={coverImage} accept="image/png,image/jpeg" onRemove={() => onCoverImage(undefined)}
        aiActionLabel="✨ 生成 6 套封面候选对比"
        presetActionLabel="📚 预置 6 套对比"
        aiBusy={aiCoverBusy}
        onAiGenerate={handleGenerateCoverCandidates}
        onLoadPresets={handleLoadPresetCoverCandidates}
        hint="支持并行生成或载入 6 套跨媒介高差异封面候选（默认推荐晶透光学玻璃静物微距风，及宣纸青金、瑞士数据蓝图、丹青朱砂竖排、靛蓝琥珀剪纸、暖阳胶片大刊风），内置“益普索杯”第十七届全国大学生市场调查与分析大赛赛事全称、非板正书法艺术字选题（横排或竖排）与盲审合规参赛团队，正本与附录同款共用。"
        detail={art =>
          coverHasEmbeddedTitle(art)
            ? `出版级图文一体整页 A4 封面（题名已融合在图中，正本与附录卷同款共用；纸面画布、可编辑文档与学术排版稿一致）。${art.widthPx}×${art.heightPx} 像素。`
            : `整页铺满 A4 封面底图，报告正副标题自动叠排于顶部留白负空间（正本与附录卷共用）。${art.widthPx}×${art.heightPx} 像素。`
        }
        warning={!value.options.includeCover && coverImage ? '“标题页”未勾选，导出时不含封面。' : ''}
        onFile={file => coverImageFromFile(file, `封面底图“${file.name.slice(0, 120)}”（A4 竖版留白构图，报告正副标题自动叠排于顶部负空间，同步提取图表配色）。`).then(({ cover, palette }) => onCoverImage(cover, palette))}
        extra={figurePalette && <p className={styles.palette}>图表配色取自封面{([['主色', figurePalette.primary], ['辅色', figurePalette.secondary], ['反向', figurePalette.opposite]] as const).map(([name, hex]) => <span key={name} className={styles.swatch} title={name}><i style={{ background: hex }} />{name}</span>)}</p>} />}

      {onCoverImage && (
        <div
          role="region"
          aria-label="封面设计工作台"
          style={{
            border: '1px solid var(--wb-line)',
            borderRadius: 10,
            padding: 14,
            display: 'grid',
            gap: 12,
            background: 'var(--wb-surface)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'grid', gap: 2 }}>
              <strong style={{ fontSize: 13 }}>“益普索杯”A4 封面设计工作台（正本与附录同步共用）</strong>
              <span style={{ fontSize: 11.5, color: 'var(--wb-muted)' }}>
                {layeredCover.mode === 'layered_assembly'
                  ? '依据版面留白基准将纯无字底图与全透明矢量书法题名精准叠合，杜绝字形错漏'
                  : '内置 6 套跨媒介第十七届国奖级整页封面（默认推荐晶透光学玻璃静物微距风），点击即同步正本与附录'}
              </span>
            </div>

            {/* Apple Segmented Controller */}
            <div
              role="tablist"
              aria-label="封面设计方式"
              style={{
                display: 'inline-flex',
                gap: 4,
                padding: 3,
                borderRadius: 9,
                background: 'rgba(15,23,42,0.05)',
                border: '1px solid var(--wb-line)',
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={layeredCover.mode === 'direct_illustrated'}
                onClick={() => setCoverPipelineMode('direct_illustrated')}
                style={{
                  padding: '5px 12px',
                  border: 0,
                  borderRadius: 7,
                  font: 'inherit',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: layeredCover.mode === 'direct_illustrated' ? 'var(--wb-solid, #ffffff)' : 'transparent',
                  color: layeredCover.mode === 'direct_illustrated' ? 'var(--wb-text)' : 'var(--wb-muted)',
                  boxShadow: layeredCover.mode === 'direct_illustrated' ? '0 1px 3px rgba(0,0,0,0.09)' : 'none',
                }}
              >
                整页封面选型
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={layeredCover.mode === 'layered_assembly'}
                onClick={() => setCoverPipelineMode('layered_assembly')}
                style={{
                  padding: '5px 12px',
                  border: 0,
                  borderRadius: 7,
                  font: 'inherit',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: layeredCover.mode === 'layered_assembly' ? 'var(--wb-solid, #ffffff)' : 'transparent',
                  color: layeredCover.mode === 'layered_assembly' ? 'var(--wb-text)' : 'var(--wb-muted)',
                  boxShadow: layeredCover.mode === 'layered_assembly' ? '0 1px 3px rgba(0,0,0,0.09)' : 'none',
                }}
              >
                底图与题名精调
              </button>
            </div>
          </div>

          {layeredCover.mode === 'direct_illustrated' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(176px, 1fr))', gap: 10 }}>
              {MODE1_ORDERED_COVER_PRESETS.map(preset => {
                const liveCand = coverCandidates.find(c => c.id === preset.id);
                const src = liveCand ? pageArtDataUrl(liveCand.coverImage) : preset.staticAssetUrl;
                const isAdopted = selectedCoverCandId === preset.id;
                const isBusyThis = applyingPresetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    style={{
                      display: 'grid',
                      gap: 6,
                      padding: 10,
                      borderRadius: 8,
                      border: isAdopted ? '2px solid var(--wb-accent)' : '1px solid var(--wb-line)',
                      background: 'var(--wb-solid, #ffffff)',
                    }}
                  >
                    <div style={{ position: 'relative' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- candidate A4 cover preview */}
                      <img
                        src={src}
                        alt={preset.label}
                        style={{ width: '100%', aspectRatio: '210 / 297', objectFit: 'cover', borderRadius: 4, cursor: 'zoom-in' }}
                        onClick={e => openZoomArt({ title: preset.label, badge: preset.badge, src }, e.currentTarget)}
                      />
                      <button
                        type="button"
                        onClick={e => openZoomArt({ title: preset.label, badge: preset.badge, src }, e.currentTarget)}
                        style={{ position: 'absolute', right: 6, bottom: 6, fontSize: 11, padding: '2px 6px', borderRadius: 4, border: 'none', background: 'rgba(15,23,42,0.7)', color: '#fff', cursor: 'pointer' }}
                      >
                        🔍 放大预览
                      </button>
                    </div>
                    <strong style={{ fontSize: 12.5 }}>{preset.label}</strong>
                    <span style={{ fontSize: 11.5, color: 'var(--wb-muted)' }}>{preset.badge}</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
                      <button
                        type="button"
                        className={styles.coverButton}
                        disabled={anyAsyncBusy}
                        style={{ borderColor: 'var(--wb-accent)', color: 'var(--wb-accent)', fontWeight: 600, justifyContent: 'center' }}
                        onClick={() => void handleAdoptDirectPreset(preset)}
                      >
                        {isBusyThis ? '正在同步…' : isAdopted ? '✓ 已采纳当前封面' : '采纳此版（正本+附录）'}
                      </button>
                      <button
                        type="button"
                        className={styles.coverButton}
                        disabled={anyAsyncBusy}
                        title="切换至同款无字底图自由改写题名并导出透明矢量字稿"
                        onClick={() => handleJumpToLayeredFromMode1(preset.id)}
                      >
                        分层改字
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {/* 全 6 套对称无字底图预设（F / E / C / B / D / A） + 明暗字色切换 + 自定义上传 */}
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 12 }}>全 6 套对称无字底图预设（F / E / C / B / D / A，与整页封面方案一一对应）</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button
                      type="button"
                      className={styles.coverButton}
                      aria-pressed={isDarkLayeredInk}
                      onClick={handleToggleLayeredInkMode}
                      style={{
                        fontSize: 12,
                        borderColor: isDarkLayeredInk ? '#b45309' : undefined,
                        color: isDarkLayeredInk ? '#b45309' : undefined,
                      }}
                    >
                      {isDarkLayeredInk ? '🌙 暗底浅金字形' : '☀️ 明底深墨字形'}
                    </button>
                    <label className={styles.coverButton} htmlFor={id + '-custom-backdrop'}>
                      上传无字底图
                      <input
                        id={id + '-custom-backdrop'}
                        aria-label="上传无字底图"
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={e => {
                          handleCustomLayerUpload('backdrop', e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <label className={styles.coverButton} htmlFor={id + '-custom-ref'}>
                      上传参照图
                      <input
                        id={id + '-custom-ref'}
                        aria-label="上传参照图"
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={e => {
                          handleCustomLayerUpload('reference', e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button type="button" className={styles.coverButton} onClick={handleSyncLayeredFromReport}>
                      ↻ 同步当前作品题名
                    </button>
                  </div>
                </div>

                <div
                  role="group"
                  aria-label="六套对称无字底图预设"
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(156px, 1fr))', gap: 8 }}
                >
                  {CLEAN_BACKDROP_PRESETS.map(bp => {
                    const active = layeredCover.selectedPresetId === bp.id && !customBackdropB64;
                    const presetDark = bp.inkMode === 'light_on_dark' || bp.anchors.inkMode === 'light_on_dark' || bp.id === 'd';
                    return (
                      <button
                        key={bp.id}
                        type="button"
                        className={styles.coverButton}
                        aria-pressed={active}
                        title={`${bp.label} — ${bp.badge}`}
                        onClick={() => handleSelectBackdropPreset(bp.id)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '32px minmax(0, 1fr)',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 8px',
                          textAlign: 'left',
                          borderColor: active ? 'var(--wb-accent)' : undefined,
                          boxShadow: active ? 'inset 0 0 0 1px var(--wb-accent)' : undefined,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- miniature clean backdrop preview */}
                        <img
                          src={bp.backdropUrl}
                          alt={bp.label}
                          style={{
                            width: 32,
                            aspectRatio: '210 / 297',
                            objectFit: 'cover',
                            borderRadius: 3,
                            border: '1px solid var(--wb-line)',
                          }}
                        />
                        <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                          <strong style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: active ? 'var(--wb-accent)' : 'var(--wb-text)' }}>
                            {bp.shortLabel || bp.label}
                          </strong>
                          <span style={{ fontSize: 10.5, color: presetDark ? '#b45309' : 'var(--wb-muted)' }}>
                            {presetDark ? '暗底浅金' : bp.anchors.titleDirection === 'vertical' ? '竖排留白' : '横排留白'}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div role="group" aria-label="矢量书法艺术字风格" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {COVER_TYPOGRAPHY_STYLE_OPTIONS.map(opt => {
                  const active = layeredCover.typographyStyle === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={styles.coverButton}
                      aria-pressed={active}
                      title={opt.badge}
                      onClick={() => handleSelectTypographyStyle(opt.id)}
                      style={{
                        borderRadius: 999,
                        padding: '4px 12px',
                        fontSize: 12,
                        borderColor: active ? 'var(--wb-accent)' : undefined,
                        color: active ? 'var(--wb-accent)' : undefined,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* 四项封面文字实时编辑 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                <label htmlFor={id + '-comp-name'}>
                  赛事届数全称
                  <input
                    id={id + '-comp-name'}
                    value={layeredCover.competitionName}
                    onChange={e => updateLayeredTextField('competitionName', e.target.value)}
                  />
                </label>
                <label htmlFor={id + '-art-title'}>
                  艺术字主标题（支持“核心字”高亮）
                  <input
                    id={id + '-art-title'}
                    value={layeredCover.title}
                    onChange={e => updateLayeredTextField('title', e.target.value)}
                  />
                </label>
                <label htmlFor={id + '-art-sub'}>
                  实证副标题
                  <input
                    id={id + '-art-sub'}
                    value={layeredCover.subtitle}
                    onChange={e => updateLayeredTextField('subtitle', e.target.value)}
                  />
                </label>
                <label htmlFor={id + '-team-name'}>
                  盲审队名（自动渲染为“参赛团队：XXX”）
                  <input
                    id={id + '-team-name'}
                    value={layeredCover.teamName}
                    onChange={e => updateLayeredTextField('teamName', e.target.value)}
                  />
                </label>
              </div>

              {/* 4 步可视化分层组装面板 */}
              <div
                role="group"
                aria-label="四步封面分层合成预览"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 12 }}
              >
                {/* ① 参照图 */}
                <div style={{ border: '1px solid var(--wb-line)', borderRadius: 8, padding: 10, display: 'grid', gap: 6, background: 'var(--wb-solid, #ffffff)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 12 }}>① 参照图</strong>
                    <span style={{ fontSize: 11, color: 'var(--wb-muted)' }}>
                      {layeredCover.anchors.titleDirection === 'vertical' ? '竖排留白参考' : '横排留白参考'}
                    </span>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element -- stage 1 reference cover */}
                  <img
                    src={layeredCover.referenceUrl}
                    alt="第一步版式参照图"
                    style={{ width: '100%', aspectRatio: '210 / 297', objectFit: 'cover', borderRadius: 4, cursor: 'zoom-in' }}
                    onClick={e =>
                      openZoomArt(
                        {
                          title: '① 版式参照图',
                          badge: '顶部眉栏、主标题与底部署名区版式对位参考',
                          src: layeredCover.referenceUrl,
                        },
                        e.currentTarget,
                      )
                    }
                  />
                  <span style={{ fontSize: 11, color: 'var(--wb-muted)' }}>
                    顶部与题区预留留白
                  </span>
                </div>

                {/* ② 无字背景底图 */}
                <div style={{ border: '1px solid var(--wb-line)', borderRadius: 8, padding: 10, display: 'grid', gap: 6, background: 'var(--wb-solid, #ffffff)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 12 }}>② 无字背景底图</strong>
                    <span style={{ fontSize: 11, color: 'var(--wb-accent)' }}>零文字净空</span>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element -- stage 2 clean backdrop */}
                  <img
                    src={layeredCover.backdropUrl}
                    alt="第二步无字背景底图"
                    style={{ width: '100%', aspectRatio: '210 / 297', objectFit: 'cover', borderRadius: 4, cursor: 'zoom-in' }}
                    onClick={e =>
                      openZoomArt(
                        {
                          title: '② 纯无字背景底图',
                          badge: '顶部呼吸留白与底部署名净空无字底图',
                          src: layeredCover.backdropUrl,
                        },
                        e.currentTarget,
                      )
                    }
                  />
                  <span style={{ fontSize: 11, color: 'var(--wb-muted)' }}>纯净无字底图画面</span>
                </div>

                {/* ③ 矢量化透明艺术字 */}
                <div style={{ border: '1px solid var(--wb-line)', borderRadius: 8, padding: 10, display: 'grid', gap: 6, background: 'var(--wb-solid, #ffffff)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 12 }}>③ 矢量化透明艺术字</strong>
                    <span style={{ fontSize: 11, color: isDarkLayeredInk ? '#b45309' : 'var(--wb-accent)', fontWeight: 600 }}>
                      {isDarkLayeredInk ? '暗底浅金 · ' : ''}
                      {layeredCover.vectorTypographySvg.includes('<path') ? '高清平滑曲线' : '透明矢量字层'}
                    </span>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element -- stage 3 transparent vector typography */}
                  <img
                    src={layeredCover.vectorTypographyDataUrl}
                    alt="第三步矢量化透明艺术字"
                    data-checkerboard={isDarkLayeredInk ? 'dark' : 'light'}
                    style={{
                      width: '100%',
                      aspectRatio: '210 / 297',
                      objectFit: 'contain',
                      borderRadius: 4,
                      background: layeredCheckerboardBg,
                      cursor: 'zoom-in',
                    }}
                    onClick={e =>
                      openZoomArt(
                        {
                          title: '③ 矢量化透明艺术字（棋盘格代表全透明区域）',
                          badge: isDarkLayeredInk
                            ? '暗色格底 · 暖金与象牙白无背景框矢量书法字层'
                            : '无背景框透明矢量书法字层',
                          src: layeredCover.vectorTypographyDataUrl,
                          isFrame: true,
                          darkCheckerboard: isDarkLayeredInk,
                        },
                        e.currentTarget,
                      )
                    }
                  />
                  <button
                    type="button"
                    className={styles.coverButton}
                    style={{ justifyContent: 'center', fontSize: 11.5, padding: '4px 8px' }}
                    onClick={handleDownloadLayeredTypographySvg}
                  >
                    ↓ 导出透明矢量字稿
                  </button>
                </div>

                {/* ④ 对照组装成品 */}
                <div style={{ border: '2px solid var(--wb-accent)', borderRadius: 8, padding: 10, display: 'grid', gap: 6, background: 'var(--wb-solid, #ffffff)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 12 }}>④ 对照组装成品</strong>
                    <span style={{ fontSize: 11, color: 'var(--wb-accent)', fontWeight: 600 }}>
                      {layeredCover.assembledSource === 'backend_bezier'
                        ? '✓ 高清精绘合成'
                        : layeredCover.assembledSource === 'client_canvas'
                          ? '✓ 已合成成品'
                          : '实时叠合预览'}
                    </span>
                  </div>
                  {layeredCover.assembledDataUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- stage 4 assembled cover */
                    <img
                      src={layeredCover.assembledDataUrl}
                      alt="第四步对照组装成品"
                      style={{ width: '100%', aspectRatio: '210 / 297', objectFit: 'cover', borderRadius: 4, cursor: 'zoom-in' }}
                      onClick={e =>
                        openZoomArt(
                          {
                            title: '④ 对照组装成品（A4 竖版）',
                            badge:
                              layeredCover.assembledSource === 'backend_bezier'
                                ? '高清平滑书法曲线与无字底图精细合成'
                                : '无字底图与透明矢量艺术字对位合成',
                            src: layeredCover.assembledDataUrl,
                          },
                          e.currentTarget,
                        )
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
                  <span style={{ fontSize: 11, color: 'var(--wb-muted)' }}>1000×1414 正本与附录共用</span>
                </div>
              </div>

              {/* 组装与套用按钮栏 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className={styles.coverButton}
                  disabled={anyAsyncBusy}
                  onClick={() => void handleRunLayeredAssembly()}
                  style={{ borderColor: 'var(--wb-accent)', color: 'var(--wb-accent)', fontWeight: 700 }}
                >
                  {layeredBusy === 'assemble' ? '⏳ 正在智能组装…' : '✨ 对照参照图智能组装'}
                </button>
                <button
                  type="button"
                  className={styles.coverButton}
                  disabled={anyAsyncBusy}
                  onClick={() => void handleApplyLayeredCover()}
                  style={{ background: 'var(--wb-accent)', borderColor: 'var(--wb-accent)', color: '#ffffff', fontWeight: 700 }}
                >
                  {layeredBusy === 'apply' ? '⏳ 正在写入报告…' : '✓ 应用组装成品至正本与附录封面'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {onFrameImage && <ArtRow id={id + '-frame-image'} label="页框图" art={frameImage} accept="image/png" onRemove={() => onFrameImage(undefined)}
        aiActionLabel="✨ 生成 3 套页框候选对比"
        presetActionLabel="🖼 预置 3 套对比"
        aiBusy={aiFrameBusy}
        onAiGenerate={handleGenerateFrameCandidates}
        onLoadPresets={handleLoadPresetFrameCandidates}
        hint="支持并行生成 3 套极细外缘透明 A4 页框候选并列对比（含无边框选项），纹样紧贴页面最外缘 4%–6% 极窄边带（中心不少于 88%×88% 全透明净空），线条锐利闭合零白雾羽化虚化。"
        detail={art => `铺在封面之后的每一页，正文版心与页码保护区全透明；纸面画布、可编辑文档与学术排版稿一致。${art.widthPx}×${art.heightPx} 像素。`}
        onFile={file => frameImageFromFile(file, `页框图“${file.name.slice(0, 120)}”由报告页框技能生成，只在页边装饰。`).then(onFrameImage)} />}

      {onFrameImage && frameCandidates.length > 0 && (
        <div style={{ border: '1px solid var(--wb-line)', borderRadius: 10, padding: 12, display: 'grid', gap: 10, background: 'var(--wb-surface)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 13 }}>页框三方案并列对比（并列保留“无边框”纯净素白选项）</strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={styles.coverButton}
                style={{ fontWeight: !frameImage ? 700 : 500 }}
                onClick={() => {
                  setSelectedFrameCandId('none');
                  onFrameImage(undefined);
                  setShowcaseStatus('已切换为“无边框”纯净素白正文页。');
                }}
              >
                {!frameImage ? '✓ 当前无边框' : '采用“无边框”'}
              </button>
              <button type="button" className={styles.coverButton} onClick={() => setFrameCandidates([])}>收起对比</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            {frameCandidates.map(cand => {
              const src = pageArtDataUrl(cand.frameImage);
              const isAdopted = selectedFrameCandId === cand.id && Boolean(frameImage);
              return (
                <div
                  key={cand.id}
                  style={{
                    display: 'grid',
                    gap: 6,
                    padding: 10,
                    borderRadius: 8,
                    border: isAdopted ? '2px solid var(--wb-accent)' : '1px solid var(--wb-line)',
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- candidate A4 frame preview */}
                    <img
                      src={src}
                      alt={cand.label}
                      style={{
                        width: '100%',
                        aspectRatio: '210 / 297',
                        objectFit: 'cover',
                        borderRadius: 4,
                        background: 'repeating-conic-gradient(#f1f5f9 0% 25%, #ffffff 0% 50%) 50% / 12px 12px',
                        cursor: 'zoom-in',
                      }}
                      onClick={e => openZoomArt({ title: cand.label, badge: cand.badge, src, isFrame: true }, e.currentTarget)}
                    />
                    <button
                      type="button"
                      onClick={e => openZoomArt({ title: cand.label, badge: cand.badge, src, isFrame: true }, e.currentTarget)}
                      style={{ position: 'absolute', right: 6, bottom: 6, fontSize: 11, padding: '2px 6px', borderRadius: 4, border: 'none', background: 'rgba(15,23,42,0.7)', color: '#fff', cursor: 'pointer' }}
                    >
                      🔍 放大预览
                    </button>
                  </div>
                  <strong style={{ fontSize: 12.5 }}>{cand.label}</strong>
                  <span style={{ fontSize: 11.5, color: 'var(--wb-muted)' }}>{cand.badge}</span>
                  <button
                    type="button"
                    className={styles.coverButton}
                    style={{ borderColor: 'var(--wb-accent)', color: 'var(--wb-accent)', fontWeight: 600 }}
                    onClick={() => {
                      setSelectedFrameCandId(cand.id);
                      onFrameImage(cand.frameImage);
                      setShowcaseStatus(`✓ 已采纳透明页框“${cand.label}”！`);
                    }}
                  >
                    {isAdopted ? '✓ 已采纳当前页框' : '采纳此版（正本+附录同步）'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {zoomArt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${zoomArt.title}放大预览`}
          onClick={closeZoomArt}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.72)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', padding: 20 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 16, maxWidth: 520, width: '100%', display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{zoomArt.title}</strong>
                <div style={{ fontSize: 12, color: '#64748b' }}>{zoomArt.badge}</div>
              </div>
              <button type="button" autoFocus className={styles.coverButton} onClick={closeZoomArt}>关闭</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- zoom preview */}
            <img
              src={zoomArt.src}
              alt={zoomArt.title}
              style={{
                width: '100%',
                maxHeight: '76vh',
                objectFit: 'contain',
                borderRadius: 6,
                background: zoomArt.darkCheckerboard
                  ? 'repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 50% / 14px 14px'
                  : zoomArt.isFrame
                    ? 'repeating-conic-gradient(#f1f5f9 0% 25%, #ffffff 0% 50%) 50% / 14px 14px'
                    : '#fcfaf5',
              }}
            />
          </div>
        </div>
      )}

      {visibleShowcaseItems.length > 0 && (
        <div
          style={{
            borderTop: '1px dashed var(--wb-line)',
            paddingTop: 12,
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: 13 }}>国奖通用留白叠题封面与精选页框画廊（一键套用）</strong>
            <span style={{ fontSize: 12, color: 'var(--wb-muted)' }}>
              套用封面后正本与附录同步生效，并自动提取主辅色重绘全篇统计图
            </span>
          </div>
          <div
            role="group"
            aria-label="国奖精选封面与边框画廊"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
              gap: 10,
            }}
          >
            {visibleShowcaseItems.map(item => {
              const busy = showcaseBusyId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={anyAsyncBusy}
                  onClick={() => void applyShowcaseAsset(item)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '42px minmax(0, 1fr)',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    border: '1px solid var(--wb-line)',
                    borderRadius: 8,
                    background: 'var(--wb-surface)',
                    color: 'var(--wb-text)',
                    textAlign: 'left',
                    font: 'inherit',
                    cursor: anyAsyncBusy ? 'wait' : 'pointer',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- static showcase A4 PNG preview under /art/ */}
                  <img
                    src={item.url}
                    alt={item.title}
                    style={{
                      width: 42,
                      aspectRatio: '210 / 297',
                      objectFit: 'cover',
                      borderRadius: 3,
                      border: '1px solid var(--wb-line)',
                      background: '#fcfaf5',
                    }}
                  />
                  <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                    <strong style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {busy ? '正在套用…' : item.title}
                    </strong>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--wb-muted)' }}>
                      <i
                        aria-hidden="true"
                        style={{
                          display: 'inline-block',
                          width: 9,
                          height: 9,
                          borderRadius: 2,
                          background: item.swatch,
                        }}
                      />
                      {item.subtitle}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {showcaseStatus && <p style={{ margin: 0, fontSize: 12, color: 'var(--wb-accent)' }} role="status">{showcaseStatus}</p>}
          {showcaseError && <p className={styles.coverWarn} style={{ margin: 0 }} role="alert">{showcaseError}</p>}
        </div>
      )}
      {notices.length > 0 && <ul className={styles.notices} aria-label="章节建议">{notices.map(notice => <li key={notice}>{notice}</li>)}</ul>}
      <details className={styles.source}>
        <summary>来源与适用范围</summary>
        <dl aria-labelledby={`${id}-source`}>
          <div><dt id={`${id}-source`}>当前方案</dt><dd>{evaluation.profile.scope}</dd></div>
          {evaluation.profile.sourceUrl && <div><dt>排版来源</dt><dd><a href={evaluation.profile.sourceUrl} target="_blank" rel="noreferrer">{evaluation.profile.sourceTitle} ↗</a> · 核验 {evaluation.profile.verifiedAt}</dd></div>}
          <div><dt>第十七届通知</dt><dd><a href="https://stxy.btbu.edu.cn/docs/2026-10/1fcc2b9eccae40efad4f6e4903db2e3e.pdf" target="_blank" rel="noreferrer">组委会总通知 ↗</a> · 实践赛文件安排于 2026 年 11 月 17 日发布</dd></div>
          <div><dt>页数与演示文稿</dt><dd>按所选组别、赛区和阶段绑定正式要求。</dd></div>
        </dl>
      </details>
    </div>
  </details>;
}
