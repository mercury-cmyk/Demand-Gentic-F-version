/**
 * CSV Import Worker
 * 
 * Streams CSV files from S3 and performs batched inserts into Postgres.
 * Designed for high-volume imports without loading entire files into memory.
 */

import { Job } from 'bullmq';
import { parse } from 'fast-csv';
import { Readable } from 'stream';
import { db } from '../db';
import { verificationContacts, verificationCampaigns, accounts } from '../../shared/schema';
import { streamFromS3 } from '../lib/storage';
import { eq, and, sql } from 'drizzle-orm';
import { normalizeName } from '../normalization';

/**
 * CSV Import Job Data
 */
export interface CSVImportJobData {
  s3Key: string;                    // S3 key to the CSV file
  campaignId: string;               // Campaign to associate contacts with
  sourceType: 'sourced' | 'scrubbed' | 'scrubbed_external'; // Source type for contacts
  batchSize?: number;               // Number of rows to insert per batch (default: 1000)
  skipDuplicates?: boolean;         // Skip duplicate emails instead of updating (default: false)
  fieldMapping?: Record<string, string>; // Custom field mapping (csvColumn -> dbColumn)
}

/**
 * CSV Import Job Result
 */
export interface CSVImportJobResult {
  totalRows: number;
  successRows: number;
  failedRows: number;
  skippedRows: number;
  errors: Array<{ row: number; message: string }>;
  duration: number;
}

/**
 * Default field mapping for CSV columns to database columns
 */
const DEFAULT_FIELD_MAPPING: Record<string, string> = {
  'full_name': 'fullName',
  'first_name': 'firstName',
  'last_name': 'lastName',
  'title': 'title',
  'job_title': 'title',
  'email': 'email',
  'phone': 'phone',
  'mobile': 'mobile',
  'linkedin_url': 'linkedinUrl',
  'linkedin': 'linkedinUrl',
  
  // Company fields
  'company_name': '_companyName', // Used for account lookup, not stored directly
  'company': '_companyName',
  
  // Address fields - contact address
  'city': 'contactCity',
  'state': 'contactState',
  'country': 'contactCountry',
  'postal_code': 'contactPostal',
  'zip_code': 'contactPostal',
  'address1': 'contactAddress1',
  'address2': 'contactAddress2',
  
  // HQ Address fields
  'hq_city': 'hqCity',
  'hq_state': 'hqState',
  'hq_country': 'hqCountry',
  'hq_postal': 'hqPostal',
  'hq_phone': 'hqPhone',
  'hq_address1': 'hqAddress1',
  'hq_address2': 'hqAddress2',
  
  // CAV fields
  'cav_id': 'cavId',
  'cav_user_id': 'cavUserId',
  
  // Career fields
  'former_position': 'formerPosition',
  'time_in_current_position': 'timeInCurrentPosition',
  'time_in_current_company': 'timeInCurrentCompany',
};

/**
 * CSV Import Worker Processor
 * Streams CSV from S3 and performs batched Postgres inserts
 */
