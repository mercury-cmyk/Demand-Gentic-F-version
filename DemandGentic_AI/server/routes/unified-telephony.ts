import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { dialerCallAttempts } from "@shared/schema";
import { normalizeTranscriptTurns } from "../services/transcript-structuring";
import aiCallsRouter from "./ai-calls";
import agentCallControlRouter from "./agent-call-control";
import callIntelligenceRouter from "./call-intelligence-routes";
import numberPoolRouter from "./number-pool";
import recordingsRouter from "./recordings";
import reportingRoutes from "./reporting-routes";
import telephonyProvidersRouter from "./telephony-providers";
import telnyxWebhookRouter from "./telnyx-webhook-management";
import texmlRouter from "./texml";
import voiceEngineRouter from "./voice-engine-routes";
import voiceProviderRoutes from "./voice-provider-routes";

const router = Router();
const sipRouter = Router();

function getQuerySuffix(req: Request): string {
  const queryIndex = req.originalUrl.indexOf("?");
  return queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";
}

function redirectToLegacy(pathOrBuilder: string | ((req: Request) => string)) {
  return (req: Request, res: Response) => {
    const legacyPath = typeof pathOrBuilder === "function" ? pathOrBuilder(req) : pathOrBuilder;
    res.redirect(307, `${legacyPath}${getQuerySuffix(req)}`);
  };
}

async function getUserTelephonySettings(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      callbackPhone: (user as any).callbackPhone || null,
      sipExtension: (user as any).sipExtension || null,
    });
  } catch (error) {
    console.error("[UnifiedTelephony] Failed to get user telephony settings:", error);
    return res.status(500).json({ message: "Failed to load telephony settings" });
  }
}

async function updateUserTelephonySettings(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const { callbackPhone, sipExtension } = req.body;
    await storage.updateUser(userId, {
      callbackPhone: callbackPhone || null,
      sipExtension: sipExtension || null,
    } as any);

    return res.json({ success: true });
  } catch (error) {
    console.error("[UnifiedTelephony] Failed to update user telephony settings:", error);
    return res.status(500).json({ message: "Failed to save telephony settings" });
  }
}

async function listSipTrunks(_req: Request, res: Response) {
  try {
    const configs = await storage.getSipTrunkConfigs();
    return res.json(configs);
  } catch (error) {
    console.error("[UnifiedTelephony] Failed to list SIP trunks:", error);
    return res.status(500).json({ message: "Failed to fetch SIP trunk configurations" });
  }
}

async function createSipTrunk(req: Request, res: Response) {
  try {
    const config = await storage.createSipTrunkConfig(req.body);
    return res.status(201).json(config);
  } catch (error) {
    console.error("[UnifiedTelephony] Failed to create SIP trunk:", error);
    return res.status(500).json({ message: "Failed to create SIP trunk configuration" });
  }
}

async function updateSipTrunk(req: Request, res: Response) {
  try {
    const config = await storage.updateSipTrunkConfig(req.params.id, req.body);
    if (!config) return res.status(404).json({ message: "SIP trunk configuration not found" });
    return res.json(config);
  } catch (error) {
    console.error("[UnifiedTelephony] Failed to update SIP trunk:", error);
    return res.status(500).json({ message: "Failed to update SIP trunk configuration" });
  }
}

async function deleteSipTrunk(req: Request, res: Response) {
  try {
    await storage.deleteSipTrunkConfig(req.params.id);
    return res.json({ success: true });
  } catch (error) {
    console.error("[UnifiedTelephony] Failed to delete SIP trunk:", error);
    return res.status(500).json({ message: "Failed to delete SIP trunk configuration" });
  }
}

async function setDefaultSipTrunk(req: Request, res: Response) {
  try {
    await storage.setDefaultSipTrunk(req.params.id);
    return res.json({ success: true });
  } catch (error) {
    console.error("[UnifiedTelephony] Failed to set default SIP trunk:", error);
    return res.status(500).json({ message: "Failed to set default SIP trunk" });
  }
}

