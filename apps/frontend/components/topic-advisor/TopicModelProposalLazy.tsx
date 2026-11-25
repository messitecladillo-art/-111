'use client';

import topicCatalog from '@/content/topic-advisor/catalog.json';
import type { TopicProfile, TopicRecommendation } from '@/lib/topic-advisor/types';
import TopicModelProposal, { type RefinedTopicHandoff } from './TopicModelProposal';

export type TopicModelProposalLazyProps = {
  profile: TopicProfile;
  recommendation: TopicRecommendation | null;
  stale: boolean;
  onUseTopic?: (topic: RefinedTopicHandoff) => void;
};

export default function TopicModelProposalLazy({
  profile,
  recommendation,
  stale,
  onUseTopic,
}: TopicModelProposalLazyProps) {
  return (
    <TopicModelProposal
      profile={profile}
      recommendation={recommendation}
      stale={stale}
      catalogVersion={topicCatalog.contentVersion}
      onUseTopic={onUseTopic}
    />
  );
}
