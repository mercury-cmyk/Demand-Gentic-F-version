export interface ScoreBreakdown {
  industry: number;
  topic: number;
  accountFit: number;
  roleFit: number;
  historical: number;
}

export interface ScoredContact {
  queueId: string;
  contactId?: string;
  contactName: string;
  jobTitle: string | null;
  seniorityLevel: string | null;
  accountName: string;
  industry: string | null;
  aiPriorityScore: number;
  breakdown: ScoreBreakdown;
  finalPriority: number;
  timezonePriority?: number;
}

export interface TierDistribution {
  tier: string;
  count: number;
  avgScore: number;
  conversionRate: number;
}

export interface ScoreHistogramBucket {
  bucket: string;
  count: number;
}

export interface ScoreOverview {
  totalQueued: number;
  totalScored: number;
  avgScore: number;
  scoredAt: string | null;
  tierDistribution: TierDistribution[];
  topContacts: ScoredContact[];
  scoreHistogram: ScoreHistogramBucket[];
}

export interface SegmentTier {
  name: string;
  range: string;
  count: number;
  avgScore: number;
  avgBreakdown: ScoreBreakdown;
  industryBreakdown: { industry: string; count: number; avgScore: number }[];
  roleBreakdown: { role: string; count: number; avgScore: number }[];
}

export interface SegmentAnalysis {
  tiers: SegmentTier[];
}

export interface ContactScoresResponse {
  contacts: ScoredContact[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ScoreResult {
  scored: number;
  avgScore: number;
  duration: number;
}

// Sub-score labels and colors
export const SCORE_DIMENSIONS: { key: keyof ScoreBreakdown; label: string; color: string }[] = [
  { key: "industry", label: "Industry", color: "#6366f1" },
  { key: "topic", label: "Topic", color: "#8b5cf6" },
  { key: "accountFit", label: "Account Fit", color: "#06b6d4" },
  { key: "roleFit", label: "Role Fit", color: "#f59e0b" },
  { key: "historical", label: "Historical", color: "#10b981" },
];

export const TIER_COLORS: Record = {
  "Tier 1": "#22c55e",
  "Tier 2": "#3b82f6",
  "Tier 3": "#f59e0b",
  "Tier 4": "#ef4444",
};