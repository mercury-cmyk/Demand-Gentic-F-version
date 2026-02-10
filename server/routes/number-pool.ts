/**
 * Number Pool API Routes
 * 
 * REST API endpoints for managing the Telnyx number pool:
 * - Number CRUD operations
 * - Assignment management
 * - Pool statistics
 * - Cooldown management
 * - Reputation queries
 * 
 * @see docs/NUMBER_POOL_MANAGEMENT_SYSTEM.md Section 4: API Endpoints
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  // Number service
  syncFromTelnyx,
  getNumbers,
  getNumberById,
  createNumber,
  updateNumber,
  deleteNumber,
  getPoolSummary,
  getCallStats,
  // Assignment service
  createAssignment,
  getAssignments,
  getNumbersForCampaign,
  updateAssignment,
  deleteAssignment,
  // Router service
  selectNumber,
  isNumberPoolEnabled,
  // Reputation engine
  calculateReputation,
  recalculateAllReputations,
  // Cooldown manager
  getCooldownStatus,
  getNumbersInCooldown,
  triggerManualCooldown,
  endCooldown,
  processExpiredCooldowns,
  COOLDOWN_TRIGGERS,
  // Repair functions
  ensureReputationRecords,
} from '../services/number-pool';
import {
  assignNumberToAgent,
  unassignNumberFromAgent,
  getAgentsWithNumbers,
} from '../services/number-pool-integration';

const router = Router();

// ==================== VALIDATION SCHEMAS ====================

const createNumberSchema = z.object({
  phoneNumberE164: z.string().regex(/^\+1\d{10}$/, 'Must be E.164 format (+1XXXXXXXXXX)'),
  telnyxNumberId: z.string().optional(),
  connectionId: z.string().optional(),
  displayName: z.string().optional(),
  region: z.string().optional(),
  areaCode: z.string().length(3).optional(),
  maxCallsPerHour: z.number().min(1).max(100).optional(),
  maxCallsPerDay: z.number().min(1).max(500).optional(),
  tags: z.array(z.string()).optional(),
});

const updateNumberSchema = z.object({
  displayName: z.string().optional(),
  region: z.string().optional(),
  status: z.enum(['active', 'cooling', 'suspended', 'retired']).optional(),
  maxCallsPerHour: z.number().min(1).max(1000).optional(),
  maxCallsPerDay: z.number().min(1).max(5000).optional(),
  tags: z.array(z.string()).optional(),
});

const createAssignmentSchema = z.object({
  numberId: z.string().uuid(),
  scope: z.enum(['global', 'campaign', 'agent', 'region']),
  campaignId: z.string().uuid().optional(),
  virtualAgentId: z.string().uuid().optional(),
  region: z.string().optional(),
  priority: z.number().min(0).max(100).optional(),
});

const selectNumberSchema = z.object({
  campaignId: z.string().uuid(),
  virtualAgentId: z.string().uuid().optional(),
  prospectNumber: z.string().regex(/^\+1\d{10}$/),
  prospectRegion: z.string().optional(),
  prospectTimezone: z.string().optional(),
  excludeNumberIds: z.array(z.string().uuid()).optional(),
});

const manualCooldownSchema = z.object({
  hours: z.number().min(1).max(168), // Max 7 days
  notes: z.string().optional(),
});

// ==================== MIDDLEWARE ====================

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// ==================== NUMBER ENDPOINTS ====================

/**
 * GET /api/number-pool/numbers
 * List all numbers with optional filters
 */
router.get('/numbers', asyncHandler(async (req, res) => {
  const { status, band, limit, offset } = req.query;

  const numbers = await getNumbers({
    status: status as string,
    band: band as string,
    limit: limit ? parseInt(limit as string) : undefined,
    offset: offset ? parseInt(offset as string) : undefined,
  });

  res.json({
    success: true,
    data: numbers,
    count: numbers.length,
  });
}));

/**
 * GET /api/number-pool/numbers/:id
 * Get a single number with full details
 */
router.get('/numbers/:id', asyncHandler(async (req, res) => {
  const number = await getNumberById(req.params.id);

  if (!number) {
    return res.status(404).json({
      success: false,
      error: 'Number not found',
    });
  }

  res.json({
    success: true,
    data: number,
  });
}));

