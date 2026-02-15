import { Router, Request, Response } from "express";
import { smtpProvidersRouter } from "./mercury-bridge";
import mercuryRouter, { seedDefaultTemplates } from "./mercury-bridge";
import transactionalTemplatesRouter from "./transactional-templates";
import { requireAuth, hashPassword } from "../auth";
import { requireFeatureFlag } from "../feature-flags";
import { bulkInvitationService } from "../services/mercury/invitation-service";
import { z } from "zod";
import { db } from "../db";
import { clientUsers, clientAccounts, mercuryInvitationTokens } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Unified Communications Router
 *
 * Combines SMTP Providers, Mercury Notifications, and Transactional Templates
 * into a single unified API surface at /api/communications.
 *
 * Sub-routes:
 *   /smtp-providers     — SMTP provider CRUD, OAuth, verification
 *   /mercury            — Mercury notifications, templates, bulk invitations, rules, logs
 *   /templates          — Transactional email templates CRUD, send, logs, stats
 *   /onboarding         — Template seeding for initial setup
 *   /invitations        — Single-user invitation preview, send, accept (public)
 */
const router = Router();

// =============================================================================
// PUBLIC ROUTES (No authentication required — accessed by invited users)
// =============================================================================

/**
 * POST /api/communications/invitations/validate-token
 * Validate an invitation token and return user info for the setup form.
 * PUBLIC — no auth required (this is the first thing an invited user hits).
 */
router.post("/invitations/validate-token", async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ valid: false, reason: "Token is required" });
    }

    const result = await bulkInvitationService.validateToken(token);
    console.log(`[Communications/Invitations] Token validation result: valid=${result.valid}, reason=${result.reason || 'N/A'}, userId=${result.clientUserId || 'N/A'}`);
    if (!result.valid) {
      return res.json(result);
    }

    // Fetch user details to populate the setup form
    const [user] = await db
      .select({
        id: clientUsers.id,
        email: clientUsers.email,
        firstName: clientUsers.firstName,
        lastName: clientUsers.lastName,
        clientAccountId: clientUsers.clientAccountId,
        accountName: clientAccounts.name,
      })
      .from(clientUsers)
      .leftJoin(clientAccounts, eq(clientUsers.clientAccountId, clientAccounts.id))
      .where(eq(clientUsers.id, result.clientUserId!))
      .limit(1);

    if (!user) {
      console.warn(`[Communications/Invitations] Token valid but user not found: clientUserId=${result.clientUserId}`);
      return res.json({ valid: false, reason: "User account not found. The associated account may have been removed." });
    }

    res.json({
      valid: true,
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        companyName: user.accountName || 'Your Organization',
      },
    });
  } catch (error: any) {
    console.error("[Communications/Invitations] Validate token error:", error.message);
    res.status(500).json({ valid: false, reason: "Server error" });
  }
});

/**
 * POST /api/communications/invitations/accept
 * Accept an invitation: set password, update profile, mark token used.
 * PUBLIC — no auth required (the invited user is setting up their account).
 */
const acceptInviteSchema = z.object({
  token: z.string().min(1, "Invitation token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

router.post("/invitations/accept", async (req: Request, res: Response) => {
  try {
    const parsed = acceptInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    }

    const { token, password, firstName, lastName } = parsed.data;

    // Validate the token
    const validation = await bulkInvitationService.validateToken(token);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.reason || "Invalid invitation" });
    }

    // Hash password and update user
    const hashedPassword = await hashPassword(password);

    await db
      .update(clientUsers)
      .set({
        password: hashedPassword,
        firstName,
        lastName,
        updatedAt: new Date(),
      })
      .where(eq(clientUsers.id, validation.clientUserId!));

    // Mark invitation token as used
    await bulkInvitationService.markTokenUsed(token);

    console.log(`[Communications/Invitations] Invitation accepted for user ${validation.clientUserId}`);

    res.json({ success: true, message: "Account setup complete. You can now log in." });
  } catch (error: any) {
    console.error("[Communications/Invitations] Accept invite error:", error.message);
    res.status(500).json({ success: false, error: "Failed to set up account. Please try again." });
  }
});

// =============================================================================
// AUTHENTICATED ROUTES
// =============================================================================
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
