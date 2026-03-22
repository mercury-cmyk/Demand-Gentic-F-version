import { Router } from "express";
import { db } from "../db";
import {
  verificationContacts,
  verificationCampaigns,
  verificationLeadSubmissions,
  verificationAuditLog,
  accounts,
  verificationEmailValidations,
  verificationEmailValidationJobs,
  insertVerificationContactSchema,
} from "@shared/schema";
import { eq, sql, and, desc, inArray, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { evaluateEligibility, computeNormalizedKeys, calculateContactPriority } from "../lib/verification-utils";
import { applySuppressionForContacts } from "../lib/verification-suppression";
import { requireAuth } from "../auth";
import { requireDataExportAuthority } from "../middleware/auth";
import { exportVerificationContactsToCsv, createCsvDownloadResponse } from "../lib/csv-export";
import { validateEmail3Layer } from "../lib/email-validation-engine";

const router = Router();

interface EmailVerificationResult {
  email: string;
  status: string;
  details: {
    syntax: boolean;
    domain: boolean;
    smtp: boolean;
    catch_all: boolean;
    disposable: boolean;
    free: boolean;
    role: boolean;
  };
  reason: string;
  provider: string;
  rawResponse: any;
  checkedAt: Date;
  kickboxResult?: string;
  kickboxReason?: string;
  kickboxScore?: number;
  kickboxAcceptAll?: boolean;
  kickboxDisposable?: boolean;
  kickboxFree?: boolean;
  kickboxRole?: boolean;
  kickboxDidYouMean?: string | null;
  riskLevel?: string;
  isBusinessEmail?: boolean;
  emailEligible?: boolean;
  eligibilityReason?: string;
  deepVerifiedAt?: Date;
}

/**
 * Verify emails in bulk with tiered batching and pool health checks
 * 
 * Architecture:
 * - Processes emails in mini-batches of 25 to prevent pool exhaustion
 * - Checks pool health before each mini-batch
 * - Implements exponential backoff when pool is under pressure
 * - Wraps DB operations in withRetry for resilience
 * 
 * @param emails - Array of email addresses to verify
 * @param options - Configuration options
 * @returns Map of email to verification results
 */
async function verifyEmailsBulk(
  emails: string[],
  options: {
    delayMs?: number;
    onProgress?: (completed: number, total: number, currentEmail: string) => void;
    onCircuitOpen?: () => Promise; // Callback when circuit breaker opens
  } = {}
): Promise> {
  const { delayMs = 0, onProgress, onCircuitOpen } = options;
  const results = new Map();
  
  // Mini-batch size: 25 emails per chunk to prevent pool exhaustion
  const MINI_BATCH_SIZE = 25;
  const totalMiniBatches = Math.ceil(emails.length / MINI_BATCH_SIZE);
  
  console.log(`[verifyEmailsBulk] Processing ${emails.length} emails in ${totalMiniBatches} mini-batches of ${MINI_BATCH_SIZE}`);

  for (let miniBatchIndex = 0; miniBatchIndex  setTimeout(resolve, backoffDelay));
      
      // Recheck after backoff
      if (poolMetrics.isCircuitOpen()) {
        console.error(`[verifyEmailsBulk] Pool still unhealthy after backoff. Aborting mini-batch ${miniBatchIndex + 1}/${totalMiniBatches}`);
        throw new Error('Database pool exhausted - circuit breaker open');
      }
    }
    
    console.log(`[verifyEmailsBulk] Mini-batch ${miniBatchIndex + 1}/${totalMiniBatches}: Processing ${miniBatch.length} emails (Pool: ${poolStats.total} total, ${poolStats.idle} idle, ${poolStats.waiting} waiting)`);

    // Process mini-batch with retry wrapper
    for (let i = 0; i  0 && i  setTimeout(resolve, delayMs));
        }
      } catch (error) {
        console.error(`[verifyEmailsBulk] Error validating ${email}:`, error);
        results.set(email, {
          email,
          status: 'unknown',
          details: {
            syntax: false,
            domain: false,
            smtp: false,
            catch_all: false,
            disposable: false,
            free: false,
            role: false,
          },
          reason: 'validation_error',
          provider: 'kickbox',
          rawResponse: { error: String(error) },
          checkedAt: new Date(),
        });
      }
    }
    
    // Mini-batch checkpoint: brief pause between batches to allow pool recovery
    if (miniBatchIndex  setTimeout(resolve, 100));
    }
  }

  console.log(`[verifyEmailsBulk] Completed processing ${emails.length} emails across ${totalMiniBatches} mini-batches`);
  return results;
}