export async function processCSVImport(job: Job<CSVImportJobData>): Promise<CSVImportJobResult> {
  const startTime = Date.now();
  const { s3Key, campaignId, sourceType, batchSize = 1000, skipDuplicates = false, fieldMapping } = job.data;

  console.log(`[CSVImportWorker] Starting import job ${job.id}`);
  console.log(`[CSVImportWorker] S3 Key: ${s3Key}`);
  console.log(`[CSVImportWorker] Campaign: ${campaignId}`);
  console.log(`[CSVImportWorker] Batch size: ${batchSize}`);

  // Merge custom field mapping with defaults
  const finalFieldMapping = { ...DEFAULT_FIELD_MAPPING, ...(fieldMapping || {}) };

  // Validate campaign exists
  const [campaign] = await db
    .select()
    .from(verificationCampaigns)
    .where(eq(verificationCampaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  // Stats tracking
  let totalRows = 0;
  let successRows = 0;
  let failedRows = 0;
  let skippedRows = 0;
  const errors: Array<{ row: number; message: string }> = [];

  // Batch buffer for inserts
  let batch: any[] = [];

  // Account lookup cache (to avoid repeated DB queries)
  const accountCache = new Map<string, string>(); // companyName -> accountId

  /**
   * Flush batch to database
   */
  async function flushBatch() {
    if (batch.length === 0) return;

    try {
      // Insert batch with conflict handling
      if (skipDuplicates) {
        await db
          .insert(verificationContacts)
          .values(batch)
          .onConflictDoNothing();
      } else {
        // Update on conflict (by campaign_id + email)
        await db
          .insert(verificationContacts)
          .values(batch)
          .onConflictDoUpdate({
            target: [verificationContacts.campaignId, verificationContacts.emailLower],
            set: {
              fullName: sql`EXCLUDED.full_name`,
              firstName: sql`EXCLUDED.first_name`,
              lastName: sql`EXCLUDED.last_name`,
              title: sql`EXCLUDED.title`,
              phone: sql`EXCLUDED.phone`,
              mobile: sql`EXCLUDED.mobile`,
              linkedinUrl: sql`EXCLUDED.linkedin_url`,
              contactCity: sql`EXCLUDED.contact_city`,
              contactState: sql`EXCLUDED.contact_state`,
              contactCountry: sql`EXCLUDED.contact_country`,
              contactPostal: sql`EXCLUDED.contact_postal`,
              updatedAt: new Date(),
            },
          });
      }

      successRows += batch.length;
      console.log(`[CSVImportWorker] Batch inserted: ${batch.length} rows (total: ${successRows})`);

      // Update job progress
      await job.updateProgress({
        totalRows,
        successRows,
        failedRows,
        skippedRows,
        percentage: totalRows > 0 ? Math.round((successRows / totalRows) * 100) : 0,
      });
    } catch (error) {
      console.error(`[CSVImportWorker] Batch insert failed:`, error);
      failedRows += batch.length;
      errors.push({
        row: totalRows - batch.length,
        message: `Batch insert failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      batch = [];
    }
  }

  /**
   * Find or cache account by company name
   */
  async function findAccount(companyName: string): Promise<string | null> {
    if (!companyName) return null;

    const normalizedName = normalizeName(companyName);
    
    // Check cache first
    if (accountCache.has(normalizedName)) {
      return accountCache.get(normalizedName)!;
    }

    // Query database
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(sql`normalize_company_name(${accounts.name})`, normalizedName))
      .limit(1);

    if (account) {
      accountCache.set(normalizedName, account.id);
      return account.id;
    }

    return null;
  }

  /**
   * Sanitize text to remove corrupt characters and normalize encoding
   * Fixes common UTF-8 corruption patterns
   */
  function sanitizeText(text: string | null | undefined): string | null {
    if (!text || typeof text !== 'string') return null;
    
    return text
      // Remove BOM (Byte Order Mark)
      .replace(/^\uFEFF/, '')
      // Fix common UTF-8 corruption patterns
      .replace(/â€™/g, "'")  // Right single quotation mark
      .replace(/â€œ/g, '"')  // Left double quotation mark
      .replace(/â€/g, '"')   // Right double quotation mark
      .replace(/â€"/g, '–')  // En dash
      .replace(/â€"/g, '—')  // Em dash
      .replace(/Ã©/g, 'é')
      .replace(/Ã¨/g, 'è')
      .replace(/Ã /g, 'à')
      .replace(/Ã¢/g, 'â')
      .replace(/Ã§/g, 'ç')
      .replace(/Ã´/g, 'ô')
      .replace(/Ã¼/g, 'ü')
      .replace(/Ã«/g, 'ë')
      .replace(/Ã¯/g, 'ï')
      .replace(/Ã±/g, 'ñ')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Map CSV row to database record
   */
  async function mapRowToRecord(row: Record<string, any>): Promise<any> {
    const mapped: any = {
      campaignId,
      sourceType,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Track company name separately for account lookup
    let companyName: string | null = null;

    // Map fields using field mapping with sanitization
    for (const [csvColumn, dbColumn] of Object.entries(finalFieldMapping)) {
      const value = row[csvColumn];
      if (value !== undefined && value !== null && value !== '') {
        const sanitizedValue = sanitizeText(String(value));
        
        // Handle special _companyName field (used for lookup, not stored)
        if (dbColumn === '_companyName') {
          companyName = sanitizedValue;
        } else {
          mapped[dbColumn] = sanitizedValue;
        }
      }
    }

    // Required fields validation
    if (!mapped.fullName) {
      throw new Error('Missing required field: fullName');
    }

    if (!mapped.email) {
      throw new Error('Missing required field: email');
    }

    // Normalize email
    mapped.emailLower = mapped.email.toLowerCase();

    // Find account if company name provided
    if (companyName) {
      mapped.accountId = await findAccount(companyName);
    }

    return mapped;
  }

  /**
   * Stream and process CSV from S3
   */
  return new Promise<CSVImportJobResult>(async (resolve, reject) => {
    try {
      // Stream CSV from S3 (UTF-8 encoding set in streamFromS3)
      const s3Stream = await streamFromS3(s3Key);

      // Create CSV parser with UTF-8 encoding
      const csvParser = parse({
        headers: true,
        trim: true,
        ignoreEmpty: true,
        encoding: 'utf8',
      });

      // Handle parsing errors
      csvParser.on('error', (error) => {
        console.error(`[CSVImportWorker] CSV parsing error:`, error);
        reject(new Error(`CSV parsing failed: ${error.message}`));
      });

      // Process each row
      csvParser.on('data', async (row: Record<string, any>) => {
        totalRows++;

        try {
          // Map CSV row to database record
          const record = await mapRowToRecord(row);
          batch.push(record);

          // Flush batch when it reaches batch size
          if (batch.length >= batchSize) {
            // Pause stream while flushing
            csvParser.pause();
            await flushBatch();
            csvParser.resume();
          }
        } catch (error) {
          failedRows++;
          errors.push({
            row: totalRows,
            message: error instanceof Error ? error.message : String(error),
          });

          // Limit error collection to prevent memory issues
          if (errors.length > 1000) {
            errors.shift(); // Remove oldest error
          }
        }
      });

      // Handle stream end
      csvParser.on('end', async () => {
        try {
          // Flush remaining batch
          await flushBatch();

          const duration = Date.now() - startTime;
          const result: CSVImportJobResult = {
            totalRows,
            successRows,
            failedRows,
            skippedRows,
            errors: errors.slice(0, 100), // Return first 100 errors
            duration,
          };

          console.log(`[CSVImportWorker] Job ${job.id} completed in ${duration}ms`);
          console.log(`[CSVImportWorker] Total: ${totalRows}, Success: ${successRows}, Failed: ${failedRows}`);

          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      // Pipe S3 stream to CSV parser
      s3Stream.pipe(csvParser);
    } catch (error) {
      console.error(`[CSVImportWorker] Stream setup failed:`, error);
      reject(error);
    }
  });
}
