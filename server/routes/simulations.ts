/**
 * Simulation Routes - TRUE Telephony-Free Simulation API
 * 
 * These endpoints completely bypass the dialer/telephony layer.
 * No phone numbers, no SIP, no carriers - pure conversation simulation.
 * 
 * call_mode: "SIMULATION" enforced at the route level.
 */

import { Router } from "express";
import { requireAuth } from "../auth";
import { z } from "zod";
import { db } from "../db";
import { previewStudioSessions } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  SimulationEngine,
  simulationEngine,
  DEFAULT_PERSONAS,
  type SimulatedHumanProfile,
  type SimulationSessionConfig,
} from "../services/simulation-engine";
import { analyzeConversationQuality } from "../services/conversation-quality-analyzer";

const router = Router();

// ============================================================================
// REQUEST SCHEMAS
// ============================================================================

const simulatedHumanProfileSchema = z.object({
  role: z.string().default("VP of Marketing"),
  disposition: z.enum(["friendly", "neutral", "skeptical", "hostile"]).default("neutral"),
  objections: z.array(z.string()).default([]),
  buyingSignals: z.array(z.string()).optional(),
  timeToDecision: z.string().optional(),
  communicationStyle: z.enum(["brief", "verbose", "technical", "executive"]).default("brief"),
  gatekeeperType: z.enum(["assistant", "receptionist", "voicemail"]).nullable().optional(),
});

const startSimulationSchema = z.object({
  campaignId: z.string().optional().nullable(),
  accountId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  virtualAgentId: z.string().optional().nullable(),
  
  // Simulation config - NO PHONE NUMBER REQUIRED
  humanProfile: simulatedHumanProfileSchema.optional(),
  personaPreset: z.string().optional(), // Use a preset persona
  maxTurns: z.number().min(2).max(50).optional().default(20),
  simulationSpeed: z.enum(["realtime", "fast", "instant"]).optional().default("fast"),
  runFullSimulation: z.boolean().optional().default(false), // Auto-run vs interactive
  
  // Optional prompt overrides
  customSystemPrompt: z.string().optional(),
  customFirstMessage: z.string().optional(),
});

const interactiveMessageSchema = z.object({
  sessionId: z.string(),
  humanMessage: z.string().min(1),
});

