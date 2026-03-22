/**
 * Centralized Field Label Mapping
 * 
 * Maps database field names to standardized display labels
 * This is presentation layer only - database schema remains unchanged
 * 
 * Usage:
 * - UI components should use these labels for display
 * - CSV exports should use these as column headers
 * - Forms should use these as field labels
 */

// ============================================
// CONTACT INFORMATION
// ============================================
export const CONTACT_FIELD_LABELS = {
  // Identity & Professional
  id: "Contact ID",
  cavId: "CAV_ID",
  cavUserId: "CAV_User_ID",
  fullName: "full_name",
  firstName: "first_name",
  lastName: "last_name",
  email: "Email_Address",
  emailNormalized: "Email_Address (normalized)",
  jobTitle: "job_title",
  department: "Department",
  seniorityLevel: "Seniority Level",
  linkedinUrl: "linkedin_url",
  
  // Career & Tenure
  formerPosition: "Former Position",
  timeInCurrentPosition: "Time in Current Position",
  timeInCurrentPositionMonths: "time_in_current_position_months",
  timeInCurrentCompany: "Time in Current Company",
  timeInCurrentCompanyMonths: "time_in_current_company_months",
  
  // Contact Methods
  directPhone: "Contact_Phone",
  directPhoneE164: "Contact_Phone (E164)",
  phoneExtension: "Phone Extension",
  mobilePhone: "Contact_Mobile",
  mobilePhoneE164: "Contact_Mobile (E164)",
  
  // Verification Status
  emailVerificationStatus: "Email Verification Status",
  emailStatus: "Email Status",
  phoneStatus: "Phone Status",
  emailAiConfidence: "Email AI Confidence",
  phoneAiConfidence: "Phone AI Confidence",
  phoneVerifiedAt: "Phone Verified At",
  
  // Consent & Compliance
  consentBasis: "Consent Basis",
  consentSource: "Consent Source",
  consentTimestamp: "Consent Timestamp",
  
  // Other
  intentTopics: "Intent Topics",
  tags: "Tags",
  list: "List",
  sourceSystem: "Source System",
  sourceRecordId: "Source Record ID",
  sourceUpdatedAt: "sourceUpdatedAt",
  ownerId: "Owner",
  researchDate: "Research Date",
  customFields: "customFields",
  accountId: "accountId",
  
  // Record Status
  isInvalid: "isInvalid",
  invalidReason: "invalidReason",
  invalidatedAt: "invalidatedAt",
  invalidatedBy: "invalidatedBy",
  deletedAt: "deletedAt",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
} as const;

// ============================================
// CONTACT ADDRESS FIELDS
// ============================================
export const CONTACT_ADDRESS_LABELS = {
  address: "Street Address",
  city: "City",
  state: "State",
  stateAbbr: "State Abbr",
  postalCode: "Postal Code",
  country: "Country",
  county: "County",
  contactLocation: "Location",
  timezone: "Timezone",
} as const;

// ============================================
// ACCOUNT / COMPANY INFORMATION
// ============================================
export const ACCOUNT_FIELD_LABELS = {
  // Identity
  id: "Account ID",
  name: "account_name",
  nameNormalized: "account_name (normalized)",
  canonicalName: "Canonical Name",
  domain: "account_domain",
  domainNormalized: "account_domain (normalized)",
  websiteDomain: "Website Domain",
  previousNames: "Previous Names",
  
  // Industry & Classification
  industryStandardized: "account_industry",
  industrySecondary: "Secondary Industries",
  industryCode: "Industry Code",
  industryRaw: "Industry (Raw)",
  sicCode: "SIC Code",
  naicsCode: "NAICS Code",
  
  // AI Industry Enrichment
  industryAiSuggested: "AI Suggested Industry",
  industryAiCandidates: "AI Industry Candidates",
  industryAiTopk: "AI Industry Top K",
  industryAiConfidence: "AI Industry Confidence",
  industryAiSource: "AI Industry Source",
  industryAiSuggestedAt: "AI Suggested At",
  industryAiStatus: "AI Industry Status",
  
  // Company Size & Revenue
  annualRevenue: "account_revenue",
  minAnnualRevenue: "account_min_revenue",
  maxAnnualRevenue: "account_max_revenue",
  revenueRange: "account_revenue_range",
  employeesSizeRange: "account_employee_size_range",
  staffCount: "Staff Count",
  minEmployeesSize: "account_min_employee_size",
  maxEmployeesSize: "account_max_employee_size",
  
  // Company Information
  description: "account_description",
  yearFounded: "Year Founded",
  foundedDate: "account_founded_date",
  foundedDatePrecision: "Founded Date Precision",
  linkedinUrl: "account_li_profile_url",
  linkedinId: "LinkedIn ID",
  linkedinSpecialties: "LinkedIn Specialties",
  
  // Contact Information
  mainPhone: "Account Phone",
  mainPhoneE164: "Account Phone (E164)",
  mainPhoneExtension: "Account Phone Extension",
  
  // Technology & Intent
  intentTopics: "Intent Topics",
  techStack: "Tech Stack",
  webTechnologies: "Web Technologies",
  webTechnologiesJson: "Web Technologies (JSON)",
  
  // Hierarchy & Organization
  parentAccountId: "Parent Account",
  tags: "Tags",
  accountTags: "account_tags",
  ownerId: "Owner",
  list: "List",
  customFields: "customFields",
  accountCustomFields: "account_customFields",
  
  // Source & Tracking
  sourceSystem: "Source System",
  sourceRecordId: "Source Record ID",
  sourceUpdatedAt: "sourceUpdatedAt",
  
  // AI Enrichment
  aiEnrichmentData: "AI Enrichment Data",
  aiEnrichmentDate: "Last AI Enrichment",
  
  // Record Status
  deletedAt: "deletedAt",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  
  // Additional Fields for Export
  industryAiReviewedBy: "industryAiReviewedBy",
  industryAiReviewedAt: "industryAiReviewedAt",
} as const;

