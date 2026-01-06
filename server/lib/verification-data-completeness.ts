import type { VerificationContact } from "@shared/schema";
import { parsePhoneNumber, CountryCode } from 'libphonenumber-js';
import countries from 'i18n-iso-countries';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const enLocale = require('i18n-iso-countries/langs/en.json');
countries.registerLocale(enLocale);

export interface AddressData {
  address1?: string | null;
  address2?: string | null;
  address3?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface PhoneData {
  phone?: string | null;
  country?: string | null;
}

export interface DataCompletenessResult {
  hasData: boolean;
  geographyMatches: boolean;
  source?: 'contact' | 'hq' | 'ai_enriched' | 'csv';
  reason?: string;
}

export function hasMatchingAddress(contact: VerificationContact): DataCompletenessResult {
  const contactCountry = normalizeCountry(contact.contactCountry);
  
  if (!contactCountry) {
    return {
      hasData: false,
      geographyMatches: false,
      reason: 'Contact country not specified'
    };
  }

  const contactLevelAddress: AddressData = {
    address1: contact.contactAddress1,
    address2: contact.contactAddress2,
    address3: contact.contactAddress3,
    city: contact.contactCity,
    country: contact.contactCountry
  };

  const hqAddress: AddressData = {
    address1: contact.hqAddress1,
    address2: contact.hqAddress2,
    address3: contact.hqAddress3,
    city: contact.hqCity,
    country: contact.hqCountry
  };

  const aiEnrichedAddress: AddressData = {
    address1: contact.aiEnrichedAddress1,
    address2: contact.aiEnrichedAddress2,
    address3: contact.aiEnrichedAddress3,
    city: contact.aiEnrichedCity,
    country: contact.aiEnrichedCountry
  };

  const contactResult = checkAddressCompleteness(contactLevelAddress, contactCountry);
  if (contactResult.hasData && contactResult.geographyMatches) {
    return { ...contactResult, source: 'contact' };
  }

  const hqResult = checkAddressCompleteness(hqAddress, contactCountry);
  if (hqResult.hasData && hqResult.geographyMatches) {
    return { ...hqResult, source: 'hq' };
  }

  const aiResult = checkAddressCompleteness(aiEnrichedAddress, contactCountry);
  if (aiResult.hasData && aiResult.geographyMatches) {
    return { ...aiResult, source: 'ai_enriched' };
  }

  if (contactResult.hasData && !contactResult.geographyMatches) {
    return { 
      hasData: true, 
      geographyMatches: false, 
      source: 'contact',
      reason: `Contact-level address exists but country mismatch (expected: ${contactCountry})`
    };
  }

  if (hqResult.hasData && !hqResult.geographyMatches) {
    return { 
      hasData: true, 
      geographyMatches: false, 
      source: 'hq',
      reason: `HQ address exists but country mismatch (expected: ${contactCountry})`
    };
  }

  return {
    hasData: false,
    geographyMatches: false,
    reason: `No complete address found matching contact country (${contactCountry})`
  };
}

export function hasMatchingPhone(contact: VerificationContact): DataCompletenessResult {
  const contactCountry = normalizeCountry(contact.contactCountry);
  
  if (!contactCountry) {
    return {
      hasData: false,
      geographyMatches: false,
      reason: 'Contact country not specified'
    };
  }

  if (contact.phone) {
    const phoneCountryMatch = validatePhoneCountry(contact.phone, contact.contactCountry);
    if (phoneCountryMatch.matches) {
      return {
        hasData: true,
        geographyMatches: true,
        source: 'contact',
        reason: undefined
      };
    } else if (phoneCountryMatch.hasPhone) {
      return {
        hasData: true,
        geographyMatches: false,
        source: 'contact',
        reason: phoneCountryMatch.reason
      };
    }
  }

  if (contact.mobile) {
    const phoneCountryMatch = validatePhoneCountry(contact.mobile, contact.contactCountry);
    if (phoneCountryMatch.matches) {
      return {
        hasData: true,
        geographyMatches: true,
        source: 'contact',
        reason: undefined
      };
    } else if (phoneCountryMatch.hasPhone) {
      return {
        hasData: true,
        geographyMatches: false,
        source: 'contact',
        reason: phoneCountryMatch.reason
      };
    }
  }

  const hqPhone: PhoneData = {
    phone: contact.hqPhone,
    country: contact.hqCountry
  };

  const aiEnrichedPhone: PhoneData = {
    phone: contact.aiEnrichedPhone,
    country: contact.aiEnrichedCountry
  };

  const hqResult = checkPhoneCompleteness(hqPhone, contactCountry);
  if (hqResult.hasData && hqResult.geographyMatches) {
    return { ...hqResult, source: 'hq' };
  }

  const aiResult = checkPhoneCompleteness(aiEnrichedPhone, contactCountry);
  if (aiResult.hasData && aiResult.geographyMatches) {
    return { ...aiResult, source: 'ai_enriched' };
  }

  if (hqResult.hasData && !hqResult.geographyMatches) {
    return { 
      hasData: true, 
      geographyMatches: false, 
      source: 'hq',
      reason: `HQ phone exists but country mismatch (expected: ${contactCountry})`
    };
  }

  return {
    hasData: false,
    geographyMatches: false,
    reason: `No phone found matching contact country (${contactCountry})`
  };
}

function checkAddressCompleteness(address: AddressData, expectedCountry: string): DataCompletenessResult {
  if (!address.address1 || !address.city || !address.country) {
    return {
      hasData: false,
      geographyMatches: false,
      reason: 'Incomplete address (missing address1, city, or country)'
    };
  }

  const addressCountry = normalizeCountry(address.country);
  const geographyMatches = addressCountry === expectedCountry;

  return {
    hasData: true,
    geographyMatches,
    reason: geographyMatches 
      ? undefined 
      : `Address country (${addressCountry}) does not match contact country (${expectedCountry})`
  };
}

function checkPhoneCompleteness(phone: PhoneData, expectedCountry: string): DataCompletenessResult {
  if (!phone.phone) {
    return {
      hasData: false,
      geographyMatches: false,
      reason: 'No phone number provided'
    };
  }

  if (!phone.country) {
    return {
      hasData: true,
      geographyMatches: false,
      reason: 'Phone exists but country not specified'
    };
  }

  const phoneCountry = normalizeCountry(phone.country);
  const geographyMatches = phoneCountry === expectedCountry;

  return {
    hasData: true,
    geographyMatches,
    reason: geographyMatches 
      ? undefined 
      : `Phone country (${phoneCountry}) does not match contact country (${expectedCountry})`
  };
}

function normalizeCountry(country: string | null | undefined): string {
  if (!country) return '';
  
  return country
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
}

function validatePhoneCountry(
  phoneNumber: string | null | undefined,
  expectedCountry: string | null | undefined
): { hasPhone: boolean; matches: boolean; reason?: string } {
  if (!phoneNumber || !expectedCountry) {
    return { hasPhone: false, matches: false, reason: 'Missing phone or country' };
  }

  try {
    const parsed = parsePhoneNumber(phoneNumber);
    
    if (!parsed || !parsed.country) {
      return {
        hasPhone: true,
        matches: false,
        reason: 'Could not determine phone country from number'
      };
    }

    const expectedCountryISO = convertToISO(expectedCountry);
    const phoneCountryISO = parsed.country.toUpperCase();

    if (phoneCountryISO === expectedCountryISO) {
      return { hasPhone: true, matches: true };
    }

    return {
      hasPhone: true,
      matches: false,
      reason: `Phone country (${parsed.country}) does not match contact country (${expectedCountry})`
    };
  } catch (error) {
    return {
      hasPhone: true,
      matches: false,
      reason: 'Invalid phone number format'
    };
  }
}

const COUNTRY_ALIASES: Record<string, string> = {
  'UK': 'GB',
  'UAE': 'AE',
  'KSA': 'SA',
  'USA': 'US',
  'ROK': 'KR',
  'PRC': 'CN',
  'ROC': 'TW'
};

function convertToISO(country: string | null | undefined): string {
  if (!country) return '';

  let normalized = country
    .trim()
    .replace(/[.\-_\s]+/g, ' ')
    .trim()
    .toUpperCase();

  if (COUNTRY_ALIASES[normalized]) {
    return COUNTRY_ALIASES[normalized];
  }

  if (normalized.length === 2) {
    const verifyAlpha2 = countries.getName(normalized, 'en');
    if (verifyAlpha2) {
      return normalized;
    }
  }

  if (normalized.length === 3) {
    try {
      const alpha2 = countries.alpha3ToAlpha2(normalized);
      if (alpha2) {
        return alpha2.toUpperCase();
      }
    } catch (e) {
    }
  }

  const isoCode = countries.getAlpha2Code(country.trim(), 'en');
  if (isoCode) {
    return isoCode.toUpperCase();
  }

  return '';
}

export function getEnrichmentNeeds(contact: VerificationContact): {
  needsAddressEnrichment: boolean;
  needsPhoneEnrichment: boolean;
  skipReasons: string[];
} {
  const addressCheck = hasMatchingAddress(contact);
  const phoneCheck = hasMatchingPhone(contact);
  const skipReasons: string[] = [];

  const needsAddressEnrichment = !addressCheck.geographyMatches;
  const needsPhoneEnrichment = !phoneCheck.geographyMatches;

  if (addressCheck.geographyMatches) {
    skipReasons.push(`Address complete (source: ${addressCheck.source})`);
  }

  if (phoneCheck.geographyMatches) {
    skipReasons.push(`Phone complete (source: ${phoneCheck.source})`);
  }

  return {
    needsAddressEnrichment,
    needsPhoneEnrichment,
    skipReasons
  };
}
