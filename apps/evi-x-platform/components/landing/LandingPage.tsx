"use client";

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import BrandMark from '@/components/brand/BrandMark';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { awardCaseLibraryStats, awardCases } from '@/data/award-cases';
import { calendarFor, CALENDAR_GROUPS, EDITION17_CALENDAR, type CalendarGroup } from '@/data/edition17-calendar';
import { ANALYSIS_BLOCKS } from '@/lib/analysis-recipes';
import { legacyLandingDestination } from '@/lib/landing-navigation';
import { SILICON_LIMITS } from '@/lib/silicon/persona';
import { CATEGORICAL_DARK } from '@/lib/silicon/palette';
import styles from './LandingPage.module.css';

/** Hero showcase: every image is a screenshot of the workbench running on teaching or simulated data. */
const SHOWCASE = [
  { id: 'design', label: '问卷设计', path: '问卷设计', caption: '教学示例「校园服务体验」：题干、变量编码与问卷预览同屏，结构问题实时提示。', alt: '证见问卷设计界面：左侧题目目录，中间编辑题干、变量编码与题型，右侧实时预览问卷。' },
  { id: 'silicon', label: '硅基样本', path: '硅基样本', caption: '离线演示引擎：24 位虚构画像 × 2 个情境，按「等待时长」一题的回答分组站位。', alt: '证见硅基样本界面：三维舞台上的虚构受访者按回答分组站成几圈，附图例与分组选择。' },
  { id: 'analysis', label: '数据分析', path: '数据分析', caption: '读取 12 行模拟数据：记录数、变量、缺失代码与完全重复行逐项检查。', alt: '证见数据分析界面：模拟数据的读取检查，显示已读取记录、变量列、缺失比例与重复行。' },
  { id: 'editor', label: '报告与 PPT', path: '报告与 PPT', caption: '章节目录、正文编辑与 A4 实时预览；报告可导出 Word，幻灯片可导出 PPTX。', alt: '证见报告编辑界面：章节目录、章节编辑区和 A4 实时预览。' },
  { id: 'defense', label: '路演答辩', path: '路演与答辩', caption: '13 个追问主题逐一演练：先答问题，再定位证据，最后计时彩排。', alt: '证见路演与答辩界面：左侧追问主题列表，右侧当前主题的回答要点。' },
] as const;
type ShowcaseId = typeof SHOWCASE[number]['id'];

const STATS = [
  { value: 12, unit: '个阶段', label: '从立项到提交的项目工作流' },
  { value: 9, unit: '道门禁', label: '任一未通过，即为 No-Go' },
  { value: SILICON_LIMITS.personas, unit: '位', label: '单次运行的硅基受访者上限' },
  { value: awardCaseLibraryStats.total, unit: '条', label: '获奖案例索引，来源逐条标注' },
] as const;

const METHODS = ['问卷设计', '跳转与答案传递', '变量字典', '硅基预测试', '多模型交叉检验', '数据质量检查', '频数与比例', '分组描述', '交叉表与 Cramér V', 'Pearson 相关', 'Spearman 秩相关', '报告分镜', 'Word 与 PPTX 导出', '答辩追问演练', '规则锁定', '九道质量门禁'] as const;

