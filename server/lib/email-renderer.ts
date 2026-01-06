/**
 * Email Rendering Service
 *
 * Handles rendering email templates with personalization tokens,
 * generating plaintext versions, and adding compliance footers.
 */

interface Contact {
  firstName?: string;
  lastName?: string;
  email?: string;
  jobTitle?: string;
  company?: string;
  [key: string]: any;
}

interface Account {
  name?: string;
  industry?: string;
  city?: string;
  country?: string;
  [key: string]: any;
}

interface RenderOptions {
  contact?: Contact;
  account?: Account;
  trackingPixelUrl?: string;
  unsubscribeUrl?: string;
  preferencesUrl?: string;
  companyName?: string;
  companyAddress?: string;
  preheader?: string;
}

/**
 * Replace personalization tokens in text with actual values
 */
export function replacePersonalizationTokens(
  text: string,
  contact?: Contact,
  account?: Account
): string {
  let result = text;

  // Contact tokens
  if (contact) {
    result = result.replace(/\{\{contact\.first_name\}\}/gi, contact.firstName || "");
    result = result.replace(/\{\{contact\.last_name\}\}/gi, contact.lastName || "");
    result = result.replace(/\{\{contact\.email\}\}/gi, contact.email || "");
    result = result.replace(/\{\{contact\.job_title\}\}/gi, contact.jobTitle || "");
    result = result.replace(/\{\{contact\.company\}\}/gi, contact.company || "");

    // Handle any custom contact fields
    const contactTokens = result.match(/\{\{contact\.([a-zA-Z_]+)\}\}/gi);
    if (contactTokens) {
      contactTokens.forEach(token => {
        const field = token.match(/\{\{contact\.([a-zA-Z_]+)\}\}/i)?.[1];
        if (field && contact[field]) {
          result = result.replace(new RegExp(token, 'gi'), String(contact[field]));
        }
      });
    }
  }

  // Account tokens
  if (account) {
    result = result.replace(/\{\{account\.name\}\}/gi, account.name || "");
    result = result.replace(/\{\{account\.industry\}\}/gi, account.industry || "");
    result = result.replace(/\{\{account\.city\}\}/gi, account.city || "");
    result = result.replace(/\{\{account\.country\}\}/gi, account.country || "");

    // Handle any custom account fields
    const accountTokens = result.match(/\{\{account\.([a-zA-Z_]+)\}\}/gi);
    if (accountTokens) {
      accountTokens.forEach(token => {
        const field = token.match(/\{\{account\.([a-zA-Z_]+)\}\}/i)?.[1];
        if (field && account[field]) {
          result = result.replace(new RegExp(token, 'gi'), String(account[field]));
        }
      });
    }
  }

  return result;
}

/**
 * Generate plaintext version from HTML
 */
export function htmlToPlaintext(html: string): string {
  let text = html;

  // Remove script and style tags and their content
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Replace common block elements with newlines
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<\/li>/gi, '\n');

  // Handle links
  text = text.replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)');

  // Remove all other HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Clean up whitespace
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n'); // Max 2 consecutive newlines
  text = text.replace(/[ \t]+/g, ' '); // Collapse spaces
  text = text.trim();

  return text;
}

/**
 * Add tracking pixel to HTML email
 */
export function addTrackingPixel(html: string, trackingPixelUrl: string): string {
  const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:none;" />`;

  // Try to insert before closing body tag
  if (html.includes('</body>')) {
    return html.replace('</body>', `${trackingPixel}</body>`);
  }

  // Otherwise append to end
  return html + trackingPixel;
}

/**
 * Wrap links with click tracking
 */
export function wrapLinksWithTracking(html: string, trackingBaseUrl: string): string {
  return html.replace(
    /<a\s+href="([^"]*)"([^>]*)>/gi,
    (match, url, attrs) => {
      // Skip if already tracking link or special protocols
      if (url.startsWith(trackingBaseUrl) ||
          url.startsWith('mailto:') ||
          url.startsWith('tel:') ||
          url.startsWith('#')) {
        return match;
      }

      const encodedUrl = encodeURIComponent(url);
      const trackingUrl = `${trackingBaseUrl}?url=${encodedUrl}`;
      return `<a href="${trackingUrl}"${attrs}>`;
    }
  );
}

/**
 * Generate compliance footer HTML
 */
export function generateComplianceFooter(options: {
  unsubscribeUrl: string;
  preferencesUrl?: string;
  companyName: string;
  companyAddress: string;
}): string {
  return `
    <div style="padding: 30px 20px; background-color: #f9fafb; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; margin-top: 40px;">
      <p style="margin: 0 0 8px 0; font-weight: 600;">${options.companyName}</p>
      <p style="margin: 0 0 16px 0;">${options.companyAddress}</p>
      <p style="margin: 0 0 16px 0; font-size: 11px; color: #9ca3af;">
        You received this email because you are in our contact database or made a purchase from us.
      </p>
      <div style="margin: 0;">
        <a href="${options.unsubscribeUrl}" style="color: #3b82f6; text-decoration: none; margin: 0 8px;">Unsubscribe</a>
        ${options.preferencesUrl ? `| <a href="${options.preferencesUrl}" style="color: #3b82f6; text-decoration: none; margin: 0 8px;">Update Preferences</a>` : ''}
      </div>
    </div>
  `;
}

/**
 * Main render function - renders complete email with all features
 */
export function renderEmail(
  htmlTemplate: string,
  options: RenderOptions
): { html: string; plaintext: string } {
  let html = htmlTemplate;

  // 1. Replace personalization tokens
  html = replacePersonalizationTokens(html, options.contact, options.account);
  const preheaderText = options.preheader
    ? replacePersonalizationTokens(options.preheader, options.contact, options.account)
    : undefined;

  if (preheaderText) {
    const preheaderBlock = `
      <div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
        ${preheaderText}
      </div>
    `;

    if (/<body[^>]*>/i.test(html)) {
      html = html.replace(/<body[^>]*>/i, (match) => `${match}${preheaderBlock}`);
    } else {
      html = `${preheaderBlock}${html}`;
    }
  }

  // 2. Add tracking pixel if provided
  if (options.trackingPixelUrl) {
    html = addTrackingPixel(html, options.trackingPixelUrl);
  }

  // 3. Add compliance footer if unsubscribe URL provided
  if (options.unsubscribeUrl && options.companyName && options.companyAddress) {
    const footer = generateComplianceFooter({
      unsubscribeUrl: options.unsubscribeUrl,
      preferencesUrl: options.preferencesUrl,
      companyName: options.companyName,
      companyAddress: options.companyAddress,
    });

    // Try to insert before closing body tag
    if (html.includes('</body>')) {
      html = html.replace('</body>', `${footer}</body>`);
    } else {
      html += footer;
    }
  }

  // 4. Wrap email in proper HTML structure if not already present
  if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
    html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Email</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        ${html}
      </body>
      </html>
    `;
  }

  // 5. Generate plaintext version
  const plaintext = htmlToPlaintext(html);

  return { html, plaintext };
}

/**
 * Render email subject with personalization
 */
export function renderSubject(
  subjectTemplate: string,
  contact?: Contact,
  account?: Account
): string {
  return replacePersonalizationTokens(subjectTemplate, contact, account);
}
