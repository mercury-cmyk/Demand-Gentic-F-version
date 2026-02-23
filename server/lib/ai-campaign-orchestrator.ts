/**
 * AI Campaign Orchestrator
 * 
 * Automatically manages AI calling campaigns using BullMQ.
 * Maintains target concurrency for active ai_agent campaigns.
 * Survives server restarts via persistent Redis jobs.
 */

import { Queue, Worker, Job } from 'bullmq';
import { createQueue, createWorker, isQueueAvailable, getRedisConnection } from './queue';
import { storage } from '../storage';
import { getTelnyxAiBridge } from '../services/telnyx-ai-bridge';
import * as sipDialer from '../services/sip';
import { AiAgentSettings, CallContext } from '../services/ai-voice-agent';
import { isVoiceVariablePreflightError } from '../services/voice-variable-contract';
import { db } from '../db';
import { campaigns, campaignQueue, contacts, suppressionPhones, campaignSuppressionAccounts, campaignAgentAssignments, virtualAgents, dialerCallAttempts, dialerRuns, agentDefaults } from '@shared/schema';
import { telnyxNumbers } from '@shared/number-pool-schema';
import { eq, sql, inArray, and } from 'drizzle-orm';
import { checkSuppressionBulk } from './suppression.service';
import { getBestPhoneForContact } from './phone-utils';
import { toZonedTime, format } from 'date-fns-tz';
import { getDay, getHours } from 'date-fns';
import {
  isWithinBusinessHours as checkBusinessHours,
  detectContactTimezone,
  getBusinessHoursForCountry,
  getNextAvailableTime
} from '../utils/business-hours';
import {
  UK_COUNTRY_KEYS,
  US_COUNTRY_KEYS,
  normalizeCountryName,
  isUnitedStatesCountry,
  isUnitedKingdomCountry,
  isCountryEnabled,
  inferCountryFromPhone,
  getPhonePriority,
  phoneMatchesCountry,
  resolvePhoneForContact,
  COUNTRY_DIAL_PREFIX,
} from '../utils/country-utils';
import { getOrganizationById } from '../services/problem-intelligence/organization-service';
import { normalizeToE164, isValidE164 } from '../lib/phone-utils';
import { formatPhoneWithCountryCode } from '../lib/phone-formatter';
import {
  getCallerIdForCall,
  handleCallCompleted,
  releaseNumberWithoutOutcome,
  sleep as numberPoolSleep,
  type CallerIdResult
} from '../services/number-pool-integration';
import { isNumberPoolEnabled, getNumberPoolStatus, forceReleaseAllNumbers, releaseStaleNumbers } from '../services/number-pool';
import {
  acquireProspectLock,
  releaseProspectLock,
  isProspectBusy,
  cleanupStaleLocks,
} from '../services/active-call-tracker';

const ORCHESTRATOR_INTERVAL_MS = 10000; // Check every 10 seconds (increased frequency)
const ENV_DEFAULT_MAX_CONCURRENT_CALLS = parseInt(process.env.MAX_CONCURRENT_CALLS || '100', 10);
const ENV_GLOBAL_MAX_CONCURRENT_CALLS = parseInt(process.env.GLOBAL_MAX_CONCURRENT_CALLS || '100', 10);
const DELAY_BETWEEN_CALLS_MS = 500; // 500ms delay between call batches (prevents burst overload)
const PARALLEL_CALL_BATCH_SIZE = 10; // Smaller batches to avoid DB pool exhaustion
const STUCK_ITEM_TIMEOUT_MS = 180000; // 3 minutes - allows normal call lifecycle (~90s) + buffer; watchdog is the single recovery mechanism
const EMPTY_POOL_RECHECK_SECONDS = Math.max(15, Number(process.env.NUMBER_POOL_EMPTY_RECHECK_SECONDS || 60));
const EMPTY_POOL_RECHECK_MS = EMPTY_POOL_RECHECK_SECONDS * 1000;
const ACTIVE_POOL_CACHE_TTL_MS = 30000;
const ORCHESTRATOR_HEARTBEAT_MS = Math.max(30000, ORCHESTRATOR_INTERVAL_MS * 3);
const STRICT_US_ONLY_CAMPAIGN_NAME_DEFAULTS = ['RingCentral_AppointmentGen'];
const STRICT_US_ONLY_CAMPAIGN_NAMES = new Set<string>(
  [
    ...STRICT_US_ONLY_CAMPAIGN_NAME_DEFAULTS,
    ...(process.env.STRICT_US_ONLY_CAMPAIGN_NAMES || '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  ].map((name) => name.toLowerCase())
);
const STRICT_US_ONLY_CAMPAIGN_IDS = new Set<string>(
  (process.env.STRICT_US_ONLY_CAMPAIGN_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
);
// UK_COUNTRY_KEYS, US_COUNTRY_KEYS now imported from country-utils.ts

// Cached concurrency limits from DB (refreshed every 60s)
let _cachedDefaultMaxConcurrent = ENV_DEFAULT_MAX_CONCURRENT_CALLS;
let _cachedGlobalMaxConcurrent = ENV_GLOBAL_MAX_CONCURRENT_CALLS;
let _concurrencyLastFetched = 0;
const CONCURRENCY_CACHE_TTL_MS = 60000; // 1 minute
let _cachedHasActivePoolNumbers: boolean | null = null;
let _activePoolLastFetched = 0;
const campaignEmptyPoolBackoffUntil = new Map<string, number>();

async function getConcurrencyLimits(): Promise<{ defaultMax: number; globalMax: number }> {
  const now = Date.now();
  if (now - _concurrencyLastFetched < CONCURRENCY_CACHE_TTL_MS) {
    return { defaultMax: _cachedDefaultMaxConcurrent, globalMax: _cachedGlobalMaxConcurrent };
  }
  try {
    const [defaults] = await db.select({
      defaultMaxConcurrentCalls: agentDefaults.defaultMaxConcurrentCalls,
      globalMaxConcurrentCalls: agentDefaults.globalMaxConcurrentCalls,
    }).from(agentDefaults).limit(1);
    if (defaults) {
      _cachedDefaultMaxConcurrent = defaults.defaultMaxConcurrentCalls ?? ENV_DEFAULT_MAX_CONCURRENT_CALLS;
      _cachedGlobalMaxConcurrent = defaults.globalMaxConcurrentCalls ?? ENV_GLOBAL_MAX_CONCURRENT_CALLS;
    }
    _concurrencyLastFetched = now;
  } catch (e) {
    console.warn('[AI Orchestrator] Failed to load concurrency limits from DB, using env/cached values');
  }
  return { defaultMax: _cachedDefaultMaxConcurrent, globalMax: _cachedGlobalMaxConcurrent };
}

async function hasActivePoolNumbers(): Promise<boolean> {
  const now = Date.now();
  if (_cachedHasActivePoolNumbers !== null && now - _activePoolLastFetched < ACTIVE_POOL_CACHE_TTL_MS) {
    return _cachedHasActivePoolNumbers;
  }

  try {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(telnyxNumbers)
      .where(eq(telnyxNumbers.status, 'active'));

    _cachedHasActivePoolNumbers = (result?.count || 0) > 0;
    _activePoolLastFetched = now;
    return _cachedHasActivePoolNumbers;
  } catch (error) {
    console.warn('[AI Orchestrator] Failed to check active number pool size; assuming numbers are available');
    return true;
  }
}

// Legacy constants for backward compat (now dynamically loaded)
let DEFAULT_MAX_CONCURRENT_CALLS = ENV_DEFAULT_MAX_CONCURRENT_CALLS;
let GLOBAL_MAX_CONCURRENT_CALLS = ENV_GLOBAL_MAX_CONCURRENT_CALLS;

// Telnyx error codes that should pause the campaign (account-level issues)
const TELNYX_ACCOUNT_DISABLED_CODE = 10010; // "Account is disabled D17"
const TELNYX_FATAL_ERROR_CODES = [10010]; // Account-level policy/status errors

/**
 * Check if an error indicates a Telnyx account-level issue that requires pausing
 * Returns the error code and detail if it's a fatal error, null otherwise
 */
function isTelnyxFatalError(error: any): { code: number; detail: string; isWhitelist?: boolean; isRateLimit?: boolean } | null {
  if (!error || !error.message) return null;

  const message = String(error.message);

  // Check for our enriched error format from telnyx-ai-bridge.ts
  if (message.includes('Telnyx Whitelist Error:')) {
    const detail = message.replace('Telnyx Whitelist Error: ', '');
    const lowerDetail = detail.toLowerCase();
    const isRateLimit =
      lowerDetail.includes('rate limit exceeded') ||
      lowerDetail.includes('pricing rate') ||
      lowerDetail.includes(' d24');
    return { code: 10010, detail, isWhitelist: true, isRateLimit };
  }

  // Parse Telnyx API error format: "Telnyx API error: 403 - {"errors":[{"code":10010,"detail":"Account is disabled D17"}]}"
  const jsonMatch = message.match(/\{[\s\S]*"errors"[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const errorData = JSON.parse(jsonMatch[0]);
    if (errorData.errors && Array.isArray(errorData.errors)) {
      for (const err of errorData.errors) {
        if (err.code && TELNYX_FATAL_ERROR_CODES.includes(err.code)) {
          const isWhitelist = err.detail?.toLowerCase().includes('whitelist');
          const lowerDetail = String(err.detail || '').toLowerCase();
          const isRateLimit =
            lowerDetail.includes('rate limit exceeded') ||
            lowerDetail.includes('pricing rate') ||
            lowerDetail.includes(' d24');
          return { code: err.code, detail: err.detail || 'Unknown error', isWhitelist, isRateLimit };
        }
      }
    }
  } catch {
    // JSON parsing failed, not a structured Telnyx error
  }

  return null;
}

/**
 * Check if a contact is within their local business hours based on country and campaign config.
 * Timezone detection delegates to the shared detectContactTimezone() utility.
 * Debug logging removed from hot path — use structured metrics instead.
 */
function isContactWithinBusinessHours(
  contact: { country?: string | null; state?: string | null; timezone?: string | null },
  campaignBusinessHoursConfig?: any
): {
  canCall: boolean;
  timezone: string | null;
  localTime: string;
  reason?: string;
  nextCallableAt?: Date;
} {
  let contactTz = detectContactTimezone({ 
    country: contact.country || undefined, 
    state: contact.state || undefined,
    timezone: contact.timezone || undefined
  });
  
  // Fallback: infer timezone from country when detectContactTimezone couldn't map it
  if (!contactTz && contact.country) {
    const countryUpper = String(contact.country).toUpperCase().trim();
    if (isUnitedKingdomCountry(countryUpper)) {
      contactTz = 'Europe/London';
    } else if (isUnitedStatesCountry(countryUpper)) {
      contactTz = 'America/New_York';
    } else if (['CA', 'CANADA'].includes(countryUpper)) {
      contactTz = 'America/Toronto';
    }
  }
  
  if (!contactTz) {
    return {
      canCall: false,
      timezone: null,
      localTime: 'unknown',
      reason: `Unknown timezone (country: ${contact.country || 'not set'})`
    };
  }
  
  const now = new Date();

  // Use campaign-specific business hours config if available, otherwise country defaults
  let config: any;
  if (campaignBusinessHoursConfig && campaignBusinessHoursConfig.enabled) {
    config = {
      ...campaignBusinessHoursConfig,
      timezone: contactTz,
      respectContactTimezone: false,
    };
  } else {
    const countryConfig = getBusinessHoursForCountry(contact.country, now);
    config = {
      ...countryConfig,
      timezone: contactTz,
      respectContactTimezone: false,
    };
  }

  const canCall = checkBusinessHours(config, undefined, now);
  
  const zonedTime = toZonedTime(now, contactTz);
  const hour = getHours(zonedTime);
  const dayOfWeek = getDay(zonedTime);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const localTime = `${dayNames[dayOfWeek]} ${hour}:00`;
  
  let reason: string | undefined;
  let nextCallableAt: Date | undefined;
  if (!canCall) {
    const dayName = dayNames[dayOfWeek].toLowerCase();
    const isWorkingDay = config.operatingDays.includes(
      ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek]
    );

    if (!isWorkingDay) {
      reason = `Non-working day (${localTime} ${contactTz})`;
    } else {
      reason = `Outside hours (${localTime} ${contactTz}, hours: ${config.startTime}-${config.endTime})`;
    }

    try {
      nextCallableAt = getNextAvailableTime(config, undefined, now);
    } catch {
      nextCallableAt = new Date(now.getTime() + 30 * 60 * 1000);
    }
  }

  return { canCall, timezone: contactTz, localTime, reason, nextCallableAt };
}

// getPhonePriority, ENABLED_CALLING_REGIONS, normalizeCountryName,
// isUkSaturdayOneDayOverride, isUnitedStatesCountry, isCountryEnabled,
// inferCountryFromPhone, COUNTRY_DIAL_PREFIX, phoneMatchesCountry,
// resolvePhoneForContact — all imported from '../utils/country-utils'

function shouldEnforceStrictUsOnly(campaign: {
  id?: string | null;
  name?: string | null;
  aiAgentSettings?: unknown;
}): boolean {
  const campaignId = (campaign.id || '').trim();
  if (campaignId && STRICT_US_ONLY_CAMPAIGN_IDS.has(campaignId)) return true;

  const campaignName = (campaign.name || '').trim().toLowerCase();
  if (campaignName && STRICT_US_ONLY_CAMPAIGN_NAMES.has(campaignName)) return true;

  const aiSettings = campaign.aiAgentSettings && typeof campaign.aiAgentSettings === 'object'
    ? campaign.aiAgentSettings as Record<string, unknown>
    : null;

  if (!aiSettings) return false;

  const explicitFlagKeys = ['strictUsOnly', 'strictUSAOnly', 'usaOnly', 'usOnly'];
  for (const key of explicitFlagKeys) {
    if (aiSettings[key] === true) return true;
  }

  const geoAllowRaw = aiSettings.geoAllow;
  if (Array.isArray(geoAllowRaw) && geoAllowRaw.length > 0) {
    const geoAllow = geoAllowRaw
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);
    if (geoAllow.length > 0 && geoAllow.every((value) => isUnitedStatesCountry(value))) {
      return true;
    }
  }

  return false;
}

// isCountryEnabled, inferCountryFromPhone, COUNTRY_DIAL_PREFIX,
// phoneMatchesCountry, resolvePhoneForContact — all imported from '../utils/country-utils'

interface OrchestratorJobData {
  type: 'tick' | 'campaign-replenish';
  campaignId?: string;
}

interface OrchestratorJobResult {
  processed: boolean;
  callsInitiated?: number;
  message?: string;
}

interface ProcessCampaignOptions {
  maxNewCalls?: number;
}

let orchestratorQueue: Queue<OrchestratorJobData> | null = null;
let orchestratorWorker: Worker<OrchestratorJobData> | null = null;
let orchestratorHeartbeatTimer: NodeJS.Timeout | null = null;
let lastOrchestratorTickAt = 0;
let lastCampaignStartIndex = 0;
let orchestratorInitializing = false;

async function teardownAiCampaignOrchestrator(reason: string): Promise<void> {
  console.warn(`[AI Orchestrator] Tearing down orchestrator: ${reason}`);

  if (orchestratorHeartbeatTimer) {
    clearInterval(orchestratorHeartbeatTimer);
    orchestratorHeartbeatTimer = null;
  }

  const workerToClose = orchestratorWorker;
  const queueToClose = orchestratorQueue;
  orchestratorWorker = null;
  orchestratorQueue = null;
  lastOrchestratorTickAt = 0;

  if (workerToClose) {
    try {
      await workerToClose.close(true);
      console.log('[AI Orchestrator] Worker closed');
    } catch (err) {
      console.error('[AI Orchestrator] Failed to close worker during teardown:', err);
    }
  }

  if (queueToClose) {
    try {
      await queueToClose.close();
      console.log('[AI Orchestrator] Queue closed');
    } catch (err) {
      console.error('[AI Orchestrator] Failed to close queue during teardown:', err);
    }
  }
}

/**
 * Get the assigned virtual agent for a campaign
 * Returns the agent's name and ElevenLabs ID for use in calls
 */
async function getCampaignVirtualAgent(campaignId: string): Promise<{
  id: string;
  name: string;
  externalAgentId: string | null;
  provider: string;
} | null> {
  try {
    const result = await db
      .select({
        id: virtualAgents.id,
        name: virtualAgents.name,
        externalAgentId: virtualAgents.externalAgentId,
        provider: virtualAgents.provider,
      })
      .from(campaignAgentAssignments)
      .innerJoin(virtualAgents, eq(virtualAgents.id, campaignAgentAssignments.virtualAgentId))
      .where(
        and(
          eq(campaignAgentAssignments.campaignId, campaignId),
          eq(campaignAgentAssignments.agentType, 'ai'),
          eq(campaignAgentAssignments.isActive, true)
        )
      )
      .limit(1);
    
    return result[0] || null;
  } catch (error) {
    console.error(`[AI Orchestrator] Error fetching virtual agent for campaign ${campaignId}:`, error);
    return null;
  }
}

/**
 * Get count of in-progress calls for a campaign
 */
async function getInProgressCount(campaignId: string): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)::int` })
    .from(campaignQueue)
    .where(and(
      eq(campaignQueue.campaignId, campaignId),
      eq(campaignQueue.status, 'in_progress')
    ));
  return result[0]?.count || 0;
}

async function getGlobalInProgressCount(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)::int` })
    .from(campaignQueue)
    .where(eq(campaignQueue.status, 'in_progress'));
  return result[0]?.count || 0;
}

