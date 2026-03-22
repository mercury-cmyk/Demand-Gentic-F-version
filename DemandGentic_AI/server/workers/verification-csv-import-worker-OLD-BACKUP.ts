/**
 * Verification CSV Import Worker
 * 
 * High-performance verification contact imports using PostgreSQL COPY command
 * Processes 10-20x faster than traditional INSERT statements
 */

import { Job } from 'bullmq';
import { parse } from 'fast-csv';
import { Readable, Transform } from 'stream';
import { createGunzip } from 'zlib';
import { workerDb } from '../db';
import { verificationContacts, accounts } from '../../shared/schema';
import { streamFromS3 } from '../lib/storage';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { normalizeName } from '../normalization';
import { from as copyFrom } from 'pg-copy-streams';
import { pipeline } from 'stream/promises';

/**
 * Verification CSV Import Job Data
 */
export interface VerificationCSVImportJobData {
  s3Key: string;                    // S3 key to the CSV file
  userId: string;                   // User who initiated the import
  campaignId: string;               // Verification campaign ID
  uploadJobId: string;              // verificationUploadJobs ID for progress tracking
  fieldMappings: Array;
  headers: string[];                // Original CSV headers
  updateMode: boolean;              // true = update existing, false = skip duplicates
  batchSize?: number;               // Number of rows per batch (default: 5000)
}

/**
 * Verification CSV Import Job Result
 */
export interface VerificationCSVImportJobResult {
  success: boolean;
  totalRows: number;
  successRows: number;
  createdRows: number;
  updatedRows: number;
  failedRows: number;
  errors: Array;
  duration: number;
}

/**
 * Process verification contacts using staging table + COPY for maximum performance
 */