async function importSipTrunkFromEnv(_req: Request, res: Response) {
  try {
    const sipUsername = process.env.TELNYX_WEBRTC_USERNAME || process.env.TELNYX_SIP_USERNAME;
    const sipPassword = process.env.TELNYX_WEBRTC_PASSWORD || process.env.TELNYX_SIP_PASSWORD;

    if (!sipUsername || !sipPassword) {
      return res.status(422).json({
        message: "No SIP credentials found in environment (TELNYX_SIP_USERNAME/TELNYX_SIP_PASSWORD)",
      });
    }

    const config = await storage.createSipTrunkConfig({
      name: "Imported from Environment",
      provider: "telnyx",
      sipUsername,
      sipPassword,
      sipDomain: process.env.TELNYX_SIP_DOMAIN || "sip.telnyx.com",
      connectionId: process.env.TELNYX_WEBRTC_CREDENTIAL_ID || process.env.TELNYX_SIP_CONNECTION_ID || null,
      callerIdNumber: process.env.TELNYX_FROM_NUMBER || null,
      isActive: true,
      isDefault: true,
    });

    return res.status(201).json(config);
  } catch (error) {
    console.error("[UnifiedTelephony] Failed to import SIP trunk from env:", error);
    return res.status(500).json({ message: "Failed to import SIP trunk from environment" });
  }
}

