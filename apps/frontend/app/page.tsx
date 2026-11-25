import LandingPage from '@/components/landing/LandingPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '证见 EVI-X｜实证调查研究工作台',
  description: '面向市场调查与统计分析团队的循证研究工作台，在同一条证据链上衔接问卷设计、样本预测试、数据分析、报告撰写与答辩演练。',
  openGraph: { title: '证见 EVI-X｜实证调查研究工作台', description: '让每个问题，都循证抵达行动。问有据，见有策。', type: 'website', locale: 'zh_CN' },
  twitter: { card: 'summary', title: '证见 EVI-X｜实证调查研究工作台', description: '面向市场调查与统计分析团队的循证研究工作台。', images: [] },
};

export default function Home() {
  return <LandingPage />;
}
