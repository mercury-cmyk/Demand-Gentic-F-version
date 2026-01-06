/**
 * Background Job: 3-Layer Email Validation with Kickbox
 * HIGH-PERFORMANCE VERSION with parallel processing
 * Processes contacts with 'Pending_Email_Validation' status
 * 
 * Uses Kickbox as the sole email verification provider:
 * - Layer 1: In-house fast validation (syntax, DNS/MX, risk checks)
 * - Layer 2: Kickbox deep verification (SMTP inbox, catch-all, bounce prediction)
 * - Layer 3: Cross-campaign caching for cost optimization
 */

import cron from 'node-cron';
import { db } from '../db';
import { verificationContacts, verificationCampaigns } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { 
  validateAndStore3LayerEmail,
  summarize3LayerValidation,
  isDeepVerificationAvailable
} from '../services/email-validation';
import { finalizeEligibilityAfter3LayerValidation } from '../lib/verification-utils';

// PRODUCTION-OPTIMIZED SETTINGS FOR STABILITY
// Reduced from aggressive settings to prevent database pool exhaustion and event loop blocking
const BATCH_SIZE = Number(process.env.EMAIL_VALIDATION_BATCH_SIZE || 200); // Reduced from 500 to 200
const PROCESS_INTERVAL = '*/2 * * * *'; // Every 2 minutes (reduced from 1 to prevent cron overlap)
// Skip SMTP by default to avoid false positives from corporate anti-spam measures
// Set SKIP_SMTP_VALIDATION=false to enable SMTP probing (not recommended for B2B)
const SKIP_SMTP_DEFAULT = process.env.SKIP_SMTP_VALIDATION !== 'false';
const PARALLEL_LIMIT = Number(process.env.EMAIL_VALIDATION_PARALLEL || 10); // Reduced from 20 to 10

let isProcessing = false;

/**
 * Process emails in parallel batches for maximum speed
 * Uses Kickbox 3-layer validation for all emails
 */
async function processEmailBatch(contacts: any[]): Promise<{ validated: number; failed: number }> {
  let validated = 0;
  let failed = 0;
  
  // Process in chunks of PARALLEL_LIMIT
  for (let i = 0; i < contacts.length; i += PARALLEL_LIMIT) {
    const chunk = contacts.slice(i, i + PARALLEL_LIMIT);
    
    // Process all emails in this chunk in parallel
    const results = await Promise.allSettled(
      chunk.map(async (contact) => {
        if (!contact.email || !contact.campaign) {
          throw new Error('Invalid contact data');
        }
        
        // Use 3-Layer validation with Kickbox
        const validation = await validateAndStore3LayerEmail(contact.id, contact.email, {
          skipSmtp: SKIP_SMTP_DEFAULT,
          useCache: true,
        });
        
        // Get summarized result for eligibility
        const summary = summarize3LayerValidation(validation);
        
        // Determine eligibility with 3-layer rules
        const finalEligibility = finalizeEligibilityAfter3LayerValidation(
          {
            status: validation.status,
            isBusinessEmail: validation.isBusinessEmail,
            emailEligible: validation.emailEligible,
            eligibilityReason: validation.eligibilityReason,
            riskLevel: validation.riskLevel,
            isCatchAll: summary.isCatchAll,
            isDisposable: summary.isDisposable,
            isFree: summary.isFree,
          },
          contact.eligibilityStatus || 'Pending_Email_Validation',
          { requireBusinessEmail: true, allowCatchAll: true }
        );
        
        // Update contact with Kickbox verification fields
        await db
          .update(verificationContacts)
          .set({
            emailStatus: validation.status,
            eligibilityStatus: finalEligibility.eligibilityStatus,
            eligibilityReason: finalEligibility.reason,
            isBusinessEmail: validation.isBusinessEmail,
            emailRiskLevel: validation.riskLevel,
            emailEligible: validation.emailEligible,
            emailEligibilityReason: validation.eligibilityReason,
            deepVerifiedAt: validation.deepVerifiedAt,
            updatedAt: new Date(),
          })
          .where(eq(verificationContacts.id, contact.id));
        
        return {
          email: contact.email,
          status: validation.status,
          eligibility: finalEligibility.eligibilityStatus,
          isBusinessEmail: validation.isBusinessEmail,
        };
      })
    );
    
    // Count successes and failures
    for (const result of results) {
      if (result.status === 'fulfilled') {
        validated++;
      } else {
        failed++;
        const contact = chunk[results.indexOf(result)];
        console.error(`[EmailValidationJob] Error validating ${contact?.email}:`, result.reason);
        
        // Mark as eligible with unknown status (don't block workflow)
        if (contact?.id) {
          await db
            .update(verificationContacts)
            .set({
              emailStatus: 'unknown',
              eligibilityStatus: 'Eligible',
              eligibilityReason: 'email_validation_failed',
              updatedAt: new Date(),
            })
            .where(eq(verificationContacts.id, contact.id))
            .catch(() => {}); // Ignore update errors
        }
      }
    }
  }
  
  return { validated, failed };
}

