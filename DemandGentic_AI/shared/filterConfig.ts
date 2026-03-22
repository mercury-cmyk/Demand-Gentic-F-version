/**
 * Platform-wide Dynamic Filter Configuration
 * 
 * Single source of truth for filter field definitions, types, data sources,
 * selection caps, and RBAC rules across all modules.
 */

import { ACCOUNT_FIELD_LABELS, ACCOUNT_ADDRESS_LABELS, CONTACT_FIELD_LABELS, CONTACT_ADDRESS_LABELS } from "./field-labels";

/**
 * Filter Operators for Advanced Filtering
 * 
 * Operator Categories:
 * 
 * Value-based operators (require chip selection):
 *  - EQUALS: Exact match to one value
 *  - NOT_EQUALS: Does not match the value
 *  - INCLUDES_ANY: Records having any of the selected values (OR)
 *  - INCLUDES_ALL: Records having all selected values (AND)
 *  - EXCLUDES_ANY: Records not having any of the selected values (NOT IN)
 * 
 * Text-based operators (require text input):
 *  - CONTAINS: Free-text substring match (case-insensitive)
 *  - NOT_CONTAINS: Free-text substring negative match
 *  - BEGINS_WITH: Field starts with the text
 *  - ENDS_WITH: Field ends with the text
 * 
 * Null-check operators (no input required):
 *  - HAS_ANY_VALUE: Field is not null/empty
 *  - IS_EMPTY: Field is null/empty
 */
export type Operator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "INCLUDES_ANY"
  | "INCLUDES_ALL"
  | "EXCLUDES_ANY"
  | "CONTAINS"
  | "NOT_CONTAINS"
  | "BEGINS_WITH"
  | "ENDS_WITH"
  | "HAS_ANY_VALUE"
  | "IS_EMPTY";

/**
 * Field Rule - Represents a single filter condition with an operator
 * 
 * Multiple rules can be applied to the same field, combined with AND logic
 */
export interface FieldRule {
  operator: Operator;
  values?: string[];   // Template-locked chips (required for INCLUDE/EXCLUDE ops)
  query?: string;      // Free-text for CONTAINS/NOT_CONTAINS
}

export type FilterFieldType = 
  | "multi"       // Multi-select dropdown with DB-backed options
  | "typeahead"   // Async type-ahead with search
  | "date-range"  // Date range picker with presets
  | "text"        // Text input
  | "number";     // Number input

/**
 * Operator Support by Field Type
 * 
 * Determines which operators are available for each field type
 */
export type OperatorSupport =
  | "text-taxonomy"   // Industries, Job Titles, Seniority (all 5 operators)
  | "categorical"     // Company Size, Revenue, Tenure (include/exclude only)
  | "none";           // Date ranges, text search (no operators)

export type FilterField =
  | "industries" | "companySizes" | "companyRevenue" | "seniorityLevels"
  | "technologies" | "departments"
  | "accountOwners" | "createdDate" | "lastActivity" | "search"
  // Geography (generic)
  | "countries" | "states" | "cities"
  // Geography - Contact
  | "contactCountry" | "contactState" | "contactCity"
  // Geography - Account
  | "accountCountry" | "accountState" | "accountCity"
  // Campaign-related filters
  | "campaignName" | "campaignType" | "campaignStatus" | "campaignOwner" | "dialMode"
  // QA-related filters
  | "qaStatus" | "qaReviewer" | "qaOutcome" | "reviewedDate"
  // List/Segment/Domain Set filters
  | "listName" | "segmentName" | "segmentOwner" | "domainSetName" | "accountListName"
  // Contact-specific filters
  | "emailStatus" | "phoneStatus" | "assignedAgent" | "contactSource"
  | "jobTitle" | "directPhone" | "mobilePhone" | "contactTags" | "consentBasis" 
  | "consentSource" | "contactLinkedinUrl" | "list" | "accountName" | "accountDomain"
  // Account-specific filters
  | "domain" | "accountMainPhone" | "accountLinkedinUrl" | "accountDescription" 
  | "accountTags" | "yearFounded" | "sicCode" | "naicsCode";

export interface FilterFieldConfig {
  type: FilterFieldType;
  label: string;
  max?: number;           // Maximum selections for multi-select fields
  source?: string;        // API endpoint suffix for options
  parents?: FilterField[]; // Parent fields for scoped filtering (e.g., Country → State → City)
  placeholder?: string;   // Placeholder text
  category?: string;      // Category for grouping in UI
  operatorSupport?: OperatorSupport; // Which operators this field supports
}

