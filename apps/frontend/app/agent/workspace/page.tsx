import type { Metadata } from 'next';
import AgentWorkspace from '@/components/agent/AgentWorkspace';

export const metadata: Metadata = { title: '对话工作区｜证见 EVI-X' };

export default function AgentWorkspacePage() { return <AgentWorkspace/>; }
