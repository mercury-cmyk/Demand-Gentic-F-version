/**
 * URL Generation Utility for Campaign-Content Tracking
 * Generates pre-filled URLs with contact and campaign tracking parameters
 */

export interface TrackingParams {
  contactId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  campaignId?: string;
  campaignName?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
}

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
