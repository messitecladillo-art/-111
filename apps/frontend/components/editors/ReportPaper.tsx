'use client';

import type { EditorContent } from '@/lib/editor-model';
import PaperPages, { type LiveReviewState, type LiveTypingState, type PaperAnnotation, type PaperSelectionAction } from './PaperPages';
import type { ReportWorkState } from '@/lib/agent/report-work';
import type { PaperSectionDiff } from '@/lib/agent/paper-diff';

export type { LiveReviewState, LiveTypingState, PaperAnnotation, PaperSelectionAction } from './PaperPages';
export type { PaperSectionDiff } from '@/lib/agent/paper-diff';
/** Which export the preview stands for; both are set in the same competition layout, so the pages are the same. */
export type DocFormatMode = 'latex' | 'word';

/**
 * The report as it will print: A4 pages in the competition layout (the same margins, type, spacing, captions, contents
 * and page numbers as the Word and LaTeX exports), scaled to the space it has. Live writing shows on the page as it
 * happens, and each advisor's share is marked in the margin, on screen only.
 */
export default function ReportPaper({
  content,
  activeSectionId,
  onPick,
  label = '报告书实时预览',
  writingActive = false,
  workState = null,
  typingState = null,
  reviewState = null,
  formatScanSectionId = null,
  activeCatalogKey = null,
  onCatalogHover,
  onCatalogClick,
  docFormat = 'word',
  sectionDiffs,
  onToggleDiffLock,
  onApplyRevisionDiff,
  onKeepRevisionDiff,
  highlightTerms,
  annotations,
  onSelectionAction,
  watermarkText,
}: {
  content: EditorContent;
  activeSectionId?: string | null;
  onPick?: (sectionId: string) => void;
  label?: string;
  writingActive?: boolean;
  workState?: ReportWorkState | null;
  typingState?: LiveTypingState | null;
  reviewState?: LiveReviewState | null;
  formatScanSectionId?: string | null;
  activeCatalogKey?: string | null;
  onCatalogHover?: (targetAttr: 'xref' | 'cite', targetId: string) => void;
  onCatalogClick?: (targetAttr: 'xref' | 'cite', targetId: string) => void;
  docFormat?: DocFormatMode;
  sectionDiffs?: readonly PaperSectionDiff[];
  onToggleDiffLock?: (sectionId: string) => void;
  onApplyRevisionDiff?: () => void;
  onKeepRevisionDiff?: () => void;
  highlightTerms?: readonly string[];
  annotations?: readonly PaperAnnotation[];
  onSelectionAction?: (selection: PaperSelectionAction) => void;
  watermarkText?: string | null;
}) {
  return (
    <PaperPages
      content={content}
      label={label}
      docFormat={docFormat}
      activeSectionId={activeSectionId ?? null}
      writingActive={writingActive}
      workState={workState}
      typingState={typingState}
      reviewState={reviewState}
      formatScanSectionId={formatScanSectionId}
      activeCatalogKey={activeCatalogKey}
      onPick={onPick}
      onCatalogHover={onCatalogHover}
      onCatalogClick={onCatalogClick}
      sectionDiffs={sectionDiffs}
      onToggleDiffLock={onToggleDiffLock}
      onApplyRevisionDiff={onApplyRevisionDiff}
      onKeepRevisionDiff={onKeepRevisionDiff}
      highlightTerms={highlightTerms}
      annotations={annotations}
      onSelectionAction={onSelectionAction}
      watermarkText={watermarkText}
    />
  );
}