/**
 * POST /api/number-pool/numbers
 * Create a new number (manual entry)
 */
router.post('/numbers', asyncHandler(async (req, res) => {
  const parsed = createNumberSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: parsed.error.errors,
    });
  }

  const number = await createNumber(parsed.data);

  res.status(201).json({
    success: true,
    data: number,
  });
}));

/**
 * PATCH /api/number-pool/numbers/:id
 * Update a number
 */
router.patch('/numbers/:id', asyncHandler(async (req, res) => {
  const parsed = updateNumberSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: parsed.error.errors,
    });
  }

  const number = await updateNumber(req.params.id, parsed.data);

  res.json({
    success: true,
    data: number,
  });
}));

/**
 * DELETE /api/number-pool/numbers/:id
 * Retire a number (soft delete)
 */
router.delete('/numbers/:id', asyncHandler(async (req, res) => {
  await deleteNumber(req.params.id);

  res.json({
    success: true,
    message: 'Number retired',
  });
}));

// ==================== SYNC ENDPOINTS ====================

/**
 * POST /api/number-pool/sync
 * Sync numbers from Telnyx API
 */
router.post('/sync', asyncHandler(async (req, res) => {
  const result = await syncFromTelnyx();
  
  // Ensure all numbers have reputation records
  const reputationCreated = await ensureReputationRecords();
  
  res.json({
    success: true,
    data: {
      ...result,
      reputationRecordsCreated: reputationCreated,
    },
  });
}));

/**
 * POST /api/number-pool/repair
 * Repair missing reputation records
 */
router.post('/repair', asyncHandler(async (req, res) => {
  const created = await ensureReputationRecords();
  
  res.json({
    success: true,
    data: {
      reputationRecordsCreated: created,
    },
  });
}));

// ==================== POOL SUMMARY ====================

/**
 * GET /api/number-pool/summary
 * Get pool statistics
 */
router.get('/summary', asyncHandler(async (req, res) => {
  const summary = await getPoolSummary();

  res.json({
    success: true,
    data: summary,
  });
}));

/**
 * GET /api/number-pool/stats
 * Get aggregate call statistics for the number pool
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await getCallStats();

  res.json({
    success: true,
    data: stats,
  });
}));

/**
 * GET /api/number-pool/status
 * Get feature flag status
 */
router.get('/status', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      enabled: isNumberPoolEnabled(),
      fallbackNumber: process.env.TELNYX_FROM_NUMBER ? '(configured)' : '(not configured)',
    },
  });
}));

// ==================== ASSIGNMENT ENDPOINTS ====================

/**
 * GET /api/number-pool/numbers/:id/assignments
 * Get assignments for a number
 */
router.get('/numbers/:id/assignments', asyncHandler(async (req, res) => {
  const assignments = await getAssignments(req.params.id);

  res.json({
    success: true,
    data: assignments,
  });
}));

/**
 * POST /api/number-pool/assignments
 * Create a new assignment
 */
router.post('/assignments', asyncHandler(async (req, res) => {
  const parsed = createAssignmentSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: parsed.error.errors,
    });
  }

  const assignment = await createAssignment(parsed.data);

  res.status(201).json({
    success: true,
    data: assignment,
  });
}));

/**
 * PATCH /api/number-pool/assignments/:id
 * Update an assignment
 */
router.patch('/assignments/:id', asyncHandler(async (req, res) => {
  const { priority, isActive } = req.body;

  const assignment = await updateAssignment(req.params.id, {
    priority,
    isActive,
  });

  res.json({
    success: true,
    data: assignment,
  });
}));

/**
 * DELETE /api/number-pool/assignments/:id
 * Delete an assignment
 */
router.delete('/assignments/:id', asyncHandler(async (req, res) => {
  await deleteAssignment(req.params.id);

  res.json({
    success: true,
    message: 'Assignment deleted',
  });
}));

/**
 * GET /api/number-pool/campaigns/:id/numbers
 * Get numbers assigned to a campaign
 */
router.get('/campaigns/:id/numbers', asyncHandler(async (req, res) => {
  const numbers = await getNumbersForCampaign(req.params.id);

  res.json({
    success: true,
    data: numbers,
  });
}));

// ==================== AGENT NUMBER ASSIGNMENT ====================