async function getDefaultSipTrunk(_req: Request, res: Response) {
  try {
    const dbConfig = await storage.getDefaultSipTrunkConfig();
    if (dbConfig) {
      return res.json({
        sipUsername: dbConfig.sipUsername,
        sipPassword: dbConfig.sipPassword,
        sipDomain: dbConfig.sipDomain || "sip.telnyx.com",
        connectionId: dbConfig.connectionId,
        callerIdNumber: dbConfig.callerIdNumber || process.env.TELNYX_FROM_NUMBER,
        name: dbConfig.name,
        source: "database",
      });
    }

    const sipUsername = process.env.TELNYX_WEBRTC_USERNAME || process.env.TELNYX_SIP_USERNAME;
    const sipPassword = process.env.TELNYX_WEBRTC_PASSWORD || process.env.TELNYX_SIP_PASSWORD;
    const sipDomain = process.env.TELNYX_SIP_DOMAIN || "sip.telnyx.com";
    const connectionId = process.env.TELNYX_WEBRTC_CREDENTIAL_ID || process.env.TELNYX_SIP_CONNECTION_ID;
    const callerIdNumber = process.env.TELNYX_FROM_NUMBER;

    if (sipUsername && sipPassword) {
      return res.json({
        sipUsername,
        sipPassword,
        sipDomain,
        connectionId,
        callerIdNumber,
        source: "environment",
      });
    }

    return res.status(404).json({
      message: "SIP trunk not configured",
      hint: "Configure SIP credentials in database or set TELNYX_WEBRTC_USERNAME and TELNYX_WEBRTC_PASSWORD environment variables",
    });
  } catch (error) {
    console.error("[UnifiedTelephony] Failed to fetch default SIP trunk:", error);
    return res.status(500).json({
      message: "Failed to fetch SIP trunk configuration",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function handleMediaBridgeCallback(req: Request, res: Response) {
  try {
    const { callId, action, data, secret } = req.body;
    const bridgeSecret = process.env.MEDIA_BRIDGE_SECRET || "bridge-secret";

    if (secret !== bridgeSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const callAttemptId = data?.callAttemptId || data?.context?.callAttemptId || null;
    console.log(`[UnifiedTelephony] Media bridge ${action} for ${callId} (callAttemptId: ${callAttemptId})`, data);

    if (action === "end_call") {
      const { drachtioServer } = await import("../services/sip/drachtio-server");
      try {
        await drachtioServer.endCall(callId);
      } catch (error) {
        console.error(`[UnifiedTelephony] Failed to end SIP call ${callId}:`, error);
      }

      if (callAttemptId && data?.disposition) {
        const { processDisposition } = await import("../services/disposition-engine");
        const { processSIPPostCallAnalysis } = await import("../services/sip/sip-post-call-handler");
        let durationToSet = data?.callDurationSeconds;
        if (data?.callDurationSeconds) {
          try {
            await db
              .update(dialerCallAttempts)
              .set({ callDurationSeconds: data.callDurationSeconds, updatedAt: new Date() })
              .where(eq(dialerCallAttempts.id, callAttemptId));
          } catch (error) {
            console.error("[UnifiedTelephony] Failed to update call duration on end_call:", error);
          }
        }

        const dispositionResult = await processDisposition(callAttemptId, data.disposition, "media_bridge", {
          transcript: data?.transcript || undefined,
          structuredTranscript: data?.structuredTranscript || undefined,
        });
        try {
          const rawTurns = normalizeTranscriptTurns(
            Array.isArray(data?.structuredTranscript?.turns)
              ? data.structuredTranscript.turns
              : data?.transcript || ''
          );
          await processSIPPostCallAnalysis({
            callAttemptId,
            leadId: dispositionResult?.leadId,
            campaignId: data?.context?.campaignId || "",
            contactName: data?.context?.contactName || data?.context?.contactFirstName,
            disposition: data.disposition,
            turnTranscript: rawTurns
              .map((turn: any) => ({
                speaker: turn.role === "agent" ? "agent" : "contact",
                text: String(turn.text || "").trim(),
                timestamp: turn.timestamp ? Date.parse(turn.timestamp) : undefined,
              }))
              .filter((turn: { text: string }) => turn.text),
            callDurationSeconds: durationToSet || 0,
            agentNotes: "media_bridge end_call callback",
          });
        } catch (postCallErr) {
          console.error("[UnifiedTelephony] SIP post-call handler failed on end_call (non-fatal):", postCallErr);
        }
      }
    } else if (action === "submit_disposition" && callAttemptId) {
      const { processDisposition } = await import("../services/disposition-engine");
      const { processSIPPostCallAnalysis } = await import("../services/sip/sip-post-call-handler");
      let durationToSet = data?.callDurationSeconds;
      if (data?.callDurationSeconds) {
        try {
          await db
            .update(dialerCallAttempts)
            .set({ callDurationSeconds: data.callDurationSeconds, updatedAt: new Date() })
            .where(eq(dialerCallAttempts.id, callAttemptId));
        } catch (error) {
          console.error("[UnifiedTelephony] Failed to update call duration on submit_disposition:", error);
        }
      }

      const dispositionResult = await processDisposition(callAttemptId, data?.disposition || "no_answer", "media_bridge", {
        transcript: data?.transcript || undefined,
        structuredTranscript: data?.structuredTranscript || undefined,
      });
      try {
        const rawTurns = normalizeTranscriptTurns(
          Array.isArray(data?.structuredTranscript?.turns)
            ? data.structuredTranscript.turns
            : data?.transcript || ''
        );
        await processSIPPostCallAnalysis({
          callAttemptId,
          leadId: dispositionResult?.leadId,
          campaignId: data?.context?.campaignId || "",
          contactName: data?.context?.contactName || data?.context?.contactFirstName,
          disposition: data?.disposition || "no_answer",
          turnTranscript: rawTurns
            .map((turn) => ({
              speaker: turn.role === "agent" ? "agent" : "contact",
              text: String(turn.text || "").trim(),
              timestamp: turn.timestamp ? Date.parse(turn.timestamp) : undefined,
            }))
            .filter((turn: { text: string }) => turn.text),
          callDurationSeconds: durationToSet || 0,
          agentNotes: "media_bridge submit_disposition callback",
        });
      } catch (postCallErr) {
        console.error("[UnifiedTelephony] SIP post-call handler failed on submit_disposition (non-fatal):", postCallErr);
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error("[UnifiedTelephony] Media bridge callback error:", error);
    return res.status(500).json({ error: error.message });
  }
}

function buildManifest() {
  return {
    success: true,
    namespace: "/api/telephony",
    compatibility: {
      legacyRoutesUnchanged: true,
      mode: "additive_alias",
    },
    categories: {
      aiCalls: "/api/telephony/ai-calls",
      calls: "/api/telephony/calls",
      sip: "/api/telephony/sip",
      voiceEngine: "/api/telephony/voice-engine",
      voiceProviders: "/api/telephony/voice-providers",
      numbers: "/api/telephony/number-pool",
      telephonyProviders: "/api/telephony/providers",
      recordings: "/api/telephony/recordings",
      analytics: "/api/telephony/analytics",
      callIntelligence: "/api/telephony/call-intelligence",
      telnyx: "/api/telephony/telnyx",
      texml: "/api/telephony/texml",
    },
    featuredEndpoints: {
      userTelephonySettings: "/api/telephony/users/me/telephony",
      sipDefaultTrunk: "/api/telephony/sip/trunks/default",
      sipMediaBridgeCallback: "/api/telephony/sip/media-bridge/callback",
      telnyxWebrtcToken: "/api/telephony/telnyx/webrtc-token",
      recordingsGcsUrl: "/api/telephony/recordings/:id/gcs-url",
      callReportsGlobal: "/api/telephony/analytics/reports/calls/global",
      callIntelligenceUnified: "/api/telephony/analytics/intelligence/unified",
      engagementAnalytics: "/api/telephony/analytics/engagement",
    },
  };
}

router.get("/", (_req, res) => {
  res.json(buildManifest());
});

router.get("/manifest", (_req, res) => {
  res.json(buildManifest());
});

router.get("/users/me/telephony", requireAuth, getUserTelephonySettings);
router.put("/users/me/telephony", requireAuth, updateUserTelephonySettings);

sipRouter.get("/settings/me", requireAuth, getUserTelephonySettings);
sipRouter.put("/settings/me", requireAuth, updateUserTelephonySettings);
sipRouter.get("/trunks", requireAuth, listSipTrunks);
sipRouter.post("/trunks", requireAuth, createSipTrunk);
sipRouter.patch("/trunks/:id", requireAuth, updateSipTrunk);
sipRouter.delete("/trunks/:id", requireAuth, deleteSipTrunk);
sipRouter.post("/trunks/:id/set-default", requireAuth, setDefaultSipTrunk);
sipRouter.post("/trunks/import-env", requireAuth, importSipTrunkFromEnv);
sipRouter.get("/trunks/default", requireAuth, getDefaultSipTrunk);
sipRouter.get("/webrtc-token", requireAuth, redirectToLegacy("/api/telnyx/webrtc-token"));
sipRouter.post("/media-bridge/callback", handleMediaBridgeCallback);

router.post("/calls/disposition", requireAuth, redirectToLegacy("/api/calls/disposition"));
router.get("/calls/queue/:queueItemId", requireAuth, redirectToLegacy((req) => `/api/calls/queue/${req.params.queueItemId}`));
router.get("/calls/contact/:contactId", requireAuth, redirectToLegacy((req) => `/api/calls/contact/${req.params.contactId}`));
router.post("/calls/:attemptId/recording/access", requireAuth, redirectToLegacy((req) => `/api/calls/${req.params.attemptId}/recording/access`));
router.get("/calls/:attemptId/recording/access-logs", requireAuth, redirectToLegacy((req) => `/api/calls/${req.params.attemptId}/recording/access-logs`));

router.get("/analytics/engagement", requireAuth, redirectToLegacy("/api/analytics/engagement"));
router.get("/telnyx/webrtc-token", requireAuth, redirectToLegacy("/api/telnyx/webrtc-token"));

router.use("/ai-calls", aiCallsRouter);
router.use("/calls", agentCallControlRouter);
router.use("/sip", sipRouter);
router.use("/number-pool", numberPoolRouter);
router.use("/voice-engine", voiceEngineRouter);
router.use("/voice-providers", voiceProviderRoutes);
router.use("/providers/voices", voiceProviderRoutes);
router.use("/providers", requireAuth, telephonyProvidersRouter);
router.use("/recordings", requireAuth, recordingsRouter);
router.use("/call-intelligence", callIntelligenceRouter);
router.use("/analytics/intelligence", callIntelligenceRouter);
router.use("/reports/calls", reportingRoutes);
router.use("/analytics/reports/calls", reportingRoutes);
router.use("/telnyx", telnyxWebhookRouter);
router.use("/texml", texmlRouter);

export default router;