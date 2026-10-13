export const PDF_PREVIEW_LIMITS = Object.freeze({ pages: 500, pixels: 8_000_000, dimension: 8192, dpr: 2 });

export function pdfPreviewPageCount(total: number): number {
  if (!Number.isSafeInteger(total) || total < 1) throw new Error('PDF 页数无效。');
  return Math.min(total, PDF_PREVIEW_LIMITS.pages);
}

/** Fit the page without allocating an unbounded canvas for unusual PDF page sizes. */
export function fitPdfCanvas(pageWidth: number, pageHeight: number, availableWidth: number, deviceRatio: number) {
  if (![pageWidth, pageHeight, availableWidth].every(value => Number.isFinite(value) && value > 0)) throw new Error('PDF 页面尺寸无效。');
  const scale = Math.min(availableWidth / pageWidth, PDF_PREVIEW_LIMITS.dimension / pageWidth, PDF_PREVIEW_LIMITS.dimension / pageHeight);
  const width = pageWidth * scale, height = pageHeight * scale;
  if (![scale, width, height].every(Number.isFinite)) throw new Error('PDF 页面尺寸超出预览范围。');
  if (width < 1 || height < 1) throw new Error('PDF 页面比例超出预览范围。');
  const dpr = Number.isFinite(deviceRatio) ? Math.max(1, Math.min(deviceRatio, PDF_PREVIEW_LIMITS.dpr)) : 1;
  const ratio = Math.min(dpr, Math.sqrt(PDF_PREVIEW_LIMITS.pixels / width / height), PDF_PREVIEW_LIMITS.dimension / width, PDF_PREVIEW_LIMITS.dimension / height);
  return { scale, width, height, ratio, pixelWidth: Math.max(1, Math.floor(width * ratio)), pixelHeight: Math.max(1, Math.floor(height * ratio)) };
}
