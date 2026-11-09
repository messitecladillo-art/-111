import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoPack } from '../lib/agent/demo-study.ts';
import { generateLatexBody, latexCompileInput, buildLatexSource, latexChartExhibits, latexFigureReferences, latexColumns, LATEX_IMAGE_PREAMBLE } from '../lib/latex-report.ts';
import { latexImages, latexCompilePayload, latexSourceFiles } from '../lib/latex-images.ts';

// A stand-in rasterizer: a PNG header stating the asked size (the compiler reads only the header's size).
const u32 = n => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
const fakePng = async (svg, width) => ({ bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...u32(width), ...u32(Math.round(width * 0.6)), 8, 2, 0, 0, 0]), width, height: Math.round(width * 0.6) });

test('a table keeps centred columns while it fits, and wraps only its widest columns when it does not', () => {
  assert.equal(latexColumns([['变量', 'n'], ['甲', '3']], false), 'cc');
  const wide = latexColumns([['评价维度', '堂食和送餐都用过', '知道但还没用过', '只在助餐点堂食', '只用过送餐上门', 'H', 'p（Holm）', 'ε²'], ['助餐与健康服务联动的支持度', '4.01', '3.59', '3.76', '3.84', '12.21', '0.020', '0.022']], true);
  assert.match(wide, /C\{\d+mm\}/u);
  assert.match(wide, /c$/u, 'a short numeric column stays centred');
});

test('no report figure carries a degenerate transform, which makes Word drop the whole picture', async () => {
  const { figureSVG } = await import('../lib/report-figures.ts');
  const pack = await buildDemoPack('城市社区助餐服务的使用体验、满意度与持续使用意愿调查');
  const charts = pack.report.report.flatMap(s => s.blocks ?? []).filter(b => b.kind === 'chart');
  assert.ok(charts.length >= 10);
  for (const block of charts) {
    const r = pack.report.quality.results.find(x => x.id === block.evidenceId);
    const svg = await figureSVG(r, block.valueColumn, { schema: 'FigurePalette/v1', primary: '#293652', secondary: '#C39045', opposite: '#A65A3A', source: 'cover' });
    assert.doesNotMatch(svg, /matrix\(0,0,0,0[,)]|scale\(0[ ,)]/u, `${r.title}: a zero-size transform`);
  }
});

test('every chart is embedded as the product rendering; inline formulas are typeset', async () => {
  const pack = await buildDemoPack('城市社区助餐服务的使用体验、满意度与持续使用意愿调查');
  const content = { ...pack.report, latex: undefined };
  const body = generateLatexBody(content);
  assert.doesNotMatch(body, /在 Word 导出中绘制/u, 'no placeholder for a method figure');
  const refs = latexFigureReferences(body, 'ResearchImage'), exhibits = latexChartExhibits(content);
  const charts = content.report.flatMap(s => s.blocks ?? []).filter(b => b.kind === 'chart' && !b.figureId).length;
  assert.equal(refs.length, charts, 'every chart is the product rendering, embedded as an image');
  assert.ok(refs.every(r => r.index < exhibits.length));
  assert.doesNotMatch(body, /\\begin\{axis\}/u, 'no separately drawn pgfplots chart that could differ from Word');
  assert.match(body, /\\\(\\chi\^2\(\d+\)=[\d.]+\\\)/u, 'a χ² in the text is math, not escaped dollars');
  assert.doesNotMatch(body, /\\\$\\(chi|alpha|mathrm)/u);

  const input = latexCompileInput({ ...content, latex: { version: 1, body, reportHash: '0'.repeat(64) } });
  assert.equal(input.figureImages.length, refs.length ? new Set(refs.map(r => r.index)).size : 0);
  const preview = buildLatexSource(input);
  for (const line of LATEX_IMAGE_PREAMBLE) assert.ok(preview.includes(line));
  const images = await latexImages(content, input, fakePng);
  assert.equal(images.length, input.figureImages.length);
  const payload = latexCompilePayload(input, images);
  assert.equal('figureImages' in payload, false, 'the ids stay behind; the server receives images');
  assert.equal(buildLatexSource(payload), preview, 'the same source with the ids or with their images');
  assert.deepEqual(latexSourceFiles(input, images).map(f => f.name), images.map((_, k) => `exhibit-${k}.png`));
  assert.throws(() => latexCompilePayload(input, images.slice(1)));
});
