/**
 * The page the report is set on, and how its flow breaks into pages. The numbers are the sourced competition layout
 * (A4; top and bottom 25.4 mm, left and right 31.8 mm; 宋体 12 pt at 1.25 lines; half a line before each paragraph),
 * measured against Microsoft Word's own rendering of the product's .docx export, so the canvas breaks where Word does.
 */
export const MM = 96 / 25.4;
export const PT = 96 / 72;

export const PAGE = {
  widthMm: 210, heightMm: 297, topMm: 25.4, bottomMm: 25.4, leftMm: 31.8, rightMm: 31.8, footerMm: 12.7,
  get width() { return this.widthMm * MM; },
  get height() { return this.heightMm * MM; },
  get contentWidth() { return (this.widthMm - this.leftMm - this.rightMm) * MM; },
  get contentHeight() { return (this.heightMm - this.topMm - this.bottomMm) * MM; },
} as const;

/** Word sets one line of 宋体 with Times New Roman at 1.296 em; at the profile's 1.25 lines that is 19.44 pt for 12 pt text. */
export const WORD_SINGLE = 1.296;
/** An empty paragraph's line comes from the Latin font alone: Times New Roman's 1.15 em (17.25 pt at 12 pt, 1.25 lines). */
export const WORD_LATIN_SINGLE = 1.15;
export const lineAt = (sizePt: number, multiple = 1.25) => Number((sizePt * WORD_SINGLE * multiple).toFixed(3));
const AUTOSPACE = /(\p{Script=Han})(?=[A-Za-z0-9Ͱ-Ͽ])|([A-Za-z0-9Ͱ-Ͽ])(?=\p{Script=Han})/gu;
/**
 * Word's automatic space between Chinese and Latin letters or digits, on by default in a Chinese document: a quarter
 * em (measured: 3 pt in 12 pt text, 2.25 pt in 9 pt), the width of a Times New Roman space. It is set as a real space,
 * which behaves as Word's does at a line's edges: it hangs at the end of a line and never opens one. Punctuation,
 * superscripts and text that already has a space take none.
 */
export function autospace(text: string): string {
  return text.replace(AUTOSPACE, '$1$2 ');
}

/** The main text's page limit in the sourced profile: title, abstract, contents and body pages all count. */
export const MAIN_PAGE_LIMIT = 65;

export type FlowBox = {
  top: number;
  height: number;
  /** The box opens a new page, as a new Word section does. */
  breakBefore: boolean;
  /** The box stays on the page of the box after it (headings, a table's caption, a figure before its caption). */
  keepNext: boolean;
  /** Offsets from the box's top where a page may end inside it: line ends of a paragraph, row ends of a long table. */
  splits?: () => readonly number[];
  /** The space before the box's first line (its share of the gap above it), dropped when a page break puts it on top. */
  lead?: number;
  /** The break before the box is a page break inside a section, which also drops that space; a new section keeps it. */
  hardBreak?: boolean;
  /**
   * The part of the box's last line below its text: what a line spacing of more than one line adds. Word lets it hang
   * past the page's last line, so a line fits when its text does (measured: a page's last line ends up to 2.7 pt below
   * the margin when the spacing adds 3.9 pt).
   */
  tail?: number;
};
export type PageSlice = { start: number; end: number; first: number; last: number };

const EPS = 0.5;

/**
 * Breaks a measured flow into pages of the given height. A page ends at a forced break, before a box that does not fit,
 * or inside a box at one of its own break points; a box marked keep-with-next moves on with the box after it, unless
 * that would leave the page empty. A box taller than a page with no break point is cut at the page's end. As in Word,
 * the space before a box that opens a page after a natural or in-section break is dropped; a new section keeps it.
 */
export function paginate(boxes: readonly FlowBox[], pageHeight: number): PageSlice[] {
  const pages: PageSlice[] = [];
  const n = boxes.length;
  const bottom = (k: number) => boxes[k].top + boxes[k].height;
  const tail = (k: number) => Math.max(0, boxes[k].tail ?? 0);
  let i = 0, offset = 0, natural = false;
  for (let guard = 0; i < n && guard < 100000; guard++) {
    const lead = offset === 0 && (natural || (boxes[i].breakBefore && boxes[i].hardBreak)) ? Math.min(boxes[i].lead ?? 0, boxes[i].height) : 0;
    const start = boxes[i].top + offset + lead, limit = start + pageHeight;
    let j = i;
    while (j < n && (j === i || !boxes[j].breakBefore) && bottom(j) - tail(j) <= limit + EPS) j++;
    if (j >= n || (j > i && boxes[j].breakBefore)) {
      pages.push({ start, end: j >= n ? bottom(n - 1) : boxes[j].top, first: i, last: j - 1 });
      i = j; offset = 0; natural = false;
      continue;
    }
    const inside = (boxes[j].splits?.() ?? []).filter(c => boxes[j].top + c - tail(j) <= limit + EPS && (j > i || c > offset + EPS));
    if (inside.length) {
      const cut = Math.max(...inside);
      pages.push({ start, end: boxes[j].top + cut, first: i, last: j });
      i = j; offset = cut; natural = true;
      continue;
    }
    if (j === i) {
      pages.push({ start, end: limit, first: i, last: i });
      offset = limit - boxes[i].top;
      if (offset >= boxes[i].height - EPS) { i++; offset = 0; }
      natural = true;
      continue;
    }
    let k = j;
    while (k - 1 > i && boxes[k - 1].keepNext) k--;
    pages.push({ start, end: boxes[k].top, first: i, last: k - 1 });
    i = k; offset = 0; natural = true;
  }
  return pages;
}

/**
 * Where a paragraph may end a page: after any line but the first and the last, as Word's widow and orphan control
 * keeps at least two lines on each side. `lineBottoms` are the bottoms of its lines from its top, in order.
 */
export function lineSplits(lineBottoms: readonly number[]): number[] {
  const lines = lineBottoms.length;
  return lines < 4 ? [] : lineBottoms.slice(1, lines - 2);
}

/** Page numbers as Word prints them: none on the cover, Roman in the front matter, Arabic from the body's first page. */
export type PageStyle = 'cover' | 'front' | 'body' | 'appendix';
export function folio(style: PageStyle, index: number): string {
  if (style === 'cover') return '';
  if (style !== 'front') return String(index);
  const numerals: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let rest = index, out = '';
  for (const [value, mark] of numerals) while (rest >= value) { out += mark; rest -= value; }
  return out;
}
