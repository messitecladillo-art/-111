'use client';

import { useMemo, useRef, useState } from 'react';
import { esc, exportSvgElement, exportSvgString, stamp as today } from './exportSvg';
import ChoiceGroup from '@/components/ChoiceGroup';
import type { Theme } from '@/components/workbench/shell-kit';
import { awardCases, awardCaseLibraryNotice } from '@/data/award-cases';
import type { Burst } from '@/lib/topic-lab/burst';
import { EMPTY_FEASIBILITY, STATUS_LABELS, evaluateTopic, gapCandidates, matchTitleTerms, risingTerms, type Feasibility, type Status, type TopicEvaluation } from '@/lib/topic-lab/evaluate';
import type { TermMap } from '@/lib/topic-lab/network';
import { termKey, type TermIndex } from '@/lib/topic-lab/terms';
import { SIGNAL_LABELS, type CorpusYears, type TermTrend } from '@/lib/topic-lab/trend';
import EvidenceTree from './EvidenceTree';
import { ExportButton, PIVOT, clusterColor, fmtInt, fmtP, pct } from './shared';

const trendWord = (t: TermTrend | null) => !t || t.signal === 'insufficient' ? '' : t.signal === 'rising' ? '（近期上升）' : t.signal === 'falling' ? '（近期下降）' : '';
import styles from './TopicLab.module.css';

export type TopicHandoff = { title: string; decisionOwner: string };
type Props = {
  index: TermIndex; map: TermMap; cy: CorpusYears; trends: Map<string, TermTrend>; bursts: Map<string, Burst>; lastYear: number | null;
  basket: string[]; setBasket: (next: string[]) => void; synonyms: Map<string, string>; theme: Theme; corpusLabel: string; onUseTopic?: (h: TopicHandoff) => void;
};
type Saved = { id: number; ev: TopicEvaluation };
const MAX_COMPARE = 4;

