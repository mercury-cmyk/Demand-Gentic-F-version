/**
 * Autonomous AI Dialer Service
 *
 * Server-side autonomous calling engine that reads `maxConcurrentWorkers` from
 * each active AI campaign and maintains that many concurrent Telnyx outbound
 * calls with Gemini Live AI — no browser tabs required.
 *
 * Flow:
 * 1. Polls for active AI campaigns (`status = 'active'`, `dialMode = 'ai_agent'`)
 * 2. For each campaign: reads `maxConcurrentWorkers`, checks current active count
 * 3. If slots available: pulls queue items (timezone, business hours, suppression)
 * 4. For each item: buildUnifiedCallContext → storeCallSession → place Telnyx call
 * 5. On call completion (via event): decrement active count, start next call
 *
 * Integrates with:
 * - unified-call-context.ts    → call context building + Redis session storage
 * - number-pool-integration.ts → caller ID rotation
 * - disposition-engine.ts      → call outcome processing
 * - webhooks.ts                → call.hangup event emission
 * - campaign-runner-ws.ts      → queue pulling patterns (timezone, business hours)
 */

import { EventEmitter } from 'events';
import { db } from '../db';
import {
  campaigns,
  campaignQueue,
  contacts,
  accounts,
  virtualAgents,
} from '@shared/schema';
import { eq, and, sql, or, isNull, lte, inArray } from 'drizzle-orm';
import { getBestPhoneForContact } from '../lib/phone-utils';
import {
  detectContactTimezone,
  isWithinBusinessHours,
  getNextAvailableTime,
  getBusinessHoursForCountry,
} from '../utils/business-hours';
import { seedQueuePriorities } from './campaign-timezone-analyzer';
import {
  getCallerIdForCall,
  releaseNumberWithoutOutcome,
  sleep as numberPoolSleep,
} from './number-pool-integration';
import {
  buildUnifiedCallContext,
  contextToClientStateParams,
  storeCallSession,
} from './unified-call-context';

const LOG_PREFIX = '[AutonomousAIDialer]';
const POLL_INTERVAL_MS = 10_000;          // 10 seconds between polling sweeps
const SLOT_FILL_DELAY_MS = 2_000;         // 2 seconds between slot-fill attempts after completion
const MAX_CONSECUTIVE_ERRORS = 5;         // Pause campaign after N consecutive errors
const PRIORITY_REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

// ──────────────────────────────────────────────────────────────────────────────
// Event bus: emitted by webhooks.ts on call.hangup, consumed here
// ──────────────────────────────────────────────────────────────────────────────
export const autonomousDialerEvents = new EventEmitter();
autonomousDialerEvents.setMaxListeners(100);

// ──────────────────────────────────────────────────────────────────────────────
// Enabled calling regions (same as campaign-runner-ws.ts)
// ──────────────────────────────────────────────────────────────────────────────
const ENABLED_CALLING_REGIONS: Record<string, boolean> = {
  'AU': true, 'AUSTRALIA': true,
  'AE': true, 'UNITED ARAB EMIRATES': true, 'UAE': true, 'DUBAI': true,
  'SA': true, 'SAUDI ARABIA': true,
  'IL': true, 'ISRAEL': true,
  'QA': true, 'QATAR': true,
  'KW': true, 'KUWAIT': true,
  'BH': true, 'BAHRAIN': true,
  'OM': true, 'OMAN': true,
  'US': true, 'USA': true, 'UNITED STATES': true, 'AMERICA': true,
  'CA': true, 'CANADA': true,
  'GB': true, 'UK': true, 'UNITED KINGDOM': true, 'ENGLAND': true, 'SCOTLAND': true, 'WALES': true,
};

function isCountryEnabled(country: string | null | undefined): boolean {
  if (!country) return false;
  return ENABLED_CALLING_REGIONS[country.toUpperCase().trim()] === true;
}

