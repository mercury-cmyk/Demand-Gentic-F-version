import { z } from "zod";
import {
  ACCOUNT_FIELD_LABELS,
  ACCOUNT_ADDRESS_LABELS,
  CONTACT_FIELD_LABELS,
  CONTACT_ADDRESS_LABELS
} from "./field-labels";

/**
 * Simplified Unified Operator Model
 * 
 * All fields support the same 8 operators (where applicable):
 * - equals, not_equals, contains, not_contains, begins_with, ends_with, is_empty, has_any_value
 * 
 * Multi-value support: users can provide one or more values per condition
 * - Values within same field = OR logic
 * - Different fields = AND logic
 */

// Supported entity types for filtering
export type EntityType = 'account' | 'contact' | 'lead' | 'campaign' | 'segment' | 'list' | 'order' | 'suppression';

// Core operators supported across all field types
export const operators = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'begins_with',
  'ends_with',
  'is_empty',
  'has_any_value',
  'gte',
  'lte',
  'gt',
  'lt',
  'in',
  'arrayContains'
] as const;

export type Operator = typeof operators[number];

// Operator display labels
export const operatorLabels: Record<Operator, string> = {
  equals: 'Equals',
  not_equals: 'Not Equals',
  contains: 'Contains',
  not_contains: 'Does Not Contain',
  begins_with: 'Begins With',
  ends_with: 'Ends With',
  is_empty: 'Is Empty',
  has_any_value: 'Has Any Value',
  gte: 'Greater Than or Equal',
  lte: 'Less Than or Equal',
  gt: 'Greater Than',
  lt: 'Less Than',
  in: 'In',
  arrayContains: 'Array Contains'
};

// Operator descriptions for tooltips
export const operatorDescriptions: Record<Operator, string> = {
  equals: 'Exactly matches any of the entered values',
  not_equals: 'Does not match any of the entered values',
  contains: 'Contains any of the entered text (case-insensitive)',
  not_contains: 'Does not contain any of the entered text',
  begins_with: 'Starts with any of the entered text',
  ends_with: 'Ends with any of the entered text',
  is_empty: 'Field is empty or null',
  has_any_value: 'Field has a value (not empty or null)',
  gte: 'Value is greater than or equal to',
  lte: 'Value is less than or equal to',
  gt: 'Value is greater than',
  lt: 'Value is less than',
  in: 'Value is in the list',
  arrayContains: 'Array contains the value'
};

// Field type categories (determines which operators are applicable)
export type FilterFieldType = 'text' | 'number' | 'date' | 'enum' | 'array';

// Field configuration with operator applicability
export interface FieldConfig {
  label: string;
  type: FilterFieldType;
  category?: string;
  // Which operators are applicable for this field type
  applicableOperators: Operator[];
  // Whether this field supports type-ahead chip selection
  typeAhead?: boolean;
  // Type-ahead source endpoint (if applicable)
  typeAheadSource?: string;
}

// Operator applicability by field type
export const operatorsByFieldType: Record<FilterFieldType, Operator[]> = {
  text: [
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'begins_with',
    'ends_with',
    'is_empty',
    'has_any_value'
  ],
  number: [
    'equals',
    'not_equals',
    'is_empty',
    'has_any_value'
    // Range operators (greaterThan, lessThan, between) can be added later
  ],
  date: [
    'equals',
    'not_equals',
    'is_empty',
    'has_any_value'
    // Date-specific operators (before, after, between) can be added later
  ],
  enum: [
    'equals',
    'not_equals',
    'is_empty',
    'has_any_value'
  ],
  array: [
    'contains',      // Contains any of the values
    'not_contains',  // Does not contain any of the values
    'is_empty',
    'has_any_value'
  ]
};

