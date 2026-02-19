import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';
import { isWeekend, getDay, parse, isWithinInterval } from 'date-fns';

export interface BusinessHoursConfig {
  enabled: boolean;
  timezone: string; // Campaign timezone (e.g., 'America/New_York')
  operatingDays: string[]; // e.g., ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  startTime: string; // e.g., '09:00' (24-hour format)
  endTime: string; // e.g., '17:00' (24-hour format)
  respectContactTimezone: boolean; // If true, use contact's timezone; if false, use campaign timezone
  excludedDates?: string[]; // e.g., ['2024-12-25', '2024-01-01'] - holidays
}

export interface ContactTimezoneInfo {
  timezone?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

/**
 * Default business hours configuration (Western Mon-Fri)
 */
export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  enabled: true,
  timezone: 'America/New_York',
  operatingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  startTime: '09:00',
  endTime: '17:00',
  respectContactTimezone: true,
  excludedDates: [],
};

/**
 * Middle East business hours (Sun-Thu work week)
 */
export const MIDDLE_EAST_BUSINESS_HOURS: BusinessHoursConfig = {
  enabled: true,
  timezone: 'Asia/Dubai', // Will be overridden per country
  operatingDays: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
  startTime: '09:00',
  endTime: '17:00',
  respectContactTimezone: true,
  excludedDates: [],
};

/**
 * Countries that use Sunday-Thursday work week
 */
const MIDDLE_EAST_COUNTRIES = new Set([
  'AE', 'UNITED ARAB EMIRATES', 'UAE', 'DUBAI',
  'SA', 'SAUDI ARABIA', 'KSA'
]);

/**
 * Get country-specific business hours config
 */
export function getBusinessHoursForCountry(countryCode: string | null | undefined): BusinessHoursConfig {
  if (!countryCode) return DEFAULT_BUSINESS_HOURS;
  
  const normalized = countryCode.toUpperCase().trim();
  
  if (MIDDLE_EAST_COUNTRIES.has(normalized)) {
    return { ...MIDDLE_EAST_BUSINESS_HOURS };
  }
  
  return { ...DEFAULT_BUSINESS_HOURS };
}

/**
 * Common US federal holidays (can be customized)
 */
export const US_FEDERAL_HOLIDAYS_2024_2025 = [
  '2024-01-01', // New Year's Day
  '2024-01-15', // MLK Day
  '2024-02-19', // Presidents' Day
  '2024-05-27', // Memorial Day
  '2024-07-04', // Independence Day
  '2024-09-02', // Labor Day
  '2024-10-14', // Columbus Day
  '2024-11-11', // Veterans Day
  '2024-11-28', // Thanksgiving
  '2024-12-25', // Christmas
  '2025-01-01', // New Year's Day
  '2025-01-20', // MLK Day
  '2025-02-17', // Presidents' Day
  '2025-05-26', // Memorial Day
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-10-13', // Columbus Day
  '2025-11-11', // Veterans Day
  '2025-11-27', // Thanksgiving
  '2025-12-25', // Christmas
];

/**
 * Detect timezone from contact's location data
 */