/**
 * Base Filter Field Definitions
 * 
 * Defines all available filter fields with their configuration
 */
export const BASE_FILTERS: Record = {
  // Search/Text
  search: {
    type: "text",
    label: "Search",
    placeholder: "Search by name, email, company...",
    category: "General"
  },
  
  // Multi-select dropdowns (DB-backed)
  industries: {
    type: "multi",
    label: ACCOUNT_FIELD_LABELS.industryStandardized,
    max: 10,
    source: "industries",
    category: "Company Information",
    operatorSupport: "text-taxonomy"  // Supports all 5 operators
  },
  companySizes: {
    type: "multi",
    label: ACCOUNT_FIELD_LABELS.employeesSizeRange,
    max: 10,
    source: "company-sizes",
    category: "Company Information",
    operatorSupport: "categorical"  // Include/exclude only
  },
  companyRevenue: {
    type: "multi",
    label: ACCOUNT_FIELD_LABELS.annualRevenue,
    max: 10,
    source: "company-revenue",
    category: "Company Information",
    operatorSupport: "categorical"  // Include/exclude only
  },
  seniorityLevels: {
    type: "multi",
    label: CONTACT_FIELD_LABELS.seniorityLevel,
    max: 10,
    source: "seniority-levels",
    category: "Contact Information",
    operatorSupport: "text-taxonomy"  // Supports all 5 operators
  },
  technologies: {
    type: "multi",
    label: ACCOUNT_FIELD_LABELS.techStack,
    max: 10,
    source: "technologies",
    category: "Company Information",
    operatorSupport: "text-taxonomy"  // Supports all 5 operators
  },
  departments: {
    type: "multi",
    label: CONTACT_FIELD_LABELS.department,
    max: 10,
    source: "departments",
    category: "Contact Information",
    operatorSupport: "text-taxonomy"  // Supports all 5 operators
  },
  accountOwners: {
    type: "multi",
    label: "Account Owner",
    max: 10,
    source: "users",
    category: "Ownership"
  },
  
  // Geography - Contact (scoped dependencies: Country → State → City)
  contactCountry: {
    type: "typeahead",
    label: CONTACT_ADDRESS_LABELS.country,
    max: 10,
    source: "countries",
    category: "Contact Geography"
  },
  contactState: {
    type: "typeahead",
    label: CONTACT_ADDRESS_LABELS.state,
    max: 5,
    source: "states",
    parents: ["contactCountry"],
    category: "Contact Geography"
  },
  contactCity: {
    type: "typeahead",
    label: CONTACT_ADDRESS_LABELS.city,
    max: 5,
    source: "cities",
    parents: ["contactCountry", "contactState"],
    category: "Contact Geography"
  },
  
  // Geography - Account (scoped dependencies: Country → State → City)
  accountCountry: {
    type: "typeahead",
    label: ACCOUNT_ADDRESS_LABELS.hqCountry,
    max: 10,
    source: "countries",
    category: "Account Geography"
  },
  accountState: {
    type: "typeahead",
    label: ACCOUNT_ADDRESS_LABELS.hqState,
    max: 5,
    source: "states",
    parents: ["accountCountry"],
    category: "Account Geography"
  },
  accountCity: {
    type: "typeahead",
    label: ACCOUNT_ADDRESS_LABELS.hqCity,
    max: 5,
    source: "cities",
    parents: ["accountCountry", "accountState"],
    category: "Account Geography"
  },

  // Geography - Generic (used by RBAC/module configs)
  countries: {
    type: "typeahead",
    label: "Countries",
    max: 10,
    source: "countries",
    category: "Geography"
  },
  states: {
    type: "typeahead",
    label: "States",
    max: 10,
    source: "states",
    parents: ["countries"],
    category: "Geography"
  },
  cities: {
    type: "typeahead",
    label: "Cities",
    max: 10,
    source: "cities",
    parents: ["countries", "states"],
    category: "Geography"
  },
  
  // Date ranges
  createdDate: {
    type: "date-range",
    label: "Created Date",
    category: "Dates"
  },
  lastActivity: {
    type: "date-range",
    label: "Last Activity",
    category: "Dates"
  },
  reviewedDate: {
    type: "date-range",
    label: "Reviewed Date",
    category: "Dates"
  },
  
  // Campaign-related filters
  campaignName: {
    type: "typeahead",
    label: "Campaign Name",
    source: "campaigns",
    category: "Campaign"
  },
  campaignType: {
    type: "multi",
    label: "Campaign Type",
    max: 3,
    source: "campaign-types",
    category: "Campaign"
  },
  campaignStatus: {
    type: "multi",
    label: "Campaign Status",
    max: 6,
    source: "campaign-status",
    category: "Campaign"
  },
  campaignOwner: {
    type: "multi",
    label: "Campaign Owner",
    max: 10,
    source: "users",
    category: "Campaign"
  },
  dialMode: {
    type: "multi",
    label: "Dial Mode",
    max: 2,
    source: "dial-modes",
    category: "Campaign"
  },
  
  // QA-related filters
  qaStatus: {
    type: "multi",
    label: "QA Status",
    max: 6,
    source: "qa-status",
    category: "QA & Verification"
  },
  qaReviewer: {
    type: "multi",
    label: "QA Reviewer",
    max: 10,
    source: "users",
    category: "QA & Verification"
  },
  qaOutcome: {
    type: "multi",
    label: "QA Outcome",
    max: 3,
    source: "qa-outcomes",
    category: "QA & Verification"
  },
  
  // List/Segment/Domain Set/Account List filters
  listName: {
    type: "typeahead",
    label: "Static List",
    max: 10,
    source: "lists",
    category: "Lists & Segments",
    operatorSupport: "text-taxonomy"
  },
  segmentName: {
    type: "typeahead",
    label: "Dynamic Segment",
    max: 10,
    source: "segments",
    category: "Lists & Segments",
    operatorSupport: "text-taxonomy"
  },
  segmentOwner: {
    type: "multi",
    label: "Segment Owner",
    max: 10,
    source: "users",
    category: "Lists & Segments"
  },
  domainSetName: {
    type: "typeahead",
    label: "Domain Set",
    max: 10,
    source: "domain-sets",
    category: "Lists & Segments",
    operatorSupport: "text-taxonomy"
  },
  accountListName: {
    type: "typeahead",
    label: "Target Account List (TAL)",
    max: 10,
    source: "account-lists",
    category: "Lists & Segments",
    operatorSupport: "text-taxonomy"
  },
  
  // Contact-specific filters
  emailStatus: {
    type: "multi",
    label: "Email Status",
    max: 4,
    source: "email-verification-status",
    category: "Verification"
  },
  phoneStatus: {
    type: "multi",
    label: "Phone Status",
    max: 4,
    source: "phone-status",
    category: "Verification"
  },
  assignedAgent: {
    type: "multi",
    label: "Assigned Agent",
    max: 10,
    source: "users",
    category: "Ownership"
  },
  contactSource: {
    type: "multi",
    label: "Source",
    max: 10,
    source: "contact-sources",
    category: "Contact Information"
  },
  
  // NEW CONTACT FILTERS
  jobTitle: {
    type: "typeahead",
    label: CONTACT_FIELD_LABELS.jobTitle,
    max: 10,
    source: "job-titles",
    category: "Contact Information",
    operatorSupport: "text-taxonomy"
  },
  directPhone: {
    type: "text",
    label: CONTACT_FIELD_LABELS.directPhone,
    placeholder: "Enter phone number...",
    category: "Contact Information"
  },
  mobilePhone: {
    type: "text",
    label: CONTACT_FIELD_LABELS.mobilePhone,
    placeholder: "Enter mobile number...",
    category: "Contact Information"
  },
  contactTags: {
    type: "typeahead",
    label: "Contact Tags",
    max: 10,
    source: "contact-tags",
    category: "Contact Information",
    operatorSupport: "text-taxonomy"
  },
  consentBasis: {
    type: "multi",
    label: "Consent Basis",
    max: 5,
    source: "consent-basis",
    category: "Compliance"
  },
  consentSource: {
    type: "typeahead",
    label: "Consent Source",
    max: 10,
    source: "consent-sources",
    category: "Compliance"
  },
  contactLinkedinUrl: {
    type: "text",
    label: CONTACT_FIELD_LABELS.linkedinUrl,
    placeholder: "Enter LinkedIn URL...",
    category: "Contact Information"
  },
  list: {
    type: "typeahead",
    label: CONTACT_FIELD_LABELS.list,
    max: 10,
    source: "source-lists",
    category: "Lists & Segments"
  },
  accountName: {
    type: "typeahead",
    label: ACCOUNT_FIELD_LABELS.name,
    max: 10,
    source: "account-names",
    category: "Company Information"
  },
  accountDomain: {
    type: "typeahead",
    label: ACCOUNT_FIELD_LABELS.domain,
    max: 10,
    source: "account-domains",
    category: "Company Information"
  },
  
  // NEW ACCOUNT FILTERS
  domain: {
    type: "typeahead",
    label: ACCOUNT_FIELD_LABELS.domain,
    max: 10,
    source: "domains",
    category: "Company Information"
  },
  accountMainPhone: {
    type: "text",
    label: ACCOUNT_FIELD_LABELS.mainPhone,
    placeholder: "Enter company phone...",
    category: "Company Information"
  },
  accountLinkedinUrl: {
    type: "text",
    label: ACCOUNT_FIELD_LABELS.linkedinUrl,
    placeholder: "Enter LinkedIn URL...",
    category: "Company Information"
  },
  accountDescription: {
    type: "text",
    label: ACCOUNT_FIELD_LABELS.description,
    placeholder: "Search in descriptions...",
    category: "Company Information"
  },
  accountTags: {
    type: "typeahead",
    label: "Account Tags",
    max: 10,
    source: "account-tags",
    category: "Company Information",
    operatorSupport: "text-taxonomy"
  },
  yearFounded: {
    type: "number",
    label: ACCOUNT_FIELD_LABELS.yearFounded,
    placeholder: "Enter year...",
    category: "Company Information"
  },
  sicCode: {
    type: "text",
    label: "SIC Code",
    placeholder: "Enter SIC code...",
    category: "Company Information"
  },
  naicsCode: {
    type: "text",
    label: "NAICS Code",
    placeholder: "Enter NAICS code...",
    category: "Company Information"
  }
} as const;

