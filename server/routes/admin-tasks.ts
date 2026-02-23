import { Router, type Request, type Response } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { requireAuth, requireRole } from "../auth";
import { db } from "../db";
import { adminTodoTasks } from "@shared/schema";

const router = Router();

const taskStatusSchema = z.enum(["todo", "in_progress", "done"]);

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  assigneeName: z.string().max(120).optional().nullable(),
});

const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    assigneeName: z.string().max(120).nullable().optional(),
    status: taskStatusSchema.optional(),
  })
  .refine((value) => value.title !== undefined || value.assigneeName !== undefined || value.status !== undefined, {
    message: "No fields provided to update",
  });

const idParamSchema = z.object({
  id: z.string().uuid(),
});

router.use(requireAuth, requireRole("admin"));

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
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);

      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS admin_todo_tasks_status_idx ON admin_todo_tasks(status);
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS admin_todo_tasks_created_at_idx ON admin_todo_tasks(created_at);
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

    const [task] = await db
      .insert(adminTodoTasks)
      .values({
        title,
        status: "todo",
        assigneeName,
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

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (parsed.title !== undefined) {
      updates.title = parsed.title.trim();
    }
    if (parsed.assigneeName !== undefined) {
      updates.assigneeName = parsed.assigneeName?.trim() || null;
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

router.get("/", listAdminTasks);
router.post("/", createAdminTask);
router.patch("/:id", updateAdminTask);
router.delete("/:id", deleteAdminTask);

export default router;