router.get("/api/verification-campaigns/:campaignId/queue", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const limit = Number(req.query.limit) || 50;
    const contactSearch = req.query.contactSearch as string || "";
    const phoneSearch = req.query.phoneSearch as string || "";
    const companySearch = req.query.companySearch as string || "";
    const sourceType = req.query.sourceType as string || "";
    const country = req.query.country as string || "";
    const eligibilityStatus = req.query.eligibilityStatus as string || "";
    const emailStatus = req.query.emailStatus as string || "";
    const verificationStatus = req.query.verificationStatus as string || "";
    const hasPhone = req.query.hasPhone as string || "";
    const hasAddress = req.query.hasAddress as string || "";
    const hasCav = req.query.hasCav as string || "";
    
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    const cap = campaign.leadCapPerAccount;
    
    // Build dynamic filter conditions
    const filterConditions = [];
    
    if (contactSearch) {
      filterConditions.push(sql`(
        LOWER(c.full_name) LIKE ${`%${contactSearch.toLowerCase()}%`}
        OR LOWER(c.email) LIKE ${`%${contactSearch.toLowerCase()}%`}
        OR LOWER(c.phone) LIKE ${`%${contactSearch.toLowerCase()}%`}
        OR LOWER(c.mobile) LIKE ${`%${contactSearch.toLowerCase()}%`}
      )`);
    }
    
    if (phoneSearch) {
      filterConditions.push(sql`(
        LOWER(c.phone) LIKE ${`%${phoneSearch.toLowerCase()}%`}
        OR LOWER(c.mobile) LIKE ${`%${phoneSearch.toLowerCase()}%`}
      )`);
    }
    
    if (sourceType) {
      filterConditions.push(sql`c.source_type = ${sourceType}`);
    }
    
    if (country) {
      filterConditions.push(sql`LOWER(c.contact_country) LIKE ${`%${country.toLowerCase()}%`}`);
    }
    
    if (eligibilityStatus) {
      filterConditions.push(sql`c.eligibility_status = ${eligibilityStatus}`);
    }
    
    if (emailStatus) {
      filterConditions.push(sql`c.email_status = ${emailStatus}`);
    }
    
    if (verificationStatus) {
      filterConditions.push(sql`c.verification_status = ${verificationStatus}`);
    }
    
    if (hasPhone === 'yes') {
      filterConditions.push(sql`c.phone IS NOT NULL AND c.phone != ''`);
    } else if (hasPhone === 'no') {
      filterConditions.push(sql`(c.phone IS NULL OR c.phone = '')`);
    }
    
    if (hasAddress === 'yes') {
      filterConditions.push(sql`c.contact_address1 IS NOT NULL AND c.contact_address1 != '' AND c.contact_city IS NOT NULL AND c.contact_city != ''`);
    } else if (hasAddress === 'no') {
      filterConditions.push(sql`(c.contact_address1 IS NULL OR c.contact_address1 = '' OR c.contact_city IS NULL OR c.contact_city = '')`);
    }
    
    if (hasCav === 'yes') {
      filterConditions.push(sql`((c.cav_id IS NOT NULL AND c.cav_id != '') OR (c.cav_user_id IS NOT NULL AND c.cav_user_id != ''))`);
    } else if (hasCav === 'no') {
      filterConditions.push(sql`((c.cav_id IS NULL OR c.cav_id = '') AND (c.cav_user_id IS NULL OR c.cav_user_id = ''))`);
    }
    
    const filterSQL = filterConditions.length > 0 
      ? sql`AND ${sql.join(filterConditions, sql` AND `)}`
      : sql``;
    
    // Base WHERE conditions (can be overridden by filters)
    let baseConditions = sql`c.campaign_id = ${campaignId}
      AND c.suppressed = FALSE
      AND c.deleted = FALSE
      AND c.in_submission_buffer = FALSE`;
    
    // If no specific eligibility or verification filters, apply defaults
    if (!eligibilityStatus && !verificationStatus) {
      baseConditions = sql`${baseConditions}
        AND c.eligibility_status = 'Eligible'
        AND c.verification_status = 'Pending'`;
    }
    
    const queueItems = await db.execute(sql`
      WITH next_batch AS (
        SELECT c.id
        FROM verification_contacts c
        WHERE ${baseConditions}
          AND (
            SELECT COUNT(*) FROM verification_lead_submissions s
            WHERE s.account_id = c.account_id AND s.campaign_id = ${campaignId}
          )  {
      // Transform snake_case SQL row to camelCase for calculateContactPriority
      const contact = {
        cavId: row.cav_id || null,
        cavUserId: row.cav_user_id || null,
        title: row.title || null,
        phone: row.phone || null,
        mobile: row.mobile || null,
        hqPhone: row.account_main_phone || null,
        aiEnrichedPhone: row.ai_enriched_phone || null,
        contactAddress1: row.contact_address1 || null,
        contactAddress2: row.contact_address2 || null,
        contactCity: row.contact_city || null,
        contactState: row.contact_state || null,
        contactPostal: row.contact_postal || null,
        aiEnrichedAddress: row.ai_enriched_address1 || null, // Singular field used by scorer
        aiEnrichedAddress1: row.ai_enriched_address1 || null,
        aiEnrichedAddress2: row.ai_enriched_address2 || null,
        aiEnrichedCity: row.ai_enriched_city || null,
        aiEnrichedState: row.ai_enriched_state || null,
        aiEnrichedPostal: row.ai_enriched_postal || null,
      };
      
      const priorityInfo = calculateContactPriority(contact, campaign);
      return {
        ...row,
        priority_tier: priorityInfo.tier,
        priority_tier_label: priorityInfo.tier === null ? 'No Phone' : 
                             priorityInfo.tier === 1 ? 'Gold' :
                             priorityInfo.tier === 2 ? 'Silver' :
                             priorityInfo.tier === 3 ? 'Bronze' :
                             priorityInfo.tier === 4 ? 'Basic' : 'Unknown',
      };
    });
    
    res.json({ data: enrichedData, total: queueItems.rowCount || 0 });
  } catch (error) {
    console.error("Error fetching queue:", error);
    res.status(500).json({ error: "Failed to fetch queue" });
  }
});

router.get("/api/verification-campaigns/:campaignId/queue/all-ids", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const contactSearch = req.query.contactSearch as string || "";
    const phoneSearch = req.query.phoneSearch as string || "";
    const companySearch = req.query.companySearch as string || "";
    const sourceType = req.query.sourceType as string || "";
    const country = req.query.country as string || "";
    const eligibilityStatus = req.query.eligibilityStatus as string || "";
    const emailStatus = req.query.emailStatus as string || "";
    const verificationStatus = req.query.verificationStatus as string || "";
    const hasPhone = req.query.hasPhone as string || "";
    const hasAddress = req.query.hasAddress as string || "";
    const hasCav = req.query.hasCav as string || "";
    
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    const cap = campaign.leadCapPerAccount;
    
    // Build dynamic filter conditions
    const filterConditions = [];
    
    if (contactSearch) {
      filterConditions.push(sql`(
        LOWER(c.full_name) LIKE ${`%${contactSearch.toLowerCase()}%`}
        OR LOWER(c.email) LIKE ${`%${contactSearch.toLowerCase()}%`}
        OR LOWER(c.phone) LIKE ${`%${contactSearch.toLowerCase()}%`}
        OR LOWER(c.mobile) LIKE ${`%${contactSearch.toLowerCase()}%`}
      )`);
    }
    
    if (phoneSearch) {
      filterConditions.push(sql`(
        LOWER(c.phone) LIKE ${`%${phoneSearch.toLowerCase()}%`}
        OR LOWER(c.mobile) LIKE ${`%${phoneSearch.toLowerCase()}%`}
      )`);
    }
    
    if (sourceType) {
      filterConditions.push(sql`c.source_type = ${sourceType}`);
    }
    
    if (country) {
      filterConditions.push(sql`LOWER(c.contact_country) LIKE ${`%${country.toLowerCase()}%`}`);
    }
    
    if (eligibilityStatus) {
      filterConditions.push(sql`c.eligibility_status = ${eligibilityStatus}`);
    }
    
    if (emailStatus) {
      filterConditions.push(sql`c.email_status = ${emailStatus}`);
    }
    
    if (verificationStatus) {
      filterConditions.push(sql`c.verification_status = ${verificationStatus}`);
    }
    
    if (hasPhone === 'yes') {
      filterConditions.push(sql`c.phone IS NOT NULL AND c.phone != ''`);
    } else if (hasPhone === 'no') {
      filterConditions.push(sql`(c.phone IS NULL OR c.phone = '')`);
    }
    
    if (hasAddress === 'yes') {
      filterConditions.push(sql`c.contact_address1 IS NOT NULL AND c.contact_address1 != '' AND c.contact_city IS NOT NULL AND c.contact_city != ''`);
    } else if (hasAddress === 'no') {
      filterConditions.push(sql`(c.contact_address1 IS NULL OR c.contact_address1 = '' OR c.contact_city IS NULL OR c.contact_city = '')`);
    }
    
    if (hasCav === 'yes') {
      filterConditions.push(sql`((c.cav_id IS NOT NULL AND c.cav_id != '') OR (c.cav_user_id IS NOT NULL AND c.cav_user_id != ''))`);
    } else if (hasCav === 'no') {
      filterConditions.push(sql`((c.cav_id IS NULL OR c.cav_id = '') AND (c.cav_user_id IS NULL OR c.cav_user_id = ''))`);
    }
    
    const filterSQL = filterConditions.length > 0 
      ? sql`AND ${sql.join(filterConditions, sql` AND `)}`
      : sql``;
    
    // Base WHERE conditions (can be overridden by filters)
    let baseConditions = sql`c.campaign_id = ${campaignId}
      AND c.suppressed = FALSE
      AND c.deleted = FALSE
      AND c.in_submission_buffer = FALSE`;
    
    // If no specific eligibility or verification filters, apply defaults
    if (!eligibilityStatus && !verificationStatus) {
      baseConditions = sql`${baseConditions}
        AND c.eligibility_status = 'Eligible'
        AND c.verification_status = 'Pending'`;
    }
    
    // Enforce per-account cap: Only select up to 'cap' contacts per account
    // This ensures validation respects the lead cap setting
    const result = await db.execute(sql`
      WITH ranked_contacts AS (
        SELECT 
          c.id,
          c.account_id,
          c.source_type,
          c.cav_id,
          c.cav_user_id,
          c.priority_score,
          c.updated_at,
          ROW_NUMBER() OVER (
            PARTITION BY c.account_id 
            ORDER BY 
              CASE 
                WHEN c.source_type = 'Client_Provided' AND (c.cav_id IS NOT NULL OR c.cav_user_id IS NOT NULL) THEN 0
                WHEN c.source_type = 'Client_Provided' THEN 1
                ELSE 2
              END,
              c.priority_score DESC NULLS LAST, 
              c.updated_at ASC
          ) as account_rank,
          (
            SELECT COUNT(*) FROM verification_lead_submissions s
            WHERE s.account_id = c.account_id AND s.campaign_id = ${campaignId}
          ) as submitted_count
        FROM verification_contacts c
        WHERE ${baseConditions}
          ${filterSQL}
          ${companySearch ? sql`AND c.account_id IN (
            SELECT id FROM accounts WHERE LOWER(name) LIKE ${`%${companySearch.toLowerCase()}%`}
          )` : sql``}
      )
      SELECT id
      FROM ranked_contacts
      WHERE account_rank  r.id);
    res.json({ ids, total: ids.length });
  } catch (error) {
    console.error("Error fetching all eligible IDs:", error);
    res.status(500).json({ error: "Failed to fetch eligible contact IDs" });
  }
});

