"use client";

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from 'react';
import BrandMark from '@/components/brand/BrandMark';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { REPORT_CASES, REPORT_LIBRARY_STATS } from '@/lib/report-case-catalog';
import { LANDING_CASE_STUDY } from '@/data/landing-case-study';
import { calendarFor, CALENDAR_GROUPS, EDITION17_CALENDAR, type CalendarGroup } from '@/data/edition17-calendar';
import { ANALYSIS_BLOCKS } from '@/lib/analysis-recipes';
import { legacyLandingDestination } from '@/lib/landing-navigation';
import { SILICON_LIMITS } from '@/lib/silicon/persona';
import { CATEGORICAL_DARK } from '@/lib/silicon/palette';
import styles from './LandingPage.module.css';
import HeroAtmosphere from './HeroAtmosphere';
import TourAtmosphere from './TourAtmosphere';
import CaseEvidence, { type EvidencePage } from './CaseEvidence';
import HeroShowcase from './HeroShowcase';

const HEADLINE = ['让每个问题，', '都循证抵达行动'] as const;

const STATS = [
  { value: 12, unit: '个阶段', label: '从立项到提交的项目工作流' },
  { value: 9, unit: '道门禁', label: '逐步检查研究与成果质量' },
  { value: SILICON_LIMITS.personas, unit: '位', label: '单次运行的硅基受访者上限' },
  { value: REPORT_LIBRARY_STATS.total, unit: '份', label: '完整报告案例，原文逐页阅读' },
] as const;

const METHODS = [['问卷设计', '跳转与答案传递', '变量字典', '硅基预测试', '多模型交叉检验', '数据质量检查', '规则锁定', '九道质量门禁'], ['频数与比例', '分组描述', '交叉表与 Cramér V', 'Pearson 相关', 'Spearman 秩相关', '报告分镜', 'Word 与 PPTX 导出', '答辩追问演练']] as const;

/** Scroll tour: each image is a screenshot of the workbench running on teaching or simulated data. */
const TOUR = [
  { id: 'design', no: '01', label: '问卷设计', title: '把研究问题，落到每一道题', text: '研究问题、题项、变量与计划分析逐一对齐。改动即时预览，结构问题实时提示。', facts: ['题干、变量编码与问卷预览同屏', '路由预演：按回答把跳转走一遍', '导出问卷草稿与变量字典'], href: '/workspace#design', caption: '教学示例问卷「校园服务体验」', alt: '证见问卷设计界面：左侧题目目录，中间编辑题干、变量编码与题型，右侧实时预览问卷。' },
  { id: 'analysis', no: '02', label: '数据分析', title: '先查数据，再下结论', text: '读取 CSV 后先做体检：记录数、变量、缺失代码与完全重复行逐项列出，再进入分析。', facts: ANALYSIS_BLOCKS.map(block => block.title), chips: true, href: '/workspace#analysis', caption: '12 行模拟数据的读取检查', alt: '证见数据分析界面：模拟数据的读取检查，显示已读取记录、变量列、缺失比例与重复行。' },
  { id: 'editor', no: '03', label: '报告与 PPT', title: '边写边看，分镜直接成稿', text: '章节目录、正文编辑与 A4 实时预览在一屏；从报告分镜挑选证据，编排成幻灯片。', facts: ['章节编辑与 A4 实时预览', '报告分镜：选择证据并制作 PPT', '导出 Word 报告正文与 PPTX'], href: '/workspace#editor', caption: '默认报告模板', alt: '证见报告编辑界面：章节目录、章节编辑区和 A4 实时预览。' },
  { id: 'defense', no: '04', label: '路演答辩', title: '把追问，练到有据可答', text: '按主题演练评委可能的追问：先答问题，再定位证据，最后计时彩排。', facts: ['13 个追问主题', '练习笔记与成果卡可导入导出', '按段落设置时间检查点'], href: '/workspace#defense', caption: '追问主题与回答要点', alt: '证见路演与答辩界面：左侧追问主题列表，右侧当前主题的回答要点。' },
  { id: 'cases', no: '05', label: '案例与规则', title: '规则先锁定，案例可回查', text: '按届次、组别、赛区、赛道与阶段匹配规则；完整案例提供原报告、研究方法与逐页阅读线索。', facts: ['每条规则附来源与核验日期', `${REPORT_LIBRARY_STATS.total} 份完整原报告`, '从研究设计直接读到分析与建议'], href: '/workspace#cases', caption: '报告案例库', alt: '证见报告案例库界面：完整报告、研究主题与阅读入口。' },
] as const;

const QDIA = [
  ['Q', '问题', '先锁定届次、组别、赛区、赛道与阶段，再写清决策主体与研究问题。'],
  ['D', '数据', '问卷、抽样与数据审计在同一条链上，每份数据记录来源与清洗决定。'],
  ['I', '洞察', '方法与研究设计对齐，区分描述、相关与因果，不以复杂代替有效。'],
  ['A', '行动', '每条建议写明依据、责任人、优先级与衡量指标。'],
] as const;

const GATES = [['规', '规则'], ['问', '问题'], ['设', '设计'], ['田', '田野'], ['数', '数据'], ['推', '推断'], ['行', '行动'], ['视', '视觉'], ['交', '提交']] as const;

