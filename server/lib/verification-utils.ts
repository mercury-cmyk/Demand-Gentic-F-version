import type { VerificationCampaign, VerificationContact } from "@shared/schema";
import crypto from 'crypto';

/**
 * Contact Priority Calculation
 * 4-tier hierarchy for account cap enforcement and contact selection
 * Priority 1 (highest): CAV ID + CAV User ID + Job Title Match
 * Priority 2: Complete Address (all fields) + Phone
 * Priority 3: Phone + 2-3 Address Fields (partial)
 * Priority 4 (lowest): Phone Only
 * Rejected: No Phone Number (blocked from client delivery)
 */
export interface ContactPriority {
  tier: 1 | 2 | 3 | 4 | null; // null = rejected (no phone)
  score: number; // Numeric score for sorting (higher = better)
  reason: string; // Human-readable explanation
  hasPhone: boolean;
  hasCavData: boolean;
  hasCompleteAddress: boolean;
  addressFieldCount: number;
}

/**
 * Calculate contact priority based on data completeness and CAV ID presence
 * @param contact - Contact to evaluate
 * @param campaign - Campaign context (for title matching)
 * @returns Priority info for sorting and filtering
 */
export function calculateContactPriority(
  contact: Partial<VerificationContact>,
  campaign?: Pick<VerificationCampaign, 'eligibilityConfig'>
): ContactPriority {
  // Check phone presence (REQUIRED for all tiers)
  const hasPhone = !!(
    contact.phone || 
    contact.mobile || 
    contact.aiEnrichedPhone || 
    contact.hqPhone
  );

  // Reject contacts without ANY phone number
  if (!hasPhone) {
    return {
      tier: null,
      score: 0,
      reason: 'No phone number - blocked from delivery',
      hasPhone: false,
      hasCavData: false,
      hasCompleteAddress: false,
      addressFieldCount: 0,
    };
  }

  // Check CAV data presence
  const hasCavData = !!(contact.cavId && contact.cavUserId);

  // Check job title match (if campaign config available)
  let hasJobTitleMatch = false;
  if (campaign?.eligibilityConfig) {
    const config = campaign.eligibilityConfig as { titleKeywords?: string[] };
    const titleKeywords = config.titleKeywords || [];
    const contactTitle = (contact.title || '').toLowerCase();
    hasJobTitleMatch = titleKeywords.length === 0 || titleKeywords.some(kw => 
      contactTitle.includes(kw.toLowerCase())
    );
  } else {
    // If no campaign context, assume title is acceptable if present
    hasJobTitleMatch = !!(contact.title && contact.title.trim().length > 0);
  }

  // Count address fields (check both contact-level and AI-enriched)
  const addressFields = [
    contact.contactAddress1 || contact.aiEnrichedAddress1,
    contact.contactAddress2 || contact.aiEnrichedAddress2,
    contact.contactCity || contact.aiEnrichedCity,
    contact.contactState || contact.aiEnrichedState,
    contact.contactPostal || contact.aiEnrichedPostal,
  ].filter(Boolean);

  const addressFieldCount = addressFields.length;
  const hasCompleteAddress = addressFieldCount >= 4; // Address1, City, State, Postal

  // TIER 1: CAV ID + CAV User ID + Job Title Match
  if (hasCavData && hasJobTitleMatch) {
    return {
      tier: 1,
      score: 1000 + addressFieldCount, // Bonus for address completeness
      reason: 'CAV ID + User ID + Job Title (highest priority)',
      hasPhone: true,
      hasCavData: true,
      hasCompleteAddress,
      addressFieldCount,
    };
  }

  // TIER 2: Complete Address (all fields) + Phone
  if (hasCompleteAddress) {
    return {
      tier: 2,
      score: 500 + (hasCavData ? 50 : 0), // Bonus for CAV data even without title match
      reason: 'Complete address + phone',
      hasPhone: true,
      hasCavData,
      hasCompleteAddress: true,
      addressFieldCount,
    };
  }

  // TIER 3: Phone + 2-3 Address Fields (partial)
  if (addressFieldCount >= 2) {
    return {
      tier: 3,
      score: 200 + addressFieldCount * 10,
      reason: `Phone + ${addressFieldCount} address fields (partial)`,
      hasPhone: true,
      hasCavData,
      hasCompleteAddress: false,
      addressFieldCount,
    };
  }

  // TIER 4: Phone Only
  return {
    tier: 4,
    score: 100,
    reason: 'Phone only (minimal data)',
    hasPhone: true,
    hasCavData,
    hasCompleteAddress: false,
    addressFieldCount: 0,
  };
}

export const normalize = {
  toKey: (s?: string | null) =>
    (s ?? "").toLowerCase().trim().replace(/\s+/g, " "),
  countryKey: (s?: string | null) =>
    (s ?? "").toLowerCase().replace(/\./g, "").trim(),
  emailLower: (s?: string | null) =>
    (s ?? "").toLowerCase().trim(),
  
  /**
   * Extract domain from email address
   */
  extractDomain: (email?: string | null): string => {
    if (!email) return "";
    const match = email.toLowerCase().trim().match(/@(.+)$/);
    return match ? match[1] : "";
  },
  
  /**
   * Normalize domain for company matching
   * Removes www, common TLDs, and applies company normalization
   */
  domainToCompanyKey: (domain?: string | null): string => {
    if (!domain) return "";
    
    let normalized = domain.toLowerCase().trim();
    
    // Remove www prefix
    normalized = normalized.replace(/^www\./, '');
    
    // Remove common TLDs (order matters - longer patterns first)
    normalized = normalized.replace(/\.(co\.\w{2}|com\.\w{2}|aero|travel)$/, '');
    normalized = normalized.replace(/\.(com|org|net|co|io|ai|app|dev|qa)$/, '');
    
    // Replace hyphens with spaces before applying company normalization
    // e.g., "singapore-airlines" becomes "singapore airlines"
    normalized = normalized.replace(/-/g, ' ');
    
    // Split compound words: insert space before known company words
    // e.g., "vietnamairlines" becomes "vietnam airlines"
    const compoundWords = [
      'airlines', 'airline', 'airways', 'air',
      'aviation', 'international', 'global',
      'technologies', 'technology', 'tech',
      'systems', 'solutions', 'services',
      'group', 'holdings', 'corporation', 'company'
    ];
    
    compoundWords.forEach(word => {
      // Insert space before the word if it's preceded by other letters
      const pattern = new RegExp(`([a-z])(${word})`, 'g');
      normalized = normalized.replace(pattern, '$1 $2');
    });
    
    // Apply company normalization rules (handles suffixes, abbreviations, etc.)
    return normalize.companyKey(normalized);
  },
  
  /**
   * Smart company name normalization that handles:
   * - Legal suffixes (Ltd, Inc, LLC, Corp, etc.)
   * - Punctuation and special characters
   * - Common abbreviations
   * - Extra words (The, Group, Holdings)
   * - International variations
   */
  companyKey: (s?: string | null): string => {
    if (!s) return "";
    
    let normalized = s.toLowerCase().trim();
    
    // Remove common legal suffixes (must be at end of string)
    const legalSuffixes = [
      'limited', 'ltd', 'llc', 'inc', 'incorporated', 'corp', 'corporation',
      'plc', 'sa', 'gmbh', 'ag', 'nv', 'bv', 'spa', 'srl', 'kg', 'oy',
      'co', 'company', 'group', 'holdings', 'holding', 'international',
      'intl', 'global', 'worldwide', 'pvt', 'pte', 'pty', 'sdn bhd',
      'public company', 'joint stock company', 'jsc', 'ojsc', 'pjsc'
    ];
    
    // Remove suffixes at the end (with optional period/comma)
    for (const suffix of legalSuffixes) {
      const patterns = [
        new RegExp(`[,.]?\\s+${suffix}[,.]?$`, 'gi'),
        new RegExp(`\\s+${suffix}[,.]?$`, 'gi'),
      ];
      for (const pattern of patterns) {
        normalized = normalized.replace(pattern, '');
      }
    }
    
    // Remove "The" at the beginning
    normalized = normalized.replace(/^the\s+/i, '');
    
    // Remove all punctuation and special characters (keep spaces, letters, numbers)
    normalized = normalized.replace(/[^\w\s]/g, '');
    
    // Normalize common company name patterns
    const abbreviations: Record<string, string> = {
      'airways': 'air',
      'airline': 'air',
      'airlines': 'air',
      'international': 'intl',
      'aviation': 'avia',
      'technologies': 'tech',
      'technology': 'tech',
      'systems': 'sys',
      'solutions': 'sol',
      'services': 'svc',
      'manufacturing': 'mfg',
    };
    
    // Apply abbreviation normalization (optional - can make matching more aggressive)
    for (const [full, abbr] of Object.entries(abbreviations)) {
      normalized = normalized.replace(new RegExp(`\\b${full}\\b`, 'g'), abbr);
      normalized = normalized.replace(new RegExp(`\\b${abbr}\\b`, 'g'), abbr);
    }
    
    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
  }
};

/**
 * Check if email matches contact's name
 * Returns true if email appears to match the person's name
 * 
 * CONSERVATIVE MATCHING: Requires evidence from BOTH first and last name
 * to avoid false positives. Single-letter names or very short names are
 * handled carefully to prevent false matches.
 */
