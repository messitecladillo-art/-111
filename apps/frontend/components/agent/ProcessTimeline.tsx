'use client';

import type { ProcessCheckpoint, ProcessEvent } from '@/lib/agent/process';
import { eventLabel, eventTime } from '@/lib/agent/process';
import { Icon } from './icons';
import styles from './AgentShell.module.css';

export default function ProcessTimeline({ events, checkpoint, onClose, canBackup = false, backupBusy = false, backupLabel, backupNote, onBackup }: {
  events: readonly ProcessEvent[];
  checkpoint?: ProcessCheckpoint;
  onClose: () => void;
  canBackup?: boolean;
  backupBusy?: boolean;
  backupLabel?: string;
  backupNote?: string;
  onBackup?: () => void;
}) {
  return <aside className={styles.processDrawer} role="dialog" aria-modal="true" aria-label="对话过程">
    <header className={styles.processHead}>
      <div><b>对话过程</b><small>{events.length} 个步骤 · 只读</small></div>
      <button type="button" className={styles.iconButton} onClick={onClose} aria-label="关闭过程"><Icon name="close" /></button>
    </header>
    <div className={styles.processBackup}>
      <button type="button" className={styles.processButton} disabled={!canBackup || backupBusy} onClick={onBackup}>{backupBusy ? '正在备份…' : backupLabel ?? '备份到云端'}</button>
      <small>{backupNote || (canBackup ? '备份只给你自己看；项目队友看不到对话正文。' : '需要登录并归入项目后才能备份。')}</small>
    </div>
    <div className={styles.processList}>
      {!events.length && <p className={styles.note}>这段对话还没有过程记录。</p>}
      {events.map(event => <article className={styles.processItem} key={event.id} data-kind={event.kind}>
        <span className={styles.processDot} aria-hidden="true" />
        <div>
          <div className={styles.processTitle}><b>{eventLabel(event.kind)}</b><time>{eventTime(event.at)}</time></div>
          <p>{event.summary}</p>
          {event.correlationId && <small>关联 {event.correlationId.slice(0, 8)}</small>}
          {event.refs?.length ? <small>{event.refs.join(' · ')}</small> : null}
          {event.detail && <details><summary>查看上下文与来源</summary><pre>{JSON.stringify(event.detail, null, 2)}</pre></details>}
        </div>
      </article>)}
      {checkpoint && <p className={styles.processCheckpoint}>检查点 · {new Date(checkpoint.at).toLocaleString('zh-CN')}{checkpoint.projectId ? ' · 已归入项目' : ''}{checkpoint.memoryRevision ? ` · 项目记忆第 ${checkpoint.memoryRevision} 版` : ''}</p>}
    </div>
  </aside>;
}
