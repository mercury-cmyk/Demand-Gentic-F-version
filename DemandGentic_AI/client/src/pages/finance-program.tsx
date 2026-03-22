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

const CATEGORY_COLORS: Record = {
  revenue: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  pitch: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  legal: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  team: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  metrics: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
  financials: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  product: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300",
  traction: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
};

const MILESTONE_STATUS_ICON: Record = {
  not_started: ,
  in_progress: ,
  completed: ,
  overdue: ,
  blocked: ,
};

export default function FinanceProgramPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedProgramId, setSelectedProgramId] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddGoalDialog, setShowAddGoalDialog] = useState(false);
  const [showAddExpenseDialog, setShowAddExpenseDialog] = useState(false);

  // Fetch all programs
  const { data: programs = [], isLoading: loadingPrograms } = useQuery({
    queryKey: ["/api/finance-programs"],
  });

  // Fetch selected program details
  const { data: selectedProgram, isLoading: loadingProgram } = useQuery({
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
      
        
        
          
            
              
            
            Launch Your Accelerator Program
            
              Create a 30-day structured program with goals, milestones, budget tracking, and a readiness checklist
              tailored for Y Combinator or Techstars applications.
            
            
               seedProgram.mutate("yc")}
                disabled={seedProgram.isPending}
                className="gap-2"
              >
                
                {seedProgram.isPending ? "Creating..." : "Start YC Program"}
              
               seedProgram.mutate("techstars")}
                disabled={seedProgram.isPending}
                className="gap-2"
              >
                
                {seedProgram.isPending ? "Creating..." : "Start Techstars Program"}
              
            
          
        
      
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
    
      
      
        {loadingProgram ? (
          
            
          
        ) : program ? (
          
            {/* Top Stats */}
            
              
                
                  
                    
                      
                    
                    
                      Goal Progress
                      {goalProgress}%
                    
                  
                  
                
              

              
                
                  
                    
                      
                    
                    
                      Readiness Score
                      {readiness}%
                    
                  
                  
                
              

              
                
                  
                    
                      
                    
                    
                      Days Remaining
                      {days ?? "N/A"}
                    
                  
                  
                    Target: {program.targetDate ? new Date(program.targetDate).toLocaleDateString() : "Not set"}
                  
                
              

              
                
                  
                    
                      
                    
                    
                      Budget Used
                      
                        ${(totalSpent / 100).toLocaleString()}
                        
                          {" "}/ ${((program.totalBudget || 0) / 100).toLocaleString()}
                        
                      
                    
                  
                  
                
              
            

            {/* Tabs */}
            
              
                
                  
                  Overview
                
                
                  
                  Goals
                
                
                  
                  Milestones
                
                
                  
                  Budget
                
                
                  
                  Readiness
                
              

              {/* OVERVIEW TAB */}
              
                
                  {/* 30-Day Timeline */}
                  
                    
                      30-Day Milestone Timeline
                    
                    
                      
                        {(program.milestones || []).map((m, idx) => (
                          
                            
                              {MILESTONE_STATUS_ICON[m.status] || MILESTONE_STATUS_ICON.not_started}
                              {idx 
                              )}
                            
                            
                              
                                Week {m.weekNumber}: {m.title}
                                
                                  {m.status.replace("_", " ")}
                                
                              
                              {m.description}
                              {m.dueDate && (
                                
                                  Due: {new Date(m.dueDate).toLocaleDateString()}
                                
                              )}
                            
                          
                        ))}
                      
                    
                  

                  {/* Goals Summary */}
                  
                    
                      Goal Tracker
                      
                        {(program.goals || []).filter(g => g.completedAt).length} of {(program.goals || []).length} goals completed
                      
                    
                    
                      
                        {(program.goals || []).slice(0, 6).map(g => (
                          
                            
                              
                                {g.title}
                                {g.category}
                              
                              
                                
                                {g.progress}%
                              
                            
                          
                        ))}
                      
                    
                  

                  {/* Readiness Snapshot */}
                  
                    
                      Accelerator Readiness
                      
                        {program.targetAccelerator} qualification checklist
                      
                    
                    
                      {(() => {
                        const categories = [...new Set((program.checklist || []).map(c => c.category))];
                        return (
                          
                            {categories.map(cat => {
                              const items = (program.checklist || []).filter(c => c.category === cat);
                              const done = items.filter(c => c.isCompleted).length;
                              return (
                                
                                  
                                    {cat}
                                  
                                  
                                  
                                    {done}/{items.length}
                                  
                                
                              );
                            })}
                          
                        );
                      })()}
                    
                  

                  {/* Quick Actions */}
                  
                    
                      Quick Actions
                    
                    
                      
                         setActiveTab("goals")}>
                          
                          Update Goals
                        
                         setActiveTab("milestones")}>
                          
                          Track Milestones
                        
                         setActiveTab("budget")}>
                          
                          Log Expense
                        
                         setActiveTab("checklist")}>
                          
                          Readiness Check
                        
                      
                    
                  
                
              

              {/* GOALS TAB */}
              
                
                  Program Goals
                   setShowAddGoalDialog(true)} className="gap-1">
                     Add Goal
                  
                
                
                  {(program.goals || []).map(goal => (
                    
                      
                        
                          
                            
                              {goal.title}
                              
                                {goal.category}
                              
                              P{goal.priority}
                            
                            {goal.description && (
                              {goal.description}
                            )}
                            
                              
                                Target: {goal.targetValue || "N/A"}
                              
                              
                              
                                Current: {goal.currentValue || "N/A"}
                              
                            
                            
                              
                              {goal.progress}%
                            
                          
                          
                            
                                updateGoal.mutate({
                                  id: goal.id,
                                  progress: parseInt(val),
                                  completedAt: parseInt(val) === 100 ? new Date().toISOString() : null,
                                })
                              }
                            >
                              
                                
                              
                              
                                {[0, 10, 25, 50, 75, 90, 100].map(v => (
                                  {v}%
                                ))}
                              
                            
                          
                        
                      
                    
                  ))}
                

                {/* Add Goal Dialog */}
                
                  
                    
                      Add Goal
                      Add a new goal to your accelerator program
                    
                     {
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
                      
                        
                          Goal Title
                          
                        
                        
                          
                            Category
                            
                              
                              
                                Revenue
                                Product
                                Pitch
                                Legal
                                Team
                                Metrics
                                Financials
                              
                            
                          
                          
                            Priority (1=highest)
                            
                          
                        
                        
                          
                            Target Value
                            
                          
                          
                            Current Value
                            
                          
                        
                      
                      
                        
                          {addGoal.isPending ? "Adding..." : "Add Goal"}
                        
                      
                    
                  
                
              

              {/* MILESTONES TAB */}
              
                30-Day Milestone Plan
                
                  {(program.milestones || []).map(m => (
                    
                      
                        
                          
                            {MILESTONE_STATUS_ICON[m.status]}
                            Week {m.weekNumber}: {m.title}
                          
                          
                              updateMilestone.mutate({
                                id: m.id,
                                status: val,
                                completedAt: val === "completed" ? new Date().toISOString() : null,
                              })
                            }
                          >
                            
                              
                            
                            
                              Not Started
                              In Progress
                              Completed
                              Overdue
                              Blocked
                            
                          
                        
                        {m.description}
                      
                      
                        {m.dueDate && (
                          
                            Due: {new Date(m.dueDate).toLocaleDateString()}
                          
                        )}
                        {m.deliverables && m.deliverables.length > 0 && (
                          
                            Deliverables:
                            {m.deliverables.map((d, i) => (
                              
                                
                                {d}
                              
                            ))}
                          
                        )}
                      
                    
                  ))}
                
              

              {/* BUDGET TAB */}
              
                
                  Budget & Expenses
                   setShowAddExpenseDialog(true)} className="gap-1">
                     Add Expense
                  
                

                
                  
                    
                      Total Budget
                      ${((program.totalBudget || 0) / 100).toLocaleString()}
                    
                  
                  
                    
                      Total Spent
                      ${(totalSpent / 100).toLocaleString()}
                    
                  
                  
                    
                      Remaining
                      
                        ${(((program.totalBudget || 0) - totalSpent) / 100).toLocaleString()}
                      
                    
                  
                

                {/* Expense breakdown by category */}
                {(() => {
                  const byCat: Record = {};
                  (program.expenses || []).forEach(e => {
                    byCat[e.category] = (byCat[e.category] || 0) + e.amount;
                  });
                  return Object.keys(byCat).length > 0 ? (
                    
                      
                        Spending by Category
                      
                      
                        
                          {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                            
                              {cat}
                              
                              ${(amt / 100).toLocaleString()}
                            
                          ))}
                        
                      
                    
                  ) : null;
                })()}

                {/* Expense list */}
                
                  
                    Expense Log
                  
                  
                    {(program.expenses || []).length === 0 ? (
                      
                        No expenses logged yet. Click "Add Expense" to start tracking.
                      
                    ) : (
                      
                        {(program.expenses || []).map(exp => (
                          
                            
                              {exp.category}
                              {exp.description}
                            
                            
                              ${(exp.amount / 100).toLocaleString()}
                              
                                {new Date(exp.date).toLocaleDateString()}
                              
                               deleteExpense.mutate(exp.id)}
                              >
                                
                              
                            
                          
                        ))}
                      
                    )}
                  
                

                {/* Add Expense Dialog */}
                
                  
                    
                      Add Expense
                    
                     {
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
                      
                        
                          Description
                          
                        
                        
                          
                            Amount ($)
                            
                          
                          
                            Category
                            
                              
                              
                                Infrastructure
                                Legal
                                Marketing
                                Hiring
                                Tools
                                Travel
                                Advisory
                                Other
                              
                            
                          
                        
                      
                      
                        
                          {addExpense.isPending ? "Adding..." : "Add Expense"}
                        
                      
                    
                  
                
              

              {/* CHECKLIST TAB */}
              
                
                  
                    {program.targetAccelerator} Readiness Checklist
                    
                      {(program.checklist || []).filter(c => c.isCompleted).length} of {(program.checklist || []).length} items completed
                    
                  
                  
                    {readiness}%
                    ready
                  
                

                {(() => {
                  const categories = [...new Set((program.checklist || []).map(c => c.category))];
                  return categories.map(cat => (
                    
                      
                        
                          {cat}
                          
                            {(program.checklist || []).filter(c => c.category === cat && c.isCompleted).length}/
                            {(program.checklist || []).filter(c => c.category === cat).length}
                          
                        
                      
                      
                        
                          {(program.checklist || [])
                            .filter(c => c.category === cat)
                            .map(item => (
                              
                                
                                    updateChecklist.mutate({
                                      id: item.id,
                                      isCompleted: !!checked,
                                      completedAt: checked ? new Date().toISOString() : null,
                                    })
                                  }
                                />
                                
                                  
                                    {item.checklistItem}
                                  
                                  {item.evidence && (
                                    {item.evidence}
                                  )}
                                
                              
                            ))}
                        
                      
                    
                  ));
                })()}
              
            
          
        ) : null}
      
    
  );
}