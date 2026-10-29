'use client';

import { useCallback, useEffect, useState } from 'react';
import { useHostedSession } from './HostedSession';
import { errorMessage } from './api-client';
import { fetchCloudThread, listCloudThreads, type CloudThreadHead } from './cloud-process-client';
import { threads } from '../agent/threads';
import { processJournal } from '../agent/process-journal';

export default function CloudProcessBackups({ projectId }: { projectId: string }) {
  const auth = useHostedSession();
  const owner = auth.session?.authenticated && auth.session.user?.id ? auth.session.user.id : null;
  const [heads, setHeads] = useState<CloudThreadHead[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [restoring, setRestoring] = useState('');

  const reload = useCallback(() => {
    if (!owner) { setHeads([]); setStatus('idle'); return; }
    setStatus('loading'); setError('');
    listCloudThreads(projectId).then(items => { setHeads(items); setStatus('ready'); })
      .catch(reason => { setStatus('error'); setError(errorMessage(reason)); });
  }, [owner, projectId]);

  useEffect(() => { const timer = setTimeout(reload, 0); return () => clearTimeout(timer); }, [reload]);

  const restore = async (head: CloudThreadHead) => {
    if (!owner) return;
    setRestoring(head.threadId); setNotice(''); setError('');
    try {
      threads.bind(owner);
      processJournal.bind(owner);
      const snapshot = await fetchCloudThread(projectId, head.threadId);
      const restored = threads.restore({
        id: snapshot.threadId, title: snapshot.title, projectId,
        messages: snapshot.messages,
      });
      if (!restored) { setNotice('本机已有这段对话，未覆盖。'); return; }
      processJournal.import(snapshot.threadId, snapshot.events, snapshot.checkpoint);
      processJournal.setAuto(snapshot.threadId, true);
      window.location.assign('/agent');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setRestoring('');
    }
  };

  return <section className="hosted-memory-section" aria-labelledby="cloud-process-title">
    <div className="hosted-section-title">
      <div><h4 id="cloud-process-title">过程备份</h4><p className="hosted-small">显式备份，只有你自己能看到；恢复不会覆盖本机已有的对话。</p></div>
      <button type="button" onClick={reload} disabled={status === 'loading'}>刷新</button>
    </div>
    {status === 'loading' && <p className="hosted-small" role="status">正在读取云端过程…</p>}
    {status === 'error' && <p className="hosted-alert" role="alert">{error}</p>}
    {notice && <p className="hosted-notice" role="status">{notice}</p>}
    {status === 'ready' && !heads.length && <p className="hosted-small">还没有备份。可以在 Agent 的“过程”抽屉里备份这段对话。</p>}
    <div className="hosted-cloud-list">
      {heads.map(head => <div className="hosted-cloud-row" key={head.threadId}>
        <span><strong>{head.title || '未命名对话'}</strong><small>第 {head.revision} 版 · {new Date(head.updatedAt).toLocaleString('zh-CN')}</small></span>
        <button type="button" disabled={!!restoring} onClick={() => void restore(head)}>{restoring === head.threadId ? '正在恢复…' : '恢复到本机'}</button>
      </div>)}
    </div>
  </section>;
}
