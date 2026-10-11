'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, searchCatalog, type NodeKind } from '@/lib/canvas/catalog';
import { FLOW_TEMPLATES } from '@/lib/canvas/templates';
import { CATEGORY_GLYPH } from './CanvasNode';
import styles from './Canvas.module.css';

export const DRAG_MIME = 'application/x-evix-canvas-node';

/** Left 320px library: search, categories, click to add at the viewport centre or drag onto the canvas. */
export default function NodeLibrary({ onAdd, onTemplate, onClose }: { onAdd: (kind: NodeKind) => void; onTemplate: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'nodes' | 'flows'>('nodes');
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { search.current?.focus(); }, []);
  const results = useMemo(() => searchCatalog(query), [query]);
  return <aside className={styles.library} aria-label="节点库" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <header className={styles.panelHead}>
      <div className={styles.segmented} role="tablist" aria-label="节点库内容" onKeyDown={e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault(); const next = e.key === 'Home' ? 'nodes' : e.key === 'End' ? 'flows' : tab === 'nodes' ? 'flows' : 'nodes';
        setTab(next); e.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
      }}>
        <button type="button" role="tab" data-tab="nodes" tabIndex={tab === 'nodes' ? 0 : -1} aria-selected={tab === 'nodes'} onClick={() => setTab('nodes')}>节点</button>
        <button type="button" role="tab" data-tab="flows" tabIndex={tab === 'flows' ? 0 : -1} aria-selected={tab === 'flows'} onClick={() => setTab('flows')}>参考流程</button>
      </div>
      <button type="button" className={styles.iconButton} onClick={onClose} aria-label="关闭节点库">×</button>
    </header>
    {tab === 'nodes' ? <>
      <label className={styles.searchBox}><span className={styles.srOnly}>搜索节点</span><input ref={search} value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索：信度、交叉表、报告…" /></label>
      <div className={styles.libraryList}>
        {CATEGORIES.map(cat => {
          const items = results.filter(d => d.category === cat.id);
          if (!items.length) return null;
          return <section key={cat.id} aria-label={cat.title}>
            <h4>{cat.title}</h4>
            <ul>{items.map(d => <li key={d.kind}>
              <button type="button" className={styles.libraryItem} draggable data-category={d.category}
                onDragStart={e => { e.dataTransfer.setData(DRAG_MIME, d.kind); e.dataTransfer.effectAllowed = 'copy'; }}
                onClick={() => onAdd(d.kind)}>
                <span className={styles.glyph} aria-hidden="true">{CATEGORY_GLYPH[d.category]}</span>
                <span><strong>{d.title}</strong><small>{d.summary}</small>{d.capability !== 'run' && <em>{d.capability === 'reference' ? '引用：在原编辑器中修改' : '注释：不参与运行'}</em>}</span>
              </button>
            </li>)}</ul>
          </section>;
        })}
        {!results.length && <p className={styles.muted}>没有匹配的节点。</p>}
      </div>
      <p className={styles.libraryHint}>点击添加到视图中央，或拖到画布上的指定位置。</p>
    </> : <div className={styles.libraryList}>
      <p className={styles.muted}>插入后每个节点都可修改、删除或重新连接，不规定论文结构。</p>
      <ul>{FLOW_TEMPLATES.map(t => <li key={t.id}><button type="button" className={styles.libraryItem} onClick={() => onTemplate(t.id)}>
        <span className={styles.glyph} aria-hidden="true">流</span>
        <span><strong>{t.title}</strong><small>{t.description}</small><em>{t.nodes} 个节点</em></span>
      </button></li>)}</ul>
    </div>}
  </aside>;
}
