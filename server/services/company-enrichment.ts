/**
 * Company Enrichment Service
 * Uses Web Search + Gemini AI to find and extract company contact information
 */

import { GoogleGenAI } from '@google/genai';
import { resolveGeminiBaseUrl } from "../lib/ai-provider-utils";

const geminiBaseUrl = resolveGeminiBaseUrl();
const genai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || '',
  httpOptions: {
    apiVersion: "",
    ...(geminiBaseUrl ? { baseUrl: geminiBaseUrl } : {}),
  },
});


export interface CompanyEnrichmentInput {
  companyName: string;
  contactLocation?: string;
  existingAddress?: string;
  existingPhone?: string;
}

export interface EnrichedCompanyData {
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal: string | null;
  phone: string | null;
  confidence: number;
  sources: string[];
  rawResponse: string;
}

export interface CompanyEnrichmentResult {
  success: boolean;
  data: EnrichedCompanyData | null;
  error: string | null;
  searchQuery: string;
}

/**
 * Enriches company data using AI-powered web search
 */
export async function enrichCompanyData(
  input: CompanyEnrichmentInput
): Promise<CompanyEnrichmentResult> {
  try {
    // Build search query
    const searchTerms = [
      input.companyName,
      input.contactLocation,
      input.existingAddress,
      input.existingPhone
    ].filter(Boolean);

    const searchQuery = `${searchTerms.join(' ')} company address phone contact`;

    console.log('[COMPANY-ENRICHMENT] Search query:', searchQuery);

    // Use Gemini AI with search grounding to find company information

    const prompt = `You are a business data research specialist. Using your knowledge of well-known companies and public business information, provide the most likely headquarters address and phone number for this company.

COMPANY INFORMATION:
- Company Name: ${input.companyName}
${input.contactLocation ? `- Location/Region: ${input.contactLocation}` : ''}
${input.existingAddress ? `- Existing Address Hint: ${input.existingAddress}` : ''}
${input.existingPhone ? `- Existing Phone Hint: ${input.existingPhone}` : ''}

TASK:
Based on your training data and knowledge of this company:
1. Provide the company's headquarters or primary office address
2. Provide the main office phone number
3. If you don't have confident information, return null for those fields

CRITICAL: Only provide information if you are CONFIDENT (70%+) based on your training data. Do NOT fabricate or guess.

RESPONSE FORMAT (JSON only):
{
  "address1": "Street address" or null,
  "address2": "Suite/Floor" or null,
  "city": "City" or null,
  "state": "State/Province" or null,
  "country": "Country" or null,
  "postal": "Postal code" or null,
  "phone": "Phone with country code (+1, +44, etc.)" or null,
  "confidence": 0-100,
  "sources": ["Knowledge base", "Training data"],
  "reasoning": "Brief explanation"
}

CONFIDENCE SCORING:
- 90-100: Major well-known company with public headquarters info
- 70-89: Known company with publicly available contact info
- 50-69: Partial information available
- 0-49: Uncertain - return nulls for unknown fields

Return ONLY the JSON object, no additional text.`;

    console.log('[COMPANY-ENRICHMENT] Calling Gemini AI...');

    const result = await genai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    // Extract text from response
    const text = result.text || '';
    
    console.log('[COMPANY-ENRICHMENT] Raw AI response:', text);

    if (!text) {
      throw new Error('No text response from AI');
    }

    // Parse JSON response - try direct parse first, then regex fallback
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // Fallback: extract JSON from markdown or surrounding text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from AI response');
      }
      parsed = JSON.parse(jsonMatch[0]);
    }

    const enrichedData: EnrichedCompanyData = {
      address1: parsed.address1 || null,
      address2: parsed.address2 || null,
      city: parsed.city || null,
      state: parsed.state || null,
      country: parsed.country || null,
      postal: parsed.postal || null,
      phone: parsed.phone || null,
      confidence: parsed.confidence || 0,
      sources: parsed.sources || [],
      rawResponse: text
    };

    console.log('[COMPANY-ENRICHMENT] Enriched data:', {
      address1: enrichedData.address1,
      city: enrichedData.city,
      phone: enrichedData.phone,
      confidence: enrichedData.confidence
    });

    return {
      success: true,
      data: enrichedData,
      error: null,
      searchQuery
    };

  } catch (error) {
    console.error('[COMPANY-ENRICHMENT] Enrichment failed:', error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      searchQuery: input.companyName
    };
  }
}

/**
 * Batch enrichment for multiple companies
 */
export async function enrichCompaniesInBatch(
  companies: CompanyEnrichmentInput[],
  options: {
    delayMs?: number;
    onProgress?: (completed: number, total: number, current: string) => void;
  } = {}
): Promise<Map<string, CompanyEnrichmentResult>> {
  const { delayMs = 1000, onProgress } = options;
  const results = new Map<string, CompanyEnrichmentResult>();

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    const key = `${company.companyName}-${company.contactLocation || 'default'}`;
    
    try {
      const result = await enrichCompanyData(company);
      results.set(key, result);

      if (onProgress) {
        onProgress(i + 1, companies.length, company.companyName);
      }

      // Rate limiting delay
      if (delayMs > 0 && i < companies.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`[COMPANY-ENRICHMENT] Batch error for ${company.companyName}:`, error);
      results.set(key, {
        success: false,
        data: null,
        error: String(error),
        searchQuery: company.companyName
      });
    }
  }

  return results;
}
