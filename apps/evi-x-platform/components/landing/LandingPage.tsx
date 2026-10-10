"use client";

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { legacyLandingDestination, timelineChapter, timelineProgress } from '@/lib/landing-navigation';
import styles from './LandingPage.module.css';

const PixelScene = dynamic(() => import('./PixelScene'), { ssr: false });
const CHAPTERS = [
  { era: '古代 · 市集', title: ['每个答案，', '都有迹可循。'], subtitle: '市场调查与分析 AI 工作台' },
  { era: '19 世纪末 · 伦敦', title: ['循着细节，', '看见另一种可能。'], subtitle: '从记录，到线索' },
  { era: '现代 · 调查现场', title: ['走得更远，', '听见更多声音。'], subtitle: '从线索，到洞见' },
  { era: '此刻 · 证见', title: ['下一段发现，', '从你的问题开始。'], subtitle: '市场调查与分析 AI 工作台' },
] as const;

function PixelMark() {
  return <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-hidden="true"><path d="M4 24 12 18 20 12 28 6" stroke="currentColor"/><path d="M2 22h5v5H2zm8-6h5v5h-5zm8-6h5v5h-5zm8-6h5v5h-5z" fill="currentColor"/></svg>;
}
function FallbackScene() {
  return <svg viewBox="0 0 600 600" className={styles.fallbackSvg} aria-hidden="true"><defs><pattern id="evi-pixels" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#84918d"/></pattern></defs><path d="M110 510V260a190 190 0 0 1 380 0v250h-45V260a145 145 0 0 0-290 0v250Z" fill="url(#evi-pixels)"/><path d="m300 228 87 92-87 140-87-140Z" stroke="#00b3a4" fill="#0a1f33" strokeWidth="2"/><path d="m213 320 87 30 87-30m-87-92v232" stroke="#00b3a4"/></svg>;
}