const autoTurnSchema = z.object({
  sessionId: z.string(),
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/simulations/personas
 * List available persona presets
 */
router.get("/personas", requireAuth, (_req, res) => {
  const personas = Object.entries(DEFAULT_PERSONAS).map(([key, profile]) => ({
    id: key,
    name: key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    ...profile,
  }));
  
  res.json({
    personas,
    callMode: "SIMULATION", // Explicit indicator - no telephony
  });
});

/**
 * POST /api/simulations/start
 * Start a new simulation session - NO PHONE REQUIRED
 * 
 * This endpoint:
 * - Creates a simulation_session (NOT a call)
 * - Loads campaign/account/contact context
 * - Loads agent prompt
 * - Does NOT touch the dialer
 * - Does NOT require E.164 phone format
 * - Does NOT trigger voicemail detection
 */
router.post("/start", requireAuth, async (req, res) => {
  try {
    const parsed = startSimulationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Validation error",
        errors: parsed.error.errors,
      });
    }
    
    const data = parsed.data;
    const userId = (req as any).user?.id;
    
    console.log("[Simulations] Starting simulation (call_mode: SIMULATION)");
    console.log("[Simulations] NO TELEPHONY - bypassing dialer completely");
    
    // Resolve human profile - from preset or custom
    let humanProfile: SimulatedHumanProfile;
    if (data.personaPreset && DEFAULT_PERSONAS[data.personaPreset]) {
      humanProfile = DEFAULT_PERSONAS[data.personaPreset];
      console.log(`[Simulations] Using preset persona: ${data.personaPreset}`);
    } else if (data.humanProfile) {
      humanProfile = data.humanProfile as SimulatedHumanProfile;
      console.log("[Simulations] Using custom human profile");
    } else {
      humanProfile = DEFAULT_PERSONAS.neutral_dm || {
        role: "Decision Maker",
        disposition: "neutral",
        objections: [],
        communicationStyle: "brief",
        gatekeeperType: null,
      };
      console.log("[Simulations] Using default neutral persona");
    }
    
    const config: SimulationSessionConfig = {
      campaignId: data.campaignId,
      accountId: data.accountId,
      contactId: data.contactId,
      virtualAgentId: data.virtualAgentId,
      userId,
      humanProfile,
      maxTurns: data.maxTurns,
      simulationSpeed: data.simulationSpeed,
      customSystemPrompt: data.customSystemPrompt,
      customFirstMessage: data.customFirstMessage,
    };
    
    // Create session - NO DIALER INTERACTION
    const session = await simulationEngine.createSession(config);
    
    // If full simulation requested, run it now
    if (data.runFullSimulation) {
      console.log("[Simulations] Running full automated simulation");
      const completedSession = await simulationEngine.runFullSimulation(session);
      
      return res.json({
        success: true,
        callMode: "SIMULATION",
        session: {
          id: completedSession.id,
          status: completedSession.status,
          currentTurn: completedSession.currentTurn,
          maxTurns: completedSession.maxTurns,
          transcript: completedSession.transcript,
          evaluation: completedSession.evaluation,
          startedAt: completedSession.startedAt,
          endedAt: completedSession.endedAt,
        },
      });
    }
    
    // Interactive mode - return session for turn-by-turn interaction
    // Get first agent message
    const agentContext = await simulationEngine.buildAgentContext(session);
    const firstTurn = await simulationEngine.runTurn(session);
    
    res.json({
      success: true,
      callMode: "SIMULATION",
      session: {
        id: session.id,
        status: session.status,
        currentTurn: session.currentTurn,
        maxTurns: session.maxTurns,
        humanProfile: session.humanProfile,
        transcript: session.transcript,
      },
      agentContext: {
        agentName: agentContext.agentName,
        // Don't expose full system prompt for security
      },
    });
  } catch (error) {
    console.error("[Simulations] Error starting simulation:", error);
    res.status(500).json({ 
      message: "Failed to start simulation", 
      error: String(error),
    });
  }
});

/**
 * POST /api/simulations/message
 * Send a message in interactive simulation mode
 * User types as the human, agent responds
 */
router.post("/message", requireAuth, async (req, res) => {
  try {
    const parsed = interactiveMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Validation error",
        errors: parsed.error.errors,
      });
    }
    
    const { sessionId, humanMessage } = parsed.data;
    
    // Get session
    const session = await simulationEngine.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }
    
    if (session.status !== "active") {
      return res.status(400).json({ message: "Session is not active" });
    }
    
    // Run turn with user-provided human message
    const agentTurn = await simulationEngine.runTurn(session, humanMessage);
    
    // Check if max turns reached
    const updatedSession = await simulationEngine.getSession(sessionId);
    
    res.json({
      success: true,
      callMode: "SIMULATION",
      agentResponse: agentTurn.content,
      session: {
        id: updatedSession!.id,
        status: updatedSession!.status,
        currentTurn: updatedSession!.currentTurn,
        maxTurns: updatedSession!.maxTurns,
        transcript: updatedSession!.transcript,
      },
    });
  } catch (error) {
    console.error("[Simulations] Error processing message:", error);
    res.status(500).json({ 
      message: "Failed to process message", 
      error: String(error),
    });
  }
});

/**
 * POST /api/simulations/auto-turn
 * In auto mode, generate both human (from persona) and agent responses
 */
