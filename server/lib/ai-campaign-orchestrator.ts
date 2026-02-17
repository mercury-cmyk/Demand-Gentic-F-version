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
  getBusinessHoursForCountry
} from '../utils/business-hours';
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
import { isNumberPoolEnabled } from '../services/number-pool';
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
const STUCK_ITEM_TIMEOUT_MS = 300000; // 5 minutes - reduced to catch stuck calls faster while still allowing legitimate long conversations
const EMPTY_POOL_RECHECK_SECONDS = Math.max(15, Number(process.env.NUMBER_POOL_EMPTY_RECHECK_SECONDS || 60));
const EMPTY_POOL_RECHECK_MS = EMPTY_POOL_RECHECK_SECONDS * 1000;
const ACTIVE_POOL_CACHE_TTL_MS = 30000;
const ORCHESTRATOR_HEARTBEAT_MS = Math.max(30000, ORCHESTRATOR_INTERVAL_MS * 3);

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
function isTelnyxFatalError(error: any): { code: number; detail: string; isWhitelist?: boolean } | null {
  if (!error || !error.message) return null;

  const message = String(error.message);

  // Check for our enriched error format from telnyx-ai-bridge.ts
  if (message.includes('Telnyx Whitelist Error:')) {
    return { code: 10010, detail: message.replace('Telnyx Whitelist Error: ', ''), isWhitelist: true };
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
          return { code: err.code, detail: err.detail || 'Unknown error', isWhitelist };
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

/**
 * Enabled calling regions/countries
 * Calls are enabled for: Australia, Middle East, North America (US/Canada), United Kingdom, Europe, Asia, LATAM
 */
const ENABLED_CALLING_REGIONS: Record<string, boolean> = {
  // Australia / NZ
  'AU': true, 'AUSTRALIA': true,
  'NZ': true, 'NEW ZEALAND': true,
  
  // Middle East (Sun-Thu work week)
  'AE': true, 'UNITED ARAB EMIRATES': true, 'UAE': true, 'DUBAI': true,
  'SA': true, 'SAUDI ARABIA': true,
  'IL': true, 'ISRAEL': true,
  'QA': true, 'QATAR': true,
  'KW': true, 'KUWAIT': true,
  'BH': true, 'BAHRAIN': true,
  'OM': true, 'OMAN': true,
  
  // North America
  'US': true, 'USA': true, 'UNITED STATES': true, 'AMERICA': true,
  'CA': true, 'CANADA': true,
  'MX': true, 'MEXICO': true,
  
  // United Kingdom / Ireland (including common data variants)
  'GB': true, 'UK': true, 'UNITED KINGDOM': true, 'UNITED KINGDOM UK': true, 
  'ENGLAND': true, 'SCOTLAND': true, 'WALES': true,
  'IE': true, 'IRELAND': true,
  
  // Europe (Major Markets)
  'DE': true, 'GERMANY': true,
  'FR': true, 'FRANCE': true,
  'IT': true, 'ITALY': true,
  'ES': true, 'SPAIN': true,
  'NL': true, 'NETHERLANDS': true,
  'BE': true, 'BELGIUM': true,
  'CH': true, 'SWITZERLAND': true,
  'AT': true, 'AUSTRIA': true,
  'SE': true, 'SWEDEN': true,
  'NO': true, 'NORWAY': true,
  'DK': true, 'DENMARK': true,
  'FI': true, 'FINLAND': true,
  'PL': true, 'POLAND': true,
  'PT': true, 'PORTUGAL': true,
  'CZ': true, 'CZECHIA': true, 'CZECH REPUBLIC': true,
  'GR': true, 'GREECE': true,

  // Asia / Pacific
  'SG': true, 'SINGAPORE': true,
  'HK': true, 'HONG KONG': true,
  'JP': true, 'JAPAN': true,
  'KR': true, 'SOUTH KOREA': true,
  'IN': true, 'INDIA': true,
  'CN': true, 'CHINA': true,
  'TW': true, 'TAIWAN': true,
  'MY': true, 'MALAYSIA': true,
  'PH': true, 'PHILIPPINES': true,
  'TH': true, 'THAILAND': true,
  'VN': true, 'VIETNAM': true,
  'ID': true, 'INDONESIA': true,

  // South America / LATAM
  'BR': true, 'BRAZIL': true,
  'AR': true, 'ARGENTINA': true,
  'CL': true, 'CHILE': true,
  'CO': true, 'COLOMBIA': true,
  'PE': true, 'PERU': true,

  // Africa
  'ZA': true, 'SOUTH AFRICA': true,
};

/**
 * Normalize country name to handle common typos and variations
 * Maps typos/variations to canonical country names that exist in ENABLED_CALLING_REGIONS
 */
function normalizeCountryName(country: string): string {
  const normalized = country.toUpperCase().trim();

  // Common typos and variations mapping to canonical names
  const COUNTRY_TYPOS: Record<string, string> = {
    // United States typos
    'UNITEDF STATES': 'UNITED STATES',
    'UNITEDSTATES': 'UNITED STATES',
    'UNITED STATE': 'UNITED STATES',
    'UNTED STATES': 'UNITED STATES',
    'UNITD STATES': 'UNITED STATES',
    'UNTIED STATES': 'UNITED STATES',
    'UITED STATES': 'UNITED STATES',
    'U.S.A.': 'USA',
    'U.S.A': 'USA',
    'U.S.': 'US',
    'U.S': 'US',
    'UNITED STATES OF AMERICA': 'UNITED STATES',

    // United Kingdom typos
    'UITED KINGDOM': 'UNITED KINGDOM',
    'UNTED KINGDOM': 'UNITED KINGDOM',
    'UNITD KINGDOM': 'UNITED KINGDOM',
    'UNITED KINGDON': 'UNITED KINGDOM',
    'UNITED KINGOM': 'UNITED KINGDOM',
    'UNITEDKINGDOM': 'UNITED KINGDOM',
    'U.K.': 'UK',
    'U.K': 'UK',
    'GREAT BRITAIN': 'UNITED KINGDOM',
    'BRITAIN': 'UNITED KINGDOM',

    // Other common typos
    'AUSTRLIA': 'AUSTRALIA',
    'AUSTRALA': 'AUSTRALIA',
    'AUSTALIA': 'AUSTRALIA',
    'CANDA': 'CANADA',
    'CANANDA': 'CANADA',
    'GEMANY': 'GERMANY',
    'GERAMNY': 'GERMANY',
    'FRNCE': 'FRANCE',
    'INDAI': 'INDIA',
  };

  return COUNTRY_TYPOS[normalized] || normalized;
}

/**
 * Check if a contact's country is in an enabled calling region
 * Handles various formats: "Indonesia", "indonesia", " Indonesia ", "id", "ID", etc.
 */
function isCountryEnabled(country: string | null | undefined): boolean {
  if (!country) return false;
  
  // Clean/normalize common data variants e.g. "United Kingdom (UK)", "U.S.A.", etc.
  const raw = country.toString().trim().toUpperCase();
  if (!raw) return false;

  const noParens = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const alnumOnly = raw.replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const candidates = Array.from(new Set([raw, noParens, alnumOnly].filter(Boolean)));

  // Try direct and typo-normalized forms
  for (const cleaned of candidates) {
    if (ENABLED_CALLING_REGIONS[cleaned] === true) return true;
    const normalizedCountry = normalizeCountryName(cleaned);
    if (ENABLED_CALLING_REGIONS[normalizedCountry] === true) return true;
  }
  
  // Try common long-form to short-form mappings
  const COUNTRY_ALIASES: Record<string, string> = {
    'REPUBLIC OF INDONESIA': 'INDONESIA',
    'REPUBLIC OF INDIA': 'INDIA',
    'PEOPLE\'S REPUBLIC OF CHINA': 'CHINA',
    'REPUBLIC OF CHINA': 'TAIWAN',
    'KINGDOM OF SAUDI ARABIA': 'SAUDI ARABIA',
    'KINGDOM OF BAHRAIN': 'BAHRAIN',
    'STATE OF QATAR': 'QATAR',
    'STATE OF KUWAIT': 'KUWAIT',
    'SULTANATE OF OMAN': 'OMAN',
    'COMMONWEALTH OF AUSTRALIA': 'AUSTRALIA',
    'NEW SOUTH WALES': 'AUSTRALIA',
    'VICTORIA': 'AUSTRALIA',
    'QUEENSLAND': 'AUSTRALIA',
    'ENGLAND': 'UNITED KINGDOM',
    'NORTHERN IRELAND': 'UNITED KINGDOM',
    'SCOTLAND': 'UNITED KINGDOM',
    'WALES': 'UNITED KINGDOM',
    'HONG KONG SAR': 'HONG KONG',
    'HONG KONG S.A.R.': 'HONG KONG',
    'MACAO': 'HONG KONG',
    'MACAU': 'HONG KONG',
  };
  
  for (const cleaned of candidates) {
    if (COUNTRY_ALIASES[cleaned]) {
      const aliased = COUNTRY_ALIASES[cleaned];
      if (ENABLED_CALLING_REGIONS[aliased] === true) return true;
    }
  }
  
  return false;
}

/**
 * Infer country from E.164 phone prefix when country metadata is missing.
 * Returns canonical country name/code used by ENABLED_CALLING_REGIONS, or null.
 */
function inferCountryFromPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/[^\d+]/g, '');
  let e164 = digits;
  if (e164.startsWith('00')) {
    e164 = `+${e164.slice(2)}`;
  } else if (!e164.startsWith('+') && /^\d+$/.test(e164)) {
    // Best-effort normalization for raw numeric international strings.
    if (e164.startsWith('971')) e164 = `+${e164}`;
    else if (e164.startsWith('44')) e164 = `+${e164}`;
    else if (e164.startsWith('1')) e164 = `+${e164}`;
  }
  if (!e164.startsWith('+')) return null;

  const prefixMap: Array<{ prefix: string; country: string }> = [
    { prefix: '+971', country: 'AE' }, { prefix: '+966', country: 'SA' }, { prefix: '+972', country: 'IL' },
    { prefix: '+974', country: 'QA' }, { prefix: '+965', country: 'KW' }, { prefix: '+973', country: 'BH' },
    { prefix: '+968', country: 'OM' }, { prefix: '+886', country: 'TW' }, { prefix: '+852', country: 'HK' },
    { prefix: '+420', country: 'CZ' }, { prefix: '+358', country: 'FI' }, { prefix: '+353', country: 'IE' },
    { prefix: '+351', country: 'PT' }, { prefix: '+972', country: 'IL' },
    { prefix: '+971', country: 'AE' },
    { prefix: '+44', country: 'GB' }, { prefix: '+1', country: 'US' }, { prefix: '+61', country: 'AU' },
    { prefix: '+64', country: 'NZ' }, { prefix: '+65', country: 'SG' }, { prefix: '+81', country: 'JP' },
    { prefix: '+82', country: 'KR' }, { prefix: '+91', country: 'IN' }, { prefix: '+86', country: 'CN' },
    { prefix: '+60', country: 'MY' }, { prefix: '+63', country: 'PH' }, { prefix: '+66', country: 'TH' },
    { prefix: '+84', country: 'VN' }, { prefix: '+62', country: 'ID' }, { prefix: '+55', country: 'BR' },
    { prefix: '+54', country: 'AR' }, { prefix: '+56', country: 'CL' }, { prefix: '+57', country: 'CO' },
    { prefix: '+51', country: 'PE' }, { prefix: '+27', country: 'ZA' }, { prefix: '+49', country: 'DE' },
    { prefix: '+33', country: 'FR' }, { prefix: '+39', country: 'IT' }, { prefix: '+34', country: 'ES' },
    { prefix: '+31', country: 'NL' }, { prefix: '+32', country: 'BE' }, { prefix: '+41', country: 'CH' },
    { prefix: '+43', country: 'AT' }, { prefix: '+46', country: 'SE' }, { prefix: '+47', country: 'NO' },
    { prefix: '+45', country: 'DK' }, { prefix: '+48', country: 'PL' }, { prefix: '+30', country: 'GR' },
    { prefix: '+52', country: 'MX' },
  ];

  // Prefer longest prefix matches first
  prefixMap.sort((a, b) => b.prefix.length - a.prefix.length);
  const match = prefixMap.find(p => e164.startsWith(p.prefix));
  return match?.country ?? null;
}

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
          WHEN UPPER(c.country) IN ('GB', 'UK', 'UNITED KINGDOM', 'UNITED KINGDOM UK', 'ENGLAND', 'SCOTLAND', 'WALES') THEN 'Europe/London'
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
        WHEN UPPER(c.country) IN ('GB', 'UK', 'UNITED KINGDOM', 'UNITED KINGDOM UK', 'ENGLAND', 'SCOTLAND', 'WALES')
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
    ORDER BY within_hours DESC, cq.ai_priority_score DESC NULLS LAST, phone_priority ASC, cq.priority DESC, cq.created_at ASC
    LIMIT ${limit * 3}
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
async function processCampaign(campaignId: string, options?: ProcessCampaignOptions): Promise<{ initiated: number; skipped: number; fatalError?: boolean }> {
  // Guard: in dev, calls blocked by default — must be enabled in Telephony settings. Production always allows calls.
  if (process.env.NODE_ENV !== 'production' && process.env.CALL_EXECUTION_ENABLED !== 'true') {
    await setOrchestratorStallReason(campaignId, 'Call execution disabled. Go to Settings > Telephony and enable call execution.');
    return { initiated: 0, skipped: 0 };
  }

  // Clear stale "call execution disabled" stall reason if execution is now allowed
  // (handles case where stall reason was set in dev and persists after deploying to production)
  const existingCampaign = await storage.getCampaign(campaignId);
  if (existingCampaign?.lastStallReason?.includes('Call execution disabled')) {
    await setOrchestratorStallReason(campaignId, null);
  }

  const campaign = existingCampaign;
  if (!campaign) {
    console.log(`[AI Orchestrator] Campaign ${campaignId} not found`);
    return { initiated: 0, skipped: 0 };
  }

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

  // Get current in-progress count
  const inProgressCount = await getInProgressCount(campaignId);
  const { defaultMax } = await getConcurrencyLimits();
  const maxConcurrent = (aiSettings as any).maxConcurrentCalls || defaultMax;
  const campaignSlots = Math.max(0, maxConcurrent - inProgressCount);
  const requestedSlots = typeof options?.maxNewCalls === 'number'
    ? Math.max(0, Math.floor(options.maxNewCalls))
    : campaignSlots;
  const slotsAvailable = Math.min(campaignSlots, requestedSlots);

  console.log(`[AI Orchestrator] Campaign ${campaignId}: ${inProgressCount}/${maxConcurrent} in progress, ${campaignSlots} campaign slots, ${slotsAvailable} allowed by request`);

  if (slotsAvailable <= 0) {
    return { initiated: 0, skipped: 0 };
  }

  // Get queued items
  const queueItems = await getQueuedItems(campaignId, slotsAvailable);
  console.log(`[AI Orchestrator] Found ${queueItems.length} queued items for campaign ${campaignId}`);
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
  let countryNotEnabled = 0;

  // Build prioritized list with phone priority scores
  const candidateItems: Array<{ item: any; phone: string; priority: number; contact: any }> = [];
  
  // Track timezone stats for logging
  const timezoneStats = new Map<string, { total: number; callable: number }>();
  
  // Track rejected countries for debugging
  const rejectedCountries = new Map<string, number>();

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
    const inferredTimezone = (item as any).inferred_timezone;
    const geoPhone = mobilePhone || directPhone;
    const normalizedCountry = typeof country === 'string' ? country.trim() : country;
    const inferredCountry = inferCountryFromPhone(geoPhone);

    // Be resilient to bad/missing country metadata:
    // if stored country is missing or not enabled, trust phone-derived country when possible.
    let effectiveCountry: string | null = (normalizedCountry as string) || null;
    if (!effectiveCountry && inferredCountry) {
      effectiveCountry = inferredCountry;
    } else if (effectiveCountry && !isCountryEnabled(effectiveCountry) && inferredCountry && isCountryEnabled(inferredCountry)) {
      effectiveCountry = inferredCountry;
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
    
    // Check if country is in enabled calling regions
    if (!isCountryEnabled(effectiveCountry)) {
      countryNotEnabled++;
      // Track which countries are being rejected
      const countryKey = effectiveCountry ? String(effectiveCountry).toUpperCase() : 'NULL/EMPTY';
      rejectedCountries.set(countryKey, (rejectedCountries.get(countryKey) || 0) + 1);
      continue; // Skip contacts from disabled regions
    }
    
    // Check business hours for this contact's timezone/country FIRST
    // Use stored timezone if available, fall back to country/state detection
    const bizHoursCheck = isContactWithinBusinessHours({
      country: effectiveCountry,
      state,
      timezone: effectiveTimezone,
    });
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
    await setOrchestratorStallReason(campaignId, 'All contacts filtered (business hours/compliance). Calls will resume automatically.');
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
               await db.execute(sql`
                UPDATE campaign_queue
                SET status = 'queued',
                    updated_at = NOW(),
                    next_attempt_at = NOW() + INTERVAL '60 seconds',
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
                    next_attempt_at = NOW() + INTERVAL '60 seconds',
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

      // CRITICAL FIX: Reset stuck item immediately if the promise rejected (e.g. timeout)
      try {
        await db.execute(sql`
          UPDATE campaign_queue
          SET status = 'queued',
              removed_reason = ${String(reason).substring(0, 255)},
              next_attempt_at = NOW() + INTERVAL '1 minute',
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

    // Check if ALL items in batch were skipped due to pool busy — stop processing to avoid tight loop
    const allSkipped = results.every((r: any) => r && !r.success);
    const poolBusyCount = results.filter((r: any) => r && r.skipped).length;
    if (allSkipped && poolBusyCount > 0 && batchSuccess === 0) {
      console.warn(`[AI Orchestrator] 🚫 ALL ${batch.length} items in batch skipped (${poolBusyCount} pool-busy) — stopping campaign ${campaignId} to avoid spin loop`);
      await setOrchestratorStallReason(campaignId, 'All phone numbers busy. Calls will resume when numbers become available.');
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
    const staleLocksCleaned = cleanupStaleLocks(10); // Clean locks older than 10 minutes
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
      const [activeCount, waitingCount] = await Promise.all([
        orchestratorQueue.getActiveCount(),
        orchestratorQueue.getWaitingCount(),
      ]);

      const now = Date.now();
      const staleTick = now - lastOrchestratorTickAt > ORCHESTRATOR_HEARTBEAT_MS;
      const queueIdle = activeCount === 0 && waitingCount === 0;

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
        console.warn(`[AI Orchestrator] Heartbeat enqueued rescue tick (staleTick=${staleTick}, queueIdle=${queueIdle})`);
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
