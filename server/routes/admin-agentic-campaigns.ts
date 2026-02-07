/**
 * Admin Agentic Campaign Routes
 *
 * API routes for agent-first campaign creation in the admin dashboard:
 * - Campaign Intake Management (list, approve, reject, assign)
 * - Agentic Campaign Sessions (conversational campaign creation)
 * - Context Extraction (URL analysis, document processing)
 * - Voice & Phone Configuration
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, desc, sql, inArray, isNull, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  campaignIntakeRequests,
  agenticCampaignSessions,
  campaigns,
  clientProjects,
  clientAccounts,
  clientPortalOrders,
  users,
  virtualAgents,
  type CampaignIntakeRequest,
  type AgenticCampaignSession,
} from '@shared/schema';
import { requireAuth, requireRole } from '../auth';
import { chat as vertexChat, streamChat, generateJSON } from '../services/vertex-ai';

const router = Router();

// ==================== CAMPAIGN INTAKE MANAGEMENT ====================

/**
 * List all campaign intake requests with filtering
 */
router.get('/campaign-intake', requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, clientAccountId, priority, limit = '50', offset = '0' } = req.query;

    let query = db
      .select({
        id: campaignIntakeRequests.id,
        sourceType: campaignIntakeRequests.sourceType,
        clientAccountId: campaignIntakeRequests.clientAccountId,
        clientAccountName: clientAccounts.name,
        status: campaignIntakeRequests.status,
        priority: campaignIntakeRequests.priority,
        rawInput: campaignIntakeRequests.rawInput,
        extractedContext: campaignIntakeRequests.extractedContext,
        assignedPmId: campaignIntakeRequests.assignedPmId,
        assignedPmName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`.as('assigned_pm_name'),
        requestedLeadCount: campaignIntakeRequests.requestedLeadCount,
        requestedStartDate: campaignIntakeRequests.requestedStartDate,
        estimatedCost: campaignIntakeRequests.estimatedCost,
        campaignType: campaignIntakeRequests.campaignType,
        createdAt: campaignIntakeRequests.createdAt,
      })
      .from(campaignIntakeRequests)
      .leftJoin(clientAccounts, eq(campaignIntakeRequests.clientAccountId, clientAccounts.id))
      .leftJoin(users, eq(campaignIntakeRequests.assignedPmId, users.id))
      .orderBy(desc(campaignIntakeRequests.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    // Apply filters
    const conditions = [];
    if (status) {
      conditions.push(eq(campaignIntakeRequests.status, status as any));
    }
    if (clientAccountId) {
      conditions.push(eq(campaignIntakeRequests.clientAccountId, clientAccountId as string));
    }
    if (priority) {
      conditions.push(eq(campaignIntakeRequests.priority, priority as any));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const intakeRequests = await query;

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaignIntakeRequests);

    res.json({
      success: true,
      data: intakeRequests,
      pagination: {
        total: countResult?.count || 0,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error: any) {
    console.error('[Admin Agentic] List intake error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get single intake request details
 */
router.get('/campaign-intake/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [intakeRequest] = await db
      .select({
        id: campaignIntakeRequests.id,
        sourceType: campaignIntakeRequests.sourceType,
        clientAccountId: campaignIntakeRequests.clientAccountId,
        clientOrderId: campaignIntakeRequests.clientOrderId,
        agenticSessionId: campaignIntakeRequests.agenticSessionId,
        rawInput: campaignIntakeRequests.rawInput,
        extractedContext: campaignIntakeRequests.extractedContext,
        contextSources: campaignIntakeRequests.contextSources,
        status: campaignIntakeRequests.status,
        priority: campaignIntakeRequests.priority,
        assignedPmId: campaignIntakeRequests.assignedPmId,
        assignedAt: campaignIntakeRequests.assignedAt,
        qsoReviewedById: campaignIntakeRequests.qsoReviewedById,
        qsoReviewedAt: campaignIntakeRequests.qsoReviewedAt,
        qsoNotes: campaignIntakeRequests.qsoNotes,
        approvedById: campaignIntakeRequests.approvedById,
        approvedAt: campaignIntakeRequests.approvedAt,
        rejectionReason: campaignIntakeRequests.rejectionReason,
        campaignId: campaignIntakeRequests.campaignId,
        projectId: campaignIntakeRequests.projectId,
        requestedStartDate: campaignIntakeRequests.requestedStartDate,
        requestedLeadCount: campaignIntakeRequests.requestedLeadCount,
        estimatedCost: campaignIntakeRequests.estimatedCost,
        requestedChannels: campaignIntakeRequests.requestedChannels,
        campaignType: campaignIntakeRequests.campaignType,
        createdAt: campaignIntakeRequests.createdAt,
        updatedAt: campaignIntakeRequests.updatedAt,
      })
      .from(campaignIntakeRequests)
      .where(eq(campaignIntakeRequests.id, id));

    if (!intakeRequest) {
      return res.status(404).json({ success: false, message: 'Intake request not found' });
    }

    // Get related data
    let clientAccount = null;
    if (intakeRequest.clientAccountId) {
      [clientAccount] = await db
        .select()
        .from(clientAccounts)
        .where(eq(clientAccounts.id, intakeRequest.clientAccountId));
    }

    let assignedPm = null;
    if (intakeRequest.assignedPmId) {
      [assignedPm] = await db
        .select({ 
          id: users.id, 
          fullName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`.as('full_name'),
          email: users.email 
        })
        .from(users)
        .where(eq(users.id, intakeRequest.assignedPmId));
    }

    res.json({
      success: true,
      data: {
        ...intakeRequest,
        clientAccount,
        assignedPm,
      },
    });
  } catch (error: any) {
    console.error('[Admin Agentic] Get intake error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Approve intake request
 */
router.post('/campaign-intake/:id/approve', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    const [updated] = await db
      .update(campaignIntakeRequests)
      .set({
        status: 'approved',
        approvedById: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaignIntakeRequests.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Intake request not found' });
    }

    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[Admin Agentic] Approve intake error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Reject intake request
 */
router.post('/campaign-intake/:id/reject', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = (req as any).user?.id;

    const [updated] = await db
      .update(campaignIntakeRequests)
      .set({
        status: 'rejected',
        rejectionReason: reason,
        approvedById: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaignIntakeRequests.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Intake request not found' });
    }

    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[Admin Agentic] Reject intake error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Assign PM to intake request
 */
router.post('/campaign-intake/:id/assign', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { pmId } = req.body;

    if (!pmId) {
      return res.status(400).json({ success: false, message: 'PM ID is required' });
    }

    const [updated] = await db
      .update(campaignIntakeRequests)
      .set({
        status: 'assigned',
        assignedPmId: pmId,
        assignedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaignIntakeRequests.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Intake request not found' });
    }

    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[Admin Agentic] Assign PM error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Update QSO status - Auto-creates campaign on approval
 */
router.post('/campaign-intake/:id/qso', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body; // action: 'submit' | 'approve'
    const userId = (req as any).user?.id;

    let newStatus: string;
    if (action === 'submit') {
      newStatus = 'pending_qso';
    } else if (action === 'approve') {
      newStatus = 'qso_approved';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const updateData: any = {
      status: newStatus,
      updatedAt: new Date(),
    };

    if (action === 'approve') {
      updateData.qsoReviewedById = userId;
      updateData.qsoReviewedAt = new Date();
      updateData.qsoNotes = notes;
    }

    const [updated] = await db
      .update(campaignIntakeRequests)
      .set(updateData)
      .where(eq(campaignIntakeRequests.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Intake request not found' });
    }

    // Auto-create campaign when QSO is approved
    let createdCampaign = null;
    if (action === 'approve' && updated.projectId) {
      try {
        // Get extracted context from intake request
        const context = updated.extractedContext as any || {};
        const channels = updated.requestedChannels as string[] || context.channels || ['voice'];

        // Determine campaign type
        let campaignType = updated.campaignType || context.objective || 'lead_qualification';

        // Create the campaign
        const [campaign] = await db
          .insert(campaigns)
          .values({
            name: `Campaign - ${updated.id.slice(0, 8).toUpperCase()}`,
            type: campaignType as any,
            status: 'draft',
            clientAccountId: updated.clientAccountId || undefined,
            projectId: updated.projectId,
            intakeRequestId: updated.id,
            creationMode: 'agentic',
            targetQualifiedLeads: updated.requestedLeadCount || 100,
            dialMode: channels.includes('voice') ? 'ai_agent' : undefined,
            campaignObjective: context.objective || 'Generated from intake request',
            targetAudienceDescription: JSON.stringify({
              industries: context.targetIndustries || [],
              titles: context.targetTitles || [],
              regions: context.geographies || [],
            }),
            startDate: (updated.requestedStartDate || new Date()).toISOString().split('T')[0],
            createdBy: userId,
          })
          .returning();

        createdCampaign = campaign;

        // Update intake request with campaign ID
        await db
          .update(campaignIntakeRequests)
          .set({
            campaignId: campaign.id,
            status: 'in_progress',
            updatedAt: new Date(),
          })
          .where(eq(campaignIntakeRequests.id, id));

        // Update project status
        if (updated.projectId) {
          await db
            .update(clientProjects)
            .set({ status: 'active', updatedAt: new Date() })
            .where(eq(clientProjects.id, updated.projectId));
        }

        console.log('[Admin Agentic] Auto-created campaign:', campaign.id);
      } catch (campaignError: any) {
        console.error('[Admin Agentic] Auto-create campaign error:', campaignError);
        // Don't fail the QSO approval, just log the error
      }
    }

    res.json({
      success: true,
      data: updated,
      campaign: createdCampaign,
      message: createdCampaign
        ? `QSO approved and campaign created automatically (${createdCampaign.id})`
        : 'QSO status updated'
    });
  } catch (error: any) {
    console.error('[Admin Agentic] QSO update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== AGENTIC CAMPAIGN SESSIONS ====================

/**
 * Start a new agentic campaign creation session
 */
router.post('/agentic-campaign/start', requireAuth, async (req: Request, res: Response) => {
  try {
    const { intakeRequestId, clientAccountId, campaignType } = req.body;
    const userId = (req as any).user?.id;

    // If starting from intake request, update its status
    if (intakeRequestId) {
      await db
        .update(campaignIntakeRequests)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(eq(campaignIntakeRequests.id, intakeRequestId));
    }

    // Create new agentic session
    const [session] = await db
      .insert(agenticCampaignSessions)
      .values({
        intakeRequestId: intakeRequestId || null,
        currentStep: 'context',
        completedSteps: [],
        conversationHistory: [{
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Welcome! I'll help you create a powerful campaign. Let's start by understanding what you want to achieve.\n\nYou can:\n- Describe your campaign goals\n- Paste a landing page URL for context\n- Upload a campaign brief document\n- Tell me about your target audience\n\nWhat would you like to share first?`,
          timestamp: new Date().toISOString(),
        }],
        approvals: {},
        createdBy: userId,
      })
      .returning();

    res.json({ success: true, data: session });
  } catch (error: any) {
    console.error('[Admin Agentic] Start session error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get agentic session state
 */
router.get('/agentic-campaign/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [session] = await db
      .select()
      .from(agenticCampaignSessions)
      .where(eq(agenticCampaignSessions.id, id));

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    res.json({ success: true, data: session });
  } catch (error: any) {
    console.error('[Admin Agentic] Get session error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Chat with the agentic campaign creator
 */
router.post('/agentic-campaign/:id/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { message, inputType = 'text' } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    // Get current session
    const [session] = await db
      .select()
      .from(agenticCampaignSessions)
      .where(eq(agenticCampaignSessions.id, id));

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    // Build conversation context
    const conversationHistory = session.conversationHistory || [];

    // Generate AI response
    const systemPrompt = buildAgenticSystemPrompt(session);
    const messages = [
      ...conversationHistory.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        content: m.content,
      })),
      { role: 'user', content: message },
    ];

    const response = await vertexChat(systemPrompt, messages as any, { temperature: 0.7 });

    // Extract any structured data from the response
    const extractedData = await extractConfigurationFromResponse(response, session.currentStep || 'context');

    // Update session with new messages and extracted data
    const newMessage = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString(),
      inputType,
    };

    const assistantMessage = {
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      content: response,
      timestamp: new Date().toISOString(),
      extractedData,
    };

    const updatedHistory = [...conversationHistory, newMessage, assistantMessage];

    // Update step config if data was extracted
    const updateData: any = {
      conversationHistory: updatedHistory,
      updatedAt: new Date(),
    };

    if (extractedData && Object.keys(extractedData).length > 0) {
      const stepConfigKey = `${session.currentStep || 'context'}Config` as keyof typeof session;
      const existingConfig = (session[stepConfigKey] as Record<string, unknown>) || {};
      updateData[stepConfigKey] = { ...existingConfig, ...extractedData };
    }

    const [updated] = await db
      .update(agenticCampaignSessions)
      .set(updateData)
      .where(eq(agenticCampaignSessions.id, id))
      .returning();

    res.json({
      success: true,
      data: {
        response,
        extractedData,
        session: updated,
      },
    });
  } catch (error: any) {
    console.error('[Admin Agentic] Chat error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Streaming chat endpoint
 */
router.post('/agentic-campaign/:id/chat/stream', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    // Get current session
    const [session] = await db
      .select()
      .from(agenticCampaignSessions)
      .where(eq(agenticCampaignSessions.id, id));

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const systemPrompt = buildAgenticSystemPrompt(session);
    const conversationHistory = session.conversationHistory || [];
    const messages = [
      ...conversationHistory.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ];

    let fullResponse = '';
    for await (const chunk of streamChat(systemPrompt, messages as any, { temperature: 0.7 })) {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }

    // Save the conversation after streaming completes
    const newMessage = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString(),
    };

    const assistantMessage = {
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      content: fullResponse,
      timestamp: new Date().toISOString(),
    };

    await db
      .update(agenticCampaignSessions)
      .set({
        conversationHistory: [...conversationHistory, newMessage, assistantMessage],
        updatedAt: new Date(),
      })
      .where(eq(agenticCampaignSessions.id, id));

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error('[Admin Agentic] Stream chat error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

/**
 * Generate configuration for a specific step
 */
router.post('/agentic-campaign/:id/step/:step/generate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, step } = req.params;

    const [session] = await db
      .select()
      .from(agenticCampaignSessions)
      .where(eq(agenticCampaignSessions.id, id));

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    // Generate step-specific configuration
    const config = await generateStepConfiguration(session, step);

    // Update session with generated config
    const stepConfigKey = `${step}Config`;
    const [updated] = await db
      .update(agenticCampaignSessions)
      .set({
        [stepConfigKey]: config,
        updatedAt: new Date(),
      })
      .where(eq(agenticCampaignSessions.id, id))
      .returning();

    res.json({ success: true, data: { config, session: updated } });
  } catch (error: any) {
    console.error('[Admin Agentic] Generate step config error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Approve a step configuration
 */
router.post('/agentic-campaign/:id/step/:step/approve', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, step } = req.params;
    const { edits } = req.body; // Optional edits to apply before approval
    const userId = (req as any).user?.id;

    const [session] = await db
      .select()
      .from(agenticCampaignSessions)
      .where(eq(agenticCampaignSessions.id, id));

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const stepConfigKey = `${step}Config` as keyof AgenticCampaignSession;
    const currentConfig = (session[stepConfigKey] as any) || {};

    // Apply edits if provided
    const updatedConfig = {
      ...currentConfig,
      ...edits,
      _approved: true,
      _approvedAt: new Date().toISOString(),
      _approvedBy: userId,
    };

    // Update approvals object
    const approvals = (session.approvals as any) || {};
    approvals[step] = {
      approved: true,
      by: userId,
      at: new Date().toISOString(),
    };

    // Move to next step
    const steps = ['context', 'audience', 'voice', 'phone', 'content', 'review'];
    const currentIndex = steps.indexOf(step);
    const nextStep = currentIndex < steps.length - 1 ? steps[currentIndex + 1] : step;
    const completedSteps = [...(session.completedSteps || [])];
    if (!completedSteps.includes(step)) {
      completedSteps.push(step);
    }

    const [updated] = await db
      .update(agenticCampaignSessions)
      .set({
        [stepConfigKey]: updatedConfig,
        approvals,
        currentStep: nextStep as any,
        completedSteps,
        updatedAt: new Date(),
      })
      .where(eq(agenticCampaignSessions.id, id))
      .returning();

    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[Admin Agentic] Approve step error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Finalize and create the campaign
 */
router.post('/agentic-campaign/:id/finalize', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    const [session] = await db
      .select()
      .from(agenticCampaignSessions)
      .where(eq(agenticCampaignSessions.id, id));

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    // Validate all required steps are approved
    const requiredSteps = ['context', 'audience', 'content'];
    const approvals = (session.approvals as any) || {};
    const missingApprovals = requiredSteps.filter(step => !approvals[step]?.approved);

    if (missingApprovals.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Please approve all required sections: ${missingApprovals.join(', ')}`,
      });
    }

    // Create the campaign from session configuration
    const contextConfig = (session.contextConfig as any) || {};
    const audienceConfig = (session.audienceConfig as any) || {};
    const voiceConfig = (session.voiceConfig as any) || {};
    const contentConfig = (session.contentConfig as any) || {};

    // Get intake request if exists
    let clientAccountId = null;
    let projectId = null;
    if (session.intakeRequestId) {
      const [intakeRequest] = await db
        .select()
        .from(campaignIntakeRequests)
        .where(eq(campaignIntakeRequests.id, session.intakeRequestId));
      if (intakeRequest) {
        clientAccountId = intakeRequest.clientAccountId;
        projectId = intakeRequest.projectId;
      }
    }

    // Create campaign
    const [campaign] = await db
      .insert(campaigns)
      .values({
        name: contextConfig.objective?.slice(0, 100) || 'New Campaign',
        type: 'call',
        status: 'draft',
        clientAccountId,
        projectId,
        campaignObjective: contextConfig.objective,
        productServiceInfo: contextConfig.productServiceInfo,
        talkingPoints: contextConfig.talkingPoints,
        targetAudienceDescription: audienceConfig.industries?.join(', ') + ' - ' + audienceConfig.jobTitles?.join(', '),
        campaignObjections: contentConfig.objectionResponses,
        successCriteria: contextConfig.successCriteria,
        callScript: contentConfig.openingScript,
        aiAgentSettings: voiceConfig.voiceId ? {
          persona: {
            voice: voiceConfig.voiceId,
          },
          scripts: {
            opening: contentConfig.openingScript,
            pitch: contentConfig.pitchScript,
            closing: contentConfig.closingScript,
          },
        } : null,
        intakeRequestId: session.intakeRequestId,
        creationMode: 'agentic',
        ownerId: userId,
      })
      .returning();

    // Update session with campaign link
    await db
      .update(agenticCampaignSessions)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(agenticCampaignSessions.id, id));

    // Update intake request if exists
    if (session.intakeRequestId) {
      await db
        .update(campaignIntakeRequests)
        .set({
          status: 'completed',
          campaignId: campaign.id,
          updatedAt: new Date(),
        })
        .where(eq(campaignIntakeRequests.id, session.intakeRequestId));
    }

    res.json({ success: true, data: { campaign } });
  } catch (error: any) {
    console.error('[Admin Agentic] Finalize error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== CONTEXT EXTRACTION ====================

/**
 * Analyze URL for campaign context
 */
router.post('/agentic-campaign/:id/analyze-url', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, message: 'URL is required' });
    }

    // Fetch and analyze the URL content
    const analysisPrompt = `Analyze this URL for B2B campaign context: ${url}

Extract and return JSON with:
{
  "companyName": "string",
  "productOrService": "string",
  "valueProposition": "string",
  "targetAudience": "string",
  "keyFeatures": ["string"],
  "differentiators": ["string"],
  "suggestedObjective": "string",
  "confidence": 0.0-1.0
}`;

    const analysis = await generateJSON(analysisPrompt, { temperature: 0.3 }) as { productOrService?: string; suggestedObjective?: string };

    // Update session context
    const [session] = await db
      .select()
      .from(agenticCampaignSessions)
      .where(eq(agenticCampaignSessions.id, id));

    if (session) {
      const contextSources = (session as any).contextSources || { urls: [], documents: [], inputs: [] };
      contextSources.urls = [...(contextSources.urls || []), url];

      const contextConfig = (session.contextConfig as Record<string, unknown>) || {};

      await db
        .update(agenticCampaignSessions)
        .set({
          contextConfig: {
            ...contextConfig,
            productServiceInfo: analysis?.productOrService || contextConfig.productServiceInfo,
            objective: analysis?.suggestedObjective || contextConfig.objective,
          },
          updatedAt: new Date(),
        })
        .where(eq(agenticCampaignSessions.id, id));
    }

    res.json({ success: true, data: analysis });
  } catch (error: any) {
    console.error('[Admin Agentic] Analyze URL error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== VOICE OPTIONS ====================

/**
 * Get available voice options with metadata
 */
router.get('/voice-options', requireAuth, async (req: Request, res: Response) => {
  try {
    // Official Google Gemini Live TTS voices (30 available)
    const voiceOptions = [
      // Female voices
      { id: 'Kore', name: 'Kore', gender: 'female', tone: 'warm', description: 'Warm, professional voice ideal for executive outreach' },
      { id: 'Aoede', name: 'Aoede', gender: 'female', tone: 'bright', description: 'Bright, engaging voice for mid-market outreach' },
      { id: 'Leda', name: 'Leda', gender: 'female', tone: 'youthful', description: 'Youthful, consultative voice for high-value prospects' },
      { id: 'Callirrhoe', name: 'Callirrhoe', gender: 'female', tone: 'casual', description: 'Easy-going, casual voice for warm outreach' },
      { id: 'Autonoe', name: 'Autonoe', gender: 'female', tone: 'bright', description: 'Bright, balanced voice for friendly conversations' },
      { id: 'Despina', name: 'Despina', gender: 'female', tone: 'expressive', description: 'Smooth, expressive voice for storytelling' },
      { id: 'Erinome', name: 'Erinome', gender: 'female', tone: 'clear', description: 'Clear, precise voice for informative content' },
      { id: 'Laomedeia', name: 'Laomedeia', gender: 'female', tone: 'upbeat', description: 'Upbeat, dynamic voice for engaging presentations' },
      { id: 'Pulcherrima', name: 'Pulcherrima', gender: 'female', tone: 'forward', description: 'Forward, articulate voice for modern business' },
      { id: 'Vindemiatrix', name: 'Vindemiatrix', gender: 'female', tone: 'gentle', description: 'Gentle, refined voice for premium experiences' },
      { id: 'Achernar', name: 'Achernar', gender: 'female', tone: 'soft', description: 'Soft, intimate voice for personal connections' },
      // Male voices
      { id: 'Puck', name: 'Puck', gender: 'male', tone: 'upbeat', description: 'Upbeat, friendly voice for warm outreach' },
      { id: 'Charon', name: 'Charon', gender: 'male', tone: 'informative', description: 'Informative, authoritative voice for technical audiences' },
      { id: 'Fenrir', name: 'Fenrir', gender: 'male', tone: 'bold', description: 'Bold, confident voice for enterprise sales' },
      { id: 'Orus', name: 'Orus', gender: 'male', tone: 'firm', description: 'Firm, confident voice for professional settings' },
      { id: 'Zephyr', name: 'Zephyr', gender: 'male', tone: 'bright', description: 'Bright, optimistic voice for engaging content' },
      { id: 'Enceladus', name: 'Enceladus', gender: 'male', tone: 'clear', description: 'Clear, direct voice for straightforward messaging' },
      { id: 'Iapetus', name: 'Iapetus', gender: 'male', tone: 'clear', description: 'Clear, even voice for balanced communication' },
      { id: 'Umbriel', name: 'Umbriel', gender: 'male', tone: 'calm', description: 'Calm, reassuring voice for trust-building' },
      { id: 'Algieba', name: 'Algieba', gender: 'male', tone: 'smooth', description: 'Smooth, flowing voice for pleasant conversations' },
      { id: 'Algenib', name: 'Algenib', gender: 'male', tone: 'raspy', description: 'Raspy, distinctive voice for memorable pitches' },
      { id: 'Rasalgethi', name: 'Rasalgethi', gender: 'male', tone: 'informed', description: 'Informed, mature voice for executive discussions' },
      { id: 'Alnilam', name: 'Alnilam', gender: 'male', tone: 'firm', description: 'Firm, strong voice for authoritative presentations' },
      { id: 'Schedar', name: 'Schedar', gender: 'male', tone: 'even', description: 'Even, steady voice for professional calls' },
      { id: 'Gacrux', name: 'Gacrux', gender: 'male', tone: 'mature', description: 'Mature, experienced voice for senior audiences' },
      { id: 'Achird', name: 'Achird', gender: 'male', tone: 'friendly', description: 'Friendly, approachable voice for relationship building' },
      { id: 'Zubenelgenubi', name: 'Zubenelgenubi', gender: 'male', tone: 'casual', description: 'Casual, conversational voice for informal settings' },
      { id: 'Sadachbia', name: 'Sadachbia', gender: 'male', tone: 'lively', description: 'Lively, energetic voice for dynamic outreach' },
      { id: 'Sadaltager', name: 'Sadaltager', gender: 'male', tone: 'knowledgeable', description: 'Knowledgeable, articulate voice for consultative sales' },
      { id: 'Sulafat', name: 'Sulafat', gender: 'male', tone: 'warm', description: 'Warm, engaging voice for nurturing prospects' },
    ];

    res.json({ success: true, data: voiceOptions });
  } catch (error: any) {
    console.error('[Admin Agentic] Voice options error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== HELPER FUNCTIONS ====================

function buildAgenticSystemPrompt(session: AgenticCampaignSession): string {
  const currentStep = session.currentStep;
  const contextConfig = (session.contextConfig as any) || {};
  const audienceConfig = (session.audienceConfig as any) || {};

  return `You are an expert B2B campaign strategist helping to configure a demand generation campaign.

Current Step: ${currentStep}
${contextConfig.objective ? `Campaign Objective: ${contextConfig.objective}` : ''}
${contextConfig.productServiceInfo ? `Product/Service: ${contextConfig.productServiceInfo}` : ''}
${audienceConfig.industries?.length ? `Target Industries: ${audienceConfig.industries.join(', ')}` : ''}
${audienceConfig.jobTitles?.length ? `Target Titles: ${audienceConfig.jobTitles.join(', ')}` : ''}

Step-specific guidance:
${currentStep === 'context' ? 'Help gather campaign context: objectives, product info, success criteria. Extract structured data from user input.' : ''}
${currentStep === 'audience' ? 'Help define target audience: industries, job titles, company size, regions. Suggest expansions.' : ''}
${currentStep === 'voice' ? 'Help select the right voice: recommend based on campaign context and target audience.' : ''}
${currentStep === 'phone' ? 'Help configure phone settings: recommend appropriate phone number and caller ID.' : ''}
${currentStep === 'content' ? 'Help generate content: opening scripts, talking points, objection responses.' : ''}
${currentStep === 'review' ? 'Help review the complete configuration before creating the campaign.' : ''}

Be conversational, professional, and guide the user step by step. Extract structured data when possible.`;
}

async function extractConfigurationFromResponse(response: string, currentStep: string): Promise<Record<string, any>> {
  try {
    // Use AI to extract any structured data from the response
    const extractionPrompt = `Extract any campaign configuration data from this response for the "${currentStep}" step.

Response: "${response}"

Return ONLY valid JSON with relevant fields, or empty object {} if no structured data found.
For context step: { objective, productServiceInfo, successCriteria, talkingPoints }
For audience step: { industries, regions, jobTitles, companySizeMin, companySizeMax, seniorityLevels }
For voice step: { voiceId, voiceName, voiceGender, voiceTone }
For content step: { openingScript, pitchScript, objectionResponses, closingScript }`;

    const extracted = await generateJSON(extractionPrompt, { temperature: 0.1 });
    return extracted || {};
  } catch (error) {
    console.error('[Admin Agentic] Extraction error:', error);
    return {};
  }
}

async function generateStepConfiguration(session: AgenticCampaignSession, step: string): Promise<Record<string, any>> {
  const contextConfig = (session.contextConfig as any) || {};
  const audienceConfig = (session.audienceConfig as any) || {};
  const conversationHistory = session.conversationHistory || [];

  // Build context from conversation
  const conversationContext = conversationHistory
    .map((m: any) => `${m.role}: ${m.content}`)
    .join('\n');

  const prompts: Record<string, string> = {
    context: `Based on the conversation, generate campaign context configuration:
${conversationContext}

Return JSON:
{
  "objective": "clear campaign objective",
  "productServiceInfo": "product/service being promoted",
  "successCriteria": "what defines success",
  "talkingPoints": ["key point 1", "key point 2"]
}`,
    audience: `Based on the campaign context, generate audience configuration:
Objective: ${contextConfig.objective}
Product: ${contextConfig.productServiceInfo}
${conversationContext}

Return JSON:
{
  "industries": ["industry1", "industry2"],
  "regions": ["region1"],
  "jobTitles": ["title1", "title2"],
  "seniorityLevels": ["senior", "director", "vp", "c_level"]
}`,
    voice: `Recommend the best voice for this campaign:
Objective: ${contextConfig.objective}
Target: ${audienceConfig.jobTitles?.join(', ')}

Return JSON:
{
  "voiceId": "recommended_voice_id",
  "voiceName": "Voice Name",
  "voiceGender": "male|female",
  "voiceTone": "tone description",
  "reasoning": "why this voice is recommended"
}`,
    content: `Generate campaign content:
Objective: ${contextConfig.objective}
Product: ${contextConfig.productServiceInfo}
Target: ${audienceConfig.jobTitles?.join(', ')}

Return JSON:
{
  "openingScript": "Hello, this is...",
  "pitchScript": "The reason I'm calling...",
  "objectionResponses": [{"objection": "I'm not interested", "response": "I understand..."}],
  "closingScript": "Would you be open to..."
}`,
  };

  const prompt = prompts[step];
  if (!prompt) {
    return {};
  }

  return await generateJSON(prompt, { temperature: 0.4 });
}

// ==================== CAMPAIGN MIGRATION ====================

/**
 * Get migration status - shows campaigns that need migration
 */
router.get('/migration/status', requireAuth, async (req: Request, res: Response) => {
  try {
    // Get counts for migration status
    const [totalCampaigns] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaigns);

    const [legacyCampaigns] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(isNull(campaigns.creationMode));

    const [manualCampaigns] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(eq(campaigns.creationMode, 'manual'));

    const [agenticCampaigns] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(eq(campaigns.creationMode, 'agentic'));

    const [campaignsWithoutIntake] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(and(
        isNotNull(campaigns.clientAccountId),
        isNull(campaigns.intakeRequestId)
      ));

    const [campaignsWithoutChannels] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(isNull(campaigns.enabledChannels));

    // Get sample legacy campaigns for preview
    const sampleLegacy = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        type: campaigns.type,
        status: campaigns.status,
        clientAccountId: campaigns.clientAccountId,
        creationMode: campaigns.creationMode,
        createdAt: campaigns.createdAt,
      })
      .from(campaigns)
      .where(isNull(campaigns.creationMode))
      .limit(10);

    res.json({
      success: true,
      data: {
        summary: {
          total: totalCampaigns?.count || 0,
          needsMigration: legacyCampaigns?.count || 0,
          manual: manualCampaigns?.count || 0,
          agentic: agenticCampaigns?.count || 0,
          withoutIntake: campaignsWithoutIntake?.count || 0,
          withoutChannels: campaignsWithoutChannels?.count || 0,
        },
        sampleLegacyCampaigns: sampleLegacy,
        migrationRequired: (legacyCampaigns?.count || 0) > 0,
      },
    });
  } catch (error: any) {
    console.error('[Admin Agentic] Migration status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Run campaign migration - migrates legacy campaigns to new system
 */
router.post('/migration/run', requireAuth, async (req: Request, res: Response) => {
  try {
    const { dryRun = false } = req.body;
    const userId = (req as any).user?.id;

    console.log(`[Migration] Starting campaign migration (dryRun: ${dryRun})`);

    // Track migration results
    const results = {
      creationModeUpdated: 0,
      enabledChannelsSet: 0,
      projectDataPopulated: 0,
      dialModeSet: 0,
      channelStatusInitialized: 0,
      intakeRequestsCreated: 0,
      intakeLinksUpdated: 0,
      errors: [] as string[],
    };

    // Step 1: Set creation_mode to 'manual' for legacy campaigns
    const legacyCampaigns = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(isNull(campaigns.creationMode));

    if (!dryRun && legacyCampaigns.length > 0) {
      await db
        .update(campaigns)
        .set({ creationMode: 'manual', updatedAt: new Date() })
        .where(isNull(campaigns.creationMode));
    }
    results.creationModeUpdated = legacyCampaigns.length;

    // Step 2: Set enabled_channels based on campaign type
    const campaignsWithoutChannels = await db
      .select({ id: campaigns.id, type: campaigns.type })
      .from(campaigns)
      .where(isNull(campaigns.enabledChannels));

    if (!dryRun) {
      for (const camp of campaignsWithoutChannels) {
        const channelsForType = camp.type === 'email' ? ['email'] :
                               camp.type === 'combo' ? ['voice', 'email'] :
                               ['voice'];
        await db
          .update(campaigns)
          .set({ enabledChannels: channelsForType, updatedAt: new Date() })
          .where(eq(campaigns.id, camp.id));
      }
    }
    results.enabledChannelsSet = campaignsWithoutChannels.length;

    // Step 3: Populate project data (landing_page_url, project_file_url)
    const campaignsWithProjects = await db
      .select({
        campaignId: campaigns.id,
        projectId: campaigns.projectId,
        campaignLandingPage: campaigns.landingPageUrl,
        campaignProjectFile: campaigns.projectFileUrl,
      })
      .from(campaigns)
      .where(and(
        isNotNull(campaigns.projectId),
        sql`(${campaigns.landingPageUrl} IS NULL OR ${campaigns.projectFileUrl} IS NULL)`
      ));

    if (!dryRun) {
      for (const camp of campaignsWithProjects) {
        if (camp.projectId) {
          const [project] = await db
            .select({
              landingPageUrl: clientProjects.landingPageUrl,
              projectFileUrl: clientProjects.projectFileUrl,
            })
            .from(clientProjects)
            .where(eq(clientProjects.id, camp.projectId));

          if (project) {
            await db
              .update(campaigns)
              .set({
                landingPageUrl: camp.campaignLandingPage || project.landingPageUrl,
                projectFileUrl: camp.campaignProjectFile || project.projectFileUrl,
                updatedAt: new Date(),
              })
              .where(eq(campaigns.id, camp.campaignId));
          }
        }
      }
    }
    results.projectDataPopulated = campaignsWithProjects.length;

    // Step 4: Set dial_mode for campaigns without it
    const campaignsWithoutDialMode = await db
      .select({ id: campaigns.id, type: campaigns.type })
      .from(campaigns)
      .where(isNull(campaigns.dialMode));

    if (!dryRun) {
      for (const camp of campaignsWithoutDialMode) {
        const dialModeForType = ['email', 'content_syndication'].includes(camp.type) ? 'manual' : 'ai_agent';
        await db
          .update(campaigns)
          .set({ dialMode: dialModeForType as any, updatedAt: new Date() })
          .where(eq(campaigns.id, camp.id));
      }
    }
    results.dialModeSet = campaignsWithoutDialMode.length;

    // Step 5: Initialize channel_generation_status
    const campaignsWithoutChannelStatus = await db
      .select({ id: campaigns.id, enabledChannels: campaigns.enabledChannels })
      .from(campaigns)
      .where(isNull(campaigns.channelGenerationStatus));

    if (!dryRun) {
      for (const camp of campaignsWithoutChannelStatus) {
        const channels = camp.enabledChannels || ['voice'];
        const status: Record<string, string> = {};
        if (channels.includes('voice')) status.voice = 'pending';
        if (channels.includes('email')) status.email = 'pending';

        await db
          .update(campaigns)
          .set({ channelGenerationStatus: status, updatedAt: new Date() })
          .where(eq(campaigns.id, camp.id));
      }
    }
    results.channelStatusInitialized = campaignsWithoutChannelStatus.length;

    // Step 6: Create intake requests for campaigns with client associations but no intake
    const campaignsNeedingIntake = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        type: campaigns.type,
        clientAccountId: campaigns.clientAccountId,
        projectId: campaigns.projectId,
        campaignObjective: campaigns.campaignObjective,
        productServiceInfo: campaigns.productServiceInfo,
        successCriteria: campaigns.successCriteria,
        targetAudienceDescription: campaigns.targetAudienceDescription,
        targetQualifiedLeads: campaigns.targetQualifiedLeads,
        enabledChannels: campaigns.enabledChannels,
        createdAt: campaigns.createdAt,
      })
      .from(campaigns)
      .where(and(
        isNotNull(campaigns.clientAccountId),
        isNull(campaigns.intakeRequestId)
      ));

    if (!dryRun) {
      for (const camp of campaignsNeedingIntake) {
        try {
          // Check if intake already exists for this campaign
          const [existingIntake] = await db
            .select({ id: campaignIntakeRequests.id })
            .from(campaignIntakeRequests)
            .where(eq(campaignIntakeRequests.campaignId, camp.id));

          if (!existingIntake) {
            const [newIntake] = await db
              .insert(campaignIntakeRequests)
              .values({
                sourceType: 'api',
                clientAccountId: camp.clientAccountId,
                projectId: camp.projectId,
                campaignId: camp.id,
                status: 'completed',
                priority: 'normal',
                rawInput: {
                  migratedFromLegacy: true,
                  originalCampaignName: camp.name,
                  originalCampaignType: camp.type,
                  migratedAt: new Date().toISOString(),
                  migratedBy: userId,
                },
                extractedContext: {
                  objective: camp.campaignObjective || 'Migrated campaign - objective not specified',
                  productServiceInfo: camp.productServiceInfo,
                  successCriteria: camp.successCriteria,
                  targetAudienceDescription: camp.targetAudienceDescription,
                },
                campaignType: camp.type,
                requestedLeadCount: camp.targetQualifiedLeads,
                requestedChannels: camp.enabledChannels || ['voice'],
              })
              .returning();

            if (newIntake) {
              // Link back to campaign
              await db
                .update(campaigns)
                .set({ intakeRequestId: newIntake.id, updatedAt: new Date() })
                .where(eq(campaigns.id, camp.id));

              results.intakeLinksUpdated++;
            }
            results.intakeRequestsCreated++;
          }
        } catch (intakeError: any) {
          results.errors.push(`Failed to create intake for campaign ${camp.id}: ${intakeError.message}`);
        }
      }
    } else {
      results.intakeRequestsCreated = campaignsNeedingIntake.length;
      results.intakeLinksUpdated = campaignsNeedingIntake.length;
    }

    console.log('[Migration] Complete:', results);

    res.json({
      success: true,
      dryRun,
      data: results,
      message: dryRun
        ? 'Dry run complete. No changes made. Run with dryRun: false to apply changes.'
        : 'Migration complete. All campaigns have been updated to work with the new agentic system.',
    });
  } catch (error: any) {
    console.error('[Admin Agentic] Migration run error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get campaigns list with new agentic fields for verification
 */
router.get('/campaigns', requireAuth, async (req: Request, res: Response) => {
  try {
    const { limit = '50', offset = '0', status, creationMode } = req.query;

    let query = db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        type: campaigns.type,
        status: campaigns.status,
        clientAccountId: campaigns.clientAccountId,
        clientAccountName: clientAccounts.name,
        projectId: campaigns.projectId,
        creationMode: campaigns.creationMode,
        intakeRequestId: campaigns.intakeRequestId,
        enabledChannels: campaigns.enabledChannels,
        channelGenerationStatus: campaigns.channelGenerationStatus,
        dialMode: campaigns.dialMode,
        landingPageUrl: campaigns.landingPageUrl,
        projectFileUrl: campaigns.projectFileUrl,
        campaignObjective: campaigns.campaignObjective,
        targetQualifiedLeads: campaigns.targetQualifiedLeads,
        createdAt: campaigns.createdAt,
        updatedAt: campaigns.updatedAt,
      })
      .from(campaigns)
      .leftJoin(clientAccounts, eq(campaigns.clientAccountId, clientAccounts.id))
      .orderBy(desc(campaigns.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    // Apply filters
    const conditions = [];
    if (status) {
      conditions.push(eq(campaigns.status, status as any));
    }
    if (creationMode) {
      conditions.push(eq(campaigns.creationMode, creationMode as string));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const campaignList = await query;

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaigns);

    res.json({
      success: true,
      data: campaignList,
      pagination: {
        total: countResult?.count || 0,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error: any) {
    console.error('[Admin Agentic] List campaigns error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
