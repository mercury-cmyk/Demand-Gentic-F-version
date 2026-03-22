/**
 * Channel Variant Generator Service
 *
 * Generates channel-specific variants (CallFlowConfig for voice, EmailSequenceFlow for email)
 * from a shared campaign context. This ensures consistent messaging across all channels
 * while adapting to the specific requirements of each channel.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db';
import {
  campaigns,
  campaignChannelVariants,
  users,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { StructuredCampaignContext } from '@shared/campaign-context-types';
import type { CallFlowConfig, CallFlowStep, CampaignType } from '../../client/src/lib/campaign-types';
import type {
  ChannelType,
  EmailSequenceFlow,
  EmailSequenceStep,
  CampaignChannelVariant,
  ChannelSettings,
  GenerateVariantResponse,
} from '@shared/multi-channel-types';
import { UNIFIED_CAMPAIGN_TYPES, getCampaignType, getDefaultCallFlow } from '../../client/src/lib/campaign-types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ============================================================
// VOICE VARIANT GENERATION
// ============================================================

const VOICE_FLOW_GENERATION_PROMPT = `You are an expert B2B telemarketing strategist. Generate a call flow state machine configuration for an AI voice agent based on the campaign context provided.

The call flow should follow this structure:
- Each step has: id, name, description, entryConditions, allowedUtterances, exitConditions, objectionHandling, nextSteps, required, maxDuration
- Steps should flow logically from initial contact to closing
- Include proper objection handling with specific responses
- Adapt the messaging to the campaign's strategic intent and target audience

Standard flow structure:
1. gatekeeper_handling (optional) - Navigate past gatekeepers
2. identity_confirmation (required) - Verify correct contact
3. greeting_introduction (required) - Professional intro, set context
4. value_introduction (required) - Present the offer/value
5. interest_confirmation (required) - Gauge interest
6. email_confirmation (if applicable) - Verify email for follow-up
7. consent_confirmation (if applicable) - Explicit consent for materials
8. call_closing (required) - Professional close

Customize the allowedUtterances and objectionHandling based on:
- Campaign objective
- Target audience description
- Product/service information
- Key talking points
- Common objections

Respond with a valid JSON object matching the CallFlowConfig structure.`;

const VOICE_PROMPT_GENERATION_TEMPLATE = `You are an expert AI voice agent prompt engineer. Generate an execution-ready system prompt for the voice agent based on the campaign context and call flow.

The prompt should include:
1. Agent identity and persona
2. Campaign objective (internal, not to be shared with prospect)
3. Key talking points to emphasize
4. Objection handling guidelines
5. Success criteria and qualification rules
6. Compliance requirements
7. Tone and personality guidance

Make the prompt comprehensive but focused. The agent should sound natural and conversational while following the campaign strategy.`;

interface VoiceVariantGenerationResult {
  callFlow: CallFlowConfig;
  executionPrompt: string;
  channelSettings: ChannelSettings;
}

export async function generateVoiceVariant(
  campaignId: string,
  context: StructuredCampaignContext,
  campaignType?: string
): Promise {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.4,
    },
  });

  // Get campaign type info for voice personality
  const typeInfo = campaignType ? getCampaignType(campaignType) : null;

  // Build context string for generation
  const contextString = buildContextString(context, typeInfo);

  // Generate call flow
  const flowPrompt = `${VOICE_FLOW_GENERATION_PROMPT}

CAMPAIGN CONTEXT:
${contextString}

${typeInfo ? `CAMPAIGN TYPE: ${typeInfo.label}
VOICE PERSONALITY: ${typeInfo.voicePersonality.join(', ')}
STRATEGIC INTENT: ${typeInfo.strategicIntent}` : ''}

Generate a CallFlowConfig JSON object with the following structure:
{
  "version": "1.0",
  "steps": [...],
  "defaultBehavior": "continue_to_next",
  "strictOrder": true,
  "complianceNotes": "..."
}`;

  const flowResult = await model.generateContent(flowPrompt);
  const flowText = flowResult.response.text();
  let callFlow: CallFlowConfig;

  try {
    callFlow = JSON.parse(flowText);
    // Validate and ensure required fields
    callFlow.version = '1.0';
    if (!callFlow.steps || callFlow.steps.length === 0) {
      // Fall back to default flow if generation failed
      callFlow = getDefaultCallFlow();
    }
  } catch {
    // Fall back to default flow
    callFlow = getDefaultCallFlow();
    // Customize with campaign-specific content
    callFlow = customizeDefaultFlow(callFlow, context);
  }

  // Generate execution prompt
  const promptGenerationRequest = `${VOICE_PROMPT_GENERATION_TEMPLATE}

CAMPAIGN CONTEXT:
${contextString}

CALL FLOW STEPS:
${JSON.stringify(callFlow.steps.map(s => ({ id: s.id, name: s.name, description: s.description })), null, 2)}

Generate a comprehensive system prompt for the AI voice agent. Return as plain text, not JSON.`;

  const promptModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.3,
    },
  });

  const promptResult = await promptModel.generateContent(promptGenerationRequest);
  const executionPrompt = promptResult.response.text();

  // Default channel settings for voice
  const channelSettings: ChannelSettings = {
    voiceProvider: 'google',
    voice: 'Fenrir', // Default Gemini voice
    persona: {
      name: context.deliverables?.[0]?.name ? `${context.deliverables[0].name} Representative` : 'Sales Representative',
      companyName: 'Your Company', // Would be replaced with actual org name
      role: 'Business Development',
    },
    maxCallDurationSeconds: 240,
    amdEnabled: true,
    voicemailEnabled: true,
  };

  return {
    callFlow,
    executionPrompt,
    channelSettings,
  };
}

function customizeDefaultFlow(flow: CallFlowConfig, context: StructuredCampaignContext): CallFlowConfig {
  // Customize the default flow with campaign-specific content
  const customized = { ...flow };

  // Update opening messages with campaign context
  const openingStep = customized.steps.find(s => s.id === 'greeting_introduction');
  if (openingStep && context.conversationFlow?.opening?.script) {
    openingStep.allowedUtterances = [
      context.conversationFlow.opening.script,
      ...openingStep.allowedUtterances,
    ];
  }

  // Update value intro with deliverables
  const valueStep = customized.steps.find(s => s.id === 'value_introduction');
  if (valueStep && context.deliverables?.[0]) {
    const deliverable = context.deliverables[0];
    valueStep.allowedUtterances = [
      `We've put together a ${deliverable.name} that covers ${deliverable.description || 'key topics relevant to your role'}.`,
      `Given your role, I thought you might find our ${deliverable.name} valuable because ${deliverable.valueProposition || 'it addresses challenges in your space'}.`,
      ...valueStep.allowedUtterances,
    ];
  }

  // Add campaign-specific objection handling
  if (context.conversationFlow?.objectionHandling) {
    for (const objection of context.conversationFlow.objectionHandling) {
      // Add to relevant steps
      const relevantSteps = ['value_introduction', 'interest_confirmation'];
      for (const stepId of relevantSteps) {
        const step = customized.steps.find(s => s.id === stepId);
        if (step) {
          step.objectionHandling.push({
            objection: objection.objection,
            response: objection.response,
          });
        }
      }
    }
  }

  return customized;
}

// ============================================================
// EMAIL VARIANT GENERATION
// ============================================================

const EMAIL_SEQUENCE_GENERATION_PROMPT = `You are an expert B2B email marketing strategist. Generate an email sequence flow configuration based on the campaign context provided.

The email sequence should:
- Start with a compelling cold outreach
- Include strategic follow-ups that build on the previous email
- Provide value in each touchpoint
- End with a polite "breakup" email if no response

Standard sequence structure (adapt based on campaign type):
1. cold_outreach (Day 0) - Initial contact with value proposition
2. follow_up (Day 3) - Reference first email, add social proof
3. value_add (Day 7) - Share relevant insight or content
4. follow_up (Day 10) - Different angle on the value proposition
5. breakup (Day 14) - Final email, offer to reconnect later

Each email step should have:
- Compelling subject line (40-60 chars, no spam triggers)
- Appropriate tone for the campaign type
- Personalization tokens
- Clear call-to-action

Respond with a valid JSON object matching the EmailSequenceFlow structure.`;

interface EmailVariantGenerationResult {
  emailSequence: EmailSequenceFlow;
  executionPrompt: string;
  channelSettings: ChannelSettings;
}

export async function generateEmailVariant(
  campaignId: string,
  context: StructuredCampaignContext,
  campaignType?: string
): Promise {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.5,
    },
  });

  // Get campaign type info for email tone
  const typeInfo = campaignType ? getCampaignType(campaignType) : null;

  // Build context string for generation
  const contextString = buildContextString(context, typeInfo);

  // Generate email sequence
  const sequencePrompt = `${EMAIL_SEQUENCE_GENERATION_PROMPT}

CAMPAIGN CONTEXT:
${contextString}

${typeInfo ? `CAMPAIGN TYPE: ${typeInfo.label}
EMAIL TONE: ${typeInfo.emailTone}
STRATEGIC INTENT: ${typeInfo.strategicIntent}
PRIMARY GOAL: ${typeInfo.primaryGoal}` : ''}

Generate an EmailSequenceFlow JSON object with the following structure:
{
  "version": "1.0",
  "steps": [
    {
      "id": "step_1",
      "name": "Initial Outreach",
      "type": "cold_outreach",
      "delayDays": 0,
      "subject": "...",
      "bodyTemplate": "...",
      "tone": "${typeInfo?.emailTone || 'professional'}",
      "variables": ["firstName", "companyName", "jobTitle"],
      "exitOnReply": true
    },
    ...
  ],
  "defaultTiming": "business_days",
  "exitConditions": ["replied", "unsubscribed", "bounced"],
  "respectUnsubscribe": true
}

IMPORTANT:
- Use {{firstName}}, {{companyName}}, {{jobTitle}} for personalization
- Keep subject lines under 60 characters
- Each email should be 150-200 words
- Include clear but not pushy CTAs
- Vary the approach in each follow-up`;

  const sequenceResult = await model.generateContent(sequencePrompt);
  const sequenceText = sequenceResult.response.text();
  let emailSequence: EmailSequenceFlow;

  try {
    emailSequence = JSON.parse(sequenceText);
    emailSequence.version = '1.0';
    if (!emailSequence.steps || emailSequence.steps.length === 0) {
      emailSequence = getDefaultEmailSequence(context, typeInfo);
    }
  } catch {
    emailSequence = getDefaultEmailSequence(context, typeInfo);
  }

  // Generate execution prompt for email agent
  const emailPromptTemplate = `You are an expert B2B email marketing agent. Your role is to manage email sequences for this campaign.

CAMPAIGN CONTEXT:
${contextString}

EMAIL SEQUENCE:
${emailSequence.steps.length} emails over ${Math.max(...emailSequence.steps.map(s => s.delayDays))} days

TONE: ${typeInfo?.emailTone || 'professional'}

GUIDELINES:
1. Personalize each email using available merge fields
2. Track engagement and adapt messaging
3. Respect unsubscribe requests immediately
4. Never send to invalid or bounced emails
5. Follow campaign success criteria for qualification

SUCCESS CRITERIA:
${context.successIndicators?.primarySuccess || 'Positive engagement (reply, click, meeting request)'}

COMPLIANCE:
- Include unsubscribe link in every email
- Identify sender clearly
- Honor opt-out within 24 hours`;

  const executionPrompt = emailPromptTemplate;

  // Default channel settings for email
  const channelSettings: ChannelSettings = {
    emailTone: typeInfo?.emailTone || 'professional',
    trackOpens: true,
    trackClicks: true,
    preheaderText: context.objectives?.primaryGoal
      ? `Learn how to ${context.objectives.primaryGoal.toLowerCase()}`
      : undefined,
  };

  return {
    emailSequence,
    executionPrompt,
    channelSettings,
  };
}

function getDefaultEmailSequence(
  context: StructuredCampaignContext,
  typeInfo: CampaignType | null | undefined
): EmailSequenceFlow {
  const tone = typeInfo?.emailTone || 'professional';
  const deliverable = context.deliverables?.[0];
  const primaryGoal = context.objectives?.primaryGoal || 'connect with relevant professionals';

  return {
    version: '1.0',
    steps: [
      {
        id: 'email_1',
        name: 'Initial Outreach',
        type: 'cold_outreach',
        delayDays: 0,
        subject: `Quick question about ${deliverable?.name || 'your priorities'}`,
        bodyTemplate: `Hi {{firstName}},

I noticed {{companyName}} is in {{industry}} and thought you might find this relevant.

${deliverable ? `We've put together a ${deliverable.name} that covers ${deliverable.description || 'key challenges in your space'}.` : `Many ${typeInfo?.label || 'industry'} leaders are facing similar challenges right now.`}

${context.coreMessage || 'Would it be valuable to share some insights?'}

Would you be open to a brief conversation this week?

Best regards`,
        tone,
        variables: ['firstName', 'companyName', 'industry'],
        exitOnReply: true,
      },
      {
        id: 'email_2',
        name: 'Follow-Up #1',
        type: 'follow_up',
        delayDays: 3,
        subject: `Following up - {{companyName}}`,
        bodyTemplate: `Hi {{firstName}},

I wanted to follow up on my previous email. I understand you're busy, so I'll keep this brief.

${context.talkingPoints?.[0] || 'We help companies like yours improve their outcomes significantly.'}

Is there a good time this week for a quick call?

Best`,
        tone,
        variables: ['firstName', 'companyName'],
        exitOnReply: true,
      },
      {
        id: 'email_3',
        name: 'Value Add',
        type: 'value_add',
        delayDays: 7,
        subject: `Thought you might find this useful`,
        bodyTemplate: `Hi {{firstName}},

Rather than another follow-up, I wanted to share something that might be immediately useful.

${context.talkingPoints?.[1] || 'Many professionals in your position have found value in understanding how their peers approach similar challenges.'}

${context.assets?.[0] ? `Here's a ${context.assets[0].type} that covers this: ${context.assets[0].name}` : 'Would you like me to share some relevant insights?'}

Let me know if you'd like to discuss.

Best`,
        tone,
        variables: ['firstName'],
        exitOnReply: true,
      },
      {
        id: 'email_4',
        name: 'Different Angle',
        type: 'follow_up',
        delayDays: 10,
        subject: `Different approach for {{companyName}}`,
        bodyTemplate: `Hi {{firstName}},

I've reached out a few times and haven't heard back, which is completely understandable given how busy things can get.

I'm reaching out because ${primaryGoal} - and I genuinely believe there could be value in connecting.

If timing is the issue, I'm happy to reconnect in a few weeks. Just let me know.

Best`,
        tone,
        variables: ['firstName', 'companyName'],
        exitOnReply: true,
      },
      {
        id: 'email_5',
        name: 'Breakup Email',
        type: 'breakup',
        delayDays: 14,
        subject: `Closing the loop`,
        bodyTemplate: `Hi {{firstName}},

I haven't heard back, so I'll assume the timing isn't right.

I'll stop reaching out for now, but if your priorities change, I'd be happy to reconnect.

Wishing you and the {{companyName}} team all the best.

Best regards`,
        tone,
        variables: ['firstName', 'companyName'],
        exitOnReply: true,
      },
    ],
    defaultTiming: 'business_days',
    exitConditions: ['replied', 'unsubscribed', 'bounced'],
    respectUnsubscribe: true,
  };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function buildContextString(
  context: StructuredCampaignContext,
  typeInfo: CampaignType | null | undefined
): string {
  const parts: string[] = [];

  // Objectives
  if (context.objectives) {
    parts.push(`OBJECTIVES:
- Primary Goal: ${context.objectives.primaryGoal || 'Not specified'}
- Secondary Goals: ${context.objectives.secondaryGoals?.join(', ') || 'None'}
- Desired Outcomes: ${context.objectives.desiredOutcomes?.join(', ') || 'Not specified'}`);
  }

  // Target Audience
  if (context.targetAudience) {
    parts.push(`TARGET AUDIENCE:
- Industries: ${context.targetAudience.industries?.join(', ') || 'Not specified'}
- Job Titles: ${context.targetAudience.jobTitles?.join(', ') || 'Not specified'}
- Regions: ${context.targetAudience.regions?.join(', ') || 'Not specified'}
- Seniority: ${context.targetAudience.seniorityLevels?.join(', ') || 'Not specified'}`);
  }

  // Deliverables
  if (context.deliverables && context.deliverables.length > 0) {
    const deliverable = context.deliverables[0];
    parts.push(`DELIVERABLE:
- Type: ${deliverable.type}
- Name: ${deliverable.name}
- Description: ${deliverable.description || 'Not specified'}
- Value Proposition: ${deliverable.valueProposition || 'Not specified'}`);
  }

  // Assets
  if (context.assets && context.assets.length > 0) {
    parts.push(`ASSETS:
${context.assets.map(a => `- ${a.type}: ${a.name}${a.description ? ` - ${a.description}` : ''}`).join('\n')}`);
  }

  // Core Message
  if (context.coreMessage) {
    parts.push(`CORE MESSAGE:
${context.coreMessage}`);
  }

  // Talking Points
  if (context.talkingPoints && context.talkingPoints.length > 0) {
    parts.push(`TALKING POINTS:
${context.talkingPoints.map(tp => `- ${tp}`).join('\n')}`);
  }

  // Conversation Flow
  if (context.conversationFlow) {
    const flow = context.conversationFlow;
    parts.push(`CONVERSATION APPROACH:
- Opening: ${flow.opening?.approach || 'Standard introduction'}
- Discovery Questions: ${flow.discovery?.questions?.join('; ') || 'Standard discovery'}
- Key Messages: ${flow.valuePresentation?.keyMessages?.join('; ') || 'Based on deliverable'}
- CTA: ${flow.closing?.callToAction || 'Schedule a conversation'}`);
  }

  // Objections
  if (context.conversationFlow?.objectionHandling && context.conversationFlow.objectionHandling.length > 0) {
    parts.push(`OBJECTION HANDLING:
${context.conversationFlow.objectionHandling.map(o => `- "${o.objection}" → "${o.response}"`).join('\n')}`);
  }

  // Success Indicators
  if (context.successIndicators) {
    parts.push(`SUCCESS CRITERIA:
- Primary Success: ${context.successIndicators.primarySuccess || 'Qualified interest'}
- Qualified Lead Definition: ${context.successIndicators.qualifiedLeadDefinition || 'Interest confirmed'}`);
  }

  return parts.join('\n\n');
}

// ============================================================
// MAIN API FUNCTIONS
// ============================================================

export interface GenerateChannelVariantOptions {
  campaignId: string;
  channelType: ChannelType;
  regenerate?: boolean;
  preserveOverrides?: boolean;
  userId?: string;
}

export async function generateChannelVariant(
  options: GenerateChannelVariantOptions
): Promise {
  const { campaignId, channelType, regenerate, preserveOverrides, userId } = options;

  // Get campaign and its context
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // Check if variant already exists
  const [existingVariant] = await db
    .select()
    .from(campaignChannelVariants)
    .where(
      and(
        eq(campaignChannelVariants.campaignId, campaignId),
        eq(campaignChannelVariants.channelType, channelType)
      )
    )
    .limit(1);

  if (existingVariant && !regenerate) {
    return {
      success: true,
      variant: existingVariant as CampaignChannelVariant,
      generationLog: ['Variant already exists'],
    };
  }

  // Build structured context from campaign fields
  const context = buildContextFromCampaign(campaign);

  // Generate variant based on channel type
  let generatedFlow: CallFlowConfig | EmailSequenceFlow;
  let executionPrompt: string;
  let channelSettings: ChannelSettings;

  if (channelType === 'voice') {
    const result = await generateVoiceVariant(campaignId, context, campaign.type);
    generatedFlow = result.callFlow;
    executionPrompt = result.executionPrompt;
    channelSettings = result.channelSettings;
  } else {
    const result = await generateEmailVariant(campaignId, context, campaign.type);
    generatedFlow = result.emailSequence;
    executionPrompt = result.executionPrompt;
    channelSettings = result.channelSettings;
  }

  // Preserve overrides if requested
  let flowOverride = null;
  if (preserveOverrides && existingVariant?.flowOverride) {
    flowOverride = existingVariant.flowOverride;
  }

  // Upsert the variant
  const variantData = {
    campaignId,
    channelType,
    status: 'draft' as const,
    generatedFlow,
    flowOverride,
    channelSettings,
    executionPrompt,
    executionPromptVersion: existingVariant ? (existingVariant.executionPromptVersion || 0) + 1 : 1,
    executionPromptGeneratedAt: new Date(),
    updatedAt: new Date(),
  };

  let variant: CampaignChannelVariant;

  if (existingVariant) {
    // Update existing variant
    const [updated] = await db
      .update(campaignChannelVariants)
      .set(variantData)
      .where(eq(campaignChannelVariants.id, existingVariant.id))
      .returning();
    variant = updated as CampaignChannelVariant;
  } else {
    // Insert new variant
    const [inserted] = await db
      .insert(campaignChannelVariants)
      .values({
        ...variantData,
        createdAt: new Date(),
      })
      .returning();
    variant = inserted as CampaignChannelVariant;
  }

  // Update campaign channel generation status
  const currentStatus = (campaign.channelGenerationStatus as Record) || {};
  currentStatus[channelType] = 'generated';

  await db
    .update(campaigns)
    .set({
      channelGenerationStatus: currentStatus,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId));

  return {
    success: true,
    variant,
    generationLog: [
      `Generated ${channelType} variant`,
      `Flow has ${channelType === 'voice' ? (generatedFlow as CallFlowConfig).steps.length : (generatedFlow as EmailSequenceFlow).steps.length} steps`,
      `Execution prompt: ${executionPrompt.length} characters`,
    ],
  };
}

function buildContextFromCampaign(campaign: any): StructuredCampaignContext {
  // Build a StructuredCampaignContext from campaign fields
  const context: Partial = {
    version: '1.0',
    createdAt: campaign.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: campaign.updatedAt?.toISOString() || new Date().toISOString(),
    status: 'draft',
  };

  // Objectives
  if (campaign.campaignObjective || campaign.successCriteria) {
    context.objectives = {
      primaryGoal: campaign.campaignObjective || '',
      desiredOutcomes: campaign.successCriteria ? [campaign.successCriteria] : [],
      _source: { type: 'user_provided' },
      _approved: true,
    } as any;
  }

  // Target Audience
  if (campaign.targetAudienceDescription) {
    context.targetAudience = {
      industries: [],
      regions: [],
      jobTitles: [],
      _source: { type: 'user_provided' },
      _approved: true,
    } as any;
  }

  // Deliverables from product/service info
  if (campaign.productServiceInfo) {
    context.deliverables = [{
      type: 'service',
      name: campaign.name || 'Our Solution',
      description: campaign.productServiceInfo,
      valueProposition: campaign.productServiceInfo,
    }] as any;
  }

  // Core message and talking points
  context.coreMessage = campaign.campaignContextBrief || campaign.campaignObjective || '' as any;

  if (campaign.talkingPoints && Array.isArray(campaign.talkingPoints)) {
    context.talkingPoints = campaign.talkingPoints as any;
  }

  // Conversation flow from campaign objections
  if (campaign.campaignObjections && Array.isArray(campaign.campaignObjections)) {
    context.conversationFlow = {
      opening: { approach: 'Professional introduction with value focus' },
      discovery: { questions: [], listenFor: [] },
      valuePresentation: { keyMessages: campaign.talkingPoints || [] },
      objectionHandling: campaign.campaignObjections,
      closing: { callToAction: campaign.successCriteria || 'Schedule a meeting', nextSteps: [] },
      _source: { type: 'user_provided' },
      _approved: true,
    } as any;
  }

  // Success indicators
  if (campaign.successCriteria) {
    context.successIndicators = {
      primarySuccess: campaign.successCriteria,
      qualifiedLeadDefinition: campaign.successCriteria,
      _source: { type: 'user_provided' },
      _approved: true,
    } as any;
  }

  // Call flow if already exists (for voice regeneration)
  if (campaign.callFlow) {
    context.conversationFlow = {
      ...context.conversationFlow,
      _existingCallFlow: campaign.callFlow,
    } as any;
  }

  return context as StructuredCampaignContext;
}

// ============================================================
// VARIANT MANAGEMENT FUNCTIONS
// ============================================================

export async function getChannelVariant(
  campaignId: string,
  channelType: ChannelType
): Promise {
  const [variant] = await db
    .select()
    .from(campaignChannelVariants)
    .where(
      and(
        eq(campaignChannelVariants.campaignId, campaignId),
        eq(campaignChannelVariants.channelType, channelType)
      )
    )
    .limit(1);

  return variant as CampaignChannelVariant | null;
}

export async function updateChannelVariant(
  campaignId: string,
  channelType: ChannelType,
  updates: Partial
): Promise {
  const [variant] = await db
    .update(campaignChannelVariants)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(campaignChannelVariants.campaignId, campaignId),
        eq(campaignChannelVariants.channelType, channelType)
      )
    )
    .returning();

  return variant as CampaignChannelVariant | null;
}

export async function approveChannelVariant(
  campaignId: string,
  channelType: ChannelType,
  userId: string
): Promise {
  const [variant] = await db
    .update(campaignChannelVariants)
    .set({
      status: 'approved',
      approvedBy: userId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(campaignChannelVariants.campaignId, campaignId),
        eq(campaignChannelVariants.channelType, channelType)
      )
    )
    .returning();

  if (variant) {
    // Update campaign channel generation status
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (campaign) {
      const currentStatus = (campaign.channelGenerationStatus as Record) || {};
      currentStatus[channelType] = 'approved';

      await db
        .update(campaigns)
        .set({
          channelGenerationStatus: currentStatus,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaignId));
    }
  }

  return variant as CampaignChannelVariant | null;
}

export async function deleteChannelVariant(
  campaignId: string,
  channelType: ChannelType
): Promise {
  const result = await db
    .delete(campaignChannelVariants)
    .where(
      and(
        eq(campaignChannelVariants.campaignId, campaignId),
        eq(campaignChannelVariants.channelType, channelType)
      )
    );

  // Update campaign enabled channels
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (campaign && campaign.enabledChannels) {
    const updatedChannels = (campaign.enabledChannels as string[]).filter(c => c !== channelType);
    const currentStatus = (campaign.channelGenerationStatus as Record) || {};
    delete currentStatus[channelType];

    await db
      .update(campaigns)
      .set({
        enabledChannels: updatedChannels,
        channelGenerationStatus: currentStatus,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));
  }

  return true;
}