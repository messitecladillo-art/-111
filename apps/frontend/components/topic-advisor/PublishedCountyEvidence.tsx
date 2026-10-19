'use client';

import type { TopicProfile } from '@/lib/topic-advisor';
import type { PublishedCountyProfile } from '@/lib/topic-publication';
import projection from '@/content/topic-advisor/published-counties.json';
import CountyEvidencePanel from './CountyEvidencePanel';

// Checked by topic:check before every production build. The editorial ledger is not imported here.
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const published = freeze(projection.profiles as readonly PublishedCountyProfile[]);

export default function PublishedCountyEvidence({ profile }: { profile: TopicProfile }) {
  return <CountyEvidencePanel profile={profile} published={published} />;
}