const SILICON_FACTS = [
  [`${SILICON_LIMITS.personas}`, '位画像', `最多 ${SILICON_LIMITS.attributes} 个属性，按你设定的配额或随机方式生成。`],
  [`${SILICON_LIMITS.scenarios}`, '个情境', '同一份问卷放进不同情境里再答一遍，看回答是否随情境变化。'],
  [`${SILICON_LIMITS.models}`, '个模型', '多个模型分别作答，检验结论是否只来自某一个模型。'],
  ['4', '项保真度检验', '按 Argyle 等人提出的四项标准，逐项检验模拟回答像不像。'],
] as const;

const CASE_REPORT = LANDING_CASE_STUDY.title;
const CASE_PAGES = LANDING_CASE_STUDY.pages;

const ORIGINS = [
  { era: '商 · 甲骨', glyph: '卜', title: '先问，后验。', text: '卜辞的最后一部分「验辞」记下事情是否应验：问题与结果刻在同一片甲骨上。', now: '先写清决策问题和待验证的判断，结论出来后回到原问题逐条核对。' },
  { era: '春秋 ·《论语》', glyph: '徵', title: '文献不足，不下断语。', text: '孔子能讲夏、殷之礼，却因杞、宋的典籍与贤人不足为证而不下定论。', now: '把待补资料列入项目清单，补齐依据后再推进结论。' },
  { era: '东汉 ·《说文》', glyph: '灋', title: '平之如水，触不直者去之。', text: '古文「法」从水、从廌、从去：传说獬豸能辨曲直，以角触理亏的一方。', now: '质量检查贯穿研究流程，让问题、数据与结论彼此对应。' },
  { era: '清 · 考据学', glyph: '證', title: '凡立一义，必凭证据。', text: '乾嘉学者一字一义都要找到出处；梁启超把这种学风归纳为几条研究规范。', now: '每条结论登记进证据台账，规则附官方来源，案例可读原报告，可逐条回查。' },
] as const;

const PRINCIPLES = [
  ['研究有据', '从问题、数据到结论，每一步保留可回查的依据。'],
  ['证据可追溯', '田野记录、分析结果与引用分别关联来源和版本。'],
  ['预测试先行', '用硅基模拟回答检查题目，再进入真实调查。'],
  ['规则可回查', '赛程与规则关联官方通知，并记录核验日期。'],
] as const;

const verifiedCases = REPORT_CASES;
const caseRows = [verifiedCases.filter((_, i) => i % 2 === 0), verifiedCases.filter((_, i) => i % 2 === 1)];

const subscribeNothing = () => () => {};
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
const useToday = () => useSyncExternalStore(subscribeNothing, localToday, () => null);
const formatDate = (iso: string) => `${+iso.slice(5, 7)}月${+iso.slice(8, 10)}日`;
const formatYearDate = (iso: string) => `${iso.slice(0, 4)}年${formatDate(iso)}`;
const formatRange = (start: string | undefined, end: string) => start ? `${formatDate(start)} – ${formatDate(end)}` : formatDate(end);
const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

