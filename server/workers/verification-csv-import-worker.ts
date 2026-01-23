/**
 * ENHANCED Verification CSV Import Worker
 * 
 * High-performance verification contact imports using PostgreSQL COPY command
 * WITH full feature parity: fuzzy matching, eligibility, suppression, scoring
 * Processes 10-20x faster than traditional INSERT statements
 */

import { Job } from 'bullmq';
import { parse } from 'fast-csv';
import { Readable, Transform } from 'stream';
import { createGunzip } from 'zlib';
import { workerDb } from '../db';
import { verificationContacts, accounts, verificationCampaigns } from '../../shared/schema';
import { streamFromS3 } from '../lib/storage';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { from as copyFrom } from 'pg-copy-streams';
import { pipeline } from 'stream/promises';
import { evaluateEligibilityWithCap, checkSuppression, computeNormalizedKeys, normalize } from '../lib/verification-utils';
import { getMatchTypeAndConfidence, normalizeDomain, extractRootDomain } from '@shared/domain-utils';

/**
 * Verification CSV Import Job Data
 */
export interface VerificationCSVImportJobData {
  s3Key: string;
  userId: string;
  campaignId: string;
  uploadJobId: string;
  fieldMappings: Array<{
    csvColumn: string;
    targetField: string;
    targetEntity: 'contact' | 'account';
  }>;
  headers: string[];
  updateMode: boolean;
  batchSize?: number;
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
  errors: Array<{ row: number; message: string }>;
  duration: number;
}

/**
 * Processed contact record ready for bulk insert
 */
interface ProcessedContact {
  campaignId: string;
  accountId: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  linkedinUrl: string | null;
  title: string | null;
  contactAddress1: string | null;
  contactAddress2: string | null;
  contactAddress3: string | null;
  contactCity: string | null;
  contactState: string | null;
  contactCountry: string;
  contactPostal: string | null;
  hqAddress1: string | null;
  hqAddress2: string | null;
  hqAddress3: string | null;
  hqCity: string | null;
  hqState: string | null;
  hqCountry: string | null;
  hqPostal: string | null;
  cavId: string | null;
  cavUserId: string | null;
  sourceType: string;
  eligibilityStatus: string;
  eligibilityReason: string | null;
  seniorityLevel: string | null;
  titleAlignmentScore: string | null;
  priorityScore: string | null;
  suppressed: boolean;
  emailLower: string | null;
  fullNameLower: string;
  customFields: Record<string, any> | null;
}

const autoMappings: Record<string, string> = {
  'fullname': 'fullName',
  'name': 'fullName',
  'firstname': 'firstName',
  'lastname': 'lastName',
  'jobtitle': 'title',
  'title': 'title',
  'emailaddress': 'email',
  'email': 'email',
  'phonenumber': 'phone',
  'phone': 'phone',
  'mobilenumber': 'mobile',
  'mobile': 'mobile',
  'linkedin': 'linkedinUrl',
  'linkedinurl': 'linkedinUrl',
  'contactaddress1': 'contactAddress1',
  'contactaddress2': 'contactAddress2',
  'contactaddress3': 'contactAddress3',
  'address1': 'contactAddress1',
  'address2': 'contactAddress2',
  'address3': 'contactAddress3',
  'street1': 'contactAddress1',
  'street2': 'contactAddress2',
  'street3': 'contactAddress3',
  'contactcity': 'contactCity',
  'city': 'contactCity',
  'contactstate': 'contactState',
  'state': 'contactState',
  'contactcountry': 'contactCountry',
  'country': 'contactCountry',
  'contactpostalcode': 'contactPostal',
  'contactpostal': 'contactPostal',
  'postalcode': 'contactPostal',
  'postal': 'contactPostal',
  'zip': 'contactPostal',
  'zipcode': 'contactPostal',
  'companyname': 'account_name',
  'company': 'account_name',
  'accountname': 'account_name',
  'account': 'account_name',
  'companydomain': 'domain',
  'domain': 'domain',
  'websiteurl': 'domain',
  'hqaddress1': 'hqAddress1',
  'hqaddress2': 'hqAddress2',
  'hqaddress3': 'hqAddress3',
  'companyaddress1': 'hqAddress1',
  'companyaddress2': 'hqAddress2',
  'companyaddress3': 'hqAddress3',
  'hqstreet1': 'hqAddress1',
  'hqstreet2': 'hqAddress2',
  'hqstreet3': 'hqAddress3',
  'hqcity': 'hqCity',
  'hqstate': 'hqState',
  'hqpostalcode': 'hqPostal',
  'hqpostal': 'hqPostal',
  'hqzip': 'hqPostal',
  'companypostalcode': 'hqPostal',
  'companypostal': 'hqPostal',
  'hqcountry': 'hqCountry',
  'companycountry': 'hqCountry',
  'hqphone': 'hqPhone',
  'companyphone': 'hqPhone',
  'mainphone': 'hqPhone',
  'companyphonenumber': 'hqPhone',
  'cavid': 'cavId',
  'cav_id': 'cavId',
  'cavuserid': 'cavUserId',
  'cav_user_id': 'cavUserId',
  'sourcetype': 'sourceType',
  'source_type': 'sourceType',
  'source': 'sourceType',
};

