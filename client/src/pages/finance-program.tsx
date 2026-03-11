import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PageLayout, PageHeader, PageContent } from "@/components/layout/page-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Target,
  Calendar,
  DollarSign,
  CheckSquare,
  Plus,
  Rocket,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
  ArrowRight,
  Trash2,
  Trophy,
  Sparkles,
  BarChart3,
  Briefcase,
} from "lucide-react";

// Types
interface FinanceProgram {
  id: string;
  name: string;
  description: string | null;
  targetAccelerator: string | null;
  status: string;
  startDate: string | null;
  targetDate: string | null;
  totalBudget: number;
  spentBudget: number;
  overallProgress: number;
  readinessScore: number;
  goals: FinanceGoal[];
  milestones: FinanceMilestone[];
  expenses: FinanceExpense[];
  checklist: FinanceChecklistItem[];
}

interface FinanceGoal {
  id: string;
  title: string;
  description: string | null;
  category: string;
  targetValue: string | null;
  currentValue: string | null;
  progress: number;
  priority: number;
  dueDate: string | null;
  completedAt: string | null;
}

interface FinanceMilestone {
  id: string;
  title: string;
  description: string | null;
  weekNumber: number;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  deliverables: string[] | null;
}

interface FinanceExpense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  notes: string | null;
}

interface FinanceChecklistItem {
  id: string;
  accelerator: string;
  checklistItem: string;
  category: string;
  isCompleted: boolean;
  evidence: string | null;
  completedAt: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  revenue: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  pitch: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  legal: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  team: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  metrics: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
  financials: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  product: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300",
  traction: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
};

const MILESTONE_STATUS_ICON: Record<string, JSX.Element> = {
  not_started: <Circle className="h-4 w-4 text-muted-foreground" />,
  in_progress: <Clock className="h-4 w-4 text-blue-500 animate-pulse" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  overdue: <AlertTriangle className="h-4 w-4 text-red-500" />,
  blocked: <AlertTriangle className="h-4 w-4 text-orange-500" />,
};

