import { Router } from "express";
import { db } from "../db";
import { verificationContacts, accounts } from "@shared/schema";
import { eq, and, sql, isNull, or, ne } from "drizzle-orm";
import { CompanyEnrichmentService } from "../lib/company-enrichment";

const router = Router();

/**
 * Auto-trigger enrichment for eligible contacts needing phone/address data
 * Called automatically after eligibility checks or when viewing campaign stats
 * @param campaignId - Campaign to enrich
 * @param threshold - Minimum job title coverage % to trigger (default 20%)
 * @returns Enrichment job info or null if threshold not met
 */
export async function autoTriggerEnrichment(
  campaignId: string,
  threshold: number = 20
): Promise {
  try {
    // Check job title coverage threshold (Smart Workflow Trigger System)
    const [coverage] = await db
      .select({
        total: sql`COUNT(*)`,
        withJobTitle: sql`SUM(CASE WHEN ${verificationContacts.title} IS NOT NULL AND ${verificationContacts.title} != '' THEN 1 ELSE 0 END)`,
      })
      .from(verificationContacts)
      .where(
        and(
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.eligibilityStatus, 'Eligible'),
          eq(verificationContacts.deleted, false)
        )
      );

    const totalEligible = Number(coverage.total) || 0;
    const withTitle = Number(coverage.withJobTitle) || 0;
    const coveragePercent = totalEligible > 0 ? (withTitle / totalEligible) * 100 : 0;

    if (coveragePercent `SUM(CASE WHEN ${verificationContacts.aiEnrichedPhone} IS NULL THEN 1 ELSE 0 END)`,
        needsAddress: sql`SUM(CASE WHEN ${verificationContacts.aiEnrichedAddress1} IS NULL OR ${verificationContacts.aiEnrichedCity} IS NULL THEN 1 ELSE 0 END)`,
      })
      .from(verificationContacts)
      .where(
        and(
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.eligibilityStatus, 'Eligible'),
          eq(verificationContacts.deleted, false),
          eq(verificationContacts.suppressed, false)
        )
      );

    const needsPhone = Number(needsEnrichment.needsPhone) || 0;
    const needsAddress = Number(needsEnrichment.needsAddress) || 0;

    if (needsPhone === 0 && needsAddress === 0) {
      return {
        triggered: false,
        reason: 'All eligible contacts already enriched',
        stats: { totalEligible, needsPhone, needsAddress },
      };
    }

    console.log(`[AUTO-ENRICHMENT] Triggering for campaign ${campaignId}: ${needsPhone} need phone, ${needsAddress} need address`);

    // Trigger enrichment in background (non-blocking)
    setImmediate(async () => {
      try {
        // Import dynamically to avoid circular deps
        const { enrichCampaignInBackground } = await import('./verification-enrichment');
        await enrichCampaignInBackground(campaignId, {
          batchSize: 50,
          delayMs: 1500,
          ignoreEmailValidation: false,
        });
      } catch (error) {
        console.error(`[AUTO-ENRICHMENT] Background enrichment failed for campaign ${campaignId}:`, error);
      }
    });

    return {
      triggered: true,
      reason: `Auto-triggered enrichment (${needsPhone} phone, ${needsAddress} address)`,
      stats: { totalEligible, needsPhone, needsAddress, coveragePercent },
    };
  } catch (error) {
    console.error(`[AUTO-ENRICHMENT] Error checking enrichment trigger for campaign ${campaignId}:`, error);
    return {
      triggered: false,
      reason: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Helper: Sleep for specified milliseconds
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Background enrichment worker - runs enrichment without blocking HTTP response
 * @param campaignId - Campaign to enrich
 * @param options - Enrichment configuration
 */
export async function enrichCampaignInBackground(
  campaignId: string,
  options: {
    force?: boolean;
    batchSize?: number;
    delayMs?: number;
    ignoreEmailValidation?: boolean;
  } = {}
): Promise {
  const { force = false, batchSize = 50, delayMs = 1500, ignoreEmailValidation = false } = options;

  try {
    console.log(`[BACKGROUND ENRICHMENT] Starting for campaign ${campaignId} (batch: ${batchSize}, delay: ${delayMs}ms)`);

    // Build email status filter
    const emailConditions = ignoreEmailValidation
      ? []
      : [or(isNull(verificationContacts.emailStatus), ne(verificationContacts.emailStatus, 'invalid'))];

    // Get eligible contacts that need enrichment
    const contacts = await db
      .select({
        id: verificationContacts.id,
        fullName: verificationContacts.fullName,
        accountId: verificationContacts.accountId,
        accountName: accounts.name,
        contactCountry: verificationContacts.contactCountry,
        hqCountry: verificationContacts.hqCountry,
        aiEnrichedAddress1: verificationContacts.aiEnrichedAddress1,
        aiEnrichedCity: verificationContacts.aiEnrichedCity,
        aiEnrichedPhone: verificationContacts.aiEnrichedPhone,
        addressEnrichmentStatus: verificationContacts.addressEnrichmentStatus,
        phoneEnrichmentStatus: verificationContacts.phoneEnrichmentStatus,
      })
      .from(verificationContacts)
      .leftJoin(accounts, eq(verificationContacts.accountId, accounts.id))
      .where(
        and(
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.eligibilityStatus, 'Eligible'),
          eq(verificationContacts.deleted, false),
          eq(verificationContacts.suppressed, false),
          ...emailConditions
        )
      );

    // Filter to contacts needing enrichment
    const contactsNeedingEnrichment = contacts.filter((contact) => {
      if (force) return true;
      const needsAddress = CompanyEnrichmentService.needsAddressEnrichment(contact);
      const needsPhone = CompanyEnrichmentService.needsPhoneEnrichment(contact);
      return needsAddress || needsPhone;
    });

    console.log(`[BACKGROUND ENRICHMENT] Found ${contactsNeedingEnrichment.length} contacts to enrich`);

    if (contactsNeedingEnrichment.length === 0) {
      return;
    }

    // Process in batches with delays
    let processed = 0;
    let addressEnriched = 0;
    let phoneEnriched = 0;
    let failed = 0;

    for (let i = 0; i  CompanyEnrichmentService.enrichCompanyData(contact, contact.accountName || ''),
            3,
            1000
          );

          const updateData: any = { updatedAt: new Date() };
          let addressSuccess = false;
          let phoneSuccess = false;

          // Handle address enrichment
          if (result.address && result.addressConfidence !== undefined && result.addressConfidence >= 0.7) {
            updateData.aiEnrichedAddress1 = result.address.address1;
            updateData.aiEnrichedAddress2 = result.address.address2 || null;
            updateData.aiEnrichedAddress3 = result.address.address3 || null;
            updateData.aiEnrichedCity = result.address.city;
            updateData.aiEnrichedState = result.address.state;
            updateData.aiEnrichedPostal = result.address.postalCode;
            updateData.addressEnrichmentStatus = 'completed';
            updateData.addressEnrichedAt = new Date();
            addressSuccess = true;
            addressEnriched++;
          }

          // Handle phone enrichment
          if (result.phone && result.phoneConfidence !== undefined && result.phoneConfidence >= 0.7) {
            updateData.aiEnrichedPhone = result.phone;
            updateData.phoneEnrichmentStatus = 'completed';
            updateData.phoneEnrichedAt = new Date();
            phoneSuccess = true;
            phoneEnriched++;
          }

          if (Object.keys(updateData).length > 1) {
            await db
              .update(verificationContacts)
              .set(updateData)
              .where(eq(verificationContacts.id, contact.id));
          }

          processed++;
        } catch (error) {
          failed++;
          console.error(`[BACKGROUND ENRICHMENT] Failed for contact ${contact.id}:`, error);
        }

        // Rate limiting delay
        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }

      console.log(`[BACKGROUND ENRICHMENT] Progress: ${processed}/${contactsNeedingEnrichment.length} (${addressEnriched} address, ${phoneEnriched} phone, ${failed} failed)`);
    }

    console.log(`[BACKGROUND ENRICHMENT] Complete for campaign ${campaignId}: ${processed} processed, ${addressEnriched} address, ${phoneEnriched} phone`);
  } catch (error) {
    console.error(`[BACKGROUND ENRICHMENT] Error for campaign ${campaignId}:`, error);
  }
}

