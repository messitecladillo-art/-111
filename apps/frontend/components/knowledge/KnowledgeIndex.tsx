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
  const selected = entries.find(entry => entry.id === selectedId) ?? entries[0];
  const searching = !!query.trim() && response?.query !== query;
  const filtered = !!query.trim() || !!domain || favoriteOnly;
  const resetFilters = () => { setQuery(''); setDomain(''); setFavoriteOnly(false); };
  const choose = (id:string) => { setSelectedId(id); const entry=knowledge.entries.find(item=>item.id===id); if(entry)knowledge.recordVisit(entry); };
  const chooseRelated = (id:string) => { resetFilters(); choose(id); };
  return <section className={styles.index} data-self-styled>
    <header className={styles.indexHeader}><div><p className={styles.indexCaption}>研究知识</p><h2>查概念，也查依据。</h2></div><div className={styles.searchBox}><span aria-hidden="true">⌕</span><input disabled={!knowledge.ready} value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索概念、英文名称或缩写…" aria-label="搜索知识索引"/><button disabled={!query} onClick={() => setQuery('')} aria-label="清空索引搜索">×</button></div></header>
    <div className={styles.domainFilters} aria-label="知识学科"><button aria-pressed={!domain} onClick={() => setDomain('')}>全部学科</button>{Object.entries(DOMAINS).map(([id, name]) => <button key={id} aria-pressed={domain === id} onClick={() => setDomain(id)}>{name}</button>)}<button className={styles.favoriteFilter} aria-pressed={favoriteOnly} onClick={() => setFavoriteOnly(value => !value)}>☆ 收藏</button></div>
    <div className={styles.indexSummary}><span role="status">{!knowledge.ready ? '正在准备知识库…' : searching ? '正在检索…' : `找到 ${entries.length} 个概念`}</span>{filtered ? <button onClick={resetFilters}>重置筛选</button> : <span>{knowledge.entries.length} 个概念 · {Object.keys(DOMAINS).length} 个学科</span>}</div>
    <div className={styles.indexBody}><div className={styles.indexList} aria-label="概念列表">{entries.map(entry => <button className={styles.result} key={entry.id} aria-pressed={selected?.id === entry.id} onClick={() => choose(entry.id)}><span className={styles.eyebrow}>{DOMAINS[entry.domain]}</span><strong>{entry.name}</strong><small>{entry.englishName}</small><p>{entry.definition}</p></button>)}{entries.length === 0 && <p className={styles.empty}>{searching ? '正在检索…' : favoriteOnly ? '当前筛选下还没有收藏。' : '没有匹配的概念，试试别名或完整名称。'}</p>}</div><div className={styles.indexDetail}>{selected ? <KnowledgeEntryView entry={selected} favorite={knowledge.favorites.includes(selected.id)} onFavorite={() => knowledge.toggleFavorite(selected.id)} onRelated={chooseRelated}/> : <div className={styles.detailEmpty}><span aria-hidden="true">⌕</span><h3>{!knowledge.ready || searching ? '正在查找概念' : '换个关键词试试'}</h3><p>{favoriteOnly ? '切换到全部概念，找到需要的内容再收藏。' : '支持中文、英文名称和常见缩写。'}</p>{filtered && !searching && <button onClick={resetFilters}>查看全部概念</button>}</div>}</div></div>
  </section>;
}
