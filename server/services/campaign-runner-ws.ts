/**
 * Campaign Runner WebSocket Service
 * 
 * Pushes campaign call tasks to connected browser clients.
 * All calls are made via browser WebRTC - NO server-side REST API calls.
 * 
 * Flow:
 * 1. Browser connects and registers as a campaign runner
 * 2. Server pushes queued campaign items to browser
 * 3. Browser makes call via Telnyx WebRTC + OpenAI Realtime WebRTC
 * 4. Browser reports disposition back to server
 * 5. Server updates database and queues next item
 */

import WebSocket, { WebSocketServer } from "ws";
import { Server as HttpServer } from "http";
import { db } from "../db";
import { campaignQueue, contacts, accounts, campaigns, virtualAgents, dialerRuns, dialerCallAttempts, type CanonicalDisposition } from "@shared/schema";
import { eq, and, sql, inArray, or, isNull, lte, count, desc } from "drizzle-orm";
import { getBestPhoneForContact } from "../lib/phone-utils";
import {
  detectContactTimezone,
  isWithinBusinessHours,
  getNextAvailableTime,
  getBusinessHoursForCountry
} from "../utils/business-hours";
import { seedQueuePriorities } from "./campaign-timezone-analyzer";
import { processDisposition } from "./disposition-engine";
import { getCallerIdForCall, handleCallCompleted as handleNumberPoolCallCompleted, releaseNumberWithoutOutcome, sleep as numberPoolSleep } from "./number-pool-integration";
import { buildUnifiedCallContext } from "./unified-call-context";

const LOG_PREFIX = "[CampaignRunner-WS]";

/**
 * Enabled calling regions/countries
 * Calls are enabled for: Australia, Middle East, North America (US/Canada), United Kingdom
 */
const ENABLED_CALLING_REGIONS = {
  // Australia
  'AU': true, 'AUSTRALIA': true,
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
  // United Kingdom
  'GB': true, 'UK': true, 'UNITED KINGDOM': true, 'ENGLAND': true, 'SCOTLAND': true, 'WALES': true,
};

/**
 * Check if a contact's country is in an enabled calling region
 */
function isCountryEnabled(country: string | null | undefined): boolean {
  if (!country) return false;
  return ENABLED_CALLING_REGIONS[country.toUpperCase().trim() as keyof typeof ENABLED_CALLING_REGIONS] === true;
}

/**
 * Check if contact is within their local business hours
 * Returns priority score: higher = should call sooner
 * - 100: Currently within business hours (should call now)
 * - 50: Known timezone but outside hours (skip for now)
 * - 0: Unknown timezone (skip)
 */
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

  // Get country-specific business hours config
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

export interface CampaignTask {
  taskId: string;
  campaignId: string;
  queueItemId: string;
  contactId: string;
  // Contact info
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  contactTitle: string | null;
  phoneNumber: string;
  // Account info
  companyName: string | null;
  accountId: string | null;
  // AI settings
  aiSettings: {
    persona: {
      name: string;
      companyName: string;
      systemPrompt: string;
      voice: string;
    };
    objective: {
      type: string;
      qualificationQuestions: string[];
      meetingLink?: string;
    };
    handoff: {
      enabled: boolean;
      transferNumber?: string;
      handoffTriggers: string[];
    };
    callRecording: {
      enabled: boolean;
    };
  };
  // Caller ID
  fromNumber: string;
  callerNumberId?: string | null;
  callerNumberDecisionId?: string | null;
  // Virtual agent info
  virtualAgentId?: string | null;
  agentName: string;
  agentFullName: string;
}

export interface RunnerClient {
  ws: WebSocket;
  userId: string;
  username: string;
  activeCampaigns: Set<string>;
  currentTask: CampaignTask | null;
  maxConcurrent: number;
  activeCallCount: number;
  isReady: boolean;
  lastHeartbeat: Date;
}

interface IncomingMessage {
  type: 'register' | 'ready' | 'task_started' | 'task_completed' | 'task_failed' | 'heartbeat' | 'request_task' | 'stop_campaign';
  userId?: string;
  username?: string;
  campaignIds?: string[];
  maxConcurrent?: number;
  taskId?: string;
  disposition?: string;
  callDurationSeconds?: number;
  transcript?: Array<{ role: string; text: string }>;
  error?: string;
  recordingUrl?: string;
}

interface OutgoingMessage {
  type: 'registered' | 'task' | 'no_tasks' | 'campaign_complete' | 'error' | 'heartbeat_ack' | 'stats' | 'stall_reason';
  task?: CampaignTask;
  campaignId?: string;
  error?: string;
  stallReason?: string;
  stats?: {
    activeCampaigns: number;
    queuedItems: number;
    activeRunners: number;
  };
}

