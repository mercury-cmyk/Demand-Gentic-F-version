/**
 * Unified Filter Configuration - Production Ready
 * 
 * Single source of truth for filter fields with complete 8-operator model
 * organized by entity type for intuitive user experience.
 * 
 * All fields support the complete operator set unless technically impossible.
 */

/**
 * Unified 8-Operator Model
 * 
 * Text operators (require value input):
 *  - equals: Exact match
 *  - not_equals: Negative exact match
 *  - contains: Substring match (case-insensitive)
 *  - not_contains: Negative substring match
 *  - begins_with: Field starts with value
 *  - ends_with: Field ends with value
 * 
 * Null-check operators (no input required):
 *  - is_empty: Field is null/empty
 *  - has_any_value: Field is not null/empty
 */
export type UnifiedOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "begins_with"
  | "ends_with"
  | "is_empty"
  | "has_any_value";

/**
 * Operator Labels for UI Display
 */
export const OPERATOR_LABELS: Record<UnifiedOperator, string> = {
  equals: "Equals",
  not_equals: "Not Equals",
  contains: "Contains",
  not_contains: "Not Contains",
  begins_with: "Begins With",
  ends_with: "Ends With",
  is_empty: "Is Empty",
  has_any_value: "Has Any Value"
};

/**
 * Field Input Type
 */
export type FieldInputType = 
  | "text"           // Free text input
  | "chips"          // Multi-value chip input with type-ahead
  | "select"         // Single select dropdown
  | "multi-select"   // Multi-select dropdown
  | "date"           // Date picker
  | "number"         // Number input
  | "boolean";       // Checkbox/toggle

/**
 * Entity Categories
 */
export type EntityCategory =
  | "Contact"
  | "Account"
  | "Lists & Segments"
  | "Domain Sets / TAL"
  | "Campaigns"
  | "Email"
  | "Call"
  | "Geography"
  | "Ownership"
  | "Dates"
  | "Compliance";

/**
 * Field Configuration
 */
export interface UnifiedFieldConfig {
  /** Display label */
  label: string;
  /** Entity category */
  category: EntityCategory;
  /** Input type */
  inputType: FieldInputType;
  /** Applicable operators (defaults to all 8 if not specified) */
  applicableOperators?: UnifiedOperator[];
  /** Type-ahead API endpoint for chips */
  typeAhead?: {
    endpoint: string;
    searchParam?: string;
  };
  /** Placeholder text */
  placeholder?: string;
  /** Maximum number of values (for chips/multi-select) */
  maxValues?: number;
  /** Database column mapping */
  dbColumn?: {
    contacts?: string;
    accounts?: string;
  };
  /** Description for tooltips */
  description?: string;
}

/**
 * Default operator set (all 8 operators)
 */
const ALL_OPERATORS: UnifiedOperator[] = [
  "equals",
  "not_equals", 
  "contains",
  "not_contains",
  "begins_with",
  "ends_with",
  "is_empty",
  "has_any_value"
];

/**
 * Text-only operators (for fields that don't support null-check)
 */
const TEXT_OPERATORS: UnifiedOperator[] = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "begins_with",
  "ends_with"
];

/**
 * Unified Field Configuration by Entity Type
 */
