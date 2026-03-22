/**
 * Intelligent Campaign Context API Routes
 * 
 * Endpoints for multi-modal campaign creation with AI-powered
 * context generation, validation, and approval workflow.
 */

import { Router, Request, Response } from 'express';
import { campaignContextService } from '../services/campaign-context-service';
import type {
  ContextGenerationRequest,
  RoleExpansionRequest,
  StructuredCampaignContext,
} from '../../shared/campaign-context-types';

const router = Router();

// ============================================================
// SESSION MANAGEMENT
// ============================================================

/**
 * Create a new campaign creation session
 * POST /api/campaign-context/sessions
 */
router.post('/sessions', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'anonymous';
    const session = campaignContextService.createSession(userId);
    
    res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        startedAt: session.startedAt,
        inputMode: session.inputMode,
      },
    });
  } catch (error) {
    console.error('[CampaignContext] Session creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create session',
    });
  }
});

/**
 * Get current session state
 * GET /api/campaign-context/sessions/:sessionId
 */
router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = campaignContextService.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }
    
    res.json({
      success: true,
      session,
    });
  } catch (error) {
    console.error('[CampaignContext] Session fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session',
    });
  }
});

// ============================================================
// CONTEXT GENERATION
// ============================================================

/**
 * Generate campaign context from user inputs
 * POST /api/campaign-context/generate
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const {
      userInputs,
      voiceTranscripts,
      existingContext,
      sessionId,
    }: {
      userInputs: string[];
      voiceTranscripts?: string[];
      existingContext?: Partial;
      sessionId?: string;
    } = req.body;

    if (!userInputs?.length && !voiceTranscripts?.length) {
      return res.status(400).json({
        success: false,
        error: 'At least one user input or voice transcript is required',
      });
    }

    const request: ContextGenerationRequest = {
      userInputs,
      voiceTranscripts,
      existingContext,
    };

    const result = await campaignContextService.generateCampaignContext(request);

    // Update session if provided
    if (sessionId) {
      campaignContextService.updateSession(sessionId, {
        partialContext: result.generatedContext as StructuredCampaignContext,
        extractedIntent: result.extractedIntent,
        missingRequirements: result.missingRequirements,
        recommendations: result.recommendations,
      });
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[CampaignContext] Generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate campaign context',
    });
  }
});

/**
 * Conversational input handler - for guided campaign creation
 * POST /api/campaign-context/converse
 */
router.post('/converse', async (req: Request, res: Response) => {
  try {
    const {
      sessionId,
      userInput,
      inputType = 'text',
    }: {
      sessionId: string;
      userInput: string;
      inputType?: 'text' | 'voice';
    } = req.body;

    if (!sessionId || !userInput) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and user input are required',
      });
    }

    const session = campaignContextService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Add interaction to session history
    const interaction = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: inputType === 'voice' ? 'user_voice' : 'user_text' as const,
      content: userInput,
    };

    const updatedSession = campaignContextService.updateSession(sessionId, {
      interactions: [...session.interactions, interaction as any],
      inputMode: inputType,
    });

    // Get conversational guidance
    const guidance = await campaignContextService.getConversationalGuidance(
      updatedSession!,
      userInput
    );

    // Add assistant response to history
    const assistantInteraction = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: 'system_response' as const,
      content: guidance.response,
    };

    campaignContextService.updateSession(sessionId, {
      interactions: [...updatedSession!.interactions, assistantInteraction as any],
      partialContext: guidance.updatedContext as StructuredCampaignContext,
    });

    res.json({
      success: true,
      response: guidance.response,
      extractedData: guidance.extractedData,
      updatedContext: guidance.updatedContext,
      nextQuestion: guidance.nextQuestion,
      validationStatus: guidance.updatedContext.validationRequirements,
    });
  } catch (error) {
    console.error('[CampaignContext] Conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process input',
    });
  }
});

// ============================================================
// ROLE EXPANSION
// ============================================================

/**
 * Expand job roles with AI recommendations
 * POST /api/campaign-context/expand-roles
 */
