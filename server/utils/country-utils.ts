/**
 * Shared Country Utilities
 *
 * Single source of truth for country normalization, calling-region validation,
 * phone-to-country inference, and dial-prefix lookup.
 *
 * All dialer systems (AI orchestrator, autonomous dialer, WS runner) MUST
 * import from here instead of maintaining their own copies.
 */

import {
  detectContactTimezone,
  isWithinBusinessHours,
  getBusinessHoursForCountry,
} from './business-hours';

// ────────────────────────────────────────────────────────────────────────────
// Country key sets
// ────────────────────────────────────────────────────────────────────────────

export const UK_COUNTRY_KEYS = new Set<string>([
  'GB', 'UK', 'UNITED KINGDOM', 'UNITED KINGDOM UK',
  'GREAT BRITAIN', 'ENGLAND', 'SCOTLAND', 'WALES',
]);

export const US_COUNTRY_KEYS = new Set<string>([
  'US', 'USA', 'AMERICA', 'UNITED STATES', 'UNITED STATES OF AMERICA',
  'UNITEDSTATES', 'UNITEDSTATESOFAMERICA', 'U S A',
  'UNITEDF STATES', 'UNITED STATE', 'UNTED STATES',
  'UNITD STATES', 'UNTIED STATES', 'UITED STATES',
]);

const MIDDLE_EAST_COUNTRY_KEYS = new Set<string>([
  'AE', 'UNITED ARAB EMIRATES', 'UAE', 'DUBAI',
  'SA', 'SAUDI ARABIA', 'KSA',
]);

// ────────────────────────────────────────────────────────────────────────────
// Enabled calling regions – SINGLE definition shared across all dialers
// ────────────────────────────────────────────────────────────────────────────

const ENABLED_CALLING_REGIONS: Record<string, boolean> = {
  // Australia / NZ
  'AU': true, 'AUSTRALIA': true,
  'NZ': true, 'NEW ZEALAND': true,

  // Middle East (Sun-Thu work week)
  'AE': true, 'UNITED ARAB EMIRATES': true, 'UAE': true, 'DUBAI': true,
  'SA': true, 'SAUDI ARABIA': true,
  'IL': true, 'ISRAEL': true,
  'QA': true, 'QATAR': true,
  'KW': true, 'KUWAIT': true,
  'BH': true, 'BAHRAIN': true,
  'OM': true, 'OMAN': true,

  // North America
  'US': true, 'USA': true, 'UNITED STATES': true, 'AMERICA': true,
  'CA': true, 'CANADA': true,
  'MX': true, 'MEXICO': true,

  // United Kingdom / Ireland (common data variants)
  'GB': true, 'UK': true, 'UNITED KINGDOM': true, 'UNITED KINGDOM UK': true,
  'ENGLAND': true, 'SCOTLAND': true, 'WALES': true,
  'IE': true, 'IRELAND': true,

  // Europe (Major Markets)
  'DE': true, 'GERMANY': true,
  'FR': true, 'FRANCE': true,
  'IT': true, 'ITALY': true,
  'ES': true, 'SPAIN': true,
  'NL': true, 'NETHERLANDS': true,
  'BE': true, 'BELGIUM': true,
  'CH': true, 'SWITZERLAND': true,
  'AT': true, 'AUSTRIA': true,
  'SE': true, 'SWEDEN': true,
  'NO': true, 'NORWAY': true,
  'DK': true, 'DENMARK': true,
  'FI': true, 'FINLAND': true,
  'PL': true, 'POLAND': true,
  'PT': true, 'PORTUGAL': true,
  'CZ': true, 'CZECHIA': true, 'CZECH REPUBLIC': true,
  'GR': true, 'GREECE': true,
  'RO': true, 'ROMANIA': true,
  'HU': true, 'HUNGARY': true,
  'BG': true, 'BULGARIA': true,
  'HR': true, 'CROATIA': true,
  'SK': true, 'SLOVAKIA': true,
  'LU': true, 'LUXEMBOURG': true,
  'LT': true, 'LITHUANIA': true,
  'LV': true, 'LATVIA': true,
  'EE': true, 'ESTONIA': true,

  // Asia / Pacific
  'SG': true, 'SINGAPORE': true,
  'HK': true, 'HONG KONG': true,
  'JP': true, 'JAPAN': true,
  'KR': true, 'SOUTH KOREA': true,
  'IN': true, 'INDIA': true,
  'CN': true, 'CHINA': true,
  'TW': true, 'TAIWAN': true,
  'MY': true, 'MALAYSIA': true,
  'PH': true, 'PHILIPPINES': true,
  'TH': true, 'THAILAND': true,
  'VN': true, 'VIETNAM': true,
  'ID': true, 'INDONESIA': true,

  // South America / LATAM
  'BR': true, 'BRAZIL': true,
  'AR': true, 'ARGENTINA': true,
  'CL': true, 'CHILE': true,
  'CO': true, 'COLOMBIA': true,
  'PE': true, 'PERU': true,

  // Africa
  'ZA': true, 'SOUTH AFRICA': true,
};