export function checkEmailNameMatch(
  email: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined
): { matches: boolean; reason: string } {
  if (!email) {
    return { matches: true, reason: 'no_email_to_check' };
  }
  
  // Require both first and last name for meaningful comparison
  if (!firstName || !lastName) {
    return { matches: true, reason: 'incomplete_name_data' };
  }
  
  const emailLower = email.toLowerCase();
  const emailLocal = emailLower.split('@')[0] || '';
  
  // Normalize names - handle hyphenated names, apostrophes, spaces
  // "Mary-Jane" → "maryjane" and "O'Brien" → "obrien"
  const normalizeName = (name: string): string => {
    return name.toLowerCase()
      .replace(/[-'\s]/g, '') // Remove hyphens, apostrophes, spaces
      .replace(/[^a-z]/g, ''); // Keep only letters
  };
  
  const fName = normalizeName(firstName);
  const lName = normalizeName(lastName);
  
  // Skip matching if names are too short to be meaningful
  if (fName.length < 2 || lName.length < 2) {
    return { matches: true, reason: 'name_too_short_to_validate' };
  }
  
  // Normalize email local part (remove numbers, common separators become single format)
  const emailNormalized = emailLocal.replace(/[._-]/g, '').replace(/[0-9]/g, '');
  
  // PATTERN 1: Full name in email (highest confidence)
  // john.smith@, johnsmith@, smithjohn@
  const hasFirstName = emailNormalized.includes(fName);
  const hasLastName = emailNormalized.includes(lName);
  
  if (hasFirstName && hasLastName) {
    return { matches: true, reason: 'full_name_match' };
  }
  
  // PATTERN 2: First name + last initial OR last name + first initial
  // jsmith@, john.s@, smithj@, s.john@
  const firstInitial = fName[0];
  const lastInitial = lName[0];
  
  // Check for "firstName + lastInitial" pattern (e.g., johns@)
  // Note: escapeRegex is defined below but hoisted by JavaScript
  const firstNameLastInitialPattern = new RegExp(`${escapeRegex(fName)}[._-]?${escapeRegex(lastInitial)}(?![a-z])`);
  if (firstNameLastInitialPattern.test(emailLocal)) {
    return { matches: true, reason: 'first_name_last_initial' };
  }
  
  // Check for "firstInitial + lastName" pattern (e.g., jsmith@)
  const firstInitialLastNamePattern = new RegExp(`(?<![a-z])${escapeRegex(firstInitial)}[._-]?${escapeRegex(lName)}`);
  if (firstInitialLastNamePattern.test(emailLocal)) {
    return { matches: true, reason: 'first_initial_last_name' };
  }
  
  // Check for "lastName + firstInitial" pattern (e.g., smithj@)
  const lastNameFirstInitialPattern = new RegExp(`${escapeRegex(lName)}[._-]?${escapeRegex(firstInitial)}(?![a-z])`);
  if (lastNameFirstInitialPattern.test(emailLocal)) {
    return { matches: true, reason: 'last_name_first_initial' };
  }
  
  // STRICT MODE: Removed single-name patterns to prevent false positives
  // The algorithm now REQUIRES evidence from BOTH first and last name
  // Patterns 1 (full name) and 2 (name + initial) above cover the valid cases
  
  // No clear match found - flag as mismatch
  // This happens when the email doesn't contain sufficient evidence of both names
  return { matches: false, reason: 'email_does_not_match_name' };
}

/**
 * Match title keyword using the specified mode
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchTitleKeyword(
  title: string,
  keyword: string,
  mode: 'contains' | 'exact' | 'word_boundary'
): boolean {
  const titleLower = title.toLowerCase().trim();
  const keywordLower = keyword.toLowerCase().trim();
  
  switch (mode) {
    case 'exact':
      return titleLower === keywordLower;
    
    case 'word_boundary':
      // Match whole words only using word boundary regex
      const wordRegex = new RegExp(`\\b${escapeRegex(keywordLower)}\\b`, 'i');
      return wordRegex.test(title);
    
    case 'contains':
    default:
      return titleLower.includes(keywordLower);
  }
}

// ============================================================================
// CONTACT REALNESS DETECTION
// ============================================================================

/**
 * Common company suffixes that indicate a company name, not a person name
 */
const COMPANY_SUFFIXES = [
  'llc', 'ltd', 'inc', 'corp', 'corporation', 'limited', 'company', 'co',
  'plc', 'gmbh', 'ag', 'sa', 'srl', 'bv', 'nv', 'pty', 'holdings',
  'group', 'partners', 'associates', 'consulting', 'solutions', 'services',
  'international', 'global', 'technologies', 'tech', 'systems', 'enterprises'
];

/**
 * Keywords indicating self-employed or freelance status
 */
const SELF_EMPLOYED_KEYWORDS = [
  'self-employed', 'self employed', 'freelancer', 'freelance', 'independent',
  'consultant', 'contractor', 'sole proprietor', 'owner operator', 'gig worker',
  'solopreneur', 'entrepreneur at', 'between jobs', 'looking for opportunities',
  'available for hire', 'open to work', 'seeking opportunities'
];

/**
 * Common freemail domains that indicate personal email
 */
const FREEMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
  'gmx.com', 'live.com', 'msn.com', 'me.com', 'inbox.com'
];

/**
 * Check if a name appears to be fake or a company name used as a person name
 * Returns true if the name appears fake
 */
export function checkFakeName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  companyName: string | null | undefined
): { isFake: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const fName = (firstName || '').trim();
  const lName = (lastName || '').trim();
  const fullName = `${fName} ${lName}`.toLowerCase().trim();
  const company = (companyName || '').toLowerCase().trim();
  
  // Check 1: Missing or single-character names
  if (!fName || fName.length < 2) {
    reasons.push('first_name_too_short');
  }
  if (!lName || lName.length < 2) {
    reasons.push('last_name_too_short');
  }
  
  // Check 2: Very long names (often company names or garbage data)
  if (fName.length > 25 || lName.length > 30) {
    reasons.push('name_suspiciously_long');
  }
  
  // Check 3: All caps (often data entry errors or company names)
  if (fName.length > 2 && fName === fName.toUpperCase()) {
    reasons.push('first_name_all_caps');
  }
  if (lName.length > 2 && lName === lName.toUpperCase()) {
    reasons.push('last_name_all_caps');
  }
  
  // Check 4: Contains numbers (real names rarely have numbers)
  if (/\d/.test(fName) || /\d/.test(lName)) {
    reasons.push('name_contains_numbers');
  }
  
  // Check 5: Contains company suffixes
  const fullNameLower = fullName.toLowerCase();
  for (const suffix of COMPANY_SUFFIXES) {
    const suffixRegex = new RegExp(`\\b${escapeRegex(suffix)}\\b`, 'i');
    if (suffixRegex.test(fullNameLower)) {
      reasons.push(`name_contains_company_suffix_${suffix}`);
      break;
    }
  }
  
  // Check 6: Name matches company name too closely
  if (company && fullName) {
    // Normalize both for comparison
    const normalizedName = fullName.replace(/[^a-z0-9]/g, '');
    const normalizedCompany = company.replace(/[^a-z0-9]/g, '');
    
    // Exact match or significant overlap
    if (normalizedName === normalizedCompany) {
      reasons.push('name_matches_company_name');
    } else if (normalizedCompany.length >= 5 && normalizedName.includes(normalizedCompany)) {
      reasons.push('name_contains_company_name');
    } else if (normalizedName.length >= 5 && normalizedCompany.includes(normalizedName)) {
      reasons.push('company_contains_full_name');
    }
  }
  
  // Check 7: Special characters that don't belong in names (except hyphens, apostrophes)
  if (/[@#$%^&*()+=\[\]{}|\\/<>~`]/.test(fullName)) {
    reasons.push('name_contains_special_characters');
  }
  
  // Check 8: Single word in full name position (only first OR last name, not both)
  if ((!fName || fName.length === 0) && lName.length > 0) {
    reasons.push('only_last_name_provided');
  }
  if (fName.length > 0 && (!lName || lName.length === 0)) {
    reasons.push('only_first_name_provided');
  }
  
  // Consider fake if 2+ reasons triggered
  return {
    isFake: reasons.length >= 2,
    reasons
  };
}

/**
 * Check if job title indicates self-employed or freelance status
 */
export function checkSelfEmployed(
  title: string | null | undefined,
  employmentType?: string | null
): { isSelfEmployed: boolean; reason: string | null } {
  const titleLower = (title || '').toLowerCase();
  const empTypeLower = (employmentType || '').toLowerCase();
  
  // Check employment type field if available
  if (empTypeLower.includes('self') || empTypeLower.includes('freelance') || empTypeLower.includes('contract')) {
    return { isSelfEmployed: true, reason: 'employment_type_self_employed' };
  }
  
  // Check title for self-employed keywords
  for (const keyword of SELF_EMPLOYED_KEYWORDS) {
    if (titleLower.includes(keyword)) {
      return { isSelfEmployed: true, reason: `title_contains_${keyword.replace(/\s+/g, '_')}` };
    }
  }
  
  // Check for patterns like "Founder" without company (often indicates solopreneur)
  // But "Founder at [Company]" or "Co-Founder, [Company]" is legitimate
  const founderMatch = titleLower.match(/\b(founder|co-founder|cofounder)\b/);
  if (founderMatch) {
    // If title is JUST "Founder" or "Owner" without any company context, flag it
    const cleanTitle = titleLower.replace(/[^a-z\s]/g, '').trim();
    if (cleanTitle === 'founder' || cleanTitle === 'owner' || cleanTitle === 'co-founder' || cleanTitle === 'cofounder') {
      return { isSelfEmployed: true, reason: 'title_only_founder_no_company' };
    }
  }
  
  return { isSelfEmployed: false, reason: null };
}

/**
 * Check if email is from a personal/freemail domain
 */
export function checkFreemailDomain(
  email: string | null | undefined
): { isFreemail: boolean; domain: string | null } {
  if (!email || !email.includes('@')) {
    return { isFreemail: false, domain: null };
  }
  
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) {
    return { isFreemail: false, domain: null };
  }
  
  const isFreemail = FREEMAIL_DOMAINS.some(fm => domain === fm || domain.endsWith(`.${fm}`));
  return { isFreemail, domain };
}

