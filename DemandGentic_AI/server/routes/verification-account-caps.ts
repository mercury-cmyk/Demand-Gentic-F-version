/**
 * Verification Account Caps Management API
 * Provides endpoints for viewing and managing per-company lead caps
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  verificationAccountCapStatus, 
  verificationCampaigns, 
  accounts,
  verificationContacts 
} from "@shared/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { recalculateAccountCapStatus } from "../lib/verification-utils";
import { requireAuth } from "../auth";
import { z } from "zod";

const router = Router();

// Validation schemas
const getAccountCapsSchema = z.object({
  campaignId: z.string().uuid(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  search: z.string().optional(),
});

const getAccountContactsSchema = z.object({
  campaignId: z.string().uuid(),
  accountId: z.string().uuid(),
  limit: z.number().int().positive().max(100).optional(),
});

const updateAccountCapSchema = z.object({
  campaignId: z.string().uuid(),
  accountId: z.string().uuid(),
  cap: z.number().int().min(0).max(10000),
});

const recalculateSchema = z.object({
  campaignId: z.string().uuid(),
});

/**
 * GET /api/verification-campaigns/:campaignId/account-caps
 * Get account cap status for all companies in a campaign
 */
router.get("/api/verification-campaigns/:campaignId/account-caps", requireAuth, async (req: Request, res: Response) => {
  try {
    // Validate inputs
    const validation = getAccountCapsSchema.safeParse({
      campaignId: req.params.campaignId,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      search: req.query.search,
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Invalid parameters", details: validation.error.issues });
    }

    const { campaignId } = validation.data;
    const page = validation.data.page || 1;
    const limit = validation.data.limit || 50;
    const offset = (page - 1) * limit;
    const search = validation.data.search || "";

    // Verify campaign exists
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Build search filter
    const searchFilter = search
      ? sql`AND LOWER(a.name) LIKE ${`%${search.toLowerCase()}%`}`
      : sql``;

    // Get cap status with account details and top eligible contacts
    const capStatusQuery = await db.execute(sql`
      WITH account_stats AS (
        SELECT 
          c.account_id,
          COUNT(*) FILTER (WHERE c.eligibility_status = 'Eligible') as eligible_count,
          COUNT(*) FILTER (WHERE c.reserved_slot = true) as reserved_count,
          MAX(c.priority_score) as top_priority_score
        FROM verification_contacts c
        WHERE c.campaign_id = ${campaignId}
          AND c.deleted = false
          AND c.account_id IS NOT NULL
        GROUP BY c.account_id
      ),
      submission_counts AS (
        SELECT 
          s.account_id,
          COUNT(*) as submitted_count
        FROM verification_lead_submissions s
        WHERE s.campaign_id = ${campaignId}
          AND s.account_id IS NOT NULL
        GROUP BY s.account_id
      )
      SELECT 
        a.id as account_id,
        a.name as account_name,
        a.domain,
        COALESCE(acs.cap, ${campaign.leadCapPerAccount || 10}) as cap,
        COALESCE(sc.submitted_count, 0) as submitted_count,
        COALESCE(ast.reserved_count, 0) as reserved_count,
        COALESCE(ast.eligible_count, 0) as eligible_count,
        COALESCE(sc.submitted_count, 0) + COALESCE(ast.reserved_count, 0) as total_committed,
        COALESCE(acs.cap, ${campaign.leadCapPerAccount || 10}) - (COALESCE(sc.submitted_count, 0) + COALESCE(ast.reserved_count, 0)) as slots_remaining,
        ast.top_priority_score,
        CASE 
          WHEN (COALESCE(sc.submitted_count, 0) + COALESCE(ast.reserved_count, 0)) >= COALESCE(acs.cap, ${campaign.leadCapPerAccount || 10}) THEN 'at_cap'
          WHEN (COALESCE(sc.submitted_count, 0) + COALESCE(ast.reserved_count, 0)) >= (COALESCE(acs.cap, ${campaign.leadCapPerAccount || 10}) * 0.8) THEN 'near_cap'
          ELSE 'available'
        END as cap_status,
        acs.updated_at
      FROM accounts a
      LEFT JOIN verification_account_cap_status acs 
        ON acs.account_id = a.id AND acs.campaign_id = ${campaignId}
      LEFT JOIN account_stats ast ON ast.account_id = a.id
      LEFT JOIN submission_counts sc ON sc.account_id = a.id
      WHERE a.id IN (
        SELECT DISTINCT account_id 
        FROM verification_contacts 
        WHERE campaign_id = ${campaignId} 
          AND account_id IS NOT NULL
      )
      ${searchFilter}
      ORDER BY cap_status ASC, submitted_count DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    // Get total count for pagination
    const totalCountQuery = await db.execute(sql`
      SELECT COUNT(DISTINCT account_id) as total
      FROM verification_contacts
      WHERE campaign_id = ${campaignId}
        AND account_id IS NOT NULL
        ${search ? sql`AND account_id IN (
          SELECT id FROM accounts 
          WHERE LOWER(name) LIKE ${`%${search.toLowerCase()}%`}
        )` : sql``}
    `);

    const total = Number(totalCountQuery.rows[0]?.total || 0);

    res.json({
      data: capStatusQuery.rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error fetching account caps:", error);
    res.status(500).json({ error: "Failed to fetch account caps" });
  }
});

/**
 * GET /api/verification-campaigns/:campaignId/account-caps/:accountId/contacts
 * Get prioritized contacts for a specific account
 */
router.get("/api/verification-campaigns/:campaignId/account-caps/:accountId/contacts", requireAuth, async (req: Request, res: Response) => {
  try {
    // Validate inputs
    const validation = getAccountContactsSchema.safeParse({
      campaignId: req.params.campaignId,
      accountId: req.params.accountId,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Invalid parameters", details: validation.error.issues });
    }

    const { campaignId, accountId } = validation.data;
    const limit = validation.data.limit || 10;

    const contacts = await db
      .select({
        id: verificationContacts.id,
        fullName: verificationContacts.fullName,
        title: verificationContacts.title,
        email: verificationContacts.email,
        seniorityLevel: verificationContacts.seniorityLevel,
        titleAlignmentScore: verificationContacts.titleAlignmentScore,
        priorityScore: verificationContacts.priorityScore,
        eligibilityStatus: verificationContacts.eligibilityStatus,
        reservedSlot: verificationContacts.reservedSlot,
        sourceType: verificationContacts.sourceType,
        cavId: verificationContacts.cavId,
        cavUserId: verificationContacts.cavUserId,
      })
      .from(verificationContacts)
      .where(
        and(
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.accountId, accountId),
          eq(verificationContacts.deleted, false)
        )
      )
      .orderBy(
        // Priority 1: Client Provided + Has CAV Tel
        // Priority 2: Client Provided without CAV Tel
        // Priority 3: Others by priority score
        sql`CASE 
          WHEN source_type = 'Client_Provided' AND (cav_id IS NOT NULL OR cav_user_id IS NOT NULL) THEN 0
          WHEN source_type = 'Client_Provided' THEN 1
          ELSE 2
        END`,
        desc(verificationContacts.priorityScore)
      )
      .limit(limit);

    res.json({ data: contacts });
  } catch (error) {
    console.error("Error fetching account contacts:", error);
    res.status(500).json({ error: "Failed to fetch account contacts" });
  }
});

/**
 * PATCH /api/verification-campaigns/:campaignId/account-caps/:accountId
 * Adjust cap for a specific account
 */
router.patch("/api/verification-campaigns/:campaignId/account-caps/:accountId", requireAuth, async (req: Request, res: Response) => {
  try {
    // Validate inputs
    const validation = updateAccountCapSchema.safeParse({
      campaignId: req.params.campaignId,
      accountId: req.params.accountId,
      cap: req.body.cap,
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Invalid parameters", details: validation.error.issues });
    }

    const { campaignId, accountId, cap } = validation.data;

    // Upsert cap status
    const [existing] = await db
      .select()
      .from(verificationAccountCapStatus)
      .where(
        and(
          eq(verificationAccountCapStatus.campaignId, campaignId),
          eq(verificationAccountCapStatus.accountId, accountId)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(verificationAccountCapStatus)
        .set({ cap, updatedAt: new Date() })
        .where(
          and(
            eq(verificationAccountCapStatus.campaignId, campaignId),
            eq(verificationAccountCapStatus.accountId, accountId)
          )
        );
    } else {
      await db
        .insert(verificationAccountCapStatus)
        .values({
          campaignId,
          accountId,
          cap,
          submittedCount: 0,
          reservedCount: 0,
          eligibleCount: 0,
        });
    }

    // Recalculate counts
    await recalculateAccountCapStatus(campaignId, accountId);

    res.json({ success: true, message: "Cap updated successfully" });
  } catch (error) {
    console.error("Error updating account cap:", error);
    res.status(500).json({ error: "Failed to update account cap" });
  }
});

/**
 * POST /api/verification-campaigns/:campaignId/account-caps/recalculate
 * Recalculate all account cap statuses for a campaign
 */
router.post("/api/verification-campaigns/:campaignId/account-caps/recalculate", requireAuth, async (req: Request, res: Response) => {
  try {
    // Validate inputs
    const validation = recalculateSchema.safeParse({
      campaignId: req.params.campaignId,
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Invalid parameters", details: validation.error.issues });
    }

    const { campaignId } = validation.data;

    // Get all unique account IDs in this campaign
    const accountIds = await db
      .selectDistinct({ accountId: verificationContacts.accountId })
      .from(verificationContacts)
      .where(
        and(
          eq(verificationContacts.campaignId, campaignId),
          sql`${verificationContacts.accountId} IS NOT NULL`
        )
      );

    // Recalculate each account's cap status
    for (const { accountId } of accountIds) {
      if (accountId) {
        await recalculateAccountCapStatus(campaignId, accountId);
      }
    }

    res.json({ 
      success: true, 
      message: `Recalculated cap status for ${accountIds.length} accounts` 
    });
  } catch (error) {
    console.error("Error recalculating account caps:", error);
    res.status(500).json({ error: "Failed to recalculate account caps" });
  }
});

export default router;