const FEATURES = [
  { id: 'design', area: 'design', icon: 'form', title: '问卷设计', text: '研究问题、题项、变量与计划分析逐一对齐。跳转可以预演，结构问题实时提示。', href: '/workspace#design', image: 'crop-design', alt: '问卷设计界面截图' },
  { id: 'silicon', area: 'silicon', icon: 'persona', title: '硅基样本', text: '让 AI 扮演设定人群预答问卷，在真人作答前找出表述、选项与跳转问题。', href: '#silicon', image: 'crop-stage', alt: '硅基样本三维舞台截图' },
  { id: 'analysis', area: 'analysis', icon: 'chart', title: '数据分析', text: `读取 CSV，先查缺失与重复；${ANALYSIS_BLOCKS.length} 个可组合的分析模块，各自写明适用边界。`, href: '/workspace#analysis', image: 'crop-analysis', alt: '数据分析读取检查截图' },
  { id: 'editor', area: 'editor', icon: 'doc', title: '报告与 PPT', text: '章节编辑与 A4 实时预览，由报告分镜编排幻灯片，导出 Word 与 PPTX。', href: '/workspace#editor', image: 'crop-editor', alt: '报告编辑与预览截图' },
  { id: 'cases', area: 'cases', icon: 'book', title: '获奖案例库', text: `${awardCaseLibraryStats.total} 条案例索引，官方公告核验与用户陈述分开标注。`, href: '/workspace#cases', image: 'crop-cases', alt: '获奖案例库截图' },
  { id: 'rules', area: 'rules', icon: 'shield', title: '规则与门禁', text: '按届次、组别、赛区、赛道与阶段锁定规则，每条附来源与核验日期。', href: '/workspace#rules', image: 'crop-rules', alt: '规则匹配界面截图' },
  { id: 'defense', area: 'defense', icon: 'route', title: '路演与答辩', text: '13 个追问主题，按主题演练、定位证据、计时彩排。', href: '/workspace#defense', image: 'crop-defense', alt: '路演与答辩界面截图' },
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

const ORIGINS = [
  { era: '商 · 甲骨', glyph: '卜', title: '先问，后验。', text: '卜辞的最后一部分「验辞」记下事情是否应验：问题与结果刻在同一片甲骨上。', now: '先写清决策问题和待验证的判断，结论出来后回到原问题逐条核对。' },
  { era: '春秋 ·《论语》', glyph: '徵', title: '文献不足，不下断语。', text: '孔子能讲夏、殷之礼，却因杞、宋的典籍与贤人不足为证而不下定论。', now: '资料不足时标为「未知」并列入待补材料，不替你补写数据、受访者或引用。' },
  { era: '东汉 ·《说文》', glyph: '灋', title: '平之如水，触不直者去之。', text: '古文「法」从水、从廌、从去：传说獬豸能辨曲直，以角触理亏的一方。', now: '把 AI 合成的材料冒充真实田野或数据，会被判为致命问题，无法进入最终交付。' },
  { era: '清 · 考据学', glyph: '證', title: '凡立一义，必凭证据。', text: '乾嘉学者一字一义都要找到出处；梁启超把这种学风归纳为几条研究规范。', now: '每条结论登记进证据台账，规则与案例附官方来源，可逐条回查。' },
] as const;

const PRINCIPLES = [
  ['独立、非官方', '证见是独立的研究辅助工具，与正大杯主办方、承办方及冠名单位没有隶属、授权或合作关系。'],
  ['不编造任何证据', '不虚构田野、受访者、数据、引用、模型输出、奖项或评委意见。'],
  ['模拟不等于调查', '硅基样本的回答一律标记为模拟数据，只用于预测试，不能填补或扩充真实样本。'],
  ['规则都有出处', '赛程与规则摘自官方通知并记录核验日期；新文件发布后须重新核验。'],
] as const;

/** Pages from a user-supplied 第十六届 report (corpus CASE-NEW-BLUE-COLLAR); its award is user-attested. The cover is left out. */
const CASE_REPORT = '脱下“长衫”之后——武汉市高校毕业生新蓝领群体就业选择、分层画像与成长支持路径研究';
const CASE_PAGES = [
  { id: 'abstract', step: 'Q', name: '问题', page: 1, title: '摘要', text: '先划清人群边界：武汉市毕业五年内、从事新蓝领工作的高校毕业生。', alt: '报告摘要页：研究背景、研究对象、研究设计与主要发现。' },
  { id: 'chain', step: '链', name: '方法', page: 16, title: '表 2 递进式证据链', text: '特征识别、需求诊断、群体分层、机制解释、文本验证，每一环写明方法、要回答的问题与输出。', alt: '报告第 16 页：表 2 递进式证据链分析说明，列出每个证据环节的方法组合、解决的问题和输出。' },
  { id: 'sampling', step: 'D', name: '数据', page: 22, title: '抽样方案设计', text: '以分层配额抽样为主，区域样本量按自建的潜在规模指数分配；最终 821 份有效问卷，另有 12 名个案访谈。', alt: '报告第 22 页：问卷修改记录与抽样方法的选择。' },
  { id: 'personas', step: 'I', name: '洞察', page: 41, title: 'LPA 剖面图人物画像', text: '三类潜在剖面：生存挣扎型 53.5%、积极进取型 35.8%、佛系过渡型 10.7%。', alt: '报告第 41 页：LPA 三大潜在剖面中心表与三类人物画像图。' },
  { id: 'paths', step: 'A', name: '行动', page: 62, title: '分类支持路径', text: '三类人群各对应一套支持路径，再落到市级统筹、区级落地与平台参与。', alt: '报告第 62 页：高校毕业生新蓝领分类支持路径图与对策建议。' },
] as const;
type CasePage = typeof CASE_PAGES[number];

const verifiedCases = awardCases.filter(item => item.verification === 'official_verified');
const caseRows = [verifiedCases.filter((_, i) => i % 2 === 0), verifiedCases.filter((_, i) => i % 2 === 1)];

const subscribeNothing = () => () => {};
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
const formatDate = (iso: string) => `${+iso.slice(5, 7)}月${+iso.slice(8, 10)}日`;
const formatYearDate = (iso: string) => `${iso.slice(0, 4)}年${formatDate(iso)}`;
const formatRange = (start: string | undefined, end: string) => start ? `${formatDate(start)} – ${formatDate(end)}` : formatDate(end);

function subscribeReducedMotion(listener: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
const reducedMotionSnapshot = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Icon({ kind }: { kind: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'form' ? <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></> :
      kind === 'persona' ? <><circle cx="9" cy="7" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="8.5" r="2.2"/><path d="M16 14.2c2.9.3 5 2.6 5 5.8"/></> :
      kind === 'chart' ? <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></> :
      kind === 'doc' ? <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6M8 13h8M8 17h6"/></> :
      kind === 'book' ? <><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z"/><path d="M12 5v15"/></> :
      kind === 'shield' ? <><path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></> :
      <><circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9"/></>}
  </svg>;
}

/** Counts up once when first visible; the final value is what renders without scripts. */
function CountUp({ value, animate }: { value: number; animate: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !animate || typeof IntersectionObserver === 'undefined') return;
    let raf = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 1400);
        node.textContent = String(Math.round(value * (1 - Math.pow(1 - t, 3))));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    observer.observe(node);
    return () => { observer.disconnect(); cancelAnimationFrame(raf); node.textContent = String(value); };
  }, [value, animate]);
  return <span ref={ref}>{value}</span>;
}

