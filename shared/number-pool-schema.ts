/**
 * Number Pool Management Schema
 * 
 * This file contains Drizzle ORM schema definitions for the Telnyx Number Pool
 * Management System. Import and spread these into your main schema.ts file.
 * 
 * @see docs/NUMBER_POOL_MANAGEMENT_SYSTEM.md for full documentation
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  pgEnum,
  index,
  boolean,
  numeric,
  date,
} from "drizzle-orm/pg-core";

// Import references from main schema
// These should be updated to match your actual imports
import { campaigns, virtualAgents, users, callSessions, dialerCallAttempts } from "./schema";

// ==================== NUMBER POOL MANAGEMENT ENUMS ====================

export const numberStatusEnum = pgEnum('number_status', [
  'active',      // Available for calls
  'cooling',     // In temporary cooldown
  'suspended',   // Admin-suspended
  'retired'      // Permanently removed from pool
]);

export const numberReputationBandEnum = pgEnum('number_reputation_band', [
  'excellent',   // 85-100
  'healthy',     // 70-84
  'warning',     // 55-69
  'risk',        // 40-54
  'burned'       // 0-39
]);

export const assignmentScopeEnum = pgEnum('assignment_scope', [
  'campaign',    // Assigned to specific campaign
  'agent',       // Assigned to specific AI agent
  'region',      // Geographic pool
  'global'       // Available to all
]);

export const cooldownReasonEnum = pgEnum('cooldown_reason', [
  'consecutive_short_calls',      // 3+ short calls in a row
  'zero_answer_rate',             // 0% answers over last 10 calls
  'repeated_failures',            // Multiple Telnyx errors
  'audio_quality_issues',         // Noise/echo flagged
  'reputation_threshold',         // Score dropped below threshold
  'manual_admin',                 // Admin-initiated
  'carrier_block_suspected'       // Block indicators detected
]);

// ==================== TELNYX NUMBERS TABLE ====================

/**
 * Core table for storing Telnyx phone numbers in the pool
 */
export const telnyxNumbers = pgTable("telnyx_numbers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Telnyx identifiers
  phoneNumberE164: text("phone_number_e164").notNull().unique(),
  telnyxNumberId: text("telnyx_number_id"),
  telnyxConnectionId: text("telnyx_connection_id"),
  telnyxMessagingProfileId: text("telnyx_messaging_profile_id"),
  
  // Display & metadata
  displayName: text("display_name"),
  cnam: text("cnam"),
  
  // Geographic data
  countryCode: varchar("country_code", { length: 2 }).notNull().default('US'),
  region: text("region"),
  city: text("city"),
  areaCode: varchar("area_code", { length: 10 }),
  timezone: text("timezone"),
  
  // Status & lifecycle
  status: numberStatusEnum("status").notNull().default('active'),
  statusReason: text("status_reason"),
  statusChangedAt: timestamp("status_changed_at"),
  
  // Tags for assignment matching
  tags: text("tags").array().default(sql`'{}'::text[]`),
  
  // Pacing limits (per-number overrides)
  maxCallsPerHour: integer("max_calls_per_hour").default(40),
  maxCallsPerDay: integer("max_calls_per_day").default(500),
  maxConcurrentCalls: integer("max_concurrent_calls").default(1),
  
  // Last usage tracking
  lastCallAt: timestamp("last_call_at"),
  lastAnsweredAt: timestamp("last_answered_at"),
  callsToday: integer("calls_today").default(0),
  callsThisHour: integer("calls_this_hour").default(0),
  
  // Cost tracking
  monthlyCostCents: integer("monthly_cost_cents"),
  
  // Timestamps
  acquiredAt: timestamp("acquired_at").default(sql`NOW()`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("telnyx_numbers_status_idx").on(table.status),
  areaCodeIdx: index("telnyx_numbers_area_code_idx").on(table.areaCode),
  regionIdx: index("telnyx_numbers_region_idx").on(table.region),
  phoneIdx: index("telnyx_numbers_phone_idx").on(table.phoneNumberE164),
}));

