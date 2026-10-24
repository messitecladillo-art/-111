'use client';

import { Fragment, useEffect, useState } from 'react';
import { renderTex } from '@/components/math/Tex';
import { lightBar } from '@/lib/agent/glyphs';
import type { Line } from '@/lib/agent/router';
import styles from './AgentShell.module.css';

/** An illumination bar. It is drawn for sighted readers; callers state the percentage in text beside it. */
export function LightBar({ score, cells = 4 }: { score: number; cells?: number }) {
  return <span className={styles.bar4} aria-hidden="true">
    {[...lightBar(score, cells)].map((cell, i) => <span key={i} data-cell={cell === '·' ? 'dark' : 'lit'}>{cell}</span>)}
  </span>;
}

const NOISE = '░▒▓#%*+=:01xX∆◊';
/**
 * 显影: a number with an origin develops from cyan noise into gold, once, when its reply is new.
 * A reply restored from an earlier visit, or a reader who prefers less motion, sees the number at once; assistive
 * technology always reads the final number, never the noise.
 */
export function Develop({ text, at }: { text: string; at: number }) {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (Date.now() - at > 1500 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const chars = [...text], step = Math.min(80, 400 / Math.max(1, chars.length)), start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const done = Math.floor((now - start) / step);
      if (done >= chars.length) { setShown(null); return; }
      setShown(chars.map((c, i) => i < done || /[\s.,:%/()·]/u.test(c) ? c : NOISE[(i * 7 + Math.floor(now / 45)) % NOISE.length]).join(''));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, at]);
  return <><span className={styles.srOnly}>{text}</span><span className={styles['s-gold']} data-developing={shown === null ? undefined : ''} aria-hidden="true">{shown ?? text}</span></>;
}

/** One line of marked text from the router. */
export function Spans({ line, at }: { line: Line; at: number }) {
  return <>{line.map((span, i) => span.mark === 'gold' ? <Develop key={i} text={span.text} at={at} />
    : span.mark === 'tex' || span.mark === 'math' ? <span key={i} className={span.mark === 'math' ? styles.mathBlock : styles.mathInline} dangerouslySetInnerHTML={{ __html: renderTex(span.text, span.mark === 'math') }} />
    : span.mark ? <span key={i} className={styles[`s-${span.mark}`]}>{span.text}</span>
    : <Fragment key={i}>{span.text}</Fragment>)}</>;
}