// Account filter fields with simplified configuration
export const accountFilterFields: Record<string, FieldConfig> = {
  // Text fields
  name: {
    label: ACCOUNT_FIELD_LABELS.name,
    type: 'text',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.text
  },
  domain: {
    label: ACCOUNT_FIELD_LABELS.domain,
    type: 'text',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.text
  },
  industryStandardized: {
    label: ACCOUNT_FIELD_LABELS.industryStandardized,
    type: 'text',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'industries'
  },
  description: {
    label: ACCOUNT_FIELD_LABELS.description,
    type: 'text',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.text
  },
  hqCity: {
    label: ACCOUNT_ADDRESS_LABELS.hqCity,
    type: 'text',
    category: 'Account Geography',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'cities'
  },
  hqState: {
    label: ACCOUNT_ADDRESS_LABELS.hqState,
    type: 'text',
    category: 'Account Geography',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'states'
  },
  hqCountry: {
    label: ACCOUNT_ADDRESS_LABELS.hqCountry,
    type: 'text',
    category: 'Account Geography',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'countries'
  },
  sicCode: {
    label: ACCOUNT_FIELD_LABELS.sicCode,
    type: 'text',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.text
  },
  naicsCode: {
    label: ACCOUNT_FIELD_LABELS.naicsCode,
    type: 'text',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.text
  },
  mainPhone: {
    label: ACCOUNT_FIELD_LABELS.mainPhone,
    type: 'text',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.text
  },
  linkedinUrl: {
    label: ACCOUNT_FIELD_LABELS.linkedinUrl,
    type: 'text',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.text
  },
  
  // Enum/Text fields with complete operators (treating as text for full filtering)
  employeesSizeRange: {
    label: ACCOUNT_FIELD_LABELS.employeesSizeRange,
    type: 'text', // Changed from enum to text for complete operators
    category: 'Account - Firmographic',
    applicableOperators: operatorsByFieldType.text, // Full 8 operators
    typeAhead: true,
    typeAheadSource: 'company-sizes'
  },
  annualRevenue: {
    label: ACCOUNT_FIELD_LABELS.annualRevenue,
    type: 'text', // Changed from enum to text for complete operators
    category: 'Account - Firmographic',
    applicableOperators: operatorsByFieldType.text, // Full 8 operators
    typeAhead: true,
    typeAheadSource: 'company-revenue'
  },
  
  // Number fields with complete operators
  staffCount: {
    label: ACCOUNT_FIELD_LABELS.staffCount,
    type: 'text', // Treat as text for complete operator support
    category: 'Account - Firmographic',
    applicableOperators: operatorsByFieldType.text
  },
  yearFounded: {
    label: ACCOUNT_FIELD_LABELS.yearFounded,
    type: 'text', // Treat as text for complete operator support
    category: 'Account - Firmographic',
    applicableOperators: operatorsByFieldType.text
  },
  
  // Array fields with complete operators
  techStack: {
    label: ACCOUNT_FIELD_LABELS.techStack,
    type: 'text', // Treat as text for complete operator support
    category: 'Account - Technology',
    applicableOperators: operatorsByFieldType.text, // Full 8 operators
    typeAhead: true,
    typeAheadSource: 'technologies'
  },
  tags: {
    label: ACCOUNT_FIELD_LABELS.tags,
    type: 'text',
    category: 'Account - Metadata',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'account-tags'
  },
  ownerId: {
    label: ACCOUNT_FIELD_LABELS.ownerId,
    type: 'text',
    category: 'Ownership',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'users'
  }
};

