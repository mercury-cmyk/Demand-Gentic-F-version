/**
 * URL Generation Utility for Campaign-Content Tracking
 * Generates pre-filled URLs with contact and campaign tracking parameters
 *
 * Supports two modes:
 * 1. Direct generation: Pass actual values to generate final URLs
 * 2. Template generation: Generate URLs with merge tags for email templates
 */

export interface TrackingParams {
  contactId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
  campaignId?: string;
  campaignName?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
}

/**
 * Prefill configuration for third-party form platforms
 * Maps our standard field names to platform-specific query parameters
 */
export const FORM_PLATFORM_MAPPINGS: Record<string, Record<string, string>> = {
  // Standard/Generic (works with most forms)
  standard: {
    email: 'email',
    firstName: 'first_name',
    lastName: 'last_name',
    company: 'company',
    jobTitle: 'job_title',
    phone: 'phone',
  },
  // HubSpot forms
  hubspot: {
    email: 'email',
    firstName: 'firstname',
    lastName: 'lastname',
    company: 'company',
    jobTitle: 'jobtitle',
    phone: 'phone',
  },
  // Cvent (common for executive events like Argyle)
  cvent: {
    email: 'email',
    firstName: 'first',
    lastName: 'last',
    company: 'company',
    jobTitle: 'title',
    phone: 'phone',
  },
  // Marketo
  marketo: {
    email: 'Email',
    firstName: 'FirstName',
    lastName: 'LastName',
    company: 'Company',
    jobTitle: 'Title',
    phone: 'Phone',
  },
  // Salesforce Web-to-Lead
  salesforce: {
    email: 'email',
    firstName: 'first_name',
    lastName: 'last_name',
    company: 'company',
    jobTitle: 'title',
    phone: 'phone',
  },
  // Pardot (Salesforce Marketing Cloud) - used by Argyle
  pardot: {
    email: 'email',
    firstName: 'first_name',
    lastName: 'last_name',
    company: 'company',
    jobTitle: 'job_title',
    phone: 'phone',
  },
};

/**
 * Merge tag templates for email personalization
 */
export const PREFILL_MERGE_TAGS = {
  email: '{{contact.email}}',
  firstName: '{{contact.firstName}}',
  lastName: '{{contact.lastName}}',
  company: '{{account.name}}',
  jobTitle: '{{contact.title}}',
  phone: '{{contact.phone}}',
  campaignId: '{{campaign.id}}',
  campaignName: '{{campaign.name}}',
};

/**
 * Generates a tracking URL with pre-filled parameters
 * @param baseUrl - Base URL of the content (e.g., https://resources.example.com/event/ai-summit)
 * @param params - Tracking and prefill parameters
 * @returns Complete URL with query parameters
 */
export function generateTrackingUrl(baseUrl: string, params: TrackingParams): string {
  try {
    const url = new URL(baseUrl);
    
    // Add contact tracking parameters
    if (params.contactId) {
      url.searchParams.set('contact_id', params.contactId);
    }
    if (params.email) {
      url.searchParams.set('email', params.email);
    }
    if (params.firstName) {
      url.searchParams.set('first_name', params.firstName);
    }
    if (params.lastName) {
      url.searchParams.set('last_name', params.lastName);
    }
    if (params.company) {
      url.searchParams.set('company', params.company);
    }
    
    // Add campaign tracking
    if (params.campaignId) {
      url.searchParams.set('campaign_id', params.campaignId);
    }
    if (params.campaignName) {
      url.searchParams.set('campaign_name', params.campaignName);
    }
    
    // Add UTM parameters
    if (params.utmSource) {
      url.searchParams.set('utm_source', params.utmSource);
    }
    if (params.utmMedium) {
      url.searchParams.set('utm_medium', params.utmMedium);
    }
    if (params.utmCampaign) {
      url.searchParams.set('utm_campaign', params.utmCampaign);
    }
    if (params.utmTerm) {
      url.searchParams.set('utm_term', params.utmTerm);
    }
    if (params.utmContent) {
      url.searchParams.set('utm_content', params.utmContent);
    }
    
    return url.toString();
  } catch (e) {
    // If URL parsing fails, return base URL
    console.error('Failed to generate tracking URL:', e);
    return baseUrl;
  }
}

/**
 * Generates a bulk set of tracking URLs for multiple contacts
 * @param baseUrl - Base URL of the content
 * @param contacts - Array of contact data
 * @param campaignInfo - Campaign tracking info
 * @returns Array of objects with contact info and their personalized URLs
 */
export function generateBulkTrackingUrls(
  baseUrl: string,
  contacts: Array<{
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
  }>,
  campaignInfo: {
    campaignId: string;
    campaignName: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  }
): Array<{
  contactId: string;
  email: string;
  trackingUrl: string;
}> {
  return contacts.map(contact => ({
    contactId: contact.id,
    email: contact.email,
    trackingUrl: generateTrackingUrl(baseUrl, {
      contactId: contact.id,
      email: contact.email,
      firstName: contact.firstName || undefined,
      lastName: contact.lastName || undefined,
      company: contact.company || undefined,
      campaignId: campaignInfo.campaignId,
      campaignName: campaignInfo.campaignName,
      utmSource: campaignInfo.utmSource,
      utmMedium: campaignInfo.utmMedium,
      utmCampaign: campaignInfo.utmCampaign
    })
  }));
}