/**
 * STARTUP RESUME: Reset ALL in_progress items immediately on server start
 * This ensures campaigns can continue after a server restart/crash
 * Uses Redis lock to prevent race conditions during deployment scaling
 */
async function startupResumeStuckCalls(): Promise<void> {
  try {
    // Use Redis lock to ensure only ONE instance runs startup resume during scaling
    // This prevents race conditions where multiple instances try to update campaign state simultaneously
    const lockKey = 'orchestrator:startup-resume:lock';
    const lockValue = `instance-${Date.now()}-${Math.random()}`;
    const lockTTL = 30; // 30 seconds - enough time to complete reset

    // Try to acquire the lock (only succeeds if key doesn't exist)
    const redisClient = getRedisConnection();
    if (!redisClient) {
      console.warn('[AI Orchestrator] Redis not available for distributed lock - proceeding without lock (may cause race conditions during scaling)');
    } else {
      const lockAcquired = await redisClient.set(lockKey, lockValue, 'EX', lockTTL, 'NX');
      
      if (!lockAcquired) {
        console.log('[AI Orchestrator] STARTUP: Another instance is running startup resume - skipping to prevent race condition');
        return;
      }

      console.log('[AI Orchestrator] STARTUP: Acquired distributed lock for startup resume');
    }

    // Reset all in_progress items back to queued (server restart means all active calls are dead)
    const result = await db.execute(sql`
      UPDATE campaign_queue 
      SET status = 'queued', 
          next_attempt_at = NOW() + INTERVAL '5 seconds',
          enqueued_reason = COALESCE(enqueued_reason, '') || '|startup_reset:' || to_char(NOW(), 'HH24:MI:SS'),
          updated_at = NOW()
      WHERE status = 'in_progress'
      RETURNING id, campaign_id
    `);
    
    const resetCount = result.rows?.length || 0;
    if (resetCount > 0) {
      console.log(`[AI Orchestrator] STARTUP RESUME: Reset ${resetCount} in_progress items back to queued`);
      
      // Log affected campaigns
      const affectedCampaigns = new Set(result.rows?.map((r: any) => r.campaign_id).filter(Boolean));
      if (affectedCampaigns.size > 0) {
        console.log(`[AI Orchestrator] STARTUP RESUME: Affected campaigns: ${[...affectedCampaigns].join(', ')}`);
      }
    } else {
      console.log('[AI Orchestrator] STARTUP RESUME: No stuck in_progress items found');
    }

    // Log current campaign statuses for debugging
    const campaignStats = await db.execute(sql`
      SELECT c.id, c.name, c.status, c.dial_mode,
             COUNT(CASE WHEN q.status = 'queued' THEN 1 END) as queued_count,
             COUNT(CASE WHEN q.status = 'in_progress' THEN 1 END) as in_progress_count
      FROM campaigns c
      LEFT JOIN campaign_queue q ON q.campaign_id = c.id
      WHERE c.dial_mode = 'ai_agent'
      GROUP BY c.id, c.name, c.status, c.dial_mode
      ORDER BY c.status
    `);
    
    if (campaignStats.rows?.length) {
      console.log('[AI Orchestrator] STARTUP: AI Campaign Status Summary:');
      for (const row of campaignStats.rows as any[]) {
        console.log(`  - ${row.name}: ${row.status} (${row.queued_count || 0} queued, ${row.in_progress_count || 0} in-progress)`);
      }
    }
  } catch (error) {
    console.error('[AI Orchestrator] STARTUP RESUME error:', error);
  }
}

/**
 * WATCHDOG: Reset stuck in_progress items that haven't been updated for 5+ minutes
 * This self-heals when calls fail silently or webhooks never arrive
 *
 * IMPORTANT: The gemini-live-dialer now marks completed calls properly, so watchdog
 * should only catch truly stuck items (e.g., server crash during call, network failure)
 */
async function resetStuckItems(): Promise<number> {
  try {
    const cutoffTime = new Date(Date.now() - STUCK_ITEM_TIMEOUT_MS);

    // First, log stuck items for debugging (helps identify patterns)
    const stuckItems = await db.execute(sql`
      SELECT cq.id, cq.campaign_id, cq.contact_id, cq.updated_at, c.name as campaign_name
      FROM campaign_queue cq
      LEFT JOIN campaigns c ON c.id = cq.campaign_id
      WHERE cq.status = 'in_progress'
        AND cq.updated_at < ${cutoffTime}
      LIMIT 20
    `);

    if (stuckItems.rows && stuckItems.rows.length > 0) {
      console.log(`[AI Orchestrator] WATCHDOG: Found ${stuckItems.rows.length} stuck items (stale > ${STUCK_ITEM_TIMEOUT_MS / 60000}min):`);
      for (const row of stuckItems.rows as any[]) {
        const staleMinutes = Math.round((Date.now() - new Date(row.updated_at).getTime()) / 60000);
        console.log(`  - Queue ${row.id} (campaign: ${row.campaign_name}, stale: ${staleMinutes}min)`);
      }
    }

    // Find and reset stuck items - also return phone numbers for prospect lock cleanup
    const result = await db.execute(sql`
      UPDATE campaign_queue
      SET status = 'queued',
          next_attempt_at = NOW() + INTERVAL '30 seconds',
          enqueued_reason = COALESCE(enqueued_reason, '') || '|watchdog_reset:' || to_char(NOW(), 'HH24:MI:SS'),
          updated_at = NOW()
      WHERE status = 'in_progress'
        AND updated_at < ${cutoffTime}
      RETURNING id, campaign_id, dialed_number
    `);

    const resetCount = result.rows?.length || 0;
    if (resetCount > 0) {
      console.log(`[AI Orchestrator] WATCHDOG: Reset ${resetCount} stuck in_progress items`);

      // Release in-memory prospect locks for stuck items to prevent permanent blocking
      for (const row of result.rows as any[]) {
        if (row.dialed_number) {
          releaseProspectLock(row.dialed_number, 'watchdog_reset');
        }
      }

      // Log affected campaigns for monitoring
      const affectedCampaigns = new Set((result.rows as any[]).map(r => r.campaign_id).filter(Boolean));
      if (affectedCampaigns.size > 0) {
        console.log(`[AI Orchestrator] WATCHDOG: Affected campaigns: ${[...affectedCampaigns].join(', ')}`);
      }
    }

    return resetCount;
  } catch (error) {
    console.error('[AI Orchestrator] WATCHDOG error:', error);
    return 0;
  }
}

/**
 * Get queued items ready for calling (respects retry times)
 * Includes contact country/state for business hours checking
 * Excludes contacts already called today (Telnyx daily limit protection)
 * Uses contact_id match for reliable filtering even when phone numbers change
 * 
 * SIMPLIFIED: Let JavaScript handle ALL business hours logic - don't compute within_hours in SQL
 */
