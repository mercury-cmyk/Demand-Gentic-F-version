/**
 * Pivotal B2B CRM - Global Reference Data
 * 
 * Standardized dropdown values matching the global data template.
 * Used across all modules for consistent data entry and filtering.
 */

/**
 * Seniority Levels - Standard Template
 */
export const SENIORITY_LEVELS = [
  { id: 'CXO', name: 'CXO' },
  { id: 'Vice President', name: 'Vice President' },
  { id: 'Director', name: 'Director' },
  { id: 'Manager', name: 'Manager' },
  { id: 'Non-Manager', name: 'Non-Manager' }
] as const;

/**
 * Employee Size Bands - Standard Template
 * Matches: 1–10, 11–50, 51–200, 201–500, 501–1,000, 1,001–5,000, 5,001–10,000, 10,000+
 */
export const EMPLOYEE_SIZE_BANDS = [
  { id: '1 - 10 employees', name: '1 - 10 employees' },
  { id: '11 - 50 employees', name: '11 - 50 employees' },
  { id: '51 - 200 employees', name: '51 - 200 employees' },
  { id: '201 - 500 employees', name: '201 - 500 employees' },
  { id: '501 - 1,000 employees', name: '501 - 1,000 employees' },
  { id: '1,001 - 5,000 employees', name: '1,001 - 5,000 employees' },
  { id: '5,001 - 10,000 employees', name: '5,001 - 10,000 employees' },
  { id: '10,001+ employees', name: '10,001+ employees' }
] as const;

/**
 * Company Revenue Bands - Standard Template
 * $1M–$10M, $10M–$50M, $50M–$100M, $100M+
 */
export const REVENUE_BANDS = [
  { id: '$0 - $1M', name: '$0 - $1M' },
  { id: '$1M - $10M', name: '$1M - $10M' },
  { id: '$10M - $50M', name: '$10M - $50M' },
  { id: '$50M - $100M', name: '$50M - $100M' },
  { id: '$100M+', name: '$100M+' }
] as const;

/**
 * Job Functions - Common B2B Roles
 */
export const JOB_FUNCTIONS = [
  { id: 'Sales', name: 'Sales' },
  { id: 'Marketing', name: 'Marketing' },
  { id: 'Engineering', name: 'Engineering' },
  { id: 'Product', name: 'Product' },
  { id: 'Operations', name: 'Operations' },
  { id: 'Finance', name: 'Finance' },
  { id: 'Human Resources', name: 'Human Resources' },
  { id: 'IT', name: 'IT' },
  { id: 'Customer Success', name: 'Customer Success' },
  { id: 'Legal', name: 'Legal' },
  { id: 'Executive', name: 'Executive' }
] as const;

/**
 * Departments - Common B2B Departments
 */
export const DEPARTMENTS = [
  { id: 'Executive Leadership', name: 'Executive Leadership' },
  { id: 'Sales', name: 'Sales' },
  { id: 'Marketing', name: 'Marketing' },
  { id: 'Engineering & Development', name: 'Engineering & Development' },
  { id: 'Product Management', name: 'Product Management' },
  { id: 'Operations', name: 'Operations' },
  { id: 'Finance & Accounting', name: 'Finance & Accounting' },
  { id: 'Human Resources', name: 'Human Resources' },
  { id: 'Information Technology', name: 'Information Technology' },
  { id: 'Customer Support', name: 'Customer Support' },
  { id: 'Legal & Compliance', name: 'Legal & Compliance' },
  { id: 'Research & Development', name: 'Research & Development' }
] as const;

/**
 * Campaign Status Values
 */
export const CAMPAIGN_STATUS_VALUES = [
  { id: 'draft', name: 'Draft' },
  { id: 'scheduled', name: 'Scheduled' },
  { id: 'active', name: 'Active' },
  { id: 'paused', name: 'Paused' },
  { id: 'completed', name: 'Completed' },
  { id: 'cancelled', name: 'Cancelled' }
] as const;

/**
 * Campaign Type Values
 */
export const CAMPAIGN_TYPE_VALUES = [
  { id: 'email', name: 'Email' },
  { id: 'call', name: 'Call' },
  { id: 'combo', name: 'Combo' }
] as const;

/**
 * QA Status Values
 */
export const QA_STATUS_VALUES = [
  { id: 'new', name: 'New' },
  { id: 'under_review', name: 'Under Review' },
  { id: 'approved', name: 'Approved' },
  { id: 'rejected', name: 'Rejected' },
  { id: 'returned', name: 'Returned' },
  { id: 'published', name: 'Published' }
] as const;

/**
 * Email Verification Status - Standardized 4-Status System
 * - valid: Verified deliverable emails
 * - invalid: Hard failures (syntax errors, no MX, disabled mailboxes)
 * - unknown: Unverified or couldn't determine
 * - acceptable: May deliver but has risk factors (catch-all, role accounts)
 */
export const EMAIL_VERIFICATION_STATUS = [
  { id: 'valid', name: 'Valid' },
  { id: 'acceptable', name: 'Acceptable' },
  { id: 'unknown', name: 'Unknown' },
  { id: 'invalid', name: 'Invalid' }
] as const;

/**
 * Dial Mode Values
 */
export const DIAL_MODE_VALUES = [
  { id: 'manual', name: 'Manual Dial' },
  { id: 'hybrid', name: 'Hybrid (Humans + AI)' }
] as const;