// ============================================
// ACCOUNT HQ ADDRESS FIELDS
// ============================================
export const ACCOUNT_ADDRESS_LABELS = {
  hqStreet1: "HQ Street 1",
  hqStreet2: "HQ Street 2",
  hqStreet3: "HQ Street 3",
  hqAddress: "HQ Address (Legacy)",
  hqCity: "HQ City",
  hqState: "HQ State",
  hqStateAbbr: "HQ State Abbr",
  hqPostalCode: "HQ Postal Code",
  hqCountry: "HQ Country",
  companyLocation: "Company Location",
} as const;

// ============================================
// AI ENRICHMENT FIELDS
// ============================================
export const AI_ENRICHMENT_LABELS = {
  // Status Fields
  addressEnrichmentStatus: "Address Enrichment Status",
  phoneEnrichmentStatus: "Phone Enrichment Status",
  
  // Confidence Scores
  aiAddressConfidence: "AI Address Confidence",
  aiPhoneConfidence: "AI Phone Confidence",
  
  // Enriched Data
  aiEnrichedPhone: "AI Enriched Phone",
  aiEnrichedStreet1: "AI Enriched Street 1",
  aiEnrichedStreet2: "AI Enriched Street 2",
  aiEnrichedStreet3: "AI Enriched Street 3",
  aiEnrichedCity: "AI Enriched City",
  aiEnrichedState: "AI Enriched State",
  aiEnrichedPostalCode: "AI Enriched Postal Code",
  
  // Metadata
  enrichmentSource: "Enrichment Source",
  lastEnrichmentRun: "Last Enrichment Run",
  aiIndustryClassificationOverview: "AI Industry Classification Overview",
  aiAccountKeywords: "AI Account Keywords",
} as const;

// ============================================
// SMART TEMPLATE - BEST DATA FIELDS
// ============================================
export const BEST_DATA_LABELS = {
  bestAddressLine1: "Best Address Line 1",
  bestAddressLine2: "Best Address Line 2",
  bestAddressLine3: "Best Address Line 3",
  bestCity: "Best City",
  bestState: "Best State",
  bestPostalCode: "Best Postal Code",
  bestPhoneNumber: "Best Phone Number",
} as const;

// ============================================
// EVENT INFORMATION
// ============================================
export const EVENT_FIELD_LABELS = {
  // Identity
  id: "Event ID",
  title: "Title",
  slug: "Slug",
  
  // Event Details
  eventType: "Event Type",
  locationType: "Location Type",
  community: "Community",
  organizer: "Organizer",
  sponsor: "Sponsor",
  speakers: "Speakers",
  
  // Schedule
  startIso: "Start Date",
  endIso: "End Date (Optional)",
  timezone: "Timezone (Optional)",
  
  // Content
  overviewHtml: "Overview (Optional)",
  thumbnailUrl: "Thumbnail URL (Optional)",
  ctaLink: "CTA Link (Optional)",
  formId: "Form ID (Optional)",
  
  // Status
  status: "Status",
  
  // Metadata
  ownerId: "Owner",
  createdBy: "Created By",
  createdAt: "Created At",
  updatedAt: "Updated At",
  publishedIso: "Published Date",
} as const;

// ============================================
// COMBINED MAPPING (ALL FIELDS)
// ============================================
export const FIELD_LABELS = {
  ...CONTACT_FIELD_LABELS,
  ...CONTACT_ADDRESS_LABELS,
  ...ACCOUNT_FIELD_LABELS,
  ...ACCOUNT_ADDRESS_LABELS,
  ...AI_ENRICHMENT_LABELS,
  ...BEST_DATA_LABELS,
  ...EVENT_FIELD_LABELS,
} as const;

// ============================================
// STANDARD FIELDS (for uploads, filters, routes)
// These are the canonical field names matching schema columns
// ============================================

/**
 * Standard contact fields - canonical field names from schema
 * Use these for CSV import mapping, filters, and API routes
 */
