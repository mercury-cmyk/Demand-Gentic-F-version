import tldts from 'tldts';

/**
 * Domain normalization and matching utilities for Phase 21 Domain Sets
 */

/**
 * Normalize a domain by:
 * - Converting to lowercase
 * - Removing common prefixes (www., mail., m., ftp., web., smtp.)
 * - Removing protocol (http://, https://)
 * - Removing trailing slashes
 * - Extracting root domain
 */
export function normalizeDomain(domain: string): string {
  if (!domain) return '';
  
  let normalized = domain.toLowerCase().trim();
  
  // Remove protocol
  normalized = normalized.replace(/^(https?:\/\/)/, '');
  
  // Remove trailing slash
  normalized = normalized.replace(/\/$/, '');
  
  // Remove common subdomains
  const subdomainPrefixes = ['www.', 'mail.', 'm.', 'ftp.', 'web.', 'smtp.', 'webmail.'];
  for (const prefix of subdomainPrefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.substring(prefix.length);
      break;
    }
  }
  
  // Extract just the domain part (remove paths, query strings, etc.)
  const domainMatch = normalized.match(/^([a-z0-9.-]+\.[a-z]{2,})/);
  if (domainMatch) {
    normalized = domainMatch[1];
  }
  
  return normalized;
}

/**
 * Extract the root domain using Mozilla Public Suffix List
 * Correctly handles multi-level TLDs (gov.uk, ac.uk, k12.ca.us, etc.)
 * 
 * Examples:
 * - "portal.mail.microsoft.com" → "microsoft.com"
 * - "department.gov.uk" → "department.gov.uk" (NOT "gov.uk"!)
 * - "university.ac.uk" → "university.ac.uk"
 * - "www.example.co.uk" → "example.co.uk"
 * - "mail.acme.org" → "acme.org"
 * 
 * Uses tldts library for accurate public suffix list parsing.
 */
export function extractRootDomain(input: string): string {
  if (!input) return '';
  
  // tldts.getDomain() correctly extracts the root domain using public suffix list
  // It handles URLs, hostnames, and normalized domains
  const rootDomain = tldts.getDomain(input);
  
  // Return the extracted domain or empty string if invalid
  return rootDomain || '';
}

/**
 * Validate if a string is a valid domain
 */
export function isValidDomain(domain: string): boolean {
  const normalized = normalizeDomain(domain);
  
  // Must have at least one dot and valid TLD pattern
  const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/;
  
  return domainRegex.test(normalized);
}

/**
 * Detect and fix common domain typos (e.g., example,com → example.com)
 */
export function fixCommonDomainTypos(domain: string): string {
  let fixed = domain.trim();
  
  // Fix comma instead of dot before TLD
  fixed = fixed.replace(/,([a-z]{2,})$/i, '.$1');
  
  // Fix space before TLD
  fixed = fixed.replace(/\s+\.([a-z]{2,})$/i, '.$1');
  
  // Fix missing dot before common TLDs
  const commonTLDs = ['com', 'org', 'net', 'edu', 'gov', 'io', 'co', 'uk', 'us'];
  for (const tld of commonTLDs) {
    const regex = new RegExp(`([a-z0-9])${tld}$`, 'i');
    if (regex.test(fixed) && !fixed.includes('.')) {
      fixed = fixed.replace(regex, `$1.${tld}`);
      break;
    }
  }
  
  return fixed;
}

/**
 * Calculate Levenshtein distance between two strings (for fuzzy matching)
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Calculate similarity score between two strings (0 to 1)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1.0;
  
  const distance = levenshteinDistance(str1, str2);
  return 1.0 - (distance / maxLength);
}

/**
 * Extract company name from domain (e.g., acme.com → Acme)
 */
