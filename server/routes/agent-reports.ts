import { Router } from "express";
import { db } from "../db";
import { 
  performancePeriods, 
  agentPeriodStats, 
  agentGoals,
  goalDefinitions,
  gamificationRewards,
  users,
  leads
} from "@shared/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { requireAuth } from "../auth";
import Redis from 'ioredis';
import { getRedisUrl, getRedisConnectionOptions, isRedisConfigured } from '../lib/redis-config';

const router = Router();

// Redis client for caching (graceful degradation if unavailable)
let redisClient: Redis | null = null;
try {
  if (isRedisConfigured()) {
    redisClient = new Redis(getRedisUrl(), {
      ...getRedisConnectionOptions(),
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
    });
    redisClient.on('error', (err) => {
      console.warn('Redis connection error for agent reports:', err);
      redisClient = null;
    });
  }
} catch (error) {
  console.warn('Failed to initialize Redis for agent reports:', error);
}

// ==================== GET /api/leaderboard/current ====================
// Returns current period leaderboard with rankings and cached for 5 minutes

router.get("/leaderboard/current", requireAuth, async (req, res) => {
  try {
    // Role-aware cache key to prevent RBAC leakage
    const isAdminOrManager = req.user && (req.user.role === 'admin' || req.user.role === 'manager');
    const cacheKey = isAdminOrManager ? 'leaderboard:current:admin' : `leaderboard:current:agent:${req.user?.userId}`;
    
    // Try cache first
    if (redisClient) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch (err) {
        console.warn('Redis get failed for leaderboard:', err);
      }
    }

    // Find active period
    const now = new Date();
    const activePeriods = await db
      .select()
      .from(performancePeriods)
      .where(
        and(
          eq(performancePeriods.status, 'active'),
          lte(performancePeriods.startAt, now),
          gte(performancePeriods.endAt, now)
        )
      )
      .limit(1);

    if (!activePeriods.length) {
      return res.json({
        period: null,
        leaderboard: [],
        message: 'No active performance period'
      });
    }

    const period = activePeriods[0];

    // Get leaderboard stats with agent names
    const leaderboardData = await db
      .select({
        agentId: agentPeriodStats.agentId,
        agentFirstName: users.firstName,
        agentLastName: users.lastName,
        totalCalls: agentPeriodStats.totalCalls,
        qualifiedLeads: agentPeriodStats.qualifiedLeads,
        acceptedLeads: agentPeriodStats.acceptedLeads,
        rejectedLeads: agentPeriodStats.rejectedLeads,
        pendingReview: agentPeriodStats.pendingReview,
        conversionRate: agentPeriodStats.conversionRate,
        avgCallDuration: agentPeriodStats.avgCallDuration,
        calculatedAt: agentPeriodStats.calculatedAt,
      })
      .from(agentPeriodStats)
      .innerJoin(users, eq(agentPeriodStats.agentId, users.id))
      .where(eq(agentPeriodStats.periodId, period.id))
      .orderBy(
        desc(agentPeriodStats.acceptedLeads),
        desc(agentPeriodStats.qualifiedLeads)
      );

    // Add rankings
    const leaderboard = leaderboardData.map((stat, index) => ({
      ...stat,
      rank: index + 1,
      conversionRate: stat.conversionRate ? parseFloat(stat.conversionRate) : 0,
    }));

    // RBAC: Agents only see their own row unless admin/manager
    const filteredLeaderboard = isAdminOrManager 
      ? leaderboard 
      : leaderboard.filter(entry => entry.agentId === req.user?.userId);

    const result = {
      period: {
        id: period.id,
        label: period.label,
        startAt: period.startAt,
        endAt: period.endAt,
        status: period.status,
      },
      leaderboard: filteredLeaderboard,
      lastUpdated: new Date().toISOString(),
    };

    // Cache for 5 minutes
    if (redisClient) {
      try {
        await redisClient.setex(cacheKey, 300, JSON.stringify(result));
      } catch (err) {
        console.warn('Redis setex failed for leaderboard:', err);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ 
      error: 'Failed to fetch leaderboard',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==================== GET /api/agents/:agentId/reports ====================
// Returns comprehensive performance reports for a specific agent

router.get("/agents/:agentId/reports", requireAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { periodId } = req.query;

    // RBAC: Users can only view their own reports unless admin/manager
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'manager' && req.user.userId !== agentId)) {
      return res.status(403).json({ error: 'Forbidden: Can only view own reports' });
    }

    // If periodId specified, get specific period stats
    if (periodId) {
      const stats = await db
        .select({
          stats: agentPeriodStats,
          period: performancePeriods,
        })
        .from(agentPeriodStats)
        .innerJoin(performancePeriods, eq(agentPeriodStats.periodId, performancePeriods.id))
        .where(
          and(
            eq(agentPeriodStats.agentId, agentId),
            eq(agentPeriodStats.periodId, periodId as string)
          )
        )
        .limit(1);

      if (!stats.length) {
        return res.json({
          period: null,
          stats: null,
          message: 'No stats found for this period'
        });
      }

      return res.json({
        period: stats[0].period,
        stats: {
          ...stats[0].stats,
          conversionRate: stats[0].stats.conversionRate ? parseFloat(stats[0].stats.conversionRate) : 0,
        }
      });
    }

    // Get all historical stats for agent
    const allStats = await db
      .select({
        stats: agentPeriodStats,
        period: performancePeriods,
      })
      .from(agentPeriodStats)
      .innerJoin(performancePeriods, eq(agentPeriodStats.periodId, performancePeriods.id))
      .where(eq(agentPeriodStats.agentId, agentId))
      .orderBy(desc(performancePeriods.startAt));

    const formattedStats = allStats.map(({ stats, period }) => ({
      period: {
        id: period.id,
        label: period.label,
        startAt: period.startAt,
        endAt: period.endAt,
        status: period.status,
      },
      stats: {
        ...stats,
        conversionRate: stats.conversionRate ? parseFloat(stats.conversionRate) : 0,
      }
    }));

    res.json({
      agentId,
      reports: formattedStats,
      totalPeriods: formattedStats.length,
    });
  } catch (error) {
    console.error('Error fetching agent reports:', error);
    res.status(500).json({ 
      error: 'Failed to fetch agent reports',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==================== GET /api/agents/:agentId/goals ====================
// Returns agent goals with progress for active period

router.get("/agents/:agentId/goals", requireAuth, async (req, res) => {
  try {
    const { agentId } = req.params;

    // RBAC: Users can only view their own goals unless admin/manager
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'manager' && req.user.userId !== agentId)) {
      return res.status(403).json({ error: 'Forbidden: Can only view own goals' });
    }

    // Find active period
    const now = new Date();
    const activePeriods = await db
      .select()
      .from(performancePeriods)
      .where(
        and(
          eq(performancePeriods.status, 'active'),
          lte(performancePeriods.startAt, now),
          gte(performancePeriods.endAt, now)
        )
      )
      .limit(1);

    if (!activePeriods.length) {
      return res.json({
        period: null,
        goals: [],
        message: 'No active performance period'
      });
    }

    const period = activePeriods[0];

    // Get agent goals with definitions and rewards
    const goalsData = await db
      .select({
        goal: agentGoals,
        definition: goalDefinitions,
        reward: gamificationRewards,
        stats: agentPeriodStats,
      })
      .from(agentGoals)
      .innerJoin(goalDefinitions, eq(agentGoals.goalDefinitionId, goalDefinitions.id))
      .leftJoin(gamificationRewards, eq(agentGoals.rewardId, gamificationRewards.id))
      .leftJoin(
        agentPeriodStats,
        and(
          eq(agentPeriodStats.agentId, agentGoals.agentId),
          eq(agentPeriodStats.periodId, agentGoals.periodId)
        )
      )
      .where(
        and(
          eq(agentGoals.agentId, agentId),
          eq(agentGoals.periodId, period.id)
        )
      );

    // Calculate progress for each goal
    const goals = goalsData.map(({ goal, definition, reward, stats }) => {
      let currentValue = 0;
      let progressPercentage = 0;

      if (stats) {
        switch (definition.goalType) {
          case 'qualified_leads':
            currentValue = stats.qualifiedLeads;
            break;
          case 'accepted_leads':
            currentValue = stats.acceptedLeads;
            break;
          case 'call_volume':
            currentValue = stats.totalCalls;
            break;
          case 'conversion_rate':
            currentValue = stats.conversionRate ? parseFloat(stats.conversionRate) : 0;
            break;
        }
        progressPercentage = (currentValue / goal.targetValue) * 100;
      }

      return {
        goalId: goal.id,
        definition: {
          id: definition.id,
          name: definition.name,
          description: definition.description,
          goalType: definition.goalType,
        },
        targetValue: goal.targetValue,
        currentValue,
        progressPercentage: Math.min(progressPercentage, 100),
        isComplete: currentValue >= goal.targetValue,
        reward: reward ? {
          id: reward.id,
          name: reward.name,
          description: reward.description,
          rewardValue: reward.rewardValue,
          rewardCurrency: reward.rewardCurrency,
        } : null,
      };
    });

    res.json({
      period: {
        id: period.id,
        label: period.label,
        startAt: period.startAt,
        endAt: period.endAt,
      },
      goals,
      overallProgress: goals.length > 0 
        ? goals.reduce((sum, g) => sum + g.progressPercentage, 0) / goals.length 
        : 0,
    });
  } catch (error) {
    console.error('Error fetching agent goals:', error);
    res.status(500).json({ 
      error: 'Failed to fetch agent goals',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==================== POST /api/leaderboard/refresh ====================
// Manually trigger stats refresh for current period (admin/manager only)
// NOTE: For production at 3M+ scale, move this aggregation to a BullMQ background job
// with dedicated indexes on leads(agentId, qaStatus, createdAt) to avoid blocking API threads

router.post("/leaderboard/refresh", requireAuth, async (req, res) => {
  try {
    // Only admin/manager can trigger refresh
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'manager')) {
      return res.status(403).json({ error: 'Forbidden: Admin/Manager access required' });
    }

    // Find active period
    const now = new Date();
    const activePeriods = await db
      .select()
      .from(performancePeriods)
      .where(
        and(
          eq(performancePeriods.status, 'active'),
          lte(performancePeriods.startAt, now),
          gte(performancePeriods.endAt, now)
        )
      )
      .limit(1);

    if (!activePeriods.length) {
      return res.status(400).json({ error: 'No active performance period' });
    }

    const period = activePeriods[0];

    // Get all agents with call activity in this period
    const agentStats = await db
      .select({
        agentId: leads.agentId,
        totalCalls: sql<number>`COUNT(DISTINCT ${leads.id})`.as('total_calls'),
        qualifiedLeads: sql<number>`COUNT(DISTINCT CASE WHEN ${leads.qaData}->>'ai_result' = 'Qualified' THEN ${leads.id} END)`.as('qualified_leads'),
        acceptedLeads: sql<number>`COUNT(DISTINCT CASE WHEN ${leads.qaStatus} = 'Accepted' THEN ${leads.id} END)`.as('accepted_leads'),
        rejectedLeads: sql<number>`COUNT(DISTINCT CASE WHEN ${leads.qaStatus} = 'Rejected' THEN ${leads.id} END)`.as('rejected_leads'),
        pendingReview: sql<number>`COUNT(DISTINCT CASE WHEN ${leads.qaStatus} = 'Pending Review' THEN ${leads.id} END)`.as('pending_review'),
        avgCallDuration: sql<number>`AVG(${leads.callDuration})`.as('avg_call_duration'),
      })
      .from(leads)
      .where(
        and(
          gte(leads.createdAt, period.startAt),
          lte(leads.createdAt, period.endAt),
          sql`${leads.agentId} IS NOT NULL`
        )
      )
      .groupBy(leads.agentId);

    // Upsert stats for each agent
    for (const stats of agentStats) {
      const conversionRate = stats.qualifiedLeads > 0 
        ? (stats.acceptedLeads / stats.qualifiedLeads) * 100 
        : 0;

      await db
        .insert(agentPeriodStats)
        .values({
          agentId: stats.agentId!,
          periodId: period.id,
          totalCalls: stats.totalCalls,
          qualifiedLeads: stats.qualifiedLeads,
          acceptedLeads: stats.acceptedLeads,
          rejectedLeads: stats.rejectedLeads,
          pendingReview: stats.pendingReview,
          conversionRate: conversionRate.toFixed(2),
          avgCallDuration: stats.avgCallDuration ? Math.round(stats.avgCallDuration) : null,
          calculatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [agentPeriodStats.agentId, agentPeriodStats.periodId],
          set: {
            totalCalls: stats.totalCalls,
            qualifiedLeads: stats.qualifiedLeads,
            acceptedLeads: stats.acceptedLeads,
            rejectedLeads: stats.rejectedLeads,
            pendingReview: stats.pendingReview,
            conversionRate: conversionRate.toFixed(2),
            avgCallDuration: stats.avgCallDuration ? Math.round(stats.avgCallDuration) : null,
            calculatedAt: new Date(),
            updatedAt: new Date(),
          }
        });
    }

    // Clear all leaderboard caches (admin and all agent-specific caches)
    if (redisClient) {
      try {
        // Clear admin cache
        await redisClient.del('leaderboard:current:admin');
        // Clear agent-specific caches (pattern matching)
        const agentCacheKeys = await redisClient.keys('leaderboard:current:agent:*');
        if (agentCacheKeys.length > 0) {
          await redisClient.del(...agentCacheKeys);
        }
      } catch (err) {
        console.warn('Redis del failed for leaderboard cache:', err);
      }
    }

    res.json({ 
      success: true, 
      message: 'Stats refreshed successfully',
      period: period.label,
      agentsUpdated: agentStats.length,
    });
  } catch (error) {
    console.error('Error refreshing leaderboard:', error);
    res.status(500).json({ 
      error: 'Failed to refresh leaderboard',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
