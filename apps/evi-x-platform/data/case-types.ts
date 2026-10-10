export type CaseVerification = "official_verified" | "user_attested";

export type CaseSourceTier =
  | "national_organizer_notice"
  | "official_university_notice"
  | "user_provided_artifact";

export type CaseDepth = "listing_only" | "artifact_deep_dive";

export type CompetitionGroup = "本科组" | "研究生组" | "unknown";

export interface CaseSourceRef {
  label: string;
  sourceTier: CaseSourceTier;
  url?: string;
  repositoryPath?: string;
  verifiedFields: string[];
}

/**
 * A case card is an evidence index, not a claim that every method in an
 * award-winning work is correct or reusable.
 *
 * Official listing-only records deliberately omit methods, samples,
 * conclusions and judge rationale unless an official public source states
 * them. Deeper analytical fields are reserved for user-provided artifacts and
 * remain bounded by their provenance notes.
 */
export interface AwardCase {
  id: string;
  title: string;
  subtitle?: string;
  edition: string;
  year: number;
  institution: string;
  group: CompetitionGroup;
  award: string;
  verification: CaseVerification;
  verificationStatus: CaseVerification;
  sourceTier: CaseSourceTier;
  caseDepth: CaseDepth;
  sourceUrl?: string;
  topic?: string[];
  region?: string[];
  summary?: string;
  highlights?: string[];
  methods?: string[];
  sourceRefs: CaseSourceRef[];
  tags: string[];
  safetyNote: string;
}

export interface AwardCaseLibraryStats {
  total: number;
  officialVerified: number;
  userAttested: number;
  byEdition: Record<string, number>;
}
