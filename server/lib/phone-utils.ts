import { parsePhoneNumber, CountryCode, getCountryCallingCode } from 'libphonenumber-js';

/**
 * Country code to ISO country mapping
 * Maps common country names to ISO 3166-1 alpha-2 codes
 */
const COUNTRY_NAME_TO_CODE: Record<string, CountryCode> = {
  // Primary English names
  'united states': 'US',
  'usa': 'US',
  'united kingdom': 'GB',
  'united kingdom uk': 'GB',
  'uk': 'GB',
  'canada': 'CA',
  'australia': 'AU',
  'germany': 'DE',
  'france': 'FR',
  'spain': 'ES',
  'italy': 'IT',
  'netherlands': 'NL',
  'belgium': 'BE',
  'switzerland': 'CH',
  'austria': 'AT',
  'sweden': 'SE',
  'norway': 'NO',
  'denmark': 'DK',
  'finland': 'FI',
  'poland': 'PL',
  'czech republic': 'CZ',
  'czechia': 'CZ',
  'ireland': 'IE',
  'portugal': 'PT',
  'greece': 'GR',
  'india': 'IN',
  'china': 'CN',
  'japan': 'JP',
  'south korea': 'KR',
  'korea': 'KR',
  'singapore': 'SG',
  'hong kong': 'HK',
  'malaysia': 'MY',
  'thailand': 'TH',
  'indonesia': 'ID',
  'philippines': 'PH',
  'vietnam': 'VN',
  'new zealand': 'NZ',
  'south africa': 'ZA',
  'brazil': 'BR',
  'mexico': 'MX',
  'argentina': 'AR',
  'chile': 'CL',
  'colombia': 'CO',
  'peru': 'PE',
  'costa rica': 'CR',
  'united arab emirates': 'AE',
  'uae': 'AE',
  'saudi arabia': 'SA',
  'israel': 'IL',
  'turkey': 'TR',
  'russia': 'RU',
  'ukraine': 'UA',
  'egypt': 'EG',
  'nigeria': 'NG',
  'kenya': 'KE',
  'morocco': 'MA',
  'sri lanka': 'LK',
  'pakistan': 'PK',
  'romania': 'RO',
  'serbia': 'RS',
  'slovenia': 'SI',
  'luxembourg': 'LU',
  'taiwan': 'TW',
  'laos': 'LA',
};

/**
 * Normalize country name to ISO country code
 */
export function normalizeCountryToCode(country: string | null | undefined): CountryCode | null {
  if (!country) return null;
  
  const normalized = country.toLowerCase().trim();
  
  // Check if it's already a valid 2-letter code
  if (normalized.length === 2) {
    return normalized.toUpperCase() as CountryCode;
  }
  
  // Look up in mapping
  return COUNTRY_NAME_TO_CODE[normalized] || null;
}

/**
 * Get calling code prefix for a country
 */
export function getCountryDialCode(countryCode: CountryCode): string {
  try {
    const callingCode = getCountryCallingCode(countryCode);
    return `+${callingCode}`;
  } catch (error) {
    console.error(`[PhoneUtils] Error getting calling code for ${countryCode}:`, error);
    return '';
  }
}

/**
 * Normalize phone number with country code
 * If phone number doesn't have country code, add it based on contact's country
 */
