'use client';

import { figureInk, type FigureInk } from '@/lib/figure-palette';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import type { EditorContent, ReportSection } from '@/lib/editor-model';
import {figureFor,reportFigureSVG,defaultProjectVisualStyle,type ReportFigure,type ProjectVisualStyle} from '@/lib/report-figure';
import { resultFor, type ResultSnapshot } from '@/lib/research-quality';
import { blockLabel, numberedCaption, referenceSegments, type BlockLabel } from '@/lib/report-numbering';
import { columnWeights, isExhibitNote, presentResult, sectionNotes, tableSpans } from '@/lib/report-tables';
import { splitInlineMath } from '@/lib/inline-math';
import { autospace } from '@/lib/paper-layout';
import { Formula, Tex } from '../math/Tex';
import styles from './PaperBlocks.module.css';

type Labels = Map<string, BlockLabel>;
export const ACCENT: Record<EditorContent["accent"], string> = { teal: '#0F766E', blue: '#234E80', burgundy: '#8A3449' };

type Citations = ReadonlyMap<string, number>;

const INLINE_XREF_RE = /((?:附?[图表]|式)\s*[（(]?[0-9]+(?:[\-－—.][0-9]+)?[)）]?|\[\s*\d+(?:\s*[,，、\-–—]\s*\d+)*\s*\])/gu;

function renderRichPlainRun(
  source: string,
  keyPrefix: string,
  labelToBlockId: ReadonlyMap<string, string>,
) {
  // Spaced before it is cut into references, so "图 4-3可知" gets Word's space after the reference too; a reference
  // still matches with a space inside it ("图4-1" becomes "图 4-1").
  const text = autospace(source);
  const parts: ReactNode[] = [];
  let last = 0;
  let idx = 0;
  for (const m of text.matchAll(INLINE_XREF_RE)) {
    const start = m.index ?? 0;
    if (start > last) {
      parts.push(<span key={`${keyPrefix}-t-${idx++}`}>{text.slice(last, start)}</span>);
    }
    const token = m[0];
    if (token.startsWith('[')) {
      const firstNum = /\d+/u.exec(token)?.[0] ?? '1';
      parts.push(
        <sup
          key={`${keyPrefix}-c-${idx++}`}
          className={styles.cite}
          data-cite-source={firstNum}
          data-xref-kind="citation"
          title={`交叉引用：参考文献 [${firstNum}]（悬停或点击查看双端连线）`}
        >
          {token}
        </sup>,
      );
    } else {
      const normalized = token.replace(/\s+/gu, ' ').trim();
      const compact = token.replace(/\s+/gu, '');
      const matchedId = labelToBlockId.get(normalized) ?? labelToBlockId.get(compact) ?? normalized;
      parts.push(
        <span
          key={`${keyPrefix}-x-${idx++}`}
          className={styles.xrefPill}
          data-xref-source={matchedId}
          data-xref-label={normalized}
          title={`交叉引用：${normalized}（悬停或点击查看图表双端连线）`}
        >
          {token}
        </span>,
      );
    }
    last = start + token.length;
  }
  if (last < text.length) {
    parts.push(<span key={`${keyPrefix}-t-${idx++}`}>{text.slice(last)}</span>);
  }
  return parts;
}

/** Running text as the export prints it: references resolved, citations as superscripts, `$…$` typeset, broken references marked. */
export function PaperText({ text, labels, citations }: { text: string; labels: Labels; citations?: Citations }) {
  const labelToBlockId = new Map<string, string>();
  for (const [k, v] of labels.entries()) {
    if (!k.includes('\u0000')) {
      labelToBlockId.set(v.reference, k);
      labelToBlockId.set(v.reference.replace(/\s+/gu, ''), k);
      labelToBlockId.set(v.label, k);
      labelToBlockId.set(v.label.replace(/\s+/gu, ''), k);
    }
  }
  const segments = referenceSegments(text, labels, citations);
  return <>{segments.map((segment, i) => {
    if (segment.missing) {
      return <mark key={i} className={styles.broken} title={segment.cite ? '对应的参考文献已删除，导出前请重新插入引用' : '对应的图、表或公式已删除或类型不符，导出前请重新插入引用'}>{segment.text}</mark>;
    }
    if (segment.cite) {
      const firstNum = /\d+/u.exec(segment.text)?.[0] ?? '1';
      return <sup key={i} className={styles.cite} data-cite-source={firstNum} data-xref-kind="citation">{segment.text}</sup>;
    }
    const directBlockId = labelToBlockId.get(segment.text) ?? labelToBlockId.get(segment.text.replace(/\s+/gu, ''));
    if (directBlockId) {
      // Word's space between the reference's number and the Chinese text after it ("图 4-3 可知").
      const spaced = autospace(segment.text.slice(-1) + (segments[i + 1]?.text.charAt(0) ?? '')).length > 2;
      return (
        <Fragment key={i}>
          <span
            className={styles.xrefPill}
            data-xref-source={directBlockId}
            data-xref-label={segment.text}
            title={`交叉引用：${segment.text}（悬停或点击查看图表双端连线）`}
          >
            {segment.text}
          </span>
          {spaced ? ' ' : null}
        </Fragment>
      );
    }
    return splitInlineMath(segment.text).map((part, j) =>
      part.math ? <Tex key={`${i}-${j}`} tex={part.text}/> : renderRichPlainRun(part.text, `${i}-${j}`, labelToBlockId),
    );
  })}</>;
}

