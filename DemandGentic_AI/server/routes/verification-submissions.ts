import { Router } from "express";
import { db } from "../db";
import {
  verificationContacts,
  verificationLeadSubmissions,
  verificationCampaigns,
  verificationUploadJobs,
  accounts,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import Papa from "papaparse";
import { normalize } from "../lib/verification-utils";
import { requireAuth } from "../auth";
import { requireDataExportAuthority } from "../middleware/auth";

const router = Router();

router.post("/api/verification-campaigns/:campaignId/submission/prepare", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const batchSize = Number(req.body?.batchSize) || 500;
    
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    const cap = campaign.leadCapPerAccount;
    
    const result = await db.execute(sql`
      WITH eligible_contacts AS (
        SELECT 
          c.id as contact_id,
          c.account_id,
          ${campaignId} as campaign_id
        FROM verification_contacts c
        LEFT JOIN accounts a ON a.id = c.account_id
        WHERE c.campaign_id = ${campaignId}
          AND c.verification_status = 'Validated'
          AND c.eligibility_status = 'Eligible'
          AND c.suppressed = FALSE
          AND c.email_status = 'ok'
          AND c.in_submission_buffer = FALSE
          AND c.id NOT IN (
            SELECT contact_id FROM verification_lead_submissions
            WHERE created_at >= NOW() - INTERVAL '730 days'
          )
          AND (
            SELECT COUNT(*) FROM verification_lead_submissions s
            WHERE s.account_id = c.account_id AND s.campaign_id = ${campaignId}
          )  r.contact_id);
    
    if (contactIds.length > 0) {
      await db.execute(sql`
        UPDATE verification_contacts
        SET in_submission_buffer = TRUE, updated_at = NOW()
        WHERE id = ANY(ARRAY[${sql.join(contactIds.map(id => sql`${id}`), sql`, `)}])
      `);
    }
    
    res.json({ buffered: contactIds.length });
  } catch (error) {
    console.error("Error preparing submission buffer:", error);
    res.status(500).json({ error: "Failed to prepare submission buffer" });
  }
});

router.get("/api/verification-campaigns/:campaignId/submission/company-stats", async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    const leadCapPerAccount = campaign.leadCapPerAccount;
    
    // Get per-company submission stats
    const stats = await db.execute(sql`
      SELECT 
        a.id as account_id,
        a.name as account_name,
        a.domain as account_domain,
        COUNT(DISTINCT s.id) as submitted_count,
        COUNT(DISTINCT c.id) FILTER (WHERE c.eligibility_status = 'Eligible' AND c.suppressed = FALSE AND c.email_status = 'ok' AND c.verification_status = 'Validated' AND c.in_submission_buffer = FALSE) as eligible_remaining,
        ${leadCapPerAccount} as lead_cap,
        CASE 
          WHEN COUNT(DISTINCT s.id) >= ${leadCapPerAccount} THEN 'At Cap'
          WHEN COUNT(DISTINCT s.id) >= ${leadCapPerAccount} * 0.8 THEN 'Near Cap'
          ELSE 'Below Cap'
        END as cap_status
      FROM accounts a
      LEFT JOIN verification_contacts c ON c.account_id = a.id AND c.campaign_id = ${campaignId} AND c.deleted = FALSE
      LEFT JOIN verification_lead_submissions s ON s.account_id = a.id AND s.campaign_id = ${campaignId}
      WHERE a.id IN (
        SELECT DISTINCT account_id FROM verification_contacts 
        WHERE campaign_id = ${campaignId} AND account_id IS NOT NULL
      )
      GROUP BY a.id, a.name, a.domain
      HAVING COUNT(DISTINCT s.id) > 0 OR COUNT(DISTINCT c.id) > 0
      ORDER BY COUNT(DISTINCT s.id) DESC, a.name
    `);
    
    res.json({ 
      stats: stats.rows,
      leadCapPerAccount,
      summary: {
        totalCompanies: stats.rows.length,
        companiesAtCap: stats.rows.filter((r: any) => r.cap_status === 'At Cap').length,
        companiesNearCap: stats.rows.filter((r: any) => r.cap_status === 'Near Cap').length,
      }
    });
  } catch (error) {
    console.error("Error fetching company submission stats:", error);
    res.status(500).json({ error: "Failed to fetch company submission stats" });
  }
});

router.get("/api/verification-campaigns/:campaignId/submission/export", requireAuth, requireDataExportAuthority, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const templateType = req.query.template || 'enriched';
    
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    let whereClause = sql`
      c.campaign_id = ${campaignId}
      AND c.eligibility_status = 'Eligible'
      AND c.suppressed = FALSE
      AND c.deleted = FALSE
      AND c.email_status = 'ok'
      AND c.in_submission_buffer = TRUE
    `;
    
    if (templateType === 'client_cav') {
      whereClause = sql`${whereClause} AND c.cav_id IS NOT NULL`;
    }
    
    const exportData = await db.execute(sql`
      SELECT 
        c.*,
        a.name as account_name,
        a.hq_street_1 as hq_address_line1,
        a.hq_street_2 as hq_address_line2,
        a.hq_street_3 as hq_address_line3,
        a.hq_city,
        a.hq_state,
        a.hq_country,
        a.hq_postal_code,
        a.main_phone as account_phone,
        a.domain as account_domain,
        a.linkedin_url as account_linkedin
      FROM verification_contacts c
      LEFT JOIN accounts a ON a.id = c.account_id
      WHERE ${whereClause}
      ORDER BY a.name, c.last_name, c.first_name
    `);
    
    const mapped = exportData.rows.map((row: any) => {
      const city = row.contact_city || row.hq_city;
      const state = row.contact_state || row.hq_state;
      const country = row.contact_country || row.hq_country;
      const postal = row.contact_postal || row.hq_postal_code;
      
      if (templateType === 'client_cav') {
        return {
          "CAV-ID": row.cav_id,
          "CAV-User ID": row.cav_user_id,
          "CAV-Company": row.account_name,
          "CAV-Addr1": row.hq_address_line1 || "",
          "CAV-Addr2": row.hq_address_line2 || "",
          "CAV-Addr3": row.hq_address_line3 || "",
          "CAV-Town": city || "",
          "CAV-County": state || "",
          "CAV-Postcode": postal || "",
          "CAV-Country": country || "",
          "CAV-Tel": row.phone || row.account_phone || "",
          "CAV-Forename": row.first_name || "",
          "CAV-Surname": row.last_name || "",
          "CAV-Job Title": row.title || "",
          "CAV-Email": row.email || "",
          "Linkedin URL/Social Media Profile": row.linkedin_url || row.account_linkedin || "",
        };
      } else {
        return {
          "First Name": row.first_name || "",
          "Last Name": row.last_name || "",
          "Full Name": row.full_name || "",
          "Title": row.title || "",
          "Email": row.email || "",
          "Email Validation Status": row.email_status || "unknown",
          "Phone": row.phone || "",
          "Mobile": row.mobile || "",
          "LinkedIn URL": row.linkedin_url || "",
          "Company": row.account_name || "",
          "City": city || "",
          "State": state || "",
          "Country": country || "",
          "Postal Code": postal || "",
          "Domain": row.account_domain || "",
          "Account Phone": row.account_phone || "",
          "AI Enriched Address 1": row.ai_enriched_address1 || "",
          "AI Enriched Address 2": row.ai_enriched_address2 || "",
          "AI Enriched Address 3": row.ai_enriched_address3 || "",
          "AI Enriched City": row.ai_enriched_city || "",
          "AI Enriched State": row.ai_enriched_state || "",
          "AI Enriched Postal Code": row.ai_enriched_postal || "",
          "AI Enriched Country": row.ai_enriched_country || "",
          "AI Enriched Phone": row.ai_enriched_phone || "",
          "Source Type": row.source_type || "",
          "CAV ID": row.cav_id || "",
        };
      }
    });
    
    res.json({ data: mapped, count: mapped.length });
  } catch (error) {
    console.error("Error exporting data:", error);
    res.status(500).json({ error: "Failed to export data" });
  }
});

/**
 * Upload validated email results from external validation service
 * Expects CSV with columns: email, emailStatus (or Email Status)
 * Updates email_status for matching contacts
 */
router.post("/api/verification-campaigns/:campaignId/upload/validation-results", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { csvData } = req.body;
    
    if (!csvData) {
      return res.status(400).json({ error: "csvData is required" });
    }
    
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    // Create upload job
    const [job] = await db
      .insert(verificationUploadJobs)
      .values({
        campaignId,
        jobType: 'validation_results',
        status: 'pending',
        csvData,
        createdBy: req.user?.userId || null,
      })
      .returning();
    
    // Process in background
    const { processUploadJob } = await import("../lib/upload-job-processor");
    setImmediate(() => processUploadJob(job.id));
    
    res.json({
      jobId: job.id,
      status: 'pending',
      message: 'Upload job created successfully. Processing in background.'
    });
  } catch (error) {
    console.error("Error creating validation results upload job:", error);
    res.status(500).json({ error: "Failed to create upload job" });
  }
});

/**
 * Upload submission records to track which contacts have been delivered to client
 * Expects CSV with columns: email (or contact_id), submitted_at (optional)
 * Creates submission records with 2-year exclusion tracking
 */
router.post("/api/verification-campaigns/:campaignId/upload/submissions", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { csvData } = req.body;
    
    if (!csvData) {
      return res.status(400).json({ error: "csvData is required" });
    }
    
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    // Create upload job
    const [job] = await db
      .insert(verificationUploadJobs)
      .values({
        campaignId,
        jobType: 'submissions',
        status: 'pending',
        csvData,
        createdBy: req.user?.userId || null,
      })
      .returning();
    
    // Process in background
    const { processUploadJob } = await import("../lib/upload-job-processor");
    setImmediate(() => processUploadJob(job.id));
    
    res.json({
      jobId: job.id,
      status: 'pending',
      message: 'Upload job created successfully. Processing in background.'
    });
  } catch (error) {
    console.error("Error creating submission upload job:", error);
    res.status(500).json({ error: "Failed to create upload job" });
  }
});

/**
 * Get upload job status
 */
router.get("/api/verification-campaigns/:campaignId/upload-jobs/:jobId", async (req, res) => {
  try {
    const { campaignId, jobId } = req.params;
    
    const [job] = await db
      .select()
      .from(verificationUploadJobs)
      .where(
        and(
          eq(verificationUploadJobs.id, jobId),
          eq(verificationUploadJobs.campaignId, campaignId)
        )
      );
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    res.json(job);
  } catch (error) {
    console.error("Error fetching upload job status:", error);
    res.status(500).json({ error: "Failed to fetch job status" });
  }
});

export default router;