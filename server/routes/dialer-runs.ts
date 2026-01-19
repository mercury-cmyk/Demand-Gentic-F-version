/**
 * Dialer Runs API - Unified Manual/Hybrid/AI Execution System
 * 
 * Core Principles:
 * 1. Campaigns own audiences - dialers do not
 * 2. Manual Dial, Hybrid, and AI Agent are execution modes, not separate campaigns
 * 3. There is exactly ONE audience pool per campaign
 * 4. Dispositions are unified across AI and human agents
 * 5. Agents select dispositions; the system enforces outcomes
 * 6. Global compliance (DNC) overrides everything
 * 7. No contact may be dialed twice concurrently
 */

import { Router } from "express";
import { db } from "../db";
import { 
  dialerRuns, 
  dialerCallAttempts, 
  campaigns,
  users,
  virtualAgents,
  insertDialerRunSchema,
  type DialerRunType,
  type CanonicalDisposition
} from "@shared/schema";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { lockNextContact, releaseLock, getLockStatus, releaseExpiredLocks, countActiveContactsForAgent, lockMultipleContacts } from "../services/contact-lock";
import { preflightVoiceVariableContract } from "../services/voice-variable-contract";
import { processDisposition, isValidCanonicalDisposition } from "../services/disposition-engine";
import { z } from "zod";
import { getRealtimeStatus } from "../services/voice-dialer";

const router = Router();

// Lightweight diagnostics endpoint for OpenAI Realtime WebSocket sessions
router.get("/openai-realtime/status", async (_req, res) => {
  try {
    const status = getRealtimeStatus();
    res.json(status);
  } catch (error) {
    console.error("[Dialer Runs] OpenAI Realtime status error:", error);
    res.status(500).json({ error: "Failed to get OpenAI Realtime status" });
  }
});

// ============================================================================
// AGENT OWNERSHIP HELPER
// ============================================================================

/**
 * Verify the authenticated user/agent owns this run
 * Returns true if ownership is verified, false otherwise
 */
function verifyRunOwnership(
  run: { humanAgentId: string | null; virtualAgentId: string | null; agentType: string },
  userId: string | undefined,
  virtualAgentIdHeader?: string
): { authorized: boolean; error?: string } {
  if (run.agentType === 'human') {
    if (!userId || run.humanAgentId !== userId) {
      return { authorized: false, error: "You are not authorized to control this run" };
    }
  } else if (run.agentType === 'ai') {
    // For AI agents, verify via header or system-level call
    if (!virtualAgentIdHeader || run.virtualAgentId !== virtualAgentIdHeader) {
      return { authorized: false, error: "AI agent not authorized to control this run" };
    }
  }
  return { authorized: true };
}

// ============================================================================
// DIALER RUNS CRUD
// ============================================================================

/**
 * Create a new dialer run
 * POST /api/dialer-runs
 * 
 * Run type enforcement:
 * - MANUAL_DIAL: Used for Manual Dial campaigns and hybrid campaigns (both human and AI agents)
 */
router.post("/", async (req, res) => {
  try {
    const { campaignId, runType, agentId, agentType, maxConcurrentCalls, callTimeoutSeconds } = req.body;

    // Validate required fields
    if (!campaignId || !runType || !agentId || !agentType) {
      return res.status(400).json({ error: "Missing required fields: campaignId, runType, agentId, agentType" });
    }

    // Enforce run type / agent type mapping (server-side, non-bypassable)
    if (runType === 'manual_dial' && agentType !== 'human' && agentType !== 'ai') {
      return res.status(400).json({ error: "Manual Dial runs can be created by human or AI agents" });
    }

    // Verify campaign exists and is active
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (campaign.status !== 'active') {
      return res.status(400).json({ error: "Campaign is not active" });
    }

    // Create the dialer run
    const [newRun] = await db
      .insert(dialerRuns)
      .values({
        campaignId,
        runType,
        agentType,
        humanAgentId: agentType === 'human' ? agentId : null,
        virtualAgentId: agentType === 'ai' ? agentId : null,
        status: 'pending',
        maxConcurrentCalls: maxConcurrentCalls || 1,
        callTimeoutSeconds: callTimeoutSeconds || 30,
        createdBy: (req as any).user?.id
      })
      .returning();

    res.status(201).json(newRun);
  } catch (error) {
    console.error("[Dialer Runs] Create error:", error);
    res.status(500).json({ error: "Failed to create dialer run" });
  }
});

