/**
 * Strict WYSIWYG vector rendering bridge between EVI-X Resource Library snapshots
 * (`buildChartSampleInsert`, `buildDiagramInsert`, `buildGazetteerLandmarkInsert`)
 * and all downstream report surfaces:
 *  - Live A4 Paper Canvas (`PaperBlocks.tsx` -> `figureSVG`)
 *  - Word `.docx` (`quality-export.ts` -> `wordBlocks` -> `figureSVG`)
 *  - PowerPoint `.pptx` (`quality-export.ts` -> `addQualityObjects` -> `figureSVG`)
 *  - XeLaTeX PDF (`latex-images.ts` -> `figureSVG`)
 */
import type { FigureInk } from '../figure-palette.ts';
import { assertTrueVector } from '../vector-svg.ts';
import { CHART_CATALOG, renderChartPreviewSvg } from './chart-catalog.ts';
import { getCountyProfile, renderRegionVisualCardSvg } from './china-county-gazetteer.ts';
import { DIAGRAM_CATALOG, renderDiagramPreviewSvg } from './diagram-catalog.ts';
import { VISUAL_CATALOG, renderVisualSpecSvg } from './visual-catalog.ts';

type ResourceDescriptor =
  | { kind: 'chart'; id: string }
  | { kind: 'diagram'; id: string }
  | { kind: 'infographic'; id: string }
  | { kind: 'landmark'; code: string };

const CHART_PREFIX_RE = /^lib-chart-(.+)-[0-9a-z]+$/u;
const DIAG_PREFIX_RE = /^lib-diag-(.+)-[0-9a-z]+$/u;
const INFOGRAPHIC_PREFIX_RE = /^lib-info-(.+)-[0-9a-z]+$/u;
const LANDMARK_PREFIX_RE = /^lib-landmark-([0-9a-z-]+)-[0-9a-z]+$/u;

function resolveResourceDescriptor(r: {
  id?: string;
  variables?: readonly string[];
}): ResourceDescriptor | null {
  for (const v of r.variables ?? []) {
    if (v.startsWith('resource-chart:')) {
      const id = v.slice('resource-chart:'.length);
      if (CHART_CATALOG.some(c => c.id === id)) return { kind: 'chart', id };
    }
    if (v.startsWith('resource-diagram:')) {
      const id = v.slice('resource-diagram:'.length);
      if (DIAGRAM_CATALOG.some(d => d.id === id)) return { kind: 'diagram', id };
    }
    if (v.startsWith('resource-infographic:')) {
      const id = v.slice('resource-infographic:'.length);
      if (VISUAL_CATALOG.some(vis => vis.id === id && vis.bentoArchetype)) return { kind: 'infographic', id };
    }
    if (v.startsWith('resource-landmark:')) {
      const code = v.slice('resource-landmark:'.length);
      if (getCountyProfile(code)) return { kind: 'landmark', code };
    }
  }

  const rawId = r.id ?? '';
  const mChart = CHART_PREFIX_RE.exec(rawId);
  if (mChart && CHART_CATALOG.some(c => c.id === mChart[1])) {
    return { kind: 'chart', id: mChart[1] };
  }
  const mDiag = DIAG_PREFIX_RE.exec(rawId);
  if (mDiag && DIAGRAM_CATALOG.some(d => d.id === mDiag[1])) {
    return { kind: 'diagram', id: mDiag[1] };
  }
  const mInfo = INFOGRAPHIC_PREFIX_RE.exec(rawId);
  if (mInfo && VISUAL_CATALOG.some(vis => vis.id === mInfo[1] && vis.bentoArchetype)) {
    return { kind: 'infographic', id: mInfo[1] };
  }
  const mLandmark = LANDMARK_PREFIX_RE.exec(rawId);
  if (mLandmark && getCountyProfile(mLandmark[1])) {
    return { kind: 'landmark', code: mLandmark[1] };
  }
  return null;
}

function upscaleForReportPrint(svg: string, width: number, height: number): string {
  return svg.replace(
    /^<svg\b([^>]*?)\swidth="\d+(?:\.\d+)?"\sheight="\d+(?:\.\d+)?"/u,
    `<svg$1 width="${width}" height="${height}"`,
  );
}

export function isResourceLibrarySnapshot(r: { id?: string; variables?: readonly string[] }): boolean {
  return resolveResourceDescriptor(r) !== null;
}

export function renderResourceLibraryReportSvg(
  r: { id?: string; variables?: readonly string[] },
  ink: FigureInk,
): string | null {
  const desc = resolveResourceDescriptor(r);
  if (!desc) return null;
  if (desc.kind === 'chart') {
    const item = CHART_CATALOG.find(c => c.id === desc.id);
    if (!item) return null;
    return assertTrueVector(upscaleForReportPrint(renderChartPreviewSvg(item, ink), 960, 608));
  }
  if (desc.kind === 'diagram') {
    const item = DIAGRAM_CATALOG.find(d => d.id === desc.id);
    if (!item) return null;
    return assertTrueVector(upscaleForReportPrint(renderDiagramPreviewSvg(item, ink), 960, 608));
  }
  if (desc.kind === 'infographic') {
    const item = VISUAL_CATALOG.find(v => v.id === desc.id && v.bentoArchetype);
    if (!item) return null;
    return assertTrueVector(upscaleForReportPrint(renderVisualSpecSvg(item, ink), 960, 608));
  }
  const prof = getCountyProfile(desc.code);
  if (!prof) return null;
  return assertTrueVector(upscaleForReportPrint(renderRegionVisualCardSvg(prof, ink), 960, 600));
}