/**
 * Module-Specific Filter Configurations
 * 
 * Defines which filter fields are available for each module
 */
export const MODULE_FILTERS: Record = {
  contacts: [
    "search",
    // Company filters (via account JOIN)
    "industries",
    "companySizes", 
    "companyRevenue",
    "technologies",
    "accountName",
    "accountDomain",
    // Contact-specific filters
    "jobTitle",
    "seniorityLevels",
    "departments",
    "directPhone",
    "mobilePhone",
    "contactLinkedinUrl",
    "contactTags",
    // Geography
    "countries",
    "states",
    "cities",
    // Verification & Status
    "emailStatus",
    "phoneStatus",
    // Compliance
    "consentBasis",
    "consentSource",
    // Ownership & Lists
    "assignedAgent",
    "accountOwners",
    "contactSource",
    "list",
    "listName",
    // Dates
    "lastActivity",
    "createdDate"
  ],
  accounts: [
    "search",
    // Company Information
    "domain",
    "industries",
    "companySizes",
    "companyRevenue",
    "technologies",
    "accountDescription",
    "accountTags",
    "accountMainPhone",
    "accountLinkedinUrl",
    // Firmographic Data
    "yearFounded",
    "sicCode",
    "naicsCode",
    // Geography
    "countries",
    "states",
    "cities",
    // Ownership & Dates
    "accountOwners",
    "lastActivity",
    "createdDate"
  ],
  qa: [
    "search",
    "qaStatus",
    "qaReviewer",
    "qaOutcome",
    "campaignName",
    "campaignType",
    "accountOwners",
    "countries",
    "states",
    "cities",
    "reviewedDate",
    "lastActivity",
    "createdDate"
  ],
  emailCampaigns: [
    "search",
    "campaignStatus",
    "campaignOwner",
    "industries",
    "companySizes",
    "seniorityLevels",
    // "jobFunctions", // REMOVED: Field doesn't exist in database
    "countries",
    "states",
    "cities",
    "listName",
    "segmentName",
    "lastActivity",
    "createdDate"
  ],
  callCampaigns: [
    "search",
    "campaignStatus",
    "campaignType",
    "campaignOwner",
    "dialMode",
    "industries",
    "companySizes",
    "seniorityLevels",
    // "jobFunctions", // REMOVED: Field doesn't exist in database
    "countries",
    "states",
    "cities",
    "listName",
    "segmentName",
    "accountOwners",
    "lastActivity",
    "createdDate"
  ],
  agentConsole: [
    "search",
    "campaignName",
    "industries",
    "companySizes",
    "seniorityLevels",
    "countries",
    "states",
    "cities"
  ]
};

