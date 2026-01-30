/**
 * SMTP Providers Routes
 *
 * API endpoints for managing SMTP providers and OAuth2 authentication.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import {
  smtpProviders,
  insertSmtpProviderSchema,
  type SmtpProviderType,
  type SmtpAuthType,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../auth";
import { smtpOAuthService } from "../services/smtp-oauth-service";

const router = Router();

// ==================== SCHEMAS ====================

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

// ==================== ROUTES ====================

/**
 * GET /api/smtp-providers
 * List all SMTP providers
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
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
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
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
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = createSmtpProviderSchema.parse(req.body);
    const userId = req.user?.id;

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
        hourlySendLimit: body.hourlySendLimit || 100,
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
router.put("/:id", requireAuth, async (req: Request, res: Response) => {
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
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
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

// ==================== OAUTH ROUTES ====================

/**
 * GET /api/smtp-providers/:id/oauth/google/initiate
 * Start Google OAuth2 flow
 */
router.get(
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
 * Handle Google OAuth2 callback
 */
router.get("/oauth/google/callback", async (req: Request, res: Response) => {
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
router.get(
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
 * Handle Microsoft OAuth2 callback
 */
router.get("/oauth/microsoft/callback", async (req: Request, res: Response) => {
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

// ==================== VERIFICATION & TESTING ====================

/**
 * POST /api/smtp-providers/:id/verify
 * Verify SMTP connection
 */
router.post("/:id/verify", requireAuth, async (req: Request, res: Response) => {
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
router.post(
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
router.post(
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
router.post(
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

export default router;
