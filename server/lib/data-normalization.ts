import tldts from 'tldts';

/**
 * Data Normalization Utilities
 * 
 * Handles normalization of company and contact data fields per CSV import/export rules:
 * - Domain normalization (naked domain, lowercase)
 * - LinkedIn URL normalization
 * - Web technologies parsing
 * - Duration parsing (time in position/company)
 */

/**
 * Normalize website domain to naked domain format
 * Examples:
 *   https://www.aircanada.com/path → aircanada.com
 *   http://portal.microsoft.com → microsoft.com
 *   WWW.GOOGLE.COM → google.com
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;

  try {
    // Remove whitespace
    let domain = input.trim();
    
    // Remove scheme (http://, https://, etc.)
    domain = domain.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    
    // Remove path, query, and fragment
    domain = domain.split('/')[0].split('?')[0].split('#')[0];
    
    // Remove port
    domain = domain.split(':')[0];
    
    // Use tldts to extract root domain (handles subdomains correctly)
    const parsed = tldts.parse(domain);
    if (parsed.domain) {
      return parsed.domain.toLowerCase();
    }
    
    // Fallback: just lowercase and return
    return domain.toLowerCase();
  } catch (error) {
    console.error('Domain normalization error:', error);
    return null;
  }
}

/**
 * Normalize LinkedIn URL to standard format
 * Examples:
 *   linkedin.com/company/air-canada → https://www.linkedin.com/company/air-canada
 *   http://ca.linkedin.com/company/air-canada/ → https://www.linkedin.com/company/air-canada
 */
export function normalizeLinkedInUrl(input: string | null | undefined): string | null {
  if (!input) return null;

  try {
    let url = input.trim();
    
    // Remove scheme if present
    url = url.replace(/^https?:\/\//i, '');
    
    // Remove any subdomain variations (www., ca., uk., etc.)
    url = url.replace(/^[a-z]{2,3}\.linkedin\.com/i, 'linkedin.com');
    url = url.replace(/^www\.linkedin\.com/i, 'linkedin.com');
    
    // Remove trailing slash
    url = url.replace(/\/$/, '');
    
    // Extract path
    const path = url.replace(/^linkedin\.com\//i, '');
    
    // Return normalized URL
    return `https://www.linkedin.com/${path}`;
  } catch (error) {
    console.error('LinkedIn URL normalization error:', error);
    return null;
  }
}

/**
 * Parse web technologies field
 * Detects if input is a URL or comma-separated list
 * Returns both raw string and parsed JSON array
 */
export function parseWebTechnologies(input: string | null | undefined): {
  raw: string | null;
  json: string[] | null;
} {
  if (!input) {
    return { raw: null, json: null };
  }

  const trimmed = input.trim();
  
  // Check if it's a URL
  if (trimmed.match(/^https?:\/\//i)) {
    return {
      raw: trimmed,
      json: null, // URL only, no list to parse
    };
  }
  
  // Parse as comma-separated list
  const technologies = trimmed
    .split(',')
    .map(tech => tech.trim().toLowerCase())
    .filter(tech => tech.length > 0);
  
  return {
    raw: trimmed,
    json: technologies.length > 0 ? technologies : null,
  };
}

/**
 * Parse duration string to months
 * Examples:
 *   "2 years" → 24
 *   "6 months" → 6
 *   "1.5 years" → 18
 *   "2 years 3 months" → 27
 *   "Less than 1 year" → null (unparseable)
 */
export function parseDurationToMonths(input: string | null | undefined): number | null {
  if (!input) return null;

  try {
    const lower = input.toLowerCase().trim();
    let totalMonths = 0;

    // Match years
    const yearsMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:year|yr)/);
    if (yearsMatch) {
      totalMonths += Math.round(parseFloat(yearsMatch[1]) * 12);
    }

    // Match months
    const monthsMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:month|mo)/);
    if (monthsMatch) {
      totalMonths += Math.round(parseFloat(monthsMatch[1]));
    }

    return totalMonths > 0 ? totalMonths : null;
  } catch (error) {
    console.error('Duration parsing error:', error);
    return null;
  }
}

/**
 * Parse founded date and determine precision
 * Examples:
 *   "2020" → { date: "2020-01-01", precision: "year" }
 *   "2020-05-15" → { date: "2020-05-15", precision: "full" }
 *   "05/15/2020" → { date: "2020-05-15", precision: "full" }
 */
export function parseFoundedDate(input: string | null | undefined): {
  date: string | null;
  precision: 'year' | 'full' | null;
} {
  if (!input) {
    return { date: null, precision: null };
  }

  const trimmed = input.trim();
  
  // YYYY format (year only)
  if (/^\d{4}$/.test(trimmed)) {
    return {
      date: `${trimmed}-01-01`,
      precision: 'year',
    };
  }
  
  // YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return {
      date: trimmed,
      precision: 'full',
    };
  }
  
  // MM/DD/YYYY or DD/MM/YYYY format (ambiguous, assume MM/DD/YYYY for US-centric B2B)
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, '0');
    const day = slashMatch[2].padStart(2, '0');
    const year = slashMatch[3];
    return {
      date: `${year}-${month}-${day}`,
      precision: 'full',
    };
  }
  
  return { date: null, precision: null };
}

/**
 * Format large numbers without scientific notation for CSV export
 * IMPORTANT: Works with strings to preserve exact precision and trailing zeros
 * Examples:
 *   "1000000001" → "1000000001"
 *   "1000000001.50" → "1000000001.50" (preserves trailing zero)
 *   1.5e9 → "1500000000.00"
 */
export function formatNumberForCsv(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '';
  
  // If already a string, validate and return as-is (preserves exact precision including trailing zeros)
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return '';
    
    // Reject scientific notation and validate it's a plain decimal number
    if (trimmed.toLowerCase().includes('e')) return ''; // Reject scientific notation
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return ''; // Only allow plain decimal format
    
    // Return as-is to preserve exact precision (including trailing zeros like "1000000001.50")
    return trimmed;
  }
  
  // For numeric values (which may lose precision), convert carefully
  if (typeof value === 'number') {
    if (isNaN(value)) return '';
    
    // Use toLocaleString with fixed options to avoid scientific notation
    if (Number.isInteger(value)) {
      return value.toLocaleString('en-US', { 
        useGrouping: false, 
        maximumFractionDigits: 0 
      });
    }
    
    return value.toLocaleString('en-US', { 
      useGrouping: false, 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    });
  }
  
  return '';
}

/**
 * Validate and sanitize annual revenue string
 * REJECTS scientific notation (e.g., "1e9", "1E+09")
 * ACCEPTS plain decimal format (e.g., "1000000001", "1000000001.50")
 * Returns null if invalid
 */
export function validateAnnualRevenue(value: string | null | undefined): string | null {
  if (!value) return null;
  
  const trimmed = value.trim();
  if (trimmed === '') return null;
  
  // REJECT scientific notation explicitly
  if (trimmed.toLowerCase().includes('e')) {
    console.warn(`[Revenue Validation] Rejected scientific notation: "${trimmed}"`);
    return null;
  }
  
  // Remove currency symbols, commas, and whitespace
  const cleaned = trimmed.replace(/[$,\s]/g, '');
  
  // Validate it's a plain decimal number (integer or decimal with up to 2 decimal places)
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    console.warn(`[Revenue Validation] Invalid format: "${trimmed}" → "${cleaned}"`);
    return null;
  }
  
  return cleaned;
}