export function detectContactTimezone(contact: ContactTimezoneInfo): string | null {
  // If contact already has timezone, use it
  if (contact.timezone) {
    return contact.timezone;
  }

  // Map US states to timezones
  const usStateTimezoneMap: Record<string, string> = {
    // Eastern Time
    'CT': 'America/New_York', 'DE': 'America/New_York', 'FL': 'America/New_York',
    'GA': 'America/New_York', 'ME': 'America/New_York', 'MD': 'America/New_York',
    'MA': 'America/New_York', 'NH': 'America/New_York', 'NJ': 'America/New_York',
    'NY': 'America/New_York', 'NC': 'America/New_York', 'OH': 'America/New_York',
    'PA': 'America/New_York', 'RI': 'America/New_York', 'SC': 'America/New_York',
    'VT': 'America/New_York', 'VA': 'America/New_York', 'WV': 'America/New_York',
    // Central Time
    'AL': 'America/Chicago', 'AR': 'America/Chicago', 'IL': 'America/Chicago',
    'IA': 'America/Chicago', 'KS': 'America/Chicago', 'KY': 'America/Chicago',
    'LA': 'America/Chicago', 'MN': 'America/Chicago', 'MS': 'America/Chicago',
    'MO': 'America/Chicago', 'NE': 'America/Chicago', 'ND': 'America/Chicago',
    'OK': 'America/Chicago', 'SD': 'America/Chicago', 'TN': 'America/Chicago',
    'TX': 'America/Chicago', 'WI': 'America/Chicago',
    // Mountain Time
    'AZ': 'America/Phoenix', // Arizona doesn't observe DST
    'CO': 'America/Denver', 'ID': 'America/Denver', 'MT': 'America/Denver',
    'NM': 'America/Denver', 'UT': 'America/Denver', 'WY': 'America/Denver',
    // Pacific Time
    'CA': 'America/Los_Angeles', 'NV': 'America/Los_Angeles',
    'OR': 'America/Los_Angeles', 'WA': 'America/Los_Angeles',
    // Alaska & Hawaii
    'AK': 'America/Anchorage',
    'HI': 'Pacific/Honolulu',
  };

  // Map Canadian provinces to timezones
  const canadaProvinceTimezoneMap: Record<string, string> = {
    // Atlantic Time
    'NB': 'America/Halifax', 'NEW BRUNSWICK': 'America/Halifax',
    'NS': 'America/Halifax', 'NOVA SCOTIA': 'America/Halifax',
    'PE': 'America/Halifax', 'PEI': 'America/Halifax', 'PRINCE EDWARD ISLAND': 'America/Halifax',
    // Newfoundland (30min offset)
    'NL': 'America/St_Johns', 'NEWFOUNDLAND': 'America/St_Johns', 'NEWFOUNDLAND AND LABRADOR': 'America/St_Johns',
    // Eastern Time
    'ON': 'America/Toronto', 'ONTARIO': 'America/Toronto',
    'QC': 'America/Toronto', 'QUEBEC': 'America/Toronto',
    // Central Time
    'MB': 'America/Winnipeg', 'MANITOBA': 'America/Winnipeg',
    'SK': 'America/Regina', 'SASKATCHEWAN': 'America/Regina', // No DST
    // Mountain Time
    'AB': 'America/Edmonton', 'ALBERTA': 'America/Edmonton',
    // Pacific Time
    'BC': 'America/Vancouver', 'BRITISH COLUMBIA': 'America/Vancouver',
    // Northern Territories
    'NT': 'America/Yellowknife', 'NORTHWEST TERRITORIES': 'America/Yellowknife',
    'YT': 'America/Whitehorse', 'YUKON': 'America/Whitehorse',
    'NU': 'America/Iqaluit', 'NUNAVUT': 'America/Iqaluit',
  };

  // Map Australian states to timezones
  const australiaStateTimezoneMap: Record<string, string> = {
    // Eastern Time (AEST/AEDT)
    'NSW': 'Australia/Sydney', 'NEW SOUTH WALES': 'Australia/Sydney',
    'VIC': 'Australia/Melbourne', 'VICTORIA': 'Australia/Melbourne',
    'QLD': 'Australia/Brisbane', 'QUEENSLAND': 'Australia/Brisbane', // No DST
    'ACT': 'Australia/Sydney', 'AUSTRALIAN CAPITAL TERRITORY': 'Australia/Sydney',
    'TAS': 'Australia/Hobart', 'TASMANIA': 'Australia/Hobart',
    // Central Time (ACST/ACDT)
    'SA': 'Australia/Adelaide', 'SOUTH AUSTRALIA': 'Australia/Adelaide',
    'NT': 'Australia/Darwin', 'NORTHERN TERRITORY': 'Australia/Darwin', // No DST
    // Western Time (AWST)
    'WA': 'Australia/Perth', 'WESTERN AUSTRALIA': 'Australia/Perth',
  };

  // Try to detect from state (for US, Canada, Australia)
  if (contact.state) {
    const stateUpper = contact.state.toUpperCase().trim();
    const countryUpper = contact.country?.toUpperCase().trim();
    
    // Check US states
    if (!countryUpper || countryUpper === 'US' || countryUpper === 'USA' || countryUpper === 'UNITED STATES') {
      if (usStateTimezoneMap[stateUpper]) {
        return usStateTimezoneMap[stateUpper];
      }
    }
    
    // Check Canadian provinces
    if (!countryUpper || countryUpper === 'CA' || countryUpper === 'CANADA') {
      if (canadaProvinceTimezoneMap[stateUpper]) {
        return canadaProvinceTimezoneMap[stateUpper];
      }
    }
    
    // Check Australian states
    if (!countryUpper || countryUpper === 'AU' || countryUpper === 'AUSTRALIA') {
      if (australiaStateTimezoneMap[stateUpper]) {
        return australiaStateTimezoneMap[stateUpper];
      }
    }
    
    // Fallback to generic state lookup (for ambiguous cases)
    if (usStateTimezoneMap[stateUpper]) {
      return usStateTimezoneMap[stateUpper];
    }
    if (canadaProvinceTimezoneMap[stateUpper]) {
      return canadaProvinceTimezoneMap[stateUpper];
    }
    if (australiaStateTimezoneMap[stateUpper]) {
      return australiaStateTimezoneMap[stateUpper];
    }
  }

  // Comprehensive country to timezone mapping
  const countryTimezoneMap: Record<string, string> = {
    // United Kingdom
    'GB': 'Europe/London', 'UK': 'Europe/London', 'UNITED KINGDOM': 'Europe/London',
    'ENGLAND': 'Europe/London', 'SCOTLAND': 'Europe/London', 'WALES': 'Europe/London',
    'GREAT BRITAIN': 'Europe/London', 'UNITED KINGDOM UK': 'Europe/London',
    
    // United States
    'US': 'America/New_York', 'USA': 'America/New_York', 'UNITED STATES': 'America/New_York',
    'AMERICA': 'America/New_York',
    
    // Canada
    'CA': 'America/Toronto', 'CANADA': 'America/Toronto',
    
    // Western Europe
    'DE': 'Europe/Berlin', 'GERMANY': 'Europe/Berlin',
    'FR': 'Europe/Paris', 'FRANCE': 'Europe/Paris',
    'ES': 'Europe/Madrid', 'SPAIN': 'Europe/Madrid',
    'IT': 'Europe/Rome', 'ITALY': 'Europe/Rome',
    'NL': 'Europe/Amsterdam', 'NETHERLANDS': 'Europe/Amsterdam', 'HOLLAND': 'Europe/Amsterdam',
    'BE': 'Europe/Brussels', 'BELGIUM': 'Europe/Brussels',
    'CH': 'Europe/Zurich', 'SWITZERLAND': 'Europe/Zurich',
    'AT': 'Europe/Vienna', 'AUSTRIA': 'Europe/Vienna',
    'PT': 'Europe/Lisbon', 'PORTUGAL': 'Europe/Lisbon',
    'IE': 'Europe/Dublin', 'IRELAND': 'Europe/Dublin',
    'LU': 'Europe/Luxembourg', 'LUXEMBOURG': 'Europe/Luxembourg',
    
    // Nordic
    'SE': 'Europe/Stockholm', 'SWEDEN': 'Europe/Stockholm',
    'NO': 'Europe/Oslo', 'NORWAY': 'Europe/Oslo',
    'DK': 'Europe/Copenhagen', 'DENMARK': 'Europe/Copenhagen',
    'FI': 'Europe/Helsinki', 'FINLAND': 'Europe/Helsinki',
    
    // Eastern Europe
    'PL': 'Europe/Warsaw', 'POLAND': 'Europe/Warsaw',
    'CZ': 'Europe/Prague', 'CZECH REPUBLIC': 'Europe/Prague', 'CZECHIA': 'Europe/Prague',
    'RO': 'Europe/Bucharest', 'ROMANIA': 'Europe/Bucharest',
    'HU': 'Europe/Budapest', 'HUNGARY': 'Europe/Budapest',
    'GR': 'Europe/Athens', 'GREECE': 'Europe/Athens',
    'BG': 'Europe/Sofia', 'BULGARIA': 'Europe/Sofia',
    'UA': 'Europe/Kyiv', 'UKRAINE': 'Europe/Kyiv',
    'RU': 'Europe/Moscow', 'RUSSIA': 'Europe/Moscow', 'RUSSIAN FEDERATION': 'Europe/Moscow',
    
    // Australia & New Zealand
    'AU': 'Australia/Sydney', 'AUSTRALIA': 'Australia/Sydney',
    'NZ': 'Pacific/Auckland', 'NEW ZEALAND': 'Pacific/Auckland',
    
    // Asia
    'JP': 'Asia/Tokyo', 'JAPAN': 'Asia/Tokyo',
    'KR': 'Asia/Seoul', 'SOUTH KOREA': 'Asia/Seoul', 'KOREA': 'Asia/Seoul',
    'CN': 'Asia/Shanghai', 'CHINA': 'Asia/Shanghai',
    'HK': 'Asia/Hong_Kong', 'HONG KONG': 'Asia/Hong_Kong',
    'SG': 'Asia/Singapore', 'SINGAPORE': 'Asia/Singapore',
    'IN': 'Asia/Kolkata', 'INDIA': 'Asia/Kolkata',
    'MY': 'Asia/Kuala_Lumpur', 'MALAYSIA': 'Asia/Kuala_Lumpur',
    'TH': 'Asia/Bangkok', 'THAILAND': 'Asia/Bangkok',
    'PH': 'Asia/Manila', 'PHILIPPINES': 'Asia/Manila',
    'ID': 'Asia/Jakarta', 'INDONESIA': 'Asia/Jakarta',
    'VN': 'Asia/Ho_Chi_Minh', 'VIETNAM': 'Asia/Ho_Chi_Minh',
    'TW': 'Asia/Taipei', 'TAIWAN': 'Asia/Taipei',
    'PK': 'Asia/Karachi', 'PAKISTAN': 'Asia/Karachi',
    'BD': 'Asia/Dhaka', 'BANGLADESH': 'Asia/Dhaka',
    
    // Middle East
    'AE': 'Asia/Dubai', 'UNITED ARAB EMIRATES': 'Asia/Dubai', 'UAE': 'Asia/Dubai', 'DUBAI': 'Asia/Dubai',
    'SA': 'Asia/Riyadh', 'SAUDI ARABIA': 'Asia/Riyadh',
    'IL': 'Asia/Jerusalem', 'ISRAEL': 'Asia/Jerusalem',
    'QA': 'Asia/Qatar', 'QATAR': 'Asia/Qatar',
    'KW': 'Asia/Kuwait', 'KUWAIT': 'Asia/Kuwait',
    'BH': 'Asia/Bahrain', 'BAHRAIN': 'Asia/Bahrain',
    'OM': 'Asia/Muscat', 'OMAN': 'Asia/Muscat',
    'TR': 'Europe/Istanbul', 'TURKEY': 'Europe/Istanbul', 'TURKIYE': 'Europe/Istanbul',
    
    // Africa
    'ZA': 'Africa/Johannesburg', 'SOUTH AFRICA': 'Africa/Johannesburg',
    'NG': 'Africa/Lagos', 'NIGERIA': 'Africa/Lagos',
    'EG': 'Africa/Cairo', 'EGYPT': 'Africa/Cairo',
    'KE': 'Africa/Nairobi', 'KENYA': 'Africa/Nairobi',
    'MA': 'Africa/Casablanca', 'MOROCCO': 'Africa/Casablanca',
    'GH': 'Africa/Accra', 'GHANA': 'Africa/Accra',
    'TZ': 'Africa/Dar_es_Salaam', 'TANZANIA': 'Africa/Dar_es_Salaam',
    
    // South America
    'BR': 'America/Sao_Paulo', 'BRAZIL': 'America/Sao_Paulo',
    'AR': 'America/Argentina/Buenos_Aires', 'ARGENTINA': 'America/Argentina/Buenos_Aires',
    'CL': 'America/Santiago', 'CHILE': 'America/Santiago',
    'CO': 'America/Bogota', 'COLOMBIA': 'America/Bogota',
    'MX': 'America/Mexico_City', 'MEXICO': 'America/Mexico_City',
    'PE': 'America/Lima', 'PERU': 'America/Lima',
    'VE': 'America/Caracas', 'VENEZUELA': 'America/Caracas',
    'EC': 'America/Guayaquil', 'ECUADOR': 'America/Guayaquil',
  };
  
  // Try to detect from country
  if (contact.country) {
    const countryUpper = contact.country.toUpperCase().trim();
    if (countryTimezoneMap[countryUpper]) {
      return countryTimezoneMap[countryUpper];
    }
    
    // CRITICAL FALLBACK: For major calling regions with broken/typo country data,
    // assume reasonable defaults to prevent contacts from being filtered out
    // This handles data quality issues where country is "United Kingdom (UK)" or similar
    const normalizedCountry = countryUpper.replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    
    // UK variations
    if (normalizedCountry.includes('UNITED') && normalizedCountry.includes('KINGDOM')) {
      return 'Europe/London';
    }
    if (normalizedCountry.includes('ENGLAND') || normalizedCountry.includes('SCOTLAND') || normalizedCountry.includes('WALES')) {
      return 'Europe/London';
    }
    
    // US variations
    if ((normalizedCountry.includes('UNITED') || normalizedCountry.includes('STATES')) && 
        (normalizedCountry.includes('STATES') || normalizedCountry.includes('AMERICA'))) {
      return 'America/New_York';
    }
    
    // Canada variations
    if (normalizedCountry.includes('CANADA') || normalizedCountry === 'CA') {
      return 'America/Toronto';
    }
  }

  return null; // Unknown timezone
}

