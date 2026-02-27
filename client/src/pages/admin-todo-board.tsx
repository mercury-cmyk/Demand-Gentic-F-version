import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Save, Trash2 } from "lucide-react";

import { PageShell } from "@/components/patterns/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { getAssigneeColorTheme } from "@/lib/assignee-colors";

type TaskStatus = "todo" | "in_progress" | "done";

interface AdminTask {
  id: string;
  title: string;
  status: TaskStatus;
  assigneeName: string | null;
  details: string | null;
  needsAttention: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BoardNote {
  id: string;
  content: string;
  updatedAt: string;
  updatedBy: string | null;
}

async function parseApiJson<T>(response: Response, endpoint: string): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const bodyText = await response.text();

  if (!contentType.includes("application/json")) {
    throw new Error(
      `Unexpected non-JSON response from ${endpoint}. Restart dev server and verify admin auth.`,
    );
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch {
    throw new Error(`Invalid JSON response from ${endpoint}.`);
  }
}

const COLUMNS: Array<{ id: TaskStatus; title: string; emptyMessage: string }> = [
  { id: "todo", title: "Backlog", emptyMessage: "No strategic tasks in backlog." },
  { id: "in_progress", title: "Execution", emptyMessage: "No tasks currently in execution." },
  { id: "done", title: "Delivered", emptyMessage: "No delivered outcomes yet." },
];

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Backlog",
  in_progress: "Execution",
  done: "Delivered",
};

const BOARD_MANAGER_ROLES = ["admin", "campaign_manager"] as const;
const BOARD_CONTRIBUTOR_ROLES = ["data_ops", "quality_analyst", "agent"] as const;

const normalizeRole = (role: unknown): string | null => {
  if (typeof role !== "string") {
    return null;
  }
  const trimmed = role.trim().toLowerCase();
  return trimmed ? trimmed : null;
};

