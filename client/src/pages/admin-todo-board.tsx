import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import { PageShell } from "@/components/patterns/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { getAssigneeColorTheme } from "@/lib/assignee-colors";

type TaskStatus = "todo" | "in_progress" | "done";

interface AdminTask {
  id: string;
  title: string;
  status: TaskStatus;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
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
  { id: "todo", title: "To Do", emptyMessage: "No tasks in To Do." },
  { id: "in_progress", title: "In Progress", emptyMessage: "No tasks in progress." },
  { id: "done", title: "Done", emptyMessage: "No tasks completed yet." },
];

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export default function AdminTodoBoardPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAssigneeName, setNewAssigneeName] = useState("");

  const { data: tasks = [], isLoading, error } = useQuery<AdminTask[]>({
    queryKey: ["/api/admin/tasks"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/tasks");
      return parseApiJson<AdminTask[]>(response, "/api/admin/tasks");
    },
  });

  const tasksByStatus = useMemo(() => {
    return {
      todo: tasks.filter((task) => task.status === "todo"),
      in_progress: tasks.filter((task) => task.status === "in_progress"),
      done: tasks.filter((task) => task.status === "done"),
    };
  }, [tasks]);

  const createTaskMutation = useMutation({
    mutationFn: async (payload: { title: string; assigneeName?: string }) => {
      const response = await apiRequest("POST", "/api/admin/tasks", payload);
      return parseApiJson<AdminTask>(response, "/api/admin/tasks");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      toast({ title: "Task created", description: "Added to To Do." });
      setIsCreateOpen(false);
      setNewTitle("");
      setNewAssigneeName("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create task", description: err.message, variant: "destructive" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (payload: { id: string; updates: Partial<Pick<AdminTask, "title" | "status" | "assigneeName">> }) => {
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
      toast({ title: "Task removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove task", description: err.message, variant: "destructive" });
    },
  });

  const onCreateTask = () => {
    const title = newTitle.trim();
    if (!title) {
      toast({ title: "Task title is required", variant: "destructive" });
      return;
    }

    createTaskMutation.mutate({
      title,
      assigneeName: newAssigneeName.trim() || undefined,
    });
  };

  return (
    <PageShell
      title="To-Do Board"
      description="Admin-only task board for quick assignment and status tracking."
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "To-Do Board" },
      ]}
      actions={
        <Button onClick={() => setIsCreateOpen(true)} data-testid="todo-new-task">
          <Plus className="h-4 w-4 mr-2" />
          New Task
        </Button>
      }
    >
      <div className="p-4 md:p-6">
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
                              <p className="text-sm font-medium leading-snug">{task.title}</p>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 shrink-0"
                                onClick={() => deleteTaskMutation.mutate(task.id)}
                                disabled={deleteTaskMutation.isPending}
                                aria-label="Delete task"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>

                            <div className="flex items-center gap-2 text-xs">
                              <Badge variant="outline" className={theme.badgeClass}>
                                {task.assigneeName || "Unassigned"}
                              </Badge>
                              <span className={cn("text-xs", theme.accentClass)}>
                                {new Date(task.createdAt).toLocaleDateString()}
                              </span>
                            </div>

                            <Select
                              value={task.status}
                              onValueChange={(value: TaskStatus) =>
                                updateTaskMutation.mutate({
                                  id: task.id,
                                  updates: { status: value },
                                })
                              }
                            >
                              <SelectTrigger className="h-8" data-testid={`todo-status-${task.id}`}>
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

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
            <DialogDescription>
              Add a task to the board. It will start in the To Do column.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="todo-title">Task</Label>
              <Input
                id="todo-title"
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="Enter task title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="todo-assignee">Assignee</Label>
              <Input
                id="todo-assignee"
                value={newAssigneeName}
                onChange={(event) => setNewAssigneeName(event.target.value)}
                placeholder="Optional assignee name"
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
    </PageShell>
  );
}