// ==================== NUMBER ASSIGNMENTS TABLE ====================

/**
 * Links numbers to campaigns, agents, or regions
 */
export const numberAssignments = pgTable("number_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  numberId: varchar("number_id").references(() => telnyxNumbers.id, { onDelete: 'cascade' }).notNull(),
  
  // Scope determination
  scope: assignmentScopeEnum("scope").notNull().default('global'),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }),
  virtualAgentId: varchar("virtual_agent_id").references(() => virtualAgents.id, { onDelete: 'cascade' }),
  region: text("region"),
  
  // Priority for routing (higher = preferred)
  priority: integer("priority").notNull().default(0),
  
  // Active window
  isActive: boolean("is_active").notNull().default(true),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
}, (table) => ({
  numberIdx: index("number_assignments_number_idx").on(table.numberId),
  campaignIdx: index("number_assignments_campaign_idx").on(table.campaignId),
  agentIdx: index("number_assignments_agent_idx").on(table.virtualAgentId),
  scopeIdx: index("number_assignments_scope_idx").on(table.scope),
  activeIdx: index("number_assignments_active_idx").on(table.isActive),
}));

// ==================== NUMBER REPUTATION TABLE ====================

/**
 * Stores current reputation score and component metrics for each number
 */
export const numberReputation = pgTable("number_reputation", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  numberId: varchar("number_id").references(() => telnyxNumbers.id, { onDelete: 'cascade' }).notNull().unique(),
  
  // Current score (0-100)
  score: integer("score").notNull().default(70),
  band: numberReputationBandEnum("band").notNull().default('healthy'),
  
  // Component scores (for transparency)
  answerRateScore: integer("answer_rate_score").default(50),
  durationScore: integer("duration_score").default(50),
  shortCallScore: integer("short_call_score").default(50),
  hangupScore: integer("hangup_score").default(50),
  voicemailScore: integer("voicemail_score").default(50),
  failureScore: integer("failure_score").default(50),
  
  // Rolling metrics (last 50 calls)
  totalCalls: integer("total_calls").default(0),
  answeredCalls: integer("answered_calls").default(0),
  shortCalls: integer("short_calls").default(0),
  immediateHangups: integer("immediate_hangups").default(0),
  voicemailCalls: integer("voicemail_calls").default(0),
  failedCalls: integer("failed_calls").default(0),
  avgDurationSec: numeric("avg_duration_sec", { precision: 10, scale: 2 }).default('0'),
  
  // Trend indicators
  scoreTrend: text("score_trend").default('stable'),
  lastScoreChange: integer("last_score_change").default(0),
  
  // Timestamps
  lastCalculatedAt: timestamp("last_calculated_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  scoreIdx: index("number_reputation_score_idx").on(table.score),
  bandIdx: index("number_reputation_band_idx").on(table.band),
}));

// ==================== NUMBER METRICS DAILY TABLE ====================

/**
 * Daily aggregated metrics per number for reporting
 */
export const numberMetricsDaily = pgTable("number_metrics_daily", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  numberId: varchar("number_id").references(() => telnyxNumbers.id, { onDelete: 'cascade' }).notNull(),
  metricDate: date("metric_date").notNull(),
  
  // Call volume
  totalCalls: integer("total_calls").default(0),
  answeredCalls: integer("answered_calls").default(0),
  noAnswerCalls: integer("no_answer_calls").default(0),
  voicemailCalls: integer("voicemail_calls").default(0),
  busyCalls: integer("busy_calls").default(0),
  failedCalls: integer("failed_calls").default(0),
  
  // Quality metrics
  shortCalls: integer("short_calls").default(0),
  immediateHangups: integer("immediate_hangups").default(0),
  avgDurationSec: numeric("avg_duration_sec", { precision: 10, scale: 2 }).default('0'),
  maxDurationSec: integer("max_duration_sec").default(0),
  
  // Conversion metrics
  qualifiedCalls: integer("qualified_calls").default(0),
  callbacksScheduled: integer("callbacks_scheduled").default(0),
  
  // Pacing
  peakHour: integer("peak_hour"),
  peakHourCalls: integer("peak_hour_calls").default(0),
  
  // Cost
  totalCostCents: integer("total_cost_cents").default(0),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  numberDateIdx: index("number_metrics_daily_number_date_idx").on(table.numberId, table.metricDate),
}));