// Contact filter fields with simplified configuration
export const contactFilterFields: Record<string, FieldConfig> = {
  // Text fields
  fullName: {
    label: CONTACT_FIELD_LABELS.fullName,
    type: 'text',
    category: 'Contact Information',
    applicableOperators: operatorsByFieldType.text
  },
  firstName: {
    label: CONTACT_FIELD_LABELS.firstName,
    type: 'text',
    category: 'Contact Information',
    applicableOperators: operatorsByFieldType.text
  },
  lastName: {
    label: CONTACT_FIELD_LABELS.lastName,
    type: 'text',
    category: 'Contact Information',
    applicableOperators: operatorsByFieldType.text
  },
  email: {
    label: CONTACT_FIELD_LABELS.email,
    type: 'text',
    category: 'Contact Information',
    applicableOperators: operatorsByFieldType.text
  },
  jobTitle: {
    label: CONTACT_FIELD_LABELS.jobTitle,
    type: 'text',
    category: 'Contact Information',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'job-titles'
  },
  department: {
    label: CONTACT_FIELD_LABELS.department,
    type: 'text',
    category: 'Contact Information',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'departments'
  },
  seniorityLevel: {
    label: CONTACT_FIELD_LABELS.seniorityLevel,
    type: 'text',
    category: 'Contact Information',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'seniority-levels'
  },
  directPhone: {
    label: CONTACT_FIELD_LABELS.directPhone,
    type: 'text',
    category: 'Contact Information',
    applicableOperators: operatorsByFieldType.text
  },
  mobilePhone: {
    label: CONTACT_FIELD_LABELS.mobilePhone,
    type: 'text',
    category: 'Contact Information',
    applicableOperators: operatorsByFieldType.text
  },
  linkedinUrl: {
    label: CONTACT_FIELD_LABELS.linkedinUrl,
    type: 'text',
    category: 'Contact Information',
    applicableOperators: operatorsByFieldType.text
  },
  city: {
    label: CONTACT_ADDRESS_LABELS.city,
    type: 'text',
    category: 'Contact Geography',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'cities'
  },
  state: {
    label: CONTACT_ADDRESS_LABELS.state,
    type: 'text',
    category: 'Contact Geography',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'states'
  },
  country: {
    label: CONTACT_ADDRESS_LABELS.country,
    type: 'text',
    category: 'Contact Geography',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'countries'
  },
  consentBasis: {
    label: CONTACT_FIELD_LABELS.consentBasis,
    type: 'text',
    category: 'Compliance',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'consent-basis'
  },
  consentSource: {
    label: CONTACT_FIELD_LABELS.consentSource,
    type: 'text',
    category: 'Compliance',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'consent-source'
  },
  list: {
    label: CONTACT_FIELD_LABELS.list,
    type: 'text',
    category: 'Lists & Segments',
    applicableOperators: operatorsByFieldType.text
  },
  
  // Lists & Segments
  listName: {
    label: 'Static List',
    type: 'text',
    category: 'Lists & Segments',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'lists'
  },
  segmentName: {
    label: 'Dynamic Segment',
    type: 'text',
    category: 'Lists & Segments',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'segments'
  },
  domainSetName: {
    label: 'Domain Set',
    type: 'text',
    category: 'Lists & Segments',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'domain-sets'
  },
  
  // Array fields
  tags: {
    label: CONTACT_FIELD_LABELS.tags,
    type: 'array',
    category: 'General',
    applicableOperators: operatorsByFieldType.array,
    typeAhead: true,
    typeAheadSource: 'contact-tags'
  },
  
  // Company fields (via JOIN to accounts table)
  accountName: {
    label: ACCOUNT_FIELD_LABELS.name,
    type: 'text',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'account-names'
  },
  accountDomain: {
    label: ACCOUNT_FIELD_LABELS.domain,
    type: 'text',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'account-domains'
  },
  industryStandardized: {
    label: ACCOUNT_FIELD_LABELS.industryStandardized,
    type: 'text',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'industries'
  },
  employeesSizeRange: {
    label: ACCOUNT_FIELD_LABELS.employeesSizeRange,
    type: 'enum',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.enum,
    typeAhead: true,
    typeAheadSource: 'company-sizes'
  },
  annualRevenue: {
    label: ACCOUNT_FIELD_LABELS.annualRevenue,
    type: 'enum',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.enum,
    typeAhead: true,
    typeAheadSource: 'company-revenue'
  },
  techStack: {
    label: ACCOUNT_FIELD_LABELS.techStack,
    type: 'array',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.array,
    typeAhead: true,
    typeAheadSource: 'technologies'
  }
};

