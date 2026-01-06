import OpenAI from "openai";
import type { VerificationContact } from "@shared/schema";

// Referenced from blueprint:javascript_openai_ai_integrations
// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
// This is using Replit's AI Integrations service, which provides OpenAI-compatible API access without requiring your own OpenAI API key.
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

interface AddressResult {
  success: boolean;
  address?: {
    address1: string;
    address2?: string;
    address3?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  error?: string;
  confidence?: number;
}

/**
 * AI-powered address enrichment service
 * Uses web search knowledge + GPT to extract precise, country-specific company addresses
 */
export class AddressEnrichmentService {
  /**
   * Determines if a contact needs address enrichment
   */
  static needsEnrichment(contact: Partial<VerificationContact>): boolean {
    // Check if HQ address fields are blank
    const hasHqAddress = !!(
      contact.hqAddress1 ||
      contact.hqCity ||
      contact.hqState ||
      contact.hqPostal
    );

    return !hasHqAddress;
  }

  /**
   * Enriches address for a contact using AI
   * @param contact - The contact to enrich
   * @param accountName - The company name
   * @returns AddressResult with structured address data
   */
  static async enrichAddress(
    contact: Partial<VerificationContact>,
    accountName: string
  ): Promise<AddressResult> {
    try {
      // Validate inputs
      if (!accountName?.trim()) {
        return {
          success: false,
          error: "Company name is required for address enrichment",
        };
      }

      const country = contact.contactCountry || contact.hqCountry || "Unknown";
      
      // Build search query
      const searchQuery = this.buildSearchQuery(accountName, country);
      
      // Use GPT to research and extract address
      const addressData = await this.extractAddressWithAI(searchQuery, accountName, country);
      
      if (!addressData.success) {
        return addressData;
      }

      // Validate extracted address
      const isValid = this.validateAddress(addressData.address!, country);
      if (!isValid) {
        return {
          success: false,
          error: "Extracted address failed validation checks",
        };
      }

      return addressData;
    } catch (error: any) {
      console.error("[AddressEnrichment] Error:", error);
      return {
        success: false,
        error: error.message || "Unknown error during enrichment",
      };
    }
  }

  /**
   * Build optimized search query for address lookup
   */
  private static buildSearchQuery(companyName: string, country: string): string {
    const cleanCompany = companyName.trim();
    
    if (country && country !== "Unknown") {
      return `${cleanCompany} ${country} headquarters office address`;
    }
    
    return `${cleanCompany} headquarters office address`;
  }

