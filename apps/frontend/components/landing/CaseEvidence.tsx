"use client";

/* eslint-disable @next/next/no-img-element -- pre-sized original schematic SVGs */

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import styles from './CaseEvidence.module.css';

export type EvidencePage = {
  readonly id: string;
  readonly step: string;
  readonly name: string;
  readonly page: number;
  readonly title: string;
  readonly heading: string;
  readonly detail: string;
  readonly text: string;
  readonly alt: string;
  readonly tags: readonly string[];
  readonly imageBase: string;
};

/** Native scroll narrative with original structure diagrams, never source-report page images. */
export default function CaseEvidence({ pages, onOpen, motion }: {
  pages: readonly EvidencePage[];
  onOpen: (page: EvidencePage) => void;
  motion: boolean;
}) {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);
  const previousMotion = useRef(motion);
  const stageId = useId();
  const gradientId = useId();

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof IntersectionObserver === 'undefined') return;
    let disposed = false;
    let observer: IntersectionObserver;
    let generation = 0;
    const observe = () => {
      if (disposed) return;
      observer?.disconnect();
      const currentGeneration = ++generation;
      const height = window.innerHeight;
      // A single reading line avoids two adjacent steps competing inside a wide band.
      const bandTop = Math.round(height * .42);
      const bandBottom = Math.max(0, height - bandTop - 1);
      const items = Array.from(list.querySelectorAll<HTMLElement>('[data-evidence-step]'));
      observer = new IntersectionObserver(() => {
        if (disposed || currentGeneration !== generation) return;
        // Read current geometry, including when only the previous step's exit was queued.
        const line = bandTop + .5;
        const item = items.find(target => {
          const rect = target.getBoundingClientRect();
          return rect.top <= line && rect.bottom > line;
        });
        if (item) setActive(Number(item.dataset.evidenceStep));
      }, { rootMargin: `-${bandTop}px 0px -${bandBottom}px 0px` });
      for (const item of items) observer.observe(item);
    };
    observe();
    window.addEventListener('resize', observe);
    return () => { disposed = true; generation++; observer.disconnect(); window.removeEventListener('resize', observe); };
  }, []);

  useEffect(() => {
    // Stop native navigation where it is when the user pauses or requests reduced motion.
    if (previousMotion.current && !motion) window.scrollTo({ top: window.scrollY, behavior: 'instant' });
    previousMotion.current = motion;
  }, [motion]);

  const goTo = (index: number) => {
    const target = listRef.current?.children[index];
    if (!(target instanceof HTMLElement)) return;
    setActive(index);
    window.scrollTo({ top: window.scrollY + target.getBoundingClientRect().top - window.innerHeight * .3, behavior: motion ? 'smooth' : 'instant' });
  };
  const page = pages[active] ?? pages[0];
  if (!page) return null;

  return <div className={styles.evidence} data-evidence-active={page.id}>
    <div className={styles.intro}>
      <span><i/> 五处定位 · 一条研究主线</span>
      <p>向下滚动，沿证据逐层展开 <span aria-hidden="true">↓</span></p>
    </div>
    <div className={styles.layout}>
      <ol ref={listRef} className={styles.readings} aria-label="报告证据阅读路线">
        {pages.map((item, index) => <li key={item.id} data-evidence-step={index} data-active={index === active}>
          <div className={styles.readingCopy}>
            <span className={styles.overline}><b>{String(index + 1).padStart(2, '0')}</b> / {item.name}</span>
            <h3>{item.heading}</h3>
            <p className={styles.readingLead}>{item.detail}</p>
            <div className={styles.citation}>
              <span>原文定位：第 {item.page} 页 · {item.title}</span>
              <p>{item.text}</p>
            </div>
            <div className={styles.tags}>{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
            <button type="button" className={styles.readOriginal} onClick={() => onOpen(item)}>展开结构导览 <span aria-hidden="true">↗</span></button>
          </div>
        </li>)}
      </ol>
      <div id={stageId} className={styles.stage} aria-label="报告结构导览展台">
        <div className={styles.stageGlow} aria-hidden="true"/>
        <svg className={styles.orbits} viewBox="0 0 900 900" fill="none" aria-hidden="true">
          <defs><linearGradient id={gradientId} x1="80" y1="120" x2="800" y2="760" gradientUnits="userSpaceOnUse"><stop stopColor="#f4b942"/><stop offset=".46" stopColor="#ffe4a0"/><stop offset=".67" stopColor="#4fd1c1"/><stop offset="1" stopColor="#7fb6ff"/></linearGradient></defs>
          <g stroke={`url(#${gradientId})`}>
            <ellipse cx="450" cy="450" rx="385" ry="260" transform="rotate(-35 450 450)" opacity=".3"/>
            <ellipse cx="450" cy="450" rx="395" ry="235" transform="rotate(36 450 450)" opacity=".17"/>
            <circle cx="450" cy="450" r="345" opacity=".18" strokeDasharray="2 15"/>
            <circle cx="450" cy="450" r="270" opacity=".09"/>
            <path d="M95 603C186 234 589 133 805 365M178 758C340 816 698 645 811 348" opacity=".7"/>
          </g>
          <g fill="#ffe4a0"><circle cx="150" cy="457" r="4"/><circle cx="760" cy="328" r="4"/><path d="m253 175 5 8-5 8-5-8zm442 525 5 8-5 8-5-8z"/></g>
          <g fill="#72e6d5"><circle cx="730" cy="638" r="3"/><circle cx="304" cy="774" r="3"/></g>
        </svg>
        <div className={styles.stageTop}><span>CASE STUDY / EVIDENCE ATLAS</span><b>{String(active + 1).padStart(2, '0')} <small>/ {String(pages.length).padStart(2, '0')}</small></b></div>
        <div className={styles.paperScene}>
          <span className={styles.watermark} aria-hidden="true">{page.step}</span>
          <div className={styles.paperDeck}>
            {pages.map((item, index) => {
              const offset = index - active;
              return <div className={styles.paperLayer} key={item.id} data-current={index === active} aria-hidden={index !== active} style={{ '--offset': offset, '--distance': Math.abs(offset), zIndex: pages.length - Math.abs(offset) } as CSSProperties}>
                {index === active ? <button type="button" className={styles.paperButton} onClick={() => onOpen(item)} aria-label={`放大结构导览：${item.name}；原文定位第 ${item.page} 页`}>
                  <img src={`${item.imageBase}.svg`} width={560} height={792} alt={item.alt} loading="lazy" decoding="async"/>
                  <span className={styles.zoomHint}>结构导览 <span aria-hidden="true">↗</span></span>
                </button> : <img src={`${item.imageBase}.svg`} width={560} height={792} alt="" loading="lazy" decoding="async"/>}
              </div>;
            })}
          </div>
          <div className={styles.pageFlag}><span>{page.step}</span><div><b>{page.name}</b><small>PAGE {String(page.page).padStart(2, '0')}</small></div></div>
          <div className={styles.pageLabel}><i/><span>{page.title}</span></div>
        </div>
        <nav className={styles.route} aria-label="选择证据环节">
          {pages.map((item, index) => <button key={item.id} type="button" aria-current={active === index ? 'step' : undefined} aria-controls={stageId} onClick={() => goTo(index)}>
            <span>{item.step}</span><small>{item.name}</small>
          </button>)}
        </nav>
        <div className={styles.stageFoot}><span>问题</span><i style={{ '--position': active / Math.max(1, pages.length - 1) } as CSSProperties}/><span>行动</span></div>
      </div>
    </div>
  </div>;
}