export default function TopicStudio({ index, map, cy, trends, bursts, lastYear, basket, setBasket, synonyms, theme, corpusLabel, onUseTopic }: Props) {
  const label = (key: string) => index.terms.get(key)?.label ?? key;
  const clusters = useMemo(() => new Map(map.nodes.map(n => [n.key, n.cluster])), [map]);
  const centrality = useMemo(() => new Map(map.nodes.map(n => [n.key, n.centrality])), [map]);
  const gaps = useMemo(() => gapCandidates(index, { cy, clusters }), [index, cy, clusters]);
  const rising = useMemo(() => risingTerms(index, cy, 12), [index, cy]);
  const liveBursts = useMemo(() => [...bursts].filter(([, b]) => lastYear !== null && b.end >= lastYear).map(([key, b]) => ({ key, b })).sort((x, y) => y.b.strength - x.b.strength).slice(0, 12), [bursts, lastYear]);
  const pivots = useMemo(() => map.nodes.filter(n => n.centrality >= PIVOT).sort((a, b) => b.centrality - a.centrality).slice(0, 10), [map]);
  const [showGaps, setShowGaps] = useState(8);
  const [openGap, setOpenGap] = useState<number | null>(null);

  const [title, setTitle] = useState('');
  const [terms, setTerms] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [feas, setFeas] = useState<Feasibility>(EMPTY_FEASIBILITY);
  const [result, setResult] = useState<{ ev: TopicEvaluation; stamp: string } | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [copied, setCopied] = useState('');
  const treeRef = useRef<SVGSVGElement>(null);
  const stamp = JSON.stringify([title, terms, feas]);
  const stale = result !== null && result.stamp !== stamp;

  const toggleBasket = (keys: string[]) => { const all = keys.every(k => basket.includes(k)); setBasket(all ? basket.filter(k => !keys.includes(k)) : [...basket, ...keys.filter(k => !basket.includes(k))]); };
  const detect = () => { const found = matchTitleTerms(index, title, synonyms); setTerms(prev => [...new Set([...found, ...prev.filter(k => !index.terms.has(k))])]); };
  const addTerm = (raw: string) => { const k = synonyms.get(termKey(raw)) ?? termKey(raw); if (k && !terms.includes(k)) setTerms([...terms, k]); setCustom(''); };
  const run = () => {
    const ev = evaluateTopic({ title, terms, feasibility: feas }, { index, cy, cases: awardCases, bursts, centrality, lastYear });
    setResult({ ev, stamp }); setCopied('');
  };
  const draftFrom = (keys: string[]) => { setTerms(keys); if (!title.trim()) setTitle(keys.map(label).join(' × ')); document.getElementById('tl-candidate')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  const exportTree = (ev: TopicEvaluation) => {
    const svg = treeRef.current; if (!svg) return;
    const cs = getComputedStyle(svg), v = (name: string) => cs.getPropertyValue(name).trim();
    exportSvgElement(svg, `证据画像-${today()}.svg`, {
      title: `选题证据画像：${ev.title}`,
      legend: [{ color: v('--tl-ok'), label: STATUS_LABELS.ok }, { color: v('--tl-neutral'), label: STATUS_LABELS.neutral }, { color: v('--tl-warn'), label: STATUS_LABELS.attention }, { color: v('--tl-unknown'), label: STATUS_LABELS.unknown }],
      notes: ['六个维度并列呈现证据状态，不合成总分，不估计获奖概率；可行性为自评。', `文献依据：${corpusLabel}；获奖题目参照：${awardCaseLibraryNotice.title}（${awardCases.length} 项，截至 ${awardCaseLibraryNotice.capturedAt}）。`],
    });
  };
  const exportGaps = () => {
    const dark = theme === 'dark', ink = dark ? '#f1ece0' : '#0a1f33', muted = dark ? '#a3b2bf' : '#55687a', red = dark ? '#ff7a70' : '#c8322b', line = dark ? 'rgba(247,244,237,0.2)' : 'rgba(10,31,51,0.18)';
    const rows = gaps.candidates.slice(0, Math.max(showGaps, 8)), W = 900, ROW = 30, LX = 360, PW = 400, top = 30;
    const max = Math.max(1, ...rows.map(g => Math.max(g.expected, g.observed))) * 1.1, x = (v: number) => LX + v / max * PW, out: string[] = [];
    out.push(`<text x="0" y="16" font-size="12" font-weight="800" fill="${muted}">词对</text><text x="${LX}" y="16" font-size="12" font-weight="800" fill="${muted}">共现篇数（○ 独立预期，● 实际）</text><text x="${W}" y="16" font-size="12" font-weight="800" fill="${muted}" text-anchor="end">q 值</text>`);
    for (let t = 0; t <= max; t += Math.max(1, Math.ceil(max / 5))) out.push(`<line x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${top - 4}" y2="${top + rows.length * ROW}" stroke="${line}" stroke-dasharray="2 3"/><text x="${x(t).toFixed(1)}" y="${top + rows.length * ROW + 14}" font-size="10" fill="${muted}" text-anchor="middle">${t}</text>`);
    rows.forEach((g, i) => {
      const y = top + i * ROW + ROW / 2;
      out.push(`<text x="0" y="${y}" font-size="13" font-weight="700" fill="${ink}" dominant-baseline="central">${esc(`${g.a.label} × ${g.b.label}`)}</text>`,
        `<line x1="${x(0)}" x2="${x(max)}" y1="${y}" y2="${y}" stroke="${line}"/>`,
        `<line x1="${x(g.observed).toFixed(1)}" x2="${x(g.expected).toFixed(1)}" y1="${y}" y2="${y}" stroke="${red}" stroke-width="2" stroke-opacity=".45"/>`,
        `<circle cx="${x(g.expected).toFixed(1)}" cy="${y}" r="5.5" fill="none" stroke="${muted}" stroke-width="2"/>`,
        `<circle cx="${x(g.observed).toFixed(1)}" cy="${y}" r="4.5" fill="${red}"/>`,
        `<text x="${W}" y="${y}" font-size="12" fill="${ink}" text-anchor="end" dominant-baseline="central">${fmtP(g.q)}</text>`);
    });
    exportSvgString(out.join(''), W, top + rows.length * ROW + 22, `研究空白候选-${today()}.svg`, {
      title: `研究空白候选：实际共现显著低于独立预期的词对（前 ${rows.length} 组）`,
      legend: [{ color: muted, label: '独立预期篇数', ring: true }, { color: red, label: '实际共现篇数' }],
      notes: [`对 ${fmtInt(gaps.tested)} 对高频词做单侧 Fisher 精确检验（每对独立预期 ≥ ${gaps.minExpected} 篇），Benjamini–Hochberg 校正，FDR ${gaps.fdr * 100}%，保留实际不到预期一半的组合。少见不等于值得研究。`, `数据：${corpusLabel}。`],
    }, { ink, muted });
  };
  const copy = async (ev: TopicEvaluation) => {
    try { await navigator.clipboard.writeText(evaluationMarkdown(ev, corpusLabel)); setCopied('已复制证据画像（Markdown）'); } catch { setCopied('浏览器未允许写入剪贴板'); }
  };

  return <div className={styles.studioWrap}><div className={styles.studio}>
    <section className={styles.studioCol} aria-labelledby="tl-inspire">
      <h3 id="tl-inspire">从文献中找方向</h3>
      <div className={styles.basket}>
        <div className={styles.basketHead}><strong>选题篮</strong><span>{basket.length ? `${basket.length} 个词` : '在词云、共现图或突现表中点击词加入'}</span>{basket.length > 0 && <button type="button" className={styles.linkButton} onClick={() => setBasket([])}>清空</button>}</div>
        {basket.length > 0 && <ul className={styles.chips}>{basket.map(k => <li key={k}><span>{label(k)}<small>{index.terms.get(k)?.df ?? 0}</small></span><button type="button" onClick={() => setBasket(basket.filter(x => x !== k))} aria-label={`移出 ${label(k)}`}>×</button></li>)}</ul>}
        {basket.length > 0 && <button type="button" className={styles.secondaryButton} onClick={() => draftFrom(basket)}>用选题篮起草候选题目</button>}
      </div>

      <article className={styles.inspireBlock}>
        <header><h4>研究空白候选</h4><span className={styles.rowActions}><span className={styles.badge}>Fisher 精确检验 · BH 校正</span>{gaps.candidates.length > 0 && <ExportButton onExport={exportGaps} />}</span></header>
        <p className={styles.muted}>两个词各自常见，却很少出现在同一篇文献中。检验了 {fmtInt(gaps.tested)} 对高频词（每对独立预期 ≥ {gaps.minExpected} 篇），在 FDR {gaps.fdr * 100}% 下保留实际共现不到预期一半的组合。<strong>少见不等于值得做</strong>：也可能是两者本就无关，需要你用一个真实的决策问题把它们连起来。</p>
        {gaps.candidates.length === 0 ? <p className={styles.emptyLine}>当前语料中没有显著的低共现组合。记录越多、关键词越规范，这一检验越有效。</p> : <ol className={styles.gapList}>
          {gaps.candidates.slice(0, showGaps).map((g, i) => {
            const max = Math.max(g.expected, g.observed) * 1.15 || 1, open = openGap === i;
            return <li key={`${g.a.key}|${g.b.key}`}>
              <div className={styles.gapHead}>
                <span className={styles.gapTerms}><i style={{ background: clusterColor(theme, g.a.cluster ?? -1) }} />{g.a.label}<b>×</b><i style={{ background: clusterColor(theme, g.b.cluster ?? -1) }} />{g.b.label}</span>
                {g.crossCluster && <span className={styles.badge}>跨聚类</span>}
              </div>
              <svg className={styles.dotPlot} viewBox="0 0 220 26" role="img" aria-label={`实际共现 ${g.observed} 篇，独立预期 ${g.expected.toFixed(1)} 篇`}>
                <line x1="6" x2="214" y1="13" y2="13" />
                <circle cx={6 + g.expected / max * 208} cy="13" r="5.5" className={styles.dotExpected} />
                <circle cx={6 + g.observed / max * 208} cy="13" r="4.5" className={styles.dotObserved} />
              </svg>
              <p className={styles.gapStats}>实际 <b>{g.observed}</b> 篇 / 预期 {g.expected.toFixed(1)} 篇 · q = {fmtP(g.q)} · 各自 {g.a.df} 篇{trendWord(g.a.trend)}、{g.b.df} 篇{trendWord(g.b.trend)}</p>
              <div className={styles.rowActions}>
                <button type="button" className={styles.linkButton} onClick={() => toggleBasket([g.a.key, g.b.key])}>{[g.a.key, g.b.key].every(k => basket.includes(k)) ? '移出选题篮' : '加入选题篮'}</button>
                <button type="button" className={styles.linkButton} onClick={() => draftFrom([g.a.key, g.b.key])}>以此起草</button>
                {g.observed > 0 && <button type="button" className={styles.linkButton} aria-expanded={open} onClick={() => setOpenGap(open ? null : i)}>{open ? '收起' : `查看已有的 ${g.observed} 篇`}</button>}
              </div>
              {open && <ul className={styles.paperMini}>{g.papers.map(p => <li key={p}>{index.records[p].title}<small>{index.records[p].year ?? '—'} · {index.records[p].source || '—'}</small></li>)}</ul>}
            </li>;
          })}
        </ol>}
        {gaps.candidates.length > showGaps && <button type="button" className={styles.linkButton} onClick={() => setShowGaps(n => n + 8)}>再显示 {Math.min(8, gaps.candidates.length - showGaps)} 个</button>}
      </article>

      <article className={styles.inspireBlock}>
        <header><h4>前沿信号</h4><span className={styles.badge}>突现检测 · z 检验</span></header>
        {!cy.usable && !liveBursts.length ? <p className={styles.emptyLine}>近 3 年与此前各需至少 20 条记录才能检验（当前 {cy.recentTotal} / {cy.earlyTotal}）。</p> : <>
          {liveBursts.length > 0 && <><h5>突现延续至 {lastYear} 年</h5><ul className={styles.signalList}>{liveBursts.map(({ key, b }) => <li key={key}><button type="button" className={styles.termButton} aria-pressed={basket.includes(key)} onClick={() => toggleBasket([key])}>{label(key)}</button><span>{b.begin} 年起 · 强度 {b.strength.toFixed(1)}</span></li>)}</ul></>}
          {rising.length > 0 && <><h5>近 3 年占比显著上升</h5><ul className={styles.signalList}>{rising.map(r => <li key={r.key}><button type="button" className={styles.termButton} aria-pressed={basket.includes(r.key)} onClick={() => toggleBasket([r.key])}>{r.label}</button><span>{pct(r.trend.earlyShare)} → {pct(r.trend.recentShare)} · z = {r.trend.z?.toFixed(1)}</span></li>)}</ul></>}
          {!liveBursts.length && !rising.length && <p className={styles.emptyLine}>没有词在近期显著升温。</p>}
        </>}
      </article>

      {pivots.length > 0 && <article className={styles.inspireBlock}>
        <header><h4>枢纽词</h4><span className={styles.badge}>中介中心性 ≥ {PIVOT}</span></header>
        <p className={styles.muted}>处在不同研究方向之间的词，适合作为交叉选题的连接点。</p>
        <ul className={styles.signalList}>{pivots.map(n => <li key={n.key}><button type="button" className={styles.termButton} aria-pressed={basket.includes(n.key)} onClick={() => toggleBasket([n.key])}>{n.label}</button><span>{n.centrality.toFixed(2)} · #{n.cluster + 1} {map.clusterInfo[n.cluster]?.label ?? ''}</span></li>)}</ul>
      </article>}
    </section>

    <section className={styles.studioCol} aria-labelledby="tl-candidate">
      <h3 id="tl-candidate">评估候选题目</h3>
      <form className={styles.candidateForm} onSubmit={e => { e.preventDefault(); run(); }}>
        <label className={styles.field}><span>候选题目</span><textarea rows={2} value={title} onChange={e => setTitle(e.target.value)} onBlur={() => { if (title.trim() && !terms.length) detect(); }} placeholder="例如：“声”入人心——北京市独居老人智能语音助手使用意愿与服务付费意愿研究" required /></label>
        <div className={styles.field}>
          <span>核心词 <small>（用于检索导入文献；可增删）</small></span>
          <div className={styles.termEditor}>
            {terms.map(k => <span key={k} className={styles.termChip} data-missing={!index.terms.has(k) || undefined}>{label(k)}<small>{index.terms.get(k)?.df ?? 0} 篇</small><button type="button" onClick={() => setTerms(terms.filter(x => x !== k))} aria-label={`删除核心词 ${label(k)}`}>×</button></span>)}
            <input value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (custom.trim()) addTerm(custom); } }} placeholder="输入后回车添加" aria-label="添加核心词" list="tl-term-list" />
            <datalist id="tl-term-list">{map.nodes.map(n => <option key={n.key} value={n.label} />)}</datalist>
          </div>
          <div className={styles.rowActions}><button type="button" className={styles.linkButton} onClick={detect} disabled={!title.trim()}>从题目识别核心词</button>{basket.length > 0 && <button type="button" className={styles.linkButton} onClick={() => setTerms([...new Set([...terms, ...basket])])}>加入选题篮中的词</button>}</div>
        </div>
        <fieldset className={styles.feasibility}>
          <legend>可行性自评 <small>（只记录你的判断，不作核验）</small></legend>
          <label className={styles.field}><span>谁会依据这项研究做决定？</span><input value={feas.decisionOwner} onChange={e => setFeas({ ...feas, decisionOwner: e.target.value })} placeholder="例如：某区民政局养老服务科" /></label>
          <ChoiceGroup legend="能在调查期内触达目标人群吗？" name="tl-access" value={feas.access} onChange={v => setFeas({ ...feas, access: v as Feasibility['access'] })} tone={theme} options={[{ value: 'yes', label: '能' }, { value: 'unsure', label: '不确定' }, { value: 'no', label: '不能' }]} />
          <ChoiceGroup legend="能取得一手数据（问卷、访谈、观察）吗？" name="tl-primary" value={feas.primaryData} onChange={v => setFeas({ ...feas, primaryData: v as Feasibility['primaryData'] })} tone={theme} options={[{ value: 'yes', label: '能' }, { value: 'unsure', label: '不确定' }, { value: 'no', label: '不能' }]} />
          <ChoiceGroup legend="涉及未成年人、病患或敏感信息吗？" name="tl-sensitive" value={feas.sensitive} onChange={v => setFeas({ ...feas, sensitive: v as Feasibility['sensitive'] })} tone={theme} options={[{ value: 'no', label: '不涉及' }, { value: 'unsure', label: '不确定' }, { value: 'yes', label: '涉及' }]} />
        </fieldset>
        <button type="submit" className={styles.primaryButton} disabled={!title.trim()}>生成证据画像</button>
      </form>
    </section>
  </div>

      {result && <div className={styles.profile} aria-live="polite">
        {stale && <p className={styles.caution}>题目或核心词已修改，下方画像仍是上一次的结果。<button type="button" className={styles.linkButton} onClick={run}>重新生成</button></p>}
        <div className={styles.profileHead}>
          <span className={styles.eyebrowSmall}>证据画像 · 不是获奖概率</span>
          <h4>{result.ev.title}</h4>
          <p className={styles.provenance}>依据：{corpusLabel}；{awardCaseLibraryNotice.title}（{awardCases.length} 项，截至 {awardCaseLibraryNotice.capturedAt}）；可行性为自评。</p>
        </div>
        <EvidenceTree ev={result.ev} svgRef={treeRef} />
        <Legendary />
        <NeedsList ev={result.ev} />
        <DimensionCards ev={result.ev} index={index} trends={trends} />
        <div className={styles.rowActions}>
          <button type="button" className={styles.secondaryButton} disabled={saved.length >= MAX_COMPARE || saved.some(s => s.ev.title === result.ev.title && JSON.stringify(s.ev.terms) === JSON.stringify(result.ev.terms))} onClick={() => setSaved([...saved, { id: Date.now(), ev: result.ev }])}>{saved.length >= MAX_COMPARE ? `最多对比 ${MAX_COMPARE} 个` : '加入对比'}</button>
          <button type="button" className={styles.secondaryButton} onClick={() => copy(result.ev)}>复制为 Markdown</button>
          <ExportButton onExport={() => exportTree(result.ev)} label="导出画像 SVG" />
          {onUseTopic && <button type="button" className={styles.secondaryButton} onClick={() => onUseTopic({ title: result.ev.title, decisionOwner: feas.decisionOwner })}>带入准备度诊断</button>}
          {copied && <span className={styles.muted} role="status">{copied}</span>}
        </div>
      </div>}

    {saved.length > 0 && <div className={styles.compare}>
        <h4>候选题目对比</h4>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>候选题目在六个证据维度上的状态</caption>
            <thead><tr><th scope="col">维度</th>{saved.map((s, i) => <th scope="col" key={s.id}><span className={styles.compareTitle}>{i + 1}. {s.ev.title}</span><button type="button" className={styles.linkButton} onClick={() => setSaved(saved.filter(x => x.id !== s.id))}>移除<span className={styles.srOnly}>：{s.ev.title}</span></button></th>)}</tr></thead>
            <tbody>{COMPARE_ROWS.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{saved.map(s => { const [st, text] = row.get(s.ev); return <td key={s.id}><StatusChip status={st} /><small>{text}</small></td>; })}</tr>)}</tbody>
          </table>
        </div>
        <p className={styles.muted}>对比只并列证据状态，不合成总分：维度之间的重要性取决于你的研究目标与赛事阶段。</p>
      </div>}
  </div>;
}

