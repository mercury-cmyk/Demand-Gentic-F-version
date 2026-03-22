/**
 * Unified Intelligence Types
 *
 * Normalized types for the Unified Intelligence dashboard that combines
 * conversation quality, call recordings, transcripts, and call analysis.
 *
 * This adapter layer provides a consistent shape for data from multiple sources:
 * - call_sessions table
 * - campaign_test_calls table
 * - dialer_call_attempts table
 * - call_quality_records table
 */

// ============================================
// Core Interfaces
// ============================================

export interface UnifiedContact {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  company: string;
  jobTitle?: string;
}

export interface UnifiedCampaign {
  id?: string;
  name: string;
}

export interface UnifiedRecording {
  available: boolean;
  status: 'pending' | 'recording' | 'uploading' | 'stored' | 'failed' | 'none';
  url?: string;
  s3Key?: string;
  telnyxRecordingId?: string;
  mimeType?: string;
  durationSec?: number;
  fileSizeBytes?: number;
  expiresAt?: string;
  error?: string;
}

export interface TranscriptTurn {
  speaker: 'agent' | 'prospect' | 'system';
  startMs?: number;
  endMs?: number;
  text: string;
  timestamp?: string;
}

export interface UnifiedTranscript {
  available: boolean;
  isFull: boolean;
  rawText?: string;
  turns: TranscriptTurn[];
}

export interface DetectedIssue {
  severity: 'high' | 'medium' | 'low';
  code: string;
  type?: string;
  description: string;
  recommendation?: string;
  evidence?: string;
}

export interface PerformanceMetrics {
  identityConfirmed?: boolean;
  gatekeeperHandled?: boolean;
  pitchDelivered?: boolean;
  objectionHandled?: boolean;
  closingAttempted?: boolean;
  conversationFlow?: string;
  rapportBuilding?: string;
  [key: string]: boolean | number | string | undefined;
}

export interface UnifiedCallAnalysis {
  summaryText?: string;
  testResult?: 'success' | 'needs_improvement' | 'failed';
  metrics: PerformanceMetrics;
  conversationStates: string[];
  detectedIssues: DetectedIssue[];
}

export interface QualitySubscores {
  engagement?: number;
  clarity?: number;
  empathy?: number;
  objectionHandling?: number;
  qualification?: number;
  closing?: number;
  [key: string]: number | undefined;
}

export interface QualityRecommendation {
  area: string;
  category?: string;
  text: string;
  suggestedChange?: string;
  impact?: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface UnifiedQualityAnalysis {
  score?: number;
  subscores: QualitySubscores;
  sentiment?: 'positive' | 'neutral' | 'negative';
  engagementLevel?: string;
  recommendations: QualityRecommendation[];
}

export interface DispositionReview {
  assignedDisposition?: string;
  expectedDisposition?: string;
  isAccurate?: boolean;
  notes?: string[];
}

// ============================================
// Main Unified Conversation Detail Interface
// ============================================

export interface UnifiedConversationDetail {
  id: string;
  source: 'call_session' | 'test_call' | 'dialer_attempt';
  contact: UnifiedContact;
  campaign: UnifiedCampaign;
  type: 'production' | 'test';
  interactionType: 'call' | 'email';
  agentType: 'ai' | 'human';
  agentName?: string;
  createdAt: string;
  durationSec?: number;
  status: string;
  result?: string;
  disposition?: string;

  recording: UnifiedRecording;
  transcript: UnifiedTranscript;
  callAnalysis: UnifiedCallAnalysis;
  qualityAnalysis: UnifiedQualityAnalysis;
  dispositionReview?: DispositionReview;