/**
 * Check if company has valid LinkedIn URL
 */
export function checkCompanyLinkedIn(
  companyLinkedinUrl: string | null | undefined,
  aiCompanyLinkedinUrl?: string | null
): { hasLinkedIn: boolean; url: string | null } {
  const url = companyLinkedinUrl || aiCompanyLinkedinUrl;
  
  if (!url || url.trim().length === 0) {
    return { hasLinkedIn: false, url: null };
  }
  
  // Check for placeholder/invalid URLs
  const urlLower = url.toLowerCase().trim();
  const invalidPatterns = [
    'linkedin.com/company/',  // Just the base URL with no company slug
    'linkedin.com/company/company',
    'linkedin.com/company/na',
    'linkedin.com/company/unknown',
    'linkedin.com/company/none'
  ];
  
  for (const pattern of invalidPatterns) {
    if (urlLower === pattern || urlLower === `https://${pattern}` || urlLower === `http://${pattern}`) {
      return { hasLinkedIn: false, url: null };
    }
  }
  
  // Must have a valid slug after /company/
  const companySlugMatch = url.match(/linkedin\.com\/company\/([a-zA-Z0-9\-_]+)/);
  if (companySlugMatch && companySlugMatch[1] && companySlugMatch[1].length >= 2) {
    return { hasLinkedIn: true, url };
  }
  
  return { hasLinkedIn: false, url: null };
}

/**
 * Check if company has industry information
 */
export function checkHasIndustry(
  industry: string | null | undefined,
  aiEnrichedIndustry?: string | null
): { hasIndustry: boolean; industry: string | null } {
  const ind = (industry || aiEnrichedIndustry || '').toLowerCase().trim();
  
  if (!ind || ind.length === 0) {
    return { hasIndustry: false, industry: null };
  }
  
  // Check for placeholder/invalid values
  const invalidValues = ['unknown', 'n/a', 'na', 'none', 'miscellaneous', 'other', '-', 'tbd'];
  if (invalidValues.includes(ind)) {
    return { hasIndustry: false, industry: null };
  }
  
  return { hasIndustry: true, industry: ind };
}

/**
 * Comprehensive contact realness evaluation
 * Checks multiple signals to determine if a contact appears to be a real business contact
 */
export function evaluateContactRealness(
  contact: {
    firstName?: string | null;
    lastName?: string | null;
    title?: string | null;
    email?: string | null;
    employmentType?: string | null;
    timeInCurrentPositionMonths?: number | null;
    timeInCurrentCompanyMonths?: number | null;
  },
  company: {
    name?: string | null;
    industry?: string | null;
    aiEnrichedIndustry?: string | null;
    companyLinkedinUrl?: string | null;
    aiCompanyLinkedinUrl?: string | null;
  },
  config: {
    rejectFakeNames?: boolean;
    rejectSelfEmployed?: boolean;
    rejectMissingIndustry?: boolean;
    rejectMissingCompanyLinkedIn?: boolean;
    rejectFreemailWithTitle?: boolean;
    rejectMissingTenure?: boolean;
  }
): { isReal: boolean; disqualifyReasons: string[] } {
  const disqualifyReasons: string[] = [];
  
  // Check 1: Fake name detection
  if (config.rejectFakeNames) {
    const fakeNameCheck = checkFakeName(contact.firstName, contact.lastName, company.name);
    if (fakeNameCheck.isFake) {
      disqualifyReasons.push(`fake_name:${fakeNameCheck.reasons.join(',')}`);
    }
  }
  
  // Check 2: Self-employed detection
  if (config.rejectSelfEmployed) {
    const selfEmployedCheck = checkSelfEmployed(contact.title, contact.employmentType);
    if (selfEmployedCheck.isSelfEmployed) {
      disqualifyReasons.push(`self_employed:${selfEmployedCheck.reason}`);
    }
  }
  
  // Check 3: Missing industry
  if (config.rejectMissingIndustry) {
    const industryCheck = checkHasIndustry(company.industry, company.aiEnrichedIndustry);
    if (!industryCheck.hasIndustry) {
      disqualifyReasons.push('missing_industry');
    }
  }
  
  // Check 4: Missing company LinkedIn
  if (config.rejectMissingCompanyLinkedIn) {
    const linkedInCheck = checkCompanyLinkedIn(company.companyLinkedinUrl, company.aiCompanyLinkedinUrl);
    if (!linkedInCheck.hasLinkedIn) {
      disqualifyReasons.push('missing_company_linkedin');
    }
  }
  
  // Check 5: Freemail with business title
  if (config.rejectFreemailWithTitle) {
    const freemailCheck = checkFreemailDomain(contact.email);
    if (freemailCheck.isFreemail) {
      // Only flag if they have a business-sounding title
      const title = (contact.title || '').toLowerCase();
      const businessTitlePatterns = ['director', 'manager', 'vp', 'president', 'chief', 'head of', 'lead', 'senior'];
      const hasBusinessTitle = businessTitlePatterns.some(p => title.includes(p));
      if (hasBusinessTitle) {
        disqualifyReasons.push(`freemail_with_business_title:${freemailCheck.domain}`);
      }
    }
  }
  
  // Check 6: Missing tenure data (time in position or time in company)
  if (config.rejectMissingTenure) {
    const hasTimeInPosition = contact.timeInCurrentPositionMonths != null && contact.timeInCurrentPositionMonths > 0;
    const hasTimeInCompany = contact.timeInCurrentCompanyMonths != null && contact.timeInCurrentCompanyMonths > 0;
    if (!hasTimeInPosition && !hasTimeInCompany) {
      disqualifyReasons.push('missing_tenure');
    }
  }
  
  return {
    isReal: disqualifyReasons.length === 0,
    disqualifyReasons
  };
}

/**
 * Check if company industry matches target keywords
 */
export function checkIndustryMatch(
  companyIndustry: string | null | undefined,
  companyDescription: string | null | undefined,
  targetIndustries: string[]
): { matches: boolean; reason: string } {
  if (!targetIndustries || targetIndustries.length === 0) {
    return { matches: true, reason: 'no_industry_filter' };
  }
  
  const industry = (companyIndustry || '').toLowerCase();
  const description = (companyDescription || '').toLowerCase();
  const combined = `${industry} ${description}`;
  
  if (!industry && !description) {
    // No industry data available - could be flagged or passed through
    return { matches: false, reason: 'no_industry_data_available' };
  }
  
  for (const target of targetIndustries) {
    const targetLower = target.toLowerCase().trim();
    // Use word boundary matching for industry keywords
    const wordRegex = new RegExp(`\\b${escapeRegex(targetLower)}\\b`, 'i');
    if (wordRegex.test(combined)) {
      return { matches: true, reason: `industry_match_${target}` };
    }
  }
  
  return { matches: false, reason: 'industry_not_matching' };
}

/**
 * Eligibility Evaluation
 * Checks geo/title/seniority/industry criteria for immediate eligibility determination.
 * 
 * IMPORTANT: Email validation is NOT part of eligibility checks.
 * Contacts passing geo/title checks are immediately marked as 'Eligible'.
 * Email validation runs separately for data quality purposes only.
 */