async function getQueuedItems(
  campaignId: string,
  limit: number,
  options?: { strictUsOnly?: boolean }
): Promise<any[]> {
  const strictUsOnly = options?.strictUsOnly === true;
  const strictUsOnlySql = strictUsOnly
    ? sql`
      -- STRICT USA-ONLY: only dial contacts with explicit US country metadata
      AND UPPER(TRIM(COALESCE(c.country, ''))) IN (
        'US', 'USA', 'AMERICA', 'UNITED STATES', 'UNITED STATES OF AMERICA',
        'U.S', 'U.S.', 'U.S.A', 'U.S.A.',
        'UNITEDF STATES', 'UNITED STATE', 'UNTED STATES', 'UNITD STATES', 'UNTIED STATES', 'UITED STATES'
      )
    `
    : sql``;

  // Fetch queue items with contact data - simplified to just get the DATA, not compute business hours in SQL
  // JavaScript will handle all business hours logic to ensure consistency
  // IMPORTANT: Also select raw phone fields (direct_phone, mobile_phone) and account main_phone
  // so we can normalize at runtime when E164 fields are NULL (common for imports with missing country)
  const result = await db.execute(sql`
    SELECT cq.*,
      c.direct_phone_e164,
      c.mobile_phone_e164,
      c.dialing_phone_e164,
      c.direct_phone as raw_direct_phone,
      c.mobile_phone as raw_mobile_phone,
      a.main_phone as raw_hq_phone,
      c.country,
      c.state,
      c.timezone,
      c.first_name as contact_first_name,
      c.last_name as contact_last_name,
      c.email as contact_email,
      c.job_title as contact_job_title,
      a.name as account_name,
      a.hq_country as account_country,
      -- Infer timezone from: explicit timezone > country > phone prefix (check both E164 and raw)
      -- 10-digit phones (NANP/US format stored without +1) are treated as US
      COALESCE(
        c.timezone,
        CASE
          WHEN UPPER(c.country) IN ('GB', 'UK', 'UNITED KINGDOM', 'UNITED KINGDOM UK', 'ENGLAND', 'SCOTLAND', 'WALES') THEN 'Europe/London'
          WHEN UPPER(c.country) IN ('US', 'USA', 'UNITED STATES', 'AMERICA', 'UNITED STATES OF AMERICA') THEN 'America/New_York'
          WHEN UPPER(c.country) IN ('CA', 'CANADA') THEN 'America/Toronto'
          WHEN c.mobile_phone_e164 LIKE '+44%' OR c.direct_phone_e164 LIKE '+44%' THEN 'Europe/London'
          WHEN c.mobile_phone_e164 LIKE '+1%' OR c.direct_phone_e164 LIKE '+1%' THEN 'America/New_York'
          -- Also check raw phone fields for +44/+1 prefix
          WHEN c.direct_phone LIKE '+44%' OR c.mobile_phone LIKE '+44%' THEN 'Europe/London'
          WHEN c.direct_phone LIKE '+1%' OR c.mobile_phone LIKE '+1%' THEN 'America/New_York'
          -- UK local numbers (0-prefixed, 11 digits)
          WHEN c.direct_phone ~ '^0[1-9][0-9]{9}$' OR c.mobile_phone ~ '^0[1-9][0-9]{9}$' THEN 'Europe/London'
          -- 10-digit NANP (US contacts stored without +1 country code)
          WHEN c.mobile_phone_e164 ~ '^[2-9][0-9]{9}$' OR c.direct_phone_e164 ~ '^[2-9][0-9]{9}$' THEN 'America/New_York'
          -- 11-digit US (1XXXXXXXXXX stored without +)
          WHEN c.mobile_phone_e164 ~ '^1[2-9][0-9]{9}$' OR c.direct_phone_e164 ~ '^1[2-9][0-9]{9}$' THEN 'America/New_York'
          ELSE NULL
        END
      ) as inferred_timezone,
      CASE
        -- UK mobile (highest priority) - check both E164 and raw fields
        WHEN c.mobile_phone_e164 LIKE '+447%' THEN 1
        WHEN c.direct_phone_e164 LIKE '+447%' THEN 2
        -- UK landline
        WHEN c.mobile_phone_e164 LIKE '+441%' OR c.mobile_phone_e164 LIKE '+442%' OR c.mobile_phone_e164 LIKE '+443%' THEN 3
        WHEN c.direct_phone_e164 LIKE '+441%' OR c.direct_phone_e164 LIKE '+442%' OR c.direct_phone_e164 LIKE '+443%' THEN 4
        -- USA/Canada (+1)
        WHEN c.mobile_phone_e164 LIKE '+1%' AND LENGTH(c.mobile_phone_e164) = 12 THEN 5
        WHEN c.direct_phone_e164 LIKE '+1%' AND LENGTH(c.direct_phone_e164) = 12 THEN 6
        -- Other countries with E164 phone numbers
        WHEN c.mobile_phone_e164 IS NOT NULL THEN 10
        WHEN c.direct_phone_e164 IS NOT NULL THEN 11
        -- Raw phone fields available (will be normalized at runtime)
        WHEN c.direct_phone IS NOT NULL AND c.direct_phone != '' THEN 20
        WHEN c.mobile_phone IS NOT NULL AND c.mobile_phone != '' THEN 21
        -- Account HQ phone as last resort
        WHEN a.main_phone IS NOT NULL AND a.main_phone != '' THEN 30
        ELSE 99
      END as phone_priority
    FROM campaign_queue cq
    LEFT JOIN contacts c ON c.id = cq.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE cq.campaign_id = ${campaignId}
      AND cq.status = 'queued'
      AND (cq.next_attempt_at IS NULL OR cq.next_attempt_at <= NOW())
      AND (
        c.direct_phone_e164 IS NOT NULL
        OR c.mobile_phone_e164 IS NOT NULL
        OR c.dialing_phone_e164 IS NOT NULL
        OR (c.direct_phone IS NOT NULL AND c.direct_phone != '')
        OR (c.mobile_phone IS NOT NULL AND c.mobile_phone != '')
        OR (a.main_phone IS NOT NULL AND a.main_phone != '')
      )
      ${strictUsOnlySql}
      -- Exclude contacts already called today (any agent type - prevents duplicate calls)
      -- Match by contact_id first (reliable), then by phone number (catches manual imports)
      AND NOT EXISTS (
        SELECT 1 FROM call_sessions cs
        WHERE cs.created_at >= CURRENT_DATE
          AND (
            cs.contact_id = cq.contact_id
            OR cs.to_number_e164 = c.direct_phone_e164
            OR cs.to_number_e164 = c.mobile_phone_e164
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM dialer_call_attempts dca
        WHERE dca.created_at >= CURRENT_DATE
          AND dca.contact_id = cq.contact_id
          AND dca.campaign_id = ${campaignId}
      )
    ORDER BY cq.ai_priority_score DESC NULLS LAST, phone_priority ASC, cq.priority DESC, cq.created_at ASC
    LIMIT ${limit * 10}
  `);
  
  // Normalize snake_case columns from raw SQL to camelCase for consistency
  // This prevents issues where code expects item.contactId but raw SQL returns contact_id
  return (result.rows as any[]).map(row => ({
    ...row,
    // Ensure both snake_case and camelCase are available
    contactId: row.contact_id || row.contactId,
    accountId: row.account_id || row.accountId,
    campaignId: row.campaign_id || row.campaignId,
    phoneNumber: row.phone_number || row.phoneNumber,
    queueItemId: row.id, // The queue item id
  }));
}

/**
 * Persist stall reason to the campaigns table so the UI can display why calls stopped.
 * Pass null to clear the stall reason when calls resume.
 */
async function setOrchestratorStallReason(campaignId: string, reason: string | null): Promise<void> {
  try {
    await db.update(campaigns)
      .set({
        lastStallReason: reason,
        lastStallReasonAt: reason ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));
  } catch (err) {
    console.error(`[AI Orchestrator] Failed to set stall reason for ${campaignId}:`, err);
  }
}

/**
 * Process a single campaign - initiate calls to maintain concurrency
 */