router.delete("/api/verification-contacts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const [deletedContact] = await db
      .update(verificationContacts)
      .set({ 
        deleted: true,
        updatedAt: new Date()
      })
      .where(eq(verificationContacts.id, id))
      .returning();
    
    if (!deletedContact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    
    res.json({ success: true, id: deletedContact.id });
  } catch (error) {
    console.error("Error deleting contact:", error);
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

router.get("/api/verification-contacts/account/:accountId", async (req, res) => {
  try {
    const { accountId } = req.params;
    const campaignId = req.query.campaignId as string;
    const includeSuppressed = req.query.includeSuppressed === 'true';

    if (!campaignId) {
      return res.status(400).json({ error: "campaignId query parameter is required" });
    }

    const conditions = [
      eq(verificationContacts.accountId, accountId),
      eq(verificationContacts.campaignId, campaignId),
      eq(verificationContacts.deleted, false),
    ];

    if (!includeSuppressed) {
      conditions.push(eq(verificationContacts.suppressed, false));
    }

    const contacts = await db
      .select()
      .from(verificationContacts)
      .where(and(...conditions))
      .orderBy(desc(verificationContacts.verificationStatus), desc(verificationContacts.updatedAt))
      .limit(200);

    res.json(contacts);
  } catch (error) {
    console.error("Error fetching associated contacts:", error);
    res.status(500).json({ error: "Failed to fetch associated contacts" });
  }
});

router.get("/api/verification-contacts/:id", async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT 
        c.*,
        a.name as account_name,
        a.domain,
        a.custom_fields as account_custom_fields
      FROM verification_contacts c
      LEFT JOIN accounts a ON a.id = c.account_id
      WHERE c.id = ${req.params.id}
    `);
    
    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: "Contact not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching contact:", error);
    res.status(500).json({ error: "Failed to fetch contact" });
  }
});

router.post("/api/verification-contacts", async (req, res) => {
  try {
    const validatedData = insertVerificationContactSchema.parse(req.body);
    
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, validatedData.campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    const accountName = req.body.accountName;
    const normalizedKeys = computeNormalizedKeys({
      email: validatedData.email,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      contactCountry: validatedData.contactCountry,
      accountName,
    });
    
    const eligibility = evaluateEligibility(
      validatedData.title,
      validatedData.contactCountry,
      campaign
    );
    
    const [contact] = await db
      .insert(verificationContacts)
      .values({
        ...validatedData,
        ...normalizedKeys,
        eligibilityStatus: eligibility.status,
        eligibilityReason: eligibility.reason,
      })
      .returning();
    
    await applySuppressionForContacts(campaign.id, [contact.id]);
    
    const [updatedContact] = await db
      .select()
      .from(verificationContacts)
      .where(eq(verificationContacts.id, contact.id));
    
    res.status(201).json(updatedContact);
  } catch (error) {
    console.error("Error creating contact:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create contact" });
  }
});

router.put("/api/verification-contacts/:id", async (req, res) => {
  try {
    const updateSchema = insertVerificationContactSchema.partial();
    const validatedData = updateSchema.parse(req.body);
    
    const [existingContact] = await db
      .select()
      .from(verificationContacts)
      .where(eq(verificationContacts.id, req.params.id));
    
    if (!existingContact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, existingContact.campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    let updates: any = { ...validatedData, updatedAt: new Date() };
    
    if (validatedData.title !== undefined || validatedData.contactCountry !== undefined) {
      const title = validatedData.title ?? existingContact.title;
      const country = validatedData.contactCountry ?? existingContact.contactCountry;
      
      const eligibility = evaluateEligibility(title, country, campaign);
      updates.eligibilityStatus = eligibility.status;
      updates.eligibilityReason = eligibility.reason;
    }
    
    if (validatedData.email || validatedData.firstName || validatedData.lastName || validatedData.contactCountry) {
      const accountName = req.body.accountName;
      const normalizedKeys = computeNormalizedKeys({
        email: validatedData.email ?? existingContact.email,
        firstName: validatedData.firstName ?? existingContact.firstName,
        lastName: validatedData.lastName ?? existingContact.lastName,
        contactCountry: validatedData.contactCountry ?? existingContact.contactCountry,
        accountName,
      });
      updates = { ...updates, ...normalizedKeys };
    }
    
    const [contact] = await db
      .update(verificationContacts)
      .set(updates)
      .where(eq(verificationContacts.id, req.params.id))
      .returning();
    
    await applySuppressionForContacts(campaign.id, [contact.id]);
    
    const [updatedContact] = await db
      .select()
      .from(verificationContacts)
      .where(eq(verificationContacts.id, req.params.id));
    
    res.json(updatedContact);
  } catch (error) {
    console.error("Error updating contact:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update contact" });
  }
});

router.post("/api/verification-contacts/:id/qa", async (req, res) => {
  try {
    const { action, resolution } = req.body;
    
    let qaStatus = 'Unreviewed';
    if (action === 'flag') qaStatus = 'Flagged';
    else if (resolution) qaStatus = resolution;
    
    const [contact] = await db
      .update(verificationContacts)
      .set({ qaStatus: qaStatus as any, updatedAt: new Date() })
      .where(eq(verificationContacts.id, req.params.id))
      .returning();
    
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    
    res.json({ qaStatus: contact.qaStatus });
  } catch (error) {
    console.error("Error updating QA status:", error);
    res.status(500).json({ error: "Failed to update QA status" });
  }
});

// Removed duplicate /stats endpoint - now handled by verification-campaigns.ts

router.post("/api/verification-contacts/:id/validate-email", async (req, res) => {
  try {
    const { validateAndStoreBusinessEmail } = await import("../services/email-validation");
    
    const [contact] = await db
      .select()
      .from(verificationContacts)
      .where(eq(verificationContacts.id, req.params.id));
    
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    
    // Preconditions: Manual validation only for contacts with email
    if (!contact.email) {
      return res.status(409).json({ 
        error: "Preconditions not met",
        details: { hasEmail: false }
      });
    }
    
    // Use Kickbox 3-layer validator
    const validation = await validateAndStoreBusinessEmail(contact.id, contact.email, {
      skipSmtp: process.env.SKIP_SMTP_VALIDATION === 'true',
    });
    
    res.json({
      emailStatus: validation.status,
      checkedAt: validation.validatedAt,
    });
  } catch (error) {
    console.error("Error validating email:", error);
    res.status(500).json({ error: "Failed to validate email" });
  }
});

router.post("/api/verification-contacts/:id/verify", async (req, res) => {
  try {
    const [contact] = await db
      .update(verificationContacts)
      .set({ 
        verificationStatus: 'Validated' as any, 
        updatedAt: new Date() 
      })
      .where(eq(verificationContacts.id, req.params.id))
      .returning();
    
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    
    res.json({ verificationStatus: contact.verificationStatus });
  } catch (error) {
    console.error("Error verifying contact:", error);
    res.status(500).json({ error: "Failed to verify contact" });
  }
});

router.post("/api/verification-contacts/:id/submit", async (req, res) => {
  try {
    const [contact] = await db
      .select()
      .from(verificationContacts)
      .where(eq(verificationContacts.id, req.params.id));
    
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    
    if (contact.verificationStatus !== 'Validated') {
      return res.status(400).json({ error: "Contact must be validated before submission" });
    }
    
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, contact.campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    const result = await db.transaction(async (tx) => {
      const lockKey = Math.abs(
        parseInt(contact.campaignId.replace(/-/g, '').slice(0, 8), 16) ^
        parseInt((contact.accountId || '00000000').replace(/-/g, '').slice(0, 8), 16)
      ) % 2147483647;
      
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);
      
      const existingSubmission = await tx.execute(sql`
        SELECT id FROM verification_lead_submissions
        WHERE contact_id = ${contact.id}
        LIMIT 1
      `);
      
      if (existingSubmission.rowCount && existingSubmission.rowCount > 0) {
        return { 
          success: true, 
          submissionId: existingSubmission.rows[0].id,
          alreadySubmitted: true 
        };
      }
      
      const submissionCount = await tx.execute(sql`
        SELECT COUNT(*) as count
        FROM verification_lead_submissions
        WHERE account_id = ${contact.accountId} AND campaign_id = ${contact.campaignId}
      `);
      
      const currentCount = Number(submissionCount.rows[0]?.count || 0);
      const cap = campaign.leadCapPerAccount || 10;
      if (currentCount >= cap) {
        // Fetch account name for better error message
        const accountInfo = await tx.execute(sql`
          SELECT name, domain FROM accounts WHERE id = ${contact.accountId}
        `);
        const accountName = accountInfo.rows[0]?.name || contact.accountId;
        throw new Error(JSON.stringify({ 
          type: "cap_reached", 
          accountName, 
          currentCount, 
          cap 
        }));
      }
      
      const [submission] = await tx
        .insert(verificationLeadSubmissions)
        .values({
          campaignId: contact.campaignId,
          contactId: contact.id,
          accountId: contact.accountId,
        })
        .returning();
      
      await tx
        .update(verificationContacts)
        .set({ inSubmissionBuffer: true, updatedAt: new Date() })
        .where(eq(verificationContacts.id, contact.id));
      
      return { success: true, submissionId: submission.id, alreadySubmitted: false };
    });
    
    res.json(result);
  } catch (error: any) {
    console.error("Error submitting contact:", error);
    
    // Handle cap reached error with detailed information
    try {
      const errorData = JSON.parse(error.message);
      if (errorData.type === "cap_reached") {
        return res.status(400).json({ 
          error: "Account cap reached",
          details: {
            accountName: errorData.accountName,
            currentCount: errorData.currentCount,
            cap: errorData.cap,
            message: `Account "${errorData.accountName}" has reached its submission limit (${errorData.currentCount}/${errorData.cap})`
          }
        });
      }
    } catch (parseError) {
      // Not a JSON error, check for old-style error
      if (error.message === "Account cap reached") {
        return res.status(400).json({ error: "Account cap reached" });
      }
    }
    
    res.status(500).json({ error: "Failed to submit contact" });
  }
});

router.post("/api/verification-campaigns/:campaignId/flush", async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const flushedContacts = await db
      .update(verificationContacts)
      .set({ inSubmissionBuffer: false, updatedAt: new Date() })
      .where(
        and(
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.inSubmissionBuffer, true)
        )
      )
      .returning();
    
    res.json({ 
      success: true, 
      flushedCount: flushedContacts.length 
    });
  } catch (error) {
    console.error("Error flushing buffer:", error);
    res.status(500).json({ error: "Failed to flush buffer" });
  }
});

router.post("/api/verification-campaigns/:campaignId/contacts/bulk-delete", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const bulkDeleteSchema = z.object({
      contactIds: z.array(z.string().uuid()).nonempty(),
      reason: z.string().optional(),
    });
    
    const { contactIds, reason } = bulkDeleteSchema.parse(req.body);
    
    console.log('[BULK DELETE] Request received:', { 
      campaignId, 
      contactCount: contactIds.length,
      user: req.user,
      userRole: req.user?.role,
      userRoles: req.user?.roles
    });
    
    const isAdmin = req.user?.role === 'admin' || req.user?.roles?.includes('admin');
    const allowClientProvidedDelete = process.env.ALLOW_CLIENT_PROVIDED_DELETE === 'true' || isAdmin;
    
    console.log('[BULK DELETE] Permission check:', { isAdmin, allowClientProvidedDelete });
    
    // Filter out contacts that are already submitted
    const submittedContactIds = contactIds.length > 0
      ? await db
          .select({ contactId: verificationLeadSubmissions.contactId })
          .from(verificationLeadSubmissions)
          .where(
            and(
              eq(verificationLeadSubmissions.campaignId, campaignId),
              inArray(verificationLeadSubmissions.contactId, contactIds)
            )
          )
          .then(rows => (rows || []).map(r => r.contactId))
      : [];
    
    const eligibleContactIds = contactIds.filter(id => !submittedContactIds.includes(id));
    
    if (eligibleContactIds.length === 0) {
      return res.json({
        success: true,
        deletedCount: 0,
        deletedIds: [],
        skippedCount: contactIds.length,
        message: "All contacts have already been submitted"
      });
    }
    
    // Use Drizzle ORM for safe, parameterized updates
    const conditions = [
      inArray(verificationContacts.id, eligibleContactIds),
      eq(verificationContacts.campaignId, campaignId),
      eq(verificationContacts.deleted, false),
      eq(verificationContacts.inSubmissionBuffer, false),
    ];
    
    // Only filter out Client_Provided if not allowed
    if (!allowClientProvidedDelete) {
      conditions.push(sql`${verificationContacts.sourceType} <> 'Client_Provided'`);
    }
    
    const result = await db
      .update(verificationContacts)
      .set({ deleted: true, updatedAt: new Date() })
      .where(and(...conditions))
      .returning({ id: verificationContacts.id });
    
    const deletedIds = (result || []).map(r => r.id);
    
    console.log('[BULK DELETE] Result:', { 
      requested: contactIds.length, 
      deleted: deletedIds.length, 
      skipped: contactIds.length - deletedIds.length 
    });
    
    if (deletedIds.length > 0 && req.user?.userId) {
      await db.insert(verificationAuditLog).values({
        actorId: req.user.userId,
        entityType: 'contact',
        action: 'bulk_delete',
        entityId: campaignId,
        before: null,
        after: { contactIds: deletedIds, reason, requestedIds: contactIds },
      });
    }
    
    res.json({ 
      success: true, 
      deletedCount: deletedIds.length,
      deletedIds,
      skippedCount: contactIds.length - deletedIds.length,
    });
  } catch (error) {
    console.error("Error bulk deleting contacts:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to bulk delete contacts" });
  }
});

// Bulk Email Validation endpoint
router.post("/api/verification-campaigns/:campaignId/contacts/bulk-validate-email", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const bulkValidateSchema = z.object({
      contactIds: z.array(z.string().uuid()).nonempty(),
    });
    
    const { contactIds } = bulkValidateSchema.parse(req.body);
    
    console.log('[BULK EMAIL VALIDATION] Request received:', { 
      campaignId, 
      contactCount: contactIds.length 
    });
    
    let validatedCount = 0;
    const results = [];
    
    for (const contactId of contactIds) {
      try {
        const contact = await db.query.verificationContacts.findFirst({
          where: and(
            eq(verificationContacts.id, contactId),
            eq(verificationContacts.campaignId, campaignId)
          ),
        });
        
        if (!contact || !contact.email) {
          console.log(`[BULK EMAIL VALIDATION] Skipping contact ${contactId} - no email`);
          continue;
        }
        
        // Skip if already validated (has a status other than 'unknown')
        if (contact.emailStatus && contact.emailStatus !== 'unknown') {
          console.log(`[BULK EMAIL VALIDATION] Skipping contact ${contactId} - already validated (${contact.emailStatus})`);
          continue;
        }
        
        // Use Kickbox 3-layer email validator
        const { validateAndStoreBusinessEmail } = await import('../services/email-validation');
        const validation = await validateAndStoreBusinessEmail(contactId, contact.email, {
          skipSmtp: process.env.SKIP_SMTP_VALIDATION === 'true',
        });
        
        validatedCount++;
        results.push({ contactId, email: contact.email, status: validation.status });
        
        console.log(`[BULK EMAIL VALIDATION] Validated ${contact.email} - Status: ${validation.status}`);
      } catch (error) {
        console.error(`[BULK EMAIL VALIDATION] Error validating contact ${contactId}:`, error);
      }
    }
    
    res.json({ 
      success: true, 
      validatedCount,
      results,
    });
  } catch (error) {
    console.error("Error bulk validating emails:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to bulk validate emails" });
  }
});

// Bulk Mark as Validated endpoint
router.post("/api/verification-campaigns/:campaignId/contacts/bulk-mark-validated", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const bulkMarkSchema = z.object({
      contactIds: z.array(z.string().uuid()).nonempty(),
    });
    
    const { contactIds } = bulkMarkSchema.parse(req.body);
    
    console.log('[BULK MARK VALIDATED] Request received:', { 
      campaignId, 
      contactCount: contactIds.length 
    });
    
    const result = await db
      .update(verificationContacts)
      .set({ 
        verificationStatus: 'Validated',
        updatedAt: new Date() 
      })
      .where(
        and(
          inArray(verificationContacts.id, contactIds),
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.deleted, false)
        )
      )
      .returning({ id: verificationContacts.id });
    
    const updatedIds = result.map(r => r.id);
    
    console.log('[BULK MARK VALIDATED] Updated:', { 
      updated: updatedIds.length, 
      skipped: contactIds.length - updatedIds.length 
    });
    
    if (updatedIds.length > 0 && req.user?.userId) {
      await db.insert(verificationAuditLog).values({
        actorId: req.user.userId,
        entityType: 'contact',
        action: 'bulk_mark_validated',
        entityId: campaignId,
        before: null,
        after: { contactIds: updatedIds, requestedIds: contactIds },
      });
    }
    
    res.json({ 
      success: true, 
      updatedCount: updatedIds.length,
      updatedIds,
      skippedCount: contactIds.length - updatedIds.length,
    });
  } catch (error) {
    console.error("Error bulk marking as validated:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to bulk mark as validated" });
  }
});

// Run Email Validation on Validated Contacts
// SMART VALIDATION: Only validates eligible contacts, skips already-validated emails
router.post("/api/verification-campaigns/:campaignId/contacts/run-email-validation", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    console.log('[RUN EMAIL VALIDATION] Starting smart validation for campaign:', campaignId);
    
    // FILTER 1: Find eligible contacts without email_status set
    const contactsToValidate = await db
      .select({
        id: verificationContacts.id,
        email: verificationContacts.email,
        emailLower: verificationContacts.emailLower,
      })
      .from(verificationContacts)
      .where(
        and(
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.deleted, false),
          eq(verificationContacts.eligibilityStatus, 'Eligible'), // Only eligible contacts
          sql`${verificationContacts.email} IS NOT NULL`,
          sql`(${verificationContacts.emailStatus} IS NULL OR ${verificationContacts.emailStatus} = 'unknown')`
        )
      )
      .limit(500); // Process in batches to avoid timeout
    
    // FILTER 2: Skip emails already validated in ANY campaign
    const emailsToCheck = contactsToValidate
      .map(c => c.emailLower || c.email?.toLowerCase())
      .filter((email): email is string => Boolean(email));
    
    const alreadyValidated = await db
      .select({ emailLower: verificationEmailValidations.emailLower })
      .from(verificationEmailValidations)
      .where(inArray(verificationEmailValidations.emailLower, emailsToCheck))
      .groupBy(verificationEmailValidations.emailLower);
    
    const validatedSet = new Set(alreadyValidated.map(v => v.emailLower));
    
    const contactsNeedingValidation = contactsToValidate.filter(c => {
      const emailKey = c.emailLower || c.email?.toLowerCase();
      return emailKey && !validatedSet.has(emailKey);
    });
    
    const skippedCount = contactsToValidate.length - contactsNeedingValidation.length;
    console.log(`[RUN EMAIL VALIDATION] Filtered to ${contactsNeedingValidation.length} contacts (${skippedCount} already validated)`);
    
    const contactsToProcess = contactsNeedingValidation;
    
    if (contactsToProcess.length === 0) {
      return res.json({ 
        success: true, 
        message: skippedCount > 0 
          ? 'All eligible contacts already validated in other campaigns' 
          : 'No eligible contacts need email validation',
        validated: 0,
        totalChecked: contactsToValidate.length,
        skipped: skippedCount,
      });
    }
    
    console.log(`[RUN EMAIL VALIDATION] Processing ${contactsToProcess.length} contacts`);
    
    // Import validation function
    const { validateAndStoreBusinessEmail } = await import('../services/email-validation');
    
    let validated = 0;
    let failed = 0;
    
    // Group by domain for rate limiting
    const byDomain = new Map();
    for (const contact of contactsToProcess) {
      if (!contact.email) continue;
      const domain = contact.email.split('@')[1]?.toLowerCase();
      if (!domain) continue;
      if (!byDomain.has(domain)) {
        byDomain.set(domain, []);
      }
      byDomain.get(domain)!.push(contact);
    }
    
    // Process each domain sequentially (rate limiting)
    for (const [domain, domainContacts] of Array.from(byDomain.entries())) {
      console.log(`[RUN EMAIL VALIDATION] Processing ${domainContacts.length} contacts for domain: ${domain}`);
      
      for (const contact of domainContacts) {
        if (!contact.email) continue;
        
        try {
          // Validate email using Kickbox 3-layer system
          const validation = await validateAndStoreBusinessEmail(contact.id, contact.email, {
            skipSmtp: process.env.SKIP_SMTP_VALIDATION === 'true',
          });
          
          // Update contact with email_status
          await db
            .update(verificationContacts)
            .set({
              emailStatus: validation.status,
              updatedAt: new Date(),
            })
            .where(eq(verificationContacts.id, contact.id));
          
          validated++;
          console.log(`[RUN EMAIL VALIDATION] Validated ${contact.email}: ${validation.status}`);
          
        } catch (error) {
          failed++;
          console.error(`[RUN EMAIL VALIDATION] Error validating ${contact.email}:`, error);
        }
      }
      
      // Rate limiting: small delay between domains
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`[RUN EMAIL VALIDATION] Complete: ${validated} validated, ${failed} failed`);
    
    res.json({ 
      success: true, 
      validated,
      failed,
      total: contactsToProcess.length,
      totalChecked: contactsToValidate.length,
      skippedAlreadyValidated: skippedCount,
    });
  } catch (error) {
    console.error("[RUN EMAIL VALIDATION] Error:", error);
    res.status(500).json({ error: "Failed to run email validation" });
  }
});

// Bulk Field Update endpoint
router.post("/api/verification-campaigns/:campaignId/contacts/bulk-field-update", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const bulkFieldUpdateSchema = z.object({
      contactIds: z.array(z.string().uuid()).nonempty(),
      fieldName: z.string().min(1),
      fieldValue: z.string(), // Only allow strings for safety
    });
    
    const { contactIds, fieldName, fieldValue } = bulkFieldUpdateSchema.parse(req.body);
    
    console.log('[BULK FIELD UPDATE] Request received:', { 
      campaignId, 
      contactCount: contactIds.length,
      fieldName,
      fieldValue
    });
    
    // Strict allowlist: maps frontend field names to Drizzle camelCase property names
    // Only these fields can be bulk updated
    const FIELD_ALLOWLIST: Record = {
      'contactCountry': 'contactCountry',
      'contactCity': 'contactCity',
      'contactState': 'contactState',
      'contactPostal': 'contactPostal',
      'contactAddress1': 'contactAddress1',
      'contactAddress2': 'contactAddress2',
      'contactAddress3': 'contactAddress3',
      'hqCountry': 'hqCountry',
      'hqCity': 'hqCity',
      'hqState': 'hqState',
      'hqPostal': 'hqPostal',
      'hqAddress1': 'hqAddress1',
      'hqAddress2': 'hqAddress2',
      'hqAddress3': 'hqAddress3',
      'title': 'title',
      'phone': 'phone',
      'mobile': 'mobile',
      'linkedinUrl': 'linkedinUrl',
      'formerPosition': 'formerPosition',
      'timeInCurrentPosition': 'timeInCurrentPosition',
      'timeInCurrentCompany': 'timeInCurrentCompany',
    };
    
    // Validate field name against allowlist
    const drizzlePropertyName = FIELD_ALLOWLIST[fieldName];
    if (!drizzlePropertyName) {
      return res.status(400).json({ 
        error: "Invalid field name", 
        allowedFields: Object.keys(FIELD_ALLOWLIST)
      });
    }
    
    // Sanitize and validate field value
    const sanitizedValue = fieldValue.trim();
    if (sanitizedValue.length > 500) {
      return res.status(400).json({ 
        error: "Field value too long (max 500 characters)" 
      });
    }
    
    // Build update object using Drizzle property name (type-safe)
    const updateData: any = {
      [drizzlePropertyName]: sanitizedValue || null, // Empty string becomes null
      updatedAt: new Date()
    };
    
    const result = await db
      .update(verificationContacts)
      .set(updateData)
      .where(
        and(
          inArray(verificationContacts.id, contactIds),
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.deleted, false)
        )
      )
      .returning({ id: verificationContacts.id });
    
    const updatedIds = result.map(r => r.id);
    
    console.log('[BULK FIELD UPDATE] Updated:', { 
      updated: updatedIds.length, 
      skipped: contactIds.length - updatedIds.length 
    });
    
    if (updatedIds.length > 0 && req.user?.userId) {
      await db.insert(verificationAuditLog).values({
        actorId: req.user.userId,
        entityType: 'contact',
        action: 'bulk_field_update',
        entityId: campaignId,
        before: null,
        after: { 
          fieldName,
          fieldValue,
          contactIds: updatedIds, 
          requestedIds: contactIds 
        },
      });
    }
    
    res.json({ 
      success: true, 
      updatedCount: updatedIds.length,
      updatedIds,
      skippedCount: contactIds.length - updatedIds.length,
    });
  } catch (error) {
    console.error("Error bulk field update:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to bulk update field" });
  }
});

// Bulk Enrichment endpoint
router.post("/api/verification-campaigns/:campaignId/contacts/bulk-enrich", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const bulkEnrichSchema = z.object({
      contactIds: z.array(z.string().uuid()).nonempty(),
    });
    
    const { contactIds } = bulkEnrichSchema.parse(req.body);
    
    console.log('[BULK ENRICHMENT] Request received:', { 
      campaignId, 
      contactCount: contactIds.length 
    });
    
    // Track detailed results
    let addressEnriched = 0;
    let phoneEnriched = 0;
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    const skippedReasons: Record = {
      noAccount: 0,
      noOkEmail: 0,
      alreadyEnriched: 0,
    };
    
    console.log(`[BULK ENRICHMENT] Processing ${contactIds.length} contacts with OK emails`);
    
    for (let i = 0; i  c.emailLower || c.email?.toLowerCase())
          .filter((email): email is string => Boolean(email && email.trim()))
          .map(email => email.trim())
      ));
      
      if (emailsToVerify.length === 0) {
        console.log(`[EMAIL VALIDATION JOB] Job ${jobId}: Batch ${batchIndex + 1} has no valid emails to verify, skipping`);
        
        // Update progress
        await db
          .update(verificationEmailValidationJobs)
          .set({
            currentBatch: batchIndex + 1,
            processedContacts: batchEnd,
            updatedAt: new Date(),
          })
          .where(eq(verificationEmailValidationJobs.id, jobId));
        
        continue;
      }
      
      console.log(`[EMAIL VALIDATION JOB] Job ${jobId}: Batch ${batchIndex + 1}: Processing ${emailsToVerify.length} unique emails for ${contacts.length} contacts`);
      
      // CACHE CHECK: Query recent validations (60-day window) to avoid redundant API calls
      // Chunk emails into smaller batches to avoid SQL ANY/ALL array issues
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      
      const cacheMap = new Map();
      const CACHE_QUERY_CHUNK_SIZE = 100; // Query cache in chunks of 100 emails at a time
      
      for (let i = 0; i  ${sixtyDaysAgo}`
            )
          );
        
        // Add to cache map
        for (const row of cachedValidationsChunk) {
          cacheMap.set(row.email_lower, row);
        }
      }
      
      // Split emails into cached vs uncached
      const emailsNeedingApi: string[] = [];
      const verificationResults = new Map();
      
      for (const email of emailsToVerify) {
        const cached = cacheMap.get(email);
        if (cached) {
          // Use cached result with full Kickbox telemetry
          verificationResults.set(email, {
            email: email,
            status: cached.status as any,
            details: cached.raw_json?.details || {
              syntax: true,
              domain: true,
              smtp: cached.status === 'ok',
              catch_all: cached.kickbox_accept_all ?? cached.status === 'accept_all',
              disposable: cached.kickbox_disposable ?? cached.status === 'disposable',
              free: cached.kickbox_free ?? false,
              role: cached.kickbox_role ?? false,
            },
            reason: cached.kickbox_reason || cached.raw_json?.reason || cached.status,
            provider: cached.provider || 'kickbox',
            rawResponse: cached.raw_json || {},
            checkedAt: new Date(cached.checked_at),
            // Include Kickbox fields from cache
            kickboxResult: cached.kickbox_result ?? undefined,
            kickboxReason: cached.kickbox_reason ?? undefined,
            kickboxScore: cached.kickbox_score ? parseFloat(cached.kickbox_score) : undefined,
            kickboxAcceptAll: cached.kickbox_accept_all ?? undefined,
            kickboxDisposable: cached.kickbox_disposable ?? undefined,
            kickboxFree: cached.kickbox_free ?? undefined,
            kickboxRole: cached.kickbox_role ?? undefined,
            riskLevel: cached.risk_level ?? undefined,
            isBusinessEmail: cached.is_business_email ?? undefined,
            emailEligible: cached.email_eligible ?? undefined,
            eligibilityReason: cached.eligibility_reason ?? undefined,
            deepVerifiedAt: cached.deep_verified_at ?? undefined,
          });
        } else {
          emailsNeedingApi.push(email);
        }
      }
      
      const cachedCount = verificationResults.size;
      const apiCallCount = emailsNeedingApi.length;
      
      console.log(`[EMAIL VALIDATION JOB] Job ${jobId}: Batch ${batchIndex + 1}: Cache hits: ${cachedCount}, API calls needed: ${apiCallCount}`);
      
      // Only call API for uncached emails
      if (emailsNeedingApi.length > 0) {
        console.log(`[EMAIL VALIDATION JOB] Job ${jobId}: Batch ${batchIndex + 1}: Calling API for ${emailsNeedingApi.length} emails`);
        
        // Track circuit breaker state
        let circuitBreakerTriggered = false;
        
        const apiResults = await verifyEmailsBulk(emailsNeedingApi, {
          delayMs: 200, // 5 requests per second
          onProgress: (completed, total, currentEmail) => {
            if (completed % 10 === 0 || completed === total) {
              console.log(`[EMAIL VALIDATION JOB] Job ${jobId}: Batch ${batchIndex + 1} API Progress: ${completed}/${total} (${currentEmail})`);
            }
          },
          onCircuitOpen: async () => {
            // Circuit breaker triggered - log warning but continue with backoff
            circuitBreakerTriggered = true;
            console.warn(`[EMAIL VALIDATION JOB] Job ${jobId}: Circuit breaker triggered in batch ${batchIndex + 1} - will retry with backoff`);
            
            // Update job with checkpoint (keep processing status but log circuit breaker event)
            await db
              .update(verificationEmailValidationJobs)
              .set({
                errorMessage: `Circuit breaker activated at batch ${batchIndex + 1} - retrying with backoff`,
                currentBatch: batchIndex,
                processedContacts: batchStart,
                updatedAt: new Date(),
              })
              .where(eq(verificationEmailValidationJobs.id, jobId));
          },
        }).catch(async (error) => {
          // Handle circuit breaker errors
          if (error.message?.includes('circuit breaker')) {
            console.error(`[EMAIL VALIDATION JOB] Job ${jobId}: Circuit breaker error - job will need manual restart`);
            
            await db
              .update(verificationEmailValidationJobs)
              .set({
                status: 'failed',
                errorMessage: `Failed due to database pool exhaustion at batch ${batchIndex + 1}. Pool will recover automatically. Please restart this job manually.`,
                currentBatch: batchIndex,
                processedContacts: batchStart,
                finishedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(verificationEmailValidationJobs.id, jobId));
            
            throw error;
          }
          throw error;
        });
        
        // Merge API results with cached results
        for (const [email, result] of Array.from(apiResults.entries())) {
          verificationResults.set(email, result);
        }
      } else {
        console.log(`[EMAIL VALIDATION JOB] Job ${jobId}: Batch ${batchIndex + 1}: All emails found in cache, skipping API calls (saved ${cachedCount} API credits)`);
      }
      
      // Update contacts and cache validation results for this batch
      let batchSuccessCount = 0;
      let batchFailureCount = 0;
      
      for (const contact of contacts) {
        // Get email key for this contact
        const emailRaw = contact.emailLower || contact.email?.toLowerCase();
        if (!emailRaw || !emailRaw.trim()) {
          console.warn(`[EMAIL VALIDATION JOB] Job ${jobId}: Contact ${contact.id} has no valid email, skipping`);
          batchFailureCount++;
          continue;
        }
        
        const emailKey = emailRaw.trim();
        const result = verificationResults.get(emailKey);
        
        if (!result) {
          console.warn(`[EMAIL VALIDATION JOB] Job ${jobId}: No verification result for ${emailKey} (contact ${contact.id})`);
          batchFailureCount++;
          continue;
        }
        
        try {
          // Update contact email status with Kickbox telemetry
          // Using ?? null to preserve falsey values like false and 0
          await db
            .update(verificationContacts)
            .set({
              emailStatus: result.status as any,
              kickboxResult: result.kickboxResult ?? null,
              kickboxReason: result.kickboxReason ?? null,
              kickboxScore: result.kickboxScore != null ? String(result.kickboxScore) : null,
              kickboxAcceptAll: result.kickboxAcceptAll ?? null,
              kickboxDisposable: result.kickboxDisposable ?? null,
              kickboxFree: result.kickboxFree ?? null,
              kickboxRole: result.kickboxRole ?? null,
              isBusinessEmail: result.isBusinessEmail ?? null,
              emailRiskLevel: (result.riskLevel as 'low' | 'medium' | 'high' | 'unknown') ?? null,
              emailEligible: result.emailEligible ?? null,
              emailEligibilityReason: result.eligibilityReason ?? null,
              updatedAt: new Date(),
            })
            .where(eq(verificationContacts.id, contact.id));
          
          // Cache the validation result with Kickbox fields
          // Using ?? null to preserve falsey values like false and 0
          await db
            .insert(verificationEmailValidations)
            .values({
              contactId: contact.id,
              emailLower: emailKey,
              provider: result.provider,
              status: result.status as any,
              rawJson: result.rawResponse ?? {},
              checkedAt: result.checkedAt,
              kickboxResult: result.kickboxResult ?? null,
              kickboxReason: result.kickboxReason ?? null,
              kickboxScore: result.kickboxScore != null ? String(result.kickboxScore) : null,
              kickboxAcceptAll: result.kickboxAcceptAll ?? null,
              kickboxDisposable: result.kickboxDisposable ?? null,
              kickboxFree: result.kickboxFree ?? null,
              kickboxRole: result.kickboxRole ?? null,
              riskLevel: (result.riskLevel as 'low' | 'medium' | 'high' | 'unknown') ?? null,
              isBusinessEmail: result.isBusinessEmail ?? null,
              emailEligible: result.emailEligible ?? null,
              eligibilityReason: result.eligibilityReason ?? null,
              deepVerifiedAt: result.deepVerifiedAt ?? null,
            })
            .onConflictDoNothing();
          
          // Track status counts ONLY after successful update
          const statusKey = result.status as keyof typeof totalStatusCounts;
          if (statusKey in totalStatusCounts) {
            totalStatusCounts[statusKey]++;
          } else {
            console.warn(`[EMAIL VALIDATION JOB] Job ${jobId}: Unknown status '${result.status}' for ${emailKey}, counting as unknown`);
            totalStatusCounts.unknown++;
          }
          
          batchSuccessCount++;
        } catch (error) {
          console.error(`[EMAIL VALIDATION JOB] Job ${jobId}: Error updating contact ${contact.id} (${emailKey}):`, error);
          batchFailureCount++;
        }
      }
      
      totalSuccessCount += batchSuccessCount;
      totalFailureCount += batchFailureCount;
      
      console.log(`[EMAIL VALIDATION JOB] Job ${jobId}: Batch ${batchIndex + 1} Complete: ${batchSuccessCount} success, ${batchFailureCount} failures`);
      
      // Update job progress after EACH batch
      await db
        .update(verificationEmailValidationJobs)
        .set({
          currentBatch: batchIndex + 1,
          processedContacts: batchEnd,
          successCount: totalSuccessCount,
          failureCount: totalFailureCount,
          statusCounts: totalStatusCounts,
          updatedAt: new Date(),
        })
        .where(eq(verificationEmailValidationJobs.id, jobId));
      
      console.log(`[EMAIL VALIDATION JOB] Job ${jobId}: Updated progress - Batch ${batchIndex + 1}/${totalBatches}, Processed ${batchEnd}/${allContactIds.length}`);
    }
    
    // Mark job as completed
    await db
      .update(verificationEmailValidationJobs)
      .set({
        status: 'completed',
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(verificationEmailValidationJobs.id, jobId));
    
    console.log(`[EMAIL VALIDATION JOB] Job ${jobId}: COMPLETED - ${totalSuccessCount} success, ${totalFailureCount} failures`);
    console.log(`[EMAIL VALIDATION JOB] Job ${jobId}: Status breakdown: Valid=${totalStatusCounts.valid}, Acceptable=${totalStatusCounts.acceptable}, Invalid=${totalStatusCounts.invalid}, Unknown=${totalStatusCounts.unknown}`);
    
  } catch (error) {
    console.error(`[EMAIL VALIDATION JOB] Job ${jobId}: FATAL ERROR:`, error);
    
    // Mark job as failed
    await db
      .update(verificationEmailValidationJobs)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(verificationEmailValidationJobs.id, jobId));
  }
}

