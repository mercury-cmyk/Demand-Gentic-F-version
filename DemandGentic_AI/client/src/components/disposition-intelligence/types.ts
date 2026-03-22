/**
 * Disposition Intelligence Types
 *
 * Interfaces for the Disposition Intelligence system that aggregates and analyzes
 * call dispositions across campaigns to identify patterns, agent mistakes,
 * and generate AI-powered coaching recommendations.
 */

// ============================================
// Constants
// ============================================

export const DISPOSITION_TYPES = [
  'qualified_lead',
  'not_interested',
  'do_not_call',
  'voicemail',
  'no_answer',
  'invalid_data',
  'needs_review',
  'callback_requested',
] as const;

export type DispositionType = (typeof DISPOSITION_TYPES)[number];

export const DISPOSITION_LABELS: Record = {
  qualified_lead: 'Qualified Lead',
  not_interested: 'Not Interested',
  do_not_call: 'Do Not Call',
  voicemail: 'Voicemail',
  no_answer: 'No Answer',
  invalid_data: 'Invalid Data',
  needs_review: 'Needs Review',
  callback_requested: 'Callback Requested',
};

export const DISPOSITION_COLORS: Record = {
  qualified_lead: '#22c55e',
  not_interested: '#f97316',
  do_not_call: '#ef4444',
  voicemail: '#a855f7',
  no_answer: '#6b7280',
  invalid_data: '#f59e0b',
  needs_review: '#3b82f6',
  callback_requested: '#06b6d4',
};

// ============================================
// Filters
// ============================================

export interface DispositionIntelligenceFilters {
  campaignId: string;
  startDate: string | null;
  endDate: string | null;
}

export const defaultDispositionFilters: DispositionIntelligenceFilters = {
  campaignId: 'all',
  startDate: null,
  endDate: null,
};

// ============================================
// Overview Response
// ============================================

export interface DispositionDistribution {
  disposition: string;
  count: number;
  percentage: number;
  avgDurationSeconds: number;
  avgQualityScore: number | null;
  accuracyRate: number | null;
}

export interface TimeSeriesPoint {
  date: string;
  dispositions: Record;
}

export interface CampaignComparison {
  campaignId: string;
  campaignName: string;
  dispositions: Record;
  totalCalls: number;
  conversionRate: number;
}

export interface OverviewResponse {
  distribution: DispositionDistribution[];
  timeSeries: TimeSeriesPoint[];
  campaignComparison: CampaignComparison[];
  totals: {
    totalCalls: number;
    totalWithDisposition: number;
    avgCallDuration: number;
    overallConversionRate: number;
    dispositionAccuracyRate: number;
    avgQualityScore: number | null;
  };
}

// ============================================
// Deep Dive Response
// ============================================

export interface DeepDiveCall {
  callSessionId: string;
  callAttemptId: string | null;
  contactName: string;
  companyName: string;
  campaignName: string;
  disposition: string;
  durationSeconds: number | null;
  transcriptSnippet: string | null;
  dispositionAccurate: boolean | null;
  expectedDisposition: string | null;
  qualityScore: number | null;
  sentiment: string | null;
  createdAt: string;
  voicemailDetected: boolean;
}

export interface DetectedPattern {
  pattern: string;
  count: number;
  percentage: number;
  severity: string;
}

export interface VoicemailPattern {
  phrase: string;
  frequency: number;
}

export interface MismatchedDisposition {
  callSessionId: string;
  assigned: string;
  expected: string;
  notes: string[];
}

