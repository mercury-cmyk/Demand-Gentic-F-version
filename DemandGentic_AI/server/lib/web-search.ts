/**
 * Web Search Service for Company Enrichment
 * Provides fallback web search when AI training data doesn't have the information
 */

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

interface WebSearchResponse {
  success: boolean;
  results: SearchResult[];
  error?: string;
}

/**
 * Internal function to execute a single Google Custom Search query
 */
async function executeGoogleSearch(query: string): Promise {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY!;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID!;
  
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', searchEngineId);
  url.searchParams.set('q', query);
  url.searchParams.set('num', '5'); // Return 5 results
  
  // Add Referer header to satisfy Google CSE domain restrictions
  const referer = process.env.REPLIT_DOMAINS?.split(',')[0] || 'https://replit.com';
  
  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'Referer': referer,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(`Google Custom Search API error: ${errorMessage}`);
  }

  const data = await response.json();
  
  // Google Custom Search returns results in the 'items' array
  const results: SearchResult[] = (data.items || []).map((item: any) => ({
    title: item.title || "",
    url: item.link || "",
    description: item.snippet || "",
  }));
  
  return {
    success: true,
    results,
  };
}

/**
 * Search the web using Google Programmable Search Engine with progressive fallback
 * 
 * Strategy:
 * 1. Try exact-match query first (with quotes)
 * 2. If 0 results, retry without quotes for fuzzy matching
 * 3. Falls back gracefully if API key or Search Engine ID is not configured
 * 
 * Setup instructions:
 * 1. Create a Programmable Search Engine at https://programmablesearchengine.google.com/
 * 2. Get your Search Engine ID (CX) from the control panel
 * 3. Get an API key from Google Cloud Console (https://console.cloud.google.com/apis/credentials)
 * 4. Add GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID to your environment
 * 5. **CRITICAL**: Configure CSE to allow your Replit domain:
 *    - Go to your CSE control panel → Setup → Basics
 *    - Under "Sites to search" → Advanced
 *    - Add these domains to allowed referers:
 *      • *.replit.app
 *      • *.replit.dev
 *      • replit.com
 *    - OR disable referer restrictions entirely (less secure)
 * 
 * Common Error: "Requests from referer  are blocked"
 * Solution: Add your deployed domain to Google CSE allowed referers list
 */
export async function searchWeb(query: string): Promise {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
  
  if (!apiKey || !searchEngineId) {
    const missing = !apiKey ? "GOOGLE_SEARCH_API_KEY" : "GOOGLE_SEARCH_ENGINE_ID";
    console.log(`[WebSearch] ${missing} not configured - web search disabled`);
    return {
      success: false,
      results: [],
      error: `Web search not configured (missing ${missing})`,
    };
  }

  try {
    console.log(`[WebSearch] Searching: "${query}"`);
    
    // ATTEMPT 1: Try original query
    const firstAttempt = await executeGoogleSearch(query);
    
    if (firstAttempt.results.length > 0) {
      console.log(`[WebSearch] Found ${firstAttempt.results.length} results (exact match)`);
      return firstAttempt;
    }
    
    // ATTEMPT 2: If exact-match query with quotes returned 0 results, retry without quotes
    // This handles cases where company name might vary slightly (e.g., "Presidential Flight" vs "Presidential Flights")
    const hasQuotes = query.includes('"');
    if (hasQuotes) {
      const fuzzyQuery = query.replace(/"/g, '');
      console.log(`[WebSearch] 0 results with exact match - retrying without quotes: "${fuzzyQuery}"`);
      
      const secondAttempt = await executeGoogleSearch(fuzzyQuery);
      
      if (secondAttempt.results.length > 0) {
        console.log(`[WebSearch] Found ${secondAttempt.results.length} results (fuzzy match)`);
        return secondAttempt;
      }
    }
    
    // No results from either attempt
    console.log(`[WebSearch] 0 results after all attempts`);
    return {
      success: false,
      results: [],
      error: "No search results found (tried exact and fuzzy matching)",
    };
  } catch (error: any) {
    console.error("[WebSearch] Error:", error.message);
    return {
      success: false,
      results: [],
      error: error.message,
    };
  }
}

/**
 * Extract text snippets from search results for AI analysis
 */
export function formatSearchResultsForAI(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No web search results found.";
  }

  return results
    .map((result, index) => {
      return `Source ${index + 1}: ${result.title}
URL: ${result.url}
${result.description}`;
    })
    .join("\n\n");
}