/**
 * Simplified Filter Condition
 * 
 * Each condition has:
 * - field: The field to filter on
 * - operator: One of the standard operators
 * - values: Array of values (multi-value support with OR logic within field)
 * - value: Single value (backward compatibility)
 */
export const filterConditionSchema = z.object({
  id: z.string(),
  field: z.string(),
  operator: z.enum(operators),
  values: z.array(z.union([z.string(), z.number()])).default([]),
  value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]).optional()
});

export type FilterCondition = z.infer<typeof filterConditionSchema>;

// Filter group schema (for AND/OR logic between conditions)
export const filterGroupSchema = z.object({
  logic: z.enum(['AND', 'OR']).default('AND'),
  combinator: z.enum(['and', 'or']).optional(),
  conditions: z.array(filterConditionSchema),
  qaStatus: z.string().optional()
});

export type FilterGroup = z.infer<typeof filterGroupSchema>;

// Saved filter schema
export const savedFilterSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Filter name is required'),
  description: z.string().optional(),
  entityType: z.enum(['account', 'contact', 'lead', 'campaign', 'segment', 'list', 'order', 'suppression']),
  filterGroup: filterGroupSchema
});

export type SavedFilter = z.infer<typeof savedFilterSchema>;

// =============================================================================
// LEAD FILTER FIELDS
// =============================================================================
export const leadFilterFields: Record<string, FieldConfig> = {
  // Lead Status & Quality
  qaStatus: {
    label: 'QA Status',
    type: 'enum',
    category: 'Lead Status',
    applicableOperators: operatorsByFieldType.enum,
    typeAhead: true,
    typeAheadSource: 'qa-status'
  },
  deliveryStatus: {
    label: 'Delivery Status',
    type: 'enum',
    category: 'Lead Status',
    applicableOperators: operatorsByFieldType.enum,
    typeAhead: true,
    typeAheadSource: 'delivery-status'
  },
  status: {
    label: 'Lead Status',
    type: 'enum',
    category: 'Lead Status',
    applicableOperators: operatorsByFieldType.enum,
    typeAhead: true,
    typeAheadSource: 'lead-status'
  },
  confidence: {
    label: 'Confidence Score',
    type: 'number',
    category: 'Lead Quality',
    applicableOperators: operatorsByFieldType.number
  },
  
  // Contact Information
  contactName: {
    label: 'Contact Name',
    type: 'text',
    category: 'Contact Information',
    applicableOperators: operatorsByFieldType.text
  },
  contactEmail: {
    label: 'Contact Email',
    type: 'text',
    category: 'Contact Information',
    applicableOperators: operatorsByFieldType.text
  },
  contactPhone: {
    label: 'Contact Phone',
    type: 'text',
    category: 'Contact Information',
    applicableOperators: operatorsByFieldType.text
  },
  jobTitle: {
    label: 'Job Title',
    type: 'text',
    category: 'Contact Information',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'job-titles'
  },
  
  // Company Information
  companyName: {
    label: 'Company Name',
    type: 'text',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'account-names'
  },
  industry: {
    label: 'Industry',
    type: 'text',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'industries'
  },
  companySize: {
    label: 'Company Size',
    type: 'text',
    category: 'Company Information',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'company-sizes'
  },
  
  // Campaign & Assignment
  campaignId: {
    label: 'Campaign',
    type: 'text',
    category: 'Campaign & Assignment',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'campaigns'
  },
  agentId: {
    label: 'Agent',
    type: 'text',
    category: 'Campaign & Assignment',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'users'
  },
  
  // Tags & Metadata
  tags: {
    label: 'Tags',
    type: 'array',
    category: 'Tags & Metadata',
    applicableOperators: operatorsByFieldType.array,
    typeAhead: true,
    typeAheadSource: 'lead-tags'
  },
  
  // Date Filters
  createdAt: {
    label: 'Created Date',
    type: 'date',
    category: 'Dates',
    applicableOperators: operatorsByFieldType.date
  },
  submittedAt: {
    label: 'Submitted Date',
    type: 'date',
    category: 'Dates',
    applicableOperators: operatorsByFieldType.date
  }
};

