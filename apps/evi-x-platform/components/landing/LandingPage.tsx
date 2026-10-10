"use client";

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import BrandMark from '@/components/brand/BrandMark';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { legacyLandingDestination } from '@/lib/landing-navigation';
import { chronicleProgress, chronicleStage, CHRONICLE_LAST_STAGE } from '@/lib/landing-chronicle';
import styles from './LandingPage.module.css';

const ChronicleScene = dynamic(() => import('./ChronicleScene'), { ssr: false });

/** Rail entries; the closing call-to-action (stage 6) belongs to 今. */
const ERAS = [
  { id: 'prologue', mark: '序', label: '序章', year: '' },
  { id: 'era-oracle', mark: '商', label: '商 · 甲骨', year: '前1300' },
  { id: 'era-documents', mark: '春秋', label: '春秋 · 文献', year: '前500' },
  { id: 'era-xiezhi', mark: '东汉', label: '东汉 · 獬豸', year: '100' },
  { id: 'era-kaoju', mark: '清', label: '清 · 考据', year: '1750' },
  { id: 'era-now', mark: '今', label: '今 · 证见', year: '2026' },
] as const;

const MAXIMS = ['无征不信', '文献不足，不下断语', '令触不直', '凡立一义，必凭证据', '孤证不为定说', '实事求是', '问有据，见有策'] as const;

const ORACLE_PARTS = [
  ['叙辞', '何日、何人来问'],
  ['命辞', '要问的事'],
  ['占辞', '视兆后的判断'],
  ['验辞', '事后是否应验'],
] as const;

const SLIPS = ['子曰夏禮吾能言之', '杞不足徵也', '殷禮吾能言之', '宋不足徵也', '文獻不足故也', '足則吾能徵之矣'] as const;

const FA_PARTS = [
  ['氵', '从水', '平之如水'],
  ['廌', '从廌', '触不直者'],
  ['去', '从去', '去之'],
] as const;

const KAOJU = [
  ['凡立一义', '必凭证据', '每条结论登记进证据台账：主张、来源、处理、方法、结果、限制与建议逐项对应。'],
  ['孤证不为', '定说', '制作与复核分离：交付物须由另一名复核人独立批准，批准绑定文件版本与哈希。'],
  ['隐匿曲解', '皆认为不德', '不虚构受访者、数据与引用；不把相关包装成因果。'],
  ['凡采用旧说', '必明引之', '规则与案例附官方来源，本地来源文件绑定 SHA‑256，可逐条回查。'],
] as const;

const KAOJU_FULL = ['凡立一义，必凭证据。', '孤证不为定说。', '隐匿证据或曲解证据，皆认为不德。', '凡采用旧说，必明引之。'] as const;

const QDIA = [
  ['Q', '问题', '先锁定届次、组别、赛区、赛道与阶段，再写清决策主体与研究问题。'],
  ['D', '数据', '问卷、抽样与数据审计在同一条链上，每份数据记录来源与清洗决定。'],
  ['I', '洞察', '方法与研究设计对齐，区分描述、相关与因果，不以复杂代替有效。'],
  ['A', '行动', '每条建议写明依据、责任人、优先级与衡量指标。'],
] as const;

const GATES = [['规', '规则'], ['问', '问题'], ['设', '设计'], ['田', '田野'], ['数', '数据'], ['推', '推断'], ['行', '行动'], ['视', '视觉'], ['交', '提交']] as const;

function FallbackRing() {
  return <svg viewBox="0 0 400 400" className={styles.fallbackRing} aria-hidden="true">
    <defs><radialGradient id="evx-corona" r="0.5"><stop offset="0.74" stopColor="#f4b942" stopOpacity="0"/><stop offset="0.8" stopColor="#f4b942" stopOpacity="0.16"/><stop offset="1" stopColor="#f4b942" stopOpacity="0"/></radialGradient></defs>
    <circle cx="200" cy="200" r="200" fill="url(#evx-corona)"/>
    <g fill="none" stroke="#f4b942"><circle cx="200" cy="200" r="160" strokeWidth="2"/><circle cx="200" cy="200" r="154" strokeWidth=".6"/><circle cx="200" cy="200" r="130" strokeWidth=".6"/><circle cx="200" cy="200" r="125" strokeWidth="1.6"/><circle cx="200" cy="200" r="142" strokeWidth="5" strokeDasharray="1.2 5.6" strokeLinecap="round"/></g>
  </svg>;
}

