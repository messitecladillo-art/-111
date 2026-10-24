'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from './icons';
import type { Book, Thread } from './threads';
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
  onCollapse: () => void;
};

/**
 * Conversations, as in Codex: a new one at the top, then the account's projects with the conversations filed under
 * them, then the rest by recency. Deleting asks once more in place; it removes the conversation only, never project
 * work.
 */
export default function Sidebar({ book, projects, account, email, failed, onRetry, notice, onNew, onSelect, onRemove, onCollapse }: Props) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const wanted = query.trim();
  const recent = [...book.threads].sort((a, b) => b.updatedAt - a.updatedAt).filter(t => !wanted || t.title.includes(wanted));
  // A conversation shows once: under its project when that project is listed, otherwise among the recent ones.
  const listed = account === 'ready' ? new Set(projects.map(p => p.id)) : new Set<string>();
  const loose = recent.filter(t => !t.projectId || !listed.has(t.projectId));
  const row = (thread: Thread, nested = false) => <div key={thread.id} className={styles.thread} data-active={thread.id === book.active} data-nested={nested}>
    <button type="button" onClick={() => onSelect(thread.id)} aria-current={thread.id === book.active ? 'true' : undefined} title={thread.title}>{thread.title}</button>
    <span className={styles.threadMenu} data-confirming={confirming === thread.id}>
      {confirming === thread.id ? <>
        <button type="button" data-danger="true" onClick={() => { onRemove(thread.id); setConfirming(null); }}>确认删除</button>
        <button type="button" onClick={() => setConfirming(null)}>取消</button>
      </> : <button type="button" aria-label={`删除对话「${thread.title}」`} onClick={() => setConfirming(thread.id)}>删除</button>}
    </span>
  </div>;

  return <aside className={styles.sidebar} aria-label="对话与项目">
    <div className={styles.sideHead}>
      <span className={styles.brandName}>证见<small>EVI-X</small></span>
      <span className={styles.spacer} />
      <button type="button" className={styles.iconButton} aria-label="搜索对话" aria-pressed={searching} onClick={() => { setSearching(!searching); setQuery(''); }}><Icon name="search" /></button>
      <button type="button" className={styles.iconButton} aria-label="收起侧栏（Ctrl B）" title="收起侧栏（Ctrl B）" onClick={onCollapse}><Icon name="sidebar" /></button>
    </div>
    {searching && <input className={styles.sideSearch} autoFocus value={query} placeholder="搜索对话标题" aria-label="搜索对话标题" onChange={event => setQuery(event.target.value)} />}
    <nav className={styles.sideScroll} aria-label="对话">
      <button type="button" className={styles.sideItem} onClick={() => onNew(null)} aria-current={book.active === null ? 'true' : undefined}><Icon name="edit" />新对话</button>
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
    </nav>
    {notice && <p className={styles.sideNotice} role="alert">{notice}</p>}
    <div className={styles.sideFoot}>
      {failed && account !== 'ready' ? <>
        <span role="alert">账号服务暂未就绪</span>
        <span className={styles.spacer} />
        <button type="button" onClick={onRetry}>重新连接</button>
      </> : <>
        {account === 'ready' ? <span title={email}>{email}</span> : <span>{account === 'loading' ? '正在核对登录…' : '未登录 · 对话只留在本标签页'}</span>}
        <span className={styles.spacer} />
        {account === 'guest' ? <Link href="/login">登录</Link> : <Link href="/workspace">经典工作台 ↗</Link>}
      </>}
    </div>
  </aside>;
}