router.post('/expand-roles', async (req: Request, res: Response) => {
  try {
    const {
      specifiedRoles,
      industries,
      companySize,
      campaignContext,
    }: RoleExpansionRequest = req.body;

    if (!specifiedRoles?.length) {
      return res.status(400).json({
        success: false,
        error: 'At least one role is required',
      });
    }

    const result = await campaignContextService.expandRoles({
      specifiedRoles,
      industries: industries || [],
      companySize,
      campaignContext,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[CampaignContext] Role expansion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to expand roles',
    });
  }
});

// ============================================================
// VALIDATION
// ============================================================

/**
 * Validate campaign context
 * POST /api/campaign-context/validate
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { context }: { context: Partial } = req.body;

    if (!context) {
      return res.status(400).json({
        success: false,
        error: 'Campaign context is required',
      });
    }

    const result = campaignContextService.validateCampaignContext(context);

    res.json({
      success: true,
      validation: result,
      canActivate: result.canActivate,
      errorCount: result.validationErrors.length,
      warningCount: result.validationWarnings.length,
    });
  } catch (error) {
    console.error('[CampaignContext] Validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate context',
    });
  }
});

// ============================================================
// SECTION APPROVAL
// ============================================================

/**
 * Approve a specific section of the campaign context
 * POST /api/campaign-context/approve-section
 */
router.post('/approve-section', async (req: Request, res: Response) => {
  try {
    const {
      sessionId,
      sectionKey,
      approved = true,
      edits,
    }: {
      sessionId?: string;
      sectionKey: string;
      approved?: boolean;
      edits?: any;
    } = req.body;

    if (!sectionKey) {
      return res.status(400).json({
        success: false,
        error: 'Section key is required',
      });
    }

    // If session provided, update session context
    if (sessionId) {
      const session = campaignContextService.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }

      const updatedContext = { ...session.partialContext } as any;
      
      if (updatedContext[sectionKey]) {
        // Apply any edits first
        if (edits) {
          updatedContext[sectionKey] = {
            ...updatedContext[sectionKey],
            ...edits,
          };
        }
        
        // Mark as approved with user attribution
        updatedContext[sectionKey]._approved = approved;
        updatedContext[sectionKey]._source = {
          ...(updatedContext[sectionKey]._source || {}),
          type: 'user_approved',
          approvedAt: new Date().toISOString(),
          approvedBy: (req as any).user?.id || 'anonymous',
        };
      }

      // Re-validate after approval
      updatedContext.validationRequirements = campaignContextService.validateCampaignContext(updatedContext);
      updatedContext.updatedAt = new Date().toISOString();

      campaignContextService.updateSession(sessionId, {
        partialContext: updatedContext,
      });

      res.json({
        success: true,
        section: sectionKey,
        approved,
        updatedContext,
        validation: updatedContext.validationRequirements,
      });
    } else {
      // Stateless approval - just return the approval metadata
      res.json({
        success: true,
        section: sectionKey,
        approved,
        approvalMetadata: {
          type: 'user_approved',
          approvedAt: new Date().toISOString(),
          approvedBy: (req as any).user?.id || 'anonymous',
        },
      });
    }
  } catch (error) {
    console.error('[CampaignContext] Section approval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve section',
    });
  }
});

// ============================================================
// FINALIZE & CONVERT
// ============================================================

/**
 * Finalize campaign context for campaign creation
 * POST /api/campaign-context/finalize
 */
router.post('/finalize', async (req: Request, res: Response) => {
  try {
    const {
      sessionId,
      context,
    }: {
      sessionId?: string;
      context?: Partial;
    } = req.body;

    let finalContext: Partial;

    if (sessionId) {
      const session = campaignContextService.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }
      finalContext = session.partialContext;
    } else if (context) {
      finalContext = context;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Session ID or context is required',
      });
    }

    // Final validation
    const validation = campaignContextService.validateCampaignContext(finalContext);
    
    if (!validation.canActivate) {
      return res.status(400).json({
        success: false,
        error: 'Campaign context cannot be finalized - validation failed',
        validation,
      });
    }

    // Mark as finalized
    finalContext.status = 'active';
    finalContext.updatedAt = new Date().toISOString();

    // Convert to legacy campaign format fields for backward compatibility
    const legacyFields = convertToLegacyFormat(finalContext);

    res.json({
      success: true,
      finalizedContext: finalContext,
      legacyFields,
      validation,
    });
  } catch (error) {
    console.error('[CampaignContext] Finalize error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to finalize context',
    });
  }
});

