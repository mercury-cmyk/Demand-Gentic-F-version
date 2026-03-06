import { Router, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";

import {
  AI_GOVERNANCE_ENTITY_ID,
  aiGovernanceUpdateSchema,
} from "@shared/ai-governance";
import { aiModelGovernance, auditLogs } from "@shared/schema";

import { requireAuth, requireRole } from "../auth";
import { db } from "../db";
import {
  clearAiModelGovernanceCache,
  getAiGovernanceUiPayload,
  getAiModelGovernanceSnapshot,
} from "../services/ai-model-governance";

const router = Router();

router.use(requireAuth, requireRole("admin", "campaign_manager"));

router.get("/", async (_req: Request, res: Response) => {
  try {
    const payload = await getAiGovernanceUiPayload();
    res.json(payload);
  } catch (error) {
    console.error("[AiGovernance] Failed to load governance config:", error);
    res.status(500).json({ message: "Failed to load AI governance configuration" });
  }
});

router.get("/history", async (_req: Request, res: Response) => {
  try {
    const history = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        changesJson: auditLogs.changesJson,
        createdAt: auditLogs.createdAt,
        userId: auditLogs.userId,
      })
      .from(auditLogs)
      .where(and(
        eq(auditLogs.entityType, "ai_model_governance"),
        eq(auditLogs.entityId, AI_GOVERNANCE_ENTITY_ID),
      ))
      .orderBy(desc(auditLogs.createdAt))
      .limit(25);

    res.json({ history });
  } catch (error) {
    console.error("[AiGovernance] Failed to load governance history:", error);
    res.status(500).json({ message: "Failed to load AI governance history" });
  }
});

router.put("/", async (req: Request, res: Response) => {
  try {
    const parsed = aiGovernanceUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid AI governance payload",
        issues: parsed.error.issues,
      });
    }

    const { policies, changeSummary } = parsed.data;
    const userId = req.user?.userId ?? null;

    const previousSnapshot = await getAiModelGovernanceSnapshot(true);
    const [existingRecord] = await db
      .select()
      .from(aiModelGovernance)
      .orderBy(desc(aiModelGovernance.updatedAt))
      .limit(1);

    if (existingRecord) {
      await db
        .update(aiModelGovernance)
        .set({
          version: existingRecord.version + 1,
          policies,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(aiModelGovernance.id, existingRecord.id));
    } else {
      await db.insert(aiModelGovernance).values({
        version: 1,
        policies,
        updatedBy: userId,
      });
    }

    await db.insert(auditLogs).values({
      userId,
      action: "ai_model_governance.updated",
      entityType: "ai_model_governance",
      entityId: AI_GOVERNANCE_ENTITY_ID,
      changesJson: {
        changeSummary: changeSummary || null,
        before: previousSnapshot.policies,
        after: policies,
      },
      ipAddress: req.ip || null,
    });

    clearAiModelGovernanceCache();
    const payload = await getAiGovernanceUiPayload();

    res.json({
      message: "AI governance updated successfully",
      ...payload,
    });
  } catch (error) {
    console.error("[AiGovernance] Failed to update governance config:", error);
    res.status(500).json({ message: "Failed to update AI governance configuration" });
  }
});

export default router;
