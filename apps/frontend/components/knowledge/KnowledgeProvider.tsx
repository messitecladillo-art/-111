'use client';
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { NAV_ITEMS, navHref, useThemePreference } from '@/components/workbench/shell-kit';
import { RESEARCH_METHOD_CARDS } from '@/lib/research-method-guide';
import { MATERIAL_CARDS } from '@/lib/research-materials';
import type { KnowledgeContext, KnowledgeEntry, KnowledgeSearchHit } from '@/lib/knowledge/types';
import { createKnowledgeSearchClient } from '@/lib/knowledge/worker-client';
import { contextFromLocation, recommendKnowledge, selectedKnowledgeText } from '@/lib/knowledge/context';
import KnowledgeEntryView from './KnowledgeEntryView';
import KnowledgeGuideView from './KnowledgeGuideView';
import useKnowledgeAccount from './useKnowledgeAccount';
import KnowledgeLookupPanel from './KnowledgeLookupPanel';
import KnowledgeProjectReferences from './KnowledgeProjectReferences';
import { KNOWLEDGE_ENTRIES, DOMAINS } from './catalog';
import styles from './Knowledge.module.css';
const KnowledgeRecognition = lazy(() => import('./KnowledgeRecognition'));

type FocusSnapshot = { element: HTMLElement | null; start?: number | null; end?: number | null; direction?: 'forward' | 'backward' | 'none' | null; range?: Range };
function captureFocus(): FocusSnapshot {
  const element = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const editable = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
  const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).cloneRange() : undefined;
  return { element, ...(editable ? { start: element.selectionStart, end: element.selectionEnd, direction: element.selectionDirection } : {}), range };
}
function restoreFocus(snapshot: FocusSnapshot | null) {
  if (!snapshot?.element?.isConnected || snapshot.element.closest('[hidden]')) return;
  snapshot.element.focus({ preventScroll: true });
  if ((snapshot.element instanceof HTMLInputElement || snapshot.element instanceof HTMLTextAreaElement) && snapshot.start != null) {
    try { snapshot.element.setSelectionRange(snapshot.start, snapshot.end ?? snapshot.start, snapshot.direction ?? undefined); } catch { /* Numeric controls do not expose text selection. */ }
  } else if (snapshot.range?.startContainer.isConnected && snapshot.range.endContainer.isConnected) {
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(snapshot.range);
  }
}
function subscribeHash(callback: () => void) { window.addEventListener('hashchange', callback); return () => window.removeEventListener('hashchange', callback); }
const subscribeHydration = () => () => {};
function scopeSnapshot() {
  const element = [...document.querySelectorAll('[data-knowledge-context="active"]')].find(node => !node.closest('[hidden]'));
  return element ? `${element.getAttribute('data-knowledge-module') ?? ''}|${element.getAttribute('data-knowledge-tags') ?? ''}` : '';
}
function subscribeScope(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'data-knowledge-context', 'data-knowledge-module', 'data-knowledge-tags'] });
  return () => observer.disconnect();
}
type KnowledgeControl = {
  entries: KnowledgeEntry[]; context: KnowledgeContext; favorites: string[]; ready:boolean;
  recordVisit: (entry: Pick<KnowledgeEntry,'id'|'version'>) => void;
  open: (entryId?: string, focusSearch?: boolean) => void; openSearch: () => void;
  search: (query: string) => Promise<KnowledgeSearchHit[]>; toggleFavorite: (entryId: string) => void;
};
const KnowledgeControlContext = createContext<KnowledgeControl | null>(null);
export function useKnowledge() { const value = useContext(KnowledgeControlContext); if (!value) throw Error('缺少知识镜上下文'); return value; }

