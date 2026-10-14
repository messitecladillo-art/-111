import HostedFrame from '@/components/hosted/HostedFrame';
import KnowledgeIndex from '@/components/knowledge/KnowledgeIndex';
export const metadata = { title: '知识索引｜证见 EVI-X' };
export default function KnowledgePage() { return <HostedFrame title="知识索引" subtitle="边做研究，边理解概念。"><KnowledgeIndex/></HostedFrame>; }