/**
 * List dialer runs with optional filters
 * GET /api/dialer-runs
 */
router.get("/", async (req, res) => {
  try {
    const { campaignId, status, runType, limit = "50" } = req.query;

    let query = db.select().from(dialerRuns);

    const conditions = [];
    if (campaignId) conditions.push(eq(dialerRuns.campaignId, campaignId as string));
    if (status) conditions.push(eq(dialerRuns.status, status as any));
    if (runType) conditions.push(eq(dialerRuns.runType, runType as any));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const runs = await query
      .orderBy(desc(dialerRuns.createdAt))
      .limit(parseInt(limit as string, 10));

    res.json(runs);
  } catch (error) {
    console.error("[Dialer Runs] List error:", error);
    res.status(500).json({ error: "Failed to list dialer runs" });
  }
});

/**
 * Get a specific dialer run
 * GET /api/dialer-runs/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const [run] = await db
      .select()
      .from(dialerRuns)
      .where(eq(dialerRuns.id, req.params.id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: "Dialer run not found" });
    }

    res.json(run);
  } catch (error) {
    console.error("[Dialer Runs] Get error:", error);
    res.status(500).json({ error: "Failed to get dialer run" });
  }
});

// ============================================================================
// RUN LIFECYCLE MANAGEMENT
// ============================================================================

/**
 * Start a dialer run
 * POST /api/dialer-runs/:id/start
 */
router.post("/:id/start", async (req, res) => {
  try {
    const [run] = await db
      .select()
      .from(dialerRuns)
      .where(eq(dialerRuns.id, req.params.id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: "Dialer run not found" });
    }

    // Enforce agent ownership
    const ownerCheck = verifyRunOwnership(
      run, 
      (req as any).user?.id, 
      req.headers['x-virtual-agent-id'] as string
    );
    if (!ownerCheck.authorized) {
      return res.status(403).json({ error: ownerCheck.error });
    }

    if (run.status !== 'pending' && run.status !== 'paused') {
      return res.status(400).json({ error: `Cannot start run in ${run.status} status` });
    }

    // Get total eligible contacts
    const lockStatus = await getLockStatus(run.campaignId);

    const [updatedRun] = await db
      .update(dialerRuns)
      .set({
        status: 'active',
        startedAt: run.startedAt || new Date(),
        totalContacts: lockStatus.totalQueued,
        updatedAt: new Date()
      })
      .where(eq(dialerRuns.id, req.params.id))
      .returning();

    res.json(updatedRun);
  } catch (error) {
    console.error("[Dialer Runs] Start error:", error);
    res.status(500).json({ error: "Failed to start dialer run" });
  }
});

/**
 * Pause a dialer run
 * POST /api/dialer-runs/:id/pause
 */
router.post("/:id/pause", async (req, res) => {
  try {
    // First get the run to verify ownership
    const [existingRun] = await db
      .select()
      .from(dialerRuns)
      .where(eq(dialerRuns.id, req.params.id))
      .limit(1);

    if (!existingRun) {
      return res.status(404).json({ error: "Dialer run not found" });
    }

    // Enforce agent ownership
    const ownerCheck = verifyRunOwnership(
      existingRun, 
      (req as any).user?.id, 
      req.headers['x-virtual-agent-id'] as string
    );
    if (!ownerCheck.authorized) {
      return res.status(403).json({ error: ownerCheck.error });
    }

    if (existingRun.status !== 'active') {
      return res.status(400).json({ error: `Cannot pause run in ${existingRun.status} status` });
    }

    const [run] = await db
      .update(dialerRuns)
      .set({
        status: 'paused',
        updatedAt: new Date()
      })
      .where(eq(dialerRuns.id, req.params.id))
      .returning();

    res.json(run);
  } catch (error) {
    console.error("[Dialer Runs] Pause error:", error);
    res.status(500).json({ error: "Failed to pause dialer run" });
  }
});

