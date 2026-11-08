'use client';

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ADVISORS, ADVISOR_TONES, advisorForNode, exhibitAdvisor } from '@/lib/agent/advisors';
import type { EditorContent, ReportSection } from '@/lib/editor-model';
import { MAIN_PAGE_LIMIT, PAGE, WORD_LATIN_SINGLE, WORD_SINGLE, autospace, folio, lineSplits, paginate, type FlowBox, type PageSlice, type PageStyle } from '@/lib/paper-layout';
import { formatReference, referenceNumbers, unfinishedReference } from '@/lib/references';
import { writtenLines } from '@/lib/report-benchmark';
import { matchBlueprintNode } from '@/lib/report-blueprint';
import { figureFor, type ReportFigure } from '@/lib/report-figure';
import { DEFAULT_REPORT_OPTIONS, reportHeadingLevel, reportPart } from '@/lib/report-format';
import { blockLabel, numberedCaption, reportLabels } from '@/lib/report-numbering';
import { isExhibitNote, sectionNotes } from '@/lib/report-tables';
import { pageArtDataUrl } from '@/lib/page-art';
import { resultFor, type ResultSnapshot } from '@/lib/research-quality';
import { Formula } from '../math/Tex';
import { ACCENT, Figure, PaperText, ResultTable } from './PaperBlocks';
import css from './PaperPages.module.css';
import ReportWorkstation from '@/components/figures/report-workstation/ReportWorkstation';
import { reportWorkPlacement, type ReportWorkState } from '@/lib/agent/report-work';

export type LiveTypingState = { sectionId: string; visibleBody: string };
export type LiveReviewState = { sectionId: string; badPhrase: string; goodPhrase: string; reason: string; step: 'flag' | 'rewrite' | 'done'; typedGood: string };

type Kind = 'cover' | 'title' | 'special' | 'entry' | 'heading' | 'para' | 'ref' | 'figure' | 'caption' | 'table' | 'equation' | 'small' | 'note' | 'review';
type Item = {
  key: string;
  kind: Kind;
  style: PageStyle;
  sectionId?: string;
  /** The advisor whose skill wrote this part; screen-only marks in the margin carry its colour. */
  advisor?: string | null;
  breakBefore?: boolean;
  keepNext?: boolean;
  split?: 'lines' | 'rows';
  /** What the contents and the lists of tables and figures point to. */
  anchor?: string;
  /** A section heading whose section has nothing written yet. */
  pending?: boolean;
  /** Word's space before and after the paragraph, in points; between two boxes the larger one applies, as in Word. */
  before?: number;
  after?: number;
  /** The space this box opens with: max(own before, previous after), or its own before when a section starts here. */
  gap?: number;
  /** The break before this box is a page break inside a section (Word's "page break before"). */
  hardBreak?: boolean;
  /** The appendix is exported as a document of its own, with its own cover, contents and page numbers. */
  doc?: 'appendix';
  render: (ctx: RenderCtx) => ReactNode;
};
type Live = { typing: LiveTypingState | null; review: LiveReviewState | null; writingActive: boolean };
type Catalog = { activeKey: string | null; onHover?: (attr: 'xref' | 'cite', id: string) => void; onClick?: (attr: 'xref' | 'cite', id: string) => void; onPick?: (sectionId: string) => void };
/** What a box needs when it is drawn: whether it is on a page (and may be clicked and found), its page numbers, the catalog's handlers. */
type RenderCtx = { onPage: boolean; folioOf: (anchor: string) => string; catalog: Catalog };
const MEASURE: RenderCtx = { onPage: false, folioOf: () => '00', catalog: { activeKey: null } };

/**
 * Space before and after each kind of paragraph in points, as the Word export's styles set it: `small` is the source
 * line's style (资料来源: single lines, 2 pt before), `note` the section note's (注释: 1.08 lines, 6 pt before and after).
 */
const SPACING: Record<Kind, [number, number]> = {
  cover: [0, 0], title: [0, 14], special: [6, 0], entry: [0, 0], heading: [6, 0], para: [6, 0], ref: [0, 0],
  figure: [12, 0], caption: [3, 6], table: [0, 0], equation: [0, 0], small: [2, 6], note: [6, 6], review: [6, 6],
};
/** The gap each box opens with: the larger of its own space before and the space after the box above it. */
function withGaps(items: Item[]): Item[] {
  return items.map((item, k) => {
    const [before, after] = SPACING[item.kind];
    const own = item.before ?? before, above = k && !item.breakBefore ? items[k - 1].after ?? SPACING[items[k - 1].kind][1] : 0;
    return { ...item, before: own, after: item.after ?? after, gap: Math.max(own, above) };
  });
}

const written = (s: ReportSection) => writtenLines(s.body).length > 0 || !!s.blocks?.some(b => b.kind !== 'paragraph' || writtenLines(b.text).length > 0);
const GENERATED_APPENDIX = /^appendix-(?:data|ai|claims)-[a-f0-9]{64}$/;