async function processBatchWithStagingTable(
  records: any[],
  campaignId: string,
  updateMode: boolean,
  accountCache: Map
): Promise {
  if (records.length === 0) {
    return { created: 0, updated: 0, failed: 0 };
  }

  const result = { created: 0, updated: 0, failed: 0 };

  // Get raw pg client for transaction
  const { workerPool } = await import('../db');
  const pgClient = await workerPool.connect();

  try {
    await pgClient.query('BEGIN');

    // STEP 1: Create temporary staging table
    await pgClient.query(`
      CREATE TEMP TABLE IF NOT EXISTS verification_contacts_staging (
        campaign_id VARCHAR,
        account_id VARCHAR,
        full_name VARCHAR,
        first_name VARCHAR,
        last_name VARCHAR,
        email VARCHAR,
        phone VARCHAR,
        mobile VARCHAR,
        title VARCHAR,
        contact_country VARCHAR,
        cav_id VARCHAR,
        cav_user_id VARCHAR,
        source_type VARCHAR,
        updated_at TIMESTAMP
      ) ON COMMIT DROP
    `);

    // STEP 2: Stream data to staging table via COPY
    const copyStream = pgClient.query(copyFrom(`
      COPY verification_contacts_staging (
        campaign_id, account_id, full_name, first_name, last_name,
        email, phone, mobile, title, contact_country, cav_id, cav_user_id, source_type, updated_at
      ) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', NULL '\\N')
    `));

    const dataStream = Readable.from(records.map(record => {
      const accountId = accountCache.get(record.companyNormalized) || '';
      const now = new Date().toISOString();
      
      return [
        campaignId || '\\N',
        accountId || '\\N',
        record.fullName || '\\N',
        record.firstName || '\\N',
        record.lastName || '\\N',
        record.email || '\\N',
        record.phone || '\\N',
        record.mobile || '\\N',
        record.title || '\\N',
        record.contactCountry || '\\N',
        record.cavId || '\\N',
        record.cavUserId || '\\N',
        record.sourceType || 'New_Sourced',
        now
      ].join('\\t') + '\\n';
    }));

    await pipeline(dataStream, copyStream);

    console.log(`[VerificationCSVImportWorker] COPY completed: ${records.length} rows to staging`);

    // STEP 3: Two-pass upsert (UPDATE existing, INSERT new)
    
    if (updateMode) {
      // UPDATE pass: Update existing contacts
      // CRITICAL: Preserve CAV fields if CSV doesn't have them but DB does
      const updateResult = await pgClient.query(`
        UPDATE verification_contacts vc
        SET 
          email = COALESCE(s.email, vc.email),
          phone = COALESCE(s.phone, vc.phone),
          mobile = COALESCE(s.mobile, vc.mobile),
          title = COALESCE(s.title, vc.title),
          contact_country = COALESCE(s.contact_country, vc.contact_country),
          cav_id = CASE 
            WHEN s.cav_id IS NOT NULL THEN s.cav_id
            ELSE vc.cav_id
          END,
          cav_user_id = CASE 
            WHEN s.cav_user_id IS NOT NULL THEN s.cav_user_id
            ELSE vc.cav_user_id
          END,
          updated_at = s.updated_at
        FROM verification_contacts_staging s
        WHERE vc.campaign_id = s.campaign_id
          AND vc.account_id = s.account_id
          AND vc.full_name = s.full_name
      `);
      
      result.updated = updateResult.rowCount || 0;
      console.log(`[VerificationCSVImportWorker] UPDATE pass: ${result.updated} rows updated`);
    }

    // INSERT pass: Insert only new contacts (not in existing table)
    const insertResult = await pgClient.query(`
      INSERT INTO verification_contacts (
        campaign_id, account_id, full_name, first_name, last_name,
        email, phone, mobile, title, contact_country, cav_id, cav_user_id, source_type, updated_at
      )
      SELECT 
        s.campaign_id, s.account_id, s.full_name, s.first_name, s.last_name,
        s.email, s.phone, s.mobile, s.title, s.contact_country, s.cav_id, s.cav_user_id, s.source_type, s.updated_at
      FROM verification_contacts_staging s
      WHERE NOT EXISTS (
        SELECT 1 FROM verification_contacts vc
        WHERE vc.campaign_id = s.campaign_id
          AND vc.account_id = s.account_id
          AND vc.full_name = s.full_name
      )
    `);

    result.created = insertResult.rowCount || 0;
    console.log(`[VerificationCSVImportWorker] INSERT pass: ${result.created} rows inserted`);

    await pgClient.query('COMMIT');

  } catch (error) {
    await pgClient.query('ROLLBACK');
    console.error('[VerificationCSVImportWorker] Batch processing failed:', error);
    result.failed = records.length;
    throw error;
  } finally {
    pgClient.release();
  }

  return result;
}

/**
 * Main worker function
 */
