import LandingPage from '@/components/landing/LandingPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '证见 EVI-X｜无征不信',
  description: '从甲骨上的验辞到今天的问卷与数据：证见是面向市场调查与竞赛团队的 AI 研究工作台，让每个问题都循证抵达行动。',
  openGraph: { title: '证见 EVI-X｜无征不信', description: '循证三千年。问有据，见有策。', type: 'website', locale: 'zh_CN' },
  twitter: { card: 'summary', title: '证见 EVI-X｜无征不信', description: '面向市场调查与竞赛团队的 AI 研究工作台。', images: [] },
};

export default function Home() {
  return <LandingPage />;
}
