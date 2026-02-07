/**
 * Call Flow Management Routes
 *
 * Admin routes for managing call flows and campaign type mappings.
 * These endpoints allow:
 * - Viewing all available call flows with full details
 * - Getting/setting campaign type to call flow mappings
 * - CRUD operations on custom call flows
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../auth';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import {
  getAllDefaultCallFlows,
  getDefaultCallFlowForCampaignType,
  CAMPAIGN_TYPE_CALL_FLOWS,
  validateCallFlow,
  type CallFlow,
  type CallFlowStep,
} from '../services/call-flow-defaults';
import { customCallFlows, customCallFlowMappings } from '@shared/schema';
import { randomUUID } from 'crypto';

const router = Router();

/**
 * Helper to get all flows (system + custom)
 */
async function getAllFlows(): Promise<CallFlow[]> {
  const systemFlows = getAllDefaultCallFlows();
  console.log(`[CALL FLOW MANAGEMENT] System flows loaded: ${systemFlows.length}`);
  
  let customRows: Array<typeof customCallFlows.$inferSelect> = [];

  try {
    customRows = await db
      .select()
      .from(customCallFlows)
      .where(eq(customCallFlows.isActive, true));
    console.log(`[CALL FLOW MANAGEMENT] Custom flows from DB: ${customRows.length}`);
  } catch (error) {
    console.warn('[CALL FLOW MANAGEMENT] Custom call flow fetch failed, using system flows only:', error);
    customRows = [];
  }

  const customFlowList: CallFlow[] = customRows.map((row) => ({
    id: row.id,
    name: row.name,
    objective: row.objective,
    successCriteria: row.successCriteria,
    maxTotalTurns: row.maxTotalTurns ?? 20,
    steps: (row.steps as CallFlowStep[]) ?? [],
    isDefault: false,
    isSystemFlow: false,
    version: row.version ?? 1,
  }));

  return [...systemFlows, ...customFlowList];
}

async function getCustomFlowById(flowId: string): Promise<CallFlow | null> {
  const [row] = await db
    .select()
    .from(customCallFlows)
    .where(eq(customCallFlows.id, flowId))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    objective: row.objective,
    successCriteria: row.successCriteria,
    maxTotalTurns: row.maxTotalTurns ?? 20,
    steps: (row.steps as CallFlowStep[]) ?? [],
    isDefault: false,
    isSystemFlow: false,
    version: row.version ?? 1,
  };
}

async function getCustomMapping(campaignType: string): Promise<string | null> {
  try {
    // First, let's see ALL mappings in the table for debugging
    const allMappings = await db
      .select()
      .from(customCallFlowMappings);
    console.log(`[CALL FLOW MANAGEMENT] All mappings in DB:`, JSON.stringify(allMappings, null, 2));

    const [row] = await db
      .select({ callFlowId: customCallFlowMappings.callFlowId })
      .from(customCallFlowMappings)
      .where(eq(customCallFlowMappings.campaignType, campaignType))
      .limit(1);

    console.log(`[CALL FLOW MANAGEMENT] getCustomMapping(${campaignType}): found ${row ? row.callFlowId : 'nothing'}`);
    return row?.callFlowId ?? null;
  } catch (error) {
    console.error(`[CALL FLOW MANAGEMENT] getCustomMapping error for ${campaignType}:`, error);
    return null;
  }
}

// All campaign types that can have call flows
const ALL_CAMPAIGN_TYPES = [
  'appointment_generation',
  'sql',
  'telemarketing',
  'high_quality_leads',
  'live_webinar',
  'on_demand_webinar',
  'content_syndication',
  'executive_dinner',
  'leadership_forum',
  'conference',
  'call',
  'combo',
  'email',
];

/**
 * GET /api/call-flows/all - Get all available call flows with full details
 */
router.get('/all', requireAuth, async (req: Request, res: Response) => {
  try {
    console.log('[CALL FLOW MANAGEMENT] Fetching all call flows...');
    const callFlows = await getAllFlows();
    console.log(`[CALL FLOW MANAGEMENT] Returning ${callFlows.length} call flows (${callFlows.filter(f => f.isSystemFlow).length} system, ${callFlows.filter(f => !f.isSystemFlow).length} custom)`);
    res.json({
      success: true,
      callFlows,
    });
  } catch (error) {
    console.error('[CALL FLOW MANAGEMENT] Get all call flows error:', error);
    res.status(500).json({ message: 'Failed to fetch call flows' });
  }
});

