/**
 * Phone Number Formatting Utility
 * Formats phone numbers with country code prefix in the format: "country_code number"
 */

import { parsePhoneNumber, CountryCode } from 'libphonenumber-js';

// Comprehensive country-to-dial-code mapping
const COUNTRY_DIAL_CODES: Record<string, string> = {
  // A
  'Afghanistan': '93',
  'Albania': '355',
  'Algeria': '213',
  'Andorra': '376',
  'Angola': '244',
  'Argentina': '54',
  'Armenia': '374',
  'Australia': '61',
  'Austria': '43',
  'Azerbaijan': '994',
  
  // B
  'Bahrain': '973',
  'Bangladesh': '880',
  'Belarus': '375',
  'Belgium': '32',
  'Belize': '501',
  'Benin': '229',
  'Bhutan': '975',
  'Bolivia': '591',
  'Bosnia and Herzegovina': '387',
  'Botswana': '267',
  'Brazil': '55',
  'Brunei': '673',
  'Bulgaria': '359',
  'Burkina Faso': '226',
  'Burundi': '257',
  
  // C
  'Cambodia': '855',
  'Cameroon': '237',
  'Canada': '1',
  'Cape Verde': '238',
  'Central African Republic': '236',
  'Chad': '235',
  'Chile': '56',
  'China': '86',
  'Colombia': '57',
  'Comoros': '269',
  'Congo': '242',
  'Costa Rica': '506',
  'Croatia': '385',
  'Cuba': '53',
  'Cyprus': '357',
  'Czech Republic': '420',
  
  // D
  'Denmark': '45',
  'Djibouti': '253',
  'Dominican Republic': '1',
  
  // E
  'Ecuador': '593',
  'Egypt': '20',
  'El Salvador': '503',
  'Equatorial Guinea': '240',
  'Eritrea': '291',
  'Estonia': '372',
  'Ethiopia': '251',
  
  // F
  'Fiji': '679',
  'Finland': '358',
  'France': '33',
  
  // G
  'Gabon': '241',
  'Gambia': '220',
  'Georgia': '995',
  'Germany': '49',
  'Ghana': '233',
  'Greece': '30',
  'Grenada': '1',
  'Guatemala': '502',
  'Guinea': '224',
  'Guinea-Bissau': '245',
  'Guyana': '592',
  
  // H
  'Haiti': '509',
  'Honduras': '504',
  'Hong Kong': '852',
  'Hungary': '36',
  
  // I
  'Iceland': '354',
  'India': '91',
  'Indonesia': '62',
  'Iran': '98',
  'Iraq': '964',
  'Ireland': '353',
  'Israel': '972',
  'Italy': '39',
  'Ivory Coast': '225',
  
  // J
  'Jamaica': '1',
  'Japan': '81',
  'Jordan': '962',
  
  // K
  'Kazakhstan': '7',
  'Kenya': '254',
  'Kuwait': '965',
  'Kyrgyzstan': '996',
  
  // L
  'Laos': '856',
  'Latvia': '371',
  'Lebanon': '961',
  'Lesotho': '266',
  'Liberia': '231',
  'Libya': '218',
  'Liechtenstein': '423',
  'Lithuania': '370',
  'Luxembourg': '352',
  
  // M
  'Macau': '853',
  'Macedonia': '389',
  'Madagascar': '261',
  'Malawi': '265',
  'Malaysia': '60',
  'Maldives': '960',
  'Mali': '223',
  'Malta': '356',
  'Mauritania': '222',
  'Mauritius': '230',
  'Mexico': '52',
  'Moldova': '373',
  'Monaco': '377',
  'Mongolia': '976',
  'Montenegro': '382',
  'Morocco': '212',
  'Mozambique': '258',
  'Myanmar': '95',
  
  // N
  'Namibia': '264',
  'Nepal': '977',
  'Netherlands': '31',
  'New Zealand': '64',
  'Nicaragua': '505',
  'Niger': '227',
  'Nigeria': '234',
  'North Korea': '850',
  'Norway': '47',
  
  // O
  'Oman': '968',
  
  // P
  'Pakistan': '92',
  'Palestine': '970',
  'Panama': '507',
  'Papua New Guinea': '675',
  'Paraguay': '595',
  'Peru': '51',
  'Philippines': '63',
  'Poland': '48',
  'Portugal': '351',
  
  // Q
  'Qatar': '974',
  
  // R
  'Romania': '40',
  'Russia': '7',
  'Rwanda': '250',
  
  // S
  'Saudi Arabia': '966',
  'Senegal': '221',
  'Serbia': '381',
  'Seychelles': '248',
  'Sierra Leone': '232',
  'Singapore': '65',
  'Slovakia': '421',
  'Slovenia': '386',
  'Somalia': '252',
  'South Africa': '27',
  'South Korea': '82',
  'South Sudan': '211',
  'Spain': '34',
  'Sri Lanka': '94',
  'Sudan': '249',
  'Suriname': '597',
  'Swaziland': '268',
  'Sweden': '46',
  'Switzerland': '41',
  'Syria': '963',
  
  // T
  'Taiwan': '886',
  'Tajikistan': '992',
  'Tanzania': '255',
  'Thailand': '66',
  'Togo': '228',
  'Trinidad and Tobago': '1',
  'Tunisia': '216',
  'Turkey': '90',
  'Turkmenistan': '993',
  
  // U
  'Uganda': '256',
  'Ukraine': '380',
  'United Arab Emirates': '971',
  'United Kingdom': '44',
  'United States': '1',
  'Uruguay': '598',
  'Uzbekistan': '998',
  
  // V
  'Vatican City': '379',
  'Venezuela': '58',
  'Vietnam': '84',
  
  // Y
  'Yemen': '967',
  
  // Z
  'Zambia': '260',
  'Zimbabwe': '263',
  
  // Common alternative names
  'UAE': '971',
  'UK': '44',
  'USA': '1',
  'US': '1',
  'Korea, South': '82',
  'Korea, North': '850',
  'Congo (DRC)': '243',
  'Congo (Republic)': '242',
};

