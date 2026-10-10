import LandingPage from '@/components/landing/LandingPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '证见 EVI-X｜每一个答案，都从证据开始',
  description: '面向市场调查与竞赛团队的 AI 研究工作台。从问卷设计、数据分析到报告与答辩，让每个问题都循证抵达行动。',
  openGraph: { title: '证见 EVI-X｜每一个答案，都从证据开始', description: '问有据，见有策。', type: 'website', locale: 'zh_CN' },
  twitter: { card: 'summary', title: '证见 EVI-X｜每一个答案，都从证据开始', description: '面向市场调查与竞赛团队的 AI 研究工作台。', images: [] },
};

export default function Home() {
  return <LandingPage />;
}