/**
 * Generates a prefilled URL template with merge tags for email templates
 * Use this when creating email CTAs that will be personalized at send time
 *
 * @param baseUrl - Base URL (e.g., https://argyleforum.com/events/strategic-insights/)
 * @param options - Configuration options
 * @returns URL with merge tags as query parameters
 *
 * @example
 * // For Argyle/Cvent events:
 * generatePrefillTemplateUrl('https://argyleforum.com/events/my-event/', {
 *   platform: 'cvent',
 *   includeUtm: true,
 *   utmSource: 'demandgentic'
 * })
 * // Returns: https://argyleforum.com/events/my-event/?email={{contact.email}}&first={{contact.firstName}}&last={{contact.lastName}}&company={{account.name}}&utm_source=demandgentic&utm_medium=email
 */
export function generatePrefillTemplateUrl(
  baseUrl: string,
  options: {
    platform?: keyof typeof FORM_PLATFORM_MAPPINGS;
    includeEmail?: boolean;
    includeFirstName?: boolean;
    includeLastName?: boolean;
    includeCompany?: boolean;
    includeJobTitle?: boolean;
    includePhone?: boolean;
    includeUtm?: boolean;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  } = {}
): string {
  const {
    platform = 'standard',
    includeEmail = true,
    includeFirstName = true,
    includeLastName = true,
    includeCompany = true,
    includeJobTitle = false,
    includePhone = false,
    includeUtm = true,
    utmSource = 'demandgentic',
    utmMedium = 'email',
    utmCampaign,
  } = options;

  try {
    const url = new URL(baseUrl);
    const mapping = FORM_PLATFORM_MAPPINGS[platform] || FORM_PLATFORM_MAPPINGS.standard;

    // Add prefill parameters with merge tags
    if (includeEmail) {
      url.searchParams.set(mapping.email, PREFILL_MERGE_TAGS.email);
    }
    if (includeFirstName) {
      url.searchParams.set(mapping.firstName, PREFILL_MERGE_TAGS.firstName);
    }
    if (includeLastName) {
      url.searchParams.set(mapping.lastName, PREFILL_MERGE_TAGS.lastName);
    }
    if (includeCompany) {
      url.searchParams.set(mapping.company, PREFILL_MERGE_TAGS.company);
    }
    if (includeJobTitle) {
      url.searchParams.set(mapping.jobTitle, PREFILL_MERGE_TAGS.jobTitle);
    }
    if (includePhone) {
      url.searchParams.set(mapping.phone, PREFILL_MERGE_TAGS.phone);
    }

    // Add UTM parameters
    if (includeUtm) {
      url.searchParams.set('utm_source', utmSource);
      url.searchParams.set('utm_medium', utmMedium);
      if (utmCampaign) {
        url.searchParams.set('utm_campaign', utmCampaign);
      } else {
        // Use campaign name merge tag if no static campaign name provided
        url.searchParams.set('utm_campaign', PREFILL_MERGE_TAGS.campaignName);
      }
    }

    return url.toString();
  } catch (e) {
    console.error('Failed to generate prefill template URL:', e);
    return baseUrl;
  }
}

/**
 * Common prefill URL templates for known platforms
 */
export const PREFILL_URL_TEMPLATES = {
  /**
   * Argyle Forum events (uses Pardot/Salesforce Marketing Cloud)
   */
  argyle: (eventUrl: string) => generatePrefillTemplateUrl(eventUrl, {
    platform: 'pardot',
    includeJobTitle: true,
    utmSource: 'demandgentic',
  }),

  /**
   * Pardot (Salesforce Marketing Cloud) landing pages
   */
  pardot: (landingUrl: string) => generatePrefillTemplateUrl(landingUrl, {
    platform: 'pardot',
    includeJobTitle: true,
    utmSource: 'demandgentic',
  }),

  /**
   * HubSpot landing pages
   */
  hubspot: (landingUrl: string) => generatePrefillTemplateUrl(landingUrl, {
    platform: 'hubspot',
    utmSource: 'demandgentic',
  }),

  /**
   * Generic/custom forms
   */
  generic: (landingUrl: string) => generatePrefillTemplateUrl(landingUrl, {
    platform: 'standard',
    utmSource: 'demandgentic',
  }),
};

/**
 * Extracts tracking parameters from a URL
 * @param url - URL to parse
 * @returns Tracking parameters object
 */
export function extractTrackingParams(url: string): TrackingParams {
  try {
    const parsedUrl = new URL(url);
    const params: TrackingParams = {};
    
    const contactId = parsedUrl.searchParams.get('contact_id');
    if (contactId) params.contactId = contactId;
    
    const email = parsedUrl.searchParams.get('email');
    if (email) params.email = email;
    
    const firstName = parsedUrl.searchParams.get('first_name');
    if (firstName) params.firstName = firstName;
    
    const lastName = parsedUrl.searchParams.get('last_name');
    if (lastName) params.lastName = lastName;
    
    const company = parsedUrl.searchParams.get('company');
    if (company) params.company = company;
    
    const campaignId = parsedUrl.searchParams.get('campaign_id');
    if (campaignId) params.campaignId = campaignId;
    
    const campaignName = parsedUrl.searchParams.get('campaign_name');
    if (campaignName) params.campaignName = campaignName;
    
    const utmSource = parsedUrl.searchParams.get('utm_source');
    if (utmSource) params.utmSource = utmSource;
    
    const utmMedium = parsedUrl.searchParams.get('utm_medium');
    if (utmMedium) params.utmMedium = utmMedium;
    
    const utmCampaign = parsedUrl.searchParams.get('utm_campaign');
    if (utmCampaign) params.utmCampaign = utmCampaign;
    
    const utmTerm = parsedUrl.searchParams.get('utm_term');
    if (utmTerm) params.utmTerm = utmTerm;
    
    const utmContent = parsedUrl.searchParams.get('utm_content');
    if (utmContent) params.utmContent = utmContent;
    
    return params;
  } catch (e) {
    return {};
  }
}
