'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { turnText } from '@/lib/agent/chat';
import { Icon } from './icons';
import { tidyTitle as tidy, type Book, type Thread } from './threads';
import { thousands } from '@/lib/agent/chat';
import type { RoomId } from '@/lib/agent/rooms';
import { hubForTab, STUDIO_HUBS, type StudioTabId } from './studios/StudioPanel';
import styles from './AgentShell.module.css';

type Props = {
  book: Book;
  projects: { id: string; label: string }[];
  account: 'loading' | 'guest' | 'ready';
  email: string;
  /** The account service could not be reached; the footer offers to reconnect, as the classic frame does. */
  failed: boolean;
  onRetry: () => void;
  /** Why the last sign-out or reconnection failed. */
  notice: string;
  onNew: (projectId: string | null) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onCollapse: () => void;
  /** The research path, each step with how much evidence it holds where that is measured (null: not measured). */
  stages: { id: RoomId; name: string; glyph: string; score: number | null }[];
  openRoom: RoomId | null;
  onRoom: (id: RoomId) => void;
  /** Registered results, newest first; one opens beside the conversation. */
  outputs: { id: string; title: string; detail: string }[];
  openOutput: string | null;
  onOutput: (id: string) => void;
  /** Tokens the model calls in this browser reported today. */
  todayTokens: number;
  onModels: () => void;
  onExport: (() => void) | null;
  onLogout: () => void;
  /** While the report fills the centre, its navigation takes the place of the conversation list. */
  nav?: ReactNode;
  activeStudio?: StudioTabId | null;
  onOpenStudio?: (tab: StudioTabId | null) => void;
  studioContent?: ReactNode;
  steeringCount?: number;
};

/** Where a conversation's words hold what is searched for: a few words either side of the first place. */
function excerpt(thread: Thread, wanted: string): string | null {
  const needle = wanted.toLowerCase();
  for (const m of thread.messages) {
    const text = (m.role === 'user' ? m.text : m.role === 'agent' ? turnText(m.turn, Infinity) : '').replace(/\s+/gu, ' ');
    const at = text.toLowerCase().indexOf(needle);
    if (at < 0) continue;
    const from = Math.max(0, at - 10), to = at + needle.length + 24;
    return `${from > 0 ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`;
  }
  return null;
}

/**
 * Conversations, as in Codex: a new one at the top, then the account's projects with the conversations filed under
 * them, then the rest by recency. Search reads titles and what was said. A conversation can be renamed in place;
 * deleting asks once more in place and removes the conversation only, never project work.
 */