function StatusChip({ status }: { status: Status }) { return <span className={`${styles.statusChip} ${styles[`st_${status}`]}`}>{STATUS_LABELS[status]}</span>; }
function Legendary() {
  return <div className={styles.legend}>{(['ok', 'neutral', 'attention', 'unknown'] as Status[]).map(s => <span key={s} className={`${styles.legendItem} ${styles[`st_${s}`]}`}><i className={styles.statusDot} />{STATUS_LABELS[s]}</span>)}</div>;
}

const COMPARE_ROWS: Array<{ label: string; get: (ev: TopicEvaluation) => [Status, string] }> = [
  { label: '文献基础', get: ev => [ev.base.status, ev.terms.length ? ev.terms.map(t => `${t.label} ${t.df}`).join('、') : '未识别核心词'] },
  { label: '新颖度', get: ev => [ev.novelty.status, ev.novelty.kind === 'unknown' ? '需两个以上核心词' : `全部要素同现 ${ev.novelty.joint} 篇`] },
  { label: '时效', get: ev => [ev.trend.status, [...ev.trend.bursts.filter(b => b.live).map(b => `${b.label} 突现至今`), ...ev.trend.rising.map(r => `${r} ↑`), ...ev.trend.falling.map(r => `${r} ↓`)].join('、') || '无显著变化'] },
  { label: '获奖题目参照', get: ev => [ev.award.status, ev.award.nearDuplicate ? '与已获奖题目高度相近' : ev.award.similar.length ? `相近 ${ev.award.similar.length} 项` : '无相近题目'] },
  { label: '题目要素', get: ev => [ev.structure.status, `${ev.structure.features.filter(f => f.match).length}/${ev.structure.features.length} 项`] },
  { label: '可行性（自评）', get: ev => [ev.feasibility.status, ev.feasibility.issues.join('；') || (ev.feasibility.status === 'unknown' ? '未填写' : '无明显障碍')] },
];

