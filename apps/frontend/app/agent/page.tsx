import AgentShell from '@/components/agent/AgentShell';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: '镜室｜证见 EVI-X', description: '证见 Agent：一段对话走遍研究的每一间房，照度图标出证据到不了的盲区。' };
export default function AgentPage() { return <AgentShell/>; }
