import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  getSuppressionReason,
  checkSuppressionBulk,
  addToSuppressionList,
  removeFromSuppressionList,
  getSuppressionList,
} from "../lib/suppression.service";

const router = Router();

/**
 * GET /api/suppression/list
 * Get all suppression list entries with pagination
 */
router.get("/list", async (req: Request, res: Response) => {
  try {
    const { limit = "100", offset = "0" } = req.query;
    
    const result = await getSuppressionList({
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
    
    res.json(result);
  } catch (error) {
    console.error("Error fetching suppression list:", error);
    res.status(500).json({ error: "Failed to fetch suppression list" });
  }
});

/**
 * GET /api/suppression/check/:contactId
 * Check if a single contact is suppressed and return the reason
 */
router.get("/check/:contactId", async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;
    
    const reason = await getSuppressionReason(contactId);
    
    res.json({
      contactId,
      isSuppressed: reason !== null,
      reason,
    });
  } catch (error) {
    console.error("Error checking suppression:", error);
    res.status(500).json({ error: "Failed to check suppression" });
  }
});

/**
 * POST /api/suppression/check/bulk
 * Check suppression for multiple contacts
 * Body: { contactIds: string[] }
 */
router.post("/check/bulk", async (req: Request, res: Response) => {
  try {
    const bodySchema = z.object({
      contactIds: z.array(z.string()).min(1).max(1000),
    });
    
    const { contactIds } = bodySchema.parse(req.body);
    
    const suppressionMap = await checkSuppressionBulk(contactIds);
    
    // Convert Map to object for JSON response
    const suppressedContacts: Record<string, string> = {};
    suppressionMap.forEach((reason, contactId) => {
      suppressedContacts[contactId] = reason;
    });
    
    res.json({
      total: contactIds.length,
      suppressed: suppressionMap.size,
      contacts: suppressedContacts,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    console.error("Error checking bulk suppression:", error);
    res.status(500).json({ error: "Failed to check bulk suppression" });
  }
});

/**
 * POST /api/suppression/add
 * Add entries to the suppression list
 * Body: { entries: Array<{ email?, fullName?, companyName?, cavId?, cavUserId?, reason?, source? }> }
 */
router.post("/add", async (req: Request, res: Response) => {
  try {
    const bodySchema = z.object({
      entries: z.array(
        z.object({
          email: z.string().email().optional(),
          fullName: z.string().optional(),
          companyName: z.string().optional(),
          cavId: z.string().optional(),
          cavUserId: z.string().optional(),
          reason: z.string().optional(),
          source: z.string().optional(),
        })
      ).min(1),
    }).refine(
      (data) => {
        // Each entry must have at least one of:
        // - email
        // - cavId
        // - cavUserId
        // - (fullName AND companyName)
        return data.entries.every(entry => {
          const hasEmail = !!entry.email;
          const hasCavId = !!entry.cavId;
          const hasCavUserId = !!entry.cavUserId;
          const hasFullNameAndCompany = !!entry.fullName && !!entry.companyName;
          
          return hasEmail || hasCavId || hasCavUserId || hasFullNameAndCompany;
        });
      },
      {
        message: "Each entry must have email, cavId, cavUserId, or both fullName and companyName",
      }
    );
    
    const { entries } = bodySchema.parse(req.body);
    
    const added = await addToSuppressionList(entries);
    
    res.status(201).json({
      message: `Added ${added} entries to suppression list`,
      added,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    console.error("Error adding to suppression list:", error);
    res.status(500).json({ error: "Failed to add to suppression list" });
  }
});

/**
 * DELETE /api/suppression/remove
 * Remove entries from the suppression list
 * Body: { ids: number[] }
 */
router.delete("/remove", async (req: Request, res: Response) => {
  try {
    const bodySchema = z.object({
      ids: z.array(z.number()).min(1),
    });
    
    const { ids } = bodySchema.parse(req.body);
    
    const removed = await removeFromSuppressionList(ids);
    
    res.json({
      message: `Removed ${removed} entries from suppression list`,
      removed,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    console.error("Error removing from suppression list:", error);
    res.status(500).json({ error: "Failed to remove from suppression list" });
  }
});

export default router;
