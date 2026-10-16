/** Authored research guidance; none of these types represents measured field evidence. */
import type { ProfileRegionFields } from './geography.ts';
export type AccessStatus = 'confirmed' | 'possible' | 'unavailable';
export type TopicProfile = {
  region: string; city: string; school: string; schoolContext: string[]; discipline: string;
  interests: string[]; domains: string[]; days: number | null; budgetYuan: number | null;
  access: Record<string, AccessStatus>; resources: Record<string, AccessStatus>;
  sensitiveData: 'avoid' | 'review_required' | 'approved';
  referenceDate: string; competitionWindow: { start: string; end: string } | null;
} & ProfileRegionFields;
export const EMPTY_TOPIC_PROFILE: TopicProfile = {
  region: '', city: '', school: '', schoolContext: [], discipline: '', interests: [], domains: [],
  days: null, budgetYuan: null, access: {}, resources: {}, sensitiveData: 'avoid', referenceDate: '', competitionWindow: null,
};
export const ACCESS_OPTIONS = [
  ['campus_students', '在校大学生'], ['campus_ops', '校园服务管理方'], ['community_residents', '社区居民'],
  ['community_partner', '社区合作方'], ['older_adults', '老年群体'], ['merchants', '商户'], ['firms', '企业管理方'],
  ['employees', '在职人员'], ['jobseekers', '求职者'], ['farmers', '农业经营者'], ['tourists', '游客'],
  ['event_organizer', '活动组织方'], ['logistics_partner', '物流合作方'], ['training_partner', '培训合作方'],
].map(([id, label]) => ({ id, label }));
export const RESOURCE_OPTIONS = [
  ['questionnaire', '问卷设计与回收'], ['interviews', '访谈'], ['observation', '现场观察'], ['public_data', '公开资料核验'],
  ['administrative_data', '获准使用的管理数据'], ['transaction_data', '获准使用的交易数据'],
  ['field_travel', '实地出行'], ['prototype_test', '原型或小规模测试'],
].map(([id, label]) => ({ id, label }));
export const SETTING_OPTIONS = [
  ['campus', '校园'], ['community', '社区'], ['county', '县域'], ['rural', '乡村'], ['industry', '产业'],
  ['service', '服务'], ['tourism', '旅游'], ['sports', '体育'], ['employment', '就业'], ['digital', '数字生活'], ['retail', '零售'],
].map(([id, label]) => ({ id, label }));
export const DOMAIN_OPTIONS = [
  ['policy', '政策'], ['economy', '经济与市场'], ['technology', '科技'], ['finance', '金融'], ['biology', '生物与健康'],
  ['society', '社会与民生'], ['employment', '就业'], ['entertainment', '娱乐'], ['sports', '体育'], ['tourism', '旅游'],
].map(([id, label]) => ({ id, label }));
export type TopicPattern = {
  id: string; title: string; domain: string; regionTags: string[]; cityTags: string[]; settingTags: string[];
  accessNeeds: string[]; resourceNeeds: string[]; decisionOwner: string; decision: string; question: string; population: string;
  minimumEvidence: string[]; methods: string[]; differentiators: string[]; scopeLimits: string[]; rejectWhen: string[];
  sourceIds: string[]; minimumDays: number | null; minimumBudgetYuan: number | null; sensitive: boolean;
};
export type TopicCatalog = { schemaVersion: 1; contentVersion: string; patterns: TopicPattern[] };
export type TopicSource = {
  id: string; title: string; url?: string; path?: string; authority: string;
  coverage: 'fulltext' | 'listing_only' | 'reference'; limitations: string[];
  publishedAt?: string; retrievedAt?: string; supportedClaims?: string[]; locator?: string; rights?: string;
};
export type TopicSources = { schemaVersion: 1; sources: TopicSource[] };
export type TopicEvent = {
  id: string; title: string; domain: string;
  geography: { level: 'national' | 'province' | 'city'; region: string; city: string };
  publishedAt: string; validFrom: string; validUntil: string; summary: string; researchHypotheses: string[];
  patternIds: string[]; sourceIds: string[]; status: 'verified' | 'pending_verification' | 'historical';
  eventDate?: string; verifiedAt?: string; referenceOnly?: boolean; observedEvent?: string;
  validityBasis?: string; limitations?: string[];
};
export type TopicEvents = { schemaVersion: 1; events: TopicEvent[] };
export const FEATURE_NAMES = ['confirmedAccess', 'possibleAccess', 'resourceFit', 'geographyFit', 'settingFit', 'interestFit', 'timeFit', 'budgetFit', 'decisionClarity', 'evidenceDesign', 'differentiation', 'actionability', 'currentEventMatch', 'lowSensitivity'] as const;
export type FeatureName = typeof FEATURE_NAMES[number];
export type FeatureVector = Record<FeatureName, number>;
export type TopicTrainingPair = {
  id: string; context: TopicProfile; preferredPatternId: string; rejectedPatternId: string; rationale: string; sourceIds: string[];
};
export type TopicTraining = { schemaVersion: 1; split: 'train'; dataClass: 'authored_synthetic'; pairs: TopicTrainingPair[] };
export type TopicRankerModel = {
  schemaVersion: 1; modelVersion: string; algorithm: 'projected_pairwise_logistic_v1'; featureNames: FeatureName[];
  weights: number[]; training: { dataClass: 'authored_synthetic'; pairCount: number; trainSha256: string; catalogSha256: string; eventsSha256: string; sourcesSha256: string; epochs: number; learningRate: number; l2: number; loss: number; pairAccuracy: number };
  limitations: string[];
};
export type TopicBundle = { catalog: TopicCatalog; sources: TopicSources; model: TopicRankerModel; events: TopicEvents };
export type DimensionId = 'problem' | 'decision' | 'access' | 'difference' | 'feasibility' | 'analysis' | 'action' | 'defense';
export type PotentialDimension = {
  id: DimensionId; label: string; score: number | null; status: 'supported' | 'proposed' | 'unknown' | 'blocked';
  reason: string; verification: string; sourceIds: string[];
};
export type EventLead = {
  id: string; title: string; domain: string; publishedAt: string; summary: string; researchHypotheses: string[];
  sourceIds: string[]; temporalStatus: 'current' | 'historical' | 'unverified'; geographyReason: string;
  validityBasis: string; limitations: string[];
  geography: TopicEvent['geography'];
  eventDate?: string;
};
export type TopicRecommendation = {
  patternId: string; title: string; domain: string; decisionOwner: string; decision: string; question: string; population: string;
  feasibility: 'ready' | 'conditional' | 'blocked'; blockers: string[]; unknowns: string[]; dimensions: PotentialDimension[];
  firstWeekPlan: string[]; sourceIds: string[]; rankScore: number; matchReasons: string[]; scopeLimits: string[]; eventLeads: EventLead[];
};
export type TopicRecommendations = {
  profileKey: string; contentVersion: string; modelVersion: string; items: TopicRecommendation[]; excluded: TopicRecommendation[]; warnings: string[];
};
export type TopicCandidate = {
  title: string; decisionOwner: string; decision: string; population: string; geography: string;
  accessNeeds: string[]; resourceNeeds: string[]; evidencePlan: string; differentiators: string[]; action: string; sensitive: boolean;
};
export const EMPTY_TOPIC_CANDIDATE: TopicCandidate = { title: '', decisionOwner: '', decision: '', population: '', geography: '', accessNeeds: [], resourceNeeds: [], evidencePlan: '', differentiators: [], action: '', sensitive: false };
export type CandidateEvaluation = TopicRecommendation & { matchedPatterns: Array<{ patternId: string; title: string; sharedTerms: string[]; sourceIds: string[] }> };
export type TopicDraft = { schemaVersion: 1 | 2; profile: TopicProfile; candidate: TopicCandidate | null };
