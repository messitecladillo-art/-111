import type { Metadata } from 'next';
import AgentShell from '@/components/agent/AgentShell';

export const metadata: Metadata = {
  title: '镜室｜证见 EVI-X',
  description: '在一段对话中贯通问卷设计、抽样核验、统计分析与报告成文，用证据照度标出尚待补齐的研究盲区。',
};

export default function AgentPage() {
  return <AgentShell />;
}
