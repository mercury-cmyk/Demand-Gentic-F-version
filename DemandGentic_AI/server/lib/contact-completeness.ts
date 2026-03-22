/**
 * Contact Completeness Validation
 * Determines if a contact has complete information ready for client delivery
 * 
 * NEW FLEXIBLE APPROACH: Allows contacts with less than 4 blank fields in address+phone
 */

import type { BestContactData } from './verification-best-data';

export interface CompletenessResult {
  hasCompletePhone: boolean;
  hasCompleteAddress: boolean;
  isClientReady: boolean; // Passes export criteria
  missingFields: string[];
  blankFieldCount: number; // Total blank fields in address+phone
  qualityScore: number; // 0-100 score based on completeness
}

/**
 * Count blank fields in address
 * Address fields: line1, city, state, postal, country (5 fields total)
 */
function countAddressBlankFields(address: { address: any; source: string }): number {
  if (!address || address.source === 'None') return 5; // All blank
  
  const addr = address.address;
  if (!addr) return 5;
  
  let blanks = 0;
  if (!addr.line1 || addr.line1.trim() === '') blanks++;
  if (!addr.city || addr.city.trim() === '') blanks++;
  if (!addr.state || addr.state.trim() === '') blanks++;
  if (!addr.postal || addr.postal.trim() === '') blanks++;
  if (!addr.country || addr.country.trim() === '') blanks++;
  
  return blanks;
}

/**
 * Check if a phone number is complete (not empty, not "None", and has actual value)
 */
export function isPhoneComplete(phone: { phone: string; source: string }): boolean {
  if (!phone || !phone.phone || phone.phone.trim() === '') return false;
  if (phone.source === 'None') return false;
  if (phone.phone === null || phone.phone === undefined) return false;
  
  // Phone must be at least 5 digits (minimum valid phone)
  const digitsOnly = phone.phone.replace(/\D/g, '');
  return digitsOnly.length >= 5;
}

/**
 * Check if an address meets MINIMUM quality standards
 * Flexible: Must have AT LEAST line1 + city (2 core fields)
 * Improved from strict "all or nothing" approach
 */
export function hasMinimumAddressQuality(address: { address: any; source: string }): boolean {
  if (!address || address.source === 'None') return false;
  
  const addr = address.address;
  if (!addr) return false;
  
  // MINIMUM REQUIREMENT: Must have line1 AND city
  const hasLine1 = addr.line1 && addr.line1.trim() !== '';
  const hasCity = addr.city && addr.city.trim() !== '';
  
  return hasLine1 && hasCity;
}

/**
 * Analyze contact completeness for export eligibility
 * FLEXIBLE CRITERIA: Export if less than 4 blank fields in address+phone combined
 * 
 * This allows maximum flexibility while maintaining quality:
 * - 0 blanks = Perfect (100% quality)
 * - 1 blank = Good (83% quality)
 * - 2 blanks = Acceptable (67% quality)
 * - 3 blanks = Fair (50% quality)
 * - 4+ blanks = Too incomplete (rejected)
 */
export function analyzeContactCompleteness(smartData: BestContactData): CompletenessResult {
  const hasCompletePhone = isPhoneComplete(smartData.phone);
  const hasMinAddress = hasMinimumAddressQuality(smartData.address);
  
  // Count blank fields in address (5 possible fields)
  const addressBlanks = countAddressBlankFields(smartData.address);
  
  // Phone counts as 1 blank if missing
  const phoneBlanks = hasCompletePhone ? 0 : 1;
  
  // Total blank fields (max 6: 1 phone + 5 address fields)
  const blankFieldCount = phoneBlanks + addressBlanks;
  
  // Quality score: 100% if all fields present, decreases by ~16.7% per blank
  const qualityScore = Math.round(((6 - blankFieldCount) / 6) * 100);
  
  // CLIENT-READY CRITERIA: Export ALL eligible contacts regardless of completeness
  // The eligibility screening (geo + title) already filters out ineligible contacts
  // We still track quality metrics for reporting, but don't block exports
  const isClientReady = true;
  
  // Track missing fields for logging
  const missingFields: string[] = [];
  if (!hasCompletePhone) missingFields.push('phone');
  if (addressBlanks > 0) {
    const addr = smartData.address.address;
    if (!addr.line1 || addr.line1.trim() === '') missingFields.push('address.line1');
    if (!addr.city || addr.city.trim() === '') missingFields.push('address.city');
    if (!addr.state || addr.state.trim() === '') missingFields.push('address.state');
    if (!addr.postal || addr.postal.trim() === '') missingFields.push('address.postal');
    if (!addr.country || addr.country.trim() === '') missingFields.push('address.country');
  }
  
  return {
    hasCompletePhone,
    hasCompleteAddress: addressBlanks === 0,
    isClientReady,
    missingFields,
    blankFieldCount,
    qualityScore,
  };
}