export default function LandingPage() {
  const auth = useHostedSession();
  const storyRef = useRef<HTMLElement>(null), progressRef = useRef(0), chapterRef = useRef(0);
  const copyRef = useRef<HTMLDivElement>(null), headingRef = useRef<HTMLHeadingElement>(null);
  const focusChapterRef = useRef<number | null>(null);
  const [chapter, setChapter] = useState(0), [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false), [ready, setReady] = useState(false), [mounted, setMounted] = useState(false);
  const active = CHAPTERS[chapter];
  const loginHref = auth.session?.authenticated ? '/projects' : '/login';
  const onReady = useCallback((value: boolean) => setReady(value), []);

  useEffect(() => {
    if (focusChapterRef.current === chapter) {
      headingRef.current?.focus({ preventScroll: true });
      focusChapterRef.current = null;
    }
  }, [chapter]);

  useEffect(() => {
    const destination = legacyLandingDestination(window.location.hash);
    if (destination) { window.location.replace(destination); return; }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReducedMotion(media.matches);
    const mountFrame = requestAnimationFrame(() => { onMotion(); setMounted(true); });
    media.addEventListener('change', onMotion);
    const onHash = () => { const target = legacyLandingDestination(window.location.hash); if (target) window.location.replace(target); };
    window.addEventListener('hashchange', onHash);
    return () => { cancelAnimationFrame(mountFrame); media.removeEventListener('change', onMotion); window.removeEventListener('hashchange', onHash); };
  }, []);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = storyRef.current; if (!el) return;
      const rect = el.getBoundingClientRect();
      const progress = timelineProgress(rect.top, rect.height, window.innerHeight);
      progressRef.current = progress;
      const next = timelineChapter(progress);
      // Fade copy through the middle of each morph without a React update every frame.
      const distance = Math.abs(progress - next);
      const opacity = reducedMotion ? 1 : Math.max(0, Math.min(1, (0.48 - distance) / 0.19));
      if (copyRef.current) copyRef.current.style.opacity = String(opacity);
      if (next !== chapterRef.current) { chapterRef.current = next; setChapter(next); }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    if (storyRef.current) observer.observe(storyRef.current);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [reducedMotion]);

  const goTo = (index: number, focusHeading = false) => {
    const el = storyRef.current; if (!el) return;
    if (focusHeading) focusChapterRef.current = index;
    const rect = el.getBoundingClientRect();
    window.scrollTo({ top: rect.top + window.scrollY + Math.max(0, rect.height - window.innerHeight) * index / 3, behavior: reducedMotion ? 'instant' : 'smooth' });
  };

  return <div className={styles.landing} data-landing="evidence-journey" data-reduced-motion={reducedMotion} data-paused={paused}>
    <a className={styles.skip} href={loginHref}>跳过旅程，进入证见</a>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="证见 EVI-X 首页"><PixelMark/><strong>证见</strong><span>EVI-X</span></Link>
      <nav aria-label="产品导航"><Link href="/explore">了解证见</Link><Link href={loginHref} className={styles.login}>{auth.session?.authenticated ? '进入项目' : '登录'}<span aria-hidden="true">↗</span></Link></nav>
    </header>
    <main>
      <section id="journey" ref={storyRef} className={styles.journey} aria-label="跨时代的证据之旅">
        <div className={styles.stage} data-chapter={chapter}>
          <div className={styles.art} aria-hidden="true">
            <div className={styles.fallback} data-hidden={ready}><FallbackScene/></div>
            {mounted && <PixelScene progressRef={progressRef} paused={paused} reducedMotion={reducedMotion} expanded={false} onReady={onReady}/>}
          </div>
          <div className={styles.shade}/>
          <div className={styles.copy} ref={copyRef}>
            <p>{active.subtitle}</p>
            <h1 ref={headingRef} tabIndex={-1}>{active.title[0]}<br/>{active.title[1]}</h1>
            {chapter === 3 && <Link className={styles.enter} href={loginHref}>{auth.session?.authenticated ? '继续我的研究' : '开始我的研究'}<span aria-hidden="true">↗</span></Link>}
          </div>
          <div className={styles.bottom}>
            <span className={styles.era}><span>0{chapter + 1}</span>{active.era}</span>
            {chapter < 3 ? <button type="button" className={styles.next} onClick={() => goTo(chapter + 1, true)} aria-label={`继续：前往${CHAPTERS[Math.min(3, chapter + 1)].era}`}><span className={styles.chevron} aria-hidden="true">↓</span><span>{chapter === 0 ? '滚动，开始寻证' : '继续探索'}</span></button> : <Link className={styles.next} href="/explore">了解证见 <span aria-hidden="true">↗</span></Link>}
            <div className={styles.controls}>
              <nav className={styles.dots} aria-label="证据时间线">{CHAPTERS.map((item,index) => <button key={item.era} type="button" aria-label={`前往${item.era}`} title={item.era} aria-current={chapter === index ? 'step' : undefined} onClick={() => goTo(index)}><span/></button>)}</nav>
              <button type="button" className={styles.pause} aria-label={reducedMotion ? '已按系统设置减少动态效果' : paused ? '继续自动动效' : '暂停自动动效'} title={reducedMotion ? '静态浏览' : paused ? '继续自动动效' : '暂停自动动效'} aria-pressed={paused || reducedMotion} disabled={reducedMotion} onClick={() => setPaused(!paused)}>{paused || reducedMotion ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 7 5-7 5Z" fill="currentColor"/></svg> : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="2"/></svg>}</button>
            </div>
          </div>
        </div>
      </section>
    </main>
    <footer className={styles.footer}><div><span>证见 EVI-X</span><Link href="/explore">产品与说明</Link><Link href="/workspace">研究工具 ↗</Link></div><p>证见 EVI-X 为独立研究辅助工具，非“正大杯”赛事官方产品，与赛事主办方、承办方及冠名单位无隶属、授权或合作关系。</p></footer>
  </div>;
}
