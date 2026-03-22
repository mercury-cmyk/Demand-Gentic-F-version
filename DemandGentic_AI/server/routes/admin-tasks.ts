import { Router, type NextFunction, type Request, type Response } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { requireAuth, requireRole } from "../auth";
import { db } from "../db";
import { adminTodoBoardNotes, adminTodoTasks } from "@shared/schema";

const router = Router();

const taskStatusSchema = z.enum(["todo", "in_progress", "done"]);
const BOARD_VIEWER_ROLES = ["admin", "campaign_manager", "data_ops", "quality_analyst", "agent"] as const;
const BOARD_MANAGER_ROLES = ["admin", "campaign_manager"] as const;

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  assigneeName: z.string().max(120).optional().nullable(),
  details: z.string().max(10000).optional().nullable(),
  needsAttention: z.boolean().optional(),
});

const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    assigneeName: z.string().max(120).nullable().optional(),
    details: z.string().max(10000).nullable().optional(),
    needsAttention: z.boolean().optional(),
    status: taskStatusSchema.optional(),
  })
  .refine((value) => value.title !== undefined || value.assigneeName !== undefined || value.details !== undefined || value.needsAttention !== undefined || value.status !== undefined, {
    message: "No fields provided to update",
  });

const updateBoardNoteSchema = z.object({
  content: z.string().max(20000),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const aiPrioritySchema = z.enum(["urgent", "high", "medium", "low"]);

const aiPlanRequestSchema = z.object({
  objective: z.string().max(1000).optional(),
  maxSuggestions: z.number().int().min(1).max(20).optional(),
});

const aiIssueSchema = z.object({
  issue: z.string().min(1).max(200),
  priority: aiPrioritySchema,
  impact: z.string().min(1).max(500),
  recommendedOwnerRole: z.enum(["admin", "campaign_manager", "data_ops", "quality_analyst", "agent"]).optional(),
});

const aiTaskSuggestionSchema = z.object({
  title: z.string().min(1).max(500),
  details: z.string().max(4000).optional(),
  priority: aiPrioritySchema,
  issue: z.string().min(1).max(200),
  rationale: z.string().max(1200).optional(),
  assigneeName: z.string().max(120).nullable().optional(),
});

const aiPlanResponseSchema = z.object({
  issues: z.array(aiIssueSchema).max(20),
  suggestions: z.array(aiTaskSuggestionSchema).max(30),
});

const applyAiPlanSchema = z.object({
  suggestions: z.array(aiTaskSuggestionSchema).min(1).max(20),
});

type TaskPriority = z.infer;

function getUserRoles(req: Request): string[] {
  const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  if (roles.length > 0) {
    return roles;
  }
  return req.user?.role ? [req.user.role] : [];
}

function hasAnyRole(req: Request, allowedRoles: readonly string[]): boolean {
  const roles = getUserRoles(req);
  return roles.some((role) => allowedRoles.includes(role));
}

function normalizeAssigneeName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : null;
}

function priorityScore(priority: TaskPriority): number {
  switch (priority) {
    case "urgent":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function formatAiTaskDetails(suggestion: z.infer): string {
  const blocks = [
    suggestion.details?.trim() || "",
    `Priority: ${suggestion.priority.toUpperCase()}`,
    `Issue: ${suggestion.issue}`,
    suggestion.rationale?.trim() ? `AI rationale: ${suggestion.rationale.trim()}` : "",
  ].filter(Boolean);

  return blocks.join("\n\n").slice(0, 10000);
}

function getLeastLoadedAssignee(workloads: Map): string | null {
  if (workloads.size === 0) {
    return null;
  }

  let selected: string | null = null;
  let minLoad = Number.POSITIVE_INFINITY;

  for (const [assignee, load] of workloads.entries()) {
    if (load , assigneeName: string | null) {
  if (!assigneeName) {
    return;
  }
  workloads.set(assigneeName, (workloads.get(assigneeName) || 0) + 1);
}

function sanitizeAiSuggestions(
  suggestions: Array>,
  workloads: Map,
  maxSuggestions: number,
) {
  const normalized = suggestions
    .map((raw) => {
      const assigneeName = normalizeAssigneeName(raw.assigneeName) || getLeastLoadedAssignee(workloads);
      if (assigneeName) {
        bumpAssigneeLoad(workloads, assigneeName);
      }

      return {
        title: raw.title.trim().slice(0, 500),
        details: raw.details?.trim().slice(0, 4000) || "",
        priority: raw.priority,
        issue: raw.issue.trim().slice(0, 200),
        rationale: raw.rationale?.trim().slice(0, 1200) || "",
        assigneeName,
      };
    })
    .filter((item) => item.title.length > 0)
    .sort((a, b) => priorityScore(b.priority) - priorityScore(a.priority))
    .slice(0, maxSuggestions);

  return normalized;
}

function buildHeuristicTaskPlan(params: {
  tasks: Array;
  boardNote: string;
  objective: string;
  maxSuggestions: number;
  assigneeWorkload: Map;
}) {
  const { tasks, boardNote, objective, maxSuggestions, assigneeWorkload } = params;
  const openTasks = tasks.filter((task) => task.status !== "done");
  const inProgressTasks = tasks.filter((task) => task.status === "in_progress");
  const atRiskTasks = tasks.filter((task) => task.needsAttention && task.status !== "done");
  const unassignedTasks = openTasks.filter((task) => !task.assigneeName);
  const staleTasks = openTasks.filter((task) => {
    const created = new Date(task.createdAt);
    const ageMs = Date.now() - created.getTime();
    return Number.isFinite(ageMs) && ageMs > 1000 * 60 * 60 * 24 * 10;
  });

  const issues: Array> = [];

  if (atRiskTasks.length > 0) {
    issues.push({
      issue: `${atRiskTasks.length} task(s) flagged at risk`,
      priority: "urgent",
      impact: "Delivery dates may slip without immediate mitigation.",
      recommendedOwnerRole: "campaign_manager",
    });
  }

  if (unassignedTasks.length > 0) {
    issues.push({
      issue: `${unassignedTasks.length} open task(s) without owner`,
      priority: "high",
      impact: "Work can stall because ownership is unclear.",
      recommendedOwnerRole: "campaign_manager",
    });
  }

  if (inProgressTasks.length > Math.max(4, Math.ceil(openTasks.length * 0.7))) {
    issues.push({
      issue: "Execution overload with too many concurrent in-progress tasks",
      priority: "high",
      impact: "Context switching and quality risk increase as parallel work grows.",
      recommendedOwnerRole: "admin",
    });
  }

  if (staleTasks.length > 0) {
    issues.push({
      issue: `${staleTasks.length} open task(s) older than 10 days`,
      priority: "medium",
      impact: "Aging tasks indicate blocked dependencies or unclear scope.",
      recommendedOwnerRole: "quality_analyst",
    });
  }

  if (issues.length === 0) {
    issues.push({
      issue: "No critical blockers detected",
      priority: "low",
      impact: "Board health is stable; focus on throughput improvement.",
      recommendedOwnerRole: "campaign_manager",
    });
  }

  const objectiveText = objective || boardNote || "Team execution cadence";
  const suggestions: Array> = issues.map((issue, index) => {
    const assignee = getLeastLoadedAssignee(assigneeWorkload);
    if (assignee) {
      bumpAssigneeLoad(assigneeWorkload, assignee);
    }

    return {
      title: `${issue.priority.toUpperCase()}: ${issue.issue}`,
      details: `Strategic objective: ${objectiveText}\nAction: Define and execute a mitigation plan for this issue with clear owner and deadline.`,
      priority: issue.priority,
      issue: issue.issue,
      rationale: `Generated from board signals (open tasks, risk flags, ownership, and age).`,
      assigneeName: assignee,
    };
  });

  return {
    engine: "heuristic" as const,
    issues: issues.slice(0, 10),
    suggestions: suggestions.slice(0, maxSuggestions),
  };
}

async function generateAiTaskPlan(params: {
  objective: string;
  boardNote: string;
  maxSuggestions: number;
  tasks: Array;
  assigneeWorkload: Map;
}) {
  const { objective, boardNote, maxSuggestions, tasks } = params;

  const knownAssignees = Array.from(params.assigneeWorkload.entries()).map(([name, load]) => ({
    name,
    activeLoad: load,
  }));

  const compactTasks = tasks.slice(0, 60).map((task) => ({
    title: task.title,
    status: task.status,
    assigneeName: task.assigneeName || null,
    needsAttention: task.needsAttention,
    createdAt: new Date(task.createdAt).toISOString(),
    details: task.details?.slice(0, 300) || "",
  }));

  const prompt = `You are a strategic operations planner for a B2B execution team.
Identify the highest-impact issues, prioritize them, and propose concrete tasks with ownership.

Return strict JSON only with this shape:
{
  "issues": [
    {
      "issue": "short issue title",
      "priority": "urgent|high|medium|low",
      "impact": "why this matters",
      "recommendedOwnerRole": "admin|campaign_manager|data_ops|quality_analyst|agent"
    }
  ],
  "suggestions": [
    {
      "title": "task title",
      "details": "task execution details",
      "priority": "urgent|high|medium|low",
      "issue": "issue this task addresses",
      "rationale": "why this task and owner",
      "assigneeName": "one of known assignee names when possible, else null"
    }
  ]
}

Constraints:
- Focus on actionable execution work.
- Produce at most ${maxSuggestions} suggestions.
- Use known assignees if possible and spread workload.
- If no assignee fits, use null.

Strategic objective:
${objective || "Not provided"}

Strategy notes:
${boardNote || "No shared strategy notes"}

Known assignees with active load:
${JSON.stringify(knownAssignees, null, 2)}

Current board tasks:
${JSON.stringify(compactTasks, null, 2)}
`;

  try {
    const openai = await import("../lib/openai").then((module) => module.default);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You create practical, prioritized task plans for operations teams.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = aiPlanResponseSchema.parse(JSON.parse(raw));
    return {
      engine: "openai" as const,
      issues: parsed.issues,
      suggestions: parsed.suggestions,
    };
  } catch (error) {
    console.error("[Admin To-Do Tasks] AI plan generation failed, using heuristic fallback:", error);
    return buildHeuristicTaskPlan({
      tasks,
      boardNote,
      objective,
      maxSuggestions,
      assigneeWorkload: new Map(params.assigneeWorkload),
    });
  }
}

function requireBoardManager(req: Request, res: Response, next: NextFunction) {
  if (hasAnyRole(req, BOARD_MANAGER_ROLES)) {
    return next();
  }
  return res.status(403).json({ message: "Manager access required for this action" });
}

router.use(requireAuth, requireRole(...BOARD_VIEWER_ROLES));

let ensureSchemaPromise: Promise | null = null;

async function ensureAdminTodoSchema() {
  if (!ensureSchemaPromise) {
    ensureSchemaPromise = (async () => {
      await db.execute(sql`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_todo_task_status') THEN
            CREATE TYPE admin_todo_task_status AS ENUM ('todo', 'in_progress', 'done');
          END IF;
        END $$;
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS admin_todo_tasks (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          title text NOT NULL,
          status admin_todo_task_status NOT NULL DEFAULT 'todo',
          assignee_name varchar(120),
          details text,
          needs_attention boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);

      await db.execute(sql`
        ALTER TABLE admin_todo_tasks
        ADD COLUMN IF NOT EXISTS details text;
      `);
      await db.execute(sql`
        ALTER TABLE admin_todo_tasks
        ADD COLUMN IF NOT EXISTS needs_attention boolean NOT NULL DEFAULT false;
      `);

      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS admin_todo_tasks_status_idx ON admin_todo_tasks(status);
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS admin_todo_tasks_created_at_idx ON admin_todo_tasks(created_at);
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS admin_todo_board_notes (
          id varchar PRIMARY KEY DEFAULT 'shared',
          content text NOT NULL DEFAULT '',
          updated_at timestamptz NOT NULL DEFAULT now(),
          updated_by varchar(255)
        );
      `);
    })().catch((error) => {
      ensureSchemaPromise = null;
      throw error;
    });
  }

  await ensureSchemaPromise;
}

export async function listAdminTasks(_req: Request, res: Response) {
  try {
    await ensureAdminTodoSchema();
    const tasks = await db
      .select({
        id: adminTodoTasks.id,
        title: adminTodoTasks.title,
        status: adminTodoTasks.status,
        assigneeName: adminTodoTasks.assigneeName,
        details: adminTodoTasks.details,
        needsAttention: adminTodoTasks.needsAttention,
        createdAt: adminTodoTasks.createdAt,
        updatedAt: adminTodoTasks.updatedAt,
      })
      .from(adminTodoTasks)
      .orderBy(desc(adminTodoTasks.createdAt));

    res.json(tasks);
  } catch (error: any) {
    console.error("[Admin To-Do Tasks] Failed to list tasks:", error);
    res.status(500).json({ message: "Failed to load tasks" });
  }
}

export async function createAiTaskPlan(req: Request, res: Response) {
  try {
    await ensureAdminTodoSchema();
    const parsed = aiPlanRequestSchema.parse(req.body ?? {});
    const objective = parsed.objective?.trim() || "";
    const maxSuggestions = parsed.maxSuggestions ?? 8;

    const [tasks, noteRows] = await Promise.all([
      db
        .select({
          id: adminTodoTasks.id,
          title: adminTodoTasks.title,
          status: adminTodoTasks.status,
          assigneeName: adminTodoTasks.assigneeName,
          details: adminTodoTasks.details,
          needsAttention: adminTodoTasks.needsAttention,
          createdAt: adminTodoTasks.createdAt,
          updatedAt: adminTodoTasks.updatedAt,
        })
        .from(adminTodoTasks)
        .orderBy(desc(adminTodoTasks.createdAt)),
      db
        .select({
          content: adminTodoBoardNotes.content,
        })
        .from(adminTodoBoardNotes)
        .where(eq(adminTodoBoardNotes.id, "shared"))
        .limit(1),
    ]);

    const boardNote = noteRows[0]?.content || "";
    const assigneeWorkload = tasks.reduce((acc, task) => {
      if (!task.assigneeName || task.status === "done") {
        return acc;
      }
      const current = acc.get(task.assigneeName) || 0;
      acc.set(task.assigneeName, current + 1);
      return acc;
    }, new Map());

    const aiResult = await generateAiTaskPlan({
      objective,
      boardNote,
      maxSuggestions,
      tasks,
      assigneeWorkload,
    });

    const sanitizedSuggestions = sanitizeAiSuggestions(
      aiResult.suggestions,
      new Map(assigneeWorkload),
      maxSuggestions,
    );

    const assignmentSummary = Array.from(
      sanitizedSuggestions.reduce((acc, suggestion) => {
        const key = suggestion.assigneeName || "Unassigned";
        const current = acc.get(key) || { assigneeName: key, plannedTasks: 0, priorities: new Set() };
        current.plannedTasks += 1;
        current.priorities.add(suggestion.priority);
        acc.set(key, current);
        return acc;
      }, new Map }>()),
    ).map(([, value]) => ({
      assigneeName: value.assigneeName,
      plannedTasks: value.plannedTasks,
      priorities: Array.from(value.priorities),
    }));

    res.json({
      engine: aiResult.engine,
      generatedAt: new Date().toISOString(),
      objective: objective || null,
      issues: aiResult.issues.slice(0, 10),
      suggestions: sanitizedSuggestions,
      assignmentSummary,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Invalid AI plan request payload",
        errors: error.flatten(),
      });
    }
    console.error("[Admin To-Do Tasks] Failed to generate AI task plan:", error);
    res.status(500).json({ message: "Failed to generate AI task plan" });
  }
}

export async function applyAiTaskPlan(req: Request, res: Response) {
  try {
    await ensureAdminTodoSchema();
    const parsed = applyAiPlanSchema.parse(req.body ?? {});
    const workloads = (
      await db
        .select({
          assigneeName: adminTodoTasks.assigneeName,
          status: adminTodoTasks.status,
        })
        .from(adminTodoTasks)
    ).reduce((acc, task) => {
      if (task.assigneeName && task.status !== "done") {
        acc.set(task.assigneeName, (acc.get(task.assigneeName) || 0) + 1);
      }
      return acc;
    }, new Map());

    const sanitizedSuggestions = sanitizeAiSuggestions(
      parsed.suggestions,
      workloads,
      parsed.suggestions.length,
    );

    const createdTasks = [];
    for (const suggestion of sanitizedSuggestions) {
      const [task] = await db
        .insert(adminTodoTasks)
        .values({
          title: suggestion.title,
          status: "todo",
          assigneeName: suggestion.assigneeName,
          details: formatAiTaskDetails(suggestion),
          needsAttention: suggestion.priority === "urgent" || suggestion.priority === "high",
        })
        .returning();

      if (task) {
        createdTasks.push(task);
      }
    }

    res.status(201).json({
      createdCount: createdTasks.length,
      createdTasks,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Invalid AI task application payload",
        errors: error.flatten(),
      });
    }
    console.error("[Admin To-Do Tasks] Failed to apply AI task plan:", error);
    res.status(500).json({ message: "Failed to apply AI task plan" });
  }
}

export async function createAdminTask(req: Request, res: Response) {
  try {
    await ensureAdminTodoSchema();
    const parsed = createTaskSchema.parse(req.body);
    const title = parsed.title.trim();
    const assigneeName = parsed.assigneeName?.trim() || null;
    const details = parsed.details?.trim() || null;
    const needsAttention = parsed.needsAttention ?? false;

    const [task] = await db
      .insert(adminTodoTasks)
      .values({
        title,
        status: "todo",
        assigneeName,
        details,
        needsAttention,
      })
      .returning();

    res.status(201).json(task);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Invalid task payload",
        errors: error.flatten(),
      });
    }
    console.error("[Admin To-Do Tasks] Failed to create task:", error);
    res.status(500).json({ message: "Failed to create task" });
  }
}

