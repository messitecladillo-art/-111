import type { Metadata } from 'next';
import AgentWorkspace from '@/components/agent/AgentWorkspace';

export const metadata: Metadata = {
  title: '对话工作区｜证见 EVI-X',
  description: '围绕当前课题协同推进文献梳理、研究诊断、问卷起草与报告撰写。',
};

export default function AgentWorkspacePage() {
  return <AgentWorkspace />;
}