/**
 * GET /api/call-flows/mappings - Get all campaign type to call flow mappings
 */
router.get('/mappings', requireAuth, async (req: Request, res: Response) => {
  try {
    console.log('[CALL FLOW MANAGEMENT] Fetching mappings...');
    const allFlows = await getAllFlows();
    console.log(`[CALL FLOW MANAGEMENT] Got ${allFlows.length} flows for mapping lookup`);
    const flowMap = new Map(allFlows.map(f => [f.id, f]));

    let mappingRows: Array<{ campaignType: string; callFlowId: string }> = [];

    try {
      mappingRows = await db
        .select({
          campaignType: customCallFlowMappings.campaignType,
          callFlowId: customCallFlowMappings.callFlowId,
        })
        .from(customCallFlowMappings);
      console.log(`[CALL FLOW MANAGEMENT] Custom mappings from DB: ${mappingRows.length}`);
    } catch (error) {
      console.warn('[CALL FLOW MANAGEMENT] Custom mapping fetch failed, using defaults only:', error);
      mappingRows = [];
    }

    const mappingMap = new Map(mappingRows.map(row => [row.campaignType, row.callFlowId]));

    const mappings = ALL_CAMPAIGN_TYPES.map(campaignType => {
      // Check for custom mapping first, then use default
      const customFlowId = mappingMap.get(campaignType);
      let callFlowId: string;
      let callFlowName: string;

      if (customFlowId && flowMap.has(customFlowId)) {
        callFlowId = customFlowId;
        callFlowName = flowMap.get(customFlowId)!.name;
      } else {
        // Use default mapping
        const defaultFlow = CAMPAIGN_TYPE_CALL_FLOWS[campaignType];
        if (defaultFlow) {
          callFlowId = defaultFlow.id;
          callFlowName = defaultFlow.name;
        } else {
          // Fallback to generic
          const genericFlow = getDefaultCallFlowForCampaignType(campaignType);
          callFlowId = genericFlow.id;
          callFlowName = genericFlow.name;
        }
      }

      return {
        campaignType,
        callFlowId,
        callFlowName,
        isCustomMapping: !!customFlowId,
      };
    });

    console.log(`[CALL FLOW MANAGEMENT] Returning ${mappings.length} mappings, sample:`, mappings[0]);
    res.json({
      success: true,
      mappings,
    });
  } catch (error) {
    console.error('[CALL FLOW MANAGEMENT] Get mappings error:', error);
    res.status(500).json({ message: 'Failed to fetch mappings' });
  }
});

/**
 * POST /api/call-flows/mappings - Update a campaign type to call flow mapping
 */
router.post('/mappings', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { campaignType, callFlowId } = req.body;

    if (!campaignType || !callFlowId) {
      return res.status(400).json({ message: 'Campaign type and call flow ID are required' });
    }

    if (!ALL_CAMPAIGN_TYPES.includes(campaignType)) {
      return res.status(400).json({ message: `Invalid campaign type: ${campaignType}` });
    }

    // Validate that the call flow exists (check both system and custom flows)
    const allFlows = await getAllFlows();
    const flowExists = allFlows.some(f => f.id === callFlowId);
    if (!flowExists) {
      return res.status(400).json({ message: `Invalid call flow ID: ${callFlowId}` });
    }

    // Save the custom mapping (upsert)
    console.log(`[CALL FLOW MANAGEMENT] Saving mapping: ${campaignType} -> ${callFlowId}`);
    await db
      .insert(customCallFlowMappings)
      .values({
        campaignType,
        callFlowId,
        updatedBy: req.user?.userId || null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: customCallFlowMappings.campaignType,
        set: {
          callFlowId,
          updatedBy: req.user?.userId || null,
          updatedAt: new Date(),
        },
      });

    console.log(`[CALL FLOW MANAGEMENT] Mapping saved successfully: ${campaignType} -> ${callFlowId}`);
    const flow = allFlows.find(f => f.id === callFlowId)!;

    res.json({
      success: true,
      message: 'Mapping updated successfully',
      mapping: {
        campaignType,
        callFlowId,
        callFlowName: flow.name,
        isCustomMapping: true,
      },
    });
  } catch (error) {
    console.error('[CALL FLOW MANAGEMENT] Update mapping error:', error);
    res.status(500).json({ message: 'Failed to update mapping' });
  }
});