// Bulk Email Verification using Email List Verify - Now uses job persistence
// SMART VALIDATION: Only validates eligible contacts, skips already-validated emails across ALL campaigns
// FORCE REVALIDATION: Set forceRevalidate=true to clear cache and re-validate all contacts
router.post("/api/verification-campaigns/:campaignId/contacts/bulk-verify-emails", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = (req.user as any)?.id;
    const { contactIds, forceRevalidate } = z.object({
      contactIds: z.array(z.string()).min(1),
      forceRevalidate: z.boolean().optional().default(false),
    }).parse(req.body);
    
    console.log(`[BULK EMAIL VERIFY] Received ${contactIds.length} contacts, filtering for eligible contacts...`);
    
    // FILTER 1: Only validate eligible contacts (skip Out_of_Scope, etc.)
    const eligibleContacts = await db
      .select({
        id: verificationContacts.id,
        email: verificationContacts.email,
        emailLower: verificationContacts.emailLower,
        eligibilityStatus: verificationContacts.eligibilityStatus,
      })
      .from(verificationContacts)
      .where(
        and(
          eq(verificationContacts.campaignId, campaignId),
          inArray(verificationContacts.id, contactIds),
          eq(verificationContacts.eligibilityStatus, 'Eligible'),
          sql`${verificationContacts.email} IS NOT NULL AND ${verificationContacts.email} != ''`
        )
      );
    
    console.log(`[BULK EMAIL VERIFY] Found ${eligibleContacts.length} eligible contacts (filtered from ${contactIds.length}, forceRevalidate: ${forceRevalidate})`);
    
    if (eligibleContacts.length === 0) {
      return res.json({
        message: "No eligible contacts to validate",
        totalEligible: 0,
        totalSkipped: contactIds.length,
      });
    }
    
    let contactIdsNeedingValidation: string[];
    let skippedCount = 0;
    
    if (forceRevalidate) {
      // FORCE REVALIDATION: Clear cache for these contacts and validate ALL
      console.log(`[BULK EMAIL VERIFY] Force revalidation enabled, clearing cache for ${eligibleContacts.length} contacts`);
      
      const eligibleContactIds = eligibleContacts.map(c => c.id);
      
      // Delete existing validation records for these contacts
      await db
        .delete(verificationEmailValidations)
        .where(inArray(verificationEmailValidations.contactId, eligibleContactIds));
      
      // Reset email status to trigger fresh validation
      await db
        .update(verificationContacts)
        .set({
          emailStatus: null,
          updatedAt: new Date(),
        })
        .where(inArray(verificationContacts.id, eligibleContactIds));
      
      contactIdsNeedingValidation = eligibleContactIds;
      console.log(`[BULK EMAIL VERIFY] Cache cleared, all ${contactIdsNeedingValidation.length} contacts marked for revalidation`);
      
    } else {
      // SMART VALIDATION: Skip emails already validated in ANY campaign (cross-campaign deduplication)
      const emailsToCheck = eligibleContacts
        .map(c => c.emailLower || c.email?.toLowerCase())
        .filter((email): email is string => Boolean(email));
      
      const alreadyValidatedEmails = await db
        .select({ emailLower: verificationEmailValidations.emailLower })
        .from(verificationEmailValidations)
        .where(inArray(verificationEmailValidations.emailLower, emailsToCheck))
        .groupBy(verificationEmailValidations.emailLower);
      
      const validatedEmailSet = new Set(alreadyValidatedEmails.map(v => v.emailLower));
      
      contactIdsNeedingValidation = eligibleContacts
        .filter(c => {
          const emailKey = c.emailLower || c.email?.toLowerCase();
          return emailKey && !validatedEmailSet.has(emailKey);
        })
        .map(c => c.id);
      
      skippedCount = eligibleContacts.length - contactIdsNeedingValidation.length;
      
      console.log(`[BULK EMAIL VERIFY] Cross-campaign check: ${contactIdsNeedingValidation.length} need validation, ${skippedCount} already validated elsewhere`);
      
      if (contactIdsNeedingValidation.length === 0) {
        return res.json({
          message: "All eligible contacts already validated in other campaigns",
          totalEligible: eligibleContacts.length,
          totalSkipped: eligibleContacts.length,
        });
      }
    }
    
    // Calculate total batches
    const BATCH_SIZE = 500;
    const totalBatches = Math.ceil(contactIdsNeedingValidation.length / BATCH_SIZE);
    
    // Create job record BEFORE starting background processing
    const [job] = await db
      .insert(verificationEmailValidationJobs)
      .values({
        campaignId,
        status: 'processing',
        totalContacts: contactIdsNeedingValidation.length,
        totalBatches,
        contactIds: contactIdsNeedingValidation,
        createdBy: userId,
        startedAt: new Date(),
      })
      .returning();
    
    console.log(`[BULK EMAIL VERIFY] Job ${job.id} created, starting background processing`);
    
    // Start background processing using setImmediate (more reliable than Promise)
    // setImmediate ensures the function executes in the next event loop tick
    setImmediate(async () => {
      try {
        console.log(`[BULK EMAIL VERIFY] setImmediate triggered for job ${job.id}`);
        await processEmailValidationJob(job.id);
      } catch (error) {
        console.error(`[BULK EMAIL VERIFY] Background processing failed for job ${job.id}:`, error);
        // Update job status to failed
        await db.update(verificationEmailValidationJobs)
          .set({
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(verificationEmailValidationJobs.id, job.id))
          .catch(err => console.error(`[BULK EMAIL VERIFY] Failed to update job status:`, err));
      }
    });
    
    // Return immediately with job ID and smart filtering stats
    res.json({
      jobId: job.id,
      message: forceRevalidate ? "Email revalidation started (cache cleared)" : "Email validation started",
      totalContacts: contactIdsNeedingValidation.length,
      totalBatches,
      totalRequested: contactIds.length,
      totalEligible: eligibleContacts.length,
      totalSkipped: contactIds.length - contactIdsNeedingValidation.length,
      forceRevalidate,
      skippedReasons: {
        notEligible: contactIds.length - eligibleContacts.length,
        alreadyValidated: forceRevalidate ? 0 : skippedCount,
      },
    });
    
  } catch (error) {
    console.error("[BULK EMAIL VERIFY] Error creating job:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to start email validation", message: error instanceof Error ? error.message : String(error) });
  }
});