async function processCampaign(campaignId: string, options?: ProcessCampaignOptions): Promise<{ initiated: number; skipped: number; fatalError?: boolean; hourlyLimitPaused?: boolean }> {
  // Guard: in dev, calls blocked by default — must be enabled in Telephony settings. Production always allows calls.
  if (process.env.NODE_ENV !== 'production' && process.env.CALL_EXECUTION_ENABLED !== 'true') {
    console.log(`[AI Orchestrator] Dev call execution disabled for campaign ${campaignId}; skipping without mutating stall reason`);
    return { initiated: 0, skipped: 0 };
  }

  // Clear stale "call execution disabled" stall reason if execution is now allowed
  // (handles case where stall reason was set in dev and persists after deploying to production)
  const existingCampaign = await storage.getCampaign(campaignId);
  if (process.env.NODE_ENV === 'production' && existingCampaign?.lastStallReason?.includes('Call execution disabled')) {
    await setOrchestratorStallReason(campaignId, null);
  }

  const campaign = existingCampaign;
  if (!campaign) {
    console.log(`[AI Orchestrator] Campaign ${campaignId} not found`);
    return { initiated: 0, skipped: 0 };
  }

  console.log(`[DEBUG] Campaign loaded: businessHoursConfig=${JSON.stringify((campaign as any).businessHoursConfig)}`);

  // Check campaign is still active and in ai_agent mode
  if (campaign.status !== 'active' || campaign.dialMode !== 'ai_agent') {
    console.log(`[AI Orchestrator] Campaign ${campaignId} not active/ai_agent (status=${campaign.status}, mode=${campaign.dialMode})`);
    await setOrchestratorStallReason(campaignId, `Campaign is not active or not in AI agent mode (status: ${campaign.status}).`);
    return { initiated: 0, skipped: 0 };
  }

  // Note: Business hours are now checked per-contact based on their country/timezone
  // No global campaign-level check - we filter contacts individually below

  const aiSettings = campaign.aiAgentSettings as AiAgentSettings;
  if (!aiSettings) {
    console.log(`[AI Orchestrator] Campaign ${campaignId} has no AI settings`);
    await setOrchestratorStallReason(campaignId, 'No AI agent settings configured for this campaign.');
    return { initiated: 0, skipped: 0 };
  }
  const numberPoolConfig = campaign.numberPoolConfig as { enabled?: boolean; maxCallsPerNumber?: number; rotationStrategy?: string; cooldownHours?: number } | null;
  
  // Log Gemini-only mode and voice configuration
  const configuredVoice = aiSettings.persona?.voice || 'Puck';
  console.log(`[AI Orchestrator] 🎤 Gemini-only mode enabled for campaign ${campaignId}`);
  console.log(`[AI Orchestrator] 🔊 Voice: ${configuredVoice} (Gemini Live compatible)`);
  console.log(`[AI Orchestrator] 📡 Webhook: ${process.env.PUBLIC_WEBHOOK_HOST || 'not set'}`);

  // Fetch assigned virtual agent for this campaign
  const virtualAgent = await getCampaignVirtualAgent(campaignId);
  if (virtualAgent) {
    console.log(`[AI Orchestrator] Using virtual agent: ${virtualAgent.name} (${virtualAgent.externalAgentId || 'no external ID'})`);
  }

  // Fetch campaign organization for organization name
  // Priority: campaignOrg.name > aiSettings.persona.companyName > fallback
  let campaignOrganizationName: string | undefined;
  const campaignOrgId = (campaign as any).problemIntelligenceOrgId;
  if (campaignOrgId) {
    try {
      const campaignOrg = await getOrganizationById(campaignOrgId);
      if (campaignOrg) {
        campaignOrganizationName = campaignOrg.name;
        console.log(`[AI Orchestrator] Using organization: ${campaignOrganizationName} (${campaignOrgId})`);
      }
    } catch (err) {
      console.warn(`[AI Orchestrator] Failed to fetch organization ${campaignOrgId}:`, err);
    }
  }

  // Legacy fallback check - but we now use number pool rotation
  const legacyFromNumber = process.env.TELNYX_FROM_NUMBER;
  if (!legacyFromNumber && !process.env.TELNYX_NUMBER_POOL_ENABLED) {
    console.log(`[AI Orchestrator] No TELNYX_FROM_NUMBER configured and number pool not enabled`);
    await setOrchestratorStallReason(campaignId, 'No caller ID configured. Enable number pool or set TELNYX_FROM_NUMBER.');
    return { initiated: 0, skipped: 0 };
  }

  // Get current in-progress count (watchdog handles truly stuck items)
  const inProgressCount = await getInProgressCount(campaignId);
  const { defaultMax } = await getConcurrencyLimits();
  const maxConcurrent = (aiSettings as any).maxConcurrentCalls || defaultMax;
  const campaignSlots = Math.max(0, maxConcurrent - inProgressCount);
  const requestedSlots = typeof options?.maxNewCalls === 'number'
    ? Math.max(0, Math.floor(options.maxNewCalls))
    : campaignSlots;
  const slotsAvailable = Math.min(campaignSlots, requestedSlots);
  const strictUsOnly = shouldEnforceStrictUsOnly(campaign as any);

  if (strictUsOnly) {
    console.log(`[AI Orchestrator] Strict USA-only queue filter enabled for campaign ${campaign.name} (${campaignId})`);
  }

  console.log(`[AI Orchestrator] Campaign ${campaignId}: ${inProgressCount}/${maxConcurrent} in progress, ${campaignSlots} campaign slots, ${slotsAvailable} allowed by request`);

  if (slotsAvailable <= 0) {
    return { initiated: 0, skipped: 0 };
  }

  // Proactive invalid record scan: remove queued items with no valid phone BEFORE pulling candidates
  // This prevents invalid records from occupying queue slots or causing call-time failures
  try {
    const invalidScanResult = await storage.bulkRemoveInvalidItems(campaignId, 'invalid_phone_proactive');
    if (invalidScanResult.removed > 0) {
      console.log(`[AI Orchestrator] Proactive scan: removed ${invalidScanResult.removed} invalid (no-phone) records from campaign ${campaignId}`);
    }
  } catch (err) {
    console.warn(`[AI Orchestrator] Proactive invalid scan failed (non-blocking):`, err);
  }

  // Get queued items
  const queueItems = await getQueuedItems(campaignId, slotsAvailable, { strictUsOnly });
  console.log(`[AI Orchestrator] Found ${queueItems.length} queued items for campaign ${campaignId}`);
  
  // DEBUG: Log first few items to see what data we're working with
  if (queueItems.length > 0) {
    console.log(`[AI Orchestrator] Sample queue items (first 3):`);
    for (let i = 0; i < Math.min(3, queueItems.length); i++) {
      const item = queueItems[i];
      console.log(`  [${i}] country="${item.country}" timezone="${item.timezone}" inferred_tz="${item.inferred_timezone}" mobile="${item.mobile_phone_e164}" direct="${item.direct_phone_e164}" rawDirect="${item.raw_direct_phone}" rawMobile="${item.raw_mobile_phone}" hq="${item.raw_hq_phone}"`);
    }
  }
  
  if (queueItems.length === 0) {
    await setOrchestratorStallReason(campaignId, 'No contacts remaining in the queue.');
    return { initiated: 0, skipped: 0 };
  }

  // Fast-fail when pool routing is enabled but there are no active numbers.
  // This avoids per-item requeue loops and noisy "No numbers in eligible pool" logs.
  const poolRoutingEnabledForCampaign = isNumberPoolEnabled() && (numberPoolConfig?.enabled ?? true);
  if (poolRoutingEnabledForCampaign) {
    const retryAt = campaignEmptyPoolBackoffUntil.get(campaignId) || 0;
    if (retryAt > Date.now()) {
      const waitSeconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
      await setOrchestratorStallReason(campaignId, `Number pool has no active numbers. Rechecking in ${waitSeconds}s.`);
      return { initiated: 0, skipped: 0 };
    }

    const hasActiveNumbers = await hasActivePoolNumbers();
    if (!hasActiveNumbers) {
      campaignEmptyPoolBackoffUntil.set(campaignId, Date.now() + EMPTY_POOL_RECHECK_MS);
      console.warn(
        `[AI Orchestrator] Number pool is empty - delaying campaign ${campaignId} for ${EMPTY_POOL_RECHECK_SECONDS}s before retry`
      );
      await setOrchestratorStallReason(
        campaignId,
        `Number pool has no active numbers. Rechecking in ${EMPTY_POOL_RECHECK_SECONDS}s.`
      );
      return { initiated: 0, skipped: 0 };
    }

    campaignEmptyPoolBackoffUntil.delete(campaignId);
  } else {
    campaignEmptyPoolBackoffUntil.delete(campaignId);
  }

  // === COMPLIANCE CHECKS (same as batch-start) ===
  
  // 1. Get contact IDs for suppression check
  const contactIds = queueItems
    .filter(item => item.contactId)
    .map(item => item.contactId);

  // 2. Bulk suppression check
  const suppressionResults = contactIds.length > 0
    ? await checkSuppressionBulk(contactIds)
    : new Map<string, string | null>();

  // 3. Phone DNC check
  const uniquePhones = new Set<string>();
  for (const item of queueItems) {
    const phone = item.phone || item.phoneNumber;
    if (phone) {
      const normalized = phone.replace(/[^\d+]/g, '');
      const e164 = normalized.startsWith('+') ? normalized : '+' + normalized.replace(/^0+/, '');
      uniquePhones.add(e164);
    }
  }

  const dncPhones = new Set<string>();
  if (uniquePhones.size > 0) {
    const phonesArray = Array.from(uniquePhones);
    const batchSize = 500;
    for (let i = 0; i < phonesArray.length; i += batchSize) {
      const batch = phonesArray.slice(i, i + batchSize);
      const suppressedPhones = await db.select({ phoneE164: suppressionPhones.phoneE164 })
        .from(suppressionPhones)
        .where(inArray(suppressionPhones.phoneE164, batch));
      for (const row of suppressedPhones) {
        dncPhones.add(row.phoneE164);
      }
    }
  }

  // 4. Account suppression check
  const suppressedAccountIds = new Set<string>();
  const accountIds = [...new Set(queueItems.filter(item => item.accountId).map(item => item.accountId))];
  if (accountIds.length > 0) {
    const suppressedAccounts = await db.select({ accountId: campaignSuppressionAccounts.accountId })
      .from(campaignSuppressionAccounts)
      .where(and(
        eq(campaignSuppressionAccounts.campaignId, campaignId),
        inArray(campaignSuppressionAccounts.accountId, accountIds)
      ));
    for (const row of suppressedAccounts) {
      suppressedAccountIds.add(row.accountId);
    }
  }

  // Filter eligible items - check business hours per contact based on country
  const eligibleItems: any[] = [];
  let skipped = 0;
  let noPhone = 0;
  let outsideBusinessHours = 0;
  let countryNotEnabled = 0;

  // Build prioritized list with phone priority scores
  const candidateItems: Array<{ item: any; phone: string; priority: number; contact: any }> = [];

  // Collect out-of-hours queue items for batch next_attempt_at update
  // This prevents them from clogging the queue on subsequent ticks
  const outsideHoursUpdates: Array<{ queueItemId: string; nextCallableAt: Date }> = [];

  // Track timezone stats for logging
  const timezoneStats = new Map<string, { total: number; callable: number }>();

  // Track rejected countries for debugging
  const rejectedCountries = new Map<string, number>();

  for (const item of queueItems) {
    let contact: any = null;
    let phone: string | null = null;
    let priority = 0;
    
    // Queue items now include phone and country data from the JOIN query
    // Also includes raw phone fields for runtime normalization when E164 is NULL
    const country = (item as any).country;
    const state = (item as any).state;
    const timezone = (item as any).timezone;
    const inferredTimezone = (item as any).inferred_timezone;
    const rawDirectPhone = (item as any).raw_direct_phone;
    const rawMobilePhone = (item as any).raw_mobile_phone;
    const rawHqPhone = (item as any).raw_hq_phone;
    const accountCountry = (item as any).account_country;

    // Resolve E164 phones: prefer pre-normalized, then normalize raw fields at runtime
    let mobilePhone = (item as any).mobile_phone_e164 || null;
    let directPhone = (item as any).direct_phone_e164 || null;
    const dialingPhone = (item as any).dialing_phone_e164 || null;

    // Runtime normalization for contacts whose E164 was NULL at import time
    // Uses country-aware formatter first, then heuristic fallback (handles UK 0-prefix, US 10-digit etc.)
    if (!directPhone && rawDirectPhone) {
      const normalized = formatPhoneWithCountryCode(rawDirectPhone, country) || normalizeToE164(rawDirectPhone);
      if (normalized && isValidE164(normalized)) {
        directPhone = normalized;
      }
    }
    if (!mobilePhone && rawMobilePhone) {
      const normalized = formatPhoneWithCountryCode(rawMobilePhone, country) || normalizeToE164(rawMobilePhone);
      if (normalized && isValidE164(normalized)) {
        mobilePhone = normalized;
      }
    }
    // HQ/company phone as last resort (use account country for formatting)
    let hqPhone: string | null = null;
    if (!directPhone && !mobilePhone && rawHqPhone) {
      const normalized = formatPhoneWithCountryCode(rawHqPhone, accountCountry || country) || normalizeToE164(rawHqPhone);
      if (normalized && isValidE164(normalized)) {
        hqPhone = normalized;
      }
    }
    // Also try dialing_phone_e164 if no other phone resolved
    if (!directPhone && !mobilePhone && !hqPhone && dialingPhone && isValidE164(dialingPhone)) {
      directPhone = dialingPhone;
    }

    const geoPhone = mobilePhone || directPhone || hqPhone;
    const normalizedCountry = typeof country === 'string' ? country.trim() : country;
    const inferredCountry = inferCountryFromPhone(geoPhone);

    // Be resilient to bad/missing country metadata:
    // if stored country is missing or not enabled, trust phone-derived country when possible.
    // For strict USA-only campaigns, do not infer country from phone to avoid CA/+1 bleed-through.
    let effectiveCountry: string | null = (normalizedCountry as string) || null;
    if (!strictUsOnly) {
      if (!effectiveCountry && inferredCountry) {
        effectiveCountry = inferredCountry;
      } else if (effectiveCountry && !isCountryEnabled(effectiveCountry) && inferredCountry && isCountryEnabled(inferredCountry)) {
        effectiveCountry = inferredCountry;
      }
    }

    if (strictUsOnly && !isUnitedStatesCountry(effectiveCountry)) {
      countryNotEnabled++;
      const countryKey = effectiveCountry ? String(effectiveCountry).toUpperCase() : 'NULL/EMPTY';
      rejectedCountries.set(countryKey, (rejectedCountries.get(countryKey) || 0) + 1);

      // Defer for 24h so non-US contacts don't clog the queue
      if (item.id) {
        outsideHoursUpdates.push({
          queueItemId: item.id,
          nextCallableAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
      }

      if (countryNotEnabled <= 3) {
        console.log(`[AI Orchestrator] ❌ Contact ${item.contact_id} rejected by strict USA-only filter: country='${country}'`);
      }
      continue;
    }

    // Prefer explicit timezone, then SQL inferred timezone, then derive from best-known geo data.
    let effectiveTimezone: string | null = (typeof timezone === 'string' && timezone.trim())
      ? timezone.trim()
      : ((typeof inferredTimezone === 'string' && inferredTimezone.trim()) ? inferredTimezone.trim() : null);
    if (!effectiveTimezone) {
      effectiveTimezone = detectContactTimezone({
        country: effectiveCountry,
        state: state || undefined,
      });
    }

    // If country resolves to US but the timezone is clearly non-US (e.g. Asia/*, Europe/*, Australia/*),
    // override with a safe US default. This corrects contacts imported with wrong timezone metadata.
    if (effectiveCountry) {
      const normalizedEffectiveCountry = effectiveCountry.toUpperCase().trim();
      const isUsCountry = ['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA', 'AMERICA'].includes(normalizedEffectiveCountry);
      if (isUsCountry && effectiveTimezone && !effectiveTimezone.startsWith('America/') && !effectiveTimezone.startsWith('US/')) {
        console.log(`[AI Orchestrator] ⚠️ Contact ${item.contact_id} has US country but non-US timezone '${effectiveTimezone}' — overriding to America/New_York`);
        effectiveTimezone = 'America/New_York';
      }
    }

    // Check if country is in enabled calling regions
    if (!isCountryEnabled(effectiveCountry)) {
      countryNotEnabled++;
      // Track which countries are being rejected
      const countryKey = effectiveCountry ? String(effectiveCountry).toUpperCase() : 'NULL/EMPTY';
      rejectedCountries.set(countryKey, (rejectedCountries.get(countryKey) || 0) + 1);

      // Defer for 24h so they don't clog the queue (country data may be corrected via re-import)
      if (item.id) {
        outsideHoursUpdates.push({
          queueItemId: item.id,
          nextCallableAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
      }

      // DEBUG: Log first few country rejections
      if (countryNotEnabled <= 3) {
        console.log(`[AI Orchestrator] ❌ Contact ${item.contact_id} rejected: country='${country}' normaliz='${normalizedCountry}' inferred='${inferredCountry}' phone='${geoPhone}'`);
      }
      continue; // Skip contacts from disabled regions
    }
    
    // Check business hours for this contact's timezone/country FIRST
    // Use stored timezone if available, fall back to country/state detection
    // Pass campaign's business hours config to use instead of country defaults
    const bizHoursCheck = isContactWithinBusinessHours(
      {
        country: effectiveCountry,
        state,
        timezone: effectiveTimezone,
      },
      campaign.businessHoursConfig // Pass campaign config if available
    );
    const tzKey = bizHoursCheck.timezone || 'unknown';
    
    // Track timezone stats
    if (!timezoneStats.has(tzKey)) {
      timezoneStats.set(tzKey, { total: 0, callable: 0 });
    }
    const tzStat = timezoneStats.get(tzKey)!;
    tzStat.total++;
    
    if (!bizHoursCheck.canCall) {
      outsideBusinessHours++;
      // Schedule retry at next business hours window so these contacts don't clog the queue
      // The queue query filters: AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
      if (bizHoursCheck.nextCallableAt && item.id) {
        outsideHoursUpdates.push({
          queueItemId: item.id,
          nextCallableAt: bizHoursCheck.nextCallableAt,
        });
      }
      // Log reason for first few skips of each timezone
      if (tzStat.total <= 5) {
        console.log(`[AI Orchestrator] ⏰ Contact ${item.contact_id} outside hours: ${bizHoursCheck.reason} (next callable: ${bizHoursCheck.nextCallableAt?.toISOString() || 'unknown'})`);
      }
      continue;
    }
    
    // DEBUG: Log UK contacts passing business hours check
    if (bizHoursCheck.timezone === 'Europe/London' && tzStat.total <= 5) {
      console.log(`[AI Orchestrator] ✅ UK contact within business hours (${bizHoursCheck.localTime})`);
    }
    
    tzStat.callable++;
    
    // Country-aware phone resolution: mobile > direct > HQ, validated against contact country
    const resolved = resolvePhoneForContact(mobilePhone, directPhone, hqPhone, effectiveCountry);
    if (resolved) {
      phone = resolved.phone;
      priority = resolved.priority;
    }

    // Skip contacts without valid phone numbers
    if (!phone) {
      noPhone++;
      // Defer for 24h — phone data won't change until a re-import
      if (item.id) {
        outsideHoursUpdates.push({
          queueItemId: item.id,
          nextCallableAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
      }
      if (noPhone <= 2) {
        console.log(`[AI Orchestrator] 📵 Contact ${item.contact_id} has no phone (mobile="${mobilePhone}" direct="${directPhone}" hq="${hqPhone}" rawDirect="${rawDirectPhone}" rawMobile="${rawMobilePhone}" rawHq="${rawHqPhone}")`);
      }
      continue;
    }

    // Normalize phone using contact's country for correct country code
    let e164 = formatPhoneWithCountryCode(phone, country) || normalizeToE164(phone);

    // Fix US/Canada numbers: if it's +X where X is 10 digits starting with 2-9, add the 1
    // NANP format: +1 followed by 10 digits (area code starts with 2-9)
    if (e164.match(/^\+[2-9]\d{9}$/)) {
      e164 = '+1' + e164.substring(1);
    }

    // Check suppression
    if (item.contactId && suppressionResults.get(item.contactId)) {
      await db.execute(sql`UPDATE campaign_queue SET status = 'removed', removed_reason = 'suppressed', updated_at = NOW() WHERE id = ${item.id}`);
      skipped++;
      if (skipped <= 2) {
        console.log(`[AI Orchestrator] 🚫 Contact ${item.contact_id} suppressed`);
      }
      continue;
    }

    // Check DNC
    if (dncPhones.has(e164)) {
      await db.execute(sql`UPDATE campaign_queue SET status = 'removed', removed_reason = 'dnc', updated_at = NOW() WHERE id = ${item.id}`);
      skipped++;
      if (skipped <= 2) {
        console.log(`[AI Orchestrator] 📵 Contact ${item.contact_id} on DNC (phone: ${e164})`);
      }
      continue;
    }

    // Check account suppression
    if (item.accountId && suppressedAccountIds.has(item.accountId)) {
      await db.execute(sql`UPDATE campaign_queue SET status = 'removed', removed_reason = 'account_suppressed', updated_at = NOW() WHERE id = ${item.id}`);
      skipped++;
      if (skipped <= 2) {
        console.log(`[AI Orchestrator] 🏢 Account ${item.accountId} suppressed`);
      }
      continue;
    }

    // Add to candidates with priority and country info
    candidateItems.push({ item: { ...item, _country: effectiveCountry, _timezone: tzKey }, phone: e164, priority, contact });
  }
  
  // Sort by priority: UK mobile (1) first, then UK landline (2), then other phones
  candidateItems.sort((a, b) => a.priority - b.priority);

  // Take up to slotsAvailable items
  for (const candidate of candidateItems) {
    if (eligibleItems.length >= slotsAvailable) break;

    candidate.item._resolvedPhone = candidate.phone;
    candidate.item._resolvedContact = candidate.contact;
    eligibleItems.push(candidate.item);
  }

  // CRITICAL: Batch-update next_attempt_at for out-of-hours contacts
  // This prevents them from clogging the queue on subsequent ticks.
  // Without this, the same out-of-hours contacts consume LIMIT slots every 10s
  // and starve the callable contacts further down the queue.
  if (outsideHoursUpdates.length > 0) {
    try {
      // Group by next_callable_at (rounded to nearest 5min) for efficient batch updates
      const updateGroups = new Map<string, string[]>();
      for (const update of outsideHoursUpdates) {
        // Round to nearest 5 minutes to batch similar times together
        const rounded = new Date(Math.ceil(update.nextCallableAt.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000));
        const key = rounded.toISOString();
        if (!updateGroups.has(key)) updateGroups.set(key, []);
        updateGroups.get(key)!.push(update.queueItemId);
      }

      for (const [nextTimeISO, ids] of updateGroups) {
        if (ids.length > 0) {
          await db.execute(sql`
            UPDATE campaign_queue
            SET next_attempt_at = ${new Date(nextTimeISO)},
                updated_at = NOW()
            WHERE id = ANY(${ids})
              AND status = 'queued'
          `);
        }
      }
      console.log(`[AI Orchestrator] 📅 Deferred ${outsideHoursUpdates.length} out-of-hours contacts (set next_attempt_at to their business hours)`);
    } catch (err) {
      console.error(`[AI Orchestrator] Failed to batch-update next_attempt_at for out-of-hours contacts:`, err);
    }
  }

  // Log business hours filtering by timezone
  if (countryNotEnabled > 0) {
    console.log(`[AI Orchestrator] Region filter: ${countryNotEnabled} contacts skipped (country NULL or not in enabled regions)`);
    // Log top 5 rejected countries for debugging
    const topRejected = Array.from(rejectedCountries.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([c, n]) => `${c}(${n})`)
      .join(', ');
    console.log(`[AI Orchestrator]   Top rejected: ${topRejected}`);
  }
  console.log(`[AI Orchestrator] Business hours check: ${outsideBusinessHours} contacts skipped (outside their local business hours)`);
  for (const [tz, stats] of timezoneStats.entries()) {
    if (stats.total > 0) {
      console.log(`[AI Orchestrator]   ${tz}: ${stats.callable}/${stats.total} callable`);
    }
  }
  
  console.log(`[AI Orchestrator] Phone filtering: ${candidateItems.length} with valid phones, ${noPhone} skipped (no phone)`);
  const ukMobileCount = candidateItems.filter(c => c.priority === 1).length;
  const ukLandlineCount = candidateItems.filter(c => c.priority === 2).length;
  console.log(`[AI Orchestrator] UK breakdown: ${ukMobileCount} mobile (+447), ${ukLandlineCount} landline (+441/2/3)`);

  console.log(`[AI Orchestrator] After compliance: ${eligibleItems.length} eligible, ${skipped} removed`);
  
  if (eligibleItems.length === 0) {
    // Build detailed stall reason with full breakdown
    let stallReason = 'All contacts filtered from ';
    const startCount = countryNotEnabled + outsideBusinessHours + noPhone + skipped + (candidateItems.length - eligibleItems.length);
    stallReason += `${queueItems.length} items: `;
    const reasons: string[] = [];
    
    if (countryNotEnabled > 0) {
      const topRejected = Array.from(rejectedCountries.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([c, n]) => `${c}(${n})`)
        .join(', ');
      reasons.push(`${countryNotEnabled} region-disabled (${topRejected})`);
    }
    
    if (outsideBusinessHours > 0) {
      const tzBreakdown = Array.from(timezoneStats.entries())
        .filter(([_, stats]) => stats.total > 0)
        .map(([tz, stats]) => `${tz}:${stats.callable}/${stats.total}`)
        .slice(0, 5)
        .join(', ');
      reasons.push(`${outsideBusinessHours} outside hours (${tzBreakdown})`);
    }
    
    if (noPhone > 0) {
      reasons.push(`${noPhone} no-phone`);
    }
    
    if (skipped > 0) {
      reasons.push(`${skipped} compliance-removed`);
    }
    
    stallReason += reasons.length > 0 ? reasons.join(' + ') : 'unknown reason';
    stallReason += '. Calls will resume automatically.';
    
    await setOrchestratorStallReason(campaignId, stallReason);
    return { initiated: 0, skipped };
  }

  // Initiate calls in parallel batches
  // Use SIP dialer if enabled AND initialized, otherwise fall back to Telnyx API bridge
  // FORCE_DISABLE_SIP: User requested complete removal of SIP from AI calls
  const useSip = false; // sipDialer.isReady();
  const bridge = getTelnyxAiBridge();

  if (useSip) {
    console.log(`[AI Orchestrator] Using SIP-based calling for campaign ${campaignId}`);
  }

  let initiated = 0;

  // Create or reuse a dialer run for this orchestration batch
  // This ensures all calls have proper tracking in dialerCallAttempts
  let dialerRunId: string | null = null;
  try {
    // Check if there's an active run for this campaign/agent combination
    // Use proper NULL comparison for virtualAgentId
    const virtualAgentIdValue = virtualAgent?.id || null;
    const existingRuns = await db
      .select()
      .from(dialerRuns)
      .where(and(
        eq(dialerRuns.campaignId, campaignId),
        eq(dialerRuns.status, 'active'),
        virtualAgentIdValue 
          ? eq(dialerRuns.virtualAgentId, virtualAgentIdValue)
          : sql`${dialerRuns.virtualAgentId} IS NULL`
      ))
      .limit(1);

    if (existingRuns.length > 0) {
      dialerRunId = existingRuns[0].id;
    } else {
      // Create a new dialer run
      const [newRun] = await db
        .insert(dialerRuns)
        .values({
          campaignId,
          runType: 'power_dial',
          agentType: 'ai',
          virtualAgentId: virtualAgentIdValue,
          status: 'active',
          maxConcurrentCalls: maxConcurrent,
          startedAt: new Date(),
        })
        .returning();
      dialerRunId = newRun.id;
      console.log(`[AI Orchestrator] Created new dialer run ${dialerRunId} for campaign ${campaignId}`);
    }
  } catch (error) {
    console.error(`[AI Orchestrator] Failed to create/get dialer run:`, error);
    // Continue without run tracking - calls will still work but without proper tracking
  }

  // Process in batches for parallelism
  for (let i = 0; i < eligibleItems.length; i += PARALLEL_CALL_BATCH_SIZE) {
    const batch = eligibleItems.slice(i, i + PARALLEL_CALL_BATCH_SIZE);
    
    const CALL_INITIATION_TIMEOUT_MS = 60000; // 60s max per call initiation to prevent hanging
    const batchPromises = batch.map(async (item) => {
      // Wrap each call initiation in a timeout to prevent individual items from blocking the batch
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('CALL_INITIATION_TIMEOUT: Call initiation exceeded 60s')), CALL_INITIATION_TIMEOUT_MS);
      });

      const initiationPromise = (async () => {
      // Declare variables used in both try and catch blocks at function scope
      // (let inside try {} is block-scoped and invisible to catch {})
      let prospectLockAcquired = false;
      let callInitiated = false;
      let callerIdResult: CallerIdResult | null = null;
      let phoneNumber = '';
      try {
        // Use resolved phone from compliance check
        const rawPhoneNumber = item._resolvedPhone || item.dialedNumber || item.phone || item.phoneNumber || "";
        phoneNumber = rawPhoneNumber ? normalizeToE164(rawPhoneNumber) : "";
        if (!phoneNumber || !isValidE164(phoneNumber)) {
          console.warn(`[AI Orchestrator] Invalid phone number for queue item ${item.id}: raw="${rawPhoneNumber}" normalized="${phoneNumber}"`);
          try {
            await db.execute(sql`
              UPDATE campaign_queue
              SET status = 'removed',
                  removed_reason = 'invalid_phone',
                  enqueued_reason = COALESCE(enqueued_reason, '') || '|invalid_phone',
                  updated_at = NOW()
              WHERE id = ${item.id}
            `);
          } catch (markError) {
            console.error(`[AI Orchestrator] Failed to mark item ${item.id} as invalid_phone:`, markError);
          }
          return { success: false, itemId: item.id, error: 'invalid_phone' };
        }
        const contactId = item.contact_id || item.contactId;

        // CRITICAL: Skip items without contact_id - they can't be tracked properly
        if (!contactId) {
          console.warn(`[AI Orchestrator] Skipping queue item ${item.id} - missing contact_id`);
          return { success: false, itemId: item.id, error: 'missing_contact_id' };
        }

        // Validate/normalize phone number before proceeding (avoid Telnyx 422 loops)
        const normalizedPhone = normalizeToE164(String(phoneNumber || ''));
        if (!isValidE164(normalizedPhone)) {
          console.warn(`[AI Orchestrator] Removing queue item ${item.id} due to invalid phone: ${phoneNumber} -> ${normalizedPhone}`);
          try {
            await db.execute(sql`
              UPDATE campaign_queue
              SET status = 'removed',
                  removed_reason = 'invalid_phone',
                  enqueued_reason = COALESCE(enqueued_reason, '') || '|invalid_phone:' || ${String(phoneNumber || '').substring(0, 32)},
                  updated_at = NOW()
              WHERE id = ${item.id}
            `);
          } catch (updateError) {
            console.error(`[AI Orchestrator] Failed to mark queue item ${item.id} invalid:`, updateError);
          }
          return { success: false, itemId: item.id, error: 'invalid_phone' };
        }

        // Use normalized phone going forward
        phoneNumber = normalizedPhone;

        // Contact data comes from the SQL query (snake_case)
        // Use virtual agent name if available, fall back to aiSettings persona
        // NOTE: Default must be a real name, not "your representative" which is in PLACEHOLDER_VALUES blocklist
        // Check both agentName and name since wizard stores in agentName field
        const agentName = virtualAgent?.name || (aiSettings.persona as any)?.agentName || aiSettings.persona?.name || "Alex";
        const agentFirstName = agentName.split(' ')[0]; // Extract first name
        
        // Create call attempt record for proper tracking
        let callAttemptId: string | null = null;
        if (dialerRunId) {
          try {
            const [callAttempt] = await db
              .insert(dialerCallAttempts)
              .values({
                dialerRunId,
                campaignId,
                contactId,
                queueItemId: item.id,
                agentType: 'ai',
                virtualAgentId: virtualAgent?.id || null,
                phoneDialed: phoneNumber,
                attemptNumber: (item.attempt_count || 0) + 1,
              })
              .returning();
            callAttemptId = callAttempt.id;
            console.log(`[AI Orchestrator] Created call attempt ${callAttemptId} for contact ${contactId}`);
          } catch (err) {
            console.error(`[AI Orchestrator] Failed to create call attempt record:`, err);
          }
        } else {
          console.warn(`[AI Orchestrator] No dialerRunId available - call will lack proper tracking`);
        }

        const context: CallContext = {
          contactFirstName: item.contact_first_name || "there",
          contactLastName: item.contact_last_name || "",
          contactTitle: item.contact_job_title || "Decision Maker",
          contactEmail: item.contact_email || "",
          companyName: item.account_name || "your company",
          phoneNumber,
          campaignId,
          queueItemId: item.id,
          agentFullName: agentName,
          agentFirstName: agentFirstName,
          contactId: contactId || undefined,
          elevenLabsAgentId: virtualAgent?.externalAgentId || (aiSettings as any).elevenLabsAgentId || undefined,
          virtualAgentId: virtualAgent?.id || undefined,
          runId: dialerRunId || undefined,
          callAttemptId: callAttemptId || undefined,
          // Campaign context for AI agent behavior
          // Priority: campaign organization > persona companyName > fallback
          organizationName: campaignOrganizationName || aiSettings.persona?.companyName || 'DemandGentic.ai By Pivotal B2B',
          campaignObjective: (campaign as any).campaignObjective || undefined,
          successCriteria: (campaign as any).successCriteria || undefined,
          targetAudienceDescription: (campaign as any).targetAudienceDescription || undefined,
          productServiceInfo: (campaign as any).productServiceInfo || undefined,
          talkingPoints: (campaign as any).talkingPoints || undefined,
          // Call flow configuration - state machine for AI agent execution
          callFlow: (campaign as any).callFlow || undefined,
          // Max call duration in seconds - auto-hangup after this time
          maxCallDurationSeconds: (campaign as any).maxCallDurationSeconds || undefined,
        };

        // PRE-LOCK: Mark as in_progress BEFORE initiation to prevent race conditions
        // if the WebSocket connects before this function returns.
        // CRITICAL: Also set virtual_agent_id here to prevent validation errors in voice-dialer
        const virtualAgentIdValue = virtualAgent?.id || null;
        console.log(`[AI Orchestrator] PRE-LOCK: Setting queue item ${item.id} to in_progress with virtual_agent_id=${virtualAgentIdValue}`);
        await db.execute(sql`
          UPDATE campaign_queue
          SET status = 'in_progress',
              virtual_agent_id = ${virtualAgentIdValue},
              updated_at = NOW(),
              enqueued_reason = COALESCE(enqueued_reason, '') || '|locking:' || to_char(NOW(), 'HH24:MI:SS')
          WHERE id = ${item.id}
        `);
        console.log(`[AI Orchestrator] PRE-LOCK: Queue item ${item.id} updated successfully`);

        // === NUMBER POOL ROTATION ===
        // Select caller ID from number pool for spam prevention
        // Use campaign-level number pool config if available
        // callerIdResult already declared at outer scope for catch-block visibility
        try {
          callerIdResult = await getCallerIdForCall({
            campaignId,
            virtualAgentId: virtualAgent?.id,
            prospectNumber: phoneNumber,
            prospectRegion: item._country || undefined,
            prospectTimezone: item._timezone || undefined,
            callType: 'ai_campaign_orchestrator',
            numberPoolConfig: numberPoolConfig ? {
              enabled: numberPoolConfig.enabled ?? true,
              maxCallsPerNumber: numberPoolConfig.maxCallsPerNumber,
              rotationStrategy: numberPoolConfig.rotationStrategy as 'round_robin' | 'reputation_based' | 'region_match' | undefined,
              cooldownHours: numberPoolConfig.cooldownHours,
            } : undefined,
          });
          console.log(`[AI Orchestrator] Number pool selected: ${callerIdResult.callerId} (${callerIdResult.selectionReason})`);

          // Apply jitter delay to prevent burst calling from same number
          if (callerIdResult.jitterDelayMs > 0) {
            console.log(`[AI Orchestrator] Applying jitter delay: ${Math.round(callerIdResult.jitterDelayMs / 1000)}s`);
            await numberPoolSleep(callerIdResult.jitterDelayMs);
          }
        } catch (err: any) {
          // CRITICAL: Check if all numbers hit hourly limit - pause calling
          if (err?.name === 'AllNumbersAtHourlyLimitError') {
            console.warn(`[AI Orchestrator] 🚫 ALL NUMBERS AT HOURLY LIMIT - Pausing call initiation`);
            console.warn(`[AI Orchestrator] 📊 ${err.numbersAtHourlyCap} numbers at cap. Will resume next hour.`);
            // Reset queue item back to queued for retry later
            await db.execute(sql`
              UPDATE campaign_queue
              SET status = 'queued',
                  updated_at = NOW(),
                  next_attempt_at = DATE_TRUNC('hour', NOW()) + INTERVAL '1 hour',
                  enqueued_reason = COALESCE(enqueued_reason, '') || '|hourly_limit_pause:' || to_char(NOW(), 'HH24:MI:SS')
              WHERE id = ${item.id}
            `);
            // Return a special marker to indicate the entire batch should pause
            throw new Error('HOURLY_LIMIT_REACHED');
          }

          // STRICT MODE: If number pool is exhausted (all busy/cooling), DO NOT use legacy fallback.
          // Retry later instead to ensure no concurrent usage violates the rule.
          if (err?.name === 'NoAvailableNumberError') {
             console.log(`[AI Orchestrator] No numbers available (all busy/cooling) - re-queuing item ${item.id}`);
             try {
               // Re-queue with short delay (15s) — numbers release after ~10s compulsory gap,
               // so items are ready when numbers free up. Previous 60s delay caused pool idle gaps.
               await db.execute(sql`
                UPDATE campaign_queue
                SET status = 'queued',
                    updated_at = NOW(),
                    next_attempt_at = NOW() + INTERVAL '15 seconds',
                    enqueued_reason = COALESCE(enqueued_reason, '') || '|pool_busy'
                WHERE id = ${item.id}
              `);
             } catch (requeueErr) {
               console.error(`[AI Orchestrator] Failed to requeue item ${item.id}:`, requeueErr);
             }
             return { success: false, itemId: item.id, error: err, skipped: true };
          }

          // When number pool is enabled, NEVER fall back to legacy number —
          // it has no concurrent-call tracking and causes duplicate call issues.
          if (isNumberPoolEnabled()) {
            console.warn(`[AI Orchestrator] Number pool error — re-queuing item ${item.id} (no legacy fallback when pool enabled):`, err?.message || err);
            try {
              await db.execute(sql`
                UPDATE campaign_queue
                SET status = 'queued',
                    updated_at = NOW(),
                    next_attempt_at = NOW() + INTERVAL '15 seconds',
                    enqueued_reason = COALESCE(enqueued_reason, '') || '|pool_error_requeue'
                WHERE id = ${item.id}
              `);
            } catch (requeueErr) {
              console.error(`[AI Orchestrator] Failed to requeue item ${item.id}:`, requeueErr);
            }
            return { success: false, itemId: item.id, error: err, skipped: true };
          }

          console.error(`[AI Orchestrator] Number pool selection failed, using legacy:`, err);
          callerIdResult = {
            callerId: legacyFromNumber || '',
            numberId: null,
            decisionId: null,
            jitterDelayMs: 0,
            selectionReason: 'pool_error_fallback',
            isPoolNumber: false,
          };
        }

        const fromNumber = callerIdResult.callerId;
        if (!fromNumber) {
          throw new Error('No caller ID available');
        }

        // Store numberId in context for metrics tracking after call completion
        context.callerNumberId = callerIdResult.numberId;
        context.callerNumberDecisionId = callerIdResult.decisionId;

        // Persist selected outbound DID metadata for observability/debugging,
        // even if the call fails before media starts.
        if (callAttemptId) {
          try {
            await db.update(dialerCallAttempts).set({
              callerNumberId: callerIdResult.numberId || null,
              fromDid: fromNumber,
              updatedAt: new Date(),
            }).where(eq(dialerCallAttempts.id, callAttemptId));
          } catch (didPersistErr) {
            console.error(`[AI Orchestrator] Failed to persist caller DID metadata on attempt ${callAttemptId}:`, didPersistErr);
          }
        }

        // =========================================================================
        // CENTRALIZED DUPLICATE CALL PREVENTION
        // =========================================================================
        // Acquire lock on prospect number BEFORE initiating call.
        // This prevents duplicate calls to same prospect from any path (SIP or Telnyx).
        const prospectLock = acquireProspectLock({
          prospectNumber: phoneNumber,
          callerNumber: fromNumber,
          callPath: useSip ? 'sip' : 'telnyx',
          callId: callAttemptId || undefined,
          campaignId,
          queueItemId: item.id,
        });

        if (!prospectLock.success) {
          console.log(`[AI Orchestrator] ⏭️ Skipping ${phoneNumber}: ${prospectLock.reason}`);
          // Release number pool lock since we're not making the call
          releaseNumberWithoutOutcome(callerIdResult.numberId);
          // Reset queue item to queued so it can be retried later
          await db.execute(sql`
            UPDATE campaign_queue
            SET status = 'queued',
                next_attempt_at = NOW() + INTERVAL '30 seconds',
                updated_at = NOW(),
                enqueued_reason = COALESCE(enqueued_reason, '') || '|skipped_duplicate_call:' || to_char(NOW(), 'HH24:MI:SS')
            WHERE id = ${item.id}
          `);
          return null;
        }

        // Track that we acquired the lock for cleanup on error
        prospectLockAcquired = true;

        // Initiate call via SIP or Telnyx API based on configuration
        let callResult: any;
        let conversationId: string;

        if (useSip) {
          // Use SIP-based calling
          const sipResult = await sipDialer.initiateAiCall({
            toNumber: phoneNumber,
            fromNumber,
            campaignId,
            contactId: contactId || '',
            queueItemId: item.id,
            // Use configured voice from persona settings, NOT the agent/persona name
            // Gemini only supports: Puck, Charon, Kore, Fenrir, Aoede, Leda, Orus, Zephyr
            voiceName: aiSettings.persona?.voice || 'Puck',
            contactName: `${item.contact_first_name || ''} ${item.contact_last_name || ''}`.trim() || 'there',
            contactFirstName: item.contact_first_name || 'there',
            contactJobTitle: item.contact_job_title || 'Decision Maker',
            accountName: item.account_name || 'your company',
            organizationName: campaignOrganizationName || aiSettings.persona?.companyName || 'DemandGentic.ai By Pivotal B2B',
            campaignName: campaign.name,
            campaignObjective: (campaign as any).campaignObjective || undefined,
            productServiceInfo: (campaign as any).productServiceInfo || undefined,
            talkingPoints: (campaign as any).talkingPoints || undefined,
            maxCallDurationSeconds: (campaign as any).maxCallDurationSeconds || undefined,
            // Number pool tracking
            callerNumberId: callerIdResult.numberId,
            callerNumberDecisionId: callerIdResult.decisionId,
          });

          if (!sipResult.success) {
            throw new Error(sipResult.error || 'SIP call initiation failed');
          }

          callResult = sipResult;
          callInitiated = true;
          conversationId = sipResult.callId || '';
        } else {
          // Use Telnyx API-based calling (legacy)
          callResult = await bridge!.initiateAiCall(phoneNumber, fromNumber, aiSettings, context);
          callInitiated = true;
          conversationId = callResult?.callControlId || callResult?.callId || '';
        }

        // POST-LOCK UPDATE: Add the actual conversation ID for webhook matching
        await db.execute(sql`
          UPDATE campaign_queue
          SET updated_at = NOW(),
              enqueued_reason = COALESCE(enqueued_reason, '') || ' ai_conv:' || ${conversationId}
          WHERE id = ${item.id}
        `);

        // CRITICAL: Store the Telnyx call_control_id in dialerCallAttempts for recording webhook matching
        // Without this, recording.completed webhooks cannot find the matching call
        const telnyxCallId = callResult?.callControlId || callResult?.callId || conversationId;
        if (callAttemptId && telnyxCallId) {
          try {
            await db.update(dialerCallAttempts).set({
              telnyxCallId: telnyxCallId,
              callerNumberId: callerIdResult.numberId || null,
              fromDid: fromNumber,
              callStartedAt: new Date(),
              updatedAt: new Date(),
            }).where(eq(dialerCallAttempts.id, callAttemptId));
            console.log(`[AI Orchestrator] Updated call attempt ${callAttemptId} with telnyxCallId: ${telnyxCallId}`);
          } catch (updateErr) {
            console.error(`[AI Orchestrator] Failed to update call attempt with telnyxCallId:`, updateErr);
          }
        }

        return { success: true, itemId: item.id, conversationId };
      } catch (error: any) {
        // Release prospect lock if we acquired it
        if (prospectLockAcquired && phoneNumber) {
          releaseProspectLock(phoneNumber, 'call_initiation_error');
        }
        if (!callInitiated) {
          releaseNumberWithoutOutcome(callerIdResult?.numberId || null);
        }
        if (isVoiceVariablePreflightError(error)) {
          const missing = error.result.missingKeys.join(",");
          const invalid = error.result.invalidKeys.join(",");
          console.warn(
            `[AI Orchestrator] Voice variable preflight failed for ${item.id}: missing=${missing || "none"}, invalid=${invalid || "none"}`
          );

          try {
            await db.execute(sql`
              UPDATE campaign_queue
              SET status = 'queued',
                  next_attempt_at = NOW() + INTERVAL '7 days',
                  enqueued_reason = COALESCE(enqueued_reason, '') || '|missing_fields:' || ${missing || "none"} || '|invalid_fields:' || ${invalid || "none"},
                  updated_at = NOW()
              WHERE id = ${item.id}
            `);
          } catch (resetError) {
            console.error(`[AI Orchestrator] Failed to mark missing-field hold for ${item.id}:`, resetError);
          }

          return { success: false, itemId: item.id, error };
        }

        // Check for Telnyx account-level errors (should pause campaign, not retry)
        const telnyxFatalError = isTelnyxFatalError(error);
        if (telnyxFatalError) {
          if (telnyxFatalError.isWhitelist && telnyxFatalError.isRateLimit) {
            console.error(`[AI Orchestrator] ⚠️ Telnyx outbound profile rate cap hit for contact: ${telnyxFatalError.detail}`);
            console.warn(`[AI Orchestrator] ℹ️ Contact queued for retry in 30 minutes (rate limit is temporary)`);

            // Don't pause campaign - just queue for later retry. D24 is temporary.
            try {
              await db.execute(sql`
                UPDATE campaign_queue
                SET status = 'queued',
                    next_attempt_at = NOW() + INTERVAL '30 minutes',
                    enqueued_reason = COALESCE(enqueued_reason, '') || '|telnyx_d24_rate_limit',
                    updated_at = NOW()
                WHERE id = ${item.id}
              `);
            } catch (updateError) {
              console.error(`[AI Orchestrator] Failed to requeue queue item ${item.id} after D24 rate limit:`, updateError);
            }

            return { success: false, itemId: item.id, error, fatalError: false };
          }

          if (telnyxFatalError.isWhitelist) {
            console.error(`[AI Orchestrator] ⚠️ Whitelist error for contact: ${telnyxFatalError.detail}`);
            // For whitelist errors, just remove the contact, DON'T pause the whole campaign
            try {
              await db.execute(sql`
                UPDATE campaign_queue
                SET status = 'removed',
                    removed_reason = 'country_not_whitelisted',
                    enqueued_reason = COALESCE(enqueued_reason, '') || '|whitelist_fail',
                    updated_at = NOW()
                WHERE id = ${item.id}
              `);
            } catch (updateError) {
              console.error(`[AI Orchestrator] Failed to update queue item ${item.id}:`, updateError);
            }
            return { success: false, itemId: item.id, error };
          }

          console.error(`[AI Orchestrator] ⚠️ FATAL TELNYX ERROR detected: code=${telnyxFatalError.code}, detail="${telnyxFatalError.detail}"`);
          console.error(`[AI Orchestrator] ⚠️ Pausing campaign ${campaignId} due to Telnyx account issue - please check your Telnyx account status`);

          // Pause the campaign to stop further call attempts
          try {
            await storage.updateCampaign(campaignId, { status: 'paused' });
            console.log(`[AI Orchestrator] ✅ Campaign ${campaignId} has been PAUSED due to Telnyx account error`);
            console.log(`[AI Orchestrator] ℹ️ Reason: Telnyx Error ${telnyxFatalError.code}: ${telnyxFatalError.detail}`);
            console.log(`[AI Orchestrator] ℹ️ Action Required: Check your Telnyx account status at https://portal.telnyx.com`);
          } catch (pauseError) {
            console.error(`[AI Orchestrator] Failed to pause campaign ${campaignId}:`, pauseError);
          }

          // Mark item as failed (not retryable)
          try {
            await db.execute(sql`
              UPDATE campaign_queue
              SET status = 'removed',
                  removed_reason = ${'telnyx_account_disabled'},
                  enqueued_reason = COALESCE(enqueued_reason, '') || '|telnyx_fatal:' || ${telnyxFatalError.detail.substring(0, 50)},
                  updated_at = NOW()
              WHERE id = ${item.id}
            `);
          } catch (updateError) {
            console.error(`[AI Orchestrator] Failed to update queue item ${item.id}:`, updateError);
          }

          // Return with special flag to stop processing this campaign
          return { success: false, itemId: item.id, error, fatalError: true };
        }

        // HOURLY LIMIT REACHED - Stop processing this batch, calls will resume next hour
        if (error?.message === 'HOURLY_LIMIT_REACHED') {
          console.warn(`[AI Orchestrator] 🚫 Hourly limit reached - stopping batch processing for campaign ${campaignId}`);
          return { success: false, itemId: item.id, error, hourlyLimitReached: true };
        }

        console.error(`[AI Orchestrator] Failed to initiate call for ${item.id}:`, error?.message || error);

        // IMMEDIATE ERROR RECOVERY: Reset the queue item for retry
        // This prevents slots from being consumed by failed initiations
        try {
          await db.execute(sql`
            UPDATE campaign_queue
            SET status = 'queued',
                next_attempt_at = NOW() + INTERVAL '2 minutes',
                enqueued_reason = COALESCE(enqueued_reason, '') || '|init_fail:' || ${String(error?.message || 'unknown').substring(0, 50)},
                updated_at = NOW()
            WHERE id = ${item.id}
          `);
          console.log(`[AI Orchestrator] Reset queue item ${item.id} for retry after initiation failure`);
        } catch (resetError) {
          console.error(`[AI Orchestrator] Failed to reset queue item ${item.id}:`, resetError);
        }

        return { success: false, itemId: item.id, error };
      }
      })(); // end initiationPromise

      // Race against timeout - prevents any single call from blocking the batch forever
      return Promise.race([initiationPromise, timeoutPromise]);
    });

    const settled = await Promise.allSettled(batchPromises);
    const results = await Promise.all(settled.map(async (s, index) => {
      if (s.status === 'fulfilled') return s.value;
      
      const item = batch[index];
      const reason = s.reason;
      console.error(`[AI Orchestrator] Unhandled batch promise rejection for item ${item.id}:`, reason);

      // CRITICAL FIX: Reset stuck item immediately if the promise rejected (e.g. timeout).
      // Note: The inner initiationPromise continues in background — its catch handler will
      // release the number lock. If it's truly stuck, the 3-minute auto-cleanup catches it.
      try {
        await db.execute(sql`
          UPDATE campaign_queue
          SET status = 'queued',
              removed_reason = ${String(reason).substring(0, 255)},
              next_attempt_at = NOW() + INTERVAL '30 seconds',
              updated_at = NOW()
          WHERE id = ${item.id}
        `);
        console.log(`[AI Orchestrator] Reset stuck item ${item.id} due to batch rejection`);
      } catch (err) {
        console.error(`[AI Orchestrator] Failed to reset stuck item ${item.id}:`, err);
      }

      return { success: false, error: reason };
    }));
    const batchSuccess = results.filter(r => r && r.success).length;
    initiated += batchSuccess;

    console.log(`[AI Orchestrator] Batch ${Math.floor(i / PARALLEL_CALL_BATCH_SIZE) + 1}: ${batchSuccess}/${batch.length} calls initiated (total: ${initiated}/${eligibleItems.length})`);

    // Check if any result hit hourly limit - stop processing remaining batches
    const hourlyLimitResult = results.find((r: any) => r && r.hourlyLimitReached);
    if (hourlyLimitResult) {
      console.warn(`[AI Orchestrator] 🚫 HOURLY LIMIT: Stopping campaign ${campaignId} - all phone numbers at hourly call limit`);
      console.warn(`[AI Orchestrator] ⏰ Calls will automatically resume when limits reset (next hour)`);
      // Reset remaining items in this batch to queued with next_attempt_at = next hour
      const remainingItems = eligibleItems.slice(i + PARALLEL_CALL_BATCH_SIZE);
      if (remainingItems.length > 0) {
        const remainingIds = remainingItems.map(item => item.id);
        await db.execute(sql`
          UPDATE campaign_queue
          SET status = 'queued',
              next_attempt_at = DATE_TRUNC('hour', NOW()) + INTERVAL '1 hour',
              updated_at = NOW()
          WHERE id = ANY(${remainingIds})
            AND status = 'in_progress'
        `);
        console.log(`[AI Orchestrator] Reset ${remainingItems.length} remaining items to retry next hour`);
      }
      await setOrchestratorStallReason(campaignId, 'Hourly call limit reached on all numbers. Calls will resume next hour.');
      return { initiated, skipped, hourlyLimitPaused: true };
    }

    // Check if ALL items in batch were skipped due to pool busy — apply smart recovery
    const allSkipped = results.every((r: any) => r && !r.success);
    const poolBusyCount = results.filter((r: any) => r && r.skipped).length;
    if (allSkipped && poolBusyCount > 0 && batchSuccess === 0) {
      // === POOL-AWARE STALL RECOVERY ===
      // Instead of blindly setting a stall message and giving up, diagnose the pool
      // and auto-release numbers that are clearly leaked (locked too long without release).
      const poolStatus = getNumberPoolStatus();
      const now = Date.now();
      const STALE_THRESHOLD_MS = 120_000; // 2 minutes — calls should release within ~90s max
      const staleNumbers = poolStatus.numbers.filter(n => n.lockedForSec > STALE_THRESHOLD_MS / 1000);

      console.warn(
        `[AI Orchestrator] 🚫 ALL ${batch.length} items in batch skipped (${poolBusyCount} pool-busy) for campaign ${campaignId}\n` +
        `  Pool status: ${poolStatus.inUse} numbers locked | ${staleNumbers.length} stale (>${STALE_THRESHOLD_MS / 1000}s)\n` +
        `  Locked numbers: ${poolStatus.numbers.map(n => `${n.id}(${n.lockedForSec}s)`).join(', ') || 'none'}`
      );

      if (staleNumbers.length > 0) {
        // Targeted release: only free numbers locked beyond the stale threshold.
        // Unlike forceReleaseAllNumbers(), this is safe during active calling —
        // it leaves legitimately-in-use numbers alone, preventing double-booking.
        const released = releaseStaleNumbers(STALE_THRESHOLD_MS);
        console.warn(`[AI Orchestrator] 🔓 AUTO-RECOVERED: Released ${released} stale number lock(s) — pool should unblock on next tick`);
        // Don't set stall message — pool is now clear, next tick will succeed
        return { initiated, skipped: skipped + poolBusyCount };
      }

      // All numbers are legitimately in active calls — set informational stall and let next tick retry
      await setOrchestratorStallReason(
        campaignId,
        `All ${poolStatus.inUse} phone numbers in active calls. Calls will resume when numbers become available.`
      );
      return { initiated, skipped: skipped + poolBusyCount };
    }

    // Check if any result has a fatal error - if so, stop processing this campaign
    const fatalResult = results.find((r: any) => r && r.fatalError);
    if (fatalResult) {
      console.log(`[AI Orchestrator] Stopping campaign ${campaignId} processing due to fatal Telnyx error`);
      await setOrchestratorStallReason(campaignId, 'Fatal telephony error. Check Telnyx account status.');
      return { initiated, skipped, fatalError: true };
    }

    // Short delay between batches to avoid rate limits
    if (i + PARALLEL_CALL_BATCH_SIZE < eligibleItems.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CALLS_MS));
    }
  }

  // Clear stall reason when calls are successfully initiated
  if (initiated > 0) {
    await setOrchestratorStallReason(campaignId, null);
  }

  return { initiated, skipped };
}

