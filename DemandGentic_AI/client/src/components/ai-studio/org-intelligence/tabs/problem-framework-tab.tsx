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
  const [editingProblem, setEditingProblem] = useState(null);

  const [problemForm, setProblemForm] = useState({
    problemStatement: "",
    problemCategory: "efficiency",
    targetIndustries: "",
    requiredTech: "",
    absentTech: "",
    intentSignals: "",
  });

  const { data: problemsData, isLoading } = useQuery({
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
      
        
          
            Please select an organization to view the problem framework.
          
        
      
    );
  }

  if (isLoading) {
    return (
      
        
          
        
      
    );
  }

  const problems = problemsData?.problems || [];

  return (
    
      
        
          Problem Framework
          
            Define problems your organization helps solve and how to detect them.
          
        
         setIsProblemDialogOpen(true)}>
          
          Add Problem Definition
        
      

      {problems.length === 0 ? (
        
          
            
            No Problems Defined
            
              Create problem definitions to help the AI identify and match problems to your target
              accounts.
            
             setIsProblemDialogOpen(true)}>
              
              Define Your First Problem
            
          
        
      ) : (
        
          {problems.map((problem) => (
            
              
                
                  
                    
                      
                      {problem.problemStatement}
                    
                    
                      
                        {PROBLEM_CATEGORIES.find((c) => c.value === problem.problemCategory)?.label ||
                          problem.problemCategory}
                      
                    
                  
                  
                     handleEditProblem(problem)}>
                      
                    
                     deleteProblemMutation.mutate(problem.id)}
                    >
                      
                    
                  
                
              
              
                
                  
                    
                      
                        
                        Detection Rules
                      
                    
                    
                      
                        {problem.detectionRules?.industries?.length ? (
                          
                            
                              Target Industries:
                            
                            
                              {problem.detectionRules.industries.map((ind, i) => (
                                
                                  {ind}
                                
                              ))}
                            
                          
                        ) : null}

                        {problem.detectionRules?.techStack?.required?.length ? (
                          
                            
                              Required Tech:
                            
                            
                              {problem.detectionRules.techStack.required.map((tech, i) => (
                                
                                  {tech}
                                
                              ))}
                            
                          
                        ) : null}

                        {problem.detectionRules?.techStack?.absent?.length ? (
                          
                            
                              Missing Tech (indicator):
                            
                            
                              {problem.detectionRules.techStack.absent.map((tech, i) => (
                                
                                  {tech}
                                
                              ))}
                            
                          
                        ) : null}

                        {problem.detectionRules?.intentSignals?.length ? (
                          
                            
                              Intent Signals:
                            
                            
                              {problem.detectionRules.intentSignals.map((sig, i) => (
                                
                                  {sig}
                                
                              ))}
                            
                          
                        ) : null}

                        {!problem.detectionRules?.industries?.length &&
                          !problem.detectionRules?.techStack?.required?.length &&
                          !problem.detectionRules?.techStack?.absent?.length &&
                          !problem.detectionRules?.intentSignals?.length && (
                            
                              No detection rules configured.
                            
                          )}
                      
                    
                  

                  
                    
                      
                        
                        
                          Messaging Angles ({problem.messagingAngles.length})
                        
                      
                    
                    
                      
                        {problem.messagingAngles.length === 0 ? (
                          
                            No messaging angles configured.
                          
                        ) : (
                          problem.messagingAngles.map((angle) => (
                            
                              {angle.angle}
                              
                                "{angle.openingLine}"
                              
                              {angle.persona && (
                                
                                  {angle.persona}
                                
                              )}
                            
                          ))
                        )}
                      
                    
                  
                

                {problem.symptoms.length > 0 && (
                  
                    Symptoms:
                    
                      {problem.symptoms.map((symptom) => (
                        
                          {symptom.symptomDescription}
                        
                      ))}
                    
                  
                )}
              
            
          ))}
        
      )}

      {/* Problem Dialog */}
      
        
          
            
              {editingProblem ? "Edit Problem Definition" : "Add Problem Definition"}
            
            
              {editingProblem
                ? "Update the problem definition and detection rules."
                : "Define a new problem and how to detect it in target accounts."}
            
          
          
            
              Problem Statement *
              
                  setProblemForm({ ...problemForm, problemStatement: e.target.value })
                }
                placeholder="Describe the problem your customers typically face..."
                rows={3}
              />
            

            
              Category
              
                  setProblemForm({ ...problemForm, problemCategory: value })
                }
              >
                
                  
                
                
                  {PROBLEM_CATEGORIES.map((cat) => (
                    
                      {cat.label}
                    
                  ))}
                
              
            

            
              Detection Rules

              
                
                  Target Industries
                  
                      setProblemForm({ ...problemForm, targetIndustries: e.target.value })
                    }
                    placeholder="SaaS, Healthcare, Finance (comma-separated)"
                  />
                  
                    Industries where this problem is commonly found
                  
                

                
                  Required Tech (indicators)
                  
                      setProblemForm({ ...problemForm, requiredTech: e.target.value })
                    }
                    placeholder="Salesforce, HubSpot (comma-separated)"
                  />
                  
                    Tech stack that indicates this problem might exist
                  
                

                
                  Missing Tech (indicators)
                  
                      setProblemForm({ ...problemForm, absentTech: e.target.value })
                    }
                    placeholder="Marketing automation, CRM (comma-separated)"
                  />
                  
                    Absence of this tech suggests the problem exists
                  
                

                
                  Intent Signals
                  
                      setProblemForm({ ...problemForm, intentSignals: e.target.value })
                    }
                    placeholder="demand generation, pipeline optimization (comma-separated)"
                  />
                  
                    Intent topics that indicate interest in solving this problem
                  
                
              
            
          
          
             setIsProblemDialogOpen(false)}>
              Cancel
            
            
              {(createProblemMutation.isPending || updateProblemMutation.isPending) && (
                
              )}
              {editingProblem ? "Update" : "Create"}
            
          
        
      
    
  );
}