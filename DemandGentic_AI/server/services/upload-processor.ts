import { db } from '../db';
import { verificationUploadJobs, verificationContacts, verificationCampaigns, accounts } from '@shared/schema';
import { eq, and, sql, isNotNull } from 'drizzle-orm';
import Papa from 'papaparse';
import { evaluateEligibility, checkSuppression, computeNormalizedKeys, normalize } from '../lib/verification-utils';
import { getMatchTypeAndConfidence, normalizeDomain, extractRootDomain } from '@shared/domain-utils';
import {
  normalizeDomain as normalizeWebDomain,
  normalizeLinkedInUrl,
  parseWebTechnologies,
  parseDurationToMonths,
  parseFoundedDate,
  validateAnnualRevenue
} from '../lib/data-normalization';
import { ALL_STANDARD_FIELDS } from '@shared/field-labels';

interface CSVRow {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  linkedinUrl?: string;
  formerPosition?: string;
  timeInCurrentPosition?: string;
  timeInCurrentCompany?: string;
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
  hqPhone?: string;
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
  
  // Company fields - aligned with schema
  annualRevenue?: string;
  revenueRange?: string;
  employeesSizeRange?: string;
  staffCount?: string;
  description?: string;
  websiteDomain?: string;
  foundedDate?: string;
  industry?: string;
  linkedinId?: string;
  webTechnologies?: string;
  sicCode?: string;
  naicsCode?: string;
}

const BATCH_SIZE = 500; // Process 500 rows per batch
const BULK_INSERT_SIZE = 100; // Insert 100 contacts at once

const autoMappings: Record = {
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
  'account_name': 'account_name',
  'organization': 'account_name',
  'employer': 'account_name',
  'companydomain': 'domain',
  'domain': 'domain',
  'website': 'domain',
  'companywebsite': 'domain',
  'hqaddress1': 'hqAddress1',
  'hqaddress2': 'hqAddress2',
  'hqaddress3': 'hqAddress3',
  'hqstreet1': 'hqAddress1',
  'hqstreet2': 'hqAddress2',
  'hqstreet3': 'hqAddress3',
  'hqcity': 'hqCity',
  'headquarterscity': 'hqCity',
  'hqstate': 'hqState',
  'headquartersstate': 'hqState',
  'hqpostalcode': 'hqPostal',
  'hqpostal': 'hqPostal',
  'hqzipcode': 'hqPostal',
  'hqcountry': 'hqCountry',
  'headquarterscountry': 'hqCountry',
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
  
  // NEW: Contact career fields
  'formerposition': 'formerPosition',
  'former_position': 'formerPosition',
  'previousposition': 'formerPosition',
  'timeincurrentposition': 'timeInCurrentPosition',
  'time_in_current_position': 'timeInCurrentPosition',
  'positiontenure': 'timeInCurrentPosition',
  'timeincurrentcompany': 'timeInCurrentCompany',
  'time_in_current_company': 'timeInCurrentCompany',
  'companytenure': 'timeInCurrentCompany',
  'tenure': 'timeInCurrentCompany',
  
  // NEW: Company custom fields
  'annualrevenue': 'annualRevenue',
  'annual_revenue': 'annualRevenue',
  'revenue': 'annualRevenue',
  'revenuerange': 'revenueRange',
  'revenue_range': 'revenueRange',
  'staffcountrange': 'employeesSizeRange',
  'staff_count_range': 'employeesSizeRange',
  'employeesizerange': 'employeesSizeRange',
  'employee_size_range': 'employeesSizeRange',
  'employeessizerange': 'employeesSizeRange',
  'employees_size_range': 'employeesSizeRange',
  'description': 'description',
  'companydescription': 'description',
  'company_description': 'description',
  'websitedomain': 'websiteDomain',
  'website_domain': 'websiteDomain',
  'foundeddate': 'foundedDate',
  'founded_date': 'foundedDate',
  'founded': 'foundedDate',
  'yearfounded': 'foundedDate',
  'industry': 'industry',
  'companyindustry': 'industry',
  'company_industry': 'industry',
  'linkedinid': 'linkedinId',
  'linkedin_id': 'linkedinId',
  'companylinkedinid': 'linkedinId',
  'company_linkedin_id': 'linkedinId',
  'webtechnologies': 'webTechnologies',
  'web_technologies': 'webTechnologies',
  'technologies': 'webTechnologies',
  'techstack': 'webTechnologies',
  'tech_stack': 'webTechnologies',
  'siccode': 'sicCode',
  'sic_code': 'sicCode',
  'sic': 'sicCode',
  'naicscode': 'naicsCode',
  'naics_code': 'naicsCode',
  'naics': 'naicsCode',
};

