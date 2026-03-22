/**
 * Unified Account-Based Pipeline — Shared Types
 *
 * Type definitions for the unified pipeline product that connects
 * OI → Strategy → Campaigns → Execution → Account Pipeline → Close.
 */

// ─── Funnel Stages ──────────────────────────────────────────────────────────

export const UNIFIED_PIPELINE_FUNNEL_STAGES = [
  { id: 'target', name: 'Target', order: 0, color: '#6b7280', description: 'Identified account, not yet touched' },
  { id: 'outreach', name: 'Outreach', order: 1, color: '#3b82f6', description: 'Active outreach in progress' },
  { id: 'engaged', name: 'Engaged', order: 2, color: '#8b5cf6', description: 'Account has responded positively' },
  { id: 'qualifying', name: 'Qualifying', order: 3, color: '#f59e0b', description: 'In active qualification conversations' },
  { id: 'qualified', name: 'Qualified', order: 4, color: '#06b6d4', description: 'Qualified, appointment-ready' },
  { id: 'appointment_set', name: 'Appointment Set', order: 5, color: '#10b981', description: 'Meeting/demo booked' },
  { id: 'closed_won', name: 'Closed Won', order: 6, color: '#22c55e', description: 'Deal closed' },
  { id: 'closed_lost', name: 'Closed Lost', order: 7, color: '#ef4444', description: 'Disqualified or lost' },
  { id: 'on_hold', name: 'On Hold', order: 8, color: '#9ca3af', description: 'Paused' },
] as const;

export type UnifiedPipelineFunnelStage = typeof UNIFIED_PIPELINE_FUNNEL_STAGES[number]['id'];

// ─── Pipeline Strategy (AI-generated) ────────────────────────────────────────

export interface PipelineChannelConfig {
  enabled: boolean;
  campaignType?: string; // 'voice', 'email', 'content'
  description?: string;
  targetVolume?: number;
  cadence?: string; // e.g. "3 touches over 2 weeks"
}

export interface PipelineChannelStrategy {
  voice?: PipelineChannelConfig;
  email?: PipelineChannelConfig;
  content?: PipelineChannelConfig;
  summary?: string;
}

export interface PipelineFunnelStageConfig {
  stageId: string;
  advancementCriteria: string; // AI-generated criteria for when to advance
  expectedDuration?: string; // e.g. "3-5 days"
  primaryChannel?: string; // dominant channel for this stage
}

export interface PipelineFunnelStrategy {
  stages: PipelineFunnelStageConfig[];
  qualificationCriteria?: string;
  appointmentBookingProcess?: string;
}

export interface PipelineTargetCriteria {
  industries?: string[];
  companySize?: { min?: number; max?: number };
  revenue?: { min?: number; max?: number };
  regions?: string[];
  personas?: string[];
  keywords?: string[];
  customFilters?: Record;
}

export interface PipelineStrategy {
  objective: string;
  channelStrategy: PipelineChannelStrategy;
  funnelStrategy: PipelineFunnelStrategy;
  targetCriteria: PipelineTargetCriteria;
  estimatedTimeline?: string;
  estimatedAccountVolume?: number;
  keyMessages?: string[];
  oiSnapshotSummary?: string;
}

// ─── Pipeline Dashboard Metrics ──────────────────────────────────────────────

export interface PipelineFunnelMetrics {
  stageDistribution: Array;
  totalAccounts: number;
  activeAccounts: number;
  appointmentsSet: number;
  closedWon: number;
  closedLost: number;
  conversionRate: number; // target → appointment_set or closed_won
}

export interface PipelineCampaignMetrics {
  campaignId: string;
  campaignName: string;
  campaignType: string;
  status: string;
  contactsReached: number;
  signalsGenerated: number; // total signals fed back to pipeline
}

export interface PipelineDashboard {
  pipeline: {
    id: string;
    name: string;
    status: string;
    objective?: string;
    createdAt: string;
  };
  funnel: PipelineFunnelMetrics;
  campaigns: PipelineCampaignMetrics[];
  recentActivity: Array;
}

// ─── Account Detail Types ────────────────────────────────────────────────────

export interface PipelineAccountDetail {
  account: {
    id: string;
    name: string;
    industry?: string;
    employeeCount?: number;
    funnelStage: string;
    priorityScore: number;
    readinessScore: number;
    engagementScore: number;
    assignedAeName?: string;
    totalTouchpoints: number;
    lastActivityAt?: string;
  };
  contacts: Array;
  timeline: Array;
  }>;
  nextAction?: {
    actionType: string;
    scheduledAt?: string;
    reasoning?: string;
    suggestedContent?: string;
  };
}

// ─── Signal Types (cross-campaign engagement) ────────────────────────────────

export type UnifiedPipelineSignalType =
  | 'email_opened'
  | 'email_clicked'
  | 'email_replied'
  | 'email_bounced'
  | 'call_answered'
  | 'call_positive_response'
  | 'call_callback_requested'
  | 'call_voicemail'
  | 'call_no_answer'
  | 'content_downloaded'
  | 'meeting_booked'
  | 'manual_stage_change';

export interface UnifiedPipelineSignal {
  signalType: UnifiedPipelineSignalType;
  pipelineId: string;
  accountId: string;
  contactId?: string;
  campaignId?: string;
  metadata?: Record;
  occurredAt?: Date;
}

// ─── Pipeline Agent Decision Types ───────────────────────────────────────────

export interface UnifiedPipelineAgentDecision {
  action: 'advance_stage' | 'create_action' | 'mark_lost' | 'escalate' | 'wait';
  newStageId?: string;
  actionType?: 'callback' | 'email' | 'sms' | 'note';
  actionDelayMinutes?: number;
  priority?: number;
  reasoning: string;
  suggestedContent?: string;
  emailSubject?: string;
  talkingPoints?: string[];
}