// Start email validation for eligible contacts with optional limit
// This is a convenient endpoint that doesn't require passing contact IDs
router.post("/api/verification-campaigns/:campaignId/start-email-validation", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = (req.user as any)?.id;
    const { limit = 2500, reservedOnly = true } = z.object({
      limit: z.number().min(1).max(10000).optional().default(2500),
      reservedOnly: z.boolean().optional().default(true),
    }).parse(req.body);
    
    console.log(`[START EMAIL VALIDATION] Campaign ${campaignId}, limit: ${limit}, reservedOnly: ${reservedOnly}`);
    
    // Get eligible contacts that need validation
    const eligibleContacts = await db
      .select({
        id: verificationContacts.id,
        email: verificationContacts.email,
        emailLower: verificationContacts.emailLower,
      })
      .from(verificationContacts)
      .where(
        and(
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.eligibilityStatus, 'Eligible'),
          eq(verificationContacts.deleted, false),
          reservedOnly ? eq(verificationContacts.reservedSlot, true) : sql`TRUE`,
          sql`${verificationContacts.email} IS NOT NULL AND ${verificationContacts.email} != ''`,
          sql`(${verificationContacts.emailStatus} IS NULL OR ${verificationContacts.emailStatus} = 'unknown')`
        )
      )
      .limit(limit);
    
    console.log(`[START EMAIL VALIDATION] Found ${eligibleContacts.length} contacts needing validation`);
    
    if (eligibleContacts.length === 0) {
      return res.json({
        message: "No eligible contacts need email validation",
        totalEligible: 0,
      });
    }
    
    // Check cross-campaign cache to skip already validated emails
    const emailsToCheck = eligibleContacts
      .map(c => c.emailLower || c.email?.toLowerCase())
      .filter((email): email is string => Boolean(email));
    
    const alreadyValidatedEmails = await db
      .select({ emailLower: verificationEmailValidations.emailLower })
      .from(verificationEmailValidations)
      .where(inArray(verificationEmailValidations.emailLower, emailsToCheck))
      .groupBy(verificationEmailValidations.emailLower);
    
    const validatedEmailSet = new Set(alreadyValidatedEmails.map(v => v.emailLower));
    
    const contactIdsNeedingValidation = eligibleContacts
      .filter(c => {
        const emailKey = c.emailLower || c.email?.toLowerCase();
        return emailKey && !validatedEmailSet.has(emailKey);
      })
      .map(c => c.id);
    
    const skippedCount = eligibleContacts.length - contactIdsNeedingValidation.length;
    
    console.log(`[START EMAIL VALIDATION] ${contactIdsNeedingValidation.length} need validation, ${skippedCount} already validated`);
    
    if (contactIdsNeedingValidation.length === 0) {
      return res.json({
        message: "All eligible contacts already validated",
        totalEligible: eligibleContacts.length,
        totalSkipped: skippedCount,
      });
    }
    
    // Create background job
    const BATCH_SIZE = 500;
    const totalBatches = Math.ceil(contactIdsNeedingValidation.length / BATCH_SIZE);
    
    const [job] = await db
      .insert(verificationEmailValidationJobs)
      .values({
        campaignId,
        status: 'processing',
        totalContacts: contactIdsNeedingValidation.length,
        totalBatches,
        contactIds: contactIdsNeedingValidation,
        createdBy: userId,
        startedAt: new Date(),
      })
      .returning();
    
    console.log(`[START EMAIL VALIDATION] Job ${job.id} created for ${contactIdsNeedingValidation.length} contacts`);
    
    // Start background processing
    setImmediate(async () => {
      try {
        await processEmailValidationJob(job.id);
      } catch (error) {
        console.error(`[START EMAIL VALIDATION] Job ${job.id} failed:`, error);
        await db.update(verificationEmailValidationJobs)
          .set({
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(verificationEmailValidationJobs.id, job.id))
          .catch(err => console.error(`Failed to update job status:`, err));
      }
    });
    
    res.json({
      jobId: job.id,
      message: `Email validation started for ${contactIdsNeedingValidation.length} contacts`,
      totalContacts: contactIdsNeedingValidation.length,
      totalBatches,
      totalEligible: eligibleContacts.length,
      totalSkipped: skippedCount,
      estimatedTimeMinutes: Math.ceil(contactIdsNeedingValidation.length / 60), // ~60 emails/min with rate limiting
    });
    
  } catch (error) {
    console.error("[START EMAIL VALIDATION] Error:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to start email validation" });
  }
});