function Persona({ hue }: { hue: string }) {
  return <svg viewBox="0 0 28 40" width="28" height="40" aria-hidden="true">
    <ellipse cx="14" cy="38" rx="9" ry="2" fill="#000" opacity=".35"/>
    <path d="M6 37c0-9 2-17 8-17s8 8 8 17Z" fill={hue}/>
    <path d="M10 22c1.2-1.4 2.5-2 4-2s2.8.6 4 2" stroke="#fff" strokeOpacity=".35" fill="none"/>
    <circle cx="14" cy="12" r="7.5" fill="#e8eef3"/>
    <path d="M6.6 10.5C7.5 6 10.5 4.2 14 4.2s6.5 1.8 7.4 6.3c-2.2-1.6-4.6-2.3-7.4-2.3s-5.2.7-7.4 2.3Z" fill="#2b2f3a"/>
    <circle cx="11.3" cy="12.8" r="1.1" fill="#0d1c2c"/><circle cx="16.7" cy="12.8" r="1.1" fill="#0d1c2c"/>
  </svg>;
}

/** Decorative orbit: one ring per model, figures riding upright on each ring around the questionnaire. */
function SiliconOrbit() {
  const rings = [{ r: 21, n: 5, dur: 46 }, { r: 33.5, n: 7, dur: 64 }, { r: 46, n: 9, dur: 82 }];
  let k = 0;
  return <div className={styles.orbit} aria-hidden="true">
    <div className={styles.orbitPlane}>
      {rings.map((ring, ri) => <div key={ring.r} className={styles.orbitRing} style={{ '--r': `${ring.r}cqi`, '--dur': `${ring.dur}s` } as CSSProperties}>
        <span className={styles.orbitTrack}/>
        {Array.from({ length: ring.n }, (_, i) => {
          const hue = CATEGORICAL_DARK[k++ % CATEGORICAL_DARK.length];
          return <span key={i} className={styles.orbitSlot} style={{ '--a': `${(360 / ring.n) * i + ri * 17}deg` } as CSSProperties}>
            <span className={styles.orbitFigure}><Persona hue={hue}/></span>
          </span>;
        })}
        <span className={styles.orbitLabel} style={{ '--a': `${-35 - ri * 22}deg` } as CSSProperties}><span>模型 {ri + 1}</span></span>
      </div>)}
    </div>
    <div className={styles.orbitCore}><span>问卷</span><small>Q1 — Q8</small></div>
    <span className={styles.orbitChip} data-pos="a">情境 · 平日午间</span>
    <span className={styles.orbitChip} data-pos="b">情境 · 晚间高峰</span>
    <span className={styles.orbitChip} data-pos="c" data-tone="gold">模拟 ≠ 调查</span>
  </div>;
}

