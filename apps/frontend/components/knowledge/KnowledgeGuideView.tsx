'use client';
import { RESEARCH_GUIDE_SOURCES, RESEARCH_METHOD_CARDS } from '@/lib/research-method-guide';
import { MATERIAL_CARDS, MATERIAL_SOURCES } from '@/lib/research-materials';
import styles from './Knowledge.module.css';
export default function KnowledgeGuideView({ kind, id }: { kind:'method'|'material';id:string }) {
  const card = kind === 'method' ? RESEARCH_METHOD_CARDS.find(item=>item.id===id) : MATERIAL_CARDS.find(item=>item.id===id);
  if (!card) return <p className={styles.empty}>这份内容暂时不可用，请重新检索。</p>;
  const sections = [['使用前提', card.preconditions],['怎么做',card.steps],['检查什么',card.diagnostics],['会得到什么',card.outputs],['解释范围',card.limits]] as const;
  return <article className={styles.entry}><div className={styles.eyebrow}>{kind === 'method' ? '方法卡' : '研究资料'}</div><h2>{card.title}</h2><section className={styles.reading}><p className={styles.definition}>{card.researchQuestion}</p>{sections.map(([label,paragraphs])=><div key={label}><h3>{label}</h3>{paragraphs.map((text,i)=><p key={i}>{text}</p>)}</div>)}<h3>资料定位</h3>{kind==='method' ? RESEARCH_METHOD_CARDS.find(item=>item.id===id)?.sourceRefs.map(sourceId=>{const source=RESEARCH_GUIDE_SOURCES.find(item=>item.id===sourceId);return source ? <div key={source.id} className={styles.source}>{source.url.startsWith('https:') ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a> : <strong>{source.title}</strong>}<p>{source.coverage}</p></div> : null;}) : MATERIAL_CARDS.find(item=>item.id===id)?.sourceRefs.map(ref=>{const source=MATERIAL_SOURCES.find(item=>item.id===ref.sourceId);return <div key={ref.sourceId} className={styles.source}><strong>{source?.filename ?? ref.sourceId}</strong><p>{ref.locators.join(' · ')}</p></div>;})}</section></article>;
}