/**
 * Main orchestrator tick - check all active AI campaigns
 */
async function orchestratorTick(): Promise<OrchestratorJobResult> {
  try {
    // WATCHDOG: First, clean up stale in-memory prospect/caller locks, then reset stuck DB items
    const staleLocksCleaned = cleanupStaleLocks(5); // Clean locks older than 5 minutes (aligned with background-jobs threshold)
    if (staleLocksCleaned > 0) {
      console.log(`[AI Orchestrator] WATCHDOG: Cleaned ${staleLocksCleaned} stale in-memory prospect/caller locks`);
    }
    const stuckReset = await resetStuckItems();
    
    // Get all active ai_agent campaigns
    const campaigns = await storage.getCampaigns({ status: 'active', dialMode: 'ai_agent' });
    
    if (campaigns.length === 0) {
      lastCampaignStartIndex = 0;
      return { processed: true, message: 'No active AI campaigns' };
    }

    const globalInProgress = await getGlobalInProgressCount();
    const { globalMax } = await getConcurrencyLimits();
    let availableGlobalSlots = Math.max(0, globalMax - globalInProgress);

    const perCampaignShare = Math.max(1, Math.floor(globalMax / Math.max(campaigns.length, 1)));
    const startIndex = campaigns.length > 0 ? lastCampaignStartIndex % campaigns.length : 0;
    const orderedCampaigns = campaigns.length > 0
      ? [...campaigns.slice(startIndex), ...campaigns.slice(0, startIndex)]
      : campaigns;
    lastCampaignStartIndex = campaigns.length > 0 ? (startIndex + 1) % campaigns.length : 0;

    console.log(`[AI Orchestrator] Processing ${campaigns.length} active AI campaign(s)${stuckReset > 0 ? ` (watchdog freed ${stuckReset} slots)` : ''} (global ${globalInProgress}/${globalMax}, share ${perCampaignShare}, start index ${startIndex})`);

    if (availableGlobalSlots <= 0) {
      console.log('[AI Orchestrator] Pausing tick - global concurrency limit reached');
      return { processed: true, message: 'Global concurrency limit reached; waiting for slots to free' };
    }

    let totalInitiated = 0;
    let processedCampaigns = 0;

    for (const campaign of orderedCampaigns) {
      if (availableGlobalSlots <= 0) {
        console.log('[AI Orchestrator] Global slots exhausted, skipping remaining campaigns for this tick');
        break;
      }

      const slotsToRequest = Math.min(perCampaignShare, availableGlobalSlots);
      if (slotsToRequest <= 0) break;

      const result = await processCampaign(campaign.id, { maxNewCalls: slotsToRequest });
      totalInitiated += result.initiated;
      availableGlobalSlots = Math.max(0, availableGlobalSlots - result.initiated);
      processedCampaigns += 1;

      if (result.fatalError) {
        console.log(`[AI Orchestrator] Campaign ${campaign.id} halted due to fatal error`);
        continue;
      }
    }

    return { 
      processed: true, 
      callsInitiated: totalInitiated,
      message: `Processed ${processedCampaigns}/${campaigns.length} campaigns, global slots left: ${availableGlobalSlots}`
    };
  } catch (error) {
    console.error('[AI Orchestrator] Tick error:', error);
    return { processed: false, message: String(error) };
  }
}

