import { Router } from "express";
import { db } from "../db";
import { 
  virtualAgents, 
  campaignAgentAssignments, 
  campaigns,
  users,
  campaignQueue
} from "@shared/schema";
import { eq, and, desc, or, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";
import { z } from "zod";

const router = Router();

const assignAgentsSchema = z.object({
  humanAgentIds: z.array(z.string()).optional().default([]),
  virtualAgentIds: z.array(z.string()).optional().default([]),
});

router.get("/:campaignId/hybrid-agents", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const assignments = await db
      .select({
        id: campaignAgentAssignments.id,
        campaignId: campaignAgentAssignments.campaignId,
        agentId: campaignAgentAssignments.agentId,
        virtualAgentId: campaignAgentAssignments.virtualAgentId,
        agentType: campaignAgentAssignments.agentType,
        assignedAt: campaignAgentAssignments.assignedAt,
        isActive: campaignAgentAssignments.isActive,
        humanAgentFirstName: users.firstName,
        humanAgentLastName: users.lastName,
        virtualAgentName: virtualAgents.name,
        virtualAgentProvider: virtualAgents.provider,
      })
      .from(campaignAgentAssignments)
      .leftJoin(users, eq(users.id, campaignAgentAssignments.agentId))
      .leftJoin(virtualAgents, eq(virtualAgents.id, campaignAgentAssignments.virtualAgentId))
      .where(
        and(
          eq(campaignAgentAssignments.campaignId, campaignId),
          eq(campaignAgentAssignments.isActive, true)
        )
      )
      .orderBy(campaignAgentAssignments.agentType, desc(campaignAgentAssignments.assignedAt));
    
    const humanAgents = assignments.filter(a => a.agentType === 'human').map(a => ({
      id: a.agentId,
      name: [a.humanAgentFirstName, a.humanAgentLastName].filter(Boolean).join(' ') || 'Unknown',
      type: 'human' as const,
      assignedAt: a.assignedAt,
    }));
    
    const aiAgents = assignments.filter(a => a.agentType === 'ai').map(a => ({
      id: a.virtualAgentId,
      name: a.virtualAgentName,
      provider: a.virtualAgentProvider,
      type: 'ai' as const,
      assignedAt: a.assignedAt,
    }));
    
    res.json({
      humanAgents,
      aiAgents,
      totalAgents: assignments.length,
    });
  } catch (error) {
    console.error("[Hybrid Agents] Error fetching campaign agents:", error);
    res.status(500).json({ message: "Failed to fetch campaign agents" });
  }
});

router.post("/:campaignId/hybrid-agents", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { humanAgentIds, virtualAgentIds } = assignAgentsSchema.parse(req.body);
    const userId = req.user!.userId;
    
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }
    
    const results = {
      humanAgentsAssigned: 0,
      virtualAgentsAssigned: 0,
      errors: [] as string[],
    };
    
    for (const agentId of humanAgentIds) {
      try {
        const existingActive = await db
          .select()
          .from(campaignAgentAssignments)
          .where(
            and(
              eq(campaignAgentAssignments.agentId, agentId),
              eq(campaignAgentAssignments.agentType, 'human'),
              eq(campaignAgentAssignments.isActive, true)
            )
          );
        
        for (const existing of existingActive) {
          if (existing.campaignId !== campaignId) {
            await db
              .update(campaignAgentAssignments)
              .set({ isActive: false, releasedAt: new Date() })
              .where(eq(campaignAgentAssignments.id, existing.id));
          }
        }
        
        const [existingOnCampaign] = await db
          .select()
          .from(campaignAgentAssignments)
          .where(
            and(
              eq(campaignAgentAssignments.campaignId, campaignId),
              eq(campaignAgentAssignments.agentId, agentId),
              eq(campaignAgentAssignments.agentType, 'human')
            )
          )
          .limit(1);
        
        if (existingOnCampaign) {
          if (!existingOnCampaign.isActive) {
            await db
              .update(campaignAgentAssignments)
              .set({ isActive: true, releasedAt: null, assignedAt: new Date() })
              .where(eq(campaignAgentAssignments.id, existingOnCampaign.id));
          }
        } else {
          await db
            .insert(campaignAgentAssignments)
            .values({
              campaignId,
              agentId,
              agentType: 'human',
              assignedBy: userId,
            });
        }
        
        results.humanAgentsAssigned++;
      } catch (err) {
        results.errors.push(`Failed to assign human agent ${agentId}: ${err}`);
      }
    }
    
    for (const virtualAgentId of virtualAgentIds) {
      try {
        console.log(`[Hybrid Agents] Assigning virtual agent ${virtualAgentId} to campaign ${campaignId}`);
        
        const [existingOnCampaign] = await db
          .select()
          .from(campaignAgentAssignments)
          .where(
            and(
              eq(campaignAgentAssignments.campaignId, campaignId),
              eq(campaignAgentAssignments.virtualAgentId, virtualAgentId),
              eq(campaignAgentAssignments.agentType, 'ai')
            )
          )
          .limit(1);
        
        if (existingOnCampaign) {
          console.log(`[Hybrid Agents] Found existing assignment, isActive: ${existingOnCampaign.isActive}`);
          if (!existingOnCampaign.isActive) {
            await db
              .update(campaignAgentAssignments)
              .set({ isActive: true, releasedAt: null, assignedAt: new Date() })
              .where(eq(campaignAgentAssignments.id, existingOnCampaign.id));
          }
          results.virtualAgentsAssigned++;
        } else {
          console.log(`[Hybrid Agents] Inserting new virtual agent assignment`);
          await db
            .insert(campaignAgentAssignments)
            .values({
              campaignId,
              virtualAgentId,
              agentType: 'ai',
              assignedBy: userId,
            });
          results.virtualAgentsAssigned++;
        }
        
        console.log(`[Hybrid Agents] Successfully assigned virtual agent ${virtualAgentId}`);
      } catch (err) {
        console.error(`[Hybrid Agents] Error assigning virtual agent ${virtualAgentId}:`, err);
        results.errors.push(`Failed to assign virtual agent ${virtualAgentId}: ${err}`);
      }
    }
    
    const totalRequested = humanAgentIds.length + virtualAgentIds.length;
    const totalAssigned = results.humanAgentsAssigned + results.virtualAgentsAssigned;
    
    if (totalAssigned === 0 && totalRequested > 0) {
      return res.status(400).json({
        message: "All agent assignments failed",
        ...results,
      });
    } else if (results.errors.length > 0) {
      return res.status(207).json({
        message: "Some agent assignments failed",
        ...results,
      });
    }
    
    res.json({
      message: "Agents assigned successfully",
      ...results,
    });
  } catch (error) {
    console.error("[Hybrid Agents] Error assigning agents:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to assign agents" });
  }
});

