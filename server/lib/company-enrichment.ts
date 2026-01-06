import { GoogleGenAI } from "@google/genai";
import type { VerificationContact } from "@shared/schema";
import { searchWeb, formatSearchResultsForAI } from "./web-search";
import { formatPhoneWithCountryCode } from "./phone-formatter";

// Referenced from blueprint:javascript_gemini_ai_integrations
// This is using Replit's AI Integrations service, which provides Gemini-compatible API access without requiring your own API key.
// Using gemini-2.5-flash for fast, high-volume data extraction tasks
const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY!,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

interface EnrichmentResult {
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
  phone?: string;
  addressError?: string;
  phoneError?: string;
  addressConfidence?: number;
  phoneConfidence?: number;
}

/**
 * AI-powered company data enrichment service
 * Enriches LOCAL office address and phone number based on contact's location
 * Searches for regional/local office information, not global HQ
 */
export class CompanyEnrichmentService {
  /**
   * Determines if a contact needs address enrichment
   * Returns true if ANY required AI enrichment address field is missing
   */
  static needsAddressEnrichment(contact: Partial<VerificationContact>): boolean {
    // Check AI enrichment fields - require ALL essential fields to be present for a complete address
    const hasCompleteAIEnrichedAddress = !!(
      contact.aiEnrichedAddress1 &&
      contact.aiEnrichedCity &&
      contact.aiEnrichedState &&
      contact.aiEnrichedPostal
    );
    return !hasCompleteAIEnrichedAddress;
  }

  /**
   * Determines if a contact needs phone enrichment
   * Checks if AI enriched phone is missing
   */
  static needsPhoneEnrichment(contact: Partial<VerificationContact>): boolean {
    return !contact.aiEnrichedPhone;
  }

  /**
   * TIER 1 ENRICHMENT: Try to reuse phone numbers from other contacts in the same company
   * This dramatically improves phone coverage (31% → 50-60%) without AI costs
   * 
   * Priority order: CAV Tel > Contact Mobile > Contact Phone > AI Enriched > HQ Phone
   * Requires: Either 1 high-priority match (CAV/mobile) OR 3+ matches from any tier
   * 
   * @param contact - The contact missing a phone
   * @param accountId - The company account ID
   * @param campaignId - The verification campaign ID
   * @returns Phone and source if found, null otherwise
   */
  static async tryCompanyPhoneReuse(
    contact: Partial<VerificationContact>,
    accountId: string,
    campaignId: string
  ): Promise<{ phone: string; source: string; confidence: number } | null> {
    try {
      const { db } = await import("../db");
      const { verificationContacts } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const { formatPhoneWithCountryCode } = await import("./phone-formatter");

      // Need contact country for matching
      if (!contact.contactCountry?.trim()) {
        return null;
      }

      const targetCountry = contact.contactCountry.trim();

      console.log(`[PhoneDedup] Scanning company contacts for reusable phone (country: ${targetCountry})`);

      // Fetch ALL contacts from same company in same campaign
      // CRITICAL: Include suppressed field to avoid reusing suppressed phones
      const companyContacts = await db
        .select({
          id: verificationContacts.id,
          phone: verificationContacts.phone,
          mobile: verificationContacts.mobile,
          aiEnrichedPhone: verificationContacts.aiEnrichedPhone,
          hqPhone: verificationContacts.hqPhone,
          contactCountry: verificationContacts.contactCountry,
          customFields: verificationContacts.customFields,
          suppressed: verificationContacts.suppressed,
        })
        .from(verificationContacts)
        .where(
          and(
            eq(verificationContacts.accountId, accountId),
            eq(verificationContacts.campaignId, campaignId),
            eq(verificationContacts.suppressed, false) // Only consider non-suppressed contacts
          )
        );

      if (companyContacts.length === 0) {
        console.log(`[PhoneDedup] No contacts found for company ${accountId}`);
        return null;
      }

      console.log(`[PhoneDedup] Found ${companyContacts.length} contacts in company`);

      // Extract and normalize phone candidates
      interface PhoneCandidate {
        phone: string; // Raw phone as stored in database
        normalizedPhone: string; // Normalized for comparison only
        source: string;
        priority: number; // Lower = higher priority
        contactId: string;
      }

      const candidates: PhoneCandidate[] = [];

      for (const sibling of companyContacts) {
        // Skip the contact we're trying to enrich
        if (sibling.id === contact.id) continue;

        // Skip if country doesn't match
        if (sibling.contactCountry?.trim() !== targetCountry) continue;

        // Skip if contact is suppressed (already filtered in query, but double-check)
        if (sibling.suppressed) continue;

        const processPhone = (rawPhone: string | null | undefined, source: string, priority: number) => {
          if (!rawPhone) return;
          
          // Normalize phone for comparison only (not for storage)
          const normalized = formatPhoneWithCountryCode(rawPhone, targetCountry);
          
          // Skip if normalization failed (invalid phone)
          if (!normalized || normalized.replace(/\D/g, '').length < 10) {
            return;
          }
          
          candidates.push({
            phone: rawPhone, // Store RAW phone to maintain format consistency
            normalizedPhone: normalized, // Only for grouping/comparison
            source,
            priority,
            contactId: sibling.id,
          });
        };

        // Priority 1: CAV Tel (client-verified, highest trust)
        const cavTel = this.extractCavTel(sibling.customFields);
        processPhone(cavTel, 'CAV Tel', 1);

        // Priority 2: Contact Mobile
        processPhone(sibling.mobile, 'Contact Mobile', 2);

        // Priority 3: Contact Phone
        processPhone(sibling.phone, 'Contact Phone', 3);

        // Priority 4: AI Enriched Phone
        processPhone(sibling.aiEnrichedPhone, 'AI Enriched Phone', 4);

        // Priority 5: HQ Phone (lowest priority)
        processPhone(sibling.hqPhone, 'Company HQ Phone', 5);
      }

      if (candidates.length === 0) {
        console.log(`[PhoneDedup] No valid phone candidates found in same country`);
        return null;
      }

      console.log(`[PhoneDedup] Found ${candidates.length} phone candidates`);

      // Group by normalized phone number to detect consensus
      interface PhoneGroup {
        normalizedPhone: string;
        count: number;
        bestPriority: number;
        bestSource: string;
        bestRawPhone: string;
      }

      const phoneGroups = new Map<string, PhoneGroup>();

      for (const candidate of candidates) {
        const existing = phoneGroups.get(candidate.normalizedPhone);
        
        if (!existing) {
          phoneGroups.set(candidate.normalizedPhone, {
            normalizedPhone: candidate.normalizedPhone,
            count: 1,
            bestPriority: candidate.priority,
            bestSource: candidate.source,
            bestRawPhone: candidate.phone,
          });
        } else {
          existing.count++;
          // Update to highest priority source for this phone
          if (candidate.priority < existing.bestPriority) {
            existing.bestPriority = candidate.priority;
            existing.bestSource = candidate.source;
            existing.bestRawPhone = candidate.phone;
          }
        }
      }

      console.log(`[PhoneDedup] Grouped into ${phoneGroups.size} unique phone numbers`);

      // Select best phone based on priority and consensus
      let selectedPhone: PhoneGroup | null = null;

      for (const group of phoneGroups.values()) {
        const isHighPriority = group.bestPriority <= 2; // CAV Tel or Contact Mobile
        const hasConsensus = group.count >= 3;

        // Accept if high priority OR has consensus
        if (isHighPriority || hasConsensus) {
          // Select phone with best priority, or highest consensus for ties
          if (!selectedPhone) {
            selectedPhone = group;
          } else if (group.bestPriority < selectedPhone.bestPriority) {
            selectedPhone = group; // Higher priority
          } else if (group.bestPriority === selectedPhone.bestPriority && group.count > selectedPhone.count) {
            selectedPhone = group; // Same priority, more consensus
          }
        }
      }

      if (!selectedPhone) {
        console.log(`[PhoneDedup] No phone meets criteria (high priority or 3+ consensus)`);
        return null;
      }

      const confidence = selectedPhone.bestPriority <= 2 ? 0.95 : 0.85;
      
      console.log(`[PhoneDedup] ✓ Selected phone: ${selectedPhone.bestSource} (appears ${selectedPhone.count}x, priority ${selectedPhone.bestPriority})`);

      // CRITICAL: Return RAW phone (not normalized) to maintain format consistency
      // The normalized version was only used for grouping/comparison
      return {
        phone: selectedPhone.bestRawPhone, // RAW phone preserves original format
        source: `Deduplicated (${selectedPhone.bestSource}, ${selectedPhone.count}x)`,
        confidence,
      };
    } catch (error: any) {
      console.error("[PhoneDedup] Error:", error);
      return null;
    }
  }

