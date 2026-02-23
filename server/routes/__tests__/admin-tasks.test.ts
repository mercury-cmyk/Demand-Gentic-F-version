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
import { createAdminTask, listAdminTasks } from "../admin-tasks";
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
      id: "07adf381-fb65-4f53-a00c-7fd0f85eef91",
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
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(insertedTask);
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