// =============================================================================
// CAMPAIGN FILTER FIELDS
// =============================================================================
export const campaignFilterFields: Record<string, FieldConfig> = {
  // Campaign Type & Status
  name: {
    label: 'Campaign Name',
    type: 'text',
    category: 'Campaign Information',
    applicableOperators: operatorsByFieldType.text
  },
  type: {
    label: 'Campaign Type',
    type: 'enum',
    category: 'Campaign Information',
    applicableOperators: operatorsByFieldType.enum,
    typeAhead: true,
    typeAheadSource: 'campaign-types'
  },
  status: {
    label: 'Status',
    type: 'enum',
    category: 'Campaign Information',
    applicableOperators: operatorsByFieldType.enum,
    typeAhead: true,
    typeAheadSource: 'campaign-status'
  },
  
  // Performance Metrics
  leadGoal: {
    label: 'Lead Goal',
    type: 'number',
    category: 'Performance',
    applicableOperators: operatorsByFieldType.number
  },
  leadsGenerated: {
    label: 'Leads Generated',
    type: 'number',
    category: 'Performance',
    applicableOperators: operatorsByFieldType.number
  },
  
  // Configuration
  dialMode: {
    label: 'Dial Mode',
    type: 'enum',
    category: 'Configuration',
    applicableOperators: operatorsByFieldType.enum,
    typeAhead: true,
    typeAheadSource: 'dial-modes'
  },
  aiAgentEnabled: {
    label: 'AI Agent Enabled',
    type: 'enum',
    category: 'Configuration',
    applicableOperators: operatorsByFieldType.enum
  },
  
  // Ownership & Dates
  ownerId: {
    label: 'Owner',
    type: 'text',
    category: 'Ownership',
    applicableOperators: operatorsByFieldType.text,
    typeAhead: true,
    typeAheadSource: 'users'
  },
  createdAt: {
    label: 'Created Date',
    type: 'date',
    category: 'Dates',
    applicableOperators: operatorsByFieldType.date
  },
  startDate: {
    label: 'Start Date',
    type: 'date',
    category: 'Dates',
    applicableOperators: operatorsByFieldType.date
  },
  endDate: {
    label: 'End Date',
    type: 'date',
    category: 'Dates',
    applicableOperators: operatorsByFieldType.date
  }
};

// =============================================================================
// SEGMENT/LIST FILTER FIELDS
// =============================================================================
export const segmentFilterFields: Record<string, FieldConfig> = {
  name: {
    label: 'Name',
    type: 'text',
    category: 'Segment Information',
    applicableOperators: operatorsByFieldType.text
  },
  entityType: {
    label: 'Entity Type',
    type: 'enum',
    category: 'Segment Information',
    applicableOperators: operatorsByFieldType.enum
  },
  visibilityScope: {
    label: 'Visibility',
    type: 'enum',
    category: 'Segment Information',
    applicableOperators: operatorsByFieldType.enum
  },
  isActive: {
    label: 'Active',
    type: 'enum',
    category: 'Segment Information',
    applicableOperators: operatorsByFieldType.enum
  },
  tags: {
    label: 'Tags',
    type: 'array',
    category: 'Tags',
    applicableOperators: operatorsByFieldType.array
  },
  createdAt: {
    label: 'Created Date',
    type: 'date',
    category: 'Dates',
    applicableOperators: operatorsByFieldType.date
  }
};