// Get email validation job status
router.get("/api/verification-campaigns/:campaignId/email-validation-jobs/:jobId", requireAuth, async (req, res) => {
  try {
    const { campaignId, jobId } = req.params;
    
    const [job] = await db
      .select()
      .from(verificationEmailValidationJobs)
      .where(and(
        eq(verificationEmailValidationJobs.id, jobId),
        eq(verificationEmailValidationJobs.campaignId, campaignId)
      ));
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // Calculate progress percentage
    const progressPercent = job.totalContacts > 0 
      ? Math.round((job.processedContacts / job.totalContacts) * 100)
      : 0;
    
    res.json({
      ...job,
      progressPercent,
    });
  } catch (error) {
    console.error("[EMAIL VALIDATION JOB STATUS] Error:", error);
    res.status(500).json({ error: "Failed to fetch job status" });
  }
});

// List all email validation jobs for a campaign
router.get("/api/verification-campaigns/:campaignId/email-validation-jobs", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;
    
    const jobs = await db
      .select()
      .from(verificationEmailValidationJobs)
      .where(eq(verificationEmailValidationJobs.campaignId, campaignId))
      .orderBy(desc(verificationEmailValidationJobs.createdAt))
      .limit(limit)
      .offset(offset);
    
    // Calculate progress for each job
    const jobsWithProgress = jobs.map(job => ({
      ...job,
      progressPercent: job.totalContacts > 0 
        ? Math.round((job.processedContacts / job.totalContacts) * 100)
        : 0,
    }));
    
    res.json(jobsWithProgress);
  } catch (error) {
    console.error("[EMAIL VALIDATION JOBS LIST] Error:", error);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

// CSV Export endpoint (all contacts)
router.get("/api/verification-campaigns/:campaignId/contacts/export/csv", requireAuth, requireDataExportAuthority, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const includeCompanyFields = req.query.includeCompany !== 'false';
    
    // Fetch all contacts for the campaign with account data
    const contactsData = await db
      .select({
        contact: verificationContacts,
        account: accounts,
      })
      .from(verificationContacts)
      .leftJoin(accounts, eq(verificationContacts.accountId, accounts.id))
      .where(eq(verificationContacts.campaignId, campaignId))
      .orderBy(desc(verificationContacts.createdAt));
    
    // Transform data to include account info
    const contacts = contactsData.map(row => ({
      ...row.contact,
      account: row.account || undefined,
    }));
    
    // Generate CSV with UTF-8 BOM and proper formatting
    // Default to US country code (+1) for phone number formatting
    const csvContent = exportVerificationContactsToCsv(contacts, includeCompanyFields, {
      includeBOM: true,
      defaultCountryCode: '1',
    });
    
    // Create download response with proper headers
    const { content, headers } = createCsvDownloadResponse(
      csvContent,
      `verification-contacts-${campaignId}-${new Date().toISOString().split('T')[0]}.csv`
    );
    
    // Set headers
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    
    // Send the file
    res.send(content);
  } catch (error) {
    console.error("Error exporting contacts to CSV:", error);
    res.status(500).json({ error: "Failed to export contacts" });
  }
});