function subscribeReducedMotion(listener: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
const reducedMotionSnapshot = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function subscribeVisibility(listener: () => void) {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}
const pageVisibleSnapshot = () => !document.hidden;

/** Counts once on entry; interrupting a decorative count settles the real final value. */
function CountUp({ value, animate }: { value: number; animate: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const playedValue = useRef<number | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.textContent = String(value);
    if (playedValue.current === value || typeof IntersectionObserver === 'undefined') return;
    let raf = 0, disposed = false;
    const settle = () => { cancelAnimationFrame(raf); raf = 0; node.textContent = String(value); };
    const observer = new IntersectionObserver(([entry]) => {
      if (disposed) return;
      if (!entry.isIntersecting) {
        if (playedValue.current === value) { settle(); observer.unobserve(node); }
        return;
      }
      if (playedValue.current === value) return;
      playedValue.current = value;
      if (!animate) { settle(); observer.unobserve(node); return; }
      const start = performance.now();
      const tick = (now: number) => {
        raf = 0;
        if (disposed) return;
        const t = Math.min(1, (now - start) / 1600);
        node.textContent = String(Math.round(value * (1 - Math.pow(1 - t, 4))));
        if (t < 1) raf = requestAnimationFrame(tick);
        else observer.unobserve(node);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    observer.observe(node);
    return () => { disposed = true; observer.disconnect(); settle(); };
  }, [value, animate]);
  return <span ref={ref}>{value}</span>;
}


function Persona({ hue }: { hue: string }) {
  return <svg viewBox="0 0 28 40" aria-hidden="true">
    <ellipse cx="14" cy="38" rx="9" ry="2" fill="#000" opacity=".35"/>
    <path d="M6 37c0-9 2-17 8-17s8 8 8 17Z" fill={hue}/>
    <path d="M10 22c1.2-1.4 2.5-2 4-2s2.8.6 4 2" stroke="#fff" strokeOpacity=".35" fill="none"/>
    <circle cx="14" cy="12" r="7.5" fill="#e8eef3"/>
    <path d="M6.6 10.5C7.5 6 10.5 4.2 14 4.2s6.5 1.8 7.4 6.3c-2.2-1.6-4.6-2.3-7.4-2.3s-5.2.7-7.4 2.3Z" fill="#2b2f3a"/>
    <circle cx="11.3" cy="12.8" r="1.1" fill="#0d1c2c"/><circle cx="16.7" cy="12.8" r="1.1" fill="#0d1c2c"/>
  </svg>;
}

/** Decorative orbit: one ring per model, figures riding upright around the questionnaire. */
function SiliconOrbit() {
  const rings = [{ r: 21, n: 5, dur: 46 }, { r: 33.5, n: 7, dur: 64 }, { r: 46, n: 9, dur: 82 }];
  let k = 0;
  return <div className={styles.orbit} aria-hidden="true">
    <div className={styles.orbitFloor}/>
    <div className={styles.orbitPlane}>
      {rings.map((ring, ri) => <div key={ring.r} className={styles.orbitRing} style={{ '--r': `${ring.r}cqi`, '--dur': `${ring.dur}s` } as CSSProperties}>
        <span className={styles.orbitTrack}/>
        <span className={styles.orbitSignal} style={{ '--a': `${ri * 120}deg` } as CSSProperties}/>
        {Array.from({ length: ring.n }, (_, i) => {
          const hue = CATEGORICAL_DARK[k++ % CATEGORICAL_DARK.length];
          return <span key={i} className={styles.orbitSlot} style={{ '--a': `${(360 / ring.n) * i + ri * 17}deg` } as CSSProperties}>
            <span className={styles.orbitFigure}><Persona hue={hue}/></span>
          </span>;
        })}
        <span className={styles.orbitLabel} style={{ '--a': `${-35 - ri * 22}deg` } as CSSProperties}><span>模型 {ri + 1}</span></span>
      </div>)}
      <div className={styles.orbitCore}><span>问卷</span><small>Q1 — Q8</small></div>
    </div>
    <span className={styles.orbitBeam}/>
    <span className={styles.orbitChip} data-pos="a">情境 · 平日午间</span>
    <span className={styles.orbitChip} data-pos="b">情境 · 晚间高峰</span>
    <span className={styles.orbitChip} data-pos="c" data-tone="gold">模拟 ≠ 调查</span>
  </div>;
}

function Tour() {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const steps = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-step]') ?? []);
    if (!steps.length || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
    }, { rootMargin: '-48% 0px -48% 0px' });
    for (const step of steps) observer.observe(step);
    return () => observer.disconnect();
  }, []);
  const current = TOUR[active];
  return <div className={styles.tour} data-scene={current.id} style={{ '--progress': (active + 1) / TOUR.length } as CSSProperties}>
    <ol ref={listRef} className={styles.tourSteps}>
      {TOUR.map((step, index) => <li key={step.id} data-step={index} data-active={active === index} className={styles.tourStep}>
        <span className={styles.tourNo} aria-hidden="true">{step.no}</span>
        <p className={styles.tourLabel}>{step.label}</p>
        <h3>{step.title}</h3>
        <p className={styles.tourText}>{step.text}</p>
        <ul className={'chips' in step ? styles.tourChips : styles.tourFacts}>{step.facts.map(fact => <li key={fact}>{fact}</li>)}</ul>
        <Link href={step.href} className={styles.tourLink}>打开{step.label}<span aria-hidden="true">↗</span></Link>
        <figure className={styles.tourInline}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized screenshot for narrow screens */}
          <img src={`/landing/app-${step.id}-960.webp`} width={960} height={600} alt={step.alt} loading="lazy" decoding="async"/>
          <figcaption>真实界面 · {step.caption}</figcaption>
        </figure>
      </li>)}
    </ol>
    <div className={styles.tourStage} aria-hidden="true">
      <TourAtmosphere className={styles.tourAtlas}/>
      <div className={styles.tourGlow} data-step={current.id}/>
      <div className={styles.tourWindow}>
        <div className={styles.windowBar}><i/><i/><i/><span>证见工作台 · {current.label}</span></div>
        <div className={styles.tourShots}>
          {TOUR.map((step, index) => (
            // eslint-disable-next-line @next/next/no-img-element -- static, pre-sized screenshots with responsive sources
            <img key={step.id} src={`/landing/app-${step.id}-1600.webp`} srcSet={`/landing/app-${step.id}-960.webp 960w, /landing/app-${step.id}-1600.webp 1600w`} sizes="(max-width: 1180px) 60vw, 700px" width={1600} height={1000} alt="" data-active={active === index} loading="lazy" decoding="async"/>
          ))}
        </div>
        <p className={styles.tourCaption}><span className={styles.realTag}>真实界面 · 示例数据</span>{current.caption}</p>
      </div>
      <div className={styles.tourRail}><span>{current.no}</span><i/><span>05</span></div>
    </div>
  </div>;
}