/**
 * DELETE /api/call-flows/mappings/:campaignType - Reset mapping to default
 */
router.delete('/mappings/:campaignType', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { campaignType } = req.params;

    if (!ALL_CAMPAIGN_TYPES.includes(campaignType)) {
      return res.status(400).json({ message: `Invalid campaign type: ${campaignType}` });
    }

    // Remove custom mapping (will revert to default)
    await db
      .delete(customCallFlowMappings)
      .where(eq(customCallFlowMappings.campaignType, campaignType));

    const defaultFlow = getDefaultCallFlowForCampaignType(campaignType);

    res.json({
      success: true,
      message: 'Mapping reset to default',
      mapping: {
        campaignType,
        callFlowId: defaultFlow.id,
        callFlowName: defaultFlow.name,
        isCustomMapping: false,
      },
    });
  } catch (error) {
    console.error('[CALL FLOW MANAGEMENT] Reset mapping error:', error);
    res.status(500).json({ message: 'Failed to reset mapping' });
  }
});

/**
 * GET /api/call-flows/:flowId - Get a specific call flow by ID
 */
router.get('/:flowId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { flowId } = req.params;
    const systemFlow = getAllDefaultCallFlows().find(f => f.id === flowId);
    const flow = systemFlow || await getCustomFlowById(flowId);

    if (!flow) {
      return res.status(404).json({ message: 'Call flow not found' });
    }

    res.json({
      success: true,
      callFlow: flow,
    });
  } catch (error) {
    console.error('[CALL FLOW MANAGEMENT] Get call flow error:', error);
    res.status(500).json({ message: 'Failed to fetch call flow' });
  }
});

/**
 * POST /api/call-flows/validate - Validate a call flow configuration
 */
router.post('/validate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { callFlow } = req.body;

    if (!callFlow) {
      return res.status(400).json({ message: 'Call flow is required' });
    }

    const validation = validateCallFlow(callFlow);

    res.json({
      success: true,
      valid: validation.valid,
      errors: validation.errors,
    });
  } catch (error) {
    console.error('[CALL FLOW MANAGEMENT] Validate call flow error:', error);
    res.status(500).json({ message: 'Failed to validate call flow' });
  }
});

/**
 * GET /api/call-flows/for-campaign/:campaignType - Get the effective call flow for a campaign type
 * This respects custom mappings
 */
router.get('/for-campaign/:campaignType', requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignType } = req.params;
    console.log(`[CALL FLOW MANAGEMENT] Getting call flow for campaign type: ${campaignType}`);

    // Check for custom mapping first
    const customFlowId = await getCustomMapping(campaignType);
    console.log(`[CALL FLOW MANAGEMENT] Custom mapping for ${campaignType}: ${customFlowId || 'none (using default)'}`);

    let callFlow: CallFlow;

    if (customFlowId) {
      const systemFlow = getAllDefaultCallFlows().find(f => f.id === customFlowId);
      const customFlow = systemFlow || await getCustomFlowById(customFlowId);
      if (customFlow) {
        console.log(`[CALL FLOW MANAGEMENT] Using custom-mapped flow: ${customFlow.name} (id: ${customFlow.id})`);
        callFlow = customFlow;
      } else {
        console.log(`[CALL FLOW MANAGEMENT] Custom flow ${customFlowId} not found, falling back to default`);
        callFlow = getDefaultCallFlowForCampaignType(campaignType);
      }
    } else {
      callFlow = getDefaultCallFlowForCampaignType(campaignType);
      console.log(`[CALL FLOW MANAGEMENT] Using default flow: ${callFlow.name}`);
    }

    res.json({
      success: true,
      callFlow,
      campaignType,
      isCustomMapping: !!customFlowId,
    });
  } catch (error) {
    console.error('[CALL FLOW MANAGEMENT] Get call flow for campaign error:', error);
    res.status(500).json({ message: 'Failed to fetch call flow' });
  }
});

// ============================================
// CUSTOM CALL FLOW CRUD OPERATIONS
// ============================================

