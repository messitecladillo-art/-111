'use client';

import { useState } from 'react';
import { RESEARCH_GUIDE_SOURCES, RESEARCH_METHOD_CARDS } from '@/lib/research-method-guide';
import { useContentReveal, useKeyedListMotion } from '@/components/motion/useWorkspaceMotion';
import styles from './ResearchMethodGuide.module.css';

export default function ResearchMethodGuide() {
  const [activeId, setActiveId] = useState(RESEARCH_METHOD_CARDS[0].id);
  const card = RESEARCH_METHOD_CARDS.find(item => item.id === activeId) ?? RESEARCH_METHOD_CARDS[0];
  const directory = useKeyedListMotion<HTMLElement>({ ids: RESEARCH_METHOD_CARDS.map(item => item.id), activeId: card.id });
  const reveal = useContentReveal<HTMLElement>({ token: card.id });
  const sources = RESEARCH_GUIDE_SOURCES.filter(source => card.sourceRefs.includes(source.id));

  return <details className={styles.guide}>
    <summary><span>研究方法指南</span><small>从问题选方法，再核对条件与诊断</small></summary>
    <div className={styles.workspace}>
      <nav ref={directory} className={styles.directory} aria-label="研究方法指南目录">
        <span className={styles.marker} data-motion-marker aria-hidden="true" />
        {RESEARCH_METHOD_CARDS.map((item, index) => <button key={item.id} type="button" data-motion-id={item.id} aria-pressed={item.id === card.id} onClick={() => setActiveId(item.id)}>
          <span>{String(index + 1).padStart(2, '0')}</span><strong>{item.title}</strong>
        </button>)}
      </nav>
      <article ref={reveal} className={styles.content} aria-label={card.title}>
        <header><span className={styles.scope} data-available={card.availability === 'implemented'}>{card.availability === 'implemented' ? '已有基础能力' : '方法指引 · 待接入'}</span><h4>{card.title}</h4><p>{card.researchQuestion}</p></header>
        <p className={styles.implementation}>{card.implementationScope}</p>
        <div className={styles.columns}>
          <section><h5>开始前</h5><ul>{card.preconditions.map(text => <li key={text}>{text}</li>)}</ul></section>
          <section><h5>怎么做</h5><ol>{card.steps.map(text => <li key={text}>{text}</li>)}</ol></section>
          <section><h5>检查什么</h5><ul>{card.diagnostics.map(text => <li key={text}>{text}</li>)}</ul></section>
          <section><h5>留下什么</h5><ul>{card.outputs.map(text => <li key={text}>{text}</li>)}</ul></section>
        </div>
        <section className={styles.limits}><h5>解释范围</h5><ul>{card.limits.map(text => <li key={text}>{text}</li>)}</ul></section>
        <details className={styles.sources}><summary>方法依据</summary><ul>{sources.map(source => <li key={source.id}>{source.url.startsWith('https://') ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> : <strong>{source.title}</strong>}<span>{source.coverage}</span></li>)}</ul></details>
      </article>
    </div>
  </details>;
}
