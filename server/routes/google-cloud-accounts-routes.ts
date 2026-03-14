/**
 * Google Cloud Account Manager — API Routes
 *
 * POST   /api/google-cloud-accounts              create account
 * GET    /api/google-cloud-accounts              list accounts (no service-account JSON)
 * GET    /api/google-cloud-accounts/:id          get single account
 * PUT    /api/google-cloud-accounts/:id          update account
 * DELETE /api/google-cloud-accounts/:id          delete account
 * POST   /api/google-cloud-accounts/:id/activate  health-check + hot-swap + migration checklist
 * POST   /api/google-cloud-accounts/:id/health-check  health-check only (no switch)
 * GET    /api/google-cloud-accounts/:id/migration-checklist      persistent checklist with status
 * PATCH  /api/google-cloud-accounts/:id/migration-checklist/:itemId  update single item status
 * PATCH  /api/google-cloud-accounts/:id/migration-checklist      bulk update item statuses
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import { googleCloudAccounts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import {
  checkAccountHealth,
  activateAccount,
  listAccounts,
  getAccountById,
  encryptServiceAccount,
  generateMigrationChecklist,
  persistChecklist,
  updateChecklistItem,
  getMergedChecklist,
} from "../services/google-account-manager";

const router = Router();

// ── LIST ────────────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const accounts = await listAccounts();
    res.json(accounts);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET SINGLE ──────────────────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const account = await getAccountById(req.params.id);
    if (!account) return res.status(404).json({ error: "Not found" });
    res.json(account);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── CREATE ──────────────────────────────────────────────────────────────────
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      name, description, projectId, location, gcsBucket,
      geminiApiKey, googleSearchApiKey, googleSearchEngineId,
      googleClientId, googleClientSecret, googleOauthRedirectUri,
      serviceAccountJson,  // plain JSON string from the client
      isDefault,
    } = req.body;

    if (!name || !projectId || !gcsBucket) {
      return res.status(400).json({ error: "name, projectId, and gcsBucket are required" });
    }

    // Encrypt service account JSON if provided
    let encryptedSA: string | null = null;
    let serviceAccountEmail: string | null = null;
    if (serviceAccountJson) {
      try {
        const parsed = typeof serviceAccountJson === "string"
          ? JSON.parse(serviceAccountJson)
          : serviceAccountJson;
        serviceAccountEmail = parsed.client_email || null;
        encryptedSA = encryptServiceAccount(
          typeof serviceAccountJson === "string" ? serviceAccountJson : JSON.stringify(serviceAccountJson)
        );
      } catch (e: any) {
        return res.status(400).json({ error: `Invalid service account JSON: ${e.message}` });
      }
    }

    const userId = (req as any).user?.id || "system";
    const [created] = await db.insert(googleCloudAccounts).values({
      name,
      description: description || null,
      projectId,
      location: location || "us-central1",
      gcsBucket,
      geminiApiKey: geminiApiKey || null,
      googleSearchApiKey: googleSearchApiKey || null,
      googleSearchEngineId: googleSearchEngineId || null,
      googleClientId: googleClientId || null,
      googleClientSecret: googleClientSecret || null,
      googleOauthRedirectUri: googleOauthRedirectUri || null,
      serviceAccountJson: encryptedSA,
      serviceAccountEmail,
      isActive: false,
      isDefault: isDefault || false,
      createdBy: userId,
      updatedBy: userId,
    }).returning();

    const { serviceAccountJson: _sa, ...safe } = created;
    res.status(201).json(safe);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── UPDATE ──────────────────────────────────────────────────────────────────
router.put("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const [existing] = await db
      .select()
      .from(googleCloudAccounts)
      .where(eq(googleCloudAccounts.id, req.params.id))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Not found" });

    const {
      name, description, projectId, location, gcsBucket,
      geminiApiKey, googleSearchApiKey, googleSearchEngineId,
      googleClientId, googleClientSecret, googleOauthRedirectUri,
      serviceAccountJson, isDefault,
    } = req.body;

    const updates: Partial<typeof googleCloudAccounts.$inferInsert> = { updatedAt: new Date() };
    const userId = (req as any).user?.id || "system";
    updates.updatedBy = userId;

    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (projectId !== undefined) updates.projectId = projectId;
    if (location !== undefined) updates.location = location;
    if (gcsBucket !== undefined) updates.gcsBucket = gcsBucket;
    if (geminiApiKey !== undefined) updates.geminiApiKey = geminiApiKey || null;
    if (googleSearchApiKey !== undefined) updates.googleSearchApiKey = googleSearchApiKey || null;
    if (googleSearchEngineId !== undefined) updates.googleSearchEngineId = googleSearchEngineId || null;
    if (googleClientId !== undefined) updates.googleClientId = googleClientId || null;
    if (googleClientSecret !== undefined) updates.googleClientSecret = googleClientSecret || null;
    if (googleOauthRedirectUri !== undefined) updates.googleOauthRedirectUri = googleOauthRedirectUri || null;
    if (isDefault !== undefined) updates.isDefault = isDefault;

    // Only re-encrypt if a new service account JSON was provided
    if (serviceAccountJson) {
      try {
        const parsed = typeof serviceAccountJson === "string"
          ? JSON.parse(serviceAccountJson)
          : serviceAccountJson;
        updates.serviceAccountEmail = parsed.client_email || null;
        updates.serviceAccountJson = encryptServiceAccount(
          typeof serviceAccountJson === "string" ? serviceAccountJson : JSON.stringify(serviceAccountJson)
        );
      } catch (e: any) {
        return res.status(400).json({ error: `Invalid service account JSON: ${e.message}` });
      }
    }

    const [updated] = await db
      .update(googleCloudAccounts)
      .set(updates)
      .where(eq(googleCloudAccounts.id, req.params.id))
      .returning();

    const { serviceAccountJson: _sa, ...safe } = updated;
    res.json(safe);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE ──────────────────────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const [existing] = await db
      .select({ isActive: googleCloudAccounts.isActive })
      .from(googleCloudAccounts)
      .where(eq(googleCloudAccounts.id, req.params.id))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.isActive) {
      return res.status(400).json({ error: "Cannot delete the active account. Activate another account first." });
    }

    await db.delete(googleCloudAccounts).where(eq(googleCloudAccounts.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── HEALTH CHECK ─────────────────────────────────────────────────────────────
router.post("/:id/health-check", requireAuth, async (req: Request, res: Response) => {
  try {
    const [account] = await db
      .select()
      .from(googleCloudAccounts)
      .where(eq(googleCloudAccounts.id, req.params.id))
      .limit(1);

    if (!account) return res.status(404).json({ error: "Not found" });

    const result = await checkAccountHealth(account);

    // Persist health status
    await db.update(googleCloudAccounts)
      .set({
        lastHealthCheckAt: new Date(),
        lastHealthStatus: result.ok ? "ok" : "error",
        lastHealthError: result.errors.length > 0 ? result.errors.join("; ") : null,
        updatedAt: new Date(),
      })
      .where(eq(googleCloudAccounts.id, req.params.id));

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── ACTIVATE (safe switch) ───────────────────────────────────────────────────
router.post("/:id/activate", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || "system";
    const skipHealthCheck = req.body?.skipHealthCheck === true;

    const result = await activateAccount(req.params.id, userId, { skipHealthCheck });

    if (!result.ok) {
      return res.status(422).json(result);
    }

    // Generate migration checklist so caller knows what else needs attention
    const [account] = await db
      .select()
      .from(googleCloudAccounts)
      .where(eq(googleCloudAccounts.id, req.params.id))
      .limit(1);

    let migrationChecklist = null;
    if (account) {
      const template = await generateMigrationChecklist(account);
      // Mark auto-managed items as ok since applyAccount just ran
      for (const item of template.items) {
        if (item.category === "auto") item.status = "ok";
      }
      // Persist to DB (upserts — new items get "pending", auto items get "completed")
      await persistChecklist(account.id, template.items).catch(err => {
        console.warn("[GcpAccountManager] Failed to persist checklist:", err.message);
      });
      // Return the merged (persisted) checklist
      migrationChecklist = await getMergedChecklist(account);
    }

    res.json({ ...result, migrationChecklist });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── MIGRATION CHECKLIST (read — shows persisted state merged with template) ─
router.get("/:id/migration-checklist", requireAuth, async (req: Request, res: Response) => {
  try {
    const [account] = await db
      .select()
      .from(googleCloudAccounts)
      .where(eq(googleCloudAccounts.id, req.params.id))
      .limit(1);

    if (!account) return res.status(404).json({ error: "Not found" });

    // Ensure items are persisted (in case this account was never activated through the new flow)
    const template = await generateMigrationChecklist(account);
    await persistChecklist(account.id, template.items).catch(() => {});

    const checklist = await getMergedChecklist(account);
    res.json(checklist);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── UPDATE CHECKLIST ITEM ─────────────────────────────────────────────────
// PATCH /api/google-cloud-accounts/:id/migration-checklist/:itemId
router.patch("/:id/migration-checklist/:itemId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, itemId } = req.params;
    const { status, notes } = req.body;
    const userId = (req as any).user?.id || "system";

    const validStatuses = ["pending", "in_progress", "completed", "skipped", "not_applicable"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
    }

    const result = await updateChecklistItem(id, itemId, status, userId, notes);
    if (!result.ok) {
      return res.status(404).json({ error: result.error });
    }

    res.json({ ok: true, itemId, status, updatedBy: userId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── BULK UPDATE CHECKLIST ITEMS ───────────────────────────────────────────
// PATCH /api/google-cloud-accounts/:id/migration-checklist
router.patch("/:id/migration-checklist", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { updates } = req.body;
    const userId = (req as any).user?.id || "system";

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: "updates array is required: [{ itemId, status, notes? }]" });
    }

    const validStatuses = ["pending", "in_progress", "completed", "skipped", "not_applicable"];
    const results: Array<{ itemId: string; ok: boolean; error?: string }> = [];

    for (const upd of updates) {
      if (!upd.itemId || !upd.status || !validStatuses.includes(upd.status)) {
        results.push({ itemId: upd.itemId || "unknown", ok: false, error: "Invalid itemId or status" });
        continue;
      }
      const r = await updateChecklistItem(id, upd.itemId, upd.status, userId, upd.notes);
      results.push({ itemId: upd.itemId, ...r });
    }

    const succeeded = results.filter(r => r.ok).length;
    res.json({ totalProcessed: results.length, succeeded, failed: results.length - succeeded, results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