function getContactCallPriority(contact: {
  country?: string | null;
  state?: string | null;
  timezone?: string | null;
}): { canCallNow: boolean; priority: number; timezone: string | null; reason?: string } {
  const timezone = detectContactTimezone({
    country: contact.country || undefined,
    state: contact.state || undefined,
    timezone: contact.timezone || undefined,
  });

  if (!timezone) {
    return { canCallNow: false, priority: 0, timezone: null, reason: 'Unknown timezone' };
  }

  const config = getBusinessHoursForCountry(contact.country);
  config.timezone = timezone;
  config.respectContactTimezone = false;

  const canCallNow = isWithinBusinessHours(config, undefined, new Date());
  return {
    canCallNow,
    priority: canCallNow ? 100 : 50,
    timezone,
    reason: canCallNow ? undefined : `Outside business hours (${config.startTime}-${config.endTime} ${timezone})`,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// International call info (same as campaign-test-calls.ts)
// ──────────────────────────────────────────────────────────────────────────────
function getInternationalCallInfo(phoneNumber: string): {
  isInternational: boolean;
  countryCode: string;
  region: string;
  codec: string;
} {
  const cleaned = phoneNumber.replace(/[^+\d]/g, '');

  if (cleaned.startsWith('+1') || cleaned.startsWith('1')) {
    return { isInternational: false, countryCode: '1', region: 'US/Canada', codec: 'PCMU' };
  }

  if (cleaned.startsWith('+44')) return { isInternational: true, countryCode: '44', region: 'United Kingdom', codec: 'PCMA' };
  if (cleaned.startsWith('+61')) return { isInternational: true, countryCode: '61', region: 'Australia', codec: 'PCMA' };
  if (cleaned.startsWith('+971')) return { isInternational: true, countryCode: '971', region: 'UAE', codec: 'PCMA' };
  if (cleaned.startsWith('+966')) return { isInternational: true, countryCode: '966', region: 'Saudi Arabia', codec: 'PCMA' };
  if (cleaned.startsWith('+972')) return { isInternational: true, countryCode: '972', region: 'Israel', codec: 'PCMA' };
  if (cleaned.startsWith('+974')) return { isInternational: true, countryCode: '974', region: 'Qatar', codec: 'PCMA' };
  if (cleaned.startsWith('+965')) return { isInternational: true, countryCode: '965', region: 'Kuwait', codec: 'PCMA' };
  if (cleaned.startsWith('+973')) return { isInternational: true, countryCode: '973', region: 'Bahrain', codec: 'PCMA' };
  if (cleaned.startsWith('+968')) return { isInternational: true, countryCode: '968', region: 'Oman', codec: 'PCMA' };

  return { isInternational: true, countryCode: cleaned.substring(1, 4), region: 'Other', codec: 'PCMA' };
}

// ──────────────────────────────────────────────────────────────────────────────
// Active call tracking
// ──────────────────────────────────────────────────────────────────────────────
interface ActiveCall {
  campaignId: string;
  queueItemId: string;
  contactId: string;
  callControlId?: string;
  telnyxCallSid?: string;
  callerNumberId: string | null;
  startedAt: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Autonomous Dialer Service
// ──────────────────────────────────────────────────────────────────────────────
class AutonomousAIDialerService {
  private activeCalls = new Map<string, ActiveCall>();    // callId → ActiveCall
  private campaignActiveCounts = new Map<string, number>(); // campaignId → active count
  private campaignConfigs = new Map<string, { maxWorkers: number }>(); // campaignId → config
  private consecutiveErrors = new Map<string, number>();  // campaignId → error count
  private pollTimer: NodeJS.Timeout | null = null;
  private lastPriorityRefresh = 0;
  private isRunning = false;
  private isProcessing = false;

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────────
  start(): void {
    if (this.isRunning) {
      console.log(`${LOG_PREFIX} Already running`);
      return;
    }

    // In development, require explicit opt-in
    if (process.env.NODE_ENV !== 'production' && process.env.CALL_EXECUTION_ENABLED !== 'true') {
      console.log(`${LOG_PREFIX} Disabled in dev — set CALL_EXECUTION_ENABLED=true in Telephony settings to enable`);
      return;
    }

    this.isRunning = true;
    console.log(`${LOG_PREFIX} ✅ Started — polling every ${POLL_INTERVAL_MS / 1000}s`);

    // Listen for call completion events from webhooks
    autonomousDialerEvents.on('call_completed', this.handleCallCompleted.bind(this));

    // Initial sweep
    this.pollAndFill().catch(err => console.error(`${LOG_PREFIX} Initial poll error:`, err));

    // Periodic sweep
    this.pollTimer = setInterval(() => {
      this.pollAndFill().catch(err => console.error(`${LOG_PREFIX} Poll error:`, err));
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    autonomousDialerEvents.removeAllListeners('call_completed');
    console.log(`${LOG_PREFIX} Stopped`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Main polling loop
  // ──────────────────────────────────────────────────────────────────────────
  private async pollAndFill(): Promise<void> {
    if (this.isProcessing) return; // prevent re-entrant polling
    this.isProcessing = true;

    try {
      // 1. Find all active AI campaigns
      const activeCampaigns = await db
        .select({
          id: campaigns.id,
          dialMode: campaigns.dialMode,
          status: campaigns.status,
          maxConcurrentWorkers: sql<number>`COALESCE(${campaigns.maxConcurrentWorkers}, 1)`,
          fromNumber: sql<string>`COALESCE(${campaigns.fromNumber}, '')`,
          virtualAgentId: sql<string | null>`${campaigns.virtualAgentId}`,
        })
        .from(campaigns)
        .where(
          and(
            eq(campaigns.status, 'active'),
            eq(campaigns.dialMode, 'ai_agent')
          )
        );

      if (activeCampaigns.length === 0) {
        // No active AI campaigns — clean up stale tracking
        this.campaignConfigs.clear();
        this.campaignActiveCounts.clear();
        this.consecutiveErrors.clear();
        this.isProcessing = false;
        return;
      }

      // Periodic timezone priority refresh
      const now = Date.now();
      if (now - this.lastPriorityRefresh > PRIORITY_REFRESH_INTERVAL) {
        this.lastPriorityRefresh = now;
        for (const c of activeCampaigns) {
          try {
            await seedQueuePriorities(c.id);
          } catch (err) {
            console.error(`${LOG_PREFIX} Failed to refresh priorities for ${c.id}:`, err);
          }
        }
      }

      // 2. For each campaign, fill available slots
      for (const campaign of activeCampaigns) {
        // Store config
        this.campaignConfigs.set(campaign.id, {
          maxWorkers: campaign.maxConcurrentWorkers || 1,
        });

        // Skip campaigns with too many consecutive errors
        const errCount = this.consecutiveErrors.get(campaign.id) || 0;
        if (errCount >= MAX_CONSECUTIVE_ERRORS) {
          console.warn(`${LOG_PREFIX} Campaign ${campaign.id} paused after ${errCount} consecutive errors — will retry next cycle`);
          // Reset so it tries again next cycle (auto-heal)
          this.consecutiveErrors.set(campaign.id, Math.max(0, errCount - 1));
          continue;
        }

        const maxWorkers = campaign.maxConcurrentWorkers || 1;
        const currentActive = this.getActiveCountForCampaign(campaign.id);
        const slotsAvailable = maxWorkers - currentActive;

        if (slotsAvailable <= 0) continue;

        // 3. Pull queue items and place calls
        await this.fillSlots(campaign.id, slotsAvailable, campaign.fromNumber || '');
      }

      // Clean up tracking for campaigns that are no longer active
      const activeIds = new Set(activeCampaigns.map(c => c.id));
      for (const cid of this.campaignConfigs.keys()) {
        if (!activeIds.has(cid)) {
          this.campaignConfigs.delete(cid);
          this.campaignActiveCounts.delete(cid);
          this.consecutiveErrors.delete(cid);
        }
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} Poll sweep error:`, err);
    } finally {
      this.isProcessing = false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Fill available call slots for a campaign
  // ──────────────────────────────────────────────────────────────────────────
  private async fillSlots(campaignId: string, slotsToFill: number, defaultFromNumber: string): Promise<void> {
    const queueItems = await this.pullEligibleQueueItems(campaignId);

    if (queueItems.length === 0) {
      return; // No eligible contacts right now
    }

    let filled = 0;
    for (const item of queueItems) {
      if (filled >= slotsToFill) break;

      // Re-check active count (may have changed during async processing)
      const maxWorkers = this.campaignConfigs.get(campaignId)?.maxWorkers || 1;
      if (this.getActiveCountForCampaign(campaignId) >= maxWorkers) break;

      try {
        await this.initiateCall(campaignId, item, defaultFromNumber);
        filled++;
        this.consecutiveErrors.set(campaignId, 0); // Reset error counter on success

        // Small delay between call initiations to avoid Telnyx rate limits
        if (filled < slotsToFill) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        console.error(`${LOG_PREFIX} Failed to initiate call for queue item ${item.queueItem.id}:`, err);
        const errCount = (this.consecutiveErrors.get(campaignId) || 0) + 1;
        this.consecutiveErrors.set(campaignId, errCount);

        // Release queue item back
        try {
          await db.update(campaignQueue)
            .set({
              status: 'queued',
              nextAttemptAt: new Date(Date.now() + 60_000), // 1 min cooldown
              updatedAt: new Date(),
            })
            .where(eq(campaignQueue.id, item.queueItem.id));
        } catch (reqErr) {
          console.error(`${LOG_PREFIX} Failed to requeue item ${item.queueItem.id}:`, reqErr);
        }
      }
    }

    if (filled > 0) {
      console.log(`${LOG_PREFIX} Campaign ${campaignId}: filled ${filled}/${slotsToFill} slots (active: ${this.getActiveCountForCampaign(campaignId)}/${this.campaignConfigs.get(campaignId)?.maxWorkers || 1})`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Pull eligible queue items (matching campaign-runner-ws logic)
  // ──────────────────────────────────────────────────────────────────────────
  private async pullEligibleQueueItems(campaignId: string) {
    const baseWhere = and(
      eq(campaignQueue.campaignId, campaignId),
      eq(campaignQueue.status, 'queued'),
      // AI dialer only pulls items with targetAgentType 'any' or 'ai'
      or(
        eq(campaignQueue.targetAgentType, 'any'),
        eq(campaignQueue.targetAgentType, 'ai')
      ),
      // Contact-level suppression: only eligible contacts
      or(
        isNull(contacts.nextCallEligibleAt),
        lte(contacts.nextCallEligibleAt, sql`NOW()`)
      ),
      // Queue-level retry suppression
      or(
        isNull(campaignQueue.nextAttemptAt),
        lte(campaignQueue.nextAttemptAt, sql`NOW()`)
      )
    );

    // Pull active-timezone contacts first (priority >= 100)
    let queueItems = await db
      .select({
        queueItem: campaignQueue,
        contact: contacts,
        account: accounts,
      })
      .from(campaignQueue)
      .innerJoin(contacts, eq(campaignQueue.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(and(baseWhere, sql`${campaignQueue.priority} >= 100`))
      .orderBy(sql`${campaignQueue.priority} DESC`, campaignQueue.createdAt)
      .limit(20);

    // Fallback: any available contacts
    if (queueItems.length === 0) {
      queueItems = await db
        .select({
          queueItem: campaignQueue,
          contact: contacts,
          account: accounts,
        })
        .from(campaignQueue)
        .innerJoin(contacts, eq(campaignQueue.contactId, contacts.id))
        .leftJoin(accounts, eq(contacts.accountId, accounts.id))
        .where(baseWhere)
        .orderBy(sql`${campaignQueue.priority} DESC`, campaignQueue.createdAt)
        .limit(20);
    }

    // Apply timezone and country filtering
    const eligible: typeof queueItems = [];
    const skippedItemsByNextAttempt = new Map<string, string[]>();

    for (const item of queueItems) {
      if (!isCountryEnabled(item.contact.country)) continue;

      const callPriority = getContactCallPriority({
        country: item.contact.country,
        state: item.contact.state,
        timezone: item.contact.timezone,
      });

      if (!callPriority.timezone) continue;

      if (!callPriority.canCallNow) {
        // Schedule for next business hours opening
        const config = getBusinessHoursForCountry(item.contact.country);
        config.timezone = callPriority.timezone;
        config.respectContactTimezone = false;
        const nextOpen = getNextAvailableTime(config, undefined, new Date());
        const key = nextOpen.toISOString();
        if (!skippedItemsByNextAttempt.has(key)) skippedItemsByNextAttempt.set(key, []);
        skippedItemsByNextAttempt.get(key)!.push(item.queueItem.id);
        continue;
      }

      eligible.push(item);
    }

    // Update nextAttemptAt for skipped items
    for (const [nextAttemptIso, ids] of skippedItemsByNextAttempt) {
      await db.update(campaignQueue)
        .set({
          nextAttemptAt: new Date(nextAttemptIso),
          priority: 50,
          updatedAt: new Date(),
        })
        .where(inArray(campaignQueue.id, ids))
        .catch(err => console.error(`${LOG_PREFIX} Failed to delay items to ${nextAttemptIso}:`, err));
    }

    return eligible;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Initiate a single outbound call via Telnyx TeXML
  // ──────────────────────────────────────────────────────────────────────────
  private async initiateCall(
    campaignId: string,
    item: { queueItem: any; contact: any; account: any },
    defaultFromNumber: string,
  ): Promise<void> {
    const telnyxApiKey = process.env.TELNYX_API_KEY;
    const texmlAppId = process.env.TELNYX_TEXML_APP_ID;

    if (!telnyxApiKey || !texmlAppId) {
      throw new Error('Missing TELNYX_API_KEY or TELNYX_TEXML_APP_ID');
    }

    // Resolve phone number
    const phoneResult = getBestPhoneForContact(item.contact);
    if (!phoneResult.phone) {
      console.warn(`${LOG_PREFIX} No phone for contact ${item.contact.id}, skipping`);
      return;
    }

    const phoneNumber = phoneResult.phone;

    // Get caller ID from number pool
    let fromNumber = defaultFromNumber || process.env.TELNYX_FROM_NUMBER || '';
    let callerNumberId: string | null = null;
    let callerNumberDecisionId: string | null = null;

    try {
      const callerIdResult = await getCallerIdForCall({
        campaignId,
        prospectNumber: phoneNumber,
        callType: 'autonomous_ai',
      });

      if (callerIdResult.callerId) {
        fromNumber = callerIdResult.callerId;
        callerNumberId = callerIdResult.numberId || null;
        callerNumberDecisionId = callerIdResult.decisionId || null;
      }

      // Apply jitter delay if applicable
      if (callerIdResult.jitterDelayMs > 0) {
        await numberPoolSleep(callerIdResult.jitterDelayMs);
      }
    } catch (poolErr) {
      console.warn(`${LOG_PREFIX} Number pool failed, using default: ${fromNumber}`, poolErr);
    }

    if (!fromNumber) {
      throw new Error('No from number available');
    }

    // Build unified call context
    const ctx = await buildUnifiedCallContext({
      campaignId,
      queueItemId: item.queueItem.id,
      contactId: item.contact.id,
      calledNumber: phoneNumber,
      fromNumber,
      callerNumberId,
      callerNumberDecisionId,
      contactName: `${item.contact.firstName || ''} ${item.contact.lastName || ''}`.trim(),
      contactFirstName: item.contact.firstName,
      contactLastName: item.contact.lastName,
      contactEmail: item.contact.email,
      contactJobTitle: item.contact.jobTitle,
      accountName: item.account?.name,
      isTestCall: false,
      provider: 'google', // Gemini Live as default AI provider
    });

    if (!ctx) {
      console.warn(`${LOG_PREFIX} No AI config for campaign ${campaignId}, skipping item ${item.queueItem.id}`);
      return;
    }

    // Mark queue item as in_progress
    await db.update(campaignQueue)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(eq(campaignQueue.id, item.queueItem.id));

    // Store session in Redis
    await storeCallSession(ctx);

    // Generate client state
    const customParams = contextToClientStateParams(ctx);
    const clientStateB64 = Buffer.from(JSON.stringify(customParams)).toString('base64');

    // Resolve webhook host
    let webhookHost = '';
    if (process.env.NODE_ENV !== 'production' && process.env.PUBLIC_WEBHOOK_HOST) {
      webhookHost = process.env.PUBLIC_WEBHOOK_HOST;
    } else {
      webhookHost = process.env.PUBLIC_TEXML_HOST || process.env.PUBLIC_WEBHOOK_HOST || '';
      if (!webhookHost && process.env.TELNYX_WEBHOOK_URL) {
        try {
          const u = new URL((process.env.TELNYX_WEBHOOK_URL || '').trim());
          webhookHost = u.host;
        } catch {}
      }
    }
    webhookHost = (webhookHost || 'localhost:5000').replace(/^https?:\/\//, '');

    const webhookProtocol = webhookHost.includes('localhost') ? 'http' : 'https';
    const texmlUrl = `${webhookProtocol}://${webhookHost}/api/texml/ai-call?client_state=${encodeURIComponent(clientStateB64)}`;
    const statusCallbackUrl = (process.env.TELNYX_WEBHOOK_URL || '').trim() || `https://${webhookHost}/api/webhooks/telnyx`;

    const callInfo = getInternationalCallInfo(phoneNumber);

    console.log(`${LOG_PREFIX} 📞 Initiating call: ${item.contact.firstName} ${item.contact.lastName} @ ${item.account?.name || 'N/A'} | ${phoneNumber} | Campaign: ${campaignId} | International: ${callInfo.isInternational}`);

    // Place call via Telnyx TeXML API
    const telnyxEndpoint = `https://api.telnyx.com/v2/texml/calls/${texmlAppId}`;

    const telnyxResponse = await fetch(telnyxEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${telnyxApiKey}`,
      },
      body: JSON.stringify({
        To: phoneNumber,
        From: fromNumber,
        Url: texmlUrl,
        StatusCallback: statusCallbackUrl,
        ClientState: clientStateB64,
      }),
    });

    if (!telnyxResponse.ok) {
      releaseNumberWithoutOutcome(callerNumberId);
      const errorText = await telnyxResponse.text();
      console.error(`${LOG_PREFIX} Telnyx API error: ${telnyxResponse.status} — ${errorText}`);

      // Requeue the item
      await db.update(campaignQueue)
        .set({
          status: 'queued',
          nextAttemptAt: new Date(Date.now() + 2 * 60_000), // 2 min cooldown
          updatedAt: new Date(),
        })
        .where(eq(campaignQueue.id, item.queueItem.id));

      throw new Error(`Telnyx API ${telnyxResponse.status}: ${errorText.substring(0, 200)}`);
    }

    // Parse response to get call control ID
    let telnyxData: any = {};
    try {
      telnyxData = await telnyxResponse.json();
    } catch {
      // Response might not be JSON
    }

    const callControlId = telnyxData?.data?.call_control_id || telnyxData?.call_control_id;
    const callSid = telnyxData?.data?.call_sid || telnyxData?.call_sid;

    // Track the active call
    const callId = ctx.callId;
    const activeCall: ActiveCall = {
      campaignId,
      queueItemId: item.queueItem.id,
      contactId: item.contact.id,
      callControlId,
      telnyxCallSid: callSid,
      callerNumberId,
      startedAt: Date.now(),
    };
    this.activeCalls.set(callId, activeCall);
    this.incrementActiveCount(campaignId);

    console.log(`${LOG_PREFIX} ✅ Call placed: ${callId} | CCId: ${callControlId || 'pending'} | Active: ${this.getActiveCountForCampaign(campaignId)}/${this.campaignConfigs.get(campaignId)?.maxWorkers || 1}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Call completion handler (triggered by webhook events)
  // ──────────────────────────────────────────────────────────────────────────
  private async handleCallCompleted(data: {
    callId?: string;
    callControlId?: string;
    campaignId?: string;
    queueItemId?: string;
  }): Promise<void> {
    // Find the active call by callId, callControlId, or queueItemId
    let matchedCallId: string | null = null;
    let matchedCall: ActiveCall | null = null;

    for (const [callId, call] of this.activeCalls) {
      if (
        (data.callId && callId === data.callId) ||
        (data.callControlId && call.callControlId === data.callControlId) ||
        (data.queueItemId && call.queueItemId === data.queueItemId)
      ) {
        matchedCallId = callId;
        matchedCall = call;
        break;
      }
    }

    if (!matchedCallId || !matchedCall) {
      // Not one of our autonomous calls — ignore
      return;
    }

    const duration = Math.round((Date.now() - matchedCall.startedAt) / 1000);
    console.log(`${LOG_PREFIX} 📱 Call completed: ${matchedCallId} | Campaign: ${matchedCall.campaignId} | Duration: ${duration}s`);

    // Remove from tracking
    this.activeCalls.delete(matchedCallId);
    this.decrementActiveCount(matchedCall.campaignId);

    // Try to fill the freed slot after a short delay
    if (this.isRunning) {
      setTimeout(() => {
        this.tryFillSlotsForCampaign(matchedCall!.campaignId).catch(err =>
          console.error(`${LOG_PREFIX} Slot fill error after completion:`, err)
        );
      }, SLOT_FILL_DELAY_MS);
    }
  }

  // Immediately try to fill slots for a specific campaign
  private async tryFillSlotsForCampaign(campaignId: string): Promise<void> {
    const config = this.campaignConfigs.get(campaignId);
    if (!config) return;

    const currentActive = this.getActiveCountForCampaign(campaignId);
    const slotsAvailable = config.maxWorkers - currentActive;
    if (slotsAvailable <= 0) return;

    // Verify campaign is still active
    const [campaign] = await db
      .select({ status: campaigns.status, fromNumber: sql<string>`COALESCE(${campaigns.fromNumber}, '')` })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign || campaign.status !== 'active') {
      this.campaignConfigs.delete(campaignId);
      return;
    }

    await this.fillSlots(campaignId, slotsAvailable, campaign.fromNumber || '');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Active count management
  // ──────────────────────────────────────────────────────────────────────────
  private getActiveCountForCampaign(campaignId: string): number {
    // Count from actual activeCalls map for accuracy
    let count = 0;
    for (const call of this.activeCalls.values()) {
      if (call.campaignId === campaignId) count++;
    }
    return count;
  }

  private incrementActiveCount(campaignId: string): void {
    const current = this.campaignActiveCounts.get(campaignId) || 0;
    this.campaignActiveCounts.set(campaignId, current + 1);
  }

  private decrementActiveCount(campaignId: string): void {
    const current = this.campaignActiveCounts.get(campaignId) || 0;
    this.campaignActiveCounts.set(campaignId, Math.max(0, current - 1));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Stale call cleanup (safety net for calls that never got a hangup event)
  // ──────────────────────────────────────────────────────────────────────────
  cleanupStaleCalls(): void {
    const MAX_CALL_AGE_MS = 20 * 60 * 1000; // 20 minutes max
    const now = Date.now();

    for (const [callId, call] of this.activeCalls) {
      if (now - call.startedAt > MAX_CALL_AGE_MS) {
        console.warn(`${LOG_PREFIX} Cleaning up stale call ${callId} (age: ${Math.round((now - call.startedAt) / 1000)}s)`);
        this.activeCalls.delete(callId);
        this.decrementActiveCount(call.campaignId);

        // Release number pool lock
        releaseNumberWithoutOutcome(call.callerNumberId);

        // Requeue the item
        db.update(campaignQueue)
          .set({
            status: 'queued',
            nextAttemptAt: new Date(now + 5 * 60_000), // 5 min cooldown
            updatedAt: new Date(),
          })
          .where(eq(campaignQueue.id, call.queueItemId))
          .catch(err => console.error(`${LOG_PREFIX} Failed to requeue stale item:`, err));
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Status / diagnostics
  // ──────────────────────────────────────────────────────────────────────────
  getStatus(): {
    isRunning: boolean;
    activeCalls: number;
    campaignBreakdown: Record<string, { active: number; max: number }>;
  } {
    const breakdown: Record<string, { active: number; max: number }> = {};
    for (const [cid, config] of this.campaignConfigs) {
      breakdown[cid] = {
        active: this.getActiveCountForCampaign(cid),
        max: config.maxWorkers,
      };
    }
    return {
      isRunning: this.isRunning,
      activeCalls: this.activeCalls.size,
      campaignBreakdown: breakdown,
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Singleton
// ──────────────────────────────────────────────────────────────────────────────
let dialerInstance: AutonomousAIDialerService | null = null;

export function initializeAutonomousDialer(): AutonomousAIDialerService {
  if (!dialerInstance) {
    dialerInstance = new AutonomousAIDialerService();
  }
  dialerInstance.start();

  // Stale call cleanup every 5 minutes
  setInterval(() => {
    dialerInstance?.cleanupStaleCalls();
  }, 5 * 60_000);

  return dialerInstance;
}

export function getAutonomousDialer(): AutonomousAIDialerService | null {
  return dialerInstance;
}

export { AutonomousAIDialerService };