function Marquee({ reverse = false }: { reverse?: boolean }) {
  const row = MAXIMS.map(text => <span key={text}>{text}<i/></span>);
  return <div className={styles.marquee} data-reverse={reverse} aria-hidden="true"><div>{row}{row}</div></div>;
}

type Layout = 'art-left' | 'art-right' | 'center';
type ChapterProps = {
  stage: number; id: string; numeral: string; era: string; period: string; tag: string; year: string;
  glyph: string; layout: Layout; title: ReactNode; children: ReactNode;
};

function Chapter({ stage, id, numeral, era, period, tag, year, glyph, layout, title, children }: ChapterProps) {
  return <section id={id} data-stage={stage} data-layout={layout} className={styles.chapter} aria-labelledby={`${id}-title`}>
    <div className={styles.glyphTrack} aria-hidden="true"><span className={styles.glyph}>{glyph}</span></div>
    <span className={styles.bigYear} aria-hidden="true">{year}</span>
    <div className={styles.chapterCopy}>
      <p className={`${styles.plate} ${styles.reveal}`}><span className={styles.numeral}>{numeral}</span><span className={styles.plateEra}>{era}</span><span>{period}</span><span className={styles.plateTag}>{tag}</span></p>
      <h2 id={`${id}-title`} className={`${styles.chapterTitle} ${styles.reveal}`}>{title}</h2>
      {children}
    </div>
  </section>;
}

function Bridge({ children }: { children: ReactNode }) {
  return <aside className={`${styles.bridge} ${styles.reveal}`} data-tilt aria-label="今天，证见这样做"><span>今天，证见这样做</span><p>{children}</p></aside>;
}

/**
 * Fine-pointer effects: a lagging gold aura, a lamp that reveals the research grid, magnetic
 * buttons and tilting cards. All are presentational and skipped for touch and reduced motion.
 */
function usePointerEffects(rootRef: React.RefObject<HTMLDivElement | null>, cursorRef: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!fine.matches) return;
    let x = -100, y = -100, cx = -100, cy = -100, raf = 0;
    let tilt: HTMLElement | null = null, magnet: HTMLElement | null = null, hot = false;
    const releaseTilt = (node: HTMLElement) => { node.dataset.active = 'false'; node.style.setProperty('--rx', '0deg'); node.style.setProperty('--ry', '0deg'); node.style.setProperty('--px', '-60%'); node.style.setProperty('--py', '-60%'); };
    const releaseMagnet = (node: HTMLElement) => { node.style.setProperty('--tx', '0px'); node.style.setProperty('--ty', '0px'); };
    const loop = () => {
      raf = 0;
      cx += (x - cx) * 0.2; cy += (y - cy) * 0.2;
      cursorRef.current?.style.setProperty('transform', `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0)`);
      if (Math.abs(x - cx) > 0.2 || Math.abs(y - cy) > 0.2) raf = requestAnimationFrame(loop);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      x = event.clientX; y = event.clientY;
      root.style.setProperty('--mx', `${x}px`);
      root.style.setProperty('--my', `${y}px`);
      if (root.dataset.cursor !== 'on') { root.dataset.cursor = 'on'; cx = x; cy = y; }
      const target = event.target instanceof Element ? event.target : null;
      const interactive = !!target?.closest('a, button, summary, [data-tilt], [tabindex="0"]');
      if (interactive !== hot) { hot = interactive; root.dataset.cursorHot = String(hot); }
      const nextTilt = target?.closest<HTMLElement>('[data-tilt]') ?? null;
      if (nextTilt !== tilt) { if (tilt) releaseTilt(tilt); tilt = nextTilt; }
      if (tilt) {
        const rect = tilt.getBoundingClientRect();
        const px = (x - rect.left) / rect.width, py = (y - rect.top) / rect.height;
        tilt.dataset.active = 'true';
        tilt.style.setProperty('--rx', `${((0.5 - py) * 7).toFixed(2)}deg`);
        tilt.style.setProperty('--ry', `${((px - 0.5) * 9).toFixed(2)}deg`);
        tilt.style.setProperty('--px', `${(px * 100).toFixed(1)}%`);
        tilt.style.setProperty('--py', `${(py * 100).toFixed(1)}%`);
      }
      const nextMagnet = target?.closest<HTMLElement>('[data-magnetic]') ?? null;
      if (nextMagnet !== magnet) { if (magnet) releaseMagnet(magnet); magnet = nextMagnet; }
      if (magnet) {
        const rect = magnet.getBoundingClientRect();
        magnet.style.setProperty('--tx', `${((x - rect.left - rect.width / 2) * 0.25).toFixed(1)}px`);
        magnet.style.setProperty('--ty', `${((y - rect.top - rect.height / 2) * 0.35).toFixed(1)}px`);
      }
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const leave = () => {
      root.dataset.cursor = 'off';
      if (tilt) releaseTilt(tilt);
      if (magnet) releaseMagnet(magnet);
      tilt = magnet = null;
    };
    const down = (event: PointerEvent) => { if (event.pointerType !== 'touch') root.dataset.cursorPress = 'true'; };
    const up = () => { root.dataset.cursorPress = 'false'; };
    root.dataset.pointer = 'fine';
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', down, { passive: true });
    window.addEventListener('pointerup', up, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    window.addEventListener('blur', leave);
    return () => {
      cancelAnimationFrame(raf);
      leave();
      delete root.dataset.pointer;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      document.documentElement.removeEventListener('pointerleave', leave);
      window.removeEventListener('blur', leave);
    };
  }, [rootRef, cursorRef, enabled]);
}