// ────────────────────────────────────────────────────────────────────────────
// Country typo / alias normalization
// ────────────────────────────────────────────────────────────────────────────

const COUNTRY_TYPOS: Record<string, string> = {
  // United States typos
  'UNITEDF STATES': 'UNITED STATES',
  'UNITEDSTATES': 'UNITED STATES',
  'UNITED STATE': 'UNITED STATES',
  'UNTED STATES': 'UNITED STATES',
  'UNITD STATES': 'UNITED STATES',
  'UNTIED STATES': 'UNITED STATES',
  'UITED STATES': 'UNITED STATES',
  'UNITEDSTATESOFAMERICA': 'UNITED STATES',
  'U.S.A.': 'USA',
  'U.S.A': 'USA',
  'U.S.': 'US',
  'U.S': 'US',
  'U S A': 'USA',
  'UNITED STATES OF AMERICA': 'UNITED STATES',

  // United Kingdom typos
  'UITED KINGDOM': 'UNITED KINGDOM',
  'UNTED KINGDOM': 'UNITED KINGDOM',
  'UNITD KINGDOM': 'UNITED KINGDOM',
  'UNITED KINGDON': 'UNITED KINGDOM',
  'UNITED KINGOM': 'UNITED KINGDOM',
  'UNITEDKINGDOM': 'UNITED KINGDOM',
  'U.K.': 'UK',
  'U.K': 'UK',
  'GREAT BRITAIN': 'UNITED KINGDOM',
  'BRITAIN': 'UNITED KINGDOM',

  // Other common typos
  'AUSTRLIA': 'AUSTRALIA',
  'AUSTRALA': 'AUSTRALIA',
  'AUSTALIA': 'AUSTRALIA',
  'CANDA': 'CANADA',
  'CANANDA': 'CANADA',
  'GEMANY': 'GERMANY',
  'GERAMNY': 'GERMANY',
  'FRNCE': 'FRANCE',
  'INDAI': 'INDIA',
};

const COUNTRY_ALIASES: Record<string, string> = {
  'REPUBLIC OF INDONESIA': 'INDONESIA',
  'REPUBLIC OF INDIA': 'INDIA',
  "PEOPLE'S REPUBLIC OF CHINA": 'CHINA',
  'REPUBLIC OF CHINA': 'TAIWAN',
  'KINGDOM OF SAUDI ARABIA': 'SAUDI ARABIA',
  'KINGDOM OF BAHRAIN': 'BAHRAIN',
  'STATE OF QATAR': 'QATAR',
  'STATE OF KUWAIT': 'KUWAIT',
  'SULTANATE OF OMAN': 'OMAN',
  'COMMONWEALTH OF AUSTRALIA': 'AUSTRALIA',
  'NEW SOUTH WALES': 'AUSTRALIA',
  'VICTORIA': 'AUSTRALIA',
  'QUEENSLAND': 'AUSTRALIA',
  'NORTHERN IRELAND': 'UNITED KINGDOM',
  'HONG KONG SAR': 'HONG KONG',
  'HONG KONG S.A.R.': 'HONG KONG',
  'MACAO': 'HONG KONG',
  'MACAU': 'HONG KONG',
};

// ────────────────────────────────────────────────────────────────────────────
// Country dial prefix map
// ────────────────────────────────────────────────────────────────────────────

