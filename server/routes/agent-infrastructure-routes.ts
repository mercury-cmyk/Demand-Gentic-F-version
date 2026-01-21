/**
 * Agent Infrastructure API Routes
 * 
 * Exposes agent infrastructure functionality via REST API.
 */

import { Router, Request, Response } from 'express';
import { 
  agentRegistry, 
  agentGovernance, 
  coreEmailAgent, 
  coreVoiceAgent,
  coreComplianceAgent,
  coreDataManagementAgent,
  getAgentInfrastructureStatus,
  GOVERNANCE_POLICIES,
  FOUNDATIONAL_PROMPTS,
} from '../services/agents';
import type { AgentCampaignContext, AgentContactContext } from '../services/agents/types';

const router = Router();

// ==================== STATUS & INFO ====================

/**
 * GET /api/agents/status
 * Get agent infrastructure status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = getAgentInfrastructureStatus();
    res.json(status);
  } catch (error: any) {
    console.error('[AgentRoutes] Error getting status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/agents/list
 * List all registered agents
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const agents = agentRegistry.getAllAgents().map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      channel: agent.channel,
      status: agent.status,
      promptVersion: agent.promptVersion,
    }));
    res.json({ agents });
  } catch (error: any) {
    console.error('[AgentRoutes] Error listing agents:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/agents/:agentId
 * Get details for a specific agent
 */
