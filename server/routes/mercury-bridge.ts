/**
 * Mercury Bridge — Unified Email & Notification Routes
 *
 * Combines SMTP Provider management and Mercury notification system:
 *   - SMTP provider CRUD + OAuth2 authentication (mounted at /api/smtp-providers)
 *   - SMTP status + verification
 *   - Template management (CRUD + preview + test send)
 *   - AI template generation & refinement
 *   - Bulk client invitations (dry run + execute)
 *   - Notification dispatch + logs
 *   - Notification rules
 *   - Outbox management
 *
 * All routes require admin authentication.
 * Sending features gated behind smtp_email_enabled and bulk_invites_enabled flags.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { eq, desc, and } from 'drizzle-orm';
import {
  smtpProviders,
  insertSmtpProviderSchema,
  type SmtpProviderType,
  type SmtpAuthType,
  mercuryTemplates,
  mercuryEmailOutbox,
  mercuryNotificationEvents,
  mercuryNotificationRules,
  mercuryNotificationPreferences,
} from '@shared/schema';
import { requireAuth } from '../auth';
import { requireFeatureFlag, isFeatureEnabled } from '../feature-flags';
import {
  mercuryEmailService,
  notificationService,
  bulkInvitationService,
  seedDefaultTemplates,
} from '../services/mercury';
import { generateJSON } from '../services/vertex-ai';
import { smtpOAuthService } from '../services/smtp-oauth-service';

const DEFAULT_PORTAL_BASE_URL =
  process.env.CLIENT_PORTAL_BASE_URL ||
  process.env.APP_BASE_URL ||
  process.env.MSFT_OAUTH_APP_URL ||
  'https://demandgentic.ai';

// ═══════════════════════════════════════════════════════════════════════════════
// SMTP OAUTH CALLBACK ROUTER (public — no auth, Google/Microsoft redirect here)
// ═══════════════════════════════════════════════════════════════════════════════

const smtpOAuthCallbackRouter = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// SMTP PROVIDERS ROUTER (mounted at /api/smtp-providers)
// ═══════════════════════════════════════════════════════════════════════════════

const smtpProvidersRouter = Router();

// ── SMTP Provider Schemas ────────────────────────────────────────────────────

const createSmtpProviderSchema = z.object({
  name: z.string().min(1, "Name is required"),
  providerType: z.enum(["gmail", "outlook", "custom"]),
  authType: z.enum(["oauth2", "basic", "app_password"]),
  emailAddress: z.string().email("Valid email address required"),
  displayName: z.string().optional(),
  replyToAddress: z.string().email().optional(),
  dailySendLimit: z.number().int().positive().optional(),
  hourlySendLimit: z.number().int().positive().optional(),
  isDefault: z.boolean().optional(),
  // Custom SMTP fields
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().positive().optional(),
  smtpSecure: z.boolean().optional(),
  smtpUsername: z.string().optional(),
  smtpPassword: z.string().optional(),
});

const updateSmtpProviderSchema = createSmtpProviderSchema.partial();

// ── SMTP Provider CRUD ───────────────────────────────────────────────────────

/**
 * GET /api/smtp-providers
 * List all SMTP providers
 */
