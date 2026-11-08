'use client';

import type { EditorContent } from '@/lib/editor-model';
import PaperPages, { type LiveReviewState, type LiveTypingState } from './PaperPages';

export type { LiveReviewState, LiveTypingState } from './PaperPages';
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
  typingState = null,
  reviewState = null,
  formatScanSectionId = null,
  activeCatalogKey = null,
  onCatalogHover,
  onCatalogClick,
  docFormat = 'word',
}: {
  content: EditorContent;
  activeSectionId?: string | null;
  onPick?: (sectionId: string) => void;
  label?: string;
  writingActive?: boolean;
  typingState?: LiveTypingState | null;
  reviewState?: LiveReviewState | null;
  formatScanSectionId?: string | null;
  activeCatalogKey?: string | null;
  onCatalogHover?: (targetAttr: 'xref' | 'cite', targetId: string) => void;
  onCatalogClick?: (targetAttr: 'xref' | 'cite', targetId: string) => void;
  docFormat?: DocFormatMode;
}) {
  return (
    <PaperPages
      content={content}
      label={label}
      docFormat={docFormat}
      activeSectionId={activeSectionId ?? null}
      writingActive={writingActive}
      typingState={typingState}
      reviewState={reviewState}
      formatScanSectionId={formatScanSectionId}
      activeCatalogKey={activeCatalogKey}
      onPick={onPick}
      onCatalogHover={onCatalogHover}
      onCatalogClick={onCatalogClick}
    />
  );
}
