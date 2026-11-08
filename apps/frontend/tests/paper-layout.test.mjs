import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE, folio, lineAt, lineSplits, paginate } from '../lib/paper-layout.ts';

// Boxes laid one after another, as the measured flow gives them.
const flow = specs => {
  let top = 0;
  return specs.map(spec => { const box = { top, height: spec.h, breakBefore: !!spec.br, keepNext: !!spec.keep, hardBreak: !!spec.hard, lead: spec.lead ?? 0, splits: spec.splits }; top += spec.h; return box; });
};

test('the page is the sourced A4 layout and the type metrics are the ones Word renders', () => {
  assert.equal(PAGE.widthMm, 210); assert.equal(PAGE.heightMm, 297);
  assert.deepEqual([PAGE.topMm, PAGE.bottomMm, PAGE.leftMm, PAGE.rightMm], [25.4, 25.4, 31.8, 31.8]);
  assert.ok(Math.abs(PAGE.contentWidth - 146.4 * 96 / 25.4) < 1e-9);
  // Word sets 12 pt 宋体 at 1.25 lines on a 19.44 pt pitch, 15 pt 黑体 on 24.3 pt and 14 pt on 22.68 pt.
  assert.equal(lineAt(12), 19.44); assert.equal(lineAt(15), 24.3); assert.equal(lineAt(14), 22.68);
});

test('boxes fill a page until one does not fit; a forced break always opens a new page', () => {
  const pages = paginate(flow([{ h: 40 }, { h: 40 }, { h: 40 }, { h: 30, br: true }, { h: 10 }]), 100);
  assert.deepEqual(pages.map(p => [p.first, p.last]), [[0, 1], [2, 2], [3, 4]]);
  assert.equal(pages[0].end, 80, 'the page ends before the box that does not fit');
});

test('a heading or caption moves on with the box it keeps with, unless that would empty the page', () => {
  // Body, heading, then a table taller than what is left: the heading goes with the table.
  const pages = paginate(flow([{ h: 60 }, { h: 20, keep: true }, { h: 50 }]), 100);
  assert.deepEqual(pages.map(p => [p.first, p.last]), [[0, 0], [1, 2]]);
  // A heading alone at the top of a page stays, rather than leaving the page empty.
  const lone = paginate(flow([{ h: 20, keep: true }, { h: 200 }]), 100);
  assert.equal(lone[0].first, 0); assert.ok(lone[0].last >= 0);
});

test('a paragraph breaks between lines, keeping two lines on each side as Word widow control does', () => {
  // Six lines of 10: breaks are allowed after lines 2, 3 and 4 only.
  const bottoms = [10, 20, 30, 40, 50, 60];
  assert.deepEqual(lineSplits(bottoms), [20, 30, 40]);
  assert.deepEqual(lineSplits([10, 20, 30]), [], 'a three-line paragraph moves whole');
  const pages = paginate(flow([{ h: 75 }, { h: 60, splits: () => lineSplits(bottoms) }]), 100);
  // 25 left after the first box: two lines (20) fit, so the paragraph breaks after its second line.
  assert.deepEqual(pages.map(p => [p.first, p.last, p.end]), [[0, 1, 95], [1, 1, 135]]);
  assert.equal(pages[1].start, 95, 'the next page starts where the lines continue');
});

test('space before a box is dropped at the top of a page after a natural or in-section break, kept after a new section', () => {
  // A box with 12 of space before opens page 2 after a natural break: the page starts after that space.
  const natural = paginate(flow([{ h: 90 }, { h: 30, lead: 12 }]), 100);
  assert.equal(natural[1].start, 90 + 12);
  // The same box opening a new section keeps its space.
  const section = paginate(flow([{ h: 90 }, { h: 30, lead: 12, br: true }]), 100);
  assert.equal(section[1].start, 90);
  // A page break inside a section (the list of figures after the contents) drops it.
  const inside = paginate(flow([{ h: 90 }, { h: 30, lead: 12, br: true, hard: true }]), 100);
  assert.equal(inside[1].start, 90 + 12);
});

test('a box taller than a page with no break point is cut across pages', () => {
  const pages = paginate(flow([{ h: 250 }]), 100);
  assert.deepEqual(pages.map(p => [p.start, p.end]), [[0, 100], [100, 200], [200, 250]]);
});

test('page numbers are empty on the cover, Roman in the front matter and Arabic in the body', () => {
  assert.equal(folio('cover', 1), '');
  assert.deepEqual([1, 2, 3, 4, 9, 14].map(n => folio('front', n)), ['I', 'II', 'III', 'IV', 'IX', 'XIV']);
  assert.equal(folio('body', 7), '7');
});