function Showcase({ autoplay }: { autoplay: boolean }) {
  const [active, setActive] = useState<ShowcaseId>('silicon');
  const [manual, setManual] = useState(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const index = SHOWCASE.findIndex(item => item.id === active);
  const current = SHOWCASE[index];
  const choose = (id: ShowcaseId, focus = false) => { setActive(id); setManual(true); if (focus) tabRefs.current[id]?.focus(); };
  const advance = () => setActive(SHOWCASE[(index + 1) % SHOWCASE.length].id);
  const running = autoplay && !manual;
  return <div className={styles.showcase} data-autoplay={running}>
    <div className={styles.tabs} role="tablist" aria-label="工作台模块">
      {SHOWCASE.map((item, i) => <button key={item.id} ref={node => { tabRefs.current[item.id] = node; }} type="button" role="tab" id={`showcase-tab-${item.id}`} aria-controls="showcase-panel" aria-selected={active === item.id} tabIndex={active === item.id ? 0 : -1}
        onClick={() => choose(item.id)}
        onKeyDown={event => {
          const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
          if (event.key === 'Home') { event.preventDefault(); choose(SHOWCASE[0].id, true); }
          else if (event.key === 'End') { event.preventDefault(); choose(SHOWCASE[SHOWCASE.length - 1].id, true); }
          else if (step) { event.preventDefault(); choose(SHOWCASE[(i + step + SHOWCASE.length) % SHOWCASE.length].id, true); }
        }}>
        {item.label}
        {running && active === item.id && <i className={styles.tabProgress} onAnimationEnd={advance} aria-hidden="true"/>}
      </button>)}
    </div>
    <div className={styles.stageWrap}>
      <div className={styles.horizon} aria-hidden="true"/>
      <div id="showcase-panel" role="tabpanel" aria-labelledby={`showcase-tab-${active}`} className={styles.window}>
        <div className={styles.windowBar} aria-hidden="true"><i/><i/><i/><span>证见工作台 · {current.path}</span></div>
        <div className={styles.windowBody}>
          {SHOWCASE.map((item, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- static, pre-sized screenshots with responsive sources
            <img key={item.id} src={`/landing/app-${item.id}-1600.webp`} srcSet={`/landing/app-${item.id}-960.webp 960w, /landing/app-${item.id}-1600.webp 1600w`} sizes="(max-width: 1180px) 94vw, 1120px" width={1600} height={1000}
              alt={active === item.id ? item.alt : ''} aria-hidden={active !== item.id} data-active={active === item.id} loading={i === 1 ? 'eager' : 'lazy'} decoding="async" fetchPriority={i === 1 ? 'high' : 'auto'}/>
          ))}
        </div>
        <p className={styles.windowCaption}><span className={styles.realTag}>真实界面 · 示例数据</span>{current.caption}</p>
      </div>
      <div className={`${styles.float} ${styles.floatA}`} aria-hidden="true"><b>Q → D → I → A</b><span>每条结论都能回到原问题</span></div>
      <div className={`${styles.float} ${styles.floatB}`} aria-hidden="true"><b><i className={styles.dotGold}/>模拟 ≠ 调查</b><span>硅基回答一律标记为模拟数据</span></div>
      <div className={`${styles.float} ${styles.floatC}`} aria-hidden="true"><b>9 道门禁</b><span className={styles.gateDots}>{GATES.map(([seal]) => <i key={seal}>{seal}</i>)}</span></div>
    </div>
  </div>;
}

function Calendar() {
  const today = useSyncExternalStore(subscribeNothing, localToday, () => null);
  const [group, setGroup] = useState<CalendarGroup>('undergrad');
  const entries = calendarFor(group, today ?? '2000-01-01');
  const next = today ? entries.find(entry => entry.state !== 'past') : entries[0];
  const countdown = today && next ? (next.daysLeft === 0 ? { value: '今天', unit: '' } : { value: String(next.daysLeft), unit: next.state === 'current' ? '天后结束' : next.kind === 'deadline' ? '天后截止' : next.kind === 'window' ? '天后开始' : '天后' }) : null;
  const yearOf = (index: number) => (entries[index].start ?? entries[index].end).slice(0, 4);
  return <div className={styles.calendar}>
    <div className={styles.groupPills} role="group" aria-label="选择组别">
      {(Object.keys(CALENDAR_GROUPS) as CalendarGroup[]).map(key => <button key={key} type="button" aria-pressed={group === key} onClick={() => setGroup(key)}>{CALENDAR_GROUPS[key]}</button>)}
    </div>
    <div className={styles.calendarGrid}>
      <div className={styles.nextCard} aria-live="polite">
        {next ? <>
          <span className={styles.nextLabel}>{!today ? CALENDAR_GROUPS[group] : next.state === 'current' ? '正在进行' : '下一项'}</span>
          {countdown && <p className={styles.nextCount}><b className={styles.gradientText}>{countdown.value}</b>{countdown.unit}</p>}
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

function CaseStudy() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<CasePage | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    if (!dialog.open) dialog.showModal();
    const close = () => setOpen(null);
    dialog.addEventListener('close', close);
    return () => dialog.removeEventListener('close', close);
  }, [open]);
  return <>
    <ol className={styles.casePages}>
      {CASE_PAGES.map((page, index) => <li key={page.id} style={{ '--i': index } as CSSProperties} data-reveal>
        <button type="button" className={styles.casePage} onClick={() => setOpen(page)}>
          <span className={styles.caseStep} data-step={page.step}>{page.step}<small>{page.name}</small></span>
          <span className={styles.srOnly}>放大查看第 {page.page} 页：{page.title}</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized page renders */}
          <img src={`/landing/case-${page.id}-560.webp`} width={560} height={791} alt="" loading="lazy" decoding="async"/>
        </button>
        <p className={styles.casePageMeta}>第 {page.page} 页 · {page.title}</p>
        <p className={styles.casePageText}>{page.text}</p>
      </li>)}
    </ol>
    <dialog ref={dialogRef} className={styles.caseDialog} aria-label={open ? `第 ${open.page} 页：${open.title}` : '报告页面'} onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
      {open && <figure>
        {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized page render */}
        <img src={`/landing/case-${open.id}-1240.webp`} width={1240} height={1753} alt={open.alt}/>
        <figcaption><b>{open.step} · {open.name}</b>第 {open.page} 页 · {open.title}<button type="button" onClick={() => dialogRef.current?.close()}>关闭</button></figcaption>
      </figure>}
    </dialog>
  </>;
}

