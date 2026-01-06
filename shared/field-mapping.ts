/**
 * Unified Field Mapping Reference
 * 
 * Central source of truth for field alignment across:
 * - CSV Import/Export headers
 * - Database schema columns (Drizzle ORM camelCase properties)
 * - Filter configuration keys
 * - API request/response keys
 * 
 * Generated from strategic field alignment audit (October 2025)
 * Last updated: October 19, 2025
 */

export interface FieldMapping {
  /** User-friendly field name */
  fieldName: string;
  /** CSV header name (import/export) */
  csvKey: string;
  /** Database column (Drizzle ORM camelCase property) */
  dbColumn: string;
  /** Filter configuration key */
  filterKey: string;
  /** Entity type */
  entity: 'account' | 'contact' | 'both';
  /** Data type */
  type: 'text' | 'number' | 'boolean' | 'date' | 'array' | 'jsonb';
  /** Description */
  description: string;
  /** Indicates if this field requires JOIN for cross-entity filtering */
  requiresJoin?: boolean;
}

/**
 * Complete Field Mapping Registry
 */
export const FIELD_MAPPINGS: FieldMapping[] = [
  // ============================================
  // ACCOUNT FIELDS
  // ============================================
  {
    fieldName: 'Company Name',
    csvKey: 'name',
    dbColumn: 'name',
    filterKey: 'search',
    entity: 'account',
    type: 'text',
    description: 'Company/account name'
  },
  {
    fieldName: 'Company Domain',
    csvKey: 'domain',
    dbColumn: 'domain',
    filterKey: 'domain',
    entity: 'account',
    type: 'text',
    description: 'Company website domain'
  },
  {
    fieldName: 'Industry',
    csvKey: 'industryStandardized',
    dbColumn: 'industryStandardized',
    filterKey: 'industries',
    entity: 'account',
    type: 'text',
    description: 'Standardized industry classification'
  },
  {
    fieldName: 'Company Size',
    csvKey: 'employeesSizeRange',
    dbColumn: 'employeesSizeRange',
    filterKey: 'companySizes',
    entity: 'account',
    type: 'text',
    description: 'Employee count range (e.g., "51-200 employees")'
  },
  {
    fieldName: 'Annual Revenue',
    csvKey: 'annualRevenue',
    dbColumn: 'annualRevenue',
    filterKey: 'companyRevenue',
    entity: 'account',
    type: 'text',
    description: 'Company annual revenue range'
  },
  {
    fieldName: 'Technologies',
    csvKey: 'techStack',
    dbColumn: 'techStack',
    filterKey: 'technologies',
    entity: 'account',
    type: 'array',
    description: 'Technology stack and tools used'
  },
  {
    fieldName: 'Company Phone',
    csvKey: 'mainPhone',
    dbColumn: 'mainPhone',
    filterKey: 'accountMainPhone',
    entity: 'account',
    type: 'text',
    description: 'Main company phone number'
  },
  {
    fieldName: 'Company LinkedIn',
    csvKey: 'linkedinUrl',
    dbColumn: 'linkedinUrl',
    filterKey: 'accountLinkedinUrl',
    entity: 'account',
    type: 'text',
    description: 'Company LinkedIn profile URL'
  },
  {
    fieldName: 'Company Description',
    csvKey: 'description',
    dbColumn: 'description',
    filterKey: 'accountDescription',
    entity: 'account',
    type: 'text',
    description: 'Company description'
  },
  {
    fieldName: 'Account Tags',
    csvKey: 'tags',
    dbColumn: 'tags',
    filterKey: 'accountTags',
    entity: 'account',
    type: 'array',
    description: 'Custom account tags'
  },
  {
    fieldName: 'Year Founded',
    csvKey: 'yearFounded',
    dbColumn: 'yearFounded',
    filterKey: 'yearFounded',
    entity: 'account',
    type: 'number',
    description: 'Year company was founded'
  },
  {
    fieldName: 'SIC Code',
    csvKey: 'sicCode',
    dbColumn: 'sicCode',
    filterKey: 'sicCode',
    entity: 'account',
    type: 'text',
    description: 'Standard Industrial Classification code'
  },
  {
    fieldName: 'NAICS Code',
    csvKey: 'naicsCode',
    dbColumn: 'naicsCode',
    filterKey: 'naicsCode',
    entity: 'account',
    type: 'text',
    description: 'North American Industry Classification System code'
  },
  {
    fieldName: 'HQ City',
    csvKey: 'hqCity',
    dbColumn: 'hqCity',
    filterKey: 'cities',
    entity: 'account',
    type: 'text',
    description: 'Headquarters city'
  },
  {
    fieldName: 'HQ State',
    csvKey: 'hqState',
    dbColumn: 'hqState',
    filterKey: 'states',
    entity: 'account',
    type: 'text',
    description: 'Headquarters state/province'
  },
  {
    fieldName: 'HQ Country',
    csvKey: 'hqCountry',
    dbColumn: 'hqCountry',
    filterKey: 'countries',
    entity: 'account',
    type: 'text',
    description: 'Headquarters country'
  },
  {
    fieldName: 'Account Owner',
    csvKey: 'ownerId',
    dbColumn: 'ownerId',
    filterKey: 'accountOwners',
    entity: 'account',
    type: 'text',
    description: 'User ID of account owner'
  },
  
  // ============================================
  // CONTACT FIELDS
  // ============================================
  {
    fieldName: 'First Name',
    csvKey: 'firstName',
    dbColumn: 'firstName',
    filterKey: 'search',
    entity: 'contact',
    type: 'text',
    description: 'Contact first name'
  },
  {
    fieldName: 'Last Name',
    csvKey: 'lastName',
    dbColumn: 'lastName',
    filterKey: 'search',
    entity: 'contact',
    type: 'text',
    description: 'Contact last name'
  },
  {
    fieldName: 'Full Name',
    csvKey: 'fullName',
    dbColumn: 'fullName',
    filterKey: 'search',
    entity: 'contact',
    type: 'text',
    description: 'Contact full name'
  },
  {
    fieldName: 'Email',
    csvKey: 'email',
    dbColumn: 'email',
    filterKey: 'search',
    entity: 'contact',
    type: 'text',
    description: 'Contact email address'
  },
  {
    fieldName: 'Job Title',
    csvKey: 'jobTitle',
    dbColumn: 'jobTitle',
    filterKey: 'jobTitle',
    entity: 'contact',
    type: 'text',
    description: 'Contact job title'
  },
  {
    fieldName: 'Seniority Level',
    csvKey: 'seniorityLevel',
    dbColumn: 'seniorityLevel',
    filterKey: 'seniorityLevels',
    entity: 'contact',
    type: 'text',
    description: 'Contact seniority level (e.g., CXO, VP, Director)'
  },
  {
    fieldName: 'Department',
    csvKey: 'department',
    dbColumn: 'department',
    filterKey: 'departments',
    entity: 'contact',
    type: 'text',
    description: 'Contact department'
  },
  {
    fieldName: 'Direct Phone',
    csvKey: 'directPhone',
    dbColumn: 'directPhone',
    filterKey: 'directPhone',
    entity: 'contact',
    type: 'text',
    description: 'Contact direct phone number'
  },
  {
    fieldName: 'Mobile Phone',
    csvKey: 'mobilePhone',
    dbColumn: 'mobilePhone',
    filterKey: 'mobilePhone',
    entity: 'contact',
    type: 'text',
    description: 'Contact mobile phone number'
  },
  {
    fieldName: 'Contact LinkedIn',
    csvKey: 'linkedinUrl',
    dbColumn: 'linkedinUrl',
    filterKey: 'contactLinkedinUrl',
    entity: 'contact',
    type: 'text',
    description: 'Contact LinkedIn profile URL'
  },
  {
    fieldName: 'Contact Tags',
    csvKey: 'tags',
    dbColumn: 'tags',
    filterKey: 'contactTags',
    entity: 'contact',
    type: 'array',
    description: 'Custom contact tags'
  },
  {
    fieldName: 'Consent Basis',
    csvKey: 'consentBasis',
    dbColumn: 'consentBasis',
    filterKey: 'consentBasis',
    entity: 'contact',
    type: 'text',
    description: 'Legal basis for consent (GDPR, legitimate interest, etc.)'
  },
  {
    fieldName: 'Consent Source',
    csvKey: 'consentSource',
    dbColumn: 'consentSource',
    filterKey: 'consentSource',
    entity: 'contact',
    type: 'text',
    description: 'Source of consent (web form, phone call, etc.)'
  },
  {
    fieldName: 'Source List',
    csvKey: 'list',
    dbColumn: 'list',
    filterKey: 'list',
    entity: 'contact',
    type: 'text',
    description: 'Source list identifier (e.g., InFynd, ZoomInfo)'
  },
  {
    fieldName: 'Email Status',
    csvKey: 'emailVerificationStatus',
    dbColumn: 'emailVerificationStatus',
    filterKey: 'emailStatus',
    entity: 'contact',
    type: 'text',
    description: 'Email verification status (valid, invalid, risky, unknown)'
  },
  {
    fieldName: 'Phone Status',
    csvKey: 'phoneStatus',
    dbColumn: 'phoneStatus',
    filterKey: 'phoneStatus',
    entity: 'contact',
    type: 'text',
    description: 'Phone status (valid, invalid, unknown)'
  },
  {
    fieldName: 'Contact Source',
    csvKey: 'sourceSystem',
    dbColumn: 'sourceSystem',
    filterKey: 'contactSource',
    entity: 'contact',
    type: 'text',
    description: 'System/source where contact originated'
  },
  {
    fieldName: 'City',
    csvKey: 'city',
    dbColumn: 'city',
    filterKey: 'cities',
    entity: 'contact',
    type: 'text',
    description: 'Contact city'
  },
  {
    fieldName: 'State',
    csvKey: 'state',
    dbColumn: 'state',
    filterKey: 'states',
    entity: 'contact',
    type: 'text',
    description: 'Contact state/province'
  },
  {
    fieldName: 'Country',
    csvKey: 'country',
    dbColumn: 'country',
    filterKey: 'countries',
    entity: 'contact',
    type: 'text',
    description: 'Contact country'
  },
  {
    fieldName: 'Assigned Agent',
    csvKey: 'ownerId',
    dbColumn: 'ownerId',
    filterKey: 'assignedAgent',
    entity: 'contact',
    type: 'text',
    description: 'User ID of assigned agent/owner'
  },
  
  // ============================================
  // CROSS-ENTITY FIELDS (Contact filters → Account data via JOIN)
  // ============================================
  {
    fieldName: 'Account Name (via JOIN)',
    csvKey: 'account_name',
    dbColumn: 'name',
    filterKey: 'accountName',
    entity: 'both',
    type: 'text',
    description: 'Filter contacts by their account name',
    requiresJoin: true
  },
  {
    fieldName: 'Account Domain (via JOIN)',
    csvKey: 'account_domain',
    dbColumn: 'domain',
    filterKey: 'accountDomain',
    entity: 'both',
    type: 'text',
    description: 'Filter contacts by their account domain',
    requiresJoin: true
  },
  {
    fieldName: 'Industry (via JOIN)',
    csvKey: 'account_industry',
    dbColumn: 'industryStandardized',
    filterKey: 'industries',
    entity: 'both',
    type: 'text',
    description: 'Filter contacts by their account industry',
    requiresJoin: true
  },
  {
    fieldName: 'Company Size (via JOIN)',
    csvKey: 'account_employeesSize',
    dbColumn: 'employeesSizeRange',
    filterKey: 'companySizes',
    entity: 'both',
    type: 'text',
    description: 'Filter contacts by their account size',
    requiresJoin: true
  },
  {
    fieldName: 'Company Revenue (via JOIN)',
    csvKey: 'account_revenue',
    dbColumn: 'annualRevenue',
    filterKey: 'companyRevenue',
    entity: 'both',
    type: 'text',
    description: 'Filter contacts by their account revenue',
    requiresJoin: true
  },
  {
    fieldName: 'Technologies (via JOIN)',
    csvKey: 'account_techStack',
    dbColumn: 'techStack',
    filterKey: 'technologies',
    entity: 'both',
    type: 'array',
    description: 'Filter contacts by their account technologies',
    requiresJoin: true
  },
  
  // ============================================
  // DATE FIELDS (both entities)
  // ============================================
  {
    fieldName: 'Created Date',
    csvKey: 'createdAt',
    dbColumn: 'createdAt',
    filterKey: 'createdDate',
    entity: 'both',
    type: 'date',
    description: 'Record creation date'
  },
  {
    fieldName: 'Last Activity',
    csvKey: 'updatedAt',
    dbColumn: 'updatedAt',
    filterKey: 'lastActivity',
    entity: 'both',
    type: 'date',
    description: 'Last update/activity date'
  }
];

