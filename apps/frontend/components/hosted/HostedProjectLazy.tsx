'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type HostedProjectType from './HostedProject';

const HostedProject = dynamic(() => import('./HostedProject'), {
  ssr: false,
  loading: () => (
    <p role="status" aria-live="polite">
      正在载入项目工作台…
    </p>
  ),
});

export type HostedProjectLazyProps = ComponentProps<typeof HostedProjectType>;

export default function HostedProjectLazy(props: HostedProjectLazyProps) {
  return <HostedProject {...props} />;
}