export function extractCompanyNameFromDomain(domain: string): string {
  const normalized = normalizeDomain(domain);
  
  // Get the part before the TLD
  const parts = normalized.split('.');
  if (parts.length >= 2) {
    const name = parts[0];
    // Title case the name
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  
  return normalized;
}

/**
 * Parse CSV content and extract domains
 * Supports formats: domain, domain,account_name, domain,account_name,notes
 */
export function parseDomainsFromCSV(csvContent: string): Array<{
  domain: string;
  accountName?: string;
  notes?: string;
}> {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
  const results: Array<{ domain: string; accountName?: string; notes?: string }> = [];
  
  for (const line of lines) {
    // Skip header row if it looks like a header
    if (line.toLowerCase().includes('domain') && line.toLowerCase().includes('name')) {
      continue;
    }
    
    const parts = line.split(',').map(p => p.trim());
    if (parts.length === 0 || !parts[0]) continue;
    
    const domain = parts[0];
    const accountName = parts[1] || undefined;
    const notes = parts[2] || undefined;
    
    results.push({ domain, accountName, notes });
  }
  
  return results;
}

/**
 * Deduplicate domains array (normalized comparison)
 */
export function deduplicateDomains(domains: string[]): {
  unique: string[];
  duplicates: string[];
} {
  const seen = new Set<string>();
  const unique: string[] = [];
  const duplicates: string[] = [];
  
  for (const domain of domains) {
    const normalized = normalizeDomain(domain);
    
    if (seen.has(normalized)) {
      duplicates.push(domain);
    } else {
      seen.add(normalized);
      unique.push(domain);
    }
  }
  
  return { unique, duplicates };
}

/**
 * Get match type and confidence based on similarity
 * Supports matching by domain, account name, or both
 */
export function getMatchTypeAndConfidence(
  inputDomain: string,
  inputAccountName: string | undefined,
  accountDomain: string,
  accountName?: string
): { matchType: 'exact' | 'fuzzy' | 'none'; confidence: number; matchedBy?: 'domain' | 'name' | 'both' } {
  let bestMatch: { matchType: 'exact' | 'fuzzy' | 'none'; confidence: number; matchedBy?: 'domain' | 'name' | 'both' } = {
    matchType: 'none',
    confidence: 0
  };

  // Domain matching (if input domain provided)
  if (inputDomain && inputDomain.trim()) {
    const normalizedInputDomain = normalizeDomain(inputDomain);
    const normalizedAccountDomain = normalizeDomain(accountDomain);
    
    // Exact domain match
    if (normalizedInputDomain === normalizedAccountDomain) {
      bestMatch = { matchType: 'exact', confidence: 1.0, matchedBy: 'domain' };
    } else {
      // Fuzzy domain match
      const domainSimilarity = calculateSimilarity(normalizedInputDomain, normalizedAccountDomain);
      const distance = levenshteinDistance(normalizedInputDomain, normalizedAccountDomain);
      
      if (domainSimilarity >= 0.85 && distance <= 3) {
        bestMatch = { 
          matchType: 'fuzzy', 
          confidence: parseFloat(domainSimilarity.toFixed(2)),
          matchedBy: 'domain'
        };
      }
    }
  }
  
  // Account name matching (if input account name provided)
  if (inputAccountName && inputAccountName.trim() && accountName) {
    const normalizedInputName = inputAccountName.toLowerCase().trim();
    const normalizedAccountName = accountName.toLowerCase().trim();
    
    // Remove common suffixes for better matching
    const cleanName = (name: string) => {
      return name
        .replace(/\b(inc|llc|ltd|corp|corporation|company|co|group|gmbh|sa|ag|plc)\b\.?$/gi, '')
        .trim();
    };
    
    const cleanedInputName = cleanName(normalizedInputName);
    const cleanedAccountName = cleanName(normalizedAccountName);
    
    // Exact name match (with and without suffixes)
    if (normalizedInputName === normalizedAccountName || cleanedInputName === cleanedAccountName) {
      // If we already have exact domain match, this is a "both" match
      if (bestMatch.matchType === 'exact' && bestMatch.matchedBy === 'domain') {
        return { matchType: 'exact', confidence: 1.0, matchedBy: 'both' };
      }
      // Name exact match is stronger than fuzzy domain match
      if (bestMatch.confidence < 1.0) {
        bestMatch = { matchType: 'exact', confidence: 1.0, matchedBy: 'name' };
      }
    } else {
      // Check if one name contains the other (for cases like "Acme" vs "Acme Corporation")
      if (cleanedAccountName.includes(cleanedInputName) || cleanedInputName.includes(cleanedAccountName)) {
        const nameConfidence = 0.95; // Very high confidence for contains match
        if (nameConfidence > bestMatch.confidence) {
          bestMatch = { matchType: 'fuzzy', confidence: nameConfidence, matchedBy: 'name' };
        }
      } else {
        // Fuzzy name match with improved thresholds
        const nameSimilarity = calculateSimilarity(cleanedInputName, cleanedAccountName);
        const nameDistance = levenshteinDistance(cleanedInputName, cleanedAccountName);
        
        // More lenient thresholds for company names:
        // - 75% similarity (was 85%)
        // - Distance based on name length (20% of longer string length)
        const maxDistance = Math.max(Math.ceil(Math.max(cleanedInputName.length, cleanedAccountName.length) * 0.2), 3);
        
        if (nameSimilarity >= 0.75 && nameDistance <= maxDistance) {
          const nameConfidence = parseFloat(nameSimilarity.toFixed(2));
          
          // If we have both domain and name fuzzy matches, combine confidence
          if (bestMatch.matchType === 'fuzzy' && bestMatch.matchedBy === 'domain') {
            const combinedConfidence = parseFloat(((bestMatch.confidence + nameConfidence) / 2).toFixed(2));
            bestMatch = {
              matchType: 'fuzzy',
              confidence: Math.max(combinedConfidence, bestMatch.confidence),
              matchedBy: 'both'
            };
          } else if (nameConfidence > bestMatch.confidence) {
            bestMatch = { matchType: 'fuzzy', confidence: nameConfidence, matchedBy: 'name' };
          }
        }
      }
    }
  }
  
  return bestMatch;
}