/**
 * Quick lookup helpers
 */
export const FIELD_MAPPING_INDEX = {
  byFilterKey: new Map(FIELD_MAPPINGS.map(m => [m.filterKey, m])),
  byCsvKey: new Map(FIELD_MAPPINGS.map(m => [m.csvKey, m])),
  byDbColumn: new Map(FIELD_MAPPINGS.map(m => [m.dbColumn, m])),
  byEntity: {
    account: FIELD_MAPPINGS.filter(m => m.entity === 'account' || m.entity === 'both'),
    contact: FIELD_MAPPINGS.filter(m => m.entity === 'contact' || m.entity === 'both'),
  }
};

/**
 * Get database column for filter key
 */
export function getDbColumnForFilter(filterKey: string, entity: 'account' | 'contact'): string | undefined {
  const mapping = FIELD_MAPPING_INDEX.byFilterKey.get(filterKey);
  if (!mapping) return undefined;
  
  // For cross-entity filters, the dbColumn is from the opposite entity
  return mapping.dbColumn;
}

/**
 * Get CSV header for database column
 */
export function getCsvKeyForDbColumn(dbColumn: string): string | undefined {
  const mapping = FIELD_MAPPING_INDEX.byDbColumn.get(dbColumn);
  return mapping?.csvKey;
}

/**
 * Get filter key for CSV header
 */
export function getFilterKeyForCsv(csvKey: string): string | undefined {
  const mapping = FIELD_MAPPING_INDEX.byCsvKey.get(csvKey);
  return mapping?.filterKey;
}