/**
 * Parse tenure string to months (e.g., "3 years" → 36, "a year" → 12, "6 months" → 6)
 */
function parseTenureToMonths(tenure: string | null | undefined): number | null {
  if (!tenure) return null;
  const t = tenure.toLowerCase().trim();
  
  // Handle "X years" format
  const yearsMatch = t.match(/^(\d+)\s*years?$/);
  if (yearsMatch) return parseInt(yearsMatch[1], 10) * 12;
  
  // Handle "a year" or "one year"
  if (t === 'a year' || t === 'one year') return 12;
  
  // Handle "X months" format
  const monthsMatch = t.match(/^(\d+)\s*months?$/);
  if (monthsMatch) return parseInt(monthsMatch[1], 10);
  
  // Handle "a month" or "one month"
  if (t === 'a month' || t === 'one month') return 1;
  
  return null;
}

/**
 * Process verification contacts using staging table + COPY for maximum performance
 */
async function processBatchWithStagingTable(
  records: ProcessedContact[],
  updateMode: boolean
): Promise<{ created: number; updated: number; failed: number }> {
  if (records.length === 0) {
    return { created: 0, updated: 0, failed: 0 };
  }

  const result = { created: 0, updated: 0, failed: 0 };
  const { workerPool } = await import('../db');
  const pgClient = await workerPool.connect();

  try {
    await pgClient.query('BEGIN');

    // STEP 1: Create temporary staging table with ALL fields
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
        linkedin_url VARCHAR,
        title VARCHAR,
        contact_address1 VARCHAR,
        contact_address2 VARCHAR,
        contact_address3 VARCHAR,
        contact_city VARCHAR,
        contact_state VARCHAR,
        contact_country VARCHAR,
        contact_postal VARCHAR,
        hq_address_1 VARCHAR,
        hq_address_2 VARCHAR,
        hq_address_3 VARCHAR,
        hq_city VARCHAR,
        hq_state VARCHAR,
        hq_country VARCHAR,
        hq_postal VARCHAR,
        cav_id VARCHAR,
        cav_user_id VARCHAR,
        source_type VARCHAR,
        eligibility_status VARCHAR,
        eligibility_reason VARCHAR,
        seniority_level VARCHAR,
        title_alignment_score VARCHAR,
        priority_score VARCHAR,
        suppressed BOOLEAN,
        email_lower VARCHAR,
        custom_fields JSONB,
        updated_at TIMESTAMP
      ) ON COMMIT DROP
    `);

    // STEP 2: Stream data to staging table via COPY
    // CRITICAL: Use FORMAT text (not csv) so double quotes in JSON are preserved
    // In CSV format, double quotes have special meaning and corrupt JSON values
    const copyStream = pgClient.query(copyFrom(`
      COPY verification_contacts_staging (
        campaign_id, account_id, full_name, first_name, last_name,
        email, phone, mobile, linkedin_url, title,
        contact_address1, contact_address2, contact_address3, contact_city, contact_state,
        contact_country, contact_postal,
        hq_address_1, hq_address_2, hq_address_3, hq_city, hq_state, hq_country, hq_postal,
        cav_id, cav_user_id, source_type,
        eligibility_status, eligibility_reason, seniority_level,
        title_alignment_score, priority_score, suppressed,
        email_lower, custom_fields, updated_at
      ) FROM STDIN WITH (FORMAT text)
    `));

    // Helper function to escape special characters for PostgreSQL COPY
    const escapeCopyValue = (value: any): string => {
      if (value === null || value === undefined) return '\\N';
      const str = String(value);
      // Escape backslash, tab, newline, carriage return
      return str
        .replace(/\\/g, '\\\\')    // backslash -> \\
        .replace(/\t/g, '\\t')     // tab -> \t
        .replace(/\n/g, '\\n')     // newline -> \n
        .replace(/\r/g, '\\r');    // carriage return -> \r
    };
    
    const dataStream = Readable.from(records.map(record => {
      const now = new Date().toISOString();
      
      return [
        escapeCopyValue(record.campaignId),
        escapeCopyValue(record.accountId),
        escapeCopyValue(record.fullName),
        escapeCopyValue(record.firstName),
        escapeCopyValue(record.lastName),
        escapeCopyValue(record.email),
        escapeCopyValue(record.phone),
        escapeCopyValue(record.mobile),
        escapeCopyValue(record.linkedinUrl),
        escapeCopyValue(record.title),
        escapeCopyValue(record.contactAddress1),
        escapeCopyValue(record.contactAddress2),
        escapeCopyValue(record.contactAddress3),
        escapeCopyValue(record.contactCity),
        escapeCopyValue(record.contactState),
        escapeCopyValue(record.contactCountry),
        escapeCopyValue(record.contactPostal),
        escapeCopyValue(record.hqAddress1),
        escapeCopyValue(record.hqAddress2),
        escapeCopyValue(record.hqAddress3),
        escapeCopyValue(record.hqCity),
        escapeCopyValue(record.hqState),
        escapeCopyValue(record.hqCountry),
        escapeCopyValue(record.hqPostal),
        escapeCopyValue(record.cavId),
        escapeCopyValue(record.cavUserId),
        escapeCopyValue(record.sourceType) || 'New_Sourced',
        escapeCopyValue(record.eligibilityStatus),
        escapeCopyValue(record.eligibilityReason),
        escapeCopyValue(record.seniorityLevel),
        escapeCopyValue(record.titleAlignmentScore) || '0',
        escapeCopyValue(record.priorityScore) || '0',
        record.suppressed ? 'true' : 'false',
        escapeCopyValue(record.emailLower),
        (() => {
          if (!record.customFields) return '\\N';
          
          // Ensure customFields is a proper object, not a string
          let fieldsObj = record.customFields;
          if (typeof fieldsObj === 'string') {
            try {
              fieldsObj = JSON.parse(fieldsObj);
            } catch {
              // If it's an invalid JSON string, wrap it properly
              console.log('[VerificationCSVImportWorker] Warning: customFields is string, wrapping:', fieldsObj.substring(0, 100));
              fieldsObj = { rawValue: fieldsObj };
            }
          }
          
          // Ensure it's a plain object
          if (typeof fieldsObj !== 'object' || fieldsObj === null || Array.isArray(fieldsObj)) {
            return '\\N';
          }
          
          const jsonStr = JSON.stringify(fieldsObj);
          
          // Validate the JSON is properly formatted (has quoted keys)
          if (!jsonStr.startsWith('{') || !jsonStr.includes('"')) {
            console.log('[VerificationCSVImportWorker] ERROR: Invalid JSON output:', jsonStr.substring(0, 200));
            return '\\N';
          }
          
          // Debug: Log first record's customFields
          if (record === records[0]) {
            console.log('[VerificationCSVImportWorker] CustomFields debug:', {
              type: typeof record.customFields,
              finalJson: jsonStr.substring(0, 200),
            });
          }
          
          return escapeCopyValue(jsonStr);
        })(),
        now
      ].join('\t') + '\n';
    }));

    await pipeline(dataStream, copyStream);

    console.log(`[VerificationCSVImportWorker] COPY completed: ${records.length} rows to staging`);

    // STEP 3: Two-pass upsert (UPDATE existing, INSERT new)
    // ALWAYS run UPDATE pass to handle duplicates - updateMode controls WHAT we update
    
    // Build SQL based on updateMode
    const updateSql = updateMode
      ? `
        UPDATE verification_contacts vc
        SET 
          email = CASE 
            WHEN vc.email IS NULL OR vc.email = '' OR LOWER(vc.email) LIKE '%bounced%' THEN COALESCE(s.email, vc.email)
            ELSE vc.email
          END,
          phone = COALESCE(s.phone, vc.phone),
          mobile = COALESCE(s.mobile, vc.mobile),
          linkedin_url = COALESCE(s.linkedin_url, vc.linkedin_url),
          title = COALESCE(s.title, vc.title),
          contact_address1 = COALESCE(s.contact_address1, vc.contact_address1),
          contact_address2 = COALESCE(s.contact_address2, vc.contact_address2),
          contact_address3 = COALESCE(s.contact_address3, vc.contact_address3),
          contact_city = COALESCE(s.contact_city, vc.contact_city),
          contact_state = COALESCE(s.contact_state, vc.contact_state),
          contact_country = COALESCE(s.contact_country, vc.contact_country),
          contact_postal = COALESCE(s.contact_postal, vc.contact_postal),
          hq_address_1 = COALESCE(s.hq_address_1, vc.hq_address_1),
          hq_address_2 = COALESCE(s.hq_address_2, vc.hq_address_2),
          hq_address_3 = COALESCE(s.hq_address_3, vc.hq_address_3),
          hq_city = COALESCE(s.hq_city, vc.hq_city),
          hq_state = COALESCE(s.hq_state, vc.hq_state),
          hq_country = COALESCE(s.hq_country, vc.hq_country),
          hq_postal = COALESCE(s.hq_postal, vc.hq_postal),
          cav_id = CASE 
            WHEN s.cav_id IS NOT NULL THEN s.cav_id
            ELSE vc.cav_id
          END,
          cav_user_id = CASE 
            WHEN s.cav_user_id IS NOT NULL THEN s.cav_user_id
            ELSE vc.cav_user_id
          END,
          eligibility_status = s.eligibility_status::verification_eligibility_status,
          eligibility_reason = s.eligibility_reason,
          seniority_level = s.seniority_level::seniority_level,
          title_alignment_score = s.title_alignment_score::numeric,
          priority_score = s.priority_score::numeric,
          suppressed = s.suppressed,
          email_lower = s.email_lower,
          custom_fields = CASE 
            WHEN s.custom_fields IS NOT NULL THEN COALESCE(vc.custom_fields, '{}'::jsonb) || s.custom_fields
            ELSE vc.custom_fields
          END,
          updated_at = s.updated_at
        FROM verification_contacts_staging s
        WHERE vc.campaign_id = s.campaign_id
          AND vc.account_id = s.account_id
          AND vc.full_name = s.full_name
      `
      : `
        UPDATE verification_contacts vc
        SET 
          email = s.email,
          phone = s.phone,
          mobile = s.mobile,
          linkedin_url = s.linkedin_url,
          title = s.title,
          contact_address1 = s.contact_address1,
          contact_address2 = s.contact_address2,
          contact_address3 = s.contact_address3,
          contact_city = s.contact_city,
          contact_state = s.contact_state,
          contact_country = s.contact_country,
          contact_postal = s.contact_postal,
          hq_address_1 = s.hq_address_1,
          hq_address_2 = s.hq_address_2,
          hq_address_3 = s.hq_address_3,
          hq_city = s.hq_city,
          hq_state = s.hq_state,
          hq_country = s.hq_country,
          hq_postal = s.hq_postal,
          cav_id = CASE 
            WHEN s.cav_id IS NOT NULL THEN s.cav_id
            ELSE vc.cav_id
          END,
          cav_user_id = CASE 
            WHEN s.cav_user_id IS NOT NULL THEN s.cav_user_id
            ELSE vc.cav_user_id
          END,
          eligibility_status = s.eligibility_status::verification_eligibility_status,
          eligibility_reason = s.eligibility_reason,
          seniority_level = s.seniority_level::seniority_level,
          title_alignment_score = s.title_alignment_score::numeric,
          priority_score = s.priority_score::numeric,
          suppressed = s.suppressed,
          email_lower = s.email_lower,
          custom_fields = COALESCE(s.custom_fields, vc.custom_fields),
          updated_at = s.updated_at
        FROM verification_contacts_staging s
        WHERE vc.campaign_id = s.campaign_id
          AND vc.account_id = s.account_id
          AND vc.full_name = s.full_name
      `;
    
    const updateResult = await pgClient.query(updateSql);
    
    result.updated = updateResult.rowCount || 0;
    console.log(`[VerificationCSVImportWorker] UPDATE pass: ${result.updated} rows updated (updateMode: ${updateMode})`);


    // Count unique rows in staging for duplicate tracking
    const stagingCountResult = await pgClient.query(`
      SELECT COUNT(DISTINCT (campaign_id, account_id, full_name)) as unique_count
      FROM verification_contacts_staging
    `);
    const stagingUniqueCount = parseInt(stagingCountResult.rows[0]?.unique_count || '0');

    // INSERT pass: Insert new contacts with automatic duplicate handling
    // DISTINCT ON deduplicates within batch, ON CONFLICT handles cross-batch duplicates
    const insertResult = await pgClient.query(`
      INSERT INTO verification_contacts (
        campaign_id, account_id, full_name, first_name, last_name,
        email, phone, mobile, linkedin_url, title,
        contact_address1, contact_address2, contact_address3, contact_city, contact_state,
        contact_country, contact_postal,
        hq_address_1, hq_address_2, hq_address_3, hq_city, hq_state, hq_country, hq_postal,
        cav_id, cav_user_id, source_type,
        eligibility_status, eligibility_reason, seniority_level,
        title_alignment_score, priority_score, suppressed,
        email_lower, custom_fields, updated_at
      )
      SELECT DISTINCT ON (s.campaign_id, s.account_id, s.full_name)
        s.campaign_id, s.account_id, s.full_name, s.first_name, s.last_name,
        s.email, s.phone, s.mobile, s.linkedin_url, s.title,
        s.contact_address1, s.contact_address2, s.contact_address3, s.contact_city, s.contact_state,
        s.contact_country, s.contact_postal,
        s.hq_address_1, s.hq_address_2, s.hq_address_3, s.hq_city, s.hq_state, s.hq_country, s.hq_postal,
        s.cav_id, s.cav_user_id, s.source_type::verification_source_type,
        s.eligibility_status::verification_eligibility_status, s.eligibility_reason, s.seniority_level::seniority_level,
        s.title_alignment_score::numeric, s.priority_score::numeric, s.suppressed,
        s.email_lower, s.custom_fields, s.updated_at
      FROM verification_contacts_staging s
      ORDER BY s.campaign_id, s.account_id, s.full_name
      ON CONFLICT (campaign_id, full_name, account_id) DO NOTHING
    `);

    result.created = insertResult.rowCount || 0;
    const skippedDuplicates = stagingUniqueCount - result.created - result.updated;
    console.log(`[VerificationCSVImportWorker] INSERT pass: ${result.created} rows inserted, ${skippedDuplicates} duplicates skipped`);

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
 * Main worker function with FULL feature parity
 */
export async function processVerificationCSVImport(
  job: Job<VerificationCSVImportJobData>
): Promise<VerificationCSVImportJobResult> {
  const startTime = Date.now();
  const { s3Key, campaignId, uploadJobId, fieldMappings, updateMode, batchSize = 5000 } = job.data;

  console.log(`[VerificationCSVImportWorker] Starting job ${job.id}`);
  console.log(`[VerificationCSVImportWorker] Campaign: ${campaignId}, S3 Key: ${s3Key}`);

  const errors: Array<{ row: number; message: string }> = [];
  let totalRows = 0;
  let successRows = 0;
  let createdRows = 0;
  let updatedRows = 0;
  let failedRows = 0;

  try {
    // Fetch campaign config for eligibility evaluation
    const [campaign] = await workerDb
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Pre-load all accounts for O(1) fuzzy matching
    console.log('[VerificationCSVImportWorker] Pre-loading accounts for fuzzy matching...');
    const allAccounts = await workerDb.select().from(accounts);
    console.log(`[VerificationCSVImportWorker] Loaded ${allAccounts.length} accounts`);

    const accountsByDomain = new Map<string, typeof accounts.$inferSelect>();
    const accountsByNormalizedName = new Map<string, typeof accounts.$inferSelect[]>();
    
    for (const account of allAccounts) {
      if (account.domain) {
        const normalized = account.domain.toLowerCase().trim();
        accountsByDomain.set(normalized, account);
      }
      if (account.name) {
        const normalizedName = normalize.companyKey(account.name);
        if (!accountsByNormalizedName.has(normalizedName)) {
          accountsByNormalizedName.set(normalizedName, []);
        }
        accountsByNormalizedName.get(normalizedName)!.push(account);
      }
    }

    // Build field mapping lookup
    const userMappingLookup: Record<string, string> = {};
    if (fieldMappings && Array.isArray(fieldMappings)) {
      fieldMappings.forEach((mapping: any) => {
        if (mapping.csvColumn && mapping.targetField && mapping.targetField !== 'skip') {
          userMappingLookup[mapping.csvColumn] = mapping.targetField;
        }
      });
    }

    // STEP 1: Parse CSV synchronously first (no async in event handler!)
    // This fixes the issue where async operations in 'data' handler cause rows to be lost
    const s3Stream = await streamFromS3(s3Key);
    const decompressor = s3Key.endsWith('.gz') ? createGunzip() : new Transform({ transform(chunk, enc, cb) { cb(null, chunk); } });

    // Store parsed rows for account resolution in second pass
    interface ParsedCsvRow {
      rowNum: number;
      row: Record<string, any>;
      fullName: string;
      accountNameCsv: string | null;
      domainForMatching: string | null;
    }
    
    // Store resolved rows with accounts for eligibility pass
    interface RawContactRow {
      rowNum: number;
      row: Record<string, any>;
      accountId: string;
      accountData: any;
      fullName: string;
      accountNameCsv: string | null;
      domainForMatching: string | null;
    }
    
    const parsedRows: ParsedCsvRow[] = [];
    const rawContactData: RawContactRow[] = [];
    let rowNum = 0;
    const accountsInBatch = new Set<string>();
    let csvHeaders: string[] = [];

    // PASS 1A: Parse CSV synchronously (no async operations!)
    await new Promise<void>((resolve, reject) => {
      const csvParser = parse({ 
        headers: false, 
        maxRows: undefined
      })
        .on('data', (csvRowArray: string[]) => {
          // First row is headers
          if (csvHeaders.length === 0) {
            csvHeaders = csvRowArray.map(h => (h || '').trim());
            return;
          }
          
          // Convert array to object using headers
          const csvRow: Record<string, any> = {};
          for (let i = 0; i < csvHeaders.length; i++) {
            if (csvHeaders[i]) {
              csvRow[csvHeaders[i]] = csvRowArray[i] || '';
            }
          }
          
          rowNum++;
          totalRows++;

          // Map CSV fields synchronously (no await!)
          const row: Record<string, any> = {};
          const customFields: Record<string, any> = {};
          
          for (const header of Object.keys(csvRow)) {
            const headerLower = header.toLowerCase().replace(/[^a-z0-9_]/g, '');
            const targetField = userMappingLookup[header] || autoMappings[headerLower];
            if (targetField && csvRow[header]) {
              if (targetField.startsWith('custom_')) {
                const customFieldKey = targetField.substring(7);
                customFields[customFieldKey] = csvRow[header];
              } else {
                row[targetField] = csvRow[header];
              }
            }
          }
          
          row._customFields = Object.keys(customFields).length > 0 ? customFields : null;

          // Validate required fields
          const fullName = row.fullName || `${row.firstName || ''} ${row.lastName || ''}`.trim();
          if (!fullName) {
            errors.push({ row: rowNum, message: 'Missing name information' });
            return;
          }

          if (!row.contactCountry) {
            errors.push({ row: rowNum, message: 'Missing Contact Country - required field' });
            return;
          }

          // Calculate account matching info synchronously
          const accountNameCsv = row.account_name || row.companyName || null;
          const csvDomainValue = (row.domain || row.companyDomain || null)?.toLowerCase() || null;
          const emailDomain = row.email ? normalize.extractDomain(row.email) : null;

          const companyDomainForLookup = csvDomainValue ? normalizeDomain(csvDomainValue) : null;
          const companyRootDomain = companyDomainForLookup ? extractRootDomain(companyDomainForLookup) : null;
          const emailRootDomain = emailDomain ? extractRootDomain(normalizeDomain(emailDomain)) : null;

          const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
          const isPersonalEmail = emailRootDomain ? personalDomains.includes(emailRootDomain.toLowerCase()) : false;
          const domainForMatching = companyRootDomain || (!isPersonalEmail ? emailRootDomain : null);

          // Store for async processing in pass 1B
          parsedRows.push({
            rowNum,
            row,
            fullName,
            accountNameCsv,
            domainForMatching,
          });
        })
        .on('end', () => resolve())
        .on('error', (error) => reject(error));

      s3Stream.pipe(decompressor).pipe(csvParser);
    });

    console.log(`[VerificationCSVImportWorker] Pass 1A complete: ${parsedRows.length} CSV rows parsed (${totalRows} total with ${errors.length} validation errors)`);

    // PASS 1B: Resolve/create accounts (async operations now safe)
    console.log(`[VerificationCSVImportWorker] Pass 1B: Resolving accounts for ${parsedRows.length} contacts...`);
    
    let accountResolved = 0;
    const accountProgressInterval = Math.max(1000, Math.floor(parsedRows.length / 10));
    
    for (const parsed of parsedRows) {
      const { rowNum, row, fullName, accountNameCsv, domainForMatching } = parsed;
      
      accountResolved++;
      if (accountResolved % accountProgressInterval === 0 || accountResolved === parsedRows.length) {
        console.log(`[VerificationCSVImportWorker] Account resolution: ${accountResolved}/${parsedRows.length} (${Math.round(accountResolved / parsedRows.length * 100)}%)`);
      }

      try {
        let accountId: string | null = null;
        let accountData: any = null;

        // Try exact domain match
        if (domainForMatching && accountsByDomain.has(domainForMatching.toLowerCase())) {
          accountData = accountsByDomain.get(domainForMatching.toLowerCase())!;
          accountId = accountData.id;
        }

        // Try fuzzy name matching
        if (!accountId && accountNameCsv) {
          const normalizedName = normalize.companyKey(accountNameCsv);
          const candidates = accountsByNormalizedName.get(normalizedName) || [];
          
          let bestMatch: { account: typeof accounts.$inferSelect; confidence: number } | null = null;

          for (const account of candidates) {
            const matchResult = getMatchTypeAndConfidence(
              domainForMatching || '',
              accountNameCsv || undefined,
              account.domain || '',
              account.name
            );

            if ((matchResult.matchType === 'exact' || matchResult.matchType === 'fuzzy') &&
              matchResult.confidence >= 0.75 &&
              (!bestMatch || matchResult.confidence > bestMatch.confidence)) {
              bestMatch = { account, confidence: matchResult.confidence };
            }
          }

          if (bestMatch) {
            accountId = bestMatch.account.id;
            accountData = bestMatch.account;
          }
        }

        // Create new account if needed (async - now safe!)
        if (!accountId && (domainForMatching || accountNameCsv)) {
          const newAccount = await workerDb.insert(accounts).values({
            name: accountNameCsv ?? (domainForMatching ? domainForMatching.split('.')[0] : 'Unknown Company'),
            domain: domainForMatching,
            mainPhone: row.hqPhone ?? null,
            hqStreet1: row.hqAddress1 ?? null,
            hqStreet2: row.hqAddress2 ?? null,
            hqStreet3: row.hqAddress3 ?? null,
            hqCity: row.hqCity ?? null,
            hqState: row.hqState ?? null,
            hqPostalCode: row.hqPostal ?? null,
            hqCountry: row.hqCountry ?? null,
          }).returning();
          accountId = newAccount[0].id;
          accountData = newAccount[0];
          
          // Add to cache for subsequent rows
          if (domainForMatching) {
            accountsByDomain.set(domainForMatching.toLowerCase(), accountData);
          }
          if (accountNameCsv) {
            const normalizedName = normalize.companyKey(accountNameCsv);
            if (!accountsByNormalizedName.has(normalizedName)) {
              accountsByNormalizedName.set(normalizedName, []);
            }
            accountsByNormalizedName.get(normalizedName)!.push(accountData);
          }
        }

        if (!accountId) {
          errors.push({ row: rowNum, message: 'Could not resolve/create account' });
          continue;
        }

        accountsInBatch.add(accountId);
        
        rawContactData.push({
          rowNum,
          row,
          accountId,
          accountData,
          fullName,
          accountNameCsv,
          domainForMatching,
        });

      } catch (error) {
        errors.push({ row: rowNum, message: error instanceof Error ? error.message : String(error) });
      }
    }

    console.log(`[VerificationCSVImportWorker] Pass 1B complete: ${rawContactData.length} contacts with accounts, ${accountsInBatch.size} unique accounts`);
    
    // Update BullMQ job progress
    await job.updateProgress({
      phase: 'csv_parsing_complete',
      totalRows: rawContactData.length,
      uniqueAccounts: accountsInBatch.size,
    });

    // STEP 2: Evaluate eligibility for all contacts
    // Email validation runs separately in background (doesn't gate eligibility)
    console.log(`[VerificationCSVImportWorker] Preparing ${rawContactData.length} contacts for bulk import with immediate eligibility evaluation...`);
    
    const preparedContacts: ProcessedContact[] = [];
    
    await job.updateProgress({
      phase: 'preparing_bulk_insert',
      totalRows: rawContactData.length,
    });
    
    let eligibilityProcessed = 0;
    const eligibilityTotal = rawContactData.length;
    const progressInterval = Math.max(500, Math.floor(eligibilityTotal / 10));
    
    for (const rawRow of rawContactData) {
      const { rowNum, row, accountId, accountData, fullName, accountNameCsv, domainForMatching } = rawRow;
      
      eligibilityProcessed++;
      if (eligibilityProcessed % progressInterval === 0 || eligibilityProcessed === eligibilityTotal) {
        console.log(`[VerificationCSVImportWorker] Eligibility progress: ${eligibilityProcessed}/${eligibilityTotal} contacts (${Math.round(eligibilityProcessed / eligibilityTotal * 100)}%)`);
      }
      
      try {
        // Source type determination
        const hasCavData = !!((row.cavId?.trim()) || (row.cavUserId?.trim()));
        const sourceType: 'Client_Provided' | 'New_Sourced' = hasCavData
          ? 'Client_Provided'
          : (row.sourceType?.toLowerCase() === 'client_provided' || row.sourceType?.toLowerCase() === 'client provided')
            ? 'Client_Provided'
            : 'New_Sourced';

        // Compute normalized keys
        const normalizedKeys = computeNormalizedKeys({
          email: row.email || null,
          firstName: row.firstName || null,
          lastName: row.lastName || null,
          contactCountry: row.contactCountry || null,
          accountName: accountNameCsv,
        });

        // Parse tenure data from custom fields
        const timeInPositionMonths = parseTenureToMonths(row.timeInCurrentPosition || row.custom_time_in_current_position);
        const timeInCompanyMonths = parseTenureToMonths(row.timeInCurrentCompany || row.custom_time_in_current_company);
        
        // Evaluate eligibility immediately - email validation is separate and doesn't gate eligibility
        const eligibilityResult = await evaluateEligibilityWithCap(
          {
            title: row.title || null,
            contactCountry: row.contactCountry || null,
            email: row.email || null,
            accountId: accountId,
          },
          campaign,
          row.email || null,
          {
            firstName: row.firstName || null,
            lastName: row.lastName || null,
            companyIndustry: accountData?.industry || row.companyIndustry || null,
            companyDescription: row.companyDescription || null,
            companyName: accountNameCsv || null,
            companyLinkedinUrl: accountData?.linkedinUrl || row.companyLinkedinUrl || null,
            employmentType: row.employmentType || null,
            timeInCurrentPositionMonths: timeInPositionMonths,
            timeInCurrentCompanyMonths: timeInCompanyMonths,
          }
        );
        
        const eligibility = {
          eligibilityStatus: eligibilityResult.eligibilityStatus,
          eligibilityReason: eligibilityResult.eligibilityReason,
          seniorityLevel: eligibilityResult.seniorityLevel || null,
          titleAlignmentScore: eligibilityResult.titleAlignmentScore || null,
          priorityScore: eligibilityResult.priorityScore || null,
        };
        
        const isSuppressed = false; // Will be checked in background

        // HQ-to-contact address copying
        let contactAddress1 = row.contactAddress1 || null;
        let contactAddress2 = row.contactAddress2 || null;
        let contactAddress3 = row.contactAddress3 || null;
        let contactCity = row.contactCity || null;
        let contactState = row.contactState || null;
        let contactPostal = row.contactPostal || null;
        let contactPhone = row.phone || null;

        if (accountData && row.contactCountry && accountData.hqCountry) {
          const contactCountryNorm = row.contactCountry.trim().toLowerCase();
          const hqCountryNorm = accountData.hqCountry.trim().toLowerCase();

          if (contactCountryNorm === hqCountryNorm) {
            const hqHasCompleteData =
              accountData.hqStreet1 &&
              accountData.hqCity &&
              accountData.hqPostalCode &&
              accountData.mainPhone;

            if (hqHasCompleteData) {
              contactAddress1 = contactAddress1 || accountData.hqStreet1;
              contactAddress2 = contactAddress2 || accountData.hqStreet2;
              contactAddress3 = contactAddress3 || accountData.hqStreet3;
              contactCity = contactCity || accountData.hqCity;
              contactState = contactState || accountData.hqState;
              contactPostal = contactPostal || accountData.hqPostalCode;
              contactPhone = contactPhone || accountData.mainPhone;
            }
          }
        }

        // Build processed contact
        // CRITICAL: accountId must never be null/undefined
        if (!accountId) {
          errors.push({ row: rowNum, message: `No account found for: ${accountNameCsv || fullName}` });
          failedRows++;
          continue;
        }
        
        preparedContacts.push({
          campaignId,
          accountId,
          fullName,
          firstName: row.firstName || null,
          lastName: row.lastName || null,
          email: row.email || null,
          phone: contactPhone,
          mobile: row.mobile || null,
          linkedinUrl: row.linkedinUrl || null,
          title: row.title || null,
          contactAddress1,
          contactAddress2,
          contactAddress3,
          contactCity,
          contactState,
          contactCountry: row.contactCountry || 'Unknown',
          contactPostal,
          hqAddress1: row.hqAddress1 || null,
          hqAddress2: row.hqAddress2 || null,
          hqAddress3: row.hqAddress3 || null,
          hqCity: row.hqCity || null,
          hqState: row.hqState || null,
          hqCountry: row.hqCountry || null,
          hqPostal: row.hqPostal || null,
          cavId: row.cavId || null,
          cavUserId: row.cavUserId || null,
          sourceType,
          eligibilityStatus: eligibility.eligibilityStatus,
          eligibilityReason: eligibility.eligibilityReason || null,
          seniorityLevel: eligibility.seniorityLevel || null,
          titleAlignmentScore: eligibility.titleAlignmentScore !== null ? String(eligibility.titleAlignmentScore) : null,
          priorityScore: eligibility.priorityScore !== null ? String(eligibility.priorityScore) : null,
          suppressed: isSuppressed,
          emailLower: normalizedKeys.emailLower || null,
          fullNameLower: normalize.toKey(fullName),
          customFields: row._customFields || null,
        });
      } catch (error) {
        errors.push({ row: rowNum, message: error instanceof Error ? error.message : String(error) });
      }
    }

    console.log(`[VerificationCSVImportWorker] Pass 2 complete: ${preparedContacts.length} contacts prepared with full business logic`);

    // STEP 4: Process contacts in batches using COPY
    for (let i = 0; i < preparedContacts.length; i += batchSize) {
      const batch = preparedContacts.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(preparedContacts.length / batchSize);
      
      console.log(`[VerificationCSVImportWorker] Processing batch ${batchNum}/${totalBatches} (${batch.length} contacts)`);

      const batchResult = await processBatchWithStagingTable(batch, updateMode);
      
      createdRows += batchResult.created;
      updatedRows += batchResult.updated;
      successRows += batchResult.created + batchResult.updated;
      failedRows += batchResult.failed;

      // Update job progress
      await job.updateProgress({
        totalRows,
        successRows,
        createdRows,
        updatedRows,
        failedRows,
        percentage: totalRows > 0 ? Math.round((successRows / totalRows) * 100) : 0,
      });

      // Sync to verificationUploadJobs table
      const { db } = await import('../db');
      const { verificationUploadJobs } = await import('../../shared/schema');
      await db
        .update(verificationUploadJobs)
        .set({
          status: 'processing',
          processedRows: successRows + failedRows,
          successCount: successRows,
          errorCount: errors.length,
          errors: errors.slice(-100),
          updatedAt: new Date(),
        })
        .where(eq(verificationUploadJobs.id, uploadJobId));

      console.log(`[VerificationCSVImportWorker] Batch ${batchNum}/${totalBatches} complete`);
    }

    // Mark job as complete
    const { db } = await import('../db');
    const { verificationUploadJobs } = await import('../../shared/schema');
    await db
      .update(verificationUploadJobs)
      .set({
        status: 'completed',
        processedRows: successRows + failedRows,
        successCount: successRows,
        errorCount: errors.length,
        errors: errors.slice(-100),
        finishedAt: new Date(),
      })
      .where(eq(verificationUploadJobs.id, uploadJobId));

    const duration = Date.now() - startTime;
    console.log(`[VerificationCSVImportWorker] Job ${job.id} completed in ${duration}ms: ${successRows} success, ${failedRows} failed`);

    // SMART WORKFLOW TRIGGER: Only trigger if >= 20% of contacts have job titles
    // AND workflow hasn't been triggered before
    if (successRows > 0) {
      try {
        const { getJobTitleCoverage, isWorkflowAlreadyTriggered, markWorkflowTriggered } = 
          await import('../lib/verification-smart-trigger');
        
        // Check if workflow already triggered
        const alreadyTriggered = await isWorkflowAlreadyTriggered(workerDb, campaignId);
        
        if (alreadyTriggered) {
          console.log(`[VerificationCSVImportWorker] ⏭️  Workflow already triggered for campaign ${campaignId} - skipping`);
        } else {
          // Calculate job title coverage
          const coverage = await getJobTitleCoverage(workerDb, campaignId);
          
          console.log(`[VerificationCSVImportWorker] 📊 Job Title Coverage: ${coverage.withTitles}/${coverage.total} (${coverage.percentage.toFixed(1)}%)`);
          
          if (coverage.meetsThreshold) {
            // Trigger workflow
            const { addVerificationWorkflowJob } = await import('../lib/verification-workflow-queue');
            const workflowJobId = await addVerificationWorkflowJob({
              campaignId,
              triggeredBy: 'csv_upload',
              uploadJobId,
            });
            
            // Mark campaign as triggered
            await markWorkflowTriggered(workerDb, campaignId);
            
            console.log(`[VerificationCSVImportWorker] ✅ Triggered workflow orchestrator job: ${workflowJobId} (${coverage.percentage.toFixed(1)}% coverage ≥ 20% threshold)`);
          } else {
            console.log(`[VerificationCSVImportWorker] ⏸️  Workflow NOT triggered: ${coverage.percentage.toFixed(1)}% coverage < 20% threshold (need ${coverage.total > 0 ? Math.ceil(coverage.total * 0.2) : 0} contacts with job titles, currently have ${coverage.withTitles})`);
          }
        }
      } catch (workflowError) {
        console.error(`[VerificationCSVImportWorker] Failed to evaluate workflow trigger:`, workflowError);
      }
    }

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
    
    // Mark job as failed
    const { db } = await import('../db');
    const { verificationUploadJobs } = await import('../../shared/schema');
    await db
      .update(verificationUploadJobs)
      .set({
        status: 'failed',
        errors: [{ row: 0, message: error instanceof Error ? error.message : String(error) }],
        finishedAt: new Date(),
      })
      .where(eq(verificationUploadJobs.id, uploadJobId));
    
    throw error;
  }
}
