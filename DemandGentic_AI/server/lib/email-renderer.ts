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
  text = text.replace(/)/gi, '');
  text = text.replace(/)/gi, '');

  // Replace common block elements with newlines
  text = text.replace(//gi, '\n');
  text = text.replace(//gi, '\n\n');
  text = text.replace(//gi, '\n');
  text = text.replace(//gi, '\n\n');
  text = text.replace(//gi, '\n');

  // Handle links
  text = text.replace(/]*>(.*?)/gi, '$2 ($1)');

  // Remove all other HTML tags
  text = text.replace(/]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '');
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
  const trackingPixel = ``;

  // Try to insert before closing body tag
  if (html.includes('')) {
    return html.replace('', `${trackingPixel}`);
  }

  // Otherwise append to end
  return html + trackingPixel;
}

/**
 * Wrap links with click tracking
 */
export function wrapLinksWithTracking(html: string, trackingBaseUrl: string): string {
  return html.replace(
    /]*)>/gi,
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
      return ``;
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
    
      ${options.companyName}
      ${options.companyAddress}
      
        You received this email because you are in our contact database or made a purchase from us.
      
      
        Unsubscribe
        ${options.preferencesUrl ? `| Update Preferences` : ''}
      
    
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
      
        ${preheaderText}
      
    `;

    if (/]*>/i.test(html)) {
      html = html.replace(/]*>/i, (match) => `${match}${preheaderBlock}`);
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
    if (html.includes('')) {
      html = html.replace('', `${footer}`);
    } else {
      html += footer;
    }
  }

  // 4. Wrap email in proper HTML structure if not already present
  if (!html.includes('
      
      
        
        
        
        Email
      
      
        ${html}
      
      
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