/**
 * The report as the Word export sets it, in reading order: a cover page, the abstract and the contents as front matter,
 * the body from page 1, then each further part on a new page. Every paragraph, heading, caption, figure and table is
 * one box, so the boxes can be measured and broken into pages the way Word breaks them.
 */
function buildFlow(content: EditorContent, live: Live): Item[] {
  const options = content.reportFormat?.options ?? DEFAULT_REPORT_OPTIONS;
  const labels = reportLabels(content.report);
  const cited = referenceNumbers(content), citations = cited.numbers;
  const rich = (text: string) => <PaperText text={text} labels={labels} citations={citations} />;
  const items: Item[] = [];
  const ownerOf = (s: ReportSection) => {
    const part = reportPart(s.title);
    return advisorForNode(matchBlueprintNode(s.title)?.id ?? (part === 'body' ? null : part))?.id ?? null;
  };
  const exhibitOwner = exhibitAdvisor().id;

  const main = content.report.filter(s => reportPart(s.title) !== 'appendix');
  const appendix = content.report.filter(s => reportPart(s.title) === 'appendix');

  // The contents lists Heading 1–3, as Word's field does; the two lists take the table and figure captions. In the
  // appendix document each appendix is a Heading 1, and lines inside it are not headings.
  type Listing = { headings: { anchor: string; title: string; level: number; sectionId: string }[]; tables: { anchor: string; title: string; blockId: string }[]; figures: { anchor: string; title: string; blockId: string }[] };
  const listingOf = (sections: readonly ReportSection[]): Listing => {
    const list: Listing = { headings: [], tables: [], figures: [] };
    for (const s of sections) {
      const part = reportPart(s.title);
      if (part === 'body' || part === 'appendix') {
        const level = reportHeadingLevel(s.title) || 1;
        if (level <= 3) list.headings.push({ anchor: `h:${s.id}`, title: s.title || '未命名章节', level, sectionId: s.id });
      }
      if (part === 'body') (s.body ? s.body.split('\n') : []).forEach((line, i) => {
        const inner = line.length <= 100 ? reportHeadingLevel(line) : null;
        if (inner && inner <= 3) list.headings.push({ anchor: `h:${s.id}:${i}`, title: line.trim(), level: inner, sectionId: s.id });
      });
      for (const b of s.blocks ?? []) {
        if (b.kind !== 'chart' && b.kind !== 'table') continue;
        let title = b.text;
        if (!title) try { title = resultFor(content.quality, b.evidenceId).title; } catch { title = s.title; }
        const entry = { anchor: `x:${b.id}`, title: numberedCaption(blockLabel(labels, s.id, b.id), title), blockId: b.id };
        (b.kind === 'chart' ? list.figures : list.tables).push(entry);
      }
    }
    return list;
  };

  const entry = (key: string, level: number, title: string, anchor: string, act: { sectionId?: string; blockId?: string }): Item => ({
    key, kind: 'entry', style: 'front',
    render: ({ onPage, folioOf, catalog }) => (
      <p
        className={css.entry}
        style={{ '--level': level } as CSSProperties}
        data-directory-node={onPage && act.blockId ? `xref:${act.blockId}` : undefined}
        data-linked={onPage && act.blockId && catalog.activeKey === `xref:${act.blockId}` ? 'true' : undefined}
        onMouseEnter={onPage && act.blockId ? () => catalog.onHover?.('xref', act.blockId!) : undefined}
        onClick={onPage ? () => (act.blockId ? catalog.onClick?.('xref', act.blockId) : act.sectionId && catalog.onPick?.(act.sectionId)) : undefined}
      >
        <span className={css.entryText}>{autospace(title)}</span>
        <span className={css.entryPage}>{folioOf(anchor)}</span>
      </p>
    ),
  });
  let tocDone = false;
  // Word closes each list with the paragraph that holds the end of its field: an empty line of the body text.
  const fieldEnd = (key: string): Item => ({ key, kind: 'para', style: 'front', render: () => <p className={`${css.flush} ${css.blank}`} /> });
  const toc = ({ headings, tables, figures }: Listing, prefix = '') => {
    if (!options.includeToc) return;
    items.push({ key: `${prefix}toc`, kind: 'special', style: 'front', breakBefore: true, keepNext: true, render: () => <p className={css.special}>目录</p> });
    for (const h of headings) items.push(entry(`${prefix}toc:${h.anchor}`, h.level, h.title, h.anchor, { sectionId: h.sectionId }));
    items.push(fieldEnd(`${prefix}toc:end`));
    if (tables.length) {
      items.push({ key: `${prefix}lot`, kind: 'special', style: 'front', breakBefore: true, hardBreak: true, keepNext: true, render: () => <p className={css.special}>表目录</p> });
      for (const t of tables) items.push(entry(`${prefix}lot:${t.anchor}`, 1, t.title, t.anchor, { blockId: t.blockId }));
      items.push(fieldEnd(`${prefix}lot:end`));
    }
    if (figures.length) {
      // The list of figures starts a page of its own, as the contents and the list of tables do.
      items.push({ key: `${prefix}lof`, kind: 'special', style: 'front', breakBefore: true, hardBreak: true, keepNext: true, render: () => <p className={css.special}>图目录</p> });
      for (const f of figures) items.push(entry(`${prefix}lof:${f.anchor}`, 1, f.title, f.anchor, { blockId: f.blockId }));
      items.push(fieldEnd(`${prefix}lof:end`));
    }
  };
  const mainListing = listingOf(main);
  const mainToc = () => { if (!tocDone) { tocDone = true; toc(mainListing); } };

  const sectionFlow = (s: ReportSection, style: PageStyle): Item[] => {
    const out: Item[] = [];
    const part = reportPart(s.title);
    const owner = ownerOf(s);
    const base = { sectionId: s.id, advisor: owner, style };
    const typing = live.typing?.sectionId === s.id ? live.typing : null;
    const body = typing ? typing.visibleBody : s.body;
    const special = part === 'abstract' || part === 'references';
    const level = special ? 0 : reportHeadingLevel(s.title) || 1;
    const chapter = part === 'body' && level === 1 && !s.body.trim() && !s.blocks?.length;
    out.push({
      ...base, key: `h:${s.id}`, anchor: `h:${s.id}`, kind: special ? 'special' : 'heading', keepNext: true,
      pending: !chapter && !typing && !written(s) && !/写作提示】/u.test(s.body) && !(part === 'references' && cited.order.length),
      render: ({ onPage }) => <p className={special ? css.special : css[`h${Math.min(level, 3)}`]} data-report-section={onPage ? s.id : undefined}>{s.title || '未命名章节'}</p>,
    });
    if (part === 'appendix' && !s.blocks?.length && GENERATED_APPENDIX.test(s.id)) {
      const records = s.body.split('\n\n');
      records.forEach((record, r) => out.push({
        ...base, key: `g:${s.id}:${r}`, kind: 'para', split: 'lines',
        render: () => <p className={css.flush}>{record.split('\n').map((line, i) => <Fragment key={i}>{i ? <br /> : null}{rich(line)}</Fragment>)}{r === records.length - 1 && s.source ? <><br />来源 / 说明：{autospace(s.source)}</> : null}</p>,
      }));
      return out;
    }
    const lines = body ? body.split('\n') : [];
    const lastWritten = lines.findLastIndex(l => l.trim().length > 0);
    let hint = false;
    lines.forEach((line, i) => {
      if (/写作提示】/u.test(line)) hint = true;
      else if (hint && !line.trim()) hint = false;
      const inHint = hint;
      const caret = (onPage: boolean) => onPage && typing && i === lastWritten ? <span data-typing-caret="true" className={css.caret} aria-hidden="true" /> : null;
      const inner = part === 'body' && line.length <= 100 ? reportHeadingLevel(line) : null;
      if (inner) {
        out.push({ ...base, key: `h:${s.id}:${i}`, anchor: `h:${s.id}:${i}`, kind: 'heading', keepNext: true, render: ({ onPage }) => <p className={css[`h${Math.min(inner, 3)}`]}>{line}{caret(onPage)}</p> });
        return;
      }
      const keywords = part === 'abstract' ? /^(关键词[:：])\s*/u.exec(line) : null;
      out.push({
        ...base, key: `p:${s.id}:${i}`, kind: 'para', split: 'lines',
        render: ({ onPage }) => (
          <p className={`${part === 'references' ? css.flush : css.para} ${inHint ? css.hint : ''} ${line.trim() ? '' : css.blank}`} data-hint={inHint || undefined}>
            {keywords ? <><b className={css.keywords}>{keywords[1]}</b>{rich(line.slice(keywords[0].length))}</> : line.trim() ? rich(line) : null}
            {caret(onPage)}
          </p>
        ),
      });
    });
    if (part === 'references') cited.order.forEach((ref, n) => out.push({
      ...base, key: `r:${s.id}:${ref.id}`, kind: 'ref', split: 'lines',
      render: ({ onPage }) => <p className={css.ref} data-cite-target={onPage ? String(citations.get(ref.id) ?? n + 1) : undefined}><span className={css.refNo}>[{n + 1}]</span>{unfinishedReference(ref) ? <em className={css.unfinished}>尚未填写题名</em> : autospace(formatReference(ref))}</p>,
    }));

    const blocks = s.blocks ?? [];
    const used: ResultSnapshot[] = [];
    blocks.forEach((block, index) => {
      const label = blockLabel(labels, s.id, block.id);
      if (block.kind === 'formula') {
        out.push({ ...base, key: `b:${block.id}`, kind: 'equation', render: ({ onPage }) => <div className={css.equation} data-xref-target={onPage ? block.id : undefined} data-xref-label={label?.reference ?? ''}><Formula tex={block.text || '\\text{（空公式）}'} number={label?.number} copyable={false} compact print /></div> });
        return;
      }
      if (isExhibitNote(blocks, index)) {
        out.push({ ...base, advisor: exhibitOwner, key: `n:${block.id}`, kind: 'small', render: () => <p className={css.small}>{rich(block.text)}</p> });
        return;
      }
      if (block.kind !== 'chart' && block.kind !== 'table') {
        out.push({ ...base, key: `b:${block.id}`, kind: 'para', split: 'lines', render: () => <p className={block.kind === 'citation' ? css.flush : css.para}>{rich(block.text)}</p> });
        return;
      }
      let result: ResultSnapshot, figure: ReportFigure | undefined;
      try {
        result = resultFor(content.quality, block.evidenceId);
        if (block.figureId) figure = figureFor(content, block.figureId, block.evidenceId);
      } catch (error) {
        out.push({ ...base, key: `e:${block.id}`, kind: 'para', render: () => <p className={`${css.flush} ${css.error}`}>{(error as Error).message}</p> });
        return;
      }
      if (!used.includes(result)) used.push(result);
      // No source line under a figure or table: where the data came from is told once, in the text and the appendix.
      const noted = isExhibitNote(blocks, index + 1);
      const caption = numberedCaption(label, block.text || result.title);
      const exhibit = { ...base, advisor: exhibitOwner };
      const target = (onPage: boolean) => (onPage ? { 'data-xref-target': block.id, 'data-xref-label': label?.reference ?? '', 'data-xref-caption': caption } : {});
      if (block.kind === 'chart') {
        out.push({ ...exhibit, key: `f:${block.id}`, kind: 'figure', keepNext: true, render: ({ onPage }) => <div className={css.figure} {...target(onPage)}><Figure result={result} column={block.valueColumn} accent={ACCENT[content.accent]} figure={figure} visualStyle={content.visualStyle} /></div> });
        out.push({ ...exhibit, key: `c:${block.id}`, anchor: `x:${block.id}`, kind: 'caption', keepNext: noted || !!figure?.note, render: () => <p className={css.caption}>{rich(caption)}</p> });
        if (figure?.note) out.push({ ...exhibit, key: `fn:${block.id}`, kind: 'small', keepNext: noted, render: () => <p className={css.small}>{autospace(figure!.note!)}</p> });
      } else {
        const rows = (figure ? figure.table.rows.length : result.rows.length) + 1;
        out.push({ ...exhibit, key: `c:${block.id}`, anchor: `x:${block.id}`, kind: 'caption', keepNext: true, before: 12, after: 3, render: () => <p className={css.tableCaption}>{rich(caption)}</p> });
        out.push({ ...exhibit, key: `t:${block.id}`, kind: 'table', keepNext: rows <= 16 && (noted || !!figure?.note), split: rows > 16 ? 'rows' : undefined, render: ({ onPage }) => <div className={css.table} {...target(onPage)}><ResultTable result={result} figure={figure} wordColumns noteApart /></div> });
        if (figure?.note) out.push({ ...exhibit, key: `tn:${block.id}`, kind: 'small', keepNext: noted, render: () => <p className={css.small}>{autospace(figure!.note!)}</p> });
      }
    });
    const notes = sectionNotes(used);
    if (notes) out.push({ ...base, advisor: exhibitOwner, key: `sn:${s.id}`, kind: 'note', render: () => <p className={css.note}>{autospace(notes)}</p> });
    if (s.source) out.push({ ...base, key: `src:${s.id}`, kind: 'small', render: () => <p className={css.small}>来源 / 说明：{autospace(s.source)}</p> });
    if (live.review?.sectionId === s.id) {
      const review = live.review;
      out.push({
        ...base, key: `rv:${s.id}`, kind: 'review',
        render: ({ onPage }) => (
          <div className={css.review} data-step={review.step} role={onPage ? 'status' : undefined} aria-live={onPage ? 'polite' : undefined}>
            <b>{review.step === 'flag' ? '审阅批注' : review.step === 'rewrite' ? '正在修订' : '修订完成'}</b>
            <span>{review.reason}</span>
            <p><del>{review.badPhrase}</del>{review.step !== 'flag' && <> → <ins>{review.step === 'done' ? review.goodPhrase : review.typedGood}</ins></>}{onPage && review.step !== 'done' && <span data-typing-caret="true" className={css.caret} aria-hidden="true" />}</p>
          </div>
        ),
      });
    }
    return out;
  };

  const cover = (): Item => ({
    key: 'cover', kind: 'cover', style: 'cover', breakBefore: true,
    // A cover image is the whole page (drawn by the page itself, edge to edge); the flow then holds nothing.
    render: () => content.coverImage ? <div /> : <div className={css.cover}><p className={css.coverTitle}>{autospace(content.title || '未命名研究')}</p>{content.subtitle && <p className={css.coverSubtitle}>{autospace(content.subtitle)}</p>}</div>,
  });
  if (options.includeCover) items.push(cover());
  let bodyStarted = false;
  for (const s of main) {
    const part = reportPart(s.title), preliminary = part === 'abstract' && !bodyStarted;
    if (!preliminary) mainToc();
    const style: PageStyle = preliminary ? 'front' : 'body';
    const breakBefore = preliminary || !(part === 'body' && bodyStarted);
    const flow = sectionFlow(s, style);
    if (!options.includeCover && !items.length) flow.unshift({ key: 'title', kind: 'title', style, sectionId: s.id, render: () => <p className={css.title}>{autospace(content.title || '未命名研究')}</p> });
    flow[0].breakBefore = breakBefore;
    items.push(...flow);
    if (!preliminary) bodyStarted = true;
  }
  if (!bodyStarted) mainToc();
  // The appendix as Word exports it on its own: a cover, its contents, then each appendix on a new page from page 1.
  if (appendix.length) {
    const from = items.length;
    if (options.includeCover) items.push({ ...cover(), key: 'a:cover' });
    toc(listingOf(appendix), 'a:');
    for (const s of appendix) {
      const flow = sectionFlow(s, 'body');
      flow[0].breakBefore = true;
      items.push(...flow);
    }
    for (let k = from; k < items.length; k++) items[k] = { ...items[k], doc: 'appendix' };
  }
  return withGaps(items);
}

