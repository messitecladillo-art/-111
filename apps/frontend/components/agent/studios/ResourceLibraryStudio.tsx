/* eslint-disable @next/next/no-img-element -- SVG data URLs & static curated A4 art */
'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { applyCoverImage, applyFrameImage, parseEditorContent, type EditorContent } from '@/lib/editor-model';
import { useKeyedListMotion } from '../useEvixMotion';
import { figureInk } from '@/lib/figure-palette';
import { presetCoverImageFromBlob, frameImageFromFile, pageArtDataUrl } from '@/lib/page-art';
import { applyReportInsert, type ReportInsert } from '@/lib/report-insert';
import {
  CHART_CATALOG,
  CHART_INTENT_LABELS,
  buildChartSampleInsert,
  renderChartPreviewSvg,
  type ChartIntentId,
  type ResourceChartItem,
} from '@/lib/resource-library/chart-catalog';
import {
  TABLE_CATALOG,
  TABLE_INTENT_LABELS,
  buildTableInsert,
  renderTablePreviewSvg,
  type ResourceTableTemplate,
  type TableIntentId,
} from '@/lib/resource-library/table-catalog';
import {
  DIAGRAM_CATALOG,
  DIAGRAM_INTENT_LABELS,
  buildDiagramInsert,
  renderDiagramPreviewSvg,
  type DiagramIntentId,
  type ResourceDiagramItem,
} from '@/lib/resource-library/diagram-catalog';
import {
  VISUAL_CATALOG,
  VISUAL_FILTER_LABELS,
  buildInfographicInsert,
  renderPaletteBoardSvg,
  renderVisualSpecSvg,
  type VisualBranchFilterId,
  type VisualCatalogItem,
} from '@/lib/resource-library/visual-catalog';
import {
  GAZETTEER_DIMENSION_LABELS,
  buildGazetteerLandmarkInsert,
  buildGazetteerTopicPrompt,
  getCountiesForSelection,
  getCountyProfile,
  getGazetteerStatsSummary,
  getPrefecturesForProvince,
  getProvinceList,
  renderRegionVisualCardSvg,
  searchCountyGazetteer,
  type CountyGazetteerProfile,
  type GazetteerDimensionId,
} from '@/lib/resource-library/china-county-gazetteer';
import {
  INSPECTOR_PALETTE_PRESETS,
  buildChartPythonCode,
  buildDiagramCode,
  buildTableLatexCode,
  buildVectorAssetLatexCode,
} from '@/lib/resource-library/reproducible-code';
import { buildSmartRecommendations } from '@/lib/resource-library/smart-recommender';
import { normalizeAcademicPunctuation } from '@/lib/typography';
import { EvixIcon } from '../icons';
import styles from './ResourceLibrary.module.css';

export type LibraryBranchId =
  | 'recommended'
  | 'charts'
  | 'tables'
  | 'diagrams'
  | 'visuals'
  | 'gazetteer';

const EXACT_LIBRARY_COLOR_NAMES: Readonly<Record<string, string>> = {
  '#0F766E': '松石青',
  '#0D9488': '松石青',
  '#115E59': '深林青',
  '#234E80': '深海靛',
  '#234E8C': '深海靛',
  '#1D4E89': '期刊深蓝',
  '#1E3A8A': '深海靛',
  '#8A3449': '丹绯红',
  '#8A3448': '丹绯红',
  '#9F1239': '绛朱红',
  '#B45309': '琥珀金',
  '#D97706': '暖琥珀',
  '#334155': '岩板灰',
  '#475569': '石板灰',
  '#1E293B': '黛墨灰',
};

