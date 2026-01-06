import openai from './openai';
import type { customFieldDefinitions } from '@shared/schema';

type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;

interface TargetField {
  key: string;
  label: string;
  entity: 'contact' | 'account';
  description?: string;
  dataType?: string;
  isCustom?: boolean;
}

interface ColumnSample {
  csvColumn: string;
  sampleValues: string[];
}

interface AiFieldMatch {
  csvColumn: string;
  targetField: string | null;
  targetEntity: 'contact' | 'account' | null;
  confidence: number; // 0-1
  rationale: string;
}

/**
 * AI-powered CSV field matching service
 * Analyzes CSV headers and sample data to intelligently suggest field mappings
 */
export class AiFieldMatcherService {
  private static SAMPLE_ROWS_LIMIT = 5;
  private static MIN_CONFIDENCE_AUTO_APPLY = 0.8;
  private static CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes
  private static matchCache = new Map<string, { matches: AiFieldMatch[]; timestamp: number }>();

  /**
   * Build target field catalog from schema
   */
  private static buildTargetFieldCatalog(customFields?: CustomFieldDefinition[]): TargetField[] {
    const standardContactFields: TargetField[] = [
      { key: 'fullName', label: 'Full Name', entity: 'contact', description: 'Complete name of the contact (first + last)' },
      { key: 'firstName', label: 'First Name', entity: 'contact', description: 'Given name / first name' },
      { key: 'lastName', label: 'Last Name', entity: 'contact', description: 'Family name / surname / last name' },
      { key: 'title', label: 'Job Title', entity: 'contact', description: 'Professional role, position, or job title' },
      { key: 'email', label: 'Email', entity: 'contact', description: 'Email address', dataType: 'email' },
      { key: 'phone', label: 'Phone', entity: 'contact', description: 'Primary/direct phone number', dataType: 'phone' },
      { key: 'mobile', label: 'Mobile', entity: 'contact', description: 'Mobile/cell phone number', dataType: 'phone' },
      { key: 'linkedinUrl', label: 'LinkedIn URL', entity: 'contact', description: 'LinkedIn profile link/URL', dataType: 'url' },
      { key: 'contactAddress1', label: 'Contact Address Line 1', entity: 'contact', description: 'Contact street address line 1' },
      { key: 'contactAddress2', label: 'Contact Address Line 2', entity: 'contact', description: 'Contact street address line 2' },
      { key: 'contactAddress3', label: 'Contact Address Line 3', entity: 'contact', description: 'Contact street address line 3' },
      { key: 'contactCity', label: 'Contact City', entity: 'contact', description: 'Contact city name' },
      { key: 'contactState', label: 'Contact State/Province', entity: 'contact', description: 'Contact state or province' },
      { key: 'contactCountry', label: 'Contact Country', entity: 'contact', description: 'Contact country name (REQUIRED for verification)' },
      { key: 'contactPostal', label: 'Contact Postal Code', entity: 'contact', description: 'Contact ZIP or postal code' },
      { key: 'cavId', label: 'CAV ID', entity: 'contact', description: 'CAV unique identifier / external ID from data provider' },
      { key: 'cavUserId', label: 'CAV User ID', entity: 'contact', description: 'CAV user identifier from data provider' },
      { key: 'sourceType', label: 'Source Type', entity: 'contact', description: 'Data source type (e.g., cognism, lusha, zoominfo, apollo)' },
    ];

    const standardAccountFields: TargetField[] = [
      { key: 'account_name', label: 'Company Name', entity: 'account', description: 'Organization, company, or business name' },
      { key: 'domain', label: 'Company Domain', entity: 'account', description: 'Company website domain (e.g., example.com)', dataType: 'domain' },
      { key: 'hqPhone', label: 'HQ Phone', entity: 'account', description: 'Company/headquarters main phone number', dataType: 'phone' },
      { key: 'hqAddress1', label: 'HQ Address Line 1', entity: 'account', description: 'Company/HQ street address line 1' },
      { key: 'hqAddress2', label: 'HQ Address Line 2', entity: 'account', description: 'Company/HQ street address line 2' },
      { key: 'hqAddress3', label: 'HQ Address Line 3', entity: 'account', description: 'Company/HQ street address line 3' },
      { key: 'hqCity', label: 'HQ City', entity: 'account', description: 'Company/headquarters city' },
      { key: 'hqState', label: 'HQ State/Province', entity: 'account', description: 'Company/headquarters state or province' },
      { key: 'hqCountry', label: 'HQ Country', entity: 'account', description: 'Company/headquarters country' },
      { key: 'hqPostal', label: 'HQ Postal Code', entity: 'account', description: 'Company/headquarters ZIP or postal code' },
    ];

    // Add custom fields
    const customFieldsFormatted: TargetField[] = (customFields || [])
      .filter(f => f.active)
      .map(f => ({
        key: `custom_${f.fieldKey}`,
        label: f.displayLabel,
        entity: f.entityType as 'contact' | 'account',
        description: `Custom ${f.fieldType} field`,
        dataType: f.fieldType,
        isCustom: true,
      }));

    return [...standardContactFields, ...standardAccountFields, ...customFieldsFormatted];
  }