/** A measurement and the boxes it measured: pages always draw the boxes their breaks were found for. */
type Layout = { items: Item[]; tops: number[]; heights: number[]; pages: PageSlice[] };
const sameLayout = (a: Layout | null, b: Layout) => !!a && a.items === b.items && a.pages.length === b.pages.length && a.tops.length === b.tops.length
  && a.pages.every((p, i) => Math.abs(p.start - b.pages[i].start) < 0.5 && Math.abs(p.end - b.pages[i].end) < 0.5 && p.first === b.pages[i].first && p.last === b.pages[i].last)
  && a.tops.every((t, i) => Math.abs(t - b.tops[i]) < 0.5 && Math.abs(a.heights[i] - b.heights[i]) < 0.5);

/**
 * Where a paragraph's lines end, from its box's top: the midpoint between one line's ink and the next line's. Only the
 * visible text is read: a range over the box would also return the paragraph's own block rectangle, one "line" as tall
 * as the paragraph, and a paragraph read as one line could never end a page.
 */
function lineBreaks(el: HTMLElement): number[] {
  const box = el.getBoundingClientRect();
  const range = document.createRange();
  const rects: DOMRect[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    // A formula's hidden MathML copy (for screen readers) is laid out in a math font whose line box spans several
    // lines of text; read as text it would merge those lines into one.
    if (node.parentElement?.closest('.katex-mathml, math')) continue;
    range.selectNodeContents(node);
    rects.push(...Array.from(range.getClientRects()));
  }
  const lines: { top: number; bottom: number }[] = [];
  for (const r of rects.filter(r => r.width > 0.5 && r.height > 0.5).sort((a, b) => a.top - b.top)) {
    const line = lines.find(l => r.top < l.bottom - 1 && r.bottom > l.top + 1);
    if (line) { line.top = Math.min(line.top, r.top); line.bottom = Math.max(line.bottom, r.bottom); }
    else lines.push({ top: r.top, bottom: r.bottom });
  }
  lines.sort((a, b) => a.top - b.top);
  return lineSplits(lines.map((l, k) => (k + 1 < lines.length ? (l.bottom + lines[k + 1].top) / 2 : box.bottom) - box.top));
}
/**
 * What a paragraph's line spacing adds below its last line's text, which Word lets hang past the page's last line. An
 * empty paragraph's line is the Latin font's (1.15 em), a line with Chinese text 1.296 em.
 */