// ==================== NUMBER METRICS WINDOW TABLE ====================

/**
 * Rolling window of recent calls for reputation calculation
 */
export const numberMetricsWindow = pgTable("number_metrics_window", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  numberId: varchar("number_id").references(() => telnyxNumbers.id, { onDelete: 'cascade' }).notNull(),
  
  // Call reference
  callSessionId: varchar("call_session_id").references(() => callSessions.id, { onDelete: 'set null' }),
  dialerAttemptId: varchar("dialer_attempt_id").references(() => dialerCallAttempts.id, { onDelete: 'set null' }),
  
  // Call data
  calledAt: timestamp("called_at").notNull(),
  answered: boolean("answered").default(false),
  durationSec: integer("duration_sec").default(0),
  disposition: text("disposition"),
  
  // Failure indicators
  isShortCall: boolean("is_short_call").default(false),
  isImmediateHangup: boolean("is_immediate_hangup").default(false),
  isVoicemail: boolean("is_voicemail").default(false),
  isFailed: boolean("is_failed").default(false),
  failureReason: text("failure_reason"),
  
  // Prospect info
  prospectNumberE164: text("prospect_number_e164"),
  campaignId: varchar("campaign_id"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  numberTimeIdx: index("number_metrics_window_number_time_idx").on(table.numberId, table.calledAt),
  prospectIdx: index("number_metrics_window_prospect_idx").on(table.prospectNumberE164, table.numberId),
  callSessionIdx: index("number_metrics_window_call_session_idx").on(table.callSessionId),
}));

// ==================== NUMBER COOLDOWNS TABLE ====================

/**
 * Active and historical cooldown periods for numbers
 */
export const numberCooldowns = pgTable("number_cooldowns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  numberId: varchar("number_id").references(() => telnyxNumbers.id, { onDelete: 'cascade' }).notNull(),
  
  // Cooldown period
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endsAt: timestamp("ends_at").notNull(),
  endedEarlyAt: timestamp("ended_early_at"),
  
  // Reason
  reason: cooldownReasonEnum("reason").notNull(),
  reasonDetails: jsonb("reason_details"),
  
  // Recovery settings
  recoveryMaxCallsPerHour: integer("recovery_max_calls_per_hour"),
  recoveryMaxCallsPerDay: integer("recovery_max_calls_per_day"),
  recoveryDurationHours: integer("recovery_duration_hours").default(24),
  
  // Tracking
  triggeredBy: varchar("triggered_by"),
  isActive: boolean("is_active").notNull().default(true),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  numberActiveIdx: index("number_cooldowns_number_active_idx").on(table.numberId, table.isActive),
  endsAtIdx: index("number_cooldowns_ends_at_idx").on(table.endsAt),
}));

// ==================== PROSPECT CALL SUPPRESSION TABLE ====================

/**
 * Per-prospect cooldown to prevent over-calling
 */
export const prospectCallSuppression = pgTable("prospect_call_suppression", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  prospectNumberE164: text("prospect_number_e164").notNull().unique(),
  
  // Last attempt info
  lastCalledAt: timestamp("last_called_at").notNull(),
  lastDisposition: text("last_disposition"),
  lastNumberId: varchar("last_number_id").references(() => telnyxNumbers.id, { onDelete: 'set null' }),
  
  // Suppression rules
  suppressUntil: timestamp("suppress_until"),
  suppressReason: text("suppress_reason"),
  
  // Stats
  callAttempts24h: integer("call_attempts_24h").default(1),
  callAttempts7d: integer("call_attempts_7d").default(1),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  numberIdx: index("prospect_suppression_number_idx").on(table.prospectNumberE164),
  untilIdx: index("prospect_suppression_until_idx").on(table.suppressUntil),
}));

