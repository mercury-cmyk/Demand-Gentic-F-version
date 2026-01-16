import { storage } from "../storage";
import type { AgentStatus, Campaign } from "@shared/schema";
import { isWithinBusinessHours, type BusinessHoursConfig } from "../utils/business-hours";
import { VoicemailPolicyExecutor } from "./voicemail-policy-executor";
import { getBestPhoneForContact, normalizePhoneWithCountryCode } from "../lib/phone-utils";
import { db } from "../db";
import { contacts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isContactEligibleForCall } from "../lib/contact-suppression";

interface DialerConfig {
  pollingIntervalMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

const DEFAULT_CONFIG: DialerConfig = {
  pollingIntervalMs: 5000, // Check every 5 seconds (reduced from 2s to prevent connection exhaustion)
  maxRetries: 3,
  retryDelayMs: 5000,
};

interface AMDResult {
  result: 'human' | 'machine' | 'unknown';
  confidence: number; // 0.00 - 1.00
}

interface PacingMetrics {
  callsInitiated: number;
  callsAnswered: number;
  callsAbandoned: number;
  abandonRate: number;
  targetAbandonRate: number;
  currentDialRatio: number;
}

export class PowerDialerEngine {
  private isRunning: boolean = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private config: DialerConfig;
  private voicemailExecutor: VoicemailPolicyExecutor;
  private pacingMetrics: Map<string, PacingMetrics> = new Map(); // campaignId -> metrics
  private isProcessing = false; // Prevent overlapping executions
  
  // Circuit breaker state
  private consecutiveFailures = 0;
  private lastFailureTime: Date | null = null;
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5; // Open circuit after 5 consecutive failures
  private readonly CIRCUIT_BREAKER_RESET_TIME_MS = 60000; // Reset after 1 minute

  constructor(config: Partial<DialerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.voicemailExecutor = new VoicemailPolicyExecutor();
  }

  /**
   * Start the auto-dialer service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[AutoDialer] Service already running");
      return;
    }

    this.isRunning = true;
    console.log("[AutoDialer] Service started");

    // Start polling for active campaigns
    this.pollingInterval = setInterval(async () => {
      // Skip if previous execution still running
      if (this.isProcessing) {
        console.log("[AutoDialer] Skipping poll - previous execution still in progress");
        return;
      }
      await this.processActiveQueues();
    }, this.config.pollingIntervalMs);

    // Run immediately on start
    await this.processActiveQueues();
  }

  /**
   * Stop the auto-dialer service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    console.log("[AutoDialer] Service stopped");
  }

  /**
   * Check if circuit breaker should prevent execution
   */
  private shouldSkipDueToCircuitBreaker(): boolean {
    // If we have recent failures, check if we should open the circuit
    if (this.consecutiveFailures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      const now = new Date();
      const timeSinceLastFailure = this.lastFailureTime 
        ? now.getTime() - this.lastFailureTime.getTime()
        : Infinity;
      
      if (timeSinceLastFailure < this.CIRCUIT_BREAKER_RESET_TIME_MS) {
        // Circuit is open, skip execution
        return true;
      } else {
        // Enough time has passed, reset circuit breaker
        console.log("[AutoDialer] Circuit breaker reset - attempting to resume");
        this.consecutiveFailures = 0;
        this.lastFailureTime = null;
        return false;
      }
    }
    return false;
  }

  /**
   * Process all active auto-dialer queues
   */
  private async processActiveQueues(): Promise<void> {
    if (this.isProcessing) {
      return; // Already processing, skip
    }

    // Check circuit breaker
    if (this.shouldSkipDueToCircuitBreaker()) {
      console.log("[AutoDialer] Circuit breaker OPEN - skipping poll to prevent connection exhaustion");
      return;
    }

    this.isProcessing = true;
    
    // Create timeout that can be cleared
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Query timeout')), 10000);
    });
    