// CSV Export endpoint (filtered: Validated + Email Verified contacts only)
router.get("/api/verification-campaigns/:campaignId/contacts/export/validated-verified", requireAuth, requireDataExportAuthority, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const includeCompanyFields = req.query.includeCompany !== 'false';
    
    console.log(`[EXPORT VALIDATED+VERIFIED] Starting export for campaign ${campaignId}`);
    
    // Fetch only contacts that are:
    // 1. verificationStatus = 'Validated'
    // 2. emailStatus = 'valid' or 'acceptable' (verified and deliverable)
    const contactsData = await db
      .select({
        contact: verificationContacts,
        account: accounts,
      })
      .from(verificationContacts)
      .leftJoin(accounts, eq(verificationContacts.accountId, accounts.id))
      .where(and(
        eq(verificationContacts.campaignId, campaignId),
        eq(verificationContacts.verificationStatus, 'Validated'),
        sql`${verificationContacts.emailStatus} IN ('valid', 'acceptable')`,
        eq(verificationContacts.deleted, false),
      ))
      .orderBy(desc(verificationContacts.createdAt));
    
    console.log(`[EXPORT VALIDATED+VERIFIED] Found ${contactsData.length} qualified contacts`);
    
    // Transform data to include account info
    const contacts = contactsData.map(row => ({
      ...row.contact,
      account: row.account || undefined,
    }));
    
    if (contacts.length === 0) {
      // Return empty CSV with headers
      const emptyContent = exportVerificationContactsToCsv([], includeCompanyFields, {
        includeBOM: true,
        defaultCountryCode: '1',
      });
      const { content, headers } = createCsvDownloadResponse(
        emptyContent,
        `validated-verified-contacts-${campaignId}-${new Date().toISOString().split('T')[0]}.csv`
      );
      
      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      
      return res.send(content);
    }
    
    // Generate CSV with UTF-8 BOM and proper formatting
    // Default to US country code (+1) for phone number formatting
    const csvContent = exportVerificationContactsToCsv(contacts, includeCompanyFields, {
      includeBOM: true,
      defaultCountryCode: '1',
    });
    
    // Create download response with proper headers
    const { content, headers } = createCsvDownloadResponse(
      csvContent,
      `validated-verified-contacts-${campaignId}-${new Date().toISOString().split('T')[0]}.csv`
    );
    
    // Set headers
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    
    console.log(`[EXPORT VALIDATED+VERIFIED] Export completed successfully`);
    
    // Send the file
    res.send(content);
  } catch (error) {
    console.error("[EXPORT VALIDATED+VERIFIED] Error:", error);
    res.status(500).json({ error: "Failed to export validated and verified contacts" });
  }
});

// Re-validate all eligible contacts endpoint
router.post("/api/verification-campaigns/:campaignId/contacts/revalidate-emails", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    console.log(`[RE-VALIDATE] Starting email re-validation for campaign ${campaignId}`);
    
    // Get campaign to ensure it exists
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    // Find eligible contacts that need email validation
    // Only validate potentially eligible contacts (passed geo/title checks)
    const contactsToRevalidate = await db
      .select({
        id: verificationContacts.id,
        email: verificationContacts.email,
        eligibilityStatus: verificationContacts.eligibilityStatus,
      })
      .from(verificationContacts)
      .where(
        and(
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.deleted, false),
          sql`${verificationContacts.email} IS NOT NULL AND ${verificationContacts.email} != ''`,
          // Only validate Eligible contacts (not Out_of_Scope)
          sql`${verificationContacts.eligibilityStatus} = 'Eligible'`
        )
      );
    
    console.log(`[RE-VALIDATE] Found ${contactsToRevalidate.length} contacts to re-validate`);
    
    if (contactsToRevalidate.length === 0) {
      return res.json({ 
        message: "No contacts found to re-validate",
        count: 0
      });
    }
    
    // Delete existing validation records for these contacts
    const contactIds = contactsToRevalidate.map(c => c.id);
    
    await db
      .delete(verificationEmailValidations)
      .where(inArray(verificationEmailValidations.contactId, contactIds));
    
    console.log(`[RE-VALIDATE] Deleted existing validation records for ${contactIds.length} contacts`);
    
    // Reset contacts to Pending_Email_Validation status
    const updateResult = await db
      .update(verificationContacts)
      .set({
        eligibilityStatus: 'Pending_Email_Validation',
        emailStatus: null,
        updatedAt: new Date(),
      })
      .where(inArray(verificationContacts.id, contactIds));
    
    console.log(`[RE-VALIDATE] Reset ${contactIds.length} contacts to Pending_Email_Validation status`);
    
    // Log the re-validation action
    await db.insert(verificationAuditLog).values({
      entityType: 'verification_campaign',
      entityId: campaignId,
      actorId: (req as any).user?.id || null,
      action: 'contacts_email_revalidation',
      after: {
        contactCount: contactIds.length,
        timestamp: new Date().toISOString(),
      },
    });
    
    res.json({ 
      message: `Successfully queued ${contactIds.length} contacts for email re-validation`,
      count: contactIds.length
    });
    
  } catch (error) {
    console.error("[RE-VALIDATE] Error:", error);
    res.status(500).json({ error: "Failed to re-validate contacts" });
  }
});