export async function updateAdminTask(req: Request, res: Response) {
  try {
    await ensureAdminTodoSchema();
    const { id } = idParamSchema.parse(req.params);
    const parsed = updateTaskSchema.parse(req.body);
    const isBoardManager = hasAnyRole(req, BOARD_MANAGER_ROLES);

    if (!isBoardManager) {
      const providedFields = Object.keys(parsed);
      const disallowedFields = providedFields.filter((field) => field !== "status");
      if (disallowedFields.length > 0) {
        return res.status(403).json({
          message: "Only status updates are allowed for your role",
          disallowedFields,
        });
      }
    }

    const updates: Record = {
      updatedAt: new Date(),
    };

    if (parsed.title !== undefined) {
      updates.title = parsed.title.trim();
    }
    if (parsed.assigneeName !== undefined) {
      updates.assigneeName = parsed.assigneeName?.trim() || null;
    }
    if (parsed.details !== undefined) {
      updates.details = parsed.details?.trim() || null;
    }
    if (parsed.needsAttention !== undefined) {
      updates.needsAttention = parsed.needsAttention;
    }
    if (parsed.status !== undefined) {
      updates.status = parsed.status;
    }

    const [task] = await db
      .update(adminTodoTasks)
      .set(updates)
      .where(eq(adminTodoTasks.id, id))
      .returning();

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json(task);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Invalid task update payload",
        errors: error.flatten(),
      });
    }
    console.error("[Admin To-Do Tasks] Failed to update task:", error);
    res.status(500).json({ message: "Failed to update task" });
  }
}