export const COUNTRY_DIAL_PREFIX: Record<string, string> = {
  'GB': '+44', 'UK': '+44', 'UNITED KINGDOM': '+44', 'ENGLAND': '+44', 'SCOTLAND': '+44', 'WALES': '+44',
  'US': '+1', 'USA': '+1', 'UNITED STATES': '+1', 'AMERICA': '+1',
  'CA': '+1', 'CANADA': '+1',
  'AU': '+61', 'AUSTRALIA': '+61',
  'NZ': '+64', 'NEW ZEALAND': '+64',
  'DE': '+49', 'GERMANY': '+49',
  'FR': '+33', 'FRANCE': '+33',
  'IT': '+39', 'ITALY': '+39',
  'ES': '+34', 'SPAIN': '+34',
  'NL': '+31', 'NETHERLANDS': '+31',
  'BE': '+32', 'BELGIUM': '+32',
  'CH': '+41', 'SWITZERLAND': '+41',
  'AT': '+43', 'AUSTRIA': '+43',
  'SE': '+46', 'SWEDEN': '+46',
  'NO': '+47', 'NORWAY': '+47',
  'DK': '+45', 'DENMARK': '+45',
  'FI': '+358', 'FINLAND': '+358',
  'PL': '+48', 'POLAND': '+48',
  'PT': '+351', 'PORTUGAL': '+351',
  'IE': '+353', 'IRELAND': '+353',
  'CZ': '+420', 'CZECH REPUBLIC': '+420', 'CZECHIA': '+420',
  'GR': '+30', 'GREECE': '+30',
  'AE': '+971', 'UNITED ARAB EMIRATES': '+971', 'UAE': '+971',
  'SA': '+966', 'SAUDI ARABIA': '+966',
  'IL': '+972', 'ISRAEL': '+972',
  'QA': '+974', 'QATAR': '+974',
  'KW': '+965', 'KUWAIT': '+965',
  'BH': '+973', 'BAHRAIN': '+973',
  'OM': '+968', 'OMAN': '+968',
  'IN': '+91', 'INDIA': '+91',
  'CN': '+86', 'CHINA': '+86',
  'JP': '+81', 'JAPAN': '+81',
  'KR': '+82', 'SOUTH KOREA': '+82',
  'SG': '+65', 'SINGAPORE': '+65',
  'HK': '+852', 'HONG KONG': '+852',
  'MY': '+60', 'MALAYSIA': '+60',
  'PH': '+63', 'PHILIPPINES': '+63',
  'TH': '+66', 'THAILAND': '+66',
  'VN': '+84', 'VIETNAM': '+84',
  'ID': '+62', 'INDONESIA': '+62',
  'TW': '+886', 'TAIWAN': '+886',
  'BR': '+55', 'BRAZIL': '+55',
  'AR': '+54', 'ARGENTINA': '+54',
  'CL': '+56', 'CHILE': '+56',
  'CO': '+57', 'COLOMBIA': '+57',
  'MX': '+52', 'MEXICO': '+52',
  'PE': '+51', 'PERU': '+51',
  'ZA': '+27', 'SOUTH AFRICA': '+27',
};

// ────────────────────────────────────────────────────────────────────────────
// Phone prefix → country inference (sorted longest prefix first)
// ────────────────────────────────────────────────────────────────────────────

const PHONE_PREFIX_MAP: Array<{ prefix: string; country: string }> = [
  { prefix: '+971', country: 'AE' }, { prefix: '+966', country: 'SA' }, { prefix: '+972', country: 'IL' },
  { prefix: '+974', country: 'QA' }, { prefix: '+965', country: 'KW' }, { prefix: '+973', country: 'BH' },
  { prefix: '+968', country: 'OM' }, { prefix: '+886', country: 'TW' }, { prefix: '+852', country: 'HK' },
  { prefix: '+420', country: 'CZ' }, { prefix: '+358', country: 'FI' }, { prefix: '+353', country: 'IE' },
  { prefix: '+351', country: 'PT' },
  { prefix: '+44', country: 'GB' }, { prefix: '+1', country: 'US' }, { prefix: '+61', country: 'AU' },
  { prefix: '+64', country: 'NZ' }, { prefix: '+65', country: 'SG' }, { prefix: '+81', country: 'JP' },
  { prefix: '+82', country: 'KR' }, { prefix: '+91', country: 'IN' }, { prefix: '+86', country: 'CN' },
  { prefix: '+60', country: 'MY' }, { prefix: '+63', country: 'PH' }, { prefix: '+66', country: 'TH' },
  { prefix: '+84', country: 'VN' }, { prefix: '+62', country: 'ID' }, { prefix: '+55', country: 'BR' },
  { prefix: '+54', country: 'AR' }, { prefix: '+56', country: 'CL' }, { prefix: '+57', country: 'CO' },
  { prefix: '+51', country: 'PE' }, { prefix: '+27', country: 'ZA' }, { prefix: '+49', country: 'DE' },
  { prefix: '+33', country: 'FR' }, { prefix: '+39', country: 'IT' }, { prefix: '+34', country: 'ES' },
  { prefix: '+31', country: 'NL' }, { prefix: '+32', country: 'BE' }, { prefix: '+41', country: 'CH' },
  { prefix: '+43', country: 'AT' }, { prefix: '+46', country: 'SE' }, { prefix: '+47', country: 'NO' },
  { prefix: '+45', country: 'DK' }, { prefix: '+48', country: 'PL' }, { prefix: '+30', country: 'GR' },
  { prefix: '+52', country: 'MX' },
].sort((a, b) => b.prefix.length - a.prefix.length);

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Normalize country name/code – handles typos, aliases, parenthetical notes,
 * and punctuation variants.  Returns the canonical UPPER-CASE form that the
 * rest of the system can use for look-ups.
 */
