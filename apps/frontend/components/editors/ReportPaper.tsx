'use client';

import type { EditorContent, ReportSection } from '@/lib/editor-model';
import { formatReference, referenceNumbers, unfinishedReference } from '@/lib/references';
import { writtenLines } from '@/lib/report-benchmark';
import { outlineKind, reportPart } from '@/lib/report-format';
import { reportLabels } from '@/lib/report-numbering';
import PaperBlocks, { PaperText } from './PaperBlocks';
import styles from './EditingStudio.module.css';

const sectionWritten = (s: ReportSection) =>
  writtenLines(s.body).length > 0 || !!s.blocks?.some(b => b.kind !== 'paragraph' || writtenLines(b.text).length > 0);

type Line = { kind: 'p' | 'blank' | 'keywords' | 'hintStart' | 'hint'; text: string };
/** Preview lines: guidance left over in old drafts shows as a marked note, since it would still export as text. */
function previewLines(body: string): Line[] {
  const out: Line[] = [];
  if (!body.trim()) return out;
  let hint = false;
  for (const raw of body.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (/写作提示】/.test(line)) {
      hint = true;
      out.push({ kind: 'hintStart', text: line.replace(/^【[^】]*写作提示】/, '') });
      continue;
    }
    if (hint) {
      if (!line) {
        hint = false;
        out.push({ kind: 'blank', text: '' });
      } else out.push({ kind: 'hint', text: line });
      continue;
    }
    out.push(
      !line
        ? { kind: 'blank', text: '' }
        : /^关键词[:：]/.test(line)
          ? { kind: 'keywords', text: line.replace(/^关键词[:：]\s*/, '') }
          : { kind: 'p', text: raw },
    );
  }
  return out;
}

export type LiveTypingState = {
  sectionId: string;
  visibleBody: string;
};

export type LiveReviewState = {
  sectionId: string;
  badPhrase: string;
  goodPhrase: string;
  reason: string;
  step: 'flag' | 'rewrite' | 'done';
  typedGood: string;
};