  /**
   * Extract address using GPT with web search knowledge
   */
  private static async extractAddressWithAI(
    searchQuery: string,
    companyName: string,
    country: string
  ): Promise<AddressResult> {
    try {
      const prompt = this.buildAddressExtractionPrompt(searchQuery, companyName, country);
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o", // Using gpt-4o for reliable structured output with JSON mode
        messages: [
          {
            role: "system",
            content: `You are a precise address data extraction expert. Your task is to find and extract accurate, official company headquarters addresses based on web search knowledge. 
            
CRITICAL REQUIREMENTS:
- Only return REAL, VERIFIABLE addresses from your knowledge base
- Never fabricate or guess addresses
- Ensure country-specific address formatting
- Extract to precise street-level detail when available
- Return confidence score based on data certainty

Output valid JSON only.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1000,
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        return {
          success: false,
          error: "No response from AI model",
        };
      }

      const parsed = JSON.parse(responseText);
      
      // Validate AI response structure
      if (!parsed.found || !parsed.address) {
        return {
          success: false,
          error: parsed.reason || "Address not found in knowledge base",
        };
      }

      // Extract and normalize address components
      const address = this.normalizeAddress(parsed.address, country);
      
      return {
        success: true,
        address,
        confidence: parsed.confidence || 0.8,
      };
    } catch (error: any) {
      console.error("[AddressEnrichment] AI extraction error:", error);
      return {
        success: false,
        error: `AI extraction failed: ${error.message}`,
      };
    }
  }

  /**
   * Build GPT prompt for address extraction
   */
  private static buildAddressExtractionPrompt(
    searchQuery: string,
    companyName: string,
    country: string
  ): string {
    return `Find the official headquarters address for: "${companyName}" in ${country}

Search Query Context: ${searchQuery}

Extract the complete, accurate headquarters address with the following components:
- Street address (address line 1, 2, 3 if applicable)
- City
- State/Province (full name and abbreviation if applicable)
- Postal/ZIP code
- Country (verify it matches: ${country})

Return JSON in this EXACT format:
{
  "found": true/false,
  "confidence": 0.0-1.0,
  "reason": "explanation if not found or low confidence",
  "address": {
    "address1": "primary street address",
    "address2": "suite/building/floor (optional)",
    "address3": "additional info (optional)",
    "city": "city name",
    "state": "state/province full name",
    "stateAbbr": "state abbreviation (e.g., CA, NY, NC)",
    "postalCode": "postal/zip code",
    "country": "country name"
  }
}

IMPORTANT:
- Only return addresses you are CERTAIN about from your training data
- If uncertain, set found=false and explain in "reason"
- Use proper country-specific formatting:
  * USA: State abbreviations (CA, NY, TX), 5-digit ZIP
  * UK: Postal codes (SW1A 1AA format)
  * Canada: Province abbr (ON, BC, QC), postal code (A1A 1A1)
  * Other countries: Follow local standards
- Confidence 0.9+ means you have official/verified data
- Confidence 0.7-0.9 means high likelihood but not fully verified
- Below 0.7 should be marked as found=false`;
  }

  /**
   * Normalize address components based on country format
   */
  private static normalizeAddress(rawAddress: any, country: string): AddressResult['address'] {
    // Clean and normalize each component
    return {
      address1: this.cleanAddressLine(rawAddress.address1 || rawAddress.street),
      address2: rawAddress.address2 ? this.cleanAddressLine(rawAddress.address2) : undefined,
      address3: rawAddress.address3 ? this.cleanAddressLine(rawAddress.address3) : undefined,
      city: this.cleanText(rawAddress.city),
      state: rawAddress.stateAbbr || rawAddress.state || "",
      postalCode: this.cleanPostalCode(rawAddress.postalCode || rawAddress.zip || "", country),
      country: rawAddress.country || country,
    };
  }

  /**
   * Clean address line text
   */
  private static cleanAddressLine(text: string): string {
    if (!text) return "";
    return text.trim().replace(/\s+/g, ' ');
  }

  /**
   * Clean general text
   */
  private static cleanText(text: string): string {
    if (!text) return "";
    return text.trim();
  }

  /**
   * Clean and format postal code based on country
   */
  private static cleanPostalCode(code: string, country: string): string {
    if (!code) return "";
    
    const cleaned = code.trim().toUpperCase();
    
    // Country-specific formatting
    if (country === "USA" || country === "United States") {
      // US ZIP: 12345 or 12345-6789
      return cleaned.replace(/[^0-9-]/g, '');
    } else if (country === "Canada") {
      // Canadian: A1A 1A1
      return cleaned.replace(/[^A-Z0-9 ]/g, '');
    } else if (country === "UK" || country === "United Kingdom") {
      // UK: SW1A 1AA
      return cleaned.replace(/[^A-Z0-9 ]/g, '');
    }
    
    return cleaned;
  }

  /**
   * Validate extracted address has required components
   */
  private static validateAddress(address: AddressResult['address'], country: string): boolean {
    if (!address) return false;
    
    // Required fields
    if (!address.address1?.trim()) return false;
    if (!address.city?.trim()) return false;
    if (!address.country?.trim()) return false;
    
    // Country-specific validation
    if (country === "USA" || country === "United States") {
      // US requires state and ZIP
      if (!address.state?.trim()) return false;
      if (!address.postalCode?.match(/^\d{5}(-\d{4})?$/)) return false;
    } else if (country === "Canada") {
      // Canada requires province and postal code
      if (!address.state?.trim()) return false;
      if (!address.postalCode?.match(/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/)) return false;
    }
    
    return true;
  }
}

export default AddressEnrichmentService;