/**
 * GET /api/number-pool/agents
 * Get all agents with their assigned phone numbers
 */
router.get('/agents', asyncHandler(async (req, res) => {
  const agents = await getAgentsWithNumbers();

  res.json({
    success: true,
    data: agents,
  });
}));

/**
 * PUT /api/number-pool/agents/:agentId/number
 * Assign a phone number to an agent
 */
router.put('/agents/:agentId/number', asyncHandler(async (req, res) => {
  const { phoneNumberId } = req.body;

  if (!phoneNumberId) {
    return res.status(400).json({
      success: false,
      error: 'phoneNumberId is required',
    });
  }

  await assignNumberToAgent(req.params.agentId, phoneNumberId);

  res.json({
    success: true,
    message: 'Phone number assigned to agent',
  });
}));

/**
 * DELETE /api/number-pool/agents/:agentId/number
 * Remove phone number assignment from an agent
 */
router.delete('/agents/:agentId/number', asyncHandler(async (req, res) => {
  await unassignNumberFromAgent(req.params.agentId);

  res.json({
    success: true,
    message: 'Phone number unassigned from agent',
  });
}));

// ==================== ROUTING ENDPOINTS ====================

/**
 * POST /api/number-pool/select
 * Select a number for an outbound call (internal use)
 */
router.post('/select', asyncHandler(async (req, res) => {
  const parsed = selectNumberSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: parsed.error.errors,
    });
  }

  const result = await selectNumber(parsed.data);

  res.json({
    success: true,
    data: result,
  });
}));

// ==================== REPUTATION ENDPOINTS ====================

/**
 * GET /api/number-pool/numbers/:id/reputation
 * Get reputation details for a number
 */
router.get('/numbers/:id/reputation', asyncHandler(async (req, res) => {
  const details = await calculateReputation(req.params.id);

  res.json({
    success: true,
    data: details,
  });
}));

/**
 * POST /api/number-pool/reputation/recalculate
 * Recalculate all reputation scores
 */
router.post('/reputation/recalculate', asyncHandler(async (req, res) => {
  const result = await recalculateAllReputations();

  res.json({
    success: true,
    data: result,
  });
}));

// ==================== COOLDOWN ENDPOINTS ====================

/**
 * GET /api/number-pool/cooldowns
 * Get all numbers currently in cooldown
 */
router.get('/cooldowns', asyncHandler(async (req, res) => {
  const cooldowns = await getNumbersInCooldown();

  res.json({
    success: true,
    data: cooldowns,
  });
}));

/**
 * GET /api/number-pool/cooldowns/triggers
 * Get cooldown trigger configuration
 */
router.get('/cooldowns/triggers', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: COOLDOWN_TRIGGERS,
  });
}));

/**
 * GET /api/number-pool/numbers/:id/cooldown
 * Get cooldown status for a specific number
 */
router.get('/numbers/:id/cooldown', asyncHandler(async (req, res) => {
  const status = await getCooldownStatus(req.params.id);

  res.json({
    success: true,
    data: status,
  });
}));

/**
 * POST /api/number-pool/numbers/:id/cooldown
 * Trigger a manual cooldown
 */
router.post('/numbers/:id/cooldown', asyncHandler(async (req, res) => {
  const parsed = manualCooldownSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: parsed.error.errors,
    });
  }

  const cooldown = await triggerManualCooldown(
    req.params.id,
    parsed.data.hours,
    parsed.data.notes
  );

  res.json({
    success: true,
    data: cooldown,
  });
}));

/**
 * DELETE /api/number-pool/cooldowns/:id
 * End a cooldown early
 */
router.delete('/cooldowns/:id', asyncHandler(async (req, res) => {
  await endCooldown(req.params.id);

  res.json({
    success: true,
    message: 'Cooldown ended',
  });
}));

/**
 * POST /api/number-pool/cooldowns/process-expired
 * Process expired cooldowns (internal/cron use)
 */
router.post('/cooldowns/process-expired', asyncHandler(async (req, res) => {
  const count = await processExpiredCooldowns();

  res.json({
    success: true,
    data: { processed: count },
  });
}));

// ==================== ERROR HANDLER ====================

router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[NumberPoolAPI] Error:', err);

  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

export default router;