class CampaignRunnerService {
  private wss: WebSocketServer | null = null;
  private runners: Map<WebSocket, RunnerClient> = new Map();
  private taskQueue: Map<string, CampaignTask[]> = new Map(); // campaignId -> tasks
  private processingInterval: NodeJS.Timeout | null = null;
  private campaignConfigs = new Map<string, { maxWorkers: number }>();

  private getGlobalActiveCount(campaignId: string): number {
    let count = 0;
    for (const runner of this.runners.values()) {
      if (runner.currentTask && runner.currentTask.campaignId === campaignId) {
        count++;
      }
    }
    return count;
  }

  initialize(server: HttpServer): WebSocketServer {
    this.wss = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false,
    });

    this.wss.on("connection", (ws: WebSocket, req) => {
      console.log(`${LOG_PREFIX} New connection from ${req.socket.remoteAddress}`);
      this.handleConnection(ws);
    });

    // Reset any stuck tasks from previous runs
    this.resetStuckQueueItems();

    // Start task distribution loop
    this.startProcessingLoop();

    console.log(`${LOG_PREFIX} Initialized`);
    return this.wss;
  }

  // Monitor for stuck calls (auto-recovery)
  private async resetStuckQueueItems(): Promise<void> {
    try {
      // Find items that are 'in_progress' but haven't been updated in > 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const stuckItems = await db.select({
        id: campaignQueue.id,
      })
      .from(campaignQueue)
      .where(and(
        eq(campaignQueue.status, 'in_progress'),
        lte(campaignQueue.updatedAt, fiveMinutesAgo)
      ));

      if (stuckItems.length > 0) {
        console.log(`${LOG_PREFIX} Found ${stuckItems.length} stuck queue items. Resetting to queued.`);
        
        const ids = stuckItems.map(item => item.id);
        
        await db.update(campaignQueue)
          .set({
            status: 'queued',
            updatedAt: new Date(),
            removedReason: 'system_recovery_stuck_in_progress',
            // Add a small delay so we don't hammer them immediately if there's a systemic issue
            nextAttemptAt: new Date(Date.now() + 30 * 1000) 
          })
          .where(inArray(campaignQueue.id, ids));
          
        console.log(`${LOG_PREFIX} Successfully reset stuck items.`);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to reset stuck queue items:`, error);
    }
  }

  private handleConnection(ws: WebSocket): void {
    ws.on("message", async (data) => {
      try {
        const message: IncomingMessage = JSON.parse(data.toString());
        await this.handleMessage(ws, message);
      } catch (error) {
        console.error(`${LOG_PREFIX} Message parse error:`, error);
        this.sendMessage(ws, { type: 'error', error: 'Invalid message format' });
      }
    });

    ws.on("close", () => {
      const runner = this.runners.get(ws);
      if (runner) {
        console.log(`${LOG_PREFIX} Runner disconnected: ${runner.username}`);
        // Return any active task to queue
        if (runner.currentTask) {
          this.requeueTask(runner.currentTask);
        }
        this.runners.delete(ws);
      }
    });

    ws.on("error", (error) => {
      console.error(`${LOG_PREFIX} WebSocket error:`, error);
    });
  }

  private async handleMessage(ws: WebSocket, message: IncomingMessage): Promise<void> {
    switch (message.type) {
      case 'register':
        await this.handleRegister(ws, message);
        break;
      case 'ready':
        this.handleReady(ws);
        break;
      case 'request_task':
        await this.handleRequestTask(ws);
        break;
      case 'task_started':
        this.handleTaskStarted(ws, message);
        break;
      case 'task_completed':
        await this.handleTaskCompleted(ws, message);
        break;
      case 'task_failed':
        await this.handleTaskFailed(ws, message);
        break;
      case 'heartbeat':
        this.handleHeartbeat(ws);
        break;
      case 'stop_campaign':
        await this.handleStopCampaign(ws, message);
        break;
      default:
        console.warn(`${LOG_PREFIX} Unknown message type:`, (message as any).type);
    }
  }

  private async handleRegister(ws: WebSocket, message: IncomingMessage): Promise<void> {
    if (!message.userId || !message.username) {
      this.sendMessage(ws, { type: 'error', error: 'Missing userId or username' });
      return;
    }

    const runner: RunnerClient = {
      ws,
      userId: message.userId,
      username: message.username,
      activeCampaigns: new Set(message.campaignIds || []),
      currentTask: null,
      maxConcurrent: message.maxConcurrent || 1,
      activeCallCount: 0,
      isReady: false,
      lastHeartbeat: new Date(),
    };

    this.runners.set(ws, runner);
    console.log(`${LOG_PREFIX} Registered runner: ${runner.username} for campaigns: ${Array.from(runner.activeCampaigns).join(', ')}`);

    // Load initial tasks for the campaigns
    for (const campaignId of runner.activeCampaigns) {
      await this.loadCampaignTasks(campaignId);
    }

    this.sendMessage(ws, { 
      type: 'registered',
      stats: this.getStats()
    });
  }

  private handleReady(ws: WebSocket): void {
    const runner = this.runners.get(ws);
    if (runner) {
      runner.isReady = true;
      console.log(`${LOG_PREFIX} Runner ready: ${runner.username}`);
      // Try to send a task immediately
      this.tryAssignTask(runner);
    }
  }

  private async handleRequestTask(ws: WebSocket): Promise<void> {
    const runner = this.runners.get(ws);
    if (!runner) return;

    if (runner.activeCallCount >= runner.maxConcurrent) {
      this.sendMessage(ws, { type: 'no_tasks' });
      return;
    }

    const task = this.getNextTask(runner);
    if (task) {
      runner.currentTask = task;
      runner.activeCallCount++;
      this.sendMessage(ws, { type: 'task', task });
    } else {
      this.sendMessage(ws, { type: 'no_tasks' });
    }
  }

  private handleTaskStarted(ws: WebSocket, message: IncomingMessage): void {
    const runner = this.runners.get(ws);
    if (runner && message.taskId) {
      console.log(`${LOG_PREFIX} Task started: ${message.taskId} by ${runner.username}`);
    }
  }

  private async handleTaskCompleted(ws: WebSocket, message: IncomingMessage): Promise<void> {
    const runner = this.runners.get(ws);
    if (!runner || !message.taskId) return;

    console.log(`${LOG_PREFIX} Task completed: ${message.taskId} disposition: ${message.disposition}`);

    const task = runner.currentTask;
    if (task) {
      const rawDisposition = typeof message.disposition === "string"
        ? message.disposition.trim()
        : "no_answer";

      const mapToCanonicalDisposition = (value: string): CanonicalDisposition => {
        const d = value.toLowerCase().trim();

        if (["qualified", "lead", "qualified_lead", "meeting_booked", "callback_requested", "callback-requested", "callback"].includes(d)) {
          return "qualified_lead";
        }
        if (["voicemail", "voicemail_left", "machine"].includes(d)) {
          return "voicemail";
        }
        if (["no_answer", "no-answer", "busy", "failed", "connected", "completed", "needs_review", "hung_up"].includes(d)) {
          return "no_answer";
        }
        if (["not_interested", "not interested"].includes(d)) {
          return "not_interested";
        }
        if (["dnc", "dnc_request", "dnc-request", "do_not_call", "do not call"].includes(d)) {
          return "do_not_call";
        }
        if (["wrong_number", "invalid", "invalid_data", "invalid-data"].includes(d)) {
          return "invalid_data";
        }
        return "no_answer";
      };

      const canonicalDisposition = mapToCanonicalDisposition(rawDisposition);
      const callDurationSeconds = Number(message.callDurationSeconds) || 0;
      const callEndedAt = new Date();
      const callStartedAt = callDurationSeconds > 0
        ? new Date(callEndedAt.getTime() - callDurationSeconds * 1000)
        : null;
      const isVoicemail = canonicalDisposition === "voicemail";
      const isNoAnswer = canonicalDisposition === "no_answer";
      const connected = !isVoicemail && !isNoAnswer;

      try {
        let virtualAgentId = task.virtualAgentId || null;
        if (!virtualAgentId) {
          const [campaign] = await db
            .select({ virtualAgentId: campaigns.virtualAgentId })
            .from(campaigns)
            .where(eq(campaigns.id, task.campaignId))
            .limit(1);
          virtualAgentId = campaign?.virtualAgentId || null;
        }

        const [existingRun] = await db
          .select()
          .from(dialerRuns)
          .where(and(
            eq(dialerRuns.campaignId, task.campaignId),
            eq(dialerRuns.agentType, "ai"),
            inArray(dialerRuns.status, ["active", "pending", "paused"]),
            virtualAgentId
              ? eq(dialerRuns.virtualAgentId, virtualAgentId)
              : sql`${dialerRuns.virtualAgentId} IS NULL`
          ))
          .orderBy(desc(dialerRuns.createdAt))
          .limit(1);

        const run = existingRun || (await db.insert(dialerRuns).values({
          campaignId: task.campaignId,
          runType: "power_dial",
          agentType: "ai",
          virtualAgentId,
          status: "active",
          maxConcurrentCalls: runner.maxConcurrent || 1,
          callTimeoutSeconds: 30,
          startedAt: new Date(),
        }).returning())[0];

        const [attemptCount] = await db
          .select({ count: count() })
          .from(dialerCallAttempts)
          .where(and(
            eq(dialerCallAttempts.campaignId, task.campaignId),
            eq(dialerCallAttempts.contactId, task.contactId)
          ));

        const attemptNumber = (Number(attemptCount?.count) || 0) + 1;

        const [callAttempt] = await db
          .insert(dialerCallAttempts)
          .values({
            dialerRunId: run.id,
            campaignId: task.campaignId,
            contactId: task.contactId,
            queueItemId: task.queueItemId,
            agentType: "ai",
            virtualAgentId,
            phoneDialed: task.phoneNumber,
            attemptNumber,
            callStartedAt,
            callEndedAt,
            callDurationSeconds: Number.isFinite(callDurationSeconds) ? callDurationSeconds : null,
            connected,
            voicemailDetected: isVoicemail,
            disposition: canonicalDisposition,
            dispositionSubmittedAt: new Date(),
            dispositionSubmittedBy: runner.userId,
            notes: rawDisposition ? `CampaignRunner disposition: ${rawDisposition}` : null,
            recordingUrl: message.recordingUrl || null,
            updatedAt: new Date(),
          })
          .returning();

        const result = await processDisposition(callAttempt.id, canonicalDisposition, "campaign_runner");
        if (!result.success) {
          console.error(`${LOG_PREFIX} Disposition engine errors:`, result.errors);
        }

        if (task.callerNumberId) {
          await handleNumberPoolCallCompleted({
            numberId: task.callerNumberId,
            dialerAttemptId: callAttempt.id,
            answered: connected,
            durationSec: Number.isFinite(callDurationSeconds) ? callDurationSeconds : 0,
            disposition: canonicalDisposition,
            failed: isNoAnswer,
            failureReason: isNoAnswer ? 'no_answer' : undefined,
            prospectNumber: task.phoneNumber,
            campaignId: task.campaignId,
          });
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to process task disposition:`, error);
        try {
          await db.update(campaignQueue)
            .set({
              status: "queued",
              removedReason: "disposition_processing_failed",
              nextAttemptAt: new Date(Date.now() + 60000),
              updatedAt: new Date(),
            })
            .where(eq(campaignQueue.id, task.queueItemId));
        } catch (queueError) {
          console.error(`${LOG_PREFIX} Failed to release queue item after error:`, queueError);
        }
      }
    }

    // Clear current task and decrement count
    runner.currentTask = null;
    runner.activeCallCount = Math.max(0, runner.activeCallCount - 1);

    // Try to assign next task
    if (runner.isReady) {
      await this.tryAssignTask(runner);
    }
  }

  private async handleTaskFailed(ws: WebSocket, message: IncomingMessage): Promise<void> {
    const runner = this.runners.get(ws);
    if (!runner || !message.taskId) return;

    console.log(`${LOG_PREFIX} Task failed: ${message.taskId} error: ${message.error}`);

    // Update queue item status - requeue for retry
    if (runner.currentTask) {
      try {
        await db.update(campaignQueue)
          .set({
            status: 'queued', // Put back in queue for retry
            removedReason: message.error,
            nextAttemptAt: new Date(Date.now() + 60000), // Retry after 1 minute
            updatedAt: new Date(),
          })
          .where(eq(campaignQueue.id, runner.currentTask.queueItemId));
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to update task failure:`, error);
      }
      releaseNumberWithoutOutcome(runner.currentTask.callerNumberId || null);
    }

    // Clear current task
    runner.currentTask = null;
    runner.activeCallCount = Math.max(0, runner.activeCallCount - 1);

    // Try next task
    if (runner.isReady) {
      await this.tryAssignTask(runner);
    }
  }

  private handleHeartbeat(ws: WebSocket): void {
    const runner = this.runners.get(ws);
    if (runner) {
      runner.lastHeartbeat = new Date();
      this.sendMessage(ws, { type: 'heartbeat_ack' });
    }
  }

  private async handleStopCampaign(ws: WebSocket, message: IncomingMessage): Promise<void> {
    const runner = this.runners.get(ws);
    if (!runner || !message.campaignIds) return;

    for (const campaignId of message.campaignIds) {
      runner.activeCampaigns.delete(campaignId);
      this.taskQueue.delete(campaignId);
    }

    console.log(`${LOG_PREFIX} Stopped campaigns for ${runner.username}: ${message.campaignIds.join(', ')}`);
  }

  private async loadCampaignTasks(campaignId: string): Promise<void> {
    // Guard: calls blocked by default — must be enabled in Telephony settings
    if (process.env.CALL_EXECUTION_ENABLED !== 'true') {
      console.log(`${LOG_PREFIX} Skipping task load - call execution not enabled. Enable call execution in Telephony settings.`);
      this.broadcastStallReason(campaignId, 'Call execution is disabled. Go to Settings > Telephony and enable call execution.');
      return;
    }

    try {
      // Get campaign details
      const [campaign] = await db.select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign || campaign.status !== 'active') {
        console.log(`${LOG_PREFIX} Campaign ${campaignId} not active`);
        this.broadcastStallReason(campaignId, `Campaign is not active (status: ${campaign?.status || 'not found'}).`);
        return;
      }

      // Store campaign concurrency config
      this.campaignConfigs.set(campaignId, { 
        maxWorkers: (campaign as any).maxConcurrentWorkers || 1 
      });

      // Get virtual agent if assigned (using any cast for extended campaign fields)
      const campaignExt = campaign as any;
      const virtualAgentId = campaignExt.virtualAgentId;
      const [agent] = virtualAgentId 
        ? await db.select().from(virtualAgents).where(eq(virtualAgents.id, virtualAgentId)).limit(1)
        : [];

      // Get queued queue items with contact and account info
      // Filter out contacts that are suppressed (next_call_eligible_at > NOW())
      // Pull active-timezone contacts first (priority >= 100 = open now or opening soon)
      // Priorities are pre-seeded by seedQueuePriorities() on campaign start and refreshed periodically
      const baseWhere = and(
        eq(campaignQueue.campaignId, campaignId),
        eq(campaignQueue.status, 'queued'),
        // PHASE 4: AI dialer only pulls items with targetAgentType 'any' or 'ai'
        // Items marked for 'human' escalation will be skipped by AI dialer
        or(
          eq(campaignQueue.targetAgentType, 'any'),
          eq(campaignQueue.targetAgentType, 'ai')
        ),
        // Contact-level suppression check: only include contacts that are eligible
        or(
          isNull(contacts.nextCallEligibleAt),
          lte(contacts.nextCallEligibleAt, sql`NOW()`)
        ),
        // Queue-level retry suppression: only include items ready for next attempt
        or(
          isNull(campaignQueue.nextAttemptAt),
          lte(campaignQueue.nextAttemptAt, sql`NOW()`)
        )
      );

      // First try: only pull contacts in active timezones (priority >= 100)
      let queueItems = await db.select({
        queueItem: campaignQueue,
        contact: contacts,
        account: accounts,
      })
      .from(campaignQueue)
      .innerJoin(contacts, eq(campaignQueue.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(and(baseWhere, sql`${campaignQueue.priority} >= 100`))
      .orderBy(sql`${campaignQueue.priority} DESC`, campaignQueue.createdAt)
      .limit(100);

      // Fallback: if no active-timezone contacts, pull any available (avoids campaign appearing stuck)
      if (queueItems.length === 0) {
        queueItems = await db.select({
          queueItem: campaignQueue,
          contact: contacts,
          account: accounts,
        })
        .from(campaignQueue)
        .innerJoin(contacts, eq(campaignQueue.contactId, contacts.id))
        .leftJoin(accounts, eq(contacts.accountId, accounts.id))
        .where(baseWhere)
        .orderBy(sql`${campaignQueue.priority} DESC`, campaignQueue.createdAt)
        .limit(50);
      }

      if (queueItems.length === 0) {
        this.broadcastStallReason(campaignId, 'All contacts have been called or are waiting for retry cooldown.');
        return;
      }

      // === TIMEZONE-BASED PRIORITIZATION ===
      // Prioritize contacts currently within their local business hours
      // Filter to enabled regions: Australia, Middle East, North America, UK
      
      interface QueueItemWithPriority {
        item: typeof queueItems[0];
        callPriority: number;
        timezone: string | null;
        canCallNow: boolean;
        reason?: string;
      }
      
      const prioritizedItems: QueueItemWithPriority[] = [];
      let skippedCountryNotEnabled = 0;
      let skippedOutsideHours = 0;
      let skippedNoTimezone = 0;
      const timezoneStats: Record<string, { total: number; callable: number }> = {};
      const skippedItemsToDisable: string[] = [];
      // Track skipped items with their detected timezone for precise delay calculation
      const skippedItemsByNextAttempt = new Map<string, string[]>(); // nextAttemptAt ISO -> queueItemIds
      const skippedNoTimezoneIds: string[] = [];

      for (const item of queueItems) {
        const contact = item.contact;

        // Check if country is in enabled calling regions
        if (!isCountryEnabled(contact.country)) {
          skippedCountryNotEnabled++;
          skippedItemsToDisable.push(item.queueItem.id);
          continue;
        }

        // Check timezone and business hours
        const callPriority = getContactCallPriority({
          country: contact.country,
          state: contact.state,
          timezone: contact.timezone,
        });

        // Track timezone stats
        const tzKey = callPriority.timezone || 'unknown';
        if (!timezoneStats[tzKey]) {
          timezoneStats[tzKey] = { total: 0, callable: 0 };
        }
        timezoneStats[tzKey].total++;

        if (!callPriority.timezone) {
          skippedNoTimezone++;
          skippedNoTimezoneIds.push(item.queueItem.id);
          continue;
        }

        if (!callPriority.canCallNow) {
          skippedOutsideHours++;
          // Calculate precise next business hours opening for this contact's timezone
          const config = getBusinessHoursForCountry(contact.country);
          config.timezone = callPriority.timezone;
          config.respectContactTimezone = false;
          const nextOpen = getNextAvailableTime(config, undefined, new Date());
          const key = nextOpen.toISOString();
          if (!skippedItemsByNextAttempt.has(key)) {
            skippedItemsByNextAttempt.set(key, []);
          }
          skippedItemsByNextAttempt.get(key)!.push(item.queueItem.id);
          continue;
        }

        timezoneStats[tzKey].callable++;

        prioritizedItems.push({
          item,
          callPriority: callPriority.priority,
          timezone: callPriority.timezone,
          canCallNow: callPriority.canCallNow,
          reason: callPriority.reason,
        });
      }

      // Set precise nextAttemptAt per timezone group (instead of blanket 1-hour delay)
      for (const [nextAttemptIso, ids] of skippedItemsByNextAttempt) {
        await db.update(campaignQueue)
          .set({
            nextAttemptAt: new Date(nextAttemptIso),
            priority: 50,
            updatedAt: new Date()
          })
          .where(inArray(campaignQueue.id, ids))
          .catch(err => console.error(`${LOG_PREFIX} Failed to delay items to ${nextAttemptIso}:`, err));
      }

      // Unknown timezone contacts: delay 2 hours, lowest priority
      if (skippedNoTimezoneIds.length > 0) {
        await db.update(campaignQueue)
          .set({
            nextAttemptAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
            priority: 10,
            updatedAt: new Date()
          })
          .where(inArray(campaignQueue.id, skippedNoTimezoneIds))
          .catch(err => console.error(`${LOG_PREFIX} Failed to delay unknown-tz items:`, err));
      }

      if (skippedItemsToDisable.length > 0) {
          // Permanently skip items in disabled countries
          await db.update(campaignQueue)
            .set({
               status: 'completed',
               removedReason: 'country_not_enabled',
               updatedAt: new Date()
            })
            .where(inArray(campaignQueue.id, skippedItemsToDisable))
            .catch(err => console.error(`${LOG_PREFIX} Failed to disable items:`, err));
      }
      
      // Sort by priority (highest first = currently in business hours)
      prioritizedItems.sort((a, b) => b.callPriority - a.callPriority);
      
      // Log timezone distribution for debugging
      const tzSummary = Object.entries(timezoneStats)
        .map(([tz, stats]) => `${tz}: ${stats.callable}/${stats.total}`)
        .join(', ');
      if (Object.keys(timezoneStats).length > 0) {
        console.log(`${LOG_PREFIX} Timezone distribution: ${tzSummary}`);
      }
      
      if (skippedCountryNotEnabled > 0 || skippedOutsideHours > 0 || skippedNoTimezone > 0) {
        console.log(`${LOG_PREFIX} Skipped: ${skippedCountryNotEnabled} country not enabled, ${skippedOutsideHours} outside hours, ${skippedNoTimezone} no timezone`);
      }

      if (prioritizedItems.length === 0 && queueItems.length > 0) {
        const parts: string[] = [];
        if (skippedOutsideHours > 0) parts.push(`${skippedOutsideHours} outside business hours`);
        if (skippedCountryNotEnabled > 0) parts.push(`${skippedCountryNotEnabled} in disabled countries`);
        if (skippedNoTimezone > 0) parts.push(`${skippedNoTimezone} with unknown timezone`);
        this.broadcastStallReason(campaignId,
          `No eligible contacts right now: ${parts.join(', ')}. Calls will resume when business hours open.`);
        return;
      }

      const tasks: CampaignTask[] = [];
      const maxTasks = 50; // Limit tasks per batch

      for (const { item } of prioritizedItems.slice(0, maxTasks)) {
        const phoneResult = getBestPhoneForContact(item.contact);
        if (!phoneResult.phone) continue;

        // Cast agent to any for optional extended fields
        const agentExt = agent as any;

        let fromNumber = campaignExt.fromNumber || process.env.TELNYX_FROM_NUMBER || '';
        let callerNumberId: string | null = null;
        let callerNumberDecisionId: string | null = null;

        try {
          const callerIdResult = await getCallerIdForCall({
            campaignId,
            prospectNumber: phoneResult.phone,
            virtualAgentId: agent?.id || undefined,
            callType: 'campaign_runner_ws',
          });
          fromNumber = callerIdResult.callerId;
          callerNumberId = callerIdResult.numberId;
          callerNumberDecisionId = callerIdResult.decisionId;

          if (callerIdResult.jitterDelayMs > 0) {
            await numberPoolSleep(callerIdResult.jitterDelayMs);
          }
        } catch (poolError) {
          console.warn(`${LOG_PREFIX} Number pool selection failed, using legacy caller ID:`, poolError);
        }

        // Use Unified Call Context to ensure consistency with test calls
        const unifiedCtx = await buildUnifiedCallContext({
          campaignId,
          queueItemId: item.queueItem.id,
          contactId: item.contact.id,
          calledNumber: phoneResult.phone,
          fromNumber,
          callerNumberId,
          callerNumberDecisionId,
          contactName: `${item.contact.firstName} ${item.contact.lastName}`,
          contactFirstName: item.contact.firstName,
          contactLastName: item.contact.lastName,
          contactEmail: item.contact.email,
          contactJobTitle: item.contact.jobTitle,
          accountName: item.account?.name,
          isTestCall: false,
          provider: 'google', // Preferred provider for production
        });

        if (!unifiedCtx) {
          console.warn(`${LOG_PREFIX} Failed to build unified context for item ${item.queueItem.id}, skipping`);
          continue;
        }

        const task: CampaignTask = {
          taskId: `${campaignId}-${item.queueItem.id}-${Date.now()}`,
          campaignId,
          queueItemId: item.queueItem.id,
          contactId: item.contact.id,
          contactFirstName: item.contact.firstName,
          contactLastName: item.contact.lastName,
          contactEmail: item.contact.email,
          contactTitle: item.contact.jobTitle,
          phoneNumber: phoneResult.phone,
          companyName: item.account?.name || null,
          accountId: item.contact.accountId,
          aiSettings: {
            persona: {
              name: unifiedCtx.agentName,
              companyName: unifiedCtx.organizationName,
              systemPrompt: unifiedCtx.systemPrompt || '',
              voice: unifiedCtx.voice,
            },
            objective: {
              type: agentExt?.primaryGoal || 'qualify',
              qualificationQuestions: agentExt?.qualifyingQuestions as string[] || [],
              meetingLink: agentExt?.calendlyLink || undefined,
            },
            handoff: {
              enabled: !!agentExt?.humanHandoffEnabled,
              transferNumber: agentExt?.humanHandoffNumber || undefined,
              handoffTriggers: agentExt?.humanHandoffTriggers as string[] || [],
            },
            callRecording: {
              enabled: true,
            },
          },
          fromNumber,
          callerNumberId,
          callerNumberDecisionId,
          virtualAgentId: unifiedCtx.virtualAgentId,
          agentName: unifiedCtx.agentName,
          agentFullName: unifiedCtx.agentName,
        };

        tasks.push(task);

        // Mark as in_progress
        await db.update(campaignQueue)
          .set({ status: 'in_progress', updatedAt: new Date() })
          .where(eq(campaignQueue.id, item.queueItem.id));
      }

      if (tasks.length > 0) {
        this.broadcastStallReason(campaignId, ''); // Clear any previous stall reason
        const existing = this.taskQueue.get(campaignId) || [];
        this.taskQueue.set(campaignId, [...existing, ...tasks]);
        console.log(`${LOG_PREFIX} Loaded ${tasks.length} tasks for campaign ${campaignId}`);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to load campaign tasks:`, error);
    }
  }

  private getNextTask(runner: RunnerClient): CampaignTask | null {
    for (const campaignId of runner.activeCampaigns) {
      // Check global campaign concurrency limit
      const config = this.campaignConfigs.get(campaignId);
      if (config) {
        const currentActive = this.getGlobalActiveCount(campaignId);
        if (currentActive >= config.maxWorkers) {
          // Skip this campaign, it's at capacity
          continue;
        }
      }

      const tasks = this.taskQueue.get(campaignId);
      if (tasks && tasks.length > 0) {
        return tasks.shift()!;
      }
    }
    return null;
  }

  private async tryAssignTask(runner: RunnerClient): Promise<void> {
    if (!runner.isReady || runner.activeCallCount >= runner.maxConcurrent) {
      return;
    }

    // Try to get a task
    let task = this.getNextTask(runner);

    // If no tasks, try to load more
    if (!task) {
      for (const campaignId of runner.activeCampaigns) {
        await this.loadCampaignTasks(campaignId);
      }
      task = this.getNextTask(runner);
    }

    if (task) {
      runner.currentTask = task;
      runner.activeCallCount++;
      this.sendMessage(runner.ws, { type: 'task', task });
    } else {
      // Check if any campaigns are complete
      for (const campaignId of runner.activeCampaigns) {
        const hasMore = await this.campaignHasMoreItems(campaignId);
        if (!hasMore) {
          this.sendMessage(runner.ws, { type: 'campaign_complete', campaignId });
        }
      }
    }
  }

  private async campaignHasMoreItems(campaignId: string): Promise<boolean> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(campaignQueue)
      .where(and(
        eq(campaignQueue.campaignId, campaignId),
        inArray(campaignQueue.status, ['queued', 'in_progress'])
      ));
    return (result?.count || 0) > 0;
  }

  private requeueTask(task: CampaignTask): void {
    // Put task back in queue
    const tasks = this.taskQueue.get(task.campaignId) || [];
    tasks.unshift(task);
    this.taskQueue.set(task.campaignId, tasks);

    // Reset status in database
    // CRITICAL FIX: Add cooldown to prevent immediate retry (back-to-back calls)
    db.update(campaignQueue)
      .set({
        status: 'queued',
        nextAttemptAt: new Date(Date.now() + 2 * 60 * 1000), // 2 minute cooldown
        updatedAt: new Date()
      })
      .where(eq(campaignQueue.id, task.queueItemId))
      .catch(err => console.error(`${LOG_PREFIX} Failed to requeue task:`, err));
  }

  private lastPriorityRefresh = Date.now();
  private readonly PRIORITY_REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

  private startProcessingLoop(): void {
    // Periodically check for stale runners and load more tasks
    this.processingInterval = setInterval(async () => {
      const now = Date.now();

      // Periodic timezone priority refresh (every 15 minutes)
      // As timezones rotate through business hours, sleeping contacts get promoted
      if (now - this.lastPriorityRefresh > this.PRIORITY_REFRESH_INTERVAL) {
        this.lastPriorityRefresh = now;
        const activeCampaignIds = new Set<string>();
        for (const runner of this.runners.values()) {
          for (const cid of runner.activeCampaigns) {
            activeCampaignIds.add(cid);
          }
        }
        for (const cid of activeCampaignIds) {
          try {
            await seedQueuePriorities(cid);
            console.log(`${LOG_PREFIX} Refreshed timezone priorities for campaign ${cid}`);
          } catch (err) {
            console.error(`${LOG_PREFIX} Failed to refresh priorities for ${cid}:`, err);
          }
        }
      }

      // Check for stale runners (no heartbeat in 30s)
      for (const [ws, runner] of this.runners.entries()) {
        if (now - runner.lastHeartbeat.getTime() > 30000) {
          console.log(`${LOG_PREFIX} Removing stale runner: ${runner.username}`);
          if (runner.currentTask) {
            this.requeueTask(runner.currentTask);
          }
          this.runners.delete(ws);
          ws.close();
        }
      }

      // Periodically (every ~1 min) check for stuck tasks in DB
      // This uses a random check to avoid thundering herd if multiple instances (though currently singleton)
      if (Math.random() < 0.05) { // ~5% chance per 5s tick ~= every 100s
        await this.resetStuckQueueItems();
      }

      // Try to assign tasks to ready runners
      for (const runner of this.runners.values()) {
        if (runner.isReady && runner.activeCallCount < runner.maxConcurrent) {
          await this.tryAssignTask(runner);
        }
      }
    }, 5000);
  }

  private sendMessage(ws: WebSocket, message: OutgoingMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcastStallReason(campaignId: string, reason: string): void {
    for (const [ws, runner] of this.runners.entries()) {
      if (runner.activeCampaigns.has(campaignId)) {
        this.sendMessage(ws, { type: 'stall_reason', campaignId, stallReason: reason });
      }
    }
  }

  private getStats(): { activeCampaigns: number; queuedItems: number; activeRunners: number } {
    let queuedItems = 0;
    for (const tasks of this.taskQueue.values()) {
      queuedItems += tasks.length;
    }
    return {
      activeCampaigns: this.taskQueue.size,
      queuedItems,
      activeRunners: this.runners.size,
    };
  }

  // Public method to add a campaign to active runners
  async startCampaignForRunners(campaignId: string): Promise<void> {
    for (const runner of this.runners.values()) {
      runner.activeCampaigns.add(campaignId);
    }
    // Pre-seed timezone-based priorities before loading tasks
    // This ensures the DB query pulls active-timezone contacts first
    try {
      const result = await seedQueuePriorities(campaignId);
      console.log(`${LOG_PREFIX} Pre-seeded ${result.updated} queue items with timezone priorities for campaign ${campaignId}`);
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to seed priorities for ${campaignId}, continuing with default ordering:`, err);
    }
    await this.loadCampaignTasks(campaignId);
  }

  getActiveRunners(): number {
    return this.runners.size;
  }

  shutdown(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    if (this.wss) {
      this.wss.close();
    }
  }
}

// Singleton instance
let campaignRunnerService: CampaignRunnerService | null = null;

export function initializeCampaignRunnerWS(server: HttpServer): WebSocketServer {
  if (!campaignRunnerService) {
    campaignRunnerService = new CampaignRunnerService();
  }
  return campaignRunnerService.initialize(server);
}

export function getCampaignRunnerService(): CampaignRunnerService | null {
  return campaignRunnerService;
}