// Helper: Retry with exponential backoff for 429/5xx errors
async function retryWithBackoff(
  fn: () => Promise,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise {
  let lastError: any;
  
  for (let attempt = 1; attempt = 500 && error.status ;
}

/**
 * POST /api/verification-campaigns/:campaignId/enrich
 * Trigger AI enrichment for eligible contacts in a campaign
 * Enriches both address and phone number in a single operation
 * 
 * Features:
 * - Separate confidence thresholds (≥0.7) for address and phone data
 * - Only enriches incomplete data (missing any required field)
 * - Preserves previously completed enrichments during errors
 * - force=true: Re-enriches even completed data (use for data refresh)
 * - ignoreEmailValidation=true: Enriches contacts regardless of email validation status (manual override)
 */
router.post("/api/verification-campaigns/:campaignId/enrich", async (req, res) => {
  const { campaignId } = req.params;
  const { 
    force = false, 
    batchSize = 50, 
    delayMs = 1500,
    ignoreEmailValidation = false 
  } = req.body;

  try {
    const validationMode = ignoreEmailValidation ? '[BYPASSING EMAIL VALIDATION]' : '';
    console.log(`[Enrichment] Starting enrichment for campaign ${campaignId} (batch: ${batchSize}, delay: ${delayMs}ms) ${validationMode}`);
    
    // Audit log for manual email validation bypass
    if (ignoreEmailValidation) {
      console.log(`[ENRICHMENT AUDIT] Email validation bypass enabled for campaign ${campaignId} - manual override`);
    }

    // Build email status filter conditionally
    // Inclusive approach: enrich all contacts EXCEPT those with explicitly invalid emails
    // Includes: null/unchecked, unknown, unverified, valid, safe_to_send, and any other status
    // Excludes: invalid only
    const emailConditions = ignoreEmailValidation 
      ? [] 
      : [or(
          isNull(verificationContacts.emailStatus),
          ne(verificationContacts.emailStatus, 'invalid')
        )];

    // Get eligible contacts that need enrichment
    const query = db
      .select({
        id: verificationContacts.id,
        fullName: verificationContacts.fullName,
        accountId: verificationContacts.accountId,
        accountName: accounts.name,
        contactCountry: verificationContacts.contactCountry,
        hqCountry: verificationContacts.hqCountry,
        aiEnrichedAddress1: verificationContacts.aiEnrichedAddress1,
        aiEnrichedAddress2: verificationContacts.aiEnrichedAddress2,
        aiEnrichedAddress3: verificationContacts.aiEnrichedAddress3,
        aiEnrichedCity: verificationContacts.aiEnrichedCity,
        aiEnrichedState: verificationContacts.aiEnrichedState,
        aiEnrichedPostal: verificationContacts.aiEnrichedPostal,
        aiEnrichedPhone: verificationContacts.aiEnrichedPhone,
        addressEnrichmentStatus: verificationContacts.addressEnrichmentStatus,
        phoneEnrichmentStatus: verificationContacts.phoneEnrichmentStatus,
        emailStatus: verificationContacts.emailStatus,
      })
      .from(verificationContacts)
      .leftJoin(accounts, eq(verificationContacts.accountId, accounts.id))
      .where(
        and(
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.eligibilityStatus, 'Eligible'),
          eq(verificationContacts.deleted, false),
          eq(verificationContacts.suppressed, false),
          ...emailConditions
        )
      );

    const eligibleContacts = await query;

    // Filter contacts that need enrichment using service methods
    const contactsNeedingEnrichment = eligibleContacts.filter(contact => {
      const needsAddress = CompanyEnrichmentService.needsAddressEnrichment(contact);
      const needsPhone = CompanyEnrichmentService.needsPhoneEnrichment(contact);
      
      if (force) {
        return needsAddress || needsPhone;
      }
      
      const addressNotEnriched = contact.addressEnrichmentStatus !== 'completed';
      const phoneNotEnriched = contact.phoneEnrichmentStatus !== 'completed';
      
      return (needsAddress && addressNotEnriched) || (needsPhone && phoneNotEnriched);
    });

    if (contactsNeedingEnrichment.length === 0) {
      return res.json({
        message: "No eligible contacts need enrichment",
        progress: {
          total: 0,
          processed: 0,
          addressEnriched: 0,
          phoneEnriched: 0,
          failed: 0,
          errors: [],
        }
      });
    }

    // Limit batch to prevent overwhelming
    const effectiveBatchSize = Math.min(batchSize, contactsNeedingEnrichment.length);
    const contactsToEnrich = contactsNeedingEnrichment.slice(0, effectiveBatchSize);

    const progress: EnrichmentProgress = {
      total: contactsToEnrich.length, // Set to actual number being processed, not total eligible
      processed: 0,
      addressEnriched: 0,
      phoneEnriched: 0,
      failed: 0,
      errors: [],
    };

    console.log(`[Enrichment] Found ${contactsNeedingEnrichment.length} contacts needing enrichment, processing ${contactsToEnrich.length} in this batch`);

    // Circuit breaker: Stop if too many consecutive failures
    const CIRCUIT_BREAKER_THRESHOLD = 10;
    let consecutiveFailures = 0;
    let circuitBroken = false;

    console.log(`[Enrichment] Processing ${contactsToEnrich.length} contacts sequentially with ${delayMs}ms delay`);

    // Process contacts SEQUENTIALLY to avoid rate limits
    for (let i = 0; i = CIRCUIT_BREAKER_THRESHOLD) {
            circuitBroken = true;
          }
          continue;
        }

        // Mark as in progress
        await db.update(verificationContacts)
          .set({
            addressEnrichmentStatus: CompanyEnrichmentService.needsAddressEnrichment(contact) 
              ? 'in_progress' 
              : contact.addressEnrichmentStatus,
            phoneEnrichmentStatus: CompanyEnrichmentService.needsPhoneEnrichment(contact)
              ? 'in_progress'
              : contact.phoneEnrichmentStatus,
            updatedAt: new Date(),
          })
          .where(eq(verificationContacts.id, contact.id));

        // Call enrichment service with retry logic for 429/5xx errors
        const result = await retryWithBackoff(
          () => CompanyEnrichmentService.enrichCompanyData(contact, contact.accountName!),
          3, // max attempts
          1000 // base delay ms
        );

            const updateData: any = {
              updatedAt: new Date(),
            };

        const CONFIDENCE_THRESHOLD = 0.7;

        // Handle address enrichment result - only save if addressConfidence >= 0.7
        // Save to AI Enrichment fields (separate from contact/HQ fields, based on Contact Country only)
        if (result.address && result.addressConfidence !== undefined) {
          if (result.addressConfidence >= CONFIDENCE_THRESHOLD) {
            updateData.aiEnrichedAddress1 = result.address.address1;
            updateData.aiEnrichedAddress2 = result.address.address2 || null;
            updateData.aiEnrichedAddress3 = result.address.address3 || null;
            updateData.aiEnrichedCity = result.address.city;
            updateData.aiEnrichedState = result.address.state;
            updateData.aiEnrichedPostal = result.address.postalCode;
            updateData.aiEnrichedCountry = result.address.country;
            updateData.addressEnrichmentStatus = 'completed';
            updateData.addressEnrichedAt = new Date();
            updateData.addressEnrichmentError = null;
            progress.addressEnriched++;
            console.log(`[Enrichment] AI enriched address for ${contact.fullName} (confidence: ${result.addressConfidence})`);
          } else {
            updateData.addressEnrichmentStatus = 'failed';
            updateData.addressEnrichmentError = `Low confidence: ${result.addressConfidence.toFixed(2)} = 0.7
        // Save to AI Enrichment phone field (separate from contact/HQ phone, based on Contact Country only)
        if (result.phone && result.phoneConfidence !== undefined) {
          if (result.phoneConfidence >= CONFIDENCE_THRESHOLD) {
            updateData.aiEnrichedPhone = result.phone;
            updateData.phoneEnrichmentStatus = 'completed';
            updateData.phoneEnrichedAt = new Date();
            updateData.phoneEnrichmentError = null;
            progress.phoneEnriched++;
            console.log(`[Enrichment] AI enriched phone for ${contact.fullName} (confidence: ${result.phoneConfidence})`);
          } else {
            updateData.phoneEnrichmentStatus = 'failed';
            updateData.phoneEnrichmentError = `Low confidence: ${result.phoneConfidence.toFixed(2)} = CIRCUIT_BREAKER_THRESHOLD) {
          circuitBroken = true;
        }
      }

      // Delay between contacts to respect rate limits (except after last contact)
      if (i  0
        ? `Batch completed. ${totalRemaining} contacts still need enrichment - click "Enrich Company Data" again to continue.`
        : "All eligible contacts enriched";

    res.json({
      message,
      progress,
      remainingCount: totalRemaining,
      totalEligible: contactsNeedingEnrichment.length,
      circuitBroken,
    });
  } catch (error: any) {
    console.error("[Enrichment] Error:", error);
    res.status(500).json({ 
      error: "Failed to enrich contacts",
      details: error.message 
    });
  }
});

/**
 * POST /api/verification-contacts/:contactId/enrich
 * Trigger AI enrichment for a single contact
 */
router.post("/api/verification-contacts/:contactId/enrich", async (req, res) => {
  const { contactId } = req.params;
  const { force = false } = req.body;

  try {
    console.log(`[Enrichment] Starting single-contact enrichment for ${contactId}`);

    // Get the contact with account info
    const contactResult = await db
      .select({
        id: verificationContacts.id,
        fullName: verificationContacts.fullName,
        accountId: verificationContacts.accountId,
        accountName: accounts.name,
        contactCountry: verificationContacts.contactCountry,
        hqCountry: verificationContacts.hqCountry,
        hqAddress1: verificationContacts.hqAddress1,
        hqCity: verificationContacts.hqCity,
        hqState: verificationContacts.hqState,
        hqPostal: verificationContacts.hqPostal,
        hqPhone: verificationContacts.hqPhone,
        addressEnrichmentStatus: verificationContacts.addressEnrichmentStatus,
        phoneEnrichmentStatus: verificationContacts.phoneEnrichmentStatus,
        eligibilityStatus: verificationContacts.eligibilityStatus,
        emailStatus: verificationContacts.emailStatus,
        deleted: verificationContacts.deleted,
        suppressed: verificationContacts.suppressed,
      })
      .from(verificationContacts)
      .leftJoin(accounts, eq(verificationContacts.accountId, accounts.id))
      .where(eq(verificationContacts.id, contactId));

    if (contactResult.length === 0) {
      return res.status(404).json({ error: "Contact not found" });
    }

    const contact = contactResult[0];

    // Server-side guards: reject only deleted, suppressed, or invalid emails
    // Email validation and eligibility are completely decoupled from enrichment
    if (contact.deleted) {
      console.log(`[Enrichment] Rejected ${contactId}: deleted`);
      return res.status(400).json({ error: "Cannot enrich deleted contact" });
    }

    if (contact.suppressed) {
      console.log(`[Enrichment] Rejected ${contactId}: suppressed`);
      return res.status(400).json({ error: "Cannot enrich suppressed contact" });
    }

    if (contact.emailStatus === 'invalid' && !force) {
      console.log(`[Enrichment] Rejected ${contactId}: email status is invalid`);
      return res.status(400).json({ error: "Cannot enrich contact with invalid email" });
    }

    // Check if contact needs enrichment
    const needsAddress = CompanyEnrichmentService.needsAddressEnrichment(contact);
    const needsPhone = CompanyEnrichmentService.needsPhoneEnrichment(contact);

    if (!force && !needsAddress && !needsPhone) {
      return res.json({
        message: "Contact does not need enrichment",
        addressEnriched: false,
        phoneEnriched: false,
      });
    }

    if (!contact.accountName) {
      return res.status(400).json({ error: "No company name available for enrichment" });
    }

    const CONFIDENCE_THRESHOLD = 0.7;

    // Perform enrichment
    const result = await CompanyEnrichmentService.enrichCompanyData(
      contact as any,
      contact.accountName
    );

    const updateData: any = {
      updatedAt: new Date(),
    };

    let addressEnriched = false;
    let phoneEnriched = false;

    // Handle address enrichment result
    if (result.address && result.addressConfidence !== undefined) {
      if (result.addressConfidence >= CONFIDENCE_THRESHOLD) {
        updateData.contactAddress1 = result.address.address1;
        updateData.contactAddress2 = result.address.address2 || null;
        updateData.contactAddress3 = result.address.address3 || null;
        updateData.contactCity = result.address.city;
        updateData.contactState = result.address.state;
        updateData.contactPostal = result.address.postalCode;
        updateData.contactCountry = result.address.country;
        updateData.aiEnrichedAddress1 = result.address.address1;
        updateData.aiEnrichedAddress2 = result.address.address2 || null;
        updateData.aiEnrichedAddress3 = result.address.address3 || null;
        updateData.aiEnrichedCity = result.address.city;
        updateData.aiEnrichedState = result.address.state;
        updateData.aiEnrichedPostal = result.address.postalCode;
        updateData.aiEnrichedCountry = result.address.country;
        updateData.addressEnrichmentStatus = 'completed';
        updateData.addressEnrichedAt = new Date();
        updateData.addressEnrichmentError = null;
        addressEnriched = true;
        console.log(`[Enrichment] Contact address enriched for ${contact.fullName} (confidence: ${result.addressConfidence})`);
      } else {
        updateData.addressEnrichmentStatus = 'failed';
        updateData.addressEnrichmentError = `Low confidence: ${result.addressConfidence.toFixed(2)} = CONFIDENCE_THRESHOLD) {
        updateData.hqPhone = result.phone;
        updateData.aiEnrichedPhone = result.phone;
        updateData.phoneEnrichmentStatus = 'completed';
        updateData.phoneEnrichedAt = new Date();
        updateData.phoneEnrichmentError = null;
        phoneEnriched = true;
        console.log(`[Enrichment] Contact phone enriched for ${contact.fullName} (confidence: ${result.phoneConfidence})`);
      } else {
        updateData.phoneEnrichmentStatus = 'failed';
        updateData.phoneEnrichmentError = `Low confidence: ${result.phoneConfidence.toFixed(2)} = CONFIDENCE_THRESHOLD) {
          if (!account.hqStreet1 && result.address.address1) {
            accountUpdates.hqStreet1 = result.address.address1;
          }
          if (!account.hqCity && result.address.city) {
            accountUpdates.hqCity = result.address.city;
          }
          if (!account.hqState && result.address.state) {
            accountUpdates.hqState = result.address.state;
          }
          if (!account.hqPostalCode && result.address.postalCode) {
            accountUpdates.hqPostalCode = result.address.postalCode;
          }
          if (!account.hqCountry && result.address.country) {
            accountUpdates.hqCountry = result.address.country;
          }
        }

        // Update account phone if empty and we got enriched phone with sufficient confidence
        if (result.phone && result.phoneConfidence !== undefined && result.phoneConfidence >= CONFIDENCE_THRESHOLD && !account.mainPhone) {
          accountUpdates.mainPhone = result.phone;
        }

        // Apply updates if any
        if (Object.keys(accountUpdates).length > 0) {
          await db.update(accounts)
            .set({ ...accountUpdates, updatedAt: new Date() })
            .where(eq(accounts.id, contact.accountId));
          
          console.log(`[Enrichment] Updated account ${contact.accountId} with enriched data:`, Object.keys(accountUpdates));
        }
      }
    }

    console.log(`[Enrichment] Single contact enriched: ${contact.fullName}, address=${addressEnriched}, phone=${phoneEnriched}`);

    res.json({
      message: "Contact enriched successfully",
      addressEnriched,
      phoneEnriched,
      addressConfidence: result.addressConfidence,
      phoneConfidence: result.phoneConfidence,
    });

  } catch (error: any) {
    console.error(`[Enrichment] Error enriching contact ${contactId}:`, error);
    res.status(500).json({ 
      error: "Failed to enrich contact",
      details: error.message 
    });
  }
});

