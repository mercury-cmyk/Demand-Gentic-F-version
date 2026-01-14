/**
 * AI Campaign Orchestrator
 * 
 * Automatically manages AI calling campaigns using BullMQ.
 * Maintains target concurrency for active ai_agent campaigns.
 * Survives server restarts via persistent Redis jobs.
 */

import { Queue, Worker, Job } from 'bullmq';
import { createQueue, createWorker, isQueueAvailable } from './queue';
import { storage } from '../storage';
import { getTelnyxAiBridge } from '../services/telnyx-ai-bridge';
import { AiAgentSettings, CallContext } from '../services/ai-voice-agent';
import { isVoiceVariablePreflightError } from '../services/voice-variable-contract';
import { db } from '../db';
import { campaignQueue, contacts, suppressionPhones, campaignSuppressionAccounts, campaignAgentAssignments, virtualAgents, dialerCallAttempts, dialerRuns } from '@shared/schema';
import { eq, sql, inArray, and } from 'drizzle-orm';
import { checkSuppressionBulk } from './suppression.service';
import { getBestPhoneForContact } from './phone-utils';
import { toZonedTime, format } from 'date-fns-tz';
import { getDay, getHours } from 'date-fns';
import { 
  isWithinBusinessHours as checkBusinessHours, 
  detectContactTimezone, 
  getBusinessHoursForCountry 
} from '../utils/business-hours';

const ORCHESTRATOR_INTERVAL_MS = 15000; // Check every 15 seconds
const DEFAULT_MAX_CONCURRENT_CALLS = 30; // Increased to 30 as requested
const DELAY_BETWEEN_CALLS_MS = 500; // 500ms delay between call batches
const PARALLEL_CALL_BATCH_SIZE = 5; // Batch size of 5 for efficient ramp-up
const STUCK_ITEM_TIMEOUT_MS = 180000; // 3 minutes - reset items stuck in_progress longer than this

// Telnyx error codes that should pause the campaign (account-level issues)
const TELNYX_ACCOUNT_DISABLED_CODE = 10010; // "Account is disabled D17"
const TELNYX_FATAL_ERROR_CODES = [10010]; // Account disabled - don't retry, pause campaign

/**
 * Check if an error indicates a Telnyx account-level issue that requires pausing
 * Returns the error code if it's a fatal error, null otherwise
 */