/**
 * Complete a dialer run
 * POST /api/dialer-runs/:id/complete
 */
router.post("/:id/complete", async (req, res) => {
  try {
    // First get the run to verify ownership
    const [existingRun] = await db
      .select()
      .from(dialerRuns)
      .where(eq(dialerRuns.id, req.params.id))
      .limit(1);

    if (!existingRun) {
      return res.status(404).json({ error: "Dialer run not found" });
    }

    // Enforce agent ownership
    const ownerCheck = verifyRunOwnership(
      existingRun, 
      (req as any).user?.id, 
      req.headers['x-virtual-agent-id'] as string
    );
    if (!ownerCheck.authorized) {
      return res.status(403).json({ error: ownerCheck.error });
    }

    const [run] = await db
      .update(dialerRuns)
      .set({
        status: 'completed',
        endedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(dialerRuns.id, req.params.id))
      .returning();

    res.json(run);
  } catch (error) {
    console.error("[Dialer Runs] Complete error:", error);
    res.status(500).json({ error: "Failed to complete dialer run" });
  }
});

/**
 * Cancel a dialer run
 * POST /api/dialer-runs/:id/cancel
 */
router.post("/:id/cancel", async (req, res) => {
  try {
    // First get the run to verify ownership
    const [existingRun] = await db
      .select()
      .from(dialerRuns)
      .where(eq(dialerRuns.id, req.params.id))
      .limit(1);

    if (!existingRun) {
      return res.status(404).json({ error: "Dialer run not found" });
    }

    // Enforce agent ownership
    const ownerCheck = verifyRunOwnership(
      existingRun, 
      (req as any).user?.id, 
      req.headers['x-virtual-agent-id'] as string
    );
    if (!ownerCheck.authorized) {
      return res.status(403).json({ error: ownerCheck.error });
    }

    const [run] = await db
      .update(dialerRuns)
      .set({
        status: 'cancelled',
        endedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(dialerRuns.id, req.params.id))
      .returning();

    res.json(run);
  } catch (error) {
    console.error("[Dialer Runs] Cancel error:", error);
    res.status(500).json({ error: "Failed to cancel dialer run" });
  }
});

// ============================================================================
// CONTACT ACQUISITION (SHARED LOCKING)
// ============================================================================

/**
 * Get next contact for dialing
 * POST /api/dialer-runs/:id/next-contact
 * 
 * Both Manual Dial and PowerDialer use this same locking logic.
 * The agent type is validated against the run type.
 */
router.post("/:id/next-contact", async (req, res) => {
  try {
    // Get the run and validate it's active
    const [run] = await db
      .select()
      .from(dialerRuns)
      .where(eq(dialerRuns.id, req.params.id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: "Dialer run not found" });
    }

    // Enforce agent ownership
    const ownerCheck = verifyRunOwnership(
      run, 
      (req as any).user?.id, 
      req.headers['x-virtual-agent-id'] as string
    );
    if (!ownerCheck.authorized) {
      return res.status(403).json({ error: ownerCheck.error });
    }

    if (run.status !== 'active') {
      return res.status(400).json({ error: `Cannot get contacts from ${run.status} run` });
    }

    // Get agent ID from the run
    const agentId = run.humanAgentId || run.virtualAgentId;
    if (!agentId) {
      return res.status(400).json({ error: "No agent assigned to this run" });
    }

    // Lock the next eligible contact (shared locking function)
    // Concurrency check is done atomically inside the transaction by locking the run row
    const lockResult = await lockNextContact(run.campaignId, run.agentType, agentId, run.maxConcurrentCalls, run.id);

    if (!lockResult.success) {
      return res.status(204).json({ 
        message: lockResult.error || "No eligible contacts available",
        runComplete: true
      });
    }

    if (run.agentType === "ai") {
      const preflight = await preflightVoiceVariableContract({
        contactId: lockResult.contactId || undefined,
        virtualAgentId: run.virtualAgentId || undefined,
        calledNumber: lockResult.phoneNumber,
        callerId: process.env.TELNYX_FROM_NUMBER || null,
      });

      if (!preflight.valid) {
        if (lockResult.queueItemId) {
          await releaseLock(lockResult.queueItemId);
        }

        return res.status(422).json({
          error: "voice_variable_preflight_failed",
          missingKeys: preflight.missingKeys,
          invalidKeys: preflight.invalidKeys,
          contractVersion: preflight.contractVersion,
        });
      }
    }

    // Create a call attempt record
    const [callAttempt] = await db
      .insert(dialerCallAttempts)
      .values({
        dialerRunId: run.id,
        campaignId: run.campaignId,
        contactId: lockResult.contactId!,
        queueItemId: lockResult.queueItemId,
        agentType: run.agentType,
        humanAgentId: run.humanAgentId,
        virtualAgentId: run.virtualAgentId,
        phoneDialed: lockResult.phoneNumber!,
        attemptNumber: lockResult.attemptNumber
      })
      .returning();

    res.json({
      callAttemptId: callAttempt.id,
      contactId: lockResult.contactId,
      phoneNumber: lockResult.phoneNumber,
      queueItemId: lockResult.queueItemId,
      attemptNumber: lockResult.attemptNumber
    });

  } catch (error) {
    console.error("[Dialer Runs] Next contact error:", error);
    res.status(500).json({ error: "Failed to get next contact" });
  }
});

/**
 * Get batch of contacts for high-throughput AI dialing
 * POST /api/dialer-runs/:id/batch-contacts
 * 
 * Locks multiple contacts at once up to maxConcurrentCalls limit.
 * Returns array of contacts ready for parallel calling.
 */
router.post("/:id/batch-contacts", async (req, res) => {
  try {
    const requestedCount = Math.min(req.body.count || 10, 50); // Max 50 per batch

    // Get the run and validate it's active
    const [run] = await db
      .select()
      .from(dialerRuns)
      .where(eq(dialerRuns.id, req.params.id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: "Dialer run not found" });
    }

    // Enforce agent ownership
    const ownerCheck = verifyRunOwnership(
      run, 
      (req as any).user?.id, 
      req.headers['x-virtual-agent-id'] as string
    );
    if (!ownerCheck.authorized) {
      return res.status(403).json({ error: ownerCheck.error });
    }

    if (run.status !== 'active') {
      return res.status(400).json({ error: `Cannot get contacts from ${run.status} run` });
    }

    const agentId = run.humanAgentId || run.virtualAgentId;
    if (!agentId) {
      return res.status(400).json({ error: "No agent assigned to this run" });
    }

    // Lock contacts with atomic concurrency enforcement
    // Each lock acquisition serializes on the run row to prevent race conditions
    const lockResults = await lockMultipleContacts(
      run.campaignId, 
      run.agentType, 
      agentId, 
      requestedCount,
      run.maxConcurrentCalls,
      run.id
    );

    if (lockResults.length === 0) {
      return res.status(204).json({ 
        message: "No eligible contacts available",
        runComplete: true
      });
    }

    let filteredLockResults = lockResults;
    const preflightFailures: Array<{
      contactId: string | null;
      queueItemId: string | null;
      missingKeys: string[];
      invalidKeys: string[];
      contractVersion: string;
    }> = [];

    if (run.agentType === "ai") {
      const preflightResults = await Promise.all(
        lockResults.map((lockResult) =>
          preflightVoiceVariableContract({
            contactId: lockResult.contactId || undefined,
            virtualAgentId: run.virtualAgentId || undefined,
            calledNumber: lockResult.phoneNumber,
            callerId: process.env.TELNYX_FROM_NUMBER || null,
          })
        )
      );

      filteredLockResults = [];
      const releasePromises: Promise<boolean>[] = [];

      lockResults.forEach((lockResult, index) => {
        const preflight = preflightResults[index];
        if (preflight.valid) {
          filteredLockResults.push(lockResult);
          return;
        }

        preflightFailures.push({
          contactId: lockResult.contactId,
          queueItemId: lockResult.queueItemId,
          missingKeys: preflight.missingKeys,
          invalidKeys: preflight.invalidKeys,
          contractVersion: preflight.contractVersion,
        });

        if (lockResult.queueItemId) {
          releasePromises.push(releaseLock(lockResult.queueItemId));
        }
      });

      if (releasePromises.length > 0) {
        await Promise.all(releasePromises);
      }

      if (filteredLockResults.length === 0) {
        return res.status(422).json({
          error: "voice_variable_preflight_failed",
          preflightFailures,
        });
      }
    }

    // Create call attempt records for all locked contacts
    const callAttempts = await Promise.all(
      filteredLockResults.map(async (lockResult) => {
        const [callAttempt] = await db
          .insert(dialerCallAttempts)
          .values({
            dialerRunId: run.id,
            campaignId: run.campaignId,
            contactId: lockResult.contactId!,
            queueItemId: lockResult.queueItemId,
            agentType: run.agentType,
            humanAgentId: run.humanAgentId,
            virtualAgentId: run.virtualAgentId,
            phoneDialed: lockResult.phoneNumber!,
            attemptNumber: lockResult.attemptNumber
          })
          .returning();
        
        return {
          callAttemptId: callAttempt.id,
          contactId: lockResult.contactId,
          phoneNumber: lockResult.phoneNumber,
          queueItemId: lockResult.queueItemId,
          attemptNumber: lockResult.attemptNumber
        };
      })
    );

    // Get fresh concurrency info after locking
    const activeContacts = await countActiveContactsForAgent(run.agentType, agentId);

    res.json({
      contacts: callAttempts,
      count: callAttempts.length,
      activeContacts,
      maxConcurrentCalls: run.maxConcurrentCalls,
      availableSlots: Math.max(0, run.maxConcurrentCalls - activeContacts),
      preflightFailures: preflightFailures.length > 0 ? preflightFailures : undefined,
    });

  } catch (error) {
    console.error("[Dialer Runs] Batch contacts error:", error);
    res.status(500).json({ error: "Failed to get batch contacts" });
  }
});

