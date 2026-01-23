/**
 * Contacts CSV Import Worker
 * 
 * Streams CSV files from S3 and performs batched inserts into the main contacts table.
 * Designed for high-volume imports without loading entire files into memory.
 */

import { Job } from 'bullmq';
import { parse } from 'fast-csv';
import { Readable, Transform } from 'stream';
import { createGunzip } from 'zlib';
import { workerDb } from '../db'; // Use dedicated worker pool
import { contacts, accounts } from '../../shared/schema';
import { streamFromS3 } from '../lib/storage';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { normalizeName } from '../normalization';
import { from as copyFrom } from 'pg-copy-streams';
import { pipeline } from 'stream/promises';

/**
 * Contacts CSV Import Job Data
 */
export interface ContactsCSVImportJobData {
  s3Key: string;                    // S3 key to the CSV file
  userId: string;                   // User who initiated the import
  campaignId?: string;              // Optional: Verification campaign ID to assign contacts to
  isUnifiedFormat: boolean;         // Whether CSV includes account data
  fieldMappings: Array<{            // Field mapping from CSV to DB
    csvColumn: string;
    targetField: string;
    targetEntity: 'contact' | 'account';
  }>;
  headers: string[];                // Original CSV headers
  batchSize?: number;               // Number of rows to insert per batch (default: 10000 for COPY)
  useOptimizedCopy?: boolean;       // Use PostgreSQL COPY command (default: true)
  parallelBatches?: number;         // Number of batches to process in parallel (default: 3)
}

/**
 * Contacts CSV Import Job Result
 */
export interface ContactsCSVImportJobResult {
  success: boolean;
  totalRows: number;
  successRows: number;
  createdRows: number;
  updatedRows: number;
  failedRows: number;
  errors: Array<{ row: number; message: string }>;
  duration: number;
}

/**
 * OPTIMIZED: Process batch using PostgreSQL COPY command (10-100x faster than INSERT)
 * Uses pg-copy-streams for direct streaming to PostgreSQL
 */