export const UNIFIED_FIELD_CONFIGS: Record<string, UnifiedFieldConfig> = {
  // ============================================
  // CONTACT FIELDS
  // ============================================
  firstName: {
    label: "First Name",
    category: "Contact",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/first-names",
      searchParam: "search"
    },
    placeholder: "Enter first name...",
    maxValues: 10,
    dbColumn: {
      contacts: "firstName"
    }
  },
  lastName: {
    label: "Last Name",
    category: "Contact",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/last-names",
      searchParam: "search"
    },
    placeholder: "Enter last name...",
    maxValues: 10,
    dbColumn: {
      contacts: "lastName"
    }
  },
  fullName: {
    label: "Full Name",
    category: "Contact",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    placeholder: "Enter full name...",
    maxValues: 10,
    dbColumn: {
      contacts: "fullName"
    }
  },
  email: {
    label: "Email Address",
    category: "Contact",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    placeholder: "Enter email address...",
    maxValues: 10,
    dbColumn: {
      contacts: "email"
    }
  },
  jobTitle: {
    label: "Job Title",
    category: "Contact",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/job-titles",
      searchParam: "search"
    },
    placeholder: "Enter job title...",
    maxValues: 10,
    dbColumn: {
      contacts: "jobTitle"
    }
  },
  seniorityLevel: {
    label: "Seniority Level",
    category: "Contact",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/seniority-levels"
    },
    placeholder: "Select seniority...",
    maxValues: 10,
    dbColumn: {
      contacts: "seniorityLevel"
    }
  },
  department: {
    label: "Department",
    category: "Contact",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/departments",
      searchParam: "search"
    },
    placeholder: "Enter department...",
    maxValues: 10,
    dbColumn: {
      contacts: "department"
    }
  },
  directPhone: {
    label: "Direct Phone",
    category: "Contact",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    placeholder: "Enter phone number...",
    maxValues: 5,
    dbColumn: {
      contacts: "directPhone"
    }
  },
  mobilePhone: {
    label: "Mobile Phone",
    category: "Contact",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    placeholder: "Enter mobile number...",
    maxValues: 5,
    dbColumn: {
      contacts: "mobilePhone"
    }
  },
  contactLinkedinUrl: {
    label: "LinkedIn URL",
    category: "Contact",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    placeholder: "Enter LinkedIn URL...",
    maxValues: 5,
    dbColumn: {
      contacts: "linkedinUrl"
    }
  },
  contactTags: {
    label: "Contact Tags",
    category: "Contact",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/contact-tags",
      searchParam: "search"
    },
    placeholder: "Enter tags...",
    maxValues: 10,
    dbColumn: {
      contacts: "tags"
    }
  },

  // ============================================
  // ACCOUNT FIELDS (Complete Operators)
  // ============================================
  accountName: {
    label: "Company Name",
    category: "Account",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/account-names",
      searchParam: "search"
    },
    placeholder: "Enter company name...",
    maxValues: 10,
    dbColumn: {
      accounts: "name",
      contacts: "name" // via JOIN
    }
  },
  domain: {
    label: "Company Domain",
    category: "Account",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/domains",
      searchParam: "search"
    },
    placeholder: "Enter domain...",
    maxValues: 10,
    dbColumn: {
      accounts: "domain",
      contacts: "domain" // via JOIN
    }
  },
  industry: {
    label: "Industry",
    category: "Account",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/industries",
      searchParam: "search"
    },
    placeholder: "Select industry...",
    maxValues: 10,
    dbColumn: {
      accounts: "industryStandardized",
      contacts: "industryStandardized" // via JOIN
    }
  },
  companySize: {
    label: "Company Size",
    category: "Account",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/company-sizes"
    },
    placeholder: "Select company size...",
    maxValues: 10,
    dbColumn: {
      accounts: "employeesSizeRange",
      contacts: "employeesSizeRange" // via JOIN
    }
  },
  companyRevenue: {
    label: "Annual Revenue",
    category: "Account",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/company-revenue"
    },
    placeholder: "Select revenue range...",
    maxValues: 10,
    dbColumn: {
      accounts: "annualRevenue",
      contacts: "annualRevenue" // via JOIN
    }
  },
  technologies: {
    label: "Technologies",
    category: "Account",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/technologies",
      searchParam: "search"
    },
    placeholder: "Enter technologies...",
    maxValues: 10,
    dbColumn: {
      accounts: "techStack",
      contacts: "techStack" // via JOIN
    }
  },
  accountMainPhone: {
    label: "Company Phone",
    category: "Account",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    placeholder: "Enter company phone...",
    maxValues: 5,
    dbColumn: {
      accounts: "mainPhone"
    }
  },
  accountLinkedinUrl: {
    label: "Company LinkedIn",
    category: "Account",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    placeholder: "Enter LinkedIn URL...",
    maxValues: 5,
    dbColumn: {
      accounts: "linkedinUrl"
    }
  },
  accountDescription: {
    label: "Company Description",
    category: "Account",
    inputType: "chips",
    applicableOperators: TEXT_OPERATORS, // Descriptions are always populated, no null-check needed
    placeholder: "Search in descriptions...",
    maxValues: 5,
    dbColumn: {
      accounts: "description"
    }
  },
  accountTags: {
    label: "Account Tags",
    category: "Account",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/account-tags",
      searchParam: "search"
    },
    placeholder: "Enter tags...",
    maxValues: 10,
    dbColumn: {
      accounts: "tags"
    }
  },
  yearFounded: {
    label: "Year Founded",
    category: "Account",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    placeholder: "Enter year...",
    maxValues: 5,
    dbColumn: {
      accounts: "yearFounded"
    }
  },
  sicCode: {
    label: "SIC Code",
    category: "Account",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    placeholder: "Enter SIC code...",
    maxValues: 5,
    dbColumn: {
      accounts: "sicCode"
    }
  },
  naicsCode: {
    label: "NAICS Code",
    category: "Account",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    placeholder: "Enter NAICS code...",
    maxValues: 5,
    dbColumn: {
      accounts: "naicsCode"
    }
  },

  // ============================================
  // LISTS & SEGMENTS
  // ============================================
  listName: {
    label: "List Name",
    category: "Lists & Segments",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/lists",
      searchParam: "search"
    },
    placeholder: "Select list...",
    maxValues: 10
  },
  segmentName: {
    label: "Segment Name",
    category: "Lists & Segments",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/segments",
      searchParam: "search"
    },
    placeholder: "Select segment...",
    maxValues: 10
  },

  // ============================================
  // DOMAIN SETS / TARGET ACCOUNT LISTS (TAL)
  // ============================================
  domainSet: {
    label: "Domain Set",
    category: "Domain Sets / TAL",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/domain-sets",
      searchParam: "search"
    },
    placeholder: "Select domain set...",
    maxValues: 10,
    description: "Target Account Lists (TAL) based on domain sets"
  },

  // ============================================
  // CAMPAIGNS
  // ============================================
  campaignName: {
    label: "Campaign Name",
    category: "Campaigns",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/campaigns",
      searchParam: "search"
    },
    placeholder: "Select campaign...",
    maxValues: 10
  },
  campaignType: {
    label: "Campaign Type",
    category: "Campaigns",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/campaign-types"
    },
    placeholder: "Select type...",
    maxValues: 5
  },
  campaignStatus: {
    label: "Campaign Status",
    category: "Campaigns",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/campaign-status"
    },
    placeholder: "Select status...",
    maxValues: 10
  },
  campaignOwner: {
    label: "Campaign Owner",
    category: "Campaigns",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/users",
      searchParam: "search"
    },
    placeholder: "Select owner...",
    maxValues: 10
  },
  dialMode: {
    label: "Dial Mode",
    category: "Campaigns",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/dial-modes"
    },
    placeholder: "Select dial mode...",
    maxValues: 2
  },

  // ============================================
  // EMAIL
  // ============================================
  emailStatus: {
    label: "Email Verification Status",
    category: "Email",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/email-verification-status"
    },
    placeholder: "Select email status...",
    maxValues: 5,
    dbColumn: {
      contacts: "emailVerificationStatus"
    }
  },
  emailBounceReason: {
    label: "Email Bounce Reason",
    category: "Email",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    placeholder: "Enter bounce reason...",
    maxValues: 5
  },

  // ============================================
  // CALL
  // ============================================
  phoneStatus: {
    label: "Phone Status",
    category: "Call",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/phone-status"
    },
    placeholder: "Select phone status...",
    maxValues: 5,
    dbColumn: {
      contacts: "phoneStatus"
    }
  },
  callDisposition: {
    label: "Call Disposition",
    category: "Call",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/call-dispositions"
    },
    placeholder: "Select disposition...",
    maxValues: 10
  },
  qaStatus: {
    label: "QA Status",
    category: "Call",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/qa-status"
    },
    placeholder: "Select QA status...",
    maxValues: 5
  },
  qaOutcome: {
    label: "QA Outcome",
    category: "Call",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/qa-outcomes"
    },
    placeholder: "Select outcome...",
    maxValues: 5
  },

  // ============================================
  // GEOGRAPHY
  // ============================================
  country: {
    label: "Country",
    category: "Geography",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/countries",
      searchParam: "search"
    },
    placeholder: "Select country...",
    maxValues: 10,
    dbColumn: {
      accounts: "hqCountry",
      contacts: "country"
    }
  },
  state: {
    label: "State / Province",
    category: "Geography",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/states",
      searchParam: "search"
    },
    placeholder: "Select state...",
    maxValues: 10,
    dbColumn: {
      accounts: "hqState",
      contacts: "state"
    }
  },
  city: {
    label: "City",
    category: "Geography",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/cities",
      searchParam: "search"
    },
    placeholder: "Select city...",
    maxValues: 10,
    dbColumn: {
      accounts: "hqCity",
      contacts: "city"
    }
  },

  // ============================================
  // OWNERSHIP
  // ============================================
  accountOwner: {
    label: "Account Owner",
    category: "Ownership",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/users",
      searchParam: "search"
    },
    placeholder: "Select owner...",
    maxValues: 10,
    dbColumn: {
      accounts: "ownerId",
      contacts: "ownerId" // via JOIN
    }
  },
  assignedAgent: {
    label: "Assigned Agent",
    category: "Ownership",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/users",
      searchParam: "search"
    },
    placeholder: "Select agent...",
    maxValues: 10,
    dbColumn: {
      contacts: "ownerId"
    }
  },

  // ============================================
  // COMPLIANCE
  // ============================================
  consentBasis: {
    label: "Consent Basis",
    category: "Compliance",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/consent-basis"
    },
    placeholder: "Select consent basis...",
    maxValues: 5,
    dbColumn: {
      contacts: "consentBasis"
    }
  },
  consentSource: {
    label: "Consent Source",
    category: "Compliance",
    inputType: "chips",
    applicableOperators: ALL_OPERATORS,
    typeAhead: {
      endpoint: "/api/filters/options/consent-sources",
      searchParam: "search"
    },
    placeholder: "Enter consent source...",
    maxValues: 10,
    dbColumn: {
      contacts: "consentSource"
    }
  },

  // ============================================
  // DATES
  // ============================================
  createdDate: {
    label: "Created Date",
    category: "Dates",
    inputType: "date",
    applicableOperators: ["equals", "not_equals", "is_empty", "has_any_value"],
    dbColumn: {
      accounts: "createdAt",
      contacts: "createdAt"
    }
  },
  lastActivity: {
    label: "Last Activity",
    category: "Dates",
    inputType: "date",
    applicableOperators: ["equals", "not_equals", "is_empty", "has_any_value"],
    dbColumn: {
      accounts: "updatedAt",
      contacts: "updatedAt"
    }
  }
};