/**
 * Get run status including concurrency info
 * GET /api/dialer-runs/:id/status
 */
router.get("/:id/status", async (req, res) => {
  try {
    const [run] = await db
      .select()
      .from(dialerRuns)
      .where(eq(dialerRuns.id, req.params.id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: "Dialer run not found" });
    }

    const agentId = run.humanAgentId || run.virtualAgentId;
    const activeContacts = agentId 
      ? await countActiveContactsForAgent(run.agentType, agentId)
      : 0;

    res.json({
      id: run.id,
      status: run.status,
      agentType: run.agentType,
      maxConcurrentCalls: run.maxConcurrentCalls,
      activeContacts,
      availableSlots: Math.max(0, run.maxConcurrentCalls - activeContacts),
      stats: {
        totalContacts: run.totalContacts,
        contactsProcessed: run.contactsProcessed,
        contactsConnected: run.contactsConnected,
        qualifiedLeads: run.qualifiedLeads,
        dncRequests: run.dncRequests,
        voicemails: run.voicemails,
        noAnswers: run.noAnswers,
        invalidData: run.invalidData,
        notInterested: run.notInterested
      },
      startedAt: run.startedAt,
      endedAt: run.endedAt
    });
  } catch (error) {
    console.error("[Dialer Runs] Status error:", error);
    res.status(500).json({ error: "Failed to get run status" });
  }
});

