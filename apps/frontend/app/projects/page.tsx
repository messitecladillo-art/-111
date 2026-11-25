import type { Metadata } from 'next';
import HostedFrame from '@/components/hosted/HostedFrame';
import HostedProjects from '@/components/hosted/HostedProjects';

export const metadata: Metadata = {
  title: '我的项目｜证见 EVI-X',
  description: '以真实问题组织调查研究，将每一次修订留存为可追溯、可重新打开的项目版本。',
};

export default function ProjectsPage() {
  return (
    <HostedFrame title="我的项目" subtitle="以真实问题组织研究，把每一次修改留成可重新打开的版本。">
      <HostedProjects />
    </HostedFrame>
  );
}