/**
 * POST /api/call-flows - Create a new custom call flow
 */
router.post('/', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { name, objective, successCriteria, maxTotalTurns, steps } = req.body;

    if (!name || !objective || !successCriteria) {
      return res.status(400).json({ message: 'Name, objective, and success criteria are required' });
    }

    // Generate unique ID
    const id = `custom-${randomUUID().slice(0, 8)}`;

    const newFlow: CallFlow = {
      id,
      name,
      objective,
      successCriteria,
      maxTotalTurns: maxTotalTurns || 20,
      steps: steps || [],
      isDefault: false,
      isSystemFlow: false,
      version: 1,
    };

    // Validate the flow
    const validation = validateCallFlow(newFlow);
    if (!validation.valid) {
      return res.status(400).json({
        message: 'Invalid call flow configuration',
        errors: validation.errors,
      });
    }

    await db.insert(customCallFlows).values({
      id,
      name,
      objective,
      successCriteria,
      maxTotalTurns: maxTotalTurns || 20,
      steps: steps || [],
      version: 1,
      isActive: true,
      createdBy: req.user?.userId || null,
      updatedBy: req.user?.userId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      message: 'Call flow created successfully',
      callFlow: newFlow,
    });
  } catch (error) {
    console.error('[CALL FLOW MANAGEMENT] Create call flow error:', error);
    res.status(500).json({ message: 'Failed to create call flow' });
  }
});

/**
 * PUT /api/call-flows/:flowId - Update an existing custom call flow
 */
router.put('/:flowId', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { flowId } = req.params;
    const { name, objective, successCriteria, maxTotalTurns, steps } = req.body;

    // Check if it's a system flow (cannot be modified)
    const systemFlows = getAllDefaultCallFlows();
    const isSystemFlow = systemFlows.some(f => f.id === flowId);

    if (isSystemFlow) {
      return res.status(403).json({
        message: 'System flows cannot be modified. Create a duplicate to customize.'
      });
    }

    // Check if custom flow exists
    const existingFlow = await getCustomFlowById(flowId);
    if (!existingFlow) {
      return res.status(404).json({ message: 'Call flow not found' });
    }

    const updatedFlow: CallFlow = {
      ...existingFlow,
      name: name ?? existingFlow.name,
      objective: objective ?? existingFlow.objective,
      successCriteria: successCriteria ?? existingFlow.successCriteria,
      maxTotalTurns: maxTotalTurns ?? existingFlow.maxTotalTurns,
      steps: steps ?? existingFlow.steps,
      version: (existingFlow.version || 1) + 1,
    };

    // Validate the flow
    const validation = validateCallFlow(updatedFlow);
    if (!validation.valid) {
      return res.status(400).json({
        message: 'Invalid call flow configuration',
        errors: validation.errors,
      });
    }

    await db
      .update(customCallFlows)
      .set({
        name: updatedFlow.name,
        objective: updatedFlow.objective,
        successCriteria: updatedFlow.successCriteria,
        maxTotalTurns: updatedFlow.maxTotalTurns,
        steps: updatedFlow.steps,
        version: updatedFlow.version || 1,
        updatedBy: req.user?.userId || null,
        updatedAt: new Date(),
      })
      .where(eq(customCallFlows.id, flowId));

    res.json({
      success: true,
      message: 'Call flow updated successfully',
      callFlow: updatedFlow,
    });
  } catch (error) {
    console.error('[CALL FLOW MANAGEMENT] Update call flow error:', error);
    res.status(500).json({ message: 'Failed to update call flow' });
  }
});

/**
 * DELETE /api/call-flows/:flowId - Delete a custom call flow
 */
