/**
 * Intelligent Campaign Context Service
 * 
 * AI-powered service for generating, validating, and managing
 * structured campaign contexts with multi-modal input support.
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import type {
  StructuredCampaignContext,
  CampaignCreationSession,
  CampaignCreationInteraction,
  ContextGenerationRequest,
  ContextGenerationResponse,
  RoleExpansionRequest,
  RoleExpansionResponse,
  CampaignValidationRequirements,
  ValidationError,
  ValidationWarning,
  ContentSource,
} from '../../shared/campaign-context-types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ============================================================
// SESSION MANAGEMENT
// ============================================================

const activeSessions = new Map();

export function createSession(userId: string): CampaignCreationSession {
  const session: CampaignCreationSession = {
    sessionId: crypto.randomUUID(),
    userId,
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    inputMode: 'text',
    interactions: [],
    partialContext: {
      version: '1.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
      validationRequirements: {
        abmRequired: false,
        abmAccountListProvided: false,
        suppressionRequired: false,
        suppressionListProvided: false,
        allSectionsApproved: false,
        validationErrors: [],
        validationWarnings: [],
        canActivate: false,
      },
    },
    extractedIntent: {
      confidence: 0,
    },
    missingRequirements: [],
    recommendations: [],
  };
  
  activeSessions.set(session.sessionId, session);
  return session;
}

export function getSession(sessionId: string): CampaignCreationSession | undefined {
  return activeSessions.get(sessionId);
}

export function updateSession(sessionId: string, updates: Partial): CampaignCreationSession | undefined {
  const session = activeSessions.get(sessionId);
  if (!session) return undefined;
  
  const updated = {
    ...session,
    ...updates,
    lastActivityAt: new Date().toISOString(),
  };
  activeSessions.set(sessionId, updated);
  return updated;
}

// ============================================================
// CONTEXT GENERATION
// ============================================================

const CONTEXT_GENERATION_PROMPT = `You are an expert B2B campaign strategist. Analyze the user's inputs and generate a structured campaign context.

Given the following user inputs about their campaign, extract and generate:

1. Campaign Objectives
   - Primary goal (what they want to achieve)
   - Secondary goals (additional objectives)
   - Desired outcomes (specific results expected)
   - KPIs (measurable success metrics)

2. Target Audience
   - Industries they want to target
   - Geographic regions
   - Company size range (if mentioned)
   - Job titles/roles (explicit and implied)
   - Seniority levels
   - Job functions

3. Deliverables
   - What product/service/information is being promoted
   - Value proposition
   - Key features and differentiators

4. Assets
   - Any content assets mentioned (whitepapers, case studies, demos, offers)
   - Whether content is gated

5. Core Message
   - The main message/pitch for the campaign

6. Talking Points
   - Key points agents should emphasize

7. Conversation Flow
   - Opening approach
   - Discovery questions to ask
   - Value presentation points
   - Common objections and responses
   - Closing/call to action
   - Next steps

8. Success Indicators
   - What constitutes a qualified lead
   - Meeting criteria
   - Required decision-maker attributes

9. Qualification/Disqualification Criteria
   - Conditions that qualify a lead
   - Conditions that disqualify a lead

Also detect:
- Is this an ABM (Account-Based Marketing) campaign? (Look for mentions of specific accounts, target account lists, named companies)
- Are suppressions/exclusions mentioned? (Look for mentions of exclusion lists, companies to avoid, do-not-call lists)

Respond with valid JSON only.`;

export async function generateCampaignContext(
  request: ContextGenerationRequest
): Promise {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
  });

  const userContent = [
    ...request.userInputs,
    ...(request.voiceTranscripts || []).map(t => `[Voice Input]: ${t}`),
  ].join('\n\n');

  const prompt = `${CONTEXT_GENERATION_PROMPT}

User Inputs:
${userContent}

${request.existingContext ? `Existing Context (update/enhance this):
${JSON.stringify(request.existingContext, null, 2)}` : ''}

Generate a complete structured campaign context with all sections populated where possible.
For each section, include:
- The actual content
- A confidence score (0-1)
- What's missing or unclear

Response Schema:
{
  "objectives": {
    "primaryGoal": "string",
    "secondaryGoals": ["string"],
    "desiredOutcomes": ["string"],
    "kpis": ["string"],
    "confidence": 0.0-1.0
  },
  "targetAudience": {
    "industries": ["string"],
    "regions": ["string"],
    "companySizeMin": number | null,
    "companySizeMax": number | null,
    "jobTitles": ["string"],
    "jobFunctions": ["string"],
    "seniorityLevels": ["entry" | "mid" | "senior" | "director" | "vp" | "c_level"],
    "confidence": 0.0-1.0
  },
  "deliverables": [{
    "type": "product" | "service" | "information" | "meeting" | "demo" | "other",
    "name": "string",
    "description": "string",
    "valueProposition": "string",
    "keyFeatures": ["string"],
    "differentiators": ["string"]
  }],
  "assets": [{
    "type": "whitepaper" | "case_study" | "ebook" | "video" | "webinar" | "offer" | "demo" | "trial" | "other",
    "name": "string",
    "description": "string",
    "gatedContent": boolean
  }],
  "coreMessage": "string",
  "talkingPoints": ["string"],
  "conversationFlow": {
    "opening": { "approach": "string", "script": "string" },
    "discovery": { "questions": ["string"], "listenFor": ["string"] },
    "valuePresentation": { "keyMessages": ["string"], "proofPoints": ["string"] },
    "objectionHandling": [{ "objection": "string", "response": "string", "category": "string" }],
    "closing": { "callToAction": "string", "nextSteps": ["string"] },
    "voicemail": { "enabled": boolean, "script": "string" },
    "gatekeeper": { "approach": "string", "responses": [{ "scenario": "string", "response": "string" }] }
  },
  "successIndicators": {
    "primarySuccess": "string",
    "secondarySuccess": ["string"],
    "qualifiedLeadDefinition": "string",
    "meetingCriteria": {
      "minimumSeniority": "string",
      "requiredAuthority": ["string"],
      "timeframeRequirement": "string"
    }
  },
  "qualificationCriteria": {
    "qualifyingConditions": [{ "field": "string", "operator": "string", "value": "any", "weight": number, "required": boolean }],
    "disqualifyingConditions": [{ "field": "string", "operator": "string", "value": "any", "reason": "string" }],
    "customRules": "string"
  },
  "detectedIntent": {
    "campaignType": "string",
    "isABM": boolean,
    "needsSuppression": boolean,
    "confidence": 0.0-1.0
  },
  "missingRequirements": [{
    "section": "string",
    "field": "string",
    "question": "string",
    "priority": "required" | "recommended" | "optional"
  }],
  "recommendations": [{
    "section": "string",
    "field": "string",
    "suggestion": "string",
    "reason": "string"
  }]
}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    const parsed = JSON.parse(text);

    // Build the structured context
    const contentSource = (confidence: number): ContentSource => ({
      type: 'ai_generated',
      generatedAt: new Date().toISOString(),
      confidence,
    });

    const generatedContext: Partial = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
    };

    // Map parsed response to structured context
    if (parsed.objectives) {
      (generatedContext as any).objectives = {
        ...parsed.objectives,
        _source: contentSource(parsed.objectives.confidence || 0.7),
        _approved: false,
      };
    }

    if (parsed.targetAudience) {
      (generatedContext as any).targetAudience = {
        ...parsed.targetAudience,
        _source: contentSource(parsed.targetAudience.confidence || 0.7),
        _approved: false,
      };
    }

    if (parsed.deliverables) {
      (generatedContext as any).deliverables = parsed.deliverables;
      (generatedContext as any).deliverables._source = contentSource(0.7);
      (generatedContext as any).deliverables._approved = false;
    }

    if (parsed.assets) {
      (generatedContext as any).assets = parsed.assets;
      (generatedContext as any).assets._source = contentSource(0.7);
      (generatedContext as any).assets._approved = false;
    }

    if (parsed.coreMessage) {
      (generatedContext as any).coreMessage = parsed.coreMessage;
    }

    if (parsed.talkingPoints) {
      (generatedContext as any).talkingPoints = parsed.talkingPoints;
    }

    if (parsed.conversationFlow) {
      (generatedContext as any).conversationFlow = {
        ...parsed.conversationFlow,
        _source: contentSource(0.7),
        _approved: false,
      };
    }

    if (parsed.successIndicators) {
      (generatedContext as any).successIndicators = {
        ...parsed.successIndicators,
        _source: contentSource(0.7),
        _approved: false,
      };
    }

    if (parsed.qualificationCriteria) {
      (generatedContext as any).qualificationCriteria = {
        ...parsed.qualificationCriteria,
        _source: contentSource(0.7),
        _approved: false,
      };
    }

    // ABM and Suppression detection
    if (parsed.detectedIntent?.isABM) {
      generatedContext.abmConfig = {
        enabled: true,
      };
    }

    if (parsed.detectedIntent?.needsSuppression) {
      generatedContext.suppressionConfig = {
        enabled: true,
        lists: [],
      };
    }

    // Validate the generated context
    const validationResult = validateCampaignContext(generatedContext);
    generatedContext.validationRequirements = validationResult;

    return {
      generatedContext,
      extractedIntent: {
        campaignType: parsed.detectedIntent?.campaignType || 'outbound_calling',
        primaryGoal: parsed.objectives?.primaryGoal || '',
        detectedABM: parsed.detectedIntent?.isABM || false,
        detectedSuppression: parsed.detectedIntent?.needsSuppression || false,
        confidence: parsed.detectedIntent?.confidence || 0.7,
      },
      missingRequirements: parsed.missingRequirements || [],
      recommendations: parsed.recommendations || [],
      validationResult,
    };
  } catch (error) {
    console.error('[CampaignContextService] Generation error:', error);
    throw error;
  }
}

// ============================================================
// ROLE EXPANSION
// ============================================================

const ROLE_EXPANSION_PROMPT = `You are an expert B2B targeting strategist. Given the specified job roles and campaign context, recommend additional relevant roles that should be targeted.

Consider:
1. Equivalent titles (same role, different naming conventions)
2. Adjacent roles (related responsibilities, often involved in decisions)
3. Seniority variations (senior/junior versions of the role)
4. Functional variations (same function, different focus areas)
5. Buying committee members (who influences/approves purchases in this area)

For each recommendation, provide:
- The role title
- Relevance score (0-1)
- Why this role is relevant
- Their likely buying responsibility
- What organizational pain they experience that the solution addresses

Respond with valid JSON only.`;

export async function expandRoles(request: RoleExpansionRequest): Promise {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.4,
    },
  });

  const prompt = `${ROLE_EXPANSION_PROMPT}

Campaign Context:
- Industries: ${request.industries.join(', ')}
- Company Size: ${request.companySize ? `${request.companySize.min}-${request.companySize.max} employees` : 'Not specified'}
- Primary Goals: ${(request.campaignContext?.objectives as any)?.primaryGoal || 'Not specified'}
- Product/Service: ${JSON.stringify(request.campaignContext?.deliverables || [])}

Specified Roles to Expand:
${request.specifiedRoles.map(r => `- ${r}`).join('\n')}

Response Schema:
{
  "expandedRoles": [
    {
      "originalRole": "string",
      "suggestions": [
        {
          "title": "string",
          "relevanceScore": 0.0-1.0,
          "reason": "string",
          "buyingResponsibility": "string",
          "organizationalPain": "string"
        }
      ]
    }
  ]
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);

    return {
      originalRoles: request.specifiedRoles,
      expandedRoles: parsed.expandedRoles || [],
      totalSuggestions: parsed.expandedRoles?.reduce(
        (acc: number, r: any) => acc + (r.suggestions?.length || 0),
        0
      ) || 0,
    };
  } catch (error) {
    console.error('[CampaignContextService] Role expansion error:', error);
    throw error;
  }
}

// ============================================================
// VALIDATION
// ============================================================

export function validateCampaignContext(
  context: Partial
): CampaignValidationRequirements {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check if ABM is enabled but no account list provided
  const abmRequired = context.abmConfig?.enabled || false;
  const abmAccountListProvided = !!(context.abmConfig?.accountListId);
  
  if (abmRequired && !abmAccountListProvided) {
    errors.push({
      section: 'abmConfig',
      field: 'accountListId',
      message: 'ABM campaign requires a target account list to be uploaded',
      severity: 'error',
      code: 'ABM_LIST_REQUIRED',
    });
  }

  // Check if suppression is mentioned but no list provided
  const suppressionRequired = context.suppressionConfig?.enabled || false;
  const suppressionListProvided = (context.suppressionConfig?.lists?.length || 0) > 0;
  
  if (suppressionRequired && !suppressionListProvided) {
    errors.push({
      section: 'suppressionConfig',
      field: 'lists',
      message: 'Suppression/exclusion was mentioned but no suppression list has been uploaded',
      severity: 'error',
      code: 'SUPPRESSION_LIST_REQUIRED',
    });
  }

  // Check required sections
  const requiredSections = [
    { key: 'objectives', label: 'Campaign Objectives' },
    { key: 'targetAudience', label: 'Target Audience' },
    { key: 'coreMessage', label: 'Core Message' },
    { key: 'successIndicators', label: 'Success Indicators' },
    { key: 'qualificationCriteria', label: 'Qualification Criteria' },
  ];

  for (const section of requiredSections) {
    const value = (context as any)[section.key];
    if (!value || (typeof value === 'object' && Object.keys(value).length === 0)) {
      errors.push({
        section: section.key,
        field: section.key,
        message: `${section.label} is required`,
        severity: 'error',
        code: `${section.key.toUpperCase()}_REQUIRED`,
      });
    }
  }

  // Check if objectives has primary goal
  if (!(context as any).objectives?.primaryGoal) {
    errors.push({
      section: 'objectives',
      field: 'primaryGoal',
      message: 'Primary campaign goal is required',
      severity: 'error',
      code: 'PRIMARY_GOAL_REQUIRED',
    });
  }

  // Check if target audience has at least one industry or role
  const audience = (context as any).targetAudience;
  if (audience && (!audience.industries?.length && !audience.jobTitles?.length)) {
    errors.push({
      section: 'targetAudience',
      field: 'industries',
      message: 'At least one target industry or job title is required',
      severity: 'error',
      code: 'AUDIENCE_REQUIRED',
    });
  }

  // Check section approvals
  const sectionsToApprove = [
    'objectives',
    'targetAudience',
    'deliverables',
    'coreMessage',
    'conversationFlow',
    'successIndicators',
    'qualificationCriteria',
  ];

  let allApproved = true;
  for (const sectionKey of sectionsToApprove) {
    const section = (context as any)[sectionKey];
    if (section && !section._approved) {
      allApproved = false;
      warnings.push({
        section: sectionKey,
        field: '_approved',
        message: `${sectionKey} section has not been approved`,
        severity: 'warning',
        suggestion: 'Review and approve this section before activating the campaign',
      });
    }
  }

  // Warnings for optional but recommended sections
  if (!(context as any).conversationFlow?.objectionHandling?.length) {
    warnings.push({
      section: 'conversationFlow',
      field: 'objectionHandling',
      message: 'No objection handling scripts defined',
      severity: 'warning',
      suggestion: 'Add common objections and responses to improve agent effectiveness',
    });
  }

  if (!(context as any).talkingPoints?.length) {
    warnings.push({
      section: 'talkingPoints',
      field: 'talkingPoints',
      message: 'No talking points defined',
      severity: 'warning',
      suggestion: 'Add key talking points to guide agent conversations',
    });
  }

  const canActivate = errors.length === 0 && allApproved;

  return {
    abmRequired,
    abmAccountListProvided,
    suppressionRequired,
    suppressionListProvided,
    allSectionsApproved: allApproved,
    validationErrors: errors,
    validationWarnings: warnings,
    canActivate,
  };
}

// ============================================================
// CONVERSATIONAL GUIDANCE
// ============================================================

const GUIDANCE_PROMPT = `You are a helpful campaign setup assistant. The user is creating a B2B outreach campaign.

Based on the current campaign context and the user's latest input, provide:
1. Acknowledgment of what they said
2. What information was extracted from their input
3. What's still missing or needs clarification
4. A follow-up question to gather the next piece of information

Be conversational, professional, and focused on gathering complete campaign requirements.

Current Campaign Context:
{context}

User's Latest Input:
{input}

Respond with a helpful, conversational message (not JSON). Keep it concise.`;

export async function getConversationalGuidance(
  session: CampaignCreationSession,
  userInput: string
): Promise;
  updatedContext: Partial;
  nextQuestion?: string;
}> {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.7,
    },
  });

  // First, extract data from the input
  const extraction = await generateCampaignContext({
    userInputs: [userInput],
    existingContext: session.partialContext,
  });

  // Generate conversational response
  const guidancePrompt = GUIDANCE_PROMPT
    .replace('{context}', JSON.stringify(session.partialContext, null, 2))
    .replace('{input}', userInput);

  const result = await model.generateContent(guidancePrompt);
  const response = result.response.text();

  // Merge extracted data into session context
  const updatedContext = {
    ...session.partialContext,
    ...extraction.generatedContext,
    updatedAt: new Date().toISOString(),
  };

  return {
    response,
    extractedData: extraction.extractedIntent,
    updatedContext,
    nextQuestion: extraction.missingRequirements[0]?.question,
  };
}

// ============================================================
// EXPORTS
// ============================================================

export const campaignContextService = {
  createSession,
  getSession,
  updateSession,
  generateCampaignContext,
  expandRoles,
  validateCampaignContext,
  getConversationalGuidance,
};