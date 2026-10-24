import { notFound } from 'next/navigation';
import PublicSurvey from '@/components/survey/PublicSurvey';

export const metadata = { title: '调查问卷', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function SurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  return <PublicSurvey key={token} token={token}/>;
}