/** The season at a glance: windows as bars, deadlines as diamonds, one-day events as dots. The list beside it is the table view. */
function SeasonStrip({ entries, today }: { entries: ReturnType<typeof calendarFor>; today: string | null }) {
  const [hover, setHover] = useState<string | null>(null);
  const from = dayNumber('2026-10-01'), to = dayNumber('2027-06-01'), span = to - from;
  const x = (iso: string) => ((dayNumber(iso) - from) / span) * 100;
  const months = Array.from({ length: 8 }, (_, i) => { const m = (9 + i) % 12 + 1, y = m >= 10 ? 2026 : 2027; return { label: `${m}月`, iso: `${y}-${String(m).padStart(2, '0')}-01`, year: m === 1 || i === 0 ? String(y) : '' }; });
  const lanes: number[] = [];
  const placed = entries.map(entry => {
    const left = x(entry.start ?? entry.end), right = entry.start ? x(entry.end) : left + 4;
    let lane = lanes.findIndex(end => end < left - 3);
    if (lane === -1) { lane = lanes.length; lanes.push(right); } else lanes[lane] = right;
    return { entry, left, width: entry.start ? Math.max(0.8, x(entry.end) - left) : 0, lane };
  });
  const todayX = today ? x(today) : null;
  const tip = placed.find(item => item.entry.id === hover);
  return <div className={styles.season}>
    <div className={styles.seasonLegend} aria-hidden="true"><span data-kind="window">时段</span><span data-kind="deadline">截止</span><span data-kind="event">节点</span></div>
    <div className={styles.seasonTrack} style={{ '--lanes': lanes.length } as CSSProperties} onPointerLeave={() => setHover(null)}>
      {months.map(month => <span key={month.iso} className={styles.seasonMonth} style={{ left: `${x(month.iso)}%` }}><b>{month.label}</b>{month.year && <small>{month.year}</small>}</span>)}
      {todayX !== null && todayX >= 0 && todayX <= 100 && <span className={styles.seasonToday} style={{ left: `${todayX}%` }}><b>今天</b></span>}
      {placed.map(({ entry, left, width, lane }) => <button key={entry.id} type="button" className={styles.seasonMark} data-kind={entry.kind === 'window' || (entry.kind === 'event' && entry.start) ? 'window' : entry.kind} data-state={today ? entry.state : 'upcoming'}
        style={{ left: `${left}%`, width: width ? `${width}%` : undefined, '--lane': lane } as CSSProperties}
        aria-label={`${entry.label}：${formatRange(entry.start, entry.end)}`}
        onPointerEnter={() => setHover(entry.id)} onFocus={() => setHover(entry.id)} onBlur={() => setHover(null)}/>)}
      {tip && <span className={styles.seasonTip} style={{ left: `${Math.min(84, Math.max(8, tip.left))}%`, '--lane': tip.lane } as CSSProperties} role="status">
        <b>{tip.entry.label}</b>{formatRange(tip.entry.start, tip.entry.end)}
      </span>}
    </div>
  </div>;
}

function Calendar() {
  const today = useToday();
  const [group, setGroup] = useState<CalendarGroup>('undergrad');
  const entries = calendarFor(group, today ?? '2000-01-01');
  const next = today ? entries.find(entry => entry.state !== 'past') : entries[0];
  const countdown = today && next ? (next.daysLeft === 0 ? { value: '今天', unit: '' } : { value: String(next.daysLeft), unit: next.state === 'current' ? '天后结束' : next.kind === 'deadline' ? '天后截止' : next.kind === 'window' ? '天后开始' : '天后' }) : null;
  const yearOf = (index: number) => (entries[index].start ?? entries[index].end).slice(0, 4);
  return <div className={styles.calendar}>
    <div className={styles.groupPills} role="group" aria-label="选择组别">
      {(Object.keys(CALENDAR_GROUPS) as CalendarGroup[]).map(key => <button key={key} type="button" aria-pressed={group === key} onClick={() => setGroup(key)}>{CALENDAR_GROUPS[key]}</button>)}
    </div>
    <SeasonStrip entries={entries} today={today}/>
    <div className={styles.calendarGrid}>
      <div className={styles.nextCard} aria-live="polite">
        {next ? <>
          <span className={styles.nextLabel}>{!today ? CALENDAR_GROUPS[group] : next.state === 'current' ? '正在进行' : '下一项'}</span>
          {countdown && <p className={styles.nextCount}><b className={styles.foil}>{countdown.value}</b>{countdown.unit}</p>}
          <strong>{next.label}</strong>
          <time dateTime={next.end}>{formatRange(next.start, next.end)}</time>
          <p>{next.detail}</p>
        </> : <><span className={styles.nextLabel}>{CALENDAR_GROUPS[group]}</span><strong>本届赛程已全部结束</strong><p>新一届通知发布后，赛程会重新核验并更新。</p></>}
      </div>
      <ol className={styles.timeline} aria-label={`${CALENDAR_GROUPS[group]}赛程`}>
        {entries.map((entry, index) => {
          const divider = index === 0 || yearOf(index) !== yearOf(index - 1) ? yearOf(index) : undefined;
          return <li key={entry.id} data-state={today ? entry.state : 'upcoming'} data-kind={entry.kind} data-year={divider}>
            <span className={styles.timelineDot} aria-hidden="true"/>
            <time dateTime={entry.end}>{formatRange(entry.start, entry.end)}</time>
            <div><strong>{entry.label}</strong><p>{entry.detail}</p></div>
            {today && <span className={styles.timelineState}>{entry.state === 'past' ? '已过' : entry.state === 'current' ? '进行中' : `${entry.daysLeft} 天后`}</span>}
          </li>;
        })}
      </ol>
    </div>
    <p className={styles.sourceLine}>来源：{EDITION17_CALENDAR.source.documentNumber}，第 3–6 页，核验于 {formatYearDate(EDITION17_CALENDAR.source.verifiedAt)}。{EDITION17_CALENDAR.boundary}</p>
  </div>;
}

function CaseCard({ item }: { item: typeof verifiedCases[number] }) {
  return <article className={styles.caseCard}>
    <span className={styles.caseAward}>{item.topic[0]} · {item.pages} 页</span>
    <h3>{item.title}</h3>
    <p>{item.summary}</p>
    <span className={styles.caseSource}>完整原报告 · 阅读线索</span>
  </article>;
}

