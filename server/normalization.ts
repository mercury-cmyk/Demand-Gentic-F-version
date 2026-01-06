// Normalization utilities for data quality and deduplication
import { formatPhoneWithCountryCode } from './lib/phone-formatter.js';

/**
 * Normalizes an email address for deduplication
 * - Lowercase
 * - Trim whitespace
 * - Remove dots in Gmail-style addresses (optional, enabled by default)
 * - Strip tags/aliases (+suffix) (optional, enabled by default)
 */
export function normalizeEmail(email: string, options = { 
  removeDots: true, 
  stripTags: true 
}): string {
  if (!email) return '';
  
  let normalized = email.toLowerCase().trim();
  
  const [localPart, domain] = normalized.split('@');
  if (!domain) return normalized;
  
  let processedLocal = localPart;
  
  // Remove tags/aliases (everything after +)
  if (options.stripTags) {
    processedLocal = processedLocal.split('+')[0];
  }
  
  // Remove dots for Gmail and similar providers
  if (options.removeDots && isGmailStyleProvider(domain)) {
    processedLocal = processedLocal.replace(/\./g, '');
  }
  
  return `${processedLocal}@${domain}`;
}

/**
 * Checks if a domain uses Gmail-style dot-insensitivity
 */
function isGmailStyleProvider(domain: string): boolean {
  const gmailProviders = [
    'gmail.com',
    'googlemail.com'
  ];
  return gmailProviders.includes(domain.toLowerCase());
}

/**
 * Normalizes a domain for deduplication
 * - Lowercase
 * - Trim whitespace  
 * - Remove www. prefix
 * - Remove trailing slash
 * - Extract hostname from URL if needed
 */
export function normalizeDomain(domain: string): string {
  if (!domain) return '';
  
  let normalized = domain.toLowerCase().trim();
  
  // Extract hostname from URL if a full URL was provided
  if (normalized.includes('://')) {
    try {
      const url = new URL(normalized);
      normalized = url.hostname;
    } catch {
      // Not a valid URL, continue with raw string
    }
  }
  
  // Remove www. prefix
  if (normalized.startsWith('www.')) {
    normalized = normalized.slice(4);
  }
  
  // Remove trailing slash
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  
  return normalized;
}

/**
 * Normalizes a company/account name for matching
 * - Lowercase
 * - Trim whitespace
 * - Remove common legal suffixes (Inc., LLC, Ltd., etc.)
 * - Remove special characters
 * - Normalize whitespace (multiple spaces to single)
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  
  let normalized = name.toLowerCase().trim();
  
  // Remove common legal entity suffixes
  const suffixes = [
    /\b(inc|incorporated)\b\.?$/i,
    /\b(llc|l\.l\.c\.)\b\.?$/i,
    /\b(ltd|limited)\b\.?$/i,
    /\b(corp|corporation)\b\.?$/i,
    /\b(co|company)\b\.?$/i,
    /\b(gmbh)\b\.?$/i,
    /\b(pvt|private)\b\.?$/i,
    /\b(plc|public limited company)\b\.?$/i,
    /\b(ag|aktiengesellschaft)\b\.?$/i,
    /\b(sa|société anonyme)\b\.?$/i,
  ];
  
  for (const suffix of suffixes) {
    normalized = normalized.replace(suffix, '').trim();
  }
  
  // Remove special characters but keep spaces
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');
  
  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Get country code from country name
 */
export function getCountryCodeFromName(countryName: string): string {
  const countryCodeMap: Record<string, string> = {
    'United States': '1',
    'USA': '1',
    'US': '1',
    'Canada': '1',
    'United Kingdom': '44',
    'UK': '44',
    'Australia': '61',
    'India': '91',
    'Germany': '49',
    'France': '33',
    'Spain': '34',
    'Italy': '39',
    'Netherlands': '31',
    'Belgium': '32',
    'Switzerland': '41',
    'Austria': '43',
    'Poland': '48',
    'Sweden': '46',
    'Norway': '47',
    'Denmark': '45',
    'Finland': '358',
    'Ireland': '353',
    'Portugal': '351',
    'Greece': '30',
    'Czech Republic': '420',
    'Hungary': '36',
    'Romania': '40',
    'Bulgaria': '359',
    'Singapore': '65',
    'Malaysia': '60',
    'Hong Kong': '852',
    'Japan': '81',
    'South Korea': '82',
    'China': '86',
    'Taiwan': '886',
    'Thailand': '66',
    'Philippines': '63',
    'Indonesia': '62',
    'Vietnam': '84',
    'Brazil': '55',
    'Mexico': '52',
    'Argentina': '54',
    'Chile': '56',
    'Colombia': '57',
    'Peru': '51',
    'South Africa': '27',
    'Nigeria': '234',
    'Kenya': '254',
    'Egypt': '20',
    'UAE': '971',
    'Saudi Arabia': '966',
    'Israel': '972',
    'Turkey': '90',
    'Russia': '7',
    'New Zealand': '64',
  };
  
  return countryCodeMap[countryName] || '1'; // Default to US/Canada
}

/**
 * Validates and normalizes a phone number to E.164 format
 * Returns null if invalid
 * 
 * Uses the fixed phone formatter that properly handles country-specific formatting
 * This properly formats UK numbers: 01908802874 → +441908802874 (not +4401908802874)
 */
export function normalizePhoneE164(phone: string, country?: string): string | null {
  if (!phone) return null;
  
  return formatPhoneWithCountryCode(phone, country);
}

/**
 * Format phone number for display (click-to-call ready)
 */
export function formatPhoneForDisplay(phoneE164: string | null): string {
  if (!phoneE164) return '';
  
  // Remove + for display, but keep it in data
  const digits = phoneE164.replace(/\D/g, '');
  
  // US/Canada format: +1 (555) 123-4567
  if (phoneE164.startsWith('+1') && digits.length === 11) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  
  // UK format: +44 20 1234 5678
  if (phoneE164.startsWith('+44')) {
    const local = digits.slice(2);
    if (local.length === 10) {
      return `+44 ${local.slice(0, 2)} ${local.slice(2, 6)} ${local.slice(6)}`;
    }
  }
  
  // Default: just add + and group by 3s
  return '+' + digits.replace(/(\d{1,3})(?=(\d{3})+(?!\d))/g, '$1 ');
}

/**
 * Checks if an email domain is a free/personal email provider
 */
export function isFreeEmailDomain(domain: string): boolean {
  const freeProviders = [
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'yahoo.co.uk',
    'yahoo.ca',
    'hotmail.com',
    'outlook.com',
    'live.com',
    'msn.com',
    'aol.com',
    'icloud.com',
    'me.com',
    'mac.com',
    'protonmail.com',
    'proton.me',
    'mail.com',
    'zoho.com',
    'yandex.com',
    'gmx.com',
    'gmx.net',
  ];
  
  return freeProviders.includes(domain.toLowerCase());
}

/**
 * Generates an idempotency key for upsert operations
 * Combines business key + payload hash for replay safety
 */
export function generateIdempotencyKey(
  entityType: string,
  businessKey: string,
  payload: any
): string {
  const payloadString = JSON.stringify(payload);
  // Simple hash (in production, use crypto.createHash)
  const hash = Buffer.from(payloadString).toString('base64').slice(0, 16);
  return `${entityType}:${businessKey}:${hash}`;
}
