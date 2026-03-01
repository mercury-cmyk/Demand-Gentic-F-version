/**
 * QA Gated Content Routes
 * API endpoints for managing QA-gated content
 * Admin routes for review and client routes for approved content access
 */

import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../auth";
import {
  registerContent,
  analyzeContent,
  submitReview,
  publishToClient,
  getApprovedContent,
  getApprovedSimulations,
  getApprovedMockCalls,
  getApprovedReports,
  isClientVisible,
  getPendingContent,
  bulkReview,
  migrateLegacyContentToQaGate,
  type QAContentType,
  type QAStatus,
} from "../services/qa-gate-service";
import { db } from "../db";
import { qaGatedContent, clientAccounts } from "@shared/schema";
import { eq, desc, and, inArray, sql } from "drizzle-orm";

const router = Router();
const requireQaReviewAccess = requireRole("admin", "quality_analyst", "campaign_manager");

// ==================== ADMIN QA MANAGEMENT ====================

/**
 * GET /api/admin/qa-content
 * List all QA-gated content with filtering
 */
router.get(
  "/admin/qa-content",
  requireAuth,
  requireQaReviewAccess,
  async (req: Request, res: Response) => {
    try {
      const {
        status,
        contentType,
        clientAccountId,
        limit = "50",
        offset = "0",
      } = req.query;

      const conditions = [];

      if (status) {
        const statuses = (status as string).split(",") as QAStatus[];
        conditions.push(inArray(qaGatedContent.qaStatus, statuses));
      }

      if (contentType) {
        conditions.push(eq(qaGatedContent.contentType, contentType as QAContentType));
      }

      if (clientAccountId) {
        conditions.push(eq(qaGatedContent.clientAccountId, clientAccountId as string));
      }

      const query = db
        .select({
          qaContent: qaGatedContent,
          clientAccount: clientAccounts,
        })
        .from(qaGatedContent)
        .leftJoin(clientAccounts, eq(qaGatedContent.clientAccountId, clientAccounts.id))
        .orderBy(desc(qaGatedContent.createdAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));

      if (conditions.length > 0) {
        const results = await query.where(and(...conditions));
        res.json({
          success: true,
          content: results,
          pagination: {
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
          },
        });
      } else {
        const results = await query;
        res.json({
          success: true,
          content: results,
          pagination: {
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
          },
        });
      }
    } catch (error) {
      console.error("Error fetching QA content:", error);
      res.status(500).json({ error: "Failed to fetch QA content" });
    }
  }
);

/**
 * GET /api/admin/qa-content/pending
 * Get content awaiting review
 */
router.get(
  "/admin/qa-content/pending",
  requireAuth,
  requireQaReviewAccess,
  async (req: Request, res: Response) => {
    try {
      const { contentType, limit = "50" } = req.query;

      const content = await getPendingContent(
        contentType as QAContentType | undefined,
        parseInt(limit as string)
      );

      res.json({
        success: true,
        content,
        count: content.length,
      });
    } catch (error) {
      console.error("Error fetching pending QA content:", error);
      res.status(500).json({ error: "Failed to fetch pending QA content" });
    }
  }
);

/**
 * GET /api/admin/qa-content/:id
 * Get specific QA content with details
 */
router.get(
  "/admin/qa-content/:id([0-9a-fA-F-]{36})",
  requireAuth,
  requireQaReviewAccess,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [content] = await db
        .select({
          qaContent: qaGatedContent,
          clientAccount: clientAccounts,
        })
        .from(qaGatedContent)
        .leftJoin(clientAccounts, eq(qaGatedContent.clientAccountId, clientAccounts.id))
        .where(eq(qaGatedContent.id, id))
        .limit(1);

      if (!content) {
        return res.status(404).json({ error: "QA content not found" });
      }

      res.json({
        success: true,
        content: content.qaContent,
        clientAccount: content.clientAccount,
      });
    } catch (error) {
      console.error("Error fetching QA content:", error);
      res.status(500).json({ error: "Failed to fetch QA content" });
    }
  }
);

/**
 * POST /api/admin/qa-content/register
 * Register new content for QA gating
 */
router.post(
  "/admin/qa-content/register",
  requireAuth,
  requireQaReviewAccess,
  async (req: Request, res: Response) => {
    try {
      const { contentType, contentId, campaignId, clientAccountId, projectId } = req.body;

      if (!contentType || !contentId) {
        return res.status(400).json({ error: "contentType and contentId are required" });
      }

      const validTypes: QAContentType[] = ['simulation', 'mock_call', 'report', 'data_export'];
      if (!validTypes.includes(contentType)) {
        return res.status(400).json({ error: "Invalid content type" });
      }

      const qaContent = await registerContent(contentType, contentId, {
        campaignId,
        clientAccountId,
        projectId,
        createdBy: (req as any).user?.userId,
      });

      res.status(201).json({
        success: true,
        content: qaContent,
        message: "Content registered for QA",
      });
    } catch (error) {
      console.error("Error registering QA content:", error);
      res.status(500).json({ error: "Failed to register QA content" });
    }
  }
);

/**
 * POST /api/admin/qa-content/:id/analyze
 * Trigger AI analysis for content
 */
router.post(
  "/admin/qa-content/:id([0-9a-fA-F-]{36})/analyze",
  requireAuth,
  requireQaReviewAccess,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { autoApproveThreshold } = req.body;

      const result = await analyzeContent(id, autoApproveThreshold);

      if (!result) {
        return res.status(404).json({ error: "QA content not found" });
      }

      res.json({
        success: true,
        analysis: result,
      });
    } catch (error) {
      console.error("Error analyzing QA content:", error);
      res.status(500).json({ error: "Failed to analyze QA content" });
    }
  }
);