// ============================================================================
// DISPOSITION SUBMISSION
// ============================================================================

/**
 * Submit disposition for a call attempt
 * POST /api/call-attempts/:id/disposition
 * 
 * This invokes the Disposition Engine which enforces all outcomes.
 * Only canonical dispositions are allowed.
 */
router.post("/call-attempts/:id/disposition", async (req, res) => {
  try {
    const { disposition, notes } = req.body;

    // Validate disposition is one of the 6 canonical values
    if (!disposition || !isValidCanonicalDisposition(disposition)) {
      return res.status(400).json({ 
        error: "Invalid disposition. Must be one of: qualified_lead, not_interested, do_not_call, voicemail, no_answer, invalid_data"
      });
    }

    // Get the call attempt
    const [callAttempt] = await db
      .select()
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.id, req.params.id))
      .limit(1);

    if (!callAttempt) {
      return res.status(404).json({ error: "Call attempt not found" });
    }

    if (callAttempt.disposition) {
      return res.status(400).json({ error: "Disposition already submitted for this call attempt" });
    }

    // Update call attempt with disposition and notes
    await db
      .update(dialerCallAttempts)
      .set({
        disposition,
        dispositionSubmittedAt: new Date(),
        dispositionSubmittedBy: (req as any).user?.id,
        notes: notes || callAttempt.notes,
        updatedAt: new Date()
      })
      .where(eq(dialerCallAttempts.id, req.params.id));

    // Process the disposition through the Disposition Engine
    const result = await processDisposition(
      req.params.id,
      disposition as CanonicalDisposition,
      (req as any).user?.id || 'system'
    );

    if (!result.success) {
      // Log the error but still return success since disposition was recorded
      console.error("[Disposition Engine] Processing errors:", result.errors);
    }

    res.json({
      success: true,
      callAttemptId: req.params.id,
      disposition,
      actions: result.actions,
      leadId: result.leadId,
      nextAttemptAt: result.nextAttemptAt,
      errors: result.errors
    });

  } catch (error) {
    console.error("[Dialer Runs] Disposition error:", error);
    res.status(500).json({ error: "Failed to submit disposition" });
  }
});

