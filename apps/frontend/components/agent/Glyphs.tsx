'use client';

import { Fragment, useEffect, useState } from 'react';
import { TexSpanLazy } from '@/components/math/TexLazy';
import { lightBar } from '@/lib/agent/glyphs';
import type { Line } from '@/lib/agent/router';
import { normalizeAcademicPunctuation } from '@/lib/typography';
import styles from './AgentShell.module.css';

function cleanGlyphText(raw: string): string {
  return normalizeAcademicPunctuation(raw).replace(/[{}]/gu, '');
}

/** An illumination bar. It is drawn for sighted readers; callers state the percentage in text beside it, or pass an explicit accessible label. */
export function LightBar({ score, cells = 4, label }: { score: number; cells?: number; label?: string }) {
  const cleanLabel = label ? cleanGlyphText(label).trim() : '';
  return <span
    className={styles.bar4}
    role={cleanLabel ? 'img' : undefined}
    aria-label={cleanLabel || undefined}
    aria-hidden={cleanLabel ? undefined : 'true'}
  >
    {[...lightBar(score, cells)].map((cell, i) => <span key={i} data-cell={cell === '·' ? 'dark' : 'lit'} aria-hidden="true">{cell}</span>)}
  </span>;
}

const NOISE = '░▒▓#%*+=:01xX∆◊';
/**
 * 显影: a number with an origin develops from cyan noise into gold, once, when its reply is new.
 * A reply restored from an earlier visit, or a reader who prefers less motion, sees the number at once; assistive
 * technology always reads the final number, never the noise.
 */
export function Develop({ text, at }: { text: string; at: number }) {
  const safeText = cleanGlyphText(text);
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (Date.now() - at > 1500 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const chars = [...safeText], step = Math.min(80, 400 / Math.max(1, chars.length)), start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const done = Math.floor((now - start) / step);
      if (done >= chars.length) { setShown(null); return; }
      setShown(chars.map((c, i) => i < done || /[\s.,:%/()·]/u.test(c) ? c : NOISE[(i * 7 + Math.floor(now / 45)) % NOISE.length]).join(''));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [safeText, at]);
  if (shown === null) {
    return <span className={styles['s-gold']}>{safeText}</span>;
  }
  return (
    <>
      <span className={styles.srOnly}>{safeText}</span>
      <span className={styles['s-gold']} data-developing="" aria-hidden="true">{shown}</span>
    </>
  );
}

/** One line of marked text from the router. */
export function Spans({ line, at }: { line: Line; at: number }) {
  return <>{line.map((span, i) => {
    if (/^[·░▒▓█]{4}$/u.test(span.text)) {
      return <span key={i} className={styles.bar4} aria-hidden="true">{[...span.text].map((cell, ci) => <span key={ci} data-cell={cell === '·' ? 'dark' : 'lit'}>{cell}</span>)}</span>;
    }
    if (span.mark === 'tex' || span.mark === 'math') {
      return <TexSpanLazy key={i} tex={span.text} display={span.mark === 'math'} className={span.mark === 'math' ? styles.mathBlock : styles.mathInline} />;
    }
    const cleanText = cleanGlyphText(span.text);
    if (span.mark === 'gold') return <Develop key={i} text={cleanText} at={at} />;
    if (span.mark) return <span key={i} className={styles[`s-${span.mark}`]}>{cleanText}</span>;
    return <Fragment key={i}>{cleanText}</Fragment>;
  })}</>;
}
