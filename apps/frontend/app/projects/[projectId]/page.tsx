import type { Metadata } from 'next';
import HostedFrame from '@/components/hosted/HostedFrame';
import HostedProjectLazy from '@/components/hosted/HostedProjectLazy';

export const metadata: Metadata = {
  title: '项目工作台｜证见 EVI-X',
  description: '将研究需求转化为可编辑、可复核、可随时重新打开的问卷与证据版本。',
};

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <HostedFrame density="compact" title="项目工作台" subtitle="把研究需求变成可编辑、可复核、可重新打开的问卷版本。">
      <HostedProjectLazy projectId={projectId} />
    </HostedFrame>
  );
}