export interface DeepDiveResponse {
  calls: DeepDiveCall[];
  patterns: DetectedPattern[];
  voicemailPatterns: VoicemailPattern[];
  mismatchedDispositions: MismatchedDisposition[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================
// Phrase Insights Response
// ============================================

export interface PhraseInsightTerm {
  term: string;
  count: number;
  callCoverage: number;
  callCoveragePct: number;
}

export interface PhraseInsightBucket {
  key: string;
  totalCalls: number;
  totalTokens: number;
  topKeywords: PhraseInsightTerm[];
  topBigrams: PhraseInsightTerm[];
  topTrigrams: PhraseInsightTerm[];
}

export interface PhraseInsightsResponse {
  generatedAt: string;
  analyzedCalls: number;
  settings: {
    minCount: number;
    maxKeywords: number;
    maxPhrases: number;
    minTokenLength: number;
  };
  byDisposition: PhraseInsightBucket[];
  byDetectionSignal: PhraseInsightBucket[];
  filters: {
    startDate: string | null;
    endDate: string | null;
    campaignId: string;
    disposition: string;
    maxCalls: number;
    minTranscriptChars: number;
  };
}

export interface PromptGuardrailExport {
  generatedAt: string;
  summary: {
    analyzedCalls: number;
    dispositions: string[];
  };
  sections: {
    voicemailMarkers: string[];
    qualifiedIntentLexicon: string[];
    notInterestedSuppressionCues: string[];
    doNotCallCues: string[];
    machineDetectedCues: string[];
    humanDetectedCues: string[];
  };
  promptBlock: string;
}

export interface PromptGuardrailResponse extends PromptGuardrailExport {
  phraseInsights: PhraseInsightsResponse;
  filters: {
    startDate: string | null;
    endDate: string | null;
    campaignId: string;
    disposition: string;
    maxCalls: number;
    minTranscriptChars: number;
  };
}

// ============================================
// Agent Performance Response
// ============================================

export interface AgentPerformanceResponse {
  openingAnalysis: {
    avgEngagementScore: number | null;
    commonOpeningIssues: Array;
  };
  engagementMetrics: {
    avgEngagementScore: number | null;
    avgClarityScore: number | null;
    avgEmpathyScore: number | null;
    interruptionPatterns: Array;
  };
  objectionHandling: {
    avgScore: number | null;
    commonIssues: Array;
  };
  closingAnalysis: {
    avgScore: number | null;
    closingIssues: Array;
  };
  flowCompliance: {
    avgScore: number | null;
    topMissedSteps: Array;
    topDeviations: Array;
  };
  bestVsWorst: {
    best: Array;
    worst: Array;
  };
  totalAnalyzed: number;
}

// ============================================
// Campaign Analysis Response
// ============================================

export interface CampaignAnalysisResponse {
  campaign: {
    id: string;
    name: string;
    objective: string | null;
    successCriteria: string | null;
  };
  performance: {
    totalCalls: number;
    qualifiedLeadRate: number;
    avgQualityScore: number | null;
    avgCampaignAlignmentScore: number | null;
    avgTalkingPointsCoverage: number | null;
    avgFlowComplianceScore: number | null;
  };
  qualificationAnalysis: {
    metCriteriaRate: number;
    topMissedTalkingPoints: Array;
  };
  dispositionBreakdown: Record;
  accountIntelligenceCorrelation: {
    withIntelligence: { count: number; avgQuality: number | null; qualifiedRate: number };
    withoutIntelligence: { count: number; avgQuality: number | null; qualifiedRate: number };
  } | null;
  trendOverTime: Array;
}

// ============================================
// Coaching Response
// ============================================

export interface CoachingIssue {
  issue: string;
  frequency: number;
  impact: 'high' | 'medium' | 'low';
  affectedCalls: number;
  description: string;
}

export interface CoachingRecommendation {
  area: string;
  currentBehavior: string;
  suggestedImprovement: string;
  expectedImpact: string;
  priority: 'high' | 'medium' | 'low';
  examples: Array;
}

export interface PromptImprovement {
  section: string;
  currentPromptSnippet: string;
  suggestedEdit: string;
  rationale: string;
}

export interface CoachingResponse {
  topIssues: CoachingIssue[];
  recommendations: CoachingRecommendation[];
  promptImprovements: PromptImprovement[];
  naturalLanguagePatterns: {
    adopt: Array;
    avoid: Array;
  };
  voicemailOptimization: {
    avgDetectionTime: number;
    missedVoicemailPhrases: string[];
    recommendations: string[];
  } | null;
  metadata: {
    callsAnalyzed: number;
    dateRange: { start: string; end: string };
    generatedAt: string;
  };
  phraseInsights?: Omit;
  promptGuardrails?: PromptGuardrailExport;
}

// ============================================
// Utility Functions
// ============================================

export function getDispositionLabel(disposition: string): string {
  return DISPOSITION_LABELS[disposition as DispositionType] || disposition.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function getDispositionColor(disposition: string): string {
  return DISPOSITION_COLORS[disposition as DispositionType] || '#6b7280';
}