// ==================== NUMBER ROUTING DECISIONS TABLE ====================

/**
 * Audit log of routing decisions for debugging and analysis
 */
export const numberRoutingDecisions = pgTable("number_routing_decisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Call reference
  callSessionId: varchar("call_session_id").references(() => callSessions.id, { onDelete: 'set null' }),
  dialerAttemptId: varchar("dialer_attempt_id").references(() => dialerCallAttempts.id, { onDelete: 'set null' }),
  
  // Request context
  campaignId: varchar("campaign_id"),
  virtualAgentId: varchar("virtual_agent_id"),
  prospectNumberE164: text("prospect_number_e164"),
  prospectAreaCode: varchar("prospect_area_code", { length: 10 }),
  prospectRegion: text("prospect_region"),
  
  // Decision
  selectedNumberId: varchar("selected_number_id").references(() => telnyxNumbers.id, { onDelete: 'set null' }),
  selectedNumberE164: text("selected_number_e164"),
  selectionReason: text("selection_reason"),
  
  // Candidates considered
  candidatesCount: integer("candidates_count").default(0),
  candidatesFilteredOut: jsonb("candidates_filtered_out"),
  
  // Timing
  routingLatencyMs: integer("routing_latency_ms"),
  jitterDelayMs: integer("jitter_delay_ms"),
  
  decidedAt: timestamp("decided_at").notNull().defaultNow(),
}, (table) => ({
  callIdx: index("routing_decisions_call_idx").on(table.callSessionId),
  numberIdx: index("routing_decisions_number_idx").on(table.selectedNumberId),
  timeIdx: index("routing_decisions_time_idx").on(table.decidedAt),
  campaignIdx: index("routing_decisions_campaign_idx").on(table.campaignId),
}));

// ==================== NUMBER POOL ALERTS TABLE ====================

/**
 * Alerts for number pool issues
 */
export const numberPoolAlerts = pgTable("number_pool_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Alert details
  alertType: text("alert_type").notNull(),
  severity: text("severity").notNull().default('warning'),
  
  // Related entities
  numberId: varchar("number_id").references(() => telnyxNumbers.id, { onDelete: 'cascade' }),
  campaignId: varchar("campaign_id"),
  
  // Message
  title: text("title").notNull(),
  description: text("description"),
  details: jsonb("details"),
  
  // Status
  isAcknowledged: boolean("is_acknowledged").default(false),
  acknowledgedBy: varchar("acknowledged_by").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  unackIdx: index("number_pool_alerts_unack_idx").on(table.isAcknowledged, table.createdAt),
  numberIdx: index("number_pool_alerts_number_idx").on(table.numberId),
}));

// ==================== TYPE EXPORTS ====================

export type TelnyxNumber = typeof telnyxNumbers.$inferSelect;
export type NewTelnyxNumber = typeof telnyxNumbers.$inferInsert;

export type NumberAssignment = typeof numberAssignments.$inferSelect;
export type NewNumberAssignment = typeof numberAssignments.$inferInsert;

export type NumberReputationRecord = typeof numberReputation.$inferSelect;
export type NewNumberReputationRecord = typeof numberReputation.$inferInsert;

export type NumberMetricsDailyRecord = typeof numberMetricsDaily.$inferSelect;
export type NumberMetricsWindowRecord = typeof numberMetricsWindow.$inferSelect;

export type NumberCooldown = typeof numberCooldowns.$inferSelect;
export type NewNumberCooldown = typeof numberCooldowns.$inferInsert;

export type ProspectSuppression = typeof prospectCallSuppression.$inferSelect;
export type NumberRoutingDecision = typeof numberRoutingDecisions.$inferSelect;
export type NumberPoolAlert = typeof numberPoolAlerts.$inferSelect;

// Enum types
export type NumberStatus = typeof numberStatusEnum.enumValues[number];
export type NumberReputationBand = typeof numberReputationBandEnum.enumValues[number];
export type AssignmentScope = typeof assignmentScopeEnum.enumValues[number];
export type CooldownReason = typeof cooldownReasonEnum.enumValues[number];