/**
 * Clean phone number by removing common formatting characters
 */
function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  
  let cleaned = String(phone).trim();
  
  // Handle scientific notation (e.g., "9.19769E+11" or "9.19769e+11")
  if (/[eE][+-]?\d+/.test(cleaned)) {
    try {
      // Convert scientific notation to full number string
      const num = parseFloat(cleaned);
      if (!isNaN(num) && isFinite(num)) {
        // Convert to string without scientific notation
        cleaned = num.toLocaleString('en-US', {
          useGrouping: false,
          maximumFractionDigits: 0,
          minimumFractionDigits: 0
        });
      }
    } catch (e) {
      // If conversion fails, continue with original string
    }
  }
  
  // Remove common separators and whitespace
  return cleaned
    .replace(/[\s\-\(\)\[\]\.]/g, '')
    .replace(/^[\+]/g, ''); // Remove leading + if present
}

/**
 * Check if a phone number already has a country code
 */
function hasCountryCode(phone: string, countryCode: string): boolean {
  const cleaned = cleanPhoneNumber(phone);
  return cleaned.startsWith(countryCode);
}

/**
 * Map country name to ISO country code
 */
function getCountryCode(countryName: string | null | undefined): CountryCode | null {
  if (!countryName) return null;
  
  const normalized = countryName.toLowerCase().trim();
  
  // Check if already a 2-letter code
  if (normalized.length === 2) {
    return normalized.toUpperCase() as CountryCode;
  }
  
  // Map common country names to ISO codes
  const countryMap: Record<string, CountryCode> = {
    'united kingdom': 'GB',
    'uk': 'GB',
    'united states': 'US',
    'usa': 'US',
    'us': 'US',
    'germany': 'DE',
    'france': 'FR',
    'italy': 'IT',
    'spain': 'ES',
    'canada': 'CA',
    'australia': 'AU',
    'india': 'IN',
    'china': 'CN',
    'japan': 'JP',
    'south korea': 'KR',
    'netherlands': 'NL',
    'belgium': 'BE',
    'switzerland': 'CH',
    'austria': 'AT',
    'sweden': 'SE',
    'norway': 'NO',
    'denmark': 'DK',
    'poland': 'PL',
    'ireland': 'IE',
    'portugal': 'PT',
    'greece': 'GR',
  };
  
  return countryMap[normalized] || null;
}