  /**
   * Extract CAV Tel from custom fields
   */
  private static extractCavTel(customFields: any): string | null {
    if (!customFields || typeof customFields !== 'object') return null;
    
    const patterns = [
      'custom_cav_tel',
      'CAV-Tel',
      'CAV_Tel',
      'cav_tel',
    ];
    
    for (const pattern of patterns) {
      if (customFields[pattern]) {
        const value = String(customFields[pattern]).trim();
        if (value) return value;
      }
    }
    
    return null;
  }

  /**
   * Enriches both address AND phone for a company's LOCAL office in a single AI request
   * Searches for regional/local office data based on contact's country
   * @param contact - The contact to enrich (must have contactCountry)
   * @param accountName - The company name
   * @returns EnrichmentResult with structured LOCAL office address and phone data
   */
  static async enrichCompanyData(
    contact: Partial<VerificationContact>,
    accountName: string
  ): Promise<EnrichmentResult> {
    try {
      // Validate inputs
      if (!accountName?.trim()) {
        return {
          success: false,
          addressError: "Company name is required for enrichment",
          phoneError: "Company name is required for enrichment",
        };
      }

      // CRITICAL: Only use Contact Country for enrichment (no HQ country fallback)
      // Enrichment is based exclusively on where the contact is located
      if (!contact.contactCountry?.trim()) {
        return {
          success: false,
          addressError: "Contact Country is required for enrichment",
          phoneError: "Contact Country is required for enrichment",
        };
      }

      const country = contact.contactCountry;
      
      const needsAddress = this.needsAddressEnrichment(contact);
      const needsPhone = this.needsPhoneEnrichment(contact);

      if (!needsAddress && !needsPhone) {
        return {
          success: true,
          addressError: "Address already exists",
          phoneError: "Phone already exists",
        };
      }
      
      // Use GPT to research and extract both address and phone in single request
      const enrichmentData = await this.extractCompanyDataWithAI(
        accountName,
        country,
        needsAddress,
        needsPhone
      );
      
      return enrichmentData;
    } catch (error: any) {
      console.error("[CompanyEnrichment] Error:", error);
      return {
        success: false,
        addressError: error.message || "Unknown error during enrichment",
        phoneError: error.message || "Unknown error during enrichment",
      };
    }
  }

