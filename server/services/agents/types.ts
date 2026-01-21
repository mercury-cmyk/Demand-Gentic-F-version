/**
 * Agent Infrastructure Types
 * 
 * Core type definitions for the unified agent framework.
 * All agents (Voice, Email, etc.) share these foundational types.
 */

import { z } from 'zod';

// ==================== AGENT CHANNEL TYPES ====================

/**
 * Supported agent communication channels
 */
export type AgentChannel = 'voice' | 'email' | 'sms' | 'chat' | 'governance' | 'data';

/**
 * Agent operational status
 */
export type AgentStatus = 'active' | 'inactive' | 'maintenance' | 'deprecated';

// ==================== CORE AGENT INTERFACE ====================

/**
 * Base interface for all agents in the system
 */
export interface IAgent {
  /** Unique identifier for this agent type */
  readonly id: string;
  
  /** Human-readable name */
  readonly name: string;
  
  /** Agent description */
  readonly description: string;
  
  /** Communication channel this agent operates on */
  readonly channel: AgentChannel;
  
  /** Current operational status */
  status: AgentStatus;
  
  /** Version of the foundational prompt */
  readonly promptVersion: string;
  
  /** Get the foundational prompt for this agent */
  getFoundationalPrompt(): string;
  
  /** Get knowledge sections included in this agent */
  getKnowledgeSections(): AgentKnowledgeSection[];
}

// ==================== KNOWLEDGE SECTIONS ====================

/**
 * Knowledge section that can be included in agent prompts
 */
export interface AgentKnowledgeSection {
  id: string;
  name: string;
  category: KnowledgeCategory;
  content: string;
  priority: number; // Lower = higher priority in prompt
  isRequired: boolean;
}

/**
 * Categories of agent knowledge
 */
export type KnowledgeCategory =
  | 'identity'
  | 'compliance'
  | 'channel_specific'
  | 'design'
  | 'conversion'
  | 'campaign_awareness'
  | 'governance'
  | 'data_intelligence';

// ==================== CAMPAIGN CONTEXT ====================

/**
 * Campaign types supported by agents
 */
export type CampaignType =
  | 'email'
  | 'call'
  | 'combo'
  | 'content_syndication'
  | 'live_webinar'
  | 'on_demand_webinar'
  | 'high_quality_leads'
  | 'executive_dinner'
  | 'leadership_forum'
  | 'conference'
  | 'sql'
  | 'appointment_generation'
  | 'lead_qualification'
  | 'data_validation'
  | 'bant_leads';

/**
 * Campaign context provided to agents
 */
export interface AgentCampaignContext {
  campaignId: string;
  campaignType: CampaignType;
  campaignName: string;
  objective: string;
  targetAudience: string;
  valueProposition?: string;
  complianceRequirements?: string[];
  landingPageUrl?: string;
  callToAction?: string;
  assets?: CampaignAsset[];
}

/**
 * Campaign assets available to agents
 */
export interface CampaignAsset {
  type: 'whitepaper' | 'webinar' | 'case_study' | 'demo' | 'datasheet' | 'other';
  title: string;
  url?: string;
  description?: string;
}

// ==================== CONTACT CONTEXT ====================

/**
 * Contact information provided to agents
 */
export interface AgentContactContext {
  contactId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  title?: string;
  company?: string;
  industry?: string;
  customFields?: Record<string, string>;
}

// ==================== AGENT EXECUTION ====================

/**
 * Input for agent execution
 */
export interface AgentExecutionInput {
  agentId: string;
  campaignContext?: AgentCampaignContext;
  contactContext?: AgentContactContext;
  organizationIntelligence?: string;
  problemIntelligence?: string;
  additionalInstructions?: string;
}

/**
 * Output from agent execution
 */
export interface AgentExecutionOutput {
  success: boolean;
  content: string;
  metadata: AgentExecutionMetadata;
  error?: string;
}

/**
 * Execution metadata for tracking and debugging
 */
export interface AgentExecutionMetadata {
  agentId: string;
  channel: AgentChannel;
  promptVersion: string;
  executionTimestamp: Date;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  layersApplied: string[];
}

// ==================== AGENT REGISTRY ====================

/**
 * Agent registration entry
 */
export interface AgentRegistration {
  agent: IAgent;
  registeredAt: Date;
  lastUpdated: Date;
  usageCount: number;
}

// ==================== ZOD SCHEMAS ====================

export const AgentChannelSchema = z.enum(['voice', 'email', 'sms', 'chat', 'governance', 'data']);
export const AgentStatusSchema = z.enum(['active', 'inactive', 'maintenance', 'deprecated']);

export const AgentCampaignContextSchema = z.object({
  campaignId: z.string(),
  campaignType: z.string(),
  campaignName: z.string(),
  objective: z.string(),
  targetAudience: z.string(),
  valueProposition: z.string().optional(),
  complianceRequirements: z.array(z.string()).optional(),
  landingPageUrl: z.string().url().optional(),
  callToAction: z.string().optional(),
});

export const AgentContactContextSchema = z.object({
  contactId: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  industry: z.string().optional(),
  customFields: z.record(z.string()).optional(),
});
