/** Embedded vectors must be self-contained: no scripts, styles, external references or raster data. */
export function assertTrueVector(svg: string): string {
  if (!/^\s*<svg\b/.test(svg) || /<(?:image|script|foreignObject|filter|feImage)\b|(?:href|xlink:href)\s*=|data:|javascript:|url\s*\(|\bon\w+\s*=|<(?:style|iframe)\b|<!DOCTYPE|<!ENTITY/i.test(svg)) {
    throw Error('素材必须是无外部资源、无位图和脚本的真实 SVG。');
  }
  return svg;
}
