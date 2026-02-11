import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber';

const phoneUtil = PhoneNumberUtil.getInstance();

/**
 * Normalizes a phone number to E.164 format based on the contact's country.
 * @param phone The raw phone string (e.g., "07919 550050")
 * @param countryCode The ISO 2-letter country code (e.g., "GB", "US")
 */
export function normalizePhoneNumber(phone: string, countryCode: string = 'US'): string | null {
  if (!phone) return null;

  try {
    // 1. Parse the number with the provided country code
    const number = phoneUtil.parseAndKeepRawInput(phone, countryCode.toUpperCase());

    // 2. Check if valid
    if (!phoneUtil.isValidNumber(number)) {
      console.warn(`[PhoneNormalization] Invalid number for region ${countryCode}: ${phone}`);
      return null;
    }

    // 3. Format to E.164 (e.g., +447919550050)
    return phoneUtil.format(number, PhoneNumberFormat.E164);
  } catch (error) {
    // Fallback: if it already looks like E.164, return it, otherwise null
    if (phone.startsWith('+') && phone.length > 8) {
      return phone;
    }
    console.error(`[PhoneNormalization] Error parsing ${phone} (${countryCode}):`, error);
    return null;
  }
}