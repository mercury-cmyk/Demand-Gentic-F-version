import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  financePrograms,
  financeProgramGoals,
  financeProgramMilestones,
  financeProgramExpenses,
  financeAcceleratorChecklist,
  insertFinanceProgramSchema,
  insertFinanceProgramGoalSchema,
  insertFinanceProgramMilestoneSchema,
  insertFinanceProgramExpenseSchema,
  insertFinanceAcceleratorChecklistSchema,
} from "../../shared/schema";
import { eq, and, desc, asc } from "drizzle-orm";

const router = Router();

// ============================================
// PROGRAMS CRUD
// ============================================

// List all programs
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || "default";
    const programs = await db
      .select()
      .from(financePrograms)
      .where(eq(financePrograms.tenantId, tenantId))
      .orderBy(desc(financePrograms.createdAt));
    res.json(programs);
  } catch (error: any) {
    console.error("Error fetching finance programs:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get single program with all related data
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId || "default";

    const [program] = await db
      .select()
      .from(financePrograms)
      .where(and(eq(financePrograms.id, id), eq(financePrograms.tenantId, tenantId)));

    if (!program) {
      return res.status(404).json({ error: "Program not found" });
    }

    const [goals, milestones, expenses, checklist] = await Promise.all([
      db.select().from(financeProgramGoals)
        .where(eq(financeProgramGoals.programId, id))
        .orderBy(asc(financeProgramGoals.priority)),
      db.select().from(financeProgramMilestones)
        .where(eq(financeProgramMilestones.programId, id))
        .orderBy(asc(financeProgramMilestones.weekNumber)),
      db.select().from(financeProgramExpenses)
        .where(eq(financeProgramExpenses.programId, id))
        .orderBy(desc(financeProgramExpenses.date)),
      db.select().from(financeAcceleratorChecklist)
        .where(eq(financeAcceleratorChecklist.programId, id))
        .orderBy(asc(financeAcceleratorChecklist.sortOrder)),
    ]);

    res.json({ ...program, goals, milestones, expenses, checklist });
  } catch (error: any) {
    console.error("Error fetching finance program:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create program
router.post("/", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || "default";
    const data = insertFinanceProgramSchema.parse({ ...req.body, tenantId });

    const [program] = await db.insert(financePrograms).values(data).returning();
    res.status(201).json(program);
  } catch (error: any) {
    console.error("Error creating finance program:", error);
    res.status(400).json({ error: error.message });
  }
});

// Update program
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [program] = await db
      .update(financePrograms)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(financePrograms.id, id))
      .returning();
    res.json(program);
  } catch (error: any) {
    console.error("Error updating finance program:", error);
    res.status(400).json({ error: error.message });
  }
});

// Delete program
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.delete(financePrograms).where(eq(financePrograms.id, id));
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting finance program:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GOALS CRUD
// ============================================