/**
 * Module-Specific Field Visibility
 */
export const MODULE_FIELD_SETS: Record<string, string[]> = {
  contacts: [
    // Contact fields
    "firstName",
    "lastName",
    "fullName",
    "email",
    "jobTitle",
    "seniorityLevel",
    "department",
    "directPhone",
    "mobilePhone",
    "contactLinkedinUrl",
    "contactTags",
    // Account fields (via JOIN)
    "accountName",
    "domain",
    "industry",
    "companySize",
    "companyRevenue",
    "technologies",
    // Geography
    "country",
    "state",
    "city",
    // Email & Call
    "emailStatus",
    "phoneStatus",
    // Lists & Campaigns
    "listName",
    "segmentName",
    "campaignName",
    // Ownership & Compliance
    "assignedAgent",
    "accountOwner",
    "consentBasis",
    "consentSource",
    // Dates
    "createdDate",
    "lastActivity"
  ],
  accounts: [
    // Account fields
    "accountName",
    "domain",
    "industry",
    "companySize",
    "companyRevenue",
    "technologies",
    "accountMainPhone",
    "accountLinkedinUrl",
    "accountDescription",
    "accountTags",
    "yearFounded",
    "sicCode",
    "naicsCode",
    // Geography
    "country",
    "state",
    "city",
    // Lists & Domain Sets
    "listName",
    "segmentName",
    "domainSet",
    // Ownership
    "accountOwner",
    // Dates
    "createdDate",
    "lastActivity"
  ],
  campaigns: [
    "campaignName",
    "campaignType",
    "campaignStatus",
    "campaignOwner",
    "dialMode",
    "listName",
    "segmentName",
    "createdDate",
    "lastActivity"
  ]
};

/**
 * Get field configuration with defaults
 */
export function getFieldConfig(fieldKey: string): UnifiedFieldConfig | undefined {
  const config = UNIFIED_FIELD_CONFIGS[fieldKey];
  if (!config) return undefined;

  return {
    ...config,
    applicableOperators: config.applicableOperators || ALL_OPERATORS
  };
}

/**
 * Get fields by category
 */
export function getFieldsByCategory(category: EntityCategory): Record<string, UnifiedFieldConfig> {
  return Object.fromEntries(
    Object.entries(UNIFIED_FIELD_CONFIGS).filter(
      ([_, config]) => config.category === category
    )
  );
}

/**
 * Get fields for module
 */
export function getFieldsForModule(module: string): Record<string, UnifiedFieldConfig> {
  const fieldKeys = MODULE_FIELD_SETS[module] || [];
  return Object.fromEntries(
    fieldKeys.map(key => [key, UNIFIED_FIELD_CONFIGS[key]]).filter(([_, config]) => config)
  );
}
