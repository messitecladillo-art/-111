'use client';

import type { EditorContent, ReportSection } from '@/lib/editor-model';
import { formatReference, referenceNumbers, unfinishedReference } from '@/lib/references';
import { writtenLines } from '@/lib/report-benchmark';
import { outlineKind, reportPart } from '@/lib/report-format';
import { reportLabels } from '@/lib/report-numbering';
import PaperBlocks, { PaperText } from './PaperBlocks';
import styles from './EditingStudio.module.css';

const sectionWritten = (s: ReportSection) => writtenLines(s.body).length > 0 || !!s.blocks?.some(b => b.kind !== 'paragraph' || writtenLines(b.text).length > 0);

type Line = { kind: 'p' | 'blank' | 'keywords' | 'hintStart' | 'hint'; text: string };
/** Preview lines: guidance left over in old drafts shows as a marked note, since it would still export as text. */
function previewLines(body: string): Line[] {
  const out: Line[] = [];
  if (!body.trim()) return out;
  let hint = false;
  for (const raw of body.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (/写作提示】/.test(line)) { hint = true; out.push({ kind: 'hintStart', text: line.replace(/^【[^】]*写作提示】/, '') }); continue; }
    if (hint) { if (!line) { hint = false; out.push({ kind: 'blank', text: '' }); } else out.push({ kind: 'hint', text: line }); continue; }
    out.push(!line ? { kind: 'blank', text: '' } : /^关键词[:：]/.test(line) ? { kind: 'keywords', text: line.replace(/^关键词[:：]\s*/, '') } : { kind: 'p', text: raw });
  }
  return out;
}

/**
 * The report as it will print: title, every section in order with its text, figures, tables, formulas and the numbered
 * reference list, numbered and cited as the Word export numbers and cites them. The same paper serves the editor's live
 * preview and the agent's centre stage; a section can be picked by clicking it.
 */
export default function ReportPaper({ content, activeSectionId, onPick, label = '报告书实时预览' }: {
  content: EditorContent; activeSectionId?: string | null; onPick?: (sectionId: string) => void; label?: string;
}) {
  const labels = reportLabels(content.report);
  const cited = referenceNumbers(content), citations = cited.numbers, uncited = new Set(cited.uncited.map(e => e.id));
  return <article className={styles.paper} aria-label={label}>
    <header><h2>{content.title}</h2><p>{content.subtitle}</p></header>
    {content.report.map(s => {
      const kind = outlineKind(s.title), references = reportPart(s.title) === 'references' && cited.order.length > 0;
      const empty = kind !== 'chapter' && !sectionWritten(s) && !/写作提示】/.test(s.body) && !references;
      return <section key={s.id} data-report-section={s.id} data-kind={kind} data-part={reportPart(s.title)} className={s.id === activeSectionId ? styles.activeSection : undefined}
        data-pickable={onPick ? 'true' : undefined} onClick={onPick ? () => onPick(s.id) : undefined}>
        <h3>{s.title || '未命名章节'}</h3>
        {empty ? <p className={styles.pending}>待撰写</p> : previewLines(s.body).map((line, i) => line.kind === 'blank' ? <p key={i} className={styles.blank} aria-hidden="true" />
          : line.kind === 'keywords' ? <p key={i} className={styles.keywords}><b>关键词：</b>{line.text}</p>
          : <p key={i} className={line.kind === 'hintStart' ? styles.hintStart : line.kind === 'hint' ? styles.hintLine : undefined}>{line.kind === 'p' ? <PaperText text={line.text} labels={labels} citations={citations} /> : line.text}</p>)}
        {references && <ol className={styles.referenceList}>{cited.order.map(entry => <li key={entry.id} data-uncited={uncited.has(entry.id) || undefined}><span>[{citations.get(entry.id)}]</span>{unfinishedReference(entry) ? <em className={styles.pending}>尚未填写题名</em> : formatReference(entry)}</li>)}</ol>}
        <PaperBlocks section={s} content={content} labels={labels} citations={citations} />
        {s.source && <p className={styles.source}>来源 / 说明：{s.source}</p>}
      </section>;
    })}
  </article>;
}