const normalizeRoles = (roles: unknown): string[] => {
  if (!roles) {
    return [];
  }

  const roleList = Array.isArray(roles) ? roles : [roles];
  const normalized = roleList.flatMap((role) => {
    const resolved = normalizeRole(role);
    if (!resolved) {
      return [];
    }
    if (resolved.includes(",") || resolved.includes(" ")) {
      return resolved
        .split(/[,\s]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    return [resolved];
  });

  return Array.from(new Set(normalized));
};

export default function AdminTodoBoardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newAssigneeName, setNewAssigneeName] = useState("");
  const [newDetails, setNewDetails] = useState("");

  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAssigneeName, setEditAssigneeName] = useState("");
  const [editDetails, setEditDetails] = useState("");
  const [editStatus, setEditStatus] = useState<TaskStatus>("todo");
  const [editNeedsAttention, setEditNeedsAttention] = useState(false);

  const [noteDraft, setNoteDraft] = useState("");

  const { data: tasks = [], isLoading, error } = useQuery<AdminTask[]>({
    queryKey: ["/api/admin/tasks"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/tasks");
      return parseApiJson<AdminTask[]>(response, "/api/admin/tasks");
    },
  });

  const { data: boardNote, isLoading: isLoadingBoardNote } = useQuery<BoardNote>({
    queryKey: ["/api/admin/todo-board/notes"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/todo-board/notes");
      return parseApiJson<BoardNote>(response, "/api/admin/todo-board/notes");
    },
  });

  useEffect(() => {
    if (boardNote) {
      setNoteDraft(boardNote.content || "");
    }
  }, [boardNote]);

  const isNoteDirty = (boardNote?.content || "") !== noteDraft;

  const tasksByStatus = useMemo(() => {
    return {
      todo: tasks.filter((task) => task.status === "todo"),
      in_progress: tasks.filter((task) => task.status === "in_progress"),
      done: tasks.filter((task) => task.status === "done"),
    };
  }, [tasks]);

  const userRoles = useMemo(() => {
    const roleSet = new Set<string>([
      ...normalizeRoles((user as any)?.roles),
      ...normalizeRoles((user as any)?.role),
    ]);
    return Array.from(roleSet);
  }, [user]);

  const canManageBoard = userRoles.some((role) => BOARD_MANAGER_ROLES.includes(role as (typeof BOARD_MANAGER_ROLES)[number]));
  const canUpdateStatus =
    canManageBoard ||
    userRoles.some((role) => BOARD_CONTRIBUTOR_ROLES.includes(role as (typeof BOARD_CONTRIBUTOR_ROLES)[number]));

  const strategicMetrics = useMemo(() => {
    const total = tasks.length;
    const delivered = tasksByStatus.done.length;
    const atRisk = tasks.filter((task) => task.needsAttention && task.status !== "done").length;
    const unassigned = tasks.filter((task) => !task.assigneeName).length;
    const completionRate = total > 0 ? Math.round((delivered / total) * 100) : 0;

    return { total, delivered, atRisk, unassigned, completionRate };
  }, [tasks, tasksByStatus]);

  const createTaskMutation = useMutation({
    mutationFn: async (payload: { title: string; assigneeName?: string; details?: string }) => {
      const response = await apiRequest("POST", "/api/admin/tasks", payload);
      return parseApiJson<AdminTask>(response, "/api/admin/tasks");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      toast({ title: "Strategic task created", description: "Added to backlog." });
      setIsCreateOpen(false);
      setNewTitle("");
      setNewAssigneeName("");
      setNewDetails("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create task", description: err.message, variant: "destructive" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      updates: Partial<Pick<AdminTask, "title" | "status" | "assigneeName" | "details" | "needsAttention">>;
    }) => {
      const response = await apiRequest("PATCH", `/api/admin/tasks/${payload.id}`, payload.updates);
      return parseApiJson<AdminTask>(response, `/api/admin/tasks/${payload.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update task", description: err.message, variant: "destructive" });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      toast({ title: "Strategic task removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove task", description: err.message, variant: "destructive" });
    },
  });

  const saveBoardNoteMutation = useMutation({
    mutationFn: async (payload: { content: string }) => {
      const response = await apiRequest("PUT", "/api/admin/todo-board/notes", payload);
      return parseApiJson<BoardNote>(response, "/api/admin/todo-board/notes");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/todo-board/notes"] });
      toast({ title: "Strategy notes saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save note", description: err.message, variant: "destructive" });
    },
  });

  const onCreateTask = () => {
    if (!canManageBoard) {
      toast({ title: "Manager access required", description: "Only managers can create strategic tasks.", variant: "destructive" });
      return;
    }

    const title = newTitle.trim();
    if (!title) {
      toast({ title: "Task objective is required", variant: "destructive" });
      return;
    }

    createTaskMutation.mutate({
      title,
      assigneeName: newAssigneeName.trim() || undefined,
      details: newDetails.trim() || undefined,
    });
  };

  const openEditTask = (task: AdminTask) => {
    setEditTaskId(task.id);
    setEditTitle(task.title);
    setEditAssigneeName(task.assigneeName || "");
    setEditDetails(task.details || "");
    setEditStatus(task.status);
    setEditNeedsAttention(task.needsAttention || false);
    setIsEditOpen(true);
  };

  const onSaveTaskEdit = () => {
    if (!canManageBoard) {
      toast({ title: "Manager access required", description: "Only managers can edit task details.", variant: "destructive" });
      return;
    }

    if (!editTaskId) return;
    const title = editTitle.trim();
    if (!title) {
      toast({ title: "Task objective is required", variant: "destructive" });
      return;
    }

    updateTaskMutation.mutate(
      {
        id: editTaskId,
        updates: {
          title,
          assigneeName: editAssigneeName.trim() || null,
          details: editDetails.trim() || null,
          status: editStatus,
          needsAttention: editNeedsAttention,
        },
      },
      {
        onSuccess: () => {
          setIsEditOpen(false);
          setEditTaskId(null);
          toast({ title: "Strategic task updated" });
        },
      },
    );
  };

  const onSaveStickyNote = () => {
    if (!canManageBoard) {
      toast({ title: "Manager access required", description: "Only managers can update strategy notes.", variant: "destructive" });
      return;
    }

    saveBoardNoteMutation.mutate({ content: noteDraft });
  };

  return (
    <PageShell
      title="Strategic Task Management"
      description="Role-aware team board for planning, execution tracking, and outcome delivery."
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Strategic Task Management" },
      ]}
      actions={
        canManageBoard ? (
          <Button onClick={() => setIsCreateOpen(true)} data-testid="todo-new-task">
            <Plus className="h-4 w-4 mr-2" />
            New Strategic Task
          </Button>
        ) : null
      }
    >
      <div className="p-4 md:p-6 space-y-4">
        <Card>
          <CardContent className="pt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Team Visibility Mode</p>
              <p className="text-xs text-muted-foreground">
                {canManageBoard
                  ? "Manager mode: full access to create tasks, assign owners, edit scope, and update strategy notes."
                  : "Contributor mode: update task status while managers maintain ownership, scope, and strategy notes."}
              </p>
            </div>
            <Badge variant={canManageBoard ? "default" : "secondary"}>
              {canManageBoard ? "Manager Access" : "Contributor Access"}
            </Badge>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-4 space-y-1">
              <p className="text-xs text-muted-foreground">Total Strategic Tasks</p>
              <p className="text-2xl font-semibold">{strategicMetrics.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 space-y-1">
              <p className="text-xs text-muted-foreground">Delivered Outcomes</p>
              <p className="text-2xl font-semibold">{strategicMetrics.delivered}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 space-y-1">
              <p className="text-xs text-muted-foreground">Completion Rate</p>
              <p className="text-2xl font-semibold">{strategicMetrics.completionRate}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 space-y-1">
              <p className="text-xs text-muted-foreground">At Risk / Unassigned</p>
              <p className="text-2xl font-semibold">
                {strategicMetrics.atRisk} / {strategicMetrics.unassigned}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Card className="w-full md:w-[360px] border-amber-300 bg-amber-50/70 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Team Strategy Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="Shared priorities, dependencies, risks, and next decisions..."
                className="min-h-[120px] bg-amber-100/60 border-amber-300 focus-visible:ring-amber-400"
                data-testid="todo-sticky-notes-input"
                readOnly={!canManageBoard}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-amber-900/70">
                  {isLoadingBoardNote
                    ? "Loading..."
                    : boardNote?.updatedAt
                      ? `Updated ${new Date(boardNote.updatedAt).toLocaleString()}`
                      : "Shared strategic context"}
                </p>
                <Button
                  size="sm"
                  onClick={onSaveStickyNote}
                  disabled={!canManageBoard || !isNoteDirty || saveBoardNoteMutation.isPending}
                  data-testid="todo-sticky-notes-save"
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {canManageBoard ? "Save" : "Manager Only"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading tasks...</div>
        ) : error ? (
          <div className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load tasks."}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {COLUMNS.map((column) => {
              const columnTasks = tasksByStatus[column.id];
              return (
                <Card key={column.id} className="min-h-[360px]">
                  <CardHeader className="pb-3 border-b">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{column.title}</CardTitle>
                      <Badge variant="secondary">{columnTasks.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3">
                    {columnTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{column.emptyMessage}</p>
                    ) : (
                      columnTasks.map((task) => {
                        const theme = getAssigneeColorTheme(task.assigneeName);
                        const isDone = column.id === "done" || task.status === "done";
                        const showWarning = column.id === "in_progress" && task.needsAttention;
                        return (
                          <div
                            key={task.id}
                            className={cn(
                              "rounded-lg border border-border border-l-4 p-3 space-y-3",
                              theme.cardClass,
                            )}
                            data-testid={`todo-task-${task.id}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1 min-w-0">
                                <p
                                  className={cn(
                                    "text-sm font-medium leading-snug break-words",
                                    isDone && "text-red-700",
                                  )}
                                  style={
                                    isDone
                                      ? {
                                          textDecorationLine: "line-through",
                                          textDecorationColor: "#dc2626",
                                          textDecorationThickness: "2px",
                                        }
                                      : undefined
                                  }
                                >
                                  {task.title}
                                </p>
                                {task.details && (
                                  <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                                    {task.details}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {showWarning && (
                                  <div className="relative h-5 w-5" aria-label="Task warning">
                                    <div className="absolute inset-0 [clip-path:polygon(50%_0%,0%_100%,100%_100%)] bg-orange-500" />
                                    <span className="absolute left-1/2 top-[56%] -translate-x-1/2 -translate-y-1/2 text-[10px] font-black text-black">
                                      !
                                    </span>
                                  </div>
                                )}
                                {canManageBoard && (
                                  <>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() => openEditTask(task)}
                                      aria-label="Edit task"
                                      data-testid={`todo-edit-${task.id}`}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() => deleteTaskMutation.mutate(task.id)}
                                      disabled={deleteTaskMutation.isPending}
                                      aria-label="Delete task"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-xs">
                              <Badge variant="outline" className={theme.badgeClass}>
                                {task.assigneeName || "Unassigned owner"}
                              </Badge>
                              <span className={cn("text-xs", theme.accentClass)}>
                                Created {new Date(task.createdAt).toLocaleDateString()}
                              </span>
                            </div>

                            <Select
                              value={task.status}
                              onValueChange={(value: TaskStatus) => {
                                if (!canUpdateStatus) return;
                                updateTaskMutation.mutate({
                                  id: task.id,
                                  updates: { status: value },
                                });
                              }}
                            >
                              <SelectTrigger
                                className="h-8"
                                data-testid={`todo-status-${task.id}`}
                                disabled={!canUpdateStatus || updateTaskMutation.isPending}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="todo">{STATUS_LABELS.todo}</SelectItem>
                                <SelectItem value="in_progress">{STATUS_LABELS.in_progress}</SelectItem>
                                <SelectItem value="done">{STATUS_LABELS.done}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {canManageBoard && (
        <>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Strategic Task</DialogTitle>
                <DialogDescription>
                  Add a strategic objective to the board. It will start in backlog.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="todo-title">Strategic Objective</Label>
                  <Input
                    id="todo-title"
                    value={newTitle}
                    onChange={(event) => setNewTitle(event.target.value)}
                    placeholder="Define the objective"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="todo-assignee">Owner</Label>
                  <Input
                    id="todo-assignee"
                    value={newAssigneeName}
                    onChange={(event) => setNewAssigneeName(event.target.value)}
                    placeholder="Assign a team owner"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="todo-details">Execution Notes</Label>
                  <Textarea
                    id="todo-details"
                    value={newDetails}
                    onChange={(event) => setNewDetails(event.target.value)}
                    placeholder="Scope, blockers, dependencies, or success criteria"
                    className="min-h-[100px]"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={onCreateTask} disabled={createTaskMutation.isPending}>
                  Create Task
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Strategic Task</DialogTitle>
                <DialogDescription>
                  Update objective, owner, delivery notes, and status.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="todo-edit-title">Strategic Objective</Label>
                  <Input
                    id="todo-edit-title"
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    placeholder="Define the objective"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="todo-edit-assignee">Owner</Label>
                  <Input
                    id="todo-edit-assignee"
                    value={editAssigneeName}
                    onChange={(event) => setEditAssigneeName(event.target.value)}
                    placeholder="Assign a team owner"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="todo-edit-details">Execution Notes</Label>
                  <Textarea
                    id="todo-edit-details"
                    value={editDetails}
                    onChange={(event) => setEditDetails(event.target.value)}
                    placeholder="Scope, blockers, dependencies, or success criteria"
                    className="min-h-[120px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="todo-edit-status">Stage</Label>
                  <Select value={editStatus} onValueChange={(value: TaskStatus) => setEditStatus(value)}>
                    <SelectTrigger id="todo-edit-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">{STATUS_LABELS.todo}</SelectItem>
                      <SelectItem value="in_progress">{STATUS_LABELS.in_progress}</SelectItem>
                      <SelectItem value="done">{STATUS_LABELS.done}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="space-y-1">
                    <Label htmlFor="todo-edit-warning">Flag as at risk</Label>
                    <p className="text-xs text-muted-foreground">
                      Shows an orange warning marker while this task is in execution.
                    </p>
                  </div>
                  <Switch
                    id="todo-edit-warning"
                    checked={editNeedsAttention}
                    onCheckedChange={setEditNeedsAttention}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={onSaveTaskEdit} disabled={updateTaskMutation.isPending}>
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </PageShell>
  );
}
