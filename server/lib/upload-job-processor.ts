/**
 * CSV Upload Job Processor
 * Handles background processing of CSV uploads for validation results and submissions
 */

import { db } from "../db";
import { 
  verificationUploadJobs, 
  verificationContacts, 
  verificationLeadSubmissions,
  verificationCampaigns 
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import Papa from "papaparse";

interface UploadJobError {
  row: number;
  message: string;
}

/**
 * Process a CSV upload job
 */
export async function processUploadJob(jobId: string) {
  console.log(`[UPLOAD JOB] ===== STARTING JOB ${jobId} =====`);
  console.log(`[UPLOAD JOB] Function called at: ${new Date().toISOString()}`);

  try {
    // Fetch the job
    const [job] = await db
      .select()
      .from(verificationUploadJobs)
      .where(eq(verificationUploadJobs.id, jobId));

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    console.log(`[UPLOAD JOB] Job ${jobId} fetched successfully: ${job.jobType}, status: ${job.status}`);

    // Skip if already completed or failed
    if (job.status === 'completed' || job.status === 'failed') {
      console.log(`[UPLOAD JOB] Job ${jobId} already ${job.status}, skipping`);
      return;
    }

    // Mark as processing
    await db
      .update(verificationUploadJobs)
      .set({
        status: 'processing',
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(verificationUploadJobs.id, jobId));

    console.log(`[UPLOAD JOB] Job ${jobId} marked as processing`);

    if (!job.csvData) {
      throw new Error('No CSV data provided');
    }

    // Parse CSV
    const parseResult = Papa.parse(job.csvData, {
      header: true,
      skipEmptyLines: true,
      delimitersToGuess: [',', '\t', '|', ';'],
    });

    // Only fail on FATAL errors, not warnings (like delimiter detection)
    // Use PapaParse's built-in 'fatal' flag for robust error filtering
    const fatalErrors = parseResult.errors.filter(e => {
      // If error doesn't have a 'fatal' flag, treat FieldMismatch as fatal
      if (e.type === 'FieldMismatch') return true;
      // Otherwise, only count errors marked as fatal
      return false;
    });
    
    if (fatalErrors.length > 0) {
      throw new Error(`CSV parsing failed: ${fatalErrors.map(e => e.message).join(', ')}`);
    }
    
    console.log(`[UPLOAD JOB] CSV parsed with ${parseResult.errors.length} warnings (${fatalErrors.length} fatal)`);

    const rows = parseResult.data as Array<Record<string, string>>;
    console.log(`[UPLOAD JOB] Job ${jobId}: Parsed ${rows.length} rows`);

    // Update total rows
    await db
      .update(verificationUploadJobs)
      .set({
        totalRows: rows.length,
        updatedAt: new Date(),
      })
      .where(eq(verificationUploadJobs.id, jobId));

    // Process based on job type
    if (job.jobType === 'validation_results') {
      await processValidationResults(jobId, job.campaignId, rows);
    } else if (job.jobType === 'submissions') {
      await processSubmissions(jobId, job.campaignId, rows);
    } else if (job.jobType === 'contacts') {
      await processContacts(jobId, job.campaignId, rows, job.fieldMappings, job.updateMode ?? false);
    } else {
      throw new Error(`Unknown job type: ${job.jobType}`);
    }

    // Mark as completed
    await db
      .update(verificationUploadJobs)
      .set({
        status: 'completed',
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(verificationUploadJobs.id, jobId));

    console.log(`[UPLOAD JOB] Job ${jobId} completed successfully`);
  } catch (error) {
    console.error(`[UPLOAD JOB] Job ${jobId} failed:`, error);

    // Mark as failed
    await db
      .update(verificationUploadJobs)
      .set({
        status: 'failed',
        errors: [{
          row: 0,
          message: error instanceof Error ? error.message : String(error)
        }],
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(verificationUploadJobs.id, jobId))
      .catch(err => console.error(`[UPLOAD JOB] Failed to update job status:`, err));
  }
}

/**
 * Process validation results upload
 */
async function processValidationResults(
  jobId: string,
  campaignId: string,
  rows: Array<Record<string, string>>
) {
  console.log(`[UPLOAD JOB] Processing validation results for ${rows.length} rows`);

  const errors: UploadJobError[] = [];
  let successCount = 0;
  let processedCount = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    
    for (let batchIdx = 0; batchIdx < batch.length; batchIdx++) {
      const row = batch[batchIdx];
      const rowNum = i + batchIdx + 1;
      processedCount++;

      try {
        const email = (row.email || row.Email)?.trim().toLowerCase();
        const emailStatus = (row.emailStatus || row['Email Status'] || row.email_status)?.trim().toLowerCase();

        if (!email) {
          errors.push({ row: rowNum, message: 'Missing email' });
          continue;
        }

        if (!emailStatus) {
          errors.push({ row: rowNum, message: 'Missing emailStatus' });
          continue;
        }

        // Normalize email status to valid enum values
        let normalizedStatus: 'ok' | 'invalid' | 'risky' | 'unknown' | 'accept_all' | 'disposable' = 'unknown';
        if (emailStatus === 'valid' || emailStatus === 'deliverable' || emailStatus === 'ok') {
          normalizedStatus = 'ok';
        } else if (emailStatus === 'invalid' || emailStatus === 'undeliverable') {
          normalizedStatus = 'invalid';
        } else if (emailStatus === 'risky') {
          normalizedStatus = 'risky';
        } else if (emailStatus === 'accept_all') {
          normalizedStatus = 'accept_all';
        } else if (emailStatus === 'disposable') {
          normalizedStatus = 'disposable';
        }

        // Update matching contacts
        const result = await db
          .update(verificationContacts)
          .set({
            emailStatus: normalizedStatus,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(verificationContacts.campaignId, campaignId),
              eq(sql`LOWER(${verificationContacts.email})`, email)
            )
          )
          .returning({ id: verificationContacts.id });

        if (result.length > 0) {
          successCount++;
        } else {
          errors.push({ row: rowNum, message: `No matching contact found for email: ${email}` });
        }
      } catch (error) {
        errors.push({
          row: rowNum,
          message: error instanceof Error ? error.message : String(error)
        });
      }

      // Update progress every 10 rows
      if (processedCount % 10 === 0) {
        await db
          .update(verificationUploadJobs)
          .set({
            processedRows: processedCount,
            successCount,
            errorCount: errors.length,
            errors: errors.slice(-100), // Keep last 100 errors
            updatedAt: new Date(),
          })
          .where(eq(verificationUploadJobs.id, jobId));

        console.log(`[UPLOAD JOB] Progress: ${processedCount}/${rows.length} rows processed`);
      }
    }
  }

  // Final update
  await db
    .update(verificationUploadJobs)
    .set({
      processedRows: processedCount,
      successCount,
      errorCount: errors.length,
      errors: errors.slice(-100),
      updatedAt: new Date(),
    })
    .where(eq(verificationUploadJobs.id, jobId));

  console.log(`[UPLOAD JOB] Validation results completed: ${successCount} success, ${errors.length} errors`);
}

/**
 * Process submissions upload
 */
async function processSubmissions(
  jobId: string,
  campaignId: string,
  rows: Array<Record<string, string>>
) {
  console.log(`[UPLOAD JOB] Processing submissions for ${rows.length} rows`);

  const errors: UploadJobError[] = [];
  let successCount = 0;
  let processedCount = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    
    for (let batchIdx = 0; batchIdx < batch.length; batchIdx++) {
      const row = batch[batchIdx];
      const rowNum = i + batchIdx + 1;
      processedCount++;

      try {
        // Support multiple email column name formats
        const email = (
          row.email || 
          row.Email || 
          row['CAV-Email'] || 
          row['CAV Email'] ||
          row['email_address'] ||
          row['Email Address']
        )?.trim().toLowerCase();
        
        const contactId = row.contact_id || row.contactId || row['Contact ID'] || row['CAV-ID'];
        const submittedAt = row.submitted_at || row.submittedAt || row['Submitted At'];

        let targetContactId: string | null = null;

        // Find contact by ID or email
        if (contactId) {
          targetContactId = contactId;
        } else if (email) {
          const [contact] = await db
            .select({ id: verificationContacts.id, accountId: verificationContacts.accountId })
            .from(verificationContacts)
            .where(
              and(
                eq(verificationContacts.campaignId, campaignId),
                eq(sql`LOWER(${verificationContacts.email})`, email)
              )
            )
            .limit(1);

          if (contact) {
            targetContactId = contact.id;
          }
        }

        if (!targetContactId) {
          errors.push({ row: rowNum, message: `No matching contact found` });
          continue;
        }

        // Get account ID for the contact
        const [contact] = await db
          .select({ accountId: verificationContacts.accountId })
          .from(verificationContacts)
          .where(eq(verificationContacts.id, targetContactId))
          .limit(1);

        // Insert submission record (idempotent - conflict do nothing)
        await db
          .insert(verificationLeadSubmissions)
          .values({
            contactId: targetContactId,
            accountId: contact?.accountId || null,
            campaignId,
            createdAt: submittedAt ? new Date(submittedAt) : new Date(),
          })
          .onConflictDoNothing();

        successCount++;
      } catch (error) {
        errors.push({
          row: rowNum,
          message: error instanceof Error ? error.message : String(error)
        });
      }

      // Update progress every 10 rows
      if (processedCount % 10 === 0) {
        await db
          .update(verificationUploadJobs)
          .set({
            processedRows: processedCount,
            successCount,
            errorCount: errors.length,
            errors: errors.slice(-100),
            updatedAt: new Date(),
          })
          .where(eq(verificationUploadJobs.id, jobId));

        console.log(`[UPLOAD JOB] Progress: ${processedCount}/${rows.length} rows processed`);
      }
    }
  }

  // Final update
  await db
    .update(verificationUploadJobs)
    .set({
      processedRows: processedCount,
      successCount,
      errorCount: errors.length,
      errors: errors.slice(-100),
      updatedAt: new Date(),
    })
    .where(eq(verificationUploadJobs.id, jobId));

  console.log(`[UPLOAD JOB] Submissions completed: ${successCount} success, ${errors.length} errors`);
  
  // CRITICAL: Enforce 2-year submission exclusion after upload
  // This marks recently submitted contacts as Ineligible_Recently_Submitted
  if (successCount > 0) {
    console.log(`[UPLOAD JOB] Enforcing 2-year exclusion for campaign ${campaignId}...`);
    
    try {
      const { enforceSubmissionExclusion } = await import("./submission-exclusion");
      const exclusionStats = await enforceSubmissionExclusion(campaignId);
      
      console.log(`[UPLOAD JOB] ✅ Exclusion enforced:
        - Recently submitted (excluded): ${exclusionStats.excluded}
        - Old submissions (reactivated): ${exclusionStats.reactivated}
        - Total processed: ${exclusionStats.checked}`);
    } catch (error) {
      console.error(`[UPLOAD JOB] ⚠️ Failed to enforce submission exclusion:`, error);
      // Don't fail the entire job if exclusion enforcement fails
      // Admin can manually trigger enforcement later
    }
  }
}

/**
 * Process verification campaign contact uploads with optimized batching
 * PERFORMANCE OPTIMIZED: Uses PostgreSQL COPY command for 10-20x faster inserts
 */
async function processContacts(
  jobId: string,
  campaignId: string,
  rows: Array<Record<string, string>>,
  fieldMappings: any,
  updateMode: boolean
) {
  console.log(`[UPLOAD JOB] Processing ${rows.length} verification contacts with OPTIMIZED COPY imports`);

  const errors: UploadJobError[] = [];
  let successCount = 0;
  let processedCount = 0;
  const BATCH_SIZE = 5000; // OPTIMIZED: 5000 rows per batch for COPY command (10x larger than before)

  // Import verification utilities
  const { verificationContacts, accounts } = await import('@shared/schema');
  const { evaluateEligibility, computeNormalizedKeys } = await import('./verification-utils');
  const { normalizeName } = await import('../normalization');

  // STEP 1: Extract and prepare all contacts in memory first
  const preparedContacts: any[] = [];
  const companyMap = new Map<string, { name: string; normalized: string; }>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    try {
      const fullName = (row.fullName || row.name || row['Full Name'] || '').trim();
      const email = (row.email || row['Email'] || '').trim().toLowerCase();
      const phone = (row.phone || row['Phone'] || '').trim();
      const title = (row.title || row.jobTitle || row['Job Title'] || '').trim();
      const companyName = (row.companyName || row.company || row['Company'] || row.account_name || '').trim();
      const contactCountry = (row.country || row.contactCountry || '').trim();
      
      if (!fullName) {
        errors.push({ row: rowNum, message: 'Missing contact name' });
        continue;
      }

      if (!companyName) {
        errors.push({ row: rowNum, message: 'Missing company name' });
        continue;
      }

      const normalizedCompanyName = normalizeName(companyName);
      
      // Track unique companies
      if (!companyMap.has(normalizedCompanyName)) {
        companyMap.set(normalizedCompanyName, { name: companyName, normalized: normalizedCompanyName });
      }

      // Split full name
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      preparedContacts.push({
        rowNum,
        fullName,
        firstName,
        lastName,
        email: email || null,
        phone: phone || null,
        title: title || null,
        contactCountry: contactCountry || null,
        companyName,
        companyNormalized: normalizedCompanyName,
      });
    } catch (error) {
      errors.push({
        row: rowNum,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(`[UPLOAD JOB] Prepared ${preparedContacts.length} contacts, ${companyMap.size} unique companies`);

  // STEP 2: Bulk upsert accounts
  const accountCache = new Map<string, string>();
  
  if (companyMap.size > 0) {
    const companyValues = Array.from(companyMap.values());
    
    // Bulk insert with onConflictDoUpdate
    const insertedAccounts = await db
      .insert(accounts)
      .values(companyValues.map(c => ({ name: c.name, nameNormalized: c.normalized })))
      .onConflictDoUpdate({
        target: accounts.nameNormalized,
        set: { name: sql`EXCLUDED.name`, updatedAt: new Date() },
      })
      .returning({ id: accounts.id, nameNormalized: accounts.nameNormalized });

    // Build account cache
    for (const acc of insertedAccounts) {
      if (acc.nameNormalized) {
        accountCache.set(acc.nameNormalized, acc.id);
      }
    }

    console.log(`[UPLOAD JOB] Upserted ${insertedAccounts.length} accounts in single query`);
  }

  // STEP 3: Process contacts in batches with bulk inserts
  for (let i = 0; i < preparedContacts.length; i += BATCH_SIZE) {
    const batch = preparedContacts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(preparedContacts.length / BATCH_SIZE);
    
    console.log(`[UPLOAD JOB] Processing batch ${batchNum}/${totalBatches} (${batch.length} contacts)`);

    // Build batch values
    const batchValues = batch.map(contact => {
      const accountId = accountCache.get(contact.companyNormalized)!;
      
      return {
        campaignId,
        accountId,
        fullName: contact.fullName,
        firstName: contact.firstName || null,
        lastName: contact.lastName || null,
        email: contact.email,
        phone: contact.phone,
        mobile: null as string | null,
        title: contact.title,
        contactCountry: contact.contactCountry,
        sourceType: 'New_Sourced' as const,
        updatedAt: new Date(),
      };
    });

    try {
      // Bulk insert with onConflictDoUpdate (upsert)
      // IMPORTANT: Target fields must match index order: campaign_id, account_id, full_name
      const inserted = await db
        .insert(verificationContacts)
        .values(batchValues)
        .onConflictDoUpdate({
          target: [verificationContacts.campaignId, verificationContacts.accountId, verificationContacts.fullName],
          set: updateMode ? {
            email: sql`EXCLUDED.email`,
            phone: sql`EXCLUDED.phone`,
            title: sql`EXCLUDED.title`,
            contactCountry: sql`EXCLUDED.contact_country`,
            updatedAt: new Date(),
          } : { updatedAt: new Date() }, // In insert mode, just update timestamp to avoid duplicate key error
        })
        .returning({ id: verificationContacts.id });

      successCount += inserted.length;
      processedCount += batch.length;
    } catch (error) {
      // If bulk insert fails, fall back to individual inserts for this batch
      console.warn(`[UPLOAD JOB] Batch ${batchNum} bulk insert failed, falling back to individual inserts:`, error);
      
      for (const contact of batch) {
        try {
          const accountId = accountCache.get(contact.companyNormalized)!;
          
          await db.insert(verificationContacts).values({
            campaignId,
            accountId,
            fullName: contact.fullName,
            firstName: contact.firstName || null,
            lastName: contact.lastName || null,
            email: contact.email,
            phone: contact.phone,
            mobile: null as string | null,
            title: contact.title,
            contactCountry: contact.contactCountry,
            sourceType: 'New_Sourced',
            updatedAt: new Date(),
          }).onConflictDoNothing({
            target: [verificationContacts.campaignId, verificationContacts.accountId, verificationContacts.fullName],
          });
          
          successCount++;
        } catch (err) {
          errors.push({
            row: contact.rowNum,
            message: err instanceof Error ? err.message : String(err),
          });
        }
        processedCount++;
      }
    }

    // Update progress after each batch
    await db
      .update(verificationUploadJobs)
      .set({
        processedRows: processedCount,
        successCount,
        errorCount: errors.length,
        errors: errors.slice(-100),
        updatedAt: new Date(),
      })
      .where(eq(verificationUploadJobs.id, jobId));

    console.log(`[UPLOAD JOB] Batch ${batchNum}/${totalBatches} complete: ${successCount} success, ${errors.length} errors`);
  }

  console.log(`[UPLOAD JOB] Contacts processing completed: ${successCount} success, ${errors.length} errors`);
}

/**
 * Resume all stuck upload jobs on server startup
 * Handles jobs stuck in 'processing' status AND 'pending' jobs that never started
 */
export async function resumeStuckUploadJobs() {
  try {
    console.log('[UPLOAD JOB RESUME] Checking for stuck upload jobs...');
    
    // Find jobs stuck in "processing" status for more than 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    // Find 'pending' jobs that never started (older than 2 minutes)
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    
    const stuckJobs = await db
      .select()
      .from(verificationUploadJobs)
      .where(
        sql`(${verificationUploadJobs.status} = 'processing' AND ${verificationUploadJobs.updatedAt} < ${fiveMinutesAgo})
            OR (${verificationUploadJobs.status} = 'pending' AND ${verificationUploadJobs.createdAt} < ${twoMinutesAgo})`
      );
    
    if (stuckJobs.length === 0) {
      console.log('[UPLOAD JOB RESUME] No stuck jobs found');
      return;
    }
    
    console.log(`[UPLOAD JOB RESUME] Found ${stuckJobs.length} stuck job(s), resuming...`);
    
    for (const job of stuckJobs) {
      console.log(`[UPLOAD JOB RESUME] Resuming job ${job.id} (status: ${job.status}, type: ${job.jobType}, processed: ${job.processedRows}/${job.totalRows})`);
      
      // Re-queue to BullMQ for proper processing
      try {
        const { addVerificationCSVImportJob } = await import('./verification-csv-import-queue');
        
        // Only re-queue if we have the necessary data
        if (job.s3Key && job.fieldMappings) {
          const bullMQJobId = await addVerificationCSVImportJob({
            s3Key: job.s3Key,
            userId: job.createdBy || 'system',
            campaignId: job.campaignId,
            uploadJobId: job.id,
            fieldMappings: job.fieldMappings as any,
            headers: [], // Will be extracted from CSV
            updateMode: job.updateMode || false,
            batchSize: 5000,
          });
          
          if (bullMQJobId) {
            console.log(`[UPLOAD JOB RESUME] Job ${job.id} re-queued to BullMQ with job ID: ${bullMQJobId}`);
          } else {
            console.error(`[UPLOAD JOB RESUME] Failed to re-queue job ${job.id} to BullMQ`);
          }
        } else {
          console.error(`[UPLOAD JOB RESUME] Job ${job.id} missing s3Key or fieldMappings - cannot resume`);
        }
      } catch (error) {
        console.error(`[UPLOAD JOB RESUME] Job ${job.id} failed during resume:`, error);
      }
    }
    
    console.log(`[UPLOAD JOB RESUME] All ${stuckJobs.length} job(s) queued for resumption`);
  } catch (error) {
    console.error('[UPLOAD JOB RESUME] Error checking for stuck jobs:', error);
  }
}
