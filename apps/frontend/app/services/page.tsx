import type { Metadata } from 'next';
import Link from 'next/link';
import HostedFrame from '@/components/hosted/HostedFrame';
import HostedServices from '@/components/hosted/HostedServices';

export const metadata: Metadata = {
  title: '服务设置｜证见 EVI-X',
  description: '配置个人研究辅助服务，按问卷设计、文献梳理与报告审校等环节灵活分配服务连接。',
};

export default function ServicesPage() {
  return (
    <HostedFrame title="服务设置" subtitle="接入个人研究辅助服务，按问卷起草、研究检索与报告审校环节灵活分配。">
      <HostedServices />
      <p className="hosted-small"><Link href="/invites">管理邀请码（管理员）→</Link></p>
    </HostedFrame>
  );
}
