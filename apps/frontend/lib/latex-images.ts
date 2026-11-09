/**
 * The method figures a LaTeX body embeds (\ResearchImage{k}): each is the product's own rendering of the result's
 * figure — the same SVG the Word export embeds — rasterized to a PNG for XeLaTeX, which cannot read SVG. A clear PNG
 * at print size is a formal figure (research-chart-production); its numbers come from the registered result only.
 */
import type { EditorContent } from './editor-model.ts';
import { figureInk } from './figure-palette.ts';
import { LATEX_IMAGE_LIMITS, type LatexCompileInput, type LatexImage } from './latex-report.ts';
import { figureSVG } from './report-figures.ts';
import { resultFor } from './research-quality.ts';
import { coverImageFile, FRAME_IMAGE_FILE, pageArtBytes } from './page-art.ts';

/** Draws an SVG at a pixel width and returns PNG bytes with its pixel size. */
export type SvgToPng = (svg: string, width: number) => Promise<{ bytes: Uint8Array; width: number; height: number }>;

const base64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/**
 * The rendered images of the figures a compile input names, in its order. 1600 pixels across the 146 mm text width is
 * about 280 dpi; a figure too large at that size is drawn narrower rather than left out.
 */
export async function latexImages(content: EditorContent, input: LatexCompileInput, toPng: SvgToPng): Promise<LatexImage[]> {
  const ids = input.figureImages ?? [];
  if (ids.length > LATEX_IMAGE_LIMITS.count) throw Error(`图表超过 ${LATEX_IMAGE_LIMITS.count} 幅，请拆分报告后再编译。`);
  const images: LatexImage[] = [];
  for (const key of ids) {
    // A key is "result id#plotted column" (see latexChartExhibits); the figure is the one the Word export draws.
    const at = key.lastIndexOf('#'), r = resultFor(content.quality, key.slice(0, at)), column = Number(key.slice(at + 1));
    const svg = await figureSVG(r, column || 1, figureInk(content));
    let png = await toPng(svg, 1600);
    if (png.bytes.length > LATEX_IMAGE_LIMITS.bytes) png = await toPng(svg, 1200);
    if (png.bytes.length > LATEX_IMAGE_LIMITS.bytes) throw Error(`“${r.title}”的图过大，无法嵌入 PDF。`);
    images.push({ mime: 'image/png', data: base64(png.bytes), widthPx: png.width, heightPx: png.height });
  }
  if (images.reduce((s, x) => s + x.data.length * 3 / 4, 0) > LATEX_IMAGE_LIMITS.total) throw Error('方法图合计过大，请拆分报告后再编译。');
  return images;
}

/** The request the compiler receives: the figure ids stay behind, their images go with it. */
export function latexCompilePayload(input: LatexCompileInput, images: LatexImage[]): Omit<LatexCompileInput, 'figureImages'> {
  const { figureImages, ...rest } = input;
  if ((figureImages?.length ?? 0) !== images.length) throw Error('方法图数量与正文引用不一致。');
  return images.length ? { ...rest, images } : rest;
}

/** In the browser: the SVG drawn on a white canvas and saved as PNG. */
export const browserSvgToPng: SvgToPng = async (svg, width) => {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    const ratio = (image.naturalHeight || 1) / (image.naturalWidth || 1), canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = Math.round(width * ratio);
    const context = canvas.getContext('2d');
    if (!context) throw Error('浏览器无法绘制方法图。');
    context.fillStyle = '#FFFFFF'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw Error('浏览器无法导出方法图。');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** The files a source includes beside itself — cover, frame, method figures — under the names it gives them. */
export function latexSourceFiles(input: LatexCompileInput, images: readonly LatexImage[]): { name: string; bytes: Uint8Array }[] {
  const decode = (data: string) => Uint8Array.from(atob(data), c => c.charCodeAt(0));
  return [
    ...(input.options.includeCover && input.coverImage ? [{ name: coverImageFile(input.coverImage), bytes: pageArtBytes(input.coverImage) }] : []),
    ...(input.frameImage ? [{ name: FRAME_IMAGE_FILE, bytes: pageArtBytes(input.frameImage) }] : []),
    ...images.map((image, k) => ({ name: `exhibit-${k}.png`, bytes: decode(image.data) })),
  ];
}