/**
 * PATCH /api/admin/qa-content/:id/review
 * Submit a manual QA review
 */
router.patch(
  "/admin/qa-content/:id([0-9a-fA-F-]{36})/review",
  requireAuth,
  requireQaReviewAccess,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, score, notes } = req.body;

      if (!status) {
        return res.status(400).json({ error: "status is required" });
      }

      const validStatuses: QAStatus[] = ['new', 'under_review', 'approved', 'rejected', 'returned', 'published'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const updated = await submitReview(id, {
        status,
        score,
        notes,
        reviewerId: (req as any).user?.userId,
      });

      if (!updated) {
        return res.status(404).json({ error: "QA content not found" });
      }

      res.json({
        success: true,
        content: updated,
        message: `Content ${status}`,
      });
    } catch (error) {
      console.error("Error reviewing QA content:", error);
      res.status(500).json({ error: "Failed to review QA content" });
    }
  }
);

/**
 * POST /api/admin/qa-content/:id/publish
 * Publish approved content to client
 */
router.post(
  "/admin/qa-content/:id([0-9a-fA-F-]{36})/publish",
  requireAuth,
  requireQaReviewAccess,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const success = await publishToClient(id, (req as any).user?.userId);

      if (!success) {
        return res.status(400).json({
          error: "Cannot publish content. Ensure it is approved first.",
        });
      }

      res.json({
        success: true,
        message: "Content published to client",
      });
    } catch (error) {
      console.error("Error publishing QA content:", error);
      res.status(500).json({ error: "Failed to publish QA content" });
    }
  }
);

/**
 * POST /api/admin/qa-content/bulk-review
 * Bulk review multiple content items
 */
router.post(
  "/admin/qa-content/bulk-review",
  requireAuth,
  requireQaReviewAccess,
  async (req: Request, res: Response) => {
    try {
      const { contentIds, status, score, notes } = req.body;

      if (!contentIds || !Array.isArray(contentIds) || contentIds.length === 0) {
        return res.status(400).json({ error: "contentIds array is required" });
      }

      if (!status) {
        return res.status(400).json({ error: "status is required" });
      }

      const result = await bulkReview(contentIds, {
        status,
        score,
        notes,
        reviewerId: (req as any).user?.userId,
      });

      res.json({
        success: true,
        result,
        message: `Reviewed ${result.success} items, ${result.failed} failed`,
      });
    } catch (error) {
      console.error("Error bulk reviewing QA content:", error);
      res.status(500).json({ error: "Failed to bulk review QA content" });
    }
  }
);

/**
 * POST /api/admin/qa-content/migrate
 * Backfill legacy client content into QA-gated registry and link qa_content_id references
 */
router.post(
  "/admin/qa-content/migrate",
  requireAuth,
  requireQaReviewAccess,
  async (_req: Request, res: Response) => {
    try {
      const result = await migrateLegacyContentToQaGate();
      res.json({
        success: true,
        result,
        message: `Migration complete. Linked ${result.totalLinked} item(s).`,
      });
    } catch (error) {
      console.error("Error migrating legacy QA content:", error);
      res.status(500).json({ error: "Failed to migrate legacy QA content" });
    }
  }
);

/**
 * GET /api/admin/qa-content/stats
 * Get QA content statistics
 */
router.get(
  "/admin/qa-content/stats",
  requireAuth,
  requireQaReviewAccess,
  async (req: Request, res: Response) => {
    try {
      const stats = await db
        .select({
          status: qaGatedContent.qaStatus,
          contentType: qaGatedContent.contentType,
          count: sql<number>`count(*)`,
        })
        .from(qaGatedContent)
        .groupBy(qaGatedContent.qaStatus, qaGatedContent.contentType);

      // Aggregate stats
      const byStatus: Record<string, number> = {};
      const byType: Record<string, number> = {};

      for (const row of stats) {
        byStatus[row.status] = (byStatus[row.status] || 0) + Number(row.count);
        byType[row.contentType] = (byType[row.contentType] || 0) + Number(row.count);
      }

      res.json({
        success: true,
        stats: {
          byStatus,
          byType,
          detailed: stats,
        },
      });
    } catch (error) {
      console.error("Error fetching QA content stats:", error);
      res.status(500).json({ error: "Failed to fetch QA content stats" });
    }
  }
);

// ==================== CLIENT-FACING ROUTES ====================
// These use client portal authentication (to be added to client-portal.ts)

/**
 * Internal helper to get approved content for client portal
 * This function is exported for use in client-portal.ts
 */
export async function getClientApprovedContent(
  clientAccountId: string,
  contentType?: QAContentType
) {
  return getApprovedContent(clientAccountId, contentType);
}

export async function getClientSimulations(clientAccountId: string) {
  return getApprovedSimulations(clientAccountId);
}

export async function getClientMockCalls(clientAccountId: string) {
  return getApprovedMockCalls(clientAccountId);
}

export async function getClientReports(clientAccountId: string) {
  return getApprovedReports(clientAccountId);
}

export async function checkClientContentVisibility(
  contentType: QAContentType,
  contentId: string,
  clientAccountId: string
) {
  return isClientVisible(contentType, contentId, clientAccountId);
}

export default router;