/**
 * RBAC Filter Visibility
 * 
 * Defines which filter fields are visible to each user role
 */
export type UserRole = "Admin" | "Manager" | "Agent";

export const FILTER_RBAC: Record = {
  Admin: {
    allow: "all" // Admins can see all filters
  },
  Manager: {
    allow: [
      // General & Search
      "search",
      // Company Information
      "industries",
      "companySizes",
      "companyRevenue",
      "technologies",
      "departments",  // Only available for contacts
      // Contact Information
      "seniorityLevels",
      "jobTitle",
      "contactSource",
      "directPhone",
      "mobilePhone",
      "contactTags",
      "contactLinkedinUrl",
      "list",
      // Geography
      "countries",
      "states",
      "cities",
      // Campaign filters
      "campaignName",
      "campaignType",
      "campaignStatus",
      "campaignOwner",
      "dialMode",
      // QA filters
      "qaStatus",
      "qaReviewer",
      "qaOutcome",
      // List/Segment filters
      "listName",
      "segmentName",
      "segmentOwner",
      // Verification & Compliance filters
      "emailStatus",
      "phoneStatus",
      "consentBasis",
      "consentSource",
      "assignedAgent",
      // Account filters
      "domain",
      "accountName",
      "accountDomain",
      "accountDescription",
      "accountTags",
      "accountMainPhone",
      "accountLinkedinUrl",
      "yearFounded",
      "sicCode",
      "naicsCode",
      // Ownership & Dates
      "accountOwners",
      "lastActivity",
      "createdDate",
      "reviewedDate"
    ]
  },
  Agent: {
    allow: [
      "search",
      "seniorityLevels",
      "jobTitle",
      "countries",
      "states",
      "cities",
      "campaignName",
      "listName",
      "list",
      "lastActivity"
    ]
  }
} as const;

