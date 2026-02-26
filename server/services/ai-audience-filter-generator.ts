/**
 * AI Audience Filter Generator
 *
 * Auto-generates FilterGroup conditions from Organization Intelligence ICP data
 * and campaign context. Uses Vertex AI to map ICP personas, industries, and
 * company size into actionable contact/account filter conditions.
 */

import { generateJSON } from "./vertex-ai/vertex-client";
import { getFullOrganizationIntelligence } from "./unified-landing-page-engine";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
import type { FilterGroup, FilterCondition } from "../../shared/filter-types";
import crypto from "crypto";

export interface AudienceFilterInput {
  organizationId: string;
  campaignName?: string;
  campaignObjective?: string;
  targetAudienceDescription?: string;
}

export interface AudienceFilterResult {
  filterGroup: FilterGroup;
  reasoning: string;
  confidence: number;
  aiModel: string;
  durationMs: number;
}

// Valid filter fields the AI can use (subset of contact filter fields)
const AVAILABLE_FILTER_FIELDS = `
AVAILABLE FILTER FIELDS (use ONLY these exact field names):

1. jobTitle (text) — Contact's job title
   Operators: equals, contains, not_contains, begins_with
   Example values: "CTO", "VP Engineering", "Director of IT"

2. seniorityLevel (text) — Contact's seniority level
   Operators: equals, not_equals
   Valid values: "C-Level", "VP", "Director", "Manager", "Senior", "Entry", "Intern", "Owner", "Partner"

3. department (text) — Contact's department
   Operators: equals, contains
   Example values: "Engineering", "IT", "Finance", "Marketing", "Sales", "Operations", "Human Resources"

4. industryStandardized (text) — Company's industry (via account join)
   Operators: equals, contains
   Example values: "Information Technology", "Financial Services", "Healthcare", "Manufacturing", "SaaS", "Software"

5. employeesSizeRange (text) — Company size range
   Operators: equals
   Valid values ONLY: "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"

6. country (text) — Contact's country
   Operators: equals
   Example values: "United States", "United Kingdom", "Canada", "Germany"

7. state (text) — Contact's state/region
   Operators: equals, contains

8. city (text) — Contact's city
   Operators: equals, contains

9. techStack (array) — Company's technology stack
   Operators: contains
   Example values: "Salesforce", "HubSpot", "AWS", "Azure", "Kubernetes"

10. annualRevenue (text) — Company revenue range
    Operators: equals
    Example values: "$0-1M", "$1-10M", "$10-50M", "$50-100M", "$100-500M", "$500M-1B", "$1B+"
`;

const FILTER_OUTPUT_SCHEMA = `
OUTPUT FORMAT (strict JSON):
{
  "filterGroup": {
    "logic": "AND",
    "conditions": [
      {
        "field": "<field_name>",
        "operator": "<operator>",
        "values": ["value1", "value2"]
      }
    ]
  },
  "reasoning": "Brief explanation of why these filters were chosen based on the ICP and campaign context",
  "confidence": 0.85
}

RULES:
- Use "AND" logic to combine conditions (all must match)
- Use multi-value arrays for OR within a field (e.g., ["CTO", "VP Engineering"] means CTO OR VP Engineering)
- Only use fields and operators listed above
- For employeesSizeRange, use EXACT valid values only
- For jobTitle, prefer "contains" operator for broader matching
- For industryStandardized, prefer "contains" for flexible matching
- Generate 2-6 conditions — enough to be targeted but not too restrictive
- Set confidence between 0 and 1 based on how well the ICP data maps to filters
- If ICP data is vague, use broader filters with lower confidence
`;

