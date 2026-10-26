"use client";

import { useEffect, useId, useRef, useState } from 'react';
import styles from './HeroShowcase.module.css';

const SCENES = [
  {
    id: 'silicon',
    label: '硅基样本',
    caption: '24 位虚构画像 × 2 个情境，按「等待时长」一题的回答分组站位。',
    alt: '证见硅基样本界面：三维舞台上的虚构受访者按回答分组站成几圈，附图例与分组选择。',
  },
  {
    id: 'design',
    label: '问卷设计',
    caption: '教学示例问卷「校园服务体验」：题目编辑、变量编码与问卷预览同屏。',
    alt: '证见问卷设计界面：左侧题目目录，中间编辑题干、变量编码与题型，右侧实时预览问卷。',
  },
  {
    id: 'analysis',
    label: '数据分析',
    caption: '12 行模拟数据的读取检查：记录数、变量、缺失比例与重复行逐项列出。',
    alt: '证见数据分析界面：模拟数据的读取检查，显示已读取记录、变量列、缺失比例与重复行。',
  },
  {
    id: 'editor',
    label: '报告与 PPT',
    caption: '默认报告模板：章节目录、正文编辑与 A4 实时预览在一屏。',
    alt: '证见报告编辑界面：章节目录、章节编辑区和 A4 实时预览，展示默认报告模板。',
  },
  {
    id: 'defense',
    label: '路演答辩',
    caption: '答辩练习示例：选择追问主题，梳理回答要点与支撑证据。',
    alt: '证见路演与答辩界面：左侧追问主题列表，右侧当前主题的回答要点。',
  },
] as const;

/** Native scroll stays local until its boundary; scene buttons are the non-scroll alternative. */
export default function HeroShowcase({ motion }: { motion: boolean }) {
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = SCENES[active];

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let disposed = false;
    const select = (index: number) => {
      if (disposed || index < 0 || index >= SCENES.length) return;
      activeRef.current = index;
      setActive(index);
    };
    const nearestScene = () => select(Math.round(scroller.scrollTop / Math.max(1, scroller.clientHeight)));
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (disposed) return;
      const visible = entries.filter(entry => entry.isIntersecting && entry.intersectionRatio >= 0.6)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) select(Number((visible.target as HTMLElement).dataset.sceneIndex));
    }, { root: scroller, threshold: [0, 0.6, 1] });

    if (observer) {
      for (const scene of scroller.children) observer.observe(scene);
    } else {
      scroller.addEventListener('scroll', nearestScene, { passive: true });
    }

    // Preserve the selected scene after a viewport change rather than leaving two shots cropped.
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (!disposed) scroller.scrollTo({ top: activeRef.current * scroller.clientHeight, behavior: 'instant' });
    });
    resizeObserver?.observe(scroller);

    return () => {
      disposed = true;
      observer?.disconnect();
      resizeObserver?.disconnect();
      scroller.removeEventListener('scroll', nearestScene);
    };
  }, []);

  const goToScene = (index: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const smooth = motion && !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({ top: index * scroller.clientHeight, behavior: smooth ? 'smooth' : 'instant' });
  };

  // An explicit pause also settles a smooth navigation that is already in flight.
  useEffect(() => {
    if (!motion) {
      const scroller = scrollerRef.current;
      scroller?.scrollTo({ top: activeRef.current * scroller.clientHeight, behavior: 'instant' });
    }
  }, [motion]);

  return <div className={styles.showcase} data-motion={motion ? 'on' : 'off'}>
    <div className={styles.browserBar}>
      <span className={styles.browserDots} aria-hidden="true"><i/><i/><i/></span>
      <span className={styles.browserTitle}>证见工作台<span aria-hidden="true">/</span>{current.label}</span>
      <span className={styles.sceneCount} aria-hidden="true"><b>0{active + 1}</b><span>/</span>05</span>
    </div>

    <div className={styles.screen}>
      <div ref={scrollerRef} id={`${id}-scroller`} className={styles.scroller} tabIndex={0}
        role="region" aria-label="证见工作台场景预览，可上下滚动切换" aria-describedby={`${id}-hint ${id}-caption`}>
        {SCENES.map((scene, index) => <div key={scene.id} className={styles.scene} data-scene-index={index}>
          {/* eslint-disable-next-line @next/next/no-img-element -- existing, pre-sized interface screenshots with responsive sources */}
          <img src={`/landing/app-${scene.id}-1600.webp`}
            srcSet={`/landing/app-${scene.id}-960.webp 960w, /landing/app-${scene.id}-1600.webp 1600w`}
            sizes="(max-width: 1240px) 94vw, 1180px" width={1600} height={1000} alt={scene.alt}
            fetchPriority={index === 0 ? 'high' : 'auto'} loading={index === 0 ? 'eager' : 'lazy'} decoding="async"/>
        </div>)}
      </div>
      <span id={`${id}-hint`} className={styles.scrollHint}><span aria-hidden="true">↕</span>上下滚动浏览</span>
    </div>

    <div className={styles.sceneRail} role="group" aria-label="切换工作台预览场景">
      {SCENES.map((scene, index) => <button key={scene.id} type="button" aria-pressed={active === index}
        aria-controls={`${id}-scroller`} onClick={() => goToScene(index)} data-active={active === index}>
        <span className={styles.sceneNumber} aria-hidden="true">0{index + 1}</span><span>{scene.label}</span>
      </button>)}
    </div>

    <div id={`${id}-caption`} className={styles.caption} aria-live="polite" aria-atomic="true">
      <span className={styles.exampleTag}>真实界面 · 示例数据</span>
      <p>{current.caption}</p>
    </div>
  </div>;
}
