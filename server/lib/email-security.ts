/**
 * Email Security & Deliverability Utilities
 * 
 * Provides utilities for:
 * - List-Unsubscribe header generation (RFC 8058)
 * - Email authentication validation
 * - Domain reputation checking
 * - Sender policy validation
 */

export interface EmailSecurityHeaders {
  'List-Unsubscribe'?: string;
  'List-Unsubscribe-Post'?: string;
  'Precedence'?: string;
  'X-Auto-Response-Suppress'?: string;
}

/**
 * Generates RFC 8058 compliant List-Unsubscribe headers
 * Enables one-click unsubscribe in Gmail, Yahoo, and Outlook
 * 
 * @param unsubscribeUrl - Full HTTPS URL for unsubscribe page
 * @param recipientEmail - Email address of recipient
 * @param campaignId - Campaign identifier
 * @returns Headers object to merge with email headers
 */
export function generateUnsubscribeHeaders(
  unsubscribeUrl: string,
  recipientEmail: string,
  campaignId?: string
): EmailSecurityHeaders {
  // Ensure HTTPS for security and compliance
  if (!unsubscribeUrl.startsWith('https://')) {
    console.warn('[Email Security] Unsubscribe URL must use HTTPS:', unsubscribeUrl);
    unsubscribeUrl = unsubscribeUrl.replace(/^http:\/\//i, 'https://');
  }

  // Build unsubscribe URL with parameters
  const url = new URL(unsubscribeUrl);
  url.searchParams.set('email', recipientEmail);
  if (campaignId) {
    url.searchParams.set('campaign_id', campaignId);
  }

  return {
    // RFC 2369 - List-Unsubscribe header (supported by all email clients)
    'List-Unsubscribe': `<${url.toString()}>`,
    
    // RFC 8058 - One-Click Unsubscribe (Gmail, Yahoo requirement)
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    
    // Precedence header (helps avoid auto-responders)
    'Precedence': 'bulk',
    
    // Suppress auto-responses (Exchange, Outlook)
    'X-Auto-Response-Suppress': 'OOF, AutoReply',
  };
}

/**
 * Validates sender domain authentication
 * Checks if email is being sent from authenticated domain
 * 
 * @param fromEmail - Sender email address
 * @param configuredDomain - Domain configured in APP_BASE_URL
 * @returns Validation result with warnings
 */
export function validateSenderAuthentication(
  fromEmail: string,
  configuredDomain: string
): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  try {
    // Extract domain from email
    const emailDomain = fromEmail.split('@')[1]?.toLowerCase();
    const baseDomain = configuredDomain.replace(/^https?:\/\//, '').toLowerCase();

    if (!emailDomain) {
      warnings.push('❌ Invalid sender email format');
      return { isValid: false, warnings };
    }

    // Check if sender domain matches configured domain
    if (!baseDomain.includes(emailDomain) && !emailDomain.includes(baseDomain)) {
      warnings.push(
        `⚠️ Sender domain (${emailDomain}) does not match configured domain (${baseDomain}). ` +
        'This may cause SPF/DKIM failures and reduce deliverability.'
      );
    }

    // Check for generic/free email providers (not recommended for business)
    const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
    if (freeProviders.includes(emailDomain)) {
      warnings.push(
        `⚠️ Sending from free email provider (${emailDomain}). ` +
        'Use a business domain for better deliverability.'
      );
    }

    return { isValid: true, warnings };
  } catch (error) {
    warnings.push('❌ Error validating sender authentication');
    return { isValid: false, warnings };
  }
}

/**
 * Validates email has required compliance elements
 * 
 * @param emailHtml - Email HTML content
 * @returns Validation result
 */
export function validateEmailCompliance(emailHtml: string): {
  isCompliant: boolean;
  missingElements: string[];
} {
  const missingElements: string[] = [];
  const lowerHtml = emailHtml.toLowerCase();

  // 1. Unsubscribe link (CAN-SPAM requirement)
  if (!lowerHtml.includes('unsubscribe')) {
    missingElements.push('Unsubscribe link');
  }

  // 2. Physical address (CAN-SPAM requirement)
  // Check for common address patterns
  const hasAddress =
    /\\d+\\s+[a-z]+\\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd)/i.test(emailHtml);
  if (!hasAddress) {
    missingElements.push('Physical postal address');
  }

  // 3. Sender identification
  if (!lowerHtml.includes('company') && !lowerHtml.includes('organization')) {
    missingElements.push('Clear sender identification');
  }

  return {
    isCompliant: missingElements.length === 0,
    missingElements,
  };
}