export default function Sidebar({ book, projects, account, email, failed, onRetry, notice, onNew, onSelect, onRemove, onRename, onCollapse, stages, openRoom, onRoom, outputs, openOutput, onOutput, todayTokens, onModels, onExport, onLogout, nav, activeStudio = null, onOpenStudio, studioContent, steeringCount = 0 }: Props) {
  const [menu, setMenu] = useState(false);
  const [allOutputs, setAllOutputs] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // The conversation being renamed and its name when editing began; cleared once saved or abandoned, so the field's
  // blur does not save it again.
  const editing = useRef<{ id: string; from: string } | null>(null);
  const wanted = query.trim();
  // What the search found: a conversation whose title matches, or else an excerpt of where its words do.
  const found = useMemo(() => {
    if (!wanted) return null;
    const hits = new Map<string, string | null>();
    for (const t of book.threads) {
      if (t.title.toLowerCase().includes(wanted.toLowerCase())) hits.set(t.id, null);
      else { const words = excerpt(t, wanted); if (words) hits.set(t.id, words); }
    }
    return hits;
  }, [book.threads, wanted]);
  const recent = [...book.threads].sort((a, b) => b.updatedAt - a.updatedAt).filter(t => !found || found.has(t.id));
  const startRename = (thread: Thread) => { setConfirming(null); editing.current = { id: thread.id, from: thread.title }; setRenaming(thread.id); };
  // Only a name the user changed is saved: leaving the field untouched must not put back the name it opened with over
  // one another tab has given since.
  const finishRename = (id: string, title: string | null) => {
    const edit = editing.current;
    if (edit?.id !== id) return;
    editing.current = null;
    setRenaming(null);
    if (title !== null && tidy(title) !== tidy(edit.from)) onRename(id, title);
  };
  // A conversation shows once: under its project when that project is listed, otherwise among the recent ones.
  const listed = account === 'ready' ? new Set(projects.map(p => p.id)) : new Set<string>();
  const loose = recent.filter(t => !t.projectId || !listed.has(t.projectId));
  const row = (thread: Thread, nested = false) => {
    const words = found?.get(thread.id);
    return <div key={thread.id} className={styles.thread} data-active={thread.id === book.active} data-nested={nested}>
      {renaming === thread.id
        ? <input className={styles.threadRename} autoFocus defaultValue={thread.title} maxLength={80} aria-label={`重命名对话「${thread.title}」：Enter 保存，Esc 取消`}
            onFocus={event => event.currentTarget.select()} onBlur={event => finishRename(thread.id, event.currentTarget.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); finishRename(thread.id, event.currentTarget.value); }
              if (event.key === 'Escape') { event.preventDefault(); finishRename(thread.id, null); }
            }} />
        : <button type="button" onClick={() => onSelect(thread.id)} onDoubleClick={() => startRename(thread)} aria-current={thread.id === book.active ? 'true' : undefined} title={thread.title}>
            {thread.title}{words && <small>{words}</small>}
          </button>}
      {renaming !== thread.id && <span className={styles.threadMenu} data-confirming={confirming === thread.id}>
        {confirming === thread.id ? <>
          <button type="button" data-danger="true" onClick={() => { onRemove(thread.id); setConfirming(null); }}>确认删除</button>
          <button type="button" onClick={() => setConfirming(null)}>取消</button>
        </> : <>
          <button type="button" aria-label={`重命名对话「${thread.title}」`} onClick={() => startRename(thread)}>重命名</button>
          <button type="button" aria-label={`删除对话「${thread.title}」`} onClick={() => setConfirming(thread.id)}>删除</button>
        </>}
      </span>}
    </div>;
  };

  return <aside className={styles.sidebar} aria-label="对话与项目">
    <div className={styles.sideHead}>
      <span className={styles.brandName}>证见<small>EVI-X</small></span>
      <Link href="/workspace" className={styles.sideBackLink} title="返回研究工作台">← 工作台</Link>
      <span className={styles.spacer} />
      <button type="button" className={styles.iconButton} aria-label="搜索对话" aria-pressed={searching} onClick={() => { setSearching(!searching); setQuery(''); }}><Icon name="search" /></button>
      <button type="button" className={styles.iconButton} aria-label="收起侧栏（Ctrl B）" title="收起侧栏（Ctrl B）" onClick={onCollapse}><Icon name="sidebar" /></button>
    </div>
    {searching && <input className={styles.sideSearch} autoFocus value={query} placeholder="搜索对话标题与内容" aria-label="搜索对话标题与内容" onChange={event => setQuery(event.target.value)} />}
    <nav className={styles.sideScroll} aria-label={nav ? "报告" : "对话"}>
      {onOpenStudio && !activeStudio && (
        <section className={styles.studioDock} aria-label="Agent 核心创作工坊">
          <div className={styles.studioDockHead}>
            <span>创作工坊</span>
            <small>{steeringCount > 0 ? `${steeringCount}条指令` : '4 组核心能力'}</small>
          </div>
          <div className={styles.studioPillGrid}>
            {STUDIO_HUBS.map(hub => {
              const active = activeStudio ? hubForTab(activeStudio).id === hub.id : false;
              return (
                <button
                  key={hub.id}
                  type="button"
                  className={styles.studioPill}
                  aria-pressed={active}
                  onClick={() => onOpenStudio(active ? null : hub.defaultTab)}
                  title={hub.label}
                >
                  <span>{hub.icon}</span>
                  <span>{hub.short}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {activeStudio && studioContent ? studioContent : (nav ?? <>
      <button type="button" className={styles.sideItem} onClick={() => onNew(null)} aria-current={book.active === null ? 'true' : undefined}><Icon name="edit" />新对话</button>
      {!wanted && <>
        <details className={styles.sideGroup} open>
        <summary>研究进度 <Icon name="down" /></summary>
        <ol className={styles.stages}>
          {stages.map(stage => {
            const state = stage.score === null ? 'unmeasured' : stage.score >= 0.999 ? 'done' : stage.score > 0 ? 'active' : 'empty';
            return <li key={stage.id}><button type="button" data-state={state} aria-current={openRoom === stage.id ? 'true' : undefined} onClick={() => onRoom(stage.id)}
              title={stage.score === null ? `${stage.name}：打开模块` : `${stage.name}：证据照度 ${Math.round(stage.score * 100)}%`}>
              <span className={styles.stageMark} aria-hidden="true">{state === 'done' ? <Icon name="check" /> : stage.glyph}</span>
              <span className={styles.stageName}>{stage.name}</span>
              {state === 'active' && <span className={styles.stageBar} aria-hidden="true"><i style={{ width: `${Math.round(stage.score! * 100)}%` }} /></span>}
              <small>{state === 'done' ? '完成' : state === 'active' ? `${Math.round(stage.score! * 100)}%` : state === 'empty' ? '未开始' : ''}</small>
            </button></li>;
          })}
        </ol>
        </details>
        {outputs.length > 0 && <details className={styles.sideGroup}>
          <summary>分析产出 <small>{outputs.length}</small><Icon name="down" /></summary>
          {(allOutputs ? outputs : outputs.slice(0, 5)).map(output => <button key={output.id} type="button" className={styles.output} aria-current={openOutput === output.id ? 'true' : undefined} onClick={() => onOutput(output.id)} title={output.title}>
            <Icon name="chart" /><span>{output.title}<small>{output.detail}</small></span>
          </button>)}
          {outputs.length > 5 && <button type="button" className={styles.sideMore} onClick={() => setAllOutputs(!allOutputs)}>{allOutputs ? '收起' : `全部 ${outputs.length} 项`}</button>}
        </details>}
      </>}
      {account === 'ready' && projects.length > 0 && <>
        <p className={styles.sideLabel}>项目</p>
        {projects.map(project => {
          const filed = recent.filter(t => t.projectId === project.id), open = expanded[project.id] ?? filed.length > 0;
          return <div key={project.id}>
            <div className={styles.thread}>
              <button type="button" aria-expanded={open} onClick={() => setExpanded({ ...expanded, [project.id]: !open })}>
                <span className={styles.folder}><Icon name="folder" />{project.label}</span>
              </button>
              <span className={styles.threadMenu}><button type="button" aria-label={`在「${project.label}」里新建对话`} title="在这个项目里新建对话" onClick={() => onNew(project.id)}>＋</button></span>
            </div>
            {open && (filed.length ? filed.map(t => row(t, true)) : <p className={styles.sideNote}>还没有对话</p>)}
          </div>;
        })}
      </>}
      {(loose.length > 0 || !recent.length) && <p className={styles.sideLabel}>最近</p>}
      {loose.map(t => row(t))}
      {!recent.length && <p className={styles.sideEmpty}>{wanted ? '没有匹配的对话。' : '还没有对话。'}</p>}
      </>)}
    </nav>
    {notice && <p className={styles.sideNotice} role="alert">{notice}</p>}
    <div className={styles.sideFoot}>
      {failed && account !== 'ready' ? <>
        <span role="status" title="账号服务未连接，内容安全保存在本地工作区" style={{ color: 'var(--c-dim)' }}>本地工作区（离线）</span>
        <span className={styles.spacer} />
        <button type="button" onClick={onRetry}>重连</button>
      </> : account === 'ready' ? <div className={styles.accountWrap}>
        {menu && <div className={styles.accountMenu} role="menu" aria-label="账号">
          <button type="button" role="menuitem" onClick={() => { setMenu(false); onModels(); }}>模型设置</button>
          <Link role="menuitem" href="/invites" onClick={() => setMenu(false)}>邀请码（管理员）</Link>
          {onExport && <button type="button" role="menuitem" onClick={() => { setMenu(false); onExport(); }}>导出对话记录</button>}
          <button type="button" role="menuitem" onClick={() => { setMenu(false); onRoom('diagnose'); }}>选题与研究资料</button>
          <button type="button" role="menuitem" data-danger="true" onClick={() => { setMenu(false); onLogout(); }}>退出登录</button>
        </div>}
        <button type="button" className={styles.account} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} title={email}>
          <span className={styles.accountAvatar} aria-hidden="true">{(email[0] ?? '?').toUpperCase()}</span>
          <span className={styles.accountText}><b>{email}</b><small>今日已记录 {thousands(todayTokens)} tokens</small></span>
          <Icon name="more" />
        </button>
      </div> : <>
        <span>{account === 'loading' ? '正在核对登录…' : '未登录 · 对话只留在本标签页'}</span>
        <span className={styles.spacer} />
        {account === 'guest' ? <Link href="/login">登录</Link> : <button type="button" onClick={onRetry}>重试连接</button>}
      </>}
    </div>
  </aside>;
}
