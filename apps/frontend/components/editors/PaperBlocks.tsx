'use client';

import { useEffect, useState } from 'react';
import type { EditorContent, ReportSection } from '@/lib/editor-model';
import {figureFor,reportFigureSVG,defaultProjectVisualStyle,type ReportFigure,type ProjectVisualStyle} from '@/lib/report-figure';
import { resultFor, type ResultSnapshot } from '@/lib/research-quality';
import { blockLabel, numberedCaption, referenceSegments, type BlockLabel } from '@/lib/report-numbering';
import { presentResult, sectionNotes, sourceLine, tableSpans } from '@/lib/report-tables';
import { splitInlineMath } from '@/lib/inline-math';
import { Formula, Tex } from '../math/Tex';
import styles from './PaperBlocks.module.css';

type Labels = Map<string, BlockLabel>;
const ACCENT: Record<EditorContent['accent'], string> = { teal: '#0F766E', blue: '#234E80', burgundy: '#8A3449' };

type Citations = ReadonlyMap<string, number>;
/** Running text as the export prints it: references resolved, citations as superscripts, `$…$` typeset, broken references marked. */
export function PaperText({ text, labels, citations }: { text: string; labels: Labels; citations?: Citations }) {
  return <>{referenceSegments(text, labels, citations).map((segment, i) => segment.missing
    ? <mark key={i} className={styles.broken} title={segment.cite ? '对应的参考文献已删除，导出前请重新插入引用' : '对应的图、表或公式已删除或类型不符，导出前请重新插入引用'}>{segment.text}</mark>
    : segment.cite ? <sup key={i} className={styles.cite}>{segment.text}</sup>
    : splitInlineMath(segment.text).map((part, j) => part.math ? <Tex key={`${i}-${j}`} tex={part.text}/> : <span key={`${i}-${j}`}>{part.text}</span>))}</>;
}

/** The same server-style SVG figure the Word export embeds. */
function Figure({ result, column, accent,figure,visualStyle }: { result: ResultSnapshot; column: number; accent: string;figure?:ReportFigure;visualStyle?:ProjectVisualStyle }) {
  const [state, setState] = useState<{ key: string; svg?: string; error?: string }>({ key: '' });
  const key = `${result.resultHash}:${column}:${accent}:${JSON.stringify(figure)}:${JSON.stringify(visualStyle)}`;
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

function Table({ result,figure }: { result: ResultSnapshot;figure?:ReportFigure }) {
  const table = figure ? {headers:figure.table.headers,rows:figure.table.rows.map(row=>row.map(cell=>typeof cell==='number'?String(Number(cell.toFixed(figure.style.decimals))):cell??'—')),note:figure.note} : presentResult(result), spans = figure ? null : tableSpans(result, table);
  // Merged cells (a sampling frame's parent units) span their children's rows, as in Word.
  const span = (r: number, c: number) => spans ? spans[r][c] : 1;
  return <>
    {/* Cells keep one line; a table wider than the preview scrolls sideways instead of breaking every cell. */}
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={result.title}>
      <table className={styles.table}>
        <thead><tr>{table.headers.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => !span(r, c) ? null : c === 0 ? <th key={c} scope="row" rowSpan={span(r, c)}>{cell}</th> : <td key={c} rowSpan={span(r, c)}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
    {table.note && <p className={styles.small}>{table.note}</p>}
  </>;
}

/** A section's content blocks laid out like the Word export: numbered captions, one source per result, one note per section. */
export default function PaperBlocks({ section, content, labels, citations }: { section: ReportSection; content: EditorContent; labels: Labels; citations?: Citations }) {
  const blocks = section.blocks ?? [];
  if (!blocks.length) return null;
  const used: ResultSnapshot[] = [];
  const items = blocks.map((block, index) => {
    if (block.kind === 'formula') return <div key={block.id} className={styles.equation}><Formula tex={block.text || '\\text{（空公式）}'} number={blockLabel(labels, section.id, block.id)?.number} copyable={false} compact/></div>;
    if (block.kind !== 'chart' && block.kind !== 'table') return <p key={block.id} className={block.kind === 'callout' ? styles.callout : undefined}><PaperText text={block.text} labels={labels} citations={citations}/></p>;
    let result: ResultSnapshot,figure:ReportFigure|undefined;
    try { result = resultFor(content.quality, block.evidenceId);if(block.figureId){figure=figureFor(content,block.figureId,block.evidenceId);if((block.kind==='table')!==(figure.kind==='table'))throw Error('图形与内容块类型不一致。');} } catch (error) { return <p key={block.id} className={styles.error}>{(error as Error).message}</p>; }
    if (!used.includes(result)) used.push(result);
    const next = blocks[index + 1], source = !(next && (next.kind === 'chart' || next.kind === 'table') && next.evidenceId === block.evidenceId);
    const caption = numberedCaption(blockLabel(labels, section.id, block.id), block.text || result.title);
    return <figure key={block.id} className={styles.block}>
      {block.kind === 'table' && <figcaption className={styles.caption}><PaperText text={caption} labels={labels}/></figcaption>}
      {block.kind === 'chart' ? <Figure result={result} column={block.valueColumn} accent={ACCENT[content.accent]} figure={figure} visualStyle={content.visualStyle}/> : <Table result={result} figure={figure}/>}
      {block.kind === 'chart' && <figcaption className={styles.caption}><PaperText text={caption} labels={labels}/></figcaption>}
      {block.kind==='chart'&&figure?.note&&<p className={styles.small}>{figure.note}</p>}
      {source && <p className={styles.small}>{sourceLine(result)}</p>}
    </figure>;
  });
  const notes = sectionNotes(used);
  return <>{items}{notes && <p className={styles.small}>{notes}</p>}</>;
}