export async function processVerificationCSVImport(
  job: Job
): Promise {
  const startTime = Date.now();
  const { s3Key, campaignId, uploadJobId, fieldMappings, updateMode, batchSize = 5000 } = job.data;

  console.log(`[VerificationCSVImportWorker] Starting job ${job.id}`);
  console.log(`[VerificationCSVImportWorker] Campaign: ${campaignId}, S3 Key: ${s3Key}`);
  console.log(`[VerificationCSVImportWorker] Update mode: ${updateMode}, Batch size: ${batchSize}`);

  const errors: Array = [];
  let totalRows = 0;
  let successRows = 0;
  let createdRows = 0;
  let updatedRows = 0;
  let failedRows = 0;

  try {
    // STEP 1: Prepare account cache
    const companyMap = new Map();
    const accountCache = new Map();

    // STEP 2: Stream and preprocess CSV
    const s3Stream = await streamFromS3(s3Key);
    const decompressor = s3Key.endsWith('.gz') ? createGunzip() : new Transform({ transform(chunk, enc, cb) { cb(null, chunk); } });

    const preparedContacts: any[] = [];
    let rowNum = 0;

    await new Promise((resolve, reject) => {
      const csvParser = parse({ headers: true, maxRows: undefined })
        .on('data', (row: any) => {
          rowNum++;
          totalRows++;

          try {
            // Extract fields based on mapping
            const fullName = (row.fullName || row.name || row['Full Name'] || '').trim();
            const email = (row.email || row['Email'] || '').trim().toLowerCase();
            const phone = (row.phone || row['Phone'] || '').trim();
            const companyName = (row.companyName || row.company || row['Company'] || row.account_name || '').trim();
            
            // Extract CAV fields (critical for preserving integrations)
            const cavId = (row.cavId || row.cav_id || row.CAVId || row['CAV ID'] || '').trim() || null;
            const cavUserId = (row.cavUserId || row.cav_user_id || row.CAVUserId || row['CAV User ID'] || '').trim() || null;

            if (!fullName) {
              errors.push({ row: rowNum, message: 'Missing contact name' });
              return;
            }

            if (!companyName) {
              errors.push({ row: rowNum, message: 'Missing company name' });
              return;
            }

            const normalizedCompanyName = normalizeName(companyName);
            
            if (!companyMap.has(normalizedCompanyName)) {
              companyMap.set(normalizedCompanyName, { name: companyName, normalized: normalizedCompanyName });
            }

            const nameParts = fullName.split(' ');
            preparedContacts.push({
              rowNum,
              fullName,
              firstName: nameParts[0] || '',
              lastName: nameParts.slice(1).join(' ') || '',
              email: email || null,
              phone: phone || null,
              mobile: null,
              title: (row.title || row.jobTitle || '').trim() || null,
              contactCountry: (row.country || row.contactCountry || '').trim() || null,
              cavId,
              cavUserId,
              companyName,
              companyNormalized: normalizedCompanyName,
              sourceType: 'New_Sourced',
            });
          } catch (error) {
            errors.push({ row: rowNum, message: error instanceof Error ? error.message : String(error) });
          }
        })
        .on('end', () => resolve())
        .on('error', (error) => reject(error));

      s3Stream.pipe(decompressor).pipe(csvParser);
    });

    console.log(`[VerificationCSVImportWorker] Prepared ${preparedContacts.length} contacts, ${companyMap.size} unique companies`);

    // STEP 3: Bulk upsert accounts
    if (companyMap.size > 0) {
      const companyValues = Array.from(companyMap.values());
      
      const insertedAccounts = await workerDb
        .insert(accounts)
        .values(companyValues.map(c => ({ name: c.name, nameNormalized: c.normalized })))
        .onConflictDoUpdate({
          target: accounts.nameNormalized,
          set: { name: sql`EXCLUDED.name`, updatedAt: new Date() },
        })
        .returning({ id: accounts.id, nameNormalized: accounts.nameNormalized });

      for (const acc of insertedAccounts) {
        if (acc.nameNormalized) {
          accountCache.set(acc.nameNormalized, acc.id);
        }
      }

      console.log(`[VerificationCSVImportWorker] Upserted ${insertedAccounts.length} accounts`);
    }

    // STEP 4: Process contacts in batches using COPY + staging table
    for (let i = 0; i  0 ? Math.round((successRows / totalRows) * 100) : 0,
      });

      // Sync to verificationUploadJobs table
      const { db } = await import('../db');
      const { verificationUploadJobs } = await import('../../shared/schema');
      await db
        .update(verificationUploadJobs)
        .set({
          processedRows: successRows + failedRows,
          successCount: successRows,
          errorCount: errors.length,
          errors: errors.slice(-100),
          updatedAt: new Date(),
        })
        .where(eq(verificationUploadJobs.id, uploadJobId));

      console.log(`[VerificationCSVImportWorker] Batch ${batchNum}/${totalBatches} complete: ${batchResult.created} created, ${batchResult.updated} updated`);
    }

    const duration = Date.now() - startTime;
    console.log(`[VerificationCSVImportWorker] Job ${job.id} completed in ${duration}ms: ${successRows} success, ${failedRows} failed`);

    return {
      success: true,
      totalRows,
      successRows,
      createdRows,
      updatedRows,
      failedRows,
      errors,
      duration,
    };

  } catch (error) {
    console.error(`[VerificationCSVImportWorker] Job ${job.id} failed:`, error);
    throw error;
  }
}