export async function deleteAdminTask(req: Request, res: Response) {
  try {
    await ensureAdminTodoSchema();
    const { id } = idParamSchema.parse(req.params);
    const [deleted] = await db.delete(adminTodoTasks).where(eq(adminTodoTasks.id, id)).returning({ id: adminTodoTasks.id });

    if (!deleted) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.status(204).send();
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid task id" });
    }
    console.error("[Admin To-Do Tasks] Failed to delete task:", error);
    res.status(500).json({ message: "Failed to delete task" });
  }
}

export async function getAdminTodoBoardNote(_req: Request, res: Response) {
  try {
    await ensureAdminTodoSchema();
    let [note] = await db
      .select({
        id: adminTodoBoardNotes.id,
        content: adminTodoBoardNotes.content,
        updatedAt: adminTodoBoardNotes.updatedAt,
        updatedBy: adminTodoBoardNotes.updatedBy,
      })
      .from(adminTodoBoardNotes)
      .where(eq(adminTodoBoardNotes.id, "shared"))
      .limit(1);

    if (!note) {
      [note] = await db
        .insert(adminTodoBoardNotes)
        .values({
          id: "shared",
          content: "",
          updatedBy: null,
        })
        .returning();
    }

    res.json(note);
  } catch (error: any) {
    console.error("[Admin To-Do Tasks] Failed to load board note:", error);
    res.status(500).json({ message: "Failed to load board note" });
  }
}