/**
 * Convert structured context to legacy campaign fields
 */
function convertToLegacyFormat(context: Partial): Record {
  const objectives = (context as any).objectives;
  const audience = (context as any).targetAudience;
  const deliverables = context.deliverables || [];
  const flow = (context as any).conversationFlow;
  const successIndicators = (context as any).successIndicators;
  const qualificationCriteria = (context as any).qualificationCriteria;
  const talkingPoints = Array.isArray((context as any).talkingPoints)
    ? (context as any).talkingPoints.filter((point: unknown): point is string => typeof point === 'string' && point.trim().length > 0)
    : [];
  const objections = Array.isArray(flow?.objectionHandling)
    ? flow.objectionHandling
        .filter((item: any) => item && (item.objection || item.response))
        .map((item: any) => ({
          objection: item.objection || '',
          response: item.response || '',
          category: item.category || undefined,
        }))
    : [];
  const targetAudienceDescription = [
    audience?.industries?.length ? `Industries: ${audience.industries.join(', ')}` : '',
    audience?.regions?.length ? `Regions: ${audience.regions.join(', ')}` : '',
    audience?.jobTitles?.length ? `Roles: ${audience.jobTitles.join(', ')}` : '',
    audience?.companySizeMin || audience?.companySizeMax
      ? `Company Size: ${audience.companySizeMin || 'any'}-${audience.companySizeMax || 'any'} employees`
      : '',
  ].filter(Boolean).join('\n');
  const contextBrief = [
    objectives?.primaryGoal ? `Primary Goal: ${objectives.primaryGoal}` : '',
    successIndicators?.qualifiedLeadDefinition ? `Qualified Lead: ${successIndicators.qualifiedLeadDefinition}` : '',
    (context as any).coreMessage ? `Core Message: ${(context as any).coreMessage}` : '',
    targetAudienceDescription ? `Audience:\n${targetAudienceDescription}` : '',
    deliverables.length > 0
      ? `Deliverables: ${deliverables.map((d: any) => d?.name || d?.description).filter(Boolean).join('; ')}`
      : '',
  ].filter(Boolean).join('\n\n');

  return {
    // Campaign objective field
    campaignObjective: objectives?.primaryGoal || '',
    
    // Product/service info from deliverables
    productServiceInfo: deliverables.length > 0 
      ? deliverables.map((d: any) => `${d.name}: ${d.description}`).join('\n\n')
      : '',
    
    // Core message and talking points
    coreMessage: (context as any).coreMessage || '',
    talkingPoints,
    
    // Target audience description
    targetAudienceDescription,
    
    // Objections
    campaignObjections: objections,
    
    // Success criteria
    successCriteria: successIndicators?.qualifiedLeadDefinition || '',
    
    // Qualification requirements
    qualificationRequirements: qualificationCriteria?.qualifyingConditions
      ?.map((c: any) => `${c.field}: ${c.operator} ${c.value}${c.required ? ' (required)' : ''}`)
      .join('\n') || '',
    
    // Context brief (short summary)
    campaignContextBrief: contextBrief,
    callFlow: buildLegacyCallFlow(flow),
    structuredContext: context,
  };
}

function buildLegacyCallFlow(flow: any) {
  if (!flow || typeof flow !== 'object') {
    return null;
  }

  const valuePresentationParts = [
    ...(Array.isArray(flow.valuePresentation?.keyMessages) ? flow.valuePresentation.keyMessages : []),
    ...(Array.isArray(flow.valuePresentation?.proofPoints) ? flow.valuePresentation.proofPoints : []),
  ].filter((part: unknown): part is string => typeof part === 'string' && part.trim().length > 0);

  const closingParts = [
    flow.closing?.callToAction,
    ...(Array.isArray(flow.closing?.nextSteps) ? flow.closing.nextSteps : []),
  ].filter((part: unknown): part is string => typeof part === 'string' && part.trim().length > 0);

  return {
    openingApproach: flow.opening?.script || flow.opening?.approach || '',
    valueProposition: valuePresentationParts.join('\n'),
    closingStrategy: closingParts.join('\n'),
    voicemailScript: flow.voicemail?.script || '',
  };
}

export default router;