  /**
   * Sample CSV column data (first N non-empty values)
   */
  private static sampleColumnData(csvData: string[][], headers: string[]): ColumnSample[] {
    return headers.map((header, colIndex) => {
      const samples: string[] = [];
      
      for (let rowIndex = 0; rowIndex < csvData.length && samples.length < this.SAMPLE_ROWS_LIMIT; rowIndex++) {
        const value = csvData[rowIndex]?.[colIndex]?.trim();
        if (value && value.length > 0) {
          // Truncate long values
          samples.push(value.length > 100 ? value.substring(0, 100) + '...' : value);
        }
      }

      return {
        csvColumn: header,
        sampleValues: samples,
      };
    });
  }

  /**
   * Generate cache key for deduplication
   */
  private static getCacheKey(headers: string[], targetFields: TargetField[]): string {
    // Clone arrays before sorting to avoid mutating original arrays
    const headerHash = [...headers].sort().join('|');
    const fieldHash = targetFields.map(f => f.key).sort().join('|');
    return `${headerHash}::${fieldHash}`;
  }

  /**
   * Build AI prompt for field matching
   */
  private static buildPrompt(columnSamples: ColumnSample[], targetFields: TargetField[]): string {
    const targetFieldsJson = targetFields.map(f => ({
      key: f.key,
      label: f.label,
      entity: f.entity,
      description: f.description,
      dataType: f.dataType,
      isCustom: f.isCustom || false,
    }));

    return `You are an expert data mapping assistant for a B2B CRM system. Your task is to analyze CSV column headers and sample data, then suggest the best matching database field for each column.

**Available Target Fields:**
${JSON.stringify(targetFieldsJson, null, 2)}

**CSV Columns to Map:**
${JSON.stringify(columnSamples, null, 2)}

**Instructions:**
1. Analyze each CSV column header AND sample values to understand the data type and meaning
2. Match each CSV column to the most appropriate target field
3. If no good match exists, set targetField to null
4. Provide a confidence score (0.0 to 1.0) where:
   - 0.9-1.0: Extremely confident (exact semantic match)
   - 0.7-0.9: Very confident (clear match with minor differences)
   - 0.5-0.7: Moderately confident (reasonable match but some ambiguity)
   - 0.0-0.5: Low confidence (uncertain or no clear match)
5. Include brief rationale explaining your matching decision

**Special Handling for Address Fields:**
- If a CSV column contains a COMBINED full address (e.g., "123 Main St, New York, NY 10001"), suggest:
  - contactAddress1 or hqAddress1 (for contact/company full address)
  - Add a note in rationale that it may need manual parsing into separate components
- If column header mentions "Location", "Address", or similar:
  - Check sample values to determine if it's company (HQ) vs contact address
  - hqAddress1/2/3, contactAddress1/2/3 are separate LINE fields (not combined)
  - Prefer the correct entity (hqAddress* for company, contactAddress* for contact)
  - For multi-line addresses, use the most specific component field available

**Output Format (JSON array):**
[
  {
    "csvColumn": "string",
    "targetField": "string | null",
    "targetEntity": "contact | account | null",
    "confidence": number,
    "rationale": "string"
  }
]

Respond ONLY with the JSON array, no additional text.`;
  }

  /**
   * Parse and validate AI response
   */
  private static parseAiResponse(response: string): AiFieldMatch[] {
    try {
      // Clean potential markdown code blocks
      let cleaned = response.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/```\s*/g, '').replace(/```\s*$/g, '');
      }

      const parsed = JSON.parse(cleaned);
      
      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array');
      }

      // Validate structure
      return parsed.map(match => ({
        csvColumn: String(match.csvColumn || ''),
        targetField: match.targetField ? String(match.targetField) : null,
        targetEntity: match.targetEntity as 'contact' | 'account' | null,
        confidence: Math.max(0, Math.min(1, Number(match.confidence) || 0)),
        rationale: String(match.rationale || 'No explanation provided'),
      }));
    } catch (error) {
      console.error('[AI Field Matcher] Failed to parse AI response:', error);
      throw new Error('Invalid AI response format');
    }
  }

  /**
   * Get AI-powered field mapping suggestions
   */
  static async suggestMappings(
    csvHeaders: string[],
    csvData: string[][],
    customFields?: CustomFieldDefinition[]
  ): Promise<AiFieldMatch[]> {
    try {
      // Build target field catalog
      const targetFields = this.buildTargetFieldCatalog(customFields);

      // Check cache
      const cacheKey = this.getCacheKey(csvHeaders, targetFields);
      const cached = this.matchCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        console.log('[AI Field Matcher] Returning cached suggestions');
        return cached.matches;
      }

      // Sample column data
      const columnSamples = this.sampleColumnData(csvData, csvHeaders);

      // Build prompt
      const prompt = this.buildPrompt(columnSamples, targetFields);

      console.log('[AI Field Matcher] Requesting AI suggestions for', csvHeaders.length, 'columns');

      // Call OpenAI
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at analyzing CSV data and mapping fields to database schemas. You provide precise, well-reasoned field mappings.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3, // Lower temperature for more deterministic matching
        max_tokens: 4000,
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error('Empty AI response');
      }

      // Parse response
      const matches = this.parseAiResponse(responseText);

      // Cache results
      this.matchCache.set(cacheKey, {
        matches,
        timestamp: Date.now(),
      });

      console.log('[AI Field Matcher] Successfully generated', matches.length, 'suggestions');
      return matches;
    } catch (error: any) {
      console.error('[AI Field Matcher] Error generating suggestions:', error);
      throw error;
    }
  }

  /**
   * Clear expired cache entries (cleanup)
   */
  static clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.matchCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL_MS) {
        this.matchCache.delete(key);
      }
    }
  }
}