function CaseStudy({ motion }: { motion: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<EvidencePage | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    if (!dialog.open) dialog.showModal();
    const close = () => setOpen(null);
    dialog.addEventListener('close', close);
    return () => dialog.removeEventListener('close', close);
  }, [open]);
  return <>
    <CaseEvidence pages={CASE_PAGES} onOpen={setOpen} motion={motion}/>
    <dialog ref={dialogRef} className={styles.caseDialog} aria-label={open ? `结构导览：${open.name}；原文定位第 ${open.page} 页` : '报告结构导览'} onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
      {open && <figure>
        {/* eslint-disable-next-line @next/next/no-img-element -- original, pre-sized schematic SVG */}
        <img src={`${open.imageBase}.svg`} width={560} height={792} alt={open.alt}/>
        <figcaption><b>{open.step} · {open.name}</b>结构导览 · 非报告原页<button type="button" onClick={() => dialogRef.current?.close()}>关闭</button></figcaption>
      </figure>}
    </dialog>
  </>;
}

function Eclipse({ refEl, variant }: { refEl?: RefObject<HTMLDivElement | null>; variant: 'hero' | 'finale' }) {
  return <div ref={refEl} className={styles.eclipse} data-variant={variant} aria-hidden="true"><i className={styles.eclipseSweep}/><i className={styles.eclipseGrid}/></div>;
}