async function processBatchWithCOPY(
  records: any[],
  accountCache: Map<string, string>,
  isUnifiedFormat: boolean
): Promise<{ created: number; updated: number; failed: number; missingEmail: number; duplicateEmail: number }> {
  if (records.length === 0) {
    return { created: 0, updated: 0, failed: 0, missingEmail: 0, duplicateEmail: 0 };
  }

  const result = { created: 0, updated: 0, failed: 0, missingEmail: 0, duplicateEmail: 0 };
  const newCacheEntries = new Map<string, string>();

  // Get raw pg client for entire transaction (accounts + contacts)
  const { workerPool } = await import('../db');
  const pgClient = await workerPool.connect();

  try {
    await pgClient.query('BEGIN');

    // STEP 1: Handle accounts - ALL operations in single transaction for atomicity
    const uniqueAccounts = new Map<string, any>();
    
    if (isUnifiedFormat) {
      for (const record of records) {
        if (record.account?.name) {
          const normalizedName = normalizeName(record.account.name);
          if (normalizedName && !accountCache.has(normalizedName) && !uniqueAccounts.has(normalizedName)) {
            // Use same pattern as legacy: spread ALL account fields
            uniqueAccounts.set(normalizedName, {
              name: record.account.name,
              nameNormalized: normalizedName,
              website: record.account.website || null,
              industry: record.account.industry || null,
              ...record.account, // Preserve ALL fields (50+ fields in accounts schema)
            });
          }
        }
      }

      if (uniqueAccounts.size > 0) {
        const normalizedNames = Array.from(uniqueAccounts.keys());
        
        // Check existing accounts using raw pg client (within same transaction)
        const existingResult = await pgClient.query(
          `SELECT id, name_normalized FROM accounts WHERE name_normalized = ANY($1)`,
          [normalizedNames]
        );
        
        for (const row of existingResult.rows) {
          newCacheEntries.set(row.name_normalized, row.id);
          uniqueAccounts.delete(row.name_normalized);
        }

        // Insert new accounts using BATCHED SQL (10-100x faster than row-by-row)
        // Convert camelCase to snake_case for PostgreSQL column names
        // Handles acronyms correctly: leadQAOwner → lead_qa_owner (not lead_q_a_owner)
        const toSnakeCase = (str: string): string => {
          return str
            // Insert underscore before uppercase letters that follow lowercase letters or numbers
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
            // Insert underscore before uppercase letter that is followed by lowercase (for acronyms)
            .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
            .toLowerCase();
        };
        
        if (uniqueAccounts.size > 0) {
          // PERFORMANCE FIX: Batch all account inserts into a single SQL statement
          // Previous row-by-row approach was causing 2-hour upload times for 20k contacts
          
          // Collect ALL fields across all accounts (account schema has 50+ fields)
          const allFieldsSet = new Set<string>();
          for (const accountData of uniqueAccounts.values()) {
            Object.keys(accountData).forEach(key => {
              if (key !== 'id' && key !== 'createdAt' && key !== 'updatedAt') {
                allFieldsSet.add(key);
              }
            });
          }
          
          const jsFields = Array.from(allFieldsSet);
          const dbFields = jsFields.map(toSnakeCase);
          
          // Build arrays for UNNEST (one array per field)
          const fieldArrays: any[][] = jsFields.map(() => []);
          const accountsArray = Array.from(uniqueAccounts.values());
          
          for (const accountData of accountsArray) {
            jsFields.forEach((field, idx) => {
              fieldArrays[idx].push(accountData[field] ?? null);
            });
          }
          
          // Build UNNEST query with proper parameterization
          // UNNEST with multiple arrays runs them in parallel (row-wise)
          const unnestCalls = fieldArrays.map((_, i) => `unnest($${i + 1}::text[])`);
          const unnestSelect = dbFields.map((field, i) => `${unnestCalls[i]} AS ${field}`);
          
          const insertResult = await pgClient.query(
            `INSERT INTO accounts (${dbFields.join(', ')})
            SELECT ${unnestSelect.join(', ')}
            ON CONFLICT (name_normalized) DO UPDATE SET name = EXCLUDED.name
            RETURNING id, name_normalized`,
            fieldArrays
          );
          
          // Cache all newly inserted/updated accounts
          for (const row of insertResult.rows) {
            newCacheEntries.set(row.name_normalized, row.id);
          }
        }
      }
    }

    // STEP 2: Prepare contacts for COPY (with surrogate ID for deduplication)
    const uniqueContacts = new Map<string, any>();
    const { randomUUID } = await import('crypto');
    
    for (const record of records) {
      let accountId: string | null = null;

      if (isUnifiedFormat && record.account?.name) {
        const normalizedAccountName = normalizeName(record.account.name);
        if (normalizedAccountName) {
          accountId = accountCache.get(normalizedAccountName) || 
                     newCacheEntries.get(normalizedAccountName) || 
                     null;
        }
      }

      const contactData = {
        ...record.contact,
        accountId,
        emailNormalized: record.contact.email?.toLowerCase().trim() || null,
      };

      // Generate surrogate ID for deduplication: email_normalized if present, otherwise UUID
      const surrogateId = contactData.emailNormalized || randomUUID();
      
      // Track missing emails
      if (!contactData.email || !contactData.emailNormalized) {
        result.missingEmail++;
      }
      
      // Track duplicate emails (when same email appears multiple times in batch)
      if (contactData.emailNormalized && uniqueContacts.has(surrogateId)) {
        result.duplicateEmail++;
      }
      
      // Always include contact (even without email)
      uniqueContacts.set(surrogateId, {
        ...contactData,
        surrogateId, // Store for later use in COPY
      });
    }

    // STEP 3: Use PostgreSQL COPY for ultra-fast bulk insert (same transaction)
    const contactsArray = Array.from(uniqueContacts.values());
    
    if (contactsArray.length > 0) {
      // Create temp table (within same transaction)
      await pgClient.query(`
        CREATE TEMP TABLE temp_contacts_import (
          email text,
          email_normalized text,
          full_name text,
          first_name text,
          last_name text,
          job_title text,
          direct_phone text,
          direct_phone_e164 text,
          phone_extension text,
          account_id varchar(255)
        ) ON COMMIT DROP
      `);

      // Use COPY command for high-speed bulk insert
      const copyStream = pgClient.query(
        copyFrom('COPY temp_contacts_import FROM STDIN WITH (FORMAT csv, DELIMITER \',\', NULL \'\\N\')')
      );

      // Build CSV data
      const csvData = contactsArray.map(c => {
        const escape = (val: any) => {
          if (val === null || val === undefined) return '\\N';
          const str = String(val).replace(/\\/g, '\\\\').replace(/"/g, '""');
          return `"${str}"`;
        };
        
        return [
          escape(c.email),
          escape(c.emailNormalized),
          escape(c.fullName),
          escape(c.firstName),
          escape(c.lastName),
          escape(c.jobTitle),
          escape(c.directPhone),
          escape(c.directPhoneE164),
          escape(c.phoneExtension),
          escape(c.accountId),
        ].join(',');
      }).join('\n') + '\n';

      // Stream to COPY
      await new Promise((resolve, reject) => {
        copyStream.on('finish', resolve);
        copyStream.on('error', reject);
        copyStream.write(csvData);
        copyStream.end();
      });

      // Merge from temp table into main contacts table
      // Split into two operations:
      // 1. Contacts WITH emails - use upsert (ON CONFLICT)
      // 2. Contacts WITHOUT emails - simple insert (no conflict possible)
      
      // PART 1: Upsert contacts with emails
      const upsertResult = await pgClient.query(`
        INSERT INTO contacts (
          email, email_normalized, full_name, first_name, last_name,
          job_title, direct_phone, direct_phone_e164, phone_extension, account_id,
          created_at, updated_at
        )
        SELECT
          email, email_normalized, full_name, first_name, last_name,
          job_title, direct_phone, direct_phone_e164, phone_extension, account_id,
          NOW(), NOW()
        FROM temp_contacts_import
        WHERE email_normalized IS NOT NULL
        ON CONFLICT (email_normalized)
        DO UPDATE SET
          full_name = EXCLUDED.full_name,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          job_title = EXCLUDED.job_title,
          direct_phone = EXCLUDED.direct_phone,
          direct_phone_e164 = EXCLUDED.direct_phone_e164,
          phone_extension = EXCLUDED.phone_extension,
          account_id = EXCLUDED.account_id,
          updated_at = NOW()
        RETURNING id, (xmax = 0) as is_new
      `);

      // Count created vs updated for contacts with emails
      for (const row of upsertResult.rows) {
        if (row.is_new) {
          result.created++;
        } else {
          result.updated++;
        }
      }
      
      // PART 2: Insert contacts without emails (always new, no conflict)
      const insertNoEmailResult = await pgClient.query(`
        INSERT INTO contacts (
          email, email_normalized, full_name, first_name, last_name,
          job_title, direct_phone, direct_phone_e164, phone_extension, account_id,
          created_at, updated_at
        )
        SELECT
          email, email_normalized, full_name, first_name, last_name,
          job_title, direct_phone, direct_phone_e164, phone_extension, account_id,
          NOW(), NOW()
        FROM temp_contacts_import
        WHERE email_normalized IS NULL
        RETURNING id
      `);
      
      // All contacts without emails are new
      result.created += insertNoEmailResult.rows.length;
    }

    // Transaction successful - commit everything (accounts + contacts)
    await pgClient.query('COMMIT');

    // Commit cache entries on success
    for (const [name, id] of newCacheEntries) {
      accountCache.set(name, id);
    }
  } catch (error) {
    // Rollback entire transaction (accounts + contacts) on any error
    await pgClient.query('ROLLBACK');
    console.error('[COPY] Batch failed (rolled back accounts + contacts):', error);
    result.failed = records.length;
    throw error;
  } finally {
    pgClient.release();
  }

  return result;
}

/**
 * Contacts CSV Import Worker Processor
 * Streams CSV from S3 and performs batched Postgres inserts
 */
export async function processContactsCSVImport(
  job: Job<ContactsCSVImportJobData>
): Promise<ContactsCSVImportJobResult> {
  const startTime = Date.now();
  const { 
    s3Key, 
    userId, 
    isUnifiedFormat, 
    fieldMappings, 
    headers, 
    batchSize = 10000,
    useOptimizedCopy = true,
    parallelBatches = 3
  } = job.data;

  const isGzipped = s3Key.endsWith('.gz');

  console.log(`[ContactsCSVImportWorker] ========================================`);
  console.log(`[ContactsCSVImportWorker] Starting import job ${job.id}`);
  console.log(`[ContactsCSVImportWorker] S3 Key: ${s3Key}`);
  console.log(`[ContactsCSVImportWorker] User: ${userId}`);
  console.log(`[ContactsCSVImportWorker] Unified Format: ${isUnifiedFormat}`);
  console.log(`[ContactsCSVImportWorker] Batch size: ${batchSize}`);
  console.log(`[ContactsCSVImportWorker] Optimized COPY: ${useOptimizedCopy ? 'ENABLED ⚡' : 'disabled'}`);
  console.log(`[ContactsCSVImportWorker] Parallel batches: ${parallelBatches}`);
  console.log(`[ContactsCSVImportWorker] Compression: ${isGzipped ? 'GZIP ✓' : 'none'}`);

  // Stats tracking
  let totalRows = 0;
  let successRows = 0;
  let createdRows = 0;
  let updatedRows = 0;
  let failedRows = 0;
  let missingEmailRows = 0; // NEW: Track contacts without emails
  let duplicateEmailRows = 0; // NEW: Track duplicate emails within batches
  const errors: Array<{ row: number; message: string }> = [];

  // Performance tracking
  let batchesProcessed = 0;
  let totalBatchTime = 0;

  // Batch buffer for inserts
  let batch: any[] = [];

  // Account lookup cache
  const accountCache = new Map<string, string>(); // normalized name -> account ID

  /**
   * Process a single batch of records - Routes to optimized COPY or legacy INSERT method
   */
  async function processBatch(records: any[]): Promise<void> {
    if (records.length === 0) return;

    const batchStartTime = Date.now();
    batchesProcessed++;

    let batchResults = {
      created: 0,
      updated: 0,
      failed: 0,
      missingEmail: 0,
      duplicateEmail: 0,
    };

    try {
      // Use optimized COPY command if enabled
      if (useOptimizedCopy) {
        batchResults = await processBatchWithCOPY(records, accountCache, isUnifiedFormat);
        createdRows += batchResults.created;
        updatedRows += batchResults.updated;
        failedRows += batchResults.failed;
        missingEmailRows += batchResults.missingEmail; // NEW: Track missing emails
        duplicateEmailRows += batchResults.duplicateEmail; // NEW: Track duplicates
        successRows += batchResults.created + batchResults.updated;
      } else {
        // Fall back to legacy INSERT method
        await processBatchLegacy(records);
      }

      // Track batch performance
      const batchDuration = Date.now() - batchStartTime;
      totalBatchTime += batchDuration;
      const avgBatchTime = totalBatchTime / batchesProcessed;

      // Log detailed progress every 10 batches for monitoring
      if (batchesProcessed % 10 === 0) {
        console.log(`[ContactsCSVImportWorker] Progress: ${batchesProcessed} batches | ${totalRows} rows processed | Avg batch time: ${avgBatchTime.toFixed(0)}ms | Current: ${batchDuration}ms`);
        console.log(`[ContactsCSVImportWorker] Stats: ${createdRows} created, ${updatedRows} updated, ${failedRows} failed | Account cache: ${accountCache.size} entries`);
        console.log(`[ContactsCSVImportWorker] Data Quality: ${missingEmailRows} missing emails, ${duplicateEmailRows} duplicate emails`);
        
        // Update job progress with comprehensive metrics
        await job.updateProgress({
          totalRows,
          successRows,
          createdRows,
          updatedRows,
          failedRows,
          missingEmailRows,
          duplicateEmailRows,
          batchesProcessed,
          accountCacheSize: accountCache.size,
        });
      } else {
        console.log(`[ContactsCSVImportWorker] Batch ${batchesProcessed}: ${batchResults.created} created, ${batchResults.updated} updated, ${batchResults.failed} failed, ${batchResults.missingEmail} missing emails, ${batchResults.duplicateEmail} duplicates (${batchDuration}ms)`);
      }
    } catch (error) {
      console.error(`[ContactsCSVImportWorker] Batch failed:`, error);
      failedRows += records.length;
      errors.push({
        row: 0,
        message: `Batch transaction failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  /**
   * LEGACY: Process batch using manual SQL INSERT (kept for fallback)
   */
  async function processBatchLegacy(records: any[]): Promise<void> {
    const batchResults = {
      created: 0,
      updated: 0,
      failed: 0,
    };

    // Prepare contacts list (needed for error handling scope)
    let contactsToUpsert: any[] = [];
    
    // Track new account cache entries (only commit to global cache after transaction succeeds)
    const newCacheEntries = new Map<string, string>();

    // OPTIMIZATION: Wrap entire batch in a transaction for atomicity and performance
    // Uses dedicated worker pool to prevent exhausting API server connections
    try {
      await workerDb.transaction(async (tx) => {
        // STEP 1: Deduplicate and bulk insert/lookup accounts
        const uniqueAccounts = new Map<string, any>();
        
        if (isUnifiedFormat) {
          for (const record of records) {
            if (record.account && record.account.name) {
              const normalizedName = normalizeName(record.account.name);
              // Deduplicate within batch and skip if already cached
              if (normalizedName && !accountCache.has(normalizedName) && !uniqueAccounts.has(normalizedName)) {
                uniqueAccounts.set(normalizedName, {
                  name: record.account.name,
                  nameNormalized: normalizedName,
                  website: record.account.website || null,
                  industry: record.account.industry || null,
                  ...record.account,
                });
              }
            }
          }

          // Bulk lookup existing accounts using inArray (FIX: was using broken ANY() syntax)
          if (uniqueAccounts.size > 0) {
            const normalizedNames = Array.from(uniqueAccounts.keys());
            const existingAccounts = await tx
              .select()
              .from(accounts)
              .where(inArray(accounts.nameNormalized, normalizedNames));
            
            // Track existing accounts for this batch (don't modify global cache yet)
            for (const account of existingAccounts) {
              newCacheEntries.set(account.nameNormalized!, account.id);
              uniqueAccounts.delete(account.nameNormalized!);
            }

            // Bulk insert new accounts
            if (uniqueAccounts.size > 0) {
              const newAccounts = await tx
                .insert(accounts)
                .values(Array.from(uniqueAccounts.values()))
                .returning();
              
              // Track new accounts for this batch (don't modify global cache yet)
              for (const account of newAccounts) {
                newCacheEntries.set(account.nameNormalized!, account.id);
              }
            }
          }
        }

        // STEP 2: Deduplicate and prepare contacts for bulk upsert
        const uniqueContacts = new Map<string, any>(); // surrogate ID -> contact data
        const { randomUUID } = await import('crypto');
        let batchMissingEmails = 0;
        let batchDuplicateEmails = 0;
        
        for (const record of records) {
          try {
            let accountId: string | null = null;

            // Get account ID from cache OR new entries from this batch
            if (isUnifiedFormat && record.account && record.account.name) {
              const normalizedAccountName = normalizeName(record.account.name);
              if (normalizedAccountName) {
                accountId = accountCache.get(normalizedAccountName) || 
                           newCacheEntries.get(normalizedAccountName) || 
                           null;
              }
            }

            // Prepare contact data
            const contactData = {
              ...record.contact,
              accountId,
              emailNormalized: record.contact.email ? record.contact.email.toLowerCase().trim() : null,
            };

            // Generate surrogate ID for deduplication: email_normalized if present, otherwise UUID
            const surrogateId = contactData.emailNormalized || randomUUID();
            
            // Track missing emails (don't fail - this is normal for verification campaigns)
            if (!contactData.email || !contactData.emailNormalized) {
              batchMissingEmails++;
            }
            
            // Track duplicate emails (when same email appears multiple times in batch)
            if (contactData.emailNormalized && uniqueContacts.has(surrogateId)) {
              batchDuplicateEmails++;
            }
            
            // Always include contact (even without email)
            uniqueContacts.set(surrogateId, contactData);
          } catch (error) {
            console.error(`[ContactsCSVImportWorker] Error preparing row ${record.rowIndex}:`, error);
            errors.push({
              row: record.rowIndex,
              message: error instanceof Error ? error.message : String(error),
            });
            batchResults.failed++;
            failedRows++;
          }
        }
        
        // Track batch-level metrics
        missingEmailRows += batchMissingEmails;
        duplicateEmailRows += batchDuplicateEmails;

        contactsToUpsert = Array.from(uniqueContacts.values());

        // STEP 3: Optimized bulk upsert - split into two operations like COPY path
        // PART 1: Contacts WITH emails - upsert with ON CONFLICT
        const contactsWithEmail = contactsToUpsert.filter(c => c.emailNormalized);
        const contactsWithoutEmail = contactsToUpsert.filter(c => !c.emailNormalized);
        
        if (contactsWithEmail.length > 0) {
          // Build VALUES clause for contacts with emails
          const valueClauses = contactsWithEmail.map(c => 
            `(${[
              c.email ? `'${c.email.replace(/'/g, "''")}'` : 'NULL',
              c.emailNormalized ? `'${c.emailNormalized.replace(/'/g, "''")}'` : 'NULL',
              c.fullName ? `'${c.fullName.replace(/'/g, "''")}'` : 'NULL',
              c.firstName ? `'${c.firstName.replace(/'/g, "''")}'` : 'NULL',
              c.lastName ? `'${c.lastName.replace(/'/g, "''")}'` : 'NULL',
              c.jobTitle ? `'${c.jobTitle.replace(/'/g, "''")}'` : 'NULL',
              c.directPhone ? `'${c.directPhone.replace(/'/g, "''")}'` : 'NULL',
              c.directPhoneE164 ? `'${c.directPhoneE164.replace(/'/g, "''")}'` : 'NULL',
              c.phoneExtension ? `'${c.phoneExtension.replace(/'/g, "''")}'` : 'NULL',
              c.accountId ? `'${c.accountId}'` : 'NULL',
              'NOW()',
              'NOW()'
            ].join(', ')})`
          ).join(', ');

          // Perform bulk upsert for contacts with emails
          const upsertResults = await tx.execute(sql.raw(`
            INSERT INTO contacts (
              email, email_normalized, full_name, first_name, last_name, 
              job_title, direct_phone, direct_phone_e164, phone_extension, account_id,
              created_at, updated_at
            )
            VALUES ${valueClauses}
            ON CONFLICT (email_normalized) 
            DO UPDATE SET
              full_name = EXCLUDED.full_name,
              first_name = EXCLUDED.first_name,
              last_name = EXCLUDED.last_name,
              job_title = EXCLUDED.job_title,
              direct_phone = EXCLUDED.direct_phone,
              direct_phone_e164 = EXCLUDED.direct_phone_e164,
              phone_extension = EXCLUDED.phone_extension,
              account_id = EXCLUDED.account_id,
              updated_at = NOW()
            RETURNING id, (xmax = 0) as is_new
          `));

          // Count created vs updated using the is_new flag from xmax
          for (const row of upsertResults.rows as any[]) {
            if (row.is_new) {
              batchResults.created++;
            } else {
              batchResults.updated++;
            }
          }
          
          updatedRows += batchResults.updated;
          createdRows += batchResults.created;
          successRows += upsertResults.rowCount || 0;
        }
        
        // PART 2: Contacts WITHOUT emails - simple insert (always new, no conflict)
        if (contactsWithoutEmail.length > 0) {
          const valueClauses = contactsWithoutEmail.map(c => 
            `(${[
              'NULL', // email
              'NULL', // email_normalized
              c.fullName ? `'${c.fullName.replace(/'/g, "''")}'` : 'NULL',
              c.firstName ? `'${c.firstName.replace(/'/g, "''")}'` : 'NULL',
              c.lastName ? `'${c.lastName.replace(/'/g, "''")}'` : 'NULL',
              c.jobTitle ? `'${c.jobTitle.replace(/'/g, "''")}'` : 'NULL',
              c.directPhone ? `'${c.directPhone.replace(/'/g, "''")}'` : 'NULL',
              c.directPhoneE164 ? `'${c.directPhoneE164.replace(/'/g, "''")}'` : 'NULL',
              c.phoneExtension ? `'${c.phoneExtension.replace(/'/g, "''")}'` : 'NULL',
              c.accountId ? `'${c.accountId}'` : 'NULL',
              'NOW()',
              'NOW()'
            ].join(', ')})`
          ).join(', ');

          // Simple insert for contacts without emails (no conflict possible)
          const insertResults = await tx.execute(sql.raw(`
            INSERT INTO contacts (
              email, email_normalized, full_name, first_name, last_name, 
              job_title, direct_phone, direct_phone_e164, phone_extension, account_id,
              created_at, updated_at
            )
            VALUES ${valueClauses}
            RETURNING id
          `));

          // All contacts without emails are new
          batchResults.created += insertResults.rowCount || 0;
          createdRows += insertResults.rowCount || 0;
          successRows += insertResults.rowCount || 0;
        }
      });
      
      // Transaction succeeded! Commit new entries to global cache
      for (const [name, id] of newCacheEntries) {
        accountCache.set(name, id);
      }
      
      // Update tracking variables (logging is handled in processBatch wrapper)
      updatedRows += batchResults.updated;
      createdRows += batchResults.created;
      successRows += batchResults.created + batchResults.updated;
    } catch (error) {
      console.error(`[ContactsCSVImportWorker] Transaction failed:`, error);
      // DON'T commit cache entries on failure - they were rolled back
      if (newCacheEntries.size > 0) {
        console.warn(`[ContactsCSVImportWorker] Discarded ${newCacheEntries.size} cache entries due to rollback`);
      }
      // Only mark the valid contacts as failed (not those already marked as failed for missing email)
      const validContactsCount = contactsToUpsert.length;
      if (validContactsCount > 0) {
        failedRows += validContactsCount;
        errors.push({
          row: 0,
          message: `Batch transaction failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  }

  return new Promise(async (resolve, reject) => {
    let rowIndex = 0;
    let isProcessing = false; // Track if we're processing a batch
    
    let csvStream: Readable;
    try {
      let rawStream = await streamFromS3(s3Key);
      
      // OPTIMIZATION: Auto-decompress GZIP files for faster S3 transfer
      if (isGzipped) {
        const gunzip = createGunzip();
        csvStream = rawStream.pipe(gunzip);
        console.log('[ContactsCSVImportWorker] GZIP decompression active');
      } else {
        csvStream = rawStream;
      }
    } catch (error) {
      reject(new Error(`Failed to stream file from S3: ${s3Key}`));
      return;
    }

    // Create field mapping lookup
    const csvColumnIndexMap = new Map<string, number>();
    headers.forEach((header, idx) => {
      csvColumnIndexMap.set(header, idx);
    });

    const mappedHeaders = fieldMappings.map(m => {
      if (!m.targetField || !m.targetEntity) return "";
      return m.targetEntity === "account" ? `account_${m.targetField}` : m.targetField;
    });

    const parser = parse({ headers: true });
    
    parser
      .on('data', async (row: any) => {
        rowIndex++;
        totalRows++;

        try {
          // Map CSV row to target format
          const mappedRow: any = {};
          const mappedAccountRow: any = {};

          fieldMappings.forEach(mapping => {
            const value = row[mapping.csvColumn] || '';
            
            if (mapping.targetEntity === 'contact') {
              mappedRow[mapping.targetField] = value;
            } else if (mapping.targetEntity === 'account') {
              mappedAccountRow[mapping.targetField] = value;
            }
          });

          // Add to batch
          batch.push({
            contact: mappedRow,
            account: isUnifiedFormat ? mappedAccountRow : null,
            rowIndex: rowIndex + 1, // +1 for header row
          });

          // Process batch when it reaches batch size
          if (batch.length >= batchSize) {
            // OPTIMIZATION: Pause CSV stream while processing batch to prevent memory overflow
            isProcessing = true;
            parser.pause();
            
            const currentBatch = [...batch];
            batch = [];
            await processBatch(currentBatch);

            // Update progress
            await job.updateProgress({
              processed: totalRows,
              created: createdRows,
              updated: updatedRows,
              failed: failedRows,
              status: 'processing',
              percent: Math.floor((successRows / totalRows) * 100),
            });

            // Resume stream after batch is processed
            isProcessing = false;
            parser.resume();
          }
        } catch (error) {
          console.error(`[ContactsCSVImportWorker] Error parsing row ${rowIndex}:`, error);
          errors.push({
            row: rowIndex + 1,
            message: error instanceof Error ? error.message : String(error),
          });
          failedRows++;
        }
      })
      .on('end', async () => {
        try {
          // Process remaining batch
          if (batch.length > 0) {
            await processBatch(batch);
          }

          const duration = Date.now() - startTime;
          const avgBatchTime = batchesProcessed > 0 ? totalBatchTime / batchesProcessed : 0;
          const rowsPerSecond = duration > 0 ? (totalRows / (duration / 1000)).toFixed(0) : '0';

          const missingEmailPercent = totalRows > 0 ? ((missingEmailRows / totalRows) * 100).toFixed(1) : '0';
          const duplicateEmailPercent = totalRows > 0 ? ((duplicateEmailRows / totalRows) * 100).toFixed(1) : '0';

          console.log(`[ContactsCSVImportWorker] ========================================`);
          console.log(`[ContactsCSVImportWorker] IMPORT COMPLETED`);
          console.log(`[ContactsCSVImportWorker] Duration: ${(duration / 1000).toFixed(1)}s | Throughput: ${rowsPerSecond} rows/sec`);
          console.log(`[ContactsCSVImportWorker] Batches: ${batchesProcessed} | Avg batch time: ${avgBatchTime.toFixed(0)}ms`);
          console.log(`[ContactsCSVImportWorker] Total: ${totalRows}, Success: ${successRows}, Created: ${createdRows}, Updated: ${updatedRows}, Failed: ${failedRows}`);
          console.log(`[ContactsCSVImportWorker] Data Quality:`);
          console.log(`[ContactsCSVImportWorker]   - Missing emails: ${missingEmailRows} (${missingEmailPercent}%)`);
          console.log(`[ContactsCSVImportWorker]   - Duplicate emails: ${duplicateEmailRows} (${duplicateEmailPercent}%)`);
          
          // Log warnings for data quality issues
          if (missingEmailRows > 0) {
            console.warn(`[ContactsCSVImportWorker] ⚠️  WARNING: ${missingEmailRows} contacts imported without email addresses`);
            console.warn(`[ContactsCSVImportWorker]    This is normal for verification/telemarketing campaigns`);
          }
          if (duplicateEmailRows > 100) {
            console.warn(`[ContactsCSVImportWorker] ⚠️  WARNING: ${duplicateEmailRows} duplicate emails detected and deduplicated`);
          }
          
          console.log(`[ContactsCSVImportWorker] Account cache size: ${accountCache.size} entries`);
          console.log(`[ContactsCSVImportWorker] ========================================`);

          resolve({
            success: true,
            totalRows,
            successRows,
            createdRows,
            updatedRows,
            failedRows,
            errors,
            duration,
          });
        } catch (error) {
          console.error('[ContactsCSVImportWorker] Error in final batch:', error);
          reject(error);
        }
      })
      .on('error', (error) => {
        console.error('[ContactsCSVImportWorker] Stream error:', error);
        reject(error);
      });

    // Pipe stream to parser with backpressure handling
    csvStream.pipe(parser);
  });
}