// Manual trigger: Process pending contacts (eligibility + suppression + email validation)
router.post("/api/verification-campaigns/:campaignId/process-pending-contacts", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const schema = z.object({
      triggerEmailValidation: z.boolean().optional().default(false),
      batchSize: z.number().optional().default(1000),
    });
    
    const { triggerEmailValidation, batchSize } = schema.parse(req.body);
    
    console.log(`[PROCESS PENDING] Starting for campaign ${campaignId} (triggerEmailValidation: ${triggerEmailValidation})`);
    
    // Get campaign
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    // Process ALL pending contacts in batches
    let totalProcessed = 0;
    let totalEligible = 0;
    let totalIneligible = 0;
    let hasMorePending = true;
    let allProcessedContactIds: string[] = [];
    
    console.log(`[PROCESS PENDING] Starting bulk processing for campaign ${campaignId}`);
    
    while (hasMorePending) {
      // Get next batch of Pending_Email_Validation contacts
      const pendingContacts = await db
        .select()
        .from(verificationContacts)
        .where(
          and(
            eq(verificationContacts.campaignId, campaignId),
            eq(verificationContacts.deleted, false),
            eq(verificationContacts.eligibilityStatus, 'Pending_Email_Validation')
          )
        )
        .limit(batchSize);
      
      if (pendingContacts.length === 0) {
        hasMorePending = false;
        break;
      }
      
      console.log(`[PROCESS PENDING] Processing batch of ${pendingContacts.length} contacts (total so far: ${totalProcessed})`);
      
      const contactIds = pendingContacts.map(c => c.id);
      allProcessedContactIds.push(...contactIds);
      let eligibleCount = 0;
      let ineligibleCount = 0;
      
      // Step 1: Apply suppression checks (updates contacts directly)
      await applySuppressionForContacts(campaignId, contactIds);
      
      // Step 2: Run eligibility checks for non-suppressed contacts
      for (const contact of pendingContacts) {
        // Re-fetch to check if it was suppressed
        const [updated] = await db
          .select()
          .from(verificationContacts)
          .where(eq(verificationContacts.id, contact.id));
        
        if (updated.suppressed) {
          ineligibleCount++;
          continue;
        }
        
        // Run eligibility check
        const eligibilityResult = evaluateEligibility(
          contact.title,
          contact.contactCountry,
          campaign,
          contact.email
        );
        
        // Update contact with eligibility result
        await db
          .update(verificationContacts)
          .set({
            eligibilityStatus: eligibilityResult.status,
            eligibilityReason: eligibilityResult.reason,
            updatedAt: new Date(),
          })
          .where(eq(verificationContacts.id, contact.id));
        
        if (eligibilityResult.status === 'Eligible') {
          eligibleCount++;
        } else {
          ineligibleCount++;
        }
      }
      
      totalProcessed += pendingContacts.length;
      totalEligible += eligibleCount;
      totalIneligible += ineligibleCount;
      
      console.log(`[PROCESS PENDING] Batch complete: ${eligibleCount} eligible, ${ineligibleCount} ineligible (running totals: ${totalProcessed} processed, ${totalEligible} eligible, ${totalIneligible} ineligible)`);
    }
    
    console.log(`[PROCESS PENDING] Bulk processing complete: ${totalProcessed} contacts processed, ${totalEligible} eligible, ${totalIneligible} ineligible`);
    
    let validationJobId = null;
    let enrichmentTriggered = false;
    
    // Step 3: Auto-trigger enrichment if eligible contacts exist (immediate trigger)
    if (totalEligible > 0) {
      try {
        const { autoTriggerEnrichment } = await import('./verification-enrichment');
        const enrichResult = await autoTriggerEnrichment(campaignId);
        enrichmentTriggered = enrichResult.triggered;
        console.log(`[PROCESS PENDING] Auto-enrichment: ${enrichResult.reason}`);
      } catch (error) {
        console.error(`[PROCESS PENDING] Auto-enrichment trigger failed:`, error);
      }
    }
    
    // Step 4: Trigger email validation if requested and we have eligible contacts
    if (triggerEmailValidation && totalEligible > 0) {
      // Get IDs of eligible contacts from all processed contacts
      const eligibleContacts = await db
        .select({ id: verificationContacts.id })
        .from(verificationContacts)
        .where(
          and(
            eq(verificationContacts.campaignId, campaignId),
            eq(verificationContacts.eligibilityStatus, 'Eligible'),
            inArray(verificationContacts.id, allProcessedContactIds)
          )
        );
      
      const eligibleContactIds = eligibleContacts.map(c => c.id);
      
      console.log(`[PROCESS PENDING] Creating email validation job for ${eligibleContactIds.length} eligible contacts`);
      
      const [job] = await db
        .insert(verificationEmailValidationJobs)
        .values({
          campaignId,
          contactIds: eligibleContactIds,
          totalContacts: eligibleContactIds.length,
          processedContacts: 0,
          status: 'processing',
        })
        .returning();
      
      validationJobId = job.id;
      
      // Start background processing
      setImmediate(async () => {
        try {
          await processEmailValidationJob(job.id);
        } catch (error) {
          console.error(`[PROCESS PENDING] Email validation job ${job.id} failed:`, error);
        }
      });
      
      console.log(`[PROCESS PENDING] Email validation job ${validationJobId} started`);
    }
    
    res.json({
      message: totalProcessed === 0 
        ? "No pending contacts to process" 
        : `Processed ${totalProcessed} pending contacts in bulk`,
      processed: totalProcessed,
      eligible: totalEligible,
      ineligible: totalIneligible,
      validationJobId,
      autoEnrichmentTriggered: enrichmentTriggered,
      hasMore: false, // All pending contacts processed
    });
    
  } catch (error) {
    console.error("[PROCESS PENDING] Error:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to process pending contacts" });
  }
});

// Company enrichment endpoint
router.post("/api/verification-campaigns/:campaignId/contacts/enrich-companies", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { limit = 50 } = req.body;

    console.log(`[COMPANY-ENRICHMENT] Starting enrichment for campaign ${campaignId}`);

    // Get eligible contacts without HQ address or phone
    const contactsToEnrich = await db
      .select({
        id: verificationContacts.id,
        fullName: verificationContacts.fullName,
        accountId: verificationContacts.accountId,
        contactCity: verificationContacts.contactCity,
        contactCountry: verificationContacts.contactCountry,
        hqAddress1: verificationContacts.hqAddress1,
        hqPhone: verificationContacts.hqPhone,
      })
      .from(verificationContacts)
      .leftJoin(accounts, eq(verificationContacts.accountId, accounts.id))
      .where(
        and(
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.eligibilityStatus, 'Eligible'),
          or(
            isNull(verificationContacts.hqAddress1),
            isNull(verificationContacts.hqPhone)
          )
        )
      )
      .limit(limit);

    if (contactsToEnrich.length === 0) {
      return res.json({
        message: "No contacts need enrichment",
        enriched: 0,
        failed: 0,
        skipped: 0
      });
    }

    console.log(`[COMPANY-ENRICHMENT] Found ${contactsToEnrich.length} contacts to enrich`);

    // Get account info for each contact
    const accountIds = [...new Set(contactsToEnrich.map(c => c.accountId).filter(Boolean))] as string[];
    const accountsData = await db
      .select()
      .from(accounts)
      .where(inArray(accounts.id, accountIds));

    const accountMap = new Map(accountsData.map(a => [a.id, a]));

    let enriched = 0;
    let failed = 0;
    let skipped = 0;

    // Import the enrichment service
    const { enrichCompanyData } = await import('../services/company-enrichment');

    // Process each contact
    for (const contact of contactsToEnrich) {
      if (!contact.accountId) {
        skipped++;
        continue;
      }

      const account = accountMap.get(contact.accountId);
      if (!account || !account.name) {
        skipped++;
        continue;
      }

      try {
        const result = await enrichCompanyData({
          companyName: account.name,
          contactLocation: contact.contactCity || contact.contactCountry || undefined,
          existingAddress: contact.hqAddress1 || undefined,
          existingPhone: contact.hqPhone || undefined
        });

        if (result.success && result.data && result.data.confidence >= 70) {
          // Update contact with enriched data
          await db
            .update(verificationContacts)
            .set({
              hqAddress1: result.data.address1 || undefined,
              hqAddress2: result.data.address2 || undefined,
              hqCity: result.data.city || undefined,
              hqState: result.data.state || undefined,
              hqCountry: result.data.country || undefined,
              hqPostal: result.data.postal || undefined,
              hqPhone: result.data.phone || undefined,
              updatedAt: new Date()
            })
            .where(eq(verificationContacts.id, contact.id));

          enriched++;
          console.log(`[COMPANY-ENRICHMENT] Enriched contact ${contact.id} for ${account.name} (confidence: ${result.data.confidence})`);
        } else {
          failed++;
          console.log(`[COMPANY-ENRICHMENT] Low confidence for ${account.name}: ${result.data?.confidence || 0}`);
        }

        // Rate limiting: 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        failed++;
        console.error(`[COMPANY-ENRICHMENT] Error enriching ${account.name}:`, error);
      }
    }

    console.log(`[COMPANY-ENRICHMENT] Completed: ${enriched} enriched, ${failed} failed, ${skipped} skipped`);

    res.json({
      message: `Company enrichment completed`,
      enriched,
      failed,
      skipped,
      total: contactsToEnrich.length
    });

  } catch (error) {
    console.error("[COMPANY-ENRICHMENT] Error:", error);
    res.status(500).json({ error: "Failed to enrich companies" });
  }
});

export default router;