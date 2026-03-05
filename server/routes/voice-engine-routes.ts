import { Router, Request, Response } from "express";
import { db } from "../db";
import { agentDefaults } from "@shared/schema";
import { telnyxNumbers } from "@shared/number-pool-schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../auth";
import { invalidatePoolCache } from "../services/number-pool";

const router = Router();

const TELNYX_API = "https://api.telnyx.com/v2";
const telnyxHeaders = () => ({
  "Authorization": `Bearer ${process.env.TELNYX_API_KEY}`,
  "Content-Type": "application/json",
});

function isEnabledFlag(value?: string): boolean {
  if (!value) return false;
  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function getSipMissingRequirements(): string[] {
  const missing: string[] = [];
  if (!isEnabledFlag(process.env.USE_SIP_CALLING)) missing.push('USE_SIP_CALLING=true');
  if (!(process.env.DRACHTIO_HOST || '').trim()) missing.push('DRACHTIO_HOST');
  return missing;
}

/**
 * GET /api/voice-engine/config
 * Returns current call engine setting and provider readiness status
 */
router.get("/config", requireAuth, async (req: Request, res: Response) => {
  try {
    const defaults = await db.select().from(agentDefaults).limit(1);
    const config = defaults[0];

    const sipEnabled = isEnabledFlag(process.env.USE_SIP_CALLING);
    const hasDrachtioHost = !!(process.env.DRACHTIO_HOST || '').trim();
    const hasPublicIp = !!(process.env.PUBLIC_IP || '').trim();
    const sipReady = sipEnabled && hasDrachtioHost;

    const texmlReady = !!(
      process.env.TELNYX_API_KEY &&
      (process.env.TELNYX_TEXML_APP_ID || process.env.TELNYX_CONNECTION_ID)
    );

    res.json({
      activeEngine: config?.defaultCallEngine || 'texml',
      sip: {
        ready: sipReady,
        hasDrachtioHost,
        hasPublicIp,
        sipEnabled,
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

    if (!engine || !['texml', 'sip'].includes(engine)) {
      return res.status(400).json({ message: "engine must be 'texml' or 'sip'" });
    }

    if (engine === 'sip') {
      const missing = getSipMissingRequirements();
      if (missing.length > 0) {
        return res.status(422).json({
          message: `Cannot switch to SIP: missing ${missing.join(' and ')}.`,
        });
      }
    }

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

    // Invalidate number pool cache so new engine picks correct numbers
    invalidatePoolCache();

    console.log(`[VoiceEngine] Switched call engine to: ${engine} (by user ${(req as any).user?.id})`);

    res.json({ success: true, activeEngine: engine });
  } catch (err) {
    console.error("[VoiceEngine] Failed to update config:", err);
    res.status(500).json({ message: "Failed to update voice engine config" });
  }
});

/**
 * GET /api/voice-engine/numbers
 * Returns phone numbers grouped by connection (TeXML vs SIP)
 */
router.get("/numbers", requireAuth, async (req: Request, res: Response) => {
  try {
    const sipConnId = process.env.TELNYX_SIP_CONNECTION_ID || process.env.TELNYX_CONNECTION_ID;
    const texmlConnId = process.env.TELNYX_TEXML_APP_ID;

    const numbers = await db
      .select({
        id: telnyxNumbers.id,
        phoneNumberE164: telnyxNumbers.phoneNumberE164,
        telnyxConnectionId: telnyxNumbers.telnyxConnectionId,
        telnyxNumberId: telnyxNumbers.telnyxNumberId,
        status: telnyxNumbers.status,
        region: telnyxNumbers.region,
        areaCode: telnyxNumbers.areaCode,
      })
      .from(telnyxNumbers)
      .where(eq(telnyxNumbers.status, 'active'))
      .orderBy(telnyxNumbers.phoneNumberE164);

    const sipNumbers = numbers.filter(n => n.telnyxConnectionId === sipConnId);
    const texmlNumbers_ = numbers.filter(n => n.telnyxConnectionId === texmlConnId);
    const otherNumbers = numbers.filter(n =>
      n.telnyxConnectionId !== sipConnId && n.telnyxConnectionId !== texmlConnId
    );

    res.json({
      sipConnectionId: sipConnId || null,
      texmlConnectionId: texmlConnId || null,
      sip: sipNumbers,
      texml: texmlNumbers_,
      unassigned: otherNumbers,
      totals: {
        sip: sipNumbers.length,
        texml: texmlNumbers_.length,
        unassigned: otherNumbers.length,
      },
    });
  } catch (err) {
    console.error("[VoiceEngine] Failed to get numbers:", err);
    res.status(500).json({ message: "Failed to load phone numbers" });
  }
});

/**
 * POST /api/voice-engine/numbers/move
 * Move phone numbers between connections (TeXML <-> SIP)
 * Updates both Telnyx API and local DB
 */
router.post("/numbers/move", requireAuth, async (req: Request, res: Response) => {
  try {
    const { numberIds, targetConnection } = req.body as {
      numberIds: string[];
      targetConnection: 'sip' | 'texml';
    };

    if (!numberIds?.length || !targetConnection) {
      return res.status(400).json({ message: "numberIds (array) and targetConnection ('sip' | 'texml') required" });
    }

    if (!['sip', 'texml'].includes(targetConnection)) {
      return res.status(400).json({ message: "targetConnection must be 'sip' or 'texml'" });
    }

    const targetConnId = targetConnection === 'sip'
      ? (process.env.TELNYX_SIP_CONNECTION_ID || process.env.TELNYX_CONNECTION_ID)
      : process.env.TELNYX_TEXML_APP_ID;

    if (!targetConnId) {
      return res.status(422).json({
        message: `No connection ID configured for ${targetConnection}. Check environment variables.`,
      });
    }

    if (!process.env.TELNYX_API_KEY) {
      return res.status(422).json({ message: "TELNYX_API_KEY not configured" });
    }

    // Get the numbers from DB
    const numbersToMove = await db
      .select({
        id: telnyxNumbers.id,
        phoneNumberE164: telnyxNumbers.phoneNumberE164,
        telnyxNumberId: telnyxNumbers.telnyxNumberId,
        telnyxConnectionId: telnyxNumbers.telnyxConnectionId,
      })
      .from(telnyxNumbers)
      .where(sql`${telnyxNumbers.id} IN (${sql.join(numberIds.map(id => sql`${id}`), sql`, `)})`);

    if (numbersToMove.length === 0) {
      return res.status(404).json({ message: "No matching numbers found" });
    }

    // Skip numbers already on the target connection
    const toMove = numbersToMove.filter(n => n.telnyxConnectionId !== targetConnId);
    if (toMove.length === 0) {
      return res.json({ success: true, moved: 0, message: "All numbers already on target connection" });
    }

    const results: { number: string; success: boolean; error?: string }[] = [];

    for (const num of toMove) {
      // We need the Telnyx number ID to call their API
      // Try telnyxNumberId first, otherwise look up by phone number
      let telnyxId = num.telnyxNumberId;

      if (!telnyxId) {
        // Look up on Telnyx by phone number
        const lookupRes = await fetch(
          `${TELNYX_API}/phone_numbers?filter[phone_number]=${encodeURIComponent(num.phoneNumberE164)}`,
          { headers: telnyxHeaders() }
        );
        if (lookupRes.ok) {
          const lookupData = await lookupRes.json();
          telnyxId = lookupData.data?.[0]?.id;
        }
      }

      if (!telnyxId) {
        results.push({ number: num.phoneNumberE164, success: false, error: "Telnyx number ID not found" });
        continue;
      }

      // Update on Telnyx
      const patchRes = await fetch(`${TELNYX_API}/phone_numbers/${telnyxId}/voice`, {
        method: "PATCH",
        headers: telnyxHeaders(),
        body: JSON.stringify({ connection_id: targetConnId }),
      });

      if (patchRes.ok) {
        // Update local DB
        await db.update(telnyxNumbers)
          .set({ telnyxConnectionId: targetConnId, updatedAt: new Date() })
          .where(eq(telnyxNumbers.id, num.id));

        results.push({ number: num.phoneNumberE164, success: true });
      } else {
        const errData = await patchRes.json().catch(() => ({}));
        const errMsg = (errData as any).errors?.[0]?.detail || `Telnyx API error ${patchRes.status}`;
        results.push({ number: num.phoneNumberE164, success: false, error: errMsg });
      }
    }

    // Invalidate number pool cache after moving numbers
    invalidatePoolCache();

    const moved = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[VoiceEngine] Moved ${moved} numbers to ${targetConnection} (${failed} failed) by user ${(req as any).user?.id}`);

    res.json({ success: true, moved, failed, results });
  } catch (err) {
    console.error("[VoiceEngine] Failed to move numbers:", err);
    res.status(500).json({ message: "Failed to move phone numbers" });
  }
});

export default router;
