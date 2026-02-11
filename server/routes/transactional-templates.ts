/**
 * Transactional Email Templates Routes
 *
 * API endpoints for managing transactional email templates,
 * sending transactional emails, and viewing logs.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import {
  transactionalEmailTemplates,
  transactionalEmailLogs,
  smtpProviders,
  type TransactionalEventType,
} from "@shared/schema";
import { eq, and, desc, like, count, sql } from "drizzle-orm";
import { requireAuth } from "../auth";
import { transactionalEmailService } from "../services/transactional-email-service";

const router = Router();

// ==================== SCHEMAS ====================

const templateVariableSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean(),
  defaultValue: z.string().optional(),
});

const createTemplateSchema = z.object({
  eventType: z.enum([
    "welcome",
    "password_reset",
    "password_changed",
    "account_verification",
    "account_updated",
    "notification",
    "lead_alert",
    "campaign_completed",
    "report_ready",
    "invoice",
    "subscription_expiring",
    "two_factor_code",
  ]),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  subject: z.string().min(1, "Subject is required"),
  htmlContent: z.string().min(1, "HTML content is required"),
  textContent: z.string().optional(),
  variables: z.array(templateVariableSchema).optional(),
  smtpProviderId: z.string().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

const updateTemplateSchema = createTemplateSchema.partial();

const sendEmailSchema = z.object({
  eventType: z.enum([
    "welcome",
    "password_reset",
    "password_changed",
    "account_verification",
    "account_updated",
    "notification",
    "lead_alert",
    "campaign_completed",
    "report_ready",
    "invoice",
    "subscription_expiring",
    "two_factor_code",
  ]),
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  recipientUserId: z.string().optional(),
  variables: z.record(z.string()).optional(),
  templateId: z.string().optional(),
  smtpProviderId: z.string().optional(),
  immediate: z.boolean().optional(),
});

const previewTemplateSchema = z.object({
  variables: z.record(z.string()).optional(),
});

// ==================== TEMPLATE ROUTES ====================

/**
 * GET /api/transactional-templates
 * List all templates with optional filtering
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { eventType, isActive, search } = req.query;

    let query = db
      .select({
        id: transactionalEmailTemplates.id,
        eventType: transactionalEmailTemplates.eventType,
        name: transactionalEmailTemplates.name,
        description: transactionalEmailTemplates.description,
        subject: transactionalEmailTemplates.subject,
        variables: transactionalEmailTemplates.variables,
        smtpProviderId: transactionalEmailTemplates.smtpProviderId,
        isActive: transactionalEmailTemplates.isActive,
        isDefault: transactionalEmailTemplates.isDefault,
        version: transactionalEmailTemplates.version,
        createdAt: transactionalEmailTemplates.createdAt,
        updatedAt: transactionalEmailTemplates.updatedAt,
      })
      .from(transactionalEmailTemplates);

    const conditions: any[] = [];

    if (eventType) {
      conditions.push(
        eq(
          transactionalEmailTemplates.eventType,
          eventType as TransactionalEventType
        )
      );
    }

    if (isActive !== undefined) {
      conditions.push(
        eq(transactionalEmailTemplates.isActive, isActive === "true")
      );
    }

    if (search) {
      conditions.push(
        like(transactionalEmailTemplates.name, `%${search}%`)
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const templates = await query.orderBy(desc(transactionalEmailTemplates.createdAt));

    res.json(templates);
  } catch (error: any) {
    console.error("[Transactional Templates] List error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/transactional-templates/event-types
 * Get all available event types with their default templates
 */