export function evaluateEligibility(
  title: string | null | undefined,
  contactCountry: string | null | undefined,
  campaign: VerificationCampaign,
  email?: string | null,
  additionalContext?: {
    firstName?: string | null;
    lastName?: string | null;
    companyIndustry?: string | null;
    companyDescription?: string | null;
    companyName?: string | null;
    companyLinkedinUrl?: string | null;
    aiCompanyLinkedinUrl?: string | null;
    aiEnrichedIndustry?: string | null;
    employmentType?: string | null;
    timeInCurrentPositionMonths?: number | null;
    timeInCurrentCompanyMonths?: number | null;
  }
) {
  // NOTE: Email is NOT required for verification campaigns
  // Agents call contacts to COLLECT email addresses - many won't have them initially
  // Personal email domains (@gmail.com, @yahoo.com, etc.) are also ALLOWED
  
  const t = (title ?? "").toLowerCase();
  const c = normalize.countryKey(contactCountry);
  
  const eligibilityConfig = campaign.eligibilityConfig || {};
  const { 
    geoAllow = [], 
    titleKeywords = [], 
    seniorDmFallback = [],
    seniorityLevels = [],
    industryKeywords = [],
    requireEmailNameMatch = false,
    titleMatchMode = 'contains',
    // Realness checks
    rejectFakeNames = false,
    rejectSelfEmployed = false,
    rejectMissingIndustry = false,
    rejectMissingCompanyLinkedIn = false,
    rejectFreemailWithTitle = false,
    rejectMissingTenure = false
  } = eligibilityConfig;
  
  // Check geographic restrictions
  const countryOk = geoAllow.length === 0 || geoAllow.some((allowed: string) => 
    c.includes(allowed.toLowerCase()) || allowed.toLowerCase().includes(c)
  );
  
  if (!countryOk) {
    return { status: 'Out_of_Scope' as const, reason: 'country_not_in_geo_allow_list' };
  }
  
  // Check seniority level if configured
  if (seniorityLevels.length > 0) {
    const contactSeniority = extractSeniorityLevel(title);
    if (!seniorityLevels.includes(contactSeniority)) {
      return { status: 'Out_of_Scope' as const, reason: `seniority_mismatch_${contactSeniority}` };
    }
  }
  
  // Check title restrictions with improved matching
  // If title keywords are configured, reject blank/empty titles
  if (titleKeywords.length > 0 && t.trim().length === 0) {
    return { status: 'Out_of_Scope' as const, reason: 'title_not_matching_keywords' };
  }
  
  const titleMatch = titleKeywords.length === 0 || titleKeywords.some((keyword: string) => 
    matchTitleKeyword(t, keyword, titleMatchMode)
  );
  
  const seniorMatch = seniorDmFallback.length > 0 && seniorDmFallback.some((senior: string) => 
    t.includes(senior.toLowerCase())
  );
  
  if (titleKeywords.length > 0 && !(titleMatch || seniorMatch)) {
    return { status: 'Out_of_Scope' as const, reason: 'title_not_matching_keywords' };
  }
  
  // Check industry if configured and context provided
  if (industryKeywords.length > 0 && additionalContext) {
    const industryCheck = checkIndustryMatch(
      additionalContext.companyIndustry,
      additionalContext.companyDescription,
      industryKeywords
    );
    if (!industryCheck.matches && industryCheck.reason !== 'no_industry_data_available') {
      return { status: 'Out_of_Scope' as const, reason: industryCheck.reason };
    }
  }
  
  // Check email-name match if required
  if (requireEmailNameMatch && email && additionalContext) {
    const emailNameCheck = checkEmailNameMatch(
      email,
      additionalContext.firstName,
      additionalContext.lastName
    );
    if (!emailNameCheck.matches) {
      return { status: 'Out_of_Scope' as const, reason: 'email_name_mismatch' };
    }
  }
  
  // Contact realness checks - detect fake/low-quality contacts
  const hasRealnessChecks = rejectFakeNames || rejectSelfEmployed || 
    rejectMissingIndustry || rejectMissingCompanyLinkedIn || rejectFreemailWithTitle || rejectMissingTenure;
  
  if (hasRealnessChecks && additionalContext) {
    const realnessCheck = evaluateContactRealness(
      {
        firstName: additionalContext.firstName,
        lastName: additionalContext.lastName,
        title: title,
        email: email,
        employmentType: additionalContext.employmentType,
        timeInCurrentPositionMonths: additionalContext.timeInCurrentPositionMonths,
        timeInCurrentCompanyMonths: additionalContext.timeInCurrentCompanyMonths
      },
      {
        name: additionalContext.companyName,
        industry: additionalContext.companyIndustry,
        aiEnrichedIndustry: additionalContext.aiEnrichedIndustry,
        companyLinkedinUrl: additionalContext.companyLinkedinUrl,
        aiCompanyLinkedinUrl: additionalContext.aiCompanyLinkedinUrl
      },
      {
        rejectFakeNames,
        rejectSelfEmployed,
        rejectMissingIndustry,
        rejectMissingCompanyLinkedIn,
        rejectFreemailWithTitle,
        rejectMissingTenure
      }
    );
    
    if (!realnessCheck.isReal) {
      return { 
        status: 'Out_of_Scope' as const, 
        reason: `contact_not_real:${realnessCheck.disqualifyReasons.join('|')}`
      };
    }
  }
  
  // Contact passed all eligibility checks → immediately mark as Eligible
  // Email validation will run separately for data quality, but doesn't affect eligibility
  return { status: 'Eligible' as const, reason: 'passed_eligibility_checks' };
}

/**
 * Finalize eligibility status after email validation completes
 * Updates contact from 'Pending_Email_Validation' to 'Eligible' or 'Ineligible_Email_Invalid'
 * 
 * 4-Status Email Validation System:
 * - valid: Verified deliverable → Eligible
 * - acceptable: May deliver but has risk factors (catch-all, role accounts) → Eligible
 * - unknown: Cannot reliably determine → Eligible (cautious acceptance)
 * - invalid: Hard failures (syntax, no MX, disabled, disposable, spam trap) → Ineligible
 */
export function finalizeEligibilityAfterEmailValidation(
  emailStatus: 'valid' | 'acceptable' | 'unknown' | 'invalid',
  currentEligibilityStatus: string
): { eligibilityStatus: 'Eligible' | 'Ineligible_Email_Invalid'; reason: string } {
  // Only finalize if currently pending
  if (currentEligibilityStatus !== 'Pending_Email_Validation') {
    return { 
      eligibilityStatus: currentEligibilityStatus as any, 
      reason: 'not_pending_validation' 
    };
  }
  
  // Determine final eligibility based on 4-status email validation result
  switch (emailStatus) {
    case 'valid':
      return { eligibilityStatus: 'Eligible', reason: 'email_verified_deliverable' };
    
    case 'acceptable':
      return { eligibilityStatus: 'Eligible', reason: 'email_deliverable_with_risks' };
    
    case 'invalid':
      return { eligibilityStatus: 'Ineligible_Email_Invalid', reason: 'email_invalid' };
    
    case 'unknown':
    default:
      // Log unexpected statuses for debugging
      if (emailStatus && !['valid', 'acceptable', 'unknown', 'invalid'].includes(emailStatus)) {
        console.warn(`[EmailValidation] Unexpected email status encountered: ${emailStatus}`);
      }
      // If we can't determine validity, accept with caution (prevents blocking entire workflow)
      return { eligibilityStatus: 'Eligible', reason: 'email_status_unknown' };
  }
}

/**
 * 3-Layer Email Validation Eligibility Result
 * Note: Catch-all emails are now always Eligible (not Risky)
 */
export interface ThreeLayerEligibilityResult {
  eligibilityStatus: 'Eligible' | 'Ineligible_Email_Invalid';
  reason: string;
  isBusinessEmail: boolean;
  isCatchAll: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'unknown';
}

/**
 * Finalize eligibility status after 3-layer email validation completes
 * Implements the recommended eligibility rule:
 * - A contact is email-eligible if:
 *   - syntax_valid = true
 *   - domain_has_mx = true
 *   - deep_verification_result = deliverable
 *   - not disposable
 *   - business_email = true
 * 
 * - Catch-all emails → Mark as "RISKY" but still optional to include
 * - Disposable emails → Always NOT ELIGIBLE
 * - Invalid emails → Not Eligible
 */
export function finalizeEligibilityAfter3LayerValidation(
  validationResult: {
    status: 'valid' | 'acceptable' | 'unknown' | 'invalid';
    isBusinessEmail: boolean;
    emailEligible: boolean;
    eligibilityReason: string;
    riskLevel: 'low' | 'medium' | 'high' | 'unknown';
    isCatchAll?: boolean;
    isDisposable?: boolean;
    isFree?: boolean;
  },
  currentEligibilityStatus: string,
  options?: {
    requireBusinessEmail?: boolean;
    allowCatchAll?: boolean;
    allowFreeEmail?: boolean;
  }
): ThreeLayerEligibilityResult {
  const { 
    requireBusinessEmail = true, 
    allowCatchAll = true,
    allowFreeEmail = false 
  } = options || {};

  // Only finalize if currently pending
  if (currentEligibilityStatus !== 'Pending_Email_Validation') {
    return { 
      eligibilityStatus: currentEligibilityStatus as any, 
      reason: 'not_pending_validation',
      isBusinessEmail: validationResult.isBusinessEmail,
      isCatchAll: validationResult.isCatchAll ?? false,
      riskLevel: validationResult.riskLevel
    };
  }

  // RULE 1: Invalid emails → Always NOT ELIGIBLE
  if (validationResult.status === 'invalid') {
    return { 
      eligibilityStatus: 'Ineligible_Email_Invalid', 
      reason: `email_invalid:${validationResult.eligibilityReason}`,
      isBusinessEmail: validationResult.isBusinessEmail,
      isCatchAll: false,
      riskLevel: 'high'
    };
  }

  // RULE 2: Disposable emails → Always NOT ELIGIBLE
  if (validationResult.isDisposable) {
    return { 
      eligibilityStatus: 'Ineligible_Email_Invalid', 
      reason: 'disposable_email',
      isBusinessEmail: false,
      isCatchAll: false,
      riskLevel: 'high'
    };
  }

  // RULE 3: Free email providers → NOT ELIGIBLE (if requireBusinessEmail)
  if (requireBusinessEmail && validationResult.isFree && !allowFreeEmail) {
    return { 
      eligibilityStatus: 'Ineligible_Email_Invalid', 
      reason: 'free_email_provider',
      isBusinessEmail: false,
      isCatchAll: false,
      riskLevel: 'medium'
    };
  }

  // RULE 4: Business email requirement
  if (requireBusinessEmail && !validationResult.isBusinessEmail) {
    return { 
      eligibilityStatus: 'Ineligible_Email_Invalid', 
      reason: 'not_business_email',
      isBusinessEmail: false,
      isCatchAll: validationResult.isCatchAll ?? false,
      riskLevel: 'medium'
    };
  }

  // RULE 5: Catch-all emails → Always ELIGIBLE (user requested catch-all = eligible)
  // Note: allowCatchAll option is now deprecated; catch-all is always eligible
  if (validationResult.isCatchAll) {
    return { 
      eligibilityStatus: 'Eligible', 
      reason: 'catch_all_domain_eligible',
      isBusinessEmail: validationResult.isBusinessEmail,
      isCatchAll: true,
      riskLevel: 'medium'  // Keep tracking for analytics
    };
  }

  // RULE 6: Valid/Acceptable/Unknown → ELIGIBLE
  let reason = 'email_eligible';
  if (validationResult.status === 'valid') {
    reason = validationResult.eligibilityReason || 'email_verified_deliverable';
  } else if (validationResult.status === 'acceptable') {
    reason = 'email_deliverable_with_risks';
  } else if (validationResult.status === 'unknown') {
    reason = 'email_status_unknown';
  }

  return { 
    eligibilityStatus: 'Eligible', 
    reason,
    isBusinessEmail: validationResult.isBusinessEmail,
    isCatchAll: false,
    riskLevel: validationResult.riskLevel
  };
}