export function normalizeCountryName(country: string): string {
  const normalized = country.toUpperCase().trim();
  return COUNTRY_TYPOS[normalized] || normalized;
}

/**
 * Check whether a country string represents the United States.
 * Handles typos, punctuation, parenthetical notes, etc.
 */
export function isUnitedStatesCountry(country: string | null | undefined): boolean {
  if (!country) return false;

  const raw = String(country).toUpperCase().trim();
  if (!raw) return false;

  const noParens = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const alnumWithSpace = raw.replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const compact = raw.replace(/[^A-Z0-9]/g, '');
  const candidates = Array.from(new Set([raw, noParens, alnumWithSpace, compact].filter(Boolean)));

  for (const candidate of candidates) {
    if (US_COUNTRY_KEYS.has(candidate)) return true;
    const normalized = normalizeCountryName(candidate);
    if (US_COUNTRY_KEYS.has(normalized)) return true;
    const normalizedCompact = normalized.replace(/[^A-Z0-9]/g, '');
    if (US_COUNTRY_KEYS.has(normalizedCompact)) return true;
  }

  return false;
}

/**
 * Check if a country string represents the United Kingdom.
 */
export function isUnitedKingdomCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  const raw = String(country).toUpperCase().trim();
  if (!raw) return false;
  if (UK_COUNTRY_KEYS.has(raw)) return true;
  const normalized = normalizeCountryName(raw);
  if (UK_COUNTRY_KEYS.has(normalized)) return true;
  // Handle "(UK)" suffix, "United Kingdom (UK)" etc.
  const noParens = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (UK_COUNTRY_KEYS.has(noParens)) return true;
  return false;
}

/**
 * Check if a country string represents a Middle East country (Sun-Thu work week).
 */
export function isMiddleEastCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  return MIDDLE_EAST_COUNTRY_KEYS.has(String(country).toUpperCase().trim());
}

/**
 * Check if a contact's country is in an enabled calling region.
 * Handles typos, aliases, long-form names, parenthetical notes, etc.
 */
export function isCountryEnabled(country: string | null | undefined): boolean {
  if (!country) return false;

  const raw = country.toString().trim().toUpperCase();
  if (!raw) return false;

  const noParens = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const alnumOnly = raw.replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const candidates = Array.from(new Set([raw, noParens, alnumOnly].filter(Boolean)));

  // Try direct and typo-normalized forms
  for (const cleaned of candidates) {
    if (ENABLED_CALLING_REGIONS[cleaned] === true) return true;
    const normalizedCountry = normalizeCountryName(cleaned);
    if (ENABLED_CALLING_REGIONS[normalizedCountry] === true) return true;
  }

  // Try aliases
  for (const cleaned of candidates) {
    if (COUNTRY_ALIASES[cleaned]) {
      const aliased = COUNTRY_ALIASES[cleaned];
      if (ENABLED_CALLING_REGIONS[aliased] === true) return true;
    }
  }

  return false;
}

/**
 * Infer country ISO code from E.164 phone prefix when country metadata is
 * missing. Returns canonical country code or null.
 */
