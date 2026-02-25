import { Router, Request, Response } from "express";
import { db } from "../db";
import { agentDefaults } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../auth";

const router = Router();

/**
 * GET /api/voice-engine/config
 * Returns current call engine setting and provider readiness status
 */
router.get("/config", requireAuth, async (req: Request, res: Response) => {
  try {
    const defaults = await db.select().from(agentDefaults).limit(1);
    const config = defaults[0];

    const livekitReady = !!(
      process.env.LIVEKIT_URL &&
      process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET &&
      process.env.LIVEKIT_SIP_URI
    );

    const texmlReady = !!(
      process.env.TELNYX_API_KEY &&
      (process.env.TELNYX_TEXML_APP_ID || process.env.TELNYX_CONNECTION_ID)
    );

    res.json({
      activeEngine: config?.defaultCallEngine || 'texml',
      livekit: {
        ready: livekitReady,
        url: process.env.LIVEKIT_URL ? '***configured***' : null,
        sipUri: process.env.LIVEKIT_SIP_URI ? '***configured***' : null,
        hasApiKey: !!process.env.LIVEKIT_API_KEY,
        hasApiSecret: !!process.env.LIVEKIT_API_SECRET,
      },
      texml: {
        ready: texmlReady,
        hasApiKey: !!process.env.TELNYX_API_KEY,
        hasAppId: !!(process.env.TELNYX_TEXML_APP_ID || process.env.TELNYX_CONNECTION_ID),
      },
    });
  } catch (err) {
    console.error("[VoiceEngine] Failed to get config:", err);
    res.status(500).json({ message: "Failed to load voice engine config" });
  }
});

/**
 * PUT /api/voice-engine/config
 * Switch the active call engine
 */
router.put("/config", requireAuth, async (req: Request, res: Response) => {
  try {
    const { engine } = req.body;

    if (!engine || !['texml', 'livekit'].includes(engine)) {
      return res.status(400).json({ message: "engine must be 'texml' or 'livekit'" });
    }

    // Validate LiveKit env vars before allowing switch
    if (engine === 'livekit') {
      const missing: string[] = [];
      if (!process.env.LIVEKIT_URL) missing.push('LIVEKIT_URL');
      if (!process.env.LIVEKIT_API_KEY) missing.push('LIVEKIT_API_KEY');
      if (!process.env.LIVEKIT_API_SECRET) missing.push('LIVEKIT_API_SECRET');
      if (!process.env.LIVEKIT_SIP_URI) missing.push('LIVEKIT_SIP_URI');

      if (missing.length > 0) {
        return res.status(422).json({
          message: `Cannot switch to LiveKit: missing environment variables: ${missing.join(', ')}`,
          missing,
        });
      }
    }

    // Update agent_defaults
    const defaults = await db.select().from(agentDefaults).limit(1);
    if (defaults.length === 0) {
      return res.status(404).json({ message: "Agent defaults not found. Please configure agent defaults first." });
    }

    await db.update(agentDefaults)
      .set({
        defaultCallEngine: engine,
        updatedAt: new Date(),
        updatedBy: (req as any).user?.id || null,
      })
      .where(eq(agentDefaults.id, defaults[0].id));

    console.log(`[VoiceEngine] Switched call engine to: ${engine} (by user ${(req as any).user?.id})`);

    res.json({ success: true, activeEngine: engine });
  } catch (err) {
    console.error("[VoiceEngine] Failed to update config:", err);
    res.status(500).json({ message: "Failed to update voice engine config" });
  }
});

export default router;