function NeedsList({ ev }: { ev: TopicEvaluation }) {
  const todo: string[] = [];
  if (ev.base.status === 'unknown') todo.push('补充核心词，或导入与题目相关的文献');
  if (ev.base.weak.length) todo.push(`${ev.base.weak.join('、')} 在导入文献中少于 3 篇：扩大检索式，或确认这些词的规范说法`);
  if (ev.novelty.kind === 'crowded') todo.push(`已有 ${ev.novelty.joint} 篇文献同时涉及全部要素：在对象、地域、方法或决策场景上写清差异`);
  if (ev.novelty.kind === 'none') todo.push('导入文献中尚无同时涉及全部要素的研究：先用一个真实决策问题论证这一组合的必要性');
  if (ev.trend.status === 'attention') todo.push(`${ev.trend.falling.join('、')} 近期占比下降：说明为什么现在仍值得研究`);
  if (ev.award.nearDuplicate) todo.push(`与已获奖题目“${ev.award.nearDuplicate.title}”高度相近：避免重复，突出新的对象或问题`);
  for (const f of ev.structure.features) if (!f.match) todo.push(`题目未体现${f.label}：${f.hint}`);
  for (const i of ev.feasibility.issues) todo.push(i);
  if (ev.feasibility.status === 'unknown') todo.push('填写可行性自评：决策者、人群触达、一手数据与敏感信息');
  if (!todo.length) return null;
  return <div className={styles.needs}><h5>下一步可以补强</h5><ol>{todo.slice(0, 8).map(t => <li key={t}>{t}</li>)}</ol></div>;
}