/**
 * Compute SHA256 hash for full name + company combination
 * Uses "|" separator to prevent collisions
 * Returns hex string for compatibility with PostgreSQL ENCODE(DIGEST(...), 'hex')
 * 
 * CRITICAL: Must use SAME normalization and hash algorithm as verification-suppression.ts
 * MUST match the SQL: ENCODE(DIGEST(LOWER(TRIM(...)) || '|' || LOWER(TRIM(...)), 'sha256'), 'hex')
 */
export function computeNameCompanyHash(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  companyKey: string | null | undefined
): string | null {
  // CRITICAL: All three fields must be non-empty
  if (!firstName || !lastName || !companyKey) {
    return null;
  }
  
  // Use SAME normalization as contact storage
  const firstNorm = normalize.toKey(firstName);
  const lastNorm = normalize.toKey(lastName);
  const companyNorm = normalize.companyKey(companyKey);
  
  // Construct full name from normalized first/last
  const fullName = `${firstNorm} ${lastNorm}`.trim().replace(/\s+/g, ' ').toLowerCase();
  
  // Use separator to prevent collision: "John Smith|Acme" vs "John|SmithAcme"
  const hashInput = `${fullName}|${companyNorm.toLowerCase()}`;
  
  // SHA256 hex digest (matches PostgreSQL and verification-suppression.ts)
  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

export function computeNormalizedKeys(contact: {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  contactCountry?: string | null;
  accountName?: string | null;
}) {
  const firstNameNorm = normalize.toKey(contact.firstName);
  const lastNameNorm = normalize.toKey(contact.lastName);
  const companyKey = normalize.companyKey(contact.accountName);
  
  // Compute hash for name+company matching (returns null if any field is missing)
  const nameCompanyHash = computeNameCompanyHash(
    contact.firstName,
    contact.lastName,
    contact.accountName
  );
  
  return {
    emailLower: normalize.emailLower(contact.email),
    firstNameNorm,
    lastNameNorm,
    contactCountryKey: normalize.countryKey(contact.contactCountry),
    companyKey,
    nameCompanyHash, // Include the hash for suppression matching
  };
}

export async function checkSuppression(
  campaignId: string,
  contact: {
    email?: string | null;
    cavId?: string | null;
    cavUserId?: string | null;
    fullName?: string | null;
    account_name?: string | null;
  }
): Promise<boolean> {
  const { db } = await import('../db');
  const { verificationSuppressionList } = await import('@shared/schema');
  const { eq, or, and, sql } = await import('drizzle-orm');
  
  const checks = [];
  
  if (contact.email) {
    checks.push(eq(verificationSuppressionList.emailLower, contact.email.toLowerCase()));
  }
  
  if (contact.cavId) {
    checks.push(eq(verificationSuppressionList.cavId, contact.cavId));
  }
  
  if (contact.cavUserId) {
    checks.push(eq(verificationSuppressionList.cavUserId, contact.cavUserId));
  }
  
  // Name+Company Hash matching removed per user request
  // Only check: Email, CAV ID, CAV User ID
  
  if (checks.length === 0) {
    return false;
  }
  
  const suppressed = await db
    .select()
    .from(verificationSuppressionList)
    .where(
      and(
        or(
          eq(verificationSuppressionList.campaignId, campaignId),
          sql`${verificationSuppressionList.campaignId} IS NULL`
        ),
        or(...checks)
      )
    )
    .limit(1);
  
  return suppressed.length > 0;
}

/**
 * Check if a contact was submitted in the last 2 years (730 days)
 * Submitted contacts should be excluded from eligibility for 2 years
 * 
 * @param contactId - The contact ID to check
 * @returns true if submitted within last 2 years, false otherwise
 */
export async function wasSubmittedRecently(
  contactId: string
): Promise<{ submitted: boolean; submittedAt?: Date }> {
  const { db } = await import('../db');
  const { verificationLeadSubmissions } = await import('@shared/schema');
  const { eq, gte, and } = await import('drizzle-orm');
  
  // Calculate date 2 years ago (730 days)
  const twoYearsAgo = new Date();
  twoYearsAgo.setDate(twoYearsAgo.getDate() - 730);
  
  const [submission] = await db
    .select()
    .from(verificationLeadSubmissions)
    .where(
      and(
        eq(verificationLeadSubmissions.contactId, contactId),
        gte(verificationLeadSubmissions.createdAt, twoYearsAgo)
      )
    )
    .limit(1);
  
  if (submission) {
    return { submitted: true, submittedAt: submission.createdAt };
  }
  
  return { submitted: false };
}

/**
 * Extract seniority level from job title
 * Maps C-suite → executive, VP → vp, Director → director, Manager → manager, IC → ic
 */
export function extractSeniorityLevel(title?: string | null): 'executive' | 'vp' | 'director' | 'manager' | 'ic' | 'unknown' {
  if (!title) return 'unknown';
  
  const normalized = title.toLowerCase().trim();
  
  // C-suite and executive patterns
  const executivePatterns = [
    /\b(ceo|chief executive|president|chairman|chairwoman|chairperson)\b/i,
    /\bc[a-z]o\b/i, // CTO, CFO, COO, CMO, CIO, etc.
    /\bfounder\b/i,
    /\bowner\b/i,
    /\bmanaging director\b/i,
    /\bgeneral manager\b/i, // Often C-level in many orgs
  ];
  
  // VP patterns
  const vpPatterns = [
    /\b(vp|vice president|v\.p\.)\b/i,
    /\bevp\b/i, // Executive VP
    /\bavp\b/i, // Assistant VP
    /\bsvp\b/i, // Senior VP
  ];
  
  // Director patterns
  const directorPatterns = [
    /\bdirector\b/i,
    /\bhead of\b/i,
  ];
  
  // Manager patterns
  const managerPatterns = [
    /\bmanager\b/i,
    /\bsupervisor\b/i,
    /\blead\b/i,
    /\bteam lead\b/i,
  ];
  
  // Check in order of seniority (highest to lowest)
  for (const pattern of executivePatterns) {
    if (pattern.test(normalized)) return 'executive';
  }
  
  for (const pattern of vpPatterns) {
    if (pattern.test(normalized)) return 'vp';
  }
  
  for (const pattern of directorPatterns) {
    if (pattern.test(normalized)) return 'director';
  }
  
  for (const pattern of managerPatterns) {
    if (pattern.test(normalized)) return 'manager';
  }
  
  // Default to IC (Individual Contributor)
  return 'ic';
}

/**
 * Convert seniority level to numeric score
 * executive: 5, vp: 4, director: 3, manager: 2, ic: 1, unknown: 0
 */
export function getSeniorityScore(level: string): number {
  const scoreMap: Record<string, number> = {
    executive: 5,
    vp: 4,
    director: 3,
    manager: 2,
    ic: 1,
    unknown: 0,
  };
  return scoreMap[level] || 0;
}

/**
 * Calculate title alignment score based on campaign target job titles
 * Returns a score between 0 and 1
 * - 1.0: Exact match
 * - 0.75: Contains keyword
 * - 0.5: Fuzzy match
 * - 0.0: No match
 */
export function calculateTitleAlignment(
  title?: string | null,
  targetTitles?: string[]
): number {
  // If no title, contact gets zero points (missing data)
  if (!title) {
    return 0;
  }
  
  // If title exists but no targets specified, neutral score (can't judge alignment)
  if (!targetTitles || targetTitles.length === 0) {
    return 0.5;
  }
  
  const normalized = title.toLowerCase().trim();
  let bestScore = 0;
  
  for (const target of targetTitles) {
    const targetNorm = target.toLowerCase().trim();
    
    // Exact match
    if (normalized === targetNorm) {
      bestScore = Math.max(bestScore, 1.0);
      continue;
    }
    
    // Contains keyword
    if (normalized.includes(targetNorm) || targetNorm.includes(normalized)) {
      bestScore = Math.max(bestScore, 0.75);
      continue;
    }
    
    // Fuzzy match: check if individual words match
    const titleWords = normalized.split(/\s+/);
    const targetWords = targetNorm.split(/\s+/);
    const matchedWords = titleWords.filter(word => 
      targetWords.some(tw => word.includes(tw) || tw.includes(word))
    );
    
    if (matchedWords.length > 0) {
      const fuzzyScore = 0.5 * (matchedWords.length / Math.max(titleWords.length, targetWords.length));
      bestScore = Math.max(bestScore, fuzzyScore);
    }
  }
  
  return bestScore;
}

/**
 * Calculate overall priority score combining seniority and title alignment
 * Formula: seniorityWeight * seniorityScore + titleWeight * titleAlignment
 * Default weights: 0.7 seniority, 0.3 title alignment
 */
export function calculatePriorityScore(
  seniorityLevel: string,
  titleAlignmentScore: number,
  seniorityWeight: number = 0.7,
  titleAlignmentWeight: number = 0.3
): number {
  const seniorityScore = getSeniorityScore(seniorityLevel);
  
  // Normalize seniority score to 0-1 range (divide by max score of 5)
  const normalizedSeniority = seniorityScore / 5;
  
  return (seniorityWeight * normalizedSeniority) + (titleAlignmentWeight * titleAlignmentScore);
}

/**
 * Calculate email quality score based on validation status
 * Returns a score between 0 and 1
 * - 1.0: safe_to_send, valid (best quality)
 * - 0.6: send_with_caution, risky, accept_all (medium quality)
 * - 0.4: unknown (low confidence)
 * - 0.0: invalid, disabled, disposable, spam_trap (rejected)
 */
export function calculateEmailQualityScore(
  emailValidationStatus?: string | null
): number {
  if (!emailValidationStatus) return 0.4; // Unknown/not validated
  
  const status = emailValidationStatus.toLowerCase();
  
  // Highest quality - verified deliverable
  if (status === 'safe_to_send' || status === 'valid' || status === 'ok') {
    return 1.0;
  }
  
  // Medium quality - deliverable with some risk
  if (status === 'send_with_caution' || status === 'risky' || status === 'accept_all') {
    return 0.6;
  }
  
  // Low quality - cannot verify
  if (status === 'unknown') {
    return 0.4;
  }
  
  // Rejected - invalid/problematic
  // invalid, disabled, disposable, spam_trap
  return 0.0;
}

/**
 * Calculate phone completeness score based on available phone data
 * Prioritizes CAV custom fields > mobile > contact > AI > HQ
 * Returns a score between 0 and 1
 */
export function calculatePhoneCompletenessScore(
  contact: {
    customFields?: any;
    contactMobile?: string | null;
    contactPhone?: string | null;
    aiEnrichedPhone?: string | null;
  },
  account?: {
    mainPhone?: string | null;
  }
): number {
  // Check CAV custom field phone (highest priority)
  const cavPhone = contact.customFields?.custom_cav_tel;
  if (cavPhone && typeof cavPhone === 'string' && cavPhone.trim() !== '') {
    return 1.0;
  }
  
  // Check mobile phone
  if (contact.contactMobile && contact.contactMobile.trim() !== '') {
    return 0.9;
  }
  
  // Check contact phone
  if (contact.contactPhone && contact.contactPhone.trim() !== '') {
    return 0.8;
  }
  
  // Check AI enriched phone
  if (contact.aiEnrichedPhone && contact.aiEnrichedPhone.trim() !== '') {
    return 0.5;
  }
  
  // Check account HQ phone
  if (account?.mainPhone && account.mainPhone.trim() !== '') {
    return 0.3;
  }
  
  // No phone data
  return 0.0;
}

/**
 * Calculate address completeness score based on available address data
 * Prioritizes CAV custom fields > contact > AI > HQ
 * Returns a score between 0 and 1
 * - 1.0: Complete address (street + city + postal code)
 * - 0.6: Partial address (2 of 3 components)
 * - 0.3: Minimal address (1 of 3 components)
 * - 0.0: No address data
 */
export function calculateAddressCompletenessScore(
  contact: {
    customFields?: any;
    contactAddress?: string | null;
    contactCity?: string | null;
    contactState?: string | null;
    contactPostalCode?: string | null;
    aiEnrichedAddress?: string | null;
  },
  account?: {
    hqStreet1?: string | null;
    hqCity?: string | null;
    hqPostalCode?: string | null;
  }
): number {
  // Helper to count address components
  const countComponents = (street?: string | null, city?: string | null, postal?: string | null): number => {
    let count = 0;
    if (street && street.trim() !== '') count++;
    if (city && city.trim() !== '') count++;
    if (postal && postal.trim() !== '') count++;
    return count;
  };
  
  // Helper to calculate score from component count
  const scoreFromCount = (count: number): number => {
    if (count >= 3) return 1.0; // Complete
    if (count === 2) return 0.6; // Partial
    if (count === 1) return 0.3; // Minimal
    return 0.0; // None
  };
  
  // Check CAV custom fields (highest priority)
  const cavStreet = contact.customFields?.custom_cav_addr1 || contact.customFields?.custom_cav_addr2 || contact.customFields?.custom_cav_addr3;
  const cavCity = contact.customFields?.custom_cav_town;
  const cavPostal = contact.customFields?.custom_cav_postcode;
  
  const cavScore = scoreFromCount(countComponents(cavStreet, cavCity, cavPostal));
  if (cavScore > 0) return cavScore;
  
  // Check contact address fields
  const contactScore = scoreFromCount(countComponents(
    contact.contactAddress,
    contact.contactCity,
    contact.contactPostalCode
  ));
  if (contactScore > 0) return contactScore * 0.9; // Slightly lower weight than CAV
  
  // Check AI enriched address
  if (contact.aiEnrichedAddress && contact.aiEnrichedAddress.trim() !== '') {
    return 0.5; // AI data gets medium score
  }
  
  // Check account HQ address
  const hqScore = scoreFromCount(countComponents(
    account?.hqStreet1,
    account?.hqCity,
    account?.hqPostalCode
  ));
  return hqScore * 0.4; // HQ data gets lowest weight
}

/**
 * Calculate comprehensive priority score for lead cap enforcement
 * Combines email quality, phone/address completeness, seniority, and title alignment
 * 
 * Default weights (totaling 1.0):
 * - Email quality: 30% (critical for verification campaigns)
 * - Phone completeness: 20%
 * - Address completeness: 20%
 * - Seniority: 20%
 * - Title alignment: 10%
 */
export function calculateComprehensivePriorityScore(
  contact: {
    title?: string | null;
    customFields?: any;
    contactMobile?: string | null;
    contactPhone?: string | null;
    aiEnrichedPhone?: string | null;
    contactAddress?: string | null;
    contactCity?: string | null;
    contactState?: string | null;
    contactPostalCode?: string | null;
    aiEnrichedAddress?: string | null;
    emailValidationStatus?: string | null;
  },
  account?: {
    mainPhone?: string | null;
    hqStreet1?: string | null;
    hqCity?: string | null;
    hqPostalCode?: string | null;
  },
  campaign?: {
    priorityConfig?: {
      targetJobTitles?: string[];
      seniorityWeight?: number;
      titleAlignmentWeight?: number;
      emailQualityWeight?: number;
      phoneCompletenessWeight?: number;
      addressCompletenessWeight?: number;
    };
  }
): {
  emailQualityScore: number;
  phoneCompletenessScore: number;
  addressCompletenessScore: number;
  seniorityLevel: string;
  titleAlignmentScore: number;
  comprehensivePriorityScore: number;
} {
  // Calculate individual scores
  const emailQualityScore = calculateEmailQualityScore(contact.emailValidationStatus);
  const phoneCompletenessScore = calculatePhoneCompletenessScore(contact, account);
  const addressCompletenessScore = calculateAddressCompletenessScore(contact, account);
  
  const seniorityLevel = extractSeniorityLevel(contact.title);
  const titleAlignmentScore = calculateTitleAlignment(
    contact.title,
    campaign?.priorityConfig?.targetJobTitles
  );
  
  // Get weights from campaign config or use defaults
  const emailWeight = campaign?.priorityConfig?.emailQualityWeight ?? 0.30;
  const phoneWeight = campaign?.priorityConfig?.phoneCompletenessWeight ?? 0.20;
  const addressWeight = campaign?.priorityConfig?.addressCompletenessWeight ?? 0.20;
  const seniorityWeight = campaign?.priorityConfig?.seniorityWeight ?? 0.20;
  const titleWeight = campaign?.priorityConfig?.titleAlignmentWeight ?? 0.10;
  
  // Normalize seniority to 0-1 scale
  const normalizedSeniority = getSeniorityScore(seniorityLevel) / 5;
  
  // Calculate comprehensive score (0-1 range)
  const comprehensivePriorityScore =
    (emailWeight * emailQualityScore) +
    (phoneWeight * phoneCompletenessScore) +
    (addressWeight * addressCompletenessScore) +
    (seniorityWeight * normalizedSeniority) +
    (titleWeight * titleAlignmentScore);
  
  return {
    emailQualityScore,
    phoneCompletenessScore,
    addressCompletenessScore,
    seniorityLevel,
    titleAlignmentScore,
    comprehensivePriorityScore,
  };
}

/**
 * Get or create account cap status for a campaign-account pair
 */
export async function getOrCreateAccountCapStatus(
  campaignId: string,
  accountId: string,
  cap: number
) {
  const { db } = await import('../db');
  const { verificationAccountCapStatus } = await import('@shared/schema');
  const { eq, and } = await import('drizzle-orm');
  
  const [existing] = await db
    .select()
    .from(verificationAccountCapStatus)
    .where(
      and(
        eq(verificationAccountCapStatus.campaignId, campaignId),
        eq(verificationAccountCapStatus.accountId, accountId)
      )
    )
    .limit(1);
  
  if (existing) {
    return existing;
  }
  
  // Create new status record
  const [newStatus] = await db
    .insert(verificationAccountCapStatus)
    .values({
      campaignId,
      accountId,
      cap,
      submittedCount: 0,
      reservedCount: 0,
      eligibleCount: 0,
    })
    .returning();
  
  return newStatus;
}

/**
 * Update account cap status counts
 */
export async function updateAccountCapStatus(
  campaignId: string,
  accountId: string,
  updates: {
    submittedCount?: number;
    reservedCount?: number;
    eligibleCount?: number;
  }
) {
  const { db } = await import('../db');
  const { verificationAccountCapStatus } = await import('@shared/schema');
  const { eq, and, sql } = await import('drizzle-orm');
  
  await db
    .update(verificationAccountCapStatus)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verificationAccountCapStatus.campaignId, campaignId),
        eq(verificationAccountCapStatus.accountId, accountId)
      )
    );
}