export async function generateAudienceFilters(
  input: AudienceFilterInput
): Promise<AudienceFilterResult> {
  const startMs = Date.now();

  // Get Organization Intelligence
  const orgIntel = await getFullOrganizationIntelligence(input.organizationId);

  if (!orgIntel.populated) {
    throw Object.assign(
      new Error(
        "Organization Intelligence is required to generate audience filters. Please configure your organization's ICP, industries, and personas first."
      ),
      { code: "ORG_INTELLIGENCE_REQUIRED", statusCode: 422 }
    );
  }

  // Build the system prompt
  const systemPrompt = await buildAgentSystemPrompt(
    `You are an expert B2B audience targeting specialist. Your job is to translate Ideal Customer Profile (ICP) data and campaign objectives into precise database filter conditions for targeting the right contacts.

You must ONLY use the filter fields and operators provided. Do not invent fields or operators that are not listed.

${AVAILABLE_FILTER_FIELDS}

${FILTER_OUTPUT_SCHEMA}`
  );

  // Build user prompt with OI + campaign context
  const contextParts: string[] = [];

  contextParts.push("=== ORGANIZATION INTELLIGENCE ===");
  contextParts.push(orgIntel.raw);
  contextParts.push("=== END ORGANIZATION INTELLIGENCE ===");

  if (input.campaignName) {
    contextParts.push(`Campaign Name: ${input.campaignName}`);
  }
  if (input.campaignObjective) {
    contextParts.push(`Campaign Objective: ${input.campaignObjective}`);
  }
  if (input.targetAudienceDescription) {
    contextParts.push(
      `Target Audience Description: ${input.targetAudienceDescription}`
    );
  }

  const userPrompt = `Based on the Organization Intelligence ICP data and campaign context below, generate a FilterGroup that targets the ideal audience for this campaign.

${contextParts.join("\n\n")}

Generate the FilterGroup JSON now. Focus on the ICP personas, target industries, and company size from the Organization Intelligence. If campaign-specific targeting is provided, prioritize that over general ICP data.`;

  console.log(
    "[AI Audience Filter] Generating filters for org:",
    input.organizationId
  );

  // Call Vertex AI for structured JSON
  const result = await generateJSON<{
    filterGroup: { logic: string; conditions: Array<{ field: string; operator: string; values: (string | number)[] }> };
    reasoning: string;
    confidence: number;
  }>(userPrompt, {
    temperature: 0.3,
    maxTokens: 2048,
  });

  // Validate and normalize the response
  const filterGroup = normalizeFilterGroup(result.filterGroup);

  console.log(
    `[AI Audience Filter] Generated ${filterGroup.conditions.length} conditions, confidence: ${result.confidence}`
  );

  return {
    filterGroup,
    reasoning: result.reasoning || "Filters generated from Organization Intelligence ICP data.",
    confidence: Math.min(1, Math.max(0, result.confidence || 0.7)),
    aiModel: "gemini-2.0-flash-001",
    durationMs: Date.now() - startMs,
  };
}

/**
 * Validates and normalizes the AI-generated FilterGroup.
 * Ensures all conditions have valid fields, operators, and unique IDs.
 */
function normalizeFilterGroup(raw: any): FilterGroup {
  const validFields = new Set([
    "jobTitle", "seniorityLevel", "department", "industryStandardized",
    "employeesSizeRange", "country", "state", "city", "techStack", "annualRevenue",
  ]);

  const validOperators = new Set([
    "equals", "not_equals", "contains", "not_contains",
    "begins_with", "ends_with", "is_empty", "has_any_value",
  ]);

  const logic = raw?.logic === "OR" ? "OR" : "AND";
  const rawConditions = Array.isArray(raw?.conditions) ? raw.conditions : [];

  const conditions: FilterCondition[] = rawConditions
    .filter((c: any) => {
      if (!c.field || !validFields.has(c.field)) {
        console.warn(`[AI Audience Filter] Skipping invalid field: ${c.field}`);
        return false;
      }
      if (!c.operator || !validOperators.has(c.operator)) {
        console.warn(`[AI Audience Filter] Skipping invalid operator: ${c.operator}`);
        return false;
      }
      if (!c.values || !Array.isArray(c.values) || c.values.length === 0) {
        console.warn(`[AI Audience Filter] Skipping condition with no values: ${c.field}`);
        return false;
      }
      return true;
    })
    .map((c: any) => ({
      id: c.id || crypto.randomUUID(),
      field: c.field,
      operator: c.operator,
      values: c.values.map((v: any) => String(v)),
    }));

  if (conditions.length === 0) {
    throw new Error(
      "AI could not generate valid filter conditions from the available ICP data. Please ensure your Organization Intelligence has ICP information (industries, personas, company size) configured."
    );
  }

  return { logic, conditions };
}