/**
 * Initialize the AI Campaign Orchestrator
 */
export async function initializeAiCampaignOrchestrator(
  options: { forceReinitialize?: boolean } = {}
): Promise<void> {
  const forceReinitialize = options.forceReinitialize === true;

  if (orchestratorInitializing) {
    console.warn('[AI Orchestrator] Initialization already in progress - skipping duplicate call');
    return;
  }

  const workerHealthy = Boolean(
    orchestratorWorker &&
    orchestratorWorker.isRunning() &&
    !orchestratorWorker.isPaused()
  );

  if (!forceReinitialize && orchestratorQueue && workerHealthy) {
    return;
  }

  orchestratorInitializing = true;
  try {
    if (forceReinitialize) {
      await teardownAiCampaignOrchestrator('forced reinitialize requested');
    } else if (orchestratorQueue && !workerHealthy) {
      await teardownAiCampaignOrchestrator('detected unhealthy worker state');
    } else if (orchestratorQueue && !orchestratorWorker) {
      await teardownAiCampaignOrchestrator('detected partial initialization state');
    }

    if (!isQueueAvailable()) {
      console.warn('[AI Orchestrator] Redis not available - orchestrator disabled');
      return;
    }


    // Create queue
    orchestratorQueue = createQueue<OrchestratorJobData>('ai-campaign-orchestrator', {
      attempts: 1,
      removeOnComplete: 10,
      removeOnFail: 50,
    });

    if (!orchestratorQueue) {
      console.error('[AI Orchestrator] Failed to create queue');
      return;
    }

    // Create worker with extended lock duration for high-volume call initiation
    orchestratorWorker = createWorker<OrchestratorJobData>(
      'ai-campaign-orchestrator',
      async (job: Job<OrchestratorJobData>) => {
        if (job.data.type === 'tick') {
          const result = await orchestratorTick();
          lastOrchestratorTickAt = Date.now();
          return result;
        } else if (job.data.type === 'campaign-replenish' && job.data.campaignId) {
          const { globalMax } = await getConcurrencyLimits();
          const globalSlots = Math.max(0, globalMax - (await getGlobalInProgressCount()));
          if (globalSlots <= 0) {
            console.log(`[AI Orchestrator] Replenish skipped for ${job.data.campaignId} - global limit reached`);
            return { processed: true, callsInitiated: 0, message: 'Global concurrency limit reached' };
          }
          const result = await processCampaign(job.data.campaignId, { maxNewCalls: globalSlots });
          return { processed: true, callsInitiated: result.initiated };
        }
        return { processed: false, message: 'Unknown job type' };
      },
      { 
        concurrency: 1, // Process one at a time to avoid race conditions
        lockDuration: 300000, // 5 minutes - enough time for 50 call initiations
        stalledInterval: 120000, // Check for stalled jobs every 2 minutes
      }
    );

    if (!orchestratorWorker) {
      console.warn('[AI Orchestrator] Worker could not be started');
      orchestratorQueue = null;
      return;
    }

    orchestratorWorker.on('closed', () => {
      console.warn('[AI Orchestrator] Worker emitted closed event');
    });

    // Add repeatable job for regular ticks
    orchestratorQueue.add(
      'orchestrator-tick',
      { type: 'tick' },
      {
        repeat: { every: ORCHESTRATOR_INTERVAL_MS },
        jobId: 'ai-orchestrator-tick',
        removeOnComplete: true,
      }
    ).then(() => {
      console.log(`[AI Orchestrator] Started - checking every ${ORCHESTRATOR_INTERVAL_MS / 1000}s`);
    }).catch(err => {
      console.error('[AI Orchestrator] Failed to add repeatable job:', err);
    });

    // Run an immediate tick on startup so all active campaigns begin processing
    // without waiting for the next repeat window.
    orchestratorQueue.add(
      'orchestrator-tick-startup',
      { type: 'tick' },
      {
        jobId: `ai-orchestrator-startup-${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: true,
      }
    ).then(() => {
      console.log('[AI Orchestrator] Startup tick enqueued');
    }).catch(err => {
      console.error('[AI Orchestrator] Failed to enqueue startup tick:', err);
    });

    // Heartbeat watchdog: if tick processing stalls or queue becomes idle,
    // enqueue a rescue tick to keep call triggering continuous.
    if (orchestratorHeartbeatTimer) {
      clearInterval(orchestratorHeartbeatTimer);
    }
    lastOrchestratorTickAt = Date.now();
    orchestratorHeartbeatTimer = setInterval(async () => {
      if (!orchestratorQueue) return;

      try {
        const [activeCount, waitingCount, delayedCount] = await Promise.all([
          orchestratorQueue.getActiveCount(),
          orchestratorQueue.getWaitingCount(),
          orchestratorQueue.getDelayedCount(),
        ]);

        const now = Date.now();
        const staleTick = now - lastOrchestratorTickAt > ORCHESTRATOR_HEARTBEAT_MS;
        const queueIdle = activeCount === 0 && waitingCount === 0 && delayedCount === 0;

        if (staleTick || queueIdle) {
          await orchestratorQueue.add(
            'orchestrator-tick-rescue',
            { type: 'tick' },
            {
              jobId: `ai-orchestrator-rescue-${now}`,
              removeOnComplete: true,
              removeOnFail: true,
            }
          );
          console.warn(
            `[AI Orchestrator] Heartbeat enqueued rescue tick (staleTick=${staleTick}, queueIdle=${queueIdle}, active=${activeCount}, waiting=${waitingCount}, delayed=${delayedCount})`
          );
        }
      } catch (err) {
        console.error('[AI Orchestrator] Heartbeat check failed:', err);
      }
    }, ORCHESTRATOR_HEARTBEAT_MS);

    // Run startup resume to clear any stuck items from previous server instance
    startupResumeStuckCalls().catch(err => {
      console.error('[AI Orchestrator] Startup resume failed:', err);
    });

    console.log('[AI Orchestrator] Initialized successfully');
  } finally {
    orchestratorInitializing = false;
  }
}

/**
 * Trigger immediate replenishment for a campaign
 * Called by webhook handler after a call completes
 */
export async function triggerCampaignReplenish(campaignId: string): Promise<void> {
  if (!orchestratorQueue || !orchestratorWorker || !orchestratorWorker.isRunning()) {
    console.warn('[AI Orchestrator] Queue not available for replenish');
    return;
  }

  try {
    await orchestratorQueue.add(
      `replenish-${campaignId}`,
      { type: 'campaign-replenish', campaignId },
      { 
        delay: 1000, // 1 second delay to batch webhook events
        jobId: `replenish-${campaignId}-${Date.now()}`,
        removeOnComplete: true,
      }
    );
    console.log(`[AI Orchestrator] Replenish triggered for campaign ${campaignId}`);
  } catch (error) {
    console.error(`[AI Orchestrator] Failed to trigger replenish for ${campaignId}:`, error);
  }
}

/**
 * Get orchestrator status
 */
export async function getOrchestratorStatus(): Promise<{
  available: boolean;
  activeJobs?: number;
  waitingJobs?: number;
  workerRunning?: boolean;
  workerPaused?: boolean;
  staleTick?: boolean;
  lastTickAgeMs?: number;
}> {
  if (!orchestratorQueue || !orchestratorWorker) {
    return { available: false };
  }

  const workerRunning = orchestratorWorker.isRunning();
  const workerPaused = orchestratorWorker.isPaused();
  const lastTickAgeMs = lastOrchestratorTickAt > 0
    ? Math.max(0, Date.now() - lastOrchestratorTickAt)
    : undefined;
  const staleTick = typeof lastTickAgeMs === 'number'
    ? lastTickAgeMs > ORCHESTRATOR_HEARTBEAT_MS * 2
    : true;

  try {
    const [activeCount, waitingCount] = await Promise.all([
      orchestratorQueue.getActiveCount(),
      orchestratorQueue.getWaitingCount(),
    ]);
    const available = workerRunning && !workerPaused && !staleTick;
    return {
      available,
      activeJobs: activeCount,
      waitingJobs: waitingCount,
      workerRunning,
      workerPaused,
      staleTick,
      lastTickAgeMs,
    };
  } catch {
    return {
      available: false,
      workerRunning,
      workerPaused,
      staleTick,
      lastTickAgeMs,
    };
  }
}