export default function FinanceProgramPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddGoalDialog, setShowAddGoalDialog] = useState(false);
  const [showAddExpenseDialog, setShowAddExpenseDialog] = useState(false);

  // Fetch all programs
  const { data: programs = [], isLoading: loadingPrograms } = useQuery<FinanceProgram[]>({
    queryKey: ["/api/finance-programs"],
  });

  // Fetch selected program details
  const { data: selectedProgram, isLoading: loadingProgram } = useQuery<FinanceProgram>({
    queryKey: ["/api/finance-programs", selectedProgramId],
    queryFn: () => apiRequest("GET", `/api/finance-programs/${selectedProgramId}`).then(r => r.json()),
    enabled: !!selectedProgramId,
  });

  // Seed program mutation
  const seedProgram = useMutation({
    mutationFn: (accelerator: string) =>
      apiRequest("POST", "/api/finance-programs/seed-program", { accelerator }).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance-programs"] });
      setSelectedProgramId(data.id);
      toast({ title: "Program Created", description: "30-day accelerator program seeded with goals, milestones, and checklist." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Update goal mutation
  const updateGoal = useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      apiRequest("PATCH", `/api/finance-programs/goals/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance-programs", selectedProgramId] });
    },
  });

  // Update milestone mutation
  const updateMilestone = useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      apiRequest("PATCH", `/api/finance-programs/milestones/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance-programs", selectedProgramId] });
    },
  });

  // Update checklist item mutation
  const updateChecklist = useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      apiRequest("PATCH", `/api/finance-programs/checklist/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance-programs", selectedProgramId] });
    },
  });

  // Add expense mutation
  const addExpense = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", `/api/finance-programs/${selectedProgramId}/expenses`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance-programs", selectedProgramId] });
      setShowAddExpenseDialog(false);
      toast({ title: "Expense Added" });
    },
  });

  // Add goal mutation
  const addGoal = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", `/api/finance-programs/${selectedProgramId}/goals`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance-programs", selectedProgramId] });
      setShowAddGoalDialog(false);
      toast({ title: "Goal Added" });
    },
  });

  // Delete expense
  const deleteExpense = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/finance-programs/expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance-programs", selectedProgramId] });
    },
  });

  // Compute readiness
  const computeReadiness = (checklist: FinanceChecklistItem[]) => {
    if (!checklist.length) return 0;
    const completed = checklist.filter(c => c.isCompleted).length;
    return Math.round((completed / checklist.length) * 100);
  };

  const computeGoalProgress = (goals: FinanceGoal[]) => {
    if (!goals.length) return 0;
    return Math.round(goals.reduce((sum, g) => sum + (g.progress || 0), 0) / goals.length);
  };

  const daysRemaining = (targetDate: string | null) => {
    if (!targetDate) return null;
    const diff = new Date(targetDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  // ============================================
  // NO PROGRAMS - ONBOARDING VIEW
  // ============================================
  if (!loadingPrograms && programs.length === 0 && !selectedProgramId) {
    return (
      <PageLayout>
        <PageHeader title="Finance & Program Management" subtitle="Accelerator readiness and funding goal tracker" />
        <PageContent>
          <div className="flex flex-col items-center justify-center py-20 gap-6">
            <div className="rounded-full bg-primary/10 p-6">
              <Rocket className="h-12 w-12 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-center">Launch Your Accelerator Program</h2>
            <p className="text-muted-foreground text-center max-w-lg">
              Create a 30-day structured program with goals, milestones, budget tracking, and a readiness checklist
              tailored for Y Combinator or Techstars applications.
            </p>
            <div className="flex gap-4">
              <Button
                size="lg"
                onClick={() => seedProgram.mutate("yc")}
                disabled={seedProgram.isPending}
                className="gap-2"
              >
                <Trophy className="h-5 w-5" />
                {seedProgram.isPending ? "Creating..." : "Start YC Program"}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => seedProgram.mutate("techstars")}
                disabled={seedProgram.isPending}
                className="gap-2"
              >
                <Sparkles className="h-5 w-5" />
                {seedProgram.isPending ? "Creating..." : "Start Techstars Program"}
              </Button>
            </div>
          </div>
        </PageContent>
      </PageLayout>
    );
  }

  // Auto-select first program if none selected
  if (!selectedProgramId && programs.length > 0) {
    setSelectedProgramId(programs[0].id);
  }

  const program = selectedProgram;
  const readiness = program ? computeReadiness(program.checklist || []) : 0;
  const goalProgress = program ? computeGoalProgress(program.goals || []) : 0;
  const days = program ? daysRemaining(program.targetDate) : null;
  const totalSpent = program ? (program.expenses || []).reduce((s, e) => s + e.amount, 0) : 0;

  return (
    <PageLayout>
      <PageHeader
        title="Finance & Program Management"
        subtitle={program ? `${program.name} — ${program.targetAccelerator || "Accelerator"}` : "Loading..."}
      />
      <PageContent>
        {loadingProgram ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : program ? (
          <div className="space-y-6">
            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blue-100 dark:bg-blue-900 p-2">
                      <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Goal Progress</p>
                      <p className="text-2xl font-bold">{goalProgress}%</p>
                    </div>
                  </div>
                  <Progress value={goalProgress} className="mt-3" />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-green-100 dark:bg-green-900 p-2">
                      <CheckSquare className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Readiness Score</p>
                      <p className="text-2xl font-bold">{readiness}%</p>
                    </div>
                  </div>
                  <Progress value={readiness} className="mt-3" />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-orange-100 dark:bg-orange-900 p-2">
                      <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Days Remaining</p>
                      <p className="text-2xl font-bold">{days ?? "N/A"}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Target: {program.targetDate ? new Date(program.targetDate).toLocaleDateString() : "Not set"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-purple-100 dark:bg-purple-900 p-2">
                      <DollarSign className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Budget Used</p>
                      <p className="text-2xl font-bold">
                        ${(totalSpent / 100).toLocaleString()}
                        <span className="text-sm text-muted-foreground font-normal">
                          {" "}/ ${((program.totalBudget || 0) / 100).toLocaleString()}
                        </span>
                      </p>
                    </div>
                  </div>
                  <Progress value={program.totalBudget ? (totalSpent / program.totalBudget) * 100 : 0} className="mt-3" />
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="overview" className="gap-1">
                  <BarChart3 className="h-4 w-4" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="goals" className="gap-1">
                  <Target className="h-4 w-4" />
                  Goals
                </TabsTrigger>
                <TabsTrigger value="milestones" className="gap-1">
                  <Calendar className="h-4 w-4" />
                  Milestones
                </TabsTrigger>
                <TabsTrigger value="budget" className="gap-1">
                  <DollarSign className="h-4 w-4" />
                  Budget
                </TabsTrigger>
                <TabsTrigger value="checklist" className="gap-1">
                  <CheckSquare className="h-4 w-4" />
                  Readiness
                </TabsTrigger>
              </TabsList>

              {/* OVERVIEW TAB */}
              <TabsContent value="overview" className="space-y-6 mt-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 30-Day Timeline */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">30-Day Milestone Timeline</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {(program.milestones || []).map((m, idx) => (
                          <div key={m.id} className="flex gap-4">
                            <div className="flex flex-col items-center">
                              {MILESTONE_STATUS_ICON[m.status] || MILESTONE_STATUS_ICON.not_started}
                              {idx < (program.milestones?.length || 0) - 1 && (
                                <div className="w-px h-full bg-border mt-1" />
                              )}
                            </div>
                            <div className="flex-1 pb-4">
                              <div className="flex items-center justify-between">
                                <p className="font-medium text-sm">Week {m.weekNumber}: {m.title}</p>
                                <Badge variant="outline" className="text-xs">
                                  {m.status.replace("_", " ")}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                              {m.dueDate && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Due: {new Date(m.dueDate).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Goals Summary */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Goal Tracker</CardTitle>
                      <CardDescription>
                        {(program.goals || []).filter(g => g.completedAt).length} of {(program.goals || []).length} goals completed
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(program.goals || []).slice(0, 6).map(g => (
                          <div key={g.id} className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium">{g.title}</span>
                                <Badge className={CATEGORY_COLORS[g.category] || ""}>{g.category}</Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <Progress value={g.progress || 0} className="flex-1 h-2" />
                                <span className="text-xs text-muted-foreground w-8">{g.progress}%</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Readiness Snapshot */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Accelerator Readiness</CardTitle>
                      <CardDescription>
                        {program.targetAccelerator} qualification checklist
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const categories = [...new Set((program.checklist || []).map(c => c.category))];
                        return (
                          <div className="space-y-3">
                            {categories.map(cat => {
                              const items = (program.checklist || []).filter(c => c.category === cat);
                              const done = items.filter(c => c.isCompleted).length;
                              return (
                                <div key={cat} className="flex items-center gap-3">
                                  <Badge className={CATEGORY_COLORS[cat] || ""} variant="outline">
                                    {cat}
                                  </Badge>
                                  <Progress value={(done / items.length) * 100} className="flex-1 h-2" />
                                  <span className="text-xs text-muted-foreground">
                                    {done}/{items.length}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  {/* Quick Actions */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => setActiveTab("goals")}>
                          <Target className="h-5 w-5" />
                          <span className="text-xs">Update Goals</span>
                        </Button>
                        <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => setActiveTab("milestones")}>
                          <Calendar className="h-5 w-5" />
                          <span className="text-xs">Track Milestones</span>
                        </Button>
                        <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => setActiveTab("budget")}>
                          <DollarSign className="h-5 w-5" />
                          <span className="text-xs">Log Expense</span>
                        </Button>
                        <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => setActiveTab("checklist")}>
                          <CheckSquare className="h-5 w-5" />
                          <span className="text-xs">Readiness Check</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* GOALS TAB */}
              <TabsContent value="goals" className="space-y-4 mt-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Program Goals</h3>
                  <Button size="sm" onClick={() => setShowAddGoalDialog(true)} className="gap-1">
                    <Plus className="h-4 w-4" /> Add Goal
                  </Button>
                </div>
                <div className="space-y-3">
                  {(program.goals || []).map(goal => (
                    <Card key={goal.id}>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-medium">{goal.title}</span>
                              <Badge className={CATEGORY_COLORS[goal.category] || ""} variant="outline">
                                {goal.category}
                              </Badge>
                              <Badge variant="outline" className="text-xs">P{goal.priority}</Badge>
                            </div>
                            {goal.description && (
                              <p className="text-sm text-muted-foreground mb-2">{goal.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-muted-foreground">
                                Target: <strong>{goal.targetValue || "N/A"}</strong>
                              </span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                Current: <strong>{goal.currentValue || "N/A"}</strong>
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <Progress value={goal.progress || 0} className="flex-1 h-2" />
                              <span className="text-xs text-muted-foreground">{goal.progress}%</span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <Select
                              value={String(goal.progress || 0)}
                              onValueChange={(val) =>
                                updateGoal.mutate({
                                  id: goal.id,
                                  progress: parseInt(val),
                                  completedAt: parseInt(val) === 100 ? new Date().toISOString() : null,
                                })
                              }
                            >
                              <SelectTrigger className="w-24 h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[0, 10, 25, 50, 75, 90, 100].map(v => (
                                  <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Add Goal Dialog */}
                <Dialog open={showAddGoalDialog} onOpenChange={setShowAddGoalDialog}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Goal</DialogTitle>
                      <DialogDescription>Add a new goal to your accelerator program</DialogDescription>
                    </DialogHeader>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.target as HTMLFormElement;
                        const formData = new FormData(form);
                        addGoal.mutate({
                          title: formData.get("title"),
                          category: formData.get("category"),
                          targetValue: formData.get("targetValue"),
                          currentValue: formData.get("currentValue") || "Not started",
                          priority: parseInt(formData.get("priority") as string) || 5,
                        });
                      }}
                    >
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="title">Goal Title</Label>
                          <Input id="title" name="title" required placeholder="e.g., Get 10 paying clients" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="category">Category</Label>
                            <Select name="category" defaultValue="revenue">
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="revenue">Revenue</SelectItem>
                                <SelectItem value="product">Product</SelectItem>
                                <SelectItem value="pitch">Pitch</SelectItem>
                                <SelectItem value="legal">Legal</SelectItem>
                                <SelectItem value="team">Team</SelectItem>
                                <SelectItem value="metrics">Metrics</SelectItem>
                                <SelectItem value="financials">Financials</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor="priority">Priority (1=highest)</Label>
                            <Input id="priority" name="priority" type="number" min={1} max={10} defaultValue={5} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="targetValue">Target Value</Label>
                            <Input id="targetValue" name="targetValue" placeholder="e.g., 10 clients" />
                          </div>
                          <div>
                            <Label htmlFor="currentValue">Current Value</Label>
                            <Input id="currentValue" name="currentValue" placeholder="e.g., 0" />
                          </div>
                        </div>
                      </div>
                      <DialogFooter className="mt-4">
                        <Button type="submit" disabled={addGoal.isPending}>
                          {addGoal.isPending ? "Adding..." : "Add Goal"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </TabsContent>

              {/* MILESTONES TAB */}
              <TabsContent value="milestones" className="space-y-4 mt-6">
                <h3 className="text-lg font-semibold">30-Day Milestone Plan</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(program.milestones || []).map(m => (
                    <Card key={m.id} className={m.status === "completed" ? "border-green-300 dark:border-green-800" : ""}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            {MILESTONE_STATUS_ICON[m.status]}
                            Week {m.weekNumber}: {m.title}
                          </CardTitle>
                          <Select
                            value={m.status}
                            onValueChange={(val) =>
                              updateMilestone.mutate({
                                id: m.id,
                                status: val,
                                completedAt: val === "completed" ? new Date().toISOString() : null,
                              })
                            }
                          >
                            <SelectTrigger className="w-32 h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not_started">Not Started</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="overdue">Overdue</SelectItem>
                              <SelectItem value="blocked">Blocked</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <CardDescription>{m.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {m.dueDate && (
                          <p className="text-xs text-muted-foreground mb-2">
                            Due: {new Date(m.dueDate).toLocaleDateString()}
                          </p>
                        )}
                        {m.deliverables && m.deliverables.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium">Deliverables:</p>
                            {m.deliverables.map((d, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                                <CheckCircle2 className="h-3 w-3" />
                                {d}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* BUDGET TAB */}
              <TabsContent value="budget" className="space-y-4 mt-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Budget & Expenses</h3>
                  <Button size="sm" onClick={() => setShowAddExpenseDialog(true)} className="gap-1">
                    <Plus className="h-4 w-4" /> Add Expense
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-sm text-muted-foreground">Total Budget</p>
                      <p className="text-3xl font-bold">${((program.totalBudget || 0) / 100).toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-sm text-muted-foreground">Total Spent</p>
                      <p className="text-3xl font-bold text-red-600">${(totalSpent / 100).toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-sm text-muted-foreground">Remaining</p>
                      <p className="text-3xl font-bold text-green-600">
                        ${(((program.totalBudget || 0) - totalSpent) / 100).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Expense breakdown by category */}
                {(() => {
                  const byCat: Record<string, number> = {};
                  (program.expenses || []).forEach(e => {
                    byCat[e.category] = (byCat[e.category] || 0) + e.amount;
                  });
                  return Object.keys(byCat).length > 0 ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Spending by Category</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                            <div key={cat} className="flex items-center gap-3">
                              <Badge variant="outline" className="w-24 justify-center capitalize">{cat}</Badge>
                              <Progress value={totalSpent ? (amt / totalSpent) * 100 : 0} className="flex-1 h-2" />
                              <span className="text-sm font-medium w-20 text-right">${(amt / 100).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : null;
                })()}

                {/* Expense list */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Expense Log</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(program.expenses || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No expenses logged yet. Click "Add Expense" to start tracking.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {(program.expenses || []).map(exp => (
                          <div key={exp.id} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="capitalize text-xs">{exp.category}</Badge>
                              <span className="text-sm">{exp.description}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">${(exp.amount / 100).toLocaleString()}</span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(exp.date).toLocaleDateString()}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => deleteExpense.mutate(exp.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Add Expense Dialog */}
                <Dialog open={showAddExpenseDialog} onOpenChange={setShowAddExpenseDialog}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Expense</DialogTitle>
                    </DialogHeader>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.target as HTMLFormElement;
                        const formData = new FormData(form);
                        addExpense.mutate({
                          description: formData.get("description"),
                          amount: Math.round(parseFloat(formData.get("amount") as string) * 100),
                          category: formData.get("category"),
                        });
                      }}
                    >
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="exp-desc">Description</Label>
                          <Input id="exp-desc" name="description" required placeholder="e.g., Domain registration" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="exp-amount">Amount ($)</Label>
                            <Input id="exp-amount" name="amount" type="number" step="0.01" min="0" required placeholder="50.00" />
                          </div>
                          <div>
                            <Label htmlFor="exp-category">Category</Label>
                            <Select name="category" defaultValue="tools">
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="infrastructure">Infrastructure</SelectItem>
                                <SelectItem value="legal">Legal</SelectItem>
                                <SelectItem value="marketing">Marketing</SelectItem>
                                <SelectItem value="hiring">Hiring</SelectItem>
                                <SelectItem value="tools">Tools</SelectItem>
                                <SelectItem value="travel">Travel</SelectItem>
                                <SelectItem value="advisory">Advisory</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      <DialogFooter className="mt-4">
                        <Button type="submit" disabled={addExpense.isPending}>
                          {addExpense.isPending ? "Adding..." : "Add Expense"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </TabsContent>

              {/* CHECKLIST TAB */}
              <TabsContent value="checklist" className="space-y-4 mt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{program.targetAccelerator} Readiness Checklist</h3>
                    <p className="text-sm text-muted-foreground">
                      {(program.checklist || []).filter(c => c.isCompleted).length} of {(program.checklist || []).length} items completed
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">{readiness}%</span>
                    <span className="text-sm text-muted-foreground">ready</span>
                  </div>
                </div>

                {(() => {
                  const categories = [...new Set((program.checklist || []).map(c => c.category))];
                  return categories.map(cat => (
                    <Card key={cat}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2 capitalize">
                          <Badge className={CATEGORY_COLORS[cat] || ""} variant="outline">{cat}</Badge>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {(program.checklist || []).filter(c => c.category === cat && c.isCompleted).length}/
                            {(program.checklist || []).filter(c => c.category === cat).length}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {(program.checklist || [])
                            .filter(c => c.category === cat)
                            .map(item => (
                              <div key={item.id} className="flex items-start gap-3">
                                <Checkbox
                                  checked={item.isCompleted}
                                  onCheckedChange={(checked) =>
                                    updateChecklist.mutate({
                                      id: item.id,
                                      isCompleted: !!checked,
                                      completedAt: checked ? new Date().toISOString() : null,
                                    })
                                  }
                                />
                                <div className="flex-1">
                                  <p className={`text-sm ${item.isCompleted ? "line-through text-muted-foreground" : ""}`}>
                                    {item.checklistItem}
                                  </p>
                                  {item.evidence && (
                                    <p className="text-xs text-muted-foreground mt-1">{item.evidence}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  ));
                })()}
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </PageContent>
    </PageLayout>
  );
}