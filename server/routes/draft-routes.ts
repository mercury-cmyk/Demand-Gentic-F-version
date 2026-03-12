import { Router } from "express";
import { requireAuth } from "../auth";
import { apiLimiter } from "../middleware/security";
import {
  listDrafts,
  getDraft,
  createDraft,
  updateDraft,
  deleteDraft,
} from "../services/draft-service";
import { z } from "zod";

const router = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const createSchema = z.object({
  mailboxAccountId: z.string().optional(),
  toEmails: z.array(z.string().email()).optional(),
  ccEmails: z.array(z.string().email()).optional(),
  subject: z.string().max(512).optional(),
  bodyHtml: z.string().optional(),
  bodyPlain: z.string().optional(),
  replyToMessageId: z.string().uuid().optional(),
  forwardFromMessageId: z.string().uuid().optional(),
  composerMode: z.enum(["new", "reply", "replyAll", "forward"]).default("new"),
});

const updateSchema = createSchema.partial();

router.get("/drafts", requireAuth, apiLimiter, async (req, res) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const drafts = await listDrafts(req.user!.userId, query);
    res.json({ drafts });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: "Invalid query", errors: error.errors });
    console.error("[DRAFTS] list error:", error);
    res.status(500).json({ message: "Failed to list drafts" });
  }
});

router.post("/drafts", requireAuth, apiLimiter, async (req, res) => {
  try {
    const data = createSchema.parse(req.body);
    const draft = await createDraft({ ...data, userId: req.user!.userId });
    res.status(201).json({ draft });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    console.error("[DRAFTS] create error:", error);
    res.status(500).json({ message: "Failed to create draft" });
  }
});

router.patch("/drafts/:id", requireAuth, apiLimiter, async (req, res) => {
  try {
    const data = updateSchema.parse(req.body);
    const draft = await updateDraft(req.user!.userId, req.params.id, data);
    if (!draft) return res.status(404).json({ message: "Draft not found" });
    res.json({ draft });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    console.error("[DRAFTS] update error:", error);
    res.status(500).json({ message: "Failed to update draft" });
  }
});

router.delete("/drafts/:id", requireAuth, apiLimiter, async (req, res) => {
  try {
    const deleted = await deleteDraft(req.user!.userId, req.params.id);
    if (!deleted) return res.status(404).json({ message: "Draft not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("[DRAFTS] delete error:", error);
    res.status(500).json({ message: "Failed to delete draft" });
  }
});

export default router;
