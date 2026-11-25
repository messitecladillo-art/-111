'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type CorpusObservatoryType from './CorpusObservatory';

const CorpusObservatory = dynamic(() => import('./CorpusObservatory'), {
  ssr: false,
  loading: () => (
    <div role="status" aria-live="polite">
      <p id="corpus-title">正在载入实证语料与范式图谱</p>
    </div>
  ),
});

export type CorpusObservatoryLazyProps = ComponentProps<typeof CorpusObservatoryType>;

export default function CorpusObservatoryLazy(props: CorpusObservatoryLazyProps) {
  return <CorpusObservatory {...props} />;
}