  /**
   * HYBRID ENRICHMENT: Two-stage approach
   * Stage 1: Try AI's internal training data
   * Stage 2: If no results, fall back to web search (if API key configured)
   */
  private static async extractCompanyDataWithAI(
    companyName: string,
    country: string,
    needsAddress: boolean,
    needsPhone: boolean
  ): Promise<EnrichmentResult> {
    try {
      // STAGE 1: Try AI's internal knowledge first
      console.log(`[CompanyEnrichment] Stage 1: Trying AI internal knowledge for "${companyName}" in ${country}`);
      
      const aiResult = await this.tryAIInternalKnowledge(
        companyName,
        country,
        needsAddress,
        needsPhone
      );

      // Check if we got good results from AI
      // TIER 2: Lower phone confidence threshold to 0.55 (addresses remain at 0.7)
      const hasGoodAddress = aiResult.address && (aiResult.addressConfidence || 0) >= 0.7;
      const hasGoodPhone = aiResult.phone && (aiResult.phoneConfidence || 0) >= 0.55; // Changed from 0.7 to 0.55
      
      if ((needsAddress && hasGoodAddress) || (needsPhone && hasGoodPhone)) {
        console.log(`[CompanyEnrichment] Stage 1 SUCCESS - AI found data (address: ${hasGoodAddress}, phone: ${hasGoodPhone})`);
        return aiResult;
      }

      // STAGE 2: Fall back to web search if available
      const hasApiKey = !!(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID);
      
      if (!hasApiKey) {
        console.log(`[CompanyEnrichment] Stage 2 SKIPPED - No web search API credentials configured`);
        return aiResult; // Return AI result even if low confidence
      }

      console.log(`[CompanyEnrichment] Stage 2: Trying web search fallback`);
      
      const webResult = await this.tryWebSearchEnrichment(
        companyName,
        country,
        needsAddress,
        needsPhone
      );

      // Merge results: Use web search data for fields that AI couldn't provide
      const mergedResult: EnrichmentResult = { success: false };

      if (hasGoodAddress) {
        mergedResult.address = aiResult.address;
        mergedResult.addressConfidence = aiResult.addressConfidence;
      } else if (webResult.address && (webResult.addressConfidence || 0) >= 0.7) {
        mergedResult.address = webResult.address;
        mergedResult.addressConfidence = webResult.addressConfidence;
        console.log(`[CompanyEnrichment] Using web search result for address`);
      } else {
        mergedResult.addressError = webResult.addressError || aiResult.addressError;
        mergedResult.addressConfidence = 0;
      }

      if (hasGoodPhone) {
        mergedResult.phone = aiResult.phone;
        mergedResult.phoneConfidence = aiResult.phoneConfidence;
      } else if (webResult.phone && (webResult.phoneConfidence || 0) >= 0.55) { // Changed from 0.7 to 0.55
        mergedResult.phone = webResult.phone;
        mergedResult.phoneConfidence = webResult.phoneConfidence;
        console.log(`[CompanyEnrichment] Using web search result for phone`);
      } else {
        mergedResult.phoneError = webResult.phoneError || aiResult.phoneError;
        mergedResult.phoneConfidence = 0;
      }

      mergedResult.success = !!(mergedResult.address || mergedResult.phone);
      
      console.log(`[CompanyEnrichment] Final result - address: ${!!mergedResult.address}, phone: ${!!mergedResult.phone}`);
      
      return mergedResult;
    } catch (error: any) {
      console.error("[CompanyEnrichment] Error:", error);
      return {
        success: false,
        addressError: error.message,
        phoneError: error.message,
      };
    }
  }

