import HostedFrame from '@/components/hosted/HostedFrame';
import HostedProject from '@/components/hosted/HostedProject';
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <HostedFrame density="compact" title="项目工作台" subtitle="把研究需求变成可编辑、可复核、可重新打开的问卷版本。"><HostedProject projectId={projectId}/></HostedFrame>;
}
