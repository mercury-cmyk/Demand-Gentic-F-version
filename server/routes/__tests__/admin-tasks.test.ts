import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { db } from "../../db";
import { createAdminTask, listAdminTasks, updateAdminTask } from "../admin-tasks";
import { requireRole } from "../../auth";

function createMockResponse() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe("Admin To-Do Tasks handlers", () => {
  const mockedDb = db as any;
  const TASK_ID = "07adf381-fb65-4f53-a00c-7fd0f85eef91";

  beforeEach(() => {
    vi.clearAllMocks();
    mockedDb.execute.mockResolvedValue({});
  });

  it("listAdminTasks returns tasks ordered by newest", async () => {
    const tasks = [
      {
        id: "2f97e7fd-187f-427e-a3fd-7f6780f0b13e",
        title: "Follow up with design team",
        status: "todo",
        assigneeName: "Tabasum",
        createdAt: new Date("2026-02-22T10:00:00.000Z"),
        updatedAt: new Date("2026-02-22T10:00:00.000Z"),
      },
    ];

    const orderBy = vi.fn().mockResolvedValue(tasks);
    const from = vi.fn().mockReturnValue({ orderBy });
    mockedDb.select.mockReturnValue({ from });

    const res = createMockResponse();
    await listAdminTasks({} as any, res as any);

    expect(from).toHaveBeenCalledTimes(1);
    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(tasks);
  });

  it("createAdminTask trims fields and defaults status to todo", async () => {
    const insertedTask = {
      id: TASK_ID,
      title: "Draft Monday checklist",
      status: "todo",
      assigneeName: "Zahid",
      createdAt: new Date("2026-02-22T11:00:00.000Z"),
      updatedAt: new Date("2026-02-22T11:00:00.000Z"),
    };

    const returning = vi.fn().mockResolvedValue([insertedTask]);
    const values = vi.fn().mockReturnValue({ returning });
    mockedDb.insert.mockReturnValue({ values });

    const req = {
      body: {
        title: "  Draft Monday checklist  ",
        assigneeName: "  Zahid ",
      },
    } as any;
    const res = createMockResponse();

    await createAdminTask(req, res as any);

    expect(values).toHaveBeenCalledWith({
      title: "Draft Monday checklist",
      status: "todo",
      assigneeName: "Zahid",
      details: null,
      needsAttention: false,
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(insertedTask);
  });

  it("updateAdminTask blocks non-manager users from editing non-status fields", async () => {
    const req = {
      params: { id: TASK_ID },
      body: { title: "Updated by contributor" },
      user: {
        role: "agent",
        roles: ["agent"],
      },
    } as any;
    const res = createMockResponse();

    await updateAdminTask(req, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Only status updates are allowed for your role",
      disallowedFields: ["title"],
    });
  });

  it("updateAdminTask allows contributors to update status only", async () => {
    const updatedTask = {
      id: TASK_ID,
      title: "Draft Monday checklist",
      status: "in_progress",
      assigneeName: "Zahid",
    };

    const returning = vi.fn().mockResolvedValue([updatedTask]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockedDb.update.mockReturnValue({ set });

    const req = {
      params: { id: TASK_ID },
      body: { status: "in_progress" },
      user: {
        role: "agent",
        roles: ["agent"],
      },
    } as any;
    const res = createMockResponse();

    await updateAdminTask(req, res as any);

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "in_progress" }));
    expect(res.json).toHaveBeenCalledWith(updatedTask);
  });
});

describe("Admin To-Do Tasks auth guard", () => {
  it("blocks non-admin users", () => {
    const middleware = requireRole("admin");
    const req = {
      user: {
        role: "agent",
        roles: ["agent"],
      },
    } as any;
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
