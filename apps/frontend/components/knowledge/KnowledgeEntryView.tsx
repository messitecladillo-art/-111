'use client';
import { useId, useState } from 'react';
import type { KnowledgeEntry } from '@/lib/knowledge/types';
import { DOMAINS, KNOWLEDGE_ENTRIES } from './catalog';
import { Formula, Tex } from '@/components/math/Tex';
import styles from './Knowledge.module.css';

export default function KnowledgeEntryView({ entry, onRelated, favorite, onFavorite, onReference, notice = '', initialTab = 'understand', onTabChange }: {
  entry: KnowledgeEntry; onRelated: (id: string) => void; favorite: boolean; onFavorite: () => void;
  onReference?: () => void; notice?: string; initialTab?: string; onTabChange?: (tab:string)=>void;
}) {
  const [tab, setTabValue] = useState(initialTab);
  const setTab = (value:string) => { setTabValue(value); onTabChange?.(value); };
  const instance = useId();
  return <article className={styles.entry} data-knowledge-entry={entry.id}>
    <div className={styles.eyebrow}>{DOMAINS[entry.domain] ?? entry.domain}<span>v{entry.version}</span></div>
    <h2>{entry.name}</h2><p className={styles.english}>{entry.englishName}</p>
    {entry.aliases.length > 0 && <p className={styles.aliases}>{entry.aliases.join(' · ')}</p>}
    <div className={styles.tabs} role="tablist" aria-label="词条内容" onKeyDown={event => {
      const tabs = ['understand', 'example', 'formula', 'source'];
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault(); const index = tabs.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (event.key === 'ArrowRight' ? 1 : -1) + 4) % 4;
      setTab(tabs[next]); (event.currentTarget.children[next] as HTMLButtonElement).focus();
    }}>
      {[['understand', '快速理解'], ['example', '例子'], ['formula', '公式与前提'], ['source', '来源']].map(([id, name]) => <button key={id} role="tab" tabIndex={tab === id ? 0 : -1} aria-selected={tab === id} aria-controls={`${instance}-${id}`} id={`${instance}-tab-${id}`} onClick={() => setTab(id)}>{name}</button>)}
    </div>
    <section id={`${instance}-${tab}`} role="tabpanel" aria-labelledby={`${instance}-tab-${tab}`} className={styles.reading}>
      {tab === 'understand' && <><p className={styles.definition}>{entry.definition}</p>
        {!!entry.uses?.length && <><h3>在研究中怎么用</h3>{entry.uses.map((text, i) => <p key={i}>{text}</p>)}</>}
        {!!entry.confusions?.length && <><h3>分清这些概念</h3>{entry.confusions.map((item, i) => <p key={i}>{item.distinction}</p>)}</>}
        {!!entry.questions?.length && <><h3>常见追问</h3>{entry.questions.map((item, i) => <details key={i}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</>}
      </>}
      {tab === 'example' && (entry.examples?.length ? entry.examples.map((text, i) => <p key={i}>{text}</p>) : <p>从“快速理解”中的用途开始，结合你的研究问题理解这一概念。</p>)}
      {tab === 'formula' && <>{entry.formula ? <><Formula tex={entry.formula.tex}/>{entry.formula.symbols.map((symbol, i) => <p key={i}><Tex tex={symbol.symbol}/> — {symbol.meaning}{symbol.unit ? `（${symbol.unit}）` : ''}</p>)}<h3>使用前提</h3>{entry.formula.conditions.map((condition, i) => <p key={i}>{condition}</p>)}</> : <p>这个概念主要用于理解研究问题与方法，阅读定义、例子和相关概念即可。</p>}</>}
      {tab === 'source' && <><p>本条为依据下列资料整理的原创解释。</p>{entry.sources.map(source => <div className={styles.source} key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a><p>{source.locator}</p><small>{source.scope}</small></div>)}<p className={styles.meta}>更新于 {entry.updatedAt} · 审阅 {entry.review.checkedAt}</p></>}
    </section>
    {!!entry.toolLinks?.length && <div className={styles.tools}>{entry.toolLinks.map(tool => <a key={tool.href} href={tool.href}>{tool.label} ↗</a>)}</div>}
    {!!entry.relatedIds.length && <div className={styles.related}><h3>继续了解</h3>{entry.relatedIds.map(id => <button key={id} onClick={() => onRelated(id)}>{KNOWLEDGE_ENTRIES.find(related => related.id === id)?.name ?? id}</button>)}</div>}
    <div className={styles.entryActions}><button onClick={onFavorite} aria-pressed={favorite}>{favorite ? '★ 已收藏' : '☆ 收藏'}</button>{onReference && <button onClick={onReference}>加入项目术语表</button>}</div>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
  </article>;
}