export default function LandingPage() {
  const auth = useHostedSession();
  const rootRef = useRef<HTMLDivElement>(null), eclipseRef = useRef<HTMLDivElement>(null), windowRef = useRef<HTMLElement>(null);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const pageVisible = useSyncExternalStore(subscribeVisibility, pageVisibleSnapshot, () => true);
  const [paused, setPaused] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const motion = mounted && !reducedMotion && !paused && pageVisible;
  const signedIn = !!auth.session?.authenticated;
  const loginHref = signedIn ? '/projects' : '/login';

  useEffect(() => {
    // Entry content must stay visible after pausing, including a pause before its delay expires.
    if (paused || reducedMotion || !pageVisible) rootRef.current?.setAttribute('data-entry-settled', 'true');
  }, [paused, reducedMotion, pageVisible]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !mounted || typeof IntersectionObserver === 'undefined') return;
    const scopes = Array.from(root.querySelectorAll<HTMLElement>('main > section'));
    let disposed = false;
    const observer = new IntersectionObserver(entries => {
      if (disposed) return;
      for (const entry of entries) (entry.target as HTMLElement).dataset.motionVisible = String(entry.isIntersecting);
    });
    for (const scope of scopes) {
      const rect = scope.getBoundingClientRect();
      scope.dataset.motionVisible = String(rect.bottom > 0 && rect.top < window.innerHeight);
      observer.observe(scope);
    }
    return () => {
      disposed = true;
      observer.disconnect();
      for (const scope of scopes) delete scope.dataset.motionVisible;
    };
  }, [mounted]);

  useEffect(() => {
    const go = () => { const destination = legacyLandingDestination(window.location.hash); if (destination) window.location.replace(destination); };
    go();
    window.addEventListener('hashchange', go);
    // The hero window flattens as it rises into view (written straight to its style, not React state).
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 12);
      const node = windowRef.current;
      if (!node) return;
      const top = node.getBoundingClientRect().top, view = window.innerHeight || 1;
      node.style.setProperty('--p', Math.min(1, Math.max(0, 1 - (top - view * 0.16) / (view * 0.6))).toFixed(3));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('hashchange', go); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);

  useEffect(() => {
    // Blocks reveal once when their top passes 90% of the viewport, including blocks a fast scroll skipped over.
    if (!mounted || reducedMotion) return;
    let pending = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('main [data-reveal]') ?? []).filter(node => node.dataset.seen !== 'true');
    let frame = 0;
    const check = () => {
      frame = 0;
      const line = window.innerHeight * 0.9;
      pending = pending.filter(node => { if (node.getBoundingClientRect().top < line) { node.dataset.seen = 'true'; return false; } return true; });
      if (!pending.length) window.removeEventListener('scroll', schedule);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(check); };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [mounted, reducedMotion]);

  useEffect(() => {
    // A soft spotlight follows fine pointers across cards.
    const root = rootRef.current;
    if (!root || !motion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const move = (event: PointerEvent) => {
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-spot]') : null;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--sx', `${event.clientX - rect.left}px`);
      card.style.setProperty('--sy', `${event.clientY - rect.top}px`);
    };
    root.addEventListener('pointermove', move, { passive: true });
    return () => root.removeEventListener('pointermove', move);
  }, [motion]);

  useEffect(() => {
    const node = windowRef.current;
    if (!node) return;
    const reset = () => {
      node.style.setProperty('--tilt-x', '0deg');
      node.style.setProperty('--tilt-y', '0deg');
      node.style.setProperty('--light-x', '50%');
      node.style.setProperty('--light-y', '0%');
    };
    reset();
    if (!motion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let frame = 0, pointerX = 0, pointerY = 0;
    const paint = () => {
      frame = 0;
      if (document.hidden) return;
      const rect = node.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (pointerX - rect.left) / Math.max(1, rect.width)));
      const y = Math.min(1, Math.max(0, (pointerY - rect.top) / Math.max(1, rect.height)));
      node.style.setProperty('--tilt-x', `${((.5 - y) * 3).toFixed(2)}deg`);
      node.style.setProperty('--tilt-y', `${((x - .5) * 4).toFixed(2)}deg`);
      node.style.setProperty('--light-x', `${(x * 100).toFixed(1)}%`);
      node.style.setProperty('--light-y', `${(y * 100).toFixed(1)}%`);
    };
    const move = (event: PointerEvent) => {
      pointerX = event.clientX; pointerY = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const leave = () => { cancelAnimationFrame(frame); frame = 0; reset(); };
    node.addEventListener('pointermove', move, { passive: true });
    node.addEventListener('pointerleave', leave);
    window.addEventListener('blur', leave);
    document.addEventListener('visibilitychange', leave);
    return () => {
      leave();
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerleave', leave);
      window.removeEventListener('blur', leave);
      document.removeEventListener('visibilitychange', leave);
    };
  }, [motion]);

  return <div ref={rootRef} className={styles.landing} data-landing="product" data-reveal={mounted && !reducedMotion ? 'on' : 'off'} data-motion={motion ? 'on' : 'off'} data-paused={paused} data-scrolled={scrolled}>
    <a className={styles.skip} href="#features">跳到产品介绍</a>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label="证见 EVI-X 首页"><BrandMark size={28}/><strong>证见</strong><span>EVI-X</span></Link>
        <nav className={styles.nav} aria-label="页面导航">
          <a href="#features">功能</a>
          <a href="#silicon">硅基样本</a>
          <a href="#calendar">赛程</a>
          <a href="#awards">案例</a>
          <Link href="/explore">了解证见</Link>
          <Link href="/chronicle">寻证之旅</Link>
        </nav>
        <div className={styles.headerActions}>
          <Link href={loginHref} className={styles.textLink}>{signedIn ? '我的项目' : '登录'}</Link>
          <Link href="/workspace" className={styles.buttonSmall}>进入工作台</Link>
        </div>
        <span className={styles.scrollProgress} aria-hidden="true"/>
      </div>
    </header>

    <main>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroStage}>
          <div className={styles.heroSky} aria-hidden="true"><span className={styles.heroGrid}/><i className={styles.auroraA}/><i className={styles.auroraB}/></div>
          <HeroAtmosphere running={motion} eclipseRef={eclipseRef} className={styles.heroCanvas}/>
          <div className={styles.heroCoordinates} aria-hidden="true">
            <span data-station="q"><i/>Q <b>问题</b><small>ASK</small></span>
            <span data-station="d"><i/>D <b>数据</b><small>OBSERVE</small></span>
            <span data-station="i"><i/>I <b>洞察</b><small>UNDERSTAND</small></span>
            <span data-station="a"><i/>A <b>行动</b><small>ACT</small></span>
          </div>
          <Eclipse refEl={eclipseRef} variant="hero"/>
          <div className={styles.heroCopy}>
            <a href="#calendar" className={styles.badge}><span className={styles.badgeDot} aria-hidden="true"/>第十七届赛程已同步<span className={styles.badgeSep} aria-hidden="true"/>{EDITION17_CALENDAR.source.documentNumber}<span aria-hidden="true">→</span></a>
            <h1 id="hero-title" className={styles.heroTitle} aria-label={HEADLINE.join('')}>
              <span className={styles.heroLine} aria-hidden="true">{[...HEADLINE[0]].map((char, i) => <span key={i} className={styles.char} style={{ '--ci': i } as CSSProperties}>{char}</span>)}</span>
              <span className={`${styles.heroLine} ${styles.heroFoil}`} aria-hidden="true">{HEADLINE[1]}</span>
            </h1>
            <p className={styles.heroLead}>面向正大杯参赛团队的 AI 研究工作台。问卷设计、硅基样本预测试、数据分析、报告与答辩，都在同一条证据链上完成。</p>
            <div className={styles.heroActions}>
              <Link href="/workspace" className={styles.buttonPrimary}><span>免登录试用工作台</span><span aria-hidden="true">↗</span></Link>
              <Link href={loginHref} className={styles.buttonGhost}>{signedIn ? '继续我的研究' : '登录团队项目'}</Link>
            </div>
          </div>
        </div>
        <div className={styles.heroWindowWrap}>
          <div className={styles.heroBeam} aria-hidden="true"/>
          <figure ref={windowRef} className={styles.heroWindow}>
            <HeroShowcase motion={motion}/>
          </figure>
          <div className={`${styles.float} ${styles.floatA}`} aria-hidden="true"><b>Q → D → I → A</b><span>每条结论都能回到原问题</span></div>
          <div className={`${styles.float} ${styles.floatB}`} aria-hidden="true"><b><i className={styles.dotGold}/>五个研究场景</b><span>上下滚动，探索真实界面</span></div>
          <div className={`${styles.float} ${styles.floatC}`} aria-hidden="true"><b>9 道门禁</b><span className={styles.gateDots}>{GATES.map(([seal]) => <i key={seal}>{seal}</i>)}</span></div>
          <a href="#features" className={styles.heroExplore}>探索完整研究流程<span aria-hidden="true">↓</span></a>
        </div>
      </section>

      <section className={styles.marquee} aria-label="支持的研究方法">
        {METHODS.map((row, ri) => <div key={ri} className={styles.marqueeRow} data-reverse={ri === 1}>
          <ul>{row.map((method, i) => <li key={method} data-fill={(i + ri) % 3 === 0}>{method}</li>)}</ul>
          <ul aria-hidden="true">{row.map((method, i) => <li key={method} data-fill={(i + ri) % 3 === 0}>{method}</li>)}</ul>
        </div>)}
      </section>

      <section className={styles.numbers} aria-label="关键数字">
        <dl>{STATS.map((stat, index) => <div key={stat.label} data-reveal style={{ '--i': index } as CSSProperties}>
          <dt>{stat.label}</dt>
          <dd><span className={styles.bigNumber}><CountUp value={stat.value} animate={motion}/></span><small>{stat.unit}</small></dd>
        </div>)}</dl>
      </section>

      <section id="features" className={`${styles.section} ${styles.featureSection}`} aria-labelledby="features-title">
        <div className={styles.sectionHead} data-reveal>
          <p className={styles.kicker}>功能</p>
          <h2 id="features-title">从选题到答辩，<br/><span className={styles.foil}>一个工作台就够</span></h2>
          <p>每个模块都能单独使用，也能把结果交给下一步：问卷送进分析，分析结论进入报告，报告分镜生成 PPT。</p>
        </div>
        <Tour/>
      </section>

      <section id="chain" className={styles.section} aria-labelledby="chain-title">
        <div className={styles.chainCard} data-reveal>
          <div className={styles.chainGlow} aria-hidden="true"/>
          <div className={styles.sectionHead}>
            <p className={styles.kicker}>证据链</p>
            <h2 id="chain-title">问题、数据、洞察、行动，<br/>一环扣一环</h2>
          </div>
          <div className={styles.chainTrack}>
            <svg className={styles.chainLine} viewBox="0 0 100 2" preserveAspectRatio="none" aria-hidden="true">
              <defs><linearGradient id="evx-chain-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="1" x2="100" y2="1"><stop offset="0" stopColor="#f4b942"/><stop offset=".5" stopColor="#4fd1c1"/><stop offset="1" stopColor="#7fb6ff"/></linearGradient></defs>
              <path d="M0 1H100" pathLength={1}/>
            </svg>
            <ol className={styles.chain}>
              {QDIA.map(([key, name, text], index) => <li key={key} style={{ '--i': index } as CSSProperties}>
                <span className={styles.chainKey} aria-hidden="true">{key}</span>
                <strong>{name}</strong>
                <p>{text}</p>
              </li>)}
            </ol>
          </div>
          <div className={styles.gates}>
            <p><strong>九道质量门禁</strong>任何一道未通过或已过期，都不会给出最终交付的「Go」。</p>
            <ol aria-label="九道质量门禁">{GATES.map(([seal, name], index) => <li key={name} style={{ '--i': index } as CSSProperties}><span aria-hidden="true">{seal}</span>{name}</li>)}</ol>
          </div>
        </div>
      </section>

      <section id="silicon" className={`${styles.section} ${styles.split}`} aria-labelledby="silicon-title">
        <span className={styles.ghostWord} aria-hidden="true">SILICON</span>
        <div className={styles.splitCopy} data-reveal>
          <p className={styles.kicker}>硅基样本</p>
          <h2 id="silicon-title">真人作答之前，<br/><span className={styles.foil}>先让 AI 替你答一遍</span></h2>
          <p className={styles.lead}>给 AI 设定身份与情境，扮演虚构受访者预答问卷，提前找出表述不清、选项缺失和跳转错误。</p>
          <dl className={styles.factGrid}>
            {SILICON_FACTS.map(([value, unit, text]) => <div key={unit} data-spot><dt><b>{value}</b>{unit}</dt><dd>{text}</dd></div>)}
          </dl>
          <p className={styles.caution}><i className={styles.dotGold} aria-hidden="true"/>硅基模拟 · 问卷预测试</p>
          <Link href="/workspace#silicon" className={styles.buttonGhost}>打开硅基样本<span aria-hidden="true">↗</span></Link>
        </div>
        <div className={styles.splitArt} data-reveal>
          <SiliconOrbit/>
          <figure className={styles.miniShot}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized interface crop */}
            <img src="/landing/crop-fidelity.webp" alt="硅基样本结果页：模拟回答数、阻断问题、建议修改与估计作答时长，以及保真度检验列表。" width={1200} height={410} loading="lazy" decoding="async"/>
            <figcaption>真实界面：运行后的预测试发现与保真度检验</figcaption>
          </figure>
        </div>
      </section>

      <section id="calendar" className={styles.section} aria-labelledby="calendar-title">
        <div className={styles.sectionHead} data-reveal>
          <p className={styles.kicker}>第十七届赛程</p>
          <h2 id="calendar-title">关键日期，<br/><span className={styles.foil}>按组别一眼看清</span></h2>
          <p>日期摘自第十七届总通知，按你的组别排好顺序；进入工作台后，概览页会持续提醒。</p>
        </div>
        <div data-reveal><Calendar/></div>
      </section>

      <section id="awards" className={styles.section} aria-labelledby="awards-title">
        <div className={styles.sectionHead} data-reveal>
          <p className={styles.kicker}>报告案例</p>
          <h2 id="awards-title">从完整报告中，<br/><span className={styles.foil}>找到研究的启发</span></h2>
          <p>{REPORT_LIBRARY_STATS.total} 份完整报告，按选题、地区与研究方法检索，从原文中寻找研究的思路。</p>
        </div>
        <div className={styles.caseMarquee} data-reveal>
          {caseRows.map((row, ri) => <div key={ri} className={styles.caseRow} data-reverse={ri === 1}>
            <ul>{row.map(item => <li key={item.id}><CaseCard item={item}/></li>)}</ul>
            <ul aria-hidden="true" inert>{row.map(item => <li key={item.id}><CaseCard item={item}/></li>)}</ul>
          </div>)}
        </div>
        <p className={styles.sectionFoot} data-reveal><Link href="/workspace#cases">打开报告案例库 ↗</Link></p>
      </section>

      <section id="deep-read" className={`${styles.section} ${styles.deepReadSection}`} aria-labelledby="deep-read-title">
        <div className={styles.sectionHead} data-reveal>
          <p className={styles.kicker}>案例深读</p>
          <h2 id="deep-read-title">一份报告，<br/><span className={styles.foil}>怎样把证据链走完</span></h2>
          <p>《{CASE_REPORT}》：沿五处阅读定位，看问题、方法与行动怎样连接。画面为原创结构导览，原文可在案例库本地阅读。</p>
          <p className={styles.sectionFoot}>{LANDING_CASE_STUDY.label}</p>
        </div>
        <CaseStudy motion={motion}/>
      </section>

      <section id="origins" className={styles.paper} aria-labelledby="origins-title">
        <span className={styles.paperSeal} aria-hidden="true">證</span>
        <div className={styles.paperInner}>
          <div className={styles.paperHead}>
            <div data-reveal>
              <p className={styles.paperKicker}>无征不信</p>
              <h2 id="origins-title">三千年来，<br/>可信的判断<br/>都从证据开始</h2>
              <blockquote><p>上焉者虽善无征，无征不信，不信民弗从。</p><cite>《礼记·中庸》</cite></blockquote>
              <p className={styles.paperLead}>证见把这条古老的准则，带进每一次市场调查。</p>
            </div>
            <figure className={styles.mascot} data-reveal>
              {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized derivative of the approved brand anchor */}
              <img src="/brand/evi-x-character-anchor-v2-960.webp" width={960} height={640} loading="lazy" decoding="async" alt="獬见：深蓝色幼年獬豸，头顶一根带四个发光节点的金色独角，胸前有青金棱镜。"/>
              <figcaption>守证灵兽「獬见」：独角上的四个节点，依次代表问题、数据、洞察、行动。<small>AI 辅助生成、经人工验收的原创概念角色</small></figcaption>
            </figure>
          </div>
          <ol className={styles.eras}>
            {ORIGINS.map((origin, index) => <li key={origin.era} data-reveal style={{ '--i': index } as CSSProperties}>
              <span className={styles.eraGlyph} aria-hidden="true">{origin.glyph}</span>
              <span className={styles.eraName}>{origin.era}</span>
              <h3>{origin.title}</h3>
              <p>{origin.text}</p>
              <p className={styles.eraNow}><b>今天</b>{origin.now}</p>
            </li>)}
          </ol>
          <div id="principles" className={styles.principles}>
            <h2 className={styles.principlesTitle}>我们的立场</h2>
            <ul>{PRINCIPLES.map(([title, text], index) => <li key={title} data-reveal style={{ '--i': index } as CSSProperties}><span aria-hidden="true">0{index + 1}</span><h3>{title}</h3><p>{text}</p></li>)}</ul>
          </div>
        </div>
      </section>

      <section id="start" className={styles.finale} aria-labelledby="start-title">
        <Eclipse variant="finale"/>
        <div className={styles.sectionHead} data-reveal>
          <p className={styles.kicker}>问有据，见有策</p>
          <h2 id="start-title" className={styles.finaleTitle}>下一段证据，<br/><span className={styles.foil}>从你的问题开始</span></h2>
        </div>
        <ul className={styles.ctaCards}>
          <li data-spot data-reveal><Link href="/workspace"><b>免登录工作台</b><span>问卷、硅基样本、数据分析与报告编辑，打开即用。</span><i aria-hidden="true">↗</i></Link></li>
          <li data-spot data-reveal style={{ '--i': 1 } as CSSProperties}><Link href={loginHref}><b>{signedIn ? '我的项目' : '团队项目'}</b><span>邮箱登录后与队友协作，保存问卷提案与云端版本。</span><i aria-hidden="true">↗</i></Link></li>
          <li data-spot data-reveal style={{ '--i': 2 } as CSSProperties}><Link href="/explore"><b>了解证见</b><span>动手试一遍交互演示，看看常见问题。</span><i aria-hidden="true">↗</i></Link></li>
        </ul>
      </section>
    </main>

    <footer className={styles.footer}>
      <div className={styles.footerTop}>
        <Link href="/" className={styles.brand} aria-label="证见 EVI-X 首页"><BrandMark size={26}/><strong>证见</strong><span>EVI-X</span></Link>
        <nav aria-label="页脚导航">
          <Link href="/workspace">工作台</Link>
          <Link href={loginHref}>{signedIn ? '我的项目' : '登录'}</Link>
          <Link href="/services">我的模型服务</Link>
          <Link href="/explore">了解证见</Link>
          <Link href="/explore#questions">常见问题</Link>
        </nav>
      </div>
      <p>引文出处：《礼记·中庸》；《论语·八佾》；许慎《说文解字》；梁启超《清代学术概论》。案例报告版权归原作者。</p>
      <span className={styles.wordmark} aria-hidden="true">EVI-X</span>
    </footer>

    {mounted && !reducedMotion && <button type="button" className={styles.pause} aria-pressed={paused} onClick={() => setPaused(!paused)} aria-label={paused ? '继续动效' : '暂停动效'} title={paused ? '继续动效' : '暂停动效'}>
      {paused ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 7 5-7 5Z" fill="currentColor"/></svg> : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="2"/></svg>}
    </button>}
  </div>;
}