/**
 * Check if a given time is within business hours
 */
export function isWithinBusinessHours(
  config: BusinessHoursConfig,
  contactInfo?: ContactTimezoneInfo,
  checkTime: Date = new Date()
): boolean {
  if (!config.enabled) {
    return true; // Business hours checking disabled
  }

  // Determine which timezone to use
  let targetTimezone = config.timezone;
  if (config.respectContactTimezone && contactInfo) {
    const contactTz = detectContactTimezone(contactInfo);
    if (contactTz) {
      targetTimezone = contactTz;
    }
  }

  // Convert current time to target timezone
  // IMPORTANT: toZonedTime already shifts the Date's internal time so that
  // local methods (.getHours, .getDay, etc.) return values in the target timezone.
  // Do NOT pass { timeZone } to format() after toZonedTime — that would double-convert.
  const zonedTime = toZonedTime(checkTime, targetTimezone);

  // Check if it's a working day
  const dayOfWeek = format(zonedTime, 'EEEE').toLowerCase();
  if (!config.operatingDays.includes(dayOfWeek)) {
    return false; // Not an operating day
  }

  // Check if it's a holiday
  const dateString = format(zonedTime, 'yyyy-MM-dd');
  if (config.excludedDates && config.excludedDates.includes(dateString)) {
    return false; // Holiday
  }

  // Check time range
  const currentTimeStr = format(zonedTime, 'HH:mm');

  // Parse start and end times for comparison
  if (currentTimeStr < config.startTime || currentTimeStr >= config.endTime) {
    return false; // Outside operating hours
  }

  return true; // Within business hours
}

