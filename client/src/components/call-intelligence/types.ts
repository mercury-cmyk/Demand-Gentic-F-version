/**
 * Unified Call Intelligence Types
 *
 * TypeScript interfaces for the unified call intelligence dashboard
 * combining recordings, transcriptions, and quality analysis
 */

export interface TranscriptTurn {
  role: 'agent' | 'contact' | 'assistant' | 'user' | 'system';
  text: string;
  timestamp?: string;
}

export interface QualityIssue {
  type: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  evidence?: string;
  recommendation?: string;
}

export interface QualityRecommendation {
  category: string;
  currentBehavior?: string;
  suggestedChange: string;
  expectedImpact: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface QualityBreakdown {
  type: string;
  description: string;
  moment?: string;
  recommendation?: string;
}

export interface QualityDimensions {
  engagement?: number;
  clarity?: number;
  empathy?: number;
  objectionHandling?: number;
  qualification?: number;
  closing?: number;
}

export interface CampaignAlignment {
  score?: number;
  contextUsage?: number;
  talkingPointsCoverage?: number;
  missedTalkingPoints?: string[];
}

export interface FlowCompliance {
  score?: number;
  missedSteps?: string[];
  deviations?: string[];
}

export interface DispositionReview {
  assigned?: string;
  expected?: string;
  accurate?: boolean;
  notes?: string[];
}

export interface UnifiedCallRecord {
  id: string;
  source?: 'session' | 'dialer'; // Which table the data came from
  telnyxCallId?: string;
  fromNumber: string;
  toNumber: string;
  startedAt: string;
  endedAt?: string;
  durationSec: number;
  status: string;
  disposition?: string;
  agentType: 'ai' | 'human';

  contact: {
    id?: string;
    name: string;
    email?: string;
    phone: string;
    jobTitle?: string;
    company: string;
  };

  campaign: {
    id?: string;
    name: string;
  };

  recording: {
    available: boolean;
    status: string;
    format?: string;
    durationSec?: number;
    fileSizeBytes?: number;
    s3Key?: string;
  };

  transcript: {
    available: boolean;
    text?: string;
    turns?: TranscriptTurn[];
    length?: number;
  };

  quality: {
    analyzed: boolean;
    overallScore?: number;
    dimensions?: QualityDimensions;
    sentiment?: string;
    engagementLevel?: string;
    identityConfirmed?: boolean;
    qualificationMet?: boolean;
    issues?: QualityIssue[];
    recommendations?: QualityRecommendation[];
    breakdowns?: QualityBreakdown[];
    promptUpdates?: any[];
    performanceGaps?: string[];
    nextBestActions?: string[];
    campaignAlignment?: CampaignAlignment;
    flowCompliance?: FlowCompliance;
    dispositionReview?: DispositionReview;
    analyzedAt?: string;
    model?: string;
  };

  lead?: {
    id: string;
    qaStatus?: string;
  };
}

export interface UnifiedCallsResponse {
  success: boolean;
  data: {
    calls: UnifiedCallRecord[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    aggregates: {
      totalCalls: number;
      avgQualityScore: number;
      avgDuration: number;
      sentimentBreakdown: {
        positive: number;
        neutral: number;
        negative: number;
      };
      withTranscripts: number;
      withRecordings: number;
      withAnalysis: number;
    };
  };
}

export interface CallIntelligenceFilters {
  search: string;
  campaignId: string;
  agentType: 'ai' | 'human' | 'all';
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  durationRange: {
    min: number | null;
    max: number | null;
  };
  phoneNumber: string;
  qualityScoreRange: {
    min: number | null;
    max: number | null;
  };
  sentiment: 'positive' | 'neutral' | 'negative' | 'all';
  hasTranscript: boolean | null;
  hasRecording: boolean | null;
  hasAnalysis: boolean | null;
  disposition: string;
  sortBy: 'date' | 'duration' | 'qualityScore' | 'sentiment';
  sortOrder: 'asc' | 'desc';
}

export const defaultFilters: CallIntelligenceFilters = {
  search: '',
  campaignId: 'all',
  agentType: 'all',
  dateRange: { start: null, end: null },
  durationRange: { min: null, max: null },
  phoneNumber: '',
  qualityScoreRange: { min: null, max: null },
  sentiment: 'all',
  hasTranscript: null,
  hasRecording: true, // Default to showing only calls with recordings
  hasAnalysis: null,
  disposition: 'all',
  sortBy: 'date',
  sortOrder: 'desc',
};

// Utility function to build query params from filters
export function buildQueryParams(filters: CallIntelligenceFilters, page: number, limit: number): string {
  const params = new URLSearchParams();

  params.append('page', page.toString());
  params.append('limit', limit.toString());

  if (filters.search.trim()) {
    params.append('search', filters.search.trim());
  }

  if (filters.campaignId !== 'all') {
    params.append('campaignId', filters.campaignId);
  }

  if (filters.agentType !== 'all') {
    params.append('agentType', filters.agentType);
  }

  if (filters.dateRange.start) {
    params.append('startDate', filters.dateRange.start.toISOString());
  }

  if (filters.dateRange.end) {
    params.append('endDate', filters.dateRange.end.toISOString());
  }

  if (filters.durationRange.min !== null) {
    params.append('minDuration', filters.durationRange.min.toString());
  }

  if (filters.durationRange.max !== null) {
    params.append('maxDuration', filters.durationRange.max.toString());
  }

  if (filters.phoneNumber.trim()) {
    params.append('phoneNumber', filters.phoneNumber.trim());
  }

  if (filters.qualityScoreRange.min !== null) {
    params.append('minQualityScore', filters.qualityScoreRange.min.toString());
  }

  if (filters.qualityScoreRange.max !== null) {
    params.append('maxQualityScore', filters.qualityScoreRange.max.toString());
  }

  if (filters.sentiment !== 'all') {
    params.append('sentiment', filters.sentiment);
  }

  if (filters.hasTranscript !== null) {
    params.append('hasTranscript', filters.hasTranscript.toString());
  }

  if (filters.hasRecording !== null) {
    params.append('hasRecording', filters.hasRecording.toString());
  }

  if (filters.hasAnalysis !== null) {
    params.append('hasQualityAnalysis', filters.hasAnalysis.toString());
  }

  if (filters.disposition !== 'all') {
    params.append('disposition', filters.disposition);
  }

  params.append('sortBy', filters.sortBy);
  params.append('sortOrder', filters.sortOrder);

  return params.toString();
}

// Status and badge color mappings
export const RECORDING_STATUS_COLORS: Record<string, string> = {
  stored: 'bg-green-500',
  pending: 'bg-yellow-500',
  recording: 'bg-blue-500',
  uploading: 'bg-purple-500',
  failed: 'bg-red-500',
};

export const AGENT_TYPE_COLORS: Record<string, string> = {
  ai: 'bg-purple-600',
  human: 'bg-blue-600',
};

export const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'bg-green-500',
  neutral: 'bg-gray-500',
  negative: 'bg-red-500',
};

export const QUALITY_SCORE_COLORS = {
  high: 'bg-green-500 text-white',    // 70+
  medium: 'bg-yellow-500 text-black', // 50-69
  low: 'bg-red-500 text-white',       // <50
};

export function getQualityScoreColor(score: number | undefined): string {
  if (score === undefined) return 'bg-gray-400 text-white';
  if (score >= 70) return QUALITY_SCORE_COLORS.high;
  if (score >= 50) return QUALITY_SCORE_COLORS.medium;
  return QUALITY_SCORE_COLORS.low;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
