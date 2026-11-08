import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { imageSize, parseCoverImage, parseFrameImage, coverImageTitlepage } from '../lib/page-art.ts';
import { applyCoverImage, applyFrameImage, applyReportFrame, createEditorContent, draftTextBytes, parseEditorContent } from '../lib/editor-model.ts';
import { buildLatexSource, latexCompileInput, latexCompileKey } from '../lib/latex-report.ts';
import { buildDocx } from '../lib/editor-export.ts';

const u32 = n => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
const png = (w, h) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...u32(w), ...u32(h), 8, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const jpeg = (w, h) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
const b64 = bytes => Buffer.from(bytes).toString('base64');
const frame = (changes = {}) => ({ schema: 'FrameImage/v1', mime: 'image/png', data: b64(png(1240, 1754)), widthPx: 1240, heightPx: 1754, note: '页框由报告页框技能生成。', ...changes });
const cover = (changes = {}) => ({ schema: 'CoverImage/v1', mime: 'image/png', data: b64(png(1000, 1414)), widthPx: 1000, heightPx: 1414, note: '封面由报告封面技能生成。', ...changes });

test('the size of a cover comes from its own file header', () => {
  assert.deepEqual(imageSize(png(1000, 1414), 'image/png'), { width: 1000, height: 1414 });
  assert.deepEqual(imageSize(jpeg(1240, 1754), 'image/jpeg'), { width: 1240, height: 1754 });
  assert.equal(imageSize(png(1000, 1414), 'image/jpeg'), null);
});

test('a cover must be an A4 portrait JPEG or PNG that states its own size', () => {
  assert.equal(parseCoverImage(cover()).widthPx, 1000);
  for (const bad of [cover({ widthPx: 1001 }), cover({ data: b64(png(1000, 1000)), heightPx: 1000 }), cover({ data: b64(png(700, 990)), widthPx: 700, heightPx: 990 }),
    cover({ mime: 'image/gif' }), cover({ data: 'not base64!' }), cover({ note: '' }), cover({ note: '换行\n' }), cover({ note: '长'.repeat(301) }), { ...cover(), extra: 1 }])
    assert.throws(() => parseCoverImage(bad));
});

test('a draft carries a cover only as version 3', () => {
  const content = applyCoverImage(createEditorContent(), parseCoverImage(cover()));
  assert.equal(content.version, 3);
  assert.equal(parseEditorContent(JSON.parse(JSON.stringify(content))).coverImage.widthPx, 1000);
  assert.throws(() => parseEditorContent({ ...createEditorContent(), coverImage: cover() }));
  assert.equal('coverImage' in applyCoverImage(content, undefined), false);
});

test('LaTeX prints the cover image as the whole title page, with no title set over it', () => {
  const content = applyCoverImage({ ...createEditorContent(), latex: { version: 1, body: '\\section{一}\n正文。\\par', reportHash: '0'.repeat(64) } }, parseCoverImage(cover()));
  const input = latexCompileInput(content), source = buildLatexSource(input);
  const page = source.slice(source.indexOf('\\begin{titlepage}'), source.indexOf('\\end{titlepage}') + '\\end{titlepage}'.length);
  assert.equal(page, coverImageTitlepage({ mime: 'image/png' }).join('\n'));
  assert.ok(source.includes('\\usepackage{tikz}'));
  assert.notEqual(latexCompileKey(input), latexCompileKey({ ...input, coverImage: undefined }));
  const plain = latexCompileInput({ ...content, reportFormat: { ...content.reportFormat, options: { ...(content.reportFormat?.options ?? {}), part: 'main', includeCover: false, includeToc: true, firstLineChars: 2, numberPages: true } } });
  assert.equal('coverImage' in plain, false);
});

test('Word puts the cover image behind an empty first page, edge to edge', async () => {
  const content = applyCoverImage(createEditorContent(), parseCoverImage(cover({ mime: 'image/jpeg', data: b64(jpeg(1240, 1754)), widthPx: 1240, heightPx: 1754 })));
  const zip = await JSZip.loadAsync(await (await buildDocx(content)).arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  // The cover section is one paragraph; its section break sits in that paragraph's properties.
  const first = xml.slice(0, xml.indexOf('</w:p>'));
  assert.match(first, /<w:sectPr>/u);
  assert.match(first, /<wp:anchor[^>]*behindDoc="1"/u);
  assert.match(first, /<wp:positionH relativeFrom="page"><wp:posOffset>0<\/wp:posOffset>/u);
  assert.doesNotMatch(first, /ReportCoverTitle|我的市场调查研究<\/w:t>/u, 'no title text on the cover page');
  assert.ok(Object.keys(zip.files).some(name => /^word\/media\/.+\.(jpe?g)$/u.test(name)), 'the image is embedded as JPEG');
});

test('a frame is a transparent PNG that replaces a drawn page frame', () => {
  assert.equal(parseFrameImage(frame()).widthPx, 1240);
  for (const bad of [frame({ mime: 'image/jpeg', data: b64(jpeg(1240, 1754)) }), cover(), frame({ data: b64(png(1000, 1000)), widthPx: 1000, heightPx: 1000 })]) assert.throws(() => parseFrameImage(bad));
  const framed = applyFrameImage(createEditorContent(), parseFrameImage(frame()));
  assert.equal(framed.version, 3);
  assert.throws(() => parseEditorContent({ ...framed, reportFrame: { schema: 'x' } }));
  assert.equal(applyFrameImage(framed, undefined).frameImage, undefined);
});

test('page art sits outside the 2 MB text cap', () => {
  const big = 'A'.repeat(1_200_000);
  const content = { ...createEditorContent(), version: 3, coverImage: { ...cover(), data: big } };
  assert.ok(draftTextBytes(content) < 10_000);
});

test('LaTeX lays the frame behind every page after the cover', () => {
  const content = applyFrameImage(applyCoverImage({ ...createEditorContent(), latex: { version: 1, body: '\\section{一}\n正文。\\par', reportHash: '0'.repeat(64) } }, parseCoverImage(cover())), parseFrameImage(frame()));
  const source = buildLatexSource(latexCompileInput(content));
  assert.ok(source.indexOf('\\ifReportFrameImage') < source.indexOf('\\begin{document}'));
  assert.ok(source.indexOf('\\end{titlepage}') < source.indexOf('\\ReportFrameImagetrue'));
  assert.equal(source.split('\\usepackage{tikz}').length - 1, 1);
});

test('Word holds the frame once, in the first header after the cover, behind the text', async () => {
  const content = applyFrameImage(createEditorContent(), parseFrameImage(frame()));
  const zip = await JSZip.loadAsync(await (await buildDocx(content)).arrayBuffer());
  const headers = Object.keys(zip.files).filter(name => /^word\/header\d+\.xml$/u.test(name));
  const withImage = [];
  for (const name of headers) if (/<wp:anchor[^>]*behindDoc="1"/u.test(await zip.file(name).async('string'))) withImage.push(name);
  assert.equal(withImage.length, 1);
  assert.equal(Object.keys(zip.files).filter(name => /^word\/media\/.+\.png$/u.test(name)).length, 1);
  const xml = await zip.file('word/document.xml').async('string');
  const sections = [...xml.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/gu)].map(m => m[0]);
  assert.doesNotMatch(sections[0], /headerReference/u, 'the cover carries no frame');
  assert.match(sections[1], /headerReference/u);
});