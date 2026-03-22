# Telnyx Number Pool Management System
## Complete Implementation Plan & System Design

**Version:** 1.0  
**Date:** February 2, 2026  
**Status:** Implementation Plan  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Database Schema](#3-database-schema)
4. [API Endpoints](#4-api-endpoints)
5. [Core Services](#5-core-services)
6. [Router Algorithm](#6-router-algorithm)
7. [Reputation Scoring](#7-reputation-scoring)
8. [Cooldown & Suppression](#8-cooldown--suppression)
9. [Pacing Algorithm](#9-pacing-algorithm)
10. [Dashboard Views](#10-dashboard-views)
11. [Phased Implementation](#11-phased-implementation)
12. [Testing Strategy](#12-testing-strategy)
13. [Rollout Strategy](#13-rollout-strategy)
14. [Failure Handling](#14-failure-handling)

---

## 1. Executive Summary

### Current State
- Single Telnyx number (`TELNYX_FROM_NUMBER`) used for all outbound calls
- No number-level performance tracking or reputation management
- Risk of carrier blocking/spam flagging due to single-number overuse
- No geographic matching for local presence dialing

### Target State
- Pool of 5-6+ DIDs managed dynamically
- Per-number reputation scoring and automated cooldown
- Intelligent routing based on reputation, caps, and geography
- Real-time dashboards for number performance monitoring
- Carrier-safe pacing with human-like jitter

### Integration Points (Existing System)
- `telnyx-ai-bridge.ts` - Gemini Live call initiation
- `voice-dialer.ts` - Power dialer and call orchestration
- `unified-call-router.ts` - Central call routing
- `campaigns` table - Campaign configuration
- `virtualAgents` table - AI agent definitions
- `callSessions` table - Call tracking
- `dialerCallAttempts` table - Call attempt records

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ADMIN DASHBOARD                                      │
│  ┌─────────────┐ ┌─────────────────┐ ┌────────────────┐ ┌────────────────┐  │
│  │ Number Pool │ │ Number Detail   │ │ Campaign View  │ │ Alerts Console │  │
│  │ Overview    │ │ Metrics/History │ │ Routing Stats  │ │ & Monitoring   │  │
│  └─────────────┘ └─────────────────┘ └────────────────┘ └────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            API LAYER                                         │
│  /api/numbers/* │ /api/number-routing/* │ /api/number-metrics/*             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SERVICE LAYER                                       │
│                                                                              │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐             │
│  │ Number Service │  │ Router Service  │  │ Reputation Engine│             │
│  │ (CRUD/Sync)    │  │ (DID Selection) │  │ (Scoring Model)  │             │
│  └────────────────┘  └─────────────────┘  └──────────────────┘             │
│                                                                              │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐             │
│  │ Pacing         │  │ Cooldown        │  │ Telemetry        │             │
│  │ Scheduler      │  │ Manager         │  │ Collector        │             │
│  └────────────────┘  └─────────────────┘  └──────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATA LAYER                                          │
│                                                                              │
│  ┌────────────┐ ┌───────────────────┐ ┌─────────────────────┐              │
│  │ telnyx_    │ │ number_assignments │ │ number_metrics_     │              │
│  │ numbers    │ │                    │ │ daily/window        │              │
│  └────────────┘ └───────────────────┘ └─────────────────────┘              │
│                                                                              │
│  ┌────────────┐ ┌───────────────────┐ ┌─────────────────────┐              │
│  │ number_    │ │ number_cooldowns   │ │ call_sessions       │              │
│  │ reputation │ │                    │ │ (updated)           │              │
│  └────────────┘ └───────────────────┘ └─────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TELNYX API                                            │
│  Phone Numbers API │ Call Control API │ Recordings API │ Webhooks           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema

### 3.1 Core Tables (SQL)

```sql
-- ============================================================================
-- TELNYX NUMBERS - Core number inventory
-- ============================================================================
CREATE TYPE number_status AS ENUM (
  'active',      -- Available for calls
  'cooling',     -- In temporary cooldown
  'suspended',   -- Admin-suspended
  'retired'      -- Permanently removed from pool
);

CREATE TYPE number_reputation_band AS ENUM (
  'excellent',   -- 85-100
  'healthy',     -- 70-84
  'warning',     -- 55-69
  'risk',        -- 40-54
  'burned'       -- 0-39
);

CREATE TABLE telnyx_numbers (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Telnyx identifiers
  phone_number_e164 TEXT NOT NULL UNIQUE,        -- E.164 format (+12095551234)
  telnyx_number_id TEXT,                          -- Telnyx API ID
  telnyx_connection_id TEXT,                      -- Connection/profile ID
  telnyx_messaging_profile_id TEXT,               -- For SMS if applicable
  
  -- Display & metadata
  display_name TEXT,                              -- Friendly name
  cnam TEXT,                                      -- Caller ID Name (if supported)
  
  -- Geographic data
  country_code VARCHAR(2) NOT NULL DEFAULT 'US',
  region TEXT,                                    -- State/Province (e.g., 'CA', 'TX')
  city TEXT,
  area_code VARCHAR(10),                          -- NPA for routing
  timezone TEXT,                                  -- IANA timezone
  
  -- Status & lifecycle
  status number_status NOT NULL DEFAULT 'active',
  status_reason TEXT,                             -- Why status changed
  status_changed_at TIMESTAMP,
  
  -- Tags for assignment matching
  tags TEXT[] DEFAULT '{}',                       -- e.g., ['campaign:abc', 'region:west']
  
  -- Pacing limits (per-number overrides)
  max_calls_per_hour INTEGER DEFAULT 20,
  max_calls_per_day INTEGER DEFAULT 100,
  max_concurrent_calls INTEGER DEFAULT 1,
  
  -- Last usage tracking
  last_call_at TIMESTAMP,
  last_answered_at TIMESTAMP,
  calls_today INTEGER DEFAULT 0,
  calls_this_hour INTEGER DEFAULT 0,
  
  -- Cost tracking (optional)
  monthly_cost_cents INTEGER,
  
  -- Timestamps
  acquired_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_telnyx_numbers_status ON telnyx_numbers(status);
CREATE INDEX idx_telnyx_numbers_area_code ON telnyx_numbers(area_code);
CREATE INDEX idx_telnyx_numbers_region ON telnyx_numbers(region);
CREATE INDEX idx_telnyx_numbers_tags ON telnyx_numbers USING GIN(tags);

-- ============================================================================
-- NUMBER ASSIGNMENTS - Links numbers to campaigns/agents/regions
-- ============================================================================
CREATE TYPE assignment_scope AS ENUM (
  'campaign',      -- Assigned to specific campaign
  'agent',         -- Assigned to specific AI agent
  'region',        -- Geographic pool
  'global'         -- Available to all
);

CREATE TABLE number_assignments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  number_id VARCHAR NOT NULL REFERENCES telnyx_numbers(id) ON DELETE CASCADE,
  
  -- Scope determination (one should be set)
  scope assignment_scope NOT NULL DEFAULT 'global',
  campaign_id VARCHAR REFERENCES campaigns(id) ON DELETE CASCADE,
  virtual_agent_id VARCHAR REFERENCES virtual_agents(id) ON DELETE CASCADE,
  region TEXT,                                    -- For region-based pools
  
  -- Priority for routing (higher = preferred)
  priority INTEGER NOT NULL DEFAULT 0,
  
  -- Active window
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from TIMESTAMP,
  valid_until TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR REFERENCES users(id),
  
  CONSTRAINT valid_scope CHECK (
    (scope = 'campaign' AND campaign_id IS NOT NULL) OR
    (scope = 'agent' AND virtual_agent_id IS NOT NULL) OR
    (scope = 'region' AND region IS NOT NULL) OR
    (scope = 'global')
  )
);

CREATE INDEX idx_number_assignments_number ON number_assignments(number_id);
CREATE INDEX idx_number_assignments_campaign ON number_assignments(campaign_id);
CREATE INDEX idx_number_assignments_agent ON number_assignments(virtual_agent_id);
CREATE INDEX idx_number_assignments_scope ON number_assignments(scope);

-- ============================================================================
-- NUMBER REPUTATION - Current reputation scores
-- ============================================================================
CREATE TABLE number_reputation (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  number_id VARCHAR NOT NULL REFERENCES telnyx_numbers(id) ON DELETE CASCADE UNIQUE,
  
  -- Current score (0-100)
  score INTEGER NOT NULL DEFAULT 70,
  band number_reputation_band NOT NULL DEFAULT 'healthy',
  
  -- Component scores (for transparency)
  answer_rate_score INTEGER DEFAULT 50,           -- Higher = better
  duration_score INTEGER DEFAULT 50,              -- Higher = better (longer calls)
  short_call_score INTEGER DEFAULT 50,            -- Higher = fewer short calls
  hangup_score INTEGER DEFAULT 50,                -- Higher = fewer immediate hangups
  voicemail_score INTEGER DEFAULT 50,             -- Lower voicemail rate = higher
  failure_score INTEGER DEFAULT 50,               -- Higher = fewer carrier errors
  
  -- Rolling metrics (last 50 calls)
  total_calls INTEGER DEFAULT 0,
  answered_calls INTEGER DEFAULT 0,
  short_calls INTEGER DEFAULT 0,                  --  ({
  statusIdx: index("telnyx_numbers_status_idx").on(table.status),
  areaCodeIdx: index("telnyx_numbers_area_code_idx").on(table.areaCode),
  regionIdx: index("telnyx_numbers_region_idx").on(table.region),
}));

// ==================== NUMBER ASSIGNMENTS TABLE ====================

export const numberAssignments = pgTable("number_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  numberId: varchar("number_id").references(() => telnyxNumbers.id, { onDelete: 'cascade' }).notNull(),
  
  scope: assignmentScopeEnum("scope").notNull().default('global'),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }),
  virtualAgentId: varchar("virtual_agent_id").references(() => virtualAgents.id, { onDelete: 'cascade' }),
  region: text("region"),
  
  priority: integer("priority").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
}, (table) => ({
  numberIdx: index("number_assignments_number_idx").on(table.numberId),
  campaignIdx: index("number_assignments_campaign_idx").on(table.campaignId),
  agentIdx: index("number_assignments_agent_idx").on(table.virtualAgentId),
  scopeIdx: index("number_assignments_scope_idx").on(table.scope),
}));

// ==================== NUMBER REPUTATION TABLE ====================

export const numberReputation = pgTable("number_reputation", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  numberId: varchar("number_id").references(() => telnyxNumbers.id, { onDelete: 'cascade' }).notNull().unique(),
  
  score: integer("score").notNull().default(70),
  band: numberReputationBandEnum("band").notNull().default('healthy'),
  
  // Component scores
  answerRateScore: integer("answer_rate_score").default(50),
  durationScore: integer("duration_score").default(50),
  shortCallScore: integer("short_call_score").default(50),
  hangupScore: integer("hangup_score").default(50),
  voicemailScore: integer("voicemail_score").default(50),
  failureScore: integer("failure_score").default(50),
  
  // Rolling metrics
  totalCalls: integer("total_calls").default(0),
  answeredCalls: integer("answered_calls").default(0),
  shortCalls: integer("short_calls").default(0),
  immediateHangups: integer("immediate_hangups").default(0),
  voicemailCalls: integer("voicemail_calls").default(0),
  failedCalls: integer("failed_calls").default(0),
  avgDurationSec: numeric("avg_duration_sec", { precision: 10, scale: 2 }).default('0'),
  
  // Trend
  scoreTrend: text("score_trend").default('stable'),
  lastScoreChange: integer("last_score_change").default(0),
  
  lastCalculatedAt: timestamp("last_calculated_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  scoreIdx: index("number_reputation_score_idx").on(table.score),
  bandIdx: index("number_reputation_band_idx").on(table.band),
}));

// ==================== NUMBER COOLDOWNS TABLE ====================

export const numberCooldowns = pgTable("number_cooldowns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  numberId: varchar("number_id").references(() => telnyxNumbers.id, { onDelete: 'cascade' }).notNull(),
  
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endsAt: timestamp("ends_at").notNull(),
  endedEarlyAt: timestamp("ended_early_at"),
  
  reason: cooldownReasonEnum("reason").notNull(),
  reasonDetails: jsonb("reason_details"),
  
  recoveryMaxCallsPerHour: integer("recovery_max_calls_per_hour"),
  recoveryMaxCallsPerDay: integer("recovery_max_calls_per_day"),
  recoveryDurationHours: integer("recovery_duration_hours").default(24),
  
  triggeredBy: varchar("triggered_by"),
  isActive: boolean("is_active").notNull().default(true),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  numberActiveIdx: index("number_cooldowns_number_active_idx").on(table.numberId, table.isActive),
  endsAtIdx: index("number_cooldowns_ends_at_idx").on(table.endsAt),
}));
```

---

## 4. API Endpoints

### 4.1 Number Management APIs

```typescript
// File: server/routes/number-pool.ts

// ==================== NUMBER CRUD ====================

// GET /api/numbers
// List all numbers in pool with filters
GET /api/numbers
Query params:
  - status?: 'active' | 'cooling' | 'suspended' | 'retired'
  - region?: string
  - areaCode?: string
  - campaignId?: string
  - search?: string (phone number partial match)
Response: { numbers: TelnyxNumber[], total: number }

// GET /api/numbers/:id
// Get single number with reputation and assignments
GET /api/numbers/:id
Response: { number: TelnyxNumber, reputation: NumberReputation, assignments: NumberAssignment[] }

// POST /api/numbers/sync
// Sync numbers from Telnyx API
POST /api/numbers/sync
Response: { synced: number, added: number, updated: number }

// POST /api/numbers
// Manually add number (if not using sync)
POST /api/numbers
Body: { phoneNumberE164, displayName?, region?, tags? }
Response: { number: TelnyxNumber }

// PATCH /api/numbers/:id
// Update number settings
PATCH /api/numbers/:id
Body: { displayName?, maxCallsPerHour?, maxCallsPerDay?, tags?, status? }
Response: { number: TelnyxNumber }

// POST /api/numbers/:id/activate
// Activate suspended/retired number
POST /api/numbers/:id/activate
Response: { success: true }

// POST /api/numbers/:id/suspend
// Suspend number (admin action)
POST /api/numbers/:id/suspend
Body: { reason: string }
Response: { success: true }

// POST /api/numbers/:id/retire
// Permanently retire number
POST /api/numbers/:id/retire
Response: { success: true }

// ==================== ASSIGNMENTS ====================

// GET /api/numbers/:id/assignments
// List assignments for a number
GET /api/numbers/:id/assignments
Response: { assignments: NumberAssignment[] }

// POST /api/numbers/:id/assignments
// Create assignment
POST /api/numbers/:id/assignments
Body: { scope, campaignId?, virtualAgentId?, region?, priority? }
Response: { assignment: NumberAssignment }

// DELETE /api/numbers/:id/assignments/:assignmentId
// Remove assignment
DELETE /api/numbers/:id/assignments/:assignmentId
Response: { success: true }

// ==================== COOLDOWNS ====================

// GET /api/numbers/:id/cooldowns
// List cooldown history
GET /api/numbers/:id/cooldowns
Query: { active?: boolean }
Response: { cooldowns: NumberCooldown[] }

// POST /api/numbers/:id/cooldowns
// Manually trigger cooldown
POST /api/numbers/:id/cooldowns
Body: { reason, durationHours }
Response: { cooldown: NumberCooldown }

// POST /api/numbers/:id/cooldowns/:cooldownId/end
// End cooldown early
POST /api/numbers/:id/cooldowns/:cooldownId/end
Response: { success: true }

// ==================== METRICS ====================

// GET /api/numbers/:id/metrics
// Get number metrics
GET /api/numbers/:id/metrics
Query: { period: 'hour' | 'day' | 'week' | 'month' }
Response: { metrics: NumberMetrics, history: NumberMetricsDaily[] }

// GET /api/numbers/:id/calls
// Get recent calls for number
GET /api/numbers/:id/calls
Query: { limit?: number, offset?: number }
Response: { calls: CallRecord[], total: number }

// ==================== ROUTING ====================

// POST /api/number-routing/select
// Select best number for a call (internal API)
POST /api/number-routing/select
Body: { 
  campaignId, 
  virtualAgentId?, 
  prospectNumber, 
  prospectRegion?,
  prospectTimezone?
}
Response: { 
  numberId, 
  numberE164, 
  selectionReason,
  jitterDelayMs,
  decisionId
}

// GET /api/number-routing/decisions
// Get routing decision history
GET /api/number-routing/decisions
Query: { campaignId?, numberId?, limit?, offset? }
Response: { decisions: RoutingDecision[] }
```

### 4.2 Dashboard APIs

```typescript
// GET /api/numbers/dashboard/overview
// Get pool overview for dashboard
GET /api/numbers/dashboard/overview
Response: {
  totalNumbers: number,
  activeNumbers: number,
  coolingNumbers: number,
  suspendedNumbers: number,
  averageReputation: number,
  callsToday: number,
  answersToday: number,
  numbersByBand: { excellent: n, healthy: n, warning: n, risk: n, burned: n },
  alerts: Alert[]
}

// GET /api/numbers/dashboard/performance
// Get performance comparison across numbers
GET /api/numbers/dashboard/performance
Query: { period: 'day' | 'week' | 'month' }
Response: {
  numbers: {
    id, phoneNumber, status, reputation, 
    calls, answers, answerRate, avgDuration,
    shortCallRate, campaigns, lastUsed
  }[]
}

// GET /api/campaigns/:id/numbers
// Get numbers used by campaign with stats
GET /api/campaigns/:id/numbers
Response: {
  assignedNumbers: TelnyxNumber[],
  poolNumbers: TelnyxNumber[],
  callDistribution: { numberId, calls, answers, qualified }[],
  recommendations: string[]
}
```

---

## 5. Core Services

### 5.1 Number Service

```typescript
// File: server/services/number-pool/number-service.ts

export class NumberService {
  /**
   * Sync phone numbers from Telnyx API
   */
  async syncFromTelnyx(): Promise {
    const telnyxNumbers = await this.fetchTelnyxNumbers();
    
    for (const tn of telnyxNumbers) {
      const existing = await this.findByE164(tn.phone_number);
      
      if (existing) {
        await this.update(existing.id, {
          telnyxNumberId: tn.id,
          telnyxConnectionId: tn.connection_id,
          // Update other Telnyx-sourced fields
        });
      } else {
        await this.create({
          phoneNumberE164: tn.phone_number,
          telnyxNumberId: tn.id,
          region: this.extractRegion(tn.phone_number),
          areaCode: this.extractAreaCode(tn.phone_number),
          status: 'active',
        });
        
        // Initialize reputation record
        await this.reputationService.initialize(newNumber.id);
      }
    }
    
    return { synced: count, added: newCount, updated: updateCount };
  }

  /**
   * Get all numbers matching criteria
   */
  async findEligible(criteria: NumberCriteria): Promise {
    return db.select()
      .from(telnyxNumbers)
      .leftJoin(numberReputation, eq(telnyxNumbers.id, numberReputation.numberId))
      .leftJoin(numberCooldowns, and(
        eq(telnyxNumbers.id, numberCooldowns.numberId),
        eq(numberCooldowns.isActive, true)
      ))
      .where(and(
        eq(telnyxNumbers.status, 'active'),
        isNull(numberCooldowns.id), // No active cooldown
        criteria.campaignId ? exists(
          db.select()
            .from(numberAssignments)
            .where(and(
              eq(numberAssignments.numberId, telnyxNumbers.id),
              or(
                eq(numberAssignments.scope, 'global'),
                eq(numberAssignments.campaignId, criteria.campaignId)
              )
            ))
        ) : sql`true`
      ))
      .orderBy(desc(numberReputation.score));
  }

  /**
   * Update usage counters
   */
  async recordCall(numberId: string, outcome: CallOutcome): Promise {
    await db.update(telnyxNumbers)
      .set({
        lastCallAt: new Date(),
        callsToday: sql`calls_today + 1`,
        callsThisHour: sql`calls_this_hour + 1`,
        ...(outcome.answered ? { lastAnsweredAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(telnyxNumbers.id, numberId));
    
    // Record in metrics window for reputation calculation
    await this.metricsService.recordCall(numberId, outcome);
    
    // Recalculate reputation
    await this.reputationService.recalculate(numberId);
  }

  /**
   * Reset hourly counters (run via cron every hour)
   */
  async resetHourlyCounts(): Promise {
    await db.update(telnyxNumbers)
      .set({ callsThisHour: 0 });
  }

  /**
   * Reset daily counters (run via cron at midnight)
   */
  async resetDailyCounts(): Promise {
    // First, aggregate to daily metrics
    await this.metricsService.aggregateDailyMetrics();
    
    // Then reset
    await db.update(telnyxNumbers)
      .set({ callsToday: 0, callsThisHour: 0 });
  }
}
```

### 5.2 Router Service

```typescript
// File: server/services/number-pool/number-router-service.ts

export interface NumberSelectionRequest {
  campaignId: string;
  virtualAgentId?: string;
  prospectNumber: string;
  prospectRegion?: string;
  prospectTimezone?: string;
  excludeNumberIds?: string[];
}

export interface NumberSelectionResult {
  numberId: string;
  numberE164: string;
  selectionReason: string;
  jitterDelayMs: number;
  decisionId: string;
}

export class NumberRouterService {
  private readonly MAX_CALLS_PER_HOUR_DEFAULT = 20;
  private readonly MAX_CALLS_PER_DAY_DEFAULT = 100;
  private readonly JITTER_MIN_MS = 80_000;  // 80 seconds
  private readonly JITTER_MAX_MS = 160_000; // 160 seconds

  /**
   * Select the best available number for an outbound call
   * 
   * Algorithm:
   * 1. Get eligible pool (campaign/agent assignments + global)
   * 2. Filter out: inactive, cooling, at-cap, concurrent-in-use
   * 3. Rank by: local match, reputation, recency
   * 4. Return best + calculate jitter delay
   */
  async selectNumber(request: NumberSelectionRequest): Promise {
    const startTime = Date.now();
    
    // Step 1: Get eligible numbers
    const pool = await this.getEligiblePool(request);
    
    if (pool.length === 0) {
      throw new NoAvailableNumberError('No eligible numbers in pool');
    }

    // Step 2: Filter numbers
    const { available, filtered } = await this.filterNumbers(pool, request);
    
    if (available.length === 0) {
      // Log why all numbers were filtered
      console.warn('[NumberRouter] All numbers filtered:', filtered);
      throw new NoAvailableNumberError('All numbers filtered (at cap, cooling, or in use)');
    }

    // Step 3: Rank candidates
    const ranked = this.rankCandidates(available, request);
    
    // Step 4: Select best
    const selected = ranked[0];
    
    // Step 5: Calculate jitter
    const jitterDelayMs = this.calculateJitter(selected);
    
    // Step 6: Record decision
    const decisionId = await this.recordDecision({
      request,
      selected,
      candidatesCount: pool.length,
      filteredOut: filtered,
      latencyMs: Date.now() - startTime,
      jitterDelayMs,
    });
    
    // Step 7: Mark number in-use (will be released after call completes)
    await this.markInUse(selected.id);

    return {
      numberId: selected.id,
      numberE164: selected.phoneNumberE164,
      selectionReason: selected.selectionReason,
      jitterDelayMs,
      decisionId,
    };
  }

  /**
   * Get eligible number pool based on assignments
   */
  private async getEligiblePool(request: NumberSelectionRequest): Promise {
    // Query numbers with their assignments, reputation, and current status
    const numbers = await db.select({
      number: telnyxNumbers,
      reputation: numberReputation,
      assignment: numberAssignments,
    })
    .from(telnyxNumbers)
    .leftJoin(numberReputation, eq(telnyxNumbers.id, numberReputation.numberId))
    .leftJoin(numberAssignments, and(
      eq(numberAssignments.numberId, telnyxNumbers.id),
      eq(numberAssignments.isActive, true),
      or(
        eq(numberAssignments.scope, 'global'),
        and(
          eq(numberAssignments.scope, 'campaign'),
          eq(numberAssignments.campaignId, request.campaignId)
        ),
        request.virtualAgentId ? and(
          eq(numberAssignments.scope, 'agent'),
          eq(numberAssignments.virtualAgentId, request.virtualAgentId)
        ) : sql`false`
      )
    ))
    .where(eq(telnyxNumbers.status, 'active'));

    return numbers.map(row => ({
      ...row.number,
      reputation: row.reputation,
      assignmentPriority: row.assignment?.priority ?? 0,
    }));
  }

  /**
   * Filter out numbers that can't be used right now
   */
  private async filterNumbers(
    pool: EligibleNumber[], 
    request: NumberSelectionRequest
  ): Promise }> {
    const filtered: Record = {
      'at_hourly_cap': 0,
      'at_daily_cap': 0,
      'in_cooldown': 0,
      'concurrent_in_use': 0,
      'recently_called_prospect': 0,
      'excluded': 0,
    };
    
    const available: EligibleNumber[] = [];
    const now = new Date();
    const currentHour = now.getHours();

    for (const num of pool) {
      // Check exclusions
      if (request.excludeNumberIds?.includes(num.id)) {
        filtered['excluded']++;
        continue;
      }

      // Check hourly cap
      if (num.callsThisHour >= (num.maxCallsPerHour || this.MAX_CALLS_PER_HOUR_DEFAULT)) {
        filtered['at_hourly_cap']++;
        continue;
      }

      // Check daily cap
      if (num.callsToday >= (num.maxCallsPerDay || this.MAX_CALLS_PER_DAY_DEFAULT)) {
        filtered['at_daily_cap']++;
        continue;
      }

      // Check cooldown
      const activeCooldown = await db.select()
        .from(numberCooldowns)
        .where(and(
          eq(numberCooldowns.numberId, num.id),
          eq(numberCooldowns.isActive, true),
          gt(numberCooldowns.endsAt, now)
        ))
        .limit(1);
      
      if (activeCooldown.length > 0) {
        filtered['in_cooldown']++;
        continue;
      }

      // Check concurrent calls (max 1 per DID)
      const inUse = await this.isNumberInUse(num.id);
      if (inUse) {
        filtered['concurrent_in_use']++;
        continue;
      }

      // Check if we recently called this prospect from this number
      const recentCall = await this.recentlyCalledProspect(
        num.id, 
        request.prospectNumber,
        24 // hours
      );
      if (recentCall) {
        filtered['recently_called_prospect']++;
        continue;
      }

      available.push(num);
    }

    return { available, filtered };
  }

  /**
   * Rank candidates by selection criteria
   */
  private rankCandidates(
    candidates: EligibleNumber[], 
    request: NumberSelectionRequest
  ): RankedNumber[] {
    const prospectAreaCode = this.extractAreaCode(request.prospectNumber);
    
    return candidates
      .map(num => {
        let score = 0;
        let reason = '';

        // Local match bonus (20 points)
        if (num.areaCode === prospectAreaCode) {
          score += 20;
          reason = 'local_match';
        }

        // Region match bonus (10 points)
        if (request.prospectRegion && num.region === request.prospectRegion) {
          score += 10;
          reason = reason || 'region_match';
        }

        // Reputation score (0-100 scaled to 0-50)
        const repScore = (num.reputation?.score ?? 70) / 2;
        score += repScore;
        
        if (!reason && repScore >= 40) {
          reason = 'highest_reputation';
        }

        // Assignment priority bonus
        score += num.assignmentPriority * 5;
        
        // Least recently used bonus (up to 10 points)
        if (num.lastCallAt) {
          const hoursSinceLastCall = (Date.now() - num.lastCallAt.getTime()) / 3600000;
          score += Math.min(10, hoursSinceLastCall);
        } else {
          score += 10; // Never used = full bonus
        }
        
        // Lower short-call rate bonus
        if (num.reputation?.shortCalls && num.reputation?.totalCalls) {
          const shortCallRate = num.reputation.shortCalls / num.reputation.totalCalls;
          score += (1 - shortCallRate) * 10;
        }

        return {
          ...num,
          rankScore: score,
          selectionReason: reason || 'pool_selection',
        };
      })
      .sort((a, b) => b.rankScore - a.rankScore);
  }

  /**
   * Calculate jitter delay for carrier-safe pacing
   */
  private calculateJitter(number: EligibleNumber): number {
    // Base jitter: random between 80-160 seconds
    let jitter = this.JITTER_MIN_MS + Math.random() * (this.JITTER_MAX_MS - this.JITTER_MIN_MS);
    
    // If reputation is lower, add extra delay
    const rep = number.reputation?.score ?? 70;
    if (rep  {
    await this.markNotInUse(numberId);
  }
}
```

### 5.3 Reputation Engine

```typescript
// File: server/services/number-pool/reputation-engine.ts

export interface ReputationWeights {
  answerRate: number;
  avgDuration: number;
  shortCallRate: number;
  immediateHangupRate: number;
  voicemailRate: number;
  failureRate: number;
}

export class ReputationEngine {
  // Weights for score calculation (sum = 1.0)
  private readonly WEIGHTS: ReputationWeights = {
    answerRate: 0.30,        // 30% - Most important signal
    avgDuration: 0.20,       // 20% - Longer calls = healthy
    shortCallRate: 0.15,     // 15% - Few short calls = good
    immediateHangupRate: 0.15, // 15% - Few hangups = good
    voicemailRate: 0.10,     // 10% - Lower VM rate = better
    failureRate: 0.10,       // 10% - Carrier errors are bad
  };

  // Thresholds for each metric (ideal values)
  private readonly IDEAL = {
    answerRate: 0.35,        // 35% answer rate is excellent
    avgDuration: 120,        // 2 minutes average is excellent
    shortCallRate: 0.10,     //  {
    // Get last 50 calls from metrics window
    const recentCalls = await db.select()
      .from(numberMetricsWindow)
      .where(eq(numberMetricsWindow.numberId, numberId))
      .orderBy(desc(numberMetricsWindow.calledAt))
      .limit(50);

    if (recentCalls.length = 1,
      previousScore,
    };
  }

  /**
   * Calculate component scores (0-100 each)
   */
  private calculateComponentScores(metrics: AggregatedMetrics): ComponentScores {
    // Answer rate: 0% = 0, IDEAL = 100
    const answerRateScore = Math.min(100, (metrics.answerRate / this.IDEAL.answerRate) * 100);
    
    // Duration: 0s = 0, IDEAL seconds = 100
    const durationScore = Math.min(100, (metrics.avgDurationSec / this.IDEAL.avgDuration) * 100);
    
    // Short call rate: inverted (lower is better)
    const shortCallScore = Math.max(0, 100 - (metrics.shortCallRate / this.IDEAL.shortCallRate) * 100);
    
    // Immediate hangup rate: inverted
    const hangupScore = Math.max(0, 100 - (metrics.immediateHangupRate / this.IDEAL.immediateHangupRate) * 100);
    
    // Voicemail rate: inverted
    const voicemailScore = Math.max(0, 100 - (metrics.voicemailRate / this.IDEAL.voicemailRate) * 100);
    
    // Failure rate: inverted
    const failureScore = Math.max(0, 100 - (metrics.failureRate / this.IDEAL.failureRate) * 100);

    return {
      answerRate: Math.round(answerRateScore),
      duration: Math.round(durationScore),
      shortCall: Math.round(shortCallScore),
      hangup: Math.round(hangupScore),
      voicemail: Math.round(voicemailScore),
      failure: Math.round(failureScore),
    };
  }

  /**
   * Calculate overall weighted score
   */
  private calculateOverallScore(components: ComponentScores): number {
    const weighted = 
      components.answerRate * this.WEIGHTS.answerRate +
      components.duration * this.WEIGHTS.avgDuration +
      components.shortCall * this.WEIGHTS.shortCallRate +
      components.hangup * this.WEIGHTS.immediateHangupRate +
      components.voicemail * this.WEIGHTS.voicemailRate +
      components.failure * this.WEIGHTS.failureRate;

    return Math.round(Math.max(0, Math.min(100, weighted)));
  }

  /**
   * Convert score to reputation band
   */
  private scoreToBand(score: number): NumberReputationBand {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'healthy';
    if (score >= 55) return 'warning';
    if (score >= 40) return 'risk';
    return 'burned';
  }

  /**
   * Check for automatic cooldown triggers
   */
  private async checkCooldownTriggers(
    numberId: string, 
    metrics: AggregatedMetrics,
    newScore: number,
    recentCalls: MetricsWindowRecord[]
  ): Promise {
    const cooldownService = new CooldownManager();
    
    // Trigger 1: 3 consecutive short calls
    const last3 = recentCalls.slice(0, 3);
    if (last3.length === 3 && last3.every(c => c.isShortCall)) {
      await cooldownService.triggerCooldown(numberId, {
        reason: 'consecutive_short_calls',
        durationHours: 24,
        details: { consecutiveShortCalls: 3 },
      });
      return;
    }

    // Trigger 2: 0% answer rate over last 10 calls
    const last10 = recentCalls.slice(0, 10);
    if (last10.length === 10 && last10.every(c => !c.answered)) {
      await cooldownService.triggerCooldown(numberId, {
        reason: 'zero_answer_rate',
        durationHours: 48,
        details: { zeroAnswersOver: 10 },
      });
      return;
    }

    // Trigger 3: Repeated failures (5+ in last 10)
    const failedLast10 = last10.filter(c => c.isFailed).length;
    if (failedLast10 >= 5) {
      await cooldownService.triggerCooldown(numberId, {
        reason: 'repeated_failures',
        durationHours: 72,
        details: { failuresIn10Calls: failedLast10 },
      });
      return;
    }

    // Trigger 4: Score dropped below 50
    if (newScore ;
  triggeredBy?: string;
}

export class CooldownManager {
  /**
   * Trigger cooldown for a number
   */
  async triggerCooldown(numberId: string, options: CooldownTriggerOptions): Promise {
    // Check if already in cooldown
    const existing = await this.getActiveCooldown(numberId);
    if (existing) {
      console.log(`[CooldownManager] Number ${numberId} already in cooldown, skipping`);
      return;
    }

    const endsAt = new Date(Date.now() + options.durationHours * 3600000);

    // Create cooldown record
    await db.insert(numberCooldowns).values({
      numberId,
      reason: options.reason,
      reasonDetails: options.details,
      endsAt,
      triggeredBy: options.triggeredBy || 'system',
      recoveryMaxCallsPerHour: this.getRecoveryLimit(options.reason, 'hour'),
      recoveryMaxCallsPerDay: this.getRecoveryLimit(options.reason, 'day'),
    });

    // Update number status
    await db.update(telnyxNumbers)
      .set({ 
        status: 'cooling',
        statusReason: options.reason,
        statusChangedAt: new Date(),
      })
      .where(eq(telnyxNumbers.id, numberId));

    // Log alert
    await this.logAlert({
      type: 'cooldown_triggered',
      numberId,
      reason: options.reason,
      endsAt,
      details: options.details,
    });

    console.log(`[CooldownManager] Cooldown triggered for ${numberId}: ${options.reason} until ${endsAt}`);
  }

  /**
   * End cooldown early (admin override)
   */
  async endCooldownEarly(numberId: string, cooldownId: string, userId: string): Promise {
    await db.update(numberCooldowns)
      .set({
        endedEarlyAt: new Date(),
        isActive: false,
      })
      .where(and(
        eq(numberCooldowns.id, cooldownId),
        eq(numberCooldowns.numberId, numberId)
      ));

    // Update number status back to active
    await db.update(telnyxNumbers)
      .set({
        status: 'active',
        statusReason: 'cooldown_ended_early',
        statusChangedAt: new Date(),
      })
      .where(eq(telnyxNumbers.id, numberId));

    console.log(`[CooldownManager] Cooldown ${cooldownId} ended early by ${userId}`);
  }

  /**
   * Process expired cooldowns (run via cron every minute)
   */
  async processExpiredCooldowns(): Promise {
    const now = new Date();
    
    const expired = await db.select()
      .from(numberCooldowns)
      .where(and(
        eq(numberCooldowns.isActive, true),
        lt(numberCooldowns.endsAt, now)
      ));

    for (const cooldown of expired) {
      await db.update(numberCooldowns)
        .set({ isActive: false })
        .where(eq(numberCooldowns.id, cooldown.id));

      // Set recovery limits on the number
      if (cooldown.recoveryMaxCallsPerHour || cooldown.recoveryMaxCallsPerDay) {
        await db.update(telnyxNumbers)
          .set({
            status: 'active',
            statusReason: 'cooldown_expired_in_recovery',
            statusChangedAt: new Date(),
            maxCallsPerHour: cooldown.recoveryMaxCallsPerHour,
            maxCallsPerDay: cooldown.recoveryMaxCallsPerDay,
          })
          .where(eq(telnyxNumbers.id, cooldown.numberId));
      } else {
        await db.update(telnyxNumbers)
          .set({
            status: 'active',
            statusReason: 'cooldown_expired',
            statusChangedAt: new Date(),
          })
          .where(eq(telnyxNumbers.id, cooldown.numberId));
      }

      console.log(`[CooldownManager] Cooldown expired for number ${cooldown.numberId}`);
    }

    return expired.length;
  }

  /**
   * Get recovery limits based on cooldown reason
   */
  private getRecoveryLimit(reason: CooldownReason, period: 'hour' | 'day'): number {
    const limits: Record = {
      'consecutive_short_calls': { hour: 10, day: 50 },
      'zero_answer_rate': { hour: 8, day: 40 },
      'repeated_failures': { hour: 5, day: 30 },
      'audio_quality_issues': { hour: 10, day: 50 },
      'reputation_threshold': { hour: 10, day: 50 },
      'manual_admin': { hour: 15, day: 80 },
      'carrier_block_suspected': { hour: 3, day: 20 },
    };

    return limits[reason]?.[period] ?? (period === 'hour' ? 10 : 50);
  }
}
```

### 5.5 Pacing Scheduler

```typescript
// File: server/services/number-pool/pacing-scheduler.ts

export interface PacingConfig {
  minDelayMs: number;
  maxDelayMs: number;
  businessHoursOnly: boolean;
  businessHoursStart: number; // 0-23
  businessHoursEnd: number;   // 0-23
  respectProspectTimezone: boolean;
}

export class PacingScheduler {
  private readonly DEFAULT_CONFIG: PacingConfig = {
    minDelayMs: 80_000,  // 80 seconds
    maxDelayMs: 160_000, // 160 seconds
    businessHoursOnly: true,
    businessHoursStart: 9,  // 9 AM
    businessHoursEnd: 17,   // 5 PM
    respectProspectTimezone: true,
  };

  /**
   * Calculate when to place a call
   */
  calculateCallTime(
    numberId: string,
    prospectTimezone: string | undefined,
    config: Partial = {}
  ): { delayMs: number; scheduledAt: Date; withinBusinessHours: boolean } {
    const cfg = { ...this.DEFAULT_CONFIG, ...config };
    
    // Base jitter
    let delayMs = cfg.minDelayMs + Math.random() * (cfg.maxDelayMs - cfg.minDelayMs);
    
    const now = new Date();
    let scheduledAt = new Date(now.getTime() + delayMs);
    
    // Business hours check
    if (cfg.businessHoursOnly) {
      const tz = cfg.respectProspectTimezone && prospectTimezone 
        ? prospectTimezone 
        : 'America/New_York';
      
      scheduledAt = this.adjustToBusinessHours(scheduledAt, tz, cfg);
      delayMs = scheduledAt.getTime() - now.getTime();
    }
    
    const withinBusinessHours = this.isWithinBusinessHours(
      scheduledAt,
      prospectTimezone || 'America/New_York',
      cfg
    );

    return { delayMs, scheduledAt, withinBusinessHours };
  }

  /**
   * Adjust time to fall within business hours
   */
  private adjustToBusinessHours(
    time: Date, 
    timezone: string, 
    config: PacingConfig
  ): Date {
    // Convert to prospect timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    
    const hour = parseInt(formatter.format(time));
    
    if (hour = config.businessHoursEnd) {
      // After business hours, delay to next day start
      const hoursUntilStart = (24 - hour) + config.businessHoursStart;
      return new Date(time.getTime() + hoursUntilStart * 3600000);
    }
    
    return time;
  }

  /**
   * Check prospect suppression rules
   */
  async checkProspectSuppression(prospectNumber: string): Promise {
    const suppression = await db.select()
      .from(prospectCallSuppression)
      .where(eq(prospectCallSuppression.prospectNumberE164, prospectNumber))
      .limit(1);

    if (!suppression.length) {
      return { suppressed: false };
    }

    const record = suppression[0];
    
    if (record.suppressUntil && record.suppressUntil > new Date()) {
      return {
        suppressed: true,
        reason: record.suppressReason || 'previous_attempt',
        retryAfter: record.suppressUntil,
      };
    }

    // Check 24h limit
    if (record.callAttempts24h >= 2) {
      return {
        suppressed: true,
        reason: 'max_daily_attempts',
        retryAfter: new Date(record.lastCalledAt.getTime() + 24 * 3600000),
      };
    }

    return { suppressed: false };
  }

  /**
   * Record call attempt for suppression tracking
   */
  async recordCallAttempt(
    prospectNumber: string,
    numberId: string,
    disposition: string
  ): Promise {
    const now = new Date();
    
    // Calculate suppression time based on disposition
    let suppressUntil: Date | null = null;
    let suppressReason: string | null = null;
    
    if (disposition === 'voicemail' || disposition === 'no_answer') {
      // Suppress for 7 days for VM/NA
      suppressUntil = new Date(now.getTime() + 7 * 24 * 3600000);
      suppressReason = disposition;
    } else if (disposition === 'busy') {
      // Retry after 4 hours for busy
      suppressUntil = new Date(now.getTime() + 4 * 3600000);
      suppressReason = 'busy';
    }

    await db.insert(prospectCallSuppression)
      .values({
        prospectNumberE164: prospectNumber,
        lastCalledAt: now,
        lastDisposition: disposition,
        lastNumberId: numberId,
        suppressUntil,
        suppressReason,
        callAttempts24h: 1,
        callAttempts7d: 1,
      })
      .onConflictDoUpdate({
        target: prospectCallSuppression.prospectNumberE164,
        set: {
          lastCalledAt: now,
          lastDisposition: disposition,
          lastNumberId: numberId,
          suppressUntil,
          suppressReason,
          callAttempts24h: sql`call_attempts_24h + 1`,
          callAttempts7d: sql`call_attempts_7d + 1`,
          updatedAt: now,
        },
      });
  }
}
```

---

## 6. Router Algorithm

### 6.1 Complete Algorithm Pseudocode

```
FUNCTION selectBestNumber(request: NumberSelectionRequest) -> NumberSelectionResult:

  INPUT:
    - campaignId: string
    - virtualAgentId: string | null
    - prospectNumber: string (E.164)
    - prospectRegion: string | null (state/province)
    - prospectTimezone: string | null (IANA)
    - excludeNumberIds: string[] (numbers to skip)
    
  OUTPUT:
    - numberId: string
    - numberE164: string
    - selectionReason: string
    - jitterDelayMs: number
    - decisionId: string (for audit)

  STEP 1: BUILD ELIGIBLE POOL
  ----------------------------
  pool = []
  
  # Get numbers with campaign assignment
  campaignNumbers = SELECT * FROM telnyx_numbers n
    JOIN number_assignments a ON n.id = a.number_id
    WHERE a.campaign_id = campaignId
      AND a.is_active = TRUE
      AND a.scope = 'campaign'
      
  pool.addAll(campaignNumbers)
  
  # Get numbers with agent assignment (if virtualAgentId provided)
  IF virtualAgentId:
    agentNumbers = SELECT * FROM telnyx_numbers n
      JOIN number_assignments a ON n.id = a.number_id
      WHERE a.virtual_agent_id = virtualAgentId
        AND a.is_active = TRUE
        AND a.scope = 'agent'
    pool.addAll(agentNumbers)
  
  # Get global pool numbers
  globalNumbers = SELECT * FROM telnyx_numbers n
    JOIN number_assignments a ON n.id = a.number_id
    WHERE a.scope = 'global'
      AND a.is_active = TRUE
      
  pool.addAll(globalNumbers)
  
  # Remove duplicates (prefer higher priority assignments)
  pool = deduplicateByPriority(pool)
  
  IF pool.isEmpty():
    THROW NoAvailableNumberError("No numbers in eligible pool")
    
  STEP 2: FILTER UNAVAILABLE NUMBERS
  -----------------------------------
  available = []
  filterReasons = {}
  
  FOR EACH number IN pool:
    
    # Check exclusion list
    IF number.id IN excludeNumberIds:
      filterReasons['excluded'] += 1
      CONTINUE
      
    # Check status
    IF number.status != 'active':
      filterReasons['not_active'] += 1
      CONTINUE
    
    # Check hourly cap
    IF number.calls_this_hour >= number.max_calls_per_hour:
      filterReasons['at_hourly_cap'] += 1
      CONTINUE
      
    # Check daily cap
    IF number.calls_today >= number.max_calls_per_day:
      filterReasons['at_daily_cap'] += 1
      CONTINUE
      
    # Check active cooldown
    cooldown = SELECT * FROM number_cooldowns
      WHERE number_id = number.id
        AND is_active = TRUE
        AND ends_at > NOW()
      LIMIT 1
      
    IF cooldown EXISTS:
      filterReasons['in_cooldown'] += 1
      CONTINUE
      
    # Check concurrent call (max 1 per DID)
    IF isNumberCurrentlyInUse(number.id):
      filterReasons['concurrent_in_use'] += 1
      CONTINUE
      
    # Check if we called this prospect from this number in last 24h
    recentCall = SELECT * FROM number_metrics_window
      WHERE number_id = number.id
        AND prospect_number_e164 = prospectNumber
        AND called_at > NOW() - INTERVAL '24 hours'
      LIMIT 1
      
    IF recentCall EXISTS:
      filterReasons['recently_called_prospect'] += 1
      CONTINUE
      
    available.add(number)
  
  IF available.isEmpty():
    LOG WARNING "All numbers filtered: " + filterReasons
    THROW NoAvailableNumberError("All numbers filtered")
    
  STEP 3: RANK CANDIDATES
  ------------------------
  prospectAreaCode = extractAreaCode(prospectNumber)
  ranked = []
  
  FOR EACH number IN available:
    score = 0
    reason = ""
    
    # Local match bonus (20 points)
    IF number.area_code == prospectAreaCode:
      score += 20
      reason = "local_match"
    
    # Region match bonus (10 points)
    IF prospectRegion AND number.region == prospectRegion:
      score += 10
      IF reason == "":
        reason = "region_match"
    
    # Reputation score (scaled 0-50 from 0-100)
    reputation = getReputation(number.id)
    repScore = (reputation.score OR 70) / 2
    score += repScore
    
    IF reason == "" AND repScore >= 40:
      reason = "highest_reputation"
    
    # Assignment priority bonus (5 points per priority level)
    score += number.assignment_priority * 5
    
    # Least recently used bonus (up to 10 points)
    IF number.last_call_at:
      hoursSinceUse = (NOW() - number.last_call_at) / 3600000
      score += MIN(10, hoursSinceUse)
    ELSE:
      score += 10  # Never used = full bonus
      
    # Lower short-call rate bonus (up to 10 points)
    IF reputation.total_calls > 0:
      shortCallRate = reputation.short_calls / reputation.total_calls
      score += (1 - shortCallRate) * 10
      
    ranked.add({
      ...number,
      rankScore: score,
      selectionReason: reason OR "pool_selection"
    })
  
  # Sort by rank score descending
  ranked.sortByDescending(r => r.rankScore)
  
  STEP 4: SELECT BEST + CALCULATE JITTER
  ---------------------------------------
  selected = ranked[0]
  
  # Base jitter: random 80-160 seconds
  jitter = RANDOM(80000, 160000)
  
  # Reputation-based jitter adjustment
  rep = getReputation(selected.id).score OR 70
  IF rep  NumberSelectionResult:
  TRY:
    RETURN selectBestNumber(request)
    
  CATCH NoAvailableNumberError:
    # Fallback 1: Try without region matching
    TRY:
      request.prospectRegion = null
      RETURN selectBestNumber(request)
    CATCH:
      PASS
      
    # Fallback 2: Use legacy single number (backward compatibility)
    legacyNumber = process.env.TELNYX_FROM_NUMBER
    IF legacyNumber:
      LOG WARNING "Using legacy fallback number: " + legacyNumber
      RETURN {
        numberId: null,
        numberE164: legacyNumber,
        selectionReason: "legacy_fallback",
        jitterDelayMs: 0,
        decisionId: null
      }
      
    # No fallback available
    THROW CallRoutingError("No numbers available and no fallback configured")
```

---

## 7. Reputation Scoring

### 7.1 Scoring Formula

```
REPUTATION_SCORE = 
  (answer_rate_score × 0.30) +
  (duration_score × 0.20) +
  (short_call_score × 0.15) +
  (hangup_score × 0.15) +
  (voicemail_score × 0.10) +
  (failure_score × 0.10)

WHERE:
  answer_rate_score = MIN(100, (answered_calls / total_calls) / 0.35 × 100)
  duration_score = MIN(100, avg_duration_sec / 120 × 100)
  short_call_score = MAX(0, 100 - (short_calls / total_calls) / 0.10 × 100)
  hangup_score = MAX(0, 100 - (immediate_hangups / total_calls) / 0.05 × 100)
  voicemail_score = MAX(0, 100 - (voicemail_calls / total_calls) / 0.25 × 100)
  failure_score = MAX(0, 100 - (failed_calls / total_calls) / 0.02 × 100)

BAND MAPPING:
  85-100 → 'excellent'
  70-84  → 'healthy'
  55-69  → 'warning'
  40-54  → 'risk'
  0-39   → 'burned'
```

### 7.2 Signal Weights Rationale

| Signal | Weight | Rationale |
|--------|--------|-----------|
| Answer Rate | 30% | Primary indicator of deliverability |
| Avg Duration | 20% | Longer calls = real conversations |
| Short Call Rate | 15% | High short calls = spam-like behavior |
| Immediate Hangup | 15% | Instant hangups = blocked/suspicious |
| Voicemail Rate | 10% | Natural but lower is better |
| Failure Rate | 10% | Carrier errors indicate issues |

---

## 8. Cooldown & Suppression

### 8.1 Cooldown Triggers

| Trigger | Threshold | Cooldown Duration | Recovery Limits |
|---------|-----------|-------------------|-----------------|
| Consecutive short calls | 3 in a row ( 15) {
    jitter *= 1.25;
  }
  
  return Math.floor(jitter);
}
```

### 9.3 Business Hours Logic

```typescript
function isWithinBusinessHours(
  time: Date, 
  timezone: string,
  config: { start: number; end: number }
): boolean {
  const hour = getHourInTimezone(time, timezone);
  const dayOfWeek = getDayOfWeekInTimezone(time, timezone);
  
  // Skip weekends
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  
  // Check hour range
  return hour >= config.start && hour  {
  describe('calculateOverallScore', () => {
    it('should return 70 for default metrics', () => {
      const metrics = createDefaultMetrics();
      const score = engine.calculateOverallScore(metrics);
      expect(score).toBe(70);
    });

    it('should return 100 for excellent metrics', () => {
      const metrics = createExcellentMetrics();
      const score = engine.calculateOverallScore(metrics);
      expect(score).toBeGreaterThanOrEqual(95);
    });

    it('should return  {
      const metrics = createBurnedMetrics();
      const score = engine.calculateOverallScore(metrics);
      expect(score).toBeLessThan(40);
    });
  });

  describe('checkCooldownTriggers', () => {
    it('should trigger cooldown for 3 consecutive short calls', async () => {
      const calls = [
        { isShortCall: true },
        { isShortCall: true },
        { isShortCall: true },
      ];
      await engine.checkCooldownTriggers(numberId, metrics, 60, calls);
      expect(mockCooldownManager.triggerCooldown).toHaveBeenCalledWith(
        numberId,
        expect.objectContaining({ reason: 'consecutive_short_calls' })
      );
    });
  });
});
```

### 12.2 Integration Tests

```typescript
// File: server/services/number-pool/__tests__/number-router.integration.test.ts

describe('NumberRouterService Integration', () => {
  beforeEach(async () => {
    await seedTestNumbers();
  });

  it('should select highest reputation number when no local match', async () => {
    const result = await router.selectNumber({
      campaignId: testCampaignId,
      prospectNumber: '+15551234567',
    });
    expect(result.selectionReason).toBe('highest_reputation');
  });

  it('should prefer local match over higher reputation', async () => {
    // Seed numbers with specific area codes
    await seedNumberWithAreaCode('555', 60); // Lower rep, local
    await seedNumberWithAreaCode('209', 90); // Higher rep, not local
    
    const result = await router.selectNumber({
      campaignId: testCampaignId,
      prospectNumber: '+15551234567',
    });
    expect(result.selectionReason).toBe('local_match');
  });

  it('should filter out numbers at hourly cap', async () => {
    await setNumberAtHourlyCap(testNumberId);
    
    const result = await router.selectNumber({
      campaignId: testCampaignId,
      prospectNumber: '+15551234567',
    });
    expect(result.numberId).not.toBe(testNumberId);
  });

  it('should fallback to legacy number when pool exhausted', async () => {
    await putAllNumbersInCooldown();
    
    const result = await router.selectNumber({
      campaignId: testCampaignId,
      prospectNumber: '+15551234567',
    });
    expect(result.selectionReason).toBe('legacy_fallback');
  });
});
```

### 12.3 Load Testing

```typescript
// File: scripts/load-test-number-router.ts

async function loadTestRouter() {
  const CONCURRENT_REQUESTS = 50;
  const TOTAL_REQUESTS = 500;
  
  const results = {
    success: 0,
    fallback: 0,
    failed: 0,
    avgLatencyMs: 0,
    p99LatencyMs: 0,
  };

  const latencies: number[] = [];

  for (let batch = 0; batch  {
  let selectedNumber: NumberSelectionResult | null = null;
  
  try {
    // Try number pool routing
    selectedNumber = await numberRouter.selectNumber({
      campaignId: request.campaignId,
      virtualAgentId: request.virtualAgentId,
      prospectNumber: request.toNumber,
      prospectRegion: request.prospectRegion,
    });
  } catch (error) {
    // Log routing failure
    console.error('[NumberPool] Routing failed:', error);
    await logRoutingFailure(request, error);
    
    // Use legacy fallback
    selectedNumber = {
      numberId: null,
      numberE164: process.env.TELNYX_FROM_NUMBER!,
      selectionReason: 'routing_failure_fallback',
      jitterDelayMs: 0,
      decisionId: null,
    };
  }

  // Continue with call placement
  return await placeCall({
    ...request,
    fromNumber: selectedNumber.numberE164,
    callerNumberId: selectedNumber.numberId,
    routingDecisionId: selectedNumber.decisionId,
  });
}
```

### 14.2 Webhook Retry Logic

```typescript
// File: server/services/number-pool/webhook-handler.ts

export async function handleCallWebhook(event: TelnyxWebhookEvent): Promise {
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s
  
  for (let attempt = 0; attempt  {
  await db.transaction(async (tx) => {
    // 1. Update number usage counters
    await tx.update(telnyxNumbers)
      .set({
        lastCallAt: new Date(),
        callsToday: sql`calls_today + 1`,
        callsThisHour: sql`calls_this_hour + 1`,
      })
      .where(eq(telnyxNumbers.id, numberId));

    // 2. Record in metrics window
    await tx.insert(numberMetricsWindow).values({
      numberId,
      callSessionId,
      calledAt: new Date(),
      answered: outcome.answered,
      durationSec: outcome.durationSec,
      disposition: outcome.disposition,
      isShortCall: outcome.durationSec  {
    console.error('[NumberPool] Reputation calculation failed:', err);
    // Non-blocking - reputation will be recalculated on next call
  });
}
```

---

## 15. Telnyx API Endpoints Used

### 15.1 Phone Numbers API

```
GET /v2/phone_numbers
  - List all purchased numbers
  - Used for sync

GET /v2/phone_numbers/{id}
  - Get number details
  - Used for metadata updates

PATCH /v2/phone_numbers/{id}
  - Update number settings
  - Used for CNAM updates
```

### 15.2 Call Control API

```
POST /v2/calls
  - Initiate outbound call
  - Uses selected DID as caller_id_number

POST /v2/calls/{call_control_id}/actions/hangup
  - End call
  - Used for cleanup

Webhooks:
  - call.initiated
  - call.answered
  - call.hangup
  - call.recording.saved
```

### 15.3 Recordings API

```
GET /v2/recordings
  - List recordings
  - Already integrated in telnyx-sync-service.ts

GET /v2/recordings/{id}
  - Get recording details
  - Used for call quality analysis
```

---

## Appendix A: Environment Variables

```bash
# Existing (unchanged)
TELNYX_API_KEY=your_api_key
TELNYX_FROM_NUMBER=+12094571966  # Legacy fallback

# New
TELNYX_NUMBER_POOL_ENABLED=true
TELNYX_NUMBER_POOL_SYNC_INTERVAL_MINUTES=60
TELNYX_NUMBER_POOL_DEFAULT_MAX_CALLS_PER_HOUR=20
TELNYX_NUMBER_POOL_DEFAULT_MAX_CALLS_PER_DAY=100
TELNYX_NUMBER_POOL_JITTER_MIN_MS=80000
TELNYX_NUMBER_POOL_JITTER_MAX_MS=160000
```

---

## Appendix B: Monitoring Queries

```sql
-- Numbers needing attention
SELECT n.phone_number_e164, r.score, r.band, n.status
FROM telnyx_numbers n
JOIN number_reputation r ON n.id = r.number_id
WHERE r.score  CURRENT_DATE
GROUP BY n.id
ORDER BY n.calls_today DESC;

-- Active cooldowns
SELECT 
  n.phone_number_e164,
  c.reason,
  c.started_at,
  c.ends_at,
  c.reason_details
FROM number_cooldowns c
JOIN telnyx_numbers n ON c.number_id = n.id
WHERE c.is_active = TRUE
ORDER BY c.ends_at ASC;
```

---

**Document Maintained By:** AI Systems Team  
**Last Updated:** February 2, 2026  
**Next Review:** After Phase 2 completion