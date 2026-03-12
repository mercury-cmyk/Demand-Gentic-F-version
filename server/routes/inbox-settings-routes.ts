import { Router } from "express";
import { requireAuth } from "../auth";
import { apiLimiter } from "../middleware/security";
import { getSettings, upsertSettings } from "../services/inbox-settings-service";
import { z } from "zod";

const router = Router();

const settingsSchema = z.object({
  defaultMailboxAccountId: z.string().nullable().optional(),
  displayDensity: z.enum(["comfortable", "compact"]).optional(),
  autoReplyEnabled: z.boolean().optional(),
  autoReplySubject: z.string().max(512).nullable().optional(),
  autoReplyBody: z.string().nullable().optional(),
  notifyNewEmail: z.boolean().optional(),
  notifyDesktop: z.boolean().optional(),
  sidebarCollapsed: z.boolean().optional(),
});

/**
 * GET /api/inbox/settings
 * Get user inbox settings
 */
router.get("/settings", requireAuth, apiLimiter, async (req, res) => {
  try {
    const settings = await getSettings(req.user!.userId);
    res.json({ settings });
  } catch (error) {
    console.error("[INBOX-SETTINGS] get error:", error);
    res.status(500).json({ message: "Failed to fetch settings" });
  }
});

/**
 * PUT /api/inbox/settings
 * Upsert inbox settings
 */
router.put("/settings", requireAuth, apiLimiter, async (req, res) => {
  try {
    const data = settingsSchema.parse(req.body);
    const settings = await upsertSettings(req.user!.userId, data);
    res.json({ settings });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    console.error("[INBOX-SETTINGS] upsert error:", error);
    res.status(500).json({ message: "Failed to update settings" });
  }
});

export default router;