/**
 * Format phone number with country code prefix using libphonenumber-js
 * This properly handles country-specific rules for trunk prefixes (leading zeros)
 * @param phone - The phone number to format
 * @param country - The country name to derive the country code from
 * @returns Formatted phone number in E.164 format WITH + prefix (e.g., "+441908802874")
 */
export function formatPhoneWithCountryCode(phone: string | null | undefined, country: string | null | undefined): string | null {
  // Return null if no phone number
  if (!phone || phone.trim() === '') {
    return null;
  }
  
  // Clean the phone number
  const cleanedPhone = cleanPhoneNumber(phone);
  
  // Return null if empty after cleaning
  if (!cleanedPhone) {
    return null;
  }
  
  // Get country code
  const countryCode = getCountryCode(country);
  
  // Try to parse using libphonenumber-js for proper E.164 formatting
  if (countryCode) {
    try {
      // Try parsing with the country code
      const phoneNumber = parsePhoneNumber(cleanedPhone, countryCode);
      
      if (phoneNumber && phoneNumber.isValid()) {
        // Return proper E.164 format WITH + prefix
        return phoneNumber.format('E.164');
      }
    } catch (error) {
      // Parsing failed, fall through to auto-detection
    }
  }
  
  // SPECIAL FIX: UK numbers with "0" after country code (e.g., "4401908802874" or already with + as "+4401908802874")
  // This is a common data quality issue where trunk prefix wasn't removed
  // CRITICAL: These numbers will NOT connect to UK - the 0 after 44 must be removed
  if (cleanedPhone.startsWith('440') && cleanedPhone.length >= 12) {
    // Remove the trunk prefix "0" after "44"
    const fixedPhone = '44' + cleanedPhone.substring(3);
    try {
      const phoneNumber = parsePhoneNumber('+' + fixedPhone);
      if (phoneNumber && phoneNumber.isValid()) {
        console.log(`[Phone Fix] UK number corrected: 440... → +44... (removed leading 0)`);
        return phoneNumber.format('E.164');
      }
    } catch (error) {
      // Fix didn't work, continue with auto-detection
    }
  }
  
  // Try auto-detection by parsing with + prefix (international format)
  // This handles cases like "441768772044" → "+441768772044" → detects UK, formats correctly
  try {
    const phoneNumber = parsePhoneNumber('+' + cleanedPhone);
    
    if (phoneNumber && phoneNumber.isValid()) {
      // Auto-detected! Return proper E.164 format
      return phoneNumber.format('E.164');
    }
  } catch (error) {
    // Auto-detection failed, fall through to manual formatting
  }
  
  // Fallback to manual formatting if libphonenumber-js fails
  const dialCode = getCountryDialCode(country);
  
  // If no dial code found, try one last thing: assume it already has country code
  if (!dialCode) {
    // If number looks international (11+ digits), add + and return
    if (cleanedPhone.length >= 11) {
      return `+${cleanedPhone}`;
    }
    return null;
  }
  
  // If phone already has the country code, format it correctly with + prefix
  if (hasCountryCode(phone, dialCode)) {
    return `+${cleanedPhone}`;
  }
  
  // Add country code prefix with + sign
  return `+${dialCode}${cleanedPhone}`;
}

/**
 * Get dial code for a country
 */
export function getCountryDialCode(country: string | null | undefined): string | null {
  if (!country) return null;
  
  // Trim and normalize
  const normalizedCountry = country.trim();
  
  // Direct lookup
  if (COUNTRY_DIAL_CODES[normalizedCountry]) {
    return COUNTRY_DIAL_CODES[normalizedCountry];
  }
  
  // Case-insensitive lookup
  const countryLower = normalizedCountry.toLowerCase();
  for (const [key, code] of Object.entries(COUNTRY_DIAL_CODES)) {
    if (key.toLowerCase() === countryLower) {
      return code;
    }
  }
  
  return null;
}