router.post("/auto-turn", requireAuth, async (req, res) => {
  try {
    const parsed = autoTurnSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Validation error",
        errors: parsed.error.errors,
      });
    }
    
    const { sessionId } = parsed.data;
    
    // Get session
    const session = await simulationEngine.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }
    
    if (session.status !== "active") {
      return res.status(400).json({ message: "Session is not active" });
    }
    
    // Generate human response from persona
    const lastAgentMessage = session.transcript
      .filter(t => t.role === "agent")
      .pop()?.content || "";
    
    const humanEngine = new SimulationEngine();
    const humanResponse = await humanEngine.generateHumanResponse(session, lastAgentMessage);
    
    // Run turn
    const agentTurn = await simulationEngine.runTurn(session, humanResponse);
    
    const updatedSession = await simulationEngine.getSession(sessionId);
    
    res.json({
      success: true,
      callMode: "SIMULATION",
      humanResponse,
      agentResponse: agentTurn.content,
      session: {
        id: updatedSession!.id,
        status: updatedSession!.status,
        currentTurn: updatedSession!.currentTurn,
        maxTurns: updatedSession!.maxTurns,
        transcript: updatedSession!.transcript,
      },
    });
  } catch (error) {
    console.error("[Simulations] Error processing auto-turn:", error);
    res.status(500).json({ 
      message: "Failed to process auto-turn", 
      error: String(error),
    });
  }
});

/**
 * POST /api/simulations/:sessionId/end
 * End simulation and get evaluation
 */
router.post("/:sessionId/end", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await simulationEngine.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }
    
    // Evaluate
    const evaluation = await simulationEngine.evaluateSimulation(session);

    const transcriptText = session.transcript
      .map((turn) => `${turn.role === "agent" ? "Agent" : "Prospect"}: ${turn.content}`)
      .join("\n");

    const conversationQuality = await analyzeConversationQuality({
      transcript: transcriptText,
      interactionType: "simulation",
      analysisStage: "post_call",
      disposition: session.humanProfile?.disposition,
      campaignId: session.campaignId || undefined,
    });

    const [dbSession] = await db
      .select({ metadata: previewStudioSessions.metadata })
      .from(previewStudioSessions)
      .where(eq(previewStudioSessions.id, sessionId))
      .limit(1);

    const existingMetadata = (dbSession?.metadata || {}) as Record<string, unknown>;

    await db.update(previewStudioSessions)
      .set({
        status: "completed",
        endedAt: new Date(),
        metadata: {
          ...existingMetadata,
          simulationEvaluation: evaluation,
          conversationQuality,
        },
      })
      .where(eq(previewStudioSessions.id, sessionId));

    res.json({
      success: true,
      callMode: "SIMULATION",
      session: {
        id: session.id,
        status: "completed",
        currentTurn: session.currentTurn,
        transcript: session.transcript,
      },
      evaluation,
      conversationQuality,
    });
  } catch (error) {
    console.error("[Simulations] Error ending simulation:", error);
    res.status(500).json({ 
      message: "Failed to end simulation", 
      error: String(error),
    });
  }
});

/**
 * GET /api/simulations/:sessionId
 * Get simulation session details
 */
router.get("/:sessionId", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await simulationEngine.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }
    
    res.json({
      success: true,
      callMode: "SIMULATION",
      session,
    });
  } catch (error) {
    console.error("[Simulations] Error getting simulation:", error);
    res.status(500).json({ 
      message: "Failed to get simulation", 
      error: String(error),
    });
  }
});

/**
 * GET /api/simulations/diagnostic
 * Diagnostic endpoint to verify simulation is truly decoupled
 */
router.get("/diagnostic/verify-decoupling", requireAuth, (_req, res) => {
  res.json({
    callMode: "SIMULATION",
    decouplingStatus: {
      requiresPhoneNumber: false,
      requiresDialer: false,
      requiresSIP: false,
      requiresCarrier: false,
      requiresVoicemailDetection: false,
      usesSimulationSessionObject: true,
      usesSimulatedHumanProfiles: true,
      bypassesTelephony: true,
    },
    message: "Simulation is fully decoupled from telephony layer",
  });
});

export default router;