/**
 * Filter Categories for UI Grouping
 * 
 * Organizes filters into collapsible categories
 */
export const FILTER_CATEGORIES = [
  "General",
  "Company Information",
  "Contact Information",
  "Contact Geography",
  "Account Geography",
  "Campaign",
  "QA & Verification",
  "Verification",
  "Compliance",
  "Lists & Segments",
  "Ownership",
  "Dates"
] as const;

/**
 * Filter Field to Database Column Mapping
 * 
 * Maps user-friendly filter field names to actual database column names.
 * This allows the filter UI to use readable names while ensuring correct
 * database queries.
 * 
 * Format: { filterFieldName: { tableName: 'actual_column_name' } }
 */
/**
 * IMPORTANT: This mapping uses camelCase property names (as used by Drizzle ORM)
 * NOT snake_case database column names.
 * 
 * Example: Use 'industryStandardized' (Drizzle property), not 'industry_standardized' (DB column)
 */
export const FILTER_TO_DB_MAPPING: Record> = {
  // Company/Account fields
  industries: {
    accounts: 'industryStandardized',
    contacts: 'industryStandardized' // via account join
  },
  companySizes: {
    accounts: 'employeesSizeRange',
    contacts: 'employeesSizeRange' // via account join
  },
  companyRevenue: {
    accounts: 'annualRevenue',
    contacts: 'annualRevenue' // via account join
  },
  technologies: {
    accounts: 'techStack',
    contacts: 'techStack' // via account join
  },
  departments: {
    contacts: 'department'
  },
  
  // Contact fields
  seniorityLevels: {
    contacts: 'seniorityLevel'
  },
  jobTitle: {
    contacts: 'jobTitle'
  },
  directPhone: {
    contacts: 'directPhone'
  },
  mobilePhone: {
    contacts: 'mobilePhone'
  },
  contactTags: {
    contacts: 'tags'
  },
  consentBasis: {
    contacts: 'consentBasis'
  },
  consentSource: {
    contacts: 'consentSource'
  },
  contactLinkedinUrl: {
    contacts: 'linkedinUrl'
  },
  list: {
    contacts: 'list'
  },
  accountName: {
    contacts: 'name' // via account join
  },
  accountDomain: {
    contacts: 'domain' // via account join
  },
  
  // Account-specific fields
  domain: {
    accounts: 'domain'
  },
  accountMainPhone: {
    accounts: 'mainPhone'
  },
  accountLinkedinUrl: {
    accounts: 'linkedinUrl'
  },
  accountDescription: {
    accounts: 'description'
  },
  accountTags: {
    accounts: 'tags'
  },
  yearFounded: {
    accounts: 'yearFounded'
  },
  sicCode: {
    accounts: 'sicCode'
  },
  naicsCode: {
    accounts: 'naicsCode'
  },
  
  // Geography - Contact fields
  contactCountry: {
    contacts: 'country'
  },
  contactState: {
    contacts: 'state'
  },
  contactCity: {
    contacts: 'city'
  },
  
  // Geography - Account fields
  accountCountry: {
    accounts: 'hqCountry',
    contacts: 'hqCountry' // via account join
  },
  accountState: {
    accounts: 'hqState',
    contacts: 'hqState' // via account join
  },
  accountCity: {
    accounts: 'hqCity',
    contacts: 'hqCity' // via account join
  },
  
  // Ownership
  accountOwners: {
    accounts: 'ownerId',
    contacts: 'ownerId'
  },
  
  // Contact verification
  emailStatus: {
    contacts: 'emailVerificationStatus'
  },
  phoneStatus: {
    contacts: 'phoneStatus'
  },
  
  // Lists & Segments & Domain Sets
  listName: {
    // Note: This requires special handling - contacts can belong to multiple lists
    // Filter by checking if contact ID exists in the list's recordIds array
    contacts: 'list' // Special handling required
  },
  segmentName: {
    // Note: This requires special handling - dynamic segment membership
    // Filter by evaluating segment criteria against contact
    contacts: 'segment' // Special handling required
  },
  domainSetName: {
    // Note: This requires special handling via domain_set_contact_links table
    contacts: 'domainSet' // Special handling required
  },
  accountListName: {
    // Note: This is for Target Account Lists (TAL)
    // Filter accounts by checking if they belong to specific account lists
    accounts: 'accountList' // Special handling required
  },
  
  // Other contact fields
  assignedAgent: {
    contacts: 'ownerId'
  },
  contactSource: {
    contacts: 'sourceSystem'
  },
  
  // Date fields
  createdDate: {
    accounts: 'createdAt',
    contacts: 'createdAt'
  },
  lastActivity: {
    accounts: 'updatedAt',
    contacts: 'updatedAt'
  }
} as const;

