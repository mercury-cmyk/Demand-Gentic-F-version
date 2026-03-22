/**
 * UKEF Lead Form Submission Service
 * Programmatically submits approved leads to client landing page
 */

import type { SelectLead, SelectAccount, SelectContact } from '@db/schema';

/**
 * Revenue range mapping for UKEF form dropdown
 * Maps numeric annual revenue to UKEF's predefined ranges
 */
export function mapRevenueToUKEFRange(annualRevenue: number | null | undefined): string {
  if (!annualRevenue || annualRevenue = 1_000_000_000) return '£1bn+';
  if (revenue >= 500_000_000) return '£500m to £1bn';
  if (revenue >= 100_000_000) return '£100m to £500m';
  if (revenue >= 50_000_000) return '£50m to £100m';
  if (revenue >= 10_000_000) return '£10m to £50m';
  if (revenue >= 5_000_000) return '£5m to £10m';
  if (revenue >= 1_000_000) return '£1m to £5m';
  if (revenue >= 500_000) return '£500k to £1m';
  if (revenue >= 250_000) return '£250k to £500k';
  
  return ''; // Below £250k doesn't match any range
}

export interface UKEFSubmissionData {
  isUKRegistered: 'Yes' | 'No';
  companyName: string;
  companyRegistrationNumber: string;
  annualTurnover: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  phone: string;
  email: string;
}

export interface UKEFSubmissionResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  submissionUrl?: string;
}

/**
 * Validates that lead has all required data for UKEF submission
 */
export function validateLeadForUKEFSubmission(
  lead: SelectLead,
  contact: SelectContact | null,
  account: SelectAccount | null
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // UK company validation
  if (!account) {
    errors.push('Lead must be associated with an account');
  } else {
    if (!account.chCompanyNumber) {
      errors.push('Company must have a UK Companies House registration number');
    }
    if (!account.chLegalName) {
      errors.push('Company must have a legal company name from Companies House');
    }
    if (account.chValidationStatus !== 'validated') {
      errors.push('Company must be validated with Companies House UK');
    }
    if (!account.chIsActive) {
      errors.push('Company must have active status in Companies House');
    }
  }

  // Contact information validation
  if (!contact) {
    errors.push('Lead must be associated with a contact');
  } else {
    // Check for name (either full name or first/last name)
    if (!contact.fullName && !contact.firstName && !contact.lastName && !lead.contactName) {
      errors.push('Contact must have a name');
    }
    
    // Check for email
    if (!contact.email && !lead.contactEmail) {
      errors.push('Contact must have an email address');
    }
    
    // Check for phone
    if (!contact.directPhone && !contact.directPhoneE164 && !lead.dialedNumber) {
      errors.push('Contact must have a phone number');
    }
    
    // Check for job title
    if (!contact.jobTitle) {
      errors.push('Contact must have a job title');
    }
  }

  // Revenue validation
  if (!account?.annualRevenue && !account?.minAnnualRevenue) {
    errors.push('Company must have annual revenue data');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Prepares submission data from lead, contact, and account
 */
export function prepareUKEFSubmissionData(
  lead: SelectLead,
  contact: SelectContact,
  account: SelectAccount
): UKEFSubmissionData {
  // Parse contact name if needed
  let firstName = contact.firstName || '';
  let lastName = contact.lastName || '';

  // Fallback to full name parsing
  if (!firstName && !lastName) {
    const fullName = contact.fullName || lead.contactName || '';
    const nameParts = fullName.trim().split(/\s+/);
    firstName = nameParts[0] || '';
    lastName = nameParts.slice(1).join(' ') || '';
  }

  // Get phone number (CRITICAL: prioritize dialedNumber - the actual number that was called)
  const phone = lead.dialedNumber || contact.directPhoneE164 || contact.directPhone || '';

  // Get email
  const email = contact.email || lead.contactEmail || '';

  // Get revenue range
  const revenue = account.annualRevenue || account.minAnnualRevenue || 0;
  const annualTurnover = mapRevenueToUKEFRange(Number(revenue));

  return {
    isUKRegistered: 'Yes', // Only submitting validated UK companies
    companyName: account.chLegalName || account.name,
    companyRegistrationNumber: account.chCompanyNumber || '',
    annualTurnover,
    firstName,
    lastName,
    jobTitle: contact.jobTitle || '',
    phone,
    email
  };
}

/**
 * Submits lead to UKEF landing page
 * Field names verified from actual form markup (2025-11-10)
 */
export async function submitLeadToUKEF(
  data: UKEFSubmissionData
): Promise {
  const UKEF_FORM_URL = 'https://zingodistro.com/ns-2351-ukef-leading-export-finance/?source=TM-Pivotal';

  try {
    // Prepare form data as URL-encoded
    const formData = new URLSearchParams();
    
    // Map to actual form field names from UKEF landing page
    formData.append('company_registration_status', data.isUKRegistered); // UK registration status
    formData.append('Company_Name', data.companyName); // Legal company name
    formData.append('company_registration_number', data.companyRegistrationNumber); // Companies House number
    formData.append('annual_turnover', data.annualTurnover); // Revenue range dropdown
    formData.append('names[first_name]', data.firstName); // Contact first name
    formData.append('names[last_name]', data.lastName); // Contact last name
    formData.append('job_title', data.jobTitle); // Contact job title
    formData.append('phone', data.phone); // Contact phone
    formData.append('email', data.email); // Contact email

    const response = await fetch(UKEF_FORM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Pivotal-CRM/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      body: formData.toString(),
      redirect: 'manual' // Don't follow redirects automatically
    });

    // Form submissions often redirect on success (302/303)
    // Also check for 200 OK (some forms return success page directly)
    const isSuccess = response.ok || response.status === 302 || response.status === 303;

    // Log response for debugging
    console.log(`[UKEF-SUBMIT] Response status: ${response.status}`);
    
    if (!isSuccess) {
      console.error(`[UKEF-SUBMIT] Failed with status ${response.status}`);
    }

    return {
      success: isSuccess,
      statusCode: response.status,
      submissionUrl: UKEF_FORM_URL
    };
  } catch (error) {
    console.error('[UKEF-SUBMIT] Submission error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown submission error',
      submissionUrl: UKEF_FORM_URL
    };
  }
}