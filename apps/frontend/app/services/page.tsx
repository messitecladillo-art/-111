import HostedFrame from '@/components/hosted/HostedFrame';
import HostedServices from '@/components/hosted/HostedServices';
import Link from 'next/link';
export default function ServicesPage() { return <HostedFrame title="模型设置" subtitle="接入模型服务，为不同任务安排合适的模型。"><HostedServices/><p className="hosted-small"><Link href="/invites">管理邀请码（管理员）→</Link></p></HostedFrame>; }