/**
 * Helper function to get database column name for a filter field
 * 
 * @param filterField - The filter field name (e.g., 'companySizes')
 * @param table - The table name ('accounts' or 'contacts')
 * @returns The actual Drizzle property name (camelCase, e.g., 'employeesSizeRange')
 */
export function getDbColumnName(filterField: string, table: 'accounts' | 'contacts'): string {
  const mapping = FILTER_TO_DB_MAPPING[filterField];
  
  if (!mapping) {
    // No mapping exists - return field as-is (assume camelCase property name matches)
    // This works for fields like 'name', 'email', 'domain' that don't need mapping
    return filterField;
  }
  
  const dbColumn = mapping[table];
  
  if (!dbColumn) {
    // Fallback: try to use the first available mapping or return as-is
    const firstMapping = Object.values(mapping)[0];
    return firstMapping || filterField;
  }
  
  return dbColumn;
}

/**
 * Date Range Presets
 * 
 * Quick date range selection options
 */
export const DATE_RANGE_PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 6 months", days: 180 },
  { label: "Last year", days: 365 },
  { label: "Custom", days: null }
] as const;

/**
 * Filter Value Type Definitions
 * 
 * Supports operator-based filtering with FieldRule arrays for fields that
 * have operator support. Fields with operators use FieldRule[], while simple
 * fields (dates, text search) use their original types.
 */
export interface FilterValues {
  search?: string;
  
  // Text/Taxonomy fields (support all 5 operators)
  industries?: FieldRule[];
  seniorityLevels?: FieldRule[];
  technologies?: FieldRule[];
  departments?: FieldRule[];
  jobTitle?: FieldRule[];
  contactTags?: FieldRule[];
  accountTags?: FieldRule[];
  
  // Categorical fields (support include/exclude only)
  companySizes?: FieldRule[];
  companyRevenue?: FieldRule[];
  
  // Geography (simple multi-select, no operators for now)
  countries?: string[];
  states?: string[];
  cities?: string[];
  
  // Ownership (simple multi-select)
  accountOwners?: string[];
  assignedAgent?: string[];
  
