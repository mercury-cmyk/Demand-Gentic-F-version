import { Router, Request, Response } from "express";
import { db } from "../db";
import { verificationContacts, verificationCampaigns, verificationUploadJobs, accounts } from "@shared/schema";
import { eq, and, or, sql } from "drizzle-orm";
import Papa from "papaparse";
import multer from "multer";
import { evaluateEligibility, evaluateEligibilityWithCap, checkSuppression, computeNormalizedKeys, normalize } from "../lib/verification-utils";
import { getMatchTypeAndConfidence, normalizeDomain, extractRootDomain } from "@shared/domain-utils";
import { requireAuth } from "../auth";

const router = Router();

/**
 * Process a single verification contact row within a transaction
 * Handles account matching, eligibility evaluation, and contact insert/update
 */
async function processVerificationRow(
  tx: any,
  row: CSVRow,
  rowIndex: number,
  campaignId: string,
  campaign: any,
  updateMode: boolean,
  results: {
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
    updatedContacts: Array<{
      id: string;
      fullName: string;
      email: string | null;
      accountName: string | null;
      fieldsUpdated: string[];
    }>;
  }
): Promise<void> {
  // Validate name
  if (!row.fullName && !row.firstName && !row.lastName) {
    results.skipped++;
    results.errors.push(`Row ${rowIndex + 1}: Missing name information`);
    return;
  }

  // Resolve/create account using advanced fuzzy matching
  const accountNameCsv = row.account_name || row.companyName || null;
  const domainValue = (row.domain || row.companyDomain || null)?.toLowerCase() || null;
  const emailDomain = row.email ? normalize.extractDomain(row.email) : null;

  let accountId: string | null = null;
  let accountData: any = null;
  let matchConfidence = 0;
  let matchedBy = '';
  
  // Get input domain (prioritize explicit domain, fallback to email domain)
  const inputDomain = domainValue || emailDomain || '';
  
  // STEP 1: Try exact domain match on ROOT DOMAIN (fast path)
  const normalizedInput = inputDomain ? normalizeDomain(inputDomain) : '';
  const rootDomain = normalizedInput ? extractRootDomain(normalizedInput) : '';
  
  if (rootDomain) {
    const exactMatch = await tx
      .select()
      .from(accounts)
      .where(sql`
        ${accounts.domain} IS NOT NULL 
        AND LOWER(TRIM(${accounts.domain})) = ${rootDomain.toLowerCase()}
      `)
      .limit(1);
    
    if (exactMatch.length > 0) {
      accountId = exactMatch[0].id;
      accountData = exactMatch[0];
      matchConfidence = 1.0;
      matchedBy = 'exact_root_domain';
    }
  }
  
  // STEP 2: If no exact match, try fuzzy matching
  if (!accountId && (inputDomain || accountNameCsv)) {
    let candidateAccounts: typeof accounts.$inferSelect[] = [];
    
    if (accountNameCsv) {
      const coreWords = normalize.companyKey(accountNameCsv).split(' ').filter(w => w.length > 2);
      const likePattern = coreWords.length > 0 ? `%${coreWords[0]}%` : `%${accountNameCsv}%`;
      
      candidateAccounts = await tx
        .select()
        .from(accounts)
        .where(sql`LOWER(${accounts.name}) LIKE LOWER(${likePattern})`)
        .limit(200);
    }
    
    if (candidateAccounts.length === 0 && normalizedInput) {
      const domainRoot = normalizedInput.split('.')[0];
      candidateAccounts = await tx
        .select()
        .from(accounts)
        .where(sql`${accounts.domain} IS NOT NULL AND ${accounts.domain} LIKE ${`%${domainRoot}%`}`)
        .limit(200);
    }
    
    if (candidateAccounts.length === 0) {
      candidateAccounts = await tx
        .select()
        .from(accounts)
        .limit(500);
    }
    
    let bestMatch: { account: typeof accounts.$inferSelect; confidence: number; matchedBy: string } | null = null;
    
    for (const account of candidateAccounts) {
      const matchResult = getMatchTypeAndConfidence(
        normalizedInput,
        accountNameCsv || undefined,
        account.domain || '',
        account.name
      );
      
      if ((matchResult.matchType === 'exact' || matchResult.matchType === 'fuzzy') && 
          matchResult.confidence >= 0.75 &&
          (!bestMatch || matchResult.confidence > bestMatch.confidence)) {
        bestMatch = {
          account,
          confidence: matchResult.confidence,
          matchedBy: matchResult.matchedBy || 'unknown'
        };
      }
    }
    
    if (bestMatch) {
      accountId = bestMatch.account.id;
      accountData = bestMatch.account;
      matchConfidence = bestMatch.confidence;
      matchedBy = bestMatch.matchedBy;
    }
  }
  
  // STEP 3: Create new account if no match found
  if (!accountId) {
    const rootDomainForNew = normalizedInput ? extractRootDomain(normalizedInput) : null;
    
    const newAccount = await tx.insert(accounts).values({
      name: accountNameCsv ?? (rootDomainForNew ? rootDomainForNew.split('.')[0] : 'Unknown Company'),
      domain: rootDomainForNew,
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
  }

  const fullName = row.fullName || `${row.firstName || ''} ${row.lastName || ''}`.trim();
  const sourceType: 'Client_Provided' | 'New_Sourced' = (row.sourceType?.toLowerCase() === 'client_provided' || row.sourceType?.toLowerCase() === 'client provided')
    ? 'Client_Provided'
    : 'New_Sourced';

  const normalizedKeys = computeNormalizedKeys({
    email: row.email || null,
    firstName: row.firstName || null,
    lastName: row.lastName || null,
    contactCountry: row.contactCountry || null,
    accountName: accountNameCsv,
  });

  const eligibility = await evaluateEligibilityWithCap(
    {
      title: row.title || null,
      contactCountry: row.contactCountry || null,
      email: row.email || null,
      accountId: accountId || null,
    },
    campaign
  );

  const isSuppressed = await checkSuppression(campaignId, {
    email: row.email || null,
    cavId: row.cavId || null,
    cavUserId: row.cavUserId || null,
    fullName,
    account_name: accountNameCsv,
  });

  // Auto-populate contact address and phone from company HQ if countries match
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

  // Check for existing contact if update mode is enabled
  let existingContact = null;
  if (updateMode) {
    if (row.email && normalizedKeys.emailLower) {
      const emailMatches = await tx
        .select()
        .from(verificationContacts)
        .where(and(
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.deleted, false),
          eq(verificationContacts.emailLower, normalizedKeys.emailLower)
        ))
        .limit(2);
      
      if (emailMatches.length === 1) {
        existingContact = emailMatches[0];
      }
    }
    
    if (!existingContact && row.contactCountry && accountData) {
      const nameMatches = await tx
        .select()
        .from(verificationContacts)
        .where(and(
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.deleted, false),
          sql`LOWER(TRIM(${verificationContacts.fullName})) = LOWER(TRIM(${fullName}))`,
          sql`LOWER(TRIM(${verificationContacts.contactCountry})) = LOWER(TRIM(${row.contactCountry}))`,
          eq(verificationContacts.accountId, accountData.id)
        ))
        .limit(2);
      
      if (nameMatches.length === 1) {
        existingContact = nameMatches[0];
      }
    }
  }

  if (existingContact) {
    // Update existing contact
    const csvHasCavId = !!(row.cavId || row.cavUserId);
    const dbHasCavId = !!(existingContact.cavId || existingContact.cavUserId);
    
    const updateData: any = {};
    
    if (csvHasCavId) {
      if (row.cavId) updateData.cavId = row.cavId;
      if (row.cavUserId) updateData.cavUserId = row.cavUserId;
    } else if (dbHasCavId) {
      if (row.firstName) updateData.firstName = row.firstName;
      if (row.lastName) updateData.lastName = row.lastName;
      if (row.title) updateData.title = row.title;
      if (row.email) updateData.email = row.email;
      if (contactPhone) updateData.phone = contactPhone;
      if (row.mobile) updateData.mobile = row.mobile;
      if (row.linkedinUrl) updateData.linkedinUrl = row.linkedinUrl;
      if (contactAddress1) updateData.contactAddress1 = contactAddress1;
      if (contactAddress2) updateData.contactAddress2 = contactAddress2;
      if (contactAddress3) updateData.contactAddress3 = contactAddress3;
      if (contactCity) updateData.contactCity = contactCity;
      if (contactState) updateData.contactState = contactState;
      if (row.contactCountry) updateData.contactCountry = row.contactCountry;
      if (contactPostal) updateData.contactPostal = contactPostal;
      if (row.hqAddress1) updateData.hqAddress1 = row.hqAddress1;
      if (row.hqAddress2) updateData.hqAddress2 = row.hqAddress2;
      if (row.hqAddress3) updateData.hqAddress3 = row.hqAddress3;
      if (row.hqCity) updateData.hqCity = row.hqCity;
      if (row.hqState) updateData.hqState = row.hqState;
      if (row.hqCountry) updateData.hqCountry = row.hqCountry;
      if (row.hqPostal) updateData.hqPostal = row.hqPostal;
    } else {
      if (row.firstName) updateData.firstName = row.firstName;
      if (row.lastName) updateData.lastName = row.lastName;
      if (row.title) updateData.title = row.title;
      if (row.email) updateData.email = row.email;
      if (contactPhone) updateData.phone = contactPhone;
      if (row.mobile) updateData.mobile = row.mobile;
      if (row.linkedinUrl) updateData.linkedinUrl = row.linkedinUrl;
      if (contactAddress1) updateData.contactAddress1 = contactAddress1;
      if (contactAddress2) updateData.contactAddress2 = contactAddress2;
      if (contactAddress3) updateData.contactAddress3 = contactAddress3;
      if (contactCity) updateData.contactCity = contactCity;
      if (contactState) updateData.contactState = contactState;
      if (row.contactCountry) updateData.contactCountry = row.contactCountry;
      if (contactPostal) updateData.contactPostal = contactPostal;
      if (row.hqAddress1) updateData.hqAddress1 = row.hqAddress1;
      if (row.hqAddress2) updateData.hqAddress2 = row.hqAddress2;
      if (row.hqAddress3) updateData.hqAddress3 = row.hqAddress3;
      if (row.hqCity) updateData.hqCity = row.hqCity;
      if (row.hqState) updateData.hqState = row.hqState;
      if (row.hqCountry) updateData.hqCountry = row.hqCountry;
      if (row.hqPostal) updateData.hqPostal = row.hqPostal;
    }
    
    updateData.eligibilityStatus = eligibility.eligibilityStatus;
    updateData.eligibilityReason = eligibility.eligibilityReason;
    updateData.seniorityLevel = eligibility.seniorityLevel;
    updateData.titleAlignmentScore = String(eligibility.titleAlignmentScore);
    updateData.priorityScore = String(eligibility.priorityScore);
    updateData.suppressed = isSuppressed;
    Object.assign(updateData, normalizedKeys);
    
    if (Object.keys(updateData).length > 0) {
      await tx
        .update(verificationContacts)
        .set(updateData)
        .where(eq(verificationContacts.id, existingContact.id));
      
      results.updated++;
      results.updatedContacts.push({
        id: existingContact.id,
        fullName: existingContact.fullName,
        email: existingContact.email,
        accountName: accountData?.name || null,
        fieldsUpdated: Object.keys(updateData).filter(k => !['emailLower', 'fullNameLower'].includes(k)),
      });
    } else {
      results.skipped++;
    }
  } else {
    // Insert new contact
    await tx.insert(verificationContacts).values({
      campaignId,
      accountId,
      sourceType,
      fullName,
      firstName: row.firstName || null,
      lastName: row.lastName || null,
      title: row.title || null,
      email: row.email || null,
      phone: contactPhone,
      mobile: row.mobile || null,
      linkedinUrl: row.linkedinUrl || null,
      contactAddress1,
      contactAddress2,
      contactAddress3,
      contactCity,
      contactState,
      contactCountry: row.contactCountry || null,
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
      eligibilityStatus: eligibility.eligibilityStatus,
      eligibilityReason: eligibility.eligibilityReason,
      seniorityLevel: eligibility.seniorityLevel,
      titleAlignmentScore: String(eligibility.titleAlignmentScore),
      priorityScore: String(eligibility.priorityScore),
      suppressed: isSuppressed,
      ...normalizedKeys,
    }).onConflictDoNothing({
      target: [verificationContacts.campaignId, verificationContacts.accountId, verificationContacts.fullName],
    });

    results.created++;
  }
}

