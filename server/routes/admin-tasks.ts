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

function requireBoardManager(req: Request, res: Response, next: NextFunction) {
  if (hasAnyRole(req, BOARD_MANAGER_ROLES)) {
    return next();
  }
  return res.status(403).json({ message: "Manager access required for this action" });
}

router.use(requireAuth, requireRole(...BOARD_VIEWER_ROLES));

let ensureSchemaPromise: Promise<void> | null = null;

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

    const updates: Record<string, unknown> = {
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
router.patch("/:id", updateAdminTask);
router.post("/", requireBoardManager, createAdminTask);
router.put("/notes", requireBoardManager, updateAdminTodoBoardNote);
router.delete("/:id", requireBoardManager, deleteAdminTask);

export default router;