/** The same server-style SVG figure the Word export embeds. */
export function Figure({ result, column, accent,figure,visualStyle }: { result: ResultSnapshot; column: number; accent: FigureInk;figure?:ReportFigure;visualStyle?:ProjectVisualStyle }) {
  const [state, setState] = useState<{ key: string; svg?: string; error?: string }>({ key: '' });
  const key = `${result.resultHash}:${column}:${JSON.stringify(accent)}:${JSON.stringify(figure)}:${JSON.stringify(visualStyle)}`;
  useEffect(() => {
    let alive = true;
    import('@/lib/report-figures')
      .then(({ figureSVG }) => figure ? reportFigureSVG(figure,visualStyle??defaultProjectVisualStyle()) : figureSVG(result, column, accent))
      .then(svg => { if (alive) setState({ key, svg }); }, (error: Error) => { if (alive) setState({ key, error: error.message }); });
    return () => { alive = false; };
  }, [key, result, column, accent,figure,visualStyle]);
  if (state.key !== key) return <div className={styles.figure} aria-busy="true"/>;
  // The SVG is generated locally and has passed the vector-asset check (no scripts, styles or references).
  return state.error ? <p className={styles.error}>{state.error}</p> : <div className={styles.figure} role="img" aria-label={result.title} dangerouslySetInnerHTML={{ __html: state.svg! }}/>;
}

export function ResultTable({ result,figure,wordColumns=false,noteApart=false }: { result: ResultSnapshot;figure?:ReportFigure;
  /** Columns as wide as the Word export sets them, so cells wrap where they wrap in Word. */
  wordColumns?: boolean;
  /** The caller sets the table's note as a paragraph of its own, as the Word export does. */
  noteApart?: boolean }) {
  const table = figure ? {headers:figure.table.headers,rows:figure.table.rows.map(row=>row.map(cell=>typeof cell==='number'?String(Number(cell.toFixed(figure.style.decimals))):cell??'—')),note:figure.note} : presentResult(result), spans = figure ? null : tableSpans(result, table);
  // Merged cells (a sampling frame's parent units) span their children's rows, as in Word.
  const span = (r: number, c: number) => spans ? spans[r][c] : 1;
  const weights = wordColumns ? columnWeights(table) : null, total = weights?.reduce((a, w) => a + w, 0) ?? 1;
  return <>
    {/* Cells keep one line; a table wider than the preview scrolls sideways instead of breaking every cell. */}
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={result.title}>
      <table className={styles.table} style={weights ? { tableLayout: 'fixed' } : undefined}>
        {weights && <colgroup>{weights.map((w, i) => <col key={i} style={{ width: `${(100 * w / total).toFixed(3)}%` }} />)}</colgroup>}
        <thead><tr>{table.headers.map((h, i) => <th key={i} scope="col">{autospace(h)}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => !span(r, c) ? null : c === 0 ? <th key={c} scope="row" rowSpan={span(r, c)}>{autospace(String(cell))}</th> : <td key={c} rowSpan={span(r, c)}>{autospace(String(cell))}</td>)}</tr>)}</tbody>
      </table>
    </div>
    {table.note && !noteApart && <p className={styles.small}>{autospace(table.note)}</p>}
  </>;
}

/** A section's content blocks laid out like the Word export: numbered captions, one source per result, one note per section. */
export default function PaperBlocks({ section, content, labels, citations }: { section: ReportSection; content: EditorContent; labels: Labels; citations?: Citations }) {
  const blocks = section.blocks ?? [];
  if (!blocks.length) return null;
  const used: ResultSnapshot[] = [];
  const items = blocks.map((block, index) => {
    const bLabel = blockLabel(labels, section.id, block.id);
    if (block.kind === 'formula') return <div key={block.id} className={styles.equation} data-xref-target={block.id} data-xref-label={bLabel?.reference ?? ''}><Formula tex={block.text || '\\text{（空公式）}'} number={bLabel?.number} copyable={false} compact/></div>;
    if (isExhibitNote(blocks, index)) {
      return <p key={block.id} className={styles.small}><PaperText text={block.text} labels={labels} citations={citations}/></p>;
    }
    if (block.kind !== 'chart' && block.kind !== 'table') return <p key={block.id} className={block.kind === 'callout' ? styles.callout : undefined}><PaperText text={block.text} labels={labels} citations={citations}/></p>;
    let result: ResultSnapshot,figure:ReportFigure|undefined;
    try { result = resultFor(content.quality, block.evidenceId);if(block.figureId){figure=figureFor(content,block.figureId,block.evidenceId);if((block.kind==='table')!==(figure.kind==='table'))throw Error('图形与内容块类型不一致。');} } catch (error) { return <p key={block.id} className={styles.error}>{(error as Error).message}</p>; }
    if (!used.includes(result)) used.push(result);
    const caption = numberedCaption(bLabel, block.text || result.title);
    return <figure key={block.id} className={styles.block} data-xref-target={block.id} data-xref-label={bLabel?.reference ?? ''} data-xref-caption={caption}>
      {block.kind === 'table' && <figcaption className={styles.caption}><PaperText text={caption} labels={labels}/></figcaption>}
      {block.kind === 'chart' ? <Figure result={result} column={block.valueColumn} accent={figureInk(content)} figure={figure} visualStyle={content.visualStyle}/> : <ResultTable result={result} figure={figure}/>}
      {block.kind === 'chart' && <figcaption className={styles.caption}><PaperText text={caption} labels={labels}/></figcaption>}
      {block.kind==='chart'&&figure?.note&&<p className={styles.small}>{figure.note}</p>}
    </figure>;
  });
  const notes = sectionNotes(used);
  return <>{items}{notes && <p className={styles.small}>{notes}</p>}</>;
}
