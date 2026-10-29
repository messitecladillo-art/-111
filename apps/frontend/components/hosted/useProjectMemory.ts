'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MemorySnapshot, ProjectMemoryDocument } from '@evix/shared';
import { errorMessage } from './api-client';
import { fetchMemory, saveMemory } from './project-memory-client';

export type ProjectMemoryState = {
  snapshot: MemorySnapshot | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string;
  reload: () => void;
  save: (document: ProjectMemoryDocument, changeNote: string) => Promise<MemorySnapshot>;
};

export function useProjectMemory(projectId: string | null): ProjectMemoryState {
  const [snapshot, setSnapshot] = useState<MemorySnapshot | null>(null);
  const [status, setStatus] = useState<ProjectMemoryState['status']>('idle');
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce(value => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!projectId) {
        setSnapshot(null); setStatus('idle'); setError('');
        return;
      }
      setStatus('loading'); setError('');
      fetchMemory(projectId).then(value => {
        if (cancelled) return;
        setSnapshot(value); setStatus('ready');
      }).catch(reason => {
        if (cancelled) return;
        setSnapshot(null); setStatus('error'); setError(errorMessage(reason));
      });
    });
    return () => { cancelled = true; };
  }, [projectId, nonce]);

  const save = useCallback(async (document: ProjectMemoryDocument, changeNote: string) => {
    if (!projectId) throw new Error('当前对话没有归入项目。');
    if (!snapshot) throw new Error('项目记忆还没有载入。');
    const next = await saveMemory(projectId, { expectedRevision: snapshot.revision, document, changeNote });
    setSnapshot(next); setStatus('ready'); setError('');
    return next;
  }, [projectId, snapshot]);

  return { snapshot, status, error, reload, save };
}