export default function LandingPage() {
  const auth = useHostedSession();
  const rootRef = useRef<HTMLDivElement>(null), cursorRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0), stageRef = useRef(0);
  const railFillRef = useRef<HTMLSpanElement>(null);
  const [stage, setStage] = useState(0), [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false), [ready, setReady] = useState(false), [mounted, setMounted] = useState(false);
  const loginHref = auth.session?.authenticated ? '/projects' : '/login';
  const startLabel = auth.session?.authenticated ? '继续我的研究' : '开始我的研究';
  const onReady = useCallback((value: boolean) => setReady(value), []);
  const sections = () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>('main > [data-stage]') ?? []);
  usePointerEffects(rootRef, cursorRef, mounted && !reducedMotion);

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
    const nodes = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('main > [data-stage]') ?? []);
    const update = () => {
      frame = 0;
      const viewport = window.innerHeight || 1;
      const boundaries: number[] = [];
      for (let i = 1; i <= CHRONICLE_LAST_STAGE; i++) boundaries.push(nodes[i] ? nodes[i].getBoundingClientRect().top : Number.POSITIVE_INFINITY);
      const progress = chronicleProgress(boundaries, viewport * 0.5, viewport * 0.5);
      progressRef.current = progress;
      if (rootRef.current) rootRef.current.dataset.scrolled = String(window.scrollY > 24);
      if (railFillRef.current) railFillRef.current.style.transform = `scaleY(${Math.min(1, progress / (ERAS.length - 1))})`;
      const next = chronicleStage(progress);
      if (next !== stageRef.current) { stageRef.current = next; setStage(next); }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, []);

  useEffect(() => {
    // Copy reveals once per section; content stays visible when scripts or observers are unavailable.
    if (!mounted || reducedMotion || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { (entry.target as HTMLElement).dataset.seen = 'true'; observer.unobserve(entry.target); }
    }, { threshold: 0.12 });
    for (const node of rootRef.current?.querySelectorAll<HTMLElement>('main > [data-stage]') ?? []) if (node.dataset.seen !== 'true') observer.observe(node);
    return () => observer.disconnect();
  }, [mounted, reducedMotion]);

  const goTo = (index: number) => {
    const node = sections()[index];
    if (!node) return;
    node.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
  };
  const railIndex = Math.min(stage, ERAS.length - 1);

  return <div ref={rootRef} className={styles.landing} data-landing="evidence-journey" data-webgl={ready ? 'ready' : 'fallback'} data-reveal={mounted && !reducedMotion ? 'on' : 'off'} data-reduced-motion={reducedMotion} data-paused={paused} data-stage={stage}>
    <a className={styles.skip} href={loginHref}>跳过旅程，进入证见</a>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="证见 EVI-X 首页"><BrandMark/><strong>证见</strong><span>EVI-X</span></Link>
      <nav aria-label="产品导航">
        <a href="#era-oracle" className={styles.navWide}>循证三千年</a>
        <Link href="/explore">了解证见</Link>
        <Link href="/workspace" className={styles.navWide}>研究工具</Link>
        <Link href={loginHref} className={styles.login} data-magnetic>{auth.session?.authenticated ? '进入项目' : '登录'}<span aria-hidden="true">↗</span></Link>
      </nav>
    </header>

    <div className={styles.sky} aria-hidden="true">
      <div className={styles.halo}/>
      <div className={styles.fallback}><FallbackRing/></div>
      {mounted && <ChronicleScene progressRef={progressRef} paused={paused} reducedMotion={reducedMotion} onReady={onReady}/>}
      <div className={styles.lamp}/>
      <div className={styles.vignette}/>
    </div>
    <div ref={cursorRef} className={styles.cursor} aria-hidden="true"><i/></div>

    <nav className={styles.rail} aria-label="时代索引">
      <span className={styles.railTrack} aria-hidden="true"><span ref={railFillRef} className={styles.railFill}/></span>
      <ol>{ERAS.map((era, index) => <li key={era.id}>
        <button type="button" onClick={() => goTo(index)} aria-current={railIndex === index ? 'step' : undefined} aria-label={`前往${era.label}`}>
          <span className={styles.railYear}>{era.year}</span><span className={styles.railMark}>{era.mark}</span>
        </button>
      </li>)}</ol>
    </nav>
    <button type="button" className={styles.pause} aria-pressed={paused || reducedMotion} disabled={reducedMotion} onClick={() => setPaused(!paused)} title={reducedMotion ? '已按系统设置减少动态效果' : paused ? '继续动效' : '暂停动效'} aria-label={reducedMotion ? '已按系统设置减少动态效果' : paused ? '继续动效' : '暂停动效'}>
      {paused || reducedMotion ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 7 5-7 5Z" fill="currentColor"/></svg> : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="2"/></svg>}
    </button>

    <main>
      <section id="prologue" data-stage={0} className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroInner}>
          <p className={styles.kicker}><span>证见 EVI-X</span><i aria-hidden="true"/>市场调查与分析 AI 工作台</p>
          <h1 id="hero-title" className={styles.heroTitle}><span>无</span><span>征</span><span>不</span><span>信</span></h1>
          <p className={styles.heroSource}>《礼记·中庸》：“上焉者虽善无征，无征不信，不信民弗从。”</p>
          <p className={styles.heroLead}>从甲骨上的验辞，到今天的问卷与数据：三千年来，可信的判断都从证据开始。证见把这条古老的准则，带进每一次市场调查。</p>
          <div className={styles.actions}>
            <Link href={loginHref} className={styles.primary} data-magnetic>{startLabel}<span aria-hidden="true">↗</span></Link>
            <a href="#era-oracle" className={styles.ghost} data-magnetic>循证三千年<span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <p className={styles.heroHint} aria-hidden="true"><span>移动鼠标拨开金尘 · 点击泛起涟漪</span></p>
        <p className={styles.heroFoot} aria-hidden="true"><span>约公元前 1300</span><i/><span>2026</span></p>
      </section>

      <Marquee/>

      <Chapter stage={1} id="era-oracle" layout="art-left" numeral="壹" era="商" period="约公元前13—前11世纪" tag="殷墟甲骨" year="−1300" glyph="卜" title={<>先问，<br/>后验。</>}>
        <blockquote className={`${styles.quote} ${styles.reveal}`}><p>貞，卜問也。</p><cite>许慎《说文解字》</cite></blockquote>
        <p className={`${styles.body} ${styles.reveal}`}>商代王室遇事占卜：先在龟甲兽骨的背面钻凿，再灼烧出裂纹，称为「卜兆」，据此判断吉凶，并把所问之事刻在卜兆旁。一条完整的卜辞通常有四个部分，最后的「验辞」记下事情是否应验——问题与结果刻在同一片甲骨上，三千年后仍可回查。</p>
        <ol className={`${styles.oracleParts} ${styles.reveal}`} aria-label="卜辞的四个部分">{ORACLE_PARTS.map(([name, meaning], index) => <li key={name} tabIndex={0}><em>0{index + 1}</em><strong>{name}</strong><span>{meaning}</span></li>)}</ol>
        <Bridge>先锁定届次、组别、赛区、赛道与阶段，再写清决策问题和待验证的判断；结论出来后，回到原问题逐条核对。</Bridge>
      </Chapter>

      <Chapter stage={2} id="era-documents" layout="center" numeral="贰" era="春秋" period="约公元前6—前5世纪" tag="《论语·八佾》" year="−500" glyph="徵" title={<>文献不足，不下断语。</>}>
        <figure className={`${styles.slips} ${styles.reveal}`}>
          <blockquote>
            <p className={styles.srOnly}>子曰：“夏礼，吾能言之，杞不足征也；殷礼，吾能言之，宋不足征也。文献不足故也。足，则吾能征之矣。”</p>
            <div className={styles.slipRow} aria-hidden="true">{SLIPS.map((slip, index) => <span key={slip} style={{ '--i': index } as CSSProperties}>{slip}</span>)}</div>
          </blockquote>
          <figcaption>朱熹注：「徵，證也。文，典籍也。獻，賢也。」</figcaption>
        </figure>
        <div className={styles.split}>
          <p className={`${styles.body} ${styles.reveal}`}>孔子能讲述夏、殷两代的礼制，却不肯下定论——杞、宋两国留存的典籍与贤人，不足以为他的话作证。「文献」一词，最早就见于这段话。证据不够时，诚实的回答是：尚不能证。</p>
          <Bridge>缺失即未知。资料不足时，证见把它标为「未知」并列入待补材料，而不是替你补写数据、受访者或引用。</Bridge>
        </div>
      </Chapter>

      <Chapter stage={3} id="era-xiezhi" layout="art-right" numeral="叁" era="东汉" period="约公元100年" tag="《说文解字》" year="100" glyph="灋" title={<>平之如水，<br/>触不直者去之。</>}>
        <blockquote className={`${styles.quote} ${styles.reveal}`}><p>廌，解廌獸也，似山牛，一角。古者決訟，令觸不直。</p><cite>许慎《说文解字》</cite></blockquote>
        <div className={`${styles.faParts} ${styles.reveal}`} role="group" aria-label="灋字的三个部件">
          <span className={styles.faWhole} aria-hidden="true">灋</span><span className={styles.faEquals} aria-hidden="true">=</span>
          {FA_PARTS.map(([part, from, meaning]) => <span key={part} className={styles.faPart} data-tilt><b aria-hidden="true">{part}</b><span>{from}</span><em>{meaning}</em></span>)}
        </div>
        <p className={`${styles.body} ${styles.reveal}`}>古文的「法」写作「灋」。许慎解释：从水，取其公平如水；从廌，即独角神兽獬豸，传说能辨曲直，以角触理亏的一方；从去，将不直者除去。后世执法官员所戴的法冠，也称「獬豸冠」。</p>
        <figure className={`${styles.vitrine} ${styles.reveal}`} data-tilt>
          {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized derivative of the approved brand anchor */}
          <img src="/brand/evi-x-character-anchor-v2-960.webp" width={960} height={640} loading="lazy" decoding="async" alt="獬见：深蓝色幼年獬豸，头顶一根带四个发光节点的金色独角，胸前有青金棱镜，耳内有金色引号纹，尾端是箭头。"/>
          <figcaption><strong>两千年后，獬豸有了新的样子。</strong>证见的守证灵兽「獬见」只有一根角，角上四个节点，依次代表问题、数据、洞察、行动。<small>AI 辅助生成、经人工验收的原创概念角色</small></figcaption>
        </figure>
        <Bridge>证见的审计同样「触不直」：把 AI 合成的材料冒充真实田野或数据，会被判为致命问题，无法进入最终交付。</Bridge>
      </Chapter>

      <Chapter stage={4} id="era-kaoju" layout="center" numeral="肆" era="清" period="乾嘉年间 · 约1736—1820" tag="考据学" year="1750" glyph="證" title={<>凡立一义，必凭证据。</>}>
        <blockquote className={`${styles.quote} ${styles.quoteCentered} ${styles.reveal}`}><p>凡立一義，必憑證據；無證據而以臆度者，在所必擯。</p><cite>梁启超《清代学术概论》</cite></blockquote>
        <p className={`${styles.body} ${styles.reveal}`}>乾嘉学者以考证治经史，一字一义都要找到出处。梁启超在 1920 年代归纳这一派的学风，其中几条，今天读来仍像一份研究规范。悬停或聚焦每一块碑，看证见如何照做。</p>
        <ul className={`${styles.steles} ${styles.reveal}`} aria-label="清儒的学风与今天的证见">{KAOJU.map(([first, second, now], index) => <li key={first} tabIndex={0} data-tilt>
          <div className={styles.steleFront}><em>{['其一', '其二', '其三', '其四'][index]}</em><strong><span>{first}</span><span>{second}</span></strong></div>
          <div className={styles.steleBack}><span>{KAOJU_FULL[index]}</span><p>{now}</p></div>
        </li>)}</ul>
      </Chapter>

      <Chapter stage={5} id="era-now" layout="art-right" numeral="伍" era="今" period="2026" tag="证见 EVI-X" year="2026" glyph="证" title={<>让每个问题，<br/>都循证抵达行动。</>}>
        <p className={`${styles.body} ${styles.reveal}`}>证见是面向市场调查与分析团队的 AI 研究工作台。它把三千年来关于证据的常识，变成一条可以追溯的工作链：</p>
        <ol className={`${styles.chain} ${styles.reveal}`} aria-label="证据链">{QDIA.map(([key, name, text], index) => <li key={key} data-tilt style={{ '--i': index } as CSSProperties}><span className={styles.chainKey} aria-hidden="true">{key}</span><strong>{name}</strong><p>{text}</p></li>)}</ol>
        <div className={`${styles.gates} ${styles.reveal}`}>
          <p><strong>九道质量关</strong>任何一道未通过或已过期，都不会给出最终交付的「Go」。</p>
          <ol aria-label="九道质量关">{GATES.map(([seal, name]) => <li key={name}><span aria-hidden="true">{seal}</span>{name}</li>)}</ol>
        </div>
      </Chapter>

      <Marquee reverse/>

      <section id="begin" data-stage={6} className={styles.finale} aria-labelledby="finale-title">
        <p className={`${styles.kicker} ${styles.reveal}`}>问有据，见有策。</p>
        <h2 id="finale-title" className={`${styles.finaleTitle} ${styles.reveal}`}>下一段证据，<br/>从你的问题开始。</h2>
        <div className={`${styles.actions} ${styles.reveal}`}>
          <Link href={loginHref} className={styles.primary} data-magnetic>{startLabel}<span aria-hidden="true">↗</span></Link>
          <Link href="/explore" className={styles.ghost} data-magnetic>了解证见</Link>
          <Link href="/workspace" className={styles.ghost} data-magnetic>打开研究工具<span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </main>

    <footer className={styles.footer}>
      <div className={styles.footerTop}><span>证见 EVI-X</span><Link href="/explore">产品与说明</Link><Link href="/workspace">研究工具 ↗</Link></div>
      <p className={styles.disclaimer}>证见 EVI-X 为独立研究辅助工具，非“正大杯”赛事官方产品，与赛事主办方、承办方及冠名单位无隶属、授权或合作关系。</p>
      <p>引文出处：《礼记·中庸》；《论语·八佾》及朱熹《论语集注》；许慎《说文解字》；《后汉书·舆服志》；《汉书·河间献王传》（实事求是）；梁启超《清代学术概论》。引文据通行本，繁简依所引原文。</p>
      <p>视觉说明：历史章节为概念性叙事。圆环、甲骨、文字与证据链粒子由代码实时生成，不是文物复原，也不代表任何调查数据。獬见为 AI 辅助生成、经人工验收的原创概念角色。</p>
    </footer>
  </div>;
}