router.get("/event-types", requireAuth, async (req: Request, res: Response) => {
  try {
    const eventTypes = [
      { type: "welcome", label: "Welcome Email", description: "Sent when a new user signs up" },
      { type: "password_reset", label: "Password Reset", description: "Sent when user requests password reset" },
      { type: "password_changed", label: "Password Changed", description: "Confirmation after password change" },
      { type: "account_verification", label: "Account Verification", description: "Email verification link" },
      { type: "account_updated", label: "Account Updated", description: "Notification of account changes" },
      { type: "notification", label: "Generic Notification", description: "General system notifications" },
      { type: "lead_alert", label: "Lead Alert", description: "New qualified lead notification" },
      { type: "campaign_completed", label: "Campaign Completed", description: "Campaign completion summary" },
      { type: "report_ready", label: "Report Ready", description: "Report is ready for download" },
      { type: "invoice", label: "Invoice", description: "Billing and invoice emails" },
      { type: "subscription_expiring", label: "Subscription Expiring", description: "Subscription renewal reminder" },
      { type: "two_factor_code", label: "Two-Factor Code", description: "2FA verification code" },
    ];

    // Get default templates for each event type
    const defaults = await db
      .select({
        eventType: transactionalEmailTemplates.eventType,
        templateId: transactionalEmailTemplates.id,
        templateName: transactionalEmailTemplates.name,
      })
      .from(transactionalEmailTemplates)
      .where(
        and(
          eq(transactionalEmailTemplates.isDefault, true),
          eq(transactionalEmailTemplates.isActive, true)
        )
      );

    const defaultsMap = new Map(
      defaults.map((d) => [d.eventType, { id: d.templateId, name: d.templateName }])
    );

    const result = eventTypes.map((et) => ({
      ...et,
      defaultTemplate: defaultsMap.get(et.type as TransactionalEventType) || null,
    }));

    res.json(result);
  } catch (error: any) {
    console.error("[Transactional Templates] Event types error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== SEND ROUTES ====================
// NOTE: These named routes must be defined BEFORE /:id to prevent
// Express from matching "send", "logs", "stats" as :id params.

/**
 * POST /api/transactional/send
 * Send a transactional email
 */
router.post("/send", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = sendEmailSchema.parse(req.body);

    const result = body.immediate
      ? await transactionalEmailService.sendImmediate(body)
      : await transactionalEmailService.sendTransactionalEmail(body);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error: any) {
    console.error("[Transactional Templates] Send error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// ==================== LOG ROUTES ====================

/**
 * GET /api/transactional/logs
 * Get transactional email logs
 */
router.get("/logs", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      eventType,
      status,
      recipientEmail,
      limit = "50",
      offset = "0",
    } = req.query;

    let query = db
      .select({
        id: transactionalEmailLogs.id,
        templateId: transactionalEmailLogs.templateId,
        smtpProviderId: transactionalEmailLogs.smtpProviderId,
        eventType: transactionalEmailLogs.eventType,
        triggerSource: transactionalEmailLogs.triggerSource,
        recipientEmail: transactionalEmailLogs.recipientEmail,
        recipientName: transactionalEmailLogs.recipientName,
        subject: transactionalEmailLogs.subject,
        status: transactionalEmailLogs.status,
        messageId: transactionalEmailLogs.messageId,
        errorMessage: transactionalEmailLogs.errorMessage,
        retryCount: transactionalEmailLogs.retryCount,
        queuedAt: transactionalEmailLogs.queuedAt,
        sentAt: transactionalEmailLogs.sentAt,
        failedAt: transactionalEmailLogs.failedAt,
        createdAt: transactionalEmailLogs.createdAt,
      })
      .from(transactionalEmailLogs);

    const conditions: any[] = [];

    if (eventType) {
      conditions.push(
        eq(transactionalEmailLogs.eventType, eventType as TransactionalEventType)
      );
    }

    if (status) {
      conditions.push(eq(transactionalEmailLogs.status, status as string));
    }

    if (recipientEmail) {
      conditions.push(
        eq(transactionalEmailLogs.recipientEmail, recipientEmail as string)
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const logs = await query
      .orderBy(desc(transactionalEmailLogs.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    res.json(logs);
  } catch (error: any) {
    console.error("[Transactional Templates] Logs error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/transactional/logs/:id
 * Get a single log entry with full details
 */
router.get("/logs/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [log] = await db
      .select()
      .from(transactionalEmailLogs)
      .where(eq(transactionalEmailLogs.id, id));

    if (!log) {
      return res.status(404).json({ error: "Log not found" });
    }

    res.json(log);
  } catch (error: any) {
    console.error("[Transactional Templates] Get log error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/transactional/stats
 * Get transactional email statistics
 */
router.get("/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const { eventType, days = "30" } = req.query;

    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days as string));

    let baseConditions = [
      sql`${transactionalEmailLogs.createdAt} >= ${daysAgo}`,
    ];

    if (eventType) {
      baseConditions.push(
        eq(transactionalEmailLogs.eventType, eventType as TransactionalEventType)
      );
    }

    // Get total counts by status
    const stats = await db
      .select({
        status: transactionalEmailLogs.status,
        count: count(),
      })
      .from(transactionalEmailLogs)
      .where(and(...baseConditions))
      .groupBy(transactionalEmailLogs.status);

    // Get counts by event type
    const byEventType = await db
      .select({
        eventType: transactionalEmailLogs.eventType,
        count: count(),
      })
      .from(transactionalEmailLogs)
      .where(and(...baseConditions))
      .groupBy(transactionalEmailLogs.eventType);

    const summary = {
      total: stats.reduce((sum, s) => sum + Number(s.count), 0),
      sent: Number(stats.find((s) => s.status === "sent")?.count || 0),
      delivered: Number(stats.find((s) => s.status === "delivered")?.count || 0),
      failed: Number(stats.find((s) => s.status === "failed")?.count || 0),
      pending: Number(stats.find((s) => s.status === "pending")?.count || 0) +
        Number(stats.find((s) => s.status === "queued")?.count || 0),
      byEventType: Object.fromEntries(
        byEventType.map((et) => [et.eventType, Number(et.count)])
      ),
    };

    res.json(summary);
  } catch (error: any) {
    console.error("[Transactional Templates] Stats error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/transactional-templates/:id
 * Get a single template with full content
 */
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [template] = await db
      .select()
      .from(transactionalEmailTemplates)
      .where(eq(transactionalEmailTemplates.id, id));

    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    // Get SMTP provider info if assigned
    let smtpProvider = null;
    if (template.smtpProviderId) {
      const [provider] = await db
        .select({
          id: smtpProviders.id,
          name: smtpProviders.name,
          emailAddress: smtpProviders.emailAddress,
          verificationStatus: smtpProviders.verificationStatus,
        })
        .from(smtpProviders)
        .where(eq(smtpProviders.id, template.smtpProviderId));
      smtpProvider = provider || null;
    }

    res.json({ ...template, smtpProvider });
  } catch (error: any) {
    console.error("[Transactional Templates] Get error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/transactional-templates
 * Create a new template
 */
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = createTemplateSchema.parse(req.body);
    const userId = req.user?.id;

    // If setting as default, unset other defaults for this event type
    if (body.isDefault) {
      await db
        .update(transactionalEmailTemplates)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(transactionalEmailTemplates.eventType, body.eventType),
            eq(transactionalEmailTemplates.isDefault, true)
          )
        );
    }

    const [template] = await db
      .insert(transactionalEmailTemplates)
      .values({
        eventType: body.eventType,
        name: body.name,
        description: body.description,
        subject: body.subject,
        htmlContent: body.htmlContent,
        textContent: body.textContent,
        variables: body.variables || [],
        smtpProviderId: body.smtpProviderId,
        isActive: body.isActive ?? true,
        isDefault: body.isDefault ?? false,
        createdBy: userId,
      })
      .returning();

    res.status(201).json(template);
  } catch (error: any) {
    console.error("[Transactional Templates] Create error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/transactional-templates/:id
 * Update a template
 */
router.put("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = updateTemplateSchema.parse(req.body);

    // Check if template exists
    const [existing] = await db
      .select()
      .from(transactionalEmailTemplates)
      .where(eq(transactionalEmailTemplates.id, id));

    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }

    // If setting as default, unset other defaults for this event type
    if (body.isDefault && body.eventType) {
      await db
        .update(transactionalEmailTemplates)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(transactionalEmailTemplates.eventType, body.eventType),
            eq(transactionalEmailTemplates.isDefault, true)
          )
        );
    }

    // Increment version
    const newVersion = (existing.version || 1) + 1;

    const [updated] = await db
      .update(transactionalEmailTemplates)
      .set({
        ...body,
        version: newVersion,
        updatedAt: new Date(),
      })
      .where(eq(transactionalEmailTemplates.id, id))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error("[Transactional Templates] Update error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/transactional-templates/:id
 * Delete a template
 */
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [deleted] = await db
      .delete(transactionalEmailTemplates)
      .where(eq(transactionalEmailTemplates.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Template not found" });
    }

    res.json({ success: true, deleted });
  } catch (error: any) {
    console.error("[Transactional Templates] Delete error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/transactional-templates/:id/preview
 * Preview a template with sample variables
 */
router.post(
  "/:id/preview",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const body = previewTemplateSchema.parse(req.body);

      const preview = await transactionalEmailService.previewTemplate(
        id,
        body.variables || {}
      );

      if (!preview) {
        return res.status(404).json({ error: "Template not found" });
      }

      res.json(preview);
    } catch (error: any) {
      console.error("[Transactional Templates] Preview error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/transactional-templates/:id/duplicate
 * Duplicate a template
 */
router.post(
  "/:id/duplicate",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      const userId = req.user?.id;

      const [original] = await db
        .select()
        .from(transactionalEmailTemplates)
        .where(eq(transactionalEmailTemplates.id, id));

      if (!original) {
        return res.status(404).json({ error: "Template not found" });
      }

      const [duplicate] = await db
        .insert(transactionalEmailTemplates)
        .values({
          eventType: original.eventType,
          name: name || `${original.name} (Copy)`,
          description: original.description,
          subject: original.subject,
          htmlContent: original.htmlContent,
          textContent: original.textContent,
          variables: original.variables,
          smtpProviderId: original.smtpProviderId,
          isActive: false, // Start as inactive
          isDefault: false,
          createdBy: userId,
        })
        .returning();

      res.status(201).json(duplicate);
    } catch (error: any) {
      console.error("[Transactional Templates] Duplicate error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