export function normalizePhoneWithCountryCode(
  phoneNumber: string | null | undefined,
  contactCountry: string | null | undefined
): { 
  normalized: string | null;
  e164: string | null;
  countryMatches: boolean;
  error?: string;
} {
  if (!phoneNumber) {
    return { normalized: null, e164: null, countryMatches: false };
  }

  const phone = phoneNumber.trim();
  if (!phone) {
    return { normalized: null, e164: null, countryMatches: false };
  }

  const countryCode = normalizeCountryToCode(contactCountry);
  if (!countryCode) {
    return { 
      normalized: null, 
      e164: null, 
      countryMatches: false,
      error: 'Invalid or missing contact country'
    };
  }

  try {
    // Clean the phone first - remove any non-digit characters except leading +
    let cleanPhone = phone.replace(/[^\d+]/g, '');
    
    // If phone doesn't start with + but starts with digits, try adding +
    // This handles cases like "4401234567890" which should be "+4401234567890"
    if (!cleanPhone.startsWith('+') && /^\d/.test(cleanPhone)) {
      // Try parsing with + prefix first (in case it's already in E.164 format minus the +)
      try {
        const withPlus = '+' + cleanPhone;
        const testParse = parsePhoneNumber(withPlus);
        if (testParse && testParse.isValid()) {
          // If it parses with just +, use it
          cleanPhone = withPlus;
        }
      } catch (e) {
        // Ignore - will try adding country code next
      }
    }
    
    // Try parsing with country code in the number first
    let parsedPhone = parsePhoneNumber(cleanPhone, { defaultCountry: countryCode });
    
    // If parsing failed or phone doesn't have country code, add it
    if (!parsedPhone || !parsedPhone.country) {
      // If phone doesn't start with +, add country code
      if (!cleanPhone.startsWith('+')) {
        const dialCode = getCountryDialCode(countryCode);
        const phoneWithCode = `${dialCode}${cleanPhone}`;
        parsedPhone = parsePhoneNumber(phoneWithCode);
      } else {
        parsedPhone = parsePhoneNumber(cleanPhone);
      }
    }

    if (!parsedPhone) {
      return {
        normalized: null,
        e164: null,
        countryMatches: false,
        error: 'Failed to parse phone number'
      };
    }

    // Check if phone's country matches contact's country
    const phoneCountry = parsedPhone.country;
    const countryMatches = phoneCountry === countryCode;

    // Only return valid phone numbers that match the contact's country
    if (!countryMatches) {
      return {
        normalized: null,
        e164: null,
        countryMatches: false,
        error: `Phone country (${phoneCountry}) doesn't match contact country (${countryCode})`
      };
    }

    // Validate the phone number
    if (!parsedPhone.isValid()) {
      return {
        normalized: null,
        e164: null,
        countryMatches,
        error: 'Phone number is not valid for the country'
      };
    }

    return {
      normalized: parsedPhone.formatInternational(),
      e164: parsedPhone.format('E.164'),
      countryMatches,
    };
  } catch (error) {
    // Silently return null for parsing errors (invalid numbers, malformed data, etc.)
    // Logging thousands of these errors causes performance issues during campaign launch
    return {
      normalized: null,
      e164: null,
      countryMatches: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Validate that phone number's country code matches contact's geo location
 */
export function validatePhoneCountryMatch(
  phoneE164: string | null | undefined,
  contactCountry: string | null | undefined
): boolean {
  if (!phoneE164 || !contactCountry) return false;

  const countryCode = normalizeCountryToCode(contactCountry);
  if (!countryCode) return false;

  try {
    const parsedPhone = parsePhoneNumber(phoneE164);
    if (!parsedPhone || !parsedPhone.isValid()) return false;

    return parsedPhone.country === countryCode;
  } catch (error) {
    // Silently return false for parsing errors (invalid countries, malformed numbers, etc.)
    // Logging thousands of these errors causes performance issues
    return false;
  }
}

/**
 * Get best phone number from contact - WITH COUNTRY VALIDATION
 * Returns the first parseable phone number that MATCHES the contact's country
 * 
 * Phone Priority (STRICT country matching):
 * 1. Contact direct phone (E164 or raw) - Must match contact country
 * 2. Contact mobile phone (E164 or raw) - Must match contact country  
 * 3. Company HQ phone - Must match HQ country
 * 
 * If no phone matches the contact's country, returns null (contact excluded from queue)
 * 
 * CRITICAL: Properly handles trunk prefixes (e.g., UK "0" prefix)
 * Example: "4401908802874" → "+441908802874" (removes "0" trunk prefix)
 */
export function getBestPhoneForContact(contact: {
  directPhone?: string | null;
  directPhoneE164?: string | null;
  mobilePhone?: string | null;
  mobilePhoneE164?: string | null;
  country?: string | null;
  hqPhone?: string | null;
  hqPhoneE164?: string | null;
  hqCountry?: string | null;
}): { phone: string | null; type: 'direct' | 'mobile' | 'hq' | null } {
  
  // Get contact's expected country code for validation
  const contactCountryCode = contact.country ? normalizeCountryToCode(contact.country) : null;
  const hqCountryCode = contact.hqCountry ? normalizeCountryToCode(contact.hqCountry) : null;
  
  // Helper: Validate that a parsed E.164 phone matches the expected country
  const validatePhoneCountry = (e164Phone: string, expectedCountryCode: CountryCode | null): boolean => {
    if (!expectedCountryCode) return true; // No country to validate against, allow
    try {
      const parsed = parsePhoneNumber(e164Phone);
      if (!parsed || !parsed.country) return false;
      return parsed.country === expectedCountryCode;
    } catch {
      return false;
    }
  };
  
  // Helper: Try to parse any phone string into E.164 with proper trunk prefix handling
  // CRITICAL FIX: Reordered strategies to handle numbers that already contain country codes
  const tryParsePhone = (phone: string | null | undefined, hintCountry?: string | null): string | null => {
    if (!phone) return null;
    
    const phoneStr = phone.trim();
    if (!phoneStr) return null;
    
    // Clean phone - remove non-digit characters except leading +
    let cleanPhone = phoneStr.replace(/[^\d+]/g, '');
    if (!cleanPhone) return null;
    
    // Get country code hint if provided
    const countryCode = hintCountry ? normalizeCountryToCode(hintCountry) : null;
    const callingCode = countryCode ? getCountryCallingCode(countryCode).replace('+', '') : null;
    
    try {
      // STRATEGY 1: Already has + prefix - parse directly as international
      if (cleanPhone.startsWith('+')) {
        const parsed = parsePhoneNumber(cleanPhone);
        if (parsed && parsed.isValid()) {
          return parsed.format('E.164');
        }
      }
      
      // STRATEGY 2: Number starts with country calling code (e.g., "441733239003" for UK)
      // Try adding + prefix FIRST - this handles numbers that already have the country code embedded
      if (!cleanPhone.startsWith('+')) {
        try {
          const withPlus = '+' + cleanPhone;
          const parsed = parsePhoneNumber(withPlus);
          if (parsed && parsed.isValid()) {
            // Verify the detected country matches our hint (if provided) to avoid false positives
            // E.g., "12025551234" could be valid US number
            if (!countryCode || parsed.country === countryCode) {
              return parsed.format('E.164');
            }
            // If country doesn't match but still valid, keep it as a fallback
            // but continue trying other strategies first
          }
        } catch (e) {
          // Not a valid international number, continue
        }
      }
      
      // STRATEGY 3: Number has country code + trunk prefix (e.g., "4401908..." for UK)
      // UK numbers with 0 after 44 need the 0 removed: 4401908... → +441908...
      if (callingCode && cleanPhone.startsWith(callingCode + '0') && cleanPhone.length >= callingCode.length + 10) {
        try {
          // Remove the trunk prefix "0" after the country code
          const fixedPhone = '+' + callingCode + cleanPhone.substring(callingCode.length + 1);
          const parsed = parsePhoneNumber(fixedPhone);
          if (parsed && parsed.isValid()) {
            return parsed.format('E.164');
          }
        } catch (e) {
          // Continue to next strategy
        }
      }
      
      // STRATEGY 4: Number starts with country code but missing + (e.g., "441733239003")
      // Strip the country code and re-parse with country hint
      if (callingCode && cleanPhone.startsWith(callingCode) && !cleanPhone.startsWith('+')) {
        try {
          const phoneWithoutCountryCode = cleanPhone.substring(callingCode.length);
          const parsed = parsePhoneNumber(phoneWithoutCountryCode, countryCode!);
          if (parsed && parsed.isValid()) {
            return parsed.format('E.164');
          }
        } catch (e) {
          // Continue to next strategy
        }
      }
      
      // STRATEGY 5: UK-SPECIFIC - Number missing local prefix (0)
      // UK numbers should start with 0 for local format, e.g., "01234567890" or "07123456789"
      // If we have a UK hint and number is 10 digits without leading 0, add it
      if (countryCode === 'GB' && cleanPhone.length === 10 && !cleanPhone.startsWith('0') && !cleanPhone.startsWith('44')) {
        try {
          const withPrefix = '0' + cleanPhone;
          const parsed = parsePhoneNumber(withPrefix, 'GB');
          if (parsed && parsed.isValid()) {
            return parsed.format('E.164');
          }
        } catch (e) {
          // Continue to next strategy
        }
      }
      
      // STRATEGY 6: Local number format - use country hint to add country code
      // Handles numbers like "01234567890" (UK local) or "2025551234" (US local)
      if (countryCode) {
        try {
          const parsed = parsePhoneNumber(cleanPhone, countryCode);
          if (parsed && parsed.isValid()) {
            return parsed.format('E.164');
          }
        } catch (e) {
          // Continue to next strategy
        }
      }
      
      // STRATEGY 7: Try common country codes as fallback (when no hint or hint didn't work)
      const commonCountries: CountryCode[] = ['GB', 'US', 'CA', 'AU', 'DE', 'FR', 'NL', 'BE', 'IE'];
      for (const tryCountry of commonCountries) {
        if (tryCountry === countryCode) continue; // Already tried this
        try {
          // First try as international (with +)
          const withPlus = '+' + cleanPhone;
          const parsedIntl = parsePhoneNumber(withPlus);
          if (parsedIntl && parsedIntl.isValid() && parsedIntl.country === tryCountry) {
            return parsedIntl.format('E.164');
          }
          
          // Then try as local number with country hint
          const parsed = parsePhoneNumber(cleanPhone, tryCountry);
          if (parsed && parsed.isValid()) {
            return parsed.format('E.164');
          }
        } catch (e) {
          // Try next country
        }
      }
    } catch (error) {
      // Ignore parsing errors
    }
    
    return null;
  };

  // PRIORITY 1: Contact direct phone (E164 format preferred) - WITH COUNTRY VALIDATION
  // Only accept if phone country matches contact country
  if (contact.directPhoneE164) {
    try {
      const parsed = parsePhoneNumber(contact.directPhoneE164);
      if (parsed && parsed.isValid() && validatePhoneCountry(contact.directPhoneE164, contactCountryCode)) {
        return { phone: contact.directPhoneE164, type: 'direct' };
      }
    } catch (error) {
      // Try parsing as raw phone instead
    }
  }

  // PRIORITY 2: Contact mobile phone (E164 format) - WITH COUNTRY VALIDATION
  // Only accept if phone country matches contact country
  if (contact.mobilePhoneE164) {
    try {
      const parsed = parsePhoneNumber(contact.mobilePhoneE164);
      if (parsed && parsed.isValid() && validatePhoneCountry(contact.mobilePhoneE164, contactCountryCode)) {
        return { phone: contact.mobilePhoneE164, type: 'mobile' };
      }
    } catch (error) {
      // Try parsing as raw phone instead
    }
  }

  // PRIORITY 3: Try parsing contact direct phone - WITH COUNTRY VALIDATION
  // Parse phone and validate it matches contact country
  if (contact.directPhone) {
    const parsed = tryParsePhone(contact.directPhone, contact.country);
    if (parsed && validatePhoneCountry(parsed, contactCountryCode)) {
      return { phone: parsed, type: 'direct' };
    }
  }

  // PRIORITY 4: Try parsing contact mobile phone - WITH COUNTRY VALIDATION
  // Parse phone and validate it matches contact country
  if (contact.mobilePhone) {
    const parsed = tryParsePhone(contact.mobilePhone, contact.country);
    if (parsed && validatePhoneCountry(parsed, contactCountryCode)) {
      return { phone: parsed, type: 'mobile' };
    }
  }

  // PRIORITY 5 (FALLBACK): Company HQ phone - WITH COUNTRY VALIDATION
  // CRITICAL: HQ phone must ALSO match CONTACT country (not just HQ country)
  // This ensures UK contacts don't get US HQ numbers
  if (contact.hqPhoneE164) {
    try {
      const parsed = parsePhoneNumber(contact.hqPhoneE164);
      if (parsed && parsed.isValid() && validatePhoneCountry(contact.hqPhoneE164, contactCountryCode)) {
        return { phone: contact.hqPhoneE164, type: 'hq' };
      }
    } catch (error) {
      // Try parsing as raw phone instead
    }
  }

  // Try parsing HQ phone from raw format - WITH COUNTRY VALIDATION
  // CRITICAL: Validate against CONTACT country, not HQ country
  if (contact.hqPhone) {
    const parsed = tryParsePhone(contact.hqPhone, contact.hqCountry);
    if (parsed && validatePhoneCountry(parsed, contactCountryCode)) {
      return { phone: parsed, type: 'hq' };
    }
  }

  // No valid phone found that matches the contact's country
  return { phone: null, type: null };
}