export default function KnowledgeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname(), auth = useHostedSession(), theme = useThemePreference();
  const account = useKnowledgeAccount();
  const { recordVisit, updatePrefs, setFavorite } = account;
  const hash = useSyncExternalStore(subscribeHash, () => location.hash, () => '');
  const scope = useSyncExternalStore(subscribeScope, scopeSnapshot, () => '');
  const context = useMemo(() => { const [activeModule, tags] = scope.split('|'); return contextFromLocation(pathname, activeModule ? `#${activeModule}` : hash, tags?.split(',') ?? []); }, [pathname, hash, scope]);
  const visible = ['/workspace','/knowledge','/services','/preflight'].includes(pathname) || pathname.startsWith('/projects') || pathname.startsWith('/examples/');
  const researchPage = visible && pathname !== '/services';
  const mounted = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const [shown, setShown] = useState(false), [mode, setMode] = useState<'float' | 'pinned' | 'reading'>('float');
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState(''), [hits, setHits] = useState<KnowledgeSearchHit[]>([]), [selectedId, setSelectedId] = useState('');
  const [guide,setGuide]=useState<{kind:'method'|'material';id:string}|null>(null);
  const favorites = useMemo(() => account.state.favorites.filter(reference => KNOWLEDGE_ENTRIES.some(entry => entry.id === reference.entryId && entry.version === reference.entryVersion)).map(reference => reference.entryId), [account.state.favorites]);
  const [notice, setNotice] = useState(''), [searching, setSearching] = useState(false), [recognitionOpen,setRecognitionOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null), [obscured, setObscured] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false), [commandQuery, setCommandQuery] = useState(''), [commandHits, setCommandHits] = useState<KnowledgeSearchHit[]>([]), [commandIndex, setCommandIndex] = useState(0);
  const searchClient = useRef<ReturnType<typeof createKnowledgeSearchClient> | null>(null), searchInput = useRef<HTMLInputElement>(null), panel = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null), commandInput = useRef<HTMLInputElement>(null), originalFocus = useRef<FocusSnapshot | null>(null), commandFocus = useRef<FocusSnapshot | null>(null);
  const composition = useRef(false), deferredAction = useRef<(() => void) | null>(null), scrollPositions = useRef(new Map<string, number>());
  const [entryTabs,setEntryTabs] = useState<Record<string,string>>({});
  const restoredPreferences=useRef(false), changedPreferences=useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null), searchSequence = useRef(0), commandSequence = useRef(0);
  const selected = KNOWLEDGE_ENTRIES.find(entry => entry.id === selectedId);
  const recommendations = useMemo(() => recommendKnowledge(KNOWLEDGE_ENTRIES, context, 3), [context]);
  useEffect(() => {
    if(restoredPreferences.current || account.status==='loading')return;
    restoredPreferences.current=true;
    if(changedPreferences.current)return;
    const prefs=account.state.preferences;let active=true;
    queueMicrotask(()=>{if(!active)return;if(prefs.mode)setMode(prefs.mode);if(prefs.query!==undefined)setQuery(prefs.query);
      if(prefs.x!==undefined&&prefs.y!==undefined)setPosition({x:Math.max(12,prefs.x*Math.max(1,innerWidth-400)),y:Math.max(12,prefs.y*Math.max(1,innerHeight-560))});
      if(prefs.scrollEntryId&&prefs.scrollTop!==undefined)scrollPositions.current.set(prefs.scrollEntryId,prefs.scrollTop);
    });
    return()=>{active=false;};
  },[account.status,account.state.preferences]);
  const changeQuery = useCallback((text:string,persist=true)=>{
    setQuery(text);setSearching(Boolean(text.trim()));setHits([]);setSelectedId('');
    if(persist){changedPreferences.current=true;if(!composition.current&&text.length<=120&&!/[\u0000-\u001f\u007f\u2028\u2029]/.test(text))updatePrefs({query:text});}
  },[updatePrefs]);
  const recognize = useCallback((text:string)=>searchClient.current?searchClient.current.recognize(text,{limit:8,context}):Promise.resolve([]),[context]);

  useEffect(() => { if (!visible) return; let current=true; const client = createKnowledgeSearchClient(KNOWLEDGE_ENTRIES); searchClient.current = client; void client.ready.then(()=>{if(current)setReady(true);}); return () => { current=false; client.dispose(); searchClient.current = null; }; }, [visible]);
  const search = useCallback((text: string) => searchClient.current ? searchClient.current.search(text, { limit: 12, context }) : Promise.resolve([]), [context]);
  useEffect(() => {
    const sequence = ++searchSequence.current;
    if (!shown || commandOpen || !query.trim()) return;
    let current = true;
    const timer = setTimeout(() => { setSearching(true); void search(query).then(result => { if (current && sequence === searchSequence.current) { setHits(result); setSearching(false); } }).catch(() => { if (current && sequence === searchSequence.current) { setNotice('检索暂未完成，请重试。'); setSearching(false); } }); }, 100);
    return () => { current = false; clearTimeout(timer); };
  }, [query, search, shown, commandOpen]);
  useEffect(() => {
    const sequence = ++commandSequence.current;
    if (!commandOpen || !commandQuery.trim()) return;
    let current = true;
    const timer = setTimeout(() => { void search(commandQuery).then(result => { if (current && sequence === commandSequence.current) setCommandHits(result); }).catch(() => { if (current && sequence === commandSequence.current) setCommandHits([]); }); }, 100);
    return () => { current = false; clearTimeout(timer); };
  }, [commandOpen, commandQuery, search]);

  const afterComposition = useCallback((action: () => void) => { if (composition.current) deferredAction.current = action; else action(); }, []);
  useEffect(() => {
    const start = () => { composition.current = true; };
    const end = () => { composition.current = false; const pending = deferredAction.current; deferredAction.current = null; if (pending) queueMicrotask(pending); };
    document.addEventListener('compositionstart', start, true); document.addEventListener('compositionend', end, true);
    return () => { deferredAction.current = null; document.removeEventListener('compositionstart', start, true); document.removeEventListener('compositionend', end, true); };
  }, []);
  const open = useCallback((entryId?: string, focusSearch = true) => afterComposition(() => {
    if (document.querySelector('dialog[open], [aria-modal="true"]')) return;
    originalFocus.current ??= captureFocus();
    if (entryId) { setGuide(null); setSelectedId(entryId);const entry=KNOWLEDGE_ENTRIES.find(item=>item.id===entryId);if(entry)recordVisit(entry); }
    setShown(true);
    if (focusSearch) requestAnimationFrame(() => searchInput.current?.focus());
  }), [afterComposition,recordVisit]);
  const close = useCallback(() => afterComposition(() => { setShown(false); restoreFocus(originalFocus.current); originalFocus.current = null; }), [afterComposition]);
  const openSearch = useCallback(() => afterComposition(() => {
    if (document.querySelector('dialog[open], [aria-modal="true"]')) return;
    commandFocus.current = captureFocus(); setCommandQuery(''); setCommandHits([]); setCommandIndex(0); setCommandOpen(true);
  }), [afterComposition]);
  const toggleFavorite = useCallback((entryId:string)=>{const entry=KNOWLEDGE_ENTRIES.find(item=>item.id===entryId);if(entry)setFavorite(entry);},[setFavorite]);
  useEffect(() => {
    if (!visible) return;
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k' && !event.isComposing) { event.preventDefault(); if (commandOpen) setCommandOpen(false); else openSearch(); }
      if (event.key === 'Escape' && shown && !commandOpen && !event.isComposing && !document.querySelector('dialog[open], [aria-modal="true"]')) { event.preventDefault(); close(); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [visible, commandOpen, shown, close, openSearch]);
  useEffect(() => {
    const node = dialog.current; if (!node || !commandOpen) return;
    node.showModal(); commandInput.current?.focus();
    return () => { node.close(); restoreFocus(commandFocus.current); };
  }, [commandOpen]);
  useEffect(() => {
    const detect = () => setObscured(Boolean(document.querySelector('dialog[open]:not([data-knowledge-dialog]), [aria-modal="true"]')));
    const observer = new MutationObserver(detect); observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'aria-modal'], childList: true }); detect(); return () => observer.disconnect();
  }, []);
  useEffect(() => { document.body.dataset.knowledgeDocked = String(shown && mode === 'pinned' && visible && !obscured); return () => { delete document.body.dataset.knowledgeDocked; }; }, [shown, mode, visible, obscured]);
  useEffect(() => {
    const bound = () => setPosition(current => current ? { x: Math.max(12, Math.min(current.x, innerWidth - Math.min(400, innerWidth - 24) - 12)), y: Math.max(12, Math.min(current.y, innerHeight - Math.min(560, innerHeight - 24) - 12)) } : null);
    window.addEventListener('resize', bound); return () => window.removeEventListener('resize', bound);
  }, []);
  useEffect(() => { if (selectedId && panel.current) panel.current.scrollTop = scrollPositions.current.get(selectedId) ?? 0; }, [selectedId, shown, mode, obscured]);

  const choose = useCallback((id:string)=>{setGuide(null);setSelectedId(id);setNotice('');const entry=KNOWLEDGE_ENTRIES.find(item=>item.id===id);if(entry)recordVisit(entry);},[recordVisit]);
  const switchMode = (next:typeof mode)=>afterComposition(()=>{changedPreferences.current=true;setMode(next);if(next!=='reading')updatePrefs({mode:next});});
  const finishDrag = (node:HTMLElement)=>{if(!drag.current)return;const rect=node.parentElement!.getBoundingClientRect();drag.current=null;changedPreferences.current=true;updatePrefs({x:Math.max(0,Math.min(1,rect.left/Math.max(1,innerWidth-400))),y:Math.max(0,Math.min(1,rect.top/Math.max(1,innerHeight-560)))});};
  const recognized = () => {
    const text = selectedKnowledgeText(document);
    if (text) { changeQuery(text,false); setNotice('已读取你的选区，可以修改检索词。'); }
    else { setNotice('已定位当前环节，下方推荐可直接展开。'); setSelectedId(''); }
  };
  const commandResults = useMemo(() => {
    const q = commandQuery.trim().toLocaleLowerCase();
    const navigation = NAV_ITEMS.filter(item => !q || `${item.title} ${item.description} ${item.id}`.toLowerCase().includes(q)).map(item => ({ id: `function-${item.id}`, name: item.title, group: '功能', detail: item.description, action: () => { setCommandOpen(false); const href = navHref(item.id, pathname === '/workspace'); if (href.startsWith('#')) location.hash = item.id; else auth.navigate(href); } }));
    const knowledge = commandHits.map(hit => ({ id: `entry-${hit.entry.id}`, name: hit.entry.name, group: DOMAINS[hit.entry.domain], detail: hit.entry.definition, action: () => { setCommandOpen(false); originalFocus.current = commandFocus.current; choose(hit.entry.id); setShown(true); } }));
    const showGuide = (kind:'method'|'material',id:string)=>{setCommandOpen(false);originalFocus.current=commandFocus.current;setGuide({kind,id});setShown(true);};
    const methods = q ? RESEARCH_METHOD_CARDS.filter(card => `${card.title} ${card.researchQuestion}`.toLowerCase().includes(q)).slice(0, 4).map(card => ({ id: `method-${card.id}`, name: card.title, group: '方法', detail: card.researchQuestion, action: () => showGuide('method',card.id) })) : [];
    const materials = q ? MATERIAL_CARDS.filter(card => `${card.title} ${card.researchQuestion}`.toLowerCase().includes(q)).slice(0, 4).map(card => ({ id: `material-${card.id}`, name: card.title, group: '资料', detail: card.researchQuestion, action: () => showGuide('material',card.id) })) : [];
    return [...knowledge, ...navigation, ...methods, ...materials].slice(0, 30);
  }, [commandQuery, commandHits, pathname, auth,choose]);
  const activeCommand = commandResults[Math.min(commandIndex, Math.max(0, commandResults.length - 1))];
  useEffect(() => { if (commandOpen && activeCommand) document.getElementById(activeCommand.id)?.scrollIntoView({ block: 'nearest' }); }, [commandOpen, activeCommand]);
  const control = useMemo<KnowledgeControl>(() => ({ entries: KNOWLEDGE_ENTRIES, context, favorites, ready, open, openSearch, search, toggleFavorite, recordVisit }), [context, favorites, ready, open, openSearch, search, toggleFavorite,recordVisit]);

  return <KnowledgeControlContext.Provider value={control}>{children}{mounted && visible && createPortal(<div className={styles.root} data-theme={theme}>
    {!shown && !obscured && researchPage && <button className={styles.launcher} onPointerDown={event => event.preventDefault()} onClick={() => open()} aria-label="展开知识镜" title="知识镜"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 6 6M7 10h6M10 7v6"/></svg><span>知识镜</span></button>}
    <aside hidden={!shown||obscured} className={`${styles.mirror} ${styles[mode === 'reading' ? 'expanded' : mode]}`} style={{...(!shown||obscured?{display:'none'}:{}),...(mode==='float'&&position?{left:position.x,top:position.y,right:'auto',bottom:'auto'}:{})}} aria-label="知识镜" onPointerDownCapture={()=>{const active=document.activeElement;if(active instanceof HTMLElement && !active.closest(`.${styles.root}`))originalFocus.current=captureFocus();}}>
      <header className={styles.mirrorHeader} onPointerDown={event => {
        if (mode !== 'float' || event.button !== 0 || (event.target as HTMLElement).closest('button,a,input')) return;
        const rect = event.currentTarget.parentElement!.getBoundingClientRect(); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }; event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={event => { const current = drag.current; if (!current || current.id !== event.pointerId) return; setPosition({ x: Math.max(12, Math.min(current.left + event.clientX - current.x, innerWidth - 412)), y: Math.max(12, Math.min(current.top + event.clientY - current.y, innerHeight - Math.min(560, innerHeight - 24) - 12)) }); }} onPointerUp={event=>finishDrag(event.currentTarget)} onPointerCancel={()=>{const current=drag.current;if(current)setPosition({x:current.left,y:current.top});drag.current=null;}} onLostPointerCapture={() => { drag.current = null; }}>
        <div><span className={styles.lensMark}>◈</span><strong>知识镜</strong></div><div>
          <button aria-label={mode === 'pinned' ? '解除固定' : '固定到右侧'} onClick={() => switchMode(mode === 'pinned' ? 'float' : 'pinned')}>{mode === 'pinned' ? '浮动' : '固定'}</button>
          <button aria-label={mode === 'reading' ? '退出展开阅读' : '展开阅读'} onClick={() => switchMode(mode === 'reading' ? 'float' : 'reading')}>{mode === 'reading' ? '还原' : '放大'}</button>
          <button aria-label="收拢知识镜" onClick={close}>收拢</button>
        </div>
      </header>
      <div className={styles.searchBox}><span aria-hidden="true">⌕</span><input ref={searchInput} disabled={!ready} value={query} maxLength={120} onChange={event=>changeQuery(event.target.value)} onCompositionEnd={event=>changeQuery(event.currentTarget.value)} placeholder="概念、英文名、缩写或问题…" aria-label="搜索知识"/><button onClick={()=>changeQuery('')} aria-label="清空知识搜索">×</button></div>
      <div className={styles.context}><span>当前环节 · {context.label}</span><button onClick={recognized}>识别当前页</button></div>
      <div ref={panel} className={styles.mirrorBody} onScroll={event => { if (selectedId) {scrollPositions.current.set(selectedId,event.currentTarget.scrollTop);updatePrefs({scrollEntryId:selectedId,scrollTop:event.currentTarget.scrollTop});} }}>
        {guide ? <><button className={styles.back} onClick={()=>setGuide(null)}>← 返回检索</button><KnowledgeGuideView kind={guide.kind} id={guide.id}/></> : selected ? <><button className={styles.back} onClick={() => setSelectedId('')}>← 返回检索</button><KnowledgeEntryView entry={selected} onRelated={choose} favorite={favorites.includes(selected.id)} onFavorite={() => toggleFavorite(selected.id)} notice={notice} initialTab={entryTabs[selected.id]} onTabChange={value => setEntryTabs(previous => ({...previous,[selected.id]:value}))}/></> : <>
          {!query.trim() && <><p className={styles.caption}>你可能在找</p><div className={styles.suggestions}>{recommendations.map(entry => <button key={entry.id} onClick={() => choose(entry.id)}>{entry.name}<span>↗</span></button>)}</div><p className={styles.caption}>从一个概念开始</p><div className={styles.domainGrid}>{Object.entries(DOMAINS).map(([domain, name]) => <button key={domain} onClick={() => changeQuery(KNOWLEDGE_ENTRIES.find(entry => entry.domain === domain)?.name ?? name)}>{name}</button>)}</div>{favorites.length > 0 && <><p className={styles.caption}>我的收藏</p>{KNOWLEDGE_ENTRIES.filter(entry => favorites.includes(entry.id)).map(entry => <button className={styles.result} key={entry.id} onClick={() => choose(entry.id)}><strong>{entry.name}</strong><small>{DOMAINS[entry.domain]}</small></button>)}</>}{account.state.recent.length>0&&<><p className={styles.caption}>最近阅读</p>{account.state.recent.slice(0,5).map(reference=>{const entry=KNOWLEDGE_ENTRIES.find(item=>item.id===reference.entryId);return entry?<button className={styles.result} key={`${reference.entryId}:${reference.entryVersion}`} onClick={()=>choose(entry.id)}><strong>{entry.name}</strong><small>{entry.version===reference.entryVersion?`v${entry.version}`:`此前阅读 v${reference.entryVersion} · 当前 v${entry.version}`}</small></button>:null;})}</>}</>}
          {query.trim() && <>{searching && <p role="status">正在检索…</p>}{!searching && hits.length === 0 && <p className={styles.empty}>暂未找到这个概念，试试完整名称或常见别名。</p>}{hits.map(hit => <button key={hit.entry.id} className={styles.result} onClick={() => choose(hit.entry.id)}><span className={styles.eyebrow}>{DOMAINS[hit.entry.domain]}{hit.ambiguous && ' · 同名概念'}</span><strong>{hit.entry.name}</strong><small>{hit.entry.englishName}</small><p>{hit.entry.definition}</p></button>)}</>}
          {notice && <p className={styles.notice} role="status">{notice}</p>}
        </>}
        {account.notice&&<p className={styles.notice} role="status">{account.notice}</p>}
        {['unknown','conflict','error'].includes(account.status)&&<div className={styles.entryActions}><button onClick={()=>void account.reload()}>重新读取</button>{account.status==='unknown'&&<button onClick={()=>void account.reconcile()}>核对保存</button>}{account.status==='conflict'&&<button onClick={()=>void account.discardLocalAndReload()}>放弃本地改动并载入云端</button>}</div>}
        <details className={styles.recognition} onToggle={event=>setRecognitionOpen(event.currentTarget.open)}><summary>识别 PDF 或图片中的概念</summary>{recognitionOpen&&shown&&!obscured&&<Suspense fallback={<p role="status">正在打开识别工具…</p>}><KnowledgeRecognition embedded recognize={recognize} onChoose={choose}/></Suspense>}</details>
        <KnowledgeProjectReferences projectId={context.projectId} selected={selected} onChoose={choose}/>
        <KnowledgeLookupPanel initialQuery={selected?.name??query.slice(0,120)}/>
      </div><footer className={styles.mirrorFooter}><a href="/knowledge">浏览知识索引 ↗</a><span>{account.status==='guest'?'本页收藏':account.status==='saving'?'正在同步…':account.status==='unknown'?'待核对':account.status==='ready'&&!account.dirty?'已同步':account.dirty?'等待同步':`${KNOWLEDGE_ENTRIES.length} 个概念`}</span></footer>
    </aside>
    <dialog ref={dialog} className={styles.command} data-knowledge-dialog aria-label="全局搜索" onCancel={() => setCommandOpen(false)}>
      <div className={styles.commandInput}><span aria-hidden="true">⌕</span><input ref={commandInput} value={commandQuery} onChange={event => { setCommandQuery(event.target.value); setCommandHits([]); setCommandIndex(0); }} placeholder="搜索知识、方法、资料与功能…" aria-label="全局搜索" role="combobox" aria-expanded={commandOpen} aria-controls="knowledge-command-results" aria-activedescendant={activeCommand?.id} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setCommandIndex(index => commandResults.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + commandResults.length) % commandResults.length : 0); }
        if (event.key === 'Enter' && activeCommand) { event.preventDefault(); activeCommand.action(); }
      }}/><button onClick={() => setCommandOpen(false)} aria-label="关闭全局搜索">Esc</button></div>
      <div id="knowledge-command-results" role="listbox" className={styles.commandResults}>{commandResults.map(item => <button id={item.id} key={item.id} role="option" aria-selected={activeCommand?.id === item.id} onClick={item.action}><span>{item.group}</span><strong>{item.name}</strong><small>{item.detail}</small></button>)}{commandResults.length === 0 && <p>没有找到对应内容，请换一个关键词。</p>}</div>
      <footer>↑↓ 选择 · Enter 打开 · Ctrl / ⌘ K 搜索</footer>
    </dialog>
  </div>, document.body)}</KnowledgeControlContext.Provider>;
}
