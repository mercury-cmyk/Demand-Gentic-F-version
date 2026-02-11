import { Router } from "express";
import { smtpProvidersRouter } from "./mercury-bridge";
import mercuryRouter, { seedDefaultTemplates } from "./mercury-bridge";
import transactionalTemplatesRouter from "./transactional-templates";
import { requireAuth } from "../auth";

/**
 * Unified Communications Router
 * 
 * Combines SMTP Providers, Mercury Notifications, and Transactional Templates
 * into a single unified API surface.
 */
const router = Router();

// Apply authentication to all routes here (as it was in routes.ts)
router.use(requireAuth);

// 1. SMTP Providers Management
// Previous: /api/smtp-providers
router.use("/smtp-providers", smtpProvidersRouter);

// 2. Mercury Notifications & Core Logic (Invites, Rules, Logs)
// Previous: /api/mercury
router.use("/mercury", mercuryRouter);

// 3. Transactional Templates (Legacy/Parallel system?)
// Previous: /api/transactional-templates
router.use("/templates", transactionalTemplatesRouter);

// 4. Client Onboarding & Invitation Convenience Routes
// This exposes specific capability to ensure the invite template exists and trigger invites
router.post("/onboarding/seed-templates", async (req, res) => {
  try {
    await seedDefaultTemplates();
    res.json({ success: true, message: "Default templates (including client_invite) seeded." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
