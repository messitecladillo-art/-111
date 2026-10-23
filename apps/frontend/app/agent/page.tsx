import type { Metadata } from 'next';
import AgentWorkspace from '@/components/agent/AgentWorkspace';

export const metadata: Metadata = { title: '研究 Agent｜证见 EVI-X' };

export default function AgentPage() { return <AgentWorkspace/>; }