/**
 * Recalculate account cap status counts from actual contact data
 */
export async function recalculateAccountCapStatus(
  campaignId: string,
  accountId: string
) {
  const { db } = await import('../db');
  const { verificationContacts, verificationLeadSubmissions, verificationAccountCapStatus } = await import('@shared/schema');
  const { eq, and, count, sql } = await import('drizzle-orm');
  
  // Count submitted contacts
  const [submittedResult] = await db
    .select({ count: count() })
    .from(verificationLeadSubmissions)
    .where(
      and(
        eq(verificationLeadSubmissions.campaignId, campaignId),
        eq(verificationLeadSubmissions.accountId, accountId)
      )
    );
  
  // Count reserved contacts
  const [reservedResult] = await db
    .select({ count: count() })
    .from(verificationContacts)
    .where(
      and(
        eq(verificationContacts.campaignId, campaignId),
        eq(verificationContacts.accountId, accountId),
        eq(verificationContacts.reservedSlot, true)
      )
    );
  
  // Count eligible contacts
  const [eligibleResult] = await db
    .select({ count: count() })
    .from(verificationContacts)
    .where(
      and(
        eq(verificationContacts.campaignId, campaignId),
        eq(verificationContacts.accountId, accountId),
        eq(verificationContacts.eligibilityStatus, 'Eligible')
      )
    );
  
  // Update the cap status
  await db
    .update(verificationAccountCapStatus)
    .set({
      submittedCount: submittedResult.count,
      reservedCount: reservedResult.count,
      eligibleCount: eligibleResult.count,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verificationAccountCapStatus.campaignId, campaignId),
        eq(verificationAccountCapStatus.accountId, accountId)
      )
    );
}

