/**
 * Export a chart as a standalone SVG with a transparent background. Computed styles are inlined so
 * CSS-module classes and theme variables resolve to real colours; elements marked
 * data-export="skip" (selection halos, background lanes) are dropped. A caption with the title,
 * legend and data notes is appended under the chart so the file stays interpretable on its own.
 */
export type ExportLegend = Array<{ color: string; label: string; ring?: boolean }>;
export type ExportMeta = { title: string; legend?: ExportLegend; notes?: string[] };

const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'paint-order', 'text-anchor', 'dominant-baseline'];
const NS = 'http://www.w3.org/2000/svg';

/** Approximate rendered width: CJK and full-width glyphs ≈ 1 em, Latin ≈ 0.56 em. */
export function textEm(s: string): number { let w = 0; for (const ch of s) w += /[\u2E80-\uFFEF]/.test(ch) ? 1 : .56; return w; }
export function wrapText(s: string, maxWidth: number, size: number): string[] {
  const lines: string[] = []; let line = '', w = 0;
  for (const ch of s) {
    const cw = (/[\u2E80-\uFFEF]/.test(ch) ? 1 : .56) * size;
    if (w + cw > maxWidth && line) { lines.push(line); line = ''; w = 0; }
    line += ch; w += cw;
  }
  if (line) lines.push(line);
  return lines;
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  if (cs.display === 'none') { dst.remove(); return; }
  for (const p of PROPS) {
    const v = cs.getPropertyValue(p);
    if (v && v !== 'normal' && !(p === 'opacity' && v === '1') && !(p === 'stroke-dasharray' && v === 'none') && !(p === 'paint-order' && v === 'normal')) dst.setAttribute(p, v);
  }
  dst.removeAttribute('class');
  dst.removeAttribute('style');
  const a = [...src.children], b = [...dst.children];
  a.forEach((child, i) => { if (b[i]) inline(child, b[i]); });
}

/** Caption block under the chart: title, legend swatches (wrapped), notes. Returns its height. */
function caption(doc: Document, width: number, y0: number, meta: ExportMeta, ink: string, muted: string, family: string): { node: SVGGElement; height: number } {
  const g = doc.createElementNS(NS, 'g') as SVGGElement;
  let y = y0 + 22;
  const text = (x: number, yy: number, s: string, size: number, weight: number, color: string) => {
    const t = doc.createElementNS(NS, 'text');
    t.setAttribute('x', String(x)); t.setAttribute('y', String(yy)); t.setAttribute('font-size', String(size)); t.setAttribute('font-weight', String(weight));
    t.setAttribute('font-family', family); t.setAttribute('fill', color); t.textContent = s; g.appendChild(t); return t;
  };
  wrapText(meta.title, width, 15).forEach((line, i) => { if (i) y += 20; text(0, y, line, 15, 800, ink); });
  if (meta.legend?.length) {
    y += 24; let x = 0;
    for (const item of meta.legend) {
      const w = 26 + item.label.length * 12 * (/[一-鿿]/.test(item.label) ? 1 : .6);
      if (x + w > width && x > 0) { x = 0; y += 20; }
      const c = doc.createElementNS(NS, 'circle');
      c.setAttribute('cx', String(x + 6)); c.setAttribute('cy', String(y - 4)); c.setAttribute('r', '5');
      if (item.ring) { c.setAttribute('fill', 'none'); c.setAttribute('stroke', item.color); c.setAttribute('stroke-width', '2'); } else c.setAttribute('fill', item.color);
      g.appendChild(c);
      text(x + 16, y, item.label, 12, 600, ink);
      x += w + 10;
    }
  }
  for (const note of meta.notes ?? []) {
    for (const line of wrapText(note, width, 11.5)) { y += 18; text(0, y, line, 11.5, 500, muted); }
  }
  return { node: g, height: y - y0 + 12 };
}

/** Serialize an on-screen SVG with inlined styles and a caption; triggers a download. */
export function exportSvgElement(svg: SVGSVGElement, filename: string, meta: ExportMeta) {
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox?.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal : { x: 0, y: 0, width: rect.width, height: rect.height };
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inline(svg, clone);
  clone.querySelectorAll('[data-export="skip"]').forEach(n => n.remove());
  const cs = getComputedStyle(svg), ink = cs.getPropertyValue('--wb-text').trim() || '#0a1f33', muted = cs.getPropertyValue('--wb-muted').trim() || '#55687a', family = cs.fontFamily;
  const { node, height } = caption(document, vb.width, vb.y + vb.height, meta, ink, muted, family);
  clone.appendChild(node);
  clone.setAttribute('xmlns', NS);
  clone.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height + height}`);
  clone.setAttribute('width', String(vb.width));
  clone.setAttribute('height', String(vb.height + height));
  clone.removeAttribute('role');
  const title = document.createElementNS(NS, 'title'); title.textContent = meta.title; clone.insertBefore(title, clone.firstChild);
  download(new XMLSerializer().serializeToString(clone), filename);
}

/** Download an SVG string built off-screen (canvas charts and tables have no SVG on the page). */
export function exportSvgString(body: string, width: number, height: number, filename: string, meta: ExportMeta, colors: { ink: string; muted: string }) {
  const doc = document.implementation.createDocument(NS, 'svg', null);
  const svg = doc.documentElement as unknown as SVGSVGElement;
  const family = getComputedStyle(document.body).fontFamily;
  const parsed = new DOMParser().parseFromString(`<svg xmlns="${NS}">${body}</svg>`, 'image/svg+xml').documentElement;
  for (const child of [...parsed.childNodes]) svg.appendChild(doc.importNode(child, true));
  const { node, height: extra } = caption(doc, width, height, meta, colors.ink, colors.muted, family);
  svg.appendChild(node);
  svg.setAttribute('viewBox', `0 0 ${width} ${height + extra}`);
  svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height + extra));
  svg.setAttribute('font-family', family);
  const title = doc.createElementNS(NS, 'title'); title.textContent = meta.title; svg.insertBefore(title, svg.firstChild);
  download(new XMLSerializer().serializeToString(svg), filename);
}

function download(xml: string, filename: string) {
  const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const stamp = () => new Date().toISOString().slice(0, 10);
