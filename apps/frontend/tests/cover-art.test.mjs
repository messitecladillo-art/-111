import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { COVER_TITLE_BAND, FLOWING_LINES, coverArtSvg, coverArtTex, parseCoverArt } from '../lib/cover-art.ts';
import { buildLatexSource, latexSha256 } from '../lib/latex-report.ts';
import { applyCoverArt, createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { buildDocx } from '../lib/editor-export.ts';

const options = { part: 'main', includeCover: true, includeToc: true, firstLineChars: 2, numberPages: true };

test('the built-in ornament parses, stays off the title band, and prints the same numbers in SVG and TeX', () => {
  const art = parseCoverArt(FLOWING_LINES);
  assert.ok(art.strokes.every(s => s.points.every(([, y]) => y <= COVER_TITLE_BAND.top || y >= COVER_TITLE_BAND.bottom)));
  const svg = coverArtSvg(art);
  assert.match(svg, /^<svg [^>]*viewBox="0 0 210 297">/u);
  assert.equal((svg.match(/<polyline /gu) ?? []).length, art.strokes.length);
  const tex = coverArtTex(art);
  assert.match(tex[0], /remember picture,overlay/u);
  assert.match(tex[1], /^\\draw\[line width=0\.6bp,.*\(155\.4,18\) -- \(194\.6,18\) -- \(194\.6,54\.7\);$/u);
});

test('an ornament that enters the title band, leaves the page or carries more than two decimals is refused', () => {
  const bad = points => ({ ...FLOWING_LINES, strokes: [{ color: '#2D6356', widthPt: 0.6, opacity: 1, points }] });
  assert.throws(() => parseCoverArt(bad([[10, 100], [20, 100]])), /标题区/u);
  assert.throws(() => parseCoverArt(bad([[10, 60], [20, 200]])), /标题区/u, 'a segment may not cross the band');
  assert.throws(() => parseCoverArt(bad([[10, 300], [20, 280]])));
  assert.throws(() => parseCoverArt(bad([[10.123, 20], [20, 20]])));
  assert.throws(() => parseCoverArt({ ...FLOWING_LINES, svg: '<svg/>' }));
});

test('the LaTeX title page draws the ornament exactly as the backend does', async () => {
  const input = { title: '社区助餐服务调查', subtitle: '教学模拟数据', body: '正文。', options, coverArt: parseCoverArt(FLOWING_LINES) };
  const source = buildLatexSource(input);
  // Frozen from multi_agent.agents.writing_agent.tools.latex.build_source on the same input (2026-11-08).
  assert.equal(await latexSha256(source), '1023a0f8fbe3b3648b07e148ad6dbffc0e63922606b7264610c1318e6f6e550d');
  assert.ok(source.includes('\\usepackage{tikz}'));
  assert.ok(source.indexOf('\\begin{tikzpicture}[remember picture') > source.indexOf('\\begin{titlepage}'));
  assert.ok(!buildLatexSource({ ...input, options: { ...options, includeCover: false } }).includes('tikzpicture'), 'no cover, no ornament');
});

test('a draft carries the ornament from version 3, and the Word cover holds it as a floating image behind the title', async () => {
  const content = createEditorContent();
  assert.throws(() => parseEditorContent({ ...content, coverArt: FLOWING_LINES }), /版本/u);
  const withArt = applyCoverArt(content, FLOWING_LINES);
  assert.equal(withArt.version, 3);
  assert.equal(applyCoverArt(withArt, undefined).coverArt, undefined);
  const zip = await JSZip.loadAsync(await (await buildDocx(withArt, options)).arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /<wp:anchor[^>]*behindDoc="1"/u);
  assert.ok(Object.keys(zip.files).some(name => /^word\/media\/.+\.svg$/u.test(name)));
  const plain = await JSZip.loadAsync(await (await buildDocx(content, options)).arrayBuffer());
  assert.doesNotMatch(await plain.file('word/document.xml').async('string'), /<wp:anchor/u);
});