smtpProvidersRouter.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const providers = await db
      .select({
        id: smtpProviders.id,
        name: smtpProviders.name,
        providerType: smtpProviders.providerType,
        authType: smtpProviders.authType,
        emailAddress: smtpProviders.emailAddress,
        displayName: smtpProviders.displayName,
        replyToAddress: smtpProviders.replyToAddress,
        dailySendLimit: smtpProviders.dailySendLimit,
        hourlySendLimit: smtpProviders.hourlySendLimit,
        sentToday: smtpProviders.sentToday,
        sentThisHour: smtpProviders.sentThisHour,
        isActive: smtpProviders.isActive,
        isDefault: smtpProviders.isDefault,
        verificationStatus: smtpProviders.verificationStatus,
        lastVerifiedAt: smtpProviders.lastVerifiedAt,
        lastVerificationError: smtpProviders.lastVerificationError,
        lastUsedAt: smtpProviders.lastUsedAt,
        createdAt: smtpProviders.createdAt,
        updatedAt: smtpProviders.updatedAt,
      })
      .from(smtpProviders)
      .orderBy(desc(smtpProviders.createdAt));

    res.json(providers);
  } catch (error: any) {
    console.error("[SMTP Providers] List error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/smtp-providers/:id
 * Get a single SMTP provider
 */
smtpProvidersRouter.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [provider] = await db
      .select({
        id: smtpProviders.id,
        name: smtpProviders.name,
        providerType: smtpProviders.providerType,
        authType: smtpProviders.authType,
        emailAddress: smtpProviders.emailAddress,
        displayName: smtpProviders.displayName,
        replyToAddress: smtpProviders.replyToAddress,
        smtpHost: smtpProviders.smtpHost,
        smtpPort: smtpProviders.smtpPort,
        smtpSecure: smtpProviders.smtpSecure,
        smtpUsername: smtpProviders.smtpUsername,
        dailySendLimit: smtpProviders.dailySendLimit,
        hourlySendLimit: smtpProviders.hourlySendLimit,
        sentToday: smtpProviders.sentToday,
        sentThisHour: smtpProviders.sentThisHour,
        isActive: smtpProviders.isActive,
        isDefault: smtpProviders.isDefault,
        verificationStatus: smtpProviders.verificationStatus,
        lastVerifiedAt: smtpProviders.lastVerifiedAt,
        lastVerificationError: smtpProviders.lastVerificationError,
        lastUsedAt: smtpProviders.lastUsedAt,
        tokenExpiresAt: smtpProviders.tokenExpiresAt,
        tokenScopes: smtpProviders.tokenScopes,
        createdAt: smtpProviders.createdAt,
        updatedAt: smtpProviders.updatedAt,
      })
      .from(smtpProviders)
      .where(eq(smtpProviders.id, id));

    if (!provider) {
      return res.status(404).json({ error: "SMTP provider not found" });
    }

    res.json(provider);
  } catch (error: any) {
    console.error("[SMTP Providers] Get error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/smtp-providers
 * Create a new SMTP provider
 */
smtpProvidersRouter.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = createSmtpProviderSchema.parse(req.body);
    const userId = req.user?.userId;

    // If this is being set as default, unset other defaults
    if (body.isDefault) {
      await db
        .update(smtpProviders)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(smtpProviders.isDefault, true));
    }

    // Encrypt password if provided
    let smtpPasswordEncrypted: string | undefined;
    if (body.smtpPassword) {
      smtpPasswordEncrypted = smtpOAuthService.encryptToken(body.smtpPassword);
    }

    const [provider] = await db
      .insert(smtpProviders)
      .values({
        name: body.name,
        providerType: body.providerType as SmtpProviderType,
        authType: body.authType as SmtpAuthType,
        emailAddress: body.emailAddress,
        displayName: body.displayName,
        replyToAddress: body.replyToAddress,
        dailySendLimit: body.dailySendLimit || 500,
        hourlySendLimit: body.hourlySendLimit || 25,
        isDefault: body.isDefault || false,
        smtpHost: body.smtpHost,
        smtpPort: body.smtpPort,
        smtpSecure: body.smtpSecure,
        smtpUsername: body.smtpUsername,
        smtpPasswordEncrypted,
        verificationStatus: "pending",
        createdBy: userId,
      })
      .returning();

    res.status(201).json(provider);
  } catch (error: any) {
    console.error("[SMTP Providers] Create error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/smtp-providers/:id
 * Update an SMTP provider
 */
smtpProvidersRouter.put("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = updateSmtpProviderSchema.parse(req.body);

    // Check if provider exists
    const [existing] = await db
      .select()
      .from(smtpProviders)
      .where(eq(smtpProviders.id, id));

    if (!existing) {
      return res.status(404).json({ error: "SMTP provider not found" });
    }

    // If setting as default, unset other defaults
    if (body.isDefault) {
      await db
        .update(smtpProviders)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(eq(smtpProviders.isDefault, true), eq(smtpProviders.id, id)));
    }

    // Build update object
    const updateData: Record<string, any> = {
      ...body,
      updatedAt: new Date(),
    };

    // Encrypt password if provided
    if (body.smtpPassword) {
      updateData.smtpPasswordEncrypted = smtpOAuthService.encryptToken(
        body.smtpPassword
      );
      delete updateData.smtpPassword;
    }

    const [updated] = await db
      .update(smtpProviders)
      .set(updateData)
      .where(eq(smtpProviders.id, id))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error("[SMTP Providers] Update error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/smtp-providers/:id
 * Delete an SMTP provider
 */
smtpProvidersRouter.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [deleted] = await db
      .delete(smtpProviders)
      .where(eq(smtpProviders.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "SMTP provider not found" });
    }

    res.json({ success: true, deleted });
  } catch (error: any) {
    console.error("[SMTP Providers] Delete error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── SMTP OAuth Routes ────────────────────────────────────────────────────────

/**
 * GET /api/smtp-providers/:id/oauth/google/initiate
 * Start Google OAuth2 flow
 */
smtpProvidersRouter.get(
  "/:id/oauth/google/initiate",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verify provider exists and is gmail type
      const [provider] = await db
        .select()
        .from(smtpProviders)
        .where(eq(smtpProviders.id, id));

      if (!provider) {
        return res.status(404).json({ error: "SMTP provider not found" });
      }

      if (provider.providerType !== "gmail") {
        return res
          .status(400)
          .json({ error: "Provider is not a Gmail provider" });
      }

      const baseUrl =
        process.env.APP_BASE_URL ||
        process.env.MSFT_OAUTH_APP_URL ||
        `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/smtp-providers/oauth/google/callback`;

      // Encode provider ID in state
      const state = Buffer.from(JSON.stringify({ providerId: id })).toString(
        "base64"
      );

      const authUrl = smtpOAuthService.getGoogleAuthUrl(redirectUri, state);

      res.json({ authUrl });
    } catch (error: any) {
      console.error("[SMTP Providers] Google OAuth initiate error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/smtp-providers/oauth/google/callback
 * Handle Google OAuth2 callback (public — no auth required, Google redirects here)
 */
smtpOAuthCallbackRouter.get("/oauth/google/callback", async (req: Request, res: Response) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(
        `/settings/smtp-providers?error=${encodeURIComponent(String(oauthError))}`
      );
    }

    if (!code || !state) {
      return res.redirect(
        "/settings/smtp-providers?error=missing_params"
      );
    }

    // Decode state to get provider ID
    const stateData = JSON.parse(
      Buffer.from(String(state), "base64").toString()
    );
    const { providerId } = stateData;

    const baseUrl =
      process.env.APP_BASE_URL ||
      process.env.MSFT_OAUTH_APP_URL ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/smtp-providers/oauth/google/callback`;

    // Exchange code for tokens
    const tokens = await smtpOAuthService.exchangeGoogleCode(
      String(code),
      redirectUri
    );

    // Get user email to verify it matches
    const userEmail = await smtpOAuthService.getGoogleUserEmail(
      tokens.accessToken
    );

    // Update provider with tokens
    await db
      .update(smtpProviders)
      .set({
        accessTokenEncrypted: smtpOAuthService.encryptToken(tokens.accessToken),
        refreshTokenEncrypted: smtpOAuthService.encryptToken(tokens.refreshToken),
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        tokenScopes: tokens.scope?.split(" ") || [],
        emailAddress: userEmail,
        verificationStatus: "verifying",
        updatedAt: new Date(),
      })
      .where(eq(smtpProviders.id, providerId));

    // Test connection
    const [provider] = await db
      .select()
      .from(smtpProviders)
      .where(eq(smtpProviders.id, providerId));

    if (provider) {
      await smtpOAuthService.testConnection(provider);
    }

    res.redirect(`/settings/smtp-providers?success=google_connected`);
  } catch (error: any) {
    console.error("[SMTP Providers] Google OAuth callback error:", error);
    res.redirect(
      `/settings/smtp-providers?error=${encodeURIComponent(error.message)}`
    );
  }
});

/**
 * GET /api/smtp-providers/:id/oauth/microsoft/initiate
 * Start Microsoft OAuth2 flow
 */
smtpProvidersRouter.get(
  "/:id/oauth/microsoft/initiate",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verify provider exists and is outlook type
      const [provider] = await db
        .select()
        .from(smtpProviders)
        .where(eq(smtpProviders.id, id));

      if (!provider) {
        return res.status(404).json({ error: "SMTP provider not found" });
      }

      if (provider.providerType !== "outlook") {
        return res
          .status(400)
          .json({ error: "Provider is not an Outlook provider" });
      }

      const baseUrl =
        process.env.APP_BASE_URL ||
        process.env.MSFT_OAUTH_APP_URL ||
        `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/smtp-providers/oauth/microsoft/callback`;

      // Encode provider ID in state
      const state = Buffer.from(JSON.stringify({ providerId: id })).toString(
        "base64"
      );

      const authUrl = smtpOAuthService.getMicrosoftAuthUrl(redirectUri, state);

      res.json({ authUrl });
    } catch (error: any) {
      console.error("[SMTP Providers] Microsoft OAuth initiate error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/smtp-providers/oauth/microsoft/callback
 * Handle Microsoft OAuth2 callback (public — no auth required, Microsoft redirects here)
 */
smtpOAuthCallbackRouter.get("/oauth/microsoft/callback", async (req: Request, res: Response) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(
        `/settings/smtp-providers?error=${encodeURIComponent(String(oauthError))}`
      );
    }

    if (!code || !state) {
      return res.redirect(
        "/settings/smtp-providers?error=missing_params"
      );
    }

    // Decode state to get provider ID
    const stateData = JSON.parse(
      Buffer.from(String(state), "base64").toString()
    );
    const { providerId } = stateData;

    const baseUrl =
      process.env.APP_BASE_URL ||
      process.env.MSFT_OAUTH_APP_URL ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/smtp-providers/oauth/microsoft/callback`;

    // Exchange code for tokens
    const tokens = await smtpOAuthService.exchangeMicrosoftCode(
      String(code),
      redirectUri
    );

    // Get user email
    const userEmail = await smtpOAuthService.getMicrosoftUserEmail(
      tokens.accessToken
    );

    // Update provider with tokens
    await db
      .update(smtpProviders)
      .set({
        accessTokenEncrypted: smtpOAuthService.encryptToken(tokens.accessToken),
        refreshTokenEncrypted: smtpOAuthService.encryptToken(tokens.refreshToken),
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        tokenScopes: tokens.scope?.split(" ") || [],
        emailAddress: userEmail,
        verificationStatus: "verifying",
        updatedAt: new Date(),
      })
      .where(eq(smtpProviders.id, providerId));

    // Test connection
    const [provider] = await db
      .select()
      .from(smtpProviders)
      .where(eq(smtpProviders.id, providerId));

    if (provider) {
      await smtpOAuthService.testConnection(provider);
    }

    res.redirect(`/settings/smtp-providers?success=microsoft_connected`);
  } catch (error: any) {
    console.error("[SMTP Providers] Microsoft OAuth callback error:", error);
    res.redirect(
      `/settings/smtp-providers?error=${encodeURIComponent(error.message)}`
    );
  }
});

// ── SMTP Verification & Testing ──────────────────────────────────────────────

/**
 * POST /api/smtp-providers/:id/verify
 * Verify SMTP connection
 */
smtpProvidersRouter.post("/:id/verify", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [provider] = await db
      .select()
      .from(smtpProviders)
      .where(eq(smtpProviders.id, id));

    if (!provider) {
      return res.status(404).json({ error: "SMTP provider not found" });
    }

    const result = await smtpOAuthService.testConnection(provider);

    res.json(result);
  } catch (error: any) {
    console.error("[SMTP Providers] Verify error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/smtp-providers/:id/send-test
 * Send a test email
 */
smtpProvidersRouter.post(
  "/:id/send-test",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { toEmail } = req.body;

      if (!toEmail) {
        return res.status(400).json({ error: "toEmail is required" });
      }

      const [provider] = await db
        .select()
        .from(smtpProviders)
        .where(eq(smtpProviders.id, id));

      if (!provider) {
        return res.status(404).json({ error: "SMTP provider not found" });
      }

      const result = await smtpOAuthService.sendTestEmail(provider, toEmail);

      res.json(result);
    } catch (error: any) {
      console.error("[SMTP Providers] Send test error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/smtp-providers/:id/toggle-active
 * Toggle provider active status
 */
smtpProvidersRouter.post(
  "/:id/toggle-active",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [provider] = await db
        .select()
        .from(smtpProviders)
        .where(eq(smtpProviders.id, id));

      if (!provider) {
        return res.status(404).json({ error: "SMTP provider not found" });
      }

      const [updated] = await db
        .update(smtpProviders)
        .set({
          isActive: !provider.isActive,
          updatedAt: new Date(),
        })
        .where(eq(smtpProviders.id, id))
        .returning();

      res.json(updated);
    } catch (error: any) {
      console.error("[SMTP Providers] Toggle active error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/smtp-providers/:id/set-default
 * Set provider as default
 */
smtpProvidersRouter.post(
  "/:id/set-default",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Unset all other defaults
      await db
        .update(smtpProviders)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(smtpProviders.isDefault, true));

      // Set this one as default
      const [updated] = await db
        .update(smtpProviders)
        .set({
          isDefault: true,
          updatedAt: new Date(),
        })
        .where(eq(smtpProviders.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "SMTP provider not found" });
      }

      res.json(updated);
    } catch (error: any) {
      console.error("[SMTP Providers] Set default error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// MERCURY BRIDGE ROUTER (mounted at /api/mercury)
// ═══════════════════════════════════════════════════════════════════════════════

const mercuryRouter = Router();

// All Mercury routes require admin auth
mercuryRouter.use(requireAuth);

// ─── SMTP Status & Connection ────────────────────────────────────────────────

/**
 * GET /status — Get Mercury Bridge status
 */
mercuryRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const smtpStatus = await mercuryEmailService.verifyConnection();
    const flags = {
      smtp_email_enabled: isFeatureEnabled('smtp_email_enabled'),
      bulk_invites_enabled: isFeatureEnabled('bulk_invites_enabled'),
    };

    res.json({
      mercury: {
        version: '1.0.0',
        defaultSender: 'mercury@pivotal-b2b.com',
      },
      smtp: smtpStatus,
      featureFlags: flags,
    });
  } catch (error: any) {
    console.error('[Mercury/Routes] Status error:', error.message);
    res.status(500).json({ error: 'Failed to get Mercury status' });
  }
});

/**
 * POST /verify-connection — Test SMTP connection (no email sent)
 */
mercuryRouter.post('/verify-connection', async (req: Request, res: Response) => {
  try {
    const result = await mercuryEmailService.verifyConnection();
    res.json(result);
  } catch (error: any) {
    console.error('[Mercury/Routes] Verify connection error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── Template Management ─────────────────────────────────────────────────────

/**
 * POST /templates/seed — Seed default templates (idempotent, returns created templates)
 */
mercuryRouter.post('/templates/seed', async (req: Request, res: Response) => {
  try {
    const result = await seedDefaultTemplates();
    // Return all templates after seed so UI can refresh immediately
    const templates = await db
      .select()
      .from(mercuryTemplates)
      .orderBy(mercuryTemplates.category, mercuryTemplates.name);
    res.json({ success: true, ...result, templates });
  } catch (error: any) {
    console.error('[Mercury/Routes] Seed error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /templates — List all Mercury templates
 */
mercuryRouter.get('/templates', async (req: Request, res: Response) => {
  try {
    const templates = await db
      .select()
      .from(mercuryTemplates)
      .orderBy(mercuryTemplates.category, mercuryTemplates.name);

    res.json(templates);
  } catch (error: any) {
    console.error('[Mercury/Routes] List templates error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /templates/:key — Get a specific template by key
 */
mercuryRouter.get('/templates/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const [template] = await db
      .select()
      .from(mercuryTemplates)
      .where(eq(mercuryTemplates.templateKey, key))
      .limit(1);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error: any) {
    console.error('[Mercury/Routes] Get template error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const upsertTemplateSchema = z.object({
  templateKey: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  subjectTemplate: z.string().min(1),
  htmlTemplate: z.string().min(1),
  textTemplate: z.string().optional(),
  variables: z.array(z.object({
    name: z.string(),
    description: z.string(),
    required: z.boolean(),
    defaultValue: z.string().optional(),
    exampleValue: z.string().optional(),
  })).optional(),
  isEnabled: z.boolean().optional(),
  category: z.string().optional(),
});

/**
 * POST /templates — Create a new template
 */
mercuryRouter.post('/templates', async (req: Request, res: Response) => {
  try {
    const parsed = upsertTemplateSchema.parse(req.body);
    const [template] = await db.insert(mercuryTemplates).values({
      ...parsed,
      variables: parsed.variables || [],
      createdBy: (req as any).user?.userId,
    }).returning();

    res.status(201).json(template);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[Mercury/Routes] Create template error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /templates/:key — Update an existing template
 */
mercuryRouter.put('/templates/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const parsed = upsertTemplateSchema.partial().parse(req.body);

    const [updated] = await db.update(mercuryTemplates).set({
      ...parsed,
      updatedAt: new Date(),
    }).where(eq(mercuryTemplates.templateKey, key)).returning();

    if (!updated) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[Mercury/Routes] Update template error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /templates/:key — Delete a template
 */
mercuryRouter.delete('/templates/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const [deleted] = await db.delete(mercuryTemplates)
      .where(eq(mercuryTemplates.templateKey, key))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ success: true, deletedKey: key });
  } catch (error: any) {
    console.error('[Mercury/Routes] Delete template error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── Template Preview & Test Send ────────────────────────────────────────────

const previewSchema = z.object({
  variables: z.record(z.string()).optional(),
});

/**
 * POST /templates/:key/preview — Preview rendered template (no send)
 */
mercuryRouter.post('/templates/:key/preview', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { variables } = previewSchema.parse(req.body);

    const preview = await mercuryEmailService.previewTemplate(key, variables);
    if (!preview) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(preview);
  } catch (error: any) {
    console.error('[Mercury/Routes] Preview error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const testSendSchema = z.object({
  testRecipientEmail: z.string().email(),
  testRecipientName: z.string().optional(),
  variables: z.record(z.string()).optional(),
});

/**
 * POST /templates/:key/test-send — Send a test email for a template
 */
mercuryRouter.post('/templates/:key/test-send',
  requireFeatureFlag('smtp_email_enabled'),
  async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const parsed = testSendSchema.parse(req.body);
      const adminUserId = (req as any).user?.userId || 'unknown';

      const result = await mercuryEmailService.sendTestEmail({
        templateKey: key,
        testRecipientEmail: parsed.testRecipientEmail,
        testRecipientName: parsed.testRecipientName,
        variables: parsed.variables,
        adminUserId,
      });

      console.log(`[Mercury/Routes] Test send: template=${key}, to=${parsed.testRecipientEmail}, success=${result.success}, admin=${adminUserId}`);

      res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('[Mercury/Routes] Test send error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

// ─── AI Template Generation ─────────────────────────────────────────────────

const aiGenerateSchema = z.object({
  category: z.enum(['invitation', 'notification', 'system', 'marketing', 'onboarding']),
  audience: z.string().min(1).max(200),
  tone: z.enum(['professional', 'friendly', 'formal', 'casual', 'urgent']).default('professional'),
  purpose: z.string().min(1).max(500),
  variables: z.array(z.string()).optional(),
  context: z.string().max(1000).optional(),
});

/**
 * POST /templates/ai/generate — Generate a template using AI (Vertex AI / Gemini)
 */
mercuryRouter.post('/templates/ai/generate', async (req: Request, res: Response) => {
  try {
    const parsed = aiGenerateSchema.parse(req.body);

    const prompt = `You are an expert email template designer for a B2B lead generation platform called "Pivotal B2B".
Generate a production-ready email template based on the following requirements:

Category: ${parsed.category}
Audience: ${parsed.audience}
Tone: ${parsed.tone}
Purpose: ${parsed.purpose}
${parsed.variables?.length ? `Required Variables: ${parsed.variables.join(', ')}` : ''}
${parsed.context ? `Additional Context: ${parsed.context}` : ''}

Requirements:
1. Use Mustache-style variables: {{variable_name}}
2. HTML template must be responsive, professional, max-width 600px
3. Use inline CSS styles (email clients don't support <style> blocks well)
4. Use the Pivotal B2B brand colors: primary blue #1e40af / #2563eb / #3b82f6, success green #059669 / #10b981
5. Include a gradient header with white text
6. Main CTA button if appropriate
7. Subject line should include relevant {{variables}}
8. Text template is the plain-text fallback (no HTML)
9. Each variable needs a name, description, required flag, and exampleValue

Return valid JSON with this exact structure:
{
  "name": "Template Display Name",
  "description": "One-line description of when to use this template",
  "templateKey": "snake_case_key",
  "subjectTemplate": "Subject with {{variables}}",
  "htmlTemplate": "<div>...full HTML email...</div>",
  "textTemplate": "Plain text version...",
  "variables": [
    { "name": "var_name", "description": "What this variable is", "required": true, "exampleValue": "Example" }
  ]
}`;

    const result = await generateJSON<{
      name: string;
      description: string;
      templateKey: string;
      subjectTemplate: string;
      htmlTemplate: string;
      textTemplate: string;
      variables: Array<{
        name: string;
        description: string;
        required: boolean;
        defaultValue?: string;
        exampleValue?: string;
      }>;
    }>(prompt, { temperature: 0.7, maxTokens: 4096 });

    res.json({
      success: true,
      template: {
        ...result,
        category: parsed.category,
        isEnabled: true,
      },
    });
  } catch (error: any) {
    console.error('[Mercury/Routes] AI generate error:', error.message);
    res.status(500).json({ error: `AI generation failed: ${error.message}` });
  }
});

const aiRefineSchema = z.object({
  action: z.enum(['improve', 'shorten', 'formal', 'friendly', 'cta', 'rewrite']),
  htmlTemplate: z.string().min(1),
  subjectTemplate: z.string().min(1),
  textTemplate: z.string().optional(),
  context: z.string().max(500).optional(),
});

/**
 * POST /templates/ai/refine — Refine an existing template using AI
 */
mercuryRouter.post('/templates/ai/refine', async (req: Request, res: Response) => {
  try {
    const parsed = aiRefineSchema.parse(req.body);

    const actionDescriptions: Record<string, string> = {
      improve: 'Improve the overall quality, clarity, and professionalism of this email template.',
      shorten: 'Make this email template more concise. Reduce word count by 30-50% while keeping the core message.',
      formal: 'Rewrite this email template in a more formal, corporate tone.',
      friendly: 'Rewrite this email template in a warmer, more friendly and approachable tone.',
      cta: 'Improve the call-to-action. Make it more compelling, urgent, and clickable.',
      rewrite: 'Completely rewrite this email template with a fresh approach while keeping the same purpose.',
    };

    const prompt = `You are an expert email copywriter for B2B communications.
${actionDescriptions[parsed.action]}

${parsed.context ? `Additional instructions: ${parsed.context}` : ''}

Current subject: ${parsed.subjectTemplate}
Current HTML template:
${parsed.htmlTemplate}
${parsed.textTemplate ? `Current text template: ${parsed.textTemplate}` : ''}

Preserve all {{variable}} placeholders exactly as they are.
Keep the same inline CSS styling approach (max-width 600px, gradient headers, brand blue #2563eb).

Return valid JSON with:
{
  "subjectTemplate": "Updated subject",
  "htmlTemplate": "Updated HTML",
  "textTemplate": "Updated plain text"
}`;

    const result = await generateJSON<{
      subjectTemplate: string;
      htmlTemplate: string;
      textTemplate: string;
    }>(prompt, { temperature: 0.7, maxTokens: 4096 });

    res.json({ success: true, refined: result });
  } catch (error: any) {
    console.error('[Mercury/Routes] AI refine error:', error.message);
    res.status(500).json({ error: `AI refinement failed: ${error.message}` });
  }
});

// ─── Bulk Client Invitations ─────────────────────────────────────────────────

/**
 * POST /invitations/dry-run — Preview bulk invitation recipients (safe/read-only, no flag gate)
 */
mercuryRouter.post('/invitations/dry-run',
  async (req: Request, res: Response) => {
    try {
      const result = await bulkInvitationService.dryRun();
      res.json(result);
    } catch (error: any) {
      console.error('[Mercury/Routes] Dry run error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /invitations/send — Execute bulk invitation send
 */
mercuryRouter.post('/invitations/send',
  requireFeatureFlag('bulk_invites_enabled'),
  requireFeatureFlag('smtp_email_enabled'),
  async (req: Request, res: Response) => {
    try {
      const portalBaseUrl = req.body.portalBaseUrl || DEFAULT_PORTAL_BASE_URL;
      const adminUserId = (req as any).user?.userId || 'unknown';

      const result = await bulkInvitationService.sendBulkInvitations({
        adminUserId,
        portalBaseUrl,
      });

      console.log(`[Mercury/Routes] Bulk invite: queued=${result.totalQueued}, skipped=${result.totalSkipped}, admin=${adminUserId}`);

      res.json(result);
    } catch (error: any) {
      console.error('[Mercury/Routes] Bulk invite error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /invitations/status — Get invitation sending status (read-only, no flag gate)
 */
mercuryRouter.get('/invitations/status',
  async (req: Request, res: Response) => {
    try {
      const status = await bulkInvitationService.getInvitationStatus();
      res.json(status);
    } catch (error: any) {
      console.error('[Mercury/Routes] Invitation status error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /invitations/validate-token — Validate an invitation token
 */
mercuryRouter.post('/invitations/validate-token', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    const result = await bulkInvitationService.validateToken(token);
    res.json(result);
  } catch (error: any) {
    console.error('[Mercury/Routes] Token validation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── Notification Dispatch ───────────────────────────────────────────────────

const dispatchSchema = z.object({
  eventType: z.string().min(1),
  tenantId: z.string().optional(),
  actorUserId: z.string().optional(),
  payload: z.record(z.any()).optional(),
});

/**
 * POST /notifications/dispatch — Manually dispatch a notification event
 */
mercuryRouter.post('/notifications/dispatch',
  requireFeatureFlag('smtp_email_enabled'),
  async (req: Request, res: Response) => {
    try {
      const parsed = dispatchSchema.parse(req.body);
      const result = await notificationService.dispatch({
        ...parsed,
        payload: parsed.payload || {},
      });
      res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('[Mercury/Routes] Dispatch error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /notifications/events — List notification events
 */
mercuryRouter.get('/notifications/events', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const events = await db
      .select()
      .from(mercuryNotificationEvents)
      .orderBy(desc(mercuryNotificationEvents.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(events);
  } catch (error: any) {
    console.error('[Mercury/Routes] List events error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── Notification Rules ──────────────────────────────────────────────────────

/**
 * GET /notifications/rules — List notification rules
 */
mercuryRouter.get('/notifications/rules', async (req: Request, res: Response) => {
  try {
    const rules = await db
      .select()
      .from(mercuryNotificationRules)
      .orderBy(mercuryNotificationRules.eventType);

    res.json(rules);
  } catch (error: any) {
    console.error('[Mercury/Routes] List rules error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const ruleSchema = z.object({
  eventType: z.string().min(1),
  templateKey: z.string().min(1),
  channelType: z.string().default('email'),
  recipientResolver: z.enum(['requester', 'tenant_admins', 'all_tenant_users', 'custom']),
  customRecipients: z.array(z.string()).optional(),
  isEnabled: z.boolean().optional(),
  description: z.string().optional(),
});

/**
 * POST /notifications/rules — Create a notification rule
 */
mercuryRouter.post('/notifications/rules', async (req: Request, res: Response) => {
  try {
    const parsed = ruleSchema.parse(req.body);
    const [rule] = await db.insert(mercuryNotificationRules).values(parsed).returning();
    res.status(201).json(rule);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[Mercury/Routes] Create rule error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /notifications/rules/:id — Update a notification rule
 */
mercuryRouter.put('/notifications/rules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = ruleSchema.partial().parse(req.body);

    const [updated] = await db.update(mercuryNotificationRules).set({
      ...parsed,
      updatedAt: new Date(),
    }).where(eq(mercuryNotificationRules.id, id)).returning();

    if (!updated) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('[Mercury/Routes] Update rule error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /notifications/rules/:id — Delete a notification rule
 */
mercuryRouter.delete('/notifications/rules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [deleted] = await db.delete(mercuryNotificationRules)
      .where(eq(mercuryNotificationRules.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Mercury/Routes] Delete rule error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── Email Logs / Outbox ─────────────────────────────────────────────────────

/**
 * GET /logs — Get Mercury email logs
 */
mercuryRouter.get('/logs', async (req: Request, res: Response) => {
  try {
    const { status, templateKey, tenantId, limit, offset } = req.query;
    const result = await mercuryEmailService.getLogs({
      status: status as string,
      templateKey: templateKey as string,
      tenantId: tenantId as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json(result);
  } catch (error: any) {
    console.error('[Mercury/Routes] Logs error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /logs/:id/retry — Retry a failed outbox entry
 */
mercuryRouter.post('/logs/:id/retry',
  requireFeatureFlag('smtp_email_enabled'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await mercuryEmailService.retryOutboxEntry(id);
      res.json(result);
    } catch (error: any) {
      console.error('[Mercury/Routes] Retry error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /outbox/process — Manually trigger outbox processing
 */
mercuryRouter.post('/outbox/process',
  requireFeatureFlag('smtp_email_enabled'),
  async (req: Request, res: Response) => {
    try {
      const batchSize = parseInt(req.body.batchSize) || 50;
      const result = await mercuryEmailService.processOutbox(batchSize);
      res.json(result);
    } catch (error: any) {
      console.error('[Mercury/Routes] Process outbox error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { smtpProvidersRouter, smtpOAuthCallbackRouter, seedDefaultTemplates };
export default mercuryRouter;
