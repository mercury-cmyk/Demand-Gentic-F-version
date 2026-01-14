import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Lightbulb,
  MessageSquare,
  Filter,
  AlertTriangle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const PROBLEM_CATEGORIES = [
  { value: "efficiency", label: "Efficiency" },
  { value: "growth", label: "Growth" },
  { value: "risk", label: "Risk" },
  { value: "cost", label: "Cost" },
  { value: "compliance", label: "Compliance" },
];

interface ProblemSymptom {
  id: string;
  symptomDescription: string;
  dataSource: string;
  detectionLogic?: string;
}

interface ImpactArea {
  id: string;
  area: string;
  description: string;
  severity: string;
}

interface MessagingAngle {
  id: string;
  angle: string;
  openingLine: string;
  followUp?: string;
  persona?: string;
}

interface DetectionRules {
  industries?: string[];
  techStack?: {
    required?: string[];
    absent?: string[];
  };
  firmographics?: {
    minRevenue?: number;
    maxRevenue?: number;
    minEmployees?: number;
    maxEmployees?: number;
    regions?: string[];
  };
  intentSignals?: string[];
}

interface ProblemDefinition {
  id: number;
  organizationId: string | null;
  problemStatement: string;
  problemCategory: string;
  symptoms: ProblemSymptom[];
  impactAreas: ImpactArea[];
  serviceIds: number[] | null;
  messagingAngles: MessagingAngle[];
  detectionRules: DetectionRules;
  isActive: boolean;
}

interface ProblemFrameworkTabProps {
  organizationId: string | null;
}