function CaseCard({ item }: { item: typeof verifiedCases[number] }) {
  return <article className={styles.caseCard}>
    <span className={styles.caseAward}>{item.award}</span>
    <h3>{item.title}</h3>
    <p>{item.institution} · {item.edition} · {item.group}</p>
    <span className={styles.caseSource}>官方来源已核验</span>
  </article>;
}

export default function LandingPage() {
  const auth = useHostedSession();
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [paused, setPaused] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const motion = mounted && !reducedMotion && !paused;
  const signedIn = !!auth.session?.authenticated;
  const loginHref = signedIn ? '/projects' : '/login';

  useEffect(() => {
    const go = () => { const destination = legacyLandingDestination(window.location.hash); if (destination) window.location.replace(destination); };
    go();
    window.addEventListener('hashchange', go);
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('hashchange', go); window.removeEventListener('scroll', onScroll); };
  }, []);

  useEffect(() => {
    // Sections reveal once; content stays visible when scripts or observers are unavailable.
    if (!mounted || reducedMotion || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { (entry.target as HTMLElement).dataset.seen = 'true'; observer.unobserve(entry.target); }
    }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
    for (const node of rootRef.current?.querySelectorAll<HTMLElement>('[data-reveal]') ?? []) if (node.dataset.seen !== 'true') observer.observe(node);
    return () => observer.disconnect();
  }, [mounted, reducedMotion]);

  useEffect(() => {
    // A soft spotlight follows fine pointers across cards.
    const root = rootRef.current;
    if (!root || !mounted || reducedMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const move = (event: PointerEvent) => {
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-spot]') : null;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--sx', `${event.clientX - rect.left}px`);
      card.style.setProperty('--sy', `${event.clientY - rect.top}px`);
    };
    root.addEventListener('pointermove', move, { passive: true });
    return () => root.removeEventListener('pointermove', move);
  }, [mounted, reducedMotion]);

  return <div ref={rootRef} className={styles.landing} data-landing="product" data-reveal={mounted && !reducedMotion ? 'on' : 'off'} data-motion={motion ? 'on' : 'off'} data-scrolled={scrolled}>
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
        </nav>
        <div className={styles.headerActions}>
          <Link href={loginHref} className={styles.textLink}>{signedIn ? '我的项目' : '登录'}</Link>
          <Link href="/workspace" className={styles.buttonSmall}>进入工作台</Link>
        </div>
      </div>
    </header>

    <main>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroBackdrop} aria-hidden="true"><i className={styles.blobA}/><i className={styles.blobB}/><i className={styles.blobC}/><span className={styles.heroGrid}/><span className={styles.dust}/></div>
        <div className={styles.heroCopy}>
          <a href="#calendar" className={styles.badge}><span className={styles.badgeDot} aria-hidden="true"/>第十七届赛程已同步<span className={styles.badgeSep} aria-hidden="true"/>{EDITION17_CALENDAR.source.documentNumber}<span aria-hidden="true">→</span></a>
          <h1 id="hero-title" className={styles.heroTitle}>让每个问题，<br/><span className={styles.gradientText}>都循证抵达行动</span></h1>
          <p className={styles.heroLead}>面向正大杯参赛团队的 AI 研究工作台。问卷设计、硅基样本预测试、数据分析、报告与答辩，都在同一条证据链上完成。</p>
          <div className={styles.heroActions}>
            <Link href="/workspace" className={styles.buttonPrimary}>免登录试用工作台<span aria-hidden="true">↗</span></Link>
            <Link href={loginHref} className={styles.buttonGhost}>{signedIn ? '继续我的研究' : '登录团队项目'}</Link>
          </div>
          <dl className={styles.stats}>
            {STATS.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd><CountUp value={stat.value} animate={mounted && !reducedMotion}/><small>{stat.unit}</small></dd></div>)}
          </dl>
        </div>
        <Showcase autoplay={motion}/>
      </section>

      <section className={styles.marqueeBand} aria-label="支持的研究方法">
        <p>一个工作台，覆盖正大杯研究的每个环节</p>
        <div className={styles.marquee}>
          <ul>{METHODS.map(method => <li key={method}>{method}</li>)}</ul>
          <ul aria-hidden="true">{METHODS.map(method => <li key={method}>{method}</li>)}</ul>
        </div>
      </section>

      <section id="features" className={styles.section} aria-labelledby="features-title">
        <div className={styles.sectionHead} data-reveal>
          <p className={styles.kicker}>功能</p>
          <h2 id="features-title">从选题到答辩，<span className={styles.gradientText}>一个工作台就够</span></h2>
          <p>每个模块都能单独使用，也能把结果交给下一步：问卷送进分析，分析结论进入报告，报告分镜生成 PPT。</p>
        </div>
        <ul className={styles.bento}>
          {FEATURES.map(feature => <li key={feature.id} className={styles.bentoCard} data-area={feature.area} data-spot data-reveal>
            <Link href={feature.href} className={styles.bentoLink}>
              <span className={styles.bentoIcon}><Icon kind={feature.icon}/></span>
              <h3>{feature.title}<span aria-hidden="true">↗</span></h3>
              <p>{feature.text}</p>
              <span className={styles.bentoShot}>
                {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized interface crops */}
                <img src={`/landing/${feature.image}.webp`} alt={feature.alt} width={1200} height={650} loading="lazy" decoding="async"/>
              </span>
            </Link>
          </li>)}
        </ul>
      </section>

      <section id="chain" className={styles.section} aria-labelledby="chain-title">
        <div className={styles.chainCard} data-reveal>
          <div className={styles.chainGlow} aria-hidden="true"/>
          <div className={styles.sectionHead}>
            <p className={styles.kicker}>证据链</p>
            <h2 id="chain-title">问题、数据、洞察、行动，<br/>一环扣一环</h2>
          </div>
          <div className={styles.chainTrack}>
          <span className={styles.chainLine} aria-hidden="true"><i/></span>
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
        <div className={styles.splitCopy} data-reveal>
          <p className={styles.kicker}>硅基样本</p>
          <h2 id="silicon-title">真人作答之前，<br/><span className={styles.gradientText}>先让 AI 替你答一遍</span></h2>
          <p className={styles.lead}>给 AI 设定身份与情境，扮演虚构受访者预答问卷，提前找出表述不清、选项缺失和跳转错误。</p>
          <dl className={styles.factGrid}>
            {SILICON_FACTS.map(([value, unit, text]) => <div key={unit}><dt><b>{value}</b>{unit}</dt><dd>{text}</dd></div>)}
          </dl>
          <p className={styles.caution}><i className={styles.dotGold} aria-hidden="true"/>模拟回答只用于预测试，不是调查数据，不能填补或扩充真实样本。</p>
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
          <h2 id="calendar-title">关键日期，<span className={styles.gradientText}>按组别一眼看清</span></h2>
          <p>日期摘自第十七届总通知，按你的组别排好顺序；进入工作台后，概览页会持续提醒。</p>
        </div>
        <div data-reveal><Calendar/></div>
      </section>

      <section id="awards" className={styles.section} aria-labelledby="awards-title">
        <div className={styles.sectionHead} data-reveal>
          <p className={styles.kicker}>获奖案例</p>
          <h2 id="awards-title">只呈现<span className={styles.gradientText}>可以核验</span>的部分</h2>
          <p>{awardCaseLibraryStats.officialVerified} 条案例的题名、学校、组别、奖项和届次已由主办方或高校官网公告核验；未公开的方法、样本与评委意见一律不推断。</p>
        </div>
        <div className={styles.caseMarquee} data-reveal>
          {caseRows.map((row, ri) => <div key={ri} className={styles.caseRow} data-reverse={ri === 1}>
            <ul>{row.map(item => <li key={item.id}><CaseCard item={item}/></li>)}</ul>
            <ul aria-hidden="true" inert>{row.map(item => <li key={item.id}><CaseCard item={item}/></li>)}</ul>
          </div>)}
        </div>
        <p className={styles.sectionFoot} data-reveal>精选索引，非全量榜单，不能据此推断选题偏好或获奖概率。<Link href="/workspace#cases">打开获奖案例库 ↗</Link></p>
      </section>

      <section id="deep-read" className={styles.section} aria-labelledby="deep-read-title">
        <div className={styles.sectionHead} data-reveal>
          <p className={styles.kicker}>案例深读</p>
          <h2 id="deep-read-title">一份报告，<span className={styles.gradientText}>怎样把证据链走完</span></h2>
          <p>《{CASE_REPORT}》是用户提供的第十六届参赛报告，奖项为用户陈述，尚未与官方公告核对。我们挑出五页，对照 Q → D → I → A 看它如何组织证据。</p>
        </div>
        <CaseStudy/>
      </section>

      <section id="modules" className={styles.section} aria-labelledby="modules-title">
        <div className={styles.sectionHead} data-reveal>
          <p className={styles.kicker}>分析模块</p>
          <h2 id="modules-title">像搭积木一样组合分析，<br/><span className={styles.gradientText}>每块都写明边界</span></h2>
        </div>
        <ul className={styles.modules}>
          {ANALYSIS_BLOCKS.map((block, index) => <li key={block.id} data-spot data-reveal style={{ '--i': index } as CSSProperties}>
            <span className={styles.moduleTag}>{block.tag}</span>
            <h3>{block.title}</h3>
            <p>{block.use}</p>
            <p className={styles.moduleBoundary}><b>边界</b>{block.boundary}</p>
          </li>)}
        </ul>
      </section>

      <section id="origins" className={`${styles.section} ${styles.origins}`} aria-labelledby="origins-title">
        <div className={styles.originsHead} data-reveal>
          <div className={styles.sectionHead}>
            <p className={styles.kicker}>无征不信</p>
            <h2 id="origins-title">三千年来，可信的判断<br/>都从证据开始</h2>
            <p>《礼记·中庸》：“上焉者虽善无征，无征不信，不信民弗从。”证见把这条古老的准则，带进每一次市场调查。</p>
          </div>
          <figure className={styles.mascot}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized derivative of the approved brand anchor */}
            <img src="/brand/evi-x-character-anchor-v2-960.webp" width={960} height={640} loading="lazy" decoding="async" alt="獬见：深蓝色幼年獬豸，头顶一根带四个发光节点的金色独角，胸前有青金棱镜。"/>
            <figcaption>守证灵兽「獬见」：独角上的四个节点，依次代表问题、数据、洞察、行动。<small>AI 辅助生成、经人工验收的原创概念角色</small></figcaption>
          </figure>
        </div>
        <ol className={styles.eras}>
          {ORIGINS.map(origin => <li key={origin.era} data-spot data-reveal>
            <span className={styles.eraGlyph} aria-hidden="true">{origin.glyph}</span>
            <span className={styles.eraName}>{origin.era}</span>
            <h3>{origin.title}</h3>
            <p>{origin.text}</p>
            <p className={styles.eraNow}><b>今天</b>{origin.now}</p>
          </li>)}
        </ol>
      </section>

      <section id="principles" className={styles.section} aria-labelledby="principles-title">
        <div className={styles.sectionHead} data-reveal>
          <p className={styles.kicker}>学术诚信</p>
          <h2 id="principles-title">我们的立场</h2>
        </div>
        <ul className={styles.principles}>
          {PRINCIPLES.map(([title, text], index) => <li key={title} data-reveal style={{ '--i': index } as CSSProperties}><span aria-hidden="true">0{index + 1}</span><h3>{title}</h3><p>{text}</p></li>)}
        </ul>
      </section>

      <section id="start" className={styles.cta} aria-labelledby="start-title">
        <div className={styles.ctaGlow} aria-hidden="true"/>
        <div className={styles.sectionHead} data-reveal>
          <p className={styles.kicker}>问有据，见有策</p>
          <h2 id="start-title">下一段证据，<br/><span className={styles.gradientText}>从你的问题开始</span></h2>
        </div>
        <ul className={styles.ctaCards}>
          <li data-spot data-reveal><Link href="/workspace"><b>免登录工作台</b><span>问卷、硅基样本、数据分析与报告编辑，打开即用。</span><i aria-hidden="true">↗</i></Link></li>
          <li data-spot data-reveal><Link href={loginHref}><b>{signedIn ? '我的项目' : '团队项目'}</b><span>邮箱登录后与队友协作，保存问卷提案与云端版本。</span><i aria-hidden="true">↗</i></Link></li>
          <li data-spot data-reveal><Link href="/explore"><b>了解证见</b><span>动手试一遍交互演示，看看常见问题。</span><i aria-hidden="true">↗</i></Link></li>
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
      <p className={styles.disclaimer}>证见 EVI-X 为独立研究辅助工具，非“正大杯”赛事官方产品，与赛事主办方、承办方及冠名单位无隶属、授权或合作关系。</p>
      <p>界面截图来自证见工作台，使用教学示例问卷与模拟数据；硅基样本示意动画由代码生成，不代表任何调查结果。案例深读页面来自用户提供的参赛报告，版权归原作者。</p>
      <p>引文出处：《礼记·中庸》；《论语·八佾》；许慎《说文解字》；梁启超《清代学术概论》。历史一节为概念性叙事。</p>
      <span className={styles.wordmark} aria-hidden="true">EVI-X</span>
    </footer>

    {mounted && !reducedMotion && <button type="button" className={styles.pause} aria-pressed={paused} onClick={() => setPaused(!paused)} aria-label={paused ? '继续动效' : '暂停动效'} title={paused ? '继续动效' : '暂停动效'}>
      {paused ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 7 5-7 5Z" fill="currentColor"/></svg> : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="2"/></svg>}
    </button>}
  </div>;
}
