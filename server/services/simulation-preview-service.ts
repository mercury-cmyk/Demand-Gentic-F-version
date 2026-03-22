/**
 * Simulation & Preview Service
 *
 * Provides non-executing simulation and preview capabilities for both
 * email and voice channels. All simulations are read-only and do not
 * contact real prospects or send real communications.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db';
import {
  campaigns,
  campaignChannelVariants,
  previewStudioSessions,
  accounts,
  contacts,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type {
  ChannelType,
  SimulationMode,
  SimulationSession,
  SimulationMessage,
  SimulationCheckpoint,
  EmailPreviewResult,
  ResolvedTemplates,
} from '@shared/multi-channel-types';
import type { CallFlowConfig, CallFlowStep } from '../../client/src/lib/campaign-types';
import type { EmailSequenceFlow, EmailSequenceStep } from '@shared/multi-channel-types';
import { getChannelVariant } from './channel-variant-generator';
import { assembleExecutionPrompt } from './execution-prompt-assembler';
import {
  resolveAndSubstituteTemplates,
  buildVariablesFromContext,
  substituteVariables,
} from './template-resolution-service';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ============================================================
// EMAIL PREVIEW
// ============================================================

export interface StartEmailPreviewOptions {
  campaignId: string;
  accountId?: string;
  contactId?: string;
}

/**
 * Generate email preview showing all sequence emails with resolved templates.
 */
export async function startEmailPreview(
  options: StartEmailPreviewOptions
): Promise<EmailPreviewResult> {
  const { campaignId, accountId, contactId } = options;

  // Get campaign
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // Get email variant
  const variant = await getChannelVariant(campaignId, 'email');
  if (!variant) {
    throw new Error('Email channel variant not found. Generate the email variant first.');
  }

  const emailSequence = (variant.flowOverride || variant.generatedFlow) as EmailSequenceFlow;
  if (!emailSequence?.steps) {
    throw new Error('Email sequence not configured');
  }

  // Resolve templates
  const resolvedTemplates = await resolveAndSubstituteTemplates({
    campaignId,
    channelType: 'email',
    accountId,
    contactId,
  });

  // Build merge variables
  const variables = await buildVariablesFromContext(campaignId, accountId, contactId);

  // Generate preview emails for each step
  const previewEmails = emailSequence.steps.map(step => {
    // Substitute variables in the step content
    const subject = substituteVariables(step.subject, variables);
    const htmlContent = substituteVariables(step.bodyTemplate, variables);
    const plainTextContent = step.plainTextTemplate
      ? substituteVariables(step.plainTextTemplate, variables)
      : convertHtmlToPlainText(htmlContent);

    return {
      stepId: step.id,
      stepName: step.name,
      subject,
      preheader: resolvedTemplates.preheader || undefined,
      htmlContent: wrapEmailHtml(htmlContent, subject, resolvedTemplates),
      plainTextContent,
      sendDay: step.delayDays,
    };
  });

  // Get the execution prompt for reference
  const { finalPrompt } = await assembleExecutionPrompt({
    campaignId,
    channelType: 'email',
    accountId,
    contactId,
  });

  // Build merge variables record for display
  const mergeVariables: Record<string, string> = {};
  if (variables.contact) {
    Object.entries(variables.contact).forEach(([k, v]) => {
      if (v) mergeVariables[`contact.${k}`] = String(v);
    });
  }
  if (variables.account) {
    Object.entries(variables.account).forEach(([k, v]) => {
      if (v) mergeVariables[`account.${k}`] = String(v);
    });
  }
  if (variables.campaign) {
    Object.entries(variables.campaign).forEach(([k, v]) => {
      if (v) mergeVariables[`campaign.${k}`] = String(v);
    });
  }

  return {
    previewEmails,
    resolvedTemplates,
    executionPrompt: finalPrompt,
    mergeVariables,
  };
}

/**
 * Wrap email body in a proper HTML structure.
 */