    try {
      // Get all active auto-dialer queues with a reasonable timeout
      const queues = await Promise.race([
        storage.getAllAutoDialerQueues(true),
        timeoutPromise
      ]) as any[];

      // Clear timeout on success to prevent spurious failure
      clearTimeout(timeoutId!);
      
      // Reset failure counter on success
      this.consecutiveFailures = 0;
      this.lastFailureTime = null;

      for (const queue of queues) {
        await this.processQueue(queue.campaignId);
      }
    } catch (error) {
      // Clear timeout on error too
      clearTimeout(timeoutId!);

      // Increment failure counter
      this.consecutiveFailures++;
      this.lastFailureTime = new Date();
      
      console.error("[AutoDialer] Error processing queues:", error);
      
      // Log specific error types
      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('Query timeout')) {
          console.error("[AutoDialer] Database timeout detected - query took too long. Failures:", this.consecutiveFailures);
        } else if (error.message.includes('Connection terminated')) {
          console.error("[AutoDialer] Database connection terminated. Failures:", this.consecutiveFailures);
        }
      }
      
      // Warn if approaching circuit breaker threshold
      if (this.consecutiveFailures >= this.CIRCUIT_BREAKER_THRESHOLD - 2) {
        console.warn(`[AutoDialer] WARNING: ${this.consecutiveFailures} consecutive failures. Circuit breaker will open at ${this.CIRCUIT_BREAKER_THRESHOLD}`);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single campaign queue
   */
  private async processQueue(campaignId: string): Promise<void> {
    try {
      // Get campaign details
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign || campaign.type !== 'call') {
        return;
      }

      // Get auto-dialer queue settings
      const queue = await storage.getAutoDialerQueue(campaignId);
      if (!queue || !queue.isActive) {
        return;
      }

      // Get available agents for this campaign
      const availableAgents = await this.getAvailableAgents(campaignId);
      
      if (availableAgents.length === 0) {
        return; // No agents available
      }

      // Calculate how many calls to make (with pacing for predictive mode)
      const callsToMake = this.calculateCallsToMake(availableAgents.length, queue, campaignId);

      // Get contacts from campaign queue
      const contacts = await this.getNextContacts(campaignId, callsToMake);

      if (contacts.length === 0) {
        console.log(`[AutoDialer] No contacts in queue for campaign ${campaignId}`);
        return;
      }

      // Distribute calls to agents
      await this.distributeCallsToAgents(contacts, availableAgents, campaign, queue);

    } catch (error) {
      console.error(`[AutoDialer] Error processing campaign ${campaignId}:`, error);
    }
  }

  /**
   * Get available agents for a campaign
   */
  private async getAvailableAgents(campaignId: string): Promise<AgentStatus[]> {
    // Get all available agents (status = 'available')
    const allAvailable = await storage.getAvailableAgents();
    
    // Filter agents assigned to this campaign
    const campaignAgentAssignments = await storage.getCampaignAgentAssignments(campaignId);
    const assignedAgentIds = new Set(campaignAgentAssignments.map(a => a.agentId));
    
    // Return only agents assigned to this campaign
    return allAvailable.filter(agent => assignedAgentIds.has(agent.agentId));
  }

  /**
   * Calculate how many calls to make based on dialing mode (with pacing)
   */
  private calculateCallsToMake(availableAgentCount: number, queue: any, campaignId: string): number {
    const { dialingMode, dialRatio, maxConcurrentCalls } = queue;

    if (dialingMode === 'progressive') {
      // Progressive: 1 call per available agent
      return Math.min(availableAgentCount, maxConcurrentCalls || availableAgentCount);
    } else if (dialingMode === 'predictive') {
      // Predictive: use dynamic dial ratio with abandon-rate feedback
      const adjustedRatio = this.calculateDynamicDialRatio(campaignId, dialRatio || 1.5);
      const predictiveCalls = Math.floor(availableAgentCount * adjustedRatio);
      return Math.min(predictiveCalls, maxConcurrentCalls || predictiveCalls);
    } else if (dialingMode === 'preview') {
      // Preview: manual dialing, no auto-dial
      return 0;
    }

    return availableAgentCount;
  }

  /**
   * Calculate dynamic dial ratio based on abandon rate feedback
   * Uses PID-like control to maintain target abandon rate
   */
  private calculateDynamicDialRatio(campaignId: string, baseRatio: number): number {
    const metrics = this.pacingMetrics.get(campaignId);
    
    if (!metrics || metrics.callsAnswered + metrics.callsAbandoned < 20) {
      // Not enough data, use base ratio
      return baseRatio;
    }

    const { abandonRate, targetAbandonRate } = metrics;
    const error = abandonRate - targetAbandonRate;

    // Adjust dial ratio based on error
    // If abandon rate is too high, reduce ratio
    // If abandon rate is too low, increase ratio
    const adjustmentFactor = 0.1; // 10% adjustment per iteration
    let adjustedRatio = metrics.currentDialRatio;

    if (error > 0.01) {
      // Abandon rate too high, reduce dial ratio
      adjustedRatio = Math.max(1.0, adjustedRatio - (adjustedRatio * adjustmentFactor));
    } else if (error < -0.01) {
      // Abandon rate too low, increase dial ratio
      adjustedRatio = Math.min(baseRatio, adjustedRatio + (adjustedRatio * adjustmentFactor));
    }

    // Update metrics with new dial ratio
    metrics.currentDialRatio = adjustedRatio;
    this.pacingMetrics.set(campaignId, metrics);

    console.log(`[PowerDialer] Pacing - Campaign ${campaignId}: Abandon rate ${(abandonRate * 100).toFixed(2)}%, Dial ratio ${adjustedRatio.toFixed(2)}`);

    return adjustedRatio;
  }

  /**
   * Get pacing metrics for a campaign
   */
  getPacingMetrics(campaignId: string): PacingMetrics | undefined {
    return this.pacingMetrics.get(campaignId);
  }

  /**
   * Get next contacts to dial from campaign queue
   */
  private async getNextContacts(campaignId: string, limit: number): Promise<any[]> {
    try {
      // Get pending queue items
      const queueItems = await storage.getCampaignQueue(campaignId, 'pending');
      
      // Sort by priority (higher priority first) and enqueued time (FIFO)
      const sortedItems = queueItems
        .sort((a, b) => {
          // First sort by priority (descending)
          if (b.priority !== a.priority) {
            return (b.priority || 0) - (a.priority || 0);
          }
          // Then by enqueued time (ascending - FIFO)
          return new Date(a.enqueuedAt).getTime() - new Date(b.enqueuedAt).getTime();
        })
        .slice(0, limit);

      return sortedItems;
    } catch (error) {
      console.error(`[AutoDialer] Error fetching contacts for campaign ${campaignId}:`, error);
      return [];
    }
  }

  /**
   * Distribute calls to available agents
   */
  private async distributeCallsToAgents(
    contacts: any[],
    agents: AgentStatus[],
    campaign: Campaign,
    queue: any
  ): Promise<void> {
    // Sort agents by longest idle (least recently ended call)
    const sortedAgents = [...agents].sort((a, b) => {
      const aTime = a.lastCallEndedAt ? new Date(a.lastCallEndedAt).getTime() : 0;
      const bTime = b.lastCallEndedAt ? new Date(b.lastCallEndedAt).getTime() : 0;
      return aTime - bTime; // Oldest first
    });

    for (let i = 0; i < Math.min(contacts.length, sortedAgents.length); i++) {
      const contact = contacts[i];
      const agent = sortedAgents[i];

      try {
        // Get full contact details for validation
        const fullContact = await storage.getContact(contact.contactId);
        
        if (!fullContact) {
          console.log(`[AutoDialer] Contact ${contact.contactId} not found, skipping`);
          await storage.updateQueueStatus(contact.id, 'removed', 'Contact not found');
          continue;
        }

        // CONTACT-LEVEL RETRY SUPPRESSION CHECK
        if (!isContactEligibleForCall(fullContact.nextCallEligibleAt)) {
          console.log(`[AutoDialer] Contact ${contact.contactId} suppressed until ${fullContact.nextCallEligibleAt}, skipping`);
          // Don't mark as removed - will be retried when eligible
          continue;
        }

        // PHONE COUNTRY VALIDATION: Only call contacts with phone matching their country
        const bestPhone = getBestPhoneForContact(fullContact);
        if (!bestPhone.phone) {
          console.log(`[AutoDialer] Contact ${contact.contactId} has no valid phone matching country ${fullContact.country}, skipping`);
          await storage.updateQueueStatus(contact.id, 'removed', 'No valid phone for country');
          continue;
        }

        // Update contact with normalized phone if needed (only for contact-owned phones, not HQ)
        if (bestPhone.type === 'direct' && !fullContact.directPhoneE164 && fullContact.directPhone) {
          const normalized = normalizePhoneWithCountryCode(fullContact.directPhone, fullContact.country);
          if (normalized.e164) {
            await db
              .update(contacts)
              .set({ directPhoneE164: normalized.e164, updatedAt: new Date() })
              .where(eq(contacts.id, fullContact.id));
            console.log(`[AutoDialer] Updated contact ${fullContact.id} with normalized direct phone`);
          }
        } else if (bestPhone.type === 'mobile' && !fullContact.mobilePhoneE164 && fullContact.mobilePhone) {
          const normalized = normalizePhoneWithCountryCode(fullContact.mobilePhone, fullContact.country);
          if (normalized.e164) {
            await db
              .update(contacts)
              .set({ mobilePhoneE164: normalized.e164, updatedAt: new Date() })
              .where(eq(contacts.id, fullContact.id));
            console.log(`[AutoDialer] Updated contact ${fullContact.id} with normalized mobile phone`);
          }
        }
        // Note: 'hq' phone type is read-only from account table, no update needed

        // Check business hours if enabled
        if (campaign.businessHoursConfig) {
          const config = campaign.businessHoursConfig as BusinessHoursConfig;
          
          const contactTimezoneInfo = {
            timezone: fullContact.timezone,
            city: fullContact.city,
            state: fullContact.state,
            country: fullContact.country,
          };

          const canCall = isWithinBusinessHours(config, contactTimezoneInfo);
          
          if (!canCall) {
            console.log(`[AutoDialer] Contact ${contact.contactId} is outside business hours, skipping`);
            // Don't mark as removed - will be retried in next cycle
            continue;
          }
        }

        // Check campaign-level suppressions FIRST (highest priority)
        const isCampaignSuppressed = await this.checkCampaignSuppression(
          contact.contactId,
          contact.accountId,
          campaign.id
        );
        if (isCampaignSuppressed) {
          console.log(`[AutoDialer] Contact ${contact.contactId} is suppressed for campaign ${campaign.id}, skipping`);
          await storage.updateQueueStatus(contact.id, 'removed', 'Campaign suppression');
          continue;
        }

        // Then check global DNC if enabled
        if (queue.checkDnc) {
          const isDnc = await this.checkDnc(contact.phone);
          if (isDnc) {
            console.log(`[AutoDialer] Contact ${contact.contactId} is on global DNC list, skipping`);
            await storage.updateQueueStatus(contact.id, 'removed', 'Global DNC');
            continue;
          }
        }

        // Initiate call
        await this.initiateCall(contact, agent, campaign, queue);

      } catch (error) {
        console.error(`[AutoDialer] Error initiating call for contact ${contact.contactId}:`, error);
      }
    }
  }

  /**
   * Check if number is on Do Not Call list
   */
  private async checkDnc(phone: string | null): Promise<boolean> {
    if (!phone) return true; // No phone number = skip

    try {
      const results = await storage.checkPhoneSuppressionBulk([phone]);
      return results.size > 0;
    } catch (error) {
      console.error(`[AutoDialer] Error checking DNC for ${phone}:`, error);
      return false; // Default to allow on error
    }
  }

  /**
   * Check if contact or account is suppressed for a specific campaign
   */
  private async checkCampaignSuppression(
    contactId: string,
    accountId: string | null,
    campaignId: string
  ): Promise<boolean> {
    try {
      const { db } = await import('../db');
      const { campaignSuppressionContacts, campaignSuppressionAccounts } = await import('../../shared/schema');
      const { eq, and } = await import('drizzle-orm');

      // Check if contact is suppressed for this campaign
      const contactSuppression = await db.query.campaignSuppressionContacts.findFirst({
        where: and(
          eq(campaignSuppressionContacts.campaignId, campaignId),
          eq(campaignSuppressionContacts.contactId, contactId)
        ),
      });

      if (contactSuppression) {
        return true;
      }

      // Check if account is suppressed for this campaign
      if (accountId) {
        const accountSuppression = await db.query.campaignSuppressionAccounts.findFirst({
          where: and(
            eq(campaignSuppressionAccounts.campaignId, campaignId),
            eq(campaignSuppressionAccounts.accountId, accountId)
          ),
        });

        if (accountSuppression) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error(`[AutoDialer] Error checking campaign suppression:`, error);
      return false; // Default to allow on error
    }
  }

  /**
   * Initiate a call to a contact (with AMD support for power mode)
   */
  private async initiateCall(
    queueItem: any,
    agent: AgentStatus,
    campaign: Campaign,
    queue: any
  ): Promise<void> {
    try {
      console.log(`[AutoDialer] Initiating call: Contact ${queueItem.contactId} → Agent ${agent.agentId}`);

      // Update queue status to 'calling'
      await storage.updateQueueStatus(queueItem.id, 'calling');

      // For hybrid mode, agent stays available until human detected
      // For manual mode, agent is immediately set to busy
      const isHybridMode = campaign.dialMode === 'hybrid' || campaign.dialMode === 'ai_agent';
      
      if (!isHybridMode) {
        await storage.updateAgentStatus(agent.agentId, {
          status: 'busy',
          campaignId: campaign.id,
        });
      }

      // Create call attempt record
      const callAttempt = await storage.createCallAttempt({
        contactId: queueItem.contactId,
        agentId: agent.agentId,
        campaignId: campaign.id,
        startedAt: new Date(),
      });

      // Log call event
      await storage.createCallEvent({
        attemptId: callAttempt.id,
        type: 'dial_started',
        metadata: {
          queueItemId: queueItem.id,
          contactId: queueItem.contactId,
          agentId: agent.agentId,
          phone: queueItem.phone,
          dialMode: campaign.dialMode,
        },
      });

      // Log activity for contact
      await storage.createActivityLog({
        entityType: 'contact',
        entityId: queueItem.contactId,
        eventType: 'call_started',
        payload: {
          title: `Call initiated`,
          description: `${isHybridMode ? 'Automated dialer' : 'Agent'} started call attempt`,
          campaignId: campaign.id,
          campaignName: campaign.name,
          agentId: agent.agentId,
          attemptId: callAttempt.id,
          phone: queueItem.phone,
          dialMode: campaign.dialMode,
        },
        createdBy: agent.agentId,
      });

      // Update pacing metrics
      this.updatePacingMetrics(campaign.id, 'call_initiated');

      // TODO: Integrate with Telnyx Call Control API to actually place the call
      // In hybrid mode, AMD will be enabled automatically
      console.log(`[AutoDialer] Call attempt created: ${callAttempt.id} (${campaign.dialMode} mode)`);

    } catch (error) {
      console.error(`[AutoDialer] Error initiating call:`, error);
      
      // Rollback agent status on error
      await storage.updateAgentStatus(agent.agentId, {
        status: 'available',
      });
      
      // Rollback queue status
      await storage.updateQueueStatus(queueItem.id, 'pending');
    }
  }

  /**
   * Process AMD (Answering Machine Detection) result
   * This is called when Telnyx webhook returns AMD analysis
   */
  async processAMDResult(
    callAttemptId: string,
    amdResult: AMDResult
  ): Promise<void> {
    try {
      const attempt = await storage.getCallAttempt(callAttemptId);
      if (!attempt) {
        console.error(`[PowerDialer] Call attempt not found: ${callAttemptId}`);
        return;
      }

      const campaign = await storage.getCampaign(attempt.campaignId);
      if (!campaign) {
        console.error(`[PowerDialer] Campaign not found: ${attempt.campaignId}`);
        return;
      }

      // Get AMD configuration from campaign power settings
      const powerSettings = (campaign as any).powerSettings;
      const amdConfig = powerSettings?.amd || {
        enabled: true,
        confidenceThreshold: 0.70,
        timeout: 3000,
      };

      console.log(`[PowerDialer] AMD Result: ${amdResult.result} (confidence: ${amdResult.confidence})`);

      // Decision pipeline based on AMD result and confidence
      if (amdResult.result === 'human' && amdResult.confidence >= amdConfig.confidenceThreshold) {
        // HUMAN DETECTED: Route to agent
        await this.routeCallToAgent(callAttemptId, attempt.agentId, amdResult);
      } else if (amdResult.result === 'machine' && amdResult.confidence >= amdConfig.confidenceThreshold) {
        // MACHINE DETECTED: Execute voicemail policy
        await this.routeToVoicemailPolicy(callAttemptId, attempt, amdResult);
      } else {
        // UNKNOWN or LOW CONFIDENCE: Default behavior based on campaign settings
        const defaultAction = powerSettings?.amd?.unknownAction || 'route_to_agent';
        
        if (defaultAction === 'route_to_agent') {
          await this.routeCallToAgent(callAttemptId, attempt.agentId, amdResult);
        } else {
          await this.routeToVoicemailPolicy(callAttemptId, attempt, amdResult);
        }
      }

    } catch (error) {
      console.error(`[PowerDialer] Error processing AMD result:`, error);
    }
  }

  /**
   * Route human-detected call to agent
   */
  private async routeCallToAgent(
    callAttemptId: string,
    agentId: string,
    amdResult: AMDResult
  ): Promise<void> {
    try {
      console.log(`[PowerDialer] Routing HUMAN call to agent ${agentId}`);

      // Update agent status to busy (for power mode)
      await storage.updateAgentStatus(agentId, {
        status: 'busy',
        campaignId: (await storage.getCallAttempt(callAttemptId))?.campaignId,
      });

      // Update call attempt with AMD result
      await storage.updateCallAttempt(callAttemptId, {
        amdResult: amdResult.result,
        amdConfidence: amdResult.confidence.toString(),
      });

      // Log event
      await storage.createCallEvent({
        attemptId: callAttemptId,
        type: 'amd_human_detected',
        metadata: {
          amdResult: amdResult.result,
          confidence: amdResult.confidence,
          routedToAgent: agentId,
        },
      });

      // Update pacing metrics
      const attempt = await storage.getCallAttempt(callAttemptId);
      if (attempt) {
        this.updatePacingMetrics(attempt.campaignId, 'call_answered');
      }

      // TODO: Bridge call to agent via Telnyx
      console.log(`[PowerDialer] Call ${callAttemptId} bridged to agent ${agentId}`);

    } catch (error) {
      console.error(`[PowerDialer] Error routing call to agent:`, error);
    }
  }

  /**
   * Route machine-detected call to voicemail policy
   */
  private async routeToVoicemailPolicy(
    callAttemptId: string,
    attempt: any,
    amdResult: AMDResult
  ): Promise<void> {
    try {
      console.log(`[PowerDialer] Routing MACHINE call to voicemail policy`);

      // Release agent back to available (for power mode)
      await storage.updateAgentStatus(attempt.agentId, {
        status: 'available',
      });

      // Get campaign voicemail policy
      const campaign = await storage.getCampaign(attempt.campaignId);
      const powerSettings = (campaign as any)?.powerSettings;
      const vmPolicy = powerSettings?.voicemailPolicy;

      if (!vmPolicy) {
        console.log(`[PowerDialer] No voicemail policy configured, hanging up`);
        await this.handleCallEnded(callAttemptId, 'no-answer');
        return;
      }

      // Execute voicemail policy with AMD tracking
      const result = await this.voicemailExecutor.executeMachinePolicy(
        attempt.campaignId,
        attempt.contactId,
        callAttemptId,
        vmPolicy as any, // Cast from JSON config
        amdResult.result,
        amdResult.confidence
      );

      console.log(`[PowerDialer] Voicemail policy executed: ${result.action}`);

      // Update pacing metrics (count as abandoned if no agent connected)
      this.updatePacingMetrics(attempt.campaignId, 'call_abandoned');

    } catch (error) {
      console.error(`[PowerDialer] Error routing to voicemail policy:`, error);
    }
  }

  /**
   * Update pacing metrics for abandon rate tracking
   */
  private updatePacingMetrics(
    campaignId: string,
    event: 'call_initiated' | 'call_answered' | 'call_abandoned'
  ): void {
    const metrics = this.pacingMetrics.get(campaignId) || {
      callsInitiated: 0,
      callsAnswered: 0,
      callsAbandoned: 0,
      abandonRate: 0,
      targetAbandonRate: 0.03, // 3% target
      currentDialRatio: 1.0,
    };

    if (event === 'call_initiated') {
      metrics.callsInitiated++;
    } else if (event === 'call_answered') {
      metrics.callsAnswered++;
    } else if (event === 'call_abandoned') {
      metrics.callsAbandoned++;
    }

    // Calculate abandon rate
    const totalAnswered = metrics.callsAnswered + metrics.callsAbandoned;
    if (totalAnswered > 0) {
      metrics.abandonRate = metrics.callsAbandoned / totalAnswered;
    }

    this.pacingMetrics.set(campaignId, metrics);
  }

  /**
   * Handle call answer event (triggered by external webhook/event)
   */
  async handleCallAnswered(callAttemptId: string, telnyxCallId: string): Promise<void> {
    try {
      const attempt = await storage.getCallAttempt(callAttemptId);
      if (!attempt) {
        console.error(`[AutoDialer] Call attempt not found: ${callAttemptId}`);
        return;
      }

      // Update call attempt
      await storage.updateCallAttempt(callAttemptId, {
        disposition: 'connected',
      });

      // Log event
      await storage.createCallEvent({
        attemptId: callAttemptId,
        type: 'call_answered',
        metadata: { telnyxCallId },
      });

      console.log(`[AutoDialer] Call answered: ${callAttemptId}`);
    } catch (error) {
      console.error(`[AutoDialer] Error handling call answered:`, error);
    }
  }

  /**
   * Handle call ended event (triggered by external webhook/event)
   */
  async handleCallEnded(callAttemptId: string, disposition?: string, duration?: number): Promise<void> {
    try {
      const attempt = await storage.getCallAttempt(callAttemptId);
      if (!attempt) {
        console.error(`[AutoDialer] Call attempt not found: ${callAttemptId}`);
        return;
      }

      // Get campaign details for activity log
      const campaign = await storage.getCampaign(attempt.campaignId);

      // Update call attempt
      await storage.updateCallAttempt(callAttemptId, {
        endedAt: new Date(),
        duration,
        disposition: disposition as any, // Cast to enum type
      });

      // Auto-create Lead for qualified dispositions
      if (disposition === 'qualified') {
        console.log(`[AutoDialer] Creating lead for qualified disposition: ${callAttemptId}`);
        const lead = await storage.createLeadFromCallAttempt(callAttemptId);
        if (lead) {
          console.log(`[AutoDialer] ✅ Lead created: ${lead.id} for contact ${lead.contactName}`);
        } else {
          console.warn(`[AutoDialer] ⚠️ Failed to create lead for call attempt ${callAttemptId}`);
        }
      }

      // Update agent status to 'after_call_work'
      await storage.updateAgentStatus(attempt.agentId, {
        status: 'after_call_work',
        lastCallEndedAt: new Date(),
        totalCallsToday: (attempt as any).totalCallsToday ? (attempt as any).totalCallsToday + 1 : 1,
        totalTalkTimeToday: duration || 0,
      });

      // Log event
      await storage.createCallEvent({
        attemptId: callAttemptId,
        type: 'call_ended',
        metadata: { disposition, duration },
      });

      // Log activity for contact
      await storage.createActivityLog({
        entityType: 'contact',
        entityId: attempt.contactId,
        eventType: 'call_ended',
        payload: {
          title: `Call ended: ${disposition || 'no-answer'}`,
          description: `Call concluded with ${disposition || 'no-answer'} disposition${duration ? ` after ${Math.round(duration)}s` : ''}`,
          campaignId: attempt.campaignId,
          campaignName: campaign?.name || 'Unknown Campaign',
          agentId: attempt.agentId,
          attemptId: callAttemptId,
          disposition,
          duration,
        },
        createdBy: attempt.agentId,
      });

      console.log(`[AutoDialer] Call ended: ${callAttemptId} - ${disposition}`);
    } catch (error) {
      console.error(`[AutoDialer] Error handling call ended:`, error);
    }
  }

  /**
   * Complete after-call work and return agent to available
   */
  async completeAfterCallWork(agentId: string): Promise<void> {
    try {
      await storage.updateAgentStatus(agentId, {
        status: 'available',
      });
      console.log(`[AutoDialer] Agent ${agentId} completed after-call work`);
    } catch (error) {
      console.error(`[AutoDialer] Error completing after-call work:`, error);
    }
  }
}

// Export singleton instance
export const powerDialerEngine = new PowerDialerEngine();

// Legacy export for backward compatibility
export const autoDialerService = powerDialerEngine;
