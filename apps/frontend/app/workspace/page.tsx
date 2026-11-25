import type { Metadata } from 'next';
import EviXPlatform from '@/components/EviXPlatform';

export const metadata: Metadata = {
  title: '研究工具｜证见 EVI-X',
  description: '涵盖案例阅读、选题诊断、问卷与抽样设计、统计分析、报告编排与答辩演练的实证调查研究工作台。',
};

export default function WorkspacePage() {
  return <EviXPlatform />;
}