router.post("/:programId/goals", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || "default";
    const { programId } = req.params;
    const data = insertFinanceProgramGoalSchema.parse({ ...req.body, tenantId, programId });

    const [goal] = await db.insert(financeProgramGoals).values(data).returning();
    res.status(201).json(goal);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.patch("/goals/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [goal] = await db
      .update(financeProgramGoals)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(financeProgramGoals.id, id))
      .returning();
    res.json(goal);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete("/goals/:id", async (req: Request, res: Response) => {
  try {
    await db.delete(financeProgramGoals).where(eq(financeProgramGoals.id, req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// MILESTONES CRUD
// ============================================

router.post("/:programId/milestones", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || "default";
    const { programId } = req.params;
    const data = insertFinanceProgramMilestoneSchema.parse({ ...req.body, tenantId, programId });

    const [milestone] = await db.insert(financeProgramMilestones).values(data).returning();
    res.status(201).json(milestone);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.patch("/milestones/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [milestone] = await db
      .update(financeProgramMilestones)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(financeProgramMilestones.id, id))
      .returning();
    res.json(milestone);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete("/milestones/:id", async (req: Request, res: Response) => {
  try {
    await db.delete(financeProgramMilestones).where(eq(financeProgramMilestones.id, req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// EXPENSES CRUD
// ============================================

router.post("/:programId/expenses", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || "default";
    const { programId } = req.params;
    const data = insertFinanceProgramExpenseSchema.parse({ ...req.body, tenantId, programId });

    const [expense] = await db.insert(financeProgramExpenses).values(data).returning();
    res.status(201).json(expense);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete("/expenses/:id", async (req: Request, res: Response) => {
  try {
    await db.delete(financeProgramExpenses).where(eq(financeProgramExpenses.id, req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ACCELERATOR CHECKLIST
// ============================================

router.post("/:programId/checklist", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || "default";
    const { programId } = req.params;
    const data = insertFinanceAcceleratorChecklistSchema.parse({ ...req.body, tenantId, programId });

    const [item] = await db.insert(financeAcceleratorChecklist).values(data).returning();
    res.status(201).json(item);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.patch("/checklist/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [item] = await db
      .update(financeAcceleratorChecklist)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(financeAcceleratorChecklist.id, id))
      .returning();
    res.json(item);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete("/checklist/:id", async (req: Request, res: Response) => {
  try {
    await db.delete(financeAcceleratorChecklist).where(eq(financeAcceleratorChecklist.id, req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SEED DEFAULT YC + TECHSTARS PROGRAM
// ============================================

router.post("/seed-program", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || "default";
    const { accelerator } = req.body; // "yc" or "techstars"

    const now = new Date();
    const targetDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const programName = accelerator === "techstars"
      ? "Techstars Application Program"
      : "Y Combinator Application Program";

    // Create program
    const [program] = await db.insert(financePrograms).values({
      tenantId,
      name: programName,
      description: `30-day accelerator readiness program targeting ${accelerator === "techstars" ? "Techstars" : "Y Combinator"} application`,
      targetAccelerator: accelerator === "techstars" ? "Techstars" : "Y Combinator",
      status: "active",
      startDate: now,
      targetDate,
      totalBudget: 500000, // $5,000
    }).returning();

    // Seed goals
    const goalData = [
      { title: "Sign 5 Pilot Clients", category: "revenue", targetValue: "5 clients", currentValue: "0", priority: 1 },
      { title: "Reach $5K MRR", category: "revenue", targetValue: "$5,000", currentValue: "$0", priority: 2 },
      { title: "Record Product Demo Video", category: "pitch", targetValue: "3-min video", currentValue: "Not started", priority: 3 },
      { title: "Build Pitch Deck", category: "pitch", targetValue: "12 slides", currentValue: "Not started", priority: 4 },
      { title: "Document IP / File Provisional Patent", category: "legal", targetValue: "Filed", currentValue: "Not started", priority: 5 },
      { title: "Get 3 Client Testimonials / Case Studies", category: "metrics", targetValue: "3 studies", currentValue: "0", priority: 6 },
      { title: "Establish Advisory Board (2+ advisors)", category: "team", targetValue: "2 advisors", currentValue: "0", priority: 7 },
      { title: "Set Up Financial Model & Projections", category: "financials", targetValue: "Complete", currentValue: "Not started", priority: 8 },
    ];

    for (const g of goalData) {
      await db.insert(financeProgramGoals).values({
        tenantId,
        programId: program.id,
        ...g,
        dueDate: targetDate,
      });
    }

    // Seed milestones (4 weeks)
    const milestoneData = [
      {
        weekNumber: 1,
        title: "Foundation & Quick Wins",
        description: "Set up financials, start client outreach, begin pitch deck",
        deliverables: ["Financial model draft", "Outreach to 20 prospects", "Pitch deck outline", "Demo video script"],
      },
      {
        weekNumber: 2,
        title: "Traction & Product Polish",
        description: "Sign first pilots, record demo, polish product for demo day",
        deliverables: ["2+ pilot agreements signed", "Demo video recorded", "Product bugs fixed", "Landing page live"],
      },
      {
        weekNumber: 3,
        title: "Validation & Metrics",
        description: "Collect usage data, get testimonials, refine pitch",
        deliverables: ["Client usage metrics dashboard", "2+ testimonials collected", "Pitch deck v2", "Advisory board started"],
      },
      {
        weekNumber: 4,
        title: "Application & Submission",
        description: "Submit application, practice pitch, finalize all materials",
        deliverables: ["Application submitted", "Pitch rehearsed 5+ times", "All documents finalized", "IP filing initiated"],
      },
    ];

    for (const m of milestoneData) {
      const dueDate = new Date(now.getTime() + m.weekNumber * 7 * 24 * 60 * 60 * 1000);
      await db.insert(financeProgramMilestones).values({
        tenantId,
        programId: program.id,
        title: m.title,
        description: m.description,
        weekNumber: m.weekNumber,
        dueDate,
        deliverables: m.deliverables,
      });
    }

    // Seed checklist items
    const accel = accelerator === "techstars" ? "Techstars" : "Y Combinator";
    const checklistData = [
      // Product
      { checklistItem: "Working product / MVP with real users", category: "product", sortOrder: 1 },
      { checklistItem: "Clear product demo (video or live)", category: "product", sortOrder: 2 },
      { checklistItem: "Product handles scale (multi-tenant, reliable)", category: "product", sortOrder: 3 },
      // Traction
      { checklistItem: "Paying customers or signed LOIs", category: "traction", sortOrder: 4 },
      { checklistItem: "Measurable growth metrics (MRR, users, engagement)", category: "traction", sortOrder: 5 },
      { checklistItem: "Client testimonials or case studies", category: "traction", sortOrder: 6 },
      { checklistItem: "Demonstrated product-market fit signals", category: "traction", sortOrder: 7 },
      // Team
      { checklistItem: "Founder(s) working full-time", category: "team", sortOrder: 8 },
      { checklistItem: "Technical co-founder or strong tech capability", category: "team", sortOrder: 9 },
      { checklistItem: "Advisory board / mentors identified", category: "team", sortOrder: 10 },
      // Legal
      { checklistItem: "Company incorporated (C-Corp for YC, LLC acceptable for others)", category: "legal", sortOrder: 11 },
      { checklistItem: "IP assignment agreements signed", category: "legal", sortOrder: 12 },
      { checklistItem: "Provisional patent filed (if applicable)", category: "legal", sortOrder: 13 },
      { checklistItem: "Cap table clean (no complex investor agreements)", category: "legal", sortOrder: 14 },
      // Pitch
      { checklistItem: "1-minute pitch perfected", category: "pitch", sortOrder: 15 },
      { checklistItem: "Pitch deck (10-12 slides)", category: "pitch", sortOrder: 16 },
      { checklistItem: "Clear TAM/SAM/SOM analysis", category: "pitch", sortOrder: 17 },
      { checklistItem: "Competitive landscape mapped", category: "pitch", sortOrder: 18 },
      // Financials
      { checklistItem: "Financial projections (3-year)", category: "financials", sortOrder: 19 },
      { checklistItem: "Clear use-of-funds plan", category: "financials", sortOrder: 20 },
      { checklistItem: "Unit economics understood (CAC, LTV, margins)", category: "financials", sortOrder: 21 },
      { checklistItem: "Bank account and bookkeeping set up", category: "financials", sortOrder: 22 },
    ];

    for (const c of checklistData) {
      await db.insert(financeAcceleratorChecklist).values({
        tenantId,
        programId: program.id,
        accelerator: accel,
        ...c,
      });
    }

    // Re-fetch full program
    const fullProgram = await db.select().from(financePrograms).where(eq(financePrograms.id, program.id));
    const goals = await db.select().from(financeProgramGoals).where(eq(financeProgramGoals.programId, program.id));
    const milestones = await db.select().from(financeProgramMilestones).where(eq(financeProgramMilestones.programId, program.id));
    const checklist = await db.select().from(financeAcceleratorChecklist).where(eq(financeAcceleratorChecklist.programId, program.id));

    res.status(201).json({
      ...fullProgram[0],
      goals,
      milestones,
      expenses: [],
      checklist,
    });
  } catch (error: any) {
    console.error("Error seeding finance program:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;