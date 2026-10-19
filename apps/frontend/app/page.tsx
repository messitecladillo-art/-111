import LandingPage from '@/components/landing/LandingPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '证见 EVI-X｜正大杯 AI 研究工作台',
  description: '面向正大杯参赛团队的 AI 研究工作台：问卷设计、硅基样本预测试、数据分析、报告与答辩，都在同一条证据链上完成。',
  openGraph: { title: '证见 EVI-X｜正大杯 AI 研究工作台', description: '让每个问题，都循证抵达行动。问有据，见有策。', type: 'website', locale: 'zh_CN' },
  twitter: { card: 'summary', title: '证见 EVI-X｜正大杯 AI 研究工作台', description: '面向市场调查与竞赛团队的 AI 研究工作台。', images: [] },
};

export default function Home() {
  return <LandingPage />;
}