export function inferCountryFromPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/[^\d+]/g, '');
  let e164 = digits;
  if (e164.startsWith('00')) {
    e164 = `+${e164.slice(2)}`;
  } else if (!e164.startsWith('+') && /^\d+$/.test(e164)) {
    if (e164.startsWith('971')) e164 = `+${e164}`;
    else if (e164.startsWith('44')) e164 = `+${e164}`;
    else if (e164.startsWith('1')) e164 = `+${e164}`;
    // 10-digit NANP (US/Canada)
    else if (/^[2-9]\d{9}$/.test(e164)) return 'US';
  }
  if (!e164.startsWith('+')) return null;

  const match = PHONE_PREFIX_MAP.find(p => e164.startsWith(p.prefix));
  return match?.country ?? null;
}

/**
 * Get the E.164 dial prefix for a country string.
 */
export function getDialPrefix(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_DIAL_PREFIX[country.toUpperCase().trim()] ?? null;
}

/**
 * Check if a phone matches the expected country dial prefix.
 */
export function phoneMatchesCountry(e164Phone: string, country: string | null | undefined): boolean {
  if (!country || !e164Phone) return true;
  const prefix = COUNTRY_DIAL_PREFIX[country.toUpperCase().trim()];
  if (!prefix) return true;
  return e164Phone.startsWith(prefix);
}

/**
 * Return the phone type priority for a given E.164 number.
 *  1 = UK mobile (+447)
 *  2 = UK landline (+441/2/3)
 *  3 = USA/Canada (+1, 12 digits)
 *  0 = other
 */
export function getPhonePriority(phone: string | null | undefined): number {
  if (!phone) return 0;
  const cleaned = phone.replace(/[^\d+]/g, '');
  const e164 = cleaned.startsWith('+') ? cleaned : '+' + cleaned;

  if (e164.startsWith('+447')) return 1;
  if (e164.startsWith('+441') || e164.startsWith('+442') || e164.startsWith('+443')) return 2;
  if (e164.startsWith('+1') && e164.length === 12) return 3;
  return 0;
}

/**
 * Resolve the best phone number for a contact, respecting country geography.
 * Priority: mobile → direct → HQ
 */
export function resolvePhoneForContact(
  mobilePhone: string | null,
  directPhone: string | null,
  hqPhone: string | null,
  contactCountry: string | null | undefined,
): { phone: string; priority: number; source: string } | null {
  const candidates: Array<{ phone: string; basePriority: number; source: string }> = [];
  if (mobilePhone) candidates.push({ phone: mobilePhone, basePriority: 1, source: 'mobile' });
  if (directPhone) candidates.push({ phone: directPhone, basePriority: 3, source: 'direct' });
  if (hqPhone) candidates.push({ phone: hqPhone, basePriority: 7, source: 'hq' });

  if (candidates.length === 0) return null;

  for (const c of candidates) {
    if (phoneMatchesCountry(c.phone, contactCountry)) {
      const ukPriority = getPhonePriority(c.phone);
      return {
        phone: c.phone,
        priority: ukPriority > 0 ? ukPriority : c.basePriority,
        source: c.source,
      };
    }
  }

  const first = candidates[0];
  return {
    phone: first.phone,
    priority: first.basePriority + 10,
    source: first.source + ':country_mismatch',
  };
}

/**
 * Contact call priority check — shared implementation for all dialer systems.
 * Uses business hours to determine if a contact can be called right now.
 */
export function getContactCallPriority(
  contact: { country?: string | null; state?: string | null; timezone?: string | null },
): { canCallNow: boolean; priority: number; timezone: string | null; reason?: string } {
  const timezone = detectContactTimezone({
    country: contact.country || undefined,
    state: contact.state || undefined,
    timezone: contact.timezone || undefined,
  });

  if (!timezone) {
    return { canCallNow: false, priority: 0, timezone: null, reason: 'Unknown timezone' };
  }

  const config = getBusinessHoursForCountry(contact.country);
  config.timezone = timezone;
  config.respectContactTimezone = false;

  const canCallNow = isWithinBusinessHours(config, undefined, new Date());
  return {
    canCallNow,
    priority: canCallNow ? 100 : 50,
    timezone,
    reason: canCallNow ? undefined : `Outside business hours (${config.startTime}-${config.endTime} ${timezone})`,
  };
}
