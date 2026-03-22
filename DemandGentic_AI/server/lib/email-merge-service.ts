/**
 * Email Merge Service
 * Replaces merge tags in email content with actual contact/account data
 */

import { db } from '../db';
import { contacts, accounts, campaigns, senderProfiles } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { generateTrackingUrl } from './urlGenerator';

interface MergeData {
  contact?: Record;
  account?: Record;
  campaign?: Record;
  sender?: Record;
  // System merge tags
  unsubscribe_url?: string;
  view_in_browser_url?: string;
  current_date?: string;
  current_year?: string;
  [key: string]: any;
}

/**
 * Standard merge tags supported by the system
 */
export const MERGE_TAGS = {
  // Contact fields
  'contact.first_name': 'First Name',
  'contact.last_name': 'Last Name',
  'contact.full_name': 'Full Name',
  'contact.email': 'Email Address',
  'contact.phone': 'Phone Number',
  'contact.mobile': 'Mobile Number',
  'contact.job_title': 'Job Title',
  'contact.linkedin_url': 'LinkedIn URL',
  'contact.city': 'City',
  'contact.state': 'State/Province',
  'contact.country': 'Country',
  
  // Account fields
  'account.name': 'Company Name',
  'account.website': 'Website',
  'account.industry': 'Industry',
  'account.city': 'Company City',
  'account.state': 'Company State',
  'account.country': 'Company Country',
  'account.employee_count': 'Employee Count',
  'account.revenue': 'Revenue',
  
  // Campaign fields
  'campaign.name': 'Campaign Name',
  'campaign.landing_page': 'Landing Page URL (prefilled for this contact)',
  'campaign.landing_page_raw': 'Landing Page URL (raw)',
  'campaign.landing_page_prefilled': 'Landing Page with Prefilled Contact Info',
  
  // Sender fields
  'sender.name': 'Sender Name',
  'sender.email': 'Sender Email',
  'sender.company': 'Sender Company',
  
  // System fields
  'unsubscribe_url': 'Unsubscribe Link',
  'view_in_browser_url': 'View in Browser Link',
  'current_date': 'Current Date',
  'current_year': 'Current Year',
};

/**
 * Get merge data for a contact
 */
export async function getMergeDataForContact(
  contactId: string,
  campaignId?: string,
  senderProfileId?: string
): Promise {
  // Get contact data
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
    with: {
      account: true,
    },
  });

  if (!contact) {
    return {};
  }

  // Get campaign data if provided
  let campaign = null;
  if (campaignId) {
    campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });
  }

  // Get sender profile if provided
  let sender = null;
  if (senderProfileId) {
    sender = await db.query.senderProfiles.findFirst({
      where: eq(senderProfiles.id, senderProfileId),
    });
  }

  const account = contact.account ?? undefined;
  const contactFullName =
    contact.fullName ||
    `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  const contactPhone = contact.directPhone || contact.directPhoneE164 || '';
  const contactMobile = contact.mobilePhone || contact.mobilePhoneE164 || '';
  const accountWebsiteRaw = account?.websiteDomain || account?.domain || '';
  const accountWebsite =
    accountWebsiteRaw && !/^https?:\/\//i.test(accountWebsiteRaw)
      ? `https://${accountWebsiteRaw}`
      : accountWebsiteRaw;
  const accountIndustry =
    account?.industryStandardized ||
    account?.industryRaw ||
    account?.industryAiSuggested ||
    '';
  const accountEmployeeCountValue =
    account?.staffCount ?? account?.employeesSizeRange;
  const accountEmployeeCount =
    accountEmployeeCountValue != null ? String(accountEmployeeCountValue) : '';
  const accountRevenueValue = account?.revenueRange ?? account?.annualRevenue;
  const accountRevenue =
    accountRevenueValue != null ? String(accountRevenueValue) : '';

  const mergeData: MergeData = {
    contact: {
      id: contact.id,
      first_name: contact.firstName || '',
      last_name: contact.lastName || '',
      full_name: contactFullName || '',
      email: contact.email || '',
      phone: contactPhone,
      mobile: contactMobile,
      job_title: contact.jobTitle || '',
      linkedin_url: contact.linkedinUrl || '',
      city: contact.city || '',
      state: contact.state || '',
      country: contact.country || '',
    },
    account: account ? {
      id: account.id,
      name: account.name || '',
      website: accountWebsite,
      industry: accountIndustry,
      city: account.hqCity || '',
      state: account.hqState || account.hqStateAbbr || '',
      country: account.hqCountry || '',
      employee_count: accountEmployeeCount,
      revenue: accountRevenue,
    } : undefined,
    campaign: campaign ? {
      id: campaign.id,
      name: campaign.name || '',
      // Keep raw URL for legacy/explicit use
      landing_page_raw: campaign.landingPageUrl || '',
      // Generate prefilled landing page URL with contact details for form auto-fill
      landing_page_prefilled: campaign.landingPageUrl
        ? generateTrackingUrl(campaign.landingPageUrl, {
            email: contact.email || undefined,
            firstName: contact.firstName || undefined,
            lastName: contact.lastName || undefined,
            company: account?.name || undefined,
            jobTitle: contact.jobTitle || undefined,
            phone: contactPhone || undefined,
            campaignId: campaign.id,
            campaignName: campaign.name || undefined,
            utmSource: 'demandgentic',
            utmMedium: 'email',
            utmCampaign: campaign.name || undefined,
          })
        : '',
      // Default tag now resolves to personalized URL for better conversion tracking and prefill
      landing_page: campaign.landingPageUrl
        ? generateTrackingUrl(campaign.landingPageUrl, {
            email: contact.email || undefined,
            firstName: contact.firstName || undefined,
            lastName: contact.lastName || undefined,
            company: account?.name || undefined,
            jobTitle: contact.jobTitle || undefined,
            phone: contactPhone || undefined,
            campaignId: campaign.id,
            campaignName: campaign.name || undefined,
            utmSource: 'demandgentic',
            utmMedium: 'email',
            utmCampaign: campaign.name || undefined,
          })
        : '',
    } : undefined,
    sender: sender ? {
      name: sender.fromName || '',
      email: sender.fromEmail || '',
      company: sender.name || '', // Use profile name as company
    } : undefined,
    current_date: new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }),
    current_year: new Date().getFullYear().toString(),
    // Unsubscribe URL (CAN-SPAM compliant)
    unsubscribe_url: `${process.env.APP_BASE_URL || 'https://demandgentic.ai'}/unsubscribe?email=${encodeURIComponent(contact.email || '')}&campaign_id=${campaignId || ''}`,
    // View in browser URL
    view_in_browser_url: `${process.env.APP_BASE_URL || 'https://demandgentic.ai'}/email/view?email=${encodeURIComponent(contact.email || '')}&campaign_id=${campaignId || ''}`,
  };

  return mergeData;
}