router.delete('/:flowId', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { flowId } = req.params;

    // Check if it's a system flow (cannot be deleted)
    const systemFlows = getAllDefaultCallFlows();
    const isSystemFlow = systemFlows.some(f => f.id === flowId);

    if (isSystemFlow) {
      return res.status(403).json({ message: 'System flows cannot be deleted' });
    }

    // Check if custom flow exists
    const existingFlow = await getCustomFlowById(flowId);
    if (!existingFlow) {
      return res.status(404).json({ message: 'Call flow not found' });
    }

    // Check if flow is being used by any mapping
    const mappingsUsingFlow = await db
      .select({ campaignType: customCallFlowMappings.campaignType })
      .from(customCallFlowMappings)
      .where(eq(customCallFlowMappings.callFlowId, flowId));

    if (mappingsUsingFlow.length > 0) {
      return res.status(400).json({
        message: `Cannot delete flow. It is assigned to: ${mappingsUsingFlow.map(m => m.campaignType).join(', ')}`,
      });
    }

    await db
      .delete(customCallFlows)
      .where(eq(customCallFlows.id, flowId));

    res.json({
      success: true,
      message: 'Call flow deleted successfully',
    });
  } catch (error) {
    console.error('[CALL FLOW MANAGEMENT] Delete call flow error:', error);
    res.status(500).json({ message: 'Failed to delete call flow' });
  }
});

/**
 * POST /api/call-flows/:flowId/duplicate - Duplicate a call flow (system or custom)
 */
router.post('/:flowId/duplicate', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { flowId } = req.params;
    const { name } = req.body;

    // Find the source flow
    const systemFlow = getAllDefaultCallFlows().find(f => f.id === flowId);
    const sourceFlow = systemFlow || await getCustomFlowById(flowId);

    if (!sourceFlow) {
      return res.status(404).json({ message: 'Source call flow not found' });
    }

    // Generate unique ID
    const id = `custom-${randomUUID().slice(0, 8)}`;

    const duplicatedFlow: CallFlow = {
      ...JSON.parse(JSON.stringify(sourceFlow)), // Deep clone
      id,
      name: name || `${sourceFlow.name} (Copy)`,
      isDefault: false,
      isSystemFlow: false,
      version: 1,
    };

    // Update step IDs to be unique
    duplicatedFlow.steps = duplicatedFlow.steps.map((step: CallFlowStep, index: number) => ({
      ...step,
      stepId: `step-${index + 1}-${randomUUID().slice(0, 4)}`,
    }));

    await db.insert(customCallFlows).values({
      id,
      name: duplicatedFlow.name,
      objective: duplicatedFlow.objective,
      successCriteria: duplicatedFlow.successCriteria,
      maxTotalTurns: duplicatedFlow.maxTotalTurns || 20,
      steps: duplicatedFlow.steps || [],
      version: 1,
      isActive: true,
      createdBy: req.user?.userId || null,
      updatedBy: req.user?.userId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      message: 'Call flow duplicated successfully',
      callFlow: duplicatedFlow,
    });
  } catch (error) {
    console.error('[CALL FLOW MANAGEMENT] Duplicate call flow error:', error);
    res.status(500).json({ message: 'Failed to duplicate call flow' });
  }
});

/**
 * PUT /api/call-flows/:flowId/steps - Update steps for a custom call flow
 * Supports reordering, adding, and removing steps
 */
router.put('/:flowId/steps', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { flowId } = req.params;
    const { steps } = req.body;

    // Check if it's a system flow
    const systemFlows = getAllDefaultCallFlows();
    const isSystemFlow = systemFlows.some(f => f.id === flowId);

    if (isSystemFlow) {
      return res.status(403).json({
        message: 'System flows cannot be modified. Create a duplicate to customize.'
      });
    }

    const existingFlow = await getCustomFlowById(flowId);
    if (!existingFlow) {
      return res.status(404).json({ message: 'Call flow not found' });
    }

    if (!Array.isArray(steps)) {
      return res.status(400).json({ message: 'Steps must be an array' });
    }

    const updatedFlow: CallFlow = {
      ...existingFlow,
      steps,
      version: (existingFlow.version || 1) + 1,
    };

    // Validate the flow
    const validation = validateCallFlow(updatedFlow);
    if (!validation.valid) {
      return res.status(400).json({
        message: 'Invalid call flow configuration',
        errors: validation.errors,
      });
    }

    await db
      .update(customCallFlows)
      .set({
        steps: updatedFlow.steps,
        version: updatedFlow.version || 1,
        updatedBy: req.user?.userId || null,
        updatedAt: new Date(),
      })
      .where(eq(customCallFlows.id, flowId));

    res.json({
      success: true,
      message: 'Steps updated successfully',
      callFlow: updatedFlow,
    });
  } catch (error) {
    console.error('[CALL FLOW MANAGEMENT] Update steps error:', error);
    res.status(500).json({ message: 'Failed to update steps' });
  }
});

