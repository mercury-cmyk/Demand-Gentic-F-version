import { Router } from "express";
import { requireAuth } from "../auth";
import { apiLimiter } from "../middleware/security";
import { db } from "../db";
import { scheduledEmails, mailboxAccounts } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const scheduleSchema = z.object({
  mailboxAccountId: z.string(),
  fromEmail: z.string().email(),
  toEmails: z.array(z.string().email()).min(1),
  ccEmails: z.array(z.string().email()).optional(),
  bccEmails: z.array(z.string().email()).optional(),
  subject: z.string().max(512),
  bodyHtml: z.string(),
  bodyPlain: z.string().optional(),
  scheduledFor: z.string().datetime(),
  opportunityId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * POST /api/inbox/schedule
 * Schedule email for future sending
 */
router.post("/schedule", requireAuth, apiLimiter, async (req, res) => {
  try {
    const data = scheduleSchema.parse(req.body);
    const userId = req.user!.userId;

    // Verify mailbox ownership
    const [mailbox] = await db
      .select({ id: mailboxAccounts.id })
      .from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, data.mailboxAccountId), eq(mailboxAccounts.userId, userId)))
      .limit(1);
    if (!mailbox) return res.status(403).json({ message: "Mailbox not found or not yours" });

    const [email] = await db
      .insert(scheduledEmails)
      .values({
        ...data,
        scheduledFor: new Date(data.scheduledFor),
        status: "pending",
        createdBy: userId,
      })
      .returning();
    res.status(201).json({ scheduledEmail: email });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    console.error("[SCHEDULE] create error:", error);
    res.status(500).json({ message: "Failed to schedule email" });
  }
});

/**
 * GET /api/inbox/scheduled
 * List pending scheduled emails
 */
router.get("/scheduled", requireAuth, apiLimiter, async (req, res) => {
  try {
    const query = paginationSchema.parse(req.query);
    const userId = req.user!.userId;

    const emails = await db
      .select()
      .from(scheduledEmails)
      .where(and(eq(scheduledEmails.createdBy, userId), eq(scheduledEmails.status, "pending")))
      .orderBy(desc(scheduledEmails.scheduledFor))
      .limit(query.limit)
      .offset(query.offset);
    res.json({ scheduledEmails: emails });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: "Invalid query", errors: error.errors });
    console.error("[SCHEDULE] list error:", error);
    res.status(500).json({ message: "Failed to list scheduled emails" });
  }
});

/**
 * PATCH /api/inbox/scheduled/:id
 * Edit scheduled email before send time
 */
router.patch("/scheduled/:id", requireAuth, apiLimiter, async (req, res) => {
  try {
    const data = scheduleSchema.partial().parse(req.body);
    const userId = req.user!.userId;

    const [updated] = await db
      .update(scheduledEmails)
      .set({
        ...data,
        scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(scheduledEmails.id, req.params.id),
          eq(scheduledEmails.createdBy, userId),
          eq(scheduledEmails.status, "pending")
        )
      )
      .returning();
    if (!updated) return res.status(404).json({ message: "Scheduled email not found or already sent" });
    res.json({ scheduledEmail: updated });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    console.error("[SCHEDULE] update error:", error);
    res.status(500).json({ message: "Failed to update scheduled email" });
  }
});

/**
 * DELETE /api/inbox/scheduled/:id
 * Cancel scheduled email
 */
router.delete("/scheduled/:id", requireAuth, apiLimiter, async (req, res) => {
  try {
    const userId = req.user!.userId;

    const [cancelled] = await db
      .update(scheduledEmails)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(scheduledEmails.id, req.params.id),
          eq(scheduledEmails.createdBy, userId),
          eq(scheduledEmails.status, "pending")
        )
      )
      .returning();
    if (!cancelled) return res.status(404).json({ message: "Scheduled email not found or already sent" });
    res.json({ success: true, message: "Scheduled email cancelled" });
  } catch (error) {
    console.error("[SCHEDULE] cancel error:", error);
    res.status(500).json({ message: "Failed to cancel scheduled email" });
  }
});

export default router;