export const STANDARD_CONTACT_FIELDS = new Set([
  // Identity
  'id', 'fullName', 'firstName', 'lastName', 'email', 'emailNormalized',
  // Professional
  'jobTitle', 'department', 'seniorityLevel', 'linkedinUrl',
  // Career & Tenure
  'formerPosition', 'timeInCurrentPosition', 'timeInCurrentPositionMonths',
  'timeInCurrentCompany', 'timeInCurrentCompanyMonths',
  // Contact Methods
  'directPhone', 'directPhoneE164', 'phoneExtension', 'mobilePhone', 'mobilePhoneE164',
  // Verification
  'emailVerificationStatus', 'emailStatus', 'phoneStatus',
  'emailAiConfidence', 'phoneAiConfidence', 'phoneVerifiedAt',
  // Consent & Compliance
  'consentBasis', 'consentSource', 'consentTimestamp',
  // Address
  'address', 'city', 'state', 'stateAbbr', 'postalCode', 'country', 'county', 'timezone',
  // Other
  'intentTopics', 'tags', 'list', 'sourceSystem', 'sourceRecordId',
  'ownerId', 'researchDate', 'customFields', 'accountId',
  // CAV Fields
  'cavId', 'cavUserId',
  // Record Status
  'isInvalid', 'invalidReason', 'invalidatedAt', 'invalidatedBy',
  'deletedAt', 'createdAt', 'updatedAt'
]);

/**
 * Standard account fields - canonical field names from schema
 * Use these for CSV import mapping, filters, and API routes
 */
export const STANDARD_ACCOUNT_FIELDS = new Set([
  // Identity
  'id', 'name', 'nameNormalized', 'canonicalName', 'domain', 'domainNormalized',
  'websiteDomain', 'previousNames',
  // Industry & Classification
  'industryStandardized', 'industrySecondary', 'industryCode', 'industryRaw',
  'sicCode', 'naicsCode',
  // AI Industry Enrichment
  'industryAiSuggested', 'industryAiCandidates', 'industryAiTopk',
  'industryAiConfidence', 'industryAiSource', 'industryAiSuggestedAt', 'industryAiStatus',
  // Company Size & Revenue
  'annualRevenue', 'minAnnualRevenue', 'maxAnnualRevenue', 'revenueRange',
  'employeesSizeRange', 'staffCount', 'minEmployeesSize', 'maxEmployeesSize',
  // Company Information
  'description', 'yearFounded', 'foundedDate', 'foundedDatePrecision',
  'linkedinUrl', 'linkedinId', 'linkedinSpecialties',
  // Contact Information
  'mainPhone', 'mainPhoneE164', 'mainPhoneExtension',
  // HQ Address
  'hqStreet1', 'hqStreet2', 'hqStreet3', 'hqAddress', 'hqCity', 'hqState',
  'hqStateAbbr', 'hqPostalCode', 'hqCountry', 'companyLocation',
  // Technology & Intent
  'intentTopics', 'techStack', 'webTechnologies', 'webTechnologiesJson',
  // Hierarchy & Organization
  'parentAccountId', 'tags', 'ownerId', 'list', 'customFields',
  // Source & Tracking
  'sourceSystem', 'sourceRecordId', 'sourceUpdatedAt',
  // AI Enrichment
  'aiEnrichmentData', 'aiEnrichmentDate',
  // Record Status
  'deletedAt', 'createdAt', 'updatedAt'
]);

/**
 * Combined standard fields for both contacts and accounts
 */
export const ALL_STANDARD_FIELDS = new Set([
  ...STANDARD_CONTACT_FIELDS,
  ...STANDARD_ACCOUNT_FIELDS
]);

/**
 * Check if a field is a standard field (not custom)
 */
export function isStandardField(fieldName: string, entityType?: 'contact' | 'account'): boolean {
  if (entityType === 'contact') {
    return STANDARD_CONTACT_FIELDS.has(fieldName);
  }
  if (entityType === 'account') {
    return STANDARD_ACCOUNT_FIELDS.has(fieldName);
  }
  return ALL_STANDARD_FIELDS.has(fieldName);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get display label for a database field name
 */
export function getFieldLabel(fieldName: string): string {
  return FIELD_LABELS[fieldName as keyof typeof FIELD_LABELS] || fieldName;
}

/**
 * Get multiple field labels as a mapping object
 */
export function getFieldLabels(fieldNames: string[]): Record {
  return fieldNames.reduce((acc, fieldName) => {
    acc[fieldName] = getFieldLabel(fieldName);
    return acc;
  }, {} as Record);
}

/**
 * Transform object keys from database field names to display labels
 */
export function transformToDisplayLabels>(
  data: T
): Record {
  const result: Record = {};
  for (const [key, value] of Object.entries(data)) {
    const displayLabel = getFieldLabel(key);
    result[displayLabel] = value;
  }
  return result;
}

/**
 * Get category-specific labels
 */
export const getContactLabels = () => CONTACT_FIELD_LABELS;
export const getContactAddressLabels = () => CONTACT_ADDRESS_LABELS;
export const getAccountLabels = () => ACCOUNT_FIELD_LABELS;
export const getAccountAddressLabels = () => ACCOUNT_ADDRESS_LABELS;
export const getAiEnrichmentLabels = () => AI_ENRICHMENT_LABELS;
export const getBestDataLabels = () => BEST_DATA_LABELS;