/**
 * Enforce account lead cap with priority-based selection (OPTIMIZED)
 * This function:
 * 1. Fetches all qualified contacts per account (Eligible status)
 * 2. Calculates comprehensive priority scores (email quality + phone + address + seniority + title)
 * 3. Selects TOP N contacts per account based on priority score using SQL window functions
 * 4. Keeps top contacts as Eligible with reservedSlot=true
 * 5. Marks remaining contacts with reservedSlot=false
 * 
 * OPTIMIZED: Uses set-based SQL queries instead of individual UPDATEs
 * - Single query with window functions to rank contacts
 * - Bulk UPDATEs using WHERE id = ANY($1) pattern
 * - Processes accounts in chunks of 250 to bound memory
 * - Progress reporting every 250 accounts
 * 
 * @param campaignId - Verification campaign ID
 * @param cap - Lead cap per account (default: 10)
 * @param progressCallback - Optional callback for progress updates (accountsProcessed, totalAccounts)
 * @returns Statistics about cap enforcement
 */
export async function enforceAccountCapWithPriority(
  campaignId: string,
  cap: number = 10,
  progressCallback?: (accountsProcessed: number, totalAccounts: number) => void
): Promise<{
  processed: number;
  accountsProcessed: number;
  contactsMarkedEligible: number;
  contactsMarkedCapReached: number;
  errors: string[];
}> {
  const { db } = await import('../db');
  const { verificationContacts, verificationCampaigns, accounts } = await import('@shared/schema');
  const { eq, and, inArray, sql } = await import('drizzle-orm');
  
  const stats = {
    processed: 0,
    accountsProcessed: 0,
    contactsMarkedEligible: 0,
    contactsMarkedCapReached: 0,
    errors: [] as string[],
  };
  
  try {
    // Get campaign
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) {
      stats.errors.push('Campaign not found');
      return stats;
    }
    
    // STEP 0: Clear reserved_slot from any non-eligible or suppressed contacts
    // This handles contacts that were reserved before but are now Out_of_Scope/suppressed
    const clearResult = await db.execute(sql`
      UPDATE verification_contacts
      SET reserved_slot = false, updated_at = NOW()
      WHERE campaign_id = ${campaignId}
        AND deleted = false
        AND reserved_slot = true
        AND (eligibility_status != 'Eligible' OR suppressed = true)
    `);
    console.log(`[Cap Enforcement] Cleared reserved_slot from non-eligible/suppressed contacts`);
    
    // Get all accounts with contacts in this campaign
    const accountResults = await db
      .selectDistinct({ accountId: verificationContacts.accountId })
      .from(verificationContacts)
      .where(
        and(
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.deleted, false),
          sql`${verificationContacts.accountId} IS NOT NULL`
        )
      );
    
    const totalAccounts = accountResults.length;
    console.log(`[Cap Enforcement] Processing ${totalAccounts} accounts for campaign ${campaignId}`);
    
    // Process accounts in chunks of 250 to bound memory
    const CHUNK_SIZE = 250;
    const accountIds = accountResults.map(r => r.accountId).filter(Boolean) as string[];
    
    for (let chunkStart = 0; chunkStart < accountIds.length; chunkStart += CHUNK_SIZE) {
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, accountIds.length);
      const accountChunk = accountIds.slice(chunkStart, chunkEnd);
      
      try {
        // Fetch all contacts for this chunk of accounts with their account data
        // This single query replaces the per-account loop
        const contactsInChunk = await db
          .select({
            id: verificationContacts.id,
            accountId: verificationContacts.accountId,
            sourceType: verificationContacts.sourceType,
            cavId: verificationContacts.cavId,
            cavUserId: verificationContacts.cavUserId,
            title: verificationContacts.title,
            customFields: verificationContacts.customFields,
            mobile: verificationContacts.mobile,
            phone: verificationContacts.phone,
            aiEnrichedPhone: verificationContacts.aiEnrichedPhone,
            contactAddress1: verificationContacts.contactAddress1,
            contactCity: verificationContacts.contactCity,
            contactState: verificationContacts.contactState,
            contactPostal: verificationContacts.contactPostal,
            aiEnrichedAddress1: verificationContacts.aiEnrichedAddress1,
            emailStatus: verificationContacts.emailStatus,
            mainPhone: accounts.mainPhone,
            hqStreet1: accounts.hqStreet1,
            hqCity: accounts.hqCity,
            hqPostalCode: accounts.hqPostalCode,
          })
          .from(verificationContacts)
          .leftJoin(accounts, eq(verificationContacts.accountId, accounts.id))
          .where(
            and(
              eq(verificationContacts.campaignId, campaignId),
              inArray(verificationContacts.accountId, accountChunk),
              eq(verificationContacts.deleted, false),
              eq(verificationContacts.suppressed, false),
              eq(verificationContacts.eligibilityStatus, 'Eligible')
            )
          );
        
        if (contactsInChunk.length === 0) {
          stats.accountsProcessed += accountChunk.length;
          continue;
        }
        
        // Calculate priority scores in memory (complex business logic)
        // Group by account for processing
        const contactsByAccount = new Map<string, typeof contactsInChunk>();
        for (const contact of contactsInChunk) {
          if (!contact.accountId) continue;
          if (!contactsByAccount.has(contact.accountId)) {
            contactsByAccount.set(contact.accountId, []);
          }
          contactsByAccount.get(contact.accountId)!.push(contact);
        }
        
        // Batch update arrays
        const topContactIds: string[] = [];
        const topContactUpdates: any[] = [];
        const excessContactIds: string[] = [];
        const excessContactUpdates: any[] = [];
        
        // Process each account in the chunk
        for (const [accountId, contacts] of contactsByAccount.entries()) {
          try {
            // Calculate priority scores for all contacts in this account
            const contactsWithScores = contacts.map(contact => {
              const scores = calculateComprehensivePriorityScore(
                {
                  title: contact.title,
                  customFields: contact.customFields,
                  contactMobile: contact.mobile,
                  contactPhone: contact.phone,
                  aiEnrichedPhone: contact.aiEnrichedPhone,
                  contactAddress: contact.contactAddress1,
                  contactCity: contact.contactCity,
                  contactState: contact.contactState,
                  contactPostalCode: contact.contactPostal,
                  aiEnrichedAddress: contact.aiEnrichedAddress1,
                  emailValidationStatus: contact.emailStatus,
                },
                {
                  mainPhone: contact.mainPhone,
                  hqStreet1: contact.hqStreet1,
                  hqCity: contact.hqCity,
                  hqPostalCode: contact.hqPostalCode,
                },
                campaign as any
              );
              
              const cavPriority = calculateContactPriority(
                {
                  phone: contact.phone,
                  mobile: contact.mobile,
                  aiEnrichedPhone: contact.aiEnrichedPhone,
                  cavId: contact.cavId,
                  cavUserId: contact.cavUserId,
                  title: contact.title,
                  contactAddress1: contact.contactAddress1,
                  contactAddress2: null,
                  contactCity: contact.contactCity,
                  contactState: contact.contactState,
                  contactPostal: contact.contactPostal,
                  aiEnrichedAddress1: contact.aiEnrichedAddress1,
                  aiEnrichedAddress2: null,
                  aiEnrichedCity: null,
                  aiEnrichedState: null,
                  aiEnrichedPostal: null,
                },
                campaign
              );
              
              return {
                id: contact.id,
                sourceType: contact.sourceType,
                cavId: contact.cavId,
                cavUserId: contact.cavUserId,
                ...scores,
                cavPriorityScore: cavPriority.score,
                cavPriorityTier: cavPriority.tier,
              };
            });
            
            // Sort ALL contacts with Client Provided + CAV ID prioritized (no phone filtering)
            // Phone requirement is checked at export/delivery stage, not cap enforcement
            contactsWithScores.sort((a, b) => {
              const aIsClientWithCav = a.sourceType === 'Client_Provided' && (a.cavId || a.cavUserId);
              const bIsClientWithCav = b.sourceType === 'Client_Provided' && (b.cavId || b.cavUserId);
              
              if (aIsClientWithCav && !bIsClientWithCav) return -1;
              if (!aIsClientWithCav && bIsClientWithCav) return 1;
              
              const aIsClient = a.sourceType === 'Client_Provided';
              const bIsClient = b.sourceType === 'Client_Provided';
              
              if (aIsClient && !bIsClient) return -1;
              if (!aIsClient && bIsClient) return 1;
              
              if (a.cavPriorityScore !== b.cavPriorityScore) {
                return b.cavPriorityScore - a.cavPriorityScore;
              }
              
              return b.comprehensivePriorityScore - a.comprehensivePriorityScore;
            });
            
            // Select top N contacts (within cap)
            const topContacts = contactsWithScores.slice(0, cap);
            const excessContacts = contactsWithScores.slice(cap);
            
            // Collect top contact updates
            for (const item of topContacts) {
              topContactIds.push(item.id);
              topContactUpdates.push({
                id: item.id,
                priorityScore: item.cavPriorityScore.toFixed(2),
                emailQualityScore: item.emailQualityScore.toFixed(2),
                phoneCompletenessScore: item.phoneCompletenessScore.toFixed(2),
                addressCompletenessScore: item.addressCompletenessScore.toFixed(2),
                comprehensivePriorityScore: item.comprehensivePriorityScore.toFixed(2),
                seniorityLevel: item.seniorityLevel,
                titleAlignmentScore: item.titleAlignmentScore.toFixed(2),
              });
            }
            
            // Collect excess contact updates
            for (const item of excessContacts) {
              excessContactIds.push(item.id);
              excessContactUpdates.push({
                id: item.id,
                priorityScore: item.cavPriorityScore.toFixed(2),
                emailQualityScore: item.emailQualityScore.toFixed(2),
                phoneCompletenessScore: item.phoneCompletenessScore.toFixed(2),
                addressCompletenessScore: item.addressCompletenessScore.toFixed(2),
                comprehensivePriorityScore: item.comprehensivePriorityScore.toFixed(2),
                seniorityLevel: item.seniorityLevel,
                titleAlignmentScore: item.titleAlignmentScore.toFixed(2),
              });
            }
            
            stats.processed += contacts.length;
            
          } catch (error: any) {
            stats.errors.push(`Error processing account ${accountId}: ${error.message}`);
            console.error(`[Cap Enforcement] Error processing account ${accountId}:`, error);
          }
        }
        
        // Execute bulk updates for this chunk
        const now = new Date();
        
        // Bulk update top contacts (reservedSlot = true)
        if (topContactIds.length > 0) {
          await db.execute(sql`
            UPDATE verification_contacts
            SET 
              reserved_slot = true,
              priority_score = updates.priority_score,
              email_quality_score = updates.email_quality_score,
              phone_completeness_score = updates.phone_completeness_score,
              address_completeness_score = updates.address_completeness_score,
              comprehensive_priority_score = updates.comprehensive_priority_score,
              seniority_level = updates.seniority_level::seniority_level,
              title_alignment_score = updates.title_alignment_score,
              updated_at = ${now}
            FROM (
              SELECT * FROM json_to_recordset(${JSON.stringify(topContactUpdates)}) 
              AS t(
                id text,
                priority_score numeric,
                email_quality_score numeric,
                phone_completeness_score numeric,
                address_completeness_score numeric,
                comprehensive_priority_score numeric,
                seniority_level text,
                title_alignment_score numeric
              )
            ) AS updates
            WHERE verification_contacts.id = updates.id
          `);
          stats.contactsMarkedEligible += topContactIds.length;
        }
        
        // Bulk update excess contacts (reservedSlot = false)
        if (excessContactIds.length > 0) {
          await db.execute(sql`
            UPDATE verification_contacts
            SET 
              reserved_slot = false,
              priority_score = updates.priority_score,
              email_quality_score = updates.email_quality_score,
              phone_completeness_score = updates.phone_completeness_score,
              address_completeness_score = updates.address_completeness_score,
              comprehensive_priority_score = updates.comprehensive_priority_score,
              seniority_level = updates.seniority_level::seniority_level,
              title_alignment_score = updates.title_alignment_score,
              updated_at = ${now}
            FROM (
              SELECT * FROM json_to_recordset(${JSON.stringify(excessContactUpdates)}) 
              AS t(
                id text,
                priority_score numeric,
                email_quality_score numeric,
                phone_completeness_score numeric,
                address_completeness_score numeric,
                comprehensive_priority_score numeric,
                seniority_level text,
                title_alignment_score numeric
              )
            ) AS updates
            WHERE verification_contacts.id = updates.id
          `);
          stats.contactsMarkedCapReached += excessContactIds.length;
        }
        
        stats.accountsProcessed += accountChunk.length;
        
        // Progress reporting every 250 accounts (chunk size)
        if (progressCallback) {
          progressCallback(stats.accountsProcessed, totalAccounts);
        }
        
        // Console logging every 1000 accounts
        if (stats.accountsProcessed % 1000 === 0 || stats.accountsProcessed === totalAccounts) {
          console.log(`[Cap Enforcement] Progress: ${stats.accountsProcessed}/${totalAccounts} accounts, ${stats.contactsMarkedEligible} eligible, ${stats.contactsMarkedCapReached} cap reached`);
        }
        
      } catch (error: any) {
        stats.errors.push(`Error processing chunk ${chunkStart}-${chunkEnd}: ${error.message}`);
        console.error(`[Cap Enforcement] Error processing chunk:`, error);
      }
    }
    
    console.log(`[Cap Enforcement] Complete: ${stats.accountsProcessed} accounts, ${stats.contactsMarkedEligible} eligible, ${stats.contactsMarkedCapReached} cap reached`);
    
  } catch (error: any) {
    stats.errors.push(`Fatal error: ${error.message}`);
    console.error('[Cap Enforcement] Fatal error:', error);
  }
  
  return stats;
}