/**
 * Replace merge tags in content with actual values
 */
export function replaceMergeTags(
  content: string,
  mergeData: MergeData,
  options: {
    fallbackValue?: string;
    preserveUnknownTags?: boolean;
  } = {}
): string {
  const { fallbackValue = '', preserveUnknownTags = false } = options;

  // Pattern to match merge tags: {{tag_name}} or {{object.property}}
  const mergeTagPattern = /\{\{([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\}\}/g;

  return content.replace(mergeTagPattern, (match, tagPath) => {
    const value = getNestedValue(mergeData, tagPath);
    
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
    
    if (preserveUnknownTags) {
      return match;
    }
    
    return fallbackValue;
  });
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[part];
  }
  
  return current;
}

/**
 * Validate merge tags in content
 * Returns list of invalid/unknown tags
 */
export function validateMergeTags(content: string): {
  valid: string[];
  invalid: string[];
} {
  const mergeTagPattern = /\{\{([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\}\}/g;
  const valid: string[] = [];
  const invalid: string[] = [];
  
  let match;
  while ((match = mergeTagPattern.exec(content)) !== null) {
    const tag = match[1];
    if (MERGE_TAGS[tag as keyof typeof MERGE_TAGS]) {
      valid.push(tag);
    } else {
      invalid.push(tag);
    }
  }
  
  return { valid: [...new Set(valid)], invalid: [...new Set(invalid)] };
}

/**
 * Preview merge tags with sample data
 */
export function previewWithSampleData(content: string): string {
  const sampleData: MergeData = {
    contact: {
      first_name: 'John',
      last_name: 'Doe',
      full_name: 'John Doe',
      email: 'john.doe@example.com',
      phone: '+1 (555) 123-4567',
      job_title: 'Marketing Director',
      linkedin_url: 'https://linkedin.com/in/johndoe',
      city: 'San Francisco',
      state: 'CA',
      country: 'United States',
    },
    account: {
      name: 'Acme Corporation',
      website: 'https://acme.com',
      industry: 'Technology',
      city: 'San Francisco',
      state: 'CA',
      country: 'United States',
      employee_count: '500',
    },
    campaign: {
      name: 'Q1 Product Launch',
      landing_page: 'https://example.com/landing',
      landing_page_prefilled: 'https://example.com/landing?email=john.doe%40example.com&first_name=John&last_name=Doe&company=Acme%20Corporation&utm_source=demandgentic&utm_medium=email&utm_campaign=Q1%20Product%20Launch',
    },
    sender: {
      name: 'Sarah Johnson',
      email: 'sarah@yourcompany.com',
      company: 'Your Company',
    },
    unsubscribe_url: '#unsubscribe',
    view_in_browser_url: '#view-in-browser',
    current_date: new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }),
    current_year: new Date().getFullYear().toString(),
  };

  return replaceMergeTags(content, sampleData, { preserveUnknownTags: true });
}

/**
 * Extract all merge tags from content
 */
export function extractMergeTags(content: string): string[] {
  const mergeTagPattern = /\{\{([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\}\}/g;
  const tags: string[] = [];
  
  let match;
  while ((match = mergeTagPattern.exec(content)) !== null) {
    tags.push(match[1]);
  }
  
  return [...new Set(tags)];
}