router.delete("/:campaignId/hybrid-agents/:agentType/:agentId", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { campaignId, agentType, agentId } = req.params;
    
    if (agentType !== 'human' && agentType !== 'ai') {
      return res.status(400).json({ message: "Invalid agent type. Must be 'human' or 'ai'" });
    }
    
    const whereCondition = agentType === 'human'
      ? and(
          eq(campaignAgentAssignments.campaignId, campaignId),
          eq(campaignAgentAssignments.agentId, agentId),
          eq(campaignAgentAssignments.agentType, 'human')
        )
      : and(
          eq(campaignAgentAssignments.campaignId, campaignId),
          eq(campaignAgentAssignments.virtualAgentId, agentId),
          eq(campaignAgentAssignments.agentType, 'ai')
        );
    
    await db
      .update(campaignAgentAssignments)
      .set({ isActive: false, releasedAt: new Date() })
      .where(whereCondition);
    
    res.json({ message: "Agent removed from campaign successfully" });
  } catch (error) {
    console.error("[Hybrid Agents] Error removing agent:", error);
    res.status(500).json({ message: "Failed to remove agent from campaign" });
  }
});

router.patch("/:campaignId/queue/:queueItemId/target-agent", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { campaignId, queueItemId } = req.params;
    const { targetAgentType, virtualAgentId } = req.body;
    
    if (!['human', 'ai', 'any'].includes(targetAgentType)) {
      return res.status(400).json({ message: "Invalid target agent type" });
    }
    
    if (targetAgentType === 'ai' && virtualAgentId) {
      const [validAgent] = await db
        .select()
        .from(campaignAgentAssignments)
        .where(
          and(
            eq(campaignAgentAssignments.campaignId, campaignId),
            eq(campaignAgentAssignments.virtualAgentId, virtualAgentId),
            eq(campaignAgentAssignments.isActive, true)
          )
        )
        .limit(1);
      
      if (!validAgent) {
        return res.status(400).json({
          message: "Virtual agent is not assigned to this campaign",
        });
      }
    }
    
    const [updated] = await db
      .update(campaignQueue)
      .set({
        targetAgentType,
        virtualAgentId: targetAgentType === 'ai' ? virtualAgentId : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(campaignQueue.id, queueItemId),
          eq(campaignQueue.campaignId, campaignId)
        )
      )
      .returning();
    
    if (!updated) {
      return res.status(404).json({ message: "Queue item not found" });
    }
    
    res.json(updated);
  } catch (error) {
    console.error("[Hybrid Agents] Error updating queue target:", error);
    res.status(500).json({ message: "Failed to update queue target agent type" });
  }
});

router.post("/:campaignId/queue/bulk-target", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { queueItemIds, targetAgentType, virtualAgentId } = req.body;
    
    if (!Array.isArray(queueItemIds) || queueItemIds.length === 0) {
      return res.status(400).json({ message: "queueItemIds array is required" });
    }
    
    if (!['human', 'ai', 'any'].includes(targetAgentType)) {
      return res.status(400).json({ message: "Invalid target agent type" });
    }
    
    if (targetAgentType === 'ai' && virtualAgentId) {
      const [validAgent] = await db
        .select()
        .from(campaignAgentAssignments)
        .where(
          and(
            eq(campaignAgentAssignments.campaignId, campaignId),
            eq(campaignAgentAssignments.virtualAgentId, virtualAgentId),
            eq(campaignAgentAssignments.isActive, true)
          )
        )
        .limit(1);
      
      if (!validAgent) {
        return res.status(400).json({
          message: "Virtual agent is not assigned to this campaign",
        });
      }
    }
    
    await db
      .update(campaignQueue)
      .set({
        targetAgentType,
        virtualAgentId: targetAgentType === 'ai' ? virtualAgentId : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(campaignQueue.campaignId, campaignId),
          inArray(campaignQueue.id, queueItemIds)
        )
      );
    
    res.json({
      message: "Queue items updated successfully",
      updatedCount: queueItemIds.length,
    });
  } catch (error) {
    console.error("[Hybrid Agents] Error bulk updating queue targets:", error);
    res.status(500).json({ message: "Failed to bulk update queue targets" });
  }
});

export default router;