/**
 * Calculate next available calling time
 */
export function getNextAvailableTime(
  config: BusinessHoursConfig,
  contactInfo?: ContactTimezoneInfo,
  fromTime: Date = new Date()
): Date {
  if (!config.enabled) {
    return fromTime; // Business hours disabled, can call anytime
  }

  // Determine which timezone to use
  let targetTimezone = config.timezone;
  if (config.respectContactTimezone && contactInfo) {
    const contactTz = detectContactTimezone(contactInfo);
    if (contactTz) {
      targetTimezone = contactTz;
    }
  }

  // Start from the next minute
  let checkTime = new Date(fromTime.getTime() + 60000);
  const maxIterations = 14 * 24 * 60; // Check up to 2 weeks ahead (in minutes)
  
  for (let i = 0; i < maxIterations; i++) {
    if (isWithinBusinessHours(config, contactInfo, checkTime)) {
      return checkTime;
    }
    
    // If we're outside hours, jump to start of next business day
    const zonedTime = toZonedTime(checkTime, targetTimezone);
    const currentTimeStr = format(zonedTime, 'HH:mm');
    
    // If past end time, jump to start time next day
    if (currentTimeStr >= config.endTime) {
      const nextDay = new Date(checkTime);
      nextDay.setDate(nextDay.getDate() + 1);
      
      // Parse start time and set it
      const [startHour, startMinute] = config.startTime.split(':').map(Number);
      const zonedNextDay = toZonedTime(nextDay, targetTimezone);
      zonedNextDay.setHours(startHour, startMinute, 0, 0);
      
      checkTime = fromZonedTime(zonedNextDay, targetTimezone);
    } else {
      // Before start time, jump to start time today
      const [startHour, startMinute] = config.startTime.split(':').map(Number);
      const zonedCheckTime = toZonedTime(checkTime, targetTimezone);
      zonedCheckTime.setHours(startHour, startMinute, 0, 0);
      
      checkTime = fromZonedTime(zonedCheckTime, targetTimezone);
    }
  }

  // Fallback: return 24 hours from now
  return new Date(fromTime.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Get business hours summary for display
 */
export function getBusinessHoursSummary(config: BusinessHoursConfig): string {
  if (!config.enabled) {
    return '24/7 (No restrictions)';
  }

  const days = config.operatingDays.map(d => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ');
  const hours = `${config.startTime} - ${config.endTime}`;
  const tz = config.timezone.split('/')[1]?.replace('_', ' ') || config.timezone;
  
  return `${days}: ${hours} ${tz}`;
}
