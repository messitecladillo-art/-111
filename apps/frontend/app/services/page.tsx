import HostedFrame from '@/components/hosted/HostedFrame';
import HostedServices from '@/components/hosted/HostedServices';
import Link from 'next/link';
export default function ServicesPage() { return <HostedFrame title="我的模型服务" subtitle="接入自己的服务与额度。密钥由服务器加密保管，不随项目共享。"><HostedServices/><p className="hosted-small"><Link href="/invites">管理邀请码（管理员）→</Link></p></HostedFrame>; }