  // Consolidated call history — multiple calls to the same contact
  callCount?: number;
  callHistory?: CallHistoryEntry[];
}

// ============================================
// API Response Types
// ============================================

export interface UnifiedIntelligenceFilters {
  search: string;
  campaignId: string;
  type: 'all' | 'production' | 'test';
  source: 'all' | 'call_session' | 'test_call';
  disposition: string;
  hasTranscript: boolean | null;
  hasRecording: boolean | null;
  minQualityScore: number | null;
  maxQualityScore: number | null;
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  sortBy: 'date' | 'duration' | 'qualityScore';
  sortOrder: 'asc' | 'desc';
}

export const defaultUnifiedFilters: UnifiedIntelligenceFilters = {
  search: '',
  campaignId: 'all',
  type: 'all',
  source: 'all',
  disposition: 'all',
  hasTranscript: null,
  hasRecording: null,
  minQualityScore: null,
  maxQualityScore: null,
  dateRange: { start: null, end: null },
  sortBy: 'date',
  sortOrder: 'desc',
};

export interface UnifiedConversationListItem {
  id: string;
  source: 'call_session' | 'test_call' | 'dialer_attempt';
  contactName: string;
  companyName: string;
  campaignName: string;
  type: 'production' | 'test';
  interactionType: 'call' | 'email';
  agentType: 'ai' | 'human';
  createdAt: string;
  durationSec?: number;
  status: string;
  disposition?: string;
  hasTranscript: boolean;
  hasRecording: boolean;
  qualityScore?: number;
  testResult?: string;
  issueCount?: number;
  callCount?: number;
}

export interface CallHistoryEntry {
  id: string;
  status: string;
  disposition?: string;
  duration?: number;
  hasTranscript: boolean;
  hasRecording: boolean;
  hasAnalysis: boolean;
  createdAt: string;
}

export interface TopChallenge {
  type: string;
  count: number;
  severity: string;
  description: string;
  suggestions: string[];
}

export interface UnifiedIntelligenceListResponse {
  success: boolean;
  conversations: UnifiedConversationListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: {
    total: number;
    calls: number;
    emails: number;
    testCalls: number;
    withTranscripts: number;
    withRecordings: number;
    avgQualityScore?: number;
  };
}

export interface UnifiedIntelligenceDetailResponse {
  success: boolean;
  data: UnifiedConversationDetail;
}

// ============================================
// Utility Functions
// ============================================

export function buildUnifiedQueryParams(
  filters: UnifiedIntelligenceFilters,
  page: number,
  limit: number
): string {
  const params = new URLSearchParams();

  params.append('page', page.toString());
  params.append('limit', limit.toString());

  if (filters.search.trim()) {
    params.append('search', filters.search.trim());
  }

  if (filters.campaignId !== 'all') {
    params.append('campaignId', filters.campaignId);
  }

  if (filters.type !== 'all') {
    params.append('type', filters.type);
  }

  if (filters.source !== 'all') {
    params.append('source', filters.source);
  }

  if (filters.disposition !== 'all') {
    params.append('disposition', filters.disposition);
  }

  if (filters.hasTranscript !== null) {
    params.append('hasTranscript', filters.hasTranscript.toString());
  }

  if (filters.hasRecording !== null) {
    params.append('hasRecording', filters.hasRecording.toString());
  }

  if (filters.minQualityScore !== null) {
    params.append('minQualityScore', filters.minQualityScore.toString());
  }

  if (filters.maxQualityScore !== null) {
    params.append('maxQualityScore', filters.maxQualityScore.toString());
  }

  if (filters.dateRange.start) {
    params.append('startDate', filters.dateRange.start.toISOString());
  }

  if (filters.dateRange.end) {
    params.append('endDate', filters.dateRange.end.toISOString());
  }

  params.append('sortBy', filters.sortBy);
  params.append('sortOrder', filters.sortOrder);

  return params.toString();
}

export function formatDuration(seconds: number | undefined | null): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getQualityScoreColor(score: number | undefined): string {
  if (score === undefined) return 'bg-gray-400 text-white';
  if (score >= 70) return 'bg-green-500 text-white';
  if (score >= 50) return 'bg-yellow-500 text-black';
  return 'bg-red-500 text-white';
}

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'high':
      return 'border-red-300 text-red-700 bg-red-50';
    case 'medium':
      return 'border-yellow-300 text-yellow-700 bg-yellow-50';
    case 'low':
      return 'border-gray-300 text-gray-700 bg-gray-50';
    default:
      return 'border-gray-300';
  }
}