function DimensionCards({ ev, index, trends }: { ev: TopicEvaluation; index: TermIndex; trends: Map<string, TermTrend> }) {
  const [showPapers, setShowPapers] = useState(false);
  return <div className={styles.dimGrid}>
    <article className={styles.dimCard}>
      <header><h5>文献基础</h5><StatusChip status={ev.base.status} /></header>
      {ev.terms.length ? <ul className={styles.factRows}>{ev.terms.map(t => <li key={t.key}><span>{t.label}</span><b>{t.df} 篇</b><small>{pct(t.share)}</small></li>)}</ul> : <p className={styles.muted}>没有识别到导入文献中出现过的核心词。</p>}
      {ev.base.pivots.length > 0 && <p className={styles.note}>{ev.base.pivots.map(p => `${p.label}（${p.centrality.toFixed(2)}）`).join('、')} 是枢纽词，连接不同研究方向。</p>}
    </article>
    <article className={styles.dimCard}>
      <header><h5>新颖度</h5><StatusChip status={ev.novelty.status} /></header>
      {ev.novelty.kind === 'unknown' ? <p className={styles.muted}>至少需要两个在导入文献中出现过的核心词。</p> : <>
        <p className={styles.bigLine}><b>{ev.novelty.joint}</b> 篇同时涉及全部核心词{ev.novelty.expected !== null && <small>（各词独立时预期 {ev.novelty.expected < .1 ? ev.novelty.expected.toExponential(1) : ev.novelty.expected.toFixed(1)} 篇；≥ {ev.novelty.crowdedAt} 篇视为已较充分）</small>}</p>
        <ul className={styles.factRows}>{ev.novelty.pairs.map(p => <li key={`${p.a}|${p.b}`}><span>{p.a} × {p.b}</span><b>{p.observed} / {p.expected.toFixed(1)}</b><small title="单侧 Fisher 精确检验：实际共现少于独立预期的概率">p = {fmtP(p.pLow)}</small></li>)}</ul>
        {ev.novelty.papers.length > 0 && <><button type="button" className={styles.linkButton} aria-expanded={showPapers} onClick={() => setShowPapers(!showPapers)}>{showPapers ? '收起' : `查看最接近的 ${ev.novelty.papers.length} 篇已有研究`}</button>
          {showPapers && <ul className={styles.paperMini}>{ev.novelty.papers.map(p => <li key={p}>{index.records[p].title}<small>{index.records[p].year ?? '—'} · 被引 {index.records[p].citations ?? '—'}</small></li>)}</ul>}</>}
      </>}
    </article>
    <article className={styles.dimCard}>
      <header><h5>时效</h5><StatusChip status={ev.trend.status} /></header>
      {ev.terms.length ? <ul className={styles.factRows}>{ev.terms.map(t => { const tr = trends.get(t.key) ?? t.trend; const b = ev.trend.bursts.find(x => x.label === t.label); return <li key={t.key}><span>{t.label}</span><b>{tr && tr.signal !== 'insufficient' ? `${pct(tr.earlyShare)} → ${pct(tr.recentShare)}` : '—'}</b><small>{[tr ? (tr.signal === 'insufficient' ? '样本不足' : `${SIGNAL_LABELS[tr.signal]}，z = ${tr.z?.toFixed(1)}`) : '', b ? `突现 ${b.begin}–${b.end}${b.live ? '（至今）' : ''}` : ''].filter(Boolean).join(' · ')}</small></li>; })}</ul> : <p className={styles.muted}>没有核心词。</p>}
      {!ev.trend.usable && <p className={styles.note}>近 3 年或此前的记录不足 20 条，z 检验不可用。</p>}
    </article>
    <article className={styles.dimCard}>
      <header><h5>获奖题目参照</h5><StatusChip status={ev.award.status} /></header>
      {ev.award.similar.length ? <ul className={styles.caseRows}>{ev.award.similar.map(c => <li key={c.id}><span>{c.title}</span><small>{c.edition} · {c.award} · {c.verification === 'official_verified' ? '官方来源已核验' : '用户陈述奖项'} · 相似度 {(c.similarity * 100).toFixed(0)}{c.sharedTags.length ? ` · 共同标签：${c.sharedTags.join('、')}` : ''}</small>{c.sourceUrl && <a href={c.sourceUrl} target="_blank" rel="noreferrer">公告来源<span className={styles.srOnly}>（新窗口）</span></a>}</li>)}</ul> : <p className={styles.muted}>索引中没有题面相近的获奖题目。</p>}
      <p className={styles.note}>相似度 = 0.6 × 题名字符二元组 Jaccard + 0.4 × 案例标签命中比例。索引仅收录 {awardCases.length} 项、不是全量榜单，且没有未获奖作品作对照，因此只能用来定位与避免重复，不能推断获奖可能性。</p>
    </article>
    <article className={styles.dimCard}>
      <header><h5>题目要素</h5><StatusChip status={ev.structure.status} /></header>
      <ul className={styles.factRows}>{ev.structure.features.map(f => <li key={f.id}><span>{f.label}</span><b>{f.match ? `✓ ${f.match}` : '—'}</b><small>{f.total} 个官方核验获奖题目中 {f.withFeature} 个含此要素</small></li>)}</ul>
      <p className={styles.note}>题目 {ev.structure.length} 字；上述获奖题目中位数 {ev.structure.lengths.median.toFixed(0)} 字（四分位 {ev.structure.lengths.q1.toFixed(0)}–{ev.structure.lengths.q3.toFixed(0)}）。要素按关键词规则识别，可能漏判；比例只是描述，没有对照组，不代表这些要素导致获奖。</p>
    </article>
    <article className={styles.dimCard}>
      <header><h5>可行性（自评）</h5><StatusChip status={ev.feasibility.status} /></header>
      {ev.feasibility.status === 'unknown' ? <p className={styles.muted}>尚未填写自评。</p> : ev.feasibility.issues.length ? <ul className={styles.plainList}>{ev.feasibility.issues.map(i => <li key={i}>{i}</li>)}</ul> : <p>按你的自评，没有明显的执行障碍。</p>}
    </article>
  </div>;
}

