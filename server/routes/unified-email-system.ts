import { Router, Request, Response } from "express";
import { smtpProvidersRouter } from "./mercury-bridge";
import mercuryRouter, { seedDefaultTemplates } from "./mercury-bridge";
import transactionalTemplatesRouter from "./transactional-templates";
import { requireAuth } from "../auth";
import { requireFeatureFlag } from "../feature-flags";
import { bulkInvitationService } from "../services/mercury/invitation-service";
import { z } from "zod";

/**
 * Unified Communications Router
 *
 * Combines SMTP Providers, Mercury Notifications, and Transactional Templates
 * into a single unified API surface at /api/communications.
 *
 * Sub-routes:
 *   /smtp-providers   — SMTP provider CRUD, OAuth, verification
 *   /mercury          — Mercury notifications, templates, bulk invitations, rules, logs
 *   /templates        — Transactional email templates CRUD, send, logs, stats
 *   /onboarding       — Template seeding for initial setup
 *   /invitations      — Single-user invitation preview and send
 */
const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

// 1. SMTP Providers Management
// Previous: /api/smtp-providers
router.use("/smtp-providers", smtpProvidersRouter);

// 2. Mercury Notifications & Core Logic (Invites, Rules, Logs)
// Previous: /api/mercury
router.use("/mercury", mercuryRouter);

// 3. Transactional Templates
// Previous: /api/transactional-templates
router.use("/templates", transactionalTemplatesRouter);

// 4. Client Onboarding — seed default Mercury templates
router.post("/onboarding/seed-templates", async (req: Request, res: Response) => {
  try {
    await seedDefaultTemplates();
    res.json({ success: true, message: "Default templates (including client_invite) seeded." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// 5. Single-User Invitation Routes
// =============================================================================

const sendSingleSchema = z.object({
  clientUserId: z.string().min(1, "clientUserId is required"),
  portalBaseUrl: z.string().optional(),
});

const previewSchema = z.object({
  clientUserId: z.string().min(1, "clientUserId is required"),
  portalBaseUrl: z.string().optional(),
});

/**
 * POST /api/communications/invitations/preview
 * Preview what the invitation email would look like for a specific client user.
 * Does not send anything or generate real tokens.
 */
router.post("/invitations/preview", async (req: Request, res: Response) => {
  try {
    const parsed = previewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const { clientUserId, portalBaseUrl } = parsed.data;
    const baseUrl = portalBaseUrl || `${req.protocol}://${req.get("host")}`;

    const preview = await bulkInvitationService.previewInvitationEmail({
      clientUserId,
      portalBaseUrl: baseUrl,
    });

    if (!preview) {
      return res.status(404).json({ error: "Client user not found or invitation template missing" });
    }

    res.json(preview);
  } catch (error: any) {
    console.error("[Communications/Invitations] Preview error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/communications/invitations/send-single
 * Send a single invitation email to a specific client user.
 * Generates a unique invitation token and queues the email.
 */
router.post(
  "/invitations/send-single",
  requireFeatureFlag("smtp_email_enabled"),
  async (req: Request, res: Response) => {
    try {
      const parsed = sendSingleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const { clientUserId, portalBaseUrl } = parsed.data;
      const baseUrl = portalBaseUrl || `${req.protocol}://${req.get("host")}`;
      const adminUserId = (req as any).user?.userId || "unknown";

      const result = await bulkInvitationService.sendSingleInvitation({
        clientUserId,
        adminUserId,
        portalBaseUrl: baseUrl,
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json(result);
    } catch (error: any) {
      console.error("[Communications/Invitations] Send single error:", error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