/**
 * Generates email headers for bulk/marketing emails
 * Includes all compliance and deliverability headers
 * 
 * @param options - Email sending options
 * @returns Complete headers object
 */
export function generateBulkEmailHeaders(options: {
  fromEmail: string;
  recipientEmail: string;
  campaignId?: string;
  unsubscribeBaseUrl?: string;
  messageId?: string;
}): Record<string, string> {
  const {
    fromEmail,
    recipientEmail,
    campaignId,
    unsubscribeBaseUrl = process.env.APP_BASE_URL || 'https://demandgentic.ai',
    messageId,
  } = options;

  const headers: Record<string, string> = {
    // Message identification
    'X-Mailer': 'DemandGentic CRM',
    'X-Campaign-ID': campaignId || 'none',
    
    // Email client hints
    'X-Priority': '3', // Normal priority
    'X-MSMail-Priority': 'Normal',
    'Importance': 'Normal',
  };

  // Add unsubscribe headers
  const unsubscribeHeaders = generateUnsubscribeHeaders(
    `${unsubscribeBaseUrl}/unsubscribe`,
    recipientEmail,
    campaignId
  );
  Object.assign(headers, unsubscribeHeaders);

  // Add custom Message-ID for tracking
  if (messageId) {
    headers['Message-ID'] = `<${messageId}@${fromEmail.split('@')[1]}>`;
  }

  return headers;
}

/**
 * Checks if a domain is on common blacklists
 * Note: This is a basic check. For production, integrate with real-time blacklist APIs
 * 
 * @param domain - Domain to check
 * @returns List of blacklists the domain appears on
 */
export function checkDomainReputation(domain: string): {
  isClean: boolean;
  blacklists: string[];
  recommendations: string[];
} {
  // This is a placeholder for actual blacklist checking
  // In production, integrate with services like:
  // - Spamhaus (https://www.spamhaus.org)
  // - Barracuda (https://www.barracudacentral.org)
  // - SURBL (https://www.surbl.org)
  
  const blacklists: string[] = [];
  const recommendations: string[] = [];

  // Basic checks
  const suspiciousTLDs = ['.tk', '.ml', '.ga', '.cf', '.gq'];
  if (suspiciousTLDs.some(tld => domain.endsWith(tld))) {
    blacklists.push('Suspicious TLD');
    recommendations.push('Use a reputable domain extension (.com, .net, .org)');
  }

  // New domain check (would require DNS age lookup in production)
  recommendations.push('Warm up new domains gradually (start with 50 emails/day)');
  recommendations.push('Set up SPF, DKIM, and DMARC records');
  recommendations.push('Monitor bounce rates and spam complaints');

  return {
    isClean: blacklists.length === 0,
    blacklists,
    recommendations,
  };
}

/**
 * Provides email authentication setup guidance
 * 
 * @param domain - Domain to configure
 * @returns Setup instructions
 */
export function getAuthenticationSetupInstructions(domain: string): {
  spf: string;
  dkim: string;
  dmarc: string;
} {
  return {
    spf: `Create TXT record for ${domain}:\\n` +
         `v=spf1 include:_spf.google.com include:spf.mailgun.org ~all`,
    
    dkim: `Create DKIM keys via your email provider and add TXT record:\\n` +
          `default._domainkey.${domain} TXT "v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY"`,
    
    dmarc: `Create TXT record:\\n` +
           `_dmarc.${domain} TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}"`,
  };
}

/**
 * Validates that base URLs use organization's domain
 * Prevents link mismatches that trigger spam filters
 * 
 * @param linkUrl - URL in email
 * @param senderDomain - Sender's domain
 * @returns Validation result
 */
export function validateLinkAuthority(
  linkUrl: string,
  senderDomain: string
): {
  isValid: boolean;
  warning?: string;
} {
  try {
    const link = new URL(linkUrl);
    const linkDomain = link.hostname.toLowerCase();
    const sender = senderDomain.toLowerCase();

    // Allow links to own domain or subdomains
    if (linkDomain === sender || linkDomain.endsWith(`.${sender}`)) {
      return { isValid: true };
    }

    // Allow common trusted domains
    const trustedDomains = [
      'linkedin.com',
      'twitter.com',
      'facebook.com',
      'youtube.com',
      'calendly.com',
    ];
    
    if (trustedDomains.some(trusted => linkDomain.endsWith(trusted))) {
      return { isValid: true };
    }

    // Warn about external links
    return {
      isValid: true,
      warning: `⚠️ Link to external domain (${linkDomain}). Consider using your own domain for better deliverability.`,
    };
  } catch (error) {
    return {
      isValid: false,
      warning: '❌ Invalid URL format',
    };
  }
}