function wrapEmailHtml(
  body: string,
  subject: string,
  templates: ResolvedTemplates
): string {
  const greeting = templates.greeting || 'Hi,';
  const signature = templates.signature || 'Best regards';
  const cta = templates.callToAction || '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    p { margin: 0 0 15px 0; }
    .greeting { margin-bottom: 20px; }
    .cta { margin: 25px 0; }
    .cta a { background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; }
    .signature { margin-top: 25px; color: #666; }
  </style>
</head>
<body>
  <div class="greeting">${greeting}</div>

  <div class="body-content">
    ${body.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('\n')}
  </div>

  ${cta ? `<div class="cta"><a href="#">${cta}</a></div>` : ''}

  <div class="signature">${signature}</div>
</body>
</html>`;
}

/**
 * Convert HTML to plain text.
 */
function convertHtmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ============================================================
// VOICE SIMULATION
// ============================================================

export interface StartVoiceSimulationOptions {
  campaignId: string;
  accountId?: string;
  contactId?: string;
  mode: SimulationMode;
  userId?: string;
}

/**
 * Start a new voice simulation session.
 */
export async function startVoiceSimulation(
  options: StartVoiceSimulationOptions
): Promise<SimulationSession> {
  const { campaignId, accountId, contactId, mode, userId } = options;

  // Get campaign
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // Get voice variant
  const variant = await getChannelVariant(campaignId, 'voice');
  if (!variant) {
    throw new Error('Voice channel variant not found. Generate the voice variant first.');
  }

  const callFlow = (variant.flowOverride || variant.generatedFlow) as CallFlowConfig;
  if (!callFlow?.steps) {
    throw new Error('Call flow not configured');
  }

  // Resolve templates
  const resolvedTemplates = await resolveAndSubstituteTemplates({
    campaignId,
    channelType: 'voice',
    accountId,
    contactId,
  });

  // Get execution prompt
  const { finalPrompt } = await assembleExecutionPrompt({
    campaignId,
    channelType: 'voice',
    accountId,
    contactId,
  });

  // Get context info
  let accountName: string | undefined;
  let contactName: string | undefined;
  let contactJobTitle: string | undefined;

  if (accountId) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    if (account) accountName = account.name || undefined;
  }

  if (contactId) {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);
    if (contact) {
      contactName = contact.firstName
        ? `${contact.firstName}${contact.lastName ? ' ' + contact.lastName : ''}`
        : undefined;
      contactJobTitle = contact.jobTitle || undefined;
    }
  }

  // Create session
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Find the first step
  const firstStep = callFlow.steps.find(s => s.required) || callFlow.steps[0];

  // Generate initial agent message
  const initialMessage = await generateAgentMessage(
    finalPrompt,
    callFlow,
    firstStep,
    [],
    resolvedTemplates,
    'start'
  );

  const session: SimulationSession = {
    sessionId,
    campaignId,
    channelType: 'voice',
    mode,
    context: {
      campaignName: campaign.name,
      accountId,
      accountName,
      contactId,
      contactName,
      contactJobTitle,
    },
    currentStepId: firstStep.id,
    currentStepIndex: 0,
    isComplete: false,
    transcript: [
      {
        id: crypto.randomUUID(),
        role: 'system',
        content: `Simulation started in ${mode} mode`,
        timestamp: now,
      },
      {
        id: crypto.randomUUID(),
        role: 'agent',
        content: initialMessage,
        timestamp: now,
        stepId: firstStep.id,
      },
    ],
    checkpoints: [],
    resolvedTemplates,
    executionPrompt: finalPrompt,
    createdAt: now,
    updatedAt: now,
  };

  // Save session to database
  await db.insert(previewStudioSessions).values({
    id: sessionId,
    campaignId,
    channelType: 'voice',
    mode,
    accountId: accountId || null,
    contactId: contactId || null,
    currentStepId: firstStep.id,
    currentStepIndex: 0,
    isComplete: false,
    transcript: session.transcript,
    checkpoints: session.checkpoints,
    resolvedTemplates,
    executionPrompt: finalPrompt,
    createdBy: userId || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return session;
}

/**
 * Respond to a simulation and get the agent's next message.
 */
export async function advanceSimulation(
  sessionId: string,
  userResponse: string
): Promise<SimulationSession> {
  // Get session from database
  const [sessionRecord] = await db
    .select()
    .from(previewStudioSessions)
    .where(eq(previewStudioSessions.id, sessionId))
    .limit(1);

  if (!sessionRecord) {
    throw new Error('Simulation session not found');
  }

  if (sessionRecord.isComplete) {
    throw new Error('Simulation has already ended');
  }

  const session = reconstructSession(sessionRecord);

  // Get the call flow
  const variant = await getChannelVariant(session.campaignId, 'voice');
  if (!variant) {
    throw new Error('Voice variant not found');
  }

  const callFlow = (variant.flowOverride || variant.generatedFlow) as CallFlowConfig;
  const currentStep = callFlow.steps.find(s => s.id === session.currentStepId);

  if (!currentStep) {
    throw new Error('Current step not found in call flow');
  }

  const now = new Date().toISOString();

  // Add user message to transcript
  session.transcript.push({
    id: crypto.randomUUID(),
    role: 'prospect',
    content: userResponse,
    timestamp: now,
    stepId: currentStep.id,
  });

  // Determine next step based on response
  const { nextStep, checkpoint, isComplete } = await determineNextStep(
    callFlow,
    currentStep,
    userResponse,
    session.transcript
  );

  // Add checkpoint if applicable
  if (checkpoint) {
    session.checkpoints.push(checkpoint);
  }

  // Generate agent response
  let agentMessage: string;
  if (isComplete) {
    agentMessage = await generateAgentMessage(
      session.executionPrompt,
      callFlow,
      currentStep,
      session.transcript,
      session.resolvedTemplates,
      'closing'
    );
    session.isComplete = true;
  } else {
    agentMessage = await generateAgentMessage(
      session.executionPrompt,
      callFlow,
      nextStep || currentStep,
      session.transcript,
      session.resolvedTemplates,
      'continue'
    );
    if (nextStep) {
      session.currentStepId = nextStep.id;
      session.currentStepIndex = callFlow.steps.findIndex(s => s.id === nextStep.id);
    }
  }

  // Add agent message to transcript
  session.transcript.push({
    id: crypto.randomUUID(),
    role: 'agent',
    content: agentMessage,
    timestamp: new Date().toISOString(),
    stepId: session.currentStepId,
  });

  session.updatedAt = new Date().toISOString();

  // Update session in database
  await db
    .update(previewStudioSessions)
    .set({
      currentStepId: session.currentStepId,
      currentStepIndex: session.currentStepIndex,
      isComplete: session.isComplete,
      transcript: session.transcript,
      checkpoints: session.checkpoints,
      updatedAt: new Date(),
    })
    .where(eq(previewStudioSessions.id, sessionId));

  return session;
}

/**
 * Get a simulation session by ID.
 */
export async function getSimulationSession(
  sessionId: string
): Promise<SimulationSession | null> {
  const [sessionRecord] = await db
    .select()
    .from(previewStudioSessions)
    .where(eq(previewStudioSessions.id, sessionId))
    .limit(1);

  if (!sessionRecord) {
    return null;
  }

  return reconstructSession(sessionRecord);
}

/**
 * End a simulation session.
 */
export async function endSimulation(sessionId: string): Promise<SimulationSession> {
  const session = await getSimulationSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (!session.isComplete) {
    session.isComplete = true;
    session.transcript.push({
      id: crypto.randomUUID(),
      role: 'system',
      content: 'Simulation ended by user',
      timestamp: new Date().toISOString(),
    });

    await db
      .update(previewStudioSessions)
      .set({
        isComplete: true,
        transcript: session.transcript,
        updatedAt: new Date(),
      })
      .where(eq(previewStudioSessions.id, sessionId));
  }

  return session;
}

// ============================================================
// AI GENERATION FOR SIMULATION
// ============================================================

/**
 * Generate an agent message using AI.
 */
async function generateAgentMessage(
  executionPrompt: string,
  callFlow: CallFlowConfig,
  currentStep: CallFlowStep,
  transcript: SimulationMessage[],
  templates: ResolvedTemplates,
  context: 'start' | 'continue' | 'closing'
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 200,
    },
  });

  // Build conversation history
  const conversationHistory = transcript
    .filter(m => m.role !== 'system')
    .map(m => `${m.role === 'agent' ? 'Agent' : 'Contact'}: ${m.content}`)
    .join('\n');

  // Build step context
  const stepContext = `
CURRENT STEP: ${currentStep.name}
DESCRIPTION: ${currentStep.description}
EXAMPLE PHRASES: ${currentStep.allowedUtterances?.slice(0, 3).join(' | ')}
`;

  const prompt = `You are simulating an AI voice agent for a B2B telemarketing call.

${executionPrompt}

${stepContext}

CONVERSATION SO FAR:
${conversationHistory || '(Starting the call)'}

CONTEXT: ${context === 'start' ? 'Starting the call - deliver opening' : context === 'closing' ? 'Ending the call - deliver closing' : 'Continue the conversation naturally'}

${templates.opening && context === 'start' ? `USE THIS OPENING: ${templates.opening}` : ''}
${templates.closing && context === 'closing' ? `USE THIS CLOSING: ${templates.closing}` : ''}

Generate a natural, conversational response as the agent. Keep it concise (1-3 sentences). Do not include "Agent:" prefix.`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    // Fallback to template-based response
    if (context === 'start' && templates.opening) {
      return templates.opening;
    }
    if (context === 'closing' && templates.closing) {
      return templates.closing;
    }
    if (currentStep.allowedUtterances && currentStep.allowedUtterances.length > 0) {
      return currentStep.allowedUtterances[0];
    }
    return "I understand. Let me help you with that.";
  }
}

/**
 * Determine the next step based on prospect response.
 */
async function determineNextStep(
  callFlow: CallFlowConfig,
  currentStep: CallFlowStep,
  userResponse: string,
  transcript: SimulationMessage[]
): Promise<{
  nextStep: CallFlowStep | null;
  checkpoint: SimulationCheckpoint | null;
  isComplete: boolean;
}> {
  const response = userResponse.toLowerCase();
  const now = new Date().toISOString();

  // Check for call-ending responses
  if (
    response.includes('not interested') ||
    response.includes('no thank you') ||
    response.includes('remove me') ||
    response.includes('don\'t call')
  ) {
    return {
      nextStep: callFlow.steps.find(s => s.id === 'call_closing') || null,
      checkpoint: {
        stepId: currentStep.id,
        stepName: currentStep.name,
        passed: false,
        notes: 'Prospect declined',
        timestamp: now,
      },
      isComplete: true,
    };
  }

  // Check if current step is complete based on exit conditions
  const stepComplete = currentStep.exitConditions?.some(condition => {
    const conditionLower = condition.toLowerCase();
    if (conditionLower.includes('confirm') && (response.includes('yes') || response.includes('speaking') || response.includes('this is'))) {
      return true;
    }
    if (conditionLower.includes('interest') && (response.includes('tell me more') || response.includes('interested') || response.includes('sounds good'))) {
      return true;
    }
    return false;
  });

  // Create checkpoint if step is complete
  let checkpoint: SimulationCheckpoint | null = null;
  if (stepComplete && currentStep.required) {
    checkpoint = {
      stepId: currentStep.id,
      stepName: currentStep.name,
      passed: true,
      notes: 'Step completed successfully',
      timestamp: now,
    };
  }

  // Find next step
  let nextStep: CallFlowStep | null = null;

  // Check explicit next step conditions
  for (const nextStepConfig of currentStep.nextSteps || []) {
    const conditionLower = nextStepConfig.condition.toLowerCase();
    if (
      (conditionLower.includes('confirm') && (response.includes('yes') || response.includes('speaking'))) ||
      (conditionLower.includes('interest') && (response.includes('interested') || response.includes('tell me'))) ||
      (conditionLower.includes('engaged') && response.length > 10)
    ) {
      nextStep = callFlow.steps.find(s => s.id === nextStepConfig.stepId) || null;
      break;
    }
  }

  // If no explicit next step, move to the next in sequence
  if (!nextStep && stepComplete) {
    const currentIndex = callFlow.steps.findIndex(s => s.id === currentStep.id);
    if (currentIndex < callFlow.steps.length - 1) {
      nextStep = callFlow.steps[currentIndex + 1];
    }
  }

  // Check if we've reached the end
  const isComplete = !nextStep || currentStep.id === 'call_closing';

  return { nextStep, checkpoint, isComplete };
}

/**
 * Reconstruct session from database record.
 */
function reconstructSession(record: any): SimulationSession {
  return {
    sessionId: record.id,
    campaignId: record.campaignId,
    channelType: record.channelType as ChannelType,
    mode: record.mode as SimulationMode,
    context: {
      campaignName: 'Campaign', // Would need to fetch
    },
    currentStepId: record.currentStepId,
    currentStepIndex: record.currentStepIndex || 0,
    isComplete: record.isComplete || false,
    transcript: (record.transcript as SimulationMessage[]) || [],
    checkpoints: (record.checkpoints as SimulationCheckpoint[]) || [],
    resolvedTemplates: (record.resolvedTemplates as ResolvedTemplates) || { resolutionLog: [] },
    executionPrompt: record.executionPrompt || '',
    createdAt: record.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: record.updatedAt?.toISOString() || new Date().toISOString(),
  };
}

// ============================================================
// GOVERNANCE
// ============================================================

export interface LaunchReadinessCheck {
  canLaunch: boolean;
  blockers: Array<{
    type: string;
    message: string;
    channel?: ChannelType;
    severity: 'blocking' | 'warning';
  }>;
}

/**
 * Check if a campaign is ready to launch.
 */
export async function checkLaunchReadiness(
  campaignId: string
): Promise<LaunchReadinessCheck> {
  const blockers: LaunchReadinessCheck['blockers'] = [];

  // Get campaign
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    return {
      canLaunch: false,
      blockers: [{ type: 'campaign_not_found', message: 'Campaign not found', severity: 'blocking' }],
    };
  }

  // Check enabled channels
  const enabledChannels = (campaign.enabledChannels as string[]) || [];
  if (enabledChannels.length === 0) {
    blockers.push({
      type: 'no_channels',
      message: 'No channels enabled for this campaign',
      severity: 'blocking',
    });
  }

  // Check each enabled channel
  for (const channel of enabledChannels as ChannelType[]) {
    const variant = await getChannelVariant(campaignId, channel);

    if (!variant) {
      blockers.push({
        type: 'variant_missing',
        message: `${channel} channel variant not generated`,
        channel,
        severity: 'blocking',
      });
    } else if (variant.status !== 'approved') {
      blockers.push({
        type: 'variant_not_approved',
        message: `${channel} channel variant not approved (status: ${variant.status})`,
        channel,
        severity: 'blocking',
      });
    }
  }

  // Check required campaign fields
  if (!campaign.campaignObjective) {
    blockers.push({
      type: 'missing_objective',
      message: 'Campaign objective not set',
      severity: 'warning',
    });
  }

  if (!campaign.successCriteria) {
    blockers.push({
      type: 'missing_criteria',
      message: 'Success criteria not defined',
      severity: 'warning',
    });
  }

  const canLaunch = blockers.filter(b => b.severity === 'blocking').length === 0;

  return { canLaunch, blockers };
}