function formatChineseColorName(hex: string): string {
  const normalized = (hex || '').trim().toUpperCase();
  const exact = EXACT_LIBRARY_COLOR_NAMES[normalized];
  if (exact) return exact;
  const clean = normalized.replace(/^#/u, '');
  const full =
    clean.length === 3
      ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
      : clean;
  if (!/^[0-9A-F]{6}$/u.test(full)) return '主题配色';
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

function scrubDisplayHexColors(text: string | undefined): string {
  if (!text) return '';
  return text.replace(/#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/gu, match => formatChineseColorName(match));
}

function toSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function downloadFileBlob(filename: string, body: string, mime: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function FrameMockBackdrop() {
  return (
    <div className={styles.framePaperSpecimen} aria-hidden="true">
      <div className={styles.framePaperHeading}>第四章 实证机制分析与检验</div>
      <div className={styles.framePaperPara}>
        <span />
        <span />
        <span />
      </div>
      <div className={styles.framePaperTable}>
        <div className={styles.framePaperTableRow}>
          <strong>解释变量</strong>
          <strong>β / OR</strong>
          <strong>95% 区间</strong>
        </div>
        <div className={styles.framePaperTableRow}>
          <span>感知易用性</span>
          <span>0.42***</span>
          <span>0.29–0.55</span>
        </div>
        <div className={styles.framePaperTableRow}>
          <span>制度信任度</span>
          <span>0.36***</span>
          <span>0.22–0.50</span>
        </div>
      </div>
      <div className={styles.framePaperBars}>
        <i style={{ height: '58%' }} />
        <i style={{ height: '88%' }} />
        <i style={{ height: '72%' }} />
        <i style={{ height: '94%' }} />
        <i style={{ height: '64%' }} />
      </div>
    </div>
  );
}

export default function ResourceLibraryStudio({
  content,
  onUpdateReport,
  onSaveArtifact,
  onJumpToSection,
  onSendPrompt,
}: {
  content: EditorContent;
  onUpdateReport: (next: EditorContent, message: string) => void;
  onSaveArtifact?: (artifact: { title: string; svg: string; sectionTitle?: string }) => void;
  onJumpToSection?: (sectionId: string) => void;
  onSendPrompt?: (prompt: string) => void;
}) {
  const [branch, setBranch] = useState<LibraryBranchId>('recommended');
  const [query, setQuery] = useState('');
  const [chartIntent, setChartIntent] = useState<ChartIntentId>('all');
  const [tableIntent, setTableIntent] = useState<TableIntentId>('all');
  const [diagramIntent, setDiagramIntent] = useState<DiagramIntentId>('all');
  const [visualFilter, setVisualFilter] = useState<VisualBranchFilterId>('all');
  const [dimFilter, setDimFilter] = useState<GazetteerDimensionId>('all');

  // Cascading province -> prefecture -> county selectors for gazetteer
  const provinces = useMemo(() => getProvinceList(), []);
  const [selectedProvCode, setSelectedProvCode] = useState<string>('330000');
  const prefectures = useMemo(() => getPrefecturesForProvince(selectedProvCode), [selectedProvCode]);
  const [selectedPrefCode, setSelectedPrefCode] = useState<string>('330700');

  // Selected entity per branch
  const [selectedChartId, setSelectedChartId] = useState<string>(CHART_CATALOG[0].id);
  const [selectedTableId, setSelectedTableId] = useState<string>(TABLE_CATALOG[0].id);
  const [selectedDiagramId, setSelectedDiagramId] = useState<string>(DIAGRAM_CATALOG[0].id);
  const [selectedVisualId, setSelectedVisualId] = useState<string>(VISUAL_CATALOG[0].id);
  const [selectedCountyCode, setSelectedCountyCode] = useState<string>('330782');

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [previewPaletteId, setPreviewPaletteId] = useState<string>('report');
  const [targetSectionOverride, setTargetSectionOverride] = useState<string>('');
  const [codeOpen, setCodeOpen] = useState(false);
  const [diagramCodeLang, setDiagramCodeLang] = useState<'tikz' | 'mermaid' | 'drawio'>('mermaid');

  const ink = useMemo(() => figureInk(content), [content]);
  const allPaletteBoards = useMemo(
    () => VISUAL_CATALOG.filter(v => v.kind === 'palette_board' && Boolean(v.palette)),
    [],
  );
  const activePalettePreset = useMemo(() => {
    const quick = INSPECTOR_PALETTE_PRESETS.find(p => p.id === previewPaletteId);
    if (quick) return quick;
    const board = allPaletteBoards.find(v => v.id === previewPaletteId);
    if (board?.palette) {
      return { id: board.id, label: board.boardSpec?.disciplineTag ?? board.label, palette: board.palette };
    }
    return INSPECTOR_PALETTE_PRESETS[0];
  }, [previewPaletteId, allPaletteBoards]);
  const effectiveInk = activePalettePreset.palette ?? ink;
  const gazetteerStats = useMemo(() => getGazetteerStatsSummary(), []);
  const registeredResults = content.quality?.results ?? [];

  // Branch filter pipelines
  const qLower = query.trim().toLowerCase();

  const filteredCharts = useMemo(() => {
    return CHART_CATALOG.filter(c => {
      if (branch === 'charts' && chartIntent !== 'all' && c.intent !== chartIntent) return false;
      if (!qLower) return true;
      return `${c.title} ${c.methodFit} ${c.whenToUse} ${c.keywords.join(' ')}`.toLowerCase().includes(qLower);
    });
  }, [branch, chartIntent, qLower]);

  const filteredTables = useMemo(() => {
    return TABLE_CATALOG.filter(t => {
      if (branch === 'tables' && tableIntent !== 'all' && t.intent !== tableIntent) return false;
      if (!qLower) return true;
      return `${t.title} ${t.chapterHint} ${t.headers.join(' ')} ${t.keywords.join(' ')}`.toLowerCase().includes(qLower);
    });
  }, [branch, tableIntent, qLower]);

  const filteredDiagrams = useMemo(() => {
    return DIAGRAM_CATALOG.filter(d => {
      if (branch === 'diagrams' && diagramIntent !== 'all' && d.intent !== diagramIntent) return false;
      if (!qLower) return true;
      return `${d.title} ${d.usageSummary} ${d.keywords.join(' ')}`.toLowerCase().includes(qLower);
    });
  }, [branch, diagramIntent, qLower]);

  const filteredVisuals = useMemo(() => {
    return VISUAL_CATALOG.filter(v => {
      if (branch === 'visuals' && visualFilter !== 'all' && v.kind !== visualFilter) return false;
      if (!qLower) return true;
      return `${v.label} ${v.badge} ${v.subnote} ${v.whenToUse} ${v.keywords.join(' ')}`.toLowerCase().includes(qLower);
    });
  }, [branch, visualFilter, qLower]);

  const visibleCounties = useMemo(() => {
    if (qLower) {
      return searchCountyGazetteer(query, {
        provinceCode: undefined,
        dimension: branch === 'gazetteer' ? dimFilter : 'all',
        limit: 42,
      });
    }
    const list = getCountiesForSelection(selectedProvCode, selectedPrefCode || undefined);
    if (list.length > 0) return list;
    return searchCountyGazetteer('', { provinceCode: selectedProvCode, dimension: dimFilter, limit: 24 });
  }, [branch, qLower, query, dimFilter, selectedProvCode, selectedPrefCode]);

  // Context- and snapshot-aware recommended picks for `recommended` branch
  const smartRecs = useMemo(() => buildSmartRecommendations(content), [content]);
  const recommendedCount =
    smartRecs.charts.length +
    smartRecs.tables.length +
    smartRecs.diagrams.length +
    smartRecs.infographics.length +
    smartRecs.palettes.length +
    smartRecs.counties.length;

  const activeChart: ResourceChartItem | undefined =
    branch === 'recommended'
      ? qLower.length > 0
        ? filteredCharts.find(c => c.id === selectedChartId) ?? filteredCharts[0] ?? smartRecs.charts[0]?.item ?? CHART_CATALOG[0]
        : smartRecs.charts.find(r => r.item.id === selectedChartId)?.item ?? smartRecs.charts[0]?.item ?? CHART_CATALOG[0]
      : CHART_CATALOG.find(c => c.id === selectedChartId) ?? filteredCharts[0] ?? CHART_CATALOG[0];
  const activeTable: ResourceTableTemplate | undefined =
    TABLE_CATALOG.find(t => t.id === selectedTableId) ?? filteredTables[0] ?? TABLE_CATALOG[0];
  const activeDiagram: ResourceDiagramItem | undefined =
    DIAGRAM_CATALOG.find(d => d.id === selectedDiagramId) ?? filteredDiagrams[0] ?? DIAGRAM_CATALOG[0];
  const activeVisual: VisualCatalogItem | undefined =
    VISUAL_CATALOG.find(v => v.id === selectedVisualId) ?? filteredVisuals[0] ?? VISUAL_CATALOG[0];
  const activeCounty: CountyGazetteerProfile | undefined =
    getCountyProfile(selectedCountyCode) ?? visibleCounties[0] ?? getCountyProfile('330782');

  const activeAssetKey =
    branch === 'charts' || branch === 'recommended'
      ? activeChart?.id ?? 'none'
      : branch === 'tables'
        ? activeTable?.id ?? 'none'
        : branch === 'diagrams'
          ? activeDiagram?.id ?? 'none'
          : branch === 'visuals'
            ? activeVisual?.id ?? 'none'
            : activeCounty?.code ?? 'none';

  const handleProvinceChange = (provCode: string) => {
    setSelectedProvCode(provCode);
    const nextPrefs = getPrefecturesForProvince(provCode);
    const firstPref = nextPrefs[0]?.code ?? '';
    setSelectedPrefCode(firstPref);
    const nextCounties = getCountiesForSelection(provCode, firstPref || undefined);
    if (nextCounties[0]) setSelectedCountyCode(nextCounties[0].code);
  };

  const handlePrefectureChange = (prefCode: string) => {
    setSelectedPrefCode(prefCode);
    const nextCounties = getCountiesForSelection(selectedProvCode, prefCode || undefined);
    if (nextCounties[0]) setSelectedCountyCode(nextCounties[0].code);
  };

  const handleSelectCounty = (county: CountyGazetteerProfile) => {
    setSelectedCountyCode(county.code);
    if (county.provinceCode && county.provinceCode !== selectedProvCode) {
      setSelectedProvCode(county.provinceCode);
    }
    if (county.prefectureCode && county.prefectureCode !== selectedPrefCode) {
      setSelectedPrefCode(county.prefectureCode);
    }
  };

  const applyAndNotify = async (builder: () => Promise<ReportInsert> | ReportInsert, label: string) => {
    setBusy(true);
    try {
      const insert = await builder();
      const applied = applyReportInsert(content, insert, targetSectionOverride || undefined);
      onUpdateReport(applied.content, `已将“${label}”写入对应研究章节。`);
      if (onJumpToSection) onJumpToSection(applied.sectionId);
      setStatus(`✓ 已将“${label}”写入报告（请按实测数据替换占位模板行后定稿）。`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '写入报告失败，请先确认章节完整。');
    } finally {
      setBusy(false);
    }
  };

  const handleAdoptVisual = async (v: VisualCatalogItem) => {
    setBusy(true);
    try {
      if (v.kind === 'palette_board' && v.palette) {
        const next = parseEditorContent({
          ...content,
          version: 3 as const,
          accent: v.accent,
          figurePalette: { ...v.palette, source: 'manual' as const },
        });
        onUpdateReport(next, `已将“${v.label}”语义色板（主色为${formatChineseColorName(v.palette.primary)}）同步至全篇图表。`);
        setStatus(`✓ 已将“${v.label}”学科语义配色同步至当前报告！`);
        return;
      }
      if (!v.assetUrl) {
        throw new Error('当前视觉样板未配置可应用图片文件。');
      }
      const resp = await fetch(v.assetUrl);
      if (!resp.ok) throw new Error(`素材加载失败 (${resp.status})`);
      const blob = await resp.blob();
      if (v.kind === 'frame') {
        const file = new File([blob], `${v.id}.png`, { type: 'image/png' });
        const frame = await frameImageFromFile(file, v.label);
        const next = applyFrameImage(content, frame);
        onUpdateReport(next, `已将“${v.label}”设为正文与附录透明页框。`);
      } else {
        const { cover, palette } = await presetCoverImageFromBlob(blob, `${v.label}（题名字形在图中）`);
        const next = applyCoverImage(content, cover, palette);
        onUpdateReport(next, `已同步封面“${v.label}”及全篇图表配色（主色为${formatChineseColorName(palette.primary)}）。`);
      }
      setStatus(`✓ 已将“${v.label}”同步应用于当前报告！`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '应用装帧视觉资产失败。');
    } finally {
      setBusy(false);
    }
  };

  const exportTextTableMarkdown = (t: ResourceTableTemplate) => {
    const head = `| ${t.headers.join(' | ')} |`;
    const sep = `| ${t.headers.map(() => '---').join(' | ')} |`;
    const body = t.rows.map(r => `| ${r.join(' | ')} |`).join('\n');
    const md = `**${t.title}**\n\n${head}\n${sep}\n${body}\n\n${t.footnote}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(md);
    }
    setStatus(`✓ 已复制“${t.title}”三线表文本骨架至剪贴板。`);
  };

  const handleApplyPreviewPalette = () => {
    if (!activePalettePreset.palette) return;
    const next = parseEditorContent({
      ...content,
      version: 3 as const,
      figurePalette: { ...activePalettePreset.palette, source: 'manual' as const },
    });
    onUpdateReport(
      next,
      `已将“${activePalettePreset.label}”语义色板（主色为${formatChineseColorName(activePalettePreset.palette.primary)}）同步至全篇图表。`,
    );
    setPreviewPaletteId('report');
    setStatus(`✓ 已将“${activePalettePreset.label}”配色同步应用于当前报告！`);
  };

  const copyCodeSnippet = (code: string, label: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(code);
    }
    setStatus(`✓ 已复制“${label}”可复现学术源码至剪贴板。`);
  };

  const branches = useMemo<ReadonlyArray<{ id: LibraryBranchId; label: string; count: number | string }>>(
    () => [
      { id: 'recommended', label: '为本篇推荐', count: recommendedCount },
      { id: 'charts', label: '数据图', count: CHART_CATALOG.length },
      { id: 'tables', label: '三线表', count: TABLE_CATALOG.length },
      { id: 'diagrams', label: '流程框架图', count: DIAGRAM_CATALOG.length },
      { id: 'visuals', label: '装帧与视觉', count: VISUAL_CATALOG.length },
      { id: 'gazetteer', label: '中国县域风物志', count: `${gazetteerStats.countyCount}县` },
    ],
    [recommendedCount, gazetteerStats.countyCount],
  );

  const activeInspectorCode = useMemo(() => {
    if (!codeOpen) return null;
    if ((branch === 'charts' || branch === 'recommended') && activeChart) {
      return {
        heading: 'Python 出版级制图源码',
        label: activeChart.title,
        code: buildChartPythonCode(activeChart, effectiveInk),
        filename: `${activeChart.id}.py`,
        mime: 'text/x-python;charset=utf-8',
        isDiagram: false,
      };
    }
    if (branch === 'tables' && activeTable) {
      return {
        heading: '中文学术排版三线表源码',
        label: activeTable.title,
        code: buildTableLatexCode(activeTable),
        filename: `${activeTable.id}.tex`,
        mime: 'application/x-tex;charset=utf-8',
        isDiagram: false,
      };
    }
    if (branch === 'diagrams' && activeDiagram) {
      const codes = buildDiagramCode(activeDiagram);
      const code = diagramCodeLang === 'tikz' ? codes.tikz : diagramCodeLang === 'drawio' ? codes.drawio : codes.mermaid;
      const ext = diagramCodeLang === 'tikz' ? 'tex' : diagramCodeLang === 'drawio' ? 'drawio' : 'mmd';
      return {
        heading: '流程图可编辑源码',
        label: activeDiagram.title,
        code,
        filename: `${activeDiagram.id}.${ext}`,
        mime: diagramCodeLang === 'drawio' ? 'application/xml;charset=utf-8' : 'text/plain;charset=utf-8',
        isDiagram: true,
      };
    }
    if (branch === 'visuals' && activeVisual?.bentoArchetype) {
      return {
        heading: '中文学术排版矢量插图源码',
        label: activeVisual.label,
        code: buildVectorAssetLatexCode({
          assetId: activeVisual.id,
          title: activeVisual.label,
          caption: activeVisual.subnote,
        }),
        filename: `${activeVisual.id}.tex`,
        mime: 'application/x-tex;charset=utf-8',
        isDiagram: false,
      };
    }
    if (branch === 'gazetteer' && activeCounty) {
      return {
        heading: '中文学术排版县域地标插图源码',
        label: `${activeCounty.name} · ${activeCounty.landmarkName}`,
        code: buildVectorAssetLatexCode({
          assetId: `${activeCounty.code}-${activeCounty.name}-${activeCounty.landmarkName}`,
          title: `${activeCounty.name} · ${activeCounty.landmarkName}`,
          caption: `${activeCounty.provinceName}${activeCounty.prefectureName}实地调研区域背景地标插画`,
        }),
        filename: `${activeCounty.code}-${activeCounty.name}.tex`,
        mime: 'application/x-tex;charset=utf-8',
        isDiagram: false,
      };
    }
    return null;
  }, [codeOpen, branch, activeChart, activeTable, activeDiagram, activeVisual, activeCounty, effectiveInk, diagramCodeLang]);

  const activeCountList = useMemo<ReadonlyArray<{ id: string; label: string; count: number }>>(
    () =>
      branch === 'charts'
        ? CHART_INTENT_LABELS.map(l => ({
            id: l.id,
            label: l.label,
            count: l.id === 'all' ? CHART_CATALOG.length : CHART_CATALOG.filter(c => c.intent === l.id).length,
          }))
        : branch === 'tables'
          ? TABLE_INTENT_LABELS.map(l => ({
              id: l.id,
              label: l.label,
              count: l.id === 'all' ? TABLE_CATALOG.length : TABLE_CATALOG.filter(t => t.intent === l.id).length,
            }))
          : branch === 'diagrams'
            ? DIAGRAM_INTENT_LABELS.map(l => ({
                id: l.id,
                label: l.label,
                count: l.id === 'all' ? DIAGRAM_CATALOG.length : DIAGRAM_CATALOG.filter(d => d.intent === l.id).length,
              }))
            : branch === 'visuals'
              ? VISUAL_FILTER_LABELS.map(l => ({
                  id: l.id,
                  label: l.label,
                  count: l.id === 'all' ? VISUAL_CATALOG.length : VISUAL_CATALOG.filter(v => v.kind === l.id).length,
                }))
              : branch === 'gazetteer'
                ? GAZETTEER_DIMENSION_LABELS.map(d => ({
                    id: d.id,
                    label: d.label,
                    count:
                      d.id === 'all'
                        ? gazetteerStats.countyCount
                        : gazetteerStats.curatedSeedCount + gazetteerStats.officialPackCount,
                  }))
                : [{ id: 'all', label: '全维度智能匹配', count: recommendedCount }],
    [
      branch,
      gazetteerStats.countyCount,
      gazetteerStats.curatedSeedCount,
      gazetteerStats.officialPackCount,
      recommendedCount,
    ],
  );

  const currentFilterId =
    branch === 'charts'
      ? chartIntent
      : branch === 'tables'
        ? tableIntent
        : branch === 'diagrams'
          ? diagramIntent
          : branch === 'visuals'
            ? visualFilter
            : branch === 'gazetteer'
              ? dimFilter
              : 'all';

  const branchIds = useMemo(() => branches.map(b => b.id), [branches]);
  const branchBarRef = useKeyedListMotion<HTMLElement>({
    ids: branchIds,
    activeId: branch,
    markerAxis: 'horizontal',
  });
  const intentIds = useMemo(() => activeCountList.map(opt => opt.id), [activeCountList]);
  const intentListRef = useKeyedListMotion<HTMLDivElement>({
    ids: intentIds,
    activeId: currentFilterId,
    markerAxis: 'vertical',
  });

  const renderLeftSidebar = () => {
    const onSelectFilter = (id: string) => {
      if (branch === 'charts') setChartIntent(id as ChartIntentId);
      else if (branch === 'tables') setTableIntent(id as TableIntentId);
      else if (branch === 'diagrams') setDiagramIntent(id as DiagramIntentId);
      else if (branch === 'visuals') setVisualFilter(id as VisualBranchFilterId);
      else if (branch === 'gazetteer') setDimFilter(id as GazetteerDimensionId);
    };

    return (
      <aside className={styles.leftRail} aria-label="资料检索与意图筛选">
        <input
          type="search"
          className={styles.searchInput}
          aria-label="检索资料库"
          placeholder={
            branch === 'gazetteer'
              ? '搜区县、地标或特色产业，例如义乌、八咏楼'
              : branch === 'visuals'
                ? '搜封面、页框或期刊配色，例如柳叶刀'
                : '搜图名、因果识别或三线表，例如双重差分'
          }
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <p className={styles.railHeading}>
          {branch === 'gazetteer' ? '五维风物聚焦' : branch === 'visuals' ? '装帧分类' : '想表达什么'}
        </p>
        <div
          ref={intentListRef}
          className={styles.intentList}
          role="group"
          aria-label={branch === 'gazetteer' ? '五维风物筛选' : branch === 'visuals' ? '装帧分类筛选' : '表达意图筛选'}
        >
          <span data-motion-marker data-motion-variant="pill" className={styles.intentActivePill} aria-hidden="true" />
          {activeCountList.map(opt => (
            <button
              key={opt.id}
              data-motion-id={opt.id}
              type="button"
              className={styles.intentBtn}
              aria-label={`按“${opt.label}”筛选（共 ${opt.count} 项）`}
              aria-pressed={currentFilterId === opt.id}
              onClick={() => onSelectFilter(opt.id)}
            >
              <span>{opt.label}</span>
              <span className={styles.intentBadge}>{opt.count}</span>
            </button>
          ))}
        </div>
        <div className={styles.leftNotice}>
          {branch === 'gazetteer'
            ? `已接入国家标准行政区划（${gazetteerStats.provinceCount} 省 · ${gazetteerStats.prefectureCount} 市 · ${gazetteerStats.countyCount} 区县）及各地代表性标志建筑图录，绝不编造虚构经济或人口数据。`
            : '所有统计例图、三线表与架构框图均已自动适配当前报告主色调，插入正文后将自动完成数据核验与编号。'}
        </div>
      </aside>
    );
  };

  return (
    <section className={styles.root} role="region" aria-label="证见 EVI-X 研究资料库">
      <header className={styles.topHeader}>
        <div className={styles.titleGroup}>
          <EvixIcon name="page-grid" size={20} />
          <h2 className={styles.title}>资料库</h2>
          <span className={styles.subtitleTag}>{CHART_CATALOG.length}例图 · {TABLE_CATALOG.length}三线表 · {DIAGRAM_CATALOG.length}框图 · {gazetteerStats.countyCount}县地标</span>
        </div>
        <nav ref={branchBarRef} className={styles.branchBar} aria-label="资料库分支视图">
          <span data-motion-marker data-motion-variant="pill" className={styles.branchActivePill} aria-hidden="true" />
          {branches.map(b => (
            <button
              key={b.id}
              data-motion-id={b.id}
              type="button"
              className={styles.branchPill}
              aria-label={`切换至“${b.label}”分类（${b.count}）`}
              aria-pressed={branch === b.id}
              onClick={() => {
                setBranch(b.id);
                setQuery('');
                setStatus('');
              }}
            >
              <span>{b.label}</span>
              <span className={styles.branchCount}>{b.count}</span>
            </button>
          ))}
        </nav>
      </header>

      <div className={styles.workspace}>
        {renderLeftSidebar()}

        <div className={styles.centerStage}>
          {/* Active In-Use Horizontal Strip ("本篇在用") */}
          <div className={styles.inUseBox}>
            <div className={styles.inUseHead}>
              <strong>
                本篇报告在用资产（{registeredResults.length} 项统计图表
                {content.coverImage ? ' · 已配封面' : ''}
                {content.frameImage ? ' · 已配页框' : ''}）
              </strong>
              <span>研究主题 · {normalizeAcademicPunctuation(content.title || '未命名调研')}</span>
            </div>
            <div className={styles.inUseStrip}>
              {content.coverImage && (
                <button
                  type="button"
                  className={styles.inUseChip}
                  aria-label="查看当前报告封面所属的装帧与视觉库"
                  onClick={() => setBranch('visuals')}
                  title="查看装帧与视觉库"
                >
                  <img src={pageArtDataUrl(content.coverImage)} alt="当前封面" className={styles.inUseThumb} />
                  <span>当前封面</span>
                </button>
              )}
              {registeredResults.slice(0, 8).map(r => (
                <button
                  key={r.id}
                  type="button"
                  className={styles.inUseChip}
                  aria-label={`定位至报告图表“${normalizeAcademicPunctuation(r.title)}”`}
                  title={normalizeAcademicPunctuation(r.title)}
                  onClick={() => {
                    const sec = content.report.find(s => s.blocks?.some(b => b.evidenceId === r.id));
                    if (sec && onJumpToSection) onJumpToSection(sec.id);
                  }}
                >
                  <span className={styles.inUseChipText}>{normalizeAcademicPunctuation(r.title)}</span>
                </button>
              ))}
              {registeredResults.length === 0 && !content.coverImage && (
                <span style={{ fontSize: 11.5, color: 'var(--c-faint)' }}>
                  尚未向报告正文写入图表或封面，点选下方任意卡片即可一键插入“当前报告”。
                </span>
              )}
            </div>
          </div>

          {/* 3-level Cascade Bar strictly on China Gazetteer branch */}
          {branch === 'gazetteer' && (
            <div className={styles.cascadeBar} role="group" aria-label="中国省市区县三级联动选择器">
              <label className={styles.cascadeField}>
                <span>一级 · 省/直辖市/自治区/特别行政区（{provinces.length}）</span>
                <select
                  className={styles.cascadeSelect}
                  aria-label="选择省级行政区"
                  value={selectedProvCode}
                  onChange={e => handleProvinceChange(e.target.value)}
                >
                  {provinces.map(p => (
                    <option key={p.code} value={p.code}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.cascadeField}>
                <span>二级 · 地级市 / 州 / 直辖单元（{prefectures.length}）</span>
                <select
                  className={styles.cascadeSelect}
                  aria-label="选择地级市或直管单元"
                  value={selectedPrefCode}
                  onChange={e => handlePrefectureChange(e.target.value)}
                >
                  <option value="">全部地市下辖区县</option>
                  {prefectures.map(pref => (
                    <option key={pref.code} value={pref.code}>
                      {pref.name} ({pref.countyCount})
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.cascadeField}>
                <span>三级 · 区 / 县 / 县级市 / 旗（{visibleCounties.length} 项显示）</span>
                <select
                  className={styles.cascadeSelect}
                  aria-label="定位具体区县"
                  value={activeCounty?.code ?? ''}
                  onChange={e => setSelectedCountyCode(e.target.value)}
                >
                  {visibleCounties.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.name} {c.dataOrigin === 'official_evidence_pack' ? '★官方包' : c.dataOrigin === 'curated_gazetteer' ? '◆精编' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* Cross-Catalog Omnisearch when user types in default `recommended` branch */}
          {branch === 'recommended' && qLower.length > 0 && (() => {
            const omniTotal =
              filteredCharts.length +
              filteredTables.length +
              filteredDiagrams.length +
              filteredVisuals.length +
              visibleCounties.length;
            return (
              <>
                <div className={styles.gridMeta}>
                  <strong>
                    🔍 全库跨类目统一检索“{query.trim()}”，共命中 {omniTotal} 项（图 {filteredCharts.length} · 表 {filteredTables.length} · 框图 {filteredDiagrams.length} · 视觉 {filteredVisuals.length} · 区县 {visibleCounties.length}）
                  </strong>
                  <button
                    type="button"
                    className={styles.omniClearBtn}
                    aria-label="清空检索词并恢复本篇推荐"
                    onClick={() => setQuery('')}
                  >
                    ✕ 清空检索恢复本篇推荐
                  </button>
                </div>

                {omniTotal === 0 && (
                  <div className={styles.emptySearchBox} role="status" aria-live="polite">
                    <span>未检索到与“{query.trim()}”匹配的统计例图、三线表、框架图、视觉样板或区县地标。</span>
                    <button
                      type="button"
                      className={styles.omniClearBtn}
                      aria-label="清空检索词返回智能推荐"
                      onClick={() => setQuery('')}
                    >
                      清空检索词返回智能推荐
                    </button>
                  </div>
                )}

                {filteredCharts.length > 0 && (
                  <>
                    <div className={styles.gridMeta}>
                      <strong>统计数据图命中（{filteredCharts.length}）</strong>
                      <span>点选卡片右侧立即预览例图与 Python 源码</span>
                    </div>
                    <div key="omni-charts" className={styles.cardGrid}>
                      {filteredCharts.slice(0, 24).map((item, idx) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`${styles.card} ${activeChart?.id === item.id ? styles.cardSelected : ''}`}
                          style={{ '--stagger-i': Math.min(idx, 10) } as CSSProperties}
                          onClick={() => setSelectedChartId(item.id)}
                        >
                          <div className={styles.previewFrame}>
                            <img src={toSvgDataUrl(renderChartPreviewSvg(item, effectiveInk))} alt={item.title} className={styles.previewImg} />
                          </div>
                          <span className={styles.reasonBadge}>全库命中 · 数据图</span>
                          <div className={styles.cardTitle}>{item.title}</div>
                          <div className={styles.cardMeta}>{item.variantCount} 种画法 · {item.methodFit}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {filteredTables.length > 0 && (
                  <>
                    <div className={styles.gridMeta}>
                      <strong>学术三线表命中（{filteredTables.length}）</strong>
                      <span>点击卡片跳转三线表检查器并生成中文学术排版源码</span>
                    </div>
                    <div key="omni-tables" className={styles.cardGrid}>
                      {filteredTables.slice(0, 12).map((tpl, idx) => (
                        <button
                          key={tpl.id}
                          type="button"
                          className={`${styles.card} ${activeTable?.id === tpl.id ? styles.cardSelected : ''}`}
                          style={{ '--stagger-i': Math.min(idx, 10) } as CSSProperties}
                          onClick={() => {
                            setBranch('tables');
                            setSelectedTableId(tpl.id);
                          }}
                        >
                          <div className={styles.previewFrame}>
                            <img src={toSvgDataUrl(renderTablePreviewSvg(tpl, effectiveInk))} alt={tpl.title} className={styles.previewImg} />
                          </div>
                          <span className={styles.reasonBadge}>全库命中 · 三线表</span>
                          <div className={styles.cardTitle}>{tpl.title}</div>
                          <div className={styles.cardMeta}>{tpl.chapterHint} · {tpl.headers.length} 栏</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {filteredDiagrams.length > 0 && (
                  <>
                    <div className={styles.gridMeta}>
                      <strong>科研流程与机制框图命中（{filteredDiagrams.length}）</strong>
                      <span>点击卡片切换框图详情与可复现绘图源码</span>
                    </div>
                    <div key="omni-diagrams" className={styles.cardGrid}>
                      {filteredDiagrams.slice(0, 12).map((item, idx) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`${styles.card} ${activeDiagram?.id === item.id ? styles.cardSelected : ''}`}
                          style={{ '--stagger-i': Math.min(idx, 10) } as CSSProperties}
                          onClick={() => {
                            setBranch('diagrams');
                            setSelectedDiagramId(item.id);
                          }}
                        >
                          <div className={styles.previewFrame}>
                            <img src={toSvgDataUrl(renderDiagramPreviewSvg(item, effectiveInk))} alt={item.title} className={styles.previewImg} />
                          </div>
                          <span className={styles.reasonBadge}>全库命中 · 框图</span>
                          <div className={styles.cardTitle}>{item.title}</div>
                          <div className={styles.cardMeta}>{item.nodes.length} 阶 · {item.direction === 'LR' ? '横向' : '纵向'}布局</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {filteredVisuals.length > 0 && (
                  <>
                    <div className={styles.gridMeta}>
                      <strong>装帧、色板与信息图命中（{filteredVisuals.length}）</strong>
                      <span>点击卡片切至装帧与视觉库查看详情或同步色板</span>
                    </div>
                    <div key="omni-visuals" className={styles.cardGrid}>
                      {filteredVisuals.slice(0, 12).map((v, idx) => {
                        const visualSrc = v.kind === 'palette_board'
                          ? toSvgDataUrl(renderPaletteBoardSvg(v))
                          : v.bentoArchetype
                            ? toSvgDataUrl(renderVisualSpecSvg(v, effectiveInk))
                            : v.assetUrl ?? toSvgDataUrl(renderVisualSpecSvg(v, effectiveInk));
                        return (
                          <button
                            key={v.id}
                            type="button"
                            className={`${styles.card} ${activeVisual?.id === v.id ? styles.cardSelected : ''}`}
                            style={{ '--stagger-i': Math.min(idx, 10) } as CSSProperties}
                            onClick={() => {
                              setBranch('visuals');
                              setVisualFilter('all');
                              setSelectedVisualId(v.id);
                            }}
                          >
                            <div className={styles.previewFrame}>
                              <img src={visualSrc} alt={v.label} className={styles.previewImg} />
                            </div>
                            <span className={styles.reasonBadge}>{scrubDisplayHexColors(v.badge)}</span>
                            <div className={styles.cardTitle}>{v.label}</div>
                            <div className={styles.cardMeta}>{v.aspect}</div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {visibleCounties.length > 0 && (
                  <>
                    <div className={styles.gridMeta}>
                      <strong>全国区县标志建筑与风物命中（{visibleCounties.length}）</strong>
                      <span>点击卡片直达县域地标档案与第 1 章五维写入</span>
                    </div>
                    <div key="omni-counties" className={styles.cardGrid}>
                      {visibleCounties.slice(0, 12).map((c, idx) => (
                        <button
                          key={c.code}
                          type="button"
                          className={`${styles.card} ${activeCounty?.code === c.code ? styles.cardSelected : ''}`}
                          style={{ '--stagger-i': Math.min(idx, 10) } as CSSProperties}
                          onClick={() => {
                            setBranch('gazetteer');
                            handleSelectCounty(c);
                          }}
                        >
                          <div className={styles.previewFrame}>
                            <img src={toSvgDataUrl(renderRegionVisualCardSvg(c, effectiveInk))} alt={`${c.name}-${c.landmarkName}`} className={styles.previewImg} />
                          </div>
                          <span className={styles.reasonBadge}>全库命中 · 区县地标</span>
                          <div className={styles.cardTitle}>{c.name} · {c.code}</div>
                          <div className={styles.landmarkLine}>🏛️ 代表性地标 · {c.landmarkName}</div>
                          <div className={styles.cardMeta}>{c.provinceName} · {c.prefectureName}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            );
          })()}

          {/* Branch Grids */}
          {(branch === 'charts' || (branch === 'recommended' && !qLower)) && (
            <>
              <div className={styles.gridMeta}>
                <strong>
                  {branch === 'recommended'
                    ? `为“${content.title || '当前课题'}”基于实测快照与主题语境匹配（共 ${recommendedCount} 项）`
                    : `共 ${filteredCharts.length} 类统计数据图 · 已联动报告主色`}
                </strong>
                <span>点选卡片预览使用边界与防坑指南</span>
              </div>
              <div key={`${branch}-charts`} className={styles.cardGrid}>
                {(branch === 'recommended'
                  ? smartRecs.charts
                  : filteredCharts.map(item => ({ item, reasonBadge: '' }))
                ).map(({ item, reasonBadge }, idx) => {
                  const previewUrl = toSvgDataUrl(renderChartPreviewSvg(item, effectiveInk));
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.card} ${activeChart?.id === item.id ? styles.cardSelected : ''}`}
                      style={{ '--stagger-i': Math.min(idx, 10) } as CSSProperties}
                      onClick={() => setSelectedChartId(item.id)}
                    >
                      <div className={styles.previewFrame}>
                        <img src={previewUrl} alt={item.title} className={styles.previewImg} />
                      </div>
                      {reasonBadge && <span className={styles.reasonBadge}>{reasonBadge}</span>}
                      <div className={styles.cardTitle}>{item.title}</div>
                      <div className={styles.cardMeta}>
                        {item.variantCount} 种画法 · {item.methodFit}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {(branch === 'tables' || (branch === 'recommended' && !qLower)) && (
            <>
              <div className={styles.gridMeta}>
                <strong>
                  {branch === 'recommended' ? '智能匹配学术三线表例图' : `共 ${filteredTables.length} 套跨学科出版级三线表例图`}
                </strong>
                <span>遵循国奖三线规范（顶底粗线 · 栏目细线 · 对齐统计量与注脚）</span>
              </div>
              <div key={`${branch}-tables`} className={styles.cardGrid}>
                {(branch === 'recommended'
                  ? smartRecs.tables
                  : filteredTables.map(item => ({ item, reasonBadge: '' }))
                ).map(({ item: tpl, reasonBadge }, idx) => (
                  <button
                    key={tpl.id}
                    type="button"
                    className={`${styles.card} ${activeTable?.id === tpl.id ? styles.cardSelected : ''}`}
                    style={{ '--stagger-i': Math.min(idx, 10) } as CSSProperties}
                    onClick={() => {
                      if (branch === 'recommended') setBranch('tables');
                      setSelectedTableId(tpl.id);
                    }}
                  >
                    <div className={styles.previewFrame}>
                      <img src={toSvgDataUrl(renderTablePreviewSvg(tpl, effectiveInk))} alt={tpl.title} className={styles.previewImg} />
                    </div>
                    {reasonBadge && <span className={styles.reasonBadge}>{reasonBadge}</span>}
                    <div className={styles.cardTitle}>{tpl.title}</div>
                    <div className={styles.cardMeta}>{tpl.chapterHint} · {tpl.headers.length} 栏</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {(branch === 'diagrams' || (branch === 'recommended' && !qLower)) && (
            <>
              <div className={styles.gridMeta}>
                <strong>
                  {branch === 'recommended' ? '智能匹配科研流程与机制框架例图' : `共 ${filteredDiagrams.length} 套无边框科研框架与系统架构例图`}
                </strong>
                <span>支持一键生成可编辑矢量架构图，兼容可编辑文档与学术排版稿</span>
              </div>
              <div key={`${branch}-diagrams`} className={styles.cardGrid}>
                {(branch === 'recommended'
                  ? smartRecs.diagrams
                  : filteredDiagrams.map(item => ({ item, reasonBadge: '' }))
                ).map(({ item, reasonBadge }, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.card} ${activeDiagram?.id === item.id ? styles.cardSelected : ''}`}
                    style={{ '--stagger-i': Math.min(idx, 10) } as CSSProperties}
                    onClick={() => {
                      if (branch === 'recommended') setBranch('diagrams');
                      setSelectedDiagramId(item.id);
                    }}
                  >
                    <div className={styles.previewFrame}>
                      <img src={toSvgDataUrl(renderDiagramPreviewSvg(item, effectiveInk))} alt={item.title} className={styles.previewImg} />
                    </div>
                    {reasonBadge && <span className={styles.reasonBadge}>{reasonBadge}</span>}
                    <div className={styles.cardTitle}>{item.title}</div>
                    <div className={styles.cardMeta}>
                      {item.exampleBadge ? `${item.exampleBadge} · ` : ''}
                      {item.direction === 'LR' ? '横向流向布局' : '纵向分层构架'} · {item.nodes.length} 节点
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {branch === 'recommended' && !qLower && smartRecs.infographics.length > 0 && (
            <>
              <div className={styles.gridMeta}>
                <strong>智能匹配专题矢量信息图样板（支持 1:1 写入报告）</strong>
                <span>点选直达对应纯矢量信息图，可实时联动报告三色板并生成高分辨率图谱</span>
              </div>
              <div key="recommended-infographics" className={styles.cardGrid}>
                {smartRecs.infographics.map(({ item: v, reasonBadge }, idx) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`${styles.card} ${activeVisual?.id === v.id ? styles.cardSelected : ''}`}
                    style={{ '--stagger-i': Math.min(idx, 10) } as CSSProperties}
                    onClick={() => {
                      setBranch('visuals');
                      setVisualFilter('infographic');
                      setSelectedVisualId(v.id);
                    }}
                  >
                    <div className={styles.previewFrame}>
                      <img src={toSvgDataUrl(renderVisualSpecSvg(v, effectiveInk))} alt={v.label} className={styles.previewImg} />
                    </div>
                    <span className={styles.reasonBadge}>{reasonBadge}</span>
                    <div className={styles.cardTitle}>{v.label}</div>
                    <div className={styles.cardMeta}>{scrubDisplayHexColors(v.badge)}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {branch === 'recommended' && !qLower && smartRecs.palettes.length > 0 && (
            <>
              <div className={styles.gridMeta}>
                <strong>智能匹配学科语义配色样板（1+1+1 期刊视觉体系）</strong>
                <span>点选直达“装帧与视觉”，支持一键将主/辅/对冲三色同步至整篇报告</span>
              </div>
              <div key="recommended-palettes" className={styles.cardGrid}>
                {smartRecs.palettes.map(({ item: v, reasonBadge }, idx) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`${styles.card} ${activeVisual?.id === v.id ? styles.cardSelected : ''}`}
                    style={{ '--stagger-i': Math.min(idx, 10) } as CSSProperties}
                    onClick={() => {
                      setBranch('visuals');
                      setSelectedVisualId(v.id);
                    }}
                  >
                    <div className={styles.previewFrame}>
                      <img src={toSvgDataUrl(renderPaletteBoardSvg(v))} alt={v.label} className={styles.previewImg} />
                    </div>
                    <span className={styles.reasonBadge}>{reasonBadge}</span>
                    <div className={styles.cardTitle}>{v.label}</div>
                    <div className={styles.cardMeta}>{scrubDisplayHexColors(v.boardSpec?.journalRef ?? v.badge)}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {branch === 'recommended' && !qLower && smartRecs.counties.length > 0 && (
            <>
              <div className={styles.gridMeta}>
                <strong>课题地名自动识别 · 关联区县标志建筑与风物档案</strong>
                <span>点击跳转至“中国县域风物志”直接引用五维调研背景</span>
              </div>
              <div key="recommended-counties" className={styles.cardGrid}>
                {smartRecs.counties.map(({ item: c, reasonBadge }, idx) => (
                  <button
                    key={c.code}
                    type="button"
                    className={`${styles.card} ${activeCounty?.code === c.code ? styles.cardSelected : ''}`}
                    style={{ '--stagger-i': Math.min(idx, 10) } as CSSProperties}
                    onClick={() => {
                      setBranch('gazetteer');
                      handleSelectCounty(c);
                    }}
                  >
                    <div className={styles.previewFrame}>
                      <img src={toSvgDataUrl(renderRegionVisualCardSvg(c, effectiveInk))} alt={`${c.name}-${c.landmarkName}`} className={styles.previewImg} />
                    </div>
                    <span className={styles.reasonBadge}>{reasonBadge}</span>
                    <div className={styles.cardTitle}>{c.name} · {c.code}</div>
                    <div className={styles.landmarkLine}>🏛️ 地标 · {c.landmarkName}</div>
                    <div className={styles.cardMeta}>{c.provinceName} · {c.prefectureName}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {branch === 'visuals' && (
            <>
              <div className={styles.gridMeta}>
                <strong>共 {filteredVisuals.length} 套国奖装帧封面、纯画底图、透明页框与学科语义配色板</strong>
                <span>支持一键设为全篇封面/页框，或直接同步学科语义色板</span>
              </div>
              <div key={branch} className={styles.cardGrid}>
                {filteredVisuals.map((v, idx) => {
                  const isPortrait = v.aspect === '3:4';
                  const visualSrc = v.kind === 'palette_board'
                    ? toSvgDataUrl(renderPaletteBoardSvg(v))
                    : v.bentoArchetype
                      ? toSvgDataUrl(renderVisualSpecSvg(v, effectiveInk))
                      : v.assetUrl ?? toSvgDataUrl(renderVisualSpecSvg(v, effectiveInk));
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className={`${styles.card} ${activeVisual?.id === v.id ? styles.cardSelected : ''}`}
                      style={{ '--stagger-i': Math.min(idx, 10) } as CSSProperties}
                      onClick={() => setSelectedVisualId(v.id)}
                    >
                      <div className={isPortrait ? `${styles.previewFrame} ${styles.previewPortrait}` : styles.previewFrame}>
                        {v.kind === 'frame' ? (
                          <div className={styles.framePaperMock}>
                            <FrameMockBackdrop />
                            <img src={visualSrc} alt={v.label} className={styles.frameOverlayImg} />
                          </div>
                        ) : (
                          <img
                            src={visualSrc}
                            alt={v.label}
                            className={isPortrait ? `${styles.previewImg} ${styles.previewImgCover}` : styles.previewImg}
                          />
                        )}
                      </div>
                      <div className={styles.cardTitle}>{v.label}</div>
                      <div className={styles.cardMeta}>{scrubDisplayHexColors(v.badge)}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {branch === 'gazetteer' && (
            <>
              <div className={styles.gridMeta}>
                <strong>
                  当前区域视图共检索到 {visibleCounties.length} 个区县地标档案
                  （全国全库覆盖 {gazetteerStats.provinceCount} 省 / {gazetteerStats.prefectureCount} 市 / {gazetteerStats.countyCount} 县）
                </strong>
                <span>以标志性建筑物插画与五维风物锚定一线实地调研背景</span>
              </div>
              <div key={branch} className={styles.cardGrid}>
                {visibleCounties.map((c, idx) => (
                  <button
                    key={c.code}
                    type="button"
                    className={`${styles.card} ${activeCounty?.code === c.code ? styles.cardSelected : ''}`}
                    style={{ '--stagger-i': Math.min(idx, 10) } as CSSProperties}
                    onClick={() => handleSelectCounty(c)}
                  >
                    <div className={styles.previewFrame}>
                      <img src={toSvgDataUrl(renderRegionVisualCardSvg(c, effectiveInk))} alt={`${c.name}-${c.landmarkName}`} className={styles.previewImg} />
                    </div>
                    <div className={styles.cardTitle}>
                      {c.name}
                      <small style={{ marginLeft: 5, fontWeight: 400, color: 'var(--c-faint)' }}>{c.code}</small>
                    </div>
                    <div className={styles.landmarkLine}>🏛️ 地标 · {c.landmarkName}</div>
                    <div className={styles.cardMeta}>{c.provinceName} · {c.prefectureName}</div>
                    <div className={styles.tagRow}>
                      {c.tags.slice(0, 2).map(t => (
                        <span key={t} className={styles.miniTag}>{t}</span>
                      ))}
                      <span className={styles.miniTag}>
                        {c.dataOrigin === 'official_evidence_pack' ? '★官方包' : c.dataOrigin === 'curated_gazetteer' ? '◆精编' : '地标档案'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right Detail Inspector */}
        <aside className={styles.inspector} aria-label="资料详情检查器">
          {(branch !== 'visuals' || Boolean(activeVisual?.bentoArchetype)) && (
            <div className={styles.palettePreviewBar} role="group" aria-label="右侧检查器学科配色实时切换">
              <div className={styles.paletteBarHead}>
                <span>🎨 学科语义配色实时预览</span>
                {activePalettePreset.palette && (
                  <button
                    type="button"
                    className={styles.paletteApplyBtn}
                    aria-label={`将“${activePalettePreset.label}”语义色板同步至整篇报告`}
                    onClick={handleApplyPreviewPalette}
                  >
                    同步此色板至报告
                  </button>
                )}
              </div>
              <div className={styles.paletteChipRow} role="group" aria-label="快捷学科配色切换">
                {INSPECTOR_PALETTE_PRESETS.map(p => {
                  const swatch = p.palette ? p.palette.primary : typeof ink === 'string' ? ink : ink.primary;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`${styles.paletteChip} ${previewPaletteId === p.id ? styles.paletteChipActive : ''}`}
                      aria-label={`预览“${p.label}”学科语义配色`}
                      aria-pressed={previewPaletteId === p.id}
                      onClick={() => setPreviewPaletteId(p.id)}
                    >
                      <span className={styles.paletteDot} style={{ background: swatch }} aria-hidden="true" />
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>
              <select
                className={styles.paletteSelect}
                aria-label={`切换全部${allPaletteBoards.length}套学科语义色板`}
                value={previewPaletteId}
                onChange={e => setPreviewPaletteId(e.target.value)}
              >
                <optgroup label="快速刊印预设（6 套）">
                  {INSPECTOR_PALETTE_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </optgroup>
                <optgroup label={`全部 ${allPaletteBoards.length} 套期刊语义配色样板`}>
                  {allPaletteBoards.map(b => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}

          {(branch !== 'visuals' || Boolean(activeVisual?.bentoArchetype)) && content.report.length > 0 && (
            <label className={styles.targetSecBar}>
              <span>🎯 写入目标章节</span>
              <select
                className={styles.targetSecSelect}
                aria-label="选择写入目标章节"
                value={targetSectionOverride}
                onChange={e => setTargetSectionOverride(e.target.value)}
              >
                <option value="">自动匹配大赛推荐蓝图章节</option>
                {content.report.map(sec => (
                  <option key={sec.id} value={sec.id}>
                    {sec.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div key={`${branch}:${activeAssetKey}`} className={styles.inspectorBody}>
          {(branch === 'charts' || branch === 'recommended') && activeChart && (
            <>
              <h3 className={styles.inspectorTitle}>{activeChart.title}</h3>
              <div className={styles.previewFrame}>
                <img src={toSvgDataUrl(renderChartPreviewSvg(activeChart, effectiveInk))} alt={activeChart.title} className={styles.previewImg} />
              </div>
              <div className={styles.inspectorBlock}>
                <span className={styles.inspectorLabel}>适配模型与方法</span>
                <span>{scrubDisplayHexColors(activeChart.methodFit)}（提供 {activeChart.variantCount} 种扩展画法变体）</span>
              </div>
              <div className={styles.inspectorBlock}>
                <span className={styles.inspectorLabel}>何时选用</span>
                <span>{scrubDisplayHexColors(activeChart.whenToUse)}</span>
              </div>
              <div className={`${styles.inspectorBlock} ${styles.warnBlock}`}>
                <span className={styles.inspectorLabel}>国奖防坑提示</span>
                <span>{scrubDisplayHexColors(activeChart.pitfallWarning)}</span>
              </div>
              <div className={styles.actionCol}>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={busy}
                  onClick={() => void applyAndNotify(() => buildChartSampleInsert(activeChart, content.title), activeChart.title)}
                >
                  {busy ? '写入中…' : '📥 插入当前报告对应章节'}
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    downloadFileBlob(
                      `${activeChart.id}.svg`,
                      renderChartPreviewSvg(activeChart, effectiveInk),
                      'image/svg+xml;charset=utf-8',
                    );
                    setStatus(`✓ 已导出“${activeChart.title}”高清矢量原件。`);
                  }}
                >
                  ⬇️ 下载高清矢量原件
                </button>
                {onSaveArtifact && (
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => {
                      onSaveArtifact({ title: activeChart.title, svg: renderChartPreviewSvg(activeChart, effectiveInk) });
                      setStatus(`✓ 已将“${activeChart.title}”矢量样图存至产出架。`);
                    }}
                  >
                    📌 收藏矢量图样至产出架
                  </button>
                )}
              </div>
            </>
          )}

          {branch === 'tables' && activeTable && (
            <>
              <h3 className={styles.inspectorTitle}>{activeTable.title}</h3>
              <div className={styles.previewFrame}>
                <img src={toSvgDataUrl(renderTablePreviewSvg(activeTable, effectiveInk))} alt={activeTable.title} className={styles.previewImg} />
              </div>
              <div className={styles.inspectorBlock} style={{ overflowX: 'auto' }}>
                <span className={styles.inspectorLabel}>完整三线表栏目明细（{activeTable.chapterHint}）</span>
                <table className={styles.miniBooktabs}>
                  <thead>
                    <tr>{activeTable.headers.map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {activeTable.rows.map((r, ri) => (
                      <tr key={ri}>{r.map((cell, ci) => <td key={ci}>{String(cell)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
                <small style={{ color: 'var(--c-dim)', marginTop: 4 }}>{scrubDisplayHexColors(activeTable.footnote)}</small>
              </div>
              <div className={styles.inspectorBlock}>
                <span className={styles.inspectorLabel}>统计汇报必查契约</span>
                <span>{scrubDisplayHexColors(activeTable.contractNotes)}</span>
              </div>
              <div className={styles.actionCol}>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={busy}
                  onClick={() => void applyAndNotify(() => buildTableInsert(activeTable, content.title), activeTable.title)}
                >
                  {busy ? '写入中…' : '📥 将规范三线表插入报告'}
                </button>
                <button type="button" className={styles.secondaryBtn} onClick={() => exportTextTableMarkdown(activeTable)}>
                  📋 复制三线表文本骨架
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    downloadFileBlob(
                      `${activeTable.id}.svg`,
                      renderTablePreviewSvg(activeTable, effectiveInk),
                      'image/svg+xml;charset=utf-8',
                    );
                    setStatus(`✓ 已导出“${activeTable.title}”三线表高清矢量原件。`);
                  }}
                >
                  ⬇️ 下载高清矢量原件
                </button>
              </div>
            </>
          )}

          {branch === 'diagrams' && activeDiagram && (
            <>
              <h3 className={styles.inspectorTitle}>{activeDiagram.title}</h3>
              <div className={styles.previewFrame}>
                <img src={toSvgDataUrl(renderDiagramPreviewSvg(activeDiagram, effectiveInk))} alt={activeDiagram.title} className={styles.previewImg} />
              </div>
              <div className={styles.inspectorBlock}>
                <span className={styles.inspectorLabel}>核心结构要点</span>
                <span>{scrubDisplayHexColors(activeDiagram.usageSummary)}</span>
              </div>
              <div className={styles.inspectorBlock}>
                <span className={styles.inspectorLabel}>包含流程节点（{activeDiagram.nodes.length} 阶）</span>
                <span>{activeDiagram.nodes.map(n => n.label).join(' → ')}</span>
              </div>
              <div className={styles.actionCol}>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={busy}
                  onClick={() => void applyAndNotify(() => buildDiagramInsert(activeDiagram, content.title), activeDiagram.title)}
                >
                  {busy ? '生成中…' : '📥 生成矢量流程框图并写入报告'}
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    downloadFileBlob(
                      `${activeDiagram.id}.svg`,
                      renderDiagramPreviewSvg(activeDiagram, effectiveInk),
                      'image/svg+xml;charset=utf-8',
                    );
                    setStatus(`✓ 已导出“${activeDiagram.title}”科研框图高清矢量原件。`);
                  }}
                >
                  ⬇️ 下载高清矢量原件
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    const xml = buildDiagramCode(activeDiagram).drawio;
                    downloadFileBlob(`${activeDiagram.id}.drawio`, xml, 'application/xml;charset=utf-8');
                    setStatus(`✓ 已导出“${activeDiagram.title}”可编辑矢量源文件，可在流程图工坊继续编辑。`);
                  }}
                >
                  ⬇️ 导出可编辑矢量源文件
                </button>
                {onSaveArtifact && (
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => {
                      onSaveArtifact({ title: activeDiagram.title, svg: renderDiagramPreviewSvg(activeDiagram, effectiveInk) });
                      setStatus(`✓ 已收藏“${activeDiagram.title}”矢量样图。`);
                    }}
                  >
                    📌 收藏矢量设计稿
                  </button>
                )}
              </div>
            </>
          )}

          {branch === 'visuals' && activeVisual && (
            <>
              <h3 className={styles.inspectorTitle}>{activeVisual.label}</h3>
              <div
                className={activeVisual.aspect === '3:4' ? `${styles.previewFrame} ${styles.previewPortrait}` : styles.previewFrame}
                style={activeVisual.aspect === '3:4' ? { maxHeight: 280 } : undefined}
              >
                {activeVisual.kind === 'frame' ? (
                  <div className={styles.framePaperMock}>
                    <FrameMockBackdrop />
                    <img
                      src={activeVisual.assetUrl ?? toSvgDataUrl(renderVisualSpecSvg(activeVisual))}
                      alt={activeVisual.label}
                      className={styles.frameOverlayImg}
                    />
                  </div>
                ) : (
                  <img
                    src={
                      activeVisual.kind === 'palette_board'
                        ? toSvgDataUrl(renderPaletteBoardSvg(activeVisual))
                        : activeVisual.bentoArchetype
                          ? toSvgDataUrl(renderVisualSpecSvg(activeVisual, effectiveInk))
                          : activeVisual.assetUrl ?? toSvgDataUrl(renderVisualSpecSvg(activeVisual, effectiveInk))
                    }
                    alt={activeVisual.label}
                    className={activeVisual.aspect === '3:4' ? `${styles.previewImg} ${styles.previewImgCover}` : styles.previewImg}
                  />
                )}
              </div>
              <div className={styles.inspectorBlock}>
                <span className={styles.inspectorLabel}>{scrubDisplayHexColors(activeVisual.badge)}</span>
                <span>{scrubDisplayHexColors(activeVisual.subnote)}</span>
              </div>
              <div className={styles.inspectorBlock}>
                <span className={styles.inspectorLabel}>适用场景说明</span>
                <span>{scrubDisplayHexColors(activeVisual.whenToUse)}</span>
              </div>
              <div className={styles.actionCol}>
                {activeVisual.kind !== 'infographic' && (
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    disabled={busy}
                    onClick={() => void handleAdoptVisual(activeVisual)}
                  >
                    {busy
                      ? '同步应用中…'
                      : activeVisual.kind === 'frame'
                        ? '✨ 设为全篇透明页框'
                        : activeVisual.kind === 'palette_board'
                          ? '🎨 同步此学科语义配色至全篇图表'
                          : '✨ 设为报告+附录封面并联动配色'}
                  </button>
                )}
                {activeVisual.bentoArchetype && (
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    disabled={busy}
                    onClick={() => void applyAndNotify(() => buildInfographicInsert(activeVisual, content.title), activeVisual.label)}
                  >
                    {busy ? '写入中…' : '将专题信息图写入报告'}
                  </button>
                )}
                {activeVisual.kind === 'infographic' && onSendPrompt && (
                  <button
                    type="button"
                    className={activeVisual.bentoArchetype ? styles.secondaryBtn : styles.primaryBtn}
                    onClick={() =>
                      onSendPrompt(
                        `请参照“${activeVisual.label}”（${activeVisual.subnote}）的视觉信息架构，为我当前课题生成同构的实证摘要与多面板概念配图规划。`,
                      )
                    }
                  >
                    🧭 按此信息图视觉构型启发本篇生成
                  </button>
                )}
                {(activeVisual.kind === 'palette_board' || Boolean(activeVisual.bentoArchetype) || !activeVisual.assetUrl) && (
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => {
                      const svgBody =
                        activeVisual.kind === 'palette_board'
                          ? renderPaletteBoardSvg(activeVisual)
                          : renderVisualSpecSvg(activeVisual, effectiveInk);
                      downloadFileBlob(`${activeVisual.id}.svg`, svgBody, 'image/svg+xml;charset=utf-8');
                      setStatus(`✓ 已导出“${activeVisual.label}”高清矢量样板。`);
                    }}
                  >
                    ⬇️ 下载高清矢量原件
                  </button>
                )}
                {onSaveArtifact && (
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => {
                      onSaveArtifact({
                        title: activeVisual.label,
                        svg:
                          activeVisual.kind === 'palette_board'
                            ? renderPaletteBoardSvg(activeVisual)
                            : renderVisualSpecSvg(activeVisual, effectiveInk),
                      });
                      setStatus(`✓ 已将“${activeVisual.label}”规范样板存至产出架。`);
                    }}
                  >
                    📌 收藏视觉规范矢量样板
                  </button>
                )}
              </div>
            </>
          )}

          {branch === 'gazetteer' && activeCounty && (
            <>
              <h3 className={styles.inspectorTitle}>
                {activeCounty.name} · 标志建筑与五维风物
              </h3>
              <div className={styles.previewFrame}>
                <img
                  src={toSvgDataUrl(renderRegionVisualCardSvg(activeCounty, effectiveInk))}
                  alt={`${activeCounty.name}-${activeCounty.landmarkName}`}
                  className={styles.previewImg}
                />
              </div>
              <div className={styles.inspectorBlock}>
                <span className={styles.inspectorLabel}>标志性建筑与行政归属</span>
                <span>
                  🏛️ <strong>{activeCounty.landmarkName}</strong>（{activeCounty.provinceName} · {activeCounty.prefectureName} · {activeCounty.code}）
                  <br />
                  <small style={{ color: 'var(--c-dim)' }}>{activeCounty.provenanceNote}</small>
                </span>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div className={styles.dimItem}>
                  <strong>🏛️ 政治与基层治理</strong>
                  <span>{activeCounty.features.politicsGovernance}</span>
                </div>
                <div className={styles.dimItem}>
                  <strong>🏭 经济与特色产业</strong>
                  <span>{activeCounty.features.economyIndustry}</span>
                </div>
                <div className={styles.dimItem}>
                  <strong>🏮 文化脉络与非遗</strong>
                  <span>{activeCounty.features.cultureHeritage}</span>
                </div>
                <div className={styles.dimItem}>
                  <strong>🏡 社会结构与民生</strong>
                  <span>{activeCounty.features.societyLivelihood}</span>
                </div>
                <div className={styles.dimItem}>
                  <strong>🍜 民俗节庆与风尚</strong>
                  <span>{activeCounty.features.customsLifestyle}</span>
                </div>
              </div>
              <div className={styles.inspectorBlock}>
                <span className={styles.inspectorLabel}>市调大赛专属切入建议</span>
                <ul style={{ margin: '2px 0 0', paddingLeft: 16, fontSize: 11.5 }}>
                  {activeCounty.surveyHooks.map(h => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.actionCol}>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={busy}
                  onClick={() => void applyAndNotify(() => buildGazetteerLandmarkInsert(activeCounty), `${activeCounty.name}标志建筑与风物`)}
                >
                  {busy ? '写入中…' : '📥 将地标图谱与五维背景写入第 1 章'}
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    downloadFileBlob(
                      `${activeCounty.code}-${activeCounty.name}-${activeCounty.landmarkName}.svg`,
                      renderRegionVisualCardSvg(activeCounty, effectiveInk),
                      'image/svg+xml;charset=utf-8',
                    );
                    setStatus(`✓ 已导出“${activeCounty.name} · ${activeCounty.landmarkName}”高清地标矢量插画。`);
                  }}
                >
                  ⬇️ 下载地标矢量原件
                </button>
                {onSendPrompt && (
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => onSendPrompt(buildGazetteerTopicPrompt(activeCounty))}
                  >
                    🧭 以“{activeCounty.name}”为样本锚点发起对话选题
                  </button>
                )}
              </div>
            </>
          )}

          {(branch === 'charts' ||
            branch === 'recommended' ||
            branch === 'tables' ||
            branch === 'diagrams' ||
            branch === 'gazetteer' ||
            (branch === 'visuals' && Boolean(activeVisual?.bentoArchetype))) && (
            <div className={styles.codeDrawer}>
              <button
                type="button"
                className={styles.codeDrawerToggle}
                aria-expanded={codeOpen}
                aria-controls="resource-library-code-panel"
                aria-label={codeOpen ? '收起可复现学术源码抽屉' : '展开可复现学术源码抽屉'}
                onClick={() => setCodeOpen(prev => !prev)}
              >
                <span>
                  💻 可复现学术源码（
                  {branch === 'tables'
                    ? '学术排版'
                    : branch === 'diagrams'
                      ? '结构化流程图源码'
                      : branch === 'gazetteer' || branch === 'visuals'
                        ? '中文学术排版矢量插图'
                        : 'Python'}
                  ）
                </span>
                <span>{codeOpen ? '收起 ▴' : '展开 ▾'}</span>
              </button>
              {codeOpen && activeInspectorCode && (
                <div
                  id="resource-library-code-panel"
                  className={styles.codePanel}
                  role="region"
                  aria-label={activeInspectorCode.heading}
                >
                  <div className={styles.codeToolbar}>
                    <span className={styles.codeHeading}>{activeInspectorCode.heading}</span>
                    <div className={styles.codeBtnRow} role="group" aria-label="源码格式切换与复制下载操作">
                      {activeInspectorCode.isDiagram && (
                        <>
                          <button
                            type="button"
                            className={`${styles.codeLangTab} ${diagramCodeLang === 'mermaid' ? styles.codeLangTabActive : ''}`}
                            aria-pressed={diagramCodeLang === 'mermaid'}
                            aria-label="切换为流程图结构描述源码"
                            onClick={() => setDiagramCodeLang('mermaid')}
                          >
                            结构描述源码
                          </button>
                          <button
                            type="button"
                            className={`${styles.codeLangTab} ${diagramCodeLang === 'tikz' ? styles.codeLangTabActive : ''}`}
                            aria-pressed={diagramCodeLang === 'tikz'}
                            aria-label="切换为学术排版绘图源码"
                            onClick={() => setDiagramCodeLang('tikz')}
                          >
                            学术排版绘图源码
                          </button>
                          <button
                            type="button"
                            className={`${styles.codeLangTab} ${diagramCodeLang === 'drawio' ? styles.codeLangTabActive : ''}`}
                            aria-pressed={diagramCodeLang === 'drawio'}
                            aria-label="切换为通用流程图源文件"
                            onClick={() => setDiagramCodeLang('drawio')}
                          >
                            通用流程图源文件
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className={styles.codeLangTab}
                        aria-label={`复制“${activeInspectorCode.label}”可复现源码`}
                        onClick={() => copyCodeSnippet(activeInspectorCode.code, activeInspectorCode.label)}
                      >
                        📋 复制源码
                      </button>
                      <button
                        type="button"
                        className={styles.codeLangTab}
                        aria-label={`下载“${activeInspectorCode.filename}”源码文件`}
                        onClick={() => {
                          downloadFileBlob(activeInspectorCode.filename, activeInspectorCode.code, activeInspectorCode.mime);
                          setStatus(`✓ 已下载“${activeInspectorCode.filename}”可复现源码文件。`);
                        }}
                      >
                        ⬇️ 下载
                      </button>
                    </div>
                  </div>
                  <pre className={styles.codePre}>
                    <code>{activeInspectorCode.code}</code>
                  </pre>
                </div>
              )}
            </div>
          )}
          </div>

          <div role="status" aria-live="polite" aria-atomic="true">
            {status && <p key={status} className={styles.statusToast}>{status}</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}