router.get('/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const agent = agentRegistry.getAgent(agentId);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const governanceRecord = agentGovernance.getRecord(agentId);

    res.json({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      channel: agent.channel,
      status: agent.status,
      promptVersion: agent.promptVersion,
      knowledgeSections: agent.getKnowledgeSections().map(s => ({
        id: s.id,
        name: s.name,
        category: s.category,
        priority: s.priority,
        isRequired: s.isRequired,
      })),
      governance: governanceRecord ? {
        isLocked: governanceRecord.isLocked,
        lockedBy: governanceRecord.lockedBy,
        lockedAt: governanceRecord.lockedAt,
        versionHistory: governanceRecord.versionHistory.slice(0, 10),
      } : null,
    });
  } catch (error: any) {
    console.error('[AgentRoutes] Error getting agent:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== EMAIL AGENT ====================

/**
 * POST /api/agents/email/generate
 * Generate an email using the Core Email Agent
 */
router.post('/email/generate', async (req: Request, res: Response) => {
  try {
    const { 
      campaignContext, 
      contactContext, 
      organizationIntelligence,
      additionalInstructions 
    } = req.body as {
      campaignContext?: AgentCampaignContext;
      contactContext?: AgentContactContext;
      organizationIntelligence?: string;
      additionalInstructions?: string;
    };

    if (!campaignContext) {
      return res.status(400).json({ error: 'campaignContext is required' });
    }

    const result = await coreEmailAgent.execute({
      agentId: coreEmailAgent.id,
      campaignContext,
      contactContext,
      organizationIntelligence,
      additionalInstructions,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[AgentRoutes] Error generating email:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/agents/email/generate-followup
 * Generate a follow-up email
 */
router.post('/email/generate-followup', async (req: Request, res: Response) => {
  try {
    const { 
      campaignContext, 
      previousEmailContext, 
      followUpNumber 
    } = req.body as {
      campaignContext: AgentCampaignContext;
      previousEmailContext: string;
      followUpNumber: number;
    };

    if (!campaignContext || !previousEmailContext || !followUpNumber) {
      return res.status(400).json({ 
        error: 'campaignContext, previousEmailContext, and followUpNumber are required' 
      });
    }

    const result = await coreEmailAgent.generateFollowUpEmail(
      campaignContext,
      previousEmailContext,
      followUpNumber
    );

    res.json(result);
  } catch (error: any) {
    console.error('[AgentRoutes] Error generating follow-up:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/agents/email/generate-transactional
 * Generate a transactional email
 */
router.post('/email/generate-transactional', async (req: Request, res: Response) => {
  try {
    const { type, context } = req.body as {
      type: 'confirmation' | 'notification' | 'reminder' | 'digest';
      context: {
        recipientName?: string;
        subject: string;
        mainMessage: string;
        actionRequired?: string;
        actionUrl?: string;
      };
    };

    if (!type || !context || !context.subject || !context.mainMessage) {
      return res.status(400).json({ 
        error: 'type and context (with subject and mainMessage) are required' 
      });
    }

    const result = await coreEmailAgent.generateTransactionalEmail(type, context);
    res.json(result);
  } catch (error: any) {
    console.error('[AgentRoutes] Error generating transactional email:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== VOICE AGENT ====================

/**
 * POST /api/agents/voice/build-prompt
 * Build a complete prompt for voice call
 */
router.post('/voice/build-prompt', async (req: Request, res: Response) => {
  try {
    const { 
      campaignContext, 
      contactContext, 
      organizationIntelligence,
      problemIntelligence,
      additionalInstructions 
    } = req.body as {
      campaignContext?: AgentCampaignContext;
      contactContext?: AgentContactContext;
      organizationIntelligence?: string;
      problemIntelligence?: string;
      additionalInstructions?: string;
    };

    const result = await coreVoiceAgent.execute({
      agentId: coreVoiceAgent.id,
      campaignContext,
      contactContext,
      organizationIntelligence,
      problemIntelligence,
      additionalInstructions,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[AgentRoutes] Error building voice prompt:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/agents/voice/first-message
 * Get the first message for a voice call
 */
router.post('/voice/first-message', async (req: Request, res: Response) => {
  try {
    const { contactContext } = req.body as {
      contactContext?: AgentContactContext;
    };

    const firstMessage = coreVoiceAgent.buildFirstMessage(contactContext);
    const validation = coreVoiceAgent.validateOpeningVariables(contactContext);

    res.json({
      firstMessage,
      validation,
    });
  } catch (error: any) {
    console.error('[AgentRoutes] Error building first message:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== COMPLIANCE AGENT ====================

/**
 * POST /api/agents/compliance/build-prompt
 * Build a complete compliance prompt
 */
router.post('/compliance/build-prompt', async (req: Request, res: Response) => {
  try {
    const {
      campaignContext,
      contactContext,
      organizationIntelligence,
      problemIntelligence,
      additionalInstructions,
    } = req.body as {
      campaignContext?: AgentCampaignContext;
      contactContext?: AgentContactContext;
      organizationIntelligence?: string;
      problemIntelligence?: string;
      additionalInstructions?: string;
    };

    const result = await coreComplianceAgent.execute({
      agentId: coreComplianceAgent.id,
      campaignContext,
      contactContext,
      organizationIntelligence,
      problemIntelligence,
      additionalInstructions,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[AgentRoutes] Error building compliance prompt:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== DATA MANAGEMENT AGENT ====================

/**
 * POST /api/agents/data-management/build-prompt
 * Build a complete data management prompt
 */
router.post('/data-management/build-prompt', async (req: Request, res: Response) => {
  try {
    const {
      campaignContext,
      contactContext,
      organizationIntelligence,
      problemIntelligence,
      additionalInstructions,
    } = req.body as {
      campaignContext?: AgentCampaignContext;
      contactContext?: AgentContactContext;
      organizationIntelligence?: string;
      problemIntelligence?: string;
      additionalInstructions?: string;
    };

    const result = await coreDataManagementAgent.execute({
      agentId: coreDataManagementAgent.id,
      campaignContext,
      contactContext,
      organizationIntelligence,
      problemIntelligence,
      additionalInstructions,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[AgentRoutes] Error building data management prompt:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== GOVERNANCE ====================

/**
 * GET /api/agents/governance/policies
 * Get governance policies
 */
router.get('/governance/policies', async (req: Request, res: Response) => {
  try {
    res.json({ policies: GOVERNANCE_POLICIES });
  } catch (error: any) {
    console.error('[AgentRoutes] Error getting policies:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/agents/governance/audit
 * Get governance audit log
 */
router.get('/governance/audit', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const auditLog = agentGovernance.getAuditLog(limit);
    res.json({ auditLog });
  } catch (error: any) {
    console.error('[AgentRoutes] Error getting audit log:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/agents/governance/verify/:agentId
 * Verify agent integrity
 */
router.post('/governance/verify/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const agent = agentRegistry.getAgent(agentId);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const integrity = agentGovernance.verifyIntegrity(agent);
    res.json(integrity);
  } catch (error: any) {
    console.error('[AgentRoutes] Error verifying integrity:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/agents/governance/lock/:agentId
 * Lock an agent
 */
router.post('/governance/lock/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { userId, reason } = req.body as { userId: string; reason?: string };

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const success = agentGovernance.lockAgent(agentId, userId, reason);
    
    if (!success) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ success: true, message: `Agent ${agentId} locked` });
  } catch (error: any) {
    console.error('[AgentRoutes] Error locking agent:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/agents/governance/unlock/:agentId
 * Unlock an agent
 */
router.post('/governance/unlock/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { userId } = req.body as { userId: string };

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const success = agentGovernance.unlockAgent(agentId, userId);
    
    if (!success) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ success: true, message: `Agent ${agentId} unlocked` });
  } catch (error: any) {
    console.error('[AgentRoutes] Error unlocking agent:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== PROMPTS ====================

/**
 * GET /api/agents/prompts
 * Get all foundational prompts
 */
router.get('/prompts', async (req: Request, res: Response) => {
  try {
    const prompts = Object.entries(FOUNDATIONAL_PROMPTS).map(([id, prompt]) => ({
      id,
      name: prompt.name,
      channel: prompt.channel,
      version: prompt.version,
      // Truncate prompt content for list view
      promptPreview: prompt.prompt.slice(0, 200) + '...',
    }));
    res.json({ prompts });
  } catch (error: any) {
    console.error('[AgentRoutes] Error getting prompts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/agents/prompts/:agentId
 * Get full foundational prompt for an agent
 */
router.get('/prompts/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const prompt = FOUNDATIONAL_PROMPTS[agentId as keyof typeof FOUNDATIONAL_PROMPTS];

    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    res.json(prompt);
  } catch (error: any) {
    console.error('[AgentRoutes] Error getting prompt:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