  // Date ranges (no operators)
  createdDate?: { from?: string; to?: string };
  lastActivity?: { from?: string; to?: string };
  reviewedDate?: { from?: string; to?: string };
  
  // Campaign filters (simple multi-select for now)
  campaignName?: string[];
  campaignType?: string[];
  campaignStatus?: string[];
  campaignOwner?: string[];
  dialMode?: string[];
  
  // QA filters (simple multi-select)
  qaStatus?: string[];
  qaReviewer?: string[];
  qaOutcome?: string[];
  
  // List/Segment filters (simple multi-select)
  listName?: string[];
  segmentName?: string[];
  segmentOwner?: string[];
  list?: string[];
  
  // Contact filters (simple multi-select or text)
  emailStatus?: string[];
  phoneStatus?: string[];
  contactSource?: string[];
  directPhone?: string;
  mobilePhone?: string;
  contactLinkedinUrl?: string;
  consentBasis?: string[];
  consentSource?: string[];
  accountName?: string[];
  accountDomain?: string[];
  
  // Account filters (text or multi-select)
  domain?: string[];
  accountMainPhone?: string;
  accountLinkedinUrl?: string;
  accountDescription?: string;
  yearFounded?: number;
  sicCode?: string;
  naicsCode?: string;
}

/**
 * Helper function to get allowed fields for a module and user role
 */
export function getAllowedFields(
  module: keyof typeof MODULE_FILTERS,
  userRole: UserRole
): FilterField[] {
  const moduleFields = MODULE_FILTERS[module] || [];
  const rolePermissions = FILTER_RBAC[userRole];
  
  if (rolePermissions.allow === "all") {
    return moduleFields;
  }
  
  // Filter module fields by role permissions
  return moduleFields.filter(field => 
    (rolePermissions.allow as FilterField[]).includes(field)
  );
}

/**
 * Helper function to get field configuration
 */
export function getFieldConfig(field: FilterField): FilterFieldConfig {
  return BASE_FILTERS[field];
}

/**
 * Get available operators for a field based on its operator support
 */
export function getAvailableOperators(field: FilterField): Operator[] {
  const config = BASE_FILTERS[field];
  const support = config.operatorSupport;
  
  if (!support || support === "none") {
    return ["INCLUDES_ANY"]; // Default fallback
  }
  
  if (support === "text-taxonomy") {
    // Industries, Job Titles, Seniority, Technologies, Departments, Job Functions
    // Full operator set: value-based, text-based, and null-checks
    return [
      "EQUALS",
      "NOT_EQUALS",
      "INCLUDES_ANY",
      "INCLUDES_ALL",
      "EXCLUDES_ANY",
      "CONTAINS",
      "NOT_CONTAINS",
      "BEGINS_WITH",
      "ENDS_WITH",
      "HAS_ANY_VALUE",
      "IS_EMPTY"
    ];
  }
  
  if (support === "categorical") {
    // Company Size, Revenue, Tenure buckets
    // Value-based and null-checks only (no text operators)
    return [
      "EQUALS",
      "NOT_EQUALS",
      "INCLUDES_ANY",
      "INCLUDES_ALL",
      "EXCLUDES_ANY",
      "HAS_ANY_VALUE",
      "IS_EMPTY"
    ];
  }
  
  return ["INCLUDES_ANY"];
}

/**
 * Get operator label for display
 */
export function getOperatorLabel(operator: Operator): string {
  const labels: Record = {
    "EQUALS": "Equals",
    "NOT_EQUALS": "Not equals",
    "INCLUDES_ANY": "Includes any",
    "INCLUDES_ALL": "Includes all",
    "EXCLUDES_ANY": "Exclude",
    "CONTAINS": "Contains",
    "NOT_CONTAINS": "Doesn't contain",
    "BEGINS_WITH": "Begins with",
    "ENDS_WITH": "Ends with",
    "HAS_ANY_VALUE": "Has any value",
    "IS_EMPTY": "Is empty"
  };
  return labels[operator];
}

/**
 * Check if operator requires text query input (vs chip selection)
 */
export function isTextOperator(operator: Operator): boolean {
  return operator === "CONTAINS" 
    || operator === "NOT_CONTAINS"
    || operator === "BEGINS_WITH"
    || operator === "ENDS_WITH";
}

/**
 * Check if operator is a null-check (requires no input)
 */
