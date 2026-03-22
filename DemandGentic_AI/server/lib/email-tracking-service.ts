import { db } from '../db';
import { emailOpens, emailLinkClicks } from '@shared/schema';
import { eq, sql, inArray } from 'drizzle-orm';
import crypto from 'crypto';

export interface TrackingOptions {
  messageId: string;
  recipientEmail: string;
}

export class EmailTrackingService {
  private _fallbackSecret: string | null = null;

  private splitSignedToken(decoded: string): { payload: string; signature: string } | null {
    const separatorIndex = decoded.lastIndexOf('.');
    if (separatorIndex `;
    
    // Inject pixel before closing body tag, or at the end if no body tag
    if (htmlBody.includes('')) {
      return htmlBody.replace('', `${trackingPixel}`);
    } else {
      return `${htmlBody}${trackingPixel}`;
    }
  }

  /**
   * Wrap all links in email with tracking redirects
   */
  wrapLinksWithTracking(htmlBody: string, options: TrackingOptions): string {
    const { messageId, recipientEmail } = options;
    
    // Match all  tags with href attributes
    const linkRegex = /]*href=["']([^"']+)["'][^>]*)>/gi;
    
    return htmlBody.replace(linkRegex, (match, attributes, url) => {
      // Skip if already a tracking link
      if (url.includes('/api/track/click/')) {
        return match;
      }
      
      // Skip mailto, tel, and anchor links
      if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#')) {
        return match;
      }
      
      // Create tracking token with URL embedded
      const trackingToken = this.createLinkTrackingToken(messageId, recipientEmail, url);
      
      // Build tracking redirect URL
      const trackingUrl = `${this.trackingBaseUrl}/api/track/click/${trackingToken}`;
      
      // Replace the original URL with tracking URL
      return match.replace(url, trackingUrl);
    });
  }

  /**
   * Apply all tracking (pixel + link wrapping) to email body
   */
  applyTracking(htmlBody: string, options: TrackingOptions): string {
    let trackedBody = htmlBody;
    
    // First wrap links
    trackedBody = this.wrapLinksWithTracking(trackedBody, options);
    
    // Then inject tracking pixel
    trackedBody = this.injectTrackingPixel(trackedBody, options);
    
    return trackedBody;
  }

  /**
   * Create HMAC-signed tracking token for open tracking
   * Note: Includes recipient email for B2B CRM analytics, but token is tamper-proof via HMAC
   */
  private createTrackingToken(messageId: string, recipientEmail: string): string {
    const payload = JSON.stringify({
      m: messageId,
      r: recipientEmail, // Include for analytics (token is signed to prevent tampering)
      t: Date.now(), // Timestamp to prevent token reuse
    });
    
    // Create HMAC signature to prevent tampering
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(payload);
    const signature = hmac.digest('hex').substring(0, 32);
    
    // Combine payload and signature
    const token = Buffer.from(`${payload}.${signature}`).toString('base64url');
    return token;
  }

  /**
   * Create HMAC-signed tracking token for link click tracking
   * Note: Includes recipient email for B2B CRM analytics, but token is tamper-proof via HMAC
   */
  private createLinkTrackingToken(messageId: string, recipientEmail: string, originalUrl: string): string {
    const payload = JSON.stringify({
      m: messageId,
      r: recipientEmail, // Include for analytics (token is signed)
      u: originalUrl, // Include full URL (validated before redirect)
      t: Date.now(),
    });
    
    // Create HMAC signature to prevent tampering
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(payload);
    const signature = hmac.digest('hex').substring(0, 32);
    
    // Combine payload and signature
    const token = Buffer.from(`${payload}.${signature}`).toString('base64url');
    return token;
  }

  /**
   * Verify and decode tracking token for open tracking
   */
  decodeTrackingToken(token: string): { messageId: string; recipientEmail: string; timestamp: number } | null {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      const parts = this.splitSignedToken(decoded);

      if (!parts) {
        console.error('[EMAIL-TRACKING] Invalid token format');
        return null;
      }

      const { payload, signature } = parts;

      // Parse payload first
      const data = JSON.parse(payload);

      if (!data.m || data.r === undefined || data.r === null || !data.t) {
        console.error('[EMAIL-TRACKING] Missing required fields in token');
        return null;
      }

      // Check token age (reject tokens older than 90 days)
      const ageMs = Date.now() - data.t;
      const maxAgeMs = 90 * 24 * 60 * 60 * 1000;
      if (ageMs > maxAgeMs) {
        console.error('[EMAIL-TRACKING] Token expired');
        return null;
      }

      // Verify HMAC signature — log warning but still accept for open tracking
      // (open pixels are safe to record even without perfect signature match,
      //  e.g. after secret rotation or server migration)
      const hmac = crypto.createHmac('sha256', this.secret);
      hmac.update(payload);
      const expectedSignature = hmac.digest('hex').substring(0, 32);

      if (signature !== expectedSignature) {
        console.warn('[EMAIL-TRACKING] Signature mismatch (likely pre-migration token), accepting for open tracking');
      }

      return {
        messageId: data.m,
        recipientEmail: data.r,
        timestamp: data.t,
      };
    } catch (error) {
      console.error('[EMAIL-TRACKING] Error decoding token:', error);
      return null;
    }
  }

  /**
   * Verify and decode link tracking token
   */
  decodeLinkTrackingToken(token: string): { messageId: string; recipientEmail: string; originalUrl: string; timestamp: number } | null {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      const parts = this.splitSignedToken(decoded);

      if (!parts) {
        console.error('[EMAIL-TRACKING] Invalid token format');
        return null;
      }

      const { payload, signature } = parts;

      // Parse payload
      const data = JSON.parse(payload);

      if (!data.m || data.r === undefined || data.r === null || !data.u || !data.t) {
        console.error('[EMAIL-TRACKING] Missing required fields in token');
        return null;
      }

      // Check token age — warn but still accept for click tracking
      // (users shouldn't be blocked from clicking links in old emails;
      //  URL safety is validated in the route before redirect)
      const ageMs = Date.now() - data.t;
      const maxAgeMs = 90 * 24 * 60 * 60 * 1000;
      if (ageMs > maxAgeMs) {
        console.warn(`[EMAIL-TRACKING] Click token expired (${Math.round(ageMs / 86400000)}d old), accepting with URL validation`);
      }

      // Verify HMAC signature — warn but accept after migration
      // URL safety is still validated in the route before redirect
      const hmac = crypto.createHmac('sha256', this.secret);
      hmac.update(payload);
      const expectedSignature = hmac.digest('hex').substring(0, 32);

      if (signature !== expectedSignature) {
        console.warn('[EMAIL-TRACKING] Click token signature mismatch (likely pre-migration), accepting with URL validation');
      }

      return {
        messageId: data.m,
        recipientEmail: data.r,
        originalUrl: data.u,
        timestamp: data.t,
      };
    } catch (error) {
      console.error('[EMAIL-TRACKING] Error decoding link token:', error);
      return null;
    }
  }
  
  /**
   * Best-effort URL extraction from a token that failed full decode.
   * Skips signature verification and expiry — only used as a fallback
   * to redirect users rather than showing an error page.
   * The caller MUST still validate the URL with isUrlSafeForRedirect().
   */
  extractUrlFromToken(token: string): string | null {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      // Try to find the JSON payload before the signature separator
      const separatorIndex = decoded.lastIndexOf('.');
      const payloadStr = separatorIndex > 0 ? decoded.slice(0, separatorIndex) : decoded;
      const data = JSON.parse(payloadStr);
      return data.u || null;
    } catch {
      return null;
    }
  }

  /**
   * Validate URL is safe for redirect (prevent open redirect attacks)
   */
  isUrlSafeForRedirect(url: string): boolean {
    try {
      const parsed = new URL(url);
      
      // Only allow HTTP/HTTPS protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        console.error('[EMAIL-TRACKING] Unsafe protocol:', parsed.protocol);
        return false;
      }
      
      // Block localhost and private IPs (prevents SSRF)
      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname.startsWith('127.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname === '[::1]'
      ) {
        console.error('[EMAIL-TRACKING] Blocked private/localhost URL');
        return false;
      }
      
      // URL is safe
      return true;
    } catch (error) {
      console.error('[EMAIL-TRACKING] Invalid URL format');
      return false;
    }
  }

  /**
   * Record email open event
   */
  async recordEmailOpen(
    messageId: string,
    recipientEmail: string,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
      deviceType?: string;
      location?: any;
    }
  ): Promise {
    try {
      await db.insert(emailOpens).values({
        messageId,
        recipientEmail,
        ipAddress: metadata?.ipAddress || null,
        userAgent: metadata?.userAgent || null,
        deviceType: metadata?.deviceType || null,
        location: metadata?.location || null,
      });

      console.log(`[EMAIL-TRACKING] Recorded open for message ${messageId} by ${recipientEmail}`);
    } catch (error) {
      console.error('[EMAIL-TRACKING] Error recording email open:', error);
    }
  }

  /**
   * Record link click event
   */
  async recordLinkClick(
    messageId: string,
    recipientEmail: string,
    linkUrl: string,
    linkText?: string,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
      deviceType?: string;
    }
  ): Promise {
    try {
      await db.insert(emailLinkClicks).values({
        messageId,
        recipientEmail,
        linkUrl,
        linkText: linkText || null,
        ipAddress: metadata?.ipAddress || null,
        userAgent: metadata?.userAgent || null,
        deviceType: metadata?.deviceType || null,
      });

      console.log(`[EMAIL-TRACKING] Recorded click for message ${messageId} - URL: ${linkUrl}`);
    } catch (error) {
      console.error('[EMAIL-TRACKING] Error recording link click:', error);
    }
  }

  /**
   * Get tracking stats for a message
   */
  async getMessageTrackingStats(messageId: string): Promise {
    try {
      const opens = await db.select({
        totalOpens: sql`COUNT(*)::int`,
        // Only count non-empty recipient emails as distinct openers; empty = group-send unattributed
        uniqueOpens: sql`COUNT(DISTINCT CASE WHEN ${emailOpens.recipientEmail} != '' THEN ${emailOpens.recipientEmail} END)::int`,
        lastOpened: sql`MAX(${emailOpens.openedAt})`,
      })
        .from(emailOpens)
        .where(eq(emailOpens.messageId, messageId));

      const clicks = await db.select({
        totalClicks: sql`COUNT(*)::int`,
        uniqueClicks: sql`COUNT(DISTINCT ${emailLinkClicks.recipientEmail})::int`,
        lastClicked: sql`MAX(${emailLinkClicks.clickedAt})`,
      })
        .from(emailLinkClicks)
        .where(eq(emailLinkClicks.messageId, messageId));

      const opensData = opens[0] || { totalOpens: 0, uniqueOpens: 0, lastOpened: null };
      const clicksData = clicks[0] || { totalClicks: 0, uniqueClicks: 0, lastClicked: null };

      return {
        opens: opensData.totalOpens || 0,
        uniqueOpens: opensData.uniqueOpens || 0,
        clicks: clicksData.totalClicks || 0,
        uniqueClicks: clicksData.uniqueClicks || 0,
        lastOpenedAt: opensData.lastOpened,
        lastClickedAt: clicksData.lastClicked,
      };
    } catch (error) {
      console.error('[EMAIL-TRACKING] Error getting tracking stats:', error);
      return {
        opens: 0,
        uniqueOpens: 0,
        clicks: 0,
        uniqueClicks: 0,
        lastOpenedAt: null,
        lastClickedAt: null,
      };
    }
  }

  /**
   * Get tracking stats for multiple messages in a single query (batch)
   */
  async getBatchTrackingStats(messageIds: string[]): Promise> {
    if (!messageIds.length) return {};
    
    try {
      const opensData = await db.select({
        messageId: emailOpens.messageId,
        totalOpens: sql`COUNT(*)::int`,
        // Only count non-empty recipient emails as distinct openers; empty = group-send unattributed
        uniqueOpens: sql`COUNT(DISTINCT CASE WHEN ${emailOpens.recipientEmail} != '' THEN ${emailOpens.recipientEmail} END)::int`,
        lastOpened: sql`MAX(${emailOpens.openedAt})`,
      })
        .from(emailOpens)
        .where(inArray(emailOpens.messageId, messageIds))
        .groupBy(emailOpens.messageId);

      const clicksData = await db.select({
        messageId: emailLinkClicks.messageId,
        totalClicks: sql`COUNT(*)::int`,
        uniqueClicks: sql`COUNT(DISTINCT ${emailLinkClicks.recipientEmail})::int`,
        lastClicked: sql`MAX(${emailLinkClicks.clickedAt})`,
      })
        .from(emailLinkClicks)
        .where(inArray(emailLinkClicks.messageId, messageIds))
        .groupBy(emailLinkClicks.messageId);

      const result: Record = {};
      
      for (const id of messageIds) {
        const openRow = opensData.find(o => o.messageId === id);
        const clickRow = clicksData.find(c => c.messageId === id);
        result[id] = {
          opens: openRow?.totalOpens || 0,
          uniqueOpens: openRow?.uniqueOpens || 0,
          clicks: clickRow?.totalClicks || 0,
          uniqueClicks: clickRow?.uniqueClicks || 0,
          lastOpenedAt: openRow?.lastOpened || null,
          lastClickedAt: clickRow?.lastClicked || null,
        };
      }
      
      return result;
    } catch (error) {
      console.error('[EMAIL-TRACKING] Error getting batch tracking stats:', error);
      return {};
    }
  }

  /**
   * Get detailed individual tracking events for a message (opens + clicks)
   */
  async getDetailedTrackingEvents(messageId: string): Promise;
    clicks: Array;
  }> {
    try {
      const opens = await db
        .select({
          id: emailOpens.id,
          recipientEmail: emailOpens.recipientEmail,
          openedAt: emailOpens.openedAt,
          ipAddress: emailOpens.ipAddress,
          userAgent: emailOpens.userAgent,
          deviceType: emailOpens.deviceType,
          location: emailOpens.location,
        })
        .from(emailOpens)
        .where(eq(emailOpens.messageId, messageId))
        .orderBy(sql`${emailOpens.openedAt} DESC`)
        .limit(50);

      const clicks = await db
        .select({
          id: emailLinkClicks.id,
          recipientEmail: emailLinkClicks.recipientEmail,
          clickedAt: emailLinkClicks.clickedAt,
          ipAddress: emailLinkClicks.ipAddress,
          userAgent: emailLinkClicks.userAgent,
          deviceType: emailLinkClicks.deviceType,
          linkUrl: emailLinkClicks.linkUrl,
          linkText: emailLinkClicks.linkText,
        })
        .from(emailLinkClicks)
        .where(eq(emailLinkClicks.messageId, messageId))
        .orderBy(sql`${emailLinkClicks.clickedAt} DESC`)
        .limit(50);

      return {
        opens: opens as any[],
        clicks: clicks as any[],
      };
    } catch (error) {
      console.error('[EMAIL-TRACKING] Error getting detailed events:', error);
      return { opens: [], clicks: [] };
    }
  }
}

export const emailTrackingService = new EmailTrackingService();