export async function processUpload(jobId: string) {
  try {
    const [uploadJob] = await db
      .select()
      .from(verificationUploadJobs)
      .where(eq(verificationUploadJobs.id, jobId));

    if (!uploadJob) {
      throw new Error('Upload job not found');
    }

    await db
      .update(verificationUploadJobs)
      .set({ status: 'processing', startedAt: new Date() })
      .where(eq(verificationUploadJobs.id, jobId));

    const { campaignId, csvData, fieldMappings, updateMode } = uploadJob;

    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const parseResult = Papa.parse(csvData || '', {
      header: true,
      skipEmptyLines: true,
      delimiter: '',
      delimitersToGuess: [',', '\t', '|', ';', Papa.RECORD_SEP, Papa.UNIT_SEP],
    });

    if (parseResult.errors.length > 0) {
      throw new Error(`CSV parsing failed: ${JSON.stringify(parseResult.errors)}`);
    }

    const userMappingLookup: Record = {};
    if (fieldMappings && Array.isArray(fieldMappings)) {
      (fieldMappings as any[]).forEach((mapping: any) => {
        if (mapping.csvColumn && mapping.targetField && mapping.targetField !== 'skip') {
          userMappingLookup[mapping.csvColumn] = mapping.targetField;
        }
      });
    }

    // Use centralized standard fields from shared/field-labels.ts
    // Also include upload-specific aliases that map to standard fields
    const uploadSpecificFields = new Set([
      // Upload aliases that map to standard schema fields
      'title', 'email', 'phone', 'mobile', 
      'contactAddress1', 'contactAddress2', 'contactAddress3', 'contactCity', 
      'contactState', 'contactCountry', 'contactPostal', 'sourceType',
      'companyName', 'account_name', 'companyDomain', 
      'hqPhone', 'hqAddress1', 'hqAddress2', 'hqAddress3', 'hqPostal',
      'industry'
    ]);
    const standardFields = new Set([...ALL_STANDARD_FIELDS, ...uploadSpecificFields]);

    const csvHeaders = parseResult.meta.fields || [];
    const mappedRows = (parseResult.data as any[]).map(csvRow => {
      const mappedRow: Record = {};
      const customFields: Record = {};
      
      for (const header of csvHeaders) {
        const headerLower = header.toLowerCase().replace(/[^a-z0-9_]/g, '');
        const targetField = userMappingLookup[header] || autoMappings[headerLower];
        
        if (targetField && csvRow[header] !== undefined && csvRow[header] !== null && csvRow[header] !== '') {
          // Check if this is a standard field or a custom field
          if (standardFields.has(targetField)) {
            mappedRow[targetField] = csvRow[header];
          } else {
            // This is a custom field - store in customFields object
            customFields[targetField] = csvRow[header];
          }
        }
      }
      
      // Add customFields to mappedRow if any exist
      if (Object.keys(customFields).length > 0) {
        mappedRow._customFields = customFields;
      }
      
      return mappedRow;
    }) as CSVRow[];

    const totalRows = mappedRows.length;
    await db
      .update(verificationUploadJobs)
      .set({ totalRows })
      .where(eq(verificationUploadJobs.id, jobId));

    let processedRows = 0;
    let successCount = 0;
    let errorCount = 0;
    const errors: Array = [];

    // OPTIMIZATION: Pre-load all accounts once for fast in-memory matching
    console.log('[Upload] Pre-loading all accounts for fast matching...');
    const allAccounts = await db.select().from(accounts);
    console.log(`[Upload] Loaded ${allAccounts.length} accounts into memory`);

    // Build lookup maps for O(1) domain matching
    const accountsByDomain = new Map();
    const accountsByNormalizedName = new Map();
    
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

    for (let batchStart = 0; batchStart  {
        // OPTIMIZATION: Collect contacts for bulk insert
        const contactsToInsert: any[] = [];
        const contactsToUpdate: Array = [];
        const newAccountsToCreate: any[] = [];
        const accountCache = new Map();

        for (let i = 0; i = 0.75 &&
                    (!bestMatch || matchResult.confidence > bestMatch.confidence)) {
                    bestMatch = {
                      account,
                      confidence: matchResult.confidence,
                    };
                  }
                }

                if (bestMatch) {
                  accountId = bestMatch.account.id;
                  accountData = bestMatch.account;
                  accountCache.set(cacheKey, accountData);
                }
              }

              // Create new account ONLY if we have either a domain or company name
              // This prevents creating duplicate "Unknown Company" accounts for personal-email-only contacts
              if (!accountId && (domainForMatching || accountNameCsv)) {
                const normalizedWebDomain = normalizeWebDomain(row.websiteDomain || row.domain);
                const normalizedLinkedInUrl = normalizeLinkedInUrl(row.linkedinUrl);
                const webTechParsed = parseWebTechnologies(row.webTechnologies);
                const foundedDateParsed = parseFoundedDate(row.foundedDate);
                const validatedRevenue = validateAnnualRevenue(row.annualRevenue);
                
                // Use domainForMatching (CSV domain or corporate email domain, never personal)
                const domainForNewAccount = domainForMatching;
                
                const newAccountData = {
                  name: accountNameCsv ?? (domainForNewAccount ? domainForNewAccount.split('.')[0] : 'Unknown Company'),
                  domain: domainForNewAccount,
                  mainPhone: row.hqPhone ?? null,
                  hqStreet1: row.hqAddress1 ?? null,
                  hqStreet2: row.hqAddress2 ?? null,
                  hqStreet3: row.hqAddress3 ?? null,
                  hqCity: row.hqCity ?? null,
                  hqState: row.hqState ?? null,
                  hqPostalCode: row.hqPostal ?? null,
                  hqCountry: row.hqCountry ?? null,
                  annualRevenue: validatedRevenue,
                  description: row.description ?? null,
                  websiteDomain: normalizedWebDomain,
                  foundedDate: foundedDateParsed.date ? new Date(foundedDateParsed.date) : null,
                  foundedDatePrecision: foundedDateParsed.precision,
                  industry: row.industry ?? null,
                  linkedinId: row.linkedinId ?? null,
                  linkedinUrl: normalizedLinkedInUrl,
                  webTechnologies: webTechParsed.raw,
                  webTechnologiesJson: webTechParsed.json,
                  sicCode: row.sicCode ?? null,
                  naicsCode: row.naicsCode ?? null,
                };
                
                newAccountsToCreate.push(newAccountData);
                // Temporarily store for this batch
                accountData = { ...newAccountData, id: `temp_${newAccountsToCreate.length}` };
                accountId = accountData.id;
                accountCache.set(cacheKey, accountData);
              } else if (!accountId) {
                // Log warning for contacts with only personal emails and no company info
                console.warn(`[Upload] Row ${globalIndex + 1}: Skipping account creation - only personal email domain (${emailRootDomain}) with no company name/domain`);
              }
            }

            const fullName = row.fullName || `${row.firstName || ''} ${row.lastName || ''}`.trim();
            
            // Contacts with CAV data are always Client_Provided
            const hasCavData = !!((row.cavId?.trim()) || (row.cavUserId?.trim()));
            const sourceType: 'Client_Provided' | 'New_Sourced' = hasCavData
              ? 'Client_Provided'
              : (row.sourceType?.toLowerCase() === 'client_provided' || row.sourceType?.toLowerCase() === 'client provided')
                ? 'Client_Provided'
                : 'New_Sourced';

            const normalizedKeys = computeNormalizedKeys({
              email: row.email || null,
              firstName: row.firstName || null,
              lastName: row.lastName || null,
              contactCountry: row.contactCountry || null,
              accountName: accountNameCsv,
            });

            const eligibility = evaluateEligibility(
              row.title || null,
              row.contactCountry || null,
              campaign,
              row.email || null
            );

            const isSuppressed = await checkSuppression(campaignId, {
              email: row.email || null,
              cavId: row.cavId || null,
              cavUserId: row.cavUserId || null,
              fullName,
              account_name: accountNameCsv,
            });

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
              const csvHasCavId = !!((row.cavId?.trim()) || (row.cavUserId?.trim()));
              const dbHasCavId = !!((existingContact.cavId?.trim()) || (existingContact.cavUserId?.trim()));

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
                // Update HQ fields from CSV or account data
                if (row.hqAddress1 || accountData?.hqStreet1) updateData.hqAddress1 = row.hqAddress1 || accountData?.hqStreet1;
                if (row.hqAddress2 || accountData?.hqStreet2) updateData.hqAddress2 = row.hqAddress2 || accountData?.hqStreet2;
                if (row.hqAddress3 || accountData?.hqStreet3) updateData.hqAddress3 = row.hqAddress3 || accountData?.hqStreet3;
                if (row.hqCity || accountData?.hqCity) updateData.hqCity = row.hqCity || accountData?.hqCity;
                if (row.hqState || accountData?.hqState) updateData.hqState = row.hqState || accountData?.hqState;
                if (row.hqCountry || accountData?.hqCountry) updateData.hqCountry = row.hqCountry || accountData?.hqCountry;
                if (row.hqPostal || accountData?.hqPostalCode) updateData.hqPostal = row.hqPostal || accountData?.hqPostalCode;
                if (accountData?.mainPhone) updateData.hqPhone = accountData.mainPhone;
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
                // Update HQ fields from CSV or account data
                if (row.hqAddress1 || accountData?.hqStreet1) updateData.hqAddress1 = row.hqAddress1 || accountData?.hqStreet1;
                if (row.hqAddress2 || accountData?.hqStreet2) updateData.hqAddress2 = row.hqAddress2 || accountData?.hqStreet2;
                if (row.hqAddress3 || accountData?.hqStreet3) updateData.hqAddress3 = row.hqAddress3 || accountData?.hqStreet3;
                if (row.hqCity || accountData?.hqCity) updateData.hqCity = row.hqCity || accountData?.hqCity;
                if (row.hqState || accountData?.hqState) updateData.hqState = row.hqState || accountData?.hqState;
                if (row.hqCountry || accountData?.hqCountry) updateData.hqCountry = row.hqCountry || accountData?.hqCountry;
                if (row.hqPostal || accountData?.hqPostalCode) updateData.hqPostal = row.hqPostal || accountData?.hqPostalCode;
                if (accountData?.mainPhone) updateData.hqPhone = accountData.mainPhone;
              }

              updateData.eligibilityStatus = eligibility.status;
              updateData.eligibilityReason = eligibility.reason;
              updateData.suppressed = isSuppressed;
              
              // Contacts with CAV data must always be Client_Provided
              if (csvHasCavId || dbHasCavId) {
                updateData.sourceType = 'Client_Provided';
              }
              
              // Merge custom fields if present
              const customFieldsInRow = (row as any)._customFields || {};
              if (Object.keys(customFieldsInRow).length > 0) {
                // Merge with existing custom fields
                const existingCustomFields = existingContact.customFields || {};
                updateData.customFields = { ...existingCustomFields, ...customFieldsInRow };
              }
              
              Object.assign(updateData, normalizedKeys);

              if (Object.keys(updateData).length > 0) {
                contactsToUpdate.push({ id: existingContact.id, data: updateData });
              }
              successCount++;
            } else {
              // OPTIMIZATION: Collect for bulk insert
              const positionMonths = parseDurationToMonths(row.timeInCurrentPosition);
              const companyMonths = parseDurationToMonths(row.timeInCurrentCompany);
              
              // Extract custom fields if present
              const customFieldsToStore = (row as any)._customFields || {};
              
              contactsToInsert.push({
                campaignId,
                accountId, // May be temp ID, will replace after account creation
                sourceType,
                fullName,
                firstName: row.firstName || null,
                lastName: row.lastName || null,
                title: row.title || null,
                email: row.email || null,
                phone: contactPhone,
                mobile: row.mobile || null,
                linkedinUrl: row.linkedinUrl || null,
                formerPosition: row.formerPosition || null,
                timeInCurrentPosition: row.timeInCurrentPosition || null,
                timeInCurrentPositionMonths: positionMonths,
                timeInCurrentCompany: row.timeInCurrentCompany || null,
                timeInCurrentCompanyMonths: companyMonths,
                contactAddress1,
                contactAddress2,
                contactAddress3,
                contactCity,
                contactState,
                contactCountry: row.contactCountry || null,
                contactPostal,
                // CRITICAL FIX: Populate HQ fields from account data if available (for smart address selection)
                // Fallback to CSV row if provided explicitly
                hqAddress1: row.hqAddress1 || accountData?.hqStreet1 || null,
                hqAddress2: row.hqAddress2 || accountData?.hqStreet2 || null,
                hqAddress3: row.hqAddress3 || accountData?.hqStreet3 || null,
                hqCity: row.hqCity || accountData?.hqCity || null,
                hqState: row.hqState || accountData?.hqState || null,
                hqCountry: row.hqCountry || accountData?.hqCountry || null,
                hqPostal: row.hqPostal || accountData?.hqPostalCode || null,
                hqPhone: accountData?.mainPhone || null,
                cavId: row.cavId || null,
                cavUserId: row.cavUserId || null,
                eligibilityStatus: eligibility.status,
                eligibilityReason: eligibility.reason,
                suppressed: isSuppressed,
                customFields: Object.keys(customFieldsToStore).length > 0 ? customFieldsToStore : null,
                ...normalizedKeys,
              });
              successCount++;
            }
          } catch (error: any) {
            errorCount++;
            errors.push({ row: globalIndex + 1, message: error.message || 'Unknown error' });
          }
        }

        // OPTIMIZATION: Bulk create new accounts
        const tempToRealAccountId = new Map();
        if (newAccountsToCreate.length > 0) {
          console.log(`[Upload] Bulk creating ${newAccountsToCreate.length} new accounts...`);
          const createdAccounts = await tx.insert(accounts).values(newAccountsToCreate).returning();
          createdAccounts.forEach((account, index) => {
            const tempId = `temp_${index + 1}`;
            tempToRealAccountId.set(tempId, account.id);
            
            // Update in-memory maps for future lookups with REAL account object
            if (account.domain) {
              accountsByDomain.set(account.domain.toLowerCase().trim(), account);
            }
            if (account.name) {
              const normalizedName = normalize.companyKey(account.name);
              const existing = accountsByNormalizedName.get(normalizedName) || [];
              // Remove any temp account entries and add the real account
              const filtered = existing.filter(a => a.id !== tempId);
              filtered.push(account);
              accountsByNormalizedName.set(normalizedName, filtered);
            }
          });
        }

        // OPTIMIZATION: Replace temp account IDs with real ones
        for (const contact of contactsToInsert) {
          if (contact.accountId && contact.accountId.startsWith('temp_')) {
            contact.accountId = tempToRealAccountId.get(contact.accountId) || contact.accountId;
          }
        }

        // OPTIMIZATION: Bulk insert contacts
        if (contactsToInsert.length > 0) {
          console.log(`[Upload] Bulk inserting ${contactsToInsert.length} contacts...`);
          await tx.insert(verificationContacts).values(contactsToInsert).onConflictDoNothing({
            target: [verificationContacts.campaignId, verificationContacts.accountId, verificationContacts.fullName],
          });
        }

        // OPTIMIZATION: Bulk update contacts
        if (contactsToUpdate.length > 0) {
          console.log(`[Upload] Updating ${contactsToUpdate.length} contacts...`);
          for (const { id, data } of contactsToUpdate) {
            await tx.update(verificationContacts).set(data).where(eq(verificationContacts.id, id));
          }
        }
      });

      processedRows += batch.length;

      await db
        .update(verificationUploadJobs)
        .set({
          processedRows,
          successCount,
          errorCount,
          errors,
          updatedAt: new Date(),
        })
        .where(eq(verificationUploadJobs.id, jobId));
    }

    await db
      .update(verificationUploadJobs)
      .set({
        status: 'completed',
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(verificationUploadJobs.id, jobId));

    console.log(`[Upload Processor] Job ${jobId} completed: ${successCount} success, ${errorCount} errors`);
  } catch (error: any) {
    console.error(`[Upload Processor] Job ${jobId} failed:`, error);

    await db
      .update(verificationUploadJobs)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        errors: [{ row: 0, message: error.message || 'Upload job failed' }],
        updatedAt: new Date(),
      })
      .where(eq(verificationUploadJobs.id, jobId))
      .catch(err => console.error('[Upload Processor] Failed to update job status:', err));
  }
}