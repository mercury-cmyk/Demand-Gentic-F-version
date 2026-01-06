import crypto from 'crypto';
import type { ContentAsset, ContentAssetPush, Event, Resource, News } from '@shared/schema';

// Get secrets from environment variables
const RESOURCES_CENTER_URL = process.env.RESOURCES_CENTER_URL || '';
const PUSH_SECRET_KEY = process.env.PUSH_SECRET_KEY || '';

// Union type for all pushable content
export type PushableContent = ContentAsset | Event | Resource | News;

interface PushPayload {
  contentId: string;
  contentType: 'content_asset' | 'event' | 'resource' | 'news';
  assetType?: string;
  eventType?: string;
  resourceType?: string;
  title: string;
  slug: string;
  summary?: string;
  bodyHtml?: string;
  thumbnailUrl?: string;
  ctaLink?: string;
  formId?: string;
  tags?: string[];
  metadata?: any;
  
  // Event-specific fields
  eventDate?: string;
  eventEndDate?: string;
  locationType?: string;
  location?: string;
  registrationUrl?: string;
  communities?: string[];
  
  // Resource-specific fields
  downloadUrl?: string;
  gatedByForm?: boolean;
  
  syncedAt: string;
}

/**
 * Generate HMAC-SHA256 signature for payload
 */
export function generateHMACSignature(payload: string, timestamp: string): string {
  const message = `${timestamp}.${payload}`;
  return crypto
    .createHmac('sha256', PUSH_SECRET_KEY)
    .update(message)
    .digest('hex');
}

/**
 * Helper function to determine content type
 */
function getContentType(content: PushableContent): 'content_asset' | 'event' | 'resource' | 'news' {
  if ('assetType' in content) return 'content_asset';
  if ('eventType' in content) return 'event';
  if ('resourceType' in content) return 'resource';
  return 'news';
}

/**
 * Transform content into push payload
 */
function transformContentToPayload(content: PushableContent): PushPayload {
  const contentType = getContentType(content);
  
  const basePayload = {
    contentId: content.id,
    contentType,
    title: content.title,
    slug: content.slug,
    summary: content.description || undefined,
    bodyHtml: content.bodyHtml || undefined,
    thumbnailUrl: content.thumbnailUrl || undefined,
    tags: content.tags || undefined,
    metadata: content.metadata || undefined,
    syncedAt: new Date().toISOString(),
  };

  // Add type-specific fields
  if (contentType === 'content_asset') {
    const asset = content as ContentAsset;
    return {
      ...basePayload,
      assetType: asset.assetType,
      ctaLink: asset.fileUrl || undefined,
      formId: undefined,
    };
  } else if (contentType === 'event') {
    const event = content as Event;
    return {
      ...basePayload,
      eventType: event.eventType,
      eventDate: event.eventDate?.toISOString(),
      eventEndDate: event.eventEndDate?.toISOString() || undefined,
      locationType: event.locationType,
      location: event.location || undefined,
      registrationUrl: event.registrationUrl || undefined,
      communities: event.communities || undefined,
    };
  } else if (contentType === 'resource') {
    const resource = content as Resource;
    return {
      ...basePayload,
      resourceType: resource.resourceType,
      downloadUrl: resource.downloadUrl || undefined,
      gatedByForm: resource.gatedByForm,
      formId: resource.formId || undefined,
    };
  } else {
    // News content
    return basePayload;
  }
}

/**
 * Push content to Resources Center
 */
export async function pushContentToResourcesCenter(
  content: PushableContent,
  targetUrl?: string
): Promise<{ success: boolean; externalId?: string; error?: string; responsePayload?: any }> {
  try {
    const url = targetUrl || RESOURCES_CENTER_URL;
    
    if (!url) {
      throw new Error('Resources Center URL not configured');
    }

    if (!PUSH_SECRET_KEY) {
      throw new Error('Push secret key not configured');
    }

    // Transform content to payload
    const payload = transformContentToPayload(content);
    const payloadString = JSON.stringify(payload);
    const timestamp = Date.now().toString();
    const signature = generateHMACSignature(payloadString, timestamp);

    // Make POST request to Resources Center
    const endpoint = `${url}/api/import/content`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Timestamp': timestamp,
      },
      body: payloadString,
    });

    // Handle non-JSON responses gracefully
    let responseData: any;
    try {
      responseData = await response.json();
    } catch (jsonError) {
      const responseText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${responseText || 'Non-JSON response'}`,
        responsePayload: { statusText: response.statusText, body: responseText },
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: responseData.message || `HTTP ${response.status}`,
        responsePayload: responseData,
      };
    }

    return {
      success: true,
      externalId: responseData.externalId || responseData.id,
      responsePayload: responseData,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Retry push with exponential backoff
 */
export async function retryPushWithBackoff(
  content: PushableContent,
  pushRecord: ContentAssetPush,
  targetUrl?: string
): Promise<{ success: boolean; externalId?: string; error?: string; responsePayload?: any }> {
  const maxAttempts = pushRecord.maxAttempts;
  const currentAttempt = pushRecord.attemptCount;

  if (currentAttempt >= maxAttempts) {
    return {
      success: false,
      error: 'Max retry attempts reached',
    };
  }

  // Calculate exponential backoff delay (2^attempt * 1000ms)
  const delay = Math.pow(2, currentAttempt) * 1000;
  
  // Wait for backoff delay
  await new Promise(resolve => setTimeout(resolve, delay));

  // Attempt push
  return await pushContentToResourcesCenter(content, targetUrl);
}