export async function updateAdminTodoBoardNote(req: Request, res: Response) {
  try {
    await ensureAdminTodoSchema();
    const parsed = updateBoardNoteSchema.parse(req.body);
    const actor = (req.user as any)?.username || (req.user as any)?.email || (req.user as any)?.userId || "admin";

    const [note] = await db
      .insert(adminTodoBoardNotes)
      .values({
        id: "shared",
        content: parsed.content,
        updatedAt: new Date(),
        updatedBy: actor,
      })
      .onConflictDoUpdate({
        target: adminTodoBoardNotes.id,
        set: {
          content: parsed.content,
          updatedAt: new Date(),
          updatedBy: actor,
        },
      })
      .returning();

    res.json(note);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Invalid board note payload",
        errors: error.flatten(),
      });
    }
    console.error("[Admin To-Do Tasks] Failed to save board note:", error);
    res.status(500).json({ message: "Failed to save board note" });
  }
}

router.get("/", listAdminTasks);
router.get("/notes", getAdminTodoBoardNote);
router.post("/ai-plan", createAiTaskPlan);
router.post("/ai-plan/apply", requireBoardManager, applyAiTaskPlan);
router.patch("/:id", updateAdminTask);
router.post("/", requireBoardManager, createAdminTask);
router.put("/notes", requireBoardManager, updateAdminTodoBoardNote);
router.delete("/:id", requireBoardManager, deleteAdminTask);

export default router;