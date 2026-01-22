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
  getBusinessHoursForCountry 
} from "../utils/business-hours";
import { processDisposition } from "./disposition-engine";

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
  type: 'registered' | 'task' | 'no_tasks' | 'campaign_complete' | 'error' | 'heartbeat_ack' | 'stats';
  task?: CampaignTask;
  campaignId?: string;
  error?: string;
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

  initialize(server: HttpServer): WebSocketServer {
    this.wss = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false,
    });

    this.wss.on("connection", (ws: WebSocket, req) => {
      console.log(`${LOG_PREFIX} New connection from ${req.socket.remoteAddress}`);
      this.handleConnection(ws);
    });

    // Start task distribution loop
    this.startProcessingLoop();

    console.log(`${LOG_PREFIX} Initialized`);
    return this.wss;
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
    try {
      // Get campaign details
      const [campaign] = await db.select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign || campaign.status !== 'active') {
        console.log(`${LOG_PREFIX} Campaign ${campaignId} not active`);
        return;
      }

      // Get virtual agent if assigned (using any cast for extended campaign fields)
      const campaignExt = campaign as any;
      const virtualAgentId = campaignExt.virtualAgentId;
      const [agent] = virtualAgentId 
        ? await db.select().from(virtualAgents).where(eq(virtualAgents.id, virtualAgentId)).limit(1)
        : [];

      // Get queued queue items with contact and account info
      // Filter out contacts that are suppressed (next_call_eligible_at > NOW())
      // Order by priority and creation time (timezone filtering done post-query)
      const queueItems = await db.select({
        queueItem: campaignQueue,
        contact: contacts,
        account: accounts,
      })
      .from(campaignQueue)
      .innerJoin(contacts, eq(campaignQueue.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(and(
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
        )
      ))
      .orderBy(campaignQueue.priority, campaignQueue.createdAt)
      .limit(200); // Load more to allow for timezone filtering

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

      for (const item of queueItems) {
        const contact = item.contact;
        
        // Check if country is in enabled calling regions
        if (!isCountryEnabled(contact.country)) {
          skippedCountryNotEnabled++;
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
          continue;
        }
        
        if (!callPriority.canCallNow) {
          skippedOutsideHours++;
          continue; // Skip contacts outside business hours - they'll be called later
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

      const tasks: CampaignTask[] = [];
      const maxTasks = 50; // Limit tasks per batch

      for (const { item } of prioritizedItems.slice(0, maxTasks)) {
        const phoneResult = getBestPhoneForContact(item.contact);
        if (!phoneResult.phone) continue;

        // Cast agent to any for optional extended fields
        const agentExt = agent as any;

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
              name: agent?.name || campaign.name,
              companyName: agentExt?.companyRepresented || 'Our Company',
              systemPrompt: agent?.systemPrompt || campaignExt.aiAgentPrompt || '',
              voice: agent?.voice || 'alloy',
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
          fromNumber: campaignExt.fromNumber || process.env.TELNYX_FROM_NUMBER || '',
          virtualAgentId: agent?.id || null,
          agentName: agent?.name || 'AI Agent',
          agentFullName: agent?.name || 'AI Sales Agent',
        };

        tasks.push(task);

        // Mark as in_progress
        await db.update(campaignQueue)
          .set({ status: 'in_progress', updatedAt: new Date() })
          .where(eq(campaignQueue.id, item.queueItem.id));
      }

      if (tasks.length > 0) {
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

  private startProcessingLoop(): void {
    // Periodically check for stale runners and load more tasks
    this.processingInterval = setInterval(async () => {
      const now = Date.now();

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