  /**
   * Stage 1: Try to extract data from AI's internal training data
   */
  private static async tryAIInternalKnowledge(
    companyName: string,
    country: string,
    needsAddress: boolean,
    needsPhone: boolean
  ): Promise<EnrichmentResult> {
    try {
      const prompt = this.buildAIPrompt(companyName, country, needsAddress, needsPhone);
      
      const systemPrompt = `You are a precise company data extraction expert. Extract LOCAL/REGIONAL office information from your training data.

CRITICAL REQUIREMENTS:
- Find the company's LOCAL office/branch in the SPECIFIED COUNTRY from your knowledge
- Do NOT return global HQ information unless it's located in the specified country
- Only return data you are CERTAIN about from your training data
- Never fabricate or guess information
- Return SEPARATE confidence scores for address and phone data (0.0-1.0)
- Confidence should reflect how certain you are based on your training data
- If you don't have information about this company in this country, mark as not found

Output valid JSON only.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `${systemPrompt}\n\n${prompt}`,
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 1500,
        },
      });

      const responseText = response.text || '';
      if (!responseText) {
        return {
          success: false,
          addressError: "No response from AI model",
          phoneError: "No response from AI model",
        };
      }

      const parsed = JSON.parse(responseText);
      
      const result: EnrichmentResult = {
        success: false,
      };

      // Extract address if needed and found
      if (needsAddress) {
        if (parsed.addressFound && parsed.address) {
          const address = this.normalizeAddress(parsed.address, country);
          if (this.validateAddress(address, country)) {
            result.address = address;
            result.addressConfidence = parsed.addressConfidence || parsed.confidence || 0.8;
          } else {
            result.addressError = "Extracted address failed validation";
            result.addressConfidence = 0;
          }
        } else {
          result.addressError = parsed.addressReason || "Address not found in knowledge base";
          result.addressConfidence = 0;
        }
      }

      // Extract phone if needed and found
      if (needsPhone) {
        if (parsed.phoneFound && parsed.phone) {
          const phone = this.normalizePhone(parsed.phone, country);
          if (phone) {
            result.phone = phone;
            result.phoneConfidence = parsed.phoneConfidence || parsed.confidence || 0.8;
          } else {
            result.phoneError = "Extracted phone failed normalization";
            result.phoneConfidence = 0;
          }
        } else {
          result.phoneError = parsed.phoneReason || "Phone not found in knowledge base";
          result.phoneConfidence = 0;
        }
      }

      // Success if we got at least one piece of data
      result.success = !!(result.address || result.phone);
      
      return result;
    } catch (error: any) {
      console.error("[CompanyEnrichment] AI extraction error:", error);
      return {
        success: false,
        addressError: `AI extraction failed: ${error.message}`,
        phoneError: `AI extraction failed: ${error.message}`,
      };
    }
  }

  /**
   * Stage 2: TIER 3 Enhanced web search with multi-query consensus validation
   */
  private static async tryWebSearchEnrichment(
    companyName: string,
    country: string,
    needsAddress: boolean,
    needsPhone: boolean
  ): Promise<EnrichmentResult> {
    try {
      // TIER 3: Run enhanced multi-query web search with consensus validation
      return await this.runEnhancedWebSearch(companyName, country, needsAddress, needsPhone);
    } catch (error: any) {
      console.error("[CompanyEnrichment] Enhanced web search error:", error);
      return {
        success: false,
        addressError: `Web search failed: ${error.message}`,
        phoneError: `Web search failed: ${error.message}`,
      };
    }
  }

  /**
   * TIER 3: Enhanced multi-query web search orchestrator with conditional consensus
   * 
   * Flow:
   * 1. Primary Query → AI Extraction
   * 2. If phone confidence ≥0.8: SHORT-CIRCUIT (return immediately)
   * 3. If phone confidence 0.55-0.79: Run validation + tertiary queries
   * 4. Normalize phones → Apply consensus rules → Return best phone
   * 
   * Progressive Query Strategy (with fuzzy matching in web-search.ts):
   * - Exact match: "Company Name" Country terms
   * - Fuzzy match: Company Name Country terms (quotes removed)
   * - The fuzzy matching is automatically handled by searchWeb()
   */
  private static async runEnhancedWebSearch(
    companyName: string,
    country: string,
    needsAddress: boolean,
    needsPhone: boolean
  ): Promise<EnrichmentResult> {
    try {
      console.log(`[Tier3Search] Starting enhanced search for "${companyName}" in ${country}`);
      
      // STEP 1: Primary Query (general office contact query)
      // Note: searchWeb() will automatically try fuzzy matching if exact match returns 0 results
      const primaryQuery = `"${companyName}" ${country} office address phone contact`;
      console.log(`[Tier3Search] Primary query: ${primaryQuery}`);
      
      const primaryResult = await this.executeSingleWebSearch(
        primaryQuery,
        companyName,
        country,
        needsAddress,
        needsPhone,
        'primary'
      );

      // EARLY EXIT: If primary query failed completely (no phone AND no address)
      if (!primaryResult.address && !primaryResult.phone) {
        console.log(`[Tier3Search] Primary query returned no data after all retry attempts`);
        return {
          success: false,
          addressError: primaryResult.addressError || "No results from primary query (tried exact and fuzzy matching)",
          phoneError: primaryResult.phoneError || "No results from primary query (tried exact and fuzzy matching)",
        };
      }

      // STEP 2: Check if we can SHORT-CIRCUIT (high-confidence phone or no phone needed)
      if (!needsPhone || !primaryResult.phone) {
        // Address-only enrichment or primary query had no phone
        console.log(`[Tier3Search] Short-circuit: ${needsPhone ? 'No phone found' : 'Phone not needed'}`);
        return primaryResult;
      }

      const primaryPhoneConfidence = primaryResult.phoneConfidence || 0;
      
      // SHORT-CIRCUIT: High-confidence phone (≥0.8)
      if (primaryPhoneConfidence >= 0.8) {
        console.log(`[Tier3Search] Short-circuit: High confidence phone (${primaryPhoneConfidence})`);
        return primaryResult;
      }

      // SHORT-CIRCUIT: Phone confidence < 0.55 (too low to validate)
      if (primaryPhoneConfidence < 0.55) {
        console.log(`[Tier3Search] Short-circuit: Phone confidence ${primaryPhoneConfidence} < 0.55 (discard)`);
        return {
          success: !!primaryResult.address,
          address: primaryResult.address,
          addressConfidence: primaryResult.addressConfidence,
          phoneError: "Phone confidence below threshold",
          phoneConfidence: 0,
        };
      }

      // STEP 3: VALIDATION PATH (confidence 0.55-0.79) - Run additional queries
      console.log(`[Tier3Search] Validation path: Phone confidence ${primaryPhoneConfidence} needs validation`);
      
      const [validationResult, tertiaryResult] = await Promise.all([
        // Validation Query: Phone directory focused
        this.executeSingleWebSearch(
          `"${companyName}" ${country} phone directory contact`,
          companyName,
          country,
          false, // Don't need address for validation query
          true,
          'validation'
        ),
        // Tertiary Query: Alternative phrasing (headquarters in country)
        this.executeSingleWebSearch(
          `"${companyName}" headquarters ${country} phone`,
          companyName,
          country,
          false, // Don't need address for tertiary query
          true,
          'tertiary'
        ),
      ]);

      // STEP 4: Collect all phone candidates
      interface PhoneCandidate {
        rawPhone: string;
        normalizedPhone: string;
        confidence: number;
        queryType: 'primary' | 'validation' | 'tertiary';
      }

      const candidates: PhoneCandidate[] = [];

      // Add primary phone
      if (primaryResult.phone) {
        const normalized = formatPhoneWithCountryCode(primaryResult.phone, country);
        if (normalized) {
          candidates.push({
            rawPhone: primaryResult.phone,
            normalizedPhone: normalized,
            confidence: primaryPhoneConfidence,
            queryType: 'primary',
          });
        }
      }

      // Add validation phone
      if (validationResult.phone) {
        const normalized = formatPhoneWithCountryCode(validationResult.phone, country);
        if (normalized) {
          candidates.push({
            rawPhone: validationResult.phone,
            normalizedPhone: normalized,
            confidence: validationResult.phoneConfidence || 0,
            queryType: 'validation',
          });
        }
      }

      // Add tertiary phone
      if (tertiaryResult.phone) {
        const normalized = formatPhoneWithCountryCode(tertiaryResult.phone, country);
        if (normalized) {
          candidates.push({
            rawPhone: tertiaryResult.phone,
            normalizedPhone: normalized,
            confidence: tertiaryResult.phoneConfidence || 0,
            queryType: 'tertiary',
          });
        }
      }

      console.log(`[Tier3Search] Collected ${candidates.length} phone candidates`);

      // STEP 5: Apply consensus rules to select best phone
      const bestPhone = this.applyPhoneConsensus(candidates);

      if (!bestPhone) {
        console.log(`[Tier3Search] No phone passed consensus rules`);
        return {
          success: !!primaryResult.address,
          address: primaryResult.address,
          addressConfidence: primaryResult.addressConfidence,
          phoneError: "No phone met consensus criteria",
          phoneConfidence: 0,
        };
      }

      console.log(`[Tier3Search] Selected phone from ${bestPhone.queryType} with confidence ${bestPhone.confidence}`);

      // Return combined result (address from primary, phone from consensus)
      return {
        success: true,
        address: primaryResult.address,
        addressConfidence: primaryResult.addressConfidence,
        phone: bestPhone.rawPhone,
        phoneConfidence: bestPhone.confidence,
      };
    } catch (error: any) {
      console.error("[Tier3Search] Error:", error);
      return {
        success: false,
        addressError: error.message,
        phoneError: error.message,
      };
    }
  }

  /**
   * Execute a single web search query and extract data
   */
  private static async executeSingleWebSearch(
    searchQuery: string,
    companyName: string,
    country: string,
    needsAddress: boolean,
    needsPhone: boolean,
    queryType: 'primary' | 'validation' | 'tertiary'
  ): Promise<EnrichmentResult> {
    try {
      const searchResults = await searchWeb(searchQuery);

      if (!searchResults.success || searchResults.results.length === 0) {
        return {
          success: false,
          addressError: searchResults.error || "No search results",
          phoneError: searchResults.error || "No search results",
        };
      }

      // Format search results for AI
      const searchContext = formatSearchResultsForAI(searchResults.results);
      
      const prompt = this.buildWebSearchPrompt(
        companyName,
        country,
        needsAddress,
        needsPhone,
        searchContext
      );

      const systemPrompt = `You are a precise data extraction expert. Extract LOCAL office information from web search results.

CRITICAL REQUIREMENTS:
- Extract company's LOCAL office in the SPECIFIED COUNTRY only
- Do NOT return global HQ data unless it's in the specified country
- Only extract information explicitly stated in the search results
- Return SEPARATE confidence scores for address and phone (0.0-1.0)
- Confidence 0.9-1.0: Official company website or verified Google Business
- Confidence 0.7-0.89: Reputable directories
- Never guess or fabricate

Output valid JSON only.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `${systemPrompt}\n\n${prompt}`,
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 1500,
        },
      });

      const responseText = response.text || '';
      if (!responseText) {
        return {
          success: false,
          addressError: "No AI response",
          phoneError: "No AI response",
        };
      }

      const parsed = JSON.parse(responseText);
      const result: EnrichmentResult = { success: false };

      // Extract address
      if (needsAddress) {
        if (parsed.addressFound && parsed.address) {
          const address = this.normalizeAddress(parsed.address, country);
          if (this.validateAddress(address, country)) {
            result.address = address;
            result.addressConfidence = parsed.addressConfidence || 0.8;
          } else {
            result.addressError = "Invalid address format";
            result.addressConfidence = 0;
          }
        } else {
          result.addressError = parsed.addressReason || "Address not found";
          result.addressConfidence = 0;
        }
      }

      // Extract phone (RAW format - normalization happens in consensus logic)
      if (needsPhone) {
        if (parsed.phoneFound && parsed.phone) {
          // Return RAW phone from AI - will be normalized in runEnhancedWebSearch for consensus
          result.phone = String(parsed.phone).trim();
          result.phoneConfidence = parsed.phoneConfidence || 0.8;
        } else {
          result.phoneError = parsed.phoneReason || "Phone not found";
          result.phoneConfidence = 0;
        }
      }

      result.success = !!(result.address || result.phone);
      return result;
    } catch (error: any) {
      console.error(`[Tier3Search] ${queryType} query error:`, error);
      return {
        success: false,
        addressError: error.message,
        phoneError: error.message,
      };
    }
  }

  /**
   * TIER 3: Apply consensus rules to select best phone from multiple candidates
   * 
   * Rules:
   * 1. Exact normalized match across ≥2 sources → confidence 0.9
   * 2. Single source with AI confidence ≥0.75 → keep original confidence
   * 3. Conflicting values → prefer most frequent normalized phone (confidence 0.7)
   * 4. No consensus above 0.55 → discard (return null)
   */
  private static applyPhoneConsensus(
    candidates: Array<{
      rawPhone: string;
      normalizedPhone: string;
      confidence: number;
      queryType: 'primary' | 'validation' | 'tertiary';
    }>
  ): { rawPhone: string; confidence: number; queryType: string } | null {
    if (candidates.length === 0) {
      return null;
    }

    // Group by normalized phone to detect consensus
    const groups = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      const existing = groups.get(candidate.normalizedPhone) || [];
      existing.push(candidate);
      groups.set(candidate.normalizedPhone, existing);
    }

    // RULE 1: Exact match across ≥2 sources → confidence 0.9
    for (const [normalizedPhone, group] of groups.entries()) {
      if (group.length >= 2) {
        console.log(`[Tier3Consensus] Found ${group.length} sources with same phone - boosting to 0.9`);
        // Return the candidate with highest original confidence
        const best = group.reduce((a, b) => a.confidence > b.confidence ? a : b);
        return {
          rawPhone: best.rawPhone,
          confidence: 0.9, // Boosted confidence due to consensus
          queryType: `${best.queryType}+consensus(${group.length})`,
        };
      }
    }

    // RULE 2: Single source with AI confidence ≥0.75 → keep original confidence
    const highConfidenceCandidate = candidates.find(c => c.confidence >= 0.75);
    if (highConfidenceCandidate) {
      console.log(`[Tier3Consensus] Single source with high confidence ${highConfidenceCandidate.confidence}`);
      return {
        rawPhone: highConfidenceCandidate.rawPhone,
        confidence: highConfidenceCandidate.confidence,
        queryType: highConfidenceCandidate.queryType,
      };
    }

    // RULE 3: Conflicting values → prefer most frequent (should already be handled by RULE 1)
    // If we get here, we have multiple candidates but no consensus

    // RULE 4: No consensus above 0.55 → check if any candidate is above 0.55
    const bestCandidate = candidates.reduce((a, b) => a.confidence > b.confidence ? a : b);
    if (bestCandidate.confidence >= 0.55) {
      console.log(`[Tier3Consensus] No consensus, using best single source (${bestCandidate.confidence})`);
      return {
        rawPhone: bestCandidate.rawPhone,
        confidence: bestCandidate.confidence,
        queryType: bestCandidate.queryType,
      };
    }

    console.log(`[Tier3Consensus] All candidates below 0.55 threshold - discarding`);
    return null;
  }

  /**
   * Build AI-only prompt (Stage 1)
   */
  private static buildAIPrompt(
    companyName: string,
    country: string,
    needsAddress: boolean,
    needsPhone: boolean
  ): string {
    const parts: string[] = [];
    parts.push(`Find LOCAL office information for "${companyName}" in ${country} from your training data.\n`);

    if (needsAddress) {
      parts.push(`Address: Extract COMPLETE local office address in ${country}:
- Street Address Line 1 (required)
- Street Address Line 2 (suite/floor/building if available)
- Street Address Line 3 (additional info if available)
- City (required)
- State/Province (required)
- Postal Code (required)`);
    }
    if (needsPhone) {
      parts.push(`Phone: Local office phone number in ${country} with country code`);
    }

    parts.push(this.getJSONFormat(needsAddress, needsPhone));
    return parts.join('\n\n');
  }

  /**
   * Build web search prompt (Stage 2)
   */
  private static buildWebSearchPrompt(
    companyName: string,
    country: string,
    needsAddress: boolean,
    needsPhone: boolean,
    searchContext: string
  ): string {
    const parts: string[] = [];
    
    parts.push(`Extract LOCAL office information for "${companyName}" in ${country} from these web search results:\n\n${searchContext}\n`);

    if (needsAddress) {
      parts.push(`Address: Extract COMPLETE local office address in ${country}:
- Street Address Line 1 (building number and street name - REQUIRED)
- Street Address Line 2 (suite/floor/building/unit - if mentioned)
- Street Address Line 3 (additional location info - if mentioned)
- City (REQUIRED)
- State/Province (REQUIRED)
- Postal Code (REQUIRED)
Target the office location within ${country} specifically.`);
    }
    if (needsPhone) {
      parts.push(`Phone: Extract the local office phone number in ${country} with country code`);
    }

    parts.push(this.getJSONFormat(needsAddress, needsPhone));
    return parts.join('\n\n');
  }

  /**
   * Get JSON format template
   */
  private static getJSONFormat(needsAddress: boolean, needsPhone: boolean): string {
    return `Return JSON in this format:
{
  ${needsAddress ? `"addressFound": true/false,
  "addressConfidence": 0.0-1.0,
  "addressReason": "explanation if not found",
  "address": {
    "address1": "street address line 1 (building number and street name)",
    "address2": "street address line 2 (suite/floor/building/unit - optional)",
    "address3": "street address line 3 (additional info - optional)",
    "city": "city name",
    "state": "state/province",
    "postalCode": "postal code",
    "country": "country name"
  },` : ''}
  ${needsPhone ? `"phoneFound": true/false,
  "phoneConfidence": 0.0-1.0,
  "phoneReason": "explanation if not found",
  "phone": "phone with country code"` : ''}
}`;
  }

  /**
   * DEPRECATED: Old method kept for reference
   * Build GPT prompt for LOCAL office company data extraction with web search
   * Provides specific search query and instructions for web-based research
   */
  private static buildEnrichmentPrompt_DEPRECATED(
    companyName: string,
    country: string,
    needsAddress: boolean,
    needsPhone: boolean,
    searchQuery: string
  ): string {
    const parts: string[] = [];
    
    parts.push(`TASK: Find the LOCAL OFFICE information for "${companyName}" in ${country}

WEB SEARCH QUERY TO USE:
"${searchQuery}"

SEARCH STRATEGY:
- Search the web using the query above
- Look for the company's official website, Google Business listing, LinkedIn company page
- Find the company's regional/local office, branch, or subsidiary physically located in ${country}
- Do NOT return global headquarters information unless the HQ is actually in ${country}
- Check multiple sources for verification
- If the company has no web presence or office in ${country}, mark as not found\n`);

    if (needsAddress) {
      parts.push(`REQUIRED: Local Office Address in ${country}
- Extract the complete, accurate address of the company's office/branch in ${country}
- Include: Street (lines 1, 2, 3 if applicable), City, State/Province, Postal Code, Country
- Use country-specific formatting
- Must be physically located in ${country}`);
    }

    if (needsPhone) {
      parts.push(`REQUIRED: Local Office Phone Number in ${country}
- Find the local office phone number for the company's ${country} location
- Format with country code and proper formatting
- ONLY provide the local office main line in ${country}
- Do NOT provide global HQ phone unless HQ is in ${country}`);
    }

    parts.push(`\nReturn JSON in this EXACT format:
{
  ${needsAddress ? `"addressFound": true/false,
  "addressConfidence": 0.0-1.0,
  "addressReason": "explanation if not found or low confidence",
  "address": {
    "address1": "primary street address",
    "address2": "suite/building/floor (optional)",
    "address3": "additional info (optional)",
    "city": "city name",
    "state": "state/province full name",
    "stateAbbr": "state abbreviation (e.g., CA, NY, NC)",
    "postalCode": "postal/zip code",
    "country": "country name"
  },` : ''}
  ${needsPhone ? `"phoneFound": true/false,
  "phoneConfidence": 0.0-1.0,
  "phoneReason": "explanation if not found",
  "phone": "main company phone number with country code"` : ''}
}

CRITICAL REQUIREMENTS:
- Find LOCAL office in ${country} using WEB SEARCH - NOT global HQ (unless HQ is in ${country})
- Search the web for CURRENT information - don't rely only on training data
- Look for official sources: company website, Google Business Profile, LinkedIn, business directories
- Verify the address and phone are actually located in ${country}
- If the company has no web presence or office in ${country}, mark as not found
- Use proper country-specific formatting:
  * USA: State abbr (CA, NY), 5-digit ZIP, phone: +1-XXX-XXX-XXXX
  * UK: Postal codes (SW1A 1AA), phone: +44-XXXX-XXXXXX
  * Canada: Province (ON, BC), postal (A1A 1A1), phone: +1-XXX-XXX-XXXX
  * Singapore: Postal codes (6 digits), phone: +65-XXXX-XXXX
  * Vietnam: Province/City, phone: +84-XX-XXXX-XXXX
  * Other: Follow local standards
- For address and phone: Must be for ${country} location specifically
- Confidence 0.9-1.0 = Found on official website or verified Google Business listing
- Confidence 0.7-0.89 = Found on reputable business directory
- Below 0.7 = mark as not found`);

    return parts.join('\n\n');
  }

  /**
   * Normalize address components based on country format
   */
  private static normalizeAddress(rawAddress: any, country: string): EnrichmentResult['address'] {
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
   * Normalize phone number
   */
  private static normalizePhone(rawPhone: string, country: string): string | undefined {
    if (!rawPhone) return undefined;
    
    // Remove all non-digit characters except + and -
    let cleaned = rawPhone.trim().replace(/[^\d+\-().\s]/g, '');
    
    // Ensure it starts with + for international format
    if (!cleaned.startsWith('+')) {
      // Try to add country code based on country
      const countryCode = this.getCountryCode(country);
      if (countryCode) {
        cleaned = `+${countryCode}-${cleaned}`;
      }
    }
    
    // Basic validation - must have at least 10 digits
    const digitCount = (cleaned.match(/\d/g) || []).length;
    if (digitCount < 10) return undefined;
    
    return cleaned;
  }

  /**
   * Get country calling code
   */
  private static getCountryCode(country: string): string | null {
    const codes: Record<string, string> = {
      'USA': '1',
      'United States': '1',
      'Canada': '1',
      'UK': '44',
      'United Kingdom': '44',
      'Australia': '61',
      'Germany': '49',
      'France': '33',
      'India': '91',
      'China': '86',
      'Japan': '81',
      'Singapore': '65',
      'Vietnam': '84',
      'Thailand': '66',
      'Malaysia': '60',
      'Indonesia': '62',
      'Philippines': '63',
      'South Korea': '82',
      'Hong Kong': '852',
      'Taiwan': '886',
      'New Zealand': '64',
      'Mexico': '52',
      'Brazil': '55',
      'Spain': '34',
      'Italy': '39',
      'Netherlands': '31',
      'Switzerland': '41',
      'Sweden': '46',
      'Norway': '47',
      'Denmark': '45',
      'Poland': '48',
      'UAE': '971',
      'Saudi Arabia': '966',
      'South Africa': '27',
      // Add more as needed
    };
    
    return codes[country] || null;
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
    
    if (country === "USA" || country === "United States") {
      return cleaned.replace(/[^0-9-]/g, '');
    } else if (country === "Canada") {
      return cleaned.replace(/[^A-Z0-9 ]/g, '');
    } else if (country === "UK" || country === "United Kingdom") {
      return cleaned.replace(/[^A-Z0-9 ]/g, '');
    }
    
    return cleaned;
  }

  /**
   * Validate extracted address has required components
   */
  private static validateAddress(address: EnrichmentResult['address'], country: string): boolean {
    if (!address) return false;
    
    if (!address.address1?.trim()) return false;
    if (!address.city?.trim()) return false;
    if (!address.country?.trim()) return false;
    
    // Country-specific validation
    if (country === "USA" || country === "United States") {
      if (!address.state?.trim()) return false;
      if (!address.postalCode?.match(/^\d{5}(-\d{4})?$/)) return false;
    } else if (country === "Canada") {
      if (!address.state?.trim()) return false;
      if (!address.postalCode?.match(/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/)) return false;
    }
    
    return true;
  }

  /**
   * Check if an account already has enrichment data (for deduplication)
   * @param accountId - The account ID to check
   * @returns True if account has enrichment data, false otherwise
   */
  static async checkAccountEnrichment(accountId: string): Promise<boolean> {
    const { db } = await import("../db");
    const { accounts } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const [account] = await db
      .select({ aiEnrichmentData: accounts.aiEnrichmentData })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    return !!(account?.aiEnrichmentData);
  }

  /**
   * Store enrichment data at account level for reuse across all contacts
   * @param accountId - The account ID
   * @param enrichmentData - The enrichment result to store
   */
  static async storeAccountEnrichment(
    accountId: string,
    enrichmentData: EnrichmentResult
  ): Promise<void> {
    const { db } = await import("../db");
    const { accounts } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    await db
      .update(accounts)
      .set({
        aiEnrichmentData: enrichmentData,
        aiEnrichmentDate: new Date(),
      })
      .where(eq(accounts.id, accountId));

    console.log(`[CompanyEnrichment] Stored enrichment data for account ${accountId}`);
  }

  /**
   * Propagate account-level enrichment data to a contact
   * @param contactId - The contact ID
   * @param accountId - The account ID with enrichment data
   */
  static async propagateToContact(contactId: string, accountId: string): Promise<void> {
    const { db } = await import("../db");
    const { accounts, verificationContacts } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const [account] = await db
      .select({ aiEnrichmentData: accounts.aiEnrichmentData })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (!account?.aiEnrichmentData) {
      console.log(`[CompanyEnrichment] No enrichment data found for account ${accountId}`);
      return;
    }

    const enrichmentData = account.aiEnrichmentData as EnrichmentResult;
    const updateData: any = {};

    // TIER 2: Only propagate addresses with confidence ≥0.7
    if (enrichmentData.address && enrichmentData.address.address1 && enrichmentData.address.city) {
      const addressConfidence = enrichmentData.addressConfidence || 0;
      if (addressConfidence >= 0.7) {
        updateData.aiEnrichedAddress1 = enrichmentData.address.address1;
        updateData.aiEnrichedAddress2 = enrichmentData.address.address2 || null;
        updateData.aiEnrichedAddress3 = enrichmentData.address.address3 || null;
        updateData.aiEnrichedCity = enrichmentData.address.city;
        updateData.aiEnrichedState = enrichmentData.address.state;
        updateData.aiEnrichedPostal = enrichmentData.address.postalCode;
        updateData.aiEnrichedCountry = enrichmentData.address.country;
        updateData.addressEnrichmentStatus = 'completed';
      } else {
        console.log(`[CompanyEnrichment] Skipping address propagation - confidence ${addressConfidence} < 0.7`);
      }
    }

    // TIER 2: Only propagate phones with confidence ≥0.55 (lowered from 0.7)
    if (enrichmentData.phone?.trim()) {
      const phoneConfidence = enrichmentData.phoneConfidence || 0;
      if (phoneConfidence >= 0.55) {
        updateData.aiEnrichedPhone = enrichmentData.phone;
        updateData.phoneEnrichmentStatus = 'completed';
      } else {
        console.log(`[CompanyEnrichment] Skipping phone propagation - confidence ${phoneConfidence} < 0.55`);
      }
    }

    if (Object.keys(updateData).length > 0) {
      await db
        .update(verificationContacts)
        .set(updateData)
        .where(eq(verificationContacts.id, contactId));

      console.log(`[CompanyEnrichment] Propagated enrichment data to contact ${contactId}`);
    }
  }

  /**
   * Store enrichment with confidence fallback (≥0.55 but <0.7)
   * Stores low-confidence data in separate fields for review
   * @param contactId - The contact ID
   * @param result - The enrichment result
   */
  static async storeWithConfidenceFallback(
    contactId: string,
    result: EnrichmentResult
  ): Promise<{ stored: boolean; lowConfidence: boolean }> {
    const { db } = await import("../db");
    const { verificationContacts } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const updateData: any = {};
    let hasHighConfidence = false;
    let hasLowConfidence = false;

    if (result.address) {
      const addressConfidence = result.addressConfidence || 0;
      
      if (addressConfidence >= 0.7) {
        updateData.aiEnrichedAddress1 = result.address.address1;
        updateData.aiEnrichedAddress2 = result.address.address2 || null;
        updateData.aiEnrichedAddress3 = result.address.address3 || null;
        updateData.aiEnrichedCity = result.address.city;
        updateData.aiEnrichedState = result.address.state;
        updateData.aiEnrichedPostal = result.address.postalCode;
        updateData.aiEnrichedCountry = result.address.country;
        updateData.addressEnrichmentStatus = 'completed';
        hasHighConfidence = true;
      } else if (addressConfidence >= 0.55) {
        updateData.addressEnrichmentStatus = 'low_confidence';
        updateData.addressEnrichmentNotes = `Low confidence (${Math.round(addressConfidence * 100)}%) - requires review`;
        hasLowConfidence = true;
      }
    }

    if (result.phone) {
      const phoneConfidence = result.phoneConfidence || 0;
      
      if (phoneConfidence >= 0.7) {
        updateData.aiEnrichedPhone = result.phone;
        updateData.phoneEnrichmentStatus = 'completed';
        hasHighConfidence = true;
      } else if (phoneConfidence >= 0.55) {
        updateData.phoneEnrichmentStatus = 'low_confidence';
        updateData.phoneEnrichmentNotes = `Low confidence (${Math.round(phoneConfidence * 100)}%) - requires review`;
        hasLowConfidence = true;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await db
        .update(verificationContacts)
        .set(updateData)
        .where(eq(verificationContacts.id, contactId));

      console.log(`[CompanyEnrichment] Stored enrichment for contact ${contactId} (high: ${hasHighConfidence}, low: ${hasLowConfidence})`);
      
      return { stored: true, lowConfidence: hasLowConfidence };
    }

    return { stored: false, lowConfidence: false };
  }
}

export default CompanyEnrichmentService;