/**
 * Comprehensive eligibility evaluation with cap enforcement and priority scoring
 * This function:
 * 1. Evaluates basic eligibility (geo, title, email required)
 * 2. Checks if account has reached cap
 * 3. Calculates priority scores (seniority + title alignment)
 * 4. Returns comprehensive result for contact update
 * 
 * Email validation runs separately and doesn't affect eligibility.
 */
export async function evaluateEligibilityWithCap(
  contact: {
    title?: string | null;
    contactCountry?: string | null;
    email?: string | null;
    accountId?: string | null;
  },
  campaign: VerificationCampaign,
  email?: string | null,
  additionalContext?: {
    firstName?: string | null;
    lastName?: string | null;
    companyIndustry?: string | null;
    companyDescription?: string | null;
    companyName?: string | null;
    companyLinkedinUrl?: string | null;
    aiCompanyLinkedinUrl?: string | null;
    aiEnrichedIndustry?: string | null;
    employmentType?: string | null;
    timeInCurrentPositionMonths?: number | null;
    timeInCurrentCompanyMonths?: number | null;
  }
): Promise<{
  eligibilityStatus: 'Eligible' | 'Out_of_Scope' | 'Ineligible_Cap_Reached';
  eligibilityReason: string;
  seniorityLevel: 'executive' | 'vp' | 'director' | 'manager' | 'ic' | 'unknown';
  titleAlignmentScore: number;
  priorityScore: number;
}> {
  // First, evaluate basic eligibility (geo, title, email required)
  const basicEligibility = evaluateEligibility(
    contact.title,
    contact.contactCountry,
    campaign,
    email || contact.email,
    additionalContext
  );
  
  // Calculate priority scores regardless of eligibility status (needed for sorting)
  const seniorityLevel = extractSeniorityLevel(contact.title);
  const titleAlignmentScore = calculateTitleAlignment(
    contact.title,
    campaign.priorityConfig?.targetJobTitles
  );
  const priorityScore = calculatePriorityScore(
    seniorityLevel,
    titleAlignmentScore,
    campaign.priorityConfig?.seniorityWeight,
    campaign.priorityConfig?.titleAlignmentWeight
  );
  
  // If not basically eligible (Out_of_Scope), return early
  if (basicEligibility.status === 'Out_of_Scope') {
    return {
      eligibilityStatus: basicEligibility.status,
      eligibilityReason: basicEligibility.reason,
      seniorityLevel,
      titleAlignmentScore,
      priorityScore,
    };
  }
  
  // At this point, contact passed basic eligibility checks
  // Now check account cap enforcement
  
  // If no account ID, can't check cap - mark eligible
  if (!contact.accountId) {
    return {
      eligibilityStatus: 'Eligible',
      eligibilityReason: 'eligible_no_account_id',
      seniorityLevel,
      titleAlignmentScore,
      priorityScore,
    };
  }
  
  // Check account cap status
  const cap = campaign.leadCapPerAccount || 10;
  const capStatus = await getOrCreateAccountCapStatus(
    campaign.id,
    contact.accountId,
    cap
  );
  
  // Check if cap reached
  const totalCommitted = capStatus.submittedCount + capStatus.reservedCount;
  if (totalCommitted >= cap) {
    return {
      eligibilityStatus: 'Ineligible_Cap_Reached',
      eligibilityReason: `account_cap_reached_${cap}`,
      seniorityLevel,
      titleAlignmentScore,
      priorityScore,
    };
  }
  
  // Contact is eligible
  return {
    eligibilityStatus: 'Eligible',
    eligibilityReason: 'eligible',
    seniorityLevel,
    titleAlignmentScore,
    priorityScore,
  };
}