/**
 * GET /api/verification-campaigns/:campaignId/enrichment-stats
 * Get enrichment statistics for a campaign
 */
router.get("/api/verification-campaigns/:campaignId/enrichment-stats", async (req, res) => {
  const { campaignId } = req.params;

  try {
    const stats = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE eligibility_status = 'Eligible' AND deleted = FALSE AND suppressed = FALSE) as eligible_count,
        COUNT(*) FILTER (WHERE address_enrichment_status = 'completed') as address_enriched_count,
        COUNT(*) FILTER (WHERE phone_enrichment_status = 'completed') as phone_enriched_count,
        COUNT(*) FILTER (WHERE address_enrichment_status = 'failed') as address_failed_count,
        COUNT(*) FILTER (WHERE phone_enrichment_status = 'failed') as phone_failed_count,
        COUNT(*) FILTER (WHERE (hq_address_1 IS NULL OR hq_city IS NULL) AND address_enrichment_status != 'completed') as needs_address_count,
        COUNT(*) FILTER (WHERE hq_phone IS NULL AND phone_enrichment_status != 'completed') as needs_phone_count
      FROM verification_contacts
      WHERE campaign_id = ${campaignId}
        AND eligibility_status = 'Eligible'
        AND deleted = FALSE
        AND suppressed = FALSE
    `);

    const row = stats.rows[0] as any;

    res.json({
      eligibleCount: Number(row.eligible_count || 0),
      addressEnriched: Number(row.address_enriched_count || 0),
      phoneEnriched: Number(row.phone_enriched_count || 0),
      addressFailed: Number(row.address_failed_count || 0),
      phoneFailed: Number(row.phone_failed_count || 0),
      needsAddress: Number(row.needs_address_count || 0),
      needsPhone: Number(row.needs_phone_count || 0),
    });
  } catch (error: any) {
    console.error("[Enrichment] Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch enrichment stats" });
  }
});

export default router;