// =============================================================================
// SUPPRESSION FILTER FIELDS
// =============================================================================
export const suppressionFilterFields: Record<string, FieldConfig> = {
  type: {
    label: 'Type',
    type: 'enum',
    category: 'Suppression Information',
    applicableOperators: operatorsByFieldType.enum
  },
  reason: {
    label: 'Reason',
    type: 'text',
    category: 'Suppression Information',
    applicableOperators: operatorsByFieldType.text
  },
  source: {
    label: 'Source',
    type: 'text',
    category: 'Suppression Information',
    applicableOperators: operatorsByFieldType.text
  },
  createdAt: {
    label: 'Created Date',
    type: 'date',
    category: 'Dates',
    applicableOperators: operatorsByFieldType.date
  }
};

// =============================================================================
// ORDER FILTER FIELDS
// =============================================================================
export const orderFilterFields: Record<string, FieldConfig> = {
  orderNumber: {
    label: 'Order Number',
    type: 'text',
    category: 'Order Information',
    applicableOperators: operatorsByFieldType.text
  },
  type: {
    label: 'Order Type',
    type: 'enum',
    category: 'Order Information',
    applicableOperators: operatorsByFieldType.enum
  },
  status: {
    label: 'Status',
    type: 'enum',
    category: 'Order Information',
    applicableOperators: operatorsByFieldType.enum
  },
  leadGoal: {
    label: 'Lead Goal',
    type: 'number',
    category: 'Order Information',
    applicableOperators: operatorsByFieldType.number
  },
  deliveredCount: {
    label: 'Delivered Count',
    type: 'number',
    category: 'Order Information',
    applicableOperators: operatorsByFieldType.number
  },
  audienceNotes: {
    label: 'Audience Notes',
    type: 'text',
    category: 'Order Details',
    applicableOperators: operatorsByFieldType.text
  },
  qualificationCriteria: {
    label: 'Qualification Criteria',
    type: 'text',
    category: 'Order Details',
    applicableOperators: operatorsByFieldType.text
  },
  createdAt: {
    label: 'Created Date',
    type: 'date',
    category: 'Dates',
    applicableOperators: operatorsByFieldType.date
  },
  startDate: {
    label: 'Start Date',
    type: 'date',
    category: 'Dates',
    applicableOperators: operatorsByFieldType.date
  },
  endDate: {
    label: 'End Date',
    type: 'date',
    category: 'Dates',
    applicableOperators: operatorsByFieldType.date
  }
};

// Export all filter fields by entity type
export const filterFieldsByEntity: Record<EntityType, Record<string, FieldConfig>> = {
  account: accountFilterFields,
  contact: contactFilterFields,
  lead: leadFilterFields,
  campaign: campaignFilterFields,
  segment: segmentFilterFields,
  list: segmentFilterFields, // Same as segment
  order: orderFilterFields,
  suppression: suppressionFilterFields
};

/**
 * BACKWARD COMPATIBILITY EXPORTS
 * 
 * Support old FilterBuilder component during migration to simplified system
 * These map old multi-tier operators to new unified operators
 */

// Old operator type exports (map to new unified operators)
export const textOperators = operators;
export const numberOperators = operators.filter(op => ['equals', 'not_equals', 'is_empty', 'has_any_value'].includes(op));
export const arrayOperators = operators.filter(op => ['contains', 'not_contains', 'is_empty', 'has_any_value'].includes(op));
export const booleanOperators = ['equals', 'not_equals'] as const;
export const enumOperators = operators.filter(op => ['equals', 'not_equals', 'is_empty', 'has_any_value'].includes(op));

export type TextOperator = typeof operators[number];
export type NumberOperator = 'equals' | 'not_equals' | 'is_empty' | 'has_any_value';
export type ArrayOperator = 'contains' | 'not_contains' | 'is_empty' | 'has_any_value';
export type BooleanOperator = 'equals' | 'not_equals';
