'use client';

import { useMemo, useState } from 'react';
import { keywordBursts as computeKeywordBursts, strongestBursts, type BurstRow } from '@/lib/topic-lab/burst';
import type { LitRecord } from '@/lib/topic-lab/parse';
import { referenceYearSeries, refShortLabel, topCitedReferences } from '@/lib/topic-lab/papers';
import type { TermIndex } from '@/lib/topic-lab/terms';
import type { CorpusYears } from '@/lib/topic-lab/trend';
import type { Theme } from '@/components/workbench/shell-kit';
import { ExportButton, fmtInt } from './shared';
import { esc, exportSvgString, stamp } from './exportSvg';
import styles from './TopicLab.module.css';

type Props = { dataNote: string; theme: Theme; index: TermIndex; records: LitRecord[]; cy: CorpusYears; basket: string[]; onToggle: (key: string) => void; gamma: number; onGamma: (g: number) => void; keywordBursts: { rows: BurstRow[]; years: number[] } };

export default function BurstView({ dataNote, theme, index, records, cy, basket, onToggle, gamma, onGamma, keywordBursts }: Props) {
  const withRefs = records.filter(r => r.refs.length > 0 && r.year !== null).length;
  const [kind, setKind] = useState<'keywords' | 'references'>('keywords');
  const [minDuration, setMinDuration] = useState(1);
  const refBursts = useMemo(() => {
    if (kind !== 'references' || withRefs < 20) return { rows: [], years: [] };
    const top = topCitedReferences(records, 400).filter(r => r.count >= 4);
    const { series, totals } = referenceYearSeries(records, top);
    return strongestBursts(series, totals, { gamma, minDuration, limit: 25 });
  }, [kind, records, withRefs, gamma, minDuration]);
  const kw = useMemo(() => minDuration === 1 ? keywordBursts : computeKeywordBursts(index, { gamma, minDuration, limit: 25 }), [keywordBursts, minDuration, index, gamma]);
  const data = kind === 'keywords' ? kw : refBursts;
  const last = data.years[data.years.length - 1];
  const live = data.rows.filter(r => r.burst.end === last).length;

  const exportBursts = () => {
    const dark = theme === 'dark';
    const ink = dark ? '#f1ece0' : '#0a1f33', muted = dark ? '#a3b2bf' : '#55687a', red = dark ? '#ff7a70' : '#c8322b', on = dark ? 'rgba(247,244,237,0.34)' : 'rgba(10,31,51,0.3)', off = dark ? 'rgba(247,244,237,0.14)' : 'rgba(10,31,51,0.12)';
    const W = 940, ROW = 26, top = 34, sx = 590, sw = W - sx, cell = sw / data.years.length, out: string[] = [];
    const head = (x: number, t: string, anchor = 'start') => out.push(`<text x="${x}" y="18" font-size="12" font-weight="800" fill="${muted}" text-anchor="${anchor}">${esc(t)}</text>`);
    head(0, kind === 'keywords' ? '关键词' : '被引参考文献'); head(360, '首次', 'end'); head(430, '强度', 'end'); head(490, '开始', 'end'); head(550, '结束', 'end');
    head(sx, String(data.years[0])); head(W, String(last), 'end');
    out.push(`<line x1="0" x2="${W}" y1="26" y2="26" stroke="${off}"/>`);
    data.rows.forEach((r, i) => {
      const y = top + i * ROW + ROW / 2, isLive = r.burst.end === last, name = kind === 'keywords' ? r.label : refShortLabel(r.label);
      out.push(`<text x="0" y="${y}" font-size="13" font-weight="700" fill="${isLive ? red : ink}" dominant-baseline="central">${esc(name)}${isLive ? '（至今）' : ''}</text>`);
      for (const [x, v] of [[360, r.first], [430, r.burst.strength.toFixed(2)], [490, r.burst.begin], [550, r.burst.end]] as Array<[number, string | number]>) out.push(`<text x="${x}" y="${y}" font-size="12" fill="${ink}" text-anchor="end" dominant-baseline="central">${v}</text>`);
      data.years.forEach((yr, j) => {
        const state = yr >= r.burst.begin && yr <= r.burst.end ? 'burst' : yr >= r.first ? 'on' : 'off', h = state === 'burst' ? 10 : state === 'on' ? 5 : 3;
        out.push(`<rect x="${(sx + j * cell + .5).toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${Math.max(1, cell - 1).toFixed(1)}" height="${h}" rx="1" fill="${state === 'burst' ? red : state === 'on' ? on : off}"/>`);
      });
    });
    const H = top + data.rows.length * ROW + 6;
    exportSvgString(out.join(''), W, H, `${kind === 'keywords' ? '关键词' : '参考文献'}突现-${stamp()}.svg`, {
      title: `突现最强的前 ${data.rows.length} 个${kind === 'keywords' ? '关键词' : '被引参考文献'}（${data.years[0]}–${last}）`,
      legend: [{ color: red, label: '突现期' }, { color: on, label: '首次出现之后' }],
      notes: [`Kleinberg 二状态突现检测：s = 2，γ = ${gamma}，最短持续 ${minDuration} 年；强度为突现期内相对基线的对数似然增益。延续到最新年份的突现标“至今”。${cy.partialLastYear ? `${cy.max} 年可能仍在收录中。` : ''}`, dataNote],
    }, { ink, muted });
  };

  return <div className={styles.viewBody}>
    <div className={styles.viewTools}>
      <p className={styles.viewNote}>突现检测（Kleinberg 算法，CiteSpace 的“Citation Burst”）：找出某个词在一段时间内出现频率显著高于它自身基线的时期。红色段为突现期，<strong>延续到最新年份的突现</strong>常被视为研究前沿的信号；它说明“被频繁讨论”，不说明“值得研究”。</p>
      <div className={styles.toolCluster}>
        <div className={styles.segmented} role="group" aria-label="突现对象">
          <button type="button" aria-pressed={kind === 'keywords'} onClick={() => setKind('keywords')}>关键词</button>
          <button type="button" aria-pressed={kind === 'references'} onClick={() => setKind('references')} disabled={withRefs < 20} title={withRefs < 20 ? '需要至少 20 篇带参考文献且有年份的记录' : undefined}>被引参考文献</button>
        </div>
        {data.rows.length > 0 && <ExportButton onExport={exportBursts} />}
        <label className={styles.inlineField}>γ<select value={gamma} onChange={e => onGamma(Number(e.target.value))}>{[.5, 1, 1.5, 2].map(g => <option key={g} value={g}>{g}{g === 1 ? '（默认）' : g > 1 ? '（更严格）' : '（更宽松）'}</option>)}</select></label>
        <label className={styles.inlineField}>最短持续<select value={minDuration} onChange={e => setMinDuration(Number(e.target.value))}>{[1, 2, 3].map(d => <option key={d} value={d}>{d} 年</option>)}</select></label>
      </div>
    </div>
    {cy.partialLastYear && <p className={styles.caution}>{cy.max} 年可能仍在收录中，最后一年的记录数偏少，末年是否突现需谨慎判断。</p>}
    {data.rows.length === 0 ? <div className={styles.emptyView}><strong>没有检测到突现</strong><p>{data.years.length < 3 ? '年份跨度太短，至少需要 3 年。' : '在当前参数下，没有词在某段时间内显著高于自身基线。可以调低 γ 或缩短最短持续时间。'}</p></div> : <>
      <p className={styles.viewMeta}>突现最强的前 {data.rows.length} 个{kind === 'keywords' ? '关键词' : '被引参考文献'}（{data.years[0]}–{last}，二状态模型 s = 2，γ = {gamma}）{live ? ` · ${live} 个延续至 ${last} 年` : ''}</p>
      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${styles.burstTable}`}>
          <caption className={styles.srOnly}>突现明细：每行一个{kind === 'keywords' ? '关键词' : '参考文献'}，年份条中红色为突现期</caption>
          <thead><tr><th scope="col">{kind === 'keywords' ? '关键词' : '参考文献'}</th><th scope="col">首次</th><th scope="col">强度</th><th scope="col">开始</th><th scope="col">结束</th><th scope="col">{data.years[0]}–{last}</th>{kind === 'keywords' && <th scope="col"><span className={styles.srOnly}>操作</span></th>}</tr></thead>
          <tbody>{data.rows.map(r => {
            const inBasket = basket.includes(r.key), isLive = r.burst.end === last;
            return <tr key={r.key} data-live={isLive || undefined}>
              <th scope="row" title={r.label}>{kind === 'keywords' ? r.label : refShortLabel(r.label)}{isLive && <span className={styles.liveTag}>至今</span>}</th>
              <td>{r.first}</td><td>{r.burst.strength.toFixed(2)}</td><td>{r.burst.begin}</td><td>{r.burst.end}</td>
              <td><span className={styles.burstStrip} role="img" aria-label={`${r.burst.begin} 至 ${r.burst.end} 年突现，共出现 ${fmtInt(r.total)} 次`}>{data.years.map(y => <i key={y} data-state={y >= r.burst.begin && y <= r.burst.end ? 'burst' : y >= r.first ? 'on' : 'off'} />)}</span></td>
              {kind === 'keywords' && <td><button type="button" className={styles.linkButton} aria-pressed={inBasket} onClick={() => onToggle(r.key)}>{inBasket ? '移出' : '加入选题篮'}<span className={styles.srOnly}>：{r.label}</span></button></td>}
            </tr>;
          })}</tbody>
        </table>
      </div>
      {kind === 'references' && <p className={styles.muted}>参考文献按导出文件中的引用字符串识别（作者、年份、来源或 DOI），同一文献写法不同可能被拆成两条。</p>}
      {kind === 'keywords' && index.source !== 'keywords' && index.source !== 'keywords+plus' && <p className={styles.muted}>当前词来源为抽词结果，突现词可能包含不成词的片段。</p>}
    </>}
  </div>;
}