export function isNullCheckOperator(operator: Operator): boolean {
  return operator === "HAS_ANY_VALUE" || operator === "IS_EMPTY";
}

/**
 * Check if operator requires value selection (chips)
 */
export function isValueOperator(operator: Operator): boolean {
  return !isTextOperator(operator) && !isNullCheckOperator(operator);
}

/**
 * Helper function to get fields grouped by category
 */
export function getFieldsByCategory(
  fields: FilterField[]
): Record {
  const grouped: Record = {};
  
  fields.forEach(field => {
    const config = BASE_FILTERS[field];
    const category = config.category || "Other";
    
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(field);
  });
  
  return grouped;
}

/**
 * Map frontend Operator types to backend filter-types operators
 */
function mapOperatorToBackend(operator: Operator): string {
  const mapping: Record = {
    "EQUALS": "equals",
    "NOT_EQUALS": "notEquals",
    "INCLUDES_ANY": "containsAny",
    "INCLUDES_ALL": "containsAll",
    "EXCLUDES_ANY": "notEquals", // Map to notEquals for now
    "CONTAINS": "contains",
    "NOT_CONTAINS": "doesNotContain",
    "BEGINS_WITH": "startsWith",
    "ENDS_WITH": "endsWith",
    "HAS_ANY_VALUE": "isNotEmpty",
    "IS_EMPTY": "isEmpty"
  };
  return mapping[operator] || "equals";
}

/**
 * Convert FilterValues (with FieldRule arrays) to FilterGroup format for backend
 * 
 * This is critical for making filters work - it converts the operator-based
 * filter UI format to the backend API format.
 */
export function convertFilterValuesToFilterGroup(
  filterValues: FilterValues,
  table: 'accounts' | 'contacts' = 'contacts'
): { logic: 'AND' | 'OR'; conditions: any[] } | undefined {
  const conditions: any[] = [];
  
  for (const [filterField, value] of Object.entries(filterValues)) {
    if (!value) continue;
    
    // Map filter field to database column name
    const dbField = getDbColumnName(filterField, table);
    
    // Handle FieldRule arrays (operator-based filters)
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && 'operator' in value[0]) {
      const rules = value as FieldRule[];
      
      rules.forEach((rule, index) => {
        const backendOperator = mapOperatorToBackend(rule.operator);
        
        // Handle value-based operators (chip selections)
        if (rule.values && rule.values.length > 0) {
          conditions.push({
            id: `${filterField}-${index}`,
            field: dbField,
            operator: backendOperator,
            value: backendOperator === 'containsAny' || backendOperator === 'containsAll' 
              ? rule.values  // Array for containsAny/containsAll
              : rule.values[0]  // Single value for equals/notEquals
          });
        }
        
        // Handle text operators (query-based)
        if (rule.query) {
          conditions.push({
            id: `${filterField}-${index}`,
            field: dbField,
            operator: backendOperator,
            value: rule.query
          });
        }
        
        // Handle null-check operators (no value needed)
        if (isNullCheckOperator(rule.operator)) {
          conditions.push({
            id: `${filterField}-${index}`,
            field: dbField,
            operator: backendOperator
          });
        }
      });
    }
    // Handle simple string array (legacy multi-select format)
    else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      conditions.push({
        id: filterField,
        field: dbField,
        operator: 'containsAny',
        value: value
      });
    }
    // Handle date range objects
    else if (value && typeof value === 'object' && ('from' in value || 'to' in value)) {
      const dateRange = value as { from?: string; to?: string };
      if (dateRange.from && dateRange.to) {
        conditions.push({
          id: filterField,
          field: dbField,
          operator: 'between',
          value: { from: dateRange.from, to: dateRange.to }
        });
      } else if (dateRange.from) {
        conditions.push({
          id: filterField,
          field: dbField,
          operator: 'after',
          value: dateRange.from
        });
      } else if (dateRange.to) {
        conditions.push({
          id: filterField,
          field: dbField,
          operator: 'before',
          value: dateRange.to
        });
      }
    }
    // Handle search string
    else if (filterField === 'search' && typeof value === 'string') {
      conditions.push({
        id: 'search',
        field: 'name',  // or whatever field should be searched
        operator: 'contains',
        value: value
      });
    }
  }
  
  if (conditions.length === 0) {
    return undefined;
  }
  
  return {
    logic: 'AND',
    conditions
  };
}