function isTelnyxFatalError(error: any): { code: number; detail: string } | null {
  if (!error || !error.message) return null;

  const message = String(error.message);

  // Parse Telnyx API error format: "Telnyx API error: 403 - {"errors":[{"code":10010,"detail":"Account is disabled D17"}]}"
  const jsonMatch = message.match(/\{[\s\S]*"errors"[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const errorData = JSON.parse(jsonMatch[0]);
    if (errorData.errors && Array.isArray(errorData.errors)) {
      for (const err of errorData.errors) {
        if (err.code && TELNYX_FATAL_ERROR_CODES.includes(err.code)) {
          return { code: err.code, detail: err.detail || 'Unknown error' };
        }
      }
    }
  } catch {
    // JSON parsing failed, not a structured Telnyx error
  }

  return null;
}

/**
 * Check if a contact is within their local business hours based on country
 * Returns { canCall: boolean, timezone: string | null, localTime: string, reason?: string }
 * 
 * If timezone cannot be detected, returns canCall: false to avoid calling at wrong times
 */
function isContactWithinBusinessHours(contact: { country?: string | null; state?: string | null; timezone?: string | null }): {
  canCall: boolean;
  timezone: string | null;
  localTime: string;
  reason?: string;
} {
  const contactTz = detectContactTimezone({ 
    country: contact.country || undefined, 
    state: contact.state || undefined,
    timezone: contact.timezone || undefined
  });
  
  // CRITICAL: If timezone cannot be detected, do NOT call - skip this contact
  if (!contactTz) {
    return {
      canCall: false,
      timezone: null,
      localTime: 'unknown',
      reason: `Unknown timezone (country: ${contact.country || 'not set'})`
    };
  }
  
  // Get country-specific business hours (handles Middle East Sun-Thu work week)
  const countryConfig = getBusinessHoursForCountry(contact.country);
  const config = {
    ...countryConfig,
    timezone: contactTz,
    respectContactTimezone: false, // We already resolved the timezone
  };
  
  const now = new Date();
  const canCall = checkBusinessHours(config, undefined, now);
  
  // Get local time for logging
  const zonedTime = toZonedTime(now, contactTz);
  const hour = getHours(zonedTime);
  const dayOfWeek = getDay(zonedTime);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const localTime = `${dayNames[dayOfWeek]} ${hour}:00`;
  
  let reason: string | undefined;
  if (!canCall) {
    // Check if it's a non-working day for this country
    const dayName = dayNames[dayOfWeek].toLowerCase();
    const isWorkingDay = countryConfig.operatingDays.includes(
      ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek]
    );
    
    if (!isWorkingDay) {
      reason = `Non-working day (${localTime} ${contactTz})`;
    } else {
      reason = `Outside hours (${localTime} ${contactTz}, hours: ${countryConfig.startTime}-${countryConfig.endTime})`;
    }
  }
  
  return { canCall, timezone: contactTz, localTime, reason };
}

/**
 * Check if phone is a valid UK/USA/Canada number and return priority
 * Priority: 1 = UK mobile (+447), 2 = UK landline (+441/2/3), 
 *          3 = USA/Canada mobile (+1 with mobile area codes), 4 = USA/Canada other (+1),
 *          0 = not a priority country
 */
function getPhonePriority(phone: string | null | undefined): number {
  if (!phone) return 0;
  const cleaned = phone.replace(/[^\d+]/g, '');
  const e164 = cleaned.startsWith('+') ? cleaned : '+' + cleaned;
  
  // UK mobile numbers: +447... (highest priority)
  if (e164.startsWith('+447')) return 1;
  
  // UK landline numbers: +441..., +442..., +443...
  if (e164.startsWith('+441') || e164.startsWith('+442') || e164.startsWith('+443')) return 2;
  
  // USA/Canada numbers: +1...
  if (e164.startsWith('+1') && e164.length === 12) {
    // Common mobile area code patterns in US/Canada (less reliable than UK but useful)
    // Most US mobile numbers are indistinguishable from landlines, so we give all +1 numbers priority 3-4
    return 3; // USA/Canada numbers get priority 3
  }
  
  // Not a priority country number
  return 0;
}

// Alias for backward compatibility
const getUkPhonePriority = getPhonePriority;

/**
 * Get the best priority phone for a contact (UK mobile > UK landline > USA/Canada > other)
 */
function getBestPriorityPhone(contact: any): { phone: string | null; priority: number } {
  // Check mobile first (highest priority for UK mobile)
  const mobilePriority = getPhonePriority(contact?.mobilePhoneE164);
  if (mobilePriority === 1) {
    return { phone: contact.mobilePhoneE164, priority: 1 };
  }
  
  // Check direct phone for UK landline or USA/Canada
  const directPriority = getPhonePriority(contact?.directPhoneE164);
  if (directPriority > 0 && directPriority <= mobilePriority) {
    return { phone: contact.directPhoneE164, priority: directPriority };
  }
  
  // Return mobile if it has any priority (UK landline in mobile field or USA/Canada)
  if (mobilePriority > 0) {
    return { phone: contact.mobilePhoneE164, priority: mobilePriority };
  }
  
  // Return direct if it has any priority
  if (directPriority > 0) {
    return { phone: contact.directPhoneE164, priority: directPriority };
  }
  
  return { phone: null, priority: 0 };
}

// Alias for backward compatibility
const getBestUkPhone = getBestPriorityPhone;

interface OrchestratorJobData {
  type: 'tick' | 'campaign-replenish';
  campaignId?: string;
}

interface OrchestratorJobResult {
  processed: boolean;
  callsInitiated?: number;
  message?: string;
}

let orchestratorQueue: Queue<OrchestratorJobData> | null = null;
let orchestratorWorker: Worker<OrchestratorJobData> | null = null;

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

/**
 * STARTUP RESUME: Reset ALL in_progress items immediately on server start
 * This ensures campaigns can continue after a server restart/crash
 */
async function startupResumeStuckCalls(): Promise<void> {
  try {
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
 * WATCHDOG: Reset stuck in_progress items that haven't been updated for 3+ minutes
 * This self-heals when calls fail silently or webhooks never arrive
 */
async function resetStuckItems(): Promise<number> {
  try {
    const cutoffTime = new Date(Date.now() - STUCK_ITEM_TIMEOUT_MS);
    
    // Find and reset stuck items
    const result = await db.execute(sql`
      UPDATE campaign_queue 
      SET status = 'queued', 
          next_attempt_at = NOW() + INTERVAL '30 seconds',
          enqueued_reason = COALESCE(enqueued_reason, '') || '|watchdog_reset:' || to_char(NOW(), 'HH24:MI:SS'),
          updated_at = NOW()
      WHERE status = 'in_progress'
        AND updated_at < ${cutoffTime}
      RETURNING id
    `);
    
    const resetCount = result.rows?.length || 0;
    if (resetCount > 0) {
      console.log(`[AI Orchestrator] WATCHDOG: Reset ${resetCount} stuck in_progress items (stale > 3min)`);
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
 */
async function getQueuedItems(campaignId: string, limit: number): Promise<any[]> {
  const now = new Date();
  
  // Fetch queue items with contact data including country for timezone resolution
  // IMPORTANT: Excludes contacts already called today to avoid Telnyx D66 daily limits
  // Uses contact_id matching (more reliable than phone matching for retries/updates)
  // Compute business hours eligibility in SQL using contact's timezone
  // Prioritize contacts currently within their local business hours
  const result = await db.execute(sql`
    SELECT cq.*, 
      c.direct_phone_e164,
      c.mobile_phone_e164,
      c.country,
      c.state,
      c.timezone,
      c.first_name as contact_first_name,
      c.last_name as contact_last_name,
      c.email as contact_email,
      c.job_title as contact_job_title,
      a.name as account_name,
      -- Infer timezone from: explicit timezone > country > phone prefix
      COALESCE(
        c.timezone,
        CASE 
          WHEN UPPER(c.country) IN ('GB', 'UK', 'UNITED KINGDOM', 'ENGLAND', 'SCOTLAND', 'WALES') THEN 'Europe/London'
          WHEN UPPER(c.country) IN ('US', 'USA', 'UNITED STATES', 'AMERICA') THEN 'America/New_York'
          WHEN UPPER(c.country) IN ('CA', 'CANADA') THEN 'America/Toronto'
          WHEN c.mobile_phone_e164 LIKE '+44%' OR c.direct_phone_e164 LIKE '+44%' THEN 'Europe/London'
          WHEN c.mobile_phone_e164 LIKE '+1%' OR c.direct_phone_e164 LIKE '+1%' THEN 'America/New_York'
          ELSE NULL
        END
      ) as inferred_timezone,
      -- Compute if contact is within business hours (Mon-Fri 9am-5pm local time)
      -- Uses explicit timezone, or infers from country/phone prefix
      CASE 
        WHEN c.timezone IS NOT NULL 
             AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = c.timezone)
        THEN (
          EXTRACT(DOW FROM NOW() AT TIME ZONE c.timezone) BETWEEN 1 AND 5
          AND EXTRACT(HOUR FROM NOW() AT TIME ZONE c.timezone) BETWEEN 9 AND 16
        )
        -- UK (from country or phone)
        WHEN UPPER(c.country) IN ('GB', 'UK', 'UNITED KINGDOM', 'ENGLAND', 'SCOTLAND', 'WALES')
             OR c.mobile_phone_e164 LIKE '+44%' OR c.direct_phone_e164 LIKE '+44%'
        THEN (
          EXTRACT(DOW FROM NOW() AT TIME ZONE 'Europe/London') BETWEEN 1 AND 5
          AND EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Europe/London') BETWEEN 9 AND 16
        )
        -- USA (from country or phone) - use Eastern as default, most business
        WHEN UPPER(c.country) IN ('US', 'USA', 'UNITED STATES', 'AMERICA')
             OR (c.mobile_phone_e164 LIKE '+1%' AND LENGTH(c.mobile_phone_e164) = 12)
             OR (c.direct_phone_e164 LIKE '+1%' AND LENGTH(c.direct_phone_e164) = 12)
        THEN (
          EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/New_York') BETWEEN 1 AND 5
          AND EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/New_York') BETWEEN 9 AND 16
        )
        -- Canada (from country)
        WHEN UPPER(c.country) IN ('CA', 'CANADA')
        THEN (
          EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Toronto') BETWEEN 1 AND 5
          AND EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Toronto') BETWEEN 9 AND 16
        )
        ELSE false
      END as within_hours,
      CASE 
        -- UK mobile (highest priority)
        WHEN c.mobile_phone_e164 LIKE '+447%' THEN 1
        WHEN c.direct_phone_e164 LIKE '+447%' THEN 2
        -- UK landline
        WHEN c.mobile_phone_e164 LIKE '+441%' OR c.mobile_phone_e164 LIKE '+442%' OR c.mobile_phone_e164 LIKE '+443%' THEN 3
        WHEN c.direct_phone_e164 LIKE '+441%' OR c.direct_phone_e164 LIKE '+442%' OR c.direct_phone_e164 LIKE '+443%' THEN 4
        -- USA/Canada (+1)
        WHEN c.mobile_phone_e164 LIKE '+1%' AND LENGTH(c.mobile_phone_e164) = 12 THEN 5
        WHEN c.direct_phone_e164 LIKE '+1%' AND LENGTH(c.direct_phone_e164) = 12 THEN 6
        -- Other countries with phone numbers
        WHEN c.mobile_phone_e164 IS NOT NULL THEN 10
        WHEN c.direct_phone_e164 IS NOT NULL THEN 11
        ELSE 99
      END as phone_priority
    FROM campaign_queue cq
    LEFT JOIN contacts c ON c.id = cq.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE cq.campaign_id = ${campaignId}
      AND cq.status = 'queued'
      AND (cq.next_attempt_at IS NULL OR cq.next_attempt_at <= NOW())
      AND (c.direct_phone_e164 IS NOT NULL OR c.mobile_phone_e164 IS NOT NULL)
      -- Exclude contacts already called today (Telnyx D66 daily limit protection)
      -- Match by contact_id first (reliable), then by phone number (catches manual imports)
      AND NOT EXISTS (
        SELECT 1 FROM call_sessions cs 
        WHERE cs.created_at >= CURRENT_DATE
          AND cs.agent_type = 'ai'
          AND (
            cs.contact_id = cq.contact_id
            OR cs.to_number_e164 = c.direct_phone_e164 
            OR cs.to_number_e164 = c.mobile_phone_e164
          )
      )
    ORDER BY within_hours DESC, phone_priority ASC, cq.priority DESC, cq.created_at ASC
    LIMIT ${limit * 3}
  `);
  
  return result.rows as any[];
}

/**
 * Process a single campaign - initiate calls to maintain concurrency
 */
async function processCampaign(campaignId: string): Promise<{ initiated: number; skipped: number }> {
  const campaign = await storage.getCampaign(campaignId);
  if (!campaign) {
    console.log(`[AI Orchestrator] Campaign ${campaignId} not found`);
    return { initiated: 0, skipped: 0 };
  }

  // Check campaign is still active and in ai_agent mode
  if (campaign.status !== 'active' || campaign.dialMode !== 'ai_agent') {
    console.log(`[AI Orchestrator] Campaign ${campaignId} not active/ai_agent (status=${campaign.status}, mode=${campaign.dialMode})`);
    return { initiated: 0, skipped: 0 };
  }

  // Note: Business hours are now checked per-contact based on their country/timezone
  // No global campaign-level check - we filter contacts individually below

  const aiSettings = campaign.aiAgentSettings as AiAgentSettings;
  if (!aiSettings) {
    console.log(`[AI Orchestrator] Campaign ${campaignId} has no AI settings`);
    return { initiated: 0, skipped: 0 };
  }

  // Fetch assigned virtual agent for this campaign
  const virtualAgent = await getCampaignVirtualAgent(campaignId);
  if (virtualAgent) {
    console.log(`[AI Orchestrator] Using virtual agent: ${virtualAgent.name} (${virtualAgent.externalAgentId || 'no external ID'})`);
  }

  const fromNumber = process.env.TELNYX_FROM_NUMBER;
  if (!fromNumber) {
    console.log(`[AI Orchestrator] No TELNYX_FROM_NUMBER configured`);
    return { initiated: 0, skipped: 0 };
  }

  // Get current in-progress count
  const inProgressCount = await getInProgressCount(campaignId);
  const maxConcurrent = (aiSettings as any).maxConcurrentCalls || DEFAULT_MAX_CONCURRENT_CALLS;
  const slotsAvailable = maxConcurrent - inProgressCount;

  console.log(`[AI Orchestrator] Campaign ${campaignId}: ${inProgressCount}/${maxConcurrent} in progress, ${slotsAvailable} slots available`);

  if (slotsAvailable <= 0) {
    return { initiated: 0, skipped: 0 };
  }

  // Get queued items
  const queueItems = await getQueuedItems(campaignId, slotsAvailable);
  console.log(`[AI Orchestrator] Found ${queueItems.length} queued items for campaign ${campaignId}`);
  if (queueItems.length === 0) {
    return { initiated: 0, skipped: 0 };
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

  // 5. Batch fetch contacts for phone validation
  const contactIdsToFetch = queueItems.filter(item => item.contactId).map(item => item.contactId);
  const contactsMap = new Map<string, any>();
  if (contactIdsToFetch.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < contactIdsToFetch.length; i += batchSize) {
      const batch = contactIdsToFetch.slice(i, i + batchSize);
      const contactsResult = await db.select({
        id: contacts.id,
        directPhone: contacts.directPhone,
        directPhoneE164: contacts.directPhoneE164,
        mobilePhone: contacts.mobilePhone,
        mobilePhoneE164: contacts.mobilePhoneE164,
        country: contacts.country,
      }).from(contacts).where(inArray(contacts.id, batch));
      for (const contact of contactsResult) {
        contactsMap.set(contact.id, contact);
      }
    }
  }

  // Filter eligible items - check business hours per contact based on country
  const eligibleItems: any[] = [];
  let skipped = 0;
  let noPhone = 0;
  let outsideBusinessHours = 0;

  // Build prioritized list with phone priority scores
  const candidateItems: Array<{ item: any; phone: string; priority: number; contact: any }> = [];
  
  // Track timezone stats for logging
  const timezoneStats = new Map<string, { total: number; callable: number }>();

  for (const item of queueItems) {
    let contact: any = null;
    let phone: string | null = null;
    let priority = 0;
    
    // Queue items now include phone and country data from the JOIN query
    const mobilePhone = (item as any).mobile_phone_e164;
    const directPhone = (item as any).direct_phone_e164;
    const country = (item as any).country;
    const state = (item as any).state;
    const timezone = (item as any).timezone;
    
    // Check business hours for this contact's timezone/country FIRST
    // Use stored timezone if available, fall back to country/state detection
    const bizHoursCheck = isContactWithinBusinessHours({ country, state, timezone });
    const tzKey = bizHoursCheck.timezone || 'unknown';
    
    // Track timezone stats
    if (!timezoneStats.has(tzKey)) {
      timezoneStats.set(tzKey, { total: 0, callable: 0 });
    }
    const tzStat = timezoneStats.get(tzKey)!;
    tzStat.total++;
    
    if (!bizHoursCheck.canCall) {
      outsideBusinessHours++;
      // Don't remove from queue - just skip for now (will be tried next time during their business hours)
      // Log reason for first few skips of each timezone
      if (tzStat.total <= 3) {
        console.log(`[AI Orchestrator] Skipping contact (${bizHoursCheck.reason})`);
      }
      continue;
    }
    
    tzStat.callable++;
    
    // Prioritize mobile over direct
    if (mobilePhone && getUkPhonePriority(mobilePhone) > 0) {
      phone = mobilePhone;
      priority = getUkPhonePriority(mobilePhone);
    } else if (directPhone && getUkPhonePriority(directPhone) > 0) {
      phone = directPhone;
      priority = getUkPhonePriority(directPhone);
    } else if (mobilePhone) {
      // Non-UK mobile
      phone = mobilePhone;
      priority = 5;
    } else if (directPhone) {
      // Non-UK direct
      phone = directPhone;
      priority = 6;
    }
    
    // Fallback to contact lookup if phone not in query result
    if (!phone && item.contactId && contactsMap.has(item.contactId)) {
      contact = contactsMap.get(item.contactId);
      const ukPhone = getBestUkPhone(contact);
      if (ukPhone.priority > 0) {
        phone = ukPhone.phone;
        priority = ukPhone.priority;
      } else if (contact.mobilePhoneE164) {
        phone = contact.mobilePhoneE164;
        priority = 5;
      } else if (contact.directPhoneE164) {
        phone = contact.directPhoneE164;
        priority = 6;
      }
    }
    
    // Skip contacts without valid phone numbers
    if (!phone) {
      noPhone++;
      continue;
    }

    const normalized = phone.replace(/[^\d+]/g, '');
    let e164 = normalized.startsWith('+') ? normalized : '+' + normalized.replace(/^0+/, '');
    
    // Fix US/Canada numbers: if it's +X where X is 10 digits starting with 2-9, add the 1
    // NANP format: +1 followed by 10 digits (area code starts with 2-9)
    if (e164.match(/^\+[2-9]\d{9}$/)) {
      e164 = '+1' + e164.substring(1);
    }

    // Check suppression
    if (item.contactId && suppressionResults.get(item.contactId)) {
      await db.execute(sql`UPDATE campaign_queue SET status = 'removed', removed_reason = 'suppressed', updated_at = NOW() WHERE id = ${item.id}`);
      skipped++;
      continue;
    }

    // Check DNC
    if (dncPhones.has(e164)) {
      await db.execute(sql`UPDATE campaign_queue SET status = 'removed', removed_reason = 'dnc', updated_at = NOW() WHERE id = ${item.id}`);
      skipped++;
      continue;
    }

    // Check account suppression
    if (item.accountId && suppressedAccountIds.has(item.accountId)) {
      await db.execute(sql`UPDATE campaign_queue SET status = 'removed', removed_reason = 'account_suppressed', updated_at = NOW() WHERE id = ${item.id}`);
      skipped++;
      continue;
    }

    // Add to candidates with priority and country info
    candidateItems.push({ item: { ...item, _country: country, _timezone: tzKey }, phone: e164, priority, contact });
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
  
  // Log business hours filtering by timezone
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
    return { initiated: 0, skipped };
  }

  // Initiate calls in parallel batches
  const bridge = getTelnyxAiBridge();
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
    
    const batchPromises = batch.map(async (item) => {
      try {
        // Use resolved phone from compliance check
        const phoneNumber = item._resolvedPhone || item.dialedNumber || item.phone || item.phoneNumber;
        const contactId = item.contact_id || item.contactId;

        // CRITICAL: Skip items without contact_id - they can't be tracked properly
        if (!contactId) {
          console.warn(`[AI Orchestrator] Skipping queue item ${item.id} - missing contact_id`);
          return { success: false, itemId: item.id, error: 'missing_contact_id' };
        }

        // Contact data comes from the SQL query (snake_case)
        // Use virtual agent name if available, fall back to aiSettings persona
        const agentName = virtualAgent?.name || aiSettings.persona?.name || "your representative";
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
        };

        const callResult = await bridge.initiateAiCall(phoneNumber, fromNumber, aiSettings, context);
        const conversationId = callResult?.callControlId || callResult?.callId || '';

        // Mark as in_progress and store conversation_id for webhook lookup
        await db.execute(sql`
          UPDATE campaign_queue 
          SET status = 'in_progress', 
              updated_at = NOW(),
              enqueued_reason = COALESCE(enqueued_reason, '') || ' ai_conv:' || ${conversationId}
          WHERE id = ${item.id}
        `);

        return { success: true, itemId: item.id, conversationId };
      } catch (error: any) {
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
    });

    const results = await Promise.all(batchPromises);
    const batchSuccess = results.filter(r => r.success).length;
    initiated += batchSuccess;

    console.log(`[AI Orchestrator] Batch ${Math.floor(i / PARALLEL_CALL_BATCH_SIZE) + 1}: ${batchSuccess}/${batch.length} calls initiated (total: ${initiated}/${eligibleItems.length})`);

    // Check if any result has a fatal error - if so, stop processing this campaign
    const fatalResult = results.find((r: any) => r.fatalError);
    if (fatalResult) {
      console.log(`[AI Orchestrator] Stopping campaign ${campaignId} processing due to fatal Telnyx error`);
      return { initiated, skipped, fatalError: true };
    }

    // Short delay between batches to avoid rate limits
    if (i + PARALLEL_CALL_BATCH_SIZE < eligibleItems.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CALLS_MS));
    }
  }

  return { initiated, skipped };
}

/**
 * Main orchestrator tick - check all active AI campaigns
 */
async function orchestratorTick(): Promise<OrchestratorJobResult> {
  try {
    // WATCHDOG: First, reset any stuck items before processing
    const stuckReset = await resetStuckItems();
    
    // Get all active ai_agent campaigns
    const campaigns = await storage.getCampaigns({ status: 'active', dialMode: 'ai_agent' });
    
    if (campaigns.length === 0) {
      return { processed: true, message: 'No active AI campaigns' };
    }

    console.log(`[AI Orchestrator] Processing ${campaigns.length} active AI campaign(s)${stuckReset > 0 ? ` (watchdog freed ${stuckReset} slots)` : ''}`);

    let totalInitiated = 0;
    for (const campaign of campaigns) {
      const result = await processCampaign(campaign.id);
      totalInitiated += result.initiated;
    }

    return { 
      processed: true, 
      callsInitiated: totalInitiated,
      message: `Processed ${campaigns.length} campaigns, initiated ${totalInitiated} calls`
    };
  } catch (error) {
    console.error('[AI Orchestrator] Tick error:', error);
    return { processed: false, message: String(error) };
  }
}

/**
 * Initialize the AI Campaign Orchestrator
 */
export function initializeAiCampaignOrchestrator(): void {
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
        return orchestratorTick();
      } else if (job.data.type === 'campaign-replenish' && job.data.campaignId) {
        const result = await processCampaign(job.data.campaignId);
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
    return;
  }

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

  // Run startup resume to clear any stuck items from previous server instance
  startupResumeStuckCalls().catch(err => {
    console.error('[AI Orchestrator] Startup resume failed:', err);
  });

  console.log('[AI Orchestrator] Initialized successfully');
}

/**
 * Trigger immediate replenishment for a campaign
 * Called by webhook handler after a call completes
 */
export async function triggerCampaignReplenish(campaignId: string): Promise<void> {
  if (!orchestratorQueue) {
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
}> {
  if (!orchestratorQueue) {
    return { available: false };
  }

  try {
    const [activeCount, waitingCount] = await Promise.all([
      orchestratorQueue.getActiveCount(),
      orchestratorQueue.getWaitingCount(),
    ]);
    return { available: true, activeJobs: activeCount, waitingJobs: waitingCount };
  } catch {
    return { available: false };
  }
}