/**
 * Mark call as started (when telephony connects)
 * PATCH /api/call-attempts/:id/start
 */
router.patch("/call-attempts/:id/start", async (req, res) => {
  try {
    const { callSessionId, connected, voicemailDetected } = req.body;

    const [updated] = await db
      .update(dialerCallAttempts)
      .set({
        callStartedAt: new Date(),
        callSessionId,
        connected: connected ?? false,
        voicemailDetected: voicemailDetected ?? false,
        updatedAt: new Date()
      })
      .where(eq(dialerCallAttempts.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Call attempt not found" });
    }

    // Update dialer run connected count if connected
    if (connected) {
      await db.execute(sql`
        UPDATE dialer_runs 
        SET contacts_connected = contacts_connected + 1, updated_at = NOW()
        WHERE id = ${updated.dialerRunId}
      `);
    }

    res.json(updated);
  } catch (error) {
    console.error("[Dialer Runs] Call start error:", error);
    res.status(500).json({ error: "Failed to update call start" });
  }
});

/**
 * Mark call as ended
 * PATCH /api/call-attempts/:id/end
 */
router.patch("/call-attempts/:id/end", async (req, res) => {
  try {
    const { recordingUrl, callDurationSeconds } = req.body;

    const [updated] = await db
      .update(dialerCallAttempts)
      .set({
        callEndedAt: new Date(),
        callDurationSeconds,
        recordingUrl,
        updatedAt: new Date()
      })
      .where(eq(dialerCallAttempts.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Call attempt not found" });
    }

    // If no disposition was submitted, release the lock
    if (!updated.disposition && updated.queueItemId) {
      await releaseLock(updated.queueItemId);
    }

    res.json(updated);
  } catch (error) {
    console.error("[Dialer Runs] Call end error:", error);
    res.status(500).json({ error: "Failed to update call end" });
  }
});

// ============================================================================
// REPORTING
// ============================================================================

/**
 * Get run statistics
 * GET /api/dialer-runs/:id/stats
 */
router.get("/:id/stats", async (req, res) => {
  try {
    const [run] = await db
      .select()
      .from(dialerRuns)
      .where(eq(dialerRuns.id, req.params.id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: "Dialer run not found" });
    }

    // Get current lock status
    const lockStatus = await getLockStatus(run.campaignId);

    // Calculate rates
    const contactsProcessed = run.contactsProcessed || 0;
    const connected = run.contactsConnected || 0;
    const qualified = run.qualifiedLeads || 0;

    const connectionRate = contactsProcessed > 0 ? connected / contactsProcessed : 0;
    const qualificationRate = connected > 0 ? qualified / connected : 0;
    const voicemailRate = contactsProcessed > 0 ? (run.voicemails || 0) / contactsProcessed : 0;
    const noAnswerRate = contactsProcessed > 0 ? (run.noAnswers || 0) / contactsProcessed : 0;
    const invalidDataRate = contactsProcessed > 0 ? (run.invalidData || 0) / contactsProcessed : 0;
    const dncRate = contactsProcessed > 0 ? (run.dncRequests || 0) / contactsProcessed : 0;

    res.json({
      run,
      lockStatus,
      rates: {
        connectionRate: (connectionRate * 100).toFixed(2) + '%',
        qualificationRate: (qualificationRate * 100).toFixed(2) + '%',
        voicemailRate: (voicemailRate * 100).toFixed(2) + '%',
        noAnswerRate: (noAnswerRate * 100).toFixed(2) + '%',
        invalidDataRate: (invalidDataRate * 100).toFixed(2) + '%',
        dncRate: (dncRate * 100).toFixed(2) + '%'
      }
    });
  } catch (error) {
    console.error("[Dialer Runs] Stats error:", error);
    res.status(500).json({ error: "Failed to get run stats" });
  }
});

/**
 * Get campaign-level reporting by run type and agent type
 * GET /api/dialer-runs/reports/campaign/:campaignId
 */
router.get("/reports/campaign/:campaignId", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Get aggregated metrics by run type
    const metrics = await db.execute(sql`
      SELECT 
        run_type,
        agent_type,
        COUNT(*) as total_runs,
        SUM(contacts_processed) as total_processed,
        SUM(contacts_connected) as total_connected,
        SUM(qualified_leads) as total_qualified,
        SUM(dnc_requests) as total_dnc,
        SUM(voicemails) as total_voicemails,
        SUM(no_answers) as total_no_answers,
        SUM(invalid_data) as total_invalid_data,
        SUM(not_interested) as total_not_interested,
        AVG(CASE WHEN contacts_processed > 0 
          THEN contacts_connected::float / contacts_processed 
          ELSE 0 END) as avg_connection_rate,
        AVG(CASE WHEN contacts_connected > 0 
          THEN qualified_leads::float / contacts_connected 
          ELSE 0 END) as avg_qualification_rate
      FROM dialer_runs
      WHERE campaign_id = ${req.params.campaignId}
        ${startDate ? sql`AND created_at >= ${startDate}::timestamp` : sql``}
        ${endDate ? sql`AND created_at <= ${endDate}::timestamp` : sql``}
      GROUP BY run_type, agent_type
    `);

    res.json({
      campaignId: req.params.campaignId,
      metrics: metrics.rows
    });
  } catch (error) {
    console.error("[Dialer Runs] Campaign report error:", error);
    res.status(500).json({ error: "Failed to get campaign report" });
  }
});

