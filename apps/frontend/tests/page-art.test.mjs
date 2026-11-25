import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  COVER_CANDIDATE_SPEC_POOL,
  DEFAULT_COVER_COMPETITION_NAME,
  DEFAULT_PREFERRED_COVER_CANDIDATE_ID,
  FRAME_CLEAR_ZONES_MM,
  FRAME_OUTER_BAND_SPEC,
  buildCoverTypographyPrompt,
  buildFramePerimeterPromptClause,
  coverImageTitlepage,
  deriveBlindSafeTeamName,
  imageSize,
  normalizeCoverTextSpec,
  parseCoverImage,
  parseFrameImage,
  retractFrameRgbaCrisply,
} from '../lib/page-art.ts';
import { applyCoverImage, applyFrameImage, createEditorContent, draftTextBytes, parseEditorContent } from '../lib/editor-model.ts';
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

test('cover typography spec enforces edition competition name, non-rigid calligraphy (horizontal/vertical), and blind-safe team name', () => {
  assert.equal(DEFAULT_COVER_COMPETITION_NAME, '“益普索杯”第十七届全国大学生市场调查与分析大赛');
  assert.equal(DEFAULT_PREFERRED_COVER_CANDIDATE_ID, 'cover-cand-f');
  assert.deepEqual(
    COVER_CANDIDATE_SPEC_POOL.map(item => item.id),
    ['cover-cand-f', 'cover-cand-a', 'cover-cand-b', 'cover-cand-c', 'cover-cand-d', 'cover-cand-e'],
  );

  const spec = normalizeCoverTextSpec({
    title: '银发「智」守：城市老年人智能健康监测设备采纳意愿与家庭代际数字反哺机制调查',
    subtitle: '基于多阶段分层抽样与社区实地入户调查的实证研究',
  });
  assert.equal(spec.competitionName, '“益普索杯”第十七届全国大学生市场调查与分析大赛');
  assert.equal(spec.mainTitle, '银发“智”守：城市老年人智能健康监测设备采纳意愿与家庭代际数字反哺机制调查');
  assert.doesNotMatch(spec.mainTitle, /[【】「」『』\[\]{}]/u);
  assert.equal(spec.teamName, '银发智守调研队');
  assert.equal(spec.teamLabel, '参赛团队：银发智守调研队');
  assert.equal(spec.titleLayout, 'horizontal');

  const asciiQuoted = normalizeCoverTextSpec({
    title: '银发"智"守：社区老年人调查',
    subtitle: '围绕"社区驿站"体验的分层调查',
  });
  assert.equal(asciiQuoted.mainTitle, '银发“智”守：社区老年人调查');
  assert.equal(asciiQuoted.subtitle, '围绕“社区驿站”体验的分层调查');
  assert.doesNotMatch(asciiQuoted.mainTitle + asciiQuoted.subtitle, /[【】「」『』\[\]{}"]/u);

  const autoCorrected = normalizeCoverTextSpec({
    title: '银发智守',
    competitionName: '“正大杯”第十七届全国大学生市场调查与分析大赛',
  });
  assert.equal(autoCorrected.competitionName, '“益普索杯”第十七届全国大学生市场调查与分析大赛');

  const promptH = buildCoverTypographyPrompt({ title: spec.mainTitle, subtitle: spec.subtitle, titleLayout: 'horizontal' });
  assert.match(promptH, /“益普索杯”第十七届全国大学生市场调查与分析大赛/u);
  assert.match(promptH, /横排或阶梯错落非板正艺术字/u);
  assert.match(promptH, /严禁使用死板机械的电脑印刷黑体或印刷宋体/u);
  assert.match(promptH, /参赛团队：银发智守调研队/u);
  assert.doesNotMatch(promptH, /市场调查与统计分析报告/u);

  const promptDark = buildCoverTypographyPrompt({
    title: spec.mainTitle,
    subtitle: spec.subtitle,
    inkMode: 'light_on_dark',
  });
  assert.match(promptDark, /亮暖金\/象牙白高反差字色/u);

  const promptV = buildCoverTypographyPrompt({
    title: spec.mainTitle,
    subtitle: spec.subtitle,
    teamName: '某某大学李华测试调研队',
    titleLayout: 'vertical',
  });
  assert.match(promptV, /竖排非板正艺术字/u);
  assert.doesNotMatch(promptV, /某某大学|测试/u);
  assert.equal(deriveBlindSafeTeamName('银发「智」守：健康监测调查'), '银发智守调研队');
  assert.throws(() => normalizeCoverTextSpec({ title: '题目', titleLayout: 'diagonal' }));
});

test('frame perimeter clause locks 4%-6% outer band and retractFrameRgbaCrisply avoids feather-blur bite', () => {
  assert.equal(FRAME_OUTER_BAND_SPEC.minRatio, 0.04);
  assert.equal(FRAME_OUTER_BAND_SPEC.maxRatio, 0.06);
  assert.equal(FRAME_OUTER_BAND_SPEC.minClearCoreRatio, 0.88);
  assert.equal(FRAME_OUTER_BAND_SPEC.allowFeatherBlurMask, false);

  const clause = buildFramePerimeterPromptClause({ topic: '银发智能健康监测', accentHex: '#0F766E' });
  assert.match(clause, /4%–6%/u);
  assert.match(clause, /88%×88%/u);
  assert.match(clause, /严禁任何边缘羽化虚化/u);
  assert.doesNotMatch(clause, /[【】「」『』\[\]{}]/u);

  const w = 210, h = 297;
  const clean = new Uint8Array(w * h * 4).fill(255);
  for (let y = 6; y < 12; y++) {
    for (let x = 6; x < 12; x++) {
      const i = (y * w + x) * 4;
      clean[i] = 15; clean[i + 1] = 118; clean[i + 2] = 110; clean[i + 3] = 255;
    }
  }
  const outClean = retractFrameRgbaCrisply(clean, w, h);
  for (let y = 6; y < 12; y++) {
    for (let x = 6; x < 12; x++) {
      assert.equal(outClean[(y * w + x) * 4 + 3], 255, 'crisp outer corner fretwork stays 100% opaque without feather blur');
    }
  }
  assert.equal(outClean[(150 * w + 105) * 4 + 3], 0);

  const intrude = new Uint8Array(w * h * 4).fill(255);
  for (let y = 10; y < 40; y++) {
    for (let x = 8; x < 36; x++) {
      const i = (y * w + x) * 4;
      intrude[i] = 35; intrude[i + 1] = 78; intrude[i + 2] = 128; intrude[i + 3] = 255;
    }
  }
  const outRetracted = retractFrameRgbaCrisply(intrude, w, h);
  for (const z of FRAME_CLEAR_ZONES_MM) {
    for (let y = Math.floor(z.y0); y < Math.ceil(z.y1); y++) {
      for (let x = Math.floor(z.x0); x < Math.ceil(z.x1); x++) {
        assert.equal(outRetracted[(y * w + x) * 4 + 3], 0);
      }
    }
  }
  for (let i = 3; i < outRetracted.length; i += 4) {
    assert.ok(outRetracted[i] === 0 || outRetracted[i] === 255, 'zero blurry semi-transparent feather pixels');
  }
});
