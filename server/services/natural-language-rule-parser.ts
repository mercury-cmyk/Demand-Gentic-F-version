import OpenAI from "openai";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";

// Lazy OpenAI client – instantiate only when needed and when credentials exist
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY.");
    }
    _openai = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openai;
}

interface ParsedRule {
  criterion: string;
  requirement: string;
  mandatory: boolean;
  pointsDeduction?: number;
  pointsBonus?: number;
  acceptableValues?: string[];
}

interface ParsedQARules {
  criteria: ParsedRule[];
  threshold_score?: number;
  evaluation_instructions: string;
}

/**
 * Parses natural language qualification rules into structured format using OpenAI
 */
export async function parseNaturalLanguageRules(
  rulesText: string
): Promise<ParsedQARules> {
  if (!rulesText || rulesText.trim().length === 0) {
    return {
      criteria: [],
      evaluation_instructions: "No custom rules defined",
    };
  }

  try {
    const openai = getOpenAI();
    const systemPrompt = await buildAgentSystemPrompt(`You are a qualification rules parser. Extract evaluation criteria from natural language business rules.
          
For each criterion, identify:
- The criterion name (e.g., "Content Interest", "Permission Given")
- The requirement (what is expected)
- Whether it's mandatory (required vs. nice-to-have)
- Point deductions for violations
- Point bonuses for meeting criteria
- Acceptable values (e.g., "Yes", "No", "Manager or above")

Return a JSON object with:
{
  "criteria": [
    {
      "criterion": "string",
      "requirement": "string",
      "mandatory": boolean,
      "pointsDeduction": number (optional),
      "pointsBonus": number (optional),
      "acceptableValues": ["string"] (optional)
    }
  ],
  "threshold_score": number (optional, if mentioned in rules),
  "evaluation_instructions": "string (summary of rules for AI evaluator)"
}`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `Parse these qualification rules:\n\n${rulesText}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result as ParsedQARules;
  } catch (error) {
    console.error("[Rule Parser] Failed to parse rules:", error);
    // Return fallback structure
    return {
      criteria: [],
      evaluation_instructions: `Apply these custom rules:\n${rulesText}`,
    };
  }
}

/**
 * Generates a dynamic evaluation prompt from parsed rules and custom QA fields
 */
export function generateDynamicEvaluationPrompt(
  parsedRules: ParsedQARules,
  customQaFields: Array<{
    name: string;
    label: string;
    type: string;
    required: boolean;
    options?: string[];
  }>,
  transcript: string,
  contactData?: any,
  campaignContext?: {
    campaignName?: string;
    campaignObjective?: string | null;
    successCriteria?: string | null;
    targetAudienceDescription?: string | null;
    campaignContextBrief?: string | null;
  }
): string {
  const criteriaInstructions = parsedRules.criteria
    .map((rule, idx) => {
      let instruction = `${idx + 1}. ${rule.criterion}: ${rule.requirement}`;
      if (rule.mandatory) {
        instruction += " (MANDATORY)";
      }
      if (rule.pointsDeduction) {
        instruction += ` - Deduct ${rule.pointsDeduction} points if not met`;
      }
      if (rule.pointsBonus) {
        instruction += ` - Award ${rule.pointsBonus} points if met`;
      }
      if (rule.acceptableValues && rule.acceptableValues.length > 0) {
        instruction += ` - Acceptable values: ${rule.acceptableValues.join(", ")}`;
      }
      return instruction;
    })
    .join("\n");

  const customFieldsInstructions = customQaFields
    .map((field) => {
      let instruction = `- ${field.label} (${field.name})`;
      if (field.type === "select" && field.options) {
        instruction += ` - Options: ${field.options.join(", ")}`;
      }
      if (field.required) {
        instruction += " [REQUIRED]";
      }
      return instruction;
    })
    .join("\n");

  // Build campaign objective section if available
  const campaignObjectiveSection = campaignContext ? `
## CAMPAIGN OBJECTIVE & SUCCESS CRITERIA:
- Campaign: ${campaignContext.campaignName || 'Not specified'}
- Objective: ${campaignContext.campaignObjective || 'Not specified'}
- Success Criteria: ${campaignContext.successCriteria || 'Not specified'}
- Target Audience: ${campaignContext.targetAudienceDescription || 'Not specified'}
- Context Brief: ${campaignContext.campaignContextBrief || 'Not specified'}

**IMPORTANT**: Score this lead against the campaign objective and success criteria above.
- The lead MUST align with the stated objective to be considered qualified.
- The success criteria define what a successful outcome looks like — verify whether the call achieved it.
- If the target audience is specified, verify that the prospect matches the described profile.
` : '';

  return `
You are an expert call quality analyst. Evaluate this sales call transcript and extract qualification data.
${campaignObjectiveSection}
## CUSTOM QUALIFICATION RULES:
${criteriaInstructions}

${parsedRules.threshold_score ? `Minimum Passing Score: ${parsedRules.threshold_score}` : ""}

## CUSTOM QA FIELDS TO EXTRACT:
${customFieldsInstructions}

## ADDITIONAL INSTRUCTIONS:
${parsedRules.evaluation_instructions}

## VERIFIED DATA ALREADY IN SYSTEM (DO NOT FLAG AS MISSING):

### Contact Information:
${contactData?.contact ? `
- Full Name: ${contactData.contact.fullName || 'Not provided'}
- Email: ${contactData.contact.email || 'Not provided'}
- Phone: ${contactData.contact.phone || 'Not provided'}
- Job Title: ${contactData.contact.title || 'Not provided'}
- Email Verification Status: ${contactData.contact.emailVerificationStatus || 'Pending'}
` : 'Not provided'}

### Account/Company Information:
${contactData?.account ? `
- Company Name: ${contactData.account.name || 'Not provided'}
- Industry: ${contactData.account.industry || 'Not provided'}
- Company Size: ${contactData.account.companySize || 'Not provided'}
- Annual Revenue: ${contactData.account.revenue || 'Not provided'}
- Technologies: ${contactData.account.technologies?.join(', ') || 'Not provided'}
- Domain: ${contactData.account.domain || 'Not provided'}
` : 'Not provided'}

${contactData?.companiesHouse ? `
### Companies House UK Registry (OFFICIAL VERIFICATION):
- Legal Company Name: ${contactData.companiesHouse.legalName}
- Company Registration Number: ${contactData.companiesHouse.companyNumber}
- Company Status: ${contactData.companiesHouse.status} ${contactData.companiesHouse.isActive ? '(ACTIVE)' : '(INACTIVE)'}
- Date of Creation: ${contactData.companiesHouse.dateOfCreation}
- Registered Address: ${contactData.companiesHouse.address}
- Validation Status: ✓ ${contactData.companiesHouse.validationStatus}

**IMPORTANT: This company has been officially verified. Do NOT mark company registration details as missing.**
` : ''}

## CALL TRANSCRIPT:
${transcript}

## TASK:
1. Extract all custom QA field values from the transcript and contact data
2. Apply the qualification rules and calculate a score (0-100)
3. Determine if the lead is "qualified", "not_qualified", or "needs_review"
4. Provide detailed reasoning for your assessment

CRITICAL: A lead can only be "qualified" if it aligns with the Campaign Objective and meets the Success Criteria. Even if individual rule scores are high, reject or flag for review if the call outcome does not match the campaign's stated success criteria.

Return your analysis in the following JSON format:
{
  "qa_data": {
    // All custom QA fields with extracted values
  },
  "ai_score": number (0-100),
  "ai_qualification_status": "qualified" | "not_qualified" | "needs_review",
  "reasoning": "detailed explanation including alignment with campaign objective",
  "rule_violations": ["list of rules that were not met"],
  "rule_achievements": ["list of rules that were met"]
}
`;
}

