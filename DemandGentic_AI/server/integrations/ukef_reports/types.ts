/**
 * UKEF Campaign Reports — Type Definitions
 * 
 * Types for the UKEF campaign reports feature.
 * Client: Lightcast (client_account_id: 67b6f74d-0894-46c4-bf86-1dd047b57dd8)
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** The Lightcast/UKEF client account ID */
export const UKEF_CLIENT_ACCOUNT_ID = '67b6f74d-0894-46c4-bf86-1dd047b57dd8';

/** Client account name in the database */
export const UKEF_CLIENT_NAME = 'Lightcast';

/** Only show leads delivered on or after this date */
export const UKEF_CUTOFF_DATE = '2025-01-01';

/** Recording signed URL expiry (1 hour) */
export const RECORDING_URL_EXPIRY_SECONDS = 3600;

// ─── API Response Types ──────────────────────────────────────────────────────

export interface UkefCampaignSummary {
  id: string;
  name: string;
  status: string;
  qualifiedLeadCount: number;
  totalLeadCount: number;
  avgAiScore: number | null;
  dateRange: {
    earliest: string | null;
    latest: string | null;
  };
}

export interface UkefReportsSummaryMetrics {
  totalQualifiedLeads: number;
  totalCampaigns: number;
  avgAiScore: number | null;
  leadsByMonth: Array;
}

export interface UkefCampaignLeadListItem {
  id: string;
  contactName: string | null;
  companyName: string | null;
  jobTitle: string | null;
  email: string | null;
  qaStatus: string | null;
  aiScore: number | null;
  aiQualificationStatus: string | null;
  deliveredAt: string | null;
  createdAt: string;
  hasRecording: boolean;
  hasTranscript: boolean;
}

export interface UkefLeadDetail {
  id: string;
  contactName: string | null;
  companyName: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  seniorityLevel: string | null;
  
  // Campaign
  campaignId: string;
  campaignName: string;
  
  // Status
  qaStatus: string | null;
  aiScore: number | null;
  aiQualificationStatus: string | null;
  aiAnalysis: Record | null;
  qaData: Record | null;
  
  // Dates
  deliveredAt: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  
  // Evidence
  hasRecording: boolean;
  recordingUrl: string | null; // Only populated when explicitly requested
  transcript: string | null;
  transcriptionStatus: string | null;
}

export interface UkefRecordingLinkResponse {
  leadId: string;
  url: string | null;
  expiresInSeconds: number;
  source: 'gcs' | 'direct' | 'none';
}

export interface UkefCampaignLeadsResponse {
  leads: UkefCampaignLeadListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UkefCsvExportRow {
  'Lead ID': string;
  'Contact Name': string;
  'Company': string;
  'Job Title': string;
  'Email': string;
  'Campaign': string;
  'QA Status': string;
  'AI Score': string;
  'Delivered Date': string;
  'Has Recording': string;
  'Has Transcript': string;
}