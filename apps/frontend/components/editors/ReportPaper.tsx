'use client';

import type { EditorContent, ReportSection } from '@/lib/editor-model';
import { formatReference, referenceNumbers, unfinishedReference } from '@/lib/references';
import { writtenLines } from '@/lib/report-benchmark';
import { outlineKind, reportHeadingLevel, reportPart } from '@/lib/report-format';
import { blockLabel, reportLabels } from '@/lib/report-numbering';
import { resultFor } from '@/lib/research-quality';
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

export type DocFormatMode = 'latex' | 'word';

const RULER_TICKS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36];

/**
 * The report rendered as an A4 publication document in either:
 * - `latex` mode (`ctexart` + `booktabs` + `amsmath` PDF print layout)
 * - `word` mode (1:1 正大杯官方 Word `.docx` template layout with horizontal character ruler, running header & track changes)
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
  docFormat = 'latex',
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
  const labels = reportLabels(content.report);
  const cited = referenceNumbers(content),
    citations = cited.numbers,
    uncited = new Set(cited.uncited.map(e => e.id));

  // Build Table of Contents (总目录), Table of Figures (图目录), and Table of Tables (表目录)
  const chapterToc: { id: string; title: string; level: number; page: number }[] = [];
  const figureCatalog: { id: string; tag: string; title: string; sectionTitle: string; page: number }[] = [];
  const tableCatalog: { id: string; tag: string; title: string; sectionTitle: string; page: number }[] = [];

  let virtualPage = 1;
  for (const s of content.report) {
    const level = reportHeadingLevel(s.title) ?? 3;
    if (level === 1 && reportPart(s.title) === 'body' && chapterToc.length > 0) {
      virtualPage += 1;
    }
    if (level <= 2 || reportPart(s.title) !== 'body') {
      chapterToc.push({
        id: s.id,
        title: s.title,
        level: reportPart(s.title) !== 'body' ? 1 : level,
        page: virtualPage,
      });
    }
    for (const b of s.blocks ?? []) {
      if (b.kind !== 'chart' && b.kind !== 'table') continue;
      const bLbl = blockLabel(labels, s.id, b.id);
      if (!bLbl) continue;
      let fallbackTitle = b.text;
      if (!fallbackTitle) {
        try {
          fallbackTitle = resultFor(content.quality, b.evidenceId).title;
        } catch {
          fallbackTitle = s.title;
        }
      }
      const item = {
        id: b.id,
        tag: bLbl.label,
        title: fallbackTitle || s.title,
        sectionTitle: s.title,
        page: virtualPage,
      };
      if (b.kind === 'chart') figureCatalog.push(item);
      else tableCatalog.push(item);
    }
    const charLen = (s.body || '').length + (s.blocks?.length ?? 0) * 280;
    if (charLen > 750) virtualPage += 1;
  }

  const totalChars = content.report.reduce((sum, s) => sum + (s.body || '').replace(/\s+/gu, '').length, 0);

  return (
    <article className={styles.paper} data-doc-format={docFormat} aria-label={label}>
      {docFormat === 'word' && (
        <div className={styles.wordChrome} aria-hidden="true">
          <div className={styles.wordStatusStrip}>
            <span>正大杯官方 Word 模板规范（GB/T 9704 · A4 210×297mm）</span>
            <span>页边距：上下 2.54cm · 左右 3.18cm</span>
            <span>正文：小四号宋体 · 首行缩进 2 字符 · 1.5 倍行距</span>
            <span>表格：1.5pt / 0.75pt 标准三线表</span>
          </div>
          <div className={styles.wordRuler}>
            <span className={styles.rulerMarginLeft} title="左页边距 3.18cm" />
            <div className={styles.rulerBody}>
              <span className={styles.rulerIndentMarker} title="首行缩进 2 字符" />
              {RULER_TICKS.map(n => (
                <span key={n} className={styles.rulerTick}>
                  {n}
                </span>
              ))}
            </div>
            <span className={styles.rulerMarginRight} title="右页边距 3.18cm" />
          </div>
        </div>
      )}

      {docFormat === 'latex' && (
        <div className={styles.latexHeaderBar} aria-hidden="true">
          <span>\documentclass[UTF8,a4paper,zihao=-4]&#123;ctexart&#125;</span>
          <span>\usepackage&#123;booktabs,amsmath,graphicx,hyperref&#125;</span>
          <span>XeLaTeX · A4 PDF 标准学术排印</span>
        </div>
      )}

      {/* Running Header on the A4 Sheet */}
      <div className={styles.runningHeader} aria-hidden="true">
        <span>全国大学生市场调查与分析大赛参赛报告（盲审规范版）</span>
        <span>{content.title}</span>
      </div>

      {/* Formal Title Block */}
      <header className={styles.titleBlock}>
        <p className={styles.competitionKicker}>全国大学生市场调查与分析大赛 · 参赛实证调研报告</p>
        <h2>{content.title}</h2>
        {content.subtitle && <p className={styles.subtitleLine}>{content.subtitle}</p>}
        <div className={styles.docMetaLine}>
          <span>盲审合规：已隐去参赛院校与作者姓名</span>
          <span>·</span>
          <span>全篇章节：{content.report.length} 节</span>
          <span>·</span>
          <span>正文字数：{totalChars.toLocaleString()} 字</span>
          <span>·</span>
          <span>统计图表：{figureCatalog.length} 图 {tableCatalog.length} 表</span>
        </div>
      </header>

      {/* Formal Academic Table of Contents, List of Figures, and List of Tables */}
      {(chapterToc.length > 3 || figureCatalog.length > 0 || tableCatalog.length > 0) && (
        <nav className={styles.paperCatalog} aria-label="目录、图目录与表目录">
          {chapterToc.length > 3 && (
            <div className={styles.tocSection}>
              <h4>目　录</h4>
              <ul className={styles.tocList}>
                {chapterToc.map(item => (
                  <li key={item.id} data-level={item.level}>
                    <button
                      type="button"
                      className={styles.catalogRow}
                      onClick={() => onPick?.(item.id)}
                    >
                      <span className={styles.catalogName}>{item.title}</span>
                      <span className={styles.catalogDots} aria-hidden="true" />
                      <span className={styles.catalogPage}>{item.page}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(figureCatalog.length > 0 || tableCatalog.length > 0) && (
            <div className={styles.exhibitCatalogGrid}>
              {figureCatalog.length > 0 && (
                <div className={styles.catalogCol}>
                  <h4>图目录</h4>
                  <ul>
                    {figureCatalog.map(item => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={styles.catalogRow}
                          data-directory-node={`xref:${item.id}`}
                          data-linked={activeCatalogKey === `xref:${item.id}` ? 'true' : undefined}
                          onMouseEnter={() => onCatalogHover?.('xref', item.id)}
                          onClick={() => onCatalogClick?.('xref', item.id)}
                        >
                          <span className={styles.catalogTag}>{item.tag}</span>
                          <span className={styles.catalogName}>{item.title}</span>
                          <span className={styles.catalogDots} aria-hidden="true" />
                          <span className={styles.catalogPage}>{item.page}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {tableCatalog.length > 0 && (
                <div className={styles.catalogCol}>
                  <h4>表目录</h4>
                  <ul>
                    {tableCatalog.map(item => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={styles.catalogRow}
                          data-directory-node={`xref:${item.id}`}
                          data-linked={activeCatalogKey === `xref:${item.id}` ? 'true' : undefined}
                          onMouseEnter={() => onCatalogHover?.('xref', item.id)}
                          onClick={() => onCatalogClick?.('xref', item.id)}
                        >
                          <span className={styles.catalogTag}>{item.tag}</span>
                          <span className={styles.catalogName}>{item.title}</span>
                          <span className={styles.catalogDots} aria-hidden="true" />
                          <span className={styles.catalogPage}>{item.page}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </nav>
      )}

      {content.report.map((s, secIdx) => {
        const isTypingHere = typingState?.sectionId === s.id;
        const isReviewingHere = reviewState?.sectionId === s.id;
        const isFormatScanning = formatScanSectionId === s.id;
        const effectiveBody = isTypingHere ? typingState.visibleBody : s.body;
        const kind = outlineKind(s.title),
          level = reportHeadingLevel(s.title),
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
        const showPageBreak = level === 1 && secIdx > 1 && reportPart(s.title) === 'body';

        return (
          <section
            key={s.id}
            data-report-section={s.id}
            data-kind={kind}
            data-level={level}
            data-part={reportPart(s.title)}
            data-page-break={showPageBreak ? 'true' : undefined}
            data-format-scan={isFormatScanning ? 'true' : undefined}
            className={s.id === activeSectionId ? styles.activeSection : undefined}
            data-pickable={onPick ? 'true' : undefined}
            onClick={onPick ? () => onPick(s.id) : undefined}
          >
            {showPageBreak && (
              <div className={styles.pageBreakDivider} aria-hidden="true">
                <span>— A4 分页符 · {s.title} —</span>
              </div>
            )}
            <h3>{s.title || '未命名章节'}</h3>
            {empty ? (
              <p
                className={styles.pending}
                style={writingActive ? { color: '#0f766e', fontStyle: 'normal', fontWeight: 500 } : undefined}
              >
                {writingActive ? '正在撰写本节…' : '待撰写'}
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
                      ? '审阅批注'
                      : reviewState.step === 'rewrite'
                        ? '正在修订'
                        : '修订完成'}
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
            {s.source && <p className={styles.source}>来源 / 说明：{s.source.replace(/\{F\d+\}/gu, '实证调查数据')}</p>}
          </section>
        );
      })}

      <footer className={styles.runningFooter} aria-hidden="true">
        <span>— 全国大学生市场调查与分析大赛标准排版（{docFormat === 'latex' ? 'XeLaTeX booktabs 学术排印' : 'Word .docx 官方模板映射'}） · 共 {virtualPage} 页 —</span>
      </footer>
    </article>
  );
}