interface CSVRow {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  linkedinUrl?: string;
  contactAddress1?: string;
  contactAddress2?: string;
  contactAddress3?: string;
  contactCity?: string;
  contactState?: string;
  contactCountry?: string;
  contactPostal?: string;
  companyName?: string;
  account_name?: string;
  companyDomain?: string;
  domain?: string;
  hqAddress1?: string;
  hqAddress2?: string;
  hqAddress3?: string;
  hqCity?: string;
  hqState?: string;
  hqPostal?: string;
  hqCountry?: string;
  cavId?: string;
  cavUserId?: string;
  sourceType?: string;
}

/**
 * MULTIPART: Large file upload using FormData (handles 50MB+ files without truncation)
 * Uses multer for file streaming, avoids JSON string size limits
 */
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

router.post("/api/verification-campaigns/:campaignId/upload-multipart", requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  console.log('[MULTIPART UPLOAD] Endpoint hit, campaignId:', req.params.campaignId);
  
  try {
    const { campaignId } = req.params;
    const file = req.file;
    const fieldMappings = req.body.fieldMappings ? JSON.parse(req.body.fieldMappings) : [];
    const updateMode = req.body.updateMode === 'true';
    const userId = (req as any).user?.userId;

    console.log('[MULTIPART UPLOAD] File size:', file?.size, 'bytes');
    console.log('[MULTIPART UPLOAD] Field mappings:', fieldMappings?.length);

    if (!file) {
      return res.status(400).json({ error: "File is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Get CSV content from buffer
    const csvData = file.buffer.toString('utf-8');
    console.log('[MULTIPART UPLOAD] CSV content length:', csvData.length);

    // Parse CSV to extract headers
    const parseResult = Papa.parse(csvData, {
      header: true,
      preview: 1,
      skipEmptyLines: true,
      delimitersToGuess: [',', '\t', '|', ';'],
    });

    if (parseResult.errors.length > 0) {
      return res.status(400).json({
        error: "CSV parsing failed",
        details: parseResult.errors,
      });
    }

    const headers = parseResult.meta.fields || [];

    // Upload CSV to S3
    console.log('[MULTIPART UPLOAD] Uploading to S3...');
    const { uploadToS3 } = await import('../lib/s3');
    const s3Key = `verification-uploads/${campaignId}/${Date.now()}-${Math.random().toString(36).substring(7)}.csv`;
    await uploadToS3(s3Key, file.buffer, 'text/csv');

    console.log(`[MULTIPART UPLOAD] Uploaded CSV to S3: ${s3Key}`);

    // Create upload job record
    const [uploadJob] = await db
      .insert(verificationUploadJobs)
      .values({
        campaignId,
        jobType: 'contacts',
        status: 'pending',
        totalRows: 0,
        processedRows: 0,
        successCount: 0,
        errorCount: 0,
        s3Key,
        fieldMappings: fieldMappings || [],
        updateMode: updateMode || false,
        createdBy: userId,
      })
      .returning();

    // Queue BullMQ job
    const { addVerificationCSVImportJob } = await import('../lib/verification-csv-import-queue');
    const bullMQJobId = await addVerificationCSVImportJob({
      s3Key,
      userId,
      campaignId,
      uploadJobId: uploadJob.id,
      fieldMappings: fieldMappings || [],
      headers,
      updateMode: updateMode || false,
      batchSize: 5000,
    });

    if (!bullMQJobId) {
      return res.status(500).json({ error: "Failed to queue import job" });
    }

    console.log(`[MULTIPART UPLOAD] Queued BullMQ job ${bullMQJobId} for upload job ${uploadJob.id}`);

    res.json({
      success: true,
      uploadJobId: uploadJob.id,
      bullMQJobId,
      message: "Upload queued for processing. Check job status for progress.",
    });

  } catch (error) {
    console.error("Error in multipart upload:", error);
    res.status(500).json({ error: "Failed to process upload" });
  }
});

/**
 * OPTIMIZED: Verification contact upload using S3 + BullMQ + PostgreSQL COPY
 * 10-20x faster than synchronous processing
 */
router.post("/api/verification-campaigns/:campaignId/upload-optimized", requireAuth, async (req: Request, res: Response) => {
  console.log('[UPLOAD DEBUG] Upload endpoint hit, campaignId:', req.params.campaignId);
  console.log('[UPLOAD DEBUG] User:', (req as any).user);
  console.log('[UPLOAD DEBUG] Request body keys:', Object.keys(req.body));
  console.log('[UPLOAD DEBUG] csvData length:', req.body.csvData?.length);
  
  try {
    const { campaignId } = req.params;
    const { csvData, fieldMappings, updateMode } = req.body;
    const userId = (req as any).user?.userId; // FIX: payload has 'userId' not 'id'

    console.log('[UPLOAD DEBUG] Parsed parameters:', { campaignId, userId, fieldMappingsLength: fieldMappings?.length, updateMode });

    if (!csvData) {
      console.log('[UPLOAD DEBUG] Missing csvData');
      return res.status(400).json({ error: "csvData is required" });
    }

    if (!userId) {
      console.log('[UPLOAD DEBUG] Missing userId');
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    console.log('[UPLOAD DEBUG] Fetching campaign...');

    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Parse CSV to extract headers and count rows
    const parseResult = Papa.parse(csvData, {
      header: true,
      preview: 1, // Just parse first row to get headers
      skipEmptyLines: true,
      delimitersToGuess: [',', '\t', '|', ';'],
    });

    if (parseResult.errors.length > 0) {
      return res.status(400).json({
        error: "CSV parsing failed",
        details: parseResult.errors,
      });
    }

    const headers = parseResult.meta.fields || [];

    // Upload CSV to S3 IMMEDIATELY - don't count rows synchronously
    // Worker will count rows during async processing
    console.log('[UPLOAD DEBUG] Uploading to S3...');
    const { uploadToS3 } = await import('../lib/s3');
    const s3Key = `verification-uploads/${campaignId}/${Date.now()}-${Math.random().toString(36).substring(7)}.csv`;
    await uploadToS3(s3Key, Buffer.from(csvData, 'utf-8'), 'text/csv');

    console.log(`[VerificationUpload] Uploaded CSV to S3: ${s3Key}`);

    // Create upload job record (totalRows will be updated by worker)
    const [uploadJob] = await db
      .insert(verificationUploadJobs)
      .values({
        campaignId,
        jobType: 'contacts',
        status: 'pending',
        totalRows: 0, // Worker will update this
        processedRows: 0,
        successCount: 0,
        errorCount: 0,
        s3Key, // Store S3 key for job recovery
        fieldMappings: fieldMappings || [],
        updateMode: updateMode || false,
        createdBy: userId,
      })
      .returning();

    // Queue BullMQ job for async processing
    const { addVerificationCSVImportJob } = await import('../lib/verification-csv-import-queue');
    const bullMQJobId = await addVerificationCSVImportJob({
      s3Key,
      userId,
      campaignId,
      uploadJobId: uploadJob.id,
      fieldMappings: fieldMappings || [],
      headers,
      updateMode: updateMode || false,
      batchSize: 5000,
    });

    if (!bullMQJobId) {
      return res.status(500).json({ error: "Failed to queue import job" });
    }

    console.log(`[VerificationUpload] Queued BullMQ job ${bullMQJobId} for upload job ${uploadJob.id}`);

    // Return immediately - processing happens in background
    res.json({
      success: true,
      uploadJobId: uploadJob.id,
      bullMQJobId,
      message: "Upload queued for processing. Check job status for progress.",
    });

  } catch (error) {
    console.error("Error queueing verification upload:", error);
    res.status(500).json({ error: "Failed to queue upload" });
  }
});

/**
 * LEGACY: Synchronous upload (kept for compatibility)
 */
router.post("/api/verification-campaigns/:campaignId/upload", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { csvData, fieldMappings, updateMode } = req.body;
    const userId = (req as any).user?.userId; // FIX: payload has 'userId' not 'id'

    if (!csvData) {
      return res.status(400).json({ error: "csvData is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Parse CSV WITHOUT transforming headers first - keep original headers
    const parseResult = Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
      delimiter: "",  // Auto-detect delimiter
      delimitersToGuess: [',', '\t', '|', ';', Papa.RECORD_SEP, Papa.UNIT_SEP],
    });

    if (parseResult.errors.length > 0) {
      return res.status(400).json({
        error: "CSV parsing failed",
        details: parseResult.errors,
      });
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

    // Auto-mapping fallback
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
      'cavid': 'cavId',
      'cavuserid': 'cavUserId',
      'sourcetype': 'sourceType',
      'source': 'sourceType',
    };

    // Map each row's data to expected fields
    const mappedRows = parseResult.data.map((rawRow: any) => {
      const mappedRow: any = {};
      
      Object.keys(rawRow).forEach(csvHeader => {
        // First check user's custom mapping
        let targetField = userMappingLookup[csvHeader];
        
        // Fall back to auto-mapping
        if (!targetField) {
          const normalized = csvHeader.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          targetField = autoMappings[normalized];
        }
        
        // If we found a target field, copy the value
        if (targetField && rawRow[csvHeader]) {
          mappedRow[targetField] = rawRow[csvHeader];
        }
      });
      
      return mappedRow;
    }) as CSVRow[];

    const rows = mappedRows;
    const results = {
      total: rows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
      updatedContacts: [] as Array<{
        id: string;
        fullName: string;
        email: string | null;
        accountName: string | null;
        fieldsUpdated: string[];
      }>,
    };

    // BATCH PROCESSING: Process in chunks to prevent transaction timeout
    const BATCH_SIZE = 500; // Process 500 rows per transaction
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
    
    console.log(`[VerificationUpload] Starting upload of ${rows.length} contacts in ${totalBatches} batches`);
    
    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batchStart = batchIdx * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, rows.length);
      const batchRows = rows.slice(batchStart, batchEnd);
      
      console.log(`[VerificationUpload] Processing batch ${batchIdx + 1}/${totalBatches} (rows ${batchStart + 1}-${batchEnd})`);
      
      // Each batch gets its own transaction
      try {
        await db.transaction(async (tx) => {
          for (let i = 0; i < batchRows.length; i++) {
            const row = batchRows[i];
            const rowIndex = batchStart + i; // Global row index for error reporting
            
            try {
              await processVerificationRow(tx, row, rowIndex, campaignId, campaign, updateMode, results);
            } catch (error: any) {
              results.skipped++;
              results.errors.push(`Row ${rowIndex + 1}: ${error.message ?? String(error)}`);
            }
          }
        });
        
        console.log(`[VerificationUpload] Batch ${batchIdx + 1}/${totalBatches} complete: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped`);
      } catch (batchError) {
        console.error(`[VerificationUpload] Batch ${batchIdx + 1}/${totalBatches} failed:`, batchError);
        results.errors.push(`Batch ${batchIdx + 1} failed: ${batchError instanceof Error ? batchError.message : String(batchError)}`);
        // Continue with next batch even if this one failed
      }
    }
    
    console.log(`[VerificationUpload] Upload complete: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped, ${results.errors.length} errors`);
    res.json(results);
  } catch (error) {
    console.error("Error uploading verification contacts:", error);
    res.status(500).json({ error: "Failed to upload contacts" });
  }
});

export default router;