export function ProblemFrameworkTab({ organizationId }: ProblemFrameworkTabProps) {
  const queryClient = useQueryClient();
  const [isProblemDialogOpen, setIsProblemDialogOpen] = useState(false);
  const [editingProblem, setEditingProblem] = useState<ProblemDefinition | null>(null);

  const [problemForm, setProblemForm] = useState({
    problemStatement: "",
    problemCategory: "efficiency",
    targetIndustries: "",
    requiredTech: "",
    absentTech: "",
    intentSignals: "",
  });

  const { data: problemsData, isLoading } = useQuery<{ problems: ProblemDefinition[] }>({
    queryKey: [
      "/api/problem-definitions",
      organizationId ? `?organizationId=${organizationId}` : "",
    ],
    enabled: !!organizationId,
  });

  const createProblemMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/problem-definitions", {
        ...data,
        organizationId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/problem-definitions"] });
      setIsProblemDialogOpen(false);
      resetForm();
    },
  });

  const updateProblemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest("PUT", `/api/problem-definitions/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/problem-definitions"] });
      setIsProblemDialogOpen(false);
      resetForm();
    },
  });

  const deleteProblemMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/problem-definitions/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/problem-definitions"] });
    },
  });

  const resetForm = () => {
    setProblemForm({
      problemStatement: "",
      problemCategory: "efficiency",
      targetIndustries: "",
      requiredTech: "",
      absentTech: "",
      intentSignals: "",
    });
    setEditingProblem(null);
  };

  const handleEditProblem = (problem: ProblemDefinition) => {
    setEditingProblem(problem);
    setProblemForm({
      problemStatement: problem.problemStatement,
      problemCategory: problem.problemCategory || "efficiency",
      targetIndustries: problem.detectionRules?.industries?.join(", ") || "",
      requiredTech: problem.detectionRules?.techStack?.required?.join(", ") || "",
      absentTech: problem.detectionRules?.techStack?.absent?.join(", ") || "",
      intentSignals: problem.detectionRules?.intentSignals?.join(", ") || "",
    });
    setIsProblemDialogOpen(true);
  };

  const handleSubmitProblem = () => {
    const detectionRules: DetectionRules = {};

    if (problemForm.targetIndustries) {
      detectionRules.industries = problemForm.targetIndustries.split(",").map((s) => s.trim());
    }

    if (problemForm.requiredTech || problemForm.absentTech) {
      detectionRules.techStack = {};
      if (problemForm.requiredTech) {
        detectionRules.techStack.required = problemForm.requiredTech.split(",").map((s) => s.trim());
      }
      if (problemForm.absentTech) {
        detectionRules.techStack.absent = problemForm.absentTech.split(",").map((s) => s.trim());
      }
    }

    if (problemForm.intentSignals) {
      detectionRules.intentSignals = problemForm.intentSignals.split(",").map((s) => s.trim());
    }

    const data = {
      problemStatement: problemForm.problemStatement,
      problemCategory: problemForm.problemCategory,
      detectionRules,
      symptoms: [],
      impactAreas: [],
      messagingAngles: [],
    };

    if (editingProblem) {
      updateProblemMutation.mutate({ id: editingProblem.id, data });
    } else {
      createProblemMutation.mutate(data);
    }
  };

  if (!organizationId) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">
            Please select an organization to view the problem framework.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const problems = problemsData?.problems || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Problem Framework</h3>
          <p className="text-sm text-muted-foreground">
            Define problems your organization helps solve and how to detect them.
          </p>
        </div>
        <Button onClick={() => setIsProblemDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Problem Definition
        </Button>
      </div>

      {problems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Lightbulb className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h4 className="text-lg font-medium mb-2">No Problems Defined</h4>
            <p className="text-muted-foreground mb-4">
              Create problem definitions to help the AI identify and match problems to your target
              accounts.
            </p>
            <Button onClick={() => setIsProblemDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Define Your First Problem
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {problems.map((problem) => (
            <Card key={problem.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <CardTitle className="text-base">{problem.problemStatement}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          problem.problemCategory === "risk"
                            ? "border-red-200 text-red-700"
                            : problem.problemCategory === "growth"
                            ? "border-green-200 text-green-700"
                            : problem.problemCategory === "cost"
                            ? "border-orange-200 text-orange-700"
                            : "border-blue-200 text-blue-700"
                        }
                      >
                        {PROBLEM_CATEGORIES.find((c) => c.value === problem.problemCategory)?.label ||
                          problem.problemCategory}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEditProblem(problem)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteProblemMutation.mutate(problem.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="detection" className="border-none">
                    <AccordionTrigger className="hover:no-underline py-2">
                      <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-purple-500" />
                        <span className="text-sm font-medium">Detection Rules</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pl-6 space-y-3 pt-2">
                        {problem.detectionRules?.industries?.length ? (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">
                              Target Industries:
                            </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {problem.detectionRules.industries.map((ind, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {ind}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {problem.detectionRules?.techStack?.required?.length ? (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">
                              Required Tech:
                            </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {problem.detectionRules.techStack.required.map((tech, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {tech}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {problem.detectionRules?.techStack?.absent?.length ? (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">
                              Missing Tech (indicator):
                            </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {problem.detectionRules.techStack.absent.map((tech, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="text-xs border-dashed"
                                >
                                  {tech}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {problem.detectionRules?.intentSignals?.length ? (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">
                              Intent Signals:
                            </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {problem.detectionRules.intentSignals.map((sig, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {sig}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {!problem.detectionRules?.industries?.length &&
                          !problem.detectionRules?.techStack?.required?.length &&
                          !problem.detectionRules?.techStack?.absent?.length &&
                          !problem.detectionRules?.intentSignals?.length && (
                            <p className="text-sm text-muted-foreground">
                              No detection rules configured.
                            </p>
                          )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="messaging" className="border-none">
                    <AccordionTrigger className="hover:no-underline py-2">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">
                          Messaging Angles ({problem.messagingAngles.length})
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pl-6 space-y-2 pt-2">
                        {problem.messagingAngles.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No messaging angles configured.
                          </p>
                        ) : (
                          problem.messagingAngles.map((angle) => (
                            <div key={angle.id} className="p-3 rounded border bg-muted/30">
                              <p className="text-sm font-medium">{angle.angle}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                "{angle.openingLine}"
                              </p>
                              {angle.persona && (
                                <Badge variant="secondary" className="text-[10px] mt-2">
                                  {angle.persona}
                                </Badge>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {problem.symptoms.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <span className="text-xs font-medium text-muted-foreground">Symptoms:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {problem.symptoms.map((symptom) => (
                        <Badge key={symptom.id} variant="outline" className="text-xs">
                          {symptom.symptomDescription}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Problem Dialog */}
      <Dialog open={isProblemDialogOpen} onOpenChange={setIsProblemDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>
              {editingProblem ? "Edit Problem Definition" : "Add Problem Definition"}
            </DialogTitle>
            <DialogDescription>
              {editingProblem
                ? "Update the problem definition and detection rules."
                : "Define a new problem and how to detect it in target accounts."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid gap-2">
              <Label htmlFor="problemStatement">Problem Statement *</Label>
              <Textarea
                id="problemStatement"
                value={problemForm.problemStatement}
                onChange={(e) =>
                  setProblemForm({ ...problemForm, problemStatement: e.target.value })
                }
                placeholder="Describe the problem your customers typically face..."
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="problemCategory">Category</Label>
              <Select
                value={problemForm.problemCategory}
                onValueChange={(value) =>
                  setProblemForm({ ...problemForm, problemCategory: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROBLEM_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Detection Rules</h4>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="targetIndustries">Target Industries</Label>
                  <Input
                    id="targetIndustries"
                    value={problemForm.targetIndustries}
                    onChange={(e) =>
                      setProblemForm({ ...problemForm, targetIndustries: e.target.value })
                    }
                    placeholder="SaaS, Healthcare, Finance (comma-separated)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Industries where this problem is commonly found
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="requiredTech">Required Tech (indicators)</Label>
                  <Input
                    id="requiredTech"
                    value={problemForm.requiredTech}
                    onChange={(e) =>
                      setProblemForm({ ...problemForm, requiredTech: e.target.value })
                    }
                    placeholder="Salesforce, HubSpot (comma-separated)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Tech stack that indicates this problem might exist
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="absentTech">Missing Tech (indicators)</Label>
                  <Input
                    id="absentTech"
                    value={problemForm.absentTech}
                    onChange={(e) =>
                      setProblemForm({ ...problemForm, absentTech: e.target.value })
                    }
                    placeholder="Marketing automation, CRM (comma-separated)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Absence of this tech suggests the problem exists
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="intentSignals">Intent Signals</Label>
                  <Input
                    id="intentSignals"
                    value={problemForm.intentSignals}
                    onChange={(e) =>
                      setProblemForm({ ...problemForm, intentSignals: e.target.value })
                    }
                    placeholder="demand generation, pipeline optimization (comma-separated)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Intent topics that indicate interest in solving this problem
                  </p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProblemDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitProblem}
              disabled={
                !problemForm.problemStatement ||
                createProblemMutation.isPending ||
                updateProblemMutation.isPending
              }
            >
              {(createProblemMutation.isPending || updateProblemMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingProblem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
