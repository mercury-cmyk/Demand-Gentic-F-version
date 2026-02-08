/**
 * Campaign Ingestion Service
 * 
 * Automatically transforms raw campaign descriptions (text, documents, briefs)
 * into structured campaign configurations using Gemini AI.
 * 
 * Outputs a campaign-ready structure with:
 * - Campaign objective
 * - Product/service information
 * - Key talking points
 * - Target audience description
 * - Success criteria
 * - Common objections and responses
 * - Qualification questions
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Valid campaign types (must match shared/campaign-types.ts)
export type CampaignType =
  | 'appointment_setting'
  | 'content_syndication'
  | 'lead_qualification'
  | 'sql'
  | 'bant_leads'
  | 'data_validation'
  | 'high_quality_leads'
  | 'webinar_invite'
  | 'live_webinar'
  | 'on_demand_webinar'
  | 'executive_dinner';

// Structured campaign output type
export interface IngestedCampaign {
  campaignName: string;
  campaignType: CampaignType; // AI-inferred campaign type
  campaignObjective: string;
  campaignContextBrief: string; // Brief summary for AI agent context
  productServiceInfo: string;
  talkingPoints: string[];
  targetAudienceDescription: string;
  successCriteria: string;
  campaignObjections: Array<{
    objection: string;
    response: string;
  }>;
  qualificationQuestions: Array<{
    question: string;
    type: 'text' | 'number' | 'boolean' | 'select';
    required: boolean;
    options?: string[];
  }>;
  callFlow: {
    openingApproach: string;
    valueProposition: string;
    closingStrategy: string;
    voicemailScript?: string;
  };
  complianceNotes: string[];
  estimatedCallDuration: number; // seconds
  confidenceScore: number; // 0-100 how confident the AI is in the extraction
  suggestedImprovements: string[];
}

export interface IngestionRequest {
  rawContent: string;
  contentType?: 'text' | 'document' | 'brief';
  industry?: string;
  hints?: {
    companyName?: string;
    productName?: string;
    targetRole?: string;
  };
}

export interface IngestionResult {
  success: boolean;
  campaign?: IngestedCampaign;
  error?: string;
  processingTimeMs: number;
  tokensUsed?: number;
}

const INGESTION_SYSTEM_PROMPT = `You are an expert telemarketing campaign strategist. Your task is to analyze raw campaign information and extract/generate a structured campaign configuration optimized for AI-powered voice agents.

ANALYSIS APPROACH:
1. Extract explicit information directly stated in the input
2. Infer missing details based on context, industry best practices, and the product/service described
3. Generate professional-grade content for any gaps
4. Ensure all outputs are conversational and suitable for voice delivery

OUTPUT REQUIREMENTS:
- All text must be natural, conversational language (not marketing copy)
- Talking points should be concise (under 20 words each)
- Objection responses should be empathetic and solution-focused
- Qualification questions should be simple yes/no or short-answer format
- Call flow should follow BANT methodology when applicable

QUALITY STANDARDS:
- Professional but warm tone
- Focus on value and outcomes, not features
- Avoid jargon unless industry-specific and appropriate
- Include compliance awareness (TCPA, DNC, consent requirements)

Return ONLY valid JSON matching the exact schema specified.`;

const INGESTION_PROMPT_TEMPLATE = `Analyze the following campaign information and generate a complete, structured campaign configuration.

RAW CAMPAIGN CONTENT:
"""
{content}
"""

{hints_section}

CAMPAIGN TYPE SELECTION:
Based on the content, determine the most appropriate campaign type from these options:
- "appointment_setting" - Goal is to book meetings/demos with qualified prospects
- "content_syndication" - Goal is to get consent to receive content and validate interest
- "lead_qualification" - Goal is discovery and gathering qualifying information
- "sql" - Sales Qualified Lead - identifying sales-ready prospects with BANT
- "bant_leads" - Specifically qualifying on Budget, Authority, Need, Timeline
- "data_validation" - Verifying and updating contact information
- "high_quality_leads" - Identifying highly qualified prospects
- "webinar_invite" - Driving webinar registrations
- "live_webinar" - Driving live webinar attendance
- "on_demand_webinar" - Driving on-demand content consumption
- "executive_dinner" - Securing attendance from senior executives

Generate a complete campaign configuration as JSON with this exact structure:
{
  "campaignName": "Short descriptive name for the campaign",
  "campaignType": "appointment_setting|content_syndication|lead_qualification|sql|bant_leads|data_validation|high_quality_leads|webinar_invite|live_webinar|on_demand_webinar|executive_dinner",
  "campaignObjective": "The primary goal of each call (1-2 sentences)",
  "campaignContextBrief": "A 3-5 sentence brief that gives the AI voice agent all the context it needs to have intelligent conversations. Include: who we are, what we offer, why it matters to the prospect, and what outcome we want. This is the AI agent's 'cheat sheet' for the call.",
  "productServiceInfo": "Clear description of product/service and its value proposition with SPECIFIC METRICS (e.g., 'reduces time by 40%', 'saves $50K annually'). Include 2-4 sentences.",
  "talkingPoints": ["Point 1 with specific metric/proof point", "Point 2 with specific metric/proof point", "Point 3 with specific metric/proof point", "Point 4", "Point 5"],
  "targetAudienceDescription": "Who we're calling and why they'd care (1-2 sentences)",
  "successCriteria": "What counts as a successful call outcome - be specific about what signals indicate qualification",
  "campaignObjections": [
    {"objection": "Common objection 1", "response": "How to address it with empathy and value"},
    {"objection": "Common objection 2", "response": "How to address it with empathy and value"},
    {"objection": "Common objection 3", "response": "How to address it with empathy and value"}
  ],
  "qualificationQuestions": [
    {"question": "Question text", "type": "text|number|boolean|select", "required": true, "options": ["if select type"]}
  ],
  "callFlow": {
    "openingApproach": "How to open the call after confirmation",
    "valueProposition": "Core value statement with at least ONE specific metric (15 seconds or less)",
    "closingStrategy": "How to close for the desired outcome",
    "voicemailScript": "30-second voicemail message if no answer"
  },
  "complianceNotes": ["Any compliance considerations for this campaign"],
  "estimatedCallDuration": 180,
  "confidenceScore": 85,
  "suggestedImprovements": ["Recommendations to improve campaign effectiveness"]
}

IMPORTANT REQUIREMENTS:
1. campaignType MUST be one of the exact values listed above
2. campaignContextBrief should be conversational and give the AI agent everything it needs to sound knowledgeable
3. talkingPoints should include SPECIFIC metrics, not vague claims (e.g., "Reduces hiring time by 40%" not "Speeds up hiring")
4. successCriteria should be specific enough that the AI can determine when to mark a lead as qualified

Return ONLY the JSON object, no additional text.`;

export class CampaignIngestionService {
  private genai: GoogleGenerativeAI | null = null;

  constructor() {
    if (GEMINI_API_KEY) {
      this.genai = new GoogleGenerativeAI(GEMINI_API_KEY);
    }
  }

  /**
   * Ingest raw campaign content and return structured campaign configuration
   */
  async ingestCampaign(request: IngestionRequest): Promise<IngestionResult> {
    const startTime = Date.now();

    if (!this.genai) {
      return {
        success: false,
        error: "Gemini API key not configured",
        processingTimeMs: Date.now() - startTime
      };
    }

    if (!request.rawContent || request.rawContent.trim().length < 50) {
      return {
        success: false,
        error: "Campaign content too short. Please provide at least 50 characters describing the campaign.",
        processingTimeMs: Date.now() - startTime
      };
    }

    try {
      // Build hints section if provided
      let hintsSection = "";
      if (request.hints) {
        const hints: string[] = [];
        if (request.hints.companyName) hints.push(`Company: ${request.hints.companyName}`);
        if (request.hints.productName) hints.push(`Product/Service: ${request.hints.productName}`);
        if (request.hints.targetRole) hints.push(`Target Role: ${request.hints.targetRole}`);
        if (request.industry) hints.push(`Industry: ${request.industry}`);
        
        if (hints.length > 0) {
          hintsSection = `\nADDITIONAL CONTEXT:\n${hints.join("\n")}`;
        }
      }

      // Build the full prompt
      const prompt = INGESTION_PROMPT_TEMPLATE
        .replace("{content}", request.rawContent)
        .replace("{hints_section}", hintsSection);

      // Call Gemini
      const model = this.genai.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
          responseMimeType: "application/json"
        }
      });

      const result = await model.generateContent({
        contents: [
          { role: "user", parts: [{ text: INGESTION_SYSTEM_PROMPT }] },
          { role: "model", parts: [{ text: "I understand. I'll analyze campaign content and generate structured configurations optimized for AI voice agents. I'll return only valid JSON matching the specified schema." }] },
          { role: "user", parts: [{ text: prompt }] }
        ]
      });

      const responseText = result.response.text();
      
      // Parse the JSON response
      let campaign: IngestedCampaign;
      try {
        // Clean the response (remove markdown code blocks if present)
        let cleanJson = responseText.trim();
        if (cleanJson.startsWith("```json")) {
          cleanJson = cleanJson.slice(7);
        }
        if (cleanJson.startsWith("```")) {
          cleanJson = cleanJson.slice(3);
        }
        if (cleanJson.endsWith("```")) {
          cleanJson = cleanJson.slice(0, -3);
        }
        
        campaign = JSON.parse(cleanJson.trim());
      } catch (parseError) {
        console.error("[CampaignIngestion] JSON parse error:", parseError, "Response:", responseText);
        return {
          success: false,
          error: "Failed to parse AI response. Please try again.",
          processingTimeMs: Date.now() - startTime
        };
      }

      // Validate and normalize the campaign structure
      campaign = this.validateAndNormalize(campaign);

      return {
        success: true,
        campaign,
        processingTimeMs: Date.now() - startTime,
        tokensUsed: result.response.usageMetadata?.totalTokenCount
      };

    } catch (error: any) {
      console.error("[CampaignIngestion] Error:", error);
      return {
        success: false,
        error: error.message || "Failed to process campaign content",
        processingTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * Validate and normalize the ingested campaign structure
   */
  private validateAndNormalize(campaign: any): IngestedCampaign {
    // Valid campaign types
    const validCampaignTypes: CampaignType[] = [
      'appointment_setting',
      'content_syndication',
      'lead_qualification',
      'sql',
      'bant_leads',
      'data_validation',
      'high_quality_leads',
      'webinar_invite',
      'live_webinar',
      'on_demand_webinar',
      'executive_dinner'
    ];

    // Infer campaign type if not provided or invalid
    let campaignType: CampaignType = 'appointment_setting'; // default
    if (campaign.campaignType && validCampaignTypes.includes(campaign.campaignType)) {
      campaignType = campaign.campaignType;
    } else if (campaign.campaignObjective) {
      // Try to infer from objective
      const objective = campaign.campaignObjective.toLowerCase();
      if (objective.includes('webinar') || objective.includes('registration')) {
        campaignType = 'webinar_invite';
      } else if (objective.includes('demo') || objective.includes('meeting') || objective.includes('appointment')) {
        campaignType = 'appointment_setting';
      } else if (objective.includes('qualify') || objective.includes('qualification') || objective.includes('bant')) {
        campaignType = 'lead_qualification';
      } else if (objective.includes('content') || objective.includes('download') || objective.includes('whitepaper')) {
        campaignType = 'content_syndication';
      } else if (objective.includes('data') || objective.includes('verify') || objective.includes('validate')) {
        campaignType = 'data_validation';
      } else if (objective.includes('dinner') || objective.includes('executive') || objective.includes('event')) {
        campaignType = 'executive_dinner';
      }
    }

    return {
      campaignName: campaign.campaignName || "Untitled Campaign",
      campaignType,
      campaignObjective: campaign.campaignObjective || "",
      campaignContextBrief: campaign.campaignContextBrief || "",
      productServiceInfo: campaign.productServiceInfo || "",
      talkingPoints: Array.isArray(campaign.talkingPoints)
        ? campaign.talkingPoints.slice(0, 10)
        : [],
      targetAudienceDescription: campaign.targetAudienceDescription || "",
      successCriteria: campaign.successCriteria || "Positive conversation outcome",
      campaignObjections: Array.isArray(campaign.campaignObjections)
        ? campaign.campaignObjections.map((obj: any) => ({
            objection: obj.objection || "",
            response: obj.response || ""
          })).filter((obj: any) => obj.objection && obj.response)
        : [],
      qualificationQuestions: Array.isArray(campaign.qualificationQuestions)
        ? campaign.qualificationQuestions.map((q: any) => ({
            question: q.question || "",
            type: ['text', 'number', 'boolean', 'select'].includes(q.type) ? q.type : 'text',
            required: Boolean(q.required),
            options: Array.isArray(q.options) ? q.options : undefined
          })).filter((q: any) => q.question)
        : [],
      callFlow: {
        openingApproach: campaign.callFlow?.openingApproach || "",
        valueProposition: campaign.callFlow?.valueProposition || "",
        closingStrategy: campaign.callFlow?.closingStrategy || "",
        voicemailScript: campaign.callFlow?.voicemailScript
      },
      complianceNotes: Array.isArray(campaign.complianceNotes)
        ? campaign.complianceNotes
        : [],
      estimatedCallDuration: typeof campaign.estimatedCallDuration === 'number'
        ? Math.min(Math.max(campaign.estimatedCallDuration, 60), 600)
        : 180,
      confidenceScore: typeof campaign.confidenceScore === 'number'
        ? Math.min(Math.max(campaign.confidenceScore, 0), 100)
        : 75,
      suggestedImprovements: Array.isArray(campaign.suggestedImprovements)
        ? campaign.suggestedImprovements
        : []
    };
  }

  /**
   * Refine an ingested campaign with additional context or corrections
   */
  async refineCampaign(
    existingCampaign: IngestedCampaign,
    refinementInstructions: string
  ): Promise<IngestionResult> {
    const startTime = Date.now();

    if (!this.genai) {
      return {
        success: false,
        error: "Gemini API key not configured",
        processingTimeMs: Date.now() - startTime
      };
    }

    try {
      const prompt = `You previously generated this campaign configuration:

${JSON.stringify(existingCampaign, null, 2)}

The user wants the following refinements:
"""
${refinementInstructions}
"""

Apply these refinements and return the updated campaign configuration as JSON with the same structure.
Return ONLY the JSON object, no additional text.`;

      const model = this.genai.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 4096,
          responseMimeType: "application/json"
        }
      });

      const result = await model.generateContent({
        contents: [
          { role: "user", parts: [{ text: INGESTION_SYSTEM_PROMPT }] },
          { role: "model", parts: [{ text: "I understand. I'll refine the campaign based on the instructions." }] },
          { role: "user", parts: [{ text: prompt }] }
        ]
      });

      const responseText = result.response.text();
      let cleanJson = responseText.trim();
      if (cleanJson.startsWith("```json")) cleanJson = cleanJson.slice(7);
      if (cleanJson.startsWith("```")) cleanJson = cleanJson.slice(3);
      if (cleanJson.endsWith("```")) cleanJson = cleanJson.slice(0, -3);
      
      const campaign = this.validateAndNormalize(JSON.parse(cleanJson.trim()));

      return {
        success: true,
        campaign,
        processingTimeMs: Date.now() - startTime,
        tokensUsed: result.response.usageMetadata?.totalTokenCount
      };

    } catch (error: any) {
      console.error("[CampaignIngestion] Refinement error:", error);
      return {
        success: false,
        error: error.message || "Failed to refine campaign",
        processingTimeMs: Date.now() - startTime
      };
    }
  }
}

// Singleton instance
export const campaignIngestionService = new CampaignIngestionService();
