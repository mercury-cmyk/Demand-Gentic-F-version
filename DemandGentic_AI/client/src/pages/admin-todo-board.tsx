import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Save, Sparkles, Trash2 } from "lucide-react";

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

type TaskPriority = "urgent" | "high" | "medium" | "low";

interface AiIssue {
  issue: string;
  priority: TaskPriority;
  impact: string;
  recommendedOwnerRole?: "admin" | "campaign_manager" | "data_ops" | "quality_analyst" | "agent";
}

interface AiTaskSuggestion {
  title: string;
  details: string;
  priority: TaskPriority;
  issue: string;
  rationale: string;
  assigneeName: string | null;
}

interface AiAssignmentSummary {
  assigneeName: string;
  plannedTasks: number;
  priorities: string[];
}

interface AiTaskPlanResponse {
  engine: "openai" | "heuristic";
  generatedAt: string;
  objective: string | null;
  issues: AiIssue[];
  suggestions: AiTaskSuggestion[];
  assignmentSummary: AiAssignmentSummary[];
}

async function parseApiJson(response: Response, endpoint: string): Promise {
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

const COLUMNS: Array = [
  { id: "todo", title: "Backlog", emptyMessage: "No strategic tasks in backlog." },
  { id: "in_progress", title: "Execution", emptyMessage: "No tasks currently in execution." },
  { id: "done", title: "Delivered", emptyMessage: "No delivered outcomes yet." },
];

const STATUS_LABELS: Record = {
  todo: "Backlog",
  in_progress: "Execution",
  done: "Delivered",
};

const BOARD_MANAGER_ROLES = ["admin", "campaign_manager"] as const;
const BOARD_CONTRIBUTOR_ROLES = ["data_ops", "quality_analyst", "agent"] as const;

const PRIORITY_LABELS: Record = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_BADGE_CLASS: Record = {
  urgent: "bg-red-100 text-red-800 border-red-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  medium: "bg-blue-100 text-blue-800 border-blue-300",
  low: "bg-slate-100 text-slate-700 border-slate-300",
};

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

  const [editTaskId, setEditTaskId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAssigneeName, setEditAssigneeName] = useState("");
  const [editDetails, setEditDetails] = useState("");
  const [editStatus, setEditStatus] = useState("todo");
  const [editNeedsAttention, setEditNeedsAttention] = useState(false);

  const [noteDraft, setNoteDraft] = useState("");
  const [aiObjective, setAiObjective] = useState("");
  const [aiPlan, setAiPlan] = useState(null);

  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: ["/api/admin/tasks"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/tasks");
      return parseApiJson(response, "/api/admin/tasks");
    },
  });

  const { data: boardNote, isLoading: isLoadingBoardNote } = useQuery({
    queryKey: ["/api/admin/todo-board/notes"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/todo-board/notes");
      return parseApiJson(response, "/api/admin/todo-board/notes");
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
    const roleSet = new Set([
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
      return parseApiJson(response, "/api/admin/tasks");
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
      updates: Partial>;
    }) => {
      const response = await apiRequest("PATCH", `/api/admin/tasks/${payload.id}`, payload.updates);
      return parseApiJson(response, `/api/admin/tasks/${payload.id}`);
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
      return parseApiJson(response, "/api/admin/todo-board/notes");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/todo-board/notes"] });
      toast({ title: "Strategy notes saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save note", description: err.message, variant: "destructive" });
    },
  });

  const generateAiPlanMutation = useMutation({
    mutationFn: async (payload: { objective?: string; maxSuggestions?: number }) => {
      const response = await apiRequest("POST", "/api/admin/tasks/ai-plan", payload);
      return parseApiJson(response, "/api/admin/tasks/ai-plan");
    },
    onSuccess: (result) => {
      setAiPlan(result);
      toast({
        title: result.engine === "openai" ? "AI analysis complete" : "Fallback analysis complete",
        description:
          result.engine === "openai"
            ? "Issues, priorities, and assignments were generated by AI."
            : "AI was unavailable, so heuristic planning was used.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to generate AI plan", description: err.message, variant: "destructive" });
    },
  });

  const applyAiPlanMutation = useMutation({
    mutationFn: async (payload: { suggestions: AiTaskSuggestion[] }) => {
      const response = await apiRequest("POST", "/api/admin/tasks/ai-plan/apply", payload);
      return parseApiJson(response, "/api/admin/tasks/ai-plan/apply");
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      toast({
        title: "AI tasks assigned",
        description: `${result.createdCount} prioritized task${result.createdCount === 1 ? "" : "s"} created and assigned.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to apply AI plan", description: err.message, variant: "destructive" });
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

  const onRunAiPlan = () => {
    generateAiPlanMutation.mutate({
      objective: aiObjective.trim() || undefined,
      maxSuggestions: 8,
    });
  };

  const onApplyAiPlan = () => {
    if (!canManageBoard) {
      toast({ title: "Manager access required", description: "Only managers can assign AI-generated tasks.", variant: "destructive" });
      return;
    }
    if (!aiPlan || aiPlan.suggestions.length === 0) {
      toast({ title: "No AI suggestions available", variant: "destructive" });
      return;
    }

    applyAiPlanMutation.mutate({
      suggestions: aiPlan.suggestions,
    });
  };

  return (
     setIsCreateOpen(true)} data-testid="todo-new-task">
            
            New Strategic Task
          
        ) : null
      }
    >
      
        
          
            
              Team Visibility Mode
              
                {canManageBoard
                  ? "Manager mode: full access to create tasks, assign owners, edit scope, and update strategy notes."
                  : "Contributor mode: update task status while managers maintain ownership, scope, and strategy notes."}
              
            
            
              {canManageBoard ? "Manager Access" : "Contributor Access"}
            
          
        

        
          
            
              Total Strategic Tasks
              {strategicMetrics.total}
            
          
          
            
              Delivered Outcomes
              {strategicMetrics.delivered}
            
          
          
            
              Completion Rate
              {strategicMetrics.completionRate}%
            
          
          
            
              At Risk / Unassigned
              
                {strategicMetrics.atRisk} / {strategicMetrics.unassigned}
              
            
          
        

        
          
            
              
              AI Issue, Priority, and Assignment Planner
            
          
          
            
               setAiObjective(event.target.value)}
                placeholder="Optional objective (e.g., Stabilize campaign launch readiness this week)"
              />
              
                {generateAiPlanMutation.isPending ? (
                  
                ) : (
                  
                )}
                Analyze & Prioritize
              
              {canManageBoard && (
                
                  {applyAiPlanMutation.isPending ? (
                    
                  ) : (
                    
                  )}
                  Assign Suggested Tasks
                
              )}
            

            {aiPlan ? (
              
                
                  Engine: {aiPlan.engine === "openai" ? "OpenAI" : "Heuristic fallback"}
                  Generated {new Date(aiPlan.generatedAt).toLocaleString()}
                

                {aiPlan.assignmentSummary.length > 0 && (
                  
                    Proposed Workload Distribution
                    
                      {aiPlan.assignmentSummary.map((entry) => (
                        
                          {entry.assigneeName}: {entry.plannedTasks}
                        
                      ))}
                    
                  
                )}

                
                  
                    Detected Issues
                    {aiPlan.issues.length === 0 ? (
                      No issues detected.
                    ) : (
                      aiPlan.issues.map((issue, index) => (
                        
                          
                            
                              {PRIORITY_LABELS[issue.priority]}
                            
                            {issue.recommendedOwnerRole && (
                              
                                Owner Role: {issue.recommendedOwnerRole}
                              
                            )}
                          
                          {issue.issue}
                          {issue.impact}
                        
                      ))
                    )}
                  

                  
                    Suggested Task Assignments
                    {aiPlan.suggestions.length === 0 ? (
                      No task recommendations generated.
                    ) : (
                      aiPlan.suggestions.map((suggestion, index) => (
                        
                          
                            
                              {PRIORITY_LABELS[suggestion.priority]}
                            
                            
                              {suggestion.assigneeName || "Unassigned"}
                            
                          
                          {suggestion.title}
                          {suggestion.issue}
                          {suggestion.rationale && (
                            Why: {suggestion.rationale}
                          )}
                        
                      ))
                    )}
                  
                
              
            ) : (
              
                Run AI analysis to identify current issues, priority order, and the best task assignments based on workload and board context.
              
            )}
          
        

        
          
            
              Team Strategy Notes
            
            
               setNoteDraft(event.target.value)}
                placeholder="Shared priorities, dependencies, risks, and next decisions..."
                className="min-h-[120px] bg-amber-100/60 border-amber-300 focus-visible:ring-amber-400"
                data-testid="todo-sticky-notes-input"
                readOnly={!canManageBoard}
              />
              
                
                  {isLoadingBoardNote
                    ? "Loading..."
                    : boardNote?.updatedAt
                      ? `Updated ${new Date(boardNote.updatedAt).toLocaleString()}`
                      : "Shared strategic context"}
                
                
                  
                  {canManageBoard ? "Save" : "Manager Only"}
                
              
            
          
        

        {isLoading ? (
          Loading tasks...
        ) : error ? (
          
            {error instanceof Error ? error.message : "Failed to load tasks."}
          
        ) : (
          
            {COLUMNS.map((column) => {
              const columnTasks = tasksByStatus[column.id];
              return (
                
                  
                    
                      {column.title}
                      {columnTasks.length}
                    
                  
                  
                    {columnTasks.length === 0 ? (
                      {column.emptyMessage}
                    ) : (
                      columnTasks.map((task) => {
                        const theme = getAssigneeColorTheme(task.assigneeName);
                        const isDone = column.id === "done" || task.status === "done";
                        const showWarning = column.id === "in_progress" && task.needsAttention;
                        return (
                          
                            
                              
                                
                                  {task.title}
                                
                                {task.details && (
                                  
                                    {task.details}
                                  
                                )}
                              
                              
                                {showWarning && (
                                  
                                    
                                    
                                      !
                                    
                                  
                                )}
                                {canManageBoard && (
                                  <>
                                     openEditTask(task)}
                                      aria-label="Edit task"
                                      data-testid={`todo-edit-${task.id}`}
                                    >
                                      
                                    
                                     deleteTaskMutation.mutate(task.id)}
                                      disabled={deleteTaskMutation.isPending}
                                      aria-label="Delete task"
                                    >
                                      
                                    
                                  
                                )}
                              
                            

                            
                              
                                {task.assigneeName || "Unassigned owner"}
                              
                              
                                Created {new Date(task.createdAt).toLocaleDateString()}
                              
                            

                             {
                                if (!canUpdateStatus) return;
                                updateTaskMutation.mutate({
                                  id: task.id,
                                  updates: { status: value },
                                });
                              }}
                            >
                              
                                
                              
                              
                                {STATUS_LABELS.todo}
                                {STATUS_LABELS.in_progress}
                                {STATUS_LABELS.done}
                              
                            
                          
                        );
                      })
                    )}
                  
                
              );
            })}
          
        )}
      

      {canManageBoard && (
        <>
          
            
              
                Create Strategic Task
                
                  Add a strategic objective to the board. It will start in backlog.
                
              

              
                
                  Strategic Objective
                   setNewTitle(event.target.value)}
                    placeholder="Define the objective"
                  />
                
                
                  Owner
                   setNewAssigneeName(event.target.value)}
                    placeholder="Assign a team owner"
                  />
                
                
                  Execution Notes
                   setNewDetails(event.target.value)}
                    placeholder="Scope, blockers, dependencies, or success criteria"
                    className="min-h-[100px]"
                  />
                
              

              
                 setIsCreateOpen(false)}>
                  Cancel
                
                
                  Create Task
                
              
            
          

          
            
              
                Edit Strategic Task
                
                  Update objective, owner, delivery notes, and status.
                
              

              
                
                  Strategic Objective
                   setEditTitle(event.target.value)}
                    placeholder="Define the objective"
                  />
                
                
                  Owner
                   setEditAssigneeName(event.target.value)}
                    placeholder="Assign a team owner"
                  />
                
                
                  Execution Notes
                   setEditDetails(event.target.value)}
                    placeholder="Scope, blockers, dependencies, or success criteria"
                    className="min-h-[120px]"
                  />
                
                
                  Stage
                   setEditStatus(value)}>
                    
                      
                    
                    
                      {STATUS_LABELS.todo}
                      {STATUS_LABELS.in_progress}
                      {STATUS_LABELS.done}
                    
                  
                
                
                  
                    Flag as at risk
                    
                      Shows an orange warning marker while this task is in execution.
                    
                  
                  
                
              

              
                 setIsEditOpen(false)}>
                  Cancel
                
                
                  Save Changes
                
              
            
          
        
      )}
    
  );
}