/**
 * The report as it will print: title, every section in order with its text, figures, tables, formulas and the numbered
 * reference list, numbered and cited as the Word export numbers and cites them. The same paper serves the editor's live
 * preview and the agent's centre stage; a section can be picked by clicking it.
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
}: {
  content: EditorContent;
  activeSectionId?: string | null;
  onPick?: (sectionId: string) => void;
  label?: string;
  writingActive?: boolean;
  typingState?: LiveTypingState | null;
  reviewState?: LiveReviewState | null;
  formatScanSectionId?: string | null;
}) {
  const labels = reportLabels(content.report);
  const cited = referenceNumbers(content),
    citations = cited.numbers,
    uncited = new Set(cited.uncited.map(e => e.id));

  return (
    <article className={styles.paper} aria-label={label}>
      <header>
        <h2>{content.title}</h2>
        <p>{content.subtitle}</p>
      </header>
      {content.report.map(s => {
        const isTypingHere = typingState?.sectionId === s.id;
        const isReviewingHere = reviewState?.sectionId === s.id;
        const isFormatScanning = formatScanSectionId === s.id;
        const effectiveBody = isTypingHere ? typingState.visibleBody : s.body;
        const kind = outlineKind(s.title),
           isRefPart = reportPart(s.title) === 'references',
          references = isRefPart && cited.order.length > 0;
        const empty =
          kind !== 'chapter' &&
          !isTypingHere &&
          !sectionWritten(s) &&
          !/写作提示】/.test(s.body) &&
          !references;
        const lines = previewLines(effectiveBody);
        const lastNonBlankIdx = lines.map(l => l.kind !== 'blank').lastIndexOf(true);

        return (
          <section
            key={s.id}
            data-report-section={s.id}
            data-kind={kind}
            data-part={reportPart(s.title)}
            data-format-scan={isFormatScanning ? 'true' : undefined}
            className={s.id === activeSectionId ? styles.activeSection : undefined}
            data-pickable={onPick ? 'true' : undefined}
            onClick={onPick ? () => onPick(s.id) : undefined}
          >
            <h3>{s.title || '未命名章节'}</h3>
            {empty ? (
              <p
                className={styles.pending}
                style={writingActive ? { color: '#0f766e', fontStyle: 'normal', fontWeight: 500 } : undefined}
              >
                {writingActive ? '✦ 证见撰稿官正在结合实证调查数据排队落笔本节…' : '待撰写'}
              </p>
            ) : (
              lines.map((line, i) => {
                if (line.kind === 'blank') return <p key={i} className={styles.blank} aria-hidden="true" />;
                const isCaretLine = isTypingHere && !isReviewingHere && i === lastNonBlankIdx;
                const refLineMatch = isRefPart ? /^\s*\[(\d+)\]/u.exec(line.text) : null;
                if (line.kind === 'keywords') {
                  return (
                    <p key={i} className={styles.keywords}>
                      <b>关键词：</b>
                      {line.text}
                      {isCaretLine && <span data-typing-caret="true" className={styles.typingCaret} aria-hidden="true" />}
                    </p>
                  );
                }
                return (
                  <p
                    key={i}
                    data-cite-target={refLineMatch ? refLineMatch[1] : undefined}
                    className={
                      line.kind === 'hintStart'
                        ? styles.hintStart
                        : line.kind === 'hint'
                          ? styles.hintLine
                          : undefined
                    }
                  >
                    {line.kind === 'p' ? (
                      <PaperText text={line.text} labels={labels} citations={citations} />
                    ) : (
                      line.text
                    )}
                    {isCaretLine && <span data-typing-caret="true" className={styles.typingCaret} aria-hidden="true" />}
                  </p>
                );
              })
            )}
            {isReviewingHere && reviewState && (
              <div className={styles.redlineBox} data-step={reviewState.step} role="status" aria-live="polite">
                <div className={styles.redlineHeader}>
                  <span className={styles.redlineBadge}>
                    {reviewState.step === 'flag'
                      ? '🔍 审稿官巡检拦截'
                      : reviewState.step === 'rewrite'
                        ? '✍️ 审稿官正在逐字修订'
                        : '✓ 审稿官已完成严谨性修正'}
                  </span>
                  <span className={styles.redlineReason}>{reviewState.reason}</span>
                </div>
                <p className={styles.redlineDiff}>
                  <del className={styles.redlineDel}>{reviewState.badPhrase}</del>
                  {reviewState.step === 'flag' && (
                    <span data-typing-caret="true" className={styles.typingCaret} aria-hidden="true" />
                  )}
                  {(reviewState.step === 'rewrite' || reviewState.step === 'done') && (
                    <>
                      <span className={styles.redlineArrow}> → </span>
                      <ins className={styles.redlineGood}>
                        {reviewState.step === 'done' ? reviewState.goodPhrase : reviewState.typedGood}
                      </ins>
                      {reviewState.step === 'rewrite' && (
                        <span data-typing-caret="true" className={styles.typingCaret} aria-hidden="true" />
                      )}
                    </>
                  )}
                </p>
              </div>
            )}
            {references && (
              <ol className={styles.referenceList}>
                {cited.order.map(entry => {
                  const num = citations.get(entry.id);
                  return (
                    <li
                      key={entry.id}
                      data-cite-target={num ? String(num) : undefined}
                      data-uncited={uncited.has(entry.id) || undefined}
                    >
                      <span>[{num}]</span>
                      {unfinishedReference(entry) ? (
                        <em className={styles.pending}>尚未填写题名</em>
                      ) : (
                        formatReference(entry)
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <PaperBlocks section={s} content={content} labels={labels} citations={citations} />
            {s.source && <p className={styles.source}>来源 / 说明：{s.source.replace(/\{F\d+\}/gu, '实证数据')}</p>}
          </section>
        );
      })}
    </article>
  );
}