/**
 * POST /api/call-flows/:flowId/steps - Add a new step to a custom call flow
 */
router.post('/:flowId/steps', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { flowId } = req.params;
    const { step, position } = req.body;

    // Check if it's a system flow
    const systemFlows = getAllDefaultCallFlows();
    const isSystemFlow = systemFlows.some(f => f.id === flowId);

    if (isSystemFlow) {
      return res.status(403).json({
        message: 'System flows cannot be modified. Create a duplicate to customize.'
      });
    }

    const existingFlow = await getCustomFlowById(flowId);
    if (!existingFlow) {
      return res.status(404).json({ message: 'Call flow not found' });
    }

    if (!step || !step.name) {
      return res.status(400).json({ message: 'Step with name is required' });
    }

    // Generate step ID if not provided
    const newStep: CallFlowStep = {
      stepId: step.stepId || `step-${existingFlow.steps.length + 1}-${randomUUID().slice(0, 4)}`,
      name: step.name,
      mappedState: step.mappedState || 'DISCOVERY',
      goal: step.goal || '',
      allowedIntents: step.allowedIntents || ['ask_question', 'acknowledge', 'listen'],
      forbiddenIntents: step.forbiddenIntents || [],
      allowedQuestions: step.allowedQuestions ?? 2,
      maxTurnsInStep: step.maxTurnsInStep ?? 5,
      mustDo: step.mustDo || [],
      mustNotDo: step.mustNotDo || [],
      exitCriteria: step.exitCriteria || [],
      branches: step.branches || [],
      fallback: step.fallback || { action: 'proceed' },
    };

    // Insert at position or append
    const newSteps = [...existingFlow.steps];
    const insertIndex = typeof position === 'number' ? Math.min(position, newSteps.length) : newSteps.length;
    newSteps.splice(insertIndex, 0, newStep);

    const updatedFlow: CallFlow = {
      ...existingFlow,
      steps: newSteps,
      version: (existingFlow.version || 1) + 1,
    };

    await db
      .update(customCallFlows)
      .set({
        steps: updatedFlow.steps,
        version: updatedFlow.version || 1,
        updatedBy: req.user?.userId || null,
        updatedAt: new Date(),
      })
      .where(eq(customCallFlows.id, flowId));

    res.json({
      success: true,
      message: 'Step added successfully',
      callFlow: updatedFlow,
      newStep,
    });
  } catch (error) {
    console.error('[CALL FLOW MANAGEMENT] Add step error:', error);
    res.status(500).json({ message: 'Failed to add step' });
  }
});

/**
 * DELETE /api/call-flows/:flowId/steps/:stepId - Remove a step from a custom call flow
 */
router.delete('/:flowId/steps/:stepId', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { flowId, stepId } = req.params;

    // Check if it's a system flow
    const systemFlows = getAllDefaultCallFlows();
    const isSystemFlow = systemFlows.some(f => f.id === flowId);

    if (isSystemFlow) {
      return res.status(403).json({
        message: 'System flows cannot be modified. Create a duplicate to customize.'
      });
    }

    const existingFlow = await getCustomFlowById(flowId);
    if (!existingFlow) {
      return res.status(404).json({ message: 'Call flow not found' });
    }

    const stepIndex = existingFlow.steps.findIndex(s => s.stepId === stepId);
    if (stepIndex === -1) {
      return res.status(404).json({ message: 'Step not found' });
    }

    const newSteps = existingFlow.steps.filter(s => s.stepId !== stepId);

    const updatedFlow: CallFlow = {
      ...existingFlow,
      steps: newSteps,
      version: (existingFlow.version || 1) + 1,
    };

    await db
      .update(customCallFlows)
      .set({
        steps: updatedFlow.steps,
        version: updatedFlow.version || 1,
        updatedBy: req.user?.userId || null,
        updatedAt: new Date(),
      })
      .where(eq(customCallFlows.id, flowId));

    res.json({
      success: true,
      message: 'Step removed successfully',
      callFlow: updatedFlow,
    });
  } catch (error) {
    console.error('[CALL FLOW MANAGEMENT] Remove step error:', error);
    res.status(500).json({ message: 'Failed to remove step' });
  }
});

export default router;