/**
 * Process a batch of contacts pending email validation
 */
async function processPendingEmailValidations() {
  if (isProcessing) {
    console.log('[EmailValidationJob] Already processing, skipping this run');
    return;
  }
  
  isProcessing = true;
  
  try {
    // Find contacts pending email validation
    const pendingContacts = await db
      .select({
        id: verificationContacts.id,
        email: verificationContacts.email,
        campaignId: verificationContacts.campaignId,
        eligibilityStatus: verificationContacts.eligibilityStatus,
        campaign: {
          id: verificationCampaigns.id,
          emailValidationProvider: verificationCampaigns.emailValidationProvider,
        }
      })
      .from(verificationContacts)
      .leftJoin(verificationCampaigns, eq(verificationContacts.campaignId, verificationCampaigns.id))
      .where(
        and(
          eq(verificationContacts.eligibilityStatus, 'Pending_Email_Validation'),
          eq(verificationContacts.deleted, false),
          sql`${verificationContacts.email} IS NOT NULL`
        )
      )
      .limit(BATCH_SIZE);
    
    if (pendingContacts.length === 0) {
      console.log('[EmailValidationJob] No pending contacts found');
      return;
    }
    
    console.log(`[EmailValidationJob] Processing ${pendingContacts.length} contacts in parallel (max ${PARALLEL_LIMIT} concurrent)`);
    const startTime = Date.now();
    
    // Process all contacts in parallel batches using Kickbox
    const { validated, failed } = await processEmailBatch(pendingContacts);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (validated / parseFloat(duration)).toFixed(1);
    
    console.log(`[EmailValidationJob] Batch complete: ${validated} validated, ${failed} failed in ${duration}s (${rate} emails/sec)`);
    
  } catch (error) {
    console.error('[EmailValidationJob] Job error:', error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Manually trigger email validation (for on-demand execution)
 */
export async function triggerEmailValidation(): Promise<{ success: boolean; message: string; stats?: any }> {
  try {
    console.log('[EmailValidationJob] Manual trigger initiated');
    await processPendingEmailValidations();
    return { success: true, message: 'Email validation completed successfully' };
  } catch (error: any) {
    console.error('[EmailValidationJob] Manual trigger error:', error);
    return { success: false, message: error.message || 'Email validation failed' };
  }
}

/**
 * Start the email validation background job
 */
export function startEmailValidationJob() {
  const kickboxAvailable = isDeepVerificationAvailable();
  
  console.log(`[EmailValidationJob] Starting Kickbox 3-LAYER validation mode:`);
  console.log(`  - Provider: Kickbox (${kickboxAvailable ? 'CONFIGURED' : 'NOT CONFIGURED - Layer 1 only'})`);
  console.log(`  - Batch size: ${BATCH_SIZE}`);
  console.log(`  - Interval: ${PROCESS_INTERVAL}`);
  console.log(`  - Parallel limit: ${PARALLEL_LIMIT}`);
  console.log(`  - SMTP probing: ${SKIP_SMTP_DEFAULT ? 'DISABLED (DNS-only)' : 'ENABLED'}`);
  console.log(`  - Theoretical max: ${BATCH_SIZE * 60} emails/hour`);
  
  // Run on startup (after 5 seconds)
  setTimeout(() => {
    processPendingEmailValidations().catch(console.error);
  }, 5000);
  
  // Schedule recurring job
  cron.schedule(PROCESS_INTERVAL, () => {
    processPendingEmailValidations().catch(console.error);
  });
}
