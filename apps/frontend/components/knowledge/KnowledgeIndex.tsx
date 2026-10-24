'use client';
import { useEffect, useMemo, useState } from 'react';
import { useKnowledge } from './KnowledgeProvider';
import { DOMAINS } from './catalog';
import KnowledgeEntryView from './KnowledgeEntryView';
import styles from './Knowledge.module.css';

export default function KnowledgeIndex() {
  const knowledge = useKnowledge();
  const [query, setQuery] = useState(''), [domain, setDomain] = useState(''), [favoriteOnly, setFavoriteOnly] = useState(false), [response, setResponse] = useState<{query:string;ids:string[]} | null>(null), [selectedId, setSelectedId] = useState('');
  const { search } = knowledge;
  useEffect(() => {
    let current = true;
    if (!query.trim()) return;
    const timer = setTimeout(() => { void search(query).then(hits => { if (current) { setResponse({query,ids:hits.map(hit => hit.entry.id)}); if (hits[0]) setSelectedId(hits[0].entry.id); } }).catch(() => { if (current) setResponse({query,ids:[]}); }); }, 100);
    return () => { current = false; clearTimeout(timer); };
  }, [query, search]);
  const resultIds = useMemo(() => query.trim() ? response?.query === query ? response.ids : [] : null, [query,response]);
  const entries = useMemo(() => knowledge.entries.filter(entry => (!domain || entry.domain === domain) && (!favoriteOnly || knowledge.favorites.includes(entry.id)) && (!resultIds || resultIds.includes(entry.id))).sort((a, b) => resultIds ? resultIds.indexOf(a.id) - resultIds.indexOf(b.id) : a.name.localeCompare(b.name, 'zh-CN')), [knowledge.entries, knowledge.favorites, domain, favoriteOnly, resultIds]);
  const selected = knowledge.entries.find(entry => entry.id === selectedId) ?? entries[0] ?? knowledge.entries[0];
  const choose = (id:string) => { setSelectedId(id); const entry=knowledge.entries.find(item=>item.id===id); if(entry)knowledge.recordVisit(entry); };
  return <section className={styles.index} data-self-styled>
    <header className={styles.indexHeader}><div className={styles.eyebrow}>KNOWLEDGE / 研究知识<span>{knowledge.entries.length} 个概念 · 8 个学科</span></div><h2>理解一个概念，<br/>推进一步研究。</h2><p>定义、例子、前提与来源，在同一处读清楚。</p><div className={styles.searchBox}><span aria-hidden="true">⌕</span><input disabled={!knowledge.ready} value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索概念、英文名称或缩写…" aria-label="搜索知识索引"/><button onClick={() => setQuery('')} aria-label="清空索引搜索">×</button></div></header>
    <div className={styles.domainFilters}><button aria-pressed={!domain} onClick={() => setDomain('')}>全部</button>{Object.entries(DOMAINS).map(([id, name]) => <button key={id} aria-pressed={domain === id} onClick={() => setDomain(id)}>{name}</button>)}<button aria-pressed={favoriteOnly} onClick={() => setFavoriteOnly(value => !value)}>☆ 收藏</button></div>
    <div className={styles.indexBody}><div className={styles.indexList}>{entries.map(entry => <button className={styles.result} key={entry.id} aria-pressed={selected?.id === entry.id} onClick={() => choose(entry.id)}><span className={styles.eyebrow}>{DOMAINS[entry.domain]}</span><strong>{entry.name}</strong><small>{entry.englishName}</small><p>{entry.definition}</p></button>)}{entries.length === 0 && <p className={styles.empty} role="status">{query.trim() && response?.query !== query ? '正在检索…' : '暂未找到匹配内容，试试别名或完整名称。'}</p>}</div><div className={styles.indexDetail}>{selected && <KnowledgeEntryView entry={selected} favorite={knowledge.favorites.includes(selected.id)} onFavorite={() => knowledge.toggleFavorite(selected.id)} onRelated={choose}/>}</div></div>
  </section>;
}
