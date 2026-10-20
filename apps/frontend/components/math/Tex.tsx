'use client';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { memo, useMemo, useState, type ReactNode } from 'react';
import styles from './Tex.module.css';

/**
 * Every formula in the product is typeset with KaTeX from TeX source; plain-text formulas are not used.
 * The source strings are written by the application (never by users), and KaTeX runs with trust off.
 */
const cache = new Map<string, string>();
export function renderTex(tex: string, display: boolean): string {
  const key = (display ? 'D:' : 'I:') + tex;
  let html = cache.get(key);
  if (html === undefined) {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, output: 'htmlAndMathml' });
    if (cache.size > 3000) cache.clear();
    cache.set(key, html);
  }
  return html;
}

/** Inline math inside running text. */
export const Tex = memo(function Tex({ tex, className }: { tex: string; className?: string }) {
  const html = useMemo(() => renderTex(tex, false), [tex]);
  return <span className={className ? `${styles.inline} ${className}` : styles.inline} dangerouslySetInnerHTML={{ __html: html }} />;
});

/** A display equation with an optional label and equation number, and a “copy LaTeX” action. */
export const Formula = memo(function Formula({ tex, label, number, copyable = true, compact = false }: { tex: string; label?: ReactNode; number?: string; copyable?: boolean; compact?: boolean }) {
  const html = useMemo(() => renderTex(tex, true), [tex]);
  const [copied, setCopied] = useState(false);
  const name = typeof label === 'string' ? label : number ? `公式 ${number}` : '';
  async function copy() {
    try { await navigator.clipboard.writeText(tex); setCopied(true); window.setTimeout(() => setCopied(false), 1400); } catch { setCopied(false); }
  }
  return <figure className={styles.formula} data-compact={compact || undefined}>
    {label && <figcaption>{label}</figcaption>}
    <div className={styles.body}>
      <div className={styles.math} tabIndex={0} aria-label={name ? `${name}（公式）` : '公式'} dangerouslySetInnerHTML={{ __html: html }} />
      {number && <span className={styles.number}>({number})</span>}
    </div>
    {copyable && <button type="button" className={styles.copy} onClick={() => void copy()} aria-label={`复制 LaTeX${name ? `：${name}` : ''}`}>{copied ? '已复制' : 'LaTeX'}</button>}
  </figure>;
});
