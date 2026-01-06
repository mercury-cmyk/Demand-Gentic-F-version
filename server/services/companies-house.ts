/**
 * Companies House UK API Service
 * Provides company search and verification against Companies House registry
 */

const COMPANIES_HOUSE_API_KEY = process.env.COMPANIES_HOUSE_API_KEY;
const BASE_URL = 'https://api.company-information.service.gov.uk';

/**
 * Common company suffixes to strip when searching
 * This ensures we find the company even if the user's data has inconsistent suffixes
 */
const COMPANY_SUFFIXES = [
  'LIMITED',
  'LTD',
  'LTD.',
  'PLC',
  'P.L.C.',
  'LLC',
  'L.L.C.',
  'INC',
  'INC.',
  'INCORPORATED',
  'CORP',
  'CORP.',
  'CORPORATION',
  'LLP',
  'L.L.P.',
  'LP',
  'L.P.',
  'CO',
  'CO.',
  'COMPANY',
  '& CO',
  '& CO.',
  'AND CO',
  'AND CO.',
];

/**
 * Normalize company name for searching
 * Removes common suffixes and cleans up the name
 */
export function normalizeCompanyName(name: string): string {
  if (!name) return '';
  
  // Convert to uppercase and trim
  let normalized = name.toUpperCase().trim();
  
  // Remove any trailing periods or commas
  normalized = normalized.replace(/[.,]+$/, '');
  
  // Sort suffixes by length (longest first) to avoid partial matches
  const sortedSuffixes = [...COMPANY_SUFFIXES].sort((a, b) => b.length - a.length);
  
  // Remove suffixes (check from end of string)
  for (const suffix of sortedSuffixes) {
    const pattern = new RegExp(`\\s+${suffix.replace(/\./g, '\\.')}$`, 'i');
    normalized = normalized.replace(pattern, '');
  }
  
  // Clean up any extra whitespace
  normalized = normalized.trim();
  
  return normalized;
}

export interface CompanySearchResult {
  company_number: string;
  company_name: string;
  company_status: string;
  company_type: string;
  date_of_creation?: string;
  address?: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    postal_code?: string;
    country?: string;
  };
}

export interface CompanyProfile {
  company_number: string;
  company_name: string;
  company_status: string;
  company_type: string;
  date_of_creation: string;
  registered_office_address: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    postal_code?: string;
    country?: string;
  };
  sic_codes?: string[];
  accounts?: {
    next_due?: string;
    last_accounts?: {
      made_up_to?: string;
    };
  };
}

export interface CompanyValidationResult {
  found: boolean;
  notFound?: boolean;
  apiError?: boolean;
  companyNumber?: string;
  legalName?: string;
  status?: string;
  isActive?: boolean;
  dateOfCreation?: string;
  address?: string;
  error?: string;
}

/**
 * Search for companies by name
 */
export async function searchCompanies(
  query: string,
  itemsPerPage: number = 20
): Promise<CompanySearchResult[]> {
  if (!COMPANIES_HOUSE_API_KEY) {
    throw new Error('COMPANIES_HOUSE_API_KEY not configured');
  }

  // Trim API key to remove any whitespace
  const apiKey = COMPANIES_HOUSE_API_KEY.trim();
  
  const url = new URL(`${BASE_URL}/search/companies`);
  url.searchParams.set('q', query);
  url.searchParams.set('items_per_page', String(itemsPerPage));

  // Companies House uses the API key as username with blank password
  const authString = `${apiKey}:`;
  const base64Auth = Buffer.from(authString).toString('base64');

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Basic ${base64Auth}`,
      },
    });

    if (!response.ok) {
      // Try to get error details from response body
      let errorDetails = '';
      try {
        const errorBody = await response.text();
        errorDetails = errorBody ? ` - ${errorBody}` : '';
      } catch (e) {
        // Ignore error parsing error
      }
      const errorMsg = `Companies House API error: ${response.status} ${response.statusText}${errorDetails}`;
      console.error('[CompaniesHouse] API Error:', errorMsg);
      console.error('[CompaniesHouse] Request URL:', url.toString());
      throw new Error(errorMsg);
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('[CompaniesHouse] Search error:', error);
    throw error;
  }
}

/**
 * Get company profile by company number
 */
export async function getCompanyProfile(companyNumber: string): Promise<CompanyProfile | null> {
  if (!COMPANIES_HOUSE_API_KEY) {
    throw new Error('COMPANIES_HOUSE_API_KEY not configured');
  }

  // Trim API key to remove any whitespace
  const apiKey = COMPANIES_HOUSE_API_KEY.trim();
  const authString = `${apiKey}:`;
  const base64Auth = Buffer.from(authString).toString('base64');

  const url = `${BASE_URL}/company/${companyNumber}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${base64Auth}`,
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Companies House API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[CompaniesHouse] Get profile error:', error);
    throw error;
  }
}

/**
 * Validate company and extract key information
 * Returns structured validation result for CRM use
 */
export async function validateCompany(companyName: string): Promise<CompanyValidationResult> {
  try {
    // Normalize company name (remove suffixes) for better search results
    const normalizedName = normalizeCompanyName(companyName);
    const searchQuery = normalizedName || companyName; // Fallback to original if normalization returns empty
    
    console.log(`[CompaniesHouse] Searching for: "${companyName}" → normalized: "${normalizedName}"`);
    
    // Search for the company
    const searchResults = await searchCompanies(searchQuery, 5);
    
    if (!searchResults || searchResults.length === 0) {
      return {
        found: false,
        notFound: true,
        error: 'No company found with this name',
      };
    }

    // Get the first (most relevant) result
    const topResult = searchResults[0];
    
    // Get full profile for detailed information
    const profile = await getCompanyProfile(topResult.company_number);
    
    if (!profile) {
      return {
        found: false,
        notFound: true,
        error: 'Company profile not found',
      };
    }

    // Format address
    const address = profile.registered_office_address;
    const addressParts = [
      address.address_line_1,
      address.address_line_2,
      address.locality,
      address.postal_code,
      address.country,
    ].filter(Boolean);
    const formattedAddress = addressParts.join(', ');

    return {
      found: true,
      notFound: false,
      companyNumber: profile.company_number,
      legalName: profile.company_name,
      status: profile.company_status,
      isActive: profile.company_status.toLowerCase() === 'active',
      dateOfCreation: profile.date_of_creation,
      address: formattedAddress,
    };
  } catch (error) {
    console.error('[CompaniesHouse] Validation error:', error);
    return {
      found: false,
      notFound: false,
      apiError: true,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Batch validate companies with rate limiting
 * Returns validation results for multiple companies
 */
export async function batchValidateCompanies(
  companyNames: string[],
  delayMs: number = 1200 // Rate limit: 1.2s per lead = 50 leads/min × 2 API calls = 100 calls/min < 120 calls/min (600/5min)
): Promise<Map<string, CompanyValidationResult>> {
  const results = new Map<string, CompanyValidationResult>();
  
  for (const companyName of companyNames) {
    if (!companyName || companyName.trim() === '') {
      continue;
    }
    
    try {
      const result = await validateCompany(companyName);
      results.set(companyName, result);
      
      // Rate limiting delay
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`[CompaniesHouse] Error validating ${companyName}:`, error);
      results.set(companyName, {
        found: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  return results;
}