/** Plain-text export that keeps provenance and the boundary statement with the numbers. */
export function evaluationMarkdown(ev: TopicEvaluation, corpusLabel: string): string {
  const lines = [`# 选题证据画像：${ev.title}`, '', `- 文献依据：${corpusLabel}`, `- 获奖题目参照：${awardCaseLibraryNotice.title}（${awardCases.length} 项，截至 ${awardCaseLibraryNotice.capturedAt}）`, '- 说明：本画像并列证据状态，不估计获奖概率。', ''];
  lines.push('## 文献基础', ...ev.terms.map(t => `- ${t.label}：${t.df} 篇（${pct(t.share)}）`), '');
  lines.push('## 新颖度', ev.novelty.kind === 'unknown' ? '- 核心词不足，无法判断' : `- 同时涉及全部核心词：${ev.novelty.joint} 篇`, ...ev.novelty.pairs.map(p => `- ${p.a} × ${p.b}：实际 ${p.observed} / 预期 ${p.expected.toFixed(1)}（单侧 Fisher p = ${fmtP(p.pLow)}）`), '');
  lines.push('## 时效', ...ev.trend.bursts.map(b => `- ${b.label} 突现 ${b.begin}–${b.end}${b.live ? '（延续至最新年份）' : ''}`), ...ev.trend.rising.map(r => `- ${r}：近 3 年占比显著上升`), ...ev.trend.falling.map(r => `- ${r}：近 3 年占比显著下降`), '');
  lines.push('## 获奖题目参照（描述性）', ...ev.award.similar.map(c => `- ${c.title}（${c.edition}，${c.award}，${c.verification === 'official_verified' ? '官方来源已核验' : '用户陈述'}，相似度 ${(c.similarity * 100).toFixed(0)}）`), '');
  lines.push('## 题目要素', ...ev.structure.features.map(f => `- ${f.label}：${f.match ?? '未体现'}（${f.total} 个官方核验获奖题目中 ${f.withFeature} 个含此要素）`), '');
  lines.push('## 可行性（自评，未核验）', ...(ev.feasibility.issues.length ? ev.feasibility.issues.map(i => `- ${i}`) : [ev.feasibility.status === 'unknown' ? '- 未填写' : '- 无明显障碍']));
  return lines.join('\n');
}