// ============================================================================
// MAINTENANCE
// ============================================================================

/**
 * Release expired locks (maintenance endpoint)
 * POST /api/dialer-runs/maintenance/release-locks
 */
router.post("/maintenance/release-locks", async (req, res) => {
  try {
    const releasedCount = await releaseExpiredLocks();
    res.json({ released: releasedCount });
  } catch (error) {
    console.error("[Dialer Runs] Lock release error:", error);
    res.status(500).json({ error: "Failed to release expired locks" });
  }
});

/**
 * Get canonical dispositions list
 * GET /api/dialer-runs/dispositions
 */
router.get("/dispositions/list", async (req, res) => {
  res.json({
    dispositions: [
      { code: 'qualified_lead', label: 'Qualified Lead', description: 'Contact qualified - routes to QA queue', systemAction: 'Route to QA, create lead, stop dialing' },
      { code: 'not_interested', label: 'Not Interested', description: 'Contact not interested', systemAction: 'Remove from this campaign' },
      { code: 'do_not_call', label: 'Do Not Call', description: 'DNC request - global suppression', systemAction: 'Add to global DNC, remove from all campaigns' },
      { code: 'voicemail', label: 'Voicemail', description: 'Left voicemail', systemAction: 'Schedule retry in 3-7 days' },
      { code: 'no_answer', label: 'No Answer', description: 'No answer', systemAction: 'Schedule retry in 3-7 days' },
      { code: 'invalid_data', label: 'Invalid Data', description: 'Wrong number, disconnected, etc.', systemAction: 'Mark phone invalid, remove from campaign' }
    ]
  });
});

