// Shared phone number helpers for AI calling pipelines
import { formatPhoneWithCountryCode } from './phone-formatter';

export function normalizeToE164(phoneNumber: string): string {
  let normalized = phoneNumber.replace(/[^\d+]/g, "");

  if (normalized.startsWith("+")) {
    if (normalized.startsWith("+00")) {
      normalized = "+" + normalized.substring(3);
    } else if (normalized.startsWith("+0")) {
      const withoutPlus = normalized.substring(1);
      if (/^0[1-9]/.test(withoutPlus)) {
        normalized = "+44" + withoutPlus.substring(1);
      }
    }
    return normalized;
  }

  if (normalized.startsWith("00")) {
    return "+" + normalized.substring(2);
  }

  if (/^0[1-9]/.test(normalized)) {
    return "+44" + normalized.substring(1);
  }

  if (normalized.startsWith("44") && normalized.length >= 12 && normalized.length <= 13) {
    return "+" + normalized;
  }

  if (normalized.startsWith("1") && normalized.length === 11) {
    return "+" + normalized;
  }

  const euCountryCodes = ["49", "33", "31", "34", "39", "46", "47", "48", "32", "43", "41"];
  for (const code of euCountryCodes) {
    if (normalized.startsWith(code) && normalized.length >= 10 && normalized.length <= 14) {
      return "+" + normalized;
    }
  }

  const asiaPacificCodes = ["81", "91", "61", "86", "82", "65", "60", "63", "62"];
  for (const code of asiaPacificCodes) {
    if (normalized.startsWith(code) && normalized.length >= 10 && normalized.length <= 15) {
      return "+" + normalized;
    }
  }

  if (normalized.length === 10 && /^[2-9]/.test(normalized)) {
    return "+1" + normalized;
  }

  return "+" + normalized;
}

export function isValidE164(phoneNumber: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phoneNumber);
}

/**
 * Check if an E.164 phone number is a toll-free/freephone/service number
 * These are inbound-only company lines, not useful for reaching a specific contact
 */
export function isTollFreeOrServiceNumber(phone: string): boolean {
  const digits = phone.replace(/[^\d]/g, '');

  // UK toll-free/service prefixes (after country code 44):
  // 0800/0808 = freephone, 0845/0870 = non-geographic, 0844/0843 = business rate
  if (digits.startsWith('44')) {
    const subscriber = digits.substring(2);
    if (/^(800|808|845|870|844|843|842|871|872|873)/.test(subscriber)) {
      return true;
    }
  }

  // US/CA toll-free prefixes (after country code 1):
  // 800, 888, 877, 866, 855, 844, 833
  if (digits.startsWith('1')) {
    const subscriber = digits.substring(1);
    if (/^(800|888|877|866|855|844|833)/.test(subscriber)) {
      return true;
    }
  }

  // International toll-free: +800 (UIFN)
  if (digits.startsWith('800')) {
    return true;
  }

  return false;
}

/**
 * Get the best phone number for a contact with fallback logic
 * Prioritizes: direct phone > mobile phone > HQ phone
 */
export function getBestPhoneForContact(contact: {
  directPhone?: string | null;
  directPhoneE164?: string | null;
  mobilePhone?: string | null;
  mobilePhoneE164?: string | null;
  hqPhone?: string | null;
  hqPhoneE164?: string | null;
  hqCountry?: string | null;
  country?: string | null;
}): { phone: string | null; type: 'direct' | 'mobile' | 'hq' | null } {
  const country = contact.country || undefined;

  // Helper: normalize using country-aware formatter, then fallback to heuristic
  function normalize(phone: string, overrideCountry?: string): string | null {
    // Try country-aware normalization first (handles local numbers correctly)
    const countryAware = formatPhoneWithCountryCode(phone, overrideCountry || country);
    if (countryAware && isValidE164(countryAware)) return countryAware;
    // Fallback to heuristic normalization
    const heuristic = normalizeToE164(phone);
    return isValidE164(heuristic) ? heuristic : null;
  }

  // Try direct phone: prefer pre-normalized E164, then normalize raw
  // Skip toll-free numbers - they are company inbound lines, not direct contact numbers
  if (contact.directPhoneE164 && isValidE164(contact.directPhoneE164) && !isTollFreeOrServiceNumber(contact.directPhoneE164)) {
    return { phone: contact.directPhoneE164, type: 'direct' };
  }
  if (contact.directPhone) {
    const normalized = normalize(contact.directPhone);
    if (normalized && !isTollFreeOrServiceNumber(normalized)) return { phone: normalized, type: 'direct' };
  }

  // Fallback to mobile phone
  if (contact.mobilePhoneE164 && isValidE164(contact.mobilePhoneE164) && !isTollFreeOrServiceNumber(contact.mobilePhoneE164)) {
    return { phone: contact.mobilePhoneE164, type: 'mobile' };
  }
  if (contact.mobilePhone) {
    const normalized = normalize(contact.mobilePhone);
    if (normalized && !isTollFreeOrServiceNumber(normalized)) return { phone: normalized, type: 'mobile' };
  }

  // Last resort: HQ phone (use account's country, not contact's country)
  // Skip toll-free/freephone numbers - these are inbound-only company lines (e.g. 0800, 1-800)
  if (contact.hqPhoneE164 && isValidE164(contact.hqPhoneE164) && !isTollFreeOrServiceNumber(contact.hqPhoneE164)) {
    return { phone: contact.hqPhoneE164, type: 'hq' };
  }
  if (contact.hqPhone) {
    const hqCountry = contact.hqCountry || undefined;
    const normalized = normalize(contact.hqPhone, hqCountry);
    if (normalized && !isTollFreeOrServiceNumber(normalized)) return { phone: normalized, type: 'hq' };
  }

  return { phone: null, type: null };
}

/**
 * Normalize phone number with country code
 */
export function normalizePhoneWithCountryCode(
  phone: string | null | undefined,
  country: string | null | undefined
): { e164: string | null; normalizedPhone: string | null } {
  if (!phone) {
    return { e164: null, normalizedPhone: null };
  }

  // Try country-aware normalization first
  const countryAware = formatPhoneWithCountryCode(phone, country);
  if (countryAware && isValidE164(countryAware)) {
    return { e164: countryAware, normalizedPhone: countryAware };
  }

  // Fallback to heuristic
  const normalized = normalizeToE164(phone);
  return {
    e164: isValidE164(normalized) ? normalized : null,
    normalizedPhone: normalized
  };
}

/**
 * Normalize country to country code
 */
export function normalizeCountryToCode(country: string | null | undefined): string | null {
  if (!country) return null;
  
  const countryCodeMap: Record<string, string> = {
    'United States': 'US',
    'United Kingdom': 'GB',
    'Canada': 'CA',
    'Australia': 'AU',
    'Germany': 'DE',
    'France': 'FR',
    'Italy': 'IT',
    'Spain': 'ES',
    'Japan': 'JP',
    'China': 'CN',
    'India': 'IN',
  };
  
  return countryCodeMap[country] || country.toUpperCase().substring(0, 2);
}