function lineTail(el: HTMLElement): number {
  const p = el.firstElementChild;
  if (!(p instanceof HTMLParagraphElement)) return 0;
  const style = getComputedStyle(p), line = parseFloat(style.lineHeight), size = parseFloat(style.fontSize);
  const single = p.textContent?.trim() ? WORD_SINGLE : WORD_LATIN_SINGLE;
  return Number.isFinite(line) && Number.isFinite(size) ? Math.max(0, line - size * single) : 0;
}
/** Where a long table may end a page: after any body row but the last, the header staying with the first row. */
function rowBreaks(el: HTMLElement): number[] {
  const top = el.getBoundingClientRect().top;
  const rows = Array.from(el.querySelectorAll('tbody tr')).map(tr => tr.getBoundingClientRect().bottom - top);
  return rows.slice(0, -1);
}

const ZOOMS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5];
const subscribeNever = () => () => undefined;
/** The space between two pages on screen, in CSS pixels at full size. */
const PAGE_GAP = 18;

/**
 * The report on A4 pages in the competition layout, page-numbered as the Word export prints them. The pages scale to
 * the space they have; their content does not change with the scale. Advisors' shares are marked in the margin, on
 * screen only, and can be hidden to see the bare page.
 */
export default function PaperPages({
  content, label, docFormat, activeSectionId = null, writingActive = false, typingState = null, reviewState = null,
  formatScanSectionId = null, activeCatalogKey = null, onPick, onCatalogHover, onCatalogClick,
  workState = null,
}: {
  content: EditorContent;
  label: string;
  docFormat: 'latex' | 'word';
  activeSectionId?: string | null;
  writingActive?: boolean;
  workState?: ReportWorkState | null;
  typingState?: LiveTypingState | null;
  reviewState?: LiveReviewState | null;
  formatScanSectionId?: string | null;
  activeCatalogKey?: string | null;
  onPick?: (sectionId: string) => void;
  onCatalogHover?: (attr: 'xref' | 'cite', id: string) => void;
  onCatalogClick?: (attr: 'xref' | 'cite', id: string) => void;
}) {
  const items = useMemo(() => buildFlow(content, { typing: typingState, review: reviewState, writingActive }), [content, typingState, reviewState, writingActive]);
  const indent = (content.reportFormat?.options ?? DEFAULT_REPORT_OPTIONS).firstLineChars === 2 ? '24pt' : '0pt';

  // The measured copy lives outside the report container, so a lookup in the report never finds it.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [remeasure, setRemeasure] = useState(0);
  const indentKey = indent;
  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    const boxes = Array.from(root.children) as HTMLElement[];
    if (boxes.length !== items.length) return;
    const origin = root.getBoundingClientRect().top;
    const tops: number[] = [], heights: number[] = [];
    for (const el of boxes) { const r = el.getBoundingClientRect(); tops.push(r.top - origin); heights.push(r.height); }
    const flow: FlowBox[] = items.map((item, k) => ({
      top: tops[k], height: heights[k], breakBefore: !!item.breakBefore, keepNext: !!item.keepNext, hardBreak: !!item.hardBreak,
      lead: (item.gap ?? 0) * (96 / 72), tail: lineTail(boxes[k]),
      splits: item.split ? () => (item.split === 'rows' ? rowBreaks(boxes[k]) : lineBreaks(boxes[k])) : undefined,
    }));
    const next = { items, tops, heights, pages: paginate(flow, PAGE.contentHeight) };
    setLayout(prev => (sameLayout(prev, next) ? prev : next));
  }, [items, remeasure, indentKey, mounted]);
  // Figures arrive after their first paint and fonts can load late: either changes the flow's height, so measure again.
  useEffect(() => {
    const root = measureRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setRemeasure(n => n + 1));
    observer.observe(root);
    document.fonts?.ready.then(() => setRemeasure(n => n + 1)).catch(() => undefined);
    return () => observer.disconnect();
  }, [mounted]);

  // Page numbers: none on the cover, Roman in the front matter, Arabic from the body's first page; the appendix restarts.
  const shown = layout?.items ?? [];
  const folios = useMemo(() => {
    if (!layout) return [];
    const counts = new Map<string, number>();
    return layout.pages.map(p => {
      const item = layout.items[p.first], style = item?.style ?? 'body', key = `${item?.doc ?? 'main'}:${style}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return folio(style, counts.get(key)!);
    });
  }, [layout]);
  const anchorPages = useMemo(() => {
    const map = new Map<string, string>();
    if (layout) layout.items.forEach((item, k) => {
      if (!item.anchor) return;
      // The first page that ends below the box's top holds its first line. (A page that opens with the box after a
      // break starts below the box's top, where its dropped space before would have been.)
      const at = layout.pages.findIndex(p => layout.tops[k] < p.end - 0.5);
      if (at >= 0) map.set(item.anchor, folios[at]);
    });
    return map;
  }, [layout, folios]);
  const pageCtx: RenderCtx = {
    onPage: true,
    folioOf: anchor => anchorPages.get(anchor) ?? '',
    catalog: { activeKey: activeCatalogKey, onHover: onCatalogHover, onClick: onCatalogClick, onPick },
  };

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const [zoomChoice, setZoomChoice] = useState<'fit' | number>('fit');
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const el = viewerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setFit(Math.max(0.35, Math.min(1.5, (entry.contentRect.width - 16) / PAGE.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const zoom = zoomChoice === 'fit' ? fit : zoomChoice;
  // The apparatus is a sibling of the measured flow. It can only occupy verified
  // empty space below all page content; narrow/full pages use a separate dock.
  const workPlacement = useMemo(() => {
    if (!workState || !layout || zoom < 0.72 || !activeSectionId) return null;
    const item = layout.items.findIndex(item => item.sectionId === activeSectionId);
    const page = item < 0 ? -1 : layout.pages.findIndex(page => layout.tops[item] < page.end - 0.5);
    return page < 0 ? null : reportWorkPlacement(layout.pages, layout.tops, layout.heights,
      layout.items.map(item => item.style), PAGE.contentHeight, 260, page);
  }, [workState, layout, zoom, activeSectionId]);
  const step = (by: 1 | -1) => {
    const now = zoom, list = by > 0 ? ZOOMS.filter(z => z > now + 0.001) : ZOOMS.filter(z => z < now - 0.001).reverse();
    if (list.length) setZoomChoice(list[0]);
  };

  const [marks, setMarks] = useState(true);
  const [focus, setFocus] = useState<string | null>(null);
  const writingSection = typingState?.sectionId ?? (writingActive ? activeSectionId : null);
  const writingAdvisor = writingSection ? items.find(i => i.sectionId === writingSection && i.kind !== 'figure' && i.kind !== 'table' && i.kind !== 'caption')?.advisor ?? null : null;
  const shares = useMemo(() => {
    const count = new Map<string, Set<string>>();
    for (const item of items) if (item.advisor && item.sectionId) {
      const key = item.kind === 'figure' || item.kind === 'table' ? `${item.key}` : item.sectionId;
      count.set(item.advisor, (count.get(item.advisor) ?? new Set()).add(key));
    }
    return count;
  }, [items]);

  const coverSrc = useMemo(() => (content.coverImage ? pageArtDataUrl(content.coverImage) : ''), [content.coverImage]);
  const frameSrc = useMemo(() => (content.frameImage ? pageArtDataUrl(content.frameImage) : ''), [content.frameImage]);
  const framed = Math.max(1, layout?.pages.length ?? 1) * (PAGE.height + PAGE_GAP) - PAGE_GAP;
  const mainPages = layout ? layout.pages.filter(p => shown[p.first]?.doc !== 'appendix').length : 0;
  const appendixPages = layout ? layout.pages.length - mainPages : 0;
  const over = mainPages > MAIN_PAGE_LIMIT;

  const boxClass = (item: Item) => `${css.box} ${item.sectionId && item.sectionId === activeSectionId ? css.active : ''} ${item.sectionId && item.sectionId === formatScanSectionId ? css.scan : ''}`;
  // The contents are measured with the page numbers they will print: a number one digit wider can wrap a line. The
  // numbers come from the body's pages, which the contents' own length never moves, so a second pass settles them.
  const measureCtx = useMemo<RenderCtx>(() => ({ ...MEASURE, folioOf: anchor => anchorPages.get(anchor) || '00' }), [anchorPages]);
  const measurer = mounted ? createPortal(
    <div ref={measureRef} className={`${css.flow} ${css.measure}`} style={{ '--indent': indent } as CSSProperties} aria-hidden="true">
      {items.map(item => <div key={item.key} className={css.box} style={item.gap ? { paddingTop: `${item.gap}pt` } : undefined}>{item.render(measureCtx)}</div>)}
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={viewerRef} className={css.viewer} data-doc-format={docFormat} role="document" aria-label={label}>
      <div className={css.dock} role="toolbar" aria-label="顾问插件与版面">
        {ADVISORS.map(a => {
          const n = shares.get(a.id)?.size ?? 0;
          return (
            <button
              key={a.id}
              type="button"
              className={css.plugin}
              style={{ '--tone': ADVISOR_TONES[a.id] } as CSSProperties}
              data-active={writingAdvisor === a.id || undefined}
              aria-pressed={focus === a.id}
              title={`${a.name} · 技能 ${a.skill}\n${a.line}`}
              onClick={() => setFocus(f => (f === a.id ? null : a.id))}
            >
              <i aria-hidden="true">{a.glyph}</i>
              <span>{a.name.replace(/顾问$/u, '')}</span>
              <small>{writingAdvisor === a.id ? '撰写中' : n ? `${n} 处` : '待命'}</small>
            </button>
          );
        })}
        <span className={css.dockGap} />
        <label className={css.markToggle}><input type="checkbox" checked={marks} onChange={e => setMarks(e.target.checked)} />分工标注</label>
      </div>

      {workState && !workPlacement && <aside className={css.workDock} data-screen-only="true" aria-label="报告生成状态">
        <ReportWorkstation state={workState} compact />
      </aside>}

      {/* Pages are laid out at their true size and only drawn smaller or larger: a transform never re-flows the text, so
          each page shows exactly what was measured; the frame takes the scaled size so the scroll extent is right. */}
      <div className={css.pagesFrame} style={{ width: PAGE.width * zoom, height: framed * zoom }}>
      <div className={css.pages} style={{ transform: `scale(${zoom})`, '--indent': indent } as CSSProperties} data-focus={focus ?? undefined}>
        {layout?.pages.map((p, index) => {
          const style = shown[p.first]?.style ?? 'body';
          const shift = p.start - layout.tops[p.first];
          const segments: { advisor: string; sectionId?: string; y0: number; y1: number; head: boolean; pending: boolean }[] = [];
          if (marks) for (let k = p.first; k <= p.last; k++) {
            const item = shown[k];
            if (!item?.advisor) continue;
            const y0 = Math.max(layout.tops[k], p.start) - p.start, y1 = Math.min(layout.tops[k] + layout.heights[k], p.end) - p.start;
            if (y1 - y0 < 1) continue;
            const prev = segments[segments.length - 1];
            if (prev && prev.advisor === item.advisor && prev.sectionId === item.sectionId && y0 - prev.y1 < 30) prev.y1 = y1;
            else segments.push({ advisor: item.advisor, sectionId: item.sectionId, y0, y1, pending: !!item.pending, head: item.kind === 'heading' || item.kind === 'special' || item.kind === 'figure' || (item.kind === 'caption' && !segments.some(s => s.sectionId === item.sectionId && s.advisor === item.advisor)) });
          }
          return (
            <article key={index} className={css.page} data-page-style={style} aria-label={folios[index] ? `第 ${folios[index]} 页` : '封面'}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the draft's own data URL; an image optimizer cannot serve it. */}
              {style === 'cover' && coverSrc && <img className={css.pageArt} src={coverSrc} alt={content.subtitle ? `封面：${content.title}——${content.subtitle}` : `封面：${content.title}`} draggable={false} />}
              {/* eslint-disable-next-line @next/next/no-img-element -- the draft's own data URL; an image optimizer cannot serve it. */}
              {style !== 'cover' && frameSrc && <img className={css.pageArt} src={frameSrc} alt="" aria-hidden="true" draggable={false} />}
              {workState && workPlacement?.page === index && <aside
                className={css.workOverlay} data-screen-only="true" aria-label="报告生成状态"
                style={{ top: `calc(${PAGE.topMm}mm + ${workPlacement.top}px)` }}>
                <ReportWorkstation state={workState} compact />
              </aside>}
              <div className={`${css.flow} ${css.body}`} style={{ height: p.end - p.start }}>
                <div className={css.slice} style={{ transform: `translateY(${-shift}px)` }}>
                  {shown.slice(p.first, p.last + 1).map(item => (
                    <div
                      key={item.key}
                      className={boxClass(item)}
                      style={item.gap ? { paddingTop: `${item.gap}pt` } : undefined}
                      data-advisor={item.advisor ?? undefined}
                      data-dim={focus && item.advisor !== focus ? 'true' : undefined}
                      onClick={onPick && item.sectionId && item.kind !== 'entry' ? () => onPick(item.sectionId!) : undefined}
                    >
                      {item.render(pageCtx)}
                    </div>
                  ))}
                </div>
              </div>
              {segments.map((seg, i) => {
                const advisor = ADVISORS.find(a => a.id === seg.advisor)!;
                const live = writingSection === seg.sectionId && seg.advisor === writingAdvisor;
                return (
                  <div key={i} className={css.mark} style={{ '--tone': ADVISOR_TONES[seg.advisor], top: `calc(${PAGE.topMm}mm + ${seg.y0}px)`, height: seg.y1 - seg.y0 } as CSSProperties} data-live={live || undefined} data-dim={focus && focus !== seg.advisor ? 'true' : undefined} aria-hidden="true">
                    {seg.head && <span className={css.markTag} data-pending={seg.pending || undefined}><i>{advisor.glyph}</i>{live ? '撰写中' : seg.pending ? (writingActive ? '排队撰写' : '待撰写') : advisor.name.replace(/顾问$/u, '')}</span>}
                  </div>
                );
              })}
              {folios[index] && <div className={css.folio}>{folios[index]}</div>}
            </article>
          );
        })}
        {!layout && <article className={css.page} aria-busy="true" />}
      </div>
      </div>

      <div className={css.status} data-over={over || undefined}>
        <span>{docFormat === 'word' ? 'Word 版式' : 'LaTeX 版式'} · A4 · 正文 {mainPages} 页{over ? `，超出 ${MAIN_PAGE_LIMIT} 页上限` : ` / ${MAIN_PAGE_LIMIT}`}{appendixPages ? ` · 附录 ${appendixPages} 页` : ''}</span>
        <span className={css.zoom}>
          <button type="button" onClick={() => step(-1)} aria-label="缩小">−</button>
          <button type="button" onClick={() => setZoomChoice('fit')} aria-pressed={zoomChoice === 'fit'} title="适合宽度">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => step(1)} aria-label="放大">+</button>
        </span>
      </div>
      {measurer}
    </div>
  );
}