// ============================================================================
// OPENAI REALTIME VOICE INTEGRATION
// ============================================================================

/**
 * Get OpenAI Realtime session status
 * GET /api/dialer-runs/openai-realtime/status
 */
router.get("/voice-dialer/status", async (req, res) => {
  try {
    const { getActiveSessionCount } = await import("../services/voice-dialer");
    res.json({
      activeSessions: getActiveSessionCount(),
      websocketPath: "/voice-dialer",
      provider: "google",
      model: "gemini-2.5-flash"
    });
  } catch (error) {
    console.error("[Dialer Runs] OpenAI Realtime status error:", error);
    res.status(500).json({ error: "Failed to get OpenAI Realtime status" });
  }
});

/**
 * Get WebSocket connection info for initiating OpenAI Realtime calls
 * GET /api/dialer-runs/:id/openai-realtime/connect-info
 * 
 * Returns the WebSocket URL and parameters needed to connect Telnyx to OpenAI Realtime.
 * IMPORTANT: You must first call POST /api/dialer-runs/:id/next-contact to lock a contact
 * and create a call attempt, then use the returned IDs in the WebSocket connection.
 */
router.get("/:id/openai-realtime/connect-info", async (req, res) => {
  try {
    const [run] = await db
      .select()
      .from(dialerRuns)
      .where(eq(dialerRuns.id, req.params.id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: "Dialer run not found" });
    }

    if (run.agentType !== 'ai') {
      return res.status(400).json({ error: "OpenAI Realtime is only available for AI agent runs" });
    }

    if (run.status !== 'active') {
      return res.status(400).json({ error: "Run must be active to initiate calls" });
    }

    // Get the base URL from request or environment
    const host = req.headers.host || process.env.REPLIT_DEV_DOMAIN || 'localhost:5000';
    const protocol = host.includes('localhost') ? 'ws' : 'wss';
    
    res.json({
      websocketUrl: `${protocol}://${host}/voice-dialer`,
      requiredParameters: {
        call_id: "Unique identifier for this call (e.g., Telnyx call_control_id)",
        run_id: run.id,
        campaign_id: run.campaignId,
        queue_item_id: "From POST /api/dialer-runs/:id/next-contact response",
        call_attempt_id: "From POST /api/dialer-runs/:id/next-contact response",
        contact_id: "From POST /api/dialer-runs/:id/next-contact response"
      },
      workflow: [
        "1. Call POST /api/dialer-runs/:id/next-contact to lock a contact and get queue_item_id, call_attempt_id, contact_id",
        "2. Initiate Telnyx outbound call to the contact's phone",
        "3. Configure Telnyx to stream media to this WebSocket URL with all parameters in start.custom_parameters",
        "4. The Voice Dialer session will be created automatically when the call connects",
        "5. Disposition will be submitted automatically via function calling and processed through the Disposition Engine"
      ]
    });
  } catch (error) {
    console.error("[Dialer Runs] OpenAI Realtime connect info error:", error);
    res.status(500).json({ error: "Failed to get connection info" });
  }
});

/**
 * Terminate an active Voice Dialer session
 * POST /api/dialer-runs/voice-dialer/terminate/:callId
 */
router.post("/voice-dialer/terminate/:callId", async (req, res) => {
  try {
    const { terminateSession } = await import("../services/voice-dialer");
    const terminated = await terminateSession(req.params.callId);
    
    if (terminated) {
      res.json({ success: true, message: "Session terminated" });
    } else {
      res.status(404).json({ error: "Session not found" });
    }
  } catch (error) {
    console.error("[Dialer Runs] OpenAI Realtime terminate error:", error);
    res.status(500).json({ error: "Failed to terminate session" });
  }
});

export default router;
